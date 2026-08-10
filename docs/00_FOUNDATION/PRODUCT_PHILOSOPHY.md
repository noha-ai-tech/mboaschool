# Écoles237 — Product Philosophy

## Statut de ce document

Ceci n'est pas un document marketing et ce n'est pas un manifeste. C'est la
référence que toute personne travaillant sur Écoles237 — développeur,
designer, futur employé, futur dirigeant — doit pouvoir consulter pour
trancher une question que personne n'avait anticipée. Un document technique
répond à "comment". Celui-ci répond à "pourquoi", et le "pourquoi" change
beaucoup plus rarement que le "comment".

Ce document doit rester vrai même quand toute l'équipe actuelle aura été
remplacée, même quand la stack technique aura changé, même quand le produit
aura des fonctionnalités qui n'existent pas encore aujourd'hui. S'il devient
faux, ce n'est pas le document qu'il faut réécrire en douce — c'est une
décision d'équipe assumée, documentée, et datée.

---

## Chapitre 1 — Pourquoi Écoles237 existe

Écoles237 n'existe pas parce qu'une technologie le permettait. Il existe
parce qu'un problème réel et quotidien n'était résolu par personne au
Cameroun.

Aujourd'hui, trouver une école relève de la débrouille : le bouche-à-
oreille, une visite physique sans certitude d'y trouver quelqu'un, un
numéro de téléphone transmis de main en main qui ne répond pas toujours.
Comparer deux établissements est presque impossible — il n'existe nulle
part une information homogène (niveaux enseignés, frais réels, distance,
infrastructures) qui permette de mettre deux écoles côte à côte et de
choisir en connaissance de cause. L'information qui existe est dispersée :
une page Facebook ici, une affiche à l'entrée là, rien du tout ailleurs.

De leur côté, les établissements — y compris ceux qui offrent un
enseignement sérieux — restent souvent invisibles en dehors de leur
quartier immédiat, faute d'un endroit central où exister aux yeux des
familles qui cherchent. Et une fois qu'un parent et une école se sont
trouvés, la suite reste artisanale : préinscriptions sur papier, suivi des
admissions dans des cahiers, gestion du personnel et de la paie sans outil
adapté à la réalité d'un établissement scolaire camerounais.

Écoles237 existe pour remplacer cette débrouille par un système : un seul
endroit où chercher, comparer, se préinscrire, et — pour l'établissement —
gérer. Pas parce que "la technologie peut le faire", mais parce que ce
problème coûte réellement du temps, de l'argent et des opportunités à des
familles et à des écoles, tous les jours.

---

## Chapitre 2 — Notre mission

> Rendre l'accès à une éducation de qualité aussi simple que la trouver.

Une phrase, volontairement courte. Elle ne mentionne ni technologie, ni
marché, ni modèle économique — parce qu'aucun de ces éléments ne doit
définir pourquoi Écoles237 existe. Cette phrase reste vraie qu'Écoles237
soit un annuaire simple ou, dans dix ans, une plateforme de gestion
éducative nationale : dans les deux cas, la question à laquelle elle
répond ne change pas.

---

## Chapitre 3 — Notre vision

Dans dix ans, Écoles237 est le point de passage naturel entre les familles
camerounaises et le système éducatif de leur pays — non pas parce que
c'est imposé, mais parce que c'est devenu le chemin le plus simple.

Concrètement, cela veut dire :

- Un parent, dans n'importe quelle région du Cameroun, urbaine ou rurale,
  peut trouver et comparer les établissements accessibles autour de lui
  avec la même facilité, quelle que soit sa connexion internet ou son
  appareil.
- La majorité des établissements scolaires sérieux du pays — pas
  seulement les grandes villes — sont référencés, vérifiés, et gèrent au
  moins une partie de leur activité administrative sur la plateforme.
