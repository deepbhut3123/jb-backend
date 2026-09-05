import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: Number, default: 2, enum: [1, 2, 3] },
    isVerified: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('User', userSchema);
