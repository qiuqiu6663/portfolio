import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)
// Keep the choreography at 60 updates/sec on 144–240Hz displays. Durations
// stay time-based; this avoids multiplying DOM writes with monitor refresh.
gsap.ticker.fps(60)

const OPEN = 'inset(0% 0% 0% 0%)'
const CLOSED = 'inset(100% 0% 0% 0%)'
const CLEAR = 'transform,clipPath,willChange'
const headings = element => [
  ...(element.matches('.tech-heading') ? [element] : []),
  ...element.querySelectorAll('.tech-heading'),
]

function suspend(element) {
  headings(element).forEach(heading => {
    heading.dataset.motionSuspended = 'true'
    heading.dispatchEvent(new Event('portfolio:motion-start'))
  })
}

function resume(element) {
  headings(element).forEach(heading => {
    delete heading.dataset.motionSuspended
    heading.dispatchEvent(new Event('portfolio:motion-end'))
  })
}

function imageParallax(scope) {
  scope.querySelectorAll('.motion-image-parallax').forEach(image => {
    // Set the starting pose in this context before a later refresh can render
    // the scrub tween from another media branch.
    gsap.set(image, { yPercent: -5, scale: 1.13 })
    gsap.to(image, {
      yPercent: 5, scale: 1.13, ease: 'none',
      scrollTrigger: {
        trigger: image.closest('.motion-photo-frame'),
        start: 'top bottom', end: 'bottom top', scrub: 1.15,
        invalidateOnRefresh: true,
        onToggle: trigger => image.classList.toggle('motion-active', trigger.isActive),
      },
    })
  })
}

