# 🎓 BrevetQuizz

App de révision du brevet : quiz ludiques (XP, niveaux, combos, badges, série de jours), fiches de révision et frise chronologique.
Le contenu vient d'un **Google Sheet** que le parent complète au fil des cours.

## Ce que fait l'app

- **Quiz par matière** (5, 10, 15 ou 20 questions). Les questions déjà vues **ne reviennent pas** tant que toute la matière n'a pas été faite.
- **Quiz des dates** généré à partir de l'onglet Frise : « En quelle année… ? » et « Que s'est-il passé en… ? », avec des pièges tirés d'années proches.
- **Mes erreurs** : les questions ratées reviennent dans un mode « revanche » jusqu'à ce qu'elles soient réussies.
- **Fiches** par matière, avec un bouton « Je maîtrise ». Après une erreur, l'app propose la fiche correspondante.
- **Espace parent** (code facultatif) :
  - **Suivi** : taux de réussite par matière, questions encore jamais vues, erreurs ;
  - **Ajouter** : formulaire de question, de fiche, de date, ou collage de plusieurs lignes ;
  - **Qualité** : liste les questions dont la bonne réponse se devine par élimination.

## Le Google Sheet

Sheet : https://docs.google.com/spreadsheets/d/19YKjWWzk5sq0l7TvtRQVyO-e57PsYx7ZDpuYCf56BQ0/edit

Il doit être partagé en **« Tous les utilisateurs disposant du lien : Lecteur »**. Il contient trois onglets, dont la ligne 1 sert d'en-tête :

| Onglet | Colonnes |
|---|---|
| **Quiz** | Matière · Thème · Question · Bonne réponse · Mauvaise réponse 1 · Mauvaise réponse 2 · Mauvaise réponse 3 · Explication |
| **Fiches** | Matière · Thème · Fiche · Point à retenir *(une ligne par point ; les lignes qui ont le même titre de fiche forment une seule fiche)* |
| **Frise** | Thème · Année · Événement |

Le **Thème** relie tout : une question et une fiche qui ont le même thème sont liées.

**Bien écrire les mauvaises réponses** (pour qu'il ne trouve pas par élimination) :
- même forme et même longueur que la bonne réponse ;
- des erreurs « classiques » : dates proches (1916 → 1915, 1917, 1918), notions voisines (métaphore / comparaison), formule inversée (v = d ÷ t / v = t ÷ d) ;
- jamais de « toutes les réponses » ni de réponse absurde.

## Ajouter des questions depuis l'app (installation unique, 5 min)

Sans cette étape, l'app reste utilisable : le formulaire prépare la ligne et il suffit de la coller dans le Sheet.
Pour que l'app écrive directement dans le Sheet :

1. Dans le Google Sheet : **Extensions > Apps Script**.
2. Remplacez tout le code par le contenu du fichier [`apps-script/Code.gs`](apps-script/Code.gs).
3. Ligne `const CLE_SECRETE = 'change-moi';` : remplacez `change-moi` par un mot de passe de votre choix.
4. Enregistrez (💾). Dans la liste en haut, choisissez la fonction **`installer`**, puis cliquez sur **Exécuter** et acceptez les autorisations.
   *Google affiche « Application non validée » : cliquez sur Paramètres avancés > Accéder au projet. C'est normal pour un script personnel.*
5. **Déployer > Nouveau déploiement**. Cliquez sur ⚙️ > **Application Web**.
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
6. Copiez l'**URL de l'application Web** (elle se termine par `/exec`).
7. Dans l'app : **Espace parent > ⚙️ Réglages**, collez l'URL et la clé secrète, puis cliquez sur **Enregistrer et tester**.
8. Dans **Espace parent > ➕ Ajouter**, cliquez sur **Installer le pack dans le Google Sheet**. Le pack apporte :
   - de meilleures mauvaises réponses pour les questions existantes ;
   - environ 80 questions et 90 points de fiches en maths, français, histoire-géo, EMC, physique-chimie, SVT et technologie.

> Si vous modifiez le script plus tard : **Déployer > Gérer les déploiements > ✏️ > Nouvelle version**, pour garder la même URL.

### Créer des questions à partir de ses cours
Prenez son cours en photo ou copiez-le, puis demandez à Claude par exemple :
> « Fais 15 questions de brevet sur ce cours, en tableau avec les colonnes Matière | Thème | Question | Bonne réponse | Mauvaise réponse 1 | Mauvaise réponse 2 | Mauvaise réponse 3 | Explication. Les mauvaises réponses doivent être très proches de la bonne, de même forme et de même longueur. »

Copiez le tableau obtenu dans **Ajouter > Coller plusieurs lignes**.

## Utiliser l'app

C'est un site statique (HTML, CSS, JS, sans installation ni compilation).
- **Sur l'ordinateur** : double-cliquez sur `index.html`.
- **Sur son téléphone** : l'app est publiée automatiquement sur **https://carantabastien.github.io/brevetquizz/** à chaque envoi sur `main` (workflow `.github/workflows/pages.yml`). Ouvrez l'adresse sur le téléphone puis utilisez « Ajouter à l'écran d'accueil ».
  *Réglage à faire une seule fois : Settings > Pages > Source : **GitHub Actions**.*

La progression (XP, badges, questions vues) est enregistrée dans le navigateur de l'appareil. Pour changer d'appareil, utilisez Réglages > Exporter / Importer.

## Fichiers

```
index.html            page unique
css/style.css         styles (clair / sombre)
js/config.js          identifiant du Google Sheet
js/app.js             toute l'application
js/pack.js            pack de contenu installable dans le Sheet
apps-script/Code.gs   script Google pour écrire dans le Sheet
.github/workflows/    CI : vérifie le JS et le pack, puis publie sur GitHub Pages
```
