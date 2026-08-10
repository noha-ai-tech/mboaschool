# 11 — UX Audit

Analyse à froid des 12 écrans, en pensant tour à tour comme un parent qui
cherche une école un soir sur son téléphone, un directeur qui ouvre son
dashboard entre deux réunions, un enseignant qui consulte son espace entre
deux cours, et un administrateur Écoles237 qui traite une file de demandes.
Aucun code n'a été modifié pour produire ce document.

Chaque écran est noté sur 100 selon 5 critères (20 points chacun) : clarté
de l'objectif, charge cognitive, hiérarchie visuelle, vitesse de
compréhension, absence de friction inutile.

---

## 1. Landing Page (`/`)

**Ce qui est trop chargé** : le header combine logo + navigation par
catégories (avec méga-menu au survol) + 2 CTA (Connexion / Inscrire mon
école) — 4 zones de décision avant que l'utilisateur ait vu un seul
résultat. Le formulaire de recherche du hero contient **6 éléments
interactifs** (champ texte, catégorie, ville, rayon, géolocalisation,
bouton rechercher) empilés verticalement — c'est un formulaire de filtre
avancé déguisé en recherche rapide.

**Ce qui est redondant** : le bouton "Inscrire mon école" apparaît dans le
header ET rappelé plus loin dans la page (repéré dans le footer et une
section dédiée) — au moins 3 occurrences du même CTA sur un seul scroll.

**Ce qui n'est jamais utilisé** : le sélecteur de "rayon de recherche" (2/5/
10/20 km) suppose une géolocalisation que la majorité des visiteurs
n'activeront jamais au premier chargement — un champ configuré par défaut
sans qu'on sache s'il est réellement consulté.

**Ce qui manque** : aucune preuve sociale visible immédiatement (nombre
d'écoles réel, témoignage) au-dessus de la ligne de flottaison — seul un
badge "Plateforme éducative · Cameroun" générique.

**Ce qui ralentit la compréhension** : la carte de recherche utilise un
dégradé décoratif rouge/jaune très saturé autour d'un formulaire déjà
chargé — la couleur attire l'œil vers la bordure plutôt que vers le champ
de saisie lui-même.

**Score UX actuel : 58/100**

---

## 2. Navigation (header global)

**Ce qui est trop chargé** : méga-menu à 2 niveaux (catégorie → sous-
catégorie) déclenché au survol — inutilisable au tactile sans un clic
supplémentaire non évident (le survol n'existe pas sur mobile/tablette,
seule cible réelle du produit).

**Ce qui est redondant** : "Tous" + chaque catégorie + leurs sous-
catégories créent une arborescence de navigation à 3 niveaux pour un
produit qui n'a que 5 catégories principales — complexité disproportionnée
par rapport au volume réel de contenu.

**Ce qui manque** : aucune recherche globale accessible depuis la
navigation elle-même (`Cmd/Ctrl+K`, déjà recommandé en `04_COMPONENTS.md`)
— il faut redescendre au hero pour chercher, même depuis une page de
résultats.

**Score UX actuel : 62/100**

---

## 3. Sidebar (dashboards)

**Ce qui est redondant** : 4 implémentations quasi identiques (admin,
école, pro, enseignant) — chacune réinvente sa propre logique de largeur,
d'espacement, de comportement mobile (confirmé par l'audit Design System,
`04_COMPONENTS.md`).

**Ce qui manque** : aucun indicateur de notification/compteur sur les
items de navigation (ex. "Admissions" ne montre jamais combien sont en
attente directement dans le menu — il faut cliquer pour savoir).

**Ce qui ralentit la compréhension** : la sidebar École a 4 groupes non
labellisés visuellement de façon hiérarchique clairement différente du
contenu — les libellés de groupe ("Gestion", "Contenu", "Pilotage") sont
plus discrets que les items eux-mêmes, inversant l'ordre naturel de
lecture attendu.

