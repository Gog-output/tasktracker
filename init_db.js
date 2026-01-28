/**
 * TaskTracker Database Initialization
 * Run this on first deploy to create Goal lists with tasks
 */

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DATABASE_PATH || 'tasktracker.db';

async function initializeDatabase() {
  console.log('📦 Initializing TaskTracker Database...');
  
  const SQL = await initSqlJs();
  let db;
  
  // Load or create database
  if (fs.existsSync(DB_FILE)) {
    console.log('✓ Database exists, checking if initialized...');
    const buffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buffer);
    
    // Check if Goal lists exist
    const lists = db.exec("SELECT COUNT(*) as count FROM lists WHERE name LIKE 'Goal%'");
    if (lists[0] && lists[0].values[0][0] > 0) {
      console.log('✓ Goal lists already exist, skipping initialization');
      return;
    }
  } else {
    console.log('✓ Creating new database...');
    db = new SQL.Database();
  }
  
  // Create tables (idempotent)
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
  
  // Create admin user if not exists
  const adminExists = db.exec("SELECT * FROM users WHERE username = 'admin'");
  if (adminExists.length === 0 || adminExists[0].values.length === 0) {
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
    console.log('✓ Created admin user');
  }
  
  // Check if we need to add Goal lists
  const goal1 = db.exec("SELECT * FROM lists WHERE name LIKE '%Goal 1%'");
  if (goal1.length === 0 || goal1[0].values.length === 0) {
    console.log('✓ Adding Goal lists and tasks...');
    
    // Add Goal Lists
    const goalLists = [
      { name: '🎯 Goal 1: Financial Research', position: 1 },
      { name: '🚀 Goal 2: Shopping App', position: 2 },
      { name: '📺 Goal 3: YouTube Channel', position: 3 },
      { name: '🛠️ Goal 4: Personal Tools', position: 4 }
    ];
    
    for (const list of goalLists) {
      db.run('INSERT INTO lists (name, position) VALUES (?, ?)', [list.name, list.position]);
    }
    
    // Get list IDs
    const listResults = db.exec("SELECT id, name FROM lists WHERE name LIKE 'Goal%' ORDER BY position");
    const listData = listResults[0].values;
    const listMap = {};
    listData.forEach(([id, name]) => { listMap[name] = id; });
    
    // Goal 1 Cards
    const g1 = listMap['🎯 Goal 1: Financial Research'];
    if (g1) {
      const g1Cards = [
        { title: 'Daily Market Research', desc: 'Pull NIFTY 50 summary, track US stocks', priority: 'high' },
        { title: 'Screener.in Analysis', desc: 'Research Indian companies, quarterly results', priority: 'high' },
        { title: 'US Stock Tracking', desc: 'Monitor 14 stocks in watchlist', priority: 'medium' },
        { title: 'Portfolio Review', desc: 'Weekly portfolio performance check', priority: 'medium' }
      ];
      g1Cards.forEach((card, i) => {
        db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)',
          [g1, card.title, card.desc, card.priority, i + 1]);
      });
    }
    
    // Goal 2 Cards
    const g2 = listMap['🚀 Goal 2: Shopping App'];
    if (g2) {
      const g2Cards = [
        { title: 'Define App Scope', desc: 'Outline core features for shopping assistant', priority: 'high' },
        { title: 'Tech Stack Selection', desc: 'Choose frontend/backend/DB', priority: 'medium' },
        { title: 'MVP Planning', desc: 'Define minimum viable product', priority: 'medium' }
      ];
      g2Cards.forEach((card, i) => {
        db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)',
          [g2, card.title, card.desc, card.priority, i + 1]);
      });
    }
    
    // Goal 3 Cards
    const g3 = listMap['📺 Goal 3: YouTube Channel'];
    if (g3) {
      const g3Cards = [
        { title: 'ElevenLabs Setup', desc: 'Configure AI voice for videos', priority: 'high' },
        { title: 'Content Script Engine', desc: 'Build AI script generator', priority: 'high' },
        { title: 'First Video Script', desc: 'Draft script for pilot video', priority: 'medium' },
        { title: 'Video Production', desc: 'Create first YouTube video', priority: 'medium' }
      ];
      g3Cards.forEach((card, i) => {
        db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)',
          [g3, card.title, card.desc, card.priority, i + 1]);
      });
    }
    
    // Goal 4 Cards
    const g4 = listMap['🛠️ Goal 4: Personal Tools'];
    if (g4) {
      db.run('INSERT INTO cards (list_id, title, description, priority, position) VALUES (?, ?, ?, ?, ?)',
        [g4, 'TaskTracker Deployed', 'Kanban board for task management', 'low', 1]);
    }
    
    console.log('✓ Goal lists and tasks added');
  }
  
  // Save database
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
  
  console.log('✅ Database initialization complete!');
  console.log('');
  console.log('📋 Credentials:');
  console.log('   Username: admin');
  console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
}

// Run if called directly
if (require.main === module) {
  initializeDatabase().catch(err => {
    console.error('❌ Initialization failed:', err);
    process.exit(1);
  });
}

module.exports = { initializeDatabase };
