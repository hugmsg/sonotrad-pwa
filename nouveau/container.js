/* ═══════════════════════════════════════════════════════════════════════════
   Fiche d'opérations CONTAINER (2026-11-18, maquette https://claude.ai/artifact/6rcWFsqcqBdYDPzxjUgx6b)
   Fiches dont ot_fiches.modele = 'container' (ouvertes ainsi d'office quand le type commence par LC).
   Même stockage que la fiche module (S.ot.lignes, ot_enregistrer, mêmes documents et stock) : l'écran
   ne fait que lire et écrire des lignes par réf. — la bonne réf. suit la taille du container :
     sablage ½ : Q (10′, LC8/LC10) ou M (20′, LC15/LC20) ; complet = 2 demis
     portes : les deux = forfait S (8′/15′, LC8/LC15) ou O (20′/10′, LC10/LC20) ; une seule = battant seul
     joints / barres : LC8 ou LC10/20 ; portes neuves (les deux) = joints, barres et lock box compris
   Base L, peinture P, plaques 600 × 2 : d'office mais retirables. Le reste = « Autre travail ».
   Prix : jamais affichés aux non-administrateurs (le serveur ne les envoie d'ailleurs pas).
   Bascule module ↔ container : otBasculerModele (action ot_modele), aussi depuis la fiche module.
   ═══════════════════════════════════════════════════════════════════════════ */

const OT_CT_TAILLES = ['LC8', 'LC10', 'LC15', 'LC20'];

