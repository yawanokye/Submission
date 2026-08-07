# UCC Departmental Academic Submission Portals

This Node/Express application provides three public submission portals and four department-specific administrator portals.

## Departments

Every public submission requires the submitter to choose one of these receiving departments:

1. Department of Education Programmes
2. Department of Business Programmes
3. Department of Arts and Social Sciences
4. Department of Science and Mathematics Programmes

A record is visible only in the administrator portal for the department selected by the submitter.

## Public portals

### 1. `/project-work.html` – Undergraduate Project Work

- Supervisor/examiner details
- Department and study centre
- Claim form, report, completed project work and score sheet
- Excel validation checks only for the presence of these five headings: `S/N`, `NAME`, `REGISTRATION NO.`, `GROUP NO.`, `TOTAL SCORE`
- Student count, S/N sequence, duplicate registration numbers and score values do not cause rejection
- Score rows are compiled only within the selected department

### 2. `/dissertation.html` – Dissertation Submission

- Department
- Student name and index number
- Telephone and email
- Supervisor's name
- Programme
- Dissertation topic/title
- Dissertation upload

### 3. `/assessor.html` – Assessment Report Submission

- Department
- Assessor and student identification
- Number of works being submitted, from 1 to 25
- Multiple assessment reports, exactly matching the declared number of works
- Multiple claim forms, exactly matching the declared number of works
- Multiple dissertation uploads optional, up to the declared number of works

## Department administrator portals

Use `/admin` to choose a department, or open the protected URLs directly:

- `/admin/education`
- `/admin/business`
- `/admin/arts-social-sciences`
- `/admin/science-mathematics`

Each department dashboard contains three separate sections:

### Undergraduate Project Work

- Individual project work submissions and original files
- Consolidated Project Scores Excel download
- Project Work Register Excel download
- Master Project Scores workbook containing only undergraduate project-work data

### Dissertations

- Individual dissertation records only
- Register columns: `S/N`, `Name of Student`, `Index Number`, `Dissertation Title`, `Programme`, `Supervisor's Name`
- Individual dissertation download
- Checkboxes for selecting dissertations
- Selected dissertations can be downloaded together as one ZIP file
- Dissertation Register can be downloaded as Excel

### Assessment Reports

- Individual assessor submission records only
- Each record shows the declared number of works
- Every assessment report in the submission can be downloaded individually
- Every claim form in the submission can be downloaded individually
- Every optional dissertation in the submission can be downloaded individually
- No consolidated score or master workbook is produced for this section

## Render deployment

Create a **Web Service**, not a Static Site.

- Build Command: `npm install`
- Start Command: `npm start`

Attach a persistent disk at `/var/data` and use:

```text
STORAGE_DIR=/var/data/ucc-submission-portals
```

Set separate administrator credentials for each department:

```text
EDUCATION_ADMIN_USER=education-admin
EDUCATION_ADMIN_PASSWORD=choose-a-strong-password

BUSINESS_ADMIN_USER=business-admin
BUSINESS_ADMIN_PASSWORD=choose-a-strong-password

ARTS_SOCIAL_ADMIN_USER=arts-admin
ARTS_SOCIAL_ADMIN_PASSWORD=choose-a-strong-password

SCIENCE_MATH_ADMIN_USER=science-admin
SCIENCE_MATH_ADMIN_PASSWORD=choose-a-strong-password
```

`render.yaml` includes these variable names. Password values are intentionally not stored in the repository.

## Storage

All metadata is stored in `submissions.json` on the persistent disk. Uploaded files are stored in the persistent file directory. A 5 GB disk is configured as a starting point. Increase disk size if many dissertations or project files are expected.

## Local test

```bash
npm install
npm start
```

Then open `http://localhost:10000`.

