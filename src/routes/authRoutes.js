import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import Otp from '../models/Otp.js';
import User from '../models/User.js';
import { sendOtpEmail } from '../utils/mailer.js';

const router = Router();
const otpMinutes = () => Number(process.env.OTP_EXPIRY_MINUTES || 10);
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const hashOtp = (code) => crypto.createHash('sha256').update(code).digest('hex');
const newOtp = () => String(crypto.randomInt(100000, 1000000));
const issueToken = (user) => jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

async function createAndSendOtp({ email, purpose, payload }) {
  const code = newOtp();
  await Otp.findOneAndUpdate(
    { email, purpose },
    { email, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + otpMinutes() * 60_000), attempts: 0, payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await sendOtpEmail({ email, code, purpose });
}

router.post('/register/request', async (request, response, next) => {
  try {
    const { name, email: rawEmail, phone, password } = request.body;
    const email = normalizeEmail(rawEmail);
    if (!name?.trim() || !email || !validatePassword(password)) return response.status(400).json({ message: 'Name, a valid email, and a password of at least 8 characters are required.' });
    if (await User.exists({ email })) return response.status(409).json({ message: 'An account with this email already exists.' });
    await createAndSendOtp({ email, purpose: 'register', payload: { name: name.trim(), phone: phone?.trim(), passwordHash: await bcrypt.hash(password, 12) } });
    return response.json({ message: 'A verification code has been sent to your email.' });
  } catch (error) { return next(error); }
});

router.post('/register/verify', async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body.email);
    const otp = String(request.body.otp || '').trim();
    const record = await Otp.findOne({ email, purpose: 'register' });
    if (!record || record.expiresAt < new Date() || record.codeHash !== hashOtp(otp)) return response.status(400).json({ message: 'The verification code is invalid or expired.' });
    const payload = record.payload?.toObject ? record.payload.toObject() : record.payload;
    const user = await User.create({ ...payload, email, role: 2, isVerified: true });
    await Otp.deleteOne({ _id: record._id });
    return response.status(201).json({ message: 'Account created successfully. You can now log in.', user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) { return next(error); }
});

router.post('/login', async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body.email);
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(request.body.password || '', user.passwordHash))) return response.status(401).json({ message: 'Email or password is incorrect.' });
    return response.json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { return next(error); }
});

router.post('/forgot-password/request', async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body.email);
    const user = await User.exists({ email });
    if (user) await createAndSendOtp({ email, purpose: 'reset-password' });
    return response.json({ message: 'If an account exists for this email, a verification code has been sent.' });
  } catch (error) { return next(error); }
});

router.post('/forgot-password/verify-otp', async (request, response, next) => {
  try {
    const email = normalizeEmail(request.body.email);
    const otp = String(request.body.otp || '').trim();
    const record = await Otp.findOne({ email, purpose: 'reset-password' });
    if (!record || record.expiresAt < new Date() || record.codeHash !== hashOtp(otp)) return response.status(400).json({ message: 'The verification code is invalid or expired.' });
    const resetToken = jwt.sign({ email, purpose: 'reset-password' }, process.env.JWT_SECRET, { expiresIn: `${otpMinutes()}m` });
    return response.json({ message: 'OTP verified. Create your new password.', resetToken });
  } catch (error) { return next(error); }
});

router.post('/forgot-password/reset', async (request, response, next) => {
  try {
    const { resetToken } = request.body;
    const { password } = request.body;
    if (!validatePassword(password)) return response.status(400).json({ message: 'Password must be at least 8 characters.' });
    let tokenPayload;
    try { tokenPayload = jwt.verify(resetToken, process.env.JWT_SECRET); } catch { return response.status(400).json({ message: 'Your OTP verification has expired. Please request a new code.' }); }
    if (tokenPayload.purpose !== 'reset-password') return response.status(400).json({ message: 'Invalid password reset request.' });
    const email = normalizeEmail(tokenPayload.email);
    const record = await Otp.findOne({ email, purpose: 'reset-password' });
    if (!record || record.expiresAt < new Date()) return response.status(400).json({ message: 'Your OTP verification has expired. Please request a new code.' });
    await User.updateOne({ email }, { $set: { passwordHash: await bcrypt.hash(password, 12) } });
    await Otp.deleteOne({ _id: record._id });
    return response.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) { return next(error); }
});

export default router;
