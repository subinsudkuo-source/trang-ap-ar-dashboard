(function () {
  if (typeof backendSaveMonthlyEntries !== "function" || typeof backendListMonthlyEntries !== "function") {
    return;
  }

  const DEFAULT_MONTHLY_PERIOD = "มิถุนายน 2569";
  const originalBackendSaveMonthlyEntries = backendSaveMonthlyEntries;

  document.addEventListener("DOMContentLoaded", () => {
    waitForMonthlyControls(() => {
      document.querySelector("#periodSelect")?.addEventListener("change", (event) => {
        refreshDashboardForMonthlyPeriod({ period: event.target.value });
      });
      refreshDashboardForMonthlyPeriod({ period: document.querySelector("#entryPeriod")?.value || state.data?.period || DEFAULT_MONTHLY_PERIOD });
    });
  });

  backendSaveMonthlyEntries = async function patchedBackendSaveMonthlyEntries(payload) {
    const result = await originalBackendSaveMonthlyEntries(payload);
    if (result?.ok !== false && !result?.localOnly) {
      await refreshDashboardForMonthlyPeriod(payload || {});
    }
    return result;
  };

  function waitForMonthlyControls(callback, attempts = 30) {
    if (document.querySelector("#entryPeriod") && document.querySelector("#periodSelect") && state.data) {
      callback();
      return;
    }
    if (attempts > 0) {
      setTimeout(() => waitForMonthlyControls(callback, attempts - 1), 250);
    }
  }

  async function refreshDashboardForMonthlyPeriod(payload) {
    const period = payload.period || document.querySelector("#entryPeriod")?.value || state.data?.period || DEFAULT_MONTHLY_PERIOD;
    if (!period) return;

    try {
      let result = await backendListMonthlyEntries(period, "");
      if (!result?.ok) return;
      let records = result.records || [];
      if (!records.length) {
        result = await backendListMonthlyEntries("", "");
        if (!result?.ok) return;
        records = (result.records || []).filter((record) => normalizePeriod(record.period) === period);
      }
      if (!records.length) return;
      applyMonthlyDashboard(period, records);
    } catch {
      // Keep the normal save status visible if the dashboard refresh fails.
    }
  }

  function applyMonthlyDashboard(period, records) {
    const hospitals = collectHospitals(records);
    const matrix = buildMatrix(hospitals, records);
    const ledgerRows = records.map((record) => ({
      period,
      payer_hospital: record.payer_hospital,
      creditor_hospital: record.creditor_hospital,
      source_file: "MonthlyEntries",
      source_doc_ref: record.source_doc_ref || "",
      prepared_by: record.prepared_by || "",
      review_status: record.review_status || "",
      notes: record.notes || "",
      amount_total: amount(record.ap_amount),
      "รวมเป็นเงิน": amount(record.ap_amount),
    }));
    const trialRows = state.data?.trial_balance_rows || [];
    const trialTotals = getTrialTotals(trialRows, period);

    state.data = {
      ...(state.data || {}),
      period,
      hospitals,
      source: "MonthlyEntries",
      monthly_record_count: records.length,
      ledger_rows: ledgerRows,
      matrix,
      trial_balance_rows: trialRows,
      trial_balance_target_rows: trialRows.filter((row) => normalizePeriod(row.period) === period),
      reconciliation: buildReconciliation(hospitals, matrix, trialTotals),
      trang_comparison: buildTrangComparison(matrix, hospitals),
    };
    state.dataSource = "sheet";

    syncControls(period, payloadPayer(records));
    renderAll();
  }

  function collectHospitals(records) {
    const hospitals = new Set(state.data?.hospitals || []);
    records.forEach((record) => {
      if (record.payer_hospital) hospitals.add(record.payer_hospital);
      if (record.creditor_hospital) hospitals.add(record.creditor_hospital);
    });
    return [...hospitals];
  }

  function buildMatrix(hospitals, records) {
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
      matrix[payer][creditor] += amount(record.ap_amount);
    });
    return matrix;
  }

  function getTrialTotals(trialRows, period) {
    const totals = {};
    trialRows
      .filter((row) => normalizePeriod(row.period) === period)
      .forEach((row) => {
        if (!totals[row.hospital]) totals[row.hospital] = {};
        if (row.account_key === "AP_OP_UC_OUT_CUP_IN_PROVINCE" || row.account_code === "2101020199.202") {
          totals[row.hospital].ap = (totals[row.hospital].ap || 0) + amount(row.amount);
        }
        if (row.account_key === "AR_OP_UC_OUT_CUP_IN_PROVINCE" || row.account_code === "1102050101.203") {
          totals[row.hospital].ar = (totals[row.hospital].ar || 0) + amount(row.amount);
        }
      });
    return totals;
  }

  function buildReconciliation(hospitals, matrix, trialTotals) {
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

  function buildTrangComparison(matrix, hospitals) {
    return hospitals
      .filter((hospital) => hospital !== "รพ.ตรัง")
      .map((hospital) => {
        const trangPayable = matrix["รพ.ตรัง"]?.[hospital] || 0;
        const communityPayable = matrix[hospital]?.["รพ.ตรัง"] || 0;
        return {
          community_hospital: hospital,
          trang_payable_to_community: trangPayable,
          community_payable_to_trang: communityPayable,
          net_for_trang: communityPayable - trangPayable,
        };
      });
  }

  function syncControls(period, payer) {
    const hospitals = state.data.hospitals || [];
    if (document.querySelector("#periodSelect")) {
      fillSelect("#periodSelect", [period, ...monthOptions.filter((month) => month !== period)], period);
    }
    if (document.querySelector("#entryPeriod")) {
      fillSelect("#entryPeriod", monthOptions, period);
    }
    if (state.selectedHospital && !hospitals.includes(state.selectedHospital)) {
      state.selectedHospital = ALL_HOSPITALS_VALUE;
    }
    if (document.querySelector("#hospitalSelect")) {
      fillSelect("#hospitalSelect", [ALL_HOSPITALS_VALUE, ...hospitals], state.selectedHospital);
    }
    if (document.querySelector("#entryPayer")) {
      fillSelect("#entryPayer", hospitals, payer || document.querySelector("#entryPayer").value || hospitals[0]);
    }
  }

  function payloadPayer(records) {
    return document.querySelector("#entryPayer")?.value || records[0]?.payer_hospital || "";
  }

  function amount(value) {
    if (typeof parseAmount === "function") return parseAmount(value);
    const number = Number(String(value ?? "").replace(/[(),\s"]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function normalizePeriod(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (monthOptions.includes(text)) return text;

    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      const buddhistYear = date.getFullYear() + 543;
      const monthNames = [
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
      ];
      return `${monthNames[date.getMonth()]} ${buddhistYear}`;
    }

    return text;
  }
})();
