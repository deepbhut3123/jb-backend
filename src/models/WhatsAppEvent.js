import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  messageKey: { type: String, required: true, unique: true },
  account: { type: String, required: true },
  sender: { type: String, required: true },
  phone: { type: String, default: '' },
  name: { type: String, default: '' },
  body: { type: String, maxlength: 10000 },
  receivedAt: Date,
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  outcome: { type: String, enum: ['pending', 'created', 'existing', 'failed'], default: 'pending' },
  error: { type: String, default: '' },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('WhatsAppEvent', schema);
