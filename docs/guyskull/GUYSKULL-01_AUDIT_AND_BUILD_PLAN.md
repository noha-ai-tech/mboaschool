# GUYSKULL-01 AUDIT & BUILD PLAN

Date de l’audit : 30 août 2026  
Branche locale observée : integration/complete-school-platform  
Projet Supabase audité en lecture seule : Ecoles237, ref umcwwynrftidytxgqkwi  
Écritures base de données : 0  
Migration exécutée : non  
Déploiement / push : non

## Synthèse et gate de sécurité

Une seule fiche correspondant à Guyskull existe en production. L’audit peut donc cibler sans ambiguïté l’établissement a4cc4966-0d85-4c63-9c24-0538b8d5133b.

La population ne doit toutefois pas commencer avec le dépôt dans son état actuel. La production contient des objets pour les chiffres clés, les résultats et le classement, et public.publish_school_page exige désormais les domaines key_numbers et results dans le brouillon. En revanche :

- le brouillon Guyskull contient encore uniquement les huit domaines historiques ;
- le type local SchoolPageDraftPayload, le snapshot local et la validation de la route draft ne connaissent que ces huit domaines ;
- aucune migration locale 0035 ou 0036 n’est présente ;
- aucune version 0035 ou 0036 n’apparaît sous ce nom dans l’historique distant, qui se termine actuellement à 20260825054125, alors que les tables et fonctions correspondantes sont bien présentes.

Conséquence : une sauvegarde depuis le code local peut supprimer des clés nouvelles, et une publication Guyskull avec le payload actuel serait refusée comme brouillon incomplet. Cet écart doit être réconcilié avant toute saisie.

Le snapshot complet et restaurable des domaines Guyskull est conservé dans GUYSKULL-01_PRODUCTION_SNAPSHOT_20260830.json.

## GUYSKULL FOUND

ID: a4cc4966-0d85-4c63-9c24-0538b8d5133b  
Exact name: guyskull  
Category: garderie  
Subcategory/type: non renseigné  
Location: Douala, Pk10 ; adresse précise non renseignée  
Owner: profil 84884e49-3596-451a-b0b6-b8eeda4a9e50, nom existant « aurélie », rôle existant « parent »  
Verification status: referenced ; is_verified = false ; is_claimed = false  
Plan: gratuit / free

Existing real data:

- Nom exact : guyskull.
- Catégorie : garderie.
- Ville et quartier : Douala, Pk10.
- Téléphone enregistré : +237674816227.
- Description existante : « hhhhhh ». Elle est conservée dans le snapshot mais ne constitue pas un contenu éditorial publiable.
- Une valeur tarifaire existe : scolarité = 29 000 FCFA. Sa provenance officielle n’est pas démontrée ; elle doit être conservée mais validée par le propriétaire avant présentation comme tarif officiel.
- Admissions marquées ouvertes, sans période, niveau, condition ni pièce configurés.
- Une image JPEG publique, live, de 71 868 octets.
- Huit sections publiques existantes et visibles.
- Aucun identifiant officiel, source ministérielle ou référence registre.

## EXISTING CONTENT

| Domaine | État Guyskull en production |
|---|---|
| Identity | Nom, catégorie, ville, quartier et téléphone présents. Logo, devise, histoire, mission, vision, année, effectifs et identité visuelle absents. |
| Admissions | Une ligne existe ; is_open = true. Niveaux, dates, conditions, pièces et instructions sont vides. |
| Pricing | Une ligne existe. tuition_fee = 29 000 FCFA ; tous les autres montants sont nuls. |
| Documents | Aucune ligne et aucun objet dans le bucket school-documents. |
| Infrastructure | Une ligne existe ; les dix indicateurs sont tous false. Cela signifie « non déclaré/absent dans le modèle actuel », pas la preuve qu’aucun équipement n’existe réellement. |
| Results | Aucun résultat Guyskull. La table school_exam_results existe en production mais son support applicatif manque dans le dépôt local. |
| Ranking | Aucun classement Guyskull. La table school_official_ranking existe en production mais son support applicatif manque dans le dépôt local. |
| Events | Aucune annonce ni événement Guyskull. Les colonnes event_date et event_start_time existent en production, mais le CMS intégré ne les édite pas et le rendu public ne les exploite pas. |
| Gallery | Une image live ; aucune légende. |
| Contacts | Téléphone, ville et quartier présents. Adresse, email, WhatsApp, site et réseaux sociaux absents. |
| Academic offer | Aucune classe ni section Guyskull ; aucun catalogue public de cycles/filières. |
| Applications | Aucune candidature associée. |

