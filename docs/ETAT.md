# État du projet — F1 Dex (nom provisoire)

## Reprendre ici

- **Objectif** : projet B3 Front. Dex des Grands Prix F1 : calendrier, fiche course avec stratégie pneus (relais, arrêts), duel de rythme entre deux pilotes. Angle volontairement différent de SpeedTrack.
- **Stack** : Next.js 16.4.6 (App Router, Cache Components), React 19, JavaScript, **Tailwind v4 uniquement** (aucun fichier CSS écrit à la main, consigne de Dylan). Données : API OpenF1, saison 2025.
- **DA retenue** : « Retransmission » (tour de chrono TV), voir `DESIGN.md`. Des points restent à modifier, **à préciser par Dylan**.
- **Fait (2026-11-23)** : projet scaffoldé et installé ; accueil `/` (calendrier 24 GP) ; fiche course `/gp/[sessionKey]` fidèle à la maquette (bandeau, faits météo, tour de chrono avec barres de pneus, duel de rythme) ; pages d'erreur et 404 ; `npm run lint` propre, `npm run build` OK. Vérifié en captures à 1440 px et 500 px (la capture à 375 px n'est pas possible en Chrome headless : fenêtre minimale 500 px).
- **Fait (2e passe, 2026-11-23)** : légende des pneus complète (5 gommes + arrêt + DNF + DSQ) sous « Course et stratégie », légende propre au duel ; **favoris de Grands Prix** (étoiles, filtre Favoris, persistance `localStorage`) ; 17 tests unitaires (`npm test`) ; test de bout en bout dans Chrome via DevTools (23/23 : clic réel, persistance au rechargement, stockage corrompu, changement de pilotes du duel, focus clavier, Entrée, console sans erreur). Ce script est dans le scratchpad de session, **pas dans le dépôt**.
- **Fait (3e passe, 2026-11-23)** : **tracé du circuit** sur `/gp/[sessionKey]` (MultiViewer, virages numérotés, voir DECISIONS). Vérifié : captures 1440 px (Melbourne, Monza, Monaco, Hungaroring) et 500 px (Monaco), console sans erreur sur 3 courses, `npm run lint`, `npm test` (23/23), `npm run build`, duel toujours `sticky` (colonnes de même hauteur), et **panne de MultiViewer simulée** (URL cassée : page en 200, pas de panneau, colonne refermée). **Non vérifié** : les 20 autres circuits à l'œil (les données répondent toutes, mais pas de capture), 375 px, audit Impeccable et `break-ui` non lancés sur ce composant. Correction annexe : clés en doublon dans `TyreBar` (badge d'erreurs Next à Monaco).
- **Fait (4e passe, 2026-11-23)** : **secteurs** S1/S2/S3 sur le tracé + temps de secteur du meilleur tour ; barre de défilement du calendrier masquée ; audit Impeccable (17/24, détecteur propre) et break-ui du tracé : **défauts trouvés, non corrigés** (virage sans angle ou sans position, collisions de numéros sur Jeddah/Silverstone, circuits étroits trop petits) ; route de test `/dev/track`. 28 tests, lint et build OK. **Non vérifié** : secteurs sur 21 circuits sur 24, 375 px.
- **Fait (5e passe, 2026-11-23)** : **lecteur de tour** sur la fiche course (voir DECISIONS et `docs/SPEC-REPLAY.md`). Testé dans Chrome sur l'exemple de Dylan (Suzuka, Verstappen, tour 52) : lecture et chrono, zoom molette sans défilement de page, glisser, suivi de la voiture, changement de pilote en pleine lecture, panne réseau + « Réessayer », colonnes de même hauteur (duel `sticky`), 500 px sans débordement, console sans erreur. 40 tests, lint et build OK. **Non testé** : écran tactile réel (pincer), autres circuits, lecteur d'écran.
- **Git** : `git init` fait, `origin` = https://github.com/Dylan-f1/F1dex.git, **rien de commité ni poussé** (accord de Dylan requis ; à décider avant : `design/` = maquettes jetables, `.impeccable/` = archive de critiques).
- **Défauts break-ui** : les n°1 et 2 (virages incomplets) sont corrigés ; restent les collisions de numéros (Jeddah, Silverstone) et les circuits étroits (Jeddah).
- **Idée en attente : modèle 3D d'une F1** (Meshy, proposé par le prof). Dépend de Dylan : accord pour installer une bibliothèque 3D, fichier `.glb` à produire par lui dans Meshy (compte et conditions de licence à vérifier), emplacement dans l'interface.
- **Pas encore fait** : recherche sur le calendrier, favoris de pilotes, titres de page par course, scroll du calendrier vers la course courante (la pastille `aria-current` de Las Vegas est hors écran), vérification 375 px, audit anti-IA complet, choix de la saison, git, refactor du couplage (voir DECISIONS).
- **Makefile créé** (exigence du prof) + `README.md` : écrits, **non testés**. `make` n'est pas installé sur le poste ; Dylan a autorisé l'installation mais l'outil de permissions a refusé `winget install` : Dylan doit lancer lui-même `! winget install --id ezwinports.make -e`, puis rouvrir le terminal. Sous Windows sans `sh`, `make` passe par `cmd.exe` où les `@echo "..."` peuvent afficher les guillemets (problème Windows seulement).
- **Inconnu** : le reste de l'énoncé du projet (fonctions obligatoires). On sait seulement : Next.js imposé, Makefile ou Justfile exigé. À ne pas redemander en boucle ; vérifier avec Dylan quand il tranche les modifications.
- **Prochaine action** : installer `make` et tester le Makefile ; recueillir les modifications de Dylan sur la DA ; décider avec lui du refactor du couplage, des favoris de pilotes et de la recherche.

## Lancer en local

`npm run dev` (http://localhost:3000). Première visite d'une course : environ 4 s (7 appels OpenF1 espacés), ensuite en cache (1 jour).

## Sources de données

OpenF1 `https://api.openf1.org/v1` (testé le 2026-11-23) : `sessions`, `session_result`, `drivers`, `stints`, `pit`, `laps`, `weather`. Limite de débit : 429 au-delà de quelques requêtes par seconde, d'où le limiteur de `lib/openf1.js` (500 ms entre appels, reprise avec `Retry-After`). Jolpica (historique) ne répondait pas depuis ce poste : non utilisée.

## Structure

- `lib/` : `constants.js`, `format.js`, `race-model.js` (API brute vers modèle compact), `lap-duel.js` (calculs du duel), `openf1.js` (appels, cache `use cache`), `multiviewer.js` (tracé du circuit, repli `null`), `track.js` (tracé brut vers SVG et repères de secteur, logique pure), `dev/track-fixtures.js` (données extrêmes pour `/dev/track`), `favorites.js` (logique pure), `favorites-storage.js` (localStorage), `use-favorites.js` (hook).
- `components/` : `Tower`, `TowerLegend`, `TyreBar`, `LowerThird`, `RaceFacts`, `Ribbon`, `TrackMap`, `CalendarGrid` + `FavoriteButton` + `DuelPanel` + `LapChart` (clients).
- `tests/` : tests unitaires `node --test`.
- `app/` : `page.jsx` (accueil), `gp/[sessionKey]/` (page, error), `dev/track/` (route de test, 404 en production), `not-found.jsx`, `globals.css` (import Tailwind + jetons de la DA).
- `design/` : maquettes HTML jetables (v1 rejetée, v2 = 3 pistes dont Retransmission). Ne pas livrer.
