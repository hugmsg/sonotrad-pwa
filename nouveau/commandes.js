/* ═══════════════════════════════════════════════════════════════════════════
   Bons de commande LOXAM (2026-11-20) — vue « Commandes » de Production (admins).
   1. Import : un ou plusieurs PDF (une commande, ou un fichier fusionné par l'outil Outlook → PDF). Lecture
      dans le navigateur par pdf.js (texte exact) ; une page sans texte (scan) part à l'OCR de Google Drive
      (action cde_ocr). Chaque commande est découpée en son propre PDF (pdf-lib) pour être rangée sur Drive.
   2. Contrôle : module retrouvé au Planning par son n° (Commentaires), agence, montant comparé à l'OT
      (fiche validée, sinon historique des OT), doublon, commande déjà au Planning. Rien n'est deviné : un champ
      illisible bloque la ligne, « Vérifier / corriger » (PDF à côté des champs) permet de le saisir.
   3. Enregistrement (cde_enregistrer) : Supabase commandes_loxam + PDF sur Drive + n° dans le Planning (U)
      et Demandes (N) quand la case est vide.
   4. Export EBP : même fichier que le lecteur de commandes (format v6 : CSV Windows-1252 « ; », plus un .xlsx).
   Bibliothèques chargées à la demande (cdnjs, versions figées) : pdf.js 3.11.174, pdf-lib 1.17.1.
   ═══════════════════════════════════════════════════════════════════════════ */

const CDE_LIB = {
  pdfjs:  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
};

// En-tête du fichier d'import EBP : à l'identique du fichier v6 du lecteur (paramétré dans EBP, ordre des colonnes compris).
const CDE_EBP_ENTETE = ['Code Interne', 'Code article', 'Vérif Prix', 'N° Commande', 'Date Commande', 'Quantité', 'Total HT',
  'N° Affaire', 'Réf, Module', 'Destination', 'A facturer', 'Client', 'Adresse Livraison'];
const CDE_EBP_ARTICLE = 'RECOND';
const CDE_EBP_A_FACTURER = '0101';

/* ─ Lecture du texte ─────────────────────────────────────────────────────── */

// Lignes d'une page pdf.js : morceaux regroupés par hauteur, puis triés de gauche à droite.
function _cdeLignesPage(items) {
  const its = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const lignes = [];
  for (const it of its) {
    const l = lignes.find(x => Math.abs(x.y - it.y) < 3);
    if (l) l.items.push(it); else lignes.push({ y: it.y, items: [it] });
  }
  lignes.sort((a, b) => b.y - a.y);
  return lignes.map(l => {
    l.items.sort((a, b) => a.x - b.x);
    let t = '', fin = null;
    for (const it of l.items) {
      if (fin !== null && it.x - fin > 1.5 && !t.endsWith(' ')) t += ' ';
      t += it.s; fin = it.x + it.w;
    }
    return t.replace(/\s+/g, ' ').trim();
  }).join('\n');
}

// N° imprimé en gras par superposition : « 53274395327439 » (pdf.js) ou « 55332277443399 » (autres lecteurs).
function _cdeDedouble(s) {
  s = String(s || '').replace(/\s+/g, '');
  if (s.length >= 2 && s.length % 2 === 0) {
    const m = s.length / 2;
    if (s.slice(0, m) === s.slice(m)) return s.slice(0, m);
    let paire = true;
    for (let i = 0; i < s.length; i += 2) if (s[i] !== s[i + 1]) { paire = false; break; }
    if (paire) return s.replace(/(.)./g, '$1');
  }
  return s;
}

// « 1,654.00 » → 1654 ; « 1 058,00 » → 1058 ; « 1.058,50 » → 1058.5
function _cdeNombre(s) {
  s = String(s || '').replace(/[\s ]/g, '');
  if (!s) return null;
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return isFinite(n) && s !== '' ? Math.round(n * 100) / 100 : null;
}

function _cdeDate(s) {          // jj/mm/aa → AAAA-MM-JJ
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return '';
  return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2] + '-' + m[1];
}

// Champs d'un bon de commande LOXAM. Un champ introuvable reste vide et figure dans « manquants ».
function _cdeAnalyser(texte) {
  const t = String(texte || '').replace(/\r/g, '');
  const lignes = t.split('\n').map(l => l.trim()).filter(Boolean);
  const g = re => { const m = t.match(re); return m ? m[1].trim() : ''; };
  const idx = re => lignes.findIndex(l => re.test(l));
  const d = {};
  d.numero = _cdeDedouble(g(/\bNo\s*[:.]?\s*([0-9][0-9 ]{4,})/i));
  d.date_commande = _cdeDate(g(/Date\s+Commande\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i));
  // Nombres : chiffres, points, virgules et espaces d'une même ligne (jamais un retour à la ligne)
  const art = t.match(/^[ \t]*(\d+(?:[.,]\d+)?)[ \t]+(.+?)[ \t]+([\d., \u00a0]+[.,]\d{2})[ \t]+([\d., \u00a0]+[.,]\d{2})[ \t]*$/m);
  const qte = art ? art[1] : g(/^[ \t]*(\d+[.,]00)[ \t]*$/m);       // OCR : « 1.00 » seul sur sa ligne
  d.quantite = qte ? Math.round(_cdeNombre(qte.replace(',', '.'))) : null;
  d.libelle = art ? art[2].trim() : (g(/^[ \t]*(SOUS ENSEMBLE[^\n]*)$/im) || '');
  d.total_ht = _cdeNombre(g(/Total\s+HT\s*:?\s*(\d[\d., \u00a0]*\d)/i));
  d.affaire = g(/AF+AIRE\s*N\s*[°ºo]?\s*:?\s*(\S+)/i);
  const ic = idx(/^Commentaires\s*:?$/i);
  d.ref_module = ic >= 0 && lignes[ic + 1] ? ((lignes[ic + 1].match(/^([A-Za-z0-9]+)$/) || [])[1] || '') : '';
  d.destination = g(/^\s*POUR\s+(.+?)\s*$/im);
  d.client = (d.destination.match(/(\d{4})\s*$/) || [])[1] || '';
  const ie = idx(/^Exp[ée]dier\s+l.article/i), id = idx(/^Date\s+souhait/i);
  d.adresse = ie >= 0 && id > ie
    ? lignes.slice(ie + 1, id).filter(l => l !== '.').map(l => l.replace(/\s+/g, ' ').trim()).join(' | ') : '';
  d.date_souhaitee = _cdeDate(g(/Date\s+souhait[ée]e\s+de\s+livraison\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i));
  return d;
}

