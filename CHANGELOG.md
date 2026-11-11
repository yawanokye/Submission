## 78.0.0

- Automatically retain a new expanded or corrected Project Work or Field Experience upload when it fully contains an earlier unpaid submission in the same category. Return affected approval registers for fresh review without changing paid ledgers.
- Treat confirmed expanded or corrected submissions as versions of one current record. Move covered earlier unpaid copies into accessible version history and hide them from normal submission and claim lists.
- Add a visible Use this updated version form before academic approval. Retain original files, score rows, references and audit events, and require fresh HoD payment approval.
- Use only the retained version in current consolidated scores. Preserve earlier score values for historical review.
- Protect paid claims, active approval registers, partial overlaps, separate categories and stale replacement decisions.

## 77.0.0

- Download all selected claims as one matching PDF and Excel pack, with a separate pair for every category and a selection summary.
- Show selected submission count, aggregated claimant/category rows and claim units together. Include every source submission in the Excel detail sheet.
- Reject stale export and forwarding selections and invalid or newly ineligible IDs instead of silently downloading a smaller register.
- Reconcile grouped claimant identity consistently in the screen, PDF and Excel register.

## 76.0.0

- Add a visible Resolve study centres action and one form to save all chosen programme/group decisions with an administrator reason and audit history.
- Count every student in score-sheet group blocks where the group number is written once. Preserve source rows, original index numbers and exclusions.
- Allow the selected Directorate, Provost, College Finance, Payroll and Audit to verify the immutable supporting pack as soon as the HoD forwards it. Approval actions remain restricted to the current stage.
- Number uploaded project works in submission details and grouped registers, including existing registers where source metadata remains available.

## v75, 11 November 2026

- Show an explicit Open retained claim action on submissions excluded from payment as duplicates. Follow superseded references to the current retained record, show the recorded decision and preserve access to the original excluded record. Missing, circular and cross-department links are not followed.
- Label ready claims Add to HoD payment register and explain that excluded copies already approved for reports are processed through the retained reference. Already-paid retained claims lead to payment history rather than a new payment action.
- Re-enable saving selected score rows when an administrator changes the included rows on an already approved Project Work or Field Experience submission. Restoring the original checkbox selection restores the approved state. Saving academic score changes preserves duplicate-payment exclusions and all existing payment checks.
- Tested retained-reference navigation, supersession chains, invalid links, decision visibility, score-selection save/revert and preservation of duplicate exclusions.

## v74, 11 November 2026

- Made project completeness and chapter checking optional. Reconciled approved claims can be selected and forwarded without opening uploaded works, running a content scan or recording a separate document-review declaration. Unrun, unreadable, unmatched or incomplete optional checks no longer create mandatory payment holds.
- Reconcile submission details, claimed quantities, attached work or candidate counts and recorded student results automatically. Show the recommended payable quantity and any genuine reconciliation exceptions in the claims workspace.
- Added Approve Selected for Project Work, Field Experience / Teaching Practice and Assessment / Vetting. A single batch summary shows student counts, claim quantities and exceptions before the administrator approves eligible submissions together. Already approved or paid records keep their existing approval and payment history. Successful approvals archive automatically.
- Put Select all eligible approved and Forward selected to HoD in the claims workspace. Selections from submission lists transfer only eligible approved claims into the category-register preparation step, with an explicit count of records that still need attention. Preserve category separation and selected-only HoD forwarding.
- Keep original files, scores, student rows, duplicate exclusions and prior-payment decisions unchanged. Actual duplicate / paid-work findings, invalid quantities, missing records and source-integrity checks still protect payment processing. Applying a reduced optional recommendation or rejecting a claim remains an explicit recorded administrator decision.
- Tested bulk approval without document-opening declarations, optional incomplete-chapter findings, automatic counts, selection, skipped records, stale data, department/section permissions, preserved paid and active-register records, duplicate holds, grouped forwarding, selected HoD processing, portal roles and temporary-error recovery.

## v73.0.2, 11 November 2026

- Recover the claim-review window from temporary Render restart pages. Parse API errors safely, retry read-only loads after temporary 502/503/504 responses and interrupted connections, and offer Retry and sign-in actions. Preserve verification choices and never automatically resubmit an approval or rejection after an uncertain response.

## v73.0.1, 11 November 2026

- Keep read-only developer content checks separate from saved departmental audits. An administrator can run and save a full review after a developer preview without reusing an unsaved preview result. Added a regression check that preview audits leave submission records unchanged and administrator audits use a separate job.

## v73, 11 November 2026

