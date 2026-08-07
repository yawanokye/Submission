# Project Work & Dissertation Submission Portal

A static frontend modelled on the supplied Project Work submission form and the approved Project Work score-sheet sample.

## What it does

- Collects supervisor/examiner name, phone, email and number of groups/candidates.
- Supports Project Work or Dissertation submissions.
- Includes the study centres from the supplied form.
- Uploads claim form, brief report, completed work/dissertation files and a score spreadsheet.
- Validates the score spreadsheet in the browser before submission.
- Submit button remains disabled until all required fields are complete and the spreadsheet passes validation.

## Approved spreadsheet columns

The validator searches the first worksheet for the score-table header. The header does not have to be on row 1. It must contain these columns:

1. S/N
2. NAME
3. REGISTRATION NO.
4. GROUP NO.
5. TOTAL SCORE

The supplied institutional score sheet places this header on row 8, so the validator automatically searches the first 30 rows to find it.

## Validation rules

- all five approved columns must be present
- column names must follow the approved labels; differences in case, spacing and a final full stop are tolerated
- at least one student record must exist
- S/N must be a positive whole number, unique and sequential starting from 1
- NAME must not be blank
- REGISTRATION NO. must not be blank or duplicated
- GROUP NO. must not be blank
- TOTAL SCORE must be numeric and between 0 and 100
- blank rows after the student records end the table
- supervisor signature/date/contact footer rows are ignored
- maximum 1,000 student rows by default

The included `scores_template.xlsx` is the supplied Project Work sample and can be used as the approved format.

## Run locally

Open `index.html` in a browser. Because the spreadsheet parser is loaded from a CDN, internet access is needed unless you host SheetJS locally.

For a simple local server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Enable real submissions

A static website can validate files, but it cannot permanently store uploaded documents by itself. Configure a backend or serverless endpoint in `config.js`:

```js
SUBMISSION_ENDPOINT: "https://your-service.example/api/submissions"
```

The page sends `multipart/form-data` containing the form fields and uploaded files, plus `validatedScoresJson`.

The backend should repeat the same validation because browser-side validation can be bypassed.
