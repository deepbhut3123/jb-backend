import nodemailer from 'nodemailer';

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP configuration is missing.');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendOtpEmail({ email, code, purpose }) {
  const action = purpose === 'register' ? 'verify your JB Corporation CRM account' : 'reset your CRM password';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const expiry = process.env.OTP_EXPIRY_MINUTES || '10';
  const title = purpose === 'register' ? 'Verify your email address' : 'Reset your CRM password';
  const logoUrl = process.env.EMAIL_LOGO_URL || '';
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="JB Corporation" width="180" style="display:block;max-width:180px;height:auto;border:0">`
    : '<div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:1px">JB CORPORATION</div>';

  await getTransporter().sendMail({
    from,
    to: email,
    subject: `JB Corporation CRM — ${title}`,
    text: `JB Corporation CRM\n\n${title}\n\nYour verification code is ${code}. It expires in ${expiry} minutes. If you did not request this, you can ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f0f1f7;font-family:Arial,Helvetica,sans-serif;color:#29264f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f1f7;padding:30px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(30,27,75,.1)"><tr><td style="background:#1e1b4b;padding:24px 32px;border-bottom:5px solid #d36517">${logo}<div style="color:#c9c7db;font-size:12px;letter-spacing:1px;margin-top:10px;text-transform:uppercase">Internal CRM</div></td></tr><tr><td style="padding:34px 32px 28px"><div style="color:#d36517;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">JB Corporation</div><h1 style="font-size:25px;line-height:1.25;margin:10px 0 12px;color:#1e1b4b">${title}</h1><p style="font-size:15px;line-height:1.6;margin:0;color:#68677c">Use the verification code below to ${action}.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0"><tr><td align="center" style="background:#f0f1f7;border:1px solid #e1e1eb;border-radius:12px;padding:20px"><div style="color:#68677c;font-size:11px;letter-spacing:2px;text-transform:uppercase">Verification code</div><div style="color:#392c98;font-size:34px;font-weight:800;letter-spacing:9px;margin:8px 0 0">${code}</div></td></tr></table><p style="font-size:13px;line-height:1.6;color:#68677c;margin:0"><strong style="color:#1e1b4b">This code expires in ${expiry} minutes.</strong><br>For your security, never share this code with anyone.</p></td></tr><tr><td style="border-top:1px solid #ececf2;padding:18px 32px 24px;color:#9090a2;font-size:12px;line-height:1.6">This is an automated message from the JB Corporation internal CRM.<br>If you did not request this email, you can safely ignore it.</td></tr></table></td></tr></table></body></html>`,
  });
}
