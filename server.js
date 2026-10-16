// SHIRTME server — ไม่มี dependency ภายนอก ใช้ Node >= 22.13 (มี node:sqlite ในตัว)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// ---------- config ----------
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const IS_PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_HOURS = 12;
const MAX_UPLOAD = 5 * 1024 * 1024;
// โดเมนหน้าเว็บที่อนุญาตให้ส่งคำขอแก้ข้อมูล (เมื่อหน้าเว็บอยู่ Vercel แต่ backend อยู่ที่อื่น) เช่น shirtme.vercel.app,www.myshop.com
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);

if (IS_PROD && (ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD === 'change-me-please')) {
  console.error('ต้องตั้ง ADMIN_PASSWORD (อย่างน้อย 8 ตัวอักษร และห้ามเป็นค่าตัวอย่าง) ในไฟล์ .env ก่อนรัน');
  process.exit(1);
}
if (IS_PROD && !process.env.SESSION_SECRET) {
  console.warn('คำเตือน: ไม่ได้ตั้ง SESSION_SECRET — ทุกครั้งที่รีสตาร์ท แอดมินจะถูกล็อกเอาท์');
}
const EFFECTIVE_PASSWORD = ADMIN_PASSWORD || 'admin1234'; // โหมดพัฒนาเท่านั้น
if (!ADMIN_PASSWORD) console.warn('โหมดพัฒนา: รหัสแอดมินคือ admin1234');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- database ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'shirtme.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, img TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT NOT NULL, price REAL, img TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT NOT NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), is_read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const DEFAULT_SETTINGS = {
  about_lead: 'SHIRTME ร้านเสื้อยืดลายสนุก ราคาเริ่มต้น 40 บาท (แก้คำอธิบายร้านได้ในหน้าแอดมิน)',
  about_items: [
    { label: 'ชื่อร้าน', value: 'SHIRTME' },
    { label: 'สินค้า', value: 'เสื้อยืดลายสนุก เสื้อวงดนตรี เสื้อลายการ์ตูน' },
    { label: 'เวลาเปิด-ปิด', value: 'ใส่เวลาเปิด-ปิดร้านที่นี่' },
    { label: 'ก่อตั้งเมื่อ', value: 'ใส่ปีที่ก่อตั้งที่นี่' },
    { label: 'เจ้าของร้าน', value: 'ใส่ชื่อเจ้าของร้านที่นี่' }
  ],
  contact_items: [
    { label: 'เว็บไซต์ร้าน', value: 'www.example.com', href: 'https://www.example.com' },
    { label: 'เพจร้าน', value: 'ใส่ชื่อเพจร้านที่นี่', href: 'https://www.facebook.com/' },
    { label: 'ที่อยู่ร้าน', value: 'ใส่ที่อยู่ร้านที่นี่', href: '' }
  ]
};
const SEED_CATEGORIES = [
  ['black-40', 'เสื้อดำ 40', '/images/black-40.png'], ['black-80', 'เสื้อดำ 80', '/images/black-80.png'],
  ['white-40', 'เสื้อขาว 40', '/images/white-40.png'], ['white-80', 'เสื้อขาว 80', '/images/white-80.png'],
  ['band-black', 'เสื้อวงสีดำ', '/images/rockbandblack.png'], ['band-white', 'เสื้อวงสีขาว', '/images/rockbandwhite.png'],
  ['cartoon-black', 'เสื้อลายการ์ตูนสีดำ', '/images/lntblack.png'], ['cartoon-white', 'เสื้อลายการ์ตูนสีขาว', '/images/lntwhite.png']
];
if (db.prepare('SELECT COUNT(*) n FROM categories').get().n === 0) {
  const ins = db.prepare('INSERT INTO categories (id,name,img,sort) VALUES (?,?,?,?)');
  SEED_CATEGORIES.forEach((c, i) => ins.run(c[0], c[1], c[2], i));
}
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(k, JSON.stringify(v));
}
const getSettings = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, JSON.parse(r.value)]));

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SEC_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'ไฟล์/ข้อมูลใหญ่เกินไป')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req, 100 * 1024);
  try { const v = JSON.parse(buf.toString('utf8') || '{}'); if (v && typeof v === 'object') return v; } catch {}
  throw new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
}
const clientIp = req => (TRUST_PROXY && req.headers['x-forwarded-for']
  ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';

// rate limit (ในหน่วยความจำ)
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (b.length >= max) { buckets.set(key, b); throw new HttpError(429, 'ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'); }
  b.push(now); buckets.set(key, b);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (!v.some(t => now - t < 3600e3)) buckets.delete(k); }, 600e3).unref();

