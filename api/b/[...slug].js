import { Resvg } from '@resvg/resvg-js';

const APP_URL  = 'https://hex-tic-tac-toe.github.io/strategies/';
const SITE_URL = 'https://hexoboardshare.vercel.app';

function spiralOrder(s) {
  const max  = s - 1;
  const dist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  const cells = [];
  for (let q = -max; q <= max; q++)
    for (let r = -max; r <= max; r++)
      if (Math.abs(q + r) <= max) cells.push({ q, r });
  return cells.sort((a, b) => {
    const dd = dist(a.q, a.r) - dist(b.q, b.r);
    return dd !== 0 ? dd : a.q !== b.q ? a.q - b.q : a.r - b.r;
  });
}

function decode(str) {
  if (!str) return null;
  try {
    const bytes = Buffer.from(
      str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - str.length % 4) % 4),
      'base64'
    );
    let pos = 0;
    const r = b => { let v = 0; for (let i = b-1; i >= 0; i--) { if ((bytes[pos>>3]>>(7-(pos&7)))&1) v|=1<<i; pos++; } return v; };
    const s = r(5) + 1;
    if (s < 2 || s > 32) return null;
    const order     = spiralOrder(s);
    const cellCount = Math.min(Math.floor((bytes.length * 8 - pos) / 2), order.length);
    const cells     = new Map();
    for (let i = 0; i < cellCount; i++) {
      const state = r(2);
      if (state) cells.set(`${order[i].q},${order[i].r}`, state);
    }
    return { s, cells };
  } catch { return null; }
}

function hexPath(cx, cy, R) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (Math.PI / 3) * i;
    const r = R - Math.max(1, R * 0.09);
    return `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ') + ' Z';
}

function buildSVG(grid, dark) {
  const { s, cells } = grid;
  const R   = 28;
  const col = {
    empty:   dark ? '#1c1c1c' : '#d4d0c8',
    stroke:  dark ? '#2e2e2e' : '#b8b4ac',
    x:       dark ? '#c8c8c8' : '#1e1c1a',
    oStroke: dark ? '#888'    : '#666660',
    oBg:     dark ? '#202020' : '#e0dcd4',
    oStripe: dark ? '#909090' : '#706860',
    bg:      dark ? '#0a0a0a' : '#f4f1ec',
  };
  const max = s - 1;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const coords = [];
  for (let q = -max; q <= max; q++) {
    for (let rr = -max; rr <= max; rr++) {
      if (Math.abs(q + rr) > max) continue;
      const x = R * Math.sqrt(3) * (q + rr / 2);
      const y = R * 1.5 * rr;
      const hw = R * Math.sqrt(3) / 2;
      minX = Math.min(minX, x - hw); maxX = Math.max(maxX, x + hw);
      minY = Math.min(minY, y - R);  maxY = Math.max(maxY, y + R);
      coords.push({ q, r: rr, x, y });
    }
  }
  const pad = R * 0.4, vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2;
  const ox = -minX + pad, oy = -minY + pad;
  const hid = 'ho';
  const sz = Math.max(3, R * 0.22), lw = Math.max(1, sz * 0.5);
  const defs = `<defs><pattern id="${hid}" patternUnits="userSpaceOnUse" width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" patternTransform="rotate(45)"><rect width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" fill="${col.oBg}"/><line x1="0" y1="0" x2="0" y2="${sz.toFixed(1)}" stroke="${col.oStripe}" stroke-width="${lw.toFixed(1)}"/></pattern></defs>`;
  let paths = '';
  for (const { q, r, x, y } of coords) {
    const state = cells.get(`${q},${r}`) || 0;
    const cx = x + ox, cy = y + oy;
    const d  = hexPath(cx, cy, R);
    if      (!state)   paths += `<path d="${d}" fill="${col.empty}" stroke="${col.stroke}" stroke-width="0.9"/>`;
    else if (state===1) paths += `<path d="${d}" fill="${col.x}"/>`;
    else               paths += `<path d="${d}" fill="url(#${hid})" stroke="${col.oStroke}" stroke-width="1"/>`;
  }
  const W = Math.round(vw), H = Math.round(vh);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${col.bg}"/>${defs}${paths}</svg>`;
}

function buildASCII(grid) {
  const { s, cells } = grid;
  const max = s - 1;
  return Array.from({ length: 2 * max + 1 }, (_, ri) => {
    const r = ri - max;
    const indent = ' '.repeat(Math.abs(r));
    const row = [];
    for (let q = -max; q <= max; q++) {
      if (Math.abs(q + r) > max) continue;
      const st = cells.get(`${q},${r}`) || 0;
      row.push(st === 1 ? 'X' : st === 2 ? 'O' : '.');
    }
    return indent + row.join(' ');
  }).join('\n');
}

function countStones(grid) {
  let x = 0, o = 0;
  for (const v of grid.cells.values()) { if (v === 1) x++; else if (v === 2) o++; }
  return { x, o };
}

export default function handler(req, res) {
  const parts  = req.url.replace(/^\/b\//, '').split('/');
  const code   = parts[0];
  const isImg  = parts[1] === 'image';

  if (!code) return res.redirect(302, APP_URL);
  const grid = decode(code);
  if (!grid)  return res.redirect(302, APP_URL);

  const ua   = req.headers['user-agent'] || '';
  const hint = req.headers['sec-ch-prefers-color-scheme'];
  const dark = hint !== 'light';

  if (isImg) {
    const svg  = buildSVG(grid, dark);
    const resvg = new Resvg(svg, { fitTo: { mode: 'zoom', value: 2 } });
    const png  = resvg.render().asPng();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.send(Buffer.from(png));
  }

  const appHref = `${APP_URL}?b=${code}`;
  const imgHref = `${SITE_URL}/b/${code}/image?v=2`;
  const ascii   = buildASCII(grid);
  const { x, o } = countStones(grid);

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${appHref}">
<meta property="og:site_name"    content="HEX STRATEGY">
<meta property="og:title"        content="Hex position — X:${x} O:${o} s${grid.s}">
<meta property="og:description"  content="${ascii.replace(/&/g,'&amp;').replace(/</g,'&lt;')}">
<meta property="og:image"        content="${imgHref}">
<meta property="og:url"          content="${appHref}">
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:image"       content="${imgHref}">
</head><body><script>location.replace(${JSON.stringify(appHref)})</script></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(html);
}
