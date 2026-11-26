/* ═══════════════════════════════════════════════════════════════════════════
   Ordres d'expédition LOXAM (2026-11-20) — vue « Expéditions » de Production (admins + activité LOXAM).
   L'ordre d'expédition (« commande de transport », fournisseur MESNAGER TRANSPORTS) déclenche la LV : son n° va
   au Planning (U) et dans Demandes (N) pour chacun de ses modules, puis sur la LV (« Commande n° ») ; le bon de
   transfert (page 2 du scan) va dans « Doc annexe » (« BT 78395 »). Les commandes de reconditionnement, elles,
   sont dans Reconditionnement › Commandes (commandes.js, dont ce module reprend la lecture des PDF et l'aperçu).
   1. Import : PDF lu par pdf.js ; page sans texte (scan, le cas habituel) → OCR de Google Drive (exp_ocr), page par
      page. Une page « Bon de commande » ouvre un ordre ; une page « BON DE TRANSFERT » s'y rattache.
   2. Lecture tolérante à l'OCR (blocs mélangés) : n° après « No: », modules = n° des Commentaires, agence =
      « POUR … 7303 », « A PARTIR DU », adresse « Expédier l'article ci-dessus à », BT = « N° » du bon de transfert.
   3. Contrôle : modules retrouvés au Planning (par n° de module), agence, étape, commande / LV déjà présentes.
   4. Enregistrement (exp_enregistrer), correction (exp_modifier), annulation (exp_annuler : les LV faites sur ses
      modules non partis sont annulées aussi, après avertissement), « Créer la LV » pré-remplie.
   ═══════════════════════════════════════════════════════════════════════════ */

const EXP_FOURN_TRANSPORT = /MESNAGER\s+TRANSPORTS|Fourn\s*[.:]?\s*:?\s*130519023/i;
const EXP_FOURN_RECOND = /Nr\.?\s*Fourn\s*[.:]?\s*:?\s*9869\b/i;

