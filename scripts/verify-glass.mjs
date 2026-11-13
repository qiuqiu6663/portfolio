import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
let playwright
try { playwright = require('playwright') }
catch { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright') }

const browser = await playwright.chromium.launch({ headless: true })
const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:5173'
const errors = []
await mkdir('shots/glass', { recursive: true })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(7000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.locator('.glass-nav').waitFor()
  await page.evaluate(() => document.fonts.ready)
  const heroPhotoSource = await page.locator('.hero-poster').getAttribute('src')
  assert.equal(heroPhotoSource, '/media/hero-city-source.jpg')

  const assertFixed = async () => {
    const header = await page.locator('.glass-nav').evaluate(el => ({
      y: el.getBoundingClientRect().top,
      x: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
      viewport: innerWidth,
      height: el.getBoundingClientRect().height,
      position: getComputedStyle(el).position,
      blur: getComputedStyle(el).backdropFilter,
    }))
    assert.equal(header.position, 'fixed')
    assert.ok(header.y >= 8 && header.y <= 24, 'Floating header must have a top gap')
    assert.ok(header.x >= 12 && header.right <= header.viewport - 12, 'Floating header must have side gaps')
    assert.ok(header.height >= 48 && header.height <= 60, 'Header should stay slim')
    assert.match(header.blur, /blur\(22px\)/)
    return header
  }
  await assertFixed()
  for (const section of ['about', 'works', 'approach', 'contact']) {
    await page.evaluate(id => document.getElementById(id).scrollIntoView({ behavior: 'instant' }), section)
    await assertFixed()
    await page.waitForFunction(() => document.querySelector('.glass-nav').dataset.scrolled === 'true')
  }
  console.log('PASS Slim floating header stays fixed with backdrop blur across all sections')

  for (const section of ['about', 'works', 'approach']) {
    await page.locator(`.desktop-nav a[href="#${section}"]`).click()
    await page.waitForFunction(id => {
      const target = document.getElementById(id).getBoundingClientRect()
      const header = document.querySelector('.glass-nav').getBoundingClientRect()
      return target.top >= header.bottom && target.top <= header.bottom + 20
    }, section)
    await page.waitForFunction(id => document.querySelector(`.desktop-nav a[href="#${id}"]`)?.getAttribute('aria-current') === 'location', section)
  }
  console.log('PASS Navigation anchors and active section stay clear of the fixed header')

  await page.locator('.desktop-nav a[href="#works"]').click()
  const card = page.locator('.glass-project').first()
  await page.waitForFunction(() => {
    const target = document.querySelector('#works').getBoundingClientRect()
    const header = document.querySelector('.glass-nav').getBoundingClientRect()
    return target.top >= header.bottom && target.top <= header.bottom + 20
  })
  await card.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 150, behavior: 'instant' }))
  await page.waitForFunction(() => Math.abs(document.querySelector('.glass-project').getBoundingClientRect().top - 150) < 3)
  await page.waitForTimeout(100)
  const bounds = await card.boundingBox()
  await page.mouse.move(bounds.x + bounds.width * .78, Math.max(bounds.y + 140, 150))
  await page.waitForFunction(() => Number(document.querySelector('.glass-project').style.getPropertyValue('--glass-light')) > .8)
  const hoverTransform = await card.locator('.glass-surface').evaluate(el => getComputedStyle(el).transform)
  assert.match(hoverTransform, /matrix3d/)
  await page.screenshot({ path: 'shots/glass/desktop-hover.png' })
  await page.mouse.move(5, 550)
  await page.waitForFunction(() => Number(document.querySelector('.glass-project').style.getPropertyValue('--glass-light')) < .002)
  assert.ok(Math.abs(await card.evaluate(el => parseFloat(el.style.getPropertyValue('--glass-ry')))) < .01)
  console.log('PASS Card reflection and restrained depth follow pointer, then settle to rest')

  await card.click()
  await page.locator('.project-dialog:modal').waitFor()
  assert.equal(await page.locator('.glass-fragment').count(), 5)
  assert.equal(await page.locator('.project-dialog').evaluate(el => document.activeElement === el || el.contains(document.activeElement)), true)
  await page.waitForFunction(() => [...document.querySelectorAll('.glass-fragment')].every(el => getComputedStyle(el).visibility === 'hidden'))
  await page.screenshot({ path: 'shots/glass/project-detail.png' })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.project-dialog').open)
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.glass-project')), true)
  console.log('PASS Fragment reveal completes; Escape and return focus remain native')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await card.hover()
  assert.equal(await card.locator('.glass-surface').evaluate(el => getComputedStyle(el).transform), 'none')
  await card.click()
  assert.equal(await page.locator('.glass-fragments').evaluate(el => getComputedStyle(el).display), 'none')
  await page.keyboard.press('Escape')
  console.log('PASS Reduced-motion mode disables tilt and fragment motion')

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  mobile.on('pageerror', error => errors.push(error.message))
  mobile.setDefaultTimeout(7000)
  await mobile.goto(url + '/#works')
  await mobile.locator('.glass-nav').waitFor()
  assert.ok(await mobile.locator('.glass-nav').evaluate(el => el.getBoundingClientRect().height <= 56))
  await mobile.locator('.menu-button').click()
  await mobile.locator('#mobile-menu:modal').waitFor()
  await mobile.locator('#mobile-menu a[href="#about"]').click()
  await mobile.waitForFunction(() => !document.querySelector('#mobile-menu').open)
  await mobile.waitForFunction(() => {
    const top = document.querySelector('#about').getBoundingClientRect().top
    const headerBottom = document.querySelector('.glass-nav').getBoundingClientRect().bottom
    return top >= headerBottom && top <= headerBottom + 20
  })
  assert.equal(await mobile.locator('.glass-surface').first().evaluate(el => getComputedStyle(el).transform), 'none')
  await mobile.screenshot({ path: 'shots/glass/mobile-fixed.png' })
  for (const width of [320, 390, 768, 828, 1024, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await assertFixed()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await page.setViewportSize({ width: 828, height: 741 })
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await page.waitForFunction(() => window.scrollY <= 1)
  await page.screenshot({ path: 'shots/glass/floating-header-828.png' })
  console.log('PASS Mobile menu layers correctly; touch surfaces stay still; 320–1920px no overflow')
  assert.deepEqual(errors, [])
  console.log('PASS No browser runtime errors; supplied city photograph is the Hero source')
} finally { await browser.close() }
