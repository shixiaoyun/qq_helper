import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import type { AuthState } from '../stores/auth'
import {
  Users, Settings, Save, RefreshCw, Play, ChevronDown, ChevronUp,
  Bot, MessageSquare, AlertCircle, Check, Plus, Trash2, X,
  Thermometer, Hash, Cpu,
} from 'lucide-react'
import { MODEL_OPTIONS } from '../constants/models'

interface AgentConfig {
  id: string
  name: string
  role: string
  goal: string
  backstory: string
  tools: string[]
  knowledgeBases: string[]
  model: string
  temperature?: number
  maxTokens?: number
}

interface CrewConfig {
  id: string
  name: string
  description: string
  process: string
  agents: string[]
  tasks: string[]
}

interface TaskConfig {
  id: string
  name: string
  description: string
  agent: string
  expectedOutput: string
}

const AGENT_AVATARS: Record<string, string> = {
  'sales-manager': '👔',
  'customer-researcher': '🔍',
  'product-expert': '⚙️',
  'sales-coach': '🎯',
  'solution-architect': '🏗️',
  'legal-compliance': '⚖️',
}

const AGENT_COLORS: Record<string, string> = {
  'sales-manager': 'bg-blue-500',
  'customer-researcher': 'bg-green-500',
  'product-expert': 'bg-purple-500',
  'sales-coach': 'bg-orange-500',
  'solution-architect': 'bg-cyan-500',
  'legal-compliance': 'bg-red-500',
}