// session cookie (HMAC)
const sign = s => crypto.createHmac('sha256', SESSION_SECRET).update(s).digest('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
function parseCookies(req) {
  const out = {};
  for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return out;
}
const isSecure = req => IS_PROD || req.headers['x-forwarded-proto'] === 'https';
function sessionCookie(req, value, maxAge) {
  return `sid=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`;
}
function isAdmin(req) {
  const tok = parseCookies(req).sid; if (!tok) return false;
  const [payload, sig] = tok.split('.'); if (!payload || !sig) return false;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString()); return p.u === ADMIN_USER && p.exp > Date.now(); } catch { return false; }
}
const requireAdmin = req => { if (!isAdmin(req)) throw new HttpError(401, 'กรุณาเข้าสู่ระบบแอดมิน'); };

// validation
const str = (v, max, name, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, `กรุณากรอก${name}`);
  if (s.length > max) throw new HttpError(400, `${name}ยาวเกินไป (สูงสุด ${max} ตัวอักษร)`);
  return s;
};
const imgPath = v => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s && !/^\/(images|uploads)\/[\w.\-]+$/.test(s)) throw new HttpError(400, 'path รูปภาพไม่ถูกต้อง');
  return s;
};
const price = v => {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new HttpError(400, 'ราคาไม่ถูกต้อง');
  return n;
};
const linkHref = v => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s && !/^https?:\/\//i.test(s)) throw new HttpError(400, 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
  return s.slice(0, 300);
};
const cleanItems = (arr, withHref) => {
  if (!Array.isArray(arr) || arr.length > 30) throw new HttpError(400, 'รายการไม่ถูกต้อง');
  return arr.map(it => {
    const o = { label: str(it && it.label, 60, 'หัวข้อ'), value: str(it && it.value, 300, 'รายละเอียด', false) };
    if (withHref) o.href = linkHref(it && it.href);
    return o;
  });
};
function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return '.png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  if (buf.length > 6 && /^GIF8[79]a/.test(buf.toString('latin1', 0, 6))) return '.gif';
  return null;
}