- Organised department administration into Review submissions, Claims & payments, Reports & batches and Archive. Every approved claim remains searchable, including archived, held, forwarded, paid and excluded records. Show academic approval separately from payment readiness, with the current reason and a direct next action. Category filters and explicit selection start with no claims selected.
- Prioritised grouped registers in staff, Directorate, Provost, Finance, Payroll and Audit workspaces. Keep service cases, reports and earlier individual-claim controls in separate views. Add responsive navigation, keyboard focus, section links on public forms and reduced-motion support. Put the developer portal preview first.
- Added a department-wide project-content check with progress. Read DOCX, DOC and searchable PDF works in bounded worker processes. Check five substantive chapter sections, names and index numbers together, complete score-sheet group membership, identical files, normalised text and strongly repeated project text. Unreadable, partial, unrelated, incomplete and ambiguous evidence receives no automatic payable recommendation. The short-chapter threshold is a review flag, not a UCC word-count rule or an academic-quality assessment.
- Recommend distinct, supported project-work quantities file by file. An individual departmental administrator must approve or reject the current recommendation and record completed-work, claimant, quantity and prior-payment checks. Approval cannot exceed the recommendation. Exclude unsupported or repeated attachments from payable units while preserving original files, scores, stated quantities and decision history. Other duplicate, centre, prior-payment and approval checks remain mandatory.
- Hold conflicting student identities or scores on both participating claims. Add an auditable comparison for complete supporting-file copies by the same claimant so the administrator can choose the correct student list, including a later copy. Stale, paid and active-register copy decisions are blocked. Partial overlaps require individual reconciliation.
- Bind work verification and recommendations to current files and score data. Apply checks at register preparation, every approval stage and Payroll. Verify the current HoD-approved units, original source fingerprint and signed-document integrity before recording payment. Changed evidence requires a revised approval. Developer previews cannot record payment or duplicate decisions.
- Validated content recommendations and rejection, mixed valid/incomplete/unrelated/repeated uploads, quantity limits, copy selection, stale/paid guards, preserved sources, navigation, academic reconciliation, category registers, selected HoD forwarding, full approval chain and portal permissions.

## v72, 11 November 2026

- Added an on-demand document evidence check for project-work reconciliation. It compares student names and index numbers in uploaded DOCX, DOC and searchable PDF works with the current score sheet and approved submissions containing repeated indexes. The report shows source passages, PDF pages, group membership matches, different-name conflicts and identical project files.
- Run bounded text extraction in a separate process with progress reporting. Unreadable, image-only, incomplete and ambiguous evidence remains for manual review. Checks do not change names, scores, index numbers, centre decisions, approvals or payment holds.
- Map the submitter-selected study centre names or codes through the centre directory and use them to guide reporting-centre suggestions. Unknown or ambiguous mappings remain for manual confirmation. Authorised centre decisions retain every original student index and can use a selected reporting centre outside the index-code clusters.
- Let HoDs select the submissions to process, preview only those in an A4 PDF and forward a separate signed payment register containing only the chosen claims and documents. Remaining submissions stay pending with HoD and retain their own current document pack.
- Explain that conflicting rows require administrator permission when viewed by an account without correction authority.
- Split selected approved claims into separate registers and approval journeys for Project Work, Distance, Project Work, Non-Residential, Field Experience, Teaching Practice and Assessment / Vetting. Each category has separate prepared PDF and Excel downloads. HoD selection can separate an earlier mixed register into category-specific onward registers. A payment register forwarded by HoD accepts one category at a time.
- Reserve a HoD signature line, name, date and official stamp area beneath every A4 portrait PDF page. Apply an uploaded HoD signature to every endorsed page. Category totals and claimant rows remain above the signing area, with separate category pages even in combined previews.
- Added document parsing, identity ambiguity, mixed-centre membership, permissions, browser, category routing, selected-only forwarding, centre-guide decisions and multi-page PDF layout checks.

## v71, 11 November 2026

- Added automatic preparation of grouped registers from approved, unpaid submissions. Claimants are sorted within Project Work, Distance, Project Work, Non-Residential, Field Experience, Teaching Practice and Assessment / Vetting categories. Held quantities and incomplete evidence remain visible for correction.
- Added prepared claim forms, A4 portrait PDF registers with names and claim counts, Excel and CSV registers, and complete document ZIP packs. The HoD's protected signature endorses the register and each prepared claim form after password confirmation. Official covering letters remain part of the manual process.
- Added read-only register routing from HoD to the selected Directorate, Provost, College Finance Officer, Payroll and Audit. Officers can return a register to HoD or the department with a recorded reason. Corrected department submissions create a revised register while preserving earlier documents and decisions.
- Copy and verify supporting documents at preparation, check source changes before approval, prevent split individual approval or deletion of grouped claims, and retain payout controls and existing claim-verification records. Existing individual workflows remain available for earlier claims.
- Added Payroll template imports and configurable Excel / CSV columns, protected document sign-in links, receiving-unit email and SMS messages, delivery history and an animated Action required indicator with reduced-motion support.
- Approved submissions now leave the active admin lists automatically across all categories. Active, Archive and All views retain original documents, claims, exports and audit history. Administrators can restore a record to active work, or complete dissertation processing and archive it without recording an academic result.
- Added isolated approval-chain, browser, export, document-integrity, notification, permission, payout and archive tests. Reviewed multi-page A4 portrait PDF layout with long claimant names and a signature.

