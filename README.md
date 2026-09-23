# Mes Montres — PWA

Application personnelle de suivi de montres : dossiers, photos, descriptions, achats, ventes et bénéfices.

## Fonctions incluses

- Dossiers personnalisables (avec `En vente`, `Vendues` et `Perso` créés au premier lancement)
- Ajout, modification et suppression de montres
- Plusieurs photos par montre ; la première sert de vignette
- Description libre
- Prix d'achat, frais, prix de vente
- Bénéfice calculé automatiquement : `vente - achat - frais`
- Totaux achat / vente / bénéfice par dossier
- Totaux généraux sur l'écran d'accueil
- Sauvegarde complète au format JSON, photos comprises
- Restauration d'une sauvegarde
- Fonctionnement hors connexion grâce au service worker
- Installation comme PWA sur téléphone

## Publication avec GitHub Pages

1. Créer un dépôt GitHub, par exemple `mes-montres`.
2. Envoyer tous les fichiers de ce dossier à la racine du dépôt (`index.html` doit être à la racine).
3. Dans GitHub : **Settings → Pages**.
4. Dans **Build and deployment**, choisir **Deploy from a branch**.
5. Sélectionner la branche `main` et le dossier `/ (root)`, puis enregistrer.
6. GitHub affichera ensuite l'adresse publique de l'application.

Sur Android avec Chrome : ouvrir cette adresse, puis utiliser **Ajouter à l'écran d'accueil / Installer l'application**.

## Stockage des données

Les données et photos sont enregistrées localement dans le navigateur via IndexedDB. Le code est hébergé sur GitHub Pages, mais les données personnelles ne sont pas envoyées dans le dépôt GitHub.

Utiliser régulièrement **Menu → Exporter une sauvegarde** pour conserver une copie de sécurité.
