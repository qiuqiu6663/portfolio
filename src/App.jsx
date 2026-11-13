import { useEffect, useRef, useState } from 'react'
import { profile, projects, strengths } from './content.js'
import GlassHeader from './components/GlassHeader.jsx'
import HeroAero from './components/HeroAero.jsx'
import SiteGrain from './components/SiteGrain.jsx'
import ParticlesBackground from './components/ParticlesBackground.jsx'
import TechHeading from './components/TechHeading.jsx'
import ResponsiveImage from './components/ResponsiveImage.jsx'
import GlassProjectCard, { ProjectGlassReveal } from './components/GlassProjectCard.jsx'
import { usePortfolioMotion, useProjectMotion } from './motion/usePortfolioMotion.js'

function Arrow({ diagonal = false, className = '' }) {
  return <svg className={`arrow ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h15m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function Brand({ onClick }) {
  return <a className="brand" href="#home" aria-label="ホームに戻る" onClick={onClick}><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>{profile.name}<span className="brand-dot">.</span></span></a>
}

function SectionLabel({ number, children }) {
  return <div className="section-label"><span className="section-number">{number}</span><span>{children}</span></div>
}

function CinematicTitle({ children }) {
  return <TechHeading className="section-cinematic-title motion-section-title" aria-label={children}><span className="section-title-mask">{children.split(' ').map((word, index) => <span className="section-title-word" key={index}>{word}</span>)}</span></TechHeading>
}

function Opening() {
  return <div className="opening-screen" aria-hidden="true">
    <div className="opening-index">PORTFOLIO / {new Date().getFullYear()}</div>
    <div className="opening-word-mask"><span className="opening-word">PORTFOLIO</span></div>
    <div className="opening-rule" />
    <div className="opening-meta"><span>{profile.displayName}</span><span>SPACE · IMAGE · INTERACTION</span></div>
  </div>
}

function Hero() {
  return <section id="home" className="hero">
    <HeroAero />
    <div className="hero-content wrap">
      <div className="hero-intro" data-opening-copy><span className="accent-dot" /><span>PERSONAL PORTFOLIO</span><span className="hero-edition">SPACE · IMAGE · INTERACTION</span></div>
      <div className="hero-title-block">
        <span className="hero-japanese" lang="ja" data-opening-copy>{profile.heroJapanese}</span>
        <div className="hero-heading-mask"><div className="hero-title-reveal"><TechHeading as="h1" autoSweep>{profile.heroTitle.map((line, index) => <span key={index} className="hero-title-line">{line.endsWith('.') ? <>{line.slice(0, -1)}<span className="title-period">.</span></> : line}</span>)}<span className="sr-only">ゲームの世界と3D空間のポートフォリオ</span></TechHeading></div></div>
        <p className="hero-title-translation" lang="ja" data-opening-copy>{profile.heroTitleJapanese}</p>
        <div className="hero-bottom-copy" data-opening-copy><p>{profile.heroIntro}<br /><span>{profile.heroDescription}</span></p></div>
        <p className="hero-name" lang="ja" data-opening-copy>{profile.displayName}</p>
      </div>
    </div>
    <span className="hero-side-index" aria-hidden="true">PORTFOLIO — VOL. 01</span>
  </section>
}

function StrengthVisual({ index }) {
  return <div className={`strength-visual frame visual-${index}`} aria-hidden="true" data-visual>
    <svg className="study-diagram" viewBox="0 0 240 180" fill="none">
      {index === 0 && <g stroke="#7896b8" strokeWidth=".8"><path d="m120 20 66 39v78l-66 37-66-37V59z" /><path d="m120 20 12 62 54 55M54 59l78 23-12 92M54 137l66-39 66 39M54 59l66 39V20M120 98l66-39" opacity=".7" /><path d="m54 137 78-55-12 16" opacity=".4" /></g>}
      {index === 1 && <><defs><radialGradient id="sphere-light" cx="28%" cy="22%" r="78%"><stop offset="0" stopColor="#c5d8ed" /><stop offset=".3" stopColor="#7c9cbf" /><stop offset=".72" stopColor="#284666" /><stop offset="1" stopColor="#0c1728" /></radialGradient><radialGradient id="sphere-shadow"><stop stopColor="#050d18" stopOpacity=".8" /><stop offset="1" stopColor="#050d18" stopOpacity="0" /></radialGradient></defs><ellipse cx="139" cy="138" rx="65" ry="22" fill="url(#sphere-shadow)" /><path d="m25 158 190-46M47 24l16 25m-7-28 16 26m-6-29 16 26" stroke="#809ab8" strokeWidth=".7" opacity=".6" /><circle cx="119" cy="91" r="45" fill="url(#sphere-light)" /></>}
      {index === 2 && <g stroke="#7898bc" strokeWidth=".8"><path d="m43 55 75 37 77 39" /><path d="m43 37 18 18-18 18-18-18z" fill="#122c49" /><path d="m118 56 36 36-36 36-36-36z" fill="#234464" /><path d="m195 113 18 18-18 18-18-18z" fill="#122c49" /><path d="m118 79 13 13-13 13-13-13z" stroke="#c0d5ef" /></g>}
    </svg>
    <span className="visual-cross cross-one">+</span><span className="visual-cross cross-two">+</span>
  </div>
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('home')
  const [filter, setFilter] = useState('すべて')
  const [selectedProject, setSelectedProject] = useState(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const projectDialog = useRef(null)
  const contactDialog = useRef(null)
  const menuDialog = useRef(null)
  const filterTarget = useRef(null)
  const copyTimer = useRef(null)
  const pageRef = useRef(null)
  const projectGrid = useRef(null)
  const filters = ['すべて', '空間・環境', '映像・ビジュアル', 'インタラクション']
  const visibleProjects = filter === 'すべて' ? projects : projects.filter(project => project.category === filter)
  usePortfolioMotion(pageRef)
  useProjectMotion(projectGrid, filter)

  useEffect(() => {
    const sections = document.querySelectorAll('main > section, footer.closing')
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActiveSection(entry.target.id) })
    }, { rootMargin: '-20% 0px -55% 0px' })
    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const dialog = projectDialog.current
    if (selectedProject && !dialog.open) dialog.showModal()
    else if (!selectedProject && dialog.open) dialog.close()
  }, [selectedProject])
  useEffect(() => {
    const dialog = contactDialog.current
    if (contactOpen && !dialog.open) dialog.showModal()
    else if (!contactOpen && dialog.open) dialog.close()
  }, [contactOpen])
  useEffect(() => {
    const dialog = menuDialog.current
    if (menuOpen && !dialog.open) dialog.showModal()
    else if (!menuOpen && dialog.open) dialog.close()
  }, [menuOpen])
  useEffect(() => {
    document.body.classList.toggle('overlay-open', Boolean(selectedProject || contactOpen || menuOpen))
    return () => document.body.classList.remove('overlay-open')
  }, [selectedProject, contactOpen, menuOpen])
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  function chooseCategory(category) {
    setFilter(category)
    requestAnimationFrame(() => {
      document.getElementById('works').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      filterTarget.current?.focus({ preventScroll: true })
    })
  }
  async function copyEmail() {
    if (!profile.email) return
    try {
      await navigator.clipboard.writeText(profile.email)
      setCopied(true)
      copyTimer.current = setTimeout(() => setCopied(false), 2200)
    } catch { setCopied(false) }
  }
  function closeOnBackdrop(event, close) {
    if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    }
  }

  const navLinks = [{ id: 'home', text: 'ホーム', english: 'HOME' }, { id: 'about', text: '私について', english: 'ABOUT' }, { id: 'works', text: '作品', english: 'WORK' }, { id: 'approach', text: 'アプローチ', english: 'APPROACH' }]
  return <div ref={pageRef} className="portfolio-app">
    <Opening />
    <SiteGrain />
    <GlassHeader activeSection={activeSection} menuOpen={menuOpen} onMenuOpen={() => setMenuOpen(true)} Brand={Brand} Arrow={Arrow} />
    <main id="main">
      <Hero />
      <section id="about" className="about-section section motion-chapter"><ParticlesBackground /><div className="wrap">
        <SectionLabel number="01">ABOUT / 私について</SectionLabel>
        <CinematicTitle>ABOUT</CinematicTitle>
        <div className="about-grid"><div className="about-copy"><TechHeading as="h3" className="motion-subtitle">現実を見つめ、<br />想像を<span className="serif-cn">描く。</span></TechHeading><p className="about-lead">世界への好奇心は、<br />いつもゲームから始まる。</p><p className="body-copy">{profile.about}</p><div className="about-signature"><span className="accent-line" /><span lang="ja">まだ見たことのない景色を。</span></div></div><div className="about-photo frame motion-photo-frame"><div className="motion-card-visual"><div className="motion-image-parallax"><ResponsiveImage src="/media/about.jpg" alt="霧に包まれた山と黒砂の草丘。空間の着想を得るための参考風景。" layout="about" data-source="Unsplash" data-subject="空間のインスピレーション" /></div></div><div className="photo-corner top-left" /><div className="photo-corner bottom-right" /><span className="about-photo-label">A STUDY OF SPACE & FEELING</span></div></div>
        <div className="interest-links"><span className="interest-caption">興味のある分野 <span>FIELDS OF INTEREST</span></span>{filters.slice(1).map((category, index) => <button key={category} onClick={() => chooseCategory(category)}><span className="interest-number">0{index + 1}</span>{category}<Arrow diagonal /></button>)}</div>
      </div></section>
      <section id="works" className={`works-section section motion-chapter ${filter !== 'すべて' ? 'is-filtered' : ''}`}><ParticlesBackground /><div className="wrap">
        <SectionLabel number="02">SELECTED WORK / 作品紹介</SectionLabel>
        <CinematicTitle>SELECTED WORK</CinematicTitle>
        <div className="section-heading"><TechHeading as="h3" className="motion-subtitle">想像の<span className="serif-cn">かたち。</span></TechHeading><p>空間、光と影、知覚をめぐる探求。<br /><span className="work-note">掲載画像は参考イメージです。作品は順次公開予定。</span></p></div>
        <div className="filter-bar" role="group" aria-label="作品をカテゴリーで絞り込む"><div className="filter-buttons">{filters.map((category, index) => <button ref={index === 0 ? filterTarget : null} key={category} onClick={() => setFilter(category)} aria-pressed={filter === category} className={filter === category ? 'active' : ''}>{category}{index === 0 && <span>{String(projects.length).padStart(2, '0')}</span>}</button>)}</div><span className="work-count" role="status" aria-live="polite">{String(visibleProjects.length).padStart(2, '0')} PROJECTS</span></div>
        <div ref={projectGrid} className="project-grid">{visibleProjects.map((project, index) => <div key={project.id} className={`project-reveal motion-reveal-mask ${filter === 'すべて' && index === 0 ? 'project-reveal-featured' : ''}`}><GlassProjectCard project={project} featured={filter === 'すべて' && index === 0} imageLayout={filter !== 'すべて' || index === 0 ? 'full' : 'half'} onOpen={setSelectedProject} Arrow={Arrow} /></div>)}</div>
      </div></section>
      <section id="approach" className="approach-section section motion-chapter"><ParticlesBackground /><div className="wrap">
        <SectionLabel number="03">MY APPROACH / 制作の視点</SectionLabel>
        <CinematicTitle>APPROACH</CinematicTitle>
        <div className="section-heading"><TechHeading as="h3" className="motion-subtitle">細部から、<br className="mobile-only" /><span className="serif-cn">世界へ。</span></TechHeading><p>観察を重ね、着想を広げる。<br />さまざまなメディアで、思いを作品にする。</p></div>
        <div className="strength-grid">{strengths.map((strength, index) => <div className="strength-reveal motion-reveal-mask" key={strength.number}><article className="strength-card card"><div className="strength-top"><span>{strength.number}</span><span>{strength.english}</span></div><StrengthVisual index={index} /><TechHeading as="h3">{strength.title}</TechHeading><p>{strength.description}</p></article></div>)}</div>
        <div className="approach-bottom"><span>好奇心を、いつまでも。</span><span>OBSERVE. IMAGINE. MAKE.</span></div>
      </div></section>
    </main>
    <footer id="contact" className="closing motion-chapter"><ParticlesBackground /><div className="wrap">
      <div className="contact-main"><SectionLabel number="04">GET IN TOUCH / お問い合わせ</SectionLabel><div className="contact-heading"><div className="footer-heading-mask motion-reveal-mask"><div className="footer-title-reveal"><TechHeading>LET’S<br /><span>CREATE.</span></TechHeading></div></div><button className="contact-orbit" onClick={() => setContactOpen(true)} aria-label="連絡先を見る"><Arrow diagonal /></button></div><div className="contact-copy"><p>次の世界は、<br />ひとつの対話から。</p><div><span>作品のこと、アイデアのこと、新しい可能性のこと。</span><button className="text-link" onClick={() => setContactOpen(true)}>お話しする <Arrow diagonal /></button></div></div></div>
      <div className="footer-bottom"><div className="footer-line"><Brand /><a className="back-top" href="#home">ページの先頭へ <span>↑</span></a></div><div className="footer-meta"><span>© {new Date().getFullYear()} PERSONAL PORTFOLIO</span><span>DESIGNED TO KEEP EXPLORING</span><a href="/ASSET-SOURCES.md" target="_blank" rel="noreferrer">素材クレジット <Arrow diagonal /></a></div></div>
    </div></footer>
    <dialog ref={menuDialog} id="mobile-menu" className="mobile-menu" onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} aria-label="ナビゲーションメニュー"><div className="menu-heading"><Brand onClick={() => setMenuOpen(false)} /><button className="close-button" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)}>×</button></div><nav>{[...navLinks, {id: 'contact', text: 'お問い合わせ', english: 'CONTACT'}].map(item => <a key={item.id} href={`#${item.id}`} onClick={() => setMenuOpen(false)}>{item.text}<span>{item.english}</span><Arrow diagonal /></a>)}</nav><span className="menu-caption">SPACE · IMAGE · INTERACTION</span></dialog>
    <dialog ref={projectDialog} id="project-detail" className="project-dialog glass-detail" aria-labelledby="project-dialog-title" onCancel={() => setSelectedProject(null)} onClose={() => setSelectedProject(null)} onClick={event => closeOnBackdrop(event, () => setSelectedProject(null))}>
      {selectedProject && <><button className="close-button" onClick={() => setSelectedProject(null)} aria-label="作品の詳細を閉じる">×</button><ProjectGlassReveal project={selectedProject} /><div className="dialog-content"><div className="dialog-eyebrow"><span>PROJECT {selectedProject.number} / {selectedProject.category}</span><span>参考イメージ</span></div><TechHeading id="project-dialog-title">{selectedProject.title}</TechHeading><p className="dialog-description">{selectedProject.description}</p><div className="dialog-details">{selectedProject.detail.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><div className="dialog-tags">{selectedProject.tags.map(tag => <span key={tag}>{tag}</span>)}</div><button className="text-link" onClick={() => setSelectedProject(null)}>作品一覧に戻る <Arrow /></button></div></>}
    </dialog>
    <dialog ref={contactDialog} className="contact-dialog glass-detail" aria-labelledby="contact-dialog-title" onCancel={() => setContactOpen(false)} onClose={() => setContactOpen(false)} onClick={event => closeOnBackdrop(event, () => setContactOpen(false))}>
      <button className="close-button" onClick={() => setContactOpen(false)} aria-label="連絡先を閉じる">×</button><span className="dialog-eyebrow">LET’S TALK</span><TechHeading id="contact-dialog-title">お話ししましょう。</TechHeading>{profile.email ? <><p>作品や制作のアイデアについて、お気軽にご連絡ください。</p><a className="contact-email" href={`mailto:${profile.email}`}>{profile.email}<Arrow diagonal /></a><button className="btn btn--primary" onClick={copyEmail}>{copied ? 'コピーしました' : 'メールアドレスをコピー'}</button><span role="status" className="sr-only">{copied ? 'メールアドレスをクリップボードにコピーしました' : ''}</span></> : <><p>連絡先は現在準備中です。<br />作品と新しいお知らせを、順次こちらに掲載します。</p><a className="btn btn--primary" href="#works" onClick={() => setContactOpen(false)}>作品を見る <Arrow diagonal /></a></>}
    </dialog>
  </div>
}

export default App

