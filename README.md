# v18 update: exclude Project Work signature/footer rows from score consolidation

Undergraduate Project Work and other score-based exports now explicitly exclude the template footer metadata that appears below the student score table, including **Signature of Supervisor**, **Date**, and **Contact**. These lines are not counted as score rows and cannot appear in Consolidated or Master score sheets.

The fix is backward-compatible. If an older submission already stored these footer lines as extracted rows, the current export/count logic filters them out automatically, so the supervisor does not need to resubmit the workbook. Empty template rows, including rows containing only a pre-filled S/N, continue to be ignored.

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

## v16: Staged dissertation workflow, vetting controls and anonymous feedback

Version 16 strengthens dissertation processing and reviewer confidentiality:

- **Changed titles after review are supported.** Fresh, revised and final submissions validate the title against the dissertation uploaded at that stage. A revised title may therefore differ from the fresh-submission title when a reviewer has recommended a title change. The previous-stage title and lineage are retained for audit purposes.
- **Assessor/vetter identity is never intentionally released through the student feedback route.** Department admins must prepare an anonymised student copy of the report, and optionally an anonymised reviewed dissertation, before forwarding. The original report, claim form and score sheet remain internal. The server also checks extractable document text for the reviewer name/email before accepting the student copy.
- **Fresh dissertation assignments remain Assessment assignments** with a maximum of 3 assessors. Status colours remain red for 0, amber for 1 and green for 2 or 3.
- **Revised dissertation assignments are Vetting assignments** with a maximum of 2 vetters. Revised records show Vetter(s), and the colour changes from red at 0 to green at 1 or 2.
- The Revised Dissertation section has **Email Selected to Vetter**, which creates the same secure one-link workspace used for fresh Assessment assignments.
- The public Dissertation portal now supports **Fresh Submission, Revised Submission and Final Dissertation**. Final submissions require the final dissertation, one or more reviewer-response files and a plagiarism/Turnitin report.
- The department admin portal has separate **Fresh, Revised and Final Dissertation** subsections. Final records are retained as individual submissions and are not assigned for assessment/vetting.
- Every Assessment/Vetting work submitted through a secure assignment now requires **Report + Claim Form + Score Sheet**. A reviewed dissertation remains optional.
- Fresh and Revised Dissertation Registers are exported separately. Each register de-duplicates by index number within that stage and retains the latest submission for that student.
- Department admins can **Return to Student Without Processing** at the Fresh, Revised or Final stage, with standard reasons for unpaid fees, unsatisfactory/invalid Turnitin report, incomplete/invalid reviewer response, or a custom reason. The student receives the reason by Gmail. Active assignment links containing a returned work are updated/revoked as appropriate.
- Public submission pages include an **Admin Login** link. Department admins now have a form-based login and a **Logout** control. Existing Basic-auth access remains as a compatibility fallback.

No new npm dependency or Render environment variable is required for v16.


## v17: Separate Non-Residential regular-student project work

- `Non-Residential` is now a fixed option in the **Undergraduate Project Work** Study Centre dropdown. It is intended for regular students and is not added to the Field Experience study-centre list.
- Project-work submissions are classified as either **Distance** or **Non-Residential (Regular)**. Existing records whose Study Centre is `Non-Residential` are automatically recognised as regular-student records even if they were created before v17.
- Department admins receive Project Work in two separate subsections: **Distance Undergraduate Project Work** and **Non-Residential Undergraduate Project Work**.
- Both streams retain the Pending → Approved → Rejected / Returned review gate. Only Approved records enter consolidated outputs.
- Existing project score exports now contain **Distance students only**.
- New Non-Residential exports are available separately: **Consolidated Non-Residential Scores**, **Master Non-Residential Scores**, and **Non-Residential Project Work Register**.
- Duplicate-registration and repeat-submission warnings are evaluated within the same project stream so a Non-Residential submission does not contaminate Distance verification.
- Field Experience outputs remain unchanged and separate.

No new environment variable or npm dependency is required for v17.


## v20 inline score review

Undergraduate Project Work review now displays all detected student score rows directly beneath the submitted files in the admin submission record. Each valid row has an Include checkbox, checked by default. Department administrators may uncheck individual rows before approval; unchecked rows remain in the original uploaded workbook but are excluded from approved consolidated and master score exports. Blank template rows and supervisor Signature/Date/Contact footer metadata remain excluded automatically.

Fresh and Revised Dissertation registers retain Supervisor's Name as a dedicated column, with each student deduplicated by index number within the relevant submission stage.


## v20 - Returned score submission email notices
- Returning an Undergraduate Project Work submission for correction now requires a reason and emails that reason to the supervisor/examiner through the configured Gmail API.
- Field Experience uses the same correction-email workflow.
- Returned submissions show correction-email status in the review dialog and provide a Resend Correction Email action.
- A failed email does not undo the Returned for Correction review status. The admin is shown the failure and can resend after correcting Gmail or recipient details.

- Resend Correction Email allows an administrator to confirm or override the recipient email for an already-returned score submission without changing the original submission record.
