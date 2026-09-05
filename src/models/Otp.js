import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: ['register', 'reset-password'] },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, default: 0 },
    payload: {
      name: String,
      phone: String,
      passwordHash: String,
    },
  },
  { timestamps: true },
);

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });

export default mongoose.model('Otp', otpSchema);
