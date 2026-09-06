import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WhatsAppSettings from '../models/WhatsAppSettings.js';
import WhatsAppEvent from '../models/WhatsAppEvent.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import { isIncomingText, matchesMessage, phoneFromId, leadDefaults } from './whatsappRules.js';

const backendDirectory = fileURLToPath(new URL('../../', import.meta.url));
let client = null;
let transition = false;
let initialization = null;
let queue = Promise.resolve();
let retryTimer;
let qrRevision = 0;
let state = { status: 'disconnected', qr: null, qrExpiresAt: null, account: '', error: '' };

export function getWhatsAppState() {
  if (state.qrExpiresAt && Date.now() > state.qrExpiresAt) return { ...state, qr: null };
  return { ...state };
}

export async function sendWhatsAppMessage(recipient, body) {
  if (!client || state.status !== 'connected') throw new Error('WhatsApp is not connected. Reconnect before sending a message.');
  const text = String(body || '').trim();
  if (!text) throw new Error('Follow-up message cannot be empty.');
  // Leads created by older builds used `account:phone`; WhatsApp Web expects
  // a serialized chat ID (`phone@c.us`) or an existing LID.
  const rawRecipient = String(recipient || '').trim();
  const phoneRecipient = rawRecipient.includes(':') ? rawRecipient.split(':').pop() : rawRecipient;
  const normalizedRecipient = /@(c\.us|lid)$/.test(phoneRecipient)
    ? phoneRecipient
    : `${phoneRecipient.replace(/\D/g, '')}@c.us`;
  if (!/^\d{7,15}@(c\.us|lid)$/.test(normalizedRecipient)) throw new Error('This lead does not have a valid WhatsApp recipient.');
  const message = await client.sendMessage(normalizedRecipient, text);
  return { id: message?.id?._serialized || message?.id?.id || null };
}

function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch((error) => {
    console.error('WhatsApp processing failed:', error.message);
    state = { ...state, error: 'A message could not be processed. Check recent activity or retry after reconnecting.' };
  });
  return result;
}

