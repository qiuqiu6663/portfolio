import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Functional coverage only. This deliberately does not sample frame intervals,
// long tasks or loading timings, and is not a device-performance benchmark.
const require = createRequire(import.meta.url)
let playwright
try { playwright = require('playwright') }
catch { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright') }
const executablePath = process.env.CHROME_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:4173'
const output = fileURLToPath(new URL('../shots/performance-functional/', import.meta.url))
const profiles = [
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, particles: 220 },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, particles: 300 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, particles: 450 },
]
const report = { url, executablePath, note: 'Cross-device functional regression; GPU calls are counted only to prove rendering/stopping. No performance claims.', profiles: [], fallbacks: [] }
let activePage

function observeGPU({ unavailable }) {
  const probe = window.__functionalGPU = { submits: 0, adapterRequests: 0, errors: [], particles: [] }
  const queues = globalThis.GPUQueue?.prototype
  if (queues?.submit) {
    const original = queues.submit
    queues.submit = function (...args) { const result = original.apply(this, args); probe.submits++; return result }
  }
  const adapters = globalThis.GPUAdapter?.prototype
  if (adapters?.requestDevice) {
    const original = adapters.requestDevice
    adapters.requestDevice = async function (...args) {
      const device = await original.apply(this, args)
      device.addEventListener('uncapturederror', event => probe.errors.push(event.error.message))
      device.lost.then(info => { if (info.reason !== 'destroyed') probe.errors.push(`device lost: ${info.reason} ${info.message}`) })
      return device
    }
  }
  if (navigator.gpu) {
    const original = navigator.gpu.requestAdapter.bind(navigator.gpu)
    Object.defineProperty(navigator.gpu, 'requestAdapter', { configurable: true, value: (...args) => {
      probe.adapterRequests++
      return unavailable ? Promise.resolve(null) : original(...args)
    } })
  }
  const glPrototype = globalThis.WebGL2RenderingContext?.prototype
  if (glPrototype?.drawArraysInstanced) {
    const original = glPrototype.drawArraysInstanced
    const records = new WeakMap()
    glPrototype.drawArraysInstanced = function (...args) {
      const result = original.apply(this, args)
      if (this.canvas.classList?.contains('particles-canvas')) {
        let record = records.get(this.canvas)
        if (!record) {
          record = { canvas: this.canvas, section: this.canvas.closest('section,footer')?.id, draws: 0, instances: [] }
          records.set(this.canvas, record)
          probe.particles.push(record)
        }
        record.draws++
        if (!record.instances.includes(args[3])) record.instances.push(args[3])
      }
      return result
    }
  }
}

async function createScenario(browser, profile, mode = 'normal') {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' })
  await context.addInitScript(observeGPU, { unavailable: mode === 'unavailable' })
  let blocked = 0
  if (mode === 'chunk-failure') await context.route(/\/assets\/AeroShards-[^/]+\.js(?:\?|$)/, route => { blocked++; return route.abort('failed') })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const diagnostics = { errors: [], expected: [], badResponses: [], failedRequests: [], legacyImages: [] }
  const collect = (kind, message, location = '') => {
    const item = { kind, message, location }
    const intentionalChunk = mode === 'chunk-failure' && (/AeroShards/.test(`${message} ${location}`) || /Failed to fetch dynamically imported module|Importing a module script failed/.test(message))
    ;(intentionalChunk ? diagnostics.expected : diagnostics.errors).push(item)
  }
  page.on('pageerror', error => collect('pageerror', error.message))
  page.on('console', message => { if (message.type() === 'error') collect('console', message.text(), message.location().url) })
  page.on('response', response => { if (response.status() >= 400) diagnostics.badResponses.push({ url: response.url(), status: response.status() }) })
  page.on('request', request => { if (/\/media\/[^?]+\.(?:jpe?g|png)(?:\?|$)/i.test(request.url())) diagnostics.legacyImages.push(request.url()) })
  page.on('requestfailed', request => {
    const item = { url: request.url(), error: request.failure()?.errorText }
    if (mode === 'chunk-failure' && /\/assets\/AeroShards-/.test(request.url())) diagnostics.expected.push({ kind: 'injected-network-failure', ...item })
    else if (item.error !== 'net::ERR_ABORTED') diagnostics.failedRequests.push(item)
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
  activePage = page
  return { page, context, diagnostics, blocked: () => blocked }
}

async function opening(page) {
  await page.waitForFunction(() => ['complete', 'skipped'].includes(document.querySelector('.portfolio-app')?.dataset.openingState))
  assert.ok(await page.locator('.opening-screen').evaluate(element => {
    const style = getComputedStyle(element)
    return style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0
  }), 'Opening cover is dismissed')
  await visibleContent(page, '#home')
  await noOverflow(page, 'hero')
}

async function goTo(page, selector) {
  await page.locator(selector).first().evaluate(element => {
    document.activeElement?.blur()
    window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - Math.min(140, innerHeight * .15), behavior: 'instant' })
  })
  await page.waitForTimeout(90)
}

