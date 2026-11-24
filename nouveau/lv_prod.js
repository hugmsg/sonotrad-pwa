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
    S.lvp = S.lvp || { liste: null, chargement: false, erreur: '', filtre: 'apartir', q: '' };
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
    L.q = this._lvpNum(lv); L.filtre = 'toutes';
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

  lvpFiltre(f) { this._lvpEtat().filtre = f; this._lvpRendre(); },
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
      return { row, mods, statut, liv: this._lvpDate(row.livraison_prevue) };
    });
  },

  _lvpRendre() {
    const el = document.getElementById('prod-bureau-root');
    if (!el || S.view !== 'prod-bureau' || !S.pb || S.pb.vue !== 'lv') return;
    const L = this._lvpEtat();
    const lignes = this._lvpLignes();
    const n = s => lignes.filter(l => l.statut === s).length;
    const ap = lignes.filter(l => l.statut === 'apartir');
    const nbMods = ap.reduce((t, l) => t + (l.mods.length || 0), 0);
    const dests = new Set(ap.map(l => String(l.row.destinataire || '').trim().toUpperCase()).filter(Boolean)).size;
    const somme = k => ap.reduce((t, l) => t + (parseFloat(l.row[k]) || 0), 0);
    const nombre = (x, dec) => x.toLocaleString('fr-FR', { maximumFractionDigits: dec });
    const bcb = (L.liste || []).filter(r => this._lvpEstBcb(r)).length;
    const f = (cle, nom, nb) => `<button type="button" class="pb-onglet" aria-pressed="${L.filtre === cle}" onclick="App.lvpFiltre('${cle}')">${nom}${nb !== undefined ? ' <b>' + nb + '</b>' : ''}</button>`;
    const stat = (v, t) => `<span class="lvp-stat"><b>${v}</b>${t}</span>`;
    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: 'LV / CMR · ' + (L.liste ? n('apartir') + ' à partir' : 'chargement…'), large: true, bandeau: this._pbNav('lv') })}
      <div class="pb-barre"><div class="pb-barre-in">
        <div class="pb-ligne">
          <div class="sx-recherche pb-recherche">${_OT_SVG_LOUPE}
            <label for="lvp-q" class="sx-sr">Rechercher</label>
            <input id="lvp-q" type="search" placeholder="N° de LV, code, n° module, destination, commande, BT…" value="${_otEsc(L.q)}" oninput="App.lvpRecherche(this.value)">
          </div>
          <button type="button" class="pb-bouton" onclick="App._lvpCharger(true)">${L.chargement ? 'Chargement…' : 'Actualiser'}</button>
        </div>
        ${L.liste ? `<div class="pb-ligne lvp-stats" aria-label="LV à partir">
          ${stat(ap.length, ' LV à partir')}${stat(nbMods, ' modules')}${stat(dests, ' destinations')}${stat(nombre(somme('poids'), 1), ' t')}${stat(nombre(somme('ml'), 1), ' ml')}
          ${bcb ? `<span class="lvp-masquees">${bcb} LV de BCB non affichées (activité LV / CMR)</span>` : ''}
        </div>` : ''}
        <div class="pb-ligne pb-defile" role="group" aria-label="Filtre">
          ${f('apartir', 'À partir', n('apartir'))}${f('partie', 'Parties', n('partie'))}${f('annulee', 'Annulées', n('annulee'))}${f('toutes', 'Toutes')}
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
    // À partir : par date de livraison prévue (les plus proches d'abord, sans date à la fin) ; sinon les plus récentes d'abord
    if (L.filtre === 'apartir') lignes = lignes.slice().sort((a, b) => (a.liv ? a.liv.getTime() : 9e15) - (b.liv ? b.liv.getTime() : 9e15) || Number(b.row.numero) - Number(a.row.numero));
    if (!lignes.length) { el.innerHTML = '<div class="sx-carte"><div class="sx-vide">Aucune LV ne correspond.</div></div>'; return; }
    const entete = `<div class="pb-grille-lv pb-tete"><span>LV</span><span>Créée</span><span>Destination</span><span>Modules</span>
      <span>Commande · BT</span><span>Poids · ml</span><span>Livraison</span><span>Statut</span><span>Actions</span></div>`;
    el.innerHTML = `<div class="pb-tableau"><div class="pb-interieur pb-interieur-lv">${entete}${lignes.map(l => this._lvpHtmlLigne(l)).join('')}</div></div>`;
    this._pbColsInit(el);
  },

  _lvpHtmlLigne(l) {
    const r = l.row, num = _otEsc(r.numero || '');
    const { grutage, commentaire } = this._lvuParseNote(r.note);
    const court = d => { const x = this._lvpDate(d); return x ? x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''; };
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const retard = l.statut === 'apartir' && l.liv && l.liv < auj;
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
      l.statut === 'apartir' ? `<button type="button" class="lvp-btn lvp-btn-rouge" onclick="App.openLvCancelModal('${num}')" title="Annuler la LV (reste dans l'historique, modules libérés)" aria-label="Annuler la LV ${num}">Annuler</button>` : '',
    ].join('');
    const lienNum = r.pdfUrl ? `<a href="${_otEsc(r.pdfUrl)}" target="_blank" rel="noopener" class="lvp-lien" title="Ouvrir le PDF"><b>${num}</b></a>` : `<b>${num}</b>`;
    return `<div class="pb-grille-lv pb-ligne-module${l.statut !== 'apartir' ? ' pb-parti' : ''}">
      <span class="lvp-num">${lienNum} <span class="lvp-type">${_otEsc(r.type || 'LV')}</span></span>
      <span class="pb-gris2">${_otEsc(court(r.date))}</span>
      <span title="${_otEsc(titreDest)}">${_otEsc(r.destinataire || '—')}${grutage ? '<span class="lvp-grutage">grutage</span>' : ''}${commentaire ? ' <span class="pb-gris2">· ' + _otEsc(commentaire) + '</span>' : ''}</span>
      <span class="lvp-mods" title="${_otEsc(titreMods)}">${mods}</span>
      <span class="pb-gris2" title="${_otEsc(cde)}">${_otEsc(cde)}</span>
      <span class="pb-gris2">${_otEsc(pm)}</span>
      <span class="${retard ? 'lvp-retard' : 'pb-gris2'}"${retard ? ' title="Date de livraison dépassée"' : ''}>${_otEsc(court(r.livraison_prevue))}</span>
      <span>${statut}</span>
      <span class="lvp-actions">${actions}</span>
    </div>`;
  },
});
