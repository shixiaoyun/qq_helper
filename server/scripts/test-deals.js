const SyncMySQL = require('sync-mysql');

const conn = new SyncMySQL({
  host: '139.186.174.125', port: 3306,
  user: 'qq_helper', password: 'd2eWjYeaPbbtRAjX',
  database: 'qq_helper', multipleStatements: true, charset: 'utf8mb4',
});

const sql = `CREATE TABLE IF NOT EXISTS crm_deals (
      id INT PRIMARY KEY AUTO_INCREMENT,
      \`title\` VARCHAR(255) NOT NULL,
      customer_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      value DOUBLE DEFAULT 0,
      expected_close_date DATETIME,
      assigned_to INTEGER,
      \`priority\` VARCHAR(255) DEFAULT 'medium',
      probability INTEGER,
      \`notes\` TEXT,
      \`lost_reason\` TEXT,
      \`status\` VARCHAR(255) DEFAULT 'open',
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (stage_id) REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )`;

try {
  console.log(conn.query(sql));
} catch (e) {
  console.error('Failed:', e.message);
}