const catRow = c => ({ id: c.id, name: c.name, img: c.img, sort: c.sort });
const prodRow = p => ({ id: p.id, category_id: p.category_id, name: p.name, price: p.price, img: p.img, sort: p.sort });
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ---------- API ----------
async function api(req, res, url) {
  const m = req.method;
  const p = url.pathname.replace(/\/+$/, '');
  let r;

  // ---- สาธารณะ ----
  if (m === 'GET' && p === '/api/categories') {
    const rows = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id=c.id) AS count FROM categories c ORDER BY sort,rowid').all();
    return json(res, 200, rows.map(c => ({ ...catRow(c), count: c.count })));
  }
  if (m === 'GET' && (r = p.match(/^\/api\/categories\/([\w-]+)$/))) {
    const c = db.prepare('SELECT * FROM categories WHERE id=?').get(r[1]);
    if (!c) throw new HttpError(404, 'ไม่พบหมวดสินค้านี้');
    return json(res, 200, { ...catRow(c), products: db.prepare('SELECT * FROM products WHERE category_id=? ORDER BY sort,id').all(c.id).map(prodRow) });
  }
  if (m === 'GET' && p === '/api/settings') return json(res, 200, getSettings());
  if (m === 'POST' && p === '/api/messages') {
    rateLimit('msg:' + clientIp(req), 5, 10 * 60e3);
    const b = await readJson(req);
    if (b.website) return json(res, 200, { ok: true }); // honeypot กันบอท
    db.prepare('INSERT INTO messages (name,contact,body) VALUES (?,?,?)')
      .run(str(b.name, 100, 'ชื่อ'), str(b.contact, 150, 'ช่องทางติดต่อกลับ'), str(b.body, 2000, 'ข้อความ'));
    return json(res, 201, { ok: true });
  }

  // ---- แอดมิน: เข้า/ออกระบบ ----
  if (m === 'POST' && p === '/api/admin/login') {
    rateLimit('login:' + clientIp(req), 10, 15 * 60e3);
    const b = await readJson(req);
    const okU = safeEq(String(b.username || ''), ADMIN_USER), okP = safeEq(String(b.password || ''), EFFECTIVE_PASSWORD);
    if (!(okU && okP)) throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    const payload = Buffer.from(JSON.stringify({ u: ADMIN_USER, exp: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, `${payload}.${sign(payload)}`, SESSION_HOURS * 3600) });
  }
  if (m === 'POST' && p === '/api/admin/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  if (m === 'GET' && p === '/api/admin/me') return json(res, 200, { admin: isAdmin(req) });

  if (!p.startsWith('/api/admin/')) throw new HttpError(404, 'ไม่พบ API นี้');
  requireAdmin(req);
  // กัน CSRF เพิ่มอีกชั้น: คำขอที่แก้ข้อมูลต้องมาจาก origin เดียวกัน
  if (m !== 'GET') {
    const o = req.headers.origin;
    if (o) {
      const oh = new URL(o).host;
      if (oh !== req.headers.host && !ALLOWED_ORIGINS.includes(oh)) throw new HttpError(403, 'origin ไม่ถูกต้อง');
    }
  }

  // ---- แอดมิน: หมวดสินค้า ----
  if (m === 'POST' && p === '/api/admin/categories') {
    const b = await readJson(req);
    const name = str(b.name, 80, 'ชื่อหมวด');
    let id = slug(String(b.id || '')) || slug(name) || 'cat-' + crypto.randomBytes(3).toString('hex');
    if (db.prepare('SELECT 1 FROM categories WHERE id=?').get(id)) id += '-' + crypto.randomBytes(2).toString('hex');
    const sort = db.prepare('SELECT COALESCE(MAX(sort),-1)+1 n FROM categories').get().n;
    db.prepare('INSERT INTO categories (id,name,img,sort) VALUES (?,?,?,?)').run(id, name, imgPath(b.img), sort);
    return json(res, 201, catRow(db.prepare('SELECT * FROM categories WHERE id=?').get(id)));
  }
  if ((m === 'PUT' || m === 'DELETE') && (r = p.match(/^\/api\/admin\/categories\/([\w-]+)$/))) {
    if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(r[1])) throw new HttpError(404, 'ไม่พบหมวดสินค้านี้');
    if (m === 'DELETE') { db.prepare('DELETE FROM categories WHERE id=?').run(r[1]); return json(res, 200, { ok: true }); }
    const b = await readJson(req);
    db.prepare('UPDATE categories SET name=?, img=?, sort=? WHERE id=?')
      .run(str(b.name, 80, 'ชื่อหมวด'), imgPath(b.img), Number.isInteger(b.sort) ? b.sort : 0, r[1]);
    return json(res, 200, catRow(db.prepare('SELECT * FROM categories WHERE id=?').get(r[1])));
  }

  // ---- แอดมิน: สินค้า ----
  if (m === 'GET' && p === '/api/admin/products') {
    const cid = url.searchParams.get('category');
    const rows = cid ? db.prepare('SELECT * FROM products WHERE category_id=? ORDER BY sort,id').all(cid)
      : db.prepare('SELECT * FROM products ORDER BY category_id,sort,id').all();
    return json(res, 200, rows.map(prodRow));
  }
  if (m === 'POST' && p === '/api/admin/products') {
    const b = await readJson(req);
    const cid = str(b.category_id, 60, 'หมวดสินค้า');
    if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(cid)) throw new HttpError(400, 'ไม่พบหมวดสินค้า');
    const sort = db.prepare('SELECT COALESCE(MAX(sort),-1)+1 n FROM products WHERE category_id=?').get(cid).n;
    const info = db.prepare('INSERT INTO products (category_id,name,price,img,sort) VALUES (?,?,?,?,?)')
      .run(cid, str(b.name, 120, 'ชื่อสินค้า'), price(b.price), imgPath(b.img), sort);
    return json(res, 201, prodRow(db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid)));
  }
  if ((m === 'PUT' || m === 'DELETE') && (r = p.match(/^\/api\/admin\/products\/(\d+)$/))) {
    if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(r[1])) throw new HttpError(404, 'ไม่พบสินค้านี้');
    if (m === 'DELETE') { db.prepare('DELETE FROM products WHERE id=?').run(r[1]); return json(res, 200, { ok: true }); }
    const b = await readJson(req);
    const cid = str(b.category_id, 60, 'หมวดสินค้า');
    if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(cid)) throw new HttpError(400, 'ไม่พบหมวดสินค้า');
    db.prepare('UPDATE products SET category_id=?, name=?, price=?, img=? WHERE id=?')
      .run(cid, str(b.name, 120, 'ชื่อสินค้า'), price(b.price), imgPath(b.img), r[1]);
    return json(res, 200, prodRow(db.prepare('SELECT * FROM products WHERE id=?').get(r[1])));
  }

  // ---- แอดมิน: อัปโหลดรูป (ส่งไฟล์ดิบเป็น body ตรงๆ) ----
  if (m === 'POST' && p === '/api/admin/upload') {
    const buf = await readBody(req, MAX_UPLOAD);
    const ext = sniffImage(buf);
    if (!ext) throw new HttpError(400, 'รองรับเฉพาะไฟล์รูป PNG, JPG, WEBP, GIF');
    const name = crypto.randomBytes(12).toString('hex') + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return json(res, 201, { url: '/uploads/' + name });
  }

  // ---- แอดมิน: ข้อความจากลูกค้า ----
  if (m === 'GET' && p === '/api/admin/messages') return json(res, 200, db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 500').all());
  if ((m === 'PUT' || m === 'DELETE') && (r = p.match(/^\/api\/admin\/messages\/(\d+)$/))) {
    if (m === 'DELETE') db.prepare('DELETE FROM messages WHERE id=?').run(r[1]);
    else db.prepare('UPDATE messages SET is_read=1 WHERE id=?').run(r[1]);
    return json(res, 200, { ok: true });
  }

  // ---- แอดมิน: ข้อมูลร้าน ----
  if (m === 'GET' && p === '/api/admin/settings') return json(res, 200, getSettings());
  if (m === 'PUT' && p === '/api/admin/settings') {
    const b = await readJson(req);
    const next = {
      about_lead: str(b.about_lead, 1000, 'คำอธิบายร้าน', false),
      about_items: cleanItems(b.about_items, false),
      contact_items: cleanItems(b.contact_items, true)
    };
    db.exec('BEGIN');
    try { for (const [k, v] of Object.entries(next)) db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(k, JSON.stringify(v)); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
    return json(res, 200, getSettings());
  }
  throw new HttpError(404, 'ไม่พบ API นี้');
}

// ---------- static files ----------
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'ไม่พบหน้านี้', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(file).toLowerCase();
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, ETag: etag };
    if (req.headers['if-none-match'] === etag) return send(res, 304, '', headers);
    res.writeHead(200, { ...SEC_HEADERS, ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
  let pn; try { pn = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad Request'); }
  if (pn.includes('\0')) return send(res, 400, 'Bad Request');
  if (pn === '/admin') { res.writeHead(301, { ...SEC_HEADERS, Location: '/admin/' }); return res.end(); }
  let root = PUBLIC_DIR, rel = pn, cache = 'public, max-age=300';
  if (pn.startsWith('/uploads/')) { root = UPLOAD_DIR; rel = pn.slice(8); cache = 'public, max-age=2592000, immutable'; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, 'Forbidden');
  serveFile(req, res, file, cache);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return json(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.status, { error: e.message });
    console.error(e);
    json(res, 500, { error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});
server.requestTimeout = 30000;
server.listen(PORT, () => console.log(`SHIRTME รันที่ http://localhost:${PORT}  (แอดมิน: /admin/)`));
const stop = () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
