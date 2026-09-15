-- À coller dans Supabase > SQL Editor > New query > Run
create table if not exists public.bot_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS activé sans règle = personne ne peut lire/écrire avec la clé publique.
-- Le bot utilise la clé secrète (service_role / sb_secret_...) qui passe outre.
alter table public.bot_kv enable row level security;
