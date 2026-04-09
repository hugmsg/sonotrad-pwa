// api/proxy.js — Proxy Vercel vers Google AppScript
//
// Pourquoi ce proxy ?
//   Certains réseaux WiFi bloquent les requêtes fetch() vers script.google.com
//   (filtrage réseau / proxy d'entreprise). Ce fichier tourne côté serveur Vercel
//   (pas de restriction réseau) et relaie les requêtes transparently.
//
// Configuration :
//   1. Dans le dashboard Vercel → Settings → Environment Variables
//      Ajouter : APPSCRIPT_URL = https://script.google.com/macros/s/.../exec
//   2. Dans la PWA → Réglages, mettre l'URL de ton app Vercel + /api/proxy
//      Ex : https://sonotrad.vercel.app/api/proxy

export const config = {
  api: {
    bodyParser: false,   // on gère le body manuellement pour supporter FormData
    externalResolver: true,
  },
};

export default async function handler(req, res) {
  // ── CORS headers (toujours présents, y compris preflight) ──────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── URL cible ───────────────────────────────────────────────────────────────
  const APPSCRIPT_URL = process.env.APPSCRIPT_URL;
  if (!APPSCRIPT_URL) {
    return res.status(500).json({
      status: 'error',
      error:  'Variable APPSCRIPT_URL manquante dans les réglages Vercel',
    });
  }

  try {
    let targetUrl   = APPSCRIPT_URL;
    let fetchOptions = { method: req.method, redirect: 'follow' };

    // ── GET : on transfère les query params tels quels ──────────────────────
    if (req.method === 'GET') {
      const params = new URLSearchParams(req.query);
      targetUrl = `${APPSCRIPT_URL}?${params.toString()}`;
    }

    // ── POST : on lit le body brut et on le relaie avec le même Content-Type ─
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);

      fetchOptions.body    = rawBody;
      fetchOptions.headers = {
        'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
      };
    }

    const upstream = await fetch(targetUrl, fetchOptions);
    const text     = await upstream.text();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(text);

  } catch (err) {
    res.status(502).json({ status: 'error', error: err.message });
  }
}
