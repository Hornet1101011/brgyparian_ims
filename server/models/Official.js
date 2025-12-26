const mongoose = require('mongoose');

const officialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  title: { type: String, trim: true },
  term: { type: String, trim: true },
  // GridFS file ID for photo stored in barangayOfficials bucket
  photoFileId: { type: mongoose.Schema.Types.ObjectId },
  photoContentType: { type: String },
  // legacy/supporting field: url or disk path when applicable
  photoPath: { type: String },
  // legacy embedded photo field (for backwards compatibility with existing docs)
  photo: { type: Buffer },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Guard model creation to avoid OverwriteModelError during hot-reloads
module.exports = mongoose.models && mongoose.models.Official
  ? mongoose.model('Official')
  : mongoose.model('Official', officialSchema);
