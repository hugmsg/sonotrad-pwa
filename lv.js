// LV / CMR (formulaire, enregistrement, historique, annulation, PDF recto/verso).
// Méthodes ajoutées à App (défini dans app.js, chargé avant) : contenu déplacé tel quel
// depuis l'ancien index.html unique (découpage du 2026-10-26).
Object.assign(App, {

  /* ─ LVU ─ */
  async lvuInit() {
    this.go('lvu-form');
    if (!S.lvu.transporteur) S.lvu.transporteur = LVU_TRANSPORTEURS[0];
    this._lvuRenderTransporteurUI();
    // Fetch next number (non-bloquant)
    if (S.apiUrl && !S.lvu.numero) {
      try {
        const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_next_number', {}, 10000);
        const d = await r.json();
        if (d.status === 'ok') { S.lvu.numero = d.numero; S.lvu.display = d.display; }
      } catch (_) {}
    }
  },

  lvuSetType(type) {
    S.lvu.type = type;
    document.getElementById('lvu-btn-lv').style.cssText  += `;background:${type==='LV' ?'#1D4ED8':'white'};color:${type==='LV'?'white':'#64748B'};border-color:${type==='LV'?'#1D4ED8':'#E2E8F0'}`;
    document.getElementById('lvu-btn-cmr').style.cssText += `;background:${type==='CMR'?'#1D4ED8':'white'};color:${type==='CMR'?'white':'#64748B'};border-color:${type==='CMR'?'#1D4ED8':'#E2E8F0'}`;
  },

  lvuSetSource(src) {
    S.lvu.source = src;
    ['manual','loxam','bcb','stock'].forEach(s => {
      const btn = document.getElementById('lvu-src-' + s);
      if (!btn) return;
      btn.style.borderColor = s === src ? '#1D4ED8' : '#E2E8F0';
      btn.style.background  = s === src ? '#EFF6FF' : 'white';
      btn.style.color       = s === src ? '#1D4ED8' : '#64748B';
    });
    document.getElementById('lvu-loxam-picker').style.display = src === 'loxam' ? '' : 'none';
    document.getElementById('lvu-bcb-picker').style.display   = src === 'bcb'   ? '' : 'none';
    document.getElementById('lvu-stock-picker').style.display = src === 'stock' ? '' : 'none';
    if (src === 'loxam') { this.lvuLoadLoxam(); this.lvuLoadAgencies(); }
    if (src === 'bcb'   && S.lvu.bcbArrivals.length === 0) this.lvuLoadBcb();
    if (src === 'stock') this._lvuRenderStockList();
  },

  lvuLoadLoxam() {
    const el = document.getElementById('lvu-loxam-list');
    if (!el) return;
    // Réutilise si déjà chargé dans cette session
    if (S.lvu.loxamItems.length > 0) { this._lvuRenderLoxamList(); return; }
    if (!S.apiUrl) { el.innerHTML = '<div style="padding:12px;color:#94A3B8;font-size:13px;">URL API non configurée</div>'; return; }
    el.innerHTML = '<div style="padding:12px;color:#94A3B8;font-size:13px;">Chargement…</div>';
    // Source : Planning (modules à expédier), pas Arrivées
    _fetchWithTimeout(S.apiUrl + '?action=lv_loxam_planning', {}, 30000)
      .then(r => r.json())
      .then(d => {
        S.lvu.loxamItems = d.data || [];
        this._lvuRenderLoxamList();
      })
      .catch(err => { el.innerHTML = `<div style="padding:12px;color:#EF4444;font-size:13px;">Erreur : ${err.message}</div>`; });
  },

  _lvuRenderLoxamList() {
    const el = document.getElementById('lvu-loxam-list');
    if (!el) return;
    const q = (document.getElementById('lvu-loxam-search')?.value || '').toLowerCase();
    const items = S.lvu.loxamItems.filter(i => {
      if (!q) return true;
      return (i.codeModule  || '').toLowerCase().includes(q)
          || (i.code        || '').toLowerCase().includes(q)
          || (i.chantier    || '').toLowerCase().includes(q)
          || (i.ag          || '').toLowerCase().includes(q)
          || (i.module      || '').toLowerCase().includes(q)
          || (i.description || '').toLowerCase().includes(q)
          || (i.numModule   || '').toLowerCase().includes(q);
    });
    if (!items.length) {
      el.innerHTML = '<div style="padding:12px;color:#94A3B8;font-size:13px;">'
        + (S.lvu.loxamItems.length === 0 ? 'Aucun module présent' : 'Aucun résultat pour cette recherche') + '</div>';
      return;
    }
    el.innerHTML = items.map(i => {
      const key = i.code || i.codeModule || i.module || '';
      const sel = S.lvu.selectedItems.has(key);
      const numM  = i.codeModule || i.numModule || '';
      const label = numM ? `Module N° ${numM}` : (i.description || i.module || key || '—');
      const sub   = [key, i.module, i.chantier].filter(Boolean).join(' · ');
      return `<div onclick="App.lvuToggleLoxam('${key.replace(/'/g,"&#39;")}')"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #F1F5F9;cursor:pointer;background:${sel?'#EFF6FF':'white'}">
        <div style="width:20px;height:20px;border-radius:4px;border:2px solid ${sel?'#1D4ED8':'#CBD5E1'};background:${sel?'#1D4ED8':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${sel?'<span style="color:white;font-size:12px;">✓</span>':''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
          <div style="font-size:11px;color:#64748B;">${sub}</div>
        </div>
        ${i.status && i.status.grutage ? `<span style="font-size:10px;background:#FEF2F2;color:#991B1B;border-radius:4px;padding:2px 6px;white-space:nowrap;flex-shrink:0;font-weight:600;">🏗 Grutage</span>` : ''}
      </div>`;
    }).join('');
  },

  lvuToggleLoxam(key) {
    if (S.lvu.selectedItems.has(key)) S.lvu.selectedItems.delete(key);
    else S.lvu.selectedItems.add(key);
    this._lvuRenderLoxamList();
  },

  lvuToggleLivraisonPrevue() {
    const cb   = document.getElementById('lvu-f-livraison-check');
    const date = document.getElementById('lvu-f-livraison-date');
    if (!cb || !date) return;
    date.style.display = cb.checked ? 'block' : 'none';
  },

  lvuApplyLoxam() {
    const rows = [];
    let firstAgence = null;
    S.lvu.loxamItems.forEach(i => {
      const key = i.code || i.codeModule || i.module || '';
      if (!S.lvu.selectedItems.has(key)) return;
      const numM = i.codeModule || i.numModule || '';
      const modele = (i.module || '').trim();
      const isContainer = /^LC/i.test(modele) || /^(container|conteneur)$/i.test(modele);
      const desc = isContainer
        ? `Container n° ${numM || key}`
        : (numM ? `Module N° ${numM}` : (i.description || modele || key));
      rows.push({ qte: 1, description: desc, poids: '2.5', note: key, ml: i.ml || '' });
      // Code agence : col "ag" (D) du Planning, sinon parse depuis "1043 - 72 ARNAGE Cedex"
      const agCode = i.ag || ((i.chantier || '').match(/^(\d{3,6})/)||[])[1] || '';
      if (agCode && !firstAgence) firstAgence = agCode;
    });
    if (rows.length) {
      S.lvu.marchandises = rows;
      this._lvuRenderMarchandises();
      // Expéditeur : SONOTRAD (toujours pour source loxam)
      const fExpN = document.getElementById('lvu-f-exp-nom');
      const fExpA = document.getElementById('lvu-f-exp-adresse');
      const fExpV = document.getElementById('lvu-f-exp-ville');
      const fExpP = document.getElementById('lvu-f-exp-pays');
      if (fExpN && !fExpN.value) fExpN.value = 'SONOTRAD';
      if (fExpA && !fExpA.value) fExpA.value = '9 Z.A. des Renardières';
      if (fExpV && !fExpV.value) fExpV.value = '53250 JAVRON-LES-CHAPELLES';
      if (fExpP && !fExpP.value) fExpP.value = 'FR - France';
      // Donneur d'ordre : LOXAM 72 CRM
      const fDon = document.getElementById('lvu-f-donneur');
      if (fDon && !fDon.value) fDon.value = 'LOXAM 72 CRM';
      // Destinataire : agence de destination
      if (firstAgence && S.lvu.agencies.length > 0) {
        const ag = S.lvu.agencies.find(a => a.code === firstAgence || a.code === firstAgence.padStart(4,'0') || a.code.replace(/^0+/,'') === firstAgence.replace(/^0+/,''));
        if (ag) {
          const fn = document.getElementById('lvu-f-dest-nom');
          const fa = document.getElementById('lvu-f-dest-adresse');
          const fv = document.getElementById('lvu-f-dest-ville');
          const fpAg = document.getElementById('lvu-f-dest-pays');
          if (fn && !fn.value)     fn.value  = ag.nom;
          if (fa && !fa.value)     fa.value  = ag.adresse;
          if (fv && !fv.value)     fv.value  = `${ag.cp} ${ag.ville}`.trim();
          if (fpAg && !fpAg.value) fpAg.value = ag.pays || 'FR - France';
        }
      }
    }
    // Pré-remplir la note si un module nécessite un grutage à la livraison
    const anyGrutage = [...S.lvu.selectedItems].some(key => {
      const item = S.lvu.loxamItems.find(i => (i.code || i.codeModule || i.module || '') === key);
      return item && item.status && item.status.grutage;
    });
    if (anyGrutage) {
      const fn = document.getElementById('lvu-f-note');
      if (fn && !fn.value.includes('GRUTAGE'))
        fn.value = '!!! GRUTAGE A LA LIVRAISON !!!' + (fn.value ? '\n' + fn.value : '');
    }
    // Pré-remplir la date de livraison prévue si connue en Production LOXAM
    const livPrevue = [...S.lvu.selectedItems]
      .map(key => S.lvu.loxamItems.find(i => (i.code || i.codeModule || i.module || '') === key))
      .find(i => i && i.livraisonPrevue)?.livraisonPrevue;
    const cbLiv = document.getElementById('lvu-f-livraison-check');
    const dateLiv = document.getElementById('lvu-f-livraison-date');
    if (livPrevue && cbLiv && dateLiv) {
      cbLiv.checked = true;
      dateLiv.value = _toIsoDateInput(livPrevue);
      dateLiv.style.display = 'block';
    }
    document.getElementById('lvu-loxam-picker').style.display = 'none';
    this.toast(`${rows.length} module(s) importé(s)${anyGrutage ? ' — ⚠️ Grutage' : ''}`);
  },

  async lvuLoadBcb() {
    if (!S.apiUrl) return;
    const el = document.getElementById('lvu-bcb-list');
    el.innerHTML = '<div style="padding:12px;color:#94A3B8;font-size:13px;">Chargement…</div>';
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=bcb_arrivals&user=' + encodeURIComponent(S.currentUser?.login || ''), {}, 15000);
      const d = await r.json();
      S.lvu.bcbArrivals = d.arrivals || [];
      this._lvuRenderBcbList();
    } catch (_) {
      el.innerHTML = '<div style="padding:12px;color:#EF4444;font-size:13px;">Erreur de chargement</div>';
    }
  },

  _lvuRenderBcbList() {
    const el = document.getElementById('lvu-bcb-list');
    if (!el) return;
    const items = S.lvu.bcbArrivals;
    if (!items.length) { el.innerHTML = '<div style="padding:12px;color:#94A3B8;font-size:13px;">Aucune arrivée disponible</div>'; return; }
    el.innerHTML = items.map((i, idx) => {
      const sel   = S.lvu.selectedBcb.has(idx);
      const label = i.client || i.ref || `Arrivée ${idx + 1}`;
      return `<div onclick="App.lvuToggleBcb(${idx})"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #F1F5F9;cursor:pointer;background:${sel?'#EFF6FF':'white'}">
        <div style="width:20px;height:20px;border-radius:4px;border:2px solid ${sel?'#1D4ED8':'#CBD5E1'};background:${sel?'#1D4ED8':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${sel?'<span style="color:white;font-size:12px;">✓</span>':''}
        </div>
        <div style="font-size:13px;color:#1E293B;">${label}</div>
      </div>`;
    }).join('');
  },

  lvuToggleBcb(idx) {
    if (S.lvu.selectedBcb.has(idx)) S.lvu.selectedBcb.delete(idx);
    else S.lvu.selectedBcb.add(idx);
    this._lvuRenderBcbList();
  },

  lvuApplyBcb() {
    const rows = [];
    [...S.lvu.selectedBcb].forEach(idx => {
      const i = S.lvu.bcbArrivals[idx];
      if (i) rows.push({ qte: 1, description: i.client || i.ref || '', poids: '', note: '' });
    });
    if (rows.length) { S.lvu.marchandises = rows; this._lvuRenderMarchandises(); }
    document.getElementById('lvu-bcb-picker').style.display = 'none';
    this.toast(`${rows.length} article(s) importé(s)`);
  },

  _lvuRenderStockList() {
    const el = document.getElementById('lvu-stock-list');
    if (!el) return;
    const q     = (document.getElementById('lvu-stock-search')?.value || '').toLowerCase();
    const items = (S.stockData || []).filter(i =>
      !q || (i.ref || '').toLowerCase().includes(q) || (i.designation || '').toLowerCase().includes(q)
    ).slice(0, 80);
    if (!S.stockData || !S.stockData.length) {
      el.innerHTML = '<div style="padding:12px;color:#94A3B8;font-size:13px;">Catalogue Stockage non chargé — accédez d\'abord à l\'activité Stockage</div>';
      return;
    }
    if (!items.length) { el.innerHTML = '<div style="padding:12px;color:#94A3B8;font-size:13px;">Aucun résultat</div>'; return; }
    el.innerHTML = items.map(i => {
      const key = i.ref || '';
      const sel = (S.lvu.selectedStock || new Set()).has(key);
      return `<div onclick="App.lvuToggleStock('${key.replace(/'/g,"&#39;")}')"
        style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #F1F5F9;cursor:pointer;background:${sel?'#EFF6FF':'white'}">
        <div style="width:20px;height:20px;border-radius:4px;border:2px solid ${sel?'#1D4ED8':'#CBD5E1'};background:${sel?'#1D4ED8':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${sel?'<span style="color:white;font-size:12px;">✓</span>':''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#1E293B;">${i.ref || '—'}</div>
          <div style="font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${i.description || ''}</div>
        </div>
      </div>`;
    }).join('');
  },

  lvuToggleStock(key) {
    if (!S.lvu.selectedStock) S.lvu.selectedStock = new Set();
    if (S.lvu.selectedStock.has(key)) S.lvu.selectedStock.delete(key);
    else S.lvu.selectedStock.add(key);
    this._lvuRenderStockList();
  },

  lvuApplyStock() {
    if (!S.lvu.selectedStock) return;
    const rows = [];
    (S.stockData || []).forEach(i => {
      if (!S.lvu.selectedStock.has(i.ref)) return;
      rows.push({ qte: 1, description: (i.ref ? i.ref + ' - ' : '') + (i.designation || ''), poids: '', note: i.ref || '' });
    });
    if (rows.length) { S.lvu.marchandises = rows; this._lvuRenderMarchandises(); }
    document.getElementById('lvu-stock-picker').style.display = 'none';
    this.toast(`${rows.length} référence(s) importée(s)`);
  },

  _lvuSyncFromDom() {
    // Lit les valeurs actuelles des inputs dans le state avant tout re-rendu
    const tbody = document.getElementById('lvu-marchandises-body');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach((tr, i) => {
      if (!S.lvu.marchandises[i]) return;
      const inputs = tr.querySelectorAll('input[type="number"], input[type="text"]');
      if (inputs[0]) S.lvu.marchandises[i].qte          = inputs[0].value;
      if (inputs[1]) S.lvu.marchandises[i].description  = inputs[1].value;
      if (inputs[2]) S.lvu.marchandises[i].poids        = inputs[2].value;
    });
  },

  _lvuRenderMarchandises() {
    const tbody = document.getElementById('lvu-marchandises-body');
    if (!tbody) return;
    if (!S.lvu.marchandises || !S.lvu.marchandises.length) {
      S.lvu.marchandises = [{ qte: '', description: '', poids: '', note: '' }];
    }
    tbody.innerHTML = S.lvu.marchandises.map((r, i) => {
      const canRemove = S.lvu.marchandises.length > 1;
      return `<tr>
        <td style="padding:3px 2px;"><input type="number" min="1" value="${r.qte||''}"
          style="width:100%;border:1px solid #E2E8F0;border-radius:6px;padding:5px 4px;font-size:12px;outline:none;box-sizing:border-box;"></td>
        <td style="padding:3px 2px;"><input type="text" value="${(r.description||'').replace(/"/g,'&quot;')}"
          style="width:100%;border:1px solid #E2E8F0;border-radius:6px;padding:5px 4px;font-size:12px;outline:none;box-sizing:border-box;"></td>
        <td style="padding:3px 2px;"><input type="number" min="0" step="0.001" value="${r.poids||''}"
          style="width:100%;border:1px solid #E2E8F0;border-radius:6px;padding:5px 4px;font-size:12px;outline:none;box-sizing:border-box;"></td>
        <td style="padding:3px 2px;text-align:center;width:28px;">
          ${canRemove ? `<button onclick="App.lvuRemoveRow(${i})" style="background:none;border:none;color:#EF4444;font-size:16px;cursor:pointer;padding:0 4px;line-height:1;">✕</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  },

  lvuAddRow() {
    if ((S.lvu.marchandises || []).length >= 10) { this.toast('Maximum 10 lignes'); return; }
    this._lvuSyncFromDom();
    if (!S.lvu.marchandises) S.lvu.marchandises = [];
    S.lvu.marchandises.push({ qte: '', description: '', poids: '', note: '' });
    this._lvuRenderMarchandises();
  },

  lvuRemoveRow(i) {
    this._lvuSyncFromDom();
    S.lvu.marchandises.splice(i, 1);
    this._lvuRenderMarchandises();
  },

  _lvuCollectFormData() {
    this._lvuSyncFromDom(); // lit les valeurs DOM avant tout
    const v = id => (document.getElementById(id)?.value || '').trim();
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    const marchandises = (S.lvu.marchandises || [])
      .filter(r => (r.description || '').trim() || (r.qte || '').toString().trim())
      .map(r => ({ qte: r.qte || 1, description: r.description || '', poids: r.poids || '', note: r.note || '', ml: r.ml || '' }));
    let totalPoidsNum = 0, totalML = 0;
    marchandises.forEach(r => {
      const p = parseFloat(r.poids);
      if (!isNaN(p)) totalPoidsNum += p * (Number(r.qte) || 1);
      const m = parseFloat(r.ml);
      if (!isNaN(m)) totalML += m;
    });
    const total = {};
    if (totalPoidsNum > 0) total.poids = parseFloat(totalPoidsNum.toFixed(2)) + ' t';
    if (totalML > 0) total.ml = parseFloat(totalML.toFixed(2)) + ' ml';
    return {
      type:         S.lvu.type || 'LV',
      display:      S.lvu.display || '00000',
      date:         dateStr,
      conducteur:   v('lvu-f-conducteur'),
      immat_moteur: v('lvu-f-immat-moteur').toUpperCase(),
      immat_semi:   v('lvu-f-immat-semi').toUpperCase(),
      donneur_ordre: v('lvu-f-donneur'),
      transporteur: S.lvu.transporteur || LVU_TRANSPORTEURS[0],
      expediteur:   { nom: v('lvu-f-exp-nom'), adresse: v('lvu-f-exp-adresse'), ville: v('lvu-f-exp-ville'), pays: v('lvu-f-exp-pays') || 'FR - France' },
      destinataire: { nom: v('lvu-f-dest-nom'), adresse: v('lvu-f-dest-adresse'), ville: v('lvu-f-dest-ville'), pays: v('lvu-f-dest-pays') },
      marchandises,
      total,
      doc_annexe:   v('lvu-f-doc'),
      commande:     v('lvu-f-commande'),
      remplace:     v('lvu-f-remplace'),
      note:         v('lvu-f-note'),
      livraisonPrevue: (document.getElementById('lvu-f-livraison-check')?.checked && v('lvu-f-livraison-date')) ? v('lvu-f-livraison-date') : '',
      convoi:       document.getElementById('lvu-convoi-oui')?.checked || false,
      source:       S.lvu.source || 'manual',
    };
  },

  async lvuGenerate() {
    if (S.lvu.generating) return;
    S.lvu.generating = true;
    const btnText = document.getElementById('lvu-btn-generate-text');
    if (btnText) btnText.textContent = '⏳ Génération…';
    try {
      if (!S.lvu.numero && S.apiUrl) {
        try {
          const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_next_number', {}, 10000);
          const d = await r.json();
          if (d.status === 'ok') { S.lvu.numero = d.numero; S.lvu.display = d.display; }
        } catch (_) {}
      }
      const data = this._lvuCollectFormData();
      const doc  = _generateLvu(data);
      S.lvu.lastDoc  = doc;
      S.lvu.lastData = data;
      const res   = document.getElementById('lvu-result');
      const title = document.getElementById('lvu-result-title');
      const info  = document.getElementById('lvu-result-info');
      if (res)   res.style.display = '';
      if (title) title.textContent = `✅ ${data.type} N° ${data.display} générée`;
      if (info)  info.textContent  = `${data.date} · ${data.destinataire?.nom || '—'} · ${data.marchandises?.length || 0} ligne(s)`;
      if (document.getElementById('lvu-save-status')) document.getElementById('lvu-save-status').textContent = '';
      res?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      this.toast('Erreur génération : ' + e.message);
    } finally {
      S.lvu.generating = false;
      if (btnText) btnText.textContent = '📄 Générer la lettre de voiture';
    }
  },

  lvuPrint() {
    if (!S.lvu.lastDoc || !S.lvu.lastData) return;
    const d = S.lvu.lastData;
    S.lvu.lastDoc.save(`LV_${d.display}_${(d.destinataire?.nom || 'transport').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
  },

  async lvuSaveToDrive(_renumerote = false) {
    if (!S.lvu.lastDoc || !S.lvu.lastData) return;
    if (!S.apiUrl) { this.toast('URL API non configurée'); return; }
    if (S.lvu.saving && !_renumerote) return;
    if (S.lvu.enregistree && S.lvu.enregistree === S.lvu.lastData.display) { this.toast(`N° ${S.lvu.enregistree} déjà enregistrée`); return; }
    S.lvu.saving = true;
    try { await this._lvuSave(_renumerote); } finally { S.lvu.saving = false; }
  },

  async _lvuSave(_renumerote) {
    const statusEl = document.getElementById('lvu-save-status');
    if (statusEl) statusEl.textContent = '⏳ Enregistrement…';
    const d = S.lvu.lastData;
    try {
      const b64 = S.lvu.lastDoc.output('datauristring').split(',')[1];
      const payload = {
        action: 'lv_save',
        pdf_b64: b64,
        numero_attendu: d.display, // le serveur refuse ('renumber') si le PDF ne porte pas le bon numéro
        type: d.type, conducteur: d.conducteur,
        immat_moteur: d.immat_moteur, immat_semi: d.immat_semi,
        expediteur: d.expediteur?.nom || '', destinataire: d.destinataire?.nom || '',
        doc_annexe: d.doc_annexe || '', commande: d.commande || '',
        note: d.note || '', convoi: d.convoi ? 'Oui' : 'Non',
        livraison_prevue: d.livraisonPrevue || '',
        poids: (d.marchandises || []).reduce((s, r) => s + (parseFloat(r.poids) || 0), 0).toFixed(3),
        ml: parseFloat(d.total?.ml) || '',
        source: d.source || 'manual',
        transporteur_id: d.transporteur?.id || '',
        planning_codes: (d.marchandises || []).map(m => m.note).filter(Boolean),
        marchandises_desc: (d.marchandises || []).map(m => m.description).filter(Boolean).join(', '),
        grutage: this._lvuCalcGrutage(d),
        remplace: d.remplace || '', // LV annulée que celle-ci remplace (lien posé par le serveur)
      };
      // 60s (pas 30s) : _saveLv fait Drive + 2 sheets + Planning multi-fichiers + verrou
      // LockService — dépasse régulièrement 30s, ce qui abortait le fetch côté client
      // AVANT que la réponse 'ok' n'arrive (incident LV 01714, 2026-09-03 : sauvegarde
      // réussie à 100% côté serveur, mais _syncVoyageSupabase jamais appelée car le code
      // qui la déclenche ne tourne que dans le bloc de traitement de la réponse — jamais
      // atteint si le fetch abort avant. Voir CLAUDE_LV.md.
      const r   = await _fetchWithTimeout(S.apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }, 60000);
      const res = await r.json();
      if (res.status === 'renumber' && res.numero && !_renumerote) {
        // Envoi précédent resté sans réponse : le compteur a avancé peut-être parce qu'il
        // a abouti. On le cherche dans l'Archive avant de renuméroter (sinon doublon).
        if (S.lvu.incertain === d.display) {
          const trouvee = await this._lvuChercherDansArchive(d, 1);
          if (trouvee) return this._lvuEnregistree(d, d.display, trouvee.pdfUrl);
        }
        // Le PDF portait un numéro faux (ex. 00000 si lv_next_number avait échoué) :
        // rien n'a été enregistré. On régénère avec le numéro du serveur et on renvoie.
        const data = { ...d, display: res.numero };
        S.lvu.numero = Number(res.numero); S.lvu.display = res.numero;
        S.lvu.lastDoc  = _generateLvu(data);
        S.lvu.lastData = data;
        S.lvu.incertain = null;
        const t = document.getElementById('lvu-result-title');
        if (t) t.textContent = `✅ ${data.type} N° ${data.display} générée`;
        return this._lvuSave(true);
      }
      if (res.status === 'ok') {
        await this._lvuEnregistree(d, res.numero || d.display, res.pdfUrl, res.remplace_erreur);
      } else if (res.status === 'partial') {
        // PDF envoyé sur Drive mais jamais archivé (numéro/compteur non mis à
        // jour côté serveur) — ne JAMAIS traiter comme un succès : pas de sync
        // Supabase (donnée non fiable, cause de l'incident LV 01711 du
        // 2026-09-03), pas de reset de l'état pour permettre un nouvel essai propre.
        if (statusEl) statusEl.textContent = '⚠️ PDF envoyé mais NON archivé (' + (res.error || 'erreur inconnue') + ') — réessayez, ce n\'est PAS enregistré.';
        this.toast('⚠️ Échec archivage — réessayez l\'enregistrement', 6000);
      } else {
        if (statusEl) statusEl.textContent = '❌ ' + (res.error || 'erreur inconnue');
      }
    } catch (e) {
      // Délai dépassé ou coupure réseau : Apps Script a souvent fini malgré tout.
      // On regarde l'Archive avant de laisser recommencer.
      if (statusEl) statusEl.textContent = '⏳ Pas de réponse du serveur — vérification dans l\'archive…';
      const trouvee = await this._lvuChercherDansArchive(d, 3);
      if (trouvee) return this._lvuEnregistree(d, d.display, trouvee.pdfUrl);
      S.lvu.incertain = d.display;
      if (statusEl) statusEl.textContent = `⚠️ ${d.type} N° ${d.display} introuvable dans l'archive pour l'instant (${e.message}). `
        + 'Vous pouvez réessayer : si elle a été enregistrée entre-temps, aucun doublon ne sera créé.';
    }
  },

  // Cherche la LV dans l'Archive (lv_history = source de vérité) : même numéro, même
  // type, même destinataire — un collègue a pu prendre ce numéro entre-temps.
  async _lvuChercherDansArchive(d, essais) {
    const norm = s => String(s || '').trim().toLowerCase();
    for (let i = 0; i < essais; i++) {
      if (i > 0) await _sleep(8000);
      try {
        const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_history&limit=15', {}, 20000);
        const h = (await r.json()).history || [];
        const x = h.find(l => Number(l.numero) === Number(d.display)
          && norm(l.type || 'LV') === norm(d.type || 'LV')
          && norm(l.destinataire) === norm(d.destinataire?.nom));
        if (x) return x;
      } catch (_) {}
    }
    return null;
  },

  async _lvuEnregistree(d, savedDisplay, pdfUrl, remplaceErreur) {
    const statusEl = document.getElementById('lvu-save-status');
    if (statusEl) statusEl.textContent = `✅ N° ${savedDisplay} enregistré sur Drive`
      + (d.remplace ? (remplaceErreur ? ` — ⚠️ lien avec la LV annulée ${d.remplace} non fait : ${remplaceErreur}` : ` — remplace la LV annulée ${d.remplace}`) : '');
    if (d.remplace) this._lvuChargerAnnulees();
    S.lvu.numero = null; S.lvu.display = null; S.lvu.incertain = null;
    S.lvu.enregistree = d.display; // un second clic ne crée pas de doublon
    if (document.getElementById('lvu-result-title')) document.getElementById('lvu-result-title').textContent = `✅ ${d.type} N° ${savedDisplay} enregistrée`;
    this.toast(`LV N° ${savedDisplay} enregistrée !`);
    this._syncVoyageSupabase(d, savedDisplay, pdfUrl); // portail transporteur — best-effort, ne bloque jamais le flux principal
    if (S.lvu.fromOpKey) {
      this._saveLvLinkRemote(S.lvu.fromOpKey, savedDisplay, savedDisplay);
      S.lvu.fromOpKey = null; S.lvu.fromOpNote = '';
    }
    // Lier la CMR à son bon d'enlèvement si applicable
    if (S.lvu.enlevementNumero && pdfUrl) {
      try {
        await _fetchWithTimeout(S.apiUrl, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'bcb_enlevement_update_cmr',
            numero: S.lvu.enlevementNumero, cmrNumero: savedDisplay, cmrUrl: pdfUrl })
        }, 10000);
        // Mettre à jour l'entrée en mémoire
        const ei = S.bcbEnlevements.findIndex(e => e.numero === S.lvu.enlevementNumero);
        if (ei > -1) { S.bcbEnlevements[ei].cmrNumero = savedDisplay; S.bcbEnlevements[ei].cmrUrl = pdfUrl; }
        if (S.bcbCurEnlevement?.numero === S.lvu.enlevementNumero) {
          S.bcbCurEnlevement.cmrNumero = savedDisplay; S.bcbCurEnlevement.cmrUrl = pdfUrl;
        }
      } catch(_) {}
      S.lvu.enlevementNumero = null;
    }
  },

  // ── Portail transporteur — synchro Supabase (temps réel) ────────────────────
  // Appelée juste après le succès de l'enregistrement AppScript/Drive existant.
  // Best-effort : une erreur ici ne doit jamais bloquer ni afficher d'erreur
  // dans le flux principal de création de LV — seule une trace console suffit.
  _lvuCalcGrutage(d) {
    return (S.lvu.loxamItems || []).some(i => {
      const key = i.code || i.codeModule || i.module || '';
      return (d.marchandises || []).some(m => m.note === key) && i.status && i.status.grutage;
    });
  },

  // Géocodage réel de l'adresse de destination (Nominatim/OpenStreetMap, même
  // fournisseur que la carte du portail — pas de clé API). Un seul appel par
  // création de LV (jamais en boucle/bulk), résultat mis en cache dans
  // Supabase (destination_lat/lon) — respecte la politique d'usage Nominatim
  // (max 1 req/s, pas de géocodage répété). Best-effort : si le géocodage
  // échoue ou ne trouve rien, le portail retombe sur la table VILLES.
  async _geocodeAdresse(adresse) {
    if (!adresse || !S.apiUrl) return null;
    try {
      // Passe par api/geocode.js (même déploiement Vercel que S.apiUrl) plutôt
      // que d'appeler Nominatim directement depuis le navigateur : le WiFi
      // SONOTRAD bloque les fetch() vers des domaines externes non familiers
      // (même raison d'être que api/proxy.js pour Apps Script — voir
      // CLAUDE_PORTAIL.md).
      const geocodeUrl = new URL(S.apiUrl).origin + '/api/geocode';
      const r = await fetch(geocodeUrl + '?q=' + encodeURIComponent(adresse));
      const data = await r.json();
      if (data && data[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch (e) {
      console.warn('[_geocodeAdresse] échec :', e.message);
    }
    return null;
  },

  async _syncVoyageSupabase(d, numero, pdfUrl) {
    if (!S.apiUrl || !numero) return;
    try {
      const destinationAdresse = [d.destinataire?.adresse, d.destinataire?.ville].filter(Boolean).join(', ');
      // Repli sur la ville seule si l'adresse complète ne donne aucun résultat
      // (formats "ZA ... - B.P ..." fréquents en zone industrielle, que
      // Nominatim ne sait pas toujours parser) — mieux vaut un point centre-
      // ville précis que pas de coordonnées du tout.
      const geo = (await this._geocodeAdresse(destinationAdresse))
        || (await this._geocodeAdresse(d.destinataire?.ville));
      // Réutilise d.total.poids (déjà calculé par _lvuCollectFormData, qté incluse)
      // plutôt que de recalculer — ce total est celui affiché sur la LV générée.
      // Écrit par Apps Script (clé secrète) : enregistrer_voyage n'accepte plus la clé publique.
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:       'voyage_enregistrer',
          p_numero_lv:    String(numero),
          p_type:         d.type || 'LV',
          p_destination:  d.destinataire?.nom || '',
          p_doc_annexe:   d.doc_annexe || '',
          p_commande:     d.commande || '',
          p_commentaire:  d.note || '',
          p_poids:        parseFloat(d.total?.poids) || null,
          p_ml:           parseFloat(d.total?.ml) || null,
          p_grutage:      this._lvuCalcGrutage(d),
          p_transporteur: d.transporteur?.nom || d.transporteur?.id || '',
          // BCB : la CMR est créée au moment du départ du matériel (contrairement
          // à LOXAM, créée en avance) — donc déjà parti à la création.
          p_parti:        d.source === 'bcb',
          p_marchandises_desc:   (d.marchandises || []).map(m => m.description).filter(Boolean).join(', '),
          p_destination_adresse: destinationAdresse,
          p_destination_lat:     geo?.lat ?? null,
          p_destination_lon:     geo?.lon ?? null,
          // Champs internes (jamais exposés au portail public) — pour l'essai
          // Historique via Supabase, voir CLAUDE_PORTAIL.md.
          p_conducteur:   d.conducteur || '',
          p_immat_moteur: d.immat_moteur || '',
          p_immat_semi:   d.immat_semi || '',
          p_expediteur:   d.expediteur?.nom || '',
          p_convoi:       !!d.convoi,
          p_pdf_url:      pdfUrl || '',
          p_livraison_prevue: d.livraisonPrevue || null,
        })
      }, 30000);
      const res = await r.json();
      if (res.status !== 'ok' || res.portail_ok === false) console.warn('[_syncVoyageSupabase] portail non synchronisé :', res.error || 'refus Supabase');
    } catch (e) {
      console.warn('[_syncVoyageSupabase] portail non synchronisé :', e.message);
    }
  },

  lvuSelectTransporteur(idx) {
    // Copie de l'objet pour ne pas muter le tableau LVU_TRANSPORTEURS
    S.lvu.transporteur = Object.assign({}, LVU_TRANSPORTEURS[idx]) || null;
    this._lvuRenderTransporteurUI();
  },

  lvuUpdateTransporteurField(field, val) {
    if (S.lvu.transporteur?.id === 'autre') S.lvu.transporteur[field] = val;
  },

  _lvuRenderTransporteurUI() {
    const el = document.getElementById('lvu-transporteur-btns');
    if (!el) return;
    const selId = S.lvu.transporteur?.id;
    const tl    = S.lvu.transporteur || {};
    let html = LVU_TRANSPORTEURS.map((t, i) => {
      const sel = selId === t.id;
      const subtitle = t.id === 'autre'
        ? (sel && tl.nom ? `<div style="font-size:11px;color:#64748B;margin-top:2px;">${tl.nom}</div>` : '')
        : `<div style="font-size:11px;color:#64748B;margin-top:2px;">${t.adresse} · ${t.ville}</div>`;
      return `<button onclick="App.lvuSelectTransporteur(${i})"
        style="text-align:left;width:100%;padding:10px 12px;border-radius:10px;border:2px solid ${sel?'#1D4ED8':'#E2E8F0'};background:${sel?'#EFF6FF':'white'};cursor:pointer;margin-bottom:4px;">
        <div style="font-size:13px;font-weight:700;color:${sel?'#1D4ED8':'#1E293B'};">${t.id === 'autre' ? 'Autre transporteur' : t.nom}</div>
        ${subtitle}
      </button>`;
    }).join('');
    if (selId === 'autre') {
      const esc = s => (s || '').replace(/"/g, '&quot;');
      html += `<div style="margin-top:4px;display:flex;flex-direction:column;gap:6px;">
        <input class="input-field" placeholder="Nom du transporteur *" value="${esc(tl.nom)}"
          oninput="App.lvuUpdateTransporteurField('nom',this.value)" style="font-size:13px;">
        <input class="input-field" placeholder="Adresse (optionnel)" value="${esc(tl.adresse)}"
          oninput="App.lvuUpdateTransporteurField('adresse',this.value)" style="font-size:13px;">
        <input class="input-field" placeholder="CP / Ville (optionnel)" value="${esc(tl.ville)}"
          oninput="App.lvuUpdateTransporteurField('ville',this.value)" style="font-size:13px;">
        <div style="display:flex;gap:6px;">
          <input class="input-field" placeholder="SIRET (optionnel)" value="${esc(tl.siret)}"
            oninput="App.lvuUpdateTransporteurField('siret',this.value)" style="font-size:13px;flex:1;">
          <input class="input-field" placeholder="Téléphone (optionnel)" value="${esc(tl.telephone)}"
            oninput="App.lvuUpdateTransporteurField('telephone',this.value)" style="font-size:13px;flex:1;">
        </div>
      </div>`;
    }
    el.innerHTML = html;
  },

  async lvuLoadAgencies() {
    if (S.lvu.agencies.length > 0 || !S.apiUrl) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_agencies', {}, 10000);
      const d = await r.json();
      if (d.status === 'ok') S.lvu.agencies = d.agencies || [];
    } catch (_) {}
  },

  lvuDestSearch(val) {
    const q   = val.trim().toLowerCase();
    const res = document.getElementById('lvu-dest-results');
    if (!res) return;
    if (!q) { res.style.display = 'none'; res.innerHTML = ''; return; }
    if (!S.lvu.agencies.length) { this.lvuLoadAgencies(); }
    const hits = S.lvu.agencies.filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.nom.toLowerCase().includes(q)  ||
      a.ville.toLowerCase().includes(q)
    ).slice(0, 10);
    if (!hits.length) {
      res.innerHTML = '<div style="padding:10px 12px;color:#94A3B8;font-size:12px;">Aucun résultat</div>';
      res.style.display = 'block';
      return;
    }
    res.innerHTML = hits.map((a, i) => `
      <div class="dest-result-row" onclick="App.lvuDestSelect(${S.lvu.agencies.indexOf(a)})">
        <span style="font-size:11px;font-weight:700;color:#1D4ED8;min-width:38px;">${a.code}</span>
        <span style="font-size:13px;color:#1E293B;flex:1;">${a.nom}</span>
        <span style="font-size:11px;color:#64748B;">${a.cp} ${a.ville}</span>
      </div>`).join('');
    res.style.display = 'block';
  },

  lvuDestSelect(idx) {
    const a = S.lvu.agencies[idx];
    if (!a) return;
    const fn = document.getElementById('lvu-f-dest-nom');
    const fa = document.getElementById('lvu-f-dest-adresse');
    const fv = document.getElementById('lvu-f-dest-ville');
    const fs = document.getElementById('lvu-dest-search');
    const fr = document.getElementById('lvu-dest-results');
    const fp = document.getElementById('lvu-f-dest-pays');
    if (fn) fn.value = a.nom;
    if (fa) fa.value = a.adresse;
    if (fv) fv.value = `${a.cp} ${a.ville}`.trim();
    if (fp) fp.value = a.pays || 'FR - France';
    if (fs) fs.value = '';
    if (fr) { fr.style.display = 'none'; fr.innerHTML = ''; }
  },

  lvuNew() {
    S.lvu.lastDoc = null; S.lvu.lastData = null;
    S.lvu.marchandises = [];
    S.lvu.fromOpKey = null; S.lvu.fromOpNote = '';
    S.lvu.enlevementNumero = null;
    S.lvu.selectedItems.clear(); S.lvu.selectedBcb.clear();
    if (S.lvu.selectedStock) S.lvu.selectedStock.clear();
    const res = document.getElementById('lvu-result');
    if (res) res.style.display = 'none';
    const ds = document.getElementById('lvu-dest-search'); if (ds) ds.value = '';
    const dr = document.getElementById('lvu-dest-results'); if (dr) { dr.style.display = 'none'; dr.innerHTML = ''; }
    ['lvu-f-conducteur','lvu-f-immat-moteur','lvu-f-immat-semi','lvu-f-donneur',
     'lvu-f-exp-nom','lvu-f-exp-adresse','lvu-f-exp-ville','lvu-f-exp-pays',
     'lvu-f-dest-nom','lvu-f-dest-adresse','lvu-f-dest-ville','lvu-f-dest-pays',
     'lvu-f-doc','lvu-f-commande','lvu-f-remplace','lvu-f-note','lvu-f-livraison-date'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const nonEl = document.getElementById('lvu-convoi-non');
    if (nonEl) nonEl.checked = true;
    const livCb = document.getElementById('lvu-f-livraison-check');
    if (livCb) livCb.checked = false;
    const livDate = document.getElementById('lvu-f-livraison-date');
    if (livDate) livDate.style.display = 'none';
    this._lvuRenderMarchandises();
    const v = document.getElementById('view-lvu-form'); if (v) v.scrollTop = 0;
  },

  async lvuLoadHistory() {
    if (!S.apiUrl) {
      document.getElementById('lvu-history-list').innerHTML =
        '<div style="padding:20px;color:#94A3B8;text-align:center;">URL API non configurée</div>';
      return;
    }
    const el = document.getElementById('lvu-history-list');
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#94A3B8;font-size:14px;">Chargement…</div>';
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=lv_history_supabase&limit=100', {}, 15000);
      const d    = await r.json();
      S.lvuHistoryRows = d.history || d.rows || [];
      this._renderLvHistoryList();
    } catch (e) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#EF4444;font-size:13px;">Erreur : ${e.message}</div>`;
    }
  },

  // ── Actualisation en direct de l'Historique ──────────────────────────────
  // L'Historique lit l'Archive Google Sheet via Apps Script (pas Supabase),
  // donc on ne peut pas rendre directement depuis le payload Realtime — mais
  // les 3 chemins qui touchent le statut Parti (case Départs, toggle
  // Historique, marquage en masse Départs) écrivent tous dans Supabase, donc
  // un changement sur la table voyages est un signal fiable pour refaire un
  // fetch complet (comme le fait le portail transporteur). Débounce léger
  // pour éviter une rafale de refetch si plusieurs lignes changent d'un coup.
  _lvuSubscribeHistoryRealtime() {
    if (S.lvuHistoryRealtimeChannel || !window.SupabaseDB) return;
    S.lvuHistoryRealtimeChannel = window.SupabaseDB
      .channel('lvu-history-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voyages' }, () => {
        clearTimeout(S.lvuHistoryRealtimeDebounce);
        S.lvuHistoryRealtimeDebounce = setTimeout(() => this.lvuLoadHistory(), 1200);
      })
      .subscribe();
  },

  _lvuUnsubscribeHistoryRealtime() {
    clearTimeout(S.lvuHistoryRealtimeDebounce);
    if (S.lvuHistoryRealtimeChannel) {
      window.SupabaseDB?.removeChannel(S.lvuHistoryRealtimeChannel);
      S.lvuHistoryRealtimeChannel = null;
    }
  },

  // Note encodée en préfixe texte à la création (voir _lvuCollectFormData /
  // masterfile _saveLv) — même convention pour décoder.
  _lvuParseNote(raw) {
    const marker = '!!! GRUTAGE A LA LIVRAISON !!!';
    const text = String(raw || '');
    if (text.startsWith(marker)) {
      return { grutage: true, commentaire: text.slice(marker.length).replace(/^\n/, '') };
    }
    return { grutage: false, commentaire: text };
  },

  lvuSetHistoryFilter(filter) {
    S.lvuHistoryFilter = filter;
    document.querySelectorAll('#lvu-history-filters button').forEach(b => {
      const active = b.dataset.filter === filter;
      b.style.background = active ? '#1E293B' : 'white';
      b.style.color      = active ? 'white'   : '#475569';
    });
    this._renderLvHistoryList();
  },

  _renderLvHistoryList() {
    const el     = document.getElementById('lvu-history-list');
    const filter = S.lvuHistoryFilter || 'disponibles';
    const all    = S.lvuHistoryRows || [];
    const rows   = all.filter(row => {
      if (filter === 'disponibles') return !row.annulee && !row.parti;
      if (filter === 'partis')      return !row.annulee && !!row.parti;
      if (filter === 'annulees')    return !!row.annulee;
      return true;
    });
    // Seule la dernière LV créée peut être supprimée (pas de trou dans la numérotation) ;
    // les autres s'annulent. Le serveur refuse de toute façon.
    const dernier = all.reduce((m, r) => (Number(r.numero) > Number(m?.numero || 0) ? r : m), null);
    const supprimable = dernier && !dernier.annulee ? String(dernier.numero) : null;
    if (!rows.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:#94A3B8;font-size:14px;">Aucun document trouvé</div>';
      return;
    }
    el.innerHTML = `
      <div style="overflow-x:auto;max-height:70vh;">
      <table class="lvu-hist-table">
        <thead>
          <tr>
            ${['LV','Créée le','Destinataire','Marchandise','Conducteur','Commande','Note','Grutage','Livraison prévue','Parti','Actions']
              .map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const { grutage, commentaire } = this._lvuParseNote(row.note);
            const ann = row.annulee
              ? `Annulée le ${row.annulee_le || '?'}${row.annulee_par ? ' par ' + row.annulee_par : ''} : ${row.annulation_motif || ''}${row.remplacee_par ? ' — remplacée par n° ' + row.remplacee_par : ''}`
              : '';
            return `
            <tr class="${row.annulee ? 'lvu-hist-annulee' : row.parti ? 'lvu-hist-parti' : ''}">
              <td style="white-space:nowrap;"><strong>${row.numero||'—'}</strong><span class="lvu-hist-type">${row.type||'LV'}</span>${row.remplace ? `<div style="font-size:10px;color:#64748B;">remplace n° ${this._escHtml(row.remplace)}</div>` : ''}</td>
              <td style="white-space:nowrap;color:#64748B;">${row.date||''}</td>
              <td class="ellipsis" title="${row.destinataire||''}">
                ${row.destinataire||'—'}
                ${row.expediteur && row.expediteur !== 'SONOTRAD' ? `<div style="font-size:10px;color:#94A3B8;">${row.expediteur}</div>` : ''}
                ${ann ? `<div style="font-size:10.5px;color:#B91C1C;white-space:normal;">${this._escHtml(ann)}</div>` : ''}
              </td>
              <td class="ellipsis" style="color:#475569;" title="${row.marchandises_desc||''}">${row.marchandises_desc||'<span style="color:#CBD5E1;">-</span>'}</td>
              <td style="white-space:nowrap;color:#94A3B8;">${row.conducteur?`${row.conducteur} · ${row.immat_moteur||''}`:'-'}</td>
              <td style="white-space:nowrap;color:#94A3B8;">${row.commande||'-'}</td>
              <td class="ellipsis" style="color:#92400E;font-style:italic;" title="${commentaire}">${commentaire||'<span style="color:#CBD5E1;font-style:normal;">-</span>'}</td>
              <td style="white-space:nowrap;">${grutage?'<span style="font-size:10.5px;font-weight:700;background:#FEF3C7;color:#92400E;border-radius:6px;padding:2px 7px;">grutage</span>':'<span style="color:#CBD5E1;">-</span>'}</td>
              <td style="white-space:nowrap;color:#1D4ED8;">${row.livraison_prevue||'<span style="color:#CBD5E1;">-</span>'}</td>
              <td style="white-space:nowrap;">${row.annulee?'<span style="font-size:10.5px;font-weight:700;color:#B91C1C;">⊘ Annulée</span>':row.parti?'<span style="font-size:10.5px;font-weight:700;color:#64748B;">🚚 Parti</span>':'<span style="font-size:10.5px;font-weight:700;color:#15803D;">✅ Dispo</span>'}</td>
              <td style="white-space:nowrap;">
                <div style="display:flex;align-items:center;gap:6px;">
                  ${row.pdfUrl?`<a href="${row.pdfUrl}" target="_blank" rel="noopener" title="PDF" class="lvu-hist-action pdf">📄</a>`:''}
                  ${row.annulee ? (row.remplacee_par ? '' : `<button onclick="App.openLvLinkModal('${row.numero}')" title="Lier à la LV qui la remplace" class="lvu-hist-action">🔗</button>`) : `
                  <button onclick="App.openLvNoteModal('${row.numero}')" title="Éditer note/grutage" class="lvu-hist-action">✏️</button>
                  <button onclick="App.lvuTogglePartiHistory('${row.numero}', ${row.parti===true}, this)" title="${row.parti?'Remettre disponible':'Marquer parti'}" class="lvu-hist-action">${row.parti?'↩':'🚚'}</button>
                  <button onclick="App.openLvCancelModal('${row.numero}')" title="Annuler (reste dans l'historique)" class="lvu-hist-action delete">⊘</button>
                  ${String(row.numero) === supprimable ? `<button onclick="App.lvuDeleteLv('${row.numero}')" title="Supprimer (dernière LV créée : son numéro sera repris)" class="lvu-hist-action delete">🗑</button>` : ''}`}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>`;
  },

  async lvuDeleteLv(numero) {
    if (!confirm(`Supprimer la LV ${numero} (la dernière créée) ?\n\nElle disparaît de l'historique, le PDF part à la corbeille et la prochaine LV reprendra ce numéro.\nSi elle a déjà été remise au chauffeur, utilisez plutôt « Annuler » (⊘).`)) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lv_delete', numero })
      }, 40000);
      const d = await r.json();
      if (d.status === 'ok') {
        this.toast('LV N° ' + numero + ' supprimée');
        // Nettoyer le lien CMR en mémoire dans les enlèvements BCB
        S.bcbEnlevements.forEach(e => { if (e.cmrNumero === numero) { e.cmrNumero = ''; e.cmrUrl = ''; } });
        if (S.bcbCurEnlevement?.cmrNumero === numero) { S.bcbCurEnlevement.cmrNumero = ''; S.bcbCurEnlevement.cmrUrl = ''; }
        this.lvuLoadHistory();
      } else this.toast('Erreur : ' + (d.error || 'inconnue'));
    } catch(e) { this.toast('Erreur : ' + e.message); }
  },

  // Liste « Remplace la LV annulée » : seulement les annulées sans remplaçante, pour ne
  // pas pouvoir lier n'importe quelle LV. Le serveur revérifie de toute façon.
  async _lvuChargerAnnulees() {
    const sel = document.getElementById('lvu-f-remplace');
    if (!sel || !S.apiUrl) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_history_supabase&limit=50', {}, 15000);
      const d = await r.json();
      if (d.status !== 'ok') return;
      S.lvuHistoryRows = d.history || [];
      const libres = S.lvuHistoryRows.filter(x => x.annulee && !x.remplacee_par);
      const garde = sel.value;
      sel.innerHTML = `<option value="">${libres.length ? '— Aucune —' : 'Aucune LV annulée à remplacer'}</option>`
        + libres.map(x => `<option value="${this._escHtml(x.numero)}">${this._escHtml(`${x.type || 'LV'} ${x.numero} — ${x.destinataire || ''} (${x.annulation_motif || 'annulée'})`)}</option>`).join('');
      sel.disabled = !libres.length;
      if (libres.some(x => String(x.numero) === garde)) sel.value = garde;
    } catch (_) {}
  },

  openLvLinkModal(numero) {
    const rows = S.lvuHistoryRows || [];
    const row = rows.find(r => String(r.numero) === String(numero));
    if (!row) return;
    S._lvLinkNumero = numero;
    document.getElementById('lvlink-modal-ref').textContent = `${row.type||'LV'} N° ${row.numero} — ${row.destinataire||''} (annulée)`;
    const cands = rows.filter(r => !r.annulee && Number(r.numero) > Number(numero))
      .sort((a, b) => Number(b.numero) - Number(a.numero));
    const sel = document.getElementById('lvlink-modal-select');
    sel.innerHTML = cands.length
      ? cands.map(r => `<option value="${this._escHtml(r.numero)}">${this._escHtml(`${r.type||'LV'} ${r.numero} — ${r.destinataire||''} — ${r.marchandises_desc||''}`)}</option>`).join('')
      : '<option value="">Aucune LV plus récente</option>';
    document.getElementById('lvlink-modal').style.display = 'flex';
  },

  closeLvLinkModal() {
    document.getElementById('lvlink-modal').style.display = 'none';
    S._lvLinkNumero = null;
  },

  async saveLvLinkModal() {
    const annulee = S._lvLinkNumero;
    const remplacante = document.getElementById('lvlink-modal-select').value;
    if (!annulee || !remplacante) return;
    const btn = document.getElementById('lvlink-modal-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lv_link_replacement', annulee, remplacante })
      }, 30000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur inconnue');
      this.toast(`LV ${annulee} remplacée par ${remplacante}`);
      this.closeLvLinkModal();
      this.lvuLoadHistory();
    } catch (e) {
      this.toast('Erreur : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔗 Lier'; }
    }
  },

  // ── Annulation : la LV reste dans l'historique (motif, auteur, remplaçante) ──
  openLvCancelModal(numero) {
    const row = (S.lvuHistoryRows || []).find(r => String(r.numero) === String(numero));
    if (!row) return;
    S._lvCancelNumero = numero;
    const refEl = document.getElementById('lvcancel-modal-ref');
    if (refEl) refEl.textContent = `${row.type||'LV'} N° ${row.numero} — ${row.destinataire||''}`;
    document.getElementById('lvcancel-modal-motif').value = '';
    document.getElementById('lvcancel-modal').style.display = 'flex';
  },

  closeLvCancelModal() {
    document.getElementById('lvcancel-modal').style.display = 'none';
    S._lvCancelNumero = null;
  },

  async saveLvCancelModal() {
    const numero = S._lvCancelNumero;
    if (!numero) return;
    const motif = document.getElementById('lvcancel-modal-motif').value.trim();
    if (!motif) { this.toast('Le motif est obligatoire'); return; }
    const btn = document.getElementById('lvcancel-modal-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lv_cancel', numero, motif })
      }, 40000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur inconnue');
      S.bcbEnlevements.forEach(e => { if (e.cmrNumero === numero) { e.cmrNumero = ''; e.cmrUrl = ''; } });
      if (S.bcbCurEnlevement?.cmrNumero === numero) { S.bcbCurEnlevement.cmrNumero = ''; S.bcbCurEnlevement.cmrUrl = ''; }
      const lib = (d.liberes || []).length ? ` — module(s) libéré(s) : ${d.liberes.join(', ')}` : '';
      this.toast(`LV N° ${numero} annulée${lib}${d.portail_ok === false ? ' (portail non synchronisé)' : ''}`, 5000);
      this.closeLvCancelModal();
      this.lvuLoadHistory();
    } catch (e) {
      this.toast('Erreur : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⊘ Annuler cette LV'; }
    }
  },

  // ── Édition note/grutage depuis l'Historique (sans toucher au PDF déjà généré) ──
  openLvNoteModal(numero) {
    const row = (S.lvuHistoryRows || []).find(r => String(r.numero) === String(numero));
    if (!row) return;
    S._lvNoteModalNumero = numero;
    const { grutage, commentaire } = this._lvuParseNote(row.note);
    const refEl = document.getElementById('lvnote-modal-ref');
    if (refEl) refEl.textContent = `${row.type||'LV'} N° ${row.numero} — ${row.destinataire||''}`;
    const ta = document.getElementById('lvnote-modal-textarea');
    if (ta) { ta.value = commentaire; }
    const cb = document.getElementById('lvnote-modal-grutage');
    if (cb) cb.checked = grutage;
    const dateEl = document.getElementById('lvnote-modal-livraison');
    if (dateEl) dateEl.value = _toIsoDateInput(row.livraison_prevue);
    const modal = document.getElementById('lvnote-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeLvNoteModal() {
    const modal = document.getElementById('lvnote-modal');
    if (modal) modal.style.display = 'none';
    S._lvNoteModalNumero = null;
  },

  async saveLvNoteModal() {
    const numero = S._lvNoteModalNumero;
    if (!numero) return;
    const commentaire = document.getElementById('lvnote-modal-textarea')?.value.trim() || '';
    const grutage     = document.getElementById('lvnote-modal-grutage')?.checked === true;
    const livraisonPrevue = document.getElementById('lvnote-modal-livraison')?.value || '';
    const btn = document.getElementById('lvnote-modal-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lv_update_note', numero, commentaire, grutage, livraison_prevue: livraisonPrevue })
      }, 20000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur inconnue (tableur)');

      // Portail transporteur (Supabase) : mis à jour par le serveur (lv_update_note).
      // Un échec reste visible (voyage inconnu de Supabase, ou erreur).
      const portailKo = d.portail_ok === false;

      this.toast(portailKo
        ? 'Note mise à jour (tableur) — portail non synchronisé'
        : 'Note mise à jour pour ' + numero);
      this.closeLvNoteModal();
      this.lvuLoadHistory();
    } catch (e) {
      this.toast('Erreur : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Enregistrer'; }
    }
  },

  // ── Marquer/démarquer "Parti" depuis l'Historique ────────────────────────
  async lvuTogglePartiHistory(numero, currentParti, btn) {
    // Bouton bloqué pendant l'appel (quelques secondes) pour éviter les clics répétés.
    if (btn && btn.disabled) return;
    const btnHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.innerHTML = '⏳'; }
    const nextParti = !currentParti;
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lv_mark_parti_by_numero', numero, parti: nextParti })
      }, 20000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'erreur inconnue (tableur)');

      // Portail transporteur (Supabase) : mis à jour par le serveur (lv_mark_parti_by_numero).
      const portailKo = d.portail_ok === false;

      const label = nextParti ? 'LV ' + numero + ' marquée partie' : 'LV ' + numero + ' remise disponible';
      this.toast(portailKo ? label + ' (tableur) — portail non synchronisé' : label);
      this.lvuLoadHistory();
    } catch (e) {
      this.toast('Erreur : ' + e.message);
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.style.opacity = ''; btn.innerHTML = btnHtml; }
    }
  },
});

