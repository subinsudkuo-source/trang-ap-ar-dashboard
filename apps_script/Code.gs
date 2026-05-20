const DEFAULT_SPREADSHEET_ID = 'PUT_SPREADSHEET_ID_HERE';
const SHEETS = {
  monthlyEntries: 'MonthlyEntries',
  auditLog: 'AuditLog',
  appConfig: 'AppConfig',
  apInput: 'AP_Input',
  apMatrix: 'AP_Matrix',
  reconcile: 'Reconcile',
  trangCompare: 'Trang_Compare',
  trialBalance: 'TrialBalance',
};

const PERIOD_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

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
    dashboardData: getDashboardData_(),
    monthlyEntries: listMonthlyEntries({}),
  };
}

function getDashboardData_() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId_());
  const monthlyDashboard = buildDashboardFromMonthlyEntries_(ss);
  if (monthlyDashboard) return monthlyDashboard;

  const matrixData = readMatrix_(ss);
  const hospitals = matrixData.hospitals.length ? matrixData.hospitals : HOSPITALS;
  const period = matrixData.period || readPeriodFromApInput_(ss) || 'เมษายน 2569';
  const ledgerRows = readApInputRows_(ss, period);
  const matrix = buildMatrixFromLedgerRows_(hospitals, ledgerRows, period);
  const trialRows = readTrialBalanceRows_(ss);
  const trialTotals = getTrialBalanceTotals_(trialRows, period);

  return {
    period,
    hospitals,
    source: 'AP_Input',
    ledger_rows: ledgerRows,
    matrix,
    trial_balance_rows: trialRows,
    trial_balance_target_rows: [],
    reconciliation: buildMonthlyReconciliation_(hospitals, matrix, trialTotals),
    trang_comparison: buildTrangComparisonFromMatrix_(matrix, hospitals),
  };
}

function buildDashboardFromMonthlyEntries_(ss) {
  const records = readMonthlyEntryRows_(ss);
  if (!records.length) return null;

  const period = getLatestPeriod_(records);
  const periodRecords = records.filter((record) => String(record.period || '') === period);
  if (!periodRecords.length) return null;

  const hospitals = getHospitalsFromRecords_(periodRecords);
  const matrix = buildMonthlyMatrix_(hospitals, periodRecords);
  const ledgerRows = buildMonthlyLedgerRows_(period, periodRecords);
  const trialRows = readTrialBalanceRows_(ss);
  const trialTotals = getTrialBalanceTotals_(trialRows, period);
  const reconciliation = buildMonthlyReconciliation_(hospitals, matrix, trialTotals);

  return {
    period,
    hospitals,
    source: 'MonthlyEntries',
    monthly_record_count: periodRecords.length,
    ledger_rows: ledgerRows,
    matrix,
    trial_balance_rows: trialRows,
    trial_balance_target_rows: trialRows.filter((row) => row.period === period),
    reconciliation,
    trang_comparison: buildTrangComparisonFromMatrix_(matrix, hospitals),
  };
}

function readMonthlyEntryRows_(ss) {
  return readTableObjects_(ss, SHEETS.monthlyEntries)
    .filter((row) => row.period && row.payer_hospital && row.creditor_hospital)
    .map((row) => ({
      period: String(row.period || '').trim(),
      payer_hospital: String(row.payer_hospital || '').trim(),
      creditor_hospital: String(row.creditor_hospital || '').trim(),
      ap_amount: parseAmount_(row.ap_amount),
      source_doc_ref: row.source_doc_ref || '',
      prepared_by: row.prepared_by || '',
      review_status: row.review_status || '',
      notes: row.notes || '',
      updated_at: row.updated_at || '',
      created_at: row.created_at || '',
    }));
}

function getLatestPeriod_(records) {
  return records
    .map((record) => record.period)
    .filter(Boolean)
    .sort((a, b) => periodSortValue_(b) - periodSortValue_(a))[0] || '';
}

