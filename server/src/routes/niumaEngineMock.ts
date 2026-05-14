/**
 * 牛马AI引擎 Mock 路由
 * 在 Q1.31 内部自建引擎 API，提供企业盗版分析数据
 * 数据格式完全对齐 V1.79 analyzeCompany 返回结构
 * 当外部 NiuniuAI 引擎不可用时，作为本地数据源使用
 */

import { Router } from 'express';
const router = Router();

// ============================================================
// 基础企业数据（对齐 V1.79 getCompanyData 返回）
// ============================================================
export const MOCK_ENTERPRISES = [
  {
    id: 1001, company_name: '深圳华创建筑设计有限公司', province: '广东省', city: '深圳市',
    gb_industry_major: '建筑设计', qcc_industry_major: '建筑工程设计', insurance_count: 28, reg_capital: '1200万',
    credit_code: '91440300MA5DR3QH1N', reg_status: '存续', legal_person: '赵志刚', est_date: '2010-03-15',
    email: 'hr@huachuang-sz.cn', phone: '0755-86691234', reg_address: '广东省深圳市南山区科技园南区A栋1202室',
    website: 'www.huachuang-sz.cn', company_type: '有限责任公司', org_code: 'MA5DR3QH1',
    company_intro: '华创建筑设计是一家专注于建筑设计和BIM咨询的综合性企业，拥有多年行业经验。',
    v9_piracy: 82, v9_is_qualified: 1, v9_quality_score: 76,
    v9_products: '["AutoCAD","Revit"]', v9_dept: '设计部', v9_dept_people: 12,
    v9_customer_score: 68, v9_industry_segment: 'AEC_ARCH', v9_industry_trend: 'stable',
    v9_purchasing_level: 'high', v9_exclude_reason: '', dependency_level: 'high', dependency_score: 85,
    core_product: 'AutoCAD',
    v9_phone_marker: '["0755-86691234","13925250001"]', v9_email_marker: '["hr@huachuang-sz.cn","zhao@huachuang-sz.cn"]',
    v9_mail_address: '广东省深圳市南山区科技园南区A栋1202室', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_B', v9_visit_sop: 'SOP_Standard',
    v9_score_breakdown: '', v9_usage_rate: '0.43',
    gb_industry_category: '建筑业', qcc_industry_category: '工程设计',
  },
  {
    id: 1002, company_name: '广州天汇工程咨询有限公司', province: '广东省', city: '广州市',
    gb_industry_major: '工程咨询', qcc_industry_major: '工程管理服务', insurance_count: 45, reg_capital: '2000万',
    credit_code: '91440101MA5AWGBX2J', reg_status: '存续', legal_person: '李建国', est_date: '2008-07-20',
    email: 'info@tianhui-gz.com', phone: '020-38876543', reg_address: '广东省广州市天河区珠江新城B座1501室',
    website: 'www.tianhui-gz.com', company_type: '有限责任公司', org_code: 'MA5AWGBX2',
    company_intro: '天汇工程咨询提供全面的工程项目管理和技术咨询服务，服务范围涵盖建筑、市政、交通等领域。',
    v9_piracy: 91, v9_is_qualified: 1, v9_quality_score: 88,
    v9_products: '["AutoCAD","Revit","Navisworks"]', v9_dept: '工程部', v9_dept_people: 22,
    v9_customer_score: 85, v9_industry_segment: 'AEC_CONSTR', v9_industry_trend: 'growing',
    v9_purchasing_level: 'high', v9_exclude_reason: '', dependency_level: 'high', dependency_score: 92,
    core_product: 'Revit',
    v9_phone_marker: '["020-38876543","13800020001"]', v9_email_marker: '["info@tianhui-gz.com"]',
    v9_mail_address: '广东省广州市天河区珠江新城B座1501室', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_A', v9_visit_sop: 'SOP_Premium',
    v9_score_breakdown: '', v9_usage_rate: '0.49',
    gb_industry_category: '建筑业', qcc_industry_category: '工程管理',
  },
  {
    id: 1003, company_name: '北京天际建筑设计院', province: '北京市', city: '朝阳区',
    gb_industry_major: '建筑设计', qcc_industry_major: '建筑装饰设计', insurance_count: 120, reg_capital: '5000万',
    credit_code: '91110105MA01BWCY3L', reg_status: '存续', legal_person: '王建国', est_date: '2005-01-10',
    email: 'office@tianji-bj.com', phone: '010-85961234', reg_address: '北京市朝阳区建国路88号SOHO现代城C座2701',
    website: 'www.tianji-bj.com', company_type: '有限责任公司', org_code: 'MA01BWCY3',
    company_intro: '北京天际建筑设计院是北京地区知名的建筑设计企业，主营建筑方案设计、室内设计及效果图制作。',
    v9_piracy: 67, v9_is_qualified: 1, v9_quality_score: 72,
    v9_products: '["AutoCAD","3ds Max","Maya"]', v9_dept: 'BIM中心', v9_dept_people: 48,
    v9_customer_score: 71, v9_industry_segment: 'AEC_ARCH', v9_industry_trend: 'stable',
    v9_purchasing_level: 'high', v9_exclude_reason: '', dependency_level: 'high', dependency_score: 78,
    core_product: '3ds Max',
    v9_phone_marker: '["010-85961234","010-85961235","13910001003"]', v9_email_marker: '["office@tianji-bj.com","hr@tianji-bj.com"]',
    v9_mail_address: '北京市朝阳区建国路88号SOHO现代城C座2701', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_B', v9_visit_sop: 'SOP_Standard',
    v9_score_breakdown: '', v9_usage_rate: '0.40',
    gb_industry_category: '建筑业', qcc_industry_category: '建筑装饰',
  },
  {
    id: 1004, company_name: '上海瑞安城市规划设计有限公司', province: '上海市', city: '浦东新区',
    gb_industry_major: '城市规划', qcc_industry_major: '规划设计管理', insurance_count: 65, reg_capital: '3000万',
    credit_code: '91310115MA1KYNDX4M', reg_status: '存续', legal_person: '陈明远', est_date: '2012-06-28',
    email: 'hr@ruian-sh.cn', phone: '021-50897654', reg_address: '上海市浦东新区张江高科技园区碧波路690号',
    website: 'www.ruian-sh.cn', company_type: '有限责任公司（自然人独资）', org_code: 'MA1KYNDX4',
    company_intro: '瑞安城市规划专注于城市规划设计和城市更新领域，是上海地区知名的规划设计服务商。',
    v9_piracy: 95, v9_is_qualified: 1, v9_quality_score: 90,
    v9_products: '["AutoCAD","Revit","SketchUp"]', v9_dept: '规划部', v9_dept_people: 30,
    v9_customer_score: 89, v9_industry_segment: 'AEC_URBAN', v9_industry_trend: 'growing',
    v9_purchasing_level: 'high', v9_exclude_reason: '', dependency_level: 'critical', dependency_score: 95,
    core_product: 'SketchUp',
    v9_phone_marker: '["021-50897654","13810004004"]', v9_email_marker: '["hr@ruian-sh.cn","chen@ruian-sh.cn"]',
    v9_mail_address: '上海市浦东新区张江高科技园区碧波路690号', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_A', v9_visit_sop: 'SOP_Premium',
    v9_score_breakdown: '', v9_usage_rate: '0.46',
    gb_industry_category: '建筑业', qcc_industry_category: '规划设计',
  },
  {
    id: 1005, company_name: '成都锦城装饰工程有限公司', province: '四川省', city: '成都市',
    gb_industry_major: '装饰装修', qcc_industry_major: '建筑装饰', insurance_count: 18, reg_capital: '500万',
    credit_code: '91510100MA6DFPRH5N', reg_status: '存续', legal_person: '刘美丽', est_date: '2016-11-05',
    email: 'service@jincheng-cd.com', phone: '028-86123456', reg_address: '四川省成都市武侯区天府大道中段688号',
    website: '', company_type: '有限责任公司', org_code: 'MA6DFPRH5',
    company_intro: '成都锦城装饰主要从事室内外装饰装修工程设计与施工，为多家地产开发商提供服务。',
    v9_piracy: 78, v9_is_qualified: 0, v9_quality_score: 55,
    v9_products: '["AutoCAD","3ds Max"]', v9_dept: '设计部', v9_dept_people: 8,
    v9_customer_score: 42, v9_industry_segment: 'AEC_INTERIOR', v9_industry_trend: 'stable',
    v9_purchasing_level: 'medium', v9_exclude_reason: '', dependency_level: 'medium', dependency_score: 62,
    core_product: 'AutoCAD',
    v9_phone_marker: '["028-86123456"]', v9_email_marker: '["service@jincheng-cd.com"]',
    v9_mail_address: '四川省成都市武侯区天府大道中段688号', v9_mail_trust: '中',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_C', v9_visit_sop: 'SOP_Light',
    v9_score_breakdown: '', v9_usage_rate: '0.44',
    gb_industry_category: '建筑业', qcc_industry_category: '建筑装饰',
  },
  {
    id: 1006, company_name: '杭州西湖园林规划设计有限公司', province: '浙江省', city: '杭州市',
    gb_industry_major: '园林景观', qcc_industry_major: '园林绿化', insurance_count: 22, reg_capital: '800万',
    credit_code: '91330100MA2BWCY5L3', reg_status: '存续', legal_person: '周文博', est_date: '2014-03-20',
    email: 'info@xihu-ld.com', phone: '0571-87012345', reg_address: '浙江省杭州市西湖区文三路478号华星时代广场A座',
    website: 'www.xihu-ld.com', company_type: '有限责任公司', org_code: 'MA2BWCY5L',
    company_intro: '杭州西湖园林规划设计有限公司专注园林景观设计与施工一体化服务。',
    v9_piracy: 73, v9_is_qualified: 1, v9_quality_score: 61,
    v9_products: '["AutoCAD","SketchUp","Lumion"]', v9_dept: '景观部', v9_dept_people: 10,
    v9_customer_score: 58, v9_industry_segment: 'AEC_LANDSCAPE', v9_industry_trend: 'growing',
    v9_purchasing_level: 'medium', v9_exclude_reason: '', dependency_level: 'medium', dependency_score: 68,
    core_product: 'SketchUp',
    v9_phone_marker: '["0571-87012345"]', v9_email_marker: '["info@xihu-ld.com"]',
    v9_mail_address: '浙江省杭州市西湖区文三路478号华星时代广场A座', v9_mail_trust: '中',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_C', v9_visit_sop: 'SOP_Light',
    v9_score_breakdown: '', v9_usage_rate: '0.45',
    gb_industry_category: '建筑业', qcc_industry_category: '园林绿化',
  },
  {
    id: 1007, company_name: '武汉汉江建筑设计股份有限公司', province: '湖北省', city: '武汉市',
    gb_industry_major: '建筑设计', qcc_industry_major: '建筑工程设计', insurance_count: 88, reg_capital: '2500万',
    credit_code: '91420100MA4KYNDX4L', reg_status: '存续', legal_person: '黄德华', est_date: '2007-09-12',
    email: 'admin@hanjiang-wh.com', phone: '027-87651234', reg_address: '湖北省武汉市武昌区中南路7号中商广场28楼',
    website: 'www.hanjiang-wh.com', company_type: '股份有限公司', org_code: 'MA4KYNDX4',
    company_intro: '汉江建筑设计股份是武汉本土知名建筑设计公司，业务涵盖建筑设计、BIM咨询和效果图制作。',
    v9_piracy: 86, v9_is_qualified: 1, v9_quality_score: 79,
    v9_products: '["AutoCAD","Revit","Civil 3D"]', v9_dept: '设计院', v9_dept_people: 38,
    v9_customer_score: 75, v9_industry_segment: 'AEC_ARCH', v9_industry_trend: 'stable',
    v9_purchasing_level: 'high', v9_exclude_reason: '', dependency_level: 'high', dependency_score: 84,
    core_product: 'AutoCAD',
    v9_phone_marker: '["027-87651234","18627020707"]', v9_email_marker: '["admin@hanjiang-wh.com"]',
    v9_mail_address: '湖北省武汉市武昌区中南路7号中商广场28楼', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_A', v9_visit_sop: 'SOP_Standard',
    v9_score_breakdown: '', v9_usage_rate: '0.43',
    gb_industry_category: '建筑业', qcc_industry_category: '建筑工程',
  },
  {
    id: 1008, company_name: '苏州工业园区建筑设计研究院', province: '江苏省', city: '苏州市',
    gb_industry_major: '建筑设计', qcc_industry_major: '建筑工程设计', insurance_count: 105, reg_capital: '3500万',
    credit_code: '91320500MA1KNDX4M', reg_status: '存续', legal_person: '张建国', est_date: '2003-05-18',
    email: 'hr@sipad-sz.cn', phone: '0512-62881234', reg_address: '江苏省苏州市工业园区星湖街328号创意产业园',
    website: 'www.sipad-sz.cn', company_type: '有限责任公司', org_code: 'MA1KNDX4M',
    company_intro: '苏州工业园区建筑设计研究院是苏州地区领先的建筑设计研究机构，在BIM应用、绿色建筑等领域有深入研究。',
    v9_piracy: 59, v9_is_qualified: 1, v9_quality_score: 66,
    v9_products: '["Revit","Inventor","Navisworks"]', v9_dept: 'BIM中心', v9_dept_people: 45,
    v9_customer_score: 64, v9_industry_segment: 'AEC_ARCH', v9_industry_trend: 'stable',
    v9_purchasing_level: 'high', v9_exclude_reason: '', dependency_level: 'medium', dependency_score: 65,
    core_product: 'Revit',
    v9_phone_marker: '["0512-62881234","0512-62881235"]', v9_email_marker: '["hr@sipad-sz.cn","zhang@sipad-sz.cn"]',
    v9_mail_address: '江苏省苏州市工业园区星湖街328号创意产业园12号楼', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_B', v9_visit_sop: 'SOP_Standard',
    v9_score_breakdown: '', v9_usage_rate: '0.43',
    gb_industry_category: '建筑业', qcc_industry_category: '建筑设计',
  },
  {
    id: 1009, company_name: '重庆山水园林景观工程有限公司', province: '重庆市', city: '渝北区',
    gb_industry_major: '园林景观', qcc_industry_major: '园林绿化', insurance_count: 15, reg_capital: '600万',
    credit_code: '91500000MA5XYPQH2N', reg_status: '存续', legal_person: '赵丽华', est_date: '2017-03-08',
    email: 'contact@shanshui-cq.com', phone: '023-67321234', reg_address: '重庆市渝北区新南路168号',
    website: '', company_type: '有限责任公司', org_code: 'MA5XYPQH2',
    company_intro: '重庆山水园林主要从事园林景观设计和绿化工程施工。',
    v9_piracy: 88, v9_is_qualified: 0, v9_quality_score: 52,
    v9_products: '["AutoCAD","SketchUp"]', v9_dept: '设计部', v9_dept_people: 6,
    v9_customer_score: 35, v9_industry_segment: 'AEC_LANDSCAPE', v9_industry_trend: 'growing',
    v9_purchasing_level: 'medium', v9_exclude_reason: '注册资本偏低', dependency_level: 'medium', dependency_score: 55,
    core_product: 'SketchUp',
    v9_phone_marker: '["023-67321234"]', v9_email_marker: '["contact@shanshui-cq.com"]',
    v9_mail_address: '重庆市渝北区新南路168号', v9_mail_trust: '中',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_D', v9_visit_sop: 'SOP_Light',
    v9_score_breakdown: '', v9_usage_rate: '0.40',
    gb_industry_category: '建筑业', qcc_industry_category: '园林绿化',
  },
  {
    id: 1010, company_name: '东莞伟业精密模具有限公司', province: '广东省', city: '东莞市',
    gb_industry_major: '精密模具', qcc_industry_major: '金属制品', insurance_count: 56, reg_capital: '1800万',
    credit_code: '91441900MA5DR3QH2N', reg_status: '存续', legal_person: '孙伟业', est_date: '2011-08-25',
    email: 'sales@weiye-dg.com', phone: '0769-22891234', reg_address: '广东省东莞市长安镇新安社区新安一路88号',
    website: 'www.weiye-dg.com', company_type: '有限责任公司', org_code: 'MA5DR3QH2',
    company_intro: '伟业精密模具专注精密注塑模具设计与制造，服务于汽车、电子等行业的知名企业。',
    v9_piracy: 92, v9_is_qualified: 1, v9_quality_score: 84,
    v9_products: '["Inventor","SolidWorks","CATIA"]', v9_dept: '技术部', v9_dept_people: 25,
    v9_customer_score: 82, v9_industry_segment: 'DM_TOOLING', v9_industry_trend: 'growing',
    v9_purchasing_level: 'high', v9_exclude_reason: '', dependency_level: 'high', dependency_score: 88,
    core_product: 'Inventor',
    v9_phone_marker: '["0769-22891234","13829010010"]', v9_email_marker: '["sales@weiye-dg.com"]',
    v9_mail_address: '广东省东莞市长安镇新安社区新安一路88号', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_A', v9_visit_sop: 'SOP_Premium',
    v9_score_breakdown: '', v9_usage_rate: '0.45',
    gb_industry_category: '制造业', qcc_industry_category: '金属制品',
  },
  {
    id: 1011, company_name: '成都若心科技有限公司', province: '四川省', city: '成都市',
    gb_industry_major: '其他制造业', qcc_industry_major: '其他制造业', insurance_count: 12, reg_capital: '1118万',
    credit_code: '915101145849568731', reg_status: '存续', legal_person: '刘建军', est_date: '2011-11-21',
    email: '619451838@qq.com', phone: '13709004766', reg_address: '四川省成都市新都区工业东区兴能路430号9栋',
    website: 'www.cdcoro.com', company_type: '有限责任公司（自然人投资或控股）', org_code: 'MA5DR3QH1',
    company_intro: '成都若心科技有限公司是一家专注于工业设计和制造的企业。',
    v9_piracy: 2, v9_is_qualified: 1, v9_quality_score: 100,
    v9_products: '["AutoCAD","Inventor","Fusion 360","PowerMill"]', v9_dept: '设计部', v9_dept_people: 5,
    v9_customer_score: 7, v9_industry_segment: 'DM_MACH', v9_industry_trend: 'stable',
    v9_purchasing_level: 'small', v9_exclude_reason: '', dependency_level: 'low', dependency_score: 0.51,
    core_product: 'AutoCAD',
    v9_phone_marker: '["13709004766","13880831373","028-83033660"]', v9_email_marker: '["619451838@qq.com"]',
    v9_mail_address: '四川省成都市新都区工业东区兴能路430号9栋', v9_mail_trust: '高',
    v9_pricing: '标准定价', v9_lc_strategy: 'LC_C', v9_visit_sop: 'SOP_Light',
    v9_score_breakdown: '', v9_usage_rate: '0.15',
    gb_industry_category: '制造业', qcc_industry_category: '其他制造业',
  },
];

