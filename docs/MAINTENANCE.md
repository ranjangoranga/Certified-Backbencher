# Owner maintenance manual

Run commands on your server in the project folder. Replace example numeric IDs with IDs from `list`; never assume an ID after adding more entries. Secrets and private files belong outside the public web root.

## Catalog structure

College → Course → Course year → Subjects → Resources. User accounts reference a course-year. Resources are classified as `notes`, `questions` or `assignments`. Their metadata lives in SQLite and files live in private server storage.

```bash
npm run admin -- list colleges
npm run admin -- list courses
npm run admin -- list course_years
npm run admin -- list subjects
npm run admin -- list resources
```

## Add a college, course and year

```bash
npm run admin -- add-college example-college "Example College"
npm run admin -- list colleges
# Use the new college ID below, then inspect courses for the new course ID.
npm run admin -- add-course 2 BCOM "Bachelor of Commerce"
npm run admin -- list courses
npm run admin -- add-year 4 1
npm run admin -- list course_years
```

The account dropdowns read database entries automatically. No additional HTML page is required for a new college/course/year. The same design renders each user's own subjects.

## Add a subject and notes

```bash
# YEAR_ID CODE NAME DESCRIPTION HEX_COLOUR
npm run admin -- add-subject 9 ECO "Economics" "Basic economics and markets" "#9b7cff"
npm run admin -- list subjects
# SUBJECT_ID TYPE NAME DESCRIPTION
npm run admin -- add-resource 8 notes "Economics Unit 1" "Complete revision notes"
npm run admin -- list resources
node --env-file-if-exists=.env scripts/import-note.js 28 /private/uploads/economics.pdf
```

Subject/course codes accept uppercase letters, digits, underscores and hyphens. College slugs accept lowercase letters, digits and hyphens. Importing replaces an existing resource's private pages safely after rendering succeeds. Use `add-resource` for a separate note. Do not edit browser JavaScript to add content.

## Hide and restore without deleting users

```bash
npm run admin -- hide resources 28
npm run admin -- show resources 28
npm run admin -- hide subjects 8
npm run admin -- show subjects 8
```

Supported tables: colleges, courses, course_years, subjects, resources. Hiding a parent also blocks its reader content. Existing records remain for safe restoration; avoid deleting rows referenced by accounts or orders.

## Instagram trial review

Set `INSTAGRAM_URL` to your real profile and restart the server. Students follow the profile and submit their Instagram username. Requests do not grant immediate access.

```bash
npm run admin -- trial-list
# Confirm in Instagram that the submitted username follows your account first.
npm run admin -- trial-approve 1
# Or reject a false claim:
npm run admin -- trial-reject 2
```

Approval grants 30 days starting at approval. One request/claim is permitted per account. Requests and grants are database-backed; browser storage cannot activate a trial. This cannot prevent abuse using multiple different email addresses, and it does not automatically detect unfollowing.

## Account password recovery

Check ownership of the registered email before resetting it. Use a private terminal prompt and pass the password on stdin. Never paste a password into a shell argument, ticket, GitHub issue or committed file. The `reset-password EMAIL` CLI reads stdin, replaces the hash and invalidates all sessions. Users who know their current password can change it in Account.

## Billing and price

The ₹49 price is enforced in `backend/config.js` and SQL order constraints. Payments grant 30 days, with manual renewal. To change price later, add a database migration for the order constraint and update the backend price and UI together; retain historical order amounts. Never change a price only in JavaScript.

Razorpay checkout supports UPI payment apps on compatible devices. Do not activate access based on a screenshot, browser success message, Google Pay deep link or claimed transaction number. Server signatures plus captured-payment checks are required.

## Routine operation

Run `npm run admin -- cleanup` periodically to delete expired sessions and rate-limit entries. Access expiry is enforced on each request even without cleanup. Back up both the database and private pages/PDFs. See the deployment guide for a consistent backup procedure.
