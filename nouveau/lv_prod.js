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

  /* ─ Vue « LV / CMR » ─ */
  _lvpEtat() {
    S.lvp = S.lvp || { liste: null, chargement: false, erreur: '', filtre: 'apartir', q: '' };
    return S.lvp;
  },

  lvpOuvrir(lv) {
    const L = this._lvpEtat();
    L.q = this._lvpNum(lv); L.filtre = 'toutes';
    this.prodVue('lv');
  },

  async _lvpCharger(force = false) {
    const L = this._lvpEtat();
    if (L.chargement || (L.liste && !force)) { this._lvpRendre(); return; }
    L.chargement = true; L.erreur = '';
    this._lvpRendre();
    const attentes = [];
    if (!S.depsLoaded && !S.depsLoading) attentes.push(this._pbChargerProduction());
    if (!S.archiveLoaded) attentes.push(this._pbChargerArchive());
    attentes.push((async () => {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_history_supabase&limit=300', {}, 30000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur inconnue');
      L.liste = d.history || [];
      S.lvuHistoryRows = L.liste;               // fenêtres d'annulation de lv.js
    })().catch(e => { L.erreur = e.message; }));
    await Promise.allSettled(attentes);
    L.chargement = false;
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

  _lvpLignes() {
    const L = this._lvpEtat(), idx = this._lvpModules();
    return (L.liste || []).map(row => {
      const mods = idx[this._lvpNum(row.numero)] || [];
      const partiMod = mods.some(m => m.parti);
      const statut = row.annulee ? 'annulee' : (row.parti || partiMod) ? 'partie' : 'apartir';
      return { row, mods, statut };
    });
  },

  _lvpRendre() {
    const el = document.getElementById('prod-bureau-root');
    if (!el || S.view !== 'prod-bureau' || !S.pb || S.pb.vue !== 'lv') return;
    const L = this._lvpEtat();
    const lignes = this._lvpLignes();
    const n = s => lignes.filter(l => l.statut === s).length;
    const f = (cle, nom, nb) => `<button type="button" class="pb-onglet" aria-pressed="${L.filtre === cle}" onclick="App.lvpFiltre('${cle}')">${nom}${nb !== undefined ? ' <b>' + nb + '</b>' : ''}</button>`;
    const sous = L.chargement && !L.liste ? 'chargement…' : n('apartir') + ' à partir';
    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: 'LV / CMR · ' + sous, large: true, bandeau: this._pbNav('lv') })}
      <div class="pb-barre"><div class="pb-barre-in">
        <div class="pb-ligne">
          <div class="sx-recherche pb-recherche">${_OT_SVG_LOUPE}
            <label for="lvp-q" class="sx-sr">Rechercher</label>
            <input id="lvp-q" type="search" placeholder="N° de LV, code, n° module, destinataire, commande…" value="${_otEsc(L.q)}" oninput="App.lvpRecherche(this.value)">
          </div>
          <button type="button" class="pb-bouton" onclick="App._lvpCharger(true)">${L.chargement ? 'Chargement…' : 'Actualiser'}</button>
        </div>
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
    const qn = this._lvpNum(q);
    const lignes = this._lvpLignes().filter(l => {
      if (L.filtre !== 'toutes' && l.statut !== L.filtre) return false;
      if (!q) return true;
      if (qn && this._lvpNum(l.row.numero) === qn) return true;
      const r = l.row;
      return [r.numero, r.destinataire, r.commande, r.marchandises_desc, r.conducteur, r.immat_moteur,
        ...l.mods.map(m => m.d.code), ...l.mods.map(m => m.d.codeModule), ...l.mods.map(m => m.d.chantier)]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
    if (!lignes.length) { el.innerHTML = '<div class="sx-carte"><div class="sx-vide">Aucune LV ne correspond.</div></div>'; return; }
    const entete = `<div class="pb-grille-lv pb-tete"><span>LV</span><span>Créée le</span><span>Destinataire</span><span>Modules</span>
      <span>Commande</span><span>Transport</span><span>Livraison</span><span>Statut</span><span>Actions</span></div>`;
    el.innerHTML = `<div class="pb-tableau"><div class="pb-interieur pb-interieur-lv">${entete}${lignes.map(l => this._lvpHtmlLigne(l)).join('')}</div></div>`;
    this._pbColsInit(el);
  },

  _lvpHtmlLigne(l) {
    const r = l.row, num = _otEsc(r.numero || '');
    const { grutage, commentaire } = this._lvuParseNote(r.note);
    const statut = {
      annulee: `<span class="pb-ot lvp-st-annulee" title="${_otEsc((r.annulation_motif || '') + (r.remplacee_par ? ' — remplacée par n° ' + r.remplacee_par : ''))}">Annulée</span>`,
      partie: '<span class="pb-ot lvp-st-partie">Partie</span>',
      apartir: '<span class="pb-ot lvp-st-apartir">À partir</span>',
    }[l.statut];
    const mods = l.mods.length
      ? l.mods.map(m => `<span class="lvp-mod${m.parti ? ' lvp-mod-parti' : ''}" title="${_otEsc([m.d.codeModule, m.d.module, m.d.chantier].filter(Boolean).join(' · '))}">${_otEsc(m.d.code)}</span>`).join('')
      : `<span class="pb-gris" title="${_otEsc(r.marchandises_desc || '')}">${_otEsc(r.marchandises_desc || '—')}</span>`;
    const actions = [
      r.pdfUrl ? `<a class="pb-doc" href="${_otEsc(r.pdfUrl)}" target="_blank" rel="noopener">PDF</a>` : '',
      l.statut === 'apartir' ? `<button type="button" class="lvp-btn" onclick="App.lvuModifier('${num}', 'prod')" title="Modifier la LV (même numéro) : modules, destinataire, transporteur, note…">Modifier</button>` : '',
      l.statut === 'apartir' ? `<button type="button" class="lvp-btn lvp-btn-rouge" onclick="App.openLvCancelModal('${num}')" title="Annuler la LV (reste dans l'historique, modules libérés)">Annuler…</button>` : '',
    ].join('');
    return `<div class="pb-grille-lv pb-ligne-module${l.statut !== 'apartir' ? ' pb-parti' : ''}">
      <span class="lvp-num"><b>${num}</b> <span class="lvp-type">${_otEsc(r.type || 'LV')}</span>${r.remplace ? `<small>remplace ${_otEsc(r.remplace)}</small>` : ''}</span>
      <span class="pb-gris2">${_otEsc(String(r.date || '').slice(0, 10))}</span>
      <span class="pb-texte" title="${_otEsc(r.destinataire || '')}">${_otEsc(r.destinataire || '—')}${commentaire || grutage ? `<small class="lvp-note" title="${_otEsc(commentaire)}">${grutage ? '<b>grutage</b> ' : ''}${_otEsc(commentaire)}</small>` : ''}</span>
      <span class="lvp-mods">${mods}</span>
      <span class="pb-gris2">${_otEsc(r.commande || '')}</span>
      <span class="pb-texte pb-gris2" title="${_otEsc([r.conducteur, r.immat_moteur].filter(Boolean).join(' · '))}">${_otEsc([r.conducteur, r.immat_moteur].filter(Boolean).join(' · ') || '')}</span>
      <span class="pb-gris2">${_otEsc(r.livraison_prevue || '')}</span>
      <span>${statut}</span>
      <span class="lvp-actions">${actions}</span>
    </div>`;
  },
});
