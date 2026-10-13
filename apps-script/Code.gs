/**
 * BrevetQuizz — script à coller dans le Google Sheet (Extensions > Apps Script).
 * Il permet à l'app d'AJOUTER des questions, fiches et dates dans le Sheet.
 *
 * 1. Change CLE_SECRETE ci-dessous (un mot de passe de ton choix, sans espace).
 * 2. Exécute une fois la fonction « installer » (menu déroulant en haut > installer > Exécuter)
 *    et accepte les autorisations.
 * 3. Déployer > Nouveau déploiement > type « Application Web »
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 *    Copie l'URL obtenue (elle finit par /exec) dans l'app : Statistiques > Réglages.
 */
const CLE_SECRETE = 'change-moi';

const ONGLETS = {
  Quiz: ['Matière', 'Thème', 'Question', 'Bonne réponse', 'Mauvaise réponse 1', 'Mauvaise réponse 2', 'Mauvaise réponse 3', 'Explication'],
  Fiches: ['Matière', 'Thème', 'Fiche', 'Point à retenir'],
  Frise: ['Thème', 'Année', 'Événement']
};

/** À exécuter une fois : crée les onglets manquants et met les colonnes de texte au format « texte brut ». */
function installer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ONGLETS).forEach(function (nom) {
    let sh = ss.getSheetByName(nom);
    if (!sh) {
      sh = ss.insertSheet(nom);
      sh.getRange(1, 1, 1, ONGLETS[nom].length).setValues([ONGLETS[nom]]).setFontWeight('bold');
    }
    if (nom === 'Frise') return; // l'année reste un nombre
    // Évite que Google transforme « 1914 » en nombre : l'app ne lirait plus la cellule.
    const nbCol = ONGLETS[nom].length;
    const plage = sh.getRange(1, 1, sh.getMaxRows(), nbCol);
    const valeurs = plage.getValues().map(function (l) { return l.map(String); });
    plage.setNumberFormat('@').setValues(valeurs);
  });
  return 'OK';
}

function doGet() {
  return json_({ ok: true, message: 'BrevetQuizz : le script fonctionne.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erreur: 'Requête illisible' }); }
  if (req.cle !== CLE_SECRETE) return json_({ ok: false, erreur: 'Clé secrète incorrecte' });

  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (req.action) {
      case 'test':
        return json_({ ok: true, message: 'Connexion réussie' });
      case 'ajouter':
        return json_({ ok: true, ajoutees: ajouter_(ss, req.onglet, req.lignes) });
      case 'pack':
        return json_(installerPack_(ss, req.pack));
      default:
        return json_({ ok: false, erreur: 'Action inconnue' });
    }
  } catch (err) {
    return json_({ ok: false, erreur: String(err) });
  } finally {
    verrou.releaseLock();
  }
}

function ajouter_(ss, onglet, lignes) {
  if (!ONGLETS[onglet]) throw new Error('Onglet inconnu : ' + onglet);
  const sh = ss.getSheetByName(onglet);
  const nbCol = ONGLETS[onglet].length;
  const propres = (lignes || [])
    .map(function (l) {
      const ligne = [];
      for (let i = 0; i < nbCol; i++) ligne.push(l[i] == null ? '' : String(l[i]).trim());
      return ligne;
    })
    .filter(function (l) { return l.some(function (c) { return c !== ''; }); });
  if (!propres.length) return 0;
  const plage = sh.getRange(sh.getLastRow() + 1, 1, propres.length, nbCol);
  if (onglet !== 'Frise') plage.setNumberFormat('@');
  plage.setValues(propres);
  return propres.length;
}

/** Pack de contenu : remplace les questions existantes (par leur texte) et ajoute le reste sans doublon. */
function installerPack_(ss, pack) {
  const quiz = ss.getSheetByName('Quiz');
  const donnees = quiz.getDataRange().getValues();
  const index = {};
  donnees.forEach(function (l, i) { if (i > 0) index[String(l[2]).trim()] = i + 1; });

  let modifiees = 0, ajoutees = 0;
  const nouvelles = [];
  (pack.quiz || []).forEach(function (q) {
    const ligne = q.ligne.map(String);
    const numero = index[(q.cle || ligne[2]).trim()] || index[ligne[2].trim()];
    if (numero) {
      quiz.getRange(numero, 1, 1, 8).setNumberFormat('@').setValues([ligne]);
      modifiees++;
    } else {
      nouvelles.push(ligne);
    }
  });
  ajoutees += ajouter_(ss, 'Quiz', nouvelles);

  const fiches = ss.getSheetByName('Fiches');
  const existants = {};
  fiches.getDataRange().getValues().forEach(function (l) { existants[String(l[3]).trim()] = true; });
  const fichesAAjouter = (pack.fiches || []).filter(function (f) { return !existants[String(f[3]).trim()]; });
  const pointsAjoutes = ajouter_(ss, 'Fiches', fichesAAjouter);

  return { ok: true, modifiees: modifiees, ajoutees: ajoutees, points: pointsAjoutes };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
