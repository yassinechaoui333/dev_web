# État d’intégration

Le MVP complet est implémenté sur **feature/auth-admin**, à la demande de Yassine du 25 octobre 2026. Les noms ci-dessous indiquent la répartition fonctionnelle convenue de l’équipe.

| Membre | Module | État |
|---|---|---|
| Yassine | Socle, comptes, permissions, profil, administration | Intégré et vérifié |
| Ahmed | Datasets, CSV, jobs, validation, rejets et reprise | Intégré et vérifié |
| Taha | Exploration, indicateurs, qualité, IQR, comparaisons | Intégré et vérifié |
| Abdelali | Graphiques, dashboards, filtres et partage | Intégré et vérifié |

Fondation historique : foundation-v1.1 / 5ac57d64b7ac1056ac2ec58944d03285d8301838. Les nouveaux changements restent sur la branche de travail ; une fusion dans main se fait après revue, sans écraser un travail distant.

## Vérifications
- Migrations réelles sur PostgreSQL 16 via Docker et seed répété.
- Builds TypeScript client/serveur.
- 12 tests automatisés : sécurité, import réel, erreurs et reprise, dates, calculs, filtres, qualité, IQR, dashboards et partages.
- Navigateur : CSV, rapport des rejets, exploration, qualité, comparaison, création de dashboard, partage en lecture seule, révocation, administration et affichage mobile.
- Rapport de 4 pages en français et présentation de 10 diapositives ; responsabilités des quatre membres indiquées.

## Limites assumées
MVP pour petits volumes : 10 Mio et 100 000 lignes par import, worker simple dans le processus API, fichiers stockés en base. Les limites de production et les fonctions de compte non prévues sont documentées dans architecture.md. Pas de déploiement automatique ni de dashboards publics. Les données fournies sont fictives.
