# Skin & Hair Analyzer — Setup

Next.js 15 (App Router) · MySQL (Prisma) · Face++ (skin) · mobile-first.

Two modes share one pipeline: **Face** (skin, wired to Face++) and **Hair**
(not wired yet — runs on mock).

## Local development

```bash
npm install
cp .env.example .env          # then fill in the values
npx prisma generate
# Once DATABASE_URL points at a live MySQL DB:
npx prisma migrate dev --name init
npm run dev                   # http://localhost:3000
```

The whole app is behind a passcode gate. Set `APP_PASSCODE` and `GATE_SECRET`
in `.env`, then enter the passcode on `/unlock`. For real skin analysis, set
`FACEPP_API_KEY` / `FACEPP_API_SECRET`. Without a provider, set
`ANALYZER_MOCK=true` to exercise the flows on canned data.

> **Node version:** use Node **20.19+** (or 22.12+). 20.11 works for the app but
> the latest Prisma/ESLint require 20.19+. The VPS should run Node 20 LTS latest.

> **Windows note:** don't run `npm run build` while `npm run dev` is running —
> they share `.next` and corrupt each other (symptom: 500s with
> `routes-manifest.json` ENOENT). Fix: stop dev, delete `.next`, restart.

## Phase 0 — infrastructure checklist (provision before deploy)

- [ ] **DNS** — point a subdomain (e.g. `skin.madenkorea.com`) at the VPS.
- [ ] **VPS packages** — Node 20 LTS, MySQL 8, Nginx, certbot.
- [ ] **MySQL** — create DB + least-privilege app user:
      ```sql
      CREATE DATABASE skin_analyzer CHARACTER SET utf8mb4;
      CREATE USER 'skin'@'localhost' IDENTIFIED BY '<password>';
      GRANT ALL PRIVILEGES ON skin_analyzer.* TO 'skin'@'localhost';
      ```
- [ ] **Face++** — create an account, get **API Key + API Secret**, confirm
      **Detect** and **Skin Analyze** access; put them in `.env`.
- [ ] **.env** — fill every value; generate a strong `GATE_SECRET`.

> **No S3 needed.** Images go straight to Face++ as base64 and are never stored
> by us (Face++ doesn't retain them either). The S3 helper remains in the repo
> but is unused.

## Deploy (VPS)

```bash
npm ci
npx prisma migrate deploy
npm run build
# Run with PM2 (or a systemd unit):
pm2 start "npm run start" --name skin-analyzer
```

Put Nginx in front as a reverse proxy to `127.0.0.1:3000` and terminate TLS with
certbot (Let's Encrypt). See `docs/PHASE-0-INFRASTRUCTURE.md` for the full runbook.

## Status

- **Phases 1–4 (done):** scaffold, passcode gate, capture → result flow, sharp
  (orient/downscale/strip EXIF), persistence (Prisma), per-IP rate limit,
  severity-band UI.
- **Skin (Face++) — done & verified:** Detect (face presence + quality gate) →
  Skin Analyze → parsed concerns. Needs `FACEPP_API_KEY` / `FACEPP_API_SECRET`.
- **Hair — not wired (mock).** Face++ has no hair analysis; wiring hair would
  need Perfect Corp (4 features, front selfie, pricier) or another provider.
- **Phase 5 (after):** madenkorea redirect handoff + signed result post-back.

> The analyze route degrades gracefully: with no provider/DB env it runs on mock
> data (`ANALYZER_MOCK=true`). Real `.env` values switch each part on with no
> code change.
>
> **Severity caveat:** basic Face++ Skin Analyze returns presence + confidence
> (not clinical severity), so the Clear/Mild/Moderate/Severe band reflects
> detection confidence. Face++ Skin Analyze Advanced/Pro would give true severity.
