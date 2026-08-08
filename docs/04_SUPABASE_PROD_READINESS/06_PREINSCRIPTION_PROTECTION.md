# 06 — Protection anti-abus de la préinscription publique

## Constat

`src/app/preinscription/page.tsx` insère directement dans `applications` depuis le **client navigateur** (client
Supabase anonyme, pas de route API intermédiaire) :

```ts
const { error } = await supabase.from("applications").insert({ ... establishment_id: form.establishment_id, ... });
```

RLS (`auth-setup.sql`) : `"Public can create applications" ... with check (true)` — aucune limite. Aucun
CAPTCHA, aucun honeypot, aucun débit maximal. Une seule école ciblée pourrait recevoir un nombre illimité de
faux dossiers, dégradant directement son dashboard (Offre 1 "Autonome" — c'est là que les écoles gèrent leurs
admissions).

## Pourquoi une solution "classique" (Vercel middleware / Upstash) ne convient pas ici

Le formulaire écrit **directement** dans Supabase depuis le navigateur, sans passer par une route API Next.js.
Un rate-limiter basé sur le edge middleware de Vercel ou un service externe (Upstash Redis, etc.) ne verrait
jamais cette requête — elle part directement vers `supabase.co`, pas vers un `/api/*` de l'application. Deux
options réelles :

1. **Faire transiter le formulaire par une route API Next.js** (`/api/preinscription`) puis limiter là — change
   le chemin d'écriture actuel, techniquement plus proche d'un "développement de fonctionnalité" que d'une
   simple protection, et nécessite malgré tout une solution de stockage d'état partagé entre invocations
   serverless (Vercel KV/Upstash) pour un vrai rate-limit par IP — complexité que la mission demande explicitement
   d'éviter ("ne pas ajouter un système complexe inutilement").
2. **Protéger directement au niveau Postgres**, sans toucher au code applicatif existant — la requête d'insertion
   actuelle continue de fonctionner à l'identique ; c'est Postgres qui refuse les insertions abusives.

**Option retenue : (2).** C'est la solution la plus simple compatible avec Vercel + Supabase demandée par la
mission — aucune nouvelle route, aucun nouveau service, aucun nouveau secret à gérer, aucune modification du
composant `preinscription/page.tsx`.

## Solution proposée : trigger Postgres de limitation de fréquence

Un trigger `BEFORE INSERT` sur `applications` qui rejette l'insertion si le même `parent_phone` a déjà soumis
plus de N dossiers dans les M dernières minutes. Le téléphone est choisi comme clé (pas l'email, optionnel dans
le formulaire ; pas l'IP, non disponible depuis un insert Postgres direct sans passer par une route API).

```sql
create or replace function public.check_application_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_recent_count integer;
begin
  select count(*) into v_recent_count
  from public.applications
  where parent_phone = new.parent_phone
    and created_at > now() - interval '15 minutes';

  if v_recent_count >= 3 then
    raise exception 'Trop de préinscriptions envoyées récemment avec ce numéro. Réessayez dans quelques minutes.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger applications_rate_limit
  before insert on public.applications
  for each row execute procedure public.check_application_rate_limit();
```

**Choix des seuils** (3 soumissions / 15 minutes) : volontairement généreux pour ne jamais bloquer un usage
légitime (un parent qui corrige une erreur de saisie et resoumet, ou qui inscrit deux enfants à la suite) tout en
rendant un flood automatisé inefficace. Seuils ajustables sans redévelopper le trigger.

## Ce que cette solution NE fait PAS

- Ne bloque pas un script qui change de numéro de téléphone à chaque soumission (protection anti-bot faible,
  pas anti-bot fort). Un CAPTCHA (Cloudflare Turnstile, gratuit, compatible Vercel) resterait la prochaine étape
  si un abus réel est constaté — volontairement non ajouté ici pour rester la solution la plus simple possible,
  conformément à la consigne.
- Ne notifie personne en cas de blocage — l'erreur Postgres remonte au formulaire, qui aujourd'hui n'affiche
  **aucun message d'erreur explicite** en cas d'échec de `supabase.from("applications").insert()` (`if (!error)
  { setSuccess(true) }`, sans `else`) — un utilisateur légitime bloqué par erreur ne verrait qu'un formulaire qui
  ne confirme jamais l'envoi, sans explication. **Ce point est un défaut d'UX préexistant, pas introduit par
  cette protection** — signalé ici pour visibilité, correction hors périmètre de cette migration (touche le code
  applicatif, pas le schéma).

## Statut

Incluse dans `supabase/migrations/0007_production_security_reconciliation.sql`, **non exécutée**.
