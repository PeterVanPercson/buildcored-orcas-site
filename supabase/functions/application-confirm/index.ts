// Supabase Edge Function: application-confirm
// Sends a confirmation email via Resend when a new row is inserted into
// public.applications (triggered by a Database Webhook).
//
// Idempotency: claims the row by atomically setting `confirm_sent_at` from
// NULL → now() before sending. If another retry of the same webhook
// already won that race, this invocation returns 200 with a noop result so
// the webhook stops retrying.
//
// Auth: deployed with default verify_jwt=true. The DB webhook trigger passes
// a service-role JWT in the Authorization header → Supabase accepts it →
// this function runs. Anonymous POSTs to the function URL get 401 from
// the Supabase function gateway before this code is reached.
//
// Required secrets (already present in this project):
//   RESEND_API_KEY
//   SUPABASE_URL              (auto-injected by Supabase runtime)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected by Supabase runtime)
//   NEWSLETTER_FROM           (optional)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FROM_ADDRESS        = Deno.env.get('NEWSLETTER_FROM') ?? 'Buildcored <team@buildcored.com>';

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
  <p style="margin: 0 0 18px;">The cohort runs <strong>August 15–25</strong> at Turin Polytechnic Lyceum, Tashkent.</p>
  <p style="margin: 0 0 18px;">Past projects: <a href="https://buildcored.com/#projects" style="color: #06070a; border-bottom: 1px solid #ccc; text-decoration: none;">buildcored.com</a>.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 36px 0 20px;">
  <p style="color: #898f97; font-size: 12px; margin: 0;">Questions? <a href="mailto:team@buildcored.com" style="color: #898f97; text-decoration: underline;">team@buildcored.com</a>. Replies reach us.</p>
</body>
</html>`;

const text = (email: string) => `Your application is in.
Buildcored · Orcas v2.0

Thanks for applying. ${email} on record.

Decision in two weeks after June 20.

The cohort runs August 15–25 at Turin Polytechnic Lyceum, Tashkent.

Past projects: https://buildcored.com/#projects

Questions? team@buildcored.com. Replies reach us.`;

// Claim the row idempotently. Returns true if THIS invocation should send;
// false if another retry already won the race (or the row vanished).
async function claimRow(rowId: string | number): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return true; // best-effort fallback
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/applications?id=eq.${rowId}&confirm_sent_at=is.null`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ confirm_sent_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) return false;
  const updated = await res.json();
  // PATCH with the `confirm_sent_at=is.null` filter returns [] if the row
  // was already claimed → noop. Returns the row if THIS call claimed it.
  return Array.isArray(updated) && updated.length > 0;
}

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
  let rowId: string | number | undefined;
  try {
    const payload = await req.json();
    // Database webhook payload: { type: 'INSERT', table, record: {...} }
    email = payload?.record?.email ?? payload?.email;
    rowId = payload?.record?.id ?? payload?.id;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response('Missing or invalid email', { status: 400 });
  }

  // Idempotency: only send if we won the row claim. If the claim fails (or
  // we couldn't reach the DB), fall through and send — better one extra
  // email than a silent miss. The 200 on noop tells the webhook to stop
  // retrying.
  if (rowId !== undefined) {
    const claimed = await claimRow(rowId);
    if (!claimed) {
      return new Response(JSON.stringify({ ok: true, noop: 'already_sent' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
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
