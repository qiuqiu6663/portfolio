import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Run after starting Vite: node scripts/verify-tech-text.mjs
const require = createRequire(import.meta.url)
let playwright
try { playwright = require('playwright') }
catch { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright') }

const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:5173'
const output = fileURLToPath(new URL('../shots/tech-text/', import.meta.url))
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) })
const errors = []
const report = { headings: [], viewports: [], interactions: {}, performance: {} }
const mainHeadings = ':is(h1,h2,h3):not(dialog *)'
await mkdir(output, { recursive: true })

async function openPage(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options })
  page.setDefaultTimeout(9000)
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.__techQaLongTasks = []
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__techQaLongTasks.push({ start: entry.startTime, duration: entry.duration })
      }).observe({ type: 'longtask', buffered: true })
    }
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('h1.tech-heading').waitFor()
  await page.evaluate(() => document.fonts.ready)
  return page
}

// This examines the real canvas backing store, rather than accepting a mounted
// but blank canvas. Its ink point lets pointer tests hit an actual glyph.
function readCanvas(canvas) {
  const { width, height } = canvas
  const result = { width, height, ink: 0, hash: 2166136261, point: null }
  if (!width || !height) return result
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data
  let nearest = Infinity
  for (let index = 0; index < pixels.length; index += 4) {
    for (let channel = 0; channel < 4; channel++) result.hash = Math.imul(result.hash ^ pixels[index + channel], 16777619) >>> 0
    if (pixels[index + 3] <= 24) continue
    result.ink++
    const x = (index / 4) % width
    const y = Math.floor(index / 4 / width)
    const distance = (x - width * .2) ** 2 + (y - height * .5) ** 2
    if (distance < nearest) { nearest = distance; result.point = { x: (x + .5) / width, y: (y + .5) / height } }
  }
  return result
}

// A visually hidden copy must remain in the heading for semantic text. Check
// actual text nodes as an accent span can override an otherwise transparent copy.
function visibleText(root) {
  if (!root) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue
    let painted = true
    for (let element = node.parentElement; element; element = element.parentElement) {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) <= .01 || style.contentVisibility === 'hidden') { painted = false; break }
    }
    const style = getComputedStyle(node.parentElement)
    const color = style.webkitTextFillColor || style.color
    if (color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0*)?\s*\)/.test(color)) painted = false
    const range = document.createRange()
    range.selectNodeContents(node)
    if (painted && [...range.getClientRects()].some(rect => rect.width > 1 && rect.height > 1)) return true
  }
  return false
}

async function assertWiring(page) {
  const missing = await page.locator('h1,h2,h3').evaluateAll(elements => elements.filter(el => !el.matches('.tech-heading') || !el.querySelector('.tech-heading-copy')).map(el => `${el.tagName}: ${el.textContent.trim()}`))
  assert.deepEqual(missing, [], 'Every h1/h2/h3, including dialog headings, must use TechHeading')
}

async function checkHeading(heading, { reduced = false, collect = false } = {}) {
  await heading.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' }))
  await heading.waitFor({ state: 'visible' })
  const text = (await heading.locator('.tech-heading-copy').textContent()).trim()
  assert.ok(text, 'Semantic heading copy must contain the original text')
  if (reduced) {
    assert.equal(await heading.locator('canvas').count(), 0, `Reduced motion should not mount a canvas: ${text}`)
    assert.equal(await heading.locator('.tech-heading-copy').evaluate(visibleText), true, `Reduced motion must show DOM copy: ${text}`)
    return
  }
  await heading.page().waitForFunction(element => element.dataset.techReady === 'true', await heading.elementHandle())
  const runs = heading.locator('.tech-heading-art .tech-heading-run')
  assert.ok(await runs.count() > 0, `Missing TechText runs: ${text}`)
  const canvases = heading.locator('.tech-heading-art .tech-heading-run .tech-text-canvas')
  assert.equal(await canvases.count(), await runs.count(), `Each run must contain one original TechText canvas: ${text}`)
  const metrics = []
  for (let index = 0; index < await canvases.count(); index++) {
    const canvas = canvases.nth(index)
    await canvas.waitFor({ state: 'visible' })
    await heading.page().waitForFunction(element => {
      if (!element.width || !element.height) return false
      const rgba = element.getContext('2d').getImageData(0, 0, element.width, element.height).data
      for (let index = 3; index < rgba.length; index += 4) if (rgba[index] > 24) return true
      return false
    }, await canvas.elementHandle())
    metrics.push(await canvas.evaluate(readCanvas))
  }
  assert.equal(await heading.locator('.tech-heading-copy').evaluate(visibleText), false, `Canvas and DOM text must not paint twice: ${text}`)
  assert.equal(await heading.locator('.tech-heading-art').getAttribute('aria-hidden'), 'true', `Decorative text must not duplicate the accessible heading: ${text}`)
  if (collect) report.headings.push({ text, runs: metrics.length, pixels: metrics.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0), ink: metrics.map(canvas => canvas.ink) })
}