const MOCK_PROVINCES = ['广东省', '北京市', '上海市', '江苏省', '浙江省', '四川省', '湖北省', '重庆市', '陕西省', '福建省', '山东省', '天津市', '湖南省'];

const MOCK_INDUSTRIES = ['建筑设计', '工程咨询', '城市规划', '装饰装修', '园林景观', '精密模具', '汽车制造', '电子科技', '软件开发', '教育培训'];

// ============================================================
// V1.79 格式转换：将扁平企业数据转换为 V1.79 analyzeCompany 返回格式
// ============================================================
function buildV179Result(e: any) {
  const products = parseProducts(e.v9_products);

  // 百分制评分计算
  const percentileScore = calcPercentileScore(e);
  // 盗版套数估算
  const estimatedCopies = calcPiracyCopies(e, products);
  // 部门人数
  const deptPeople = e.v9_dept_people || Math.floor(e.insurance_count * 0.3) || 5;
  // LC策略
  const lc = calcLCStrategy(percentileScore.score, e.dependency_level);
  // 拜访SOP
  const sop = calcVisitSOP(percentileScore.score, lc.code);
  // 定价
  const pricing = calcPricing(e.core_product || products[0] || 'AutoCAD', estimatedCopies, e.insurance_count);
  // V9卡片
  const v9Cards = buildV9Cards(e, percentileScore, products, estimatedCopies, deptPeople, lc, sop, pricing);
  // 电话分析
  const phoneAnalysis = analyzePhones(e.v9_phone_marker);
  // 邮箱分析
  const emailAnalysis = analyzeEmails(e.v9_email_marker);
  // 地址分析
  const addrAnalysis = analyzeAddress(e.v9_mail_address);
  // 排除原因
  const excludeReason = e.v9_exclude_reason || '';
  // 招聘证据
  const recruitEvidence = buildRecruitEvidence(e.company_name);

  // 风险等级计算
  let riskLevel = '无风险';
  if (e.v9_piracy >= 10) riskLevel = '极高风险';
  else if (e.v9_piracy >= 6) riskLevel = '高风险';
  else if (e.v9_piracy >= 3) riskLevel = '中风险';
  else if (e.v9_piracy >= 1) riskLevel = '低风险';

  // 资质等级
  const qualificationLevel = e.v9_is_qualified ? '合格' : '不合格';

  return {
    company_id: e.id,
    company_name: { value: e.company_name, source: 'db' },
    credit_code: { value: e.credit_code, source: 'db' },
    legal_person: { value: e.legal_person, source: 'db' },
    reg_status: { value: e.reg_status, source: 'db' },
    est_date: { value: e.est_date, source: 'db' },
    phone: { value: e.phone || '', source: 'db' },
    email: { value: e.email || '', source: 'db' },
    address: { value: e.reg_address || '', source: 'db' },
    website: { value: e.website || '', source: 'db' },
    company_type: { value: e.company_type || '', source: 'db' },
    org_code: { value: e.org_code || '', source: 'db' },
    financing: { value: deriveFinancing(e.company_type), source: 'db' },
    stock_code: { value: '', source: 'db' },

    industry_segment: e.v9_industry_segment || 'AEC_ARCH',
    industry_segment_display: `${e.v9_industry_segment || 'AEC_ARCH'}/${e.qcc_industry_major || e.gb_industry_major}`,
    industry_name: { value: e.gb_industry_major, source: 'calc' },
    confidence: { value: 0.65, source: 'calc' },

    v9_level: { value: percentileScore.level, source: 'db' },
    v9_score: { value: percentileScore.score, source: 'db' },
    percentile_score: { value: percentileScore.score, source: 'calc' },
    percentile_level: { value: percentileScore.level, source: 'calc' },
    percentile_level_desc: { value: percentileScore.level_desc, source: 'calc' },
    percentile_breakdown: { value: percentileScore.breakdown, source: 'calc' },
    percentile_dimensions: percentileScore.dimensions,

    matched_keywords: [e.gb_industry_major, 'CAD', 'BIM'],
    keyword_source: 'mock',
    semantic_similarity: null,

    products: { value: products, source: 'kb' },
    core_product: { value: e.core_product || products[0] || 'AutoCAD', source: 'kb' },
    piracy_probability: { value: 0.65, source: 'calc' },
    analysis_method: 'keyword',

    piracy_copies: estimatedCopies,
    dept_name: e.v9_dept || '设计部',
    dept_people: { value: deptPeople, source: 'db' },

    province: { value: e.province, source: 'db' },
    city: { value: e.city, source: 'db' },
    reg_capital: { value: e.reg_capital, source: 'db' },
    insurance_count: { value: e.insurance_count, source: 'db' },

    gb_industry_category: e.gb_industry_category || '',
    gb_industry_major: e.gb_industry_major,
    qcc_industry_major: e.qcc_industry_major || '',

    v9_piracy: { value: e.v9_piracy, source: 'db' },
    v9_products: { value: products, source: 'db' },
    v9_dept: { value: e.v9_dept, source: 'db' },
    v9_dept_people: { value: deptPeople, source: 'db' },
    v9_industry_segment: { value: e.v9_industry_segment, source: 'db' },
    v9_customer_score: { value: e.v9_customer_score || 0, source: 'db' },
    v9_purchasing_level: { value: e.v9_purchasing_level || 'medium', source: 'db' },
    v9_is_qualified: { value: e.v9_is_qualified, source: 'db' },
    v9_industry_trend: { value: e.v9_industry_trend || 'stable', source: 'db' },
    v9_exclude_reason: { value: excludeReason, source: 'db', analysis: excludeReason },
    v9_phone_marker: { value: e.v9_phone_marker, source: 'db', analysis: phoneAnalysis },
    v9_email_marker: { value: e.v9_email_marker, source: 'db', analysis: emailAnalysis },
    v9_mail_address: { value: (e.v9_mail_address || '').trim().replace(/自主承诺$/, '').trim(), source: 'db', analysis: addrAnalysis },
    v9_mail_trust: { value: e.v9_mail_trust || '-', source: 'db', analysis: { level: e.v9_mail_trust || '中', score: e.v9_mail_trust === '高' ? 85 : e.v9_mail_trust === '中' ? 55 : 25, source: 'calc' } },
    v9_pricing: { value: e.v9_pricing || '标准定价', source: 'db' },
    v9_lc_strategy: { value: e.v9_lc_strategy || '-', source: 'db', analysis: lc },
    v9_visit_sop: { value: e.v9_visit_sop || '-', source: 'db', analysis: sop },
    v9_score_breakdown: e.v9_score_breakdown || '',
    v9_usage_rate: { value: e.v9_usage_rate || 0, source: 'db' },
    dependency_level: { value: e.dependency_level || 'medium', source: 'db' },
    dependency_score: e.dependency_score || 50,

    pricing_data: { value: pricing, source: 'kb' },
    recruit_evidence: { value: recruitEvidence, source: 'niuniuchong' },

    data_flow: {
      keyword_match: { segment: e.v9_industry_segment, confidence: 0.65, matched_keywords: [e.gb_industry_major] },
      semantic_match: { primary_industry: null, primary_confidence: 0, vector_found: false },
      merge_result: { segment: e.v9_industry_segment, confidence: 0.65, method: 'keyword_priority' },
      score_result: { score: percentileScore.score * 0.8, level: percentileScore.level },
    },

    v9_cards: v9Cards,
    _recalculated: false,
    _from_summary_cache: false,
    vendor: { id: 'autodesk', name: 'Autodesk', color: 'orange' },
    related_enterprises: [],

    // ====== 别名字段：兼容 EnterpriseAnalysisPanel 使用的字段名 ======
    gb_industry_minor: { value: e.qcc_industry_major || e.gb_industry_major, source: 'db' },
    registered_capital: { value: e.reg_capital, source: 'db' },
    established_date: { value: e.est_date, source: 'db' },
    business_status: { value: e.reg_status, source: 'db' },
    enterprise_type: { value: e.company_type || '', source: 'db' },
    listing_status: { value: deriveFinancing(e.company_type), source: 'db' },
    usage_department: { value: e.v9_dept || '设计部', source: 'db' },
    department_count: { value: deptPeople, source: 'db' },
    involved_products: { value: products.join('、'), source: 'db' },
    procurement_level: { value: e.v9_purchasing_level || 'medium', source: 'db' },
    install_probability: { value: `${Math.round((e.v9_usage_rate || 0) * 100)}%`, source: 'calc' },
    industry_trend: { value: e.v9_industry_trend || 'stable', source: 'db' },
    financial_health: { value: e.insurance_count > 50 ? '良好' : '一般', source: 'calc' },
    piracy_count: { value: e.v9_piracy, source: 'db' },
    estimated_sets: { value: estimatedCopies, source: 'calc' },
    risk_level: { value: riskLevel, source: 'calc' },
    qualification_level: { value: qualificationLevel, source: 'db' },
    procurement_ability: { value: e.v9_purchasing_level || 'medium', source: 'db' },
    customer_score: { value: e.v9_customer_score || 0, source: 'db' },
    matched_products: { value: products.join('、'), source: 'kb' },
    mail_trust: { value: e.v9_mail_trust || '-', source: 'db' },
    phone_valid: { value: phoneAnalysis.is_effective ? '有效' : '无效', source: 'calc' },
    email_valid: { value: emailAnalysis.is_effective ? '有效' : '无效', source: 'calc' },
    lc_role: { value: lc.name, source: 'calc' },
    sales_role: { value: e.v9_is_qualified ? '重点跟进' : '一般跟进', source: 'calc' },
    urgency: { value: percentileScore.score >= 70 ? '高' : percentileScore.score >= 50 ? '中' : '低', source: 'calc' },
    target_time: { value: lc.cycle, source: 'calc' },
    pricing_strategy: { value: pricing.pricing_strategy, source: 'kb' },
    exclude_reason: { value: excludeReason || '无', source: 'db' },
    recruit_status: { value: recruitEvidence.total_records > 0 ? `发现${recruitEvidence.total_records}条招聘记录` : '未发现招聘记录', source: 'niuniuchong' },
    product_name: { value: pricing.product, source: 'kb' },
    list_price: { value: `¥${pricing.base_price.toLocaleString()}`, source: 'kb' },
    markup_price: { value: `¥${pricing.markup_price.toLocaleString()}`, source: 'kb' },
    discount: { value: `${pricing.volume_discount} / ${pricing.enterprise_discount}`, source: 'kb' },
    final_price: { value: `¥${pricing.final_price.toLocaleString()}`, source: 'kb' },
    lc_strategy: { value: lc.name, source: 'calc' },
    lc_frequency: { value: lc.frequency, source: 'calc' },
    lc_cycle: { value: lc.cycle, source: 'calc' },
    lc_action_plan: { value: lc.actions.join(' → '), source: 'calc' },
    visit_process: { value: sop.name, source: 'calc' },
    visit_cycle: { value: sop.total_days, source: 'calc' },
    visit_person: { value: (sop.required_roles || []).join('、'), source: 'calc' },
    visit_steps: { value: (sop.steps || []).join(' → '), source: 'calc' },
  };
}

