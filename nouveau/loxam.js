// LOXAM (arrivées, codes, file hors ligne, départs, archive, photos).
// Méthodes ajoutées à App (défini dans app.js, chargé avant) : contenu déplacé tel quel
// depuis l'ancien index.html unique (découpage du 2026-10-26).
Object.assign(App, {

  /* ─ Arrivals list ─ */
  _renderArrivalList() {
    const list = document.getElementById('arrival-list');
    const none = document.getElementById('no-arrivals');
    const items = S.history.filter(h => h.type !== 'departure').slice(-15).reverse();
    if (!items.length) {
      list.innerHTML = '';
      none.style.display = 'block';
      return;
    }
    none.style.display = 'none';
    list.innerHTML = items.map(r => {
      const m = MODULES[r.module] || { icon: '📦', iconBg: '#F1F5F9', label: r.module };
      return `
        <div class="history-row">
          <div class="mod-icon" style="background:${m.iconBg}">${m.icon}</div>
          <div style="flex:1;min-width:0;">
            <div class="code-mono" style="font-size:16px;">${r.code}</div>
            <div style="font-size:12px;color:#64748B;margin-top:2px;">${m.label} · ${r.date} · ${r.photos || 0} photo(s)</div>
            ${r.chauffeur ? `<div style="font-size:12px;color:#475569;">🚛 ${r.chauffeur}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:10px;color:#94A3B8;">${r.sentAt || ''}</div>
            ${r.offline ? '<span class="chip chip-yellow" style="font-size:10px;margin-top:2px;display:inline-block;">local</span>' : ''}
          </div>
        </div>`;
    }).join('');
  },
  /* ─ New arrival ─ */
  startNewArrival() {
    // Si un code avait été assigné sans être soumis, on le remet en stock
    if (S.arr && S.arr.code && !S.arr.submitted) {
      S.codeStock.unshift(S.arr.code);
      localStorage.setItem(SK.CODE_STOCK, JSON.stringify(S.codeStock));
      this._renderCodeStockBadge();
    }
    S.arr = { step: 1, module: null, code: '', photos: [], chauffeur: '', date: todayStr(), etat: '', submitted: false };
    // Vide les champs DOM pour ne pas laisser les valeurs du formulaire précédent
    ['inp-module-type','inp-num-module','inp-num-serie','inp-lv','inp-agence','inp-longueur','inp-chauffeur','inp-etat'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const dateEl = document.getElementById('inp-date');
    if (dateEl) dateEl.value = todayStr();
    const grid = document.getElementById('photo-grid-2');
    if (grid) grid.innerHTML = '';
    this.go('new-arrival');
    this.showStep(1);
  },
  showStep(n) {
    [1,2,3,4].forEach(i => {
      const el = document.getElementById('step-' + i);
      if (el) el.style.display = (i === n) ? 'block' : 'none';
    });
    [1,2,3].forEach(i => {
      const d = document.getElementById('dot-' + i);
      if (!d) return;
      d.className = 'step-dot' + (i === n ? ' active' : i < n ? ' done' : '');
    });
    S.arr.step = n;
  },
  selectModule(mod) {
    S.arr.module = mod;
    const m = MODULES[mod];
    document.getElementById('step2-title').textContent = `${m.icon}  ${m.label}`;
    // Affiche les champs spécifiques LOXAM uniquement pour ce module
    document.getElementById('loxam-fields').style.display = mod === 'loxam' ? 'block' : 'none';
    this.showStep(2);
    this._genCode();
    this._renderPhotoGrid('photo-grid-2', S.arr.photos, 'arrival');
  },
  /* ─ Stock de codes pré-chargés ─ */
  _renderCodeStockBadge() {
    const el = document.getElementById('code-stock-badge');
    if (!el) return;
    const n = S.codeStock.length;
    if (n === 0) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent   = n < 2 ? `⚠ ${n} code` : `${n} codes`;
    el.style.color   = n < 2 ? 'rgba(251,191,36,0.95)' : 'rgba(255,255,255,0.55)';
    el.style.background = n < 2 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.12)';
  },
  async _refillCodeStock() {
    if (!S.apiUrl || !navigator.onLine) return;
    const TARGET = 5;
    const needed = TARGET - S.codeStock.length;
    if (needed <= 0) return;
    try {
      const results = await Promise.all(
        Array.from({ length: needed }, () =>
          _fetchWithTimeout(S.apiUrl + '?action=generate_code', {}, 10000)
            .then(r => r.json())
            .then(d => (d.status === 'ok' && d.code) ? d.code : null)
            .catch(() => null)
        )
      );
      const fresh = results.filter(Boolean);
      if (!fresh.length) return;
      S.codeStock = [...S.codeStock, ...fresh];
      localStorage.setItem(SK.CODE_STOCK, JSON.stringify(S.codeStock));
      this._renderCodeStockBadge();
    } catch(e) { console.warn('Code stock refill:', e.message); }
  },
  _popCodeFromStock() {
    if (!S.codeStock.length) return null;
    const code = S.codeStock.shift();
    localStorage.setItem(SK.CODE_STOCK, JSON.stringify(S.codeStock));
    this._renderCodeStockBadge();
    if (S.codeStock.length < 2) this._refillCodeStock();
    return code;
  },
  async _genCode() {
    const dispEl = document.getElementById('code-display');
    const statEl = document.getElementById('code-status');
    dispEl.textContent = '· · · · · ·';

    let code = null;
    let countMsg = '';

    // 1. Stock pré-chargé (offline-ready)
    code = this._popCodeFromStock();
    if (code) {
      const r = S.codeStock.length;
      countMsg = `✓ Code pré-chargé · ${r} restant${r > 1 ? 's' : ''}`;
    }

    // 2. Génération live si stock vide
    if (!code && S.apiUrl) {
      statEl.textContent = 'Génération…';
      try {
        const r = await _fetchWithTimeout(S.apiUrl + '?action=generate_code', {}, 15000);
        const d = await r.json();
        if (d.status === 'ok' && d.code) {
          code = d.code;
          countMsg = d.count > 1 ? `✓ Unique parmi ${d.count} codes connus` : '';
        }
      } catch(_) { /* fallback local */ }
    }

    // 3. Fallback local
    if (!code) {
      if (S.codes.size === 0 && S.apiUrl) await this._fetchCodes();
      let tries = 0;
      do { code = _randCode(); tries++; } while (S.codes.has(code) && tries < 50000);
      S.codes.add(code);
      countMsg = S.codes.size > 1 ? `✓ Local · ${S.codes.size} codes connus` : '⚠ Mode hors-ligne complet';
    }

    S.arr.code = code;
    dispEl.textContent = code;
    dispEl.style.transition = 'transform 0.15s';
    dispEl.style.transform = 'scale(1.06)';
    setTimeout(() => { dispEl.style.transform = ''; }, 180);
    statEl.textContent = countMsg;
  },
  regenerateCode() { this._genCode(); },
  /* ─ Photos (shared) ─ */
  triggerInput(id) { document.getElementById(id).click(); },
  async handlePhotos(evt, target) {
    const files = Array.from(evt.target.files);
    if (!files.length) return;
    for (const f of files) {
      const dataUrl = await _compress(f, 1200, 0.82);
      if (target === 'arrival')        S.arr.photos.push({ dataUrl, name: f.name });
      else if (target === 'arr')      S.arrPhotos.push({ dataUrl, name: f.name });
      else if (target === 'bcb-enlev') S.bcbEnlevPhotos.push({ dataUrl, name: f.name });
      else                            S.depPhotos.push({ dataUrl, name: f.name });
    }
    evt.target.value = '';
    if (target === 'arrival')        this._renderPhotoGrid('photo-grid-2', S.arr.photos, 'arrival');
    else if (target === 'arr')       this._renderArrPhotoGrid();
    else if (target === 'bcb-enlev') this._bcbRenderEnlevPhotoGrid();
    else                             this._renderDepPhotoGrid();
  },
  _renderPhotoGrid(gridId, photos, target) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const countId = target === 'arrival' ? 'photo-count-2' : null;
    if (countId) document.getElementById(countId).textContent = `${photos.length} photo${photos.length > 1 ? 's' : ''}`;
    const inputId = target === 'arrival' ? 'photo-input-2' : 'dep-photo-input';
    grid.innerHTML = photos.map((p, i) => `
      <div class="photo-thumb">
        <img src="${p.dataUrl}" loading="lazy">
        <button class="rm-btn" onclick="App.removePhoto(${i},'${target}')">✕</button>
      </div>`).join('') + `
      <div class="photo-add-btn" onclick="App.triggerInput('${inputId}')">
        <span style="font-size:26px;">📷</span><span>Ajouter</span>
      </div>`;
  },
  removePhoto(idx, target) {
    if (target === 'arrival') {
      S.arr.photos.splice(idx, 1);
      this._renderPhotoGrid('photo-grid-2', S.arr.photos, 'arrival');
    } else if (target === 'arr') {
      S.arrPhotos.splice(idx, 1);
      this._renderArrPhotoGrid();
    } else if (target === 'bcb-enlev') {
      S.bcbEnlevPhotos.splice(idx, 1);
      this._bcbRenderEnlevPhotoGrid();
    } else {
      S.depPhotos.splice(idx, 1);
      this._renderDepPhotoGrid();
    }
  },
  goToStep3() {
    if (!S.arr.code || S.arr.code.length !== 6) { this.toast('Code manquant, actualisez'); return; }
    const m = MODULES[S.arr.module] || {};
    document.getElementById('s3-icon').textContent   = m.icon || '📦';
    document.getElementById('s3-module').textContent = m.label || '';
    document.getElementById('s3-code').textContent   = S.arr.code;
    document.getElementById('s3-photos').textContent = `${S.arr.photos.length} photo(s)`;
    document.getElementById('inp-date').value        = S.arr.date;
    this.showStep(3);
  },
  /* ─ Submit arrival ─ */
  async submitArrival() {
    if (S.submitting) return;
    S.arr.chauffeur = document.getElementById('inp-chauffeur').value.trim();
    S.arr.date      = document.getElementById('inp-date').value || todayStr();
    S.arr.etat      = document.getElementById('inp-etat').value.trim();
    // Champs LOXAM
    if (S.arr.module === 'loxam') {
      S.arr.moduleType = document.getElementById('inp-module-type').value.trim();
      S.arr.numModule  = document.getElementById('inp-num-module').value.trim();
      S.arr.numSerie   = document.getElementById('inp-num-serie').value.trim();
      S.arr.lv         = document.getElementById('inp-lv').value.trim();
      S.arr.agence     = document.getElementById('inp-agence').value.trim();
      S.arr.longueur   = document.getElementById('inp-longueur').value.trim();
      // Validation champs obligatoires LOXAM
      if (!S.arr.moduleType || !S.arr.numModule || !S.arr.lv || !S.arr.agence) {
        this.toast('Remplissez Type, Num module, LV et Agence'); return;
      }
      if (!S.arr.longueur) {
        this.toast('La longueur (ml) est obligatoire'); return;
      }
    }
    const offline = !navigator.onLine || !S.apiUrl;
    // Avertissement photos hors-ligne
    if (offline && S.arr.photos.length > 0) {
      const ok = await this._confirmOfflinePhotos(S.arr.photos.length);
      if (!ok) return;
    }
    S.submitting = true;
    // Réinitialise step-4 : _showSuccess() l'a remplacé lors de la soumission précédente
    document.getElementById('step-4').innerHTML =
      `<div class="spinner" id="send-spinner"></div>` +
      `<p style="font-size:17px;font-weight:700;color:#1E293B;" id="send-msg">Envoi en cours...</p>` +
      `<p style="font-size:13px;color:#64748B;margin-top:4px;" id="send-detail"></p>`;
    this.showStep(4);
    const { code, module, moduleType, numModule, numSerie, lv, agence, chauffeur, date, etat, longueur, photos } = S.arr;
    const setMsg = (m, d='') => {
      document.getElementById('send-msg').textContent    = m;
      document.getElementById('send-detail').textContent = d;
    };
    const user = S.currentUser ? `${S.currentUser.prenom} ${S.currentUser.nom}`.trim() : '';
    try {
      if (offline) {
        setMsg('💾 Sauvegarde hors ligne...', `Code ${code}`);
        await _sleep(600);
        this._addToOfflineQueue({ action: 'arrival', code, module, moduleType, numModule, numSerie, lv, agence, chauffeur, date, etat, longueur, saisie_par: user });
        S.arr.submitted = true;
        this._saveHistory({ code, module, chauffeur, date, etat, photos: photos.length, photosLost: photos.length > 0, type: 'arrival', offline: true, pending: true });
        this._showSuccess(code, true, photos.length);
        return;
      }
      setMsg('Envoi en cours...', `Code ${code} · ${photos.length} photo(s)`);
      const payload = { action: 'arrival', code, module, moduleType, numModule, numSerie, lv, agence, chauffeur, date, etat, longueur, photos: photos.map(p => p.dataUrl), saisie_par: user };
      const res = await _post(S.apiUrl, payload);
      if (res.status !== 'ok' && res.status !== 'success') throw new Error(res.error || 'Réponse inattendue');
      setMsg('✓ Enregistré !', `Code ${code}`);
      S.arr.submitted = true;
      this._saveHistory({ code, module, chauffeur, date, etat, photos: photos.length, type: 'arrival' });
      await _sleep(700);
      this._showSuccess(code, false);
    } catch(err) {
      console.error(err);
      document.getElementById('send-spinner').style.display = 'none';
      // Échec réseau inattendu : mise en file d'attente pour renvoi automatique
      this._addToOfflineQueue({ action: 'arrival', code, module, moduleType, numModule, numSerie, lv, agence, chauffeur, date, etat, longueur, saisie_par: user });
      S.arr.submitted = true;
      this._saveHistory({ code, module, chauffeur, date, etat, photos: photos.length, photosLost: photos.length > 0, type: 'arrival', pending: true });
      setMsg('⚠️ Échec réseau', 'Sauvegardé — renvoi auto au retour réseau');
      await _sleep(2200);
      this._showSuccess(code, true, photos.length);
    } finally {
      S.submitting = false;
    }
  },
  _showSuccess(code, offline, photosCount = 0) {
    const isReception = S.activity === 'reception';
    const backBtn = isReception
      ? `<button class="btn btn-primary" onclick="App.goHome()" style="max-width:220px;margin:0 auto 12px;">← Accueil</button>`
      : `<button class="btn btn-primary" onclick="App.go('arrivals')" style="max-width:220px;margin:0 auto 12px;">← Arrivées</button>`;
    const photosWarning = (offline && photosCount > 0) ? `
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:10px 14px;margin:0 auto 16px;max-width:280px;text-align:left;">
        <p style="font-size:12px;font-weight:700;color:#92400E;margin:0 0 4px;">📷 ${photosCount} photo${photosCount > 1 ? 's' : ''} non envoyée${photosCount > 1 ? 's' : ''}</p>
        <p style="font-size:11px;color:#B45309;margin:0;">À ajouter manuellement depuis la fiche d'arrivée une fois en ligne.</p>
      </div>` : '';
    document.getElementById('step-4').innerHTML = `
      <div style="text-align:center;padding:28px 0;">
        <div style="font-size:60px;margin-bottom:14px;">${offline ? '💾' : '✅'}</div>
        <p style="font-size:20px;font-weight:700;color:#1E293B;margin-bottom:8px;">
          ${offline ? 'Données sauvegardées' : 'Arrivée enregistrée !'}
        </p>
        <div style="font-family:monospace;font-size:28px;font-weight:900;color:var(--brand);letter-spacing:6px;margin:16px 0 20px;">${code}</div>
        ${photosWarning}
        ${backBtn}
        <br>
        <button onclick="App.receptionDirecte()" style="background:none;border:none;color:var(--accent);font-size:15px;font-weight:600;cursor:pointer;padding:8px;">+ Nouvelle arrivée</button>
      </div>`;
  },
  _confirmOfflinePhotos(count) {
    return new Promise(resolve => {
      const id = 'modal-offline-photos';
      const existing = document.getElementById(id);
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
      el.innerHTML = `
        <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="font-size:36px;text-align:center;margin-bottom:12px;">📷</div>
          <h3 style="font-size:16px;font-weight:700;color:#1E293B;margin:0 0 8px;text-align:center;">Photos hors ligne</h3>
          <p style="font-size:13px;color:#475569;margin:0 0 6px;text-align:center;">
            Vous avez <strong>${count} photo${count > 1 ? 's' : ''}</strong> jointe${count > 1 ? 's' : ''}.
          </p>
          <p style="font-size:13px;color:#475569;margin:0 0 20px;text-align:center;">
            Sans réseau, elles ne peuvent pas être envoyées.<br>
            Les données texte seront sauvegardées.<br>
            Les photos seront à ajouter manuellement depuis la fiche une fois en ligne.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="offph-ok" class="btn btn-primary" style="width:100%;">Continuer sans les photos</button>
            <button id="offph-cancel" class="btn btn-secondary" style="width:100%;">Annuler — attendre le réseau</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      document.getElementById('offph-ok').onclick     = () => { el.remove(); resolve(true);  };
      document.getElementById('offph-cancel').onclick = () => { el.remove(); resolve(false); };
    });
  },
  /* ─ File d'attente hors-ligne ─ */
  _addToOfflineQueue(payload) {
    const item = { id: `${Date.now()}_${payload.code}`, ts: Date.now(), payload };
    S.offlineQueue.push(item);
    localStorage.setItem(SK.OFFLINE_QUEUE, JSON.stringify(S.offlineQueue));
    this._renderOfflineQueueBadge();
  },
  _renderOfflineQueueBadge() {
    const el = document.getElementById('offline-queue-badge');
    if (!el) return;
    const n = S.offlineQueue.length;
    if (n === 0) { el.style.display = 'none'; return; }
    el.style.display  = '';
    el.textContent    = `⏳ ${n}`;
  },
  async _processOfflineQueue() {
    if (!navigator.onLine || !S.apiUrl || !S.offlineQueue.length) return;
    const queue = [...S.offlineQueue];
    for (const item of queue) {
      try {
        const res = await _post(S.apiUrl, item.payload);
        if (res.status !== 'ok' && res.status !== 'success') continue;
        S.offlineQueue = S.offlineQueue.filter(q => q.id !== item.id);
        localStorage.setItem(SK.OFFLINE_QUEUE, JSON.stringify(S.offlineQueue));
        this._renderOfflineQueueBadge();
        this.toast(`✓ Arrivée ${item.payload.code} synchronisée`);
        // Rafraîchit la liste si on est sur l'écran Arrivées
        if (document.getElementById('view-arrivals') && document.getElementById('view-arrivals').style.display !== 'none') {
          this.loadArrivals();
        }
      } catch(e) {
        // On laisse l'item en file, il sera retenté au prochain retour réseau
      }
    }
  },
  /* ─ LOXAM Menu ─ */
  async loxamMenuInit() {
    const loaderEl = document.getElementById('lxmenu-loader');
    const gridEl   = document.getElementById('lxmenu-grid');
    const statusEl = document.getElementById('lxmenu-status');
    this._loxamMenuRefreshCounts();
    // Déjà chargé — grille immédiate
    if (S.depsLoaded && S.arrivalsLoaded) {
      if (loaderEl) loaderEl.style.display = 'none';
      if (gridEl)   gridEl.style.display = 'block';
      if (statusEl) { const n = new Date(); statusEl.textContent = 'MAJ ' + n.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}); }
      if (!S.historyLoaded && !S.historyLoading) this._prefetchHistory();
      return;
    }
    if (loaderEl) loaderEl.style.display = 'flex';
    if (gridEl)   gridEl.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Chargement des données…';
    if (!S.apiUrl) {
      if (loaderEl) loaderEl.innerHTML = '<div style="text-align:center;color:#EF4444;font-size:13px;padding:12px;">⚠️ URL API non configurée</div>';
      return;
    }
    await Promise.allSettled([
      S.depsLoaded || S.depsLoading                     ? Promise.resolve() : this.loadDepartures(),
      S.arrivalsLoaded                                   ? Promise.resolve() : this.loadArrivalsData(),
      S.catalogLoaded || S.catalogLoading || S.stockLoaded ? Promise.resolve() : this._prefetchCatalog(),
    ]);
    // LV links non-bloquants (utiles dans la liste production)
    if (!S.lvLinks || !Object.keys(S.lvLinks).length) this._prefetchLvLinks();
    // Historique non-bloquant — alimente les pastilles de pose dans les départs
    if (!S.historyLoaded && !S.historyLoading) this._prefetchHistory();
    this._loxamMenuRefreshCounts();
    if (loaderEl) loaderEl.style.display = 'none';
    if (gridEl)   gridEl.style.display = 'block';
    if (statusEl) { const n = new Date(); statusEl.textContent = 'MAJ ' + n.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}); }
  },
  _loxamMenuRefreshCounts() {
    const enProd  = S.depsLoaded    ? S.deps.filter(d => !d.parti).length : null;
    const arrPres = S.arrivalsLoaded ? S.arrivalsData.filter(a => !a.parti).length : null;
    const badgeProd = document.getElementById('lxmenu-badge-prod');
    if (badgeProd) {
      if (enProd !== null && arrPres !== null) {
        badgeProd.className = 'activity-badge badge-active';
        badgeProd.textContent = `${enProd} en prod · ${arrPres} arrivée${arrPres!==1?'s':''}`;
      } else {
        badgeProd.className = 'activity-badge badge-loading';
        badgeProd.textContent = '⟳ Chargement…';
      }
    }
    const badgeStock = document.getElementById('lxmenu-badge-stock');
    if (badgeStock) {
      if (S.stockLoaded && S.stockData.length > 0) {
        badgeStock.className = 'activity-badge badge-active';
        badgeStock.textContent = `${S.stockData.length} réf.`;
      }
    }
  },
  loxamMenuGoStock(view) {
    S.activity = 'stockage';
    this.go(view);
  },

  /* ─ Departures ─ */
  async loadDepartures(force = false) {
    if (!force && (S.depsLoaded || S.depsLoading)) return;
    if (force) { S.depsLoaded = false; S.depModuleFilter = 'all'; S.depDateFrom = ''; S.depDateTo = ''; }
    S.depsLoading = true;
    document.getElementById('dep-loading').style.display   = 'block';
    document.getElementById('no-departures').style.display = 'none';
    document.getElementById('dep-list').innerHTML          = '';
    if (!S.apiUrl) {
      document.getElementById('dep-loading').style.display   = 'none';
      document.getElementById('no-departures').style.display = 'block';
      return;
    }
    // Chargement en parallèle : données production + log photos départ
    this._loadDepPhotosLog();
    try {
      const url  = S.apiUrl + '?action=production';
      const resp = await _fetchWithTimeout(url, {}, 90000);
      const data = await resp.json();
      S.deps       = Array.isArray(data) ? data : (data.data || []);
      S.depsLoaded = true;
      this._buildModuleFilterBar();
      this._renderDepList();
    } catch(e) {
      document.getElementById('dep-list').innerHTML = `
        <div class="card" style="border-left:4px solid #F87171;">
          <p style="color:#991B1B;font-weight:600;">Impossible de charger les départs</p>
          <p style="font-size:12px;color:#64748B;margin-top:3px;">${e.message}</p>
          <button onclick="App.loadDepsFromServer(true)" style="margin-top:10px;background:#FEE2E2;color:#991B1B;border:none;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">↻ Réessayer</button>
        </div>`;
    } finally {
      S.depsLoading = false;
      document.getElementById('dep-loading').style.display = 'none';
    }
  },
  // Retourne le statut courant d'un article (le plus avancé dans la séquence)
  // Séquence : enCours → aControler → termine  (deCote est indépendant)
  _depCurrentStatus(d) {
    if (!d.status) return null;
    if (d.status.deCote)     return 'deCote';
    if (d.status.termine)    return 'termine';
    if (d.status.aControler) return 'aControler';
    if (d.status.enCours)    return 'enCours';
    return null;
  },
  setDepFilter(filter) {
    S.depFilter = filter;
    document.querySelectorAll('.dep-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    this._renderDepList();
  },
  setDepModuleFilter(mod) {
    S.depModuleFilter = mod;
    document.querySelectorAll('.dep-module-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mod === mod);
    });
    this._updateDepFilterBadge();
    this._renderDepList();
  },
  toggleDepSort() {
    S.depSortAsc = !S.depSortAsc;
    const icon  = document.getElementById('dep-sort-icon');
    const label = document.getElementById('dep-sort-label');
    if (icon)  icon.textContent  = S.depSortAsc ? '↑' : '↓';
    if (label) label.textContent = S.depSortAsc ? 'En cours → Terminé' : 'Terminé → En cours';
    this._renderDepList();
  },
  async _loadDepPhotosLog() {
    if (!S.apiUrl) return;
    try {
      const resp = await _fetchWithTimeout(S.apiUrl + '?action=dep_photos_log', {}, 10000);
      const data = await resp.json();
      if (data.status === 'ok' && data.log) {
        S.depPhotosLog = data.log;
        if (S.depsLoaded) this._renderDepList(); // rafraîchit les badges si liste déjà affichée
      }
    } catch(e) { /* silencieux : les badges resteront vides */ }
  },
  toggleDepFilters() {
    S.depFiltersOpen = !S.depFiltersOpen;
    const panel   = document.getElementById('dep-filters-panel');
    const chevron = document.getElementById('dep-filter-chevron');
    if (panel)   panel.style.display   = S.depFiltersOpen ? 'block' : 'none';
    if (chevron) chevron.style.transform = S.depFiltersOpen ? 'rotate(180deg)' : '';
  },
  onDepDateChange() {
    S.depDateFrom = (document.getElementById('dep-date-from').value || '').trim();
    S.depDateTo   = (document.getElementById('dep-date-to').value   || '').trim();
    // Bouton "Tout" actif seulement si aucune date saisie
    const allBtn = document.getElementById('dep-date-all-btn');
    const hasDate = S.depDateFrom || S.depDateTo;
    if (allBtn) {
      allBtn.style.background   = hasDate ? 'white'          : 'var(--brand)';
      allBtn.style.color        = hasDate ? 'var(--brand)'   : 'white';
      allBtn.style.borderColor  = 'var(--brand)';
    }
    this._updateDepFilterBadge();
    this._renderDepList();
  },
  resetDepDates() {
    S.depDateFrom = ''; S.depDateTo = '';
    const from = document.getElementById('dep-date-from');
    const to   = document.getElementById('dep-date-to');
    if (from) from.value = '';
    if (to)   to.value   = '';
    const allBtn = document.getElementById('dep-date-all-btn');
    if (allBtn) { allBtn.style.background = 'var(--brand)'; allBtn.style.color = 'white'; }
    this._updateDepFilterBadge();
    this._renderDepList();
  },
  _updateDepFilterBadge() {
    const toggle   = document.getElementById('dep-filter-toggle');
    const badge    = document.getElementById('dep-filter-badge');
    const hasDate  = S.depDateFrom || S.depDateTo;
    const hasMod   = S.depModuleFilter !== 'all';
    const hasScope = S.depScope === 'avecPartis';
    const count    = (hasDate ? 1 : 0) + (hasMod ? 1 : 0) + (hasScope ? 1 : 0);
    if (badge)  { badge.textContent = count; badge.style.display = count ? 'inline' : 'none'; }
    if (toggle) { toggle.classList.toggle('filters-active', count > 0); }
  },
  _depDateOk(d, preferFin = false) {
    if (!S.depDateFrom && !S.depDateTo) return true;
    // Pour les Partis on filtre sur la date de départ (fin), pour les actifs sur debut
    const ref = preferFin ? (d.fin || d.debut) : (d.debut || d.fin);
    if (!ref) return false;
    const dt = new Date(ref); dt.setHours(0,0,0,0);
    if (S.depDateFrom && dt < new Date(S.depDateFrom)) return false;
    if (S.depDateTo   && dt > new Date(S.depDateTo))   return false;
    return true;
  },
  _onDepSearch(e) {
    S.depSearch = (e.target.value || '').trim().toLowerCase();
    this._renderDepList();
  },
  setDepScope(scope) {
    S.depScope = scope;
    document.querySelectorAll('.scope-btn').forEach(b => b.classList.toggle('active', b.dataset.scope === scope));
    this._updateDepFilterBadge();
    // Charger les archives si pas encore fait
    if (scope === 'avecPartis' && !S.archiveLoaded) this.loadArchive();
    else this._renderDepList();
  },
  _buildModuleFilterBar() {
    const bar = document.getElementById('dep-module-filters');
    if (!bar) return;
    bar.innerHTML = '';
    // Collecte les types uniques (col F non vides)
    const types = [...new Set(S.deps.map(d => (d.module || '').trim()).filter(Boolean))].sort();
    if (!types.length) return;
    // Bouton "Tous types"
    const allBtn = document.createElement('button');
    allBtn.className   = 'dep-module-btn active';
    allBtn.dataset.mod = 'all';
    allBtn.textContent = 'Tous types';
    allBtn.addEventListener('click', () => App.setDepModuleFilter('all'));
    bar.appendChild(allBtn);
    // Un bouton par type
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.className   = 'dep-module-btn';
      btn.dataset.mod = t;
      btn.textContent = t;
      btn.addEventListener('click', () => App.setDepModuleFilter(t));
      bar.appendChild(btn);
    });
  },
  _renderDepList() {
    const list = document.getElementById('dep-list');
    const none = document.getElementById('no-departures');
    const q    = S.depSearch;
    // ── Filtre actifs : statut + module + recherche texte ─────────────────
    const filtered = S.deps.filter(d => {
      const statusOk = S.depFilter === 'all' || this._depCurrentStatus(d) === S.depFilter;
      const moduleOk = S.depModuleFilter === 'all' || (d.module || '').trim() === S.depModuleFilter;
      const dateOk   = this._depDateOk(d);
      const searchOk = !q ||
        (d.code       || '').toLowerCase().includes(q) ||
        (d.codeModule || '').toLowerCase().includes(q) ||
        (d.chantier   || '').toLowerCase().includes(q) ||
        (d.module     || '').toLowerCase().includes(q);
      return statusOk && moduleOk && dateOk && searchOk;
    });
    // Badges statut — tiennent compte du filtre module ET de la recherche texte
    const baseByStatus = S.deps.filter(d => {
      const moduleOk = S.depModuleFilter === 'all' || (d.module || '').trim() === S.depModuleFilter;
      const searchOk = !q ||
        (d.code       || '').toLowerCase().includes(q) ||
        (d.codeModule || '').toLowerCase().includes(q) ||
        (d.chantier   || '').toLowerCase().includes(q) ||
        (d.module     || '').toLowerCase().includes(q);
      return moduleOk && searchOk;
    });
    const counts = { all: baseByStatus.length, enCours: 0, aControler: 0, termine: 0, deCote: 0 };
    baseByStatus.forEach(d => {
      const cur = this._depCurrentStatus(d);
      if (cur && counts[cur] !== undefined) counts[cur]++;
    });
    document.querySelectorAll('.dep-filter-btn').forEach(btn => {
      const f   = btn.dataset.filter;
      const cnt = counts[f] ?? 0;
      const label = { all: 'Tous', enCours: 'En cours', aControler: 'À contrôler', termine: 'Terminé', deCote: 'De côté' }[f];
      btn.textContent = cnt > 0 ? `${label} (${cnt})` : label;
    });
    // ── Partis filtrés par type de module + date (fin) + recherche texte ──
    const filteredPartis = S.depScope === 'avecPartis' ? S.archive.filter(d => {
      const moduleOk = S.depModuleFilter === 'all' || (d.module || '').trim() === S.depModuleFilter;
      if (!moduleOk) return false;
      if (!this._depDateOk(d, true)) return false;  // filtre par date de départ (fin)
      if (!q) return true;
      return (d.code       || '').toLowerCase().includes(q) ||
             (d.codeModule || '').toLowerCase().includes(q) ||
             (d.chantier   || '').toLowerCase().includes(q) ||
             (d.module     || '').toLowerCase().includes(q);
    }) : [];
    if (!filtered.length && !filteredPartis.length) {
      list.innerHTML = ''; none.style.display = 'block'; return;
    }
    none.style.display = 'none';
    // Tri par statut (actifs seulement)
    const _statusRank = { enCours: 0, aControler: 1, termine: 2, deCote: 3 };
    filtered.sort((a, b) => {
      const ra = _statusRank[this._depCurrentStatus(a)] ?? 4;
      const rb = _statusRank[this._depCurrentStatus(b)] ?? 4;
      return S.depSortAsc ? ra - rb : rb - ra;
    });
    list.innerHTML = filtered.map((d, i) => {
      const realIdx  = S.deps.indexOf(d);
      const code     = d.code || '------';
      const titre    = d.module || code;
      const cur      = this._depCurrentStatus(d);
      const selected = S.depSelectMode && S.depSelected.has(code);
      const chipMap  = {
        enCours:    '<span class="chip chip-blue">En cours</span>',
        aControler: '<span class="chip chip-yellow">À contrôler</span>',
        termine:    '<span class="chip chip-green">Terminé</span>',
        deCote:     '<span class="chip" style="background:#F3E8FF;color:#6B21A8;">De côté</span>',
      };
      const chips   = cur ? chipMap[cur] : '';
      const dur     = _duration(d.debut, d.status && d.status.termine ? d.fin : null);
      const lvSiblingsCount = d.lv ? this._depLvSiblingCodes(d.lv, code).length : 0;
      const onclick = S.depSelectMode ? `App.toggleDepSelect('${code}')` : `App.openDep(${realIdx})`;
      const cbHtml  = S.depSelectMode
        ? `<div style="width:22px;height:22px;border-radius:6px;border:2px solid ${selected?'#1D4ED8':'#CBD5E1'};background:${selected?'#1D4ED8':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;color:white;">${selected?'✓':''}</div>`
        : '';
      return `
        <div class="dep-card${selected?' dep-selected':''}" onclick="${onclick}">
          ${cbHtml}
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:38px;">
            <div style="width:34px;height:34px;background:#EBF5FB;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;">📤</div>
            <div style="font-family:'Courier New',monospace;font-size:9px;color:#94A3B8;text-align:center;line-height:1.1;max-width:38px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${code}</div>
          </div>
          <div class="dep-card-left">
            <div class="code-mono" style="font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.codeModule || '&nbsp;'}</div>
            <div style="font-size:10px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${titre !== code ? titre : '&nbsp;'}</div>
          </div>
          <div class="dep-card-right">
            <div style="font-size:13px;font-weight:600;color:#1E293B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">${d.chantier || '&nbsp;'}</div>
            ${d.description ? `<div style="font-size:11px;color:#64748B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">${d.description.length > 55 ? d.description.substring(0,53)+'…' : d.description}</div>` : ''}
            <div style="display:flex;align-items:center;gap:4px;overflow:hidden;flex-wrap:wrap;">
              ${chips}
              ${d.status && d.status.grutage ? `<span class="chip" style="background:#FEF2F2;color:#991B1B;flex-shrink:0;">🏗 Grutage</span>` : ''}
              ${d.livraisonPrevue ? `<span class="chip" style="background:#EFF6FF;color:#1D4ED8;flex-shrink:0;">📅 ${_fmtDateShort(d.livraisonPrevue)}</span>` : ''}
              ${dur ? `<span style="font-size:10px;color:#94A3B8;white-space:nowrap;flex-shrink:0;">⏱ ${dur}</span>` : ''}
              ${S.depPhotosLog[code] ? `<span style="font-size:10px;background:#F0FDF4;color:#166534;border-radius:6px;padding:1px 5px;white-space:nowrap;flex-shrink:0;">📷 ${S.depPhotosLog[code].count}</span>` : ''}
            </div>
          </div>
          ${(d.lv || d.commande) ? `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;min-width:52px;">${d.lv ? `<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;border-radius:4px;padding:1px 5px;font-weight:600;white-space:nowrap;" title="${lvSiblingsCount ? lvSiblingsCount + ' autre(s) module(s) sur la même LV, marqué(s) parti avec celui-ci' : ''}">📄 ${d.lv}${lvSiblingsCount ? ` (+${lvSiblingsCount})` : ''}</span>` : ''}${d.commande ? `<span style="font-size:10px;background:#F1F5F9;color:#475569;border-radius:4px;padding:1px 5px;white-space:nowrap;">${d.commande}</span>` : ''}</div>` : ''}
          ${S.depSelectMode ? '' : (() => {
            const codeSafe   = code.replace(/'/g, "\\'");
            const modSafe    = (d.codeModule || '').replace(/'/g, "\\'");
            const chantSafe  = (d.chantier   || '').replace(/'/g, "\\'");
            const hasPose    = S.poseHistory.has(code);
            return `<button onclick="event.stopPropagation();App.openPoseModal('${codeSafe}','${modSafe}','${chantSafe}')"
              title="Saisir pièces posées"
              style="background:none;border:none;cursor:pointer;padding:5px 4px;display:flex;flex-direction:column;align-items:center;gap:1px;flex-shrink:0;opacity:${hasPose?'1':'0.4'};">
              <span style="font-size:17px;line-height:1;">🔧</span>
              ${hasPose ? '<span class="dep-pose-dot"></span>' : '<span style="width:7px;height:4px;display:block;"></span>'}
            </button>
            <span style="color:#CBD5E1;font-size:16px;flex-shrink:0;">›</span>`;
          })()}
        </div>`;
    }).join('');
    // ── Section Partis ────────────────────────────────────────────────────
    if (S.depScope === 'avecPartis') {
      if (!S.archiveLoaded) {
        list.innerHTML += `<div class="partis-separator">Partis</div>
          <div style="text-align:center;padding:20px 0;"><div class="spinner"></div></div>`;
      } else if (filteredPartis.length) {
        list.innerHTML += `<div class="partis-separator">Partis · ${filteredPartis.length}</div>`;
        list.innerHTML += filteredPartis.map((d) => {
          const realIdx  = S.archive.indexOf(d);
          const code     = d.code || '------';
          const titre    = d.module || code;
          const dur      = _duration(d.debut, d.fin);
          const codeSafe  = code.replace(/'/g, "\\'");
          const modSafe   = (d.codeModule || '').replace(/'/g, "\\'");
          const chantSafe = (d.chantier   || '').replace(/'/g, "\\'");
          const hasPose   = S.poseHistory.has(code);
          return `
            <div class="dep-card" style="opacity:0.8;" onclick="App.openArchiveDep(${realIdx})">
              <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:38px;">
                <div style="width:34px;height:34px;background:#F1F5F9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;">📦</div>
                <div style="font-family:'Courier New',monospace;font-size:9px;color:#94A3B8;text-align:center;line-height:1.1;max-width:38px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${code}</div>
              </div>
              <div class="dep-card-left">
                <div class="code-mono" style="font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.codeModule || ' '}</div>
                <div style="font-size:10px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${titre !== code ? titre : ' '}</div>
              </div>
              <div class="dep-card-right">
                <div style="font-size:13px;font-weight:600;color:#64748B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">${d.chantier || ' '}</div>
                <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                  ${dur ? `<span style="font-size:10px;color:#94A3B8;white-space:nowrap;">⏱ ${dur}</span>` : ''}
                  ${d.lv ? `<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;border-radius:4px;padding:1px 5px;font-weight:600;white-space:nowrap;">📄 ${d.lv}</span>` : ''}
                </div>
              </div>
              <button onclick="event.stopPropagation();App.openPoseModal('${codeSafe}','${modSafe}','${chantSafe}')"
                title="Voir / ajouter pièces posées"
                style="background:none;border:none;cursor:pointer;padding:5px 4px;display:flex;flex-direction:column;align-items:center;gap:1px;flex-shrink:0;opacity:${hasPose?'1':'0.4'};">
                <span style="font-size:17px;line-height:1;">🔧</span>
                ${hasPose ? '<span class="dep-pose-dot"></span>' : '<span style="width:7px;height:4px;display:block;"></span>'}
              </button>
              <span style="color:#CBD5E1;font-size:16px;flex-shrink:0;">›</span>
            </div>`;
        }).join('');
      } else if (q) {
        list.innerHTML += `<div class="partis-separator">Partis</div>
          <p style="font-size:12px;color:#94A3B8;text-align:center;padding:12px 0;">Aucun parti correspondant</p>`;
      }
    }
  },
  // Codes des autres modules actifs (non partis) qui partagent le même n° de
  // LV — sur cette LV, marquer un module parti marque toute la LV parti côté
  // tableur (voir _markParti côté Apps Script, dédup par lvNum), donc ces
  // modules "partent" ensemble qu'on les sélectionne ou non.
  _depLvSiblingCodes(lv, excludeCode) {
    if (!lv) return [];
    return S.deps.filter(d => d.lv === lv && d.code !== excludeCode).map(d => d.code);
  },
  toggleDepSelectMode() {
    S.depSelectMode = !S.depSelectMode;
    S.depSelected.clear();
    const fab = document.getElementById('fab-dep');
    if (fab) {
      fab.style.background = S.depSelectMode ? '#1D4ED8' : 'var(--brand)';
      fab.style.boxShadow  = S.depSelectMode
        ? '0 4px 16px rgba(29,78,216,0.5)'
        : '0 4px 16px rgba(26,82,118,0.45)';
    }
    this._updateDepLvBar();
    this._renderDepList();
  },
  toggleDepSelect(code) {
    // Sélection strictement individuelle — le regroupement par LV n'intervient
    // qu'au moment de "Parti" (voir depMarkParti/_updateDepLvBar), pas ici,
    // pour ne pas contraindre la sélection si d'autres actions par module
    // s'ajoutent un jour.
    if (S.depSelected.has(code)) S.depSelected.delete(code);
    else S.depSelected.add(code);
    this._updateDepLvBar();
    this._renderDepList();
  },
  // Codes réellement envoyés à dep_mark_parti : la sélection de l'utilisateur
  // + les modules "frères" (même LV) non sélectionnés, pour que le voyage
  // parte entièrement du Planning même si l'utilisateur n'a coché qu'un module.
  _depExpandedSelection() {
    const expanded = new Set(S.depSelected);
    S.depSelected.forEach(code => {
      const d = S.deps.find(x => x.code === code);
      if (d && d.lv) this._depLvSiblingCodes(d.lv, code).forEach(c => expanded.add(c));
    });
    return [...expanded];
  },
  _updateDepLvBar() {
    const bar     = document.getElementById('dep-lv-bar');
    const count   = document.getElementById('dep-lv-count');
    const partiBtn = document.getElementById('dep-mark-parti-btn');
    if (!bar) return;
    const n = S.depSelected.size;
    bar.style.display = (S.depSelectMode && n > 0) ? '' : 'none';
    if (count) count.textContent = `${n} module${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}`;
    if (partiBtn) {
      const extra = this._depExpandedSelection().length - n;
      partiBtn.textContent = extra > 0 ? `✅ Parti (+${extra}) →` : '✅ Parti →';
    }
  },
  async depCreateLv() {
    if (!S.depSelected.size) return;
    const selectedDeps = S.deps.filter(d => S.depSelected.has(d.code));
    if (!selectedDeps.length) return;
    const userActs = S.currentUser?.activites || [];
    if (!userActs.includes('lvu')) { this.toast('⛔ Accès LV non autorisé'); return; }

    // Vérifier que tous les modules ont la même destination (code agence)
    if (selectedDeps.length > 1) {
      const agCodes = [...new Set(selectedDeps.map(d =>
        (d.ag || ((d.chantier || '').match(/^(\d{3,6})/)||[])[1] || '').trim()
      ).filter(Boolean))];
      if (agCodes.length > 1) {
        const ok = window.confirm(
          `⚠️ Destinations différentes détectées (agences : ${agCodes.join(', ')}).\n` +
          `Une LV est normalement par destination.\nContinuer quand même ?`
        );
        if (!ok) return;
      }
    }

    // Réinitialiser la sélection
    S.depSelectMode = false;
    S.depSelected.clear();
    // Pré-remplir les items LOXAM avec les modules sélectionnés
    S.lvu.loxamItems    = selectedDeps;
    S.lvu.selectedItems = new Set(selectedDeps.map(d => d.code));
    // Basculer vers l'activité LVU
    S.activity = 'lvu';
    await this.lvuInit();
    // Charger les agences en premier (await) pour que lvuApplyLoxam puisse pré-remplir le destinataire
    await this.lvuLoadAgencies();
    // Appliquer les modules (source loxam + marchandises + destinataire)
    this.lvuSetSource('loxam');
    this.lvuApplyLoxam();
  },
  async depMarkParti() {
    if (!S.depSelected.size) return;
    // Sélection + modules "frères" (même LV) — le voyage part en entier, même
    // si l'utilisateur n'a coché qu'un seul module de la LV (voir badge
    // "Parti (+N)" affiché sur ce bouton par _updateDepLvBar).
    const codes = this._depExpandedSelection();
    const extra = codes.length - S.depSelected.size;
    const n = codes.length;
    const extraNote = extra > 0 ? `\n\n(+${extra} module${extra > 1 ? 's' : ''} ajouté${extra > 1 ? 's' : ''} automatiquement, même LV)` : '';
    const ok = window.confirm(`Marquer ${n} module${n > 1 ? 's' : ''} comme parti${n > 1 ? 's' : ''} ?\n\n${codes.join(', ')}${extraNote}`);
    if (!ok || S.depPartiBusy) return;
    // Bouton bloqué pendant l'appel (quelques secondes) pour éviter les clics répétés.
    S.depPartiBusy = true;
    const btn = document.getElementById('dep-mark-parti-btn');
    const btnHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '⏳ Envoi…'; }
    this.toast('Mise à jour en cours…');
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'dep_mark_parti', codes })
      }, 30000);
      const res = await r.json();
      if (res.status === 'ok') {
        const updatedSet = new Set((res.updated || []).map(c => c.toUpperCase()));
        S.deps = S.deps.filter(d => !updatedSet.has((d.code || '').toUpperCase()));
        S.depSelectMode = false;
        S.depSelected.clear();
        const fab = document.getElementById('fab-dep');
        if (fab) { fab.style.background = 'var(--brand)'; fab.style.boxShadow = '0 4px 16px rgba(26,82,118,0.45)'; }
        this._updateDepLvBar();
        this._renderDepList();
        this.toast(`✅ ${res.count} module${res.count > 1 ? 's' : ''} marqué${res.count > 1 ? 's' : ''} parti${res.count > 1 ? 's' : ''}`);
        // Portail transporteur (Supabase) : synchronisé par le serveur (dep_mark_parti).
      } else {
        this.toast('❌ ' + (res.error || 'Erreur inconnue'));
      }
    } catch(e) {
      this.toast('❌ Erreur réseau : ' + e.message);
    } finally {
      S.depPartiBusy = false;
      if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.innerHTML = btnHtml; }
    }
  },
  openDep(idx) {
    S.selDep        = S.deps[idx];
    S.depFromArchive = false;
    S.depPhotos     = [];
    this.go('dep-detail');
    this._renderDepDetail();
  },
  openArchiveDep(idx) {
    S.selDep        = S.archive[idx];
    S.depFromArchive = true;
    S.depPhotos     = [];
    this.go('dep-detail');
    this._renderDepDetail();
  },
  _renderDepDetail() {
    const d = S.selDep;
    if (!d) return;
    const code  = d.code || '------';
    const titre = d.module || code;
    document.getElementById('dep-detail-body').innerHTML = `
      <div class="card" style="margin-bottom:12px;">
        ${d.codeModule ? `<div class="code-mono" style="font-size:28px;letter-spacing:3px;margin-bottom:4px;">${d.codeModule}</div>` : ''}
        ${d.status && d.status.grutage ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">🏗</span><span style="font-size:13px;font-weight:700;color:#991B1B;">GRUTAGE À LA LIVRAISON</span></div>` : ''}
        <div style="font-size:16px;font-weight:600;color:#1E293B;margin-bottom:4px;">${d.chantier || '—'}${d.ag ? ' — Ag. ' + d.ag : ''}</div>
        <div style="font-size:12px;color:#94A3B8;">📋 ${code}</div>
        <div style="font-size:13px;color:#64748B;margin-top:2px;">${titre}</div>
        ${d.description ? `<div style="font-size:12px;color:#94A3B8;margin-top:4px;line-height:1.4;">${d.description}</div>` : ''}
        ${d.debut || d.fin ? `<div style="font-size:12px;color:#64748B;margin-top:6px;">
          📅 ${d.debut ? 'Entrée le ' + _fmtDate(d.debut) : ''}
          ${d.fin ? ' → ' + _fmtDate(d.fin) : (d.debut ? ' → auj.' : '')}
          ${(() => { const finCalc = S.depFromArchive ? d.fin : (d.status && d.status.termine ? d.fin : null); const dur = _duration(d.debut, finCalc); return dur ? `<span style="margin-left:6px;background:#F1F5F9;border-radius:4px;padding:1px 6px;font-weight:600;">⏱ ${dur}</span>` : ''; })()}
        </div>` : ''}
        ${d.lv ? `<div style="font-size:12px;color:#1D4ED8;font-weight:600;margin-top:4px;">📄 LV N° ${d.lv}</div>` : ''}
        ${d.commande ? `<div style="font-size:12px;color:#64748B;margin-top:2px;">🔖 Commande : ${d.commande}</div>` : ''}
        <div style="font-size:12px;color:#1E293B;margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span>📅 Livraison prévue : ${d.livraisonPrevue ? _fmtDate(d.livraisonPrevue) : 'non renseignée'}</span>
          ${!S.depFromArchive ? `<button onclick="App.toggleLivraisonPrevueEdit()" style="background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;padding:0;">Modifier</button>` : ''}
        </div>
        ${!S.depFromArchive ? `
        <div id="livraison-prevue-edit" style="display:none;gap:6px;align-items:center;margin-top:8px;">
          <input type="date" id="livraison-prevue-input" value="${_toIsoDateInput(d.livraisonPrevue)}" style="flex:1;padding:8px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;">
          <button onclick="App.saveLivraisonPrevue()" style="background:var(--brand);color:white;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">OK</button>
        </div>` : ''}
        <div id="dep-drive-section" style="margin-top:12px;">
          <p style="font-size:12px;color:#94A3B8;">🔄 Vérification du dossier Drive…</p>
        </div>
      </div>
      ${!S.depFromArchive ? `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0;">Photos du départ</p>
          ${S.depPhotosLog[d.code] ? `<span style="font-size:11px;background:#F0FDF4;color:#166534;border-radius:6px;padding:2px 8px;font-weight:600;">📷 ${S.depPhotosLog[d.code].count} photo${S.depPhotosLog[d.code].count > 1 ? 's' : ''} · ${_fmtDate(S.depPhotosLog[d.code].date)}</span>` : ''}
        </div>
        <div class="photo-grid" id="dep-photo-grid" style="margin-bottom:10px;"></div>
        <input type="file" id="dep-photo-input" accept="image/*" multiple style="display:none;" onchange="App.handlePhotos(event,'dep')">
        <p id="dep-photo-count" style="font-size:12px;color:#64748B;margin-bottom:10px;">0 photo ajoutée</p>
        <button onclick="App.triggerInput('dep-photo-input')" style="background:#EBF5FB;color:var(--brand);border:none;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:100%;">📷 Ajouter des photos</button>
      </div>
      <div style="margin-top:14px;">
        <button class="btn btn-primary" id="btn-dep-submit" onclick="App.submitDep()">📤 Enregistrer les photos de départ</button>
      </div>` : `
      <div class="card" style="background:#F0FDF4;border:1px solid #BBF7D0;">
        <p style="font-size:14px;font-weight:600;color:#15803D;">✅ Article parti</p>
        <p style="font-size:12px;color:#64748B;margin-top:4px;">Cet article a quitté le parc.</p>
      </div>`}`;
    if (!S.depFromArchive) this._renderDepPhotoGrid();
    this._loadDriveLinkForDetail(d.code, S.depFromArchive ? 'archive' : 'production', 'dep-drive-section', 'drive-files-panel', 'btn-drive-files');
  },
  toggleLivraisonPrevueEdit() {
    const box = document.getElementById('livraison-prevue-edit');
    if (!box) return;
    box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
  },
  async saveLivraisonPrevue() {
    const d = S.selDep;
    if (!d) return;
    const input = document.getElementById('livraison-prevue-input');
    const date  = input ? input.value : '';
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'dep_set_livraison_prevue', code: d.code, date })
      }, 20000);
      const res = await r.json();
      if (res.status !== 'ok') { this.toast('❌ ' + (res.error || 'Erreur')); return; }
      d.livraisonPrevue = date;
      const box = document.getElementById('livraison-prevue-edit');
      if (box) box.style.display = 'none';
      this._renderDepDetail();
      this._renderDepList();
      this.toast('✅ Livraison prévue mise à jour');
    } catch(e) {
      this.toast('❌ Erreur : ' + e.message);
    }
  },
  async loadDriveFiles(folderId, panelId = 'drive-files-panel', btnId = 'btn-drive-files') {
    if (!folderId) return;
    const panel = document.getElementById(panelId);
    const btn   = document.getElementById(btnId);
    if (!panel) return;
    // Spinner pendant le chargement
    if (btn) { btn.disabled = true; btn.textContent = 'Chargement…'; }
    panel.innerHTML = '<p style="font-size:12px;color:#94A3B8;">Récupération des fichiers…</p>';
    try {
      const url  = S.apiUrl + '?action=drive_files&folderId=' + encodeURIComponent(folderId);
      const resp = await _fetchWithTimeout(url, {}, 30000);
      const data = await resp.json();
      if (data.status !== 'ok' || !data.files?.length) {
        panel.innerHTML = '<p style="font-size:12px;color:#94A3B8;">Dossier vide ou inaccessible.</p>';
        if (btn) { btn.disabled = false; btn.textContent = '📂 Voir les fichiers'; }
        return;
      }
      // Icône selon le type MIME
      const icon = mime => {
        if (mime.includes('image'))       return '🖼️';
        if (mime.includes('pdf'))         return '📄';
        if (mime.includes('spreadsheet')) return '📊';
        if (mime.includes('document'))    return '📝';
        if (mime.includes('video'))       return '🎬';
        if (mime.includes('folder'))      return '📁';
        return '📎';
      };
      panel.innerHTML = `
        <div style="border-top:1px solid #F1F5F9;margin-top:4px;padding-top:8px;">
          <p style="font-size:11px;color:#94A3B8;margin-bottom:6px;">${data.count} fichier${data.count > 1 ? 's' : ''} dans le dossier</p>
          ${data.files.map(f => `
            <a href="${f.url}" target="_blank" rel="noopener"
               style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #F8FAFC;text-decoration:none;">
              <span style="font-size:18px;flex-shrink:0;">${icon(f.mimeType)}</span>
              <span style="font-size:13px;color:#1E293B;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
              <span style="color:#CBD5E1;font-size:14px;">›</span>
            </a>`).join('')}
        </div>`;
      if (btn) { btn.disabled = false; btn.textContent = '↺ Actualiser'; }
    } catch(e) {
      panel.innerHTML = `<p style="font-size:12px;color:#EF4444;">Erreur : ${e.message}</p>`;
      if (btn) { btn.disabled = false; btn.textContent = '📂 Réessayer'; }
    }
  },
  /* ─ Lazy-load Drive link for a detail card ─ */
  async _loadDriveLinkForDetail(code, source, sectionId, panelId, btnId) {
    const section = document.getElementById(sectionId);
    if (!section || !code || code === '------') {
      if (section) section.innerHTML = '';
      return;
    }
    try {
      const url  = `${S.apiUrl}?action=drive_link&code=${encodeURIComponent(code)}&source=${encodeURIComponent(source)}`;
      const resp = await _fetchWithTimeout(url, {}, 20000);
      const data = await resp.json();
      // Section could have been replaced if user navigated away
      const sec = document.getElementById(sectionId);
      if (!sec) return;
      if (data.status === 'ok' && data.lienDrive) {
        const lien        = data.lienDrive;
        const isFolder    = /\/folders\//.test(lien);
        const folderMatch = isFolder ? (lien.match(/\/folders\/([a-zA-Z0-9_-]+)/) || [])[1] : null;
        sec.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
            <a href="${lien}" target="_blank" rel="noopener"
               style="font-size:13px;color:var(--accent);font-weight:600;text-decoration:none;">
              📁 Ouvrir dans Drive
            </a>
            ${folderMatch ? `<button
              id="${btnId}"
              onclick="App.loadDriveFiles('${folderMatch}','${panelId}','${btnId}')"
              style="background:none;border:none;color:#94A3B8;font-size:12px;cursor:pointer;padding:0;">
              ↺ Actualiser
            </button>` : ''}
          </div>
          <div id="${panelId}" style="margin-top:0;"></div>`;
        // Chargement automatique des fichiers si c'est un dossier
        if (folderMatch) this.loadDriveFiles(folderMatch, panelId, btnId);
      } else {
        sec.innerHTML = `
          <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:8px 12px;">
            <p style="font-size:12px;color:#92400E;margin:0;">⚠️ Aucun dossier Drive trouvé pour ce module</p>
          </div>`;
      }
    } catch(e) {
      const sec = document.getElementById(sectionId);
      if (sec) sec.innerHTML = `<p style="font-size:12px;color:#EF4444;">Erreur Drive : ${e.message}</p>`;
    }
  },
  /* ─ Archive (Partis) ─ */
  async loadArchive(force = false) {
    if (!force && S.archiveLoaded) return;
    document.getElementById('archive-loading').style.display = 'block';
    document.getElementById('no-archive').style.display      = 'none';
    document.getElementById('archive-search').style.display  = 'none';
    document.getElementById('archive-list').innerHTML        = '';
    if (!S.apiUrl) {
      document.getElementById('archive-loading').style.display = 'none';
      document.getElementById('no-archive').style.display      = 'block';
      return;
    }
    try {
      const url  = S.apiUrl + '?action=archive';
      const resp = await _fetchWithTimeout(url, {}, 40000);
      const data = await resp.json();
      S.archive       = Array.isArray(data) ? data : (data.data || []);
      S.archiveLoaded = true;
      // Si on est en mode "Avec partis", on rafraîchit la liste de production
      if (S.depScope === 'avecPartis') { this._renderDepList(); return; }
      this._renderArchiveList(S.archive);
      document.getElementById('archive-search').style.display = S.archive.length ? 'block' : 'none';
    } catch(e) {
      document.getElementById('archive-list').innerHTML = `
        <div class="card" style="border-left:4px solid #F87171;">
          <p style="color:#991B1B;font-weight:600;">Impossible de charger les archives</p>
          <p style="font-size:12px;color:#64748B;margin-top:3px;">${e.message}</p>
        </div>`;
    } finally {
      document.getElementById('archive-loading').style.display = 'none';
    }
  },
  _filterArchive() {
    const q = (document.getElementById('archive-query')?.value || '').trim().toLowerCase();
    if (!q) { this._renderArchiveList(S.archive); return; }
    const filtered = S.archive.filter(d =>
      (d.code    || '').toLowerCase().includes(q) ||
      (d.chantier|| '').toLowerCase().includes(q) ||
      (d.codeModule||'').toLowerCase().includes(q)
    );
    this._renderArchiveList(filtered);
  },
  _renderArchiveList(items) {
    const list = document.getElementById('archive-list');
    const none = document.getElementById('no-archive');
    if (!items.length) { list.innerHTML = ''; none.style.display = 'block'; return; }
    none.style.display = 'none';
    list.innerHTML = items.map((d, i) => {
      const realIdx = S.archive.indexOf(d);
      const code  = d.code || '------';
      const titre = d.module || code;
      const dur   = _duration(d.debut, d.fin);
      return `
        <div class="dep-card" style="opacity:0.85;" onclick="App.openArchiveDep(${realIdx})">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:38px;">
            <div style="width:34px;height:34px;background:#F1F5F9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;">📦</div>
            <div style="font-family:'Courier New',monospace;font-size:9px;color:#94A3B8;text-align:center;line-height:1.1;max-width:38px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${code}</div>
          </div>
          <div class="dep-card-left">
            <div class="code-mono" style="font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.codeModule || '\u00A0'}</div>
            <div style="font-size:10px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${titre !== code ? titre : '\u00A0'}</div>
          </div>
          <div class="dep-card-right">
            <div style="font-size:13px;font-weight:600;color:#1E293B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">${d.chantier || '\u00A0'}</div>
            ${dur ? `<span style="font-size:10px;color:#94A3B8;">⏱ ${dur}</span>` : ''}
          </div>
          <span style="color:#CBD5E1;font-size:16px;flex-shrink:0;">›</span>
        </div>`;
    }).join('');
  },
  /* ─ Arrivals (serveur) ─ */
  async loadArrivalsData(force = false) {
    if (!force && S.arrivalsLoaded) return;
    if (force) {
      S.arrivalsLoaded = false; S.arrFullLoaded = false;
      S.arrTypeFilter = 'all'; S.arrPartiFilter = 'present';
      const s = document.getElementById('arr-search'); if (s) s.value = '';
    }
    document.getElementById('arr-loading').style.display = 'block';
    document.getElementById('no-arrivals').style.display = 'none';
    document.getElementById('arr-list').innerHTML = '';
    if (!S.apiUrl) {
      document.getElementById('arr-loading').style.display = 'none';
      document.getElementById('no-arrivals').style.display = 'block';
      return;
    }
    // Chargement en parallèle : données + log photos arrivée
    this._loadArrPhotosLog();
    try {
      // Premier chargement : scope=active → seulement les articles sur parc
      const resp = await _fetchWithTimeout(S.apiUrl + '?action=arrivals&scope=active', {}, 50000);
      const data = await resp.json();
      S.arrivalsData    = Array.isArray(data) ? data : (data.data || []);
      S.arrivalsSummary = data.summary || {};
      S.arrivalsLoaded  = true;
      S.arrFullLoaded   = false;  // les partis ne sont pas encore chargés
      this._renderArrivalsSummary();
      this._buildArrTypeFilters();
      this._filterAndRenderArrivals();
    } catch(e) {
      document.getElementById('arr-list').innerHTML = `
        <div class="card" style="border-left:4px solid #F87171;">
          <p style="color:#991B1B;font-weight:600;">Impossible de charger les arrivées</p>
          <p style="font-size:12px;color:#64748B;margin-top:3px;">${e.message}</p>
        </div>`;
    } finally {
      document.getElementById('arr-loading').style.display = 'none';
    }
  },
  // Chargement complet des arrivées (déclenché à la demande quand l'utilisateur
  // bascule sur "Partis" ou "Tous" alors que seules les données actives sont en mémoire).
  async _loadFullArrivals() {
    const list = document.getElementById('arr-list');
    if (list) list.innerHTML = `
      <div style="text-align:center;padding:30px;">
        <div class="spinner"></div>
        <p style="color:#64748B;font-size:13px;margin-top:10px;">Chargement de l'historique…</p>
      </div>`;
    // Atténuer les boutons Partis/Tous pendant le chargement
    const btns = document.querySelectorAll('#arr-parti-filters .arr-seg-btn');
    btns.forEach(b => { if (b.dataset.parti !== 'present') b.style.opacity = '0.5'; });
    try {
      const resp = await _fetchWithTimeout(S.apiUrl + '?action=arrivals', {}, 50000);
      const data = await resp.json();
      S.arrivalsData    = Array.isArray(data) ? data : (data.data || []);
      S.arrivalsSummary = data.summary || {};
      S.arrFullLoaded   = true;
      this._renderArrivalsSummary();
      this._buildArrTypeFilters();
      this._filterAndRenderArrivals();
    } catch(e) {
      if (list) list.innerHTML = `
        <div class="card" style="border-left:4px solid #F87171;">
          <p style="color:#991B1B;font-weight:600;">Impossible de charger les données complètes</p>
          <p style="font-size:12px;color:#64748B;margin-top:3px;">${e.message}</p>
          <button onclick="App._loadFullArrivals()" style="margin-top:10px;background:#FEE2E2;color:#991B1B;border:none;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">↻ Réessayer</button>
        </div>`;
    } finally {
      btns.forEach(b => { b.style.opacity = ''; });
    }
  },
  _renderArrivalsSummary() {
    const wrap     = document.getElementById('arr-summary');
    const inner    = document.getElementById('arr-summary-inner');
    const totalEl  = document.getElementById('arr-summary-total');
    if (!wrap || !inner || !totalEl) return;
    const s = S.arrivalsSummary;
    const entries = Object.entries(s).filter(([,n]) => n > 0);
    if (!entries.length) { wrap.style.display = 'none'; return; }
    const total = entries.reduce((acc, [,n]) => acc + n, 0);
    totalEl.textContent = `🅿️ ${total} modules sur parc`;
    // types séparés par un point médian
    inner.innerHTML = entries.map(([type, n], i) =>
      `<span style="font-size:12px;color:#64748B;">${i > 0 ? '<span style="color:#CBD5E1;margin:0 6px;">·</span>' : ''}${type} <strong style="color:#1D4ED8;">${n}</strong></span>`
    ).join('');
    wrap.style.display = 'block';
  },
  _buildArrTypeFilters() {
    const bar = document.getElementById('arr-type-filters');
    if (!bar) return;
    bar.innerHTML = '';
    const types = [...new Set(S.arrivalsData.map(a => (a.type || '').trim()).filter(Boolean))].sort();
    if (!types.length) return;
    const allBtn = document.createElement('button');
    allBtn.className = 'dep-module-btn active'; allBtn.dataset.type = 'all'; allBtn.textContent = 'Tous types';
    allBtn.addEventListener('click', () => App.setArrTypeFilter('all'));
    bar.appendChild(allBtn);
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'dep-module-btn'; btn.dataset.type = t; btn.textContent = t;
      btn.addEventListener('click', () => App.setArrTypeFilter(t));
      bar.appendChild(btn);
    });
  },
  setArrTypeFilter(f) {
    S.arrTypeFilter = f;
    document.querySelectorAll('#arr-type-filters .dep-module-btn').forEach(b => b.classList.toggle('active', b.dataset.type === f));
    this._filterAndRenderArrivals();
  },
  setArrPartiFilter(f) {
    S.arrPartiFilter = f;
    document.querySelectorAll('#arr-parti-filters .arr-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.parti === f));
    // Si l'utilisateur veut voir les partis ou tout, et que les données
    // complètes ne sont pas encore chargées → chargement lazy
    if ((f === 'all' || f === 'parti') && !S.arrFullLoaded) {
      this._loadFullArrivals();
      return;
    }
    this._filterAndRenderArrivals();
  },
  _filterAndRenderArrivals() {
    const q = (document.getElementById('arr-search')?.value || '').trim().toLowerCase();
    const items = S.arrivalsData.filter(a => {
      const typeOk  = S.arrTypeFilter  === 'all' || (a.type || '').trim() === S.arrTypeFilter;
      const partiOk = S.arrPartiFilter === 'all'
        || (S.arrPartiFilter === 'present' && !a.isParti)
        || (S.arrPartiFilter === 'parti'   &&  a.isParti);
      if (!typeOk || !partiOk) return false;
      if (!q) return true;
      return (a.numModule  || '').toLowerCase().includes(q)
          || (a.code       || '').toLowerCase().includes(q)
          || (a.type       || '').toLowerCase().includes(q)
          || (a.chauffeur  || '').toLowerCase().includes(q)
          || (a.agence     || '').toLowerCase().includes(q)
          || (a.lv         || '').toLowerCase().includes(q)
          || (a.numSerie   || '').toLowerCase().includes(q)
          || (a.destination|| '').toLowerCase().includes(q);
    });
    // Compteur discret
    const countEl = document.getElementById('arr-result-count');
    if (countEl) {
      const total = S.arrivalsData.length;
      if (items.length < total) {
        countEl.textContent = `${items.length} résultat${items.length > 1 ? 's' : ''} sur ${total}`;
        countEl.style.display = 'block';
      } else {
        countEl.style.display = 'none';
      }
    }
    this._renderArrivalCards(items);
  },
  _renderArrivalCards(items) {
    const list = document.getElementById('arr-list');
    const none = document.getElementById('no-arrivals');
    if (!items.length) { list.innerHTML = ''; none.style.display = 'block'; return; }
    none.style.display = 'none';
    list.innerHTML = items.map((a) => {
      const realIdx = S.arrivalsData.indexOf(a);
      const primary = a.numModule || a.code;
      const meta    = [a.chauffeur, _fmtDate(a.dateArrivee)].filter(Boolean).join(' · ');
      return `
        <div class="dep-card" onclick="App.openArrival(${realIdx})">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:38px;">
            <div style="width:34px;height:34px;background:#EBF5FB;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;">📥</div>
            <div style="font-family:'Courier New',monospace;font-size:9px;color:#94A3B8;text-align:center;line-height:1.1;max-width:38px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.code || ''}</div>
          </div>
          <div class="dep-card-left">
            <div class="code-mono" style="font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${primary || '\u00A0'}</div>
            <div style="font-size:10px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.type || '\u00A0'}</div>
          </div>
          <div class="dep-card-right">
            <div style="font-size:13px;font-weight:600;color:#1E293B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">${a.destination || '\u00A0'}</div>
            ${a.description ? `<div style="font-size:11px;color:#64748B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">${a.description.length > 55 ? a.description.substring(0,53)+'…' : a.description}</div>` : ''}
            <div style="display:flex;align-items:center;gap:4px;overflow:hidden;">
              ${a.isParti
                ? `<span style="background:#DCFCE7;color:#15803D;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;flex-shrink:0;">Parti</span>`
                : `<span style="background:#EFF6FF;color:#1D4ED8;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;flex-shrink:0;">Sur parc</span>`}
              ${meta ? `<span style="font-size:10px;color:#94A3B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${meta}</span>` : ''}
              ${S.arrPhotosLog[a.code] ? `<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;border-radius:6px;padding:1px 5px;white-space:nowrap;flex-shrink:0;">📷 ${S.arrPhotosLog[a.code].count}</span>` : ''}
            </div>
          </div>
          <span style="color:#CBD5E1;font-size:16px;flex-shrink:0;">›</span>
        </div>`;
    }).join('');
  },
  openArrival(idx) {
    S.selArrival = S.arrivalsData[idx];
    S.arrPhotos  = [];
    this.go('arr-detail');
    this._renderArrivalDetail();
  },
  _renderArrivalDetail() {
    const a = S.selArrival;
    if (!a) return;
    const primary = a.numModule || a.code;
    const rows = [
      a.numModule   && ['Code interne',  a.code],
      a.destination && ['Chantier',      a.destination],
      a.type        && ['Type',          a.type],
      a.numSerie    && ['N° Série',      a.numSerie],
      a.plaques     && ['Plaques',       a.plaques],
      a.lv          && ['LV',            a.lv],
      a.agence      && ['Agence',        a.agence],
      a.chauffeur   && ['Chauffeur',     a.chauffeur],
      a.bt          && ['BT',            a.bt],
      a.pastille    && ['Pastille',      a.pastille],
      a.commentaire && ['Commentaire',   a.commentaire],
      a.colN        && ['Longueur',      a.colN],
      // colO = isParti (vrai/faux) → affiché via le badge, pas en ligne de détail
    ].filter(Boolean);
    document.getElementById('arr-detail-body').innerHTML = `
      <div class="card" style="margin-bottom:12px;">
        <div style="margin-bottom:8px;">
          ${a.isParti
            ? `<span style="background:#DCFCE7;color:#15803D;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">✅ Parti</span>`
            : `<span style="background:#EFF6FF;color:#1D4ED8;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">🅿️ Sur parc</span>`}
        </div>
        <div class="code-mono" style="font-size:28px;letter-spacing:3px;margin-bottom:4px;">${primary}</div>
        ${a.dateArrivee ? `<div style="font-size:12px;color:#64748B;margin-bottom:4px;">📅 Arrivée le ${_fmtDate(a.dateArrivee)}</div>` : ''}
        ${rows.length ? `
        <div style="margin-top:10px;border-top:1px solid #F1F5F9;padding-top:10px;display:grid;grid-template-columns:auto 1fr;gap:5px 14px;">
          ${rows.map(([k,v]) => `
            <span style="font-size:12px;color:#94A3B8;white-space:nowrap;padding-top:1px;">${k}</span>
            <span style="font-size:12px;color:#1E293B;font-weight:500;word-break:break-word;">${v}</span>`).join('')}
        </div>` : ''}
        <div id="arr-drive-section" style="margin-top:12px;">
          <p style="font-size:12px;color:#94A3B8;">🔄 Vérification du dossier Drive…</p>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <p style="font-size:14px;font-weight:600;color:#1E293B;margin:0;">Photos d'arrivée</p>
          ${S.arrPhotosLog[a.code] ? `<span style="font-size:11px;background:#EFF6FF;color:#1D4ED8;border-radius:6px;padding:2px 8px;font-weight:600;">📷 ${S.arrPhotosLog[a.code].count} photo${S.arrPhotosLog[a.code].count > 1 ? 's' : ''} · ${_fmtDate(S.arrPhotosLog[a.code].date)}</span>` : ''}
        </div>
        <div class="photo-grid" id="arr-photo-grid" style="margin-bottom:10px;"></div>
        <input type="file" id="arr-photo-input" accept="image/*" multiple style="display:none;" onchange="App.handlePhotos(event,'arr')">
        <p id="arr-photo-count" style="font-size:12px;color:#64748B;margin-bottom:10px;">0 photo ajoutée</p>
        <button onclick="App.triggerInput('arr-photo-input')" style="background:#EBF5FB;color:var(--brand);border:none;padding:12px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;width:100%;">📷 Ajouter des photos</button>
      </div>
      <div style="margin-top:14px;">
        <button class="btn btn-primary" id="btn-arr-submit" onclick="App.submitArrivalPhoto()">📥 Enregistrer les photos d'arrivée</button>
      </div>
      ${S.currentUser?.role === 'admin' ? `
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #FEE2E2;">
        <button onclick="App.deleteArrival('${a.code}')" style="width:100%;background:#FEF2F2;color:#DC2626;border:1px solid #FCA5A5;border-radius:10px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">🗑 Supprimer cette arrivée</button>
      </div>` : ''}`;
    this._renderArrPhotoGrid();
    this._loadDriveLinkForDetail(a.code, 'arrivals', 'arr-drive-section', 'arr-drive-files-panel', 'arr-btn-drive-files');
  },
  _fillTestArrival() {
    const types     = ['BATIX','GRAND BATIX','ISOLOX','MODULOX','6020','6020 GB','6021','SOLFAB PH','SOLFAB GH40','ECOLOX','LC20','LC20M'];
    const agences   = ['ST QUENTIN','PARIS NORD','LYON SUD','BORDEAUX','NANTES','LILLE','STRASBOURG','RENNES','TOURS','ROUEN'];
    const noms      = ['MARTIN Pierre','DUPONT Jean','ROBERT Michel','BERNARD Luc','PETIT Marc','THOMAS Eric'];
    const longueurs = [3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5, 15];
    const rand      = arr => arr[Math.floor(Math.random() * arr.length)];
    const randInt   = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const y = new Date().getFullYear();
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setVal('inp-module-type', rand(types));
    setVal('inp-num-module',  String(randInt(60000000, 69999999)));
    setVal('inp-num-serie',   `SN-${y}-${String(randInt(100000, 999999))}`);
    setVal('inp-lv',          String(randInt(100000, 999999)));
    setVal('inp-agence',      rand(agences));
    setVal('inp-longueur',    String(rand(longueurs)));
    setVal('inp-chauffeur',   rand(noms));
    setVal('inp-date',        todayStr());
    setVal('inp-etat',        'TEST - Entrée de test PWA');
  },
  async deleteArrival(code) {
    const confirmed = window.confirm(
      `Supprimer l'arrivée ${code} ?\n\n• Supprime la ligne du sheet Arrivées\n• Met le dossier Drive à la corbeille\n• Retire le code du masterfile\n\nAction irréversible.`
    );
    if (!confirmed) return;
    try {
      this.toast('Suppression en cours...');
      const res = await _post(S.apiUrl, { action: 'delete_arrival', code });
      if (res.status !== 'ok' && res.status !== 'success') throw new Error(res.error || 'Erreur serveur');
      S.arrivalsData = S.arrivalsData.filter(a => a.code !== code);
      S.arrivalsLoaded = false; // force reload at next visit
      this.toast(`✓ Arrivée ${code} supprimée`);
      this.go('arrivals');
      this._filterAndRenderArrivals();
    } catch(e) {
      this.toast('Erreur : ' + e.message);
    }
  },
  _renderDepPhotoGrid() {
    const grid = document.getElementById('dep-photo-grid');
    const cnt  = document.getElementById('dep-photo-count');
    if (!grid) return;
    const n = S.depPhotos.length;
    if (cnt) cnt.textContent = `${n} photo${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}`;
    grid.innerHTML = S.depPhotos.map((p, i) => `
      <div class="photo-thumb">
        <img src="${p.dataUrl}">
        <button class="rm-btn" onclick="App.removePhoto(${i},'dep')">✕</button>
      </div>`).join('');
  },
  async submitDep() {
    const d = S.selDep;
    if (!d) return;
    if (!S.depPhotos.length) { this.toast('Ajoutez au moins une photo'); return; }
    const btn = document.getElementById('btn-dep-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi...'; }
    const code = d.code;
    try {
      let res = null;
      if (S.apiUrl) {
        res = await _post(S.apiUrl, { action: 'departure_photo', code, photos: S.depPhotos.map(p => p.dataUrl), saisie_par: S.currentUser ? `${S.currentUser.prenom} ${S.currentUser.nom}`.trim() : '' });
      }
      this._saveHistory({ code, type: 'departure', photos: S.depPhotos.length, module: 'planning', date: todayStr() });
      // Mise à jour locale immédiate depuis la réponse serveur (logEntry) ou par calcul
      const entry = res && res.logEntry ? res.logEntry : { count: (S.depPhotosLog[code]?.count || 0) + S.depPhotos.length, date: todayStr() };
      S.depPhotosLog[code] = entry;
      S.depPhotos = []; // vider la grille
      this.toast('✓ Photos enregistrées !');
      this._renderDepDetail(); // rester sur la carte, rafraîchir le compteur
    } catch(e) {
      this.toast('Erreur : ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '📤 Enregistrer les photos de départ'; }
    }
  },
  /* ─ Arrival extra photos ─ */
  _renderArrPhotoGrid() {
    const grid = document.getElementById('arr-photo-grid');
    const cnt  = document.getElementById('arr-photo-count');
    if (!grid) return;
    const n = S.arrPhotos.length;
    if (cnt) cnt.textContent = `${n} photo${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}`;
    grid.innerHTML = S.arrPhotos.map((p, i) => `
      <div class="photo-thumb">
        <img src="${p.dataUrl}">
        <button class="rm-btn" onclick="App.removePhoto(${i},'arr')">✕</button>
      </div>`).join('') + `
      <div class="photo-add-btn" onclick="App.triggerInput('arr-photo-input')">
        <span style="font-size:26px;">📷</span><span>Ajouter</span>
      </div>`;
  },
  async submitArrivalPhoto() {
    const a = S.selArrival;
    if (!a) return;
    if (!S.arrPhotos.length) { this.toast('Ajoutez au moins une photo'); return; }
    const btn = document.getElementById('btn-arr-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi...'; }
    const code = a.code;
    try {
      let res = null;
      if (S.apiUrl) {
        res = await _post(S.apiUrl, { action: 'arrival_photo', code, photos: S.arrPhotos.map(p => p.dataUrl), saisie_par: S.currentUser ? `${S.currentUser.prenom} ${S.currentUser.nom}`.trim() : '' });
      }
      this._saveHistory({ code, type: 'arrival_extra', photos: S.arrPhotos.length, module: a.source || 'loxam', date: todayStr() });
      // Mise à jour locale immédiate
      const entry = res && res.logEntry
        ? res.logEntry
        : { count: (S.arrPhotosLog[code]?.count || 0) + S.arrPhotos.length, date: todayStr() };
      S.arrPhotosLog[code] = entry;
      S.arrPhotos = [];
      this.toast('✓ Photos d\'arrivée enregistrées !');
      this._renderArrivalDetail(); // rester sur la carte, rafraîchir le compteur
    } catch(e) {
      this.toast('Erreur : ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '📥 Enregistrer les photos d\'arrivée'; }
    }
  },
  async _loadArrPhotosLog() {
    if (!S.apiUrl) return;
    try {
      const resp = await _fetchWithTimeout(S.apiUrl + '?action=arr_photos_log', {}, 10000);
      const data = await resp.json();
      if (data.status === 'ok' && data.log) {
        S.arrPhotosLog = data.log;
        if (S.arrivalsLoaded) this._filterAndRenderArrivals();
      }
    } catch(e) { /* silencieux */ }
  },
  /* ─ History ─ */
  _renderHistory() {
    const list = document.getElementById('hist-list');
    const none = document.getElementById('no-history');
    const items = [...S.history].reverse();
    if (!items.length) { list.innerHTML = ''; none.style.display = 'block'; return; }
    none.style.display = 'none';
    list.innerHTML = items.map(r => {
      const isDepart = r.type === 'departure';
      const m = MODULES[r.module] || { icon: isDepart ? '📤' : '📦', iconBg: '#F1F5F9', label: r.module || '' };
      return `
        <div class="history-row">
          <div class="mod-icon" style="background:${isDepart ? '#F0FDF4' : m.iconBg};">${isDepart ? '📤' : m.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="code-mono" style="font-size:15px;">${r.code}</span>
              ${r.offline ? '<span class="chip chip-yellow" style="font-size:10px;">local</span>' : ''}
              ${r.error   ? '<span class="chip" style="background:#FEF2F2;color:#991B1B;font-size:10px;">erreur</span>' : ''}
            </div>
            <div style="font-size:12px;color:#64748B;">${isDepart ? 'Départ' : m.label} · ${r.date || ''} · ${r.photos || 0} photo(s)</div>
          </div>
          <span style="font-size:10px;color:#94A3B8;flex-shrink:0;">${r.sentAt || ''}</span>
        </div>`;
    }).join('');
  },
  _saveHistory(entry) {
    S.history.push({ ...entry, sentAt: _timeStr() });
    if (S.history.length > 120) S.history = S.history.slice(-120);
    localStorage.setItem(SK.HISTORY, JSON.stringify(S.history));
  },
  clearHistory() {
    if (!confirm('Effacer tout l\'historique local ?')) return;
    S.history = [];
    localStorage.removeItem(SK.HISTORY);
    this._renderHistory();
    this._renderArrivalList();
    this.toast('Historique effacé');
  },
  /* ─ Codes ─ */
  async _fetchCodes() {
    if (!S.apiUrl) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=codes', {}, 40000);
      const d = await r.json();
      if (Array.isArray(d.codes)) {
        S.codes   = new Set(d.codes.map(c => c.toUpperCase()));
        S.codesTs = Date.now();
        localStorage.setItem(SK.CODES,    JSON.stringify(d.codes));
        localStorage.setItem(SK.CODES_TS, S.codesTs.toString());
      }
    } catch(e) { console.warn('Codes fetch failed:', e.message); }
  },
  async reloadCodes() {
    S.codesTs = 0;
    await this._fetchCodes();
    document.getElementById('info-codes').textContent = `Codes en cache : ${S.codes.size}`;
    this.toast(`${S.codes.size} codes chargés`);
  },
});
