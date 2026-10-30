// Minimal independent diagnostic function: no external imports, upstream requests, or keys.
export default function health(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  return res.status(200).json({ ok: true, service: 'clash-vercel-merger' });
}
