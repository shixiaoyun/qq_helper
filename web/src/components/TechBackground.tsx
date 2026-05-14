import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  pulse: number
  pulseSpeed: number
}

interface DNANode {
  x: number
  y: number
  baseY: number
  angle: number
  radius: number
  strand: 0 | 1
}

interface DataStream {
  x: number
  y: number
  speed: number
  chars: string[]
  opacity: number
  length: number
  fontSize: number
}

export default function TechBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const particles: Particle[] = []
    const PARTICLE_COUNT = 60
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.01,
      })
    }

    const dnaNodes: DNANode[] = []
    const DNA_HELICES = 2
    const NODES_PER_HELIX = 28
    const HELIX_SPACING = 120
    for (let hi = 0; hi < DNA_HELICES; hi++) {
      const centerX = w * (0.15 + hi * 0.7)
      for (let i = 0; i < NODES_PER_HELIX; i++) {
        const angle = (i / NODES_PER_HELIX) * Math.PI * 4
        const baseY = (i / NODES_PER_HELIX) * (h + 200) - 100
        dnaNodes.push({
          x: centerX + Math.sin(angle) * HELIX_SPACING / 2,
          y: baseY,
          baseY,
          angle,
          radius: 3,
          strand: (Math.sin(angle) > 0 ? 0 : 1) as 0 | 1,
        })
      }
    }

    const dataStreams: DataStream[] = []
    const STREAM_COUNT = 15
    const CHARS = '01ACGTacgtαβγδ∑∏∫∂∇≈≠∞◆◇○●□■△▽'.split('')
    for (let i = 0; i < STREAM_COUNT; i++) {
      const len = Math.floor(Math.random() * 12) + 5
      const chars: string[] = []
      for (let j = 0; j < len; j++) {
        chars.push(CHARS[Math.floor(Math.random() * CHARS.length)])
      }
      dataStreams.push({
        x: Math.random() * w,
        y: Math.random() * h - h,
        speed: Math.random() * 1.5 + 0.5,
        chars,
        opacity: Math.random() * 0.15 + 0.05,
        length: len,
        fontSize: Math.random() * 6 + 10,
      })
    }

    let time = 0

    const draw = () => {
      time += 0.008

      ctx.fillStyle = '#0a0e1a'
      ctx.fillRect(0, 0, w, h)

      const gridGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
      gridGrad.addColorStop(0, 'rgba(99, 102, 241, 0.03)')
      gridGrad.addColorStop(0.5, 'rgba(139, 92, 246, 0.02)')
      gridGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = gridGrad
      ctx.fillRect(0, 0, w, h)

      ctx.strokeStyle = 'rgba(99, 102, 241, 0.04)'
      ctx.lineWidth = 0.5
      const gridSize = 60
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }

      for (const stream of dataStreams) {
        stream.y += stream.speed
        if (stream.y > h + stream.length * stream.fontSize) {
          stream.y = -stream.length * stream.fontSize
          stream.x = Math.random() * w
        }
        for (let i = 0; i < stream.chars.length; i++) {
          const charY = stream.y + i * stream.fontSize
          if (charY < -20 || charY > h + 20) continue
          const fadeFactor = 1 - Math.abs(i - stream.chars.length / 2) / (stream.chars.length / 2)
          ctx.font = `${stream.fontSize}px monospace`
          ctx.fillStyle = `rgba(139, 92, 246, ${stream.opacity * fadeFactor})`
          ctx.fillText(stream.chars[i], stream.x, charY)
        }
      }

      for (let hi = 0; hi < DNA_HELICES; hi++) {
        const centerX = w * (0.15 + hi * 0.7)
        const nodesThisHelix = dnaNodes.filter((_, idx) => {
          const startIdx = hi * NODES_PER_HELIX
          return idx >= startIdx && idx < startIdx + NODES_PER_HELIX
        })

        for (let i = 0; i < nodesThisHelix.length; i++) {
          const node = nodesThisHelix[i]
          node.angle += 0.012
          node.y = node.baseY + Math.sin(time * 2 + i * 0.3) * 8
          node.x = centerX + Math.sin(node.angle) * HELIX_SPACING / 2

          const depth = Math.cos(node.angle)
          const depthOpacity = 0.3 + (depth + 1) * 0.35
          const depthRadius = node.radius * (0.7 + (depth + 1) * 0.3)

          if (i > 0) {
            const prev = nodesThisHelix[i - 1]
            const sameStrand = (Math.sin(node.angle) > 0) === (Math.sin(prev.angle) > 0)
            if (sameStrand) {
              ctx.beginPath()
              ctx.moveTo(prev.x, prev.y)
              ctx.lineTo(node.x, node.y)
              const lineColor = Math.sin(node.angle) > 0
                ? `rgba(99, 102, 241, ${depthOpacity * 0.4})`
                : `rgba(168, 85, 247, ${depthOpacity * 0.4})`
              ctx.strokeStyle = lineColor
              ctx.lineWidth = 1.5 * (0.5 + (depth + 1) * 0.25)
              ctx.stroke()
            }
          }

          if (i % 3 === 0 && i + 1 < nodesThisHelix.length) {
            const pair = nodesThisHelix[i + 1]
            const pairX = centerX + Math.sin(pair.angle) * HELIX_SPACING / 2
            if (Math.sin(node.angle) * Math.sin(pair.angle) < 0) {
              ctx.beginPath()
              ctx.moveTo(node.x, node.y)
              ctx.lineTo(pairX, pair.y)
              ctx.strokeStyle = `rgba(139, 92, 246, ${depthOpacity * 0.15})`
              ctx.lineWidth = 1
              ctx.setLineDash([3, 4])
              ctx.stroke()
              ctx.setLineDash([])
            }
          }

          const nodeColor = Math.sin(node.angle) > 0
            ? `rgba(99, 102, 241, ${depthOpacity})`
            : `rgba(168, 85, 247, ${depthOpacity})`
          ctx.beginPath()
          ctx.arc(node.x, node.y, depthRadius, 0, Math.PI * 2)
          ctx.fillStyle = nodeColor
          ctx.fill()

          if (depth > 0.3) {
            ctx.beginPath()
            ctx.arc(node.x, node.y, depthRadius * 3, 0, Math.PI * 2)
            const glowColor = Math.sin(node.angle) > 0
              ? `rgba(99, 102, 241, ${depthOpacity * 0.1})`
              : `rgba(168, 85, 247, ${depthOpacity * 0.1})`
            ctx.fillStyle = glowColor
            ctx.fill()
          }
        }
      }

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.pulse += p.pulseSpeed

        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0

        const pulseOpacity = p.opacity * (0.6 + Math.sin(p.pulse) * 0.4)

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139, 92, 246, ${pulseOpacity})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139, 92, 246, ${pulseOpacity * 0.08})`
        ctx.fill()
      }

      const CONNECTION_DIST = 150
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DIST) {
            const lineOpacity = (1 - dist / CONNECTION_DIST) * 0.12
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(139, 92, 246, ${lineOpacity})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      for (const p of particles) {
        for (const node of dnaNodes) {
          const dx = p.x - node.x
          const dy = p.y - node.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 100) {
            const lineOpacity = (1 - dist / 100) * 0.06
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(node.x, node.y)
            ctx.strokeStyle = `rgba(99, 102, 241, ${lineOpacity})`
            ctx.lineWidth = 0.3
            ctx.stroke()
          }
        }
      }

      const centerGlow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5)
      centerGlow.addColorStop(0, 'rgba(99, 102, 241, 0.04)')
      centerGlow.addColorStop(0.3, 'rgba(139, 92, 246, 0.02)')
      centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = centerGlow
      ctx.fillRect(0, 0, w, h)

      const scanY = (time * 80) % (h + 100) - 50
      const scanGrad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40)
      scanGrad.addColorStop(0, 'rgba(99, 102, 241, 0)')
      scanGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.03)')
      scanGrad.addColorStop(1, 'rgba(99, 102, 241, 0)')
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanY - 40, w, 80)

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}
