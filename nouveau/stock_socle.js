// ═══════════════════════════════════════════════════════════════════════════
// STOCK — refonte sur le socle commun (maquette validée le 2026-10-27, codée le 2026-10-29)
// Écrans de consultation : accueil (alertes, dernières opérations), catalogue, fiche réf., historique.
// Données : celles du module Stock actuel (stock.js : S.stockData, S.stockAnalytics, S.historyData…),
// mêmes actions serveur. Les saisies passent encore par la fenêtre de saisie actuelle ; annuler une
// opération, compter (inventaire), sortir avec motif et réceptionner un BL viendront après
// l'inventaire du 4/11 (aucune fonction serveur du stock ne change avant).
// ═══════════════════════════════════════════════════════════════════════════

S.stk = {
  chargement: false, charge: false,
  recherche: '', famille: '', filtre: '',        // filtre catalogue : '' | 'mes' | 'seuil'
  ref: null, retour: 'stk-catalogue', mvts: null, mvtsRef: null, mvtsErreur: '',
  hist: { type: '', q: '', ouvert: null, limite: 80 },
};

const STK_TYPES = {
  'entrée':     { nom: 'Entrée',     cls: 'sx-stk-entree' },
  'sortie':     { nom: 'Sortie',     cls: 'sx-stk-sortie' },
  'pose':       { nom: 'Pose',       cls: 'sx-stk-pose' },
  'inventaire': { nom: 'Inventaire', cls: 'sx-stk-inv' },
};

