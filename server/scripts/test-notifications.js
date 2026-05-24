const SyncMySQL = require('sync-mysql');

const conn = new SyncMySQL({
  host: '139.186.174.125', port: 3306,
  user: 'qq_helper', password: 'd2eWjYeaPbbtRAjX',
  database: 'qq_helper', multipleStatements: true, charset: 'utf8mb4',
});

const sql = `CREATE TABLE IF NOT EXISTS crm_notifications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INTEGER NOT NULL,
      \`type\` VARCHAR(255) NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`content\` TEXT,
      related_customer_id INTEGER,
      related_task_id INTEGER,
      is_read INTEGER DEFAULT 0,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL,
      FOREIGN KEY (related_task_id) REFERENCES crm_sales_tasks(id) ON DELETE SET NULL
    )`;

try {
  console.log(conn.query(sql));
} catch (e) {
  console.error('Failed:', e.message);
}
