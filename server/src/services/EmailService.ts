import sgMail, { MailDataRequired } from '@sendgrid/mail';

// Initialize SendGrid with API key
function initializeSendGrid() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[EmailService] SENDGRID_API_KEY not set in environment');
    return null;
  }
  sgMail.setApiKey(apiKey);
  return sgMail;
}

function getFromAddress(): string {
  return process.env.SMTP_FROM || 'brgystaff0001@gmail.com';
}

export async function sendDocumentNotification(
  to: string,
  status: 'approved' | 'rejected',
  documentType: string,
  notes?: string
) {
  const sg = initializeSendGrid();
  if (!sg) {
    console.error('[EmailService] SendGrid not initialized; cannot send document notification');
    throw new Error('SendGrid API key not configured');
  }

  const subject = `Your document request has been ${status}`;
  const body = `
    <p>Dear user,</p>
    <p>Your request for <strong>${documentType}</strong> has been <strong>${status}</strong>.</p>
    ${notes ? `<p>Notes: ${notes}</p>` : ''}
    <p>If you have questions, please contact support.</p>
    <p>Thank you.</p>
  `;

  try {
    console.log('[EmailService] Sending document notification to:', to);
    const msg: MailDataRequired = {
      to,
      from: getFromAddress(),
      subject,
      html: body,
    };
    const result = await sgMail.send(msg);
    console.log('[EmailService] Document notification sent successfully:', result[0].statusCode);
  } catch (err) {
    console.error('[EmailService] Failed to send document notification:', err);
    throw err;
  }
}

export async function sendMail(to: string, subject: string, html: string, retries: number = 3): Promise<any> {
  const sg = initializeSendGrid();
  if (!sg) {
    console.error('[EmailService] SendGrid not initialized; cannot send email to:', to);
    throw new Error('SendGrid API key not configured');
  }

  let lastError: any;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[EmailService] Attempt ${attempt}/${retries} - Sending email to:`, to, 'Subject:', subject);

      const msg: MailDataRequired = {
        to,
        from: getFromAddress(),
        subject,
        html,
      };

      const result = await sgMail.send(msg);
      console.log('[EmailService] Email sent successfully. Status code:', result[0].statusCode);
      return result;
    } catch (err: any) {
      lastError = err;
      const errorMsg = err.message || JSON.stringify(err);
      console.error(`[EmailService] Attempt ${attempt}/${retries} failed:`, errorMsg);

      // Don't retry on auth errors
      if (errorMsg.includes('Invalid') || errorMsg.includes('Authentication') || errorMsg.includes('401') || errorMsg.includes('403')) {
        console.error('[EmailService] Authentication error - will not retry');
        throw err;
      }

      // Wait before retrying
      if (attempt < retries) {
        const delay = Math.min(1000 * attempt, 5000); // 1s, 2s, 3s, 4s, 5s
        console.log(`[EmailService] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error('[EmailService] Failed to send email after', retries, 'attempts');
  throw lastError || new Error('Failed to send email');
}

export async function testSmtpConnection(): Promise<{ success: boolean; message: string; config?: any; error?: string }> {
  console.log('[EmailService] Testing SendGrid connection...');
  
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromAddress = getFromAddress();

  if (!apiKey) {
    return {
      success: false,
      message: 'SendGrid API key not configured',
      error: 'SENDGRID_API_KEY environment variable is missing',
    };
  }

  try {
    const sg = initializeSendGrid();
    if (!sg) {
      return {
        success: false,
        message: 'Failed to initialize SendGrid',
        error: 'SendGrid initialization failed',
      };
    }

    console.log('[EmailService] Verifying SendGrid API configuration...');
    console.log('[EmailService] Using SendGrid API key: configured');
    console.log('[EmailService] From address:', fromAddress);

    return {
      success: true,
      message: 'SendGrid API is configured and ready',
      config: {
        method: 'SendGrid API (HTTP)',
        apiKeySet: !!apiKey,
        fromAddress: fromAddress,
      },
    };
  } catch (err: any) {
    console.error('[EmailService] SendGrid test failed:', err.message);
    return {
      success: false,
      message: 'SendGrid API test failed',
      error: err.message || 'Unknown error',
    };
  }
}
