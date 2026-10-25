# Données fictives de démonstration

ventes-demo.csv : 10 lignes sources, 8 acceptées, 2 rejetées (quantité non numérique et date invalide). Identifiants 001 / 00042 conservés comme chaînes. Le retour C-003 devient une quantité de -1.

Résultats attendus en GBP : CA brut 147.00 ; retours 5.25 ; CA net 141.75 ; 6 commandes positives distinctes ; panier moyen 23.63. Les deux lignes INV-001 appartiennent à une seule commande. Une ligne acceptée a un client manquant. Aucun candidat doublon. Score = 90.00 (validité 80 %, complétude 100 %, unicité 100 %). La quantité 100 est un candidat atypique IQR parmi les ventes ; aucun retour n'est rejeté pour son signe.

Pays : United Kingdom 32.75 net ; France 109.00 net. Période [2026-01-10T00:00:00Z, 2026-01-11T00:00:00Z) : CA 38.00 et 1 commande.
