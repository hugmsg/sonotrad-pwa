/* ═══════════════════════════════════════════════════════════════════════════
   Production — tableau bureau (2026-11-17, maquette « Production LOXAM — refonte »)
   Une ligne par module, groupée par étape du Planning ; le Planning Google reste la référence :
   les étapes se changent dans le Sheet ou ici (`planning_etape`, qui écrit dans le Sheet, 2026-11-18). L'ancienne vue en cartes
   reste accessible (« Colonnes » → vue `departures`).
   Données : `production` + `archive` (Planning, déjà chargées par l'activité LOXAM) et
   `ot_liste` (fiches d'opérations : état, n° d'OT ; montant et documents pour les admins).
   ═══════════════════════════════════════════════════════════════════════════ */

// Les fiches d'opérations existent dans la PWA depuis la sortie d'essai : un module parti avant
// a son OT dans la matrice Excel, il n'est donc pas compté « parti sans OT ».
const PB_DEBUT_OT = '2026-11-16';
const PB_JOURS_PARTIS = 30;

const PB_ETAPES = [
  { cle: 'demarrer',   nom: 'À démarrer',     rang: 1 },
  { cle: 'atelier',    nom: 'Atelier',        rang: 2 },
  { cle: 'controle',   nom: 'Contrôle',       rang: 3 },
  { cle: 'termine',    nom: 'Terminés',       rang: 4 },
  { cle: 'pret',       nom: 'Prêts à partir', rang: 5 },
  { cle: 'decote',     nom: 'De côté',        rang: 0 },
  { cle: 'parti',      nom: 'Partis · ' + PB_JOURS_PARTIS + ' j', rang: 6 },
];

const _PB_SVG_DOSSIER = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>';
const _PB_SVG_CLE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.4-.4-2.4z"></path></svg>';
const _PB_SVG_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

