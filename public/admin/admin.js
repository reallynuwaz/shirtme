(() => {
'use strict';
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT;
const toast = (msg, bad) => { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 2800); };

async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/admin/login') { showLogin(); throw new Error('หมดเวลาเข้าสู่ระบบ'); }
  if (!r.ok) throw new Error(j.error || 'เกิดข้อผิดพลาด');
  return j;
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
async function upload(file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 5MB');
  const r = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'อัปโหลดไม่สำเร็จ');
  return j.url;
}

// ---------- login ----------
function showLogin() {
  $app.innerHTML = `<div class="login"><form class="panel" id="lf"><h2>เข้าสู่ระบบแอดมิน</h2>
    <input name="username" placeholder="ชื่อผู้ใช้" autocomplete="username" required>
    <input name="password" type="password" placeholder="รหัสผ่าน" autocomplete="current-password" required>
    <button class="btn" type="submit">เข้าสู่ระบบ</button><p class="err" id="le"></p></form></div>`;
  document.getElementById('lf').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('POST', '/api/admin/login', f); start(); }
    catch (err) { document.getElementById('le').textContent = err.message; }
  };
}

// ---------- shell ----------
let tab = 'categories', cats = [], unread = 0;
async function start() {
  const me = await fetch('/api/admin/me').then(r => r.json()).catch(() => ({}));
  if (!me.admin) return showLogin();
  $app.innerHTML = `<div class="bar"><span class="logo">SHIRTME แอดมิน</span><span><a href="/" target="_blank">ดูหน้าเว็บ</a> · <a href="#" id="lo">ออกจากระบบ</a></span></div>
    <div class="tabs" id="tabs"></div><main id="main"></main>`;
  document.getElementById('lo').onclick = async e => { e.preventDefault(); await api('POST', '/api/admin/logout', {}).catch(() => {}); showLogin(); };
  render();
}
async function render() {
  cats = await api('GET', '/api/categories');
  const msgs = await api('GET', '/api/admin/messages');
  unread = msgs.filter(m => !m.is_read).length;
  const T = [['categories', 'หมวดสินค้า'], ['products', 'สินค้า'], ['messages', 'ข้อความลูกค้า'], ['settings', 'ข้อมูลร้าน']];
  document.getElementById('tabs').innerHTML = T.map(([k, n]) =>
    `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${n}${k === 'messages' && unread ? `<span class="badge">${unread}</span>` : ''}</button>`).join('');
  document.getElementById('tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; render().catch(x => toast(x.message, true)); } };
  const main = document.getElementById('main'); main.onclick = null;
  if (tab === 'categories') renderCats(main);
  else if (tab === 'products') await renderProducts(main);
  else if (tab === 'messages') renderMessages(main, msgs);
  else await renderSettings(main);
}
const reload = () => render().catch(e => toast(e.message, true));

// ---------- categories ----------
function renderCats(main) {
  main.innerHTML = `<div class="panel"><h2>เพิ่มหมวดสินค้า</h2><form id="nc" class="row">
      <input name="name" placeholder="ชื่อหมวด เช่น เสื้อวงสีแดง" maxlength="80" required>
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif">
      <button class="btn" type="submit">เพิ่มหมวด</button></form></div>
    <div class="panel"><h2>หมวดทั้งหมด (${cats.length})</h2><div class="list">${cats.map(c => `
      <div class="item" data-id="${esc(c.id)}"><img src="${esc(c.img)}" alt="">
        <div class="grow"><input class="cn" value="${esc(c.name)}" maxlength="80"><div class="meta">${c.count} สินค้า · id: ${esc(c.id)}</div></div>
        <input type="file" class="cf" accept="image/png,image/jpeg,image/webp,image/gif" title="เปลี่ยนรูปหมวด">
        <button class="btn sm save">บันทึก</button><button class="btn sm danger del">ลบ</button></div>`).join('') || '<p class="empty">ยังไม่มีหมวด</p>'}</div></div>`;
  document.getElementById('nc').onsubmit = guard(async e => {
    e.preventDefault(); const f = e.target; const btn = f.querySelector('button'); btn.disabled = true;
    try { const img = await upload(f.file.files[0]); await api('POST', '/api/admin/categories', { name: f.name.value, img: img || '' }); toast('เพิ่มหมวดแล้ว'); await reload(); }
    finally { btn.disabled = false; }
  });
  main.querySelector('.list').onclick = guard(async e => {
    const it = e.target.closest('.item'); if (!it) return; const id = it.dataset.id, c = cats.find(x => x.id === id);
    if (e.target.classList.contains('save')) {
      const img = await upload(it.querySelector('.cf').files[0]);
      await api('PUT', '/api/admin/categories/' + id, { name: it.querySelector('.cn').value, img: img || c.img, sort: c.sort }); toast('บันทึกแล้ว'); await reload();
    } else if (e.target.classList.contains('del')) {
      if (!confirm(`ลบหมวด "${c.name}" และสินค้าทั้งหมด ${c.count} ชิ้นในหมวดนี้?`)) return;
      await api('DELETE', '/api/admin/categories/' + id); toast('ลบแล้ว'); await reload();
    }
  });
}

// ---------- products ----------
let curCat = '';
async function renderProducts(main) {
  if (!cats.length) { main.innerHTML = '<div class="panel"><p class="empty">ต้องสร้างหมวดสินค้าก่อน</p></div>'; return; }
  if (!cats.some(c => c.id === curCat)) curCat = cats[0].id;
  const prods = await api('GET', '/api/admin/products?category=' + encodeURIComponent(curCat));
  const opts = sel => cats.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  main.innerHTML = `<div class="panel"><div class="row"><b>หมวด:</b><select id="cs">${opts(curCat)}</select></div>
    <form id="np" class="row"><input name="name" placeholder="ชื่อสินค้า" maxlength="120" required>
      <input name="price" type="number" min="0" step="any" placeholder="ราคา (บาท)" style="flex:0 1 130px">
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif">
      <button class="btn" type="submit">เพิ่มสินค้า</button></form></div>
    <div class="panel"><h2>สินค้าในหมวดนี้ (${prods.length})</h2><div class="list" id="pl">${prods.map(p => `
      <div class="item" data-id="${p.id}"><img src="${esc(p.img || cats.find(c => c.id === curCat).img)}" alt="">
        <div class="grow"><input class="pn" value="${esc(p.name)}" maxlength="120"></div>
        <input class="pp" type="number" min="0" step="any" value="${p.price ?? ''}" style="flex:0 1 110px" placeholder="ราคา">
        <select class="pc">${opts(p.category_id)}</select>
        <input type="file" class="pf" accept="image/png,image/jpeg,image/webp,image/gif" title="เปลี่ยนรูป">
        <button class="btn sm save">บันทึก</button><button class="btn sm danger del">ลบ</button></div>`).join('') || '<p class="empty">ยังไม่มีสินค้าในหมวดนี้</p>'}</div></div>`;
  document.getElementById('cs').onchange = e => { curCat = e.target.value; reload(); };
  document.getElementById('np').onsubmit = guard(async e => {
    e.preventDefault(); const f = e.target; const btn = f.querySelector('button'); btn.disabled = true;
    try { const img = await upload(f.file.files[0]); await api('POST', '/api/admin/products', { category_id: curCat, name: f.name.value, price: f.price.value, img: img || '' }); toast('เพิ่มสินค้าแล้ว'); await reload(); }
    finally { btn.disabled = false; }
  });
  document.getElementById('pl').onclick = guard(async e => {
    const it = e.target.closest('.item'); if (!it) return; const id = it.dataset.id, p = prods.find(x => String(x.id) === id);
    if (e.target.classList.contains('save')) {
      const img = await upload(it.querySelector('.pf').files[0]);
      await api('PUT', '/api/admin/products/' + id, { category_id: it.querySelector('.pc').value, name: it.querySelector('.pn').value, price: it.querySelector('.pp').value, img: img || p.img });
      toast('บันทึกแล้ว'); await reload();
    } else if (e.target.classList.contains('del')) {
      if (!confirm(`ลบสินค้า "${p.name}"?`)) return;
      await api('DELETE', '/api/admin/products/' + id); toast('ลบแล้ว'); await reload();
    }
  });
}

// ---------- messages ----------
function renderMessages(main, msgs) {
  main.innerHTML = `<div class="panel"><h2>ข้อความจากลูกค้า (${msgs.length})</h2>${msgs.map(m => `
    <div class="msg${m.is_read ? '' : ' unread'}" data-id="${m.id}"><b>${esc(m.name)}</b> · ${esc(m.contact)}
      <div class="meta">${esc(m.created_at)} UTC</div><div class="body">${esc(m.body)}</div>
      ${m.is_read ? '' : '<button class="btn sm ghost read">ทำเครื่องหมายว่าอ่านแล้ว</button> '}<button class="btn sm danger del">ลบ</button></div>`).join('') || '<p class="empty">ยังไม่มีข้อความ</p>'}</div>`;
  main.onclick = guard(async e => {
    const el = e.target.closest('.msg'); if (!el) return;
    if (e.target.classList.contains('read')) { await api('PUT', '/api/admin/messages/' + el.dataset.id, {}); await reload(); }
    else if (e.target.classList.contains('del')) { if (!confirm('ลบข้อความนี้?')) return; await api('DELETE', '/api/admin/messages/' + el.dataset.id); await reload(); }
  });
}

// ---------- settings ----------
async function renderSettings(main) {
  const s = await api('GET', '/api/admin/settings');
  const rows = (items, href) => items.map(it => href
    ? `<div class="kv"><input class="l" value="${esc(it.label)}" placeholder="หัวข้อ"><input class="v" value="${esc(it.value)}" placeholder="ข้อความที่แสดง"><input class="h" value="${esc(it.href)}" placeholder="ลิงก์ https://... (ไม่ใส่ก็ได้)"><button type="button" class="btn sm danger rm">ลบ</button></div>`
    : `<div class="kv about"><input class="l" value="${esc(it.label)}" placeholder="หัวข้อ"><input class="v" value="${esc(it.value)}" placeholder="รายละเอียด"><button type="button" class="btn sm danger rm">ลบ</button></div>`).join('');
  main.innerHTML = `<form id="sf"><div class="panel"><h2>หน้า "เกี่ยวกับเรา"</h2>
      <textarea id="lead" rows="3" maxlength="1000" placeholder="คำอธิบายร้าน">${esc(s.about_lead)}</textarea>
      <div id="ab" style="margin-top:12px">${rows(s.about_items, false)}</div><button type="button" class="btn sm ghost" id="aa">+ เพิ่มหัวข้อ</button></div>
    <div class="panel"><h2>หน้า "ติดต่อ"</h2><div id="ct">${rows(s.contact_items, true)}</div><button type="button" class="btn sm ghost" id="ca">+ เพิ่มช่องทางติดต่อ</button></div>
    <button class="btn" type="submit">บันทึกข้อมูลร้าน</button></form>`;
  const add = (id, html) => document.getElementById(id).insertAdjacentHTML('beforeend', html);
  document.getElementById('aa').onclick = () => add('ab', rows([{ label: '', value: '' }], false));
  document.getElementById('ca').onclick = () => add('ct', rows([{ label: '', value: '', href: '' }], true));
  main.onclick = e => { if (e.target.classList.contains('rm')) e.target.closest('.kv').remove(); };
  const read = id => [...document.querySelectorAll(`#${id} .kv`)].map(r => ({ label: r.querySelector('.l').value, value: r.querySelector('.v').value, ...(r.querySelector('.h') ? { href: r.querySelector('.h').value } : {}) })).filter(x => x.label.trim());
  document.getElementById('sf').onsubmit = guard(async e => {
    e.preventDefault();
    await api('PUT', '/api/admin/settings', { about_lead: document.getElementById('lead').value, about_items: read('ab'), contact_items: read('ct') });
    toast('บันทึกแล้ว');
  });
}

start();
})();
