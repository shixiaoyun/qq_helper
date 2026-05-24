/**
 * One-shot data migration script: SQLite -> remote MySQL.
 * Drops all remote tables, recreates schema mirrored from SQLite,
 * then bulk-inserts every row (preserving IDs and FK relationships).
 *
 * Run: node scripts/migrate-sqlite-to-mysql.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');

const SQLITE_PATH = path.resolve(__dirname, '..', 'database', 'app.db');
const MYSQL_CFG = {
  host: '139.186.174.125',
  port: 3306,
  user: 'qq_helper',
  password: 'd2eWjYeaPbbtRAjX',
  database: 'qq_helper',
  charset: 'utf8mb4',
  multipleStatements: false,
};

// Columns that may hold long text — keep as TEXT instead of converting to VARCHAR(255)
const TEXT_EXCEPTIONS = new Set([
  'content', 'description', 'prompt', 'tool_calls', 'tool_results',
  'documentation', 'backstory', 'error_message', 'request_payload',
  'response_payload', 'inputs', 'outputs', 'notes', 'address',
  'attachments', 'metadata', 'results', 'tools', 'remarks',
  'comment', 'comments', 'data', 'embedding', 'details', 'permissions',
  'models', 'value', 'raw_data', 'sync_filters', 'import_filters',
  'next_action', 'result_notes', 'activity_detail', 'niuma_metadata',
  'config', 'message', 'reason', 'task', 'result', 'error', 'goal',
  'system_prompt', 'product_interest', 'knowledge_refs', 'next_actions',
  'risk_factors', 'recurrence_rule', 'nodes', 'edges', 'lost_reason',
]);

function normalizeCreateTable(sql) {
  let s = sql;
  // Remove SQLite-specific bits and translate types
  s = s.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'INT PRIMARY KEY AUTO_INCREMENT');
  s = s.replace(/\bAUTOINCREMENT\b/gi, 'AUTO_INCREMENT');
  s = s.replace(/\bREAL\b/gi, 'DOUBLE');
  s = s.replace(/\bBOOLEAN\b/gi, 'TINYINT(1)');
  // SQLite uses double-quoted identifiers (e.g. "order"); MySQL uses backticks
  s = s.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, '`$1`');
  // Convert TEXT columns to VARCHAR(255) except known long-text fields.
  // MySQL forbids DEFAULT values on TEXT columns — strip them.
  s = s.replace(/(\s+)`?([A-Za-z_][A-Za-z0-9_]*)`?\s+TEXT\b([^,\n)]*)/gi, (match, pad, col, rest) => {
    const colLc = col.toLowerCase();
    // A TEXT column with DEFAULT CURRENT_TIMESTAMP is really a timestamp — promote to DATETIME.
    if (/DEFAULT\s+CURRENT_TIMESTAMP/i.test(rest)) {
      return `${pad}\`${col}\` DATETIME${rest}`;
    }
    if (TEXT_EXCEPTIONS.has(colLc)) {
      const cleaned = rest.replace(/\s+DEFAULT\s+(?:'[^']*'|"[^"]*"|[^\s,)]+)/i, '');
      return `${pad}\`${col}\` TEXT${cleaned}`;
    }
    return `${pad}\`${col}\` VARCHAR(255)${rest}`;
  });
  // CURRENT_TIMESTAMP works in MySQL 5.6+, leave as-is
  // Strip SQLite IF NOT EXISTS quoting variations
  s = s.replace(/CREATE TABLE IF NOT EXISTS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi, 'CREATE TABLE `$1`');
  s = s.replace(/CREATE TABLE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi, 'CREATE TABLE `$1`');
  // Use InnoDB + utf8mb4
  s = s.trim();
  if (s.endsWith(';')) s = s.slice(0, -1);
  s += ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
  return s;
}

function normalizeCreateIndex(sql) {
  let s = sql;
  s = s.replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+(IF NOT EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s+ON\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(([^)]+)\)/gi,
    (m, uniq, _ifne, idx, tbl, cols) => {
      const safeCols = cols.split(',').map(c => {
        const trimmed = c.trim();
        // Backtick the column name part (may have ASC/DESC)
        const parts = trimmed.split(/\s+/);
        parts[0] = '`' + parts[0].replace(/^"|"$/g, '').replace(/^`|`$/g, '') + '`';
        return parts.join(' ');
      }).join(', ');
      return `CREATE ${uniq || ''}INDEX \`${idx}\` ON \`${tbl}\` (${safeCols})`;
    });
  return s.trim();
}

function safeIdent(name) {
  return '`' + name.replace(/`/g, '``') + '`';
}

// SQLite stores datetimes as ISO 8601 strings, sometimes as Unix millisecond ints,
// sometimes already-formatted strings. MySQL wants 'YYYY-MM-DD HH:MM:SS'.
const ISO_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?$/;
const MYSQL_DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
function toMysqlDatetime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') {
    if (MYSQL_DT_RE.test(v)) return v;
    const iso = ISO_DATETIME_RE.exec(v);
    if (iso) return `${iso[1]} ${iso[2]}`;
    // Numeric string?
    if (/^\d+$/.test(v)) {
      const n = Number(v);
      const ms = n < 1e12 ? n * 1000 : n; // seconds vs millis
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
    }
    // Try Date parse as last resort
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
    return null;
  }
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  return null;
}
function normalizeValue(v, isDatetime) {
  if (isDatetime) return toMysqlDatetime(v);
  if (typeof v !== 'string') return v;
  const m = ISO_DATETIME_RE.exec(v);
  if (m) return `${m[1]} ${m[2]}`;
  return v;
}

(async () => {
  console.log('Opening SQLite:', SQLITE_PATH);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  console.log('Connecting to MySQL:', MYSQL_CFG.host);
  const conn = await mysql.createConnection(MYSQL_CFG);

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Drop every existing table in target MySQL
    const [existing] = await conn.query('SHOW TABLES');
    for (const row of existing) {
      const name = Object.values(row)[0];
      await conn.query(`DROP TABLE IF EXISTS ${safeIdent(name)}`);
      console.log('  DROP', name);
    }

    // 2. Enumerate SQLite tables
    const tables = sqlite.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();
    console.log(`\nFound ${tables.length} tables in SQLite\n`);

    // 3. Create each table in MySQL (FK checks off so order doesn't matter)
    const tableCreateSql = {};
    for (const t of tables) {
      if (!t.sql) continue;
      const ddl = normalizeCreateTable(t.sql);
      tableCreateSql[t.name] = ddl;
      try {
        await conn.query(ddl);
        console.log('  CREATE', t.name);
      } catch (e) {
        console.error(`  FAILED CREATE ${t.name}:`, e.message);
        console.error(ddl);
        throw e;
      }
    }

    // 4. Copy data in batches
    let totalRows = 0;
    for (const t of tables) {
      const colInfo = sqlite.prepare(`PRAGMA table_info(${safeIdent(t.name).replace(/`/g, '"')})`).all();
      const colNames = colInfo.map(c => c.name);
      if (colNames.length === 0) continue;

      // Detect DATETIME columns from the MySQL schema (so we can coerce values)
      const [mysqlCols] = await conn.query(
        'SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [MYSQL_CFG.database, t.name]
      );
      const datetimeCols = new Set(
        mysqlCols.filter(c => /datetime|timestamp|date/i.test(c.DATA_TYPE)).map(c => c.COLUMN_NAME)
      );

      const rows = sqlite.prepare(`SELECT * FROM "${t.name}"`).all();
      if (rows.length === 0) {
        console.log(`  SKIP   ${t.name} (0 rows)`);
        continue;
      }

      const colList = colNames.map(c => safeIdent(c)).join(',');
      const placeholders = '(' + colNames.map(() => '?').join(',') + ')';

      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        const values = [];
        for (const r of slice) {
          for (const c of colNames) {
            let v = r[c];
            if (v instanceof Buffer) v = v.toString('utf8');
            values.push(normalizeValue(v, datetimeCols.has(c)));
          }
        }
        const sql = `INSERT INTO ${safeIdent(t.name)} (${colList}) VALUES ${slice.map(() => placeholders).join(',')}`;
        try {
          await conn.query(sql, values);
        } catch (e) {
          console.error(`  FAILED INSERT ${t.name} batch starting at ${i}:`, e.message);
          throw e;
        }
      }
      totalRows += rows.length;
      console.log(`  INSERT ${t.name}: ${rows.length} rows`);

      // Fix AUTO_INCREMENT
      const hasIdCol = colNames.includes('id');
      if (hasIdCol) {
        try {
          const maxId = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
          if (maxId > 0) {
            await conn.query(`ALTER TABLE ${safeIdent(t.name)} AUTO_INCREMENT = ${maxId + 1}`);
          }
        } catch (e) {
          console.warn(`    warn: failed to set AUTO_INCREMENT for ${t.name}: ${e.message}`);
        }
      }
    }

    // 5. Recreate indexes (those not already inside CREATE TABLE)
    const indexes = sqlite.prepare(
      "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
    ).all();
    for (const idx of indexes) {
      const ddl = normalizeCreateIndex(idx.sql);
      try {
        await conn.query(ddl);
        console.log('  INDEX', idx.name, 'on', idx.tbl_name);
      } catch (e) {
        if (/Duplicate key name|already exists/i.test(e.message)) continue;
        console.warn(`  warn: index ${idx.name} skipped: ${e.message}`);
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log(`\nDONE. Migrated ${tables.length} tables, ${totalRows} rows total.`);
  } finally {
    sqlite.close();
    await conn.end();
  }
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
