// โหลดข้อมูลจาก backend (/api/...) แล้ววาดหน้าเว็บ
(() => {
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'โหลดข้อมูลไม่สำเร็จ'); return r.json(); };
const catCard = c => `<a class="card" href="category.html?c=${encodeURIComponent(c.id)}">` +
  `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy"><span class="cap">${esc(c.name)}</span></a>`;
const fail = (el, msg) => { el.innerHTML = `<p class="empty-msg">${esc(msg)}</p>`; };

const slider = document.getElementById('slider');       // หน้าแรก
const catGrid = document.getElementById('catGrid');     // หน้าสินค้า
if (slider || catGrid) {
  get('/api/categories').then(cats => {
    const html = cats.length ? cats.map(catCard).join('') : '<p class="empty-msg">ยังไม่มีหมวดสินค้า</p>';
    if (slider) slider.innerHTML = html;
    if (catGrid) catGrid.innerHTML = html;
  }).catch(e => fail(slider || catGrid, e.message));
}

const prodGrid = document.getElementById('productGrid'); // หน้าหมวด
if (prodGrid) {
  const id = new URLSearchParams(location.search).get('c') || '';
  const title = document.getElementById('catTitle');
  get('/api/categories/' + encodeURIComponent(id)).then(cat => {
    title.textContent = cat.name;
    document.title = cat.name + ' | SHIRTME';
    prodGrid.innerHTML = cat.products.length
      ? cat.products.map(p => `<div class="card prod"><img src="${esc(p.img || cat.img)}" alt="${esc(p.name)}" loading="lazy">` +
          `<span class="cap">${esc(p.name)}<span class="price">${p.price != null ? esc(p.price) + ' บาท' : ''}</span></span></div>`).join('')
      : '<p class="empty-msg">ยังไม่มีสินค้าในหมวดนี้</p>';
  }).catch(() => { title.textContent = 'ไม่พบหมวดสินค้านี้'; });
}

const row = it => `<div><b>${esc(it.label)}</b>` +
  (it.href ? `<a href="${esc(it.href)}" target="_blank" rel="noopener">${esc(it.value || it.href)}</a>` : `<span>${esc(it.value)}</span>`) + '</div>';
const aboutLead = document.getElementById('aboutLead'), contactInfo = document.getElementById('contactInfo');
if (aboutLead || contactInfo) {
  get('/api/settings').then(s => {
    if (aboutLead) { aboutLead.textContent = s.about_lead; document.getElementById('aboutInfo').innerHTML = s.about_items.map(row).join(''); }
    if (contactInfo) contactInfo.innerHTML = s.contact_items.map(row).join('');
  }).catch(() => {});
}

const form = document.getElementById('msgForm');
if (form) form.addEventListener('submit', async e => {
  e.preventDefault();
  const st = document.getElementById('formStatus'), btn = form.querySelector('button');
  const data = Object.fromEntries(new FormData(form));
  if (!data.name.trim() || !data.contact.trim() || !data.body.trim()) { st.textContent = 'กรุณากรอกข้อมูลให้ครบ'; st.className = 'form-status err'; return; }
  btn.disabled = true; st.textContent = 'กำลังส่ง...'; st.className = 'form-status';
  try {
    const r = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'ส่งไม่สำเร็จ');
    form.reset(); st.textContent = 'ส่งข้อความเรียบร้อย ขอบคุณครับ/ค่ะ'; st.className = 'form-status ok';
  } catch (err) { st.textContent = err.message; st.className = 'form-status err'; }
  btn.disabled = false;
});
})();
