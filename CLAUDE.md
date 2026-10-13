# CLAUDE.md — BrevetQuizz

App web de révision du brevet (3e) pour le fils de l'utilisateur. L'utilisateur est le parent ; il parle français et n'est pas développeur. Répondre en français, simplement.

## Exigences du parent (à respecter dans toute évolution)
1. **Ludique** : XP, niveaux, combos, badges, série de jours, confettis.
2. **Fiches de révision** en plus des quiz.
3. **Le parent enrichit le contenu selon les cours** : tout le contenu vient du Google Sheet, et il peut ajouter depuis l'app (Statistiques > Ajouter).
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
- **Accès sur invitation** (actif dès que `scriptUrl` est renseigné dans `js/config.js` ou dans `P.scriptUrl`) : les données passent par l'action `donnees` du script (`getDisplayValues`, donc pas de conversion en nombre ou en date), et plus par gviz. Un invité envoie `{code, appareil}`. Le 1er appareil qui utilise un code le verrouille dans l'onglet `Accès` (Code | Nom | Appareil | Créé le | Activé le | Dernière visite | Statut). Refus possibles : `aucune`, `inconnue`, `revoquee`, `deja_utilisee` → vue `acces` et effacement du cache. Le parent est reconnu par `P.cle` (clé secrète) : il a les onglets Ajouter, Qualité et 🔗 Partager (actions `creerInvitation`, `invitations`, `revoquer`, `reactiver`, `liberer`). `estParent()` masque ces onglets aux invités. Le code d'invitation et l'identifiant d'appareil sont stockés à part (`brevetquizz_acces_v1`) pour ne pas être copiés par l'export de progression. Le cache hors ligne d'un invité expire après 7 jours.
- Tester ce mode sans vrai script : simuler `fetch` vers une fausse URL de script (voir la session du 13/10/2026), dans une page de test qui installe la simulation avant `js/app.js`.
- **Piège gviz** : dans une colonne, les cellules d'un type minoritaire reviennent `null` (par exemple « 1914 » saisi en nombre dans une colonne de texte). La fonction `installer()` du script et `ajouter_` forcent le format texte brut (`@`) sur Quiz et Fiches. Les lignes incomplètes sont listées dans Statistiques > Qualité.
- **Matières** : `MATIERES_3E` dans `js/app.js` contient les 12 matières retenues par le parent (latin, grec, arts plastiques, éducation musicale et EPS retirés à sa demande). Elles sont toujours affichées, même sans question. `canonMatiere()` ramène les variantes du Sheet (« Mathématiques », « Physique »…) au nom officiel via `ALIAS_MATIERES`. Écran « Nouvelle partie » (vue `choix`) : multi-sélection gardée dans `P.selection` (`"#frise"` = dates). `tirer(groupes, n)` pioche à tour de rôle dans chaque matière pour un mélange équilibré.
- **Piège filtre** : un filtre classique actif sur un onglet masque les lignes pour gviz, donc pour l'app (vu le 13/10/2026 : un filtre « Géographie » ne laissait passer que 13 questions). Si le nombre de questions baisse sans raison, vérifier qu'aucun filtre n'est actif. Les « vues filtrées » n'ont pas cet effet.
- **Accès au Sheet** : depuis le 13/10/2026, il est modifiable par toute personne qui a le lien. Claude peut l'éditer dans le navigateur intégré, sans connexion : double-clic sur une cellule pour l'éditer, Tab pour valider et passer à la suivante, Entrée pour éditer la cellule sélectionnée. La saisie hors mode édition et le collage ne fonctionnent pas.
- **ID d'une question** = hash de `matière|question` normalisés. Modifier le texte d'une question la fait donc compter comme nouvelle.
- **Lien question → fiche** : même matière et même Thème, puis la fiche qui partage le plus de mots-clés ou d'années (`ficheDe`).
- **Progression** : `localStorage["brevetquizz_progression_v1"]` (XP, vues, erreurs, stats, badges, PIN parent, URL et clé du script). Elle est propre à chaque appareil, avec export et import en JSON.

## Contenu
- `js/pack.js` (`window.BQ_PACK`) : 38 questions existantes du Sheet avec de meilleurs pièges (champ `cle` = texte d'origine de la question), 120 nouvelles questions (dont 10 par langue : anglais, espagnol, allemand, italien) et 112 points de fiches. Le parent l'installe via Statistiques > Ajouter, en appelant l'action `pack` du script, qui fait un upsert sans doublon.
- Pour générer du contenu : produire des lignes au format des onglets ci-dessus, que le parent colle dans « Coller plusieurs lignes ». L'app accepte les séparateurs tabulation, `|` ou `;`.

## Lancer et tester en local
- `python3 -m http.server` depuis le dossier du projet échoue dans la sandbox (pas d'accès à ~/Documents). Copier le site dans le scratchpad (`rsync -a --exclude .claude ./ <scratchpad>/site/`) et servir depuis là. `.claude/launch.json` (ignoré par git) pointe vers cette copie : relancer le rsync après chaque modification.
- Pas de Node. `python3` et `git` sont disponibles depuis l'installation des Command Line Tools. `osascript -l JavaScript` peut servir à vérifier la syntaxe JS.

## Repo et déploiement
- GitHub : https://github.com/carantabastien/brevetquizz (branche `main`, remote en SSH avec la clé `~/.ssh/id_ed25519`).
- CI `.github/workflows/pages.yml` : à chaque push sur `main`, `node --check` sur `js/*.js`, validation de `js/pack.js` (8 colonnes, pas de cellule vide, pas de réponses en double), puis déploiement de `index.html`, `css/` et `js/` sur GitHub Pages : https://carantabastien.github.io/brevetquizz/ (Source Pages = « GitHub Actions »).
- Un fichier `a` (test de git de l'utilisateur) existe dans le repo : ne pas y toucher sans demander.
