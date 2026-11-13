import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
let playwright
try {
  playwright = require('playwright')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
  playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
}
const { chromium } = playwright
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shots = path.join(root, 'shots')
const url = process.env.PORTFOLIO_URL || 'http://127.0.0.1:5173'
const results = []
const pageErrors = []
let browser
let page
const startedAt = Date.now()

await mkdir(shots, { recursive: true })

async function check(name, run) {
  const start = Date.now()
  try {
    await run()
    results.push({ name, ok: true })
    console.log(`PASS ${name} (${Date.now() - start} ms)`)
  } catch (error) {
    results.push({ name, ok: false, error: error.message })
    console.error(`FAIL ${name}: ${error.message}`)
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(shots, `verify-failure-${results.length}.png`), timeout: 5000 }).catch(() => {})
    }
  }
}

function captureErrors(target, label) {
  target.on('pageerror', error => pageErrors.push(`${label}: ${error.message}`))
  target.setDefaultTimeout(8000)
  target.setDefaultNavigationTimeout(8000)
}

async function closeDialogs(target) {
  for (let attempt = 0; attempt < 3 && await target.locator('dialog:modal').count(); attempt += 1) {
    await target.keyboard.press('Escape')
    await target.waitForFunction(() => !document.querySelector('dialog:modal'), null, { timeout: 2000 })
  }
}

async function returnHome(target) {
  await closeDialogs(target)
  await target.evaluate(() => {
    document.activeElement?.blur?.()
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  try {
    await target.waitForFunction(() => {
      document.activeElement?.blur?.()
      window.scrollTo({ top: 0, behavior: 'instant' })
      return window.scrollY <= 1
    }, null, { polling: 100, timeout: 2000 })
  } catch (error) {
    const position = await target.evaluate(() => ({ scrollY: window.scrollY, viewport: window.innerWidth, hash: location.hash }))
    throw new Error(`returnHome: failed to reach top within 2s (${JSON.stringify(position)}): ${error.message}`)
  }
}

async function captureHome(target, filename) {
  await target.evaluate(async () => {
    let timer
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Home screenshot: fonts did not settle within 8s')), 8000) }),
      ])
    } finally {
      clearTimeout(timer)
    }
  })
  await target.locator('.hero h1').waitFor({ state: 'visible' })
  await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await target.waitForTimeout(500)
  await target.waitForFunction(() => {
    const scene = document.querySelector('.hero-media')
    const canvas = scene?.querySelector('.hero-city-canvas')
    const poster = document.querySelector('.hero-poster')
    return poster?.complete && poster.naturalWidth > 0 && (
      !canvas || scene.dataset.renderer === 'webgl' && scene.dataset.ready === 'true' && canvas.width > 0 && canvas.height > 0
    )
  }, null, { timeout: 8000 })
  const measurement = await target.evaluate(() => {
    const h1 = document.querySelector('.hero h1')
    const scene = document.querySelector('.hero-media')
    const canvas = scene.querySelector('.hero-city-canvas')
    const poster = document.querySelector('.hero-poster')
    const rect = element => {
      const bounds = element.getBoundingClientRect()
      return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(bounds[key] * 10) / 10]))
    }
    let effectiveOpacity = 1
    for (let element = h1; element; element = element.parentElement) effectiveOpacity *= Number(getComputedStyle(element).opacity)
    return {
      viewport: [window.innerWidth, window.innerHeight],
      scrollY: window.scrollY,
      h1: { rect: rect(h1), opacity: getComputedStyle(h1).opacity, effectiveOpacity },
      scene: { renderer: scene.dataset.renderer, ready: scene.dataset.ready, active: scene.dataset.active, time: Number(scene.dataset.sceneTime), canvas: canvas ? { width: canvas.width, height: canvas.height, opacity: getComputedStyle(canvas).opacity, rect: rect(canvas) } : null },
      poster: { rect: rect(poster), opacity: getComputedStyle(poster).opacity, naturalWidth: poster.naturalWidth, naturalHeight: poster.naturalHeight, source: poster.getAttribute('src') },
    }
  })
  console.log(`  Home screenshot ${filename}: ${JSON.stringify(measurement)}`)
  assert.ok(measurement.h1.rect.width > 0 && measurement.h1.rect.height > 0 && measurement.h1.effectiveOpacity > 0.01, `Home heading is hidden before ${filename}: ${JSON.stringify(measurement.h1)}`)
  assert.ok(measurement.h1.rect.y < measurement.viewport[1] && measurement.h1.rect.y + measurement.h1.rect.height > 0, `Home heading is outside the viewport before ${filename}`)
  await target.screenshot({ path: path.join(shots, filename) })
}

