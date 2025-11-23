import mongoose, { Document } from 'mongoose';

export interface IVerificationRequest extends Document {
  userId: mongoose.Types.ObjectId;
  barangayID?: string;
  files: string[]; // stored file paths
  /** ObjectIds of uploaded files stored in GridFS */
  gridFileIds?: mongoose.Types.ObjectId[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  reviewedAt?: Date;
  reviewerId?: mongoose.Types.ObjectId;
}

const verificationRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  barangayID: { type: String, required: false, trim: true },
  files: [{ type: String }],
  gridFileIds: [{ type: mongoose.Schema.Types.ObjectId }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
});

export const VerificationRequest = mongoose.model<IVerificationRequest>('VerificationRequest', verificationRequestSchema);
