# Doc design — SpeedTrack Paddock

Direction retenue par Dylan le 2026-11-23 : **« Retransmission »**. Modifications à venir (à préciser par Dylan). Les pistes « Pneu » et « Livrée » sont gardées en référence dans `design/directions-v2.html`.

## Contrainte transverse

`~/.claude/studio/ANTI_IA.md` : pas d'Inter/Roboto/Poppins, pas de dégradé violet-bleu, pas de hero centré + 3 cartes, pas de faux contenu (`[À FOURNIR]`), une signature par projet, retirer au moins un effet superflu. Différencier de SpeedTrack (fond `#131313`, accent `#e10600`, Schibsted Grotesk, trajectoire).

## Concept

L'écran se lit comme l'habillage d'une retransmission TV : le tour de chrono. Une ligne par pilote, dans l'ordre d'arrivée, avec une barre qui raconte sa stratégie de pneus.

## Signature

- **Case de position inclinée** (blanc, clip-path) et **bandeau « lower third »** blanc incliné pour le nom du Grand Prix.
- **Barre de pneus** : un segment par relais, couleur du pneu, lettre S/M/H, encoche blanche à chaque arrêt aux stands.
- Violet réservé au **meilleur tour** de la course.

## Typographie

Saira Condensed (titres, chiffres, italique synthétique, 500/700/800) + Saira Semi Condensed (texte, 400/500/600), via `next/font`. Chiffres en `tabular-nums` dans les colonnes de temps.

## Couleurs (jetons dans `app/globals.css`)

| Jeton | Valeur | Rôle |
|---|---|---|
| `bg` | `#0c0f14` | fond |
| `panel` | `#141922` | lignes et panneaux |
| `track` | `#06080b` | rail de la barre de pneus |
| `line` | `#262f3d` | filets du graphique |
| `ink` | `#eef1f5` | texte |
| `mute` | `#9aa5b5` | texte secondaire (contraste > 7:1 sur `panel`) |
| `fastest` | `#b138dd` | meilleur tour |
| `tyre-*` | rouge `#da291c`, jaune `#ffd100`, blanc `#f2f2f2`, vert `#43b02a`, bleu `#0067ad` | code couleur des pneus F1 |

La couleur d'écurie vient des données OpenF1 (repère à gauche de chaque ligne), jamais en texte (contraste non garanti).

## Mise en page

Deux colonnes au-dessus de 1000 px (tour de chrono, duel de rythme collant), une colonne en dessous. Sous 721 px la tour garde position, code, barre et écart ; le nom et les arrêts disparaissent. Calendrier en bandeau défilant en haut de la fiche.

**Légendes (2026-11-23, retour de Dylan)** : chaque bloc a la sienne, jamais mélangées. Sous « Course et stratégie » : pneus Tendre / Medium / Dur, encoche blanche = arrêt aux stands, DNF = abandon, DSQ = disqualifié (`TowerLegend`). Sous le graphique du duel : une ligne par pilote comparé (tiretée si même écurie) et le point violet du meilleur tour quand il est sur le graphique (`DuelLegend`).

