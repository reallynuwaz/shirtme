// วาดการ์ดหมวดสินค้า / สินค้า จาก data.js
(() => {  // ครอบไว้ ไม่ให้ชื่อตัวแปรชนกับ script.js
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catCard = c => `<a class="card" href="category.html?c=${encodeURIComponent(c.id)}">` +
  `<img src="${esc(c.img)}" alt="${esc(c.name)}" loading="lazy"><span class="cap">${esc(c.name)}</span></a>`;

const slider = document.getElementById('slider');      // หน้าแรก: แถบเลื่อน
if (slider) slider.innerHTML = CATEGORIES.map(catCard).join('');

const catGrid = document.getElementById('catGrid');    // หน้าสินค้า: แถวละ 4 หมวด
if (catGrid) catGrid.innerHTML = CATEGORIES.map(catCard).join('');

const prodGrid = document.getElementById('productGrid'); // หน้าหมวด: แถวละ 5 สินค้า
if (prodGrid) {
  const id = new URLSearchParams(location.search).get('c');
  const cat = CATEGORIES.find(c => c.id === id);
  const title = document.getElementById('catTitle');
  if (!cat) {
    title.textContent = 'ไม่พบหมวดสินค้านี้';
  } else {
    title.textContent = cat.name;
    document.title = cat.name + ' | SHIRTME';
    prodGrid.innerHTML = cat.products.length
      ? cat.products.map(p => `<div class="card prod"><img src="${esc(p.img || cat.img)}" alt="${esc(p.name)}" loading="lazy">` +
          `<span class="cap">${esc(p.name)}<span class="price">${p.price != null ? p.price + ' บาท' : ''}</span></span></div>`).join('')
      : '<p class="empty-msg">ยังไม่มีสินค้าในหมวดนี้ เพิ่มสินค้าได้ที่ไฟล์ data.js</p>';
  }
}
})();
