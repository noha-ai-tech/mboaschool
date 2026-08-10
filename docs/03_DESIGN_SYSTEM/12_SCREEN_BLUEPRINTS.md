# 12 — Screen Blueprints

Spécification prescriptive des 12 écrans, en réponse directe au diagnostic
de `11_UX_AUDIT.md`. Chaque écran suit la même structure en 10 points.
Aucun de ces blueprints n'est implémenté par cette mission.

---

## 1. Landing Page

1. **Objectif** : convertir un visiteur en recherche active en moins de 10
   secondes — trouver une école, pas explorer un site vitrine.
2. **Temps de compréhension estimé** : 8s actuellement → cible 3s.
3. **Infos réellement importantes** : champ de recherche unique, catégories
   principales, preuve de confiance (nombre d'écoles réel).
4. **Infos secondaires** : rayon de recherche, géolocalisation, sous-
   catégories, contenu marketing bas de page.
5. **À supprimer** : le méga-menu à 2 niveaux ; la répétition du CTA
   "Inscrire mon école" au-delà de 2 occurrences (header + un seul rappel
   bas de page).
6. **À fusionner** : rayon + géolocalisation deviennent une seule option
   "Près de moi" (bouton, pas 2 contrôles séparés) qui active
   automatiquement un rayon par défaut.
7. **À déplacer** : catégorie et ville passent de champs de formulaire à
   des raccourcis visuels (chips cliquables) sous le champ de recherche
   principal — la recherche reste un champ unique par défaut.
8. **Nouvelle hiérarchie visuelle** : (1) champ de recherche seul, gros,
   centré ; (2) 5 chips de catégorie ; (3) résultats immédiatement en
   dessous, sans configuration préalable obligatoire.
9. **Interactions** : recherche en `debounce` 300ms avec résultats qui
   apparaissent sans rechargement (`card reveal`, voir `06_MOTION.md`) ;
   pas de bouton "Rechercher" nécessaire pour une saisie texte simple.
10. **Justification UX** : réduire de 6 à 1 le nombre de décisions avant le
    premier résultat visible respecte directement la règle "action
    principale unique" et "3 secondes" du brief — un formulaire de filtre
    complet reste disponible mais en second niveau, jamais imposé.

---

## 2. Navigation

1. **Objectif** : permettre d'atteindre n'importe quelle catégorie ou
   fonction produit en 1 clic, sans dépendre du survol.
2. **Temps de compréhension estimé** : 5s → cible 2s.
3. **Infos importantes** : 5 catégories principales, connexion/inscription.
4. **Infos secondaires** : sous-catégories.
5. **À supprimer** : le déclenchement au survol (`group-hover`) comme seul
   mécanisme d'ouverture.
6. **À fusionner** : sous-catégories déplacées dans la page de catégorie
   elle-même (filtre latéral) plutôt que dans la navigation globale.
7. **À déplacer** : ajout d'une recherche globale (`Cmd/Ctrl+K`) dans la
   navigation, cohérent avec `04_COMPONENTS.md` §SearchBar.
8. **Nouvelle hiérarchie** : logo → 5 catégories à plat (clic direct, plus
   de sous-menu) → recherche → connexion/inscription.
9. **Interactions** : clic direct vers la page de catégorie ; la
   navigation ne porte plus la responsabilité du filtrage fin.
10. **Justification UX** : le survol est structurellement inaccessible au
    tactile (majorité du trafic, voir `07_RESPONSIVE.md`) — une navigation
    premium ne peut pas dépendre d'une interaction indisponible sur son
    public principal.

---

## 3. Sidebar

1. **Objectif** : donner accès à toutes les fonctions du rôle courant sans
   jamais faire deviner où se trouve quelque chose.
2. **Temps de compréhension estimé** : 6s → cible 3s.
3. **Infos importantes** : items de navigation avec compteur si action
   requise (ex. "Admissions · 3").
4. **Infos secondaires** : libellés de groupe, informations de compte.
5. **À supprimer** : rien à supprimer — le problème est la duplication de
   la structure entre 4 layouts, pas le contenu lui-même.
6. **À fusionner** : les 4 implémentations deviennent un seul composant
   `Sidebar` paramétré par rôle (voir `10_UI_ROADMAP.md` Étape 1).
7. **À déplacer** : les libellés de groupe passent en position sticky au
   scroll pour les longues listes (Module Pro, 12 items).
8. **Nouvelle hiérarchie** : items actifs avec fond Primary Light plus
   marqué qu'aujourd'hui ; badges de compteur en `Danger`/`Warning` pour
   ce qui nécessite une action.
9. **Interactions** : transition douce (`motion-fast`) sur l'item actif,
   tiroir mobile avec `Drawer` standard plutôt que 3 implémentations
   séparées.
10. **Justification UX** : une sidebar cohérente réduit la charge
    d'apprentissage quand un utilisateur bascule entre rôles (ex. un
    directeur qui a aussi accès au module Pro) — actuellement, chaque
    bascule impose de ré-apprendre une structure légèrement différente.

