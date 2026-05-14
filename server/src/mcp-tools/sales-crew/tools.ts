import { mcpRegistry } from '../_core/index.js';
import { getDatabase } from '../../config/database.js';

// ==========================================
// 销售作战团队 - 专属工具
// 为销售Agent提供CRM查询、话术生成等能力
// 身份定位：深耕几十年的信誉非常好的老牌软件代理商
// 核心原则：
//   1. 所有话术必须明确"我们是代理商，不是厂商官方"
//   2. 强调代理商独特价值：本地化服务、灵活价格、快速响应、法务协同
//   3. 法务场景中，定位是"客户与厂商法务之间的桥梁和缓冲带"
//   4. 严禁以厂商官方口吻说话
// ==========================================

export function registerSalesTools(): void {
  // CRM客户查询工具
  mcpRegistry.registerTool({
    name: 'crm-query',
    description: '查询CRM系统中的客户信息',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'search'], description: '查询类型' },
        customerId: { type: 'number', description: '客户ID（get时使用）' },
        keyword: { type: 'string', description: '搜索关键词（search时使用）' },
        vendor: { type: 'string', enum: ['autodesk', 'sketchup', 'adobe', 'dassault'], description: '厂商筛选' },
        status: { type: 'string', enum: ['lead', 'contacted', 'negotiating', 'closed', 'lost'], description: '客户状态筛选' },
        limit: { type: 'number', description: '返回数量限制', default: 20 },
      },
      required: ['action'],
    },
    execute: async ({ action, customerId, keyword, vendor, status, limit = 20 }) => {
      try {
        const db = getDatabase();
        switch (action) {
          case 'list': {
            let sql = 'SELECT * FROM crm_customers WHERE 1=1';
            const params: any[] = [];
            if (vendor) { sql += ' AND vendor = ?'; params.push(vendor); }
            if (status) { sql += ' AND status = ?'; params.push(status); }
            sql += ' ORDER BY updated_at DESC LIMIT ?';
            params.push(limit);
            const customers = db.prepare(sql).all(...params);
            return { success: true, data: customers };
          }
          case 'get': {
            if (!customerId) return { success: false, error: '缺少customerId参数' };
            const customer = db.prepare('SELECT * FROM crm_customers WHERE id = ?').get(customerId);
            if (!customer) return { success: false, error: '客户不存在' };
            const followUps = db.prepare('SELECT * FROM crm_follow_ups WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
            return { success: true, data: { ...customer, follow_ups: followUps } };
          }
          case 'search': {
            if (!keyword) return { success: false, error: '缺少keyword参数' };
            const like = `%${keyword}%`;
            const customers = db.prepare(
              'SELECT * FROM crm_customers WHERE name LIKE ? OR company LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY updated_at DESC LIMIT ?'
            ).all(like, like, like, like, limit);
            return { success: true, data: customers };
          }
          default:
            return { success: false, error: '未知的查询类型' };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  });

  // 话术生成工具 - 强化代理商身份定位
  mcpRegistry.registerTool({
    name: 'script-generator',
    description: '根据场景生成销售话术，严格体现代理商身份',
    parameters: {
      type: 'object',
      properties: {
        scenario: { type: 'string', enum: ['first_contact', 'follow_up', 'demo', 'negotiation', 'objection', 'legal_compliance'], description: '销售场景' },
        vendor: { type: 'string', enum: ['autodesk', 'sketchup', 'adobe', 'dassault'], description: '厂商' },
        customerType: { type: 'string', description: '客户类型' },
        painPoint: { type: 'string', description: '客户痛点' },
        tone: { type: 'string', enum: ['professional', 'friendly', 'urgent', 'consultative'], description: '语气风格' },
      },
      required: ['scenario', 'vendor'],
    },
    execute: async ({ scenario, vendor }) => {
      const scripts: Record<string, Record<string, string>> = {
        autodesk: {
          first_contact: '您好，我是[公司名称]的软件顾问。先跟您明确一下身份：我们是Autodesk的正规授权代理商，一家深耕行业二十多年的老牌代理商，不是Autodesk官方本身。我们专注于为企业提供Autodesk全系列软件的授权和技术支持服务。作为代理商，我们的核心优势是比官方更灵活的价格方案、更快速的本地化响应、更贴心的上门服务。了解到贵公司在设计和工程领域的业务，想请教一下目前使用的设计软件情况，看看我们能否为贵公司提供比官方更优质、更灵活的解决方案。',
          follow_up: '张经理您好，上次沟通后我整理了一份针对贵公司AEC业务的Autodesk方案。作为老牌代理商，我们不仅提供软件授权，更有专业的技术团队为您提供全程支持。方案中包含Revit和AutoCAD的最新功能介绍，以及我们代理商独有的专属技术支持、上门培训和灵活的付款方式。想约个时间给您详细汇报，您看这周方便吗？',
          demo: '今天我将为您演示Autodesk Revit 2026的核心功能，特别是BIM协同设计和自动化出图功能。再次说明，我们是Autodesk的正规授权代理商，不是官方。作为老牌代理商，我们不仅提供软件授权，更有专业的技术团队为您提供上门实施、现场培训和7x24小时响应服务——这些是官方无法提供的。确保贵公司能够快速上手并发挥软件最大价值。',
          negotiation: '关于Autodesk产品的价格，作为老牌代理商，我们能够提供比官方更灵活的授权方式和更有竞争力的价格。针对贵公司的规模，我建议采用企业级订阅方案，可以享受批量折扣和专属的售后服务。而且作为代理商，我们支持分期付款、临时授权扩展等灵活方式，官方是没有这些政策的。',
          objection: '您提到目前使用其他软件，这很正常。作为Autodesk的老牌代理商，我们的优势不仅在于产品本身，更在于我们深耕行业多年积累的服务经验。您可能会问：为什么不直接找官方？原因很简单——官方只卖软件，我们作为代理商提供的是全套服务：更灵活的价格、更快的响应、上门支持、培训服务。我可以为您安排一个对比演示，让您直观感受差异，同时了解我们代理商的增值服务。',
          legal_compliance: 'X总，您好。我是[公司名称]的软件顾问，我们是一家深耕行业多年的Autodesk正规授权代理商。了解到贵公司目前可能面临一些软件合规方面的问题，我想先明确我们的角色：我们不是Autodesk的法务部门，我们是来帮助您的。作为老牌代理商，我们经常协助企业处理与厂商法务的对接事务。我们的价值在于——帮您以最小的成本、最稳妥的方式化解合规风险。您先说说目前的情况，我帮您分析一下最优的解决方案。',
        },
        sketchup: {
          first_contact: '您好，我是[公司名称]的软件顾问。我们是SketchUp的正规授权代理商，一家深耕行业多年的老牌代理商。作为代理商，我们比官方更了解本地市场，能够提供更灵活的价格方案和更贴心的本地化服务。了解到贵公司在建筑和室内设计方面的项目，想了解一下目前使用的设计工具，SketchUp可能是您的理想选择——而且通过我们代理商购买，价格更优惠，服务更贴心。',
          follow_up: '李工您好，上次提到的SketchUp Studio方案我已经准备好了。作为老牌代理商，我们不仅提供软件授权，还提供免费的上門培训、认证服务和7x24小时技术支持。方案包含3D建模、渲染和VR展示功能，特别适合贵公司的项目需求。您看什么时候方便，我可以带设备上门演示。',
          demo: '今天我将演示SketchUp Studio的最新功能，特别是实时渲染和VR体验。再次明确：我们是SketchUp的正规授权代理商，不是官方。作为老牌代理商，我们提供上门演示、现场培训和持续的技术支持服务——让您不仅买到软件，更获得全程陪伴的服务体验。',
          negotiation: 'SketchUp提供灵活的订阅方案，从Pro到Studio不同级别。作为老牌代理商，我们能够提供比官方更优惠的价格和更贴心的服务。针对贵公司的需求，我建议Studio版本，包含完整的工具集。而且通过代理商购买，您可以享受分期付款、批量折扣等官方没有的政策。',
          objection: '您担心学习成本？SketchUp以易用性著称，大部分设计师一周内就能上手。作为老牌代理商，我们提供免费的上门培训和认证服务，还有专业的技术支持团队随时为您解答问题。官方卖完软件就不管了，我们作为代理商是要长期服务您的。',
          legal_compliance: 'X总，了解到贵公司在SketchUp使用方面可能有些合规顾虑。我先说明身份：我们是SketchUp的正规授权代理商，不是官方法务。我们的角色是帮助您化解风险，而不是给您施压。作为老牌代理商，我们有丰富的经验协助企业处理软件合规事务。我们可以帮您评估现状、制定补购方案、甚至代表您与厂商沟通，争取最优条件。您先告诉我具体情况，我们一起想办法。',
        },
        adobe: {
          first_contact: '您好，我是[公司名称]的软件顾问。我们是Adobe的正规授权代理商，一家深耕行业多年的老牌代理商。作为代理商，我们能够提供比官方更灵活的企业授权方案和更优惠的价格。了解到贵公司在创意和内容制作方面的需求，Adobe Creative Cloud企业版可能正是您需要的——而且通过我们代理商，价格更灵活，服务更贴心。',
          follow_up: '王总监您好，上次沟通的Adobe CC团队版方案已经准备好了。作为老牌代理商，我们不仅提供软件授权，还提供专属的技术支持、上门培训和灵活的付款方式。方案包含Photoshop、Illustrator和Premiere Pro等全套工具，确保您的团队能够高效使用。',
          demo: '今天我将展示Adobe Firefly AI功能，这是Adobe最新的生成式AI工具。明确身份：我们是Adobe的正规授权代理商。作为老牌代理商，我们不仅提供软件授权，更有专业的技术团队为您提供上门实施、现场培训和持续支持——确保您的投资物有所值。',
          negotiation: 'Adobe企业版提供灵活的授权管理，支持按用户数和设备数授权。作为老牌代理商，我们能够提供比官方更优惠的价格和更灵活的付款方式。我们还有教育优惠、非营利组织折扣，以及官方没有的分期付款方案。',
          objection: '您提到预算限制？作为老牌代理商，我们提供分期付款方案，而且我们的工具能显著提升团队效率，ROI通常在6个月内就能体现。此外，我们还提供免费的培训和技术支持。官方的价格是固定的，我们作为代理商可以根据您的实际情况灵活调整方案。',
          legal_compliance: 'X总，听说贵公司在Adobe软件使用方面可能需要一些合规支持。我先明确：我们是Adobe的正规授权代理商，不是官方法务部门。我们的立场是帮助您，不是为难您。作为老牌代理商，我们经常协助企业处理软件合规问题。我们的服务包括：风险评估、补购方案设计、与厂商法务的沟通协调。目标是帮您以最小成本化解风险，同时建立长期的正版化管理体系。您先说说情况，我帮您分析。',
        },
        dassault: {
          first_contact: '您好，我是[公司名称]的软件顾问。我们是达索系统SOLIDWORKS的正规授权代理商，一家深耕行业多年的老牌代理商。作为代理商，我们能够提供比官方更灵活的授权方案和更贴心的本地化服务。了解到贵公司在机械设计和制造方面的业务，SOLIDWORKS可能是提升设计效率的理想工具——而且通过代理商购买，服务更贴心，响应更快速。',
          follow_up: '赵经理您好，上次沟通的SOLIDWORKS Professional方案我已经详细评估了。作为老牌代理商，我们不仅提供软件，还提供专业的技术支持、上门培训和灵活的付款方式。方案包含Simulation和PDM功能，非常适合贵公司的产品开发流程。',
          demo: '今天我将演示SOLIDWORKS 2025的新功能，特别是AI辅助设计和云端协作。再次说明：我们是达索系统的正规授权代理商。作为老牌代理商，我们提供上门实施、现场培训和7x24小时技术支持——这些增值服务是官方无法提供的。',
          negotiation: 'SOLIDWORKS提供永久授权和订阅两种模式。作为老牌代理商，我们能够提供比官方更优惠的价格和更灵活的付款方式。针对贵公司的长期规划，我建议永久授权加维护合约的方式，而且通过代理商购买可以享受额外的折扣和服务包。',
          objection: '您提到正在评估其他CAD软件？SOLIDWORKS在全球拥有超过600万用户，是中小企业机械设计的首选。作为老牌代理商，我可以为您安排与现有客户的交流，让您了解我们的服务优势。官方只卖软件，我们作为代理商提供的是全套解决方案。',
          legal_compliance: 'X总，了解到贵公司在SOLIDWORKS使用方面可能需要一些合规方面的协助。我先说明：我们是达索系统的正规授权代理商，不是厂商法务。我们的角色是帮助您平稳化解合规风险。作为老牌代理商，我们有丰富的经验处理这类事务。我们可以帮您：评估当前使用状况、制定最经济的补购方案、作为中间方与厂商法务沟通协调。我们的目标是保护您的利益，帮您以最小代价解决问题。您先说说具体情况？',
        },
      };

      const vendorScripts = scripts[vendor] || scripts.autodesk;
      return {
        success: true,
        data: {
          scenario,
          vendor,
          script: vendorScripts[scenario] || '请根据具体情况调整话术',
          identityReminder: [
            '必须明确说明"我们是代理商，不是厂商官方"',
            '强调代理商独特价值：本地化服务、灵活价格、快速响应',
            '法务场景中强调"我们是来帮忙的，不是来施压的"',
            '突出与官方的区别：更灵活、更贴心、更快速',
          ],
        },
      };
    },
  });

  // 法务协同话术生成工具
  mcpRegistry.registerTool({
    name: 'legal-script-generator',
    description: '生成法务协同场景的专业话术，严格体现代理商作为缓冲带和桥梁的角色',
    parameters: {
      type: 'object',
      properties: {
        stage: { type: 'string', enum: ['initial_contact', 'assessment', 'negotiation', 'closing', 'follow_up'], description: '法务处理阶段' },
        vendor: { type: 'string', enum: ['autodesk', 'sketchup', 'adobe', 'dassault'], description: '厂商' },
        objection: { type: 'string', description: '客户异议类型' },
      },
      required: ['stage', 'vendor'],
    },
    execute: async ({ stage, vendor, objection }) => {
      const legalScripts: Record<string, Record<string, any>> = {
        initial_contact: {
          title: '初次接触话术（法务场景）',
          script: `X总，您好。我是[公司名称]的软件顾问，我们是一家深耕行业多年的[厂商]正规授权代理商。

先跟您明确一下我们的身份和角色：
1. 我们是代理商，不是[厂商]官方，更不是[厂商]的法务部门
2. 我们了解到贵公司可能面临一些软件合规方面的问题
3. 我们的角色是"帮助者"和"缓冲带"——帮您化解风险，而不是给您施压

作为老牌代理商，我们经常协助企业处理与厂商法务的对接事务。我们的价值在于：
- 提前预警：在厂商法务正式介入前，帮您主动化解
- 成本优化：利用我们与厂商的长期合作关系，争取最优惠的补购条件
- 全程代办：从评估到谈判到执行，您不用直接面对厂商法务的压力
- 灵活付款：提供分期、延期等官方没有的付款方式

您先说说目前的情况，我帮您分析一下最优的解决方案。不用有压力，我们是来帮忙的。`,
          keyPoints: ['明确代理商身份', '强调帮助者角色', '消除客户戒备心理', '展示独特价值'],
        },
        assessment: {
          title: '风险评估阶段话术',
          script: `根据您说的情况，我帮您分析一下：

目前的风险等级：[根据情况评估]

我们的建议方案：
1. 先通过我们代理商进行"预沟通"，了解厂商法务的底线
2. 根据您的预算，制定最经济的补购方案
3. 由我们出面与厂商法务协商，争取最优条件

为什么要通过我们代理商？
- 我们比您更了解厂商法务的工作流程和谈判策略
- 我们作为代理商，与厂商有长期合作关系，说话有分量
- 我们可以帮您把预算压到最低，把方案做到最灵活
- 您不用直接面对厂商法务的压力，我们来做"坏人"

您大概能接受多少预算来解决这个问题？我根据预算来设计方案。`,
          keyPoints: ['专业评估', '提供解决方案', '解释代理商价值', '引导预算沟通'],
        },
        negotiation: {
          title: '谈判阶段话术',
          script: `X总，好消息。经过我们与[厂商]法务的初步沟通，情况比预期要好。

厂商法务最初的诉求是[XX套/XX金额]，但我们已经帮您争取到了更好的条件：
- 通过我们代理商采购，可以享受[具体折扣]
- 付款方式可以[分期/延期/其他灵活方式]
- 我们可以帮您争取[额外服务/培训/延长维护期]

您可能会问：为什么找你们代理商能争取到更好的条件？
答案很简单：
1. 我们是厂商的合作伙伴，不是对立面，沟通更顺畅
2. 我们了解厂商法务的底线在哪里，知道怎么谈
3. 厂商也希望通过代理商维护客户关系，不愿意把事做绝
4. 我们可以提供官方无法提供的灵活方案

现在最关键的是：您能接受多少预算？我根据您的预算去跟厂商法务谈，尽量往您的预期压。`,
          keyPoints: ['传递积极信息', '展示谈判成果', '解释代理商优势', '引导客户决策'],
        },
        closing: {
          title: '签约成交话术',
          script: `X总，方案已经确定了。总结一下：

通过我们代理商为您争取到的最终方案：
- 补购[XX套][产品名称]
- 总金额：[XX万元]（比厂商最初要求降低了[XX]%）
- 付款方式：[分期/一次性/其他]
- 额外服务：[培训/技术支持/维护延期]

后续流程：
1. 今天签约，我们立即向厂商法务出具合规证明
2. [X个工作日内]完成软件交付和授权激活
3. 安排技术团队上门实施和培训
4. 建立长期合规管理机制，避免以后再出现类似问题

选择我们代理商，您不仅解决了当前的合规问题，还获得了一个长期的技术合作伙伴。以后有任何软件需求、技术问题、合规咨询，随时找我们。`,
          keyPoints: ['总结方案', '强调成果', '说明后续服务', '建立长期关系'],
        },
        follow_up: {
          title: '后续跟进话术',
          script: `X总，软件已经部署完成了，使用情况怎么样？

我想跟您确认几件事：
1. 所有授权都已经激活，合规问题已经完全解决
2. 技术团队的培训还满意吗？有需要加强的地方吗？
3. 后续如果有新员工需要授权，或者需要升级版本，随时找我们

另外，建议您建立内部的软件资产管理制度：
- 定期盘点软件使用情况
- 新员工入职时及时补充授权
- 版本更新时评估是否需要升级

我们代理商可以免费提供这方面的咨询服务。我们的目标不是一次性卖软件，而是成为您长期的软件管理顾问。

有任何问题，随时联系我。`,
          keyPoints: ['确认交付', '收集反馈', '提供增值服务', '建立长期合作'],
        },
      };

      const stageScript = legalScripts[stage] || legalScripts.initial_contact;

      // 处理常见异议
      const objectionResponses: Record<string, string> = {
        '能不能不补': 'X总，我理解您的想法。但现实是：厂商法务已经盯上了，拖着不解决只会让事情更麻烦——律师函、上门核查、甚至起诉。到时候花的钱更多，还会影响公司征信。通过我们代理商，我们可以帮您把成本压到最低，而且不用您直接面对厂商法务的压力。',
        '为什么找你们': '好问题。直接找官方，价格是固定的，谈判空间很小，而且您得自己面对厂商法务。找我们代理商的优势：1)我们更了解厂商法务的底线，知道怎么谈；2)我们与厂商有长期合作，说话有分量；3)我们可以提供官方没有的灵活付款方式；4)您不用直接面对法务压力，我们来做缓冲带。',
        '价格还能不能降': 'X总，我已经在厂商法务的底线基础上帮您争取了最大优惠。不过您放心，作为代理商，我们还有一些灵活空间：比如可以调整授权组合、延长付款周期、或者赠送一些增值服务。您告诉我您的预算上限，我尽量往那个方向去努力。',
        '你们是不是正规的': '您放心，我们是[厂商]的正规授权代理商，所有资质都可以在厂商官网查到。合同是跟厂商直接签的，授权是厂商直接发的，我们只是帮您争取更好的条件和更灵活的方式。说白了，您通过我们买，和直接找官方买，软件是一样的，但价格更优惠、服务更贴心。',
        '后面还会不会再找': '通过我们代理商正规补购后，您的使用就是完全合规的。我们会帮您出具合规证明给厂商法务，并建立长期的合规管理机制。以后只要您通过正规渠道管理授权（可以持续通过我们），就不会再有问题。我们的目标是一次性帮您解决，然后建立长期合作关系。',
      };

      return {
        success: true,
        data: {
          stage,
          vendor,
          title: stageScript.title,
          script: stageScript.script,
          keyPoints: stageScript.keyPoints,
          objectionResponse: objection ? (objectionResponses[objection] || '请根据具体情况灵活应对，始终强调代理商的帮助者角色。') : null,
          identityRules: [
            '严禁以厂商官方或法务口吻说话',
            '必须明确"我们是代理商，来帮忙的"',
            '强调缓冲带和桥梁角色',
            '突出代理商独特价值：灵活、贴心、低成本',
          ],
        },
      };
    },
  });

  // 场景分析工具
  mcpRegistry.registerTool({
    name: 'scene-analyzer',
    description: '分析销售对话场景，识别当前销售阶段',
    parameters: {
      type: 'object',
      properties: {
        conversation: { type: 'string', description: '对话内容' },
        stage: { type: 'string', description: '当前已知阶段' },
      },
      required: ['conversation'],
    },
    execute: async ({ conversation }) => {
      const keywords: Record<string, string[]> = {
        '初次接触': ['你好', '介绍', '了解', '第一次'],
        '需求挖掘': ['需要', '痛点', '问题', '困难', '挑战'],
        '方案呈现': ['方案', '演示', '展示', '功能', '优势'],
        '异议处理': ['但是', '不过', '价格', '贵', '考虑', '比较'],
        '谈判签约': ['合同', '条款', '付款', '折扣', '优惠'],
        '售后跟进': ['使用', '培训', '支持', '维护', '升级'],
        '法务合规': ['盗版', '合规', '法务', '律师', '起诉', '授权', '正版', '律师函'],
      };

      let maxScore = 0;
      let detectedStage = '需求挖掘';

      for (const [stage, words] of Object.entries(keywords)) {
        const score = words.reduce((acc, word) => {
          return acc + (conversation.includes(word) ? 1 : 0);
        }, 0);
        if (score > maxScore) {
          maxScore = score;
          detectedStage = stage;
        }
      }

      return {
        success: true,
        data: {
          currentStage: detectedStage,
          confidence: Math.min(maxScore / 3, 0.95),
          keyPoints: [
            '客户表现出' + (conversation.includes('价格') ? '价格敏感' : conversation.includes('法务') || conversation.includes('盗版') ? '合规风险担忧' : '功能需求'),
            '建议重点关注' + detectedStage,
            '下一步行动：' + (detectedStage === '法务合规' ? '启动法务协同流程，明确代理商帮助者角色' : detectedStage === '初次接触' ? '深入了解需求' : '推进方案演示'),
          ],
          agentRecommendation: detectedStage === '法务合规' ? '建议调用法务协同顾问Agent，严格遵循代理商身份定位' : null,
        },
      };
    },
  });

  // 产品对比工具
  mcpRegistry.registerTool({
    name: 'product-compare',
    description: '对比不同厂商产品的功能和价格',
    parameters: {
      type: 'object',
      properties: {
        vendor: { type: 'string', enum: ['autodesk', 'sketchup', 'adobe', 'dassault'], description: '主厂商' },
        product: { type: 'string', description: '产品名称' },
        competitors: { type: 'array', items: { type: 'string' }, description: '竞品列表' },
      },
      required: ['vendor', 'product'],
    },
    execute: async ({ vendor }) => {
      const comparisons: Record<string, any> = {
        autodesk: {
          product: 'AutoCAD / Revit',
          advantages: ['行业标准', '完善的生态系统', '强大的BIM功能', '广泛的第三方插件'],
          disadvantages: ['学习曲线较陡', '订阅费用较高', '对硬件要求较高'],
          pricing: '¥8,000-15,000/年/用户（代理商价格更灵活，支持分期）',
          agentAdvantages: ['代理商提供上门培训', '支持分期付款', '7x24小时本地技术支持', '灵活的授权组合方案'],
        },
        sketchup: {
          product: 'SketchUp Studio',
          advantages: ['易学易用', '快速建模', '丰富的3D模型库', '良好的渲染效果'],
          disadvantages: ['复杂曲面建模能力有限', '参数化设计较弱', '大型项目性能下降'],
          pricing: '¥3,000-6,000/年/用户（代理商提供教育优惠和批量折扣）',
          agentAdvantages: ['代理商提供免费培训', '灵活的订阅升级方案', '本地化技术支持', '快速响应'],
        },
        adobe: {
          product: 'Creative Cloud',
          advantages: ['全套创意工具', 'AI功能强大', '云端协作', '行业标准'],
          disadvantages: ['订阅模式', '学习成本高', '资源占用大'],
          pricing: '¥6,000-12,000/年/用户（代理商提供企业折扣和分期方案）',
          agentAdvantages: ['代理商提供企业部署服务', '定制化培训方案', '灵活的授权管理', '专属客户经理'],
        },
        dassault: {
          product: 'SOLIDWORKS',
          advantages: ['强大的机械设计', '完善的仿真分析', '良好的PDM集成', '广泛的行业应用'],
          disadvantages: ['价格较高', '对硬件要求高', '学习周期长'],
          pricing: '¥15,000-30,000/永久授权（代理商提供维护合约优惠）',
          agentAdvantages: ['代理商提供实施服务', '定制化培训', '长期技术支持', '灵活的付款方式'],
        },
      };

      return {
        success: true,
        data: comparisons[vendor] || comparisons.autodesk,
      };
    },
  });

  // 合规风险评估工具
  mcpRegistry.registerTool({
    name: 'compliance-assessment',
    description: '评估客户的软件合规风险等级，提供化解建议',
    parameters: {
      type: 'object',
      properties: {
        softwareCount: { type: 'number', description: '疑似盗版软件数量' },
        userCount: { type: 'number', description: '使用人数' },
        vendorContacted: { type: 'boolean', description: '厂商是否已联系' },
        legalLetterReceived: { type: 'boolean', description: '是否收到律师函' },
        companySize: { type: 'string', enum: ['small', 'medium', 'large'], description: '公司规模' },
      },
      required: ['softwareCount', 'userCount'],
    },
    execute: async ({ softwareCount, userCount, vendorContacted, legalLetterReceived, companySize }) => {
      // 风险等级计算
      let riskLevel = 'low';
      let riskScore = 0;

      if (softwareCount > 10) riskScore += 3;
      else if (softwareCount > 5) riskScore += 2;
      else riskScore += 1;

      if (userCount > 50) riskScore += 3;
      else if (userCount > 20) riskScore += 2;
      else riskScore += 1;

      if (vendorContacted) riskScore += 2;
      if (legalLetterReceived) riskScore += 3;
      if (companySize === 'large') riskScore += 1;

      if (riskScore >= 8) riskLevel = 'critical';
      else if (riskScore >= 5) riskLevel = 'high';
      else if (riskScore >= 3) riskLevel = 'medium';

      const riskLevels: Record<string, any> = {
        critical: {
          level: '极高',
          description: '情况紧急，需要立即采取行动',
          urgency: '建议在48小时内启动合规化解流程',
          estimatedCost: '预计补购成本较高，但通过代理商谈判可争取30-50%优惠',
          strategy: '立即通过代理商与厂商法务沟通，争取和解方案，避免诉讼',
        },
        high: {
          level: '高',
          description: '风险较高，需要尽快处理',
          urgency: '建议在一周内制定补购方案',
          estimatedCost: '预计补购成本中等，代理商可争取20-30%优惠',
          strategy: '通过代理商主动沟通，展示合规意愿，争取最优条件',
        },
        medium: {
          level: '中等',
          description: '存在一定风险，建议主动化解',
          urgency: '建议在一个月内完成合规整改',
          estimatedCost: '预计补购成本可控，代理商可争取10-20%优惠',
          strategy: '通过代理商制定分阶段补购计划，降低一次性投入',
        },
        low: {
          level: '低',
          description: '风险可控，但建议建立合规机制',
          urgency: '建议在三个月内完成正版化',
          estimatedCost: '补购成本较低，可享受代理商批量折扣',
          strategy: '通过代理商制定长期正版化方案，享受优惠价格',
        },
      };

      return {
        success: true,
        data: {
          riskLevel,
          riskScore,
          ...riskLevels[riskLevel],
          agentRole: '作为代理商，我们的价值是帮助您以最小成本化解风险，而不是给您施压。',
          nextSteps: [
            '联系代理商进行详细评估',
            '制定补购方案',
            '由代理商出面与厂商法务沟通',
            '完成补购并建立合规机制',
          ],
        },
      };
    },
  });

  console.log('[SalesCrew] 已注册 5 个销售专属工具（含法务协同工具）');
}
