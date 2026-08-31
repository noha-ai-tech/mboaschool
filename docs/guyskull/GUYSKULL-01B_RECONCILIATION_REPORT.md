# GUYSKULL-01B RECONCILIATION REPORT

Date : 30 août 2026  
Périmètre : Git, contrat PUBLIC-SITE, migrations 0035/0036 et lectures production  
Projet production lu : Ecoles237, ref umcwwynrftidytxgqkwi  
Écritures Supabase : 0  
Migration rejouée : non  
Population Guyskull : non  
Déploiement / push : non

## GIT

Original working directory: C:\Users\User\Documents\mboaschool  
Original branch: integration/complete-school-platform  
Original HEAD: d2e4dfdfe5fb8b6512a9a861686f845916413429  
Original status: dirty ; modifications et fichiers non suivis préexistants conservés sans changement  
Remote origin: https://github.com/noha-ai-tech/mboaschool.git  
Fetch: réussi le 30 août 2026

Comparaison après fetch :

| Référence | HEAD |
|---|---|
| origin/integration/complete-school-platform | 15b8f4793a7256e2f98d9c96fa6f17b2e6280050 |
| origin/release/complete-platform-rc | 15b8f4793a7256e2f98d9c96fa6f17b2e6280050 |
| origin/feat/public-school-minisite-v1 | 6f83b87ca323c7311045c6d52ebbfdc102b5410d |
| Commit PUBLIC-SITE validé | 15b8f4793a7256e2f98d9c96fa6f17b2e6280050 |

Le HEAD original d2e4dfd ne contient pas 15b8f47. Il est le premier parent du merge PUBLIC-SITE ; l’audit GUYSKULL-01 avait donc été exécuté depuis le code antérieur à l’intégration.

Canonical branch: codex/guyskull-01b-reconciliation, basée sur origin/integration/complete-school-platform  
Canonical working directory: C:\Users\User\Documents\mboaschool\.tmp\guyskull-01b-worktree  
Canonical HEAD: 15b8f4793a7256e2f98d9c96fa6f17b2e6280050  
PUBLIC-SITE present: YES

Le worktree canonique ne contient aucune copie des anciens fichiers source. Seuls les deux livrables GUYSKULL-01 ont été recopiés dans docs/guyskull.

## DRIFT

Cause:

1. Dérive de branche confirmée : le checkout original précédait le merge PUBLIC-SITE.
2. Dérive de compatibilité encore réelle : le code PUBLIC-SITE canonique ne normalise pas les brouillons créés avant 0035.

Old payload found: YES

Le brouillon production Guyskull contient exactement :

- presentation
- contact
- hero_mode
- pricing
- infrastructure
- admissions
- sections
- gallery

Il ne contient pas key_numbers, results ni ranking.

Current payload:

Le contrat canonique SchoolPageDraftPayload exige onze domaines :

- les huit domaines historiques ;
- key_numbers ;
- ranking, dont la valeur peut être null ;
- results.

Support exact dans le code canonique :

| Capacité | Fichier / fonction |
|---|---|
| presentation.motto/history/mission/vision | src/lib/schoolPage/draftPayload.ts ; validatePresentation() dans src/app/api/school-page/draft/route.ts |
| key_numbers | SchoolPageDraftPayload ; buildLiveSnapshot() ; validateKeyNumbers() ; CMS établissement |
| ranking | buildLiveSnapshot() lit school_official_ranking ; validateRanking() ; MiniSiteRenderer |
| results | src/app/api/school-page/results/route.ts ; preview ; MiniSiteRenderer ; publish/discard SQL |
| event_date/event_start_time | src/app/api/school-page/news/route.ts ; CMS établissement ; AnnouncementsTab |
| rendu à cinq onglets | src/components/school/SchoolSiteHeader.tsx et MiniSiteRenderer.tsx |

Problème exact restant :

- GET /api/school-page/draft renvoie un brouillon existant tel quel.
- Il n’existe ni normaliseur ni backfill dans 0035.
- Le CMS accède directement à draftPayload.key_numbers.founding_year et aux autres champs key_numbers.
- publish_school_page() refuse un payload sans key_numbers et results.

Pour Guyskull, la branche canonique peut donc afficher le mini-site public, mais le contrat CMS Draft → Preview → Publish n’est pas sûr tant que le vieux brouillon n’est pas hydraté sans perte.

Resolved: PARTIAL

- Dérive Git : résolue dans le worktree propre.
- Compatibilité des vieux brouillons : non résolue.
- Aucune correction source n’a été faite, conformément à l’ordre de s’arrêter sur une différence réelle.

