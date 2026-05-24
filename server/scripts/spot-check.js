const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');

const SQLITE_PATH = path.resolve(__dirname, '..', 'database', 'app.db');

function hash(s) {
  return crypto.createHash('sha1').update(String(s ?? '')).digest('hex').slice(0, 10);
}

(async () => {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const conn = await mysql.createConnection({
    host: '139.186.174.125', port: 3306,
    user: 'qq_helper', password: 'd2eWjYeaPbbtRAjX',
    database: 'qq_helper', charset: 'utf8mb4',
  });

  // Check users
  console.log('--- users ---');
  const sUsers = sqlite.prepare('SELECT id, username, email, password_hash FROM users ORDER BY id').all();
  const [mUsers] = await conn.query('SELECT id, username, email, password_hash FROM users ORDER BY id');
  for (let i = 0; i < sUsers.length; i++) {
    const s = sUsers[i], m = mUsers[i];
    const ok = s.username === m.username && s.email === m.email && s.password_hash === m.password_hash;
    console.log(`  id=${s.id} ${s.username}: ${ok ? 'OK' : 'DIFF'} (pwhash=${hash(s.password_hash)})`);
  }

  // Check ai_providers (encrypted api keys)
  console.log('--- ai_providers ---');
  const sProv = sqlite.prepare('SELECT id, name, provider, api_key FROM ai_providers ORDER BY id').all();
  const [mProv] = await conn.query('SELECT id, name, provider, api_key FROM ai_providers ORDER BY id');
  for (let i = 0; i < sProv.length; i++) {
    const s = sProv[i], m = mProv[i];
    const ok = s.api_key === m.api_key;
    console.log(`  id=${s.id} ${s.provider}: ${ok ? 'OK' : 'DIFF'} (apikey_hash=${hash(s.api_key)})`);
  }

  // Check crm_customers count by vendor
  console.log('--- crm_customers by vendor ---');
  const sVendors = sqlite.prepare('SELECT vendor, COUNT(*) AS c FROM crm_customers GROUP BY vendor ORDER BY vendor').all();
  const [mVendors] = await conn.query('SELECT vendor, COUNT(*) AS c FROM crm_customers GROUP BY vendor ORDER BY vendor');
  console.log('  sqlite:', sVendors);
  console.log('  mysql:', mVendors);

  // Check sales_crew_messages content sample
  console.log('--- sales_crew_messages sample ---');
  const sMsg = sqlite.prepare('SELECT id, LENGTH(content) AS len FROM sales_crew_messages ORDER BY id DESC LIMIT 3').all();
  const [mMsg] = await conn.query('SELECT id, LENGTH(content) AS len FROM sales_crew_messages ORDER BY id DESC LIMIT 3');
  console.log('  sqlite:', sMsg);
  console.log('  mysql:', mMsg);

  // Check daily_chat_limits compound unique works
  console.log('--- daily_chat_limits ---');
  const [mLimits] = await conn.query('SELECT user_id, chat_date, chat_count FROM daily_chat_limits ORDER BY user_id, chat_date');
  console.log('  mysql rows:', mLimits.length, mLimits.slice(0, 3));

  sqlite.close();
  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });
