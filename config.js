window.PORTAL_CONFIG = {
  // Set this to your real backend/serverless endpoint when ready.
  // Example: "https://your-service.onrender.com/api/submissions"
  SUBMISSION_ENDPOINT: "",

  // Score-sheet validation rules based on the approved Project Work sample.
  REQUIRED_COLUMNS: [
    "S/N",
    "NAME",
    "REGISTRATION NO.",
    "GROUP NO.",
    "TOTAL SCORE"
  ],
  SCORE_MIN: 0,
  SCORE_MAX: 100,
  MAX_SCORE_ROWS: 1000,
  HEADER_SEARCH_ROWS: 30,

  // Upload limits in megabytes.
  MAX_CLAIM_MB: 10,
  MAX_REPORT_MB: 10,
  MAX_WORK_MB: 50,
  MAX_SCORE_MB: 10
};
