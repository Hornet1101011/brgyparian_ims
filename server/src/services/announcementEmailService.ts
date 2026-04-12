import { User, UserRole, UserStatus } from '../models/User';
import { sendMail } from './EmailService';
import { EmailLog } from '../models/EmailLog';

/**
 * Announcement Email Service
 * Handles sending announcement emails to all active residents
 */

/**
 * Fetch all active resident email addresses
 * @returns {Promise<string[]>} Array of email addresses
 */
export async function getActiveResidentEmails(): Promise<string[]> {
  try {
    const residents = await User.find({
      role: UserRole.RESIDENT,
      status: UserStatus.ACTIVE,
      isActive: true,
      email: { $exists: true, $ne: null },
      deletedAt: null, // Not soft-deleted
      // suspendedUntil may be missing, null, or a date in the past when suspension expired.
      // Use a top-level $or to combine these conditions correctly for MongoDB.
      $or: [
        { suspendedUntil: { $exists: false } },
        { suspendedUntil: null },
        { suspendedUntil: { $lt: new Date() } }
      ]
    })
    .select('email fullName')
    .lean();

    const emails = residents
      .map(resident => resident.email)
      .filter(email => email && typeof email === 'string' && email.includes('@'));

    console.log(`[AnnouncementEmailService] Found ${emails.length} active resident emails`);
    return emails;
  } catch (err) {
    console.error('[AnnouncementEmailService] Failed to fetch resident emails:', err);
    throw err;
  }
}

/**
 * Send announcement email to all active residents using BCC
 * @param {string} subject - Email subject
 * @param {string} announcementText - Announcement content
 * @param {string} [imageUrl] - Optional image URL for the announcement
 * @returns {Promise<{success: boolean, recipientsCount: number, error?: string}>}
 */
export async function sendAnnouncementEmail(
  subject: string,
  announcementText: string,
  imageUrl?: string
): Promise<{ success: boolean; recipientsCount: number; error?: string }> {
  try {
    // Get all active resident emails
    const recipientEmails = await getActiveResidentEmails();

    if (recipientEmails.length === 0) {
      console.warn('[AnnouncementEmailService] No active resident emails found');
      return {
        success: false,
        recipientsCount: 0,
        error: 'No active resident emails found'
      };
    }

    // Create HTML email content
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #1890ff; margin: 0 0 10px 0;">📢 New Announcement</h2>
          <p style="color: #666; margin: 0;">From Barangay Information Management System</p>
        </div>

        <div style="background-color: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
          <div style="margin-bottom: 20px;">
            ${announcementText.replace(/\n/g, '<br>')}
          </div>
    `;

    // Add image if provided
    if (imageUrl) {
      htmlContent += `
          <div style="text-align: center; margin: 20px 0;">
            <img src="${imageUrl}" alt="Announcement Image" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
          </div>
      `;
    }

    htmlContent += `
        </div>

        <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
          <p style="color: #666; margin: 0; font-size: 14px;">
            This is an automated message from your Barangay Information Management System.<br>
            Please do not reply to this email.
          </p>
        </div>
      </div>
    `;

    // Send email using BCC to protect privacy
    // We'll send to a dummy "to" address and put all recipients in BCC
    const dummyRecipient = process.env.BIMS_EMAIL || 'noreply@barangay.local'; // Use our own email as dummy recipient
    const bccRecipients = recipientEmails;

    console.log(`[AnnouncementEmailService] Sending announcement email to ${bccRecipients.length} residents`);

    await sendMail(dummyRecipient, subject, htmlContent, bccRecipients, 'announcement');

    console.log(`[AnnouncementEmailService] Announcement email sent successfully to ${bccRecipients.length} residents`);

    // Log each BCC recipient individually for detailed tracking
    try {
      await EmailLog.insertMany(
        bccRecipients.map((email: string) => ({
          recipient: email,
          subject,
          status: 'sent',
          errorMessage: null,
          emailType: 'announcement',
          dateSent: new Date(),
        }))
      );
      console.log(`[AnnouncementEmailService] Logged ${bccRecipients.length} email recipients to EmailLog`);
    } catch (logErr) {
      console.error('[AnnouncementEmailService] Failed to log announcement emails:', logErr);
      // Don't fail if logging fails
    }

    return {
      success: true,
      recipientsCount: bccRecipients.length
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[AnnouncementEmailService] Failed to send announcement email:', err);

    return {
      success: false,
      recipientsCount: 0,
      error: errorMessage
    };
  }
}