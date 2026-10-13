/**
 * BrevetQuizz — script à coller dans le Google Sheet (Extensions > Apps Script).
 *
 * Il sert à :
 *  - donner les questions à l'app, uniquement aux personnes invitées (le Sheet peut alors rester privé) ;
 *  - créer et révoquer des invitations (un lien = un seul appareil) ;
 *  - ajouter des questions, fiches et dates depuis l'app.
 *
 * Installation (une seule fois) :
 * 1. Change CLE_SECRETE ci-dessous (un mot de passe de ton choix, sans espace). Ne le donne à personne :
 *    il permet de créer des invitations et de modifier les questions.
 * 2. Enregistre, puis choisis la fonction « installer » dans la liste en haut et clique sur Exécuter.
 *    Accepte les autorisations (Paramètres avancés > Accéder au projet).
 * 3. Déployer > Nouveau déploiement > ⚙️ « Application Web »
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 *    Copie l'URL obtenue (elle finit par /exec).
 * Après une modification du script : Déployer > Gérer les déploiements > ✏️ > Version : Nouvelle version.
 */
const CLE_SECRETE = 'change-moi';

const ONGLETS = {
  Quiz: ['Matière', 'Thème', 'Question', 'Bonne réponse', 'Mauvaise réponse 1', 'Mauvaise réponse 2', 'Mauvaise réponse 3', 'Explication'],
  Fiches: ['Matière', 'Thème', 'Fiche', 'Point à retenir'],
  Frise: ['Thème', 'Année', 'Événement'],
  'Accès': ['Code', 'Nom', 'Appareil', 'Créé le', 'Activé le', 'Dernière visite', 'Statut'],
  'Résultats': ['Code', 'Nom', 'Prénom saisi', 'Dernière activité', 'XP', 'Niveau', 'Parties', 'Réponses', 'Réussite',
    'Série (jours)', 'Erreurs à revoir', 'Badges', 'Fiches maîtrisées', 'Détail par matière'],
  'Historique': ['Date', 'Code', 'Nom', 'Matières', 'Bonnes réponses', 'Questions', 'Réussite']
};
// Colonnes de l'onglet Accès (base 0)
const A = { code: 0, nom: 1, appareil: 2, cree: 3, active: 4, visite: 5, statut: 6 };

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
    // Évite que Google transforme « 1914 » ou « 1/2 » en nombre ou en date.
    const nbCol = ONGLETS[nom].length;
    const plage = sh.getRange(1, 1, sh.getMaxRows(), nbCol);
    const valeurs = plage.getDisplayValues();
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
  const parent = req.cle === CLE_SECRETE;

  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Seule action ouverte aux invités : lire les questions, avec un code valable pour CET appareil.
    if (req.action === 'donnees') {
      if (!parent) {
        const refus = verifierInvitation_(ss, req.code, req.appareil);
        if (refus) return json_({ ok: false, code: refus, erreur: MESSAGES[refus] });
      }
      return json_({ ok: true, parent: parent, quiz: lire_(ss, 'Quiz'), fiches: lire_(ss, 'Fiches'), frise: lire_(ss, 'Frise') });
    }
    // Classement visible par tous les invités : prénom, réussite et nombre de réponses uniquement (jamais les codes).
    if (req.action === 'classement') {
      if (!parent) {
        const refus = verifierInvitation_(ss, req.code, req.appareil);
        if (refus) return json_({ ok: false, code: refus, erreur: MESSAGES[refus] });
      }
      return json_({ ok: true, classement: classement_(ss, parent ? '' : String(req.code)) });
    }
    // Un invité envoie le résumé de sa progression et ses dernières parties (à la fin de chaque partie).
    if (req.action === 'resultat') {
      const refus = verifierInvitation_(ss, req.code, req.appareil);
      if (refus) return json_({ ok: false, code: refus, erreur: MESSAGES[refus] });
      enregistrerResultat_(ss, String(req.code), req.resume || {}, req.parties || []);
      return json_({ ok: true });
    }

    if (!parent) return json_({ ok: false, code: 'cle', erreur: 'Clé secrète incorrecte' });
    switch (req.action) {
      case 'test':
        return json_({ ok: true, message: 'Connexion réussie' });
      case 'ajouter':
        return json_({ ok: true, ajoutees: ajouter_(ss, req.onglet, req.lignes) });
      case 'pack':
        return json_(installerPack_(ss, req.pack));
      case 'creerInvitation':
        return json_(creerInvitation_(ss, req.nom));
      case 'invitations':
        return json_({ ok: true, invitations: listerInvitations_(ss) });
      case 'resultats':
        return json_(lireResultats_(ss));
      case 'revoquer':
        return json_(modifierInvitation_(ss, req.code, function (l) { l[A.statut] = 'révoqué'; }));
      case 'reactiver':
        return json_(modifierInvitation_(ss, req.code, function (l) { l[A.statut] = 'actif'; }));
      case 'liberer': // l'invité a changé de téléphone : le lien pourra être réactivé sur un nouvel appareil
        return json_(modifierInvitation_(ss, req.code, function (l) { l[A.appareil] = ''; l[A.active] = ''; l[A.statut] = 'actif'; }));
      default:
        return json_({ ok: false, erreur: 'Action inconnue' });
    }
  } catch (err) {
    return json_({ ok: false, erreur: String(err) });
  } finally {
    verrou.releaseLock();
  }
}

