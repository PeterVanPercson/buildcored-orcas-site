# Admin guide — submitting a project

The whole flow is **2 minutes per project**. No git commit, no JSON editing, no terminal. You're the admin (`team@buildcored.com`), you sign in with a magic link, you post, it goes live.

## Sign in (once per session)

1. Visit **https://buildcored.com/#admin**
2. You'll see "Sign in with your admin email to edit projects" → type `team@buildcored.com` → **Send magic link**
3. Check your inbox → click the link → you're now signed in
4. The form unlocks. The session lasts as long as your browser tab stays open (usually a day).

If you don't see the form, you're not signed in as the admin. Refresh and re-sign-in.

## Post a project (per day)

The form has **4 sections**, in order:

### ① Cover — animated GIF
- Drag a **GIF** (or animated WEBP) onto the dashed box, or click **Pick a GIF**
- Uploaded at **full quality** — no re-encode, no compression. The raw file goes straight to Supabase Storage.
- Up to ~45 MB (Storage global cap is 50 MB; raise it in Supabase → Storage → Settings if you need bigger)
- 4:3-ish aspect works best (cards crop to 4:3, animation plays inline on the card and in the modal)
- **Swapping a GIF takes effect immediately** — the URL is cache-busted on every change, so re-uploading `d03.gif` shows the new one on the next page load (no 1-hour CDN wait)
- A still image (PNG/JPG) still works if you ever need it — same flow

### ② The submission
| Field | Required? | What to put |
|---|---|---|
| Builder name | ✅ | The person who shipped it. e.g. `Sasha Lee` |
| Builder URL | optional | Their X/GitHub/site. Becomes a link under their name in the modal |
| GitHub URL | ✅ | The code repo. `https://github.com/sasha/rocklook` |
| Demo URL | optional | YouTube clip, live demo, anything that shows it running |
| Tags | optional | Stack as comma-separated: `Python, OpenCV, MediaPipe`. First 4 appear on the card, rest get a `+N` badge |

### ③ Publish
- **Shipped** — the big toggle. **Check this to make the project public.** Uncheck = draft, invisible to visitors.
- **Featured** — adds a ⭐ Featured pill on the card. Use sparingly (1–3 standout projects).
- **Day winner** — adds the 🏆 `Day X Winner` pill. One per day at most.

### ④ Override defaults (collapsed)
Click the collapsed `Override defaults` row only if you want to change the day's catalog metadata (title, description, difficulty). Otherwise the day's defaults from `projects.json` are used. **Skip this in 90% of cases.**

## What happens when you check "Shipped"

The moment any field changes (autosave), the row goes to Supabase via the authenticated REST API. The site re-reads on the next page load — your project is live. No deploy step.

## A clean submission looks like

```
Day 3 · VolumeKnuckle
[image: terminal screenshot showing volume bar + webcam hand-tracking]
Builder: Abdulboriy        Builder URL: https://github.com/abdul
GitHub: https://github.com/abdul/volume-knuckle
Demo:   https://youtu.be/abc123
Tags:   Python, OpenCV, MediaPipe, pycaw, System Control
✅ Shipped     ⭐ Featured     🏆 Day 3 Winner
```

## What if I mess up?

- **Edit anything later** — just open `#admin`, pick the day, change the field, autosave overwrites.
- **Hide a project temporarily** — uncheck Shipped. Card goes back to "Awaiting submission" grey state. Data isn't deleted.
- **Revert to defaults** — the red **Revert** button at the bottom only reverts *local* changes (fallback mode). Once you're posting to Supabase, change values directly.
- **Delete an upload** — click **Clear** in the image area. Removes from Storage + clears the image field.

## Newsletter signups

These happen automatically — visitors enter their email in the Apply section, it lands in `newsletter_signups` in Supabase, and the **`newsletter-confirm` Edge Function** sends a confirmation email from `team@buildcored.com` via Resend.

To see signups:
- https://supabase.com/dashboard/project/vktsagmwyqiiicjmhzek/editor → `newsletter_signups` table
- Or run a SQL query: `select email, created_at from newsletter_signups order by created_at desc;`

When you're ready to send the v2.0 announcement to the list, use **Resend → Broadcasts** with the list of emails (export from Supabase).

## Anything weird?

- **Signed in but form is still locked** — the email you used must exactly match `ADMIN_EMAIL` in `supabase-config.js`. Currently set to `team@buildcored.com`. Change it via edit + commit + push if you want a different admin.
- **Image won't upload** — check it's under 5MB. Bigger files get rejected by the bucket.
- **Card not updating after save** — refresh the page. The site reads on load, not real-time (yet).
- **Pre-apply / Notify-me emails not sending** — check **Resend → Logs** and **Supabase → Edge Functions → newsletter-confirm → Logs**. Most likely cause: `RESEND_API_KEY` got rotated and the Supabase secret is stale.

## Useful URLs

- Site: https://buildcored.com
- Admin: https://buildcored.com/#admin
- Supabase: https://supabase.com/dashboard/project/vktsagmwyqiiicjmhzek
- Resend: https://resend.com/emails
- GitHub repo: https://github.com/PeterVanPercson/buildcored-orcas-site