## CMS GAP MATRIX

| Requirement | Existing schema | Existing CMS | Public rendering | Missing? | Recommended minimal solution |
|---|---|---|---|---|---|
| Name | establishments.name | Hors éditeur mini-site actuel | Oui | Partiel | Conserver la donnée réelle ; n’ajouter l’édition qu’avec les règles d’identité existantes. |
| Logo | establishments.logo_url | Non dans l’éditeur intégré | Hero avec replis, pas de workflow complet | Oui | Ajouter un upload logo scindé du flux galerie et protégé par le lifecycle. |
| Motto | establishments.motto en production | Absent du dépôt local | Absent | Oui côté application | Réconcilier 0035/0036 puis ajouter au payload présentation et au rendu. |
| Short description | establishments.description | Oui, mais champ unique | Oui | Non, mais contenu insuffisant | Utiliser description comme résumé court et ajouter une présentation longue distincte. |
| Full presentation | Aucun champ distinct | Description uniquement | Description uniquement | Oui | Ajouter presentation_longue au contenu de profil, éditable en brouillon. |
| History | establishments.history en production | Absent localement | Absent | Oui côté application | Réconcilier et exposer dans le lifecycle existant. |
| Mission | establishments.mission en production | Absent localement | Absent | Oui côté application | Même traitement que history. |
| Vision | establishments.vision en production | Absent localement | Absent | Oui côté application | Même traitement que history. |
| Values | Aucun champ | Non | Non | Oui | Ajouter values text[] au profil live et au payload draft. |
| Direction/leadership | Aucun champ éditorial adapté | Non | Non | Oui | Ajouter leadership_intro text ; ne pas publier de nom réel sans validation. |
| Educational philosophy | Aucun champ | Non | Non | Oui | Ajouter educational_philosophy text au profil live et au payload draft. |
| Founding year | establishments.founding_year en production | Absent localement | Absent | Oui côté application | Réconcilier, valider la valeur, rendre éditable via draft. |
| Students | establishments.student_count en production | Absent localement | Absent | Oui côté application | Réconcilier ; valeur nullable, jamais inventée. |
| Teachers | establishments.teacher_count en production | Absent localement | Absent | Oui côté application | Réconcilier ; valeur nullable, jamais inventée. |
| Cycles | Pas de catalogue public | Non | Non | Oui | Créer school_academic_programs, distinct des données opérationnelles de classe. |
| Classes | classes existe mais sert à la gestion et contient teacher_name | Éditeur classes séparé | Non dans le mini-site | Oui pour le catalogue public | Ne pas exposer directement la table opérationnelle ; publier une offre académique curatée. |
| Series | Aucun modèle | Non | Non | Oui | school_academic_programs avec type series. |
| Specialties/filières | Aucun modèle | Non | Non | Oui | school_academic_programs avec type filiere/specialite. |
| Bilingual program | Aucun attribut | Non | Non | Oui | Ajouter language_track ou bilingual à school_academic_programs. |
| Academic descriptions | Aucun modèle adapté | Non | Non | Oui | description par programme dans school_academic_programs. |
| Academic year | admissions_config n’a pas d’année scolaire | Non | Non | Oui | Ajouter academic_year au domaine admissions draft/live. |
| Admissions open/closed | admissions_config.is_open | Oui, immédiat-live | Oui | Non | Conserver le comportement intentionnel après confirmation architecturale. |
| Enrollment period | period_start / period_end | Oui | Oui | Non | Renseigner seulement après validation réelle. |
| Conditions | conditions | Oui | Oui | Non | Contenu de démonstration possible mais non publiable avant validation. |
| Required documents | required_documents text[] | Oui | Oui | Non | Utiliser la checklist existante ; différencier ensuite checklist et fichiers téléchargeables. |
| Admission instructions | additional_info | Oui | Oui | Non | Utiliser le champ existant. |
| Registration fee | fees.registration_fee | Oui, plat | Oui | Non pour une valeur unique | Conserver comme fallback ; migrer vers schedules pour la vue par classe. |
| Tuition by class/level | fees.tuition_fee unique par école | Non | Montant unique | Oui | school_fee_schedules. |
| Total tuition | Pas de total structuré | Non | Non | Oui | Colonne total_fee ou total calculé et contrôlé par schedule. |
| Installments | Aucun modèle | Non | Non | Oui | school_fee_installments ordonné par schedule. |
| Installment due dates | Aucun modèle | Non | Non | Oui | due_date nullable avec année scolaire explicite. |
| Uniform | fees.uniform_fee unique | Oui, plat | Oui | Partiel | Réutiliser comme fallback ; school_additional_fees pour détail obligatoire/facultatif. |
| Sports uniform | Aucun champ | Non | Non | Oui | school_additional_fees, catégorie sports_uniform. |
| Badge/student card | Aucun champ | Non | Non | Oui | school_additional_fees, catégorie badge. |
| Books/supplies | other_fees non sémantique | Non structuré | Non détaillé | Oui | school_additional_fees, catégorie supplies. |
| Insurance | Aucun champ | Non | Non | Oui | school_additional_fees, catégorie insurance. |
| APE contribution | Aucun champ | Non | Non | Oui | school_additional_fees, catégorie ape. |
| Exams | fees.exam_fee unique | Oui, plat | Oui | Partiel | Fallback existant + détail dans additional_fees si nécessaire. |
| Extracurricular activities | Aucun champ | Non | Non | Oui | school_additional_fees, catégorie activities. |
| Transport | fees.transport_fee unique | Oui, plat | Oui | Partiel | Fallback existant + fréquence/notes structurées dans additional_fees. |
| Canteen | fees.canteen_fee unique | Oui, plat | Oui | Partiel | Même stratégie. |
| Boarding | Aucun montant | Non | Non | Oui | school_additional_fees, catégorie boarding. |
| Other mandatory/optional fees | other_fees agrégé | Non structuré | Montant agrégé | Oui | school_additional_fees avec required, frequency et notes. |
| Enrollment form | school_documents | Upload disponible | Liste de documents | Partiel | Type dédié fiche ; CTA affiché seulement lorsqu’un fichier réel existe. |
| Required-documents checklist | admissions text[] + documents | Oui pour texte | Oui pour texte | Partiel | Garder la checklist, ajouter un type documentaire liste_pieces pour le PDF. |
| Fee schedule document | school_documents type text | Upload possible sous autre | Liste générique | Partiel | Ajouter le type applicatif tarifs sans modifier la table. |
| School rules | school_documents | Type reglement supporté | Oui | Non | Créer le PDF seulement après validation du contenu. |
| School brochure | school_documents type text | Upload possible sous autre | Liste générique | Partiel | Ajouter le type applicatif brochure. |
| Infrastructure flags | infrastructures, dix booléens | Oui | Oui | Non pour présence/absence | Ne jamais changer les false sans preuve. |
| Infrastructure descriptions | Aucun texte par équipement | Non | Non | Oui | Ajouter une description globale et, si requis, des descriptions CMS structurées. |
| Exam results | school_exam_results en production | Absent du dépôt local | Absent du dépôt local | Oui côté application/parité | Formaliser 0035/0036, restaurer les consumers et conserver draft/publish. |
| Official ranking/provenance | school_official_ranking en production | Absent du dépôt local | Absent du dépôt local | Oui côté application/parité | Même gate ; source et URL obligatoirement vérifiées avant publication. |
| Events | school_announcements.type/event_date/event_start_time | L’API intégrée ignore date/heure | Le rendu les ignore | Oui | Étendre API, formulaire et rendu ; garder les nouvelles/événements immédiat-live si confirmé. |
| Gallery | school_images + bucket public | Oui, draft add/remove | Oui, live uniquement | Non | Réutiliser, ajouter légendes et plan d’images cohérent. |
| Contact | Colonnes établissement | Oui partiellement | Oui | Partiel | Ajouter introduction de contact et liens sociaux structurés. |
| Official/useful links | source_url unique pour registre, aucun modèle de liste | Non | Non | Oui | school_useful_links ; distinguer liens officiels vérifiés et liens utiles. |
| Five top-level tabs | Huit section keys de contenu | Huit sections configurables | Huit ancres sur une seule page | Oui | Garder les sections comme unités CMS, les regrouper dans exactement cinq onglets de navigation. |
| Draft → Preview → Publish → Discard | Oui pour domaines historiques, galerie et objets distants 0035/0036 | Oui pour huit domaines locaux | Preview existante | Cassé par dérive | Réconcilier les payloads et migrations avant toute saisie. |