## v70, 10 November 2026

- Added an explicit Create Full HoD Account option and Full HoD role in Developer Administration > Administrators. Choosing HoD departments automatically supplies department access, academic and claim sections, signature management and HoD payment authority.
- Added Add / Manage Full HoD Access to every existing account. HoD access can be added without replacing existing units, sections, department assignments, credentials or stored signatures.
- Added clear Full HoD account badges, department-scoped HoD portal links and validation against incomplete assignments. HoD grant, update and removal actions are recorded in account access history.
- Refresh active account sessions after permission changes. Disabled accounts lose their sessions, and developer preview sessions retain their separate restrictions.
- Added onboarding, signature, scope, session, preservation, revocation and browser checks for new and existing HoD accounts.

## v69, 31 October 2026

- Field Experience V and Micro-Teaching now accept score-sheet-only submissions because tutors were paid during face-to-face sessions. No claim form, payment count, claimant declaration or certification email is required for those activities. Candidate counts are derived from the uploaded score sheet.
- Field Experience I & II, III & IV and Reflections retain their claim forms and candidate-count validation. Macro-Teaching retains its existing claim requirement pending a separate policy instruction.
- Exclude score-only activities from new HoD payment registers, consolidation and processing packs. Block new payment approval at HoD, Director, Provost, College Finance, assigned Finance Officer, Payroll and Audit stages, including existing unpaid submissions.
- Preserve academic score approval, consolidation and exports, along with original documents and recorded payment history. Historical score-only claims have zero payable units and an explicit policy note in payment registers and All Payments packs.
- Show the score-only policy in the public form, departmental review and developer settings.

## v68, 28 October 2026

- Renamed the HoD Approval List to HoD Claim Review List and explained that it includes ready, held and forwarded submissions.
- Held and already-paid claims show zero payable units. Remaining claim quantities stay visible separately. The category Excel register includes both figures and the review status.
- Added a held-claim count and clear hold labels. Forwarded claims retain their current approval stage without a false payment-hold message.
- Clarified that student and work-file duplicate counts are matches against the linked claim, not missing attachments.

## v67, 27 October 2026

- Added category filters and A–Z, oldest-first and newest-first sorting to HoD approval lists.
- Separated Project Work, Distance; Project Work, Non-Residential; Field Experience; and Teaching Practice. Micro-Teaching, Macro-Teaching and Reflection are grouped under Teaching Practice. Assessment/vetting claims remain available separately.
- Applied the same category grouping, filters, registers and packs throughout Director, Provost, College Finance, assigned Finance Officer, Payroll and Audit portals. All Payments includes authorised payment history, with paid and blocked records clearly marked and zero outstanding payable units.
- Added explicit grouped-category and All Payments pack downloads. Combined packs contain category totals, separate category registers, and supporting documents grouped by category and claimant.
- Category registers include all approved submissions, including those awaiting HoD approval, with claimant names, quantities, stages and original claim-form links. Manual payment packs use the same category and sorting filters.

## v66, 27 October 2026

- Added manual payment packs with an Excel claimant/quantity register, covering-letter template, printable endorsement sheet, original claim forms and signed HoD approval PDFs. Available to the HoD and each authorised downstream officer. Downloads preserve digital approval status.
- Recheck original supporting files at every approval stage before forwarding.
- Added explicit HoD assignment for new and existing administrator accounts, with department checkboxes and automatic claim-portal permissions.
- HoDs can select one or both Director portals. Each selected Director must approve before the Provost and College Finance Officer. The College Finance Officer chooses Payroll or a named, authorised Finance Officer, followed by Audit. Assigned Finance Officers see only their own assigned claims.
- Added Developer > HoD, Payroll & Auditor > Open HoD Portal with department-scoped viewing of approved claims and the queue awaiting HoD payment approval.
- Added direct bulk forwarding from project-work, field-experience and assessor submission selections. Opened the existing claim reconciliation lists by default.
- Reject missing or zero-byte claim uploads. Recheck the actual stored source files before forwarding and before HoD payment approval.
- Require the field-experience candidate claim count to equal the candidates in the attached score sheet. Project-work group/attachment matching remains enforced. Assessor report counts must be integers, with one report, claim form and score sheet per work, and no extra work attachments.
- Keep Field Experience and Teaching Practice based on candidate scores, without requiring completed-work evidence.
- Added integration and browser DOM checks for developer access, empty uploads, claim-count mismatches, mixed invalid batches and bulk forwarding.

## v65

Field Experience and Teaching Practice now require the claim form, remove the completed-work/supporting-evidence upload section, and use approved candidate scores for new payment quantities. Project Work and historical signed claims keep their existing rules. See PATCH_NOTES_v65.txt.

## v64

Alphabetical HoD claims; student/file duplicate holds across payment stages; audited exclusion and final-version selection; evidence-backed balance payments; green waiver reconciliation and mixed bulk processing; protected original-form links throughout approvals. See PATCH_NOTES_v64.txt for deployment and reconciliation steps.