async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, dialogs: [...document.querySelectorAll('dialog[open]')].map(e => ({ client: e.clientWidth, scroll: e.scrollWidth, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })) }))
  assert.ok(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, `${label}: document overflow ${JSON.stringify(size)}`)
  assert.ok(size.dialogs.every(d => d.scroll <= d.client + 1 && d.left >= -1 && d.right <= size.viewport + 1), `${label}: dialog overflow ${JSON.stringify(size)}`)
  return size
}

async function visibleContent(page, selector) {
  const hidden = await page.locator(selector).evaluate(root => {
    const nodes = [...root.querySelectorAll('h1,h2,h3,.project-reveal,.strength-reveal')]
    if (root.matches('.project-reveal,.strength-reveal')) nodes.push(root)
    return nodes.flatMap(element => {
      const rect = element.getBoundingClientRect()
      const label = `${element.tagName}.${element.className} ${element.textContent.trim().slice(0, 35)}`
      for (let node = element; node instanceof Element; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .95) return [label]
      }
      if (rect.width < 1 || rect.height < 1) return [label]
      if (element.matches('.tech-heading')) {
        const layer = element.querySelector(element.dataset.techReady === 'true' ? '.tech-heading-art' : '.tech-heading-copy')
        if (!layer || Number(getComputedStyle(layer).opacity) < .95) return [label]
        if (element.dataset.techReady === 'true' && !element.querySelector('canvas')) return [label]
      }
      const clip = getComputedStyle(element).clipPath
      if (clip !== 'none' && clip !== 'inset(0%)' && clip !== 'inset(0px)') return [`${label} clip=${clip}`]
      return []
    })
  })
  assert.deepEqual(hidden, [], `${selector}: all title/card layers revealed`)
}

async function images(page, selector) {
  await page.waitForFunction(selector => [...document.querySelectorAll(`${selector} img`)].every(image => image.complete && image.naturalWidth > 0), selector)
  const result = await page.locator(`${selector} img`).evaluateAll(nodes => nodes.map(image => ({ src: image.currentSrc, width: image.naturalWidth, renderedWidth: image.getBoundingClientRect().width, renderedHeight: image.getBoundingClientRect().height })))
  assert.ok(result.length > 0, `${selector}: expected real images`)
  assert.ok(result.every(image => image.width > 0 && image.renderedWidth > 0 && image.renderedHeight > 0), `${selector}: decoded images have geometry`)
  assert.ok(result.every(image => /\.(?:avif|webp)(?:\?|$)/.test(image.src)), `${selector}: uses optimized picture sources`)
  return result
}

async function gpuState(page) {
  return page.evaluate(() => ({ submits: window.__functionalGPU.submits, adapterRequests: window.__functionalGPU.adapterRequests, errors: window.__functionalGPU.errors, particles: window.__functionalGPU.particles.map(p => ({ section: p.section, draws: p.draws, connected: p.canvas.isConnected, width: p.canvas.width, height: p.canvas.height, instances: p.instances })) }))
}

async function normalGPU(page, profile) {
  await page.waitForFunction(() => document.querySelector('.hero-aero')?.dataset.status === 'ready')
  assert.equal(await page.locator('.hero-aero').getAttribute('data-budget'), profile.name)
  assert.ok(await page.locator('.aero-shards-canvas').evaluate(canvas => canvas.width > 0 && canvas.height > 0))
  const before = (await gpuState(page)).submits
  await page.waitForFunction(before => window.__functionalGPU.submits > before, before)
  return { budget: profile.name, rendering: true }
}