- Les données que la plateforme accumule (niveaux demandés, zones sous-
  desservies, tendances d'inscription) deviennent une ressource utile aux
  établissements eux-mêmes pour mieux planifier — jamais une ressource
  qu'Écoles237 exploite à leur insu ou contre leur intérêt.
- Écoles237 est devenu invisible dans le bon sens : personne ne pense à
  "utiliser une plateforme", les gens pensent simplement "chercher une
  école" ou "gérer mon établissement", et Écoles237 est l'endroit où cela
  se passe.

Cette vision ne promet pas une couverture à 100%, ni une transformation du
système éducatif camerounais dans son ensemble — ce serait une promesse
que ni ce document ni l'équipe qui l'écrit ne peuvent garantir. Elle décrit
une direction, pas un chiffre à atteindre à une date précise.

---

## Chapitre 4 — Nos principes produit

### La simplicité est une fonctionnalité
Elle n'est pas ce qui reste quand on a fini d'ajouter des fonctionnalités —
c'est une fonctionnalité à part entière, qui a un coût de conception au
même titre que n'importe quelle autre. Un écran plus simple qu'un
concurrent n'est pas un écran moins abouti ; c'est un écran qui a demandé
plus de travail pour retirer ce qui n'était pas nécessaire.

### Le temps des utilisateurs est précieux
Un directeur d'école qui ouvre son dashboard entre deux réunions, un
parent qui cherche une école pendant sa pause déjeuner, un enseignant qui
consulte son emploi du temps entre deux cours — aucun d'eux n'a de temps à
perdre sur notre produit. Chaque seconde que l'interface leur fait perdre
est une dette que nous contractons envers eux, pas un détail cosmétique.

### Les données appartiennent aux établissements
Les informations qu'une école saisit sur Écoles237 — ses élèves, son
personnel, ses finances, ses admissions — lui appartiennent. Écoles237 en
est le dépositaire technique, jamais le propriétaire. Une école doit
pouvoir exporter ou quitter la plateforme sans perdre l'accès à ce qui est
à elle. Cette règle prime sur toute considération de rétention d'usage.

### Une plateforme nationale doit rester rapide
Le Cameroun n'est pas un marché à connexion internet homogène. Un produit
qui fonctionne bien à Douala sur fibre et mal à l'intérieur du pays sur
réseau mobile limité n'est pas une plateforme nationale — c'est une
plateforme urbaine qui s'ignore. La vitesse n'est pas une optimisation
tardive, c'est une condition d'accès équitable.

### Chaque fonctionnalité doit résoudre un problème réel
Aucune fonctionnalité ne se justifie par "un concurrent l'a" ou "ça
pourrait servir". Elle se justifie par un problème identifié, vécu par un
utilisateur réel de la plateforme (parent, école, enseignant, ou
administrateur plateforme), documenté avant d'être construit — pas
découvert a posteriori pour justifier une fonctionnalité déjà écrite.

### La confiance se construit dans les détails
Un parent laisse le nom et le numéro de son enfant à Écoles237. Une école
y laisse ses données de paie. Cette confiance ne se gagne pas par une
déclaration d'intention — elle se gagne par l'accumulation de détails
bien traités : un message d'erreur honnête plutôt que technique, un badge
"vérifié" qui signifie réellement quelque chose, une absence totale de
chiffre inventé sur la plateforme. Un seul détail malhonnête suffit à
détruire ce que cent détails soignés ont construit.

---

## Chapitre 5 — Nos principes Design

### Ne jamais surcharger une interface
Chaque élément ajouté à un écran est un coût, pas un bénéfice par défaut —
il doit se justifier individuellement, pas simplement "avoir sa place".

### Une information importante en moins de 3 secondes
C'est le test ultime de tout écran : un utilisateur qui le regarde 3
secondes sans rien lire doit pouvoir en tirer l'essentiel. Si ce n'est pas
le cas, l'écran a échoué, quelle que soit la qualité de son contenu détaillé.

### Les espaces blancs sont prioritaires
L'espace vide n'est pas de l'espace perdu — c'est ce qui permet à ce qui
reste d'être perçu. Remplir un écran par peur du vide est le réflexe
exactement inverse de ce que ce principe demande.

### Une seule action principale
Chaque écran doit avoir une réponse unique et évidente à la question "que
suis-je censé faire ici ?". Deux actions de poids équivalent sur un même
écran ne doublent pas l'utilité — elles divisent la clarté par deux.

### Les animations restent discrètes
Une animation sert à accompagner une action, jamais à impressionner. Si un
utilisateur remarque consciemment une animation, elle a probablement duré
trop longtemps ou bougé trop d'éléments à la fois.

### Les icônes sont rares
Une icône doit remplacer un mot que l'utilisateur comprendrait de toute
façon instantanément — sinon, le mot est plus honnête que l'icône. Une
interface couverte d'icônes n'est pas plus claire, elle est simplement
plus difficile à scanner.

### Les tableaux ne sont utilisés que lorsqu'ils sont réellement utiles
Un tableau est le bon outil pour comparer des lignes structurées entre
elles — il est le mauvais outil pour présenter une liste qu'une carte ou
un graphique rendrait plus immédiatement compréhensible. Le choix du
tableau doit être une décision, pas un réflexe par défaut.

### Le design doit rassurer
Écoles237 touche à des sujets sensibles : l'avenir scolaire d'un enfant,
l'argent d'une école, la paie d'un enseignant. Un design qui inspire le
calme et le sérieux sert directement la mission — un design qui impressionne
ou surprend, même agréablement, prend le risque de faire douter au moment
où la confiance compte le plus.

### Le design doit vieillir lentement
Une tendance visuelle qui paraît moderne aujourd'hui paraîtra datée dans
trois ans. Un design fondé sur des principes durables (clarté, hiérarchie,
sobriété) plutôt que sur l'esthétique du moment reste pertinent bien plus
longtemps — et coûte moins cher à maintenir dans la durée.

---

## Chapitre 6 — Notre philosophie IA

L'intelligence artificielle n'est pas un produit d'Écoles237 — c'est un
outil qui peut accélérer la construction et le fonctionnement du produit.
Cette distinction n'est pas sémantique, elle est structurante : elle
détermine ce qu'on a le droit de construire et ce qu'on refuse de
construire.

L'IA aide. Elle n'interrompt jamais un utilisateur qui est en train
d'accomplir une tâche pour lui proposer autre chose. Elle reste à sa place,
discrète, disponible quand on la sollicite, invisible quand on ne la
sollicite pas.

Écoles237 ne construit jamais une interface centrée sur l'IA — pas de
chatbot imposé en point d'entrée, pas de fonctionnalité dont la seule
valeur est "regardez, c'est fait par une IA". L'utilisateur d'Écoles237
vient accomplir une tâche précise : trouver une école, traiter une
admission, consulter un emploi du temps. Il ne vient jamais admirer une
technologie. Si une capacité d'IA n'aide pas directement à accomplir cette
tâche plus vite ou plus simplement, elle n'a pas sa place sur la
plateforme, aussi impressionnante soit-elle par ailleurs.

---

## Chapitre 7 — Notre philosophie technique

**Pourquoi la simplicité du code est importante.** Un code simple peut être
repris par n'importe quel développeur qui rejoint le projet, aujourd'hui
comme dans cinq ans. Un code impressionnant mais complexe devient une
dépendance envers les personnes qui l'ont écrit — exactement le risque que
ce document cherche à éliminer en écrivant une philosophie qui doit
survivre au remplacement de toute l'équipe actuelle.

**Pourquoi les migrations doivent être traçables.** Chaque changement de
structure de données doit pouvoir être relu, compris et, si nécessaire,
annulé par quelqu'un qui n'était pas présent quand il a été écrit. Une
base de données est la mémoire la plus précieuse et la plus fragile du
produit — elle ne tolère aucune improvisation silencieuse.

**Pourquoi chaque fonctionnalité doit être testable.** Une fonctionnalité
qu'on ne peut pas vérifier objectivement n'est pas terminée, elle est
seulement écrite. La confiance dans le produit (Chapitre 4) dépend
directement de la capacité à prouver que ce qui est censé fonctionner
fonctionne réellement, avant qu'un utilisateur ne le découvre par
lui-même.

**Pourquoi la sécurité est prioritaire.** Écoles237 détient des données
sur des enfants, des transactions financières d'écoles, des informations
de personnel. Une faille de sécurité n'est pas un bug parmi d'autres —
c'est une rupture de la confiance décrite au Chapitre 4, potentiellement
irréversible. Aucune fonctionnalité, aucun délai, aucune pression
commerciale ne justifie de la traiter comme secondaire.

**Pourquoi une architecture claire est plus importante qu'une architecture
"impressionnante".** Une architecture se juge à la vitesse à laquelle une
nouvelle personne la comprend, pas à la sophistication qu'elle démontre.
Une solution technique élégante que seul son auteur comprend est une
dette, pas un atout — même si elle fonctionne parfaitement le jour où
elle est écrite.

---

## Chapitre 8 — Notre philosophie UX

Écoles237 ne construit pas des écrans. Il construit des expériences — la
différence est que l'écran est un artefact technique, l'expérience est ce
que l'utilisateur en retient une fois qu'il l'a quitté.

Chaque écran du produit, sans exception, doit répondre clairement à trois
questions, dans cet ordre :

**Où suis-je ?** L'utilisateur doit pouvoir se situer immédiatement — dans
quelle partie du produit, dans quel contexte (son école, son dossier,
l'espace de qui) — sans avoir à le déduire de détails secondaires.

**Que puis-je faire ?** Les actions disponibles sur cet écran doivent être
évidentes, pas cachées derrière une exploration nécessaire.

**Quelle est l'action principale ?** Parmi tout ce qui est possible sur
cet écran, une seule chose doit ressortir comme *la* chose à faire —
cohérent avec le principe de design "une seule action principale"
(Chapitre 5).

Un écran qui ne répond pas clairement à ces trois questions n'est pas prêt
à être livré, quelle que soit la qualité de son contenu ou de son code.

---

## Chapitre 9 — Notre philosophie commerciale

Écoles237 sert trois publics dont les intérêts ne sont jamais mis en
concurrence les uns contre les autres dans une décision produit :

**Les écoles sont nos clientes.** Ce sont elles qui, à terme, financent la
plateforme via leurs abonnements. Cette relation commerciale doit rester
honnête : une école paie pour une valeur réelle et mesurable (visibilité,
gestion, gain de temps), jamais pour une fonctionnalité gonflée ou un
chiffre trompeur.

**Les parents sont nos utilisateurs.** Ils ne paient rien et ne doivent
jamais se sentir comme le produit plutôt que comme la personne servie. La
gratuité de leur usage n'est pas une case à cocher marketing — c'est un
engagement : l'accès à l'information sur les écoles ne doit jamais devenir
un privilège payant.

**Les enseignants sont nos partenaires.** Ils utilisent Écoles237 dans le
cadre de leur travail, pas par choix personnel — le produit leur doit donc
une attention particulière à ne jamais leur imposer une charge qu'ils
n'ont pas demandée pour un bénéfice qu'ils ne perçoivent pas directement.

Toute décision produit doit pouvoir répondre à la question : "en quoi
est-ce que ceci crée de la valeur pour l'un de ces trois groupes, sans en
léser un autre ?". Une fonctionnalité qui profite aux écoles au détriment
de la confiance des parents, ou qui simplifie la vie de l'équipe Écoles237
au prix d'une charge supplémentaire pour les enseignants, ne passe pas ce
test.

---

## Chapitre 10 — Notre philosophie de croissance

Écoles237 évolue progressivement, jamais par bond. Une fonctionnalité
n'est lancée que lorsqu'elle est prête à être utilisée sans réserve —
jamais "presque prête" en misant sur une correction après coup pendant que
des utilisateurs réels en subissent les manques.

Nous préférons une excellente V1, volontairement limitée dans son
périmètre, à dix fonctionnalités médiocres livrées en même temps. Un
produit qui fait cinq choses parfaitement gagne plus de confiance qu'un
produit qui en fait cinquante approximativement — et cette confiance,
une fois gagnée, est ce qui permet ensuite d'élargir le périmètre sans
repartir de zéro.

Cette philosophie a un coût assumé : Écoles237 semblera parfois "en
retard" sur des concurrents qui annoncent plus de fonctionnalités plus
vite. C'est un compromis délibéré, pas un aveu de lenteur — la vitesse
d'annonce n'est pas la vitesse de valeur réellement livrée.

---

## Chapitre 11 — Ce que nous refusons

Cette liste n'est pas indicative — elle est officielle. Un désaccord avec
l'un de ces points doit passer par une révision explicite et documentée de
ce chapitre, jamais par une exception silencieuse dans le code ou le
design.

**Nous refusons les interfaces surchargées.** Parce qu'une interface
surchargée est le symptôme d'une décision de priorisation qui n'a jamais
été prise — tout a été gardé parce que rien n'a été tranché.

**Nous refusons les faux compteurs.** Un chiffre affiché sur Écoles237
doit toujours être un chiffre réel, mesuré, vérifiable. Un compteur
inventé pour paraître plus établi que nous ne le sommes est un mensonge
fait à la personne même dont nous cherchons la confiance (Chapitre 4).

**Nous refusons les faux témoignages.** Pour la même raison — une citation
attribuée à une personne qui n'a rien dit détruit exactement ce que la
preuve sociale est censée construire, dès qu'elle est découverte.

**Nous refusons les notifications inutiles.** Une notification qui
n'appelle aucune action réelle de l'utilisateur est une interruption sans
justification. Chaque notification doit se mériter par son utilité, jamais
par l'envie d'augmenter un taux d'engagement artificiel.

**Nous refusons les popups permanents.** Une interface qui interrompt
systématiquement l'utilisateur pour lui demander quelque chose (avis,
inscription à une newsletter, mise à niveau) traite sa présence comme une
ressource à exploiter plutôt que comme une personne à servir.

**Nous refusons les fonctionnalités gadgets.** Une fonctionnalité qui
existe pour la démonstration ("regardez ce qu'on sait faire") plutôt que
pour résoudre un problème réel d'un des trois publics (Chapitre 9) ne sera
pas construite, même si elle est techniquement impressionnante.

**Nous refusons les décisions prises uniquement pour suivre une mode.**
Une tendance de design ou de produit n'est jamais, à elle seule, une
raison suffisante. Elle doit d'abord passer le test du Chapitre 12 comme
n'importe quelle autre décision.

**Nous refusons les expériences qui compliquent le travail des écoles.**
Une plateforme censée simplifier la gestion d'un établissement qui finit
par ajouter du travail administratif a échoué dans sa mission fondamentale
(Chapitre 2), quelle que soit la sophistication de ce qu'elle propose par
ailleurs.

---

## Chapitre 12 — Comment prendre une décision

Avant toute nouvelle fonctionnalité, avant tout changement de design,
avant toute décision produit significative, les questions suivantes sont
posées, dans cet ordre :

```
1. Résout-elle un problème réel ?
        │
        ├─ NON ───────────────────► Repenser ou abandonner
        │
        ▼ OUI
2. Est-elle compréhensible ?
        │
        ├─ NON ───────────────────► Repenser ou abandonner
        │
        ▼ OUI
3. Respecte-t-elle notre philosophie ?
   (Chapitres 4 à 11 de ce document)
        │
        ├─ NON ───────────────────► Repenser ou abandonner
        │
        ▼ OUI
4. Simplifie-t-elle la vie des utilisateurs ?
   (parent, école, ou enseignant — Chapitre 9)
        │
        ├─ NON ───────────────────► Repenser ou abandonner
        │
        ▼ OUI
5. Peut-on faire plus simple ?
        │
        ├─ OUI ───────────────────► Refaire l'exercice avec la version plus simple
        │
        ▼ NON (on a déjà retiré tout ce qui pouvait l'être)
   → La fonctionnalité peut être construite.
```

Si une seule réponse est NON aux questions 1 à 4, la fonctionnalité doit
être repensée — pas ajustée à la marge, repensée depuis le problème
qu'elle prétend résoudre. Ce n'est pas une formalité bureaucratique :
c'est le mécanisme concret par lequel ce document reste vivant plutôt que
décoratif. Un document de philosophie qu'on ne consulte jamais au moment
de décider n'est qu'un texte — celui-ci n'a de valeur que s'il est
réellement posé comme un filtre avant chaque décision qui compte.
