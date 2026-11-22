-- ============================================================
-- World Book Records — Supabase PostgreSQL Schema & Seed SQL
-- Run this entire script in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. User Profiles (synced automatically from auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  account_role text not null default 'Reader account'
    check (account_role in ('Reader account', 'Author account')),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger to auto-create profile on Supabase Auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, account_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'account_role', 'Reader account')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Authors Directory Table
create table if not exists public.authors (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  initials text not null,
  name text not null,
  verified boolean not null default false,
  country text not null default 'Global',
  genre text not null default 'Fiction',
  published_count integer not null default 1,
  bio text not null default '',
  created_at timestamptz not null default now()
);

alter table public.authors enable row level security;

drop policy if exists "Public can read authors" on public.authors;
create policy "Public can read authors"
  on public.authors for select
  using (true);

drop policy if exists "Authenticated users can add author profile" on public.authors;
create policy "Authenticated users can add author profile"
  on public.authors for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Authors can update own author profile" on public.authors;
create policy "Authors can update own author profile"
  on public.authors for update
  to authenticated
  using (auth.uid() = user_id);

-- 3. Books Library Table
create table if not exists public.books (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  title_line_1 text not null,
  title_line_2 text not null,
  author_name text not null,
  category text not null check (category in ('Fiction', 'History', 'Science')),
  access_type text not null check (access_type in ('Free', 'Paid')),
  price_label text not null default 'Free',
  cover_image_url text,
  book_file_url text,
  book_file_name text,
  book_file_size text,
  cover_variant text not null default 'c1' check (cover_variant in ('c1', 'c2', 'c3', 'c4')),
  cover_kicker text not null default 'WORLD BOOK RECORDS',
  cover_footer text not null,
  pages integer not null default 200,
  published_year integer not null default 2026,
  synopsis text not null default '',
  excerpt text not null default '',
  created_at timestamptz not null default now()
);

alter table public.books add column if not exists cover_image_url text;
alter table public.books add column if not exists book_file_url text;
alter table public.books add column if not exists book_file_name text;
alter table public.books add column if not exists book_file_size text;

create index if not exists idx_books_category on public.books(category);
create index if not exists idx_books_access_type on public.books(access_type);
create index if not exists idx_books_created_at on public.books(created_at desc);

alter table public.books enable row level security;

drop policy if exists "Public can read books" on public.books;
create policy "Public can read books"
  on public.books for select
  using (true);

drop policy if exists "Authenticated users can publish books" on public.books;
create policy "Authenticated users can publish books"
  on public.books for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Authors can update own books" on public.books;
create policy "Authors can update own books"
  on public.books for update
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Authors can delete own books" on public.books;
create policy "Authors can delete own books"
  on public.books for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4. Literary Milestones / World Records Table
create table if not exists public.literary_records (
  id text primary key,
  record_number text not null,
  title text not null,
  description text not null,
  sort_order integer not null default 1
);

alter table public.literary_records enable row level security;

drop policy if exists "Public can read literary records" on public.literary_records;
create policy "Public can read literary records"
  on public.literary_records for select
  using (true);

-- Ensure anonymous and signed-in visitors can read public catalog tables
grant usage on schema public to anon, authenticated;
grant select on public.books, public.authors, public.literary_records to anon, authenticated;
grant insert, update, delete on public.books to authenticated;
grant insert, update on public.authors to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- Enable live updates for newly published books (safe if already enabled)
do $$
begin
  alter publication supabase_realtime add table public.books;
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- 5. Seed Initial Data
insert into public.authors (id, initials, name, verified, country, genre, published_count, bio)
values
  ('aria-sen', 'AS', 'Aria Sen', true, 'India', 'Fiction & Poetry', 12, 'Novelist and essayist exploring memory, maritime archives, and lyrical contemporary fiction.'),
  ('rahman-kabir', 'RK', 'Rahman Kabir', false, 'Bangladesh', 'History', 8, 'Historian dedicated to open-access regional archives, riverine heritage, and oral historiography.'),
  ('maya-fern', 'MF', 'Maya Fern', false, 'United Kingdom', 'Science', 5, 'Astrophysics communicator writing clear, evocative books on cosmology and observational science.'),
  ('elias-morgan', 'EM', 'Elias Morgan', false, 'Canada', 'Fiction', 4, 'Short-story author focused on everyday resilience, urban gardens, and quiet human connections.')
on conflict (id) do nothing;

insert into public.books (
  id, title, title_line_1, title_line_2, author_name, category, access_type,
  price_label, cover_variant, cover_kicker, cover_footer, pages, published_year,
  synopsis, excerpt
)
values
  (
    'silent-empire',
    'The Silent Empire',
    'The Silent',
    'Empire',
    'Aria Sen',
    'Fiction',
    'Paid',
    '$4.99',
    'c1',
    'WORLD BOOK RECORDS',
    'A NOVEL BY ARIA SEN',
    312,
    2026,
    'Set across coastal archives and forgotten observatories, a cartographer uncovers an unwritten history preserved only in marginalia.',
    'In the hour before tide-fall, the stone library kept its own silence—not an absence of sound, but a patience earned over four centuries of salt and ink.'
  ),
  (
    'rivers-of-memory',
    'Rivers of Memory',
    'Rivers of',
    'Memory',
    'Rahman Kabir',
    'History',
    'Free',
    'Free',
    'c2',
    'AN OPEN HISTORY',
    'BY RAHMAN KABIR',
    248,
    2025,
    'An open-access chronicle tracing delta trade routes, oral poetry, and riverine towns that shaped centuries of South Asian scholarship.',
    'Every ferry crossing carried more than timber and grain; it carried dialects, letters stitched into cloth, and songs tuned to the monsoon.'
  ),
  (
    'beyond-the-stars',
    'Beyond the Stars',
    'Beyond',
    'the Stars',
    'Maya Fern',
    'Science',
    'Paid',
    '$7.00',
    'c3',
    'IDEAS FOR TOMORROW',
    'BY MAYA FERN',
    284,
    2026,
    'An accessible journey through deep-space spectroscopy, exoplanet atmospheres, and the human instruments built to listen across light-years.',
    'A single slit of starlight, split across prism glass, still holds the oldest chemistry lesson in the universe: what worlds are made of, and what they might yet host.'
  ),
  (
    'garden-of-small-things',
    'Garden of Small Things',
    'Garden of',
    'Small Things',
    'Elias Morgan',
    'Fiction',
    'Free',
    'Free',
    'c4',
    'A COLLECTION',
    'BY ELIAS MORGAN',
    176,
    2025,
    'Twelve linked short stories about botanists, letter-writers, and night-shift bakers tending quiet corners of a changing city.',
    'He labeled each clay pot not with Latin taxonomy, but with the name of the friend who had carried the cutting across town in a coat pocket.'
  )
on conflict (id) do nothing;

insert into public.literary_records (id, record_number, title, description, sort_order)
values
  ('record-01', '01', 'Most Published Works', 'Celebrate authors with an exceptional body of published work.', 1),
  ('record-02', '02', 'Reader Choice', 'Highlight books loved by readers across countries and cultures.', 2),
  ('record-03', '03', 'Young Literary Voice', 'Recognise emerging writers and promising new perspectives.', 3)
on conflict (id) do nothing;
