import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Desktop only: start Vite, then node scripts/verify-aero.mjs.
// Full Chrome is required here. The default headless shell has no GPU adapter;
// adding SwiftShader flags also prevents the native WebGPU adapter from working.
const require = createRequire(import.meta.url)
let playwright
try { playwright = require('playwright') }
catch { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright') }
const executablePath = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:5173'
const output = fileURLToPath(new URL('../shots/aero/', import.meta.url))
const viewports = [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]
const report = { executablePath, viewports: [], errors: [] }
await mkdir(output, { recursive: true })
const browser = await playwright.chromium.launch({ headless: true, executablePath })

function observeAero({ failAdapter }) {
  const state = { supported: Boolean(navigator.gpu), adapters: [], devices: 0, configuredCanvases: 0, submits: 0, writes: 0, changedWrites: 0, gpuErrors: [], events: [] }
  const buffers = new WeakMap()
  const registrations = new WeakMap()
  const nativeAdd = EventTarget.prototype.addEventListener
  const nativeRemove = EventTarget.prototype.removeEventListener
  // Keep native handlers and event semantics. Record that real mouse events
  // actually reach the original component's named window handlers in Vite.
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this !== window || typeof listener !== 'function' || !['pointermove', 'pointerdown', 'pointerup'].includes(type)) return nativeAdd.call(this, type, listener, options)
    const key = `${type}:${typeof options === 'boolean' ? options : Boolean(options?.capture)}`
    if (!registrations.has(listener)) registrations.set(listener, new Map())
    const entries = registrations.get(listener)
    if (!entries.has(key)) entries.set(key, function (event) {
      if (['onMove', 'onDown', 'onUp'].includes(listener.name)) {
        state.events.push({ type, handler: listener.name, at: performance.now(), x: event.clientX, y: event.clientY, trusted: event.isTrusted, interactive: Boolean(event.target?.closest?.('a,button,input,textarea,select,label,[role="button"]')) })
        if (state.events.length > 100) state.events.shift()
      }
      return listener.call(this, event)
    })
    return nativeAdd.call(this, type, entries.get(key), options)
  }
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const key = `${type}:${typeof options === 'boolean' ? options : Boolean(options?.capture)}`
    return nativeRemove.call(this, type, registrations.get(listener)?.get(key) || listener, options)
  }
  const errorText = error => `${error?.constructor?.name || 'GPUError'}: ${error?.message || error}`
  if (navigator.gpu) {
    const prototype = Object.getPrototypeOf(navigator.gpu)
    const requestAdapter = prototype.requestAdapter
    prototype.requestAdapter = async function (...args) {
      if (failAdapter) { state.adapters.push({ forcedFailure: true }); return null }
      const adapter = await requestAdapter.apply(this, args)
      if (!adapter) state.adapters.push({ available: false })
      else {
        const info = adapter.info || {}
        state.adapters.push({ available: true, vendor: info.vendor, architecture: info.architecture, description: info.description, isFallback: info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null })
      }
      return adapter
    }
  }
  if (window.GPUAdapter) {
    const requestDevice = GPUAdapter.prototype.requestDevice
    GPUAdapter.prototype.requestDevice = async function (...args) {
      const device = await requestDevice.apply(this, args)
      state.devices++
      nativeAdd.call(device, 'uncapturederror', event => state.gpuErrors.push(errorText(event.error)))
      device.lost.then(info => { if (info.reason !== 'destroyed') state.gpuErrors.push(`Device lost: ${info.reason}: ${info.message}`) })
      return device
    }
  }
  if (window.GPUDevice) {
    const popErrorScope = GPUDevice.prototype.popErrorScope
    GPUDevice.prototype.popErrorScope = async function (...args) {
      const error = await popErrorScope.apply(this, args)
      if (error) state.gpuErrors.push(errorText(error))
      return error
    }
  }
  if (window.GPUCanvasContext) {
    const configure = GPUCanvasContext.prototype.configure
    GPUCanvasContext.prototype.configure = function (...args) {
      const result = configure.apply(this, args)
      if (this.canvas?.matches?.('.aero-shards-canvas')) state.configuredCanvases++
      return result
    }
  }
  if (window.GPUQueue) {
    const submit = GPUQueue.prototype.submit
    GPUQueue.prototype.submit = function (...args) {
      const result = submit.apply(this, args)
      state.submits++
      return result
    }
    const writeBuffer = GPUQueue.prototype.writeBuffer
    GPUQueue.prototype.writeBuffer = function (buffer, offset, data, ...rest) {
      const result = writeBuffer.call(this, buffer, offset, data, ...rest)
      state.writes++
      // Sample raw uploaded bytes. No shader offsets, layout assumptions, extra
      // GPU work, forced timestamps, or modifications to the uploaded data.
      const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)
      let hash = 2166136261
      const stride = Math.max(1, Math.floor(bytes.length / 128))
      for (let index = 0; index < bytes.length; index += stride) hash = Math.imul(hash ^ bytes[index], 16777619) >>> 0
      if (buffers.has(buffer) && buffers.get(buffer) !== hash) state.changedWrites++
      buffers.set(buffer, hash)
      return result
    }
  }
  window.__aeroQa = { snapshot: () => structuredClone(state) }
}