// ── LVU — Transporteurs pré-enregistrés ──────────────────────────────────────
const LVU_TRANSPORTEURS = [
  { id: 'mesnager', nom: 'TRANSPORTS MESNAGER', adresse: 'ZA Renardière - B.P 10', ville: '53250 JAVRON-LES-CHAPELLES', info: 'SAS au capital de 500 000 €, Tél. 02.43.03.43.41', rcs: 'RCS LAVAL 314 901 869 - N° TVA FR 18 314 901 869' },
  { id: 'autre', nom: '', adresse: '', ville: '', siret: '', telephone: '' },
];


// ── LVU — Lettre de Voiture Unique (jsPDF) ───────────────────────────────────
// data = { type:'LV'|'CMR', display:'01446', date:'24/04/2026',
//   conducteur, immat_moteur, immat_semi, donneur_ordre,
//   transporteur:{nom,adresse,ville,info,tel,rcs},
//   expediteur:{nom,adresse,ville}, destinataire:{nom,adresse,ville},
//   marchandises:[{qte,description,poids,note}],
//   doc_annexe, commande, note, convoi:bool }
function _generateLvu(data) {
  const { jsPDF } = window.jspdf;
  const isCMR = (data.type || 'LV').toUpperCase() === 'CMR';
  const BANDS = [
    { rgb: [192, 57, 43],  label: 'ORIGINAL 1 - EXPÉDITEUR / SENDER' },
    { rgb: [39, 174, 96],  label: 'ORIGINAL 2 - ACCOMPAGNE LA MARCHANDISE / WITH THE GOODS' },
    { rgb: [41, 128, 185], label: 'ORIGINAL 3 - TRANSPORTEUR / CARRIER' },
  ];
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  for (let c = 0; c < 3; c++) {
    if (c > 0) doc.addPage();
    _lvuRecto(doc, data, isCMR, BANDS[c]);
    doc.addPage();
    _lvuVerso(doc);
  }
  return doc;
}

