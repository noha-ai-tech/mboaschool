# 14 — User Flows

Parcours actuels (état réel du produit) annotés des points de friction
identifiés dans `11_UX_AUDIT.md`, et parcours cibles après application de
`13_UX_IMPROVEMENT_PLAN.md`. Chaque flux correspond à un persona.

## Parent

### Flux actuel
```
Accueil
  → remplit 4 champs de recherche (texte, catégorie, ville, rayon)
  → clique "Rechercher"
  → scrolle jusqu'aux résultats groupés par sous-catégorie
  → ouvre une fiche école (page longue, 600+ lignes)
  → scrolle jusqu'au bloc de préinscription
  → clique "Préinscrire mon enfant"
  → remplit un formulaire de 10+ champs en une seule page
  → soumet
  → note le code de suivi
  → (optionnel, rarement fait) revient plus tard sur /suivi-admission
```
**Points de friction** : 4 décisions avant le premier résultat ; page
école longue avant d'atteindre le CTA ; formulaire non découpé ; aucune
relance automatique pour inciter au suivi.

### Flux cible
```
Accueil
  → tape dans un champ de recherche unique (ou clique un chip catégorie)
  → résultats affichés en direct (liste + carte), sans clic "Rechercher"
  → ouvre une fiche école → carte d'identité + CTA visibles immédiatement
  → clique "Préinscrire mon enfant"
  → 3 étapes courtes (École/Enfant/Parent) avec progression visible
  → soumet → code de suivi mis en avant + lien direct vers /suivi-admission
```
**Gain** : de ~9 étapes de décision à 5, aucune perte d'information
collectée.

## École (directeur)

### Flux actuel
```
Landing → Inscription (formulaire long, compte + détails établissement)
  → email de confirmation
  → connexion
  → onboarding (revendication d'établissement, déjà bien étapé)
  → attente de vérification par l'équipe Écoles237
  → Dashboard École (4 widgets hétérogènes sans priorité)
  → doit deviner où traiter les admissions reçues
```
**Points de friction** : formulaire d'inscription surchargé de champs
d'établissement redondants avec l'onboarding qui suit immédiatement après ;
dashboard sans hiérarchie d'urgence.

### Flux cible
```
Landing → Inscription (compte minimal : identité + email + mot de passe)
  → connexion immédiate
  → onboarding (inchangé, déjà performant)
  → attente de vérification (statut visible clairement dans le dashboard,
    pas seulement par email)
  → Dashboard École → liste "à traiter aujourd'hui" en tête, action en 1 clic
```
**Gain** : suppression de la double saisie d'informations établissement
(inscription + onboarding demandaient en partie la même chose) ; dashboard
qui pointe directement vers l'action plutôt que de la laisser à découvrir.

## Enseignant

### Flux actuel
```
Reçoit une invitation → /auth/enseignant-bienvenue → connexion
  → /enseignant/mon-espace
  → doit cliquer sur l'onglet "Emploi du temps" pour savoir où aller ensuite
  → pointe sa présence via le kiosque (device partagé, pas son propre espace)
```
**Points de friction** : l'information la plus utile (prochain cours)
n'est jamais la première chose visible ; sections placeholder qui
ressemblent à des fonctions réelles.

### Flux cible
```
Connexion → /enseignant/mon-espace
  → bandeau "Aujourd'hui" immédiatement visible (prochain cours + statut
    de présence du jour)
  → onglets existants inchangés pour le détail
```
**Gain** : l'action la plus fréquente (savoir où être) ne nécessite plus
de navigation.

## Administrateur plateforme

### Flux actuel
```
Connexion → /dashboard/admin (8 StatCard sans priorité)
  → doit visiter Vérifications, CRM, Support, Statistiques séparément
    pour savoir s'il y a quelque chose d'urgent
```
**Points de friction** : aucune vue consolidée de l'urgence du jour —
l'information prioritaire est dispersée sur 6 pages de la sidebar.

### Flux cible
```
Connexion → /dashboard/admin
  → file "à traiter" en tête (demandes de vérification + tickets ouverts)
  → 4 StatCard avec tendance en dessous
  → accès rapide aux modules spécialisés seulement pour aller plus loin
```
**Gain** : une seule page répond à "qu'est-ce qui m'attend aujourd'hui",
les pages spécialisées restent pour l'exploration approfondie plutôt que
pour la vérification quotidienne.

## Flux transversal : abandon et reprise

Aucun des 4 flux actuels ne gère la reprise après interruption (fermeture
d'onglet en cours de formulaire, connexion coupée). Recommandation
transversale pour `13_UX_IMPROVEMENT_PLAN.md` Vague 3 : les formulaires
multi-étapes (préinscription, inscription) conservent leur état en
mémoire locale du navigateur le temps de la session, pour qu'une fermeture
accidentelle ne coûte pas la ressaisie complète.
