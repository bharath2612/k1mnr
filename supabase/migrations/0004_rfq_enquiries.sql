-- ---------------------------------------------------------------------------
-- RFQ enquiries — the site's first conversion capture.
--
-- Security model mirrors the blog exactly:
--   * anon/authenticated can do NOTHING here — no policies, privileges
--     revoked. The public form posts to /api/rfq, which validates and writes
--     with the service-role key. A row can never be written or read through
--     the public API by construction.
--   * Rate limiting lives in Postgres (rfq_rate_limits), same reasoning as
--     blog_studio_login_attempts: serverless functions are multi-instance,
--     so an in-process counter is useless.
-- ---------------------------------------------------------------------------

create table public.rfq_enquiries (
  id uuid primary key default gen_random_uuid(),

  -- What they need
  material   text not null
    constraint rfq_material_length check (length(material) between 2 and 120),
  grade_spec text
    constraint rfq_grade_spec_length check (grade_spec is null or length(grade_spec) <= 500),
  quantity_mt numeric
    constraint rfq_quantity_positive check (quantity_mt is null or quantity_mt > 0),
  contract_type text not null default 'one-off'
    constraint rfq_contract_type_valid check (contract_type in ('one-off', 'recurring', 'annual')),
  destination text
    constraint rfq_destination_length check (destination is null or length(destination) <= 200),
  timeline text
    constraint rfq_timeline_length check (timeline is null or length(timeline) <= 200),

  -- Who they are
  company      text not null
    constraint rfq_company_length check (length(company) between 2 and 160),
  contact_name text not null
    constraint rfq_contact_name_length check (length(contact_name) between 2 and 120),
  designation  text
    constraint rfq_designation_length check (designation is null or length(designation) <= 120),
  phone        text not null
    constraint rfq_phone_length check (length(phone) between 7 and 30),
  email        text not null
    constraint rfq_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 200),

  message text
    constraint rfq_message_length check (message is null or length(message) <= 3000),

  -- Triage. 'new' until someone at K One acts on it.
  status text not null default 'new'
    constraint rfq_status_valid check (status in ('new', 'contacted', 'qualified', 'closed', 'spam')),

  -- Forensics, same shape as the studio audit trail.
  ip_hash    text,
  user_agent text,

  created_at timestamptz not null default now()
);

comment on table public.rfq_enquiries is
  'RFQ form submissions. Written only via service-role through /api/rfq; email alone loses the record, this table is the source of truth.';

create index rfq_enquiries_created_idx on public.rfq_enquiries (created_at desc);
create index rfq_enquiries_status_idx  on public.rfq_enquiries (status, created_at desc);

-- ------------------------- rate limiting -----------------------------------

create table public.rfq_rate_limits (
  ip_hash      text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

-- ----------------------------- RLS -----------------------------------------

alter table public.rfq_enquiries  enable row level security;
alter table public.rfq_rate_limits enable row level security;
alter table public.rfq_enquiries  force row level security;
alter table public.rfq_rate_limits force row level security;

-- Deliberately NO policies: service-role only, both tables.

revoke all on public.rfq_enquiries  from anon, authenticated;
revoke all on public.rfq_rate_limits from anon, authenticated;
