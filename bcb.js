// BCB (consignes, chargement, enlèvements, import acheteurs, liste PDF).
// Méthodes ajoutées à App (défini dans app.js, chargé avant) : contenu déplacé tel quel
// depuis l'ancien index.html unique (découpage du 2026-10-26).
Object.assign(App, {
  bcbInitLangGrid() {
    const grid = document.getElementById('bcb-lang-grid');
    if (!grid || grid.dataset.built) return;
    grid.dataset.built = '1';
    this.BCB_LANGS.forEach(l => {
      const btn = document.createElement('button');
      btn.style.cssText = 'background:white;border:1.5px solid #E2E8F0;border-radius:12px;padding:14px 10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:inherit;transition:border-color .15s,transform .12s;';
      btn.innerHTML = `<span style="font-size:28px;">${l.flag}</span><span style="font-size:11px;font-weight:700;color:#94A3B8;letter-spacing:.5px;">${l.code.toUpperCase()}</span><span style="font-size:12px;font-weight:600;color:#1E293B;">${l.name}</span>`;
      btn.addEventListener('click', () => this.bcbSelectLang(l.code));
      btn.addEventListener('mouseenter', () => { btn.style.borderColor='#1D4ED8'; btn.style.transform='translateY(-2px)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor='#E2E8F0'; btn.style.transform=''; });
      grid.appendChild(btn);
    });
  },
  bcbSelectLang(code) {
    const l = this.BCB_LANGS.find(x => x.code === code);
    if (!l) return;
    S.bcbLang = l;
    this._bcbEnsureAgencies();
    // Populate rules
    document.getElementById('bcb-lang-title').textContent = `${l.flag} ${l.name}`;
    document.getElementById('bcb-rules-title').textContent = l.rulesTitle;
    const ol = document.getElementById('bcb-rules-list');
    ol.innerHTML = l.rules.map(r => `<li>${r}</li>`).join('');
    // Labels form
    document.getElementById('bcb-form-title').textContent = l.formTitle;
    document.getElementById('bcb-lbl-nom').textContent = l.fields.nom;
    document.getElementById('bcb-lbl-prenom').textContent = l.fields.prenom;
    document.getElementById('bcb-lbl-tracteur').textContent = l.fields.tracteur;
    document.getElementById('bcb-lbl-remorque').textContent = l.fields.remorque;
    document.getElementById('bcb-lbl-client').textContent = l.fields.client;
    document.getElementById('bcb-lbl-client-adresse').textContent = l.fields.clientAdresse;
    document.getElementById('bcb-lbl-client-ville').textContent = l.fields.clientVille || 'CP / Ville';
    document.getElementById('bcb-lbl-client-pays').textContent = l.fields.clientPays;
    document.getElementById('bcb-lbl-transport-section').textContent = l.fields.transport.sectionTitle;
    document.getElementById('bcb-lbl-transport-nom').textContent = l.fields.transport.nom;
    document.getElementById('bcb-lbl-transport-adresse').textContent = l.fields.transport.adresse;
    document.getElementById('bcb-lbl-transport-ville').textContent = l.fields.transport.ville;
    document.getElementById('bcb-lbl-transport-pays').textContent = l.fields.transport.pays;
    document.getElementById('bcb-btn-valider').textContent = l.valider;
    // Direction RTL/LTR
    const wrapper = document.getElementById('bcb-form-wrapper');
    wrapper.style.direction = l.dir;
    ol.style.direction = l.dir;
    // Clear form
    ['bcb-f-nom','bcb-f-prenom','bcb-f-tracteur','bcb-f-remorque','bcb-f-client','bcb-f-client-adresse','bcb-f-client-ville','bcb-f-client-pays','bcb-f-transport-nom','bcb-f-transport-adresse','bcb-f-transport-ville','bcb-f-transport-pays'].forEach(id => { document.getElementById(id).value = ''; });
    ['transport','client'].forEach(t => { const el = document.getElementById('bcb-suggest-'+t); if (el) el.style.display = 'none'; });
    const ecl = document.getElementById('bcb-extra-clients');
    if (ecl) ecl.innerHTML = '';
    // Show step 2
    document.getElementById('bcb-step-lang').style.display = 'none';
    document.getElementById('bcb-step-consignes').style.display = '';
    document.getElementById('bcb-step-confirm').style.display = 'none';
    // Scroll to top of view
    document.getElementById('view-bcb-consignes').scrollTop = 0;
  },
  bcbBackToLang() {
    document.getElementById('bcb-step-lang').style.display = '';
    document.getElementById('bcb-step-consignes').style.display = 'none';
    document.getElementById('bcb-step-confirm').style.display = 'none';
    const ec = document.getElementById('bcb-extra-clients');
    if (ec) ec.innerHTML = '';
    document.getElementById('view-bcb-consignes').scrollTop = 0;
  },
  bcbSubmitConsigne() {
    const l = S.bcbLang;
    if (!l) return;
    const nom              = document.getElementById('bcb-f-nom').value.trim();
    const prenom           = document.getElementById('bcb-f-prenom').value.trim();
    const tracteur         = document.getElementById('bcb-f-tracteur').value.trim().toUpperCase();
    const remorque         = document.getElementById('bcb-f-remorque').value.trim().toUpperCase();
    const client1          = document.getElementById('bcb-f-client').value.trim();
    const client1Adresse   = document.getElementById('bcb-f-client-adresse').value.trim();
    const client1Ville     = document.getElementById('bcb-f-client-ville').value.trim();
    const client1Pays      = document.getElementById('bcb-f-client-pays').value.trim();
    const transportNom     = document.getElementById('bcb-f-transport-nom').value.trim();
    const transportAdresse = document.getElementById('bcb-f-transport-adresse').value.trim();
    const transportVille   = document.getElementById('bcb-f-transport-ville').value.trim();
    const transportPays    = document.getElementById('bcb-f-transport-pays').value.trim();
    if (!nom || !tracteur || !client1) {
      this.toast('⚠️ Veuillez remplir au moins le nom, le tracteur et le client.');
      return;
    }
    // Collect extra client groups
    const clients = [{ client: client1, clientAdresse: client1Adresse, clientVille: client1Ville, clientPays: client1Pays }];
    const extraContainer = document.getElementById('bcb-extra-clients');
    if (extraContainer) {
      [...extraContainer.children].forEach(el => {
        const idx = el.getAttribute('data-client-group');
        if (!idx) return;
        const c = (document.getElementById('bcb-extra-client-' + idx) || {}).value?.trim() || '';
        if (!c) return;
        clients.push({
          client: c,
          clientAdresse: (document.getElementById('bcb-extra-adresse-' + idx) || {}).value?.trim() || '',
          clientVille:   (document.getElementById('bcb-extra-ville-' + idx)   || {}).value?.trim() || '',
          clientPays:    (document.getElementById('bcb-extra-pays-' + idx)    || {}).value?.trim() || '',
        });
      });
    }
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const base = { ts: now.toISOString(), lang: l.code, nom, prenom, tracteur, remorque, transportNom, transportAdresse, transportVille, transportPays };
    const log = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    // One entry per client, same driver/transport info
    log.unshift(...clients.map(c => ({ ...base, ...c })));
    if (log.length > 200) log.length = 200;
    localStorage.setItem('snt_bcb_consignes', JSON.stringify(log));
    // Confirmation
    const f = l.fields;
    document.getElementById('bcb-confirm-title').textContent = l.confirmTitle;
    const btnNouv = document.getElementById('bcb-btn-nouveau');
    btnNouv.textContent = l.nouveau || l.nowy || l.nov || l.ri || l.jadid || l.nieuw || l.neu || l.yeni || l.novo || 'Nouveau';
    const clientsHtml = clients.map((c, i) =>
      `${f.client}${clients.length > 1 ? ' ' + (i + 1) : ''} : <b>${c.client}</b>` +
      (c.clientAdresse ? `<br>${f.clientAdresse} : <b>${c.clientAdresse}</b>` : '') +
      (c.clientVille   ? `<br>${f.clientVille||'CP / Ville'} : <b>${c.clientVille}</b>` : '') +
      (c.clientPays    ? `<br>${f.clientPays} : <b>${c.clientPays}</b>` : '')
    ).join('<hr style="border:none;border-top:1px solid #D1FAE5;margin:6px 0;">');
    document.getElementById('bcb-confirm-summary').innerHTML =
      `<b>🗓 ${dateStr}</b><br>` +
      `${f.nom} : <b>${nom}${prenom ? ' ' + prenom : ''}</b><br>` +
      `${f.tracteur} : <b>${tracteur}</b><br>` +
      (remorque ? `${f.remorque} : <b>${remorque}</b><br>` : '') +
      (transportNom ? `${f.transport.nom} : <b>${transportNom}${transportVille ? ', ' + transportVille : ''}</b><br>` : '') +
      clientsHtml;
    document.getElementById('bcb-step-consignes').style.display = 'none';
    document.getElementById('bcb-step-confirm').style.display = '';
    document.getElementById('view-bcb-consignes').scrollTop = 0;
  },
  bcbNewConsigne() {
    document.getElementById('bcb-step-lang').style.display = '';
    document.getElementById('bcb-step-consignes').style.display = 'none';
    document.getElementById('bcb-step-confirm').style.display = 'none';
    const ec = document.getElementById('bcb-extra-clients');
    if (ec) ec.innerHTML = '';
    document.getElementById('view-bcb-consignes').scrollTop = 0;
  },
  async _bcbEnsureAgencies() {
    if (S.annuaireData.length || S.lvu.agencies.length || !S.apiUrl) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=lv_agencies', {}, 10000);
      const d = await r.json();
      if (d.status === 'ok') {
        S.annuaireData   = d.agencies || [];
        S.lvu.agencies   = S.annuaireData;
        S.annuaireLoaded = true;
      }
    } catch(_) {}
  },
  bcbSuggestAgency(fieldType, val) {
    const listEl = document.getElementById('bcb-suggest-' + fieldType);
    if (!listEl) return;
    const q = (val || '').toLowerCase().trim();
    if (q.length < 2) { listEl.style.display = 'none'; return; }
    const all = S.annuaireData.length ? S.annuaireData : S.lvu.agencies;
    if (!all.length) { this._bcbEnsureAgencies(); return; }
    const starts = all.filter(a => (a.nom||'').toLowerCase().startsWith(q) || (a.code||'').toLowerCase().startsWith(q));
    const others = all.filter(a => !starts.includes(a) && (a.nom||'').toLowerCase().includes(q));
    const matches = [...starts, ...others].slice(0, 6);
    if (!matches.length) { listEl.style.display = 'none'; return; }
    S._bcbSuggests = matches;
    listEl.innerHTML = matches.map((a, i) =>
      `<div onmousedown="App.bcbApplyAgency('${fieldType}',${i})"
        style="padding:8px 10px;border-bottom:1px solid #F1F5F9;cursor:pointer;font-size:13px;line-height:1.3;"
        onmouseenter="this.style.background='#EFF6FF'" onmouseleave="this.style.background=''">
        <span style="font-weight:600;">${a.nom}</span>
        ${a.ville ? `<span style="color:#64748B;font-size:11px;"> · ${a.cp ? a.cp+' ' : ''}${a.ville}</span>` : ''}
      </div>`
    ).join('');
    listEl.style.display = '';
  },
  bcbApplyAgency(fieldType, idx) {
    const a = (S._bcbSuggests || [])[idx];
    if (!a) return;
    document.getElementById('bcb-suggest-' + fieldType).style.display = 'none';
    if (fieldType === 'transport') {
      document.getElementById('bcb-f-transport-nom').value     = a.nom     || '';
      document.getElementById('bcb-f-transport-adresse').value = a.adresse || '';
      document.getElementById('bcb-f-transport-ville').value   = [a.cp, a.ville].filter(Boolean).join(' ');
      document.getElementById('bcb-f-transport-pays').value    = a.pays    || '';
    } else {
      document.getElementById('bcb-f-client').value         = a.nom || '';
      document.getElementById('bcb-f-client-adresse').value = [a.adresse, [a.cp, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      document.getElementById('bcb-f-client-pays').value    = a.pays || '';
    }
  },
  bcbHideSuggest(fieldType) {
    const el = document.getElementById('bcb-suggest-' + fieldType);
    if (el) el.style.display = 'none';
  },
  _suggestKeyDown(e, listId, selectFn, defaultFirst) {
    const list = document.getElementById(listId);
    if (!list) return;
    const rows = Array.from(list.children);
    const open = list.style.display !== 'none' && rows.length > 0;
    if (!open) { if (e.key === 'Escape') list.style.display = 'none'; return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') { list._ni = -1; return; }
    e.preventDefault();
    if (e.key === 'Escape') { list.style.display = 'none'; list._ni = -1; return; }
    let ni = list._ni !== undefined ? list._ni : -1;
    if (e.key === 'ArrowDown')    ni = Math.min(ni + 1, rows.length - 1);
    else if (e.key === 'ArrowUp') ni = Math.max(ni - 1, 0);
    else if (e.key === 'Enter') {
      const target = ni >= 0 ? ni : (defaultFirst ? 0 : -1);
      if (target >= 0) selectFn(target);
      list._ni = -1;
      return;
    }
    list._ni = ni;
    rows.forEach((r, i) => r.style.background = i === ni ? '#EFF6FF' : '');
    if (ni >= 0 && rows[ni]) rows[ni].scrollIntoView({ block: 'nearest' });
  },
  _bcbBuyerKeyDown(e) {
    this._suggestKeyDown(e, 'bcb-dep-buyer-results', i => {
      const r = document.querySelectorAll('#bcb-dep-buyer-results .dest-result-row')[i];
      if (r) r.click();
    });
  },
  _lvuDestKeyDown(e) {
    this._suggestKeyDown(e, 'lvu-dest-results', i => {
      const r = document.querySelectorAll('#lvu-dest-results .dest-result-row')[i];
      if (r) r.click();
    });
  },
  bcbAddClientGroup() {
    this._bcbEnsureAgencies();
    const container = document.getElementById('bcb-extra-clients');
    if (!container) return;
    const idx = Date.now(); // unique key for this group
    const num = container.children.length + 2;
    const div = document.createElement('div');
    div.setAttribute('data-client-group', idx);
    div.style.cssText = 'border:1px solid #CCFBF1;border-radius:8px;padding:10px;background:#F0FDFA;margin-top:8px;';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-size:10px;font-weight:700;color:#0F766E;text-transform:uppercase;letter-spacing:.5px;">Client ${num}</div>
        <button type="button" onmousedown="App.bcbRemoveClientGroup(${idx})"
          style="background:none;border:none;color:#EF4444;font-size:16px;cursor:pointer;line-height:1;padding:0 4px;">✕</button>
      </div>
      <div style="display:grid;gap:8px;">
        <div style="position:relative;">
          <label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:3px;">Client</label>
          <input id="bcb-extra-client-${idx}" type="text" autocomplete="nope"
            style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:9px 10px;font-size:13px;box-sizing:border-box;background:#fff;"
            oninput="App.bcbSuggestExtraClient(${idx},this.value)"
            onblur="App.bcbHideExtraSuggest(${idx})"
            onkeydown="App._suggestKeyDown(event,'bcb-extra-suggest-${idx}',(i)=>App.bcbApplyExtraAgency(${idx},i))">
          <div id="bcb-extra-suggest-${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #CBD5E1;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;max-height:180px;overflow-y:auto;"></div>
        </div>
        <div><label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:3px;">Adresse</label>
          <input id="bcb-extra-adresse-${idx}" type="text" autocomplete="nope"
            style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:9px 10px;font-size:13px;box-sizing:border-box;background:#fff;">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:3px;">CP / Ville</label>
            <input id="bcb-extra-ville-${idx}" type="text" autocomplete="nope"
              style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:9px 10px;font-size:13px;box-sizing:border-box;background:#fff;">
          </div>
          <div><label style="font-size:11px;font-weight:600;color:#64748B;display:block;margin-bottom:3px;">Pays</label>
            <input id="bcb-extra-pays-${idx}" type="text" autocomplete="nope"
              style="width:100%;border:1px solid #CBD5E1;border-radius:6px;padding:9px 10px;font-size:13px;box-sizing:border-box;background:#fff;">
          </div>
        </div>
      </div>`;
    container.appendChild(div);
    // Re-number labels
    [...container.children].forEach((el, i) => {
      const lbl = el.querySelector('[style*="0F766E"]');
      if (lbl) lbl.textContent = `Client ${i + 2}`;
    });
  },
  bcbRemoveClientGroup(idx) {
    const container = document.getElementById('bcb-extra-clients');
    if (!container) return;
    const el = container.querySelector(`[data-client-group="${idx}"]`);
    if (el) container.removeChild(el);
    [...container.children].forEach((el, i) => {
      const lbl = el.querySelector('[style*="0F766E"]');
      if (lbl) lbl.textContent = `Client ${i + 2}`;
    });
  },
  bcbSuggestExtraClient(idx, val) {
    const listEl = document.getElementById('bcb-extra-suggest-' + idx);
    if (!listEl) return;
    const q = (val || '').toLowerCase().trim();
    if (q.length < 2) { listEl.style.display = 'none'; return; }
    const all = S.annuaireData.length ? S.annuaireData : S.lvu.agencies;
    if (!all.length) { this._bcbEnsureAgencies(); return; }
    const starts = all.filter(a => (a.nom||'').toLowerCase().startsWith(q) || (a.code||'').toLowerCase().startsWith(q));
    const others = all.filter(a => !starts.includes(a) && (a.nom||'').toLowerCase().includes(q));
    const matches = [...starts, ...others].slice(0, 6);
    if (!matches.length) { listEl.style.display = 'none'; return; }
    if (!S._bcbExtraSuggests) S._bcbExtraSuggests = {};
    S._bcbExtraSuggests[idx] = matches;
    listEl.innerHTML = matches.map((a, i) =>
      `<div onmousedown="App.bcbApplyExtraAgency(${idx},${i})"
        style="padding:8px 10px;border-bottom:1px solid #F1F5F9;cursor:pointer;font-size:13px;line-height:1.3;"
        onmouseenter="this.style.background='#EFF6FF'" onmouseleave="this.style.background=''">
        <span style="font-weight:600;">${a.nom}</span>
        ${a.ville ? `<span style="color:#64748B;font-size:11px;"> · ${a.cp ? a.cp+' ' : ''}${a.ville}</span>` : ''}
      </div>`
    ).join('');
    listEl.style.display = '';
  },
  bcbApplyExtraAgency(idx, sugIdx) {
    const a = ((S._bcbExtraSuggests || {})[idx] || [])[sugIdx];
    if (!a) return;
    document.getElementById('bcb-extra-suggest-' + idx).style.display = 'none';
    document.getElementById('bcb-extra-client-' + idx).value  = a.nom || '';
    document.getElementById('bcb-extra-adresse-' + idx).value = a.adresse || '';
    document.getElementById('bcb-extra-ville-' + idx).value   = [a.cp, a.ville].filter(Boolean).join(' ');
    document.getElementById('bcb-extra-pays-' + idx).value    = a.pays || '';
  },
  bcbHideExtraSuggest(idx) {
    const el = document.getElementById('bcb-extra-suggest-' + idx);
    if (el) el.style.display = 'none';
  },

  async bcbMenuInit() {
    const loaderEl = document.getElementById('bcb-menu-loader');
    const gridEl   = document.getElementById('bcb-menu-grid');
    const statusEl = document.getElementById('bcb-menu-status');
    // Refresh localStorage-based counts immediately
    this._bcbMenuRefreshCounts();
    // Already loaded — show grid right away
    if (S.bcbLotsLoaded && S.bcbEnlevementsLoaded) {
      if (loaderEl) loaderEl.style.display = 'none';
      if (gridEl)   gridEl.style.display = 'block';
      if (statusEl) { const n = new Date(); statusEl.textContent = 'MAJ ' + n.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}); }
      return;
    }
    // Show loader
    if (loaderEl) loaderEl.style.display = 'flex';
    if (gridEl)   gridEl.style.display = 'none';
    if (statusEl) statusEl.textContent = 'Chargement des données…';
    if (!S.apiUrl) {
      if (loaderEl) loaderEl.innerHTML = '<div style="text-align:center;color:#EF4444;font-size:13px;padding:12px;">⚠️ URL API non configurée</div>';
      return;
    }
    await Promise.allSettled([
      (async () => {
        if (S.bcbLotsLoaded || S.bcbLotsLoading) return;
        S.bcbLotsLoading = true;
        try {
          const r = await _fetchWithTimeout(S.apiUrl + '?action=bcb_lots', {}, 15000);
          const d = await r.json();
          if (d.status !== 'ok') throw new Error(d.error || 'Erreur');
          S.bcbLots = d.lots || []; S.bcbByBuyer = d.byBuyer || {}; S.bcbLotsLoaded = true;
        } catch(e) { this.toast('Erreur lots : ' + e.message); }
        finally { S.bcbLotsLoading = false; }
      })(),
      (async () => {
        if (S.bcbEnlevementsLoaded || S.bcbEnlevementsLoading) return;
        S.bcbEnlevementsLoading = true;
        try {
          const r = await _fetchWithTimeout(S.apiUrl + '?action=bcb_enlevements_list', {}, 15000);
          const d = await r.json();
          if (d.status === 'ok') { S.bcbEnlevements = d.history || []; S.bcbEnlevementsLoaded = true; }
        } catch(e) { this.toast('Erreur enlèvements'); }
        finally { S.bcbEnlevementsLoading = false; }
      })(),
    ]);
    this._bcbMenuRefreshCounts();
    if (loaderEl) loaderEl.style.display = 'none';
    if (gridEl)   gridEl.style.display = 'block';
    if (statusEl) { const n = new Date(); statusEl.textContent = 'MAJ ' + n.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}); }
  },
  _bcbMenuRefreshCounts() {
    const consList = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    const procCons = new Set(JSON.parse(localStorage.getItem('snt_bcb_processed_consignes') || '[]'));
    const pending  = consList.filter((_, i) => !procCons.has(i)).length;
    const lotsBadge = document.getElementById('bcb-menu-badge-lots');
    if (lotsBadge) {
      if (!S.bcbLotsLoaded) {
        lotsBadge.className = 'activity-badge badge-loading';
        lotsBadge.textContent = '⟳ Chargement…';
      } else if (S.bcbLots.length > 0) {
        lotsBadge.className = 'activity-badge badge-active';
        lotsBadge.textContent = `● ${S.bcbLots.length} lot${S.bcbLots.length > 1 ? 's' : ''}`;
      } else {
        lotsBadge.className = 'activity-badge badge-soon';
        lotsBadge.textContent = 'Aucun lot';
      }
    }
    const departBadge = document.getElementById('bcb-menu-badge-depart');
    if (departBadge) {
      if (pending > 0) {
        departBadge.className = 'activity-badge badge-active';
        departBadge.textContent = `● ${pending} en attente`;
      } else if (consList.length > 0) {
        departBadge.className = 'activity-badge badge-active';
        departBadge.textContent = '✓ Tout traité';
      } else {
        departBadge.className = 'activity-badge badge-soon';
        departBadge.textContent = '— Aucune consigne';
      }
    }
  },

  bcbPrintMenu() {
    if (!S.bcbLotsLoaded || !S.bcbLots.length) { this.toast('Lots non chargés'); return; }
    const bd = document.createElement('div');
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:999;';
    const menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.22);padding:18px 16px 12px;z-index:1000;width:270px;';
    menu.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#1E293B;margin-bottom:14px;">🖨 Listes par acheteur</div>
      <button onclick="this.closest('div').remove();document.querySelector('[data-bcb-print-bd]').remove();App.bcbPrintByBuyer('page')"
        style="width:100%;padding:11px 12px;background:#EFF6FF;color:#1D4ED8;border:1.5px solid #BFDBFE;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px;text-align:left;display:block;">
        📄 1 acheteur par page
      </button>
      <button onclick="this.closest('div').remove();document.querySelector('[data-bcb-print-bd]').remove();App.bcbPrintByBuyer('inline')"
        style="width:100%;padding:11px 12px;background:#F8FAFC;color:#475569;border:1.5px solid #E2E8F0;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;text-align:left;display:block;">
        📋 Tout à la suite
      </button>
      <button onclick="this.closest('div').remove();document.querySelector('[data-bcb-print-bd]').remove()"
        style="width:100%;padding:7px;background:none;border:none;color:#94A3B8;font-size:12px;cursor:pointer;margin-top:4px;">Annuler</button>`;
    bd.setAttribute('data-bcb-print-bd', '');
    bd.onclick = () => { bd.remove(); menu.remove(); };
    document.body.appendChild(bd);
    document.body.appendChild(menu);
  },

  bcbPrintByBuyer(mode) {
    const sold       = S.bcbLots.filter(l => l.vendu && l.acheteur);
    const noAcheteur = S.bcbLots.filter(l => !l.acheteur);
    const byBuyer = {};
    sold.forEach(l => {
      const b = l.acheteur.trim();
      if (!byBuyer[b]) byBuyer[b] = [];
      byBuyer[b].push(l);
    });
    const numVentes = [...new Set(sold.map(l => l.numVente).filter(Boolean))];
    const venteLbl  = numVentes.length ? 'Vente ' + numVentes.map(v => 'n°' + v).join(', ') : '';
    const dateGen   = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });

    const fmtDate = (raw) => {
      if (!raw) return '';
      const d = new Date(raw);
      return isNaN(d) ? raw : d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
    };

    const makeRow = (l, i) => {
      const cells = [
        i + 1, l.idBcb||'', l.vendeur||l.inter||'', l.refVendeur||l.idSeller||'',
        l.type||'', l.marque||'', l.modele||'', l.numSerie||'',
        l.commentaire||'', fmtDate(l.dateVente), l.numVente||'',
        `<input type="checkbox"${l.codeEnlevement?' checked':''} style="width:13px;height:13px;">`,
      ];
      return `<tr>${cells.map((c,ci)=>`<td${ci===4?' class="desc"':''}>${c}</td>`).join('')}</tr>`;
    };

    // Une seule table — un <tbody> par acheteur → colonnes parfaitement alignées
    const bodies = Object.keys(byBuyer).sort().map(buyer => {
      const lots = byBuyer[buyer];
      return `<tbody><tr class="bhr"><td colspan="12"><strong>${buyer}</strong><span class="bc"> — ${lots.length} lot${lots.length>1?'s':''}</span></td></tr>${lots.map(makeRow).join('')}</tbody>`;
    }).join('');

    // Section lots sans acheteur
    const sansAcheteurBody = noAcheteur.length
      ? `<tbody><tr class="bhr-pending"><td colspan="12"><strong>Sans acheteur</strong><span class="bc"> — ${noAcheteur.length} lot${noAcheteur.length>1?'s':''} en attente</span></td></tr>${noAcheteur.map(makeRow).join('')}</tbody>`
      : '';

    const pageBreak = mode === 'page' ? 'tbody+tbody{page-break-before:always}' : '';
    const totalMeta = [venteLbl, sold.length ? sold.length+' lot'+(sold.length>1?'s':'')+' vendus' : '', noAcheteur.length ? noAcheteur.length+' sans acheteur' : '', 'Généré le '+dateGen].filter(Boolean).join(' · ');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>BCB — Listes acheteurs</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:9px;color:#1E293B;padding:8mm}
  h1{font-size:14px;font-weight:800;margin-bottom:3px}
  .meta{font-size:8.5px;color:#64748B;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  thead{display:table-header-group}
  thead tr{background:#1E293B}
  th{padding:4px 3px;text-align:left;font-size:7.5px;font-weight:700;color:white;white-space:nowrap;overflow:hidden}
  td{padding:3px 3px;font-size:8.5px;border-bottom:1px solid #F1F5F9;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  td.desc{white-space:normal;word-break:break-word}
  .bhr td{background:#475569;color:white;padding:5px 6px;font-size:10px;white-space:normal;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bhr-pending td{background:#92400E;color:#FEF3C7;padding:5px 6px;font-size:10px;white-space:normal;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bc{font-size:8px;font-weight:400;opacity:.8}
  colgroup col:nth-child(1){width:3%}
  colgroup col:nth-child(2){width:7%}
  colgroup col:nth-child(3){width:7%}
  colgroup col:nth-child(4){width:6%}
  colgroup col:nth-child(5){width:19%}
  colgroup col:nth-child(6){width:7%}
  colgroup col:nth-child(7){width:8%}
  colgroup col:nth-child(8){width:9%}
  colgroup col:nth-child(9){width:13%}
  colgroup col:nth-child(10){width:7%}
  colgroup col:nth-child(11){width:6%}
  colgroup col:nth-child(12){width:4%}
  ${pageBreak}
  @media print{body{padding:5mm}}
</style></head><body>
<h1>BCB — Listes par acheteur</h1>
<p class="meta">${totalMeta}</p>
<table>
<colgroup><col><col><col><col><col><col><col><col><col><col><col><col></colgroup>
<thead><tr>
  <th>#</th><th>ID BCB</th><th>Vendeur</th><th>Code</th><th>Description</th>
  <th>Marque</th><th>Modèle</th><th>N° Série</th><th>Commentaire</th><th>Date vente</th><th>N° vente</th><th>Chargé</th>
</tr></thead>
${bodies}${sansAcheteurBody}
</table>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250)});<\/script>
</body></html>`;

    const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(blobUrl, '_blank');
    if (!w) { this.toast('⚠ Autorisez les popups pour imprimer'); URL.revokeObjectURL(blobUrl); return; }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  },

  async bcbLotsLoad(force) {
    if (S.bcbLotsLoading) return;
    if (S.bcbLotsLoaded && !force) { this.bcbSetView(S.bcbLotsView); return; }
    if (!S.apiUrl) { this.toast('URL API non configurée'); return; }
    if (force) { S.bcbLotsFilters = { acheteur: null, vendeur: null, vente: null }; this.bcbCloseFilter(); }
    S.bcbLotsLoading = true;
    document.getElementById('bcb-lots-loading').style.display = '';
    document.getElementById('bcb-lots-content').style.display = 'none';
    document.getElementById('bcb-lots-empty').style.display   = 'none';
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=bcb_lots', {}, 15000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'Erreur serveur');
      S.bcbLots       = d.lots     || [];
      S.bcbByBuyer    = d.byBuyer  || {};
      S.bcbLotsLoaded = true;
    } catch(e) {
      this.toast('Erreur chargement lots : ' + e.message);
    } finally {
      S.bcbLotsLoading = false;
      document.getElementById('bcb-lots-loading').style.display = 'none';
    }
    this.bcbSetView(S.bcbLotsView);
  },

  bcbSetView(v) {
    S.bcbLotsView = v;
    this.bcbLotsRender();
  },

  bcbUpdateFilterUI() {
    // Chips statut
    const sfStyles = {
      null:  { bg:'white',   color:'#64748B', border:'#E2E8F0' },
      true:  { bg:'#D1FAE5', color:'#065F46', border:'#6EE7B7' },
      false: { bg:'#FEF3C7', color:'#92400E', border:'#FCD34D' },
    };
    ['arrive','inspecte','vendu'].forEach(f => {
      const btn = document.getElementById('bcb-sf-' + f);
      if (!btn) return;
      const s = sfStyles[String(S.bcbStatusFilter[f])] || sfStyles.null;
      btn.style.background  = s.bg;
      btn.style.color       = s.color;
      btn.style.borderColor = s.border;
    });
    // Bouton tri
    const sortBtn = document.getElementById('bcb-sort-btn');
    if (sortBtn) {
      const labels = { default:'↑ ID', id_desc:'↓ ID', date_asc:'↑ Date', date_desc:'↓ Date' };
      sortBtn.textContent = labels[S.bcbSortField] || '↑ ID';
    }
    // Bouton sélection
    const selBtn = document.getElementById('bcb-select-btn');
    if (selBtn) {
      selBtn.style.background  = S.bcbSelectMode ? '#1D4ED8' : 'white';
      selBtn.style.color       = S.bcbSelectMode ? 'white'   : '#64748B';
      selBtn.style.borderColor = S.bcbSelectMode ? '#1D4ED8' : '#E2E8F0';
    }
    // Boutons filtres colonne
    const fltLabels = { acheteur:'Acheteur', vendeur:'Vendeur', vente:'Vente' };
    ['acheteur','vendeur','vente'].forEach(f => {
      const btn = document.getElementById('bcb-flt-' + f);
      if (!btn) return;
      const active = S.bcbLotsFilters[f] !== null;
      const open   = S.bcbActiveFilter === f;
      const n      = active ? S.bcbLotsFilters[f].size : null;
      btn.textContent      = active ? `${fltLabels[f]} (${n}) ▾` : `${fltLabels[f]} ▾`;
      btn.style.background  = (active||open) ? '#EFF6FF' : 'white';
      btn.style.color       = (active||open) ? '#1D4ED8' : '#64748B';
      btn.style.borderColor = (active||open) ? '#1D4ED8' : '#E2E8F0';
      btn.style.fontWeight  = active          ? '700'     : '600';
    });
  },

  bcbToggleStatus(field) {
    const cur = S.bcbStatusFilter[field];
    S.bcbStatusFilter[field] = cur === null ? true : cur === true ? false : null;
    this.bcbLotsRender();
  },

  bcbCycleSort() {
    const cycle = ['default','id_desc','date_asc','date_desc'];
    S.bcbSortField = cycle[(cycle.indexOf(S.bcbSortField) + 1) % cycle.length];
    this.bcbLotsRender();
  },

  bcbToggleSelect() {
    S.bcbSelectMode = !S.bcbSelectMode;
    if (!S.bcbSelectMode) S.bcbSelected.clear();
    this.bcbLotsRender();
  },

  bcbToggleLotSelect(key, rowEl) {
    if (S.bcbSelected.has(key)) {
      S.bcbSelected.delete(key);
    } else {
      S.bcbSelected.add(key);
    }
    const isSel = S.bcbSelected.has(key);
    if (rowEl) {
      rowEl.style.background = isSel ? '#EFF6FF' : 'white';
      const cbEl = rowEl.querySelector('[data-lot-cb]');
      if (cbEl) {
        cbEl.style.borderColor = isSel ? '#1D4ED8' : '#CBD5E1';
        cbEl.style.background  = isSel ? '#1D4ED8' : 'white';
        cbEl.textContent       = isSel ? '✓' : '';
      }
    }
    this._bcbUpdateCount();
  },

  bcbSelectAll() {
    const rows = [...document.querySelectorAll('#bcb-lots-content [data-lot-key]')];
    const allSel = rows.length > 0 && rows.every(r => S.bcbSelected.has(r.dataset.lotKey));
    rows.forEach(row => {
      const key = row.dataset.lotKey;
      if (allSel) {
        S.bcbSelected.delete(key);
      } else {
        S.bcbSelected.add(key);
      }
      const isSel = S.bcbSelected.has(key);
      row.style.background = isSel ? '#EFF6FF' : 'white';
      const cbEl = row.querySelector('[data-lot-cb]');
      if (cbEl) {
        cbEl.style.borderColor = isSel ? '#1D4ED8' : '#CBD5E1';
        cbEl.style.background  = isSel ? '#1D4ED8' : 'white';
        cbEl.textContent       = isSel ? '✓' : '';
      }
    });
    this._bcbUpdateCount();
  },

  bcbClearSelect() {
    S.bcbSelected.clear();
    S.bcbSelectMode = false;
    this.bcbLotsRender();
  },

  _bcbUpdateCount() {
    const cnt    = document.getElementById('bcb-select-count');
    const allBtn = document.getElementById('bcb-select-all-btn');
    const n = S.bcbSelected.size;
    if (cnt) cnt.textContent = n ? `${n} lot${n>1?'s':''} sélectionné${n>1?'s':''}` : '0 sélectionné';
    if (allBtn) {
      const rows  = document.querySelectorAll('#bcb-lots-content [data-lot-key]');
      const allSel = rows.length > 0 && [...rows].every(r => S.bcbSelected.has(r.dataset.lotKey));
      allBtn.textContent = allSel ? 'Aucun' : 'Tout';
    }
  },

  _bcbSyncSelectBar() {
    const bar = document.getElementById('bcb-select-bar');
    if (bar) bar.style.display = S.bcbSelectMode ? 'flex' : 'none';
    const content = document.getElementById('bcb-lots-content');
    if (content) content.style.paddingBottom = S.bcbSelectMode ? '68px' : '24px';
    this._bcbUpdateCount();
  },

  bcbLotsRender() {
    const content  = document.getElementById('bcb-lots-content');
    const emptyEl  = document.getElementById('bcb-lots-empty');
    const subtitle = document.getElementById('bcb-lots-subtitle');
    if (!content) return;

    this.bcbUpdateFilterUI();

    // 1. Filtre texte
    const q = (S.bcbLotsSearch || '').toLowerCase().trim();
    let filtered = q
      ? S.bcbLots.filter(l => [l.idBcb,l.inter,l.vendeur,l.marque,l.modele,l.type,l.refVendeur,l.numSerie,l.commentaire,l.numVente,l.acheteur]
          .some(v => (v||'').toLowerCase().includes(q)))
      : [...S.bcbLots];

    // 2. Filtre statut
    const sf = S.bcbStatusFilter;
    if (sf.arrive   !== null) filtered = filtered.filter(l => l.arrive   === sf.arrive);
    if (sf.inspecte !== null) filtered = filtered.filter(l => l.inspecte === sf.inspecte);
    if (sf.vendu    !== null) filtered = filtered.filter(l => l.vendu    === sf.vendu);

    // 3. Filtres colonne (Excel-like)
    const cf = S.bcbLotsFilters;
    if (cf.acheteur !== null) filtered = filtered.filter(l => cf.acheteur.has(l.acheteur||''));
    if (cf.vendeur  !== null) filtered = filtered.filter(l => cf.vendeur.has(l.vendeur||''));
    if (cf.vente    !== null) filtered = filtered.filter(l => cf.vente.has(l.numVente ? `Vente n°${l.numVente}` : ''));

    // 4. Tri
    const sortFn = {
      default:   (a,b) => a.idBcb.localeCompare(b.idBcb),
      id_desc:   (a,b) => b.idBcb.localeCompare(a.idBcb),
      date_asc:  (a,b) => (a.dateArrivee||'').localeCompare(b.dateArrivee||''),
      date_desc: (a,b) => (b.dateArrivee||'').localeCompare(a.dateArrivee||''),
    };
    filtered.sort(sortFn[S.bcbSortField] || sortFn.default);

    if (!filtered.length) {
      content.style.display='none'; emptyEl.style.display='';
      subtitle.textContent = 'Aucun résultat';
      this._bcbSyncSelectBar();
      return;
    }
    emptyEl.style.display = 'none';
    content.style.display = '';

    // Map idx pour navigation détail
    const idxMap = {};
    S.bcbLots.forEach((l,i) => { idxMap[l.inter+'|'+l.idBcb] = i; });

    const lotRow = lot => {
      const key  = lot.inter + '|' + lot.idBcb;
      const idx  = idxMap[key] ?? -1;
      const isSel = S.bcbSelectMode && S.bcbSelected.has(key);
      const bg   = isSel ? '#EFF6FF' : 'white';
      const clickFn = S.bcbSelectMode
        ? `App.bcbToggleLotSelect('${key.replace(/'/g,"\\'")}', this)`
        : `App.bcbLotDetail(${idx})`;
      const dotA = `<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:${lot.arrive?'#D1FAE5':'#F1F5F9'};color:${lot.arrive?'#065F46':'#94A3B8'};">A</span>`;
      const dotI = `<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:${lot.inspecte?'#DBEAFE':'#F1F5F9'};color:${lot.inspecte?'#1D4ED8':'#94A3B8'};">I</span>`;
      const dotV = `<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:${lot.vendu?'#FEF3C7':'#F1F5F9'};color:${lot.vendu?'#92400E':'#94A3B8'};">V</span>`;
      const acheteurChip = lot.acheteur ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:#FEF9C3;color:#713F12;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;">${lot.acheteur}</span>` : '';
      const vente = lot.numVente ? `<span style="font-size:10px;color:#64748B;font-weight:600;margin-left:2px;">n°${lot.numVente}</span>` : '';
      const desc  = [lot.vendeur, [lot.marque,lot.modele].filter(Boolean).join(' '), lot.type].filter(Boolean).join(' — ');
      const sub   = [lot.refVendeur?`réf ${lot.refVendeur}`:'', lot.numSerie?`n° ${lot.numSerie}`:'', lot.poids?`${lot.poids}t`:'', lot.commentaire].filter(Boolean).join(' · ');
      const cbHtml = S.bcbSelectMode
        ? `<div data-lot-cb style="width:18px;height:18px;border-radius:5px;border:2px solid ${isSel?'#1D4ED8':'#CBD5E1'};background:${isSel?'#1D4ED8':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:white;">${isSel?'✓':''}</div>`
        : '';
      return `<div data-lot-key="${key}" onclick="${clickFn}" style="background:${bg};border:1px solid #E2E8F0;border-radius:8px;padding:7px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;" onmouseenter="if(!App._bcbIsSelected('${key}'))this.style.background='#F0F7FF'" onmouseleave="if(!App._bcbIsSelected('${key}'))this.style.background='white'">
        ${cbHtml}
        <div style="flex:1;min-width:0;overflow:hidden;">
          <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:700;color:#1E293B;white-space:nowrap;">${lot.idBcb}</span>
            ${lot.inter ? `<span style="font-size:10px;color:#94A3B8;font-family:monospace;white-space:nowrap;">${lot.inter}</span>` : ''}
            <span style="font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:60px;">${desc}</span>
          </div>
          ${sub ? `<div style="font-size:10px;color:#94A3B8;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sub}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;flex-wrap:nowrap;">${acheteurChip}${dotA}${dotI}${dotV}${vente}</div>
      </div>`;
    };

    const groupSection = (key, lots, color) => `<div>
      <div style="font-size:10px;font-weight:700;color:${color||'#1D4ED8'};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
        <span>${key||'(non renseigné)'}</span>
        <span style="background:#F1F5F9;color:#475569;font-size:10px;padding:0 7px;border-radius:10px;">${lots.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">${lots.map(lotRow).join('')}</div>
    </div>`;

    const v = S.bcbLotsView || 'acheteur';

    if (v === 'lots') {
      subtitle.textContent = `${filtered.length} lot${filtered.length>1?'s':''}`;
      content.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px;">${filtered.map(lotRow).join('')}</div>`;
    } else {
      const groupBy = v === 'acheteur' ? l => l.acheteur
                    : v === 'vendeur'  ? l => l.vendeur
                    : l => (l.numVente ? `Vente n°${l.numVente}` : '');
      const color   = v === 'vendeur'  ? '#065F46' : v === 'vente' ? '#92400E' : '#1D4ED8';
      const groups  = {};
      filtered.forEach(l => { const k = groupBy(l)||''; (groups[k]=groups[k]||[]).push(l); });
      const keys    = Object.keys(groups).sort((a,b) => { if(!a)return 1; if(!b)return -1; return a.localeCompare(b,'fr'); });
      const word    = v === 'acheteur' ? 'acheteur' : v === 'vendeur' ? 'vendeur' : 'vente';
      subtitle.textContent = `${filtered.length} lot${filtered.length>1?'s':''} · ${keys.length} ${word}${keys.length>1?'s':''}`;
      content.innerHTML = keys.map(k => groupSection(k, groups[k], color)).join('');
    }
    this._bcbSyncSelectBar();
  },

  _bcbIsSelected(key) { return S.bcbSelected.has(key); },

  bcbOpenFilter(evt, field) {
    if (S.bcbActiveFilter === field) { this.bcbCloseFilter(); return; }
    S.bcbActiveFilter = field;
    const dropdown = document.getElementById('bcb-filter-dropdown');
    if (!dropdown) return;
    const getVal = l => field === 'acheteur' ? (l.acheteur||'')
                      : field === 'vendeur'  ? (l.vendeur||'')
                      : (l.numVente ? `Vente n°${l.numVente}` : '');
    const allVals = [...new Set(S.bcbLots.map(getVal))]
      .sort((a,b) => !a ? 1 : !b ? -1 : a.localeCompare(b,'fr'));
    dropdown._bcbField = field;
    dropdown._bcbVals  = allVals;
    const activeSet = S.bcbLotsFilters[field];
    const countMap  = {};
    S.bcbLots.forEach(l => { const v = getVal(l); countMap[v] = (countMap[v]||0)+1; });
    const labels = { acheteur:'Acheteur', vendeur:'Vendeur', vente:'Vente' };
    document.getElementById('bcb-flt-title').textContent = labels[field];
    document.getElementById('bcb-flt-items').innerHTML = allVals.map((v, i) => {
      const checked = activeSet === null || activeSet.has(v);
      return `<label style="display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;user-select:none;" onmouseenter="this.style.background='#F8FAFC'" onmouseleave="this.style.background=''">
        <input type="checkbox" ${checked?'checked':''} onchange="App._bcbFltToggle(${i})" style="width:15px;height:15px;cursor:pointer;accent-color:#1D4ED8;flex-shrink:0;">
        <span style="font-size:12px;color:#1E293B;flex:1;">${v||'(non renseigné)'}</span>
        <span style="font-size:10px;color:#94A3B8;font-weight:600;">${countMap[v]||0}</span>
      </label>`;
    }).join('');
    const btn  = evt.currentTarget;
    const rect = btn.getBoundingClientRect();
    dropdown.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 280)) + 'px';
    dropdown.style.top  = (rect.bottom + 4) + 'px';
    dropdown.style.display = 'flex';
    this.bcbUpdateFilterUI();
    if (this._bcbFltHandler) {
      document.removeEventListener('mousedown', this._bcbFltHandler);
      document.removeEventListener('touchstart', this._bcbFltHandler);
    }
    this._bcbFltHandler = e => {
      const d = document.getElementById('bcb-filter-dropdown');
      const btns = ['bcb-flt-acheteur','bcb-flt-vendeur','bcb-flt-vente'].map(id => document.getElementById(id));
      if (d && !d.contains(e.target) && btns.every(b => !b || !b.contains(e.target))) this.bcbCloseFilter();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', this._bcbFltHandler);
      document.addEventListener('touchstart', this._bcbFltHandler);
    }, 0);
  },

  _bcbFltToggle(idx) {
    const dropdown = document.getElementById('bcb-filter-dropdown');
    if (!dropdown) return;
    const field   = dropdown._bcbField;
    const allVals = dropdown._bcbVals;
    const value   = allVals[idx];
    let cur = S.bcbLotsFilters[field];
    if (cur === null) {
      cur = new Set(allVals);
      cur.delete(value);
    } else {
      if (cur.has(value)) cur.delete(value); else cur.add(value);
      if (cur.size === allVals.length) cur = null;
    }
    S.bcbLotsFilters[field] = cur;
    this.bcbUpdateFilterUI();
    this.bcbLotsRender();
  },

  bcbFilterAll() {
    const dropdown = document.getElementById('bcb-filter-dropdown');
    if (!dropdown || !dropdown._bcbField) return;
    S.bcbLotsFilters[dropdown._bcbField] = null;
    this.bcbCloseFilter();
    this.bcbLotsRender();
  },

  bcbFilterNone() {
    const dropdown = document.getElementById('bcb-filter-dropdown');
    if (!dropdown || !dropdown._bcbField) return;
    S.bcbLotsFilters[dropdown._bcbField] = new Set();
    document.querySelectorAll('#bcb-flt-items input[type=checkbox]').forEach(cb => cb.checked = false);
    this.bcbUpdateFilterUI();
    this.bcbLotsRender();
  },

  bcbCloseFilter() {
    S.bcbActiveFilter = null;
    const d = document.getElementById('bcb-filter-dropdown');
    if (d) d.style.display = 'none';
    if (this._bcbFltHandler) {
      document.removeEventListener('mousedown', this._bcbFltHandler);
      document.removeEventListener('touchstart', this._bcbFltHandler);
      this._bcbFltHandler = null;
    }
    this.bcbUpdateFilterUI();
  },

  /* ─ BCB Import acheteurs ─ */
  bcbImportInit() {
    S.bcbImp = { step:1, rows:[], matched:[], notInFile:[] };
    this._bcbImpShowStep(1);
    const dateEl = document.getElementById('bcb-imp-date');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0,10);
    if (!S.bcbLotsLoaded && !S.bcbLotsLoading) this.bcbLotsLoad();
  },

  _bcbImpShowStep(n) {
    S.bcbImp.step = n;
    [1,2,3,4].forEach(i => {
      const el = document.getElementById('bcb-imp-step' + i);
      if (el) el.style.display = (i === n) ? '' : 'none';
    });
    const labels = { 1:'Étape 1 — Chargement du fichier', 2:'Étape 2 — Sélection des colonnes', 3:'Étape 3 — Vérification et confirmation', 4:'Import terminé' };
    const lbl = document.getElementById('bcb-imp-step-label');
    if (lbl) lbl.textContent = labels[n] || '';
  },

  _loadSheetJs(cb) {
    if (window.XLSX) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = cb;
    s.onerror = () => this.toast('Impossible de charger le lecteur Excel');
    document.head.appendChild(s);
  },

  _parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
    return lines.map(line => {
      const res = []; let inQ = false, cur = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === delim && !inQ) { res.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      res.push(cur.trim());
      return res;
    });
  },

  bcbImportHandleFile(file) {
    if (!file) return;
    const errEl  = document.getElementById('bcb-imp-s1-error');
    const loadEl = document.getElementById('bcb-imp-s1-loading');
    if (errEl)  errEl.style.display = 'none';
    if (loadEl) loadEl.style.display = '';
    const ext = file.name.split('.').pop().toLowerCase();
    const done = (rows) => {
      if (loadEl) loadEl.style.display = 'none';
      if (!rows || rows.length < 2) {
        if (errEl) { errEl.style.display = ''; errEl.textContent = 'Fichier vide ou illisible.'; } return;
      }
      S.bcbImp.rows = rows;
      this._bcbImpShowStep(2);
      this.bcbImportUpdateSelects();
    };
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = e => done(this._parseCsv(e.target.result));
      reader.readAsText(file, 'UTF-8');
    } else {
      this._loadSheetJs(() => {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const wb   = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
            const ws   = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
            done(rows.map(r => r.map(c => String(c == null ? '' : c).trim())));
          } catch(err) {
            if (loadEl) loadEl.style.display = 'none';
            if (errEl)  { errEl.style.display = ''; errEl.textContent = 'Erreur lecture : ' + err.message; }
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }
  },

  bcbImportUpdateSelects() {
    const rows = S.bcbImp.rows;
    if (!rows.length) return;
    const hasHeader = document.getElementById('bcb-imp-has-header')?.checked;
    const headerRow = hasHeader ? rows[0] : null;
    const ncols = Math.max(...rows.slice(0, 6).map(r => r.length));
    const opts = Array.from({ length: ncols }, (_, i) => {
      const lbl = headerRow && headerRow[i] ? `Col ${i+1} — ${headerRow[i]}` : `Colonne ${i+1}`;
      return `<option value="${i}">${lbl}</option>`;
    }).join('');
    document.getElementById('bcb-imp-sel-bcb').innerHTML = opts;
    document.getElementById('bcb-imp-sel-acheteur').innerHTML = opts;
    document.getElementById('bcb-imp-sel-vente').innerHTML = `<option value="-1">(aucune)</option>` + opts;
    if (hasHeader && headerRow) {
      const try_ = (...kws) => { const i = headerRow.findIndex(h => kws.some(k => String(h).toLowerCase().includes(k))); return i >= 0 ? i : null; };
      const bi = try_('bcb','id bcb','n° bcb','lot','code','ref bcb');
      const ai = try_('achet','buyer','client','acquéreur');
      const vi = try_('vente','sale','n° vente','num vente');
      if (bi != null) document.getElementById('bcb-imp-sel-bcb').value = bi;
      if (ai != null) document.getElementById('bcb-imp-sel-acheteur').value = ai;
      if (vi != null) document.getElementById('bcb-imp-sel-vente').value = vi;
    }
    const previewRows = rows.slice(0, 8);
    const maxC = Math.max(...previewRows.map(r => r.length));
    const preview = document.getElementById('bcb-imp-preview');
    if (preview) preview.innerHTML = `<table style="border-collapse:collapse;font-size:11px;min-width:${maxC*72}px;">` +
      previewRows.map((row, ri) => {
        const isH = ri === 0 && hasHeader;
        return `<tr style="background:${isH?'#F1F5F9':'white'};border-bottom:1px solid #F1F5F9;">` +
          Array.from({length:maxC}, (_,ci) =>
            `<td style="padding:4px 8px;white-space:nowrap;${isH?'font-weight:700;color:#475569;':''}">${row[ci]||''}</td>`
          ).join('') + '</tr>';
      }).join('') + '</table>';
  },

  bcbImportAnalyze() {
    const selBcb   = parseInt(document.getElementById('bcb-imp-sel-bcb')?.value);
    const selAcht  = parseInt(document.getElementById('bcb-imp-sel-acheteur')?.value);
    const selVente = parseInt(document.getElementById('bcb-imp-sel-vente')?.value ?? '-1');
    const date     = document.getElementById('bcb-imp-date')?.value;
    if (isNaN(selBcb) || isNaN(selAcht)) { this.toast('Sélectionnez les colonnes requises'); return; }
    if (!date) { this.toast('Entrez une date de vente'); return; }
    const hasHeader = document.getElementById('bcb-imp-has-header')?.checked;
    const dataRows  = hasHeader ? S.bcbImp.rows.slice(1) : S.bcbImp.rows;
    const lotsMap   = {};
    S.bcbLots.forEach(l => { lotsMap[l.idBcb.trim().toUpperCase()] = l; });
    const seen = {}, matched = [];
    dataRows.forEach(row => {
      const idBcb    = String(row[selBcb]  || '').trim();
      const acheteur = String(row[selAcht] || '').trim();
      const numVente = selVente >= 0 ? String(row[selVente] || '').trim() : '';
      if (!idBcb) return;
      const key  = idBcb.toUpperCase();
      const isDup = !!seen[key]; seen[key] = true;
      const lot  = lotsMap[key] || null;
      matched.push({ idBcb, acheteur, numVente, dateVente: date, lot, isDup, alreadyVendu: lot?.vendu||false });
    });
    S.bcbImp.matched   = matched;
    S.bcbImp.notInFile = S.bcbLots.filter(l => !seen[l.idBcb.toUpperCase()]);
    this._bcbImpShowStep(3);
    this._bcbImpRenderPreview();
  },

  _bcbImpRenderPreview() {
    const { matched, notInFile } = S.bcbImp;
    const found    = matched.filter(m => m.lot && !m.isDup);
    const dups     = matched.filter(m => m.isDup);
    const notFound = matched.filter(m => !m.lot && !m.isDup);
    const alreadyV = matched.filter(m => m.lot && m.alreadyVendu && !m.isDup);
    const statsEl  = document.getElementById('bcb-imp-stats');
    if (statsEl) statsEl.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">
      <div style="background:#D1FAE5;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#065F46;">${found.length}</div>
        <div style="font-size:10px;color:#065F46;font-weight:600;">Lots trouvés</div>
      </div>
      <div style="background:${notFound.length?'#FEF3C7':'#F1F5F9'};border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:${notFound.length?'#92400E':'#94A3B8'};">${notFound.length}</div>
        <div style="font-size:10px;color:${notFound.length?'#92400E':'#94A3B8'};font-weight:600;">Non trouvés</div>
      </div>
      ${dups.length?`<div style="background:#FEE2E2;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#DC2626;">${dups.length}</div>
        <div style="font-size:10px;color:#DC2626;font-weight:600;">Doublons fichier</div></div>`:''}
      ${alreadyV.length?`<div style="background:#EDE9FE;border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#7C3AED;">${alreadyV.length}</div>
        <div style="font-size:10px;color:#7C3AED;font-weight:600;">Déjà vendus</div></div>`:''}
    </div>`;
    const hasVente = matched.some(m => m.numVente);
    const tableEl  = document.getElementById('bcb-imp-match-table');
    if (tableEl) tableEl.innerHTML = `<div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Détail — ${matched.length} ligne${matched.length>1?'s':''} fichier</div>
      <div style="overflow:auto;border:1px solid #E2E8F0;border-radius:10px;max-height:200px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;">
            <th style="padding:5px 8px;font-size:10px;text-align:left;color:#64748B;">N° BCB</th>
            <th style="padding:5px 8px;font-size:10px;text-align:left;color:#64748B;">Acheteur</th>
            ${hasVente?'<th style="padding:5px 8px;font-size:10px;text-align:left;color:#64748B;">N° vente</th>':''}
            <th style="padding:5px 8px;font-size:10px;text-align:left;color:#64748B;">Statut</th>
          </tr></thead><tbody>
          ${matched.slice(0,60).map(m => {
            const color = m.isDup?'#DC2626':!m.lot?'#D97706':m.alreadyVendu?'#7C3AED':'#065F46';
            const icon  = m.isDup?'⚠️ doublon':!m.lot?'❌ inconnu':m.alreadyVendu?'🔄 déjà vendu':'✅';
            return `<tr style="border-bottom:1px solid #F8FAFC;">
              <td style="padding:4px 8px;font-size:11px;font-family:monospace;font-weight:600;">${m.idBcb}</td>
              <td style="padding:4px 8px;font-size:11px;color:#475569;">${m.acheteur}</td>
              ${hasVente?`<td style="padding:4px 8px;font-size:10px;color:#94A3B8;">${m.numVente}</td>`:''}
              <td style="padding:4px 8px;font-size:11px;font-weight:600;color:${color};">${icon}</td>
            </tr>`;
          }).join('')}
          ${matched.length>60?`<tr><td colspan="4" style="padding:5px 8px;font-size:10px;color:#94A3B8;text-align:center;">… et ${matched.length-60} autres</td></tr>`:''}
          </tbody></table></div>`;
    const unsoldEl = document.getElementById('bcb-imp-unsold');
    if (unsoldEl) unsoldEl.innerHTML = notInFile.length ? `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:700;color:#92400E;margin-bottom:8px;">⚠️ ${notInFile.length} lot${notInFile.length>1?'s':''} absent${notInFile.length>1?'s':''} du fichier (non vendus)</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">${notInFile.map(l=>`<span style="background:white;border:1px solid #FED7AA;border-radius:5px;padding:1px 7px;font-size:10px;font-family:monospace;color:#92400E;">${l.idBcb}</span>`).join('')}</div>
    </div>` : '';
    const toImport = found.concat(alreadyV);
    const btn = document.getElementById('bcb-imp-confirm-btn');
    if (btn) {
      btn.disabled     = !toImport.length;
      btn.style.opacity = toImport.length ? '1' : '.4';
      btn.textContent  = toImport.length ? `✅ Importer ${toImport.length} lot${toImport.length>1?'s':''}` : 'Aucun lot à importer';
    }
  },

  async bcbImportConfirm() {
    const toImport = S.bcbImp.matched.filter(m => m.lot && !m.isDup);
    if (!toImport.length) return;
    const btn = document.getElementById('bcb-imp-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Import en cours…'; }
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'bcb_import_acheteurs', lots: toImport.map(m=>({ idBcb:m.idBcb, acheteur:m.acheteur, numVente:m.numVente, dateVente:m.dateVente })) })
      }, 30000);
      const d = await r.json();
      if (d.status !== 'ok') throw new Error(d.error || 'Erreur serveur');
      toImport.forEach(m => {
        const lot = S.bcbLots.find(l => l.idBcb === m.idBcb);
        if (lot) { lot.acheteur = m.acheteur; lot.vendu = true; lot.dateVente = m.dateVente; if (!lot.numVente) lot.numVente = m.numVente; }
      });
      const nGarde = d.venteGardee?.length || 0;
      this._bcbImpShowStep(4);
      const resultEl = document.getElementById('bcb-imp-result');
      if (resultEl) resultEl.innerHTML = `
        <div style="font-size:48px;margin-bottom:12px;">✅</div>
        <div style="font-size:20px;font-weight:800;color:#1E293B;margin-bottom:6px;">${d.updated||toImport.length} lot${(d.updated||toImport.length)>1?'s':''} importé${(d.updated||toImport.length)>1?'s':''}</div>
        ${d.notFound?.length?`<div style="font-size:12px;color:#D97706;margin-top:8px;">⚠️ ${d.notFound.length} N° BCB introuvable${d.notFound.length>1?'s':''} dans le sheet</div>`:''}
        ${nGarde?`<div style="font-size:12px;color:#475569;margin-top:8px;">ℹ️ ${nGarde} lot${nGarde>1?'s':''} déjà passé${nGarde>1?'s':''} en vente : n° de première vente conservé</div>`:''}
        <div style="font-size:12px;color:#64748B;margin-top:8px;">Statut "vendu", acheteur et date de vente mis à jour dans Google Sheets.</div>`;
    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = '↩ Réessayer'; }
      this.toast('Erreur import : ' + e.message);
    }
  },

  bcbImportBack2() { this._bcbImpShowStep(2); },

  bcbImportReset() {
    S.bcbImp = { step:1, rows:[], matched:[], notInFile:[] };
    const fi = document.getElementById('bcb-imp-file');
    if (fi) fi.value = '';
    const errEl = document.getElementById('bcb-imp-s1-error');
    if (errEl) errEl.style.display = 'none';
    this._bcbImpShowStep(1);
  },

  bcbLotDetail(idx) {
    const lot = S.bcbLots[idx];
    if (!lot) return;
    S.bcbSelLot = lot;
    const body = document.getElementById('bcb-lot-detail-body');
    if (!body) return;

    const row = (label, val, opts) => {
      if (!val && !opts?.always) return '';
      return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid #F1F5F9;gap:12px;">
        <span style="font-size:11px;color:#64748B;flex-shrink:0;">${label}</span>
        <span style="font-size:12px;font-weight:600;color:#1E293B;text-align:right;">${val||'—'}</span>
      </div>`;
    };
    const dotA = `<span style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;background:${lot.arrive?'#D1FAE5':'#F1F5F9'};color:${lot.arrive?'#065F46':'#94A3B8'};">Arrivé</span>`;
    const dotI = `<span style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;background:${lot.inspecte?'#DBEAFE':'#F1F5F9'};color:${lot.inspecte?'#1D4ED8':'#94A3B8'};">Inspecté</span>`;
    const dotV = `<span style="padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;background:${lot.vendu?'#FEF3C7':'#F1F5F9'};color:${lot.vendu?'#92400E':'#94A3B8'};">Vendu</span>`;
    const driveUrl = lot.inter ? `https://drive.google.com/drive/search?q=${encodeURIComponent(lot.inter)}` : '';

    body.innerHTML = `
      <!-- En-tête -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px;">
        <div>
          <div style="font-size:20px;font-weight:800;color:#1E293B;">${lot.idBcb}</div>
          ${lot.inter ? `<div style="font-size:12px;color:#94A3B8;font-family:monospace;margin-top:2px;">${lot.inter}</div>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end;">${dotA}${dotI}${dotV}</div>
      </div>

      <!-- Bloc identification -->
      <div style="background:white;border:1px solid #E2E8F0;border-radius:10px;padding:4px 12px;margin-bottom:10px;">
        ${row('Vendeur', lot.vendeur)}
        ${row('Réf vendeur', lot.refVendeur)}
        ${row('Type', lot.type)}
        ${row('Marque', lot.marque)}
        ${row('Modèle', lot.modele)}
        ${row('N° de série', lot.numSerie)}
        ${row('Poids', lot.poids ? lot.poids+' t' : '')}
        ${row('Commentaire', lot.commentaire)}
      </div>

      <!-- Bloc vente -->
      <div style="background:white;border:1px solid #E2E8F0;border-radius:10px;padding:4px 12px;margin-bottom:10px;">
        ${row('Acheteur', lot.acheteur)}
        ${row('N° vente', lot.numVente)}
        ${row('Date de vente', lot.dateVente)}
        ${row('Coût', lot.cout != null ? lot.cout+' €' : '')}
      </div>

      <!-- Bloc logistique -->
      <div style="background:white;border:1px solid #E2E8F0;border-radius:10px;padding:4px 12px;margin-bottom:10px;">
        ${row('Date arrivée', lot.dateArrivee)}
        ${row('Chauffeur', lot.chauffeur)}
        ${row('LV', lot.lv)}
        ${row('Code enlèvement', lot.codeEnlevement)}
      </div>

      <!-- Bouton Drive -->
      ${driveUrl ? `<a href="${driveUrl}" target="_blank" rel="noopener"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:white;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px;font-size:13px;font-weight:600;color:#1D4ED8;text-decoration:none;margin-bottom:10px;">
          <span style="font-size:18px;">📁</span> Ouvrir le dossier Drive
        </a>` : ''}
    `;
    this.go('bcb-lot-detail');
  },

  /* ─ BCB Enlèvements ─ */
  async bcbEnlevementsLoad(force) {
    if (S.bcbEnlevementsLoading) return;
    if (S.bcbEnlevementsLoaded && !force) { this.bcbEnlevementsRender(); return; }
    const loadEl = document.getElementById('bcb-enlevs-loading');
    const listEl = document.getElementById('bcb-enlevs-list');
    const emptyEl = document.getElementById('bcb-enlevs-empty');
    if (loadEl) loadEl.style.display = '';
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'none';
    S.bcbEnlevementsLoading = true;
    try {
      const r = await _fetchWithTimeout(S.apiUrl + '?action=bcb_enlevements_list', {}, 15000);
      const d = await r.json();
      if (d.status === 'ok') {
        S.bcbEnlevements = d.history || [];
        S.bcbEnlevementsLoaded = true;
      }
    } catch(e) { this.toast('Erreur chargement enlèvements'); }
    S.bcbEnlevementsLoading = false;
    if (loadEl) loadEl.style.display = 'none';
    this.bcbEnlevementsRender();
  },

  bcbEnlevementsRender() {
    const listEl  = document.getElementById('bcb-enlevs-list');
    const emptyEl = document.getElementById('bcb-enlevs-empty');
    const subEl   = document.getElementById('bcb-enlevs-subtitle');
    if (!listEl) return;
    const h = S.bcbEnlevements;
    if (subEl) subEl.textContent = h.length ? `${h.length} bon${h.length>1?'s':''}` : '';
    if (!h.length) { if (emptyEl) emptyEl.style.display = ''; listEl.innerHTML = ''; return; }
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.innerHTML = h.map((e, i) => {
      const lots    = (e.lots || []).length;
      const hasCmr  = !!e.cmrNumero;
      const nPhotos = e.photosCount || 0;
      const photoBadge = nPhotos > 0
        ? `<span style="font-size:10px;background:#CCFBF1;color:#0F766E;border-radius:4px;padding:2px 6px;font-weight:700;">📷 ${nPhotos}</span>`
        : `<span style="font-size:10px;background:#F1F5F9;color:#94A3B8;border-radius:4px;padding:2px 6px;">📷 —</span>`;
      return `<div style="background:white;border:1px solid ${nPhotos>0?'#99F6E4':'#E2E8F0'};border-radius:8px;padding:10px 12px;margin-bottom:6px;">
        <div onclick="App.bcbViewEnlevement(${i})" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:#1E293B;">${e.numero}</div>
            <div style="font-size:11px;color:#64748B;">${e.date} · ${e.chauffeur||'—'} · ${lots} lot${lots>1?'s':''}</div>
            <div style="font-size:11px;color:#64748B;margin-top:1px;">${e.destination||''}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
            ${photoBadge}
            ${e.pdfUrl ? '<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;border-radius:4px;padding:2px 6px;">PDF ✓</span>' : ''}
            ${hasCmr  ? `<span style="font-size:10px;background:#F0FDF4;color:#065F46;border-radius:4px;padding:2px 6px;">CMR ${e.cmrNumero}</span>` : '<span style="font-size:10px;background:#FEF9C3;color:#92400E;border-radius:4px;padding:2px 6px;">Sans CMR</span>'}
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;border-top:1px solid #F1F5F9;padding-top:8px;align-items:center;">
          ${e.pdfUrl ? `<a href="${e.pdfUrl}" target="_blank" rel="noopener" style="background:#EFF6FF;color:#1D4ED8;border:1.5px solid #BFDBFE;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;text-decoration:none;">📄 PDF</a>` : ''}
          ${hasCmr ? `<a href="${e.cmrUrl}" target="_blank" rel="noopener" style="background:#F0FDF4;color:#065F46;border:1.5px solid #BBF7D0;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;text-decoration:none;">📋 CMR ${e.cmrNumero}</a>` : ''}
          ${nPhotos > 0 ? `<span style="font-size:11px;color:#0F766E;font-weight:600;">📷 ${nPhotos} photo${nPhotos>1?'s':''}</span>` : ''}
          <button onclick="App.bcbDeleteEnlevement('${e.numero}')" style="margin-left:auto;background:#FEE2E2;color:#B91C1C;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">🗑</button>
        </div>
      </div>`;
    }).join('');
  },

  bcbViewEnlevement(idx) {
    const e = S.bcbEnlevements[idx];
    if (!e) return;
    S.bcbCurEnlevement = e;
    this._bcbRenderEnlevDetail();
    this.go('bcb-enlevement');
  },

  async bcbDeleteEnlevement(numero) {
    if (!confirm(`Supprimer le bon d'enlèvement ${numero} et mettre ses fichiers à la corbeille ?`)) return;
    // Récupérer l'enlèvement avant suppression pour réinitialiser l'état local
    const enlevement = S.bcbEnlevements.find(e => e.numero === numero);
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bcb_enlevement_delete', numero })
      }, 40000);
      const d = await r.json();
      if (d.status === 'ok') {
        S.bcbEnlevements = S.bcbEnlevements.filter(e => e.numero !== numero);
        if (S.bcbCurEnlevement?.numero === numero) S.bcbCurEnlevement = null;
        // Remettre les lots comme non-partis localement
        if (enlevement) {
          const deletedIds = new Set((enlevement.lots || []).map(l => l.idBcb));
          S.bcbLots.forEach(l => { if (deletedIds.has(l.idBcb)) l.parti = false; });
          // Démarquer la consigne chauffeur
          const consList = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
          const idx = consList.findIndex(c => [c.prenom, c.nom].filter(Boolean).join(' ') === enlevement.chauffeur);
          if (idx > -1) {
            const procCons = new Set(JSON.parse(localStorage.getItem('snt_bcb_processed_consignes') || '[]'));
            procCons.delete(idx);
            localStorage.setItem('snt_bcb_processed_consignes', JSON.stringify([...procCons]));
          }
        }
        this.toast('Enlèvement ' + numero + ' supprimé');
        this.bcbEnlevementsRender();
      } else this.toast('Erreur : ' + (d.error || 'inconnue'));
    } catch(e) { this.toast('Erreur : ' + e.message); }
  },

  _bcbRenderEnlevDetail() {
    const e     = S.bcbCurEnlevement;
    const title = document.getElementById('bcb-enlev-title');
    const sub   = document.getElementById('bcb-enlev-subtitle');
    const body  = document.getElementById('bcb-enlev-body');
    if (!e || !body) return;
    S.bcbEnlevPhotos = [];
    if (title) title.textContent = 'Enl. ' + e.numero;
    const nPhotos = e.photosCount || 0;
    if (sub) sub.innerHTML = e.date
      + (e.cmrNumero ? ' · CMR ' + e.cmrNumero : '')
      + (nPhotos > 0
        ? ` · <span style="color:#0F766E;font-weight:700;">📷 ${nPhotos} photo${nPhotos>1?'s':''}</span>`
        : ' · <span style="color:#94A3B8;">📷 aucune photo</span>');
    const lots = e.lots || [];
    const row  = (label, val) => val ? `<tr><td style="padding:4px 8px;font-size:11px;color:#64748B;white-space:nowrap;">${label}</td><td style="padding:4px 8px;font-size:12px;color:#1E293B;">${val}</td></tr>` : '';
    const lotRows = lots.map((l, i) => `
      <tr style="background:${i%2?'#F8FAFC':'white'}">
        <td style="padding:4px 6px;font-size:11px;text-align:center;">${i+1}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.inter||''}</td>
        <td style="padding:4px 6px;font-size:11px;font-weight:600;">${l.idBcb||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.idSeller||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${[l.marque,l.modele].filter(Boolean).join(' ')||l.type||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.marque||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.modele||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.numSerie||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.commentaire||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.dateVente||''}</td>
        <td style="padding:4px 6px;font-size:11px;">${l.acheteur||''}</td>
        <td style="padding:4px 6px;font-size:11px;text-align:right;">${l.poids||''}</td>
      </tr>`).join('');
    const thStyle = 'padding:4px 6px;font-size:10px;font-weight:700;color:white;background:#1E293B;white-space:nowrap;';
    const driverForm = !e.chauffeur ? `
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;margin-bottom:10px;">
        <div style="font-size:12px;font-weight:700;color:#92400E;margin-bottom:10px;">Infos chauffeur manquantes</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div style="grid-column:1/-1;">
            <label style="font-size:11px;color:#64748B;display:block;margin-bottom:3px;">Chauffeur *</label>
            <input id="bcb-enlev-drv-chauffeur" type="text" autocomplete="nope" placeholder="Prénom NOM"
              style="width:100%;border:1px solid #E2E8F0;border-radius:6px;padding:7px 10px;font-size:13px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:11px;color:#64748B;display:block;margin-bottom:3px;">Tracteur</label>
            <input id="bcb-enlev-drv-tracteur" type="text" autocomplete="nope" placeholder="Immat."
              style="width:100%;border:1px solid #E2E8F0;border-radius:6px;padding:7px 10px;font-size:13px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:11px;color:#64748B;display:block;margin-bottom:3px;">Remorque</label>
            <input id="bcb-enlev-drv-remorque" type="text" autocomplete="nope" placeholder="Immat."
              style="width:100%;border:1px solid #E2E8F0;border-radius:6px;padding:7px 10px;font-size:13px;box-sizing:border-box;">
          </div>
          <div style="grid-column:1/-1;">
            <label style="font-size:11px;color:#64748B;display:block;margin-bottom:3px;">Transporteur</label>
            <input id="bcb-enlev-drv-transport" type="text" autocomplete="nope" placeholder="Nom société transport"
              style="width:100%;border:1px solid #E2E8F0;border-radius:6px;padding:7px 10px;font-size:13px;box-sizing:border-box;">
          </div>
        </div>
        <button id="bcb-enlev-drv-save" onclick="App.bcbEnlevSaveDriver()"
          style="width:100%;background:#1D4ED8;color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">
          Enregistrer
        </button>
      </div>` : '';
    body.innerHTML = driverForm + `
      <div style="background:white;border:1px solid #E2E8F0;border-radius:10px;padding:4px 12px;margin-bottom:10px;">
        <table style="width:100%;border-collapse:collapse;">
          ${row('Chauffeur', e.chauffeur)} ${row('Tracteur', e.tracteur)} ${row('Remorque', e.remorque)}
          ${row('Destination', e.destination)}
          ${e.folderUrl ? `<tr><td style="padding:4px 8px;font-size:11px;color:#64748B;">Dossier Drive</td><td style="padding:4px 8px;"><a href="${e.folderUrl}" target="_blank" style="font-size:11px;color:#1D4ED8;">📁 Ouvrir</a></td></tr>` : ''}
          ${e.cmrNumero ? `<tr><td style="padding:4px 8px;font-size:11px;color:#64748B;">CMR</td><td style="padding:4px 8px;"><a href="${e.cmrUrl}" target="_blank" style="font-size:11px;color:#1D4ED8;">CMR ${e.cmrNumero}</a></td></tr>` : ''}
        </table>
      </div>
      <div style="overflow-x:auto;background:white;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:14px;">
        <table style="width:100%;border-collapse:collapse;min-width:700px;">
          <thead><tr>
            <th style="${thStyle}">#</th><th style="${thStyle}">Inter</th><th style="${thStyle}">ID BCB</th>
            <th style="${thStyle}">ID Seller</th><th style="${thStyle}">Description</th><th style="${thStyle}">Brand</th>
            <th style="${thStyle}">Model</th><th style="${thStyle}">VIN</th><th style="${thStyle}">Comment</th>
            <th style="${thStyle}">Selling date</th><th style="${thStyle}">Buyer</th><th style="${thStyle}">Poids t</th>
          </tr></thead>
          <tbody>${lotRows}</tbody>
        </table>
      </div>
      <div style="background:white;border:1px solid #E2E8F0;border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:12px;font-weight:700;color:#1E293B;">📷 Photos du chargement</div>
          <span id="bcb-enlev-photo-count" style="font-size:11px;color:#64748B;">${e.photosCount ? e.photosCount + ' photo' + (e.photosCount > 1 ? 's' : '') + ' envoyée' + (e.photosCount > 1 ? 's' : '') : 'Aucune photo'}</span>
        </div>
        <div class="photo-grid" id="bcb-enlev-photo-grid"></div>
        <input type="file" id="bcb-enlev-photo-input" accept="image/*" multiple capture="environment" style="display:none;" onchange="App.handlePhotos(event,'bcb-enlev')">
        <button id="bcb-enlev-upload-btn" onclick="App.bcbUploadPhotos()" style="display:none;margin-top:10px;width:100%;background:#0F766E;color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">
          Envoyer les photos
        </button>
      </div>`;
    this._bcbRenderEnlevPhotoGrid();
  },

  async bcbEnlevSaveDriver() {
    const e = S.bcbCurEnlevement;
    if (!e) return;
    const chauffeur    = document.getElementById('bcb-enlev-drv-chauffeur')?.value.trim();
    const tracteur     = document.getElementById('bcb-enlev-drv-tracteur')?.value.trim();
    const remorque     = document.getElementById('bcb-enlev-drv-remorque')?.value.trim();
    const transportNom = document.getElementById('bcb-enlev-drv-transport')?.value.trim();
    if (!chauffeur) { this.toast('Nom du chauffeur requis'); return; }
    const btn = document.getElementById('bcb-enlev-drv-save');
    if (btn) btn.textContent = '…';
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bcb_enlevement_update', numero: e.numero,
          chauffeur, tracteur, remorque, transportNom })
      }, 10000);
      const d = await r.json();
      if (d.status === 'ok') {
        Object.assign(e, { chauffeur, tracteur, remorque, transportNom });
        const idx = S.bcbEnlevements.findIndex(x => x.numero === e.numero);
        if (idx > -1) Object.assign(S.bcbEnlevements[idx], { chauffeur, tracteur, remorque, transportNom });
        this._bcbRenderEnlevDetail();
        this.toast('Infos chauffeur enregistrées');
      } else {
        if (btn) btn.textContent = 'Enregistrer';
        this.toast('Erreur : ' + (d.error || 'inconnue'));
      }
    } catch(err) {
      if (btn) btn.textContent = 'Enregistrer';
      this.toast('Erreur : ' + err.message);
    }
  },

  _bcbRenderEnlevPhotoGrid() {
    const grid      = document.getElementById('bcb-enlev-photo-grid');
    const uploadBtn = document.getElementById('bcb-enlev-upload-btn');
    if (!grid) return;
    grid.innerHTML = S.bcbEnlevPhotos.map((p, i) => `
      <div class="photo-thumb">
        <img src="${p.dataUrl}" loading="lazy">
        <button class="rm-btn" onclick="App.removePhoto(${i},'bcb-enlev')">✕</button>
      </div>`).join('') + `
      <div class="photo-add-btn" onclick="App.triggerInput('bcb-enlev-photo-input')">
        <span style="font-size:26px;">📷</span><span>Ajouter</span>
      </div>`;
    if (uploadBtn) uploadBtn.style.display = S.bcbEnlevPhotos.length > 0 ? '' : 'none';
  },

  async bcbUploadPhotos() {
    const e = S.bcbCurEnlevement;
    if (!e || !S.bcbEnlevPhotos.length) return;
    const btn = document.getElementById('bcb-enlev-upload-btn');
    if (btn) btn.textContent = 'Envoi…';
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bcb_enlevement_photo',
          numero: e.numero,
          photos: S.bcbEnlevPhotos.map(p => p.dataUrl)
        })
      }, 60000);
      const d = await r.json();
      if (d.status === 'ok') {
        e.photosCount = (e.photosCount || 0) + d.count;
        const idx = S.bcbEnlevements.findIndex(x => x.numero === e.numero);
        if (idx > -1) S.bcbEnlevements[idx].photosCount = e.photosCount;
        S.bcbEnlevPhotos = [];
        const countEl = document.getElementById('bcb-enlev-photo-count');
        if (countEl) countEl.textContent = e.photosCount + ' photo' + (e.photosCount > 1 ? 's' : '') + ' envoyée' + (e.photosCount > 1 ? 's' : '');
        const sub = document.getElementById('bcb-enlev-subtitle');
        if (sub) sub.innerHTML = e.date
          + (e.cmrNumero ? ' · CMR ' + e.cmrNumero : '')
          + ` · <span style="color:#0F766E;font-weight:700;">📷 ${e.photosCount} photo${e.photosCount>1?'s':''}</span>`;
        this._bcbRenderEnlevPhotoGrid();
        this.toast(d.count + ' photo' + (d.count > 1 ? 's' : '') + ' envoyée' + (d.count > 1 ? 's' : ''));
      } else {
        if (btn) btn.textContent = 'Envoyer les photos';
        this.toast('Erreur : ' + (d.error || 'inconnue'));
      }
    } catch(err) {
      if (btn) btn.textContent = 'Envoyer les photos';
      this.toast('Erreur : ' + err.message);
    }
  },

  bcbDeleteCurEnlevement() {
    const e = S.bcbCurEnlevement;
    if (!e) return;
    this.bcbDeleteEnlevement(e.numero).then(() => {
      if (!S.bcbCurEnlevement) this.go('bcb-enlevements');
    });
  },

  bcbPrintEnlevement() {
    const e = S.bcbCurEnlevement;
    if (!e) return;
    const doc = _generateBcbPicklist(e);
    doc.save(`Enlevement_${e.numero}.pdf`);
  },

  async bcbEnlevementCreateCmr() {
    const e = S.bcbCurEnlevement;
    if (!e) return;
    const list = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    const c    = list.find(x => [x.prenom, x.nom].filter(Boolean).join(' ') === e.chauffeur) || {};
    S.lvu.transporteur = { id: 'autre', nom: c.transportNom || '', adresse: c.transportAdresse || '', ville: c.transportVille || '' };
    S.lvu.marchandises = (e.lots || []).map(l => ({
      qte: '1',
      description: [l.idBcb, [l.marque, l.modele].filter(Boolean).join(' ') || l.type].filter(Boolean).join(' — '),
      poids: l.poids ? String(l.poids) : '',
      note: l.inter || '', ml: ''
    }));
    S.activity = 'lvu';
    await this.lvuInit();
    this.lvuSetType('CMR');
    this.lvuSetSource('bcb');
    this._lvuRenderMarchandises();
    // Stocker le n° d'enlèvement pour le passer à lv_save
    S.lvu.enlevementNumero = e.numero;
    const acheteur = (e.lots && e.lots.length > 0) ? (e.lots[0].acheteur || '') : '';
    setTimeout(() => {
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set('lvu-f-conducteur',   e.chauffeur   || '');
      set('lvu-f-immat-moteur', e.tracteur    || '');
      set('lvu-f-immat-semi',   e.remorque    || '');
      set('lvu-f-doc',          'Enl. ' + e.numero);
      set('lvu-f-donneur',      acheteur);
      set('lvu-f-exp-nom',      'BCB OFF MARKET');
      set('lvu-f-exp-adresse',  'ZA Renardières');
      set('lvu-f-exp-ville',    'JAVRON-LES-CHAPELLES');
      set('lvu-f-exp-pays',     'FR - France');
      const dest = e.destination || '';
      if (dest) set('lvu-f-dest-nom', dest);
    }, 100);
  },

  async bcbCreateEnlevement() {
    const list = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    const c    = S.bcbPrepMode ? {} : list[S.bcbDepartConsigne];
    if (!S.bcbPrepMode && !c) { this.toast('Sélectionnez un chauffeur.'); return; }
    const selectedLots = S.bcbLots.filter(l => S.bcbDepartSelected.has(l.idBcb));
    if (!selectedLots.length) { this.toast('Sélectionnez au moins un lot.'); return; }
    // Verrou anti double-appui : avant, 2-3 appuis rapprochés créaient autant de bons
    // pour les mêmes lots (ex. 3 « La Michaudière » dans la même minute, 2026-09-29).
    if (S._bcbCreating) { this.toast('Création déjà en cours, patientez…'); return; }
    S._bcbCreating = true;
    this.toast('Génération du bon d\'enlèvement…');
    try {
      // 1. Obtenir le numéro
      const rn = await _fetchWithTimeout(S.apiUrl + '?action=bcb_enlevement_next_number', {}, 10000);
      const dn = await rn.json();
      if (dn.status !== 'ok') throw new Error(dn.error || 'Numéro indisponible');
      const numero = dn.numero;
      const now    = new Date();
      const date   = now.toLocaleDateString('fr-FR');
      const chauffeur = [c.prenom, c.nom].filter(Boolean).join(' ');
      const clientName  = S.bcbDepartBuyer || c.client;
      const destination = [clientName, c.clientAdresse, c.clientVille, c.clientPays].filter(Boolean).join(' — ');
      // 2. Construire l'objet enlèvement
      const enlevement = {
        numero, date, chauffeur,
        tracteur:    c.tracteur  || '',
        remorque:    c.remorque  || '',
        destination,
        expediteur:  { nom:'BCB OFF MARKET', adresse:'ZA Renardières', ville:'53250 JAVRON-LES-CHAPELLES' },
        lots: selectedLots.map(l => ({
          idBcb: l.idBcb, inter: l.inter || '', idSeller: l.refVendeur || '',
          marque: l.marque || '', modele: l.modele || '', type: l.type || '',
          numSerie: l.numSerie || '', commentaire: l.commentaire || '',
          dateVente: l.dateVente || '', acheteur: l.acheteur || '',
          poids: l.poids || '', numVente: l.numVente || ''
        }))
      };
      // 3. Générer PDF
      const doc = _generateBcbPicklist(enlevement);
      const b64 = doc.output('datauristring').split(',')[1];
      // 4. Sauvegarder dans Drive
      const payload = {
        action: 'bcb_enlevement_save', numero, date, chauffeur,
        tracteur: enlevement.tracteur, remorque: enlevement.remorque,
        destination, lots: enlevement.lots, pdf_b64: b64
      };
      const rs = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 30000);
      const ds = await rs.json();
      if (ds.status !== 'ok') throw new Error(ds.error || 'Erreur sauvegarde');
      if (ds.avertissement) App.toast('⚠ Bon enregistré, mais ' + ds.avertissement + ' — prévenir Hugo');
      enlevement.pdfUrl    = ds.pdfUrl    || '';
      enlevement.folderUrl = ds.folderUrl || '';
      enlevement.cmrNumero = '';
      enlevement.cmrUrl    = '';
      // 5. Marquer les lots comme partis localement (disparaissent de la liste immédiatement)
      const departedIds = new Set(selectedLots.map(l => l.idBcb));
      S.bcbLots.forEach(l => { if (departedIds.has(l.idBcb)) l.parti = true; });
      S.bcbDepartSelected = new Set();
      // 6. Marquer la consigne chauffeur comme traitée
      const procCons = new Set(JSON.parse(localStorage.getItem('snt_bcb_processed_consignes') || '[]'));
      procCons.add(S.bcbDepartConsigne);
      localStorage.setItem('snt_bcb_processed_consignes', JSON.stringify([...procCons]));
      // 7. Afficher
      S.bcbCurEnlevement = enlevement;
      S.bcbEnlevements.unshift(enlevement);
      this._bcbRenderEnlevDetail();
      this.go('bcb-enlevement');
    } catch(err) {
      this.toast('Erreur : ' + err.message);
    } finally {
      S._bcbCreating = false;
    }
  },

  /* ─ BCB Départ ─ */
  bcbDepartInit() {
    S.bcbDepartConsigne = null;
    S.bcbDepartSelected = new Set();
    S.bcbDepartBuyer    = null;
    S.bcbPrepMode       = false;
    this._bcbDepRenderConsignes();
    this._bcbDepResetPrepBtn();
    const lotsSection = document.getElementById('bcb-dep-lots-section');
    const bar = document.getElementById('bcb-dep-bar');
    if (lotsSection) lotsSection.style.display = 'none';
    if (bar) bar.style.display = 'none';
    // Charger et afficher les chargements préparés
    if (S.bcbEnlevementsLoaded) {
      this._bcbRenderPreparedSection();
    } else if (!S.bcbEnlevementsLoading && S.apiUrl) {
      this.bcbEnlevementsLoad().then(() => this._bcbRenderPreparedSection());
    }
  },

  bcbStartPrepMode() {
    S.bcbPrepMode       = true;
    S.bcbDepartConsigne = null;
    S.bcbDepartSelected = new Set();
    S.bcbDepartBuyer    = null;
    this._bcbDepRenderConsignes();
    const btn = document.getElementById('bcb-prep-btn');
    if (btn) { btn.style.background = '#EFF6FF'; btn.style.borderColor = '#1D4ED8'; btn.style.color = '#1D4ED8'; }
    const lotsSection = document.getElementById('bcb-dep-lots-section');
    if (lotsSection) lotsSection.style.display = '';
    this._bcbDepRenderLots();
  },

  _bcbDepResetPrepBtn() {
    const btn = document.getElementById('bcb-prep-btn');
    if (btn) { btn.style.background = 'white'; btn.style.borderColor = '#E2E8F0'; btn.style.color = '#475569'; }
  },

  _bcbRenderPreparedSection() {
    const section = document.getElementById('bcb-dep-prepared-section');
    const list    = document.getElementById('bcb-dep-prepared-list');
    if (!section || !list) return;
    const prepared = S.bcbEnlevements.filter(e => !e.cmrNumero && e.statut !== 'parti');
    if (!prepared.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    list.innerHTML = prepared.map(e => {
      const hasChauffeur = !!e.chauffeur;
      const badgeTxt   = hasChauffeur ? 'En cours' : 'Préparé';
      const badgeBg    = hasChauffeur ? '#DBEAFE' : '#FEF9C3';
      const badgeColor = hasChauffeur ? '#1D4ED8' : '#92400E';
      return `<div style="background:white;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
        <div onclick="App.bcbGoToEnlevement('${e.numero}')" style="flex:1;cursor:pointer;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="font-size:13px;font-weight:700;color:#1E293B;">${e.numero}</span>
            <span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:${badgeBg};color:${badgeColor};">${badgeTxt}</span>
          </div>
          <div style="font-size:11px;color:#64748B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.date} · ${e.destination || '—'}</div>
        </div>
        <button onclick="App.bcbEnlevMarkParti('${e.numero}')" style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:600;color:#475569;cursor:pointer;white-space:nowrap;flex-shrink:0;">✓ Parti</button>
      </div>`;
    }).join('');
  },

  bcbGoToEnlevement(numero) {
    const e = S.bcbEnlevements.find(x => x.numero === numero);
    if (!e) return;
    S.bcbCurEnlevement = e;
    this._bcbRenderEnlevDetail();
    this.go('bcb-enlevement');
  },

  async bcbEnlevMarkParti(numero) {
    if (!confirm('Marquer cet enlèvement comme parti ?')) return;
    try {
      const r = await _fetchWithTimeout(S.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bcb_enlevement_update', numero, statut: 'parti' })
      }, 10000);
      const d = await r.json();
      if (d.status === 'ok') {
        const idx = S.bcbEnlevements.findIndex(x => x.numero === numero);
        if (idx > -1) S.bcbEnlevements[idx].statut = 'parti';
        this._bcbRenderPreparedSection();
        this.toast('Marqué comme parti');
      } else {
        this.toast('Erreur : ' + (d.error || 'inconnue'));
      }
    } catch(e) { this.toast('Erreur : ' + e.message); }
  },

  bcbDepartClear() {
    const procCons = new Set(JSON.parse(localStorage.getItem('snt_bcb_processed_consignes') || '[]'));
    if (procCons.size === 0) return;
    if (!confirm('Supprimer les consignes chauffeurs traités ?')) return;
    // Supprimer les consignes traitées de la liste (indices décroissants pour ne pas décaler)
    const list    = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    const indices = [...procCons].sort((a, b) => b - a);
    indices.forEach(i => { if (i >= 0 && i < list.length) list.splice(i, 1); });
    localStorage.setItem('snt_bcb_consignes', JSON.stringify(list));
    localStorage.removeItem('snt_bcb_processed_consignes');
    S.bcbDepartConsigne = null;
    S.bcbDepartSelected = new Set();
    S.bcbDepartBuyer    = null;
    S.bcbPrepMode       = false;
    const active   = document.getElementById('bcb-dep-buyer-active');
    const search   = document.getElementById('bcb-dep-buyer-search');
    const lotsSection = document.getElementById('bcb-dep-lots-section');
    const bar      = document.getElementById('bcb-dep-bar');
    const clearBtn = document.getElementById('bcb-dep-clear-btn');
    if (active)    active.style.display = 'none';
    if (search)    search.value = '';
    if (lotsSection) lotsSection.style.display = 'none';
    if (bar)       bar.style.display = 'none';
    if (clearBtn)  clearBtn.style.display = 'none';
    this._bcbDepResetPrepBtn();
    this._bcbDepRenderConsignes();
    this.toast(`${indices.length} consigne${indices.length > 1 ? 's' : ''} supprimée${indices.length > 1 ? 's' : ''}`);
  },

  _bcbDepRenderConsignes() {
    const container = document.getElementById('bcb-dep-consigne-picker');
    if (!container) return;
    const list = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    if (!list.length) {
      container.innerHTML = '<div style="padding:10px;text-align:center;color:#94A3B8;font-size:13px;">Aucune consigne enregistrée</div>';
      return;
    }
    const procCons = new Set(JSON.parse(localStorage.getItem('snt_bcb_processed_consignes') || '[]'));
    const clearBtn = document.getElementById('bcb-dep-clear-btn');
    if (clearBtn) clearBtn.style.display = procCons.size > 0 ? '' : 'none';
    container.innerHTML = list.map((c, i) => {
      const isSel  = S.bcbDepartConsigne === i;
      const isDone = procCons.has(i);
      const name   = [c.prenom, c.nom].filter(Boolean).join(' ') || 'Chauffeur';
      const truck  = [c.tracteur, c.remorque].filter(Boolean).join(' + ') || '—';
      const badge  = isDone ? `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;background:#DCFCE7;color:#16A34A;white-space:nowrap;">✓ Traité</span>` : '';
      const clientLine = c.client ? `<div style="font-size:12px;font-weight:600;color:#0F766E;margin-top:2px;">→ ${c.client}${c.clientVille ? ' · ' + c.clientVille : ''}</div>` : '';
      return `<div onclick="App.bcbDepSelectConsigne(${i})"
        style="background:${isSel?'#EFF6FF':isDone?'#F0FDF4':'white'};border:1px solid ${isSel?'#1D4ED8':isDone?'#86EFAC':'#E2E8F0'};border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer;display:flex;align-items:center;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#1E293B;">${name}</div>
          <div style="font-size:11px;color:#64748B;">${c.transportNom||'—'} · ${truck}</div>
          ${clientLine}
        </div>
        ${badge}
        <button onmousedown="event.stopPropagation();App.bcbDepDeleteConsigne(${i})"
          style="background:none;border:none;color:#CBD5E1;font-size:16px;cursor:pointer;padding:4px;flex-shrink:0;line-height:1;"
          title="Supprimer cette consigne"
          onmouseenter="this.style.color='#EF4444'" onmouseleave="this.style.color='#CBD5E1'">✕</button>
      </div>`;
    }).join('');
  },
  bcbDepDeleteConsigne(idx) {
    const list = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    const c = list[idx];
    const name = c ? ([c.prenom, c.nom].filter(Boolean).join(' ') || 'cette consigne') : 'cette consigne';
    if (!confirm(`Supprimer la consigne de ${name} ?`)) return;
    list.splice(idx, 1);
    localStorage.setItem('snt_bcb_consignes', JSON.stringify(list));
    // Adjust processed indices: remove idx, decrement all > idx
    const procCons = new Set(JSON.parse(localStorage.getItem('snt_bcb_processed_consignes') || '[]'));
    procCons.delete(idx);
    const adjusted = new Set([...procCons].map(i => i > idx ? i - 1 : i));
    localStorage.setItem('snt_bcb_processed_consignes', JSON.stringify([...adjusted]));
    // Reset selection if deleted entry was selected
    if (S.bcbDepartConsigne === idx) {
      S.bcbDepartConsigne = null;
      S.bcbDepartSelected = new Set();
      const lotsSection = document.getElementById('bcb-dep-lots-section');
      const bar = document.getElementById('bcb-dep-bar');
      if (lotsSection) lotsSection.style.display = 'none';
      if (bar) bar.style.display = 'none';
    } else if (S.bcbDepartConsigne > idx) {
      S.bcbDepartConsigne--;
    }
    this._bcbDepRenderConsignes();
  },

  bcbDepSelectConsigne(idx) {
    S.bcbDepartConsigne = idx;
    S.bcbDepartSelected = new Set();
    S.bcbDepartBuyer    = null;
    S.bcbPrepMode       = false;
    this._bcbDepResetPrepBtn();
    this._bcbDepRenderConsignes();
    const lotsSection = document.getElementById('bcb-dep-lots-section');
    if (lotsSection) lotsSection.style.display = '';
    // Pré-remplir la recherche acheteur avec le client de la consigne
    const list = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    const c = list[idx];
    const searchEl = document.getElementById('bcb-dep-buyer-search');
    if (searchEl) {
      searchEl.value = c?.client || '';
      if (c?.client) this.bcbDepBuyerSearch(c.client);
    }
    this._bcbDepRenderLots();
  },

  bcbDepBuyerSearch(val) {
    const q   = val.trim().toLowerCase();
    const res = document.getElementById('bcb-dep-buyer-results');
    if (!res) return;
    if (!q) { res.style.display = 'none'; res.innerHTML = ''; return; }
    // Acheteurs uniques des lots non partis
    const buyers = [...new Set(
      S.bcbLots.filter(l => !l.parti && l.acheteur).map(l => l.acheteur)
    )].filter(b => b.toLowerCase().includes(q)).slice(0, 8);
    if (!buyers.length) {
      res.innerHTML = '<div style="padding:10px 12px;color:#94A3B8;font-size:12px;">Aucun acheteur trouvé</div>';
      res.style.display = 'block';
      return;
    }
    res.innerHTML = buyers.map(b => {
      const count = S.bcbLots.filter(l => !l.parti && l.acheteur === b).length;
      return `<div class="dest-result-row" onclick="App.bcbDepBuyerSelect('${b.replace(/'/g,"\\'")}')">
        <span style="font-size:13px;color:#1E293B;flex:1;">${b}</span>
        <span style="font-size:11px;color:#64748B;">${count} lot${count>1?'s':''}</span>
      </div>`;
    }).join('');
    res.style.display = 'block';
  },

  bcbDepBuyerSelect(buyer) {
    S.bcbDepartBuyer = buyer;
    const res = document.getElementById('bcb-dep-buyer-results');
    const inp = document.getElementById('bcb-dep-buyer-search');
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
    if (inp) inp.value = '';
    const active = document.getElementById('bcb-dep-buyer-active');
    const name   = document.getElementById('bcb-dep-buyer-name');
    if (name)   name.textContent = buyer;
    if (active) active.style.display = 'flex';
    this._bcbDepRenderLots();
  },

  bcbDepBuyerClear() {
    S.bcbDepartBuyer = null;
    const active = document.getElementById('bcb-dep-buyer-active');
    if (active) active.style.display = 'none';
    this._bcbDepRenderLots();
  },

  _bcbDepRenderLots() {
    const lotsSection = document.getElementById('bcb-dep-lots-section');
    const lotsList    = document.getElementById('bcb-dep-lots-list');
    if (!lotsSection || !lotsList) return;
    lotsSection.style.display = '';
    const all  = S.bcbLots.filter(l => !l.parti);
    const lots = S.bcbDepartBuyer
      ? all.filter(l => l.acheteur === S.bcbDepartBuyer)
      : all;
    // Group by buyer
    const groups = {};
    lots.forEach(l => {
      const key = l.acheteur || '(sans acheteur)';
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    });
    let html = '';
    for (const buyer of Object.keys(groups).sort()) {
      html += `<div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${buyer}</div>`;
      groups[buyer].forEach(lot => {
        const key   = lot.idBcb;
        const isSel = S.bcbDepartSelected.has(key);
        const cb    = `<div data-dep-cb style="width:18px;height:18px;border-radius:5px;border:2px solid ${isSel?'#1D4ED8':'#CBD5E1'};background:${isSel?'#1D4ED8':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:white;">${isSel?'✓':''}</div>`;
        const dotV  = `<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:${lot.vendu?'#FEF9C3':'#F1F5F9'};color:${lot.vendu?'#92400E':'#94A3B8'};">V</span>`;
        const desc  = [lot.marque, lot.modele].filter(Boolean).join(' ') || lot.type || '—';
        html += `<div onclick="App.bcbDepartToggleLot('${key}')" data-dep-lot="${key}"
          style="background:${isSel?'#EFF6FF':'white'};border:1px solid ${isSel?'#93C5FD':'#E2E8F0'};border-radius:8px;padding:8px 10px;margin-bottom:4px;cursor:pointer;display:flex;align-items:center;gap:8px;">
          ${cb}
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:700;color:#1E293B;">${lot.idBcb}</div>
            <div style="font-size:11px;color:#64748B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${desc}${lot.inter?' · '+lot.inter:''}</div>
          </div>
          <div style="display:flex;gap:3px;align-items:center;">${dotV}${lot.numVente?`<span style="font-size:10px;color:#64748B;margin-left:2px;">${lot.numVente}</span>`:''}</div>
        </div>`;
      });
      html += `</div>`;
    }
    if (!html) html = '<div style="padding:16px;text-align:center;color:#94A3B8;font-size:13px;">Aucun lot disponible</div>';
    lotsList.innerHTML = html;
    this._bcbDepUpdateBar();
  },

  bcbDepartToggleLot(key) {
    if (S.bcbDepartSelected.has(key)) {
      S.bcbDepartSelected.delete(key);
    } else {
      S.bcbDepartSelected.add(key);
    }
    const isSel = S.bcbDepartSelected.has(key);
    const row   = document.querySelector(`[data-dep-lot="${key}"]`);
    if (row) {
      row.style.background  = isSel ? '#EFF6FF' : 'white';
      row.style.borderColor = isSel ? '#93C5FD' : '#E2E8F0';
      const cbEl = row.querySelector('[data-dep-cb]');
      if (cbEl) {
        cbEl.style.borderColor = isSel ? '#1D4ED8' : '#CBD5E1';
        cbEl.style.background  = isSel ? '#1D4ED8' : 'white';
        cbEl.textContent       = isSel ? '✓' : '';
      }
    }
    this._bcbDepUpdateBar();
  },

  _bcbDepUpdateBar() {
    const bar = document.getElementById('bcb-dep-bar');
    const cnt = document.getElementById('bcb-dep-count');
    const n   = S.bcbDepartSelected.size;
    if (cnt) cnt.textContent = n ? `${n} lot${n>1?'s':''} sélectionné${n>1?'s':''}` : '0 lot sélectionné';
    if (bar) bar.style.display = ((S.bcbDepartConsigne !== null || S.bcbPrepMode) && n > 0) ? 'flex' : 'none';
  },

  async bcbDepartCreateCmr() {
    const list = JSON.parse(localStorage.getItem('snt_bcb_consignes') || '[]');
    const c    = list[S.bcbDepartConsigne];
    if (!c) return;
    const selectedLots = S.bcbLots.filter(l => S.bcbDepartSelected.has(l.idBcb));
    if (!selectedLots.length) { this.toast('Sélectionnez au moins un lot.'); return; }
    S.lvu.transporteur = { id: 'autre', nom: c.transportNom || '', adresse: c.transportAdresse || '', ville: c.transportVille || '' };
    S.lvu.marchandises = selectedLots.map(l => ({
      qte: '1',
      description: [l.idBcb, [l.marque, l.modele].filter(Boolean).join(' ') || l.type].filter(Boolean).join(' — '),
      poids: l.poids ? String(l.poids) : '',
      note: l.inter || '',
      ml: ''
    }));
    S.activity = 'lvu';
    await this.lvuInit();
    this.lvuSetType('CMR');
    this.lvuSetSource('bcb');
    this._lvuRenderMarchandises();
    setTimeout(() => {
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set('lvu-f-conducteur',   [c.prenom, c.nom].filter(Boolean).join(' '));
      set('lvu-f-immat-moteur', c.tracteur  || '');
      set('lvu-f-immat-semi',   c.remorque  || '');
      set('lvu-f-donneur',      c.client    || '');
      set('lvu-f-exp-nom',      'BCB OFF MARKET');
      set('lvu-f-exp-adresse',  'ZA Renardières');
      set('lvu-f-exp-ville',    'JAVRON-LES-CHAPELLES');
      set('lvu-f-exp-pays',     'FR - France');
      if (c.client)        set('lvu-f-dest-nom',     c.client);
      if (c.clientAdresse) set('lvu-f-dest-adresse', c.clientAdresse);
      if (c.clientPays)    set('lvu-f-dest-pays',    c.clientPays);
    }, 100);
  },
});