const gpu = page => page.evaluate(() => window.__aeroQa.snapshot())
async function openPage(viewport, failAdapter = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: false, isMobile: false })
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.errors.push({ viewport, forcedFallback: failAdapter, type: 'page', message: error.message }))
  page.on('console', message => {
    if (message.type() === 'error' && /GPUValidationError|WebGPU.*error|validation error|WGSL.*error/i.test(message.text())) report.errors.push({ viewport, forcedFallback: failAdapter, type: 'GPU console', message: message.text() })
  })
  await page.addInitScript(observeAero, { failAdapter })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('#home .hero-aero').waitFor()
  await page.evaluate(() => document.fonts.ready)
  return page
}

async function home(page) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await page.waitForFunction(() => scrollY <= 1)
}

async function geometry(page, viewport) {
  const info = await page.locator('#home .hero-aero').evaluate(element => {
    const hero = document.getElementById('home').getBoundingClientRect()
    const layer = element.getBoundingClientRect()
    return { width: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth, coverage: Math.max(...['top', 'right', 'bottom', 'left'].map(edge => Math.abs(hero[edge] - layer[edge]))) }
  })
  assert.equal(info.width, viewport.width)
  assert.ok(info.root <= viewport.width + 1 && info.body <= viewport.width + 1, `No horizontal desktop overflow: ${JSON.stringify(info)}`)
  assert.ok(info.coverage <= 2, 'Aero must fill the existing Hero')
  assert.equal(await page.locator('.hero-aero').getAttribute('aria-hidden'), 'true')
  assert.equal(await page.locator('#home .section-particles').count(), 0)
  return info
}

async function imageEvidence(page, viewport, name) {
  // The right side excludes the title and fixed navigation, so text animations
  // and hover labels cannot satisfy the background pixel-change assertions.
  const clip = { x: Math.round(viewport.width * .73), y: Math.round(viewport.height * .2), width: Math.round(viewport.width * .24), height: Math.round(viewport.height * .58) }
  const bytes = await page.screenshot({ clip, path: path.join(output, `${viewport.width}-${name}.png`) })
  const metrics = await page.evaluate(async encoded => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, 96, 96)
    const bytes = context.getImageData(0, 0, 96, 96).data
    let low = 255
    let high = 0
    let opaque = 0
    for (let index = 0; index < bytes.length; index += 4) {
      if (bytes[index + 3] > 0) opaque++
      const light = Math.max(bytes[index], bytes[index + 1], bytes[index + 2])
      low = Math.min(low, light)
      high = Math.max(high, light)
    }
    return { low, high, range: high - low, opaque }
  }, bytes.toString('base64'))
  return { hash: createHash('sha256').update(bytes).digest('hex'), ...metrics }
}

async function freePoint(page) {
  return page.locator('#home').evaluate(element => {
    const rect = element.getBoundingClientRect()
    for (const xRatio of [.82, .7, .9, .6]) for (const yRatio of [.5, .67, .35]) {
      const point = { x: rect.left + rect.width * xRatio, y: rect.top + rect.height * yRatio }
      const hit = document.elementFromPoint(point.x, point.y)
      if (hit && element.contains(hit) && !hit.closest('a,button,input,textarea,select,label,[role="button"],.tech-heading')) return point
    }
    return null
  })
}

