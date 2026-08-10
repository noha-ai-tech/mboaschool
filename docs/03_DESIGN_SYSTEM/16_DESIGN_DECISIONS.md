# 16 — Design Decisions

Journal des décisions structurantes de cette mission, au format court
(décision → alternative écartée → raison). Objectif : qu'un futur
contributeur ne remette pas en question une décision sans connaître
l'arbitrage déjà fait — et puisse légitimement la renverser s'il a une
raison que ce document n'avait pas anticipée.

---

**DD-01 — Un seul vert de marque, pas une palette de verts**
Alternative écartée : garder `#007A3D` comme "vert secondaire" pour
certains contextes (Pro, enseignant).
Raison : aucune des 3 occurrences trouvées en audit ne portait de logique
métier distincte — c'était une dérive, pas une intention. Deux verts sans
règle de quand utiliser lequel créent plus de confusion que de nuance.

---

**DD-02 — Rouge/jaune de marque jamais utilisés comme couleurs
sémantiques**
Alternative écartée : réutiliser le rouge/jaune du drapeau pour
Danger/Warning (cohérence visuelle immédiate avec le logo).
Raison : un badge "Refusé" en rouge-drapeau pourrait se confondre avec un
élément strictement décoratif de marque (étoile, liseré) — séparer les
deux évite qu'un jour quelqu'un désactive une couleur "juste décorative"
sans réaliser qu'elle porte aussi un sens fonctionnel ailleurs.

---

**DD-03 — Manrope plutôt que Geist malgré la référence explicite à Vercel**
Alternative écartée : Geist, directement citée en inspiration par la
mission Design System V2 (Vercel).
Raison : Geist est conçue pour un public développeur/technique. Écoles237
s'adresse en premier lieu à des parents — le critère de choix n'est pas
"quelle police la marque de référence utilise" mais "quelle police sert le
public réel". Documenté explicitement pour qu'un futur relecteur ne pense
pas à un oubli.

---

**DD-04 — Dashboard "cockpit" plutôt que dashboard "inventaire"**
Alternative écartée : conserver l'approche actuelle (tout afficher, laisser
l'utilisateur filtrer visuellement lui-même).
Raison : le persona réel (directeur d'école entre deux réunions,
enseignant entre deux cours) n'a pas le temps de filtrer manuellement — le
produit doit prioriser à sa place. Un inventaire complet reste disponible
mais déplacé en Niveau 3 (`15_VISUAL_HIERARCHY.md`), jamais supprimé.

---

**DD-05 — Formulaires multi-étapes plutôt que formulaires longs à champ
réduit**
Alternative écartée : raccourcir les formulaires en supprimant des champs
(moins d'information collectée mais formulaire plus court).
Raison : chaque champ actuel des formulaires de préinscription/inscription
sert une fonction réelle du produit (déjà vérifié lors des missions
fonctionnelles correspondantes) — le problème n'est pas le volume
d'information demandé, c'est sa présentation d'un bloc. Le découpage en
étapes résout la perception de charge sans perte fonctionnelle.

---

**DD-06 — Un composant Sidebar unique paramétré par rôle, pas 4
implémentations spécialisées**
Alternative écartée : garder 4 sidebars séparées mais les harmoniser
visuellement sans les fusionner en un seul composant.
Raison : l'harmonisation visuelle sans fusion technique se dégraderait à
nouveau à la première mission qui touche un seul des 4 layouts sans
penser aux 3 autres — exactement le mécanisme qui a produit l'incohérence
actuelle (chaque sidebar a été écrite indépendamment, à des moments
différents de la session).

---

**DD-07 — Recherche à 1 champ par défaut, filtres avancés en second
niveau**
Alternative écartée : conserver le formulaire de recherche complet
(4 champs) visible par défaut, jugé "plus puissant".
Raison : la puissance d'un filtre ne sert à rien si son coût cognitif
dissuade l'usage avant même la première recherche. Les filtres avancés
restent entièrement disponibles, seulement révélés après la première
interaction plutôt qu'imposés avant.

---

**DD-08 — Onglets plutôt que scroll long sur la fiche école**
Alternative écartée : garder une page longue mais ajouter une table des
matières collante en haut (ancre de navigation).
Raison : une table des matières règle la navigation mais pas la charge
visuelle initiale (600+ lignes restent chargées au même moment) — les
onglets réduisent le volume réellement rendu à l'écran à un instant donné,
ce qu'une ancre ne fait pas.

---

**DD-09 — Score cible 95, pas 100**
Voir `13_UX_IMPROVEMENT_PLAN.md` §"Pourquoi 95, pas 100". Rappelé ici car
c'est la décision qui encadre toutes les autres : ce document accepte des
compromis assumés plutôt que de prétendre à une perfection qui masquerait
de vrais arbitrages sous couvert de "score parfait".

---

**DD-10 — Aucune illustration custom introduite**
Alternative écartée : commander/générer des illustrations de marque pour
les états vides et l'onboarding (renforcerait l'identité "premium").
Raison : reporté sciemment (voir `09_BRANDING.md` et `10_UI_ROADMAP.md`) —
un état vide bien écrit et bien structuré (icône Lucide + message clair +
action) atteint déjà le niveau de qualité visé sans dépendance à un budget
design supplémentaire non confirmé à ce stade.
