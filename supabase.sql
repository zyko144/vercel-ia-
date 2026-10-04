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

-- Avis sur History Launcher et History Clips (sites, applis, Discord) : une ligne par avis.
-- Pour retirer un avis du site : Table Editor › avis › supprimer la ligne.
create table if not exists public.avis (
  id text primary key,
  app text not null,           -- launcher | clips
  name text,
  stars int not null check (stars between 1 and 5),
  comment text default '',
  img text,                    -- capture (stockage « bot-files », dossier avis/)
  avatar text,                 -- photo Discord
  at bigint not null,
  source text,                 -- site | appli | discord
  account text,
  discord text
);
create index if not exists avis_app_at on public.avis (app, at desc);
alter table public.avis enable row level security;

-- Premium de History Launcher : une ligne = un pack pour un compte (ajout à la main ou paiement PayPal).
-- compte : pseudo, e-mail ou identifiant du compte History · pack : ia, opti ou pack (les deux)
-- jusqua : date de fin (vide = à vie). Effet dans l'appli en moins d'une minute, sans mise à jour.
create table if not exists public.premium (
  id bigint generated always as identity primary key,
  compte text not null,
  pack text not null check (pack in ('ia', 'opti', 'pack')),
  jusqua timestamptz,
  note text,
  created_at timestamptz not null default now()
);
alter table public.premium enable row level security;

-- Premium en un clic : cocher « premium » sur un compte dans launcher_comptes (IA + Opti, à vie)
alter table public.launcher_comptes add column if not exists premium boolean not null default false;
