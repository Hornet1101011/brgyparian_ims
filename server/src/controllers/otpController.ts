import { Request, Response } from 'express';
import { User } from '../models/User';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { sendMail } from '../services/EmailService';
// runtime require for JS model (avoid TS module resolution errors)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SendGridConfig: any = require('../../models/SendGridConfig');
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { handleSaveError } from '../utils/handleSaveError';

// POST /api/auth/forgot-password
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email, mode } = req.body; // mode: 'link' (default) or 'otp'
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('forgotPassword: email not found, returning generic response for', email);
      return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' }); // avoid enumeration
    }

  // Support two modes: 'link' (default) or 'otp' (numeric 6-digit code)
  let token: string;
  let tokenHash: string;
  let expiresAt: Date;

  if (mode === 'otp') {
    // generate a 6-digit numeric OTP (zero-padded)
    const otpNum = crypto.randomInt(0, 1000000);
    token = String(otpNum).padStart(6, '0');
    tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes for OTP
    await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

    const html = `
      <p>Dear ${(user as any).firstName || user.email},</p>
      <p>You requested a password reset. Use the 6-digit code below to reset your password. This code expires in 10 minutes.</p>
      <h2 style="letter-spacing: 4px; font-size: 32px; margin: 20px 0; font-family: monospace;">${token}</h2>
      <p>If you didn't request this, you can safely ignore this email. Your account will remain secure.</p>
      <p>Thank you,<br>Barangay Information Management System</p>
    `;

    // Log which transport will be used (non-blocking check)
    try {
      const sgCfg = await SendGridConfig.getConfig();
      console.log('[forgotPassword] SendGrid config present:', { enabled: !!sgCfg?.enabled, fromEmail: sgCfg?.fromEmail });
    } catch (e) {
      console.warn('[forgotPassword] Unable to read SendGrid config for logging', e && e.message);
    }

    // send email in background (don't await - fire and forget)
    sendMail(user.email, 'Your Password Reset Code', html, undefined, 'otp').catch((emailErr: any) => {
      console.error('[forgotPassword] Failed to send reset OTP email:', emailErr?.message ?? emailErr);
    });
  } else {
    // default: link-token flow (existing behavior)
    token = crypto.randomBytes(32).toString('hex');
    tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

    // include the raw token in the reset link (raw token is emailed once)
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${token}`;
    const html = `
      <p>Dear ${(user as any).firstName || user.email},</p>
      <p>You requested a password reset for your Barangay Information Management System account. Click the link below to reset your password. This link expires in 15 minutes.</p>
      <p style="margin: 20px 0;">
        <a href="${resetLink}" style="background-color: #1890ff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
      </p>
      <p>Or copy this link: <a href="${resetLink}">${resetLink}</a></p>
      <p>If you didn't request this, you can safely ignore this email. Your account will remain secure.</p>
      <p>Thank you,<br>Barangay Information Management System</p>
    `;

    // Log which transport will be used (non-blocking check)
    try {
      const sgCfg = await SendGridConfig.getConfig();
      console.log('[forgotPassword] SendGrid config present:', { enabled: !!sgCfg?.enabled, fromEmail: sgCfg?.fromEmail });
    } catch (e) {
      console.warn('[forgotPassword] Unable to read SendGrid config for logging', e && e.message);
    }

    // send email in background (don't await - fire and forget)
    sendMail(user.email, 'Password Reset Request', html, undefined, 'password-reset').catch((emailErr: any) => {
      console.error('[forgotPassword] Failed to send reset email:', emailErr?.message ?? emailErr);
    });
  }

  console.log('forgotPassword: reset token created for userId=', String((user as any)._id));
    return res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('forgotPassword error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/reset-password/:token
export async function resetPassword(req: Request, res: Response) {
  try {
  // token may be in URL param (link flow) or in body (OTP or client-posted token)
  const tokenFromParams = req.params && (req.params as any).token;
  const token = tokenFromParams || req.body?.token;
  const { password } = req.body;
  if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
    // Look up token document
    // Hash incoming token and look up by tokenHash
    const incomingHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenDoc = await PasswordResetToken.findOne({ tokenHash: incomingHash });
    if (!tokenDoc) {
      console.log('resetPassword: token not found (hash)', incomingHash);
      return res.status(404).json({ message: 'Invalid or expired token' });
    }
    if (tokenDoc.expiresAt.getTime() < Date.now()) {
      console.log('resetPassword: token expired for tokenHash=', incomingHash);
      return res.status(410).json({ message: 'Token has expired' });
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      console.log('resetPassword: user not found for token=', token);
      return res.status(404).json({ message: 'User not found' });
    }

    // server-side password strength validation (require strong password)
    // at minimum: 8+ chars, upper, lower, number, special
    const strongPwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strongPwdRegex.test(password)) {
      return res.status(400).json({ message: 'Password does not meet complexity requirements' });
    }

    // hash password
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(password, salt);
    user.password = hash;
    try {
      await user.save();
    } catch (err) {
      if (handleSaveError(err, res)) return;
      console.error('Error saving user during resetPassword:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    // remove token document
    await PasswordResetToken.deleteOne({ _id: tokenDoc._id });

  console.log('resetPassword: password reset successful for userId=', String((user as any)._id));
    return res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('resetPassword error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

// POST /api/auth/verify-otp
// Accepts { token } (numeric OTP) and will, if valid, generate a new random password,
// set it on the user account (hashed), delete the token document, and email the new password
export async function verifyOtpAndEmailNewPassword(req: Request, res: Response) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Token is required' });

    // Hash incoming token and look up the token doc
    const incomingHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const tokenDoc = await PasswordResetToken.findOne({ tokenHash: incomingHash });
    if (!tokenDoc) {
      console.log('verifyOtp: token not found (hash)', incomingHash);
      return res.status(404).json({ message: 'Invalid or expired token' });
    }
    if (tokenDoc.expiresAt.getTime() < Date.now()) {
      console.log('verifyOtp: token expired for tokenHash=', incomingHash);
      return res.status(410).json({ message: 'Token has expired' });
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      console.log('verifyOtp: user not found for token=', token);
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate a secure random password that meets complexity rules
    function generatePassword(len = 12) {
      const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const lower = 'abcdefghijklmnopqrstuvwxyz';
      const digits = '0123456789';
      const symbols = '!@#$%^&*()-_=+[]{}<>?';
      const all = upper + lower + digits + symbols;

      // ensure at least one from each set
      const parts = [
        upper[crypto.randomInt(0, upper.length)],
        lower[crypto.randomInt(0, lower.length)],
        digits[crypto.randomInt(0, digits.length)],
        symbols[crypto.randomInt(0, symbols.length)],
      ];
      while (parts.join('').length < len) {
        parts.push(all[crypto.randomInt(0, all.length)]);
      }
      // shuffle
      for (let i = parts.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        const tmp = parts[i];
        parts[i] = parts[j];
        parts[j] = tmp;
      }
      return parts.join('');
    }

    const newPassword = generatePassword(12);

    // Hash new password and save
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(newPassword, salt);
    user.password = hash;
    try {
      await user.save();
    } catch (err) {
      if (handleSaveError(err, res)) return;
      console.error('Error saving user during verifyOtp:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    // delete token so it cannot be reused
    await PasswordResetToken.deleteOne({ _id: tokenDoc._id });

    // Email the new password to the user (in background - don't await)
    const html = `<p>Your password has been reset as requested. A new temporary password has been generated for your account. Please log in and change it immediately.</p>
      <p><strong>Temporary password:</strong> <code style="letter-spacing:2px">${newPassword}</code></p>
      <p>If you didn't request this, contact support immediately.</p>`;
    sendMail(user.email, 'Your new temporary password', html).catch((emailErr) => {
      console.error('Failed to send new-password email', emailErr);
    });

    console.log('verifyOtp: new password generated and emailed for userId=', String((user as any)._id));
    return res.json({ message: 'If the code was valid, a temporary password has been emailed to the account.' });
  } catch (err) {
    console.error('verifyOtp error', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
