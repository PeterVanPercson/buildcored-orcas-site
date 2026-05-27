// Supabase Edge Function: application-confirm
// Sends a confirmation email via Resend whenever a new row is inserted into
// public.applications (triggered by a Database Webhook on the applications
// table — mirrors the existing newsletter-confirm setup).
//
// Requires Supabase secrets (already set for newsletter-confirm — shared):
//   RESEND_API_KEY    — from resend.com/api-keys
//   NEWSLETTER_FROM   — optional, defaults to 'Buildcored <team@buildcored.com>'

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS   = Deno.env.get('NEWSLETTER_FROM') ?? 'Buildcored <team@buildcored.com>';

const html = (email: string) => `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 40px auto; padding: 0 28px; color: #06070a; line-height: 1.55;">
  <div style="margin-bottom: 28px;">
    <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 36px; letter-spacing: -0.02em; line-height: 1.05; margin: 0 0 6px;">Your application is in.</h1>
    <div style="font-family: ui-monospace, 'SF Mono', monospace; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #898f97;">Buildcored · Orcas v2.0</div>
  </div>
  <p style="margin: 0 0 18px;">Thanks for applying. <strong>${email}</strong> on record.</p>
  <p style="margin: 0 0 18px;">Decision in two weeks after <strong>June 20</strong>.</p>
  <p style="margin: 0 0 18px;">The 10 days run sometime in summer 2026 — exact dates announced once we lock the room.</p>
  <p style="margin: 0 0 18px;">Past projects: <a href="https://buildcored.com/#projects" style="color: #06070a; border-bottom: 1px solid #ccc; text-decoration: none;">buildcored.com</a>.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 36px 0 20px;">
  <p style="color: #898f97; font-size: 12px; margin: 0;">Questions? <a href="mailto:team@buildcored.com" style="color: #898f97; text-decoration: underline;">team@buildcored.com</a> — replies hit us.</p>
</body>
</html>`;

const text = (email: string) => `Your application is in.
Buildcored · Orcas v2.0

Thanks for applying. ${email} on record.

Decision in two weeks after June 20.

The 10 days run sometime in summer 2026 — exact dates announced once we lock the room.

Past projects: https://buildcored.com/#projects

—
Questions? team@buildcored.com — replies hit us.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response('RESEND_API_KEY not configured', { status: 500 });
  }

  let email: string | undefined;
  try {
    const payload = await req.json();
    // Database webhook payload: { type: 'INSERT', table, record: {...} }
    email = payload?.record?.email ?? payload?.email;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response('Missing or invalid email', { status: 400 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [email],
      subject: "Your Orcas v2.0 application is in.",
      html: html(email),
      text: text(email),
      reply_to: 'team@buildcored.com',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend failed:', res.status, err);
    return new Response('Send failed: ' + err, {
      status: res.status,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const body = await res.json();
  return new Response(JSON.stringify({ ok: true, id: body.id }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
