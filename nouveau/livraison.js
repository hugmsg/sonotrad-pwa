/* ═══════════════════════════════════════════════════════════════════════════
   Consigne de livraison (2026-11-24, demande de Hugo)
   { type, min, max } — dates ISO aaaa-mm-jj :
     le       → min = max          avant   → max (au plus tard)
     apartir  → min (pas avant)    semaine → lundi et vendredi de la semaine ISO (samedi exclu)
     aucune   → pas de consigne
   Partagé par le formulaire LV (lv.js), la note de suivi, Production (colonne Livraison, réglage du module)
   et la vue LV / CMR (liste et frise). Côté serveur : masterfile/lv_livraison.js (même format).
   Sans consigne enregistrée, une simple date (Planning K, livraison_prevue) vaut « le … ».
   ═══════════════════════════════════════════════════════════════════════════ */

const LIV_TYPES = [
  { id: 'le',      nom: 'Le' },
  { id: 'avant',   nom: 'Avant le' },
  { id: 'apartir', nom: 'À partir du' },
  { id: 'semaine', nom: 'Semaine' },
  { id: 'aucune',  nom: 'Pas de consigne' },
];

const _LIV_JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function _livIso(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = s ? new Date(s) : null;               // dates du Planning (« Thu Dec 04 2026 … »)
  return d && !isNaN(d) ? _livIso(d) : '';
}
function _livDate(iso) { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function _livJJMM(iso) { const d = _livDate(iso); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : ''; }
function _livJour(iso) { const d = _livDate(iso); return d ? `${_LIV_JOURS[d.getDay()]} ${_livJJMM(iso)}` : ''; }

// Semaine ISO : n° et année d'une date ; lundi / vendredi d'une « aaaa-Www »
function _livSemaineDe(iso) {
  const d = _livDate(iso); if (!d) return null;
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const j = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - j);
  const an = t.getUTCFullYear();
  return { an, no: Math.ceil(((t - Date.UTC(an, 0, 1)) / 86400000 + 1) / 7) };
}
function _livSemaineBornes(semaine) {
  const m = String(semaine || '').match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const an = +m[1], no = +m[2];
  const jan4 = new Date(an, 0, 4);
  const lundi = new Date(jan4); lundi.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1) + (no - 1) * 7);
  const vendredi = new Date(lundi); vendredi.setDate(lundi.getDate() + 4);
  return { min: _livIso(lundi), max: _livIso(vendredi) };
}
function _livSemaineValeur(iso) { const s = _livSemaineDe(iso); return s ? `${s.an}-W${String(s.no).padStart(2, '0')}` : ''; }

/** Consigne propre, ou null. Accepte aussi une simple date (→ « le »). */
function _livNorm(c, dateSeule) {
  if (!c || typeof c !== 'object') {
    const d = _livIso(dateSeule);
    return d ? { type: 'le', min: d, max: d } : null;
  }
  const type = String(c.type || ''), min = _livIso(c.min), max = _livIso(c.max);
  if (type === 'aucune') return { type, min: '', max: '' };
  if (type === 'le') { const d = min || max; return d ? { type, min: d, max: d } : null; }
  if (type === 'avant') return max ? { type, min: '', max } : null;
  if (type === 'apartir') return min ? { type, min, max: '' } : null;
  if (type === 'semaine') return min && max ? { type, min, max } : null;
  return _livNorm(null, dateSeule);
}
function _livReference(c) { return c ? (c.max || c.min || '') : ''; }

/** Texte : long (« Avant le ven. 27/11 ») ou court pour un tableau (« av. 27/11 »). */
function _livTexte(c, court = false) {
  if (!c) return '';
  if (c.type === 'aucune') return court ? 'sans consigne' : 'Pas de consigne';
  if (c.type === 'le') return court ? _livJJMM(c.min) : 'Le ' + _livJour(c.min);
  if (c.type === 'avant') return court ? 'av. ' + _livJJMM(c.max) : 'Avant le ' + _livJour(c.max);
  if (c.type === 'apartir') return court ? 'dès ' + _livJJMM(c.min) : 'À partir du ' + _livJour(c.min);
  if (c.type === 'semaine') {
    const s = _livSemaineDe(c.min);
    return court ? 'S' + (s ? s.no : '?') : `Semaine ${s ? s.no : '?'} (${_livJJMM(c.min)} – ${_livJJMM(c.max)})`;
  }
  return '';
}

/** État par rapport à aujourd'hui : retard (au plus tard dépassé), proche (≤ 2 jours), pasencore (avant « à partir du »). */
function _livEtat(c) {
  if (!c || c.type === 'aucune') return '';
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const max = _livDate(c.max), min = _livDate(c.min);
  if (max && max < auj) return 'retard';
  if (min && min > auj) return 'pasencore';
  if (max && (max - auj) / 86400000 <= 2) return 'proche';
  return '';
}
/** Clé de tri par urgence : retard d'abord, puis au plus tard le plus proche, puis « à partir du », puis sans consigne. */
function _livCleTri(c) {
  if (!c || c.type === 'aucune') return 9e15;
  const max = _livDate(c.max), min = _livDate(c.min);
  return max ? max.getTime() : (min ? 5e15 + min.getTime() : 9e15);
}

