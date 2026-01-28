const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'tasktracker-secret-change-this';
const DB_FILE = 'tasktracker.db';

let db;

// Initialize Database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_FILE)) {
    const buffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium',
      position INTEGER DEFAULT 0,
      assignee TEXT,
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )
  `);
  
  // Create default admin user if not exists
  const adminExists = db.exec("SELECT * FROM users WHERE username = 'admin'");
  if (adminExists.length === 0 || adminExists[0].values.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
    console.log('✓ Default admin created: admin / admin123');
    saveDatabase();
  }
  
  // Create default lists if none exist
  const listCount = db.exec("SELECT COUNT(*) as count FROM lists");
  if (listCount.length === 0 || listCount[0].values.length === 0 || listCount[0].values[0][0] === 0) {
    db.run("INSERT INTO lists (name, position) VALUES (?, ?)", ['To Do', 0]);
    db.run("INSERT INTO lists (name, position) VALUES (?, ?)", ['In Progress', 1]);
    db.run("INSERT INTO lists (name, position) VALUES (?, ?)", ['Done', 2]);
    console.log('✓ Default lists created');
    saveDatabase();
  }
  
  console.log('✓ Database initialized');
  
  // Add Goal lists
  ensureGoalLists();
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

function runQuery(sql, params = []) {
  try {
    db.run(sql, params);
    saveDatabase();
    return { success: true };
  } catch (err) {
    console.error('Query error:', err);
    return { success: false, error: err.message };
  }
}

function getOne(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (err) {
    console.error('Query error:', err);
    return null;
  }
}

function getAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('Query error:', err);
    return [];
  }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Basic Auth middleware (for deployment protection)
// ⚠️ WARNING: This can interfere with session auth. Disable or configure carefully.
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;

if (BASIC_AUTH_USER && BASIC_AUTH_PASS) {
  app.use((req, res, next) => {
    // Skip Basic Auth for login/logout endpoints (they use session auth)
    if (req.path === '/api/login' || req.path === '/api/logout') {
      return next();
    }
    const authHeader = req.headers.authorization;
      if (authHeader) {
        const base64 = authHeader.replace('Basic ', '');
        const decoded = Buffer.from(base64, 'base64').toString('utf8');
        const [user, pass] = decoded.split(':');
        if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) {
          return next();
        }
      }
      res.set('WWW-Authenticate', 'Basic realm="TaskTracker"');
      return res.status(401).send('Authentication required');
    }
    next();
  });
}

// Auth Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = getOne("SELECT * FROM users WHERE username = ?", [username]);
  
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = { id: user.id, username: user.username };
    res.json({ success: true, user: { id: user.id, username: user.username } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.json({ user: null });
  }
});

// API Routes - Lists
app.get('/api/lists', requireAuth, (req, res) => {
  const lists = getAll("SELECT * FROM lists ORDER BY position");
  res.json(lists);
});

app.post('/api/lists', requireAuth, (req, res) => {
  const { name } = req.body;
  const maxPos = getOne("SELECT MAX(position) as max FROM lists");
  const position = (maxPos?.max || 0) + 1;
  
  runQuery("INSERT INTO lists (name, position) VALUES (?, ?)", [name, position]);
  const list = getOne("SELECT * FROM lists WHERE id = (SELECT last_insert_rowid())");
  io.emit('list:created', list);
  res.json(list);
});

app.put('/api/lists/:id', requireAuth, (req, res) => {
  const { name, position } = req.body;
  runQuery("UPDATE lists SET name = ?, position = ? WHERE id = ?", [name, position, req.params.id]);
  const list = getOne("SELECT * FROM lists WHERE id = ?", [req.params.id]);
  io.emit('list:updated', list);
  res.json(list);
});

app.delete('/api/lists/:id', requireAuth, (req, res) => {
  runQuery("DELETE FROM lists WHERE id = ?", [req.params.id]);
  io.emit('list:deleted', req.params.id);
  res.json({ success: true });
});

// API Routes - Cards
app.get('/api/cards', requireAuth, (req, res) => {
  const cards = getAll(`
    SELECT c.*,
      (SELECT COUNT(*) FROM comments WHERE card_id = c.id) as comment_count
    FROM cards c
    ORDER BY c.list_id, c.position
  `);
  res.json(cards);
});

app.post('/api/cards', requireAuth, (req, res) => {
  const { list_id, title, description, priority, assignee, due_date } = req.body;
  
  const maxPos = getOne("SELECT MAX(position) as max FROM cards WHERE list_id = ?", [list_id]);
  const position = (maxPos?.max || 0) + 1;
  
  runQuery(`
    INSERT INTO cards (list_id, title, description, priority, assignee, due_date, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [list_id, title, description || '', priority || 'medium', assignee, due_date, position]);
  
  const card = getOne(`
    SELECT c.*,
      (SELECT COUNT(*) FROM comments WHERE card_id = c.id) as comment_count
    FROM cards c WHERE c.id = (SELECT last_insert_rowid())
  `);
  io.emit('card:created', card);
  res.json(card);
});

