# Certified Backbencher

The existing website now runs with a Python/Flask backend and a SQLite database. Students can register, log in and log out. Accounts save their course, year and semester. Notes remain publicly accessible, matching the original website; account information is private. The catalog supports BBA and BCA years 1–3 and MCA years 1–2. Only the supplied BBA first-year semester-one subjects/materials are seeded; other semesters honestly show an empty state until an administrator supplies them.

## Run locally

Use Python 3.12 or newer from the repository directory:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/manage.py seed
python app.py
```

Open http://127.0.0.1:8000. On Windows, activate with `.venv\Scripts\activate` instead. Opening index.html directly or serving it with VS Code Live Server will not start the backend.

## Materials migration

The separate private migration archive contains the original bytes of 26 PDFs and 12 PPTX leadership presentations from the links in the original website (38 files, approximately 43 MB). Their titles and subject/category grouping are retained. After extracting the private archive, `seed/materials/*.bin` are original documents; the accompanying JSON records store their metadata. Seeding validates document signatures, hashes their contents, and inserts the full bytes as database BLOBs. Downloads use `/api/materials/<id>` and do not require Google Drive. PPTX files download as presentations; PDF files can be viewed in the browser. Source files in Drive have not been deleted or modified.

Extract Certified_Backbencher_Materials.zip into the repository directory first. It contains `seed/materials/` and no student accounts. The study-file contents are intentionally excluded from the public code repository. Run seeding once on a new installation. It is idempotent: subsequent runs preserve accounts and existing materials. Future PDF uploads go directly into the database, with no Drive link needed.

## Administrator

First register your own account in the website. Then, on the server:

```bash
python scripts/manage.py promote-admin your-email@example.com
```

Log in with that account to see **Manage materials**. Choose a course/year/semester, add a subject, then upload a PDF to Notes, Sample Questions or Assignments. Uploads are limited to 32 MB. Students cannot grant themselves administrator status. There are no built-in passwords or default administrator accounts.

## Production hosting

A static host such as GitHub Pages cannot run this backend. Deploy the Dockerfile to a Python/container host with HTTPS and a **persistent disk** mounted at `/data`. The container uses Gunicorn, `DATABASE_PATH=/data/site.sqlite3`, and `COOKIE_SECURE=1`. Configure the host to forward requests to port 8000. For Docker, extract the private migration archive into the mounted disk so its files appear at `/data/seed/materials`. Seed before opening the website to students:

```bash
python scripts/manage.py seed --materials /data/seed/materials
```

Run this inside the container with the same `/data` mount that the web container will use. The private study files are excluded from the image build; students receive them from the database after seeding.

For a non-Docker deployment, set `DATABASE_PATH` to a persistent absolute path, set `COOKIE_SECURE=1` under HTTPS, install requirements, seed, and run:

```bash
gunicorn --bind 0.0.0.0:8000 --workers 2 --threads 4 app:app
```

SQLite requires a single host and local persistent storage. Do not run multiple replicas with independent disks. A future multi-server deployment should migrate to PostgreSQL/object storage. No live hosting account or domain change has been configured by this commit.

## Backups and security

```bash
python scripts/manage.py backup /private-backups/site.sqlite3
python -m unittest discover -s tests -v
```

Back up regularly to a private location outside the server. The database contains private accounts and sessions: never commit it to GitHub or expose it through static serving. Passwords are hashed with Werkzeug scrypt. Session cookies are HttpOnly and SameSite, and only hashed session tokens are stored. Mutations check CSRF tokens and request origin. Login/registration attempts are rate limited using SQLite. Configure the host's edge request limits as well. There is no email verification or self-service password reset yet; these need an email provider. This change does not implement the planned AI/RAG assistant.

Validation also includes a DOM integration check of the existing UI: catalog loading, PPM PDF listings, registration, logout and the MCA empty state passed without JavaScript runtime errors. A visual browser check was unavailable in the execution environment.