async function interactions(page, viewport) {
  const point = await freePoint(page)
  assert.ok(point, 'Need a genuine non-button Hero area for Aero interactions')
  const evidence = []
  for (const kind of ['move', 'click', 'hold']) {
    const before = await gpu(page)
    const beforePixels = await imageEvidence(page, viewport, `${kind}-before`)
    const started = await page.evaluate(() => performance.now())
    if (kind === 'move') await page.mouse.move(point.x, point.y, { steps: 8 })
    else if (kind === 'click') await page.mouse.click(point.x, point.y)
    else await page.mouse.down()
    let afterPixels
    try {
      await page.waitForTimeout(kind === 'hold' ? 1050 : 450)
      afterPixels = await imageEvidence(page, viewport, `${kind}-after`)
    } finally { if (kind === 'hold') await page.mouse.up() }
    const after = await gpu(page)
    const wanted = kind === 'move' ? ['onMove'] : ['onDown', 'onUp']
    for (const handler of wanted) assert.ok(after.events.some(event => event.handler === handler && event.at >= started && event.trusted && !event.interactive), `Real ${kind} must reach Aero's ${handler} handler over non-button content`)
    assert.ok(after.submits > before.submits && after.changedWrites > before.changedWrites, `${kind} should continue submitting updated native GPU data`)
    assert.notEqual(afterPixels.hash, beforePixels.hash, `${kind} must have observable background pixel changes`)
    evidence.push({ kind, point, submits: after.submits - before.submits, changedWrites: after.changedWrites - before.changedWrites, beforePixels, afterPixels })
  }
  return evidence
}

async function foreground(page) {
  for (const selector of ['.desktop-nav a', '.nav-contact']) {
    const links = page.locator(selector)
    for (let index = 0; index < await links.count(); index++) {
      const link = links.nth(index)
      assert.ok((await link.textContent()).trim(), 'Navigation text must remain present')
      assert.equal(await link.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
      }), true, 'Aero canvas must not cover navigation or contact controls')
    }
  }
  await page.locator('.nav-contact').click()
  await page.waitForFunction(() => document.getElementById('contact').getBoundingClientRect().top < innerHeight / 2)
  await page.locator('.contact-orbit').click()
  await page.locator('.contact-dialog:modal').waitFor()
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.contact-dialog').open)
}

async function belowHeroAndPause(page) {
  for (const section of ['about', 'works', 'approach', 'contact']) {
    await page.locator(`#${section}`).evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }))
    const layer = page.locator(`#${section} .section-particles`)
    assert.equal(await layer.count(), 1)
    const canvas = layer.locator('.particles-container canvas.particles-canvas')
    await canvas.waitFor({ state: 'visible' })
    assert.equal(await canvas.evaluate(element => { const context = element.getContext('webgl2'); return Boolean(context && !context.isContextLost() && element.width > 0 && element.height > 0) }), true, `${section} must retain its live Particles renderer`)
  }
  await page.waitForTimeout(400)
  const before = await gpu(page)
  await page.waitForTimeout(700)
  const after = await gpu(page)
  assert.equal(after.submits, before.submits, 'Offscreen Aero must stop GPU rendering while the lower page stays usable')
  return { before: before.submits, after: after.submits }
}

