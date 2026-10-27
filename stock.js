// Stockage Pidem (catalogue, historique, pose, saisie, import XLS).
// Méthodes ajoutées à App (défini dans app.js, chargé avant) : contenu déplacé tel quel
// depuis l'ancien index.html unique (découpage du 2026-10-26).
Object.assign(App, {

  /* ─ Stockage ─ */
  async loadStockCatalog() {
    if (!S.apiUrl) return;
    document.getElementById('stock-loading').style.display = 'block';
    document.getElementById('stock-list').innerHTML = '';
    try {
      // Catalogue + préférences + mouvements + analytics en parallèle
      const tasks = [
        _fetchWithTimeout(S.apiUrl + '?action=stock_catalog',            {}, 40000),
        _fetchWithTimeout(S.apiUrl + '?action=stock_prefs',              {}, 10000),
        _fetchWithTimeout(S.apiUrl + '?action=stock_mouvements_summary', {}, 15000),
      ];
      if (!S.analyticsLoaded) {
        tasks.push(_fetchWithTimeout(S.apiUrl + '?action=stock_analytics', {}, 20000));
      }
      const [catResp, prefsResp, deltaResp, anaResp] = await Promise.all(tasks);
      const cat    = await catResp.json();
      const prefs  = await prefsResp.json();
      const deltas = await deltaResp.json();

      if (cat.status === 'ok') {
        S.stockData     = cat.data || [];
        S.stockFamilles = cat.familles || [];
        S.stockLoaded   = true;
        S.catalogLoaded = true;
      }
      if (prefs.status === 'ok') {
        S.stockPrefs = new Set(prefs.prefs?.relevant || []);
      }
      if (deltas.status === 'ok') {
        S.stockDeltas = deltas.summary || {};
      }
      if (anaResp) {
        const ana = await anaResp.json();
        if (ana.status === 'ok') { S.stockAnalytics = ana.analytics || {}; S.analyticsLoaded = true; }
      }
    } catch(e) { this.toast('Erreur chargement catalogue'); }
    finally { document.getElementById('stock-loading').style.display = 'none'; }

    this._renderStockFamilleFilters();
    this._renderStockList();
  },

  async refreshStockQty() {
    if (!S.apiUrl) return;
    const btn = document.getElementById('stock-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Chargement…'; }
    try {
      const [catResp, deltaResp] = await Promise.all([
        _fetchWithTimeout(S.apiUrl + '?action=stock_catalog',            {}, 40000),
        _fetchWithTimeout(S.apiUrl + '?action=stock_mouvements_summary', {}, 15000),
      ]);
      const cat    = await catResp.json();
      const deltas = await deltaResp.json();
      if (cat.status === 'ok') {
        S.stockData     = cat.data || [];
        S.stockFamilles = cat.familles || [];
        S.stockLoaded   = true;
      }
      if (deltas.status === 'ok') S.stockDeltas = deltas.summary || {};
      S.analyticsLoaded = false;
      S.dashboardLoaded = false;
      this._renderStockList();
      this.toast('✓ Quantités mises à jour');
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualiser'; }
    }
  },

  setStockSearch(val) {
    S.stockFilter.search = val.toLowerCase();
    this._renderStockList();
  },

  setStockFamille(val) {
    S.stockFilter.famille = (val === '' || S.stockFilter.famille === val) ? '' : val;
    this._renderStockFamilleFilters();
    this._renderStockList();
  },

  _saveStockFilterPrefs() {
    try { localStorage.setItem(SK.STOCK_FILTER, JSON.stringify({ myRefs: S.stockFilter.myRefs, alerts: S.stockFilter.alerts })); } catch(e) {}
  },

  toggleStockMyRefs() {
    S.stockFilter.myRefs = !S.stockFilter.myRefs;
    const btn = document.getElementById('stock-myrefs-btn');
    if (btn) {
      btn.style.background    = S.stockFilter.myRefs ? 'var(--accent)' : '#F1F5F9';
      btn.style.borderColor   = S.stockFilter.myRefs ? 'var(--accent)' : '#CBD5E1';
      btn.style.color         = S.stockFilter.myRefs ? 'white' : '#64748B';
      btn.textContent         = S.stockFilter.myRefs ? '★ Mes références' : '☆ Mes références';
    }
    this._saveStockFilterPrefs();
    this._renderStockList();
  },

  toggleStockAlerts() {
    S.stockFilter.alerts = !S.stockFilter.alerts;
    const btn = document.getElementById('stock-alerts-btn');
    if (btn) {
      btn.style.background  = S.stockFilter.alerts ? '#FEF3C7' : '#F1F5F9';
      btn.style.borderColor = S.stockFilter.alerts ? '#D97706' : '#CBD5E1';
      btn.style.color       = S.stockFilter.alerts ? '#D97706' : '#64748B';
    }
    this._saveStockFilterPrefs();
    this._renderStockList();
  },

  async toggleStockPref(ref) {
    if (S.stockPrefs.has(ref)) { S.stockPrefs.delete(ref); }
    else                        { S.stockPrefs.add(ref);    }
    this._renderStockList(); // re-render immédiat
    // Sauvegarde en fond
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ action:'save_stock_prefs', relevant: [...S.stockPrefs] }));
      await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 15000);
    } catch(e) { /* silencieux — sauvegardé localement de toute façon */ }
  },

  _renderStockFamilleFilters() {
    const wrap = document.getElementById('stock-famille-filters');
    if (!wrap) return;
    const cur = S.stockFilter.famille;
    // Synchronise l'état visuel des boutons toggle depuis S.stockFilter (utile au 1er rendu)
    const myBtn = document.getElementById('stock-myrefs-btn');
    if (myBtn) {
      myBtn.style.background  = S.stockFilter.myRefs ? 'var(--accent)' : '#F1F5F9';
      myBtn.style.borderColor = S.stockFilter.myRefs ? 'var(--accent)' : '#CBD5E1';
      myBtn.style.color       = S.stockFilter.myRefs ? 'white' : '#64748B';
      myBtn.textContent       = S.stockFilter.myRefs ? '★ Mes références' : '☆ Mes références';
    }
    const alBtn = document.getElementById('stock-alerts-btn');
    if (alBtn) {
      alBtn.style.background  = S.stockFilter.alerts ? '#FEF3C7' : '#F1F5F9';
      alBtn.style.borderColor = S.stockFilter.alerts ? '#D97706' : '#CBD5E1';
      alBtn.style.color       = S.stockFilter.alerts ? '#D97706' : '#64748B';
    }
    // Bouton "Toutes"
    const allBtn = document.getElementById('stock-famille-all');
    if (allBtn) allBtn.className = 'stock-famille-btn' + (cur === '' ? ' active' : '');
    // Boutons par famille
    wrap.innerHTML = S.stockFamilles
      .filter(Boolean)
      .map(f => `<button class="stock-famille-btn${f===cur?' active':''}" onclick="App.setStockFamille('${f.replace(/'/g,"\\'")}')">${f}</button>`)
      .join('');
  },

  _renderStockList() {
    const list = document.getElementById('stock-list');
    if (!list) return;

    const { search, famille, myRefs, alerts } = S.stockFilter;
    let items = S.stockData;

    if (myRefs)   items = items.filter(d => S.stockPrefs.has(d.ref));
    if (alerts)   items = items.filter(d => {
      if (!d.seuil || d.seuil <= 0) return false;
      const qty = this._calcStockActuel(d.ref, d.qte);
      return qty !== null && qty <= d.seuil;
    });
    if (famille)  items = items.filter(d => d.famille === famille);
    if (search)   items = items.filter(d =>
      d.ref.toLowerCase().includes(search) ||
      d.description.toLowerCase().includes(search) ||
      d.fournisseur.toLowerCase().includes(search)
    );

    const lbl = document.getElementById('stock-count-label');
    if (lbl) lbl.textContent = `${items.length} référence${items.length!==1?'s':''} affichée${items.length!==1?'s':''}${S.stockData.length ? ' sur ' + S.stockData.length : ''}`;

    if (!items.length) {
      list.innerHTML = `<div style="text-align:center;padding:40px 0;color:#94A3B8;">
        <div style="font-size:36px;margin-bottom:10px;">📭</div>
        <p style="font-size:14px;">${S.stockData.length ? 'Aucune référence ne correspond aux filtres' : 'Catalogue non chargé'}</p>
      </div>`;
      return;
    }

    list.innerHTML = items.map(d => {
      const isRel      = S.stockPrefs.has(d.ref);
      const calcQty    = this._calcStockActuel(d.ref, d.qte);
      const qtyTxt     = calcQty !== null ? `📦 ${calcQty}${d.seuil !== null ? '/' + d.seuil : ''}` : '📦 —';
      const hasDelta   = !!S.stockDeltas[d.ref];
      const calcStatus = d.seuil !== null && calcQty !== null
        ? (calcQty >= d.seuil ? 'ok' : 'low')
        : (calcQty !== null ? 'ok' : 'unknown');
      const qtyClass = calcStatus;
      const cardCls  = `stock-card${isRel?' relevant':''}${calcStatus==='low'?' stock-low':''}${hasDelta?' has-delta':''}`;

      const desc     = d.description.length > 90 ? d.description.substring(0,88)+'…' : d.description;
      const refSafe  = d.ref.replace(/'/g, "\\'");
      const refEsc   = CSS.escape(d.ref);

      // Analytics Layer 2
      const ana      = S.stockAnalytics[d.ref];
      const days     = this._calcDaysToRupture(d.ref, calcQty);
      const trendArrow = ana?.trend === 'up'   ? '↑'
                       : ana?.trend === 'down' ? '↓' : '';
      const trendCls   = ana?.trend || 'stable';
      const ruptureHtml = (days !== null && calcQty !== null)
        ? (days <= 0
            ? `<span class="sc-rupture">⛔ Rupture</span>`
            : `<span class="sc-rupture ok">~${days}j</span>`)
        : '';

      let thumbHtml = '';
      if (S.stockShowThumbs) {
        if (S.stockPhotos[d.ref]) {
          thumbHtml = `<img class="sc-thumb" data-ref="${d.ref.replace(/"/g,'&quot;')}" src="" alt="📷">`;
        } else {
          thumbHtml = `<div class="sc-thumb-ph" title="Aucune photo">📷</div>`;
        }
      }

      const batchQty = S.batchItems[d.ref] || 0;
      const batchCls = batchQty > 0 && S.batchMvType ? ' in-' + S.batchMvType : '';
      const fullCardCls = cardCls + batchCls;

      return `<div class="${fullCardCls}" id="scard-${refEsc}" style="padding:0;display:flex;align-items:stretch;">
        <div onclick="App.openStockDetail('${refSafe}')" style="flex:1;min-width:0;cursor:pointer;padding:8px 6px 8px 10px;">
          ${S.stockShowThumbs ? `<div style="float:left;margin-right:8px;">${thumbHtml}</div>` : ''}
          <div class="sc-head">
            <span class="sc-star${isRel?' on':''}" onclick="event.stopPropagation();App.toggleStockPref('${refSafe}')">${isRel?'★':'☆'}</span>
            <span class="sc-ref">${d.ref}</span>
            ${trendArrow ? `<span class="sc-trend ${trendCls}">${trendArrow}</span>` : ''}
            <span class="sc-qty ${qtyClass}">${qtyTxt}</span>
            <button onclick="event.stopPropagation();App.openSeuilModal('${refSafe}')" class="sc-seuil-edit" title="Modifier seuil d'alerte">✏️</button>
          </div>
          <div class="sc-desc">${desc}</div>
          <div class="sc-foot">
            ${d.retiree     ? `<span class="sc-bdg ret" title="Absente du dernier fichier du client, encore en stock">Retirée du catalogue client</span>` : ''}
            ${d.famille     ? `<span class="sc-bdg fam">${d.famille}</span>` : ''}
            ${d.fournisseur ? `<span class="sc-bdg fou">${d.fournisseur}</span>` : ''}
            ${d.refFourn    ? `<span class="sc-rfourn">${d.refFourn}</span>` : ''}
            ${ruptureHtml}
          </div>
        </div>
        <div style="flex-shrink:0;display:flex;align-items:center;padding:8px 10px 8px 8px;border-left:1.5px solid #F1F5F9;">
          <div class="batch-stepper">
            <button class="batch-minus" onclick="App.stepBatchQty('${refSafe}',-1)">−</button>
            <input class="batch-qty-input" type="number" id="bqi-${refEsc}" min="0"
              value="${batchQty || ''}" placeholder="0"
              oninput="App.setBatchQtyInput('${refSafe}',this.value)"
              onclick="this.select()">
            <button class="batch-plus" onclick="App.stepBatchQty('${refSafe}',1)">+</button>
          </div>
        </div>
      </div>`;
    }).join('');

    if (S.stockShowThumbs) this._loadVisibleThumbnails();
  },

  /* ─ Historique mouvements ─ */

  async loadStockHistory(force = false) {
    if (!force && S.historyLoaded) { this._renderHistoryList(); return; }
    if (!force && S.historyLoading) return;
    if (!S.apiUrl) return;
    S.historyLoading = true;
    const loading = document.getElementById('hist-loading');
    const list    = document.getElementById('shist-list');
    if (loading) loading.style.display = 'block';
    if (list)    list.innerHTML = '';
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=stock_recent_movements&limit=9999', {}, 30000);
      const data = await r.json();
      S.historyData   = (data.status === 'ok' ? data.movements : []) || [];
      S.historyOps    = this._groupMovements(S.historyData);
      S.historyLoaded = true;
      this._buildPoseHistory();
      if (S.view === 'stock-history') this._renderHistoryList();
      if (S.depsLoaded && S.view === 'departures') this._renderDepList();
    } catch(e) {
      if (list) list.innerHTML = `<div class="card" style="border-left:4px solid #F87171;color:#991B1B;font-size:13px;">Impossible de charger l'historique : ${e.message}</div>`;
    } finally {
      S.historyLoading = false;
      if (loading) loading.style.display = 'none';
    }
  },

  _groupMovements(movs) {
    const map = new Map();
    movs.forEach(m => {
      const ts  = Math.floor(new Date(m.date).getTime() / 2000); // fenêtre 2s
      const key = ts + '|' + m.type + '|' + (m.note || '');
      if (!map.has(key)) map.set(key, { key, date: m.date, type: m.type, note: m.note || '', items: [] });
      map.get(key).items.push(m);
    });
    return [...map.values()]
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  _opDisplayType(type, note) {
    if (type === 'sortie' && note.startsWith('[Pose ')) return 'pose';
    return type;
  },

  _opRef(note, displayType) {
    if (displayType === 'pose') {
      const code  = (note.match(/\[Pose\s+(\S+)\]/) || [])[1] || '';
      const extra = note.replace(/^\[Pose\s+\S+\]\s*/, '').trim();
      return extra || code;
    }
    return note || '—';
  },

  _poseCode(note) {
    return (note.match(/\[Pose\s+(\S+)\]/) || [])[1] || '';
  },

  _consolidatePoseOps(ops) {
    const nonPose = [];
    const poseMap = {};
    ops.forEach(op => {
      if (this._opDisplayType(op.type, op.note) !== 'pose') { nonPose.push(op); return; }
      const code = this._poseCode(op.note);
      if (!code) { nonPose.push(op); return; }
      if (!poseMap[code]) {
        poseMap[code] = { type: op.type, note: op.note, key: op.key, date: op.date,
                          items: op.items.map(i => Object.assign({}, i)), _consolidated: true };
      } else {
        op.items.forEach(item => {
          const ex = poseMap[code].items.find(i => i.ref === item.ref);
          if (ex) ex.qty = (Number(ex.qty) || 0) + (Number(item.qty) || 0);
          else poseMap[code].items.push(Object.assign({}, item));
        });
        if (new Date(op.date) > new Date(poseMap[code].date)) {
          poseMap[code].date = op.date;
          poseMap[code].key  = op.key;
          poseMap[code].note = op.note;
        }
      }
    });
    return nonPose.concat(Object.values(poseMap))
                  .sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  _buildPoseHistory() {
    S.poseHistory = new Set();
    S.historyData.forEach(m => {
      if (m.type === 'sortie' && m.note && m.note.startsWith('[Pose ')) {
        const code = (m.note.match(/\[Pose\s+(\S+)\]/) || [])[1] || '';
        if (code) S.poseHistory.add(code);
      }
    });
  },

  setHistFilter(type) {
    S.histFilter.type = type;
    document.querySelectorAll('.hist-type-btn').forEach(btn => {
      const active = btn.dataset.htype === type;
      btn.style.background  = active ? 'var(--brand)' : '#F8FAFC';
      btn.style.borderColor = active ? 'var(--brand)' : '#E2E8F0';
      btn.style.color       = active ? 'white'        : '#64748B';
    });
    this._renderHistoryList();
  },

  setHistSearch(val) {
    S.histFilter.search = val.toLowerCase().trim();
    this._renderHistoryList();
  },

  _renderHistoryList() {
    const list = document.getElementById('shist-list');
    if (!list) return;
    const { type: fType, search } = S.histFilter;

    let ops = S.historyOps;

    if (fType) {
      ops = ops.filter(op => this._opDisplayType(op.type, op.note) === fType);
    }
    if (search) {
      ops = ops.filter(op => {
        const dt = this._opDisplayType(op.type, op.note);
        if (this._opRef(op.note, dt).toLowerCase().includes(search)) return true;
        return op.items.some(m =>
          m.ref.toLowerCase().includes(search) ||
          (S.stockData.find(d => d.ref === m.ref)?.description || '').toLowerCase().includes(search)
        );
      });
    }

    // Consolider les poses : une seule ligne par module (toutes sessions fusionnées)
    ops = this._consolidatePoseOps(ops);

    // KPIs
    const totalOps   = ops.length;
    const totalLines = ops.reduce((s, op) => s + op.items.length, 0);
    const lastLiv    = S.historyOps.find(op => op.type === 'entrée');
    const lastLivStr = lastLiv ? new Date(lastLiv.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) : '—';
    const kpiOps   = document.getElementById('hist-kpi-ops');
    const kpiLines = document.getElementById('hist-kpi-lines');
    const kpiLiv   = document.getElementById('hist-kpi-lastliv');
    if (kpiOps)   kpiOps.textContent   = totalOps;
    if (kpiLines) kpiLines.textContent = totalLines;
    if (kpiLiv)   kpiLiv.textContent   = lastLivStr;

    const lbl = document.getElementById('hist-count-label');
    if (lbl) lbl.textContent = `${ops.length} opération${ops.length !== 1 ? 's' : ''}${S.historyOps.length ? ' sur ' + S.historyOps.length : ''}`;

    if (!ops.length) {
      list.innerHTML = `<div style="text-align:center;padding:40px 0;color:#94A3B8;"><div style="font-size:32px;margin-bottom:8px;">📭</div><p style="font-size:13px;">Aucune opération trouvée</p></div>`;
      return;
    }

    list.innerHTML = ops.map((op, idx) => {
      const dt       = this._opDisplayType(op.type, op.note);
      const ref      = this._opRef(op.note, dt);
      const dateStr  = new Date(op.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
      const timeStr  = new Date(op.date).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
      const nRefs    = op.items.length;
      const nUnits   = op.items.reduce((s, m) => s + (Number(m.qty) || 0), 0);
      const typeLabels = { entrée:'Entrée', sortie:'Sortie', pose:'Pose', inventaire:'Inventaire' };
      const lvLink   = S.lvLinks[op.key];
      const lvBadge  = lvLink
        ? `<span style="margin-left:6px;font-size:10px;font-weight:600;background:#DBEAFE;color:#1D4ED8;padding:2px 7px;border-radius:10px;white-space:nowrap;">📄 LV N° ${lvLink.display || lvLink.numero}</span>`
        : '';
      const lvBtn    = (op.type === 'sortie' && dt !== 'pose' && !lvLink)
        ? `<button onclick="App.createLvFromOp('${encodeURIComponent(op.key)}')"
            style="margin-top:8px;padding:6px 12px;background:#EFF6FF;color:#1D4ED8;border:1.5px solid #BFDBFE;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;width:100%;">
            📄 Créer LV / CMR</button>`
        : '';
      const poseBtn  = (() => {
        if (dt !== 'pose') return '';
        const pc = this._poseCode(op.note);
        if (!pc) return '';
        const dep  = S.depsLoaded ? S.deps.find(d => (d.code||'').toUpperCase() === pc.toUpperCase()) : null;
        const pcs  = pc.replace(/'/g,"&#39;");
        const mods = (dep?.codeModule||'').replace(/'/g,"&#39;");
        const chs  = (dep?.chantier||'').replace(/'/g,"&#39;");
        return `<button onclick="App.openPoseModal('${pcs}','${mods}','${chs}')"
          style="margin-top:8px;padding:6px 12px;background:#FFF7ED;color:#C2410C;border:1.5px solid #FED7AA;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;width:100%;">
          🔧 Gérer les pièces posées</button>`;
      })();
      return `<div class="hist-op-card t-${dt}">
        <div class="hist-op-header" onclick="App.toggleHistOp(${idx})">
          <span class="hist-badge ${dt}">${typeLabels[dt] || dt}</span>
          <span class="hist-op-ref">${ref}</span>
          ${lvBadge}
          <span class="hist-op-date">${dateStr} ${timeStr}</span>
          <span class="hist-op-meta">${nRefs}r · ${nUnits}u</span>
          <span class="hist-op-chevron" id="hist-chev-${idx}">›</span>
        </div>
        <div class="hist-op-body" id="hist-body-${idx}">
          ${lvBtn}${poseBtn}
          <table class="hist-detail-table">
            <thead><tr><th>Réf.</th><th>Désignation</th><th style="text-align:right;">Qté</th></tr></thead>
            <tbody>${op.items.map(m => {
              const desc = S.stockData.find(d => d.ref === m.ref)?.description || '';
              return `<tr><td><span class="hist-detail-ref">${m.ref}</span></td><td>${desc}</td><td style="text-align:right;font-weight:700;color:#1E293B;">${m.qty}</td></tr>`;
            }).join('')}</tbody>
          </table>
          ${op.note && dt !== 'pose' ? `<div style="margin-top:6px;font-size:10px;color:#94A3B8;">Note : ${op.note}</div>` : ''}
          ${op.items[0]?.user ? `<div style="margin-top:2px;font-size:10px;color:#94A3B8;">Par : ${op.items[0].user}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  toggleHistOp(idx) {
    const body = document.getElementById('hist-body-' + idx);
    const chev = document.getElementById('hist-chev-' + idx);
    if (!body) return;
    const open = body.classList.toggle('open');
    if (chev) chev.classList.toggle('open', open);
  },

  /* ─ Historique : sous-onglets ─ */

  switchHistTab(tab) {
    ['ops', 'prod', 'bilan'].forEach(t => {
      document.getElementById('shtab-' + t)?.classList.toggle('active', t === tab);
      const pane = document.getElementById('shist-pane-' + t);
      if (pane) pane.style.display = t === tab ? 'block' : 'none';
    });
    const opsFilters = document.getElementById('shist-ops-filters');
    if (opsFilters) opsFilters.style.display = tab === 'ops' ? '' : 'none';
    if (tab === 'prod'  && S.historyLoaded) { this._renderHistProd(); }
    if (tab === 'bilan' && S.historyLoaded) { this._renderHistBilan(); }
  },

  /* ─ Historique : onglet "Par produit" ─ */

  _renderHistProd() {
    this._renderTopConsumed();
    this._renderProdChips('');
    const det = document.getElementById('shist-prod-detail');
    if (det) det.style.display = 'none';
    S.selHistProd = null;
  },

  _renderTopConsumed() {
    const cmap = {}, dmap = {};
    S.historyOps.forEach(op => {
      if (op.type === 'sortie') {
        op.items.forEach(m => {
          cmap[m.ref] = (cmap[m.ref] || 0) + (Number(m.qty) || 0);
          dmap[m.ref] = S.stockData.find(d => d.ref === m.ref)?.description || m.ref;
        });
      }
    });
    const top = Object.entries(cmap)
      .map(([ref, qty]) => ({ ref, des: dmap[ref], qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 7);
    const maxQ = top[0]?.qty || 1;
    const barColors = ['#1A5276','#1D9E75','#D85A30','#3266AD','#BA7517','#0F6E56','#993C1D'];
    const el = document.getElementById('shist-top-list');
    if (!el) return;
    if (!top.length) {
      el.innerHTML = '<p style="text-align:center;padding:14px 0;color:#94A3B8;font-size:12px;">Aucune sortie enregistrée</p>';
      return;
    }
    el.innerHTML = top.map((p, i) => {
      const refSafe = p.ref.replace(/'/g, "\\'");
      const pct = Math.round(p.qty / maxQ * 100);
      return `<div class="shist-top-row" onclick="App.selectHistProd('${refSafe}')">
        <span style="font-size:10px;color:#94A3B8;min-width:14px;text-align:right;font-weight:600;">${i + 1}</span>
        <span style="font-family:'Courier New',monospace;font-size:11px;min-width:80px;white-space:nowrap;color:var(--brand);">${p.ref}</span>
        <div class="shist-bar-bg"><div class="shist-bar-fill" style="width:${pct}%;background:${barColors[i % barColors.length]};"></div></div>
        <span style="font-size:11px;color:#64748B;min-width:36px;text-align:right;">${p.qty}&nbsp;u.</span>
      </div>`;
    }).join('');
  },

  _renderProdChips(q) {
    const query = (q || '').toLowerCase();
    const refs = new Set();
    S.historyOps.forEach(op => op.items.forEach(m => refs.add(m.ref)));
    let prods = [...refs].map(ref => ({
      ref,
      des: S.stockData.find(d => d.ref === ref)?.description || ''
    })).sort((a, b) => a.ref.localeCompare(b.ref));
    if (query) prods = prods.filter(p =>
      p.ref.toLowerCase().includes(query) || p.des.toLowerCase().includes(query)
    );
    const el = document.getElementById('shist-chips');
    if (!el) return;
    el.innerHTML = prods.map(p => {
      const refSafe = p.ref.replace(/'/g, "\\'");
      const sel = S.selHistProd === p.ref ? ' sel' : '';
      return `<div class="shist-chip${sel}" onclick="App.selectHistProd('${refSafe}')">${p.ref}</div>`;
    }).join('');
  },

  selectHistProd(ref) {
    S.selHistProd = ref;
    this._renderProdChips(document.getElementById('shist-prod-search')?.value || '');
    const sd  = S.stockData.find(d => d.ref === ref);
    const des = sd?.description || ref;
    const tl  = this._prodTimeline(ref);
    const stock = sd?.stock ?? (tl.length ? tl[tl.length - 1].run : '—');
    const conso = this._prodConso(ref);
    const vals  = tl.map(t => t.run);
    const dates = tl.map(t => t.date);
    const typeLabels = { entrée:'Entrée', sortie:'Sortie', pose:'Pose', inventaire:'Inventaire' };
    document.getElementById('spd-ref').textContent   = ref;
    document.getElementById('spd-des').textContent   = des;
    document.getElementById('spd-stock').textContent = stock + ' u.';
    document.getElementById('spd-conso').textContent = conso + ' u. consommées';
    document.getElementById('spd-spark').innerHTML   = vals.length >= 2 ? this._makeSpark(vals, dates)
      : '<p style="color:#94A3B8;font-size:11px;text-align:center;padding:8px 0;">Pas assez de points pour le graphique</p>';
    document.getElementById('spd-rows').innerHTML = [...tl].reverse().map(t => {
      const d = new Date(t.date).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'2-digit' });
      const dStr  = t.delta === null ? '= ' + t.qty : (t.delta >= 0 ? '+' + t.delta : '' + t.delta);
      const dCol  = t.delta === null ? '#64748B' : t.delta > 0 ? '#15803D' : '#DC2626';
      return `<tr style="border-top:1px solid #F1F5F9;">
        <td style="padding:5px 0;color:#94A3B8;white-space:nowrap;font-size:11px;">${d}</td>
        <td style="padding:5px 6px;"><span class="hist-badge ${t.dt}" style="font-size:9px;">${typeLabels[t.dt] || t.dt}</span></td>
        <td style="padding:5px 0;text-align:right;font-weight:700;color:${dCol};font-size:12px;">${dStr}</td>
        <td style="padding:5px 0;text-align:right;font-weight:800;color:#1E293B;font-size:12px;">${t.run}</td>
      </tr>`;
    }).join('');
    const det = document.getElementById('shist-prod-detail');
    if (det) { det.style.display = 'block'; setTimeout(() => det.scrollIntoView({ behavior:'smooth', block:'nearest' }), 50); }
  },

  _prodTimeline(ref) {
    const sorted = [...S.historyOps]
      .filter(op => op.items.some(m => m.ref === ref))
      .sort((a, b) => a.date < b.date ? -1 : 1);
    let run = 0;
    return sorted.flatMap(op => {
      const item = op.items.find(m => m.ref === ref);
      if (!item) return [];
      const qty = Number(item.qty) || 0;
      const dt  = this._opDisplayType(op.type, op.note);
      if (op.type === 'inventaire') { run = qty; }
      else if (op.type === 'entrée') { run += qty; }
      else { run -= qty; }
      const delta = op.type === 'inventaire' ? null : (op.type === 'entrée' ? qty : -qty);
      return [{ date: op.date, dt, delta, qty, run }];
    });
  },

  _prodConso(ref) {
    let c = 0;
    S.historyOps.forEach(op => {
      if (op.type === 'sortie') {
        const item = op.items.find(m => m.ref === ref);
        if (item) c += Number(item.qty) || 0;
      }
    });
    return c;
  },

  _makeSpark(vals, dates) {
    if (vals.length < 2) return '';
    const W = 400, H = 56, pad = 6;
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const px = vals.map((v, i) => ({
      x: +(pad + (i / (vals.length - 1)) * (W - pad * 2)).toFixed(1),
      y: +(pad + (1 - (v - mn) / rng) * (H - pad * 2)).toFixed(1)
    }));
    const pts  = px.map(p => p.x + ',' + p.y).join(' ');
    const area = `M${px[0].x},${H - pad} ` + px.map(p => `L${p.x},${p.y}`).join(' ') + ` L${px[px.length - 1].x},${H - pad}Z`;
    const stroke = '#1A5276', fill = 'rgba(26,82,118,0.07)';
    const dots = px.filter((_, i) => i === 0 || i === px.length - 1 || vals[i] !== vals[i - 1])
      .map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${stroke}"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H + 10}" style="width:100%;height:52px;" preserveAspectRatio="none">
      <path d="${area}" fill="${fill}"/>
      <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>`;
  },

  /* ─ Historique : onglet "Bilan" ─ */

  _renderHistBilan() {
    const md = {};
    S.historyOps.forEach(op => {
      const mo = op.date.slice(0, 7);
      if (!md[mo]) md[mo] = { e:0, eL:0, eU:0, s:0, sL:0, sU:0, p:0, pL:0, pU:0, i:0, iL:0 };
      const nb = op.items.length;
      const tq = op.items.reduce((a, m) => a + (Number(m.qty) || 0), 0);
      const dt = this._opDisplayType(op.type, op.note);
      if (op.type === 'entrée')       { md[mo].e++; md[mo].eL += nb; md[mo].eU += tq; }
      else if (dt === 'pose')         { md[mo].p++; md[mo].pL += nb; md[mo].pU += tq; }
      else if (op.type === 'sortie')  { md[mo].s++; md[mo].sL += nb; md[mo].sU += tq; }
      else if (op.type === 'inventaire') { md[mo].i++; md[mo].iL += nb; }
    });
    const mos = Object.keys(md).sort().reverse();
    const cnt = document.getElementById('shist-bilan-cnt');
    if (!cnt) return;
    if (!mos.length) {
      cnt.innerHTML = '<p style="text-align:center;padding:32px 0;color:#94A3B8;font-size:13px;">Aucune donnée</p>';
      return;
    }
    const cell = (label, n, sub, color) => `<div class="shist-bilan-cell">
      <p style="color:#94A3B8;margin:0 0 4px;font-size:10px;">${label}</p>
      <p style="font-size:18px;font-weight:800;margin:0;${color ? 'color:' + color : ''}">${n}</p>
      <p style="font-size:9px;color:#94A3B8;margin:3px 0 0;">${sub}</p>
    </div>`;
    cnt.innerHTML = mos.map(mo => {
      const dl = new Date(mo + '-01T00:00:00').toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
      const v  = md[mo];
      return `<div class="shist-bilan-card">
        <p style="font-weight:700;font-size:14px;margin:0 0 2px;text-transform:capitalize;color:#1E293B;">${dl}</p>
        <div class="shist-bilan-grid">
          ${cell('Livraisons', v.e, v.eL + ' réf · ' + v.eU + ' u.', '#15803D')}
          ${cell('Sorties', v.s, v.sL + ' réf · ' + v.sU + ' u.', '#DC2626')}
          ${cell('Poses', v.p, v.pL + ' réf · ' + v.pU + ' u.', '#6B21A8')}
          ${cell('Inventaires', v.i, v.iL + ' réf vérif.', '')}
        </div>
      </div>`;
    }).join('');
  },

  /* ─ Saisie pose depuis LOXAM ─ */

  openPoseModal(code, codeModule, chantier) {
    S.poseModuleCode  = code;
    S.poseModuleLabel = [codeModule, chantier].filter(Boolean).join(' — ') || code;
    S.poseItems       = {};
    S.poseViewItems   = [];
    const modal = document.getElementById('pose-modal');
    const lbl   = document.getElementById('pose-module-label');
    const inp   = document.getElementById('pose-search-input');
    const res   = document.getElementById('pose-search-results');
    if (lbl) lbl.textContent = S.poseModuleLabel;
    if (inp) { inp.value = ''; }
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    this._renderPoseItems();
    // Afficher les poses existantes
    if (S.historyLoaded) {
      this._renderPoseExisting(code);
    } else {
      const sec = document.getElementById('pose-existing-section');
      if (sec) {
        sec.style.display = '';
        sec.innerHTML = '<div style="padding:8px 0;color:#94A3B8;font-size:12px;text-align:center;">⏳ Chargement de l\'historique…</div>';
      }
      this._loadPoseHistory(code);
    }
    if (modal) modal.style.display = 'flex';
    setTimeout(() => inp?.focus(), 100);
  },

  closePoseModal() {
    const modal = document.getElementById('pose-modal');
    if (modal) modal.style.display = 'none';
  },

  _renderPoseExisting(code) {
    const section = document.getElementById('pose-existing-section');
    if (!section) return;
    const poses = S.historyData.filter(m => m.type === 'sortie' && this._poseCode(m.note) === code);
    S.poseViewItems = poses;
    if (!poses.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    section.innerHTML = `
      <div class="pose-existing-label">Déjà enregistré</div>
      <div class="pose-existing-list">
        ${poses.map((m, i) => {
          const desc = S.stockData.find(d => d.ref === m.ref)?.description || '';
          const dt   = new Date(m.date);
          const dStr = isNaN(dt) ? '' : dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'}) + ' ' + dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
          return `<div class="pose-existing-row">
            <div style="flex:1;min-width:0;">
              <span class="pose-item-ref">${m.ref}</span>
              ${desc ? `<span class="pose-item-desc">${desc.length>42?desc.substring(0,40)+'…':desc}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
              <span id="pose-qty-${i}" style="font-size:13px;font-weight:700;color:#1E293B;min-width:28px;text-align:right;">×${m.qty}</span>
              <span id="pose-edit-${i}" style="display:none;align-items:center;gap:3px;">
                <input id="pose-edit-inp-${i}" type="number" min="1" value="${m.qty}"
                  style="width:52px;padding:3px 5px;border:1.5px solid #CBD5E1;border-radius:6px;font-size:13px;text-align:center;"
                  onkeydown="if(event.key==='Enter')App.confirmEditPoseQty(${i});else if(event.key==='Escape')App._cancelEditPoseQty(${i})">
                <button onclick="App.confirmEditPoseQty(${i})" id="pose-edit-confirm-${i}"
                  style="background:var(--brand);color:white;border:none;padding:4px 7px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;line-height:1;">✓</button>
                <button onclick="App._cancelEditPoseQty(${i})"
                  style="background:none;border:none;color:#94A3B8;font-size:14px;cursor:pointer;padding:2px;line-height:1;">✕</button>
              </span>
              <span style="font-size:10px;color:#94A3B8;white-space:nowrap;">${dStr}</span>
              <button onclick="App.editPoseQty(${i})" title="Modifier la quantité"
                style="background:none;border:none;color:#64748B;font-size:14px;cursor:pointer;padding:2px 4px;line-height:1;flex-shrink:0;">✏</button>
              <button onclick="App.deletePoseEntry(${i})" title="Supprimer ce mouvement"
                style="background:none;border:none;color:#DC2626;font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;flex-shrink:0;">🗑</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  },

  async _loadPoseHistory(code) {
    if (S.historyLoading) return;
    if (S.historyLoaded) { this._renderPoseExisting(code); return; }
    S.historyLoading = true;
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=stock_recent_movements&limit=9999', {}, 30000);
      const data = await r.json();
      S.historyData   = (data.status === 'ok' ? data.movements : []) || [];
      S.historyOps    = this._groupMovements(S.historyData);
      S.historyLoaded = true;
      this._buildPoseHistory();
      if (S.poseModuleCode === code && document.getElementById('pose-modal')?.style.display !== 'none') {
        this._renderPoseExisting(code);
      }
      if (S.depsLoaded) this._renderDepList();
    } catch(e) {
      const sec = document.getElementById('pose-existing-section');
      if (sec) sec.innerHTML = `<div style="padding:8px 0;color:#DC2626;font-size:12px;text-align:center;">Erreur de chargement</div>`;
    } finally {
      S.historyLoading = false;
    }
  },

  async deletePoseEntry(idx) {
    const m = S.poseViewItems[idx];
    if (!m) return;
    if (!confirm(`Supprimer la pose de ×${m.qty} ${m.ref} ?\nCette action va remettre la quantité en stock.`)) return;
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ action:'delete_mouvement', ref:m.ref, type:m.type, qty:m.qty, note:m.note, date:m.date }));
      const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 15000);
      const data = await resp.json();
      if (data.status === 'ok') {
        this.toast(`✓ Pose supprimée (${m.ref} ×${m.qty})`);
        const item = S.stockData.find(i => i.ref === m.ref);
        if (item && item.qte !== null) item.qte += m.qty;
        const hi = S.historyData.findIndex(h => h.ref===m.ref && h.type===m.type && h.note===m.note && h.date===m.date);
        if (hi > -1) S.historyData.splice(hi, 1);
        S.historyOps = this._groupMovements(S.historyData);
        this._buildPoseHistory();
        this._renderPoseExisting(S.poseModuleCode);
        if (S.depsLoaded) this._renderDepList();
      } else {
        this.toast('Erreur : ' + (data.error || 'inconnue'));
      }
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
    }
  },

  editPoseQty(idx) {
    const qtyEl  = document.getElementById('pose-qty-' + idx);
    const editEl = document.getElementById('pose-edit-' + idx);
    if (!qtyEl || !editEl) return;
    qtyEl.style.display  = 'none';
    editEl.style.display = 'flex';
    document.getElementById('pose-edit-inp-' + idx)?.focus();
  },

  _cancelEditPoseQty(idx) {
    const qtyEl  = document.getElementById('pose-qty-' + idx);
    const editEl = document.getElementById('pose-edit-' + idx);
    if (qtyEl)  qtyEl.style.display  = '';
    if (editEl) editEl.style.display = 'none';
  },

  async confirmEditPoseQty(idx) {
    const m = S.poseViewItems[idx];
    if (!m) return;
    const inp = document.getElementById('pose-edit-inp-' + idx);
    if (!inp) return;
    const newQty = parseInt(inp.value, 10);
    if (isNaN(newQty) || newQty <= 0) { this.toast('Quantité invalide'); return; }
    if (newQty === m.qty) { this._cancelEditPoseQty(idx); return; }
    const confirmBtn = document.getElementById('pose-edit-confirm-' + idx);
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      const fd1 = new FormData();
      fd1.append('payload', JSON.stringify({ action:'delete_mouvement', ref:m.ref, type:m.type, qty:m.qty, note:m.note, date:m.date }));
      const r1 = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd1 }, 15000);
      const d1 = await r1.json();
      if (d1.status !== 'ok') { this.toast('Erreur suppression : ' + (d1.error || 'inconnue')); return; }
      const u    = S.currentUser;
      const user = u ? `${u.prenom} ${u.nom}` : (m.user || 'inconnu');
      const fd2  = new FormData();
      fd2.append('payload', JSON.stringify({ action:'add_mouvement', ref:m.ref, type:'sortie', qty:newQty, note:m.note, user }));
      const r2 = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd2 }, 15000);
      const d2 = await r2.json();
      if (d2.status !== 'ok') { this.toast('Erreur enregistrement : ' + (d2.error || 'inconnue')); return; }
      this.toast(`✓ Qté modifiée : ${m.ref} ×${newQty}`);
      const qtyDiff = newQty - m.qty;
      const item = S.stockData.find(i => i.ref === m.ref);
      if (item && item.qte !== null) item.qte -= qtyDiff;
      const hi = S.historyData.findIndex(h => h.ref===m.ref && h.type===m.type && h.note===m.note && h.date===m.date);
      if (hi > -1) S.historyData[hi] = Object.assign({}, S.historyData[hi], { qty: newQty });
      S.historyOps = this._groupMovements(S.historyData);
      this._buildPoseHistory();
      this._renderPoseExisting(S.poseModuleCode);
      if (S.depsLoaded) this._renderDepList();
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  },

  _stockSearchHits(q, limit) {
    const numeric = /^\d+$/.test(q);
    if (numeric) {
      return S.stockData.filter(d => d.ref.toLowerCase().includes(q)).slice(0, limit);
    }
    const exact   = S.stockData.filter(d => d.ref.toLowerCase() === q);
    const starts  = S.stockData.filter(d => d.ref.toLowerCase().startsWith(q) && d.ref.toLowerCase() !== q);
    const inRef   = S.stockData.filter(d => { const r = d.ref.toLowerCase(); return r.includes(q) && !r.startsWith(q); });
    const inDesc  = S.stockData.filter(d => !d.ref.toLowerCase().includes(q) && d.description.toLowerCase().includes(q));
    return [...exact, ...starts, ...inRef, ...inDesc].slice(0, limit);
  },
  poseSearch(val) {
    const q   = val.toLowerCase().trim();
    const res = document.getElementById('pose-search-results');
    if (!res) return;
    if (!q) { res.style.display = 'none'; res.innerHTML = ''; return; }
    const hits = this._stockSearchHits(q, 20);
    if (!hits.length) {
      res.style.display = 'block';
      res.innerHTML = '<div style="padding:10px 12px;color:#94A3B8;font-size:12px;">Aucun résultat</div>';
      return;
    }
    res.style.display = 'block';
    res.innerHTML = hits.map(d => {
      const refSafe = d.ref.replace(/'/g, "\\'");
      return `<div class="pose-result-row" onclick="App.addPoseRef('${refSafe}')">
        <span class="pose-result-ref">${d.ref}</span>
        <span class="pose-result-desc">${d.description}</span>
      </div>`;
    }).join('');
  },

  addPoseRef(ref) {
    if (!S.poseItems[ref]) S.poseItems[ref] = 1;
    const inp = document.getElementById('pose-search-input');
    const res = document.getElementById('pose-search-results');
    if (inp) inp.value = '';
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    this._renderPoseItems();
    setTimeout(() => {
      const qi = document.getElementById('pqi-' + CSS.escape(ref));
      if (qi) { qi.focus(); qi.select(); }
    }, 50);
  },

  _poseSearchKey(e) {
    this._suggestKeyDown(e, 'pose-search-results', i => {
      const r = document.querySelectorAll('#pose-search-results .pose-result-row')[i];
      if (r) r.click();
    }, true);
  },

  _poseQtyKey(e, ref) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    this.setPoseQtyInput(ref, e.target.value);
    const si = document.getElementById('pose-search-input');
    if (si) { si.value = ''; this.poseSearch(''); si.focus(); }
  },

  stepPoseQty(ref, delta) {
    const cur  = S.poseItems[ref] || 0;
    const next = Math.max(0, cur + delta);
    if (next === 0) delete S.poseItems[ref];
    else S.poseItems[ref] = next;
    const inp = document.getElementById('pqi-' + CSS.escape(ref));
    if (inp) inp.value = next || '';
    this._updatePoseSubmitBtn();
  },

  setPoseQtyInput(ref, val) {
    const qty = parseFloat(val);
    if (!isNaN(qty) && qty > 0) S.poseItems[ref] = qty;
    else delete S.poseItems[ref];
    this._updatePoseSubmitBtn();
  },

  removePoseRef(ref) {
    delete S.poseItems[ref];
    this._renderPoseItems();
  },

  _updatePoseSubmitBtn() {
    const btn = document.getElementById('pose-submit-btn');
    if (btn) btn.style.display = Object.keys(S.poseItems).length > 0 ? 'inline-block' : 'none';
  },

  _renderPoseItems() {
    const list = document.getElementById('pose-items-list');
    const empty = document.getElementById('pose-empty-msg');
    if (!list) return;
    const refs = Object.keys(S.poseItems);
    if (!refs.length) {
      if (empty) empty.style.display = 'block';
      list.innerHTML = '';
      list.appendChild(empty || document.createElement('div'));
      this._updatePoseSubmitBtn();
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = refs.map(ref => {
      const refEsc  = CSS.escape(ref);
      const refSafe = ref.replace(/'/g, "\\'");
      const qty     = S.poseItems[ref] || 1;
      const desc    = S.stockData.find(d => d.ref === ref)?.description || '';
      return `<div class="pose-item-row">
        <div style="flex:1;min-width:0;">
          <span class="pose-item-ref">${ref}</span>
          ${desc ? `<span class="pose-item-desc">${desc.length > 45 ? desc.substring(0,43)+'…' : desc}</span>` : ''}
        </div>
        <div class="batch-stepper">
          <button class="batch-minus" onclick="App.stepPoseQty('${refSafe}',-1)">−</button>
          <input class="batch-qty-input" type="number" id="pqi-${refEsc}" min="1"
            value="${qty}"
            oninput="App.setPoseQtyInput('${refSafe}',this.value)"
            onkeydown="App._poseQtyKey(event,'${refSafe}')"
            onclick="this.select()">
          <button class="batch-plus" onclick="App.stepPoseQty('${refSafe}',1)">+</button>
        </div>
        <button class="pose-item-del" onclick="App.removePoseRef('${refSafe}')">×</button>
      </div>`;
    }).join('');
    this._updatePoseSubmitBtn();
  },

  async submitPose() {
    const code  = S.poseModuleCode;
    const items = Object.entries(S.poseItems);
    if (!items.length) { this.toast('Aucune pièce saisie'); return; }
    if (!code)         { this.toast('Code module manquant'); return; }

    const u    = S.currentUser;
    const user = u ? `${u.prenom} ${u.nom}` : 'inconnu';
    const note = `[Pose ${code}]${S.poseModuleLabel && S.poseModuleLabel !== code ? ' ' + S.poseModuleLabel : ''}`;

    const btn = document.getElementById('pose-submit-btn');
    if (btn) btn.disabled = true;
    this.toast(`⏳ Enregistrement de ${items.length} pièce${items.length > 1 ? 's' : ''}…`);

    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        action: 'add_mouvements_batch',
        type:   'sortie',
        user,
        note,
        items:  items.map(([ref, qty]) => ({ ref, qty })),
      }));
      const resp = await _fetchWithTimeout(S.apiUrl, { method: 'POST', body: fd }, 30000);
      const data = await resp.json();
      if (data.status === 'ok') {
        this.toast(`✓ ${data.count} pièce${data.count > 1 ? 's' : ''} enregistrée${data.count > 1 ? 's' : ''}`);
        const now = new Date().toISOString();
        // Mise à jour locale des stocks + injection dans historyData
        items.forEach(([ref, qty]) => {
          const item = S.stockData.find(i => i.ref === ref);
          if (item && item.qte !== null) item.qte = item.qte - qty;
          if (S.historyLoaded) {
            S.historyData.unshift({ date: now, ref, type: 'sortie', qty, user, note });
          }
        });
        if (S.historyLoaded) {
          S.historyOps = this._groupMovements(S.historyData);
        }
        // Marquer la pose dans l'historique en mémoire
        S.poseHistory.add(code);
        S.analyticsLoaded = false;
        S.dashboardLoaded = false;
        this.closePoseModal();
        if (S.depsLoaded) this._renderDepList();
      } else {
        this.toast('Erreur : ' + (data.error || 'inconnue'));
      }
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /* ─ Saisie rapide (dashboard) ─ */

  openSaisieModal() {
    S.saisieItems = {};
    S.saisieType  = 'entrée';
    S.saisieNote  = '';
    const modal = document.getElementById('saisie-modal');
    const note  = document.getElementById('saisie-note-input');
    const inp   = document.getElementById('saisie-search-input');
    const res   = document.getElementById('saisie-search-results');
    if (note) note.value = '';
    if (inp)  inp.value  = '';
    if (res)  { res.style.display = 'none'; res.innerHTML = ''; }
    this.setSaisieType('entrée');
    this._renderSaisieItems();
    if (modal) modal.style.display = 'flex';
    setTimeout(() => inp?.focus(), 100);
  },

  closeSaisieModal() {
    const modal = document.getElementById('saisie-modal');
    if (modal) modal.style.display = 'none';
  },

  setSaisieType(type) {
    S.saisieType = type;
    ['entrée','sortie','inventaire'].forEach(t => {
      const btn = document.getElementById('saisie-btn-' + t);
      if (!btn) return;
      const cls = t === 'entrée' ? 'entree' : t;
      btn.classList.toggle('active', t === type);
    });
  },

  saisieSearch(val) {
    const q   = val.toLowerCase().trim();
    const res = document.getElementById('saisie-search-results');
    if (!res) return;
    if (!q) { res.style.display = 'none'; res.innerHTML = ''; return; }
    const hits = this._stockSearchHits(q, 20);
    if (!hits.length) {
      res.style.display = 'block';
      res.innerHTML = '<div style="padding:10px 12px;color:#94A3B8;font-size:12px;">Aucun résultat</div>';
      return;
    }
    res.style.display = 'block';
    res.innerHTML = hits.map(d => {
      const refSafe = d.ref.replace(/'/g, "\\'");
      return `<div class="pose-result-row" onclick="App.addSaisieRef('${refSafe}')">
        <span class="pose-result-ref">${d.ref}</span>
        <span class="pose-result-desc">${d.description}</span>
      </div>`;
    }).join('');
  },

  _saisieSearchKey(e) {
    this._suggestKeyDown(e, 'saisie-search-results', i => {
      const r = document.querySelectorAll('#saisie-search-results .pose-result-row')[i];
      if (r) r.click();
    }, true);
  },

  addSaisieRef(ref) {
    if (!S.saisieItems[ref]) S.saisieItems[ref] = 1;
    const inp = document.getElementById('saisie-search-input');
    const res = document.getElementById('saisie-search-results');
    if (inp) inp.value = '';
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    this._renderSaisieItems();
    setTimeout(() => {
      const qi = document.getElementById('sqi-' + CSS.escape(ref));
      if (qi) { qi.focus(); qi.select(); }
    }, 50);
  },

  stepSaisieQty(ref, delta) {
    const cur  = S.saisieItems[ref] || 0;
    const next = Math.max(0, cur + delta);
    if (next === 0) delete S.saisieItems[ref];
    else S.saisieItems[ref] = next;
    const inp = document.getElementById('sqi-' + CSS.escape(ref));
    if (inp) inp.value = next || '';
    this._updateSaisieSubmitBtn();
  },

  setSaisieQtyInput(ref, val) {
    const qty = parseFloat(val);
    if (!isNaN(qty) && qty >= 0) S.saisieItems[ref] = qty;
    else delete S.saisieItems[ref];
    this._updateSaisieSubmitBtn();
  },

  _saisieQtyKey(e, ref) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    this.setSaisieQtyInput(ref, e.target.value);
    const si = document.getElementById('saisie-search-input');
    if (si) { si.value = ''; this.saisieSearch(''); si.focus(); }
  },

  removeSaisieRef(ref) {
    delete S.saisieItems[ref];
    this._renderSaisieItems();
  },

  _updateSaisieSubmitBtn() {
    const btn = document.getElementById('saisie-submit-btn');
    if (!btn) return;
    const n = Object.keys(S.saisieItems).length;
    btn.style.display = n > 0 ? 'inline-block' : 'none';
    btn.textContent = n > 0 ? `✓ Valider (${n} réf.)` : '✓ Valider';
  },

  _renderSaisieItems() {
    const list  = document.getElementById('saisie-items-list');
    const empty = document.getElementById('saisie-empty-msg');
    if (!list) return;
    const refs = Object.keys(S.saisieItems);
    if (!refs.length) {
      if (empty) empty.style.display = 'block';
      list.innerHTML = '';
      list.appendChild(empty || document.createElement('div'));
      this._updateSaisieSubmitBtn();
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = refs.map(ref => {
      const refEsc  = CSS.escape(ref);
      const refSafe = ref.replace(/'/g, "\\'");
      const qty     = S.saisieItems[ref] ?? 1;
      const desc    = S.stockData.find(d => d.ref === ref)?.description || '';
      return `<div class="pose-item-row">
        <div style="flex:1;min-width:0;">
          <span class="pose-item-ref">${ref}</span>
          ${desc ? `<span class="pose-item-desc">${desc.length > 45 ? desc.substring(0,43)+'…' : desc}</span>` : ''}
        </div>
        <div class="batch-stepper">
          <button class="batch-minus" onclick="App.stepSaisieQty('${refSafe}',-1)">−</button>
          <input class="batch-qty-input" type="number" id="sqi-${refEsc}" min="0"
            value="${qty}"
            oninput="App.setSaisieQtyInput('${refSafe}',this.value)"
            onkeydown="App._saisieQtyKey(event,'${refSafe}')"
            onclick="this.select()">
          <button class="batch-plus" onclick="App.stepSaisieQty('${refSafe}',1)">+</button>
        </div>
        <button class="pose-item-del" onclick="App.removeSaisieRef('${refSafe}')">×</button>
      </div>`;
    }).join('');
    this._updateSaisieSubmitBtn();
  },

  async submitSaisie() {
    const items = Object.entries(S.saisieItems).filter(([, qty]) => Number(qty) > 0 || S.saisieType === 'inventaire');
    if (!items.length) { this.toast('Aucune pièce saisie'); return; }
    const user = S.user?.nom || '';
    const note = S.saisieNote || '';
    const btn  = document.getElementById('saisie-submit-btn');
    if (btn) btn.disabled = true;
    this.toast(`⏳ Enregistrement de ${items.length} référence${items.length > 1 ? 's' : ''}…`);
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        action: 'add_mouvements_batch',
        type:   S.saisieType,
        user,
        note,
        items:  items.map(([ref, qty]) => ({ ref, qty: Number(qty) })),
      }));
      const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 30000);
      const data = await resp.json();
      if (data.status === 'ok') {
        this.toast(`✓ ${data.count} mouvement${data.count > 1 ? 's' : ''} enregistré${data.count > 1 ? 's' : ''}`);
        // Mise à jour locale du stock
        const sign = S.saisieType === 'entrée' ? 1 : S.saisieType === 'sortie' ? -1 : 0;
        items.forEach(([ref, qty]) => {
          const item = S.stockData.find(i => i.ref === ref);
          if (!item) return;
          if (S.saisieType === 'inventaire') item.qte = Number(qty);
          else if (item.qte !== null) item.qte = (item.qte || 0) + sign * Number(qty);
        });
        S.historyLoaded   = false;
        S.analyticsLoaded = false;
        S.dashboardLoaded = false;
        this.closeSaisieModal();
        if (S.view === 'stock') this._renderStockList();
      } else {
        this.toast('Erreur : ' + (data.error || 'inconnue'));
      }
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  /* ─ Stock photos & detail ─ */

  /* ─ Saisie groupée ─ */

  // Ouvre la vue saisie groupée (reset du batch si on repart de zéro)
  openBatchMv() {
    this.go('stock');
  },

  // Définit le type de mouvement du batch
  setBatchType(type) {
    S.batchMvType = type;
    const colors  = { entrée:'#15803D', sortie:'#DC2626', inventaire:'#2563EB' };
    ['entrée','sortie','inventaire'].forEach(t => {
      const btn = document.getElementById('batch-btn-' + t);
      if (!btn) return;
      const active = t === type;
      btn.style.background  = active ? colors[t] : '#F8FAFC';
      btn.style.borderColor = active ? colors[t] : '#E2E8F0';
      btn.style.color       = active ? 'white'   : '#64748B';
    });
    this._renderStockList();
  },

  // Incrément / décrément du stepper
  stepBatchQty(ref, delta) {
    const cur = S.batchItems[ref] || 0;
    const next = Math.max(0, cur + delta);
    if (next === 0) delete S.batchItems[ref];
    else S.batchItems[ref] = next;
    const input = document.getElementById('bqi-' + CSS.escape(ref));
    if (input) input.value = next || '';
    const card = document.getElementById('scard-' + CSS.escape(ref));
    if (card) {
      ['in-entrée','in-sortie','in-inventaire'].forEach(c => card.classList.remove(c));
      if (next > 0 && S.batchMvType) card.classList.add('in-' + S.batchMvType);
    }
    this._updateBatchHeader();
  },

  // Saisie directe dans l'input quantité
  setBatchQtyInput(ref, val) {
    const qty = parseFloat(val);
    if (!isNaN(qty) && qty > 0) S.batchItems[ref] = qty;
    else delete S.batchItems[ref];
    const card = document.getElementById('scard-' + CSS.escape(ref));
    if (card) {
      ['in-entrée','in-sortie','in-inventaire'].forEach(c => card.classList.remove(c));
      if (S.batchItems[ref] && S.batchMvType) card.classList.add('in-' + S.batchMvType);
    }
    this._updateBatchHeader();
  },

  // Met à jour le compteur et le bouton valider
  _updateBatchHeader() {
    const n   = Object.keys(S.batchItems).length;
    const lbl = document.getElementById('batch-count-label');
    const btn = document.getElementById('batch-submit-btn');
    const chip = document.getElementById('batch-count-chip');
    if (lbl)  lbl.textContent  = n ? `${n} réf. saisie${n>1?'s':''}` : '0 réf.';
    if (chip) chip.textContent = n;
    if (btn)  btn.style.display = (n > 0 && S.batchMvType) ? 'inline-flex' : 'none';
  },

  // Soumet tout le batch
  async submitBatchMv() {
    const type  = S.batchMvType;
    const note  = document.getElementById('batch-note-input')?.value?.trim() || '';
    const u     = S.currentUser;
    const user  = u ? `${u.prenom} ${u.nom}` : 'inconnu';

    if (!type) { this.toast('Sélectionne un type de mouvement'); return; }

    // Pour un inventaire : inclure TOUTES les refs du catalogue (vide = 0)
    let items;
    if (type === 'inventaire') {
      if (!S.stockData.length) { this.toast('Catalogue non chargé'); return; }
      items = S.stockData.map(d => [d.ref, S.batchItems[d.ref] ?? 0]);
      const zeroCount = items.filter(([, q]) => q === 0).length;
      const msg = `Inventaire complet : ${items.length} référence${items.length>1?'s':''} vont être enregistrées.\n` +
                  `${zeroCount} référence${zeroCount>1?'s':''} non renseignée${zeroCount>1?'s':''} seront mises à 0.\n\nConfirmer ?`;
      if (!confirm(msg)) return;
    } else {
      items = Object.entries(S.batchItems);
      if (!items.length) { this.toast('Aucune quantité saisie'); return; }
    }

    const btn = document.getElementById('batch-submit-btn');
    if (btn) btn.disabled = true;
    this.toast(`⏳ Enregistrement de ${items.length} référence${items.length>1?'s':''}…`);

    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        action: 'add_mouvements_batch',
        type,
        user,
        note,
        items: items.map(([ref, qty]) => ({ ref, qty })),
      }));
      const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 30000);
      const data = await resp.json();

      if (data.status === 'ok') {
        this.toast(`✓ ${data.count} mouvement${data.count>1?'s':''} enregistré${data.count>1?'s':''}`);
        // Mise à jour locale de S.stockData (évite un rechargement complet)
        items.forEach(([ref, qty]) => {
          const item = S.stockData.find(i => i.ref === ref);
          if (item) {
            if      (type === 'inventaire') item.qte = Number(qty);        // 0 inclus
            else if (type === 'entrée')     item.qte = (item.qte !== null ? item.qte : 0) + qty;
            else if (type === 'sortie')     item.qte = (item.qte !== null ? item.qte : 0) - qty;
            if (item.seuil !== null && item.qte !== null)
              item.stockStatus = item.qte >= item.seuil ? 'ok' : 'low';
            else item.stockStatus = 'ok';
          }
        });
        // Invalider caches analytics/dashboard côté client
        S.analyticsLoaded = false;
        S.dashboardLoaded = false;
        // Reset batch
        S.batchItems  = {};
        S.batchMvType = null;
        ['entrée','sortie','inventaire'].forEach(t => {
          const b = document.getElementById('batch-btn-' + t);
          if (b) { b.style.background='#F8FAFC'; b.style.borderColor='#E2E8F0'; b.style.color='#64748B'; }
        });
        this._updateBatchHeader();
        // Retour au tableau de bord
        this.go('stock-dashboard');
      } else {
        this.toast('Erreur : ' + (data.error || 'inconnue'));
        console.error('[submitBatchMv]', data);
      }
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
      console.error('[submitBatchMv]', e);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // Charge l'index des photos (ref → thumbId) en arrière-plan
  async loadStockPhotos() {
    if (!S.apiUrl) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=stock_photos_index', {}, 10000);
      const data = await r.json();
      if (data.status === 'ok') S.stockPhotos = data.photos || {};
    } catch(e) { /* silencieux */ }
  },

  // Toggle bouton "🖼 Photos"
  toggleStockThumbs() {
    S.stockShowThumbs = !S.stockShowThumbs;
    const btn = document.getElementById('stock-thumbs-btn');
    if (btn) {
      btn.style.background  = S.stockShowThumbs ? 'var(--accent)' : '#F1F5F9';
      btn.style.borderColor = S.stockShowThumbs ? 'var(--accent)' : '#CBD5E1';
      btn.style.color       = S.stockShowThumbs ? 'white' : '#64748B';
    }
    // Premier chargement : récupérer l'index photos avant de re-rendre
    if (S.stockShowThumbs && Object.keys(S.stockPhotos).length === 0) {
      this.loadStockPhotos().then(() => this._renderStockList());
    } else {
      this._renderStockList();
    }
  },

  // ── Seuil d'alerte ───────────────────────────────────────────────────────
  openSeuilModal(ref) {
    const d = S.stockData.find(x => x.ref === ref);
    if (!d) return;
    S._seuilModalRef = ref;
    const modal = document.getElementById('seuil-modal');
    const inp   = document.getElementById('seuil-modal-input');
    const lbl   = document.getElementById('seuil-modal-ref');
    if (lbl) lbl.textContent = `${ref}${d.description ? ' — ' + d.description.substring(0, 40) + (d.description.length > 40 ? '…' : '') : ''}`;
    if (inp) { inp.value = d.seuil !== null ? d.seuil : ''; inp.focus(); }
    if (modal) modal.style.display = 'flex';
  },

  closeSeuilModal() {
    const modal = document.getElementById('seuil-modal');
    if (modal) modal.style.display = 'none';
    S._seuilModalRef = null;
  },

  async saveSeuilModal() {
    const ref = S._seuilModalRef;
    if (!ref) return;
    const inp  = document.getElementById('seuil-modal-input');
    const btn  = document.getElementById('seuil-modal-btn');
    const raw  = inp ? inp.value.trim() : '';
    const seuil = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && (isNaN(seuil) || seuil < 0)) { this.toast('Seuil invalide'); return; }

    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ action: 'save_stock_seuil', ref, seuil }));
      const resp = await _fetchWithTimeout(S.apiUrl, { method: 'POST', body: fd }, 15000);
      const data = await resp.json();
      if (data.status !== 'ok') throw new Error(data.error || 'Erreur inconnue');

      const item = S.stockData.find(x => x.ref === ref);
      if (item) {
        item.seuil = seuil;
        const qty = this._calcStockActuel(ref, item.qte);
        item.stockStatus = seuil !== null && qty !== null ? (qty >= seuil ? 'ok' : 'low') : (qty !== null ? 'ok' : 'unknown');
      }
      this.toast(`✓ Seuil ${seuil !== null ? 'fixé à ' + seuil : 'supprimé'} pour ${ref}`);
      this.closeSeuilModal();
      if (S.view === 'stock') this._renderStockList();
      if (S.view === 'stock-detail') this._renderStockDetail();
      if (S.view === 'stock-dashboard') this._renderDashboard();
    } catch(e) {
      this.toast('Erreur : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Enregistrer'; }
    }
  },

  // Charge les miniatures des cartes visibles après rendu
  async _loadVisibleThumbnails() {
    if (!S.apiUrl) return;
    const imgs = document.querySelectorAll('.sc-thumb[data-ref][src=""]');
    for (const img of imgs) {
      if (img.dataset.loaded) continue;
      const ref = img.getAttribute('data-ref');
      if (!ref || !S.stockPhotos[ref]) continue;
      img.dataset.loaded = '1';
      this._loadStockPhotoImg(img, ref);
    }
  },

  // Récupère une photo (pleine ou thumb) via l'AppScript et l'injecte dans <img>
  async _loadStockPhotoImg(img, ref) {
    if (!S.apiUrl || !ref) return;
    try {
      const r = await _fetchWithTimeout(
        `${S.apiUrl}?action=get_stock_thumbnail&ref=${encodeURIComponent(ref)}`, {}, 12000
      );
      const data = await r.json();
      if (data.status === 'ok' && data.data) {
        img.src = `data:${data.mime || 'image/jpeg'};base64,${data.data}`;
      }
    } catch(e) { /* silencieux */ }
  },

  // Ouvre la vue détail d'une référence
  async openStockDetail(ref) {
    S.selStockRef = ref;
    this.go('stock-detail'); // rendu immédiat (sans photo si index pas chargé)
    // Charger l'index photos si besoin, puis rafraîchir
    if (Object.keys(S.stockPhotos).length === 0) {
      await this.loadStockPhotos();
      if (S.view === 'stock-detail' && S.selStockRef === ref) this._renderStockDetail();
    }
  },

  // Rendu de la vue détail stock
  _renderStockDetail() {
    const ref  = S.selStockRef;
    const body = document.getElementById('stock-detail-body');
    if (!body || !ref) return;

    const d = S.stockData.find(x => x.ref === ref);
    if (!d) {
      body.innerHTML = '<p style="color:#94A3B8;text-align:center;padding:40px;">Référence introuvable</p>';
      return;
    }

    const isRel      = S.stockPrefs.has(ref);
    const calcQty    = this._calcStockActuel(ref, d.qte);
    const pidemQty   = d.qte !== null ? String(d.qte) : '—';
    const hasDelta   = !!S.stockDeltas[ref];
    const deltaInfo  = S.stockDeltas[ref];
    const calcStatus = d.seuil !== null && calcQty !== null
      ? (calcQty >= d.seuil ? 'ok' : 'low') : (calcQty !== null ? 'ok' : 'unknown');
    const qtyClass   = calcStatus;
    const hasPhoto   = !!S.stockPhotos[ref];
    const refSafe    = ref.replace(/'/g, "\\'");

    // Indicateur delta
    let deltaLabel = '';
    if (hasDelta && deltaInfo) {
      if (deltaInfo.invQty !== null) {
        deltaLabel = `<span style="font-size:10px;color:#64748B;margin-left:6px;">inventaire</span>`;
      } else {
        const sign = deltaInfo.delta >= 0 ? '+' : '';
        deltaLabel = `<span style="font-size:10px;color:${deltaInfo.delta>=0?'#15803D':'#DC2626'};margin-left:6px;">${sign}${deltaInfo.delta} vs PIDEM</span>`;
      }
    }

    // Boutons type de mouvement (état conservé via S.selMvType)
    const mvColors  = { entrée:'#15803D', sortie:'#DC2626', inventaire:'#2563EB' };
    const mvIcons   = { entrée:'➕', sortie:'➖', inventaire:'📋' };
    const mvLabels  = { entrée:'Entrée', sortie:'Sortie', inventaire:'Inventaire' };
    const mvBtnStyle = (type) => {
      const active = S.selMvType === type;
      const c = mvColors[type];
      return active
        ? `background:${c};border-color:${c};color:white;`
        : `background:#F8FAFC;border-color:#E2E8F0;color:#64748B;`;
    };

    body.innerHTML = `
      <button onclick="App.go('stock')"
        style="background:none;border:none;color:var(--brand);font-size:14px;font-weight:600;cursor:pointer;padding:0 0 14px;display:flex;align-items:center;gap:5px;">
        ← Retour catalogue
      </button>

      <!-- ── Fiche référence ── -->
      <div class="card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">
          <div>
            <div style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:var(--brand);">${d.ref}</div>
            ${d.refFourn ? `<div style="font-size:11px;color:#94A3B8;margin-top:2px;">Réf. fournisseur : ${d.refFourn}</div>` : ''}
          </div>
          <button onclick="App.toggleStockPref('${refSafe}');App._renderStockDetail();"
            style="background:none;border:none;font-size:28px;cursor:pointer;line-height:1;color:${isRel?'#F59E0B':'#CBD5E1'};">
            ${isRel?'★':'☆'}
          </button>
        </div>
        <p style="font-size:14px;color:#1E293B;line-height:1.55;margin-bottom:14px;">${d.description||'—'}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
          ${d.famille     ? `<span class="sc-bdg fam" style="font-size:12px;padding:3px 9px;">${d.famille}</span>` : ''}
          ${d.fournisseur ? `<span class="sc-bdg fou" style="font-size:12px;padding:3px 9px;">${d.fournisseur}</span>` : ''}
        </div>

        <!-- Stock calculé -->
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#F8FAFC;border-radius:10px;margin-bottom:16px;">
          <div style="font-size:26px;">📦</div>
          <div style="flex:1;">
            <div style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Stock calculé</div>
            <div style="display:flex;align-items:center;margin-top:4px;flex-wrap:wrap;gap:6px;">
              <span class="sc-qty ${qtyClass}" style="font-size:14px;padding:4px 12px;">${calcQty !== null ? calcQty : '—'}${d.seuil !== null ? ' / min ' + d.seuil : ''}</span>
              <button onclick="App.openSeuilModal('${refSafe}')"
                style="background:none;border:1.5px solid #E2E8F0;color:#64748B;padding:3px 9px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">
                ✏️ Seuil
              </button>
              ${deltaLabel}
            </div>
            ${hasDelta && d.qte !== null ? `<div style="font-size:10px;color:#94A3B8;margin-top:4px;">PIDEM : ${pidemQty}</div>` : ''}
          </div>
        </div>

        <!-- Analytics Layer 2 -->
        ${(function() {
          const ana  = S.stockAnalytics[ref];
          const days = App._calcDaysToRupture(ref, calcQty);
          if (!ana && days === null) return '';
          const trendIco = ana?.trend === 'up' ? '↑ Hausse' : ana?.trend === 'down' ? '↓ Baisse' : '→ Stable';
          const trendColor = ana?.trend === 'up' ? '#DC2626' : ana?.trend === 'down' ? '#15803D' : '#94A3B8';
          return `<div style="margin-bottom:14px;">
            <div style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Consommation (30 j)</div>
            <div class="analytics-grid">
              <div class="analytics-box">
                <div class="analytics-val">${ana?.avgPerWeek ?? '—'}</div>
                <div class="analytics-lbl">moy. / sem.</div>
              </div>
              <div class="analytics-box">
                <div class="analytics-val" style="color:${trendColor};font-size:14px;">${trendIco}</div>
                <div class="analytics-lbl">tendance</div>
              </div>
              <div class="analytics-box">
                <div class="analytics-val" style="color:${days !== null ? (days <= 7 ? '#DC2626' : days <= 30 ? '#D97706' : '#15803D') : '#94A3B8'}">${days !== null ? (days <= 0 ? '⛔' : days + 'j') : '—'}</div>
                <div class="analytics-lbl">avant rupture</div>
              </div>
            </div>
            ${ana?.exits30d ? `<div style="font-size:10px;color:#94A3B8;text-align:right;margin-top:2px;">${ana.exits30d} sorti${ana.exits30d>1?'es':'e'} · ${ana.entries30d} entré${ana.entries30d>1?'es':'e'} ces 30 jours</div>` : ''}
          </div>`;
        })()}

        <!-- Photo -->
        <div>
          <div style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Photo de référence</div>
          <div id="stock-detail-photo" style="width:100%;min-height:140px;background:#F1F5F9;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;margin-bottom:10px;">
            ${hasPhoto
              ? `<img id="stock-detail-img" src="" style="width:100%;max-height:260px;object-fit:contain;" alt="Photo">`
              : `<div style="text-align:center;color:#CBD5E1;padding:30px 20px;">
                   <div style="font-size:40px;margin-bottom:8px;">📷</div>
                   <div style="font-size:12px;">Aucune photo</div>
                 </div>`
            }
          </div>
          <label style="display:flex;align-items:center;justify-content:center;gap:8px;background:#EBF5FB;color:var(--brand);border:2px dashed var(--accent);padding:11px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;">
            📷 ${hasPhoto?'Changer la photo':'Ajouter une photo'}
            <input type="file" accept="image/*" capture="environment"
              onchange="App.uploadStockPhoto(this,'${refSafe}')" style="display:none;">
          </label>
        </div>
      </div>

      <!-- ── Enregistrer un mouvement ── -->
      <div class="card" style="margin-top:10px;">
        <div style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Enregistrer un mouvement</div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          ${['entrée','sortie','inventaire'].map(t => `
            <button id="mv-btn-${t}" onclick="App.selectMvType('${t}')"
              style="flex:1;padding:9px 4px;border-radius:8px;border:1.5px solid;font-size:11px;font-weight:700;cursor:pointer;${mvBtnStyle(t)}">
              ${mvIcons[t]} ${mvLabels[t]}
            </button>`).join('')}
        </div>
        <div id="mv-form" style="display:${S.selMvType ? 'block' : 'none'};">
          <div style="display:flex;gap:8px;margin-bottom:8px;align-items:stretch;">
            <input type="number" id="mv-qty" min="1" placeholder="Quantité"
              style="flex:1;padding:10px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:16px;text-align:center;">
            <button onclick="App.submitMouvement()" id="mv-submit-btn"
              style="padding:10px 18px;background:${mvColors[S.selMvType]||'var(--brand)'};color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">
              ✓ OK
            </button>
          </div>
          <input type="text" id="mv-note" placeholder="Note optionnelle (commande, chantier…)"
            style="width:100%;padding:9px 10px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:13px;">
        </div>
      </div>

      <!-- ── Historique des mouvements ── -->
      <div class="card" style="margin-top:10px;margin-bottom:20px;">
        <div style="font-size:11px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Historique</div>
        <div id="mv-history-loading" style="text-align:center;padding:16px;display:none;"><div class="spinner"></div></div>
        <div id="mv-history-list"><div style="text-align:center;color:#CBD5E1;padding:16px;font-size:13px;">Chargement…</div></div>
      </div>`;

    // Charger la photo
    if (hasPhoto) {
      const img = document.getElementById('stock-detail-img');
      if (img) this._loadStockPhotoImg(img, ref);
    }
    // Charger l'historique des mouvements
    this.loadStockMouvements(ref);
  },

  // Stock réel : déjà calculé par l'AppScript (invQty + delta), on retourne directement
  _calcStockActuel(ref, pidemQty) {
    return pidemQty;
  },

  // Sélectionne le type de mouvement (met à jour les boutons)
  selectMvType(type) {
    S.selMvType = type;
    const colors = { entrée:'#15803D', sortie:'#DC2626', inventaire:'#2563EB' };
    ['entrée','sortie','inventaire'].forEach(t => {
      const btn = document.getElementById('mv-btn-' + t);
      if (!btn) return;
      const active = t === type;
      btn.style.background  = active ? colors[t] : '#F8FAFC';
      btn.style.borderColor = active ? colors[t] : '#E2E8F0';
      btn.style.color       = active ? 'white'   : '#64748B';
    });
    const form = document.getElementById('mv-form');
    if (form) form.style.display = 'block';
    const submitBtn = document.getElementById('mv-submit-btn');
    if (submitBtn) submitBtn.style.background = colors[type];
    setTimeout(() => document.getElementById('mv-qty')?.focus(), 50);
  },

  // Soumet un mouvement de stock
  async submitMouvement() {
    const ref  = S.selStockRef;
    const type = S.selMvType;
    const qty  = parseFloat(document.getElementById('mv-qty')?.value);
    const note = document.getElementById('mv-note')?.value?.trim() || '';
    const u    = S.currentUser;
    const user = u ? `${u.prenom} ${u.nom}` : 'inconnu';

    if (!type) { this.toast('Sélectionne un type de mouvement'); return; }
    if (!qty || qty <= 0 || isNaN(qty)) { this.toast('Quantité invalide'); return; }

    const btn = document.getElementById('mv-submit-btn');
    if (btn) btn.disabled = true;
    this.toast('⏳ Enregistrement…');
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ action:'add_mouvement', ref, type, qty, note, user }));
      const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 15000);
      const data = await resp.json();
      if (data.status === 'ok') {
        this.toast('✓ Mouvement enregistré');
        // Mise à jour locale de S.stockData (évite un rechargement complet)
        const item = S.stockData.find(i => i.ref === ref);
        if (item) {
          if      (type === 'inventaire') item.qte = qty;
          else if (type === 'entrée')     item.qte = (item.qte !== null ? item.qte : 0) + qty;
          else if (type === 'sortie')     item.qte = (item.qte !== null ? item.qte : 0) - qty;
          if (item.seuil !== null && item.qte !== null)
            item.stockStatus = item.qte >= item.seuil ? 'ok' : 'low';
          else if (item.qte !== null) item.stockStatus = 'ok';
        }
        // Invalider caches analytics/dashboard côté client
        S.analyticsLoaded = false;
        S.dashboardLoaded = false;
        // Réinitialiser le formulaire
        S.selMvType = null;
        if (document.getElementById('mv-qty'))  document.getElementById('mv-qty').value  = '';
        if (document.getElementById('mv-note')) document.getElementById('mv-note').value = '';
        // Re-rendre le détail (stock calculé mis à jour) et recharger l'historique
        this._renderStockDetail();
      } else {
        this.toast('Erreur : ' + (data.error || 'inconnue'));
        console.error('[submitMouvement]', data);
      }
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
      console.error('[submitMouvement]', e);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // Charge et affiche l'historique des mouvements pour une référence
  async loadStockMouvements(ref) {
    const el      = document.getElementById('mv-history-list');
    const loading = document.getElementById('mv-history-loading');
    if (!el || !S.apiUrl) return;
    if (loading) loading.style.display = 'block';
    el.innerHTML = '';
    try {
      const r    = await _fetchWithTimeout(
        `${S.apiUrl}?action=stock_mouvements&ref=${encodeURIComponent(ref)}`, {}, 15000
      );
      const data = await r.json();
      if (data.status === 'ok') {
        const movs = (data.mouvements || []).slice().reverse(); // plus récent en premier
        if (!movs.length) {
          el.innerHTML = '<div style="text-align:center;color:#CBD5E1;padding:16px;font-size:13px;">Aucun mouvement enregistré</div>';
          return;
        }
        const clrMap  = { entrée:'#15803D', sortie:'#DC2626', inventaire:'#2563EB' };
        const iconMap = { entrée:'➕', sortie:'➖', inventaire:'📋' };
        const signMap = { entrée:'+', sortie:'-', inventaire:'=' };
        el.innerHTML = movs.map((m, i) => {
          const c    = clrMap[m.type]  || '#64748B';
          const ico  = iconMap[m.type] || '·';
          const sign = signMap[m.type] || '';
          const dt   = m.date ? new Date(m.date).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
          const last = i === movs.length - 1;
          return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;${last?'':'border-bottom:1px solid #F1F5F9;'}">
            <div style="width:28px;height:28px;border-radius:50%;background:${c}18;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${ico}</div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;">
                <span style="font-size:14px;font-weight:700;color:${c};">${sign}${m.qty}</span>
                <span style="font-size:10px;color:#94A3B8;white-space:nowrap;">${dt}</span>
              </div>
              <div style="font-size:11px;color:#64748B;margin-top:1px;">${m.user||''}${m.note?' · <em>'+m.note+'</em>':''}</div>
            </div>
          </div>`;
        }).join('');
      }
    } catch(e) {
      el.innerHTML = '<div style="color:#94A3B8;font-size:12px;padding:12px;">Erreur chargement historique</div>';
    } finally {
      if (loading) loading.style.display = 'none';
    }
  },

  // Gère l'upload d'une photo pour une référence stock
  async uploadStockPhoto(input, ref) {
    const file = input.files[0];
    if (!file || !S.apiUrl) return;
    this.toast('⏳ Redimensionnement…');
    let fullB64, thumbB64;
    try {
      // Redimensionner séquentiellement pour éviter les problèmes mémoire
      fullB64  = await _compress(file, 1200, 0.82);
      thumbB64 = await _compress(file, 200,  0.75);
    } catch(e) {
      this.toast('Erreur redimensionnement : ' + e.message);
      console.error('[uploadStockPhoto] resize error:', e);
      return;
    }
    this.toast('⏳ Envoi de la photo…');
    try {
      const payload = JSON.stringify({
        action:    'save_stock_photo',
        ref:       ref,
        imageData: fullB64.split(',')[1],
        thumbData: thumbB64.split(',')[1],
        mime:      'image/jpeg',
      });
      const fd = new FormData();
      fd.append('payload', payload);
      const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 60000);
      const data = await resp.json();
      if (data.status === 'ok') {
        this.toast('✓ Photo enregistrée');
        S.stockPhotos[ref] = data.thumbId || data.fileId;
        this._renderStockDetail();
      } else {
        const msg = data.error || 'inconnue';
        this.toast('Erreur AppScript : ' + msg);
        console.error('[uploadStockPhoto] AppScript error:', data);
      }
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
      console.error('[uploadStockPhoto] network error:', e);
    }
  },

  /* ─ Couche 2 — Intelligence ─ */
  // Calcule le nombre de jours avant rupture estimée
  _calcDaysToRupture(ref, stockActuel) {
    if (stockActuel === null || stockActuel <= 0) return 0;
    const a = S.stockAnalytics[ref];
    if (!a || !a.avgPerWeek || a.avgPerWeek === 0) return null; // pas de conso connue
    return Math.round(stockActuel / (a.avgPerWeek / 7));
  },

  // Charge les analytics depuis l'AppScript (avec cache local en session)
  async loadStockAnalytics() {
    if (!S.apiUrl || S.analyticsLoaded) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=stock_analytics', {}, 20000);
      const d = await r.json();
      if (d.status === 'ok') {
        S.stockAnalytics  = d.analytics || {};
        S.analyticsLoaded = true;
      }
    } catch(e) { console.warn('[analytics]', e); }
  },

  /* ─ Couche 3 — Dashboard ─ */
  dashMvtMore() {
    S.dashMvtLimit += 10;
    this._renderDashboard();
  },

  async loadStockDashboard(force = false) {
    if (!S.apiUrl) return;
    if (force) S.dashMvtLimit = 10;
    if (S.dashboardLoaded && !force) { this._renderDashboard(); return; }

    document.getElementById('dash-kpi-grid').innerHTML =
      '<div style="text-align:center;padding:24px;color:#94A3B8;grid-column:1/-1;font-size:13px;">Chargement…</div>';
    document.getElementById('dash-mvt-list').innerHTML =
      '<div style="text-align:center;padding:16px;color:#94A3B8;font-size:13px;">Chargement…</div>';

    try {
      // Charger catalogue si nécessaire + analytics + mouvements récents en parallèle
      const tasks = [
        _fetchWithTimeout(S.apiUrl + '?action=stock_recent_movements&limit=200', {}, 15000),
      ];
      if (!S.analyticsLoaded) {
        tasks.push(_fetchWithTimeout(S.apiUrl + '?action=stock_analytics', {}, 20000));
      }
      if (!S.stockLoaded) {
        tasks.push(
          _fetchWithTimeout(S.apiUrl + '?action=stock_catalog',            {}, 40000),
          _fetchWithTimeout(S.apiUrl + '?action=stock_mouvements_summary', {}, 15000),
        );
      }
      const results = await Promise.all(tasks);
      const mvtData = await results[0].json();
      if (mvtData.status === 'ok') S.stockRecentMvs = mvtData.movements || [];

      if (!S.analyticsLoaded && results[1]) {
        const aData = await results[1].json();
        if (aData.status === 'ok') { S.stockAnalytics = aData.analytics || {}; S.analyticsLoaded = true; }
      }
      if (!S.stockLoaded) {
        const catIdx  = S.analyticsLoaded ? 2 : 1;
        const dltIdx  = catIdx + 1;
        const catData = results[catIdx] ? await results[catIdx].json() : null;
        const dltData = results[dltIdx] ? await results[dltIdx].json() : null;
        if (catData?.status === 'ok') {
          S.stockData = catData.data || []; S.stockFamilles = catData.familles || []; S.stockLoaded = true;
        }
        if (dltData?.status === 'ok') S.stockDeltas = dltData.summary || {};
      }
      S.dashboardLoaded = true;
    } catch(e) { this.toast('Erreur chargement tableau de bord'); }
    this._renderDashboard();
  },

  _renderDashboard() {
    const kpiEl   = document.getElementById('dash-kpi-grid');
    const mvtEl   = document.getElementById('dash-mvt-list');
    const alertEl = document.getElementById('dash-alerts-section');
    const alertListEl = document.getElementById('dash-alerts-list');
    if (!kpiEl || !mvtEl) return;

    const total = S.stockData.length;
    const alerts = [];
    S.stockData.forEach(d => {
      const hasSeuil = d.seuil && d.seuil > 0;
      const qty = this._calcStockActuel(d.ref, d.qte);
      if (hasSeuil) {
        if (qty !== null && qty <= 0)            alerts.push({ ref: d.ref, desc: d.description, type: 'rupture', qty, seuil: d.seuil });
        else if (qty !== null && qty <= d.seuil) alerts.push({ ref: d.ref, desc: d.description, type: 'low', qty, seuil: d.seuil });
      } else if (qty !== null && qty < 0) {
        // Pas de seuil suivi sur cette réf, mais un stock négatif révèle une
        // sortie/livraison mal enregistrée quelque part — à signaler même sans seuil.
        alerts.push({ ref: d.ref, desc: d.description, type: 'rupture', qty, seuil: null });
      }
    });
    // Trier : rupture d'abord (les plus négatives en tête), puis par ratio qté/seuil croissant
    alerts.sort((a,b) => {
      if (a.type !== b.type) return a.type === 'rupture' ? -1 : 1;
      if (a.type === 'rupture') return a.qty - b.qty;
      return (a.qty / a.seuil) - (b.qty / b.seuil);
    });
    const ruptures  = alerts.filter(a => a.type === 'rupture').length;
    const lowStock  = alerts.filter(a => a.type === 'low').length;
    const exits30   = Object.values(S.stockAnalytics).reduce((s, a) => s + (a.exits30d || 0), 0);

    // ── KPIs ──
    kpiEl.innerHTML = `
      <div class="dash-kpi">
        <div class="dash-kpi-val">${total}</div>
        <div class="dash-kpi-lbl">Références total</div>
      </div>
      <div class="dash-kpi ${exits30 > 0 ? 'ok' : ''}">
        <div class="dash-kpi-val">${exits30}</div>
        <div class="dash-kpi-lbl">Sorties (30 j)</div>
      </div>
      <div class="dash-kpi ${lowStock > 0 ? 'warn' : 'ok'}">
        <div class="dash-kpi-val">${lowStock}</div>
        <div class="dash-kpi-lbl">Stock bas</div>
      </div>
      <div class="dash-kpi ${ruptures > 0 ? 'alert' : 'ok'}">
        <div class="dash-kpi-val">${ruptures}</div>
        <div class="dash-kpi-lbl">Ruptures</div>
      </div>`;

    // ── Alertes favoris ──
    alertEl.style.display = '';
    const hasSeuils = S.stockData.some(d => d.seuil && d.seuil > 0);
    if (alerts.length === 0) {
      alertListEl.innerHTML = hasSeuils
        ? `<div style="font-size:12px;color:#15803D;padding:8px 0;">✅ Tous les stocks sont au-dessus de leurs seuils.</div>`
        : `<div style="font-size:12px;color:#94A3B8;padding:8px 0;">Aucun seuil configuré. Utilisez ✏️ sur une référence pour définir un seuil d'alerte.</div>`;
    } else {
      alertListEl.innerHTML = alerts.slice(0, 8).map(a => {
        const badgeCls = a.type === 'rupture' ? 'rupture' : 'low';
        const badgeTxt = a.type === 'rupture'
          ? (a.seuil !== null ? '⛔ Rupture' : `⛔ Stock négatif (${a.qty})`)
          : `⚠️ ${a.qty}/${a.seuil}`;
        return `<div class="dash-alert-row" onclick="App.openStockDetail('${a.ref.replace(/'/g,"\\'")}')">
          <div class="dash-alert-ref">${a.ref}</div>
          <div style="font-size:11px;color:#475569;flex:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.desc}</div>
          <span class="dash-alert-badge ${badgeCls}">${badgeTxt}</span>
        </div>`;
      }).join('');
    }

    // ── Mouvements récents (groupés par opération) ──
    // Priorité : historyData (complet) si déjà chargé, sinon stockRecentMvs
    const srcMvs = S.historyLoaded ? S.historyData : S.stockRecentMvs;
    const allOps     = this._consolidatePoseOps(this._groupMovements(srcMvs));
    const visibleOps = allOps.slice(0, S.dashMvtLimit);
    const moreEl     = document.getElementById('dash-mvt-more');
    if (!visibleOps.length) {
      mvtEl.innerHTML = '<div style="text-align:center;padding:16px;color:#94A3B8;font-size:13px;">Aucun mouvement</div>';
      if (moreEl) moreEl.innerHTML = '';
    } else {
      const typeIcons  = { entrée:'↑', sortie:'↓', pose:'🔧', inventaire:'≡' };
      const typeLabels = { entrée:'Entrée', sortie:'Sortie', pose:'Pose', inventaire:'Inventaire' };
      mvtEl.innerHTML = visibleOps.map((op) => {
        const dt   = this._opDisplayType(op.type, op.note);
        const code = this._opRef(op.note, dt);
        // Sous-info contextuelle (pose → module + chantier)
        let sub = '';
        if (dt === 'pose' && code && S.depsLoaded) {
          const dep = S.deps.find(d => (d.code || '').toUpperCase() === code.toUpperCase());
          if (dep) sub = [dep.codeModule, dep.chantier].filter(Boolean).join('  ·  ');
        }
        const d      = new Date(op.date);
        const dtStr  = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' ' +
                       d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        const nRefs  = op.items.length;
        const nUnits = op.items.reduce((s, m) => s + (Number(m.qty) || 0), 0);
        const lvLink = S.lvLinks[op.key];
        const lvBtn  = (op.type === 'sortie' && dt !== 'pose' && !lvLink)
          ? `<button onclick="App.createLvFromOp('${encodeURIComponent(op.key)}')"
              style="margin-top:6px;padding:5px 10px;background:#EFF6FF;color:#1D4ED8;border:1.5px solid #BFDBFE;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;width:100%;">
              📄 Créer LV / CMR</button>`
          : '';
        const poseBtnDash = (() => {
          if (dt !== 'pose') return '';
          const pc = this._poseCode(op.note);
          if (!pc) return '';
          const dep  = S.depsLoaded ? S.deps.find(d => (d.code||'').toUpperCase() === pc.toUpperCase()) : null;
          const pcs  = pc.replace(/'/g,"&#39;");
          const mods = (dep?.codeModule||'').replace(/'/g,"&#39;");
          const chs  = (dep?.chantier||'').replace(/'/g,"&#39;");
          return `<button onclick="App.openPoseModal('${pcs}','${mods}','${chs}')"
            style="margin-top:6px;padding:5px 10px;background:#FFF7ED;color:#C2410C;border:1.5px solid #FED7AA;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;width:100%;">
            🔧 Gérer les pièces posées</button>`;
        })();
        const lvBadgeDash = lvLink
          ? `<span style="font-size:10px;font-weight:600;background:#DBEAFE;color:#1D4ED8;padding:2px 6px;border-radius:10px;flex-shrink:0;margin-left:4px;">📄 LV N° ${lvLink.display || lvLink.numero}</span>`
          : '';
        return `<div class="dash-mvt-row">
          <div class="dash-mvt-header" onclick="this.nextElementSibling.classList.toggle('open')">
            <span class="dash-mvt-type ${dt}">${typeIcons[dt] || ''} ${typeLabels[dt] || dt}</span>
            <span style="font-family:'Courier New',monospace;font-size:11px;font-weight:700;color:var(--brand);flex-shrink:0;margin:0 6px;">${code || '—'}</span>
            <span style="flex:1;font-size:10px;color:#64748B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sub}</span>
            ${lvBadgeDash}
            <span style="font-size:10px;color:#94A3B8;white-space:nowrap;flex-shrink:0;margin-left:6px;">${nRefs}r&nbsp;·&nbsp;${nUnits}u</span>
            <span style="font-size:10px;color:#94A3B8;white-space:nowrap;flex-shrink:0;margin-left:8px;">${dtStr}</span>
          </div>
          <div class="dash-mvt-body">
            ${lvBtn}${poseBtnDash}
            ${op.items.map(m => {
              const desc = S.stockData.find(d => d.ref === m.ref)?.description || '';
              return `<div style="display:flex;align-items:baseline;gap:6px;padding:3px 0;border-bottom:.5px solid #F8FAFC;">
                <span style="font-family:'Courier New',monospace;font-size:11px;font-weight:700;color:var(--brand);flex-shrink:0;">${m.ref}</span>
                <span style="font-size:10px;color:#64748B;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${desc}</span>
                <span style="font-size:11px;font-weight:700;color:#1E293B;flex-shrink:0;">×${m.qty}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('');
      // Bouton "Montrer plus"
      if (moreEl) {
        if (allOps.length > S.dashMvtLimit) {
          moreEl.innerHTML = `<button onclick="App.dashMvtMore()"
            style="width:100%;margin-top:4px;background:transparent;border:1.5px solid #E2E8F0;color:#475569;padding:7px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
            ↓ Montrer plus (${allOps.length - S.dashMvtLimit} de plus)
          </button>`;
        } else {
          moreEl.innerHTML = '';
        }
      }
    }
  },

  /* ─ Couche 1 — Sync catalogue ─ */
  async loadStockSync(force = false) {
    if (!S.apiUrl) return;
    if (S.stockSyncData && !force) { this._renderSyncView(); return; }
    S.syncLoading = true;
    document.getElementById('sync-body').innerHTML =
      '<div style="text-align:center;padding:32px;color:#94A3B8;font-size:13px;"><div class="spinner" style="margin:0 auto 10px"></div>Comparaison avec PIDEM…</div>';
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=catalog_diff', {}, 30000);
      const d = await r.json();
      if (d.status === 'ok') {
        S.stockSyncData = d.diff;
        this._renderSyncView();
      } else {
        document.getElementById('sync-body').innerHTML =
          `<div style="color:#DC2626;padding:16px;background:#FEF2F2;border-radius:8px;">Erreur : ${d.error || 'inconnue'}</div>`;
      }
    } catch(e) {
      document.getElementById('sync-body').innerHTML =
        '<div style="color:#DC2626;padding:16px;background:#FEF2F2;border-radius:8px;">Erreur réseau</div>';
    }
    S.syncLoading = false;
  },

  _renderSyncView() {
    const sd   = S.stockSyncData;
    const body = document.getElementById('sync-body');
    if (!body || !sd) return;

    const hasChanges = sd.new.length + sd.modified.length + sd.deleted.length > 0;
    const savedAt    = sd.savedAt ? new Date(sd.savedAt).toLocaleDateString('fr-FR', {
      day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : null;

    if (sd.isInitial) {
      body.innerHTML = `
        <div style="background:#FEF3C7;border-radius:10px;padding:14px;margin-bottom:14px;">
          <div style="font-weight:700;color:#92400E;margin-bottom:4px;">📸 Premier snapshot</div>
          <div style="font-size:12px;color:#78350F;">Aucun snapshot enregistré. Le catalogue PIDEM contient
            <strong>${sd.new.length} références</strong>. Valider pour enregistrer la photo initiale.</div>
        </div>
        <button onclick="App.applySnapshot()" style="width:100%;padding:12px;border:none;background:#1A5276;color:white;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">
          📸 Enregistrer snapshot initial (${sd.new.length} refs)
        </button>`;
      return;
    }

    if (!hasChanges) {
      body.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#15803D;">
          <div style="font-size:48px;margin-bottom:10px;">✅</div>
          <div style="font-size:16px;font-weight:700;">Catalogue à jour</div>
          <div style="font-size:12px;color:#64748B;margin-top:6px;">${sd.unchangedCount} références — snapshot du ${savedAt || '?'}</div>
        </div>`;
      return;
    }

    let html = `<div style="font-size:11px;color:#64748B;margin-bottom:10px;">
      Snapshot du ${savedAt || '?'} · ${sd.unchangedCount} ref. inchangées</div>`;

    if (sd.new.length) {
      html += `<div class="sync-group">
        <div class="sync-group-title" style="color:#15803D;">
          Nouvelles références <span class="sync-badge new">${sd.new.length}</span>
        </div>
        ${sd.new.map(r => `<div class="sync-ref-row">
          <div class="sync-ref">${r.ref}</div>
          <div class="sync-desc">${r.description || '—'}${r.famille ? ` · <em>${r.famille}</em>` : ''}</div>
        </div>`).join('')}
      </div>`;
    }

    if (sd.modified.length) {
      html += `<div class="sync-group">
        <div class="sync-group-title" style="color:#D97706;">
          Références modifiées <span class="sync-badge mod">${sd.modified.length}</span>
        </div>
        ${sd.modified.map(r => {
          const changes = [];
          if (r.description !== r._old.description) changes.push(`Désig. : <span class="sync-old">${r._old.description}</span> → ${r.description}`);
          if (r.famille     !== r._old.famille)     changes.push(`Famille : <span class="sync-old">${r._old.famille}</span> → ${r.famille}`);
          if (r.fournisseur !== r._old.fournisseur) changes.push(`Fourn. : <span class="sync-old">${r._old.fournisseur}</span> → ${r.fournisseur}`);
          return `<div class="sync-ref-row">
            <div class="sync-ref">${r.ref}</div>
            <div class="sync-desc" style="font-size:10.5px;">${changes.join(' &nbsp;|&nbsp; ')}</div>
          </div>`;
        }).join('')}
      </div>`;
    }

    if (sd.deleted.length) {
      html += `<div class="sync-group">
        <div class="sync-group-title" style="color:#DC2626;">
          Références supprimées du PIDEM <span class="sync-badge del">${sd.deleted.length}</span>
        </div>
        ${sd.deleted.map(r => `<div class="sync-ref-row" style="opacity:.7;">
          <div class="sync-ref" style="text-decoration:line-through;">${r.ref}</div>
          <div class="sync-desc">${r.description || '—'}</div>
        </div>`).join('')}
      </div>`;
    }

    html += `<button onclick="App.applySnapshot()" style="width:100%;padding:12px;border:none;background:#1A5276;color:white;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;">
      ✅ Valider et mettre à jour le snapshot
    </button>`;

    body.innerHTML = html;
  },

  /* ─────────────────────────────────────────────────────────────────────────
     IMPORT XLS CLIENT — assistant en 3 étapes
     1. Lecture fichier → sélection onglet
     2. Config : ligne d'en-têtes + correspondance colonnes
     3. Aperçu diff → import
  ───────────────────────────────────────────────────────────────────────── */

  // Champs cibles et leurs labels affichés
  _XLS_FIELDS: [
    { key:'ref',         label:'Référence',          required:true  },
    { key:'description', label:'Description',         required:true  },
    { key:'famille',     label:'Famille',             required:false },
    { key:'fournisseur', label:'Fournisseur',         required:false },
    { key:'refFourn',    label:'Réf. fournisseur',    required:false },
    { key:'prixHT',      label:'Prix HT',             required:false },
  ],

  // Mots-clés par champ pour auto-détection (après normalisation)
  _XLS_KEYWORDS: {
    ref:         ['refrentalman','pidem','refarticle','ref','reference'],
    description: ['detailfournitures','detail','description','designation','libelle','fourniture'],
    famille:     ['famillearticle','famille','categorie','type'],
    fournisseur: ['fournisseur','fourn','supplier'],
    refFourn:    ['referencefournisseur','reffournisseur','reffourn','refsupplier'],
    prixHT:      ['prixht','prix','price','montant','tarif'],
  },

  // ── Étape 0 : lecture du fichier ─────────────────────────────────────────
  onXlsSelected(input) {
    const file = input.files?.[0];
    if (file) this._xlsLoadFile(file);
  },

  _xlsLoadFile(file) {
    if (typeof XLSX === 'undefined') {
      this.toast('⚠️ SheetJS non chargé — vérifie la connexion internet');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:false });
        S._xlsWorkbook  = wb;
        S._xlsFileName  = file.name;
        S._xlsConfig    = null;
        S._xlsParsed    = null;

        // Afficher l'assistant
        document.getElementById('xls-step-file').style.display   = 'none';
        document.getElementById('xls-step-config').style.display = 'block';
        document.getElementById('xls-file-name').textContent     = file.name;

        // Rendre les boutons d'onglets
        this._xlsRenderTabButtons();

        // Auto-sélectionner le meilleur onglet
        const bestSheet = this._xlsBestSheet(wb);
        this._xlsSelectTab(bestSheet);

      } catch(err) {
        this.toast('Erreur lecture fichier : ' + err.message);
        console.error('[xlsLoad]', err);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // Choisit l'onglet qui a le plus de lignes non vides
  _xlsBestSheet(wb) {
    let best = wb.SheetNames[0], bestCount = 0;
    wb.SheetNames.forEach(name => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, defval:'' });
      const nonEmpty = rows.filter(r => r.some(c => String(c).trim() !== '')).length;
      if (nonEmpty > bestCount) { bestCount = nonEmpty; best = name; }
    });
    return best;
  },

  // ── Étape 1 : sélection de l'onglet ─────────────────────────────────────
  _xlsRenderTabButtons() {
    const wb  = S._xlsWorkbook;
    const el  = document.getElementById('xls-tab-btns');
    if (!el || !wb) return;
    el.innerHTML = wb.SheetNames.map(name =>
      `<button onclick="App._xlsSelectTab('${name.replace(/'/g,"\\'")}') "
        id="xls-tab-${name.replace(/[^a-z0-9]/gi,'_')}"
        style="padding:5px 10px;border-radius:7px;border:1.5px solid #CBD5E1;background:#F8FAFC;
               font-size:11px;font-weight:600;color:#475569;cursor:pointer;white-space:nowrap;">
        ${name}
      </button>`
    ).join('');
  },

  _xlsSelectTab(sheetName) {
    const wb = S._xlsWorkbook;
    if (!wb || !wb.Sheets[sheetName]) return;

    // Highlight du bouton actif
    wb.SheetNames.forEach(n => {
      const btn = document.getElementById('xls-tab-' + n.replace(/[^a-z0-9]/gi,'_'));
      if (btn) {
        btn.style.background   = n === sheetName ? 'var(--brand)' : '#F8FAFC';
        btn.style.borderColor  = n === sheetName ? 'var(--brand)' : '#CBD5E1';
        btn.style.color        = n === sheetName ? 'white'        : '#475569';
      }
    });

    // Lire les lignes brutes (toutes)
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:'' });
    S._xlsRawRows = rows;

    // Auto-détecter ligne d'en-têtes et colonnes
    const { headerRowIdx, colMap } = this._xlsAutoDetect(rows);
    S._xlsConfig = {
      sheetName,
      headerRowIdx,                         // 0-indexed
      dataRowIdx: headerRowIdx + 1,         // 0-indexed
      colMap,                               // { ref:-1..N, description:..., ... }
    };

    this._xlsRenderRawTable();
    this._xlsRenderColDropdowns();
    this._xlsApplyConfig();
  },

  // Auto-détecte la ligne d'en-têtes et les colonnes
  _xlsAutoDetect(rows) {
    // Cherche la première ligne avec ≥3 cellules non vides consécutives
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 8); i++) {
      const filled = rows[i].filter(c => String(c).trim() !== '').length;
      if (filled >= 3) { headerRowIdx = i; break; }
    }

    const headerRow = rows[headerRowIdx] || [];
    // Normaliser les en-têtes
    const norm = headerRow.map(h => String(h || '').trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]/g,''));

    const colMap = {};
    this._XLS_FIELDS.forEach(f => {
      let found = -1;
      for (const kw of (this._XLS_KEYWORDS[f.key] || [])) {
        const idx = norm.findIndex(h => h === kw || h.includes(kw) || kw.includes(h));
        if (idx >= 0) { found = idx; break; }
      }
      colMap[f.key] = found;
    });
    return { headerRowIdx, colMap };
  },

  // ── Étape 2a : table brute ───────────────────────────────────────────────
  _xlsRenderRawTable() {
    const el  = document.getElementById('xls-raw-table');
    const cfg = S._xlsConfig;
    if (!el || !cfg || !S._xlsRawRows) return;

    const rows    = S._xlsRawRows;
    const showMax = Math.max(cfg.headerRowIdx + 5, 8);   // afficher au moins jusqu'aux premières données
    const display = rows.slice(0, Math.min(showMax, rows.length));
    const colCount= Math.max(...display.map(r => r.length), 1);

    let html = '<table style="border-collapse:collapse;min-width:100%;white-space:nowrap;">';
    display.forEach((row, i) => {
      const isHeader = (i === cfg.headerRowIdx);
      const isData   = (i >= cfg.dataRowIdx);
      const rowBg    = isHeader ? '#1A5276' : isData ? 'white' : '#F8FAFC';
      const rowColor = isHeader ? 'white'   : '#334155';
      const rowFw    = isHeader ? '700'     : '400';
      html += `<tr style="background:${rowBg};color:${rowColor};font-weight:${rowFw};">`;
      // Numéro de ligne cliquable
      html += `<td onclick="App._xlsSetHeaderRow(${i})" title="Définir comme ligne d'en-têtes"
        style="padding:3px 6px;border-right:2px solid #E2E8F0;border-bottom:1px solid #F1F5F9;
               cursor:pointer;color:${isHeader?'white':'#94A3B8'};font-weight:700;font-size:9px;
               background:${isHeader?'#0F3460':'#F8FAFC'};text-align:right;min-width:22px;">
        ${isHeader ? '▶' : (i+1)}
      </td>`;
      // Cellules
      for (let c = 0; c < Math.min(colCount, 8); c++) {
        const val = String(row[c] || '');
        const truncated = val.length > 22 ? val.substring(0,20)+'…' : val;
        html += `<td style="padding:3px 7px;border-right:1px solid #F1F5F9;border-bottom:1px solid #F1F5F9;max-width:140px;overflow:hidden;text-overflow:ellipsis;" title="${val.replace(/"/g,'&quot;')}">${truncated}</td>`;
      }
      if (colCount > 8) html += `<td style="padding:3px 6px;color:#94A3B8;font-size:9px;">+${colCount-8}</td>`;
      html += '</tr>';
    });
    if (rows.length > showMax) {
      html += `<tr><td colspan="${Math.min(colCount,8)+2}" style="text-align:center;padding:4px;font-size:9px;color:#94A3B8;">… ${rows.length - showMax} lignes supplémentaires</td></tr>`;
    }
    html += '</table>';
    el.innerHTML = html;
  },

  // Clic sur un numéro de ligne → définir comme ligne d'en-têtes
  _xlsSetHeaderRow(rowIdx) {
    if (!S._xlsConfig) return;
    S._xlsConfig.headerRowIdx = rowIdx;
    S._xlsConfig.dataRowIdx   = rowIdx + 1;
    // Re-détecter les colonnes avec la nouvelle ligne d'en-têtes
    const { colMap } = this._xlsAutoDetect(S._xlsRawRows);
    S._xlsConfig.colMap = colMap;
    this._xlsRenderRawTable();
    this._xlsRenderColDropdowns();
    this._xlsApplyConfig();
  },

  // ── Étape 2b : dropdowns colonnes ────────────────────────────────────────
  _xlsRenderColDropdowns() {
    const el  = document.getElementById('xls-col-grid');
    const cfg = S._xlsConfig;
    if (!el || !cfg || !S._xlsRawRows) return;

    const headerRow = S._xlsRawRows[cfg.headerRowIdx] || [];
    // Options : "— Ne pas importer —" + une option par colonne du fichier
    const opts = ['<option value="-1">— Ne pas importer —</option>'];
    headerRow.forEach((h, i) => {
      const letter = String.fromCharCode(65 + i);  // A, B, C…
      const label  = String(h || '').trim();
      opts.push(`<option value="${i}">${letter}${label ? ' — ' + label.substring(0,30) : ''}</option>`);
    });
    const optStr = opts.join('');

    el.innerHTML = this._XLS_FIELDS.map(f => {
      const val    = cfg.colMap[f.key] ?? -1;
      const req    = f.required ? ' *' : '';
      const border = f.required && val === -1 ? '1.5px solid #FCA5A5' : '1.5px solid #E2E8F0';
      return `<div>
        <div style="font-size:9px;color:#64748B;font-weight:600;margin-bottom:2px;">${f.label}${req}</div>
        <select onchange="App._xlsSetColMap('${f.key}', parseInt(this.value))"
          style="width:100%;padding:6px 8px;border:${border};border-radius:7px;font-size:11px;background:white;color:#1E293B;">
          ${optStr.replace(`value="${val}"`, `value="${val}" selected`)}
        </select>
      </div>`;
    }).join('');
  },

  _xlsSetColMap(field, colIdx) {
    if (!S._xlsConfig) return;
    S._xlsConfig.colMap[field] = colIdx;
    // Mettre à jour la couleur de la bordure du select
    this._xlsRenderColDropdowns();
    this._xlsApplyConfig();
  },

  // ── Étape 3 : parse + aperçu diff ────────────────────────────────────────
  _xlsApplyConfig() {
    const cfg  = S._xlsConfig;
    const rows = S._xlsRawRows;
    if (!cfg || !rows) return;

    const cm = cfg.colMap;
    // Vérifier que les champs requis sont mappés
    const missingRequired = this._XLS_FIELDS.filter(f => f.required && (cm[f.key] === -1 || cm[f.key] === undefined));

    const btn = document.getElementById('xls-submit-btn');

    if (missingRequired.length) {
      document.getElementById('xls-preview-section').style.display = 'none';
      if (btn) {
        btn.disabled = true;
        btn.style.background = '#94A3B8';
        btn.style.cursor = 'not-allowed';
        btn.textContent = `⚠️ Mapper : ${missingRequired.map(f=>f.label).join(', ')}`;
      }
      return;
    }

    // Parser
    const parsed = [];
    for (let i = cfg.dataRowIdx; i < rows.length; i++) {
      const row = rows[i];
      const refRaw = cm.ref >= 0 ? String(row[cm.ref] ?? '').trim() : '';
      if (!refRaw) continue;  // ligne vide
      parsed.push({
        ref:         refRaw,
        description: cm.description >= 0 ? String(row[cm.description] ?? '').trim() : '',
        famille:     cm.famille     >= 0 ? String(row[cm.famille]     ?? '').trim() : '',
        fournisseur: cm.fournisseur >= 0 ? String(row[cm.fournisseur] ?? '').trim() : '',
        refFourn:    cm.refFourn    >= 0 ? String(row[cm.refFourn]    ?? '').trim() : '',
        prixHT:      cm.prixHT     >= 0 ? this._cleanPrice(row[cm.prixHT]) : null,
      });
    }

    S._xlsParsed = parsed;
    this._xlsRenderPreview(parsed);

    if (btn) {
      btn.disabled = parsed.length === 0;
      btn.style.background = parsed.length ? '#1A5276' : '#94A3B8';
      btn.style.cursor = parsed.length ? 'pointer' : 'not-allowed';
      btn.textContent = parsed.length
        ? `✅ Importer ${parsed.length} références dans le catalogue`
        : '⚠️ Aucune référence trouvée';
    }
  },

  _xlsRenderPreview(parsed) {
    const section  = document.getElementById('xls-preview-section');
    const diffGrid = document.getElementById('xls-diff-grid');
    const sampleEl = document.getElementById('xls-preview-sample');
    if (!section || !diffGrid || !sampleEl) return;
    section.style.display = 'block';

    if (!parsed.length) {
      diffGrid.innerHTML = '<div style="color:#DC2626;font-size:12px;">Aucune référence détectée avec cette configuration.</div>';
      sampleEl.innerHTML = '';
      return;
    }

    // Diff local (si catalogue chargé)
    const curMap = {};
    S.stockData.forEach(d => { curMap[d.ref] = d; });
    let added = 0, modified = 0, unchanged = 0;
    const changes = [];

    parsed.forEach(r => {
      const cur = curMap[r.ref];
      if (!cur) {
        added++;
        if (changes.length < 12) changes.push({ tag:'new', ref:r.ref, desc:r.description });
      } else {
        const chg = (r.description !== cur.description || r.famille !== cur.famille ||
                     r.fournisseur !== cur.fournisseur || r.refFourn !== cur.refFourn ||
                     (r.prixHT !== null && r.prixHT !== cur.prixHT));
        if (chg) {
          modified++;
          if (changes.length < 12) changes.push({ tag:'mod', ref:r.ref, desc:r.description });
        } else { unchanged++; }
      }
    });
    const deleted = S.stockData.filter(d => !parsed.find(r => r.ref === d.ref));

    diffGrid.innerHTML = `
      <div class="diff-stat new"><div class="diff-stat-val">${added}</div><div class="diff-stat-lbl">Nouvelles</div></div>
      <div class="diff-stat mod"><div class="diff-stat-val">${modified}</div><div class="diff-stat-lbl">Modifiées</div></div>
      <div class="diff-stat del"><div class="diff-stat-val">${deleted.length}</div><div class="diff-stat-lbl">Absentes</div></div>
      <div class="diff-stat ok"><div class="diff-stat-val">${unchanged}</div><div class="diff-stat-lbl">Inchangées</div></div>`;

    const toShow = [
      ...changes,
      ...deleted.slice(0,4).map(d => ({ tag:'del', ref:d.ref, desc:d.description })),
    ].slice(0, 15);

    if (!toShow.length) {
      sampleEl.innerHTML = '<div style="text-align:center;padding:12px;color:#94A3B8;font-size:11px;">Aucun changement détecté.</div>';
    } else {
      sampleEl.innerHTML = toShow.map(r =>
        `<div class="xls-row">
          <span class="xls-row-ref">${r.ref}</span>
          <span class="xls-row-desc">${r.desc}</span>
          <span class="xls-row-tag ${r.tag}">${r.tag==='new'?'Nouveau':r.tag==='mod'?'Modifié':'Absent'}</span>
        </div>`).join('');
      if (parsed.length > 15) {
        sampleEl.innerHTML += `<div style="text-align:center;padding:6px;font-size:10px;color:#94A3B8;">… ${parsed.length} références au total</div>`;
      }
    }
  },

  // Nettoie un prix "55,55 €" → 55.55
  _cleanPrice(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).replace(/[€$£\s]/g,'').replace(',','.');
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  },

  // ── Reset ────────────────────────────────────────────────────────────────
  cancelXlsImport() {
    S._xlsWorkbook  = null;
    S._xlsParsed    = null;
    S._xlsFileName  = null;
    S._xlsConfig    = null;
    S._xlsRawRows   = null;
    document.getElementById('xls-step-file').style.display   = 'block';
    document.getElementById('xls-step-config').style.display = 'none';
    const inp = document.getElementById('xls-input');
    if (inp) inp.value = '';
  },

  // ── Envoi à l'AppScript ──────────────────────────────────────────────────
  async submitXlsImport() {
    if (!S._xlsParsed?.length) return;
    if (!S.apiUrl) { this.toast('URL API non configurée'); return; }

    const btn = document.getElementById('xls-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Import en cours…'; }

    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        action: 'import_catalog_data',
        refs:   S._xlsParsed,
        source: S._xlsFileName || 'import.xls',
      }));
      const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 60000);
      const data = await resp.json();

      if (data.status === 'ok') {
        this.toast(`✅ ${data.added} ajout${data.added>1?'s':''} · ${data.updated} modif. · ${data.deactivated} désactivée${data.deactivated>1?'s':''}`);

        // Afficher résultat + lien Sheet
        const syncBody = document.getElementById('sync-body');
        if (syncBody) {
          syncBody.innerHTML = `
            <div style="background:#F0FDF4;border-radius:10px;padding:14px;margin-bottom:8px;">
              <div style="font-weight:700;color:#15803D;margin-bottom:4px;">✅ Import terminé</div>
              <div style="font-size:12px;color:#166534;line-height:1.7;">
                <b>${data.added}</b> nouvelle${data.added>1?'s':''} &nbsp;·&nbsp;
                <b>${data.updated}</b> modifiée${data.updated>1?'s':''} &nbsp;·&nbsp;
                <b>${data.deactivated}</b> désactivée${data.deactivated>1?'s':''} &nbsp;·&nbsp;
                <b>${data.unchanged}</b> inchangée${data.unchanged>1?'s':''}
                ${data.prixModifies ? `<br>💶 <b>${data.prixModifies}</b> prix nouveau${data.prixModifies>1?'x':''} ou modifié${data.prixModifies>1?'s':''} (ancien prix gardé dans l'historique)` : ''}
              </div>
            </div>
            ${(data.retireesEnStock || []).length ? `
            <div style="background:#FEF3C7;border-radius:10px;padding:12px 14px;margin-bottom:8px;font-size:12px;color:#92400E;line-height:1.6;">
              ⚠ <b>${data.retireesEnStock.length}</b> référence${data.retireesEnStock.length>1?'s':''} retirée${data.retireesEnStock.length>1?'s':''} du catalogue client mais encore en stock :
              <b>${data.retireesEnStock.join(', ')}</b>. Elles restent visibles (étiquette « Retirée ») jusqu'à ce que leur stock soit à zéro.
            </div>` : ''}
            ${data.sheetUrl ? `
            <a href="${data.sheetUrl}" target="_blank"
              style="display:flex;align-items:center;gap:8px;background:#EFF6FF;border:1.5px solid #BFDBFE;
                     border-radius:8px;padding:10px 12px;text-decoration:none;margin-bottom:8px;">
              <span style="font-size:20px;">📊</span>
              <div>
                <div style="font-size:12px;font-weight:700;color:#1D4ED8;">Ouvrir "Sonotrad - Catalogue"</div>
                <div style="font-size:10px;color:#64748B;">Éditer les seuils directement dans le Sheet</div>
              </div>
              <span style="margin-left:auto;font-size:14px;color:#93C5FD;">↗</span>
            </a>` : ''}`;
        }

        // Invalider caches
        S.stockLoaded     = false;
        S.analyticsLoaded = false;
        S.dashboardLoaded = false;
        this.cancelXlsImport();
        if (S.view === 'stock') this.loadStockCatalog();

      } else {
        this.toast('Erreur : ' + (data.error || 'inconnue'));
        if (btn) { btn.disabled = false; btn.textContent = '✅ Importer dans le catalogue'; }
      }
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '✅ Importer dans le catalogue'; }
    }
  },

  async applySnapshot() {
    if (!S.apiUrl) return;
    const btn = document.querySelector('#view-stock-sync button[onclick="App.applySnapshot()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Enregistrement…'; }
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ action: 'apply_catalog_snapshot' }));
      const r = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 20000);
      const d = await r.json();
      if (d.status === 'ok') {
        this.toast(`✅ Snapshot enregistré — ${d.count} références`);
        S.stockSyncData = null; // forcer rechargement
        this.loadStockSync(true);
      } else {
        this.toast('Erreur : ' + (d.error || 'inconnue'));
        if (btn) { btn.disabled = false; btn.textContent = '✅ Valider et mettre à jour le snapshot'; }
      }
    } catch(e) {
      this.toast('Erreur réseau');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Valider et mettre à jour le snapshot'; }
    }
  },
});
