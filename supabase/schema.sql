-- Database Schema for AI-Based Digital Forensics Case Tracker

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table (Linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('INVESTIGATOR', 'ADMIN', 'VIEWER')) default 'INVESTIGATOR',
  full_name text,
  created_at timestamptz default now()
);

-- 2. Cases Table
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text unique not null,
  title text not null,
  case_type text not null check (case_type in (
    'Unauthorized Account Access',
    'Phishing',
    'Cyberbullying',
    'Data Theft',
    'Suspicious Activity',
    'Device Misuse',
    'Online Fraud',
    'Other'
  )),
  description text,
  date_reported timestamptz default now(),
  priority text not null check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) default 'LOW',
  status text not null check (status in (
    'OPEN',
    'UNDER_INVESTIGATION',
    'EVIDENCE_ADDED',
    'ANALYSIS',
    'REVIEW',
    'RESOLVED',
    'CLOSED'
  )) default 'OPEN',
  investigator text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Evidence Table
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  evidence_type text not null check (evidence_type in (
    'Screenshot',
    'Email',
    'Log File',
    'IP Address',
    'Device Information',
    'File',
    'URL',
    'Message',
    'Timestamp/Event',
    'Other'
  )),
  title text not null,
  description text,
  source text,
  timestamp timestamptz default now(),
  ip_address text,
  device text,
  related_event text,
  tags text[] default '{}',
  status text default 'ACTIVE',
  file_url text,
  created_at timestamptz default now()
);

-- 4. Evidence Relationships Table
create table if not exists public.evidence_relationships (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  evidence_a_id uuid not null references public.evidence(id) on delete cascade,
  evidence_b_id uuid not null references public.evidence(id) on delete cascade,
  relevance_score numeric default 0,
  reasons jsonb default '[]'::jsonb,
  relationship_type text,
  created_at timestamptz default now()
);

-- 5. AI Analysis Table
create table if not exists public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  priority_score numeric default 0,
  previous_score numeric default 0,
  new_score numeric default 0,
  previous_priority text,
  new_priority text,
  recommendation text,
  reasons jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 6. Case Timeline Table
create table if not exists public.case_timeline (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  event text not null,
  description text,
  timestamp timestamptz default now()
);

-- 7. Manual Case Notes Table
create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS) on all tables
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_relationships enable row level security;
alter table public.ai_analysis enable row level security;
alter table public.case_timeline enable row level security;
alter table public.case_notes enable row level security;

-- RLS Helper function to get current user role
create or replace function public.get_my_role()
returns text
language sql stable
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

-- RLS Policies for Profiles
create policy "Users can view all profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- RLS Policies for Cases
create policy "Authenticated users can read cases" on public.cases
  for select using (auth.role() = 'authenticated');

create policy "Investigators and Admins can insert cases" on public.cases
  for insert with check (public.get_my_role() in ('INVESTIGATOR', 'ADMIN'));

create policy "Investigators and Admins can update cases" on public.cases
  for update using (public.get_my_role() in ('INVESTIGATOR', 'ADMIN'));

create policy "Admins can delete cases" on public.cases
  for delete using (public.get_my_role() = 'ADMIN');

-- RLS Policies for Evidence
create policy "Authenticated users can read evidence" on public.evidence
  for select using (auth.role() = 'authenticated');

create policy "Investigators and Admins can write evidence" on public.evidence
  for all using (public.get_my_role() in ('INVESTIGATOR', 'ADMIN'));

-- RLS Policies for Evidence Relationships
create policy "Authenticated users can read relationships" on public.evidence_relationships
  for select using (auth.role() = 'authenticated');

create policy "Investigators and Admins can write relationships" on public.evidence_relationships
  for all using (public.get_my_role() in ('INVESTIGATOR', 'ADMIN'));

-- RLS Policies for AI Analysis
create policy "Authenticated users can read AI analysis" on public.ai_analysis
  for select using (auth.role() = 'authenticated');

create policy "Investigators and Admins can insert AI analysis" on public.ai_analysis
  for all using (public.get_my_role() in ('INVESTIGATOR', 'ADMIN'));

-- RLS Policies for Case Timeline
create policy "Authenticated users can read timeline" on public.case_timeline
  for select using (auth.role() = 'authenticated');

create policy "Investigators and Admins can write timeline" on public.case_timeline
  for all using (public.get_my_role() in ('INVESTIGATOR', 'ADMIN'));

-- RLS Policies for Case Notes
create policy "Authenticated users can read case notes" on public.case_notes
  for select using (auth.role() = 'authenticated');

create policy "Investigators and Admins can add case notes" on public.case_notes
  for insert with check (
    public.get_my_role() in ('INVESTIGATOR', 'ADMIN')
    and author_id = auth.uid()
  );

-- Automatic profile creation on signup trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'INVESTIGATOR')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