async function assertCityPhoto(target) {
  const poster = target.locator('.hero-poster')
  assert.equal(await poster.getAttribute('src'), '/media/hero-city-source.jpg')
  await target.waitForFunction(() => {
    const image = document.querySelector('.hero-poster')
    return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  })
  const dimensions = await poster.evaluate(image => [image.naturalWidth, image.naturalHeight])
  assert.deepEqual(dimensions, [864, 1920], 'Hero must use the supplied original city photograph')
}

async function assertSceneAdvances(target) {
  await target.waitForFunction(() => {
    const scene = document.querySelector('.hero-media')
    const canvas = scene?.querySelector('.hero-city-canvas')
    return scene?.dataset.renderer === 'webgl' && scene.dataset.ready === 'true' && scene.dataset.active === 'true'
      && canvas?.width > 0 && canvas.height > 0 && Number.isFinite(Number(scene.dataset.sceneTime))
  })
  const initial = await target.locator('.hero-media').evaluate(scene => Number(scene.dataset.sceneTime))
  await target.waitForFunction(initialTime => {
    const scene = document.querySelector('.hero-media')
    return scene?.dataset.active === 'true' && Number(scene.dataset.sceneTime) > initialTime + 0.12
  }, initial)
}

async function assertScenePaused(target) {
  await target.waitForFunction(() => document.querySelector('.hero-media')?.dataset.active === 'false')
  const initial = await target.locator('.hero-media').evaluate(scene => Number(scene.dataset.sceneTime))
  assert.ok(Number.isFinite(initial), 'Paused scene must report its animation time')
  await target.waitForTimeout(220)
  const after = await target.locator('.hero-media').evaluate(scene => Number(scene.dataset.sceneTime))
  assert.equal(after, initial, `Paused scene time advanced from ${initial} to ${after}`)
}

async function assertScenePixelsAdvance(target) {
  const canvas = target.locator('.hero-city-canvas')
  const bounds = await canvas.boundingBox()
  const viewport = target.viewportSize()
  assert.ok(bounds?.width > 0 && bounds.height > 0, 'City canvas must have visible dimensions')
  // Inspect the compositor's actual output, away from the animated heading.
  // This works even when WebGL's default drawing buffer is cleared after paint.
  const x = Math.max(0, Math.floor(bounds.x + bounds.width * .72))
  const y = Math.max(0, Math.floor(bounds.y + bounds.height * .68))
  const clip = { x, y, width: Math.floor(Math.min(bounds.width * .2, viewport.width - x)), height: Math.floor(Math.min(bounds.height * .2, viewport.height - y)) }
  assert.ok(clip.width > 20 && clip.height > 20, 'City scene pixel sample must be inside the viewport')
  const initial = await target.screenshot({ clip })
  let changed = false
  for (let attempt = 0; attempt < 3 && !changed; attempt += 1) {
    await target.waitForTimeout(300)
    const next = await target.screenshot({ clip })
    changed = !initial.equals(next)
  }
  assert.ok(changed, 'City scene time advances but its rendered pixels remain unchanged')
}

