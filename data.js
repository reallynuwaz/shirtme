// ===== ข้อมูลหมวดสินค้า + สินค้า (แก้ที่ไฟล์นี้ที่เดียว) =====
// หมวดสินค้า = การ์ดที่เลื่อนได้ในหน้าแรก และหน้า "สินค้า"  (id ห้ามซ้ำ ใช้ตัวอังกฤษ/ตัวเลข)
// เพิ่มสินค้าในหมวด: เติมบรรทัดใน products ตามรูปแบบ { name:'ชื่อ', price:40, img:'images/ไฟล์.png' }
const CATEGORIES = [
  { id:'black-40',  name:'เสื้อดำ 40',  img:'images/black-40.png',  products:[] },
  { id:'black-80',  name:'เสื้อดำ 80',  img:'images/black-80.png',  products:[] },
  { id:'white-40',  name:'เสื้อขาว 40', img:'images/white-40.png',  products:[] },
  { id:'white-80',  name:'เสื้อขาว 80', img:'images/white-80.png',  products:[] },
  { id:'band-black',  name:'เสื้อวงสีดำ',  img:'images/rockbandblack.png', products:[] },
  { id:'band-white',  name:'เสื้อวงสีขาว', img:'images/rockbandwhite.png', products:[] },
  { id:'cartoon-black', name:'เสื้อลายการ์ตูนสีดำ',  img:'images/lntblack.png', products:[] },
  { id:'cartoon-white', name:'เสื้อลายการ์ตูนสีขาว', img:'images/lntwhite.png', products:[] }
];

// ---- สินค้าตัวอย่าง 10 ชิ้น (ให้เห็นว่าแถวละ 5) ลบบล็อกนี้ทิ้งได้ แล้วใส่สินค้าจริงใน products ด้านบน ----
CATEGORIES[0].products = Array.from({ length: 10 }, (_, i) => (
  { name: 'สินค้าตัวอย่าง ' + (i + 1), price: 40, img: 'images/black-40.png' }
));
