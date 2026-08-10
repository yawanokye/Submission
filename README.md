# v15 update: Project Work verification gate + Field Experience scores

Public Project Work and Field Experience score submissions remain open, but they do not automatically enter consolidated score outputs. Each submission starts as **Pending Verification**. A department administrator must explicitly approve the record before its student rows enter the relevant consolidated/master score workbook.

Review states are colour coded: Amber = Pending, Green = Approved, Red = Rejected, Blue = Returned for Correction. Automated duplicate/high-volume warnings are advisory only.

A new public portal is available at `/field-experience.html`. It collects supervisor/examiner identity, study centre, number of students/candidates and an Excel score sheet. It uses the same header-only validation as the current Project Work workflow: `S/N | NAME | REGISTRATION NO. | GROUP NO. | TOTAL SCORE`. Empty rows are ignored. Project Work and Field Experience scores are consolidated separately.

The department admin portal still has three top-level tabs. The first tab now contains separate **Undergraduate Project Work** and **Field Experience Score Submissions** subsections, each with its own approval decisions, register, consolidated scores and master scores.

Individual administrator permissions and developer-published resources now also support a separate `field-experience` section.

Optional warning threshold:

```text
PROJECT_HIGH_ROW_WARNING=100
```

# v14 update: undergraduate project-work verification gate

Public project-work submission remains open, but every new project-work submission is stored as **Pending Verification**. Existing project-work records without a review status are also treated as Pending. Pending, Rejected and Returned-for-Correction records do not feed Consolidated Project Scores or Master Project Scores. Only records explicitly marked **Approved** by a project-work Administrator are included.

Project-work submission states are colour coded in the department admin portal:

- Amber = Pending Verification
- Green = Approved
- Red = Rejected
- Blue = Returned for Correction

The administrator can open a project-work record, inspect the supervisor/examiner identity, submitted email, study centre, original score sheet, claim form, supervisor report, completed project-work files, extracted score-row count and submission date/time, then choose **Approve for Consolidation**, **Reject**, or **Return for Correction**. Review actions are recorded with timestamp, administrator identity and an optional note.

Automated warnings are advisory and do not delete or automatically reject a submission. The current checks flag repeated supervisor/examiner submissions, repeated supervisor + study-centre combinations, registration numbers already present in other Approved score sheets, unusually high score-row counts, and expired/revoked secure-link metadata when such metadata exists. The high-row warning threshold defaults to 100 and may be changed with:

```text
PROJECT_HIGH_ROW_WARNING=100
```

The Project Work Register includes review status and review audit fields. The score sheets inside Consolidated Project Scores and Master Project Scores include Approved submissions only.

# v12 update: single secure assessor/vetter assignment workspace

When a department assigns several dissertations to one assessor or vetter, the system sends one email containing one secure assignment link. That workspace handles downloads and per-work report submission. Each work can be submitted separately, progress is retained, and Early Bird status is calculated per work.

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

## v11 workflow update

- Department admin keeps Fresh Dissertation Submissions and Revised Dissertation Submissions in separate tables.
- The public assessor portal accepts either Assessment Reports or Vetting Reports.
- Department admin keeps Assessment Report Submissions and Vetting Report Submissions in separate tables.
- Dissertation assignment now records an assignment type. Fresh dissertations can only be assigned for Assessment. Revised dissertations can be assigned for Vetting or Assessment.
- Secure assignment emails link to `/assessor.html?assignment=<secure-token>`. The portal retrieves the assigned students from the server and locks student names, index numbers and programmes. Student email is linked server-side and is not exposed for editing.
- A token-linked report submission stores the exact dissertation submission ID for each student, so forwarding feedback uses the email from the correct dissertation record instead of relying on typed names or index numbers.
- Fresh dissertation submissions only accept Assessment feedback forwarding. Student feedback packages contain the report and optional reviewed dissertation only; claim forms are excluded.

## v13: Individual administrator email invitation and password setup

Individual administrator accounts created from the Developer Portal no longer require the developer to choose a permanent password. The developer enters the administrator's name, email address, optional username, assigned department(s), assigned section(s), and role.

The system creates the account in a pending state and emails the administrator a one-time password setup link using the existing Gmail API configuration. The email includes the username and assigned access. The setup link expires after 24 hours by default and becomes invalid immediately after it is used.

Optional environment setting:

```text
ADMIN_INVITATION_EXPIRY_HOURS=24
```

The developer dashboard shows whether an account is Ready, Awaiting setup, Invite expired, Email failed, or Disabled. The developer can resend an invitation. For an already activated account, the same action sends a one-time password reset link without revealing or replacing the current password until the user completes the reset.

The existing Gmail variables are required for invitations:

```text
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=...
GMAIL_FROM_NAME=...
```