## CONTENT READY TO POPULATE

Les textes suivants sont des propositions de démonstration. Ils ne doivent pas être présentés comme des faits Guyskull tant que le propriétaire ne les a pas validés. Les faits utilisés sans invention sont uniquement le nom, la catégorie, Douala, Pk10 et le téléphone existant.

### Résumé court

[CONTENU DE DÉMONSTRATION À VALIDER] Guyskull est un établissement d’accueil et d’éveil situé à Pk10, Douala. Sa fiche Écoles237 a vocation à réunir, dans un espace clair, les informations utiles aux familles : présentation, admissions, tarifs, documents et actualités.

### Présentation complète

[CONTENU DE DÉMONSTRATION À VALIDER] Guyskull accueille les familles dans un cadre pensé pour l’éveil, l’apprentissage progressif et la confiance. L’établissement souhaite offrir une information simple et accessible à chaque étape : découverte du projet éducatif, préparation de l’inscription, consultation des pièces à fournir et suivi des informations pratiques. Cette présentation devra être complétée par la direction avec les niveaux réellement ouverts, l’organisation pédagogique et les services effectivement disponibles.

### Histoire

[CONTENU DE DÉMONSTRATION À VALIDER] L’histoire de Guyskull sera présentée à partir des informations et archives validées par la direction : date de création, étapes de développement et contribution à la communauté éducative de Pk10. Aucune date ni reconnaissance officielle n’est proposée tant que les justificatifs ne sont pas fournis.