**Score UX actuel : 64/100**

---

## 4. Dashboard École (écran le plus utilisé du produit)

**Ce qui est trop chargé** : la page combine KPI + checklist de complétion
de profil + liste des dernières préinscriptions + panneau classes — 4
widgets de nature différente sur un seul écran, sans priorité visuelle
claire entre "ce qu'il faut faire maintenant" et "ce qui est informatif".

**Ce qui est redondant** : la checklist de complétion de profil concerne
un directeur qui vient de s'inscrire — elle reste pourtant visible en
permanence même une fois l'école entièrement configurée à 100%, occupant
un espace qui pourrait revenir aux vraies priorités du jour.

**Ce qui manque** : aucune hiérarchisation par urgence — une admission
reçue il y a 10 minutes a la même importance visuelle qu'une reçue il y a
3 semaines. Pas de "quoi faire en premier" explicite.

**Ce qui peut être remplacé par une meilleure visualisation** : les 4
StatCard sont des nombres statiques sans tendance — un directeur ne sait
pas si "12 admissions" est une bonne ou une mauvaise nouvelle par rapport
au mois dernier.

**Score UX actuel : 61/100**

---

## 5. Annuaire (catégories + résultats)

**Ce qui est trop chargé** : résultats groupés par sous-catégorie avec
répétition du header de filtre à chaque section — sur une recherche large,
l'utilisateur revoit les mêmes contrôles de tri plusieurs fois en scrollant.

**Ce qui manque** : aucune vue "carte" combinée aux résultats sur la page
de catégorie elle-même (la carte existe uniquement au hero de l'accueil) —
un parent qui filtre par ville doit deviner la proximité réelle à partir
du texte seul.

**Ce qui ralentit la compréhension** : les badges "Vérifié"/"Pro"/
"Sponsorisé" utilisent des styles visuels proches (bordure + petite icône)
sans hiérarchie claire de ce qui compte le plus pour un parent qui choisit
une école.

**Score UX actuel : 66/100**

---

## 6. Fiche école

**Ce qui est trop chargé** : page très longue (confirmée par l'audit —
plus de 600 lignes de JSX) mêlant description, infrastructures, frais,
classes, annonces, galerie, CTA de préinscription répété à plusieurs
endroits — un parent pressé doit scroller beaucoup avant d'arriver à une
décision.

**Ce qui est redondant** : le CTA "Préinscrire mon enfant" apparaît à la
fois dans la sidebar sticky ET en bloc de section plus bas — cohérent avec
le principe "une action principale" seulement si l'un des deux disparaît.

**Ce qui manque** : aucun résumé "en 3 secondes" en haut de page (niveau,
prix indicatif, distance, statut vérifié) avant le contenu détaillé — tout
est au même niveau d'importance visuelle.

**Score UX actuel : 63/100**

---

## 7. Préinscription

**Ce qui est trop chargé** : formulaire long en une seule page (école,
année scolaire, parent ×3 champs, enfant ×6 champs, message) sans
découpage par étapes — un parent sur mobile voit un mur de champs d'un
coup.

**Ce qui manque** : aucune indication de progression ("étape 2 sur 3") ni
d'estimation de durée avant de commencer — augmente la perception d'effort
avant même de remplir le premier champ.

**Ce qui ralentit la compréhension** : le champ "Âge" et "Date de
naissance" coexistent avec un texte d'aide ("optionnel si..."), signe
qu'un seul des deux champs devrait exister.

**Score UX actuel : 67/100** (déjà le mieux noté des formulaires — champ
unique par ligne, message de succès clair avec code de suivi bien mis en
avant)

---

## 8. Connexion

**Ce qui est trop chargé** : rien à retirer — écran déjà minimal (panneau
image + 2 champs + 1 CTA). Le seul point négatif est le manque de
différenciation visuelle claire entre "mot de passe oublié" et le CTA
principal, tous deux en texte de taille proche.

**Score UX actuel : 82/100** — l'écran le mieux noté de l'audit, à
utiliser comme référence de sobriété pour les autres.

---

## 9. Inscription

**Ce qui est trop chargé** : formulaire d'inscription établissement en une
seule page avec de nombreux champs (identité + établissement + mot de
passe) sans étapes, contrairement à ce que la longueur du formulaire
justifierait.

**Ce qui manque** : aucune indication de ce qui se passe après
l'inscription (l'utilisateur ne sait pas qu'il devra ensuite "revendiquer"
ou "vérifier" son établissement — surprise potentielle après coup).

