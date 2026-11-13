import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Desktop only. Start Vite, then run: node scripts/verify-particles.mjs
const require = createRequire(import.meta.url)
let playwright
try { playwright = require('playwright') }
catch { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright') }

const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:5173'
const output = fileURLToPath(new URL('../shots/particles/', import.meta.url))
const sections = ['about', 'works', 'approach', 'contact']
const viewports = [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]
const expectedUniforms = {
  uEffect: 2, uSpread: 10, uSize: 100, uGlow: .5, uTwinkle: 1,
  uRandomness: .95, uStrength: .85, uSoft: .2, uCamera: 26,
  uOpacity: .8, uShape: 0, uDrift: 0,
}
const report = { viewports: [], errors: [] }
await mkdir(output, { recursive: true })
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) })

// Observe the real GL2 renderer without changing its context options, uniforms,
// shaders, frame scheduling or input events. Pixel reads happen synchronously
// after a particle draw: preserveDrawingBuffer is intentionally left untouched.
function instrumentParticles() {
  if (!window.WebGL2RenderingContext) {
    window.__particlesQa = { supported: false, snapshot: () => [] }
    return
  }
  const contexts = new Map()
  const locations = new WeakMap()
  let sequence = 0
  const prototype = WebGL2RenderingContext.prototype
  const original = {}
  const ensure = gl => {
    if (!gl.canvas?.matches?.('canvas.particles-canvas')) return null
    if (!contexts.has(gl)) {
      const id = ++sequence
      gl.canvas.dataset.particlesQaId = String(id)
      contexts.set(gl, {
        id, section: gl.canvas.closest('section,footer')?.id, canvas: gl.canvas,
        programs: new Map(), program: null, boundBuffer: null, colorBuffer: null,
        palette: [], draws: 0, lineDraws: 0, deletedPrograms: 0,
        instances: null, uniforms: {}, pixels: null, captureAt: -Infinity,
      })
    }
    return contexts.get(gl)
  }
  const wrap = (name, handler) => {
    original[name] = prototype[name]
    prototype[name] = function (...args) {
      const result = original[name].apply(this, args)
      handler.call(this, args, result)
      return result
    }
  }
  wrap('getUniformLocation', function ([program, name], location) {
    const record = ensure(this)
    if (record && location) {
      locations.set(location, { program, name })
      if (!record.programs.has(program)) record.programs.set(program, {})
    }
  })
  for (const method of ['uniform1i', 'uniform1f', 'uniform2f', 'uniform3f', 'uniform4f', 'uniform4fv']) {
    wrap(method, function ([location, ...values]) {
      const record = ensure(this)
      const metadata = location && locations.get(location)
      if (!record || !metadata) return
      const value = method.endsWith('fv') ? Array.from(values[0]) : values.length === 1 ? values[0] : values
      record.programs.get(metadata.program)[metadata.name] = value
    })
  }
  wrap('useProgram', function ([program]) { const record = ensure(this); if (record) record.program = program })
  wrap('bindBuffer', function ([target, buffer]) {
    const record = ensure(this)
    if (record && target === this.ARRAY_BUFFER) record.boundBuffer = buffer
  })
  wrap('vertexAttribPointer', function ([index]) {
    const record = ensure(this)
    if (record && index === 3) record.colorBuffer = record.boundBuffer
  })
  wrap('bufferData', function ([target, data]) {
    const record = ensure(this)
    if (!record || target !== this.ARRAY_BUFFER || !record.colorBuffer || record.boundBuffer !== record.colorBuffer || !ArrayBuffer.isView(data)) return
    const colors = new Set()
    for (let index = 0; index < data.length; index += 3) {
      colors.add('#' + Array.from(data.subarray(index, index + 3), channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join(''))
    }
    record.palette = [...colors].sort()
  })
  wrap('deleteProgram', function () { const record = ensure(this); if (record) record.deletedPrograms++ })
  wrap('drawArraysInstanced', function ([mode, first, vertices, instances]) {
    const record = ensure(this)
    if (!record) return
    const uniforms = record.programs.get(record.program) || {}
    if (!Object.hasOwn(uniforms, 'uEffect')) { record.lineDraws++; return }
    record.draws++
    record.instances = instances
    record.vertices = vertices
    record.mode = mode
    record.uniforms = { ...uniforms }
    record.lastDraw = performance.now()
    // Once an instance has rendered ink, stop expensive readbacks. A few early
    // intro frames may legitimately be transparent, so retry at most every 150ms.
    if (record.pixels?.ink > 0 || performance.now() - record.captureAt < 150 || this.isContextLost()) return
    record.captureAt = performance.now()
    try {
      const width = this.drawingBufferWidth
      const height = this.drawingBufferHeight
      const pixels = new Uint8Array(width * height * 4)
      this.readPixels(0, 0, width, height, this.RGBA, this.UNSIGNED_BYTE, pixels)
      let ink = 0
      let peakAlpha = 0
      let hash = 2166136261
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3]
        if (alpha <= 1) continue
        ink++
        peakAlpha = Math.max(peakAlpha, alpha)
        hash = Math.imul(hash ^ index, 16777619) >>> 0
        hash = Math.imul(hash ^ (pixels[index] << 16 | pixels[index + 1] << 8 | pixels[index + 2]), 16777619) >>> 0
        hash = Math.imul(hash ^ alpha, 16777619) >>> 0
      }
      record.pixels = { width, height, ink, peakAlpha, hash, at: performance.now() }
    } catch (error) { record.readError = error.message }
  })
  window.__particlesQa = {
    supported: true,
    snapshot: () => [...contexts.entries()].map(([gl, record]) => {
      const rect = record.canvas.getBoundingClientRect()
      return {
        id: record.id, section: record.section, connected: record.canvas.isConnected,
        contextLost: gl.isContextLost(), deletedPrograms: record.deletedPrograms,
        draws: record.draws, lineDraws: record.lineDraws, instances: record.instances,
        vertices: record.vertices, mode: record.mode, uniforms: record.uniforms,
        palette: record.palette, pixels: record.pixels, readError: record.readError,
        bounds: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      }
    }),
  }
}

