# Drapeaux du lecteur

Pour ajouter une langue ou une variante régionale :

1. Ajouter ici un SVG horizontal, idéalement au ratio 3:2.
2. Importer le fichier dans `../../utils/playerLanguageFlags.js`.
3. Ajouter une règle à `PLAYER_LANGUAGE_FLAGS` avec un `id`, un `name`, le `src`, les `codes` reconnus et les mots de `keywords` utiles.
4. Placer une variante régionale avant sa langue générique : la première règle compatible est utilisée.

Les codes et mots-clés doivent être en minuscules, sans accent. La détection examine successivement le code de langue, le libellé de la piste et le nom du fichier. Si aucune règle ne correspond, le lecteur affiche un globe neutre.
