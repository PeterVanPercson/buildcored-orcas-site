// Supabase Edge Function: send-acceptance
// Sends one Orcas v2.0 acceptance email with the letter PDF attached.
// Payload: { email, given, pdf_base64, filename, sample?: boolean }
// `sample: true` prefixes the subject with [SAMPLE].
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS = Deno.env.get('NEWSLETTER_FROM') ?? 'Buildcored <team@buildcored.com>';

const html = (given: string) => `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#c4ccd0;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#c4ccd0;">
  <tr><td align="center" style="padding:44px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#e7ecee;border:1px solid #b4bec2;border-radius:16px;">
      <tr><td style="padding:38px 46px 0;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;letter-spacing:.2em;color:#0b0d10;font-weight:700;">BUILDCORED</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.24em;color:#5c656a;text-transform:uppercase;margin-top:8px;">Orcas v2.0 &middot; Hardware</div>
      </td></tr>
      <tr><td style="padding:26px 46px 0;"><div style="height:1px;background:rgba(0,0,0,.12);line-height:1px;font-size:0;">&nbsp;</div></td></tr>
      <tr><td style="padding:30px 46px 6px;font-family:Georgia,'Times New Roman',serif;font-size:16.5px;line-height:1.62;color:#14181b;">
        <p style="margin:0 0 18px;font-size:24px;font-style:italic;">You&rsquo;re in.</p>
        <p style="margin:0 0 18px;">Hi ${given},</p>
        <p style="margin:0 0 18px;">You have a seat in Orcas v2.0. Your acceptance letter is attached.</p>
        <p style="margin:0 0 18px;">The cohort runs <strong>August 15 to 24</strong> at Turin Polytechnic Lyceum in Tashkent. In person, free, hardware kits provided by NazarX Robotics.</p>
        <p style="margin:0 0 26px;"><strong>Reply to this email by July 14 to confirm your seat.</strong> If we don&rsquo;t hear from you by then, the seat passes to the waitlist.</p>
        <p style="margin:0;">&mdash; Husan<br><span style="color:#5c656a;">Buildcored Orcas</span></p>
      </td></tr>
      <tr><td style="padding:30px 46px 36px;">
        <div style="height:1px;background:rgba(0,0,0,.12);line-height:1px;font-size:0;margin-bottom:18px;">&nbsp;</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7378;">
          Buildcored &times; NazarX Robotics &middot; Tashkent<br>
          <a href="https://buildcored.com" style="color:#3D4E63;text-decoration:none;">buildcored.com</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

const text = (given: string) => `You're in.

Hi ${given},

You have a seat in Orcas v2.0. Your acceptance letter is attached.

The cohort runs August 15 to 24 at Turin Polytechnic Lyceum in Tashkent. In person, free, hardware kits provided by NazarX Robotics.

Reply to this email by July 14 to confirm your seat. If we don't hear from you by then, the seat passes to the waitlist.

— Husan
Buildcored Orcas`;

serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  if (!RESEND_API_KEY) return new Response('Missing RESEND_API_KEY', { status: 500 });
  const { email, given, pdf_base64, filename, sample } = await req.json().catch(() => ({}));
  if (!email || !given || !pdf_base64 || !filename) {
    return new Response('email, given, pdf_base64, filename required', { status: 400 });
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [email],
      subject: (sample ? '[SAMPLE] ' : '') + "You're in · Orcas v2.0",
      html: html(given),
      text: text(given),
      reply_to: 'team@buildcored.com',
      attachments: [{ filename, content: pdf_base64 }],
    }),
  });
  return new Response(await res.text(), { status: res.status });
});
