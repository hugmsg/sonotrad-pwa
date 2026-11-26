/* ═══════════════════════════════════════════════════════════════════════════
   Commandes LOXAM reçues par mail (2026-11-26) — actions rec_* de masterfile (recues.js)

   La relève Outlook du PC de Hugo (sonotrad-scripts/outlook/releve_commandes.py) dépose les PDF des mails
   « CDE … » de LOXAM dans le Drive « Commandes reçues », typés d'après l'objet du mail :
   EXP (ordre d'expédition), RECOND (reconditionnement), ENLEV (enlèvement), AUTRE.
   Bouton « Commandes reçues » : Production › Expéditions (EXP, ENLEV, AUTRE) et Reconditionnement › Commandes
   (RECOND). Les PDF choisis passent par l'import habituel (expImporter / cdeImporter) ; un fichier est rangé
   dans « Traités » dès que tous ses bons sont enregistrés (ou l'étaient déjà). « Classer sans importer » pour le reste.
   ═══════════════════════════════════════════════════════════════════════════ */

const REC_VUES = {
  exp: { types: ['EXP', 'AUTRE', 'ENLEV'], coches: ['EXP'], titre: 'Ordres d’expédition reçus' },
  cde: { types: ['RECOND'], coches: ['RECOND'], titre: 'Commandes de reconditionnement reçues' },
};
const REC_NOMS = { EXP: 'Expédition', RECOND: 'Reconditionnement', ENLEV: 'Enlèvement', AUTRE: 'Autre' };

function _recDate(iso) {
  const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? m[2] + '/' + m[1] + ' ' + m[3] + 'h' + m[4] : '';
}

