// Supabase Edge Function: announce-decision-date
// One-shot broadcast: tells every Orcas v2.0 applicant that decisions go
// out by July 10. Reads recipients from public.applications itself — no
// payload needed.
//
// Idempotency: each row is claimed by atomically setting
// `decision_notice_sent_at` from NULL → now() before sending. Re-invoking
// the function sends nothing unless new NULL rows exist (e.g. a reopened
// application window), in which case only those get the notice.
// If a Resend call fails, the claim is rolled back so a retry can pick
// the row up again.
//
// Test rows (example.invalid + the founder's own test) are excluded in SQL.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FROM_ADDRESS     = Deno.env.get('NEWSLETTER_FROM') ?? 'Buildcored <team@buildcored.com>';

const SUBJECT = 'Your Orcas v2.0 application — decisions by July 10';

const HTML = `<!doctype html>
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
        <p style="margin:0 0 18px;">Hi,</p>
        <p style="margin:0 0 18px;">Thanks for applying to Orcas v2.0 &mdash; we&rsquo;re reading through every application right now.</p>
        <p style="margin:0 0 18px;">You&rsquo;ll hear back from us <strong>by July&nbsp;10</strong> with a decision. If you&rsquo;re in, that email will have your next steps: the dates, the kit, and how the ten days in Tashkent will run.</p>
        <p style="margin:0 0 26px;">Thanks for your patience, and for the time you put into applying.</p>
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

const TEXT = `Hi,

Thanks for applying to Orcas v2.0 — we're reading through every application right now.

You'll hear back from us by July 10 with a decision. If you're in, that email will have your next steps: the dates, the kit, and how the ten days in Tashkent will run.

Thanks for your patience, and for the time you put into applying.

— Husan
Buildcored Orcas

Buildcored × NazarX Robotics · Tashkent
https://buildcored.com · https://buildcored.com/projects/`;

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

// Atomically claim one row; true only if THIS call flipped NULL → now().
async function claim(id: string): Promise<boolean> {
  const res = await rest(
    `applications?id=eq.${id}&decision_notice_sent_at=is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ decision_notice_sent_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function unclaim(id: string): Promise<void> {
  await rest(`applications?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ decision_notice_sent_at: null }),
  });
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response('Missing secrets', { status: 500 });
  }

  const list = await rest(
    'applications?select=id,email' +
    '&decision_notice_sent_at=is.null' +
    '&email=not.like.*%40example.invalid' +
    '&email=neq.husanmavlonov79%40gmail.com' +
    '&order=created_at.asc',
  );
  if (!list.ok) return new Response('List failed: ' + await list.text(), { status: 500 });
  const rows: { id: string; email: string }[] = await list.json();

  let sent = 0, skipped = 0;
  const failed: { email: string; error: string }[] = [];

  for (const row of rows) {
    if (!(await claim(row.id))) { skipped++; continue; }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [row.email],
          subject: SUBJECT,
          html: HTML,
          text: TEXT,
          reply_to: 'team@buildcored.com',
        }),
      });
      if (!res.ok) {
        failed.push({ email: row.email, error: `${res.status} ${await res.text()}` });
        await unclaim(row.id);
      } else {
        sent++;
      }
    } catch (e) {
      failed.push({ email: row.email, error: String(e) });
      await unclaim(row.id);
    }
    // Resend allows ~2 req/s; stay well under it.
    await new Promise((r) => setTimeout(r, 600));
  }

  return new Response(
    JSON.stringify({ ok: true, candidates: rows.length, sent, skipped, failed }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
