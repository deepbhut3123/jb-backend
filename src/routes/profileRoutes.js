import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function profileUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
  };
}

router.get('/', requireAuth, (request, response) => {
  return response.json({ user: profileUser(request.user) });
});

router.put('/', requireAuth, async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim();
    const phone = String(request.body?.phone || '').trim();
    if (!name) return response.status(400).json({ message: 'Full name is required.' });

    const user = await User.findByIdAndUpdate(
      request.user._id,
      { name, phone },
      { new: true, runValidators: true },
    ).select('name email phone role');
    if (!user) return response.status(404).json({ message: 'User not found.' });
    return response.json({ message: 'Profile updated successfully.', user: profileUser(user) });
  } catch (error) { return next(error); }
});

router.put('/password', requireAuth, async (request, response, next) => {
  try {
    const currentPassword = String(request.body?.currentPassword || '');
    const newPassword = String(request.body?.newPassword || '');
    const confirmPassword = String(request.body?.confirmPassword || '');
    if (!currentPassword || newPassword.length < 8) return response.status(400).json({ message: 'Enter your current password and a new password of at least 8 characters.' });
    if (newPassword !== confirmPassword) return response.status(400).json({ message: 'New password and retype password must match.' });

    const user = await User.findById(request.user._id).select('+passwordHash');
    if (!user) return response.status(404).json({ message: 'User not found.' });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return response.status(400).json({ message: 'Current password is incorrect.' });

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    return response.json({ message: 'Password changed successfully.' });
  } catch (error) { return next(error); }
});

export default router;
