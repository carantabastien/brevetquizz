/* BrevetQuizz — app de révision du brevet.
 * Données : Google Sheet (onglets Quiz, Fiches, Frise), lu via l'API gviz en JSONP
 *           (pas de serveur nécessaire, marche aussi en ouvrant index.html directement).
 * Écriture : script Apps Script facultatif (voir apps-script/Code.gs).
 * Progression de l'élève : stockée dans le navigateur (localStorage).
 */
(function () {
  "use strict";

  const CONFIG = window.BQ_CONFIG || {};
  const STORE_KEY = "brevetquizz_progression_v1";
  const CACHE_KEY = "brevetquizz_donnees_v1";

  const COULEURS = {
    "Maths": ["#2563eb", "📐"], "Français": ["#db2777", "📖"], "Histoire": ["#b45309", "🏛️"],
    "Géographie": ["#059669", "🌍"], "EMC": ["#7c3aed", "⚖️"], "Physique-Chimie": ["#0891b2", "⚗️"],
    "SVT": ["#65a30d", "🧬"], "Technologie": ["#475569", "⚙️"], "Anglais": ["#dc2626", "🇬🇧"],
    "Espagnol": ["#ea580c", "🇪🇸"], "Allemand": ["#ca8a04", "🇩🇪"], "Italien": ["#16a34a", "🇮🇹"]
  };
  // Matières révisées, dans l'ordre d'affichage (affichées même sans question).
  const MATIERES_3E = ["Français", "Maths", "Histoire", "Géographie", "EMC", "Physique-Chimie", "SVT", "Technologie",
    "Anglais", "Espagnol", "Allemand", "Italien"];
  // Autres façons d'écrire une matière dans le Sheet → nom officiel ci-dessus.
  const ALIAS_MATIERES = {
    "math": "Maths", "mathematiques": "Maths", "mathematique": "Maths",
    "physique": "Physique-Chimie", "physique chimie": "Physique-Chimie", "pc": "Physique-Chimie",
    "sciences de la vie et de la terre": "SVT", "techno": "Technologie",
    "education morale et civique": "EMC", "enseignement moral et civique": "EMC",
    "geo": "Géographie", "lv1 anglais": "Anglais"
  };
  const NIVEAUX = [
    [0, "Débutant"], [100, "Apprenti"], [250, "Élève motivé"], [500, "Bûcheur"], [850, "Solide"],
    [1300, "Expert"], [1900, "As du brevet"], [2600, "Champion"], [3500, "Maître"], [5000, "Légende du brevet"]
  ];
  const BADGES = [
    { id: "premier", ico: "🚀", nom: "Décollage", desc: "Terminer un premier quiz" },
    { id: "combo5", ico: "🔥", nom: "En feu", desc: "5 bonnes réponses d'affilée" },
    { id: "combo10", ico: "☄️", nom: "Inarrêtable", desc: "10 bonnes réponses d'affilée" },
    { id: "parfait", ico: "💯", nom: "Sans faute", desc: "Un quiz de 10 questions ou plus sans erreur" },
    { id: "q50", ico: "📚", nom: "Studieux", desc: "Répondre à 50 questions" },
    { id: "q200", ico: "🏋️", nom: "Marathonien", desc: "Répondre à 200 questions" },
    { id: "toutes", ico: "🌈", nom: "Touche-à-tout", desc: "Jouer dans 5 matières différentes" },
    { id: "jours3", ico: "📅", nom: "Régulier", desc: "Réviser 3 jours d'affilée" },
    { id: "jours7", ico: "🗓️", nom: "Discipliné", desc: "Réviser 7 jours d'affilée" },
    { id: "fiches5", ico: "🧠", nom: "Mémoire d'éléphant", desc: "Maîtriser 5 fiches" },
    { id: "rattrapage", ico: "🩹", nom: "Revanche", desc: "Corriger 10 anciennes erreurs" },
    { id: "dates", ico: "⏳", nom: "Maître du temps", desc: "Faire un quiz de dates sans faute" },
    { id: "niveau5", ico: "👑", nom: "Expert", desc: "Atteindre le niveau 6" },
    { id: "defi", ico: "⚔️", nom: "Duelliste", desc: "Gagner un défi lancé par un ami" }
  ];

  // ───────────────────────── Utilitaires ─────────────────────────
  const $app = document.getElementById("app");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const hash = (s) => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const today = () => new Date().toISOString().slice(0, 10);
  const couleur = (m) => (COULEURS[m] || ["#4f46e5", "📝"])[0];
  const emoji = (m) => (COULEURS[m] || ["#4f46e5", "📝"])[1];
  const plural = (n, s, p) => n + " " + (n > 1 ? (p || s + "s") : s);

  function toast(msg, ms) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  function confetti(n) {
    const cols = ["#f59e0b", "#4f46e5", "#db2777", "#16a34a", "#0891b2"];
    for (let i = 0; i < (n || 60); i++) {
      const d = document.createElement("div");
      d.className = "confetti";
      d.style.left = Math.random() * 100 + "vw";
      d.style.background = cols[i % cols.length];
      d.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
      d.style.animationDelay = Math.random() * .4 + "s";
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 4000);
    }
  }

  // ───────────────────────── Progression (localStorage) ─────────────────────────
  const DEFAUT = {
    prenom: "", xp: 0, vues: {}, erreurs: {}, rattrapees: 0, stats: {}, repondues: 0, quizFaits: 0,
    serie: { dernier: "", jours: 0 }, badges: {}, maitrise: {}, pin: "", scriptUrl: "", cle: "", packInstalle: false
  };
  let P = load();
  function load() {
    try { return Object.assign({}, DEFAUT, JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); }
    catch (e) { return Object.assign({}, DEFAUT); }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(P)); } catch (e) { /* stockage indisponible */ } }
  const scriptUrl = () => P.scriptUrl || CONFIG.scriptUrl || "";
  // Mode privé = le script est configuré : les questions passent par lui et ne sont données qu'aux invités.
  // Le détenteur de la clé secrète a en plus les outils de gestion (ajout de questions, qualité, résultats de tous).
  const estParent = () => !scriptUrl() || !!P.cle;

  // ───────────────────────── Accès sur invitation ─────────────────────────
  // Code reçu dans le lien (?invitation=…) + identifiant aléatoire de cet appareil. Gardés à part de la
  // progression pour que l'export / import ne permette pas de copier l'accès sur un autre appareil.
  const ACCES_KEY = "brevetquizz_acces_v1";
  let ACCES = {};
  try { ACCES = JSON.parse(localStorage.getItem(ACCES_KEY) || "{}"); } catch (e) { /* stockage indisponible */ }
  if (!ACCES.appareil) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    ACCES.appareil = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  const lienUrl = new URL(location.href);
  if (lienUrl.searchParams.get("invitation")) {
    ACCES.code = lienUrl.searchParams.get("invitation").trim();
    lienUrl.searchParams.delete("invitation"); // le code n'apparaît plus dans la barre d'adresse
    history.replaceState(null, "", lienUrl.pathname + lienUrl.search + lienUrl.hash);
  }
  const sauverAcces = () => { try { localStorage.setItem(ACCES_KEY, JSON.stringify(ACCES)); } catch (e) { /* stockage indisponible */ } };
  sauverAcces();
  // Tout joueur (code d'invitation) peut partager ; le détenteur de la clé aussi, même sans profil joueur.
  const peutPartager = () => !!scriptUrl() && (!!ACCES.code || !!P.cle);
  const lienInvitation = (code) => location.origin + location.pathname + "?invitation=" + encodeURIComponent(code);

  function niveau(xp) {
    let i = 0;
    while (i + 1 < NIVEAUX.length && xp >= NIVEAUX[i + 1][0]) i++;
    const debut = NIVEAUX[i][0], fin = NIVEAUX[i + 1] ? NIVEAUX[i + 1][0] : debut;
    return { n: i + 1, nom: NIVEAUX[i][1], pct: fin > debut ? Math.round((xp - debut) / (fin - debut) * 100) : 100, reste: fin - xp };
  }

  // ───────────────────────── Données (Google Sheet) ─────────────────────────
  let D = { quiz: [], fiches: [], frise: [], ignorees: [], charge: null, horsLigne: false };

  function chargerOnglet(nom) {
    return new Promise((resolve, reject) => {
      const cb = "bqcb_" + nom + "_" + Date.now();
      const s = document.createElement("script");
      const fin = () => { delete window[cb]; s.remove(); clearTimeout(timer); };
      const timer = setTimeout(() => { fin(); reject(new Error("Délai dépassé")); }, 15000);
      window[cb] = (rep) => { fin(); rep && rep.status === "ok" ? resolve(rep.table) : reject(new Error("Onglet " + nom + " illisible")); };
      s.onerror = () => { fin(); reject(new Error("Sheet inaccessible")); };
      s.src = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(CONFIG.sheetId) +
        "/gviz/tq?tqx=out:json;responseHandler:" + cb + "&headers=1&sheet=" + encodeURIComponent(nom) + "&t=" + Date.now();
      document.head.appendChild(s);
    });
  }
  // Transforme une table gviz en objets dont les clés sont les en-têtes normalisés.
  function lignes(table) {
    const cles = table.cols.map((c) => norm(c.label));
    return table.rows.map((r) => {
      const o = {};
      cles.forEach((k, i) => {
        if (!k) return;
        const c = r.c[i];
        let v = c && c.v != null ? c.v : (c && c.f) || "";
        if (typeof v === "number") v = Number.isInteger(v) ? String(v) : String(c.f || v);
        o[k] = String(v).trim();
      });
      return o;
    });
  }
  function canonMatiere(m) {
    const n = norm(m).replace(/-/g, " ");
    return MATIERES_3E.find((x) => norm(x).replace(/-/g, " ") === n) || ALIAS_MATIERES[n] || String(m || "").trim();
  }
  function construire(brut) {
    const ignorees = [];
    const quiz = [];
    brut.quiz.forEach((l, i) => {
      const pieges = [l["mauvaise reponse 1"], l["mauvaise reponse 2"], l["mauvaise reponse 3"]].filter(Boolean);
      const q = { matiere: canonMatiere(l["matiere"]), theme: l["theme"], question: l["question"], bonne: l["bonne reponse"], pieges, explication: l["explication"] };
      if (!q.question && !q.bonne) return; // ligne vide
      if (!q.matiere || !q.question || !q.bonne || pieges.length < 2) { ignorees.push({ ligne: i + 2, q }); return; }
      q.id = "q" + hash(norm(q.matiere) + "|" + norm(q.question));
      quiz.push(q);
    });
    const fiches = [];
    const parCle = {};
    brut.fiches.forEach((l) => {
      if (!l["fiche"] || !l["point a retenir"]) return;
      const matiere = canonMatiere(l["matiere"]);
      const cle = norm(matiere) + "|" + norm(l["fiche"]);
      if (!parCle[cle]) { parCle[cle] = { cle: "f" + hash(cle), matiere, theme: l["theme"], titre: l["fiche"], points: [] }; fiches.push(parCle[cle]); }
      parCle[cle].points.push(l["point a retenir"]);
    });
    const frise = brut.frise
      .filter((l) => l["annee"] && l["evenement"] && /^-?\d{1,4}$/.test(l["annee"]))
      .map((l) => ({ theme: l["theme"], annee: parseInt(l["annee"], 10), evenement: l["evenement"] }))
      .sort((a, b) => a.annee - b.annee);
    return { quiz, fiches, frise, ignorees };
  }
  // Tableau brut renvoyé par le script (1re ligne = en-têtes) → objets comme pour gviz.
  function objets(tableau) {
    const cles = (tableau[0] || []).map(norm);
    return tableau.slice(1).map((l) => {
      const o = {};
      cles.forEach((k, i) => { if (k) o[k] = String(l[i] == null ? "" : l[i]).trim(); });
      return o;
    });
  }
  async function chargerDonnees() {
    try {
      let brut;
      if (scriptUrl()) {
        const r = await envoyer({ action: "donnees", code: ACCES.code || "", appareil: ACCES.appareil });
        brut = { quiz: objets(r.quiz), fiches: objets(r.fiches), frise: objets(r.frise) };
      } else {
        const [q, f, fr] = await Promise.all([chargerOnglet("Quiz"), chargerOnglet("Fiches"), chargerOnglet("Frise").catch(() => null)]);
        brut = { quiz: lignes(q), fiches: lignes(f), frise: fr ? lignes(fr) : [] };
      }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ brut, date: new Date().toISOString() })); } catch (e) { /* plein */ }
      D = Object.assign(construire(brut), { charge: new Date(), horsLigne: false });
    } catch (err) {
      if (err.code) { // accès refusé (invitation révoquée, lien déjà utilisé…) : on efface la copie locale
        try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* rien */ }
        throw err;
      }
      let cache = null;
      try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { /* rien */ }
      if (!cache) throw err;
      // Un invité hors ligne garde l'accès 7 jours au plus sans que le script ait revérifié son invitation.
      if (scriptUrl() && !P.cle && Date.now() - new Date(cache.date) > 7 * 864e5) throw err;
      D = Object.assign(construire(cache.brut), { charge: new Date(cache.date), horsLigne: true });
    }
  }

  // ───────────────────────── Fabrique de questions ─────────────────────────
  // Matières de 3e d'abord (même vides), puis celles du Sheet qui ne sont pas dans la liste.
  const matieres = () => [...new Set(MATIERES_3E.concat(D.quiz.map((q) => q.matiere), D.fiches.map((f) => f.matiere)))];

  function questionsFrise() {
    const out = [];
    D.frise.forEach((e) => {
      out.push({ id: "fa" + hash(norm(e.evenement)), type: "frise-annee", matiere: "Histoire", theme: e.theme, e });
      out.push({ id: "fe" + hash(norm(e.evenement)), type: "frise-evt", matiere: "Histoire", theme: e.theme, e });
    });
    return out;
  }
  function toutesQuestions() { return D.quiz.concat(questionsFrise()); }
  const poolDe = (id) => (id === "#frise" ? questionsFrise() : D.quiz.filter((q) => q.matiere === id));
  // Matières cochées pour la prochaine partie (par défaut : toutes celles qui ont des questions).
  function selection() {
    if (!Array.isArray(P.selection)) P.selection = matieres().filter((m) => poolDe(m).length).concat(D.frise.length ? ["#frise"] : []);
    return new Set(P.selection);
  }

  // Prépare l'affichage d'une question (les dates génèrent des pièges proches à chaque fois).
  function preparer(q) {
    if (q.type === "frise-annee") {
      const a = q.e.annee, prises = new Set([a]), pieges = [];
      const autres = shuffle(D.frise.map((x) => x.annee).filter((y) => y !== a && Math.abs(y - a) <= 6));
      for (const y of autres) { if (pieges.length < 1 && !prises.has(y)) { prises.add(y); pieges.push(String(y)); } }
      for (const d of shuffle([-4, -3, -2, -1, 1, 2, 3, 4])) {
        const y = a + d;
        if (pieges.length < 3 && !prises.has(y) && y <= new Date().getFullYear()) { prises.add(y); pieges.push(String(y)); }
      }
      return Object.assign({}, q, {
        question: "En quelle année : « " + q.e.evenement.replace(/\.$/, "") + " » ?",
        bonne: String(a), choix: shuffle([String(a)].concat(pieges)),
        explication: a + " : " + q.e.evenement
      });
    }
    if (q.type === "frise-evt") {
      const a = q.e.annee;
      const proches = D.frise.filter((x) => x.annee !== a)
        .map((x) => ({ x, d: Math.abs(x.annee - a) + Math.random() * 2 }))
        .sort((u, v) => u.d - v.d).slice(0, 6);
      const pieges = shuffle(proches).slice(0, 3).map((p) => p.x);
      return Object.assign({}, q, {
        question: "Que s'est-il passé en " + a + " ?",
        bonne: q.e.evenement, choix: shuffle([q.e.evenement].concat(pieges.map((p) => p.evenement))),
        explication: pieges.map((p) => p.annee + " : " + p.evenement).join("\n")
      });
    }
    return Object.assign({}, q, { choix: shuffle([q.bonne].concat(q.pieges)) });
  }

  // Tire n questions jamais vues, à tour de rôle dans chaque groupe (une matière = un groupe)
  // pour que le mélange soit équilibré. Quand tout a été vu, on recommence un nouveau cycle.
  function tirer(groupes, n) {
    let cycle = false;
    const listes = groupes.filter((g) => g.length).map((pool) => ({ pool, reste: shuffle(pool.filter((q) => !P.vues[q.id])) }));
    const pris = [];
    while (pris.length < n) {
      let avance = false;
      for (const l of listes) {
        if (pris.length >= n) break;
        if (l.reste.length) { pris.push(l.reste.shift()); avance = true; }
      }
      if (avance) continue;
      // Plus aucune question jamais vue : nouveau tour, sans reprendre celles déjà tirées.
      cycle = true;
      const ids = new Set(pris.map((q) => q.id));
      listes.forEach((l) => {
        l.pool.forEach((q) => { if (!ids.has(q.id)) delete P.vues[q.id]; });
        l.reste = shuffle(l.pool.filter((q) => !ids.has(q.id)));
      });
      if (listes.every((l) => !l.reste.length)) break;
    }
    if (cycle) save();
    return { questions: shuffle(pris).map(preparer), cycle };
  }

  // ───────────────────────── Contrôle qualité des réponses ─────────────────────────
  function qualite(bonne, pieges) {
    const w = [];
    const all = [bonne].concat(pieges).map((s) => String(s || "").trim());
    if (!all[0]) w.push("La bonne réponse est vide.");
    if (pieges.filter((p) => String(p || "").trim()).length < 3) w.push("Il faut 3 mauvaises réponses.");
    const n = all.filter(Boolean).map(norm);
    if (new Set(n).size !== n.length) w.push("Deux réponses sont identiques.");
    if (all.some((s) => /\b(toutes les r[ée]ponses|aucune de ces)\b/i.test(s))) w.push("Évite « toutes / aucune de ces réponses » : ça se devine.");
    const nums = all.map((s) => (/^-?\d{3,4}$/.test(s) ? parseInt(s, 10) : null));
    if (nums.every((x) => x !== null) && all.length === 4) {
      const loin = nums.slice(1).filter((y) => Math.abs(y - nums[0]) > 12);
      if (loin.length) w.push("Date(s) trop éloignée(s) de la bonne (" + loin.join(", ") + ") : facile à éliminer. Prends des années proches.");
    } else {
      const lp = pieges.filter(Boolean).map((p) => p.length);
      if (lp.length && all[0]) {
        const moy = lp.reduce((a, b) => a + b, 0) / lp.length;
        if (all[0].length > moy * 1.7 && all[0].length - moy > 12) w.push("La bonne réponse est beaucoup plus longue que les autres : elle se repère. Allonge les pièges.");
        if (all[0].length < moy * 0.45 && moy - all[0].length > 12) w.push("La bonne réponse est beaucoup plus courte que les autres : elle se repère.");
      }
    }
    return w;
  }

  // ───────────────────────── Écriture dans le Sheet (Apps Script) ─────────────────────────
  async function envoyer(payload) {
    const url = scriptUrl();
    if (!url) throw new Error("Le script Google n'est pas configuré (Statistiques > Réglages).");
    const rep = await fetch(url, { method: "POST", body: JSON.stringify(Object.assign({ cle: P.cle, code: ACCES.code || "", appareil: ACCES.appareil }, payload)) });
    const json = await rep.json();
    if (!json.ok) {
      const err = new Error(json.erreur || "Erreur inconnue");
      if (json.code && json.code !== "cle") err.code = json.code;
      throw err;
    }
    return json;
  }
  // Charge les données puis affiche l'accueil, l'écran d'accès refusé ou l'erreur réseau.
  function demarrer(apres) {
    aller("chargement");
    chargerDonnees()
      .then(() => { synchroniser().then(chargerSocial); return apres ? apres() : aller("accueil"); })
      .catch((e) => {
        if (!e.code) return aller("erreur");
        const cleRefusee = !!P.cle; // une clé enregistrée mais refusée est fausse : on l'oublie
        if (cleRefusee) { P.cle = ""; save(); }
        aller("acces", { motif: e.code, message: e.message, cleRefusee });
      });
  }

  // ───────────────────────── Routage ─────────────────────────
  let vue = { nom: "accueil" };
  function aller(nom, params) { vue = Object.assign({ nom }, params || {}); render(); window.scrollTo(0, 0); }
  // Vues affichées dans le cadre « social » : barre du haut + barre de navigation en bas.
  const AVEC_CADRE = ["accueil", "fiches", "classement", "profil", "notifs", "frise"];
  function render() {
    const f = VUES[vue.nom] || VUES.accueil;
    const html = f();
    $app.innerHTML = AVEC_CADRE.includes(vue.nom) && P.prenom ? cadre(html) : html;
    if (VUES[vue.nom + "_apres"]) VUES[vue.nom + "_apres"]();
  }
  function cadre(contenu) {
    const n = nonLues();
    const onglets = [
      ["accueil", "🏠", "Accueil"], ["fiches", "📘", "Fiches"], ["choix", "", "Jouer"],
      scriptUrl() ? ["classement", "🏆", "Classement"] : ["frise", "⏳", "Frise"], ["profil", "👤", "Profil"]
    ];
    return `<header class="topbar">
        <button class="logo" data-go="accueil">brevetquizz</button><span class="spacer"></span>
        ${peutPartager() ? `<button class="iconbtn" data-action="onglet" data-onglet="partager" aria-label="Partager l'app">🔗</button>` : ""}
        ${scriptUrl() && P.cle ? `
          <button class="iconbtn" data-action="onglet" data-onglet="eleves" aria-label="Résultats des élèves">📈</button>` : ""}
        ${peutDefier() ? `<button class="iconbtn" data-go="notifs" aria-label="Notifications${n ? ` (${n} nouvelles)` : ""}">🔔<span id="pastille" class="pastille" ${n ? "" : "hidden"}>${n > 9 ? "9+" : n}</span></button>` : ""}
      </header>
      ${contenu}
      <nav class="bottomnav" aria-label="Navigation">${onglets.map(([id, ico, lab]) => id === "choix"
        ? `<button class="nav-plus" data-go="choix" aria-label="Nouvelle partie">＋</button>`
        : `<button class="nav-item ${vue.nom === id ? "on" : ""}" data-go="${id}"><span class="nav-ico">${ico}</span><span>${lab}</span></button>`).join("")}</nav>`;
  }
  const retour = (cible, label) => `<button class="btn-ghost back" data-go="${cible || "accueil"}">← ${label || "Accueil"}</button>`;

  // ───────────────────────── Vues ─────────────────────────
  let quiz = null; // état du quiz en cours

  const VUES = {
    chargement: () => `<div class="loader"><div style="font-size:3rem">🎓</div>Chargement des révisions…</div>`,

    erreur: () => `<div class="card stack center">
      <div style="font-size:3rem">😕</div>
      <h2>Impossible de charger les révisions</h2>
      <p class="muted">Vérifie ta connexion internet puis réessaie.</p>
      <button class="btn-primary" data-action="recharger">Réessayer</button></div>`,

    acces: () => `<div class="card stack center" style="margin-top:40px">
      <div style="font-size:3.5rem">🔒</div>
      <h1>BrevetQuizz</h1>
      <p>${esc(vue.message || "Cette app est accessible uniquement sur invitation.")}</p>
      <p class="small muted">${vue.motif === "deja_utilisee"
        ? "Chaque lien d'invitation ne fonctionne que sur un seul appareil. Demande un nouveau lien à la personne qui t'a invité."
        : "Demande un lien d'invitation à la personne qui gère l'app."}</p>
      ${vue.cleRefusee ? `<p class="warn">Clé secrète incorrecte.</p>` : ""}
      <details style="text-align:left" ${vue.cleRefusee ? "open" : ""}><summary class="small muted">J'ai la clé de gestion</summary>
        <form data-form="cle-parent" class="stack" style="margin-top:8px">
          <input name="cle" type="password" placeholder="Clé secrète du script" autocomplete="off" required>
          <button class="btn-primary">Entrer</button></form></details></div>`,

    prenom: () => `<div class="card stack center" style="margin-top:40px">
      <div style="font-size:3.5rem">🎓</div>
      <h1>Bienvenue sur BrevetQuizz !</h1>
      <p class="muted">Des quiz et des fiches pour réviser le brevet. Comment tu t'appelles ?</p>
      <form data-form="prenom" class="stack"><input name="prenom" placeholder="Ton prénom" maxlength="30" required autocomplete="given-name">
      <button class="btn-primary btn-big">C'est parti 🚀</button></form></div>`,

    // Accueil « social » : stories des matières, défis reçus, fil d'activité des amis.
    accueil: () => {
      if (!P.prenom) return VUES.prenom();
      const nv = niveau(P.xp);
      const nbErr = Object.keys(P.erreurs).length;
      const court = (m) => ({ "Physique-Chimie": "Physique", "Technologie": "Techno", "Géographie": "Géo" }[m] || m);
      const stories = [`<button class="story" data-go="choix"><span class="story-ring plus">＋</span><span class="story-lab">Mix</span></button>`]
        .concat(matieres().filter((m) => poolDe(m).length).map((m) => {
          const neuves = poolDe(m).some((q) => !P.vues[q.id]);
          return `<button class="story" data-action="quiz" data-pool="${esc(m)}"><span class="story-ring ${neuves ? "" : "vue"}"><span class="story-in" style="background-image:linear-gradient(${couleur(m)}22,${couleur(m)}22)">${emoji(m)}</span></span><span class="story-lab">${esc(court(m))}</span></button>`;
        }))
        .concat(D.frise.length ? [`<button class="story" data-action="quiz" data-pool="#frise"><span class="story-ring ${questionsFrise().some((q) => !P.vues[q.id]) ? "" : "vue"}"><span class="story-in">⏳</span></span><span class="story-lab">Dates</span></button>`] : [])
        .concat(nbErr ? [`<button class="story" data-action="erreurs"><span class="story-ring rouge"><span class="story-in">🩹</span></span><span class="story-lab">Erreurs</span></button>`] : []);

      const defis = SOCIAL && SOCIAL.recus ? SOCIAL.recus.filter((d) => d.statut !== "relevé") : [];
      const fil = SOCIAL && SOCIAL.fil ? SOCIAL.fil : [];
      const item = (x) => x.type === "defi"
        ? `<article class="post">
            <div class="post-head"><span class="avatar" style="background:#D4537E">⚔️</span>
              <div><strong>${esc(x.pour)}</strong> a relevé le défi de <strong>${esc(x.de)}</strong>
              <div class="small muted">${esc(x.matieres)} · ${ilya(x.date)}</div></div></div>
            <div class="duel"><span><strong>${x.score}/${x.total}</strong><br><span class="small muted">${esc(x.pour)}</span></span><span class="vs">VS</span><span><strong>${x.bons}/${x.total}</strong><br><span class="small muted">${esc(x.de)}</span></span></div>
            <div class="small" style="text-align:center">${x.score > x.bons ? `🏆 ${esc(x.pour)} gagne !` : x.score === x.bons ? "🤝 Égalité !" : `🏆 ${esc(x.de)} garde la victoire !`}</div>
          </article>`
        : `<article class="post">
            <div class="post-head">${avatar(x.nom)}
              <div style="flex:1"><strong>${x.moi ? "Tu" : esc(x.nom)}</strong> ${x.moi ? "as fait" : "a fait"} <strong>${x.bons}/${x.total}</strong>${x.matieres ? ` en ${esc(x.matieres)}` : ""}${x.total && x.bons === x.total ? " 💯" : x.total && x.bons / x.total >= .8 ? " ⭐" : ""}
              <div class="small muted">${ilya(x.date)}</div></div></div>
            ${x.moi || !peutDefier()
              ? (x.bravos ? `<div class="post-actions"><span class="small muted">❤️ ${plural(x.bravos, "bravo")}</span></div>` : "")
              : `<div class="post-actions"><button class="bravo ${x.jaiDitBravo ? "on" : ""}" data-action="bravo" data-partie="${esc(x.id)}" ${x.jaiDitBravo ? "disabled" : ""}>${x.jaiDitBravo ? "❤️" : "🤍"} Bravo${x.bravos ? ` · ${x.bravos}` : ""}</button></div>`}
          </article>`;

      return `
      <div class="stories" role="list" aria-label="Lancer une partie par matière">${stories.join("")}</div>
      ${peutPartager() ? `<section class="post partage-card">
        <div style="flex:1"><strong>🔗 Partager l'app</strong>
          <div class="small muted">Invite un ami : crée-lui un lien personnel pour qu'il te rejoigne.</div></div>
        <button class="btn-primary" data-action="onglet" data-onglet="partager">Inviter</button>
      </section>` : ""}
      <section class="me-card">
        ${avatar(P.prenom)}
        <div style="flex:1;min-width:0">
          <div><strong>Salut ${esc(P.prenom)} 👋</strong></div>
          <div class="small muted">Niveau ${nv.n} · ${esc(nv.nom)} · 🔥 ${plural(serieActuelle(), "jour")}</div>
          <div class="xpbar"><span style="width:${nv.pct}%"></span></div>
        </div>
      </section>
      ${D.horsLigne ? `<p class="warn">📴 Hors connexion : révisions chargées le ${D.charge.toLocaleDateString("fr-FR")}.</p>` : ""}
      ${defis.map((d) => `<article class="defi-card">
          <div class="small" style="opacity:.9">🔥 Défi lancé par ${esc(d.de)} · ${ilya(d.date)}</div>
          <div class="defi-titre">Bats son ${d.bons}/${d.total}${d.matieres ? ` en ${esc(d.matieres)}` : ""}</div>
          <button class="defi-btn" data-action="relever" data-defi="${esc(d.id)}">Relever le défi</button>
        </article>`).join("")}
      ${socialPossible()
        ? (SOCIAL ? (fil.length ? fil.map(item).join("")
            : `<div class="post center"><div style="font-size:2rem">👋</div><p style="margin:4px 0">Le fil est encore vide.</p><p class="small muted" style="margin:0">Termine une partie : elle apparaîtra ici, et tes amis pourront te dire bravo.</p></div>`)
          : `<div class="post center muted">Chargement du fil…</div>`)
        : `<div class="post center"><p style="margin:0">Choisis une matière en haut pour lancer une partie, ou touche ＋ pour en mélanger plusieurs.</p></div>`}`;
    },

    // Profil : niveau, raccourcis, défis envoyés, statistiques.
    profil: () => {
      const nv = niveau(P.xp);
      const nbErr = Object.keys(P.erreurs).length;
      const nbBadges = Object.keys(P.badges).length;
      const envoyes = SOCIAL && SOCIAL.envoyes ? SOCIAL.envoyes.slice().reverse().slice(0, 10) : [];
      return `<section class="post center">
          <div style="display:flex;justify-content:center">${avatar(P.prenom).replace('class="avatar"', 'class="avatar avatar-xl"')}</div>
          <h2 style="margin:8px 0 0">${esc(P.prenom)}</h2>
          <div class="small muted">Niveau ${nv.n} · ${esc(nv.nom)}</div>
          <div class="xpbar" style="margin:10px auto;max-width:260px"><span style="width:${nv.pct}%"></span></div>
          <div class="small muted">${P.xp} XP${nv.reste > 0 ? ` · encore ${nv.reste} XP pour le niveau suivant` : ""}</div>
          <div class="profil-stats">
            <div><strong>${serieActuelle()}</strong><span>jours 🔥</span></div>
            <div><strong>${P.repondues}</strong><span>réponses</span></div>
            <div><strong>${nbBadges}</strong><span>badges</span></div>
          </div>
        </section>
        <div class="post liste">
          <button class="list-btn" data-action="erreurs" ${nbErr ? "" : "disabled"}><span>🩹 Mes erreurs</span><span class="muted">${nbErr ? nbErr + " à revoir" : "aucune"} ›</span></button>
          <button class="list-btn" data-go="badges"><span>🏅 Badges</span><span class="muted">${nbBadges}/${BADGES.length} ›</span></button>
          <button class="list-btn" data-go="frise"><span>⏳ Frise chronologique</span><span class="muted">›</span></button>
          <button class="list-btn" data-go="parent"><span>📊 Statistiques et réglages</span><span class="muted">›</span></button>
        </div>
        ${envoyes.length ? `<div class="post"><h3>⚔️ Mes défis envoyés</h3>
          ${envoyes.map((d) => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line)">${avatar(d.pour)}
            <span style="flex:1">${esc(d.pour)} <span class="small muted">· ${esc(d.matieres)} · ton ${d.bons}/${d.total}</span></span>
            <span class="small">${d.statut === "relevé" ? `${d.score}/${d.total} · ${d.score > d.bons ? "perdu" : d.score === d.bons ? "égalité" : "gagné 🏆"}` : "⏳ en attente"}</span></div>`).join("")}</div>` : ""}`;
    },

    // Notifications : défis reçus, défis relevés, bravos.
    notifs: () => {
      const L = SOCIAL && SOCIAL.notifs ? SOCIAL.notifs : null;
      const vues = vue.vuesAvant != null ? vue.vuesAvant : (P.notifsVues || 0);
      if (L && L.length) { const max = Math.max(...L.map((n) => n.t)); if (max > (P.notifsVues || 0)) { P.notifsVues = max; save(); setTimeout(majPastille); } }
      const alerte = "Notification" in window && Notification.permission === "default";
      return `<h1 style="margin-top:4px">Notifications</h1>
        ${!L ? `<div class="post center muted">Chargement…</div>`
        : !L.length ? `<div class="post center"><div style="font-size:2rem">🔔</div><p class="muted" style="margin:0">Rien pour l'instant. Les défis et les bravos de tes amis apparaîtront ici.</p></div>`
        : `<div class="post liste">${L.map((n) => `<div class="notif ${n.t > vues ? "neuve" : ""}">
            ${avatar(n.de)}<div style="flex:1">${esc(texteNotif(n))}<div class="small muted">${ilya(n.date)}</div>
            ${n.type === "defi" && n.statut !== "relevé" ? `<button class="btn-primary" style="margin-top:6px" data-action="relever" data-defi="${esc(n.defi)}">Relever le défi</button>` : ""}</div></div>`).join("")}</div>`}
        ${alerte ? `<div class="post"><p class="small muted" style="margin:0 0 8px">Recevoir aussi une alerte sur l'écran quand l'app est ouverte en arrière-plan :</p>
          <button data-action="alertes">🔔 Activer les alertes</button></div>` : ""}`;
    },

    // Nouvelle partie : on coche une ou plusieurs matières de 3e.
    choix: () => {
      const n = vue.n || P.dernierN || 10;
      const sel = selection();
      const items = matieres().map((m) => ({ id: m, nom: m, pool: poolDe(m), ico: emoji(m), c: couleur(m) }));
      if (D.frise.length) items.splice(4, 0, { id: "#frise", nom: "Dates (frise)", pool: questionsFrise(), ico: "⏳", c: "#b45309" });
      const dispo = items.filter((x) => x.pool.length);
      const nbQ = dispo.filter((x) => sel.has(x.id)).reduce((s, x) => s + x.pool.length, 0);
      const nbM = dispo.filter((x) => sel.has(x.id)).length;
      const carte = (x) => {
        const vues = x.pool.filter((q) => P.vues[q.id]).length;
        const on = sel.has(x.id) && x.pool.length;
        return `<button class="subject ${on ? "picked" : ""} ${x.pool.length ? "" : "empty"}" style="--c:${x.c}" data-action="toggle-mat" data-mat="${esc(x.id)}" aria-pressed="${on ? "true" : "false"}">
          <span class="row"><span class="name">${x.ico} ${esc(x.nom)}</span><span class="spacer"></span><span class="check">${on ? "✓" : ""}</span></span>
          <span class="small muted">${x.pool.length ? `${x.pool.length - vues} nouvelle${x.pool.length - vues > 1 ? "s" : ""} sur ${x.pool.length}` : "Pas encore de questions"}</span>
          <span class="progress"><span style="width:${x.pool.length ? Math.round(vues / x.pool.length * 100) : 0}%"></span></span></button>`;
      };
      return `${retour()}
      <h1>Nouvelle partie</h1>
      <div class="card"><div class="small muted" style="margin-bottom:6px">Nombre de questions</div>
        <div class="seg">${[5, 10, 15, 20].map((k) => `<button data-action="nbq" data-n="${k}" class="${k === n ? "on" : ""}">${k}</button>`).join("")}</div></div>
      <div class="row" style="margin:16px 0 8px"><h3 style="margin:0">Sur quelles matières ?</h3><span class="spacer"></span>
        <button class="btn-ghost small" data-action="sel-tout">Tout</button><button class="btn-ghost small" data-action="sel-rien">Aucune</button></div>
      <div class="grid">${items.map(carte).join("")}</div>
      <div class="sticky-go">
        <button class="btn-primary btn-big" data-action="go-partie" ${nbM ? "" : "disabled"}>
          ${nbM ? `🎯 C'est parti : ${Math.min(n, nbQ)} questions · ${plural(nbM, "matière")}` : "Coche au moins une matière"}</button>
      </div>
      <p class="small muted" style="margin-top:12px">Les questions déjà vues ne reviennent pas tant que tu n'as pas fait le tour des matières choisies. Les matières grisées n'ont pas encore de questions : on peut en ajouter dans 📊 Statistiques &gt; Ajouter.</p>`;
    },

    quiz: () => {
      const q = quiz.questions[quiz.i];
      const fini = quiz.repondu != null;
      const ok = fini && quiz.repondu === q.bonne;
      const lettres = "ABCD";
      const fiche = fini && !ok ? ficheDe(q) : null;
      return `
      <div class="qtop">
        <button class="btn-ghost" data-action="quitter" aria-label="Quitter">✕</button>
        <div class="progress"><span style="width:${(quiz.i + (fini ? 1 : 0)) / quiz.questions.length * 100}%"></span></div>
        <span class="small muted">${quiz.i + 1}/${quiz.questions.length}</span>
      </div>
      ${quiz.cycle && quiz.i === 0 && !fini ? `<p class="ok">🔄 Tu as vu toutes les questions de cette sélection : nouveau tour !</p>` : ""}
      ${quiz.i === 0 && !fini ? `<p class="warn">📵 Reste dans l'app : ${quiz.defi
        ? "en défi, si tu la quittes pendant une question, ta réponse est comptée fausse."
        : "si tu la quittes pendant une question, elle est remplacée la 1re fois (un appel, ça arrive), puis comptée fausse."}</p>` : ""}
      <div class="card ${fini && !ok ? "shake" : ""}">
        <span class="tag" style="background:${couleur(q.matiere)}22;color:${couleur(q.matiere)}">${emoji(q.matiere)} ${esc(q.matiere)}${q.theme ? " · " + esc(q.theme) : ""}</span>
        <div class="question">${esc(q.question)}</div>
        <div class="answers">
          ${q.choix.map((c, i) => {
            let cls = "";
            if (fini && c === q.bonne) cls = "good";
            else if (fini && c === quiz.repondu) cls = "bad";
            return `<button class="answer ${cls}" data-action="repondre" data-i="${i}" ${fini ? "disabled" : ""}><span class="letter">${lettres[i]}</span><span>${esc(c)}</span></button>`;
          }).join("")}
        </div>
        ${fini ? `<div class="feedback ${ok ? "good" : "bad"}">
          <strong>${ok ? ["Bravo ! 🎉", "Exact ! ✅", "Bien joué ! 💪", "Parfait ! ⭐"][quiz.i % 4] : quiz.repondu === TRICHE ? "🚫 Tu as quitté l'app : réponse comptée fausse" : "Pas tout à fait…"}</strong>
          ${ok && quiz.combo >= 3 ? ` <span class="combo">🔥 Combo x${quiz.combo}</span>` : ""}
          ${ok ? ` <span class="small muted">+${quiz.dernierGain} XP</span>` : `<div>La bonne réponse : <strong>${esc(q.bonne)}</strong></div>`}
          ${q.explication && (q.type !== "frise-evt" || !ok) ? `<p style="margin:8px 0 0;white-space:pre-line">${q.type === "frise-evt" ? "Les autres dates : \n" : ""}${esc(q.explication)}</p>` : ""}
          ${fiche ? `<button style="margin-top:10px" data-action="voir-fiche" data-cle="${fiche.cle}">📘 Revoir la fiche « ${esc(fiche.titre)} »</button>` : ""}
        </div>
        <button class="btn-primary btn-big" style="margin-top:14px" data-action="suivante">${quiz.i + 1 < quiz.questions.length ? "Question suivante →" : "Voir mon score 🏁"}</button>` : ""}
      </div>`;
    },

    resultat: () => {
      const r = quiz.resultat;
      const pct = Math.round(r.bons / r.total * 100);
      const etoiles = pct === 100 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
      const msg = pct === 100 ? "Sans faute, impressionnant !" : pct >= 70 ? "Très bien, continue comme ça !" : pct >= 40 ? "Pas mal, encore un effort !" : "Courage, revois les fiches et réessaie !";
      const d = quiz.defi;
      const duel = d ? `<div class="defi-card" style="text-align:center">
          <div class="small">⚔️ Défi de ${esc(d.de)}</div>
          <div class="duel" style="color:inherit"><span><strong>${r.bons}/${r.total}</strong><br><span class="small">toi</span></span><span class="vs">VS</span><span><strong>${d.bons}/${d.total}</strong><br><span class="small">${esc(d.de)}</span></span></div>
          <div class="defi-titre">${r.bons > d.bons ? "Tu as gagné ! 🏆" : r.bons === d.bons ? "Égalité 🤝" : `${esc(d.de)} gagne cette fois 💪`}</div>
          <div class="small">${esc(d.de)} verra le résultat dans ses notifications.</div></div>` : "";
      return `${duel}<div class="card stack center" ${d ? 'style="margin-top:12px"' : ""}>
        <div class="stars">${"⭐".repeat(etoiles)}${"☆".repeat(3 - etoiles)}</div>
        <div class="big-score">${r.bons}/${r.total}</div>
        <p>${msg}</p>
        ${!d && peutDefier() ? `<button class="btn-defier btn-big" data-action="defier">⚔️ Défier un ami avec ce score</button>` : ""}
        ${!d && scriptUrl() && P.cle && !ACCES.code ? `<button class="btn-defier btn-big" data-action="onglet" data-onglet="partager">🎮 Crée ton profil joueur pour défier tes amis</button>` : ""}
        <p><strong>+${r.xp} XP</strong>${r.niveauUp ? ` · 🎉 Niveau ${niveau(P.xp).n} atteint : ${esc(niveau(P.xp).nom)} !` : ""}</p>
        ${r.nouveauxBadges.length ? `<div class="ok">Nouveau badge : ${r.nouveauxBadges.map((b) => b.ico + " " + esc(b.nom)).join(", ")}</div>` : ""}
        ${quiz.triches ? `<p class="warn" style="margin:0">🚫 ${plural(quiz.triches, "question comptée fausse", "questions comptées fausses")} parce que tu as quitté l'app. Révise au lieu de tricher ! 😉</p>` : ""}
        ${r.erreurs ? `<p class="small muted">${plural(r.erreurs, "erreur")} ajoutée${r.erreurs > 1 ? "s" : ""} à « Mes erreurs » pour la revanche.</p>` : ""}
        <button class="btn-primary btn-big" data-action="rejouer">Encore un quiz 🔁</button>
        <button data-go="accueil">Accueil</button>
      </div>`;
    },

    fiches: () => {
      const m = vue.matiere;
      if (!m) {
        return `<h1 style="margin-top:4px">Fiches de révision</h1>
        <div class="grid">${matieres().map((x) => {
          const fs = D.fiches.filter((f) => f.matiere === x);
          const ok = fs.filter((f) => P.maitrise[f.cle]).length;
          return `<button class="subject" style="--c:${couleur(x)}" data-go="fiches" data-matiere="${esc(x)}" ${fs.length ? "" : "disabled"}>
            <span class="name">${emoji(x)} ${esc(x)}</span><span class="small muted">${ok}/${fs.length} maîtrisée${ok > 1 ? "s" : ""}</span>
            <span class="progress"><span style="width:${fs.length ? ok / fs.length * 100 : 0}%"></span></span></button>`;
        }).join("")}</div>`;
      }
      const fs = D.fiches.filter((f) => f.matiere === m);
      const themes = [...new Set(fs.map((f) => f.theme))];
      return `${retour("fiches", "Matières")}<h1>${emoji(m)} ${esc(m)}</h1>
        ${themes.map((t) => `<h3 style="margin-top:16px">${esc(t || "Divers")}</h3><div class="stack">
          ${fs.filter((f) => f.theme === t).map((f) => `<button class="list-btn" data-action="voir-fiche" data-cle="${f.cle}">
            <span>${esc(f.titre)}</span><span class="${P.maitrise[f.cle] ? "done" : "muted"}">${P.maitrise[f.cle] ? "✓ maîtrisée" : "›"}</span></button>`).join("")}
        </div>`).join("")}
        <button class="btn-primary btn-big" style="margin-top:16px" data-action="quiz" data-pool="${esc(m)}">🎯 Quiz ${esc(m)}</button>`;
    },

    frise: () => {
      const themes = [...new Set(D.frise.map((e) => e.theme))];
      const t = vue.theme || "";
      const items = D.frise.filter((e) => !t || e.theme === t);
      return `${scriptUrl() ? retour("profil", "Profil") : ""}<h1>⏳ Frise chronologique</h1>
        <div class="tabs"><button class="${t ? "" : "on"}" data-go="frise" data-theme="">Tout</button>
          ${themes.map((x) => `<button class="${x === t ? "on" : ""}" data-go="frise" data-theme="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <div class="card"><div class="timeline">
          ${items.map((e) => `<div class="tl-item"><span class="tl-year">${e.annee}</span> — ${esc(e.evenement)}</div>`).join("")}
        </div></div>
        <button class="btn-primary btn-big" style="margin-top:16px" data-action="quiz" data-pool="#frise">🎯 Quiz des dates</button>`;
    },

    // Classement par taux de réussite, visible par tous les invités (prénom, % et nombre de réponses seulement).
    classement: () => {
      if (!vue.liste && !vue.chargeCl) {
        vue.chargeCl = true;
        synchroniser() // envoie d'abord le dernier score de l'élève
          .then(() => envoyer({ action: "classement", code: ACCES.code || "", appareil: ACCES.appareil }))
          .then((r) => { vue.liste = r.classement; render(); })
          .catch((e) => { vue.liste = []; vue.erreurCl = e.message; render(); });
      }
      const MIN = 20;
      const L = vue.liste;
      const classes = (L || []).filter((x) => x.repondues >= MIN)
        .sort((a, b) => b.reussite - a.reussite || b.repondues - a.repondues);
      const attente = (L || []).filter((x) => x.repondues < MIN).sort((a, b) => b.repondues - a.repondues);
      // Ex aequo : même réussite = même rang.
      let rang = 0;
      classes.forEach((x, i) => { rang = i && x.reussite === classes[i - 1].reussite ? rang : i + 1; x.rang = rang; });
      const medaille = (r) => ["🥇", "🥈", "🥉"][r - 1] || `<span class="rang">${r}</span>`;
      const moi = (L || []).find((x) => x.moi);
      return `<h1 style="margin-top:4px">🏆 Classement</h1>
        <p class="small muted">Classement par taux de bonnes réponses. Il faut au moins ${MIN} réponses pour être classé. Mis à jour à la fin de chaque partie.</p>
        ${!L ? `<div class="card"><p class="muted">Chargement du classement…</p></div>`
        : vue.erreurCl ? `<div class="card"><div class="warn">${esc(vue.erreurCl)}</div></div>`
        : `${moi && moi.rang ? `<div class="ok" style="margin-bottom:12px">Tu occupes la <strong>${moi.rang}${moi.rang === 1 ? "re" : "e"} place</strong>${classes.filter((x) => x.rang === moi.rang).length > 1 ? " (ex æquo)" : ""} sur ${classes.length}, avec ${moi.reussite} % de réussite${moi.rang === 1 ? " 👑" : ". Continue !"}</div>` : ""}
          ${moi && !moi.rang ? `<div class="ok" style="margin-bottom:12px">Encore ${MIN - moi.repondues} réponse${MIN - moi.repondues > 1 ? "s" : ""} pour entrer dans le classement 💪</div>` : ""}
          <div class="card">
            ${classes.length ? classes.map((x) => `<div class="cl-row ${x.moi ? "cl-moi" : ""}">
                <div class="cl-rang">${medaille(x.rang)}</div>
                <div class="cl-nom"><strong>${esc(x.nom)}</strong>${x.moi ? ` <span class="tag">toi</span>` : ""}<div class="small muted">${x.repondues} réponses · ${x.parties} parties</div></div>
                <div class="cl-val">${x.reussite} %</div>
              </div>`).join("")
            : `<p class="muted center">Personne n'est encore classé. Le premier à ${MIN} réponses prend la tête ! 🚀</p>`}
          </div>
          ${attente.length ? `<div class="card" style="margin-top:12px"><h3>Pas encore classés</h3>
            ${attente.map((x) => `<div class="cl-row ${x.moi ? "cl-moi" : ""}"><div class="cl-rang">⏳</div>
              <div class="cl-nom">${esc(x.nom)}${x.moi ? ` <span class="tag">toi</span>` : ""}<div class="small muted">${x.repondues}/${MIN} réponses</div></div></div>`).join("")}</div>` : ""}`}
        <button class="btn-primary btn-big" style="margin-top:16px" data-go="choix">🎯 Jouer pour grimper</button>`;
    },

    badges: () => `${retour("profil", "Profil")}<h1>🏅 Badges</h1>
      <div class="grid">${BADGES.map((b) => `<div class="card badge ${P.badges[b.id] ? "" : "locked"}">
        <div class="ico">${b.ico}</div><strong>${esc(b.nom)}</strong><div class="small muted">${esc(b.desc)}</div></div>`).join("")}</div>`,

    // ─────────── Statistiques ───────────
    parent: () => {
      if (P.pin && !vue.ok) {
        return `${retour("profil", "Profil")}<div class="card stack center"><h2>🔒 Statistiques</h2>
          <form data-form="pin" class="stack"><input name="pin" type="password" inputmode="numeric" placeholder="Code" autocomplete="off">
          <button class="btn-primary">Entrer</button></form></div>`;
      }
      const onglet = vue.onglet || "suivi";
      const tabs = [["suivi", "📊 Suivi"]]
        .concat(estParent() ? [["ajouter", "➕ Ajouter"], ["qualite", "🔎 Qualité"]] : [])
        .concat(scriptUrl() && P.cle ? [["eleves", "📈 Élèves"]] : [])
        .concat(peutPartager() ? [["partager", "🔗 Partager"]] : [])
        .concat([["reglages", "⚙️ Réglages"]]);
      return `${retour("profil", "Profil")}<h1>Statistiques</h1>
        <div class="tabs">${tabs.map(([k, l]) => `<button class="${k === onglet ? "on" : ""}" data-action="onglet" data-onglet="${k}">${l}</button>`).join("")}</div>
        ${PARENT[onglet]()}`;
    }
  };

  const PARENT = {
    suivi: () => {
      const all = toutesQuestions();
      const lignesM = matieres().filter((m) => poolDe(m).length || P.stats[m]).concat(D.frise.length ? ["Dates (frise)"] : []).map((m) => {
        const pool = m === "Dates (frise)" ? questionsFrise() : D.quiz.filter((q) => q.matiere === m);
        const s = P.stats[m] || { ok: 0, total: 0 };
        const vues = pool.filter((q) => P.vues[q.id]).length;
        const err = pool.filter((q) => P.erreurs[q.id]).length;
        return `<tr><td>${emoji(m)} ${esc(m)}</td><td class="num">${s.total ? Math.round(s.ok / s.total * 100) + " %" : "–"}</td>
          <td class="num">${pool.length - vues}/${pool.length}</td><td class="num">${err}</td></tr>`;
      }).join("");
      const faibles = Object.keys(P.erreurs).map((id) => all.find((q) => q.id === id)).filter(Boolean).slice(0, 15);
      return `<div class="card stack">
        <div class="row"><strong>${esc(P.prenom || "Élève")}</strong><span class="spacer"></span><span class="muted small">Niveau ${niveau(P.xp).n} · ${P.xp} XP · ${plural(P.quizFaits, "quiz")}</span></div>
        <table><thead><tr><th>Matière</th><th class="num">Réussite</th><th class="num">Jamais vues</th><th class="num">Erreurs</th></tr></thead><tbody>${lignesM}</tbody></table>
        <p class="hint">« Jamais vues » : quand ce nombre approche de 0, ajoutez des questions dans cette matière pour éviter les répétitions.</p>
      </div>
      ${faibles.length ? `<div class="card" style="margin-top:12px"><h3>Questions ratées à revoir</h3><ul class="fiche-points">
        ${faibles.map((q) => `<li>${q.type ? "⏳ " + esc(q.e.annee + " : " + q.e.evenement) : esc(q.question)} <span class="muted small">(${esc(q.matiere)})</span></li>`).join("")}</ul></div>` : ""}`;
    },

    ajouter: () => {
      const type = vue.type || "question";
      const types = [["question", "Question"], ["fiche", "Fiche"], ["date", "Date de frise"], ["coller", "Coller plusieurs lignes"]];
      const ms = matieres();
      const optsM = ms.map((m) => `<option ${m === vue.mat ? "selected" : ""}>${esc(m)}</option>`).join("") + `<option value="__autre">Autre matière…</option>`;
      const themesDe = (m) => [...new Set(D.quiz.filter((q) => q.matiere === m).map((q) => q.theme).concat(D.fiches.filter((f) => f.matiere === m).map((f) => f.theme)))].filter(Boolean);
      const mat0 = vue.mat || ms[0] || "";
      const dl = `<datalist id="themes">${themesDe(mat0).map((t) => `<option value="${esc(t)}">`).join("")}</datalist>`;
      const champsMatiere = `<label>Matière</label><select name="matiere" data-action="mat-change">${optsM}</select>
        <input name="autre" placeholder="Nom de la nouvelle matière" style="margin-top:6px" hidden>
        <label>Thème / chapitre</label><input name="theme" list="themes" placeholder="Ex : Les guerres mondiales" required>${dl}
        <div class="hint">Utilisez le même thème qu'une fiche pour que le bouton « Revoir la fiche » apparaisse après une erreur.</div>`;
      const pasDeScript = !scriptUrl() ? `<div class="warn">Le script Google n'est pas encore installé : la ligne sera copiée pour que vous la colliez vous-même dans le Sheet. Pour l'ajout direct, voir l'onglet ⚙️ Réglages.</div>` : "";
      const pack = window.BQ_PACK;
      let form = "";
      if (type === "question") {
        form = `<form data-form="question" class="card">${champsMatiere}
          <label>Question</label><textarea name="question" required></textarea>
          <label>✅ Bonne réponse</label><input name="bonne" required data-action="qual">
          <label>❌ Mauvaise réponse 1</label><input name="p1" required data-action="qual">
          <label>❌ Mauvaise réponse 2</label><input name="p2" required data-action="qual">
          <label>❌ Mauvaise réponse 3</label><input name="p3" required data-action="qual">
          <div class="hint">Pour qu'il ne trouve pas par élimination : des pièges de même forme et de même longueur que la bonne réponse, qui reprennent les erreurs classiques (dates proches, notions voisines, formule inversée…).</div>
          <div id="qual"></div>
          <label>Explication (affichée après la réponse)</label><textarea name="explication"></textarea>
          ${pasDeScript}<button class="btn-primary btn-big" style="margin-top:12px">Ajouter la question</button></form>`;
      } else if (type === "fiche") {
        form = `<form data-form="fiche" class="card">${champsMatiere}
          <label>Titre de la fiche</label><input name="fiche" list="titres" required placeholder="Ex : La Guerre froide (1947-1991)">
          <datalist id="titres">${D.fiches.filter((f) => f.matiere === mat0).map((f) => `<option value="${esc(f.titre)}">`).join("")}</datalist>
          <div class="hint">Choisissez un titre existant pour compléter une fiche, ou un nouveau titre pour en créer une.</div>
          <label>Points à retenir (un par ligne)</label><textarea name="points" required style="min-height:160px"></textarea>
          ${pasDeScript}<button class="btn-primary btn-big" style="margin-top:12px">Ajouter à la fiche</button></form>`;
      } else if (type === "date") {
        const th = [...new Set(D.frise.map((e) => e.theme))];
        form = `<form data-form="date" class="card">
          <label>Thème</label><input name="theme" list="fthemes" required><datalist id="fthemes">${th.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
          <label>Année</label><input name="annee" type="number" required min="-3000" max="2100">
          <label>Événement</label><input name="evenement" required placeholder="Ex : Chute du mur de Berlin.">
          <div class="hint">Chaque date crée automatiquement 2 questions (« En quelle année… ? » et « Que s'est-il passé en… ? ») avec des pièges proches.</div>
          ${pasDeScript}<button class="btn-primary btn-big" style="margin-top:12px">Ajouter la date</button></form>`;
      } else {
        form = `<form data-form="coller" class="card">
          <label>Onglet de destination</label>
          <select name="onglet"><option value="Quiz">Quiz : Matière | Thème | Question | Bonne réponse | Mauvaise 1 | Mauvaise 2 | Mauvaise 3 | Explication</option>
          <option value="Fiches">Fiches : Matière | Thème | Fiche | Point à retenir</option>
          <option value="Frise">Frise : Thème | Année | Événement</option></select>
          <label>Lignes à coller</label><textarea name="lignes" style="min-height:180px" placeholder="Collez ici des lignes copiées depuis un tableur (colonnes séparées par des tabulations) ou séparées par des ;"></textarea>
          <div class="hint">Astuce : copiez un cours dans Claude et demandez « fais-moi 15 questions de brevet sur ce cours, sous forme de tableau avec ces colonnes, avec des mauvaises réponses très proches de la bonne ». Copiez le tableau, collez-le ici.</div>
          <div id="apercu"></div>
          ${pasDeScript}<button class="btn-primary btn-big" style="margin-top:12px">Ajouter ces lignes</button></form>`;
      }
      return `${pack && scriptUrl() ? `<div class="card stack" style="margin-bottom:12px">
          <strong>📦 Pack BrevetQuizz</strong>
          <p class="small muted" style="margin:0">${pack.quiz.filter((q) => q.cle).length} questions de votre Sheet améliorées (pièges plus proches de la bonne réponse) + ${pack.quiz.filter((q) => !q.cle).length} nouvelles questions et ${pack.fiches.length} points de fiches dans toutes les matières du brevet. Sans doublon, vos lignes existantes sont conservées.</p>
          <button data-action="pack" ${P.packInstalle ? "" : 'class="btn-primary"'}>${P.packInstalle ? "✓ Pack installé (réinstaller)" : "Installer le pack dans le Google Sheet"}</button></div>` : ""}
        <div class="tabs">${types.map(([k, l]) => `<button class="${k === type ? "on" : ""}" data-action="type" data-type="${k}">${l}</button>`).join("")}</div>
        ${form}`;
    },

    qualite: () => {
      const pb = D.quiz.map((q) => ({ q, w: qualite(q.bonne, q.pieges) })).filter((x) => x.w.length);
      return `<div class="card stack">
        <p>Questions dont les réponses risquent de se deviner par élimination, ou incomplètes.</p>
        ${D.ignorees.length ? `<div class="warn"><strong>${plural(D.ignorees.length, "ligne ignorée")}</strong> dans l'onglet Quiz (matière, question, bonne réponse ou pièges manquants) : lignes ${D.ignorees.map((x) => x.ligne).join(", ")}.<br>Si la bonne réponse est un nombre (ex. 1914), mettez la colonne au format « Texte brut » (Format > Nombre > Texte brut).</div>` : ""}
        ${pb.length ? pb.map((x) => `<div style="border-top:1px solid var(--line);padding-top:10px"><strong>${esc(x.q.question)}</strong>
          <div class="small muted">✅ ${esc(x.q.bonne)} · ❌ ${x.q.pieges.map(esc).join(" · ")}</div>
          ${x.w.map((w) => `<div class="warn">${esc(w)}</div>`).join("")}</div>`).join("") : `<div class="ok">👌 Aucun problème détecté sur les ${D.quiz.length} questions.</div>`}
        <p class="hint">Pour corriger, modifiez directement la ligne dans le Google Sheet puis rechargez les données (⚙️ Réglages).</p></div>`;
    },

    // Résultats envoyés par les appareils invités (onglets « Résultats » et « Historique » du Sheet).
    eleves: () => {
      if (!vue.resultats && !vue.chargeRes) {
        vue.chargeRes = true;
        envoyer({ action: "resultats" })
          .then((r) => { vue.resultats = r; render(); })
          .catch((e) => { vue.resultats = { eleves: [], historique: [], erreur: e.message }; render(); });
      }
      const R = vue.resultats;
      if (!R) return `<div class="card"><p class="muted">Chargement des résultats…</p></div>`;
      if (R.erreur) return `<div class="card"><div class="warn">${esc(R.erreur)}</div>
        <p class="hint">Si vous venez de modifier le script Google, vérifiez que la nouvelle version est bien déployée (Déployer > Gérer les déploiements > Nouvelle version).</p></div>`;
      if (!R.eleves.length) return `<div class="card center stack"><div style="font-size:2.5rem">📭</div>
        <p>Aucun résultat pour l'instant.</p><p class="small muted">Les résultats d'un élève apparaissent ici dès qu'il termine une partie avec son lien d'invitation.</p></div>`;

      const e = R.eleves.find((x) => x.code === vue.eleve) || R.eleves[0];
      const parties = R.historique.filter((h) => h.code === e.code);
      const matieresEl = Object.entries(e.matieres || {})
        .filter(([, s]) => s && s.total)
        .map(([m, s]) => ({ m, pct: Math.round(s.ok / s.total * 100), total: s.total }))
        .sort((a, b) => a.pct - b.pct);
      const faibles = matieresEl.filter((x) => x.total >= 5 && x.pct < 50);

      // Activité des 14 derniers jours : questions répondues par jour (d'après l'historique).
      const jours = [];
      for (let k = 13; k >= 0; k--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - k);
        jours.push({ d, q: 0, ok: 0 });
      }
      parties.forEach((p) => {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(p.date);
        if (!m) return;
        const t = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
        const j = jours.find((x) => x.d.getTime() === t);
        if (j) { j.q += p.total; j.ok += p.bons; }
      });
      const max = Math.max(1, ...jours.map((j) => j.q));
      const fmtJour = (d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

      return `
        ${R.eleves.length > 1 ? `<div class="tabs">${R.eleves.map((x) => `<button class="${x.code === e.code ? "on" : ""}" data-action="voir-eleve" data-code="${esc(x.code)}">${esc(x.nom || x.prenom)}</button>`).join("")}</div>` : ""}
        <div class="card stack">
          <div class="row"><h2 style="margin:0">${esc(e.nom || e.prenom)}</h2><span class="spacer"></span>
            <button class="btn-ghost small" data-action="maj-resultats" aria-label="Actualiser">🔄</button></div>
          <div class="small muted" style="margin-top:-6px">Dernière activité : ${esc(e.activite || "—")}${e.prenom && e.prenom !== e.nom ? ` · se présente comme « ${esc(e.prenom)} »` : ""}</div>
          <div class="tiles">
            <div class="tile"><div class="tile-val">${esc(e.reussite || "–")}</div><div class="tile-lab">de réussite</div></div>
            <div class="tile"><div class="tile-val">${e.parties}</div><div class="tile-lab">parties · ${e.repondues} réponses</div></div>
            <div class="tile"><div class="tile-val">${e.serie} 🔥</div><div class="tile-lab">jours d'affilée</div></div>
            <div class="tile"><div class="tile-val">${esc(String(e.niveau).split(" · ")[0] || "–")}</div><div class="tile-lab">niveau · ${e.xp} XP</div></div>
          </div>
          <p style="margin:0">${faibles.length
            ? `⚠️ <strong>À retravailler :</strong> ${faibles.map((x) => `${esc(x.m)} (${x.pct} %)`).join(", ")}`
            : matieresEl.length ? "👍 Aucun point faible repéré pour l'instant." : ""}</p>
          <div class="small muted">${e.erreurs} question${e.erreurs > 1 ? "s" : ""} ratée${e.erreurs > 1 ? "s" : ""} à revoir · ${e.badges} badge${e.badges > 1 ? "s" : ""} · ${e.fiches} fiche${e.fiches > 1 ? "s" : ""} maîtrisée${e.fiches > 1 ? "s" : ""}</div>
        </div>

        <div class="card" style="margin-top:12px">
          <h3>Réussite par matière</h3>
          ${matieresEl.length ? matieresEl.map((x) => `<div class="barrow">
            <div class="barrow-lab">${x.m === "Dates (frise)" ? "⏳" : emoji(x.m)} ${esc(x.m)}</div>
            <div class="bar-track" role="img" aria-label="${esc(x.m)} : ${x.pct} % de réussite sur ${x.total} réponses"><span class="bar-fill" style="width:${x.pct}%"></span></div>
            <div class="barrow-val"><strong>${x.pct} %</strong> <span class="muted small">· ${x.total} rép.</span>${x.total >= 5 && x.pct < 50 ? ` <span class="small" style="color:var(--warn)">⚠️</span>` : ""}</div>
          </div>`).join("") : `<p class="muted small">Pas encore de réponses.</p>`}
        </div>

        <div class="card" style="margin-top:12px">
          <h3>Questions répondues sur 14 jours</h3>
          <div class="chart14" role="group" aria-label="Questions répondues par jour sur les 14 derniers jours">
            <span class="chart14-max small muted">${max > 1 ? max : ""}</span>
            ${jours.map((j) => `<button class="col14" data-action="tip14" data-tip="${esc(fmtJour(j.d))} : ${j.q ? `${j.q} questions, ${j.ok} bonnes réponses` : "aucune partie"}" aria-label="${esc(fmtJour(j.d))} : ${j.q} questions">
              <span class="bar14 ${j.q ? "" : "zero"}" style="height:${j.q ? Math.max(4, j.q / max * 100) : 0}%"></span></button>`).join("")}
          </div>
          <div class="axis14 small muted">${jours.map((j, i) => `<span>${i === 13 ? "auj." : i % 2 === 1 ? j.d.toLocaleDateString("fr-FR", { weekday: "narrow" }).toUpperCase() : ""}</span>`).join("")}</div>
          <div id="tip14" class="small muted" style="min-height:1.5em;margin-top:6px"></div>
        </div>

        <div class="card" style="margin-top:12px">
          <h3>Dernières parties</h3>
          ${parties.length ? `<table><thead><tr><th>Date</th><th>Matières</th><th class="num">Score</th></tr></thead><tbody>
            ${parties.slice(-10).reverse().map((p) => `<tr><td class="small">${esc(p.date)}</td><td class="small">${esc(p.matieres)}</td>
              <td class="num"><strong>${p.bons}/${p.total}</strong></td></tr>`).join("")}</tbody></table>`
          : `<p class="muted small">Aucune partie enregistrée.</p>`}
        </div>`;
    },

    partager: () => {
      if (!vue.invitations && !vue.chargeInv) {
        vue.chargeInv = true;
        envoyer({ action: "invitations" })
          .then((r) => { vue.invitations = r.invitations; render(); })
          .catch((e) => { vue.invitations = []; toast("❌ " + e.message, 5000); render(); });
      }
      const invs = vue.invitations;
      const etat = (i) => i.statut !== "actif" ? `<span style="color:var(--bad)">Désactivée</span>`
        : i.utilise ? `<span class="done">Active</span><div class="small muted">vue le ${esc(i.visite || i.active)}</div>`
        : `<span class="muted">Pas encore ouverte</span>`;
      const actions = (i) => [
        i.statut === "actif" && !i.utilise ? `<button class="small" data-action="copier-lien" data-lien="${esc(lienInvitation(i.code))}">📋 Lien</button>` : "",
        i.statut === "actif" ? `<button class="small" data-action="inv" data-op="revoquer" data-code="${esc(i.code)}" data-nom="${esc(i.nom)}" style="color:var(--bad)">Désactiver</button>`
          : `<button class="small" data-action="inv" data-op="reactiver" data-code="${esc(i.code)}" data-nom="${esc(i.nom)}">Réactiver</button>`,
        i.utilise ? `<button class="small" data-action="inv" data-op="liberer" data-code="${esc(i.code)}" data-nom="${esc(i.nom)}" title="Si la personne a changé de téléphone">Nouvel appareil</button>` : ""
      ].join(" ");
      const n = vue.nouveau;
      const monProfil = P.cle && !ACCES.code ? `<form data-form="mon-profil" class="card defi-card" style="margin-bottom:12px">
          <div class="defi-titre">🎮 Joue toi aussi</div>
          <p class="small" style="margin:0 0 8px">Crée ton profil joueur sur cet appareil : tu apparaîtras dans le fil et le classement, et tu pourras lancer des défis.</p>
          <label for="mon-nom" style="color:inherit">Ton prénom (visible par les autres)</label>
          <input id="mon-nom" name="nom" required maxlength="40" value="${esc(P.prenom || "")}">
          <button class="defi-btn" style="margin-top:10px">Créer mon profil</button></form>` : "";
      return `${monProfil}<form data-form="inviter" class="card">
          <h3>Inviter quelqu'un</h3>
          <p class="small muted">Chaque invitation crée un lien personnel qui ne fonctionne que sur <strong>le premier appareil</strong> qui l'ouvre. S'il est transféré à quelqu'un d'autre, il ne marchera pas. Tu peux désactiver un accès à tout moment.</p>
          <label>Prénom de la personne</label><input name="nom" required maxlength="40" placeholder="Ex : Lucas">
          <button class="btn-primary btn-big" style="margin-top:12px">Créer le lien d'invitation</button></form>
        ${n ? `<div class="card stack" style="margin-top:12px">
          <strong>✅ Lien pour ${esc(n.nom)}</strong>
          <input readonly value="${esc(lienInvitation(n.code))}">
          <div class="row"><button class="btn-primary" data-action="copier-lien" data-lien="${esc(lienInvitation(n.code))}">📋 Copier le lien</button>
          ${navigator.share ? `<button data-action="envoyer-lien" data-lien="${esc(lienInvitation(n.code))}">📤 Envoyer…</button>` : ""}</div>
          <p class="hint">Envoie-le uniquement à ${esc(n.nom)}. Ne l'ouvre pas toi-même : il serait lié à ton appareil.</p></div>` : ""}
        <div class="card" style="margin-top:12px"><h3>Invitations</h3>
          ${!invs ? `<p class="muted">Chargement…</p>` : !invs.length ? `<p class="muted">Aucune invitation pour l'instant.</p>`
          : `<table><thead><tr><th>Personne</th><th>État</th><th></th></tr></thead><tbody>
            ${invs.slice().reverse().map((i) => `<tr><td><strong>${esc(i.nom)}</strong><div class="small muted">créée le ${esc(i.cree)}${P.cle && i.par ? ` · par ${esc(i.par)}` : ""}</div></td><td>${etat(i)}</td><td class="num">${actions(i)}</td></tr>`).join("")}
            </tbody></table>`}
        </div>`;
    },

    reglages: () => !estParent() ? PARENT.reglagesEleve() : `<div class="card">
        <h3>Google Sheet</h3>
        <p class="small muted">${D.quiz.length} questions · ${D.fiches.length} fiches · ${D.frise.length} dates. Chargé ${D.charge ? "le " + D.charge.toLocaleString("fr-FR") : "—"}${D.horsLigne ? " (copie hors ligne)" : ""}.</p>
        <div class="row"><a class="btn" href="https://docs.google.com/spreadsheets/d/${esc(CONFIG.sheetId)}/edit" target="_blank" rel="noopener">Ouvrir le Sheet ↗</a>
        <button data-action="recharger">🔄 Recharger les données</button></div>
      </div>
      <form data-form="script" class="card" style="margin-top:12px">
        <h3>Script Google</h3>
        <p class="small muted">Nécessaire pour ajouter des questions depuis l'app et pour le partage sur invitation. Installation : voir le fichier README (5 minutes, une seule fois).</p>
        <label>URL du script (finit par /exec)</label><input name="url" value="${esc(scriptUrl())}" placeholder="https://script.google.com/macros/s/…/exec">
        <label>Clé secrète (celle écrite dans le script)</label><input name="cle" value="${esc(P.cle)}" autocomplete="off">
        <div class="row" style="margin-top:12px"><button class="btn-primary">Enregistrer et tester</button></div>
      </form>
      ${PARENT.reglagesEleve()}`,

    // Réglages visibles par tout le monde (y compris les invités).
    reglagesEleve: () => `<form data-form="reglages" class="card" style="margin-top:12px">
        <h3>Élève</h3>
        <label>Prénom</label><input name="prenom" value="${esc(P.prenom)}" maxlength="30">
        <label>Code de verrouillage (facultatif, protège cet espace)</label><input name="pin" value="${esc(P.pin)}" inputmode="numeric" maxlength="8" autocomplete="off">
        <button class="btn-primary" style="margin-top:12px">Enregistrer</button>
      </form>
      <div class="card" style="margin-top:12px">
        <h3>Progression</h3>
        <p class="small muted">La progression est enregistrée dans ce navigateur. Exportez-la pour la transférer sur un autre appareil.</p>
        <div class="row"><button data-action="exporter">⬇️ Exporter</button>
        <label class="btn" style="margin:0;font-weight:400">⬆️ Importer<input type="file" accept="application/json" data-action="importer" hidden></label>
        <button data-action="reset" style="color:var(--bad)">Remettre à zéro</button></div>
      </div>`
  };

  // ───────────────────────── Logique du quiz ─────────────────────────
  // Fiche la plus pertinente : même matière et même thème, puis celle qui partage le plus
  // de mots-clés et d'années avec la question et sa réponse.
  function ficheDe(q) {
    const candidates = D.fiches.filter((f) => f.matiere === q.matiere && f.theme && q.theme && norm(f.theme) === norm(q.theme));
    if (candidates.length < 2) return candidates[0] || null;
    const mots = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
    const cible = mots(q.question + " " + q.bonne + " " + (q.e ? q.e.evenement + " " + q.e.annee : ""));
    let best = candidates[0], bestScore = -1;
    candidates.forEach((f) => {
      const m = mots(f.titre + " " + f.points.join(" "));
      let score = 0;
      cible.forEach((w) => { if (m.has(w)) score += /^\d{4}$/.test(w) ? 3 : 1; });
      // Année de la question comprise dans une période du titre, ex. « (1939-1945) »
      const an = q.e ? q.e.annee : parseInt((String(q.question + " " + q.bonne).match(/\b(1\d{3}|20\d{2})\b/) || [])[1], 10);
      const per = f.titre.match(/(\d{4})\s*-\s*(\d{4})/);
      if (an && per && an >= +per[1] && an <= +per[2]) score += 4;
      if (score > bestScore) { best = f; bestScore = score; }
    });
    return best;
  }
  function lancerQuiz(poolId) {
    let pool;
    if (poolId === "#erreurs") pool = toutesQuestions().filter((q) => P.erreurs[q.id]);
    else if (poolId === "#frise") pool = questionsFrise();
    else if (poolId === "*") pool = D.quiz;
    else if (poolId === "#selection") pool = [...selection()].flatMap(poolDe);
    else pool = D.quiz.filter((q) => q.matiere === poolId);
    if (!pool.length) { toast("Pas encore de questions ici."); return; }
    const n = poolId === "#erreurs" ? Math.min(pool.length, 10) : (vue.n || P.dernierN || 10);
    const groupes = poolId === "#selection" ? [...selection()].map(poolDe) : [pool];
    const t = poolId === "#erreurs" ? { questions: shuffle(pool).slice(0, n).map(preparer), cycle: false } : tirer(groupes, Math.min(n, pool.length));
    quiz = { poolId, questions: t.questions, cycle: t.cycle, i: 0, bons: 0, combo: 0, xp: 0, erreurs: 0, repondu: null, xpDebut: P.xp };
    aller("quiz");
    afficherRegles();
  }
  function repondre(i) {
    if (quiz.repondu != null) return;
    enregistrerReponse(quiz.questions[quiz.i].choix[i]);
  }
  // ───── Anti-triche : quitter l'app pendant une question = réponse comptée fausse ─────
  const TRICHE = "\u0000triche"; // « réponse » enregistrée quand l'élève a quitté l'app
  const MESSAGES_TRICHE = [
    "Révise au lieu de tricher ! 😉",
    "Au brevet, pas de Google… Entraîne-toi sans ! 📵",
    "La meilleure antisèche, c'est ta mémoire 🧠",
    "Tricher, c'est se mentir à soi-même. Allez, on révise ! 💪"
  ];
  let sortieDepuis = 0;     // moment où l'app a été quittée pendant une question
  let ignorerSortie = false; // pendant nos propres boîtes de dialogue (ex. « Quitter le quiz ? »)
  function debutSortie() {
    if (vue.nom === "quiz" && quiz && quiz.repondu == null && !ignorerSortie && !sortieDepuis) sortieDepuis = Date.now();
  }
  function finSortie() {
    if (!sortieDepuis) return;
    const duree = Date.now() - sortieDepuis;
    sortieDepuis = 0;
    // Tolérance de 1,5 s (clic hors de la page, petite fenêtre système…)
    if (duree < 1500 || vue.nom !== "quiz" || !quiz || quiz.repondu != null) return;
    const m = document.getElementById("modal");
    // Joker : 1re sortie de la partie (appel, notification…) = question remplacée, sans pénalité.
    // Pas de joker en défi : les deux joueurs doivent avoir exactement les mêmes questions.
    if (!quiz.defi && !quiz.jokerUtilise) {
      quiz.jokerUtilise = true;
      if (!remplacerQuestion()) return;
      render();
      m.innerHTML = `<div class="sheet stack center" role="alertdialog" aria-label="Question remplacée">
        <div style="font-size:3rem">📞</div>
        <h2 style="margin:0">Tu as quitté l'app pendant la question</h2>
        <p style="margin:0">Pas de pénalité cette fois (un appel, ça arrive !) : la question a été <strong>remplacée</strong> par une autre.</p>
        <p class="warn" style="margin:0">⚠️ Si tu quittes encore l'app pendant cette partie, la question sera comptée fausse.</p>
        <button class="btn-primary btn-big" data-action="fermer">OK, je reste</button></div>`;
      m.hidden = false;
      return;
    }
    quiz.triches = (quiz.triches || 0) + 1;
    P.triches = (P.triches || 0) + 1;
    enregistrerReponse(TRICHE);
    m.innerHTML = `<div class="sheet stack center" role="alertdialog" aria-label="Sortie de l'app détectée">
      <div style="font-size:3rem">🚫</div>
      <h2 style="margin:0">Tu as quitté l'app pendant la question</h2>
      <p style="margin:0">Elle est comptée <strong>fausse</strong>.</p>
      <p class="defi-titre" style="color:var(--primary);margin:4px 0">${MESSAGES_TRICHE[(P.triches - 1) % MESSAGES_TRICHE.length]}</p>
      <button class="btn-primary btn-big" data-action="fermer">J'ai compris</button></div>`;
    m.hidden = false;
  }
  // Avertissement au lancement d'une partie (toujours en défi, sinon tant que « Ne plus afficher » n'est pas coché).
  function afficherRegles() {
    if (!quiz || (P.reglesMasquees && !quiz.defi)) return;
    const m = document.getElementById("modal");
    m.innerHTML = `<div class="sheet stack" role="alertdialog" aria-label="Règle anti-triche">
      <div class="center" style="font-size:3rem">📵</div>
      <h2 class="center" style="margin:0">Reste dans l'app pendant la partie</h2>
      <p style="margin:0">Si tu quittes l'app pendant une question (autre appli, Google, messages…) :</p>
      <ul class="fiche-points" style="margin:0">
        ${quiz.defi
          ? `<li>🚫 <strong>En défi, la question est comptée fausse</strong> dès la première sortie.</li>`
          : `<li>📞 <strong>1re fois</strong> : la question est remplacée par une autre, sans pénalité (un appel, ça arrive).</li>
             <li>🚫 <strong>Ensuite</strong> : la question est comptée fausse et part dans « Mes erreurs ».</li>`}
        <li>Une fois ta réponse donnée, tu peux sortir sans risque.</li>
      </ul>
      <p class="small muted center" style="margin:0">Au brevet, pas de téléphone : entraîne-toi dans les mêmes conditions 💪</p>
      ${quiz.defi ? "" : `<label class="ami-choix" style="border:0;justify-content:center"><input type="checkbox" id="regles-masquer"> Ne plus afficher ce message</label>`}
      <button class="btn-primary btn-big" data-action="regles-ok">C'est parti !</button></div>`;
    m.hidden = false;
  }
  // Remplace la question en cours par une autre de la même matière, jamais vue de préférence.
  // La question abandonnée est marquée vue : elle ne revient pas tout de suite.
  function remplacerQuestion() {
    const q = quiz.questions[quiz.i];
    P.vues[q.id] = 1; save();
    const deja = new Set(quiz.questions.map((x) => x.id));
    const pool = q.type ? questionsFrise() : D.quiz.filter((x) => x.matiere === q.matiere);
    const candidats = shuffle(pool.filter((x) => !deja.has(x.id)));
    const nouvelle = candidats.find((x) => !P.vues[x.id]) || candidats[0];
    if (nouvelle) { quiz.questions[quiz.i] = preparer(nouvelle); return true; }
    // Plus aucune question disponible : on retire simplement celle-ci de la partie.
    quiz.questions.splice(quiz.i, 1);
    if (!quiz.questions.length) { aller("accueil"); toast("Partie annulée : plus de questions disponibles"); return false; }
    if (quiz.i >= quiz.questions.length) { terminerQuiz(); return false; }
    return true;
  }
  document.addEventListener("visibilitychange", () => (document.hidden ? debutSortie() : finSortie()));
  window.addEventListener("blur", debutSortie);
  window.addEventListener("focus", finSortie);

  function enregistrerReponse(choix) {
    const q = quiz.questions[quiz.i];
    quiz.repondu = choix;
    const ok = choix === q.bonne;
    const m = q.type ? "Dates (frise)" : q.matiere;
    P.vues[q.id] = 1;
    P.repondues++;
    P.stats[m] = P.stats[m] || { ok: 0, total: 0 };
    P.stats[m].total++;
    P.matieresJouees = Object.assign({}, P.matieresJouees, { [q.matiere]: 1 });
    if (ok) {
      quiz.bons++; quiz.combo++;
      P.stats[m].ok++;
      const gain = 10 + Math.min(10, 2 * (quiz.combo - 1));
      quiz.dernierGain = gain; quiz.xp += gain; P.xp += gain;
      if (P.erreurs[q.id]) { delete P.erreurs[q.id]; P.rattrapees = (P.rattrapees || 0) + 1; }
      if (quiz.combo >= 5) gagner("combo5");
      if (quiz.combo >= 10) gagner("combo10");
    } else {
      quiz.combo = 0; quiz.erreurs++;
      P.erreurs[q.id] = 1;
    }
    save();
    render();
  }
  function terminerQuiz() {
    const avant = niveau(quiz.xpDebut).n;
    const total = quiz.questions.length;
    if (quiz.bons === total && total >= 5) { quiz.xp += 30; P.xp += 30; }
    P.quizFaits++;
    // Série de jours
    const j = today();
    if (P.serie.dernier !== j) {
      const hier = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      P.serie = { dernier: j, jours: P.serie.dernier === hier ? P.serie.jours + 1 : 1 };
    }
    gagner("premier");
    if (quiz.bons === total && total >= 10) gagner("parfait");
    if (quiz.poolId === "#frise" && quiz.bons === total && total >= 5) gagner("dates");
    if (P.repondues >= 50) gagner("q50");
    if (P.repondues >= 200) gagner("q200");
    if (Object.keys(P.matieresJouees || {}).length >= 5) gagner("toutes");
    if (P.serie.jours >= 3) gagner("jours3");
    if (P.serie.jours >= 7) gagner("jours7");
    if ((P.rattrapees || 0) >= 10) gagner("rattrapage");
    if (niveau(P.xp).n >= 6) gagner("niveau5");
    if (quiz.defi) {
      P.reponsesDefis = (P.reponsesDefis || []).concat({ id: quiz.defi.id, bons: quiz.bons });
      if (quiz.bons > quiz.defi.bons) gagner("defi");
    }
    P.envois = (P.envois || []).concat({
      date: horodatage(new Date()), bons: quiz.bons, total,
      matieres: [...new Set(quiz.questions.map((q) => (q.type ? "Dates" : q.matiere)))].join(", ")
    }).slice(-50);
    save();
    synchroniser().then(chargerSocial);
    quiz.resultat = { bons: quiz.bons, total, xp: quiz.xp, erreurs: quiz.erreurs, niveauUp: niveau(P.xp).n > avant, nouveauxBadges: quiz.badgesEnCours || [] };
    aller("resultat");
    if (quiz.bons === total || quiz.resultat.niveauUp) confetti(90);
  }
  function gagner(id) {
    if (P.badges[id]) return;
    P.badges[id] = today();
    const b = BADGES.find((x) => x.id === id);
    if (quiz && vue.nom === "quiz") quiz.badgesEnCours = (quiz.badgesEnCours || []).concat(b);
    toast("🏅 Badge débloqué : " + b.nom);
  }
  // Format « 13/10/2026 17:05 », le même que celui du script.
  function horodatage(d) {
    const z = (n) => String(n).padStart(2, "0");
    return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  // Envoie au script le résumé de progression et les parties en attente (invités seulement).
  // En cas d'échec (hors ligne…), les parties restent dans P.envois et repartent la fois suivante.
  let synchroEnCours = false;
  function synchroniser() {
    if (!scriptUrl() || !ACCES.code || synchroEnCours) return Promise.resolve();
    const envoyees = (P.envois || []).length;
    const stats = Object.values(P.stats || {});
    const nv = niveau(P.xp);
    synchroEnCours = true;
    return envoyer({
      action: "resultat", code: ACCES.code, appareil: ACCES.appareil, parties: (P.envois || []).slice(0, envoyees),
      resume: {
        prenom: P.prenom, xp: P.xp, niveau: nv.n + " · " + nv.nom, parties: P.quizFaits, repondues: P.repondues,
        bonnes: stats.reduce((s, x) => s + (x.ok || 0), 0), serie: serieActuelle(), erreurs: Object.keys(P.erreurs).length,
        badges: Object.keys(P.badges).length, fiches: Object.keys(P.maitrise).length, matieres: P.stats
      }
    }).then(() => { P.envois = (P.envois || []).slice(envoyees); save(); })
      .catch(() => { /* on réessaiera */ })
      .finally(() => { synchroEnCours = false; });
  }
  // ───────────────────────── Social : fil, défis, bravos, notifications ─────────────────────────
  // SOCIAL = réponse de l'action « social » du script (null tant que rien n'est chargé).
  let SOCIAL = null;
  const socialPossible = () => !!scriptUrl() && (!!ACCES.code || !!P.cle);
  const peutDefier = () => !!scriptUrl() && !!ACCES.code;
  const nonLues = () => (SOCIAL && SOCIAL.notifs ? SOCIAL.notifs.filter((n) => n.t > (P.notifsVues || 0)).length : 0);
  // Un seul chargement à la fois : un appel pendant un chargement en cours attend le même résultat.
  let socialPromesse = null;
  let socialErreur = "";
  function chargerSocial() {
    if (!socialPossible()) return Promise.resolve();
    if (!socialPromesse) socialPromesse = chargerSocialMaintenant().finally(() => { socialPromesse = null; });
    return socialPromesse;
  }
  async function chargerSocialMaintenant() {
    try {
      await envoyerReponsesDefis();
      const avant = nonLues();
      SOCIAL = await envoyer({ action: "social", code: ACCES.code || "", appareil: ACCES.appareil });
      const apres = nonLues();
      // Alerte système si une nouvelle notification arrive pendant que l'app est en arrière-plan.
      if (apres > avant && document.hidden && "Notification" in window && Notification.permission === "granted") {
        try { new Notification("BrevetQuizz", { body: texteNotif(SOCIAL.notifs[0]), icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎓</text></svg>" }); } catch (e) { /* non supporté */ }
      }
      socialErreur = "";
      majPastille();
      if (["accueil", "notifs", "profil", "resultat"].includes(vue.nom)) render();
    } catch (e) { socialErreur = e.message || "Connexion impossible"; /* on réessaiera */ }
  }
  function majPastille() {
    const p = document.getElementById("pastille");
    if (!p) return;
    const n = nonLues();
    p.textContent = n > 9 ? "9+" : String(n);
    p.hidden = !n;
  }
  // Réponses aux défis gardées si l'envoi a échoué (hors ligne) : elles repartent au prochain chargement.
  async function envoyerReponsesDefis() {
    const file = (P.reponsesDefis || []).slice();
    for (const r of file) {
      try {
        await envoyer({ action: "repondreDefi", code: ACCES.code, appareil: ACCES.appareil, id: r.id, bons: r.bons });
        P.reponsesDefis = (P.reponsesDefis || []).filter((x) => x.id !== r.id); save();
      } catch (e) { return; }
    }
  }
  function texteNotif(n) {
    if (!n) return "";
    const score = `${n.bons}/${n.total}${n.matieres ? " en " + n.matieres : ""}`;
    if (n.type === "defi") return `🔥 ${n.de} te défie : bats son ${score}`;
    if (n.type === "releve") {
      const issue = n.score > n.bons ? `${n.de} gagne` : n.score === n.bons ? "égalité" : "tu gagnes";
      return `⚔️ ${n.de} a relevé ton défi : ${n.score}/${n.total} contre ton ${n.bons}/${n.total} (${issue})`;
    }
    return `❤️ ${n.de} t'a dit bravo pour ton ${score}`;
  }
  // « 13/10/2026 17:05 » → « il y a 12 min »
  function ilya(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(s || "");
    if (!m) return s || "";
    const min = Math.round((Date.now() - new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])) / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
    const j = Math.round(min / 1440);
    return j === 1 ? "hier" : j < 7 ? `il y a ${j} jours` : `le ${m[1]}/${m[2]}`;
  }
  const avatar = (nom) => {
    const teintes = ["#D4537E", "#378ADD", "#1D9E75", "#BA7517", "#7F77DD", "#D85A30"];
    const c = teintes[parseInt(hash(nom || "?"), 36) % teintes.length];
    return `<span class="avatar" style="background:${c}">${esc((nom || "?").trim().charAt(0).toUpperCase())}</span>`;
  };
  function lancerDefi(id) {
    const d = SOCIAL && SOCIAL.recus.find((x) => x.id === id);
    if (!d) { toast("Défi introuvable"); return; }
    if (d.statut === "relevé") { toast("Tu as déjà relevé ce défi"); return; }
    const parId = new Map(toutesQuestions().map((q) => [q.id, q]));
    const questions = d.questions.map((qid) => parId.get(qid)).filter(Boolean).map(preparer);
    if (!questions.length) { toast("Les questions de ce défi n'existent plus"); return; }
    quiz = { poolId: "#defi", defi: d, questions, cycle: false, i: 0, bons: 0, combo: 0, xp: 0, erreurs: 0, repondu: null, xpDebut: P.xp };
    fermerModale();
    aller("quiz");
    afficherRegles();
  }
  async function ouvrirDefier() {
    const m = document.getElementById("modal");
    if (!SOCIAL) { // la liste des amis n'est pas encore chargée : on la charge d'abord
      m.innerHTML = `<div class="sheet center"><p class="muted">Chargement de tes amis…</p></div>`;
      m.hidden = false;
      await chargerSocial();
      if (!SOCIAL) {
        m.innerHTML = `<div class="sheet stack center"><p>Impossible de charger tes amis${socialErreur ? ` (${esc(socialErreur)})` : ""}.</p>
          <p class="small muted" style="margin:0">Vérifie ta connexion internet et réessaie.</p><button data-action="fermer">Fermer</button></div>`;
        return;
      }
    }
    const amis = SOCIAL.amis || [];
    m.innerHTML = `<form class="sheet stack" data-form="defier">
      <div class="row"><h2 style="margin:0">⚔️ Défier un ami</h2><span class="spacer"></span><button type="button" class="btn-ghost" data-action="fermer" aria-label="Fermer">✕</button></div>
      <p class="small muted" style="margin:0">Ton ami rejouera exactement les mêmes ${quiz.questions.length} questions. Il doit battre ton ${quiz.bons}/${quiz.questions.length}.</p>
      ${amis.length ? amis.map((a) => `<label class="ami-choix">${avatar(a.nom)}<span style="flex:1">${esc(a.nom)}</span><input type="checkbox" name="ami" value="${esc(a.id)}"></label>`).join("")
        : `<p class="muted">Personne d'autre n'est encore invité. Invite tes amis avec le bouton 🔗 Partager de l'accueil.</p>`}
      ${amis.length ? `<button class="btn-primary btn-big">Envoyer le défi 🔥</button>` : ""}
    </form>`;
    m.hidden = false;
  }
  async function envoyerDefi(ids) {
    const matieres = [...new Set(quiz.questions.map((q) => (q.type ? "Dates" : q.matiere)))].join(", ");
    await envoyer({ action: "defier", code: ACCES.code, appareil: ACCES.appareil, pour: ids,
      questions: quiz.questions.map((q) => q.id), matieres, bons: quiz.bons, total: quiz.questions.length });
    const noms = SOCIAL.amis.filter((a) => ids.includes(a.id)).map((a) => a.nom);
    const texte = `${P.prenom || "Un ami"} te défie sur BrevetQuizz : bats son ${quiz.bons}/${quiz.questions.length} en ${matieres} ! 🔥 ${location.origin + location.pathname}`;
    const m = document.getElementById("modal");
    m.innerHTML = `<div class="sheet stack center">
      <div style="font-size:3rem">🔥</div>
      <h2 style="margin:0">Défi envoyé à ${esc(noms.join(", "))}</h2>
      <p class="muted" style="margin:0">Le défi apparaîtra dans les notifications 🔔 à la prochaine ouverture de l'app. Pour prévenir tout de suite :</p>
      <button class="btn-primary btn-big" data-action="prevenir" data-texte="${esc(texte)}">📲 Prévenir par message</button>
      <button data-action="fermer">Fermer</button></div>`;
    m.hidden = false;
    chargerSocial();
  }

  function serieActuelle() {
    const hier = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    return P.serie.dernier === today() || P.serie.dernier === hier ? P.serie.jours : 0;
  }

  function ouvrirFiche(cle) {
    const f = D.fiches.find((x) => x.cle === cle);
    if (!f) return;
    const m = document.getElementById("modal");
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(f.titre)}">
      <div class="row"><span class="tag" style="background:${couleur(f.matiere)}22;color:${couleur(f.matiere)}">${emoji(f.matiere)} ${esc(f.matiere)}</span>
      <span class="spacer"></span><button class="btn-ghost" data-action="fermer" aria-label="Fermer">✕</button></div>
      <h2 style="margin-top:8px">${esc(f.titre)}</h2>
      ${f.theme ? `<p class="small muted">${esc(f.theme)}</p>` : ""}
      <ul class="fiche-points">${f.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      <button class="btn-big ${P.maitrise[f.cle] ? "" : "btn-primary"}" data-action="maitrise" data-cle="${f.cle}" style="margin-top:12px">
        ${P.maitrise[f.cle] ? "✓ Maîtrisée (annuler)" : "Je maîtrise cette fiche 💪"}</button></div>`;
    m.hidden = false;
  }
  function fermerModale() { const m = document.getElementById("modal"); m.hidden = true; m.innerHTML = ""; }

  // ───────────────────────── Vérification des réponses par Claude ─────────────────────────
  // Fenêtre de choix : résout la promesse avec la valeur du bouton touché (null si on ferme).
  let resoudreChoix = null;
  function choix(titre, html, boutons) {
    const m = document.getElementById("modal");
    m.innerHTML = `<div class="sheet stack" role="alertdialog" aria-label="${esc(titre)}">
      <h2 style="margin:0">${esc(titre)}</h2>${html}
      ${boutons.map(([val, lab], i) => `<button class="${i === 0 ? "btn-primary " : ""}btn-big" data-action="choix" data-val="${esc(val)}">${esc(lab)}</button>`).join("")}</div>`;
    m.hidden = false;
    return new Promise((res) => { resoudreChoix = res; });
  }
  // Ligne Quiz corrigée : si la vraie réponse est l'un des pièges, on les échange ; sinon elle remplace la bonne réponse.
  function corrigerLigne(l, correction) {
    const n = l.slice();
    const k = [4, 5, 6].find((j) => norm(n[j]) === norm(correction));
    if (k) { const t = n[3]; n[3] = n[k]; n[k] = t; } else n[3] = correction;
    return n;
  }
  // Fait vérifier par Claude (via le script) que chaque bonne réponse est juste.
  // Renvoie les lignes à ajouter (éventuellement corrigées), ou null si l'ajout est annulé.
  async function verifierAvantAjout(lignes) {
    if (!scriptUrl() || !P.cle) return lignes;
    const m = document.getElementById("modal");
    m.innerHTML = `<div class="sheet stack center"><div style="font-size:2.5rem">🔍</div>
      <h2 style="margin:0">Vérification en cours…</h2>
      <p class="muted" style="margin:0">Claude vérifie que ${lignes.length > 1 ? `les ${lignes.length} bonnes réponses sont` : "la bonne réponse est"} vraiment justes. Ça prend quelques secondes.</p></div>`;
    m.hidden = false;
    let res;
    try {
      res = (await envoyer({ action: "verifier", questions: lignes.map((l) => ({ matiere: l[0], question: l[2], bonne: l[3], pieges: [l[4], l[5], l[6]], explication: l[7] })) })).resultats;
    } catch (e) {
      const c = await choix("⚠️ Vérification impossible", `<p class="muted" style="margin:0">${esc(e.message)}</p>`, [["ajouter", "Ajouter sans vérifier"], ["annuler", "Annuler"]]);
      fermerModale();
      return c === "ajouter" ? lignes : null;
    }
    const problemes = res.map((r, i) => ({ r, i })).filter((x) => x.r.verdict !== "ok");
    if (!problemes.length) { fermerModale(); toast(lignes.length > 1 ? `✅ ${lignes.length} réponses vérifiées` : "✅ Réponse vérifiée"); return lignes; }
    let c;
    if (lignes.length === 1) {
      const r = res[0];
      const titre = { erreur: "⚠️ La bonne réponse semble fausse", ambigu: "⚠️ Plusieurs réponses semblent justes" }[r.verdict] || "⚠️ Vérification impossible";
      c = await choix(titre,
        `${r.verdict === "erreur" && r.correction ? `<p style="margin:0">Réponse juste selon Claude : <strong>${esc(r.correction)}</strong></p>` : ""}
         ${r.commentaire ? `<p class="muted" style="margin:0">${esc(r.commentaire)}</p>` : ""}`,
        (r.verdict === "erreur" && r.correction ? [["corriger", `Corriger avec « ${r.correction} »`]] : [])
          .concat([["modifier", "Modifier la question"], ["ajouter", "Ajouter quand même"]]));
      fermerModale();
      if (c === "corriger") { toast("✅ Réponse corrigée"); return [corrigerLigne(lignes[0], r.correction)]; }
      return c === "ajouter" ? lignes : null;
    }
    c = await choix(`⚠️ ${problemes.length} question${problemes.length > 1 ? "s" : ""} à revoir sur ${lignes.length}`,
      `<ul class="fiche-points" style="margin:0">${problemes.map(({ r, i }) => `<li><strong>${esc(lignes[i][2])}</strong><br>
        <span class="small">${r.verdict === "erreur" && r.correction ? `Réponse juste : « ${esc(r.correction)} ». ` : r.verdict === "ambigu" ? "Plusieurs réponses semblent justes. " : ""}${esc(r.commentaire)}</span></li>`).join("")}</ul>`,
      [["corriger", "Corriger ce qui peut l'être et ajouter"], ["sures", "Ajouter seulement les questions vérifiées"], ["tout", "Tout ajouter quand même"], ["annuler", "Annuler"]]);
    fermerModale();
    if (c === "tout") return lignes;
    if (c === "sures") return lignes.filter((_, i) => res[i].verdict === "ok");
    if (c === "corriger") return lignes.map((l, i) => (res[i].verdict === "ok" ? l : res[i].verdict === "erreur" && res[i].correction ? corrigerLigne(l, res[i].correction) : null)).filter(Boolean);
    return null;
  }

  // ───────────────────────── Ajouts (parent) ─────────────────────────
  function lireMatiere(fd) { return fd.get("matiere") === "__autre" ? String(fd.get("autre") || "").trim() : fd.get("matiere"); }

  async function ajouterLignes(onglet, lignesAAjouter, apresOk) {
    if (!scriptUrl()) {
      const tsv = lignesAAjouter.map((l) => l.map((c) => String(c).replace(/[\t\n]+/g, " ")).join("\t")).join("\n");
      try { await navigator.clipboard.writeText(tsv); } catch (e) { /* refusé */ }
      const m = document.getElementById("modal");
      m.innerHTML = `<div class="sheet stack"><h2>Ligne prête à coller</h2>
        <p>Ouvrez l'onglet <strong>${onglet}</strong> du Google Sheet, cliquez sur la première cellule vide de la colonne A, puis collez (Ctrl/Cmd + V).</p>
        <textarea readonly style="min-height:120px">${esc(tsv)}</textarea>
        <div class="row"><a class="btn btn-primary" href="https://docs.google.com/spreadsheets/d/${esc(CONFIG.sheetId)}/edit" target="_blank" rel="noopener">Ouvrir le Sheet ↗</a>
        <button data-action="fermer">Fermer</button></div></div>`;
      m.hidden = false;
      return;
    }
    try {
      toast("Envoi au Google Sheet…", 10000);
      const r = await envoyer({ action: "ajouter", onglet, lignes: lignesAAjouter });
      toast("✅ " + plural(r.ajoutees, "ligne ajoutée", "lignes ajoutées") + " au Sheet");
      if (apresOk) apresOk();
      setTimeout(() => chargerDonnees().then(render).catch(() => {}), 1500);
    } catch (e) { toast("❌ " + e.message, 5000); }
  }
  function parserCollage(texte, nbCol) {
    return texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      let cells = l.includes("\t") ? l.split("\t") : l.includes("|") ? l.split("|") : l.split(";");
      cells = cells.map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
      if (l.startsWith("|")) cells = cells.slice(1, -1);
      return cells.slice(0, nbCol);
    }).filter((c) => !/^(matiere|theme)$/.test(norm(c[0])) && !/^-+$/.test((c[0] || "").replace(/[:\s]/g, "")));
  }

  // ───────────────────────── Événements ─────────────────────────
  document.addEventListener("click", (ev) => {
    if (ev.target.id === "modal") { fermerModale(); if (resoudreChoix) { const r = resoudreChoix; resoudreChoix = null; r(null); } return; }
    const el = ev.target.closest("[data-go],[data-action]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    if (el.dataset.go) {
      const p = {};
      if (el.dataset.matiere !== undefined) p.matiere = el.dataset.matiere;
      if (el.dataset.theme !== undefined) p.theme = el.dataset.theme;
      if (el.dataset.go === "parent" && vue.nom === "parent") p.ok = vue.ok;
      aller(el.dataset.go, p);
      return;
    }
    const a = el.dataset.action;
    if (a === "nbq") { P.dernierN = +el.dataset.n; save(); vue.n = +el.dataset.n; render(); }
    else if (a === "quiz") { fermerModale(); vue.n = vue.n || P.dernierN; lancerQuiz(el.dataset.pool); }
    else if (a === "erreurs") lancerQuiz("#erreurs");
    else if (a === "toggle-mat") {
      const id = el.dataset.mat;
      if (!poolDe(id).length) { toast(`Pas encore de questions en ${id} : ajoute-en dans 📊 Statistiques > Ajouter.`, 4000); return; }
      const s = selection();
      s.has(id) ? s.delete(id) : s.add(id);
      P.selection = [...s]; save(); render();
    }
    else if (a === "sel-tout") { P.selection = matieres().filter((m) => poolDe(m).length).concat(D.frise.length ? ["#frise"] : []); save(); render(); }
    else if (a === "sel-rien") { P.selection = []; save(); render(); }
    else if (a === "go-partie") lancerQuiz("#selection");
    else if (a === "repondre") repondre(+el.dataset.i);
    else if (a === "suivante") { if (quiz.i + 1 < quiz.questions.length) { quiz.i++; quiz.repondu = null; render(); window.scrollTo(0, 0); } else terminerQuiz(); }
    else if (a === "quitter") { ignorerSortie = true; const oui = confirm("Quitter le quiz ? Tes réponses déjà données sont gardées."); ignorerSortie = false; if (oui) aller("accueil"); }
    else if (a === "rejouer") lancerQuiz(quiz.poolId === "#defi" || (quiz.poolId === "#erreurs" && !Object.keys(P.erreurs).length) ? "#selection" : quiz.poolId);
    else if (a === "voir-fiche") ouvrirFiche(el.dataset.cle);
    else if (a === "fermer") fermerModale();
    else if (a === "maitrise") {
      const c = el.dataset.cle;
      if (P.maitrise[c]) delete P.maitrise[c]; else { P.maitrise[c] = 1; toast("💪 Fiche maîtrisée !"); }
      if (Object.keys(P.maitrise).length >= 5) gagner("fiches5");
      save(); ouvrirFiche(c); if (vue.nom === "fiches") render();
    }
    else if (a === "onglet") aller("parent", { ok: true, onglet: el.dataset.onglet });
    else if (a === "type") aller("parent", { ok: true, onglet: "ajouter", type: el.dataset.type, mat: vue.mat });
    else if (a === "recharger") {
      const depuisParent = vue.nom === "parent";
      demarrer(() => { toast("Données rechargées ✅"); aller(depuisParent ? "parent" : "accueil", { ok: true, onglet: "reglages" }); });
    }
    else if (a === "choix") { const r = resoudreChoix; resoudreChoix = null; if (r) r(el.dataset.val); }
    else if (a === "regles-ok") {
      const c = document.getElementById("regles-masquer");
      if (c && c.checked) { P.reglesMasquees = true; save(); }
      fermerModale();
    }
    else if (a === "relever") lancerDefi(el.dataset.defi);
    else if (a === "defier") ouvrirDefier();
    else if (a === "bravo") {
      const x = SOCIAL && SOCIAL.fil.find((p) => p.id === el.dataset.partie);
      if (!x || x.jaiDitBravo) return;
      x.jaiDitBravo = true; x.bravos++; render(); // affichage immédiat, envoi ensuite
      envoyer({ action: "bravo", code: ACCES.code, appareil: ACCES.appareil, partie: x.id })
        .catch(() => { x.jaiDitBravo = false; x.bravos--; render(); toast("Bravo non envoyé, réessaie plus tard"); });
    }
    else if (a === "prevenir") {
      const texte = el.dataset.texte;
      if (navigator.share) navigator.share({ text: texte }).catch(() => {});
      else navigator.clipboard.writeText(texte).then(() => toast("📋 Message copié : colle-le dans WhatsApp ou par SMS"), () => toast(texte, 8000));
    }
    else if (a === "alertes") {
      Notification.requestPermission().then((p) => { toast(p === "granted" ? "🔔 Alertes activées" : "Alertes refusées"); render(); });
    }
    else if (a === "voir-eleve") { vue.eleve = el.dataset.code; render(); }
    else if (a === "maj-resultats") { vue.resultats = null; vue.chargeRes = false; render(); }
    else if (a === "tip14") afficherTip14(el);
    else if (a === "copier-lien") {
      navigator.clipboard.writeText(el.dataset.lien).then(() => toast("📋 Lien copié"), () => toast("Copie impossible : sélectionnez le lien à la main"));
    }
    else if (a === "envoyer-lien") {
      navigator.share({ title: "BrevetQuizz", text: "Ton accès personnel à BrevetQuizz pour réviser le brevet :", url: el.dataset.lien }).catch(() => {});
    }
    else if (a === "inv") {
      const op = el.dataset.op, nom = el.dataset.nom;
      const q = { revoquer: `Désactiver l'accès de ${nom} ? L'app ne s'ouvrira plus sur son appareil.`,
        liberer: `${nom} a changé d'appareil ? Son lien pourra être utilisé une fois sur un nouvel appareil (l'ancien perd l'accès).` }[op];
      if (q && !confirm(q)) return;
      el.disabled = true;
      envoyer({ action: op, cible: el.dataset.code })
        .then(() => { toast("✅ C'est fait"); aller("parent", { ok: true, onglet: "partager" }); })
        .catch((e) => { toast("❌ " + e.message, 5000); el.disabled = false; });
    }
    else if (a === "exporter") {
      const blob = new Blob([JSON.stringify(P, null, 1)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob); link.download = "brevetquizz-progression-" + today() + ".json"; link.click();
    }
    else if (a === "reset") {
      if (confirm("Effacer toute la progression (XP, badges, questions vues, erreurs) ?")) {
        P = Object.assign({}, DEFAUT, { prenom: P.prenom, pin: P.pin, scriptUrl: P.scriptUrl, cle: P.cle, packInstalle: P.packInstalle });
        save(); toast("Progression remise à zéro"); render();
      }
    }
    else if (a === "pack") {
      if (!confirm("Installer le pack dans le Google Sheet ? Les questions existantes listées dans le pack auront de nouvelles mauvaises réponses ; tout le reste est ajouté.")) return;
      el.disabled = true; el.textContent = "Installation… (jusqu'à 1 minute)";
      envoyer({ action: "pack", pack: window.BQ_PACK }).then((r) => {
        P.packInstalle = true; save();
        toast(`✅ ${r.modifiees} questions améliorées, ${r.ajoutees} ajoutées, ${r.points} points de fiches`, 6000);
        return chargerDonnees().then(render);
      }).catch((e) => { toast("❌ " + e.message, 6000); render(); });
    }
  });

  // Graphique d'activité : la valeur du jour s'affiche au survol, au focus clavier ou au toucher.
  function afficherTip14(col) {
    const t = document.getElementById("tip14");
    if (!t) return;
    t.textContent = col.dataset.tip;
    document.querySelectorAll(".col14.on").forEach((c) => c.classList.remove("on"));
    col.classList.add("on");
  }
  ["mouseover", "focusin"].forEach((type) => document.addEventListener(type, (ev) => {
    const col = ev.target.closest && ev.target.closest(".col14");
    if (col) afficherTip14(col);
  }));

  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.dataset.action === "mat-change") {
      const autre = el.form.querySelector("[name=autre]");
      autre.hidden = el.value !== "__autre";
      autre.required = el.value === "__autre";
      vue.mat = el.value === "__autre" ? vue.mat : el.value;
      const themes = [...new Set(D.quiz.filter((q) => q.matiere === el.value).map((q) => q.theme).concat(D.fiches.filter((f) => f.matiere === el.value).map((f) => f.theme)))].filter(Boolean);
      el.form.querySelector("#themes").innerHTML = themes.map((t) => `<option value="${esc(t)}">`).join("");
    }
    if (el.dataset.action === "importer" && el.files[0]) {
      el.files[0].text().then((t) => {
        const data = JSON.parse(t);
        if (typeof data.xp !== "number") throw new Error();
        P = Object.assign({}, DEFAUT, data); save(); toast("Progression importée ✅"); render();
      }).catch(() => toast("Fichier invalide"));
    }
  });

  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset.action === "qual") {
      const f = el.form;
      const w = qualite(f.bonne.value, [f.p1.value, f.p2.value, f.p3.value]);
      const rempli = f.bonne.value && f.p1.value && f.p2.value && f.p3.value;
      document.getElementById("qual").innerHTML = rempli ? (w.length ? w.map((x) => `<div class="warn">⚠️ ${esc(x)}</div>`).join("") : `<div class="ok">👍 Les réponses se ressemblent bien.</div>`) : "";
    }
    if (el.name === "lignes") {
      const nb = { Quiz: 8, Fiches: 4, Frise: 3 }[el.form.onglet.value];
      const ls = parserCollage(el.value, nb);
      const pb = el.form.onglet.value === "Quiz" ? ls.filter((l) => qualite(l[3], [l[4], l[5], l[6]]).length).length : 0;
      const incompletes = ls.filter((l) => l.length < (nb === 8 ? 7 : nb)).length;
      document.getElementById("apercu").innerHTML = ls.length ? `<div class="ok">${plural(ls.length, "ligne détectée", "lignes détectées")}</div>` +
        (incompletes ? `<div class="warn">${incompletes} ligne(s) avec des colonnes manquantes.</div>` : "") +
        (pb ? `<div class="warn">${pb} question(s) avec des réponses trop faciles à éliminer (voir 🔎 Qualité après l'ajout).</div>` : "") : "";
    }
  });

  document.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target, fd = new FormData(f), type = f.dataset.form;
    if (type === "prenom") { P.prenom = String(fd.get("prenom")).trim(); save(); aller("accueil"); }
    else if (type === "pin") {
      if (fd.get("pin") === P.pin) aller("parent", { ok: true }); else { toast("Code incorrect"); }
    }
    else if (type === "defier") {
      const ids = fd.getAll("ami").map(String);
      if (!ids.length) { toast("Choisis au moins un ami"); return; }
      const btn = f.querySelector("button.btn-primary"); btn.disabled = true; btn.textContent = "Envoi…";
      try { await envoyerDefi(ids); }
      catch (e) { toast("❌ " + e.message, 5000); btn.disabled = false; btn.textContent = "Envoyer le défi 🔥"; }
    }
    else if (type === "cle-parent") {
      P.cle = String(fd.get("cle")).trim(); save();
      demarrer();
    }
    else if (type === "mon-profil") {
      // Crée une invitation pour soi et l'active tout de suite sur cet appareil.
      const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Création…";
      try {
        const r = await envoyer({ action: "creerInvitation", nom: fd.get("nom") });
        ACCES.code = r.code; sauverAcces();
        P.prenom = String(fd.get("nom")).trim() || P.prenom; save();
        demarrer(() => { toast("🎮 Profil joueur créé : tu peux défier tes amis !"); aller("accueil"); });
      } catch (e) { toast("❌ " + e.message, 5000); btn.disabled = false; btn.textContent = "Créer mon profil"; }
    }
    else if (type === "inviter") {
      const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Création…";
      try {
        const r = await envoyer({ action: "creerInvitation", nom: fd.get("nom") });
        aller("parent", { ok: true, onglet: "partager", nouveau: r });
      } catch (e) { toast("❌ " + e.message, 5000); btn.disabled = false; btn.textContent = "Créer le lien d'invitation"; }
    }
    else if (type === "reglages") {
      P.prenom = String(fd.get("prenom")).trim() || P.prenom; P.pin = String(fd.get("pin")).trim(); save(); toast("Enregistré ✅");
    }
    else if (type === "script") {
      P.scriptUrl = String(fd.get("url")).trim(); P.cle = String(fd.get("cle")).trim(); save();
      if (!P.scriptUrl) { toast("URL effacée"); render(); return; }
      try { const r = await envoyer({ action: "test" }); toast("✅ " + r.message); }
      catch (e) { toast("❌ " + (e.message === "Failed to fetch" ? "Script injoignable : vérifiez l'URL et que l'accès est « Tout le monde »." : e.message), 6000); }
      render();
    }
    else if (type === "question") {
      const mat = lireMatiere(fd);
      const pieges = [fd.get("p1"), fd.get("p2"), fd.get("p3")];
      const w = qualite(fd.get("bonne"), pieges);
      if (w.length && !confirm("Attention :\n- " + w.join("\n- ") + "\n\nAjouter quand même ?")) return;
      vue.mat = mat;
      const verifiees = await verifierAvantAjout([[mat, fd.get("theme"), fd.get("question"), fd.get("bonne"), pieges[0], pieges[1], pieges[2], fd.get("explication")]]);
      if (!verifiees || !verifiees.length) return;
      await ajouterLignes("Quiz", verifiees, () => {
        ["question", "bonne", "p1", "p2", "p3", "explication"].forEach((n) => { f[n].value = ""; });
        document.getElementById("qual").innerHTML = "";
      });
    }
    else if (type === "fiche") {
      const mat = lireMatiere(fd);
      const points = String(fd.get("points")).split(/\n+/).map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
      vue.mat = mat;
      await ajouterLignes("Fiches", points.map((p) => [mat, fd.get("theme"), fd.get("fiche"), p]), () => { f.points.value = ""; });
    }
    else if (type === "date") {
      await ajouterLignes("Frise", [[fd.get("theme"), fd.get("annee"), fd.get("evenement")]], () => { f.annee.value = ""; f.evenement.value = ""; });
    }
    else if (type === "coller") {
      const onglet = fd.get("onglet");
      const ls = parserCollage(String(fd.get("lignes")), { Quiz: 8, Fiches: 4, Frise: 3 }[onglet]);
      if (!ls.length) { toast("Aucune ligne détectée"); return; }
      const aAjouter = onglet === "Quiz" ? await verifierAvantAjout(ls) : ls;
      if (!aAjouter || !aAjouter.length) return;
      await ajouterLignes(onglet, aAjouter, () => { f.lignes.value = ""; document.getElementById("apercu").innerHTML = ""; });
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") fermerModale();
    if (vue.nom === "quiz" && quiz) {
      const k = "abcd1234".indexOf(ev.key.toLowerCase());
      if (k >= 0 && quiz.repondu == null && !ev.target.closest("input,textarea")) repondre(k % 4);
      if (ev.key === "Enter" && quiz.repondu != null) document.querySelector("[data-action=suivante]")?.click();
    }
  });

  // ───────────────────────── Démarrage ─────────────────────────
  // Mise à jour automatique : GitHub Pages (et l'app ajoutée à l'écran d'accueil) peuvent garder l'ancienne
  // page en cache. On relit index.html sans cache ; si la version des fichiers a changé, on recharge une fois.
  function verifierMiseAJour() {
    const actuelle = ((document.querySelector('script[src*="js/app.js"]') || {}).src || "").split("v=")[1];
    if (!actuelle) return; // pas de numéro de version (test en local)
    fetch(location.pathname + "?maj=" + Date.now(), { cache: "no-store" })
      .then((r) => r.text())
      .then((html) => {
        const enLigne = (html.match(/js\/app\.js\?v=([a-z0-9]+)/) || [])[1];
        if (!enLigne || enLigne === actuelle) return;
        let deja = "";
        try { deja = sessionStorage.getItem("bq_maj") || ""; sessionStorage.setItem("bq_maj", enLigne); } catch (e) { /* rien */ }
        if (deja !== enLigne && vue.nom !== "quiz") location.reload();
      })
      .catch(() => { /* hors ligne */ });
  }
  verifierMiseAJour();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) verifierMiseAJour(); });

  demarrer();
  // Fil et notifications rafraîchis toutes les 2 minutes (jamais pendant une partie) et au retour dans l'app.
  setInterval(() => { if (!document.hidden && vue.nom !== "quiz") chargerSocial(); }, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && vue.nom !== "quiz") chargerSocial(); });
})();
