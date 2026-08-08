# UCC Departmental Academic Submission Portals

Version 6 adds structured names, dissertation-title validation, administrator deletion controls, a three-assessor limit, and supervisor/assessor conflict protection while retaining Gmail secure-link distribution.

## Public portals

Every public portal requires a receiving department:

1. Department of Education Programmes
2. Department of Business Programmes
3. Department of Arts and Social Sciences
4. Department of Science and Mathematics Programmes

URLs:

- `/project-work.html` — Undergraduate Project Work
- `/dissertation.html` — Student Dissertation Submission
- `/assessor.html` — Assessor batch submission

Each submitter now provides a **Title**, **First Name**, and **Surname / Last Name** as separate required fields. Suggested titles include Mr, Mrs, Ms, Miss, Dr, Prof., Rev., Ing. and Esq., while the field also allows another title to be typed.

## 1. Undergraduate Project Work

The portal retains the existing project-work workflow:

- claim form
- report
- completed project work files
- Excel score sheet
- department and study centre
- number of groups / candidates

Score-sheet acceptance validates only the five headings:

`S/N | NAME | REGISTRATION NO. | GROUP NO. | TOTAL SCORE`

The examiner may add or remove student rows. Student count, S/N sequence, duplicates and score values are not used to reject the workbook.

Only undergraduate project work contributes to:

- Consolidated Project Scores
- Master Project Scores
- Project Work Register

## 2. Dissertation Submission

Required student information:

- Title
- First Name
- Surname / Last Name
- Index Number
- Telephone Number
- Email
- Programme

Required supervisor information:

- Supervisor's Title
- Supervisor's First Name
- Supervisor's Surname / Last Name

Required dissertation information:

- Dissertation Title
- Dissertation file in PDF, DOC or DOCX format

### Dissertation-title validation

Before a dissertation submission is saved, the server reads the beginning of the uploaded work and checks that the entered dissertation title appears in the document. Matching ignores capitalisation, punctuation, line breaks and normal spacing differences, but the wording must match.

- PDF: the first four pages are read.
- DOCX: document text is extracted.
- DOC: document text is extracted.
- If the file is a scanned/non-searchable PDF or otherwise has insufficient readable text, the submission is rejected with an instruction to upload a readable version.
- If the title does not match, the submission is rejected and the temporary uploaded file is removed.

The successful record stores only the validation result and time, not the extracted dissertation text.

## 3. Assessment Report Submission

The assessor provides Title, First Name and Surname / Last Name, plus contact information.

For `N` works, the portal requires:

- exactly `N` assessment reports
- exactly `N` claim forms
- zero to `N` optional dissertation files

The current maximum is 25 works per assessor submission.

## Department administrator portals

- `/admin/education`
- `/admin/business`
- `/admin/arts-social-sciences`
- `/admin/science-mathematics`

Each department sees only submissions routed to that department.

### Administrator deletion

Administrators can permanently delete submissions from all three sections:

- one submission at a time
- multiple selected submissions at once

Deletion removes the submission record and its stored files. If a deleted dissertation was included in an assessor secure-link assignment, it is removed from that assignment. If no dissertations remain in that assignment, the assignment is automatically revoked.

Deletion is permanent and cannot be undone.

## Dissertation register and file selection

The dissertation register retains these columns:

`S/N | Name of Student | Index Number | Dissertation Title | Programme | Supervisor's Name`

Administrators can:

- download one dissertation
- select several dissertations and download a ZIP
- select several dissertations and email one secure download link to an assessor
- delete one or several dissertation submissions

## Assessor assignment controls

### Maximum of three assessors per dissertation

Each dissertation row displays an **assessor counter**, for example `0 / 3`, `1 / 3`, `2 / 3`, or `3 / 3`.

The server prevents a dissertation from being assigned to more than three unique assessors. Pending assignment creation is also reserved during the check to prevent simultaneous requests from exceeding the limit.

A revoked assignment no longer occupies an assessor slot. Expired assignments remain part of the assignment history unless revoked.

The system also prevents the same assessor from being assigned twice to the same dissertation. Use **Resend Link** for an existing assignment instead.

### Supervisor cannot assess the same dissertation

When an administrator assigns dissertations, the assessor's Title, First Name and Surname / Last Name are entered separately. The server compares that name with each selected dissertation's recorded supervisor. If they match, the whole assignment is blocked and the affected dissertation/index number is identified.

This check also attempts to recognise legacy supervisor names that include titles or middle names.

## Secure Gmail distribution

The secure-link workflow remains:

1. Select dissertation(s).
2. Click **Email Selected to Assessor**.
3. Enter assessor Title, First Name, Surname, Email, link-validity period and optional message.
4. The server validates the 3-assessor limit and supervisor conflict.
5. A random secure token is generated and only its SHA-256 hash is stored.
6. Gmail API sends the secure link. No dissertation is attached to the email.
7. The assessor downloads the assigned dissertations as a ZIP generated on demand.
8. The dashboard records sent date, expiry, download date/count and status.
9. The administrator can revoke or resend the link.

## Gmail API environment variables

Set these in Render:

```text
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=department-email@ucc.edu.gh
GMAIL_FROM_NAME=UCC Dissertation Portal
ASSIGNMENT_EXPIRY_DAYS=14
```

The Gmail OAuth scope is:

```text
https://www.googleapis.com/auth/gmail.send
```

## Render deployment

Create a **Web Service**.

```text
Build Command: npm install
Start Command: npm start
```

This version pins Node.js to the Node 24 line because the PDF text-extraction dependency is tested for that runtime.

The included `.node-version` contains:

```text
24
```

### Persistent disk

Mount a persistent disk at exactly:

```text
/var/data/ucc-submission-portals
```

Set:

```text
STORAGE_DIR=/var/data/ucc-submission-portals
```

## Department credentials

```text
EDUCATION_ADMIN_USER=education-admin
EDUCATION_ADMIN_PASSWORD=...

BUSINESS_ADMIN_USER=business-admin
BUSINESS_ADMIN_PASSWORD=...

ARTS_SOCIAL_ADMIN_USER=arts-admin
ARTS_SOCIAL_ADMIN_PASSWORD=...

SCIENCE_MATH_ADMIN_USER=science-admin
SCIENCE_MATH_ADMIN_PASSWORD=...
```

## Stored metadata

```text
data/submissions.json
data/dissertation-assignments.json
```

Original submitted files remain under the persistent `files` directory.

## Health check

`/health`

Expected form:

```json
{"ok":true,"departments":4,"emailConfigured":true,"emailProvider":"gmail"}
```
