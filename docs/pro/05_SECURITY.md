# 05 — Sécurité (Phase 10)

Vérification : un enseignant → ne voit que ses informations, ses classes, ses documents, ses heures → jamais
ceux d'un autre.

## Ses informations (`staff_members`)

`staff_members_self_read` (`user_id = auth.uid()`) — lecture de sa propre ligne uniquement. Confirmé : aucune
policy ne permet à un `user_id` de lire une ligne `staff_members` où `user_id` diffère du sien (la seule autre
policy, `staff_members_scope`, est réservée au propriétaire de l'établissement via
`current_establishment_id()`, qui résout `null` pour un compte enseignant pur).

## Ses classes / son emploi du temps (`emplois_du_temps`)

Nouvelle policy `edt_self_read` (`enseignant_id in (select id from enseignants where user_id = auth.uid())`) —
corrige une lacune réelle identifiée en Phase 1 (aucune policy de lecture n'existait auparavant pour
l'enseignant lui-même sur cette table). Un enseignant ne peut lire que les lignes où `enseignant_id` correspond
à sa propre fiche `enseignants` — jamais celles d'un collègue.

## Ses documents (`staff_documents`)

`staff_documents_self_read` (`staff_member_id in (select id from staff_members where user_id = auth.uid())`) —
même schéma. Le Storage suit la même logique (`staff_documents_self_read` sur `storage.objects`, chemin
`{staff_member_id}/...` vérifié contre `user_id = auth.uid()`).

## Ses heures (`pointages`, RPC `calculer_heures_enseignant`)

**Non modifié par cette mission** — déjà vérifié et confirmé sûr dans `docs/04_SUPABASE_PROD_READINESS/04_ISOLATION_ENSEIGNANTS.md`
(policy `pointages_self_read`, résistance de la RPC à un `p_enseignant_id` falsifié). Cette mission n'introduit
aucune nouvelle voie d'accès aux heures d'un tiers.

## Son contrat (`staff_contracts`)

`staff_contracts_self_read` — même schéma, un enseignant voit son propre contrat (transparence sur son propre
volume/taux), jamais celui d'un collègue.

## Vérification négative — recherche de contre-exemples

Recherche exhaustive dans `0009_pro_hr_foundation.sql` de toute policy `using (true)` ou toute policy
`self_read` dont la condition ne filtrerait pas strictement par `auth.uid()` : **aucune trouvée**. Toutes les
policies `*_self_read` suivent exactement le même schéma vérifié table par table ci-dessus.

## Ce qui reste une limite assumée

- **Mode d'accès par code** (Phase 4) : le code généré (`staff_members.access_code`) n'est, à ce stade, relié à
  aucun mécanisme de connexion Supabase Auth (voir `src/app/api/personnel/[id]/code-acces/route.ts`, en-tête du
  fichier). Un futur pont d'authentification par code devra être conçu avec la même rigueur que le reste de ce
  document — non construit ici précisément pour éviter d'introduire un mécanisme d'authentification non revu.
- **Permissions par `staff_role`** : non appliquées en RLS (voir `03_ROLES.md`) — seuls "propriétaire" et
  "soi-même" sont des frontières réellement appliquées aujourd'hui.

## Résumé

| Vérification (Phase 10) | Statut |
|---|---|
| Informations personnelles isolées | Confirmé |
| Classes / emploi du temps isolés | Confirmé (lacune corrigée par cette mission) |
| Documents isolés | Confirmé |
| Heures isolées | Confirmé (hérité, non modifié) |
| Contrat isolé | Confirmé |
