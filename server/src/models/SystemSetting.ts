import mongoose, { Document, Schema } from 'mongoose';

export interface ISmtp {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  encryptedPassword?: string;
  fromName?: string;
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
  createdAt?: Date;
  updatedAt?: Date;
}

const smtpSchema = new Schema<ISmtp>({
  host: { type: String },
  port: { type: Number },
  secure: { type: Boolean },
  user: { type: String },
  encryptedPassword: { type: String },
  fromName: { type: String },
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
}, { timestamps: true });

const modelName = 'SystemSetting';
export const SystemSetting = (mongoose.models && (mongoose.models as any)[modelName])
  ? (mongoose.models as any)[modelName] as mongoose.Model<ISystemSetting>
  : mongoose.model<ISystemSetting>(modelName, systemSettingSchema);

export default SystemSetting;
