import { useState, useEffect, useRef, useCallback } from 'react'

export function useCountUp(end: number, duration: number = 1200, start: number = 0): { value: number; ref: React.RefObject<HTMLDivElement | null> } {
  const [value, setValue] = useState(start)
  const ref = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          const startTime = performance.now()
          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setValue(Math.floor(start + (end - start) * eased))
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [end, duration, start])

  return { value, ref }
}

export function useSuccessParticles(): { trigger: (e: React.MouseEvent) => void; particles: { id: number; angle: number; distance: number; delay: number; size: number }[]; isActive: boolean } {
  const [isActive, setIsActive] = useState(false)
  const particles = [
    { id: 1, angle: 0, distance: 30, delay: 0, size: 6 },
    { id: 2, angle: 45, distance: 35, delay: 50, size: 5 },
    { id: 3, angle: 90, distance: 32, delay: 100, size: 7 },
    { id: 4, angle: 135, distance: 38, delay: 20, size: 4 },
    { id: 5, angle: 180, distance: 28, delay: 80, size: 6 },
    { id: 6, angle: 225, distance: 34, delay: 30, size: 5 },
    { id: 7, angle: 270, distance: 30, delay: 70, size: 7 },
    { id: 8, angle: 315, distance: 36, delay: 40, size: 5 },
  ]

  const trigger = useCallback((_e: React.MouseEvent) => {
    setIsActive(true)
    setTimeout(() => setIsActive(false), 700)
  }, [])

  return { trigger, particles, isActive }
}
