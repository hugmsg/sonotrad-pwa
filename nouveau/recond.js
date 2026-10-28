// ═══════════════════════════════════════════════════════════════════════════
// RECONDITIONNEMENT — fiches d'opérations (OT), essai (2026-10-28)
// Premier écran du socle commun (socle.css). Serveur : actions ot_* de masterfile
// (ot_supabase.js) → fonctions Supabase ot_*. Les montants sont calculés en base et
// ne sont renvoyés qu'aux administrateurs. Pendant l'essai : numéros ESSAI-…,
// aucune sortie de stock (la 🔧 du Stock reste la vraie sortie).
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
};

const OT_STATUTS = {
  brouillon: 'Brouillon', a_valider: 'À valider', validee: 'Validée', envoyee: 'Envoyée', annulee: 'Annulée',
};
const OT_LOGO_LOXAM = 'Logo%20Loxam.png';

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
function _otQte(q) {
  return q === null || q === undefined || q === '' ? '' : String(q).replace('.', ',');
}
const _OT_SVG_RETOUR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
const _OT_SVG_LOUPE  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6B7A" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>';

Object.assign(App, {

  /* ─ Entrée depuis l'accueil ─ */
  otOuvrirActivite() {
    if (!this._otAutorise()) { this.toast('⛔ Vous n\'avez pas accès au reconditionnement'); return; }
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
  async _otPost(payload) {
    const d = await _post(S.apiUrl, payload);
    if (d.status !== 'ok') { const e = new Error(d.error || 'Erreur serveur'); e.conflit = !!d.conflit; throw e; }
    return d;
  },

  _otEntete({ retour, titre, sousTitre = '', etat = '', logo = true, large = false }) {
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
    </div></header>`;
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
    } catch (e) {
      this.toast('Fiches indisponibles : ' + e.message, 4000);
    } finally {
      S.ot.listeChargement = false;
      this._otRendreListe();
    }
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
    const item = f => `<button type="button" class="sx-item" onclick="App.otOuvrirFiche(${Number(f.id)})">
        <div class="sx-item-texte">
          <span class="sx-item-titre">${_otEsc([f.type_module, f.numero_module].filter(Boolean).join(' ') || f.code_planning)}
            · <span class="sx-ref">${_otEsc(f.code_planning)}</span></span>
          <span class="sx-item-detail">${_otEsc([f.numero_ot, f.agence, f.saisi_par, _otDate(f.modifie_le)].filter(Boolean).join(' · '))}</span>
        </div>
        ${admin && f.total_ht !== undefined ? `<span class="sx-montant">${_otEuros(f.total_ht)}</span>` : ''}
        <span class="sx-pastille sx-p-${_otEsc(f.statut)}">${_otEsc(OT_STATUTS[f.statut] || f.statut)}</span>
      </button>`;

    let corps;
    if (S.ot.listeChargement && !S.ot.listeChargee) corps = '<div class="sx-chargement">Chargement des fiches…</div>';
    else if (!S.ot.liste.length) corps = '<div class="sx-carte"><div class="sx-vide">Aucune fiche pour l\'instant.<br>Commencez par « Nouvelle fiche ».</div></div>';
    else corps = groupes.map(g => {
      const fiches = S.ot.liste.filter(f => g.statuts.includes(f.statut)).slice(0, g.max || 1e9);
      if (!fiches.length) return '';
      return `<section class="sx-section">
        <div class="sx-section-tete"><h2 class="sx-h2">${g.titre}</h2><span class="sx-aide">${fiches.length}</span></div>
        <div class="sx-carte">${fiches.map(item).join('')}</div></section>`;
    }).join('');

    el.innerHTML = `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Accueil', action: 'App.goHome()' }, titre: 'Fiches d\'opérations', sousTitre: 'Reconditionnement · essai' })}
      <main class="sx-contenu">
        <div class="sx-bandeau sx-bandeau-info">Essai : la fiche ne sort rien du stock (la 🔧 reste la vraie sortie) et la matrice Excel garde les vrais numéros d'OT.</div>
        <button type="button" class="sx-btn sx-btn-principal sx-btn-plein" onclick="App.otNouvelle()">+ Nouvelle fiche</button>
        ${corps}
        <div class="sx-ligne-champs">
          <button type="button" class="sx-btn sx-btn-discret" style="flex:1 1 140px;" onclick="App.otChargerListe(true)">Actualiser</button>
          ${admin ? '<button type="button" class="sx-btn sx-btn-second" style="flex:1 1 140px;" onclick="App.otOuvrirTarifs()">Tarifs</button>' : ''}
        </div>
      </main></div>`;
  },

  /* ─ Choix du module ─ */

  async otNouvelle() {
    S.ot.choix = true;
    S.ot.rechercheModule = '';
    this._otRendreListe();
    if (S.ot.modules || S.ot.modulesChargement) return;
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
    } catch (e) {
      this.toast('Modules indisponibles : ' + e.message, 4000);
    } finally {
      S.ot.modulesChargement = false;
      if (S.ot.choix) this._otRendreModules();
    }
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
    if (s.deCote)       return { texte: 'De côté',     classe: 'envoyee' };
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
    S.ot.notes = fiche.notes || '';
    S.ot.rev = 0; S.ot.revEnvoyee = 0; S.ot.etat = 'Enregistré';
    S.ot.recherche = { pieces: '', sanitaire: '', bureau: '' };
    if (S.view === 'ot-fiche') this._otRendreFiche(); else this.go('ot-fiche');
  },

  _otModifiable() {
    const f = S.ot.fiche;
    return !!f && (f.statut === 'brouillon' || (f.statut === 'a_valider' && this._otAdmin()));
  },

  // Sanitaire = pièces refacturées en « main-d'œuvre pièces » (réf. SON- avec un prix pièce).
  _otEstSanitaire(r) { return /^SON-/.test(r.ref) && Number(r.prix_piece) > 0; },

  _otRendreFiche() {
    const el = document.getElementById('ot-fiche-root');
    const f = S.ot.fiche;
    if (!el || !f) return;
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

    el.innerHTML = `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Fiches', action: 'App.otQuitterFiche()' }, titre: 'Fiche d\'opérations',
          sousTitre: [titreModule, f.agence, f.code_planning].filter(Boolean).join(' · '), etat: S.ot.etat })}
      <div class="sx-onglets" role="tablist" aria-label="Blocs de la fiche">
        ${onglets.map(o => `<button type="button" class="sx-onglet" role="tab" aria-selected="${S.ot.onglet === o.cle}"
            onclick="App.otOnglet('${o.cle}')">${o.nom} · <span id="ot-n-${o.cle}">${o.n}</span></button>`).join('')}
      </div>
      <main class="sx-contenu">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="sx-pastille sx-p-${_otEsc(f.statut)}">${_otEsc(OT_STATUTS[f.statut] || f.statut)}</span>
          <span class="sx-aide">${_otEsc(f.numero_ot || 'n° d\'OT donné à la validation')}</span>
        </div>
        ${f.commentaire ? `<div class="sx-carte sx-carte-pad sx-aide" style="font-size:14px;">${_otEsc(f.commentaire)}</div>` : ''}
        ${modif ? '' : `<div class="sx-bandeau sx-bandeau-info">${f.statut === 'a_valider'
            ? 'Fiche envoyée à valider : elle n\'est plus modifiable. « Reprendre en brouillon » pour la corriger.'
            : 'Fiche ' + _otEsc((OT_STATUTS[f.statut] || '').toLowerCase()) + ' : consultation seulement.'}</div>`}

        <section class="sx-section sx-bloc" ${S.ot.onglet === 'pieces' ? '' : 'hidden'} aria-labelledby="ot-t-pieces">
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-pieces">1. Opérations et pièces posées</h2>
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
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-san">2. Sanitaire</h2></div>
          <div class="sx-carte" id="ot-lignes-sanitaire">${this._otHtmlLignes(['sanitaire'], modif)}</div>
          ${modif ? `<div class="sx-recherche">${_OT_SVG_LOUPE}
              <label for="ot-rech-sanitaire" class="sx-sr">Ajouter une pièce sanitaire</label>
              <input id="ot-rech-sanitaire" type="search" placeholder="+ Chauffe-eau, robinet, PVC…" autocomplete="off"
                value="${_otEsc(S.ot.recherche.sanitaire)}" oninput="App._otRechercher('sanitaire', this.value)">
            </div>
            <div id="ot-sugg-sanitaire"></div>` : ''}
        </section>

        <section class="sx-section sx-bloc" ${S.ot.onglet === 'travaux' ? '' : 'hidden'} aria-labelledby="ot-t-trav">
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-trav">3. Travaux en plus</h2></div>
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
      </main>
      <footer class="sx-pied"><div class="sx-pied-in" id="ot-pied">${this._otHtmlPied()}</div></footer>
    </div>`;
  },

  _otHtmlLignes(blocs, modif) {
    const lignes = S.ot.lignes.map((l, i) => ({ l, i })).filter(x => blocs.includes(x.l.bloc));
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
      return `<div class="sx-ligne${vide ? ' sx-a-confirmer' : ''}">
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
    if (redessiner) { if (this._otVueControle()) this._otRendreTableControle(); else this._otRafraichirBlocs(); }
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
    if (ligne) ligne.classList.toggle('sx-a-confirmer', !(Number(l.quantite) > 0));
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
      lignes: S.ot.lignes.map(l => ({ bloc: l.bloc, ref: l.ref, libelle: l.libelle, quantite: l.quantite, unite: l.unite,
        occasion: l.occasion, origine: l.origine, mo_saisi: l.mo_saisi, prix_piece_saisi: l.prix_piece_saisi })) });
    S.ot.enCours = envoi.then(() => {}, () => {});
    try {
      const d = await envoi;
      S.ot.fiche = { ...d.fiche, lignes: undefined };
      S.ot.revEnvoyee = rev;
      if (S.ot.rev === rev) {
        this._otAfficherEtat('Enregistré');
        S.ot.calc = d.fiche.lignes || [];
        if (this._otVueControle() && S.view === 'ot-fiche') this._otMajMontants();
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
      validee:   ['Valider la fiche ?', `Total ${_otEuros(S.ot.fiche.totaux?.total)} HT. Un numéro ESSAI-… est attribué et les prix sont figés.`, 'Valider'],
    };
    const t = textes[statut];
    if (t && !(await this._otConfirmer({ titre: t[0], texte: t[1], ok: t[2] }))) return;
    try {
      const d = await this._otPost({ action: 'ot_statut', id: f.id, statut });
      this.toast('✓ ' + (OT_STATUTS[d.fiche.statut] || d.fiche.statut) + (d.fiche.numero_ot ? ' · ' + d.fiche.numero_ot : ''));
      S.ot.listeChargee = false;
      this._otAfficherFiche(d.fiche);
    } catch (e) {
      this.toast('Changement impossible : ' + e.message, 4000);
    }
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

    el.innerHTML = `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Fiches', action: 'App.otQuitterFiche()' },
          titre: [f.numero_ot || 'Contrôle', titreModule].filter(Boolean).join(' · '),
          sousTitre: [f.agence, 'code ' + f.code_planning, f.saisi_par ? 'saisi par ' + f.saisi_par : ''].filter(Boolean).join(' · '),
          etat: S.ot.etat, large: true })}
      <main class="sx-contenu sx-large">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="sx-pastille sx-p-${_otEsc(f.statut)}">${_otEsc(OT_STATUTS[f.statut] || f.statut)}</span>
          ${f.commentaire ? `<span class="sx-aide">${_otEsc(f.commentaire)}</span>` : ''}
        </div>
        <div class="sx-colonnes">
          <section class="sx-principal sx-carte" aria-labelledby="ot-t-ctrl">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;flex-wrap:wrap;">
              <h2 class="sx-h2" id="ot-t-ctrl">Opérations</h2>
              <div style="display:flex;gap:16px;flex-wrap:wrap;">
                <label class="sx-case-a-cocher"><input type="checkbox" ${S.ot.familles ? 'checked' : ''}
                  onchange="App.otBasculerFamilles(this.checked)">Regrouper par famille</label>
                <label class="sx-case-a-cocher"><input type="checkbox" ${S.ot.masquer ? 'checked' : ''}
                  onchange="S.ot.masquer=this.checked;App._otRendreTableControle()">Masquer les lignes sans quantité</label>
              </div>
            </div>
            <div class="sx-table-boite" id="ot-table-ctrl"></div>
            ${modif ? `<div style="padding:12px 14px;border-top:1px solid var(--sx-separateur);display:flex;flex-direction:column;gap:8px;">
              <div class="sx-recherche">${_OT_SVG_LOUPE}
                <label for="ot-rech-bureau" class="sx-sr">Ajouter une ligne</label>
                <input id="ot-rech-bureau" type="search" placeholder="+ Ajouter une ligne (réf. ou désignation)" autocomplete="off"
                  value="${_otEsc(S.ot.recherche.bureau)}" oninput="App._otRechercher('bureau', this.value)">
              </div>
              <div id="ot-sugg-bureau"></div>
              <span class="sx-aide">Quantités et montants modifiables. Un montant tapé remplace le tarif (case orange) ; ↺ ou case vidée = retour au tarif.
                Une ligne sans quantité n'apparaît pas dans les documents.</span>
            </div>` : ''}
          </section>
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
            ${f.statut === 'a_valider' ? `<section class="sx-bandeau sx-bandeau-info" style="display:flex;flex-direction:column;gap:4px;">
              <strong>En validant (essai), la PWA va :</strong>
              <span>1. attribuer un numéro ESSAI-… (la matrice garde les vrais) ;</span>
              <span>2. figer les prix de chaque ligne.</span>
              <span>Excel LOXAM / SONOTRAD, PDF et mail : prochaine étape. Aucune sortie de stock pendant l'essai.</span>
            </section>` : ''}
            <div style="display:flex;gap:10px;flex-wrap:wrap;">${actions}</div>
          </aside>
        </div>
      </main></div>`;
    this._otRendreTableControle();
  },

  // Groupes du tableau de contrôle. Regroupé : opérations d'office et forfaits, une famille de pièces
  // (catégorie de la réf.) par groupe, travaux, sanitaire. Sinon : un seul groupe, dans l'ordre de saisie.
  _otGroupesControle() {
    const rang = { diverses: 0, pieces: 0, travaux: 1, sanitaire: 2 };
    const lignes = S.ot.lignes.map((l, i) => ({ l, i }))
      .filter(x => !S.ot.masquer || Number(x.l.quantite) > 0)
      .sort((a, b) => rang[a.l.bloc] - rang[b.l.bloc] || a.i - b.i);
    if (!S.ot.familles) return [{ cle: 'tout', titre: '', items: lignes }];
    const groupes = new Map();
    const ajouter = (cle, titre, ordre, x) => {
      if (!groupes.has(cle)) groupes.set(cle, { cle, titre, ordre, items: [] });
      groupes.get(cle).items.push(x);
    };
    lignes.forEach(x => {
      const l = x.l;
      const r = S.ot.refs.get(l.ref);
      if (l.bloc === 'sanitaire') return ajouter('sanitaire', 'Sanitaire', 9, x);
      if (l.bloc === 'travaux')   return ajouter('travaux', 'Travaux en plus', 8, x);
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
    const nomsBlocs = { pieces: '', diverses: '', sanitaire: 'SANITAIRE', travaux: 'TRAVAUX' };
    const ligneHtml = ({ l, i }) => {
      const vide = !(Number(l.quantite) > 0);
      const r = S.ot.refs.get(l.ref);
      const forfait = S.ot.forfaits.has(l.ref);
      const sanitaire = l.bloc === 'sanitaire';
      const interne = /^SON-/.test(l.ref || '') || !l.ref;
      const sansTarif = l.ref && !forfait && !r;
      const manuel = l.mo_saisi !== null;
      const etiquettes = [
        !S.ot.familles && nomsBlocs[l.bloc] ? `<span class="sx-etiquette sx-e-bloc">${nomsBlocs[l.bloc]}</span>` : '',
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
        <td>${_otEsc(l.libelle || (r && r.description) || '')}${etiquettes}</td>
        <td class="sx-centre"><input id="ot-q-${i}" class="sx-case" type="text" inputmode="decimal" placeholder="—" ${dis}
          aria-label="Quantité" value="${_otQte(l.quantite)}" oninput="App._otSaisirQteCtrl(${i}, this.value)"></td>
        <td class="sx-aide">${_otEsc(l.unite === 'u' ? 'u.' : l.unite)}</td>
        <td class="sx-num sx-aide" id="ot-pu-${i}"></td>
        <td class="sx-num">${montant}</td>
        <td>${vide ? '<span class="sx-aide">—</span>' : interne ? '<span class="sx-non">Non (code SON)</span>' : '<span class="sx-oui">Oui</span>'}</td>
        <td>${modif ? `<button type="button" class="sx-retirer" aria-label="Supprimer la ligne" onclick="App._otRetirer(${i})">✕</button>` : ''}</td>
      </tr>`;
    };
    const groupes = this._otGroupesControle();
    S.ot.groupesAffiches = groupes.map(g => ({ cle: g.cle, indices: g.items.map(x => x.i) }));
    const corps = groupes.map(g => (g.titre
      ? `<tr class="sx-groupe"><td colspan="5">${_otEsc(g.titre)} <span class="sx-aide">· ${g.items.length}</span></td>
           <td class="sx-num" id="ot-st-${_otEsc(g.cle)}"></td><td colspan="2"></td></tr>` : '')
      + g.items.map(ligneHtml).join('')).join('');
    z.innerHTML = `<table class="sx-table">
      <thead><tr><th scope="col">Réf.</th><th scope="col">Description</th><th scope="col" class="sx-centre">Qté</th>
        <th scope="col">Unité</th><th scope="col" class="sx-num">PU €</th><th scope="col" class="sx-num">Montant €</th>
        <th scope="col">Vu par LOXAM</th><th scope="col"><span class="sx-sr">Supprimer</span></th></tr></thead>
      <tbody>${corps || '<tr><td colspan="8" class="sx-centre sx-aide">Aucune ligne.</td></tr>'}
        <tr class="sx-calculee" id="ot-ligne-mop"><td><span class="sx-ref">SON-0100</span></td><td>Main d'œuvre pièces (sanitaire, calculée)</td>
          <td></td><td></td><td></td><td class="sx-num" id="ot-mop"></td><td><span class="sx-non">Non (code SON)</span></td><td></td></tr>
      </tbody></table>`;
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
      const champ = g.cle === 'sanitaire' ? 'piece_ligne' : 'mo_ligne';
      const s = g.indices.reduce((t, i) => t + (Number(calc[i]?.[champ]) || 0), 0);
      el.textContent = (g.cle === 'sanitaire' ? 'pièces ' : '') + _otEuros(s);
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

  /* ═════════════════════════════ TARIFS (administrateur) ═════════════════════════════ */

  async otOuvrirTarifs() {
    if (!this._otAdmin()) { this.toast('⛔ Réservé aux administrateurs'); return; }
    this.go('ot-tarifs');
  },

  async otTarifsInit() {
    S.ot.tarifsVue = S.ot.tarifsVue || { recherche: '', journal: null, modifs: {} };
    this._otRendreTarifs();
    try {
      S.ot.tarifs = null;                       // toujours les tarifs à jour en entrant
      await this._otChargerTarifs();
    } catch (e) {
      this.toast('Tarifs indisponibles : ' + e.message, 4000);
    }
    this._otRendreTarifs();
    this._otChargerJournal();
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
    const p = (t && t.parametres) || {};
    const champParam = (cle, libelle, unite, aide) => `
      <div style="display:flex;flex-direction:column;gap:4px;flex:1 1 200px;">
        <label for="ot-p-${cle}" style="font-size:13px;font-weight:700;">${libelle}</label>
        <div style="display:flex;gap:6px;align-items:center;">
          <input id="ot-p-${cle}" class="sx-champ" style="flex:1;" type="text" inputmode="decimal" value="${_otQte(p[cle])}">
          <span class="sx-aide" style="min-width:34px;">${unite}</span>
          <button type="button" class="sx-btn sx-btn-second" style="height:46px;" onclick="App._otEnregistrerParam('${cle}')">Enregistrer</button>
        </div>
        <span class="sx-aide">${aide}</span>
      </div>`;
    el.innerHTML = `<div class="sx-ecran">
      ${this._otEntete({ retour: { texte: 'Fiches', action: "App.go('ot-liste')" }, titre: 'Tarifs',
          sousTitre: 'Main-d\'œuvre facturée à LOXAM · chaque changement est noté au journal', large: true })}
      <main class="sx-contenu sx-large">
        ${!t ? '<div class="sx-chargement">Chargement des tarifs…</div>' : `
        <div class="sx-bandeau sx-bandeau-info">Un changement de tarif s'applique aux fiches non validées. Les fiches validées gardent les prix figés à leur validation.</div>

        <section class="sx-section" aria-labelledby="ot-t-param">
          <h2 class="sx-h2" id="ot-t-param">Paramètres</h2>
          <div class="sx-carte sx-carte-pad sx-ligne-champs" style="gap:16px;">
            ${champParam('majoration_pieces', 'Coefficient « main-d\'œuvre pièces »', '×', 'Appliqué au total des pièces sanitaire (+ 0,50 €), arrondi au 0,50.')}
            ${champParam('taux_horaire', 'Taux horaire négocié', '€/h', 'Repère seulement : la MO au temps vient des réf. SON-0102 (h) et SON-0101 (min) ; changer ce taux ne recalcule aucune réf.')}
            ${champParam('taux_base', 'Ancien taux (repère)', '€/h', 'Historique, pour ajuster les prix devenus trop chers.')}
          </div>
          <span class="sx-aide">Mode essai : ${Number(p.essai) === 1 ? 'oui (numéros ESSAI-…, pas de sortie de stock)' : 'non'}.</span>
        </section>

        <section class="sx-section" aria-labelledby="ot-t-refs">
          <div class="sx-section-tete"><h2 class="sx-h2" id="ot-t-refs">Références</h2>
            <span class="sx-aide">${(t.references || []).length} réf.</span></div>
          <div class="sx-recherche">${_OT_SVG_LOUPE}
            <label for="ot-rech-tarif" class="sx-sr">Chercher une référence</label>
            <input id="ot-rech-tarif" type="search" placeholder="Réf., désignation ou famille… (ou la réf. à créer)" autocomplete="off"
              value="${_otEsc(S.ot.tarifsVue.recherche)}" oninput="S.ot.tarifsVue.recherche=this.value;App._otRendreRefsTarifs()">
          </div>
          <div class="sx-carte"><div class="sx-table-boite" id="ot-refs-tarifs"></div></div>
          <span class="sx-aide">MO = montant facturé par unité. Prix pièce = prix d'achat d'une pièce sanitaire (refacturée en « main-d'œuvre pièces »).
            Plafond = montant maximum par ligne (ex. laine de verre 200 €). Case vide = aucun.</span>
        </section>

        <section class="sx-section" aria-labelledby="ot-t-forf">
          <h2 class="sx-h2" id="ot-t-forf">Forfaits</h2>
          <div class="sx-carte"><div class="sx-table-boite">${this._otHtmlForfaitsTarifs()}</div></div>
        </section>

        <section class="sx-section" aria-labelledby="ot-t-journal">
          <h2 class="sx-h2" id="ot-t-journal">Journal des changements</h2>
          <div class="sx-carte" id="ot-journal">${this._otHtmlJournal()}</div>
        </section>`}
      </main></div>`;
    if (t) this._otRendreRefsTarifs();
  },

  // Une cellule modifiable : valeur d'origine gardée dans data-orig, bouton Enregistrer actif dès qu'une case change.
  _otCaseTarif(id, valeur, largeur = 84) {
    return `<input id="${id}" class="sx-case sx-case-mo" style="width:${largeur}px;" type="text" inputmode="decimal"
      value="${_otQte(valeur)}" data-orig="${_otQte(valeur)}" oninput="App._otTarifModifie(this)">`;
  },

  _otTarifModifie(champ) {
    const tr = champ.closest('tr');
    if (!tr) return;
    const change = [...tr.querySelectorAll('input[data-orig]')].some(c => c.value.trim() !== c.dataset.orig);
    const b = tr.querySelector('.ot-enreg');
    if (b) b.disabled = !change;
    champ.classList.toggle('sx-manuel', champ.value.trim() !== champ.dataset.orig);
  },

  _otRendreRefsTarifs() {
    const z = document.getElementById('ot-refs-tarifs');
    if (!z || !S.ot.tarifs) return;
    const q = S.ot.tarifsVue.recherche.trim().toLowerCase();
    const toutes = S.ot.tarifs.references || [];
    const res = !q ? [] : toutes
      .filter(r => r.ref.toLowerCase().startsWith(q) || (r.description || '').toLowerCase().includes(q) || (r.categorie || '').toLowerCase().includes(q))
      .sort((a, b) => (b.ref.toLowerCase() === q) - (a.ref.toLowerCase() === q) || a.ref.localeCompare(b.ref, 'fr', { numeric: true }))
      .slice(0, 60);
    const saisie = S.ot.tarifsVue.recherche.trim();
    // Création proposée seulement pour ce qui ressemble à une réf. (au moins un chiffre).
    const creable = saisie && /^[A-Za-z0-9-]{1,20}$/.test(saisie) && /\d/.test(saisie) && !toutes.some(r => r.ref.toLowerCase() === q);
    if (!q) { z.innerHTML = '<div class="sx-vide">Tapez une réf., une désignation ou une famille (ex. « 258 », « panneau », « Électricité »).</div>'; return; }
    const ligne = (r, k) => `<tr>
        <td><span class="sx-ref">${_otEsc(r.ref)}</span></td>
        <td>${_otEsc(r.description)}${r.categorie && r.categorie !== '-' ? `<span class="sx-etiquette sx-e-bloc">${_otEsc(r.categorie)}</span>` : ''}</td>
        <td class="sx-aide">${_otEsc(r.unite || '')}</td>
        <td class="sx-num">${this._otCaseTarif('ot-tr-mo-' + k, r.mo)}</td>
        <td class="sx-num">${this._otCaseTarif('ot-tr-pp-' + k, r.prix_piece)}</td>
        <td class="sx-num">${this._otCaseTarif('ot-tr-pl-' + k, r.mo_plafond, 72)}</td>
        <td><button type="button" class="sx-btn sx-btn-second ot-enreg" style="height:36px;padding:0 12px;" disabled
          onclick="App._otEnregistrerRef(${k})">Enregistrer</button></td>
      </tr>`;
    S.ot.tarifsVue.affichees = res.map(r => r.ref);
    z.innerHTML = `<table class="sx-table" style="min-width:760px;">
      <thead><tr><th scope="col">Réf.</th><th scope="col">Désignation</th><th scope="col">Unité</th>
        <th scope="col" class="sx-num">MO €</th><th scope="col" class="sx-num">Prix pièce €</th><th scope="col" class="sx-num">Plafond €</th>
        <th scope="col"><span class="sx-sr">Enregistrer</span></th></tr></thead>
      <tbody>${res.map(ligne).join('')}
        ${creable ? `<tr class="sx-calculee"><td><span class="sx-ref">${_otEsc(saisie.toUpperCase())}</span></td>
          <td><label for="ot-tr-new-desc" class="sx-sr">Désignation</label>
            <input id="ot-tr-new-desc" class="sx-champ" style="width:100%;height:36px;" placeholder="Désignation (vide = celle du Stock)"></td>
          <td><label for="ot-tr-new-unite" class="sx-sr">Unité</label>
            <input id="ot-tr-new-unite" class="sx-champ" style="width:70px;height:36px;" value="unité"></td>
          <td class="sx-num"><label for="ot-tr-new-mo" class="sx-sr">MO</label>
            <input id="ot-tr-new-mo" class="sx-case sx-case-mo" type="text" inputmode="decimal"></td>
          <td></td><td></td>
          <td><button type="button" class="sx-btn sx-btn-principal" style="height:36px;padding:0 12px;" onclick="App._otCreerRef()">Créer</button></td>
        </tr>` : ''}
        ${!res.length && !creable ? '<tr><td colspan="7" class="sx-centre sx-aide">Aucune réf. trouvée.</td></tr>' : ''}
      </tbody></table>`;
  },

  _otHtmlForfaitsTarifs() {
    const fs = [...((S.ot.tarifs && S.ot.tarifs.forfaits) || [])].sort((a, b) => a.lettre.localeCompare(b.lettre));
    return `<table class="sx-table" style="min-width:620px;">
      <thead><tr><th scope="col">Forfait</th><th scope="col">Intitulé</th><th scope="col" class="sx-num">MO €</th>
        <th scope="col" class="sx-num">Prix pièce €</th><th scope="col">Pièces comprises</th><th scope="col"><span class="sx-sr">Enregistrer</span></th></tr></thead>
      <tbody>${fs.map(f => `<tr>
        <td><span class="sx-ref">${_otEsc(f.lettre)}</span></td>
        <td>${_otEsc(f.intitule)}</td>
        <td class="sx-num">${this._otCaseTarif('ot-tf-mo-' + f.lettre, f.mo)}</td>
        <td class="sx-num">${this._otCaseTarif('ot-tf-pp-' + f.lettre, f.prix_piece)}</td>
        <td class="sx-aide">${(f.pieces || []).map(x => _otEsc(x.ref) + ' ×' + _otQte(x.qte)).join(', ') || '—'}</td>
        <td><button type="button" class="sx-btn sx-btn-second ot-enreg" style="height:36px;padding:0 12px;" disabled
          onclick="App._otEnregistrerForfait('${_otEsc(f.lettre)}')">Enregistrer</button></td>
      </tr>`).join('')}</tbody></table>`;
  },

  _otHtmlJournal() {
    const j = S.ot.tarifsVue && S.ot.tarifsVue.journal;
    if (!j) return '<div class="sx-chargement">Chargement du journal…</div>';
    if (!j.length) return '<div class="sx-vide">Aucun changement de tarif pour l\'instant.</div>';
    const champs = { mo: 'MO', prix_piece: 'prix pièce', mo_plafond: 'plafond', valeur: 'valeur', description: 'désignation', unite: 'unité', categorie: 'famille', intitule: 'intitulé' };
    const types = { reference: 'Réf.', forfait: 'Forfait', parametre: 'Paramètre' };
    const nomsParams = { majoration_pieces: 'coefficient pièces', taux_horaire: 'taux horaire', taux_base: 'ancien taux', essai: 'mode essai' };
    const fmt = v => v === null || v === undefined || v === '' ? 'vide' : typeof v === 'number' ? _otQte(v) : String(v);
    return j.slice(0, 100).map(e => {
      const av = e.avant || {}, ap = e.apres || {};
      const diffs = Object.keys(champs).filter(c => c in ap && JSON.stringify(av[c] ?? null) !== JSON.stringify(ap[c] ?? null))
        .filter(c => e.avant || (ap[c] !== null && ap[c] !== '' && !['unite', 'categorie'].includes(c)))
        .map(c => `${champs[c]} ${e.avant ? _otEsc(fmt(av[c])) + ' → ' : ''}<strong>${_otEsc(fmt(ap[c]))}</strong>`);
      const quand = new Date(e.le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<div class="sx-ligne" style="align-items:flex-start;">
        <div class="sx-ligne-texte">
          <span class="sx-ligne-nom" style="white-space:normal;">${types[e.type] || e.type} <span class="sx-ref">${_otEsc(e.type === 'parametre' ? (nomsParams[e.cle] || e.cle) : e.cle)}</span>${e.avant ? '' : ' · création'} — ${diffs.join(' · ') || 'aucune différence'}</span>
          <span class="sx-aide">${_otEsc(quand)} · ${_otEsc(e.par || '?')}</span>
        </div></div>`;
    }).join('');
  },

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
        this._otRendreRefsTarifs();
      } else if (type === 'forfait') {
        const f = t.forfaits.find(x => x.lettre === cle);
        Object.assign(f, { mo: d.apres.mo, prix_piece: d.apres.prix_piece });
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

  async _otEnregistrerRef(k) {
    const ref = S.ot.tarifsVue.affichees[k];
    if (!ref) return;
    const mo = this._otLireMontant('ot-tr-mo-' + k), pp = this._otLireMontant('ot-tr-pp-' + k), pl = this._otLireMontant('ot-tr-pl-' + k);
    if (!mo.ok || !pp.ok || !pl.ok) { this.toast('Montant invalide'); return; }
    await this._otEnvoyerTarif('reference', ref, { mo: mo.val, prix_piece: pp.val, mo_plafond: pl.val }, 'Réf. ' + ref);
  },

  async _otCreerRef() {
    const ref = S.ot.tarifsVue.recherche.trim().toUpperCase();
    const mo = this._otLireMontant('ot-tr-new-mo');
    if (!mo.ok) { this.toast('Montant invalide'); return; }
    const desc = document.getElementById('ot-tr-new-desc')?.value.trim();
    const unite = document.getElementById('ot-tr-new-unite')?.value.trim() || 'unité';
    const valeurs = { mo: mo.val, unite };
    if (desc) valeurs.description = desc;      // vide : le serveur reprend la désignation du Stock
    await this._otEnvoyerTarif('reference', ref, valeurs, 'Réf. ' + ref);
  },

  async _otEnregistrerForfait(lettre) {
    const mo = this._otLireMontant('ot-tf-mo-' + lettre), pp = this._otLireMontant('ot-tf-pp-' + lettre);
    if (!mo.ok || !pp.ok) { this.toast('Montant invalide'); return; }
    await this._otEnvoyerTarif('forfait', lettre, { mo: mo.val ?? 0, prix_piece: pp.val ?? 0 }, 'Forfait ' + lettre);
  },

  async _otEnregistrerParam(cle) {
    const v = this._otLireMontant('ot-p-' + cle);
    if (!v.ok || v.val === null) { this.toast('Valeur invalide'); return; }
    const avant = S.ot.tarifs.parametres[cle];
    if (Number(avant) === v.val) { this.toast('Valeur inchangée'); return; }
    const ok = await this._otConfirmer({ titre: 'Changer ce paramètre ?', ok: 'Enregistrer',
      texte: `${_otQte(avant)} → ${_otQte(v.val)}. S'applique aux fiches non validées.` });
    if (ok) await this._otEnvoyerTarif('parametre', cle, { valeur: v.val }, 'Paramètre');
  },
});
