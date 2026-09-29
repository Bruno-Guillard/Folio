# Folio V5 — bibliothèque synchronisée

Folio est une PWA personnelle pour gérer une collection et suivre achats, ventes et bénéfices.

## Nouveauté V5

La collection peut maintenant être synchronisée entre plusieurs appareils grâce à Supabase :

- une fiche ajoutée sur le Mac est retrouvée sur le téléphone ;
- une fiche ajoutée ou modifiée sur le téléphone est retrouvée sur le Mac ;
- les dossiers, l'ordre des objets, les descriptions et les prix sont synchronisés ;
- les photos sont enregistrées dans le bucket privé `folio-photos` ;
- une copie locale reste conservée dans IndexedDB pour l'affichage et la sauvegarde `.folio` ;
- la synchronisation se fait au lancement, au retour dans l'application, toutes les 60 secondes quand elle est ouverte, et manuellement via le badge de synchronisation.

## Connexion

Au premier lancement de V5 sur chaque appareil, Folio demande l'adresse e-mail et le mot de passe du compte créé dans Supabase Authentication.

La session est ensuite conservée sur l'appareil. Le badge en haut indique :

- `Local` : pas connecté à Supabase ;
- `Sync` : synchronisation en cours ;
- `Synchronisé` : bibliothèque à jour ;
- `À synchroniser` : une opération n'a pas encore pu être envoyée.

## Sécurité

Le fichier `cloud.js` contient uniquement :

- le Project URL Supabase ;
- la **Publishable key**.

Ces deux informations sont prévues pour être présentes dans une application web côté navigateur. La sécurité des données repose sur l'authentification et les règles RLS créées dans Supabase.

Ne jamais ajouter au dépôt :

- le mot de passe de la base PostgreSQL ;
- une Secret key ;
- la clé `service_role` ;
- le mot de passe du compte Folio.

## Photos

Les photos sont rangées dans le bucket privé `folio-photos` selon la structure :

`<user_id>/<item_id>/<fichier>`

Elles ne disposent pas d'une URL publique. Folio les télécharge avec la session authentifiée du propriétaire.

## Passage depuis V4

Folio conserve le nom de base IndexedDB de V4. Les fiches déjà présentes sur l'appareil ne sont donc pas volontairement effacées lors de la mise à jour.

Les anciens identifiants internes sont convertis en UUID avant la première synchronisation afin de pouvoir être enregistrés dans PostgreSQL.

L'export/import `.folio` reste disponible comme sauvegarde indépendante du cloud.

## Publication GitHub Pages

Remplacer les fichiers de la version précédente par le contenu de ce dossier dans **le même dépôt et le même chemin GitHub Pages**.

Le Service Worker utilise un cache versionné afin de forcer la mise à jour de la PWA. Une PWA déjà installée recevra donc la nouvelle version sans devoir être supprimée/réinstallée. Une fermeture/réouverture ou une actualisation peut être nécessaire juste après la publication.

## Fichiers principaux

- `index.html` — interface PWA
- `styles.css` — interface et responsive
- `db.js` — cache local IndexedDB
- `cloud.js` — connexion privée Supabase
- `app.js` — logique de Folio
- `sw.js` — cache PWA
- `manifest.webmanifest` — installation mobile

## V6 — Trésorerie et frais divers

La page d’accueil affiche maintenant **Trésorerie** après **Recette**.

Calcul utilisé :

`Trésorerie = recettes − achats − frais des fiches − frais divers`

La case **Frais divers** est un montant global libre. Elle est enregistrée localement, incluse dans les sauvegardes `.folio` et synchronisée entre les appareils via Supabase.

Pour un projet Supabase déjà configuré avec Folio V5, exécuter une seule fois le fichier `SUPABASE-V6-TRESORERIE.sql` dans **Supabase > SQL Editor** avant de modifier les frais divers.


## V6.1 — disposition de l’accueil

- Première ligne : Achat · Recette · Bénéfice.
- Deuxième ligne, plus discrète : Frais divers · Trésorerie.
- Aucun changement de données ni de schéma Supabase par rapport à V6.