function _lvuRecto(doc, d, isCMR, band) {
  const x0 = LV.MARGIN;
  const CW = LV.CONTENT_W;
  const rx = x0 + LV.TOP_LEFT_W;   // X colonne droite (N° + DATE)

  const sf  = (s, z) => { doc.setFont('helvetica', s); doc.setFontSize(z); };
  const fc  = (...c) => doc.setFillColor(...c);
  const tc  = (...c) => doc.setTextColor(...c);
  const dc  = (...c) => doc.setDrawColor(...c);
  const lw  = w  => doc.setLineWidth(w);
  const bx  = (x, y, w, h, s = 'S') => doc.rect(x, y, w, h, s);
  const ln  = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2);
  const tx  = (t, x, y, a = 'left') => doc.text(String(t ?? ''), x, y, { align: a });
  const sp  = (t, w) => doc.splitTextToSize(String(t ?? ''), w);
  const vc  = (y, h, s) => y + h / 2 + s * 0.176;
  const chk = (x, cy, sz, on) => {
    bx(x, cy, sz, sz);
    if (on) { ln(x + .5, cy + .5, x + sz - .5, cy + sz - .5); ln(x + sz - .5, cy + .5, x + .5, cy + sz - .5); }
  };
  dc(0, 0, 0); tc(0, 0, 0); lw(LV.STROKE_INTRA);
  let y = LV.Y_TITLE;

  // ── Bande CMR colorée (exemplaires multiples) ────────────────────────────
  if (band) {
    fc(...band.rgb); bx(x0, y, CW, 6, 'F');
    tc(...LV.COLOR_WHITE); sf('bold', LV.FONT_MARC_ROW);
    tx(band.label, x0 + CW / 2, y + 4.3, 'center');
    tc(0, 0, 0); y += 7;
  }

  // ═══ ZONE SUPÉRIEURE : col. gauche (TOP_LEFT_W) + col. droite (TOP_RIGHT_W)

  // ── Section 1 : Titre (zone gauche) ─────────────────────────────────────
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  fc(...LV.COLOR_PRIMARY); bx(x0, y, LV.TOP_LEFT_W, LV.H_TITLE, 'FD');
  tc(...LV.COLOR_WHITE); sf('bold', LV.FONT_TITLE_MAIN);
  tx('LETTRE DE VOITURE UNIQUE', x0 + LV.TOP_LEFT_W / 2, vc(y, LV.H_TITLE, LV.FONT_TITLE_MAIN), 'center');

  // ── Section 4a : Bloc N° (colonne droite) ────────────────────────────────
  bx(rx, y, LV.TOP_RIGHT_W, LV.H_NUM_BLOCK);
  tc(...LV.COLOR_PRIMARY);
  sf('bold', LV.FONT_NUM_LABEL);
  tx('N°', rx + 5, vc(y, LV.H_NUM_BLOCK, LV.FONT_NUM_LABEL));
  sf('bold', LV.FONT_NUM_VALUE);
  tx(String(d.numero ?? d.display ?? ''), rx + 13, vc(y, LV.H_NUM_BLOCK, LV.FONT_NUM_VALUE));
  tc(0, 0, 0); lw(LV.STROKE_INTRA);

  // ── Section 2 : NATIONALE / INTERNATIONALE (zone gauche) ─────────────────
  const y2 = y + LV.H_TITLE;
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y2, LV.W_NATCMR_HALF, LV.H_NATCMR);
  bx(x0 + LV.W_NATCMR_HALF, y2, LV.W_NATCMR_HALF, LV.H_NATCMR);
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  sf('bold', LV.FONT_NATCMR); tc(0, 0, 0);
  const chkY  = y2 + (LV.H_NATCMR - LV.CHECKBOX_SIZE) / 2;
  const txtVY = vc(y2, LV.H_NATCMR, LV.FONT_NATCMR);
  chk(x0 + LV.CELL_PAD_X, chkY, LV.CHECKBOX_SIZE, !isCMR);
  tx('NATIONALE', x0 + LV.CELL_PAD_X + LV.CHECKBOX_SIZE + 2, txtVY);
  const intlX = x0 + LV.W_NATCMR_HALF;
  chk(intlX + LV.CELL_PAD_X, chkY, LV.CHECKBOX_SIZE, isCMR);
  tx('INTERNATIONALE', intlX + LV.CELL_PAD_X + LV.CHECKBOX_SIZE + 2, txtVY);
  // Étiquette CMR (toujours visible)
  const cmrLogoX = intlX + LV.W_NATCMR_HALF - LV.CMR_LOGO_W - LV.CELL_PAD_X;
  const cmrLogoY = y2 + (LV.H_NATCMR - LV.CMR_LOGO_H) / 2;
  dc(...LV.COLOR_PRIMARY); lw(0.8);
  doc.roundedRect(cmrLogoX, cmrLogoY, LV.CMR_LOGO_W, LV.CMR_LOGO_H, LV.CMR_LOGO_RADIUS, LV.CMR_LOGO_RADIUS, 'S');
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_CMR_LOGO);
  doc.setCharSpace(0.3);
  tx('CMR', cmrLogoX + LV.CMR_LOGO_W / 2, vc(cmrLogoY, LV.CMR_LOGO_H, LV.FONT_CMR_LOGO), 'center');
  doc.setCharSpace(0);

  // ── Section 4b : Bandeau DATE (colonne droite) ────────────────────────────
  const dateHdrY = y + LV.H_NUM_BLOCK;
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  fc(...LV.COLOR_PRIMARY); bx(rx, dateHdrY, LV.TOP_RIGHT_W, LV.H_DATE_HEADER, 'FD');
  tc(...LV.COLOR_WHITE); sf('bold', LV.FONT_DATE_HEADER);
  doc.setCharSpace(1);
  tx('DATE', rx + LV.TOP_RIGHT_W / 2, vc(dateHdrY, LV.H_DATE_HEADER, LV.FONT_DATE_HEADER), 'center');
  doc.setCharSpace(0);

  // ── Section 3 : Mentions légales (zone gauche) ────────────────────────────
  const y3 = y2 + LV.H_NATCMR;
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y3, LV.W_LEGAL_HALF, LV.H_LEGAL);
  bx(x0 + LV.W_LEGAL_HALF, y3, LV.W_LEGAL_HALF, LV.H_LEGAL);
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  sf('italic', LV.FONT_LEGAL); tc(0, 0, 0);
  doc.text(sp("À défaut de convention écrite entre les parties au contrat de transport ou de déclaration de valeur spécifiée par le donneur d'ordre, la responsabilité du transporteur, en cas de perte ou avarie survenue aux marchandises ou en cas de retard à la livraison, est limitée au montant de l'indemnité prévue par le contrat type concernant le transport.", LV.W_LEGAL_HALF - LV.CELL_PAD_X * 2), x0 + LV.CELL_PAD_X, y3 + LV.CELL_PAD_Y * 2);
  doc.text(sp("Ce transport est soumis, nonobstant toute clause contraire, à la Convention relative au contrat de transport international de marchandises par route (CMR).\nThis carriage is subject, notwithstanding any clause to the contrary, to the Convention on the Contract for the international Carriage of goods by road (CMR).", LV.W_LEGAL_HALF - LV.CELL_PAD_X * 2), x0 + LV.W_LEGAL_HALF + LV.CELL_PAD_X, y3 + LV.CELL_PAD_Y * 2);

  // ── Section 4c : Valeur de la date (colonne droite) ──────────────────────
  const dateValY = dateHdrY + LV.H_DATE_HEADER;
  const dateValH = (y3 + LV.H_LEGAL) - dateValY;  // reste jusqu'à Y_TRANSPORTEUR
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(rx, dateValY, LV.TOP_RIGHT_W, dateValH);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_DATE_VALUE);
  tx(d.date ?? '', rx + LV.TOP_RIGHT_W / 2, vc(dateValY, dateValH, LV.FONT_DATE_VALUE), 'center');
  tc(0, 0, 0); dc(0, 0, 0); lw(LV.STROKE_INTRA);

  // ═══ ZONE PLEINE LARGEUR
  y = y3 + LV.H_LEGAL;   // = LV.Y_TRANSPORTEUR (+ décalage bande si CMR)

  // ── Section 5 : Transporteur + Conducteurs / Immatriculations ─────────────
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y, CW, LV.H_TRANSPORTEUR);
  lw(LV.STROKE_DOC_BORDER); ln(x0 + LV.W_TRANS_LEFT, y, x0 + LV.W_TRANS_LEFT, y + LV.H_TRANSPORTEUR);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_LABEL);
  tx('Transporteur / Carrier (nom, adresse, pays / name, address, country)', x0 + LV.CELL_PAD_X, y + 3.2);
  const tl = d.transporteur ?? {};
  const _tlIsCustom = tl.id === 'autre';
  const _tlFb = (val, fallback) => (val != null && val !== '') ? val : (_tlIsCustom ? '' : fallback);
  tc(0, 0, 0); sf('bold', LV.FONT_TRANS_NAME);
  let ty = y + 8;
  tx(_tlFb(tl.nom, 'TRANSPORTS MESNAGER'), x0 + LV.CELL_PAD_X, ty); ty += 4.2;
  sf('normal', LV.FONT_BODY);
  const _tlInfoLine = tl.siret
    ? 'SIRET : ' + tl.siret + (tl.telephone ? ' · ' + tl.telephone : '')
    : (_tlIsCustom && tl.telephone ? 'Tél. ' + tl.telephone : _tlFb(tl.info, 'SAS au capital de 500 000 €'));
  for (const l of [
    _tlFb(tl.adresse, 'Z.A. des Renardières - B.P 10'),
    tl.cp_ville || _tlFb(tl.ville, '53250 JAVRON LES CHAPELLES'),
    _tlInfoLine,
    _tlIsCustom ? '' : (tl.rcs || 'RCS LAVAL 314 901 869'),
  ].filter(Boolean)) { tx(l, x0 + LV.CELL_PAD_X, ty); ty += 3.7; }
  const cx2 = x0 + LV.W_TRANS_LEFT;
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_LABEL);
  tx('CONDUCTEURS / Drivers', cx2 + LV.CELL_PAD_X, y + 3.2);
  tc(0, 0, 0); sf('normal', LV.FONT_BODY);
  tx(d.conducteur ?? '', cx2 + LV.CELL_PAD_X, y + LV.H_COND / 2 + 2.5);
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_INTRA);
  ln(cx2 + 1, y + LV.H_COND, x0 + CW - 1, y + LV.H_COND);
  const imY = y + LV.H_COND;
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_LABEL);
  tx('IMMATRICULATIONS / Plate N°', cx2 + LV.CELL_PAD_X, imY + 4);
  tc(0, 0, 0); sf('normal', LV.FONT_LABEL);
  tx('Véhicule moteur :', cx2 + LV.CELL_PAD_X, imY + 9);
  sf('normal', LV.FONT_BODY);
  tx(d.vehicule ?? d.immat_moteur ?? '', cx2 + LV.CELL_PAD_X + 23, imY + 9);
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_INTRA);
  ln(cx2 + 1, imY + 10.5, x0 + CW - 1, imY + 10.5);
  sf('normal', LV.FONT_LABEL); tx('(Semi-)remorque :', cx2 + LV.CELL_PAD_X, imY + 16);
  sf('normal', LV.FONT_BODY);  tx(d.remorque ?? d.immat_semi ?? '', cx2 + LV.CELL_PAD_X + 23, imY + 16);
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_TRANSPORTEUR;

  // ── Section 6 : Donneur d'ordre ───────────────────────────────────────────
  fc(...LV.COLOR_SOFT_BG); bx(x0, y, CW, LV.H_DONNEUR, 'F');
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y, CW, LV.H_DONNEUR);
  ln(x0 + LV.W_DONNEUR_LABEL, y, x0 + LV.W_DONNEUR_LABEL, y + LV.H_DONNEUR);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_BODY);
  tx("Donneur d'ordre :", x0 + LV.CELL_PAD_X, vc(y, LV.H_DONNEUR, LV.FONT_BODY));
  tc(0, 0, 0); sf('normal', LV.FONT_BODY + 1.5);
  const doVal = sp(String(d.donneurOrdre ?? d.donneur_ordre ?? ''), CW - LV.W_DONNEUR_LABEL - LV.CELL_PAD_X * 2);
  if (doVal[0]) tx(doVal[0], x0 + LV.W_DONNEUR_LABEL + LV.CELL_PAD_X, vc(y, LV.H_DONNEUR, LV.FONT_BODY + 1.5));
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_DONNEUR;

  // ── Section 7 : Header MARCHANDISES / GOODS ──────────────────────────────
  fc(...LV.COLOR_PRIMARY); bx(x0, y, CW, LV.H_MARC_HEADER, 'F');
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y, CW, LV.H_MARC_HEADER, 'S');
  tc(...LV.COLOR_WHITE); sf('bold', LV.FONT_SECTION);
  doc.setCharSpace(0.5);
  tx('MARCHANDISES / GOODS', x0 + CW / 2, vc(y, LV.H_MARC_HEADER, LV.FONT_SECTION), 'center');
  doc.setCharSpace(0);
  tc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_MARC_HEADER;

  // ── Section 8 : En-têtes colonnes ─────────────────────────────────────────
  const W_NAT   = CW - LV.W_MARC_NOMBRE - LV.W_MARC_POIDS - LV.W_MARC_NOTE;
  const X_NAT   = x0 + LV.W_MARC_NOMBRE;
  const X_POIDS = X_NAT + W_NAT;
  const X_NOTE  = X_POIDS + LV.W_MARC_POIDS;
  fc(...LV.COLOR_LIGHT_BLUE); bx(x0, y, CW, LV.H_MARC_COLS, 'F');
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0,     y, LV.W_MARC_NOMBRE, LV.H_MARC_COLS);
  bx(X_NAT,  y, W_NAT,            LV.H_MARC_COLS);
  bx(X_POIDS,y, LV.W_MARC_POIDS,  LV.H_MARC_COLS);
  bx(X_NOTE, y, LV.W_MARC_NOTE,   LV.H_MARC_COLS);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_MARC_COL);
  doc.setCharSpace(0.3);
  doc.text(sp('NOMBRE\nNumber', LV.W_MARC_NOMBRE - 2), x0 + LV.W_MARC_NOMBRE / 2, y + LV.CELL_PAD_Y + 1, { align: 'center' });
  doc.text(sp('NATURE DE LA MARCHANDISE / Nature of the goods', W_NAT - 4), X_NAT + W_NAT / 2, y + LV.CELL_PAD_Y + 1, { align: 'center' });
  doc.text(sp('POIDS / M.L.\nWeight / Lin. m.', LV.W_MARC_POIDS - 2), X_POIDS + LV.W_MARC_POIDS / 2, y + LV.CELL_PAD_Y + 1, { align: 'center' });
  tx('NOTE', X_NOTE + LV.W_MARC_NOTE / 2, vc(y, LV.H_MARC_COLS, LV.FONT_MARC_COL), 'center');
  doc.setCharSpace(0);
  tc(0, 0, 0); dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_MARC_COLS;

  // ── Section 9 : Lignes marchandises + ligne TOTAL ─────────────────────────
  const marchs = Array.isArray(d.marchandises) ? d.marchandises : [];
  for (let i = 0; i < LV.N_MARC_ROWS; i++) {
    const r = marchs[i] ?? {};
    if (i % 2 === 0) { fc(...LV.COLOR_ALT_ROW); bx(x0, y, CW, LV.H_MARC_ROW, 'F'); }
    dc(...LV.COLOR_GREY_BLUE); lw(LV.STROKE_INTRA);
    bx(x0,     y, LV.W_MARC_NOMBRE, LV.H_MARC_ROW);
    bx(X_NAT,  y, W_NAT,            LV.H_MARC_ROW);
    bx(X_POIDS,y, LV.W_MARC_POIDS,  LV.H_MARC_ROW);
    bx(X_NOTE, y, LV.W_MARC_NOTE,   LV.H_MARC_ROW);
    tc(0, 0, 0);
    const rowY  = vc(y, LV.H_MARC_ROW, LV.FONT_MARC_ROW);
    const nombre = String(r.nombre ?? r.qte ?? '');
    const nature = String(r.nature ?? r.description ?? '');
    const poids  = String(r.poids ?? '');
    const note   = String(r.note ?? '');
    sf('normal', LV.FONT_MARC_ROW);
    if (nombre) tx(nombre, x0 + LV.CELL_PAD_X, rowY);
    if (nature) tx((sp(nature, W_NAT - LV.CELL_PAD_X * 2))[0] ?? '', X_NAT + LV.CELL_PAD_X, rowY);
    if (poids)  tx(poids + (poids.match(/[tT]\s*$/) ? '' : ' t'), X_POIDS + LV.W_MARC_POIDS / 2, rowY, 'center');
    if (note)   { sf('normal', LV.FONT_MARC_COL); tx(note, X_NOTE + LV.CELL_PAD_X, rowY); }
    y += LV.H_MARC_ROW;
  }
  // Ligne TOTAL
  const tot = d.total ?? {};
  fc(...LV.COLOR_LIGHT_BLUE); bx(x0, y, CW, LV.H_MARC_ROW, 'F');
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_TOTAL); ln(x0, y, x0 + CW, y);
  lw(LV.STROKE_INTRA);
  bx(x0,     y, LV.W_MARC_NOMBRE, LV.H_MARC_ROW);
  bx(X_NAT,  y, W_NAT,            LV.H_MARC_ROW);
  bx(X_POIDS,y, LV.W_MARC_POIDS,  LV.H_MARC_ROW);
  bx(X_NOTE, y, LV.W_MARC_NOTE,   LV.H_MARC_ROW);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_MARC_TOTAL);
  const totY = vc(y, LV.H_MARC_ROW, LV.FONT_MARC_TOTAL);
  tx('TOTAL / Total', X_NAT + W_NAT - LV.CELL_PAD_X, totY, 'right');
  if (tot.poids) tx(String(tot.poids), X_POIDS + LV.W_MARC_POIDS / 2, totY, 'center');
  if (tot.ml) { sf('normal', LV.FONT_MARC_TOTAL); tx(String(tot.ml), X_NOTE + LV.CELL_PAD_X, totY); }
  // Convoi exceptionnel dans la cellule NOMBRE (ligne TOTAL)
  const cv2 = d.convoiExceptionnel === true || d.convoi === true || d.convoi === 'Oui';
  sf('bold', 5); tc(...LV.COLOR_PRIMARY);
  tx('Convoi except.', x0 + LV.CELL_PAD_X, y + 3.2);
  tc(0, 0, 0); dc(0, 0, 0); lw(LV.STROKE_INTRA);
  chk(x0 + LV.CELL_PAD_X,      y + 4.3, 3.0, cv2);
  sf('normal', 5.5); tx('OUI', x0 + LV.CELL_PAD_X + 4.2, y + 7.0);
  chk(x0 + LV.CELL_PAD_X + 12, y + 4.3, 3.0, !cv2);
  tx('NON', x0 + LV.CELL_PAD_X + 16.2, y + 7.0);
  tc(0, 0, 0); dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_MARC_ROW;

  // ── Section 10 : Refus de signature ──────────────────────────────────────
  fc(...LV.COLOR_SOFT_BG); bx(x0, y, CW, LV.H_REFUS, 'F');
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y, CW / 2, LV.H_REFUS);
  bx(x0 + CW / 2, y, CW / 2, LV.H_REFUS);
  sf('italic', LV.FONT_REFUS); tc(0, 0, 0);
  const refusExp  = "Le refus non motivé de signature engage la responsabilité de l'expéditeur-remettant.";
  const refusDest = "Le refus non motivé de signature engage la responsabilité du destinataire.";
  doc.text(sp(refusExp,  CW / 2 - LV.CELL_PAD_X * 2), x0 +           LV.CELL_PAD_X, y + LV.CELL_PAD_Y * 2);
  doc.text(sp(refusDest, CW / 2 - LV.CELL_PAD_X * 2), x0 + CW / 2 + LV.CELL_PAD_X, y + LV.CELL_PAD_Y * 2);
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_REFUS;

  // ── Section 11 : Réserves Chargement / Déchargement ──────────────────────
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y, CW / 2, LV.H_RESERVES);
  bx(x0 + CW / 2, y, CW / 2, LV.H_RESERVES);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_BODY);
  tx('Réserves AU CHARGEMENT',   x0 + LV.CELL_PAD_X,           y + 3.5);
  tx('Réserves AU DÉCHARGEMENT', x0 + CW / 2 + LV.CELL_PAD_X, y + 3.5);
  tc(0, 0, 0); sf('normal', LV.FONT_BODY);
  const resC = String(d.reservesChargement ?? d.reserves_chargement ?? '');
  const resD = String(d.reservesDechargement ?? d.reserves_dechargement ?? '');
  if (resC) { const ls = sp(resC, CW / 2 - LV.CELL_PAD_X * 2); doc.text(ls.slice(0, 2), x0 + LV.CELL_PAD_X, y + 9); }
  if (resD) { const ls = sp(resD, CW / 2 - LV.CELL_PAD_X * 2); doc.text(ls.slice(0, 2), x0 + CW / 2 + LV.CELL_PAD_X, y + 9); }
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_RESERVES;

  // ── Section 12 : Documents annexes + Commande / Note de livraison ─────────
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y, CW / 2, LV.H_DOCS);
  bx(x0 + CW / 2, y, CW / 2, LV.H_DOCS);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_BODY);
  tx('Documents annexes / Documents attached', x0 + LV.CELL_PAD_X,           y + 3.2);
  tx('Note de livraison',                      x0 + CW / 2 + LV.CELL_PAD_X, y + 3.2);
  tc(0, 0, 0); sf('normal', LV.FONT_BODY);
  const docStr = String(d.documentsAnnexes ?? d.doc_annexe ?? '');
  const cmdStr = d.commande ? 'Cde : ' + d.commande : '';
  if (docStr) tx(docStr, x0 + LV.CELL_PAD_X, y + 7.0);
  if (cmdStr) tx(cmdStr, x0 + LV.CELL_PAD_X, y + (docStr ? 9.5 : 7.0));
  if (d.livraisonPrevue) tx('Livraison prévue le ' + _fmtDateFR(d.livraisonPrevue), x0 + CW / 2 + LV.CELL_PAD_X, y + 7.0);
  if (d.note) {
    const noteStr = String(d.note);
    const isGrutage = noteStr.startsWith('!!!');
    const noteY = d.livraisonPrevue ? y + 9.5 : y + 7.0;
    if (isGrutage) {
      doc.setFillColor(255, 230, 0);
      doc.rect(x0 + CW / 2 + 0.5, noteY - 2.5, CW / 2 - 1, 5.5, 'F');
      tc(185, 28, 28); sf('bold', LV.FONT_BODY);
      tx(noteStr, x0 + CW / 2 + LV.CELL_PAD_X, noteY);
      tc(0, 0, 0); sf('normal', LV.FONT_BODY);
    } else {
      tx(noteStr, x0 + CW / 2 + LV.CELL_PAD_X, noteY);
    }
  }
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_DOCS;

  // ── Section 13 : Expéditeur / Destinataire ────────────────────────────────
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  bx(x0, y, CW / 2, LV.H_ADDR);
  bx(x0 + CW / 2, y, CW / 2, LV.H_ADDR);
  tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_BODY);
  tx('EXPÉDITEUR / Sender - Chargement',    x0 + LV.CELL_PAD_X,           y + 3.5);
  tx('DESTINATAIRE / Consignee - Livraison', x0 + CW / 2 + LV.CELL_PAD_X, y + 3.5);
  tc(0, 0, 0); sf('normal', LV.FONT_BODY);
  const _cname = p => String(p || '').replace(/^[A-Z]{2,3}\s*[-–]\s*/i, '').toUpperCase();
  let ey = y + 9.5;
  const expPays  = _cname(d.expediteur?.pays || 'FR - France');
  const expNom   = (d.expediteur?.nom    || '').trim() || 'SONOTRAD';
  const expAdr   = (d.expediteur?.adresse|| '').trim() || '9 Z.A. des Renardières';
  const expVille = (d.expediteur?.ville  || '').trim() || '53250 JAVRON-LES-CHAPELLES';
  for (const l of [expNom, expAdr, expVille, expPays].filter(Boolean)) { tx(l, x0 + LV.CELL_PAD_X, ey); ey += 4; }
  const dst = d.destinataire ?? {};
  const dstPays = _cname(dst.pays);
  let dy2 = y + 9.5;
  for (const l of [dst.nom, dst.adresse, dst.cp_ville ?? dst.ville, dstPays].filter(Boolean)) { tx(l, x0 + CW / 2 + LV.CELL_PAD_X, dy2); dy2 += 4; }
  dc(0, 0, 0); lw(LV.STROKE_INTRA);
  y += LV.H_ADDR;

  // ── Section 14 : Signatures (3 colonnes) ─────────────────────────────────
  const SW = CW / LV.N_SIG_COLS;
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SECTION);
  for (let i = 0; i < LV.N_SIG_COLS; i++) bx(x0 + SW * i, y, SW, LV.H_SIG);
  fc(...LV.COLOR_LIGHT_BLUE);
  for (let i = 0; i < LV.N_SIG_COLS; i++) bx(x0 + SW * i, y, SW, LV.H_SIG_HEADER, 'F');
  const sigLabels = [
    ["CACHET EXPÉDITEUR", "Sender's stamp"],
    ["NOM & SIGNATURE CONDUCTEUR", "Driver's name and signature"],
    ["CACHET DESTINATAIRE", "Consignee's stamp"],
  ];
  for (let i = 0; i < LV.N_SIG_COLS; i++) {
    const sx = x0 + SW * i + SW / 2;
    tc(...LV.COLOR_PRIMARY); sf('bold', LV.FONT_SIG_HEADER);
    tx(sigLabels[i][0], sx, y + LV.H_SIG_HEADER * 0.55, 'center');
    tc(...LV.COLOR_TEXT_MUTED); sf('italic', LV.FONT_SIG_SUB);
    tx(sigLabels[i][1], sx, y + LV.H_SIG_HEADER * 0.92, 'center');
  }
  const cachX = x0 + SW / 2;
  tc(0, 0, 0);
  // Cachet imprimé seulement si l'envoi part de chez nous (Javron) au nom de SONOTRAD ou BCB ;
  // sinon la case reste vide pour le tampon du vrai expéditeur.
  const expNomMaj  = expNom.toUpperCase();
  const departChezNous = /JAVRON|53250/i.test(expVille);
  const cachet = !departChezNous ? null
    : expNomMaj.includes('BCB') ? 'bcb'
    : expNomMaj.includes('SONOTRAD') ? 'sonotrad'
    : null;
  if (cachet === 'bcb') {
    sf('bold', 10);             tx('BCB OFF MARKET',              cachX, y + 9.5,  'center');
    sf('normal', LV.FONT_BODY); tx('ZA Renardières',              cachX, y + 14.5, 'center');
                                 tx('53250 JAVRON-LES-CHAPELLES', cachX, y + 18.5, 'center');
  } else if (cachet === 'sonotrad') {
    sf('bold', 10);             tx('SONOTRAD',                         cachX, y + 9.5,  'center');
    sf('normal', 5.5);          tx('S.a.R.L au capital de 100 000 €', cachX, y + 13,   'center');
    sf('normal', LV.FONT_BODY); tx('9 Z.A. des Renardières',          cachX, y + 16.5, 'center');
                                 tx('53250 JAVRON-LES-CHAPELLES',      cachX, y + 20,   'center');
                                 tx('Tél. 02.49.66.10.42',             cachX, y + 23.5, 'center');
    sf('normal', 5.5);          tx('R.C.S LAVAL 409 002 326',          cachX, y + 26.5, 'center');
  }
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_SIG_LINE);
  doc.setLineDash([1.5, 1]);
  const sigLineY = y + LV.H_SIG - LV.SIG_LINE_BOTTOM;
  for (let i = 0; i < LV.N_SIG_COLS; i++) {
    ln(x0 + SW * i + LV.SIG_LINE_MARGIN, sigLineY, x0 + SW * (i + 1) - LV.SIG_LINE_MARGIN, sigLineY);
  }
  doc.setLineDash([]);
  // Bordure externe du document (par-dessus toutes les sections)
  const docTopY = LV.Y_TITLE + (band ? 7 : 0);
  dc(...LV.COLOR_PRIMARY); lw(LV.STROKE_DOC_BORDER);
  bx(x0, docTopY, CW, y + LV.H_SIG - docTopY, 'S');
  lw(LV.STROKE_INTRA);
}

