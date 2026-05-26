-- ═══════════════════════════════════════════════════════════════════════════
-- Buildcored Orcas v1.5 — site schema + seed
-- Run ONCE in: https://supabase.com/dashboard/project/vktsagmwyqiiicjmhzek/sql/new
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── projects: the 30 Orcas projects + admin submission data ───────────────
create table if not exists public.projects (
  id            text primary key,
  day           int  not null check (day between 1 and 30),
  week          int  not null check (week between 1 and 4),
  category      text not null,
  title         text not null,
  description   text not null,
  difficulty    text not null check (difficulty in ('easy','moderate','advanced','expert')),
  builder       text default '',
  builder_url   text default '',
  image         text default '',
  github_url    text default '',
  demo_url      text default '',
  shipped       boolean default false,
  featured      boolean default false,
  winner        boolean default false,
  tags          text[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists projects_day_idx     on public.projects(day);
create index if not exists projects_shipped_idx on public.projects(shipped);

-- ── newsletter_signups: emails for next-cohort announcements ───────────────
create table if not exists public.newsletter_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  source      text default 'site',
  created_at  timestamptz default now(),
  constraint  newsletter_email_unique unique (email)
);
create index if not exists newsletter_email_idx on public.newsletter_signups(email);

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.projects           enable row level security;
alter table public.newsletter_signups enable row level security;

drop policy if exists "projects_public_read"        on public.projects;
drop policy if exists "projects_admin_write"        on public.projects;
drop policy if exists "newsletter_public_insert"    on public.newsletter_signups;
drop policy if exists "newsletter_admin_read"       on public.newsletter_signups;

-- projects: anyone can read, only signed-in users (admin) can write
create policy "projects_public_read" on public.projects
  for select using (true);
create policy "projects_admin_write" on public.projects
  for all to authenticated using (true) with check (true);

-- newsletter_signups: anyone can sign up (insert), only signed-in admin can read
create policy "newsletter_public_insert" on public.newsletter_signups
  for insert with check (true);
create policy "newsletter_admin_read" on public.newsletter_signups
  for select to authenticated using (true);

-- ── v2.0 waitlist: builder idea + a public, privacy-safe live count ───────
-- "what would you build with real boards?" — optional free text
alter table public.newsletter_signups
  add column if not exists note text;

-- SECURITY DEFINER so anonymous visitors can read the COUNT only — the
-- table's RLS still hides every email/row from the public.
create or replace function public.waitlist_count()
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from public.newsletter_signups $$;

revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon, authenticated;

-- ── Certificates: public verification by code (buildcored.com/verify/<code>)
-- Codes are PUBLIC by design — anyone with a code can verify a certificate.
-- No write policy: only the dashboard / service role can issue new ones.
create table if not exists public.certificates (
  code          text primary key,                       -- store lowercase, e.g. 'bco-26-0142'
  recipient     text not null,                           -- 'Sharipov Komil'
  program       text not null default 'ORCAS · V1.5',
  invitation    text default 'received a special invitation to Orcas v2.0 — a Nazarx Robotics × Buildcored Orcas program.',
  place_term    text default 'TASHKENT · SUMMER 2026',
  signer        text default 'Husan Mavlonov',
  signer_title  text default 'FOUNDER, BUILDCORED',
  issued_on     date not null default current_date,
  created_at    timestamptz default now()
);
alter table public.certificates enable row level security;
drop policy if exists "certificates_public_read" on public.certificates;
create policy "certificates_public_read" on public.certificates
  for select using (true);

insert into public.certificates (code, recipient, program, issued_on) values
  ('bco-26-0142', 'Botirsherov Abdulatif',     'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0143', 'Bositkhonov Abduboriykhon', 'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0144', 'Adhamjon Ollanazarov',      'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0145', 'Madina Muhammadova',        'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0146', 'Javohir Rahmatullaev',      'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0147', 'Sharipov Komil',            'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0148', 'Hakimjanova Mehribon',      'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0149', 'Raximov Rahim',             'ORCAS · V1.5', '2026-05-16'),
  ('bco-26-0150', 'Komiljon Solijonov',        'ORCAS · V1.5', '2026-05-16')
on conflict (code) do update
  set recipient = excluded.recipient,
      program   = excluded.program,
      issued_on = excluded.issued_on;

-- ── updated_at auto-touch ─────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ── Seed the 30-project catalog (idempotent via ON CONFLICT DO NOTHING) ────
insert into public.projects
  (id, day, week, category, title, description, difficulty, shipped, featured, winner, tags)
values
  ('d01', 1, 1, 'Body as Input', 'RockLook', 'Look down and rock music starts playing. Look up and it pauses.', 'easy', false, false, false, '{}'::text[]),
  ('d02', 2, 1, 'Body as Input', 'AirCanvas', 'Pinch your fingers to draw on your screen. Like a magic pen.', 'easy', false, false, false, '{}'::text[]),
  ('d03', 3, 1, 'Body as Input', 'VolumeKnuckle', 'Raise your fist to turn volume up. Lower it to turn it down.', 'easy', false, false, false, '{}'::text[]),
  ('d04', 4, 1, 'Body as Input', 'BlinkLock', 'Blink three times fast to lock your screen. Wink to unlock.', 'moderate', false, false, false, '{}'::text[]),
  ('d05', 5, 1, 'Body as Input', 'FaceEQ', 'Turn your head to scrub a song. Tilt to change the pitch.', 'moderate', false, false, false, '{}'::text[]),
  ('d06', 6, 1, 'Body as Input', 'BreathClock', 'Your computer listens to your breathing and counts BPM.', 'moderate', false, false, false, '{}'::text[]),
  ('d07', 7, 1, 'Body as Input', 'KeyboardOscilloscope', 'Press keys to create tones. Multiple keys form visible chords.', 'easy', false, false, false, '{}'::text[]),
  ('d08', 8, 2, 'Local AI Core', 'PocketAgent', 'Run an AI assistant entirely on your laptop. No internet.', 'moderate', false, false, false, '{}'::text[]),
  ('d09', 9, 2, 'Local AI Core', 'WhisperDesk', 'Talk to your laptop and it types what you say. Offline.', 'moderate', false, false, false, '{}'::text[]),
  ('d10', 10, 2, 'Local AI Core', 'TerminalBrain', 'Terminal watches for errors, suggests fixes using local AI.', 'advanced', false, false, false, '{}'::text[]),
  ('d11', 11, 2, 'Local AI Core', 'MoodSynth', 'Type a mood and AI creates ambient sounds to match.', 'moderate', false, false, false, '{}'::text[]),
  ('d12', 12, 2, 'Local AI Core', 'SnapAnnotator', 'Webcam snaps a photo, AI labels everything it sees.', 'moderate', false, false, false, '{}'::text[]),
  ('d13', 13, 2, 'Local AI Core', 'DailyDebrief', 'AI reads your git commits and writes a summary of your day.', 'moderate', false, false, false, '{}'::text[]),
  ('d14', 14, 2, 'Local AI Core', 'RegisterBot', 'Build a tiny computer inside your computer. The whole thing.', 'advanced', false, false, false, '{}'::text[]),
  ('d15', 15, 3, 'Signals & Systems', 'AudioScope', 'See sound. Frequencies dance on screen from your mic input.', 'moderate', false, false, false, '{}'::text[]),
  ('d16', 16, 3, 'Signals & Systems', 'EchoKiller', 'Record your voice with echo, then build a filter to remove it.', 'advanced', false, false, false, '{}'::text[]),
  ('d17', 17, 3, 'Signals & Systems', 'PWMSimulator', 'Slide a control, watch a square wave change. A virtual LED dims.', 'easy', false, false, false, '{}'::text[]),
  ('d18', 18, 3, 'Signals & Systems', 'DepthMapper', 'Webcam estimates distance to everything. Paints a depth map.', 'advanced', false, false, false, '{}'::text[]),
  ('d19', 19, 3, 'Signals & Systems', 'I2CPlayground', 'Simulate how chips talk to each other. Watch signals animate.', 'advanced', false, false, false, '{}'::text[]),
  ('d20', 20, 3, 'Signals & Systems', 'SensorLogger', 'Laptop becomes a live sensor dashboard: mic, camera, CPU.', 'moderate', false, false, false, '{}'::text[]),
  ('d21', 21, 3, 'Signals & Systems', 'UDPOscilloscope', 'Send sensor data over your network, display as oscilloscope.', 'moderate', false, false, false, '{}'::text[]),
  ('d22', 22, 4, 'Full Systems', 'CircuitWhisperer', 'Draw a circuit on paper, photograph it, AI reads it.', 'moderate', false, false, false, '{}'::text[]),
  ('d23', 23, 4, 'Full Systems', 'ObjectFollower', 'Point camera at a colored object, your code tracks it live.', 'moderate', false, false, false, '{}'::text[]),
  ('d24', 24, 4, 'Full Systems', 'HardwareTA', 'AI reads hardware datasheets and answers your questions.', 'advanced', false, false, false, '{}'::text[]),
  ('d25', 25, 4, 'Full Systems', 'FirmwarePatcher', 'Load a firmware file, AI finds hidden patterns in raw bytes.', 'advanced', false, false, false, '{}'::text[]),
  ('d26', 26, 4, 'Full Systems', 'CacheSim', 'Simulate CPU memory cache. Watch hits, misses, evictions.', 'advanced', false, false, false, '{}'::text[]),
  ('d27', 27, 4, 'Full Systems', 'SignalFlags', 'Teach your computer to read semaphore signals from your hands.', 'moderate', false, false, false, '{}'::text[]),
  ('d28', 28, 4, 'Full Systems', 'MorseDecoder', 'Tap spacebar in Morse code, computer decodes the message.', 'moderate', false, false, false, '{}'::text[]),
  ('d29', 29, 4, 'Full Systems', 'SilentAssistant', 'Camera sees you, AI understands, responds, speaks back.', 'expert', false, false, false, '{}'::text[]),
  ('d30', 30, 4, 'Full Systems', 'OrcaOS', 'Combine the best of 30 days into one personal OS. Ship it.', 'expert', false, false, false, '{}'::text[])
on conflict (id) do nothing;

-- ── Applications: serious applicants for Orcas v2.0 (Nazarx × Buildcored)
-- Anyone can submit (public insert). Rows readable only by signed-in admin.
-- A separate count RPC exposes the total to the public without exposing rows.
create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  email         text not null,
  telegram      text,
  location      text not null,         -- "City, Country"
  background    text not null,         -- 'high-school' | 'university' | 'working' | 'other'
  experience    text not null,         -- 'beginner' | 'some' | 'comfortable' | 'experienced'
  motivation    text not null,
  build_idea    text not null,
  links         text,
  heard_from    text,
  consent       boolean not null default false,
  created_at    timestamptz default now()
);
create unique index if not exists applications_email_unique on public.applications (lower(email));