**Tracé du circuit (2026-11-23)** : panneau `bg-panel` aligné sur la colonne du duel, au-dessus de lui, au niveau des faits météo. Trait blanc (`ink`) sur un halo `line`, numéros de virage en `mute` (Saira Condensed, environ 13 px à l'écran quelle que soit la forme du circuit). Pas de couleur d'accent : rouge = pneu tendre et violet = meilleur tour dans cette DA.

**Secteurs (2026-11-23)** : trois pastilles blanches inclinées « S1 S2 S3 » (même inclinaison que la case de position), posées sur le tracé, et un trait perpendiculaire à la ligne de départ et à chaque fin de secteur. Sous le tracé, trois cellules `track` avec le temps de chaque secteur du meilleur tour (chiffres en `tabular-nums`). Aucune couleur : les couleurs des pneus et le violet du meilleur tour restent réservés à leur sens.

## À renseigner

Modifications demandées par Dylan, références « très F1 » éventuelles, audit anti-IA (retirer un élément décoratif avant livraison).

## Garage 3D (2026-11-23, mis à jour 2026-11-24)

Page `/garage` : une monoplace de F1 en 3D, aux couleurs de l'écurie. Même langage que le reste : bandeau blanc incliné « GARAGE », panneau `panel`, liste d'écuries façon tour de chronométrage (liseré de la couleur d'écurie à gauche, nom en Saira Condensed). Le viewport est sur `track` (comme la carte du circuit) ; le sol reprend la carte : asphalte `panel`, bordure `line`, trait blanc `ink`. **Signature** : le bandeau lower-third sur le viewport (nom de l'écurie en blanc incliné + codes pilotes), comme un habillage de retransmission. Retiré : ombre de contact floue, reflets, halo.

**Le modèle de voiture** est un `.glb` reconstruit par IA (`public/models/f1.glb`), **par décision explicite de Dylan** : la première version en formes simples (`lib/car-model.js`) « ne ressemblait à rien par rapport aux F1 » (2026-11-24). C'est donc une exception justifiée à la règle « pas d'illustrations IA génériques » de `ANTI_IA.md`, avec ces garde-fous :
- **Aucune illustration IA n'est affichée** : l'image générée (FLUX.1-schnell, Apache 2.0) ne sert que d'entrée à la reconstruction (TRELLIS, MIT) ; seul le modèle 3D est montré, et il est annoncé comme généré par IA sous la visionneuse.
- **Pas d'écurie réelle ni de marque** : image de F1 neutre, sans logo ; les livrées sont approchées en 4 zones par écurie (`lib/liveries.js` : carrosserie, ailerons, liserés, arête du capot) et appliquées par un shader sur la carrosserie seulement (pneus, carbone et bandes de gomme jaunes inchangés). Le liseré de la liste et le bandeau gardent la couleur OpenF1.
- **Pas de rendu « 3D glossy »** : matière mate (`roughness 0.7`, `metalness 0`), pas de carte d'environnement, pas de halo. Le sol et le bandeau gardent la DA « Retransmission ».
- **Proportions corrigées au chargement (2026-11-25)** : 2 m de large, 3,6 m d’empattement ; bords de livrée nets, faux emblème et faux numéro recouverts.
- **Limites assumées** : surfaces cabossées, arrière déchiqueté, voiture un peu haute, pas de numéro ni de sponsor. Hunyuan3D-2 (meilleure qualité vue) écarté : sa licence exclut l'UE. Détails et paramètres de génération dans `docs/DECISIONS.md`.

La voiture en formes simples (`lib/car-model.js`) reste **en repli** si le `.glb` ne charge pas (la légende le dit alors). Caméras dans `lib/car-camera.js`, scène dans `components/use-car-scene.js`.

**Voiture en code, à comparer (2026-11-25)** : `/garage?voiture=code` affiche une monoplace entièrement construite en code (surfaces lisses, livrée en quatre zones nettes, matières satinées, sans logo). **Choix entre les deux voitures : à faire par Dylan.**

**Conduite (2026-11-24)** : bouton « Conduire » dans la rangée de commandes de la visionneuse. En conduite, les angles de caméra et la rotation automatique sont désactivés, le texte d'aide remplace la légende, et la visionneuse passe à 460 px de haut sur mobile pour laisser la voiture au-dessus des boutons tactiles. Tableau de bord superposé : vitesse en grand (haut gauche), tour en cours et meilleur tour en violet (haut droit), « Hors piste » sur fond jaune. Piste sans vibreurs ni décor : asphalte, deux traits blancs et une ligne de départ, comme la carte du circuit. Détails et limites dans `docs/DECISIONS.md`.

**Conduite v2 (2026-11-24)** : liste « Circuit » sous les commandes de la visionneuse (16 px sur appareil tactile contre le zoom iOS). Tableau de bord : vitesse et rapport en grand (haut gauche), drapeaux jaunes empilés dessous (« Hors piste », « Tour supprimé »), bouton « Quitter » en dessous sur tactile ; chrono du tour, écart au meilleur, trois secteurs, dernier et meilleur tour en haut à droite (chrono barré si le tour est supprimé) ; cinq feux de départ au centre pendant le départ. Aucune couleur nouvelle : violet `fastest` pour le meilleur, jaune `tyre-medium` pour les drapeaux, rouge `tyre-soft` pour les feux. Détails dans `docs/DECISIONS.md`.

**Conduite v3 (2026-11-24)** : panneau « Conduite » (fond `panel`) sous les boutons de caméra : listes Circuit et Aides à la conduite (étiquettes en petites capitales grises), bouton Conduire en Saira gras, phrase d'explication du niveau d'aides sous les listes. Aucune couleur nouvelle.

**Conduite v4 (2026-11-24)** : décor de piste 3D : vibreurs rouge `tyre-soft` et blanc `ink`, gravier gris brun `#4f4a42`, mur de pneus clair `#c9ced6` et sombre `#2a3240`, herbe vert très sombre `#10231a` (remplace le noir bleuté). Matériaux de scène, hors jetons d'interface ; à valider par Dylan. Nouveaux drapeaux jaunes « Gravier », « Vibreur » et « Contre le mur : remise en piste ».

**Conduite v5 (2026-11-24)** : bouton « Plein écran » (panneau Conduite ; bouton-icône en haut au centre du cadre pendant la conduite ou en plein écran ; touche F). Décor de scène : tribunes avec public en points de couleur (rouge `tyre-soft`, blanc `ink`, jaune `tyre-medium`, gris `mute`, bleu et orange), toits acier `#1b2230`, bâtiment des stands `#3d4859`, portique à lampes grises, panneaux de freinage rouge et blanc, arbres vert sombre. Matériaux de scène, hors jetons d'interface ; à valider par Dylan.

**Conduite : son et roues (2026-11-25)** : bouton « Son du moteur » dans le panneau Conduite (inversé quand il est actif, comme « Plein écran ») ; dans le cadre, bouton-icône haut-parleur (barré quand coupé) sous le bouton plein écran. Roues construites en code : pneu sombre au profil arrondi, bande jaune `#c9a417`, marquages gris (`--color-mute`) en deux groupes sur le flanc, trois repères en travers de la bande de roulement, jante gris foncé à cinq branches. Allure à valider par Dylan.

**Garage sur téléphone (2026-11-25, choix de Dylan)**, sous 1001 px : titre lower-third sur une ligne (téléphone), voiture, **bande d’écuries à glisser** (liseré de couleur, écurie choisie inversée en blanc), caméras sur une rangée qui glisse, « Conduire » pleine largeur, « Réglages de conduite » repliés avec résumé. En conduite sur téléphone : plein écran, sans le bandeau d’écurie, boutons tactiles en bas. Cibles d’au moins 44 px au doigt. Variante Tailwind `compact:` (téléphone) dans `app/globals.css`.
