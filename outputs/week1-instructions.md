# Week 1 — Full Walkthrough

Everything you need to do to take Phase 1 Week 1 from nothing to a live skeleton app at `https://league.simracing-hub.com` where you can sign in with Discord.

Estimated total time: 60–90 minutes, most of it one-time account configuration.

---

## 0. Prerequisites check

Open **Terminal** on your Mac and run:

```bash
node --version
npm --version
git --version
```

You should see Node.js 20 or higher, npm 10+, and git. If Node is missing or old, install via Homebrew:

```bash
brew install node
```

---

## 1. Run the scaffold script

The script is in your workspace outputs folder. Run it from Terminal:

```bash
bash "/Users/thomasherbrig/Library/Application Support/Claude/local-agent-mode-sessions/4f20476b-d7c7-41be-92dd-80316cf39863/0df53c3c-efef-4a90-a396-23f26e09cdf9/local_b222b9b9-ee6f-4bd4-b847-c691375bf876/outputs/week1-setup.sh"
```

This takes 2–3 minutes. It creates `~/Nextcloud/AI/league-manager/` with the full Next.js project, installs dependencies, and makes the first git commit locally.

---

## 2. Fill in real credentials

Open the project in your editor:

```bash
cd ~/Nextcloud/AI/league-manager
code .   # or: cursor .
```

Open `.env` (the file is hidden — in VS Code use the file tree sidebar, not Finder). Replace the three placeholder values:

1. **DATABASE_URL** — paste the new Neon connection string (the one you got after resetting the password). Use the "Pooled connection" variant from the Neon dashboard if offered. It should look like `postgresql://neondb_owner:NEW_PASSWORD@ep-xxx.xxx.aws.neon.tech/neondb?sslmode=require`.

2. **AUTH_DISCORD_ID** — your Discord OAuth Client ID.

3. **AUTH_DISCORD_SECRET** — your Discord OAuth Client Secret.

`AUTH_SECRET` was already generated for you by the script. Leave it.

**Save the file.**

---

## 3. Push the schema to Neon

Still in the project folder, run:

```bash
npx prisma db push
```

This creates the initial database tables (User, Account, Session, VerificationToken) in your Neon database. You should see output like "Your database is now in sync with your Prisma schema."

If you see a connection error, double-check the DATABASE_URL in `.env`.

---

## 4. Configure Discord redirect URL (local)

Before you can sign in, Discord needs to know where to send users after login.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and open your "Simracing-Hub League Manager" app.
2. Left sidebar → **OAuth2** → **Redirects** → **Add Redirect**.
3. Enter: `http://localhost:3000/api/auth/callback/discord`
4. Click **Save Changes** at the bottom.

---

## 5. Test sign-in locally

Back in Terminal, in the project folder:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see the landing page. Click **Sign in with Discord** — it takes you to Discord, you authorize, and you bounce back to the home page signed in.

Your user row is now in the Neon database. You can peek at it:

```bash
npx prisma studio
```

This opens a browser UI at localhost:5555 where you can browse the User, Account, and Session tables.

---

## 6. Create the GitHub repo

