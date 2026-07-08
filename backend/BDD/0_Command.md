# Commande de copie
```bash
mysqldump -u [utilisateur] -p[password] [nom_base_source] > /chemin/vers/fichier_de_backup.sql
```
# commande d'import
```bash
mysql -u [utilisateur] -p[password] [nom_base_dest] < /chemin/vers/fichier_de_backup.sql
```
