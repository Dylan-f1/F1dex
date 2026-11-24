# SpeedTrack Paddock

Un outil en plus de SpeedTrack. [Lien vers SpeedTrack : À FOURNIR]

Application front (React + Next.js) qui montre, pour chaque Grand Prix de la saison 2025, la stratégie de pneus de chaque pilote (relais, arrêts aux stands) et un duel de rythme entre deux pilotes (temps au tour).

Données : [OpenF1](https://openf1.org), API publique sans clé.

## Lancer le projet

Prérequis : Node.js 22 ou plus (les tests utilisent `node --test` avec un motif de fichiers, absent de Node 20), et `make`.

```
make install   # installer les dépendances
make dev       # serveur de développement sur http://localhost:3000
```

La première visite d'une course prend quelques secondes (appels à OpenF1, espacés pour respecter sa limite de débit), puis elle est mise en cache un jour.

## Commandes (Makefile)

| Commande | Rôle |
|---|---|
| `make` | afficher la liste des commandes |
| `make install` | installer les dépendances |
| `make dev` | serveur de développement |
| `make lint` | vérifier le code (ESLint) |
| `make test` | lancer les tests unitaires (`node --test`, aucune dépendance en plus) |
| `make build` | construire la version de production |
| `make start` | lancer la version de production (après `make build`) |
| `make check` | lint, tests puis build, à lancer avant un rendu |
| `make clean` | supprimer le dossier `.next` |

## Structure

- `app/` : pages (accueil = calendrier, `gp/[sessionKey]` = fiche d'une course).
- `components/` : tour de chrono, barres de pneus, duel de rythme, légendes.
- `lib/` : appels OpenF1 (avec cache), transformation des données, calculs du duel, logique des favoris.
- `tests/` : tests unitaires (favoris, calculs du duel).
- `docs/` : état du projet, décisions, doc design.
- `design/` : maquettes HTML jetables (pas du code de l'application).

## Technologies

Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4.