const snapshot = page => page.evaluate(() => window.__particlesQa.snapshot())
async function current(page, section) {
  const records = await snapshot(page)
  return records.findLast(record => record.section === section && record.connected && !record.contextLost)
}

async function goToSection(page, section) {
  await page.locator(`#${section}`).evaluate(element => {
    document.activeElement?.blur()
    const top = element.getBoundingClientRect().top + scrollY
    window.scrollTo({ top: Math.max(0, top - 92), behavior: 'instant' })
  })
  await page.locator(`#${section} .section-particles .particles-canvas`).waitFor({ state: 'visible' })
  await page.waitForFunction(id => window.__particlesQa.snapshot().some(record => record.section === id && record.connected && !record.contextLost && record.pixels?.ink > 0), section)
  return current(page, section)
}

async function wiring(page) {
  assert.equal(await page.locator('.section-particles').count(), 4, 'Only the four requested sections should have particle layers')
  assert.equal(await page.locator('#home .section-particles, #home .particles-canvas').count(), 0, 'The Aero Hero must not receive particles')
  assert.equal(await page.locator('#home .hero-aero').count(), 1, 'The Aero Hero wrapper must remain in place, including its GPU fallback')
  for (const section of sections) {
    const layer = page.locator(`#${section} .section-particles`)
    assert.equal(await layer.count(), 1, `${section} needs exactly one particle layer`)
    assert.equal(await layer.getAttribute('aria-hidden'), 'true', 'Decorative layers must stay out of the accessibility tree')
    const geometry = await layer.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const sectionBounds = element.closest('section,footer').getBoundingClientRect()
      return { pointerEvents: getComputedStyle(element).pointerEvents, delta: Math.max(...['top', 'right', 'bottom', 'left'].map(edge => Math.abs(bounds[edge] - sectionBounds[edge]))) }
    })
    assert.equal(geometry.pointerEvents, 'none', 'Background layers must not intercept foreground input')
    assert.ok(geometry.delta <= 2, `${section} particles must cover the section, not just a small inset panel`)
  }
}