Object.assign(App, {

  /* ─ Chargement (catalogue, favoris, analyse, historique) ─ */

  async _stkCharger(force = false) {
    if (S.stk.chargement || (S.stk.charge && !force)) return;
    S.stk.chargement = true;
    this._stkRendre();
    try {
      const lire = async (action, delai) => (await _fetchWithTimeout(S.apiUrl + '?action=' + action, {}, delai)).json();
      const [cat, prefs, ana] = await Promise.all([
        lire('stock_catalog', 40000), lire('stock_prefs', 10000).catch(() => ({})), lire('stock_analytics', 20000).catch(() => ({})),
      ]);
      if (cat.status !== 'ok') throw new Error(cat.error || 'catalogue indisponible');
      S.stockData = cat.data || []; S.stockFamilles = cat.familles || []; S.stockLoaded = true; S.catalogLoaded = true;
      if (prefs.status === 'ok') S.stockPrefs = new Set(prefs.prefs?.relevant || []);
      if (ana.status === 'ok') { S.stockAnalytics = ana.analytics || {}; S.analyticsLoaded = true; }
      S.stk.charge = true;
      if (force) S.historyLoaded = false;
    } catch (e) {
      this.toast('Stock indisponible : ' + e.message, 4000);
    } finally {
      S.stk.chargement = false;
    }
    this._stkRendre();
    if (!S.historyLoaded) { await this.loadStockHistory(true); this._stkRendre(); }
  },

  // Appelé par go() pour toute vue « stk-… »
  _stkAfficher(view) {
    if (!S.stk.charge) this._stkCharger();
    if (view === 'stk-fiche') this._stkChargerMvts(S.stk.ref);
    this._stkRendre();
  },

  _stkRendre() {
    if (!S.view || !S.view.startsWith('stk-')) return;
    const rendus = { 'stk-accueil': '_stkRendreAccueil', 'stk-catalogue': '_stkRendreCatalogue',
                     'stk-fiche': '_stkRendreFiche', 'stk-historique': '_stkRendreHistorique' };
    const f = rendus[S.view];
    if (f) this[f]();
  },

  /* ─ Utilitaires ─ */

  _stkArticle(ref) { return S.stockData.find(d => d.ref === ref); },
  _stkQte(d) { return d && d.qte !== null && d.qte !== undefined ? Number(d.qte) : null; },
  _stkSousSeuil(d) { const q = this._stkQte(d); return !!d && d.seuil > 0 && q !== null && q <= d.seuil; },
  _stkNombre(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); },
  _stkJours(d) {
    const q = this._stkQte(d), a = S.stockAnalytics[d.ref];
    if (q === null || !a || !(a.avgPerWeek > 0)) return null;
    return q <= 0 ? 0 : Math.round(q / (a.avgPerWeek / 7));
  },
  _stkHeure(iso) { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); },
  _stkJour(iso) {
    const d = new Date(iso), auj = new Date();
    const cle = x => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
    const hier = new Date(auj); hier.setDate(auj.getDate() - 1);
    const long = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (cle(d) === cle(auj)) return 'Aujourd\'hui';
    if (cle(d) === cle(hier)) return 'Hier · ' + long;
    return long.charAt(0).toUpperCase() + long.slice(1);
  },
  // Opération = mouvements enregistrés ensemble (même logique que l'historique actuel : _groupMovements)
  _stkOps() { return S.historyOps || []; },
  _stkTypeOp(op) { return this._opDisplayType(op.type, op.note || ''); },
  _stkTitreOp(op) {
    const t = this._stkTypeOp(op);
    if (t === 'pose') {
      const code = this._poseCode(op.note), reste = (op.note || '').replace(/^\[Pose\s+\S+\]\s*/, '').trim();
      return 'Module ' + (reste || code) + (reste && code ? ' · ' + code : '');
    }
    return op.note || STK_TYPES[t]?.nom || t;
  },
  _stkDetailOp(op) {
    const u = op.items.reduce((s, m) => s + (Number(m.qty) || 0), 0);
    return [op.items.length + ' réf.', this._stkNombre(u) + ' u.', op.items[0]?.user].filter(Boolean).join(' · ');
  },
  _stkBadge(type) {
    const t = STK_TYPES[type] || { nom: type, cls: '' };
    return `<span class="sx-stk-badge ${t.cls}">${_otEsc(t.nom)}</span>`;
  },
  _stkOnglets(actif) {
    const o = [['stk-accueil', 'Accueil'], ['stk-catalogue', 'Catalogue'], ['stk-historique', 'Historique']];
    return `<div class="sx-onglets sx-onglets-toujours" role="tablist" aria-label="Stock">${o.map(([v, n]) =>
      `<button type="button" class="sx-onglet" role="tab" aria-selected="${v === actif}" onclick="App.go('${v}')">${n}</button>`).join('')}</div>`;
  },
  _stkChargementHtml() {
    return S.stk.chargement && !S.stk.charge ? '<div class="sx-chargement">Chargement du stock…</div>' : '';
  },

  /* ═══════════════════════════════ ACCUEIL ═══════════════════════════════ */

  _stkRendreAccueil() {
    const el = document.getElementById('stk-accueil-root');
    if (!el) return;
    const alertes = S.stockData.filter(d => this._stkSousSeuil(d))
      .sort((a, b) => this._stkQte(a) / a.seuil - this._stkQte(b) / b.seuil);
    // La réf. qui va manquer le plus vite (consommation des 30 derniers jours), sous 3 semaines
    const rupture = S.stockData.map(d => ({ d, j: this._stkJours(d) })).filter(x => x.j !== null && x.j <= 21)
      .sort((a, b) => a.j - b.j)[0];
    const ops = this._stkOps().slice(0, 5);

    el.innerHTML = `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Accueil', action: 'App.goHome()' }, titre: 'Stock Pidem',
          sousTitre: S.stockData.length ? S.stockData.length + ' références' : '' })}
      ${this._stkOnglets('stk-accueil')}
      <main class="sx-contenu">
        <div class="sx-recherche">${_OT_SVG_LOUPE}
          <label for="stk-rech-accueil" class="sx-sr">Rechercher une pièce</label>
          <input id="stk-rech-accueil" type="search" placeholder="Réf., désignation, fournisseur…" autocomplete="off"
            oninput="App.stkChercherDepuisAccueil(this.value)">
        </div>
        <div class="sx-stk-tuiles">
          <button type="button" class="sx-stk-tuile sx-stk-tuile-principale" onclick="App.stkSaisir('sortie')">
            <span class="sx-stk-tuile-titre">Sortir des pièces</span><span class="sx-stk-tuile-aide">pose, agence, écart</span></button>
          <button type="button" class="sx-stk-tuile" onclick="App.stkSaisir('entrée')">
            <span class="sx-stk-tuile-titre">Réceptionner</span><span class="sx-stk-tuile-aide">une livraison (BL)</span></button>
        </div>
        ${this._stkChargementHtml()}
        ${S.stk.charge ? `<section class="sx-carte sx-carte-pad sx-stk-bloc" aria-labelledby="stk-t-alertes">
          <div class="sx-section-tete"><h2 class="sx-h2" id="stk-t-alertes">À surveiller</h2>
            ${alertes.length ? `<button type="button" class="sx-lien" onclick="App.stkCatalogueFiltre('seuil')">${alertes.length} sous le seuil</button>` : ''}</div>
          ${rupture ? `<button type="button" class="sx-stk-rupture" onclick="App.stkOuvrirFiche('${_otEsc(rupture.d.ref)}', 'stk-accueil')">
              <strong>${_otEsc(rupture.d.ref)} · ${_otEsc(rupture.d.description)}</strong> : ${this._stkNombre(this._stkQte(rupture.d))} en stock,
              ~${this._stkNombre(S.stockAnalytics[rupture.d.ref].avgPerWeek)} sorties / semaine →
              ${rupture.j <= 0 ? '<strong>rupture</strong>' : `rupture dans <strong>~${rupture.j} jour${rupture.j > 1 ? 's' : ''}</strong>`}</button>` : ''}
          ${alertes.length ? alertes.slice(0, 6).map(d => this._stkHtmlAlerte(d)).join('')
            : '<div class="sx-aide" style="padding:6px 0;">Aucune réf. sous son seuil.</div>'}
        </section>
        <section class="sx-section" aria-labelledby="stk-t-ops">
          <div class="sx-section-tete"><h2 class="sx-h2" id="stk-t-ops">Dernières opérations</h2>
            <button type="button" class="sx-lien" onclick="App.go('stk-historique')">Tout l'historique</button></div>
          ${ops.length ? `<div class="sx-carte">${ops.map(op => this._stkHtmlOpLigne(op)).join('')}</div>`
            : `<div class="sx-carte"><div class="sx-vide">${S.historyLoaded ? 'Aucune opération.' : 'Chargement…'}</div></div>`}
        </section>` : ''}
        <button type="button" class="sx-btn sx-btn-discret" onclick="App.go('stock-dashboard')">Écran actuel du stock (tableau de bord, import du catalogue…)</button>
      </main></div>`;
  },

  _stkHtmlAlerte(d) {
    const q = this._stkQte(d), pct = Math.max(4, Math.min(100, Math.round(q / d.seuil * 100)));
    return `<button type="button" class="sx-stk-alerte" onclick="App.stkOuvrirFiche('${_otEsc(d.ref)}', 'stk-accueil')">
      <span class="sx-ref">${_otEsc(d.ref)}</span>
      <span class="sx-stk-alerte-mil"><span class="sx-stk-nom">${_otEsc(d.description)}</span>
        <span class="sx-stk-barre"><span style="width:${pct}%"></span></span></span>
      <span class="sx-stk-alerte-q">${this._stkNombre(q)} / ${this._stkNombre(d.seuil)}</span></button>`;
  },

  _stkHtmlOpLigne(op) {
    const t = this._stkTypeOp(op);
    return `<button type="button" class="sx-item" onclick="App.stkOuvrirOp('${encodeURIComponent(op.key)}')">
      ${this._stkBadge(t)}
      <div class="sx-item-texte"><span class="sx-item-titre">${_otEsc(this._stkTitreOp(op))}</span>
        <span class="sx-item-detail">${_otEsc(this._stkDetailOp(op))} · ${_otEsc(this._stkJour(op.date).split(' · ')[0])} ${_otEsc(this._stkHeure(op.date))}</span></div>
    </button>`;
  },

  stkChercherDepuisAccueil(v) {
    S.stk.recherche = v; S.stk.filtre = ''; S.stk.famille = '';
    this.go('stk-catalogue');
    const champ = document.getElementById('stk-rech');
    if (champ) { champ.focus(); champ.setSelectionRange(v.length, v.length); }
  },
  stkCatalogueFiltre(f) { S.stk.filtre = f; S.stk.recherche = ''; S.stk.famille = ''; this.go('stk-catalogue'); },

  // Saisie : fenêtre actuelle (stock.js), en attendant les écrans Sortir / Réceptionner (après le 4/11).
  stkSaisir(type, ref) {
    this.openSaisieModal();
    this.setSaisieType(type);
    if (ref) this.addSaisieRef(ref);
  },

  /* ═══════════════════════════════ CATALOGUE ═══════════════════════════════ */

  _stkRendreCatalogue() {
    const el = document.getElementById('stk-catalogue-root');
    if (!el) return;
    const filtres = [['', 'Toutes'], ['mes', '★ Mes réf.'], ['seuil', 'Sous le seuil']];
    el.innerHTML = `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Accueil', action: 'App.goHome()' }, titre: 'Stock Pidem', sousTitre: 'Catalogue' })}
      ${this._stkOnglets('stk-catalogue')}
      <main class="sx-contenu">
        <div class="sx-recherche">${_OT_SVG_LOUPE}
          <label for="stk-rech" class="sx-sr">Rechercher une pièce</label>
          <input id="stk-rech" type="search" placeholder="Réf., désignation, fournisseur…" autocomplete="off"
            value="${_otEsc(S.stk.recherche)}" oninput="S.stk.recherche=this.value;App._stkListe()">
        </div>
        <div class="sx-ligne-champs">
          ${filtres.map(([k, n]) => `<button type="button" class="sx-bascule sx-filtre" aria-pressed="${S.stk.filtre === k}"
              onclick="S.stk.filtre='${k}';App._stkRendreCatalogue()">${n}</button>`).join('')}
          <label for="stk-famille" class="sx-sr">Famille</label>
          <select id="stk-famille" class="sx-select" style="flex:1 1 160px;" onchange="S.stk.famille=this.value;App._stkListe()">
            <option value="">Toutes les familles</option>
            ${(S.stockFamilles || []).map(f => `<option value="${_otEsc(f)}" ${S.stk.famille === f ? 'selected' : ''}>${_otEsc(f)}</option>`).join('')}
          </select>
        </div>
        ${this._stkChargementHtml()}
        <span class="sx-aide" id="stk-compte"></span>
        <div class="sx-carte" id="stk-liste"></div>
      </main></div>`;
    this._stkListe();
  },

  _stkListe() {
    const el = document.getElementById('stk-liste');
    if (!el) return;
    const q = S.stk.recherche.trim().toLowerCase();
    let items = S.stockData;
    if (S.stk.filtre === 'mes') items = items.filter(d => S.stockPrefs.has(d.ref));
    if (S.stk.filtre === 'seuil') items = items.filter(d => this._stkSousSeuil(d));
    if (S.stk.famille) items = items.filter(d => d.famille === S.stk.famille);
    if (q) items = items.filter(d => d.ref.toLowerCase().startsWith(q) || (d.description || '').toLowerCase().includes(q)
      || (d.fournisseur || '').toLowerCase().includes(q) || (d.refFourn || '').toLowerCase().includes(q));
    const compte = document.getElementById('stk-compte');
    if (compte) compte.textContent = S.stk.charge ? `${items.length} réf. sur ${S.stockData.length}` : '';
    if (!S.stk.charge) { el.innerHTML = ''; return; }
    if (!items.length) { el.innerHTML = '<div class="sx-vide">Aucune référence ne correspond.</div>'; return; }
    el.innerHTML = items.map(d => {
      const qte = this._stkQte(d), bas = this._stkSousSeuil(d), fav = S.stockPrefs.has(d.ref);
      return `<div class="sx-stk-ligne">
        <button type="button" class="sx-stk-etoile" aria-pressed="${fav}" aria-label="${fav ? 'Retirer de' : 'Ajouter à'} mes références"
          onclick="App.stkFavori('${_otEsc(d.ref)}')">${fav ? '★' : '☆'}</button>
        <button type="button" class="sx-stk-ligne-corps" onclick="App.stkOuvrirFiche('${_otEsc(d.ref)}', 'stk-catalogue')">
          <span class="sx-ref">${_otEsc(d.ref)}</span>
          <span class="sx-stk-ligne-texte"><span class="sx-stk-nom">${_otEsc(d.description)}</span>
            <span class="sx-aide">${_otEsc([d.famille, d.fournisseur].filter(Boolean).join(' · '))}${d.retiree ? ' · retirée du catalogue client' : ''}</span></span>
          <span class="sx-stk-qte${bas ? ' sx-stk-bas' : ''}">${this._stkNombre(qte)}${d.seuil > 0 ? `<small> / ${this._stkNombre(d.seuil)}</small>` : ''}</span>
        </button></div>`;
    }).join('');
  },

  async stkFavori(ref) {
    await this.toggleStockPref(ref);       // stock.js : enregistre « Mes références »
    if (S.view === 'stk-catalogue') this._stkListe(); else this._stkRendre();
  },

  /* ═══════════════════════════════ FICHE RÉF. ═══════════════════════════════ */

  stkOuvrirFiche(ref, retour) {
    S.stk.ref = ref;
    S.stk.retour = retour || S.view || 'stk-catalogue';
    this.go('stk-fiche');
  },

  async _stkChargerMvts(ref) {
    if (!ref || S.stk.mvtsRef === ref) return;
    S.stk.mvtsRef = ref; S.stk.mvts = null; S.stk.mvtsErreur = '';
    try {
      const d = await (await _fetchWithTimeout(S.apiUrl + '?action=stock_mouvements&ref=' + encodeURIComponent(ref), {}, 20000)).json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur');
      if (S.stk.mvtsRef === ref) S.stk.mvts = (d.mouvements || []).slice().reverse();
    } catch (e) {
      if (S.stk.mvtsRef === ref) S.stk.mvtsErreur = e.message;
    }
    if (S.view === 'stk-fiche' && S.stk.ref === ref) this._stkRendreFiche();
  },

  _stkRendreFiche() {
    const el = document.getElementById('stk-fiche-root');
    if (!el) return;
    const d = this._stkArticle(S.stk.ref);
    const retours = { 'stk-accueil': 'Accueil', 'stk-catalogue': 'Catalogue', 'stk-historique': 'Historique' };
    const entete = this._otEntete({ retour: { texte: retours[S.stk.retour] || 'Catalogue', action: `App.go('${S.stk.retour}')` },
      titre: d ? d.ref + ' · ' + d.description : S.stk.ref || '', sousTitre: d ? [d.famille, d.fournisseur, d.refFourn].filter(Boolean).join(' · ') : '' });
    if (!d) {
      el.innerHTML = `<div class="sx-ecran">${entete}<main class="sx-contenu">${this._stkChargementHtml()
        || '<div class="sx-carte"><div class="sx-vide">Référence introuvable dans le catalogue.</div></div>'}</main></div>`;
      return;
    }
    const q = this._stkQte(d), a = S.stockAnalytics[d.ref] || {}, fav = S.stockPrefs.has(d.ref);
    const bas = this._stkSousSeuil(d);
    const max = Math.max(q || 0, (d.seuil || 0) * 2, 1);
    const sem = a.avgPerWeek > 0 && q !== null ? q / a.avgPerWeek : null;
    const statut = q === null ? ['Stock inconnu', ''] : bas ? ['Sous le seuil', 'sx-stk-chip-bas'] : d.seuil > 0 ? ['OK · au-dessus du seuil', 'sx-stk-chip-ok'] : ['Pas de seuil', ''];

    el.innerHTML = `<div class="sx-ecran">${entete}
      <main class="sx-contenu">
        ${d.retiree ? '<div class="sx-bandeau sx-bandeau-info">Retirée du dernier catalogue du client, encore en stock.</div>' : ''}
        <section class="sx-carte sx-carte-pad sx-stk-bloc" aria-label="Stock">
          <div class="sx-stk-stock">
            <div><span class="sx-aide">En stock</span><span class="sx-stk-gros">${this._stkNombre(q)}</span></div>
            <span class="sx-stk-chip ${statut[1]}">${statut[0]}</span>
          </div>
          <div class="sx-stk-jauge" aria-hidden="true"><span style="width:${Math.max(2, Math.min(100, (q || 0) / max * 100))}%"></span>
            ${d.seuil > 0 ? `<i style="left:${Math.min(100, d.seuil / max * 100)}%"></i>` : ''}</div>
          <div class="sx-stk-chiffres">
            <div><span>Seuil</span><b>${d.seuil > 0 ? this._stkNombre(d.seuil) : '—'}</b></div>
            <div><span>Sorties / sem.</span><b>${a.avgPerWeek > 0 ? this._stkNombre(a.avgPerWeek) : '—'}</b></div>
            <div><span>Couverture</span><b>${sem === null ? '—' : sem < 1 ? '< 1 sem.' : '~' + Math.round(sem) + ' sem.'}</b></div>
          </div>
          <div class="sx-ligne-champs">
            <button type="button" class="sx-lien" onclick="App.openSeuilModal('${_otEsc(d.ref)}')">Modifier le seuil</button>
            <button type="button" class="sx-lien" aria-pressed="${fav}" onclick="App.stkFavori('${_otEsc(d.ref)}')">${fav ? '★ Dans mes références' : '☆ Ajouter à mes références'}</button>
          </div>
        </section>
        <div class="sx-stk-tuiles">
          <button type="button" class="sx-btn sx-btn-second" onclick="App.stkSaisir('entrée', '${_otEsc(d.ref)}')">Entrée</button>
          <button type="button" class="sx-btn sx-btn-principal" onclick="App.stkSaisir('sortie', '${_otEsc(d.ref)}')">Sortie</button>
        </div>
        <section class="sx-carte sx-carte-pad sx-stk-prix">
          <span class="sx-aide">Prix client HT</span><b>${d.prixHT ? _otEuros(d.prixHT) : '—'}</b>
        </section>
        <section class="sx-section" aria-labelledby="stk-t-mvts">
          <div class="sx-section-tete"><h2 class="sx-h2" id="stk-t-mvts">Derniers mouvements</h2>
            <span class="sx-aide">${a.exits30d ? this._stkNombre(a.exits30d) + ' sorties sur 30 jours' : ''}</span></div>
          <div class="sx-carte">${this._stkHtmlMvts()}</div>
        </section>
      </main></div>`;
  },

  _stkHtmlMvts() {
    if (S.stk.mvtsErreur) return `<div class="sx-vide">Mouvements indisponibles : ${_otEsc(S.stk.mvtsErreur)}</div>`;
    if (!S.stk.mvts) return '<div class="sx-vide">Chargement des mouvements…</div>';
    if (!S.stk.mvts.length) return '<div class="sx-vide">Aucun mouvement.</div>';
    return S.stk.mvts.slice(0, 15).map(m => {
      const t = this._opDisplayType(m.type, m.note || '');
      const signe = m.type === 'entrée' ? '+' : m.type === 'sortie' ? '−' : '= ';
      const op = t === 'pose' ? this._stkTitreOp({ type: m.type, note: m.note }) : (m.note || STK_TYPES[t]?.nom || t);
      return `<div class="sx-stk-mvt">
        <span class="sx-stk-mvt-q ${STK_TYPES[t]?.cls || ''}">${signe}${this._stkNombre(m.qty)}</span>
        <span class="sx-stk-ligne-texte"><span class="sx-stk-nom">${_otEsc((STK_TYPES[t]?.nom || t) + (op && t !== 'pose' && op !== STK_TYPES[t]?.nom ? ' · ' + op : t === 'pose' ? ' · ' + op : ''))}</span>
          <span class="sx-aide">${_otEsc([m.user, this._stkJour(m.date).split(' · ')[0] + ' ' + this._stkHeure(m.date)].filter(Boolean).join(' · '))}</span></span>
      </div>`;
    }).join('');
  },

  /* ═══════════════════════════════ HISTORIQUE ═══════════════════════════════ */

  stkOuvrirOp(cle) {
    S.stk.hist = { ...S.stk.hist, type: '', q: '', ouvert: decodeURIComponent(cle), defiler: true };
    this.go('stk-historique');
  },

  _stkRendreHistorique() {
    const el = document.getElementById('stk-historique-root');
    if (!el) return;
    const filtres = [['', 'Tout'], ['entrée', 'Entrées'], ['sortie', 'Sorties'], ['pose', 'Poses'], ['inventaire', 'Inventaires']];
    el.innerHTML = `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Accueil', action: 'App.goHome()' }, titre: 'Stock Pidem', sousTitre: 'Historique' })}
      ${this._stkOnglets('stk-historique')}
      <main class="sx-contenu">
        <div class="sx-recherche">${_OT_SVG_LOUPE}
          <label for="stk-rech-hist" class="sx-sr">Rechercher dans l'historique</label>
          <input id="stk-rech-hist" type="search" placeholder="Réf., n° de BL, module, personne…" autocomplete="off"
            value="${_otEsc(S.stk.hist.q)}" oninput="S.stk.hist.q=this.value;S.stk.hist.limite=80;App._stkHistListe()">
        </div>
        <div class="sx-ligne-champs" role="group" aria-label="Filtrer par type">
          ${filtres.map(([k, n]) => `<button type="button" class="sx-bascule sx-filtre" aria-pressed="${S.stk.hist.type === k}"
              onclick="S.stk.hist.type='${k}';S.stk.hist.limite=80;App._stkRendreHistorique()">${n}</button>`).join('')}
        </div>
        <div id="stk-hist-liste" class="sx-stk-hist"></div>
      </main></div>`;
    this._stkHistListe();
  },

  _stkHistListe() {
    const el = document.getElementById('stk-hist-liste');
    if (!el) return;
    if (!S.historyLoaded) { el.innerHTML = '<div class="sx-chargement">Chargement de l\'historique…</div>'; return; }
    const { type, q } = S.stk.hist;
    const rq = q.trim().toLowerCase();
    let ops = this._stkOps();
    if (type) ops = ops.filter(op => this._stkTypeOp(op) === type);
    if (rq) ops = ops.filter(op => (op.note || '').toLowerCase().includes(rq)
      || (op.items[0]?.user || '').toLowerCase().includes(rq)
      || op.items.some(m => m.ref.toLowerCase().startsWith(rq) || (this._stkArticle(m.ref)?.description || '').toLowerCase().includes(rq)));
    if (!ops.length) { el.innerHTML = '<div class="sx-carte"><div class="sx-vide">Aucune opération trouvée.</div></div>'; return; }
    // L'opération ouverte depuis l'accueil reste visible même au-delà de la limite
    const io = ops.findIndex(op => op.key === S.stk.hist.ouvert);
    const limite = Math.max(S.stk.hist.limite, io + 1);
    let h = '', jour = '';
    ops.slice(0, limite).forEach(op => {
      const j = this._stkJour(op.date);
      if (j !== jour) { h += `<h2 class="sx-stk-jour">${_otEsc(j)}</h2>`; jour = j; }
      h += this._stkHtmlOp(op);
    });
    if (ops.length > limite) h += `<button type="button" class="sx-btn sx-btn-discret" onclick="S.stk.hist.limite+=120;App._stkHistListe()">
      Afficher plus (${ops.length - limite} opérations de plus)</button>`;
    el.innerHTML = h;
    // Ouverte depuis l'accueil : on l'amène à l'écran (une seule fois, pas à chaque clic)
    if (io >= 0 && S.stk.hist.defiler) document.getElementById('stk-op-ouverte')?.scrollIntoView({ block: 'center' });
    S.stk.hist.defiler = false;
  },

  _stkHtmlOp(op) {
    const t = this._stkTypeOp(op), ouvert = op.key === S.stk.hist.ouvert;
    return `<article class="sx-carte sx-stk-op${ouvert ? ' sx-stk-op-ouverte' : ''}" ${ouvert ? 'id="stk-op-ouverte"' : ''}>
      <button type="button" class="sx-stk-op-tete" aria-expanded="${ouvert}" onclick="App.stkBasculerOp('${encodeURIComponent(op.key)}')">
        ${this._stkBadge(t)}
        <span class="sx-stk-ligne-texte"><span class="sx-stk-nom" style="font-weight:600;">${_otEsc(this._stkTitreOp(op))}</span>
          <span class="sx-aide">${_otEsc(this._stkDetailOp(op))}</span></span>
        <span class="sx-aide">${_otEsc(this._stkHeure(op.date))}</span>
      </button>
      ${ouvert ? `<div class="sx-stk-op-corps">${op.items.map(m => `<div class="sx-stk-op-ligne">
          <button type="button" class="sx-lien sx-ref" onclick="App.stkOuvrirFiche('${_otEsc(m.ref)}', 'stk-historique')">${_otEsc(m.ref)}</button>
          <span class="sx-stk-nom">${_otEsc(this._stkArticle(m.ref)?.description || '')}</span>
          <b>${t === 'entrée' ? '+' : t === 'inventaire' ? '= ' : '−'}${this._stkNombre(m.qty)}</b></div>`).join('')}
        ${op.note && t !== 'pose' ? `<span class="sx-aide">Note : ${_otEsc(op.note)}</span>` : ''}
      </div>` : ''}
    </article>`;
  },

  stkBasculerOp(cle) {
    const k = decodeURIComponent(cle);
    S.stk.hist.ouvert = S.stk.hist.ouvert === k ? null : k;
    this._stkHistListe();
  },
});
