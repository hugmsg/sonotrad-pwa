// api/geocode.js — Proxy Vercel vers Nominatim (OpenStreetMap)
//
// Pourquoi ce proxy ?
//   Même raison que api/proxy.js (Apps Script) : le WiFi SONOTRAD bloque les
//   requêtes fetch() côté navigateur vers des domaines externes non
//   familiers. Nominatim, jamais appelé avant l'ajout du géocodage, tombe
//   dans ce blocage — un appel direct depuis _geocodeAdresse() échouait
//   silencieusement sur le réseau de l'entreprise. Ce fichier tourne côté
//   serveur Vercel (pas de restriction réseau) et relaie la requête.
//
//   Bénéfice secondaire : permet d'envoyer un User-Agent identifiant
//   l'application, comme demandé par la politique d'usage de Nominatim
//   (https://operations.osmfoundation.org/policies/nominatim/) — un fetch()
//   navigateur ne permet pas de le personnaliser.

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

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'SONOTRAD-PWA/1.0 (usage interne, geocodage adresses de livraison)',
        'Accept-Language': 'fr',
      },
    });
    const data = await upstream.json();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
