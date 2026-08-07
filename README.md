# Project Work & Dissertation Submission Portal

A static frontend modelled on the supplied 2025 Project Work submission form.

## What it does

- Collects supervisor/examiner name, phone, email and number of groups/candidates.
- Supports Project Work or Dissertation submissions.
- Includes the study centres from the supplied form.
- Uploads claim form, brief report, completed work/dissertation files and a score spreadsheet.
- Validates the score spreadsheet in the browser before submission.
- Submit button remains disabled until all required fields are complete and the spreadsheet passes validation.

## Spreadsheet rules

The first worksheet must include these columns:

1. Name of students
2. Registration Number
3. Scores
4. Study center

The validator also checks:

- no blank compulsory cells
- scores are numeric
- scores are between 0 and 100
- registration numbers are not duplicated
- study centre in every spreadsheet row matches the study centre selected on the form
- maximum 1,000 score rows by default

Common header variants such as `Student Name`, `Reg No`, `Marks`, and `Study Centre` are accepted and mapped to the required standard.

## Run locally

Open `index.html` in a browser. Because the spreadsheet parser is loaded from a CDN, internet access is needed unless you download and host SheetJS locally.

For a simple local server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Enable real submissions

A static website can validate files, but it cannot permanently store uploaded documents by itself. You need a backend or serverless endpoint.

Edit `config.js`:

```js
SUBMISSION_ENDPOINT: "https://your-service.example/api/submissions"
```

The page sends `multipart/form-data` containing the form fields and uploaded files, plus `validatedScoresJson`.

Recommended production options:

- Render backend + PostgreSQL/object storage
- Supabase Storage + database + Edge Function
- Firebase Storage + Cloud Function
- AWS S3 + Lambda/API Gateway

For institutional use, a small Render backend with authenticated admin download/export is usually the easiest next step.

## Security before production

Do not rely only on browser validation. The backend must repeat all spreadsheet/file checks because client-side JavaScript can be bypassed. Also add:

- login or one-time submission code if access should be restricted
- virus/malware scanning for uploads
- file extension and MIME verification
- server-side size limits
- private object storage
- audit log and submission reference number
- rate limiting
- HTTPS
- data retention and access-control policy

## Main files

- `index.html` - submission interface
- `styles.css` - responsive design
- `app.js` - validation and submission logic
- `config.js` - endpoint and validation settings
