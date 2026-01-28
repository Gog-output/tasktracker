const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'tasktracker.db');
const NEW_PASSWORD = process.argv[2] || 'admin123';

async function changePassword() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  
  const buffer = fs.readFileSync(DB_FILE);
  const db = new SQL.Database(buffer);
  
  const hashedPassword = bcrypt.hashSync(NEW_PASSWORD, 10);
  
  // Check if admin exists
  const admin = db.exec("SELECT * FROM users WHERE username = 'admin'");
  
  if (admin.length > 0 && admin[0].values.length > 0) {
    // Update existing admin
    db.run("UPDATE users SET password = ? WHERE username = 'admin'", [hashedPassword]);
    console.log(`✅ Password updated for 'admin' to: ${NEW_PASSWORD}`);
  } else {
    // Create new admin
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", ['admin', hashedPassword]);
    console.log(`✅ Created new admin user with password: ${NEW_PASSWORD}`);
  }
  
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
  
  console.log('\n📝 Next steps:');
  console.log('1. Commit and push to GitHub:');
  console.log('   cd /home/ubuntu/clawd/tasktracker');
  console.log('   git add tasktracker.db server.js');
  console.log('   git commit -m "Reset admin password"');
  console.log('   git push origin master');
  console.log('\n2. Redeploy on Render');
}

changePassword().catch(console.error);