export function usePortfolioMotion(scope) {
  useGSAP(() => {
    const root = scope.current
    const mm = gsap.matchMedia()
    const sectionTimelines = new Map()
    let disposed = false
    let playedOpening = false
    let fontTimer

    // Late callbacks belong to this media context, including its cleanup.
    mm.add({ reduced: '(prefers-reduced-motion: reduce)', full: '(prefers-reduced-motion: no-preference)' }, (media, contextSafe) => {
      const reduced = media.conditions.reduced
      root.dataset.motionMode = reduced ? 'reduced' : 'full'
      root.dataset.motionReady = 'true'
      const opening = root.querySelector('.opening-screen')
      const heroMask = root.querySelector('.hero-heading-mask')
      const heroWord = root.querySelector('.hero-title-reveal')
      const nav = root.querySelector('.glass-nav')
      const hero = root.querySelector('#home')
      const chapters = [...root.querySelectorAll('.motion-chapter')]

      if (reduced) {
        playedOpening = true
        root.dataset.openingState = 'skipped'
        gsap.set(opening, { autoAlpha: 0 })
        chapters.forEach(section => { section.dataset.chapterState = 'complete' })
        root.querySelectorAll('.project-reveal,.strength-reveal').forEach(card => { card.dataset.cardState = 'complete' })
        resume(root)
        return
      }

      const shouldOpen = !playedOpening && (!location.hash || location.hash === '#home') && scrollY < innerHeight * .3
      let openingTimeline
      const finishOpening = () => {
        opening.classList.remove('motion-active')
        gsap.set(opening, { autoAlpha: 0, clearProps: 'clipPath,transform,willChange' })
        gsap.set([heroMask, heroWord], { clearProps: 'transform,clipPath,overflow,willChange' })
        gsap.set([nav, hero.querySelector('.hero-aero'), ...hero.querySelectorAll('[data-opening-copy],.hero-side-index')], { clearProps: CLEAR })
        resume(hero)
        root.dataset.openingState = 'complete'
      }

      if (shouldOpen) {
        playedOpening = true
        root.dataset.openingState = 'running'
        suspend(hero)
        opening.classList.add('motion-active')
        gsap.set(opening, { autoAlpha: 1, clipPath: OPEN })
        gsap.set(heroMask, { overflow: 'hidden' })
        gsap.set(heroWord, { yPercent: 118, scaleY: .66, skewY: -3, transformOrigin: '0 100%' })
        gsap.set(nav, { y: -110 })
        gsap.set(hero.querySelector('.hero-aero'), { scale: 1.12, transformOrigin: '50% 50%' })
        const copy = [...hero.querySelectorAll('[data-opening-copy],.hero-side-index')]
        gsap.set(copy, { y: 38, clipPath: CLOSED })
        gsap.set(opening.querySelector('.opening-word'), { yPercent: 125, scaleY: 1.35 })
        gsap.set(opening.querySelector('.opening-rule'), { scaleX: 0 })
        gsap.set(opening.querySelectorAll('.opening-index,.opening-meta > span'), { y: 30, clipPath: CLOSED })
        openingTimeline = gsap.timeline({ paused: true, defaults: { ease: 'power4.out' }, onComplete: finishOpening })
          .to(opening.querySelector('.opening-rule'), { scaleX: 1, duration: 1.05, ease: 'power3.inOut' }, 0)
          .to(opening.querySelector('.opening-index'), { y: 0, clipPath: OPEN, duration: .9 }, .06)
          .to(opening.querySelector('.opening-word'), { yPercent: 0, scaleY: 1, duration: 1.35, ease: 'expo.out' }, .16)
          .to(opening.querySelectorAll('.opening-meta > span'), { y: 0, clipPath: OPEN, stagger: .12, duration: .9 }, .36)
          .to(opening.querySelector('.opening-word'), { yPercent: -112, scaleY: .8, duration: 1.1, ease: 'power4.inOut' }, 1.02)
          .to(opening, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.55, ease: 'power4.inOut' }, 1.12)
          .to(hero.querySelector('.hero-aero'), { scale: 1, duration: 2.35, ease: 'power3.out' }, 1.0)
          .to(nav, { y: 0, duration: 1.2 }, 1.22)
          .to(heroWord, { yPercent: 0, scaleY: 1, skewY: 0, duration: 1.85, ease: 'expo.out' }, 1.46)
          .to(copy, { y: 0, clipPath: OPEN, stagger: .12, duration: 1.15 }, 1.76)

        Promise.race([document.fonts.ready, new Promise(resolve => { fontTimer = setTimeout(resolve, 800) })])
          .then(() => { if (!disposed && root.dataset.openingState === 'running') openingTimeline.play() })
      } else {
        root.dataset.openingState = 'skipped'
        gsap.set(opening, { autoAlpha: 0 })
        resume(hero)
      }

      const skip = contextSafe(() => {
        if (root.dataset.openingState === 'running') openingTimeline?.progress(1)
      })
      const keyIntent = event => { if (['Tab', 'Escape', 'ArrowDown', 'PageDown', 'End'].includes(event.key)) skip() }
      window.addEventListener('wheel', skip, { passive: true })
      window.addEventListener('touchstart', skip, { passive: true })
      window.addEventListener('keydown', keyIntent)

      chapters.forEach(section => {
        if (section.dataset.chapterState === 'complete') return
        section.dataset.chapterState = 'waiting'
        const title = section.querySelector('.section-cinematic-title')
        const footerMask = section.querySelector('.footer-heading-mask')
        const footerWord = section.querySelector('.footer-title-reveal')
        const words = title ? [...title.querySelectorAll('.section-title-word')] : [footerWord]
        const subtitle = section.querySelector('.motion-subtitle')
        const description = section.querySelector('.section-heading > p')
        const label = section.querySelector('.section-label')
        const supplemental = [...section.querySelectorAll('.about-lead,.body-copy,.about-signature,.contact-copy,.footer-bottom')]
        if (title) suspend(title)
        if (subtitle) suspend(subtitle)
        if (footerWord) suspend(footerWord)
        gsap.set(words, { yPercent: 120, scaleY: .68, skewY: 3, transformOrigin: '0 100%' })
        if (footerMask) gsap.set(footerMask, { overflow: 'hidden' })
        if (subtitle) gsap.set(subtitle, { y: 62, clipPath: CLOSED })
        gsap.set([label, description, ...supplemental].filter(Boolean), { y: 58, clipPath: CLOSED })
        const timeline = gsap.timeline({
          defaults: { ease: 'power4.out' },
          scrollTrigger: { trigger: title || section.querySelector('.contact-heading'), start: 'top 87%', once: true },
          onStart: () => { section.dataset.chapterState = 'revealing'; title?.classList.add('motion-active') },
          onComplete: () => {
            title?.classList.remove('motion-active')
            section.dataset.chapterState = 'complete'
            gsap.set([words, subtitle, label, description, ...supplemental].flat().filter(Boolean), { clearProps: CLEAR })
            if (footerMask) gsap.set(footerMask, { clearProps: 'overflow' })
            if (title) resume(title)
            if (subtitle) resume(subtitle)
            if (footerWord) resume(footerWord)
          },
        })
          .to(words, { yPercent: 0, scaleY: 1, skewY: 0, duration: 1.7, stagger: .12, ease: 'expo.out' }, 0)
          .to(label, { y: 0, clipPath: OPEN, duration: 1.1 }, .18)
        if (subtitle) timeline.to(subtitle, { y: 0, clipPath: OPEN, duration: 1.3 }, .46)
        if (description) timeline.to(description, { y: 0, clipPath: OPEN, duration: 1.25 }, .65)
        if (supplemental.length) timeline.to(supplemental, { y: 0, clipPath: OPEN, duration: 1.35, stagger: .13 }, .73)
        const orbit = section.querySelector('.contact-orbit')
        if (orbit) {
          timeline.fromTo(orbit, { scale: .65, rotation: -28 }, { scale: 1, rotation: 0, duration: 1.6, clearProps: 'transform' }, .68)
        }
        sectionTimelines.set(section, timeline)
      })

      const photo = root.querySelector('.about-photo .motion-card-visual')
      if (photo) gsap.fromTo(photo, { clipPath: 'inset(0% 0% 100% 0%)', scale: 1.08 }, {
        clipPath: OPEN, scale: 1, duration: 1.8, ease: 'power4.inOut',
        scrollTrigger: { trigger: photo.closest('.about-photo'), start: 'top 86%', once: true },
        onComplete: () => { photo.dataset.imageRevealed = 'true'; gsap.set(photo, { clearProps: CLEAR }) },
      })

      const interests = root.querySelectorAll('.interest-links > *')
      if (interests.length) gsap.fromTo(interests, { y: 55, clipPath: CLOSED }, {
        y: 0, clipPath: OPEN, duration: 1.3, stagger: .12, ease: 'power4.out',
        scrollTrigger: { trigger: root.querySelector('.interest-links'), start: 'top 91%', once: true },
        onComplete: () => gsap.set(interests, { clearProps: CLEAR }),
      })

      const strengthCards = [...root.querySelectorAll('.strength-reveal')]
      if (strengthCards.length && strengthCards.some(card => card.dataset.cardState !== 'complete')) {
        strengthCards.forEach(card => { card.dataset.cardState = 'waiting'; suspend(card) })
        gsap.fromTo(strengthCards, { y: 120, scaleY: .94, clipPath: 'inset(12% 0% 88% 0%)' }, {
          y: 0, scaleY: 1, clipPath: OPEN, duration: 1.6, ease: 'power4.out',
          stagger: {
            each: .2,
            onStart() { const card = this.targets()[0]; card.dataset.cardState = 'revealing'; card.classList.add('motion-active') },
            onComplete() {
              const card = this.targets()[0]
              card.dataset.cardState = 'complete'
              card.classList.remove('motion-active')
              gsap.set(card, { clearProps: CLEAR })
              resume(card)
            },
          },
          scrollTrigger: { trigger: root.querySelector('.strength-grid'), start: 'top 88%', once: true },
          delay: .72,
        })
      }
      imageParallax(root.querySelector('.about-section'))

      const focus = contextSafe(event => {
        if (!event.target.matches(':focus-visible')) return
        skip()
        const section = event.target.closest('.motion-chapter')
        sectionTimelines.get(section)?.progress(1)
        if (section?.id === 'approach') {
          gsap.killTweensOf(strengthCards)
          strengthCards.forEach(card => { gsap.set(card, { clearProps: CLEAR }); card.dataset.cardState = 'complete'; resume(card) })
        }
      })
      root.addEventListener('focusin', focus)
      document.fonts.ready.then(() => { if (!disposed) ScrollTrigger.refresh() })

      return () => {
        window.removeEventListener('wheel', skip)
        window.removeEventListener('touchstart', skip)
        window.removeEventListener('keydown', keyIntent)
        root.removeEventListener('focusin', focus)
        root.querySelectorAll('.motion-active').forEach(element => element.classList.remove('motion-active'))
        resume(root)
        sectionTimelines.clear()
      }
    })

    return () => {
      disposed = true
      clearTimeout(fontTimer)
      mm.revert()
    }
  }, { scope })
}

export function useProjectMotion(scope, filter) {
  useGSAP(() => {
    const grid = scope.current
    const cards = [...grid.querySelectorAll('.project-reveal')]
    const mm = gsap.matchMedia()
    // Using the parent useGSAP context here would create a context cycle when
    // ScrollTrigger's media-scoped batch timer invokes a late callback.
    mm.add({ reduced: '(prefers-reduced-motion: reduce)', full: '(prefers-reduced-motion: no-preference)' }, (media, contextSafe) => {
      if (media.conditions.reduced) {
        cards.forEach(card => { card.dataset.cardState = 'complete'; resume(card) })
        return
      }
      const unseen = cards.filter(card => card.dataset.cardState !== 'complete')
      unseen.forEach(card => { card.dataset.cardState = 'waiting'; suspend(card) })
      if (unseen.length) gsap.set(unseen, { y: 110, scale: .96, clipPath: 'inset(12% 0% 88% 0%)' })
      if (unseen.length) ScrollTrigger.batch(unseen, {
        start: 'top 92%', once: true, interval: .12, batchMax: 2,
        onEnter: contextSafe(batch => {
          const pending = batch.filter(card => card.dataset.cardState !== 'complete')
          if (!pending.length) return
          const delay = grid.closest('section').dataset.chapterState === 'complete' ? .05 : .9
          gsap.to(pending, {
            y: 0, scale: 1, clipPath: OPEN, duration: 1.65,
            stagger: {
              each: .18,
              onStart() { const card = this.targets()[0]; card.dataset.cardState = 'revealing'; card.classList.add('motion-active') },
              onComplete() {
                const card = this.targets()[0]
                card.dataset.cardState = 'complete'
                card.classList.remove('motion-active')
                gsap.set(card, { clearProps: CLEAR })
                resume(card)
              },
            },
            delay, ease: 'power4.out', overwrite: 'auto',
          })
        }),
      })
      imageParallax(grid)
      const focus = contextSafe(event => {
        const card = event.target.closest('.project-reveal')
        if (!card || !event.target.matches(':focus-visible')) return
        gsap.killTweensOf(card)
        gsap.set(card, { clearProps: CLEAR })
        card.dataset.cardState = 'complete'
        resume(card)
      })
      grid.addEventListener('focusin', focus)
      const refresh = gsap.delayedCall(.06, () => ScrollTrigger.refresh())
      return () => {
        refresh.kill()
        gsap.killTweensOf(cards)
        gsap.set(cards, { clearProps: CLEAR })
        cards.forEach(card => card.classList.remove('motion-active'))
        grid.removeEventListener('focusin', focus)
        cards.forEach(resume)
      }
    })
    return () => mm.revert()
  }, { scope, dependencies: [filter], revertOnUpdate: true })
}
