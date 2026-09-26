# Folio — PWA

**Folio** est une application locale pour collectionner, suivre et éventuellement revendre des objets : montres, vêtements, cartes, sneakers, vinyles, photo, objets vintage, etc.

## Fonctions incluses

- Dossiers personnalisables (avec `En vente`, `Vendus` et `Collection` sur une nouvelle installation)
- Ajout, modification et suppression d'objets
- Plusieurs photos par objet ; la première sert de vignette
- Description libre
- Prix d'achat, frais, prix de vente
- Bénéfice automatique : `vente - achat - frais`
- Totaux achat / vente / bénéfice par dossier
- Totaux généraux sur l'écran d'accueil
- Fonctionnement hors connexion avec IndexedDB + service worker
- Installation comme PWA sur téléphone ou ordinateur

## Sauvegarde portable Mac ↔ téléphone

Dans **Menu → Exporter Folio**, l'application crée un fichier `.folio` contenant :

- tous les dossiers ;
- toutes les fiches ;
- les prix et descriptions ;
- toutes les photos.

Ce fichier peut être envoyé par AirDrop, Messages, e-mail, Drive, etc., puis importé dans Folio sur un autre appareil.

À l'import, trois choix sont proposés :

- **Nouveaux uniquement** : ajoute seulement les objets dont l’identifiant interne n’existe pas encore sur l’appareil. Les fiches déjà présentes ne sont jamais modifiées. Les dossiers existants de même nom sont réutilisés.
- **Fusionner** : conserve les données locales et ajoute les nouveaux éléments. Pour un même objet déjà connu par son identifiant interne, la version la plus récemment modifiée est conservée. Les dossiers portant le même nom sont rapprochés afin d'éviter les doublons courants.
- **Remplacer la collection** : remplace les données de l'appareil par celles du fichier. Avant le remplacement, Folio déclenche automatiquement le téléchargement d'une sauvegarde de sécurité de l'état actuel.

Les anciennes sauvegardes JSON de la première version restent importables.

## Publication avec GitHub Pages

1. Créer un dépôt GitHub, par exemple `folio`.
2. Envoyer tous les fichiers de ce dossier à la racine du dépôt (`index.html` doit être à la racine).
3. Dans GitHub : **Settings → Pages**.
4. Dans **Build and deployment**, choisir **Deploy from a branch**.
5. Sélectionner la branche `main` et le dossier `/ (root)`, puis enregistrer.
6. Ouvrir l'adresse fournie par GitHub Pages et installer Folio sur l'écran d'accueil.

## Confidentialité et stockage

Le code de Folio peut être public sur GitHub Pages, mais **les fiches, prix, descriptions et photos restent dans IndexedDB sur l'appareil**. Elles ne sont pas envoyées automatiquement sur GitHub.

Le fichier `.folio` est une sauvegarde locale complète. Comme il contient les photos et les données de collection, il doit être conservé comme un fichier personnel.

## Photos : ajout et ordre

- Sur Mac/PC, les photos peuvent être ajoutées par glisser-déposer depuis le Finder vers la zone Photos.
- Sur téléphone, le bouton « Ajouter des photos » ouvre la photothèque / le sélecteur d’images.
- Sur Mac/PC, les vignettes peuvent être glissées pour changer leur ordre.
- Sur mobile, un appui prolongé puis un déplacement permet de réordonner les photos.
- La première photo est toujours utilisée comme photo principale / vignette de l’objet.

## Ordre des objets dans un dossier

- Sur Mac/PC, un objet peut être glissé vers une autre position dans son dossier.
- Sur téléphone, un appui prolongé puis un déplacement permet de le réordonner.
- L’ordre est enregistré dans la fiche et inclus dans les exports `.folio`.
- Un nouvel objet créé dans Folio apparaît en tête de son dossier.
- Avec l’import **Nouveaux uniquement**, les objets déjà présents conservent leur ordre ; les nouveaux sont ajoutés sans modifier les fiches existantes.
