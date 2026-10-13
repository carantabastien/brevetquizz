# CLAUDE.md — BrevetQuizz

App web de révision du brevet (3e) pour le fils de l'utilisateur. L'utilisateur est le parent ; il parle français et n'est pas développeur. Répondre en français, simplement.

## Exigences du parent (à respecter dans toute évolution)
1. **Ludique** : XP, niveaux, combos, badges, série de jours, confettis.
2. **Fiches de révision** en plus des quiz.
3. **Le parent enrichit le contenu selon les cours** : tout le contenu vient du Google Sheet, et il peut ajouter depuis l'app (Espace parent > Ajouter).
4. **Pas de questions répétées** : les questions vues sont mémorisées (`P.vues`) et ne reviennent qu'une fois tout le lot épuisé (« nouveau cycle »).
5. **Pas de réponse trouvable par élimination** : les pièges doivent être proches de la bonne réponse (même forme, même longueur, dates voisines, notions voisines). `qualite()` dans `js/app.js` signale les cas douteux. Tout nouveau contenu écrit par Claude doit respecter ça.

## Architecture
- Site **statique** sans build ni dépendance : `index.html`, `css/style.css`, `js/config.js`, `js/app.js` (IIFE, vanilla JS), `js/pack.js`.
- **Base de données = Google Sheet** `19YKjWWzk5sq0l7TvtRQVyO-e57PsYx7ZDpuYCf56BQ0` (public en lecture), avec trois onglets dont la ligne 1 est l'en-tête :
  - `Quiz` : Matière | Thème | Question | Bonne réponse | Mauvaise réponse 1 | Mauvaise réponse 2 | Mauvaise réponse 3 | Explication
  - `Fiches` : Matière | Thème | Fiche | Point à retenir (une ligne par point, regroupées par titre de fiche)
  - `Frise` : Thème | Année | Événement (sert au quiz des dates, dont les pièges sont générés à partir d'années proches)
- **Lecture** : endpoint gviz en **JSONP** (`/gviz/tq?tqx=out:json;responseHandler:cb&sheet=NOM&headers=1`), via une balise `<script>`. Le CSV gviz n'a pas d'en-tête CORS, donc pas de `fetch`. Les colonnes sont retrouvées par leur **libellé normalisé** (sans accent, en minuscules), pas par leur position. Une copie est mise en cache dans localStorage pour le mode hors ligne.
- **Écriture** : script Apps Script `apps-script/Code.gs`, à coller dans le Sheet et à déployer en application Web par le parent. L'app envoie un `POST` sans en-tête Content-Type (pas de preflight) avec `{cle, action}`. Actions : `test`, `ajouter` (onglet + lignes), `pack`. Sans script configuré, l'app affiche la ligne en TSV à coller à la main.
- **Piège gviz** : dans une colonne, les cellules d'un type minoritaire reviennent `null` (par exemple « 1914 » saisi en nombre dans une colonne de texte). La fonction `installer()` du script et `ajouter_` forcent le format texte brut (`@`) sur Quiz et Fiches. Les lignes incomplètes sont listées dans Espace parent > Qualité.
- **ID d'une question** = hash de `matière|question` normalisés. Modifier le texte d'une question la fait donc compter comme nouvelle.
- **Lien question → fiche** : même matière et même Thème, puis la fiche qui partage le plus de mots-clés ou d'années (`ficheDe`).
- **Progression** : `localStorage["brevetquizz_progression_v1"]` (XP, vues, erreurs, stats, badges, PIN parent, URL et clé du script). Elle est propre à chaque appareil, avec export et import en JSON.

## Contenu
- `js/pack.js` (`window.BQ_PACK`) : 38 questions existantes du Sheet avec de meilleurs pièges (champ `cle` = texte d'origine de la question), 80 nouvelles questions dans toutes les matières et 91 points de fiches. Le parent l'installe via Espace parent > Ajouter, en appelant l'action `pack` du script, qui fait un upsert sans doublon.
- Pour générer du contenu : produire des lignes au format des onglets ci-dessus, que le parent colle dans « Coller plusieurs lignes ». L'app accepte les séparateurs tabulation, `|` ou `;`.

## Lancer et tester en local
- `python3 -m http.server` depuis le dossier du projet échoue dans la sandbox (pas d'accès à ~/Documents). Copier le site dans le scratchpad (`rsync -a --exclude .claude ./ <scratchpad>/site/`) et servir depuis là. `.claude/launch.json` (ignoré par git) pointe vers cette copie : relancer le rsync après chaque modification.
- Pas de Node. `python3` et `git` sont disponibles depuis l'installation des Command Line Tools. `osascript -l JavaScript` peut servir à vérifier la syntaxe JS.

## Repo
- GitHub : https://github.com/carantabastien/brevetquizz (branche `main`). Pour le téléphone de l'élève, publication possible via GitHub Pages.
