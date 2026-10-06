import mongoose from 'mongoose';
import { ALL_PERMISSIONS, sanitizePermissions } from '../config/permissions.js';

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60, unique: true },
  description: { type: String, trim: true, maxlength: 240, default: '' },
  permissions: [{ type: String, enum: ALL_PERMISSIONS }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

roleSchema.pre('save', function normalizePermissions() {
  this.permissions = sanitizePermissions(this.permissions);
});

export default mongoose.model('Role', roleSchema);
