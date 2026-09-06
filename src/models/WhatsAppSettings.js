import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, default: 'company' },
  enabled: { type: Boolean, default: false },
  enabledAt: Date,
  connectionDesired: { type: Boolean, default: false },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['New', 'Quotation', 'Followup', 'Performa-Invoice', 'Done', 'Lost'], default: 'New' },
  source: { type: String, trim: true, maxlength: 50, default: 'WhatsApp' },
  customerType: { type: String, trim: true, maxlength: 60, default: '' },
  segment: { type: String, trim: true, maxlength: 60, default: '' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  matchMode: { type: String, enum: ['contains', 'exact', 'any', 'all'], default: 'contains' },
  matchText: { type: String, maxlength: 2000, default: '' },
  caseSensitive: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('WhatsAppSettings', schema);
