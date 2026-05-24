process.env.DATABASE_URL = 'mysql://qq_helper:d2eWjYeaPbbtRAjX@139.186.174.125:3306/qq_helper';
process.env.ENCRYPTION_KEY = 'oq-assistant-q1-31-encryption-key-32ch';
process.env.NODE_ENV = 'development';

const m = await import('../src/config/database.ts');
try {
  m.initDatabase();
  console.log('OK');
} catch (e) {
  console.error('FAIL:', e?.message || e, '\n', e?.stack);
  process.exit(1);
}
