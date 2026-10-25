# Notes simples pour la soutenance

Durée conseillée : 8 à 10 minutes, puis une démonstration.

1. **Présentation** — annoncer l’objectif : exploiter un CSV de ventes et partager les résultats.
2. **Parcours** — import, exploration, analyse, visualisation, partage.
3. **Architecture** — React pour le client, Express pour l’API, PostgreSQL et Prisma pour la base.
4. **Répartition fonctionnelle** — Yassine : socle/comptes/admin ; Ahmed : imports ; Taha : analyses ; Abdelali : dashboards et partage.
5. **Ahmed** — expliquer les valeurs d’origine, la validation, les jobs et le rapport de rejet. Le même fichier est bloqué par son empreinte.
6. **Taha** — distinguer lignes et commandes. Montrer le score et les signalements IQR ; aucune ligne n’est supprimée automatiquement.
7. **Abdelali** — expliquer la configuration sauvegardée, les filtres communs et la lecture seule.
8. **Yassine** — expliquer les sessions, les contrôles côté serveur et les vues d’administration.
9. **Résultats** — fichier fictif : 10 lignes, 8 acceptées, 2 rejetées ; 141,75 GBP net, 6 commandes, panier moyen 23,63 GBP, qualité 90/100.
10. **Limites** — volumes modestes, worker simple, récupération de compte et déploiement à améliorer.

## Démonstration

- Se connecter avec member@example.test / DevMember123!.
- Créer un dataset GBP et importer fixtures/ventes-demo.csv.
- Attendre le job terminé puis ouvrir le rapport des deux rejets.
- Afficher les analyses, la qualité et les valeurs atypiques.
- Créer un dashboard, choisir un filtre et vérifier sa conservation après rechargement.
- Partager avec yassine@example.test, ouvrir avec cet utilisateur dans une autre session et montrer la lecture seule.
- Révoquer le partage et recharger la vue partagée : l’accès est retiré.
- Montrer l’administration avec yassine@example.test / DevAdmin123!.

Les identifiants ci-dessus sont fictifs et réservés au développement. La répartition présentée est celle des responsabilités fonctionnelles de l’équipe.
