// Annuaire (destinations LV/CMR).
// Méthodes ajoutées à App (défini dans app.js, chargé avant) : contenu déplacé tel quel
// depuis l'ancien index.html unique (découpage du 2026-10-26).
Object.assign(App, {

  /* ─ Annuaire ─ */

  async annuaireLoad(force = false) {
    if (!force && S.annuaireLoaded) { this.annuaireRender(); return; }
    if (!S.apiUrl) return;
    const loadEl = document.getElementById('ann-loading');
    if (loadEl) loadEl.style.display = 'block';
    document.getElementById('ann-list').innerHTML = '';
    try {
      const r    = await _fetchWithTimeout(S.apiUrl + '?action=lv_agencies', {}, 10000);
      const data = await r.json();
      if (data.status === 'ok') {
        S.annuaireData  = data.agencies || [];
        S.lvu.agencies  = S.annuaireData; // sync avec le pool LVU
        S.annuaireLoaded = true;
      }
    } catch(e) { this.toast('Erreur chargement annuaire'); }
    if (loadEl) loadEl.style.display = 'none';
    this.annuaireRender();
  },

  annuaireRender() {
    const list = document.getElementById('ann-list');
    if (!list) return;
    const q = (document.getElementById('ann-search')?.value || '').trim().toLowerCase();
    let items = S.annuaireData;
    if (q) items = items.filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.nom.toLowerCase().includes(q)  ||
      a.ville.toLowerCase().includes(q) ||
      a.cp.includes(q)
    );
    if (!items.length) {
      list.innerHTML = `<div style="text-align:center;padding:40px 0;color:#94A3B8;font-size:13px;">
        ${S.annuaireData.length ? 'Aucune agence ne correspond.' : 'Annuaire vide — ajoutez une première agence.'}</div>`;
      return;
    }
    list.innerHTML = items.map(a => {
      const codeEsc  = encodeURIComponent(a.code);
      const isLoxam  = a.source === 'loxam';
      const srcBadge = isLoxam
        ? `<span class="ann-src-loxam">LOXAM</span>`
        : `<span class="ann-src-custom">Personnalisé</span>`;
      const delBtn = isLoxam
        ? `<button class="ann-btn-del" style="opacity:.4" onclick="App.toast('Les agences LOXAM ne peuvent pas être supprimées. Modifiez-les pour créer une entrée personnalisée.')">🗑 Supprimer</button>`
        : `<button class="ann-btn-del" onclick="App.annuaireDelete('${codeEsc}')">🗑 Supprimer</button>`;
      return `<div class="ann-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="ann-code">${a.code}</span>
          <span class="ann-nom">${a.nom}</span>
          ${srcBadge}
        </div>
        ${a.adresse || a.ville || a.pays ? `<div class="ann-meta">${[a.adresse, [a.cp, a.ville].filter(Boolean).join(' '), (a.pays && a.pays.toLowerCase()!=='france' ? a.pays : '')].filter(x=>x&&x.trim()).join(' · ')}</div>` : ''}
        ${(a.email || a.tel) ? `<div class="ann-contact">
          ${a.email ? `<span>✉ ${a.email}</span>` : ''}
          ${a.tel   ? `<span>📞 ${a.tel}</span>`   : ''}
        </div>` : ''}
        ${a.note ? `<div class="ann-note">${a.note}</div>` : ''}
        <div class="ann-actions">
          <button class="ann-btn-edit" onclick="App.annuaireOpenModal('${codeEsc}')">✏️ Modifier</button>
          ${delBtn}
        </div>
      </div>`;
    }).join('');
  },

  annuaireOpenModal(encodedCode) {
    const modal = document.getElementById('ann-modal');
    const title = document.getElementById('ann-modal-title');
    const orig  = document.getElementById('ann-f-orig-code');
    if (!modal) return;
    const fields = { code:'', nom:'', adresse:'', cp:'', ville:'', pays:'FR - France', email:'', tel:'', note:'' };
    if (encodedCode) {
      const code = decodeURIComponent(encodedCode);
      const a    = S.annuaireData.find(x => x.code === code);
      if (a) Object.assign(fields, a);
      if (!fields.pays) fields.pays = 'FR - France';
      if (title) title.textContent = 'Modifier l\'agence';
    } else {
      if (title) title.textContent = 'Nouvelle agence';
    }
    ['code','nom','adresse','cp','ville','pays','email','tel'].forEach(f => {
      const el = document.getElementById('ann-f-' + f);
      if (el) el.value = fields[f];
    });
    const noteEl = document.getElementById('ann-f-note');
    if (noteEl) noteEl.value = fields.note;
    if (orig) orig.value = fields.code;
    modal.style.display = 'flex';
  },

  annuaireCloseModal() {
    const modal = document.getElementById('ann-modal');
    if (modal) modal.style.display = 'none';
    this.annGeoHideSugg();
  },

  annGeoHideSugg() {
    const s1 = document.getElementById('ann-cp-sugg');
    const s2 = document.getElementById('ann-ville-sugg');
    if (s1) s1.style.display = 'none';
    if (s2) s2.style.display = 'none';
  },

  annGeoApply(cp, ville) {
    const cpEl    = document.getElementById('ann-f-cp');
    const villeEl = document.getElementById('ann-f-ville');
    if (cpEl)    cpEl.value    = cp;
    if (villeEl) villeEl.value = ville;
    this.annGeoHideSugg();
  },

  _isFrance() {
    const p = (document.getElementById('ann-f-pays')?.value || '').toLowerCase().trim();
    return p.startsWith('fr') || p === 'france';
  },

  annPaysNormalize(fieldId = 'ann-f-pays') {
    const el = document.getElementById(fieldId || 'ann-f-pays');
    if (!el || !el.value.trim()) return;
    const q       = el.value.trim().toLowerCase();
    const options = [...document.querySelectorAll('#ann-pays-list option')].map(o => o.value);
    if (options.some(o => o.toLowerCase() === q)) return;
    const match = options.find(o => o.toLowerCase().startsWith(q))
               || options.find(o => o.toLowerCase().includes(q));
    if (match) el.value = match;
  },

  annGeoCp(val) {
    const sugg = document.getElementById('ann-cp-sugg');
    if (!sugg) return;
    if (!this._isFrance() || !/^\d{5}$/.test(val.trim())) { sugg.style.display = 'none'; return; }
    clearTimeout(this._annGeoTimer);
    this._annGeoTimer = setTimeout(async () => {
      try {
        const r    = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${val.trim()}&fields=nom&limit=6`);
        const data = await r.json();
        if (!data.length) { sugg.style.display = 'none'; return; }
        sugg.innerHTML = data.map(c =>
          `<div class="ann-geo-row" onclick="App.annGeoApply('${val.trim()}','${c.nom.replace(/'/g,"\\'")}')">📍 ${c.nom}</div>`
        ).join('');
        sugg.style.display = 'block';
      } catch(e) { sugg.style.display = 'none'; }
    }, 250);
  },

  annGeoVille(val) {
    const sugg = document.getElementById('ann-ville-sugg');
    if (!sugg) return;
    if (!this._isFrance() || val.trim().length < 3) { sugg.style.display = 'none'; return; }
    clearTimeout(this._annGeoTimer);
    this._annGeoTimer = setTimeout(async () => {
      try {
        const r    = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(val.trim())}&fields=codesPostaux&boost=population&limit=6`);
        const data = await r.json();
        if (!data.length) { sugg.style.display = 'none'; return; }
        sugg.innerHTML = data.map(c => {
          const cp = (c.codesPostaux || [])[0] || '';
          return `<div class="ann-geo-row" onclick="App.annGeoApply('${cp}','${c.nom.replace(/'/g,"\\'")}')">📍 ${cp} — ${c.nom}</div>`;
        }).join('');
        sugg.style.display = 'block';
      } catch(e) { sugg.style.display = 'none'; }
    }, 400);
  },

  async annuaireSave() {
    const v = id => document.getElementById(id)?.value.trim() || '';
    const origCode = document.getElementById('ann-f-orig-code')?.value || '';
    const payload = {
      action:   'save_agency',
      code:     v('ann-f-code'),
      nom:      v('ann-f-nom'),
      adresse:  v('ann-f-adresse'),
      cp:       v('ann-f-cp'),
      ville:    v('ann-f-ville'),
      pays:     v('ann-f-pays') || 'France',
      email:    v('ann-f-email'),
      tel:      v('ann-f-tel'),
      note:     document.getElementById('ann-f-note')?.value.trim() || '',
    };
    if (!payload.code || !payload.nom) { this.toast('Code et nom obligatoires'); return; }
    // Vérifier doublon de code uniquement à la création
    if (!origCode && S.annuaireData.some(a => a.code === payload.code)) {
      this.toast('⛔ Ce code existe déjà dans l\'annuaire');
      return;
    }
    if (!S.apiUrl) return;
    try {
      const r   = await _fetchWithTimeout(S.apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }, 15000);
      const res = await r.json();
      if (res.status === 'ok') {
        // Mise à jour locale
        const savedCode = origCode || payload.code;
        const idx = S.annuaireData.findIndex(a => a.code === savedCode);
        const entry = { code:payload.code, nom:payload.nom, adresse:payload.adresse, cp:payload.cp, ville:payload.ville, pays:payload.pays, email:payload.email, tel:payload.tel, note:payload.note, source:'custom' };
        if (idx > -1) S.annuaireData[idx] = entry; else S.annuaireData.push(entry);
        S.annuaireData.sort((a,b) => a.code.localeCompare(b.code));
        S.lvu.agencies = S.annuaireData;
        this.annuaireCloseModal();
        this.annuaireRender();
        this.toast('✓ Agence enregistrée');
      } else { this.toast('Erreur : ' + (res.error || 'inconnue')); }
    } catch(e) { this.toast('Erreur réseau : ' + e.message); }
  },

  async annuaireDelete(encodedCode) {
    const code = decodeURIComponent(encodedCode);
    const a    = S.annuaireData.find(x => x.code === code);
    if (!a) return;
    if (!confirm(`Supprimer "${a.nom}" (${a.code}) ?`)) return;
    if (!S.apiUrl) return;
    try {
      const r   = await _fetchWithTimeout(S.apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'delete_agency', code }) }, 15000);
      const res = await r.json();
      if (res.status === 'ok') {
        S.annuaireData = S.annuaireData.filter(x => x.code !== code);
        S.lvu.agencies = S.annuaireData;
        this.annuaireRender();
        this.toast('✓ Agence supprimée');
      } else { this.toast('Erreur : ' + (res.error || 'inconnue')); }
    } catch(e) { this.toast('Erreur réseau : ' + e.message); }
  },
});
