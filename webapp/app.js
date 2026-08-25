const DATA_URL = "./dashboard_data.json";
const STORAGE_KEY = "trang-ap-ar-dashboard-monthly-v1";
const BACKEND_URL_KEY = "trang-ap-ar-dashboard-backend-url";
const DEFAULT_BACKEND_URL = "https://script.google.com/macros/s/AKfycbwsWeRZDYzGV3Y0Dh-FODAQgBuk0s5yiJL-8mturr4NXbjOZxPpKJsvgREKzWm_crqq/exec";
const ALL_HOSPITALS_VALUE = "";
const ALL_HOSPITALS_LABEL = "ทั้งจังหวัด";

const state = {
  data: null,
  dataSource: "local",
  view: "dashboard",
  selectedHospital: ALL_HOSPITALS_VALUE,
  trangSort: "net",
  monthly: loadMonthly(),
  trialBalanceUpload: {
    records: [],
    summary: [],
    sourceFile: "",
  },
  backendUrl: localStorage.getItem(BACKEND_URL_KEY) || "",
  userEmail: "",
};

const THB = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const THB0 = new Intl.NumberFormat("th-TH", {
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat("th-TH", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const monthOptions = [
  "เมษายน 2569",
  "พฤษภาคม 2569",
  "มิถุนายน 2569",
  "กรกฎาคม 2569",
  "สิงหาคม 2569",
  "กันยายน 2569",
  "ตุลาคม 2569",
  "พฤศจิกายน 2569",
  "ธันวาคม 2569",
  "มกราคม 2570",
  "กุมภาพันธ์ 2570",
  "มีนาคม 2570",
];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  showLoading();
  try {
    await loadRuntimeConfig();
    const bootstrap = await loadBootstrapData();
    if (state.backendUrl && !bootstrap?.dashboardData && !isFileRuntime()) {
      throw new Error("เชื่อม Apps Script ไม่สำเร็จ กรุณาตรวจ Deploy Web App และ APPS_SCRIPT_WEB_APP_URL");
    }
    state.data = bootstrap?.dashboardData || window.DASHBOARD_DATA || (await fetchDashboardData());
    state.dataSource = bootstrap?.dashboardData ? "sheet" : "local";
    if (bootstrap?.monthlyEntries?.records) {
      hydrateMonthlyRecords(bootstrap.monthlyEntries.records);
    }
    state.userEmail = bootstrap?.userEmail || window.APPS_SCRIPT_BOOTSTRAP?.userEmail || "";
    state.selectedHospital = ALL_HOSPITALS_VALUE;
    setupControls();
    renderAll();
  } catch (error) {
    document.querySelector("main").innerHTML = `
      <div class="error-state">
        โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

async function loadRuntimeConfig() {
  if (window.APP_CONFIG?.appsScriptUrl) {
    applyBackendUrl(window.APP_CONFIG.appsScriptUrl);
    return;
  }

  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    if (config.appsScriptUrl) {
      applyBackendUrl(config.appsScriptUrl);
      return;
    }
  } catch {
    // file:// and plain static hosting may not have /api/config.
  }

  if (!state.backendUrl && !isFileRuntime()) {
    applyBackendUrl(DEFAULT_BACKEND_URL);
  }
}

function applyBackendUrl(url) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return;
  state.backendUrl = cleanUrl;
  localStorage.setItem(BACKEND_URL_KEY, cleanUrl);
}

async function loadBootstrapData() {
  if (window.APPS_SCRIPT_BOOTSTRAP?.dashboardData) {
    return window.APPS_SCRIPT_BOOTSTRAP;
  }
  if (!state.backendUrl) {
    return window.APPS_SCRIPT_BOOTSTRAP || null;
  }
  try {
    const result = await backendBootstrap();
    return result?.ok ? result : null;
  } catch {
    return window.APPS_SCRIPT_BOOTSTRAP || null;
  }
}

async function fetchDashboardData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function showLoading() {
  document.querySelectorAll(".chart-box, .alert-list, .stat-grid").forEach((node) => {
    node.innerHTML = document.querySelector("#loadingTemplate").innerHTML;
  });
}

function setupControls() {
  fillSelect("#periodSelect", [state.data.period, ...monthOptions.filter((m) => m !== state.data.period)], state.data.period);
  fillSelect("#hospitalSelect", [ALL_HOSPITALS_VALUE, ...state.data.hospitals], state.selectedHospital);
  fillSelect("#entryPeriod", monthOptions, "พฤษภาคม 2569");
  fillSelect("#entryPayer", state.data.hospitals, state.data.hospitals[0]);
  fillSelect("#trialUploadPeriod", [state.data.period, ...monthOptions.filter((m) => m !== state.data.period)], state.data.period);
  fillSelect("#rawPeriodSelect", [state.data.period, ...monthOptions.filter((m) => m !== state.data.period)], state.data.period);
  fillSelect("#rawHospitalSelect", [ALL_HOSPITALS_VALUE, ...state.data.hospitals], ALL_HOSPITALS_VALUE);

  updateSourceLine();
  setupBackendControls();

  document.querySelector("#periodSelect").addEventListener("change", renderAll);
  document.querySelector("#hospitalSelect").addEventListener("change", (event) => {
    state.selectedHospital = event.target.value;
    if (!isAllHospitals()) {
      document.querySelector("#entryPayer").value = state.selectedHospital;
    }
    renderAll();
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.trangSort = button.dataset.sort;
      document.querySelectorAll(".segment").forEach((node) => node.classList.toggle("is-active", node === button));
      renderTrangView();
    });
  });

  document.querySelector("#reconcileStatus").addEventListener("change", renderReconcile);
  document.querySelector("#reconcileSearch").addEventListener("input", renderReconcile);
  document.querySelector("#ledgerSearch").addEventListener("input", renderLedger);
  document.querySelector("#rawPeriodSelect")?.addEventListener("change", syncRawPeriod);
  document.querySelector("#rawHospitalSelect")?.addEventListener("change", renderRawAp);
  document.querySelector("#rawApSearch")?.addEventListener("input", renderRawAp);
  document.querySelector("#entryPeriod").addEventListener("change", renderMonthly);
  document.querySelector("#entryPayer").addEventListener("change", (event) => {
    state.selectedHospital = event.target.value;
    document.querySelector("#hospitalSelect").value = state.selectedHospital;
    renderMonthly();
  });
  document.querySelector("#preparedByInput").addEventListener("input", syncPreparedBy);
  document.querySelector("#saveMonthlyButton").addEventListener("click", saveMonthly);
  document.querySelector("#loadMonthlyButton")?.addEventListener("click", loadMonthlyFromSheet);
  document.querySelector("#saveBackendUrlButton")?.addEventListener("click", saveBackendUrl);
  document.querySelector("#parseTrialBalanceButton")?.addEventListener("click", parseTrialBalanceUpload);
  document.querySelector("#saveTrialBalanceButton")?.addEventListener("click", saveTrialBalanceUpload);
  document.querySelector("#trialBalanceFileInput")?.addEventListener("change", clearTrialBalancePreview);
  document.querySelector("#copyAprilButton").addEventListener("click", copyAprilToMonthly);
  document.querySelector("#resetMonthlyButton").addEventListener("click", resetMonthlyPeriod);
  document.querySelector("#exportMonthlyCsv").addEventListener("click", exportMonthlyCsv);
  document.querySelector("#exportMonthlyJson").addEventListener("click", exportMonthlyJson);
  document.querySelector("#exportTrangCsv").addEventListener("click", exportTrangCsv);
  document.querySelector("#exportRawApCsv")?.addEventListener("click", exportRawApCsv);
}

function setupBackendControls() {
  const backendUrlInput = document.querySelector("#backendUrlInput");
  if (backendUrlInput) {
    backendUrlInput.value = state.backendUrl;
  }
  updateBackendStatus();
}

function saveBackendUrl() {
  const input = document.querySelector("#backendUrlInput");
  state.backendUrl = (input?.value || "").trim();
  if (state.backendUrl) {
    localStorage.setItem(BACKEND_URL_KEY, state.backendUrl);
  } else {
    localStorage.removeItem(BACKEND_URL_KEY);
  }
  updateBackendStatus("บันทึก URL แล้ว");
}

function updateBackendStatus(message) {
  const status = document.querySelector("#backendStatus");
  if (!status) return;
  if (message) {
    status.textContent = message;
  } else if (isAppsScriptRuntime()) {
    status.textContent = state.userEmail ? `เชื่อม Sheet: ${state.userEmail}` : "เชื่อม Sheet ผ่าน Apps Script";
  } else if (state.backendUrl) {
    status.textContent = "พร้อมเชื่อม Apps Script URL";
  } else {
    status.textContent = "โหมด local: ใส่ Apps Script URL เพื่อเชื่อม Sheet";
  }
}

function updateSourceLine() {
  const sourceLine = document.querySelector("#sourceLine");
  if (!sourceLine || !state.data) return;
  const selectedPeriod = getSelectedPeriod();
  if (state.dataSource === "sheet") {
    const sourceName = state.data.source === "MonthlyEntries"
      ? `ฐานข้อมูล Sheet รายเดือน (${state.data.monthly_record_count || 0} รายการ)`
      : "ฐานข้อมูล Sheet กลาง";
    sourceLine.textContent = `แหล่งข้อมูล: ${sourceName} · งวด ${selectedPeriod}`;
    return;
  }
  sourceLine.textContent = `แหล่งข้อมูล: ไฟล์ตัวอย่าง/ไฟล์ local · งวด ${selectedPeriod}`;
}

function getSelectedPeriod() {
  return document.querySelector("#periodSelect")?.value || state.data?.period || "";
}

function fillSelect(selector, values, selected) {
  const select = document.querySelector(selector);
  select.innerHTML = values
    .map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value || ALL_HOSPITALS_LABEL)}</option>`)
    .join("");
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.view === view);
  });
  renderAll();
}

