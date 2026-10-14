# 🎓 BrevetQuizz

App de révision du brevet : quiz ludiques (XP, niveaux, combos, badges, série de jours), fiches de révision et frise chronologique.
Le contenu vient d'un **Google Sheet** que le parent complète au fil des cours.

## Ce que fait l'app

- **Nouvelle partie** : on coche une ou plusieurs matières parmi les 12 matières (français, maths, histoire, géographie, EMC, physique-chimie, SVT, technologie, anglais, espagnol, allemand, italien) et les dates, et on choisit 5, 10, 15 ou 20 questions. Les questions sont réparties équitablement entre les matières. Les questions déjà vues **ne reviennent pas** tant que tout n'a pas été fait.
- **Quiz des dates** généré à partir de l'onglet Frise : « En quelle année… ? » et « Que s'est-il passé en… ? », avec des pièges tirés d'années proches.
- **Mes erreurs** : les questions ratées reviennent dans un mode « revanche » jusqu'à ce qu'elles soient réussies.
- **Fiches** par matière, avec un bouton « Je maîtrise ». Après une erreur, l'app propose la fiche correspondante.
- **Statistiques** (code facultatif) :
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

⚠️ **Ne laissez pas de filtre actif sur le Sheet** : l'app ne reçoit que les lignes visibles. Pour trier sans gêner l'app, utilisez **Données > Vues filtrées**.

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
7. Dans l'app : **Statistiques > ⚙️ Réglages**, collez l'URL et la clé secrète, puis cliquez sur **Enregistrer et tester**.
8. Dans **Statistiques > ➕ Ajouter**, cliquez sur **Installer le pack dans le Google Sheet**. Le pack apporte :
   - de meilleures mauvaises réponses pour les questions existantes ;
   - environ 120 questions et 110 points de fiches en maths, français, histoire-géo, EMC, physique-chimie, SVT, technologie, anglais, espagnol, allemand et italien.

> Si vous modifiez le script plus tard : **Déployer > Gérer les déploiements > ✏️ > Nouvelle version**, pour garder la même URL.

## Partager l'app sur invitation

Une fois l'URL du script inscrite dans `js/config.js` (`scriptUrl`), l'app passe en **accès sur invitation** :

- Sans invitation, l'app affiche « accessible uniquement sur invitation » et ne montre aucune question.
- **Statistiques > 🔗 Partager** : saisissez un prénom pour créer un **lien personnel**. Ce lien ne fonctionne que sur **le premier appareil qui l'ouvre**. Transféré à quelqu'un d'autre, il affiche « lien déjà utilisé ».
- Dans la liste des invitations, vous pouvez **désactiver** un accès (l'app se verrouille sur cet appareil) ou le **réactiver**. Si la personne change de téléphone, le bouton **Nouvel appareil** lui permet de réutiliser son lien une fois sur le nouveau.
- Seul le parent peut inviter. Sur son propre appareil, il touche « Je suis le parent » sur l'écran verrouillé et saisit la clé secrète du script.
- Votre fils a besoin lui aussi d'une invitation, à ouvrir sur son téléphone. Sa progression est conservée.
- Les invitations sont enregistrées dans l'onglet **Accès** du Google Sheet.

**📈 Résultats des élèves** : à la fin de chaque partie, l'app d'un invité envoie un résumé dans les onglets **Résultats** et **Historique** du Sheet. Sur l'appareil du parent, le bouton « Résultats des élèves » de l'accueil (ou Statistiques > 📈 Élèves) affiche, pour chacun : sa réussite, son nombre de parties, sa série de jours, son niveau, les matières à retravailler, sa réussite par matière, son activité des 14 derniers jours et ses dernières parties. Hors connexion, les résultats sont gardés et envoyés à la connexion suivante.

**🏆 Classement** (bouton de l'accueil, visible par tous les invités) : élèves classés par taux de bonnes réponses, à partir de 20 réponses. Un élève qui en a moins apparaît dans « Pas encore classés ». Chacun ne voit des autres que le prénom de l'invitation, le pourcentage et le nombre de réponses. Une invitation désactivée sort du classement.

**Style « Social »** : l'accueil ressemble à un réseau social. En haut, les matières en « stories » : une touche lance une partie, et l'anneau devient gris quand toutes les questions ont été vues. En dessous, le fil d'activité des amis. En bas, une barre de navigation avec le bouton ＋ pour une partie mélangée.

**⚔️ Défis entre amis** : à la fin d'une partie, « Défier un ami avec ce score ». L'ami rejoue exactement les mêmes questions. Le défi lui arrive dans la 🔔 cloche de l'app (rafraîchie à l'ouverture et toutes les 2 minutes), et le bouton « Prévenir par message » permet de l'avertir tout de suite par WhatsApp ou SMS. Une fois le défi relevé, chacun voit le duel. On peut aussi dire ❤️ « Bravo » sur les parties des amis.

*Limite* : pas de notification quand l'app est fermée. Ce type de notification demande un serveur dédié (par exemple Firebase), que le script Google ne peut pas remplacer.

Pour que ce soit vraiment privé, passez le partage du Google Sheet en **« Accès restreint »**. Les questions ne sont alors plus lisibles que par le script.

*Limites* : un invité peut toujours prêter son téléphone ou faire des captures d'écran. Le code de l'app et le pack de questions (`js/pack.js`) restent visibles sur GitHub, puisque le repo est public. Un invité hors ligne garde l'accès 7 jours au plus sans nouvelle vérification.

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