Object.assign(App, {
  /* ─ Sélecteur réutilisable : boutons Le / Avant le / À partir du / Semaine / Pas de consigne + un champ adapté ─
     pfx = préfixe des id (plusieurs sélecteurs peuvent coexister). La valeur vit dans S.liv[pfx]. */
  _livWidget(pfx, c) {
    S.liv = S.liv || {};
    S.liv[pfx] = c ? Object.assign({}, c) : { type: '', min: '', max: '' };
    return `<div class="liv-widget" id="${pfx}">${this._livWidgetInterieur(pfx)}</div>`;
  },

  _livWidgetInterieur(pfx) {
    const c = S.liv[pfx] || {}, t = c.type;
    const btn = x => `<button type="button" class="liv-choix" aria-pressed="${t === x.id}" onclick="App.livChoisir('${pfx}', '${x.id}')">${x.nom}</button>`;
    const champ = (lib, val) => `<label class="liv-champ">${lib}<input type="date" value="${_otEsc(val || '')}" onchange="App.livDateSaisie('${pfx}', this.value)"></label>`;
    let saisie = '';
    if (t === 'le') saisie = champ('Date de livraison', c.min);
    else if (t === 'avant') saisie = champ('Au plus tard le', c.max);
    else if (t === 'apartir') saisie = champ('Pas avant le', c.min);
    else if (t === 'semaine') saisie = `<label class="liv-champ">Semaine<input type="week" value="${_otEsc(_livSemaineValeur(c.min))}" onchange="App.livSemaineSaisie('${pfx}', this.value)"></label>`;
    const n = _livNorm(c);
    const apercu = t ? (n ? (t === 'aucune' ? 'Pas de consigne de livraison' : 'Livraison ' + _livTexte(n).replace(/^./, x => x.toLowerCase())) : 'Choisissez la date') : 'Aucune consigne choisie';
    return `<div class="liv-choix-rang" role="group" aria-label="Consigne de livraison">${LIV_TYPES.map(btn).join('')}</div>
      ${t && t !== 'aucune' ? `<div class="liv-saisie">${saisie}<div class="liv-apercu${n ? '' : ' liv-apercu-vide'}">${_otEsc(apercu)}</div></div>` : ''}`;
  },

  _livRedessiner(pfx) { const el = document.getElementById(pfx); if (el) el.innerHTML = this._livWidgetInterieur(pfx); },

  livChoisir(pfx, type) {
    const c = S.liv[pfx] || {};
    const ref = _livReference(_livNorm(c)) || '';
    let n = { type, min: '', max: '' };
    if (type === 'le') n = { type, min: ref, max: ref };
    else if (type === 'avant') n = { type, min: '', max: ref };
    else if (type === 'apartir') n = { type, min: c.min || ref, max: '' };
    else if (type === 'semaine') { const b = ref ? _livSemaineBornes(_livSemaineValeur(ref)) : null; n = { type, min: b ? b.min : '', max: b ? b.max : '' }; }
    S.liv[pfx] = n;
    this._livRedessiner(pfx);
  },
  livDateSaisie(pfx, v) {
    const c = S.liv[pfx]; if (!c) return;
    if (c.type === 'le') { c.min = v; c.max = v; } else if (c.type === 'avant') c.max = v; else if (c.type === 'apartir') c.min = v;
    this._livRedessiner(pfx);
  },
  livSemaineSaisie(pfx, v) {
    const c = S.liv[pfx]; if (!c) return;
    const b = _livSemaineBornes(v);
    c.min = b ? b.min : ''; c.max = b ? b.max : '';
    this._livRedessiner(pfx);
  },
  /** Valeur du sélecteur : consigne propre, null si rien de choisi, false si incomplète. */
  _livLire(pfx) {
    const c = S.liv && S.liv[pfx];
    if (!c || !c.type) return null;
    return _livNorm(c) || false;
  },

  /* ─ Production : régler la consigne d'un module sans LV (action planning_livraison) ─ */
  async prodLivraison(parti, idx) {
    const d = (parti ? S.archive : S.deps)[idx];
    if (!d || parti) return;
    if (d.lv) { this.lvpOuvrir && this.lvpOuvrir(d.lv); return; }
    if (!this._pbPeutEtape()) return;
    const c = _livNorm(d.livraisonConsigne, d.livraisonPrevue);
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre liv-fenetre" role="dialog" aria-modal="true" aria-labelledby="liv-f-titre">
      <h3 id="liv-f-titre">Livraison · ${_otEsc(d.code)}</h3>
      <p>${_otEsc([d.codeModule, d.module, d.chantier].filter(Boolean).join(' · '))}</p>
      ${this._livWidget('pbliv', c)}
      <p class="liv-note">Reprise sur la LV à sa création. Écrite au Planning (colonne K, avec la consigne en note).</p>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
        <button type="button" class="sx-btn sx-btn-principal" data-r="1">Enregistrer</button>
      </div></div>`;
    document.body.appendChild(voile);
    const fermer = () => voile.remove();
    voile.addEventListener('click', async e => {
      if (e.target === voile || e.target.dataset.r === '0') return fermer();
      if (e.target.dataset.r !== '1') return;
      const n = this._livLire('pbliv');
      if (!n) { this.toast('Choisissez une consigne complète (type et date)'); return; }
      e.target.disabled = true; e.target.textContent = '…';
      try {
        const r = await this._otPost({ action: 'planning_livraison', code: d.code, livraison: n }, 60000);
        d.livraisonConsigne = n.type === 'aucune' ? null : n;
        d.livraisonPrevue = r.reference || '';
        this.toast(`${d.code} : ${_livTexte(n)}`);
        fermer();
        this._pbRendre();
      } catch (err) {
        this.toast('Enregistrement impossible : ' + err.message, 5000);
        e.target.disabled = false; e.target.textContent = 'Enregistrer';
      }
    });
  },
});