export async function processWhatsAppEvent(event) {
  if (['created', 'existing'].includes(event.outcome)) return;
  const settings = await WhatsAppSettings.findById('company').lean();
  if (!settings?.enabled) return;
  try {
    event.attempts += 1;
    if (!await User.exists({ _id: settings.assignedTo })) throw new Error('Select an existing default assignee in WhatsApp settings.');
    if (!await User.exists({ _id: settings.updatedBy })) throw new Error('An administrator must save the WhatsApp settings again.');
    if (!event.phone && client && state.status === 'connected') {
      const identities = await client.getContactLidAndPhone([event.sender]);
      event.phone = phoneFromId(identities[0]?.pn);
    }
    if (!event.phone) throw new Error('The sender phone number is unavailable. Reconnect and retry once WhatsApp exposes it.');
    const identity = /@(c\.us|lid)$/.test(event.sender)
      ? event.sender
      : `${event.phone}@c.us`;
    const phonePattern = `^\\+?${event.phone.split('').join('[\\s().-]*')}$`;
    let lead = await Lead.findOne({ $or: [{ whatsappIdentity: identity }, { phone: { $regex: phonePattern } }] });
    if (lead) {
      event.outcome = 'existing';
    } else {
      lead = await Lead.findOneAndUpdate({ whatsappIdentity: identity }, {
        $setOnInsert: leadDefaults(settings, event, identity),
      }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
      event.outcome = 'created';
    }
    event.lead = lead._id;
    event.error = '';
  } catch (error) {
    event.outcome = 'failed';
    event.error = error.message.slice(0, 500);
  }
  await event.save();
}

async function receiveMessage(message, sourceClient, account) {
  if (!isIncomingText(message)) return;
  const settings = await WhatsAppSettings.findById('company').lean();
  if (!settings?.enabled || !matchesMessage(message.body, settings)) return;
  const receivedAt = new Date(message.timestamp * 1000);
  // WhatsApp Web may replay a message's original timestamp when a linked
  // device reconnects. Do not reject a matching message merely because it
  // belongs to an already-open conversation; messageKey deduplicates repeats.
  if (!Number.isFinite(receivedAt.getTime())) return;
  const messageId = message.id?._serialized || message.id?.id || `${sender}:${message.timestamp}:${message.body}`;
  if (!messageId || !account) return;
  const contact = await message.getContact().catch(() => null);
  const sender = message.from || message.id?.remote || '';
  const messageKey = `${account}:${messageId}`;
  // Upsert first, then process: duplicate deliveries and restarts reuse this event.
  const event = await WhatsAppEvent.findOneAndUpdate({ messageKey }, { $setOnInsert: {
    account, sender, phone: phoneFromId(sender) || phoneFromId(contact?.id?._serialized),
    name: (contact?.pushname || contact?.name || '').slice(0, 100),
    body: message.body.slice(0, 10000), receivedAt,
  } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  if (sourceClient === client) await processWhatsAppEvent(event);
}

export function retryWhatsAppEvent(id) {
  return enqueue(async () => {
    const event = await WhatsAppEvent.findById(id);
    if (event) await processWhatsAppEvent(event);
  });
}

export async function connectWhatsApp() {
  if (transition || ['starting', 'qr', 'authenticating', 'connected'].includes(state.status)) return getWhatsAppState();
  transition = true;
  state = { status: 'starting', qr: null, qrExpiresAt: null, account: '', error: '' };
  try {
    if (client) {
      const previous = client;
      client = null;
      await previous.destroy();
    }
    await WhatsAppSettings.findByIdAndUpdate('company', { $set: { connectionDesired: true } }, { upsert: true });
    const [{ default: whatsapp }, { default: QRCode }] = await Promise.all([import('whatsapp-web.js'), import('qrcode')]);
    const instance = new whatsapp.Client({
      authStrategy: new whatsapp.LocalAuth({ clientId: 'company', dataPath: process.env.WHATSAPP_AUTH_PATH || path.join(backendDirectory, '.wwebjs_auth') }),
      webVersionCache: { type: 'local', path: path.join(backendDirectory, '.wwebjs_cache') },
      puppeteer: { headless: true, ...(process.env.WHATSAPP_CHROME_PATH ? { executablePath: process.env.WHATSAPP_CHROME_PATH } : {}) },
      authTimeoutMs: 120000,
      qrMaxRetries: 5,
    });
    client = instance;
    instance.on('qr', (qr) => {
      const revision = ++qrRevision;
      state = { ...state, status: 'qr', qr: null, qrExpiresAt: Date.now() + 20000 };
      QRCode.toDataURL(qr, { width: 280, margin: 2 }).then((image) => {
        if (client === instance && revision === qrRevision && state.status === 'qr') state = { ...state, qr: image };
      }).catch(() => { if (client === instance) state = { ...state, error: 'Unable to display the QR code. Reconnect to try again.' }; });
    });
    instance.on('authenticated', () => {
      if (client === instance) state = { ...state, status: 'authenticating', qr: null, qrExpiresAt: null };
    });
    instance.on('ready', () => {
      if (client === instance) state = { status: 'connected', qr: null, qrExpiresAt: null, account: instance.info?.wid?._serialized || '', error: '' };
    });
    instance.on('auth_failure', () => {
      if (client === instance) state = { ...state, status: 'error', qr: null, qrExpiresAt: null, error: 'WhatsApp authentication failed. Log out and scan a new QR code.' };
    });
    instance.on('disconnected', () => {
      if (client === instance) state = { ...state, status: 'disconnected', qr: null, qrExpiresAt: null, error: 'WhatsApp disconnected. Reconnect to resume receiving messages.' };
    });
    const handleMessage = (message) => {
      // The ready state can briefly transition while WhatsApp Web syncs an
      // existing chat. The client identity is the authoritative guard here;
      // rejecting on a transient state would drop valid continued-chat text.
      if (client !== instance) return;
      const account = state.account || instance.info?.wid?._serialized || 'company';
      void enqueue(() => receiveMessage(message, instance, account)).catch(() => {});
    };
    instance.on('message', handleMessage);
    // `message_create` covers incoming messages on clients where `message` is
    // not emitted for forwarded or multi-device text messages. Duplicate
    // events are safe because messageKey is unique and processing is queued.
    instance.on('message_create', handleMessage);
    initialization = instance.initialize().catch((error) => {
      console.error('WhatsApp initialization failed:', error.message);
      if (client === instance) state = { ...state, status: 'error', qr: null, qrExpiresAt: null, error: 'Could not start WhatsApp. Check that Chrome is installed and session storage is writable, then reconnect.' };
    });
    return getWhatsAppState();
  } catch (error) {
    console.error('WhatsApp connection failed:', error.message);
    state = { ...state, status: 'error', error: 'Could not start WhatsApp. Check the server configuration and reconnect.' };
    throw error;
  } finally { transition = false; }
}

export async function disconnectWhatsApp() {
  if (transition) throw new Error('WhatsApp is changing connection state. Try again shortly.');
  transition = true;
  try {
    await WhatsAppSettings.findByIdAndUpdate('company', { $set: { connectionDesired: false } }, { upsert: true });
    const previous = client;
    client = null;
    ++qrRevision;
    state = { status: 'disconnected', qr: null, qrExpiresAt: null, account: '', error: '' };
    if (previous) {
      // Wait for browser startup before disposing it; UI disables logout during startup.
      await initialization;
      try { await previous.logout(); } finally { await previous.destroy().catch(() => {}); }
    }
    return getWhatsAppState();
  } finally { transition = false; }
}

export async function startWhatsAppService() {
  await Promise.all([WhatsAppSettings.init(), WhatsAppEvent.init(), Lead.init()]);
  const settings = await WhatsAppSettings.findById('company').lean();
  if (settings?.connectionDesired) await connectWhatsApp();
  retryTimer = setInterval(() => {
    void enqueue(async () => {
      const events = await WhatsAppEvent.find({ outcome: 'pending' }).sort({ createdAt: 1 }).limit(20);
      for (const event of events) await processWhatsAppEvent(event);
    }).catch(() => {});
  }, 30000);
  retryTimer.unref();
}

export async function stopWhatsAppService() {
  clearInterval(retryTimer);
  const previous = client;
  client = null;
  await initialization;
  if (previous) await previous.destroy();
  await queue;
}
