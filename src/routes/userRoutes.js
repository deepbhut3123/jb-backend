import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import Role from '../models/Role.js';

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
  roleProfile: user.roleProfile?._id ? { id: user.roleProfile._id, name: user.roleProfile.name } : null,
  createdAt: user.createdAt,
  roleLabel: [1, 3].includes(user.role) ? 'Admin' : 'User',
});

router.get('/', requireAuth, requirePermission('users.view'), async (request, response, next) => {
  try {
    const page = Math.max(Number.parseInt(request.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || 10, 1), 100);
    const filter = {};
    if (request.query.role === 'users') filter.role = 2;
    if (request.query.role === 'admins') filter.role = { $ne: 2 };
    if (request.query.search?.trim()) { const query = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ name: { $regex: query, $options: 'i' } }, { email: { $regex: query, $options: 'i' } }, { phone: { $regex: query, $options: 'i' } }]; }
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select('name email phone role roleProfile createdAt').populate('roleProfile', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    return response.json({ users: users.map(publicUser), pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) } });
  } catch (error) { return next(error); }
});

router.post('/', requireAuth, requirePermission('users.create'), async (request, response, next) => {
  try {
    const body = request.body || {};
    const name = String(body.name || '').trim();
    const rawEmail = body.email;
    const phone = String(body.phone || '').trim();
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    const role = body.role ?? 2;
    const roleProfile = body.roleProfile || null;
    const email = normalizeEmail(rawEmail);
    if (!name || !email.includes('@') || password.length < 8) return response.status(400).json({ message: 'Name, a valid email, and a password of at least 8 characters are required.' });
    if (![1, 2].includes(Number(role))) return response.status(400).json({ message: 'Please select a valid role.' });
    if (Number(role) === 1 && ![1, 3].includes(Number(request.user.role))) return response.status(403).json({ message: 'Only administrators can create another administrator.' });
    if (Number(role) === 2 && !roleProfile) return response.status(400).json({ message: 'Select a role created in Roles & Permissions.' });
    if (Number(role) === 2 && roleProfile && !(await Role.exists({ _id: roleProfile, isActive: true }))) return response.status(400).json({ message: 'Please select an active role.' });
    if (await User.exists({ email })) return response.status(409).json({ message: 'An account with this email already exists.' });
    const user = await User.create({ name, email, phone, passwordHash: await bcrypt.hash(password, 12), role: Number(role), roleProfile: Number(role) === 2 ? roleProfile : null, isVerified: true });
    await user.populate('roleProfile', 'name');
    return response.status(201).json({ user: publicUser(user.toObject()) });
  } catch (error) { return next(error); }
});

router.put('/:id', requireAuth, requirePermission('users.edit'), async (request, response, next) => {
  try {
    const { name, email: rawEmail, phone, password, role, roleProfile } = request.body;
    const email = normalizeEmail(rawEmail);
    const existingUser = await User.findById(request.params.id).select('role');
    if (!existingUser) return response.status(404).json({ message: 'User not found.' });
    if ([1, 3].includes(Number(existingUser.role)) && ![1, 3].includes(Number(request.user.role))) return response.status(403).json({ message: 'Only administrators can modify an administrator account.' });
    if (!name?.trim() || !email || ![1, 2].includes(Number(role))) return response.status(400).json({ message: 'Name, email, and a valid role are required.' });
    if (Number(role) === 1 && ![1, 3].includes(Number(request.user.role))) return response.status(403).json({ message: 'Only administrators can grant administrator access.' });
    if (Number(role) === 2 && !roleProfile) return response.status(400).json({ message: 'Select a role created in Roles & Permissions.' });
    if (request.user._id.toString() === request.params.id && Number(role) !== Number(request.user.role)) return response.status(400).json({ message: 'You cannot change your own account role.' });
    const duplicate = await User.findOne({ email, _id: { $ne: request.params.id } });
    if (duplicate) return response.status(409).json({ message: 'An account with this email already exists.' });
    if (Number(role) === 2 && roleProfile && !(await Role.exists({ _id: roleProfile, isActive: true }))) return response.status(400).json({ message: 'Please select an active role.' });
    const update = { name: name.trim(), email, phone: phone?.trim(), role: Number(role), roleProfile: Number(role) === 2 ? (roleProfile || null) : null };
    if (password) {
      if (password.length < 8) return response.status(400).json({ message: 'Password must be at least 8 characters.' });
      update.passwordHash = await bcrypt.hash(password, 12);
    }
    const user = await User.findByIdAndUpdate(request.params.id, update, { new: true, runValidators: true }).select('name email phone role roleProfile createdAt').populate('roleProfile', 'name').lean();
    if (!user) return response.status(404).json({ message: 'User not found.' });
    return response.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.delete('/:id', requireAuth, requirePermission('users.delete'), async (request, response, next) => {
  try {
    if (request.user._id.toString() === request.params.id) return response.status(400).json({ message: 'You cannot delete your own administrator account.' });
    const target = await User.findById(request.params.id).select('role');
    if (!target) return response.status(404).json({ message: 'User not found.' });
    if ([1, 3].includes(Number(target.role)) && ![1, 3].includes(Number(request.user.role))) return response.status(403).json({ message: 'Only administrators can delete an administrator account.' });
    const user = await User.findByIdAndDelete(request.params.id);
    return response.json({ message: 'User deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;