function periodSortValue_(period) {
  const text = String(period || '').trim();
  const monthIndex = PERIOD_MONTHS.findIndex((month) => text.indexOf(month) !== -1);
  const yearMatch = text.match(/(25\d{2}|26\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  return year * 12 + (monthIndex >= 0 ? monthIndex : 0);
}

function getHospitalsFromRecords_(records) {
  const seen = {};
  HOSPITALS.forEach((hospital) => {
    seen[hospital] = true;
  });
  records.forEach((record) => {
    if (record.payer_hospital) seen[record.payer_hospital] = true;
    if (record.creditor_hospital) seen[record.creditor_hospital] = true;
  });
  return Object.keys(seen);
}

function buildMonthlyMatrix_(hospitals, records) {
  const matrix = {};
  hospitals.forEach((payer) => {
    matrix[payer] = {};
    hospitals.forEach((creditor) => {
      matrix[payer][creditor] = 0;
    });
  });

  records.forEach((record) => {
    const payer = record.payer_hospital;
    const creditor = record.creditor_hospital;
    if (!matrix[payer] || matrix[payer][creditor] === undefined || payer === creditor) return;
    matrix[payer][creditor] += parseAmount_(record.ap_amount);
  });
  return matrix;
}

function buildMatrixFromLedgerRows_(hospitals, rows, period) {
  const matrix = {};
  hospitals.forEach((payer) => {
    matrix[payer] = {};
    hospitals.forEach((creditor) => {
      matrix[payer][creditor] = 0;
    });
  });

  rows
    .filter((row) => !period || row.period === period)
    .forEach((row) => {
      const payer = row.payer_hospital;
      const creditor = row.creditor_hospital;
      if (!matrix[payer] || matrix[payer][creditor] === undefined || payer === creditor) return;
      matrix[payer][creditor] += parseAmount_(row.amount_total);
    });
  return matrix;
}

function buildMonthlyLedgerRows_(period, records) {
  return records.map((record) => ({
    period,
    payer_hospital: record.payer_hospital,
    creditor_hospital: record.creditor_hospital,
    source_file: 'MonthlyEntries',
    source_doc_ref: record.source_doc_ref || '',
    prepared_by: record.prepared_by || '',
    review_status: record.review_status || '',
    notes: record.notes || '',
    amount_total: parseAmount_(record.ap_amount),
    'รวมเป็นเงิน': parseAmount_(record.ap_amount),
  }));
}

function buildMonthlyReconciliation_(hospitals, matrix, trialTotals) {
  return hospitals.map((hospital) => {
    const apLedger = hospitals.reduce((sum, creditor) => sum + (matrix[hospital]?.[creditor] || 0), 0);
    const arFromCounterparties = hospitals.reduce((sum, payer) => sum + (matrix[payer]?.[hospital] || 0), 0);
    const trial = trialTotals[hospital] || {};
    const apTrial = trial.ap !== undefined ? trial.ap : apLedger;
    const arTrial = trial.ar !== undefined ? trial.ar : arFromCounterparties;
    return {
      hospital,
      ap_ledger_total: apLedger,
      ap_trial_balance: apTrial,
      ap_difference: apLedger - apTrial,
      ar_from_counterparties: arFromCounterparties,
      ar_trial_balance: arTrial,
      ar_difference: arFromCounterparties - arTrial,
    };
  });
}

function buildTrangComparisonFromMatrix_(matrix, hospitals) {
  return hospitals
    .filter((hospital) => hospital !== 'รพ.ตรัง')
    .map((hospital) => {
      const trangPayable = matrix['รพ.ตรัง']?.[hospital] || 0;
      const communityPayable = matrix[hospital]?.['รพ.ตรัง'] || 0;
      return {
        community_hospital: hospital,
        trang_payable_to_community: trangPayable,
        community_payable_to_trang: communityPayable,
        net_for_trang: communityPayable - trangPayable,
      };
    });
}

function readTrialBalanceRows_(ss) {
  return readTableObjects_(ss, SHEETS.trialBalance)
    .filter((row) => row.Period && row.Hospital)
    .map((row) => ({
      period: String(row.Period || '').trim(),
      account_key: String(row['Account Key'] || '').trim(),
      account_code: String(row['Account Code'] || '').trim(),
      hospital: String(row.Hospital || '').trim(),
      amount: parseAmount_(row.Amount),
    }));
}

function getTrialBalanceTotals_(trialRows, period) {
  const totals = {};
  trialRows
    .filter((row) => row.period === period)
    .forEach((row) => {
      if (!totals[row.hospital]) totals[row.hospital] = {};
      if (row.account_key === 'AP_OP_UC_OUT_CUP_IN_PROVINCE' || row.account_code === '2101020199.202') {
        totals[row.hospital].ap = (totals[row.hospital].ap || 0) + row.amount;
      }
      if (row.account_key === 'AR_OP_UC_OUT_CUP_IN_PROVINCE' || row.account_code === '1102050101.203') {
        totals[row.hospital].ar = (totals[row.hospital].ar || 0) + row.amount;
      }
    });
  return totals;
}

function readPeriodFromApInput_(ss) {
  const sheet = ss.getSheetByName(SHEETS.apInput);
  if (!sheet || sheet.getLastRow() < 2) return '';
  return String(sheet.getRange(2, 1).getDisplayValue() || '');
}

function readApInputRows_(ss, defaultPeriod) {
  const rows = readTableObjects_(ss, SHEETS.apInput);
  return rows
    .filter((row) => row['Payer Hospital'] && row['Creditor Hospital'])
    .map((row) => ({
      period: row.Period || defaultPeriod,
      payer_hospital: row['Payer Hospital'],
      creditor_hospital: row['Creditor Hospital'],
      source_file: row['Source File'] || '',
      'เจ้าหนี้ปีงบ ......': parseAmount_(row['FY 2561-2565 / Prior']),
      'เจ้าหนี้ปีงบ 2566': parseAmount_(row['FY 2566']),
      'เจ้าหนี้ปีงบ 2567': parseAmount_(row['FY 2567']),
      'เจ้าหนี้ปีงบ 2568': parseAmount_(row['FY 2568']),
      'ต.ค.2568': parseAmount_(row['Oct 2568']),
      'พ.ย.2568': parseAmount_(row['Nov 2568']),
      'ธ.ค.2568': parseAmount_(row['Dec 2568']),
      'ม.ค.2569': parseAmount_(row['Jan 2569']),
      'ก.พ.2569': parseAmount_(row['Feb 2569']),
      'มี.ค.2569': parseAmount_(row['Mar 2569']),
      'เม.ย.2569': parseAmount_(row['Apr 2569']),
      'รวมเป็นเงิน': parseAmount_(row['Amount Total']),
      amount_total: parseAmount_(row['Amount Total']),
    }));
}

function readReconciliationRows_(ss) {
  return readTableObjects_(ss, SHEETS.reconcile)
    .filter((row) => row.Hospital)
    .map((row) => ({
      hospital: row.Hospital,
      ap_ledger_total: parseAmount_(row['AP Register Total']),
      ap_trial_balance: parseAmount_(row['AP Trial Balance 2101020199.202']),
      ap_difference: parseAmount_(row['AP Difference']),
      ar_from_counterparties: parseAmount_(row['AR by Counterparty AP']),
      ar_trial_balance: parseAmount_(row['AR Trial Balance 1102050101.203']),
      ar_difference: parseAmount_(row['AR Difference']),
    }));
}

function readTrangComparisonRows_(ss) {
  return readTableObjects_(ss, SHEETS.trangCompare)
    .filter((row) => row['Community Hospital'])
    .map((row) => ({
      community_hospital: row['Community Hospital'],
      trang_payable_to_community: parseAmount_(row['Trang AP to Community']),
      community_payable_to_trang: parseAmount_(row['Community AP to Trang']),
      net_for_trang: parseAmount_(row['Net for Trang']),
    }));
}

function readMatrix_(ss) {
  const sheet = ss.getSheetByName(SHEETS.apMatrix);
  if (!sheet || sheet.getLastRow() < 4) {
    return { period: '', hospitals: HOSPITALS, matrix: {} };
  }

  const values = sheet.getDataRange().getDisplayValues();
  const period = values[0] && values[0][1] ? String(values[0][1]) : '';
  const headerRow = values[2] || [];
  const hospitals = headerRow.slice(1).filter(Boolean);
  const matrix = {};

  values.slice(3).forEach((row) => {
    const payer = row[0];
    if (!payer) return;
    matrix[payer] = {};
    hospitals.forEach((creditor, index) => {
      matrix[payer][creditor] = parseAmount_(row[index + 1]);
    });
  });

  return { period, hospitals, matrix };
}

function readTableObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 1) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map((header) => String(header || '').trim());
  return values.slice(1).map((row) => {
    return headers.reduce((record, header, index) => {
      if (header) record[header] = row[index];
      return record;
    }, {});
  });
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

function parseAmount_(value) {
  if (value === undefined || value === null || value === '' || value === '-') return 0;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  const negative = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw.replace(/[(),]/g, '').replace(/[^\d.-]/g, '');
  const number = Number(cleaned || 0);
  if (!Number.isFinite(number)) return 0;
  return negative ? -Math.abs(number) : number;
}

function jsonOutput(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
