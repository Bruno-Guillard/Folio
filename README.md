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

Le Service Worker utilise maintenant le cache `folio-v5-sync`. Une PWA déjà installée recevra donc la nouvelle version sans devoir être supprimée/réinstallée. Une fermeture/réouverture ou une actualisation peut être nécessaire juste après la publication.

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
