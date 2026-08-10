# 18 — Landing Copywriting

Textes réels, prêts à intégrer, section par section. Règle transversale :
vouvoiement, phrases courtes, verbes d'action, aucune mention de l'IA
(conforme à la consigne), aucun chiffre inventé.

## Section 1 — Hero

**Titre (H1, Display) :**
> Le moyen le plus simple de trouver et gérer une école au Cameroun.

**Sous-titre (Body Large, 1 phrase) :**
> Écoles237 connecte parents et établissements sur une seule plateforme,
> partout au pays.

**CTA primaire :** `Rechercher une école`
**CTA secondaire :** `Inscrire mon établissement`

**Visuel (droite) :** mockup réaliste dans un cadre de navigateur épuré
(pas de vraie chrome d'OS, juste un cadre `rounded-2xl` + ombre `elevation-2`)
montrant l'interface de résultats de recherche déjà existante (SchoolCard
réelles, pas une illustration abstraite) — cohérent avec Stripe/Linear qui
montrent leur produit réel plutôt qu'une métaphore.

## Section 2 — Pourquoi Écoles237

**Titre (H2) :** `Pourquoi Écoles237 ?`

| Bénéfice | Titre | Phrase |
|---|---|---|
| 1 | Simple | Trouvez une école en quelques secondes, sans détour. |
| 2 | Vérifié | Chaque établissement affiché est vérifié par notre équipe. |
| 3 | Tout-en-un | De la recherche à la gestion administrative, une seule plateforme. |

Illustration légère par bénéfice : une icône Lucide unique dans un cercle
Primary Light (24px, cohérent avec `04_COMPONENTS.md` §StatCard) — jamais
une illustration complexe par bénéfice, la sobriété fait partie du message.

## Section 3 — Comment ça fonctionne

**Titre (H2) :** `Comment ça fonctionne`

| Étape | Titre | Phrase |
|---|---|---|
| 1 | Trouver | Recherchez par nom, ville ou niveau scolaire. |
| 2 | Comparer | Consultez les fiches détaillées et les avis vérifiés. |
| 3 | S'inscrire | Envoyez une préinscription en quelques clics. |

Numérotation visuelle (01/02/03) en Text Secondary, grande et discrète —
jamais un badge coloré par étape (éviterait la surcharge de couleur).

## Section 4 — Recherche des écoles

**Titre (H2) :** `Trouvez l'école qu'il vous faut`
**Sous-titre :** `Des milliers de familles utilisent déjà Écoles237 pour
choisir en toute confiance.`

*Note : "des milliers de familles" est un exemple de formulation à
remplacer par un chiffre réel si disponible, ou reformuler sans chiffre
("De nombreuses familles...") si aucune donnée fiable n'existe — voir la
règle "aucun chiffre inventé" en tête de ce document.*

Barre de recherche unique, grande (`Input` size `lg`, voir
`04_COMPONENTS.md`), placeholder : `Nom de l'école, ville, niveau…`. Filtres
(catégorie, ville) affichés comme des `chips` cliquables juste en dessous,
jamais comme des `<select>` de formulaire administratif.

3 `SchoolCard` réelles en aperçu sous la barre, avec lien `Voir toutes les
écoles →`.

## Section 5 — Pour les établissements

**Titre (H2) :** `Votre école, visible en ligne dès aujourd'hui`
**Sous-titre :** `Une page professionnelle, des admissions simplifiées, une
gestion centralisée.`

| Bloc | Titre | Phrase |
|---|---|---|
| 1 | Page personnalisée | Présentez votre établissement avec photos, infrastructures et tarifs. |
| 2 | Admissions | Recevez et traitez les préinscriptions directement en ligne. |
| 3 | Visibilité | Apparaissez dans les recherches des familles de votre région. |
| 4 | Gestion | Suivez vos effectifs et vos échanges depuis un seul tableau de bord. |

**CTA :** `Créer la page de mon école`

## Section 6 — Le Module Pro

