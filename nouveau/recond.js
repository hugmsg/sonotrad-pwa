// ═══════════════════════════════════════════════════════════════════════════
// RECONDITIONNEMENT — fiches d'opérations (OT) (essai du 2026-10-28, sortie d'essai le 2026-11-16)
// Premier écran du socle commun (socle.css). Serveur : actions ot_* de masterfile
// (ot_supabase.js) → fonctions Supabase ot_*. Les montants sont calculés en base et
// ne sont renvoyés qu'aux administrateurs. Mode donné par le serveur (S.ot.essai, paramètre
// ot_parametres.essai) : en essai, numéros ESSAI-… et aucune sortie de stock ; hors essai,
// vrais numéros (suite de la matrice Excel) et stock sorti par la fiche (la 🔧 ouvre la fiche du module).
// ═══════════════════════════════════════════════════════════════════════════

S.ot = {
  liste: [], listeChargee: false, listeChargement: false,
  tarifs: null, refs: new Map(), forfaits: new Map(),
  modules: null, modulesChargement: false, choix: false, rechercheModule: '',
  fiche: null, lignes: [], notes: '', onglet: 'pieces',
  rev: 0, revEnvoyee: -1, enCours: null, minuterie: null, etat: '',
  recherche: { pieces: '', sanitaire: '', bureau: '' }, sugg: { pieces: [], sanitaire: [], bureau: [] },
  calc: [],        // lignes telles que calculées par le serveur (mo_ligne, piece_ligne…), même ordre
  masquer: false,  // contrôle : masquer les lignes sans quantité
  familles: (() => { try { return localStorage.getItem('snt_ot_familles') !== '0'; } catch { return true; } })(),
  groupesAffiches: [],
  tarifsVue: null,  // écran Tarifs : recherche, journal
  // Saisie rapide au clavier (PC) : choix mémorisé par appareil ; rgIdx = lignes affichées par tableau
  rapide: (() => { try { return localStorage.getItem('snt_ot_rapide') !== '0'; } catch { return true; } })(),
  rgIdx: { p: [], s: [], t: [] }, rgSugg: [], rgSel: -1,
  mail: null,       // brouillon du mail LOXAM préparé : { blob (URL locale du .eml), url (copie Drive), nom, ids, modules }
  essai: null,      // mode donné par le serveur (ot_liste) : true / false ; null = pas encore connu (traité comme essai)
};

// Saisie rapide : tableaux (p = pièces et forfaits, s = sanitaire, t = temps passé) → blocs des lignes
const OT_RG = { p: ['pieces', 'diverses'], s: ['sanitaire'], t: ['travaux'] };
const OT_RG_MAXC = { p: 2, s: 1, t: 2 };
const OT_RG_UNITES = ['h', 'min', 'm', 'm²', 'u'];

// Sanitaire : les pièces du bloc SANITAIRE du modèle « OPERATIONS (2) std » de la matrice Excel, dans son ordre
// (2026-11-18, demande de Hugo). Sur une fiche en brouillon, celles qui n'y sont pas encore sont ajoutées À L'ÉCRAN
// SEULEMENT (origine « modele », sans quantité) : rien n'est envoyé au serveur tant qu'aucune quantité n'est tapée
// (voir _otEnregistrer), donc ni documents, ni totaux, ni stock ne changent. Bouton Grouper / Dégrouper.
// Premix (394), réducteur (399), urinoir sans eau (forfait I) et « Autre » (SON-0000) n'ont pas de prix pièce :
// ils restent en section 1 (choix de Hugo).
const OT_SAN_MODELE = [
  ['Chauffe-eau', [['SON-0002', 'Ballon eau chaude 200 L'], ['SON-0065', 'Ballon eau chaude 300 L + kit + thermostat'],
    ['SON-0049', 'Petit chauffe-eau instantané'], ['SON-0028', 'Grand chauffe-eau instantané'], ['SON-0030', 'Kit de sécurité'],
    ['SON-0066', 'Kit contrôle température']]],
  ['Multicouche', [['SON-0054', 'Tube multicouche (m)'], ['SON-0052', 'Té égal'], ['SON-0053', 'Té mâle'], ['SON-0050', 'Raccord droit mâle'],
    ['SON-0051', 'Raccord droit femelle écrou libre'], ['SON-0017', 'Autre raccord'], ['SON-0076', 'Collier']]],
  ['Sanitaire', [['SON-0004', 'Robinet presto'], ['SON-0020', 'Douche presto'], ['SON-0032', 'WC anglaise + robinet'], ['SON-0055', 'Urinoir'],
    ['SON-0080', 'Bonde évacuation'], ['SON-0058', 'Robinet de service']]],
  ['PVC', [['SON-0025', 'Tube Ø 32'], ['SON-0026', 'Tube Ø 40'], ['SON-0027', 'Tube Ø 100'], ['SON-0061', 'Raccords (tout diamètre)'],
    ['SON-0048', 'Manchon'], ['SON-0012', 'Réduction'], ['SON-0060', 'Tampon de réduction'], ['SON-0013', 'Tube souple Ø 40'],
    ['SON-0078', 'Manchon de dilatation'], ['SON-0077', 'Collier']]],
  ['Autre', [['SON-0024', 'Raccord pompier'], ['SON-0016', 'Vanne d\'alimentation'], ['SON-0046', 'Té 3x mâle'], ['SON-0014', 'Flexible 15x21 F/F'],
    ['SON-0015', 'Flexible coudé'], ['SON-0043', 'Coude égal'], ['SON-0007', 'Traversée de cloison'], ['SON-0057', 'Rallonge'],
    ['SON-0059', 'Réduction laiton'], ['SON-0003', 'Pipe souple WC'], ['SON-0075', 'Pipe orientable WC'], ['SON-0062', 'Siphon 40/40'],
    ['SON-0063', 'Siphon 32/40'], ['SON-0079', 'Siphon ballon'], ['SON-0018', 'Tringle'], ['SON-0006', 'Rideau'],
    ['SON-0064', 'Dévidoir papier WC'], ['SON-0005', 'Tube fileté'], ['SON-0011', 'Contre-écrou']]],
];

const OT_STATUTS = {
  brouillon: 'Brouillon', a_valider: 'À valider', validee: 'Validée', envoyee: 'Envoyée', annulee: 'Annulée',
};
const OT_LOGO_LOXAM = 'Logo%20Loxam.png';
// Validation / « Refaire les documents » : Apps Script crée 3 fichiers (Excel LOXAM, PDF, Excel SONOTRAD) → délai long
const OT_DELAI_DOCUMENTS = 150000;

