# Supabase setup — buildcored.com

One-time setup for the new Supabase project (`vktsagmwyqiiicjmhzek`).

## 1. Run the SQL

Open https://supabase.com/dashboard/project/vktsagmwyqiiicjmhzek/sql/new and paste all of `../supabase-schema.sql` then **Run**. This creates the tables, RLS policies, and seeds the 30 Orcas projects.

## 2. Create the storage bucket

Dashboard → **Storage** → **New bucket**:

- Name: `project-images`
- Public bucket: **ON**
- File size limit: `5 MB`

## 3. Enable email auth

Dashboard → **Authentication → Providers** → make sure **Email** is enabled. No SMTP / password setup needed — Supabase sends the magic links from `noreply@mail.app.supabase.io` by default.

## 4. Deploy the Edge Function (newsletter confirmation emails)

```sh
# install supabase CLI once
brew install supabase/tap/supabase

# from the Orcas (4) folder
supabase login                                  # browser OAuth
supabase link --project-ref vktsagmwyqiiicjmhzek
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx        # from resend.com
supabase secrets set NEWSLETTER_FROM='Buildcored <team@buildcored.com>'   # optional, defaults to this
supabase functions deploy newsletter-confirm
```

The function source is at `functions/newsletter-confirm/index.ts`.

## 5. Wire the database webhook → Edge Function

Dashboard → **Database → Webhooks → Create new webhook**:

- Name: `newsletter_signup_confirm`
- Table: `public.newsletter_signups`
- Events: ✅ **Insert** (uncheck Update/Delete)
- Type: **Supabase Edge Functions**
- Edge Function: `newsletter-confirm`
- Method: `POST`
- Timeout: `5000ms`

Save. From now on, every new row in `newsletter_signups` triggers a confirmation email from `team@buildcored.com` via Resend.

## 6. Verify Resend domain

In your Resend dashboard (https://resend.com/domains), make sure `buildcored.com` is verified. The DKIM TXT record already exists in your Namecheap DNS (`resend._domain...`), so this is usually a one-click verification.

## 7. Test end-to-end

```sh
# from the deployed site, sign up with a real address you can read
# then watch in Supabase → Logs → Edge Functions for the 200 response
# then check the inbox of the address you used
```

---

## Troubleshooting

- **Function returns `RESEND_API_KEY not configured`** → run `supabase secrets list` and re-set the key.
- **Resend returns `domain not verified`** → go to https://resend.com/domains and complete the buildcored.com verification.
- **Webhook fires but no email** → check `Database → Webhooks → Recent` for the response body, or `Edge Functions → Logs`.
- **Want to send the actual newsletter (not just confirmation)** → use Resend's broadcast API by selecting all `newsletter_signups.email` values. Out of scope here.
