# 04 — Fiche école (`src/app/ecole/[id]/page.tsx` + `layout.tsx`)

Détail par élément demandé par la mission. Constats transverses (SEO, performance, accessibilité, responsive)
détaillés dans les documents dédiés.

---

## ✔ Galerie / Photos

Onglet dédié (`GalerieTab`), alimenté par `school_images`. Fonctionnel. Aucun traitement d'image côté serveur à
l'upload (voir `06_PERFORMANCE.md` §1) — une photo lourde uploadée par une école reste lourde sur la fiche
publique.

## ✔ Logo

`logo_url` existe en base (`schema.sql`) mais n'a pas été identifié comme affiché dans la portion de code lue
pour cet audit — l'identité visuelle affichée (`emoji_logo`, couleurs) provient des colonnes **[DÉRIVE]** non
versionnées (`couleur_primaire`, `couleur_secondaire`, `emoji_logo`), pas d'un vrai logo d'établissement. À
confirmer : aucune école du seed n'a de `logo_url` réel, le produit affiche donc aujourd'hui un emoji générique à
la place d'un logo pour chaque établissement.

## ✔ Description

Affichée dans l'onglet Général. `generateMetadata` (`layout.tsx`) tronque intelligemment à 155 caractères pour la
meta description — bonne pratique SEO déjà en place.

## ✔ Coordonnées / Contact

Téléphone affiché avec lien WhatsApp direct (`wa.me/${phone}`) — bon point pour le marché camerounais où
WhatsApp est un canal de contact dominant. `email`, `website`, `whatsapp` (colonne dédiée distincte du
téléphone) existent en base mais leur affichage n'a pas été confirmé dans la portion de code inspectée pour cet
audit — à vérifier.

## ✔ Localisation

`city`, `neighborhood`/`quartier` affichés. Pas de carte Leaflet intégrée directement sur la fiche école
elle-même (la carte n'existe que dans la modale de recherche géolocalisée de la page d'accueil) — un visiteur
consultant une fiche école ne peut pas visualiser sa position sur une carte depuis cette page, seulement lire
l'adresse textuelle. Absence à noter, pas nécessairement un défaut si le choix est volontaire.

## ✔ Infrastructures

Onglet Général, mapping complet des 10 booléens de la table `infrastructures` vers des libellés + icônes
(`INFRA_LABELS`) — implémentation complète et cohérente avec le schéma réel.

## ✔ Frais

Mapping complet des 7 colonnes de `fees` (`FEE_COLS`) — implémentation complète.

## ✔ Contacts

Voir "Coordonnées" ci-dessus.

## ✔ CTA

"Préinscrire mon enfant" → `/preinscription?ecole=${school.id}` — cohérent, bien mis en avant dans la barre
latérale sticky. Bouton WhatsApp — cohérent.

## ✔ Préinscription

Le lien pointe vers `/preinscription`, qui écrit dans la table `applications` (déjà documenté dans l'audit
précédent, `docs/00_CURRENT_STATE_AUDIT/03_FEATURE_STATUS.md`) — hors périmètre de cette mission (le formulaire
de préinscription lui-même n'est pas une page de l'annuaire au sens strict, mais le lien d'entrée depuis la fiche
école est bien dans le périmètre et fonctionne).

## ✔ Responsive

Voir `07_RESPONSIVE.md` §3. Point d'attention : bascule probable de la grille contenu/barre latérale en une
seule colonne sous 1024px, plaçant potentiellement le CTA de préinscription plus bas dans la page sur mobile — à
confirmer visuellement.

## ✔ SEO

Voir `05_SEO.md`. Résumé spécifique à cette page : **seule page de l'annuaire avec un titre et une description
vraiment dynamiques** (`generateMetadata` dans `layout.tsx`) — le meilleur point SEO de tout l'annuaire actuel.
Manques : pas d'image OpenGraph (alors que `cover_image_url`/`school_images` existent et seraient l'image
naturelle), pas de canonical, pas de JSON-LD `EducationalOrganization`, URL basée sur un UUID plutôt que sur la
colonne `slug` déjà présente en base.

## ✔ Schema.org

**Absent.** Voir `05_SEO.md` §7 — cible naturelle non exploitée pour cette page précisément (une fiche
établissement est le cas d'usage canonique de `EducationalOrganization`).

## ✔ Canonical

**Absent.** Voir `05_SEO.md` §6.

---

## Onglets — sémantique et contenu

Cinq onglets (`Général`, `Galerie`, `Documents`, `Annonces`, `Espace parent`) commutés en client-side (`activeTab`
state), sans rôle ARIA (voir `08_ACCESSIBILITY.md` §3). L'onglet "Espace parent" est un écran d'annonce de
fonctionnalité future, pas un vrai espace (déjà documenté dans l'audit précédent,
`docs/00_CURRENT_STATE_AUDIT/03_FEATURE_STATUS.md`) — confirmé toujours vrai, présent sur la page auditée ici.

## Données

- `school.subscription_plan === "premium"` affiche un badge "Premium" — jamais mis à jour par un flux de
  paiement réel (déjà documenté), badge potentiellement trompeur si activé manuellement sans lien avec un
  paiement effectif.
- Photos de secours (`PLACEHOLDER`, image Unsplash) utilisées quand `cover_image_url` est absent — mélange de
  vraies photos et de photos stock sans distinction visuelle claire pour le visiteur.