function _lvuVerso(doc) {
  const x0 = LV.MARGIN;
  const CW = LV.CONTENT_W;
  const HW = (CW - LV.V_COL_GAP) / 2;   // 96mm par colonne
  const c2x = x0 + HW + LV.V_COL_GAP;

  const sf  = (s, z) => { doc.setFont('helvetica', s); doc.setFontSize(z); };
  const fc  = (...c) => doc.setFillColor(...c);
  const tc  = (...c) => doc.setTextColor(...c);
  const dc  = (...c) => doc.setDrawColor(...c);
  const lw  = w  => doc.setLineWidth(w);
  const bx  = (x, y, w, h, s = 'S') => doc.rect(x, y, w, h, s);
  const ln  = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2);
  const tx  = (t, x, y, a = 'left') => doc.text(String(t ?? ''), x, y, { align: a });
  const sp  = (t, w) => doc.splitTextToSize(String(t ?? ''), w);
  const lh  = s => s * 0.353 * 1.55;   // hauteur de ligne pour fonte s (pt)

  // ── En-tête ──────────────────────────────────────────────────────────────
  let y = LV.MARGIN;
  tc(...LV.V_TITLE_MAIN); sf('bold', LV.V_HEADER_TITLE_FONT);
  doc.setCharSpace(0.2);
  tx('CONDITIONS DE TRANSPORT - PLAFONDS DE RESPONSABILITÉ', x0 + CW / 2, y + 7, 'center');
  doc.setCharSpace(0);
  tc(...LV.V_SUBTITLE); sf('italic', LV.V_HEADER_SUB_FONT);
  tx("Articles L.133-1 et suivants du Code de Commerce · Contrats types publiés par arrêtés ministériels", x0 + CW / 2, y + 13, 'center');
  dc(...LV.V_BORDER); lw(LV.STROKE_VERSO);
  ln(x0, y + 16, x0 + CW, y + 16);
  y += 16 + LV.V_HEADER_MARGIN_BOTTOM;

  // ── Calcul des hauteurs de blocs ─────────────────────────────────────────
  const footerY = LV.PAGE_H - LV.MARGIN;
  const blocksH = footerY - y - 2;
  const BH_L = (blocksH - (LV.V_BLOCKS_LEFT  - 1) * LV.V_BLOCK_GAP) / LV.V_BLOCKS_LEFT;
  const BH_R = (blocksH - (LV.V_BLOCKS_RIGHT - 1) * LV.V_BLOCK_GAP) / LV.V_BLOCKS_RIGHT;
  const BLOCK_HDR_H = LV.V_BLOCK_TITLE_PAD_Y * 2 + LV.V_BLOCK_TITLE_FONT * 0.353;

  // ── Rendu d'un bloc ───────────────────────────────────────────────────────
  function drawBlock(col, blockY, bh, title, items) {
    const bLeft = col === 0 ? x0 : c2x;
    dc(...LV.V_BORDER); lw(LV.STROKE_VERSO);
    bx(bLeft, blockY, HW, bh);
    fc(...LV.V_BG_HEADER); bx(bLeft, blockY, HW, BLOCK_HDR_H, 'F');
    dc(...LV.V_BORDER); lw(LV.STROKE_VERSO);
    ln(bLeft, blockY + BLOCK_HDR_H, bLeft + HW, blockY + BLOCK_HDR_H);
    tc(...LV.V_TITLE_BLOCK); sf('bold', LV.V_BLOCK_TITLE_FONT);
    tx(title, bLeft + LV.V_BLOCK_TITLE_PAD_X, blockY + LV.V_BLOCK_TITLE_PAD_Y + LV.V_BLOCK_TITLE_FONT * 0.353);
    let cy = blockY + BLOCK_HDR_H + LV.V_BLOCK_PAD_Y;
    for (const item of items) {
      if (item.t === 'sub') {
        tc(...LV.V_TITLE_BLOCK); sf('bold', LV.V_BLOCK_BODY_FONT);
        const lines = sp(item.v, HW - LV.V_BLOCK_PAD_X * 2);
        doc.text(lines, bLeft + LV.V_BLOCK_PAD_X, cy);
        cy += lines.length * lh(LV.V_BLOCK_BODY_FONT) + 1;
      } else if (item.t === 'bullet') {
        tc(...LV.V_BULLET); sf('normal', 13);
        tx('·', bLeft + LV.V_BLOCK_PAD_X, cy);
        tc(...LV.V_TEXT); sf('normal', LV.V_BLOCK_LIST_FONT);
        const lines = sp(item.v, HW - LV.V_BLOCK_PAD_X * 2 - 4);
        doc.text(lines, bLeft + LV.V_BLOCK_PAD_X + 3.5, cy);
        cy += lines.length * lh(LV.V_BLOCK_LIST_FONT) + 0.8;
      } else if (item.t === 'retard') {
        cy += 2.0;
        dc(...LV.V_BORDER_LIGHTER); lw(LV.STROKE_VERSO);
        doc.setLineDash([0.8, 0.8]);
        ln(bLeft + LV.V_BLOCK_PAD_X, cy, bLeft + HW - LV.V_BLOCK_PAD_X, cy);
        doc.setLineDash([]);
        cy += 2.5;
        tc(...LV.V_SUBTITLE); sf('italic', LV.V_BLOCK_LIST_FONT);
        const lines = sp(item.v, HW - LV.V_BLOCK_PAD_X * 2);
        doc.text(lines, bLeft + LV.V_BLOCK_PAD_X, cy);
        cy += lines.length * lh(LV.V_BLOCK_LIST_FONT) + 1;
      } else {
        tc(...LV.V_TEXT); sf('normal', LV.V_BLOCK_BODY_FONT);
        const lines = sp(item.v, HW - LV.V_BLOCK_PAD_X * 2);
        doc.text(lines, bLeft + LV.V_BLOCK_PAD_X, cy);
        cy += lines.length * lh(LV.V_BLOCK_BODY_FONT) + 1.5;
      }
    }
  }

  // ── Blocs colonne gauche (5 blocs) ────────────────────────────────────────
  const LEFT = [
    { title: 'TRAFIC INTÉRIEUR · ENVOIS >= 3 TONNES', items: [
      { t: 'body',   v: 'Réf. Décret 2017-461 du 31 mars 2017' },
      { t: 'bullet', v: 'Perte ou avarie : 20 €/kg de poids brut manquant ou avarié' },
      { t: 'bullet', v: 'Plafond global : nb de tonnes × 3 200 €' },
      { t: 'body',   v: "La plus faible des deux limites s'applique." },
      { t: 'retard', v: 'Retard : indemnisation limitée au prix du transport.' },
    ]},
    { title: 'TRAFIC INTÉRIEUR · ENVOIS < 3 TONNES', items: [
      { t: 'body',   v: 'Réf. Décret 2017-461 du 31 mars 2017' },
      { t: 'bullet', v: 'Perte ou avarie : 33 €/kg, maximum 1 000 €/colis' },
      { t: 'retard', v: 'Retard : indemnisation limitée au prix du transport.' },
    ]},
    { title: 'TRANSPORT SOUS TEMPÉRATURE DIRIGÉE', items: [
      { t: 'bullet', v: 'Envois >= 3 t : 14 EUR/kg - plafond : nb tonnes x 4 000 EUR' },
      { t: 'bullet', v: 'Envois < 3 t : 23 EUR/kg - plafond : 750 EUR/colis' },
      { t: 'retard', v: 'Retard : indemnisation limitée au prix du transport.' },
    ]},
    { title: 'TRANSPORT EN CITERNES', items: [
      { t: 'bullet', v: 'Marchandise : 3 €/kg ou litre - plafond55 000 €/envoi' },
      { t: 'bullet', v: 'Autres dommages : plafond 300 000 €/envoi' },
      { t: 'retard', v: 'Retard : indemnisation limitée au prix du transport.' },
    ]},
    { title: "TRANSPORT D'ANIMAUX VIVANTS", items: [
      { t: 'body',   v: 'Indemnisation selon plafond par animal (art. D3222-4 Code des transports).' },
      { t: 'retard', v: 'Retard : indemnisation limitée au prix du transport.' },
    ]},
  ];

  // ── Blocs colonne droite (4 blocs) ───────────────────────────────────────
  const RIGHT = [
    { title: 'TRANSPORT DE MASSES INDIVISIBLES', items: [
      { t: 'bullet', v: 'Dommages directs : 60 000 €/envoi' },
      { t: 'bullet', v: 'Autres dommages : double du prix du transport' },
      { t: 'retard', v: 'Retard : indemnisation limitée au prix du transport.' },
    ]},
    { title: 'TRANSPORT DE VÉHICULES ROULANTS', items: [
      { t: 'bullet', v: 'Véhicule neuf : valeur de remplacement HT au tarif constructeur' },
      { t: 'bullet', v: 'Occasion coté Argus : valeur Argus' },
      { t: 'bullet', v: 'Occasion non coté : 800 €' },
      { t: 'bullet', v: 'Autres dommages : 500 €/véhicule' },
      { t: 'retard', v: 'Retard : indemnisation limitée au prix du transport.' },
    ]},
    { title: 'TRAFIC INTERNATIONAL · CONVENTION CMR', items: [
      { t: 'body',   v: "Sauf déclaration de valeur, intérêt spécial, vol ou faute lourde :" },
      { t: 'bullet', v: 'Indemnisation limitée à 8,33 DTS/kg de poids brut manquant ou avarié' },
      { t: 'body',   v: 'Remboursement : prix du transport, droits de douane et frais liés.' },
      { t: 'retard', v: "Retard : prix du transport sauf déclaration d'intérêt spécial (CMR art. 23 et 29)." },
    ]},
    { title: 'LITIGES · COMPÉTENCE JURIDICTIONNELLE', items: [
      { t: 'body',   v: "Tout litige relatif à l'exécution du contrat de transport relève de la compétence exclusive des tribunaux du siège social du transporteur, même en cas de pluralité de défendeurs ou d'appel en garantie." },
    ]},
    { title: 'DÉCLARATIONS DE VALEUR', items: [
      { t: 'body',   v: "Les limites ci-dessus ne s'appliquent pas en cas de déclaration de valeur (pertes et avaries) ou de déclaration d'intérêt spécial à la livraison (retard), établies par le donneur d'ordre préalablement au transport." },
    ]},
  ];

  for (let i = 0; i < LEFT.length;  i++) drawBlock(0, y + i * (BH_L + LV.V_BLOCK_GAP), BH_L, LEFT[i].title,  LEFT[i].items);
  for (let i = 0; i < RIGHT.length; i++) drawBlock(1, y + i * (BH_R + LV.V_BLOCK_GAP), BH_R, RIGHT[i].title, RIGHT[i].items);

}