Object.assign(App, {

  _recEtat() {
    S.rec = S.rec || { liste: null, chargement: false, pdfs: {} };
    return S.rec;
  },

  // PDF d'un fichier reçu (base64), gardé en mémoire : « Voir » et « Importer » ne le téléchargent qu'une fois.
  _recPdfB64(id) {
    const P = this._recEtat().pdfs;
    if (!P[id]) {
      P[id] = this._otPost({ action: 'rec_pdf', id }, 90000).then(r => r.pdf);
      P[id].catch(() => { delete P[id]; });
    }
    return P[id];
  },

  // Téléchargement en arrière-plan, deux à la fois, dès que la liste s'ouvre.
  async _recPrecharger(l) {
    const file = l.map(r => r.id);
    const ouvrier = async () => { while (file.length) { try { await this._recPdfB64(file.shift()); } catch (e) { /* réessayé au besoin */ } } };
    await Promise.all([ouvrier(), ouvrier()]);
  },

  // Liste du dossier « Commandes reçues » (silencieuse : sans elle, l'import manuel reste là).
  async _recCharger(force = false) {
    const R = this._recEtat();
    if (R.chargement || (R.liste && !force)) return;
    R.chargement = true;
    try { R.liste = (await this._otPost({ action: 'rec_liste' }, 60000)).recues || []; }
    catch (e) { R.liste = R.liste || []; }
    finally { R.chargement = false; }
    this._recRafraichir();
  },

  _recRafraichir() {
    const b = document.getElementById('rec-bouton');
    if (b) b.outerHTML = this._recBouton(b.dataset.vue);
  },

  _recPour(vue) {
    return ((S.rec && S.rec.liste) || []).filter(r => REC_VUES[vue].types.includes(r.type));
  },

  _recBouton(vue) {
    const R = this._recEtat();
    if (!R.liste) return `<span id="rec-bouton" data-vue="${vue}" hidden></span>`;
    const n = this._recPour(vue).length;
    return `<button type="button" id="rec-bouton" data-vue="${vue}" class="pb-bouton" ${n ? '' : 'disabled'} onclick="App.recOuvrir('${vue}')"
      title="PDF relevés dans Outlook, en attente d’import">Commandes reçues${n ? ' <b>' + n + '</b>' : ' : aucune'}</button>`;
  },

  async recOuvrir(vue) {
    await this._recCharger(true);
    const V = REC_VUES[vue], l = this._recPour(vue);
    if (!l.length) return this.toast('Aucune commande reçue en attente');
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre rec-fenetre" role="dialog" aria-modal="true" aria-labelledby="rec-titre">
      <h3 id="rec-titre">${V.titre}</h3>
      <p class="sx-aide">Relevés automatiquement dans Outlook (mails « CDE » de LOXAM). Cochez ceux à importer ; une fois enregistrés, ils sont rangés dans « Traités ».</p>
      <div class="cd-tableau-cadre rec-cadre"><table class="cd-tableau">
        <thead><tr><th class="cd-case"></th><th>Reçu</th><th>Objet du mail</th><th>Type</th><th></th></tr></thead><tbody>
        ${l.map(r => `<tr>
          <td class="cd-case"><input type="checkbox" data-id="${_otEsc(r.id)}" ${V.coches.includes(r.type) ? 'checked' : ''} aria-label="${_otEsc(r.objet)}"></td>
          <td class="rec-date">${_otEsc(_recDate(r.recu))}</td>
          <td>${_otEsc(r.objet)}<div class="sx-aide">${_otEsc(r.piece)}</div>
            ${r.type === 'ENLEV' ? '<div class="cd-al-info">Enlèvement : pas un ordre d’expédition, à classer</div>' : ''}
            ${/ANNUL/i.test(r.objet) ? '<div class="cd-al-attention">Annule et remplace : comparer avec l’ordre déjà enregistré</div>' : ''}</td>
          <td>${_otEsc(REC_NOMS[r.type] || r.type)}</td>
          <td class="cd-fin"><button type="button" class="cd-lien" data-voir="${_otEsc(r.id)}">Voir</button></td>
        </tr>`).join('')}</tbody></table></div>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-r="fermer">Fermer</button>
        <button type="button" class="sx-btn sx-btn-discret" data-r="classer">Classer sans importer</button>
        <button type="button" class="sx-btn sx-btn-principal" data-r="importer">Importer</button>
      </div></div>`;
    this._recPrecharger(l);
    const choix = await new Promise(resolve => {
      const fin = x => { voile.remove(); resolve(x); };
      voile.addEventListener('click', e => {
        if (e.target === voile) return fin(null);
        const voir = e.target.closest('[data-voir]');
        if (voir) return this._recVoir(l.find(r => r.id === voir.dataset.voir));
        const r = e.target.closest('[data-r]');
        if (!r) return;
        if (r.dataset.r === 'fermer') return fin(null);
        const ids = [...voile.querySelectorAll('input[data-id]:checked')].map(c => c.dataset.id);
        if (!ids.length) return this.toast('Cochez au moins une commande');
        fin({ action: r.dataset.r, ids });
      });
      document.body.appendChild(voile);
    });
    if (!choix) return;
    const sel = l.filter(r => choix.ids.includes(r.id));
    if (choix.action === 'classer') {
      const ok = await this._otConfirmer({ titre: 'Classer sans importer ?',
        texte: sel.length + ' PDF ' + (sel.length > 1 ? 'seront rangés' : 'sera rangé') + ' dans « Traités » sans rien enregistrer (ils restent sur le Drive).', ok: 'Classer' });
      if (ok) await this._recClasser(sel.map(r => r.id));
      return;
    }
    await this._recImporter(vue, sel);
  },

  // Aperçu dans la PWA (pages dessinées par pdf.js, comme « Vérifier / corriger »), par-dessus la liste.
  async _recVoir(r) {
    if (!r) return;
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre rec-voir" role="dialog" aria-modal="true" aria-labelledby="rec-voir-titre">
      <h3 id="rec-voir-titre">${_otEsc(r.objet)}</h3>
      <div class="sx-aide">${_otEsc(_recDate(r.recu))} · ${_otEsc(r.piece)}</div>
      <div class="cd-apercu rec-apercu"><div class="sx-chargement">Chargement du PDF…</div></div>
      <div class="sx-fenetre-boutons">
        <button type="button" class="sx-btn sx-btn-discret" data-onglet="1">Ouvrir dans un onglet</button>
        <button type="button" class="sx-btn sx-btn-principal" data-fermer="1">Fermer</button>
      </div></div>`;
    let b64 = null;
    voile.addEventListener('click', e => {
      if (e.target === voile || e.target.closest('[data-fermer]')) return voile.remove();
      if (e.target.closest('[data-onglet]') && b64) {
        const url = URL.createObjectURL(new Blob([_cdeOctets(b64)], { type: 'application/pdf' }));
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      }
    });
    document.body.appendChild(voile);
    const cadre = voile.querySelector('.rec-apercu');
    try {
      b64 = await this._recPdfB64(r.id);
      if (cadre.isConnected) await this._cdeApercu({ b64 }, cadre);
    } catch (e) { cadre.innerHTML = `<div class="sx-vide">PDF indisponible : ${_otEsc(e.message)}</div>`; }
  },

  async _recImporter(vue, sel) {
    const fichiers = [];
    for (let i = 0; i < sel.length; i++) {
      this.toast('⏳ Téléchargement ' + (i + 1) + ' / ' + sel.length + '…', 60000);
      try {
        fichiers.push(new File([_cdeOctets(await this._recPdfB64(sel[i].id))], sel[i].nom, { type: 'application/pdf' }));
      } catch (e) { this.toast(sel[i].objet + ' : ' + e.message, 6000); }
    }
    if (!fichiers.length) return;
    const recues = sel.filter(r => fichiers.some(f => f.name === r.nom));
    if (vue === 'exp') await this.expImporter(fichiers, recues);
    else await this.cdeImporter(fichiers, recues);
  },

  async _recClasser(ids) {
    if (!ids.length) return;
    try {
      const r = await this._otPost({ action: 'rec_classer', ids }, 60000);
      const faits = new Set(r.classes || []);
      const R = this._recEtat();
      R.liste = (R.liste || []).filter(x => !faits.has(x.id));
      this._recRafraichir();
      return faits.size;
    } catch (e) { this.toast('Rangement dans « Traités » impossible : ' + e.message, 6000); return 0; }
  },

  // Après un enregistrement : range les PDF reçus dont tous les bons sont enregistrés (ou l'étaient déjà).
  // items = liste complète AVANT le retrait des enregistrés ; un fichier sans bon lu n'est jamais rangé seul.
  async _recApresEnregistrement(imp, items) {
    if (!imp || !imp.recues || !imp.recues.length) return;
    imp.recFaits = imp.recFaits || new Set();
    items.filter(it => it.enregistre).forEach(it => imp.recFaits.add(it.fichier));
    const restent = new Set(items.filter(it => !it.enregistre && !(it.ver && it.ver.deja)).map(it => it.fichier));
    const aRanger = imp.recues.filter(r => imp.recFaits.has(r.nom) && !restent.has(r.nom));
    if (!aRanger.length) return;
    await this._recClasser(aRanger.map(r => r.id));
    imp.recues = imp.recues.filter(r => !aRanger.includes(r));
  },

  // Objet du mail d'où vient un bon (import depuis « Commandes reçues »), sinon ''.
  _recObjet(imp, fichier) {
    const r = ((imp && imp.recues) || []).find(x => x.nom === fichier);
    return r ? r.objet : '';
  },
});
