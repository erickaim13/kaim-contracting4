import nodemailer from 'nodemailer';

// Debug endpoint: hits Gmail SMTP synchronously and returns the actual error.
// Removed once email is confirmed working.

export default async function handler(req, res) {
  const debugKey = req.query.key || (req.body || {}).key;
  // Lightweight gate so the endpoint isn't fully public
  if (debugKey !== 'kc-diag-2026') {
    return res.status(401).json({ error: 'Missing or invalid debug key' });
  }

  const passLen = (process.env.GMAIL_APP_PASSWORD || '').length;
  const passSample = (process.env.GMAIL_APP_PASSWORD || '').slice(0, 2) + '...' +
                     (process.env.GMAIL_APP_PASSWORD || '').slice(-2);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'info@kaimcontracting.com',
      pass: (process.env.GMAIL_APP_PASSWORD || '').trim()
    }
  });

  try {
    // First verify the SMTP connection (cheaper than sending)
    await transporter.verify();
  } catch (e) {
    return res.status(500).json({
      stage: 'verify',
      error: e?.message || String(e),
      code: e?.code,
      command: e?.command,
      response: e?.response,
      env: { has_password: !!process.env.GMAIL_APP_PASSWORD, password_length: passLen, password_sample: passSample }
    });
  }

  try {
    const info = await transporter.sendMail({
      from: 'Kaim Contracting <info@kaimcontracting.com>',
      to: 'erickaim13@gmail.com',
      subject: 'Kaim CRM diagnostic — email delivery test',
      text: 'If you got this, SMTP is working. Sent ' + new Date().toISOString()
    });
    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      env: { has_password: true, password_length: passLen, password_sample: passSample }
    });
  } catch (e) {
    return res.status(500).json({
      stage: 'sendMail',
      error: e?.message || String(e),
      code: e?.code,
      command: e?.command,
      response: e?.response,
      env: { has_password: !!process.env.GMAIL_APP_PASSWORD, password_length: passLen, password_sample: passSample }
    });
  }
}