function assertRenderer(record, section) {
  assert.ok(record && record.pixels?.ink > 0, `${section} must render non-empty real WebGL2 pixels`)
  assert.equal(record.instances, 450, `${section} must actually draw 450 particle instances`)
  assert.equal(record.vertices, 4, 'Particles should use the original instanced quad renderer')
  assert.deepEqual(record.palette, ['#3b82f6', '#ffffff'], 'GPU color buffer must use the requested blue and white palette')
  for (const [name, expected] of Object.entries(expectedUniforms)) {
    assert.ok(Math.abs(record.uniforms[name] - expected) < .0001, `${section}: ${name} expected ${expected}, received ${record.uniforms[name]}`)
  }
  assert.equal(record.uniforms.uPointer[3], 140, 'Keep the original 140px hover radius')
}

async function noOverflow(page, viewport) {
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  assert.equal(geometry.viewport, viewport.width)
  assert.ok(geometry.root <= viewport.width + 1 && geometry.body <= viewport.width + 1, `Desktop overflow: ${JSON.stringify(geometry)}`)
  return geometry
}

async function pointerThroughForeground(page, selector, section) {
  const target = page.locator(selector).first()
  await target.evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'center' }))
  const bounds = await target.boundingBox()
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0)
  const point = { x: bounds.x + bounds.width * .55, y: bounds.y + bounds.height * .5 }
  assert.equal(await target.evaluate((element, p) => element.contains(document.elementFromPoint(p.x, p.y)), point), true, `${selector} must remain the foreground hit target`)
  const canvas = page.locator(`#${section} .particles-canvas`)
  await canvas.waitFor({ state: 'visible' })
  await page.waitForFunction(id => window.__particlesQa.snapshot().some(record => record.section === id && record.connected && record.instances === 450), section)
  const canvasBounds = await canvas.boundingBox()
  const expected = { x: point.x - canvasBounds.x, y: canvasBounds.y + canvasBounds.height - point.y }
  await page.mouse.move(point.x, point.y, { steps: 5 })
  await page.waitForFunction(({ section, expected }) => {
    const record = window.__particlesQa.snapshot().findLast(item => item.section === section && item.connected && !item.contextLost)
    const pointer = record?.uniforms.uPointer
    return record?.uniforms.uEffect === 2 && pointer?.[2] > .6 && Math.abs(pointer[0] - expected.x) < 4 && Math.abs(pointer[1] - expected.y) < 4
  }, { section, expected })
  return { selector, expected, actual: (await current(page, section)).uniforms.uPointer }
}

async function foregroundControls(page) {
  await goToSection(page, 'works')
  const filters = page.locator('.filter-buttons button')
  const total = await page.locator('.project-card').count()
  assert.ok(total > 1, 'Need multiple projects to verify the filter')
  await filters.nth(1).click()
  await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 1)
  assert.equal(await filters.nth(1).getAttribute('aria-pressed'), 'true')
  await filters.first().click()
  await page.waitForFunction(count => document.querySelectorAll('.project-card').length === count, total)
  for (const spec of [
    { trigger: '.project-card', dialog: '.project-dialog', title: '#project-dialog-title' },
    { trigger: '.contact-orbit', dialog: '.contact-dialog', title: '#contact-dialog-title' },
  ]) {
    const trigger = page.locator(spec.trigger).first()
    await trigger.click()
    const dialog = page.locator(`${spec.dialog}:modal`)
    await dialog.waitFor()
    assert.ok((await page.locator(spec.title).textContent()).trim(), 'Dialog title should remain readable')
    assert.equal(await dialog.evaluate(element => element === document.activeElement || element.contains(document.activeElement)), true)
    await page.keyboard.press('Escape')
    await page.waitForFunction(selector => !document.querySelector(selector).open, spec.dialog)
    assert.equal(await trigger.evaluate(element => document.activeElement === element), true, 'Native Escape must return focus to the original control')
  }
}

async function offscreenLifecycle(page) {
  await goToSection(page, 'contact')
  await page.waitForTimeout(500)
  const viewportHeight = page.viewportSize().height
  const before = (await snapshot(page)).filter(record => record.section !== 'contact' && (!record.connected || record.bounds.bottom < -200 || record.bounds.top > viewportHeight + 200))
  assert.ok(before.some(record => record.section === 'about'), 'Need a previously rendered, now offscreen section to test lifecycle')
  await page.waitForTimeout(650)
  const after = await snapshot(page)
  for (const record of before) {
    const next = after.find(item => item.id === record.id)
    assert.equal(next.draws, record.draws, `Offscreen ${record.section} must stop submitting frames`)
    if (!next.connected) assert.ok(next.contextLost || next.deletedPrograms >= 2, 'Unmounted particle instances must release their GPU resources')
  }
  return before.map(record => ({ section: record.section, id: record.id, draws: record.draws, connected: record.connected, contextLost: record.contextLost }))
}

