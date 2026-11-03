import mongoose from 'mongoose';

const smtpSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'smtp' },
  host: { type: String, required: true, trim: true, maxlength: 255 },
  port: { type: Number, required: true, min: 1, max: 65535 },
  secure: { type: Boolean, default: false },
  username: { type: String, required: true, trim: true, maxlength: 255 },
  from: { type: String, required: true, trim: true, maxlength: 255 },
  encryptedPassword: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('SmtpSettings', smtpSettingsSchema);
