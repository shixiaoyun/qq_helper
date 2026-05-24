const SyncMySQL = require('sync-mysql');

const conn = new SyncMySQL({
  host: '139.186.174.125', port: 3306,
  user: 'qq_helper', password: 'd2eWjYeaPbbtRAjX',
  database: 'qq_helper', multipleStatements: true, charset: 'utf8mb4',
});

// Simulate sequence: do a query that triggers "Duplicate key name", then another query
try {
  console.log('1. simple select:', conn.query('SELECT 1 AS one'));
} catch (e) { console.error('1 fail:', e.message); }

try {
  console.log('2. CREATE INDEX (should fail dup):', conn.query('CREATE INDEX idx_crm_customers_status ON crm_customers(status)'));
} catch (e) { console.error('2 fail (expected dup):', e.message); }

try {
  console.log('3. simple select again:', conn.query('SELECT 2 AS two'));
} catch (e) { console.error('3 fail:', e.message); }

try {
  console.log('4. CREATE TABLE IF NOT EXISTS:', conn.query('CREATE TABLE IF NOT EXISTS crm_notifications (x INT)'));
} catch (e) { console.error('4 fail:', e.message); }
