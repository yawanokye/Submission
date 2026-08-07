# UCC Three Public Submission Portals

This Node/Express application provides three separate public submission portals and one protected administrator dashboard.

## Public portals

1. `/project-work.html` – Undergraduate Project Work submission
   - Supervisor/examiner details
   - Study centre and number of groups/candidates
   - Claim form, report, completed project work and score sheet
   - Excel validation checks only for these five headings: `S/N`, `NAME`, `REGISTRATION NO.`, `GROUP NO.`, `TOTAL SCORE`
   - The number of student rows, S/N sequence, duplicate registration numbers and score values are not used to reject the file
   - Score rows from every submission are compiled into one consolidated score sheet for administration

2. `/dissertation.html` – Student Dissertation submission
   - Name, index number, telephone number, email, supervisor's name, programme, dissertation topic and dissertation upload

3. `/assessor.html` – Assessor submission
   - Assessor identification and student identification
   - Assessment report required
   - Claim form required
   - Dissertation upload optional

The landing page is `/`.

## Administrator dashboard

`/admin`

The dashboard provides individual records and original file downloads plus Excel exports:
- Consolidated Project Scores
- Project Work Register
- Dissertation Register
- Assessor Register
- Master Workbook containing all four worksheets

## Render deployment

Create a **Web Service**, not a Static Site.

- Build Command: `npm install`
- Start Command: `npm start`

Set environment variables:

```
ADMIN_USER=admin
ADMIN_PASSWORD=choose-a-strong-private-password
STORAGE_DIR=/var/data/ucc-submission-portals
```

Attach a Render persistent disk at `/var/data`. A 5 GB disk is configured in `render.yaml` as a starting point, but dissertation storage can grow quickly, so increase this according to expected submissions.

## Local test

```
npm install
npm start
```

Then open `http://localhost:10000`.