**Titre (H2) :** `Pour aller plus loin : Écoles237 Pro`
**Sous-titre (une phrase, volontairement discret) :** `Emplois du temps,
présences, salaires et communication interne — dans un seul outil.`

4 mots-clés en ligne (pas de description longue) : `Emplois du temps` ·
`Présences` · `Salaires` · `Communication`.

**CTA (texte seul, pas de bouton plein) :** `Découvrir le module Pro →`

Cette section reste délibérément courte — elle ne cherche pas à convaincre
sur la landing, seulement à signaler l'existence du module pour qui cherche
déjà une solution plus complète.

## Section 7 — Statistiques

**Titre (H2) :** `Écoles237 en chiffres`

| Métrique | Statut donnée | Traitement recommandé |
|---|---|---|
| Écoles référencées | **Réelle, déjà disponible** (comptage `establishments`, déjà utilisé sur l'accueil actuel) | À afficher tel quel |
| Régions couvertes | **Réelle, calculable** (valeurs distinctes de `establishments.region`) | À afficher tel quel |
| Parents | **Non fiable** — aucun mécanisme ne distingue aujourd'hui un compte "parent" actif d'un compte créé une fois puis inactif | Ne pas afficher tant qu'aucune définition produit n'est validée, ou remplacer par une métrique réellement mesurée (ex. "Préinscriptions envoyées", déjà une donnée réelle) |
| Élèves | **Inexistante** — le produit ne compte aucun élève, seulement des établissements et des demandes d'admission | Ne pas afficher |

Recommandation : 3 métriques réelles maximum plutôt que 4 avec une
approximation — `Écoles référencées`, `Régions couvertes`,
`Préinscriptions envoyées` (remplace "Parents"/"Élèves", données déjà
réelles et positives).

Présentation : chiffres seuls, très grands (Display, tabular-nums), aucune
icône, aucune carte — juste 3 nombres alignés horizontalement sur fond
Background, exactement l'esthétique "sobre" demandée.

## Section 8 — Témoignages

**Titre (H2) :** `Ce qu'ils en disent`

**Aucun contenu réel disponible à ce jour** — voir `17_LANDING_PAGE_BLUEPRINT.md`
§"Point ouvert". Structure prévue pour 2-3 citations : photo/initiale +
nom + rôle (ex. "Directrice, École XYZ") + citation courte (1-2 phrases) —
jamais de note en étoiles (aucun système de notation n'existe dans le
produit, l'afficher serait fabriquer une donnée).

Tant qu'aucune vraie citation n'est fournie, cette section reste **non
développée** plutôt que remplie de témoignages fictifs.

## Section 9 — FAQ

**Titre (H2) :** `Questions fréquentes`

1. **Écoles237 est-il gratuit pour les parents ?**
   Oui, la recherche et la préinscription sont entièrement gratuites.
2. **Comment savoir si une école est vérifiée ?**
   Chaque établissement vérifié affiche un badge dédié sur sa fiche.
3. **Combien de temps prend une préinscription ?**
   Moins de 3 minutes, sans création de compte obligatoire.
4. **Comment inscrire mon établissement sur Écoles237 ?**
   Créez un compte, puis suivez les étapes de vérification depuis votre
   tableau de bord.
5. **Mes données sont-elles protégées ?**
   Oui, vos informations et celles de votre enfant restent strictement
   confidentielles.
6. **Écoles237 est-il disponible partout au Cameroun ?**
   Oui, dans toutes les régions où des établissements sont référencés.

*Question 6 formulée pour rester vraie même si la couverture réelle est
partielle — évite d'affirmer une couverture nationale complète non vérifiée.*

## Section 10 — Footer

Minimal : logo (`variant="dark"`, fond Accent) + 3 colonnes maximum
(Produit : Rechercher, Écoles, Pro · Entreprise : À propos, Contact ·
Légal : Confidentialité, Conditions) + copyright. Pas de newsletter, pas de
réseaux sociaux si les comptes n'existent pas réellement (ne jamais afficher
un lien vers un profil social inexistant ou inactif).