# Changelog

## 63.0.0 Department-loading hotfix

- Removes claim-document extraction from department register, statistics, assignment and processing-batch loading.
- Guards malformed legacy file metadata and unavailable claim attachments.
- Reads and retains legacy claim names when an individual review is opened.
- Forwards rejected dashboard handlers to Express error handling instead of letting a request rejection terminate the process.
- Adds request-specific loading errors, retry controls and optional-section recovery.
- Versions department assets and disables caching for protected department responses.
- Adds a regression test that fails against v62 and passes with the fix for malformed, missing and damaged claim-file fixtures.

## 62.0.0 Claim tabs, name review and individual waiver selection

- Moves Project Work HoD claims into separate tabs beneath Distance and Non-Residential Project Work.
- Scopes totals, selection actions and workbook downloads to the relevant module and category.
- Links claim references to form verification and adds form hyperlinks in reconciliation workbooks.
- Reads labelled claimant, supervisor, examiner or marker names from text-based PDF, DOC and DOCX forms.
- Gives the form name priority and provides separate name-part fields for administrator corrections.
- Audits changes and invalidates an earlier approval when the effective payee name changes.
- Activates certification waiver from an individually selected eligible claim and skips already certified entries in mixed selections.
- Preserves the prior duplicate-payment checks and HoD-only payment-signature authority.

## 61.0.0 Unique consolidated claims and duplicate-payment protection

- Assigns one stable consolidated claim number to a claimant's unique approved submissions within each department, year and category.
- Separates Distance and Non-Residential consolidated claims in the department view and downloadable HoD workbook.
- Detects exact repeated student results using approved registration or index numbers and scores.
- Flags the same students submitted with changed scores as a conflicting repeat.
- Keeps the earliest valid submission payable and blocks later repeats from HoD forwarding and payment approval.
- Detects repeated Project Work and Field Experience results even when another claimant submits them.
- Retains each source reference and audit history under the consolidated claim.

## 60.0.0 HoD or assigned administrator waiver confirmation

- Allows an individual authorised HoD or assigned departmental administrator to confirm claimant-certification waivers with their own password.
- Verifies the administrator's department, role and claim-section assignment before accepting either a single or bulk waiver.
- Excludes department master credentials and Developer Preview from waiver confirmation.
- Records the confirming officer's authority role in the claim, audit history, approved PDF and operational registers.
- Keeps HoD signature upload and HoD payment approval restricted to authorised HoD accounts.

## 59.0.0 Controlled certification waiver and selectable approval reasons

- Adds single-claim and bulk claimant-certification waiver actions restricted to individual authorised HoD accounts.
- Requires HoD password confirmation, at least one approved waiver reason and an evidence source.
- Supports existing claim forms and separately uploaded waiver evidence without altering the original claim.
- Treats formally waived certification as eligible for departmental forwarding and HoD approval.
- Shows waiver status and evidence in department, downstream functional-unit, Payroll and downloadable registers.
- Replaces free-text-only approval reasons with checkbox reason lists across departmental review, reconciliation, forwarding, part-payment, downstream approvals and Payroll actions.
- Preserves optional detail fields for exceptional context and records decisions in the audit history.

## 58.0.0 Consolidated HoD forwarding and strict attachment reconciliation

- Adds an admin-level Approved Claims for HoD register with ready and reconciliation-needed status.
- Consolidates ready claims by unique supervisor or examiner and totals completed-work attachments.
- Adds selection and batch forwarding of reconciled approved claims to the HoD portal.
- Adds a two-sheet Excel copy for HoD, containing consolidated totals and detailed reconciliation records.
- Requires Field Experience and Teaching Practice completed-work uploads to equal the quantity stated at submission.
- Applies the same quantity check again before department forwarding and HoD approval.
- Preserves all approval routing, notification and audit-history controls from v57.

## 57.0.0 Field Experience transfer reconciliation and routed claim approvals

- Extends predominant-centre transfer-student reconciliation to Field Experience and Teaching Practice.
- Adds administrator decisions and audit history for ambiguous Field Experience centre patterns.
- Uses actual completed-work attachment count as the payable Field Experience/Teaching Practice quantity.
- Adds Department-to-HoD forwarding and the HoD functional-unit portal.
- Routes HoD-approved claims through the responsible Directorate, Provost, College Finance, Payroll and Audit.
- Adds current and historical functional-unit claim registers plus consolidated unique supervisor/examiner totals.
- Adds developer-managed email and mobile contacts for every approval stage with email and optional Arkesel SMS notices.
- Retains return-to-department, reconciliation, renewed HoD approval and complete audit history.

## 56.0.0 Administrator reconciliation decisions and clean group numbers

- Gives each unresolved Project Work centre/group case a clear suggested resolution.
- Lets administrators apply a suggested index-format correction, accept a transferred-student reporting centre, or confirm separate groups with a required comment.
- Saves each decision independently so several issues in one submission can be resolved in sequence.
- Clears the warning and records the submission as valid for consolidation and claim processing after the last issue is resolved.
- Retains all comments, corrections, administrators and dates in the claim audit history.
- Writes only the numeric group identifier in consolidated, master, programme-by-centre and centre-by-centre score outputs.
- Preserves the original uploaded workbook and its original group descriptions.

