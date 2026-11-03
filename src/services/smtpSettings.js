import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import SmtpSettings from '../models/SmtpSettings.js';

function encryptionKey() {
  const secret = process.env.SMTP_SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('SMTP settings encryption is not configured. Set SMTP_SETTINGS_ENCRYPTION_KEY or JWT_SECRET.');
  return createHash('sha256').update(secret).digest();
}

export function encryptSmtpPassword(password) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}

function decryptSmtpPassword(value) {
  if (!value) return '';
  const [ivText, tagText, dataText] = value.split('.');
  if (!ivText || !tagText || !dataText) throw new Error('Saved SMTP password cannot be decrypted. Re-enter the SMTP password.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Saved SMTP password cannot be decrypted. Re-enter the SMTP password.');
  }
}

export async function getStoredSmtpSettings() {
  return SmtpSettings.findOne({ key: 'smtp' }).lean();
}

export function getEnvironmentSmtpSettings() {
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    username: process.env.SMTP_USER || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  };
}

export async function getSmtpSettingsForClient() {
  const stored = await getStoredSmtpSettings();
  const environment = getEnvironmentSmtpSettings();
  return {
    settings: {
      host: stored?.host || environment.host,
      port: stored?.port || environment.port,
      secure: stored ? stored.secure : environment.secure,
      username: stored?.username || environment.username,
      from: stored?.from || environment.from,
      passwordConfigured: Boolean(stored?.encryptedPassword || process.env.SMTP_PASS),
    },
    source: stored ? 'settings' : 'environment',
  };
}

export async function getEffectiveSmtpSettings() {
  const stored = await getStoredSmtpSettings();
  const environment = getEnvironmentSmtpSettings();
  const config = {
    host: stored?.host || environment.host,
    port: stored?.port || environment.port,
    secure: stored ? stored.secure : environment.secure,
    username: stored?.username || environment.username,
    password: (stored?.encryptedPassword && decryptSmtpPassword(stored.encryptedPassword)) || process.env.SMTP_PASS || '',
    from: stored?.from || environment.from,
  };
  if (!config.host || !config.port || !config.username || !config.password) throw new Error('SMTP configuration is missing.');
  return config;
}

export async function saveSmtpSettings(values, updatedBy) {
  const existing = await getStoredSmtpSettings();
  const encryptedPassword = values.password
    ? encryptSmtpPassword(values.password)
    : existing?.encryptedPassword || '';
  if (!encryptedPassword && !process.env.SMTP_PASS) throw new Error('Enter an SMTP password or configure SMTP_PASS in the environment.');
  return SmtpSettings.findOneAndUpdate({ key: 'smtp' }, {
    ...values,
    encryptedPassword,
    updatedBy,
  }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
}

export async function clearStoredSmtpSettings() {
  await SmtpSettings.deleteOne({ key: 'smtp' });
}
