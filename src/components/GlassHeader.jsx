import { useEffect, useRef, useState } from 'react'
import './glass-header.css'

const navigation = [
  { id: 'home', text: 'ホーム', english: 'HOME' },
  { id: 'about', text: '私について', english: 'ABOUT' },
  { id: 'works', text: '作品', english: 'WORK' },
  { id: 'approach', text: 'アプローチ', english: 'APPROACH' },
]

export default function GlassHeader({ activeSection, menuOpen, onMenuOpen, Brand, Arrow }) {
  const headerRef = useRef(null)
  const glintAllowed = useRef(false)
  const glintFrame = useRef(0)
  const glintPointer = useRef({ x: 0, y: 0 })
  const [scrolled, setScrolled] = useState(() => window.scrollY > 16)

  useEffect(() => {
    let previousScroll = window.scrollY > 16
    const updateScroll = () => {
      const next = window.scrollY > 16
      if (next === previousScroll) return
      previousScroll = next
      setScrolled(next)
    }
    const pointerPreference = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    )
    const updatePointerPreference = () => {
      glintAllowed.current = pointerPreference.matches
      if (!pointerPreference.matches) clearGlint()
    }

    updateScroll()
    updatePointerPreference()
    window.addEventListener('scroll', updateScroll, { passive: true })
    pointerPreference.addEventListener('change', updatePointerPreference)
    return () => {
      window.removeEventListener('scroll', updateScroll)
      pointerPreference.removeEventListener('change', updatePointerPreference)
      cancelAnimationFrame(glintFrame.current)
    }
  }, [])

  function moveGlint(event) {
    if (!glintAllowed.current || event.pointerType === 'touch') return
    glintPointer.current = { x: event.clientX, y: event.clientY }
    if (glintFrame.current) return
    glintFrame.current = requestAnimationFrame(() => {
      glintFrame.current = 0
      const header = headerRef.current
      if (!header || !glintAllowed.current) return
      const bounds = header.getBoundingClientRect()
      header.style.setProperty('--nav-pointer-x', `${glintPointer.current.x - bounds.left}px`)
      header.style.setProperty('--nav-pointer-y', `${glintPointer.current.y - bounds.top}px`)
      if (!header.hasAttribute('data-glint')) header.setAttribute('data-glint', '')
    })
  }

  function clearGlint() {
    cancelAnimationFrame(glintFrame.current)
    glintFrame.current = 0
    headerRef.current?.removeAttribute('data-glint')
  }

  return (
    <header
      ref={headerRef}
      className={`nav glass-nav${scrolled ? ' nav-scrolled' : ''}`}
      data-scrolled={scrolled}
      onPointerMove={moveGlint}
      onPointerLeave={clearGlint}
    >
      <div className="wrap nav-wrap">
        <a className="skip-link" href="#main">メインコンテンツへスキップ</a>
        <Brand />
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {navigation.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={activeSection === item.id ? 'is-active' : ''}
              aria-current={activeSection === item.id ? 'location' : undefined}
            >
              {item.text}<span>{item.english}</span>
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="nav-contact btn" href="#contact">連絡する <Arrow diagonal /></a>
          <button
            className="menu-button"
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={onMenuOpen}
          >
            <span /><span />
          </button>
        </div>
      </div>
    </header>
  )
}