Correction minimale proposée, non implémentée :

1. Ajouter une fonction pure normalizeSchoolPageDraftPayload(existing, liveSnapshot).
2. Préserver toutes les valeurs historiques et toute clé reconnue déjà présente.
3. Ajouter seulement les clés absentes :
   - presentation.motto/history/mission/vision depuis les valeurs live ;
   - key_numbers depuis les valeurs live ;
   - ranking depuis school_official_ranking ou null ;
   - results.remove_ids = [].
4. Utiliser le normaliseur dans draft GET, preview et le chargement CMS.
5. Ne pas écrire en production lors d’un GET.
6. Le premier PATCH explicite peut enregistrer le payload normalisé, avec expected_updated_at.
7. Ajouter des tests ancien payload, payload courant, valeurs non écrasées et clés futures préservées.

## MIGRATIONS

0035 present: YES, exactement une fois  
Path: supabase/migrations/0035_school_page_identity_results_ranking.sql  
SHA-256: D61F7E7F52B08CE5132253D4DF045EE31DDFF0B109BD0433559FDC27A8194169

0035 matches production: YES pour l’état objet vérifiable

- Les colonnes identity/key numbers, les deux tables, contraintes, index, RLS, policies et ACL attendus sont présents.
- Le corps local et le corps production de publish_school_page() sont identiques :
  - MD5 prosrc : 12a57f1a054f183f51a1b160dad60de1
  - longueur : 15 883 caractères.
- Le corps local et le corps production de discard_school_page_draft() sont identiques :
  - MD5 prosrc : cee592255dd5744a59decf64b0f861c3
  - longueur : 2 786 caractères.
- touch_school_official_ranking_updated_at() correspond également :
  - MD5 prosrc : 9b1889f56258bf9d6554213c05019c76.

Limite de preuve : aucune entrée 0035 ni aucun statement contenant ces objets n’est enregistré dans supabase_migrations.schema_migrations. Le hash brut du fichier historiquement exécuté ne peut donc pas être prouvé ; seule la parité des objets et des corps de fonctions est démontrable.

0036 present: YES, exactement une fois  
Path: supabase/migrations/0036_school_announcements_event_date.sql  
SHA-256: A8AD44CA25FDF62204A98FA180CE0BA4F4C3352A49504F7E1F79CDFE8B1F7D16

0036 matches production: YES pour l’état objet vérifiable

- event_date : date, nullable, sans défaut, commentaire identique.
- event_start_time : time without time zone, nullable, sans défaut, commentaire identique.
- Les routes, le CMS et le rendu public lisent les deux colonnes.

Même limite : aucune entrée 0036 ni statement correspondant dans l’historique distant ; le hash du SQL historiquement exécuté n’est pas récupérable.

Reapplied: NO

## QUALITY

TypeScript: PASS

- npx tsc --noEmit --incremental false
- Code de sortie 0.

Build: PASS

- npm run build.
- Compilation, validation des types, 88 pages statiques et traces terminées avec code de sortie 0.
- Le premier lancement isolé manquait de configuration et d’accès à Google Fonts ; le build final a utilisé silencieusement la configuration locale existante, sans afficher de secret.

Tests: PASS

