# Compléter le MVP de ventes et qualité des données

Ajoute les modules datasets/imports, exploration/analyses et dashboards/partages à la fondation existante. Le parcours CSV → analyse → dashboard enregistré → partage fonctionne avec un exemple fictif reproductible.

L’import conserve les sources et les valeurs brutes, valide les lignes, bloque les fichiers identiques par dataset et publie transactionnellement les ventes après traitement. Les analyses sont filtrées/paginées côté serveur et les montants restent décimaux. Les dashboards réutilisent les calculs, enregistrent leur configuration et accordent seulement une lecture révocable.

Ajouts de contrat explicités dans docs/contract-changelog.md ; migration additive ImportSource. Node 22.12+ et PostgreSQL 16 sont requis. Le worker est intégré au serveur pour garder le MVP simple.

Vérifications : builds, 12 tests automatisés et parcours navigateur complet, dont les restrictions d’accès et l’affichage mobile. Rapport français et présentation disponibles dans deliverables/ ; répartition fonctionnelle des quatre membres incluse.