## 55.0.0 Centre/group reconciliation warning correction

- Narrows the non-blocking warning policy to Project Work centre/group reconciliation.
- Accepts the illustrated 10 claimed, 10 attached and 11 detected group-combination case when every index number has a score.
- Keeps the claim-versus-attachment count and missing index-score checks as blockers.
- Removes the additional row-quality warning classifications introduced in v54.

## 54.0.0 Project Work submission gate and warning policy

- Accepts a Project Work submission when the claimed group count matches the attached completed works and every index number has a score.
- Changes group, centre, row-quality, sequence, duplicate and score-range inconsistencies into departmental warnings at submission.
- Keeps missing index scores and claimed-group versus attachment-count differences as submission blockers.
- Reports the warning count to the claimant after successful submission and preserves all v53 administrator reconciliation controls.

## 53.0.0 Project Work predominant-centre grouping

- Keeps genuine same-number groups at different study centres distinct.
- Retains up to two transferred/minority-code students with a clear predominant group when the combined group remains three to six students.
- Preserves original index numbers while using an auditable reporting centre in consolidated outputs.
- Adds administrator review, approval blocking, audit history and processing-batch correction records for ambiguous centre patterns.

## 52.0.0 trusted-origin recovery and legacy upload protection

- Added a browser-confirmed same-origin recovery path for trusted custom-domain requests whose Origin value is opaque or changed by an intermediary.
- Kept unrelated cross-site requests blocked and added traceable support codes to rejection pages and logs.
- Explicitly recognised the canonical domain, its `www` alias and the legacy Render upstream during transition.
- Preserved in-flight POST uploads sent from cached legacy forms instead of redirecting and risking loss of the request body.
- Continued permanent redirects for legacy GET and HEAD links.
- Changed the referrer policy to `strict-origin-when-cross-origin` for safe same-origin diagnostics without disclosing secure paths cross-site.

## 51.0.0 persistent sessions and assignment recovery

- Replaced process-memory staff and administrator sessions with hashed SQLite sessions that survive service restarts.
- Added automatic expiry cleanup and throttled sliding-session renewal.
- Redirected expired secure-assignment submissions to staff login with a safe return path instead of returning raw authentication JSON.
- Accepted the canonical custom domain and its `www` alias while retaining cross-origin request blocking.
- Normalised quoted or trailing-slash `PUBLIC_BASE_URL` values.
- Added session-store status to the health endpoint and an automated restart-persistence test.

## 50.0.0 assigned-staff evidence, private feedback and canonical domain

- Assigned staff can attach optional decision evidence when marking a complaint or request complete.
- Decision evidence is retained with the assignment and added to the authorised officer-evidence register.
- Assigned staff can send private feedback to their functional-unit head or administrator before or during completion.
- Private feedback is excluded from every student tracking response.
- Completion forms accept the public custom-domain origin when Render is acting as the upstream host, preventing the raw verification JSON error.
- Generated staff-assignment, activation, tracking and notification links use `https://mycode360.app`.
- Existing browser links to the former Render hostname redirect to the custom domain.

## 45.0.0 rule-based Student Support assistant

- Added a non-AI chatbot to the Student Support portal with approved quick questions and typed-question matching.
- Added a System Administrator Chatbot Response Library with draft, published and retired states.
- Added administrator-managed titles, alternative questions, keywords, categories, matter types, answers, responsible units, actions, languages and display order.
- Added response version history, usage counts and helpful or not-helpful feedback.
- Added redacted unanswered-question review with one-click conversion into a draft response.
- Excluded sensitive questions from chatbot storage and directed them to the confidential complaint pathway.
- Added Excel import and export for the response library and unanswered-question register.
- Added automated verification for matching, publication controls, privacy redaction, feedback and workbook export.

## 44.0.0 duplicate score policy and audited removal

- Classifies duplicate students by normalised name, registration or index number, and score.
- Accepts exact duplicates as normal and records them once in consolidated and master score outputs.
- Keeps conflicting duplicates visible for administrator correction before approval.
- Lets authorised administrators remove a conflicting student row from approved records without changing the uploaded workbook.
- Records the removed row, reason, administrator, date and source submission in the audit history.
- Keeps whole-submission deletion as a separate confirmed action.
- Applies the same policy to Project Work, Field Experience and Teaching Practice score workflows.

## 43.0.0 controlled HoD claim approval

- Added account-controlled HoD signature profiles and password-confirmed approval decisions.
- Generates a separate approved-claim PDF with a verification code and source fingerprint while preserving the original claim.
- Added claimant email certification and prohibited artificial claimant signatures.
- Added centre-aware project-group counting and selectable part-payment units with mandatory reconciliation reasons.
- Added departmental and Payroll Approved for Payment registers, full audit access, and Payroll return-to-department processing.
- Invalidates prior HoD approval after source/review changes and requires fresh approval.

