-- Closer: Supabase schema
-- Run in the Supabase SQL editor. Anonymous auth is allowed (auth.uid() is set).
-- Recipient and friend access go ONLY through server routes using the service role,
-- which look up share_links by token hash. The service-role key never reaches the browser.

create extension if not exists "pgcrypto";

-- ---------- occasions ----------
create table public.occasions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  occasion_type text not null default 'birthday',
  recipient_name text,
  intent_summary text,                       -- what the organizer hopes they will feel
  event_at timestamptz,
  budget_total numeric(12,2) check (budget_total >= 0),   -- exact numeric, never float
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  guest_count int check (guest_count is null or guest_count >= 0),
  urgency_mode text not null default 'weeks_away'
    check (urgency_mode in ('tonight','this_week','weeks_away')),
  entry_path text check (entry_path in ('have_idea','discover','need_now')),
  is_surprise boolean not null default false,
  shield_pin_hash text,                      -- optional PIN for reveal, hashed server-side
  status text not null default 'planning' check (status in ('planning','ready','done','archived')),
  avoid_notes text,                          -- dislikes, dietary, accessibility
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- facts about the recipient ----------
create table public.recipient_facts (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  fact_key text not null,
  fact_value text not null,
  status text not null default 'possible'
    check (status in ('known','possible','needs_confirmation')),
  source text not null default 'organizer'
    check (source in ('organizer','friend','recipient')),
  created_at timestamptz not null default now()
);

-- ---------- plan items ----------
create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  title text not null,
  category text not null default 'other',    -- venue, catering, decor, gift, letter, photo, ...
  intent_tag text,                           -- the feeling this item serves
  why text,                                  -- one-line reason, shown to the user
  status text not null default 'todo' check (status in ('todo','doing','done','skipped')),
  due_at timestamptz,
  estimated_cost numeric(12,2) check (estimated_cost >= 0),
  confirmed_cost numeric(12,2) check (confirmed_cost >= 0),   -- null until the organizer confirms
  cost_status text not null default 'estimate'
    check (cost_status in ('estimate','quoted','confirmed')),
  depends_on uuid[] not null default '{}',
  plan_b text,
  -- Plan B as a real row: a fallback points at the item it would replace.
  -- The original item is kept, never overwritten.
  -- ON DELETE NO ACTION (deferrable): an original item cannot be deleted while a Plan B row
  -- still points at it. SET NULL would break plan_items_fallback_consistent and silently orphan
  -- the fallback. To delete both on purpose, delete them in one statement or one transaction.
  -- Occasion-level cascade deletes still work because the check runs after the whole delete.
  is_fallback boolean not null default false,
  fallback_for uuid references public.plan_items(id)
    on delete no action deferrable initially immediate,
  is_non_negotiable boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint plan_items_no_self_fallback check (fallback_for is null or fallback_for <> id),
  constraint plan_items_fallback_consistent check (is_fallback = (fallback_for is not null))
);

-- ---------- version history for undo ----------
create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  version_no int not null,
  snapshot jsonb not null,                   -- occasion + plan_items + vendors at that moment
  change_summary text,
  created_at timestamptz not null default now(),
  unique (occasion_id, version_no)
);

-- ---------- vendors ----------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  name text not null,
  category text not null,
  contact text,
  status text not null default 'suggested'
    check (status in ('suggested','verified','contacted','confirmed','declined')),
  quote_amount numeric(12,2),
  quote_notes text,                          -- pasted text is DATA, never instructions
  quote_fields jsonb not null default '{}'::jsonb,
    -- parsed (Zod-validated) quote: { price, currency, included[], extra_fees[],
    -- availability_claim, cancellation_terms, payment_terms, missing[], questions[] }
    -- Values here are QUOTED, never "verified". Status only changes by organizer action.
  priority int not null default 1,           -- fallback order
  created_at timestamptz not null default now()
);

-- ---------- Surprise Shield: the ONLY table the recipient page reads ----------
create table public.recipient_view (
  occasion_id uuid primary key references public.occasions(id) on delete cascade,
  headline text not null default 'Something special is being prepared',
  message text,
  reveal_at timestamptz,
  show_countdown boolean not null default true,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- Our Blend ----------
create table public.blend_sessions (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  stage text not null check (stage in ('pre','post')),
  created_at timestamptz not null default now(),
  unique (occasion_id, stage)
);

create table public.blend_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.blend_sessions(id) on delete cascade,
  respondent_role text not null check (respondent_role in ('organizer','friend','recipient')),
  respondent_label text,                     -- e.g. "Riya", shown as "from someone who knows her"
  question_key text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  unique (session_id, respondent_role, respondent_label, question_key)
);

