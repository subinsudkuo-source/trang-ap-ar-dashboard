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
apps_script/            Google Apps Script backend and Web App files
extract_dashboard_data.py
build_dashboard.mjs
build_apps_script_bundle.mjs
```

## Sensitive Data

ไฟล์ข้อมูลจริงถูก exclude จาก Git โดยตั้งใจ เช่น `.xlsx`, `dashboard_data.json`, `webapp/data.js`, และ generated bundle ใน `outputs/`

สำหรับ development ให้คัดลอกไฟล์ตัวอย่าง:

```bash
cp webapp/data.example.js webapp/data.js
```

เมื่อใช้งานจริง ให้สร้าง `webapp/data.js` จากข้อมูลที่อนุญาตให้ใช้ในเครื่องหรือ deploy ผ่าน Apps Script ที่เชื่อม Google Sheet กลาง

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
3. วางไฟล์จาก `apps_script/`
4. ตั้งค่า Spreadsheet ID ใน `Script Properties`:
   - key: `SPREADSHEET_ID`
   - value: Google Sheet ID
5. รัน `setupDatabase`
6. Deploy > New deployment > Web app
7. นำ Web App URL ไปใช้ในหน้าเว็บ local หรือใช้ Web App เป็นระบบหลัก

## Build Apps Script Bundle

```bash
node build_apps_script_bundle.mjs
```

คำสั่งนี้จะ sync frontend เข้าไฟล์ Apps Script และสร้าง bundle ใน `outputs/`

## Notes

Repo นี้ควรตั้งเป็น private หากมีการรวมข้อมูลจริงหรือ Spreadsheet ID จริงของหน่วยงาน