// ============================================================
// V1.79 字段计算辅助函数
// ============================================================

function parseProducts(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  return raw.replace(/["'\[\]]/g, '').split(',').map(p => p.trim()).filter(p => p);
}

function calcPercentileScore(e: any) {
  const score = Math.round((e.v9_quality_score || 50) * 0.6 + (e.v9_customer_score || 50) * 0.3 + (e.dependency_score || 50) * 0.1);
  let level = 'E';
  if (score >= 85) level = 'A';
  else if (score >= 70) level = 'B';
  else if (score >= 50) level = 'C';
  else if (score >= 30) level = 'D';
  const levelDesc: Record<string, string> = { A: '核心目标客户', B: '高价值潜客', C: '一般跟进对象', D: '低优先级线索', E: '暂不推荐' };

  const dims = {
    demand: { score: Math.round(score * 0.30), max: 30, name: '需求潜力',
      factors: [{ name: '盗版数量', weight: 0.6 }, { name: '产品匹配度', weight: 0.4 }],
    },
    quality: { score: Math.round(score * 0.25), max: 25, name: '企业质量',
      factors: [{ name: '参保人数', weight: 0.35 }, { name: '注册资本', weight: 0.25 }, { name: '采购能力', weight: 0.25 }, { name: '企业资质', weight: 0.15 }],
    },
    reachability: { score: Math.round(score * 0.20), max: 20, name: '可触达性',
      factors: [{ name: '联系方式有效性', weight: 0.5 }, { name: '邮寄地址信任度', weight: 0.3 }, { name: '行业趋势', weight: 0.2 }],
    },
    conversion: { score: Math.round(score * 0.25), max: 25, name: '成交概率',
      factors: [{ name: '依赖程度', weight: 0.4 }, { name: '资质等级', weight: 0.3 }, { name: '经营状态', weight: 0.2 }, { name: '部门人数占比', weight: 0.1 }],
    },
  };

  const breakdown = `企业质量评分:${dims.quality.score}/${dims.quality.max} + 成交概率评分:${dims.conversion.score}/${dims.conversion.max} = ${dims.quality.score + dims.conversion.score}/${dims.quality.max + dims.conversion.max} → 百分制:${score}`;

  return { score, level, level_desc: levelDesc[level] || '', breakdown, dimensions: dims };
}

function calcPiracyCopies(e: any, products: string[]): number {
  const insurance = e.insurance_count || 0;
  if (insurance <= 0) return 1;
  const deptRatio = products.length >= 3 ? 0.35 : products.length >= 2 ? 0.25 : 0.15;
  return Math.max(1, Math.min(Math.floor(insurance * deptRatio * 0.85 * 1.2), insurance));
}

function calcLCStrategy(score: number, _dependency?: string) {
  let code = 'LC_D', name = '入池观察', frequency = '季度EDM+年度回访', cycle = '16周+';
  let actions = ['入库标记', '自动邮件触达', '等待触发事件'];
  if (score >= 85) {
    code = 'LC_A'; name = '积极跟进'; frequency = '每周联系+上门拜访';
    actions = ['48小时内首次联系', '安排技术演示', '高层对接', '定制方案报价']; cycle = '2-4周';
  } else if (score >= 70) {
    code = 'LC_B'; name = '常规维护'; frequency = '双周联系+季度拜访';
    actions = ['1周内首次联系', '发送产品资料', '邀请线上演示', '标准报价']; cycle = '4-8周';
  } else if (score >= 50) {
    code = 'LC_C'; name = '长期培育'; frequency = '月度EDM+半年拜访';
    actions = ['加入邮件列表', '定期推送行业资讯', '邀请线下活动', '关注需求变化']; cycle = '8-16周';
  }
  return { code, name, frequency, actions, cycle, source: 'calc' };
}

function calcVisitSOP(score: number, lcStrategy: string) {
  let code = 'SOP_Light', name = '轻量跟进流程', totalDays = '2-3天';
  let steps = ['1. 远程接触: 邮件/电话初步沟通', '2. 资料推送: 发送产品资料', '3. 需求确认: 确认正版化意向', '4. 远程演示: 线上产品演示(可选)'];
  let requiredRoles = ['客户经理'];
  if (lcStrategy === 'LC_A' || score >= 85) {
    code = 'SOP_Premium'; name = '高级拜访流程'; totalDays = '10-14天';
    steps = ['1. 背景调研(1天)', '2. 首次接触(1天)', '3. 技术POC(3-5天)', '4. 高层对接(1天)', '5. 方案报价(2天)', '6. 参观考察(1天)', '7. 商务谈判(1-2天)'];
    requiredRoles = ['客户经理', '技术顾问', '销售总监'];
  } else if (lcStrategy === 'LC_B' || score >= 70) {
    code = 'SOP_Standard'; name = '标准拜访流程'; totalDays = '5-7天';
    steps = ['1. 初次接触(1天)', '2. 需求调研(1-2天)', '3. 方案演示(1天)', '4. 报价跟进(1-2天)', '5. 签约落地(1天)'];
    requiredRoles = ['客户经理', '技术顾问'];
  }
  return { code, name, steps, total_days: totalDays, required_roles: requiredRoles, source: 'calc' };
}

function calcPricing(productName: string, copies: number, insurance: number) {
  const basePrice = productName === 'Revit' ? 26800 : productName === 'Inventor' ? 24800 : productName === '3ds Max' ? 18800 : productName === 'Maya' ? 22800 : 12800;
  const volumeDiscount = copies >= 50 ? 0.3 : copies >= 20 ? 0.2 : copies >= 10 ? 0.1 : 0;
  const enterpriseDiscount = insurance >= 1000 ? 0.15 : insurance >= 500 ? 0.1 : insurance >= 200 ? 0.05 : 0;
  const markupPrice = Math.round(basePrice * 1.3);
  const finalPrice = Math.round(markupPrice * (1 - volumeDiscount) * (1 - enterpriseDiscount));
  return {
    product: productName,
    base_price: basePrice,
    markup_price: markupPrice,
    markup_rate: '30%',
    piracy_copies: copies,
    volume_discount: `${Math.round(volumeDiscount * 100)}%`,
    enterprise_discount: `${Math.round(enterpriseDiscount * 100)}%`,
    final_price: finalPrice,
    pricing_strategy: volumeDiscount > 0 ? '批量折扣' : (enterpriseDiscount > 0 ? '企业折扣' : '标准定价'),
    vendor: 'autodesk',
  };
}

function buildV9Cards(e: any, ps: any, products: string[], copies: number, deptPeople: number, lc: any, sop: any, pricing: any) {
  const piracyCount = e.v9_piracy || 0;
  let riskLevel = '无风险', riskColor = 'success';
  if (piracyCount >= 10) { riskLevel = '极高风险'; riskColor = 'danger'; }
  else if (piracyCount >= 6) { riskLevel = '高风险'; riskColor = 'danger'; }
  else if (piracyCount >= 3) { riskLevel = '中风险'; riskColor = 'warning'; }
  else if (piracyCount >= 1) { riskLevel = '低风险'; riskColor = 'warning'; }

  const qualified = e.v9_is_qualified || 0;
  const qualifiedText = qualified ? '合格' : '不合格';

  return [
    {
      id: 'piracy_risk', title: '企业资质', icon: 'ShieldAlert', color: riskColor,
      items: [
        { label: '盗版数量', value: piracyCount, unit: '个' },
        { label: '估算套数', value: copies, unit: '套' },
        { label: '风险等级', value: riskLevel },
        { label: 'V9评分', value: (e.v9_quality_score || 0).toFixed(2), unit: '分' },
      ],
      conclusion: piracyCount > 0 ? `发现 ${piracyCount} 个盗版产品，估算 ${copies} 套，${riskLevel}。` : '未发现盗版产品。',
    },
    {
      id: 'qualification', title: '企业关联', icon: 'Award', color: qualified ? 'success' : 'warning',
      items: [
        { label: '资质等级', value: qualifiedText },
        { label: '采购能力', value: e.v9_purchasing_level || '-' },
        { label: '依赖程度', value: e.dependency_level || '-' },
        { label: '客户评分', value: e.v9_customer_score || 0, unit: '分' },
      ],
      conclusion: qualified ? `资质等级为 ${qualifiedText}，具备正版化采购潜力。` : '资质等级较低，建议长期观察后再推进。',
    },
    {
      id: 'product_usage', title: '近期利好', icon: 'Package', color: products.length > 0 ? 'primary' : 'muted',
      items: [
        { label: '匹配产品', value: products.length, unit: '款' },
        { label: '核心产品', value: e.core_product || '-' },
        { label: '使用部门', value: e.v9_dept || '-' },
        { label: '部门人数', value: deptPeople || 0, unit: '人' },
      ],
      conclusion: products.length > 0 ? `使用 ${products.length} 款产品，核心产品为 ${e.core_product || '未知'}。` : '未识别到具体产品使用信息。',
    },
    {
      id: 'contact_strategy', title: '负面情况', icon: 'PhoneCall', color: 'accent',
      items: [
        { label: '邮寄信任度', value: e.v9_mail_trust || '-' },
        { label: 'LC策略', value: lc.name },
        { label: '拜访SOP', value: sop.name },
        { label: '联系电话', value: e.phone || '-' },
      ],
      conclusion: `建议采用「${sop.name}」流程进行联络。`,
    },
    {
      id: 'industry_trend', title: '盗版证据', icon: 'TrendingUp', color: 'primary',
      items: [
        { label: '行业趋势', value: e.v9_industry_trend || '-' },
        { label: '定价策略', value: pricing.pricing_strategy },
        { label: '排除原因', value: e.v9_exclude_reason || '无' },
        { label: '定价结果', value: `¥${pricing.final_price.toLocaleString()}`, unit: `/套` },
      ],
      conclusion: `建议${pricing.pricing_strategy}，单套定价 ¥${pricing.final_price.toLocaleString()}。`,
    },
    {
      id: 'score_detail', title: '评分明细', icon: 'BarChart3', color: ps.level === 'A' ? 'success' : ps.level === 'E' ? 'danger' : 'primary',
      items: Object.values(ps.dimensions).map((d: any) => ({
        label: d.name, value: d.score, unit: `/${d.max}${d.is_penalty ? '(扣分)' : ''}`,
      })),
      conclusion: `百分制评分 ${ps.score} 分 (${ps.level}级-${ps.level_desc})，${ps.breakdown}`,
    },
  ];
}

function analyzePhones(raw: string) {
  const phones: string[] = raw ? (() => { try { return JSON.parse(raw); } catch { return [raw]; } })() : [];
  const valid = phones.filter((p: string) => p && p !== '[]' && p !== '--' && p !== '无');
  return {
    raw_count: phones.length,
    valid_count: valid.length,
    has_mobile: valid.some((p: string) => p.replace(/\D/g, '').length === 11),
    has_landline: valid.some((p: string) => p.replace(/\D/g, '').length < 11),
    is_effective: valid.length > 0,
    phones: valid.map((p: string) => ({ number: p, type: p.replace(/\D/g, '').length === 11 ? 'mobile' : 'landline', valid: true })),
  };
}

function analyzeEmails(raw: string) {
  const emails: string[] = raw ? (() => { try { return JSON.parse(raw); } catch { return [raw]; } })() : [];
  const valid = emails.filter((e: string) => e && e !== '[]' && e !== '无' && e.includes('@'));
  return {
    raw_count: emails.length,
    valid_count: valid.length,
    has_corporate: valid.some((e: string) => {
      const domain = e.split('@')[1]?.toLowerCase();
      return domain && !['qq.com', '163.com', '126.com', 'gmail.com', 'hotmail.com', 'sina.com'].includes(domain);
    }),
    is_effective: valid.length > 0,
    emails: valid.map((e: string) => ({ address: e, valid: true, is_corporate: true, domain: e.split('@')[1] || '' })),
  };
}

function analyzeAddress(raw: string) {
  if (!raw || raw === '[]' || raw === '无') return { address: '', is_effective: false, trust_level: '无', trust_score: 0 };
  return { address: raw, is_effective: raw.length > 5, trust_level: '中', trust_score: 60 };
}

function deriveFinancing(companyType: string): string {
  if (!companyType) return '';
  if (companyType.includes('上市')) return '上市';
  if (companyType.includes('股份有限')) return '股份制';
  if (companyType.includes('外商投资') || companyType.includes('外资')) return '外资/合资';
  return '未上市';
}

function buildRecruitEvidence(name: string) {
  const hash = name.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 10;
  if (hash < 3) return { total_records: 0, platforms: [], latest_jobs: [], has_contact: false };
  const platforms = ['Boss直聘', '智联招聘', '猎聘'].slice(0, hash);
  return {
    total_records: hash * 3,
    platforms,
    latest_jobs: [
      { title: `${hash >= 5 ? 'CAD' : 'BIM'}设计师`, location: '不限', platform: platforms[0], url: '#' },
    ],
    has_contact: hash >= 5,
  };
}

// ============================================================
// API 路由
// ============================================================

const ANALYSIS_FIELDS = [
  { field: 'company_name', label: '企业名称', type: 'text', category: 'basic', sortable: true },
  { field: 'province', label: '省份', type: 'enum', category: 'basic', sortable: true },
  { field: 'city', label: '城市', type: 'text', category: 'basic', sortable: true },
  { field: 'gb_industry_major', label: '行业大类', type: 'enum', category: 'basic', sortable: true },
  { field: 'insurance_count', label: '参保人数', type: 'number', category: 'basic', sortable: true },
  { field: 'reg_capital', label: '注册资本', type: 'text', category: 'basic', sortable: true },
  { field: 'v9_piracy', label: '盗版指数', type: 'number', category: 'piracy', sortable: true },
  { field: 'v9_is_qualified', label: '是否优质线索', type: 'number', category: 'piracy', sortable: true },
  { field: 'v9_quality_score', label: '质量评分', type: 'number', category: 'piracy', sortable: true },
  { field: 'v9_products', label: '涉及产品', type: 'text', category: 'piracy', sortable: false },
  { field: 'v9_customer_score', label: '客户价值评分', type: 'number', category: 'piracy', sortable: true },
  { field: 'v9_industry_segment', label: '行业细分', type: 'enum', category: 'piracy', sortable: true },
  { field: 'v9_purchasing_level', label: '采购等级', type: 'enum', category: 'piracy', sortable: true },
  { field: 'dependency_level', label: '依赖等级', type: 'text', category: 'piracy', sortable: true },
  { field: 'dependency_score', label: '依赖评分', type: 'number', category: 'piracy', sortable: true },
  { field: 'core_product', label: '核心产品', type: 'text', category: 'piracy', sortable: false },
  { field: 'v9_industry_trend', label: '行业趋势', type: 'text', category: 'piracy', sortable: false },
  { field: 'v9_dept', label: '使用部门', type: 'text', category: 'piracy', sortable: true },
  { field: 'v9_dept_people', label: '部门人数', type: 'number', category: 'piracy', sortable: true },
  { field: 'v9_usage_rate', label: '使用率', type: 'number', category: 'piracy', sortable: true },
  { field: 'legal_person', label: '法定代表人', type: 'text', category: 'basic', sortable: true },
  { field: 'est_date', label: '成立日期', type: 'date', category: 'basic', sortable: true },
  { field: 'reg_status', label: '经营状态', type: 'enum', category: 'basic', sortable: true },
  { field: 'credit_code', label: '统一社会信用代码', type: 'text', category: 'basic', sortable: true },
];

router.get('/analysis/vendors', (_req, res) => {
  res.json({
    success: true,
    data: {
      vendors: [
        { id: 'autodesk', name: 'Autodesk', nameEn: 'Autodesk', color: 'orange', icon: 'A', description: 'Autodesk产品' },
        { id: 'siemens', name: 'Siemens', nameEn: 'Siemens', color: 'sky', icon: 'S', description: 'Siemens产品' },
        { id: 'ansys', name: 'ANSYS', nameEn: 'ANSYS', color: 'red', icon: 'An', description: 'ANSYS产品' },
        { id: 'ptc', name: 'PTC', nameEn: 'PTC', color: 'blue', icon: 'P', description: 'PTC产品' },
      ],
      default: 'autodesk',
    },
  });
});

router.get('/analysis/fields', (_req, res) => {
  res.json({ fields: ANALYSIS_FIELDS, total: ANALYSIS_FIELDS.length });
});

router.get('/analysis/advanced', (req, res) => {
  const { province, city, industry, piracy_min, piracy_max, score_min, score_max, page = '1', page_size = '20' } = req.query;
  let filtered = [...MOCK_ENTERPRISES];
  if (province) filtered = filtered.filter(e => e.province === province);
  if (city) filtered = filtered.filter(e => e.city.includes(city as string));
  if (industry) filtered = filtered.filter(e => e.gb_industry_major === industry || e.v9_industry_segment === industry);
  if (piracy_min) filtered = filtered.filter(e => e.v9_piracy >= Number(piracy_min));
  if (piracy_max) filtered = filtered.filter(e => e.v9_piracy <= Number(piracy_max));
  if (score_min) filtered = filtered.filter(e => e.v9_quality_score >= Number(score_min));
  if (score_max) filtered = filtered.filter(e => e.v9_quality_score <= Number(score_max));
  const total = filtered.length;
  const pg = Math.max(1, Number(page));
  const ps = Math.min(100, Math.max(1, Number(page_size)));
  res.json({ total, page: pg, page_size: ps, data: filtered.slice((pg - 1) * ps, pg * ps) });
});

router.get('/enterprise/provinces', (_req, res) => { res.json({ provinces: MOCK_PROVINCES }); });
router.get('/enterprise/industries', (_req, res) => { res.json({ industries: MOCK_INDUSTRIES }); });

router.get('/enterprise/search', (req, res) => {
  const { keyword, page = '1', page_size = '20' } = req.query;
  let filtered = MOCK_ENTERPRISES;
  if (keyword) {
    const kw = (keyword as string).toLowerCase();
    filtered = filtered.filter(e => e.company_name.toLowerCase().includes(kw) || e.legal_person.toLowerCase().includes(kw));
  }
  const total = filtered.length;
  const pg = Math.max(1, Number(page));
  const ps = Math.min(100, Math.max(1, Number(page_size)));
  res.json({ total, page: pg, page_size: ps, data: filtered.slice((pg - 1) * ps, pg * ps) });
});

// ⭐ 核心：单企业分析 API - 对齐 V1.79 analyzeCompany 返回格式
router.get('/analysis/single', (req, res) => {
  const { keyword } = req.query;
  if (!keyword) { res.status(400).json({ error: '请输入企业名称' }); return; }
  const kw = (keyword as string).toLowerCase();
  const found = MOCK_ENTERPRISES.find(e => e.company_name.toLowerCase().includes(kw));
  if (found) {
    const result = buildV179Result(found);
    res.json({ success: true, data: result });
  } else {
    res.json({ success: false, error: '未找到该企业' });
  }
});

router.post('/enterprise/batch-names', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) { res.json({ success: false, error: 'ids必须是数组' }); return; }
  const results = (ids as number[]).map(id => {
    const found = MOCK_ENTERPRISES.find(e => e.id === id);
    return found ? { id, name: found.company_name } : { id, name: null, error: '未找到' };
  });
  res.json({ success: true, data: results });
});