## 42.0.0 focused tracking and structured identity fields

- Moved student and coordinator ticket tracking into a responsive, accessible modal so the submission form does not distract the user during lookup and review.
- Preserved the separate tracking-only page for signed email links.
- Replaced Student Support study-centre select menus with single-choice checkbox lists and added assisted-submission centre validation.
- Added optional middle-name fields and separate first-name and surname fields to every active person-name entry workflow.
- Stored structured name parts while preserving combined display names and compatibility with older records and API clients.
- Expanded portal contract and integration checks for the new fields, modal and validation rules.

## 41.0.0 assignment, decision and redirection audit

- Converted staff-assignment failures into readable inline reasons and added a protected server-side failure response.
- Recorded assignment colour transitions and exposed click-to-open resolution and final-decision narratives.
- Synchronized final decisions to green across Student Support, responsible-unit, student tracking and downloadable registers.
- Corrected Student Support reassignment to act on the current responsible office rather than its oversight copy.
- Retained redirected cases in the former unit as read-only records with destination, date, officer and reason.
- Expanded complaint and request exports with redirection and decision history.

## 40.0.0 automatic staff account activation

- Creates a permanent Officer account automatically when a complaint or request is first assigned to a new institutional email.
- Sends one activation-and-assignment email without a temporary password.
- Signs the staff member in after password creation and opens the assigned case directly.
- Reuses active accounts for later assignments and blocks automatic reactivation of suspended accounts.

## 39.0.0 secure assignments and Directorate monitoring

- Protected emailed staff assignments with account authentication and email-to-assignment matching.
- Added production CSP, HSTS, cache prevention and indexing prevention for sensitive assignment pages.
- Expanded both Directorate dashboards and downloadable reports to all non-confidential complaints and requests.
- Replaced the unrelated deployment instructions with the correct Render and browser-warning recovery guide.

## 2.9.0 guided human supervisory review

- Reviews a complete thesis one chapter at a time and pauses after each chapter for an explicit user Continue action.
- Saves each chapter report and annotation bundle independently, allowing the supervisor to leave and return later.
- Reuses earlier chapters and the common reference list for alignment in later chapter reviews.
- Assembles a final whole-thesis result after the last chapter and consolidates repeated cross-chapter findings.
- Adds semantic document zones for preliminary pages, TOC, lists, acronyms, main work, references and appendices.
- Applies human-sized comment budgets by review depth and retains grouped lower-priority issues outside margin comments.
- Accepts model-estimated effects for regression-class analyses, SEM, PLS-SEM, mediation and moderation while checking explicit causal claims separately.
- Adds guided workflow state, continuation API, portal actions and durable migration columns.

## 2.8.1 bounded final-audit recovery

- Caps paid final-audit batches for chapters, chapter ranges and complete theses.
- Routes final comment verification directly to GPT-5.6 Terra with degree-calibrated reasoning.
- Splits only a truncated audit batch into smaller focused retries and prevents full-batch fallback loops.
- Prioritises statistical, validity, methods and other high-risk findings when the bounded audit is selected.
- Advances visible progress during checkpointed audit batches instead of leaving active work at 68 percent.
- Preserves lower-risk findings through deterministic evidence gates when they are outside the paid audit cap.

## 2.8.0 long-thesis architecture update

- Routes cleaning and routine coverage to GPT-5.6 Luna at low or medium effort.
- Routes high-risk research sections, final synthesis and external adjudication selectively to GPT-5.6 Terra.
- Runs high-effort Responses API requests in background mode with bounded polling.
- Adds stable prompt-cache keys for repeated system instructions and schemas.
- Removes the browser's false two-hour terminal failure and keeps reconnecting to durable jobs.
- Increases bounded packet concurrency and reduces large coverage packets to 24,000 characters.
- Supports two independent thesis jobs per worker without selecting the same queued job twice.
- Adds optional S3-compatible storage for uploads, checkpoints and generated documents, with PostgreSQL fallback.
- Streams upload reads in bounded chunks and expands the recoverable AI stage to six hours.

## 2.8.0

- Suppresses non-actionable confirmations such as “no action needed” from the numbered correction register.
- Rejects heading-only section-boundary claims when the document structure contradicts them.
- Consolidates repeated background, problem-gap, significance, construct and scope findings before numbering.
- Removes unrelated cross-section instructions accidentally spliced into student-facing actions.
- Calibrates severity so contextual and presentation weaknesses are not labelled Critical without a validity-blocking reason.
- Preserves exact study-specific diagnoses while replacing only generic or excessively long assessments and actions.
- Uses concise natural supervisory comments, retaining issue labels only where they add essential alignment, validity, citation or editorial scope.
- Prefers substantive paragraph evidence over section headings for annotation anchoring.
- Ranks alignment, validity, ethics, methodology and analytical defects ahead of contextual and editorial matters in priority summaries.
- Changes native and inline export checkpoint identifiers so retained jobs can regenerate quality-gated annotations without another provider call.


