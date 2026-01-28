# 🗂️ TaskTracker

A self-hosted, password-protected Kanban task tracker.

## Features

- ✅ **Password-protected** - Only you can access
- ✅ **Kanban board** - Drag & drop cards between lists
- ✅ **Multiple lists** - Create custom lists
- ✅ **Task priorities** - High/Medium/Low
- ✅ **Assignees** - Track who does what
- ✅ **Due dates** - Never miss a deadline
- ✅ **Comments** - Collaborate on tasks
- ✅ **Real-time updates** - See changes instantly
- ✅ **Pure JavaScript** - No native dependencies
- ✅ **Mobile friendly** - Works on all devices

## Quick Start

```bash
cd /home/ubuntu/clawd/tasktracker
npm start
```

Then open: **http://localhost:3000**

## Login Credentials

```
Username: admin
Password: admin123
```

⚠️ **Change the password after first login!**

## Tech Stack

- **Backend:** Node.js + Express
- **Real-time:** Socket.io
- **Database:** SQLite (sql.js - pure JS, no native deps)
- **Sessions:** express-session
- **Auth:** bcryptjs

## Commands

```bash
# Start server
npm start

# Stop server
# Press Ctrl+C
```

## Files

```
/home/ubuntu/clawd/tasktracker/
├── server.js       # Main server
├── public/
│   └── index.html  # UI
├── tasktracker.db  # Database (auto-created)
└── README.md      # This file
```

---

**Your private Kanban board is ready! 🎯**
