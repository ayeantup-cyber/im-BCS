# ByteStar — Full Deploy Guide
# Cloudflare Pages (frontend) + Render (chat server)

---

## YOUR REPO STRUCTURE

```
your-repo/
├── index.html          ← Frontend (Cloudflare Pages)
├── server.js           ← Chat server (Render)
├── package.json        ← Node dependencies
├── render.yaml         ← Render auto-deploy config
├── agent.js            ← Termux only, DO NOT deploy
├── manifest.json       ← PWA manifest (create this)
├── sw.js               ← Service worker (create this)
└── .gitignore
```

---

## STEP 1 — .gitignore

Create this file in your repo root:

```
node_modules/
.env
*.log
backups/
```

---

## STEP 2 — Push to GitHub

```bash
git init
git add .
git commit -m "feat: bytestar unified app"
git remote add origin https://github.com/YOUR_USERNAME/bytestar.git
git push -u origin main
```

---

## STEP 3 — Deploy Frontend to Cloudflare Pages

1. Go to dash.cloudflare.com → Pages → Create project
2. Connect your GitHub repo
3. Build settings:
   - Framework preset: None
   - Build command: (leave blank)
   - Build output directory: /  ← root, not /public
4. Deploy
5. Add custom domain → bytestar.yourdomain.com (or whatever subdomain)

Your frontend is live. Vault, AI, Sandbox all work immediately.

---

## STEP 4 — Deploy Chat Server to Render

1. Go to render.com → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - Name: bytestar-chat
   - Runtime: Node
   - Build command: npm install
   - Start command: node server.js
   - Plan: Free
4. Click Create Web Service
5. Wait for deploy (2-3 min)
6. Render gives you a URL like: https://bytestar-chat.onrender.com

---

## STEP 5 — Set Environment Variables on Render

In your Render dashboard → bytestar-chat → Environment:

Add this variable:
  Key:   PAGES_ORIGIN
  Value: https://bytestar.yourdomain.com

(Use your actual Cloudflare Pages URL)

Click Save → Render redeploys automatically.

---

## STEP 6 — Connect Chat in ByteStar Settings

1. Open your ByteStar URL
2. Go to ⚙️ Settings tab
3. Socket Server URL → paste your Render URL:
   https://bytestar-chat.onrender.com
4. Hit Save Settings
5. 💬 Chat tab goes green

Anyone who visits your ByteStar URL and sets the same Socket Server URL
in their Settings will be able to chat with you in real time.

---

## IMPORTANT — Render Free Tier Sleep

Render free tier spins down after 15 min of inactivity.
First message after sleep takes ~30 seconds to connect while it wakes up.

To keep it always-on (optional):
- Use UptimeRobot (free) to ping /health every 10 min
- URL: https://bytestar-chat.onrender.com/health
- This keeps Render awake for free

---

## FINAL ARCHITECTURE

```
Your browser / Brother's phone
        ↓
Cloudflare Pages (index.html)
   ⭐ Vault    → localStorage (device only)
   🤖 AI      → Anthropic API (direct from browser)
   ⌨️ Sandbox → no server needed
   💬 Chat    → Render server (always on)
        ↓
Render Web Service (server.js)
   Socket.IO broadcast
   Comet name assignment
   Always on, free tier
```

---

## OPTIONAL — Keep Termux Agent for Local Dev

agent.js still works for local development:
- proot-distro login ubuntu
- cd ~/bytestar && node agent.js
- Set Agent URL in ByteStar Settings: http://127.0.0.1:4567
- ⚡ Env button on each project connects to it
