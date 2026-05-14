const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'app.db');
console.log('Database path:', dbPath);

if (!require('fs').existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

const roles = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();
console.log('Current role distribution:', JSON.stringify(roles, null, 2));

const r1 = db.prepare("UPDATE users SET role = 'admin' WHERE role = 'superadmin'").run();
console.log('superadmin -> admin:', r1.changes, 'records');

const r2 = db.prepare("UPDATE users SET role = 'user' WHERE role = 'vip_user'").run();
console.log('vip_user -> user:', r2.changes, 'records');

const updated = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();
console.log('Updated role distribution:', JSON.stringify(updated, null, 2));

// 更新 roles 表：添加 supervisor，删除 vip
const supervisorExists = db.prepare("SELECT id FROM roles WHERE name = 'supervisor'").get();
if (!supervisorExists) {
  db.prepare("INSERT INTO roles (name, label, permissions, description) VALUES (?, ?, ?, ?)")
    .run('supervisor', '主管', JSON.stringify(['chat', 'read', 'tools', 'web_search', 'crm_manage']), '团队主管，可管理CRM客户和团队成员');
  console.log('Added supervisor role');
}

// 更新现有角色标签和描述
db.prepare("UPDATE roles SET label = '管理员', description = '系统管理员，拥有全部权限' WHERE name = 'admin'").run();
db.prepare("UPDATE roles SET label = '成员', description = '普通成员，可使用AI对话和查看分配的客户' WHERE name = 'user'").run();

// 删除废弃的 vip 角色
db.prepare("DELETE FROM roles WHERE name = 'vip'").run();
console.log('Removed vip role from roles table');

const users = db.prepare('SELECT id, username, nickname, role, last_login_at FROM users').all();
console.log('All users:', JSON.stringify(users, null, 2));

const finalRoles = db.prepare('SELECT name, label, description FROM roles').all();
console.log('Final roles:', JSON.stringify(finalRoles, null, 2));

db.close();
console.log('Migration completed successfully');
