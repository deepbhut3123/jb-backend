import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { effectivePermissions, isAdministrator } from '../config/permissions.js';

export async function requireAuth(request, response, next) {
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : null;

  if (!token) return response.status(401).json({ message: 'Authentication is required.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('-passwordHash').populate('roleProfile', 'name permissions isActive');
    if (!user) return response.status(401).json({ message: 'Your session is no longer valid.' });
    request.user = user;
    request.permissions = effectivePermissions(user);
    return next();
  } catch {
    return response.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}

export function requirePermission(permission) {
  return (request, response, next) => {
    if (request.permissions?.includes(permission)) return next();
    return response.status(403).json({ message: `You do not have permission to ${permission.replace('.', ' ')}.` });
  };
}

export function requireAnyPermission(...permissions) {
  return (request, response, next) => {
    if (permissions.some((permission) => request.permissions?.includes(permission))) return next();
    return response.status(403).json({ message: 'You do not have permission to perform this action.' });
  };
}

export function requireAdministrator(request, response, next) {
  if (isAdministrator(request.user)) return next();
  return response.status(403).json({ message: 'Only administrators can manage roles and permissions.' });
}