1. Go to [github.com/new](https://github.com/new).
2. Repository name: `league-manager`
3. Description: *Simracing-Hub's League Manager — iRacing league management tool*
4. Visibility: **Private** (you can make it public later).
5. **Do NOT** tick "Add a README file", "Add .gitignore", or "Add a license" — the repo needs to be empty.
6. Click **Create repository**.

Copy the SSH URL GitHub shows you (looks like `git@github.com:yourusername/league-manager.git`).

---

## 7. Push your local project to GitHub

In Terminal, inside the project folder:

```bash
git remote add origin git@github.com:yourusername/league-manager.git
git branch -M main
git push -u origin main
```

If this asks for authentication, make sure you have an SSH key set up on your Mac and registered with GitHub. If not, use the HTTPS URL instead and GitHub will ask for your password (or a personal access token).

---

## 8. Import the repo to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import from GitHub — select the `league-manager` repo.
3. Framework: Vercel auto-detects Next.js. Good.
4. **Do NOT click Deploy yet** — we need to add env vars first.
5. Expand **Environment Variables** and add these four:
   - `DATABASE_URL` — same value as in `.env`
   - `AUTH_SECRET` — same value as in `.env`
   - `AUTH_DISCORD_ID` — same value
   - `AUTH_DISCORD_SECRET` — same value
6. Now click **Deploy**.

Vercel builds and deploys in about 60–90 seconds. It assigns you a temporary URL like `league-manager-xxx.vercel.app`.

---

## 9. Add the Discord production redirect URL

Once Vercel has given you the URL, go back to [discord.com/developers/applications](https://discord.com/developers/applications) → your app → **OAuth2** → **Redirects** and add a second entry:

```
https://league.simracing-hub.com/api/auth/callback/discord
```

(You add the final production URL here now; we'll wire the DNS up in the next step.)

Save changes.

---

## 10. Add the custom domain in Vercel

1. In your Vercel project → **Settings** → **Domains**.
2. Type `league.simracing-hub.com` and click **Add**.
3. Vercel shows you the DNS record to create. It should say:
   - Type: `CNAME`
   - Name: `league`
   - Value: `cname.vercel-dns.com`

---

## 11. Add the CNAME in Cloudflare

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Select your `simracing-hub.com` site.
3. Left sidebar → **DNS** → **Records** → **Add record**.
4. Type: `CNAME`
5. Name: `league`
6. Target: `cname.vercel-dns.com`
7. **Proxy status:** click the orange cloud icon to turn it **grey** (DNS only). This is important — the orange proxy interferes with Vercel's SSL provisioning.
8. TTL: Auto
9. Click **Save**.

---

## 12. Wait and verify

Back in Vercel's Domains tab, the `league.simracing-hub.com` entry will go through "Pending" → "Valid Configuration" in 1–5 minutes. Vercel auto-issues the Let's Encrypt SSL certificate.

Then visit `https://league.simracing-hub.com`. You should see your landing page. Click **Sign in with Discord** — it should work, sign you in, and you land back on the home page signed in.

---

## Week 1 done checklist

- [ ] Local project runs at `localhost:3000` with Discord sign-in working
- [ ] Database schema pushed to Neon (User, Account, Session tables exist)
- [ ] Code pushed to GitHub `league-manager` repo
- [ ] Vercel is auto-deploying from `main` branch
- [ ] `https://league.simracing-hub.com` loads and Discord sign-in works in production
- [ ] Your user row appears in Neon (check via `npx prisma studio` or Neon's SQL editor)

Once all six boxes are ticked, Week 1 is complete and we can move to Week 2: the full schema for leagues, seasons, rounds, registrations, and teams, plus admin CRUD screens.

---

## Troubleshooting

**"Invalid OAuth redirect URI" error from Discord.**
Re-check the redirect URLs in Discord Developer Portal. They must match exactly — `http://` vs `https://`, trailing slash or not, correct domain. For local dev use `http://localhost:3000/api/auth/callback/discord`, for production use `https://league.simracing-hub.com/api/auth/callback/discord`.

**Vercel build fails with Prisma error.**
Add this to your `package.json` scripts section:
```json
"postinstall": "prisma generate"
```
Or use Vercel's build command override: `prisma generate && next build`. The scaffold should set this up correctly, but if it didn't, this is the fix.

**CNAME record not resolving after 10 minutes.**
Verify the proxy status is grey (DNS only), not orange. Cloudflare's proxy on subdomains used by third-party hosts often causes issues.

**"Auth secret not found" in production.**
Check that `AUTH_SECRET` is set in Vercel's Environment Variables for all environments (Production, Preview, Development). If you add or change an env var, trigger a new deployment by pushing a commit or using Vercel's "Redeploy" button.

**Sign-in works locally but fails on production with "redirect_uri mismatch".**
You added `localhost` but forgot to add the production URL to Discord's redirect list. See step 9.
