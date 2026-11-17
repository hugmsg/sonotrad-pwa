/* ═══════════════════════════════════════════════════════════════════════════
   Production — tableau bureau (2026-11-17, maquette « Production LOXAM — refonte »)
   Une ligne par module, groupée par étape du Planning ; lecture seule : le Planning Google
   reste la référence (les étapes se changent encore dans le Sheet). L'ancienne vue en cartes
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
  // Carte « Production » du menu LOXAM : le tableau sur grand écran, l'ancienne vue en cartes sur téléphone.
  // Pendant le test (2026-11-17) : tableau par défaut pour les admins seulement ; les autres l'ont par « Vue tableau ».
  prodEntree() {
    if (this._otAdmin() && window.matchMedia('(min-width: 900px)').matches) this.prodOuvrir(); else this.go('departures');
  },
  prodOuvrir() {
    S.pb = S.pb || { onglet: 'tous', filtre: '', type: '', q: '', replies: {}, fiches: null, fichesChargement: false };
    this.go('prod-bureau');
  },

  // Appelé par go('prod-bureau')
  async prodBureauInit() {
    S.pb = S.pb || { onglet: 'tous', filtre: '', type: '', q: '', replies: {}, fiches: null, fichesChargement: false };
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
      const otAFaire = otAttendue && (!f || f.statut === 'brouillon' || f.statut === 'a_valider');
      return { d, idx, parti, code, etape, fiche: f, retard, fin, otAFaire,
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
    if (q && ![l.d.code, l.d.codeModule, l.d.chantier, l.d.ag, l.d.module, l.d.lv, l.d.commande, l.fiche?.numero_ot]
      .some(v => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  },

  /* ─ Actions ─ */

  prodOnglet(cle) { S.pb.onglet = cle; S.pb.filtre = ''; this._pbRendre(); },
  prodFiltre(cle) { S.pb.filtre = S.pb.filtre === cle ? '' : cle; S.pb.onglet = 'tous'; this._pbRendre(); },
  prodType(v) { S.pb.type = v; this._pbRendre(); },
  prodRecherche(v) {
    S.pb.q = v;
    clearTimeout(this._pbMinuterie);
    this._pbMinuterie = setTimeout(() => this._pbRendreCorps(), 120);
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
    };
    const types = [...new Set(lignes.map(l => (l.d.module || '').trim()).filter(Boolean))].sort();
    const onglet = (cle, nom, n) => `<button type="button" class="pb-onglet" aria-pressed="${P.onglet === cle && !P.filtre}" onclick="App.prodOnglet('${cle}')">${_otEsc(nom)} <b>${n}</b></button>`;
    const puce = (cle, n, texte, classe) => n ? `<button type="button" class="pb-puce pb-puce-${classe}" aria-pressed="${P.filtre === cle}" onclick="App.prodFiltre('${cle}')">${n} ${texte}</button>` : '';
    const maj = pret ? 'à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'chargement…';

    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: (pret ? surParc + ' modules sur parc · ' : '') + maj, large: true })}
      <div class="pb-barre"><div class="pb-barre-in">
        <div class="pb-ligne">
          <div class="sx-recherche pb-recherche">${_OT_SVG_LOUPE}
            <label for="pb-q" class="sx-sr">Rechercher</label>
            <input id="pb-q" type="search" placeholder="Code, n° module, agence, chantier, n° OT, LV…" value="${_otEsc(P.q)}" oninput="App.prodRecherche(this.value)">
          </div>
          <label for="pb-type" class="pb-etiquette">Type</label>
          <select id="pb-type" class="pb-select" onchange="App.prodType(this.value)">
            <option value="">Tous</option>${types.map(t => `<option${P.type === t ? ' selected' : ''}>${_otEsc(t)}</option>`).join('')}
          </select>
          <div class="pb-bascule" role="group" aria-label="Affichage">
            <button type="button" aria-pressed="true">Tableau</button>
            <button type="button" aria-pressed="false" onclick="App.prodColonnes()">Colonnes</button>
          </div>
          <button type="button" class="pb-bouton" onclick="App.prodActualiser()">Actualiser</button>
        </div>
        <div class="pb-ligne" role="group" aria-label="Étapes">
          ${onglet('tous', 'Tous', base.filter(l => !l.parti).length)}
          ${PB_ETAPES.map(e => onglet(e.cle, e.nom, S.archiveLoaded || e.cle !== 'parti' ? nb(e.cle) : '…')).join('')}
        </div>
        <div class="pb-ligne">
          <span class="pb-etiquette">À traiter :</span>
          ${puce('retard', comptes.retard, 'en retard', 'rouge')}
          ${fichesOk ? puce('otAFaire', comptes.otAFaire, 'OT à faire', 'jaune') : ''}
          ${fichesOk ? puce('otAEnvoyer', comptes.otAEnvoyer, 'OT à envoyer à LOXAM', 'bleu') : ''}
          ${fichesOk ? puce('partisSansOt', comptes.partisSansOt, 'partis sans OT', 'violet') : ''}
          ${!this._otAutorise() ? '<span class="sx-aide">(état des OT : accès « Reconditionnement »)</span>' : (P.fichesChargement ? '<span class="sx-aide">état des OT…</span>' : '')}
          ${pret && !comptes.retard && !(fichesOk && (comptes.otAFaire || comptes.otAEnvoyer || comptes.partisSansOt)) ? '<span class="sx-aide">rien</span>' : ''}
        </div>
      </div></div>
      <main class="pb-contenu" id="pb-corps"></main>
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
    else if (P.onglet !== 'tous') lignes = lignes.filter(l => l.etape === P.onglet);
    // « Tous » : le parc, plus les partis encore sans OT (départs précipités) pour ne pas les perdre de vue
    else lignes = lignes.filter(l => !l.parti || l.otAFaire);

    const ordre = ['demarrer', 'atelier', 'controle', 'termine', 'pret', 'decote', 'parti'];
    const groupes = ordre.map(cle => {
      const e = PB_ETAPES.find(x => x.cle === cle);
      let titre = e.nom;
      if (cle === 'parti' && P.onglet === 'tous' && !P.filtre) titre = 'Partis sans OT (départs précipités)';
      const ls = lignes.filter(l => l.etape === cle);
      ls.sort((a, b) => (b.retard - a.retard) || String(a.d.debut || '').localeCompare(String(b.d.debut || '')));
      if (cle === 'parti') ls.sort((a, b) => (b.fin || 0) - (a.fin || 0));
      return { cle, titre, ls };
    }).filter(g => g.ls.length);

    if (!groupes.length) { el.innerHTML = '<div class="sx-carte"><div class="sx-vide">Aucun module ne correspond.</div></div>'; return; }

    const entete = `<div class="pb-grille pb-tete"><span>Code</span><span>N° module</span><span>Type</span><span>Agence · chantier</span>
      <span>Étape</span><span>Durée</span><span>Livraison</span><span>OT</span><span class="pb-droite">${admin ? 'Montant' : ''}</span><span>${admin ? 'Documents' : ''}</span><span>Fiche</span></div>`;
    el.innerHTML = `<div class="pb-tableau"><div class="pb-interieur">${entete}${groupes.map(g => `
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
    const duree = l.parti ? 'parti le ' + _fmtDateShort(d.fin) : _duration(d.debut, null);
    const liv = d.livraisonPrevue ? _fmtDateShort(d.livraisonPrevue) : '—';
    let ot = '<span class="pb-gris">—</span>';
    if (Array.isArray(S.pb.fiches)) {
      if (f) {
        const lib = { brouillon: 'Fiche en cours', a_valider: 'Fiche à valider' }[f.statut];
        ot = `<button type="button" class="pb-ot pb-ot-${_otEsc(f.statut)}" onclick="App.prodOuvrirFiche(${Number(f.id)})" title="Ouvrir la fiche d'opérations">${_otEsc(lib || f.numero_ot || 'Validée')}${f.statut === 'validee' ? ' · à envoyer' : ''}</button>`;
      } else if (l.otAFaire) ot = '<span class="pb-ot pb-ot-afaire">OT à faire</span>';
      else ot = '<span class="pb-gris">Pas de fiche</span>';
    }
    const docs = (admin && f && f.documents) ? (() => {
      const pdf = (f.documents.fichiers || []).find(x => x.type === 'pdf');
      return `${pdf && pdf.url ? `<a class="pb-doc" href="${_otEsc(pdf.url)}" target="_blank" rel="noopener">PDF</a>` : ''}
        ${f.documents.dossier ? `<a class="pb-doc" href="${_otEsc(f.documents.dossier)}" target="_blank" rel="noopener">Dossier OT</a>` : ''}`;
    })() : '';
    const code = _otEsc(d.code || '');
    return `<div class="pb-grille pb-ligne-module${l.retard ? ' pb-retard' : ''}${l.parti ? ' pb-parti' : ''}">
      <button type="button" class="pb-code" onclick="App.prodDossier('${code}', ${l.parti})" title="Ouvrir le dossier du module (photos, papiers d'arrivée et de départ)">${_PB_SVG_DOSSIER}${code}</button>
      <button type="button" class="pb-numero" onclick="App.prodOuvrirModule(${l.parti}, ${l.idx})" title="Ouvrir la fiche du module">${_otEsc(d.codeModule || '—')}</button>
      <span class="pb-type">${_otEsc(d.module || '')}</span>
      <span class="pb-texte" title="${_otEsc([d.ag, d.chantier].filter(Boolean).join(' · '))}">${_otEsc(d.chantier || '')}${d.status && d.status.grutage ? ' <span class="pb-grutage">grutage</span>' : ''}</span>
      <span class="pb-etape" title="${_otEsc(nomEtape)}">${barre}</span>
      <span class="pb-gris2">${_otEsc(duree)}</span>
      <span class="${l.retard ? 'pb-rouge' : (d.livraisonPrevue ? '' : 'pb-gris')}">${_otEsc(liv)}</span>
      <span>${ot}</span>
      <span class="pb-droite pb-montant">${admin && f && f.total_ht !== undefined && f.total_ht !== null && f.statut !== 'brouillon' ? _otEuros(f.total_ht) : ''}</span>
      <span class="pb-docs">${docs}</span>
      <button type="button" class="pb-poses" onclick="App.prodPoses(${l.parti}, ${l.idx})" title="Fiche d'opérations : saisir les poses">${_PB_SVG_CLE}Poses</button>
    </div>`;
  },
});
