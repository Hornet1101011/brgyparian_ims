import mongoose from 'mongoose';

const officialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  term: { type: String, trim: true },
  photo: { type: Buffer },
  photoContentType: { type: String },
  photoPath: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Guard against recompilation in dev
export const Official: mongoose.Model<any> = (mongoose.models && (mongoose.models as any).Official)
  ? (mongoose.models as any).Official as mongoose.Model<any>
  : mongoose.model('Official', officialSchema);

export default Official;