const MESSAGES = {
  aucune: 'Cette app est accessible uniquement sur invitation.',
  inconnue: "Ce lien d'invitation n'existe pas.",
  revoquee: "Cette invitation a été désactivée par la personne qui te l'a envoyée.",
  deja_utilisee: "Ce lien d'invitation a déjà été utilisé sur un autre appareil."
};

/** Renvoie null si l'accès est accordé, sinon le motif du refus. Le 1er appareil qui utilise le code le « verrouille ». */
function verifierInvitation_(ss, code, appareil) {
  if (!code || !appareil) return 'aucune';
  const sh = ss.getSheetByName('Accès');
  const valeurs = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < valeurs.length; i++) {
    const l = valeurs[i];
    if (l[A.code] !== String(code)) continue;
    if (l[A.statut] !== 'actif') return 'revoquee';
    const maintenant = horodatage_();
    if (!l[A.appareil]) {
      sh.getRange(i + 1, A.appareil + 1).setValue(String(appareil));
      sh.getRange(i + 1, A.active + 1).setValue(maintenant);
    } else if (l[A.appareil] !== String(appareil)) {
      return 'deja_utilisee';
    }
    sh.getRange(i + 1, A.visite + 1).setValue(maintenant);
    return null;
  }
  return 'inconnue';
}

function creerInvitation_(ss, nom) {
  nom = String(nom || '').trim();
  if (!nom) throw new Error('Indique le prénom de la personne invitée');
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const sh = ss.getSheetByName('Accès');
  sh.getRange(sh.getLastRow() + 1, 1, 1, 7).setNumberFormat('@').setValues([[code, nom, '', horodatage_(), '', '', 'actif']]);
  return { ok: true, code: code, nom: nom };
}

function listerInvitations_(ss) {
  return ss.getSheetByName('Accès').getDataRange().getDisplayValues().slice(1)
    .filter(function (l) { return l[A.code]; })
    .map(function (l) {
      return { code: l[A.code], nom: l[A.nom], utilise: !!l[A.appareil], cree: l[A.cree], active: l[A.active], visite: l[A.visite], statut: l[A.statut] };
    });
}

function modifierInvitation_(ss, code, modif) {
  const sh = ss.getSheetByName('Accès');
  const valeurs = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < valeurs.length; i++) {
    if (valeurs[i][A.code] === String(code)) {
      const l = valeurs[i].slice(0, 7);
      modif(l);
      sh.getRange(i + 1, 1, 1, 7).setNumberFormat('@').setValues([l]);
      return { ok: true };
    }
  }
  return { ok: false, erreur: 'Invitation introuvable' };
}

function nomInvitation_(ss, code) {
  const l = ss.getSheetByName('Accès').getDataRange().getDisplayValues().find(function (x) { return x[A.code] === code; });
  return l ? l[A.nom] : '';
}

