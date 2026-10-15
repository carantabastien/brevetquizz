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
  'Accès': ['Code', 'Nom', 'Appareil', 'Créé le', 'Activé le', 'Dernière visite', 'Statut', 'Invité par'],
  'Résultats': ['Code', 'Nom', 'Prénom saisi', 'Dernière activité', 'XP', 'Niveau', 'Parties', 'Réponses', 'Réussite',
    'Série (jours)', 'Erreurs à revoir', 'Badges', 'Fiches maîtrisées', 'Détail par matière'],
  'Historique': ['Date', 'Code', 'Nom', 'Matières', 'Bonnes réponses', 'Questions', 'Réussite'],
  'Défis': ['ID', 'Date', 'De', 'Pour', 'Matières', 'Questions', 'Bonnes réponses', 'Total', 'Statut', 'Score réponse', 'Date réponse'],
  'Réactions': ['Date', 'De', 'Partie', 'Pour']
};
// Colonnes de l'onglet Défis (base 0)
const DF = { id: 0, date: 1, de: 2, pour: 3, matieres: 4, questions: 5, bons: 6, total: 7, statut: 8, score: 9, dateRep: 10 };
// Colonnes de l'onglet Accès (base 0)
const A = { code: 0, nom: 1, appareil: 2, cree: 3, active: 4, visite: 5, statut: 6, par: 7 };

