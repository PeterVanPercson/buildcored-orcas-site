// Supabase Edge Function: send-decision
// Sends an Orcas v2.0 waitlist or decline email (no attachment).
// Payload: { email, given, kind: 'waitlist' | 'decline', sample?: boolean }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS = Deno.env.get('NEWSLETTER_FROM') ?? 'Buildcored <team@buildcored.com>';

const wrap = (inner: string) => `<!doctype html>
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
        ${inner}
        <p style="margin:0;">&mdash; Husan<br><span style="color:#5c656a;">Buildcored Orcas</span></p>
      </td></tr>
      <tr><td style="padding:30px 46px 36px;">
        <div style="height:1px;background:rgba(0,0,0,.12);line-height:1px;font-size:0;margin-bottom:18px;">&nbsp;</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7378;">
          Buildcored &times; NazarX Robotics &middot; Tashkent<br>
          <a href="https://buildcored.com" style="color:#3D4E63;text-decoration:none;">buildcored.com</a> &nbsp;&middot;&nbsp; <a href="https://buildcored.com/projects/" style="color:#3D4E63;text-decoration:none;">see the v1.5 projects</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

const COPY = {
  waitlist: {
    subject: 'Orcas v2.0: you are on the waitlist',
    html: (g: string) => wrap(`
        <p style="margin:0 0 18px;">Hi ${g},</p>
        <p style="margin:0 0 18px;">Thank you for applying to Orcas v2.0. Your application was strong. The cohort is capped at twenty seats, and we couldn&rsquo;t fit everyone we wanted to take.</p>
        <p style="margin:0 0 18px;"><strong>You&rsquo;re on the waitlist.</strong> Admitted builders have until July 14 to confirm their seats. If a seat opens, we go down the list in order, and you&rsquo;ll hear from us by July 16 either way.</p>
        <p style="margin:0 0 26px;">If it doesn&rsquo;t work out this time, v2.0 won&rsquo;t be the last cohort. We&rsquo;d like to see you in the next one.</p>`),
    text: (g: string) => `Hi ${g},

Thank you for applying to Orcas v2.0. Your application was strong. The cohort is capped at twenty seats, and we couldn't fit everyone we wanted to take.

You're on the waitlist. Admitted builders have until July 14 to confirm their seats. If a seat opens, we go down the list in order, and you'll hear from us by July 16 either way.

If it doesn't work out this time, v2.0 won't be the last cohort. We'd like to see you in the next one.

— Husan
Buildcored Orcas`,
  },
  decline: {
    subject: 'Your Orcas v2.0 decision',
    html: (g: string) => wrap(`
        <p style="margin:0 0 18px;">Hi ${g},</p>
        <p style="margin:0 0 18px;">Thank you for applying to Orcas v2.0. This time we couldn&rsquo;t offer you a seat. We had considerably more applications than seats.</p>
        <p style="margin:0 0 18px;">The full curriculum and all thirty v1.5 projects are public at <a href="https://buildcored.com" style="color:#3D4E63;">buildcored.com</a>, and the community on Telegram is open to everyone. Building in the open is the strongest application for the next cohort, and there will be a next cohort.</p>
        <p style="margin:0 0 26px;">Thanks for the time you put in.</p>`),
    text: (g: string) => `Hi ${g},

Thank you for applying to Orcas v2.0. This time we couldn't offer you a seat. We had considerably more applications than seats.

The full curriculum and all thirty v1.5 projects are public at buildcored.com, and the community on Telegram is open to everyone. Building in the open is the strongest application for the next cohort, and there will be a next cohort.

Thanks for the time you put in.

— Husan
Buildcored Orcas`,
  },
};

serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  if (!RESEND_API_KEY) return new Response('Missing RESEND_API_KEY', { status: 500 });
  const { email, given, kind, sample } = await req.json().catch(() => ({}));
  const copy = COPY[kind as keyof typeof COPY];
  if (!email || !given || !copy) return new Response('email, given, kind required', { status: 400 });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [email],
      subject: (sample ? '[SAMPLE] ' : '') + copy.subject,
      html: copy.html(given),
      text: copy.text(given),
      reply_to: 'team@buildcored.com',
    }),
  });
  return new Response(await res.text(), { status: res.status });
});
