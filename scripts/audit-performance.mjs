import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const require = createRequire(import.meta.url)
let chromium
try { ({ chromium } = require('playwright')) }
catch { ({ chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const phase = process.argv[2] || 'after'
const base = process.env.PORTFOLIO_URL || 'http://127.0.0.1:4173'
const out = path.resolve('shots/performance')
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, cpu: 1, latency: 40, mbps: 6 },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, cpu: 2, latency: 80, mbps: 4 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, cpu: 4, latency: 150, mbps: 1.6 },
]
// Observe original rendering calls; do not change GPU, timers or frame cadence.
function observe() {
  const data = { submits: 0, particleDraws: 0, callbacks: 0, longTasks: [], lcp: 0, cls: 0, gpuErrors: [] }
  const raf = window.requestAnimationFrame
  window.requestAnimationFrame = callback => raf.call(window, time => { data.callbacks++; callback(time) })
  if (window.GPUQueue) {
    const submit = GPUQueue.prototype.submit
    GPUQueue.prototype.submit = function (...args) { data.submits++; return submit.apply(this, args) }
  }
  if (window.GPUAdapter) {
    const request = GPUAdapter.prototype.requestDevice
    GPUAdapter.prototype.requestDevice = async function (...args) {
      const device = await request.apply(this, args)
      device.addEventListener('uncapturederror', event => data.gpuErrors.push(event.error.message))
      return device
    }
  }
  const proto = window.WebGL2RenderingContext?.prototype
  if (proto) {
    const draw = proto.drawArraysInstanced
    proto.drawArraysInstanced = function (...args) { if (this.canvas.matches('.particles-canvas')) data.particleDraws++; return draw.apply(this, args) }
  }
  for (const [type, handle] of [
    ['largest-contentful-paint', entry => { data.lcp = entry.startTime }],
    ['layout-shift', entry => { if (!entry.hadRecentInput) data.cls += entry.value }],
    ['longtask', entry => data.longTasks.push({ start: entry.startTime, duration: entry.duration })],
  ]) { try { new PerformanceObserver(list => list.getEntries().forEach(handle)).observe({ type, buffered: true }) } catch {} }
  window.__perf = () => ({ ...data, now: performance.now() })
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
async function inventory(dir) {
  const rows = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) rows.push(...await inventory(file))
    else { const buffer = await readFile(file); rows.push({ file: path.relative('dist', file).replaceAll('\\', '/'), bytes: buffer.length, gzip: /\.(js|css|html|svg)$/.test(file) ? gzipSync(buffer).length : buffer.length }) }
  }
  return rows
}
await mkdir(out, { recursive: true })
const report = { phase, base, note: 'Full Chrome, native host GPU; viewport/touch/DPR and CDP CPU/network emulation, not physical devices or field Web Vitals. Three cold loads per profile. Resource encodedBodySize measures actual compressed response bodies from Vite preview; inventory includes both disk and gzip sizes.', inventory: await inventory('dist'), profiles: [], errors: [] }
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' })
try {
  for (const profile of profiles) {
    const result = { profile, loads: [] }
    report.profiles.push(result)
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext(profile)
      const page = await context.newPage()
      page.setDefaultTimeout(16000)
      page.on('pageerror', error => report.errors.push({ profile: profile.name, run, error: error.stack }))
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.mbps * 1e6 / 8, uploadThroughput: 1e6 / 8 })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
      await page.addInitScript(observe)
      await page.goto(base, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => ['complete', 'skipped'].includes(document.querySelector('.portfolio-app')?.dataset.openingState))
      await page.waitForTimeout(1000)
      const first = await page.evaluate(() => ({
        ...window.__perf(), fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        resources: performance.getEntriesByType('resource').map(({ name, encodedBodySize, transferSize, initiatorType, duration }) => ({ name: name.replace(location.origin, ''), bytes: encodedBodySize, transferSize, initiatorType, duration })),
        hero: document.querySelector('.hero-aero')?.dataset.status,
        videos: document.querySelectorAll('video').length,
        canvases: [...document.querySelectorAll('canvas')].map(canvas => ({ className: canvas.className, pixels: canvas.width * canvas.height })),
      }))
      const prior = await page.evaluate(() => window.__perf())
      await page.waitForTimeout(1000)
      const next = await page.evaluate(() => window.__perf())
      first.heroPerSecond = { submits: (next.submits - prior.submits) * 1000 / (next.now - prior.now), callbacks: (next.callbacks - prior.callbacks) * 1000 / (next.now - prior.now) }
      if (run === 0) {
        for (const id of ['about', 'works', 'approach', 'contact']) {
          await page.locator(`#${id}`).evaluate(node => { const y = node.getBoundingClientRect().top + scrollY; window.scrollTo({ top: y, behavior: 'instant' }) })
          await page.waitForTimeout(1900)
        }
        const before = await page.evaluate(() => window.__perf())
        await page.waitForTimeout(1000)
        const after = await page.evaluate(() => window.__perf())
        result.footerPerSecond = { heroSubmits: (after.submits - before.submits) * 1000 / (after.now - before.now), particleDraws: (after.particleDraws - before.particleDraws) * 1000 / (after.now - before.now), callbacks: (after.callbacks - before.callbacks) * 1000 / (after.now - before.now) }
        result.geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, unloaded: [...document.images].filter(image => !image.closest('dialog:not([open])') && (!image.complete || !image.naturalWidth)).map(image => image.currentSrc), images: [...document.images].filter(image => !image.closest('dialog:not([open])')).map(image => ({ src: image.currentSrc.replace(location.origin, ''), natural: image.naturalWidth, displayed: Math.round(image.getBoundingClientRect().width) })) }))
        result.allResources = await page.evaluate(() => performance.getEntriesByType('resource').map(({ name, encodedBodySize }) => ({ name: name.replace(location.origin, ''), bytes: encodedBodySize })))
        const root = (await cdp.send('Runtime.evaluate', { expression: 'window', returnByValue: false })).result.objectId
        const listeners = await cdp.send('DOMDebugger.getEventListeners', { objectId: root })
        result.windowListeners = listeners.listeners.map(({ type, passive }) => ({ type, passive }))
        await page.screenshot({ path: path.join(out, `${phase}-${profile.name}.png`), fullPage: false })
      }
      result.loads.push(first)
      await context.close()
    }
    result.medians = { fcp: median(result.loads.map(x => x.fcp || 0)), lcp: median(result.loads.map(x => x.lcp)), cls: median(result.loads.map(x => x.cls)), firstScreenBytes: median(result.loads.map(x => x.resources.reduce((sum, r) => sum + r.bytes, 0))), longTasks: median(result.loads.map(x => x.longTasks.length)), blockingMs: median(result.loads.map(x => x.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0))), heroSubmitsPerSecond: median(result.loads.map(x => x.heroPerSecond.submits)) }
    console.log(JSON.stringify({ device: profile.name, ...result.medians, footer: result.footerPerSecond, geometry: result.geometry }))
    await writeFile(path.join(out, `${phase}.json`), JSON.stringify(report, null, 2))
  }
} finally { await browser.close(); await writeFile(path.join(out, `${phase}.json`), JSON.stringify(report, null, 2)) }
