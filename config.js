window.PORTAL_CONFIG = {
  // Set this to your real backend/serverless endpoint when ready.
  // Example: "https://your-service.onrender.com/api/submissions"
  SUBMISSION_ENDPOINT: "",

  // Excel validation rules.
  REQUIRED_COLUMNS: [
    "Name of students",
    "Registration Number",
    "Scores",
    "Study center"
  ],
  SCORE_MIN: 0,
  SCORE_MAX: 100,
  MAX_SCORE_ROWS: 1000,

  // Upload limits in megabytes.
  MAX_CLAIM_MB: 10,
  MAX_REPORT_MB: 10,
  MAX_WORK_MB: 50,
  MAX_SCORE_MB: 10
};
