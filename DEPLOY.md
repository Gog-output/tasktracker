# 🗂️ TaskTracker - Deployment Guide

## Deploy to Render.com (Free)

### 1. Push to GitHub

```bash
cd /home/ubuntu/clawd/tasktracker
git init
git add .
git commit -m "Initial commit - TaskTracker"
gh repo create tasktracker --public --source=. --push
```

### 2. Deploy to Render

1. Go to https://dashboard.render.com
2. Sign up/Login with GitHub
3. Click **New +** → **Web Service**
4. Connect your GitHub repository
5. Configure:
   - **Name:** tasktracker
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free

### 3. Environment Variables (Optional)

In Render dashboard, add these for password protection:

| Variable | Value |
|----------|-------|
| `BASIC_AUTH_USER` | your-username |
| `BASIC_AUTH_PASS` | your-password |
| `SESSION_SECRET` | random-string |

### 4. Access Your App

After deployment, Render gives you a URL like:
`https://tasktracker.onrender.com`

**Login:** admin / admin123 (or your BASIC_AUTH credentials)

---

## Security Features

✅ **Password protected** via Basic Auth (if configured)
✅ **Session-based** authentication
✅ **SQLite database** (stored on disk, ephemeral on free tier)

---

## Notes

- Free tier may spin down after inactivity (cold starts)
- Database resets on each deploy (free tier)
- For persistent data, upgrade to paid plan or use external database
