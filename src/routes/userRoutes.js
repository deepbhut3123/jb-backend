import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function requireAdmin(request, response, next) {
  if (![1, 3].includes(request.user.role)) return response.status(403).json({ message: 'Only administrators can view team members.' });
  return next();
}

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || 'N/A',
  role: user.role,
  createdAt: user.createdAt,
  roleLabel: [1, 3].includes(user.role) ? 'Admin' : 'User',
});

router.get('/', requireAuth, requireAdmin, async (request, response, next) => {
  try {
    const page = Math.max(Number.parseInt(request.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 10, 1), 100);
    const filter = {};
    if (request.query.role === 'users') filter.role = 2;
    if (request.query.role === 'admins') filter.role = { $ne: 2 };
    if (request.query.search?.trim()) { const query = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ name: { $regex: query, $options: 'i' } }, { email: { $regex: query, $options: 'i' } }, { phone: { $regex: query, $options: 'i' } }]; }
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select('name email phone role createdAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return response.json({ users: users.map(publicUser), pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } });
  } catch (error) { return next(error); }
});

router.post('/', requireAuth, requireAdmin, async (request, response, next) => {
  try {
    const body = request.body || {};
    const name = String(body.name || '').trim();
    const rawEmail = body.email;
    const phone = String(body.phone || '').trim();
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    const role = body.role ?? 2;
    const email = normalizeEmail(rawEmail);
    if (!name || !email.includes('@') || password.length < 8) return response.status(400).json({ message: 'Name, a valid email, and a password of at least 8 characters are required.' });
    if (![1, 2].includes(Number(role))) return response.status(400).json({ message: 'Please select a valid role.' });
    if (await User.exists({ email })) return response.status(409).json({ message: 'An account with this email already exists.' });
    const user = await User.create({ name, email, phone, passwordHash: await bcrypt.hash(password, 12), role: Number(role), isVerified: true });
    return response.status(201).json({ user: publicUser(user.toObject()) });
  } catch (error) { return next(error); }
});

router.put('/:id', requireAuth, requireAdmin, async (request, response, next) => {
  try {
    const { name, email: rawEmail, phone, password, role } = request.body;
    const email = normalizeEmail(rawEmail);
    if (!name?.trim() || !email || ![1, 2].includes(Number(role))) return response.status(400).json({ message: 'Name, email, and a valid role are required.' });
    const duplicate = await User.findOne({ email, _id: { $ne: request.params.id } });
    if (duplicate) return response.status(409).json({ message: 'An account with this email already exists.' });
    const update = { name: name.trim(), email, phone: phone?.trim(), role: Number(role) };
    if (password) {
      if (password.length < 8) return response.status(400).json({ message: 'Password must be at least 8 characters.' });
      update.passwordHash = await bcrypt.hash(password, 12);
    }
    const user = await User.findByIdAndUpdate(request.params.id, update, { new: true, runValidators: true }).select('name email phone role createdAt').lean();
    if (!user) return response.status(404).json({ message: 'User not found.' });
    return response.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.delete('/:id', requireAuth, requireAdmin, async (request, response, next) => {
  try {
    if (request.user._id.toString() === request.params.id) return response.status(400).json({ message: 'You cannot delete your own administrator account.' });
    const user = await User.findByIdAndDelete(request.params.id);
    if (!user) return response.status(404).json({ message: 'User not found.' });
    return response.json({ message: 'User deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;
