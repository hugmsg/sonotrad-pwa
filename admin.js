// Administration (utilisateurs PWA, comptes RH) et réglages / diagnostic.
// Méthodes ajoutées à App (défini dans app.js, chargé avant) : contenu déplacé tel quel
// depuis l'ancien index.html unique (découpage du 2026-10-26).
Object.assign(App, {

  /* ─ Admin ─ */

  goAdmin() {
    S.view = 'admin'; S.activity = 'admin'; S.prevView = 'home';
    this._render();
    this.loadAdminUsers();
    this._subscribeEmployesChanges();
  },

  // Écoute les changements de la table Supabase `employes` (rh-metal) pour
  // rafraîchir la liste "salariés RH sans accès" sans reload manuel. Canal
  // public au payload minimal {op,id} (voir migration employes_broadcast_change) —
  // jamais de pin_hash/nfc_uid sur ce canal.
  _subscribeEmployesChanges() {
    if (S._employesChannel || !window.SupabaseDB) return;
    S._employesChannel = window.SupabaseDB.channel('employes-changes')
      .on('broadcast', { event: 'employes_changed' }, () => {
        if (S.view === 'admin') this.loadAdminUsers();
      })
      .subscribe();
  },

  _normalizeName(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  async loadAdminUsers() {
    if (!S.apiUrl) return;
    // Plusieurs chargements peuvent se chevaucher (action admin + broadcast employes_changed) :
    // seul le plus récent a le droit d'afficher son résultat, ou son erreur.
    const seq = S._adminUsersSeq = (S._adminUsersSeq || 0) + 1;
    const loading = document.getElementById('admin-loading');
    const list    = document.getElementById('admin-user-list');
    if (loading) loading.style.display = 'block';
    if (list)    list.innerHTML = '';
    try {
      // users_list renvoie aussi l'annuaire minimal (id, nom, prénom, poste, a_fiche_rh), lu par
      // Apps Script avec la clé secrète — la fiche RH complète reste réservée aux admins rh-metal.
      const gasData = await _fetchWithTimeout(S.apiUrl + '?action=users_list', {}, 45000).then(r => r.json());
      if (seq !== S._adminUsersSeq) return;
      if (gasData.status === 'ok') {
        const users = gasData.users || [];
        this._renderAdminUsers(users);
        this._renderRhUnlinked(gasData.employes || [], users);
      } else if (list) {
        list.innerHTML = `<div class="card" style="border-left:4px solid #F87171;"><p style="color:#991B1B;">${gasData.error || 'Erreur'}</p></div>`;
      }
    } catch(e) {
      if (seq !== S._adminUsersSeq) return;
      if (list) list.innerHTML = `<div class="card" style="border-left:4px solid #F87171;"><p style="color:#991B1B;">Erreur réseau : ${e.message}</p></div>`;
    } finally {
      if (loading && seq === S._adminUsersSeq) loading.style.display = 'none';
    }
  },

  _renderRhUnlinked(employes, gasUsers) {
    const box  = document.getElementById('admin-rh-unlinked');
    const list = document.getElementById('admin-rh-unlinked-list');
    if (!box || !list) return;
    const linkedIds   = new Set(gasUsers.map(u => u.employeId).filter(Boolean));
    const linkedNames = new Set(gasUsers.map(u => this._normalizeName(u.prenom) + '|' + this._normalizeName(u.nom)));
    const unlinked = (employes || []).filter(e => {
      if (linkedIds.has(e.id)) return false;
      const key = this._normalizeName(e.prenom) + '|' + this._normalizeName(e.nom);
      return !linkedNames.has(key);
    });
    if (!unlinked.length) { box.style.display = 'none'; list.innerHTML = ''; return; }
    box.style.display = 'block';
    list.innerHTML = unlinked.map(e => `
      <div class="card" style="margin-bottom:8px;display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;border-radius:50%;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">👤</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:#1E293B;">${e.prenom} ${e.nom}</div>
          <div style="font-size:12px;color:#64748B;">${e.poste || 'Fiche RH'} — pas de compte sonotrad-pwa</div>
        </div>
        <button onclick="App._activateAccessFor('${e.id}','${String(e.prenom||'').replace(/'/g,"\\'")}','${String(e.nom||'').replace(/'/g,"\\'")}')"
          style="background:var(--brand);color:white;border:none;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;">
          Activer l'accès
        </button>
      </div>`).join('');
  },

  _activateAccessFor(employeId, prenom, nom) {
    this._showCreateUserForm();
    S._pendingEmployeId = employeId;
    const pEl = document.getElementById('nu-prenom');
    const nEl = document.getElementById('nu-nom');
    if (pEl) { pEl.value = prenom; pEl.readOnly = true; }
    if (nEl) { nEl.value = nom;    nEl.readOnly = true; }
    const badge = document.getElementById('nu-linked-badge');
    if (badge) badge.style.display = 'block';
  },

  _escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  },

  /** Compte de la liste admin (par id) — pour les messages. */
  _adminUser(id) {
    return (S.adminUsers || []).find(u => u.id === id) || { prenom: '', nom: '' };
  },

  /** Envoie une action admin sur un compte ; recharge la liste dans tous les cas. */
  async _adminAction(payload, messageOk) {
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));
      const resp = await _fetchWithTimeout(S.apiUrl, { method:'POST', body:fd }, 30000);
      const data = await resp.json();
      if (data.status === 'ok') { this.toast(messageOk); return true; }
      this.toast('Erreur : ' + (data.error || 'inconnue'));
      return false;
    } catch(e) {
      this.toast('Erreur réseau : ' + e.message);
      return false;
    } finally {
      this.loadAdminUsers();
    }
  },

  _renderAdminUsers(users) {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    S.adminUsers = users;
    if (!users.length) {
      list.innerHTML = '<div class="card" style="text-align:center;color:#94A3B8;padding:32px 0;">Aucun utilisateur</div>';
      return;
    }
    const e = s => this._escHtml(s);
    list.innerHTML = users.map(u => {
      const actif    = u.actif && u.present !== false;
      const badgeBg  = actif ? '#D1FAE5' : '#FEE2E2';
      const badgeCol = actif ? '#065F46'  : '#991B1B';
      const badgeTxt = !u.actif ? 'Inactif' : (u.present === false ? 'Contrat terminé' : 'Actif');
      const pinBadge = u.hasPIN
        ? '<span style="font-size:10px;background:#EFF6FF;color:#1D4ED8;padding:2px 6px;border-radius:10px;font-weight:600;">🔑 PIN défini</span>'
        : '<span style="font-size:10px;background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:10px;font-weight:600;">⚠ Pas de PIN</span>';
      const bloque = u.bloqueJusqua && new Date(u.bloqueJusqua) > new Date();
      const blocage = bloque
        ? `<div style="margin-bottom:8px;padding:8px 10px;background:#FEF2F2;border:1.5px solid #FECACA;border-radius:8px;display:flex;align-items:center;gap:8px;">
             <span style="flex:1;font-size:12px;color:#991B1B;font-weight:600;">🔒 Connexion bloquée jusqu'à ${new Date(u.bloqueJusqua).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })} (${u.echecsJour} erreur${u.echecsJour > 1 ? 's' : ''} aujourd'hui)</span>
             <button onclick="App._unlockUser('${u.id}')" style="background:#991B1B;color:white;border:none;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Débloquer</button>
           </div>`
        : (u.echecsJour ? `<div style="margin-bottom:8px;font-size:11px;color:#92400E;">${u.echecsJour} erreur${u.echecsJour > 1 ? 's' : ''} de PIN aujourd'hui</div>` : '');
      return `
        <div class="card" style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div style="width:40px;height:40px;border-radius:50%;background:${actif ? 'var(--brand)' : '#94A3B8'};display:flex;align-items:center;justify-content:center;color:white;font-size:18px;flex-shrink:0;">👤</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;color:#1E293B;">${e(u.prenom)} ${e(u.nom)}</div>
              <div style="font-size:12px;color:#64748B;margin-top:1px;">${u.role === 'admin' ? 'Administrateur' : 'Utilisateur'} · ${u.activites.map(e).join(', ')}${u.externe ? ' · accès externe' : (u.aFicheRh ? '' : ' · sans fiche RH')}</div>
              <div style="margin-top:4px;">${pinBadge}</div>
            </div>
            <span style="background:${badgeBg};color:${badgeCol};font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;flex-shrink:0;">${badgeTxt}</span>
          </div>
          ${blocage}
          <!-- Rôle -->
          <div style="margin-bottom:8px;">
            <select onchange="App._updateUserRole('${u.id}',this.value)"
              style="width:100%;padding:7px 10px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:12px;font-weight:600;color:#475569;background:#F8FAFC;cursor:pointer;">
              <option value="utilisateur" ${u.role!=='admin' ?'selected':''}>👤 Utilisateur</option>
              <option value="admin"       ${u.role==='admin' ?'selected':''}>⚙️ Administrateur</option>
            </select>
          </div>
          <!-- Activités éditables -->
          <div style="margin-bottom:8px;padding:8px 10px;background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:8px;">
            <div style="font-size:11px;font-weight:600;color:#94A3B8;margin-bottom:6px;">ACTIVITÉS</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${['loxam','bcb','agorastore','stockage','lvu'].map(a => `
                <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
                  <input type="checkbox" id="uact-${u.id}-${a}" value="${a}"
                    ${u.activites.includes(a)?'checked':''}
                    onchange="App._updateUserActivites('${u.id}')">
                  ${a.charAt(0).toUpperCase()+a.slice(1)}
                </label>`).join('')}
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="App._showResetPin('${u.id}')"
              style="flex:1;background:#F8FAFC;border:1.5px solid #E2E8F0;color:#475569;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
              🔑 ${u.hasPIN ? 'Reset PIN' : 'Définir PIN'}
            </button>
            <button onclick="App._toggleUser('${u.id}',${!u.actif})"
              style="background:${u.actif ? '#FEF2F2' : '#F0FDF4'};border:1.5px solid ${u.actif ? '#FECACA' : '#86EFAC'};color:${u.actif ? '#991B1B' : '#14532D'};padding:8px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
              ${u.actif ? 'Désactiver' : 'Réactiver'}
            </button>
            <button onclick="App._deleteUser('${u.id}')"
              style="background:#FEF2F2;border:1.5px solid #FECACA;color:#991B1B;padding:8px 10px;border-radius:8px;font-size:14px;cursor:pointer;" title="Supprimer ce compte">
              🗑
            </button>
          </div>
          <!-- Zone reset PIN inline (masquée par défaut) -->
          <div id="reset-pin-${u.id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #F1F5F9;">
            <label class="label-sm">Nouveau PIN (4 chiffres) — le même sert au kiosque</label>
            <div style="display:flex;gap:8px;margin-top:4px;">
              <input type="text" inputmode="numeric" maxlength="4" id="rpin-${u.id}" class="input-field"
                placeholder="ex : 3947"
                style="margin:0;flex:1;letter-spacing:4px;font-size:18px;font-weight:600;">
              <button onclick="App._applyResetPin('${u.id}')"
                style="background:var(--brand);color:white;border:none;padding:0 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">
                OK
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  },

  _showCreateUserForm() {
    document.getElementById('admin-create-form').style.display = 'block';
    document.getElementById('nu-prenom').focus();
  },
  _hideCreateUserForm() {
    document.getElementById('admin-create-form').style.display = 'none';
    S._pendingEmployeId = null;
    ['nu-prenom','nu-nom','nu-pin'].forEach(id => { const el = document.getElementById(id); if (el) { el.value = ''; el.readOnly = false; } });
    const badge = document.getElementById('nu-linked-badge');
    if (badge) badge.style.display = 'none';
    ['loxam','bcb','agorastore','stockage','lvu'].forEach(a => {
      const el = document.getElementById('nu-act-' + a);
      if (el) el.checked = (a === 'loxam'); // reset : loxam coché par défaut
    });
  },

  async _createUser() {
    const btn = document.querySelector('#admin-create-form .btn-primary');
    if (btn && btn.disabled) return; // protection double-clic
    const prenom = document.getElementById('nu-prenom').value.trim();
    const nom    = document.getElementById('nu-nom').value.trim();
    const role   = document.getElementById('nu-role').value;
    const pin    = document.getElementById('nu-pin').value.trim();
    const employeId = S._pendingEmployeId || '';
    const activites = ['loxam','bcb','agorastore','stockage','lvu'].filter(a => {
      const el = document.getElementById('nu-act-' + a); return el && el.checked;
    });

    if (!prenom || !nom)        { this.toast('Prénom et nom requis'); return; }
    if (!/^[0-9]{4}$/.test(pin)) { this.toast('PIN invalide — 4 chiffres requis'); return; }
    if (!activites.length)      { this.toast('Sélectionne au moins une activité'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Création...'; }
    // Le backend crée/relie la fiche Supabase employes ; le PIN sert aussi au kiosque.
    const ok = await this._adminAction({ action:'create_user', prenom, nom, role, activites, pin, employeId }, `✓ ${prenom} ${nom} créé !`);
    if (ok) this._hideCreateUserForm();
    if (btn) { btn.disabled = false; btn.textContent = 'Créer le compte'; }
  },

  _showResetPin(id) {
    const zone = document.getElementById(`reset-pin-${id}`);
    if (!zone) return;
    const isVisible = zone.style.display === 'block';
    // Fermer toutes les autres zones ouvertes
    document.querySelectorAll('[id^="reset-pin-"]').forEach(z => z.style.display = 'none');
    zone.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) document.getElementById(`rpin-${id}`)?.focus();
  },

  async _applyResetPin(id) {
    const pin = (document.getElementById(`rpin-${id}`)?.value || '').trim();
    if (!/^[0-9]{4}$/.test(pin)) { this.toast('PIN invalide — 4 chiffres requis'); return; }
    await this._adminAction({ action:'admin_reset_pin', id, pin }, `✓ PIN de ${this._adminUser(id).prenom} réinitialisé`);
  },

  _toggleUser(id, actif) {
    const p = this._adminUser(id).prenom;
    this._adminAction({ action:'toggle_user', id, actif }, actif ? `✓ ${p} réactivé` : `${p} désactivé`);
  },

  _updateUserActivites(id) {
    const activites = ['loxam','bcb','agorastore','stockage','lvu'].filter(a => {
      const el = document.getElementById(`uact-${id}-${a}`);
      return el && el.checked;
    });
    if (!activites.length) { this.toast('Au moins une activité requise'); this.loadAdminUsers(); return; }
    this._adminAction({ action:'update_user_activites', id, activites }, `✓ Activités de ${this._adminUser(id).prenom} mises à jour`);
  },

  _updateUserRole(id, role) {
    this._adminAction({ action:'update_user_role', id, role }, `✓ Rôle de ${this._adminUser(id).prenom} mis à jour`);
  },

  _unlockUser(id) {
    this._adminAction({ action:'unlock_user', id }, `✓ ${this._adminUser(id).prenom} peut de nouveau se connecter`);
  },

  _deleteUser(id) {
    const u = this._adminUser(id);
    if (!window.confirm(`Supprimer définitivement le compte de ${u.prenom} ${u.nom} ?\nCette action est irréversible.`)) return;
    // Le backend retire aussi la fiche Supabase d'un compte sans fiche RH.
    this._adminAction({ action:'delete_user', id }, `✓ ${u.prenom} ${u.nom} supprimé`);
  },

  /* ─ Settings ─ */
  _fillSettings() {
    document.getElementById('set-url').value          = S.apiUrl;
    document.getElementById('info-codes').textContent = `Codes en cache : ${S.codes.size}`;
    document.getElementById('info-hist').textContent  = `Entrées historique : ${S.history.length}`;
    // Infos utilisateur
    const u = S.currentUser;
    if (u) {
      const roleLabels = { admin:'Administrateur', utilisateur:'Utilisateur', gestionnaire:'Utilisateur', chauffeur:'Utilisateur' };
      document.getElementById('settings-user-name').textContent = `${u.prenom} ${u.nom}`;
      document.getElementById('settings-user-role').textContent = roleLabels[u.role] || u.role;
    }
  },
  saveSettings() {
    const url = document.getElementById('set-url').value.trim();
    S.apiUrl  = url;
    localStorage.setItem(SK.API, url);
    this.toast('✓ Réglages sauvegardés');
    if (url) this._fetchCodes();
  },
  /* ─ Diagnostic ─ */
  async runDiag() {
    const box = document.getElementById('diag-result');
    box.style.display = 'block';
    box.textContent = 'Tests en cours...\n';
    const url = S.apiUrl;
    if (!url) { box.textContent = '❌ URL API non configurée'; return; }
    const log = s => { box.textContent += s + '\n'; };
    // Test 1 : GET codes
    try {
      const t0 = Date.now();
      const r  = await fetch(url + '?action=codes');
      const d  = await r.json();
      log(`✅ GET ?action=codes → ${d.count || d.codes?.length || '?'} codes (${Date.now()-t0}ms)`);
    } catch(e) { log('❌ GET ?action=codes → ' + e.message); }
    // Test 2 : GET codes — affiche aussi le log interne
    try {
      const t0  = Date.now();
      const r   = await _fetchWithTimeout(url + '?action=codes', {}, 40000);
      const d   = await r.json();
      log(`✅ GET ?action=codes → ${d.count} codes (${Date.now()-t0}ms)`);
      if (d.log) d.log.forEach(l => log('   · ' + l));
    } catch(e) { log('❌ GET ?action=codes → ' + e.message); }
    // Test 3 : GET production (nouvelle fonction safe)
    try {
      const t0  = Date.now();
      const r   = await _fetchWithTimeout(url + '?action=production', {}, 40000);
      const raw = await r.text();
      let d;
      try { d = JSON.parse(raw); }
      catch { log('⚠️  Réponse non-JSON (' + raw.length + ' chars): ' + raw.substring(0,150)); throw new Error('JSON invalide'); }
      if (d.status === 'error') {
        log('❌ GET ?action=production → ' + (d.errorSafe || d.error || JSON.stringify(d)));
      } else {
        const n = d.data?.length ?? (Array.isArray(d) ? d.length : '?');
        log(`✅ GET ?action=production → ${n} articles (${Date.now()-t0}ms)`);
      }
    } catch(e) { log('❌ GET ?action=production → ' + e.message); }
    // Test 4 : GET debug_sheets (liste les onglets du Planning Script)
    try {
      const t0  = Date.now();
      const r   = await _fetchWithTimeout(url + '?action=debug_sheets', {}, 20000);
      const d   = await r.json();
      if (d.status === 'ok') {
        log(`✅ Planning Script : "${d.spreadsheetName}"`);
        d.sheets.forEach(s => log(`   · Onglet "${s.name}" — ${s.rows} lignes × ${s.cols} cols`));
      } else { log('❌ debug_sheets → ' + d.error); }
    } catch(e) { log('❌ debug_sheets → ' + e.message); }
    // Test 5 : POST FormData (ping)
    try {
      const t0   = Date.now();
      const form = new FormData();
      form.append('payload', JSON.stringify({ action: 'ping' }));
      const r    = await fetch(url, { method: 'POST', body: form });
      const raw  = await r.text();
      log(`✅ POST FormData → ${raw.substring(0,80)} (${Date.now()-t0}ms)`);
    } catch(e) { log('❌ POST FormData → ' + e.message); }
    log('─── Fin des tests ───');
  },
  /* ─ BCB Consignes ─ */
  BCB_LANGS: [
    { code:'fr', flag:'🇫🇷', name:'Français', dir:'ltr',
      rulesTitle:'Consignes de sécurité obligatoires',
      formTitle:'Informations du conducteur',
      fields:{ nom:'Nom', prenom:'Prénom', tracteur:'Immatriculation tracteur', remorque:'Immatriculation remorque', client:'Client de destination', clientAdresse:'Adresse du client', clientVille:'CP / Ville', clientPays:'Pays', transport:{ sectionTitle:'Transporteur', nom:'Nom entreprise', adresse:'Adresse', ville:'CP / Ville', pays:'Pays' } },
      valider:'Valider l\'entrée', confirmTitle:'Entrée enregistrée', nouveau:'Nouveau chauffeur',
      rules:['Limitation de vitesse : 10 km/h sur l\'ensemble du site.','Arrêt obligatoire à chaque panneau STOP.','Les piétons sont toujours prioritaires.','Port du gilet de sécurité haute visibilité obligatoire.','Chaussures de sécurité obligatoires sur tout le site.','Utilisation du téléphone portable interdite lors des manœuvres.','Interdit de fumer sur l\'ensemble du site.','Respectez les consignes du personnel à tout moment.','Ne laissez pas votre véhicule sans surveillance dans les zones de circulation.','Tout accident ou incident doit être signalé immédiatement au personnel.'] },
    { code:'en', flag:'🇬🇧', name:'English', dir:'ltr',
      rulesTitle:'Mandatory safety instructions',
      formTitle:'Driver information',
      fields:{ nom:'Last name', prenom:'First name', tracteur:'Tractor plate', remorque:'Trailer plate', client:'Destination client', clientAdresse:'Client address', clientVille:'Zip / City', clientPays:'Country', transport:{ sectionTitle:'Carrier', nom:'Company name', adresse:'Address', ville:'Zip / City', pays:'Country' } },
      valider:'Validate entry', confirmTitle:'Entry recorded', nouveau:'New driver',
      rules:['Speed limit: 10 km/h throughout the site.','Mandatory stop at all STOP signs.','Pedestrians always have right of way.','High-visibility safety vest is mandatory.','Safety footwear is required throughout the site.','Mobile phone use is prohibited during maneuvers.','Smoking is strictly prohibited on the entire site.','Follow all instructions from staff at all times.','Do not leave your vehicle unattended in traffic areas.','Any accident or incident must be reported immediately to staff.'] },
    { code:'es', flag:'🇪🇸', name:'Español', dir:'ltr',
      rulesTitle:'Instrucciones de seguridad obligatorias',
      formTitle:'Información del conductor',
      fields:{ nom:'Apellido', prenom:'Nombre', tracteur:'Matrícula tractora', remorque:'Matrícula remolque', client:'Cliente de destino', clientAdresse:'Dirección del cliente', clientVille:'CP / Ciudad', clientPays:'País', transport:{ sectionTitle:'Transportista', nom:'Nombre empresa', adresse:'Dirección', ville:'CP / Ciudad', pays:'País' } },
      valider:'Validar entrada', confirmTitle:'Entrada registrada', nuevo:'Nuevo conductor',
      rules:['Límite de velocidad: 10 km/h en todo el recinto.','Parada obligatoria en todas las señales de STOP.','Los peatones tienen prioridad en todo momento.','El uso del chaleco de seguridad de alta visibilidad es obligatorio.','Se requiere calzado de seguridad en todo el recinto.','Se prohíbe el uso del teléfono móvil durante las maniobras.','Está prohibido fumar en todo el recinto.','Siga las instrucciones del personal en todo momento.','No deje su vehículo sin vigilancia en zonas de circulación.','Todo accidente o incidente debe comunicarse inmediatamente al personal.'] },
    { code:'pt', flag:'🇵🇹', name:'Português', dir:'ltr',
      rulesTitle:'Instruções de segurança obrigatórias',
      formTitle:'Informações do condutor',
      fields:{ nom:'Apelido', prenom:'Nome próprio', tracteur:'Matrícula do tractor', remorque:'Matrícula do reboque', client:'Cliente de destino', clientAdresse:'Morada do cliente', clientVille:'CP / Localidade', clientPays:'País', transport:{ sectionTitle:'Transportador', nom:'Nome empresa', adresse:'Morada', ville:'CP / Localidade', pays:'País' } },
      valider:'Validar entrada', confirmTitle:'Entrada registada', novo:'Novo condutor',
      rules:['Limite de velocidade: 10 km/h em todo o local.','Paragem obrigatória em todos os sinais de STOP.','Os peões têm sempre prioridade.','O uso de colete de segurança de alta visibilidade é obrigatório.','Calçado de segurança obrigatório em todo o local.','É proibido utilizar o telemóvel durante as manobras.','É proibido fumar em todo o local.','Siga as instruções do pessoal em todo momento.','Não deixe o seu veículo sem vigilância nas zonas de circulação.','Qualquer acidente ou incidente deve ser comunicado imediatamente ao pessoal.'] },
    { code:'ro', flag:'🇷🇴', name:'Română', dir:'ltr',
      rulesTitle:'Instrucțiuni de securitate obligatorii',
      formTitle:'Informații despre șofer',
      fields:{ nom:'Nume', prenom:'Prenume', tracteur:'Nr. înmatriculare cap tractor', remorque:'Nr. înmatriculare remorcă', client:'Client de destinație', clientAdresse:'Adresa clientului', clientVille:'Cod / Localitate', clientPays:'Țară', transport:{ sectionTitle:'Transportator', nom:'Nume firmă', adresse:'Adresă', ville:'Cod / Localitate', pays:'Țară' } },
      valider:'Validare intrare', confirmTitle:'Intrare înregistrată', nou:'Șofer nou',
      rules:['Limita de viteză: 10 km/h pe întreg amplasamentul.','Oprire obligatorie la toate semnele STOP.','Pietonii au întotdeauna prioritate.','Purtarea vestei de siguranță cu vizibilitate ridicată este obligatorie.','Încălțămintea de protecție este obligatorie pe întreg amplasamentul.','Este interzisă utilizarea telefonului mobil în timpul manevrelor.','Fumatul este strict interzis pe întreg amplasamentul.','Respectați instrucțiunile personalului în orice moment.','Nu lăsați vehiculul nesupravegheat în zonele de circulație.','Orice accident sau incident trebuie raportat imediat personalului.'] },
    { code:'pl', flag:'🇵🇱', name:'Polski', dir:'ltr',
      rulesTitle:'Obowiązkowe instrukcje bezpieczeństwa',
      formTitle:'Dane kierowcy',
      fields:{ nom:'Nazwisko', prenom:'Imię', tracteur:'Nr rej. ciągnika', remorque:'Nr rej. naczepy', client:'Klient docelowy', clientAdresse:'Adres klienta', clientVille:'Kod poczt. / Miasto', clientPays:'Kraj', transport:{ sectionTitle:'Przewoźnik', nom:'Nazwa firmy', adresse:'Adres', ville:'Kod / Miasto', pays:'Kraj' } },
      valider:'Zatwierdź wjazd', confirmTitle:'Wjazd zarejestrowany', nowy:'Nowy kierowca',
      rules:['Ograniczenie prędkości: 10 km/h na terenie obiektu.','Obowiązkowe zatrzymanie przy wszystkich znakach STOP.','Piesi mają zawsze pierwszeństwo.','Obowiązkowe noszenie kamizelki odblaskowej.','Obuwie ochronne wymagane na terenie całego obiektu.','Używanie telefonu komórkowego podczas manewrów jest zabronione.','Palenie jest surowo zabronione na terenie całego obiektu.','Stosuj się do poleceń personelu w każdej chwili.','Nie pozostawiaj pojazdu bez nadzoru w strefach ruchu.','Każdy wypadek lub incydent należy niezwłocznie zgłosić personelowi.'] },
    { code:'tr', flag:'🇹🇷', name:'Türkçe', dir:'ltr',
      rulesTitle:'Zorunlu güvenlik talimatları',
      formTitle:'Sürücü bilgileri',
      fields:{ nom:'Soyadı', prenom:'Adı', tracteur:'Çekici plakası', remorque:'Dorse plakası', client:'Varış müşterisi', clientAdresse:'Müşteri adresi', clientVille:'Posta kodu / Şehir', clientPays:'Ülke', transport:{ sectionTitle:'Taşıyıcı', nom:'Firma adı', adresse:'Adres', ville:'Posta kodu / Şehir', pays:'Ülke' } },
      valider:'Girişi onayla', confirmTitle:'Giriş kaydedildi', yeni:'Yeni sürücü',
      rules:['Hız sınırı: tüm tesis genelinde 10 km/sa.','Tüm STOP işaretlerinde zorunlu duruş.','Yayaların her zaman önceliği vardır.','Yüksek görünürlüklü güvenlik yeleği takmak zorunludur.','Tesisin tamamında güvenlik ayakkabısı zorunludur.','Manevra sırasında cep telefonu kullanımı yasaktır.','Tesisin tamamında sigara içmek kesinlikle yasaktır.','Personelin talimatlarına her zaman uyun.','Araçınızı trafik alanlarında gözetimsiz bırakmayın.','Her kaza veya olay derhal personele bildirilmelidir.'] },
    { code:'de', flag:'🇩🇪', name:'Deutsch', dir:'ltr',
      rulesTitle:'Obligatorische Sicherheitsanweisungen',
      formTitle:'Fahrerinformationen',
      fields:{ nom:'Nachname', prenom:'Vorname', tracteur:'Kennzeichen Zugmaschine', remorque:'Kennzeichen Anhänger', client:'Zielkunde', clientAdresse:'Adresse des Kunden', clientVille:'PLZ / Ort', clientPays:'Land', transport:{ sectionTitle:'Spediteur', nom:'Firmenname', adresse:'Adresse', ville:'PLZ / Ort', pays:'Land' } },
      valider:'Einfahrt bestätigen', confirmTitle:'Einfahrt erfasst', neu:'Neuer Fahrer',
      rules:['Geschwindigkeitsbegrenzung: 10 km/h auf dem gesamten Gelände.','Obligatorischer Halt an allen STOP-Schildern.','Fußgänger haben stets Vorrang.','Das Tragen einer Warnweste ist Pflicht.','Sicherheitsschuhe sind auf dem gesamten Gelände vorgeschrieben.','Die Nutzung von Mobiltelefonen ist beim Rangieren verboten.','Das Rauchen ist auf dem gesamten Gelände streng verboten.','Folgen Sie jederzeit den Anweisungen des Personals.','Lassen Sie Ihr Fahrzeug in Verkehrsbereichen nicht unbeaufsichtigt.','Jeder Unfall oder Vorfall muss sofort dem Personal gemeldet werden.'] },
    { code:'nl', flag:'🇳🇱', name:'Nederlands', dir:'ltr',
      rulesTitle:'Verplichte veiligheidsinstructies',
      formTitle:'Gegevens chauffeur',
      fields:{ nom:'Achternaam', prenom:'Voornaam', tracteur:'Kenteken trekker', remorque:'Kenteken oplegger', client:'Bestemmingsklant', clientAdresse:'Adres van de klant', clientVille:'Postcode / Stad', clientPays:'Land', transport:{ sectionTitle:'Vervoerder', nom:'Bedrijfsnaam', adresse:'Adres', ville:'Postcode / Stad', pays:'Land' } },
      valider:'Inrit bevestigen', confirmTitle:'Inrit geregistreerd', nieuw:'Nieuwe chauffeur',
      rules:['Snelheidslimiet: 10 km/u op het hele terrein.','Verplicht stoppen bij alle STOP-borden.','Voetgangers hebben altijd voorrang.','Het dragen van een veiligheidshesje met hoge zichtbaarheid is verplicht.','Veiligheidsschoenen zijn vereist op het hele terrein.','Het gebruik van een mobiele telefoon tijdens manoeuvres is verboden.','Roken is streng verboden op het hele terrein.','Volg altijd de instructies van het personeel op.','Laat uw voertuig niet onbeheerd achter in rijgebieden.','Elk ongeluk of incident moet onmiddellijk aan het personeel worden gemeld.'] },
    { code:'bg', flag:'🇧🇬', name:'Български', dir:'ltr',
      rulesTitle:'Задължителни инструкции за безопасност',
      formTitle:'Данни за шофьора',
      fields:{ nom:'Фамилия', prenom:'Ime', tracteur:'Рег. номер влекач', remorque:'Рег. номер ремарке', client:'Клиент дестинация', clientAdresse:'Адрес на клиента', clientVille:'Пощ. код / Град', clientPays:'Държава', transport:{ sectionTitle:'Превозвач', nom:'Фирма', adresse:'Адрес', ville:'Пощ. код / Град', pays:'Държава' } },
      valider:'Потвърди влизане', confirmTitle:'Влизането е регистрирано', nov:'Нов шофьор',
      rules:['Ограничение на скоростта: 10 км/ч на целия обект.','Задължително спиране при всички знаци СТОП.','Пешеходците винаги имат предимство.','Носенето на светлоотразителна жилетка е задължително.','Предпазни обувки са задължителни на целия обект.','Използването на мобилен телефон по време на маневри е забранено.','Пушенето е строго забранено на целия обект.','Спазвайте указанията на персонала по всяко време.','Не оставяйте превозното средство без надзор в зоните за движение.','Всеки инцидент трябва незабавно да се докладва на персонала.'] },
    { code:'sq', flag:'🇦🇱', name:'Shqip', dir:'ltr',
      rulesTitle:'Udhëzime të detyrueshme sigurie',
      formTitle:'Të dhëna të shoferit',
      fields:{ nom:'Mbiemri', prenom:'Emri', tracteur:'Targa traktori', remorque:'Targa rimorkio', client:'Klienti i destinacionit', clientAdresse:'Adresa e klientit', clientVille:'Kodi / Qyteti', clientPays:'Vendi', transport:{ sectionTitle:'Transportuesi', nom:'Emri i kompanisë', adresse:'Adresa', ville:'Kodi / Qyteti', pays:'Vendi' } },
      valider:'Konfirmo hyrjen', confirmTitle:'Hyrja është regjistruar', ri:'Shofer i ri',
      rules:['Kufiri i shpejtësisë: 10 km/orë në të gjithë territorin.','Ndalim i detyrueshëm në të gjitha shenjat STOP.','Këmbësorët kanë gjithmonë përparësi.','Veshja e jelekut të sigurisë me dukshmëri të lartë është e detyrueshme.','Këpucët e sigurisë janë të detyrueshme në të gjithë territorin.','Përdorimi i telefonit celular gjatë manovrimit është i ndaluar.','Pirja e duhanit është rreptësisht e ndaluar në të gjithë territorin.','Ndiqni gjithmonë udhëzimet e personelit.','Mos e lini automjetin tuaj pa mbikëqyrje në zonat e qarkullimit.','Çdo aksident ose incident duhet të raportohet menjëherë tek personeli.'] },
    { code:'ar', flag:'🇸🇦', name:'العربية', dir:'rtl',
      rulesTitle:'تعليمات السلامة الإلزامية',
      formTitle:'معلومات السائق',
      fields:{ nom:'اللقب', prenom:'الاسم', tracteur:'لوحة الجرار', remorque:'لوحة المقطورة', client:'العميل المقصود', clientAdresse:'عنوان العميل', clientVille:'الرمز البريدي / المدينة', clientPays:'البلد', transport:{ sectionTitle:'الناقل', nom:'اسم الشركة', adresse:'العنوان', ville:'الرمز البريدي / المدينة', pays:'البلد' } },
      valider:'تأكيد الدخول', confirmTitle:'تم تسجيل الدخول', jadid:'سائق جديد',
      rules:['الحد الأقصى للسرعة: 10 كم/ساعة في جميع أنحاء الموقع.','التوقف إلزامي عند جميع إشارات STOP.','المشاة لهم الأولوية في جميع الأوقات.','ارتداء سترة السلامة عالية الوضوح إلزامي.','حذاء السلامة إلزامي في جميع أنحاء الموقع.','يُحظر استخدام الهاتف المحمول أثناء المناورات.','يُحظر التدخين بشكل صارم في جميع أنحاء الموقع.','اتبع تعليمات الموظفين في جميع الأوقات.','لا تترك مركبتك دون مراقبة في مناطق الحركة.','يجب الإبلاغ فوراً عن أي حادث أو واقعة للموظفين.'] },
  ],
});
