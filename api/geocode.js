// api/geocode.js — Proxy Vercel de géocodage (Google Geocoding + repli Nominatim)
//
// Pourquoi un proxy plutôt qu'un appel direct navigateur ?
//   Même raison que api/proxy.js (Apps Script) : le WiFi SONOTRAD bloque les
//   requêtes fetch() côté navigateur vers des domaines externes non
//   familiers. Ce fichier tourne côté serveur Vercel (pas de restriction
//   réseau) et relaie la requête. Nécessaire aussi pour ne jamais exposer la
//   clé API Google au client (elle reste en variable d'environnement Vercel,
//   process.env.GOOGLE_GEOCODING_API_KEY — jamais dans le code source).
//
// Pourquoi Google en plus de Nominatim (OpenStreetMap) ?
//   Nominatim échoue systématiquement sur les adresses réelles de SONOTRAD
//   (zones industrielles/logistiques, agences Loxam — mal couvertes par
//   OpenStreetMap). Testé sur 2 adresses réelles, 2 échecs (repli ville
//   seulement). Google a une bien meilleure couverture de ce type d'adresse.
//   Nominatim reste en repli si la clé Google n'est pas configurée ou si
//   Google ne trouve rien — pas de régression si la clé manque.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const q = req.query.q;
  if (!q) {
    return res.status(400).json({ error: 'Paramètre q manquant' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    if (apiKey) {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=fr&key=${apiKey}`;
      const gResp = await fetch(googleUrl);
      const gData = await gResp.json();
      if (gData.status === 'OK' && gData.results && gData.results[0]) {
        const loc = gData.results[0].geometry.location;
        return res.status(200).json([{ lat: loc.lat, lon: loc.lng }]);
      }
      // Pas de résultat Google (ou clé invalide/quota) : on retombe sur
      // Nominatim plutôt que de renvoyer un échec sec.
    }

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const upstream = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'SONOTRAD-PWA/1.0 (usage interne, geocodage adresses de livraison)',
        'Accept-Language': 'fr',
      },
    });
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