/* ─ Fichier d'import EBP ─────────────────────────────────────────────────── */

// Texte d'une cellule comme dans le fichier v6 : ni « ; » ni retour à la ligne, virgules retirées, points → virgules.
function _cdeEbpTexte(s) {
  return String(s == null ? '' : s).replace(/[;\r\n]+/g, ' ').replace(/,/g, '').replace(/\./g, ',').replace(/\s+/g, ' ').trim();
}
function _cdeEbpDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : '';
}
// Une ligne par commande, dans l'ordre des colonnes de CDE_EBP_ENTETE (nombres gardés en nombres pour le .xlsx).
function _cdeEbpLignes(commandes) {
  return commandes.map(c => [
    _cdeEbpTexte(c.code_planning), CDE_EBP_ARTICLE, _cdeEbpTexte(c.verif_prix), _cdeEbpTexte(c.numero),
    _cdeEbpDate(c.date_commande), c.quantite == null ? '' : Math.round(Number(c.quantite)),
    c.total_ht == null ? '' : Number(c.total_ht), _cdeEbpTexte(c.affaire), _cdeEbpTexte(c.ref_module),
    _cdeEbpTexte(c.destination), CDE_EBP_A_FACTURER, _cdeEbpTexte(c.client), _cdeEbpTexte(c.adresse)]);
}
const _CDE_CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A,
  0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function _cdeCp1252(texte) {
  const s = String(texte).normalize('NFC'), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 0x80 || (c >= 0xA0 && c <= 0xFF) ? c : (_CDE_CP1252[c] || 0x3F);
  }
  return out;
}
// CSV EBP : Windows-1252, « ; », fins de ligne CRLF (y compris après la dernière), décimales à virgule.
function _cdeEbpCsv(commandes) {
  const cell = v => typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  const lignes = [CDE_EBP_ENTETE.join(';')].concat(_cdeEbpLignes(commandes).map(r => r.map(cell).join(';')));
  return _cdeCp1252(lignes.join('\r\n') + '\r\n');
}

function _cdeBase64(octets) {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  return btoa(s);
}
function _cdeOctets(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function _cdeEuros(n) {
  return n == null || n === '' ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function _cdeNorm(s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); }
function _cdeAgence(s) { return String(s || '').replace(/\D/g, '').replace(/^0+/, ''); }

const _cdeScripts = {};
function _cdeScript(src) {
  if (!_cdeScripts[src]) _cdeScripts[src] = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok;
    s.onerror = () => { delete _cdeScripts[src]; ko(new Error('Bibliothèque PDF non chargée (réseau ?)')); };
    document.head.appendChild(s);
  });
  return _cdeScripts[src];
}

