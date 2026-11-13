import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) }
catch { ({ chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' })
const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:4173/#home'
const report = { errors: [] }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  await page.addInitScript(() => {
    window.__heroSweep = { frames: 0, longTasks: [] }
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.matches('#home h1 canvas')) window.__heroSweep.frames++
      return clear.apply(this, args)
    }
    new PerformanceObserver(list => window.__heroSweep.longTasks.push(...list.getEntries().map(entry => ({ at: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true })
  })
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('.portfolio-app')?.dataset.openingState === 'running')
  assert.equal(await page.locator('#home h1 canvas').count(), 0, 'No sweeping canvas during the GSAP entrance')
  await page.waitForFunction(() => document.querySelector('.portfolio-app')?.dataset.openingState === 'complete')
  await page.waitForFunction(() => document.querySelector('#home h1')?.dataset.techReady === 'true')
  await page.mouse.move(0, 0)
  const hash = () => page.locator('#home h1 canvas').first().evaluate(canvas => {
    const sample = document.createElement('canvas'); sample.width = 96; sample.height = 48
    const ctx = sample.getContext('2d'); ctx.drawImage(canvas, 0, 0, 96, 48)
    return ctx.getImageData(0, 0, 96, 48).data.reduce((value, byte) => Math.imul(value ^ byte, 16777619) >>> 0, 2166136261)
  })
  const first = await hash()
  const start = await page.evaluate(() => ({ ...window.__heroSweep, at: performance.now() }))
  await page.waitForTimeout(1200)
  const second = await hash()
  const finish = await page.evaluate(() => ({ ...window.__heroSweep, at: performance.now() }))
  assert.notEqual(first, second, 'Title artwork must change with no pointer input after the entrance')
  report.automatic = { changedPixels: first !== second, observedPaintsPerSecond: (finish.frames - start.frames) * 1000 / (finish.at - start.at), longTasksDuringSweep: finish.longTasks.filter(task => task.at >= start.at) }
  await page.locator('#approach').evaluate(node => node.scrollIntoView({ behavior: 'instant' }))
  await page.waitForFunction(() => !document.querySelector('#home h1 canvas'))
  const offscreen = await page.evaluate(() => window.__heroSweep.frames)
  await page.waitForTimeout(350)
  assert.equal(await page.evaluate(() => window.__heroSweep.frames), offscreen, 'Offscreen title must stop painting')
  await page.locator('#home').evaluate(node => node.scrollIntoView({ behavior: 'instant' }))
  await page.waitForFunction(() => document.querySelector('#home h1')?.dataset.techReady === 'true')
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForFunction(() => !document.querySelector('#home h1 canvas'))
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForFunction(() => document.querySelector('#home h1')?.dataset.techReady === 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => !document.querySelector('#home h1 canvas'))
  assert.equal(await page.locator('#home h1 .tech-heading-copy').evaluate(node => getComputedStyle(node).opacity), '1')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(() => document.querySelector('#home h1 canvas'))
  await page.evaluate(() => { Object.defineProperty(navigator.connection, 'saveData', { configurable: true, value: true }); navigator.connection.dispatchEvent(new Event('change')) })
  await page.waitForFunction(() => !document.querySelector('#home h1 canvas'))
  report.pauses = { offscreen: true, syntheticHidden: true, reduced: true, saveData: true, restoresOnReturn: true }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  phone.on('pageerror', error => report.errors.push(error.message))
  await phone.goto(url)
  await phone.waitForFunction(() => document.querySelector('.portfolio-app')?.dataset.openingState === 'complete')
  assert.equal(await phone.locator('#home h1 canvas').count(), 0, 'Touch devices retain the lightweight DOM title')
  report.touchFallback = true
  assert.deepEqual(report.errors, [])
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  await mkdir('shots/hero-sweep', { recursive: true })
  await writeFile('shots/hero-sweep/report.json', JSON.stringify(report, null, 2))
}
