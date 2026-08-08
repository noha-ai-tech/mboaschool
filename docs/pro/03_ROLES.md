# 03 — Rôles (Phase 6)

## Deux systèmes de rôle distincts — volontairement séparés

| | `user_role` (existant, inchangé) | `staff_role` (nouveau, cette mission) |
|---|---|---|
| Portée | Accès système (authentification, redirection, middleware) | Fonction organisationnelle de la personne dans l'établissement |
| Valeurs | `parent`, `establishment_admin` (mort), `platform_admin`, `teacher` | `admin_principal`, `directeur`, `proviseur`, `principal`, `censeur`, `secretaire`, `comptable`, `enseignant`, `assistant` |
| Table | `profiles.role` | `staff_members.role` |
| Modifié par cette mission ? | **Non** | Nouveau |

**Pourquoi ne pas étendre `user_role` directement** : cet enum gouverne des décisions d'accès déjà en
production dans `src/middleware.ts` et `src/app/auth/callback/route.ts` (redirection post-connexion,
protection de `/dashboard/admin`). Y ajouter 9 nouvelles valeurs sans un plan de permissions systémique
associé aurait risqué de casser ces flux existants — contraire à la consigne "ne jamais casser les modules
existants". `staff_role` reste un attribut descriptif de la fiche RH, sans effet sur le contrôle d'accès système
pour l'instant (voir "Permissions" ci-dessous).

## Les 9 rôles prévus

| Rôle | Champ conceptuel |
|---|---|
| Administrateur principal | Propriétaire du compte (`establishments.owner_id`) — rôle système, pas seulement organisationnel |
| Directeur | Direction générale de l'établissement |
| Proviseur | Direction (secondaire) |
| Principal | Direction (collège) |
| Censeur | Direction pédagogique |
| Secrétaire | Personnel administratif |
| Comptable | Personnel administratif |
| Enseignant | Personnel enseignant |
| Assistant | Personnel de soutien |

## Permissions — ce qui est réellement appliqué aujourd'hui vs. prévu

**Réellement appliqué (RLS, migration 0009)** : deux niveaux seulement, indépendants de `staff_role`.

1. **Le propriétaire de l'établissement** (`owner_id = auth.uid()`, résolu par `current_establishment_id()`) —
   accès complet à tout `staff_members`/`staff_contracts`/`staff_documents`/`sections` de son établissement.
2. **La personne elle-même** (`staff_members.user_id = auth.uid()`) — lecture seule de sa propre fiche, son
   propre contrat, ses propres documents.

**Non appliqué, prévu pour une mission future** : une matrice de permissions par `staff_role` (ex. le Censeur
pourrait avoir un accès élargi aux admissions, le Comptable aux paiements) nécessiterait des policies RLS
distinctes par rôle sur chaque table concernée — non construit ici, car cela reviendrait à développer des
fonctionnalités de gestion (admissions, paiements) par rôle, explicitement hors périmètre de cette mission
("elle construit la plateforme RH", pas les permissions transverses fines). Le champ `staff_role` existe et est
affiché ; il n'est pas encore un levier de contrôle d'accès.

## Matrice indicative (non implémentée en RLS — à valider avant construction)

| Rôle | Accès Personnel | Accès Admissions | Accès Paiements | Accès Paie (future) |
|---|---|---|---|---|
| Administrateur principal | Complet | Complet | Complet | Complet |
| Directeur/Proviseur/Principal/Censeur | Lecture/écriture (à définir) | À définir | À définir | À définir |
| Secrétaire | À définir (probable : lecture) | À définir (probable : écriture) | Aucun | Aucun |
| Comptable | À définir (probable : lecture) | Aucun | À définir | À définir (future) |
| Enseignant | Sa propre fiche uniquement (déjà appliqué) | Aucun | Aucun | Sa propre fiche (future) |
| Assistant | À définir | À définir | Aucun | Aucun |

Cette matrice est une proposition à valider avec Eddy — **aucune ligne "À définir" n'a été implémentée**,
conformément à "chaque rôle possède des permissions" compris comme une préparation conceptuelle, pas une
implémentation complète non demandée ailleurs dans le détail des phases.
