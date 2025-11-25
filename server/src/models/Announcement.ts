import mongoose from 'mongoose';

const AnnouncementSchema = new mongoose.Schema({
  text: { type: String, required: true },
  imagePath: { type: String },
  // store a copy of the image binary inside the document
  imageData: { type: Buffer },
  imageContentType: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Guard against recompilation in dev
export const Announcement: mongoose.Model<any> = (mongoose.models && (mongoose.models as any).Announcement)
  ? (mongoose.models as any).Announcement as mongoose.Model<any>
  : mongoose.model('Announcement', AnnouncementSchema);