---

## 4. Dashboard École

1. **Objectif** : répondre à "est-ce que tout va bien, et qu'est-ce que je
   dois faire aujourd'hui ?" en 5 secondes.
2. **Temps de compréhension estimé** : 12s → cible 5s.
3. **Infos importantes** : ce qui nécessite une action aujourd'hui
   (admissions non traitées, ticket ouvert) — pas un inventaire complet.
4. **Infos secondaires** : complétion du profil, classes, statistiques
   générales.
5. **À supprimer** : la checklist de complétion de profil une fois à 100%
   — elle ne réapparaît que si un champ redevient incomplet.
6. **À fusionner** : admissions + tickets + rappels CRM en une seule liste
   "à traiter" triée par urgence, plutôt que 3 blocs séparés.
7. **À déplacer** : statistiques générales (courbe de croissance, etc.)
   vers la page Statistiques dédiée, déjà existante — le dashboard
   d'accueil n'en garde qu'un résumé d'une ligne.
8. **Nouvelle hiérarchie** : (1) liste "à traiter aujourd'hui" en position
   dominante ; (2) 3-4 StatCard avec tendance (`↑12% vs mois dernier`) ;
   (3) accès rapide aux modules (Personnel, Emplois du temps) en bas.
9. **Interactions** : chaque item de la liste "à traiter" s'ouvre en
   `Drawer` (action rapide) sans quitter le dashboard.
10. **Justification UX** : conforme au principe "cockpit, pas ERP"
    (`05_LAYOUT.md`) — un directeur qui ouvre son dashboard entre deux
    réunions doit repartir avec une décision prise, pas une liste à
    mémoriser pour plus tard.

---

## 5. Annuaire

1. **Objectif** : filtrer une liste d'écoles jusqu'à un choix restreint
   (3-5 candidates) le plus vite possible.
2. **Temps de compréhension estimé** : 10s → cible 4s.
3. **Infos importantes** : nom, ville/distance, niveau, statut vérifié,
   photo.
4. **Infos secondaires** : sous-catégorie détaillée, date de référencement.
5. **À supprimer** : répétition du bandeau de filtre à chaque groupe de
   sous-catégorie sur une même page de résultats.
6. **À fusionner** : filtre de tri en un seul contrôle sticky en haut de
   liste, jamais répété.
7. **À déplacer** : carte interactive intégrée à côté des résultats
   (layout 2 colonnes desktop, bascule onglet Liste/Carte en mobile) —
   actuellement uniquement disponible sur l'accueil.
8. **Nouvelle hiérarchie** : badge "Vérifié" toujours le plus visible des
   3 (Vérifié > Pro > Sponsorisé), cohérent avec ce qui importe réellement
   à un parent (confiance avant fonctionnalités).
9. **Interactions** : survol carte = highlight du marqueur carte
   correspondant et inversement (pattern standard "liste + carte").
10. **Justification UX** : une carte est objectivement une meilleure
    visualisation qu'une liste de noms de villes pour une décision fondée
    sur la proximité géographique — règle "pas de tableau géant si une
    visualisation est meilleure" du brief.

---

## 6. Fiche école

1. **Objectif** : convaincre ou écarter une école en moins de 15 secondes
   de lecture, préinscrire en 1 clic si convaincu.
2. **Temps de compréhension estimé** : 20s → cible 8s pour la décision
   initiale (le détail complet reste consultable ensuite).
3. **Infos importantes** : nom, statut vérifié, niveau(x) proposés, ville,
   1 CTA de préinscription.
4. **Infos secondaires** : infrastructures, frais détaillés, galerie,
   annonces, classes.
5. **À supprimer** : le second CTA "Préinscrire mon enfant" en milieu de
   page — un seul CTA persistant (sidebar sticky) suffit.
6. **À fusionner** : infrastructures + frais dans un seul bloc "Pratique"
   avec onglets, plutôt que 2 sections longues séquentielles.