### Mission

[CONTENU DE DÉMONSTRATION À VALIDER] Accompagner chaque enfant dans ses premiers apprentissages, en favorisant la curiosité, l’autonomie, l’expression et le respect des autres, en lien étroit avec les familles.

### Vision

[CONTENU DE DÉMONSTRATION À VALIDER] Construire un environnement éducatif de proximité où chaque enfant progresse à son rythme et où les familles disposent d’informations fiables pour accompagner son parcours.

### Valeurs

[CONTENU DE DÉMONSTRATION À VALIDER]

- Bienveillance dans l’accueil de chaque enfant.
- Écoute et dialogue avec les familles.
- Rigueur dans l’organisation des apprentissages.
- Respect, coopération et sens de la communauté.
- Curiosité, créativité et plaisir d’apprendre.

### Philosophie éducative

[CONTENU DE DÉMONSTRATION À VALIDER] L’approche proposée associe activités d’éveil, langage, motricité, découverte du monde et apprentissage de la vie collective. Le rythme, les méthodes et les dispositifs d’accompagnement devront être confirmés par l’équipe pédagogique avant publication.

### Introduction de la direction

[CONTENU DE DÉMONSTRATION À VALIDER] La direction de Guyskull souhaite accueillir chaque famille avec une information claire et un dialogue régulier. Cette rubrique présentera l’organisation de l’établissement et ses engagements, sans publier de nom, de fonction ou de portrait avant consentement et validation.