async function reducedMotion(page, viewport) {
  await home(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(1, 1)
  let previous = (await gpu(page)).submits
  let quiet = 0
  for (let attempt = 0; attempt < 50 && quiet < 4; attempt++) {
    await page.waitForTimeout(200)
    const count = (await gpu(page)).submits
    quiet = count === previous ? quiet + 1 : 0
    previous = count
  }
  assert.ok(quiet >= 4, 'Reduced motion must settle into a static scene')
  const before = await gpu(page)
  const first = await imageEvidence(page, viewport, 'reduced-first')
  assert.ok(first.opaque > 0 && first.range > 8, 'Reduced motion must retain a visible static image')
  const point = await freePoint(page)
  await page.mouse.move(point.x, point.y)
  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(650)
  const second = await imageEvidence(page, viewport, 'reduced-second')
  assert.equal((await gpu(page)).submits, before.submits, 'Reduced motion must stay static after pointer/click input')
  assert.equal(first.hash, second.hash, 'Reduced-motion background pixels must remain stable')
  return { submits: before.submits, first, second }
}

let activePage
try {
  for (const viewport of viewports) {
    const result = { viewport }
    report.viewports.push(result)
    const page = await openPage(viewport)
    activePage = page
    await page.locator('#home .hero-aero[data-status="ready"] .aero-shards canvas.aero-shards-canvas').waitFor()
    await page.waitForFunction(() => window.__aeroQa.snapshot().submits >= 5)
    const initial = await gpu(page)
    assert.ok(initial.supported && initial.devices > 0 && initial.configuredCanvases > 0, 'Aero must configure and submit a real native WebGPU canvas')
    assert.ok(initial.adapters.some(adapter => adapter.available && !adapter.isFallback), 'A native hardware adapter must be available')
    assert.ok(!initial.adapters.some(adapter => /swiftshader/i.test(adapter.description || '')), 'Do not silently run Aero on SwiftShader')
    await page.mouse.move(1, 1)
    await page.waitForTimeout(4100) // Original AeroShards intro lasts 3.4 seconds.
    result.geometry = await geometry(page, viewport)
    const first = await imageEvidence(page, viewport, 'motion-first')
    await page.waitForTimeout(350)
    const second = await imageEvidence(page, viewport, 'motion-second')
    assert.ok(first.opaque > 0 && first.range > 8, 'The rendered Hero must contain actual visible artwork')
    assert.notEqual(first.hash, second.hash, 'Normal Aero motion must change background pixels')
    result.motion = { first, second }
    result.interactions = await interactions(page, viewport)
    await page.screenshot({ path: path.join(output, `${viewport.width}-hero.png`) })
    await foreground(page)
    result.offscreen = await belowHeroAndPause(page)
    result.reduced = await reducedMotion(page, viewport)
    result.gpu = await gpu(page)
    assert.deepEqual(result.gpu.gpuErrors, [], 'No native GPU validation, scoped or device errors')
    await page.close()
    activePage = null
    console.log(`PASS ${viewport.width}x${viewport.height}: native WebGPU pixels, mouse/click/hold, foreground controls, lower particles, offscreen pause and reduced motion`)

    const fallback = await openPage(viewport, true)
    activePage = fallback
    const image = fallback.locator('#home .hero-aero[data-status="fallback"] img.hero-aero-fallback')
    await image.waitFor({ state: 'visible' })
    assert.equal(await image.getAttribute('src'), '/media/hero-aero-fallback.png')
    await fallback.waitForFunction(() => { const image = document.querySelector('.hero-aero-fallback'); return image?.complete && image.naturalWidth > 0 })
    assert.equal(await fallback.locator('#home .aero-shards-canvas').count(), 0, 'Failed GPU renderer must be replaced by the static fallback')
    const firstFallback = await imageEvidence(fallback, viewport, 'fallback-first')
    await fallback.waitForTimeout(450)
    const secondFallback = await imageEvidence(fallback, viewport, 'fallback-second')
    assert.equal(firstFallback.hash, secondFallback.hash, 'GPU failure must leave a stable static fallback')
    await geometry(fallback, viewport)
    await foreground(fallback)
    result.fallback = { image: firstFallback, gpu: await gpu(fallback) }
    assert.equal(result.fallback.gpu.submits, 0, 'A failed adapter must not keep attempting GPU frames')
    assert.deepEqual(result.fallback.gpu.gpuErrors, [])
    await fallback.close()
    activePage = null
    console.log(`PASS ${viewport.width}px: forced adapter failure loads the static fallback, preserves controls and has no rendering loop`)
  }
  assert.deepEqual(report.errors, [], 'No runtime or GPU validation errors')
  console.log(`PASS Desktop-only Aero verification complete. Evidence: ${output}`)
} catch (error) {
  report.failure = error.stack || error.message
  if (activePage && !activePage.isClosed()) {
    report.lastGpu = await gpu(activePage).catch(() => null)
    await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
