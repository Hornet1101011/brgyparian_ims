const mongoose = require('mongoose');

const publicViewSchema = new mongoose.Schema({
  // Public barangay information - cached from SystemSetting
  siteName: { type: String, default: '' },
  barangayName: { type: String, default: '' },
  barangayAddress: { type: String, default: '' },
  
  // Public contact information - cached from SystemSetting
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  
  // System notice - cached from SystemSetting
  systemNotice: { type: String, default: '' },
  
  // Last sync timestamp - when this was last updated from SystemSetting
  lastSyncedAt: { type: Date, default: Date.now },
  
  // Track if this is the active version
  isActive: { type: Boolean, default: true },
  
}, { timestamps: true });

// Ensure only one document with isActive: true
publicViewSchema.index({ isActive: 1 });

// Prevent OverwriteModelError when this file is required multiple times
module.exports = mongoose.models && mongoose.models.PublicView
  ? mongoose.model('PublicView')
  : mongoose.model('PublicView', publicViewSchema);
