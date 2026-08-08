# 13 — Recommended Next Steps

Ce document propose un **ordre de travail**, pas une conception de solution : la façon exacte de résoudre chaque point revient à l'architecte produit/logiciel qui recevra ce dossier. Aucun développement n'a été commencé dans le cadre de cet audit.

## Blocage critique (avant toute autre décision)

1. **Reconstituer le schéma réel de Supabase** (TD-001) et le comparer à ce dépôt. Sans cette étape, toute estimation ou conception ultérieure repose sur des hypothèses non vérifiées.
2. **Vérifier en environnement réel si la mutation admin sur `establishments` fonctionne** (TD-002 / R-001). C'est la fonctionnalité qui détermine si l'équipe peut réellement administrer les écoles au quotidien.

## Avant beta (avec de vraies écoles)

3. Trancher le sort du bouton "Revendiquer cette page" (TD-003) : le construire réellement ou le retirer temporairement de l'interface.
4. Aligner la documentation produit sur le modèle de plans réellement implémenté (`forfait`, pas `plan_type`/`module_pro_actif`) (TD-013), pour que toute discussion future entre le fondateur et l'architecte parte de la même réalité.
5. Décider du sort de la table `pre_inscriptions` documentée mais jamais construite : garder `applications` tel quel, ou migrer vers le modèle avec code de suivi public.
6. Ajouter une limitation de fréquence sur le formulaire de préinscription public (R-005).
7. Documenter (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`) dans `.env.example` pour fiabiliser l'onboarding de tout nouveau développeur (R-003).
8. Corriger les points fonctionnels rapides et sans risque : lien de déconnexion enseignant (TD-010), bouton "Ajouter" et liens `#` de l'admin (`08_UX_UI_AUDIT.md`).
9. Mettre en place une configuration ESLint non interactive et un minimum de vérification automatisée avant chaque déploiement (TD-005).

## Pendant la beta

10. Suivre de près les échecs silencieux potentiels côté admin (voir R-001) — instrumenter au minimum l'affichage des erreurs Supabase réelles dans les formulaires d'administration, plutôt que des confirmations optimistes.
11. Ajouter un garde-fou anti-duplication sur l'onboarding école (vérifier qu'un `owner_id` ne possède pas déjà un établissement avant d'en créer un nouveau).
12. Planifier la mise à jour de Next.js vers une version corrigée des vulnérabilités identifiées (TD-004), testée hors production avant bascule.
13. Générer les types TypeScript depuis le schéma Supabase une fois celui-ci stabilisé (TD-008), pour réduire la dépendance à `any`.

## Après la beta

14. Construire réellement l'intégration de paiement Mobile Money si elle reste dans la feuille de route (actuellement à l'état de placeholder).
15. Concevoir le modèle de données et l'accès pour l'offre "Gérée" (accès délégué à l'équipe Écoles237, journal des modifications) — actuellement inexistant.
16. Réduire la duplication de code identifiée (composant Logo, logique d'upload) une fois le produit stabilisé fonctionnellement (TD-006, TD-007).
17. Ajouter un monitoring d'erreurs et de performance en production (aucun outil de ce type trouvé actuellement).

## Plus tard (roadmap explicitement hors sprint selon `CLAUDE_CONTEXT.md`, à reconfirmer avec le fondateur avant de s'y engager)

18. Module Pro complet incluant sections/responsables de section (structure organisationnelle multi-niveaux).
19. Extension nationale hors Douala/Yaoundé.
20. Volet institutionnel public (IPR/IPD).

---

**Ne pas commencer de développement à partir de ce document seul** : chaque point ci-dessus doit être repris et arbitré par l'architecte produit/logiciel avec le fondateur avant toute implémentation, notamment pour trancher les ambiguïtés listées dans `12_GAPS_AND_UNKNOWNS.md`.