export default function SalesCrewConfigPage() {
  const token = useAuthStore((state: AuthState) => state.token)
  const [activeTab, setActiveTab] = useState<'agents' | 'crews' | 'tasks' | 'test'>('agents')
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [crews, setCrews] = useState<CrewConfig[]>([])
  const [tasks, setTasks] = useState<TaskConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<AgentConfig>>({})
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const [testAgent, setTestAgent] = useState('')
  const [testResult, setTestResult] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newAgentForm, setNewAgentForm] = useState({
    name: '',
    role: '',
    goal: '',
    backstory: '',
    model: 'deepseek-v4-pro',
    temperature: 0.7,
    maxTokens: 4096,
  })

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [agentsResp, crewsResp, tasksResp] = await Promise.all([
        axios.get('/api/sales-crew-config/agents', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/sales-crew-config/crews', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/sales-crew-config/tasks', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (agentsResp.data.success) setAgents(agentsResp.data.data)
      if (crewsResp.data.success) setCrews(crewsResp.data.data)
      if (tasksResp.data.success) setTasks(tasksResp.data.data)
    } catch (err: any) {
      showMessage('加载数据失败: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  const startEdit = (agent: AgentConfig) => {
    setEditingAgent(agent.id)
    setEditForm({ ...agent })
  }

  const cancelEdit = () => {
    setEditingAgent(null)
    setEditForm({})
  }

  const saveAgent = async (agentId: string) => {
    setSaving(true)
    try {
      const resp = await axios.put(
        `/api/sales-crew-config/agents/${agentId}`,
        editForm,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (resp.data.success) {
        showMessage('保存成功')
        setEditingAgent(null)
        loadData()
      }
    } catch (err: any) {
      showMessage('保存失败: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      setSaving(false)
    }
  }

  const createAgent = async () => {
    setSaving(true)
    try {
      const res = await axios.post('/api/sales-crew-config/agents', newAgentForm, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.data.success) {
        showMessage('Agent创建成功')
        setShowAddModal(false)
        setNewAgentForm({
          name: '', role: '', goal: '', backstory: '',
          model: 'deepseek-v4-pro', temperature: 0.7, maxTokens: 4096,
        })
        loadData()
      }
    } catch (err: any) {
      showMessage('创建失败: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteAgent = async (agentId: string) => {
    if (!window.confirm('确定要删除此Agent吗？此操作不可恢复。')) return
    setDeleting(true)
    try {
      const res = await axios.delete(`/api/sales-crew-config/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.data.success) {
        showMessage('Agent已删除')
        loadData()
      }
    } catch (err: any) {
      showMessage('删除失败: ' + (err.response?.data?.error || err.message), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const [testResponse, setTestResponse] = useState('')
  const [testStats, setTestStats] = useState<any>(null)

  const runTest = async () => {
    if (!testAgent || !testMessage) return
    setTestLoading(true)
    setTestResult('')
    setTestResponse('')
    setTestStats(null)
    try {
      const resp = await axios.post(
        `/api/sales-crew-config/agents/${testAgent}/test`,
        { message: testMessage, vendor: 'autodesk' },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (resp.data.success) {
        setTestResponse(resp.data.data.response)
        setTestStats({
          model: resp.data.data.config.model,
          temperature: resp.data.data.config.temperature,
          maxTokens: resp.data.data.config.maxTokens,
          latencyMs: resp.data.data.latencyMs,
          tokensIn: resp.data.data.tokensIn,
          tokensOut: resp.data.data.tokensOut,
          knowledgeUsed: resp.data.data.knowledgeUsed,
        })
      }
    } catch (err: any) {
      setTestResult('测试失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">销售教练配置管理</h1>
            <p className="text-sm text-muted-foreground">管理AI专家角色、提示词和模型参数</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span className={`text-sm px-3 py-1 rounded-full ${
              messageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {messageType === 'success' ? <Check className="w-3 h-3 inline mr-1" /> : <AlertCircle className="w-3 h-3 inline mr-1" />}
              {message}
            </span>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-secondary transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 标签页 */}
      <div className="flex items-center gap-1 mb-6 border-b">
        {[
          { key: 'agents' as const, label: 'AI专家角色', icon: Bot },
          { key: 'crews' as const, label: '工作流配置', icon: Users },
          { key: 'tasks' as const, label: '任务配置', icon: MessageSquare },
          { key: 'test' as const, label: '调试测试', icon: Play },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* AI专家角色 */}
      {activeTab === 'agents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">共 {agents.length} 个AI专家角色</span>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              新增Agent
            </button>
          </div>
          {agents.map((agent) => (
            <div key={agent.id} className="border rounded-xl overflow-hidden">
              {/* Agent头部 */}
              <div
                className="flex items-center justify-between p-4 bg-secondary/20 cursor-pointer"
                onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{AGENT_AVATARS[agent.id] || '🤖'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${AGENT_COLORS[agent.id] || 'bg-gray-500'}`}>
                        {agent.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> {agent.model}
                      </span>
                      <span className="flex items-center gap-1">
                        <Thermometer className="w-3 h-3" /> {agent.temperature ?? 0.7}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" /> {agent.maxTokens ?? 2048}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingAgent === agent.id ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); saveAgent(agent.id) }}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); cancelEdit() }}
                        className="px-3 py-1.5 text-sm border rounded-lg hover:bg-secondary"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      {!agent.id.startsWith('custom-') ? null : (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteAgent(agent.id) }}
                          disabled={deleting}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          删除
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(agent) }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-secondary"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        编辑
                      </button>
                      {expandedAgent === agent.id ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Agent详情 */}
              {expandedAgent === agent.id && (
                <div className="p-4 space-y-4">
                  {editingAgent === agent.id ? (
                    // 编辑模式
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1 block">名称</label>
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">模型</label>
                          <select
                            value={editForm.model || ''}
                            onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                          >
                            {MODEL_OPTIONS.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-1 block">Temperature ({editForm.temperature ?? 0.7})</label>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={editForm.temperature ?? 0.7}
                            onChange={(e) => setEditForm({ ...editForm, temperature: parseFloat(e.target.value) })}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>精确</span>
                            <span>创意</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">Max Tokens</label>
                          <input
                            type="number"
                            min="100"
                            max="8000"
                            step="100"
                            value={editForm.maxTokens ?? 2048}
                            onChange={(e) => setEditForm({ ...editForm, maxTokens: parseInt(e.target.value) })}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1 block">角色定位</label>
                        <textarea
                          value={editForm.role || ''}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                          rows={2}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1 block">目标</label>
                        <textarea
                          value={editForm.goal || ''}
                          onChange={(e) => setEditForm({ ...editForm, goal: e.target.value })}
                          rows={2}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1 block">背景故事 / 提示词</label>
                        <textarea
                          value={editForm.backstory || ''}
                          onChange={(e) => setEditForm({ ...editForm, backstory: e.target.value })}
                          rows={6}
                          className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          提示词决定AI专家的行为风格和输出质量。建议包含：身份定位、说话风格、输出要求。
                        </p>
                      </div>
                    </div>
                  ) : (
                    // 查看模式
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="font-medium text-muted-foreground">角色定位：</span>
                        <span>{agent.role}</span>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">目标：</span>
                        <span>{agent.goal}</span>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">背景故事 / 提示词：</span>
                        <div className="mt-1 p-3 bg-secondary/30 rounded-lg text-xs whitespace-pre-wrap font-mono">
                          {agent.backstory}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-muted-foreground">工具：</span>
                        <div className="flex gap-1">
                          {agent.tools.map((t) => (
                            <span key={t} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-muted-foreground">知识库：</span>
                        <div className="flex gap-1">
                          {agent.knowledgeBases.map((k) => (
                            <span key={k} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 新增Agent弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">新增AI专家角色</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-secondary rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">名称 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newAgentForm.name}
                    onChange={(e) => setNewAgentForm({ ...newAgentForm, name: e.target.value })}
                    placeholder="例如：合同审核专家"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">模型</label>
                  <select
                    value={newAgentForm.model}
                    onChange={(e) => setNewAgentForm({ ...newAgentForm, model: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">角色定位 <span className="text-red-500">*</span></label>
                <textarea
                  value={newAgentForm.role}
                  onChange={(e) => setNewAgentForm({ ...newAgentForm, role: e.target.value })}
                  placeholder="例如：你是一位专业的合同审核专家，擅长分析法律条款..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">目标 <span className="text-red-500">*</span></label>
                <textarea
                  value={newAgentForm.goal}
                  onChange={(e) => setNewAgentForm({ ...newAgentForm, goal: e.target.value })}
                  placeholder="例如：审核合同条款，识别潜在法律风险"
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">背景故事 / 提示词</label>
                <textarea
                  value={newAgentForm.backstory}
                  onChange={(e) => setNewAgentForm({ ...newAgentForm, backstory: e.target.value })}
                  placeholder="可选：详细描述Agent的行为风格和专业知识领域"
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Temperature ({newAgentForm.temperature})</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={newAgentForm.temperature}
                    onChange={(e) => setNewAgentForm({ ...newAgentForm, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>精确</span>
                    <span>创意</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Max Tokens</label>
                  <input
                    type="number"
                    min="100"
                    max="8000"
                    step="100"
                    value={newAgentForm.maxTokens}
                    onChange={(e) => setNewAgentForm({ ...newAgentForm, maxTokens: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-secondary"
              >
                取消
              </button>
              <button
                onClick={createAgent}
                disabled={saving || !newAgentForm.name || !newAgentForm.role || !newAgentForm.goal}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {saving ? '创建中...' : '创建Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工作流配置 */}
      {activeTab === 'crews' && (
        <div className="space-y-4">
          {crews.map((crew) => (
            <div key={crew.id} className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium">{crew.name}</h3>
                  <p className="text-sm text-muted-foreground">{crew.description}</p>
                </div>
                <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                  {crew.process === 'sequential' ? '顺序执行' : crew.process === 'parallel' ? '并行执行' : '层级执行'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">参与Agent：</span>
                  <div className="flex gap-1">
                    {crew.agents.map((a) => (
                      <span key={a} className={`text-xs px-2 py-0.5 rounded text-white ${AGENT_COLORS[a] || 'bg-gray-500'}`}>
                        {AGENT_AVATARS[a] || '🤖'} {agents.find(x => x.id === a)?.name || a}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">任务链：</span>
                  <div className="flex gap-1">
                    {crew.tasks.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 bg-secondary rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 任务配置 */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">{task.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded text-white ${AGENT_COLORS[task.agent] || 'bg-gray-500'}`}>
                  {AGENT_AVATARS[task.agent] || '🤖'} {agents.find(x => x.id === task.agent)?.name || task.agent}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
              <div>
                <span className="text-xs text-muted-foreground">预期输出：</span>
                <span className="text-sm">{task.expectedOutput}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 调试测试 */}
      {activeTab === 'test' && (
        <div className="space-y-4">
          <div className="border rounded-xl p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" />
              Agent调试测试
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">选择Agent</label>
                <select
                  value={testAgent}
                  onChange={(e) => setTestAgent(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">请选择...</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {AGENT_AVATARS[agent.id] || '🤖'} {agent.name} ({agent.model})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">测试消息</label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="输入测试消息，例如：客户收到Autodesk律师函..."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={runTest}
                disabled={testLoading || !testAgent || !testMessage}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {testLoading ? '测试中...' : '运行测试'}
              </button>
              {testResult && (
                <div className="mt-4">
                  <label className="text-sm font-medium mb-1 block text-red-500">测试失败</label>
                  <pre className="p-3 bg-red-50 rounded-lg text-xs overflow-auto max-h-96 text-red-700">
                    {testResult}
                  </pre>
                </div>
              )}
              {testResponse && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block flex items-center gap-2">
                      <Check className="w-3 h-3 text-green-500" />
                      AI回复内容
                    </label>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm whitespace-pre-wrap">
                      {testResponse}
                    </div>
                  </div>
                  {testStats && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">运行统计</label>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="p-2 bg-secondary/30 rounded text-center">
                          <div className="text-xs text-muted-foreground">模型</div>
                          <div className="text-xs font-medium">{testStats.model}</div>
                        </div>
                        <div className="p-2 bg-secondary/30 rounded text-center">
                          <div className="text-xs text-muted-foreground">耗时</div>
                          <div className="text-xs font-medium">{testStats.latencyMs}ms</div>
                        </div>
                        <div className="p-2 bg-secondary/30 rounded text-center">
                          <div className="text-xs text-muted-foreground">输入Token</div>
                          <div className="text-xs font-medium">{testStats.tokensIn}</div>
                        </div>
                        <div className="p-2 bg-secondary/30 rounded text-center">
                          <div className="text-xs text-muted-foreground">输出Token</div>
                          <div className="text-xs font-medium">{testStats.tokensOut}</div>
                        </div>
                      </div>
                      {testStats.knowledgeUsed && (
                        <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          已引用知识库内容
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
