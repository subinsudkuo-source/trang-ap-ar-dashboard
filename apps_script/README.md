# Apps Script backend

ใช้โฟลเดอร์นี้สร้าง Apps Script Web App ที่ใช้ Google Sheet เป็นฐานข้อมูลกลาง

## ไฟล์ที่ต้องนำเข้า Apps Script

- `Code.gs`
- `Index.html`
- `WebAppBody.html`
- `Styles.html`
- `Client.html` สร้างจาก `node build_apps_script_bundle.mjs`
- `appsscript.json`

## Deploy

1. เปิด Google Sheet ฐานข้อมูลกลางของคุณ
2. ไปที่ Extensions > Apps Script
3. รัน `node build_apps_script_bundle.mjs` จากโฟลเดอร์หลัก เพื่อสร้าง `Client.html`
4. วางไฟล์จากโฟลเดอร์นี้
5. ตั้งค่า Script Properties:
   - key: `SPREADSHEET_ID`
   - value: Google Sheet ID
6. รัน `setupDatabase` หนึ่งครั้งและอนุญาตสิทธิ์
7. Deploy > New deployment > Web app
8. ตั้งค่า Execute as: Me และ Who has access: ตามนโยบายหน่วยงาน
9. ใช้ URL ที่ได้เป็น Web App หลัก

## ใช้กับหน้า local

ถ้ายังเปิด `webapp/index.html` จากเครื่อง ให้ copy URL ที่ได้จาก Deploy แล้ววางในช่อง
`Apps Script Web App URL` จากนั้นกด `ใช้ URL นี้`

หลังจากนั้นปุ่ม `โหลดจาก Sheet` และ `บันทึกเข้า Sheet` จะทำงานกับ Google Sheet กลาง

## Sync ไฟล์หลังแก้ frontend

รันคำสั่งนี้จากโฟลเดอร์หลัก:

```bash
node build_apps_script_bundle.mjs
```

คำสั่งนี้จะอัปเดต `Styles.html`, `Client.html` และสร้างไฟล์
`outputs/apps_script_backend_bundle.zip`

## Database tabs

- `MonthlyEntries`: เก็บยอดรายเดือนรายคู่บัญชี
- `AuditLog`: เก็บประวัติการบันทึก
- `AppConfig`: เก็บค่าระบบและรายชื่อโรงพยาบาล
- `AP_Input`: ทะเบียนเจ้าหนี้ตามจ่าย
- `AP_Matrix`: matrix ผู้จ่าย/เจ้าหนี้
- `Reconcile`: ผลตรวจทะเบียนเจ้าหนี้กับงบทดลอง
- `Trang_Compare`: ตารางเปรียบเทียบ รพ.ตรัง กับ รพช.
