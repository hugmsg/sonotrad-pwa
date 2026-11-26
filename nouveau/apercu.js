/* ═══════════════════════════════════════════════════════════════════════════
   Aperçu des PDF dans la PWA (2026-11-26)

   Au lieu d'ouvrir un onglet Drive (lent), les PDF s'affichent dans une fenêtre de la PWA, pages dessinées par
   pdf.js (_cdeApercu de commandes.js) — comme « Vérifier / corriger » des commandes.
   - Tout lien vers un FICHIER Drive (drive.google.com/file/d/…, open?id=…) est intercepté : le PDF est demandé à
     masterfile (action pdf_voir, dossiers de la PWA seulement) et gardé en mémoire. Ctrl / Maj / clic molette =
     onglet comme avant ; un lien marqué data-onglet n'est jamais intercepté ; les dossiers ne sont pas concernés.
   - App.pdfApercu({titre, b64 | octets | url}) pour un PDF déjà dans le navigateur ou un lien Drive.
   Hors PWA, pas un PDF, trop lourd… → la fenêtre propose « Ouvrir dans un onglet ».
   ═══════════════════════════════════════════════════════════════════════════ */

const _APERCU_DRIVE = /^https:\/\/(drive|docs)\.google\.com\/(file\/d\/[\w-]{20,}|open\?id=[\w-]{20,}|uc\?([^#]*&)?id=[\w-]{20,})/;

function _apercuIdDrive(url) {
  const m = String(url || '').match(/\/d\/([\w-]{20,})/) || String(url || '').match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : '';
}

Object.assign(App, {

  // PDF d'un fichier Drive (base64), gardé en mémoire (30 derniers).
  _apercuDrive(url) {
    const id = _apercuIdDrive(url);
    S.pdfCache = S.pdfCache || new Map();
    if (!S.pdfCache.has(id)) {
      const p = this._otPost({ action: 'pdf_voir', id }, 90000).then(r => r.pdf);
      p.catch(() => S.pdfCache.delete(id));
      S.pdfCache.set(id, p);
      if (S.pdfCache.size > 30) S.pdfCache.delete(S.pdfCache.keys().next().value);
    }
    return S.pdfCache.get(id);
  },

  // o = {titre, sousTitre, b64 | octets | url, onglet (défaut : vrai), bandeau}
  async pdfApercu(o) {
    const lienOnglet = o.onglet !== false;
    const voile = document.createElement('div');
    voile.className = 'sx-voile';
    voile.innerHTML = `<div class="sx-fenetre pb-fenetre ap-fenetre" role="dialog" aria-modal="true" aria-labelledby="ap-titre">
      <h3 id="ap-titre">${_otEsc(o.titre || 'PDF')}</h3>
      ${o.sousTitre ? `<div class="sx-aide">${_otEsc(o.sousTitre)}</div>` : ''}
      ${o.bandeau ? `<div class="cd-al-attention">${_otEsc(o.bandeau)}</div>` : ''}
      <div class="cd-apercu ap-apercu"><div class="sx-chargement">Chargement du PDF…</div></div>
      <div class="sx-fenetre-boutons">
        ${lienOnglet ? '<button type="button" class="sx-btn sx-btn-discret" data-onglet="1">Ouvrir dans un onglet</button>' : ''}
        <button type="button" class="sx-btn sx-btn-principal" data-fermer="1">Fermer</button>
      </div></div>`;
    let b64 = o.b64 || null;
    const fermer = () => { voile.remove(); document.removeEventListener('keydown', echap); };
    const echap = e => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', echap);
    voile.addEventListener('click', e => {
      if (e.target === voile || e.target.closest('[data-fermer]')) return fermer();
      if (!e.target.closest('[data-onglet]')) return;
      if (o.url) return window.open(o.url, '_blank', 'noopener');
      if (!b64) return;
      const url = URL.createObjectURL(new Blob([_cdeOctets(b64)], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    });
    document.body.appendChild(voile);
    const cadre = voile.querySelector('.ap-apercu');
    try {
      if (!b64 && o.octets) b64 = _cdeBase64(o.octets);
      if (!b64 && o.url) b64 = await this._apercuDrive(o.url);
      if (cadre.isConnected) await this._cdeApercu({ b64 }, cadre);
    } catch (e) {
      cadre.innerHTML = `<div class="sx-vide">${_otEsc(e.message || 'Aperçu impossible')}${lienOnglet && o.url ? ' — « Ouvrir dans un onglet » pour le voir sur Drive.' : ''}</div>`;
    }
  },

  // Clic sur un lien vers un fichier Drive → aperçu dans la PWA.
  _apercuClic(e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('data-onglet') || a.hasAttribute('download') || !_APERCU_DRIVE.test(a.href)) return;
    e.preventDefault();
    const titre = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
    this.pdfApercu({ titre: titre || 'PDF', url: a.href });
  },
});

document.addEventListener('click', e => App._apercuClic(e));