alter table public.applications enable row level security;
drop policy if exists "applications_public_insert" on public.applications;
drop policy if exists "applications_admin_read"    on public.applications;
create policy "applications_public_insert" on public.applications
  for insert with check (true);
create policy "applications_admin_read" on public.applications
  for select to authenticated using (true);

create or replace function public.applications_count()
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from public.applications $$;
revoke all on function public.applications_count() from public;
grant execute on function public.applications_count() to anon, authenticated;

-- ── Simplify the applications form (email + motivation + optional CV).
-- Drop the formal-application columns we no longer collect, add CV refs.
alter table public.applications drop column if exists full_name;
alter table public.applications drop column if exists telegram;
alter table public.applications drop column if exists location;
alter table public.applications drop column if exists background;
alter table public.applications drop column if exists experience;
alter table public.applications drop column if exists build_idea;
alter table public.applications drop column if exists links;
alter table public.applications drop column if exists heard_from;
alter table public.applications drop column if exists consent;
alter table public.applications add column if not exists cv_path     text;
alter table public.applications add column if not exists cv_filename text;

-- CV files live in a PRIVATE Storage bucket. Visitors may upload to it
-- (anyone with the apply form), but only the signed-in admin can read
-- the files via the dashboard or signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs', 'cvs', false, 10485760,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
on conflict (id) do nothing;

drop policy if exists "cvs_public_upload" on storage.objects;
create policy "cvs_public_upload" on storage.objects
  for insert with check (bucket_id = 'cvs');

drop policy if exists "cvs_admin_read" on storage.objects;
create policy "cvs_admin_read" on storage.objects
  for select to authenticated using (bucket_id = 'cvs');

drop policy if exists "cvs_admin_delete" on storage.objects;
create policy "cvs_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cvs');
