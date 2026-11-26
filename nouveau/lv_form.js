/* ═══════════════════════════════════════════════════════════════════════════
   Formulaire LV / CMR refondu (2026-11-24, maquette validée par Hugo)
   Écran du socle (en-tête bleu, 5 blocs numérotés, récapitulatif à droite) posé sur les MÊMES champs que
   l'ancien formulaire : la mécanique de lv.js (PDF, numéro, lv_save, lv_modifier, consigne de livraison,
   pré-remplissages Production / Départs / BCB / Fournitures / ordres d'expédition) ne change pas.
   Nouveautés : un seul bouton « Enregistrer la LV » (PDF fait avec le bon numéro puis enregistré),
   « Aperçu du PDF », modules LOXAM en étiquettes (× / + Ajouter), récapitulatif avec vérifications.
   ═══════════════════════════════════════════════════════════════════════════ */

Object.assign(App, {

  /* ─ En-tête ─ */
  lvuQuitter() {
    if (S.lvu.retour) return this.lvuRetour();
    const p = S.lvuPrecedente;
    if (p && !p.startsWith('lvu-')) return this.go(p);
    this.goHome();
  },

  _lvuEntete() {
    if (S.prevView && !String(S.prevView).startsWith('lvu-')) S.lvuPrecedente = S.prevView;
    const M = S.lvu.modif, type = S.lvu.type || 'LV';
    const r = document.getElementById('lvu-retour-texte');
    if (r) r.textContent = S.lvu.retour ? 'Production' : (S.lvuPrecedente && S.lvuPrecedente !== 'home' ? 'Retour' : 'Accueil');
    const t = document.getElementById('lvu-titre');
    if (t) t.textContent = M ? `Modifier la ${M.type || type} n° ${M.numero}` : (S.lvu.enregistree ? `${type} n° ${S.lvu.enregistree} enregistrée` : 'Nouvelle lettre de voiture');
    const st = document.getElementById('lvu-sous-titre');
    if (st) st.textContent = M ? `Même numéro, date du ${M.date || ''}` : (S.lvu.enregistree ? 'Imprimez-la ou faites-en une nouvelle' : 'N° attribué à l’enregistrement');
  },

  /* ─ Type et source ─ */
  _lvuMajSources() {
    ['manual', 'loxam', 'bcb', 'stock'].forEach(s => {
      const b = document.getElementById('lvu-src-' + s);
      if (b) { b.setAttribute('aria-pressed', String(S.lvu.source === s)); b.removeAttribute('style'); }
    });
  },

  /* ─ Marchandises : étiquettes des modules, total ─ */
  _lvuApresMarchandises() {
    this._lvuRenderChips();
    this._lvuRecap();
  },

  _lvuRenderChips() {
    const el = document.getElementById('lvu-modules-chips');
    if (!el) return;
    const codes = (S.lvu.marchandises || []).map(r => String(r.note || '').trim()).filter(Boolean);
    const items = S.lvu.loxamItems || [];
    const mods = codes.map(c => ({ c, i: items.find(x => String(x.code || '').toUpperCase() === c.toUpperCase()) })).filter(x => x.i || S.lvu.source === 'loxam');
    if (S.lvu.source !== 'loxam' && !mods.length) { el.innerHTML = ''; return; }
    el.innerHTML = mods.map(({ c, i }) => `<span class="lvu-chip">${_otEsc([c, i && (i.codeModule || i.numModule), i && i.module].filter(Boolean).join(' · '))}
        <button type="button" onclick="App.lvuRetirerModule('${_otEsc(c)}')" aria-label="Retirer ${_otEsc(c)}">×</button></span>`).join('')
      + `<button type="button" class="lvu-chip-ajout" onclick="App.lvuAjouterModule()">+ Ajouter un module du Planning</button>`;
  },

  lvuRetirerModule(code) {
    this._lvuSyncFromDom();
    S.lvu.marchandises = (S.lvu.marchandises || []).filter(r => String(r.note || '') !== code);
    if (S.lvu.selectedItems) S.lvu.selectedItems.delete(code);
    this._lvuRenderMarchandises();
  },

  lvuAjouterModule() {
    this._lvuSyncFromDom();
    S.lvu.selectedItems = new Set((S.lvu.marchandises || []).map(r => r.note).filter(Boolean));
    if (S.lvu.source !== 'loxam') this.lvuSetSource('loxam');
    else { this.lvuLoadLoxam(); const p = document.getElementById('lvu-loxam-picker'); if (p) p.style.display = ''; }
    const q = document.getElementById('lvu-loxam-search'); if (q) q.focus();
  },

  // Lignes du tableau (même ordre de champs que _lvuSyncFromDom : nombre, nature, poids)
  _lvuRenderMarchandises() {
    const tbody = document.getElementById('lvu-marchandises-body');
    if (!tbody) return;
    if (!S.lvu.marchandises || !S.lvu.marchandises.length) S.lvu.marchandises = [{ qte: '', description: '', poids: '', note: '' }];
    const plusieurs = S.lvu.marchandises.length > 1;
    tbody.innerHTML = S.lvu.marchandises.map((r, i) => `<tr>
      <td><input type="number" min="1" value="${_otEsc(r.qte || '')}" aria-label="Nombre"></td>
      <td><input type="text" value="${_otEsc(r.description || '')}" aria-label="Nature de la marchandise">${r.note ? `<span class="lvu-ref">${_otEsc(r.note)}</span>` : ''}</td>
      <td><input type="number" min="0" step="0.001" value="${_otEsc(r.poids || '')}" aria-label="Poids en tonnes"></td>
      <td>${plusieurs ? `<button type="button" class="lvu-suppr" onclick="App.lvuRemoveRow(${i})" aria-label="Retirer la ligne">×</button>` : ''}</td>
    </tr>`).join('');
    this._lvuApresMarchandises();
  },

  /* ─ Transporteur (cartes du socle) ─ */
  _lvuRenderTransporteurUI() {
    const el = document.getElementById('lvu-transporteur-btns');
    if (!el) return;
    const selId = S.lvu.transporteur?.id, tl = S.lvu.transporteur || {};
    let html = `<div class="lvu-transp-rang" role="group" aria-label="Transporteur">${LVU_TRANSPORTEURS.map((t, i) => `
      <button type="button" class="lvu-transp" aria-pressed="${selId === t.id}" onclick="App.lvuSelectTransporteur(${i})">
        <b>${t.id === 'autre' ? 'Autre transporteur…' : _otEsc(t.nom)}</b>
        ${t.id === 'autre' ? (selId === 'autre' && tl.nom ? `<span>${_otEsc(tl.nom)}</span>` : '') : `<span>${_otEsc(t.adresse)} · ${_otEsc(t.ville)}</span>`}
      </button>`).join('')}</div>`;
    if (selId === 'autre') {
      const champ = (f, lib) => `<label class="lvu-champ">${lib}<input class="sx-champ" value="${_otEsc(tl[f] || '')}" oninput="App.lvuUpdateTransporteurField('${f}', this.value)"></label>`;
      html += `<div class="lvu-grille">${champ('nom', 'Nom du transporteur *')}${champ('adresse', 'Adresse')}${champ('ville', 'CP et ville')}${champ('siret', 'SIRET')}${champ('telephone', 'Téléphone')}</div>`;
    }
    el.innerHTML = html;
    this._lvuRecap();
  },

  /* ─ Récapitulatif et vérifications ─ */
  _lvuRecapPlus() {
    clearTimeout(this._lvuRecapMinuteur);
    this._lvuRecapMinuteur = setTimeout(() => this._lvuRecap(), 200);
  },

  _lvuControles() {
    this._lvuSyncFromDom();
    const v = id => (document.getElementById(id)?.value || '').trim();
    const lignes = (S.lvu.marchandises || []).filter(r => String(r.description || '').trim() || String(r.qte || '').trim());
    const res = [];   // { niveau: ok|attention|info, texte, bloquant }
    const destNom = v('lvu-f-dest-nom'), destVille = v('lvu-f-dest-ville');
    // Seul le nom est obligatoire : l'adresse n'est pas toujours connue, le chauffeur la complète (2026-11-25)
    if (!destNom) res.push({ niveau: 'attention', texte: 'Nom du destinataire à saisir', bloquant: true });
    else if (destVille || v('lvu-f-dest-adresse')) res.push({ niveau: 'ok', texte: 'Destinataire : ' + destNom });
    else res.push({ niveau: 'info', texte: 'Destinataire : ' + destNom + ' — sans adresse, le chauffeur la complétera' });
    if (lignes.length) res.push({ niveau: 'ok', texte: lignes.length + ' ligne' + (lignes.length > 1 ? 's' : '') + ' de marchandise' });
    else res.push({ niveau: 'attention', texte: 'Aucune marchandise', bloquant: true });
    // Modules LOXAM : même agence ?
    const codes = lignes.map(r => r.note).filter(Boolean);
    const items = codes.map(c => (S.lvu.loxamItems || []).find(x => x.code === c)).filter(Boolean);
    const ags = [...new Set(items.map(i => String(i.ag || ((i.chantier || '').match(/^(\d{3,6})/) || [])[1] || '').replace(/^0+/, '')).filter(Boolean))];
    if (ags.length > 1) res.push({ niveau: 'attention', texte: 'Modules pour des agences différentes : ' + ags.join(', ') });
    else if (items.length) res.push({ niveau: 'ok', texte: items.length + ' module' + (items.length > 1 ? 's' : '') + ' du Planning' + (ags.length ? ', agence ' + ags[0] : '') });
    const liv = this._livLire('lvu-liv');
    if (liv === false) res.push({ niveau: 'attention', texte: 'Consigne de livraison incomplète', bloquant: true });
    else if (!liv) res.push({ niveau: 'info', texte: 'Pas de consigne de livraison choisie' });
    if (/GRUTAGE/i.test(v('lvu-f-note'))) res.push({ niveau: 'info', texte: 'Grutage signalé sur la LV et le portail' });
    const cde = v('lvu-f-commande');
    const exp = cde && ((S.exp && S.exp.liste) || []).find(e => e.numero === cde && e.statut !== 'annulee');
    if (exp) res.push({ niveau: 'ok', texte: 'Commande = ordre d’expédition enregistré' });
    if (S.lvu.transporteur?.id === 'autre' && !String(S.lvu.transporteur.nom || '').trim()) res.push({ niveau: 'attention', texte: 'Nom du transporteur à saisir', bloquant: true });
    const info = document.getElementById('lvu-cde-info');
    if (info) info.textContent = exp ? 'Ordre d’expédition reconnu' + (exp.a_partir_du ? ' · à partir du ' + _livJJMM(_livIso(exp.a_partir_du)) : '') : '';
    return { res, lignes, liv };
  },

  _lvuRecap() {
    const el = document.getElementById('lvu-recap');
    if (!el) return;
    const { res, lignes, liv } = this._lvuControles();
    const v = id => (document.getElementById(id)?.value || '').trim();
    let poids = 0, ml = 0;
    lignes.forEach(r => { const p = parseFloat(r.poids); if (!isNaN(p)) poids += p * (Number(r.qte) || 1); const m = parseFloat(r.ml); if (!isNaN(m)) ml += m; });
    const nb = lignes.length;
    const total = [nb ? nb + ' ligne' + (nb > 1 ? 's' : '') : '', poids ? (+poids.toFixed(2)).toLocaleString('fr-FR') + ' t' : '', ml ? (+ml.toFixed(2)).toLocaleString('fr-FR') + ' ml' : ''].filter(Boolean).join(' · ');
    const tot = document.getElementById('lvu-total'); if (tot) tot.textContent = total ? 'Total : ' + total : '';
    const M = S.lvu.modif, type = S.lvu.type || 'LV';
    const num = M ? `${type} n° ${M.numero}` : (S.lvu.enregistree ? `${type} n° ${S.lvu.enregistree}` : `${type} · n° à l’enregistrement`);
    const transp = S.lvu.transporteur ? (S.lvu.transporteur.id === 'autre' ? (S.lvu.transporteur.nom || 'Autre transporteur') : S.lvu.transporteur.nom) : '';
    const icone = { ok: '✓', attention: '!', info: 'i' };
    el.innerHTML = `<div class="lvu-recap-num">${_otEsc(num)}</div>
      <div class="lvu-recap-lignes">
        <div><b>${_otEsc(v('lvu-f-dest-nom') || 'Destinataire ?')}</b>${v('lvu-f-dest-ville') ? ' · ' + _otEsc(v('lvu-f-dest-ville')) : ''}</div>
        ${total ? `<div>${_otEsc(total)}</div>` : ''}
        ${liv ? `<div class="lvu-recap-liv">${_otEsc(liv.type === 'aucune' ? 'Pas de consigne de livraison' : 'Livraison ' + _livTexte(liv).replace(/^./, x => x.toLowerCase()))}</div>` : ''}
        <div class="sx-aide">${_otEsc([transp, v('lvu-f-commande') ? 'cde ' + v('lvu-f-commande') : ''].filter(Boolean).join(' · '))}</div>
      </div>
      <ul class="lvu-verifs">${res.map(x => `<li class="lvu-v-${x.niveau}"><span aria-hidden="true">${icone[x.niveau]}</span>${_otEsc(x.texte)}</li>`).join('')}</ul>`;
    const resume = document.getElementById('lvu-exp-resume');
    if (resume) resume.textContent = 'Expéditeur : ' + ([v('lvu-f-exp-nom'), v('lvu-f-exp-ville')].filter(Boolean).join(', ') || '—') + ' · Donneur d’ordre : ' + (v('lvu-f-donneur') || '—');
    const b = document.getElementById('lvu-btn-enregistrer');
    if (b) b.textContent = M ? 'Enregistrer les modifications' : (S.lvu.enregistree ? 'LV enregistrée' : 'Enregistrer la LV');
    if (b) b.disabled = !!(S.lvu.enregistree && !M) || !!S.lvu.saving;
    this._lvuEntete();
  },

  /* ─ Actions ─ */
  async lvuEnregistrer() {
    if (S.lvu.saving || S.lvu.generating) return;
    if (S.lvu.enregistree && !S.lvu.modif) { this.toast(`LV n° ${S.lvu.enregistree} déjà enregistrée : « + Nouvelle lettre de voiture » pour en faire une autre`, 5000); return; }
    const { res } = this._lvuControles();
    const bloq = res.find(x => x.bloquant);
    if (bloq) { this.toast(bloq.texte, 5000); this._lvuRecap(); return; }
    const b = document.getElementById('lvu-btn-enregistrer');
    if (b) { b.disabled = true; b.textContent = 'Enregistrement…'; }
    try {
      const ok = await this.lvuGenerate();
      if (!ok) return;
      await this.lvuSaveToDrive();
    } finally {
      this._lvuRecap();
      const r = document.getElementById('lvu-result'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  // Aperçu dans la PWA (apercu.js) ; pas d'onglet pour une LV non enregistrée (n° provisoire : ne pas l'imprimer).
  async lvuApercu() {
    const ok = await this.lvuGenerate();
    if (!ok || !S.lvu.lastDoc) return;
    const provisoire = !S.lvu.modif && !S.lvu.enregistree;
    this.pdfApercu({ titre: 'Aperçu de la ' + ((S.lvu.type || 'LV').toUpperCase()), octets: new Uint8Array(S.lvu.lastDoc.output('arraybuffer')),
      onglet: !provisoire, bandeau: provisoire ? 'Pas encore enregistrée : n° provisoire, ne pas imprimer' : '' });
    if (provisoire) {
      const t = document.getElementById('lvu-result-title');
      if (t) t.textContent = 'Aperçu ouvert — pas encore enregistrée (n° provisoire, ne pas imprimer)';
    }
  },
});