### Offre académique

[CONTENU DE DÉMONSTRATION À VALIDER] L’offre de Guyskull sera organisée par cycle et niveau afin que les familles puissent identifier facilement les classes ouvertes, les objectifs pédagogiques et les modalités d’accompagnement. Aucun niveau, programme bilingue, série ou filière ne doit être affiché avant confirmation de l’établissement.

### Introduction admissions

[CONTENU DE DÉMONSTRATION À VALIDER] La rubrique Admissions rassemble les étapes d’inscription, les dates utiles, les pièces à fournir et les documents téléchargeables. Avant tout dépôt, les familles sont invitées à vérifier la période en cours et à contacter l’établissement au numéro enregistré.

### Vie scolaire

[CONTENU DE DÉMONSTRATION À VALIDER] La vie scolaire pourra présenter les temps forts, activités d’éveil, rencontres avec les familles et projets collectifs réellement organisés par l’établissement. Chaque publication devra correspondre à une activité vérifiable et respecter le droit à l’image.

### Infrastructures

[CONTENU DE DÉMONSTRATION À VALIDER] Cette rubrique décrira uniquement les espaces et services confirmés par Guyskull. Les dix indicateurs actuels étant tous non renseignés/false, aucune bibliothèque, salle informatique, aire sportive, cantine, transport ou autre infrastructure ne doit être revendiquée sans vérification.

### Contact et localisation

Guyskull est référencé à Pk10, Douala. Pour confirmer l’adresse exacte, les horaires d’accueil et les modalités d’inscription, les familles peuvent utiliser le numéro déjà enregistré sur la fiche. L’adresse détaillée, l’email, WhatsApp et les réseaux sociaux restent à valider.

### Résumé SEO/public

[CONTENU DE DÉMONSTRATION À VALIDER] Découvrez la fiche Guyskull à Pk10, Douala : présentation, admissions, tarifs déclarés, documents utiles, actualités et coordonnées.

### Checklist admissions proposée

[CONTENU DE DÉMONSTRATION À VALIDER]

- Fiche d’inscription renseignée.
- Photocopie de l’acte de naissance.
- Photos d’identité récentes.
- Dernier bulletin ou carnet de notes, lorsque le niveau le justifie.
- Certificat de scolarité ou document de transfert, lorsque applicable.
- Toute pièce complémentaire explicitement confirmée par l’établissement.

La liste ne doit contenir aucune exigence médicale ou sensible non vérifiée.

## DATA THAT MUST NOT BE INVENTED

- Autorisation administrative, agrément, matricule, accréditation ou statut officiel.
- Identifiants et sources du registre national.
- Adresse exacte, géolocalisation, email, site, WhatsApp et réseaux sociaux.
- Nom, titre, photo ou biographie d’un responsable ou d’un enseignant.
- Date de fondation, effectifs d’élèves et d’enseignants.
- Niveaux, cycles, classes, filières, spécialités ou offre bilingue.
- Infrastructures et services, tant que les dix indicateurs ne sont pas confirmés.
- Dates d’inscription, conditions définitives et pièces obligatoires.
- Prix officiels autres que la valeur existante de 29 000 FCFA ; même cette valeur doit être confirmée avant d’être qualifiée d’officielle.
- Échéancier, tranches, remises, frais obligatoires ou facultatifs.
- Résultats d’examen, taux de réussite et nombres de candidats/admis.
- Classement, rang, périmètre ou source.
- Événements, clubs et activités présentés comme réellement programmés.
- Logo, couleurs officielles et photographies présentées comme celles du campus réel.