// 联网信息查询 - 对齐 V1.79 在线信息10小节结构
router.post('/ai/online-info/query', (req, res) => {
  const { enterpriseName } = req.body;
  const name = enterpriseName || '';
  const hash = name.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 10;

  res.json({
    success: true,
    data: {
      enterpriseName: name,
      enterpriseQualification: {
        level: hash >= 7 ? '高新技术企业' : hash >= 4 ? '科技型中小企业' : '一般企业',
        qualification: hash >= 7 ? '国家高新技术企业' : hash >= 4 ? '省市级科技企业' : '未获取',
        certificates: hash >= 6 ? ['ISO9001质量管理体系认证', '软件企业认定证书'] : [],
        source: '联网搜索',
      },
      enterpriseRelation: {
        subsidiaries: hash >= 7 ? [{ name: `${name}科技分公司`, province: '本地' }] : [],
        branches: hash >= 5 ? [{ name: `${name}办事处`, province: '本地' }] : [],
        legal_person_companies: hash >= 6 ? ['关联企业A', '关联企业B'] : [],
        total_related: hash >= 7 ? 3 : hash >= 5 ? 2 : hash >= 3 ? 1 : 0,
        source: '联网搜索',
      },
      recentGoodNews: {
        exhibitions: hash >= 6 ? [{ name: '2025中国建筑科技博览会', date: '2025-06' }] : [],
        recruitment: hash >= 5 ? [{ title: 'BIM工程师', count: hash }] : [],
        awards: hash >= 7 ? ['省级优秀工程设计奖'] : [],
        expansion: hash >= 6 ? ['2025年新增分支机构'] : [],
        source: '联网搜索',
      },
      negativeSituation: {
        lawsuits: hash >= 8 ? [{ title: '合同纠纷案', date: '2025' }] : [],
        restricted: hash >= 8 ? ['限制高消费'] : [],
        wage_arrears: [],
        penalties: hash >= 7 ? [{ title: '环保处罚', date: '2024' }] : [],
        risk_level: hash >= 8 ? '高' : hash >= 5 ? '中' : '低',
        source: '联网搜索',
      },
      piracyEvidence: {
        evidence_count: hash >= 6 ? 3 : hash >= 4 ? 1 : 0,
        evidence: hash >= 6 ? ['招聘CAD/BIM相关岗位', '业务需要使用专业设计软件', '公司网站展示设计作品'] : [],
        job_count: hash >= 6 ? 5 : hash >= 4 ? 2 : 0,
        job_titles: hash >= 6 ? ['CAD绘图员', 'BIM工程师', '3D设计师'] : [],
        risk_level: hash >= 7 ? '高风险' : hash >= 5 ? '中风险' : '低风险/无',
        source: '联网搜索',
      },
      otherConcerns: {
        industry_trend: hash >= 6 ? '行业增长稳定，数字化需求上升' : '行业平稳发展',
        market_position: hash >= 7 ? '区域领先企业' : '中小型企业',
        financial_health: hash >= 6 ? '财务状况良好' : '信息不足',
        risk_factors: hash >= 7 ? ['行业竞争加剧'] : [],
        source: '联网搜索',
      },
      productUsageScenario: {
        scenarios: hash >= 5 ? ['建筑设计', 'BIM协同', '施工图绘制'] : ['基础CAD制图'],
        departments: hash >= 5 ? ['设计部', 'BIM中心'] : ['技术部'],
        workflow: '从概念设计到施工图全过程使用CAD/BIM工具',
        software_mentioned: hash >= 5 ? ['AutoCAD', 'Revit'] : ['AutoCAD'],
        source: '联网搜索',
      },
      productDependency: {
        level: hash >= 7 ? '高度依赖' : hash >= 5 ? '中度依赖' : '低度依赖',
        score: hash >= 7 ? '0.85' : hash >= 5 ? '0.65' : '0.35',
        reason: '企业核心业务流程依赖Autodesk产品线完成设计交付',
        alternatives: hash >= 7 ? ['暂无有效替代方案'] : hash >= 5 ? ['部分业务可用国产CAD替代'] : ['可用开源工具部分替代'],
        source: '联网分析',
      },
      insuranceChange: {
        trend: hash >= 6 ? '上升趋势' : hash >= 4 ? '稳定' : '波动',
        summary: hash >= 6 ? '近年参保人数稳步增长，反映企业规模扩大' : '参保人数基本稳定',
        years: [
          { year: 2023, count: Math.round(28 * (1 + (hash - 5) * 0.03)), change: hash >= 6 ? '+增长' : '稳定' },
          { year: 2024, count: Math.round(30 * (1 + (hash - 5) * 0.05)), change: hash >= 6 ? '+增长' : '稳定' },
          { year: 2025, count: Math.round(32 * (1 + (hash - 5) * 0.07)), change: hash >= 6 ? '+增长' : '微降' },
        ],
        source: '联网搜索',
      },
      contactInfo: {
        phones: hash >= 5 ? ['0755-86691234', '13925250001'] : ['0755-86691234'],
        emails: hash >= 5 ? ['hr@huachuang-sz.cn'] : [],
        website: hash >= 4 ? 'www.example.cn' : '',
        address: '广东省深圳市南山区科技园A栋',
        shared_phone_count: hash >= 6 ? 3 : 0,
        related_enterprise_count: hash >= 6 ? 2 : 0,
        source: '数据库反查',
      },
      _sources_count: hash >= 7 ? 5 : hash >= 4 ? 3 : 1,
      _query_timestamp: new Date().toISOString(),
    },
  });
});

