# Project Work & Dissertation Submission Portal, Full Stack

This version includes the public submission page, server-side storage, score extraction, an administrator dashboard, original file downloads, and consolidated Excel exports.

## Core score rule

An uploaded score sheet is accepted based only on finding these five headings in one row of the first worksheet:

- `S/N`
- `NAME`
- `REGISTRATION NO.`
- `GROUP NO.`
- `TOTAL SCORE`

The examiner may add or reduce the number of students. Row count, S/N sequence, duplicates, blank cells and score values are **not used to reject the upload**. Additional columns and institutional headings are ignored.

For consolidation, the backend reads student rows beneath the detected heading row. Rows containing only a pre-filled S/N are ignored. The original uploaded score sheet is always retained unchanged. The master `S/N` is regenerated sequentially when the consolidated sheet is downloaded.

## What the administrator gets

Open `/admin` and authenticate with the environment variables below.

The dashboard provides:

1. Individual submission records with examiner/supervisor details.
2. Original claim form, report, score sheet and project/dissertation file downloads.
3. A clean score extract for each submission.
4. `Consolidated Scores` download with exactly:
   `S/N | NAME | REGISTRATION NO. | GROUP NO. | TOTAL SCORE`
5. `Submission Register` download containing the examiner and submission metadata.
6. `Master Workbook` with both the clean consolidated score sheet and the submission register.

## Render deployment

This is now a **Web Service**, not a Static Site, because it receives and stores uploads.

Recommended Render settings:

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Environment variables:

```text
ADMIN_USER=admin
ADMIN_PASSWORD=<a-strong-private-password>
STORAGE_DIR=/var/data/projectwork_portal
```

Add a Render Persistent Disk and mount it at:

```text
/var/data
```

The persistent disk is essential. Without persistent storage, files saved to the service filesystem may disappear when the service restarts or redeploys.

## Local use

```bash
npm install
ADMIN_PASSWORD=my-password npm start
```

Then open:

- Public portal: `http://localhost:10000/`
- Admin portal: `http://localhost:10000/admin`

The browser will request the administrator username and password when `/admin` is opened.

## Storage

By default the project writes into `./storage` locally. On Render, set `STORAGE_DIR` to the persistent disk path.

- `storage/data/submissions.json` contains submission metadata and extracted score rows.
- `storage/files/` contains the original uploads.

For a much larger deployment, replace the JSON metadata store with PostgreSQL and the file directory with private object storage. The current version is designed to be simple to deploy and manage for an institutional collection exercise.
