# FOLIO — Beta Deploy Package

> Built by Mario A. Espindola, MPA, IPMA-CP  
> Version: 0.1.0-beta  
> License: AGPL-3.0

---

## What's in this package

| File | Description |
|---|---|
| `index.html` | Landing page (cinematic hero, about Mario, contact, newsletter) |
| `auth.html` | Sign up / Sign in (invite code gate, Google/Microsoft/GitHub/Phone/Email) |
| `dashboard.html` | Vault dashboard (app shell — post-login) |
| `onboarding.html` | 5-step onboarding wizard |
| `profile.html` | Public profile page (Sarah Kim demo — @sarah-kim) |
| `discover.html` | Talent discovery page with live filters |
| `support.html` | Donations + Angel investment page |
| `admin.html` | **Admin panel** — password protected dashboard (analytics, users, content, invites, messages, newsletter) |
| `404.html` | Custom 404 page |
| `robots.txt` | SEO robots file |
| `netlify.toml` | Netlify deployment config |
| `vercel.json` | Vercel deployment config |
| `_redirects` | Netlify URL redirects |

---

## Deploy to Netlify (Recommended — 2 minutes)

### Option A: Drag & Drop (fastest)
1. Go to [app.netlify.com](https://app.netlify.com)
2. Log in or create a free account
3. Drag this entire folder onto the Netlify dashboard
4. Your site is live instantly at a `*.netlify.app` URL
5. Optionally: connect a custom domain (Settings → Domain Management)

### Option B: Git Deploy (best for ongoing updates)
1. Push this folder to a GitHub repo
2. Go to [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import from Git"
3. Select your repo
4. Build settings: leave blank (no build command needed — pure HTML)
5. Publish directory: `.` (root)
6. Deploy

---

## Deploy to Vercel

### Option A: Vercel CLI
```bash
npm install -g vercel
cd folio-deploy
vercel --prod
```

### Option B: Dashboard
1. Go to [vercel.com](https://vercel.com)
2. "Add New Project" → Import your GitHub repo
3. Framework: Other (static HTML)
4. Root directory: `.`
5. Deploy

---

## Admin Panel

Access the admin panel at `/admin` (or `/admin.html`).

**Demo credentials:**
```
Email:    admin@folio.so
Password: folio2025
```

**Change these before going live** — open `admin.html`, find:
```js
const ADMIN_EMAIL = 'admin@folio.so';
const ADMIN_PW = 'folio2025';
```
Replace with your real credentials. In production, this should hit a real auth backend.

**What the admin panel includes:**
- 📊 Dashboard — live stats, signup chart, activity feed, geo breakdown
- 📈 Analytics — profile views, AI usage, top profiles, trends
- ✏️ Content editor — edit landing page hero, bio, disclaimer, theme
- 📝 Blog/Updates — create and publish posts
- 🚀 Changelog — log releases publicly
- 👥 Users — view all beta users, search, suspend
- 🔑 Invite codes — generate, revoke, track usage
- ✉️ Messages — contact form inbox + recruiter messages
- 📧 Newsletter — subscriber list, compose + send updates
- ⚙️ Settings — feature flags, API keys, contact handles, admin credentials

---

## Beta invite codes (share with testers)

```
FOLIO-BETA      — General beta access
FOLIO-2025      — 2025 cohort
FOLIO-TEST      — Internal testing
MARIO-TEST      — Direct invites from Mario
EARLY-ACCESS    — Early adopter tier
LAUNCH-2025     — Launch cohort
BUILDER-1       — Builder community
BUILDER-2       — Builder community
```

To add more codes: open `auth.html`, find `const VALID_CODES=[...]` and add your codes.

---

## Payment handles (on support.html)

- **Cash App:** $MarioEspindola
- **Venmo:** @Mario-Espindola  
- **Zelle:** mario@folio.so

To update these: search for `MarioEspindola` in `support.html`.

---

## Customizing contact info

Search `support.html` and `index.html` for `mario@folio.so` to update the contact email.

---

## Next phase: React codebase

The full React + TypeScript + Drizzle codebase lives in `/folio` (the monorepo). This static deploy is the prototype/marketing site. The production app will be deployed separately once the backend is complete.

---

## Built with

- Pure HTML/CSS/JS (zero dependencies, no build step)
- Google Fonts (DM Serif Display, Syne, JetBrains Mono)
- Pexels free stock video (cinematic backgrounds)
- Unsplash free photography
- All open source / free-to-use assets

---

*FOLIO Beta v0.1 · Built by Mario A. Espindola, MPA, IPMA-CP*  
*"Built for the person building their career. Not for the company hiring them."*