// 企业联系方式分析
router.post('/enterprise/contact-analyze', (req, res) => {
  const { enterpriseName } = req.body;
  const contact = MOCK_ENTERPRISES.find(e => e.company_name.includes(enterpriseName || ''));
  res.json({
    success: true,
    data: {
      enterpriseName: contact?.company_name || enterpriseName,
      phone: contact?.phone || '未知',
      email: contact?.email || '未知',
      legal_person: contact?.legal_person || '未知',
      address: contact?.reg_address || '',
      website: contact?.website || '',
    },
  });
});

// 招聘数据 - 对齐 V1.79 牛牛虫招聘爬取卡片格式
router.get('/recruit/db', (req, res) => {
  const { enterprise, name } = req.query;
  const keyword = (enterprise || name || '') as string;
  const hash = keyword.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 10;

  if (hash < 3) {
    res.json({ success: true, data: [] });
    return;
  }

  const platforms = ['Boss直聘', '智联招聘', '猎聘', '前程无忧'];
  const recruitData = [];
  const count = Math.min(hash, 6);

  for (let i = 0; i < count; i++) {
    const roleIndex = (hash + i) % rolesPool.length;
    recruitData.push({
      id: 10000 + hash * 100 + i,
      enterprise_name: keyword,
      job_title: rolesPool[roleIndex],
      location: ['深圳', '广州', '北京', '上海', '杭州', '成都'][hash % 6],
      contact_person: hash >= 6 ? ['张经理', '李主管'][i % 2] : '',
      phone: hash >= 6 ? `13${Math.floor(Math.random() * 9)}${String(Math.random()).slice(2, 11)}` : '',
      source_platform: platforms[i % platforms.length],
      salary: ['8-15K', '15-25K', '20-35K', '25-40K', '10-18K'][i % 5],
      detail_url: hash >= 4 ? `https://example.com/jobs/${10000 + hash * 100 + i}` : '',
      screenshot: hash >= 5 ? `https://example.com/screenshots/${10000 + hash * 100 + i}.png` : '',
      keyword: keyword,
      description: `${keyword}正在招聘${rolesPool[roleIndex]}，要求熟练使用AutoCAD等设计软件，参与过大型工程项目者优先。`,
    });
  }

  res.json({ success: true, data: recruitData });
});

const rolesPool = ['CAD绘图员', 'BIM工程师', '3D设计师', '建筑设计师', '结构工程师', '室内设计师', 'Revit建模师', '效果图渲染师'];

router.get('/knowledge', (_req, res) => {
  res.json({ data: { items: [], categories: ['盗版检测', '正版化方案', '行业分析'], total: 0 } });
});

export default router;