function renderAll() {
  if (!state.data) return;
  updateSourceLine();
  renderDashboard();
  if (state.view === "trang") renderTrangView();
  if (state.view === "reconcile") renderReconcile();
  if (state.view === "monthly") renderMonthly();
  if (state.view === "matrix") renderMatrix();
  if (state.view === "rawAp") renderRawAp();
  if (state.view === "ledger") renderLedger();
}

function renderDashboard() {
  const selected = getSelectedHospital();
  const selectedLabel = getSelectedHospitalLabel();
  const rows = getHospitalComparisonRows(selected);
  const hospitalPayable = isAllHospitals()
    ? sum(state.data.reconciliation, "ap_ledger_total")
    : sum(rows, "selected_payable_to_counterparty");
  const counterpartyPayable = isAllHospitals()
    ? sum(state.data.reconciliation, "ar_from_counterparties")
    : sum(rows, "counterparty_payable_to_selected");
  const net = isAllHospitals()
    ? sum(state.data.reconciliation, "ap_difference")
    : sum(rows, "net_for_selected");
  const reconcile = isAllHospitals() ? null : getSelectedReconciliation(selected);
  const apReviewCount = state.data.reconciliation.filter((row) => Math.abs(row.ap_difference) > 0.01).length;
  const arReviewCount = state.data.reconciliation.filter((row) => Math.abs(row.ar_difference) > 0.01).length;
  const apNeedsReview = reconcile && Math.abs(reconcile.ap_difference) > 0.01;
  const arDiff = reconcile ? Math.abs(reconcile.ar_difference) : state.data.reconciliation.reduce((acc, row) => acc + Math.abs(row.ar_difference), 0);
  const apDiff = reconcile ? Math.abs(reconcile.ap_difference) : state.data.reconciliation.reduce((acc, row) => acc + Math.abs(row.ap_difference), 0);

  document.querySelector("#kpiGrid").innerHTML = [
    statCard(isAllHospitals() ? "เจ้าหนี้รวมทั้งจังหวัด" : `${selectedLabel} ต้องจ่ายคู่บัญชี`, money(hospitalPayable), isAllHospitals() ? "รวมจากทะเบียนเจ้าหนี้ทุกโรงพยาบาล" : `จากทะเบียนเจ้าหนี้ ${selectedLabel}`, "info"),
    statCard(isAllHospitals() ? "ลูกหนี้จากคู่บัญชีรวม" : `คู่บัญชีต้องจ่าย ${selectedLabel}`, money(counterpartyPayable), "จากทะเบียนเจ้าหนี้ของคู่บัญชี", "good"),
    statCard(isAllHospitals() ? "ผลต่างเจ้าหนี้รวม" : `สุทธิฝั่ง ${selectedLabel}`, money(net), isAllHospitals() ? `เจ้าหนี้ต่างรวม ${money(apDiff)}` : net >= 0 ? `${selectedLabel} สุทธิรับ` : `${selectedLabel} สุทธิจ่าย`, net >= 0 ? "good" : "danger"),
    statCard(isAllHospitals() ? "รายการต้องตรวจสอบ" : `สถานะงบทดลอง ${selectedLabel}`, isAllHospitals() ? `${apReviewCount + arReviewCount} รายการ` : apNeedsReview ? "ตรวจสอบ" : "OK", `เจ้าหนี้ต่าง ${money(apDiff)} · ลูกหนี้ต่าง ${money(arDiff)}`, isAllHospitals() ? apReviewCount + arReviewCount ? "warn" : "good" : apNeedsReview ? "warn" : "good"),
  ].join("");

  const chartTitle = document.querySelector("#dashboardView .chart-panel h2");
  if (chartTitle) chartTitle.textContent = isAllHospitals() ? "ยอดสุทธิรายโรงพยาบาล" : `ยอดสุทธิฝั่ง ${selectedLabel}`;

  const netRows = [...rows].sort((a, b) => b.net_for_selected - a.net_for_selected);
  renderBarChart("#netChart", netRows, {
    labelKey: "counterparty_hospital",
    valueKey: "net_for_selected",
    color: "#18796f",
    negativeColor: "#c7483c",
    maxRows: rows.length,
  });
  renderAlertList();
  renderTrangSummaryTable();
}

function statCard(label, value, note, tone) {
  return `
    <article class="stat-card ${tone}">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-note">${escapeHtml(note)}</div>
    </article>
  `;
}

