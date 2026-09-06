export const statuses = ['New', 'Quotation', 'Followup', 'Performa-Invoice', 'Done', 'Lost'];
export const priorities = ['Low', 'Medium', 'High'];
export const matchModes = ['contains', 'exact', 'any', 'all'];

export function matchesMessage(body, settings) {
  const normalize = (value) => {
    const text = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    return settings.caseSensitive ? text : text.toLowerCase();
  };
  const message = normalize(body);
  const rule = normalize(settings.matchText);
  if (!message || !rule) return false;
  if (settings.matchMode === 'exact') return message === rule;
  if (settings.matchMode === 'contains') return message.includes(rule);
  const phrases = String(settings.matchText).split(/\r?\n/).map(normalize).filter(Boolean);
  if (!phrases.length) return false;
  if (settings.matchMode === 'any') return phrases.some((phrase) => message.includes(phrase));
  if (settings.matchMode === 'all') return phrases.every((phrase) => message.includes(phrase));
  return false;
}

export function isIncomingText(message) {
  // Forwarded text and some WhatsApp Web versions use a non-chat type while
  // still exposing the same body. Accept any direct, non-system text message.
  const sender = message.from || message.id?.remote || '';
  return !message.fromMe && !message.isStatus &&
    /@(c\.us|lid)$/.test(sender) && Boolean(message.body?.trim());
}

export function phoneFromId(id) {
  // A WhatsApp LID is an opaque identity, not a telephone number.
  const match = /^(\d{7,15})@c\.us$/.exec(id || '');
  return match ? match[1] : '';
}

export function leadDefaults(settings, event, whatsappIdentity) {
  return {
    name: (event.name || 'WhatsApp enquiry').slice(0, 100),
    phone: event.phone,
    whatsappIdentity,
    source: settings.source,
    leadSource: settings.source,
    status: settings.status,
    stage: settings.status,
    priority: settings.priority,
    customerType: settings.customerType,
    segment: settings.segment,
    assignedTo: settings.assignedTo,
    createdBy: settings.updatedBy,
    followUps: [],
  };
}