## 2.7.4
- Added lossless inline-annotation reconciliation for canonical findings omitted during grouped export.
- Preserves completed academic checkpoints and retries only the DOCX export stage.
- Clean deployment package removes historical reports, duplicate legacy modules, test files and obsolete environment examples.

## 2.7.1
- Generates native and inline annotated DOCX files as one atomic delivery bundle.
- Validates current V-Professor comments separately from comments already present in the uploaded source.
- Persists inline annotated documents in file or database-backed artifact storage.
- Blocks completion when any final finding number is absent from either annotated output.
- Prevents the supervisory report from claiming annotations were attached when artifact validation failed.
- Keeps annotated download buttons available when the saved source permits safe regeneration.
- Prevents final presentation filters from silently dropping a canonical finding whose quoted source fragment ends near a citation boundary.
- Retries document-export failures from saved academic checkpoints instead of describing the retry as a new paid expert pass.
- Verified recovery against a DOCX containing existing source comments: all final finding numbers were represented in both native and inline outputs.


## 2.7.0

- Added exact substantive-paragraph anchoring ahead of section-heading anchoring.
- Limited student-facing native comments to focused natural prose of no more than three complete sentences.
- Consolidated overlapping construct-definition, background-progression, problem-gap and scope findings before numbering.
- Added strict canonical-ledger to native-comment reconciliation and blocked inconsistent exports.
- Removed empty source comments and added cautious addressed-status labelling for visibly restored sections.
- Added generic limitations-consequence and unsupported-absolute-claim audits.
- Preserved evidence-locked deterministic findings during AI consolidation.
- Suppressed weak findings based only on concise organisation-of-study descriptions.
- Added tests preventing benchmark-specific names, locations and constructs from entering production rules.
- Updated pipeline and export checkpoint identifiers to 2.7.0.

## 2.6.1

- Added a controlled one-time administrator password reset using `VPROF_RESET_ADMIN_PASSWORD_ON_STARTUP=true`.
- Added explicit startup diagnostics explaining that `ADMIN_PASSWORD` is bootstrap-only when an administrator already exists.
- Added `scripts/reset_admin_password.py` for trusted Render Shell recovery without printing the secret.
- Added administrator environment variables to `render.yaml` and documented the safe reset sequence.
- Added tests preventing silent password overwrite during ordinary restarts.

## 2.6.0
- Final generic release hardening, natural-comment cleanup, mandatory-section evidence gate and duplicate-family consolidation.

# V-Professor 2.5.0

## Current-submission isolation and generic review rules

- Treats every reviewed work and benchmark as job-local evidence rather than a reusable template.
- Removes sample, learned-rule, prior-submission and cross-job context fields before AI calls and final release.
- Adds provider prompt locks against persisting example names, institutions, settings, constructs or weaknesses.
- Replaces sample-specific production rules with generic document-derived setting, population, construct and alignment checks.
- Preserves verified section-contract findings while suppressing heuristic false missing-section and hypothesis findings.
- Consolidates duplicate root causes before numbering and reconciles only current V-Professor comments.
- Labels older source-document comments separately.
- Keeps natural student-facing comments concise and free of mechanical field headings.

## Validation

- 358 automated tests passed from a clean environment.
- Python compilation, JavaScript syntax, Render YAML, duplicate environment-key and secret scans passed.
- Production code contains no names, institutions or locations from the example documents used for quality evaluation.

# V-Professor 2.4.0

## Natural comments and final accuracy control

- Replaced visible comment subsections with connected, natural supervisory prose.
- Grouped all released findings tied to the same paragraph into one numbered native comment.
- Added native-comment reconciliation so every released finding number is represented before export.
- Added whole-section contradiction checks for chapter headings, introductions, objectives, significance and limitations.
- Corrected British/American spelling evidence and removed invented spelling support.
- Added detection of title-purpose claim drift, study-setting drift and modal-verb errors in research questions.
- Consolidated repeated background, problem-gap, significance, terminology and purpose-alignment findings.
- Increased grouped-comment capacity so consolidated actions are not silently truncated.
- Retained provider selection, compact DeepSeek packets and single-target truncation recovery.

## Validation

- 352 automated tests passed.
- The supplied 32-finding benchmark was reduced to 10 distinct, evidence-supported corrections after contradiction filtering and consolidation.

# V-Professor 2.3.2

## DeepSeek length-recovery and cost-control hotfix

- Uses one compact coverage unit per DeepSeek request.
- Limits prose units to three target paragraphs and table units to four rows.
- Uses a compact DeepSeek primary schema with short evidence-grounded actions.
- Does not repeat the same truncated academic packet at a larger budget.
- Splits a truncated unit into one-target recovery requests and merges them into the original canonical coverage record.
- Continues with grounded deterministic findings and an explicit unresolved-coverage flag when an isolated target still cannot be recovered.
- Keeps bounded audit retry behaviour for non-primary audit requests.
- Introduces new checkpoint identifiers so cut-off 2.3.1 responses are not reused.