function renderAlertList() {
  const selected = getSelectedHospital();
  const rows = state.data.reconciliation
    .filter((row) => isAllHospitals() || row.hospital === selected)
    .map((row) => ({
      ...row,
      severity: Math.abs(row.ap_difference) > 0.01 ? "เจ้าหนี้" : Math.abs(row.ar_difference) > 0.01 ? "ลูกหนี้" : "",
    }))
    .filter((row) => row.severity)
    .sort((a, b) => Math.abs(b.ap_difference || b.ar_difference) - Math.abs(a.ap_difference || a.ar_difference))
    .slice(0, 6);

  document.querySelector("#alertCount").textContent = `${rows.length} รายการ`;
  document.querySelector("#alertList").innerHTML = rows.length
    ? rows
        .map((row) => {
          const apText = `เจ้าหนี้ต่าง ${money(row.ap_difference)}`;
          const arText = `ลูกหนี้ต่าง ${money(row.ar_difference)}`;
          return `
            <article class="alert-item">
              <div class="alert-title">
                <span>${escapeHtml(row.hospital)}</span>
                <span class="status ${Math.abs(row.ap_difference) > 0.01 ? "review" : "danger"}">${escapeHtml(row.severity)}</span>
              </div>
              <div class="alert-meta">${escapeHtml(apText)} · ${escapeHtml(arText)}</div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">ไม่พบรายการผิดปกติ</div>`;
}

function renderTrangSummaryTable() {
  const selected = getSelectedHospital();
  const selectedLabel = getSelectedHospitalLabel();
  const rows = sortTrangRows();
  renderTable("#trangSummaryTable", [isAllHospitals() ? "โรงพยาบาล" : "คู่บัญชี", isAllHospitals() ? "เจ้าหนี้รวม" : `${selectedLabel} ต้องจ่าย`, isAllHospitals() ? "ลูกหนี้จากคู่บัญชี" : `คู่บัญชีต้องจ่าย ${selectedLabel}`, isAllHospitals() ? "สุทธิ" : `สุทธิฝั่ง ${selectedLabel}`, "ทิศทางสุทธิ"], rows, (row) => [
    row.counterparty_hospital,
    money(row.selected_payable_to_counterparty),
    money(row.counterparty_payable_to_selected),
    money(row.net_for_selected),
    row.net_for_selected >= 0 ? `${row.counterparty_hospital} สุทธิรับ` : `${row.counterparty_hospital} สุทธิจ่าย`,
  ], [1, 2, 3]);
}

function renderTrangView() {
  const selected = getSelectedHospital();
  const selectedLabel = getSelectedHospitalLabel();
  const title = document.querySelector("#trangView h2");
  if (title) title.textContent = isAllHospitals() ? "ภาพรวมสุทธิรายโรงพยาบาลทั้งจังหวัด" : `เปรียบเทียบ ${selectedLabel} กับโรงพยาบาลอื่น`;
  const payButton = document.querySelector('[data-sort="trang"]');
  const receiveButton = document.querySelector('[data-sort="community"]');
  if (payButton) payButton.textContent = isAllHospitals() ? "เจ้าหนี้รวม" : `${shortHospital(selectedLabel)}ต้องจ่าย`;
  if (receiveButton) receiveButton.textContent = isAllHospitals() ? "ลูกหนี้รวม" : "คู่บัญชีต้องจ่าย";

  const rows = sortTrangRows();
  renderBarChart("#trangBars", rows, {
    labelKey: "counterparty_hospital",
    valueKey: state.trangSort === "trang" ? "selected_payable_to_counterparty" : state.trangSort === "community" ? "counterparty_payable_to_selected" : "net_for_selected",
    color: state.trangSort === "trang" ? "#c7483c" : state.trangSort === "community" ? "#315fa8" : "#18796f",
    negativeColor: state.trangSort === "net" ? "#c7483c" : "",
    maxRows: rows.length,
  });
  renderTable("#trangCompareTable", [isAllHospitals() ? "โรงพยาบาล" : "คู่บัญชี", isAllHospitals() ? "เจ้าหนี้รวม" : `${selectedLabel} ต้องจ่าย`, isAllHospitals() ? "ลูกหนี้จากคู่บัญชี" : `คู่บัญชีต้องจ่าย ${selectedLabel}`, isAllHospitals() ? "สุทธิ" : `สุทธิฝั่ง ${selectedLabel}`], rows, (row) => [
    row.counterparty_hospital,
    money(row.selected_payable_to_counterparty),
    money(row.counterparty_payable_to_selected),
    money(row.net_for_selected),
  ], [1, 2, 3]);
}

function sortTrangRows() {
  const rows = getHospitalComparisonRows();
  const sortKey =
    state.trangSort === "trang"
      ? "selected_payable_to_counterparty"
      : state.trangSort === "community"
        ? "counterparty_payable_to_selected"
        : "net_for_selected";
  return rows.sort((a, b) => b[sortKey] - a[sortKey]);
}

function renderReconcile() {
  const selected = getSelectedHospital();
  const status = document.querySelector("#reconcileStatus").value;
  const query = document.querySelector("#reconcileSearch").value.trim().toLowerCase();
  const rows = state.data.reconciliation.filter((row) => {
    const needsReview = Math.abs(row.ap_difference) > 0.01;
    const statusMatch = status === "all" || (status === "review" && needsReview) || (status === "ok" && !needsReview);
    const queryMatch = !query || row.hospital.toLowerCase().includes(query);
    return (isAllHospitals() || row.hospital === selected) && statusMatch && queryMatch;
  });

  renderTable(
    "#reconcileTable",
    ["โรงพยาบาล", "ทะเบียนเจ้าหนี้", "งบทดลองเจ้าหนี้", "ผลต่างเจ้าหนี้", "สถานะเจ้าหนี้", "ลูกหนี้จากคู่บัญชี", "งบทดลองลูกหนี้", "ผลต่างลูกหนี้"],
    rows,
    (row) => {
      const review = Math.abs(row.ap_difference) > 0.01;
      return [
        row.hospital,
        money(row.ap_ledger_total),
        money(row.ap_trial_balance),
        money(row.ap_difference),
        `<span class="status ${review ? "review" : "ok"}">${review ? "ตรวจสอบ" : "OK"}</span>`,
        money(row.ar_from_counterparties),
        money(row.ar_trial_balance),
        money(row.ar_difference),
      ];
    },
    [1, 2, 3, 5, 6, 7],
    [4],
  );
}

function renderMonthly() {
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  const records = getMonthlyRecords(period, payer);
  const rows = state.data.hospitals.filter((hospital) => hospital !== payer);
  const preparedBy = document.querySelector("#preparedByInput").value.trim();

  renderMonthlyStats(period, payer, records, rows);

  const table = document.querySelector("#monthlyTable");
  table.innerHTML = `
    <thead>
      <tr>
        <th>เจ้าหนี้</th>
        <th class="num">ยอดเจ้าหนี้</th>
        <th>เอกสารอ้างอิง</th>
        <th>ผู้จัดทำ</th>
        <th>สถานะ</th>
        <th>หมายเหตุ</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((creditor) => {
          const record = records[creditor] || {};
          return `
            <tr data-creditor="${escapeHtml(creditor)}">
              <td>${escapeHtml(creditor)}</td>
              <td class="num"><input type="number" min="0" step="0.01" data-field="amount" value="${escapeAttr(record.amount ?? "")}" /></td>
              <td><input type="text" data-field="docRef" value="${escapeAttr(record.docRef ?? "")}" /></td>
              <td><input type="text" data-field="preparedBy" value="${escapeAttr(record.preparedBy ?? preparedBy)}" /></td>
              <td>
                <select data-field="status">
                  ${["Draft", "Submitted", "Reviewed"].map((item) => `<option value="${item}"${(record.status || "Draft") === item ? " selected" : ""}>${item}</option>`).join("")}
                </select>
              </td>
              <td><input type="text" data-field="notes" value="${escapeAttr(record.notes ?? "")}" /></td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;

  table.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", updateMonthlyFromTable);
    input.addEventListener("change", updateMonthlyFromTable);
  });
}

