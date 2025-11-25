import mongoose from 'mongoose';

const passwordResetTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // store a SHA-256 hash of the token for safety in case DB is leaked
  // unique: true will create the index; avoid duplicate `index: true` flag
  tokenHash: { type: String, required: true, unique: true },
  // TTL index is created below via schema.index(); avoid per-field index: true to prevent duplicate index warnings
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// Create TTL index so MongoDB automatically deletes expired tokens
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Guard against recompilation in dev
export const PasswordResetToken: mongoose.Model<any> = (mongoose.models && (mongoose.models as any).PasswordResetToken)
  ? (mongoose.models as any).PasswordResetToken as mongoose.Model<any>
  : mongoose.model('PasswordResetToken', passwordResetTokenSchema);
