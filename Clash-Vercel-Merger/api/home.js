import { UI_HTML } from '../src/ui.js';
import { isWebUiEnabled } from '../src/ui-toggle.js';

export default function home(req, res) {
  const common = {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Frame-Options': 'DENY'
  };
  if (!isWebUiEnabled()) {
    res.writeHead(404, { ...common, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : 'Not Found');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...common, 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    return res.end();
  }
  res.writeHead(200, { ...common, 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(req.method === 'HEAD' ? undefined : UI_HTML);
}