function _otEsc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function _otEuros(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function _otDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
// Montant affiché au centime, sans symbole (tableaux) : 11 → « 11,00 ».
function _otPrix(v) {
  return v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Valeur d'une case <input type="number"> (point décimal) : montants au centime, temps en entier.
function _otValeurCase(v, prix) {
  if (v === null || v === undefined || v === '') return '';
  return prix ? (Math.round(Number(v) * 100) / 100).toFixed(2) : String(Math.round(Number(v) * 100) / 100);
}
// Désignation sur une ligne (coupée par « … ») ; un clic la déplie en entier, un second la replie.
function _otDesig(texte, apres = '') {
  return `<div class="sx-desig-boite"><button type="button" class="sx-desig" aria-expanded="false" title="${_otEsc(texte)}"
    onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') !== 'true')">${_otEsc(texte)}</button>${apres}</div>`;
}
function _otQte(q) {
  return q === null || q === undefined || q === '' ? '' : String(q).replace('.', ',');
}
const _OT_SVG_RETOUR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
const _OT_SVG_LOUPE  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6B7A" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>';

Object.assign(App, {

  /* ─ Entrée depuis l'accueil ─ */
  // depuis = 'loxam' (carte de l'activité LOXAM) : le retour de la liste ramène au menu LOXAM.
  otOuvrirActivite(depuis) {
    if (!this._otAutorise()) { this.toast('⛔ Vous n\'avez pas accès au reconditionnement'); return; }
    S.ot.retour = depuis === 'loxam' ? 'loxam' : 'accueil';
    S.ot.retourFiche = null;
    S.activity = 'recond';
    S.ot.choix = false;
    this.go('ot-liste');
  },

  _otAutorise() {
    const u = S.currentUser;
    return !!u && (u.role === 'admin' || (u.activites || []).includes('recond'));
  },
  _otAdmin() { return S.currentUser?.role === 'admin'; },

  async _otGet(params, delai = 40000) {
    const r = await _fetchWithTimeout(S.apiUrl + '?' + new URLSearchParams(params).toString(), {}, delai);
    const d = await r.json();
    if (d.status !== 'ok') throw new Error(d.error || 'Erreur serveur');
    return d;
  },
  async _otPost(payload, timeoutMs) {
    const d = await _post(S.apiUrl, payload, timeoutMs);
    if (d.status !== 'ok') { const e = new Error(d.error || 'Erreur serveur'); e.conflit = !!d.conflit; throw e; }
    return d;
  },

  // `bandeau` : bandeau de statut placé DANS l'en-tête (qui reste en haut au défilement).
  _otEntete({ retour, titre, sousTitre = '', etat = '', logo = true, large = false, bandeau = '' }) {
    return `<header class="sx-entete"><div class="sx-entete-in${large ? ' sx-large' : ''}">
      <button type="button" class="sx-retour" onclick="${retour.action}">${_OT_SVG_RETOUR}${_otEsc(retour.texte)}</button>
      <div class="sx-titre-ligne">
        ${logo ? `<img class="sx-logo" src="${OT_LOGO_LOXAM}" alt="LOXAM">` : ''}
        <div class="sx-titres">
          <h1 class="sx-titre">${_otEsc(titre)}</h1>
          ${sousTitre ? `<span class="sx-sous-titre">${_otEsc(sousTitre)}</span>` : ''}
        </div>
        ${etat ? `<span class="sx-etat" id="ot-etat">${_otEsc(etat)}</span>` : ''}
      </div>
      ${bandeau}
    </div></header>`;
  },

  // Vues de Reconditionnement en haut à droite de l'en-tête, comme les vues de Production (2026-11-23).
  // Réservé aux admins (seuls à voir Commandes / Tarifs / Tableau de bord) : sinon rien.
  _otNav(actif) {
    if (!this._otAdmin()) return '';
    const b = (cle, texte, action) => `<button type="button" class="pb-nav-btn" aria-pressed="${actif === cle}" onclick="${actif === cle ? '' : action}">${texte}</button>`;
    return `<nav class="pb-nav" aria-label="Vues">${b('fiches', 'Fiches', "App.go('ot-liste')")}${b('cde', 'Commandes', 'App.otOuvrirCommandes()')}${b('tarifs', 'Tarifs', 'App.otOuvrirTarifs()')}${b('bord', 'Tableau de bord', 'App.otOuvrirBord()')}</nav>`;
  },
  // Retour commun aux vues de Reconditionnement : là d'où l'on est venu (menu LOXAM ou accueil)
  _otRetourListe() {
    return S.ot.retour === 'loxam' ? { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' } : { texte: 'Accueil', action: 'App.goHome()' };
  },

  _otConfirmer({ titre, texte, ok = 'Continuer', annuler = 'Annuler' }) {
    return new Promise(resolve => {
      const voile = document.createElement('div');
      voile.className = 'sx-voile';
      voile.innerHTML = `<div class="sx-fenetre" role="dialog" aria-modal="true" aria-labelledby="sx-f-titre">
        <h3 id="sx-f-titre">${_otEsc(titre)}</h3><p>${_otEsc(texte)}</p>
        <div class="sx-fenetre-boutons">
          <button type="button" class="sx-btn sx-btn-discret" data-r="0">${_otEsc(annuler)}</button>
          <button type="button" class="sx-btn sx-btn-principal" data-r="1">${_otEsc(ok)}</button>
        </div></div>`;
      const fin = r => { voile.remove(); resolve(r); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(false);
        const b = e.target.closest('[data-r]');
        if (b) fin(b.dataset.r === '1');
      });
      document.body.appendChild(voile);
      voile.querySelector('[data-r="1"]').focus();
    });
  },

  /* ═══════════════════════════ LISTE DES FICHES ═══════════════════════════ */

  async otChargerListe(force = false) {
    if (S.ot.listeChargement || (S.ot.listeChargee && !force)) { this._otRendreListe(); return; }
    S.ot.listeChargement = true;
    this._otRendreListe();
    try {
      const d = await this._otGet({ action: 'ot_liste' });
      S.ot.liste = d.fiches || [];
      S.ot.listeChargee = true;
      if (d.essai !== undefined) S.ot.essai = Number(d.essai) === 1;
      this._otSansOtMaj(d.sans_ot);
      this._otExcelMaj(d.ot_excel);
    } catch (e) {
      this.toast('Fiches indisponibles : ' + e.message, 4000);
    } finally {
      S.ot.listeChargement = false;
      this._otRendreListe();
    }
    // Modules du Planning (terminés sans fiche, étape et destination des fiches) : d'abord ce qu'on a déjà
    // (Planning chargé par Production / LOXAM, sinon dernière copie gardée sur l'appareil), puis rafraîchis
    // en arrière-plan — la liste se redessine à l'arrivée (2026-11-18).
    if (!S.ot.modules) this._otModulesDejaLa();
    if (force || !S.ot.modules || S.ot.modulesAncien) {
      const lecture = this._otChargerModules(true);     // pose « en cours » tout de suite, avant le rendu
      this._otRendreListe();
      lecture.then(() => { if (S.ot.choix) this._otRendreModules(); else this._otRendreListe(); });
    }
  },

  // Planning déjà en mémoire (Production / LOXAM) ou dernière copie de l'appareil → S.ot.modules, marqué « ancien »
  _otModulesDejaLa() {
    let mods = null;
    if (S.depsLoaded && Array.isArray(S.deps)) {
      mods = [...S.deps.map(m => ({ ...m, parti: false })),
              ...(S.archiveLoaded && Array.isArray(S.archive) ? S.archive.map(m => ({ ...m, parti: true, status: m.status || {} })) : [])];
    } else {
      try { const c = JSON.parse(localStorage.getItem('snt_ot_planning') || 'null'); if (c && Array.isArray(c.modules)) mods = c.modules; } catch (e) { mods = null; }
    }
    if (mods && mods.length) { S.ot.modules = mods; S.ot.modulesAncien = true; }
  },

  // Copie légère gardée sur l'appareil : champs utiles à la liste, partis récents seulement
  _otGarderModules() {
    try {
      const depuis = new Date('2026-10-01');
      const leger = (S.ot.modules || [])
        .filter(m => !m.parti || (m.fin && new Date(m.fin) >= depuis))
        .map(m => ({ code: m.code, codeModule: m.codeModule, module: m.module, chantier: m.chantier, ag: m.ag,
                     description: m.description, fin: m.fin, parti: !!m.parti, status: m.status || {} }));
      localStorage.setItem('snt_ot_planning', JSON.stringify({ le: Date.now(), modules: leger }));
    } catch (e) { /* stockage plein ou indisponible : on s'en passe */ }
  },

  async _otChargerModules(force = false) {
    if (S.ot.modulesChargement || (S.ot.modules && !force)) return;
    S.ot.modulesChargement = true;
    try {
      const [prod, partis] = await Promise.all([
        this._otGet({ action: 'production' }, 90000),
        this._otGet({ action: 'archive' }, 60000).catch(() => ({ data: [] })),
      ]);
      S.ot.modules = [
        ...(prod.data || []).map(m => ({ ...m, parti: false })),
        ...(partis.data || []).map(m => ({ ...m, parti: true, status: m.status || {} })),
      ];
      S.ot.modulesAncien = false;
      this._otGarderModules();
    } catch (e) {
      this.toast('Modules indisponibles : ' + e.message, 4000);
    } finally {
      S.ot.modulesChargement = false;
    }
  },

  // Modules qui attendent leur fiche : terminés au Planning (ou partis depuis la mise en service des fiches,
  // le 16/11) et sans fiche (même annulée exclue). Ils s'affichent en tête de « À compléter » (demande de Hugo, 18/11).
  _otModulesAOuvrir() {
    if (!S.ot.modules || !S.ot.listeChargee) return [];
    const avecFiche = new Set(S.ot.liste.filter(f => f.statut !== 'annulee').map(f => String(f.code_planning || '').toUpperCase()));
    const debut = new Date('2026-11-16');
    return S.ot.modules.filter(m => {
      if (!m.code || avecFiche.has(String(m.code).toUpperCase())) return false;
      if (this._otSansOtDe(m.code, m)) return false;          // pas d'OT (marqué, ou vente RBSA / BCBJ / DRCB)
      if (this._otExcelDe(m.code)) return false;               // OT déjà fait dans la matrice Excel
      if (m.parti) { const fin = m.fin ? new Date(m.fin) : null; return !!fin && !isNaN(fin) && fin >= debut; }
      // Terminé, de côté compris (2026-11-19 : la fiche peut se faire en avance) ; sans agence : averti à la validation
      return !!(m.status && m.status.termine);
    }).sort((a, b) => (a.parti - b.parti) || String(a.fin || '').localeCompare(String(b.fin || '')));
  },

  _otRendreListe() {
    const el = document.getElementById('ot-liste-root');
    if (!el) return;
    if (S.ot.choix) { el.innerHTML = this._otHtmlChoixModule(); this._otRendreModules(); return; }

    const admin = this._otAdmin();
    const groupes = [
      { titre: 'À compléter',   statuts: ['brouillon'] },
      { titre: 'À valider',     statuts: ['a_valider'] },
      { titre: 'Validées',      statuts: ['validee'] },
      { titre: 'Envoyées',      statuts: ['envoyee'], max: 15 },
    ];
    // Destination et étape lues dans le Planning (modules chargés à côté de la liste), demande de Hugo du 18/11
    const parCode = new Map((S.ot.modules || []).map(m => [String(m.code || '').toUpperCase(), m]));
    const item = f => {
      const m = parCode.get(String(f.code_planning || '').toUpperCase());
      const st = m ? this._otStatutModule(m) : null;
      return `<button type="button" class="sx-item" onclick="App.otOuvrirFiche(${Number(f.id)})">
        <div class="sx-item-texte">
          <span class="sx-item-titre">${_otEsc([f.type_module, f.numero_module].filter(Boolean).join(' ') || f.code_planning)}
            · <span class="sx-ref">${_otEsc(f.code_planning)}</span></span>
          <span class="sx-item-detail">${st ? `<span class="sx-tag-planning sx-tp-${_otEsc(st.classe)}" title="Étape au Planning">${_otEsc(st.texte)}</span> ` : ''}${_otEsc([m && m.chantier ? m.chantier : f.agence, f.numero_ot, f.saisi_par, _otDate(f.modifie_le)].filter(Boolean).join(' · '))}</span>
        </div>
        <span class="sx-item-stock">${f.stock_le ? `<span class="sx-tag-planning sx-tag-stock" title="Fournitures sorties du stock le ${_otEsc(new Date(f.stock_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}">stock sorti</span>` : ''}</span>
        ${admin && f.total_ht !== undefined ? `<span class="sx-montant">${_otEuros(f.total_ht)}</span>` : ''}
      </button>`;
    };

    const aOuvrir = this._otModulesAOuvrir();
    const itemModule = m => {
      const ouvrir = `App._otChoisirModule('${_otEsc(m.code)}', ${m.parti ? 'true' : 'false'})`;
      const vente = this._otVente(m) === 'proposee';
      return `<div class="sx-item sx-item-a-ouvrir">
        <button type="button" class="sx-item-texte sx-item-btn" onclick="${ouvrir}">
          <span class="sx-item-titre">${_otEsc([m.module, m.codeModule].filter(Boolean).join(' ') || '—')} · <span class="sx-ref">${_otEsc(m.code)}</span></span>
          <span class="sx-item-detail">${(st => `<span class="sx-tag-planning sx-tp-${_otEsc(st.classe)}" title="Étape au Planning">${_otEsc(st.texte)}</span> `)(this._otStatutModule(m))}${_otEsc(m.chantier || m.ag || '')}${m.parti ? ' · sans OT' : ''}${vente ? ' · <b>vente probable ?</b>' : ''}</span>
        </button>
        <button type="button" class="sx-btn sx-btn-discret sx-item-ouvrir" onclick="App.otPasDOt('${_otEsc(m.code)}')">Pas d'OT</button>
        <button type="button" class="sx-btn sx-btn-second sx-item-ouvrir" onclick="${ouvrir}">Ouvrir la fiche</button>
      </div>`;
    };

    let corps;
    if (S.ot.listeChargement && !S.ot.listeChargee) corps = '<div class="sx-chargement">Chargement des fiches…</div>';
    else if (!S.ot.liste.length && !aOuvrir.length) corps = '<div class="sx-carte"><div class="sx-vide">Aucune fiche pour l\'instant.<br>Commencez par « Nouvelle fiche ».</div></div>';
    else corps = groupes.map(g => {
      const fiches = S.ot.liste.filter(f => g.statuts.includes(f.statut)).slice(0, g.max || 1e9);
      const modules = g.statuts[0] === 'brouillon' ? aOuvrir : [];
      if (!fiches.length && !modules.length) return '';
      const compte = [fiches.length ? fiches.length + ' fiche' + (fiches.length > 1 ? 's' : '') : '',
        modules.length ? modules.length + ' module' + (modules.length > 1 ? 's' : '') + ' à ouvrir' : ''].filter(Boolean).join(' · ');
      // Couleur de l'étape (la même que le bandeau en tête de fiche) : titre en bandeau, filet sur chaque fiche.
      return `<section class="sx-section sx-ot sx-ot-liste sx-ot-${g.statuts[0]}">
        <div class="sx-statut sx-statut-groupe"><span class="sx-statut-nom">${g.titre}</span><span class="sx-statut-texte">${compte}</span></div>
        <div class="sx-carte">${modules.map(itemModule).join('')}${fiches.map(item).join('')}</div></section>`;
    }).join('');
    if (S.ot.listeChargee && S.ot.modulesChargement) corps = `<div class="sx-aide">${S.ot.modules ? 'Mise à jour du Planning…' : 'Recherche des modules terminés au Planning…'}</div>` + corps;
    // Modules marqués « pas d'OT » (les ventes reconnues d'office n'y figurent pas) : repliés, annulables
    const sansOt = S.ot.sansOt ? [...S.ot.sansOt.values()] : [];
    if (sansOt.length) {
      const nomDe = code => { const m = (S.ot.modules || []).find(x => String(x.code || '').toUpperCase() === code); return m ? [m.module, m.codeModule].filter(Boolean).join(' ') : ''; };
      corps += `<details class="sx-section sx-so-groupe"><summary class="sx-statut sx-statut-groupe"><span class="sx-statut-nom">Sans OT</span><span class="sx-statut-texte">${sansOt.length} module${sansOt.length > 1 ? 's' : ''}</span></summary>
        <div class="sx-carte">${sansOt.map(x => `<div class="sx-item">
          <div class="sx-item-texte"><span class="sx-item-titre">${_otEsc(nomDe(x.code_planning) || '—')} · <span class="sx-ref">${_otEsc(x.code_planning)}</span></span>
            <span class="sx-item-detail">${_otEsc(this._otTexteSansOt(x) + ' · ' + [x.par, _otDate(x.le)].filter(Boolean).join(' · '))}</span></div>
          <button type="button" class="sx-btn sx-btn-discret sx-item-ouvrir" onclick="App.otRemettreAFaire('${_otEsc(x.code_planning)}')">Remettre à faire</button>
        </div>`).join('')}</div></details>`;
    }

    // Vues (Fiches · Commandes · Tarifs · Tableau de bord) dans l'en-tête et « Actualiser » à côté de
    // « Nouvelle fiche » : tout en haut, plus en bas d'une longue liste (demande de Hugo, 2026-11-23).
    const nav = this._otNav('fiches');
    el.innerHTML = `<div class="sx-ecran${nav ? ' ot-nav-ecran' : ''}">
      ${this._otEntete({ retour: this._otRetourListe(), titre: 'Fiches d\'opérations', sousTitre: 'Reconditionnement' + (this._otEssai() ? ' · essai' : ''), large: !!nav, bandeau: nav })}
      <main class="sx-contenu">
        ${this._otEssai() ? '<div class="sx-bandeau sx-bandeau-info">Essai : la fiche ne sort rien du stock (la 🔧 reste la vraie sortie) et la matrice Excel garde les vrais numéros d\'OT.</div>' : ''}
        <div class="sx-ligne-champs">
          <button type="button" class="sx-btn sx-btn-principal" style="flex:3 1 200px;" onclick="App.otNouvelle()">+ Nouvelle fiche</button>
          <button type="button" class="sx-btn sx-btn-discret" style="flex:1 1 110px;" onclick="App.otChargerListe(true)">Actualiser</button>
        </div>
        ${admin && S.ot.listeChargee ? this._otHtmlMail() : ''}
        ${corps}
      </main></div>`;
  },

  /* ─ Choix du module ─ */

  async otNouvelle() {
    S.ot.choix = true;
    S.ot.rechercheModule = '';
    this._otRendreListe();
    if (S.ot.modules) return;
    await this._otChargerModules();
    if (S.ot.choix) this._otRendreModules();
  },

  otAnnulerChoix() { S.ot.choix = false; this._otRendreListe(); },

  _otHtmlChoixModule() {
    return `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Fiches', action: 'App.otAnnulerChoix()' }, titre: 'Nouvelle fiche', sousTitre: 'Choisir le module' })}
      <main class="sx-contenu">
        <div class="sx-recherche">${_OT_SVG_LOUPE}
          <label for="ot-rech-module" class="sx-sr">Rechercher un module</label>
          <input id="ot-rech-module" type="search" placeholder="Code planning, n° de module, chantier, agence…"
            value="${_otEsc(S.ot.rechercheModule)}" oninput="S.ot.rechercheModule=this.value;App._otRendreModules()">
        </div>
        <div id="ot-modules"></div>
      </main></div>`;
  },

  _otStatutModule(m) {
    const s = m.status || {};
    if (m.parti)        return { texte: 'Parti',       classe: 'envoyee' };
    const st = this._otStatutEtape(s);           // « de côté » = étiquette sur l'étape réelle (2026-11-19)
    if (s.deCote) st.texte += ' · de côté';
    return st;
  },
  _otStatutEtape(s) {
    if (s.termine)      return { texte: 'Terminé',     classe: 'validee' };
    if (s.aControler)   return { texte: 'À contrôler', classe: 'a_valider' };
    if (s.enCours)      return { texte: 'En cours',    classe: 'encours', avertir: true };
    return { texte: 'Pas commencé', classe: 'brouillon', avertir: true };
  },

  _otRendreModules() {
    const el = document.getElementById('ot-modules');
    if (!el) return;
    if (!S.ot.modules) { el.innerHTML = '<div class="sx-chargement">Chargement des modules du Planning…</div>'; return; }
    const q = S.ot.rechercheModule.trim().toLowerCase();
    const ouvertes = new Set(S.ot.liste.filter(f => ['brouillon', 'a_valider', 'validee'].includes(f.statut)).map(f => f.code_planning));
    let liste = S.ot.modules.filter(m => !q || [m.code, m.codeModule, m.chantier, m.ag, m.module]
      .some(v => String(v || '').toLowerCase().includes(q)));
    // Sans recherche : les modules sur parc d'abord, puis les partis récents.
    liste = liste.slice(0, q ? 60 : 40);
    if (!liste.length) { el.innerHTML = '<div class="sx-carte"><div class="sx-vide">Aucun module trouvé.</div></div>'; return; }
    el.innerHTML = `<div class="sx-carte">${liste.map(m => {
      const st = this._otStatutModule(m);
      return `<button type="button" class="sx-item" onclick="App._otChoisirModule('${_otEsc(m.code)}', ${m.parti ? 'true' : 'false'})">
        <div class="sx-item-texte">
          <span class="sx-item-titre">${_otEsc([m.module, m.codeModule].filter(Boolean).join(' ') || '—')} · <span class="sx-ref">${_otEsc(m.code)}</span></span>
          <span class="sx-item-detail">${_otEsc([m.ag, m.chantier].filter(Boolean).join(' · '))}${ouvertes.has(m.code) ? ' · fiche déjà ouverte' : ''}</span>
        </div>
        <span class="sx-pastille sx-p-${st.classe}">${st.texte}</span>
      </button>`;
    }).join('')}</div>`;
  },

  async _otChoisirModule(code, parti) {
    const m = (S.ot.modules || []).find(x => x.code === code && !!x.parti === parti);
    if (!m) return;
    const st = this._otStatutModule(m);
    if (st.avertir) {
      const ok = await this._otConfirmer({
        titre: st.texte === 'En cours' ? 'Module encore en cours' : 'Module pas encore commencé',
        texte: `Ce module est marqué « ${st.texte} » dans le Planning : des travaux restent peut-être à faire. Ouvrir la fiche quand même ?`,
        ok: 'Ouvrir la fiche',
      });
      if (!ok) return;
    }
    this.toast('⏳ Ouverture de la fiche…');
    try {
      const d = await this._otPost({ action: 'ot_ouvrir', code: m.code, module: {
        numero_module: m.codeModule || '', agence: m.ag || '', type_module: m.module || '', commentaire: m.description || '' } });
      if (d.existante) this.toast('Une fiche existe déjà pour ce module : elle est rouverte');
      S.ot.choix = false;
      S.ot.listeChargee = false;
      await this._otChargerTarifs();
      this._otAfficherFiche(d.fiche);
    } catch (e) {
      this.toast('Ouverture impossible : ' + e.message, 4000);
    }
  },

  /* ─ 🔧 du Stock / de LOXAM (2026-11-16) : hors essai, ouvre la fiche d'opérations du module ─ */
  // Le stock sort à la validation de la fiche (ou par « Sortir du stock maintenant ») ; ce que la 🔧 a sorti
  // avant la bascule est déduit (notes « [Pose CODE] »). Pendant l'essai : fenêtre de pose habituelle.
  async otDepuisPose(code, codeModule, chantier) {
    if (S.ot.essai === null) {
      this.toast('⏳ Ouverture…');
      try { const d = await this._otGet({ action: 'ot_liste', statuts: 'brouillon' }); if (d.essai !== undefined) S.ot.essai = Number(d.essai) === 1; }
      catch (e) { if (!this._otAutorise()) S.ot.essai = true; else { this.toast('Ouverture impossible : ' + e.message, 4000); return; } }
    }
    if (this._otEssai()) return this._openPoseModalDirect(code, codeModule, chantier);
    if (!this._otAutorise()) {
      this.toast('⛔ Les pièces posées se saisissent maintenant sur la fiche d\'opérations : demandez l\'accès « Reconditionnement »', 6000);
      return;
    }
    const cle = String(code || '').toUpperCase();
    const m = [...(S.deps || []), ...(S.archive || [])].find(x => String(x.code || '').toUpperCase() === cle) || {};
    this.toast('⏳ Ouverture de la fiche d\'opérations…');
    try {
      const d = await this._otPost({ action: 'ot_ouvrir', code: m.code || code, module: {
        numero_module: m.codeModule || codeModule || '', agence: m.ag || '', type_module: m.module || '',
        commentaire: m.description || chantier || '' } });
      if (d.existante) this.toast('Fiche d\'opérations du module rouverte');
      S.activity = 'recond';
      S.ot.choix = false;
      S.ot.listeChargee = false;
      await this._otChargerTarifs();
      this._otAfficherFiche(d.fiche);
    } catch (e) {
      this.toast('Ouverture impossible : ' + e.message, 4000);
    }
  },

  /* ═══════════════════════════════ LA FICHE ═══════════════════════════════ */

  async _otChargerTarifs() {
    if (S.ot.tarifs) return;
    const d = await this._otGet({ action: 'ot_tarifs' });
    S.ot.tarifs = d.tarifs || {};
    S.ot.refs = new Map((S.ot.tarifs.references || []).map(r => [r.ref, r]));
    S.ot.forfaits = new Map((S.ot.tarifs.forfaits || []).map(f => [f.lettre, f]));
  },

  async otOuvrirFiche(id) {
    this.toast('⏳ Chargement de la fiche…');
    try {
      const [d] = await Promise.all([this._otGet({ action: 'ot_fiche', id }), this._otChargerTarifs()]);
      this._otAfficherFiche(d.fiche);
    } catch (e) {
      this.toast('Fiche indisponible : ' + e.message, 4000);
    }
  },

  _otAfficherFiche(fiche) {
    S.ot.fiche = fiche;
    S.ot.lignes = (fiche.lignes || []).map(l => ({
      bloc: l.bloc, ref: l.ref, libelle: l.libelle, quantite: l.quantite, unite: l.unite,
      occasion: !!l.occasion, origine: l.origine, mo_saisi: l.mo_saisi ?? null, prix_piece_saisi: l.prix_piece_saisi ?? null,
    }));
    S.ot.calc = fiche.lignes || [];
    // Sanitaire dégroupé d'office pour un module sanitaire ou une fiche qui a déjà du sanitaire, groupé sinon.
    S.ot.sanOuvert = /SANI/i.test(fiche.type_module || '') || S.ot.lignes.some(l => l.bloc === 'sanitaire');
    S.ot.ctTaille = null;
    if (fiche.statut === 'brouillon' && fiche.modele !== 'container') {
      const deja = new Set(S.ot.lignes.filter(l => l.bloc === 'sanitaire').map(l => String(l.ref || '').toUpperCase()));
      OT_SAN_MODELE.forEach(([groupe, pieces]) => pieces.forEach(([ref, nom]) => {
        if (deja.has(ref)) return;
        const r = S.ot.refs.get(ref);
        S.ot.lignes.push({ bloc: 'sanitaire', ref, libelle: (r && r.description) || nom, quantite: null,
          unite: r && r.unite && r.unite !== 'unité' ? r.unite : 'u', occasion: false, origine: 'modele', groupe,
          mo_saisi: null, prix_piece_saisi: null });
      }));
    }
    S.ot.notes = fiche.notes || '';
    S.ot.rev = 0; S.ot.revEnvoyee = 0; S.ot.etat = 'Enregistré';
    S.ot.recherche = { pieces: '', sanitaire: '', bureau: '' };
    if (S.view === 'ot-fiche') this._otRendreFiche(); else this.go('ot-fiche');
  },

  _otModifiable() {
    const f = S.ot.fiche;
    return !!f && (f.statut === 'brouillon' || (f.statut === 'a_valider' && this._otAdmin()));
  },

  // Bandeau de statut, en tête de la fiche, aux couleurs des pastilles de la liste (plus visible qu'une pastille ;
  // demande de Hugo du 2026-11-13). `droite` = contenu aligné à droite (bouton de bascule…).
  _otBandeauStatut(f, droite = '') {
    const admin = this._otAdmin();
    const t = {
      brouillon: ['À compléter', 'saisie de l\'atelier en cours'],
      a_valider: ['À valider', admin ? 'contrôle du bureau : vérifiez quantités et montants, puis validez' : 'envoyée au bureau pour contrôle'],
      validee:   ['Validée', 'prix figés · documents créés à la validation'],
      envoyee:   ['Envoyée', 'partie à LOXAM'],
      annulee:   ['Annulée', ''],
    }[f.statut] || [OT_STATUTS[f.statut] || f.statut, ''];
    return `<div class="sx-statut sx-statut-${_otEsc(f.statut)}" role="status">
      <span class="sx-statut-nom">${_otEsc(t[0])}</span>
      ${f.numero_ot ? `<span class="sx-statut-num">${_otEsc(f.numero_ot)}</span>` : ''}
      <span class="sx-statut-texte">${_otEsc(t[1])}</span>
      ${droite || this._otHtmlBoutonModele ? `<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">${this._otHtmlBoutonModele ? this._otHtmlBoutonModele() : ''}${droite}</span>` : ''}
    </div>`;
  },

  // Sanitaire = pièces refacturées en « main-d'œuvre pièces » (réf. SON- avec un prix pièce).
  _otEstSanitaire(r) { return /^SON-/.test(r.ref) && Number(r.prix_piece) > 0; },

  // Ligne de la liste sanitaire de l'Excel encore sans quantité : affichée seulement, jamais enregistrée.
  _otPenseBete(l) { return !!l && l.origine === 'modele' && !(Number(l.quantite) > 0); },
  _otSanCachee(l) { return !S.ot.sanOuvert && this._otPenseBete(l); },
  _otHtmlSanBascule() {
    const n = S.ot.lignes.filter(l => this._otPenseBete(l)).length;
    if (!n) return '';
    return `<button type="button" class="sx-btn sx-btn-discret sx-san-bascule" aria-expanded="${!!S.ot.sanOuvert}" onclick="App.otSanBasculer()">${S.ot.sanOuvert
      ? 'Grouper la liste sanitaire' : 'Dégrouper : liste sanitaire (' + n + ' pièces)'}</button>`;
  },
  otSanBasculer() {
    S.ot.sanOuvert = !S.ot.sanOuvert;
    this._otRendreFiche();
  },

  _otRendreFiche() {
    const el = document.getElementById('ot-fiche-root');
    const f = S.ot.fiche;
    if (!el || !f) return;
    // Fiche container (container.js) : son propre écran, sauf au contrôle de l'administrateur
    // (aussi au contrôle depuis le 2026-11-18 ; « Vue tableau » = S.ot.ctTableau)
    if (f.modele === 'container' && !(this._otVueControle() && S.ot.ctTableau) && this._otRendreContainer) { this._otRendreContainer(); return; }
    if (S.ot.rapide && this._otRapideDispo()) { this._otRendreRapide(); return; }
    if (this._otVueControle()) { this._otRendreControle(); return; }
    const modif = this._otModifiable();
    const nb = b => S.ot.lignes.filter(l => b.includes(l.bloc) && Number(l.quantite) > 0).length;
    const onglets = [
      { cle: 'pieces',    nom: 'Pièces',    n: nb(['pieces', 'diverses']) },
      { cle: 'sanitaire', nom: 'Sanitaire', n: nb(['sanitaire']) },
      { cle: 'travaux',   nom: 'Travaux · notes', n: nb(['travaux']) },
    ];
    const titreModule = [f.type_module, f.numero_module].filter(Boolean).join(' ');
    const forfaits = [...S.ot.forfaits.values()];

    el.innerHTML = `<div class="sx-ecran sx-ot sx-ot-${_otEsc(f.statut)}">
      ${this._otEntete({ retour: { texte: 'Fiches', action: 'App.otQuitterFiche()' }, titre: 'Fiche d\'opérations',
          sousTitre: [titreModule, f.agence, f.code_planning].filter(Boolean).join(' · '), etat: S.ot.etat,
          bandeau: this._otBandeauStatut(f, this._otRapideDispo() ? '<button type="button" class="sx-btn sx-btn-discret" onclick="App.otBasculerSaisie()">Saisie rapide (clavier)</button>' : '') })}
      <div class="sx-onglets" role="tablist" aria-label="Blocs de la fiche">
        ${onglets.map(o => `<button type="button" class="sx-onglet" role="tab" aria-selected="${S.ot.onglet === o.cle}"
            onclick="App.otOnglet('${o.cle}')">${o.nom} · <span id="ot-n-${o.cle}">${o.n}</span></button>`).join('')}
      </div>
      <main class="sx-contenu">
        ${f.commentaire ? `<div class="sx-carte sx-carte-pad sx-aide" style="font-size:14px;">${_otEsc(f.commentaire)}</div>` : ''}
        ${modif ? '' : `<div class="sx-bandeau sx-bandeau-info">${f.statut === 'a_valider'
            ? 'Fiche envoyée à valider : elle n\'est plus modifiable. « Reprendre en brouillon » pour la corriger.'
            : 'Fiche ' + _otEsc((OT_STATUTS[f.statut] || '').toLowerCase()) + ' : consultation seulement.'}</div>`}

        <section class="sx-section sx-bloc" ${S.ot.onglet === 'pieces' ? '' : 'hidden'} aria-labelledby="ot-t-pieces">
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-pieces">1. Pièces, forfaits et opérations</h2>
            <span class="sx-aide">une ligne sans quantité n'apparaît pas dans les documents</span></div>
          <div class="sx-carte" id="ot-lignes-pieces">${this._otHtmlLignes(['pieces', 'diverses'], modif)}</div>
          ${modif ? `<div class="sx-ligne-champs">
            <div class="sx-recherche" style="flex:2 1 260px;">${_OT_SVG_LOUPE}
              <label for="ot-rech-pieces" class="sx-sr">Ajouter une pièce</label>
              <input id="ot-rech-pieces" type="search" placeholder="+ Pièce : réf. ou désignation" autocomplete="off"
                value="${_otEsc(S.ot.recherche.pieces)}" oninput="App._otRechercher('pieces', this.value)">
            </div>
            <label for="ot-forfait" class="sx-sr">Ajouter un forfait</label>
            <select id="ot-forfait" class="sx-select" style="flex:1 1 220px;" onchange="App._otAjouterForfait(this.value);this.value=''">
              <option value="">+ Ajouter un forfait…</option>
              ${forfaits.map(x => `<option value="${_otEsc(x.lettre)}">${_otEsc(x.lettre)} · ${_otEsc(x.intitule)}</option>`).join('')}
            </select>
          </div>
          <div id="ot-sugg-pieces"></div>` : ''}
        </section>

        <section class="sx-section sx-bloc" ${S.ot.onglet === 'sanitaire' ? '' : 'hidden'} aria-labelledby="ot-t-san">
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-san">2. Sanitaire</h2>${this._otHtmlSanBascule()}</div>
          <div class="sx-carte" id="ot-lignes-sanitaire">${this._otHtmlLignes(['sanitaire'], modif)}</div>
          ${modif ? `<div class="sx-recherche">${_OT_SVG_LOUPE}
              <label for="ot-rech-sanitaire" class="sx-sr">Ajouter une pièce sanitaire</label>
              <input id="ot-rech-sanitaire" type="search" placeholder="+ Chauffe-eau, robinet, PVC…" autocomplete="off"
                value="${_otEsc(S.ot.recherche.sanitaire)}" oninput="App._otRechercher('sanitaire', this.value)">
            </div>
            <div id="ot-sugg-sanitaire"></div>` : ''}
        </section>

        <section class="sx-section sx-bloc" ${S.ot.onglet === 'travaux' ? '' : 'hidden'} aria-labelledby="ot-t-trav">
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-trav">3. Temps passé</h2></div>
          <span class="sx-aide">Une tâche qui n'est pas dans la liste : temps passé, longueur, surface…</span>
          <div class="sx-carte" id="ot-lignes-travaux">${this._otHtmlLignes(['travaux'], modif)}</div>
          ${modif ? `<div class="sx-ligne-champs">
            <label for="ot-tache" class="sx-sr">Tâche</label>
            <input id="ot-tache" class="sx-champ" type="text" placeholder="Tâche, ex. : redressage tôle" style="flex:3 1 200px;">
            <label for="ot-tache-qte" class="sx-sr">Quantité</label>
            <input id="ot-tache-qte" class="sx-champ" type="number" inputmode="decimal" min="0" step="any" placeholder="Qté" style="flex:1 1 80px;">
            <label for="ot-tache-unite" class="sx-sr">Unité</label>
            <select id="ot-tache-unite" class="sx-select" style="flex:1 1 90px;">
              <option value="h">h</option><option value="min">min</option><option value="m">m</option><option value="m²">m²</option><option value="u">unité</option>
            </select>
            <button type="button" class="sx-btn sx-btn-second" style="flex:1 1 110px;" onclick="App._otAjouterTache()">+ Ajouter</button>
          </div>` : ''}
          <div class="sx-section" style="margin-top:8px;">
            <label for="ot-notes" class="sx-h2">4. Notes</label>
            <textarea id="ot-notes" class="sx-textarea" rows="4" ${modif ? '' : 'disabled'}
              oninput="S.ot.notes=this.value;App._otModifie(false)">${_otEsc(S.ot.notes)}</textarea>
            <span class="sx-aide">Pour le bureau, pas pour LOXAM.</span>
          </div>
        </section>
        ${this._otAutorise() ? this._otHtmlStock(f) : ''}
      </main>
      <footer class="sx-pied"><div class="sx-pied-in" id="ot-pied">${this._otHtmlPied()}</div></footer>
    </div>`;
  },

  _otHtmlLignes(blocs, modif) {
    const lignes = S.ot.lignes.map((l, i) => ({ l, i })).filter(x => blocs.includes(x.l.bloc) && !this._otSanCachee(x.l));
    if (!lignes.length) return '<div class="sx-vide">Aucune ligne.</div>';
    const dis = modif ? '' : 'disabled';
    return lignes.map(({ l, i }) => {
      const vide = !(Number(l.quantite) > 0);
      const forfait = S.ot.forfaits.has(l.ref);
      const badges = [];
      if (l.origine === 'office') badges.push('<span class="sx-badge sx-badge-office">D\'OFFICE · retirer si sans objet</span>');
      if (l.origine === 'prevu')  badges.push(vide ? '<span class="sx-badge sx-badge-prevu">PRÉVU · À CONFIRMER</span>' : '<span class="sx-badge sx-badge-ok">PRÉVU · CONFIRMÉ</span>');
      if (forfait)                badges.push('<span class="sx-badge sx-badge-office">FORFAIT</span>');
      if (l.ref && !forfait && !S.ot.refs.has(l.ref)) badges.push('<span class="sx-badge sx-badge-prevu">RÉF. SANS TARIF · montant à saisir au contrôle</span>');
      const occasionPossible = l.bloc === 'pieces' && !forfait && !/^SON-/.test(l.ref || '');
      const unite = l.unite && l.unite !== 'u' ? ` <span class="sx-aide">${_otEsc(l.unite)}</span>` : '';
      return `<div class="sx-ligne${this._otPenseBete(l) ? ' sx-pense-bete' : vide ? ' sx-a-confirmer' : ''}">
        <div class="sx-ligne-texte">
          <span class="sx-ligne-nom">${l.ref ? `<span class="sx-ref">${_otEsc(l.ref)}</span> · ` : ''}${_otEsc(l.libelle || '')}</span>
          ${badges.join('')}
        </div>
        <div class="sx-ligne-actions"><div class="sx-compteur">
          <button type="button" class="sx-moins" aria-label="Retirer un" ${dis} onclick="App._otPas(${i}, -1)">−</button>
          <label for="ot-q-${i}" class="sx-sr">Quantité</label>
          <input id="ot-q-${i}" class="sx-qte" type="number" inputmode="decimal" min="0" step="any" placeholder="—" ${dis}
            value="${_otEsc(l.quantite ?? '')}" oninput="App._otSaisirQte(${i}, this.value)">
          <button type="button" class="sx-plus" aria-label="Ajouter un" ${dis} onclick="App._otPas(${i}, 1)">+</button>
        </div>${unite}
        ${occasionPossible ? `<button type="button" class="sx-bascule" aria-pressed="${l.occasion}" ${dis}
            onclick="App._otOccasion(${i})">${l.occasion ? 'Occasion' : 'Neuve'}</button>` : ''}
        ${modif && l.origine !== 'office' ? `<button type="button" class="sx-retirer" aria-label="Supprimer la ligne" onclick="App._otRetirer(${i})">✕</button>` : ''}
      </div></div>`;
    }).join('');
  },

  _otHtmlPied() {
    const f = S.ot.fiche;
    const admin = this._otAdmin();
    const n = S.ot.lignes.filter(l => Number(l.quantite) > 0).length;
    const total = f.totaux?.total ?? f.total_ht;
    const texte = `<div class="sx-pied-texte">
      <span class="sx-pied-titre">${n} ligne${n > 1 ? 's' : ''}${admin && total !== undefined && total !== null ? ' · ' + _otEuros(total) + ' HT' : ''}</span>
      <span class="sx-aide">${admin ? (S.ot.rev !== S.ot.revEnvoyee ? 'total recalculé à l\'enregistrement' : 'total calculé par le serveur') : 'sans prix'}</span>
    </div>`;
    let boutons = '';
    if (f.statut === 'brouillon') boutons = `<button type="button" class="sx-btn sx-btn-principal" onclick="App.otChangerStatut('a_valider')">Envoyer à valider</button>`;
    else if (f.statut === 'a_valider') boutons = `<button type="button" class="sx-btn sx-btn-discret" onclick="App.otChangerStatut('brouillon')">Reprendre en brouillon</button>`
      + (admin ? `<button type="button" class="sx-btn sx-btn-principal" onclick="App.otChangerStatut('validee')">Valider</button>` : '');
    else if (f.statut === 'validee' && admin) boutons = `<button type="button" class="sx-btn sx-btn-discret" onclick="App.otChangerStatut('a_valider')">Rouvrir</button>`;
    return texte + boutons;
  },

  otOnglet(cle) {
    S.ot.onglet = cle;
    document.querySelectorAll('#ot-fiche-root .sx-onglet').forEach(b => b.setAttribute('aria-selected', String(b.getAttribute('onclick').includes(`'${cle}'`))));
    const blocs = document.querySelectorAll('#ot-fiche-root .sx-bloc');
    ['pieces', 'sanitaire', 'travaux'].forEach((c, k) => { if (blocs[k]) blocs[k].hidden = c !== cle; });
  },

  /* ─ Modifications locales ─ */

  _otRafraichirBlocs() {
    const modif = this._otModifiable();
    const zones = { pieces: ['pieces', 'diverses'], sanitaire: ['sanitaire'], travaux: ['travaux'] };
    Object.entries(zones).forEach(([cle, blocs]) => {
      const z = document.getElementById('ot-lignes-' + cle);
      if (z) z.innerHTML = this._otHtmlLignes(blocs, modif);
      const n = document.getElementById('ot-n-' + cle);
      if (n) n.textContent = S.ot.lignes.filter(l => blocs.includes(l.bloc) && Number(l.quantite) > 0).length;
    });
  },

  _otModifie(redessiner = true) {
    if (!this._otModifiable()) return;
    S.ot.rev++;
    if (redessiner) {
      if (document.getElementById('ot-rg-p')) this._otRgDessiner();
      else if (S.ot.fiche && S.ot.fiche.modele === 'container' && !(this._otVueControle() && S.ot.ctTableau) && this._otRendreContainer) this._otRendreContainer();
      else if (this._otVueControle()) this._otRendreTableControle();
      else this._otRafraichirBlocs();
    }
    this._otAfficherEtat('Modifications non enregistrées');
    const pied = document.getElementById('ot-pied');
    if (pied) pied.innerHTML = this._otHtmlPied();
    clearTimeout(S.ot.minuterie);
    S.ot.minuterie = setTimeout(() => this._otEnregistrer(), 1500);
  },

  _otAfficherEtat(texte) {
    S.ot.etat = texte;
    const e = document.getElementById('ot-etat');
    if (e) e.textContent = texte;
  },

  _otPas(i, d) {
    const l = S.ot.lignes[i];
    if (!l) return;
    l.quantite = Math.max(0, Math.round(((Number(l.quantite) || 0) + d) * 100) / 100);
    this._otModifie();
  },

  _otSaisirQte(i, v) {
    const l = S.ot.lignes[i];
    if (!l) return;
    const n = parseFloat(String(v).replace(',', '.'));
    l.quantite = v === '' || isNaN(n) ? null : Math.max(0, n);
    this._otModifie(false);
    const ligne = document.getElementById('ot-q-' + i)?.closest('.sx-ligne');
    if (ligne) {
      ligne.classList.toggle('sx-a-confirmer', !(Number(l.quantite) > 0) && l.origine !== 'modele');
      ligne.classList.toggle('sx-pense-bete', this._otPenseBete(l));
    }
  },

  _otOccasion(i) {
    const l = S.ot.lignes[i];
    if (l) { l.occasion = !l.occasion; this._otModifie(); }
  },

  _otRetirer(i) {
    S.ot.lignes.splice(i, 1);
    this._otModifie();
  },

  _otAjouter(ligne) {
    // Même réf. déjà présente dans le bloc (et même état neuf/occasion) : on augmente la quantité.
    const ex = ligne.ref && S.ot.lignes.find(l => l.ref === ligne.ref && l.bloc === ligne.bloc && !l.occasion);
    if (ex) ex.quantite = (Number(ex.quantite) || 0) + (Number(ligne.quantite) || 1);
    else S.ot.lignes.push({ occasion: false, origine: 'atelier', unite: 'u', mo_saisi: null, prix_piece_saisi: null, ...ligne });
    this._otModifie();
    this.toast(`✓ ${ligne.ref || ligne.libelle} ajouté`);
  },

  _otAjouterForfait(lettre) {
    const f = S.ot.forfaits.get(lettre);
    if (f) this._otAjouter({ bloc: 'pieces', ref: f.lettre, libelle: f.intitule, quantite: 1 });
  },

  _otAjouterTache() {
    const nom = document.getElementById('ot-tache')?.value.trim();
    const q = parseFloat(String(document.getElementById('ot-tache-qte')?.value || '').replace(',', '.'));
    const unite = document.getElementById('ot-tache-unite')?.value || 'h';
    if (!nom) { this.toast('Indiquez la tâche'); return; }
    if (!(q > 0)) { this.toast('Indiquez la quantité'); return; }
    // Temps : main-d'œuvre au temps (42 €/h, 0,70 €/min) ; autre unité : montant fixé au contrôle.
    const ref = unite === 'h' ? 'SON-0102' : unite === 'min' ? 'SON-0101' : null;
    S.ot.lignes.push({ bloc: 'travaux', ref, libelle: nom, quantite: q, unite, occasion: false, origine: 'atelier', mo_saisi: null, prix_piece_saisi: null });
    this._otModifie();
  },

  _otRechercher(bloc, texte) {
    S.ot.recherche[bloc] = texte;
    const el = document.getElementById('ot-sugg-' + bloc);
    if (!el) return;
    const q = texte.trim().toLowerCase();
    if (!q) { el.innerHTML = ''; return; }
    const sanitaire = bloc === 'sanitaire';
    const res = [...S.ot.refs.values()]
      .filter(r => bloc === 'bureau' ? r.ref !== 'SON-0100'
        : this._otEstSanitaire(r) === sanitaire && r.ref !== 'SON-0100' && r.ref !== 'SON-0101' && r.ref !== 'SON-0102')
      .filter(r => r.ref.toLowerCase().startsWith(q) || (r.description || '').toLowerCase().includes(q))
      .sort((a, b) => (b.ref.toLowerCase() === q) - (a.ref.toLowerCase() === q) || a.ref.localeCompare(b.ref, 'fr', { numeric: true }))
      .slice(0, 12);
    const exacte = res.some(r => r.ref.toLowerCase() === q);
    S.ot.sugg[bloc] = res.map(r => r.ref);
    const autre = !sanitaire && !exacte && /^[A-Za-z0-9-]{1,20}$/.test(texte.trim())
      ? `<button type="button" class="sx-suggestion" onclick="App._otChoisirRef('${bloc}', -1)">
          <span class="sx-ref">${_otEsc(texte.trim().toUpperCase())}</span><span class="sx-aide">réf. absente des tarifs : l'ajouter quand même</span></button>` : '';
    el.innerHTML = res.length || autre ? `<div class="sx-suggestions">${res.map((r, k) =>
      `<button type="button" class="sx-suggestion" onclick="App._otChoisirRef('${bloc}', ${k})">
        <span class="sx-ref">${_otEsc(r.ref)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_otEsc(r.description)}</span></button>`).join('')}${autre}</div>`
      : '<div class="sx-carte"><div class="sx-vide">Rien trouvé.</div></div>';
  },

  // k = position dans les suggestions affichées ; -1 = la réf. tapée, absente des tarifs.
  _otChoisirRef(bloc, k) {
    const inconnue = k < 0;
    const ref = inconnue ? S.ot.recherche[bloc].trim().toUpperCase() : S.ot.sugg[bloc][k];
    if (!ref) return;
    const r = S.ot.refs.get(ref);
    const unite = r && r.unite && r.unite !== 'unité' ? r.unite : 'u';
    // Ajout au contrôle : ligne « bureau », rangée en sanitaire ou en pièces selon la réf.
    const bureau = bloc === 'bureau';
    const blocLigne = bureau ? (r && this._otEstSanitaire(r) ? 'sanitaire' : 'pieces') : bloc;
    this._otAjouter({ bloc: blocLigne, ref, libelle: r ? r.description : (inconnue ? 'Réf. sans tarif' : ref), quantite: 1, unite,
      ...(bureau ? { origine: 'bureau' } : {}) });
    S.ot.recherche[bloc] = '';
    const champ = document.getElementById('ot-rech-' + bloc);
    if (champ) { champ.value = ''; champ.focus(); }
    const sugg = document.getElementById('ot-sugg-' + bloc);
    if (sugg) sugg.innerHTML = '';
  },

  /* ─ Enregistrement ─ */

  async _otEnregistrer() {
    clearTimeout(S.ot.minuterie);
    if (S.ot.enCours) { await S.ot.enCours; if (S.ot.rev === S.ot.revEnvoyee) return true; }
    if (S.ot.rev === S.ot.revEnvoyee || !S.ot.fiche) return true;
    const rev = S.ot.rev;
    const f = S.ot.fiche;
    this._otAfficherEtat('Enregistrement…');
    const envoi = this._otPost({ action: 'ot_enregistrer', id: f.id, version: f.version, notes: S.ot.notes,
      lignes: S.ot.lignes.filter(l => !this._otPenseBete(l)).map(l => ({ bloc: l.bloc, ref: l.ref, libelle: l.libelle, quantite: l.quantite, unite: l.unite,
        occasion: l.occasion, origine: l.origine === 'modele' ? 'atelier' : l.origine, mo_saisi: l.mo_saisi, prix_piece_saisi: l.prix_piece_saisi })) });
    S.ot.enCours = envoi.then(() => {}, () => {});
    try {
      const d = await envoi;
      S.ot.fiche = { ...d.fiche, lignes: undefined };
      S.ot.revEnvoyee = rev;
      if (S.ot.rev === rev) {
        this._otAfficherEtat('Enregistré');
        S.ot.calc = d.fiche.lignes || [];
        if (this._otVueControle() && S.view === 'ot-fiche') this._otMajMontants();
        if (this._otCtMajTotal) this._otCtMajTotal();
      }
      const pied = document.getElementById('ot-pied');
      if (pied && S.view === 'ot-fiche') pied.innerHTML = this._otHtmlPied();
      return true;
    } catch (e) {
      this._otAfficherEtat('Non enregistré');
      if (e.conflit) {
        await this._otConfirmer({ titre: 'Fiche modifiée ailleurs', ok: 'Recharger', annuler: 'Fermer',
          texte: 'Quelqu\'un d\'autre a enregistré cette fiche entre-temps. Elle va être rechargée : refaites votre dernière modification.' });
        this.otOuvrirFiche(f.id);
      } else {
        this.toast('Enregistrement impossible : ' + e.message + ' — nouvel essai dans 10 s', 5000);
        S.ot.minuterie = setTimeout(() => this._otEnregistrer(), 10000);
      }
      return false;
    } finally {
      S.ot.enCours = null;
    }
  },

  async otQuitterFiche() {
    if (S.ot.rev !== S.ot.revEnvoyee && !(await this._otEnregistrer())) {
      const ok = await this._otConfirmer({ titre: 'Modifications non enregistrées', ok: 'Quitter quand même', annuler: 'Rester',
        texte: 'Les dernières modifications n\'ont pas pu être enregistrées. Quitter la fiche quand même ?' });
      if (!ok) return;
    }
    S.ot.fiche = null;
    S.ot.listeChargee = false;
    // Fiche ouverte depuis le tableau Production : on y revient
    const retour = S.ot.retourFiche;
    S.ot.retourFiche = null;
    if (retour) { S.activity = 'loxam'; this.go(retour); return; }
    this.go('ot-liste');
  },

  async otChangerStatut(statut) {
    const f = S.ot.fiche;
    if (!f) return;
    if (!(await this._otEnregistrer())) return;
    const textes = {
      a_valider: f.statut === 'validee'
        ? ['Rouvrir la fiche ?', 'Elle repasse « à valider » : le numéro est gardé, les prix ne sont plus figés.', 'Rouvrir']
        : ['Envoyer à valider ?', 'La fiche passe au bureau pour contrôle. Vous ne pourrez plus la modifier, sauf en la reprenant en brouillon.', 'Envoyer'],
      brouillon: ['Reprendre en brouillon ?', 'La fiche redevient modifiable à l\'atelier.', 'Reprendre'],
      validee:   ['Valider la fiche ?', `Total ${_otEuros(S.ot.fiche.totaux?.total)} HT. ` + (this._otEssai()
                    ? 'Un numéro ESSAI-… est attribué, les prix sont figés et les documents (Excel LOXAM, Excel SONOTRAD, PDF) sont créés.'
                    : 'Un numéro d\'OT est attribué, les prix sont figés, les pièces sont sorties du stock (ce que la 🔧 n\'a pas déjà sorti) et les documents (Excel LOXAM, Excel SONOTRAD, PDF) sont créés.'), 'Valider'],
    };
    const t = textes[statut];
    // Module encore LIBRE au Planning (2026-11-19) : les documents prennent l'agence du Planning à la validation
    if (statut === 'validee') {
      const code = String(f.code_planning || '').toUpperCase();
      const m = [...(S.deps || []), ...(S.ot.modules || [])].find(x => String(x.code || '').toUpperCase() === code);
      if (m && !m.ag) {
        t[0] = 'Module sans agence';
        t[1] = `Au Planning, ${f.code_planning} n'a pas encore d'agence (LIBRE) : l'OT sera validé SANS agence — documents et dossier sans destination. ` + t[1];
        t[2] = 'Valider sans agence';
      }
    }
    if (t && !(await this._otConfirmer({ titre: t[0], texte: t[1], ok: t[2] }))) return;
    if (statut === 'validee') this.toast('⏳ Validation et création des documents…', 20000);
    try {
      const d = await this._otPost({ action: 'ot_statut', id: f.id, statut }, statut === 'validee' ? OT_DELAI_DOCUMENTS : undefined);
      const stock = d.fiche.stock ? ' · ' + this._otTexteStock(d.fiche.stock) : '';
      if (d.fiche.documents_erreur) this.toast('Fiche validée' + stock + ', mais documents non créés : ' + d.fiche.documents_erreur + ' — « Créer les documents » pour réessayer', 8000);
      else this.toast('✓ ' + (OT_STATUTS[d.fiche.statut] || d.fiche.statut) + (d.fiche.numero_ot ? ' · ' + d.fiche.numero_ot : '') + (d.fiche.documents ? ' · documents créés' : '') + stock, stock ? 6000 : undefined);
      delete d.fiche.stock;
      S.ot.listeChargee = false;
      this._otAfficherFiche(d.fiche);
    } catch (e) {
      this.toast('Changement impossible : ' + e.message, 4000);
    }
  },

  /* ═══════════════════════ SAISIE RAPIDE (clavier, au bureau) ═══════════════════════ */
  // Report de la fiche papier au PC (Anaïs, maquette validée le 2026-10-29) : un tableau façon tableur.
  // Entrée = case du dessous ; Entrée sur la ligne vide des réf. = première quantité manquante.
  // Les lignes restent dans l'ordre de saisie : c'est l'ordre envoyé au serveur, donc celui des documents.
  // L'écran tactile (±, onglets) reste pour le téléphone et la tablette sans clavier.

  _otRapideDispo() { return window.matchMedia('(min-width: 900px)').matches; },

  otBasculerSaisie() {
    S.ot.rapide = !S.ot.rapide;
    try { localStorage.setItem('snt_ot_rapide', S.ot.rapide ? '1' : '0'); } catch {}
    this._otRendreFiche();
  },

  _otRendreRapide() {
    const el = document.getElementById('ot-fiche-root');
    const f = S.ot.fiche;
    const modif = this._otModifiable(), admin = this._otAdmin();
    const titreModule = [f.type_module, f.numero_module].filter(Boolean).join(' ');
    const colsPrix = (pu, m) => admin ? `<th class="sx-rg-d sx-rg-pu" title="${pu}">P.U.</th><th class="sx-rg-d">${m}</th>` : '';
    const tableau = (g, titre, aide, tetes) => `
      <section class="sx-section" aria-labelledby="ot-rg-t-${g}">
        <div class="sx-section-tete"><h2 class="sx-h2" id="ot-rg-t-${g}">${titre}</h2><span class="sx-aide">${aide}</span>${g === 's' ? this._otHtmlSanBascule() : ''}</div>
        <div class="sx-carte sx-rg-defile"><table class="sx-rg">
          <thead><tr>${tetes}</tr></thead><tbody id="ot-rg-${g}"></tbody>
        </table></div>
      </section>`;

    // Contrôle (administrateur, fiche à valider / validée) : même tableur que la saisie (demande de Hugo du 2026-11-13),
    // avec le montant modifiable, le total du serveur, les documents. L'ancien tableau reste en « Vue tableau ».
    const ctrl = this._otVueControle();
    el.innerHTML = `<div class="sx-ecran sx-ot sx-ot-${_otEsc(f.statut)}">
      ${this._otEntete({ retour: { texte: 'Fiches', action: 'App.otQuitterFiche()' }, titre: 'Fiche d\'opérations', large: true,
          sousTitre: [titreModule, f.agence, f.code_planning, ctrl && f.saisi_par ? 'saisi par ' + f.saisi_par : ''].filter(Boolean).join(' · '), etat: S.ot.etat,
          bandeau: this._otBandeauStatut(f, `<button type="button" class="sx-btn sx-btn-discret" onclick="App.otBasculerSaisie()">${ctrl ? 'Vue tableau' : 'Saisie tactile'}</button>`) })}
      <main class="sx-contenu sx-large sx-rg-page">
        <div class="sx-rg-col">
          ${f.commentaire ? `<span class="sx-aide" style="font-size:13px;">${_otEsc(f.commentaire)}</span>` : ''}
          ${modif ? '' : `<div class="sx-bandeau sx-bandeau-info">${f.statut === 'a_valider'
              ? 'Fiche envoyée à valider : elle n\'est plus modifiable. « Reprendre en brouillon » pour la corriger.'
              : 'Fiche ' + _otEsc((OT_STATUTS[f.statut] || '').toLowerCase()) + ' : consultation seulement.'}</div>`}
          ${tableau('p', '1. Pièces, forfaits et opérations', 'tapez les réf. de la fiche à la suite, puis les quantités',
              '<th class="sx-rg-n">#</th><th class="sx-rg-ref">Réf.</th><th class="sx-rg-qte sx-rg-d">Qté</th><th>Désignation</th><th class="sx-rg-unite">Unité</th><th class="sx-rg-occ" title="Pièce d\'occasion : MO facturée, pas de fourniture">Occ.</th>' + colsPrix('MO unitaire', 'MO'))}
          ${tableau('s', '2. Sanitaire', 'pièces refacturées au prix pièce ; la main d\'œuvre pièces se calcule seule',
              '<th class="sx-rg-n">#</th><th class="sx-rg-ref">Réf.</th><th class="sx-rg-qte sx-rg-d">Qté</th><th>Désignation</th><th class="sx-rg-unite">Unité</th>' + colsPrix('Prix pièce', 'Montant'))}
          ${tableau('t', '3. Temps passé', 'travail hors tarif : description, durée, h ou m pour l\'unité',
              '<th class="sx-rg-n">#</th><th>Travaux</th><th class="sx-rg-qte sx-rg-d">Durée</th><th class="sx-rg-unite">Unité</th>' + colsPrix('Taux', 'MO'))}
          <div class="sx-section">
            <label for="ot-notes" class="sx-h2">4. Notes</label>
            <textarea id="ot-notes" class="sx-textarea" rows="3" ${modif ? '' : 'disabled'}
              oninput="S.ot.notes=this.value;App._otModifie(false)">${_otEsc(S.ot.notes)}</textarea>
            <span class="sx-aide">Pour le bureau, pas pour LOXAM.</span>
          </div>
        </div>
        <aside class="sx-rg-col sx-rg-cote${ctrl ? ' sx-rg-libre' : ''}">
          ${ctrl ? `<section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:4px;">
              <span class="sx-aide" style="font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Montant de l'OT</span>
              <span class="sx-gros-montant" id="ot-ctrl-total"></span>
              <span class="sx-aide" id="ot-ctrl-detail"></span>
            </section>` : ''}
          ${f.statut === 'a_valider' && ctrl ? this._otHtmlEnValidant(false) : ''}
          ${ctrl && ['validee', 'envoyee'].includes(f.statut) ? this._otHtmlDocuments(f) : ''}
          ${this._otHtmlStock(f)}
          <div class="sx-carte sx-carte-pad sx-rg-recap" id="ot-rg-recap"></div>
          ${modif ? `<div class="sx-carte sx-carte-pad sx-rg-touches">
            <span class="sx-h2" style="font-size:15px;">Au clavier</span>
            <dl>
              <dt><kbd>Entrée</kbd></dt><dd>case du dessous</dd>
              <dt><kbd>Entrée</kbd> sur la ligne vide</dt><dd>fin des réf. : première quantité manquante</dd>
              <dt><kbd>Tab</kbd> · flèches</dt><dd>se déplacer comme dans Excel</dd>
              <dt><kbd>Espace</kbd> ou <kbd>O</kbd></dt><dd>case Occ. : pièce d'occasion</dd>
              <dt><kbd>Échap</kbd></dt><dd>annule la case</dd>
              <dt><kbd>Ctrl</kbd>+<kbd>Suppr</kbd></dt><dd>supprime la ligne</dd>
              <dt><kbd>Ctrl</kbd>+<kbd>Entrée</kbd></dt><dd>insère une ligne au-dessus</dd>
              <dt><kbd>Ctrl</kbd>+<kbd>V</kbd></dt><dd>colle un bloc copié d'Excel (réf. [tab] qté)</dd>
            </dl>
            <span class="sx-aide">Une lettre seule (E, N, L…) est un forfait ; du texte cherche par désignation.</span>
            ${this._otRgMoEdit() ? '<span class="sx-aide">Colonne MO : un montant tapé remplace le tarif (case orange) ; case vidée = retour au tarif.</span>' : ''}
          </div>` : ''}
        </aside>
      </main>
      <div class="sx-rg-sugg" id="ot-rg-sugg" hidden></div>
      <footer class="sx-pied"><div class="sx-pied-in" id="ot-pied">${this._otHtmlPied()}</div></footer>
    </div>`;
    this._otRgDessiner();
    this._otRgEcouter(el);
    if (ctrl) this._otMajMontants();
    if (modif) setTimeout(() => this._otRgAller('p', S.ot.rgIdx.p.length - 1, 0), 30);
  },

  /* ─ Données des tableaux ─ */

  _otRgTarif(ref) {
    const k = String(ref || '').trim().toUpperCase();
    return { k, f: S.ot.forfaits.get(k), r: S.ot.refs.get(k) };
  },
  _otRgNouvelle(g) {
    return g === 't'
      ? { bloc: 'travaux', ref: 'SON-0102', libelle: '', quantite: null, unite: 'h', occasion: false, origine: 'atelier', mo_saisi: null, prix_piece_saisi: null }
      : { bloc: g === 's' ? 'sanitaire' : 'pieces', ref: '', libelle: '', quantite: null, unite: 'u', occasion: false, origine: 'atelier', mo_saisi: null, prix_piece_saisi: null };
  },
  // Montant de MO tapé au clavier (remplace le tarif) : administrateur, fiche modifiable ; pas en sanitaire.
  _otRgMoEdit() { return this._otAdmin() && this._otModifiable(); },
  _otRgMaxC(g) { return OT_RG_MAXC[g] + (g !== 's' && this._otRgMoEdit() ? 1 : 0); },
  _otRgVide(l) {
    return l.origine !== 'office' && !(Number(l.quantite) > 0) && !String(l.bloc === 'travaux' ? l.libelle || '' : l.ref || '').trim();
  },
  // Lignes de chaque tableau (positions dans S.ot.lignes), + une ligne vide (null) en bas si la fiche est modifiable.
  _otRgIndexer() {
    const modif = this._otModifiable();
    Object.keys(OT_RG).forEach(g => {
      const idx = [];
      S.ot.lignes.forEach((l, i) => { if (OT_RG[g].includes(l.bloc) && !this._otSanCachee(l)) idx.push(i); });
      if (modif) idx.push(null);
      S.ot.rgIdx[g] = idx;
    });
  },
  _otRgLigne(g, r) { const i = S.ot.rgIdx[g][r]; return i === null || i === undefined ? null : S.ot.lignes[i]; },

  // Prix (administrateurs seulement : les autres ne reçoivent pas les tarifs). null = inconnu.
  _otRgPu(g, l) {
    const p = S.ot.tarifs?.parametres || {};
    if (g === 't') return l.unite === 'h' ? Number(p.taux_horaire) || null : l.unite === 'min' ? (Number(p.taux_horaire) || 0) / 60 || null : null;
    const { f, r } = this._otRgTarif(l.ref);
    if (g === 's') return l.prix_piece_saisi != null ? Number(l.prix_piece_saisi) : r && r.prix_piece != null ? Number(r.prix_piece) : null;
    if (f) return f.mo != null ? Number(f.mo) : null;
    return r && r.mo != null ? Number(r.mo) : null;
  },
  _otRgMontant(g, l) {
    const q = Number(l.quantite);
    if (!(q > 0)) return null;
    if (g !== 's' && l.mo_saisi != null) return Number(l.mo_saisi);
    const pu = this._otRgPu(g, l);
    if (pu === null) return null;
    const r = g === 'p' ? this._otRgTarif(l.ref).r : null;
    return r && r.mo_plafond != null ? Math.min(q * pu, Number(r.mo_plafond)) : q * pu;
  },
  _otRgMoPieces() {
    const somme = S.ot.rgIdx.s.reduce((s, i) => s + (i === null ? 0 : this._otRgMontant('s', S.ot.lignes[i]) || 0), 0);
    const maj = Number(S.ot.tarifs?.parametres?.majoration_pieces) || 1.1;
    return { somme, mo: somme > 0 ? Math.round((somme + 0.5) * maj / 0.5) * 0.5 : 0 };
  },

  /* ─ Rendu ─ */

  _otRgDessiner() {
    this._otRgIndexer();
    ['p', 's', 't'].forEach(g => { const tb = document.getElementById('ot-rg-' + g); if (tb) tb.innerHTML = this._otRgHtml(g); });
    this._otRgRecap();
  },

  _otRgHtml(g) {
    const modif = this._otModifiable(), admin = this._otAdmin(), idx = S.ot.rgIdx[g];
    const ro = modif ? '' : ' readonly';
    const moEdit = g !== 's' && this._otRgMoEdit();
    const prix = (pu, m, vide, l, r) => !admin ? '' : `<td class="sx-rg-d sx-rg-pu">${pu === null ? '' : _otPrix(pu)}</td>`
      + (moEdit && l
        ? `<td class="sx-rg-saisie sx-rg-d"><input id="ot-rg-${g}-${r}-3" data-rg="${g}" data-r="${r}" data-c="3" class="sx-rg-mo${l.mo_saisi != null ? ' sx-manuel' : ''}"
             value="${l.mo_saisi != null ? _otEsc(_otQte(l.mo_saisi)) : ''}" placeholder="${l.mo_saisi == null && m !== null ? _otPrix(m) : ''}" inputmode="decimal" autocomplete="off"
             title="Montant tapé = remplace le tarif ; case vidée = retour au tarif" aria-label="MO ligne ${r + 1}"></td>`
        : `<td class="sx-rg-d">${m === null ? `<span class="sx-aide">${vide}</span>` : _otPrix(m)}</td>`);

    if (g === 't') return idx.map((i, r) => {
      const l = i === null ? null : S.ot.lignes[i];
      return `<tr data-r="${r}">
        <td class="sx-rg-n">${r + 1}</td>
        <td class="sx-rg-saisie"><input id="ot-rg-t-${r}-0" data-rg="t" data-r="${r}" data-c="0" value="${_otEsc(l ? l.libelle : '')}" autocomplete="off"${ro}
          placeholder="${l ? '' : 'nouvelle ligne'}" aria-label="Travaux ligne ${r + 1}"></td>
        <td class="sx-rg-saisie sx-rg-qte"><input id="ot-rg-t-${r}-1" data-rg="t" data-r="${r}" data-c="1" value="${_otEsc(_otQte(l ? l.quantite : ''))}" inputmode="decimal" autocomplete="off"${ro} aria-label="Durée ligne ${r + 1}"></td>
        <td class="sx-rg-saisie sx-rg-unite"><input id="ot-rg-t-${r}-2" data-rg="t" data-r="${r}" data-c="2" value="${_otEsc(l ? l.unite : 'h')}" readonly aria-label="Unité ligne ${r + 1} (h, m ou Espace)"></td>
        ${l ? prix(this._otRgPu('t', l), this._otRgMontant('t', l), Number(l.quantite) > 0 ? 'au contrôle' : '', l, r) : prix(null, null, '')}
      </tr>`;
    }).join('');

    const vus = {};
    idx.forEach((i, r) => { const k = i === null || this._otPenseBete(S.ot.lignes[i]) ? '' : String(S.ot.lignes[i].ref || '').toUpperCase(); if (k) (vus[k] = vus[k] || []).push(r + 1); });
    let h = idx.map((i, r) => {
      const l = i === null ? null : S.ot.lignes[i];
      const { k, f, r: tr } = this._otRgTarif(l ? l.ref : '');
      const penseBete = this._otPenseBete(l);
      const attente = l && k && !(Number(l.quantite) > 0) && !penseBete;
      const puces = [];
      if (l && !penseBete) {
        if (l.origine === 'office') puces.push('<span class="sx-badge sx-badge-office">D\'OFFICE</span>');
        if (l.origine === 'prevu') puces.push(attente ? '<span class="sx-badge sx-badge-prevu">PRÉVU 🔧 · À CONFIRMER</span>' : '<span class="sx-badge sx-badge-ok">POSÉ 🔧</span>');
        if (f) puces.push('<span class="sx-badge sx-badge-office">FORFAIT</span>');
        if (k && !f && !tr) puces.push('<span class="sx-badge sx-badge-prevu">RÉF. SANS TARIF · montant au contrôle</span>');
        if (g === 'p' && tr && this._otEstSanitaire(tr)) puces.push('<span class="sx-badge sx-badge-prevu">SANITAIRE · à saisir en 2.</span>');
        if (g === 's' && (f || (tr && !this._otEstSanitaire(tr)))) puces.push('<span class="sx-badge sx-badge-prevu">PIÈCE · à saisir en 1.</span>');
        if (k && vus[k].length > 1) puces.push(`<span class="sx-badge sx-badge-prevu">aussi l. ${vus[k].filter(n => n !== r + 1).join(', ')}</span>`);
      }
      const nom = l ? (l.libelle || (f ? f.intitule : tr ? tr.description : '')) : '';
      const occPossible = g === 'p' && l && k && !f && !/^SON-/.test(k);
      const grp = penseBete && l.groupe && (r === 0 || (this._otRgLigne(g, r - 1) || {}).groupe !== l.groupe)
        ? `<tr class="sx-rg-groupe"><td></td><td colspan="${admin ? 6 : 4}">${_otEsc(l.groupe)}</td></tr>` : '';
      return `${grp}<tr data-r="${r}" class="${attente ? 'sx-rg-attente' : penseBete ? 'sx-rg-pense-bete' : ''}">
        <td class="sx-rg-n">${r + 1}</td>
        <td class="sx-rg-saisie sx-rg-ref"><input id="ot-rg-${g}-${r}-0" data-rg="${g}" data-r="${r}" data-c="0" value="${_otEsc(l ? l.ref || '' : '')}" autocomplete="off" spellcheck="false"
          ${modif && !(l && l.origine === 'office') ? '' : 'readonly'} aria-label="Réf. ligne ${r + 1}"></td>
        <td class="sx-rg-saisie sx-rg-qte"><input id="ot-rg-${g}-${r}-1" data-rg="${g}" data-r="${r}" data-c="1" value="${_otEsc(_otQte(l ? l.quantite : ''))}" inputmode="decimal" autocomplete="off"${ro} aria-label="Quantité ligne ${r + 1}"></td>
        <td class="sx-rg-desig">${l ? `<span class="sx-rg-nom" title="${_otEsc(nom)}">${_otEsc(nom)}</span>${puces.join('')}` : `<span class="sx-aide">${modif ? 'nouvelle ligne' : ''}</span>`}</td>
        <td class="sx-rg-unite sx-aide">${l && l.unite && l.unite !== 'u' && !f ? _otEsc(l.unite) : ''}</td>
        ${g === 'p' ? `<td class="sx-rg-occ"><button type="button" id="ot-rg-p-${r}-2" data-rg="p" data-r="${r}" data-c="2" class="sx-rg-occ-btn"
            aria-pressed="${!!(l && l.occasion)}" aria-disabled="${!(modif && occPossible)}" aria-label="Occasion ligne ${r + 1}">${l && l.occasion ? 'O' : ''}</button></td>` : ''}
        ${l ? prix(this._otRgPu(g, l), this._otRgMontant(g, l), k && (f || tr) ? '—' : '', l, r) : prix(null, null, '')}
      </tr>`;
    }).join('');
    if (g === 's' && admin) {
      const mp = this._otRgMoPieces();
      h += `<tr class="sx-rg-calculee"><td class="sx-rg-n"></td><td class="sx-rg-ref"><span class="sx-ref">SON-0100</span></td><td></td>
        <td class="sx-rg-desig" colspan="3">Main d'œuvre pièces <span class="sx-aide">calculée : (${_otEuros(mp.somme)} + 0,50) × ${_otEsc(String(S.ot.tarifs?.parametres?.majoration_pieces ?? 1.1).replace('.', ','))}, arrondi au 0,50</span></td>
        <td class="sx-rg-d"><b>${_otPrix(mp.mo)}</b></td></tr>`;
    }
    return h;
  },

  _otRgRecap() {
    const el = document.getElementById('ot-rg-recap');
    if (!el) return;
    const admin = this._otAdmin();
    const lignes = g => S.ot.rgIdx[g].map((i, r) => [i === null ? null : S.ot.lignes[i], r]).filter(([l]) => l);
    const sansQte = g => lignes(g).filter(([l]) => String(l.ref || '').trim() && !(Number(l.quantite) > 0) && !this._otPenseBete(l));
    const inconnues = g => lignes(g).filter(([l]) => { const { k, f, r } = this._otRgTarif(l.ref); return k && !f && !r; });
    const n = ['p', 's', 't'].reduce((s, g) => s + lignes(g).filter(([l]) => Number(l.quantite) > 0).length, 0);
    let h = `<span class="sx-h2" style="font-size:15px;">Fiche</span>
      <div class="sx-rg-chiffre"><span>Lignes avec quantité</span><b>${n}</b></div>`;
    [['p', ''], ['s', ' (sanitaire)']].forEach(([g, nom]) => {
      const mq = sansQte(g), inc = inconnues(g);
      if (mq.length) h += `<button type="button" class="sx-rg-alerte sx-rg-alerte-qte" onclick="App._otRgAller('${g}', ${mq[0][1]}, 1)">
        <span>${mq.length} réf. sans quantité${nom}</span><b>Saisir →</b></button>`;
      if (inc.length) h += `<button type="button" class="sx-rg-alerte sx-rg-alerte-inc" onclick="App._otRgAller('${g}', ${inc[0][1]}, 0)">
        <span>${inc.length} réf. sans tarif${nom}</span><b>Voir →</b></button>`;
    });
    if (admin) {
      const somme = g => lignes(g).reduce((s, [l]) => s + (this._otRgMontant(g, l) || 0), 0);
      const mp = this._otRgMoPieces().mo, tp = somme('p'), tt = somme('t');
      h += `<div class="sx-rg-chiffre"><span>Pièces et forfaits</span><b>${_otEuros(tp)}</b></div>
        <div class="sx-rg-chiffre"><span>Sanitaire (SON-0100)</span><b>${_otEuros(mp)}</b></div>
        <div class="sx-rg-chiffre"><span>Temps passé</span><b>${_otEuros(tt)}</b></div>
        <div class="sx-rg-chiffre sx-rg-total"><span>Total estimé HT<small>le pied de page donne le total du serveur</small></span><b>${_otEuros(tp + mp + tt)}</b></div>`;
    }
    el.innerHTML = h;
  },

  /* ─ Déplacements ─ */

  // Va à une case. Avant de redessiner, retire les lignes restées vides (sauf celle où l'on va).
  _otRgAller(g, r, c) {
    const idx = S.ot.rgIdx[g];
    // Au-delà de la dernière ligne (ex. Entrée après une réf. tapée dans la ligne vide) : la nouvelle ligne vide du bas.
    const versBas = r >= idx.length;
    r = Math.max(0, Math.min(idx.length - 1, r));
    const cible = versBas ? null : this._otRgLigne(g, r);
    const avant = S.ot.lignes.length;
    S.ot.lignes = S.ot.lignes.filter(l => l === cible || !this._otRgVide(l));
    if (S.ot.lignes.length !== avant) this._otModifie(false);
    this._otRgDessiner();
    const n = S.ot.rgIdx[g];
    if (cible) { const pos = n.findIndex(i => i !== null && S.ot.lignes[i] === cible); r = pos >= 0 ? pos : Math.min(r, n.length - 1); }
    else r = versBas ? n.length - 1 : Math.min(r, n.length - 1);
    c = Math.max(0, Math.min(this._otRgMaxC(g), c));
    const el = document.getElementById(`ot-rg-${g}-${r}-${c}`) || document.getElementById(`ot-rg-${g}-${r}-0`);
    if (!el) return;
    el.focus();
    if (el.select && !el.readOnly) el.select();
  },
  _otRgQteManquante(g) {
    return S.ot.rgIdx[g].findIndex(i => i !== null && String(S.ot.lignes[i].ref || '').trim() && !(Number(S.ot.lignes[i].quantite) > 0) && !this._otPenseBete(S.ot.lignes[i]));
  },

  /* ─ Saisie ─ */

  // Recopie la case dans la ligne (crée la ligne si l'on tape dans la ligne vide du bas).
  _otRgSaisie(el) {
    if (!this._otModifiable()) return;
    const g = el.dataset.rg, r = +el.dataset.r, c = +el.dataset.c;
    let l = this._otRgLigne(g, r);
    if (c === 3) {                                   // MO tapée : remplace le tarif ; vide = retour au tarif
      if (!l) return;
      const n = parseFloat(el.value.replace(/\s/g, '').replace(',', '.'));
      l.mo_saisi = el.value.trim() === '' || isNaN(n) ? null : Math.max(0, n);
      el.classList.toggle('sx-manuel', l.mo_saisi !== null);
      this._otModifie(false);
      return;
    }
    if (!l) {
      if (!el.value.trim()) return;
      l = this._otRgNouvelle(g);
      S.ot.lignes.push(l);
      S.ot.rgIdx[g][r] = S.ot.lignes.length - 1;
    }
    if (c === 1) {
      const n = parseFloat(el.value.replace(/\s/g, '').replace(',', '.'));
      l.quantite = el.value.trim() === '' || isNaN(n) ? null : Math.max(0, n);
    } else if (g === 't') {
      l.libelle = el.value;
    } else {
      this._otRgPoserRef(l, el.value);
    }
    this._otModifie(false);
  },
  _otRgPoserRef(l, valeur) {
    const { k, f, r } = this._otRgTarif(valeur);
    l.ref = k;
    l.libelle = f ? f.intitule : r ? r.description : k ? 'Réf. sans tarif' : '';
    l.unite = r && r.unite && r.unite !== 'unité' ? r.unite : 'u';
    if (f || /^SON-/.test(k)) l.occasion = false;
  },

  /* ─ Suggestions (réf. ou désignation) ─ */

  _otRgChercher(g, texte) {
    const q = texte.trim().toLowerCase();
    if (!q) return [];
    const mots = q.split(/\s+/);
    const texteLibre = /[a-zà-ü]{2,}/.test(q) && !S.ot.refs.has(q.toUpperCase());
    const items = [];
    if (g === 'p') S.ot.forfaits.forEach(f => items.push({ ref: f.lettre, nom: f.intitule }));
    S.ot.refs.forEach(r => {
      if (['SON-0100', 'SON-0101', 'SON-0102'].includes(r.ref) || this._otEstSanitaire(r) !== (g === 's')) return;
      items.push({ ref: r.ref, nom: r.description || '' });
    });
    return items
      .filter(x => (x.ref.toLowerCase().startsWith(q) && x.ref.toLowerCase() !== q)
        || (texteLibre && mots.every(m => x.nom.toLowerCase().includes(m))))
      .sort((a, b) => a.ref.localeCompare(b.ref, 'fr', { numeric: true }))
      .slice(0, 8);
  },
  _otRgSuggerer(el) {
    const boite = document.getElementById('ot-rg-sugg');
    if (!boite) return;
    const g = el.dataset.rg;
    S.ot.rgSugg = this._otRgChercher(g, el.value);
    S.ot.rgSel = /[a-zà-ü]{2,}/i.test(el.value) && !this._otRgTarif(el.value).r && !this._otRgTarif(el.value).f ? 0 : -1;
    if (!S.ot.rgSugg.length) { boite.hidden = true; return; }
    boite.innerHTML = S.ot.rgSugg.map((x, i) => `<div data-k="${i}" class="${i === S.ot.rgSel ? 'sel' : ''}"><span class="sx-ref">${_otEsc(x.ref)}</span><span>${_otEsc(x.nom)}</span></div>`).join('')
      + '<small>↓ ↑ pour choisir · Entrée pour prendre</small>';
    const b = el.getBoundingClientRect();
    boite.style.left = Math.max(8, Math.min(b.left, window.innerWidth - 480)) + 'px';
    boite.style.top = (b.bottom + 2) + 'px';
    boite.hidden = false;
  },
  _otRgCacherSugg() {
    const boite = document.getElementById('ot-rg-sugg');
    if (boite) boite.hidden = true;
    S.ot.rgSugg = []; S.ot.rgSel = -1;
  },
  _otRgPrendre(k, el) {
    const x = S.ot.rgSugg[k];
    if (!x || !el) return;
    el.value = x.ref;
    this._otRgSaisie(el);
    this._otRgCacherSugg();
    this._otRgAller(el.dataset.rg, +el.dataset.r + 1, 0);
  },

  /* ─ Clavier, souris, collage ─ */

  _otRgEcouter(root) {
    if (root.dataset.rgEcoute) return;
    root.dataset.rgEcoute = '1';
    const champ = e => (e.target && e.target.dataset && e.target.dataset.rg) ? e.target : null;

    root.addEventListener('focusin', e => { const el = champ(e); if (el) el.dataset.avant = el.value ?? ''; });
    root.addEventListener('input', e => {
      const el = champ(e); if (!el) return;
      this._otRgSaisie(el);
      if (el.dataset.c === '0' && el.dataset.rg !== 't') this._otRgSuggerer(el);
    });
    root.addEventListener('focusout', e => {
      if (!champ(e)) return;
      setTimeout(() => {
        const a = document.activeElement;
        if (!a || !a.dataset || !a.dataset.rg) { this._otRgCacherSugg(); if (S.view === 'ot-fiche' && document.getElementById('ot-rg-p')) { this._otRgDessiner(); } }
      }, 0);
    });
    root.addEventListener('mousedown', e => {
      const d = e.target.closest('#ot-rg-sugg [data-k]');
      if (!d) return;
      e.preventDefault();
      this._otRgPrendre(+d.dataset.k, document.activeElement);
    });
    root.addEventListener('click', e => {
      const el = champ(e); if (!el || !this._otModifiable()) return;
      const g = el.dataset.rg, r = +el.dataset.r, c = +el.dataset.c;
      if (g === 'p' && c === 2) this._otRgOccasion(r);
      if (g === 't' && c === 2) this._otRgUnite(r, ' ');
    });
    root.addEventListener('keydown', e => this._otRgTouche(e, champ(e)));
    root.addEventListener('paste', e => {
      const el = champ(e); if (!el || el.dataset.rg === 't' || !this._otModifiable()) return;
      const txt = (e.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(txt.trim())) return;
      e.preventDefault();
      const g = el.dataset.rg, c = +el.dataset.c;
      const rangs = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(x => x.split('\t'));
      let r = +el.dataset.r;
      rangs.forEach(cols => {
        let l = this._otRgLigne(g, r);
        if (!l) { l = this._otRgNouvelle(g); S.ot.lignes.push(l); }
        if (c === 0) {
          this._otRgPoserRef(l, cols[0] || '');
          if (cols.length > 1) { const n = parseFloat(String(cols[1]).replace(/\s/g, '').replace(',', '.')); l.quantite = isNaN(n) ? null : n; }
        } else if (c === 1) { const n = parseFloat(String(cols[0]).replace(/\s/g, '').replace(',', '.')); l.quantite = isNaN(n) ? null : n; }
        this._otRgIndexer();
        r++;
      });
      this._otModifie(false);
      this._otRgAller(g, r, c);
      this.toast(`✓ ${rangs.length} ligne${rangs.length > 1 ? 's' : ''} collée${rangs.length > 1 ? 's' : ''}`);
    });
  },

  _otRgOccasion(r) {
    const l = this._otRgLigne('p', r);
    const { k, f } = this._otRgTarif(l ? l.ref : '');
    if (!l || !k || f || /^SON-/.test(k)) return;
    l.occasion = !l.occasion;
    this._otModifie(false);
    this._otRgAller('p', r, 2);
  },
  _otRgUnite(r, touche) {
    const l = this._otRgLigne('t', r);
    if (!l) return;
    const t = touche.toLowerCase();
    l.unite = t === 'h' ? 'h' : t === 'm' ? 'min' : OT_RG_UNITES[(OT_RG_UNITES.indexOf(l.unite) + 1) % OT_RG_UNITES.length];
    l.ref = l.unite === 'h' ? 'SON-0102' : l.unite === 'min' ? 'SON-0101' : null;
    this._otModifie(false);
    this._otRgAller('t', r, 2);
  },

  _otRgTouche(e, el) {
    if (!el) return;
    const g = el.dataset.rg, r = +el.dataset.r, c = +el.dataset.c, modif = this._otModifiable();
    const refs = g !== 't', boite = document.getElementById('ot-rg-sugg');
    const curseur = el.selectionStart !== undefined && el.selectionStart !== null && el.tagName === 'INPUT' && !el.readOnly;
    const fin = !curseur || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
    const debut = !curseur || (el.selectionStart === 0 && el.selectionEnd === 0);
    const k = e.key;

    if (boite && !boite.hidden && refs && c === 0) {
      if (k === 'ArrowDown') { e.preventDefault(); S.ot.rgSel = Math.min(S.ot.rgSugg.length - 1, S.ot.rgSel + 1); }
      else if (k === 'ArrowUp') { e.preventDefault(); S.ot.rgSel = Math.max(-1, S.ot.rgSel - 1); }
      else if (k === 'Enter' && S.ot.rgSel >= 0) { e.preventDefault(); this._otRgPrendre(S.ot.rgSel, el); return; }
      else if (k === 'Escape') { e.preventDefault(); this._otRgCacherSugg(); return; }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        boite.querySelectorAll('[data-k]').forEach(d => d.classList.toggle('sel', +d.dataset.k === S.ot.rgSel));
        return;
      }
    }

    if (modif && g === 'p' && c === 2 && (k === ' ' || k.toLowerCase() === 'o')) { e.preventDefault(); this._otRgOccasion(r); return; }
    if (modif && g === 't' && c === 2 && /^[hm ]$/i.test(k)) { e.preventDefault(); this._otRgUnite(r, k); return; }

    if (modif && k === 'Enter' && (e.ctrlKey || e.metaKey)) {                       // insérer au-dessus
      e.preventDefault();
      const i = S.ot.rgIdx[g][r];
      S.ot.lignes.splice(i === null ? S.ot.lignes.length : i, 0, this._otRgNouvelle(g));
      this._otRgIndexer();
      this._otRgAller(g, r, 0);
      return;
    }
    if (modif && (k === 'Delete' || k === 'Backspace') && (e.ctrlKey || e.metaKey)) {   // supprimer la ligne
      e.preventDefault();
      const l = this._otRgLigne(g, r);
      if (!l) return;
      if (l.origine === 'office') { this.toast('Ligne d\'office : mettez sa quantité à 0 si elle est sans objet'); return; }
      S.ot.lignes.splice(S.ot.rgIdx[g][r], 1);
      this._otModifie(false);
      this._otRgIndexer();
      this._otRgAller(g, r, c);
      this.toast(`Ligne ${r + 1} supprimée`);
      return;
    }
    if (k === 'Escape') {
      e.preventDefault(); this._otRgCacherSugg();
      if (modif && el.tagName === 'INPUT' && !el.readOnly) { el.value = el.dataset.avant || ''; this._otRgSaisie(el); }
      this._otRgAller(g, r, c);
      return;
    }
    if (k === 'Enter') {
      e.preventDefault(); this._otRgCacherSugg();
      const idx = S.ot.rgIdx[g];
      if (refs && c === 0 && !this._otRgLigne(g, r) && r === idx.length - 1) {        // fin des réf. → quantités
        this._otRgAller(g, r, 0);
        const m = this._otRgQteManquante(g);
        if (m >= 0) { this._otRgAller(g, m, 1); this.toast(`Quantités : ligne ${m + 1}`); }
        else this.toast('Toutes les lignes ont une quantité');
        return;
      }
      if (refs && c === 1 && !e.shiftKey && r >= idx.length - 2) { this._otRgAller(g, idx.length - 1, 0); return; }
      this._otRgAller(g, e.shiftKey ? r - 1 : r + 1, c);
      return;
    }
    if (k === 'Tab') {
      e.preventDefault();
      const max = this._otRgMaxC(g);
      if (e.shiftKey) { if (c > 0) this._otRgAller(g, r, c - 1); else if (r > 0) this._otRgAller(g, r - 1, max); }
      else if (c < max) this._otRgAller(g, r, c + 1);
      else this._otRgAller(g, r + 1, 0);
      return;
    }
    if (k === 'ArrowDown') { e.preventDefault(); this._otRgAller(g, r + 1, c); return; }
    if (k === 'ArrowUp') { e.preventDefault(); this._otRgAller(g, r - 1, c); return; }
    if (k === 'ArrowRight' && fin && c < this._otRgMaxC(g)) { e.preventDefault(); this._otRgAller(g, r, c + 1); return; }
    if (k === 'ArrowLeft' && debut && c > 0) { e.preventDefault(); this._otRgAller(g, r, c - 1); }
  },

  /* ═════════════════════════ CONTRÔLE (administrateur) ═════════════════════════ */

  // Un administrateur contrôle une fiche envoyée par l'atelier (ou la consulte une fois validée).
  _otVueControle() {
    return this._otAdmin() && !!S.ot.fiche && S.ot.fiche.statut !== 'brouillon';
  },

  _otRendreControle() {
    const el = document.getElementById('ot-fiche-root');
    const f = S.ot.fiche;
    const modif = this._otModifiable();
    const titreModule = [f.type_module, f.numero_module].filter(Boolean).join(' ');
    const actions = {
      a_valider: `<button type="button" class="sx-btn sx-btn-discret" style="flex:1 1 140px;" onclick="App.otChangerStatut('brouillon')">Renvoyer à l'atelier</button>
                  <button type="button" class="sx-btn sx-btn-principal" style="flex:2 1 180px;" onclick="App.otChangerStatut('validee')">Valider</button>`,
      validee:   `<button type="button" class="sx-btn sx-btn-discret sx-btn-plein" onclick="App.otChangerStatut('a_valider')">Rouvrir pour corriger</button>`,
    }[f.statut] || '';

    // Même découpage que la saisie (1. Pièces… 2. Sanitaire 3. Temps passé), demande de Hugo du 2026-11-13.
    el.innerHTML = `<div class="sx-ecran sx-ot sx-ot-${_otEsc(f.statut)}">
      ${this._otEntete({ retour: { texte: 'Fiches', action: 'App.otQuitterFiche()' },
          titre: [f.numero_ot || 'Contrôle', titreModule].filter(Boolean).join(' · '),
          sousTitre: [f.agence, 'code ' + f.code_planning, f.saisi_par ? 'saisi par ' + f.saisi_par : ''].filter(Boolean).join(' · '),
          etat: S.ot.etat, large: true,
          bandeau: this._otBandeauStatut(f, this._otRapideDispo() ? '<button type="button" class="sx-btn sx-btn-discret" onclick="App.otBasculerSaisie()">Vue tableur</button>' : '') })}
      <main class="sx-contenu sx-large">
        ${f.commentaire ? `<span class="sx-aide" style="font-size:13px;">${_otEsc(f.commentaire)}</span>` : ''}
        <div class="sx-colonnes">
          <div class="sx-principal" style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:flex-end;">
              <label class="sx-case-a-cocher"><input type="checkbox" ${S.ot.familles ? 'checked' : ''}
                onchange="App.otBasculerFamilles(this.checked)">Regrouper les pièces par famille</label>
              <label class="sx-case-a-cocher"><input type="checkbox" ${S.ot.masquer ? 'checked' : ''}
                onchange="S.ot.masquer=this.checked;App._otRendreTableControle()">Masquer les lignes sans quantité</label>
            </div>
            <div id="ot-table-ctrl" style="display:flex;flex-direction:column;gap:16px;"></div>
            ${modif ? `<div class="sx-carte" style="padding:12px 14px;display:flex;flex-direction:column;gap:8px;">
              <div class="sx-recherche">${_OT_SVG_LOUPE}
                <label for="ot-rech-bureau" class="sx-sr">Ajouter une ligne</label>
                <input id="ot-rech-bureau" type="search" placeholder="+ Ajouter une ligne (réf. ou désignation)" autocomplete="off"
                  value="${_otEsc(S.ot.recherche.bureau)}" oninput="App._otRechercher('bureau', this.value)">
              </div>
              <div id="ot-sugg-bureau"></div>
              <span class="sx-aide">Quantités et montants modifiables. Un montant tapé remplace le tarif (case orange) ; ↺ ou case vidée = retour au tarif.
                Une ligne sans quantité n'apparaît pas dans les documents.</span>
            </div>` : ''}
          </div>
          <aside class="sx-cote" aria-label="Total et validation">
            <section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:4px;">
              <span class="sx-aide" style="font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Montant de l'OT</span>
              <span class="sx-gros-montant" id="ot-ctrl-total"></span>
              <span class="sx-aide" id="ot-ctrl-detail"></span>
            </section>
            <section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:6px;">
              <label for="ot-notes" class="sx-h2" style="font-size:16px;">Notes de l'atelier</label>
              <textarea id="ot-notes" class="sx-textarea" rows="4" ${modif ? '' : 'disabled'}
                oninput="S.ot.notes=this.value;App._otModifie(false)">${_otEsc(S.ot.notes)}</textarea>
              <span class="sx-aide">Pour le bureau, jamais dans les documents LOXAM.</span>
            </section>
            ${f.statut === 'a_valider' ? this._otHtmlEnValidant(true) : ''}
            ${['validee', 'envoyee'].includes(f.statut) ? this._otHtmlDocuments(f) : ''}
            ${this._otHtmlStock(f)}
            <div style="display:flex;gap:10px;flex-wrap:wrap;">${actions}</div>
          </aside>
        </div>
      </main></div>`;
    this._otRendreTableControle();
  },

  /* ─ Mode essai / sortie de stock (2026-11-16) ─ */

  _otEssai() { return S.ot.essai !== false; },

  _otHtmlEnValidant(complet) {
    const essai = this._otEssai();
    return `<section class="sx-bandeau sx-bandeau-info" style="display:flex;flex-direction:column;gap:4px;">
      <strong>En validant${essai ? ' (essai)' : ''}, la PWA va :</strong>
      <span>1. ${essai ? 'attribuer un numéro ESSAI-… (la matrice garde les vrais)' : 'attribuer le numéro d\'OT suivant (à la suite de la matrice Excel)'} ;</span>
      <span>2. figer les prix de chaque ligne ;</span>
      ${essai ? '' : '<span>3. sortir du stock les pièces de la fiche, sauf ce que la 🔧 a déjà sorti pour ce module ;</span>'}
      <span>${essai ? '3' : '4'}. créer les documents : Excel LOXAM, Excel SONOTRAD et PDF${complet ? ' (quelques secondes)' : ''}.</span>
      ${complet ? `<span>Le mail à LOXAM se prépare ensuite depuis la liste des fiches.${essai ? ' Aucune sortie de stock pendant l\'essai.' : ''}</span>` : ''}
    </section>`;
  },

  // Carte « Stock » (hors essai) : état de la sortie de stock du module et bouton pour la faire tout de suite.
  _otHtmlStock(f) {
    if (this._otEssai() || !f || f.statut === 'annulee') return '';
    const quand = f.stock_le ? new Date(f.stock_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    return `<section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:8px;">
      <span class="sx-h2" style="font-size:16px;">Stock</span>
      <span class="sx-aide">${quand
        ? 'Stock mis à jour le ' + _otEsc(quand) + '. Si la fiche a changé depuis, la validation (ou le bouton) ne passe que la différence.'
        : (['validee', 'envoyee'].includes(f.statut) ? 'Pièces pas encore sorties du stock pour cette fiche.' : 'Les pièces sortent du stock à la validation. Besoin des pièces avant ? Sortez-les maintenant : la validation ne passera que la différence.')}</span>
      <button type="button" class="sx-btn sx-btn-second" style="align-self:flex-start;" onclick="App.otSortirStock()">${quand ? 'Remettre le stock à jour' : 'Sortir du stock maintenant'}</button>
    </section>`;
  },

  _otTexteStock(s) {
    const n = a => (a || []).length;
    if (!n(s.sorties) && !n(s.entrees)) return 'stock déjà à jour (rien à sortir)';
    return [n(s.sorties) ? `stock : ${n(s.sorties)} réf. sortie${n(s.sorties) > 1 ? 's' : ''}` : '',
            n(s.entrees) ? `${n(s.entrees)} réf. remise${n(s.entrees) > 1 ? 's' : ''} en stock (trop sorti)` : ''].filter(Boolean).join(', ');
  },

  async otSortirStock() {
    const f = S.ot.fiche;
    if (!f) return;
    if (!(await this._otEnregistrer())) return;
    if (!(await this._otConfirmer({ titre: 'Sortir du stock ?',
        texte: 'Les pièces de la fiche sortent du Stock Pidem, sauf ce qui est déjà sorti pour ce module (🔧 ou sortie précédente). Si une pièce a été retirée de la fiche, elle est remise en stock.',
        ok: 'Sortir' }))) return;
    try {
      const d = await this._otPost({ action: 'ot_stock', id: f.id });
      this.toast('✓ ' + this._otTexteStock(d.stock || {}), 5000);
      f.stock_le = new Date().toISOString();
      this._otRendreFiche();
    } catch (e) {
      this.toast('Sortie de stock impossible : ' + e.message, 5000);
    }
  },

  /* ─ Documents d'une fiche validée (créés par le serveur à la validation) ─ */

  _otHtmlDocuments(f) {
    const d = f.documents;
    const noms = { loxam: 'Excel LOXAM', sonotrad: 'Excel SONOTRAD', pdf: 'PDF (version LOXAM)' };
    const liens = d && d.fichiers ? d.fichiers.map(x => `<a class="sx-btn sx-btn-second" href="${_otEsc(x.url)}" target="_blank" rel="noopener"
        title="${_otEsc(x.nom)}">${_otEsc(noms[x.type] || x.nom)}</a>`).join('') : '';
    return `<section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:8px;">
      <span class="sx-h2" style="font-size:16px;">Documents</span>
      ${d ? `<span class="sx-aide">Créés le ${_otEsc(new Date(d.genere_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}
          · date de fin ${_otEsc(d.date_fin ? d.date_fin.split('-').reverse().join('/') : '—')}</span>
        <button type="button" class="sx-btn sx-btn-principal" id="ot-doc-telecharger" style="align-self:flex-start;"
          onclick="App.otTelechargerDocuments()">Télécharger les 3 fichiers</button>
        <span class="sx-aide">Inutile de les télécharger pour la matrice : son bouton « Reporter les OT PWA » les enregistre dans le dossier du module. Une copie reste aussi sur le Drive :</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">${liens}
          <a class="sx-btn sx-btn-discret" href="${_otEsc(d.dossier)}" target="_blank" rel="noopener">Dossier</a></div>`
        : '<div class="sx-bandeau sx-bandeau-info">Pas encore de documents pour cette fiche.</div>'}
      <button type="button" class="sx-btn sx-btn-discret" id="ot-doc-refaire" onclick="App.otRefaireDocuments()">${d ? 'Refaire les documents' : 'Créer les documents'}</button>
    </section>`;
  },

  async otRefaireDocuments() {
    const f = S.ot.fiche;
    if (!f) return;
    const b = document.getElementById('ot-doc-refaire');
    if (b) { b.disabled = true; b.textContent = 'Création en cours…'; }
    try {
      const d = await this._otPost({ action: 'ot_documents', id: f.id }, OT_DELAI_DOCUMENTS);
      S.ot.fiche = { ...S.ot.fiche, documents: d.documents };
      this.toast('✓ Documents créés');
    } catch (e) {
      this.toast('Documents impossibles : ' + e.message, 5000);
    }
    if (S.view === 'ot-fiche') this._otRendreFiche();
  },

  /* ─ Mail groupé à LOXAM (liste des fiches) ─ */

  _otHtmlMail() {
    const prets = S.ot.liste.filter(f => f.statut === 'validee' && f.documents);
    const sans = S.ot.liste.filter(f => f.statut === 'validee' && !f.documents);
    const m = S.ot.mail;
    if (!prets.length && !sans.length && !m) return '';
    let h = `<section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:8px;">
      <span class="sx-h2" style="font-size:16px;">Mail à LOXAM</span>`;
    if (m) {
      h += `<span class="sx-aide">Brouillon téléchargé pour ${m.ids.length} OT : ${_otEsc(m.modules.join(' ; '))}.
          Ouvrez le fichier .eml (il s'ouvre dans Outlook), relisez, envoyez, puis marquez les fiches envoyées.
          Une copie est gardée <a href="${_otEsc(m.url)}" target="_blank" rel="noopener">dans le Drive</a>.</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="sx-btn sx-btn-principal" onclick="App._otTelechargerMail()">Télécharger à nouveau (.eml)</button>
          <button type="button" class="sx-btn sx-btn-second" onclick="App.otMarquerEnvoyees()">Mail envoyé : marquer ${m.ids.length} fiche${m.ids.length > 1 ? 's' : ''} envoyée${m.ids.length > 1 ? 's' : ''}</button>
          <button type="button" class="sx-btn sx-btn-discret" onclick="S.ot.mail=null;App._otRendreListe()">Fermer</button>
        </div>`;
    } else {
      h += `<span class="sx-aide">${prets.length} OT validé${prets.length > 1 ? 's' : ''} pas encore envoyé${prets.length > 1 ? 's' : ''} : un seul mail
          (Nathalie Jadeau, copie Aurélien Lavello et Nicolas Siblas, copie cachée Hugo) avec les Excel LOXAM en pièces jointes.</span>
        ${sans.length ? `<span class="sx-aide" style="color:var(--sx-attention);">${sans.length} fiche${sans.length > 1 ? 's' : ''} validée${sans.length > 1 ? 's' : ''} sans documents : ouvrez-la et « Créer les documents ».</span>` : ''}
        ${prets.length ? `<button type="button" class="sx-btn sx-btn-principal" id="ot-mail-btn" onclick="App.otPreparerMail()">Préparer le mail (${prets.length} OT)</button>` : ''}`;
    }
    return h + '</section>';
  },

  async otPreparerMail() {
    const b = document.getElementById('ot-mail-btn');
    if (b) { b.disabled = true; b.textContent = 'Préparation…'; }
    try {
      const d = await this._otPost({ action: 'ot_mail' });
      // Téléchargement direct du .eml (le lien Drive affiche un avertissement « analyse antivirus impossible »).
      const octets = Uint8Array.from(atob(d.eml || ''), c => c.charCodeAt(0));
      if (S.ot.mail?.blob) URL.revokeObjectURL(S.ot.mail.blob);
      const blob = URL.createObjectURL(new Blob([octets], { type: 'message/rfc822' }));
      S.ot.mail = { blob, url: d.url, nom: d.nom, ids: d.ids || [], modules: d.modules || [] };
      this._otRendreListe();
      this._otTelechargerMail();
      return;
    } catch (e) {
      this.toast('Mail impossible : ' + e.message, 5000);
    }
    this._otRendreListe();
  },

  _otTelechargerMail() {
    const m = S.ot.mail;
    if (!m?.blob) return;
    const a = document.createElement('a');
    a.href = m.blob; a.download = m.nom || 'OT sur modules.eml';
    document.body.appendChild(a); a.click(); a.remove();
  },

  async otMarquerEnvoyees() {
    const m = S.ot.mail;
    if (!m) return;
    const ok = await this._otConfirmer({ titre: 'Mail envoyé à LOXAM ?', ok: 'Marquer envoyées',
      texte: `Les ${m.ids.length} fiche(s) du brouillon passent « Envoyée ». À faire seulement une fois le mail réellement parti.` });
    if (!ok) return;
    try {
      const d = await this._otPost({ action: 'ot_envoyees', ids: m.ids });
      this.toast(`✓ ${d.faites} fiche${d.faites > 1 ? 's' : ''} envoyée${d.faites > 1 ? 's' : ''}` + (d.erreurs?.length ? ' — ' + d.erreurs.join(' ; ') : ''), 4000);
      S.ot.mail = null;
      this.otChargerListe(true);
    } catch (e) {
      this.toast('Changement impossible : ' + e.message, 5000);
    }
  },

  // Sections du contrôle = celles de la saisie (1. Pièces… 2. Sanitaire 3. Temps passé), lignes dans l'ordre de saisie.
  _otSectionsControle() {
    return [
      { cle: 'p', titre: '1. Pièces, forfaits et opérations', aide: 'MO au tarif ; « Vu par LOXAM » = ligne des documents LOXAM', blocs: ['pieces', 'diverses'] },
      { cle: 's', titre: '2. Sanitaire', aide: 'pièces refacturées au prix pièce ; la main-d\'œuvre pièces se calcule seule', blocs: ['sanitaire'] },
      { cle: 't', titre: '3. Temps passé', aide: 'travail hors tarif, au temps', blocs: ['travaux'] },
    ].map(s => ({ ...s, items: S.ot.lignes.map((l, i) => ({ l, i }))
      .filter(x => s.blocs.includes(x.l.bloc) && (!S.ot.masquer || Number(x.l.quantite) > 0)) }));
  },

  // Section 1 regroupée par famille (case cochée) : opérations d'office et forfaits, puis une famille de pièces
  // (catégorie de la réf.) par groupe. Sinon : un seul groupe sans titre.
  _otGroupesControle(items) {
    if (!S.ot.familles) return [{ cle: 'tout', titre: '', items }];
    const groupes = new Map();
    const ajouter = (cle, titre, ordre, x) => {
      if (!groupes.has(cle)) groupes.set(cle, { cle, titre, ordre, items: [] });
      groupes.get(cle).items.push(x);
    };
    items.forEach(x => {
      const l = x.l;
      const r = S.ot.refs.get(l.ref);
      if (l.bloc === 'diverses' || S.ot.forfaits.has(l.ref) || /^SON-/.test(l.ref || ''))
        return ajouter('operations', 'Opérations et forfaits', 0, x);
      const fam = r && r.categorie && r.categorie !== '-' ? r.categorie : 'Autres pièces';
      ajouter('f-' + fam, fam, fam === 'Autres pièces' ? 7 : 1, x);
    });
    return [...groupes.values()].sort((a, b) => a.ordre - b.ordre || a.titre.localeCompare(b.titre, 'fr'));
  },

  _otRendreTableControle() {
    const z = document.getElementById('ot-table-ctrl');
    if (!z) return;
    const modif = this._otModifiable();
    const dis = modif ? '' : 'disabled';
    const ligneHtml = ({ l, i }) => {
      const vide = !(Number(l.quantite) > 0);
      const r = S.ot.refs.get(l.ref);
      const forfait = S.ot.forfaits.has(l.ref);
      const sanitaire = l.bloc === 'sanitaire';
      const interne = /^SON-/.test(l.ref || '') || !l.ref;
      const sansTarif = l.ref && !forfait && !r;
      const manuel = l.mo_saisi !== null;
      const etiquettes = [
        l.occasion ? '<span class="sx-etiquette sx-e-occasion">OCCASION</span>' : '',
        forfait ? '<span class="sx-etiquette sx-e-bloc">FORFAIT</span>' : '',
        l.origine === 'bureau' ? '<span class="sx-etiquette sx-e-bloc">AJOUT BUREAU</span>' : '',
        sansTarif ? `<span class="sx-etiquette sx-e-alerte" id="ot-st-alerte-${i}"${manuel ? ' hidden' : ''}>SANS TARIF</span>` : '',
      ].join('');
      const montant = sanitaire
        ? `<span class="sx-aide" id="ot-mo-${i}"></span>`
        : `<span style="display:inline-flex;align-items:center;gap:2px;">
             ${modif ? `<button type="button" class="sx-retirer" id="ot-raz-${i}" style="width:28px;height:28px;font-size:15px;${manuel ? '' : 'visibility:hidden;'}"
               title="Revenir au tarif" aria-label="Revenir au tarif" onclick="App._otTarifLigne(${i})">↺</button>` : ''}
             <input id="ot-mo-${i}" class="sx-case sx-case-mo${manuel ? ' sx-manuel' : ''}" type="text" inputmode="decimal" ${dis}
               aria-label="Montant de la ligne en euros" value="${manuel ? _otQte(l.mo_saisi) : ''}" oninput="App._otSaisirMo(${i}, this)"></span>`;
      return `<tr class="${vide ? 'sx-vide-ligne' : ''}">
        <td><span class="sx-ref">${_otEsc(l.ref || '—')}</span></td>
        <td>${_otDesig(l.libelle || (r && r.description) || '', etiquettes)}</td>
        <td class="sx-centre"><input id="ot-q-${i}" class="sx-case" type="text" inputmode="decimal" placeholder="—" ${dis}
          aria-label="Quantité" value="${_otQte(l.quantite)}" oninput="App._otSaisirQteCtrl(${i}, this.value)"></td>
        <td class="sx-aide">${_otEsc(l.unite === 'u' ? 'u.' : l.unite)}</td>
        <td class="sx-num sx-aide" id="ot-pu-${i}"></td>
        <td class="sx-num">${montant}</td>
        <td>${vide ? '<span class="sx-aide">—</span>' : interne ? '<span class="sx-non">Non (code SON)</span>' : '<span class="sx-oui">Oui</span>'}</td>
        <td>${modif ? `<button type="button" class="sx-retirer" aria-label="Supprimer la ligne" onclick="App._otRetirer(${i})">✕</button>` : ''}</td>
      </tr>`;
    };
    const tete = `<thead><tr><th scope="col">Réf.</th><th scope="col">Description</th><th scope="col" class="sx-centre">Qté</th>
        <th scope="col">Unité</th><th scope="col" class="sx-num">PU €</th><th scope="col" class="sx-num">Montant €</th>
        <th scope="col">Vu par LOXAM</th><th scope="col"><span class="sx-sr">Supprimer</span></th></tr></thead>`;
    S.ot.groupesAffiches = [];
    z.innerHTML = this._otSectionsControle().map(sec => {
      const sanitaire = sec.cle === 's';
      S.ot.groupesAffiches.push({ cle: 'sec-' + sec.cle, indices: sec.items.map(x => x.i), piece: sanitaire });
      const groupes = sec.cle === 'p' ? this._otGroupesControle(sec.items) : [{ cle: 'tout', titre: '', items: sec.items }];
      groupes.forEach(g => { if (g.titre) S.ot.groupesAffiches.push({ cle: g.cle, indices: g.items.map(x => x.i) }); });
      const corps = groupes.map(g => (g.titre
        ? `<tr class="sx-groupe"><td colspan="5">${_otEsc(g.titre)} <span class="sx-aide">· ${g.items.length}</span></td>
             <td class="sx-num" id="ot-st-${_otEsc(g.cle)}"></td><td colspan="2"></td></tr>` : '')
        + g.items.map(ligneHtml).join('')).join('');
      const mop = sanitaire ? `<tr class="sx-calculee" id="ot-ligne-mop"><td><span class="sx-ref">SON-0100</span></td><td>Main d'œuvre pièces (calculée)</td>
          <td></td><td></td><td></td><td class="sx-num" id="ot-mop"></td><td><span class="sx-non">Non (code SON)</span></td><td></td></tr>` : '';
      return `<section class="sx-section" aria-labelledby="ot-ctrl-t-${sec.cle}">
        <div class="sx-section-tete">
          <h2 class="sx-h2" id="ot-ctrl-t-${sec.cle}">${sec.titre}</h2>
          <span class="sx-aide" style="flex:1;">${sec.aide}</span>
          <b class="sx-num" id="ot-st-sec-${sec.cle}"></b>
        </div>
        <div class="sx-carte sx-table-boite"><table class="sx-table">${tete}
          <tbody>${corps || '<tr><td colspan="8" class="sx-centre sx-aide">Aucune ligne.</td></tr>'}${mop}</tbody></table></div>
      </section>`;
    }).join('');
    this._otMajMontants();
  },

  // Montants affichés = ceux du dernier calcul du serveur ; « … » tant qu'une modification n'est pas recalculée.
  _otMajMontants() {
    const aJour = S.ot.rev === S.ot.revEnvoyee;
    const calc = aJour ? S.ot.calc : [];
    const nombre = n => _otQte(Math.round(Number(n) * 100) / 100);
    S.ot.lignes.forEach((l, i) => {
      const c = calc[i];
      const pu = document.getElementById('ot-pu-' + i);
      if (pu) pu.textContent = !c ? (aJour ? '' : '…')
        : l.bloc === 'sanitaire' ? (Number(c.prix_piece_unitaire) ? nombre(c.prix_piece_unitaire) : '—')
        : l.mo_saisi !== null ? 'manuel' : (Number(c.mo_unitaire) ? nombre(c.mo_unitaire) : '—');
      const champ = document.getElementById('ot-mo-' + i);
      if (!champ) return;
      if (l.bloc === 'sanitaire') {
        champ.textContent = c && Number(c.piece_ligne) > 0 ? 'pièce ' + _otEuros(c.piece_ligne) : (aJour ? '—' : '…');
      } else if (l.mo_saisi === null && champ !== document.activeElement) {
        champ.value = c && Number(c.mo_ligne) ? nombre(c.mo_ligne) : '';
        champ.placeholder = aJour ? '0' : '…';
      }
    });
    // Sous-totaux par groupe (MO des lignes ; le sanitaire montre le prix des pièces)
    (S.ot.groupesAffiches || []).forEach(g => {
      const el = document.getElementById('ot-st-' + g.cle);
      if (!el) return;
      if (!aJour) { el.textContent = '…'; return; }
      const champ = g.piece ? 'piece_ligne' : 'mo_ligne';
      const s = g.indices.reduce((t, i) => t + (Number(calc[i]?.[champ]) || 0), 0);
      el.textContent = (g.piece ? 'pièces ' : '') + _otEuros(s);
    });
    const t = S.ot.fiche.totaux || {};
    const mop = document.getElementById('ot-mop');
    if (mop) mop.textContent = aJour ? _otEuros(t.mo_pieces) : '…';
    const ligneMop = document.getElementById('ot-ligne-mop');
    if (ligneMop) ligneMop.style.display = aJour && !(Number(t.mo_pieces) > 0) ? 'none' : '';
    const tot = document.getElementById('ot-ctrl-total');
    if (tot) tot.textContent = aJour ? _otEuros(S.ot.fiche.total_ht ?? t.total) + ' HT' : 'calcul…';
    const det = document.getElementById('ot-ctrl-detail');
    const maj = String(S.ot.tarifs?.parametres?.majoration_pieces ?? 1.1).replace('.', ',');
    if (det) det.textContent = aJour
      ? `MO des lignes ${_otEuros(t.mo_lignes)} + main-d'œuvre pièces ${_otEuros(t.mo_pieces)} (pièces sanitaire ${_otEuros(t.somme_pieces)} + 0,50, × ${maj}, arrondi au 0,50)`
      : 'Recalcul par le serveur à l\'enregistrement…';
  },

  otBasculerFamilles(on) {
    S.ot.familles = on;
    try { localStorage.setItem('snt_ot_familles', on ? '1' : '0'); } catch {}
    this._otRendreTableControle();
  },

  _otTarifLigne(i) {
    const l = S.ot.lignes[i];
    if (!l) return;
    l.mo_saisi = null;
    this._otModifie();
  },

  _otSaisirQteCtrl(i, v) {
    const l = S.ot.lignes[i];
    if (!l) return;
    const n = parseFloat(String(v).replace(',', '.'));
    l.quantite = String(v).trim() === '' || isNaN(n) ? null : Math.max(0, n);
    document.getElementById('ot-q-' + i)?.closest('tr')?.classList.toggle('sx-vide-ligne', !(Number(l.quantite) > 0));
    this._otModifie(false);
    this._otMajMontants();
  },

  _otSaisirMo(i, champ) {
    const l = S.ot.lignes[i];
    if (!l) return;
    const v = champ.value.trim();
    const n = parseFloat(v.replace(',', '.'));
    l.mo_saisi = v === '' || isNaN(n) ? null : Math.max(0, n);
    champ.classList.toggle('sx-manuel', l.mo_saisi !== null);
    const raz = document.getElementById('ot-raz-' + i);
    if (raz) raz.style.visibility = l.mo_saisi !== null ? '' : 'hidden';
    const alerte = document.getElementById('ot-st-alerte-' + i);
    if (alerte) alerte.hidden = l.mo_saisi !== null;
    this._otModifie(false);
    this._otMajMontants();
  },

  /* ═════════════════════════════ TARIFS (administrateur) ═════════════════════════════
     Mécanique (la même qu'en base, _ot_mo_calculee) — une seule source : le taux horaire.
       Au temps        : base = temps × taux de base ÷ 60, arrondie à l'€ sup. ; MO = base × taux ÷ taux de base, arrondie au 0,50 sup.
       Montant de base : MO = base × taux ÷ taux de base, arrondie au 0,50 sup. (forfaits A–S aussi)
       Heure / minute  : MO = taux (SON-0102) / taux ÷ 60 (SON-0101)
       Prix en dur     : ne suit pas le taux, à revoir à chaque hausse. */

  async otOuvrirTarifs() {
    if (!this._otAdmin()) { this.toast('⛔ Réservé aux administrateurs'); return; }
    this.go('ot-tarifs');
  },

  async otTarifsInit() {
    S.ot.tarifsVue = S.ot.tarifsVue || { recherche: '', filtre: 'tout', journal: null, photos: null, rechPhoto: '', diffPhoto: true };
    S.ot.tarifsVue.essai = null;   // taux essayé à l'écran, pas encore appliqué
    S.ot.tarifsVue.photo = null;   // photo de la grille ouverte
    this._otRendreTarifs();
    try {
      S.ot.tarifs = null;                       // toujours les tarifs à jour en entrant
      await this._otChargerTarifs();
    } catch (e) {
      this.toast('Tarifs indisponibles : ' + e.message, 4000);
    }
    this._otRendreTarifs();
    this._otChargerJournal();
    this._otChargerPhotos();
  },

  _otArrondiSup(x) { return Math.round(Math.ceil(x * 2 - 0.000001) / 2 * 100) / 100; },

  // MO calculée côté écran (aperçu pendant la saisie) ; le serveur refait le même calcul à l'enregistrement.
  _otMoCalculee(mode, temps, base, taux = null) {
    const p = S.ot.tarifs.parametres, t = Number(taux ?? p.taux_horaire), tb = Number(p.taux_base);
    if (mode === 'temps')  return temps > 0 ? this._otArrondiSup(Math.ceil(temps * tb / 60 - 0.000001) * t / tb) : null;
    if (mode === 'base')   return base !== null && base >= 0 ? this._otArrondiSup(base * t / tb) : null;
    if (mode === 'heure')  return t;
    if (mode === 'minute') return Math.round(t / 60 * 10000) / 10000;
    return null;
  },

  async _otChargerJournal() {
    try {
      const d = await this._otGet({ action: 'ot_journal' });
      S.ot.tarifsVue.journal = d.journal || [];
    } catch (e) {
      S.ot.tarifsVue.journal = [];
    }
    const z = document.getElementById('ot-journal');
    if (z) z.innerHTML = this._otHtmlJournal();
  },

  _otRendreTarifs() {
    const el = document.getElementById('ot-tarifs-root');
    if (!el) return;
    const t = S.ot.tarifs;
    const entete = this._otEntete({ retour: this._otRetourListe(), titre: 'Tarifs',
      sousTitre: 'Main-d\'œuvre facturée à LOXAM · tout part du taux horaire', large: true, bandeau: this._otNav('tarifs') });
    if (!t) { el.innerHTML = `<div class="sx-ecran ot-nav-ecran">${entete}<main class="sx-contenu sx-large"><div class="sx-chargement">Chargement des tarifs…</div></main></div>`; return; }
    const p = t.parametres;
    const refs = t.references || [];
    const n = m => refs.filter(r => (r.mode || null) === m).length;
    // Exemple chiffré : une réf. au temps réelle
    const ex = refs.find(r => r.ref === '156' && r.mode === 'temps') || refs.find(r => r.mode === 'temps');
    const exBase = ex ? Math.ceil(ex.temps_min * p.taux_base / 60 - 0.000001) : 0;
    const essai = S.ot.tarifsVue.essai;
    if (!essai && S.ot.tarifsVue.filtre === 'change') S.ot.tarifsVue.filtre = 'tout';
    const filtres = [
      ...(essai ? [{ cle: 'change', nom: `Changent · ${this._otEffetEssai().nb}` }] : []),
      { cle: 'impose', nom: `Prix en dur · ${n('impose')}` },
      { cle: 'temps',  nom: `Au temps · ${n('temps')}` },
      { cle: 'base',   nom: `Montant de base · ${n('base')}` },
      { cle: 'aucun',  nom: `Sans MO · ${n(null)}` },
      { cle: 'tout',   nom: `Toutes · ${refs.length}` },
    ];
    el.innerHTML = `<div class="sx-ecran ot-nav-ecran">${entete}
      <main class="sx-contenu sx-large">

        <section class="sx-section" aria-labelledby="ot-t-meca">
          <h2 class="sx-h2" id="ot-t-meca">1. Le taux horaire</h2>
          <div class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:12px;">
            <div class="sx-ligne-champs" style="align-items:flex-end;">
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label for="ot-taux" style="font-size:13px;font-weight:700;">Taux horaire facturé à LOXAM</label>
                <div style="display:flex;gap:6px;align-items:center;">
                  <input id="ot-taux" class="sx-champ" style="width:120px;font-size:20px;font-weight:700;" type="number" min="1" step="0.5"
                    value="${_otValeurCase(S.ot.tarifsVue.essai ?? p.taux_horaire, true)}" oninput="App._otTauxEnDirect(this.value)">
                  <span class="sx-aide">€/h</span>
                </div>
              </div>
              <span class="sx-aide" style="flex:1 1 260px;">Changez le taux (flèches ou clavier) : l'effet s'affiche aussitôt dans les tableaux.
                Rien n'est enregistré avant « Appliquer ».</span>
            </div>
            <div style="font-size:14px;line-height:1.6;">
              <strong>Tout part de ce taux.</strong> Chaque réf. facturée au temps a un temps de pose en minutes :
              <ul style="margin:6px 0 0;padding-left:20px;">
                <li><strong>Au temps</strong> (${n('temps')} réf.) : temps × ${_otQte(p.taux_base)} €/h ÷ 60, arrondi à l'euro sup. = <em>montant de base</em> ;
                  puis × ${_otQte(p.taux_horaire)} ÷ ${_otQte(p.taux_base)}, arrondi au 0,50 sup. = <em>MO facturée</em>.
                  ${ex ? `<br><span class="sx-aide">Exemple réf. ${_otEsc(ex.ref)} : ${_otQte(ex.temps_min)} min → base ${_otQte(exBase)} € → MO ${_otEuros(ex.mo)}.</span>` : ''}</li>
                <li><strong>Montant de base</strong> (${n('base')} réf.) : pas de temps, une base en € multipliée de la même façon.</li>
                <li><strong>Forfaits</strong> (${(t.forfaits || []).length}) : vous saisissez le prix au taux actuel ; il suit ensuite le taux de la même façon.</li>
                <li><strong>MO au temps passé</strong> : SON-0102 = le taux (${_otEuros(p.taux_horaire)}/h), SON-0101 = le taux ÷ 60 par minute.</li>
                <li><strong>Prix en dur</strong> (${n('impose')} réf., en orange) : ne suivent pas le taux, <strong>à revoir à chaque hausse</strong>.</li>
              </ul>
              <span class="sx-aide">${_otQte(p.taux_base)} €/h est l'ancien taux, un rouage du calcul hérité de la matrice : il ne se modifie pas ici.</span>
            </div>
            <div id="ot-apercu"></div>
          </div>
        </section>

        <section class="sx-section" aria-labelledby="ot-t-refs">
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-refs">2. Références</h2></div>
          <div class="sx-ligne-champs">
            ${filtres.map(f => `<button type="button" class="sx-bascule sx-filtre" aria-pressed="${S.ot.tarifsVue.filtre === f.cle}"
              onclick="S.ot.tarifsVue.filtre='${f.cle}';App._otRendreTarifs()">${f.nom}</button>`).join('')}
          </div>
          <div class="sx-recherche">${_OT_SVG_LOUPE}
            <label for="ot-rech-tarif" class="sx-sr">Chercher une référence</label>
            <input id="ot-rech-tarif" type="search" placeholder="Réf., désignation ou famille… (ou la réf. à créer)" autocomplete="off"
              value="${_otEsc(S.ot.tarifsVue.recherche)}" oninput="S.ot.tarifsVue.recherche=this.value;App._otRendreRefsTarifs()">
          </div>
          <div class="sx-carte"><div class="sx-table-boite" id="ot-refs-tarifs"></div></div>
          <span class="sx-aide">Vous saisissez la case blanche (temps, base ou prix en dur) ; la MO facturée se calcule.
            Prix pièce : prix d'achat d'une pièce sanitaire (refacturée en « main-d'œuvre pièces »). Plafond : maximum par ligne de fiche.</span>
        </section>

        <section class="sx-section" aria-labelledby="ot-t-forf">
          <h2 class="sx-h2" id="ot-t-forf">3. Forfaits</h2>
          <div class="sx-carte"><div class="sx-table-boite" id="ot-forfaits-tarifs">${this._otHtmlForfaitsTarifs()}</div></div>
        </section>

        <section class="sx-section" aria-labelledby="ot-t-pieces">
          <h2 class="sx-h2" id="ot-t-pieces">4. Pièces sanitaire</h2>
          <div class="sx-carte sx-carte-pad sx-ligne-champs" style="align-items:flex-end;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label for="ot-p-majoration_pieces" style="font-size:13px;font-weight:700;">Coefficient « main-d'œuvre pièces »</label>
              <input id="ot-p-majoration_pieces" class="sx-champ" style="width:120px;" type="number" min="1" step="0.01" value="${_otValeurCase(p.majoration_pieces, true)}">
            </div>
            <button type="button" class="sx-btn sx-btn-second" onclick="App._otEnregistrerParam('majoration_pieces')">Enregistrer</button>
            <span class="sx-aide" style="flex:1 1 260px;">Total des prix des pièces sanitaire de la fiche, + 0,50 €, × ce coefficient, arrondi au 0,50 = ligne SON-0100.</span>
          </div>
        </section>

        <section class="sx-section" aria-labelledby="ot-t-histo">
          <h2 class="sx-h2" id="ot-t-histo">5. Historique</h2>
          <h3 style="margin:4px 0 0;font-size:15px;">Photos de la grille</h3>
          <span class="sx-aide">Toute la grille (réf. et forfaits, avec leur MO) est photographiée juste avant chaque changement de taux.</span>
          <div class="sx-carte" id="ot-photos">${this._otHtmlPhotos()}</div>
          <div id="ot-photo-vue"></div>
          <h3 style="margin:12px 0 0;font-size:15px;">Journal des changements</h3>
          <div class="sx-carte" id="ot-journal">${this._otHtmlJournal()}</div>
        </section>
        <span class="sx-aide">Mode essai : ${Number(p.essai) === 1 ? 'oui (numéros ESSAI-…, pas de sortie de stock)' : 'non'}.
          Un changement s'applique aux fiches non validées ; les fiches validées gardent leurs prix figés.</span>
      </main></div>`;
    this._otRendreRefsTarifs();
    this._otRendreBandeau();
    if (S.ot.tarifsVue.photo) this._otRendrePhoto();
  },

  /* ─ Effet en direct d'un nouveau taux ─ */

  // Le tableau (400 lignes) est redessiné après une courte pause de frappe, pas à chaque touche.
  _otTauxEnDirect(v) {
    clearTimeout(S.ot.tarifsVue.minuterie);
    S.ot.tarifsVue.minuterie = setTimeout(() => this._otAppliquerEssai(v), 250);
  },

  _otAppliquerEssai(v) {
    const n = Number(String(v).replace(',', '.'));
    const actuel = Number(S.ot.tarifs.parametres.taux_horaire);
    const avant = S.ot.tarifsVue.essai;
    S.ot.tarifsVue.essai = n > 0 && n !== actuel ? n : null;
    // Les filtres changent (apparition de « Changent ») : on redessine l'en-tête des filtres seulement si besoin.
    if (!!avant !== !!S.ot.tarifsVue.essai) { this._otRendreTarifs(); document.getElementById('ot-taux')?.focus(); return; }
    this._otRendreRefsTarifs();
    const zf = document.getElementById('ot-forfaits-tarifs');
    if (zf) zf.innerHTML = this._otHtmlForfaitsTarifs();
    this._otRendreBandeau();
    const ch = document.querySelector('.sx-filtre[onclick*="\'change\'"]');
    if (ch) ch.textContent = `Changent · ${this._otEffetEssai().nb}`;
  },

  // Nouveau prix d'une réf. au taux essayé (null : ne suit pas le taux).
  _otPrixEssai(r) {
    const e = S.ot.tarifsVue.essai;
    if (!e || !['temps', 'base', 'heure', 'minute'].includes(r.mode)) return null;
    return this._otMoCalculee(r.mode, r.temps_min, r.mo_base, e);
  },
  _otPrixEssaiForfait(f) {
    const e = S.ot.tarifsVue.essai, p = S.ot.tarifs.parametres;
    return e && f.mo_base !== null && f.mo_base !== undefined ? this._otArrondiSup(f.mo_base * e / p.taux_base) : null;
  },

  _otEffetEssai() {
    const t = S.ot.tarifs;
    const refs = (t.references || []).filter(r => { const v = this._otPrixEssai(r); return v !== null && v !== Number(r.mo); });
    const forfaits = (t.forfaits || []).filter(f => { const v = this._otPrixEssaiForfait(f); return v !== null && v !== Number(f.mo); });
    const hausse = refs.filter(r => this._otPrixEssai(r) > Number(r.mo)).length + forfaits.filter(f => this._otPrixEssaiForfait(f) > Number(f.mo)).length;
    return { nb: refs.length + forfaits.length, refs: refs.length, forfaits: forfaits.length, hausse,
             imposes: (t.references || []).filter(r => r.mode === 'impose').length };
  },

  _otRendreBandeau() {
    const z = document.getElementById('ot-apercu');
    if (!z) return;
    const e = S.ot.tarifsVue.essai;
    if (!e) { z.innerHTML = ''; return; }
    const actuel = S.ot.tarifs.parametres.taux_horaire;
    const ef = this._otEffetEssai();
    const sens = e > actuel ? 'augmentent' : 'baissent';
    z.innerHTML = `<div class="sx-bandeau sx-bandeau-attention" style="display:flex;flex-direction:column;gap:6px;">
      <strong style="font-size:16px;">Essai à ${_otQte(e)} €/h — rien n'est encore enregistré.</strong>
      <span>• <strong>${ef.refs} réf. et ${ef.forfaits} forfaits ${sens}</strong> : en jaune dans les tableaux, ancien prix barré → nouveau prix.
        Filtre « Changent » pour ne voir qu'eux.</span>
      <span>• <strong>${ef.imposes} prix en dur ne bougent pas</strong> : en orange, à revoir après l'application.</span>
      <span>• Les fiches déjà validées gardent leurs prix. La grille actuelle est photographiée avant le changement.</span>
      <div class="sx-ligne-champs" style="margin-top:4px;">
        <button type="button" class="sx-btn sx-btn-discret" onclick="document.getElementById('ot-taux').value='${_otValeurCase(actuel, true)}';App._otAppliquerEssai('${actuel}')">Revenir à ${_otQte(actuel)} €/h</button>
        <button type="button" class="sx-btn sx-btn-principal" onclick="App._otAppliquerTaux(${Number(e)})">Appliquer ${_otQte(e)} €/h</button>
      </div></div>`;
  },

  async _otAppliquerTaux(taux) {
    const ok = await this._otConfirmer({ titre: `Appliquer ${_otQte(taux)} €/h ?`, ok: 'Appliquer',
      texte: 'Les tarifs au temps, en montant de base et les forfaits sont recalculés. Les fiches déjà validées gardent leurs prix. Pensez à revoir les prix en dur.' });
    if (!ok) return;
    try {
      const d = await this._otPost({ action: 'ot_tarif', type: 'parametre', cle: 'taux_horaire', valeurs: { valeur: taux } });
      this.toast(`✓ ${_otQte(taux)} €/h appliqué · ${d.apres?.tarifs_recalcules ?? '?'} tarifs recalculés · photo n° ${d.apres?.photo ?? '?'} de l'ancienne grille`, 5000);
      S.ot.tarifsVue.filtre = 'impose';   // ensuite : revoir les prix en dur
      await this.otTarifsInit();
    } catch (e) {
      this.toast('Changement impossible : ' + e.message, 4000);
    }
  },

  /* ─ Références ─ */

  _otRendreRefsTarifs() {
    const z = document.getElementById('ot-refs-tarifs');
    if (!z || !S.ot.tarifs) return;
    const q = S.ot.tarifsVue.recherche.trim().toLowerCase();
    const f = S.ot.tarifsVue.filtre;
    const toutes = S.ot.tarifs.references || [];
    const res = toutes
      .filter(r => f === 'tout' || (f === 'aucun' ? !r.mode : f === 'change' ? (this._otPrixEssai(r) ?? Number(r.mo)) !== Number(r.mo) : r.mode === f))
      .filter(r => !q || r.ref.toLowerCase().startsWith(q) || (r.description || '').toLowerCase().includes(q) || (r.categorie || '').toLowerCase().includes(q))
      .sort((a, b) => (b.ref.toLowerCase() === q) - (a.ref.toLowerCase() === q) || a.ref.localeCompare(b.ref, 'fr', { numeric: true }));
    const saisie = S.ot.tarifsVue.recherche.trim();
    // Création proposée seulement pour ce qui ressemble à une réf. (au moins un chiffre).
    const creable = saisie && /^[A-Za-z0-9-]{1,20}$/.test(saisie) && /\d/.test(saisie) && !toutes.some(r => r.ref.toLowerCase() === q);
    S.ot.tarifsVue.affichees = res.map(r => r.ref);
    const lignes = res.map((r, k) => this._otHtmlLigneTarif(r, k)).join('');
    const nouvelle = creable ? this._otHtmlLigneTarif({ ref: saisie.toUpperCase(), description: '', mode: 'temps', nouvelle: true }, 'n') : '';
    z.innerHTML = `<table class="sx-table sx-grille sx-serre" style="min-width:1000px;">
      <thead><tr><th scope="col">Réf.</th><th scope="col">Désignation</th><th scope="col" class="sx-centre">Calcul</th>
        <th scope="col" class="sx-centre">Temps de pose<br>(min)</th><th scope="col" class="sx-centre">Base €<br>(à ${_otQte(S.ot.tarifs.parametres.taux_base)} €/h)</th>
        <th scope="col" class="sx-centre">MO facturée €</th><th scope="col" class="sx-centre">Prix pièce €</th><th scope="col" class="sx-centre">Plafond €</th>
        <th scope="col"><span class="sx-sr">Enregistrer</span></th></tr></thead>
      <tbody>${lignes}${nouvelle}
        ${!res.length && !creable ? '<tr><td colspan="9" class="sx-centre sx-aide">Aucune réf. ici. Tapez une réf. pour la créer.</td></tr>' : ''}
      </tbody></table>`;
  },

  _otHtmlLigneTarif(r, k) {
    const modes = [['temps', 'Au temps'], ['base', 'Montant de base'], ['impose', 'Prix en dur'], ['', 'Sans MO']];
    const special = r.mode === 'heure' || r.mode === 'minute';
    const impose = r.mode === 'impose';
    // Cases numériques avec flèches : montants au centime (pas de 0,50 = l'arrondi des MO), temps en minutes entières.
    const caseNum = (id, val, actif, { pas = '0.5', prix = true } = {}) => `<input id="${id}" class="sx-case sx-case-num" style="${actif ? '' : 'display:none;'}"
      type="number" min="0" step="${pas}" value="${_otValeurCase(val, prix)}" oninput="App._otTarifSaisi('${k}')">`;
    const essai = this._otPrixEssai(r);
    const change = essai !== null && essai !== Number(r.mo);
    const avantApres = `<s class="sx-aide">${_otPrix(r.mo)}</s> → <strong>${_otPrix(essai)}</strong>`;
    return `<tr id="ot-tr-${k}" class="${change ? 'sx-tr-change' : impose ? 'sx-tr-impose' : ''}">
      <td><span class="sx-ref">${_otEsc(r.ref)}</span></td>
      <td>${r.nouvelle ? `<label for="ot-tr-desc-${k}" class="sx-sr">Désignation</label><input id="ot-tr-desc-${k}" class="sx-champ" style="width:100%;height:34px;" placeholder="Nouvelle réf. — désignation (vide = celle du Stock)">`
        : _otDesig(r.description, r.categorie && r.categorie !== '-' ? `<span class="sx-etiquette sx-e-bloc">${_otEsc(r.categorie)}</span>` : '')}</td>
      <td class="sx-centre">${special ? `<span class="sx-aide">${r.mode === 'heure' ? '= taux horaire' : '= taux ÷ 60'}</span>`
        : `<label for="ot-tr-mode-${k}" class="sx-sr">Calcul</label><select id="ot-tr-mode-${k}" class="sx-select" style="height:28px;font-size:13px;padding:0 4px;border-radius:8px;"
            onchange="App._otTarifSaisi('${k}')">${modes.map(([v, l]) => `<option value="${v}"${(r.mode || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`}</td>
      <td class="sx-centre">${special ? '' : caseNum('ot-tr-tps-' + k, r.temps_min, true, { pas: '1', prix: false })}</td>
      <td class="sx-centre">${special ? '' : `${caseNum('ot-tr-base-' + k, r.mode === 'base' ? r.mo_base : null, r.mode === 'base')}
        <span class="sx-aide" id="ot-tr-bcalc-${k}">${r.mode === 'temps' ? _otPrix(r.mo_base) : ''}</span>`}</td>
      <td class="sx-centre" style="white-space:nowrap;">${special ? (change ? avantApres : `<strong>${_otPrix(r.mo)}</strong>`)
        : `<strong id="ot-tr-mo-${k}" style="${impose ? 'display:none;' : ''}">${change ? avantApres : r.mo !== null && r.mo !== undefined ? _otPrix(r.mo) : '—'}</strong>
        ${caseNum('ot-tr-prix-' + k, impose ? r.mo : null, impose)}${impose && S.ot.tarifsVue.essai ? ' <span class="sx-badge sx-badge-prevu">à revoir</span>' : ''}`}</td>
      <td class="sx-centre">${caseNum('ot-tr-pp-' + k, r.prix_piece, true, { pas: '0.01' })}</td>
      <td class="sx-centre">${caseNum('ot-tr-pl-' + k, r.mo_plafond, true, { pas: '1' })}</td>
      <td><button type="button" class="sx-btn ${r.nouvelle ? 'sx-btn-principal' : 'sx-btn-second'} ot-enreg" style="height:28px;padding:0 10px;font-size:13px;border-radius:8px;"
        ${r.nouvelle ? '' : 'disabled'} onclick="App._otEnregistrerRef('${k}')">${r.nouvelle ? 'Créer' : 'Enregistrer'}</button></td>
    </tr>`;
  },

  // Saisie dans une ligne : cases utiles selon le calcul choisi, MO recalculée à l'écran, bouton actif.
  _otTarifSaisi(k) {
    const mode = document.getElementById('ot-tr-mode-' + k)?.value ?? null;
    const vis = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; };
    vis('ot-tr-base-' + k, mode === 'base');
    const prix = document.getElementById('ot-tr-prix-' + k);
    const mo = document.getElementById('ot-tr-mo-' + k);
    if (prix) prix.style.display = mode === 'impose' ? '' : 'none';
    if (mo) mo.style.display = mode === 'impose' ? 'none' : '';
    const tr = document.getElementById('ot-tr-' + k);
    if (tr && !tr.classList.contains('sx-tr-change')) tr.className = mode === 'impose' ? 'sx-tr-impose' : '';
    const temps = this._otLireMontant('ot-tr-tps-' + k).val, base = this._otLireMontant('ot-tr-base-' + k).val;
    const tb = Number(S.ot.tarifs.parametres.taux_base);
    const bcalc = document.getElementById('ot-tr-bcalc-' + k);
    if (bcalc) bcalc.textContent = mode === 'temps' && temps > 0 ? _otPrix(Math.ceil(temps * tb / 60 - 0.000001)) : '';
    if (mo) { const v = this._otMoCalculee(mode || null, temps, base); mo.textContent = mode ? (v === null ? '?' : _otPrix(v)) : '—'; }
    const b = tr?.querySelector('.ot-enreg');
    if (b) b.disabled = false;
  },

  async _otEnregistrerRef(k) {
    const nouvelle = k === 'n';
    const ref = nouvelle ? S.ot.tarifsVue.recherche.trim().toUpperCase() : S.ot.tarifsVue.affichees[Number(k)];
    if (!ref) return;
    const sel = document.getElementById('ot-tr-mode-' + k);
    const valeurs = {};
    const lire = (cle, id) => { const v = this._otLireMontant(id); if (!v.ok) throw new Error('Montant invalide'); valeurs[cle] = v.val; };
    try {
      if (sel) {
        const mode = sel.value || null;
        valeurs.mode = mode;
        lire('temps_min', 'ot-tr-tps-' + k);
        if (mode === 'base')   lire('mo_base', 'ot-tr-base-' + k);
        if (mode === 'impose') lire('mo', 'ot-tr-prix-' + k);
      }
      lire('prix_piece', 'ot-tr-pp-' + k);
      lire('mo_plafond', 'ot-tr-pl-' + k);
    } catch (e) { this.toast(e.message); return; }
    if (nouvelle) {
      const desc = document.getElementById('ot-tr-desc-n')?.value.trim();
      if (desc) valeurs.description = desc;   // vide : le serveur reprend la désignation du Stock
    }
    await this._otEnvoyerTarif('reference', ref, valeurs, 'Réf. ' + ref);
  },

  /* ─ Forfaits ─ */

  _otHtmlForfaitsTarifs() {
    const fs = [...((S.ot.tarifs && S.ot.tarifs.forfaits) || [])].sort((a, b) => a.lettre.localeCompare(b.lettre));
    return `<table class="sx-table sx-grille sx-serre" style="min-width:760px;">
      <thead><tr><th scope="col">Forfait</th><th scope="col">Intitulé</th><th scope="col" class="sx-centre">MO facturée €</th>
        <th scope="col" class="sx-centre">Base €<br>(à ${_otQte(S.ot.tarifs.parametres.taux_base)} €/h)</th><th scope="col" class="sx-centre">Prix pièce €</th><th scope="col">Pièces comprises</th>
        <th scope="col"><span class="sx-sr">Enregistrer</span></th></tr></thead>
      <tbody>${fs.map(f => { const essai = this._otPrixEssaiForfait(f); const change = essai !== null && essai !== Number(f.mo); return `<tr id="ot-tf-${_otEsc(f.lettre)}" class="${change ? 'sx-tr-change' : ''}">
        <td><span class="sx-ref">${_otEsc(f.lettre)}</span></td>
        <td>${_otEsc(f.intitule)}</td>
        <td class="sx-centre"><input id="ot-tf-mo-${_otEsc(f.lettre)}" class="sx-case sx-case-num" type="number" min="0" step="0.5"
          value="${_otValeurCase(f.mo, true)}" oninput="App._otForfaitSaisi('${_otEsc(f.lettre)}')">${change ? `<br><span class="sx-aide">→ <strong>${_otPrix(essai)}</strong></span>` : ''}</td>
        <td class="sx-centre sx-aide" id="ot-tf-base-${_otEsc(f.lettre)}">${f.mo_base === null || f.mo_base === undefined ? '—' : _otPrix(f.mo_base)}</td>
        <td class="sx-centre"><input id="ot-tf-pp-${_otEsc(f.lettre)}" class="sx-case sx-case-num" type="number" min="0" step="0.01"
          value="${_otValeurCase(f.prix_piece, true)}" oninput="App._otForfaitSaisi('${_otEsc(f.lettre)}')"></td>
        <td class="sx-aide">${(f.pieces || []).map(x => _otEsc(x.ref) + ' ×' + _otQte(x.qte)).join(', ') || '—'}</td>
        <td><button type="button" class="sx-btn sx-btn-second ot-enreg" style="height:28px;padding:0 10px;font-size:13px;border-radius:8px;" disabled
          onclick="App._otEnregistrerForfait('${_otEsc(f.lettre)}')">Enregistrer</button></td>
      </tr>`; }).join('')}</tbody></table>`;
  },

  // Forfait : on saisit le prix au taux actuel ; la base (à l'ancien taux) en est déduite, pour suivre les hausses.
  _otForfaitSaisi(lettre) {
    const mo = this._otLireMontant('ot-tf-mo-' + lettre).val;
    const p = S.ot.tarifs.parametres;
    const base = document.getElementById('ot-tf-base-' + lettre);
    if (base) base.textContent = mo === null ? '—' : _otPrix(mo * p.taux_base / p.taux_horaire);
    const b = document.getElementById('ot-tf-' + lettre)?.querySelector('.ot-enreg');
    if (b) b.disabled = false;
  },

  async _otEnregistrerForfait(lettre) {
    const mo = this._otLireMontant('ot-tf-mo-' + lettre), pp = this._otLireMontant('ot-tf-pp-' + lettre);
    if (!mo.ok || !pp.ok || mo.val === null) { this.toast('Montant invalide'); return; }
    await this._otEnvoyerTarif('forfait', lettre, { mo: mo.val, prix_piece: pp.val ?? 0 }, 'Forfait ' + lettre);
  },

  /* ─ Photos de la grille ─ */

  async _otChargerPhotos() {
    try {
      const d = await this._otGet({ action: 'ot_photos' });
      S.ot.tarifsVue.photos = d.photos || [];
    } catch (e) {
      S.ot.tarifsVue.photos = [];
    }
    const z = document.getElementById('ot-photos');
    if (z) z.innerHTML = this._otHtmlPhotos();
  },

  _otHtmlPhotos() {
    const ph = S.ot.tarifsVue && S.ot.tarifsVue.photos;
    if (!ph) return '<div class="sx-chargement">Chargement des photos…</div>';
    if (!ph.length) return '<div class="sx-vide">Aucune photo pour l\'instant.</div>';
    return ph.map(x => `<div class="sx-ligne">
        <div class="sx-ligne-texte">
          <span class="sx-ligne-nom" style="white-space:normal;">${_otEsc(x.motif || 'Photo')} — taux ${_otQte(x.taux_horaire)} €/h</span>
          <span class="sx-aide">${_otEsc(new Date(x.le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))}
            ${x.par ? '· ' + _otEsc(x.par) : ''} · ${x.nb_refs} réf., ${x.nb_forfaits} forfaits</span>
        </div>
        <button type="button" class="sx-btn sx-btn-second" style="height:34px;padding:0 12px;font-size:13px;" onclick="App.otVoirPhoto(${Number(x.id)})">Voir</button>
      </div>`).join('');
  },

  async otVoirPhoto(id) {
    const z = document.getElementById('ot-photo-vue');
    if (z) z.innerHTML = '<div class="sx-chargement">Ouverture de la photo…</div>';
    try {
      const d = await this._otGet({ action: 'ot_photo', id });
      S.ot.tarifsVue.photo = d.photo;
      this._otRendrePhoto();
      document.getElementById('ot-photo-vue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      if (z) z.innerHTML = '';
      this.toast('Photo indisponible : ' + e.message, 4000);
    }
  },

  // Photo comparée à la grille d'aujourd'hui : lignes différentes surlignées.
  _otRendrePhoto() {
    const z = document.getElementById('ot-photo-vue');
    const ph = S.ot.tarifsVue.photo;
    if (!z || !ph) return;
    const auj = new Map((S.ot.tarifs.references || []).map(r => [r.ref, r]));
    const ajF = new Map((S.ot.tarifs.forfaits || []).map(f => [f.lettre, f]));
    const modes = { temps: 'au temps', base: 'montant de base', impose: 'prix en dur', heure: 'à l\'heure', minute: 'à la minute' };
    const q = S.ot.tarifsVue.rechPhoto.trim().toLowerCase();
    const lignes = [
      ...(ph.forfaits || []).map(f => ({ cle: f.lettre, nom: 'Forfait ' + f.lettre, desc: f.intitule, mode: '', avant: f.mo, maint: ajF.get(f.lettre)?.mo })),
      ...(ph.references || []).map(r => ({ cle: r.ref, nom: r.ref, desc: r.description, mode: modes[r.mode] || '—', avant: r.mo, maint: auj.get(r.ref)?.mo })),
    ].map(l => ({ ...l, diff: Number(l.avant ?? 0) !== Number(l.maint ?? 0) }))
     .filter(l => !S.ot.tarifsVue.diffPhoto || l.diff)
     .filter(l => !q || l.cle.toLowerCase().startsWith(q) || (l.desc || '').toLowerCase().includes(q));
    const nbDiff = [...(ph.forfaits || []), ...(ph.references || [])].length;
    z.innerHTML = `<div class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:8px;border:2px solid var(--sx-bleu);">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <strong style="flex:1 1 260px;">Photo du ${_otEsc(new Date(ph.le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}
          — taux ${_otQte(ph.taux_horaire)} €/h<br><span class="sx-aide">${_otEsc(ph.motif || '')}</span></strong>
        <button type="button" class="sx-btn sx-btn-discret" style="height:34px;" onclick="S.ot.tarifsVue.photo=null;document.getElementById('ot-photo-vue').innerHTML=''">Fermer</button>
      </div>
      <div class="sx-ligne-champs" style="align-items:center;">
        <div class="sx-recherche" style="flex:1 1 260px;height:40px;">${_OT_SVG_LOUPE}
          <label for="ot-rech-photo" class="sx-sr">Chercher dans la photo</label>
          <input id="ot-rech-photo" type="search" placeholder="Réf. ou désignation…" value="${_otEsc(S.ot.tarifsVue.rechPhoto)}"
            oninput="S.ot.tarifsVue.rechPhoto=this.value;App._otRendrePhoto();document.getElementById('ot-rech-photo').focus()">
        </div>
        <label class="sx-case-a-cocher"><input type="checkbox" ${S.ot.tarifsVue.diffPhoto ? 'checked' : ''}
          onchange="S.ot.tarifsVue.diffPhoto=this.checked;App._otRendrePhoto()">Seulement ce qui a changé depuis</label>
      </div>
      <div class="sx-table-boite" style="max-height:480px;overflow-y:auto;">
        <table class="sx-table sx-grille sx-serre" style="min-width:640px;">
          <thead><tr><th>Réf.</th><th>Désignation</th><th class="sx-centre">Calcul</th>
            <th class="sx-centre">MO à cette date €</th><th class="sx-centre">MO aujourd'hui €</th></tr></thead>
          <tbody>${lignes.map(l => `<tr class="${l.diff ? 'sx-tr-change' : ''}">
              <td><span class="sx-ref">${_otEsc(l.nom)}</span></td><td>${_otDesig(l.desc || '')}</td>
              <td class="sx-centre sx-aide">${_otEsc(l.mode)}</td>
              <td class="sx-centre"><strong>${_otPrix(l.avant) || '—'}</strong></td>
              <td class="sx-centre">${l.maint === undefined ? '<span class="sx-aide">supprimée</span>' : (_otPrix(l.maint) || '—')}</td></tr>`).join('')
            || `<tr><td colspan="5" class="sx-centre sx-aide">${S.ot.tarifsVue.diffPhoto ? 'Aucune différence avec aujourd\'hui.' : 'Rien trouvé.'}</td></tr>`}</tbody>
        </table></div>
      <span class="sx-aide">${nbDiff} lignes photographiées. Pour revenir à ce taux : tapez ${_otQte(ph.taux_horaire)} €/h en haut puis « Appliquer » —
        les prix calculés reviennent d'eux-mêmes ; les prix en dur modifiés depuis se remettent à la main (journal).</span>
    </div>`;
  },

  /* ─ Journal ─ */

  _otHtmlJournal() {
    const j = S.ot.tarifsVue && S.ot.tarifsVue.journal;
    if (!j) return '<div class="sx-chargement">Chargement du journal…</div>';
    if (!j.length) return '<div class="sx-vide">Aucun changement de tarif pour l\'instant.</div>';
    const champs = { mode: 'calcul', temps_min: 'temps', mo_base: 'base', mo: 'MO', prix_piece: 'prix pièce', mo_plafond: 'plafond',
                     valeur: 'valeur', description: 'désignation', intitule: 'intitulé' };
    const modes = { temps: 'au temps', base: 'montant de base', impose: 'prix en dur', heure: 'à l\'heure', minute: 'à la minute' };
    const types = { reference: 'Réf.', forfait: 'Forfait', parametre: 'Paramètre' };
    const nomsParams = { majoration_pieces: 'coefficient pièces', taux_horaire: 'taux horaire', taux_base: 'ancien taux', essai: 'mode essai' };
    const fmt = (c, v) => v === null || v === undefined || v === '' ? 'vide' : c === 'mode' ? (modes[v] || v)
      : typeof v === 'number' ? _otQte(Math.round(v * 100) / 100) : String(v);
    return j.slice(0, 100).map(e => {
      const av = e.avant || {}, ap = e.apres || {};
      const diffs = Object.keys(champs).filter(c => c in ap && JSON.stringify(av[c] ?? null) !== JSON.stringify(ap[c] ?? null))
        .filter(c => e.avant || (ap[c] !== null && ap[c] !== ''))
        .map(c => `${champs[c]} ${e.avant ? _otEsc(fmt(c, av[c])) + ' → ' : ''}<strong>${_otEsc(fmt(c, ap[c]))}</strong>`);
      if (ap.tarifs_recalcules !== undefined) diffs.push(`${ap.tarifs_recalcules} tarifs recalculés`);
      if (ap.photo) diffs.push(`<a href="#" onclick="App.otVoirPhoto(${Number(ap.photo)});return false;">photo de l'ancienne grille</a>`);
      const quand = new Date(e.le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="sx-ligne" style="align-items:flex-start;">
        <div class="sx-ligne-texte">
          <span class="sx-ligne-nom" style="white-space:normal;">${types[e.type] || e.type} <span class="sx-ref">${_otEsc(e.type === 'parametre' ? (nomsParams[e.cle] || e.cle) : e.cle)}</span>${e.avant ? '' : ' · création'} — ${diffs.join(' · ') || 'aucune différence'}</span>
          <span class="sx-aide">${_otEsc(quand)} · ${_otEsc(e.par || '?')}</span>
        </div></div>`;
    }).join('');
  },

  /* ─ Envoi ─ */

  // Montant lu dans une case : vide = null ; illisible ou négatif = erreur.
  _otLireMontant(id) {
    const v = (document.getElementById(id)?.value || '').trim();
    if (v === '') return { ok: true, val: null };
    const n = Number(v.replace(',', '.'));
    return isNaN(n) || n < 0 ? { ok: false } : { ok: true, val: n };
  },

  async _otEnvoyerTarif(type, cle, valeurs, libelle) {
    try {
      const d = await this._otPost({ action: 'ot_tarif', type, cle, valeurs });
      this.toast('✓ ' + libelle + ' enregistré');
      const t = S.ot.tarifs;
      if (type === 'reference') {
        const i = t.references.findIndex(r => r.ref === cle);
        const r = { ...(i >= 0 ? t.references[i] : {}), ...d.apres };
        if (i >= 0) t.references[i] = r; else t.references.push(r);
        S.ot.refs.set(cle, r);
        if (i < 0) S.ot.tarifsVue.recherche = cle;
        this._otRendreTarifs();
      } else if (type === 'forfait') {
        const f = t.forfaits.find(x => x.lettre === cle);
        Object.assign(f, { mo: d.apres.mo, mo_base: d.apres.mo_base, prix_piece: d.apres.prix_piece });
        S.ot.forfaits.set(cle, f);
        this._otRendreTarifs();
      } else {
        t.parametres[cle] = d.apres.valeur;
      }
      this._otChargerJournal();
      return true;
    } catch (e) {
      this.toast('Enregistrement impossible : ' + e.message, 4000);
      return false;
    }
  },

  async _otEnregistrerParam(cle) {
    const v = this._otLireMontant('ot-p-' + cle);
    if (!v.ok || !(v.val > 0)) { this.toast('Valeur invalide'); return; }
    const avant = S.ot.tarifs.parametres[cle];
    if (Number(avant) === v.val) { this.toast('Valeur inchangée'); return; }
    const ok = await this._otConfirmer({ titre: 'Changer le coefficient ?', ok: 'Enregistrer',
      texte: `${_otQte(avant)} → ${_otQte(v.val)}. S'applique aux fiches non validées.` });
    if (ok) await this._otEnvoyerTarif('parametre', cle, { valeur: v.val }, 'Coefficient');
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD + HISTORIQUE EXCEL (2026-11-16, sortie d'essai)
// Même calcul que la feuille « Feuil2 » de la matrice : par mois, montant HT, nombre d'OT,
// moyenne, et l'écart avec le même mois de l'année précédente. Source : « Historique OT » de
// la matrice (importé depuis le .xlsm) + fiches PWA validées pas encore reportées dans l'Excel.
// ═══════════════════════════════════════════════════════════════════════════

const OT_MOIS_COURTS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

Object.assign(App, {

  otOuvrirBord() {
    if (!this._otAdmin()) { this.toast('⛔ Réservé aux administrateurs'); return; }
    this.go('ot-bord');
  },

  async otBordInit() {
    S.ot.bord = S.ot.bord || { donnees: null, annee: new Date().getFullYear(), reporter: null, import: null };
    this._otRendreBord();
    try {
      const [b, r] = await Promise.all([this._otGet({ action: 'ot_bord' }), this._otGet({ action: 'ot_a_reporter' })]);
      S.ot.bord.donnees = b.bord || {};
      S.ot.bord.reporter = r.reporter || {};
      S.ot.essai = Number(S.ot.bord.donnees.essai) === 1;
    } catch (e) {
      this.toast('Tableau de bord indisponible : ' + e.message, 4000);
    }
    this._otRendreBord();
  },

  // { 'AAAA-M': {nb, total, nb_pwa} }
  _otBordIndex() {
    const idx = {};
    (S.ot.bord.donnees?.mois || []).forEach(m => { idx[m.annee + '-' + m.mois] = m; });
    return idx;
  },

  _otRendreBord() {
    const el = document.getElementById('ot-bord-root');
    if (!el) return;
    const B = S.ot.bord, d = B.donnees;
    const entete = this._otEntete({ retour: this._otRetourListe(),
      titre: 'Tableau de bord', sousTitre: 'OT réalisés par mois', large: true, bandeau: this._otNav('bord') });
    if (!d) {
      el.innerHTML = `<div class="sx-ecran ot-nav-ecran">${entete}<main class="sx-contenu sx-large"><div class="sx-chargement">Chargement…</div></main></div>`;
      return;
    }
    const idx = this._otBordIndex();
    const annees = [...new Set((d.mois || []).map(m => m.annee))].sort((a, b) => b - a);
    if (!annees.includes(B.annee) && annees.length) B.annee = annees[0];
    const a = B.annee;
    const val = (an, m) => idx[an + '-' + m] || { nb: 0, total: 0, nb_pwa: 0 };
    // Totaux de l'année (comme la colonne « Total » de l'Excel : année entière contre année N-1 entière)
    const cumul = an => { let nb = 0, total = 0; for (let m = 1; m <= 12; m++) { nb += val(an, m).nb; total += Number(val(an, m).total); } return { nb, total }; };
    const ecart = (x, y, euros) => {
      if (!x) return '<td class="sx-centre" style="color:var(--sx-gris);">–</td>';
      const e = x - y, c = e > 0 ? 'var(--sx-vert)' : e < 0 ? 'var(--sx-rouge)' : 'var(--sx-gris)';
      const t = euros ? _otPrix(Math.round(e)).replace(',00', '') : String(Math.round(e));
      return `<td class="sx-centre" style="color:${c};font-size:12px;">${e > 0 ? '+' : ''}${t}</td>`;
    };
    const ent = n => (Math.round(n) || 0).toLocaleString('fr-FR');
    let lMt = '', lMtE = '', lNb = '', lNbE = '', lMoy = '', lMoyE = '';
    const cellules = (n, p, pwa) => {
      const moy = n.nb ? n.total / n.nb : 0, moyP = p.nb ? p.total / p.nb : 0;
      lMt  += `<td class="sx-centre"${pwa ? ' style="background:var(--sx-bleu-clair);"' : ''}>${n.nb ? ent(n.total) : ''}</td>`;
      lMtE += ecart(Number(n.total), Number(p.total), true);
      lNb  += `<td class="sx-centre"><b>${n.nb || ''}</b></td>`;
      lNbE += ecart(n.nb, p.nb, false);
      lMoy += `<td class="sx-centre">${n.nb ? ent(moy) : ''}</td>`;
      lMoyE += n.nb && p.nb ? ecart(moy, moyP, true) : '<td class="sx-centre" style="color:var(--sx-gris);">–</td>';
    };
    for (let m = 1; m <= 12; m++) cellules(val(a, m), val(a - 1, m), val(a, m).nb_pwa > 0);
    cellules(cumul(a), cumul(a - 1), false);
    const tete = `<tr><th style="text-align:left;">${a}</th>${OT_MOIS_COURTS.map(m => `<th class="sx-centre">${m}</th>`).join('')}<th class="sx-centre">Total</th></tr>`;
    const ligne = (titre, cells, sous) => `<tr${sous ? ' style="background:#FAFBFD;"' : ''}><td style="white-space:nowrap;${sous ? 'font-size:12px;color:var(--sx-gris);' : 'font-weight:700;'}">${titre}</td>${cells}</tr>`;
    const table = `<div class="sx-carte sx-table-boite"><table class="sx-table sx-grille sx-serre" style="min-width:980px;">${tete}
      ${ligne('Montant HT (€)', lMt)}${ligne('écart N-1', lMtE, true)}
      ${ligne('Nombre d\'OT', lNb)}${ligne('écart N-1', lNbE, true)}
      ${ligne('Moyenne / OT (€)', lMoy)}${ligne('écart N-1', lMoyE, true)}</table></div>`;

    const choix = annees.slice(0, 11).map(y => `<button type="button" class="sx-btn ${y === a ? 'sx-btn-principal' : 'sx-btn-discret'}"
        style="min-width:64px;" onclick="S.ot.bord.annee=${y};App._otRendreBord()">${y}</button>`).join('');
    const imp = d.import;
    const reporter = B.reporter?.lignes || [];
    el.innerHTML = `<div class="sx-ecran ot-nav-ecran">${entete}
      <main class="sx-contenu sx-large">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${choix}</div>
        ${table}
        <span class="sx-aide">Écart = différence avec le même mois de ${a - 1}. Total : année ${a} entière contre ${a - 1} entière (comme l'Excel).
          ${(d.mois || []).some(m => m.nb_pwa > 0) ? 'Fond bleu : le mois compte des OT faits dans la PWA, pas encore reportés dans l\'Excel.' : ''}</span>

        <section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:8px;">
          <span class="sx-h2" style="font-size:16px;">Historique de la matrice Excel</span>
          <span class="sx-aide">${imp ? `Dernière mise à jour : ${_otEsc(new Date(imp.le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}
              par ${_otEsc(imp.par || '?')} — ${Number(imp.nb).toLocaleString('fr-FR')} OT (${_otEsc(imp.fichier || '')}).`
            : 'Jamais importé : choisissez votre matrice pour charger l\'historique.'}
            Prochain numéro d'OT : <b>${_otEsc(d.prochain || '?')}</b>${Number(d.essai) === 1 ? ' (encore en essai : la PWA donne des numéros ESSAI-…)' : ''}.</span>
          <span class="sx-aide">Après avoir enregistré des OT dans l'Excel, remettez l'historique à jour ici : la PWA repart après le dernier numéro.</span>
          <label class="sx-btn sx-btn-principal" id="ot-imp-btn" style="align-self:flex-start;cursor:pointer;">
            Mettre à jour depuis l'Excel…
            <input type="file" accept=".xlsm,.xlsx,.xls" style="display:none" onchange="App.otImporterHistorique(this.files[0]);this.value=''">
          </label>
        </section>

        <section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:8px;">
          <span class="sx-h2" style="font-size:16px;">À reporter dans l'Excel (${reporter.length})</span>
          ${reporter.length ? `<span class="sx-aide">OT validés dans la PWA qui ne sont pas encore dans l'Excel. Dans la matrice, un clic sur
              « Reporter les OT PWA » suffit : la macro les récupère, remplit « Historique OT » et l'onglet PLANNING
              (n° Evt, montant, liens pdf et dossier), enregistre les 3 fichiers dans le dossier du module, puis vide cette liste.</span>
            <div class="sx-carte sx-table-boite"><table class="sx-table sx-serre" style="min-width:520px;">
              <tr><th>N° OT</th><th>Module</th><th>Agence</th><th>Date</th><th style="text-align:right;">Total HT</th></tr>
              ${reporter.map(r => `<tr><td>${_otEsc(r.numero)}</td><td>${_otEsc(r.module)} · <span class="sx-ref">${_otEsc(r.code)}</span></td>
                <td>${_otEsc(r.agence)}</td><td>${_otEsc(String(r.date || '').split('-').reverse().join('/'))}</td>
                <td style="text-align:right;">${_otEuros(r.total)}</td></tr>`).join('')}
            </table></div>
            <button type="button" class="sx-btn sx-btn-discret" style="align-self:flex-start;" onclick="App.otCopierLignesExcel()"
              title="Secours, sans la macro : lignes à coller en A5 de « Historique OT »"
              ${B.reporter?.colonnes ? '' : 'disabled title="Importez d\'abord la matrice (colonnes OP)"'}>Copier les lignes (sans la macro)</button>`
            : '<span class="sx-aide">Rien à reporter : l\'Excel contient tous les OT validés dans la PWA.</span>'}
        </section>
      </main></div>`;
  },

  // Lit la feuille « Historique OT » du .xlsm (dans le navigateur) et envoie numéros, mois, totaux.
  async otImporterHistorique(fichier) {
    if (!fichier) return;
    const b = document.getElementById('ot-imp-btn');
    const etat = t => { if (b) b.firstChild.textContent = t + ' '; };
    etat('Lecture du fichier…');
    try {
      const buf = await fichier.arrayBuffer();
      await new Promise(r => setTimeout(r, 30));           // laisse l'écran afficher « Lecture… »
      const wb = XLSX.read(buf, { type: 'array', sheets: ['Historique OT'] });
      const ws = wb.Sheets['Historique OT'];
      if (!ws) throw new Error('Feuille « Historique OT » introuvable dans ce fichier');
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
      const colonnes = (rows[3] || []).map(v => (v === null || v === undefined || v === '') ? null : String(v).trim());
      if (!/agence/i.test(colonnes[1] || '') || !/planning/i.test(colonnes[7] || '')) {
        throw new Error('La ligne 4 de « Historique OT » ne ressemble pas aux en-têtes attendus (N°, Agence, M/B, Date…)');
      }
      let dernier = 0;
      colonnes.forEach((v, i) => { if (v) dernier = i; });
      const iTotal = dernier + 2;                          // comme la macro : 1 colonne vide après les codes OP
      const jour = v => {
        if (typeof v === 'number' && v > 0) { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : null; }
        return null;
      };
      const lignes = [];
      for (let i = 4; i < rows.length; i++) {
        const r = rows[i] || [];
        if (r[6] === null && r[0] === null && r[7] === null) continue;
        lignes.push({
          module: r[0] === null ? '' : String(r[0]), agence: r[1] === null ? '' : String(r[1]),
          type: r[2] === null ? '' : String(r[2]), date: jour(r[3]),
          mois: r[4] === null ? '' : String(r[4]), annee: r[5] === null ? '' : String(r[5]),
          numero: r[6] === null ? '' : String(r[6]), code: r[7] === null ? '' : String(r[7]),
          total: typeof r[iTotal] === 'number' ? String(r[iTotal]) : '',
        });
      }
      etat(`Envoi de ${lignes.length} OT…`);
      const d = await this._otPost({ action: 'ot_historique_import', lignes, colonnes, fichier: fichier.name }, 90000);
      this.toast(`✓ ${d.nb} OT importés — prochain numéro ${d.prochain}`, 5000);
      this.otBordInit();
    } catch (e) {
      this.toast('Import impossible : ' + e.message, 6000);
      etat('Mettre à jour depuis l\'Excel…');
    }
  },

  // Lignes au format « Historique OT » (colonnes A à H, quantités par code OP, total), séparées par des tabulations.
  async otCopierLignesExcel() {
    const R = S.ot.bord.reporter;
    const col = R?.colonnes || [];
    if (!col.length) return;
    let dernier = 0;
    col.forEach((v, i) => { if (v) dernier = i; });
    const largeur = dernier + 3;
    const nombre = v => String(v).replace('.', ',');
    const inconnus = new Set();
    const texte = (R.lignes || []).map(r => {
      const c = new Array(largeur).fill('');
      const [y, m, j] = String(r.date || '').split('-');
      c[0] = r.module || ''; c[1] = r.agence || ''; c[2] = r.type || '';
      c[3] = j ? `${j}/${m}/${y}` : ''; c[4] = m ? String(Number(m)) : ''; c[5] = y || '';
      c[6] = r.numero || ''; c[7] = r.code || '';
      Object.entries(r.op || {}).forEach(([op, q]) => {
        const k = col.indexOf(op);
        if (k > 7) c[k] = nombre(q); else inconnus.add(op);
      });
      c[dernier + 2] = nombre(r.total ?? '');
      return c.join('\t');
    }).join('\r\n');
    try {
      await navigator.clipboard.writeText(texte);
      this.toast(`✓ ${R.lignes.length} ligne(s) copiée(s) — collez en A5 de « Historique OT »`
        + (inconnus.size ? ` (codes absents de l'Excel : ${[...inconnus].join(', ')})` : ''), 6000);
    } catch (e) {
      this.toast('Copie impossible : ' + e.message, 5000);
    }
  },

  // Fiche validée : télécharge les 3 documents (à ranger dans les dossiers OneDrive).
  async otTelechargerDocuments() {
    const f = S.ot.fiche;
    if (!f) return;
    const b = document.getElementById('ot-doc-telecharger');
    if (b) { b.disabled = true; b.textContent = 'Téléchargement…'; }
    try {
      const d = await this._otPost({ action: 'ot_fichiers', id: f.id }, 90000);
      for (const x of d.fichiers || []) {
        const octets = Uint8Array.from(atob(x.b64 || ''), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([octets], { type: x.mime || 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url; a.download = x.nom;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        await new Promise(r => setTimeout(r, 400));        // un fichier après l'autre
      }
      this.toast(`✓ ${(d.fichiers || []).length} fichiers téléchargés`);
    } catch (e) {
      this.toast('Téléchargement impossible : ' + e.message, 5000);
    }
    if (b) { b.disabled = false; b.textContent = 'Télécharger les 3 fichiers'; }
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   Modules SANS OT (2026-11-18, demande de Hugo) : trop abîmés, vendus en l'état… — table ot_sans_ot
   (action ot_sans_ot de masterfile, liste renvoyée par ot_liste). Destinations de vente reconnues d'office
   (agence du Planning, colonne D) : RBSA, BCBJ, DRCB = pas d'OT ; Saint-Paterne (0102) = proposé seulement
   (des modules y sont partis avec un OT). Marquer / annuler : admins et accès « Reconditionnement ».
   ═══════════════════════════════════════════════════════════════════════════ */

const OT_VENTE_AUTO = ['RBSA', 'BCBJ', 'DRCB'];
const OT_VENTE_PROPOSEE = ['102'];
const OT_MOTIFS = { vente: 'vente en l\u2019état', epave: 'épave / pièces', autre: 'autre' };

Object.assign(App, {

  _otCleAgence(v) { return String(v === null || v === undefined ? '' : v).trim().replace(/^0+/, '').toUpperCase(); },
  // 'auto' (vente reconnue), 'proposee' (vente probable) ou ''
  _otVente(m) {
    if (!m) return '';
    const ag = this._otCleAgence(m.ag);
    const lib = String(m.chantier || '').toUpperCase();
    if (OT_VENTE_AUTO.includes(ag) || OT_VENTE_AUTO.some(c => lib.startsWith(c + ' ') || lib === c)) return 'auto';
    if (OT_VENTE_PROPOSEE.includes(ag) || lib.includes('SAINT PATERNE')) return 'proposee';
    return '';
  },
  // OT faits dans la matrice Excel avant les fiches PWA : { CODE: n° d'OT } (ot_historique, via ot_liste)
  _otExcelMaj(obj) { if (obj && typeof obj === 'object') S.ot.otExcel = obj; },
  _otExcelDe(code) { return (S.ot.otExcel && S.ot.otExcel[String(code || '').toUpperCase()]) || ''; },

  _otSansOtMaj(liste) {
    if (!Array.isArray(liste)) return;
    S.ot.sansOt = new Map(liste.map(s => [String(s.code_planning || '').toUpperCase(), s]));
  },
  // Marquage enregistré, ou vente reconnue d'office : { motif, auto?, detail?, par?, le? } ; sinon null
  _otSansOtDe(code, m) {
    const s = S.ot.sansOt && S.ot.sansOt.get(String(code || '').toUpperCase());
    if (s) return s;
    if (this._otVente(m) === 'auto') return { motif: 'vente', auto: true, detail: this._otCleAgence(m.ag) || String(m.chantier || '') };
    return null;
  },
  _otTexteSansOt(s) {
    return 'Pas d\u2019OT · ' + (OT_MOTIFS[s.motif] || s.motif) + (s.detail ? ' (' + s.detail + ')' : '');
  },

  _otApresSansOt() {
    if (S.view === 'ot-liste') this._otRendreListe();
    if (S.view === 'prod-bureau' && this._pbRendre) this._pbRendre();
  },

  // Fenêtre « Pas d'OT » : motif + précision → { motif, detail } ou null (un module ou une sélection)
  _otDialogueSansOt(titre, sous, detail, bouton) {
    return new Promise(resolve => {
      const voile = document.createElement('div');
      voile.className = 'sx-voile';
      voile.innerHTML = `<div class="sx-fenetre" role="dialog" aria-modal="true" aria-labelledby="ot-so-titre">
        <h3 id="ot-so-titre">${_otEsc(titre)}</h3>
        <p class="sx-aide">${_otEsc(sous)}</p>
        <fieldset class="sx-so-motifs"><legend class="sx-sr">Motif</legend>
          ${Object.entries(OT_MOTIFS).map(([k, t], i) => `<label class="sx-so-motif"><input type="radio" name="ot-so-motif" value="${k}" ${i === 0 ? 'checked' : ''}> ${_otEsc(t.charAt(0).toUpperCase() + t.slice(1))}</label>`).join('')}
        </fieldset>
        <label class="sx-aide" for="ot-so-detail">Précision (facultatif)</label>
        <input id="ot-so-detail" class="sx-champ" type="text" placeholder="ex. vendu à RBSA, toiture percée…" value="${_otEsc(detail || '')}">
        <p class="sx-aide">Le module sort de « À compléter » et de « OT à faire ». Annulable (« Remettre à faire »).</p>
        <div class="sx-fenetre-boutons">
          <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
          <button type="button" class="sx-btn sx-btn-principal" data-r="1">${_otEsc(bouton || 'Pas d’OT')}</button>
        </div></div>`;
      const fin = r => { voile.remove(); resolve(r); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(null);
        const b = e.target.closest('[data-r]');
        if (!b) return;
        if (b.dataset.r !== '1') return fin(null);
        fin({ motif: (voile.querySelector('input[name="ot-so-motif"]:checked') || {}).value || 'vente',
              detail: voile.querySelector('#ot-so-detail').value.trim() });
      });
      document.body.appendChild(voile);
      voile.querySelector('[data-r="1"]').focus();
    });
  },

  async otPasDOt(code) {
    if (!this._otAutorise()) return;
    const m = [...(S.ot.modules || []), ...(S.deps || []), ...(S.archive || [])].find(x => String(x.code || '').toUpperCase() === String(code).toUpperCase()) || {};
    const choix = await this._otDialogueSansOt('Pas d’OT pour ' + code + ' ?', [m.module, m.codeModule, m.chantier].filter(Boolean).join(' · '),
      this._otVente(m) === 'proposee' ? 'Saint-Paterne' : '');
    if (!choix) return;
    try {
      const d = await this._otPost({ action: 'ot_sans_ot', code, motif: choix.motif, detail: choix.detail });
      S.ot.sansOt = S.ot.sansOt || new Map();
      if (d.sans_ot) S.ot.sansOt.set(String(code).toUpperCase(), d.sans_ot);
      this.toast('✓ ' + code + ' : pas d\u2019OT');
      this._otApresSansOt();
    } catch (e) { this.toast('Impossible : ' + e.message, 5000); }
  },

  async otRemettreAFaire(code) {
    if (!this._otAutorise()) return;
    const ok = await this._otConfirmer({ titre: 'Remettre ' + code + ' à faire ?', texte: 'Le module revient dans « À compléter » et « OT à faire ».', ok: 'Remettre à faire' });
    if (!ok) return;
    try {
      await this._otPost({ action: 'ot_sans_ot', code, motif: '' });
      if (S.ot.sansOt) S.ot.sansOt.delete(String(code).toUpperCase());
      this.toast('✓ ' + code + ' remis à faire');
      this._otApresSansOt();
    } catch (e) { this.toast('Impossible : ' + e.message, 5000); }
  },
});
