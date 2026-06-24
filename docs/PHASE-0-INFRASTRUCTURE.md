# Phase 0 — Infrastructure Requirements & Implementation

Provision this in parallel with app development. When it's done you'll have a
hardened Ubuntu VPS serving the app over HTTPS, a MySQL database, and Face++
API access (skin analysis). No image storage is needed — photos go straight to
Face++ and are never stored.

> Conventions: replace every `<placeholder>` with your real value. Commands
> assume Ubuntu 22.04/24.04 LTS and a non-root sudo user.

---

## 0. Requirements checklist

| # | Requirement | Notes |
|---|---|---|
| 1 | Domain + DNS access | A subdomain like `skin.madenkorea.com` |
| 2 | Ubuntu VPS | 2 vCPU / 2–4 GB RAM / 25 GB SSD is plenty for the MVP |
| 3 | SSH key access to the VPS | Disable password login (step 1) |
| 4 | Face++ account | API Key + Secret with Detect + Skin Analyze access |
| 5 | Node.js 20.19+ LTS | App + Prisma requirement |
| 6 | MySQL 8 | Local on the VPS for the MVP |

Software installed on the VPS: **Node 20 LTS, MySQL 8, Nginx, certbot, PM2, git, ufw**.

---

## 1. VPS initial setup & hardening

```bash
# As your sudo user, fresh box:
sudo apt update && sudo apt upgrade -y

# Firewall: allow SSH + HTTP/HTTPS only
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'      # 80 + 443
sudo ufw enable

# Add swap (helps `next build` on small RAM)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Harden SSH in `/etc/ssh/sshd_config` — set `PasswordAuthentication no` and
`PermitRootLogin no`, then `sudo systemctl restart ssh`. (Confirm your SSH key
works first so you don't lock yourself out.)

---

## 2. DNS

Create an **A record**: `skin` → your VPS public IP (TTL 300). Verify:

```bash
dig +short skin.madenkorea.com    # should print the VPS IP
```

Wait for it to resolve before requesting TLS in step 8.

---

## 3. Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # expect v20.19+ (NOT 20.11 — Prisma/ESLint need 20.19+)
sudo npm i -g pm2
```

---

## 4. MySQL 8

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation     # set a root password, remove test db, etc.
```

Create the database and a least-privilege app user:

```bash
sudo mysql
```
```sql
CREATE DATABASE skin_analyzer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'skin'@'localhost' IDENTIFIED BY '<strong-db-password>';
GRANT ALL PRIVILEGES ON skin_analyzer.* TO 'skin'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

This yields the connection string:
```
DATABASE_URL="mysql://skin:<strong-db-password>@localhost:3306/skin_analyzer"
```

MySQL stays bound to `localhost` (default) — it is never exposed to the internet.

---

## 5. Amazon S3 — not required

Images are sent to Face++ directly (base64) and are never stored by us, so **no
S3 bucket or IAM user is needed**. (`lib/s3.ts` remains in the repo but is
unused.) Skip to the next step.

---

## 6. Face++ API

1. Create a Face++ account and an **API Key + API Secret**.
2. Confirm access to **Detect** (`/facepp/v3/detect`) and **Skin Analyze**
   (`/facepp/v1/skinanalyze`).
3. Put them in `.env` as `FACEPP_API_KEY` / `FACEPP_API_SECRET`, and set
   `FACEPP_API_BASE` (e.g. `https://api-us.faceplusplus.com`).

> The app calls **Detect first** (face presence + quality gate) for cleaner
> output, then **Skin Analyze**. Basic Skin Analyze returns presence + confidence;
> the Advanced/Pro tier adds true severity. Free tier has low QPS — fine for a
> passcode-gated MVP; budget for paid concurrency before a wide demo.
>
> Hair analysis has no Face++ equivalent and is **not wired** (runs on mock).

---

## 7. Deploy the app

```bash
# Clone to /var/www (or wherever you keep apps)
sudo mkdir -p /var/www && sudo chown $USER /var/www
cd /var/www
git clone <your-repo-url> skin-analyzer
cd skin-analyzer

cp .env.example .env       # then fill EVERY value (see step 9)
npm ci
npx prisma migrate deploy  # creates the tables in MySQL
npm run build

# Start under PM2 and persist across reboots
pm2 start "npm run start" --name skin-analyzer
pm2 save
pm2 startup                # run the command it prints
```

The app now listens on `127.0.0.1:3000`. Nginx (next step) puts it on the internet.

> Alternative to PM2: a systemd unit (see Appendix A).

---

## 8. Nginx reverse proxy + TLS

Create `/etc/nginx/sites-available/skin-analyzer`:

```nginx
server {
    server_name skin.madenkorea.com;

    # Face photos can be a few MB; allow up to 6 MB uploads.
    client_max_body_size 6M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it and add TLS:

```bash
sudo ln -s /etc/nginx/sites-available/skin-analyzer /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d skin.madenkorea.com   # auto-configures HTTPS + redirect
```

certbot installs a renewal timer automatically. Verify: `sudo certbot renew --dry-run`.

---

## 9. Environment variables (`.env` on the VPS)

Fill in from steps 4–6. `client_max_body_size` in Nginx must be ≥ the app's 5 MB cap.

```bash
# App access (MVP passcode gate)
APP_PASSCODE=<the-passcode-you-hand-out>
GATE_SECRET=<64-hex-random>     # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Database
DATABASE_URL="mysql://skin:<db-password>@localhost:3306/skin_analyzer"

# Face++ (skin)
FACEPP_API_KEY=<api-key>
FACEPP_API_SECRET=<api-secret>
FACEPP_API_BASE=https://api-us.faceplusplus.com
# Set true to run on mock data instead of a real provider.
ANALYZER_MOCK=false

# madenkorea integration (Phase 5 — leave for MVP)
MADENKOREA_SHARED_SECRET=
INTEGRATION_ENABLED=false
```

After editing `.env`: `pm2 restart skin-analyzer --update-env`.

---

## 10. Verification checklist

- [ ] `https://skin.madenkorea.com` loads and redirects to `/unlock`
- [ ] Correct passcode unlocks; wrong passcode shows the error
- [ ] Capture → Analyze (face) returns an issue list from Face++
- [ ] `pm2 logs skin-analyzer` shows no errors
- [ ] `sudo certbot renew --dry-run` succeeds
- [ ] MySQL not reachable from outside: `nc -vz <vps-ip> 3306` from your laptop fails

---

## Appendix A — systemd unit (alternative to PM2)

`/etc/systemd/system/skin-analyzer.service`:

```ini
[Unit]
Description=Skin Analyzer (Next.js)
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/skin-analyzer
ExecStart=/usr/bin/npm run start
Environment=NODE_ENV=production
EnvironmentFile=/var/www/skin-analyzer/.env
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now skin-analyzer
```

## Appendix B — redeploy (after Phase 2/3/4/5 changes)

```bash
cd /var/www/skin-analyzer
git pull
npm ci
npx prisma migrate deploy
npm run build
pm2 restart skin-analyzer --update-env
```

## Appendix C — security notes

- **Face images are sensitive.** We never store them — the app strips EXIF/GPS
  (sharp) and sends the image to Face++, which deletes it after processing.
- **Secrets** live only in `.env` (git-ignored) on the VPS. Rotate the Face++
  keys and `GATE_SECRET` if ever exposed.
- **TLS only** — certbot forces HTTPS; the gate cookie is `Secure` in production.
- **Least privilege** — the DB user can touch only the one database.
