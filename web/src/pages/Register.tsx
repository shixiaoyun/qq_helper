import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import TechBackground from '../components/TechBackground'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const { register } = useAuthStore()

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (password.length < 6) {
      setError('密码长度不能少于6位')
      return
    }

    setLoading(true)

    const result = await register({
      username,
      password,
      email: email || undefined,
      nickname: nickname || undefined,
    })

    if (!result.success) {
      setError(result.message)
    }

    setLoading(false)
  }

  return (
    <div className={`min-h-screen flex items-center justify-center relative overflow-hidden ${isDark ? 'bg-[#0a0e1a]' : 'bg-background'}`}>
      {isDark ? (
        <TechBackground />
      ) : (
        <>
          <div className="absolute inset-0 gradient-primary animate-gradient" />
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-white/10 blur-3xl animate-float" />
            <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-white/10 blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
          </div>
        </>
      )}

      <div className="w-full max-w-md p-8 relative z-10 animate-fade-in-scale">
        <div className={`rounded-3xl p-8 shadow-glow-lg ${isDark ? '' : 'glass-card'}`} style={isDark ? { background: 'rgba(15, 20, 40, 0.75)', backdropFilter: 'blur(20px) saturate(180%)', border: '1px solid rgba(99, 102, 241, 0.15)', boxShadow: '0 0 40px rgba(99, 102, 241, 0.08), inset 0 1px 0 rgba(255,255,255,0.05)' } : undefined}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-glow animate-float">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">创建账户</h1>
            <p className="text-sm text-muted-foreground mt-2">加入OQ助手，开启智能之旅</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive animate-fade-in">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">用户名 *</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-30个字符"
                required
                minLength={3}
                maxLength={30}
                className="w-full h-11 px-4 input-glass text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="显示名称"
                className="w-full h-11 px-4 input-glass text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="可选"
                className="w-full h-11 px-4 input-glass text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">密码 *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少6位"
                  required
                  minLength={6}
                  className="w-full h-11 px-4 pr-10 input-glass text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">确认密码 *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                required
                className="w-full h-11 px-4 input-glass text-sm focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 btn-primary text-sm flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              注册
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            已有账户？{' '}
            <Link to="/login" className="gradient-text font-medium hover:opacity-80 transition-opacity">
              立即登录
            </Link>
          </p>
        </div>

        <div className="text-center mt-6">
          <p className={`text-xs ${isDark ? 'text-white/50' : 'text-white/60'}`}>OQ助手 · 让AI成为你的得力助手</p>
        </div>
      </div>
    </div>
  )
}