// ── BCB — Bon d'enlèvement / Pick-list (jsPDF, paysage A4) ───────────────────
// enlevement = { numero, date, chauffeur, tracteur, remorque, destination,
//   expediteur:{nom,adresse,ville}, lots:[{idBcb,inter,idSeller,marque,modele,
//   numSerie,commentaire,dateVente,acheteur,poids}] }
function _generateBcbPicklist(enlevement) {
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ unit:'mm', format:'a4', orientation:'landscape' });
  const W    = 297; const H = 210;
  const ML   = 10;  const MR = 10; const MT = 10;
  const CW   = W - ML - MR; // 277mm
  // Colonnes : #, Inter, ID BCB, ID Seller, Brand, Model, VIN, Comment, Selling date, Buyer, Poids t
  const COLS = [
    { h:'#',           w: 8  },
    { h:'Inter',       w: 18 },
    { h:'ID BCB',      w: 18 },
    { h:'ID Seller',   w: 22 },
    { h:'Brand',       w: 20 },
    { h:'Model',       w: 22 },
    { h:'VIN',         w: 30 },
    { h:'Comment',     w: 28 },
    { h:'Selling date',w: 20 },
    { h:'Buyer',       w: 43 },
    { h:'Poids t',     w: 14 },
  ]; // total = 243mm, reste 34mm pour padding — on ajuste Description
  let y = MT;

  // ── En-tête ──────────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59); doc.rect(ML, y, CW, 12, 'F');
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('BCB OFF MARKET — BON D\'ENLÈVEMENT', ML + 4, y + 8);
  doc.setFontSize(11);
  doc.text('N° ' + enlevement.numero, W - MR - 4, y + 5, { align:'right' });
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(enlevement.date || '', W - MR - 4, y + 9.5, { align:'right' });
  doc.setTextColor(0,0,0);
  y += 19;

  // ── Bloc chargement / transport ──────────────────────────────────────────
  doc.setFontSize(8.5); doc.setFont('helvetica','bold');
  doc.text('Lieu de chargement :', ML, y);
  doc.setFont('helvetica','normal');
  doc.text('ZA Renardières — 53250 JAVRON-LES-CHAPELLES', ML + 34, y);
  doc.setFont('helvetica','bold');
  doc.text('Chauffeur :', W/2 + 2, y);
  doc.setFont('helvetica','normal');
  doc.text(enlevement.chauffeur || '—', W/2 + 22, y);
  y += 5;

  doc.setFont('helvetica','bold'); doc.text('Tracteur :', ML, y);
  doc.setFont('helvetica','normal'); doc.text(enlevement.tracteur || '—', ML + 18, y);
  doc.setFont('helvetica','bold'); doc.text('Semi-remorque :', ML + 55, y);
  doc.setFont('helvetica','normal'); doc.text(enlevement.remorque || '—', ML + 83, y);
  doc.setFont('helvetica','bold'); doc.text('Destination :', W/2 + 2, y);
  doc.setFont('helvetica','normal');
  doc.text(enlevement.destination || '—', W/2 + 24, y, { maxWidth: W/2 - MR - 26 });
  y += 8;

  // ── Ligne séparatrice ────────────────────────────────────────────────────
  doc.setDrawColor(226,232,240); doc.line(ML, y, W - MR, y); y += 3;

  // ── En-tête tableau ──────────────────────────────────────────────────────
  let x = ML;
  doc.setFillColor(30, 41, 59);
  doc.rect(ML, y, CW, 6.5, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  COLS.forEach(col => {
    doc.text(col.h, x + 1, y + 4.5); x += col.w;
  });
  doc.setTextColor(0,0,0); doc.setFont('helvetica','normal');
  y += 6.5;

  // ── Lignes tableau ───────────────────────────────────────────────────────
  const ROW_H = 6;
  (enlevement.lots || []).forEach((lot, idx) => {
    if (y + ROW_H > H - 55) { doc.addPage(); y = MT; }
    if (idx % 2 === 0) { doc.setFillColor(248,250,252); doc.rect(ML, y, CW, ROW_H, 'F'); }
    doc.setFontSize(7.5); doc.setFont('helvetica','normal');
    x = ML;
    const vals = [
      String(idx + 1), lot.inter||'', lot.idBcb||'', lot.idSeller||'',
      lot.marque||'', lot.modele||'', lot.numSerie||'', lot.commentaire||'',
      lot.dateVente||'', lot.acheteur||'', lot.poids ? String(lot.poids) : ''
    ];
    COLS.forEach((col, ci) => {
      const txt = String(vals[ci] || '');
      doc.text(txt.length > Math.floor(col.w / 1.9) ? txt.slice(0, Math.floor(col.w / 1.9)) + '…' : txt, x + 1, y + 4.3);
      x += col.w;
    });
    doc.setDrawColor(226,232,240); doc.line(ML, y + ROW_H, W - MR, y + ROW_H);
    y += ROW_H;
  });

  // ── Ligne total ──────────────────────────────────────────────────────────
  const totalLots  = (enlevement.lots || []).length;
  const totalPoids = (enlevement.lots || []).reduce((sum, l) => {
    const p = parseFloat(String(l.poids || '').replace(',', '.'));
    return sum + (isNaN(p) ? 0 : p);
  }, 0);
  doc.setFillColor(30, 41, 59); doc.rect(ML, y, CW, 6, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('TOTAL : ' + totalLots + ' lot' + (totalLots > 1 ? 's' : ''), ML + 2, y + 4.2);
  if (totalPoids > 0) {
    doc.text(totalPoids.toFixed(3).replace('.', ',') + ' t', W - MR - 2, y + 4.2, { align:'right' });
  }
  doc.setTextColor(0,0,0);

  // ── Zone signature (ancrée en bas de page) ───────────────────────────────
  const sigY = H - 38;
  doc.setDrawColor(180,180,180);
  doc.setFontSize(8); doc.setFont('helvetica','bold');
  doc.text('Signature chauffeur :', ML, sigY);
  doc.rect(ML, sigY + 2, 70, 16);
  doc.text('Signature émetteur / BCB OFF MARKET :', W/2 - 10, sigY);
  doc.rect(W/2 - 10, sigY + 2, 90, 16);
  // Cachet BCB dans la case émetteur
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(30, 41, 59);
  doc.text('BCB OFF MARKET', W/2 - 10 + 45, sigY + 8, { align:'center' });
  doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(100,116,139);
  doc.text('ZA Renardières · 53250 JAVRON-LES-CHAPELLES', W/2 - 10 + 45, sigY + 13, { align:'center' });
  doc.setTextColor(0,0,0);
  // Pied de page
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('BCB OFF MARKET · ZA Renardières · 53250 JAVRON-LES-CHAPELLES', W/2, H - 4, { align:'center' });

  return doc;
}
