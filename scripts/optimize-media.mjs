import { createRequire } from 'node:module'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Deterministic derivative generation. Originals are read from the archive.
// On the first run only, any missing archive input is copied from public/media;
// subsequent runs work after the public originals have been removed from builds.
// This script never deletes or overwrites the archived original files.
// Run with an installed sharp package, or the bundled Codex runtime used here.
const require = createRequire(import.meta.url)
let sharp
try { sharp = require('sharp') }
catch { sharp = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp') }
const root = fileURLToPath(new URL('../', import.meta.url))
const sources = ['about.jpg', 'project-01.jpg', 'project-02.jpg', 'project-03.jpg', 'hero-aero-fallback.png']
const destination = path.join(root, 'public/media/optimized')
const archive = path.join(root, 'reference-media/performance-originals')
await mkdir(destination, { recursive: true })
await mkdir(archive, { recursive: true })

const manifest = {}
const report = { originalsPreserved: true, settings: { webp: { quality: 80, effort: 5 }, avif: { quality: 54, effort: 6, chromaSubsampling: '4:4:4' } }, files: [] }
for (const name of sources) {
  const source = path.join(root, 'public/media', name)
  const archivedSource = path.join(archive, name)
  try { await stat(archivedSource) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    await copyFile(source, archivedSource, constants.COPYFILE_EXCL)
  }
  const input = await readFile(archivedSource)
  const metadata = await sharp(input).metadata()
  const maxWidth = Math.min(1920, metadata.width)
  const widths = [...new Set([640, 960, 1440, maxWidth].filter(width => width <= maxWidth))].sort((a, b) => a - b)
  const stem = path.parse(name).name
  const item = { source: `/media/${name}`, width: metadata.width, height: metadata.height, originalBytes: input.length, variants: { avif: [], webp: [] } }
  for (const width of widths) {
    for (const format of ['avif', 'webp']) {
      const outputName = `${stem}-${width}.${format}`
      const file = path.join(destination, outputName)
      const info = await sharp(input).resize({ width, withoutEnlargement: true })[format](report.settings[format]).toFile(file)
      item.variants[format].push({ src: `/media/optimized/${outputName}`, width: info.width, height: info.height, bytes: (await stat(file)).size })
    }
  }
  manifest[item.source] = item
  report.files.push(item)
  console.log(`${name}: ${input.length} B -> AVIF ${item.variants.avif.at(-1).bytes} B / WebP ${item.variants.webp.at(-1).bytes} B at ${maxWidth}px`)
}
report.totalOriginalBytes = report.files.reduce((sum, file) => sum + file.originalBytes, 0)
report.totalLargestAvifBytes = report.files.reduce((sum, file) => sum + file.variants.avif.at(-1).bytes, 0)
report.totalLargestWebpBytes = report.files.reduce((sum, file) => sum + file.variants.webp.at(-1).bytes, 0)
report.totalDerivativeBytes = report.files.reduce((sum, file) => sum + [...file.variants.avif, ...file.variants.webp].reduce((bytes, variant) => bytes + variant.bytes, 0), 0)
await writeFile(path.join(root, 'src/media-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(archive, 'optimization-report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ original: report.totalOriginalBytes, largestAvif: report.totalLargestAvifBytes, largestWebp: report.totalLargestWebpBytes, allDerivatives: report.totalDerivativeBytes }))
