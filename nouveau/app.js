// ── CONSTANTES ──────────────────────────────────────────────────────────────
const MODULES = {
  loxam:      { label: 'LOXAM / PIDEO', icon: '🏗️', iconBg: '#EBF5FB' },
  bcb:        { label: 'BCB',           icon: '🚛', iconBg: '#FEF3E8' },
  agorastore: { label: 'Agorastore',    icon: '🏷️', iconBg: '#F5EEF8' },
  rapido:     { label: 'Rapido',        icon: '⚡', iconBg: '#F0FDF4' },
};
const SK = {
  API:           'snt_api_url',
  CODES:         'snt_codes',
  CODES_TS:      'snt_codes_ts',
  HISTORY:       'snt_history',
  CODE_STOCK:    'snt_code_stock',
  OFFLINE_QUEUE: 'snt_offline_queue',
  STOCK_FILTER:  'snt_stock_filter',
};
const CODES_TTL = 30 * 60 * 1000; // 30 min
const ARR_SOURCES = {
  loxam:      { label: 'LOXAM',      icon: '🏗️', bg: '#EBF5FB', color: '#1A5276' },
  bcb:        { label: 'BCB',        icon: '🚛', bg: '#FEF3E8', color: '#7D2A00' },
  agorastore: { label: 'Agorastore', icon: '🏷️', bg: '#F5EEF8', color: '#5B2C6F' },
  rapido:     { label: 'Rapido',     icon: '⚡', bg: '#F0FDF4', color: '#14532D' },
};
// ── STATE ────────────────────────────────────────────────────────────────────
const S = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  currentUser:  null,      // { prenom, nom, role, activites } — stocké en localStorage
  pinBuffer:    '',        // chiffres saisis (envoyés au serveur en HTTPS, jamais stockés)
  pinMode:      'login',   // 'login' | 'change_old' | 'change_new' | 'change_confirm'
  _pinOld:      null,      // PIN actuel / nouveau, le temps du changement de PIN
  _pinNew:      null,
  // ── Navigation ────────────────────────────────────────────────────────────
  view:        'home',
  prevView:    'home',
  activity:    null,   // null = accueil | 'loxam' | 'bcb' | 'agora' | 'stockage'
  apiUrl:      localStorage.getItem(SK.API) || '',
  codes:       new Set(JSON.parse(localStorage.getItem(SK.CODES) || '[]')),
  codesTs:     +(localStorage.getItem(SK.CODES_TS) || 0),
  codeStock:    JSON.parse(localStorage.getItem(SK.CODE_STOCK)    || '[]'),
  offlineQueue: JSON.parse(localStorage.getItem(SK.OFFLINE_QUEUE) || '[]'),
  history:      JSON.parse(localStorage.getItem(SK.HISTORY) || '[]'),
  depPhotosLog: {},   // chargé depuis Drive au démarrage (dep_photos_log.json)
  arrPhotosLog: {},   // chargé depuis Drive au démarrage (arr_photos_log.json)
  online:      navigator.onLine,
  // Arrival form
  arr: {
    step: 1, module: null, code: '',
    photos: [],          // [{dataUrl, name}]
    chauffeur: '', date: '', etat: '',
    // Champs LOXAM spécifiques
    moduleType: '', numModule: '', lv: '', agence: '',
    longueur: '',
  },
  // Departure / Production
  deps:       [],
  depsLoaded:    false,
  depsLoading:   false,
  historyLoading:false,
  selDep:     null,
  depPhotos:  [],      // [{dataUrl}]
  arrPhotos:  [],      // [{dataUrl}] photos arrivée supplémentaires
  depFilter:       'all',   // 'all' | 'enCours' | 'aControler' | 'termine' | 'deCote'
  depModuleFilter: 'all',   // 'all' | nom du module (col F)
  depSortAsc:      true,    // true = En cours→Terminé ; false = Terminé→En cours
  depScope:        'actifs',// 'actifs' | 'avecPartis'
  depSearch:       '',      // recherche texte libre
  depDateFrom:     '',      // 'YYYY-MM-DD' ou vide
  depDateTo:       '',      // 'YYYY-MM-DD' ou vide
  depFiltersOpen:  false,   // panneau filtres détaillés ouvert/fermé
  depSelectMode:   false,   // mode sélection multi-modules pour créer LV
  depSelected:     new Set(),
  // Arrivals (depuis serveur)
  arrivalsData:    [],
  arrivalsSummary: {},
  arrivalsLoaded:  false,
  arrTypeFilter:   'all',
  arrPartiFilter:  'present',  // 'present' par défaut → chargement initial léger
  arrFullLoaded:   false,      // true une fois les partis aussi chargés
  selArrival:      null,
  // Archive (Partis)
  archive:        [],
  archiveLoaded:  false,
  depFromArchive: false,
  submitting: false,
  // ── Stockage ─────────────────────────────────────────────────────────────
  stockData:     [],       // catalogue complet
  stockLoaded:   false,
  catalogLoaded:  false,   // true dès que stockData est peuplé (prefetch ou full load)
  catalogLoading: false,
  stockPrefs:    new Set(),// refs marquées "mes références"
  stockFamilles: [],       // valeurs uniques pour le filtre
  stockFilter: (() => { try { const s = JSON.parse(localStorage.getItem(SK.STOCK_FILTER)||'{}'); return { search:'', famille:'', myRefs:!!s.myRefs, alerts:!!s.alerts }; } catch(e) { return { search:'', famille:'', myRefs:false, alerts:false }; } })(),
  stockPhotos:    {},      // { ref: thumbFileId } — chargé à la demande
  stockShowThumbs: false,  // toggle miniatures
  selStockRef:    null,    // référence ouverte dans la vue détail
  stockDeltas:    {},      // { ref: { delta, invQty, lastDate } } — mouvements cumulés
  selMvType:      null,    // type de mouvement en cours de saisie
  // ── Saisie groupée ────────────────────────────────────────────────────
  batchMvType:    null,    // type actif du batch
  batchItems:     {},      // { ref: qty } — quantités saisies

  // ── Historique ────────────────────────────────────────────────────────
  historyData:    [],      // mouvements bruts ({ date, ref, type, qty, user, note })
  historyOps:     [],      // opérations groupées (calculé côté client)
  historyLoaded:  false,
  histFilter:     { type: '', search: '' },
  selHistProd:    null,      // référence produit sélectionnée dans "Par produit"
  poseHistory:    new Set(), // codes modules ayant au moins une pose enregistrée
  poseViewItems:  [],        // cache des mouvements de pose affichés dans le modal (pour suppression par index)
  // ── Saisie rapide (dashboard) ─────────────────────────────────────────
  saisieItems:    {},        // { ref: qty }
  saisieType:     'entrée',
  saisieNote:     '',
  // ── Saisie pose depuis LOXAM ─────────────────────────────────────────
  poseItems:      {},      // { ref: qty } — pose en cours de saisie
  poseModuleCode: null,    // code du module (ex: 'PRGYGB')
  poseModuleLabel:'',      // label affiché dans la modale
  // ── Layer 2 — Intelligence ────────────────────────────────────────────
  stockAnalytics:  {},     // { ref: { avgPerWeek, trend, exits30d, entries30d, lastDate } }
  analyticsLoaded: false,
  // ── Layer 3 — Dashboard ───────────────────────────────────────────────
  stockRecentMvs:  [],     // derniers N mouvements toutes refs confondues
  dashboardLoaded: false,
  dashMvtLimit:    10,     // nb d'opérations affichées dans "mouvements récents"
  // ── Layer 1 — Sync ────────────────────────────────────────────────────
  stockSyncData:   null,   // { new, modified, deleted, unchangedCount, savedAt, isInitial }
  syncLoading:     false,
  // ── Import XLS ───────────────────────────────────────────────────────────
  _xlsWorkbook:    null,   // workbook SheetJS brut
  _xlsRawRows:     null,   // lignes de l'onglet sélectionné
  _xlsConfig:      null,   // { sheetName, headerRowIdx, dataRowIdx, colMap }
  _xlsParsed:      null,   // données parsées prêtes à envoyer
  _xlsFileName:    null,
  // ── BCB ──────────────────────────────────────────────────────────────────
  bcbLang:         null,   // langue sélectionnée pour les consignes
  bcbLots:         [],     // lots non partis (depuis endpoint bcb_lots)
  bcbByBuyer:      {},     // { acheteur: [lot,...] }
  bcbLotsLoaded:   false,
  bcbLotsLoading:  false,
  bcbLotsSearch:   '',
  bcbLotsView:     'lots',
  bcbStatusFilter: { arrive: null, inspecte: null, vendu: null }, // null=tous | true=oui | false=non
  bcbSortField:    'default',  // 'default' | 'id_desc' | 'date_asc' | 'date_desc'
  bcbSelectMode:   false,
  bcbSelected:     new Set(),
  bcbLotsFilters:  { acheteur: null, vendeur: null, vente: null },
  bcbActiveFilter: null,
  bcbImp:          { step:1, rows:[], matched:[], notInFile:[] },
  bcbSelLot:         null,
  bcbDepartConsigne:     null,
  bcbDepartSelected:     new Set(),
  bcbDepartBuyer:        null,
  bcbPrepMode:           false,
  bcbEnlevements:        [],
  bcbEnlevementsLoaded:  false,
  bcbEnlevementsLoading: false,
  bcbCurEnlevement:      null,
  bcbEnlevPhotos:        [],
  // ── LVU ──────────────────────────────────────────────────────────────────
  lvLinks: {},        // { opKey: { numero, display, date } } — chargé au prefetch
  annuaireData: [],   // [{code,nom,adresse,cp,ville,email,tel,note}]
  annuaireLoaded: false,
  lvu: {
    source:        'manual',
    type:          'LV',
    numero:        null,
    display:       null,
    loxamItems:    [],
    selectedItems: new Set(),
    bcbArrivals:   [],
    selectedBcb:   new Set(),
    generating:    false,
    lastDoc:       null,
    lastData:      null,
    transporteur:  null,
    agencies:      [],
    fromOpKey:     null,  // clé de l'opération stock à l'origine de la LV
    fromOpNote:    '',    // note/BL de cette opération
  },
};
// ── APP ──────────────────────────────────────────────────────────────────────
const App = {
  /* ─ Navigation ─ */
  go(view) {
    if (S.view === 'lvu-form' && view !== 'lvu-form' && S.lvu.lastDoc) this.lvuNew();
    if (S.view === 'departures' && view !== 'departures' && S.depSelectMode) {
      S.depSelectMode = false;
      S.depSelected.clear();
    }
    if (S.view === 'lvu-history' && view !== 'lvu-history') this._lvuUnsubscribeHistoryRealtime();
    if (S.view === 'ot-fiche' && view !== 'ot-fiche' && S.ot.rev !== S.ot.revEnvoyee) this._otEnregistrer();
    S.prevView = S.view;
    S.view = view;
    if (view === 'loxam-menu') S.activity = 'loxam'; // reset avant _render pour les tabs nav
    this._render();
    if (view === 'loxam-menu') this.loxamMenuInit();
    if (view === 'arrivals' && !S.arrivalsLoaded) this.loadArrivalsData();
    if (view === 'history')    this._renderHistory();
    if (view === 'departures') { if (S.depsLoaded) this._renderDepList(); else if (!S.depsLoading) this.loadDepartures(); }
    if (view === 'archive'    && !S.archiveLoaded) this.loadArchive();
    if (view === 'settings')   this._fillSettings();
    if (view === 'stock-dashboard') this.loadStockDashboard();
    if (view === 'stock') { if (!S.stockLoaded) this.loadStockCatalog(); else this._renderStockList(); }
    if (view === 'stock-detail') this._renderStockDetail();
    if (view === 'stock-history') { if (!S.historyLoaded) this.loadStockHistory(); else this._renderHistoryList(); }
    if (view === 'stock-sync')   this.loadStockSync();
    if (view === 'bcb-menu')      this.bcbMenuInit();
    if (view === 'bcb-lots')      this.bcbLotsLoad();
    if (view === 'bcb-import')    this.bcbImportInit();
    if (view === 'bcb-consignes') this.bcbInitLangGrid();
    if (view === 'bcb-depart')      this.bcbDepartInit();
    if (view === 'bcb-enlevements') this.bcbEnlevementsLoad();
    if (view === 'lvu-form')      { this._lvuRenderMarchandises(); this._lvuChargerAnnulees(); }
    if (view === 'lvu-history')   { this.lvuLoadHistory(); this._lvuSubscribeHistoryRealtime(); }
    if (view === 'annuaire')      this.annuaireLoad();
    if (view === 'ot-liste')      this.otChargerListe();
    if (view === 'ot-fiche')      this._otRendreFiche();
    if (view === 'ot-tarifs')     this.otTarifsInit();
  },
  breadcrumbGoActivity() {
    const map = { loxam:'loxam-menu', bcb:'bcb-menu', stockage:'loxam-menu' };
    const dest = map[S.activity];
    if (dest) { if (S.view !== dest) this.go(dest); return; }
    if (S.activity === 'lvu')        this.lvuInit();
    else if (S.activity === 'annuaire')  this.go('annuaire');
    else if (S.activity === 'reception') this.goHome();
  },
  goBack() {
    if (S.view === 'admin')           { this.goHome(); return; }
    if (S.view === 'stock-detail')    { this.go('stock'); return; }
    if (S.view === 'bcb-lot-detail')  { this.go('bcb-lots'); return; }
    if (S.view === 'bcb-enlevement')  { this.go('bcb-enlevements'); return; }
    this.go(S.prevView);
  },

  /* ─ Accueil multi-activité ─ */
  goHome() {
    S.activity = null;
    S.prevView  = S.view;
    S.view      = 'home';
    this._render();
  },
  selectActivity(name) {
    const ready = { loxam: true, stockage: true, bcb: true, lvu: true, annuaire: true };
    if (!ready[name]) {
      this.toast('Cette activité est en cours de développement 🚧');
      return;
    }
    // Contrôle d'accès : les admins ont accès à tout, sinon vérifier activites[]
    const isAdmin = S.currentUser?.role === 'admin';
    if (!isAdmin) {
      const userActs = S.currentUser?.activites || [];
      if (!userActs.includes(name)) {
        this.toast('⛔ Vous n\'avez pas accès à cette activité');
        return;
      }
    }
    S.activity = name;
    if (name === 'loxam')    this.go('loxam-menu');
    if (name === 'stockage') this.go('stock-dashboard');
    if (name === 'bcb')      this.go('bcb-menu');
    if (name === 'lvu')      this.lvuInit();
    if (name === 'annuaire')  this.go('annuaire');
  },
  receptionDirecte() {
    S.activity = 'reception';
    this.startNewArrival();
  },
  _render() {
    const v      = S.view;
    const onHome = v === 'home';
    // Écrans du socle commun (socle.css) : ils portent leur propre en-tête.
    document.body.classList.toggle('socle', v.startsWith('ot-'));

    // ── Nav : cachée sur l'accueil, tabs selon activité ─────────────────
    const nav = document.getElementById('main-nav');
    if (nav) nav.style.display = onHome ? 'none' : '';
    document.querySelectorAll('#main-nav .nav-tab[data-tab]').forEach(el => {
      el.style.display = (S.activity === 'loxam' && v !== 'loxam-menu') ? '' : 'none';
    });
    document.querySelectorAll('#main-nav .nav-tab[data-stab]').forEach(el => {
      const isAdmin   = S.currentUser?.role === 'admin';
      const isSynchro = el.dataset.stab === 'stock-sync';
      el.style.display = (S.activity === 'stockage' && (!isSynchro || isAdmin)) ? '' : 'none';
    });
    document.querySelectorAll('#main-nav .nav-tab[data-bcbtab]').forEach(el => {
      el.style.display = (S.activity === 'bcb' && v !== 'bcb-menu') ? '' : 'none';
    });
    document.querySelectorAll('#main-nav .nav-tab[data-lvutab]').forEach(el => {
      el.style.display = (S.activity === 'lvu') ? '' : 'none';
    });

    // ── Views : affiche la vue active ────────────────────────────────────
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const mapId  = { 'dep-detail': 'dep-detail', 'arr-detail': 'arr-detail' };
    const viewId = 'view-' + (mapId[v] || v);
    const el     = document.getElementById(viewId);
    if (el) el.classList.add('active');

    // ── Nav tabs : onglet actif (LOXAM + Stockage + BCB) ───────────────
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`[data-tab="${v}"]`) || document.querySelector(`[data-stab="${v}"]`) || document.querySelector(`[data-bcbtab="${v}"]`) || document.querySelector(`[data-lvutab="${v}"]`);
    if (tab) tab.classList.add('active');
    // BCB menu → aucun tab actif (vue d'accueil)
    // BCB consignes → tab "Consignes" reste actif sur toutes les étapes
    if (v === 'bcb-consignes') {
      const t2 = document.querySelector('[data-bcbtab="bcb-consignes"]');
      if (t2) t2.classList.add('active');
    }
    // Tableau de bord stockage = tab "Tableau"
    if (['stock-dashboard'].includes(v)) {
      const t2 = document.querySelector('[data-stab="stock-dashboard"]');
      if (t2) t2.classList.add('active');
    }

    // ── FAB : visible selon la vue ───────────────────────────────────────
    const fab = document.getElementById('fab');
    if (fab) fab.style.display = (v === 'arrivals') ? 'flex' : 'none';
    const fabDep = document.getElementById('fab-dep');
    if (fabDep) fabDep.style.display = (v === 'departures') ? 'flex' : 'none';

    // ── Header : back button / logo / breadcrumb ─────────────────────────
    const inForm = ['new-arrival','settings','dep-detail','arr-detail','stock-detail','bcb-enlevement','bcb-lot-detail'].includes(v);
    document.getElementById('btn-back').classList.toggle('hidden', !inForm);
    const showBreadcrumb = !onHome && !inForm && !!S.activity;
    document.getElementById('header-logo').style.display       = (!showBreadcrumb && !inForm) ? 'flex' : 'none';
    const bcEl  = document.getElementById('header-breadcrumb');
    const actEl = document.getElementById('breadcrumb-activity');
    if (bcEl) bcEl.style.display = showBreadcrumb ? 'flex' : 'none';
    if (showBreadcrumb && actEl) {
      const names = { loxam:'LOXAM', bcb:'BCB', stockage:'LOXAM', lvu:'LV / CMR', annuaire:'Annuaire',reception:'Réception' };
      actEl.textContent = names[S.activity] || S.activity;
    }

    // Labels du bouton retour
    const backLabels = {
      'new-arrival':       'Annuler',
      'settings':          'Réglages',
      'dep-detail':        S.depFromArchive ? 'Partis' : 'Production',
      'arr-detail':        'Arrivées',
      'stock-detail':      'Catalogue',
      'bcb-enlevement':    'Enlèvements',
      'bcb-lot-detail':    'Lots',
    };
    document.getElementById('back-label').textContent = backLabels[v] || 'Retour';

    // Titre + sous-titre du header selon l'activité
    const activityMeta = {
      loxam:    { icon: '🏗️', title: 'LOXAM',         sub: 'Arrivées & Départs'  },
      bcb:      { icon: '🚛', title: 'BCB',            sub: 'Vente & Logistique'  },
      agora:    { icon: '🏷️', title: 'Agorastore',     sub: 'Ventes en ligne'     },
      stockage: { icon: '📦', title: 'Stockage Pidem', sub: 'Gestion des pièces'  },
      lvu:      { icon: '📄', title: 'LV / CMR',       sub: 'Lettres de voiture'  },
      annuaire: { icon: '📋', title: 'Annuaire',        sub: 'Destinations & agences' },
    };
    const titleEl    = document.getElementById('header-title');
    const subtitleEl = document.getElementById('header-subtitle');
    if (titleEl && subtitleEl) {
      if (onHome) {
        titleEl.textContent    = 'SONOTRAD';
        subtitleEl.textContent = 'Multi-activités';
      } else {
        const meta = S.activity ? activityMeta[S.activity] : null;
        titleEl.textContent    = meta ? `${meta.icon} ${meta.title}` : 'SONOTRAD';
        subtitleEl.textContent = meta ? meta.sub : '';
      }
    }

    // ── Bonjour [Prénom] sur l'écran d'accueil ────────────────────────────
    const greetEl = document.getElementById('home-greeting');
    if (greetEl && S.currentUser?.prenom) {
      greetEl.textContent = `Bonjour ${S.currentUser.prenom}`;
    }

    // ── Cartes admin (accueil) : visibles uniquement pour les admins ─────
    const isAdmin = S.currentUser?.role === 'admin';
    const adminCard = document.getElementById('admin-home-card');
    if (adminCard) adminCard.style.display = isAdmin ? '' : 'none';
    const annCard = document.getElementById('annuaire-home-card');
    if (annCard) annCard.style.display = isAdmin ? '' : 'none';
    const rhCard = document.getElementById('rh-home-card');
    if (rhCard) rhCard.style.display = isAdmin ? '' : 'none';
    const recondCard = document.getElementById('recond-home-card');
    if (recondCard) recondCard.style.display = (isAdmin || (S.currentUser?.activites || []).includes('recond')) ? '' : 'none';
    const fillTestBtn = document.getElementById('btn-fill-test');
    if (fillTestBtn) fillTestBtn.style.display = isAdmin ? '' : 'none';

    // ── Pastilles de chargement sur les cartes d'accueil ─────────────────
    this._updateHomeCards();

    // ── Back button : admin revient à l'accueil ───────────────────────────
    if (v === 'admin') {
      document.getElementById('btn-back').classList.remove('hidden');
      document.getElementById('header-logo').style.display = 'none';
      if (bcEl) bcEl.style.display = 'none';
      document.getElementById('back-label').textContent = 'Accueil';
      if (titleEl) titleEl.textContent = '👥 Utilisateurs';
      if (subtitleEl) subtitleEl.textContent = 'Administration';
    }

    // ── API warning ───────────────────────────────────────────────────────
    const w = document.getElementById('api-warning');
    if (w) w.style.display = (!S.apiUrl && v === 'arrivals') ? 'block' : 'none';
  },
  /* ─ Auth / PIN ─ */

  /** Met à jour les pastilles de chargement sur les cartes d'accueil. */
  _updateHomeCards() {
    const loxam = document.getElementById('badge-loxam');
    if (loxam) {
      if (S.depsLoaded) {
        loxam.className = 'activity-badge badge-active';
        loxam.textContent = '● Actif';
      } else if (S.depsLoading) {
        loxam.className = 'activity-badge badge-loading';
        loxam.textContent = '⟳ Chargement...';
      }
    }
    const stock = document.getElementById('badge-stockage');
    if (stock) {
      if (S.historyLoaded) {
        stock.className = 'activity-badge badge-active';
        stock.textContent = '● Actif';
      } else if (S.historyLoading || S.apiUrl) {
        stock.className = 'activity-badge badge-loading';
        stock.textContent = '⟳ Chargement...';
      }
    }
  },

  /** Vérifie localStorage au démarrage — affiche ou masque l'overlay. */
  _initAuth() {
    const stored = localStorage.getItem('snt_user');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        // Session d'avant les jetons (ou jeton expiré) → une seule re-saisie du PIN.
        // (jetons d'avant les comptes Supabase du 2026-10-15 : sans « compte » → refusés)
        if (!user.compte || !this._tokenValide(user.token)) throw new Error('jeton absent ou expiré');
        S.currentUser = user;
        document.getElementById('login-overlay').style.display = 'none';
        this._render();
        this._prefetch();
        return;
      } catch(e) { localStorage.removeItem('snt_user'); }
    }
    // Pré-remplir l'URL si déjà connue
    if (S.apiUrl) document.getElementById('login-url-input').value = S.apiUrl;
    this._afficherConnexion();
  },

  /** Lit l'expiration inscrite dans le jeton (la signature, elle, n'est vérifiable que côté serveur). */
  _tokenValide(tk) {
    try {
      const b64 = String(tk).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64)).e > Date.now();
    } catch { return false; }
  },

  /**
   * Le serveur a refusé le jeton : on redemande le PIN par-dessus l'écran courant, sans
   * le quitter — le formulaire en cours reste intact, l'utilisateur relance son action.
   */
  _sessionExpiree() {
    if (S._reauth) return;   // plusieurs appels refusés en même temps → un seul écran PIN
    S._reauth = true;
    if (S.currentUser) S.currentUser.token = null;
    localStorage.removeItem('snt_user');
    S.pinMode = 'login';
    this._afficherConnexion('Session expirée — entrez votre PIN');
  },

  _prefetch() { /* désactivé — chargement désormais déclenché par les menus d'activité */ },

  async _prefetchDeps() {
    if (S.depsLoaded || S.depsLoading) return;
    S.depsLoading = true;
    this._updateHomeCards();
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=production', {}, 90000);
      const data = await r.json();
      S.deps       = Array.isArray(data) ? data : (data.data || []);
      S.depsLoaded = true;
      this._buildModuleFilterBar();
      this._buildPoseHistory();
      // Rendre si la vue concernée est déjà active
      if (S.view === 'departures')                                  this._renderDepList();
      else if (S.view === 'stock-dashboard' || S.view === 'stock-history') this._renderDashboard?.();
    } catch(e) { /* échec silencieux — l'utilisateur chargera en navigant */ }
    finally { S.depsLoading = false; this._updateHomeCards(); }
  },

  async _prefetchHistory() {
    if (S.historyLoaded || S.historyLoading) return;
    S.historyLoading = true;
    this._updateHomeCards();
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=stock_recent_movements&limit=9999', {}, 30000);
      const data = await r.json();
      S.historyData   = (data.status === 'ok' ? data.movements : []) || [];
      S.historyOps    = this._groupMovements(S.historyData);
      S.historyLoaded = true;
      this._buildPoseHistory();
      if (S.view === 'stock-history')   this._renderHistoryList();
      if (S.view === 'stock-dashboard') this._renderDashboard();
      if (S.view === 'departures' && S.depsLoaded) this._renderDepList();
      // Si la modale de pose est ouverte (ouverte pendant le prefetch), l'alimenter maintenant
      if (S.poseModuleCode && document.getElementById('pose-modal')?.style.display !== 'none') {
        this._renderPoseExisting(S.poseModuleCode);
      }
    } catch(e) { /* échec silencieux */ }
    finally { S.historyLoading = false; this._updateHomeCards(); }
  },

  async _prefetchCatalog() {
    if (S.catalogLoaded || S.catalogLoading || S.stockLoaded) return;
    S.catalogLoading = true;
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=stock_catalog', {}, 40000);
      const data = await r.json();
      if (data.status === 'ok') {
        S.stockData     = data.data     || [];
        S.stockFamilles = data.familles || [];
        S.catalogLoaded = true;
      }
    } catch(e) { /* échec silencieux */ }
    finally { S.catalogLoading = false; }
  },

  async _prefetchLvLinks() {
    if (!S.apiUrl) return;
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=stock_get_lv_links', {}, 10000);
      const data = await r.json();
      if (data.status === 'ok') S.lvLinks = data.links || {};
    } catch(e) { /* échec silencieux */ }
  },

  /** Crée une LV pré-remplie à partir d'une opération de sortie stock. */
  async createLvFromOp(encodedKey) {
    const opKey = decodeURIComponent(encodedKey);
    const op    = (S.historyOps || []).find(o => o.key === opKey);
    if (!op) { this.toast('Opération introuvable'); return; }
    const THRESHOLD = 10;
    let rows;
    if (op.items.length <= THRESHOLD) {
      rows = op.items.map(m => {
        const desc = S.stockData.find(d => d.ref === m.ref)?.description || '';
        return { qte: String(m.qty), description: m.ref + (desc ? '  —  ' + desc : ''), poids: '', note: m.ref, ml: '' };
      });
    } else {
      const totalQty = op.items.reduce((s, m) => s + (Number(m.qty) || 0), 0);
      rows = [{ qte: String(totalQty), description: `Pièces PIDEM — ${op.items.length} références`, poids: '', note: '', ml: '' }];
    }
    S.lvu.fromOpKey  = opKey;
    S.lvu.fromOpNote = op.note || '';
    await this.lvuInit();
    this.lvuLoadAgencies();
    S.lvu.marchandises = rows;
    this._lvuRenderMarchandises();
    if (op.note) {
      const docEl = document.getElementById('lvu-f-doc');
      if (docEl && !docEl.value) docEl.value = op.note;
    }
  },

  /** Enregistre le lien LV↔opération dans Drive (lv_links.json). */
  async _saveLvLinkRemote(opKey, numero, display) {
    if (!S.apiUrl) return;
    try {
      await _fetchWithTimeout(S.apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'stock_save_lv_link', opKey, numero, display }),
      }, 10000);
      S.lvLinks[opKey] = { numero, display, date: new Date().toISOString() };
    } catch(e) {}
  },

  /** Ajoute un chiffre au buffer et soumet automatiquement à 4 chiffres. */
  _pinPress(d) {
    if (S.pinBuffer.length >= 4 || S._pinEnvoi) return;
    S.pinBuffer += d;
    this._updatePinDots();
    if (S.pinBuffer.length === 4) setTimeout(() => this._submitPin(), 80);
  },

  /** Supprime le dernier chiffre. */
  _pinDel() {
    if (!S.pinBuffer.length) return;
    S.pinBuffer = S.pinBuffer.slice(0, -1);
    this._updatePinDots();
  },

  /** Met à jour l'affichage des 4 points. */
  _updatePinDots() {
    [0,1,2,3].forEach(i => {
      const d = document.getElementById('pdot-' + i);
      if (d) d.classList.toggle('filled', i < S.pinBuffer.length);
    });
  },

  /** Affiche un message d'erreur + animation shake + vide le buffer. */
  _pinError(msg) {
    document.getElementById('pin-error-msg').textContent = msg;
    S.pinBuffer = '';
    this._updatePinDots();
    const row = document.getElementById('pin-dots-row');
    if (row) {
      row.classList.add('shake');
      setTimeout(() => row.classList.remove('shake'), 400);
    }
  },

  /** Compte choisi sur cet appareil (connexion : on choisit son nom, puis on tape son PIN). */
  _loginCompte() {
    try { return JSON.parse(localStorage.getItem('snt_compte') || 'null'); } catch { return null; }
  },

  /** Affiche l'écran de connexion : la liste des noms si aucun n'est choisi, sinon le clavier PIN. */
  _afficherConnexion(prompt) {
    S.pinBuffer = '';
    this._updatePinDots();
    document.getElementById('pin-error-msg').textContent = '';
    document.getElementById('login-overlay').style.display = 'flex';
    const enLogin = S.pinMode === 'login';
    const compte  = enLogin ? this._loginCompte() : null;
    const qui     = document.getElementById('login-qui');
    if (enLogin && !compte) {
      document.getElementById('pin-prompt').textContent = 'Qui êtes-vous ?';
      qui.style.display = 'none';
      document.getElementById('login-pin-zone').style.display = 'none';
      this._chargerNomsConnexion();
      return;
    }
    document.getElementById('login-noms').style.display = 'none';
    document.getElementById('login-pin-zone').style.display = 'flex';
    document.getElementById('pin-prompt').textContent = prompt || 'Entrez votre code PIN';
    const annulable = !enLogin && S.currentUser;
    qui.style.display = (compte || annulable) ? 'inline-block' : 'none';
    qui.textContent = compte ? compte.nom + '  ·  changer' : 'Annuler';
  },

  async _chargerNomsConnexion() {
    const box = document.getElementById('login-noms');
    box.style.display = 'block';
    const message = txt => {
      box.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'login-noms-msg';
      p.textContent = txt;
      box.appendChild(p);
    };
    if (!S.apiUrl) { message('URL API non configurée — cliquez sur ⚙ ci-dessous'); return; }
    message('Chargement…');
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=auth_comptes', {}, 30000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur inconnue');
      if (!d.comptes.length) { message('Aucun compte actif.'); return; }
      box.innerHTML = '';
      d.comptes.forEach(c => {
        const b = document.createElement('button');
        b.className = 'login-nom';
        b.textContent = c.nom;
        b.onclick = () => this._loginChoisir(c);
        box.appendChild(b);
      });
    } catch(e) {
      message('Liste indisponible : ' + e.message);
      const b = document.createElement('button');
      b.className = 'login-nom';
      b.style.textAlign = 'center';
      b.textContent = 'Réessayer';
      b.onclick = () => this._chargerNomsConnexion();
      box.appendChild(b);
    }
  },

  _loginChoisir(c) {
    try { localStorage.setItem('snt_compte', JSON.stringify({ id: c.id, nom: c.nom })); } catch {}
    this._afficherConnexion();
  },

  /** « changer » : revient à la liste des noms ; pendant un changement de PIN : annule. */
  _loginChoisirAutre() {
    if (S.pinMode !== 'login') {
      S.pinMode = 'login'; S._pinOld = null; S._pinNew = null;
      document.getElementById('login-overlay').style.display = 'none';
      return;
    }
    try { localStorage.removeItem('snt_compte'); } catch {}
    this._afficherConnexion();
  },

  /** Soumet le PIN selon le mode courant (login / change). */
  async _submitPin() {
    if (!S.apiUrl) {
      this._pinError('URL API non configurée — cliquez sur ⚙ ci-dessous');
      return;
    }
    const pinSaisi = S.pinBuffer;
    S._pinEnvoi = true;
    document.getElementById('pin-error-msg').textContent = 'Vérification…';
    try {
      await this._traiterPin(pinSaisi);
    } finally {
      S._pinEnvoi = false;
      S.pinBuffer = '';
      this._updatePinDots();
    }
  },

  async _envoyerAuth(compte, pin) {
    const fd = new FormData();
    fd.append('payload', JSON.stringify({ action:'auth', compte, pin }));
    const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 30000);
    return resp.json();
  },

  async _traiterPin(pinSaisi) {
    const msg = document.getElementById('pin-error-msg');

    if (S.pinMode === 'login') {
      // ── Authentification ──────────────────────────────────────────────
      const compte = this._loginCompte();
      if (!compte) { this._afficherConnexion(); return; }
      try {
        const data = await this._envoyerAuth(compte.id, pinSaisi);
        if (data.status !== 'ok') { this._pinError(data.error || 'Code PIN incorrect'); return; }
        msg.textContent = '';
        S.currentUser = data.user;
        localStorage.setItem('snt_user', JSON.stringify(data.user));
        const reauth = S._reauth;
        S._reauth = false;
        if (!reauth) {
          S.view = 'home'; S.activity = null; // ← toujours démarrer à l'accueil
          this._render();
          this._prefetch();
        }
        if (data.user.pinAChanger) {
          // Son PIN est déjà celui d'un collègue au kiosque : il en choisit un autre tout de suite.
          S._pinOld = pinSaisi; S.pinMode = 'change_new';
          this._afficherConnexion('Ce PIN est déjà pris par un collègue — choisissez un nouveau PIN');
          return;
        }
        document.getElementById('login-overlay').style.display = 'none';
        if (reauth) this.toast('✓ Reconnecté — relancez votre dernière action');
      } catch(e) { this._pinError('Erreur de connexion — réessayez'); }

    } else if (S.pinMode === 'change_old') {
      // ── Vérification du PIN actuel avant changement ───────────────────
      try {
        const data = await this._envoyerAuth(S.currentUser?.compte, pinSaisi);
        if (data.status !== 'ok') { this._pinError(data.error || 'Code PIN actuel incorrect'); return; }
        S._pinOld = pinSaisi;
        S.pinMode = 'change_new';
        msg.textContent = '';
        document.getElementById('pin-prompt').textContent = 'Nouveau code PIN (4 chiffres)';
      } catch(e) { this._pinError('Erreur réseau — réessayez'); }

    } else if (S.pinMode === 'change_new') {
      // ── Saisie du nouveau PIN ─────────────────────────────────────────
      S._pinNew = pinSaisi;
      S.pinMode = 'change_confirm';
      msg.textContent = '';
      document.getElementById('pin-prompt').textContent = 'Confirmez le nouveau PIN';

    } else if (S.pinMode === 'change_confirm') {
      // ── Confirmation + envoi ──────────────────────────────────────────
      if (pinSaisi !== S._pinNew) {
        this._pinError('Les codes ne correspondent pas');
        S.pinMode = 'change_new';
        document.getElementById('pin-prompt').textContent = 'Nouveau code PIN (4 chiffres)';
        return;
      }
      try {
        const fd = new FormData();
        // Le même PIN sert au kiosque de pointage.
        fd.append('payload', JSON.stringify({ action:'change_pin', ancien: S._pinOld, nouveau: pinSaisi }));
        const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 30000);
        const data = await resp.json();
        if (data.status === 'ok') {
          S.pinMode = 'login'; S._pinOld = null; S._pinNew = null;
          if (S.currentUser) { S.currentUser.pinAChanger = false; localStorage.setItem('snt_user', JSON.stringify(S.currentUser)); }
          msg.textContent = '';
          document.getElementById('login-overlay').style.display = 'none';
          this.toast('✓ Code PIN modifié avec succès !');
        } else {
          // Nouveau PIN refusé (déjà pris…) : on en redemande un, l'ancien reste valable.
          this._pinError(data.error || 'Erreur lors du changement');
          S.pinMode = 'change_new'; S._pinNew = null;
          document.getElementById('pin-prompt').textContent = 'Nouveau code PIN (4 chiffres)';
        }
      } catch(e) { this._pinError('Erreur réseau — réessayez'); }
    }
  },

  /** Lance le flux de changement de PIN depuis les réglages. */
  _showChangePin() {
    S.pinMode = 'change_old'; S._pinOld = null; S._pinNew = null;
    this._afficherConnexion('Entrez votre PIN actuel');
  },

  /** Déconnexion : vide la session locale et réaffiche l'écran de connexion (nom mémorisé). */
  logout() {
    localStorage.removeItem('snt_user');
    S.currentUser = null; S.pinMode = 'login';
    S.view = 'home'; S.activity = null; // ← retour accueil à la prochaine connexion
    this._afficherConnexion();
  },

  /** Affiche/masque le panneau de config URL depuis l'overlay. */
  _toggleLoginSetup() {
    const p = document.getElementById('login-setup-panel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    if (p.style.display === 'block') document.getElementById('login-url-input').focus();
  },

  /** Sauvegarde l'URL depuis l'overlay de connexion. */
  _saveLoginUrl() {
    const val = document.getElementById('login-url-input').value.trim();
    if (!val) return;
    S.apiUrl = val;
    localStorage.setItem(SK.API, val);
    document.getElementById('login-setup-panel').style.display = 'none';
    document.getElementById('pin-error-msg').textContent = '';
    this.toast('✓ URL enregistrée');
  },

  /* ─ Toast ─ */
  toast(msg, ms = 2800) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, ms);
  },
};
// ── UTILS ────────────────────────────────────────────────────────────────────
function _randCode() {
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 6 }, () => C[Math.floor(Math.random() * 26)]).join('');
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function _timeStr()  { return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
// Date au format français court : "2 jan. 2025"
function _fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
// Format court JJ/MM (chips) — retombe sur la chaîne brute si non parsable
function _fmtDateShort(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
// Format JJ/MM/AAAA (PDF LV/CMR)
function _fmtDateFR(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
// Convertit une date (string Sheets/ISO/dd-mm-yyyy FR) en yyyy-mm-dd pour <input type="date">
// new Date("11/07/2026") est ambigu et interprété par JS en MM/DD/YYYY (7 novembre au lieu du
// 11 juillet) — toute chaîne jj/mm/aaaa doit donc être parsée à la main avant tout fallback.
function _toIsoDateInput(str) {
  if (!str) return '';
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(str);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// Durée entre debut et (fin ou aujourd'hui), retourne ex: "3j", "2 sem", "1 mois"
function _duration(debut, fin) {
  if (!debut) return '';
  const start = new Date(debut);
  if (isNaN(start)) return '';
  const end = (fin && !isNaN(new Date(fin))) ? new Date(fin) : new Date();
  const days = Math.round((end - start) / 86400000);
  if (days < 0)  return '';
  if (days === 0) return 'auj.';
  if (days === 1) return '1j';
  if (days < 14)  return days + 'j';
  if (days < 60)  return Math.round(days / 7) + ' sem';
  return Math.round(days / 30) + ' mois';
}
function _sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }
// Fetch avec timeout (AppScript peut être lent)
function _fetchWithTimeout(resource, options = {}, timeoutMs = 45000) {
  const ctrl = new AbortController();
  let expire = false;
  const tid  = setTimeout(() => { expire = true; ctrl.abort(); }, timeoutMs);
  return fetch(resource, { ...options, signal: ctrl.signal })
    .catch(err => {
      // Délai dépassé : le serveur (Apps Script) a souvent fini malgré tout — on le dit
      // plutôt qu'afficher « signal is aborted without reason ».
      if (expire) throw new Error('le serveur met trop de temps à répondre — l\'action a peut-être abouti, vérifiez avant de recommencer');
      throw err;
    })
    .finally(() => clearTimeout(tid));
}
async function _post(url, payload) {
  // FormData évite le CORS preflight (multipart/form-data est une "simple request")
  // AppScript reçoit les données via e.parameter.payload
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  const r = await _fetchWithTimeout(url, { method: 'POST', body: form }, 60000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { status: 'ok', raw: text }; }
}
// Jeton de session (délivré par l'action 'auth', voir _checkSession dans pwa_master.js) :
// ajouté ici à TOUS les appels vers S.apiUrl plutôt qu'à chacun des ~90 appels du fichier.
// GET → paramètre ?tk= ; POST FormData → champ tk ; POST JSON → propriété tk.
(function () {
  const _fetch = window.fetch.bind(window);
  window.fetch = function (resource, options) {
    const tk    = S.currentUser && S.currentUser.token;
    const isApi = !!S.apiUrl && typeof resource === 'string' && resource.startsWith(S.apiUrl);
    if (tk && isApi) {
      const method = ((options && options.method) || 'GET').toUpperCase();
      if (method === 'GET') {
        resource += (resource.includes('?') ? '&' : '?') + 'tk=' + encodeURIComponent(tk);
      } else if (options && options.body instanceof FormData) {
        options.body.set('tk', tk);
      } else if (options && typeof options.body === 'string') {
        try {
          const o = JSON.parse(options.body);
          if (o && typeof o === 'object' && !Array.isArray(o)) {
            o.tk = tk;
            options = { ...options, body: JSON.stringify(o) };
          }
        } catch {}
      }
    }
    // 401 = jeton refusé par le serveur (absent, expiré, ou secret changé) → re-saisie du PIN.
    return _fetch(resource, options).then(r => {
      if (isApi && r.status === 401) App._sessionExpiree();
      return r;
    });
  };
})();
function _compress(file, maxW = 1200, q = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const fr = new FileReader();
      fr.onload = e => resolve(e.target.result);
      fr.readAsDataURL(file);
    };
    img.src = url;
  });
}
// ── INIT ─────────────────────────────────────────────────────────────────────
function _updateOnline() {
  S.online = navigator.onLine;
  const d = document.getElementById('status-dot');
  const t = document.getElementById('status-text');
  if (d) { d.className = 'status-dot ' + (navigator.onLine ? 'online' : 'offline'); }
  if (t) { t.textContent = navigator.onLine ? 'En ligne' : 'Hors ligne'; }
  if (navigator.onLine) {
    App._refillCodeStock();
    App._processOfflineQueue();
  }
}
window.addEventListener('online',  _updateOnline);
window.addEventListener('offline', _updateOnline);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    App._refillCodeStock();
    App._processOfflineQueue();
  }
});
setTimeout(() => App._refillCodeStock(), 1500);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
}
// ── Pull-to-refresh ──────────────────────────────────────────────────────────
Object.assign(App, {
  _ptrSetup() {
    const mainEl = document.querySelector('.main-content');
    const ind    = document.getElementById('ptr-indicator');
    if (!mainEl) return;
    let startY = 0, startX = 0, pulling = false, refreshing = false;
    const THRESHOLD = 70;

    const _show = (dy) => {
      if (!ind) return;
      const pct = Math.min(dy / THRESHOLD, 1);
      ind.style.opacity   = String(Math.min(pct * 1.5, 1));
      ind.style.transform = `translateX(-50%) translateY(${-54 + pct * 54}px)`;
      const icon = document.getElementById('ptr-icon');
      if (icon) { icon.style.animation = ''; icon.style.transform = `rotate(${pct * 180}deg)`; icon.textContent = '↓'; }
    };
    const _hide = () => {
      if (!ind) return;
      ind.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      ind.style.opacity    = '0';
      ind.style.transform  = 'translateX(-50%) translateY(-54px)';
    };

    mainEl.addEventListener('touchstart', e => {
      if (refreshing) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pulling = mainEl.scrollTop <= 0;
      if (ind) ind.style.transition = 'none';
    }, { passive: true });

    mainEl.addEventListener('touchmove', e => {
      if (!pulling || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dx > 30 || dy <= 0) { pulling = false; _hide(); return; }
      _show(dy);
    }, { passive: true });

    mainEl.addEventListener('touchend', e => {
      if (!pulling || refreshing) return;
      pulling = false;
      const dy = e.changedTouches[0].clientY - startY;
      if (dy >= THRESHOLD) {
        refreshing = true;
        const icon = document.getElementById('ptr-icon');
        if (icon) { icon.textContent = '⟳'; icon.style.transform = ''; icon.style.animation = 'spin 0.6s linear infinite'; }
        if (ind) { ind.style.transition = 'none'; _show(THRESHOLD); }
        setTimeout(() => {
          App._ptrRefresh();
          _hide();
          setTimeout(() => { refreshing = false; }, 350);
        }, 350);
      } else {
        _hide();
      }
    });
  },

  _ptrRefresh() {
    const v = S.view;
    if      (v === 'departures')      this.loadDepartures(true);
    else if (v === 'arrivals')        this.loadArrivalsData(true);
    else if (v === 'loxam-menu')      { S.depsLoaded = false; S.arrivalsLoaded = false; this.loxamMenuInit(); }
    else if (v === 'stock-dashboard') this.loadStockDashboard(true);
    else if (v === 'stock')           { S.stockLoaded = false; this.loadStockCatalog(); }
    else if (v === 'stock-history')   this.loadStockHistory(true);
    else if (v === 'bcb-lots')        this.bcbLotsLoad(true);
    else if (v === 'bcb-enlevements') this.bcbEnlevementsLoad(true);
    else if (v === 'lvu-history')     this.lvuLoadHistory();
    else if (v === 'annuaire')        this.annuaireLoad(true);
    else                              this.toast('↺ Actualisé');
  },
});

document.addEventListener('DOMContentLoaded', () => {
  // Vérifie la session → affiche login ou accueil
  App._initAuth();
  _updateOnline();
  App._renderCodeStockBadge();
  App._renderOfflineQueueBadge();
  App._ptrSetup();
  // ── Drag-and-drop sur la dropzone XLS ────────────────────────────────────
  const dz = document.getElementById('xls-dropzone');
  if (dz) {
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag');
      const file = e.dataTransfer?.files?.[0];
      if (file) App._xlsLoadFile(file);
    });
  }
});
