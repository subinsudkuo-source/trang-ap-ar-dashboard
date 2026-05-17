# Trang Hospital AP/AR Reconciliation Dashboard

ระบบ Dashboard สำหรับตรวจทานเจ้าหนี้/ลูกหนี้ระหว่างโรงพยาบาลตรังและโรงพยาบาลชุมชนในจังหวัดตรัง โดยใช้ Google Sheets เป็นฐานข้อมูลกลางผ่าน Apps Script

## Features

- Dashboard ภาพรวมเจ้าหนี้/ลูกหนี้ระหว่างโรงพยาบาล
- เปรียบเทียบ รพ.ตรัง กับ รพช. 9 แห่ง
- Reconcile ทะเบียนเจ้าหนี้กับงบทดลอง
- ฟอร์มกรอกยอดรายเดือน
- บันทึก/โหลดข้อมูลผ่าน Apps Script ไปยัง Google Sheets
- Export CSV/JSON สำหรับตรวจสอบหรือสำรองข้อมูล

## Project Structure

```text
webapp/                 Static web app
api/                    Vercel serverless runtime config
apps_script/            Google Apps Script backend and Web App files
extract_dashboard_data.py
build_dashboard.mjs
build_apps_script_bundle.mjs
vercel.json
```

## Sensitive Data

ไฟล์ข้อมูลจริงถูก exclude จาก Git โดยตั้งใจ เช่น `.xlsx`, `dashboard_data.json`, `webapp/data.js`, และ generated bundle ใน `outputs/`

สำหรับ development ให้คัดลอกไฟล์ตัวอย่าง:

```bash
cp webapp/data.example.js webapp/data.js
```

เมื่อใช้งานจริงบน Vercel ไม่ต้อง commit `webapp/data.js` เพราะเว็บจะโหลดข้อมูลจาก Apps Script ผ่าน Google Sheet กลาง

## Run Locally

เปิด `webapp/index.html` ได้โดยตรง หรือรัน local server:

```bash
python3 -m http.server 4174 --directory webapp
```

แล้วเปิด:

```text
http://127.0.0.1:4174/
```

## Apps Script Deployment

1. เปิด Google Sheet ฐานข้อมูลกลาง
2. ไปที่ `Extensions > Apps Script`
3. รัน `node build_apps_script_bundle.mjs` เพื่อ sync frontend เข้า `apps_script/Client.html`
4. วางไฟล์จาก `apps_script/`
5. ตั้งค่า Spreadsheet ID ใน `Script Properties`:
   - key: `SPREADSHEET_ID`
   - value: Google Sheet ID
6. รัน `setupDatabase`
7. Deploy > New deployment > Web app
8. Copy Web App URL ที่ได้

Apps Script จะอ่านข้อมูล Dashboard จากแท็บใน Google Sheet:

- `AP_Input`
- `AP_Matrix`
- `Reconcile`
- `Trang_Compare`
- `MonthlyEntries`

## Vercel Deployment

1. Push repo นี้ขึ้น GitHub
2. เปิด Vercel แล้วเลือก `Add New Project`
3. Import repo `subinsudkuo-source/trang-ap-ar-dashboard`
4. ตั้งค่า Environment Variable:
   - key: `APPS_SCRIPT_WEB_APP_URL`
   - value: URL จาก Apps Script Web App
5. Deploy

หลัง deploy แล้ว Vercel จะเปิดหน้าเว็บจาก `webapp/index.html` และ `/api/config` จะส่ง Apps Script URL ให้ frontend อัตโนมัติ

## GitHub Upload

ถ้า GitHub repo มี README อยู่แล้วและ history คนละชุด ให้ใช้:

```bash
git push --force-with-lease -u origin main
```

ก่อน push ตรวจว่าไฟล์ข้อมูลจริงไม่ถูก track:

```bash
git status --short
git ls-files
```

## Build Apps Script Bundle

```bash
node build_apps_script_bundle.mjs
```

คำสั่งนี้จะ sync frontend เข้าไฟล์ Apps Script และสร้าง bundle ใน `outputs/`

## Notes

Repo นี้ควรตั้งเป็น private หากมีการรวมข้อมูลจริงหรือ Spreadsheet ID จริงของหน่วยงาน
