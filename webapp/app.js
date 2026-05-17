const DATA_URL = "./dashboard_data.json";
const STORAGE_KEY = "trang-ap-ar-dashboard-monthly-v1";
const BACKEND_URL_KEY = "trang-ap-ar-dashboard-backend-url";

const state = {
  data: null,
  view: "dashboard",
  selectedHospital: "รพ.ตรัง",
  trangSort: "net",
  monthly: loadMonthly(),
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
    state.data = window.DASHBOARD_DATA || (await fetchDashboardData());
    if (window.APPS_SCRIPT_BOOTSTRAP?.monthlyEntries?.records) {
      hydrateMonthlyRecords(window.APPS_SCRIPT_BOOTSTRAP.monthlyEntries.records);
      state.userEmail = window.APPS_SCRIPT_BOOTSTRAP.userEmail || "";
    }
    state.selectedHospital = state.data.hospitals[0];
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
  fillSelect("#hospitalSelect", state.data.hospitals, state.selectedHospital);
  fillSelect("#entryPeriod", monthOptions, "พฤษภาคม 2569");
  fillSelect("#entryPayer", state.data.hospitals, state.selectedHospital);

  document.querySelector("#sourceLine").textContent =
    `แหล่งข้อมูล: ทะเบียนเจ้าหนี้ตามจ่าย + งบทดลอง สิ้น ${state.data.period}`;
  setupBackendControls();

  document.querySelector("#periodSelect").addEventListener("change", renderAll);
  document.querySelector("#hospitalSelect").addEventListener("change", (event) => {
    state.selectedHospital = event.target.value;
    document.querySelector("#entryPayer").value = state.selectedHospital;
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
  document.querySelector("#copyAprilButton").addEventListener("click", copyAprilToMonthly);
  document.querySelector("#resetMonthlyButton").addEventListener("click", resetMonthlyPeriod);
  document.querySelector("#exportMonthlyCsv").addEventListener("click", exportMonthlyCsv);
  document.querySelector("#exportMonthlyJson").addEventListener("click", exportMonthlyJson);
  document.querySelector("#exportTrangCsv").addEventListener("click", exportTrangCsv);
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

function fillSelect(selector, values, selected) {
  const select = document.querySelector(selector);
  select.innerHTML = values
    .map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`)
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
  renderDashboard();
  if (state.view === "trang") renderTrangView();
  if (state.view === "reconcile") renderReconcile();
  if (state.view === "monthly") renderMonthly();
  if (state.view === "matrix") renderMatrix();
  if (state.view === "ledger") renderLedger();
}

function renderDashboard() {
  const selected = getSelectedHospital();
  const rows = getHospitalComparisonRows(selected);
  const hospitalPayable = sum(rows, "selected_payable_to_counterparty");
  const counterpartyPayable = sum(rows, "counterparty_payable_to_selected");
  const net = sum(rows, "net_for_selected");
  const reconcile = getSelectedReconciliation(selected);
  const apNeedsReview = reconcile && Math.abs(reconcile.ap_difference) > 0.01;
  const arDiff = reconcile ? Math.abs(reconcile.ar_difference) : 0;
  const apDiff = reconcile ? Math.abs(reconcile.ap_difference) : 0;

  document.querySelector("#kpiGrid").innerHTML = [
    statCard(`${selected} ต้องจ่ายคู่บัญชี`, money(hospitalPayable), `จากทะเบียนเจ้าหนี้ ${selected}`, "info"),
    statCard(`คู่บัญชีต้องจ่าย ${selected}`, money(counterpartyPayable), "จากทะเบียนเจ้าหนี้ของคู่บัญชี", "good"),
    statCard(`สุทธิฝั่ง ${selected}`, money(net), net >= 0 ? `${selected} สุทธิรับ` : `${selected} สุทธิจ่าย`, net >= 0 ? "good" : "danger"),
    statCard(`สถานะงบทดลอง ${selected}`, apNeedsReview ? "ตรวจสอบ" : "OK", `AP ต่าง ${money(apDiff)} · AR ต่าง ${money(arDiff)}`, apNeedsReview ? "warn" : "good"),
  ].join("");

  const chartTitle = document.querySelector("#dashboardView .chart-panel h2");
  if (chartTitle) chartTitle.textContent = `ยอดสุทธิฝั่ง ${selected}`;

  const netRows = [...rows].sort((a, b) => b.net_for_selected - a.net_for_selected);
  renderBarChart("#netChart", netRows, {
    labelKey: "counterparty_hospital",
    valueKey: "net_for_selected",
    color: "#18796f",
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
    .filter((row) => row.hospital === selected)
    .map((row) => ({
      ...row,
      severity: Math.abs(row.ap_difference) > 0.01 ? "AP" : Math.abs(row.ar_difference) > 0.01 ? "AR" : "",
    }))
    .filter((row) => row.severity)
    .sort((a, b) => Math.abs(b.ap_difference || b.ar_difference) - Math.abs(a.ap_difference || a.ar_difference))
    .slice(0, 6);

  document.querySelector("#alertCount").textContent = `${rows.length} รายการ`;
  document.querySelector("#alertList").innerHTML = rows.length
    ? rows
        .map((row) => {
          const apText = `AP ต่าง ${money(row.ap_difference)}`;
          const arText = `AR ต่าง ${money(row.ar_difference)}`;
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
  const rows = sortTrangRows();
  renderTable("#trangSummaryTable", ["คู่บัญชี", `${selected} ต้องจ่าย`, `คู่บัญชีต้องจ่าย ${selected}`, `สุทธิฝั่ง ${selected}`, "ทิศทางสุทธิ"], rows, (row) => [
    row.counterparty_hospital,
    money(row.selected_payable_to_counterparty),
    money(row.counterparty_payable_to_selected),
    money(row.net_for_selected),
    row.net_for_selected >= 0 ? `${selected} สุทธิรับ` : `${selected} สุทธิจ่าย`,
  ], [1, 2, 3]);
}

function renderTrangView() {
  const selected = getSelectedHospital();
  const title = document.querySelector("#trangView h2");
  if (title) title.textContent = `เปรียบเทียบ ${selected} กับโรงพยาบาลอื่น`;
  const payButton = document.querySelector('[data-sort="trang"]');
  const receiveButton = document.querySelector('[data-sort="community"]');
  if (payButton) payButton.textContent = `${shortHospital(selected)}ต้องจ่าย`;
  if (receiveButton) receiveButton.textContent = "คู่บัญชีต้องจ่าย";

  const rows = sortTrangRows();
  renderBarChart("#trangBars", rows, {
    labelKey: "counterparty_hospital",
    valueKey: state.trangSort === "trang" ? "selected_payable_to_counterparty" : state.trangSort === "community" ? "counterparty_payable_to_selected" : "net_for_selected",
    color: state.trangSort === "trang" ? "#c7483c" : state.trangSort === "community" ? "#315fa8" : "#18796f",
    maxRows: rows.length,
  });
  renderTable("#trangCompareTable", ["คู่บัญชี", `${selected} ต้องจ่าย`, `คู่บัญชีต้องจ่าย ${selected}`, `สุทธิฝั่ง ${selected}`], rows, (row) => [
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
    return row.hospital === selected && statusMatch && queryMatch;
  });

  renderTable(
    "#reconcileTable",
    ["โรงพยาบาล", "ทะเบียนเจ้าหนี้", "งบทดลอง AP", "ผลต่าง AP", "สถานะ AP", "AR จากคู่บัญชี", "งบทดลอง AR", "ผลต่าง AR"],
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
        <th class="num">ยอด AP</th>
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
  const payerRows = [selected];
  const matrix = state.data.matrix;
  const max = Math.max(...payerRows.flatMap((payer) => hospitals.map((creditor) => matrix[payer]?.[creditor] || 0)), 1);
  const total = payerRows.reduce((acc, payer) => acc + hospitals.reduce((sumRow, creditor) => sumRow + (matrix[payer]?.[creditor] || 0), 0), 0);
  document.querySelector("#matrixTotal").textContent = money(total);

  const header = `<tr><th>ผู้จ่าย \\ เจ้าหนี้</th>${hospitals.map((hospital) => `<th class="num">${escapeHtml(shortHospital(hospital))}</th>`).join("")}</tr>`;
  const body = payerRows
    .map((payer) => {
      const cells = hospitals
        .map((creditor) => {
          const value = matrix[payer]?.[creditor] || 0;
          const alpha = value ? Math.max(0.12, Math.min(0.78, value / max)) : 0;
          const bg = value ? `background: rgba(24, 121, 111, ${alpha}); color: ${alpha > 0.5 ? "#ffffff" : "#172033"};` : "";
          return `<td class="matrix-cell ${value ? "" : "matrix-zero"}" style="${bg}">${value ? compact.format(value) : "-"}</td>`;
        })
        .join("");
      return `<tr><th>${escapeHtml(payer)}</th>${cells}</tr>`;
    })
    .join("");
  document.querySelector("#matrixTable").innerHTML = `<thead>${header}</thead><tbody>${body}</tbody>`;
}

function renderLedger() {
  const selected = getSelectedHospital();
  const query = document.querySelector("#ledgerSearch").value.trim().toLowerCase();
  const rows = state.data.ledger_rows.filter((row) => {
    const hospitalMatch = row.payer_hospital === selected;
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
      const y = 24 + index * rowHeight;
      return `
        <text x="0" y="${y + 17}" class="bar-label">${escapeHtml(row[options.labelKey])}</text>
        <rect x="${labelWidth}" y="${y}" width="${bar}" height="24" rx="5" fill="${options.color}"></rect>
        <text x="${labelWidth + bar + 10}" y="${y + 17}" class="bar-value">${escapeHtml(money(value))}</text>
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
        .map((row) => {
          return `<tr>${mapRow(row)
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
  return state.selectedHospital || state.data.hospitals[0];
}

function getSelectedReconciliation(hospital = getSelectedHospital()) {
  return state.data.reconciliation.find((row) => row.hospital === hospital);
}

function getHospitalComparisonRows(hospital = getSelectedHospital()) {
  const matrix = state.data.matrix || {};
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
  const rows = sortTrangRows();
  const csvRows = [["คู่บัญชี", `${selected} ต้องจ่าย`, `คู่บัญชีต้องจ่าย ${selected}`, `สุทธิฝั่ง ${selected}`]];
  rows.forEach((row) => {
    csvRows.push([
      row.counterparty_hospital,
      row.selected_payable_to_counterparty,
      row.counterparty_payable_to_selected,
      row.net_for_selected,
    ]);
  });
  downloadText(`${slug(selected)}-counterparty-comparison.csv`, toCsv(csvRows), "text/csv;charset=utf-8");
}

function exportMonthlyCsv() {
  updateMonthlyFromTable();
  const period = document.querySelector("#entryPeriod").value;
  const payer = document.querySelector("#entryPayer").value;
  const records = getMonthlyRecords(period, payer);
  const rows = [["Period", "Payer Hospital", "Creditor Hospital", "AP Amount", "Source / Doc Ref", "Prepared By", "Review Status", "Notes"]];
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
