-- À coller dans Supabase > SQL Editor > New query > Run
create table if not exists public.bot_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS activé sans règle = personne ne peut lire/écrire avec la clé publique.
-- Le bot utilise la clé secrète (service_role / sb_secret_...) qui passe outre.
alter table public.bot_kv enable row level security;

-- ===== History Launcher : comptes lisibles dans Table Editor (recopiés par le serveur) =====
-- Aucun mot de passe, clé de double authentification ni jeton n'est recopié ici : seulement le profil et l'activité.
create table if not exists public.launcher_comptes (
  id text primary key,
  pseudo text not null,
  email text not null,
  cree_le timestamptz not null default now(),
  email_verifie boolean not null default false,
  double_auth boolean not null default false,
  discord_lie boolean not null default false,
  photo boolean not null default false,
  couleur text,
  bio text,
  jeu_prefere text,
  amis integer not null default 0,
  appareils integer not null default 0,
  derniere_activite timestamptz,
  joue_a text
);
alter table public.launcher_comptes enable row level security;

-- Photos de profil, bannières et images des discussions : bucket privé « launcher »
-- (créé tout seul par le serveur au premier envoi ; cette ligne le crée aussi si besoin)
insert into storage.buckets (id, name, public) values ('launcher', 'launcher', false) on conflict (id) do nothing;
