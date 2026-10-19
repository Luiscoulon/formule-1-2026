# Paddock 26 : la saison 2026 de Formule 1

Site statique en français consacré à la saison 2026 de F1 : calendrier et circuits, pilotes, écuries et classements.
Il est écrit en HTML, CSS et JavaScript, sans framework ni étape de compilation : il suffit de déposer les fichiers sur
GitHub Pages pour le mettre en ligne.

Les données intégrées sont à jour au **19 octobre 2026, après le Grand Prix de Singapour (manche 17 sur 23)**.
Ensuite, le site se met à jour tout seul grâce à l'API gratuite [Jolpica-F1](https://github.com/jolpica/jolpica-f1).

## Ce que contient le site

- **Accueil** : prochain Grand Prix avec compte à rebours et programme du week-end à l'heure du visiteur (et à l'heure
  du circuit), tour de chronométrage du championnat pilotes, course au titre (points encore en jeu, pilotes encore en
  lice, conditions d'un sacre au prochain Grand Prix), dernier Grand Prix, championnat constructeurs.
- **Calendrier** : les 23 manches, les courses annulées ou déplacées à leur date d'origine, filtres (à venir, terminées,
  week-ends sprint), carte interactive des circuits, fiche de chaque Grand Prix (longueur, tours, distance, premier
  Grand Prix, horaires de toutes les séances, podium, pole, meilleur tour, classement complet, sprint).
- **Pilotes** : fiches des 22 titulaires et du remplaçant ayant couru (filtre par écurie, tri, recherche), avec
  naissance, débuts, titres, statistiques 2026, résultat de chaque manche et graphique des points.
- **Écuries** : châssis, moteur, base, pilotes, répartition des points, victoires, podiums, poles et doublés.
- **Classements** : pilotes et constructeurs (avec évolution des places depuis la manche précédente et départage des
  égalités), graphique de l'évolution des points, grille complète des résultats.
- Thème clair et sombre (automatique ou au choix), affichage adapté aux téléphones, navigation au clavier,
  contrastes conformes WCAG AA.

## Mettre le site en ligne avec GitHub Pages

### Méthode simple, depuis le navigateur

