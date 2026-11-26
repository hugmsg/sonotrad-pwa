/* ═══════════════════════════════════════════════════════════════════════════
   LV / CMR depuis Production (2026-11-24, demande de Hugo)
   - Action groupée « Créer la LV… » dans la barre de sélection : mêmes règles que Départs LOXAM
     (même destination, modules non partis et sans LV), formulaire LV pré-rempli, retour au Planning.
   - Vue « LV / CMR » (en haut à droite, à côté d'Expéditions) : historique des LV avec leurs modules
     (col V du Planning), PDF, statut, « Modifier » (même numéro, tant que rien n'est parti) et « Annuler ».
   - Colonne « LV » du tableau Production : n° de LV du module, clic = la LV dans cette vue.
   Enregistrement, modification et annulation : lv.js (lv_save, lv_modifier, lv_cancel) — Archive,
   Planning, Départs, Demandes et portail transporteur sont mis à jour par le serveur.
   Accès : admins et activité « lvu » (comme le formulaire LV).
   ═══════════════════════════════════════════════════════════════════════════ */

// Villes reconnues dans le nom du destinataire quand la LV n'a pas de coordonnées (copie de portail-transporteur.html :
// [mot-clé, ville affichée, lat, lon], les plus précis d'abord).
const _LVC_VILLES = [
  ['SAINT BRIEUC', 'Saint-Brieuc', 48.51, -2.77], ['LORIENT', 'Lorient', 47.75, -3.37],
  ['DIEPPE', 'Dieppe', 49.92, 1.08], ['VANNES', 'Vannes', 47.66, -2.76],
  ['MORLAIX', 'Morlaix', 48.58, -3.83], ['SAINT AUBIN SUR GAILLON', 'St-Aubin-sur-Gaillon', 49.17, 1.32],
  ['RITCHIE BROS', 'St-Aubin-sur-Gaillon', 49.17, 1.32], ['SAINT PATERNE', 'Saint-Paterne (Alençon)', 48.43, 0.09],
  ['ALENÇON', 'Alençon', 48.43, 0.09], ['ALENCON', 'Alençon', 48.43, 0.09],
  ['BORDEAUX', 'Bordeaux', 44.84, -0.58], ['DINARD', 'Dinard', 48.63, -2.07],
  ['MANDELIEU', 'Mandelieu-la-Napoule', 43.55, 6.94], ['SAINT MALO', 'Saint-Malo', 48.65, -2.03],
  ['CLERMONT FERRAND', 'Clermont-Ferrand', 45.78, 3.09], ['PERPIGNAN', 'Perpignan', 42.70, 2.90],
  ['AMIENS', 'Amiens', 49.89, 2.30], ['TOULON', 'Toulon', 43.12, 5.93],
  ['BOURGES', 'Bourges', 47.08, 2.40], ['BLOIS', 'Blois', 47.59, 1.33],
  ['AUXERRE', 'Auxerre', 47.80, 3.57], ['METZ', 'Metz', 49.12, 6.18],
  ['MONTLUÇON', 'Montluçon', 46.34, 2.61], ['MONTLUCON', 'Montluçon', 46.34, 2.61],
  ['LIMOGES', 'Limoges', 45.83, 1.26], ['SAINT FLOUR', 'Saint-Flour', 45.03, 3.09],
  ['MOULINS', 'Moulins', 46.57, 3.33], ['LANNION', 'Lannion', 48.73, -3.46],
  ['SAINT JACQUES DE LA LANDE', 'St-Jacques-de-la-Lande', 48.08, -1.72], ['RENNES', 'Rennes', 48.11, -1.68],
  ['ARNAGE', 'Le Mans (Arnage)', 48.00, 0.20], ['LE MANS', 'Le Mans', 48.00, 0.20],
  ['VAL DE REUIL', 'Val-de-Reuil', 49.27, 1.23], ['ORLEANS', 'Orléans', 47.90, 1.90], ['ORLÉANS', 'Orléans', 47.90, 1.90],
  ['AVRANCHES', 'Avranches', 48.68, -1.36], ['CARHAIX', 'Carhaix', 48.28, -3.58],
  ['LE HAVRE', 'Le Havre', 49.49, 0.11], ['LAVAL', 'Laval', 48.07, -0.77],
  ['LA ROCHE', 'La Roche-sur-Yon', 46.67, -1.43], ['ROANNE', 'Roanne', 46.03, 4.07],
  ['GRENOBLE', 'Grenoble', 45.19, 5.72], ['MULHOUSE', 'Mulhouse', 47.75, 7.34],
  ['NEVERS', 'Nevers', 46.99, 3.16], ['AGEN', 'Agen', 44.20, 0.62],
  ['NANCY', 'Nancy', 48.69, 6.18], ['PERIGUEUX', 'Périgueux', 45.18, 0.72], ['PÉRIGUEUX', 'Périgueux', 45.18, 0.72],
  ['CHALON', 'Chalon-sur-Saône', 46.78, 4.85], ['LAMBALLE', 'Lamballe', 48.47, -2.52],
  ['LONS LE SAUNIER', 'Lons-le-Saunier', 46.67, 5.55], ['LA HAGUE', 'La Hague', 49.65, -1.64],
  ['PONTIVY', 'Pontivy', 48.07, -2.97], ['ROCHEFORT', 'Rochefort', 45.94, -0.96],
  ['TOURS', 'Tours', 47.39, 0.69], ['GOUSSAINVILLE', 'Goussainville', 49.02, 2.47],
  ['AULNAY', 'Aulnay-sous-Bois', 48.94, 2.49], ['GENNEVILLIERS', 'Gennevilliers', 48.93, 2.30],
  ['SAINT JEAN DE VEDAS', 'St-Jean-de-Védas', 43.58, 3.83], ['REDON', 'Redon', 47.65, -2.08],
  ['SAINT MEMMIE', 'Châlons-en-Champagne', 48.96, 4.37], ['BERGERAC', 'Bergerac', 44.85, 0.48],
  ['CALAIS', 'Calais', 50.95, 1.86], ['GRANVILLE', 'Granville', 48.84, -1.60],
  ['COLMAR', 'Colmar', 48.08, 7.36], ['MEAUX', 'Meaux', 48.96, 2.88],
  ['RODEZ', 'Rodez', 44.35, 2.57], ['VARENNES VAUZELLES', 'Varennes-Vauzelles', 46.99, 3.13],
  ['JAVRON', 'Javron-les-Chapelles', 48.44, -0.42],
];