## PRICING MODEL

Current capability:

- public.fees impose une seule ligne par établissement.
- Sept montants plats sont disponibles : inscription, scolarité, transport, cantine, uniforme, examens et autres.
- Guyskull possède une valeur réelle existante : tuition_fee = 29 000 FCFA.
- Le CMS et le rendu public affichent ces valeurs sans niveau, tranche, échéance, caractère obligatoire ni fréquence.

Missing:

- Tarifs par classe ou niveau et année scolaire.
- Total explicite par classe.
- Tranches ordonnées et échéances.
- Frais complémentaires nommés, obligatoires/facultatifs, périodicité et notes.

Schema change required: YES

Proposition minimale réutilisable :

1. school_fee_schedules
   - establishment_id, academic_year, level_key, level_label, registration_fee, tuition_fee, total_fee, currency, position.
   - Unicité établissement + année + niveau.
2. school_fee_installments
   - schedule_id, position, label, amount, due_date.
   - Unicité schedule + position et contraintes amount >= 0.
3. school_additional_fees
   - establishment_id, academic_year, schedule_id nullable, category, label, amount, is_mandatory, frequency, notes, position.

Lifecycle recommandé :

- Conserver public.fees intact comme fallback historique ; ne pas dupliquer ni effacer les 29 000 FCFA.
- Stocker les versions en cours d’édition dans school_page_drafts.payload.
- À Publish, remplacer atomiquement les lignes live de l’établissement pour ces trois tables.
- Preview lit le payload draft ; le site public lit uniquement les tables live.
- RLS corrélée à establishment_id, lecture publique explicite, écriture owner uniquement dans le contexte de publication contrôlé.
- Aucune donnée de démonstration tarifaire ne sera insérée avant validation.

Vue publique cible :

- Tableau Classe | Inscription | Scolarité | Total.
- Détail dépliable Tranche | Montant | Échéance.
- Bloc Autres frais : libellé, montant, obligatoire/facultatif, fréquence/notes.
- Mention visible « Données de démonstration » pour toute grille non validée.

## DOCUMENT MODEL

Current capability:

- public.school_documents stocke name, type, url et storage_path.
- Le bucket school-documents est public, limité à 10 Mo, actuellement vide.
- L’API serveur vérifie l’établissement et accepte PDF, Word, Excel et PowerPoint.
- Le rendu public affiche uniquement les documents réellement présents.

Missing:

- Types applicatifs explicites liste_pieces, tarifs et brochure.
- CTA proéminent « Télécharger la fiche d’inscription ».
- Métadonnées d’année scolaire et éventuellement version/date de validité.

Solution minimale :

- Ne pas changer la table pour les trois types supplémentaires : type est déjà text.
- Étendre la liste blanche et les libellés applicatifs.
- Afficher le CTA uniquement si un document réel de type fiche existe et possède une URL valide.
- Conserver la zone Documents comme source unique ; aucun bouton hardcodé.

Spécifications de fichiers à préparer, sans upload à ce stade :

1. Fiche d’inscription 2026–2027 : identité de l’élève, responsables, contacts, niveau demandé, consentements adaptés.
2. Liste des pièces à fournir : checklist validée, cas « lorsque applicable » clairement indiqués.
3. Tarifs et modalités de paiement : produit du modèle structuré, avec statut démonstration ou validé.
4. Règlement intérieur : contenu fourni et validé par Guyskull.
5. Brochure de l’établissement : présentation, offre réelle, contacts validés et crédits visuels.

Chemin d’upload attendu : school-documents/{establishment_id}/{uuid}.{extension}, via la route serveur existante.

## VISUAL PLAN