// « 6/11/26 », « 06/11/2026 », « 30/11 » (année prise sur la date de référence, l'année suivante si besoin) → AAAA-MM-JJ
function _expDate(s, refIso) {
  const m = String(s || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (!m) return '';
  const j = Number(m[1]), mo = Number(m[2]);
  if (!j || j > 31 || !mo || mo > 12) return '';
  let a = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : 0;
  if (!a) {
    const ref = refIso ? new Date(refIso + 'T12:00:00') : new Date();
    a = ref.getFullYear();
    const d = new Date(a, mo - 1, j);
    if (d < new Date(ref.getTime() - 60 * 86400000)) a++;       // « 05/01 » commandé en décembre → l'année suivante
  }
  return a + '-' + String(mo).padStart(2, '0') + '-' + String(j).padStart(2, '0');
}

// N° de module LOXAM : 5 à 10 caractères, au moins 5 chiffres (« 60151669 », « 22604022 »).
function _expEstModule(s) { return /^[A-Z0-9]{5,10}$/i.test(s) && (s.match(/\d/g) || []).length >= 5; }

// Lecture d'un ordre (texte des pages « Bon de commande ») et de son bon de transfert (texte à part).
function _expAnalyser(texte, texteBt) {
  const t = String(texte || '').replace(/\r/g, '');
  const L = t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const idx = (re, depuis = 0) => { for (let i = depuis; i < L.length; i++) if (re.test(L[i])) return i; return -1; };
  const d = { modules: [] };
  d.transport = EXP_FOURN_TRANSPORT.test(t);
  d.recond = !d.transport && EXP_FOURN_RECOND.test(t);

  const iCom = idx(/^Commentaires\s*:?/i);
  const iQte = idx(/^Qt[ée](\s|$)/i);
  const finEntete = iCom >= 0 ? iCom : iQte >= 0 ? iQte : L.length;
  // N° : sur la ligne « No: » (PDF texte), sinon premier nombre seul après « No: » et avant les Commentaires (OCR)
  const surLigne = t.match(/\bNo\s*[:.]\s*([0-9][0-9 ]{4,})/i);
  if (surLigne) d.numero = _cdeDedouble(surLigne[1]);
  if (!d.numero || d.numero.length > 9) {
    const iNo = idx(/^No\s*[:.]?\s*$/i);
    for (let i = Math.max(0, iNo); i < finEntete; i++) {
      const m = L[i].match(/^(\d{5,9})$/);
      if (m && m[1] !== '130519023' && m[1] !== '9869') { d.numero = _cdeDedouble(m[1]); break; }
    }
  }
  d.numero = d.numero || '';
  // Date de commande : sur la ligne, sinon première date après « Date Commande »
  const dl = t.match(/Date\s+Commande\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (dl) d.date_commande = _expDate(dl[1]);
  else {
    const iD = idx(/Date\s+Commande/i);
    for (let i = Math.max(0, iD); iD >= 0 && i < Math.min(L.length, iD + 12); i++) {
      const m = L[i].match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (m) { d.date_commande = _expDate(m[1]); break; }
    }
  }
  d.date_commande = d.date_commande || '';

  // Commentaires : n° de modules, « POUR <ville> <agence> », « A PARTIR DU … »
  if (iCom >= 0) {
    for (let i = iCom + 1; i < L.length; i++) {
      if (/^Exp[ée]dier\s+l|^Date\s+souhait|^Adresse\s+de\s+factu/i.test(L[i])) break;
      const morceaux = L[i].split(' ');
      if (morceaux.every(_expEstModule)) morceaux.forEach(r => { if (!d.modules.some(x => x.ref === r)) d.modules.push({ ref: r, code: '' }); });
    }
  }
  const pour = t.match(/^\s*POUR\s+(.+?)\s*$/im);
  d.destination = pour ? pour[1].replace(/\s+/g, ' ').trim() : '';
  d.agence = (d.destination.match(/(\d{3,5})\s*$/) || [])[1] || '';
  const ap = t.match(/A\s+PARTIR\s+DU\s*:?\s*(\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)/i);
  d.a_partir_du = ap ? _expDate(ap[1], d.date_commande) : '';

  // Adresse : le « Expédier l'article ci-dessus à » qui suit les Commentaires (sinon le dernier)
  let iE = iCom >= 0 ? idx(/^Exp[ée]dier\s+l.article/i, iCom) : -1;
  if (iE < 0) for (let i = L.length - 1; i >= 0; i--) if (/^Exp[ée]dier\s+l.article/i.test(L[i])) { iE = i; break; }
  const adr = [];
  for (let i = iE + 1; iE >= 0 && i < L.length && adr.length < 5; i++) {
    if (/^Date\s+(souhait|pr[ée]vue)|^Adresse\s+de|^\d+\s*\/\s*\d+$|^\d+[.,]\d{2}$|^SOUS\s+ENSEMBLE|^Commentaires/i.test(L[i])) break;
    if (L[i] !== '.') adr.push(L[i]);
  }
  d.adresse = adr.join(' | ');

  // Bon de transfert : « N° 78395 » (le « N° LOCATION » de la colonne n'est pas suivi d'un nombre)
  const bt = String(texteBt || '');
  const nb = bt.match(/N\s*[°º]\s*:?\s*\n?\s*(\d{4,7})\b/);
  d.bt = nb ? nb[1] : '';
  if (!d.bt && bt) {
    const refs = new Set(d.modules.map(x => x.ref));
    const seul = bt.split('\n').map(l => l.trim()).find(l => /^\d{5,6}$/.test(l) && !refs.has(l));
    d.bt = seul || '';
  }
  return d;
}

Object.assign(App, {

  _expPeut() { return this._pbPeutEtape(); },

  /* ─ Données ─ */

  _expEtat() {
    S.exp = S.exp || { liste: null, chargement: false, filtre: 'actives', q: '', imp: null };
    return S.exp;
  },

  async _expCharger(force = false) {
    const E = this._expEtat();
    const attentes = [];
    if ((force || !E.liste) && !E.chargement) {
      E.chargement = true;
      attentes.push(this._otGet({ action: 'exp_liste' }, 60000)
        .then(d => { E.liste = d.expeditions || []; })
        .catch(e => { E.liste = E.liste || []; this.toast('Expéditions indisponibles : ' + e.message, 5000); })
        .finally(() => { E.chargement = false; }));
    }
    this._recCharger(force);   // « Commandes reçues » (relève Outlook), en arrière-plan
    if (force || (!S.depsLoaded && !S.depsLoading)) attentes.push(this._pbChargerProduction());
    if (!S.archiveLoaded) attentes.push(this._pbChargerArchive());
    if (!attentes.length) return;
    this._expRendre();
    await Promise.allSettled(attentes);
    this._expRendre();
  },

  // Module d'une expédition : celui du Planning (code connu), sinon retrouvé par son n° (sur parc d'abord).
  _expModule(x) {
    if (x.code) return this._cdeModuleParCode(x.code);
    const c = this._cdeModules(x.ref);
    return c.length ? c[0] : null;
  },

  _expEtapeTexte(m) {
    if (!m) return 'absent du Planning';
    if (m.parti) return 'parti';
    return (PB_ETAPES.find(e => e.cle === this._pbEtape(m.d, false)) || {}).nom || '';
  },

  /* ─ Écran ─ */

  _expRendre() {
    const el = document.getElementById('prod-bureau-root');
    if (!el || S.view !== 'prod-bureau' || !S.pb || S.pb.vue !== 'exp') return;
    const E = this._expEtat(), imp = E.imp;
    const actives = (E.liste || []).filter(x => x.statut !== 'annulee');
    const aFaire = actives.filter(x => this._expLvAFaire(x).length).length;
    const sous = imp ? (imp.etat === 'lecture' ? 'lecture des PDF…' : imp.items.length + ' ordre' + (imp.items.length > 1 ? 's' : '') + ' lu' + (imp.items.length > 1 ? 's' : ''))
      : (E.liste ? aFaire + ' LV à faire' : 'chargement…');
    el.innerHTML = `<div class="sx-ecran pb-ecran">
      ${this._otEntete({ retour: { texte: 'LOXAM', action: 'App.go(\'loxam-menu\')' }, titre: 'Production',
        sousTitre: 'Expéditions · ' + sous, large: true, bandeau: this._pbNav('exp') })}
      <div class="pb-barre"><div class="pb-barre-in">${imp ? this._expHtmlBarreImport() : this._expHtmlBarreListe(aFaire)}</div></div>
      <main class="pb-contenu" id="pb-corps">${imp ? this._expHtmlImport() : this._expHtmlListe()}</main>
    </div>`;
  },

  _expHtmlBarreListe(aFaire) {
    const E = S.exp;
    const f = (cle, nom) => `<button type="button" class="pb-onglet" aria-pressed="${E.filtre === cle}" onclick="App.expFiltre('${cle}')">${nom}</button>`;
    return `<div class="pb-ligne">
        <label class="sx-btn sx-btn-principal cd-importer">Importer des ordres d’expédition (PDF)…
          <input type="file" accept="application/pdf,.pdf" multiple hidden onchange="App.expImporter(this.files);this.value=''"></label>
        <div class="sx-recherche pb-recherche">${_OT_SVG_LOUPE}
          <label for="exp-q" class="sx-sr">Rechercher</label>
          <input id="exp-q" type="search" placeholder="N° de commande, BT, code, n° module, agence…" value="${_otEsc(E.q)}" oninput="App.expRecherche(this.value)">
        </div>
        ${this._recBouton('exp')}
        <button type="button" class="pb-bouton" onclick="App._expCharger(true)">Actualiser</button>
      </div>
      <div class="pb-ligne pb-defile" role="group" aria-label="Filtre">
        ${f('afaire', 'LV à faire <b>' + aFaire + '</b>')}${f('actives', 'En cours')}${f('annulees', 'Annulées')}
      </div>`;
  },

  expFiltre(f) { S.exp.filtre = f; this._expRendre(); },
  expRecherche(v) {
    S.exp.q = v;
    const corps = document.getElementById('pb-corps');
    if (corps) corps.innerHTML = this._expHtmlListe();
  },

  // Modules d'une expédition encore sans LV et non partis.
  _expLvAFaire(x) {
    if (x.statut === 'annulee') return [];
    return (x.modules || []).map(mo => this._expModule(mo)).filter(m => m && !m.parti && !m.d.lv);
  },

  _expListeFiltree() {
    const E = S.exp;
    let l = E.liste || [];
    if (E.filtre === 'annulees') l = l.filter(x => x.statut === 'annulee');
    else if (E.filtre === 'afaire') l = l.filter(x => this._expLvAFaire(x).length);
    else l = l.filter(x => x.statut !== 'annulee');
    const q = E.q.trim().toLowerCase();
    if (q) l = l.filter(x => [x.numero, x.bt, x.agence, x.destination, ...(x.modules || []).flatMap(m => [m.ref, m.code])]
      .some(v => String(v || '').toLowerCase().includes(q)));
    return l;
  },

  _expHtmlListe() {
    const E = S.exp;
    if (!E.liste) return '<div class="sx-chargement">Chargement des expéditions…</div>';
    const l = this._expListeFiltree();
    if (!l.length) return `<div class="sx-carte"><div class="sx-vide">${E.filtre === 'annulees' ? 'Aucune expédition annulée.' : 'Aucune expédition. « Importer des ordres d’expédition » pour en ajouter.'}</div></div>`;
    return `<div class="sx-carte cd-tableau-cadre"><table class="cd-tableau">
      <thead><tr><th>N° commande</th><th>Agence</th><th>À partir du</th><th>Modules</th><th>LV</th><th></th></tr></thead><tbody>
      ${l.map(x => {
        const annulee = x.statut === 'annulee';
        const mods = (x.modules || []).map(mo => ({ mo, m: this._expModule(mo) }));
        const lvs = [...new Set(mods.map(z => z.m && z.m.d.lv).filter(Boolean))];
        const aFaire = this._expLvAFaire(x).length;
        const pdf = x.pdf && x.pdf.url ? `<a class="pb-doc" href="${_otEsc(x.pdf.url)}" target="_blank" rel="noopener">PDF</a>` : '';
        const lv = annulee ? `<span class="sx-aide" title="${_otEsc(x.motif_annulation || '')}">annulée${x.motif_annulation ? ' : ' + _otEsc(x.motif_annulation) : ''}</span>`
          : (lvs.map(n => `<div>LV ${_otEsc(n)}</div>`).join('') + (aFaire ? `<div class="cd-aexporter">${aFaire} module${aFaire > 1 ? 's' : ''} sans LV</div>` : ''))
            || '<span class="sx-aide">—</span>';
        return `<tr class="${annulee ? 'cd-annulee' : ''}">
          <td><b>${_otEsc(x.numero)}</b>${x.source === 'ocr' ? ' <span class="cd-badge">OCR</span>' : ''}
            <div class="sx-aide">${_otEsc([_cdeEbpDate(x.date_commande), x.bt ? 'BT ' + x.bt : ''].filter(Boolean).join(' · '))}</div></td>
          <td>${_otEsc(x.destination || x.agence || '—')}</td>
          <td>${_otEsc(_cdeEbpDate(x.a_partir_du) || '—')}</td>
          <td>${mods.map(({ mo, m }) => `<div><b>${_otEsc((m && m.d.code) || mo.code || '?')}</b> <span class="sx-aide">${_otEsc(mo.ref)} · ${_otEsc(this._expEtapeTexte(m))}</span></div>`).join('')}</td>
          <td>${lv}</td>
          <td class="cd-fin">${pdf}${annulee ? '' : `
            ${aFaire ? ` <button type="button" class="cd-lien" onclick="App.expCreerLv(${Number(x.id)})">Créer la LV</button>` : ''}
            <button type="button" class="cd-lien" onclick="App.expModifier(${Number(x.id)})">Modifier…</button>
            <button type="button" class="cd-lien" onclick="App.expAnnuler(${Number(x.id)})">Annuler…</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  },

  /* ─ Import ─ */

  // recues : PDF venus de « Commandes reçues » (recues.js), rangés dans « Traités » une fois enregistrés.
  async expImporter(fichiers, recues = null) {
    fichiers = [...(fichiers || [])].filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!fichiers.length) return this.toast('Choisissez un ou plusieurs fichiers PDF');
    const E = this._expEtat();
    E.imp = { etat: 'lecture', items: [], ignorees: [], progression: 'Chargement de la lecture des PDF…', recues };
    this._expRendre();
    try { await this._cdeLibs(); }
    catch (e) { E.imp = null; this._expRendre(); return this.toast(e.message, 6000); }
    const imp = E.imp;
    for (const f of fichiers) {
      try { await this._expLireFichier(f, imp); }
      catch (e) { imp.ignorees.push({ fichier: f.name, page: '', raison: 'illisible : ' + e.message }); }
    }
    imp.items.forEach(it => { it.d = _expAnalyser(it.texte, it.texteBt); it.lu = JSON.parse(JSON.stringify(it.d)); });
    imp.etat = 'controle';
    this._expProgression('Contrôle des ordres…');
    await this._expControler(imp.items);
    this._expRendre();
  },

  _expProgression(texte) {
    if (!S.exp || !S.exp.imp) return;
    S.exp.imp.progression = texte;
    const el = document.getElementById('cd-progression');
    if (el) el.textContent = texte; else this._expRendre();
  },

  // Texte de chaque page (OCR pour une page sans texte), puis : « Bon de commande » ouvre un ordre, « BON DE
  // TRANSFERT » s'y rattache, « 2 / 2 » le prolonge ; le reste (corps de mail…) est ignoré.
  async _expLireFichier(f, imp) {
    const octets = new Uint8Array(await f.arrayBuffer());
    const doc = await window.pdfjsLib.getDocument({ data: octets.slice(), verbosity: 0 }).promise;
    const source = await window.PDFLib.PDFDocument.load(octets, { ignoreEncryption: true });
    const groupes = [];
    for (let p = 1; p <= doc.numPages; p++) {
      let texte = _cdeLignesPage((await (await doc.getPage(p)).getTextContent()).items), src = 'texte';
      if (texte.replace(/\s/g, '').length < 20) {
        this._expProgression('OCR de ' + f.name + ', page ' + p + ' / ' + doc.numPages + '…');
        const une = await window.PDFLib.PDFDocument.create();
        (await une.copyPages(source, [p - 1])).forEach(pg => une.addPage(pg));
        try {
          const r = await this._otPost({ action: 'exp_ocr', pdf: _cdeBase64(await une.save()), nom: f.name + ' p' + p }, 120000);
          texte = r.texte || ''; src = 'ocr';
        } catch (e) { imp.ignorees.push({ fichier: f.name, page: String(p), raison: 'OCR impossible : ' + e.message }); continue; }
      } else this._expProgression('Lecture de ' + f.name + '…');
      const prec = groupes[groupes.length - 1];
      const suite = texte.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/m);
      if (/BON\s+DE\s+TRANSFERT/i.test(texte) && prec) { prec.pages.push(p); prec.texteBt += '\n' + texte; }
      else if (/Bon\s+de\s+commande/i.test(texte) && /Commentaires|Total\s+HT|Fourn/i.test(texte)
        && !(prec && suite && Number(suite[1]) > 1 && !prec.texteBt)) {
        groupes.push({ pages: [p], texte, texteBt: '', source: src });
      } else if (prec && suite && Number(suite[1]) > 1 && !prec.texteBt) { prec.pages.push(p); prec.texte += '\n' + texte; }
      else imp.ignorees.push({ fichier: f.name, page: String(p), raison: /BON\s+DE\s+TRANSFERT/i.test(texte) ? 'bon de transfert sans ordre avant lui' : (texte.split('\n')[0] || 'page sans texte reconnu').slice(0, 70) });
    }
    for (const g of groupes) {
      const neuf = await window.PDFLib.PDFDocument.create();
      (await neuf.copyPages(source, g.pages.map(p => p - 1))).forEach(pg => neuf.addPage(pg));
      imp.items.push({ id: imp.items.length + 1, fichier: f.name, pages: g.pages, source: g.source,
        texte: g.texte, texteBt: g.texteBt, b64: _cdeBase64(await neuf.save()), coche: false });
    }
  },

  async _expControler(items) {
    items.forEach(it => {
      it.d.modules.forEach(mo => {
        if (mo.choisi) return;
        const c = this._cdeModules(mo.ref);
        const surParc = c.find(z => !z.parti);
        mo.code = String(((surParc || c[0]) || { d: {} }).d.code || '').toUpperCase();
      });
    });
    let ver = [];
    try {
      const r = await this._otPost({ action: 'exp_verifier', numeros: items.map(it => it.d.numero) }, 60000);
      ver = r.lignes || [];
    } catch (e) { this.toast('Contrôle impossible : ' + e.message, 6000); }
    items.forEach((it, i) => { it.ver = ver[i] || null; this._expAlertes(it); });
  },

  _expAlertes(it) {
    const d = it.d, a = [];
    const bloque = t => a.push({ niv: 'bloque', texte: t }), attention = t => a.push({ niv: 'attention', texte: t }), info = t => a.push({ niv: 'info', texte: t });
    if (d.recond) bloque('Commande de reconditionnement (fournisseur SONOTRAD) : à importer dans Reconditionnement › Commandes');
    else if (!d.transport && !it.corrige) attention('Fournisseur MESNAGER TRANSPORTS non lu : vérifier que c’est bien un ordre d’expédition');
    if (!d.numero || !/^[0-9A-Za-z-]{4,20}$/.test(d.numero)) bloque('N° de commande illisible');
    if (it.ver && it.ver.deja) bloque('Déjà enregistrée le ' + new Date(it.ver.deja.le).toLocaleDateString('fr-FR') + (it.ver.deja.par ? ' par ' + it.ver.deja.par : ''));
    const jumeaux = ((S.exp && S.exp.imp && S.exp.imp.items) || []).filter(x => x !== it && x.d && x.d.numero && x.d.numero === d.numero);
    if (jumeaux.some(x => x.id < it.id)) bloque('En double dans cet import (déjà lu plus haut)');
    if (!d.modules.length) bloque('Aucun module lu dans les Commentaires');
    if (!d.agence) attention('Agence non lue (« POUR … »)');
    if (!d.bt) attention('N° du bon de transfert non lu');
    if (!d.a_partir_du) info('Pas de date « à partir du »');
    d.modules.forEach(mo => {
      const m = mo.code ? this._cdeModuleParCode(mo.code) : null;
      if (!m) return bloque('Module ' + mo.ref + ' introuvable au Planning : saisir son code (Vérifier / corriger)');
      const nom = m.d.code + ' (' + mo.ref + ')';
      if (m.parti) attention(nom + ' : déjà parti');
      else if (!(m.d.status && m.d.status.termine)) info(nom + ' : pas encore terminé (' + this._expEtapeTexte(m) + ')');
      const ag = m.d.ag || ((m.d.chantier || '').match(/^(\d{3,6})/) || [])[1] || '';
      if (d.agence && ag && _cdeAgence(ag) !== _cdeAgence(d.agence)) attention(nom + ' : agence ' + ag + ' au Planning, ' + d.agence + ' sur l’ordre');
      if (m.d.commande && String(m.d.commande).trim() !== d.numero) attention(nom + ' : le Planning a déjà la commande ' + m.d.commande + ' (elle ne sera pas remplacée)');
      if (m.d.lv && !m.parti) info(nom + ' : LV ' + m.d.lv + ' déjà faite');
    });
    if (it.source === 'ocr' && !it.corrige) attention('Lu par OCR : vérifier n° de commande, modules et BT');
    const objet = this._recObjet(S.exp && S.exp.imp, it.fichier);
    if (/ANNUL/i.test(objet)) attention('Mail « ' + objet + ' » : comparer avec l’ordre déjà enregistré (Modifier… ou Annuler…)');
    if (/ENLEV/i.test(objet)) attention('Mail d’enlèvement : ce n’est pas un ordre d’expédition');
    it.alertes = a;
    it.bloque = a.some(x => x.niv === 'bloque');
    it.coche = !it.bloque && (it.corrige || !a.some(x => x.niv === 'attention'));
  },

  _expHtmlBarreImport() {
    const imp = S.exp.imp;
    if (imp.etat === 'lecture') return `<div class="pb-ligne"><span id="cd-progression" class="cd-progression">${_otEsc(imp.progression || '')}</span></div>`;
    const prets = imp.items.filter(it => it.coche && !it.bloque).length;
    const bloques = imp.items.filter(it => it.bloque).length;
    return `<div class="pb-ligne">
      <span class="cd-resume"><b>${imp.items.length}</b> ordre${imp.items.length > 1 ? 's' : ''} lu${imp.items.length > 1 ? 's' : ''} ·
        <span class="cd-ok">${prets} à enregistrer</span>${bloques ? ` · <span class="cd-bloque">${bloques} bloqué${bloques > 1 ? 's' : ''}</span>` : ''}
        ${imp.ignorees.length ? ` · ${imp.ignorees.length} page${imp.ignorees.length > 1 ? 's' : ''} ignorée${imp.ignorees.length > 1 ? 's' : ''}` : ''}</span>
      <span class="cd-espace"></span>
      <button type="button" class="pb-bouton" onclick="App.expAbandonner()">Abandonner</button>
      <button type="button" class="sx-btn sx-btn-principal" ${prets && !imp.enCours ? '' : 'disabled'} onclick="App.expEnregistrer()">${imp.enCours ? 'Enregistrement…' : 'Enregistrer ' + prets + ' ordre' + (prets > 1 ? 's' : '')}</button>
    </div>
    <p class="sx-aide cd-aide">Un scan se vérifie toujours : « Vérifier / corriger » montre le PDF à côté des valeurs lues. Une fois vérifiée, la ligne se coche ; une ligne bloquée se corrige d’abord.</p>`;
  },

  _expHtmlImport() {
    const imp = S.exp.imp;
    if (imp.etat === 'lecture') return '<div class="sx-chargement">Lecture en cours… (les scans passent par l’OCR de Google Drive, quelques secondes par page)</div>';
    const ign = imp.ignorees.length ? `<details class="sx-carte cd-ignorees"><summary>${imp.ignorees.length} page${imp.ignorees.length > 1 ? 's' : ''} ignorée${imp.ignorees.length > 1 ? 's' : ''}</summary>
      <ul>${imp.ignorees.map(x => `<li>${_otEsc(x.fichier)}${x.page ? ' · page ' + _otEsc(x.page) : ''} — <span class="sx-aide">${_otEsc(x.raison)}</span></li>`).join('')}</ul></details>` : '';
    if (!imp.items.length) return `<div class="sx-carte"><div class="sx-vide">Aucun ordre d’expédition trouvé dans ce PDF.</div></div>${ign}`;
    const niv = { bloque: 'cd-al-bloque', attention: 'cd-al-attention', info: 'cd-al-info' };
    return `<div class="sx-carte cd-tableau-cadre"><table class="cd-tableau">
      <thead><tr><th class="cd-case"></th><th>N° commande</th><th>Agence</th><th>À partir du</th><th>Modules</th><th>Contrôle</th><th></th></tr></thead><tbody>
      ${imp.items.map(it => {
        const d = it.d;
        return `<tr class="${it.bloque ? 'cd-ligne-bloquee' : ''}">
          <td class="cd-case"><input type="checkbox" ${it.coche ? 'checked' : ''} ${it.bloque || imp.enCours ? 'disabled' : ''} aria-label="Enregistrer ${_otEsc(d.numero)}" onclick="App.expCocher(${it.id}, this.checked)"></td>
          <td><b>${_otEsc(d.numero || '?')}</b>${it.source === 'ocr' ? ' <span class="cd-badge">OCR</span>' : ''}
            <div class="sx-aide">${_otEsc([_cdeEbpDate(d.date_commande), d.bt ? 'BT ' + d.bt : 'BT ?'].filter(Boolean).join(' · '))}</div></td>
          <td>${_otEsc(d.destination || d.agence || '?')}</td>
          <td>${_otEsc(_cdeEbpDate(d.a_partir_du) || '—')}</td>
          <td>${d.modules.map(mo => { const m = mo.code ? this._cdeModuleParCode(mo.code) : null;
            return `<div><b>${_otEsc(mo.code || '?')}</b> <span class="sx-aide">${_otEsc(mo.ref)} · ${_otEsc(this._expEtapeTexte(m))}</span></div>`; }).join('') || '—'}</td>
          <td class="cd-alertes">${it.alertes.length ? it.alertes.map(x => `<div class="${niv[x.niv]}">${_otEsc(x.texte)}</div>`).join('') : '<span class="cd-ok">✓ Conforme</span>'}
            ${it.erreurEnr ? `<div class="cd-al-bloque">Enregistrement : ${_otEsc(it.erreurEnr)}</div>` : ''}</td>
          <td class="cd-fin"><button type="button" class="cd-lien" ${imp.enCours ? 'disabled' : ''} onclick="App.expCorriger(${it.id})">Vérifier / corriger…</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>${ign}`;
  },

  expCocher(id, on) {
    const it = S.exp.imp.items.find(x => x.id === id);
    if (it && !it.bloque) it.coche = on;
    this._expRendre();
  },

  async expAbandonner() {
    const imp = S.exp.imp;
    if (imp && imp.items.length && imp.etat !== 'lecture') {
      const ok = await this._otConfirmer({ titre: 'Abandonner l’import ?', texte: 'Les ordres lus et non enregistrés seront oubliés (le PDF reste sur votre appareil).', ok: 'Abandonner' });
      if (!ok) return;
    }
    S.exp.imp = null;
    this._expRendre();
  },

  /* ─ Fenêtre Vérifier / corriger (import) et Modifier (après enregistrement) ─ */

  // Champs communs. d = {numero, date_commande, agence, destination, a_partir_du, bt, adresse, modules:[{ref, code}]}
  // Renvoie les valeurs saisies, ou null si on ferme. it = élément d'import (aperçu du PDF) ou null.
  async _expFenetre({ titre, aide, d, it, numeroModifiable, pdfUrl }) {
    const champ = (cle, libelle, val, sousTexte = '') => `<label class="cd-champ"><span>${libelle}</span>
      <input class="sx-champ" data-c="${cle}" value="${_otEsc(val == null ? '' : val)}" autocomplete="off" ${cle === 'numero' && !numeroModifiable ? 'readonly' : ''}>
      ${sousTexte ? `<span class="sx-aide">${_otEsc(sousTexte)}</span>` : ''}</label>`;
    const lu = (it && it.lu) || {};
    const diff = (cle, val) => lu[cle] !== undefined && String(lu[cle] || '') !== String(val || '') ? 'lu : ' + (lu[cle] || '(rien)') : '';
    const modulesTexte = (d.modules || []).map(m => (m.ref + ' ' + (m.code || '')).trim()).join('\n');
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre cd-fenetre" role="dialog" aria-modal="true" aria-labelledby="exp-cor-titre">
      ${it ? `<div class="cd-fenetre-pdf"><div class="cd-apercu" aria-label="Aperçu de l’ordre d’expédition"><div class="sx-chargement">Aperçu du PDF…</div></div>
        <button type="button" class="cd-lien" data-pdf="1">Ouvrir le PDF dans un onglet</button></div>` : ''}
      <div class="cd-fenetre-champs">
      <h3 id="exp-cor-titre">${_otEsc(titre)}</h3>
      ${aide ? `<p class="sx-aide">${aide}</p>` : ''}
      ${pdfUrl ? `<a class="cd-lien" href="${_otEsc(pdfUrl)}" target="_blank" rel="noopener">Ouvrir le PDF enregistré</a>` : ''}
      ${champ('numero', 'N° de commande', d.numero, diff('numero', d.numero))}
      <label class="cd-champ"><span>Modules — un par ligne : n° LOXAM, puis code SONOTRAD</span>
        <textarea class="sx-champ cd-zone" data-c="modules" rows="${Math.max(2, (d.modules || []).length + 1)}" spellcheck="false">${_otEsc(modulesTexte)}</textarea>
        <span class="sx-aide">Code laissé vide : retrouvé au Planning par le n° du module.</span></label>
      ${champ('bt', 'N° du bon de transfert', d.bt, diff('bt', d.bt))}
      ${champ('destination', 'Destination (« POUR … »)', d.destination, diff('destination', d.destination))}
      ${champ('agence', 'Code agence', d.agence, diff('agence', d.agence))}
      ${champ('a_partir_du', 'À partir du (jj/mm/aa)', _cdeEbpDate(d.a_partir_du))}
      ${champ('date_commande', 'Date de commande (jj/mm/aa)', _cdeEbpDate(d.date_commande))}
      <label class="cd-champ"><span>Adresse de livraison</span>
        <textarea class="sx-champ cd-zone" data-c="adresse" rows="3">${_otEsc(String(d.adresse || '').split(' | ').join('\n'))}</textarea></label>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="0">Annuler</button>
        <button type="button" class="sx-btn sx-btn-principal" data-r="1">${it ? 'Appliquer et recontrôler' : 'Enregistrer les modifications'}</button>
      </div></div></div>`;
    const v = await new Promise(resolve => {
      const fin = x => { voile.remove(); resolve(x); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(null);
        if (e.target.closest('[data-pdf]') && it) return this._expVoirPdf(it);
        const r = e.target.closest('[data-r]');
        if (!r) return;
        if (r.dataset.r === '0') return fin(null);
        const x = {};
        voile.querySelectorAll('[data-c]').forEach(c => { x[c.dataset.c] = c.value.trim(); });
        fin(x);
      });
      document.body.appendChild(voile);
      voile.querySelector('[data-c="modules"]').focus({ preventScroll: true });
      if (it) this._cdeApercu(it, voile.querySelector('.cd-apercu'));
    });
    if (!v) return null;
    const modules = [];
    v.modules.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
      const [ref, code] = l.split(/[\s;,]+/);
      if (ref && !modules.some(m => m.ref === ref)) modules.push({ ref, code: (code || '').toUpperCase(), choisi: !!code });
    });
    return {
      numero: v.numero.replace(/\s+/g, ''), modules, bt: v.bt.replace(/\s+/g, ''),
      destination: v.destination, agence: v.agence.replace(/\s+/g, ''),
      a_partir_du: _expDate(v.a_partir_du, _expDate(v.date_commande) || d.date_commande),
      date_commande: _expDate(v.date_commande) || d.date_commande || '',
      adresse: v.adresse.split('\n').map(l => l.trim()).filter(Boolean).join(' | '),
    };
  },

  _expVoirPdf(it) {
    const url = URL.createObjectURL(new Blob([_cdeOctets(it.b64)], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  async expCorriger(id) {
    const it = S.exp.imp.items.find(x => x.id === id);
    if (!it) return;
    const v = await this._expFenetre({ titre: 'Vérifier l’ordre ' + (it.d.numero || ''), d: it.d, it, numeroModifiable: true,
      aide: _otEsc(it.fichier) + ' · page' + (it.pages.length > 1 ? 's ' : ' ') + _otEsc(it.pages.join(', ')) + ' · lu ' + (it.source === 'ocr' ? 'par OCR' : 'dans le texte du PDF') });
    if (!v) return;
    Object.assign(it.d, v);
    it.corrige = true;
    it.erreurEnr = '';
    await this._expControler([it]);
    this._expRendre();
  },

  _expCharge(d, source) {
    return { numero: d.numero, date_commande: d.date_commande, agence: d.agence, destination: d.destination, adresse: d.adresse,
      a_partir_du: d.a_partir_du, bt: d.bt, modules: d.modules.map(m => ({ ref: m.ref, code: m.code })), source };
  },

  // Retour de masterfile pour le Planning, module par module → remarques à afficher.
  _expNotesPlanning(numero, planning) {
    const notes = [];
    Object.keys(planning || {}).forEach(code => {
      const p = String(planning[code] || '');
      if (p.startsWith('autre:')) notes.push(code + ' garde la commande ' + p.slice(6));
      else if (p.startsWith('erreur:')) notes.push(code + ' : Planning non mis à jour (' + p.slice(7) + ')');
      else if (p === 'absent') notes.push(code + ' absent du Planning');
      else if (p === 'garde_lv') notes.push(code + ' garde ' + numero + ' (LV faite)');
    });
    return notes;
  },

  async expEnregistrer() {
    const imp = S.exp.imp;
    const aFaire = imp.items.filter(it => it.coche && !it.bloque && !it.enregistre);
    if (!aFaire.length || imp.enCours) return;
    imp.enCours = true;
    this._expRendre();
    let faits = 0; const notes = [];
    for (const it of aFaire) {
      this.toast('⏳ ' + (faits + 1) + ' / ' + aFaire.length + ' — ordre ' + it.d.numero + '…', 90000);
      const source = it.corrige && it.source === 'texte' ? 'manuel' : it.source;
      try {
        const r = await this._otPost({ action: 'exp_enregistrer', expedition: this._expCharge(it.d, source), pdf: it.b64, nom: it.fichier }, 120000);
        it.enregistre = true; faits++;
        notes.push(...this._expNotesPlanning(it.d.numero, r.planning));
      } catch (e) { it.erreurEnr = e.message; }
    }
    imp.enCours = false;
    await this._recApresEnregistrement(imp, imp.items);
    imp.items = imp.items.filter(it => !it.enregistre);
    const echecs = imp.items.filter(it => it.erreurEnr).length;
    this.toast('✓ ' + faits + ' ordre' + (faits > 1 ? 's' : '') + ' enregistré' + (faits > 1 ? 's' : '') + ', n° écrit au Planning'
      + (echecs ? ' — ' + echecs + ' en échec (voir la liste)' : '') + (notes.length ? ' — ' + notes.join(' ; ') : ''), notes.length || echecs ? 12000 : 4000);
    if (!imp.items.length) { S.exp.imp = null; S.exp.filtre = 'afaire'; }
    await this._expCharger(true);
  },

  /* ─ Après enregistrement : modifier, annuler, créer la LV ─ */

  async expModifier(id) {
    const x = (S.exp.liste || []).find(e => e.id === id);
    if (!x) return;
    const d = JSON.parse(JSON.stringify(x));
    d.modules = (d.modules || []).map(m => ({ ref: m.ref, code: m.code }));
    const v = await this._expFenetre({ titre: 'Modifier l’ordre ' + x.numero, d, it: null, numeroModifiable: false,
      pdfUrl: x.pdf && x.pdf.url,
      aide: 'Un module retiré perd la commande au Planning (s’il n’a pas de LV) ; un module ajouté la reçoit. Pour un autre n° de commande : annuler, puis importer le nouvel ordre.' });
    if (!v) return;
    v.modules.forEach(mo => {
      if (mo.code) return;
      const c = this._cdeModules(mo.ref), surParc = c.find(z => !z.parti);
      mo.code = String(((surParc || c[0]) || { d: {} }).d.code || '').toUpperCase();
    });
    const inconnus = v.modules.filter(m => !m.code);
    if (inconnus.length) return this.toast('Module introuvable au Planning : ' + inconnus.map(m => m.ref).join(', ') + ' — saisir son code', 6000);
    try {
      const r = await this._otPost({ action: 'exp_modifier', id, expedition: this._expCharge(v, x.source) }, 90000);
      const notes = this._expNotesPlanning(x.numero, r.planning);
      this.toast('Ordre ' + x.numero + ' modifié' + (notes.length ? ' — ' + notes.join(' ; ') : ''), notes.length ? 9000 : 4000);
      await this._expCharger(true);
    } catch (e) { this.toast('Modification impossible : ' + e.message, 6000); }
  },

  async expAnnuler(id) {
    const x = (S.exp.liste || []).find(e => e.id === id);
    if (!x) return;
    const mods = (x.modules || []).map(mo => this._expModule(mo)).filter(Boolean);
    const partis = mods.filter(m => m.parti);
    const lvs = [...new Set(mods.filter(m => !m.parti && m.d.lv && String(m.d.commande || '').trim() === x.numero).map(m => m.d.lv))];
    const codes = new Set(mods.map(m => String(m.d.code).toUpperCase()));
    const autres = lvs.flatMap(lv => (S.deps || []).filter(d => d.lv === lv && !codes.has(String(d.code).toUpperCase())).map(d => d.code));
    const avert = [];
    if (lvs.length) avert.push(`<div class="cd-al-attention">⚠ ${lvs.length > 1 ? 'Les LV ' + lvs.join(', ') + ' sont déjà faites : elles seront annulées' : 'La LV ' + lvs[0] + ' est déjà faite : elle sera annulée'} également (elle${lvs.length > 1 ? 's restent' : ' reste'} dans l’historique, marquée annulée).</div>`);
    if (autres.length) avert.push(`<div class="cd-al-attention">⚠ ${lvs.length > 1 ? 'Ces LV portent' : 'Cette LV porte'} aussi ${autres.join(', ')} : il faudra refaire une LV pour ${autres.length > 1 ? 'eux' : 'lui'}.</div>`);
    if (partis.length) avert.push(`<div class="cd-al-info">${partis.map(m => m.d.code).join(', ')} déjà parti${partis.length > 1 ? 's' : ''} : ${partis.length > 1 ? 'leur' : 'sa'} LV n’est pas touchée.</div>`);
    const motif = await new Promise(resolve => {
      const voile = document.createElement('div');
      voile.className = 'sx-voile';
      voile.innerHTML = `<div class="sx-fenetre pb-fenetre" role="dialog" aria-modal="true" aria-labelledby="exp-an-titre">
        <h3 id="exp-an-titre">Annuler l’ordre ${_otEsc(x.numero)} ?</h3>
        ${avert.join('')}
        <p class="sx-aide">L’ordre reste visible (« Annulées »). Le n° de commande quitte le Planning et Demandes là où il n’y a plus de LV. Pour un ordre modifié par LOXAM, importez ensuite le nouveau.</p>
        <label class="cd-champ"><span>Motif</span><input class="sx-champ" id="exp-an-motif" placeholder="ex. ordre modifié par LOXAM, autre agence…"></label>
        <div class="sx-fenetre-boutons">
          <button type="button" class="sx-btn sx-btn-discret" data-r="0">Retour</button>
          <button type="button" class="sx-btn sx-btn-principal" data-r="1">${lvs.length ? 'Annuler l’ordre et la LV' : 'Annuler l’ordre'}</button>
        </div></div>`;
      const fin = v => { voile.remove(); resolve(v); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(null);
        const r = e.target.closest('[data-r]');
        if (!r) return;
        if (r.dataset.r === '0') return fin(null);
        const m = voile.querySelector('#exp-an-motif').value.trim();
        if (!m) { voile.querySelector('#exp-an-motif').focus(); return; }
        fin(m);
      });
      document.body.appendChild(voile);
      voile.querySelector('#exp-an-motif').focus();
    });
    if (!motif) return;
    this.toast('⏳ Annulation de l’ordre ' + x.numero + (lvs.length ? ' et de la LV…' : '…'), 60000);
    try {
      const r = await this._otPost({ action: 'exp_annuler', id, motif, annuler_lv: lvs.length > 0 }, 120000);
      const notes = this._expNotesPlanning(x.numero, r.planning);
      (r.lv_erreurs || []).forEach(e => notes.push('LV ' + e));
      this.toast('Ordre ' + x.numero + ' annulé' + ((r.lv_annulees || []).length ? ' — LV ' + r.lv_annulees.join(', ') + ' annulée' + (r.lv_annulees.length > 1 ? 's' : '') : '')
        + (notes.length ? ' — ' + notes.join(' ; ') : ''), notes.length ? 10000 : 5000);
      await this._expCharger(true);
    } catch (e) { this.toast('Annulation impossible : ' + e.message, 6000); }
  },

  // LV pré-remplie : modules sans LV de l'ordre, destinataire = son agence, « Commande n° », « BT … » en doc annexe.
  async expCreerLv(id) {
    const x = (S.exp.liste || []).find(e => e.id === id);
    if (!x) return;
    if (!(S.currentUser?.activites || []).includes('lvu') && S.currentUser?.role !== 'admin') { this.toast('⛔ Accès LV non autorisé'); return; }
    const deps = this._expLvAFaire(x).map(m => m.d);
    if (!deps.length) return this.toast('Tous les modules de cet ordre ont déjà une LV (ou sont partis)');
    const ag = x.agence || '';
    S.lvu.loxamItems = deps.map(d => ag ? Object.assign({}, d, { ag }) : d);
    S.lvu.selectedItems = new Set(deps.map(d => d.code));
    S.activity = 'lvu';
    await this.lvuInit();
    await this.lvuLoadAgencies();
    this.lvuSetSource('loxam');
    this.lvuApplyLoxam();
    const pose = (idc, val) => { const el = document.getElementById(idc); if (el && val) el.value = val; };
    pose('lvu-f-commande', x.numero);
    if (x.a_partir_du && _livIso(x.a_partir_du)) this._lvuLivPoser({ type: 'apartir', min: _livIso(x.a_partir_du), max: '' });   // « A PARTIR DU » de l'ordre
    pose('lvu-f-doc', x.bt ? 'BT ' + x.bt : '');
    // Agence absente de l'annuaire : destinataire repris de l'adresse imprimée sur l'ordre
    const nomDest = document.getElementById('lvu-f-dest-nom');
    const adr = String(x.adresse || '').split(' | ').map(s => s.trim()).filter(Boolean);
    if (nomDest && !nomDest.value && adr.length >= 2) {
      const der = adr[adr.length - 1], cpv = der.match(/^(.*?),?\s*(?:FR\s+)?(\d{5})$/i);
      pose('lvu-f-dest-nom', adr[0]);
      pose('lvu-f-dest-adresse', adr.slice(1, -1).join(', '));
      pose('lvu-f-dest-ville', cpv ? cpv[2] + ' ' + cpv[1].replace(/,\s*$/, '').trim() : der);
      const pays = document.getElementById('lvu-f-dest-pays');
      if (pays && !pays.value) pays.value = 'FR - France';
    }
    const restants = (x.modules || []).length - deps.length;
    this.toast('LV pré-remplie : commande ' + x.numero + (x.bt ? ', BT ' + x.bt : '') + ' — ' + deps.length + ' module' + (deps.length > 1 ? 's' : '')
      + (restants > 0 ? ' (' + restants + ' déjà avec LV ou parti' + (restants > 1 ? 's' : '') + ')' : ''), 6000);
  },
});
