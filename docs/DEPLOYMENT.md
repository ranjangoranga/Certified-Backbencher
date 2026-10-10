# Deploying the Node.js application

## Required environment

Use a Node.js 24 server or Docker host with Python and a **persistent local disk**, plus an HTTPS reverse proxy. The SQLite database and private files must share one durable directory. This implementation runs as one instance; it is not a multi-region or horizontally scaled database. Ordinary PHP shared hosting and GitHub Pages do not run this backend.

1. Deploy this branch's code to the Node/Docker server.
2. Create a persistent directory owned by the service account, mode 700. Set `STORAGE_DIR` to it. Do not place it under a static website directory.
3. Set `APP_ORIGIN=https://your-domain.example`, `NODE_ENV=production`, `PORT`, `PYTHON`, the real `INSTAGRAM_URL` and payment keys in the host's secret settings.
4. Run the seed script once. It is idempotent and does not overwrite existing imported PDFs.
5. Upload the separate private Notes Bundle through a private server transfer, extract it outside the web root and run `scripts/import-bundle.js`.
6. Start `npm start`. Proxy all website and `/api/` requests to the same backend origin. The reverse proxy must overwrite forwarded headers; the app intentionally rate-limits on socket address. When a proxy aggregates clients onto one socket address, review rate limits against expected traffic.
7. Confirm `/api/health`, create a test account, approve a trial, read every imported note, and check another course-year shows coming soon.
8. Finish payment testing before enabling live keys. No deployment/paid service provisioning is included in this code change.

## Docker example

```bash
docker build -t certified-backbencher .
docker volume create certified-data
docker run --rm --env-file .env -v certified-data:/data certified-backbencher node scripts/seed.js
```

For bundle import, mount the extracted `notes-bundle` directory read-only into a temporary container and run `node scripts/import-bundle.js /notes-bundle`. For the service, use the same volume and environment with `-p 3000:3000` behind HTTPS. An `.env` for Docker must use `PYTHON=/opt/reader-python/bin/python3` and `STORAGE_DIR=/data`; ensure your environment does not overwrite them with local development paths.

## Payment setup

Create/use your merchant Razorpay account and supply API key ID/secret privately. Merchant onboarding and payment-method availability depend on the provider. This code does not create that account or bypass onboarding.

- Checkout order amount is 4900 paise, INR.
- Configure automatic payment capture in the provider dashboard.
- Webhook URL: `https://your-domain.example/api/webhook`.
- Subscribe to `payment.captured` and `refund.processed`.
- Configure a separate strong webhook secret and set the identical value in `RAZORPAY_WEBHOOK_SECRET`.
- Checkout callbacks are verified against your own server-created order. The server fetches payment state and requires `captured`, exact amount, matching order and INR before granting access.
- Signed webhooks handle late confirmations when a browser closes. Duplicate callbacks/webhooks do not grant multiple months.
- A processed refund conservatively revokes that payment's grant, including partial refunds. No refund initiation endpoint is implemented.

Test success, failure, cancellation, authorized-but-uncaptured payments, delayed webhooks, duplicate delivery and refund revocation with test keys. Live Google Pay checkout has not been exercised here because real merchant credentials were not supplied.

## Backups and scaling

Stop the server briefly, copy the SQLite database and the complete private `pdfs/` and `pages/` directories together, then restart. Encrypt backups, store them privately and test restoration. Never ZIP a live database while importing or writing payments without a consistent database snapshot procedure.

Use a persistent local filesystem with SQLite locking support. Do not use ephemeral deploy storage or shared network filesystems. For several instances, migrate the catalog/accounts/billing database to PostgreSQL, use private object storage for content and a shared rate limiter; do not run several containers against a SQLite volume.

## Existing public links

After importing and validating all content, revoke public sharing on the old Google Drive files and switch off the previous static deployment. Old GitHub history contains those URLs. Leaving their Drive sharing public bypasses any new membership gate. The application does not change your Drive permissions automatically.

## Operational scope

Automated email verification, transactional email password resets, self-service account deletion, a graphical admin portal and high-volume distributed rate limiting are future extensions. The implemented owner CLI covers catalog maintenance and verified trial review. Do not advertise automatic Instagram verification or screenshot-proof DRM.