async function noOverflow(page, width) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    headingsOutside: [...document.querySelectorAll(':is(h1,h2,h3):not(dialog *)')].filter(el => {
      const bounds = el.getBoundingClientRect()
      return bounds.width > 0 && (bounds.left < -2 || bounds.right > innerWidth + 2)
    }).map(el => ({ text: el.querySelector('.tech-heading-copy')?.textContent.trim(), left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })),
  }))
  assert.equal(geometry.viewport, width, 'Mobile layout must use the device viewport')
  assert.ok(geometry.scrollWidth <= width + 1 && geometry.bodyWidth <= width + 1, `Horizontal overflow at ${width}px: ${JSON.stringify(geometry)}`)
  assert.deepEqual(geometry.headingsOutside, [], `Heading layout must fit at ${width}px`)
  return geometry
}

async function dialogs(page, reduced = false) {
  for (const spec of [
    { trigger: '.project-card', dialog: '.project-dialog', title: '#project-dialog-title' },
    { trigger: '.contact-orbit', dialog: '.contact-dialog', title: '#contact-dialog-title' },
  ]) {
    const trigger = page.locator(spec.trigger).first()
    await trigger.click()
    const dialog = page.locator(`${spec.dialog}:modal`)
    await dialog.waitFor()
    await assertWiring(page)
    assert.equal(await dialog.getAttribute('aria-labelledby'), spec.title.slice(1))
    assert.equal(await dialog.evaluate(el => el === document.activeElement || el.contains(document.activeElement)), true, 'Native dialog must hold focus')
    await checkHeading(page.locator(spec.title), { reduced, collect: !reduced })
    const titleBounds = await page.locator(spec.title).boundingBox()
    assert.ok(titleBounds && titleBounds.width > 1 && titleBounds.height > 1, 'Dialog title must have a readable layout box')
    await page.keyboard.press('Escape')
    await page.waitForFunction(selector => !document.querySelector(selector).open, spec.dialog)
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape should restore focus to the opening control')
  }
}

