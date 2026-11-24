# Raccourcis du projet SpeedTrack Paddock. Lancer `make` seul affiche la liste des commandes.
# Les recettes n'utilisent que npm et node : elles marchent sous Windows, Linux et macOS.

.DEFAULT_GOAL := help
.PHONY: help install dev build start lint test check clean

help:
	@echo "Commandes disponibles :"
	@echo "  make install   Installer les dépendances"
	@echo "  make dev       Lancer le serveur de développement (http://localhost:3000)"
	@echo "  make lint      Vérifier le code avec ESLint"
	@echo "  make test      Lancer les tests unitaires"
	@echo "  make build     Construire la version de production"
	@echo "  make start     Lancer la version de production (après make build)"
	@echo "  make check     Lint, tests puis build : à lancer avant un rendu"
	@echo "  make clean     Supprimer le dossier .next"

install:
	npm install

dev:
	npm run dev

lint:
	npm run lint

test:
	npm test

build:
	npm run build

start:
	npm run start

check: lint test build

clean:
	node -e "require('node:fs').rmSync('.next', { recursive: true, force: true })"