/** Met à jour la ligne de l'élève dans « Résultats » et ajoute ses parties dans « Historique ». */
function enregistrerResultat_(ss, code, r, parties) {
  const nom = nomInvitation_(ss, code);
  const pct = function (ok, total) { return total ? Math.round(ok / total * 100) + ' %' : ''; };
  const ligne = [code, nom, String(r.prenom || ''), horodatage_(), String(r.xp || 0), String(r.niveau || ''),
    String(r.parties || 0), String(r.repondues || 0), pct(r.bonnes || 0, r.repondues || 0), String(r.serie || 0),
    String(r.erreurs || 0), String(r.badges || 0), String(r.fiches || 0), JSON.stringify(r.matieres || {})];
  const sh = ss.getSheetByName('Résultats');
  const codes = sh.getDataRange().getDisplayValues().map(function (l) { return l[0]; });
  const i = codes.indexOf(code);
  const numero = i > 0 ? i + 1 : sh.getLastRow() + 1;
  sh.getRange(numero, 1, 1, ligne.length).setNumberFormat('@').setValues([ligne]);

  const lignes = (parties || []).slice(0, 50).map(function (p) {
    return [String(p.date || horodatage_()), code, nom, String(p.matieres || ''), String(p.bons || 0), String(p.total || 0), pct(p.bons || 0, p.total || 0)];
  });
  if (lignes.length) {
    const h = ss.getSheetByName('Historique');
    h.getRange(h.getLastRow() + 1, 1, lignes.length, 7).setNumberFormat('@').setValues(lignes);
  }
}

/** Élèves dont l'invitation est active, avec leur réussite. « moi » repère la ligne de l'élève qui demande. */
function classement_(ss, moi) {
  const actifs = {};
  ss.getSheetByName('Accès').getDataRange().getDisplayValues().slice(1).forEach(function (l) {
    if (l[A.code] && l[A.statut] === 'actif') actifs[l[A.code]] = l[A.nom];
  });
  return ss.getSheetByName('Résultats').getDataRange().getDisplayValues().slice(1)
    .filter(function (l) { return l[0] && actifs.hasOwnProperty(l[0]); })
    .map(function (l) {
      return { nom: actifs[l[0]] || l[1], reussite: parseInt(l[8], 10) || 0, repondues: +l[7] || 0, parties: +l[6] || 0, moi: l[0] === moi };
    });
}

function lireResultats_(ss) {
  const res = ss.getSheetByName('Résultats').getDataRange().getDisplayValues().slice(1).filter(function (l) { return l[0]; });
  const eleves = res.map(function (l) {
    let detail = {};
    try { detail = JSON.parse(l[13] || '{}'); } catch (e) { /* cellule modifiée à la main */ }
    return { code: l[0], nom: l[1], prenom: l[2], activite: l[3], xp: +l[4] || 0, niveau: l[5], parties: +l[6] || 0,
      repondues: +l[7] || 0, reussite: l[8], serie: +l[9] || 0, erreurs: +l[10] || 0, badges: +l[11] || 0, fiches: +l[12] || 0, matieres: detail };
  });
  const historique = ss.getSheetByName('Historique').getDataRange().getDisplayValues().slice(1)
    .filter(function (l) { return l[1]; })
    .slice(-500)
    .map(function (l) { return { date: l[0], code: l[1], matieres: l[3], bons: +l[4] || 0, total: +l[5] || 0 }; });
  return { ok: true, eleves: eleves, historique: historique };
}

/** Lit un onglet tel qu'affiché (pas de conversion en nombre ou en date), sans les lignes vides. */
function lire_(ss, onglet) {
  const sh = ss.getSheetByName(onglet);
  if (!sh) return [];
  const nbCol = ONGLETS[onglet].length;
  return sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), nbCol).getDisplayValues()
    .filter(function (l, i) { return i === 0 || l.some(function (c) { return c !== ''; }); });
}

function horodatage_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function ajouter_(ss, onglet, lignes) {
  if (['Quiz', 'Fiches', 'Frise'].indexOf(onglet) < 0) throw new Error('Onglet inconnu : ' + onglet);
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
