# Certified Backbencher — expansion implementation

The original home, subject cards, navigation, colour system and CSS are preserved. New account fields and the protected reader use the existing components. HTML, CSS, JavaScript, backend and database code have separate folders.

## What is implemented

- Email/password registration and login, salted password hashing, HttpOnly sessions, CSRF checks, rate limits and password changes.
- KIIT University; BBA and BCA Years 1–3; MCA Years 1–2. Accounts are linked to a course-year. Existing material belongs to BBA Year 1. Other years display coming-soon pages and cannot buy access before material is imported.
- Private PDF storage and authenticated, server-watermarked page images. No public PDF, download endpoint or Google Drive link in the reader. Full screen and previous/next page controls.
- ₹49 membership for 30 days per verified payment. Manual renewal, no automatic debit. Server-created Razorpay orders, checkout signature verification, captured-payment verification, signed webhooks, duplicate-event protection and refund revocation.
- One 30-day Instagram trial per account, granted only after the owner verifies the submitted follow. Simply opening Instagram cannot prove a follow.
- CLI maintenance commands for colleges, courses, years, subjects, resources, hiding/restoring entries and trial review.

## Local startup

Install Node.js 24+, Python 3.10+, and Python dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Set `PYTHON` in `.env` to the absolute path of `.venv/bin/python`. Windows users should use their virtual environment's `Scripts/python.exe`.

```bash
npm run seed
node --env-file-if-exists=.env scripts/import-bundle.js /absolute/path/notes-bundle
npm start
```

Open `http://localhost:3000`. Run the backend; Live Server and GitHub Pages cannot run accounts, private notes or payments. There are no Node runtime package dependencies; SQLite is built into Node 24. Python handles PDF import and page watermarks.

The separate **Certified_Backbencher_Private_Notes.zip** contains the 26 downloaded PDFs and an import manifest. Keep it private. Importing creates 588 pages and database records. The leadership assignment is a Drive folder with presentations, not a PDF; its catalog entry remains unavailable until those files are supplied in a supported format.

## Production activation

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for persistent disk, HTTPS, payment keys, webhook configuration and backups. See [MAINTENANCE.md](docs/MAINTENANCE.md) for add/remove operations.

Configure `APP_ORIGIN`, `INSTAGRAM_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. No credentials are committed and no live payment or live deployment was performed. Use the real Instagram profile URL; the trial option stays disabled until configured.

## Protection limits

Websites cannot reliably block operating-system screenshots, screen recording, developer tools or a camera. Watermarks, access checks, no public originals, no caching and copy/print deterrents reduce casual copying. A sufficiently determined authorized reader can recover page images. This project does not claim complete DRM.

The repository's existing history contains old Drive links. After validating migration and switching the live site, make those Drive files private and remove the old public static deployment; otherwise old links bypass the new gate. Never put private PDFs, the SQLite database, `.env`, the Notes Bundle or rendered pages in this public repository.

Email/password login is implemented. Automated email verification and automated password-reset delivery are not configured; the owner must verify account ownership before using the reset CLI. Trial prevention is per normalized email/account and does not prevent someone creating multiple email accounts. Instagram follow verification is manual until a supported verification integration is supplied.

## Checks

```bash
PYTHON=/absolute/path/to/venv/bin/python npm test
```

Backend tests cover authentication, CSRF, duplicate signup, course isolation, paid-access checks, trial expiry/reuse, page protection, payment idempotency, refunds and signature tampering. Payment provider live behaviour must also be tested with your merchant test credentials before launch.