Direction artistique proposée, non officielle : campus urbain de Douala à échelle humaine, bâtiments bas couleur ivoire avec accents bleu nuit et ocre, végétation tropicale maîtrisée, signalétique « GUYSKULL » cohérente, lumière naturelle chaude, photographie documentaire professionnelle. Les mêmes volumes, palette, uniformes proposés et traitement du logo doivent être réutilisés dans les dix images.

Toutes les images générées devront être marquées comme visuels de démonstration jusqu’à validation. Aucun visage d’enfant réel ni photographie d’une autre école ne sera utilisé.

10 image slots:

1. Hero campus — vue large de l’entrée et de la cour, signalétique Guyskull lisible, format 16:9.
2. School facade — façade principale depuis la rue, même architecture et mêmes couleurs, format 4:3.
3. Courtyard — cour intérieure ombragée, circulation lisible et ambiance d’accueil, format 4:3.
4. Classroom — salle d’éveil lumineuse, mobilier adapté, mêmes accents de marque, format 4:3.
5. Science laboratory — espace pédagogique de découverte, matériel réaliste et sûr ; seulement si ce domaine est validé comme offre réelle.
6. Computer room — salle informatique cohérente avec le même bâtiment ; seulement si l’équipement réel est confirmé.
7. Library — coin lecture ou bibliothèque, même identité architecturale ; ne pas le présenter comme réel avant validation.
8. Sports area — aire de motricité/sport adaptée à l’âge, environnement camerounais, format horizontal.
9. School-life/activity — activité collective non identifiable, consentements et droit à l’image respectés.
10. Admissions/back-to-school — bureau d’accueil, documents et signalétique Guyskull, sans données personnelles visibles.

La cinquième, sixième, septième et huitième image ne doivent pas créer de fausse preuve d’infrastructure. Si les équipements ne sont pas confirmés, elles restent des concepts non publiés ou sont remplacées par des scènes réellement vérifiées.

## PROPOSED GUYSKULL PAGE

La navigation principale contient exactement cinq onglets. Les huit section keys existantes restent des unités de contenu CMS et sont regroupées sous ces onglets ; elles ne deviennent pas huit onglets principaux.

### Accueil

- Hero cohérent, nom, catégorie et devise validée.
- Résumé court.
- CTA Admissions.
- CTA « Télécharger la fiche d’inscription » uniquement si le fichier existe.
- Chiffres clés uniquement s’ils sont vérifiés.
- Aperçu des résultats uniquement avec données sourcées.
- Prochain événement réel.
- Aperçu de trois à quatre images live.
- CTA contact.

### L’établissement

Sous-navigation : Présentation | Histoire | Mission & Vision | Valeurs | Direction | Infrastructures | Contact.

### Formations & Admissions

Sous-navigation : Formations | Cycles/classes/filières | Admissions | Tarifs | Pièces à fournir | Documents.

### Vie & Résultats

Sous-navigation : Résultats | Classement et provenance | Vie scolaire | Événements | Clubs et activités.

### Galerie & Infos

Sous-navigation : Galerie | Actualités | Documents | Liens utiles.

## REQUIRED CODE/DB CHANGES

### P0 — parité obligatoire avant toute population

1. Récupérer et formaliser les DDL exacts 0035 et 0036 correspondant aux objets déjà présents en production.
2. Démontrer leur équivalence avec les tables school_exam_results et school_official_ranking et les définitions actuelles de publish_school_page/discard_school_page_draft.
3. Réconcilier l’historique sans rejouer le DDL, uniquement dans une mission séparée et approuvée.
4. Mettre le dépôt local en parité :
   - SchoolPageDraftPayload inclut presentation enrichie, key_numbers, results et ranking ;
   - buildLiveSnapshot charge ces domaines ;
   - validation PATCH les accepte et les conserve ;
   - preview, publish, discard et UI les gèrent ;
   - les vieux brouillons sont normalisés sans perte.
