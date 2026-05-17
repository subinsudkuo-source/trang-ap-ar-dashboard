import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(await fs.readFile(path.join(__dirname, "dashboard_data.json"), "utf8"));
const outputDir = path.join(__dirname, "outputs");
const outputPath = path.join(outputDir, "dashboard_เจ้าหนี้_ลูกหนี้_รพตรัง_เมย69.xlsx");

const moneyFormat = '#,##0.00;[Red](#,##0.00);-';
const zeroFormat = '#,##0;[Red](#,##0);-';
const palette = {
  ink: "#0F172A",
  muted: "#64748B",
  teal: "#0F766E",
  teal2: "#CCFBF1",
  blue: "#1D4ED8",
  blue2: "#DBEAFE",
  amber: "#B45309",
  amber2: "#FEF3C7",
  red: "#B91C1C",
  red2: "#FEE2E2",
  green: "#15803D",
  green2: "#DCFCE7",
  grid: "#CBD5E1",
  surface: "#F8FAFC",
};

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rangeBySize(sheet, row, col, rows, cols) {
  return sheet.getRange(`${colName(col)}${row}:${colName(col + cols - 1)}${row + rows - 1}`);
}

function write(sheet, row, col, matrix) {
  rangeBySize(sheet, row, col, matrix.length, matrix[0].length).values = matrix;
}

function writeFormulas(sheet, row, col, matrix) {
  rangeBySize(sheet, row, col, matrix.length, matrix[0].length).formulas = matrix;
}

function style(range, { fill, font, numberFormat, wrapText, horizontalAlignment, verticalAlignment, borders } = {}) {
  if (fill) range.format.fill.color = fill;
  if (font) {
    for (const [key, value] of Object.entries(font)) {
      range.format.font[key] = value;
    }
  }
  if (numberFormat) range.setNumberFormat(numberFormat);
  if (wrapText !== undefined) range.format.wrapText = wrapText;
  if (horizontalAlignment) range.format.horizontalAlignment = horizontalAlignment;
  if (verticalAlignment) range.format.verticalAlignment = verticalAlignment;
  if (borders) range.format.borders = borders;
}

function headerStyle(range, fill = palette.teal) {
  style(range, {
    fill,
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "center",
  });
}

function money(range) {
  range.setNumberFormat(moneyFormat);
}

function freezeAndGrid(sheet, rows = 1, cols = 0) {
  sheet.showGridLines = false;
  if (rows) sheet.freezePanes.freezeRows(rows);
  if (cols) sheet.freezePanes.freezeColumns(cols);
}

function setWidths(sheet, widths) {
  widths.forEach((width, i) => {
    sheet.getRange(`${colName(i + 1)}:${colName(i + 1)}`).format.columnWidthPx = width;
  });
}