**Score UX actuel : 68/100**

---

## 10. Administration (Platform Operating Center)

**Ce qui est trop chargé** : jusqu'à 8 StatCards sur la vue d'ensemble
(confirmé lors de la construction, Mission 08) — dépasse largement la
limite de 4 recommandée pour qu'une information ressorte réellement (voir
`05_LAYOUT.md`).

**Ce qui est redondant** : 3 pages distinctes (Vue d'ensemble, Écoles,
Statistiques) affichent chacune un sous-ensemble différent des mêmes
compteurs d'établissements — un administrateur doit deviner laquelle
consulter selon la question qu'il se pose.

**Ce qui manque** : aucune vue "aujourd'hui" consolidée (nouvelles
demandes + tickets + admins à traiter) — l'information prioritaire est
dispersée sur 6 pages différentes de la sidebar.

**Score UX actuel : 59/100**

---

## 11. Module Pro

**Ce qui est trop chargé** : sidebar/nav à 12 entrées à plat (Personnel,
Emplois du temps, Matières, Salles, Contraintes EDT, Kiosque, Historique,
Remplacements, Absences, Paie, Enseignants, Messagerie) sans regroupement
— la plus longue liste de navigation du produit, sans hiérarchie.

**Ce qui est redondant** : "Enseignants" apparaît à la fois dans le module
Pro et dans le Dashboard École (avec verrouillage si non-Pro) — deux
points d'entrée pour la même destination selon le contexte.

**Ce qui manque** : aucune vue d'ensemble/accueil du module Pro lui-même —
on atterrit directement sur "Personnel" par défaut sans écran de synthèse
propre au module.

**Score UX actuel : 57/100** — le moins bien noté, cohérent avec le fait
que ce module a grandi mission après mission sans jamais de passe de
consolidation.

---

## 12. Espace Enseignant

**Ce qui est bien fait** : structure en onglets par ancre (emploi du
temps, classes, documents, notifications, salaire) sur une seule page,
pensé mobile — cohérent avec l'usage réel (consultation entre deux cours).

**Ce qui manque** : aucun résumé "aujourd'hui" en haut de page (prochain
cours, dernière présence pointée) — l'enseignant doit naviguer vers l'onglet
emploi du temps pour savoir où il doit être ensuite, alors que c'est
probablement l'information la plus consultée.

**Ce qui ralentit la compréhension** : sections "Mon profil" et "Mes
notifications" existent comme placeholders visuellement identiques aux
sections fonctionnelles — impossible de distinguer au premier regard ce
qui est réellement utilisable.

**Score UX actuel : 65/100**

---

## Synthèse des scores

| Écran | Score |
|---|---|
| Connexion | 82 |
| Préinscription | 67 |
| Inscription | 68 |
| Annuaire | 66 |
| Espace Enseignant | 65 |
| Fiche école | 63 |
| Sidebar | 64 |
| Dashboard École | 61 |
| Navigation | 62 |
| Administration | 59 |
| Module Pro | 57 |
| Landing Page | 58 |
| **Moyenne** | **64,3/100** |

Le plan pour atteindre 95+/100 par écran est détaillé dans
`13_UX_IMPROVEMENT_PLAN.md`, à partir des recommandations détaillées de
`12_SCREEN_BLUEPRINTS.md`.