5. Ajouter un test de non-régression prouvant qu’une sauvegarde partielle ne supprime aucune clé future/inconnue.

### P1 — contenu et navigation

6. Étendre le profil éditorial avec values, educational_philosophy, leadership_intro, school_life_intro et seo_summary.
7. Implémenter les cinq onglets publics avec sous-navigation contextuelle, sans changer Guyskull en page hardcodée.
8. Ajouter le catalogue school_academic_programs, éditable en draft, rendu uniquement après publication.
9. Ajouter school_useful_links avec type officiel/utile, libellé, URL et position.
10. Étendre le CMS événements aux champs type, event_date et event_start_time ; adapter le rendu.
11. Étendre les documents aux types dédiés et ajouter le CTA conditionnel.
12. Ajouter légendes/texte alternatif à la galerie et les contrôles de cohérence visuelle.

### P2 — tarification structurée

13. Ajouter les trois tables tarifaires proposées.
14. Étendre draft, preview, publish et discard pour les schedules, tranches et frais complémentaires.
15. Préserver public.fees et les 29 000 FCFA comme fallback ; aucune conversion automatique sans validation Guyskull.

### RLS et lifecycle

- RLS activée sur chaque nouvelle table.
- Lecture publique limitée aux lignes publiées/live.
- Toutes les écritures corrélées à l’établissement et au propriétaire via (select auth.uid()).
- Aucun accès cross-school.
- Publication atomique, transactionnelle et idempotente.
- Préflight accepte seulement l’état initial ou final exact.
- Post-check contrôle tables, contraintes, policies, ACL, payload et absence de modification des autres écoles.
- Rollback exact, sans perte des données historiques public.fees.

## MIGRATION

0037 required: YES

Reason:

- Le pricing actuel ne peut pas représenter les tarifs par classe, les tranches, les échéances et les frais obligatoires/facultatifs.
- L’offre académique publique, les valeurs, la philosophie, la direction, la vie scolaire et les liens utiles ne disposent pas d’un modèle CMS complet.
- Ces données ne doivent pas être forcées dans description, other_fees ou les tables opérationnelles de classes.

Gate préalable :

- 0037 ne doit pas être créé ni appliqué tant que 0035/0036 ne sont pas récupérées, vérifiées et formalisées.
- Le numéro 0037 est conceptuellement libre dans le dossier local, mais son utilisation reste bloquée par l’écart d’historique et de code.
- Aucun DML Guyskull ni backfill démonstratif ne doit faire partie du DDL 0037.

Ordre de déploiement futur proposé :

1. Réconciliation de parité 0035/0036, sans rejeu destructif.
2. Mise à niveau du code local pour les domaines déjà présents.
3. Test empty-db et tests de vieux payloads.
4. Revue architecturale du SQL 0037, de son rollback et de ses RLS.
5. Exécution 0037 séparée après autorisation.
6. Déploiement du code générique.
7. Population Guyskull en brouillon uniquement.
8. Preview et validation du propriétaire.
9. Publication explicite.

## VERDICT

SAFE TO POPULATE EXISTING FIELDS NOW: NO

Motif : le brouillon Guyskull et le dépôt local sont en retard sur le contrat de publication actuellement présent en production. Il faut d’abord réconcilier 0035/0036 et garantir qu’aucune sauvegarde ne supprime les domaines key_numbers/results/ranking.

SCHEMA EXTENSION NEEDED BEFORE COMPLETE SHOWCASE: YES

Motif : la tarification structurée, l’offre académique publique et plusieurs contenus éditoriaux ne peuvent pas être représentés sans forcer les données dans de mauvais champs.

READY FOR GUYSKULL-02: NO

Condition de passage : validation architecturale du plan, récupération des DDL 0035/0036, parité locale/production restaurée, puis approbation séparée de la proposition 0037.

Production schema changes: 0  
Production content changes: 0  
Other schools touched: 0  
Invitations activated: no  
Push / deployment: no