function addStatusFormats(range) {
  range.conditionalFormats.add("containsText", {
    text: "OK",
    format: { fill: { color: palette.green2 }, font: { color: palette.green, bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "ตรวจสอบ",
    format: { fill: { color: palette.red2 }, font: { color: palette.red, bold: true } },
  });
}

function rounded(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add("Dashboard");
const compare = workbook.worksheets.add("Trang_Compare");
const reconcile = workbook.worksheets.add("Reconcile");
const apInput = workbook.worksheets.add("AP_Input");
const apMatrix = workbook.worksheets.add("AP_Matrix");
const tbSheet = workbook.worksheets.add("TrialBalance");
const monthly = workbook.worksheets.add("Monthly_Template");
const config = workbook.worksheets.add("Config");

for (const sheet of [dashboard, compare, reconcile, apInput, apMatrix, tbSheet, monthly, config]) {
  sheet.showGridLines = false;
}

const periods = [
  "ตุลาคม 2568",
  "พฤศจิกายน 2568",
  "ธันวาคม 2568",
  "มกราคม 2569",
  "กุมภาพันธ์ 2569",
  "มีนาคม 2569",
  "เมษายน 2569",
  "พฤษภาคม 2569",
  "มิถุนายน 2569",
  "กรกฎาคม 2569",
  "สิงหาคม 2569",
  "กันยายน 2569",
];

write(config, 1, 1, [["Hospitals"], ...data.hospitals.map((h) => [h])]);
write(config, 1, 3, [["Status"], ["Draft"], ["Submitted"], ["Reviewed"], ["Needs follow-up"]]);
write(config, 1, 5, [["Periods"], ...periods.map((p) => [p])]);
write(config, 1, 7, [
  ["Account Key", "Account Code", "Account Name"],
  ["AP_OP_UC_OUT_CUP_IN_PROVINCE", "2101020199.202", "เจ้าหนี้ค่ารักษา OP-UC นอก CUP (ในจังหวัดสังกัด สธ.)"],
  ["AR_OP_UC_OUT_CUP_IN_PROVINCE", "1102050101.203", "ลูกหนี้ค่ารักษา UC - OP นอก CUP (ในจังหวัดสังกัด สธ.)"],
]);
headerStyle(config.getRange("A1:I1"), palette.ink);
setWidths(config, [160, 24, 150, 24, 150, 24, 250, 150, 420]);

const ledgerHeaders = [
  "Period",
  "Payer Hospital",
  "Creditor Hospital",
  "Amount Total",
  "Source File",
  "FY 2561-2565 / Prior",
  "FY 2566",
  "FY 2567",
  "FY 2568",
  "Oct 2568",
  "Nov 2568",
  "Dec 2568",
  "Jan 2569",
  "Feb 2569",
  "Mar 2569",
  "Apr 2569",
  "Notes",
];
const ledgerRows = data.ledger_rows.map((r) => [
  r.period,
  r.payer_hospital,
  r.creditor_hospital,
  rounded(r.amount_total),
  r.source_file,
  rounded(r["เจ้าหนี้ปีงบ 2561- 2565"] ?? r["เจ้าหนี้ปีงบ ......"] ?? 0),
  rounded(r["เจ้าหนี้ปีงบ 2566"] ?? 0),
  rounded(r["เจ้าหนี้ปีงบ 2567"] ?? 0),
  rounded(r["เจ้าหนี้ปีงบ 2568"] ?? 0),
  rounded(r["ต.ค.2568"] ?? r["ต.ค 68"] ?? 0),
  rounded(r["พ.ย.2568"] ?? r["พ.ย 68"] ?? 0),
  rounded(r["ธ.ค.2568"] ?? r["ธ.ค 68"] ?? 0),
  rounded(r["ม.ค.2569"] ?? r["ม.ค 69"] ?? 0),
  rounded(r["ก.พ.2569"] ?? r["ก.พ 69"] ?? 0),
  rounded(r["มี.ค.2569"] ?? r["มี.ค 69"] ?? 0),
  rounded(r["เม.ย.2569"] ?? 0),
  "",
]);
write(apInput, 1, 1, [ledgerHeaders, ...ledgerRows]);
headerStyle(apInput.getRange("A1:Q1"));
money(apInput.getRange(`D2:D${ledgerRows.length + 1}`));
money(apInput.getRange(`F2:P${ledgerRows.length + 1}`));
freezeAndGrid(apInput, 1, 3);
setWidths(apInput, [130, 150, 170, 130, 190, 130, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 220]);
apInput.dataValidations.add({ range: "A2:A1000", rule: { type: "list", formula1: "Config!$E$2:$E$13" } });
apInput.dataValidations.add({ range: "B2:C1000", rule: { type: "list", formula1: "Config!$A$2:$A$11" } });

const tbHeaders = ["Period", "Account Key", "Account Code", "Hospital", "Amount"];
const tbRows = data.trial_balance_rows.map((r) => [
  r.period,
  r.account_key,
  r.account_code,
  r.hospital,
  rounded(r.amount),
]);
write(tbSheet, 1, 1, [tbHeaders, ...tbRows]);
headerStyle(tbSheet.getRange("A1:E1"), palette.blue);
money(tbSheet.getRange(`E2:E${tbRows.length + 1}`));
freezeAndGrid(tbSheet, 1, 0);
setWidths(tbSheet, [150, 260, 140, 150, 140]);

dashboard.getRange("A1:N1").merge();
dashboard.getRange("A1").values = [["Dashboard ตรวจทานเจ้าหนี้/ลูกหนี้ ระหว่าง รพ.ตรัง และ รพช. จังหวัดตรัง"]];
style(dashboard.getRange("A1:N1"), {
  fill: palette.ink,
  font: { bold: true, color: "#FFFFFF", size: 14 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
});
dashboard.getRange("A1:N1").format.rowHeightPx = 28;
dashboard.getRange("A2").values = [["Period"]];
dashboard.getRange("B2").values = [[data.period]];
dashboard.dataValidations.add({ range: "B2", rule: { type: "list", formula1: "Config!$E$2:$E$13" } });
style(dashboard.getRange("A2:B2"), { fill: palette.teal2, font: { bold: true, color: palette.ink } });
dashboard.getRange("D2:K2").merge();
dashboard.getRange("D2").values = [["แหล่งข้อมูล: ทะเบียนเจ้าหนี้ตามจ่าย เม.ย.69 + งบทดลอง สิ้น เม.ย.69"]];
style(dashboard.getRange("D2:K2"), { fill: palette.surface, font: { color: palette.muted }, horizontalAlignment: "left" });

const kpiLabels = [
  ["รพ.ตรัง เจ้าหนี้ต่อ รพช.", "รพช. เจ้าหนี้ต่อ รพ.ตรัง", "สุทธิฝั่ง รพ.ตรัง"],
  ["AP รพ.ตรัง ตามงบทดลอง", "ส่วนต่าง AP รพ.ตรัง", "AR รพ.ตรัง ตามงบทดลอง"],
  ["ส่วนต่าง AR รพ.ตรัง", "คู่ที่ รพ.ตรังจ่ายสุทธิ", "โรงพยาบาล AP ไม่ตรง TB"],
];
write(dashboard, 4, 1, [kpiLabels[0], [null, null, null], kpiLabels[1], [null, null, null], kpiLabels[2]]);
writeFormulas(dashboard, 5, 1, [[
  '=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,$B$2,AP_Input!$B$2:$B$1000,"รพ.ตรัง")',
  '=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,$B$2,AP_Input!$C$2:$C$1000,"รพ.ตรัง")',
  "=B5-A5",
]]);
writeFormulas(dashboard, 7, 1, [[
  '=SUMIFS(TrialBalance!$E$2:$E$500,TrialBalance!$A$2:$A$500,$B$2,TrialBalance!$B$2:$B$500,"AP_OP_UC_OUT_CUP_IN_PROVINCE",TrialBalance!$D$2:$D$500,"รพ.ตรัง")',
  "=A5-A7",
  '=SUMIFS(TrialBalance!$E$2:$E$500,TrialBalance!$A$2:$A$500,$B$2,TrialBalance!$B$2:$B$500,"AR_OP_UC_OUT_CUP_IN_PROVINCE",TrialBalance!$D$2:$D$500,"รพ.ตรัง")',
]]);
writeFormulas(dashboard, 9, 1, [[
  "=B5-C7",
  '=COUNTIF(Trang_Compare!$E$2:$E$10,"รพ.ตรังสุทธิจ่าย")',
  '=COUNTIF(Reconcile!$E$2:$E$11,"ตรวจสอบ")',
]]);
style(dashboard.getRange("A4:C4"), { fill: palette.teal, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" });
style(dashboard.getRange("A6:C6"), { fill: palette.blue, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" });
style(dashboard.getRange("A8:C8"), { fill: palette.amber, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" });
dashboard.getRange("A4:C8").format.rowHeightPx = 30;
money(dashboard.getRange("A5:C5"));
money(dashboard.getRange("A7:C7"));
money(dashboard.getRange("A9:A9"));
dashboard.getRange("B9:C9").setNumberFormat(zeroFormat);

write(dashboard, 12, 1, [["รพช.", "รพ.ตรังต้องจ่าย", "รพช.ต้องจ่าย รพ.ตรัง", "สุทธิฝั่ง รพ.ตรัง", "ทิศทางสุทธิ"]]);
headerStyle(dashboard.getRange("A12:E12"));
const communityRows = data.hospitals.filter((h) => h !== "รพ.ตรัง").map((h) => [h]);
write(dashboard, 13, 1, communityRows);
const dashCompareFormulas = communityRows.map((_, i) => {
  const row = i + 13;
  return [
    `=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,$B$2,AP_Input!$B$2:$B$1000,"รพ.ตรัง",AP_Input!$C$2:$C$1000,A${row})`,
    `=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,$B$2,AP_Input!$B$2:$B$1000,A${row},AP_Input!$C$2:$C$1000,"รพ.ตรัง")`,
    `=C${row}-B${row}`,
    `=IF(D${row}<0,"รพ.ตรังสุทธิจ่าย","รพ.ตรังสุทธิรับ")`,
  ];
});
writeFormulas(dashboard, 13, 2, dashCompareFormulas);
money(dashboard.getRange("B13:D21"));

write(dashboard, 4, 13, [["รพช.", "Net for Trang"], ...communityRows.map((r, i) => [r[0], `=D${i + 13}`])]);
writeFormulas(dashboard, 5, 14, communityRows.map((_, i) => [`=D${i + 13}`]));
headerStyle(dashboard.getRange("M4:N4"), palette.blue);
money(dashboard.getRange("N5:N13"));
const chart = dashboard.charts.add("bar", dashboard.getRange("M4:N13"));
chart.setPosition("F4", "K21");
chart.title = "สุทธิระหว่าง รพ.ตรัง กับ รพช. รายแห่ง";
chart.hasLegend = false;
chart.yAxis = { numberFormatCode: '#,##0' };
freezeAndGrid(dashboard, 2, 0);
setWidths(dashboard, [185, 170, 175, 160, 175, 100, 100, 100, 100, 100, 100, 18, 165, 140]);

write(compare, 1, 1, [["Community Hospital", "Trang AP to Community", "Community AP to Trang", "Net for Trang", "Net Direction", "Review Status", "Notes"]]);
headerStyle(compare.getRange("A1:G1"));
write(compare, 2, 1, communityRows);
const compareFormulas = communityRows.map((_, i) => {
  const row = i + 2;
  return [
    `=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,Dashboard!$B$2,AP_Input!$B$2:$B$1000,"รพ.ตรัง",AP_Input!$C$2:$C$1000,A${row})`,
    `=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,Dashboard!$B$2,AP_Input!$B$2:$B$1000,A${row},AP_Input!$C$2:$C$1000,"รพ.ตรัง")`,
    `=C${row}-B${row}`,
    `=IF(D${row}<0,"รพ.ตรังสุทธิจ่าย","รพ.ตรังสุทธิรับ")`,
    `=IF(ABS(D${row})>0,"มีรายการค้าง","ไม่มีรายการ")`,
    "",
  ];
});
writeFormulas(compare, 2, 2, compareFormulas);
money(compare.getRange("B2:D10"));
style(compare.getRange("A2:G10"), { wrapText: true });
freezeAndGrid(compare, 1, 1);
setWidths(compare, [180, 150, 165, 150, 160, 140, 260]);

write(reconcile, 1, 1, [[
  "Hospital",
  "AP Register Total",
  "AP Trial Balance 2101020199.202",
  "AP Difference",
  "AP Status",
  "AR by Counterparty AP",
  "AR Trial Balance 1102050101.203",
  "AR Difference",
  "AR Status",
  "Notes",
]]);
headerStyle(reconcile.getRange("A1:J1"), palette.ink);
write(reconcile, 2, 1, data.hospitals.map((h) => [h]));
const reconFormulas = data.hospitals.map((_, i) => {
  const row = i + 2;
  return [
    `=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,Dashboard!$B$2,AP_Input!$B$2:$B$1000,A${row})`,
    `=SUMIFS(TrialBalance!$E$2:$E$500,TrialBalance!$A$2:$A$500,Dashboard!$B$2,TrialBalance!$B$2:$B$500,"AP_OP_UC_OUT_CUP_IN_PROVINCE",TrialBalance!$D$2:$D$500,A${row})`,
    `=B${row}-C${row}`,
    `=IF(ABS(D${row})<=1,"OK","ตรวจสอบ")`,
    `=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,Dashboard!$B$2,AP_Input!$C$2:$C$1000,A${row})`,
    `=SUMIFS(TrialBalance!$E$2:$E$500,TrialBalance!$A$2:$A$500,Dashboard!$B$2,TrialBalance!$B$2:$B$500,"AR_OP_UC_OUT_CUP_IN_PROVINCE",TrialBalance!$D$2:$D$500,A${row})`,
    `=F${row}-G${row}`,
    `=IF(ABS(H${row})<=1,"OK","ตรวจสอบ")`,
    "",
  ];
});
writeFormulas(reconcile, 2, 2, reconFormulas);
reconcile.getRange("J2").values = [["AP ต่างจาก TB; ตรวจรายการคู่ค้าอื่นที่รวมอยู่ในรหัสบัญชี"]];
reconcile.getRange("J7").values = [["ทะเบียนมี รพ.หาดใหญ่ 50 บาท ซึ่งไม่อยู่ในกลุ่ม 10 โรงพยาบาล"]];
money(reconcile.getRange("B2:D11"));
money(reconcile.getRange("F2:H11"));
style(reconcile.getRange("E2:E11"), { horizontalAlignment: "center" });
style(reconcile.getRange("I2:I11"), { horizontalAlignment: "center" });
freezeAndGrid(reconcile, 1, 1);
setWidths(reconcile, [170, 150, 190, 140, 115, 160, 190, 140, 115, 320]);

write(apMatrix, 1, 1, [["Period", data.period]]);
write(apMatrix, 3, 1, [["Payer \\ Creditor", ...data.hospitals]]);
write(apMatrix, 4, 1, data.hospitals.map((h) => [h]));
const matrixFormulas = data.hospitals.map((_, r) =>
  data.hospitals.map((_, c) => {
    const row = r + 4;
    const col = colName(c + 2);
    return `=SUMIFS(AP_Input!$D$2:$D$1000,AP_Input!$A$2:$A$1000,$B$1,AP_Input!$B$2:$B$1000,$A${row},AP_Input!$C$2:$C$1000,${col}$3)`;
  }),
);
writeFormulas(apMatrix, 4, 2, matrixFormulas);
headerStyle(apMatrix.getRange("A3:K3"), palette.blue);
style(apMatrix.getRange("A4:A13"), { fill: palette.blue2, font: { bold: true, color: palette.ink } });
money(apMatrix.getRange("B4:K13"));
freezeAndGrid(apMatrix, 3, 1);
setWidths(apMatrix, [180, ...Array(10).fill(135)]);

write(monthly, 1, 1, [[
  "Period",
  "Payer Hospital",
  "Creditor Hospital",
  "AP Amount",
  "Source / Doc Ref",
  "Prepared By",
  "Review Status",
  "Notes",
]]);
headerStyle(monthly.getRange("A1:H1"), palette.amber);
const templateRows = [];
for (const payer of data.hospitals) {
  for (const creditor of data.hospitals) {
    if (payer !== creditor) templateRows.push(["พฤษภาคม 2569", payer, creditor, null, "", "", "Draft", ""]);
  }
}
write(monthly, 2, 1, templateRows);
money(monthly.getRange(`D2:D${templateRows.length + 1}`));
monthly.dataValidations.add({ range: "A2:A500", rule: { type: "list", formula1: "Config!$E$2:$E$13" } });
monthly.dataValidations.add({ range: "B2:C500", rule: { type: "list", formula1: "Config!$A$2:$A$11" } });
monthly.dataValidations.add({ range: "G2:G500", rule: { type: "list", formula1: "Config!$C$2:$C$5" } });
freezeAndGrid(monthly, 1, 3);
setWidths(monthly, [130, 160, 170, 130, 220, 140, 140, 260]);

for (const sheet of [dashboard, compare, reconcile, apInput, apMatrix, tbSheet, monthly, config]) {
  const used = sheet.getUsedRange();
  if (used) {
    style(used, { verticalAlignment: "center" });
  }
}

await fs.mkdir(outputDir, { recursive: true });
const inspect = await workbook.inspect({
  kind: "sheet,table,formula,drawing",
  maxChars: 6000,
  tableMaxRows: 8,
  tableMaxCols: 8,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
  maxChars: 3000,
});
console.log(errors.ndjson);

for (const sheetName of ["Dashboard", "Reconcile", "AP_Input", "Monthly_Template"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(path.join(outputDir, `${sheetName}.png`), bytes);
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath }, null, 2));