async function menu(page, profile) {
  if (!profile.hasTouch) return
  const button = page.locator('.menu-button')
  await button.click()
  await page.locator('#mobile-menu:modal').waitFor()
  await noOverflow(page, 'menu')
  assert.ok(await page.locator('#mobile-menu').evaluate(e => e.contains(document.activeElement)))
  await page.keyboard.press('Escape')
  await page.locator('#mobile-menu').waitFor({ state: 'hidden' })
  assert.ok(await button.evaluate(e => document.activeElement === e), 'Menu Escape restores trigger focus')
  await button.click()
  await page.locator('#mobile-menu .brand').click()
  await page.locator('#mobile-menu').waitFor({ state: 'hidden' })
  await button.click()
  await page.locator('#mobile-menu a[href="#works"]').click()
  await page.locator('#mobile-menu').waitFor({ state: 'hidden' })
  await page.waitForFunction(() => location.hash === '#works')
}

async function chapters(page, profile) {
  const result = {}
  for (const id of ['about', 'works', 'approach', 'contact']) {
    await goTo(page, `#${id}`)
    await page.waitForFunction(id => document.getElementById(id).dataset.chapterState === 'complete', id)
    if (id === 'about') {
      await goTo(page, '#about .about-photo')
      await page.waitForFunction(() => document.querySelector('#about .motion-card-visual')?.dataset.imageRevealed === 'true')
      result.images = await images(page, '#about')
      await page.waitForFunction(() => window.__functionalGPU.particles.some(p => p.section === 'about' && p.draws > 0))
      const state = await gpuState(page)
      const particles = state.particles.find(p => p.section === 'about' && p.connected)
      assert.ok(particles?.instances.includes(profile.particles), `Expected ${profile.particles} actual particle instances`)
      assert.ok(particles.width > 0 && particles.height > 0)
      const heroSubmits = state.submits
      await page.waitForTimeout(350)
      assert.equal((await gpuState(page)).submits, heroSubmits, 'Offscreen Hero submits zero GPU work')
      result.particles = particles
    }
    if (id === 'works' || id === 'approach') {
      const selector = id === 'works' ? '#works .project-reveal' : '#approach .strength-reveal'
      const count = await page.locator(selector).count()
      for (let index = 0; index < count; index++) {
        await goTo(page, `${selector}:nth-child(${index + 1})`)
        await page.waitForFunction(({ selector, index }) => document.querySelectorAll(selector)[index]?.dataset.cardState === 'complete', { selector, index })
        if (id === 'works') await images(page, `${selector}:nth-child(${index + 1})`)
      }
    }
    await visibleContent(page, `#${id}`)
    result[id] = await noOverflow(page, id)
  }
  await page.waitForTimeout(150)
  const before = await gpuState(page)
  await page.waitForTimeout(300)
  const after = await gpuState(page)
  const oldAbout = before.particles.filter(p => p.section === 'about')
  assert.ok(oldAbout.length && oldAbout.every(p => !p.connected), 'Far-offscreen particle canvas is unmounted')
  assert.deepEqual(after.particles.filter(p => p.section === 'about').map(p => p.draws), oldAbout.map(p => p.draws), 'Unmounted particles perform zero draw calls')
  await goTo(page, '#home')
  const stopped = (await gpuState(page)).submits
  await page.waitForFunction(stopped => window.__functionalGPU.submits > stopped, stopped)
  result.heroResumes = true
  return result
}

async function interactions(page) {
  await goTo(page, '#works .filter-bar')
  assert.equal(await page.locator('.project-card').count(), 3)
  const filters = page.locator('.filter-buttons button')
  await filters.nth(1).click()
  await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 1)
  const card = page.locator('.project-card').first()
  await goTo(page, '.project-reveal')
  await page.waitForFunction(() => document.querySelector('.project-reveal')?.dataset.cardState === 'complete')
  await card.click()
  const dialog = page.locator('#project-detail')
  await page.locator('#project-detail:modal').waitFor()
  assert.ok(await dialog.evaluate(e => e.contains(document.activeElement)), 'Project modal takes focus')
  assert.ok(await dialog.evaluate(() => { const outside = document.querySelector('.glass-nav .brand'); outside.focus(); return document.activeElement !== outside }), 'Modal blocks background focus')
  await images(page, '#project-detail')
  await noOverflow(page, 'project detail')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.ok(await card.evaluate(e => document.activeElement === e), 'Project Escape restores card focus')
  await filters.first().click()
  await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 3)
  await goTo(page, '#contact .contact-orbit')
  const contactButton = page.locator('.contact-orbit')
  await contactButton.click()
  const contact = page.locator('.contact-dialog')
  await page.locator('.contact-dialog:modal').waitFor()
  assert.ok(await contact.evaluate(e => e.contains(document.activeElement)), 'Contact modal takes focus')
  assert.equal(await contact.locator('a[href^="mailto:"]').count(), 0, 'Empty email remains an honest preparation state')
  assert.equal(await contact.locator('form').count(), 0)
  await noOverflow(page, 'contact')
  await page.keyboard.press('Escape')
  await contact.waitFor({ state: 'hidden' })
  assert.ok(await contactButton.evaluate(e => document.activeElement === e), 'Contact Escape restores trigger focus')
  return { filter: [3, 1, 3], nativeDialogs: true, escapeFocus: true }
}

