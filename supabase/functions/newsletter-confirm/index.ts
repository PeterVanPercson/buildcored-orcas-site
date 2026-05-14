// Supabase Edge Function: newsletter-confirm
// Sends a confirmation email via Resend whenever a new row is inserted into
// public.newsletter_signups (triggered by a Database Webhook).
//
// Requires Supabase secrets:
//   RESEND_API_KEY    — from resend.com/api-keys
//   NEWSLETTER_FROM   — optional, defaults to 'Buildcored <team@buildcored.com>'

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS = Deno.env.get('NEWSLETTER_FROM') ?? 'Buildcored <team@buildcored.com>';

const html = (email: string) => `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 40px auto; padding: 0 24px; color: #06070a; line-height: 1.55;">
  <div style="margin-bottom: 32px;">
    <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; font-size: 36px; letter-spacing: -0.02em; margin: 0 0 4px;">You're on the list.</h1>
    <div style="font-family: ui-monospace, 'SF Mono', monospace; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #888;">Buildcored · Orcas</div>
  </div>
  <p>Thanks for signing up — we'll email <strong>${email}</strong> the moment <em>Orcas v2.0</em> opens.</p>
  <p>While you wait, the 30 projects from v1.5 are at <a href="https://buildcored.com/#projects" style="color: #06070a; border-bottom: 1px solid #ccc;">buildcored.com</a>.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">
  <p style="color: #888; font-size: 12px;">team@buildcored.com — replies hit us.</p>
</body>
</html>`;

serve(async (req) => {
  // CORS preflight for direct invocations
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
    // Database webhook payload shape: { type: 'INSERT', table, record: { ... } }
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
      subject: "You're in — Buildcored Orcas v2.0 waitlist",
      html: html(email),
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
