# Hostinger VPS setup — Certified Backbenchers

This is the complete website, Python/Flask backend and SQLite database implementation. Use a Hostinger **VPS** with Docker and Docker Compose installed. This project cannot run by placing the files in a shared-hosting `public_html` folder.

You will run the commands below in the Hostinger VPS terminal. Hostinger's Ubuntu + Docker OS template is a suitable starting point; select it when creating a new VPS, not by reinstalling a server that already has files. Alternatively install Docker Engine and its Compose plugin using Docker's Ubuntu instructions: https://docs.docker.com/engine/install/ubuntu/.

## 1. Get the project

Either download the ZIP for the **backend-database-auth** branch and upload/extract it on your VPS, or use Git:

```bash
git clone --branch backend-database-auth https://github.com/ranjangoranga/Certified-Backbencher.git
cd Certified-Backbencher
```

Keep the full folder structure. There is no need to copy each code file individually. Run all remaining commands from this project directory.

## 2. Set the website hostname

Choose a domain or public hostname that you control, and point its DNS A record to the VPS IPv4 address. You can use a temporary hostname if its DNS points to this VPS, then switch to certifiedbackbenchers.com after buying it. Do not add an IPv6/AAAA record unless the VPS is configured to serve that address too.

Copy `deploy/hostinger.env.example` to `.env` in the project root and replace `your-domain.example` with that hostname:

```bash
cp deploy/hostinger.env.example .env
nano .env
```

Allow inbound TCP ports 80 and 443 in the Hostinger firewall for the website. Keep SSH/terminal access available. The backend port 8000 stays private to the Docker network. Caddy obtains HTTPS certificates for the configured hostname once DNS and firewall settings are correct.

If you do not yet have a domain or usable temporary hostname, you can still build the backend and import materials, but public HTTPS login should wait until the hostname is configured. The placeholder hostname is not a live website address.

## 3. Import the private study files

The public GitHub repository contains code, not the private PDFs, presentations or student data. Upload **Certified_Backbencher_Materials.zip**, previously provided in chat, to the project folder on the VPS. It contains 26 PDFs and 12 PPTX presentations, with their metadata.

```bash
mkdir -p private-materials
unzip Certified_Backbencher_Materials.zip -d private-materials
chmod -R a+rX private-materials
docker compose build app
docker compose run --rm --no-deps app python scripts/manage.py seed --materials /imports/seed/materials
```

The seed imports original file bytes directly into SQLite at `/data/site.sqlite3`. It is safe to rerun and does not overwrite accounts. Existing materials are classified as BBA year 1, semester 1. Other course/year/semester catalogs can be populated in the administrator interface.

## 4. Start the website

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=100 app proxy
```

Visit `https://` followed by the hostname you entered in `.env`. Public launch is complete only after the proxy serves HTTPS, `/api/health` returns `{"ok":true}`, registration/login/logout work, and a PDF opens/downloads correctly.

You can check the backend independently:

```bash
docker compose exec app python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health').read().decode())"
```

## 5. Enable your administrator account

Register your own account through the website first. Then replace the example email with the email you registered:

```bash
docker compose exec app python scripts/manage.py promote-admin your-email@example.com
```

Sign in to see **Manage materials**. You can add subjects for BBA, BCA and MCA, and upload new PDFs directly to the database. There is no default administrator password.

## 6. Back up the database

```bash
docker compose exec app python scripts/manage.py backup /data/backups/site.sqlite3
```

The backup above replaces the same backup filename when rerun. Use dated filenames if you want several restore points. Keep an additional copy outside the VPS in a private location. A backup contains private accounts and sessions; do not put it in GitHub.

The named volume `study_data` retains the database across app rebuilds/restarts. Do not use `docker compose down -v` during an update: it deletes the persistent volumes.

## 7. Install future GitHub changes

```bash
git pull origin backend-database-auth
docker compose up -d --build
```

To switch to certifiedbackbenchers.com later, point its DNS to this VPS, change `SITE_HOSTNAME` in `.env`, then run `docker compose up -d --force-recreate proxy`. The domain has not been purchased by these files.

## Files and responsibilities

| File | Purpose |
|---|---|
| `index.html`, `client.js` | Existing design, student login, catalog and admin interface |
| `app.py` | Backend routes, account authentication, SQLite schema and direct file downloads |
| `requirements.txt`, `Dockerfile` | Python dependencies and production app image |
| `compose.yaml`, `deploy/Caddyfile` | VPS app, HTTPS reverse proxy and persistent volumes |
| `scripts/manage.py`, `seed/subjects.json` | Private material import, administrator setup and backup |
| `tests/test_backend.py` | Authentication, upload, access control and download integration checks |

The planned AI/RAG assistant is not included yet. Email verification and self-service password reset need an email provider. This setup uses one VPS; multi-server scaling will require a database/storage architecture change.