async function staticReducedMotion(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const evidence = []
  for (const section of sections) {
    await goToSection(page, section)
    await page.waitForFunction(id => document.querySelector(`#${id} .section-particles`).dataset.paused === 'true', section)
    await page.waitForTimeout(350)
    const before = await current(page, section)
    assertRenderer(before, section)
    const canvas = page.locator(`#${section} .particles-canvas`)
    assert.equal(await canvas.isVisible(), true, 'Reduced motion retains a visible static particle canvas')
    const bounds = await canvas.boundingBox()
    await page.mouse.move(bounds.x + Math.min(bounds.width * .4, 500), Math.min(600, Math.max(150, bounds.y + 240)))
    await page.waitForTimeout(650)
    const after = await current(page, section)
    assert.equal(after.id, before.id, 'Reduced motion should keep the same static canvas mounted')
    assert.equal(after.draws, before.draws, `Reduced-motion ${section} must not continue a frame loop or respond to pointer movement`)
    assert.equal(after.uniforms.uTime, before.uniforms.uTime, 'Reduced-motion particle time must remain frozen')
    assert.equal(after.uniforms.uPointer[2], 0, 'Reduced-motion attraction should remain inactive')
    evidence.push({ section, id: after.id, draws: after.draws, time: after.uniforms.uTime, pixels: after.pixels })
  }
  return evidence
}

let activePage
try {
  for (const viewport of viewports) {
    const result = { viewport, sections: [], pointer: [] }
    report.viewports.push(result)
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: false, isMobile: false })
    activePage = page
    page.setDefaultTimeout(10000)
    page.on('pageerror', error => report.errors.push({ viewport, message: error.message }))
    await page.addInitScript(instrumentParticles)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.locator('#home .hero-aero').waitFor()
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.evaluate(() => window.__particlesQa.supported), true, 'This desktop browser needs real WebGL2 support')
    await wiring(page)
    for (const section of sections) {
      let record = await goToSection(page, section)
      assertRenderer(record, section)
      const initialTime = record.uniforms.uTime
      await page.waitForTimeout(250)
      record = await current(page, section)
      assert.ok(record.uniforms.uTime > initialTime, `${section} should animate in normal motion mode`)
      result.sections.push({ section, instances: record.instances, uniforms: record.uniforms, palette: record.palette, pixels: record.pixels })
      await noOverflow(page, viewport)
      await page.screenshot({ path: path.join(output, `${viewport.width}-${section}.png`) })
    }
    console.log(`PASS ${viewport.width}x${viewport.height}: four section layers, no Hero particles, real GL2 ink, 450 blue/white particles and requested uniforms`)

    result.pointer.push(await pointerThroughForeground(page, '#about .body-copy', 'about'))
    result.pointer.push(await pointerThroughForeground(page, '#about .interest-links button', 'about'))
    await foregroundControls(page)
    console.log(`PASS ${viewport.width}px: global attract receives pointer over text/buttons; filtering, project/contact dialogs and native Escape work`)

    result.offscreen = await offscreenLifecycle(page)
    result.reducedMotion = await staticReducedMotion(page)
    result.geometry = await noOverflow(page, viewport)
    await page.screenshot({ path: path.join(output, `${viewport.width}-reduced-static.png`) })
    result.contexts = await snapshot(page)
    console.log(`PASS ${viewport.width}px: offscreen rendering stops/releases resources; reduced motion retains static particles; no horizontal overflow`)
    await page.close()
    activePage = null
  }
  assert.deepEqual(report.errors, [], 'No browser runtime errors')
  console.log(`PASS Desktop-only particle verification completed. Evidence: ${output}`)
} catch (error) {
  report.failure = error.stack || error.message
  if (activePage && !activePage.isClosed()) {
    report.lastContexts = await snapshot(activePage).catch(() => [])
    await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
