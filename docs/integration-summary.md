# Intégration du MVP complet

La fondation et la partie Yassine ont été livrées dans les premiers commits. À la demande explicite de Yassine, les trois autres modules ont ensuite été complétés dans leurs dossiers prévus. Aucune seconde couche d’authentification ou de base de données n’a été ajoutée.

## Modules livrés
- Authentification, sessions HttpOnly, profil, rôles et administration.
- Métadonnées des datasets, CSV limité, validation, empreinte, traitement asynchrone, historique, rejets, reprise et suppression.
- Exploration paginée, recherche/tri autorisés, filtres communs, CA/commandes/panier, produits/pays/temps, qualité, IQR et comparaison.
- Graphiques Recharts, configuration sauvegardée, filtres communs, renommage/suppression et partage révocable en lecture seule.

## Vérification
Les migrations sont exécutées sur PostgreSQL 16 via Docker. Les builds et 12 tests automatisés couvrent le parcours et ses principales restrictions. Une vérification navigateur confirme l’import, les rapports, les analyses, la sauvegarde, le partage/révocation et le mobile. Les valeurs de fixtures/README.md sont calculées manuellement et vérifiées par les tests.

## Contrats
OpenAPI version 1.1.0. Les ajouts sont listés dans contract-changelog.md. La migration additionnelle ImportSource ne modifie pas les migrations précédentes. Les règles de devise, retours et calculs décimaux sont conservées. La sélection de dates de l’UI est clairement en UTC.

## Exécution et soutenance
README.md contient les commandes exactes et les comptes fictifs. Le worker démarre avec l’API. deliverables/ contient le rapport français et la présentation avec la répartition fonctionnelle Yassine/Ahmed/Taha/Abdelali. docs/notes-soutenance-fr.md propose un scénario court.

## Limites
Le MVP fonctionne localement pour les limites de fichiers annoncées. Il ne prétend pas fournir une infrastructure de production, des prévisions ML, la récupération de mot de passe ou des dashboards publics. Les fichiers sont stockés en base et le worker reste volontairement simple. Les graphiques circulaires excluent les groupes nonpositifs avec un avertissement visible ; les KPI incluent les retours.