Object.assign(App, {
  _lvpPeut() {
    const u = S.currentUser;
    return !!u && (u.role === 'admin' || (u.activites || []).includes('lvu'));
  },

  _lvpNum(n) { return String(n || '').trim().replace(/^0+(?=\d)/, ''); },

  /* ─ Action groupée ─ */
  async prodSelCreerLv() {
    if (!this._lvpPeut()) { this.toast('⛔ Accès LV non autorisé'); return; }
    const lignes = this._pbLignes().filter(l => S.pb.sel.has(l.code));
    const ok = lignes.filter(l => !l.parti && !l.d.lv);
    const raisons = {};
    lignes.filter(l => !ok.includes(l)).forEach(l => {
      const r = l.parti ? 'déjà parti' : 'déjà sur la LV ' + l.d.lv;
      raisons[r] = (raisons[r] || 0) + 1;
    });
    const ecartes = Object.entries(raisons).map(([r, n]) => n + ' ' + r).join(', ');
    if (!ok.length) { this.toast('Aucun module de la sélection ne peut avoir une nouvelle LV' + (ecartes ? ' : ' + ecartes : ''), 6000); return; }
    const ag = l => String(l.d.ag || ((l.d.chantier || '').match(/^(\d{3,6})/) || [])[1] || '').trim().replace(/^0+/, '');
    const agences = [...new Set(ok.map(ag).filter(Boolean))];
    const libres = ok.filter(l => !ag(l)).map(l => l.code);
    const alertes = [];
    if (agences.length > 1) alertes.push(`Destinations différentes (agences ${agences.join(', ')}) : une LV est normalement faite par destination.`);
    if (libres.length) alertes.push(`Sans destination : ${libres.join(', ')}.`);
    if (ecartes) alertes.push(`Laissés de côté : ${ecartes}.`);
    if (alertes.length && !(await this._otConfirmer({ titre: 'Créer la LV', ok: 'Continuer', annuler: 'Revenir',
        texte: alertes.join(' ') + ` La LV portera ${ok.length} module${ok.length > 1 ? 's' : ''} : ${ok.map(l => l.code).join(', ')}.` }))) return;

    const deps = ok.map(l => l.d);
    S.pb.sel.clear();
    S.lvu.retour = 'prod';
    S.activity = 'lvu';
    if (S.lvu.modif) this.lvuNew();
    S.lvu.loxamItems = deps;
    S.lvu.selectedItems = new Set(deps.map(d => d.code));
    await this.lvuInit();
    await this.lvuLoadAgencies();
    this.lvuSetSource('loxam');
    this.lvuApplyLoxam();
    // Commande commune (ordre d'expédition déjà au Planning U) et son BT si l'ordre est connu
    const cdes = [...new Set(deps.map(d => String(d.commande || '').trim()))];
    if (cdes.length === 1 && cdes[0]) {
      this._lvuPoser('lvu-f-commande', cdes[0]);
      const x = ((S.exp && S.exp.liste) || []).find(e => e.numero === cdes[0] && e.statut !== 'annulee');
      if (x && x.bt) this._lvuPoser('lvu-f-doc', 'BT ' + x.bt);
    }
    this._lvuMajBoutonsResultat();
  },

  /* ─ Vue « LV / CMR » (refaite le 2026-11-24 sur le modèle du portail transporteur) ─
     Une ligne par LV, chiffres « à partir » en tête (LV, modules, destinations, poids, ml), LV de BCB écartées
     (elles se voient dans l'activité LV / CMR). Clic sur le n° = PDF. */
  _lvpEtat() {
    if (!S.lvp) {
      let cal = true;
      try { cal = localStorage.getItem('snt_lvp_cal') !== '0'; } catch (e) { /* affiché */ }
      S.lvp = { liste: null, chargement: false, erreur: '', filtre: 'apartir', q: '', cal, mois: 0, jour: '', sel: '' };
    }
    return S.lvp;
  },

  // LV de BCB (CMR faite au départ d'un enlèvement) : expéditeur BCB ou doc annexe « Enl. … »
  _lvpEstBcb(r) { return /\bBCB\b/i.test(r.expediteur || '') || /^\s*Enl\./i.test(r.doc_annexe || ''); },

  _lvpTrouver(lv) {
    const n = this._lvpNum(lv);
    return n ? ((S.lvp && S.lvp.liste) || []).find(r => this._lvpNum(r.numero) === n) : null;
  },

  // Étiquette LV de la colonne Documents de Production : ouvre le PDF ; sans lien connu, la LV dans la vue LV / CMR
  _lvpHtmlDocLv(lv) {
    if (!lv) return '';
    const r = this._lvpTrouver(lv), t = _otEsc(lv);
    if (r && r.pdfUrl) return `<a class="pb-doc pb-doc-lv" href="${_otEsc(r.pdfUrl)}" target="_blank" rel="noopener" title="PDF de la ${_otEsc(r.type || 'LV')} ${t}${r.annulee ? ' (ANNULÉE)' : ''}">${_otEsc(r.type || 'LV')} ${t}</a>`;
    return this._lvpPeut() ? `<button type="button" class="pb-doc pb-doc-lv" onclick="App.lvpOuvrir('${t}')" title="LV ${t} : voir dans l'onglet LV / CMR">LV ${t}</button>`
      : `<span class="pb-doc pb-doc-lv">LV ${t}</span>`;
  },

  lvpOuvrir(lv) {
    const L = this._lvpEtat();
    // Sans barre de recherche (retirée le 2026-11-25) : on ouvre le bon filtre, la LV est surlignée et amenée à l'écran
    const n = this._lvpNum(lv), r = this._lvpTrouver(lv);
    const l = r ? this._lvpLignes().find(x => x.row === r) : null;
    L.q = ''; L.jour = '';
    L.filtre = l ? l.statut : 'toutes';
    L.sel = n; L.defiler = n;
    this.prodVue('lv');
  },

  async _lvpChargerListe() {
    const L = this._lvpEtat();
    L.chargement = true; L.erreur = '';
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_history_supabase&limit=400', {}, 30000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur inconnue');
      L.liste = d.history || [];
      S.lvpCoords = null;                        // carte : coordonnées relues avec la liste
      S.lvuHistoryRows = L.liste;               // fenêtres d'annulation de lv.js
    } catch (e) { L.erreur = e.message; }
    finally { L.chargement = false; }
  },

  async _lvpCharger(force = false) {
    const L = this._lvpEtat();
    if (L.chargement || (L.liste && !force)) { this._lvpRendre(); return; }
    L.chargement = true;
    this._lvpRendre();
    const attentes = [this._lvpChargerListe()];
    if (!S.depsLoaded && !S.depsLoading) attentes.push(this._pbChargerProduction());
    if (!S.archiveLoaded) attentes.push(this._pbChargerArchive());
    await Promise.allSettled(attentes);
    this._lvpRendre();
  },

  lvpFiltre(f) { const L = this._lvpEtat(); L.filtre = f; L.jour = ''; L.sel = ''; this._lvpRendre(); },

  /* ─ Calendrier des livraisons (2026-11-24, maquette validée par Hugo, remplace la frise) : 3 mois comme le portail
     transporteur, au-dessus de la liste « À partir ». Repères : « le » = jour bleu (foncé si plusieurs), « avant le » =
     barre orange en bas du dernier jour, « à partir du » = barre verte en haut du premier jour, « semaine n° » = n° de
     semaine en bleu foncé + lundi → vendredi bleu clair. Clic sur un jour = LV qui peuvent partir ce jour-là ; clic sur la
     livraison d'une LV = sa fenêtre en jaune. Samedi et dimanche ne se cliquent pas. */
  lvpCalendrier() {
    const L = this._lvpEtat();
    L.cal = !L.cal; L.jour = ''; L.sel = '';
    try { localStorage.setItem('snt_lvp_cal', L.cal ? '1' : '0'); } catch (e) { /* choix pour cette fois */ }
    this._lvpRendre();
  },
  lvpCalMois(n) { const L = this._lvpEtat(); L.mois = n === 0 ? 0 : (L.mois || 0) + n; this._lvpRendreCorps(); },
  lvpCalJour(iso) { const L = this._lvpEtat(); L.jour = L.jour === iso ? '' : iso; L.sel = ''; this._lvpRendreCorps(); },
  lvpCalLv(num) { const L = this._lvpEtat(); L.sel = L.sel === num ? '' : num; L.jour = ''; this._lvpRendreCorps(); },
  lvpCalToutVoir() { const L = this._lvpEtat(); L.jour = ''; L.sel = ''; this._lvpRendreCorps(); },

  // Jours où la LV peut partir, à partir d'aujourd'hui (fenêtre surlignée en jaune)
  _lvpDansFenetre(c, k, auj) {
    if (!c) return false;
    if (c.type === 'le') return k === c.min;
    if (c.type === 'avant') return k >= auj && k <= c.max;
    if (c.type === 'apartir') return k >= c.min;
    if (c.type === 'semaine') return k >= c.min && k <= c.max;
    return false;
  },

  // Jour cliqué : la LV peut-elle partir ce jour-là, et pourquoi (les LV en retard restent dans « Tout voir »)
  _lvpRaisonJour(c, k) {
    const non = { ok: false };
    if (!c || c.type === 'aucune') return { ok: true, t: 'Sans consigne', fort: false };
    if (_livEtat(c) === 'retard') return non;
    if (c.type === 'le') return k === c.min ? { ok: true, t: 'À livrer ce jour', fort: true } : non;
    if (c.type === 'avant') return k > c.max ? non : k === c.max ? { ok: true, t: 'Dernier jour', fort: true } : { ok: true, t: 'Possible, au plus tard le ' + _livJJMM(c.max), fort: false };
    if (c.type === 'apartir') return k < c.min ? non : k === c.min ? { ok: true, t: 'Premier jour possible', fort: true } : { ok: true, t: 'Possible', fort: false };
    if (c.type === 'semaine') return k >= c.min && k <= c.max ? { ok: true, t: 'Dans sa semaine', fort: false } : non;
    return non;
  },

  _lvpHtmlCalendrier(lignes) {
    const L = this._lvpEtat();
    const auj = _livIso(new Date());
    const items = lignes.filter(l => l.statut === 'apartir' && l.liv && l.liv.type !== 'aucune');
    const sel = L.sel ? items.find(l => this._lvpNum(l.row.numero) === L.sel) : null;
    const nom = l => `${l.row.numero} ${l.row.destinataire || ''}`.trim();
    const nums = arr => arr.map(l => this._lvpNum(l.row.numero)).join(',');
    const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const base = new Date(); base.setHours(12, 0, 0, 0); base.setDate(1);
    let mois = '';
    for (let m = 0; m < 3; m++) {
      const premier = new Date(base.getFullYear(), base.getMonth() + (L.mois || 0) + m, 1, 12);
      const debut = new Date(premier); debut.setDate(1 - ((premier.getDay() + 6) % 7));
      let cases = '<span class="lvc-tete">Sem.</span>' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(j => `<span class="lvc-tete">${j}</span>`).join('');
      for (let w = 0; w < 6; w++) {
        const lundi = new Date(debut); lundi.setDate(debut.getDate() + w * 7);
        const kL = _livIso(lundi), s = _livSemaineDe(kL);
        // « semaine n° » : le n° de semaine est coloré ; au survol, les cases du lundi au vendredi sont entourées
        const sems = items.filter(l => l.liv.type === 'semaine' && l.liv.min === kL);
        cases += sems.length
          ? `<span class="lvc-sem lvc-sem-oui" data-lv="${nums(sems)}" title="${_otEsc('Livraison semaine ' + s.no + ' : ' + sems.map(nom).join(', '))}">${s.no}</span>`
          : `<span class="lvc-sem">${s ? s.no : ''}</span>`;
        for (let j = 0; j < 7; j++) {
          const d = new Date(lundi); d.setDate(lundi.getDate() + j);
          const k = _livIso(d), we = j >= 5;
          const le = items.filter(l => l.liv.type === 'le' && l.liv.min === k);
          const av = items.filter(l => l.liv.type === 'avant' && l.liv.max === k);
          const ap = items.filter(l => l.liv.type === 'apartir' && l.liv.min === k);
          const se = we ? [] : items.filter(l => l.liv.type === 'semaine' && k >= l.liv.min && k <= l.liv.max);
          const cls = ['lvc-j'];
          if (d.getMonth() !== premier.getMonth()) cls.push('lvc-hors');
          if (sel && !we && this._lvpDansFenetre(sel.liv, k, auj)) cls.push('lvc-fen');
          if (se.length) cls.push('lvc-semcadre');   // semaine demandée : cases entourées en permanence, plus fort au survol
          if (le.length) cls.push('lvc-le' + Math.min(le.length, 3));
          if (k === auj) cls.push('lvc-auj');
          if (L.jour === k) cls.push('lvc-choisi');
          const quoi = [...le.map(l => nom(l) + ' — le'), ...av.map(l => nom(l) + ' — dernier jour (avant le)'),
            ...ap.map(l => nom(l) + ' — premier jour (à partir du)'), ...se.map(l => nom(l) + ' — semaine ' + (s ? s.no : ''))];
          const titre = _livJour(k) + (quoi.length ? '\n' + quoi.join('\n') : '');
          const lv = nums([...le, ...av, ...ap, ...se]);
          cases += `<button type="button" class="${cls.join(' ')}"${lv ? ` data-lv="${lv}"` : ''}${we ? ' disabled' : ` onclick="App.lvpCalJour('${k}')"`} title="${_otEsc(titre)}" aria-label="${_otEsc(_livJour(k) + (quoi.length ? ', ' + quoi.length + ' LV' : ''))}">`
            + (ap.length ? '<i class="lvc-ap" aria-hidden="true"></i>' : '') + d.getDate() + (av.length ? '<i class="lvc-av" aria-hidden="true"></i>' : '') + '</button>';
        }
      }
      mois += `<div class="lvc-mois"><div class="lvc-mois-nom">${MOIS[premier.getMonth()]} ${premier.getFullYear()}</div><div class="lvc-grille">${cases}</div></div>`;
    }
    return `<section class="sx-carte lvc" aria-label="Calendrier des livraisons">
      <div class="lvc-nav">
        <button type="button" class="pb-bouton" onclick="App.lvpCalMois(-1)" aria-label="Mois précédent">‹</button>
        <button type="button" class="pb-bouton" onclick="App.lvpCalMois(0)">Aujourd’hui</button>
        <button type="button" class="pb-bouton" onclick="App.lvpCalMois(1)" aria-label="Mois suivant">›</button>
        <span class="lvc-aide">Survolez une LV, un jour ou un point de la carte : ce qui va ensemble ressort. Cliquez un jour pour voir ce qui peut partir ce jour-là, ou la livraison d’une LV pour voir sa fenêtre.</span>
      </div>
      <div class="lvc-haut">
        <div class="lvc-mois-liste">${mois}</div>
        <div id="lvc-carte" class="lvc-carte" aria-label="Carte des destinations"></div>
      </div>
      <div class="lvc-legende">
        <span><i class="lvc-l lvc-le1"></i><i class="lvc-l lvc-le2"></i><i class="lvc-l lvc-le3"></i>Livraison <b>le</b> : 1, 2, 3 LV et plus</span>
        <span><i class="lvc-l lvc-l-av"></i><b>Avant le</b> : dernier jour</span>
        <span><i class="lvc-l lvc-l-ap"></i><b>À partir du</b> : premier jour</span>
        <span><i class="lvc-l-no">49</i><b>Semaine n°</b> : survolez pour voir le lundi → vendredi</span>
        <span><i class="lvc-l lvc-l-fen"></i>Fenêtre de la LV choisie</span>
      </div>
    </section>`;
  },

  /* ─ Survol croisé (comme le portail transporteur) : tout élément porteur de data-lv (ligne, case du calendrier,
     n° de semaine, point de la carte) fait ressortir les autres éléments des mêmes LV. */
  _lvpSurvolInit(el) {
    if (el._lvcSurvol) return;
    el._lvcSurvol = true;
    el.addEventListener('mouseover', e => {
      const t = e.target.closest && e.target.closest('[data-lv]');
      // Une ligne fait aussi ressortir les autres LV vers la même destination (comme le portail)
      this._lvpSurligner(!t ? '' : t.classList.contains('pb-grille-lv') ? this._lvpMemeDest(t.dataset.lv) : t.dataset.lv);
    });
    el.addEventListener('mouseleave', () => this._lvpSurligner(''));
    el.addEventListener('click', e => {   // point de la carte : amène à la première LV de la liste
      const m = e.target.closest && e.target.closest('.lvc-marq');
      if (!m) return;
      const n = m.dataset.lv.split(',')[0];
      const ligne = el.querySelector(`.pb-grille-lv[data-lv="${n}"]`);
      if (ligne) ligne.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  },
  // LV vers la même destination : même point de carte (adresse géocodée ou ville), sinon même destinataire
  _lvpMemeDest(lv) {
    const g = this._lvpGroupes || {};
    const cle = g[lv];
    if (!cle) return lv;
    return Object.keys(g).filter(n => g[n] === cle).join(',');
  },
  _lvpGrouperDest(lignes, position) {
    const g = {};
    lignes.filter(l => l.statut === 'apartir').forEach(l => {
      const p = position ? position(l) : null;
      const nom = String(l.row.destinataire || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
      const cle = p ? 'p:' + p.cle : (nom ? 'n:' + nom : '');
      if (cle) g[this._lvpNum(l.row.numero)] = cle;
    });
    this._lvpGroupes = g;
  },

  _lvpSurligner(lv) {
    if (this._lvpHiCle === lv) return;
    this._lvpHiCle = lv;
    const set = new Set(String(lv || '').split(',').filter(Boolean));
    document.querySelectorAll('#lvp-corps [data-lv]').forEach(x => {
      x.classList.toggle('lvc-hi', set.size > 0 && x.dataset.lv.split(',').some(n => set.has(n)));
    });
  },

  /* ─ Carte des destinations (Leaflet + OpenStreetMap, comme le portail) : coordonnées géocodées à la création
     (Supabase voyages.destination_lat / _lon), sinon la ville reconnue dans le nom du destinataire. */
  _lvpLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (this._lvpLeafletP) return this._lvpLeafletP;
    this._lvpLeafletP = new Promise((ok, ko) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = '';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; s.crossOrigin = '';
      s.onload = () => ok();
      s.onerror = () => { this._lvpLeafletP = null; ko(new Error('Leaflet indisponible')); };
      document.head.appendChild(s);
    });
    return this._lvpLeafletP;
  },

  async _lvpCoordonnees() {
    if (S.lvpCoords) return S.lvpCoords;
    if (this._lvpCoordsP) return this._lvpCoordsP;
    this._lvpCoordsP = (async () => {
      const idx = {};
      try {
        if (window.SupabaseDB) {
          const { data, error } = await window.SupabaseDB.from('voyages').select('numero_lv, destination_lat, destination_lon').eq('parti', false);
          if (error) throw error;
          (data || []).forEach(v => {
            if (v.destination_lat != null && v.destination_lon != null) idx[this._lvpNum(v.numero_lv)] = { lat: Number(v.destination_lat), lon: Number(v.destination_lon) };
          });
        }
      } catch (e) { console.warn('[LV] coordonnées', e); }
      S.lvpCoords = idx;
      this._lvpCoordsP = null;
      return idx;
    })();
    return this._lvpCoordsP;
  },

  _lvpPosition(l, coords) {
    const r = l.row, n = this._lvpNum(r.numero), c = coords[n];
    if (c && isFinite(c.lat) && isFinite(c.lon)) return { cle: c.lat.toFixed(3) + ',' + c.lon.toFixed(3), lat: c.lat, lon: c.lon, nom: r.destinataire || '' };
    const up = [r.destinataire, r.destination_adresse].join(' ').toUpperCase();
    const v = _LVC_VILLES.find(x => up.includes(x[0]));
    return v ? { cle: v[1], lat: v[2], lon: v[3], nom: v[1] } : null;
  },

  async _lvpCarte(lignes) {
    const box = document.getElementById('lvc-carte');
    if (!box) return;
    const items = lignes.filter(l => l.statut === 'apartir');
    try { await this._lvpLeaflet(); } catch (e) { box.innerHTML = '<div class="lvc-carte-vide">Carte indisponible (pas de réseau ?)</div>'; return; }
    const coords = await this._lvpCoordonnees();
    if (!document.body.contains(box)) return;
    this._lvpGrouperDest(lignes, l => this._lvpPosition(l, coords));
    const LF = window.L;
    let vue = null;
    if (S._lvpMap) { try { vue = { c: S._lvpMap.getCenter(), z: S._lvpMap.getZoom() }; S._lvpMap.remove(); } catch (e) { /* carte déjà retirée */ } }
    const carte = LF.map(box, { scrollWheelZoom: false, attributionControl: true });
    S._lvpMap = carte;
    LF.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 }).addTo(carte);
    const groupes = {};
    let sansLieu = 0;
    items.forEach(l => {
      const p = this._lvpPosition(l, coords);
      if (!p) { sansLieu++; return; }
      const g = groupes[p.cle] = groupes[p.cle] || Object.assign({ lvs: [] }, p);
      g.lvs.push(l);
    });
    const points = Object.values(groupes);
    points.forEach(g => {
      const n = g.lvs.length, taille = 22 + Math.min(n, 6) * 6;
      const nums = g.lvs.map(l => this._lvpNum(l.row.numero)).join(',');
      const titre = g.nom + ' — ' + g.lvs.map(l => l.row.numero + (l.liv ? ' (' + _livTexte(l.liv, true) + ')' : '')).join(', ');
      LF.marker([g.lat, g.lon], {
        icon: LF.divIcon({ className: 'lvc-marq-icone', iconSize: [taille, taille], iconAnchor: [taille / 2, taille / 2],
          html: `<div class="lvc-marq" data-lv="${nums}" title="${_otEsc(titre)}">${n}</div>` })
      }).addTo(carte);
    });
    if (vue) carte.setView(vue.c, vue.z);
    else if (points.length) carte.fitBounds(points.map(g => [g.lat, g.lon]), { padding: [24, 24], maxZoom: 8 });
    else carte.setView([47.3, 0.5], 6);
    if (sansLieu) {
      const info = LF.control({ position: 'bottomleft' });
      info.onAdd = () => { const d = LF.DomUtil.create('div', 'lvc-carte-info'); d.textContent = sansLieu + ' LV sans lieu connu'; return d; };
      info.addTo(carte);
    }
  },

  /* ─ Marquer parti depuis Production (2026-11-25, demande de Hugo) : mêmes règles que Départs LOXAM — toute la LV
     part ensemble (modules « frères » ajoutés), action dep_mark_parti (Planning R, Départs, Archive, Demandes, portail).
     Accès : admins et activité LOXAM (comme le changement d'étape). */
  async prodSelParti() {
    if (!this._pbPeutEtape()) return;
    const toutes = this._pbLignes();
    const choisis = toutes.filter(l => S.pb.sel.has(l.code) && !l.parti);
    const dejaPartis = toutes.filter(l => S.pb.sel.has(l.code) && l.parti).length;
    if (!choisis.length) { this.toast('Aucun module à marquer parti : ils sont déjà partis', 5000); return; }
    const lvs = new Set(choisis.map(l => this._lvpNum(l.d.lv)).filter(Boolean));
    const freres = toutes.filter(l => !l.parti && l.d.lv && lvs.has(this._lvpNum(l.d.lv)) && !choisis.includes(l));
    const tous = [...choisis, ...freres];
    const sansLv = tous.filter(l => !l.d.lv).map(l => l.code);
    const n = tous.length;
    const texte = [
      `${n} module${n > 1 ? 's' : ''} ser${n > 1 ? 'ont' : 'a'} marqué${n > 1 ? 's' : ''} parti${n > 1 ? 's' : ''} : ${tous.map(l => l.code).join(', ')}.`,
      freres.length ? `Dont ${freres.length} ajouté${freres.length > 1 ? 's' : ''} automatiquement : même LV, le voyage part en entier.` : '',
      lvs.size ? `LV concernée${lvs.size > 1 ? 's' : ''} : ${[...lvs].join(', ')} (portail transporteur mis à jour).` : '',
      sansLv.length ? `Sans LV : ${sansLv.join(', ')}.` : '',
      dejaPartis ? `${dejaPartis} déjà parti${dejaPartis > 1 ? 's' : ''}, ignoré${dejaPartis > 1 ? 's' : ''}.` : '',
    ].filter(Boolean).join(' ');
    if (!(await this._otConfirmer({ titre: 'Marquer parti', texte, ok: n > 1 ? 'Marquer partis' : 'Marquer parti', annuler: 'Revenir' }))) return;
    this.toast('⏳ Mise à jour du Planning…', 60000);
    try {
      const res = await this._otPost({ action: 'dep_mark_parti', codes: tous.map(l => l.d.code) }, 90000);
      S.pb.sel.clear();
      this.toast(`✅ ${res.count} module${res.count > 1 ? 's' : ''} marqué${res.count > 1 ? 's' : ''} parti${res.count > 1 ? 's' : ''}`, 5000);
    } catch (e) { this.toast('❌ ' + e.message, 7000); return; }
    await this._lvpToutRecharger();
  },

  // Après un départ ou une suppression : Planning, partis et liste des LV relus, écran redessiné
  async _lvpToutRecharger() {
    await Promise.allSettled([this._pbChargerProduction(), this._pbChargerArchive(), this._lvpChargerListe()]);
    if (S.pb && S.pb.vue === 'lv') this._lvpRendre(); else if (this._pbRendre) this._pbRendre();
  },

  // Onglet LV / CMR : LV partie (toute la LV : Archive, Départs, modules au Planning, portail)
  async lvpPartie(num) {
    const r = this._lvpTrouver(num); if (!r) return;
    const mods = (this._lvpModules()[this._lvpNum(num)] || []).filter(m => !m.parti).map(m => m.d.code);
    if (!(await this._otConfirmer({ titre: 'LV ' + r.numero + ' partie', ok: 'Marquer partie', annuler: 'Revenir',
        texte: `La LV ${r.numero} (${r.destinataire || '—'}) sera marquée partie${mods.length ? ', avec ' + mods.length + ' module' + (mods.length > 1 ? 's' : '') + ' au Planning : ' + mods.join(', ') : ''}. Le portail transporteur est mis à jour.` }))) return;
    this.toast('⏳ LV ' + r.numero + '…', 60000);
    try {
      const d = await this._otPost({ action: 'lv_mark_parti_by_numero', numero: r.numero, parti: true }, 60000);
      this.toast('✅ LV ' + r.numero + ' partie' + (d.portail_ok === false ? ' (portail non synchronisé)' : ''), 5000);
    } catch (e) { this.toast('❌ ' + e.message, 7000); return; }
    await this._lvpToutRecharger();
  },

  // Onglet LV / CMR : supprimer la DERNIÈRE LV créée (son numéro sera repris) — le serveur revérifie (lv_delete)
  async lvpSupprimer(num) {
    const r = this._lvpTrouver(num); if (!r) return;
    if (!(await this._otConfirmer({ titre: 'Supprimer la LV ' + r.numero, ok: 'Supprimer', annuler: 'Revenir',
        texte: `C'est la dernière LV créée : elle disparaît de l'historique, son PDF part à la corbeille, ses modules sont libérés au Planning et la prochaine LV reprendra le n° ${r.numero}. Si elle a déjà été remise au chauffeur, utilisez plutôt « Annuler ».` }))) return;
    this.toast('⏳ Suppression de la LV ' + r.numero + '…', 60000);
    try {
      await this._otPost({ action: 'lv_delete', numero: r.numero }, 60000);
      this.toast('✅ LV ' + r.numero + ' supprimée — son numéro sera repris', 5000);
    } catch (e) { this.toast('❌ ' + e.message, 7000); return; }
    await this._lvpToutRecharger();
  },

  lvpRecherche(q) {
    this._lvpEtat().q = q;
    clearTimeout(this._lvpMinuteur);
    this._lvpMinuteur = setTimeout(() => this._lvpRendreCorps(), 150);
  },

  // Modules du Planning (sur parc + partis) par n° de LV
  _lvpModules() {
    const idx = {};
    [...(S.deps || []).map(d => ({ d, parti: false })), ...(S.archive || []).map(d => ({ d, parti: true }))].forEach(x => {
      const n = this._lvpNum(x.d.lv);
      if (!n) return;
      (idx[n] = idx[n] || []).push(x);
    });
    return idx;
  },

  _lvpDate(s) {   // « dd/mm/yyyy » ou « yyyy-mm-dd » → Date (minuit) ou null
    const t = String(s || '').trim();
    let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  },

  _lvpLignes() {
    const L = this._lvpEtat(), idx = this._lvpModules();
    return (L.liste || []).filter(r => !this._lvpEstBcb(r)).map(row => {
      const mods = idx[this._lvpNum(row.numero)] || [];
      const statut = row.annulee ? 'annulee' : (row.parti || mods.some(m => m.parti)) ? 'partie' : 'apartir';
      return { row, mods, statut, liv: this._lvuConsigneLigne(row) };   // consigne de livraison (livraison.js)
    });
  },

  _lvpRendre() {
    const el = document.getElementById('prod-bureau-root');
    if (!el || S.view !== 'prod-bureau' || !S.pb || S.pb.vue !== 'lv') return;
    const L = this._lvpEtat();
    const lignes = this._lvpLignes();
    const n = s => lignes.filter(l => l.statut === s).length;
    const f = (cle, nom, nb) => `<button type="button" class="pb-onglet" aria-pressed="${L.filtre === cle}" onclick="App.lvpFiltre('${cle}')">${nom}${nb !== undefined ? ' <b>' + nb + '</b>' : ''}</button>`;
    _sxGarderDefilement(el);
    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: 'LV / CMR · ' + (L.liste ? n('apartir') + ' à partir' : 'chargement…'), large: true, bandeau: this._pbNav('lv') })}
      <div class="pb-barre"><div class="pb-barre-in">
        <div class="pb-ligne pb-defile">
          <div class="pb-ligne" role="group" aria-label="Filtre">${f('apartir', 'À partir', n('apartir'))}${f('partie', 'Parties', n('partie'))}${f('annulee', 'Annulées', n('annulee'))}${f('toutes', 'Toutes')}</div>
          ${L.filtre === 'apartir' ? `<button type="button" class="pb-onglet lvp-cal-btn" aria-pressed="${!!L.cal}" onclick="App.lvpCalendrier()">Calendrier</button>` : ''}
          <button type="button" class="pb-bouton${L.filtre === 'apartir' ? '' : ' lvp-cal-btn'}" onclick="App._lvpCharger(true)">${L.chargement ? 'Chargement…' : 'Actualiser'}</button>
        </div>
      </div></div>
      <main class="pb-contenu" id="lvp-corps"></main>
    </div>`;
    this._lvpRendreCorps();
  },

  _lvpRendreCorps() {
    const el = document.getElementById('lvp-corps');
    if (!el) return;
    const L = this._lvpEtat();
    if (L.erreur && !L.liste) { el.innerHTML = `<div class="sx-carte"><div class="sx-vide">Historique des LV illisible : ${_otEsc(L.erreur)}</div></div>`; return; }
    if (!L.liste) { el.innerHTML = '<div class="sx-chargement">Chargement des LV…</div>'; return; }
    const q = String(L.q || '').trim().toLowerCase();
    const qn = /^\d+$/.test(q) ? this._lvpNum(q) : '';
    let lignes = this._lvpLignes().filter(l => {
      if (L.filtre !== 'toutes' && l.statut !== L.filtre) return false;
      if (!q) return true;
      if (qn && this._lvpNum(l.row.numero) === qn) return true;
      const r = l.row;
      return [r.numero, r.destinataire, r.commande, r.doc_annexe, r.marchandises_desc, r.conducteur, r.immat_moteur,
        ...l.mods.map(m => m.d.code), ...l.mods.map(m => m.d.codeModule), ...l.mods.map(m => m.d.chantier)]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
    // À partir : par urgence de livraison — retard, au plus tard le plus proche, « à partir du », sans consigne ;
    // sinon les plus récentes d'abord
    if (L.filtre === 'apartir') lignes = lignes.slice().sort((a, b) => _livCleTri(a.liv) - _livCleTri(b.liv) || Number(b.row.numero) - Number(a.row.numero));
    const dernier = (L.liste || []).reduce((m, r) => (Number(r.numero) > Number((m && m.numero) || 0) ? r : m), null);
    L.dernier = dernier && !dernier.annulee && !dernier.parti ? this._lvpNum(dernier.numero) : '';
    const avecCal = L.filtre === 'apartir' && L.cal;
    const cal = avecCal ? this._lvpHtmlCalendrier(lignes) : '';
    const toutes = lignes;   // pour la carte : toutes les LV à partir, même quand un jour est choisi
    this._lvpGrouperDest(toutes, S.lvpCoords ? l => this._lvpPosition(l, S.lvpCoords) : null);
    let bandeau = '';
    lignes.forEach(l => { l.raison = null; });
    if (avecCal && L.jour) {
      lignes = lignes.filter(l => { const r = this._lvpRaisonJour(l.liv, L.jour); l.raison = r; return r.ok; });
      bandeau = `<b>Peuvent partir le ${_otEsc(_livJour(L.jour))}</b> — ${lignes.length} LV, selon la consigne de chaque LV`;
    } else if (avecCal && L.sel) {
      const s = lignes.find(l => this._lvpNum(l.row.numero) === L.sel);
      if (s) bandeau = `<b>LV ${_otEsc(s.row.numero)} · ${_otEsc(s.row.destinataire || '')}</b> — ${_otEsc(s.liv ? _livTexte(s.liv) : 'Pas de consigne')} : fenêtre surlignée en jaune`;
    }
    if (bandeau) bandeau = `<div class="lvc-bandeau"><span>${bandeau}</span><button type="button" class="pb-bouton" onclick="App.lvpCalToutVoir()">Tout voir</button></div>`;
    if (!lignes.length) { el.innerHTML = cal + bandeau + `<div class="sx-carte"><div class="sx-vide">${L.jour ? 'Aucune LV ne peut partir ce jour-là.' : 'Aucune LV ne correspond.'}</div></div>`; this._lvpApresRendu(el, avecCal, toutes); return; }
    const entete = `<div class="pb-grille-lv pb-tete"><span>LV</span><span>Créée</span><span>Destination</span><span>Modules</span>
      <span>Commande · BT</span><span>Poids · ml</span><span>Livraison</span><span>${avecCal && L.jour ? 'Ce jour-là' : 'Statut'}</span><span>Actions</span></div>`;
    el.innerHTML = cal + bandeau + `<div class="pb-tableau"><div class="pb-interieur pb-interieur-lv">${entete}${lignes.map(l => this._lvpHtmlLigne(l)).join('')}</div></div>`;
    this._pbColsInit(el);
    this._lvpApresRendu(el, avecCal, toutes);
  },

  _lvpApresRendu(el, avecCal, lignes) {
    this._lvpHiCle = null;
    this._lvpSurvolInit(el);
    if (avecCal) this._lvpCarte(lignes);
    else if (S._lvpMap) { try { S._lvpMap.remove(); } catch (e) { /* déjà retirée */ } S._lvpMap = null; }
    const L = this._lvpEtat();
    if (L.defiler) {   // LV ouverte depuis l'étiquette de Production
      const x = el.querySelector(`.pb-grille-lv[data-num="${L.defiler}"]`);
      L.defiler = '';
      if (x) setTimeout(() => x.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  },

  _lvpHtmlLigne(l) {
    const r = l.row, num = _otEsc(r.numero || '');
    const { grutage, commentaire } = this._lvuParseNote(r.note);
    const court = d => { const x = this._lvpDate(d); return x ? x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''; };
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const etatLiv = l.statut === 'apartir' && _livEtat(l.liv) === 'retard' ? 'retard' : '';   // seul le retard est coloré
    const L = this._lvpEtat(), nn = this._lvpNum(r.numero);
    const cliquable = L.cal && L.filtre === 'apartir' && l.statut === 'apartir' && l.liv && l.liv.type !== 'aucune';
    const statut = {
      annulee: `<span class="pb-ot lvp-st-annulee" title="${_otEsc('Annulée le ' + (r.annulee_le || '?') + (r.annulee_par ? ' par ' + r.annulee_par : '') + ' : ' + (r.annulation_motif || '') + (r.remplacee_par ? ' — remplacée par n° ' + r.remplacee_par : ''))}">Annulée${r.remplacee_par ? ' → ' + _otEsc(r.remplacee_par) : ''}</span>`,
      partie: `<span class="pb-ot lvp-st-partie">Partie${r.parti_le ? ' ' + _otEsc(r.parti_le.slice(0, 5)) : ''}</span>`,
      apartir: '<span class="pb-ot lvp-st-apartir">À partir</span>',
    }[l.statut];
    const titreMods = l.mods.map(m => [m.d.code, m.d.codeModule, m.d.module].filter(Boolean).join(' · ') + (m.parti ? ' (parti)' : '')).join('\n');
    const mods = l.mods.length
      ? l.mods.map(m => `<span class="lvp-mod${m.parti ? ' lvp-mod-parti' : ''}">${_otEsc(m.d.code)}</span>`).join('')
      : `<span class="pb-gris">${_otEsc(r.marchandises_desc || '—')}</span>`;
    const cde = [r.commande, r.doc_annexe].filter(Boolean).join(' · ');
    const pm = [r.poids ? String(r.poids).replace('.', ',') + ' t' : '', r.ml ? String(r.ml).replace('.', ',') + ' ml' : ''].filter(Boolean).join(' · ');
    const titreDest = [r.destinataire, r.destination_adresse, commentaire ? 'Note : ' + commentaire : '', r.conducteur ? 'Chauffeur : ' + [r.conducteur, r.immat_moteur, r.immat_semi].filter(Boolean).join(' · ') : '', r.remplace ? 'Remplace la LV ' + r.remplace : ''].filter(Boolean).join('\n');
    const actions = [
      r.pdfUrl ? `<a class="pb-doc pb-doc-lv" href="${_otEsc(r.pdfUrl)}" target="_blank" rel="noopener" title="Ouvrir le PDF">PDF</a>` : '',
      l.statut === 'apartir' ? `<button type="button" class="lvp-btn" onclick="App.lvuModifier('${num}', 'prod')" title="Modifier la LV sous le même numéro : modules, destinataire, transporteur, note…">Modifier</button>` : '',
      l.statut === 'apartir' ? `<button type="button" class="lvp-btn" onclick="App.lvpPartie('${num}')" title="Marquer la LV partie (ses modules aussi au Planning, portail mis à jour)">Partie</button>` : '',
      l.statut === 'apartir' && L.dernier === nn ? `<button type="button" class="lvp-btn lvp-btn-rouge" onclick="App.lvpSupprimer('${num}')" title="Dernière LV créée : la supprimer, son numéro sera repris">Supprimer</button>` : '',
      l.statut === 'apartir' ? `<button type="button" class="lvp-btn lvp-btn-rouge" onclick="App.openLvCancelModal('${num}')" title="Annuler la LV (reste dans l'historique, modules libérés)" aria-label="Annuler la LV ${num}">Annuler</button>` : '',
    ].join('');
    const lienNum = r.pdfUrl ? `<a href="${_otEsc(r.pdfUrl)}" target="_blank" rel="noopener" class="lvp-lien" title="Ouvrir le PDF"><b>${num}</b></a>` : `<b>${num}</b>`;
    return `<div class="pb-grille-lv pb-ligne-module${l.statut !== 'apartir' ? ' pb-parti' : ''}${L.sel && L.sel === nn ? ' lvc-ligne-sel' : ''}"${l.statut === 'apartir' ? ` data-lv="${_otEsc(nn)}"` : ''} data-num="${_otEsc(nn)}">
      <span class="lvp-num">${lienNum} <span class="lvp-type">${_otEsc(r.type || 'LV')}</span></span>
      <span class="pb-gris2">${_otEsc(court(r.date))}</span>
      <span title="${_otEsc(titreDest)}">${_otEsc(r.destinataire || '—')}${grutage ? '<span class="lvp-grutage">grutage</span>' : ''}${commentaire ? ' <span class="pb-gris2">· ' + _otEsc(commentaire) + '</span>' : ''}</span>
      <span class="lvp-mods" title="${_otEsc(titreMods)}">${mods}</span>
      <span class="pb-gris2" title="${_otEsc(cde)}">${_otEsc(cde)}</span>
      <span class="pb-gris2">${_otEsc(pm)}</span>
      <span class="pb-liv${etatLiv ? ' pb-liv-' + etatLiv : ''}${l.liv ? '' : ' pb-gris'}" title="${_otEsc(l.liv ? _livTexte(l.liv) : 'Pas de consigne')}">${cliquable
        ? `<button type="button" class="pb-liv-btn" onclick="App.lvpCalLv('${_otEsc(nn)}')" aria-pressed="${L.sel === nn}" title="${_otEsc(_livTexte(l.liv))} : voir sur le calendrier">${_otEsc(_livTexte(l.liv, true))}</button>`
        : _otEsc(l.liv ? _livTexte(l.liv, true) : '—')}</span>
      <span>${l.raison ? `<span class="lvc-raison${l.raison.fort ? ' lvc-fort' : ''}">${_otEsc(l.raison.t)}</span>` : statut}</span>
      <span class="lvp-actions">${actions}</span>
    </div>`;
  },
});
