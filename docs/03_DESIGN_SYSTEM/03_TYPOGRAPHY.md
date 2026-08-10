# 03 — Typography

## Comparatif

| Police | Poids disponibles | Caractère | Intégration Next.js | Risque |
|---|---|---|---|---|
| **Inter** | 100–900 | Neutre, très lisible, devenue la police par défaut de facto de tout le SaaS depuis 2020 | `next/font/google`, zéro configuration | Générique — "encore un site en Inter" |
| **Geist** | 100–900 | Très technique, froid, minimal — l'identité visuelle de Vercel elle-même | `next/font/google` (depuis son ajout à Google Fonts) | Trop associée à une seule marque (Vercel) ; froideur peu adaptée à un public grand public parent/élève |
| **Plus Jakarta Sans** | 200–800 | Géométrique, chaleureux, arrondis doux | `next/font/google`, zéro configuration | Très proche de Manrope — différenciateur plus faible |
| **Satoshi** | 300–900 (+variable) | Distinctive, premium, très utilisée par les produits "indie SaaS" haut de gamme | Fontshare uniquement — pas sur Google Fonts, hébergement manuel via `next/font/local` (fichiers à télécharger et committer) | Licence Fontshare gratuite en usage commercial (vérifié), mais coût opérationnel : pas d'auto-hébergement Google, mises à jour manuelles |
| **Manrope** | 200–800 | Géométrique, chaleureux, excellent poids ExtraBold (800) très marqué — proche de l'esprit "wordmark" du logo | `next/font/google`, zéro configuration, variable font | Aucun identifié pour ce produit |

## Recommandation : **Manrope**

### Justification

1. **Le produit utilise déjà massivement `font-black` (900) sur ses titres**
   (confirmé par l'audit Phase 1 — quasiment chaque `<h1>`/`<h2>` du dépôt).
   Il faut donc une police dont le poids le plus fort est réellement
   dessiné pour être un poids d'affichage, pas une simple interpolation
   automatique. Le 800 (ExtraBold) de Manrope est dessiné à la main par
   la fonderie — contrairement à beaucoup de polices variables où les
   poids extrêmes sont interpolés et perdent en qualité.
2. **Chaleur sans perdre le sérieux.** Écoles237 s'adresse à la fois à des
   parents (contexte grand public, besoin de chaleur/confiance) et à des
   directeurs/comptables (contexte professionnel, besoin de sérieux).
   Geist est trop froide/technique pour le premier public ; Inter est
   neutre mais n'apporte aucune personnalité de marque. Manrope tient les
   deux rôles.
3. **Zéro coût d'intégration.** Disponible directement via
   `next/font/google`, avec sous-ensemble Latin Extended couvrant tous les
   caractères français (é, è, à, ç, œ) sans configuration supplémentaire —
   contrairement à Satoshi qui demanderait un hébergement de fichiers
   manuel, un coût opérationnel non justifié ici.
4. **Différenciation de marque.** Manrope reste nettement moins utilisée
   qu'Inter dans le SaaS actuel — la police contribue donc à une identité
   reconnaissable plutôt qu'à un rendu "produit SaaS générique".

### Alternative de secours

Si Manrope devait poser un problème non anticipé (rendu, licence, préférence
de l'architecte) : **Plus Jakarta Sans** est le remplaçant direct — même
famille d'esprit géométrique/chaleureux, même facilité d'intégration.

## Échelle typographique

| Rôle | Taille | Line-height | Poids | Usage |
|---|---|---|---|---|
| Display | 40px / 2.5rem | 1.1 | 800 (ExtraBold) | Titre de page marketing (accueil, landing) |
| H1 | 32px / 2rem | 1.15 | 800 | Titre de page dashboard |
| H2 | 24px / 1.5rem | 1.2 | 700 (Bold) | Titre de section |
| H3 | 18px / 1.125rem | 1.3 | 700 | Titre de carte, sous-section |
| Body Large | 16px / 1rem | 1.5 | 500 (Medium) | Corps de texte principal |
| Body | 14px / 0.875rem | 1.5 | 400/500 | Texte courant, formulaires |
| Small | 13px / 0.8125rem | 1.4 | 500 | Métadonnées, légendes |
| Caption | 11px / 0.6875rem | 1.3 | 600 (SemiBold), tracking large | Labels de champ (uppercase), badges |

## Règles d'usage

- Jamais plus de 3 poids différents visibles sur un même écran (ex. 800 pour
  le titre, 500 pour le corps, 600 pour les labels — pas de 400/500/600/700
  mélangés sans raison).
- Les majuscules (`uppercase`) sont réservées aux labels/captions
  (`tracking-wider`, 11px) — jamais aux titres.
- `font-black` (900) disparaît de l'usage courant : remplacé par 800
  (ExtraBold, disponible chez Manrope) qui rend mieux et évite l'effet
  "faux gras" que Tailwind produit avec certaines polices système.
