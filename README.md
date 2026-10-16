# SHIRTME — เว็บร้านเสื้อยืด (Frontend + Backend + แอดมิน)

ไม่มี dependency ภายนอก ใช้แค่ **Node.js 22.13+** (ฐานข้อมูล SQLite ในตัว)

## โครงสร้าง
- `public/` — หน้าเว็บ (frontend) + `public/admin/` หน้าแอดมิน
- `server.js` — backend: API, เข้าสู่ระบบแอดมิน, อัปโหลดรูป, เสิร์ฟไฟล์
- `data/` — ฐานข้อมูล `shirtme.db` และรูปที่อัปโหลด (สำรองโฟลเดอร์นี้ไว้เสมอ)

## รันในเครื่อง
```
node --no-warnings server.js        # เปิด http://localhost:3000   แอดมิน: /admin/
```
โหมดพัฒนาถ้าไม่ตั้งรหัส จะใช้ผู้ใช้ `admin` / รหัส `admin1234`

## ขึ้นเว็บจริงพร้อมโดเมน (แนะนำ: VPS + Docker)
1. เช่า VPS (Ubuntu) เช่น DigitalOcean / Vultr / Contabo ราคาเริ่มประมาณ 150–250 บาท/เดือน และซื้อโดเมน
2. ที่ผู้ให้บริการโดเมน ตั้ง **A record** ชี้ `shirtme.โดเมนของคุณ` (และ `www` ถ้าต้องการ) ไปที่ IP ของ VPS
3. บน VPS ติดตั้ง Docker: `curl -fsSL https://get.docker.com | sh`
4. อัปโหลดโฟลเดอร์โปรเจกต์ขึ้น VPS แล้ว:
   ```
   cp .env.example .env
   nano .env            # ใส่ DOMAIN, ADMIN_PASSWORD (ยาว 8+ ตัว), SESSION_SECRET (openssl rand -hex 32)
   docker compose up -d --build
   ```
5. รอ 1–2 นาที เปิด `https://โดเมนของคุณ` — Caddy ออก HTTPS ให้อัตโนมัติ (ต้องเปิดพอร์ต 80 และ 443)
6. เข้า `https://โดเมนของคุณ/admin/` เพื่อเพิ่ม/แก้สินค้า หมวด รูป ข้อมูลร้าน และอ่านข้อความลูกค้า

อัปเดตเว็บ: แก้ไฟล์แล้วรัน `docker compose up -d --build` อีกครั้ง (ข้อมูลใน volume ไม่หาย)

สำรองข้อมูล: `docker compose cp app:/data ./backup`

### ทางเลือกไม่ใช้ Docker
รัน `NODE_ENV=production ADMIN_PASSWORD=... SESSION_SECRET=... TRUST_PROXY=1 node --no-warnings server.js` ด้วย pm2/systemd
แล้วใช้ Caddy หรือ nginx ทำ reverse proxy + HTTPS ไปที่พอร์ต 3000

### ตัวแปรสภาพแวดล้อม
| ชื่อ | ความหมาย |
|---|---|
| `PORT` | พอร์ต (ค่าเริ่มต้น 3000) |
| `DATA_DIR` | ที่เก็บฐานข้อมูล/รูป (ค่าเริ่มต้น `./data`) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | บัญชีแอดมิน (production ต้องตั้งรหัส) |
| `SESSION_SECRET` | คีย์เซ็นคุกกี้ล็อกอิน |
| `TRUST_PROXY=1` | ใช้เมื่ออยู่หลัง Caddy/nginx เพื่ออ่าน IP จริง |

## API สรุป
สาธารณะ: `GET /api/categories`, `GET /api/categories/:id`, `GET /api/settings`, `POST /api/messages`
แอดมิน (ต้องล็อกอิน): `/api/admin/{login,logout,me,categories,products,upload,messages,settings}`

## ความปลอดภัยที่ใส่ไว้แล้ว
คุกกี้ HttpOnly+SameSite+Secure, จำกัดครั้งล็อกอิน/ส่งข้อความ, ตรวจชนิดไฟล์รูปจากเนื้อไฟล์ (≤5MB), กัน path traversal,
ตรวจ origin กัน CSRF, Content-Security-Policy, escape ข้อความทุกจุด, ฟอร์มติดต่อมี honeypot กันบอท
