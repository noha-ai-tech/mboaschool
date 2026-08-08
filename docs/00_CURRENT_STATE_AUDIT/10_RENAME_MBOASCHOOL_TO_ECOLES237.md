# 10 — Rename MboaSchool → Écoles237

## Méthode

Recherche exhaustive et insensible à la casse de `MboaSchool`, `Mboa School`, `mboaschool`, `MBOASCHOOL` sur l'intégralité du dépôt versionné (hors `node_modules`), incluant le code source, les fichiers SQL, la configuration, les métadonnées et la documentation.

## Résultat

**Aucune occurrence trouvée dans le dépôt actuel.** Le renommage visuel et technique au niveau du code semble déjà complet.

Seul point de continuité avec l'ancien nom : le nom interne du paquet npm est `ecoles237-mvp` (`package.json`), qui est cohérent avec le nouveau nom, pas un résidu. Le nom de dossier local du dépôt sur cette machine (`mboaschool`) est un artefact du système de fichiers local, pas un contenu versionné.

## Inventaire par catégorie

| Catégorie | Occurrences de l'ancien nom | Statut |
|---|---|---|
| Interface utilisateur (textes affichés) | 0 | Aucune action nécessaire |
| Code source (variables, noms de fonctions, commentaires) | 0 | Aucune action nécessaire |
| Base de données — noms de tables | 0 (toutes les tables sont nommées en anglais neutre ou en français : `establishments`, `enseignants`, etc.) | Aucune action nécessaire |
| Base de données — contenu des lignes | **NON VÉRIFIABLE DEPUIS CE DÉPÔT** — aucun accès direct aux données de production. Si des enregistrements historiques contiennent "MboaSchool" dans un champ texte libre (ex. une ancienne description d'établissement importée avant le renommage), ce serait invisible depuis le code | À vérifier directement dans le dashboard Supabase |
| Stockage (noms de fichiers, chemins) | 0 trouvé dans le code (les chemins sont générés dynamiquement à partir d'UUID, pas de nom de marque) | Aucune action nécessaire |
| SEO (métadonnées, `sitemap`, `robots.txt`) | 0 — `src/app/layout.tsx` utilise déjà "Écoles237" partout (title, Open Graph, Twitter card) | Aucune action nécessaire |
| Emails transactionnels | Aucun template d'email personnalisé trouvé dans le dépôt (les invitations utilisent le template par défaut de Supabase Auth, `admin.auth.admin.inviteUserByEmail` sans template custom visible) | NON VÉRIFIABLE si le template par défaut configuré dans le dashboard Supabase mentionne encore l'ancien nom |
| Documentation (`README.md`, `CLAUDE_CONTEXT.md`) | 0 — déjà rédigés avec "Écoles237" | Aucune action nécessaire |
| Configuration (variables d'environnement, noms de projet) | 0 dans `.env.example`. NON VÉRIFIABLE : le nom du projet Supabase lui-même (visible uniquement dans le dashboard Supabase, pas dans ce dépôt) | À vérifier dans le dashboard Supabase |
| Domaine | Aucun domaine codé en dur trouvé dans le code (hormis `NEXT_PUBLIC_SITE_URL` utilisé comme fallback `http://localhost:3000` dans `api/enseignants/[id]/inviter/route.ts`) | NON VÉRIFIABLE — le nom de domaine réel de production n'apparaît dans aucun fichier de ce dépôt |
| Nom du paquet npm | `ecoles237-mvp` | Déjà aligné, aucune action |
| Assets (images, favicon) | NON VÉRIFIÉ DANS LE CODE — pas de logo/favicon avec le nom écrit dessus trouvé dans le dépôt au moment de cet audit (le triptyque vert/rouge/jaune est du CSS, pas une image) | Vérifier si des fichiers image portant l'ancien nom existent dans Supabase Storage ou un CDN externe |

## Ce qui serait purement visuel vs. technique vs. risqué si un renommage restait à faire

Puisqu'aucune occurrence n'a été trouvée dans le dépôt, cette section sert de **grille de lecture** pour les zones hors dépôt (Supabase dashboard, DNS, emails) qui devraient être vérifiées séparément :

- **Purement visuel, sans risque** : nom affiché dans le dashboard Supabase (organisation/projet), templates d'email par défaut — changement cosmétique sans impact sur les identifiants techniques.
- **Technique mais réversible** : nom de domaine si un ancien domaine `mboaschool.*` existe encore et redirige vers `ecoles237.*` — à conserver en redirection 301 tant que des liens externes ou des favoris existent, ne jamais le couper brutalement.
- **Risqué si mal exécuté** : tout renommage de table, de colonne, de bucket Storage ou de slug d'URL existant. Aucun cas de ce type n'a été identifié dans le dépôt (les identifiants techniques ne portent pas l'ancien nom), donc **aucune migration de renommage technique n'est nécessaire côté base de données** d'après ce qui est observable ici.

## Conclusion

Le renommage MboaSchool → Écoles237 est **complet au niveau du code et de la documentation versionnée**. Les seules zones résiduelles possibles se situent entièrement en dehors de ce dépôt (configuration du dashboard Supabase, DNS, templates d'email par défaut, éventuel contenu textuel historique en base) et doivent être vérifiées directement par le fondateur ou l'architecte ayant accès à ces systèmes.
