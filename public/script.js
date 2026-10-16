// ===== พื้นหลังเลื่อนไปทางซ้ายอัตโนมัติ =====
// ใส่ path รูปตามลำดับที่อยากให้เลื่อน (ใช้รูปสัดส่วน 16:9 จะดูต่อเนื่องที่สุด)
const BG_IMAGES = [
  'images/acdc.jpg',
  'images/nirvana.jpg',
  'images/bob-marley.jpg',
  'images/gunnroses.jpg',
  'images/slipknot.jpg',
  'images/metallica.jpg',
  'images/kiss.png',
  'images/linkin-park.jpg'
];
const BG_SPEED = 0.1; // ความเร็ว: ยิ่งมากยิ่งเร็ว (คิดเป็นสัดส่วนของความสูงพื้นหลัง ต่อวินาที)

const stack = document.getElementById('bgStack');
const reel = document.createElement('div');
reel.className = 'reel';
// ใส่รูปซ้ำ 2 ชุด เพื่อให้วนต่อกันได้ไม่สะดุด
[...BG_IMAGES, ...BG_IMAGES].forEach(src => {
  const img = new Image();
  img.src = src;
  img.alt = '';
  reel.appendChild(img);
});
stack.appendChild(reel);

function startReel() {
  const oneSet = reel.scrollWidth / 2;                // ความกว้างรูปชุดเดียว
  const pxPerSec = stack.clientHeight * BG_SPEED;     // ความเร็วคิดตามความสูง -> คอมกับมือถือดูเหมือนกัน
  reel.style.setProperty('--dur', (oneSet / pxPerSec) + 's');
  reel.classList.add('run');
}
Promise.all([...reel.querySelectorAll('img')].map(im => im.decode().catch(() => {}))).then(startReel);
window.addEventListener('resize', startReel);

// ===== ปุ่มเลื่อนสินค้า =====
const slider = document.getElementById('slider');
const step = () => slider.querySelector('.card').offsetWidth + 22;
document.getElementById('next').onclick = () => slider.scrollBy({ left: step(), behavior: 'smooth' });
document.getElementById('prev').onclick = () => slider.scrollBy({ left: -step(), behavior: 'smooth' });