Object.assign(App, {

  /* ─ Entrée ─ */
  // Carte « Production » du menu LOXAM : tableau sur grand écran, cartes sur téléphone — pour tout le monde
  // depuis le 2026-11-18 (avant : admins seulement). L'ancienne vue reste derrière « Colonnes ».
  prodEntree() { this.prodOuvrir(); },

  // Changer d'étape, ajouter au Planning, retirer du Planning : admins et activité LOXAM (2026-11-18).
  _pbPeutEtape() {
    const u = S.currentUser;
    return !!u && (u.role === 'admin' || (u.activites || []).includes('loxam'));
  },
  prodOuvrir() {
    S.pb = S.pb || { etapes: [], filtre: '', type: '', q: '', replies: {}, fiches: null, fichesChargement: false };
    // « À démarrer » replié à chaque ouverture (demande de Hugo, 18/11) : un clic sur son titre le déplie
    S.pb.replies = Object.assign({}, S.pb.replies, { demarrer: true });
    this.go('prod-bureau');
  },

  // Appelé par go('prod-bureau')
  async prodBureauInit() {
    S.pb = S.pb || { etapes: [], filtre: '', type: '', q: '', replies: {}, fiches: null, fichesChargement: false };
    this._pbRendre();
    const attentes = [];
    if (!S.depsLoaded && !S.depsLoading) attentes.push(this._pbChargerProduction());
    if (!S.archiveLoaded) attentes.push(this._pbChargerArchive());
    if (S.pb.fiches === null && !S.pb.fichesChargement && this._otAutorise()) attentes.push(this._pbChargerFiches());
    if (!attentes.length) return;
    await Promise.allSettled(attentes);
    this._pbRendre();
  },

  async prodActualiser() {
    S.depsLoaded = false; S.archiveLoaded = false; S.pb.fiches = null;
    this._pbRendre();
    await Promise.allSettled([this._pbChargerProduction(), this._pbChargerArchive(), this._otAutorise() ? this._pbChargerFiches() : null]);
    this._pbRendre();
  },

  async _pbChargerProduction() {
    S.depsLoading = true;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=production', {}, 90000);
      const d = await r.json();
      S.deps = Array.isArray(d) ? d : (d.data || []);
      S.depsLoaded = true;
    } catch (e) { this.toast('Production indisponible : ' + e.message, 4000); }
    finally { S.depsLoading = false; }
  },

  // Même source que l'onglet « Partis » ; on ne passe pas par loadArchive() qui dessine sa propre liste.
  async _pbChargerArchive() {
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=archive', {}, 60000);
      const d = await r.json();
      S.archive = Array.isArray(d) ? d : (d.data || []);
      S.archiveLoaded = true;
    } catch (e) { this.toast('Partis indisponibles : ' + e.message, 4000); }
  },

  async _pbChargerFiches() {
    S.pb.fichesChargement = true;
    try {
      const d = await this._otGet({ action: 'ot_liste' });
      S.pb.fiches = d.fiches || [];
      if (this._otSansOtMaj) this._otSansOtMaj(d.sans_ot);
      if (this._otExcelMaj) this._otExcelMaj(d.ot_excel);
    } catch (e) { S.pb.fiches = []; this.toast('Fiches d\'opérations indisponibles : ' + e.message, 4000); }
    finally { S.pb.fichesChargement = false; }
  },

  /* ─ Modèle : une ligne par module ─ */

  _pbEtape(d, parti) {
    if (parti) return 'parti';
    const s = d.status || {};
    if (s.deCote) return 'decote';
    if (s.termine) return (d.lv || d.commande) ? 'pret' : 'termine';
    if (s.aControler) return 'controle';
    if (s.enCours) return 'atelier';
    return 'demarrer';
  },

  // Fiche la plus utile d'un module : celle en cours avant les validées / envoyées, sinon la plus récente.
  _pbFichesParCode() {
    const idx = {};
    const ordre = { brouillon: 0, a_valider: 1, validee: 2, envoyee: 3 };
    (S.pb.fiches || []).forEach(f => {
      if (f.statut === 'annulee') return;
      const c = String(f.code_planning || '').toUpperCase();
      const x = idx[c];
      if (!x || (ordre[f.statut] ?? 9) < (ordre[x.statut] ?? 9)) idx[c] = f;
    });
    return idx;
  },

  _pbLignes() {
    const fiches = this._pbFichesParCode();
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const limitePartis = new Date(auj); limitePartis.setDate(limitePartis.getDate() - PB_JOURS_PARTIS);
    const debutOt = new Date(PB_DEBUT_OT);
    const ligne = (d, idx, parti) => {
      const code = String(d.code || '').toUpperCase();
      const etape = this._pbEtape(d, parti);
      const f = fiches[code] || null;
      const liv = d.livraisonPrevue ? new Date(d.livraisonPrevue) : null;
      const retard = !parti && liv && !isNaN(liv) && liv < auj;
      const fin = d.fin ? new Date(d.fin) : null;
      // OT attendue : module terminé (ou parti depuis la mise en service des fiches) sans fiche validée
      const otAttendue = ['termine', 'pret'].includes(etape) || (parti && fin && fin >= debutOt);
      const sansOt = !f && this._otSansOtDe ? this._otSansOtDe(code, d) : null;   // pas d'OT (marqué ou vente)
      const otExcel = !f && this._otExcelDe ? this._otExcelDe(code) : '';          // OT déjà fait dans l'Excel
      const otAFaire = !sansOt && !otExcel && otAttendue && (!f || f.statut === 'brouillon' || f.statut === 'a_valider');
      return { d, idx, parti, code, etape, fiche: f, retard, fin, otAFaire, sansOt, otExcel,
        otAEnvoyer: !!f && f.statut === 'validee' };
    };
    const actifs = (S.deps || []).map((d, i) => ligne(d, i, false));
    const partis = (S.archive || []).map((d, i) => ({ d, i }))
      .filter(x => { const f = x.d.fin ? new Date(x.d.fin) : null; return f && !isNaN(f) && f >= limitePartis; })
      .map(x => ligne(x.d, x.i, true));
    return [...actifs, ...partis];
  },

  _pbCorrespond(l) {
    const P = S.pb;
    if (P.type && (l.d.module || '').trim() !== P.type) return false;
    const q = P.q.trim().toLowerCase();
    if (q && ![l.d.code, l.d.codeModule, l.d.chantier, l.d.ag, l.d.module, l.d.lv, l.d.commande, l.fiche?.numero_ot, l.d.description]
      .some(v => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  },

  /* ─ Actions ─ */

  // Étapes cumulables (« Tous » = aucune étape choisie). Un filtre « À traiter » remplace les étapes, et inversement.
  prodOnglet(cle) {
    const E = S.pb.etapes = S.pb.etapes || [];
    if (cle === 'tous') E.length = 0;
    else { const i = E.indexOf(cle); if (i >= 0) E.splice(i, 1); else E.push(cle); }
    S.pb.filtre = '';
    this._pbRendre();
  },
  prodFiltre(cle) { S.pb.filtre = S.pb.filtre === cle ? '' : cle; S.pb.etapes = []; this._pbRendre(); },
  prodType(v) { S.pb.type = v; this._pbRendre(); },
  prodRecherche(v) {
    S.pb.q = v;
    clearTimeout(this._pbMinuterie);
    this._pbMinuterie = setTimeout(() => this._pbRendreCorps(), 120);
  },
  prodTravaux() {
    S.pb.desc = !S.pb.desc;
    try { localStorage.setItem('snt_pb_travaux', S.pb.desc ? '1' : '0'); } catch (e) { /* stockage indisponible */ }
    this._pbRendre();
  },
  prodReplier(cle) { S.pb.replies[cle] = !S.pb.replies[cle]; this._pbRendreCorps(); },
  prodColonnes() { this.go('departures'); },

  prodOuvrirModule(parti, idx) {
    if (parti) this.openArchiveDep(idx); else this.openDep(idx);
  },

  // Le lien vers le dossier du module est dans le Planning (colonne du code) : on le demande au clic.
  async prodDossier(code, parti) {
    const fen = window.open('', '_blank');
    try {
      const r = await _fetchWithTimeout(`${S.apiUrl}?action=drive_link&code=${encodeURIComponent(code)}&source=${parti ? 'archive' : 'production'}`, {}, 20000);
      const d = await r.json();
      if (d.status === 'ok' && d.lienDrive) { if (fen) fen.location.href = d.lienDrive; else window.open(d.lienDrive, '_blank'); return; }
      if (fen) fen.close();
      this.toast('Aucun dossier Drive trouvé pour ' + code);
    } catch (e) {
      if (fen) fen.close();
      this.toast('Dossier indisponible : ' + e.message, 4000);
    }
  },

  prodPoses(parti, idx) {
    const d = (parti ? S.archive : S.deps)[idx];
    if (!d) return;
    S.ot.retourFiche = 'prod-bureau';
    S.pb.fiches = null;                       // l'état de la fiche aura changé au retour
    this.otDepuisPose(d.code, d.codeModule || '', d.chantier || '');
  },

  prodOuvrirFiche(id) {
    S.ot.retourFiche = 'prod-bureau';
    S.activity = 'recond';
    S.pb.fiches = null;
    this.otOuvrirFiche(id);
  },

  /* ─ Rendu ─ */

  _pbRendre() {
    const el = document.getElementById('prod-bureau-root');
    if (!el) return;
    // Colonne « Travaux » (description du Planning) : affichée par défaut, choix mémorisé par appareil (2026-11-18)
    S.pb.sel = S.pb.sel || new Set();
    if (S.pb.desc === undefined) S.pb.desc = (() => { try { return localStorage.getItem('snt_pb_travaux') !== '0'; } catch (e) { return true; } })();
    if (S.pb.vue === 'arr') return this._pbArrRendre();
    const P = S.pb;
    const pret = S.depsLoaded;
    const lignes = pret ? this._pbLignes() : [];
    const base = lignes.filter(l => this._pbCorrespond(l));
    const nb = cle => base.filter(l => l.etape === cle).length;
    const surParc = lignes.filter(l => !l.parti).length;
    const admin = this._otAdmin();
    const fichesOk = Array.isArray(P.fiches);
    const comptes = {
      retard: base.filter(l => l.retard).length,
      otAFaire: base.filter(l => l.otAFaire && !l.parti).length,
      otAEnvoyer: base.filter(l => l.otAEnvoyer).length,
      partisSansOt: base.filter(l => l.otAFaire && l.parti).length,
      annoncer: base.filter(l => this._pbAAnnoncer(l)).length,
    };
    const types = [...new Set(lignes.map(l => (l.d.module || '').trim()).filter(Boolean))].sort();
    const etapes = P.etapes || [];
    const actif = cle => !P.filtre && (cle === 'tous' ? !etapes.length : etapes.includes(cle));
    const onglet = (cle, nom, n) => `<button type="button" class="pb-onglet" aria-pressed="${actif(cle)}" onclick="App.prodOnglet('${cle}')">${_otEsc(nom)} <b>${n}</b></button>`;
    const puce = (cle, n, texte, classe) => n ? `<button type="button" class="pb-puce pb-puce-${classe}" aria-pressed="${P.filtre === cle}" onclick="App.prodFiltre('${cle}')">${n} ${texte}</button>` : '';
    const maj = pret ? 'à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'chargement…';

    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: (pret ? surParc + ' modules sur parc · ' : '') + maj, large: true, bandeau: this._pbNav('prod') })}
      <div class="pb-barre"><div class="pb-barre-in">
        <div class="pb-ligne">
          <div class="sx-recherche pb-recherche">${_OT_SVG_LOUPE}
            <label for="pb-q" class="sx-sr">Rechercher</label>
            <input id="pb-q" type="search" placeholder="Code, n° module, agence, chantier, n° OT, LV…" value="${_otEsc(P.q)}" oninput="App.prodRecherche(this.value)">
          </div>
          <label for="pb-type" class="pb-etiquette pb-sans-tel">Type</label>
          <select id="pb-type" class="pb-select" onchange="App.prodType(this.value)">
            <option value="">Tous</option>${types.map(t => `<option${P.type === t ? ' selected' : ''}>${_otEsc(t)}</option>`).join('')}
          </select>
          <div class="pb-bascule" role="group" aria-label="Affichage">
            <button type="button" aria-pressed="true">Tableau</button>
            <button type="button" aria-pressed="false" onclick="App.prodColonnes()">Colonnes</button>
          </div>
          <button type="button" class="pb-bouton" aria-pressed="${!!P.desc}" onclick="App.prodTravaux()" title="Afficher ou masquer la description des travaux (Planning, colonne G)">Travaux</button>
          <button type="button" class="pb-bouton" onclick="App.prodActualiser()">Actualiser</button>
          ${this._pbPeutEtape() ? '<button type="button" class="sx-btn sx-btn-principal pb-btn-ajout" onclick="App.prodFenetreAjout()">+ Ajouter<span class="pb-sans-tel"> au Planning</span></button>' : ''}
        </div>
        <div class="pb-ligne pb-defile" role="group" aria-label="Étapes">
          ${onglet('tous', 'Tous', base.filter(l => !l.parti).length)}
          ${PB_ETAPES.map(e => onglet(e.cle, e.nom, S.archiveLoaded || e.cle !== 'parti' ? nb(e.cle) : '…')).join('')}
        </div>
        <div class="pb-ligne pb-defile">
          <span class="pb-etiquette">À traiter :</span>
          ${puce('retard', comptes.retard, 'en retard', 'rouge')}
          ${fichesOk ? puce('otAFaire', comptes.otAFaire, 'OT à faire', 'jaune') : ''}
          ${fichesOk ? puce('otAEnvoyer', comptes.otAEnvoyer, 'OT à envoyer à LOXAM', 'bleu') : ''}
          ${fichesOk ? puce('partisSansOt', comptes.partisSansOt, 'partis sans OT', 'violet') : ''}
          ${puce('annoncer', comptes.annoncer, 'à annoncer (mail de dispo)', 'vert')}
          ${!this._otAutorise() ? '<span class="sx-aide">(état des OT : accès « Reconditionnement »)</span>' : (P.fichesChargement ? '<span class="sx-aide">état des OT…</span>' : '')}
          ${pret && !comptes.retard && !comptes.annoncer && !(fichesOk && (comptes.otAFaire || comptes.otAEnvoyer || comptes.partisSansOt)) ? '<span class="sx-aide">rien</span>' : ''}
        </div>
      </div></div>
      <main class="pb-contenu" id="pb-corps"></main>
      <div class="pb-actions" id="pb-actions" hidden></div>
    </div>`;
    this._pbRendreCorps();
  },

  _pbRendreCorps() {
    const el = document.getElementById('pb-corps');
    if (!el) return;
    const P = S.pb;
    if (!S.depsLoaded) { el.innerHTML = '<div class="sx-chargement">Chargement du Planning…</div>'; return; }
    const admin = this._otAdmin();
    let lignes = this._pbLignes().filter(l => this._pbCorrespond(l));
    if (P.filtre === 'retard') lignes = lignes.filter(l => l.retard);
    else if (P.filtre === 'otAFaire') lignes = lignes.filter(l => l.otAFaire && !l.parti);
    else if (P.filtre === 'otAEnvoyer') lignes = lignes.filter(l => l.otAEnvoyer);
    else if (P.filtre === 'partisSansOt') lignes = lignes.filter(l => l.otAFaire && l.parti);
    else if (P.filtre === 'annoncer') lignes = lignes.filter(l => this._pbAAnnoncer(l));
    else if ((P.etapes || []).length) lignes = lignes.filter(l => P.etapes.includes(l.etape));
    // « Tous » : le parc, plus les partis encore sans OT (départs précipités) pour ne pas les perdre de vue
    else lignes = lignes.filter(l => !l.parti || l.otAFaire);

    const ordre = ['demarrer', 'atelier', 'controle', 'termine', 'pret', 'decote', 'parti'];
    const groupes = ordre.map(cle => {
      const e = PB_ETAPES.find(x => x.cle === cle);
      let titre = e.nom;
      if (cle === 'parti' && !(P.etapes || []).length && !P.filtre) titre = 'Partis sans OT (départs précipités)';
      const ls = lignes.filter(l => l.etape === cle);
      ls.sort((a, b) => (b.retard - a.retard) || String(a.d.debut || '').localeCompare(String(b.d.debut || '')));
      if (cle === 'parti') ls.sort((a, b) => (b.fin || 0) - (a.fin || 0));
      return { cle, titre, ls };
    }).filter(g => g.ls.length);

    S.pb.visibles = groupes.flatMap(g => P.replies[g.cle] ? [] : g.ls.map(l => l.code));
    setTimeout(() => this._pbMajActions(), 0);
    if (!groupes.length) { el.innerHTML = '<div class="sx-carte"><div class="sx-vide">Aucun module ne correspond.</div></div>'; return; }

    if (this._pbEtroit()) {
      el.innerHTML = `<div class="pb-cartes">${groupes.map(g => `
        <button type="button" class="pb-groupe pb-g-${g.cle}" aria-expanded="${!P.replies[g.cle]}" onclick="App.prodReplier('${g.cle}')">
          ${_PB_SVG_CHEVRON}<span>${_otEsc(g.titre)}</span><span class="pb-groupe-n">${g.ls.length} module${g.ls.length > 1 ? 's' : ''}</span>
        </button>
        ${P.replies[g.cle] ? '' : g.ls.map(l => this._pbHtmlCarte(l, admin)).join('')}`).join('')}</div>`;
      return;
    }

    const sel = this._pbPeutSel();
    const entete = `<div class="pb-grille pb-tete"><span class="pb-code-cell">${sel ? `<input type="checkbox" class="pb-sel" id="pb-sel-tout" aria-label="Tout sélectionner (lignes affichées)" onclick="App.prodSelTout(this.checked)">` : ''}Code</span><span>N° module</span><span>Type</span><span>Agence · chantier</span>${P.desc ? '<span>Travaux</span>' : ''}
      <span>Étape</span><span>Durée</span><span>Livraison</span><span>OT</span><span title="Fournitures sorties du stock">Stock</span><span class="pb-droite">${admin ? 'Montant' : ''}</span><span>${admin ? 'Documents' : ''}</span><span>Fiche</span></div>`;
    el.innerHTML = `<div class="pb-tableau${P.desc ? ' pb-avec-desc' : ''}"><div class="pb-interieur">${entete}${groupes.map(g => `
      <button type="button" class="pb-groupe pb-g-${g.cle}" aria-expanded="${!P.replies[g.cle]}" onclick="App.prodReplier('${g.cle}')">
        ${_PB_SVG_CHEVRON}<span>${_otEsc(g.titre)}</span><span class="pb-groupe-n">${g.ls.length} module${g.ls.length > 1 ? 's' : ''}</span>
      </button>
      ${P.replies[g.cle] ? '' : g.ls.map(l => this._pbHtmlLigne(l, admin)).join('')}`).join('')}</div></div>`;
  },

  _pbHtmlLigne(l, admin) {
    const d = l.d, f = l.fiche;
    const rang = (PB_ETAPES.find(e => e.cle === l.etape) || {}).rang || 0;
    const barre = [1, 2, 3, 4, 5, 6].map(i => `<span class="pb-seg${i <= rang ? ' pb-seg-' + rang : ''}"></span>`).join('');
    const nomEtape = l.etape === 'decote' ? 'De côté' : (PB_ETAPES.find(e => e.cle === l.etape) || {}).nom;
    const duree = l.parti ? 'fini le ' + _fmtDateShort(d.fin) : _duration(d.debut, null);
    const liv = d.livraisonPrevue ? _fmtDateShort(d.livraisonPrevue) : '—';
    let ot = '<span class="pb-gris">—</span>';
    if (Array.isArray(S.pb.fiches)) {
      if (f) {
        const lib = { brouillon: 'Fiche en cours', a_valider: 'Fiche à valider' }[f.statut];
        ot = `<button type="button" class="pb-ot pb-ot-${_otEsc(f.statut)}" onclick="App.prodOuvrirFiche(${Number(f.id)})" title="Ouvrir la fiche d'opérations">${_otEsc(lib || f.numero_ot || 'Validée')}${f.statut === 'validee' ? ' · à envoyer' : ''}</button>`;
      } else ot = this._pbHtmlOtSansFiche(l, true);
    }
    const docs = (admin && f && f.documents) ? (() => {
      const pdf = (f.documents.fichiers || []).find(x => x.type === 'pdf');
      return `${pdf && pdf.url ? `<a class="pb-doc" href="${_otEsc(pdf.url)}" target="_blank" rel="noopener">PDF</a>` : ''}
        ${f.documents.dossier ? `<a class="pb-doc" href="${_otEsc(f.documents.dossier)}" target="_blank" rel="noopener">Dossier OT</a>` : ''}`;
    })() : '';
    const code = _otEsc(d.code || '');
    return `<div class="pb-grille pb-ligne-module${l.retard ? ' pb-retard' : ''}${l.parti ? ' pb-parti' : ''}">
      <span class="pb-code-cell">${this._pbHtmlCase(l)}<button type="button" class="pb-code" onclick="App.prodDossier('${code}', ${l.parti})" title="Ouvrir le dossier du module (photos, papiers d'arrivée et de départ)">${_PB_SVG_DOSSIER}${code}</button></span>
      <button type="button" class="pb-numero" onclick="App.prodOuvrirModule(${l.parti}, ${l.idx})" title="Ouvrir la fiche du module">${_otEsc(d.codeModule || '—')}</button>
      <span class="pb-type">${_otEsc(d.module || '')}</span>
      ${this._pbHtmlAgence(l, `${_otEsc(d.chantier || '')}${d.status && d.status.grutage ? ' <span class="pb-grutage">grutage</span>' : ''}`)}
      ${S.pb.desc ? `<button type="button" class="pb-texte pb-desc" onclick="App.prodOuvrirModule(${l.parti}, ${l.idx})" title="${_otEsc(d.description || '')}">${d.description ? _otEsc(d.description) : '<span class="pb-gris">—</span>'}</button>` : ''}
      ${this._pbHtmlEtape(l, admin, barre, nomEtape)}
      <span class="pb-gris2 pb-duree">${l.parti ? '' : `<span class="pb-annonce-place">${this._pbHtmlAnnonce(l)}</span>`}${_otEsc(duree)}</span>
      <span class="${l.retard ? 'pb-rouge' : (d.livraisonPrevue ? '' : 'pb-gris')}">${_otEsc(liv)}</span>
      <span class="pb-ot-cell">${ot}</span>
      <span>${this._pbHtmlStock(f)}</span>
      <span class="pb-droite pb-montant">${admin && f && f.total_ht !== undefined && f.total_ht !== null && f.statut !== 'brouillon' ? _otEuros(f.total_ht) : ''}</span>
      <span class="pb-docs">${docs}</span>
      <button type="button" class="pb-poses" onclick="App.prodPoses(${l.parti}, ${l.idx})" title="Fiche d'opérations : saisir les poses">${_PB_SVG_CLE}Poses</button>
    </div>`;
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   Arrivées (historique) — onglet « Arrivées » du Planning : tout le parc, sur place et parti,
   croisé avec le Planning (étape, LV de départ, chantier) et les fiches d'opérations.
   Source : `arrivals` sans scope (toutes les lignes), déjà servie par masterfile.
   ═══════════════════════════════════════════════════════════════════════════ */

const PB_MOIS_PAR_PAGE = 3;

Object.assign(App, {

  _pbNav(actif) {
    const b = (cle, texte) => `<button type="button" class="pb-nav-btn" aria-pressed="${actif === cle}" onclick="App.prodVue('${cle}')">${texte}</button>`;
    return `<nav class="pb-nav" aria-label="Vues">${b('prod', 'Production')}${b('arr', 'Arrivées (historique)')}</nav>`;
  },

  prodVue(v) {
    S.pb.vue = v;
    this._pbRendre();
    if (v === 'arr') this._pbArrCharger();
    else this.prodBureauInit();
  },

  async _pbArrCharger(force = false) {
    const A = S.pb.arr = S.pb.arr || { donnees: null, chargement: false, statuts: [], annee: '', agence: '', type: '', q: '', mois: PB_MOIS_PAR_PAGE };
    const attentes = [];
    if ((force || !A.donnees) && !A.chargement) {
      A.chargement = true;
      attentes.push((async () => {
        try {
          const r = await _fetchWithTimeout(S.apiUrl + '?action=arrivals', {}, 90000);
          const d = await r.json();
          A.donnees = Array.isArray(d) ? d : (d.data || []);
          A.resume = (d && d.summary && Object.keys(d.summary).length) ? d.summary : null;   // totaux par type du Sheet (lignes 4-5)
        } catch (e) { this.toast('Arrivées indisponibles : ' + e.message, 4000); A.donnees = A.donnees || []; }
        finally { A.chargement = false; }
      })());
    }
    if (force || (!S.depsLoaded && !S.depsLoading)) attentes.push(this._pbChargerProduction());
    if (force || !S.archiveLoaded) attentes.push(this._pbChargerArchive());
    if ((force || S.pb.fiches === null) && !S.pb.fichesChargement && this._otAutorise()) attentes.push(this._pbChargerFiches());
    if (!attentes.length) return;
    this._pbRendre();
    await Promise.allSettled(attentes);
    this._pbRendre();
  },

  prodArr(champ, v) {
    const A = S.pb.arr;
    A[champ] = v;
    A.mois = PB_MOIS_PAR_PAGE;
    if (champ === 'q') { clearTimeout(this._pbMinuterie); this._pbMinuterie = setTimeout(() => this._pbArrRendreCorps(), 120); return; }
    this._pbRendre();
  },
  // Statuts cumulables (« Toutes » = aucun choisi)
  prodArrStatut(cle) {
    const A = S.pb.arr, E = A.statuts = A.statuts || [];
    if (cle === 'tous') E.length = 0;
    else { const i = E.indexOf(cle); if (i >= 0) E.splice(i, 1); else E.push(cle); }
    A.mois = PB_MOIS_PAR_PAGE;
    this._pbRendre();
  },
  prodArrType(t) { const A = S.pb.arr; A.type = A.type === t ? '' : t; A.mois = PB_MOIS_PAR_PAGE; this._pbRendre(); },
  prodArrPlus() { S.pb.arr.mois += PB_MOIS_PAR_PAGE; this._pbArrRendreCorps(); },

  // Une ligne par arrivée, avec ce que le Planning et les fiches en disent
  _pbArrLignes() {
    const A = S.pb.arr;
    const actifs = new Map((S.deps || []).map((d, i) => [String(d.code || '').toUpperCase(), { d, i }]));
    const partis = new Map((S.archive || []).map((d, i) => [String(d.code || '').toUpperCase(), { d, i }]));
    const fiches = this._pbFichesParCode();
    const debutOt = new Date(PB_DEBUT_OT);
    return (A.donnees || []).map(a => {
      const code = String(a.code || '').toUpperCase();
      const act = actifs.get(code), par = partis.get(code);
      const pl = act || par || null;
      const parti = !!par || (!act && !!a.isParti);
      const date = a.dateArrivee ? new Date(a.dateArrivee) : null;
      const f = fiches[code] || null;
      const fin = par && par.d.fin ? new Date(par.d.fin) : null;
      const sansOt = !f && this._otSansOtDe ? this._otSansOtDe(code, pl ? pl.d : null) : null;
      const otExcel = !f && this._otExcelDe ? this._otExcelDe(code) : '';
      const otAFaire = !sansOt && !otExcel && !!par && fin && !isNaN(fin) && fin >= debutOt && (!f || f.statut === 'brouillon' || f.statut === 'a_valider');
      let statut;
      if (act) statut = { texte: 'Sur parc · ' + ((PB_ETAPES.find(e => e.cle === this._pbEtape(act.d, false)) || {}).nom || ''), classe: 'parc' };
      else if (parti) statut = { texte: 'Parti', classe: 'parti' };
      else statut = { texte: 'Pas au Planning', classe: 'horsplanning' };
      return { a, code, date: date && !isNaN(date) ? date : null, pl, parti, statut, fiche: f, otAFaire, sansOt, otExcel,
        horsPlanning: !pl && !a.isParti };
    });
  },

  _pbArrFiltrees(lignes, sansStatut = false) {
    const A = S.pb.arr;
    const q = A.q.trim().toLowerCase();
    return lignes.filter(l => {
      if (A.annee && (!l.date || String(l.date.getFullYear()) !== A.annee)) return false;
      if (A.agence && (l.a.agence || '') !== A.agence) return false;
      if (A.type && (l.a.type || '') !== A.type) return false;
      if (q && ![l.a.code, l.a.numModule, l.a.agence, l.a.destination, l.a.lv, l.pl?.d.chantier, l.pl?.d.lv, l.fiche?.numero_ot, l.a.numSerie]
        .some(v => String(v || '').toLowerCase().includes(q))) return false;
      const st = A.statuts || [];
      if (sansStatut || !st.length) return true;
      return (st.includes('parc') && !l.parti && !l.horsPlanning)
        || (st.includes('partis') && l.parti)
        || (st.includes('horsplanning') && l.horsPlanning)
        || (st.includes('sansot') && l.otAFaire);
    });
  },

  _pbArrRendre() {
    const el = document.getElementById('prod-bureau-root');
    if (!el) return;
    if (!S.pb.arr) S.pb.arr = { donnees: null, chargement: false, statuts: [], annee: '', agence: '', type: '', q: '', mois: PB_MOIS_PAR_PAGE };
    const A = S.pb.arr;
    const pret = !!A.donnees && S.depsLoaded;
    const toutes = pret ? this._pbArrLignes() : [];
    const base = this._pbArrFiltrees(toutes, true);
    const annees = [...new Set(toutes.map(l => l.date && l.date.getFullYear()).filter(Boolean))].sort((a, b) => b - a);
    const agences = [...new Set(toutes.map(l => l.a.agence).filter(Boolean))].sort();
    const types = [...new Set(toutes.map(l => l.a.type).filter(Boolean))].sort();
    const n = {
      tous: base.length,
      parc: base.filter(l => !l.parti && !l.horsPlanning).length,
      partis: base.filter(l => l.parti).length,
      horsplanning: base.filter(l => l.horsPlanning).length,
      sansot: base.filter(l => l.otAFaire).length,
    };
    const st = A.statuts || [];
    const onglet = (cle, nom) => `<button type="button" class="pb-onglet" aria-pressed="${cle === 'tous' ? !st.length : st.includes(cle)}" onclick="App.prodArrStatut('${cle}')">${nom} <b>${pret ? n[cle] : '…'}</b></button>`;
    // Totaux sur parc par type : ceux du Sheet (lignes 4-5 d'Arrivées), sinon recomptés (arrivées non parties)
    let totaux = A.resume ? Object.entries(A.resume) : null;
    if (!totaux && pret) {
      const c = {};
      toutes.filter(l => !l.parti).forEach(l => { const t = l.a.type || '?'; c[t] = (c[t] || 0) + 1; });
      totaux = Object.entries(c);
    }
    totaux = (totaux || []).filter(([, v]) => Number(v) > 0);   // ordre des colonnes du Sheet
    const totalParc = totaux.reduce((t, [, v]) => t + Number(v), 0);
    const select = (champ, id, libelle, options, tous) => `<label for="${id}" class="pb-etiquette">${libelle}</label>
      <select id="${id}" class="pb-select" onchange="App.prodArr('${champ}', this.value)">
        <option value="">${tous}</option>${options.map(o => `<option${String(A[champ]) === String(o) ? ' selected' : ''}>${_otEsc(o)}</option>`).join('')}
      </select>`;
    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: pret ? toutes.length + ' arrivées enregistrées' : 'chargement des arrivées…', large: true, bandeau: this._pbNav('arr') })}
      <div class="pb-barre"><div class="pb-barre-in">
        <div class="pb-ligne">
          <div class="sx-recherche pb-recherche">${_OT_SVG_LOUPE}
            <label for="pb-aq" class="sx-sr">Rechercher</label>
            <input id="pb-aq" type="search" placeholder="Code, n° module, n° de série, agence, chantier, LV, n° OT…" value="${_otEsc(A.q)}" oninput="App.prodArr('q', this.value)">
          </div>
          ${select('annee', 'pb-an', 'Année', annees, 'Toutes')}
          ${select('agence', 'pb-ag', 'Provenance', agences, 'Toutes')}
          ${select('type', 'pb-ty', 'Type', types, 'Tous')}
          <button type="button" class="pb-bouton" onclick="App._pbArrCharger(true)">Actualiser</button>
        </div>
        <div class="pb-ligne pb-defile" role="group" aria-label="Statut">
          ${onglet('tous', 'Toutes')}${onglet('parc', 'Sur parc')}${onglet('partis', 'Partis')}
          ${n.horsplanning || !pret ? onglet('horsplanning', 'Pas au Planning') : ''}
          ${Array.isArray(S.pb.fiches) && n.sansot ? onglet('sansot', 'Partis sans OT') : ''}
        </div>
        ${totaux.length ? `<div class="pb-ligne pb-defile pb-totaux" role="group" aria-label="Sur parc par type">
          <span class="pb-etiquette">Sur parc par type :</span>
          ${totaux.map(([t, v]) => `<button type="button" class="pb-total" aria-pressed="${A.type === t}" onclick="App.prodArrType('${_otEsc(t).replace(/'/g, '&#39;')}')" title="Filtrer sur ${_otEsc(t)}">${_otEsc(t)} <b>${Number(v)}</b></button>`).join('')}
          <span class="pb-total pb-total-somme">Total <b>${totalParc}</b></span>
        </div>` : ''}
      </div></div>
      <main class="pb-contenu" id="pb-corps"></main>
    </div>`;
    this._pbArrRendreCorps();
  },

  _pbArrRendreCorps() {
    const el = document.getElementById('pb-corps');
    if (!el) return;
    const A = S.pb.arr;
    if (!A.donnees || !S.depsLoaded) { el.innerHTML = '<div class="sx-chargement">Chargement des arrivées…</div>'; return; }
    const lignes = this._pbArrFiltrees(this._pbArrLignes());
    if (!lignes.length) { el.innerHTML = '<div class="sx-carte"><div class="sx-vide">Aucune arrivée ne correspond.</div></div>'; return; }
    // Groupes par mois d'arrivée, du plus récent au plus ancien ; les arrivées sans date à la fin
    const groupes = [];
    const parCle = {};
    lignes.slice().sort((a, b) => (b.date || 0) - (a.date || 0)).forEach(l => {
      const cle = l.date ? l.date.getFullYear() + '-' + String(l.date.getMonth() + 1).padStart(2, '0') : 'sans';
      if (!parCle[cle]) {
        const titre = l.date ? l.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'Sans date d\'arrivée';
        parCle[cle] = { cle, titre, ls: [] };
        groupes.push(parCle[cle]);
      }
      parCle[cle].ls.push(l);
    });
    const visibles = groupes.slice(0, A.mois);
    const admin = this._otAdmin();
    const entete = `<div class="pb-grille-arr pb-tete"><span>Code</span><span>N° module</span><span>Type</span><span>Arrivée</span><span>Provenance</span>
      <span>Statut</span><span>LV départ</span><span>Chantier · destination</span><span>OT</span><span>${admin ? 'Documents' : ''}</span><span>Fiche</span></div>`;
    el.innerHTML = `<div class="pb-tableau"><div class="pb-interieur">${entete}${visibles.map(g => `
      <button type="button" class="pb-groupe pb-g-demarrer" aria-expanded="${!S.pb.replies['m' + g.cle]}" onclick="App.prodReplier('m${g.cle}')">
        ${_PB_SVG_CHEVRON}<span>${_otEsc(g.titre)}</span><span class="pb-groupe-n">${g.ls.length} arrivée${g.ls.length > 1 ? 's' : ''}</span>
      </button>
      ${S.pb.replies['m' + g.cle] ? '' : g.ls.map(l => this._pbArrHtmlLigne(l, admin)).join('')}`).join('')}
      ${groupes.length > visibles.length ? `<button type="button" class="pb-plus" onclick="App.prodArrPlus()">Afficher les mois précédents (${groupes.length - visibles.length} de plus)</button>` : ''}
    </div></div>`;
  },

  _pbArrHtmlLigne(l, admin) {
    const a = l.a, f = l.fiche, pl = l.pl ? l.pl.d : null;
    let ot = '<span class="pb-gris">—</span>';
    if (Array.isArray(S.pb.fiches)) {
      if (f) {
        const lib = { brouillon: 'Fiche en cours', a_valider: 'Fiche à valider' }[f.statut];
        ot = `<button type="button" class="pb-ot pb-ot-${_otEsc(f.statut)}" onclick="App.prodOuvrirFiche(${Number(f.id)})" title="Ouvrir la fiche d'opérations">${_otEsc(lib || f.numero_ot || 'Validée')}</button>`;
      } else ot = this._pbHtmlOtSansFiche(l, false);
    }
    const docs = (admin && f && f.documents) ? (() => {
      const pdf = (f.documents.fichiers || []).find(x => x.type === 'pdf');
      return `${pdf && pdf.url ? `<a class="pb-doc" href="${_otEsc(pdf.url)}" target="_blank" rel="noopener">PDF</a>` : ''}
        ${f.documents.dossier ? `<a class="pb-doc" href="${_otEsc(f.documents.dossier)}" target="_blank" rel="noopener">Dossier OT</a>` : ''}`;
    })() : '';
    const code = _otEsc(a.code || '');
    const dest = (pl && pl.chantier) || a.destination || '';
    const numero = pl
      ? `<button type="button" class="pb-numero" onclick="App.prodOuvrirModule(${l.pl === null ? false : !!(S.archive || []).includes(pl)}, ${l.pl.i})" title="Ouvrir la fiche du module">${_otEsc(a.numModule || pl.codeModule || '—')}</button>`
      : `<span class="pb-numero">${_otEsc(a.numModule || '—')}</span>`;
    const poses = `<button type="button" class="pb-poses" onclick="App.prodPosesCode('${code}', '${_otEsc(a.numModule || '')}')" title="Fiche d'opérations : saisir les poses">${_PB_SVG_CLE}Poses</button>`;
    return `<div class="pb-grille-arr pb-ligne-module${l.parti ? ' pb-parti' : ''}">
      <button type="button" class="pb-code" onclick="App.prodDossierArrivee('${code}')" title="Ouvrir le dossier du module (photos, papiers d'arrivée et de départ)">${_PB_SVG_DOSSIER}${code}</button>
      ${numero}
      <span class="pb-type">${_otEsc(a.type || '')}</span>
      <span class="pb-gris2">${l.date ? _otEsc(l.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })) : '—'}</span>
      <span class="pb-texte" title="${_otEsc(a.agence || '')}">${_otEsc(a.agence || '')}</span>
      <span><span class="pb-statut pb-statut-${l.statut.classe}">${_otEsc(l.statut.texte)}</span></span>
      <span class="pb-gris2">${_otEsc((pl && pl.lv) || '')}</span>
      <span class="pb-texte" title="${_otEsc(dest)}">${_otEsc(dest)}</span>
      <span>${ot}</span>
      <span class="pb-docs">${docs}</span>
      ${poses}
    </div>`;
  },

  // Dossier depuis l'onglet Arrivées : le lien est sur le code de l'onglet Arrivées du Planning
  async prodDossierArrivee(code) {
    const fen = window.open('', '_blank');
    try {
      const r = await _fetchWithTimeout(`${S.apiUrl}?action=drive_link&code=${encodeURIComponent(code)}&source=arrivals`, {}, 20000);
      const d = await r.json();
      if (d.status === 'ok' && d.lienDrive) { if (fen) fen.location.href = d.lienDrive; else window.open(d.lienDrive, '_blank'); return; }
      if (fen) fen.close();
      this.toast('Aucun dossier Drive trouvé pour ' + code);
    } catch (e) {
      if (fen) fen.close();
      this.toast('Dossier indisponible : ' + e.message, 4000);
    }
  },

  prodPosesCode(code, numModule) {
    S.ot.retourFiche = 'prod-bureau';
    S.pb.fiches = null;
    this.otDepuisPose(code, numModule || '', '');
  },
});

