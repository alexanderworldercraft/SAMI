# Abonnements Premium factices

Les abonnements et renouvellements sont des simulations : aucun prélèvement réel n'est effectué.

## Période acquise et formule suivante

`Utilisateur.PremiumEndDate` reste la date de fin de l'accès acquis. `PremiumPlan` distingue la formule en cours (`MONTHLY` ou `YEARLY`) et `PremiumRenewalPlan` indique la formule du prochain renouvellement. Une valeur nulle arrête le renouvellement.

- Première souscription ou reprise après expiration : un mois ou un an à partir de la confirmation.
- Passage au gratuit : seule la formule de renouvellement est supprimée. La date de fin reste intacte ; les contrôles média continuent d'accorder l'accès jusqu'à cette date.
- Mensuel vers annuel, annuel vers mensuel, ou réactivation après résiliation : la formule suivante change, sans prolongation immédiate. Elle est appliquée au renouvellement.
- Le bouton de la formule gratuite et celui sous l'abonnement actuel ouvrent la même confirmation. Les changements payants demandent aussi confirmation.

La confirmation de résiliation compte les films Premium actifs et les séries actives Premium ou contenant au moins un épisode Premium actif. Une série n'est comptée qu'une fois. La formulation vise les contenus Premium de ces séries, car certaines conservent aussi des épisodes gratuits. Les administrateurs conservent l'accès lié à leur grade ; le message le précise.

## Renouvellement et concurrence

Le serveur vérifie les échéances au démarrage puis chaque minute. La consultation de l'abonnement vérifie aussi l'échéance du compte. Le renouvellement part de l'ancienne date de fin et rattrape les périodes manquées jusqu'à une date future si le serveur a été arrêté. Les dates sont calculées en UTC, en ramenant un jour inexistant au dernier jour du mois cible (31 janvier vers 28/29 février).

Le réglage global puis le compte sont verrouillés dans une transaction MySQL `READ COMMITTED`. Une résiliation concurrente prend effet selon l'ordre de verrouillage : avant renouvellement elle l'empêche ; après renouvellement elle préserve la nouvelle période acquise. `PremiumPayment` garde un identifiant unique par événement signé ou renouvellement automatique. Rejouer un webhook ne réactive donc pas un abonnement résilié et ne prolonge pas deux fois sa période.

## Activation depuis l'administration

Le SuperAdmin dispose du toggle **API des abonnements factices** dans **Fonctionnalités expérimentales**. Le réglage est persisté dans `AppSetting`, clé `fake_premium_api`.

Une désactivation bloque les souscriptions, changements payants et renouvellements automatiques. Les droits déjà acquis sont conservés jusqu'à leur échéance ; la consultation et le désabonnement restent disponibles. Le backend retourne un message explicite avec HTTP 503 aux tentatives payantes bloquées. La réactivation permet à nouveau le traitement des échéances.

Le réglage est actif par défaut. `SAMI_ENABLE_FAKE_PREMIUM=false` peut initialiser un nouveau réglage à l'état inactif ; une fois le réglage créé, le choix enregistré par le SuperAdmin est prioritaire sur l'environnement.

## Migration et déploiement

Appliquer `20261027140000_add_premium_subscription_lifecycle` avec `prisma migrate deploy`, puis régénérer le client avec `prisma generate --generator client`, reconstruire le frontend et redémarrer le backend. Les éventuelles migrations précédentes en attente doivent aussi être appliquées.

La migration ne modifie aucune date de fin. Pour chaque abonnement encore actif, elle reprend le dernier journal `premium_payment_fake` avec une formule mensuelle ou annuelle, ou choisit mensuelle si ce journal manque. Elle active le renouvellement de ces abonnements. Les comptes déjà expirés ne sont pas réabonnés par la migration.

Le traitement des paiements reste factice ; l'intégration future d'un prestataire réel devra distinguer la demande de changement de formule de la confirmation d'un encaissement effectif.

## Validation

`backend/tests/userPremium.test.js` couvre les routes HTTP, les formules, les échéances, la résiliation, les signatures et les autorisations du toggle. Les tests frontend couvrent les deux boutons de résiliation, les confirmations, le changement différé, les erreurs et le toggle.

`backend/tests/premiumSubscription.integration.test.js` est désactivé par défaut. Pour l'exécuter, démarrer un MySQL **jetable et sans réseau** avec un socket `/private/tmp/sami-premium-mysql-<identifiant>/mysql.sock`, puis définir `SAMI_TEST_PREMIUM_MYSQL_SOCKET` à ce socket et `DATABASE_URL` à `mysql://root@localhost/sami_premium_test?socket=<socket>`. Le test refuse toute autre cible, recrée exclusivement la base `sami_premium_test`, reconstruit le schéma précédent, applique la migration et vérifie les écritures concurrentes. Aucun accès à une base SAMI existante n'est nécessaire.
