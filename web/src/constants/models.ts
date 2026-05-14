export interface ModelOption {
  value: string
  label: string
  desc: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'qwen-flash', label: 'Qwen Flash (极速)', desc: '最快，成本最低' },
  { value: 'qwen-turbo', label: 'Qwen Turbo (快速)', desc: '响应快，成本低' },
  { value: 'qwen-plus', label: 'Qwen Plus (均衡)', desc: '平衡速度和质量' },
  { value: 'qwen-max', label: 'Qwen Max (最强)', desc: '质量最高，成本较高' },
  { value: 'qwen3.5-flash', label: 'Qwen3.5 Flash (新版极速)', desc: '最新极速模型' },
  { value: 'qwen3.5-plus', label: 'Qwen3.5 Plus (新版均衡)', desc: '最新均衡模型' },
  { value: 'deepseek-v3', label: 'DeepSeek V3 (开源强)', desc: '开源模型，能力强' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (最强)', desc: '旗舰模型，复杂任务首选' },
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (快速)', desc: '快速响应，高性价比' },
  { value: 'deepseek-r1-0528', label: 'DeepSeek R1 (推理)', desc: '深度推理，分析任务专家' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', desc: 'OpenAI轻量模型' },
]