- node --test tests/*.test.mjs
- 125 tests, 125 réussis, 0 échec.
- Avertissements non bloquants : modules TypeScript rechargés comme ESM faute de type: module.
- La suite actuelle ne contient pas de test dédié au vieux payload PUBLIC-SITE ; cette lacune explique pourquoi l’incompatibilité n’est pas détectée automatiquement.

Vérification application :

- Page locale Guyskull avec données production : HTTP 200.
- Contenu significatif présent ; aucune erreur overlay.
- Les cinq libellés de navigation sont présents.
- Preview API sans session : HTTP 401 attendu, preuve que le gate d’authentification fonctionne ; aucun test authentifié n’a été lancé pour éviter toute création/mutation de brouillon.
- CMS sans session : HTTP 307 vers /auth/connexion, comportement attendu.
- Deux timeouts de l’optimiseur d’image ont été observés en développement vers l’image Storage ; la page est restée HTTP 200 et le DOM complet a été rendu.

## PRODUCTION COMPATIBILITY

key_numbers:

- Schéma production : présent sur establishments.
- Code canonique : lecture, draft, CMS et rendu présents.
- Une école production possède des chiffres clés.
- Guyskull : valeurs nulles et clé absente de son vieux brouillon.
- Compatibilité Guyskull CMS : FAIL tant que le payload n’est pas normalisé.

results:

- Trois lignes production, toutes live.
- Code canonique : route dédiée, preview, publication, abandon et rendu présents.
- Guyskull : aucune ligne et clé results absente du brouillon.
- Compatibilité Guyskull CMS : FAIL tant que le payload n’est pas normalisé.

ranking:

- Une ligne production.
- Code canonique : snapshot, validation, publication et rendu présents.
- Guyskull : aucune ligne et clé ranking absente du brouillon.
- Compatibilité Guyskull CMS : FAIL tant que le payload n’est pas normalisé.

event_date:

- Colonne production présente ; quatre annonces possèdent une date.
- Code canonique : lecture, validation, édition et rendu présents.
- Compatibilité : PASS.

event_start_time:

- Colonne production présente ; une annonce possède une heure.
- Code canonique : lecture, validation, édition et rendu présents.
- Compatibilité : PASS.

Writes performed: 0

## GUYSKULL

ID: a4cc4966-0d85-4c63-9c24-0538b8d5133b  
Current category: garderie

Evidence:

- La seule donnée catégorielle est establishments.main_category = garderie.
- sub_category et ownership_type sont null.
- Description : « hhhhhh », sans valeur probante.
- Aucun official_id, source_ministry, source_reference, source_url, source_updated_at ou registry_import_batch.
- Aucun establishment_registry_identifiers.
- Aucun enregistrement Guyskull ou lien vers Guyskull dans establishment_import_staging.
- Aucun niveau dans admissions_config.
- Aucune classe, section, pièce, résultat ou classement Guyskull.
- Le montant isolé de 29 000 FCFA ne permet pas d’inférer un cycle.

Correct category conclusion: E — UNKNOWN

La base classe actuellement Guyskull comme garderie, mais aucune source registre ou donnée académique ne permet de confirmer « garderie uniquement » ni d’établir maternelle/primaire, secondaire ou groupe scolaire.

Category change recommended: UNKNOWN

Ne pas modifier main_category avant obtention d’une preuve issue du propriétaire ou d’une source officielle.

## EXISTING 29,000 FCFA

Storage:

- Table : public.fees.
- Ligne : 2e03677c-db6b-4b70-98c0-a4e9ba34d9d5.
- Champ : tuition_fee.
- Devise : FCFA.
- Libellé applicatif actuel : Scolarité.
- academic_year : aucun champ.
- level/class : aucun champ.
- fréquence/période : aucun champ.

Meaning:

- La colonne signifie seulement « scolarité/tuition » dans le modèle actuel.
- Elle ne permet pas de savoir s’il s’agit d’un montant mensuel, annuel, par trimestre, par classe ou d’un autre rythme.
- Ce n’est pas registration_fee, qui est null.

Verified or unknown: UNKNOWN

Le montant doit être conservé, mais ne doit pas être présenté comme tarif officiel, annuel ou mensuel sans validation.

## PRICING CAPABILITY

| Besoin | Capacité actuelle |
|---|---|
| Class pricing | NO |
| Registration | YES, un montant unique par établissement |
| Tuition | YES, un montant unique sans période ni niveau |
| Total | NO |
| Installments | NO |
| Due dates | NO |
| Additional fees | PARTIAL : transport, cantine, uniforme, examen et other_fees agrégé |
| Mandatory/optional | NO |

## NEXT DATABASE CHANGE

0037 required: YES

Exact reason:

Le schéma public.fees ne peut pas représenter la grille demandée par classe/niveau, le total, les tranches, les échéances ni le caractère obligatoire/facultatif des frais complémentaires. Une évolution générique reste donc nécessaire pour un showcase complet ; les 29 000 FCFA doivent rester intacts comme donnée historique/fallback.

0037 ne doit toutefois pas être conçu comme la correction du vieux payload. La compatibilité 0035 doit d’abord être corrigée dans le code et testée sans DDL supplémentaire.

## VERDICT

CODE/PRODUCTION RECONCILED: NO

Le bon code a été retrouvé et isolé, et les objets 0035/0036 correspondent à la production. Le vieux brouillon Guyskull reste néanmoins incompatible avec le code canonique.

SAFE TO START GUYSKULL POPULATION: NO

SAFE TO DESIGN 0037 IF REQUIRED: NO

Le besoin fonctionnel de 0037 est confirmé, mais le gate immédiat est la normalisation non destructive des anciens payloads.

READY FOR GUYSKULL-02: NO

Prochaine étape minimale : revue et implémentation locale du normaliseur de payload avec tests, sans migration ni écriture production.