/** À exécuter une fois : crée les onglets manquants et met les colonnes de texte au format « texte brut ». */
function installer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ONGLETS).forEach(function (nom) {
    let sh = ss.getSheetByName(nom);
    if (!sh) {
      sh = ss.insertSheet(nom);
      sh.getRange(1, 1, 1, ONGLETS[nom].length).setValues([ONGLETS[nom]]).setFontWeight('bold');
    }
    const entete = sh.getRange(1, 1, 1, ONGLETS[nom].length);
    if (entete.getDisplayValues()[0].some(function (v) { return v === ''; })) entete.setValues([ONGLETS[nom]]).setFontWeight('bold');
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

    // Identité du joueur : son code d'invitation, lié à CET appareil. Le détenteur de la clé peut aussi être joueur.
    let moi = '';
    if (req.code) {
      const refus = verifierInvitation_(ss, req.code, req.appareil);
      if (refus && !parent) return json_({ ok: false, code: refus, erreur: MESSAGES[refus] });
      if (!refus) moi = String(req.code);
    }
    const refusAucune = function () { return json_({ ok: false, code: 'aucune', erreur: MESSAGES.aucune }); };
    // Une invitation « cible » (à désactiver, réactiver…) : n'importe laquelle avec la clé, sinon seulement les siennes.
    const changer = function (modif) { return json_(modifierInvitation_(ss, req.cible, modif, parent ? null : moi)); };

    switch (req.action) {
      // Ouvert à tous les joueurs (et au détenteur de la clé)
      case 'donnees':
        if (!moi && !parent) return refusAucune();
        return json_({ ok: true, parent: parent, quiz: lire_(ss, 'Quiz'), fiches: lire_(ss, 'Fiches'), frise: lire_(ss, 'Frise') });
      case 'classement':
        if (!moi && !parent) return refusAucune();
        return json_({ ok: true, classement: classement_(ss, moi) });
      case 'social':
        if (!moi && !parent) return refusAucune();
        return json_(social_(ss, moi));
      case 'creerInvitation':
        if (!moi && !parent) return refusAucune();
        return json_(creerInvitation_(ss, req.nom, moi));
      case 'invitations':
        if (!moi && !parent) return refusAucune();
        return json_({ ok: true, invitations: listerInvitations_(ss, parent ? null : moi) });
      case 'revoquer':
        if (!moi && !parent) return refusAucune();
        return changer(function (l) { l[A.statut] = 'révoqué'; });
      case 'reactiver':
        if (!moi && !parent) return refusAucune();
        return changer(function (l) { l[A.statut] = 'actif'; });
      case 'liberer': // l'invité a changé de téléphone : son lien pourra être réutilisé une fois sur un nouvel appareil
        if (!moi && !parent) return refusAucune();
        return changer(function (l) { l[A.appareil] = ''; l[A.active] = ''; l[A.statut] = 'actif'; });
      // Réservé aux joueurs (il faut un profil)
      case 'defier':
        if (!moi) return refusAucune();
        return json_(defier_(ss, moi, req));
      case 'repondreDefi':
        if (!moi) return refusAucune();
        return json_(repondreDefi_(ss, moi, req.id, req.bons));
      case 'bravo':
        if (!moi) return refusAucune();
        return json_(bravo_(ss, moi, req.partie));
      case 'resultat':
        if (!moi) return refusAucune();
        enregistrerResultat_(ss, moi, req.resume || {}, req.parties || []);
        return json_({ ok: true });
    }

    // Outils de gestion : clé secrète obligatoire
    if (!parent) return json_({ ok: false, code: 'cle', erreur: 'Clé secrète incorrecte' });
    switch (req.action) {
      case 'test':
        return json_({ ok: true, message: 'Connexion réussie' });
      case 'ajouter':
        return json_({ ok: true, ajoutees: ajouter_(ss, req.onglet, req.lignes) });
      case 'pack':
        return json_(installerPack_(ss, req.pack));
      case 'resultats':
        return json_(lireResultats_(ss));
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

function creerInvitation_(ss, nom, par) {
  nom = String(nom || '').trim();
  if (!nom) throw new Error('Indique le prénom de la personne invitée');
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const sh = ss.getSheetByName('Accès');
  sh.getRange(sh.getLastRow() + 1, 1, 1, 8).setNumberFormat('@').setValues([[code, nom, '', horodatage_(), '', '', 'actif', par || '']]);
  return { ok: true, code: code, nom: nom };
}

/** Toutes les invitations (par = null, avec la clé) ou seulement celles créées par ce joueur. */
function listerInvitations_(ss, par) {
  const lignes = ss.getSheetByName('Accès').getDataRange().getDisplayValues().slice(1).filter(function (l) { return l[A.code]; });
  const noms = {};
  lignes.forEach(function (l) { noms[l[A.code]] = l[A.nom]; });
  return lignes
    .filter(function (l) { return par === null || l[A.par] === par; })
    .map(function (l) {
      return { code: l[A.code], nom: l[A.nom], utilise: !!l[A.appareil], cree: l[A.cree], active: l[A.active], visite: l[A.visite], statut: l[A.statut],
        par: l[A.par] ? (noms[l[A.par]] || '') : '' };
    });
}

/** Modifie une invitation ; sans clé (par = code du joueur), seulement une de celles qu'il a créées. */
function modifierInvitation_(ss, code, modif, par) {
  const sh = ss.getSheetByName('Accès');
  const valeurs = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < valeurs.length; i++) {
    if (valeurs[i][A.code] !== String(code)) continue;
    if (par !== null && valeurs[i][A.par] !== par) return { ok: false, erreur: "Tu ne peux gérer que les invitations que tu as créées" };
    const l = valeurs[i].slice(0, 8);
    while (l.length < 8) l.push('');
    modif(l);
    sh.getRange(i + 1, 1, 1, 8).setNumberFormat('@').setValues([l]);
    return { ok: true };
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

/** Identifiant public d'un invité : sert à désigner un ami sans jamais révéler son code d'invitation. */
function idPublic_(code) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, code + '|' + CLE_SECRETE).slice(0, 6)
    .map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

/** « 13/10/2026 17:05 » → millisecondes (pour trier). */
function temps_(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/.exec(String(s || ''));
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : 0;
}

function membres_(ss) {
  const membres = {};
  ss.getSheetByName('Accès').getDataRange().getDisplayValues().slice(1).forEach(function (l) {
    if (l[A.code] && l[A.statut] === 'actif') membres[l[A.code]] = { id: idPublic_(l[A.code]), nom: l[A.nom] };
  });
  return membres;
}

/** Fil d'activité, défis et notifications vus par « moi » (code d'invitation, vide pour le parent). */
function social_(ss, moi) {
  const membres = membres_(ss);
  const hist = ss.getSheetByName('Historique').getDataRange().getDisplayValues();
  const reac = ss.getSheetByName('Réactions').getDataRange().getDisplayValues().slice(1).filter(function (l) { return l[2]; });
  const bravos = {}, mesBravos = {};
  reac.forEach(function (l) {
    bravos[l[2]] = (bravos[l[2]] || 0) + 1;
    if (moi && l[1] === moi) mesBravos[l[2]] = true;
  });

  const fil = [];
  for (let i = hist.length - 1; i >= 1 && fil.length < 40; i--) {
    const l = hist[i], m = membres[l[1]];
    if (!m) continue;
    const id = 'h' + (i + 1);
    fil.push({ type: 'partie', id: id, date: l[0], t: temps_(l[0]), nom: m.nom, moi: !!moi && l[1] === moi,
      matieres: l[3], bons: +l[4] || 0, total: +l[5] || 0, bravos: bravos[id] || 0, jaiDitBravo: !!mesBravos[id] });
  }

  const recus = [], envoyes = [];
  ss.getSheetByName('Défis').getDataRange().getDisplayValues().slice(1).forEach(function (l) {
    const de = membres[l[DF.de]], pour = membres[l[DF.pour]];
    if (!l[DF.id] || !de || !pour) return;
    const d = { id: l[DF.id], date: l[DF.date], t: temps_(l[DF.date]), de: de.nom, pour: pour.nom, matieres: l[DF.matieres],
      bons: +l[DF.bons] || 0, total: +l[DF.total] || 0, statut: l[DF.statut], score: l[DF.score] === '' ? null : +l[DF.score],
      dateRep: l[DF.dateRep], tRep: temps_(l[DF.dateRep]) };
    if (moi && l[DF.pour] === moi) { let q = []; try { q = JSON.parse(l[DF.questions] || '[]'); } catch (e) { /* ligne modifiée */ } recus.push(Object.assign({ questions: q }, d)); }
    if (moi && l[DF.de] === moi) envoyes.push(d);
    if (d.statut === 'relevé') fil.push({ type: 'defi', id: d.id, date: d.dateRep, t: d.tRep, de: d.de, pour: d.pour, matieres: d.matieres, bons: d.bons, total: d.total, score: d.score });
  });

  const notifs = [];
  recus.forEach(function (d) { notifs.push({ type: 'defi', t: d.t, date: d.date, de: d.de, defi: d.id, matieres: d.matieres, bons: d.bons, total: d.total, statut: d.statut }); });
  envoyes.forEach(function (d) { if (d.statut === 'relevé') notifs.push({ type: 'releve', t: d.tRep, date: d.dateRep, de: d.pour, matieres: d.matieres, bons: d.bons, total: d.total, score: d.score }); });
  reac.forEach(function (l) {
    if (!moi || l[3] !== moi || !membres[l[1]]) return;
    const h = hist[parseInt(String(l[2]).slice(1), 10) - 1] || [];
    notifs.push({ type: 'bravo', t: temps_(l[0]), date: l[0], de: membres[l[1]].nom, matieres: h[3] || '', bons: +h[4] || 0, total: +h[5] || 0 });
  });

  fil.sort(function (a, b) { return b.t - a.t; });
  notifs.sort(function (a, b) { return b.t - a.t; });
  return {
    ok: true,
    amis: Object.keys(membres).filter(function (c) { return c !== moi; }).map(function (c) { return membres[c]; }),
    fil: fil.slice(0, 40), recus: recus, envoyes: envoyes, notifs: notifs.slice(0, 40)
  };
}

/** Crée un défi pour chaque ami choisi (désignés par leur identifiant public). */
function defier_(ss, moi, req) {
  const codes = {};
  Object.keys(membres_(ss)).forEach(function (c) { if (c !== moi) codes[idPublic_(c)] = c; });
  const questions = (req.questions || []).slice(0, 20).map(String);
  if (!questions.length) throw new Error('Défi sans questions');
  const lignes = (req.pour || []).filter(function (id) { return codes[id]; }).map(function (id) {
    return [Utilities.getUuid().replace(/-/g, '').slice(0, 10), horodatage_(), moi, codes[id], String(req.matieres || ''),
      JSON.stringify(questions), String(+req.bons || 0), String(+req.total || questions.length), 'en attente', '', ''];
  });
  if (!lignes.length) throw new Error('Choisis au moins un ami');
  const sh = ss.getSheetByName('Défis');
  sh.getRange(sh.getLastRow() + 1, 1, lignes.length, 11).setNumberFormat('@').setValues(lignes);
  return { ok: true, envoyes: lignes.length };
}

function repondreDefi_(ss, moi, id, bons) {
  const sh = ss.getSheetByName('Défis');
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) {
    if (v[i][DF.id] !== String(id) || v[i][DF.pour] !== moi) continue;
    if (v[i][DF.statut] !== 'relevé') {
      sh.getRange(i + 1, DF.statut + 1, 1, 3).setNumberFormat('@').setValues([['relevé', String(+bons || 0), horodatage_()]]);
    }
    return { ok: true, aBattre: +v[i][DF.bons] || 0 };
  }
  return { ok: false, erreur: 'Défi introuvable' };
}

/** « Bravo » sur une partie d'un ami (une fois par partie, jamais sur la sienne). */
function bravo_(ss, moi, partie) {
  const m = /^h(\d+)$/.exec(String(partie || ''));
  const h = ss.getSheetByName('Historique');
  if (!m || +m[1] < 2 || +m[1] > h.getLastRow()) throw new Error('Partie introuvable');
  const auteur = h.getRange(+m[1], 2).getDisplayValue();
  if (auteur === moi) return { ok: true };
  const r = ss.getSheetByName('Réactions');
  const deja = r.getDataRange().getDisplayValues().some(function (l) { return l[1] === moi && l[2] === partie; });
  if (!deja) r.getRange(r.getLastRow() + 1, 1, 1, 4).setNumberFormat('@').setValues([[horodatage_(), moi, String(partie), auteur]]);
  return { ok: true };
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
