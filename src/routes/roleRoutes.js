import { Router } from 'express';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { ALL_PERMISSIONS, PERMISSION_MODULES, sanitizePermissions, withLegacyMenuPermissions } from '../config/permissions.js';
import { requireAdministrator, requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/options', async (request, response, next) => {
  try {
    if (!request.permissions?.includes('users.create') && !request.permissions?.includes('users.edit')) return response.status(403).json({ message: 'You do not have permission to assign roles.' });
    const roles = await Role.find({ isActive: true }).select('name').sort({ name: 1 }).lean();
    const administratorOption = [1, 3].includes(Number(request.user.role))
      ? [{ _id: 'system-administrator', name: 'Administrator', isSystem: true }]
      : [];
    return response.json({ roles: [...administratorOption, ...roles.map((role) => ({ ...role, isSystem: false }))] });
  } catch (error) { return next(error); }
});

router.use(requireAdministrator);

const clean = (value) => String(value || '').trim();
const normalizePermissions = sanitizePermissions;

router.get('/', async (_request, response, next) => {
  try {
    const [roles, assignments, administratorCount] = await Promise.all([
      Role.find().sort({ name: 1 }).lean(),
      User.aggregate([{ $match: { roleProfile: { $ne: null } } }, { $group: { _id: '$roleProfile', count: { $sum: 1 } } }]),
      User.countDocuments({ role: { $in: [1, 3] } }),
    ]);
    const counts = new Map(assignments.map((item) => [String(item._id), item.count]));
    return response.json({
      roles: [
        {
          _id: 'system-administrator',
          name: 'Administrator',
          description: 'Built-in system role with unrestricted access to every menu and action.',
          permissions: ALL_PERMISSIONS,
          isActive: true,
          isSystem: true,
          userCount: administratorCount,
        },
        ...roles.map((role) => ({ ...role, permissions: withLegacyMenuPermissions(role.permissions), isSystem: false, userCount: counts.get(String(role._id)) || 0 })),
      ],
      modules: PERMISSION_MODULES,
    });
  } catch (error) { return next(error); }
});

router.post('/', async (request, response, next) => {
  try {
    const name = clean(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Role name is required.' });
    const duplicate = await Role.exists({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (duplicate) return response.status(409).json({ message: 'A role with this name already exists.' });
    const role = await Role.create({ name, description: clean(request.body.description), permissions: normalizePermissions(request.body.permissions), isActive: request.body.isActive !== false });
    return response.status(201).json({ role: { ...role.toObject(), userCount: 0 } });
  } catch (error) { return next(error); }
});

router.put('/:id', async (request, response, next) => {
  try {
    const name = clean(request.body?.name);
    if (!name) return response.status(400).json({ message: 'Role name is required.' });
    const duplicate = await Role.exists({ _id: { $ne: request.params.id }, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (duplicate) return response.status(409).json({ message: 'A role with this name already exists.' });
    const role = await Role.findByIdAndUpdate(request.params.id, {
      name,
      description: clean(request.body.description),
      permissions: normalizePermissions(request.body.permissions),
      isActive: request.body.isActive !== false,
    }, { new: true, runValidators: true }).lean();
    if (!role) return response.status(404).json({ message: 'Role not found.' });
    const userCount = await User.countDocuments({ roleProfile: role._id });
    return response.json({ role: { ...role, userCount } });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request, response, next) => {
  try {
    const userCount = await User.countDocuments({ roleProfile: request.params.id });
    if (userCount) return response.status(409).json({ message: `This role is assigned to ${userCount} user${userCount === 1 ? '' : 's'}. Reassign them before deleting it.` });
    const role = await Role.findByIdAndDelete(request.params.id);
    if (!role) return response.status(404).json({ message: 'Role not found.' });
    return response.json({ message: 'Role deleted successfully.' });
  } catch (error) { return next(error); }
});

export default router;