async function assertNoOverflow(target, width) {
  const measurements = await target.evaluate(() => {
    const doc = document.documentElement
    const dialog = document.querySelector('dialog:modal')
    return {
      viewport: doc.clientWidth,
      document: doc.scrollWidth,
      body: document.body.scrollWidth,
      dialog: dialog ? { width: dialog.clientWidth, scroll: dialog.scrollWidth } : null,
    }
  })
  assert.ok(measurements.document <= measurements.viewport + 1, `${width}px document overflow: ${JSON.stringify(measurements)}`)
  assert.ok(measurements.body <= measurements.viewport + 1, `${width}px body overflow: ${JSON.stringify(measurements)}`)
  if (measurements.dialog) {
    assert.ok(measurements.dialog.scroll <= measurements.dialog.width + 1, `${width}px dialog overflow: ${JSON.stringify(measurements.dialog)}`)
  }
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  page = await context.newPage()
  captureErrors(page, 'desktop/mobile')
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  assert.ok(response?.ok(), `Local preview did not respond successfully: ${response?.status()}`)
  await page.locator('.hero h1').waitFor({ state: 'visible' })

  await check('City photo decodes; WebGL pixels and time advance, pause offscreen, and resume', async () => {
    await returnHome(page)
    await assertCityPhoto(page)
    await assertSceneAdvances(page)
    await assertScenePixelsAdvance(page)
    assert.equal(await page.locator('.hero .btn, .hero-foot, .video-control').count(), 0)
    assert.equal(await page.locator('.hero video').count(), 0)
    await page.evaluate(() => document.querySelector('#works').scrollIntoView({ behavior: 'instant' }))
    await assertScenePaused(page)
    await returnHome(page)
    await assertSceneAdvances(page)
    await captureHome(page, 'verify-city-desktop-1440.png')
  })

  await check('Desktop images decode and no page errors occur', async () => {
    const images = page.locator('main img')
    assert.ok(await images.count() >= 5, 'Expected hero, about, and three project images')
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded()
      await image.evaluate(element => {
        if (element.complete && element.naturalWidth > 0) return
        return Promise.race([
          element.decode(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Image decode timed out: ${element.getAttribute('src')}`)), 7000)),
        ])
      })
      assert.ok(await image.evaluate(element => element.naturalWidth > 0), `Image failed: ${await image.getAttribute('src')}`)
    }
    assert.deepEqual(pageErrors, [])
  })

  await check('Project filter changes 3 → 1 → 3', async () => {
    const filter = page.locator('.filter-buttons')
    await filter.getByRole('button', { name: /すべて/ }).click()
    await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 3)
    await filter.getByRole('button', { name: '空間・環境', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 1)
    assert.match(await page.locator('.project-card').innerText(), /DISTANT TERRAIN/)
    await filter.getByRole('button', { name: /すべて/ }).click()
    await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 3)
  })

  await check('Project dialog opens; Escape closes and restores focus', async () => {
    await page.locator('.project-card').first().click()
    await page.locator('.project-dialog:modal').waitFor({ state: 'visible' })
    assert.match(await page.locator('#project-dialog-title').innerText(), /DISTANT TERRAIN/)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.project-dialog').open)
    await page.waitForFunction(() => document.activeElement === document.querySelector('.project-card'))
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('overlay-open')), false)
  })

  await check('Empty contact shows no mailto, form, or fake send result', async () => {
    await page.locator('.contact-orbit').click()
    const dialog = page.locator('.contact-dialog:modal')
    await dialog.waitFor({ state: 'visible' })
    assert.match(await dialog.innerText(), /連絡先は現在準備中です/)
    assert.equal(await dialog.locator('a[href^="mailto:"]').count(), 0)
    assert.equal(await dialog.locator('form, button[type="submit"]').count(), 0)
    assert.doesNotMatch(await dialog.innerText(), /送信しました|送信完了|メッセージを送信しました/)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
  })

  await check('Reduced motion shows the supplied city photo without a scene canvas', async () => {
    const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const reducedPage = await reducedContext.newPage()
    captureErrors(reducedPage, 'reduced-motion')
    try {
      await reducedPage.goto(url, { waitUntil: 'domcontentloaded' })
      await reducedPage.locator('.hero-poster').waitFor({ state: 'visible' })
      await assertCityPhoto(reducedPage)
      assert.equal(await reducedPage.locator('.hero-city-canvas').count(), 0)
      const visiblePhoto = await reducedPage.locator('.hero-poster').evaluate(image => {
        let opacity = 1
        for (let element = image; element; element = element.parentElement) opacity *= Number(getComputedStyle(element).opacity)
        const bounds = image.getBoundingClientRect()
        return opacity > 0 && bounds.width > 0 && bounds.height > 0
      })
      assert.ok(visiblePhoto, 'Reduced-motion photo must remain visibly rendered')
      assert.equal(await reducedPage.locator('.hero video').count(), 0)
      assert.equal(await reducedPage.locator('.video-control').count(), 0)
      await captureHome(reducedPage, 'verify-city-reduced-motion.png')
    } finally {
      await reducedContext.close()
    }
  })

  await check('390px mobile menu opens; brand closes; Work link navigates', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await returnHome(page)
    await page.locator('.menu-button').click()
    await page.locator('#mobile-menu:modal').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'), 'true')
    await page.locator('#mobile-menu .brand').click()
    await page.waitForFunction(() => !document.querySelector('#mobile-menu').open)
    assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'), 'false')
    await page.locator('.menu-button').click()
    await page.locator('#mobile-menu:modal').waitFor({ state: 'visible' })
    await page.locator('#mobile-menu a[href="#works"]').click()
    await page.waitForFunction(() => !document.querySelector('#mobile-menu').open && location.hash === '#works')
    await page.waitForFunction(() => Math.abs(document.querySelector('#works').getBoundingClientRect().top) < 100)
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('overlay-open')), false)
    await page.screenshot({ path: path.join(shots, 'verify-mobile-works-390.png') })
  })

  await check('320/390/640/768/1024/1440/1920px have no horizontal overflow', async () => {
    const widths = [320, 390, 640, 768, 1024, 1440, 1920]
    for (const width of widths) {
      await closeDialogs(page)
      await page.setViewportSize({ width, height: width >= 1440 ? 1080 : 900 })
      await page.locator('.filter-buttons').getByRole('button', { name: /すべて/ }).click()
      await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 3)
      await assertNoOverflow(page, width)
      await page.locator('.project-card').first().click()
      await page.locator('.project-dialog:modal').waitFor({ state: 'visible' })
      await assertNoOverflow(page, width)
      if (width === 320) await page.screenshot({ path: path.join(shots, 'verify-dialog-320.png') })
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => !document.querySelector('.project-dialog').open)
      if (width === 640) {
        await page.locator('.project-card').last().scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(shots, 'verify-projects-640.png') })
      }
      if ([390, 768, 1024].includes(width)) {
        await returnHome(page)
        await captureHome(page, `verify-city-home-${width}.png`)
      }
      if (width === 768) {
        await page.evaluate(() => document.querySelector('#works').scrollIntoView({ block: 'start', behavior: 'instant' }))
        await page.screenshot({ path: path.join(shots, 'verify-projects-768.png') })
      }
      if (width === 1920) {
        const containers = await page.locator('main .wrap, footer .wrap').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
        assert.ok(containers.length >= 5)
        assert.ok(containers.every(measurement => measurement <= 1700.5), `Content exceeds 1700px: ${containers.join(', ')}`)
        assert.ok(containers.some(measurement => Math.abs(measurement - 1700) < 1), '1920px viewport did not reach the requested 1700px content maximum')
        await returnHome(page)
        await captureHome(page, 'verify-city-desktop-1920.png')
      }
      console.log(`  ${width}px: document + project dialog OK`)
    }
  })

  await check('No uncaught browser errors across all checks', async () => assert.deepEqual(pageErrors, []))
} catch (error) {
  results.push({ name: 'Browser setup / navigation', ok: false, error: error.stack || error.message })
  console.error(`FAIL setup: ${error.stack || error.message}`)
} finally {
  if (browser) await browser.close()
}

const failed = results.filter(result => !result.ok)
console.log(`\nUI verification: ${results.length - failed.length}/${results.length} passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
if (failed.length) {
  for (const result of failed) console.error(`- ${result.name}: ${result.error}`)
  process.exitCode = 1
}
