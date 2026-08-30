# PRO-04 — Migration history reconciliation runbook

Date de l'audit : 22 août 2026  
Projet contrôlé en lecture seule : `Ecoles237` (`umcwwynrftidytxgqkwi`)

## Décision

Les DDL PRO-03 B, C corrigée, D et gate final sont présents et conformes en
production, mais aucune version correspondante n'est inscrite dans
`supabase_migrations.schema_migrations`. Les quatre fichiers de consolidation
locaux sont donc des copies canoniques de DDL **déjà exécutés**.

Ils ne doivent jamais être rejoués sur `Ecoles237`. Une réconciliation future
doit marquer leurs versions comme `applied`, sans exécuter leur SQL, et seulement
après approbation explicite d'Eddy et de l'architecte.

## Fichiers canoniques

| Version locale | Objet exécuté | Preuve de production |
|---|---|---|
| `20260822155238` | Vague B | 12/12 policies, RLS actif, rôle `authenticated`, `USING` + `WITH CHECK` |
| `20260822194239` | Vague C corrigée | 11/11 policies et fonction heures corrigée |
| `20260822194251` | Vague D | 14/14 policies, RLS actif, rôle `authenticated` |
| `20260822194302` | Gate final | `public.current_establishment_id()` absent |

Chaque fichier de migration a un corps strictement identique à son fichier
`docs/pro/PRO-03_*_PROPOSED.sql`, précédé uniquement d'un avertissement PRO-04.

## Dérives connexes à résoudre avant toute réconciliation

1. `school_page_drafts` est enregistrée à distance sous la version
   `20260822154940`, mais le statement distant (SHA-256
   `fcc99d793476157c29c91199d71dde2cae94436b33dc73f13ab5c98df643bd21`)
   n'est pas identique à `0026_school_page_drafts.sql`. La structure est
   conforme, le commentaire de table et les octets ne le sont pas. Aucune
   association ou réparation n'est autorisée pour `0026`.
2. L'historique local numérique (`0001` à `0026`) n'est pas une correspondance
   un-à-un avec l'historique distant horodaté. Plusieurs migrations distantes
   représentent des durcissements successifs d'un seul fichier local.
3. La migration distante Wave A est enregistrée, mais une migration ultérieure
   (`multi_school_rls_context`) a réintroduit la policy A `PUBLIC` et le helper
   `is_own_establishment()`. C'est une dérive d'état, pas une absence de ligne
   Wave A.

Ces trois points interdisent un `supabase db push` aveugle et interdisent de
réparer uniquement les quatre versions sans revoir la table complète de
correspondance local/distant.

## Procédure future, après approbation

1. Relancer `supabase migration list --project-ref umcwwynrftidytxgqkwi`.
2. Relancer les contrôles read-only de parité des 37 policies B–D, de la fonction
   heures et de l'absence du helper final.
3. Vérifier que `20260822154940_school_page_drafts` reste l'unique version
   distante de cet objet et que son checksum enregistré est inchangé. Ne pas
   l'associer à `0026_school_page_drafts.sql`.
4. Produire et faire approuver la table de correspondance de tout l'historique.
5. Pour les quatre versions PRO-03 seulement, employer
   `supabase migration repair --status applied <version> --project-ref umcwwynrftidytxgqkwi`.
6. Ne lancer aucune commande qui applique le contenu SQL.
7. Relire l'historique distant et rerun les contrôles de parité.

Les commandes de l'étape 5 sont volontairement documentées mais n'ont pas été
exécutées pendant PRO-04.

## Rollback de la réconciliation d'historique

Si une version a été marquée par erreur, la correction porte seulement sur
l'historique avec `migration repair --status reverted` après validation de
l'état réel. Aucun rollback DDL B/C/D/gate ne doit être joué pour corriger une
erreur d'historique.

## Interdictions

- Ne pas rejouer les quatre migrations sur la production.
- Ne pas utiliser `db reset`, `db push` ou un apply automatique sur la production.
- Ne pas exécuter les lots de correction PRO-04 avec la réconciliation.
- Ne pas activer les invitations.
- Ne pas modifier une ligne métier.
