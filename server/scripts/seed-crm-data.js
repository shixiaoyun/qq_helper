const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(process.cwd(), './database/app.db');
const db = new Database(DB_PATH);

// 销售员工ID映射
const salesUsers = [
  { id: 2, name: '销售123' },
  { id: 3, name: '销售小李' },
  { id: 4, name: '销售小张' },
  { id: 5, name: '销售小刘' },
  { id: 6, name: '销售小陈' },
];

// 获取每个员工的客户
function getCustomersForUser(userId) {
  return db.prepare('SELECT id, name, company FROM crm_customers WHERE assigned_to = ?').all(userId);
}

// 创建销售任务
function createSalesTasks() {
  const tasks = [
    { title: '跟进赵总 AutoCAD 续费事宜', priority: 'high', status: 'pending' },
    { title: '给钱工发送 Revit 报价单', priority: 'high', status: 'in_progress' },
    { title: '拜访孙总讨论 3ds Max 采购', priority: 'medium', status: 'pending' },
    { title: '电话回访李主任 BIM 360 使用情况', priority: 'medium', status: 'completed' },
    { title: '准备周经理的 Maya 演示方案', priority: 'high', status: 'pending' },
    { title: '发送产品资料给新客户', priority: 'low', status: 'pending' },
    { title: '更新客户跟进记录', priority: 'medium', status: 'in_progress' },
    { title: '参加产品培训会议', priority: 'medium', status: 'completed' },
  ];

  const insert = db.prepare(`
    INSERT INTO crm_sales_tasks (title, description, customer_id, assigned_to, assigned_by, priority, status, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  salesUsers.forEach(user => {
    const customers = getCustomersForUser(user.id);
    if (customers.length === 0) return;

    tasks.forEach((task, index) => {
      const customer = customers[index % customers.length];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) - 2);

      insert.run(
        task.title,
        `为 ${customer.name} (${customer.company}) 的 ${task.title}`,
        customer.id,
        user.id,
        7, // 销售主管分配
        task.priority,
        task.status,
        dueDate.toISOString()
      );
    });
  });

  console.log('✅ 销售任务创建完成');
}

// 创建待办事项
function createTodos() {
  const todos = [
    { title: '准备明天客户拜访资料', category: 'follow_up', priority: 'high' },
    { title: '回复客户邮件咨询', category: 'general', priority: 'medium' },
    { title: '更新 CRM 客户信息', category: 'general', priority: 'low' },
    { title: '参加周会汇报进度', category: 'meeting', priority: 'medium' },
    { title: '完成月度销售报告', category: 'report', priority: 'high' },
    { title: '跟进潜在客户线索', category: 'follow_up', priority: 'high' },
    { title: '整理产品演示文档', category: 'general', priority: 'medium' },
    { title: '预约客户现场演示', category: 'follow_up', priority: 'high' },
  ];

  const insert = db.prepare(`
    INSERT INTO crm_todos (user_id, title, description, category, priority, status, related_customer_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  salesUsers.forEach(user => {
    const customers = getCustomersForUser(user.id);

    todos.forEach((todo, index) => {
      const customer = customers[index % customers.length];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 7));
      const status = Math.random() > 0.7 ? 'completed' : 'pending';

      insert.run(
        user.id,
        todo.title,
        `相关客户: ${customer?.name || '无'}`,
        todo.category,
        todo.priority,
        status,
        customer?.id || null,
        dueDate.toISOString()
      );
    });
  });

  console.log('✅ 待办事项创建完成');
}

// 创建日历事件
function createCalendarEvents() {
  const events = [
    { title: '客户拜访 - 赵总', type: 'follow_up', duration: 60 },
    { title: '产品演示 - 钱工', type: 'demo', duration: 90 },
    { title: '电话会议 - 孙总', type: 'call', duration: 30 },
    { title: '商务谈判 - 李主任', type: 'meeting', duration: 120 },
    { title: '合同签署 - 周经理', type: 'meeting', duration: 60 },
    { title: '售后回访 - 吴院长', type: 'follow_up', duration: 45 },
    { title: '技术培训 - 郑工', type: 'demo', duration: 120 },
    { title: '周会汇报', type: 'meeting', duration: 60 },
  ];

  const insert = db.prepare(`
    INSERT INTO crm_calendar_events (user_id, title, description, event_type, related_customer_id, start_time, end_time, location, reminder_minutes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  salesUsers.forEach(user => {
    const customers = getCustomersForUser(user.id);

    events.forEach((event, index) => {
      const customer = customers[index % customers.length];
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + Math.floor(Math.random() * 14) - 3);
      startTime.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);

      const endTime = new Date(startTime.getTime() + event.duration * 60000);

      insert.run(
        user.id,
        event.title,
        `与 ${customer?.name || '客户'} 的${event.title}`,
        event.type,
        customer?.id || null,
        startTime.toISOString(),
        endTime.toISOString(),
        customer?.company || '客户公司',
        15,
        'scheduled'
      );
    });
  });

  console.log('✅ 日历事件创建完成');
}

// 主函数
console.log('🚀 开始创建 CRM 虚拟数据...');

try {
  createSalesTasks();
  createTodos();
  createCalendarEvents();

  // 统计
  const taskCount = db.prepare('SELECT COUNT(*) as count FROM crm_sales_tasks').get();
  const todoCount = db.prepare('SELECT COUNT(*) as count FROM crm_todos').get();
  const eventCount = db.prepare('SELECT COUNT(*) as count FROM crm_calendar_events').get();

  console.log('\n📊 数据统计:');
  console.log(`  销售任务: ${taskCount.count} 条`);
  console.log(`  待办事项: ${todoCount.count} 条`);
  console.log(`  日历事件: ${eventCount.count} 条`);
  console.log('\n✅ 所有数据创建完成！');
} catch (err) {
  console.error('❌ 创建数据失败:', err.message);
} finally {
  db.close();
}