7. **À déplacer** : un résumé "carte d'identité" (niveau, statut, ville,
   contact) remonte tout en haut, avant la description longue.
8. **Nouvelle hiérarchie** : (1) carte d'identité + CTA ; (2) description
   courte ; (3) contenu détaillé en onglets (Infrastructures/Frais/
   Classes/Annonces/Galerie) plutôt qu'un scroll séquentiel de 600+
   lignes.
9. **Interactions** : onglets pour le contenu détaillé (voir
   `04_COMPONENTS.md` §Tabs) — évite le mur de scroll actuel.
10. **Justification UX** : le principe "3 secondes" du brief est
    incompatible avec une page de 600 lignes où tout est au même niveau —
    la carte d'identité répond à la question immédiate, les onglets
    servent ceux qui veulent creuser.

---

## 7. Préinscription

1. **Objectif** : soumettre une demande complète sans abandon en cours de
   route, sur mobile en priorité.
2. **Temps de compréhension estimé** : 15s → cible 6s par étape.
3. **Infos importantes par étape** : (1) école + niveau, (2) enfant,
   (3) parent + message.
4. **Infos secondaires** : année scolaire, ancienne école, message
   complémentaire.
5. **À supprimer** : le champ "Âge" en doublon de "Date de naissance" —
   un seul des deux (date de naissance, l'âge s'en déduit si besoin).
6. **À fusionner** : rien à fusionner — la longueur vient du nombre de
   champs légitimement nécessaires, pas de redondance de contenu.
7. **À déplacer** : découpage en 3 étapes avec indicateur de progression,
   au lieu d'une page unique.
8. **Nouvelle hiérarchie** : un champ dominant par écran d'étape plutôt
   qu'une liste verticale complète d'un coup.
9. **Interactions** : barre de progression en haut (3 points), transition
   `slide` entre étapes (`06_MOTION.md`), possibilité de revenir en
   arrière sans perdre la saisie.
10. **Justification UX** : la longueur perçue d'un formulaire dépend
    moins du nombre de champs que du fait de les voir tous d'un coup — le
    découpage en étapes est le levier prouvé le plus efficace contre
    l'abandon de formulaire, sans retirer une seule information collectée.

---

## 8. Connexion

1. **Objectif** : authentifier en un minimum d'étapes, sans friction.
2. **Temps de compréhension estimé** : déjà 3s — aucun changement requis.
3. **Infos importantes** : email, mot de passe, CTA de connexion.
4. **Infos secondaires** : lien mot de passe oublié, lien inscription.
5. **À supprimer** : rien.
6. **À fusionner** : rien.
7. **À déplacer** : rien.
8. **Nouvelle hiérarchie** : accentuer visuellement le CTA principal
   ("Se connecter") par rapport à "Mot de passe oublié" (actuellement
   trop proches en poids visuel).
9. **Interactions** : aucun changement — l'écran actuel respecte déjà les
   règles du brief.
10. **Justification UX** : cet écran est la preuve que le reste du
    produit peut atteindre ce niveau de sobriété — il sert de référence
    dans `13_UX_IMPROVEMENT_PLAN.md`.

---

## 9. Inscription

1. **Objectif** : créer un compte établissement en comprenant clairement
   la suite du parcours (revendication/vérification).
2. **Temps de compréhension estimé** : 12s → cible 5s.
3. **Infos importantes** : identité, email, mot de passe, nom
   d'établissement.
4. **Infos secondaires** : tout champ de détail établissement qui peut
   être complété après coup depuis le dashboard.
5. **À supprimer** : tout champ d'établissement non strictement nécessaire
   à la création du compte lui-même (ville détaillée, description) —
   déplacé vers l'onboarding post-inscription, déjà existant.
6. **À fusionner** : rien.
7. **À déplacer** : ajout d'une ligne "Prochaine étape : vérification de
   votre établissement (2 min)" avant validation, pour fixer l'attente.
8. **Nouvelle hiérarchie** : formulaire de compte minimal en premier plan,
   aperçu des bénéfices Pro en second plan (déjà le cas, à conserver).
9. **Interactions** : validation en ligne des champs (email valide,
   mot de passe suffisant) avant soumission, pas seulement après échec
   serveur.
10. **Justification UX** : réduire le formulaire d'inscription à l'essentiel
    du compte, puis compléter l'établissement dans l'onboarding dédié déjà
    construit, évite de dupliquer la collecte d'information à deux endroits.

---

## 10. Administration

