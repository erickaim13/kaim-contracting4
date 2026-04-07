import nodemailer from 'nodemailer';

const FROM = 'Kaim Contracting <info@kaimcontracting.com>';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: 'info@kaimcontracting.com', pass: process.env.GMAIL_APP_PASSWORD }
});

function brandedHtml(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
<tr><td style="background:#1a1a1a;padding:28px 32px;text-align:center">
<img src="https://kaim-crm.vercel.app/kaim-contracting-logo-gold.png" alt="Kaim Contracting" width="180" style="display:block;margin:0 auto">
</td></tr>
<tr><td style="padding:32px 32px 28px">${body}</td></tr>
<tr><td style="padding:0 32px 28px;border-top:1px solid #eee;padding-top:20px;text-align:center">
<p style="margin:0;font-size:12px;color:#999;line-height:1.6">Kaim Contracting LLC<br>info@kaimcontracting.com · (978) 351-2195<br>kaimcontracting.com</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, service } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const firstName = (name || '').split(' ')[0] || 'there';

  const html = brandedHtml(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">Thanks for Reaching Out!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#555;line-height:1.6">Hi ${firstName},</p>
    <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.6">We received your quote request${service ? ' for <strong>' + service + '</strong>' : ''} and we're on it. One of our team members will reach out shortly to go over the details.</p>
    <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6">In the meantime, feel free to give us a call or reply to this email with any questions.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="background:#f8f8f8;border-radius:8px;padding:20px 24px;text-align:center">
      <div style="font-size:13px;color:#999;margin-bottom:6px">Call or text us anytime</div>
      <div style="font-size:20px;font-weight:700;color:#1a1a1a">(978) 351-2195</div>
    </td></tr></table>
    <p style="margin:0;font-size:13px;color:#999;line-height:1.5">We look forward to working with you!</p>
  `);

  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: 'We Got Your Quote Request!',
      html,
      replyTo: 'info@kaimcontracting.com'
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-email] Error:', e);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