1. Connectez-vous sur [github.com](https://github.com) et cliquez sur **New repository**.
   Donnez-lui un nom, par exemple `site-f1-2026`, laissez-le **Public** et cliquez sur **Create repository**.
2. Sur la page du dépôt, cliquez sur **uploading an existing file** (ou **Add file**, puis **Upload files**).
3. Décompressez l'archive sur votre ordinateur, ouvrez le dossier `site-f1-2026` et glissez-déposez **tout son contenu**
   (`index.html`, `README.md`, `LICENSE` et les dossiers `assets`, `css`, `js`, `vendor`) dans la zone d'envoi.
   Cliquez ensuite sur **Commit changes**.
   Le fichier caché `.nojekyll` est facultatif : s'il n'est pas envoyé, le site fonctionne quand même.
4. Allez dans **Settings**, puis **Pages**. Dans **Build and deployment**, choisissez **Source : Deploy from a branch**,
   puis la branche **main** et le dossier **/ (root)**, et cliquez sur **Save**.
5. Après une ou deux minutes, le site est disponible à l'adresse
   `https://VOTRE-PSEUDO.github.io/site-f1-2026/` (le lien s'affiche en haut de la page **Pages**).

### Avec Git, en ligne de commande

```bash
cd site-f1-2026
git init
git add .
git commit -m "Site de la saison 2026 de F1"
git branch -M main
git remote add origin https://github.com/VOTRE-PSEUDO/site-f1-2026.git
git push -u origin main
```

Activez ensuite GitHub Pages comme à l'étape 4 ci-dessus.

## Tester sur votre ordinateur

Double-cliquez simplement sur `index.html` : le site s'ouvre dans votre navigateur.
Vous pouvez aussi lancer un petit serveur local depuis le dossier du site, puis ouvrir <http://localhost:8000> :

```bash
python3 -m http.server 8000
```

## Organisation des fichiers

```text
index.html            page unique (navigation par ancres : #/calendrier, #/pilotes/antonelli…)
css/style.css         styles, thèmes clair et sombre
js/config.js          réglages : nom du site, mise à jour automatique, lien vers le dépôt
js/data.js            données 2026 intégrées (calendrier, écuries, pilotes, résultats)
js/utils.js           formatage des dates, nombres et drapeaux
js/compute.js         points, classements, statistiques, course au titre
js/api.js             mise à jour automatique via l'API Jolpica-F1
js/chart.js           graphique d'évolution des points (SVG)
js/views.js           gabarits des pages
js/app.js             navigation, fiches, thème, compte à rebours, carte
vendor/leaflet/       bibliothèque de carte Leaflet 1.9.4 (licence BSD-2)
assets/favicon.svg    icône du site
```

## Mise à jour des données

**Automatique.** À chaque visite, le site interroge l'API Jolpica-F1 (calendrier, résultats des Grands Prix et des
sprints, poles, classements officiels). Les réponses sont gardées 30 minutes dans le navigateur. Les nouveaux résultats
apparaissent dès que l'API est mise à jour, en général quelques heures après chaque course. Si l'API ne répond pas, le
site affiche les données de `js/data.js` (l'indicateur en haut à droite précise la source utilisée).

**Manuelle (facultatif).** Pour mettre à jour la copie intégrée, ajoutez une entrée dans `results` dans `js/data.js`.
Les identifiants des pilotes sont ceux de la liste `drivers` du même fichier (par exemple `max_verstappen`,
`arvid_lindblad`). Les points et les classements sont recalculés automatiquement.

```js
18: {
  race: ["id_du_vainqueur", "id_du_2e", "id_du_3e" /* … tous les pilotes classés, dans l'ordre */],
  dnf: ["id_d_un_pilote_qui_a_abandonné"],   // abandons (facultatif)
  dns: [],                                   // non-partants (facultatif)
  pole: "id_du_poleman",
  fastestLap: "id_du_pilote_auteur_du_meilleur_tour"
  // sprint: ["…les 8 premiers du sprint…"]  pour un week-end sprint
},
```

Pensez aussi à mettre à jour `snapshot` (date, numéro de manche et libellé) en haut du fichier.

## Personnaliser

- `js/config.js` : nom du site, désactivation de la mise à jour automatique (`liveData: false`), durée du cache,
  adresse de votre dépôt GitHub (`repoUrl`, affichée dans le pied de page).
- `js/data.js` : couleurs des écuries (`color` pour le thème clair, `colorDark` pour le thème sombre).
- `css/style.css` : couleurs générales du site, regroupées au début du fichier (`:root`).

## Sources et crédits

- Résultats, calendrier et horaires : [formula1.com](https://www.formula1.com/fr), Wikipédia et l'API Jolpica-F1.
  Les données intégrées ont été recoupées le 19 octobre 2026 : la somme des points de chaque manche redonne exactement
  les classements officiels des 23 pilotes et des 11 écuries.
- Police [Archivo](https://fonts.google.com/specimen/Archivo) (Google Fonts, licence SIL Open Font License).
- Drapeaux : [flagcdn.com](https://flagcdn.com/).
- Carte : [Leaflet](https://leafletjs.com/), fonds de carte © [CARTO](https://carto.com/attributions),
  données © [OpenStreetMap](https://www.openstreetmap.org/copyright).

Site de fan non officiel, sans lien avec la Formule 1, la FIA ou les écuries. F1, Formula 1 et les marques associées
appartiennent à Formula One Licensing B.V.

## Licence

Le code du site est distribué sous licence MIT (fichier `LICENSE`). Leaflet conserve sa propre licence
(`vendor/leaflet/LICENSE`).