function summaryPill(label, value) {
  return `<div class="summary-pill"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function syncPreparedBy() {
  const preparedBy = document.querySelector("#preparedByInput").value;
  document.querySelectorAll('#monthlyTable input[data-field="preparedBy"]').forEach((input) => {
    if (!input.value) input.value = preparedBy;
  });
}

function getMonthlyRecords(period, payer) {
  state.monthly[period] ||= {};
  state.monthly[period][payer] ||= {};
  return state.monthly[period][payer];
}

function updateMonthlyFromTable() {
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  const records = getMonthlyRecords(period, payer);

  document.querySelectorAll("#monthlyTable tbody tr").forEach((row) => {
    const creditor = row.dataset.creditor;
    records[creditor] ||= {};
    row.querySelectorAll("input, select").forEach((input) => {
      records[creditor][input.dataset.field] = input.value;
    });
  });
  const rows = state.data.hospitals.filter((hospital) => hospital !== payer);
  renderMonthlyStats(period, payer, records, rows);
}

function renderMonthlyStats(period, payer, records, rows) {
  const total = rows.reduce((acc, creditor) => acc + toNumber(records[creditor]?.amount), 0);
  const filled = rows.filter((creditor) => toNumber(records[creditor]?.amount) > 0).length;
  const confirmed = rows.filter((creditor) => records[creditor]?.status === "Reviewed").length;

  document.querySelector("#monthlyStatus").textContent = lastSavedText(period, payer);
  document.querySelector("#monthlySummary").innerHTML = [
    summaryPill("ผู้จ่าย", payer),
    summaryPill("ยอดรวม", money(total)),
    summaryPill("คู่บัญชีที่มียอด", `${filled} / ${rows.length}`),
    summaryPill("ตรวจทานแล้ว", `${confirmed} / ${rows.length}`),
  ].join("");
}

async function saveMonthly() {
  updateMonthlyFromTable();
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  getMonthlyRecords(period, payer).__meta = {
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.monthly));
  await saveMonthlyToSheet(period, payer);
  renderMonthly();
}

async function loadMonthlyFromSheet() {
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  updateBackendStatus("กำลังโหลดจาก Sheet...");
  try {
    const result = await backendListMonthlyEntries(period, payer);
    if (!result?.ok) throw new Error(result?.error || "โหลดข้อมูลไม่สำเร็จ");
    hydrateMonthlyRecords(result.records || []);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.monthly));
    updateBackendStatus(`โหลดจาก Sheet แล้ว ${result.records?.length || 0} รายการ`);
    renderMonthly();
  } catch (error) {
    updateBackendStatus(`โหลดไม่สำเร็จ: ${error.message}`);
  }
}

async function saveMonthlyToSheet(period, payer) {
  if (!isAppsScriptRuntime() && !state.backendUrl) {
    updateBackendStatus("บันทึกในเครื่องแล้ว: กรุณาใส่ Apps Script URL เพื่อส่งเข้า Sheet");
    return;
  }

  const records = getMonthlyRecords(period, payer);
  const entries = state.data.hospitals
    .filter((hospital) => hospital !== payer)
    .map((creditor) => ({
      creditorHospital: creditor,
      amount: records[creditor]?.amount || "",
      docRef: records[creditor]?.docRef || "",
      preparedBy: records[creditor]?.preparedBy || "",
      status: records[creditor]?.status || "Draft",
      notes: records[creditor]?.notes || "",
    }));

  updateBackendStatus("กำลังบันทึกเข้า Sheet...");
  try {
    const result = await backendSaveMonthlyEntries({ period, payerHospital: payer, entries });
    if (result?.records) {
      hydrateMonthlyRecords(result.records);
    }
    if (result?.ok === false) {
      throw new Error(result.error || "บันทึกไม่สำเร็จ");
    }
    updateBackendStatus(result?.optimistic ? "ส่งข้อมูลไป Apps Script แล้ว" : `บันทึกเข้า Sheet แล้ว ${result.saved || entries.length} รายการ`);
  } catch (error) {
    updateBackendStatus(`บันทึก Sheet ไม่สำเร็จ: ${error.message}`);
  }
}

function clearTrialBalancePreview() {
  state.trialBalanceUpload = { records: [], summary: [], sourceFile: "" };
  const status = document.querySelector("#trialUploadStatus");
  const table = document.querySelector("#trialPreviewTable");
  if (status) status.textContent = "ยังไม่ได้อ่านไฟล์";
  if (table) table.innerHTML = "";
}

async function parseTrialBalanceUpload() {
  const status = document.querySelector("#trialUploadStatus");
  const fileInput = document.querySelector("#trialBalanceFileInput");
  const period = document.querySelector("#trialUploadPeriod")?.value || getSelectedPeriod();
  const accountCodes = parseAccountCodeFilter(document.querySelector("#trialAccountCodesInput")?.value || "");
  const file = fileInput?.files?.[0];

  try {
    if (!window.XLSX) throw new Error("ยังโหลดตัวอ่าน Excel ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");
    if (!file) throw new Error("กรุณาเลือกไฟล์งบทดลอง Excel");
    status.textContent = "กำลังอ่านไฟล์...";

    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("ไม่พบชีตในไฟล์ Excel");
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    const parsed = parseTrialBalanceRows(rows, period, accountCodes, file.name);
    if (!parsed.records.length) {
      throw new Error("ไม่พบรายการตามงวดบัญชีและรหัสบัญชีที่เลือก");
    }

    state.trialBalanceUpload = {
      records: parsed.records,
      summary: parsed.summary,
      sourceFile: file.name,
    };
    renderTrialBalancePreview(parsed.summary);
    status.textContent = `อ่านสำเร็จ ${parsed.records.length} รายการ จาก ${parsed.periods.join(", ")}`;
  } catch (error) {
    clearTrialBalancePreview();
    status.textContent = `อ่านไฟล์ไม่สำเร็จ: ${error.message}`;
  }
}

function parseTrialBalanceRows(rows, targetPeriod, accountCodes, sourceFile) {
  const periods = new Set();
  const groups = detectTrialBalanceGroups(rows);
  const recordsByKey = new Map();
  const filteredMode = accountCodes.size > 0;

  groups.forEach((group) => {
    if (targetPeriod && group.period !== targetPeriod) return;
    periods.add(group.period);
    const hospitals = readTrialBalanceHospitals(rows, group.start);
    for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const accountCode = normalizeAccountCode(row[group.start]);
      if (!accountCode) continue;
      if (filteredMode && !accountCodes.has(accountCode)) continue;
      const accountName = normalizeText(row[group.start + 1]);

      hospitals.forEach((hospital, index) => {
        if (!hospital) return;
        const rawAmount = row[group.start + 2 + index];
        if (!filteredMode && isBlankCell(rawAmount)) return;
        const amount = parseAmount(rawAmount);
        const key = [group.period, hospital, accountCode].join("|");
        const current = recordsByKey.get(key);
        if (current) {
          current.amount += amount;
          if (!current.accountName && accountName) current.accountName = accountName;
          return;
        }
        recordsByKey.set(key, {
          period: group.period,
          hospital,
          accountCode,
          accountName,
          amount,
          sourceFile,
        });
      });
    }
  });

  const records = [...recordsByKey.values()];
  const summary = summarizeTrialBalanceRecords(records);
  return { records, summary, periods: [...periods] };
}

function detectTrialBalanceGroups(rows) {
  const headerRow = rows[0] || [];
  const groups = [];
  headerRow.forEach((cell, index) => {
    const text = normalizeText(cell);
    if (!text.includes("งบทดลอง") || !text.includes("สิ้น")) return;
    const period = extractTrialBalancePeriod(text);
    if (period) groups.push({ start: index, period });
  });
  return groups;
}

function extractTrialBalancePeriod(text) {
  const match = normalizeText(text).match(/สิ้น\s*([ก-๙]+)\s*(25\d{2}|26\d{2})/);
  return match ? `${match[1]} ${match[2]}` : "";
}

function readTrialBalanceHospitals(rows, start) {
  const shortHeader = rows[1] || [];
  const detailHeader = rows[2] || [];
  return Array.from({ length: 10 }, (_, index) => {
    return normalizeTrialHospital(shortHeader[start + 2 + index]) || normalizeTrialHospital(detailHeader[start + 2 + index]);
  });
}

function normalizeTrialHospital(value) {
  const text = normalizeText(value);
  if (!text) return "";
  return state.data.hospitals.find((hospital) => text.includes(shortHospital(hospital))) || "";
}

function parseAccountCodeFilter(text) {
  return new Set(
    String(text || "")
      .split(/[,\s]+/)
      .map(normalizeAccountCode)
      .filter(Boolean),
  );
}

function normalizeAccountCode(value) {
  const text = normalizeText(value).replace(/^['"]+|['"]+$/g, "");
  if (!text || text === "-") return "";
  return /^\d+(?:\.\d+)?$/.test(text) ? text : "";
}

function normalizeText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function isBlankCell(value) {
  const text = normalizeText(value);
  return text === "" || text === "-";
}

function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = normalizeText(value);
  if (!text || text === "-") return 0;
  const negative = text.startsWith("(") && text.endsWith(")");
  const number = Number(text.replace(/[(),\s"]/g, ""));
  if (!Number.isFinite(number)) return 0;
  return negative ? -number : number;
}

function summarizeTrialBalanceRecords(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = [record.period, record.accountCode, record.accountName].join("|");
    const item = groups.get(key) || {
      period: record.period,
      accountCode: record.accountCode,
      accountName: record.accountName,
      hospitalCount: 0,
      total: 0,
    };
    item.hospitalCount += 1;
    item.total += record.amount;
    groups.set(key, item);
  });
  return [...groups.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

function renderTrialBalancePreview(summary) {
  renderTable(
    "#trialPreviewTable",
    ["งวดบัญชี", "รหัสบัญชี", "ชื่อบัญชี", "จำนวน รพ.", "ยอดรวม"],
    summary,
    (row) => [
      row.period,
      row.accountCode,
      row.accountName || "-",
      row.hospitalCount,
      money(row.total),
    ],
    [3, 4],
  );
}

async function saveTrialBalanceUpload() {
  const status = document.querySelector("#trialUploadStatus");
  const records = state.trialBalanceUpload.records;
  if (!records.length) {
    status.textContent = "กรุณากดอ่านไฟล์และตรวจพรีวิวก่อนบันทึก";
    return;
  }
  if (!isAppsScriptRuntime() && !state.backendUrl && !canUseVercelProxy()) {
    status.textContent = "ยังไม่ได้เชื่อม Apps Script URL จึงบันทึกเข้า Sheet ไม่ได้";
    return;
  }

  status.textContent = "กำลังบันทึกเข้า Sheet...";
  try {
    const result = await backendSaveTrialBalanceEntries({
      period: document.querySelector("#trialUploadPeriod")?.value || getSelectedPeriod(),
      sourceFile: state.trialBalanceUpload.sourceFile,
      entries: records,
    });
    if (result?.ok === false) throw new Error(result.error || "บันทึกไม่สำเร็จ");
    status.textContent = result?.optimistic
      ? "ส่งข้อมูลไป Apps Script แล้ว กรุณารีเฟรช dashboard หลังระบบประมวลผล"
      : `บันทึกเข้า Sheet แล้ว ${result.saved || records.length} รายการ`;
    await refreshDashboardFromSheet();
  } catch (error) {
    status.textContent = `บันทึกไม่สำเร็จ: ${error.message}`;
  }
}

async function refreshDashboardFromSheet() {
  try {
    const bootstrap = await loadBootstrapData();
    if (!bootstrap?.dashboardData) return;
    state.data = bootstrap.dashboardData;
    state.dataSource = "sheet";
    renderAll();
  } catch {
    // Keep the saved status visible if refreshing the dashboard fails.
  }
}

function copyAprilToMonthly() {
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  const records = getMonthlyRecords(period, payer);
  const matrixRow = state.data.matrix[payer] || {};
  state.data.hospitals
    .filter((hospital) => hospital !== payer)
    .forEach((creditor) => {
      records[creditor] ||= {};
      records[creditor].amount = matrixRow[creditor] || "";
      records[creditor].status = records[creditor].status || "Draft";
    });
  records.__meta = {
    updatedAt: new Date().toISOString(),
  };
  saveMonthly();
}

function resetMonthlyPeriod() {
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  if (state.monthly[period]) {
    delete state.monthly[period][payer];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.monthly));
  renderMonthly();
}

function lastSavedText(period, payer) {
  const updatedAt = state.monthly[period]?.[payer]?.__meta?.updatedAt;
  if (!updatedAt) return "ยังไม่มีข้อมูล";
  return `บันทึกล่าสุด ${new Date(updatedAt).toLocaleString("th-TH")}`;
}

function renderMatrix() {
  const selected = getSelectedHospital();
  const hospitals = state.data.hospitals;
  const payerRows = isAllHospitals() ? hospitals : [selected];
  const matrix = state.data.matrix;
  const max = Math.max(...payerRows.flatMap((payer) => hospitals.map((creditor) => matrix[payer]?.[creditor] || 0)), 1);
  const total = payerRows.reduce((acc, payer) => acc + hospitals.reduce((sumRow, creditor) => sumRow + (matrix[payer]?.[creditor] || 0), 0), 0);
  document.querySelector("#matrixTotal").textContent = wholeMoney(total);

  const header = `<tr><th>ผู้จ่าย \\ เจ้าหนี้</th>${hospitals.map((hospital) => `<th class="num">${escapeHtml(shortHospital(hospital))}</th>`).join("")}</tr>`;
  const body = payerRows
    .map((payer) => {
      const cells = hospitals
        .map((creditor) => {
          const value = matrix[payer]?.[creditor] || 0;
          const alpha = value ? Math.max(0.12, Math.min(0.78, value / max)) : 0;
          const bg = value ? `background: rgba(24, 121, 111, ${alpha}); color: ${alpha > 0.5 ? "#ffffff" : "#172033"};` : "";
          return `<td class="matrix-cell ${value ? "" : "matrix-zero"}" style="${bg}">${value ? wholeMoney(value) : "-"}</td>`;
        })
        .join("");
      return `<tr><th>${escapeHtml(payer)}</th>${cells}</tr>`;
    })
    .join("");
  document.querySelector("#matrixTable").innerHTML = `<thead>${header}</thead><tbody>${body}</tbody>`;
}

function syncRawPeriod() {
  const period = document.querySelector("#rawPeriodSelect")?.value || getSelectedPeriod();
  const periodSelect = document.querySelector("#periodSelect");
  if (periodSelect && periodSelect.value !== period) {
    periodSelect.value = period;
    periodSelect.dispatchEvent(new Event("change"));
  }
  renderRawAp();
}

function renderRawAp() {
  syncRawFilterOptions();
  const period = document.querySelector("#rawPeriodSelect")?.value || getSelectedPeriod();
  const hospital = document.querySelector("#rawHospitalSelect")?.value || ALL_HOSPITALS_VALUE;
  const query = document.querySelector("#rawApSearch")?.value.trim().toLowerCase() || "";
  const rows = getRawApRows(period, hospital, query);
  const total = rows.reduce((sum, row) => sum + toNumber(row.amount_total), 0);
  const extraTotal = rows.reduce((sum, row) => sum + toNumber(row.raw_extra_amount), 0);
  const payerCount = new Set(rows.map((row) => row.payer_hospital)).size;
  const creditorCount = new Set(rows.map((row) => row.creditor_hospital)).size;
  const columns = getRawExcelColumns();
  const showPayerColumn = !hospital;
  const headers = ["ลำดับ", ...(showPayerColumn ? ["รพ.รายงาน"] : []), "ชื่อ รพ. เจ้าหนี้", ...columns.map((column) => column.label), "รวมเป็นเงิน", "หมายเหตุ"];
  const numericOffset = showPayerColumn ? 3 : 2;
  const numericIndexes = columns.map((_, index) => index + numericOffset).concat(numericOffset + columns.length);
  const selectedHospitalLabel = hospital || (payerCount === 1 ? rows[0]?.payer_hospital : ALL_HOSPITALS_LABEL);

  document.querySelector("#rawApReportHeading").innerHTML = `
    <strong>ทะเบียนคุมบัญชีเจ้าหนี้ค่ารักษา OP - UC นอก CUP (ในจังหวัดสังกัด สธ.) ปีงบประมาณ 2569</strong>
    <span>${escapeHtml(selectedHospitalLabel || ALL_HOSPITALS_LABEL)}</span>
    <span>ประจำเดือน ${escapeHtml(period || "-")}</span>
  `;

  document.querySelector("#rawApSummary").innerHTML = [
    summaryPill("งวดบัญชี", period || "-"),
    summaryPill("โรงพยาบาล", hospital || ALL_HOSPITALS_LABEL),
    summaryPill("จำนวนรายการ", `${rows.length} รายการ`),
    summaryPill("ยอดรวมเจ้าหนี้", money(total)),
    ...(extraTotal ? [summaryPill("ยอดประกอบหมายเหตุ", money(extraTotal)), summaryPill("รวมตามไฟล์", money(total + extraTotal))] : []),
    summaryPill("ผู้จ่าย", `${payerCount} รพ.`),
    summaryPill("เจ้าหนี้", `${creditorCount} รพ.`),
  ].join("");

  renderTable(
    "#rawApTable",
    headers,
    rows.length ? [...rows, rawTotalRow(rows)] : [],
    (row, index) => rawExcelRow(row, columns, index, showPayerColumn),
    numericIndexes,
  );
  renderRawApFootnotes(rows, total, extraTotal);
}

function renderRawApFootnotes(rows, total, extraTotal) {
  const target = document.querySelector("#rawApFootnotes");
  if (!target) return;
  const notes = rows
    .filter((row) => toNumber(row.raw_extra_amount) || row.raw_extra_note)
    .map((row) => ({
      label: row.raw_extra_note || row.notes || row.creditor_hospital,
      amount: toNumber(row.raw_extra_amount),
    }));

  if (!notes.length) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = `
    <div class="raw-note-title">หมายเหตุ ช่องรวมเป็นเงินต้องเท่ากับจำนวนเงินในรหัส 2101020199.202 เจ้าหนี้ค่ารักษา OP-UC นอก CUP ณ สิ้นเดือนนั้นๆ</div>
    <table>
      <tbody>
        ${notes
          .map(
            (note) => `
              <tr>
                <th>${escapeHtml(note.label)}</th>
                <td>${rawExcelMoney(note.amount)}</td>
              </tr>
            `,
          )
          .join("")}
        <tr>
          <th>รวมเป็นเงิน</th>
          <td>${rawExcelMoney(total)}</td>
        </tr>
        <tr>
          <th>รวม</th>
          <td>${rawExcelMoney(total + extraTotal)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function syncRawFilterOptions() {
  const periodSelect = document.querySelector("#rawPeriodSelect");
  const hospitalSelect = document.querySelector("#rawHospitalSelect");
  if (!periodSelect || !hospitalSelect) return;

  const selectedPeriod = periodSelect.value || getSelectedPeriod();
  const selectedHospital = hospitalSelect.value || ALL_HOSPITALS_VALUE;
  const periodValues = [getSelectedPeriod(), ...monthOptions].filter(Boolean);
  fillSelect("#rawPeriodSelect", [...new Set(periodValues)], selectedPeriod);
  fillSelect("#rawHospitalSelect", [ALL_HOSPITALS_VALUE, ...state.data.hospitals], selectedHospital);
}

function getRawApRows(period, hospital, query) {
  const normalizedPeriod = normalizeRawPeriod(period);
  return (state.data.ledger_rows || [])
    .filter((row) => normalizeRawPeriod(row.period) === normalizedPeriod)
    .filter((row) => !hospital || row.payer_hospital === hospital)
    .filter((row) => {
      if (!query) return true;
      return [
        row.payer_hospital,
        row.creditor_hospital,
        row.source_doc_ref,
        row.source_file,
        row.review_status,
        row.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const hospitalOrder = new Map((state.data?.hospitals || []).map((name, index) => [name, index]));
      const payerSort = (hospitalOrder.get(a.payer_hospital) ?? 999) - (hospitalOrder.get(b.payer_hospital) ?? 999);
      if (payerSort) return payerSort;
      return (hospitalOrder.get(a.creditor_hospital) ?? 999) - (hospitalOrder.get(b.creditor_hospital) ?? 999);
    });
}

function getRawExcelColumns() {
  return [
    { label: "เจ้าหนี้ปีงบ 2565", keys: ["เจ้าหนี้ปีงบ 2565", "เจ้าหนี้ปีงบ2565"] },
    { label: "เจ้าหนี้ปีงบ 2566", keys: ["เจ้าหนี้ปีงบ 2566", "เจ้าหนี้ปีงบ2566"] },
    { label: "เจ้าหนี้งบ 2567", keys: ["เจ้าหนี้งบ 2567", "เจ้าหนี้ปีงบ 2567", "เจ้าหนี้งบ2567"] },
    { label: "เจ้าหนี้งบ 2568", keys: ["เจ้าหนี้งบ 2568", "เจ้าหนี้ปีงบ 2568", "เจ้าหนี้งบ2568"] },
    { label: "ไตรมาส 2/2568 OP Anywhere", keys: ["ไตรมาส 2/2568 OP Anywhere", "ไตรมาส2/2568OPAnywhere"] },
    { label: "ต.ค.2568", keys: ["ต.ค.2568", "ต.ค.68"] },
    { label: "พ.ย.2568", keys: ["พ.ย.2568", "พ.ย.68"] },
    { label: "ธ.ค.2568", keys: ["ธ.ค.2568", "ธ.ค.68"] },
    { label: "ม.ค.2569", keys: ["ม.ค.2569", "ม.ค.69"] },
    { label: "ก.พ.2569", keys: ["ก.พ.2569", "ก.พ.69"] },
    { label: "มี.ค.2569", keys: ["มี.ค.2569", "มี.ค.69"] },
    { label: "เม.ย.2569", keys: ["เม.ย.2569", "เม.ย.69"] },
    { label: "พ.ค. 2569", keys: ["พ.ค.2569", "พ.ค. 2569", "พ.ค.69"] },
    { label: "มิ.ย. 2569", keys: ["มิ.ย.2569", "มิ.ย. 2569", "มิ.ย.69"] },
    { label: "ไตรมาส 3/2568 OP Anywhere", keys: ["ไตรมาส 3/2568 OP Anywhere", "ไตรมาส3/2568OPAnywhere"] },
    { label: "ก.ค. 2569", keys: ["ก.ค.2569", "ก.ค. 2569", "ก.ค.69"] },
    { label: "ส.ค. 2569", keys: ["ส.ค.2569", "ส.ค. 2569", "ส.ค.69"] },
    { label: "ก.ย. 2569", keys: ["ก.ย.2569", "ก.ย. 2569", "ก.ย.69"] },
  ];
}

function rawExcelRow(row, columns, index, showPayerColumn = false) {
  const isTotal = row.__total;
  return [
    isTotal ? "" : index + 1,
    ...(showPayerColumn ? [isTotal ? "รวมทั้งจังหวัด" : row.payer_hospital] : []),
    isTotal ? "รวมเจ้าหนี้คงเหลือ" : row.creditor_hospital,
    ...columns.map((column) => rawExcelMoney(rawColumnAmount(row, column))),
    rawExcelMoney(row.amount_total),
    isTotal ? "" : row.notes || "",
  ];
}

function rawTotalRow(rows) {
  const total = rows.reduce((sum, row) => sum + toNumber(row.amount_total), 0);
  const columnTotals = {};
  getRawExcelColumns().forEach((column) => {
    columnTotals[column.label] = rows.reduce((sum, row) => sum + toNumber(rawColumnAmount(row, column)), 0);
  });
  return { __total: true, creditor_hospital: "รวมเจ้าหนี้คงเหลือ", amount_total: total, __columnTotals: columnTotals };
}

function rawColumnAmount(row, column) {
  if (row.__total) return row.__columnTotals?.[column.label] || 0;
  const direct = column.keys.reduce((found, key) => (found !== undefined ? found : row[key]), undefined);
  if (direct !== undefined && direct !== "") return direct;
  if (hasRawExcelDetails(row)) return 0;
  return rawPeriodColumnLabel(normalizeRawPeriod(row.period)) === column.label ? row.amount_total : 0;
}

function hasRawExcelDetails(row) {
  return getRawExcelColumns().some((column) =>
    column.keys.some((key) => row[key] !== undefined && row[key] !== "" && Math.abs(toNumber(row[key])) >= 0.005)
  );
}

function rawPeriodColumnLabel(period) {
  const match = String(period || "").match(/^(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(25\d{2}|26\d{2})$/);
  if (!match) return "";
  const abbreviations = {
    "มกราคม": "ม.ค.",
    "กุมภาพันธ์": "ก.พ.",
    "มีนาคม": "มี.ค.",
    "เมษายน": "เม.ย.",
    "พฤษภาคม": "พ.ค.",
    "มิถุนายน": "มิ.ย.",
    "กรกฎาคม": "ก.ค.",
    "สิงหาคม": "ส.ค.",
    "กันยายน": "ก.ย.",
    "ตุลาคม": "ต.ค.",
    "พฤศจิกายน": "พ.ย.",
    "ธันวาคม": "ธ.ค.",
  };
  const spacer = Number(match[2]) >= 2569 && !["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย."].includes(abbreviations[match[1]]) ? " " : "";
  return `${abbreviations[match[1]]}${spacer}${match[2]}`;
}

function rawExcelMoney(value) {
  const number = toNumber(value);
  if (Math.abs(number) < 0.005) return "-";
  return THB.format(number);
}

function renderLedger() {
  const selected = getSelectedHospital();
  const query = document.querySelector("#ledgerSearch").value.trim().toLowerCase();
  const rows = state.data.ledger_rows.filter((row) => {
    const hospitalMatch = isAllHospitals() || row.payer_hospital === selected;
    const queryMatch = !query || row.payer_hospital.toLowerCase().includes(query) || row.creditor_hospital.toLowerCase().includes(query);
    return hospitalMatch && queryMatch;
  });

  renderTable(
    "#ledgerTable",
    ["ผู้จ่าย", "เจ้าหนี้", "รวมเป็นเงิน", "ต.ค.68", "พ.ย.68", "ธ.ค.68", "ม.ค.69", "ก.พ.69", "มี.ค.69", "เม.ย.69", "ไฟล์ต้นทาง"],
    rows,
    (row) => [
      row.payer_hospital,
      row.creditor_hospital,
      money(row.amount_total),
      money(row["ต.ค.2568"] || 0),
      money(row["พ.ย.2568"] || 0),
      money(row["ธ.ค.2568"] || 0),
      money(row["ม.ค.2569"] || 0),
      money(row["ก.พ.2569"] || 0),
      money(row["มี.ค.2569"] || 0),
      money(row["เม.ย.2569"] || 0),
      row.source_file,
    ],
    [2, 3, 4, 5, 6, 7, 8, 9],
  );
}

function exportRawApCsv() {
  const period = document.querySelector("#rawPeriodSelect")?.value || getSelectedPeriod();
  const hospital = document.querySelector("#rawHospitalSelect")?.value || ALL_HOSPITALS_VALUE;
  const query = document.querySelector("#rawApSearch")?.value.trim().toLowerCase() || "";
  const rows = getRawApRows(period, hospital, query);
  const columns = getRawExcelColumns();
  const showPayerColumn = !hospital;
  const csvRows = [["ลำดับ", ...(showPayerColumn ? ["รพ.รายงาน"] : []), "ชื่อ รพ. เจ้าหนี้", ...columns.map((column) => column.label), "รวมเป็นเงิน", "หมายเหตุ"]];
  (rows.length ? [...rows, rawTotalRow(rows)] : []).forEach((row, index) => {
    csvRows.push(rawExcelRow(row, columns, index, showPayerColumn).map((cell) => String(cell).replace(/,/g, "")));
  });
  downloadText(`raw-ap-${slug(period)}-${slug(hospital || ALL_HOSPITALS_LABEL)}.csv`, toCsv(csvRows), "text/csv;charset=utf-8");
}

function renderBarChart(selector, rows, options) {
  const data = [...rows].slice(0, options.maxRows || rows.length);
  const max = Math.max(...data.map((row) => Math.abs(row[options.valueKey])), 1);
  const rowHeight = 42;
  const width = 900;
  const labelWidth = 160;
  const barWidth = 560;
  const height = 34 + data.length * rowHeight;
  const bars = data
    .map((row, index) => {
      const value = row[options.valueKey];
      const bar = Math.max(3, (Math.abs(value) / max) * barWidth);
      const barColor = value < 0 && options.negativeColor ? options.negativeColor : options.color;
      const y = 24 + index * rowHeight;
      return `
        <text x="0" y="${y + 17}" class="bar-label">${escapeHtml(row[options.labelKey])}</text>
        <rect x="${labelWidth}" y="${y}" width="${bar}" height="24" rx="5" fill="${barColor}"></rect>
        <text x="${labelWidth + bar + 10}" y="${y + 17}" class="bar-value" fill="${barColor}">${escapeHtml(money(value))}</text>
      `;
    })
    .join("");

  document.querySelector(selector).innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="กราฟแท่ง">
      <line x1="${labelWidth}" x2="${labelWidth}" y1="12" y2="${height - 12}" class="axis-line"></line>
      ${bars}
    </svg>
  `;
}

function renderTable(selector, headers, rows, mapRow, numericIndexes = [], rawIndexes = []) {
  const headerHtml = headers
    .map((header, index) => `<th class="${numericIndexes.includes(index) ? "num" : ""}">${escapeHtml(header)}</th>`)
    .join("");
  const bodyHtml = rows.length
    ? rows
        .map((row, rowIndex) => {
          return `<tr>${mapRow(row, rowIndex)
            .map((cell, index) => {
              const value = rawIndexes.includes(index) ? cell : escapeHtml(cell);
              return `<td class="${numericIndexes.includes(index) ? "num" : ""}">${value}</td>`;
            })
            .join("")}</tr>`;
        })
        .join("")
    : `<tr><td colspan="${headers.length}" class="empty-state">ไม่พบข้อมูล</td></tr>`;
  document.querySelector(selector).innerHTML = `<thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody>`;
}

function getSelectedHospital() {
  return state.selectedHospital;
}

function getSelectedHospitalLabel() {
  return isAllHospitals() ? ALL_HOSPITALS_LABEL : getSelectedHospital();
}

function isAllHospitals() {
  return !state.selectedHospital;
}

function getSelectedReconciliation(hospital = getSelectedHospital()) {
  if (isAllHospitals()) return null;
  return state.data.reconciliation.find((row) => row.hospital === hospital);
}

function getHospitalComparisonRows(hospital = getSelectedHospital()) {
  const matrix = state.data.matrix || {};
  if (isAllHospitals()) {
    return state.data.hospitals.map((targetHospital) => {
      const selectedPayable = state.data.hospitals.reduce((acc, creditor) => {
        return creditor === targetHospital ? acc : acc + (matrix[targetHospital]?.[creditor] || 0);
      }, 0);
      const counterpartyPayable = state.data.hospitals.reduce((acc, payer) => {
        return payer === targetHospital ? acc : acc + (matrix[payer]?.[targetHospital] || 0);
      }, 0);
      return {
        counterparty_hospital: targetHospital,
        selected_payable_to_counterparty: selectedPayable,
        counterparty_payable_to_selected: counterpartyPayable,
        net_for_selected: counterpartyPayable - selectedPayable,
      };
    });
  }
  return state.data.hospitals
    .filter((counterparty) => counterparty !== hospital)
    .map((counterparty) => {
      const selectedPayable = matrix[hospital]?.[counterparty] || 0;
      const counterpartyPayable = matrix[counterparty]?.[hospital] || 0;
      return {
        counterparty_hospital: counterparty,
        selected_payable_to_counterparty: selectedPayable,
        counterparty_payable_to_selected: counterpartyPayable,
        net_for_selected: counterpartyPayable - selectedPayable,
      };
    });
}

function exportTrangCsv() {
  const selected = getSelectedHospital();
  const selectedLabel = getSelectedHospitalLabel();
  const rows = sortTrangRows();
  const csvRows = [[isAllHospitals() ? "โรงพยาบาล" : "คู่บัญชี", isAllHospitals() ? "เจ้าหนี้รวม" : `${selectedLabel} ต้องจ่าย`, isAllHospitals() ? "ลูกหนี้จากคู่บัญชี" : `คู่บัญชีต้องจ่าย ${selectedLabel}`, isAllHospitals() ? "สุทธิ" : `สุทธิฝั่ง ${selectedLabel}`]];
  rows.forEach((row) => {
    csvRows.push([
      row.counterparty_hospital,
      row.selected_payable_to_counterparty,
      row.counterparty_payable_to_selected,
      row.net_for_selected,
    ]);
  });
  downloadText(`${slug(selectedLabel)}-counterparty-comparison.csv`, toCsv(csvRows), "text/csv;charset=utf-8");
}

function exportMonthlyCsv() {
  updateMonthlyFromTable();
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  const records = getMonthlyRecords(period, payer);
  const rows = [["Period", "Payer Hospital", "Creditor Hospital", "Creditor Amount", "Source / Doc Ref", "Prepared By", "Review Status", "Notes"]];
  Object.entries(records)
    .filter(([creditor]) => creditor !== "__meta")
    .forEach(([creditor, record]) => {
      rows.push([period, payer, creditor, record.amount || "", record.docRef || "", record.preparedBy || "", record.status || "Draft", record.notes || ""]);
    });
  downloadText(`monthly-${slug(period)}-${slug(payer)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

function exportMonthlyJson() {
  updateMonthlyFromTable();
  downloadText("monthly-ap-input.json", JSON.stringify(state.monthly, null, 2), "application/json;charset=utf-8");
}

function isAppsScriptRuntime() {
  return typeof google !== "undefined" && Boolean(google.script?.run);
}

function isFileRuntime() {
  return window.location.protocol === "file:";
}

function backendListMonthlyEntries(period, payerHospital) {
  if (isAppsScriptRuntime()) {
    return googleRun("listMonthlyEntries", { period, payerHospital });
  }
  if (!state.backendUrl) {
    return Promise.resolve({ ok: true, records: [] });
  }
  return jsonp(state.backendUrl, {
    action: "listMonthlyEntries",
    period,
    payerHospital,
  });
}

function backendBootstrap() {
  if (isAppsScriptRuntime()) {
    return googleRun("getBootstrapData");
  }
  return jsonp(state.backendUrl, {
    action: "bootstrap",
  });
}

async function backendSaveMonthlyEntries(payload) {
  if (isAppsScriptRuntime()) {
    return googleRun("saveMonthlyEntries", payload);
  }
  if (!state.backendUrl) {
    return { ok: true, saved: 0, localOnly: true };
  }

  try {
    const response = await fetch(state.backendUrl, {
      method: "POST",
      body: JSON.stringify({
        action: "saveMonthlyEntries",
        payload,
      }),
    });
    return response.json();
  } catch {
    await fetch(state.backendUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        action: "saveMonthlyEntries",
        payload,
      }),
    });
    return { ok: true, optimistic: true };
  }
}

async function backendSaveTrialBalanceEntries(payload) {
  if (isAppsScriptRuntime()) {
    return googleRun("saveTrialBalanceEntries", payload);
  }

  if (canUseVercelProxy()) {
    try {
      const response = await fetch("/api/apps-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveTrialBalanceEntries",
          payload,
        }),
      });
      if (response.ok) return response.json();
    } catch {
      // Local static previews do not have Vercel serverless functions.
    }
  }

  if (!state.backendUrl) {
    return { ok: true, saved: 0, localOnly: true };
  }

  try {
    const response = await fetch(state.backendUrl, {
      method: "POST",
      body: JSON.stringify({
        action: "saveTrialBalanceEntries",
        payload,
      }),
    });
    return response.json();
  } catch {
    await fetch(state.backendUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        action: "saveTrialBalanceEntries",
        payload,
      }),
    });
    return { ok: true, optimistic: true };
  }
}

