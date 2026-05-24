const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');

const SQLITE_PATH = path.resolve(__dirname, '..', 'database', 'app.db');

(async () => {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const conn = await mysql.createConnection({
    host: '139.186.174.125', port: 3306,
    user: 'qq_helper', password: 'd2eWjYeaPbbtRAjX',
    database: 'qq_helper', charset: 'utf8mb4',
  });
  const tables = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  let mismatch = 0, totalSqlite = 0, totalMysql = 0;
  for (const t of tables) {
    const s = sqlite.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c;
    const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t.name}\``);
    const m = rows[0].c;
    totalSqlite += s; totalMysql += m;
    if (s !== m) {
      console.log(`MISMATCH ${t.name}: sqlite=${s} mysql=${m}`);
      mismatch++;
    }
  }
  console.log(`Tables: ${tables.length}, mismatches: ${mismatch}`);
  console.log(`Total rows: sqlite=${totalSqlite}, mysql=${totalMysql}`);
  sqlite.close();
  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });
