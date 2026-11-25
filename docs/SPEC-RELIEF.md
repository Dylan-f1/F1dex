# Relief de la conduite (demandé par Dylan le 2026-11-25)

Choix de Dylan : **relief visible et effet sur la conduite**, au dénivelé réel (pas amplifié). Le « et autre » de sa demande reste à préciser.

## Données

- `scripts/relief.mjs` lit `location.z` d'OpenF1 (5 tours rapides par course, saison 2025), rapporte chaque point au tracé MultiViewer et écrit `lib/relief-data.js` (un relevé tous les 20 m, lissé). Fichier généré, versionné : aucun appel supplémentaire à l'exécution.
- Mesuré à la génération : 24/24 circuits, 100 % du tour, écart médian au tracé 0,1 à 3,8 m. Dénivelés : Spa 102 m, Spielberg 63 m, Interlagos 43 m, Monaco 41 m, Mexico 2,6 m.
- Circuit fictif : relief **inventé** (environ 14 m), signalé comme tel.

## Rendu

- Piste, bords, vibreurs, gravier et murs suivent l'altitude de la piste.
- Terrain (`lib/terrain.js`) : grille de hauteurs calée sur la piste proche, adoucie au loin ; là où deux tronçons se superposent (Suzuka), le sol passe sous le plus bas (le haut devient un pont).
- **Murs de soutènement** (béton uni) là où la piste domine le sol de plus de 0,45 m, sauf au-dessus d'un tronçon plus bas. Mesuré sur les 24 circuits : seuls Monaco (jusqu'à 11 m) et Suzuka (6 m) en ont besoin au bord de la piste.
- Barrières : toujours visibles, même dans un talus (aucun obstacle invisible).
- Voiture : au niveau de la piste jusqu'au bord du revêtement, puis posée sur l'herbe ; inclinée selon la pente ; la caméra suit.
- Décor posé sur le sol ; tribunes et stands découpés en tronçons pour suivre la pente.
- Herbe teintée selon l'altitude (sombre en bas, claire en haut) : **couleurs à valider par Dylan**, comme le béton `#3a404a`.

## Physique (`PHYSICS_VERSION` 6 : meilleurs tours remis à zéro)

- La pente ajoute ou retire de la vitesse (composantes avant et latérale).
- Bosses et creux changent la charge sur les pneus (bornée entre 0,55 et 1,7).
- À l'arrêt sans gaz ni frein, la voiture est tenue (pas de recul sur la grille).

## Non couvert

- Dévers (virages relevés) : aucune donnée.
- Altitude lissée sur environ 25 m : les petites bosses n'apparaissent pas.
- Le pont de Suzuka n'a ni épaisseur ni piles ; à Monaco, aucun bâtiment, seulement des murs.
- Shanghai : les relevés OpenF1 tombent à 3,8 m du tracé en médiane (0,9 m au plus ailleurs), altitude un peu moins sûre.
- En coupant l'herbe entre deux tronçons de hauteurs différentes, la voiture peut monter ou descendre brusquement.

## Vérification (2026-11-25)

- 178 tests, lint et build OK. Pilote automatique : un tour de Monaco, Suzuka et Interlagos avec leur vrai relief. Il doit être un peu plus prudent qu'à plat (adhérence supposée 0,6 au lieu de 0,7) : avec les aides fortes, il déborde de 2 m à l'épingle en descente de Monaco.
- Chrome (rendu logiciel, tactile émulé 844×390), circuit fictif, Spa, Suzuka, Monaco, Spielberg : 6/6, captures regardées, console sans erreur. Son et roues 26/26, joystick 56/56. Scripts dans le scratchpad, pas dans le dépôt.
- Calcul du sol, une fois par circuit en tâche de fond : 40 à 330 ms avec Node sur le PC, jusqu'à 1,6 s pendant que Chrome tournait en rendu logiciel.
- **Non vérifié** : vrai téléphone (fluidité, durée du calcul), GPU réel, tour complet à la main, les 20 autres circuits à l'œil.
