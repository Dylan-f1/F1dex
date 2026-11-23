# Doc design — F1 Dex

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