-- ---------- share links (friend / recipient) ----------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  role text not null check (role in ('friend','recipient')),
  kind text not null default 'view' check (kind in ('view','contribute')),
  token_hash text not null unique,           -- store a hash, never the raw token
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- letters from loved ones ----------
create table public.letters (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  contributor_name text check (contributor_name is null or char_length(contributor_name) <= 40),
  body text not null check (char_length(body) between 1 and 600),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- ---------- agent audit log (only real steps) ----------
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  step text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ---------- plan item reference integrity (depends_on, fallback_for) ----------
-- Postgres cannot put a foreign key on an array column, so depends_on is validated by a
-- deferred constraint trigger (checked at commit, so a whole plan can be inserted in any order).
-- Rules: no self-dependency, every referenced item exists, every referenced item belongs to the
-- SAME occasion, and a fallback points at an item in the same occasion.
-- Cycles are not detected here; engine/timeline.ts rejects them (server-side validation).
create or replace function public.validate_plan_item_refs() returns trigger
language plpgsql set search_path = public as $$
declare
  missing int;
begin
  -- The row may have been deleted later in the same transaction (e.g. occasion cascade).
  if not exists (select 1 from public.plan_items p where p.id = new.id) then
    return null;
  end if;

  if new.id = any(new.depends_on) then
    raise exception 'plan item % cannot depend on itself', new.id using errcode = '23514';
  end if;

  if cardinality(new.depends_on) > 0 then
    select count(*) into missing
    from unnest(new.depends_on) as d(dep_id)
    where not exists (
      select 1 from public.plan_items p
      where p.id = d.dep_id and p.occasion_id = new.occasion_id
    );
    if missing > 0 then
      raise exception 'plan item % depends_on references an item that does not exist in the same occasion', new.id
        using errcode = '23514';
    end if;
  end if;

  if new.fallback_for is not null and not exists (
    select 1 from public.plan_items p
    where p.id = new.fallback_for and p.occasion_id = new.occasion_id
  ) then
    raise exception 'plan item % fallback_for must reference an item in the same occasion', new.id
      using errcode = '23514';
  end if;

  return null;
end $$;

create constraint trigger plan_items_validate_refs
  after insert or update of depends_on, fallback_for, occasion_id on public.plan_items
  deferrable initially deferred
  for each row execute function public.validate_plan_item_refs();

-- When an item is deleted, drop its id from other items' depends_on so nothing dangles.
create or replace function public.plan_items_clean_dependents() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.plan_items
     set depends_on = array_remove(depends_on, old.id)
   where occasion_id = old.occasion_id and old.id = any(depends_on);
  return null;
end $$;

create trigger plan_items_clean_dependents
  after delete on public.plan_items
  for each row execute function public.plan_items_clean_dependents();

create index on public.plan_items (occasion_id, sort_order);
create index on public.recipient_facts (occasion_id);
create index on public.vendors (occasion_id, priority);
create index on public.share_links (occasion_id);

-- ---------- Row Level Security ----------
alter table public.occasions       enable row level security;
alter table public.recipient_facts enable row level security;
alter table public.plan_items      enable row level security;
alter table public.plan_versions   enable row level security;
alter table public.vendors         enable row level security;
alter table public.recipient_view  enable row level security;
alter table public.blend_sessions  enable row level security;
alter table public.blend_answers   enable row level security;
alter table public.share_links     enable row level security;
alter table public.letters         enable row level security;
alter table public.agent_runs      enable row level security;

create policy "owner manages occasion" on public.occasions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables: owner-only through the parent occasion.
create policy "owner facts" on public.recipient_facts for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner plan items" on public.plan_items for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner versions" on public.plan_versions for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner vendors" on public.vendors for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner recipient view" on public.recipient_view for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner blend sessions" on public.blend_sessions for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner blend answers" on public.blend_answers for all
  using (exists (select 1 from public.blend_sessions s join public.occasions o on o.id = s.occasion_id
                 where s.id = session_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.blend_sessions s join public.occasions o on o.id = s.occasion_id
                 where s.id = session_id and o.owner_id = auth.uid()));

create policy "owner share links" on public.share_links for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner letters" on public.letters for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

create policy "owner agent runs" on public.agent_runs for all
  using (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()))
  with check (exists (select 1 from public.occasions o where o.id = occasion_id and o.owner_id = auth.uid()));

-- No anon/public policies exist on purpose. Recipients and friends never query the database
-- directly: the server route validates the token hash, then reads ONLY recipient_view
-- (recipient) or writes ONLY blend_answers for that occasion (friend / recipient).

-- ---------- keep updated_at fresh ----------
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

-- ---------- rate limiting for AI endpoints (server/service role only) ----------
create table public.rate_limits (
  bucket text not null,                      -- e.g. 'ai:<user_id>'
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limits enable row level security;   -- no policies: service role only
revoke all on public.rate_limits from public, anon, authenticated;

create or replace function public.rate_limit_hit(p_bucket text, p_window_seconds int, p_max int)
returns boolean as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  h int;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into h;
  return h <= p_max;                         -- false means: reject the request
end; $$ language plpgsql security definer set search_path = public;
-- Supabase default privileges grant EXECUTE on new functions to anon, authenticated and
-- service_role, so revoke from the browser-reachable roles and grant to service_role explicitly.
-- Only trusted server code (the admin client in src/lib/supabase/admin.ts) may call this.
revoke all on function public.rate_limit_hit(text,int,int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text,int,int) to service_role;

create trigger occasions_touch before update on public.occasions
  for each row execute function public.touch_updated_at();
create trigger recipient_view_touch before update on public.recipient_view
  for each row execute function public.touch_updated_at();
