# Notes de soutenance — 18 diapositives

## Diapositive 1

Présenter le projet comme une application Full Stack d’analyse des ventes. Le parcours commence avec un CSV et se termine par un dashboard enregistré et partagé. Les données de démonstration sont fictives. La répartition présentée correspond aux responsabilités fonctionnelles de l’équipe, sans attester un historique de contribution individuelle. Annoncer le plan : besoin, architecture, quatre parties, puis vérification et limites. Le rapport associé développe les règles et les résultats sur vingt pages.

## Diapositive 2

Expliquer que des ventes présentes dans un CSV ne sont pas encore des indicateurs fiables. Une quantité invalide, une date impossible ou une annulation peuvent fausser la lecture. Plusieurs lignes d’une même facture ne doivent pas devenir plusieurs commandes. Le projet rassemble l’import et l’analyse dans le même outil pour rendre visibles les défauts et publier des définitions communes. L’objectif est un parcours local complet et compréhensible ; aucune mesure de performance à grande échelle n’a été effectuée.

## Diapositive 3

Décrire la démonstration dans l’ordre. L’utilisateur crée un compte, crée un dataset avec sa devise et ses paramètres de date, puis importe le fichier. Il attend le traitement terminé avant de consulter les analyses. Il examine les rejets, applique les filtres et enregistre sa vue. Enfin, il la partage avec un autre utilisateur inscrit. Souligner que le chargement, l’absence de données, le succès et les erreurs sont des états distincts. L’administrateur supervise les comptes et métadonnées sans obtenir un droit implicite sur les ventes privées.

## Diapositive 4

Présenter explicitement chaque membre. Yassine assure le socle, les permissions et l’administration. Ahmed transforme les fichiers sources en ventes normalisées. Taha publie les métriques réutilisables, l’exploration et les rapports. Abdelali construit les vues et le partage. Les fichiers partagés, le schéma Prisma, le contrat OpenAPI et les dépendances demandent une coordination. La répartition est fonctionnelle : elle organise les responsabilités et les parties de la soutenance, mais ne constitue pas une affirmation sur les auteurs de chaque commit.

## Diapositive 5

Le client React utilise Vite, TypeScript et React Router. Le serveur Express expose une API REST sous /api. PostgreSQL stocke les utilisateurs, les sessions, les fichiers, les ventes et les configurations. Prisma gère les accès et les migrations. Recharts est la bibliothèque commune de graphiques. Le worker d’import reste volontairement dans le processus serveur et retrouve ses jobs dans la base. Ce n’est pas une architecture distribuée. Le dépôt npm unique facilite l’installation ; les dossiers client et server séparent les responsabilités.

## Diapositive 6

Le schéma comporte dix tables. User et Session représentent les comptes et l’accès. Dataset contient les métadonnées et les paramètres de devise et de date. ImportJob et ImportSource conservent l’état et le fichier. RawRecord garde la source et les erreurs ; SalesRecord contient les champs normalisés. Dashboard et DashboardShare représentent une vue et ses lecteurs. Activity trace les actions utiles à la supervision. Les quantités et prix utilisent Decimal(18,4), les identifiants de vente restent des chaînes et les dates sont stockées en UTC. Les contraintes et suppressions en cascade maintiennent les relations.

## Diapositive 7

Partie Yassine. L’inscription crée toujours un membre ordinaire et refuse une injection de rôle. Le mot de passe utilise scrypt avec un sel. La connexion crée un token opaque aléatoire ; le navigateur reçoit un cookie HttpOnly et la base conserve son empreinte. Le middleware contrôle la session à chaque requête protégée. Les mutations vérifient aussi l’origine et l’en-tête convenu. Une modification d’email exige le mot de passe courant, et les opérations sensibles révoquent les sessions concernées. La déconnexion invalide la session côté serveur. Les routes frontend servent au parcours, mais ne remplacent pas ces contrôles.

## Diapositive 8

Partie Yassine. Montrer les compteurs, les utilisateurs, les métadonnées des datasets et l’activité. Les endpoints d’administration refusent les membres ordinaires. Le changement de rôle ou d’activation révoque les sessions concernées. Un administrateur ne peut pas se désactiver lui-même ou retirer ses propres droits via l’interface ; la protection du dernier administrateur évite de perdre la capacité de gestion. Les verrous et relectures de session traitent aussi des opérations concurrentes. La supervision n’accorde pas de lecture implicite des ventes privées. Les droits de propriétaire restent distincts du rôle administrateur.

## Diapositive 9

Partie Ahmed. Le dataset déclare ses métadonnées et sa devise. Les huit colonnes attendues correspondent au format de ventes convenu. CustomerID peut être vide, tandis que les champs obligatoires sont validés. Les identifiants restent des chaînes pour conserver leurs zéros initiaux. Le parseur accepte le CSV UTF-8 avec champs entre guillemets. Les limites sont de 10 Mio, 100 000 lignes logiques et 64 Kio UTF-8 par champ. Les dates impossibles et les nombres invalides produisent des rejets expliqués ; les valeurs originales et les numéros de lignes sont conservés.

## Diapositive 10

