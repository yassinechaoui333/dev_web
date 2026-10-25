# Sales & Data Quality Platform

MVP collaboratif : **CSV → exploration → analyse → dashboard enregistré → partage**.

## Démarrage simple

Prérequis : Node.js **22.12+**, npm et Docker avec Compose (intégration Ubuntu activée si vous utilisez WSL).

```sh
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Ouvrir **http://localhost:5173**. API : http://localhost:3001/api/health.
Sous PowerShell, remplacer la première commande par `Copy-Item .env.example .env`.
Si 5432 est occupé, choisir par exemple `DB_PORT=55432` et remplacer le port dans `DATABASE_URL` par `55432` dans .env.
Une installation PostgreSQL existante peut remplacer Docker : adapter DATABASE_URL et omettre la commande Docker.

| Compte fictif | Email | Mot de passe de développement |
|---|---|---|
| Administrateur | yassine@example.test | DevAdmin123! |
| Analyste | member@example.test | DevMember123! |

Le seed ne réinitialise pas les comptes existants. Ne pas utiliser les données/identifiants de développement en production.

## Démonstration en quelques minutes

1. Se connecter avec l'analyste et ouvrir **Datasets**.
2. Créer un dataset en GBP ; télécharger ou importer [ventes-demo.csv](fixtures/ventes-demo.csv).
3. Attendre **Terminé** : 8 lignes acceptées, 2 rejetées ; consulter le rapport.
4. Ouvrir **Analyses** : CA net **141,75 GBP**, **6** commandes, panier moyen **23,63 GBP**, qualité **90/100**.
5. Créer un dashboard avec les widgets prédéfinis et enregistrer ses filtres.
6. Le partager avec `yassine@example.test`, vérifier la lecture seule dans une autre session puis révoquer l'accès.
7. Avec l'administrateur, consulter **Administration** pour les utilisateurs, datasets et activités.

## Répartition fonctionnelle

- **Yassine** : socle, authentification, permissions, profil et administration.
- **Ahmed** : datasets, import CSV, validation, traitements et rapports de rejet.
- **Taha** : exploration, indicateurs, qualité, IQR et comparaison.
- **Abdelali** : graphiques Recharts, dashboards enregistrés et partage.

Les quatre modules sont intégrés. Le worker d'import démarre automatiquement avec le serveur, sans Redis ni service supplémentaire. Les fichiers originaux sont conservés dans PostgreSQL pour la reprise des imports.

## Vérification

```sh
npm run build
npm test
```

Utiliser une base de développement/test migrée. Les tests créent et suppriment leurs propres comptes et fixtures. Arrêter le serveur de développement avant les tests, ou utiliser une base distincte, pour éviter que son worker traite les jobs de test.
La CI lance ses propres PostgreSQL et tests. Les captures navigateur montrent des données fictives.

## Livrables et documentation

- [Rapport détaillé français — 20 pages](deliverables/rapport-detaille-fr-20-pages.pdf)
- [Présentation détaillée — 18 diapositives PowerPoint](deliverables/presentation-detaillee-fr-18-diapos.pptx)
- [Présentation détaillée — PDF de 18 pages](deliverables/presentation-detaillee-fr-18-diapos.pdf)
- [Notes pour les 18 diapositives](docs/notes-soutenance-detaillee-fr.md)

Les versions courtes initiales restent disponibles dans `deliverables/`. Le rapport détaillé contient le sommaire, les responsabilités fonctionnelles des quatre membres, l’architecture, les règles métier, les captures réelles, les résultats vérifiés et les limites du MVP.
- [Architecture et limites](docs/architecture.md)
- [Contrat OpenAPI](docs/api-contract.yaml)
- [Données et calculs communs](docs/data-contract.md)
- [Méthodes qualité et IQR](docs/analytics-conventions.md)
- [État d'intégration](docs/team-status.md)

Le projet privilégie un MVP local : fichiers de 10 Mio maximum, 100 000 lignes par import, worker simple. Il ne fournit pas encore la récupération de mot de passe, le MFA ou une configuration de production complète.
