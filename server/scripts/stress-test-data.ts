import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'database/app.db');
const db = new Database(DB_PATH);

console.log('开始生成压力测试数据...');

// 1. 创建10个员工账号
const employees = [
  { username: 'sales1', nickname: '销售小王', role: 'user' },
  { username: 'sales2', nickname: '销售小李', role: 'user' },
  { username: 'sales3', nickname: '销售小张', role: 'user' },
  { username: 'sales4', nickname: '销售小刘', role: 'user' },
  { username: 'sales5', nickname: '销售小陈', role: 'user' },
  { username: 'manager1', nickname: '销售主管', role: 'admin' },
  { username: 'manager2', nickname: '区域经理', role: 'admin' },
  { username: 'support1', nickname: '技术支持', role: 'user' },
  { username: 'support2', nickname: '售后专员', role: 'user' },
  { username: 'intern1', nickname: '实习生', role: 'user' },
];

const passwordHash = bcrypt.hashSync('123456', 10);

for (const emp of employees) {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(emp.username);
  if (!exists) {
    db.prepare(
      'INSERT INTO users (username, email, password_hash, nickname, role, status, daily_chat_limit) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(emp.username, `${emp.username}@company.com`, passwordHash, emp.nickname, emp.role, 1, 9999);
    console.log(`✓ 创建员工: ${emp.nickname} (${emp.username})`);
  }
}

// 获取所有用户ID
const allUsers = db.prepare('SELECT id, nickname, role FROM users WHERE status = 1').all() as any[];
const salesUsers = allUsers.filter((u: any) => u.role === 'user');
const adminUsers = allUsers.filter((u: any) => u.role === 'admin' || u.role === 'superadmin');

// 2. 创建50个客户
const companies = [
  '北京建筑设计院', '上海三维科技', '广州创意传媒', '深圳智能制造', '杭州互联网公司',
  '成都游戏工作室', '武汉软件开发', '南京建筑设计', '西安航天科技', '重庆机械制造',
  '天津港口集团', '青岛海洋工程', '大连船舶重工', '厦门建筑设计', '福州软件开发',
  '郑州机械制造', '长沙建筑设计', '昆明旅游集团', '贵阳大数据', '拉萨建筑工程',
  '兰州石化集团', '银川能源公司', '西宁矿业集团', '乌鲁木齐贸易', '哈尔滨冰雪旅游',
  '长春汽车制造', '沈阳航空工业', '石家庄医药', '太原煤炭集团', '济南钢铁集团',
  '合肥电子科技', '南昌航空制造', '昆明建筑设计', '南宁港口贸易', '海口旅游开发',
  '呼和浩特牧业', '银川建筑设计', '西宁软件开发', '拉萨旅游集团', '乌鲁木齐建筑',
  '哈尔滨软件', '长春建筑设计', '沈阳软件开发', '石家庄建筑', '太原软件开发',
  '济南建筑设计', '合肥软件开发', '南昌建筑设计', '昆明软件开发', '南宁建筑设计',
];

const industries = ['建筑设计', '三维建模', '广告设计', '制造业', '软件开发', '游戏开发', '航天科技', '机械制造', '港口贸易', '旅游开发'];
const sources = ['官网', '展会', '电话营销', '客户推荐', '百度推广', '抖音', '微信朋友圈', '行业论坛', '邮件营销', '地推'];
const vendors = ['autodesk', 'sketchup', 'adobe', 'dassault'];
const statuses = ['lead', 'prospect', 'customer', 'churned'];

let customerCount = 0;
for (let i = 0; i < 50; i++) {
  const name = `客户${String(i + 1).padStart(2, '0')}`;
  const company = companies[i % companies.length];
  const industry = industries[i % industries.length];
  const source = sources[i % sources.length];
  const vendor = vendors[i % vendors.length];
  const status = statuses[Math.floor(Math.random() * statuses.length)];
  const assignedTo = salesUsers[i % salesUsers.length]?.id || 1;

  const exists = db.prepare('SELECT id FROM crm_customers WHERE name = ?').get(name);
  if (!exists) {
    db.prepare(
      `INSERT INTO crm_customers (name, company, industry, phone, email, source, vendor, status, assigned_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 30)} days'), datetime('now', '-${Math.floor(Math.random() * 30)} days'))`
    ).run(
      name, company, industry,
      `138${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
      `${name}@example.com`,
      source, vendor, status, assignedTo
    );
    customerCount++;
  }
}
console.log(`✓ 创建 ${customerCount} 个客户`);

// 3. 创建30个商机
const dealTitles = [
  'AutoCAD批量授权采购', 'Revit企业版订阅', 'SketchUp Pro年度授权',
  'Adobe Creative Cloud团队版', 'CATIA设计软件采购', 'SOLIDWORKS正版化',
  '3ds Max渲染农场搭建', 'Maya动画制作授权', 'Rhino建筑设计插件',
  'Lumion实时渲染系统', 'Enscape VR可视化', 'V-Ray for SketchUp',
  'Corona Renderer授权', 'Twinmotion实时渲染', 'ArcGIS地理信息系统',
  'BIM 360协作平台', 'Fusion 360制造设计', 'Inventor机械设计',
  'Navisworks项目审阅', 'Recap点云处理', 'Civil 3D道路设计',
  'InfraWorks基础设施', 'Vault数据管理', 'AutoCAD LT精简版',
  'SketchUp Studio套装', 'Adobe Premiere视频剪辑', 'After Effects特效制作',
  'Photoshop图像处理', 'Illustrator矢量设计', 'InDesign排版设计',
];

const allCustomers = db.prepare('SELECT id, name FROM crm_customers').all() as any[];
const allStages = db.prepare('SELECT id, probability FROM crm_pipeline_stages WHERE is_active = 1').all() as any[];

let dealCount = 0;
for (let i = 0; i < 30; i++) {
  const customer = allCustomers[i % allCustomers.length];
  const stage = allStages[i % allStages.length];
  const assignedTo = salesUsers[i % salesUsers.length]?.id || 1;
  const value = Math.floor(Math.random() * 200 + 10) * 1000; // 1万-200万
  const title = dealTitles[i % dealTitles.length];

  db.prepare(
    `INSERT INTO crm_deals (title, customer_id, stage_id, value, expected_close_date, assigned_to, priority, probability, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now', '+${Math.floor(Math.random() * 90)} days'), ?, ?, ?, 'open', ?, datetime('now', '-${Math.floor(Math.random() * 30)} days'), datetime('now'))`
  ).run(title, customer.id, stage.id, value, assignedTo, ['low', 'medium', 'high'][Math.floor(Math.random() * 3)], stage.probability, assignedTo);
  dealCount++;
}
console.log(`✓ 创建 ${dealCount} 个商机`);

// 4. 创建40个销售任务
const taskTitles = [
  '电话跟进客户需求', '发送产品报价单', '安排产品演示', '准备技术方案',
  '拜访客户现场', '收集竞品信息', '制作PPT提案', '协调技术支持',
  '跟进合同签署', '安排培训计划', '处理客户投诉', '收集用户反馈',
  '更新客户资料', '制定拜访计划', '准备投标材料', '协调售后服务',
];

let taskCount = 0;
for (let i = 0; i < 40; i++) {
  const customer = allCustomers[i % allCustomers.length];
  const assignedTo = salesUsers[i % salesUsers.length]?.id || 1;
  const assignedBy = adminUsers[0]?.id || 1;
  const status = ['pending', 'in_progress', 'completed'][Math.floor(Math.random() * 3)];

  db.prepare(
    `INSERT INTO crm_sales_tasks (title, description, customer_id, assigned_to, assigned_by, priority, status, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+${Math.floor(Math.random() * 14)} days'), datetime('now', '-${Math.floor(Math.random() * 30)} days'), datetime('now'))`
  ).run(
    taskTitles[i % taskTitles.length],
    `这是${customer.name}的跟进任务，需要尽快处理`,
    customer.id, assignedTo, assignedBy,
    ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
    status
  );
  taskCount++;
}
console.log(`✓ 创建 ${taskCount} 个销售任务`);

// 5. 创建60个跟进记录
const followUpContents = [
  '客户对AutoCAD感兴趣，需要报价', '已发送产品资料，等待回复', '客户预算有限，需要申请折扣',
  '安排了下周的产品演示', '客户决定采购，正在走审批流程', '竞争对手报价更低，需要调整策略',
  '客户技术部门认可产品，等待采购部决策', '客户要求延长试用期', '已签署合同，安排交付',
  '客户反馈使用良好，考虑增购', '客户遇到技术问题，已安排支持', '客户对售后服务满意',
];

let followUpCount = 0;
for (let i = 0; i < 60; i++) {
  const customer = allCustomers[i % allCustomers.length];
  const user = salesUsers[i % salesUsers.length]?.id || 1;

  db.prepare(
    `INSERT INTO crm_follow_ups (customer_id, user_id, follow_up_type, content, created_at)
     VALUES (?, ?, ?, ?, datetime('now', '-${Math.floor(Math.random() * 30)} days'))`
  ).run(
    customer.id, user,
    ['phone', 'email', 'visit', 'wechat', 'other'][Math.floor(Math.random() * 5)],
    followUpContents[i % followUpContents.length]
  );
  followUpCount++;
}
console.log(`✓ 创建 ${followUpCount} 个跟进记录`);

// 6. 设置员工技能专长
const skillData = [
  { user: 'sales1', vendor: 'autodesk', level: 5 },
  { user: 'sales1', vendor: 'sketchup', level: 3 },
  { user: 'sales2', vendor: 'adobe', level: 4 },
  { user: 'sales2', vendor: 'dassault', level: 2 },
  { user: 'sales3', vendor: 'autodesk', level: 3 },
  { user: 'sales3', vendor: 'dassault', level: 5 },
  { user: 'sales4', vendor: 'sketchup', level: 5 },
  { user: 'sales4', vendor: 'adobe', level: 3 },
  { user: 'sales5', vendor: 'autodesk', level: 4 },
  { user: 'sales5', vendor: 'adobe', level: 4 },
];

for (const sk of skillData) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(sk.user) as any;
  if (user) {
    const exists = db.prepare('SELECT id FROM crm_user_skills WHERE user_id = ? AND vendor = ?').get(user.id, sk.vendor);
    if (!exists) {
      db.prepare('INSERT INTO crm_user_skills (user_id, vendor, proficiency_level, is_primary) VALUES (?, ?, ?, ?)')
        .run(user.id, sk.vendor, sk.level, sk.level >= 4 ? 1 : 0);
    }
  }
}
console.log('✓ 设置员工技能专长');

// 7. 设置员工负责地域
const territoryData = [
  { user: 'sales1', province: '北京', city: '朝阳区' },
  { user: 'sales1', province: '天津', city: null },
  { user: 'sales2', province: '上海', city: '浦东新区' },
  { user: 'sales2', province: '江苏', city: '苏州' },
  { user: 'sales3', province: '广东', city: '深圳' },
  { user: 'sales3', province: '福建', city: '厦门' },
  { user: 'sales4', province: '四川', city: '成都' },
  { user: 'sales4', province: '重庆', city: null },
  { user: 'sales5', province: '浙江', city: '杭州' },
  { user: 'sales5', province: '山东', city: '青岛' },
];

for (const t of territoryData) {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(t.user) as any;
  if (user) {
    const exists = db.prepare('SELECT id FROM crm_user_territories WHERE user_id = ? AND province = ? AND city = ?').get(user.id, t.province, t.city);
    if (!exists) {
      db.prepare('INSERT INTO crm_user_territories (user_id, province, city, is_primary) VALUES (?, ?, ?, ?)')
        .run(user.id, t.province, t.city, t.city ? 1 : 0);
    }
  }
}
console.log('✓ 设置员工负责地域');

console.log('\n压力测试数据生成完成！');
console.log(`总计: ${employees.length} 员工, ${customerCount} 客户, ${dealCount} 商机, ${taskCount} 任务, ${followUpCount} 跟进记录`);

db.close();