app.put('/api/cards/:id', requireAuth, (req, res) => {
  const { list_id, title, description, priority, assignee, due_date, position } = req.body;
  
  runQuery(`
    UPDATE cards 
    SET list_id = ?, title = ?, description = ?, priority = ?, assignee = ?, due_date = ?, position = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [list_id, title, description || '', priority || 'medium', assignee, due_date, position, req.params.id]);
  
  const card = getOne(`
    SELECT c.*,
      (SELECT COUNT(*) FROM comments WHERE card_id = c.id) as comment_count
    FROM cards c WHERE c.id = ?
  `, [req.params.id]);
  
  io.emit('card:updated', card);
  res.json(card);
});

app.put('/api/cards/:id/move', requireAuth, (req, res) => {
  const { list_id, position } = req.body;
  
  runQuery('UPDATE cards SET list_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [list_id, position, req.params.id]);
  
  const card = getOne(`
    SELECT c.*,
      (SELECT COUNT(*) FROM comments WHERE card_id = c.id) as comment_count
    FROM cards c WHERE c.id = ?
  `, [req.params.id]);
  
  io.emit('card:updated', card);
  res.json(card);
});

app.delete('/api/cards/:id', requireAuth, (req, res) => {
  runQuery('DELETE FROM cards WHERE id = ?', [req.params.id]);
  io.emit('card:deleted', req.params.id);
  res.json({ success: true });
});

// Comments
app.get('/api/cards/:id/comments', requireAuth, (req, res) => {
  const comments = getAll("SELECT * FROM comments WHERE card_id = ? ORDER BY created_at", [req.params.id]);
  res.json(comments);
});

app.post('/api/cards/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  const author = req.session.user.username;
  
  runQuery('INSERT INTO comments (card_id, author, content) VALUES (?, ?, ?)',
    [req.params.id, author, content]);
  
  const comment = getOne("SELECT * FROM comments WHERE id = (SELECT last_insert_rowid())");
  io.emit('comment:created', comment);
  res.json(comment);
});

// Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
initDatabase().then(() => {
  // Run migrations to ensure Goal lists exist
  runMigrations();
  
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                ║
║   🗂️  TaskTracker Running!                       ║
║                                                ║
║   Local:   http://localhost:${PORT}                  ║
║                                                ║
║   Credentials:                                    ║
║   Username: admin                                 ║
║   Password: admin123                             ║
║                                                ║
║   ⚠️  Change password after first login!         ║
║                                                ║
╚═══════════════════════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// DEBUG ENDPOINT - Remove in production
app.get('/api/debug/all', (req, res) => {
  try {
    const lists = getAll("SELECT * FROM lists ORDER BY position");
    const cards = getAll("SELECT c.*, l.name as list_name FROM cards c JOIN lists l ON c.list_id = l.id ORDER BY c.list_id, c.position");
    res.json({ lists, cards, count: { lists: lists.length, cards: cards.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Goal lists if not exist
function ensureGoalLists() {
  try {
    const goal1 = db.exec("SELECT * FROM lists WHERE name LIKE '%Goal 1%'");
    if (goal1.length === 0 || goal1[0].values.length === 0) {
      console.log('✓ Adding Goal lists...');
      
      const goalLists = [
        { name: '🎯 Goal 1: Financial Research', position: 1 },
        { name: '🚀 Goal 2: Shopping App', position: 2 },
        { name: '📺 Goal 3: YouTube Channel', position: 3 },
        { name: '🛠️ Goal 4: Personal Tools', position: 4 }
      ];
      
      for (const list of goalLists) {
        db.run('INSERT INTO lists (name, position) VALUES (?, ?)', [list.name, list.position]);
      }
      
      // Get list IDs and add cards
      const listResults = db.exec("SELECT id, name FROM lists WHERE name LIKE 'Goal%' ORDER BY position");
      if (listResults.length > 0) {
        const listData = listResults[0].values;
        const listMap = {};
        listData.forEach(([id, name]) => { listMap[name] = id; });
        
        // Goal 1 Cards
        if (listMap['🎯 Goal 1: Financial Research']) {
          const g1 = listMap['🎯 Goal 1: Financial Research'];
          const g1Cards = [
            ['Daily Market Research', 'Pull NIFTY 50 summary, track US stocks', 'high'],
            ['Screener.in Analysis', 'Research Indian companies, quarterly results', 'high'],
            ['US Stock Tracking', 'Monitor 14 stocks in watchlist', 'medium'],
            ['Portfolio Review', 'Weekly portfolio performance check', 'medium']
          ];
          g1Cards.forEach((c, i) => db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)', [g1, c[0], c[1], c[2], i + 1]));
        }
        
        // Goal 2 Cards
        if (listMap['🚀 Goal 2: Shopping App']) {
          const g2 = listMap['🚀 Goal 2: Shopping App'];
          const g2Cards = [
            ['Define App Scope', 'Outline core features for shopping assistant', 'high'],
            ['Tech Stack Selection', 'Choose frontend/backend/DB', 'medium'],
            ['MVP Planning', 'Define minimum viable product', 'medium']
          ];
          g2Cards.forEach((c, i) => db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)', [g2, c[0], c[1], c[2], i + 1]));
        }
        
        // Goal 3 Cards
        if (listMap['📺 Goal 3: YouTube Channel']) {
          const g3 = listMap['📺 Goal 3: YouTube Channel'];
          const g3Cards = [
            ['ElevenLabs Setup', 'Configure AI voice for videos', 'high'],
            ['Content Script Engine', 'Build AI script generator', 'high'],
            ['First Video Script', 'Draft script for pilot video', 'medium'],
            ['Video Production', 'Create first YouTube video', 'medium']
          ];
          g3Cards.forEach((c, i) => db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)', [g3, c[0], c[1], c[2], i + 1]));
        }
        
        // Goal 4 Cards
        if (listMap['🛠️ Goal 4: Personal Tools']) {
          const g4 = listMap['🛠️ Goal 4: Personal Tools'];
          db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)', 
            [g4, 'TaskTracker Deployed', 'Kanban board for task management', 'low', 1]);
        }
        
        saveDatabase();
        console.log('✓ Goal lists and tasks added');
      }
    }
  } catch (e) {
    console.error('Error adding Goal lists:', e.message);
  }
}

// Call after initDatabase

// Migration: Add Goal lists to any existing database
function runMigrations() {
  try {
    console.log('🔄 Running migrations...');
    
    // Check and add each Goal list individually
    const goalLists = [
      { name: '🎯 Goal 1: Financial Research', cards: [
        ['Daily Market Research', 'Pull NIFTY 50 summary, track US stocks', 'high'],
        ['Screener.in Analysis', 'Research Indian companies, quarterly results', 'high'],
        ['US Stock Tracking', 'Monitor 14 stocks in watchlist', 'medium'],
        ['Portfolio Review', 'Weekly portfolio performance check', 'medium']
      ]},
      { name: '🚀 Goal 2: Shopping App', cards: [
        ['Define App Scope', 'Outline core features for shopping assistant', 'high'],
        ['Tech Stack Selection', 'Choose frontend/backend/DB', 'medium'],
        ['MVP Planning', 'Define minimum viable product', 'medium']
      ]},
      { name: '📺 Goal 3: YouTube Channel', cards: [
        ['ElevenLabs Setup', 'Configure AI voice for videos', 'high'],
        ['Content Script Engine', 'Build AI script generator', 'high'],
        ['First Video Script', 'Draft script for pilot video', 'medium'],
        ['Video Production', 'Create first YouTube video', 'medium']
      ]},
      { name: '🛠️ Goal 4: Personal Tools', cards: [
        ['TaskTracker Deployed', 'Kanban board for task management', 'low']
      ]}
    ];
    
    for (const goal of goalLists) {
      // Check if list exists
      const listExists = db.exec("SELECT id FROM lists WHERE name = ?", [goal.name]);
      
      let listId;
      if (listExists.length === 0 || listExists[0].values.length === 0) {
        // Add list
        db.run('INSERT INTO lists (name, position) VALUES (?, ?)', [goal.name, goalLists.indexOf(goal) + 1]);
        listId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
        console.log(`✓ Added list: ${goal.name}`);
      } else {
        listId = listExists[0].values[0][0];
        console.log(`✓ List exists: ${goal.name}`);
      }
      
      // Check if cards exist for this list
      const cardsExist = db.exec("SELECT COUNT(*) as count FROM cards WHERE list_id = ?", [listId]);
      const cardCount = cardsExist[0].values[0][0];
      
      if (cardCount === 0) {
        // Add cards
        for (const [i, card] of goal.cards.entries()) {
          db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)',
            [listId, card[0], card[1], card[2], i + 1]);
        }
        console.log(`✓ Added ${goal.cards.length} cards to ${goal.name}`);
      } else {
        console.log(`✓ Cards already exist for ${goal.name}`);
      }
    }
    
    saveDatabase();
    console.log('✅ Migrations complete');
  } catch (e) {
    console.error('Migration error:', e.message);
  }
}