## V6.2 — totaux généraux par dossier

Chaque dossier possède maintenant l'option **Inclure dans les totaux généraux**.

- Les chiffres affichés à l'intérieur d'un dossier sont toujours calculés uniquement avec les objets de ce dossier.
- Sur l'accueil, Achat, Recette, Bénéfice et Trésorerie utilisent uniquement les dossiers cochés.
- Décocher un dossier ne masque ni ne supprime aucun objet ; cela l'exclut seulement des totaux généraux.
- Le réglage est synchronisé entre Mac et téléphone et inclus dans les sauvegardes `.folio`.
- Les anciens dossiers et anciennes sauvegardes sont considérés comme inclus par défaut.

Avant la première utilisation de V6.2 sur un projet Supabase existant, exécuter une seule fois `SUPABASE-V6.2-TOTAUX-DOSSIERS.sql` dans **Supabase > SQL Editor**.


## V6.3 — correction du déplacement entre dossiers

- Modifier le dossier d’un objet déplace désormais strictement la fiche existante : son identifiant reste inchangé.
- En mode modification, Folio relit la fiche directement dans IndexedDB avant l’enregistrement.
- Si une synchronisation a remplacé/actualisé la fiche pendant que le formulaire était ouvert, Folio bloque l’enregistrement au lieu de créer une nouvelle fiche par erreur.
- Aucun changement de schéma Supabase n’est nécessaire pour V6.3.
- Les doublons déjà créés avant cette correction ne sont pas supprimés automatiquement afin d’éviter de supprimer deux objets réellement distincts portant le même nom. Supprimer manuellement la copie indésirable une fois la V6.3 installée.

## V6.4 — dossier Réparation

Folio ajoute automatiquement un dossier spécial **Réparation** aux bibliothèques existantes et aux nouvelles installations.

- pas de photos : le dossier est affiché sous forme de liste ;
- chaque ligne contient le nom de la montre, le coût éventuel, le prix de la réparation et le bénéfice ;
- bénéfice réparation = prix de réparation − coût ;
- tant qu'aucun prix de réparation n'est renseigné, le coût est compté comme un bénéfice négatif ;
- le dossier possède la même option **Inclure dans les totaux généraux** que les autres dossiers ;
- s'il est inclus, le coût alimente les dépenses générales et le prix de réparation les recettes générales ;
- le dossier Réparation est un dossier système : il n'est ni renommable ni supprimable depuis Folio afin de conserver son fonctionnement spécial ;
- aucun changement de schéma Supabase n'est nécessaire pour V6.4.

Le Service Worker utilise le cache `folio-v6-4-reparations`.

## V6.5 — Annonce / Showcase

Cette version ajoute deux champs indépendants aux fiches standard :
- **Titre de l’annonce** (`listing_title`)
- **Prix demandé** (`asking_price`)

Ces champs n'entrent jamais dans les calculs Achat / Vente / Bénéfice / Trésorerie.

Avant de publier V6.5 sur GitHub Pages, exécuter une fois dans Supabase > SQL Editor :
`SUPABASE-V6.5-ANNONCES.sql`.

Le script initialise le titre d'annonce des fiches existantes avec leur nom Folio uniquement si ce nouveau champ est vide, afin de ne pas casser la vitrine existante. Après cela, les deux titres sont totalement indépendants.


## V6.6 — Réorganisation des photos

- Correction du glisser-déposer des photos dans une fiche.
- Sur téléphone comme sur ordinateur, saisir la poignée **≡** d'une photo et la faire glisser vers sa nouvelle position.
- Sur ordinateur, le glisser direct de la vignette reste également disponible.
- La zone d'ajout de fichiers n'intercepte plus le glisser interne servant au classement.
- La première photo reste la photo principale.
- L'ordre est enregistré dans Folio et synchronisé vers Supabase comme auparavant.
- Aucun changement SQL Supabase n'est nécessaire.
