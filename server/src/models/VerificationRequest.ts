import mongoose, { Document } from 'mongoose';

export interface IVerificationRequest extends Document {
  userId: mongoose.Types.ObjectId;
  barangayID?: string;
  files: string[]; // stored file paths (legacy)
  /** ObjectIds of uploaded files stored in GridFS */
  gridFileIds?: mongoose.Types.ObjectId[];
  /**
   * New: structured metadata for each uploaded file. Use this instead of index-based mapping.
   * Each entry includes the original filename, the GridFS id, the declared fileType (proof|govid|selfie), and optional barangayID.
   */
  filesMeta?: Array<{
    filename: string;
    gridFileId: mongoose.Types.ObjectId | string;
    fileType?: string;
    barangayID?: string;
  }>;
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
  filesMeta: [{ filename: { type: String }, gridFileId: { type: mongoose.Schema.Types.ObjectId }, fileType: { type: String }, barangayID: { type: String } }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
});

export const VerificationRequest = mongoose.model<IVerificationRequest>('VerificationRequest', verificationRequestSchema);
