import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(request, response, next) {
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : null;

  if (!token) return response.status(401).json({ message: 'Authentication is required.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) return response.status(401).json({ message: 'Your session is no longer valid.' });
    request.user = user;
    return next();
  } catch {
    return response.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}
