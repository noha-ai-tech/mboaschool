# PRO-05.3 — Auth password protection application readiness

Date : 2026-08-26  
Branche de travail constatée : `integration/complete-school-platform`

## Implémentation locale

- `weak_password` et `AuthWeakPasswordError` sont convertis en un message
  utilisateur français contrôlé lors de l'inscription et de la mise à jour du
  mot de passe. Aucun message brut du fournisseur n'est affiché.
- La connexion lit le signal réellement exposé par le SDK installé,
  `data.weakPassword`. La connexion reste réussie, mais la redirection attend
  que l'utilisateur ait vu l'avertissement de sécurité.
- La demande de récupération redirige vers
  `/auth/reinitialiser-mot-de-passe`.
- La nouvelle page n'ouvre le formulaire qu'après `PASSWORD_RECOVERY`, ou
  après `INITIAL_SESSION` accompagné du marqueur éphémère créé par cet
  événement dans le même onglet.
- Les paramètres et fragments Auth sont retirés de l'URL après traitement.
- Le formulaire valide la confirmation et la longueur minimale, puis appelle
  exclusivement `supabase.auth.updateUser({ password })`.
- Le marqueur de récupération est supprimé sur erreur terminale, expiration
  locale et succès.
- Le texte d'inscription ne demande plus une confirmation email alors que la
  production utilise l'auto-confirmation.

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| Tests PRO-05.3 ciblés | PASS — 8/8 |
| Tests PRO-03 | PASS — 72/72 |
| Tests PRO-05 complets | PASS — 30/30 |
| Tests PRO-04 | PASS — 31/31 |
| TypeScript `--noEmit --incremental false` | PASS |
| Lint ciblé | PASS — aucune erreur ou alerte |
| Lint global | FAIL — cinq erreurs `react/no-unescaped-entities` préexistantes hors lot |
| Build | PASS — `npm run build`, 88/88 pages, collecte des traces et code de sortie 0 |
| Suite complète PRO-03/04/05 | PASS — 133/133 |

Le serveur `next dev` local qui écrivait simultanément dans `.next` a été
arrêté. Pour la validation finale, seul le cache `.next` a été supprimé avant
le build complet.

Les checksums PRO-04 normalisent désormais explicitement CRLF et LF vers LF,
refusent les caractères CR isolés et conservent les SHA historiques attendus.
Les copies SQL proposées et exécutées restent comparées directement et les
31 contrôles PRO-04 passent.

La migration PRO-05.2 manquante a été réconciliée localement depuis l'unique
statement distant sous
`supabase/migrations/20260825054125_pro_05_2_admission_tracking_hardening.sql`.
Sa parité normalisée et exacte est attestée par le SHA-256
`7dcf54518fa3a5b49acda52707f9130a0aab9e3e351c9f6379f9de10cbfbdbba`.

## État distant

- Configuration Supabase Auth modifiée : **NON**
- Protection contre les mots de passe compromis activée : **NON**
- Migration exécutée : **NON**
- Écriture base de données : **0**
- Push ou déploiement : **NON**

## Décision

`READY FOR STAGING AUTH TESTS: YES`

`READY TO ACTIVATE: NO` — attendre les tests Auth en staging et la décision
explicite d'activation de la configuration Supabase Auth.
