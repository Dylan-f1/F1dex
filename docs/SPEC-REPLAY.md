# Spec — Lecteur de tour (rejouer un pilote sur le circuit)

Demande de Dylan (2026-11-23) : « je vais sur Suzuka, je choisis Max Verstappen, je vois sa voiture se déplacer, je vois son temps, je peux zoomer et tout ».

## Objectif

Sur la fiche course `/gp/[sessionKey]`, le panneau du tracé devient un **lecteur** : choisir un pilote et un tour, voir sa voiture parcourir le circuit avec le chrono, zoomer et déplacer la vue.

« Choisir le circuit » = le calendrier existant (bandeau en haut) : on ne duplique pas ce choix.

## Comportement

| Élément | Règle |
|---|---|
| Pilote | Tous les pilotes ayant au moins un tour chronométré (abandons compris). Défaut : le pilote du meilleur tour de la course. |
| Tour | Liste des tours chronométrés du pilote (« Tour 43, 1:22.167 »). Défaut : son meilleur tour propre. Tours d'entrée/sortie des stands inclus, signalés. |
| Lecture | Lecture / pause, vitesse ×1 ×2 ×4 ×8, curseur de position dans le tour. Jamais de lecture automatique. À la fin du tour : pause en fin de tour, « Rejouer » revient au début. |
| Chrono | Temps écoulé du tour en direct (`m:ss.mmm`) et temps total du tour ; secteur en cours (S1/S2/S3) mis en évidence avec son temps. |
| Voiture | Point à la couleur d'écurie avec le code du pilote (texte en `ink`, jamais en couleur d'écurie : contraste). |
| Zoom / déplacement | Molette (zoom vers le curseur), glisser, pincer au doigt, boutons + / − / « Tout voir », clavier (flèches, + et −). Option « Suivre la voiture ». Zoom de ×1 à ×12. |
| Numéros de virage / pastilles | Gardent une taille lisible (≈ 13 px) quelle que soit la valeur du zoom. |

## Données

- Tracé : MultiViewer (déjà en place). Position : OpenF1 `/location` (≈ 3,7 échantillons par seconde, repère identique, vérifié), fenêtre = le tour choisi (≈ 330 échantillons).
- Nouvelle route `GET /api/replay/[sessionKey]/[driver]/[lap]` : deux appels OpenF1 (`/laps` pour début, durée et secteurs, puis `/location`), mis en cache 1 jour (`use cache` dans un helper, `lib/openf1.js`), limiteur de débit existant réutilisé. Paramètres validés (chiffres seulement).
- Interpolation linéaire entre échantillons côté client (fonction pure testée).

## Limites assumées

- Un seul pilote et un seul tour à la fois (pas de course entière, pas de duel). Suite possible : deux pilotes sur le même tour (fantômes), course entière.
- Position à ≈ 3,7 Hz interpolée : la trajectoire est lissée, pas exacte au mètre.
- Sur écran tactile : le glissement sur la carte ne fait défiler la page que lorsque la vue n'est pas zoomée.
- Données absentes (pas de `/location` pour cette course) : message clair, le reste de la fiche fonctionne.

## Critères de réussite

1. Choisir un pilote et un tour charge ≤ 3 s (première fois), instantané ensuite.
2. Les horodatages sont alignés : aux instants S1, S1+S2 et fin de tour, la voiture se trouve près du trait de secteur correspondant (mesuré à Suzuka avec Verstappen, tour 52 : 21 m au trait S1, 58 m au trait S2, 11 m de la ligne au départ et 10 m à l'arrivée). Le chrono final est égal au temps du tour par construction, ce n'est donc pas un test.
3. Zoom et déplacement fonctionnent à la souris, au doigt et au clavier ; la page ne défile pas pendant le zoom à la molette sur la carte.
4. Erreur réseau, tour sans données, 1 seul échantillon : message, pas de plantage.
5. Lecture à 60 i/s sans re-rendre React à chaque image (la voiture et le chrono sont mis à jour hors du cycle de rendu).
6. `npm run lint`, `npm test`, `npm run build` OK ; console sans erreur ; captures 1440 / 500 px.
