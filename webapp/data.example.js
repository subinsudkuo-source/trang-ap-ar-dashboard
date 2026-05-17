window.DASHBOARD_DATA = {
  period: "เมษายน 2569",
  hospitals: ["รพ.ตรัง", "รพ.กันตัง", "รพ.ย่านตาขาว"],
  ledger_rows: [
    {
      period: "เมษายน 2569",
      payer_hospital: "รพ.ตรัง",
      creditor_hospital: "รพ.กันตัง",
      source_file: "sample.xlsx",
      "ต.ค.2568": 0,
      "พ.ย.2568": 0,
      "ธ.ค.2568": 0,
      "ม.ค.2569": 0,
      "ก.พ.2569": 0,
      "มี.ค.2569": 0,
      "เม.ย.2569": 1000,
      amount_total: 1000
    },
    {
      period: "เมษายน 2569",
      payer_hospital: "รพ.กันตัง",
      creditor_hospital: "รพ.ตรัง",
      source_file: "sample.xlsx",
      "ต.ค.2568": 0,
      "พ.ย.2568": 0,
      "ธ.ค.2568": 0,
      "ม.ค.2569": 0,
      "ก.พ.2569": 0,
      "มี.ค.2569": 0,
      "เม.ย.2569": 5000,
      amount_total: 5000
    }
  ],
  matrix: {
    "รพ.ตรัง": { "รพ.ตรัง": 0, "รพ.กันตัง": 1000, "รพ.ย่านตาขาว": 2000 },
    "รพ.กันตัง": { "รพ.ตรัง": 5000, "รพ.กันตัง": 0, "รพ.ย่านตาขาว": 250 },
    "รพ.ย่านตาขาว": { "รพ.ตรัง": 3000, "รพ.กันตัง": 150, "รพ.ย่านตาขาว": 0 }
  },
  trial_balance_rows: [],
  trial_balance_target_rows: [],
  reconciliation: [
    {
      hospital: "รพ.ตรัง",
      ap_ledger_total: 3000,
      ap_trial_balance: 3000,
      ap_difference: 0,
      ar_from_counterparties: 8000,
      ar_trial_balance: 8000,
      ar_difference: 0
    },
    {
      hospital: "รพ.กันตัง",
      ap_ledger_total: 5250,
      ap_trial_balance: 5250,
      ap_difference: 0,
      ar_from_counterparties: 1150,
      ar_trial_balance: 1150,
      ar_difference: 0
    },
    {
      hospital: "รพ.ย่านตาขาว",
      ap_ledger_total: 3150,
      ap_trial_balance: 3150,
      ap_difference: 0,
      ar_from_counterparties: 2250,
      ar_trial_balance: 2250,
      ar_difference: 0
    }
  ],
  trang_comparison: [
    {
      community_hospital: "รพ.กันตัง",
      trang_payable_to_community: 1000,
      community_payable_to_trang: 5000,
      net_for_trang: 4000
    },
    {
      community_hospital: "รพ.ย่านตาขาว",
      trang_payable_to_community: 2000,
      community_payable_to_trang: 3000,
      net_for_trang: 1000
    }
  ]
};
