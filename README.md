# UCC Departmental Submission Portals v10

Three public submission portals and protected departmental administration for:

- Undergraduate Project Work
- Dissertation Submission
- Assessment Report Submission

## v10 additions

- Dissertation assignment email now includes the Assessor Submission Portal link, an 8-week report deadline, and a 4-week Early Bird completion date.
- Department administrators can forward each assessment report and optional reviewed dissertation to the student using the email on the latest matching dissertation submission. The student receives a secure download link. Claim forms are not forwarded.
- Student-feedback forwarding uses colour states: red = not forwarded/action needed, amber = sent but not downloaded, green = downloaded, grey = no matching dissertation email.
- Dissertation portal now supports Fresh Submission and Revised Submission. Revised submissions require a revised dissertation plus one or more reviewers' response files. Title validation runs against the uploaded fresh/revised dissertation.
- Consolidated undergraduate scores exclude empty template rows, including rows containing only a pre-filled S/N.
- Developer portal can create individual administrator accounts, assign departments, submission sections and roles, and enable/disable/delete those accounts.
- Developer portal can upload a CSV to replace the Project Work study-centre list. Put one study centre per row in the first column. A header such as `Study Centre` is optional.

## Administrator roles

- **Viewer**: view records and download files/exports in assigned sections.
- **Officer**: Viewer permissions plus dissertation assignment/revocation/resend and forwarding assessment feedback to students.
- **Administrator**: full access to assigned sections, including deletion.

The original environment-variable account for each department remains a full department master administrator.

## Render

Build command:

```text
npm install
```

Start command:

```text
npm start
```

Keep the persistent disk mounted at the configured `STORAGE_DIR` so submissions, dynamic admin accounts, study centres, resources and assignment metadata survive redeployments.

Existing Gmail variables remain required for assignment and feedback emails:

```text
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=department-email@ucc.edu.gh
GMAIL_FROM_NAME=UCC Dissertation Portal
```

Optional:

```text
ASSIGNMENT_EXPIRY_DAYS=14
STUDENT_FEEDBACK_EXPIRY_DAYS=30
```

Developer portal credentials:

```text
DEVELOPER_ADMIN_USER=developer
DEVELOPER_ADMIN_PASSWORD=your-secure-password
```

Department master-account environment variables remain unchanged.