Object.assign(App, {

  _otCtTailleFiche(f) {
    const m = String(f && f.type_module || '').toUpperCase().match(/LC\s*(\d+)/);
    const t = m ? 'LC' + m[1] : '';
    return OT_CT_TAILLES.includes(t) ? t : 'LC20';
  },

  // Réf. propres à la taille
  _otCtRefs(taille) {
    const petit = taille === 'LC8' || taille === 'LC10';
    const porte8 = taille === 'LC8' || taille === 'LC15';
    const lc8 = taille === 'LC8';
    return {
      sablage: petit ? 'Q' : 'M',
      portes: porte8 ? 'S' : 'O',
      batG: porte8 ? '304187' : '304234', batD: porte8 ? '304188' : '304233',
      joint: lc8 ? '2403023' : '2403024',
      barreG: lc8 ? '2401293' : '2401296', barreD: lc8 ? '2401294' : '2401295',
    };
  },
  // Toutes les réf. gérées par l'écran (toutes tailles) : le reste va dans « Autre travail »
  _otCtGerees() {
    const s = new Set(['L', 'P', '600', 'N', '608004']);
    OT_CT_TAILLES.forEach(t => Object.values(this._otCtRefs(t)).forEach(r => s.add(r)));
    return s;
  },

  _otCtQte(ref) {
    return S.ot.lignes.filter(l => l.ref === ref && !l.occasion).reduce((t, l) => t + (Number(l.quantite) || 0), 0);
  },
  // Met la quantité d'une réf. : une seule ligne gardée ; à 0 une ligne d'office reste (à 0), les autres partent.
  _otCtMettre(ref, q) {
    const lignes = S.ot.lignes.filter(l => l.ref === ref && !l.occasion);
    if (q > 0) {
      if (lignes.length) {
        lignes[0].quantite = q;
        S.ot.lignes = S.ot.lignes.filter(l => !lignes.slice(1).includes(l));
      } else {
        const f = S.ot.forfaits.get(ref), r = S.ot.refs.get(ref);
        S.ot.lignes.push({ bloc: 'pieces', ref, libelle: f ? f.intitule : (r ? r.description : ref), quantite: q, unite: 'u',
          occasion: false, origine: 'atelier', mo_saisi: null, prix_piece_saisi: null });
      }
    } else {
      S.ot.lignes = S.ot.lignes.filter(l => !lignes.includes(l) || l.origine === 'office');
      lignes.filter(l => l.origine === 'office').forEach(l => { l.quantite = 0; });
    }
  },
  _otCtChange() {
    this._otModifie(false);
    this._otRendreContainer();
  },

  otCtTaille(t) { S.ot.ctTaille = t; this._otRendreContainer(); },
  otCtPas(ref, d, max) {
    if (!this._otModifiable()) return;
    this._otCtMettre(ref, Math.max(0, Math.min(max || 99, this._otCtQte(ref) + d)));
    this._otCtChange();
  },
  otCtSablage(n) {
    if (!this._otModifiable()) return;
    this._otCtMettre(this._otCtRefs(S.ot.ctTaille).sablage, n);
    this._otCtChange();
  },
  otCtPortes(choix) {
    if (!this._otModifiable()) return;
    const R = this._otCtRefs(S.ot.ctTaille);
    [R.portes, R.batG, R.batD].forEach(r => this._otCtMettre(r, 0));
    if (choix === 'deux') {
      this._otCtMettre(R.portes, 1);
      // Portes neuves : joints, barres et lock box compris dans le kit
      const retirer = [R.joint, R.barreG, R.barreD, '608004'].filter(r => this._otCtQte(r) > 0);
      retirer.forEach(r => this._otCtMettre(r, 0));
      if (retirer.length) this.toast('Joints, barres ou lock box retirés : compris dans le kit de portes neuves', 4000);
    }
    if (choix === 'g') { this._otCtMettre(R.batG, 1); this._otCtMettre(R.barreG, 0); }
    if (choix === 'd') { this._otCtMettre(R.batD, 1); this._otCtMettre(R.barreD, 0); }
    this._otCtChange();
  },

  _otCtPrix(ref) {
    const f = S.ot.forfaits.get(ref), r = S.ot.refs.get(ref);
    const v = f ? f.mo : r ? r.mo : null;
    return v === undefined || v === null ? null : Number(v);
  },

  _otRendreContainer() {
    const el = document.getElementById('ot-fiche-root');
    const f = S.ot.fiche;
    if (!el || !f) return;
    S.ot.ctTaille = S.ot.ctTaille || this._otCtTailleFiche(f);
    const T = S.ot.ctTaille, R = this._otCtRefs(T);
    const modif = this._otModifiable(), admin = this._otAdmin();
    const dis = modif ? '' : 'disabled';
    const prix = ref => { if (!admin) return ''; const p = this._otCtPrix(ref); return p === null ? '' : ' · ' + _otEuros(p); };
    const q = ref => this._otCtQte(ref);

    const nSab = q(R.sablage);
    const portes = q(R.portes) > 0 ? 'deux' : q(R.batG) > 0 && q(R.batD) > 0 ? 'deux-battants' : q(R.batG) > 0 ? 'g' : q(R.batD) > 0 ? 'd' : 'non';
    const kit = portes === 'deux';
    const seg = (actif, onclick, texte) => `<button type="button" class="sx-ct-seg" aria-pressed="${actif}" ${dis} onclick="${onclick}">${texte}</button>`;
    const compteur = (ref, nom, aide, max) => `<div class="sx-ct-ligne">
        <div class="sx-ct-texte"><b>${_otEsc(nom)}</b><span class="sx-aide">${_otEsc(aide)}</span></div>
        <div class="sx-compteur">
          <button type="button" class="sx-moins" aria-label="Retirer un : ${_otEsc(nom)}" ${dis} onclick="App.otCtPas('${ref}', -1, ${max})">−</button>
          <span class="sx-ct-n${q(ref) ? '' : ' sx-ct-zero'}">${_otQte(q(ref))}</span>
          <button type="button" class="sx-plus" aria-label="Ajouter un : ${_otEsc(nom)}" ${dis} onclick="App.otCtPas('${ref}', 1, ${max})">+</button>
        </div></div>`;

    const gerees = this._otCtGerees();
    const autres = S.ot.lignes.map((l, i) => ({ l, i })).filter(x => !gerees.has(String(x.l.ref || '').toUpperCase()) || x.l.occasion);
    const lignesOt = S.ot.lignes.filter(l => Number(l.quantite) > 0);

    el.innerHTML = `<div class="sx-ecran sx-ot sx-ot-${_otEsc(f.statut)}">
      ${this._otEntete({ retour: { texte: 'Fiches', action: 'App.otQuitterFiche()' }, titre: 'Fiche container', large: true,
          sousTitre: [f.type_module, f.numero_module, f.agence, f.code_planning].filter(Boolean).join(' · '), etat: S.ot.etat,
          bandeau: this._otBandeauStatut(f, this._otVueControle() ? '<button type="button" class="sx-btn sx-btn-discret" onclick="App.otCtVueTableau(true)">Vue tableau</button>' : '') })}
      <main class="sx-contenu sx-large sx-ct-page">
        <div class="sx-ct-col">
          ${f.commentaire ? `<span class="sx-aide" style="font-size:13px;">${_otEsc(f.commentaire)}</span>` : ''}
          ${modif ? '' : `<div class="sx-bandeau sx-bandeau-info">Fiche ${_otEsc((OT_STATUTS[f.statut] || '').toLowerCase())} : consultation seulement.</div>`}
          <section class="sx-carte sx-carte-pad sx-ct-taille">
            <div class="sx-ct-texte"><b>Taille</b><span class="sx-aide">lue dans le type du module ; elle choisit les bonnes réf.</span></div>
            <div class="sx-ct-segs" role="group" aria-label="Taille du container">
              ${OT_CT_TAILLES.map(t => `<button type="button" class="sx-ct-seg" aria-pressed="${t === T}" onclick="App.otCtTaille('${t}')">${t}</button>`).join('')}
            </div>
          </section>
          <section class="sx-carte sx-ct-liste" aria-label="Travaux du container">
            ${compteur('L', 'Base container', 'forfait L' + prix('L') + ' · mis d’office, retirable', 1)}
            <div class="sx-ct-ligne">
              <div class="sx-ct-texte"><b>Sablage</b><span class="sx-aide">forfait ${R.sablage} (${R.sablage === 'Q' ? '10′' : '20′'})${admin ? prix(R.sablage) + ' le demi' : ''} — complet = 2 demis</span></div>
              <div class="sx-ct-segs" role="group" aria-label="Sablage">
                ${seg(nSab === 0, 'App.otCtSablage(0)', 'Aucun')}${seg(nSab === 1, 'App.otCtSablage(1)', 'Demi')}${seg(nSab === 2, 'App.otCtSablage(2)', 'Complet')}
              </div>
            </div>
            <div class="sx-ct-ligne">
              <div class="sx-ct-texte"><b>Portes</b><span class="sx-aide">les deux : forfait ${R.portes}${prix(R.portes)} — une seule : battant ${R.batG} ou ${R.batD}${prix(R.batG)}</span></div>
              <div class="sx-ct-segs" role="group" aria-label="Portes">
                ${seg(portes === 'non', "App.otCtPortes('non')", 'Aucune')}${seg(portes === 'deux' || portes === 'deux-battants', "App.otCtPortes('deux')", 'Les deux')}${seg(portes === 'g', "App.otCtPortes('g')", 'Gauche')}${seg(portes === 'd', "App.otCtPortes('d')", 'Droite')}
              </div>
            </div>
            ${kit ? '<div class="sx-ct-note">Portes neuves : joints, barres de fermeture et lock box sont compris dans le kit.</div>' : ''}
            ${portes === 'g' || portes === 'd' ? `<div class="sx-ct-note">Le battant ${portes === 'g' ? 'gauche' : 'droit'} neuf a sa barre de fermeture.</div>` : ''}
            ${compteur('N', 'Planches de plancher', 'forfait N' + prix('N') + ' la planche · autant de planches 212 en fourniture', 12)}
            ${compteur('P', 'Peinture', 'forfait P' + prix('P') + ' · mis d’office, retirable', 1)}
            ${kit ? '' : compteur(R.joint, 'Kit joint de porte', 'réf. ' + R.joint + prix(R.joint), 2)}
            ${kit || portes === 'g' ? '' : compteur(R.barreG, 'Barre de fermeture gauche', 'réf. ' + R.barreG + prix(R.barreG), 2)}
            ${kit || portes === 'd' ? '' : compteur(R.barreD, 'Barre de fermeture droite', 'réf. ' + R.barreD + prix(R.barreD), 2)}
            ${kit ? '' : compteur('608004', 'Lock box', 'réf. 608004' + prix('608004'), 2)}
            ${compteur('600', 'Plaques acier à souder', 'réf. 600 · fourniture seule · 2 d’office, retirables', 6)}
          </section>
          <section class="sx-section" aria-labelledby="ot-ct-autre">
            <div class="sx-section-tete"><h2 class="sx-h2" id="ot-ct-autre">Autre travail</h2><span class="sx-aide">renfort de toiture, électricité, pièce hors liste…</span></div>
            <div class="sx-carte">${autres.length ? autres.map(({ l, i }) => `<div class="sx-ligne">
                <div class="sx-ligne-texte"><span class="sx-ligne-nom">${l.ref ? `<span class="sx-ref">${_otEsc(l.ref)}</span> · ` : ''}${_otEsc(l.libelle || '')}</span>
                  ${l.ref && !S.ot.forfaits.has(l.ref) && !S.ot.refs.has(l.ref) ? '<span class="sx-badge sx-badge-prevu">RÉF. SANS TARIF · montant au contrôle</span>' : ''}</div>
                <div class="sx-ligne-actions">${admin ? `<label class="sx-ct-mo-saisi"><span class="sx-sr">Montant MO (remplace le tarif)</span>
                    <input id="ot-ct-mo-${i}" type="text" inputmode="decimal" ${dis} class="${l.mo_saisi != null ? 'sx-manuel' : ''}"
                      value="${l.mo_saisi != null ? _otEsc(_otQte(l.mo_saisi)) : ''}" placeholder="${this._otCtPrix(l.ref) !== null ? _otEsc(_otQte(this._otCtPrix(l.ref) * (Number(l.quantite) || 0))) : 'montant'}"
                      title="Montant de MO tapé : remplace le tarif ; vide = tarif" onchange="App.otCtMontant(${i}, this.value)"> €</label>` : ''}<div class="sx-compteur">
                  <button type="button" class="sx-moins" aria-label="Retirer un" ${dis} onclick="App._otPas(${i}, -1);App._otRendreContainer()">−</button>
                  <label for="ot-q-${i}" class="sx-sr">Quantité</label>
                  <input id="ot-q-${i}" class="sx-qte" type="number" inputmode="decimal" min="0" step="any" placeholder="—" ${dis}
                    value="${_otEsc(l.quantite ?? '')}" oninput="App._otSaisirQte(${i}, this.value)">
                  <button type="button" class="sx-plus" aria-label="Ajouter un" ${dis} onclick="App._otPas(${i}, 1);App._otRendreContainer()">+</button>
                </div>
                ${modif ? `<button type="button" class="sx-retirer" aria-label="Supprimer la ligne" onclick="App._otRetirer(${i});App._otRendreContainer()">✕</button>` : ''}
              </div></div>`).join('') : '<div class="sx-vide">Rien d’autre.</div>'}</div>
            ${modif ? `<div class="sx-recherche">${_OT_SVG_LOUPE}
                <label for="ot-rech-pieces" class="sx-sr">Ajouter une pièce ou un forfait</label>
                <input id="ot-rech-pieces" type="search" placeholder="+ Réf. ou désignation (SON-0000 = matériel non référencé)" autocomplete="off"
                  value="${_otEsc(S.ot.recherche.pieces)}" oninput="App._otRechercher('pieces', this.value)">
              </div>
              <div id="ot-sugg-pieces"></div>` : ''}
          </section>
          <div class="sx-section">
            <label for="ot-notes" class="sx-h2">Notes</label>
            <textarea id="ot-notes" class="sx-textarea" rows="3" ${modif ? '' : 'disabled'}
              oninput="S.ot.notes=this.value;App._otModifie(false)">${_otEsc(S.ot.notes)}</textarea>
            <span class="sx-aide">Pour le bureau, pas pour LOXAM.</span>
          </div>
        </div>
        <aside class="sx-ct-cote">
        ${admin && f.statut !== 'brouillon' ? `<section class="sx-carte sx-carte-pad" style="display:flex;flex-direction:column;gap:4px;">
            <span class="sx-aide" style="font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Montant de l'OT</span>
            <span class="sx-gros-montant" id="ot-ct-total">${f.totaux && f.totaux.total != null ? _otEuros(f.totaux.total) : '…'}</span>
            <span class="sx-aide">calculé par le serveur</span>
          </section>` : ''}
        ${admin && f.statut === 'a_valider' ? this._otHtmlEnValidant(false) : ''}
        ${admin && ['validee', 'envoyee'].includes(f.statut) ? this._otHtmlDocuments(f) : ''}
        ${this._otHtmlStock(f)}
        <div class="sx-carte sx-ct-recap" aria-label="Lignes de l'OT">
          <div class="sx-carte-pad"><b>Lignes de l'OT</b><br><span class="sx-aide">ce que reçoivent le PDF et les Excel</span></div>
          ${lignesOt.length ? lignesOt.map(l => {
            const p = admin ? this._otCtPrix(l.ref) : null;
            const mo = l.mo_saisi != null ? Number(l.mo_saisi) : (p !== null ? p * Number(l.quantite) : null);
            return `<div class="sx-ct-recap-l"><span class="sx-ref">${_otEsc(l.ref || '')}</span><span>${_otEsc(l.libelle || '')}</span><b>${_otQte(l.quantite)}</b>
              <span class="sx-ct-mo">${admin && mo !== null ? _otEuros(mo) : ''}</span></div>`;
          }).join('') : '<div class="sx-vide">Aucune ligne.</div>'}
        </div>
        </aside>
      </main>
      <footer class="sx-pied"><div class="sx-pied-in" id="ot-pied">${this._otHtmlPied()}</div></footer>
    </div>`;
  },

  // Montant de MO tapé par l'administrateur (ligne « Autre travail ») : remplace le tarif ; vide = tarif
  otCtMontant(i, v) {
    const l = S.ot.lignes[i];
    if (!l || !this._otModifiable() || !this._otAdmin()) return;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    l.mo_saisi = String(v).trim() === '' || isNaN(n) ? null : Math.max(0, n);
    this._otModifie(false);
    this._otRendreContainer();
  },
  // Total du serveur, après chaque enregistrement
  _otCtMajTotal() {
    const el = document.getElementById('ot-ct-total');
    const t = S.ot.fiche && S.ot.fiche.totaux;
    if (el && t && t.total != null) el.textContent = _otEuros(t.total);
  },
  otCtVueTableau(on) {
    S.ot.ctTableau = !!on;
    this._otRendreFiche();
  },

  /* ─ Bascule module ↔ container ─ */

  _otHtmlBoutonModele() {
    const f = S.ot.fiche;
    // Contrôle d'une fiche container en « Vue tableau » : retour à la fiche container
    const retour = f && f.modele === 'container' && S.ot.ctTableau && this._otVueControle()
      ? '<button type="button" class="sx-btn sx-btn-discret" onclick="App.otCtVueTableau(false)">Fiche container</button>' : '';
    if (!f || !this._otModifiable()) return retour;
    const vers = f.modele === 'container' ? 'module' : 'container';
    return retour + `<button type="button" class="sx-btn sx-btn-discret" onclick="App.otBasculerModele()">Passer en fiche ${vers}</button>`;
  },

  // Même règle que ot_fiche_modele (serveur) : aperçu de ce qui part, reste et arrive.
  _otApercuModele(vers) {
    const L = S.ot.lignes;
    const office = l => l.origine === 'office' && l.mo_saisi == null;
    const q = l => l.quantite == null ? null : Number(l.quantite);
    const retirees = vers === 'container'
      ? L.filter(l => (office(l) && ['E', 'SON-0074', 'SON-0072'].includes(l.ref) && [null, 0, 1].includes(q(l)))
          || (l.bloc === 'travaux' && q(l) === null && ['SON-0101', 'SON-0102'].includes(l.ref)) || l.origine === 'modele')
      : L.filter(l => office(l) && ((['L', 'P'].includes(l.ref) && [null, 0, 1].includes(q(l))) || (l.ref === '600' && [null, 0, 2].includes(q(l)))));
    const gardees = L.filter(l => !retirees.includes(l) && Number(l.quantite) > 0);
    const deja = new Set(gardees.map(l => l.ref));
    const ajout = vers === 'container'
      ? [['L', 'Base container'], ['P', 'Peinture container'], ['600', 'Plaques acier à souder × 2']]
      : [['E', 'Électricité'], ['SON-0074', 'Consommables'], ['SON-0072', 'Préparation module'], ['', 'Temps passé prêts à remplir']];
    return { retirees, gardees, ajoutees: ajout.filter(([r]) => !r || !deja.has(r)) };
  },

  async otBasculerModele() {
    const f = S.ot.fiche;
    if (!f) return;
    if (!(await this._otEnregistrer())) return;
    const vers = f.modele === 'container' ? 'module' : 'container';
    const A = this._otApercuModele(vers);
    const li = (ref, nom, extra = '') => `<li><span class="sx-ref">${_otEsc(ref || '')}</span> ${_otEsc(nom || '')}${extra}</li>`;
    const ok = await new Promise(resolve => {
      const voile = document.createElement('div');
      voile.className = 'sx-voile';
      voile.innerHTML = `<div class="sx-fenetre sx-ct-fen" role="dialog" aria-modal="true" aria-labelledby="ot-mod-titre">
        <h3 id="ot-mod-titre">Passer en fiche ${vers} ?</h3>
        <p class="sx-aide">${_otEsc([f.type_module, f.numero_module, f.code_planning].filter(Boolean).join(' · '))}</p>
        <b class="sx-ct-t sx-ct-t-r">Retirées</b>
        <ul class="sx-ct-ul">${A.retirees.filter(l => l.origine !== 'modele').map(l => li(l.ref, l.libelle)).join('') || '<li class="sx-aide">rien</li>'}</ul>
        <b class="sx-ct-t sx-ct-t-g">Gardées</b>
        <ul class="sx-ct-ul">${A.gardees.map(l => li(l.ref, l.libelle, ' × ' + _otEsc(_otQte(l.quantite)))).join('') || '<li class="sx-aide">rien</li>'}</ul>
        ${vers === 'container' ? '<p class="sx-aide">Planches 212 converties en forfait N (même nombre) ; paire de battants convertie en portes complètes.</p>' : ''}
        <b class="sx-ct-t sx-ct-t-a">Ajoutées d'office</b>
        <ul class="sx-ct-ul">${A.ajoutees.map(([r, n]) => li(r, n)).join('') || '<li class="sx-aide">rien</li>'}</ul>
        <p class="sx-aide">Le Planning n'est pas modifié : si le type du module est faux, corrigez-le aussi dans le Sheet.</p>
        <div class="sx-fenetre-boutons">
          <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
          <button type="button" class="sx-btn sx-btn-principal" data-r="1">Passer en fiche ${vers}</button>
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
    if (!ok) return;
    try {
      const d = await this._otPost({ action: 'ot_modele', id: f.id, version: S.ot.fiche.version, modele: vers });
      S.ot.ctTaille = null;
      S.ot.listeChargee = false;
      this._otAfficherFiche(d.fiche);
      this.toast('✓ Fiche ' + vers);
    } catch (e) {
      this.toast('Changement impossible : ' + e.message, 5000);
    }
  },
});