1. **Objectif** : qu'un administrateur sache en 5 secondes s'il y a
   quelque chose d'urgent à traiter aujourd'hui.
2. **Temps de compréhension estimé** : 15s → cible 5s.
3. **Infos importantes** : nouvelles demandes de vérification, tickets
   ouverts, dernière action sensible.
4. **Infos secondaires** : compteurs globaux (total écoles, total
   utilisateurs) — informatifs, jamais actionnables au quotidien.
5. **À supprimer** : réduction des 8 StatCard de la vue d'ensemble à 4
   maximum (voir `05_LAYOUT.md`).
6. **À fusionner** : Vue d'ensemble + Statistiques fusionnent leur contenu
   informatif — un administrateur ne doit pas avoir à choisir laquelle
   consulter.
7. **À déplacer** : les 4 compteurs restants (écoles/admissions/tickets/
   demandes) vers une vue "aujourd'hui" consolidée, les 4 autres vers
   Statistiques exclusivement.
8. **Nouvelle hiérarchie** : (1) file "à traiter" (demandes + tickets) ;
   (2) 4 StatCard avec tendance ; (3) accès rapide aux modules (CRM,
   Abonnements) en bas.
9. **Interactions** : chaque item de la file "à traiter" ouvre l'action
   correspondante en `Drawer` sans changer de page.
10. **Justification UX** : identique au Dashboard École — un cockpit
    admin doit produire une décision, pas un inventaire.

---

## 11. Module Pro

1. **Objectif** : que chaque fonction RH/scolarité soit trouvable en 1
   clic malgré leur nombre.
2. **Temps de compréhension estimé** : 10s → cible 4s.
3. **Infos importantes** : les fonctions utilisées au quotidien (Kiosque
   présence, Emplois du temps, Personnel).
4. **Infos secondaires** : configuration ponctuelle (Contraintes EDT,
   Salles, Matières).
5. **À supprimer** : rien à supprimer fonctionnellement — le problème est
   l'absence de structure, pas le volume de fonctions.
6. **À fusionner** : les 12 items à plat se regroupent en 4 catégories
   (RH : Personnel/Enseignants ; Temps : Emplois du temps/Contraintes/
   Salles/Remplacements ; Présence : Kiosque/Historique/Absences ;
   Paie & Communication : Paie/Messagerie).
7. **À déplacer** : "Enseignants" du Module Pro devient l'unique point
   d'entrée — le lien dupliqué dans Dashboard École pointe vers le même
   endroit plutôt que de créer une deuxième route équivalente.
8. **Nouvelle hiérarchie** : écran d'accueil Module Pro avec les 4
   catégories en Cards + accès direct aux 2-3 fonctions les plus utilisées
   (mesurées en usage réel une fois l'analytics en place — hors périmètre
   design).
9. **Interactions** : sidebar à 2 niveaux (catégorie repliable) plutôt
   qu'une liste à plat de 12 items.
10. **Justification UX** : 12 items à plat dépassent la capacité de
    mémorisation immédiate (règle des 7±2 éléments) — le regroupement en
    4 catégories ramène chaque décision de navigation à un choix simple.

---

## 12. Espace Enseignant

1. **Objectif** : qu'un enseignant sache "où je dois être ensuite" en 3
   secondes, entre deux cours, sur mobile.
2. **Temps de compréhension estimé** : 8s → cible 3s.
3. **Infos importantes** : prochain cours/créneau, statut de présence du
   jour.
4. **Infos secondaires** : classes, documents, salaire, notifications.
5. **À supprimer** : les sections placeholder ("Mon profil",
   "Notifications" non fonctionnelles) — retirées de la navigation tant
   qu'elles ne sont pas construites, plutôt que visibles mais inertes
   (règle "supprimer ce qui n'apporte aucune valeur").
6. **À fusionner** : rien.
7. **À déplacer** : ajout d'un bandeau "Aujourd'hui" fixe en haut (prochain
   cours + bouton de pointage direct) au-dessus des onglets existants.
8. **Nouvelle hiérarchie** : bandeau Aujourd'hui → onglets existants
   (emploi du temps, classes, documents, salaire) inchangés dans leur
   contenu.
9. **Interactions** : le bouton de pointage dans le bandeau Aujourd'hui
   ouvre directement le flux de pointage sans naviguer vers un autre onglet.
10. **Justification UX** : un enseignant consulte cet espace dans des
    micro-moments (entre deux cours) — l'information la plus consultée
    (le prochain cours) ne doit jamais nécessiter une navigation.
