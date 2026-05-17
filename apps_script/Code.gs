const DEFAULT_SPREADSHEET_ID = 'PUT_SPREADSHEET_ID_HERE';
const SHEETS = {
  monthlyEntries: 'MonthlyEntries',
  auditLog: 'AuditLog',
  appConfig: 'AppConfig',
};

const MONTHLY_HEADERS = [
  'entry_id',
  'period',
  'payer_hospital',
  'creditor_hospital',
  'ap_amount',
  'source_doc_ref',
  'prepared_by',
  'review_status',
  'notes',
  'updated_at',
  'updated_by',
  'created_at',
];

const AUDIT_HEADERS = [
  'timestamp',
  'action',
  'period',
  'payer_hospital',
  'user_email',
  'payload_json',
];

const APP_CONFIG_HEADERS = ['key', 'value', 'notes'];

const HOSPITALS = [
  'รพ.ตรัง',
  'รพ.กันตัง',
  'รพ.ย่านตาขาว',
  'รพ.ปะเหลียน',
  'รพ.สิเกา',
  'รพ.ห้วยยอด',
  'รพ.วังวิเศษ',
  'รพ.นาโยง',
  'รพ.รัษฎา',
  'รพ.หาดสำราญ',
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || '';

  if (action) {
    return handleApiGet_(params);
  }

  const template = HtmlService.createTemplateFromFile('Index');
  template.bootstrapJson = JSON.stringify(getBootstrapData());
  return template
    .evaluate()
    .setTitle('Dashboard เจ้าหนี้/ลูกหนี้ รพ.ตรัง')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
    const action = body.action || '';
    if (action === 'saveMonthlyEntries') {
      return jsonOutput(saveMonthlyEntries(body.payload || body));
    }
    return jsonOutput({ ok: false, error: 'Unknown action' });
  } catch (error) {
    return jsonOutput({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function handleApiGet_(params) {
  try {
    let result;
    if (params.action === 'bootstrap') {
      result = getBootstrapData();
    } else if (params.action === 'listMonthlyEntries') {
      result = listMonthlyEntries({
        period: params.period || '',
        payerHospital: params.payerHospital || '',
      });
    } else {
      result = { ok: false, error: 'Unknown action' };
    }

    if (params.callback) {
      return ContentService
        .createTextOutput(`${params.callback}(${JSON.stringify(result)});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOutput(result);
  } catch (error) {
    const result = { ok: false, error: String(error && error.message ? error.message : error) };
    if (params.callback) {
      return ContentService
        .createTextOutput(`${params.callback}(${JSON.stringify(result)});`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOutput(result);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBootstrapData() {
  setupDatabase();
  return {
    ok: true,
    spreadsheetId: getSpreadsheetId_(),
    userEmail: getUserEmail_(),
    hospitals: HOSPITALS,
    monthlyEntries: listMonthlyEntries({}),
  };
}

function listMonthlyEntries(filter) {
  setupDatabase();
  const period = filter && filter.period ? String(filter.period) : '';
  const payerHospital = filter && filter.payerHospital ? String(filter.payerHospital) : '';
  const sheet = getSheet_(SHEETS.monthlyEntries);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { ok: true, records: [] };
  }

  const headers = values[0].map(String);
  const rows = values.slice(1)
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => rowToObject_(headers, row))
    .filter((record) => {
      if (period && record.period !== period) return false;
      if (payerHospital && record.payer_hospital !== payerHospital) return false;
      return true;
    });

  return { ok: true, records: rows };
}

function saveMonthlyEntries(payload) {
  setupDatabase();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const period = requireValue_(payload.period, 'period');
    const payerHospital = requireValue_(payload.payerHospital || payload.payer_hospital, 'payerHospital');
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const userEmail = getUserEmail_();
    const now = new Date();
    const sheet = getSheet_(SHEETS.monthlyEntries);
    const values = sheet.getDataRange().getValues();
    const headers = values.length ? values[0].map(String) : MONTHLY_HEADERS;
    const existingRows = values.slice(1);
    const indexByKey = {};

    existingRows.forEach((row, index) => {
      const record = rowToObject_(headers, row);
      const key = entryKey_(record.period, record.payer_hospital, record.creditor_hospital);
      indexByKey[key] = index + 2;
    });

    const appendRows = [];
    const updated = [];
    entries.forEach((entry) => {
      const creditorHospital = requireValue_(entry.creditorHospital || entry.creditor_hospital, 'creditorHospital');
      const key = entryKey_(period, payerHospital, creditorHospital);
      const rowNumber = indexByKey[key];
      const amount = Number(entry.amount || entry.ap_amount || 0);
      const rowValues = [
        Utilities.base64EncodeWebSafe(key).replace(/=+$/g, ''),
        period,
        payerHospital,
        creditorHospital,
        Number.isFinite(amount) ? amount : 0,
        entry.docRef || entry.source_doc_ref || '',
        entry.preparedBy || entry.prepared_by || '',
        entry.status || entry.review_status || 'Draft',
        entry.notes || '',
        now,
        userEmail,
        rowNumber ? getCreatedAt_(sheet, rowNumber) : now,
      ];

      if (rowNumber) {
        sheet.getRange(rowNumber, 1, 1, MONTHLY_HEADERS.length).setValues([rowValues]);
      } else {
        appendRows.push(rowValues);
      }
      updated.push({ period, payerHospital, creditorHospital, amount: rowValues[4] });
    });

    if (appendRows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appendRows.length, MONTHLY_HEADERS.length).setValues(appendRows);
    }

    appendAudit_('saveMonthlyEntries', period, payerHospital, userEmail, {
      count: updated.length,
      entries: updated,
    });

    return {
      ok: true,
      saved: updated.length,
      records: listMonthlyEntries({ period, payerHospital }).records,
      updatedAt: now.toISOString(),
      userEmail,
    };
  } finally {
    lock.releaseLock();
  }
}

function setupDatabase() {
  const spreadsheetId = getSpreadsheetId_();
  const ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSheet_(ss, SHEETS.monthlyEntries, MONTHLY_HEADERS);
  ensureSheet_(ss, SHEETS.auditLog, AUDIT_HEADERS);
  const config = ensureSheet_(ss, SHEETS.appConfig, APP_CONFIG_HEADERS);
  if (config.getLastRow() <= 1) {
    const rows = [
      ['spreadsheet_id', spreadsheetId, 'Google Sheet ฐานข้อมูลกลาง'],
      ['version', '1.0.0', 'Apps Script backend schema version'],
    ].concat(HOSPITALS.map((hospital) => ['hospital', hospital, 'โรงพยาบาลในระบบ']));
    config.getRange(2, 1, rows.length, APP_CONFIG_HEADERS.length).setValues(rows);
  }
  return { ok: true };
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((header, index) => firstRow[index] === header);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#175466')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  }
  return sheet;
}

function getSheet_(name) {
  return SpreadsheetApp.openById(getSpreadsheetId_()).getSheetByName(name);
}

function getSpreadsheetId_() {
  const configuredId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (configuredId) return configuredId;
  if (DEFAULT_SPREADSHEET_ID === 'PUT_SPREADSHEET_ID_HERE') {
    throw new Error('Please set Script Property SPREADSHEET_ID before running the app.');
  }
  return DEFAULT_SPREADSHEET_ID;
}

function rowToObject_(headers, row) {
  return headers.reduce((acc, header, index) => {
    const value = row[index];
    acc[header] = value instanceof Date ? value.toISOString() : value;
    return acc;
  }, {});
}

function entryKey_(period, payerHospital, creditorHospital) {
  return [period, payerHospital, creditorHospital].join('|');
}

function getCreatedAt_(sheet, rowNumber) {
  const value = sheet.getRange(rowNumber, 12).getValue();
  return value || new Date();
}

function appendAudit_(action, period, payerHospital, userEmail, payload) {
  const sheet = getSheet_(SHEETS.auditLog);
  sheet.appendRow([
    new Date(),
    action,
    period,
    payerHospital,
    userEmail,
    JSON.stringify(payload),
  ]);
}

function getUserEmail_() {
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
}

function requireValue_(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return String(value).trim();
}

function jsonOutput(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
