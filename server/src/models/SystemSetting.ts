import mongoose, { Document, Schema } from 'mongoose';

export interface ISmtp {
  host?: string;
  port?: number;
  secure?: boolean;
  securityType?: string; // 'ssl' (port 465), 'tls' (port 587), 'none' (port 25)
  user?: string;
  encryptedPassword?: string;
  appPassword?: string; // App-specific password for Gmail with 2FA
  fromName?: string;
}

export interface IEmailSettings {
  enabled?: boolean;
  enablePasswordResetEmails?: boolean;
  enableOtpEmails?: boolean;
  enableDocumentNotificationEmails?: boolean;
  enableAnnouncementEmails?: boolean;
  enableAnnouncementBcc?: boolean;
  recipientEmailsPerBatch?: number;
  retryFailedEmails?: boolean;
  retryAttempts?: number;
  retryDelayMinutes?: number;
}

export interface ISystemSetting extends Document {
  siteName?: string;
  barangayName?: string;
  barangayAddress?: string;
  contactEmail?: string;
  contactPhone?: string;
  maintenanceMode?: boolean;
  allowRegistrations?: boolean;
  requireEmailVerification?: boolean;
  // Toggle to enable/disable resident verification workflow (uploads/admin review)
  enableVerifications?: boolean;
  maxDocumentRequestsPerUser?: number;
  documentProcessingDays?: number;
  systemNotice?: string;
  smtp?: ISmtp;
  emailSettings?: IEmailSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

const smtpSchema = new Schema<ISmtp>({
  host: { type: String },
  port: { type: Number },
  secure: { type: Boolean },
  securityType: { type: String, enum: ['ssl', 'tls', 'none'], default: 'tls' },
  user: { type: String },
  encryptedPassword: { type: String },
  appPassword: { type: String }, // Encrypted app password for Gmail
  fromName: { type: String },
});

const emailSettingsSchema = new Schema<IEmailSettings>({
  enabled: { type: Boolean, default: true },
  enablePasswordResetEmails: { type: Boolean, default: true },
  enableOtpEmails: { type: Boolean, default: true },
  enableDocumentNotificationEmails: { type: Boolean, default: true },
  enableAnnouncementEmails: { type: Boolean, default: true },
  enableAnnouncementBcc: { type: Boolean, default: true },
  recipientEmailsPerBatch: { type: Number, default: 100 },
  retryFailedEmails: { type: Boolean, default: true },
  retryAttempts: { type: Number, default: 3 },
  retryDelayMinutes: { type: Number, default: 5 },
});

const systemSettingSchema = new Schema<ISystemSetting>({
  siteName: { type: String },
  barangayName: { type: String },
  barangayAddress: { type: String },
  contactEmail: { type: String },
  contactPhone: { type: String },
  maintenanceMode: { type: Boolean, default: false },
  allowRegistrations: { type: Boolean, default: true },
  requireEmailVerification: { type: Boolean, default: true },
  // Toggle to enable/disable resident verification workflow (uploads, admin review, popups)
  // Default set to false to keep verifications disabled unless explicitly enabled by admin.
  enableVerifications: { type: Boolean, default: false },
  maxDocumentRequestsPerUser: { type: Number, default: 5 },
  documentProcessingDays: { type: Number, default: 3 },
  systemNotice: { type: String },
  smtp: { type: smtpSchema, default: {} },
  emailSettings: { type: emailSettingsSchema, default: {} },
}, { timestamps: true });

const modelName = 'SystemSetting';
export const SystemSetting = (mongoose.models && (mongoose.models as any)[modelName])
  ? (mongoose.models as any)[modelName] as mongoose.Model<ISystemSetting>
  : mongoose.model<ISystemSetting>(modelName, systemSettingSchema);

export default SystemSetting;