# V-Professor 2.3.1

## DeepSeek truncation recovery

- Reduced DeepSeek primary review packets to two coverage units, one high-risk unit and 18,000 characters by default.
- Disabled hidden thinking for strict-JSON chapter packets while retaining it for bounded final audits.
- Added one adaptive truncation retry that increases the completion allowance, disables thinking and requests compact schema-compliant JSON.
- Allowed a failed all-DeepSeek first pass to continue into smaller packet recovery instead of stopping immediately.
- Kept non-truncation structured-output failures fail-fast for Light and Standard review to avoid repeated paid full passes.
- Added separate DeepSeek environment controls for primary thinking, audit thinking, output ceiling and packet size.

## Review accuracy

- Added research-design routing for primary quantitative, primary qualitative, mixed-methods, secondary/econometric, experimental and systematic-review studies.
- Added submission-stage gating so Chapters One to Three do not receive results-reporting or moderation-results findings.
- Added whole-section contradiction checks before claiming that background logic, research gaps, professional significance, theory links, population frames, sampling justification, software or chapter organisation are missing.
- Reframed premature moderation-result comments as an objective-framework-method alignment issue.
- Removed questionnaire-study contamination from systematic-review checklists.
- Consolidated repeated purpose-alignment, conceptual-framework, regression-protocol, ethical-access and numerical-source findings using safe anchor or section scopes.
- Reordered native comments so the action required is retained before longer explanatory text.
- Preserved section and table labels in grouped native comments.
- Prevented section-only uploads from generating unsupported whole-chapter population conflicts.

## Provider choice

- Added `VPROF_PRIMARY_PROVIDER=openai|deepseek|auto`.
- Added `VPROF_FALLBACK_PROVIDER=none|openai|deepseek|auto`.
- Added `VPROF_PROVIDER_FAILOVER=true|false`.
- Added DeepSeek V4 Pro and V4 Flash defaults, thinking controls and model-specific cost accounting.
- Explicit provider selection overrides the combined OpenAI pipeline.

## Validation

- 345 automated tests passed from a clean test environment.
- Python compilation passed.
- Provider-selection, wrong-design, wrong-stage, false-positive, exact-anchor grouping and table-reference regression tests passed.
# v2.2.0, final exact-anchor and cost-efficient professional review

## Quality corrections

- Added revision-visible DOCX extraction so tracked insertions can be reviewed instead of silently disappearing from parsed text.
- Added direct detection of unresolved supervisor instructions, incomplete citation fragments, excessive historical background, unnamed single-firm settings and recurring sentence-level errors.
- Corrected chapter detection so an organisation-of-study sentence beginning with “Chapter two…” does not create a false second chapter.
- Strengthened evidence-grounded checks for local problem evidence, research gaps, construct consistency, purpose-objective-question alignment, causal claim strength and limitation-versus-delimitation.
- Added issue-specific completion verification for citations, statistics, language, scope, alignment, causal claims, gaps, constructs and contributions.
- Consolidated only genuine duplicate root causes. Different sentence anchors and different statistical defects remain separate.
- Grouped findings sharing the same exact sentence or paragraph into one numerically ordered native Word comment box.
- Shortened inline comments to the issue and immediate action while retaining full detail in native comments and the appended report.
- Ensured the native, inline and report outputs reuse one final numbered ledger.

## Cost corrections

- Replaced universal second-pass auditing with risk-selected paid auditing.
- Limited Standard chapter review to one compact paid accuracy-audit batch.
- Kept routine and final Standard synthesis on GPT-5.6 Terra.
- Reserved GPT-5.6 Sol for PhD final synthesis, external-examiner adjudication and selective Advanced escalation.
- Reduced routine output-token ceilings and increased safe section batching.
- Retained deterministic evidence, placement and public-language gates for findings that do not require a second paid model call.

## Stability

- Retained bounded truncation recovery without falsely disabling the OpenAI provider.
- Updated pipeline and checkpoint identifiers to prevent reuse of incomplete earlier-stage outputs.
- Added final release regression tests for tracked text, chapter detection, known Chapter One defects, canonical numbering, exact-anchor grouping, concise inline annotations and cost-aware routing.

# v2.1.1, provider recovery and audit stability hotfix

- Fixed the `submission_scope` interface mismatch that crashed deterministic expert checks.
- Prevented output truncation and schema errors from opening the provider circuit.
- Split comment-accuracy audits into token-safe batches.

# v2.1.0, evidence-grounded professional supervisory review

- Introduced the canonical evidence ledger, scope-aware review rules and exact source anchoring.
- Added positive grounding validation and ArticleReady-style action reporting.

## 2.7.2

- Fixed loss of canonical finding numbers during grouped native-comment export.
- Added non-lossy final reconciliation comments for unrepresented findings.
- Added export-stage-specific recovery guidance that does not request API-key checks.