Partie Ahmed. Le fichier est stocké et le job créé avant que le worker réalise le traitement hors de la requête HTTP. Le parcours nominal est pending, processing, completed. Une erreur produit failed. Un verrou PostgreSQL empêche deux traitements du même job, et une transaction empêche une publication partielle. Les analyses lisent uniquement les imports terminés. L’empreinte SHA-256 refuse un même fichier dans un même dataset, sans supprimer des lignes de transaction identiques légitimes. Une source conservée permet de relancer le même job ; les jobs interrompus sont récupérables au redémarrage.

## Diapositive 11

Partie Taha. Le tableau est paginé, recherché et trié côté serveur afin de ne pas charger tout le dataset dans le navigateur. Les champs de tri sont limités à une liste connue et les paramètres sont validés. Les filtres date, pays et produit se combinent. Les bornes utilisent from inclus et to exclu ; un instant frontière appartient à une seule période. Les dates d’import sont interprétées selon le format et le fuseau du dataset, puis stockées en UTC. Les regroupements temporels utilisent le fuseau du dataset. Le membre doit posséder le dataset pour accéder aux analyses directes.

## Diapositive 12

Partie Taha. La formule du CA net est la somme des quantités signées multipliées par les prix. Les annulations dont la facture commence par C sont normalisées en négatif et les retours négatifs restent valides. Les commandes sont les factures distinctes comportant une vente positive hors annulation. INV001 comporte deux lignes mais représente une commande. Le panier moyen est le CA net divisé par les commandes, avec une valeur nulle lorsque le dénominateur est zéro. Les décimaux sont calculés au serveur puis arrondis après agrégation. Dans l’exemple : brut 147, retours 5,25, net 141,75 GBP, six commandes et panier 23,63 GBP.

## Diapositive 13

Partie Taha. Le score de qualité est calculé sur les imports terminés du dataset, indépendamment des filtres commerciaux. La validité rapporte les lignes acceptées aux lignes sources. La complétude utilise les sept champs obligatoires ; le client facultatif peut être manquant sans diminuer ce composant. L’unicité décrit les candidats doublons exacts sur les huit champs normalisés. Il ne s’agit pas d’une preuve de double facturation. Dans le fichier : validité 80, complétude 100, unicité 100, donc score 90. Les défauts restent visibles et les candidats ne sont pas supprimés automatiquement.

## Diapositive 14

Partie Taha. Présenter IQR comme une aide à la revue. Les seuils sont Q1 moins 1,5 IQR et Q3 plus 1,5 IQR, avec quartiles interpolés. Les ventes et retours sont étudiés séparément. Moins de quatre observations ne donnent pas de signalement ; un IQR nul nécessite une règle explicite. La quantité 100 du jeu fictif est inhabituelle, mais n’est pas supprimée. Pour les comparaisons, vérifier le droit d’accès aux deux datasets et la devise identique. Les groupes sont nommés. Une référence nulle rend le pourcentage non calculable, pas infini ; un panier nul conserve la même prudence.

## Diapositive 15

Partie Abdelali. La vue rassemble trois KPI et trois graphiques prédéfinis : CA dans le temps, top produits et répartition par pays. Les calculs proviennent du service de Taha pour éviter deux moteurs financiers. Le dashboard conserve le dataset, son titre, ses filtres, les widgets et la disposition. Il peut être renommé ou supprimé par le propriétaire. La configuration versionnée est validée avec huit widgets au maximum et une grille sans chevauchement. Les retours restent dans les KPI, courbes et barres. Le diagramme circulaire représente uniquement les groupes positifs et indique ce choix.

## Diapositive 16

Partie Abdelali avec le socle de permissions Yassine. Le propriétaire partage avec un utilisateur inscrit et actif par email ou identifiant. Le destinataire peut lire cette vue et ses agrégats. Il ne peut pas éditer, supprimer ou inviter d’autres utilisateurs. Il ne reçoit aucun droit général sur les lignes brutes ni sur les endpoints d’analyses du dataset. L’endpoint de données du dashboard impose la configuration enregistrée et refuse des filtres arbitraires. La révocation est vérifiée à la prochaine requête. Le scénario navigateur a contrôlé la lecture autorisée puis le refus après retrait.

## Diapositive 17

Présenter uniquement les résultats contrôlés. Le fichier fictif contient dix lignes, dont huit acceptées et deux rejetées. Les pays totalisent 32,75 GBP pour le Royaume-Uni et 109 GBP pour la France ; leur somme donne 141,75 GBP. Les douze tests passent et les builds client et serveur réussissent. Le parcours navigateur a vérifié import, analyses, dashboard, partage et révocation, ainsi que l’administration et une vue mobile. Les tests couvrent aussi des échecs d’import et des opérations concurrentes sensibles. Ces vérifications ne sont ni un test de charge ni un audit de sécurité exhaustif.

## Diapositive 18

Terminer en montrant le parcours réel : se connecter, créer un dataset, importer fixtures/ventes-demo.csv, consulter les deux rejets, vérifier les métriques, enregistrer un dashboard, partager puis révoquer. L’installation est décrite dans le rapport et README : npm ci, démarrage PostgreSQL, génération Prisma, migrations, seed et npm run dev. L’application tourne sur localhost:5173. Limites : petit volume, source en base, worker dans l’API, aucun benchmark ou déploiement de production. Les évolutions prioritaires portent sur la file de tâches, le stockage, la supervision et la récupération de compte. Conclure sur la cohérence du parcours et des responsabilités, puis ouvrir les questions.