Object.assign(App, {

  _cdePeut() { return this._otAdmin(); },

  /* ─ Données ─ */

  async _cdeCharger(force = false) {
    S.cde = S.cde || { liste: null, chargement: false, filtre: 'aexporter', q: '', sel: new Set(), imp: null };
    const attentes = [];
    if ((force || !S.cde.liste) && !S.cde.chargement) {
      S.cde.chargement = true;
      attentes.push(this._otGet({ action: 'cde_liste' }, 60000)
        .then(d => { S.cde.liste = d.commandes || []; })
        .catch(e => { S.cde.liste = S.cde.liste || []; this.toast('Commandes indisponibles : ' + e.message, 5000); })
        .finally(() => { S.cde.chargement = false; }));
    }
    if (!S.depsLoaded && !S.depsLoading) attentes.push(this._pbChargerProduction());
    if (!S.archiveLoaded) attentes.push(this._pbChargerArchive());
    if (!attentes.length) return;
    this._cdeRendre();
    await Promise.allSettled(attentes);
    this._cdeRendre();
  },

  // Modules du Planning portant ce n° (Commentaires du bon) : sur parc d'abord, puis partis du plus récent au plus ancien.
  _cdeModules(ref) {
    const n = _cdeNorm(ref);
    if (!n) return [];
    const actifs = (S.deps || []).filter(d => _cdeNorm(d.codeModule) === n).map(d => ({ d, parti: false }));
    const partis = (S.archive || []).filter(d => _cdeNorm(d.codeModule) === n).map(d => ({ d, parti: true }))
      .sort((a, b) => String(b.d.fin || '').localeCompare(String(a.d.fin || '')));
    return actifs.concat(partis);
  },
  _cdeModuleParCode(code) {
    const c = _cdeNorm(code);
    if (!c) return null;
    const a = (S.deps || []).find(d => _cdeNorm(d.code) === c);
    if (a) return { d: a, parti: false };
    const p = (S.archive || []).find(d => _cdeNorm(d.code) === c);
    return p ? { d: p, parti: true } : null;
  },

  /* ─ Écran ─ */

  _cdeRendre() {
    const el = document.getElementById('prod-bureau-root');
    if (!el) return;
    S.cde = S.cde || { liste: null, chargement: false, filtre: 'aexporter', q: '', sel: new Set(), imp: null };
    const C = S.cde;
    const imp = C.imp;
    const liste = C.liste || [];
    const nbAExporter = liste.filter(c => c.statut !== 'annulee' && !c.ebp_le).length;
    const sous = imp ? (imp.etat === 'lecture' ? 'lecture des PDF…' : imp.items.length + ' bon' + (imp.items.length > 1 ? 's' : '') + ' lu' + (imp.items.length > 1 ? 's' : ''))
      : (C.liste ? nbAExporter + ' à exporter dans EBP' : 'chargement…');
    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: 'Commandes · ' + sous, large: true, bandeau: this._pbNav('cde') })}
      <div class="pb-barre"><div class="pb-barre-in">${imp ? this._cdeHtmlBarreImport() : this._cdeHtmlBarreListe(nbAExporter)}</div></div>
      <main class="pb-contenu" id="pb-corps">${imp ? this._cdeHtmlImport() : this._cdeHtmlListe()}</main>
      <div class="pb-actions" id="cde-actions" ${!imp && C.sel.size ? '' : 'hidden'}>${!imp ? this._cdeHtmlActions() : ''}</div>
    </div>`;
  },

  _cdeHtmlBarreListe(nbAExporter) {
    const C = S.cde;
    const f = (cle, nom) => `<button type="button" class="pb-onglet" aria-pressed="${C.filtre === cle}" onclick="App.cdeFiltre('${cle}')">${nom}</button>`;
    return `<div class="pb-ligne">
        <label class="sx-btn sx-btn-principal cd-importer">Importer des bons de commande (PDF)…
          <input type="file" accept="application/pdf,.pdf" multiple hidden onchange="App.cdeImporter(this.files);this.value=''"></label>
        <div class="sx-recherche pb-recherche">${_OT_SVG_LOUPE}
          <label for="cd-q" class="sx-sr">Rechercher</label>
          <input id="cd-q" type="search" placeholder="N° de commande, code, n° module, agence, affaire…" value="${_otEsc(C.q)}" oninput="App.cdeRecherche(this.value)">
        </div>
        <button type="button" class="pb-bouton" onclick="App._cdeCharger(true)">Actualiser</button>
      </div>
      <div class="pb-ligne pb-defile" role="group" aria-label="Filtre">
        ${f('aexporter', 'À exporter dans EBP <b>' + nbAExporter + '</b>')}${f('toutes', 'Toutes')}${f('annulees', 'Annulées')}
      </div>`;
  },

  _cdeListeFiltree() {
    const C = S.cde;
    let l = C.liste || [];
    if (C.filtre === 'aexporter') l = l.filter(c => c.statut !== 'annulee' && !c.ebp_le);
    else if (C.filtre === 'annulees') l = l.filter(c => c.statut === 'annulee');
    else l = l.filter(c => c.statut !== 'annulee');
    const q = C.q.trim().toLowerCase();
    if (q) l = l.filter(c => [c.numero, c.code_planning, c.ref_module, c.client, c.destination, c.affaire]
      .some(v => String(v || '').toLowerCase().includes(q)));
    return l.slice().sort((a, b) => a.id - b.id);   // ordre d'import (= ordre des PDF), comme dans le fichier EBP
  },

  _cdeHtmlListe() {
    const C = S.cde;
    if (!C.liste) return '<div class="sx-chargement">Chargement des commandes…</div>';
    const l = this._cdeListeFiltree();
    if (!l.length) return `<div class="sx-carte"><div class="sx-vide">${C.filtre === 'aexporter' ? 'Aucune commande à exporter. « Importer des bons de commande » pour en ajouter.' : 'Aucune commande.'}</div></div>`;
    const selectionnables = l.filter(c => c.statut !== 'annulee');
    const tout = selectionnables.length && selectionnables.every(c => C.sel.has(c.id));
    return `<div class="sx-carte cd-tableau-cadre"><table class="cd-tableau">
      <thead><tr>
        <th class="cd-case">${selectionnables.length ? `<input type="checkbox" aria-label="Tout sélectionner" ${tout ? 'checked' : ''} onclick="App.cdeSelTout(this.checked)">` : ''}</th>
        <th>N° commande</th><th>Date</th><th>Module</th><th>Agence</th><th class="cd-num">Montant HT</th><th>Prix / OT</th><th>EBP</th><th></th>
      </tr></thead><tbody>
      ${l.map(c => {
        const m = this._cdeModuleParCode(c.code_planning);
        const annulee = c.statut === 'annulee';
        const pdf = c.pdf && c.pdf.url ? `<a class="pb-doc" href="${_otEsc(c.pdf.url)}" target="_blank" rel="noopener">PDF</a>` : '';
        return `<tr class="${annulee ? 'cd-annulee' : ''}">
          <td class="cd-case">${annulee ? '' : `<input type="checkbox" ${C.sel.has(c.id) ? 'checked' : ''} aria-label="Sélectionner ${_otEsc(c.numero)}" onclick="App.cdeSel(${Number(c.id)}, this.checked)">`}</td>
          <td><b>${_otEsc(c.numero)}</b>${c.source === 'ocr' ? ' <span class="cd-badge">OCR</span>' : ''}<div class="sx-aide">${_otEsc(c.affaire || '')}</div></td>
          <td>${_otEsc(_cdeEbpDate(c.date_commande))}</td>
          <td><b>${_otEsc(c.code_planning || '—')}</b> <span class="sx-aide">${_otEsc(c.ref_module || '')}${m ? ' · ' + (m.parti ? 'parti' : 'sur parc') : ''}</span></td>
          <td>${_otEsc(c.destination || c.client || '')}</td>
          <td class="cd-num">${_cdeEuros(c.total_ht)}</td>
          <td>${this._cdeHtmlVerif(c.verif_prix)}${c.ot_numero ? `<div class="sx-aide">OT ${_otEsc(c.ot_numero)}</div>` : ''}</td>
          <td>${annulee ? `<span class="sx-aide" title="${_otEsc(c.motif_annulation || '')}">annulée</span>` : c.ebp_le ? `<span class="sx-aide">exportée le ${new Date(c.ebp_le).toLocaleDateString('fr-FR')}</span>` : '<span class="cd-aexporter">à exporter</span>'}</td>
          <td class="cd-fin">${pdf}${annulee ? '' : ` <button type="button" class="cd-lien" onclick="App.cdeAnnuler(${Number(c.id)})">Annuler…</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  },

  _cdeHtmlVerif(v) {
    v = String(v || '');
    if (v === 'OK') return '<span class="cd-ok">✓ OK</span>';
    if (!v) return '<span class="sx-aide">—</span>';
    return `<span class="cd-ecart">${_otEsc(v)}</span>`;
  },

  _cdeHtmlActions() {
    const n = S.cde.sel.size;
    if (!n) return '';
    return `<div class="pb-actions-in">
      <b>${n} commande${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}</b>
      <button type="button" class="pb-action pb-action-etape" onclick="App.cdeExporter()">Fichier d'import EBP…</button>
      <button type="button" class="pb-action pb-action-discret" onclick="App.cdeSelTout(false)">Tout désélectionner</button>
    </div>`;
  },

  cdeFiltre(f) { S.cde.filtre = f; S.cde.sel = new Set(); this._cdeRendre(); },
  cdeRecherche(v) {
    S.cde.q = v;
    const corps = document.getElementById('pb-corps');
    if (corps) corps.innerHTML = this._cdeHtmlListe();
  },
  cdeSel(id, on) {
    if (on) S.cde.sel.add(id); else S.cde.sel.delete(id);
    this._cdeMajActions();
  },
  cdeSelTout(on) {
    S.cde.sel = new Set(on ? this._cdeListeFiltree().filter(c => c.statut !== 'annulee').map(c => c.id) : []);
    const corps = document.getElementById('pb-corps');
    if (corps) corps.innerHTML = this._cdeHtmlListe();
    this._cdeMajActions();
  },
  _cdeMajActions() {
    const bar = document.getElementById('cde-actions');
    if (!bar) return;
    bar.hidden = !S.cde.sel.size;
    bar.innerHTML = this._cdeHtmlActions();
  },

  /* ─ Import : lecture des PDF ─ */

  async _cdeLibs() {
    await Promise.all([_cdeScript(CDE_LIB.pdfjs), _cdeScript(CDE_LIB.pdflib)]);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDE_LIB.worker;
  },

  async cdeImporter(fichiers) {
    fichiers = [...(fichiers || [])].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!fichiers.length) return this.toast('Choisissez un ou plusieurs fichiers PDF');
    S.cde.imp = { etat: 'lecture', items: [], ignorees: [], progression: 'Chargement de la lecture des PDF…' };
    this._cdeRendre();
    try { await this._cdeLibs(); }
    catch (e) { S.cde.imp = null; this._cdeRendre(); return this.toast(e.message, 6000); }
    const imp = S.cde.imp;
    let n = 0;
    for (const f of fichiers) {
      try { await this._cdeLireFichier(f, imp, () => { this._cdeProgression('Lecture de ' + f.name + '…'); }); }
      catch (e) { imp.ignorees.push({ fichier: f.name, page: '', raison: 'illisible : ' + e.message }); }
      n++;
    }
    // Scans : OCR de Google Drive, une commande à la fois
    const scans = imp.items.filter(it => it.source === 'ocr' && !it.texte);
    for (let i = 0; i < scans.length; i++) {
      const it = scans[i];
      this._cdeProgression('OCR des scans : ' + (i + 1) + ' / ' + scans.length + '…');
      try {
        const r = await this._otPost({ action: 'cde_ocr', pdf: it.b64, nom: it.fichier + ' p' + it.pages[0] }, 120000);
        it.texte = r.texte || '';
        if (!/commande/i.test(it.texte) && !/Total\s+HT/i.test(it.texte)) {
          imp.ignorees.push({ fichier: it.fichier, page: it.pages.join(', '), raison: 'scan sans bon de commande reconnu' });
          it.ignorer = true;
        } else it.d = _cdeAnalyser(it.texte);
      } catch (e) { it.d = _cdeAnalyser(''); it.erreurOcr = e.message; }
    }
    imp.items = imp.items.filter(it => !it.ignorer);
    imp.items.forEach(it => { it.lu = Object.assign({}, it.d); });   // valeurs lues, avant corrections
    imp.etat = 'controle';
    this._cdeProgression('Contrôle des commandes…');
    await this._cdeControler(imp.items);
    this._cdeRendre();
  },

  _cdeProgression(texte) {
    if (!S.cde.imp) return;
    S.cde.imp.progression = texte;
    const el = document.getElementById('cd-progression');
    if (el) el.textContent = texte; else this._cdeRendre();
  },

  // Une commande commence à chaque page « Bon de commande » ; une page « 2 / 2 » s'ajoute à la précédente ;
  // une page sans texte (scan) est une commande à passer à l'OCR ; une page de texte sans bon (corps de mail) est ignorée.
  async _cdeLireFichier(f, imp, tic) {
    tic();
    const octets = new Uint8Array(await f.arrayBuffer());
    const doc = await window.pdfjsLib.getDocument({ data: octets.slice(), verbosity: 0 }).promise;
    const source = await window.PDFLib.PDFDocument.load(octets, { ignoreEncryption: true });
    const groupes = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const texte = _cdeLignesPage((await (await doc.getPage(p)).getTextContent()).items);
      const suite = texte.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/m);
      if (texte.replace(/\s/g, '').length < 20) groupes.push({ pages: [p], texte: '', source: 'ocr' });
      else if (/Bon\s+de\s+commande/i.test(texte) && /Total\s+HT|Commentaires/i.test(texte)) {
        const prec = groupes[groupes.length - 1];
        if (prec && prec.source === 'texte' && suite && Number(suite[1]) > 1 && !/\bNo\s*:/i.test(texte)) { prec.pages.push(p); prec.texte += '\n' + texte; }
        else groupes.push({ pages: [p], texte, source: 'texte' });
      } else if (suite && Number(suite[1]) > 1 && groupes.length && groupes[groupes.length - 1].source === 'texte') {
        const prec = groupes[groupes.length - 1]; prec.pages.push(p); prec.texte += '\n' + texte;
      } else imp.ignorees.push({ fichier: f.name, page: String(p), raison: (texte.split('\n')[0] || '').slice(0, 70) });
    }
    for (const g of groupes) {
      const neuf = await window.PDFLib.PDFDocument.create();
      (await neuf.copyPages(source, g.pages.map(p => p - 1))).forEach(pg => neuf.addPage(pg));
      const b64 = _cdeBase64(await neuf.save());
      imp.items.push({ id: imp.items.length + 1, fichier: f.name, pages: g.pages, source: g.source, texte: g.texte, b64,
        d: g.source === 'texte' ? _cdeAnalyser(g.texte) : null, coche: false });
    }
  },

  /* ─ Import : contrôle ─ */

  async _cdeControler(items) {
    items.forEach(it => {
      it.d = it.d || _cdeAnalyser('');
      const cands = this._cdeModules(it.d.ref_module);
      it.candidats = cands;
      if (!it.codeChoisi) it.code = cands.length ? String(cands[0].d.code || '').toUpperCase() : '';
    });
    let ver = [];
    try {
      const r = await this._otPost({ action: 'cde_verifier', lignes: items.map(it => ({ numero: it.d.numero, ref_module: it.d.ref_module, code: it.code })) }, 60000);
      ver = r.lignes || [];
    } catch (e) { this.toast('Contrôle impossible : ' + e.message, 6000); }
    items.forEach((it, i) => {
      it.ver = ver[i] || null;
      // Module absent du Planning : code trouvé par l'historique des OT (même n° de module)
      if (!it.code && it.ver && it.ver.ot && it.ver.ot.code) { it.code = it.ver.ot.code; it.codeParOt = true; }
      this._cdeAlertes(it);
    });
    // Le même n° deux fois dans l'import
    const vus = {};
    items.forEach(it => { if (it.d.numero) (vus[it.d.numero] = vus[it.d.numero] || []).push(it); });
    Object.values(vus).filter(l => l.length > 1).forEach(l => l.slice(1).forEach(it => {
      it.alertes.unshift({ niv: 'bloque', texte: 'En double dans cet import (même n° de commande)' }); it.coche = false; }));
  },

  _cdeAlertes(it) {
    const d = it.d, a = [];
    const bloque = t => a.push({ niv: 'bloque', texte: t }), attention = t => a.push({ niv: 'attention', texte: t }), info = t => a.push({ niv: 'info', texte: t });
    if (it.erreurOcr) bloque('OCR impossible : ' + it.erreurOcr);
    if (!d.numero || !/^[0-9A-Za-z-]{4,20}$/.test(d.numero)) bloque('N° de commande illisible');
    if (d.total_ht == null) bloque('Montant HT illisible');
    if (!d.ref_module) attention('N° du module illisible (Commentaires)');
    if (it.ver && it.ver.deja) bloque('Déjà enregistrée' + (it.ver.deja.code ? ' (' + it.ver.deja.code + ')' : '') + ' le ' + new Date(it.ver.deja.le).toLocaleDateString('fr-FR'));
    const m = it.code ? this._cdeModuleParCode(it.code) : null;
    it.module = m;
    if (!it.code) bloque('Module introuvable au Planning et dans les OT : choisir le code (Vérifier / corriger)');
    else if (it.codeParOt) attention('Module absent du Planning — code trouvé par l’historique des OT');
    if (it.candidats && it.candidats.length > 1 && !it.codeChoisi) attention(it.candidats.length + ' passages de ce module au Planning : vérifier le code');
    // Agence : celle de la commande, sinon celle du Planning
    const agPlan = m ? (m.d.ag || ((m.d.chantier || '').match(/^(\d{3,6})/) || [])[1] || '') : '';
    if (!d.client && agPlan) { d.client = String(agPlan).padStart(4, '0'); it.clientParPlanning = true; info('Agence absente du bon : ' + d.client + ' prise au Planning'); }
    else if (!d.client) attention('Code agence absent du bon');
    else if (agPlan && _cdeAgence(agPlan) !== _cdeAgence(d.client)) attention('Agence ' + d.client + ' sur le bon, ' + agPlan + ' au Planning');
    // Prix
    const ot = it.ver && it.ver.ot;
    if (ot && ot.total != null && d.total_ht != null) {
      if (Math.abs(Number(ot.total) - Number(d.total_ht)) > 0.01) attention('Montant ' + _cdeEuros(d.total_ht) + ' ≠ OT ' + _cdeEuros(ot.total));
      if (ot.statut === 'a_valider') info('OT comparé : fiche pas encore validée');
    } else if (it.code) attention('Aucun OT trouvé pour ce module');
    if (it.ver && it.ver.autres && it.ver.autres.length) attention('Autre commande sur ce module : ' + it.ver.autres.join(', '));
    if (m && m.d.commande && String(m.d.commande).trim() !== d.numero) attention('Le Planning a déjà la commande ' + m.d.commande);
    if (m && m.parti) info('Module parti');
    else if (m && !(m.d.status && m.d.status.termine)) info('Module pas encore terminé');
    if (it.source === 'ocr') attention('Lu par OCR : vérifier les valeurs');
    it.alertes = a;
    it.bloque = a.some(x => x.niv === 'bloque');
    it.coche = !it.bloque && (it.corrige || !a.some(x => x.niv === 'attention'));
    it.verif = !it.code ? 'CODE NON TROUVE' : !(ot && ot.total != null) ? 'SANS OT'
      : Math.abs(Number(ot.total) - Number(d.total_ht)) > 0.01 ? 'ECART PDF=' + d.total_ht + ' OT=' + Number(ot.total) : 'OK';
  },

  _cdeHtmlBarreImport() {
    const imp = S.cde.imp;
    if (imp.etat === 'lecture') return `<div class="pb-ligne"><span id="cd-progression" class="cd-progression">${_otEsc(imp.progression || '')}</span></div>`;
    const prets = imp.items.filter(it => it.coche && !it.bloque).length;
    const bloques = imp.items.filter(it => it.bloque).length;
    return `<div class="pb-ligne">
      <span class="cd-resume"><b>${imp.items.length}</b> bon${imp.items.length > 1 ? 's' : ''} lu${imp.items.length > 1 ? 's' : ''} ·
        <span class="cd-ok">${prets} à enregistrer</span>${bloques ? ` · <span class="cd-bloque">${bloques} bloqué${bloques > 1 ? 's' : ''}</span>` : ''}
        ${imp.ignorees.length ? ` · ${imp.ignorees.length} page${imp.ignorees.length > 1 ? 's' : ''} ignorée${imp.ignorees.length > 1 ? 's' : ''}` : ''}</span>
      <span class="cd-espace"></span>
      <button type="button" class="pb-bouton" onclick="App.cdeAbandonner()">Abandonner</button>
      <button type="button" class="sx-btn sx-btn-principal" ${prets && !imp.enCours ? '' : 'disabled'} onclick="App.cdeEnregistrer()">${imp.enCours ? 'Enregistrement…' : 'Enregistrer ' + prets + ' commande' + (prets > 1 ? 's' : '')}</button>
    </div>
    <p class="sx-aide cd-aide">Cochée d’office : lue sans alerte. Une ligne avec un point d’attention se coche à la main après vérification ; une ligne bloquée se corrige d’abord.</p>`;
  },

  _cdeHtmlImport() {
    const imp = S.cde.imp;
    if (imp.etat === 'lecture') return '<div class="sx-chargement">Lecture en cours… (les scans passent par l’OCR de Google Drive, quelques secondes chacun)</div>';
    if (!imp.items.length) return `<div class="sx-carte"><div class="sx-vide">Aucun bon de commande trouvé dans ce PDF.</div></div>${this._cdeHtmlIgnorees()}`;
    const niv = { bloque: 'cd-al-bloque', attention: 'cd-al-attention', info: 'cd-al-info' };
    return `<div class="sx-carte cd-tableau-cadre"><table class="cd-tableau">
      <thead><tr><th class="cd-case"></th><th>N° commande</th><th>Module</th><th>Agence</th><th class="cd-num">Montant HT</th><th class="cd-num">OT</th><th>Contrôle</th><th></th></tr></thead><tbody>
      ${imp.items.map(it => {
        const d = it.d, ot = it.ver && it.ver.ot, m = it.module;
        return `<tr class="${it.bloque ? 'cd-ligne-bloquee' : ''}">
          <td class="cd-case"><input type="checkbox" ${it.coche ? 'checked' : ''} ${it.bloque || imp.enCours ? 'disabled' : ''} aria-label="Enregistrer ${_otEsc(d.numero)}" onclick="App.cdeCocher(${it.id}, this.checked)"></td>
          <td><b>${_otEsc(d.numero || '?')}</b>${it.source === 'ocr' ? ' <span class="cd-badge">OCR</span>' : ''}
            <div class="sx-aide">${_otEsc(_cdeEbpDate(d.date_commande))}${d.affaire ? ' · ' + _otEsc(d.affaire) : ''}</div></td>
          <td><b>${_otEsc(it.code || '—')}</b> <span class="sx-aide">n° ${_otEsc(d.ref_module || '?')}</span>
            ${m ? `<div class="sx-aide">${_otEsc([m.d.module, m.parti ? 'parti' : ((PB_ETAPES.find(e => e.cle === this._pbEtape(m.d, false)) || {}).nom || '')].filter(Boolean).join(' · '))}</div>` : ''}</td>
          <td>${_otEsc(d.client || '?')} <div class="sx-aide">${_otEsc(d.destination || '')}</div></td>
          <td class="cd-num">${_cdeEuros(d.total_ht)}</td>
          <td class="cd-num">${ot ? _cdeEuros(ot.total) + `<div class="sx-aide">${_otEsc(ot.numero || '')}</div>` : '—'}</td>
          <td class="cd-alertes">${it.alertes.length ? it.alertes.map(x => `<div class="${niv[x.niv]}">${_otEsc(x.texte)}</div>`).join('') : '<span class="cd-ok">✓ Conforme</span>'}
            ${it.erreurEnr ? `<div class="cd-al-bloque">Enregistrement : ${_otEsc(it.erreurEnr)}</div>` : ''}</td>
          <td class="cd-fin"><button type="button" class="cd-lien" ${imp.enCours ? 'disabled' : ''} onclick="App.cdeCorriger(${it.id})">Vérifier / corriger…</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>${this._cdeHtmlIgnorees()}`;
  },

  _cdeHtmlIgnorees() {
    const ig = S.cde.imp.ignorees;
    if (!ig.length) return '';
    return `<details class="sx-carte cd-ignorees"><summary>${ig.length} page${ig.length > 1 ? 's' : ''} ignorée${ig.length > 1 ? 's' : ''} (pas un bon de commande)</summary>
      <ul>${ig.map(x => `<li>${_otEsc(x.fichier)}${x.page ? ' · page ' + _otEsc(x.page) : ''} — <span class="sx-aide">${_otEsc(x.raison)}</span></li>`).join('')}</ul></details>`;
  },

  cdeCocher(id, on) {
    const it = S.cde.imp.items.find(x => x.id === id);
    if (it && !it.bloque) it.coche = on;
    this._cdeRendre();
  },

  cdeVoirPdf(id) {
    const it = S.cde.imp.items.find(x => x.id === id);
    if (!it) return;
    const url = URL.createObjectURL(new Blob([_cdeOctets(it.b64)], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  async cdeAbandonner() {
    const imp = S.cde.imp;
    if (imp && imp.items.some(it => !it.enregistre) && imp.etat !== 'lecture') {
      const ok = await this._otConfirmer({ titre: 'Abandonner l’import ?', texte: 'Les commandes lues et non enregistrées seront oubliées (le PDF reste sur votre appareil).', ok: 'Abandonner' });
      if (!ok) return;
    }
    S.cde.imp = null;
    this._cdeRendre();
  },

  // Aperçu du bon dans la fenêtre de correction : pages dessinées par pdf.js (déjà chargé pour la lecture),
  // ce qui marche aussi sur téléphone, où un PDF dans un cadre ne s'affiche pas toujours.
  async _cdeApercu(it, cadre) {
    try {
      await this._cdeLibs();
      const doc = await window.pdfjsLib.getDocument({ data: _cdeOctets(it.b64), verbosity: 0 }).promise;
      cadre.innerHTML = '';
      const largeur = Math.max(320, cadre.clientWidth - 2);
      for (let p = 1; p <= doc.numPages; p++) {
        if (!cadre.isConnected) return;
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const ech = largeur / base.width * Math.min(2, window.devicePixelRatio || 1);
        const vue = page.getViewport({ scale: ech });
        const toile = document.createElement('canvas');
        toile.width = Math.round(vue.width); toile.height = Math.round(vue.height);
        toile.className = 'cd-apercu-page';
        cadre.appendChild(toile);
        await page.render({ canvasContext: toile.getContext('2d'), viewport: vue }).promise;
      }
    } catch (e) {
      cadre.innerHTML = '<div class="sx-vide">Aperçu impossible — « Ouvrir le PDF » pour le voir dans un onglet.</div>';
    }
  },

  // Fenêtre de vérification / correction : le PDF à gauche (au-dessus sur téléphone), les champs à droite.
  async cdeCorriger(id) {
    const it = S.cde.imp.items.find(x => x.id === id);
    if (!it) return;
    const d = it.d, lu = it.lu || {};
    const cands = it.candidats || [];
    const champ = (cle, libelle, val, aide = '') => `<label class="cd-champ"><span>${libelle}</span>
      <input class="sx-champ" data-c="${cle}" value="${_otEsc(val == null ? '' : val)}" autocomplete="off">
      ${aide ? `<span class="sx-aide">${_otEsc(aide)}</span>` : ''}</label>`;
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre cd-fenetre" role="dialog" aria-modal="true" aria-labelledby="cd-cor-titre">
      <div class="cd-fenetre-pdf"><div class="cd-apercu" aria-label="Aperçu du bon de commande"><div class="sx-chargement">Aperçu du PDF…</div></div>
        <button type="button" class="cd-lien" data-pdf="1">Ouvrir le PDF dans un onglet</button></div>
      <div class="cd-fenetre-champs">
      <h3 id="cd-cor-titre">Vérifier la commande ${_otEsc(d.numero || '')}</h3>
      <p class="sx-aide">${_otEsc(it.fichier)} · page ${_otEsc(it.pages.join(', '))} · lu ${it.source === 'ocr' ? 'par OCR' : 'dans le texte du PDF'}</p>
      ${champ('numero', 'N° de commande', d.numero, lu.numero && lu.numero !== d.numero ? 'lu : ' + lu.numero : '')}
      ${champ('ref_module', 'N° du module (Commentaires)', d.ref_module, lu.ref_module && lu.ref_module !== d.ref_module ? 'lu : ' + lu.ref_module : '')}
      ${cands.length > 1 ? `<label class="cd-champ"><span>Passage au Planning</span><select class="sx-select" data-c="choix">
          ${cands.map(c => `<option value="${_otEsc(c.d.code)}" ${String(c.d.code).toUpperCase() === it.code ? 'selected' : ''}>${_otEsc(c.d.code)} — ${c.parti ? 'parti le ' + _otEsc(_fmtDateShort(c.d.fin)) : 'sur parc'}</option>`).join('')}
        </select></label>` : ''}
      ${champ('code', 'Code SONOTRAD du module', it.code, 'Colonne B du Planning — laisser vide pour le retrouver par le n° du module')}
      ${champ('total_ht', 'Montant HT (€)', d.total_ht == null ? '' : String(d.total_ht).replace('.', ','), lu.total_ht != null && lu.total_ht !== d.total_ht ? 'lu : ' + _cdeEuros(lu.total_ht) : '')}
      ${champ('client', 'Code agence', d.client)}
      ${champ('date_commande', 'Date de commande (jj/mm/aa)', _cdeEbpDate(d.date_commande))}
      ${champ('affaire', 'N° d’affaire', d.affaire)}
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
        <button type="button" class="sx-btn sx-btn-principal" data-r="1">Appliquer et recontrôler</button>
      </div></div></div>`;
    const choix = await new Promise(resolve => {
      const fin = v => { voile.remove(); resolve(v); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(null);
        if (e.target.closest('[data-pdf]')) return this.cdeVoirPdf(id);
        const r = e.target.closest('[data-r]');
        if (!r) return;
        if (r.dataset.r === '0') return fin(null);
        const v = {};
        voile.querySelectorAll('[data-c]').forEach(x => { v[x.dataset.c] = x.value.trim(); });
        fin(v);
      });
      voile.addEventListener('change', e => {
        if (e.target.dataset.c === 'choix') voile.querySelector('[data-c="code"]').value = e.target.value;
      });
      document.body.appendChild(voile);
      voile.querySelector('[data-c="numero"]').focus({ preventScroll: true });
      this._cdeApercu(it, voile.querySelector('.cd-apercu'));
    });
    if (!choix) return;
    d.numero = choix.numero.replace(/\s+/g, '');
    d.ref_module = choix.ref_module.replace(/\s+/g, '');
    d.total_ht = _cdeNombre(choix.total_ht);
    d.client = choix.client;
    d.date_commande = _cdeDate(choix.date_commande) || d.date_commande;
    d.affaire = choix.affaire;
    it.code = choix.code.toUpperCase();
    it.codeChoisi = !!it.code;
    it.codeParOt = false;
    it.clientParPlanning = false;
    it.corrige = true;
    it.erreurEnr = '';
    await this._cdeControler([it]);
    this._cdeRendre();
  },

  /* ─ Enregistrement ─ */

  async cdeEnregistrer() {
    const imp = S.cde.imp;
    const aFaire = imp.items.filter(it => it.coche && !it.bloque && !it.enregistre);
    if (!aFaire.length || imp.enCours) return;
    imp.enCours = true;
    this._cdeRendre();
    let faits = 0; const notes = [];
    for (const it of aFaire) {
      this.toast('⏳ ' + (faits + 1) + ' / ' + aFaire.length + ' — commande ' + it.d.numero + '…', 60000);
      const d = it.d, ot = it.ver && it.ver.ot;
      const commande = {
        numero: d.numero, date_commande: d.date_commande, quantite: d.quantite, libelle: d.libelle, total_ht: d.total_ht,
        affaire: d.affaire, ref_module: d.ref_module, destination: d.destination, client: d.client, adresse: d.adresse,
        date_souhaitee: d.date_souhaitee, code_planning: it.code, ot_numero: ot ? ot.numero : '', ot_total: ot ? ot.total : '',
        verif_prix: it.verif, source: it.corrige && it.source === 'texte' ? 'manuel' : it.source,
      };
      try {
        const r = await this._otPost({ action: 'cde_enregistrer', commande, pdf: it.b64, nom: it.fichier }, 90000);
        it.enregistre = true; faits++;
        const p = String(r.planning || '');
        if (p === 'ecrit' && it.module) it.module.d.commande = d.numero;
        if (p.startsWith('autre:')) notes.push(d.numero + ' : le Planning garde la commande ' + p.slice(6));
        else if (p.startsWith('erreur:')) notes.push(d.numero + ' : Planning non mis à jour (' + p.slice(7) + ')');
        else if (p === 'absent') notes.push(d.numero + ' : module absent du Planning (commande enregistrée)');
      } catch (e) { it.erreurEnr = e.message; }
    }
    imp.enCours = false;
    imp.items = imp.items.filter(it => !it.enregistre);
    const echecs = imp.items.filter(it => it.erreurEnr).length;
    this.toast('✓ ' + faits + ' commande' + (faits > 1 ? 's' : '') + ' enregistrée' + (faits > 1 ? 's' : '')
      + (echecs ? ' — ' + echecs + ' en échec (voir la liste)' : '') + (notes.length ? ' — ' + notes.join(' ; ') : ''), notes.length || echecs ? 12000 : 4000);
    if (!imp.items.length) { S.cde.imp = null; S.cde.filtre = 'aexporter'; }
    await this._cdeCharger(true);
    this._cdeRendre();
  },

  async cdeAnnuler(id) {
    const c = (S.cde.liste || []).find(x => x.id === id);
    if (!c) return;
    const motif = await new Promise(resolve => {
      const voile = document.createElement('div');
      voile.className = 'sx-voile';
      voile.innerHTML = `<div class="sx-fenetre pb-fenetre" role="dialog" aria-modal="true" aria-labelledby="cd-an-titre">
        <h3 id="cd-an-titre">Annuler la commande ${_otEsc(c.numero)} ?</h3>
        <p class="sx-aide">La ligne reste visible (« Annulées ») et le n° peut être réimporté. Le n° est retiré du Planning s’il y est encore et qu’aucune LV n’est faite.</p>
        <label class="cd-champ"><span>Motif</span><input class="sx-champ" id="cd-an-motif" placeholder="ex. erreur de lecture, commande remplacée…"></label>
        <div class="sx-fenetre-boutons">
          <button type="button" class="sx-btn sx-btn-discret" data-r="0">Retour</button>
          <button type="button" class="sx-btn sx-btn-principal" data-r="1">Annuler la commande</button>
        </div></div>`;
      const fin = v => { voile.remove(); resolve(v); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(null);
        const r = e.target.closest('[data-r]');
        if (!r) return;
        if (r.dataset.r === '0') return fin(null);
        const m = voile.querySelector('#cd-an-motif').value.trim();
        if (!m) { voile.querySelector('#cd-an-motif').focus(); return; }
        fin(m);
      });
      document.body.appendChild(voile);
      voile.querySelector('#cd-an-motif').focus();
    });
    if (!motif) return;
    try {
      const r = await this._otPost({ action: 'cde_annuler', id, motif }, 60000);
      const p = String(r.planning || '');
      const m = this._cdeModuleParCode(c.code_planning);
      if (p === 'retire' && m) m.d.commande = '';
      this.toast('Commande ' + c.numero + ' annulée' + (p === 'garde_lv' ? ' — le Planning la garde (LV déjà faite)' : p === 'retire' ? ' — retirée du Planning' : ''), 5000);
      S.cde.sel.delete(id);
      await this._cdeCharger(true);
    } catch (e) { this.toast('Annulation impossible : ' + e.message, 6000); }
  },

  /* ─ Export EBP ─ */

  async cdeExporter() {
    const choisies = (S.cde.liste || []).filter(c => S.cde.sel.has(c.id) && c.statut !== 'annulee').sort((a, b) => a.id - b.id);
    if (!choisies.length) return;
    const deja = choisies.filter(c => c.ebp_le).length;
    const ecarts = choisies.filter(c => c.verif_prix && c.verif_prix !== 'OK');
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre" role="dialog" aria-modal="true" aria-labelledby="cd-ebp-titre">
      <h3 id="cd-ebp-titre">Fichier d’import EBP — ${choisies.length} commande${choisies.length > 1 ? 's' : ''}</h3>
      <p class="sx-aide">Même format que le lecteur de commandes : CSV pour EBP (Windows-1252, « ; »), et la même chose en Excel pour contrôle.</p>
      ${deja ? `<p class="cd-al-attention">${deja} déjà exportée${deja > 1 ? 's' : ''} : attention au double import dans EBP.</p>` : ''}
      ${ecarts.length ? `<div class="cd-al-attention">Vérif prix à revoir :<ul>${ecarts.map(c => `<li>${_otEsc(c.numero)} (${_otEsc(c.code_planning || '?')}) : ${_otEsc(c.verif_prix)}</li>`).join('')}</ul></div>` : '<p class="cd-ok">Tous les prix correspondent aux OT.</p>'}
      <label class="pb-et-decote"><input type="checkbox" id="cd-ebp-marquer" checked> Marquer comme exportées au téléchargement du CSV</label>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="0">Fermer</button>
        <button type="button" class="sx-btn sx-btn-discret" data-r="xlsx">Excel (.xlsx)</button>
        <button type="button" class="sx-btn sx-btn-principal" data-r="csv">CSV pour EBP</button>
      </div></div>`;
    const horo = new Date(), p2 = n => String(n).padStart(2, '0');
    const nom = 'import_EBP_' + horo.getFullYear() + p2(horo.getMonth() + 1) + p2(horo.getDate()) + '_' + p2(horo.getHours()) + p2(horo.getMinutes()) + p2(horo.getSeconds());
    let marque = false;
    voile.addEventListener('click', async e => {
      if (e.target === voile) return voile.remove();
      const r = e.target.closest('[data-r]');
      if (!r) return;
      if (r.dataset.r === '0') return voile.remove();
      if (r.dataset.r === 'xlsx') return this._cdeTelecharger(this._cdeEbpXlsx(choisies), nom + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      this._cdeTelecharger(_cdeEbpCsv(choisies), nom + '.csv', 'text/csv;charset=windows-1252');
      if (!marque && voile.querySelector('#cd-ebp-marquer').checked) {
        marque = true;
        try {
          const res = await this._otPost({ action: 'cde_ebp', ids: choisies.map(c => c.id) }, 60000);
          this.toast('✓ ' + res.nb + ' commande' + (res.nb > 1 ? 's' : '') + ' marquée' + (res.nb > 1 ? 's' : '') + ' exportée' + (res.nb > 1 ? 's' : ''), 4000);
          S.cde.sel = new Set();
          this._cdeCharger(true);
        } catch (err) { marque = false; this.toast('CSV téléchargé, mais marquage impossible : ' + err.message, 8000); }
      }
    });
    document.body.appendChild(voile);
  },

  // Même contenu que le CSV, colonnes au même format que le .xlsx v6 (n° de commande, réf. module, à facturer en texte).
  _cdeEbpXlsx(commandes) {
    const ws = XLSX.utils.aoa_to_sheet([CDE_EBP_ENTETE].concat(_cdeEbpLignes(commandes)));
    const texte = [3, 8, 10];
    for (let r = 1; r <= commandes.length; r++) texte.forEach(c => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
    });
    ws['!cols'] = [14, 13, 22, 14, 14, 10, 12, 18, 14, 22, 12, 10, 55].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Commandes');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  },

  _cdeTelecharger(donnees, nom, type) {
    const url = URL.createObjectURL(new Blob([donnees], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
});
