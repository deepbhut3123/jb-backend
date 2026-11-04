import { Router } from 'express';
import nodemailer from 'nodemailer';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  clearStoredSmtpSettings,
  getEffectiveSmtpSettings,
  getSmtpSettingsForClient,
  saveSmtpSettings,
} from '../services/smtpSettings.js';

const router = Router();

function normalizeSettings(body = {}) {
  return {
    host: String(body.host || '').trim(),
    port: Number(body.port),
    secure: body.secure === true || body.secure === 'true',
    username: String(body.username || '').trim(),
    from: String(body.from || '').trim(),
    password: String(body.password || ''),
  };
}

function validateSettings(settings) {
  if (!settings.host || settings.host.length > 255) return 'Enter a valid SMTP host.';
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) return 'SMTP port must be between 1 and 65535.';
  if (!settings.username || settings.username.length > 255) return 'Enter a valid SMTP username.';
  if (!settings.from || settings.from.length > 255 || !/^(?:[^<>]*\s*)?<[^<>\s]+@[^<>\s]+\.[^<>\s]+>|^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(settings.from)) return 'Enter a valid sender email address.';
  if (settings.password.length > 1024) return 'SMTP password is too long.';
  return null;
}

router.use(requireAuth);

router.get('/', requirePermission('settings.view'), async (_request, response, next) => {
  try { return response.json(await getSmtpSettingsForClient()); }
  catch (error) { return next(error); }
});

router.put('/', requirePermission('settings.edit'), async (request, response, next) => {
  try {
    const settings = normalizeSettings(request.body);
    const validationError = validateSettings(settings);
    if (validationError) return response.status(400).json({ message: validationError });
    await saveSmtpSettings(settings, request.user._id);
    return response.json({ ...(await getSmtpSettingsForClient()), message: 'SMTP settings saved.' });
  } catch (error) {
    if (error.message.startsWith('Enter an SMTP password')) return response.status(400).json({ message: error.message });
    return next(error);
  }
});

router.delete('/', requirePermission('settings.edit'), async (_request, response, next) => {
  try {
    await clearStoredSmtpSettings();
    return response.json({ ...(await getSmtpSettingsForClient()), message: 'SMTP settings cleared. Environment settings are now active.' });
  } catch (error) { return next(error); }
});

router.post('/test', requirePermission('settings.edit'), async (request, response) => {
  const to = String(request.body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return response.status(400).json({ message: 'Enter a valid recipient email address.' });
  try {
    const settings = await getEffectiveSmtpSettings();
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.username, pass: settings.password },
    });
    await transporter.sendMail({
      from: settings.from,
      to,
      subject: 'JB Corporation CRM SMTP test',
      text: 'This is a test email from the JB Corporation CRM SMTP settings.',
    });
    return response.json({ message: `Test email sent to ${to}.` });
  } catch (error) {
    return response.status(400).json({ message: error.message === 'SMTP configuration is missing.' ? 'SMTP is not configured. Save settings or configure the SMTP environment variables.' : `Could not send test email: ${error.message}` });
  }
});

export default router;