/* ─ Ajout au Planning (2026-11-17 ; admins + activité LOXAM depuis le 2026-11-18) : un seul bouton dans Production ; on tape le code planning,
   vérifié contre les Arrivées sur parc (et absent du Planning), code demande en option.
   Écriture : action `planning_ajouter` de masterfile (refait les effets du déclencheur du Sheet). ─ */
Object.assign(App, {

  // Arrivées sur parc (même source que l'écran Arrivées de LOXAM) : chargées à la demande
  async _pbArriveesSurParc() {
    if (S.arrivalsLoaded && Array.isArray(S.arrivalsData)) return S.arrivalsData;
    const r = await _fetchWithTimeout(S.apiUrl + '?action=arrivals&scope=active', {}, 50000);
    const d = await r.json();
    return Array.isArray(d) ? d : (d.data || []);
  },

  async prodFenetreAjout() {
    // F.modules : [{code, type, numModule, dem (demande choisie ou null)}] ; F.ouvert : module dont la liste des demandes est ouverte
    const F = { modules: [], arrivees: null, demandes: null, ouvert: null, qDem: '', sugg: [] };
    const norm = v => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre" role="dialog" aria-modal="true" aria-labelledby="pb-aj-titre">
      <h3 id="pb-aj-titre">Ajouter au Planning</h3>
      <div class="pb-aj-recherche">
        <label for="pb-aj-code" class="pb-etiquette">Module (code planning ou n° de module)</label>
        <input id="pb-aj-code" class="sx-champ" type="search" autocomplete="off" autocapitalize="characters" placeholder="Tapez quelques caractères…"
          role="combobox" aria-expanded="false" aria-controls="pb-aj-sugg" aria-autocomplete="list">
        <div id="pb-aj-sugg" class="pb-aj-sugg" role="listbox" aria-label="Arrivées sur parc"></div>
      </div>
      <div id="pb-aj-msg" class="sx-aide" role="status">Chargement des arrivées sur parc…</div>
      <div class="pb-aj-liste" id="pb-aj-liste"></div>
      <div class="pb-champs">
        <label>Code agence<input id="pb-aj-agence" class="sx-champ" inputmode="numeric" placeholder="vide = LIBRE"></label>
        <label>Livraison prévue<input id="pb-aj-liv" class="sx-champ" type="date"></label>
        <label class="pb-large">Description des travaux<input id="pb-aj-desc" class="sx-champ" placeholder="ex. STANDARD PORTE ET FENETRE PIGNON + BOITE DE DERIVATION"></label>
      </div>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
        <button type="button" class="sx-btn sx-btn-principal" data-r="1" disabled>Ajouter</button>
      </div></div>`;
    const $ = sel => voile.querySelector(sel);
    const message = (texte, erreur) => { const m = $('#pb-aj-msg'); m.textContent = texte; m.classList.toggle('pb-erreur', !!erreur); };
    const dansPlanning = code => (S.deps || []).some(d => norm(d.code) === code);
    const dateCourte = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''; };

    // ── Recherche en direct dans les arrivées sur parc ──
    const chercher = () => {
      const q = norm($('#pb-aj-code').value);
      const el = $('#pb-aj-sugg');
      F.sugg = [];
      if (!q || !F.arrivees) { el.innerHTML = ''; $('#pb-aj-code').setAttribute('aria-expanded', 'false'); return; }
      const deja = new Set(F.modules.map(m => m.code));
      const trouves = F.arrivees.filter(a => norm(a.code).includes(q) || norm(a.numModule).includes(q));
      F.sugg = trouves.filter(a => !dansPlanning(norm(a.code)) && !deja.has(norm(a.code))).slice(0, 8);
      const exclus = trouves.filter(a => dansPlanning(norm(a.code)) || deja.has(norm(a.code))).slice(0, 3);
      el.innerHTML = F.sugg.map((a, i) => `<button type="button" class="pb-aj-sug" role="option" data-sug="${i}">
          <b>${_otEsc(a.code)}</b><span>${_otEsc([a.type, a.numModule].filter(Boolean).join(' · '))}</span>
          <span class="sx-aide">${_otEsc([a.dateArrivee ? 'arrivé le ' + dateCourte(a.dateArrivee) : '', a.agence].filter(Boolean).join(' · '))}</span></button>`).join('')
        + exclus.map(a => `<div class="pb-aj-sug pb-aj-sug-non"><b>${_otEsc(a.code)}</b><span>${_otEsc([a.type, a.numModule].filter(Boolean).join(' · '))}</span>
          <span class="sx-aide">${deja.has(norm(a.code)) ? 'déjà choisi' : 'déjà au Planning'}</span></div>`).join('')
        + (!trouves.length ? '<div class="pb-aj-sug pb-aj-sug-non"><span class="sx-aide">Aucune arrivée sur parc ne correspond (module parti ou pas encore arrivé ?)</span></div>' : '');
      $('#pb-aj-code').setAttribute('aria-expanded', 'true');
    };
    const ajouterModule = a => {
      F.modules.push({ code: norm(a.code), type: a.type || '', numModule: a.numModule || '', dem: null });
      $('#pb-aj-code').value = '';
      chercher();
      message('', false);
      dessiner();
      $('#pb-aj-code').focus();
    };

    // ── Modules choisis, avec leur demande ──
    const htmlDemandes = m => {
      if (!F.demandes) return '<div class="sx-aide">Chargement des demandes…</div>';
      const prises = new Set(F.modules.filter(x => x.dem && x !== m).map(x => x.dem.code));
      const q = F.qDem.trim().toLowerCase();
      const liste = F.demandes.filter(d => !prises.has(d.code)
        && (!q || [d.code, d.chantier, d.ag, d.module, d.description, d.mail].some(v => String(v || '').toLowerCase().includes(q))));
      // Les demandes du même type de module d'abord
      const t = norm(m.type);
      liste.sort((a, b) => (norm(b.module) === t) - (norm(a.module) === t));
      return `<input class="sx-champ pb-dem-q" type="search" placeholder="Filtrer : agence, chantier, type, mail, code…" value="${_otEsc(F.qDem)}" aria-label="Filtrer les demandes">
        <div class="pb-dem-liste">${liste.length ? liste.map(d => `<button type="button" class="pb-dem-item" data-dem="${_otEsc(d.code)}">
            <span class="pb-dem-l1"><b>${_otEsc(d.code)}</b> ${_otEsc(d.chantier || 'Sans agence')} · ${_otEsc(d.module || '')}${d.livraison ? ' · livr. ' + _otEsc(dateCourte(d.livraison)) : ''}${d.grutage ? ' · grutage' : ''}${d.enCours ? ' · <i>déjà en cours</i>' : ''}</span>
            <span class="pb-dem-l2">${_otEsc(d.description || '')}</span></button>`).join('')
          : `<div class="sx-aide">${F.demandes.length ? 'Aucune demande ne correspond.' : 'Aucune demande à traiter dans le fichier Demandes.'}</div>`}</div>`;
    };
    const dessiner = () => {
      $('#pb-aj-liste').innerHTML = F.modules.map(m => `<div class="pb-aj-carte">
        <div class="pb-aj-l1"><span class="pb-code">${_otEsc(m.code)}</span><span>${_otEsc([m.type, m.numModule].filter(Boolean).join(' · '))}</span>
          <button type="button" class="pb-aj-retirer" data-retirer="${_otEsc(m.code)}" aria-label="Retirer ${_otEsc(m.code)}">✕</button></div>
        ${m.dem
          ? `<div class="pb-aj-dem-choisie"><span><b>${_otEsc(m.dem.code)}</b> ${_otEsc([m.dem.chantier, m.dem.module, m.dem.livraison ? 'livr. ' + dateCourte(m.dem.livraison) : '', m.dem.grutage ? 'grutage' : ''].filter(Boolean).join(' · '))}</span>
              <button type="button" class="pb-lien" data-sans-dem="${_otEsc(m.code)}">Retirer la demande</button></div>`
          : (F.ouvert === m.code
            ? `<div class="pb-aj-dem-panneau">${htmlDemandes(m)}<button type="button" class="pb-lien" data-fermer-dem>Fermer</button></div>`
            : `<button type="button" class="pb-lien" data-ouvrir-dem="${_otEsc(m.code)}">+ Ajouter un code demande</button>`)}
      </div>`).join('');
      $('[data-r="1"]').disabled = !F.modules.length;
      $('[data-r="1"]').textContent = F.modules.length > 1 ? `Ajouter les ${F.modules.length}` : 'Ajouter';
    };
    // Pré-remplit agence, livraison et description depuis la demande, seulement si vides
    const preRemplir = d => {
      const champ = (id, v) => { const i = $('#' + id); if (v && !i.value.trim()) i.value = v; };
      champ('pb-aj-agence', d.ag);
      champ('pb-aj-liv', /^\d{4}-\d{2}-\d{2}$/.test(d.livraison) ? d.livraison : '');
      champ('pb-aj-desc', d.description);
    };

    // ── Événements ──
    $('#pb-aj-code').addEventListener('input', chercher);
    $('#pb-aj-code').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = norm($('#pb-aj-code').value);
      const exact = F.sugg.find(a => norm(a.code) === q || norm(a.numModule) === q);
      if (exact || F.sugg.length === 1) ajouterModule(exact || F.sugg[0]);
    });
    voile.addEventListener('input', e => {
      if (!e.target.classList.contains('pb-dem-q')) return;
      F.qDem = e.target.value;
      const pos = e.target.selectionStart;
      dessiner();
      const i = $('.pb-dem-q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
    });
    voile.addEventListener('click', async e => {
      if (e.target === voile) return voile.remove();
      const t = e.target;
      const sug = t.closest('[data-sug]');
      if (sug) return ajouterModule(F.sugg[Number(sug.dataset.sug)]);
      const ret = t.closest('[data-retirer]');
      if (ret) { F.modules = F.modules.filter(m => m.code !== ret.dataset.retirer); if (F.ouvert === ret.dataset.retirer) F.ouvert = null; chercher(); dessiner(); return; }
      const ouvrir = t.closest('[data-ouvrir-dem]');
      if (ouvrir) { F.ouvert = ouvrir.dataset.ouvrirDem; F.qDem = ''; dessiner(); const i = $('.pb-dem-q'); if (i) i.focus(); return; }
      if (t.closest('[data-fermer-dem]')) { F.ouvert = null; dessiner(); return; }
      const sans = t.closest('[data-sans-dem]');
      if (sans) { const m = F.modules.find(x => x.code === sans.dataset.sansDem); if (m) m.dem = null; dessiner(); return; }
      const dem = t.closest('[data-dem]');
      if (dem) {
        const m = F.modules.find(x => x.code === F.ouvert);
        const d = (F.demandes || []).find(x => x.code === dem.dataset.dem);
        if (m && d) { m.dem = d; F.ouvert = null; preRemplir(d); dessiner(); }
        return;
      }
      const b = t.closest('[data-r]');
      if (!b) return;
      if (b.dataset.r === '0') return voile.remove();
      const val = id => ($('#' + id).value || '').trim();
      const lignes = F.modules.map(m => ({ code: m.code, agence: val('pb-aj-agence'), description: val('pb-aj-desc'),
        livraison: val('pb-aj-liv'), codeDemande: m.dem ? m.dem.code : '' }));
      b.disabled = true; b.textContent = 'Ajout…';
      if (await this._pbAjouter(lignes)) voile.remove();
      else { b.disabled = false; b.textContent = 'Ajouter'; }
    });
    document.body.appendChild(voile);
    $('#pb-aj-code').focus();

    // Demandes chargées en fond (affichées seulement si on en ajoute une)
    this._otGet({ action: 'demandes_a_traiter' }, 40000)
      .then(d => { F.demandes = d.demandes || []; if (F.ouvert) dessiner(); })
      .catch(e => { F.demandes = []; message('Demandes indisponibles : ' + e.message, true); });
    try {
      if (!S.depsLoaded) await this._pbChargerProduction();
      F.arrivees = (await this._pbArriveesSurParc()).filter(a => !a.isParti);
      const hors = F.arrivees.filter(a => !dansPlanning(norm(a.code))).length;
      message(`${hors} arrivé${hors > 1 ? 's' : ''} sur parc pas encore au Planning.`, false);
      chercher();
    } catch (e) { message('Arrivées indisponibles : ' + e.message, true); }
  },

  async _pbAjouter(lignes, confirmerDemandes = false) {
    try {
      const d = await this._otPost({ action: 'planning_ajouter', lignes, confirmerDemandes }, 90000);
      this.toast('✓ Ajouté au Planning : ' + (d.ajoutes || []).join(', '), 5000);
      if ((d.avertissements || []).length) setTimeout(() => this.toast('⚠ ' + d.avertissements.join(' · '), 8000), 5200);
      if (S.pb.arr) S.pb.arr.donnees = null;
      if (S.pb.vue === 'arr') this._pbArrCharger(true); else this.prodActualiser();
      return true;
    } catch (e) {
      const m = String(e.message || e);
      if (!confirmerDemandes && /Déjà en cours dans le fichier Demandes/.test(m)) {
        const ok = await this._otConfirmer({ titre: 'Demande déjà en cours', texte: m + ' Ajouter quand même ?', ok: 'Ajouter quand même' });
        return ok ? this._pbAjouter(lignes, true) : false;
      }
      this.toast('Ajout impossible : ' + m, 7000);
      return false;
    }
  },
});

/* ─ Retirer du Planning (2026-11-17 ; admins + activité LOXAM depuis le 2026-11-18) : action `planning_retirer` de masterfile ─
   Bouton sur la fiche du module (vue dep-detail). Le serveur refait les mêmes contrôles. */
Object.assign(App, {

  // Ce qui empêche le retrait (mêmes règles que le serveur)
  _pbRetraitBloquants(d) {
    const s = d.status || {};
    const b = [];
    if (s.enCours) b.push('en cours');
    if (s.aControler) b.push('à contrôler');
    if (s.termine) b.push('terminé');
    if (s.mail) b.push('mail');
    if (s.cmd) b.push('cmd');
    if (s.deCote) b.push('de côté');
    if (d.debut) b.push('date de début');
    if (d.fin) b.push('date de fin');
    if (d.commande) b.push('commande');
    if (d.lv) b.push('LV');
    return b;
  },

  prodHtmlRetrait(d) {
    if (!this._pbPeutEtape() || !d || !d.code) return '';
    const b = this._pbRetraitBloquants(d);
    return `<div class="card" style="margin-top:14px;border:1px solid #F3C4C4;">
      <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0 0 4px;">Retirer du Planning</p>
      <p style="font-size:12px;color:#64748B;margin:0 0 10px;">${b.length
        ? 'Impossible : ' + _otEsc(b.join(', ')) + '. Seul un module où rien n\'est encore fait peut être retiré (sinon, dans le Sheet).'
        : 'Supprime la ligne du Planning (le module reste dans les Arrivées et pourra être rajouté). Si elle a un code demande, le fichier Demandes et le raccourci « Mail demande » sont remis comme avant.'}</p>
      <button type="button" ${b.length ? 'disabled' : ''} onclick="App.prodRetirer('${_otEsc(d.code)}')"
        style="background:${b.length ? '#F1F5F9' : '#FDECEC'};color:${b.length ? '#94A3B8' : '#9B1C1C'};border:none;padding:12px;border-radius:10px;font-size:14px;font-weight:700;cursor:${b.length ? 'not-allowed' : 'pointer'};width:100%;">Retirer ${_otEsc(d.code)} du Planning</button>
    </div>`;
  },

  async prodRetirer(code) {
    const d = (S.deps || []).find(x => x.code === code);
    const ok = await this._otConfirmer({ titre: 'Retirer ' + code + ' du Planning ?',
      texte: [d && d.module, d && d.codeModule, d && d.chantier].filter(Boolean).join(' · ') + ' — la ligne est supprimée du Planning. Le module reste dans les Arrivées.',
      ok: 'Retirer', annuler: 'Annuler' });
    if (!ok) return;
    this.toast('⏳ Retrait…');
    try {
      const r = await this._otPost({ action: 'planning_retirer', code }, 60000);
      S.deps = (S.deps || []).filter(x => x.code !== code);
      if (S.pb && S.pb.arr) S.pb.arr.donnees = null;
      this.toast('✓ ' + code + ' retiré du Planning', 4000);
      if ((r.avertissements || []).length) setTimeout(() => this.toast('⚠ ' + r.avertissements.join(' · '), 8000), 4200);
      this.goBack();
    } catch (e) {
      this.toast('Retrait impossible : ' + e.message, 7000);
    }
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   Changement d'étape (2026-11-18) — action `planning_etape` de masterfile : coche M / N / O / S
   dans le Planning et remplit les dates de début / fin comme le déclencheur du Sheet.
   Depuis la barre d'étape du tableau, la carte téléphone ou la fiche du module. Admins et activité LOXAM.
   Version téléphone (< 760 px) : une carte par module au lieu d'une ligne de tableau.
   ═══════════════════════════════════════════════════════════════════════════ */

const PB_ETAPES_PLANNING = [
  { cle: 'demarrer', nom: 'À démarrer',  aide: 'rien de coché' },
  { cle: 'atelier',  nom: 'Atelier',     aide: '« En cours » — date de début si vide' },
  { cle: 'controle', nom: 'Contrôle',    aide: '« À contrôler » — date de fin si vide' },
  { cle: 'termine',  nom: 'Terminé',     aide: '« Terminé » — prêt à partir avec commande ou LV' },
];

Object.assign(App, {

  _pbEtroit() { return window.matchMedia('(max-width: 759px)').matches; },

  // Étape « Planning » (les 4 cases) d'un module, sans tenir compte de « de côté » ni de « prêt »
  _pbEtapePlanning(d) {
    const s = d.status || {};
    return s.termine ? 'termine' : s.aControler ? 'controle' : s.enCours ? 'atelier' : 'demarrer';
  },

  _pbHtmlEtape(l, admin, barre, nomEtape) {
    if (!this._pbPeutEtape() || l.parti) return `<span class="pb-etape" title="${_otEsc(nomEtape)}">${barre}</span>`;
    return `<button type="button" class="pb-etape pb-etape-btn" onclick="App.prodEtape('${_otEsc(l.d.code)}')" title="${_otEsc(nomEtape)} — changer d'étape">${barre}</button>`;
  },

  _pbHtmlCarte(l, admin) {
    const d = l.d, f = l.fiche;
    const rang = (PB_ETAPES.find(e => e.cle === l.etape) || {}).rang || 0;
    const barre = [1, 2, 3, 4, 5, 6].map(i => `<span class="pb-seg${i <= rang ? ' pb-seg-' + rang : ''}"></span>`).join('');
    const nomEtape = (PB_ETAPES.find(e => e.cle === l.etape) || {}).nom || '';
    const code = _otEsc(d.code || '');
    const duree = l.parti ? 'fini le ' + _fmtDateShort(d.fin) : _duration(d.debut, null);
    let ot = '';
    if (Array.isArray(S.pb.fiches)) {
      if (f) {
        const lib = { brouillon: 'Fiche en cours', a_valider: 'Fiche à valider' }[f.statut];
        ot = `<button type="button" class="pb-ot pb-ot-${_otEsc(f.statut)}" onclick="App.prodOuvrirFiche(${Number(f.id)})">${_otEsc(lib || f.numero_ot || 'Validée')}${f.statut === 'validee' ? ' · à envoyer' : ''}</button>`;
      } else ot = this._pbHtmlOtSansFiche(l, false);
    }
    const pdf = admin && f && f.documents ? (f.documents.fichiers || []).find(x => x.type === 'pdf') : null;
    return `<div class="pb-carte${l.retard ? ' pb-retard' : ''}${l.parti ? ' pb-parti' : ''}">
      <div class="pb-carte-l1">
        ${this._pbHtmlCase(l)}
        <button type="button" class="pb-code" onclick="App.prodDossier('${code}', ${l.parti})" aria-label="Dossier du module ${code}">${_PB_SVG_DOSSIER}${code}</button>
        <button type="button" class="pb-numero" onclick="App.prodOuvrirModule(${l.parti}, ${l.idx})">${_otEsc(d.codeModule || '—')}</button>
        <span class="pb-type">${_otEsc(d.module || '')}</span>
      </div>
      ${S.pb.desc && d.description ? `<div class="pb-carte-desc">${_otEsc(d.description)}</div>` : ''}
      <div class="pb-carte-l2">${this._pbHtmlAgence(l, `${_otEsc(d.chantier || 'Sans chantier')}${d.status && d.status.grutage ? ' <span class="pb-grutage">grutage</span>' : ''}`)}</div>
      <div class="pb-carte-l3">
        ${this._pbHtmlEtape(l, admin, barre, nomEtape)}
        <span class="pb-carte-etape">${_otEsc(nomEtape)}</span>
        <span class="pb-gris2">${_otEsc(duree || '')}</span>
        ${this._pbHtmlAnnonce(l)}
        ${!l.parti ? `<span class="${l.retard ? 'pb-rouge' : 'pb-gris'}">livr. ${_otEsc(d.livraisonPrevue ? _fmtDateShort(d.livraisonPrevue) : '—')}</span>` : ''}
        ${ot}
        ${f && f.stock_le ? this._pbHtmlStock(f, true) : ''}
        ${pdf && pdf.url ? `<a class="pb-doc" href="${_otEsc(pdf.url)}" target="_blank" rel="noopener">PDF</a>` : ''}
        ${admin && f && f.documents && f.documents.dossier ? `<a class="pb-doc" href="${_otEsc(f.documents.dossier)}" target="_blank" rel="noopener">Dossier OT</a>` : ''}
        <button type="button" class="pb-poses" onclick="App.prodPoses(${l.parti}, ${l.idx})">${_PB_SVG_CLE}Poses</button>
      </div>
    </div>`;
  },

  // Carte « Étape » de la fiche du module (vue dep-detail), admins et activité LOXAM
  prodHtmlEtape(d) {
    if (!this._pbPeutEtape() || !d || !d.code) return '';
    const cle = this._pbEtapePlanning(d);
    const prete = cle === 'termine' && (d.lv || d.commande);
    const frise = ['Arrivé', 'Atelier', 'Contrôle', 'Terminé', 'Commande / LV', 'Parti'];
    const rang = { demarrer: 0, atelier: 1, controle: 2, termine: 3 }[cle] + (prete ? 1 : 0);
    return `<div class="card pb-fiche-etape">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
        <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0;">Étape${d.status && d.status.deCote ? ' · <span class="pb-decote">de côté</span>' : ''}</p>
        <button type="button" class="sx-btn sx-btn-principal pb-btn-ajout" onclick="App.prodEtape('${_otEsc(d.code)}')">Changer d'étape</button>
      </div>
      <ol class="pb-frise">${frise.map((t, i) => `<li class="${i < rang ? 'pb-frise-fait' : i === rang ? 'pb-frise-ici' : ''}">${_otEsc(t)}</li>`).join('')}</ol>
    </div>`;
  },

  async prodEtape(code) {
    const d = (S.deps || []).find(x => x.code === code);
    if (!d) return this.toast('Module introuvable dans le Planning : actualisez');
    const actuelle = this._pbEtapePlanning(d);
    const deCote = !!(d.status && d.status.deCote);
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre pb-fen-etape" role="dialog" aria-modal="true" aria-labelledby="pb-et-titre">
      <h3 id="pb-et-titre">Étape de ${_otEsc(code)}</h3>
      <p class="sx-aide">${_otEsc([d.module, d.codeModule, d.chantier].filter(Boolean).join(' · '))}</p>
      <div class="pb-et-choix" role="group" aria-label="Étape">${PB_ETAPES_PLANNING.map(e => `
        <button type="button" class="pb-et-btn pb-g-${e.cle}" data-etape="${e.cle}" aria-pressed="${e.cle === actuelle}">
          <b>${_otEsc(e.nom)}</b><span>${e.cle === actuelle ? 'étape actuelle' : _otEsc(e.aide)}</span></button>`).join('')}
      </div>
      <label class="pb-et-decote"><input type="checkbox" id="pb-et-decote" ${deCote ? 'checked' : ''}> De côté</label>
      <p class="sx-aide">Le Planning Google est mis à jour (mêmes cases et mêmes dates que si on cochait dans le Sheet).</p>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
        <button type="button" class="sx-btn sx-btn-principal" data-r="1">Enregistrer</button>
      </div></div>`;
    let choix = actuelle;
    const fermer = () => voile.remove();
    voile.addEventListener('click', async e => {
      if (e.target === voile) return fermer();
      const b = e.target.closest('[data-etape]');
      if (b) {
        choix = b.dataset.etape;
        voile.querySelectorAll('[data-etape]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        return;
      }
      const r = e.target.closest('[data-r]');
      if (!r) return;
      if (r.dataset.r === '0') return fermer();
      const nouveauDeCote = voile.querySelector('#pb-et-decote').checked;
      const payload = { action: 'planning_etape', code };
      if (choix !== actuelle) payload.etape = choix;
      if (nouveauDeCote !== deCote) payload.deCote = nouveauDeCote;
      if (!payload.etape && payload.deCote === undefined) return fermer();
      r.disabled = true; r.textContent = 'Enregistrement…';
      try {
        const res = await this._otPost(payload, 60000);
        d.status = Object.assign({}, d.status, { enCours: res.enCours, aControler: res.aControler, termine: res.termine, deCote: res.deCote });
        d.debut = res.debut; d.fin = res.fin;
        fermer();
        this.toast('✓ ' + code + ' : ' + ((PB_ETAPES_PLANNING.find(e => e.cle === this._pbEtapePlanning(d)) || {}).nom || '') + (res.deCote ? ' (de côté)' : '') + ' — Planning mis à jour', 3500);
        this._pbApresEtape();
      } catch (err) {
        r.disabled = false; r.textContent = 'Enregistrer';
        this.toast('Changement impossible : ' + err.message, 6000);
      }
    });
    document.body.appendChild(voile);
    voile.querySelector('[aria-pressed="true"]').focus();
  },

  // Redessine ce qui est à l'écran après un changement d'étape
  _pbApresEtape() {
    if (S.view === 'prod-bureau') this._pbRendre();
    else if (S.view === 'dep-detail') this._renderDepDetail();
    if (typeof this._renderDepList === 'function' && document.getElementById('dep-list')) { try { this._renderDepList(); } catch (e) { /* liste pas affichée */ } }
  },
});

// Passage tableau ↔ cartes quand la largeur change (rotation de tablette, fenêtre redimensionnée)
window.matchMedia('(max-width: 759px)').addEventListener('change', () => {
  if (S.view === 'prod-bureau' && S.pb && S.pb.vue !== 'arr') App._pbRendreCorps();
});

/* ═══════════════════════════════════════════════════════════════════════════
   Agence de destination (2026-11-18) — action `planning_agence` de masterfile : D = code agence,
   C = libellé (annuaire LOXAM, onglet Adresses), report dans Demandes si code demande ; vide = LIBRE.
   Depuis la colonne Agence du tableau, la carte téléphone ou la fiche du module. Admins et activité LOXAM.
   ═══════════════════════════════════════════════════════════════════════════ */
Object.assign(App, {

  _pbHtmlAgence(l, contenu) {
    const titre = _otEsc([l.d.ag, l.d.chantier].filter(Boolean).join(' · '));
    if (!this._pbPeutEtape() || l.parti) return `<span class="pb-texte" title="${titre}">${contenu}</span>`;
    return `<button type="button" class="pb-texte pb-agence-btn" onclick="App.prodAgence('${_otEsc(l.d.code)}')" title="${titre} — changer la destination">${contenu}</button>`;
  },

  // Carte « Destination » de la fiche du module (vue dep-detail)
  prodHtmlAgenceFiche(d) {
    if (!this._pbPeutEtape() || !d || !d.code) return '';
    const libre = !d.ag;
    return `<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="min-width:0;">
        <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0;">Destination</p>
        <p style="font-size:13px;margin:2px 0 0;color:${libre ? '#94A3B8' : '#1E293B'};">${_otEsc(d.chantier || 'LIBRE')}${libre ? ' · pas encore d\'agence' : ''}</p>
      </div>
      <button type="button" class="sx-btn sx-btn-second pb-btn-ajout" onclick="App.prodAgence('${_otEsc(d.code)}')">${libre ? 'Choisir l\'agence' : 'Modifier'}</button>
    </div>`;
  },

  async _pbAgences() {
    if (!(S.annuaireData && S.annuaireData.length)) {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_agencies', {}, 20000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'annuaire indisponible');
      S.annuaireData = d.agencies || [];
      if (S.lvu) S.lvu.agencies = S.annuaireData;
    }
    // Le Planning ne connaît que l'annuaire LOXAM (onglet Adresses), comme le déclencheur du Sheet. Une adresse
    // « custom » remplace la LOXAM de même code dans lv_agencies : on garde les codes numériques, le serveur tranche.
    return S.annuaireData.filter(a => a.source === 'loxam' || /^\d+$/.test(String(a.code).trim()));
  },

  async prodAgence(code) {
    const d = (S.deps || []).find(x => x.code === code);
    if (!d) return this.toast('Module introuvable dans le Planning : actualisez');
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre" role="dialog" aria-modal="true" aria-labelledby="pb-ag-titre">
      <h3 id="pb-ag-titre">Destination de ${_otEsc(code)}</h3>
      <p class="sx-aide">${_otEsc([d.module, d.codeModule].filter(Boolean).join(' · '))} — actuellement : <b>${_otEsc(d.chantier || 'LIBRE')}</b></p>
      <div class="pb-aj-recherche">
        <label for="pb-ag-q" class="pb-etiquette">Agence (code, ville, nom ou code postal)</label>
        <input id="pb-ag-q" class="sx-champ" type="search" autocomplete="off" placeholder="ex. 457, MOUGUERRE, 64…">
        <div id="pb-ag-liste" class="pb-aj-sugg" role="listbox" aria-label="Agences"></div>
      </div>
      <div id="pb-ag-msg" class="sx-aide" role="status">Chargement de l'annuaire…</div>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
        <button type="button" class="sx-btn sx-btn-second" data-libre ${d.ag ? '' : 'disabled'}>Mettre LIBRE</button>
      </div></div>`;
    const $ = sel => voile.querySelector(sel);
    let agences = [], affichees = [];
    const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cle = v => String(v || '').trim().replace(/^0+/, '');
    const dessiner = () => {
      const q = norm($('#pb-ag-q').value.trim());
      affichees = !q ? [] : agences.filter(a => cle(a.code) === cle(q) || cle(a.code).startsWith(cle(q))
        || [a.nom, a.ville, a.cp].some(v => norm(v).includes(q))).slice(0, 10);
      $('#pb-ag-liste').innerHTML = affichees.map((a, i) => `<button type="button" class="pb-aj-sug" role="option" data-ag="${i}">
        <b>${_otEsc(String(a.code).padStart(4, '0'))}</b><span>${_otEsc(String(a.cp || '').padStart(5, '0').slice(0, 2) + ' ' + (a.ville || ''))}</span>
        <span class="sx-aide">${_otEsc(a.nom || '')}</span></button>`).join('')
        + (q && !affichees.length ? '<div class="pb-aj-sug pb-aj-sug-non"><span class="sx-aide">Aucune agence LOXAM ne correspond (à ajouter dans l\'onglet Adresses du fichier LV/CMR).</span></div>' : '');
    };
    const fermer = () => voile.remove();
    const enregistrer = async (agence, texte) => {
      $('#pb-ag-msg').textContent = 'Enregistrement dans le Planning…';
      voile.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        const res = await this._otPost({ action: 'planning_agence', code, agence }, 60000);
        d.ag = res.ag; d.chantier = res.chantier;
        fermer();
        this.toast('✓ ' + code + ' → ' + res.chantier + ' — Planning mis à jour', 3500);
        if ((res.avertissements || []).length) setTimeout(() => this.toast('⚠ ' + res.avertissements.join(' · '), 8000), 3600);
        this._pbApresEtape();
      } catch (e) {
        voile.querySelectorAll('button').forEach(b => { b.disabled = false; });
        $('#pb-ag-msg').textContent = '';
        this.toast('Changement impossible : ' + e.message, 6000);
      }
    };
    voile.addEventListener('click', e => {
      if (e.target === voile || e.target.closest('[data-r="0"]')) return fermer();
      const b = e.target.closest('[data-ag]');
      if (b) { const a = affichees[+b.dataset.ag]; if (a) enregistrer(String(a.code), a.ville); return; }
      if (e.target.closest('[data-libre]')) enregistrer('', 'LIBRE');
    });
    $('#pb-ag-q').addEventListener('input', dessiner);
    $('#pb-ag-q').addEventListener('keydown', e => { if (e.key === 'Enter' && affichees.length === 1) enregistrer(String(affichees[0].code)); });
    document.body.appendChild(voile);
    $('#pb-ag-q').focus();
    try {
      agences = await this._pbAgences();
      $('#pb-ag-msg').textContent = agences.length + ' agences LOXAM';
      dessiner();
    } catch (e) { $('#pb-ag-msg').textContent = 'Annuaire indisponible : ' + e.message; }
  },
});

/* Colonne OT d'un module sans fiche (2026-11-18) : « OT à faire » + bouton « Pas d'OT », ou le marquage. */
Object.assign(App, {
  _pbHtmlOtSansFiche(l, gris) {
    const code = _otEsc(l.code || '');
    if (l.otExcel) return `<span class="pb-ot pb-ot-envoyee" title="OT fait dans la matrice Excel">${_otEsc(l.otExcel)}</span>`;
    if (l.sansOt) {
      const t = _otEsc(this._otTexteSansOt(l.sansOt));
      return l.sansOt.auto || !this._otAutorise()
        ? `<span class="pb-ot pb-ot-sans" title="${t}">Pas d'OT</span>`
        : `<button type="button" class="pb-ot pb-ot-sans" onclick="App.otRemettreAFaire('${code}')" title="${t} — cliquer pour remettre à faire">Pas d'OT</button>`;
    }
    const etat = l.otAFaire ? '<span class="pb-ot pb-ot-afaire">OT à faire</span>' : (gris ? '<span class="pb-gris">Pas de fiche</span>' : '');
    // Petite croix rouge (demande de Hugo) : plus léger, et on ne lit pas « pas d'OT » comme « rien à faire »
    return etat + (this._otAutorise() && l.code ? ` <button type="button" class="pb-sans-btn" onclick="App.otPasDOt('${code}')" title="Marquer : ce module n'aura pas d'OT (vente en l'état, épave…)" aria-label="Marquer ${code} sans OT"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : '');
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   Sélection multiple dans Production (2026-11-18) : une case par module, « tout sélectionner » sur les
   lignes affichées, barre d'actions en bas dès qu'un module est coché. Action : « Pas d'OT » (même motif
   pour toute la sélection). D'autres actions s'ajouteront dans _pbMajActions.
   ═══════════════════════════════════════════════════════════════════════════ */
Object.assign(App, {
  _pbPeutSel() { return this._otAutorise(); },

  _pbHtmlCase(l) {
    if (!this._pbPeutSel() || !l.code) return '';
    const c = _otEsc(l.code);
    return `<input type="checkbox" class="pb-sel" data-sel="${c}" ${S.pb.sel && S.pb.sel.has(l.code) ? 'checked' : ''} aria-label="Sélectionner ${c}" onclick="App.prodSel('${c}', this.checked)">`;
  },

  prodSel(code, on) {
    S.pb.sel = S.pb.sel || new Set();
    if (on) S.pb.sel.add(code); else S.pb.sel.delete(code);
    this._pbMajActions();
  },
  prodSelTout(on) {
    S.pb.sel = S.pb.sel || new Set();
    (S.pb.visibles || []).forEach(c => { if (on) S.pb.sel.add(c); else S.pb.sel.delete(c); });
    document.querySelectorAll('#pb-corps .pb-sel[data-sel]').forEach(x => { x.checked = S.pb.sel.has(x.dataset.sel); });
    this._pbMajActions();
  },
  prodSelVider() {
    S.pb.sel = new Set();
    document.querySelectorAll('#pb-corps .pb-sel[data-sel]').forEach(x => { x.checked = false; });
    this._pbMajActions();
  },

  _pbMajActions() {
    const bar = document.getElementById('pb-actions');
    if (!bar) return;
    const n = S.pb.sel ? S.pb.sel.size : 0;
    const tout = document.getElementById('pb-sel-tout');
    if (tout) {
      const vis = S.pb.visibles || [];
      const k = vis.filter(c => S.pb.sel && S.pb.sel.has(c)).length;
      tout.checked = vis.length > 0 && k === vis.length;
      tout.indeterminate = k > 0 && k < vis.length;
    }
    bar.hidden = !n;
    if (!n) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<div class="pb-actions-in">
      <b>${n} module${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}</b>
      <button type="button" class="pb-action" onclick="App.prodSelPasDOt()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg> Pas d'OT…</button>
      ${this._otAdmin() ? `<button type="button" class="pb-action pb-action-mail" onclick="App.prodSelMailDispo()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg> Mail de dispo…</button>` : ''}
      <button type="button" class="pb-action pb-action-discret" onclick="App.prodSelVider()">Tout désélectionner</button>
    </div>`;
  },

  async prodSelPasDOt() {
    const lignes = this._pbLignes().filter(l => S.pb.sel.has(l.code));
    const ok = lignes.filter(l => !l.fiche && !l.sansOt);
    const ignores = lignes.length - ok.length;
    if (!ok.length) { this.toast('Aucun des modules sélectionnés ne peut être marqué : ils ont déjà une fiche ou sont déjà sans OT', 5000); return; }
    const choix = await this._otDialogueSansOt(
      'Pas d\u2019OT pour ' + ok.length + ' module' + (ok.length > 1 ? 's' : '') + ' ?',
      ok.map(l => l.code).join(', ') + (ignores ? ' — ' + ignores + ' ignoré' + (ignores > 1 ? 's' : '') + ' (fiche existante ou déjà sans OT)' : ''),
      '', 'Pas d\u2019OT pour les ' + ok.length);
    if (!choix) return;
    let faits = 0; const echecs = [];
    for (const l of ok) {
      this.toast('⏳ ' + (faits + echecs.length + 1) + ' / ' + ok.length + '…', 20000);
      try {
        const d = await this._otPost({ action: 'ot_sans_ot', code: l.code, motif: choix.motif, detail: choix.detail });
        S.ot.sansOt = S.ot.sansOt || new Map();
        if (d.sans_ot) S.ot.sansOt.set(String(l.code).toUpperCase(), d.sans_ot);
        S.pb.sel.delete(l.code);
        faits++;
      } catch (e) { echecs.push(l.code + ' (' + e.message + ')'); }
    }
    this.toast('✓ ' + faits + ' module' + (faits > 1 ? 's' : '') + ' sans OT' + (echecs.length ? ' — échec : ' + echecs.join(', ') : ''), echecs.length ? 8000 : 3500);
    this._pbRendre();
  },
});

/* Fournitures sorties du stock (2026-11-18) : colonne « Stock » du tableau, étiquette sur les cartes. */
Object.assign(App, {
  _pbHtmlStock(f, texte) {
    if (!f || !f.stock_le) return texte ? '' : '<span class="pb-gris">—</span>';
    const quand = new Date(f.stock_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    return `<span class="pb-stock" title="Fournitures sorties du stock le ${_otEsc(quand)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>${texte ? 'stock sorti' : 'sorti'}</span>`;
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   Mail de dispo (2026-11-18, admins) : annonce à LOXAM des modules terminés (macro preparerEmailOutlook du
   Planning) — aperçu (planning_mail_dispo, etape 'apercu') puis envoi DIRECT par masterfile (etape 'envoyer')
   qui coche « Mail » (colonne P) au Planning. (Le brouillon Outlook du matin reste possible côté serveur : 'eml'.)
   À annoncer = terminé, pas encore annoncé (P), ni de côté, ni parti, sans commande ni LV.
   ═══════════════════════════════════════════════════════════════════════════ */
const _PB_SVG_MAIL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

Object.assign(App, {
  _pbAAnnoncer(l) { return !l.parti && l.etape === 'termine' && !(l.d.status && l.d.status.mail); },

  _pbHtmlAnnonce(l) {
    if (l.parti || !(l.d.status && l.d.status.mail) || !['termine', 'pret'].includes(l.etape)) return '';
    return `<span class="pb-annonce" title="Mail de dispo envoyé (annoncé à LOXAM)">${_PB_SVG_MAIL}</span>`;
  },

  async prodSelMailDispo() {
    if (!this._otAdmin()) return;
    const lignes = this._pbLignes().filter(l => S.pb.sel.has(l.code));
    const ok = lignes.filter(l => !l.parti && l.etape !== 'decote');
    const ignores = lignes.length - ok.length;
    if (!ok.length) { this.toast('Aucun module à annoncer dans la sélection (partis ou de côté)', 5000); return; }
    const choisis = await new Promise(resolve => {
      const voile = document.createElement('div');
      voile.className = 'sx-voile';
      const ligne = (l, i) => {
        const notes = [l.etape !== 'termine' && l.etape !== 'pret' ? 'pas encore terminé' : '', l.d.status && l.d.status.mail ? 'déjà annoncé' : '']
          .filter(Boolean).map(t => `<span class="pb-md-note">${t}</span>`).join(' ');
        return `<label class="pb-md-ligne"><input type="checkbox" data-i="${i}" ${l.d.status && l.d.status.mail ? '' : 'checked'}>
          <span><b>${_otEsc(l.d.codeModule || '—')}</b> · ${_otEsc(l.d.chantier || '')} · ${_otEsc(l.d.module || '')} <span class="sx-aide">${_otEsc(l.code)}</span> ${notes}
          ${l.d.description ? `<br><span class="sx-aide">${_otEsc(l.d.description)}</span>` : ''}</span></label>`;
      };
      voile.innerHTML = `<div class="sx-fenetre pb-fenetre" role="dialog" aria-modal="true" aria-labelledby="pb-md-titre">
        <h3 id="pb-md-titre">Mail de dispo</h3>
        <p class="sx-aide">Choisissez les modules ; l’aperçu du mail s’affiche avant l’envoi.<br>
          <b>À</b> nathalie.jadeau@loxam.fr · <b>Cc</b> N. Mesnager, A. Lavello, N. Siblas, S. Dugué · <b>Cci</b> Hugo, Benjamin<br>
          <b>Objet</b> Module dispo - ${new Date().toLocaleDateString('fr-FR')}${ignores ? ' · ' + ignores + ' module' + (ignores > 1 ? 's' : '') + ' ignoré' + (ignores > 1 ? 's' : '') + ' (partis ou de côté)' : ''}</p>
        <div class="pb-md-liste">${ok.map(ligne).join('')}</div>
        <div class="sx-fenetre-boutons">
          <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
          <button type="button" class="sx-btn sx-btn-principal" data-r="1">Prévisualiser le mail</button>
        </div></div>`;
      const fin = r => { voile.remove(); resolve(r); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(null);
        const b = e.target.closest('[data-r]');
        if (!b) return;
        if (b.dataset.r !== '1') return fin(null);
        const sel = [...voile.querySelectorAll('input[data-i]:checked')].map(x => ok[+x.dataset.i]);
        if (!sel.length) { this.toast('Cochez au moins un module'); return; }
        fin(sel);
      });
      document.body.appendChild(voile);
    });
    if (!choisis) return;
    const codes = choisis.map(l => l.code);
    this.toast('⏳ Préparation de l’aperçu…', 20000);
    let ap;
    try { ap = await this._otPost({ action: 'planning_mail_dispo', etape: 'apercu', codes }, 60000); }
    catch (e) { this.toast('Aperçu impossible : ' + e.message, 6000); return; }
    // Aperçu du mail tel qu'il partira (contenu affiché dans un cadre isolé), puis envoi direct
    const envoyer = await new Promise(resolve => {
      const voile = document.createElement('div');
      voile.className = 'sx-voile';
      voile.innerHTML = `<div class="sx-fenetre pb-fenetre pb-md-apercu" role="dialog" aria-modal="true" aria-labelledby="pb-mda-titre">
        <h3 id="pb-mda-titre">Envoyer le mail de dispo ?</h3>
        <div class="pb-md-entetes">
          <label for="pb-md-a">À</label><input id="pb-md-a" class="sx-champ" type="text" value="${_otEsc((ap.a || []).join(', '))}">
          <label for="pb-md-cc">Cc</label><input id="pb-md-cc" class="sx-champ" type="text" value="${_otEsc((ap.cc || []).join(', '))}">
          <label for="pb-md-cci">Cci</label><input id="pb-md-cci" class="sx-champ" type="text" value="${_otEsc((ap.cci || []).join(', '))}">
          <span>Objet</span><b>${_otEsc(ap.sujet || '')}</b>
        </div>
        <span class="sx-aide">Adresses séparées par des virgules ; modifiées pour ce mail seulement (liste par défaut : Réglages).</span>
        <iframe class="pb-md-cadre" sandbox="" title="Aperçu du mail"></iframe>
        <p class="sx-aide">Le mail part tout de suite depuis le compte Google de SONOTRAD (comme la macro du Sheet), puis « Mail » est coché au Planning pour ${codes.length} module${codes.length > 1 ? 's' : ''}.</p>
        <div class="sx-fenetre-boutons">
          <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
          <button type="button" class="sx-btn sx-btn-principal" data-r="1">Envoyer le mail</button>
        </div></div>`;
      voile.querySelector('.pb-md-cadre').srcdoc = ap.html || '';
      const fin = r => { voile.remove(); resolve(r); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(false);
        const b = e.target.closest('[data-r]');
        if (!b) return;
        if (b.dataset.r !== '1') return fin(false);
        fin({ a: voile.querySelector('#pb-md-a').value, cc: voile.querySelector('#pb-md-cc').value, cci: voile.querySelector('#pb-md-cci').value });
      });
      document.body.appendChild(voile);
    });
    if (!envoyer) return;
    this.toast('⏳ Envoi du mail…', 30000);
    try {
      await this._otPost({ action: 'planning_mail_dispo', etape: 'envoyer', codes, a: envoyer.a, cc: envoyer.cc, cci: envoyer.cci }, 90000);
      codes.forEach(c => { const x = (S.deps || []).find(m => m.code === c); if (x) x.status = Object.assign({}, x.status, { mail: true }); });
      codes.forEach(c => S.pb.sel.delete(c));
      this.toast('✓ Mail de dispo envoyé — ' + codes.length + ' module' + (codes.length > 1 ? 's' : '') + ' annoncé' + (codes.length > 1 ? 's' : ''), 4000);
      this._pbRendre();
    } catch (e) { this.toast('Envoi impossible : ' + e.message, 8000); }
  },
});

/* Réglages › Mail de dispo (admins, 2026-11-18) : liste de destinataires par défaut (action dispo_reglages). */
Object.assign(App, {
  async _dispoReglagesRendre() {
    const el = document.getElementById('settings-dispo');
    if (!el) return;
    if (!this._otAdmin()) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card" style="margin-bottom:12px;"><p style="font-size:14px;font-weight:700;color:#1E293B;margin-bottom:6px;">✉ Mail de dispo — destinataires</p>
      <p style="font-size:12px;color:#64748B;margin-bottom:10px;">Liste utilisée par défaut (modifiable aussi pour un seul envoi dans l'aperçu). Adresses séparées par des virgules.</p>
      <div id="dispo-reglages-corps" style="font-size:13px;color:#64748B;">Chargement…</div></div>`;
    try {
      const d = await this._otPost({ action: 'dispo_reglages', etape: 'lire' }, 30000);
      const champ = (id, nom, v) => `<label class="label-sm" for="${id}">${nom}</label><textarea id="${id}" class="input-field" rows="2" style="font-size:13px;">${_otEsc((v || []).join(', '))}</textarea>`;
      document.getElementById('dispo-reglages-corps').innerHTML = champ('dispo-a', 'À', d.a) + champ('dispo-cc', 'Cc', d.cc) + champ('dispo-cci', 'Cci', d.cci)
        + `<button class="btn btn-primary" style="margin-top:8px;" onclick="App.dispoReglagesEnregistrer()">Enregistrer les destinataires</button>`;
    } catch (e) { document.getElementById('dispo-reglages-corps').textContent = 'Indisponible : ' + e.message; }
  },
  async dispoReglagesEnregistrer() {
    const v = id => document.getElementById(id).value;
    try {
      await this._otPost({ action: 'dispo_reglages', etape: 'enregistrer', a: v('dispo-a'), cc: v('dispo-cc'), cci: v('dispo-cci') }, 30000);
      this.toast('✓ Destinataires du mail de dispo enregistrés');
      this._dispoReglagesRendre();
    } catch (e) { this.toast('Enregistrement impossible : ' + e.message, 6000); }
  },
});