try {
  const page = await openPage()
  await assertWiring(page)
  const headings = page.locator(mainHeadings)
  assert.ok(await headings.count() >= 8, 'Expected hero, section, project and capability headings')
  for (let index = 0; index < await headings.count(); index++) await checkHeading(headings.nth(index), { collect: true })
  console.log('PASS Every heading keeps semantic text; all visible runs paint canvas pixels without duplicate DOM text')

  const hero = page.locator('h1.tech-heading')
  await checkHeading(hero)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(1100)
  const canvas = hero.locator('.tech-text-canvas').first()
  const baseline = await canvas.evaluate(readCanvas)
  const bounds = await canvas.boundingBox()
  assert.ok(bounds && baseline.point, 'Hero canvas needs an actual glyph for pointer testing')
  const point = { x: bounds.x + bounds.width * baseline.point.x, y: bounds.y + bounds.height * baseline.point.y }
  await page.mouse.move(point.x, point.y)
  let hover
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForTimeout(100)
    hover = await canvas.evaluate(readCanvas)
    if (hover.hash !== baseline.hash) break
  }
  assert.notEqual(hover.hash, baseline.hash, 'Pointer hover must change real canvas pixels')
  await page.screenshot({ path: path.join(output, 'desktop-hover.png') })
  // Return to an unhovered, settled glyph, then press without a preceding mouse
  // move. This isolates clickKick from the already verified hover animation.
  await page.mouse.move(2, 2)
  await page.waitForTimeout(1100)
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(900)
  const beforeClick = await canvas.evaluate(readCanvas)
  await page.mouse.down()
  await page.mouse.up()
  const clickHashes = []
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForTimeout(80)
    clickHashes.push((await canvas.evaluate(readCanvas)).hash)
  }
  assert.ok(clickHashes.some(hash => hash !== beforeClick.hash), 'Click must change real canvas pixels')
  report.interactions = { baseline: baseline.hash, hover: hover.hash, beforeClick: beforeClick.hash, click: clickHashes }
  await page.mouse.move(2, 2)
  console.log('PASS Hover and click update the original TechText canvas')

  await dialogs(page)
  console.log('PASS Project and contact dialog headings render; native Escape closes and returns focus')

  for (const width of [320, 390, 768, 828, 1440, 1920]) {
    const isTouch = width <= 828
    const responsive = await openPage({ viewport: { width, height: 900 }, isMobile: isTouch, hasTouch: isTouch })
    const responsiveHeadings = responsive.locator(mainHeadings)
    for (let index = 0; index < await responsiveHeadings.count(); index++) {
      await checkHeading(responsiveHeadings.nth(index))
      await noOverflow(responsive, width)
    }
    if (width === 320) await dialogs(responsive)
    await responsive.locator('h1').evaluate(el => { document.activeElement?.blur(); el.scrollIntoView({ behavior: 'instant', block: 'center' }) })
    await responsive.waitForTimeout(200)
    await responsive.screenshot({ path: path.join(output, `viewport-${width}.png`) })
    report.viewports.push({ width, touch: isTouch, ...await noOverflow(responsive, width) })
    await responsive.close()
  }
  console.log('PASS 320/390/768/828/1440/1920px headings render without horizontal overflow, including touch layouts')

  const reduced = await openPage({ reducedMotion: 'reduce' })
  await assertWiring(reduced)
  const reducedHeadings = reduced.locator(mainHeadings)
  for (let index = 0; index < await reducedHeadings.count(); index++) await checkHeading(reducedHeadings.nth(index), { reduced: true })
  await dialogs(reduced, true)
  assert.equal(await reduced.locator('.tech-heading canvas').count(), 0, 'Reduced motion must leave all headings as DOM text')
  await reduced.screenshot({ path: path.join(output, 'reduced-motion.png') })
  await reduced.close()
  // Also cover a live preference change; this catches effects that only consult
  // matchMedia at mount and keep their animation alive after a settings change.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelectorAll('.tech-heading canvas').length === 0)
  await checkHeading(page.locator('h1'), { reduced: true })
  console.log('PASS Reduced motion and live preference changes show DOM text with no heading canvases')

  report.performance = await page.evaluate(() => ({
    longTasks: window.__techQaLongTasks.length,
    longestTaskMs: Math.round(Math.max(0, ...window.__techQaLongTasks.map(entry => entry.duration))),
    totalLongTaskMs: Math.round(window.__techQaLongTasks.reduce((sum, entry) => sum + entry.duration, 0)),
  }))
  report.performance.initialCanvasPixels = report.headings.reduce((sum, heading) => sum + heading.pixels, 0)
  console.log(`OBSERVE Performance (includes navigation, test pixel reads and screenshots): ${JSON.stringify(report.performance)}`)
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log(`PASS No browser runtime errors. Screenshots and metrics: ${output}`)
} catch (error) {
  report.failure = error.stack || error.message
  throw error
} finally {
  report.errors = errors
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