async function clean(scenario) {
  const gpu = await gpuState(scenario.page)
  assert.deepEqual(gpu.errors, [], 'No uncaptured GPU errors/device loss')
  assert.deepEqual(scenario.diagnostics.errors, [], 'No unexpected runtime or console errors')
  assert.deepEqual(scenario.diagnostics.badResponses, [], 'No HTTP failures, including old JPG/PNG paths')
  assert.deepEqual(scenario.diagnostics.failedRequests, [], 'No unexpected failed requests')
  assert.deepEqual(scenario.diagnostics.legacyImages, [], 'No original JPEG/PNG downloads')
  return { gpu, diagnostics: scenario.diagnostics }
}

await mkdir(output, { recursive: true })
const browser = await playwright.chromium.launch({ headless: true, executablePath })
try {
  for (const profile of profiles) {
    const scenario = await createScenario(browser, profile)
    const { page } = scenario
    await opening(page)
    const result = { profile: profile.name, viewport: profile.viewport, dpr: profile.deviceScaleFactor, gpu: await normalGPU(page, profile), heroImage: await images(page, '#home') }
    await page.screenshot({ path: path.join(output, `${profile.name}-hero.png`) })
    await menu(page, profile)
    result.chapters = await chapters(page, profile)
    result.interactions = await interactions(page)
    result.final = await clean(scenario)
    report.profiles.push(result)
    await scenario.context.close()
    activePage = null
    console.log(`PASS ${profile.name}: opening, chapter/card reveals, images, overflow, menu/filter/dialog focus, GPU draw/offscreen/resume`)
  }
  for (const profile of profiles) {
    const scenario = await createScenario(browser, profile, 'reduced')
    const { page } = scenario
    await opening(page)
    await page.waitForFunction(() => document.querySelector('.hero-aero')?.dataset.status === 'fallback')
    await images(page, '#home')
    for (const id of ['about', 'works', 'approach', 'contact']) {
      await goTo(page, `#${id}`)
      await visibleContent(page, `#${id}`)
      await noOverflow(page, `reduced ${id}`)
    }
    assert.equal(await page.locator('.aero-shards-canvas,.particles-canvas,.tech-heading canvas').count(), 0)
    const state = await gpuState(page)
    assert.equal(state.adapterRequests, 0)
    assert.equal(state.submits, 0)
    assert.equal(state.particles.length, 0)
    assert.equal(await page.locator('.hero-aero-fallback').evaluate(e => getComputedStyle(e).opacity), '1')
    report.fallbacks.push({ mode: 'reduced', profile: profile.name, result: await clean(scenario) })
    await scenario.context.close()
    activePage = null
    console.log(`PASS ${profile.name} reduced: static decoded poster, visible content, zero GPU/TechText canvases`)
  }
  for (const mode of ['unavailable', 'chunk-failure']) {
    const scenario = await createScenario(browser, profiles[2], mode)
    const { page } = scenario
    await opening(page)
    await page.waitForFunction(() => document.querySelector('.hero-aero')?.dataset.status === 'fallback')
    await images(page, '#home')
    assert.equal(await page.locator('.aero-shards-canvas').count(), 0)
    assert.equal(await page.locator('.hero-aero-fallback').evaluate(e => getComputedStyle(e).opacity), '1')
    if (mode === 'unavailable') assert.ok((await gpuState(page)).adapterRequests > 0, 'Actually requested the forced-null WebGPU adapter')
    else assert.equal(scenario.blocked(), 1, 'Actually failed one AeroShards chunk request')
    await goTo(page, '#works')
    await page.waitForFunction(() => document.getElementById('works').dataset.chapterState === 'complete')
    await interactions(page)
    report.fallbacks.push({ mode, result: await clean(scenario) })
    await scenario.context.close()
    activePage = null
    console.log(`PASS ${mode}: poster/text survive and filters/native dialogs remain usable`)
  }
  console.log('PASS all cross-device functional checks (not a timing benchmark)')
} catch (error) {
  report.failure = error.stack || error.message
  if (activePage && !activePage.isClosed()) {
    report.failureGPU = await gpuState(activePage).catch(() => null)
    await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