function canUseVercelProxy() {
  return !isFileRuntime() && !isAppsScriptRuntime();
}

function googleRun(functionName, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((error) => reject(new Error(error?.message || String(error))))
      [functionName](...args);
  });
}

function jsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
    });
    const separator = url.includes("?") ? "&" : "?";

    window[callbackName] = (result) => {
      cleanup();
      resolve(result);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("เรียก Apps Script ไม่สำเร็จ"));
    };
    script.src = `${url}${separator}${query.toString()}`;
    document.body.append(script);

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }
  });
}

function hydrateMonthlyRecords(records) {
  records.forEach((record) => {
    const period = record.period;
    const payer = record.payer_hospital;
    const creditor = record.creditor_hospital;
    if (!period || !payer || !creditor) return;
    state.monthly[period] ||= {};
    state.monthly[period][payer] ||= {};
    state.monthly[period][payer][creditor] = {
      amount: record.ap_amount ?? "",
      docRef: record.source_doc_ref || "",
      preparedBy: record.prepared_by || "",
      status: record.review_status || "Draft",
      notes: record.notes || "",
    };
    const meta = state.monthly[period][payer].__meta || {};
    const updatedAt = record.updated_at || record.created_at;
    if (updatedAt && (!meta.updatedAt || new Date(updatedAt) > new Date(meta.updatedAt))) {
      meta.updatedAt = updatedAt;
    }
    state.monthly[period][payer].__meta = meta;
  });
}

function downloadText(filename, text, type) {
  const blob = new Blob(["\ufeff", text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

function loadMonthly() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + toNumber(row[key]), 0);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  const number = toNumber(value);
  if (Math.abs(number) < 0.005) return "-";
  return number < 0 ? `(${THB.format(Math.abs(number))})` : THB.format(number);
}

function wholeMoney(value) {
  const number = Math.round(toNumber(value));
  if (!number) return "-";
  return number < 0 ? `(${THB0.format(Math.abs(number))})` : THB0.format(number);
}

function normalizeRawPeriod(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (monthOptions.includes(text)) return text;

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    const rawYear = date.getFullYear();
    const buddhistYear = rawYear >= 2400 ? rawYear : rawYear + 543;
    return `${[
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ][date.getMonth()]} ${buddhistYear}`;
  }

  const thaiDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](25\d{2}|26\d{2})$/);
  if (thaiDate) {
    return `${[
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ][Number(thaiDate[2]) - 1]} ${thaiDate[3]}`;
  }

  return text;
}

function shortHospital(name) {
  return name.replace("รพ.", "");
}

function slug(text) {
  return text.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
