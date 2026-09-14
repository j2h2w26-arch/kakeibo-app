import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const target = new URL('../public/ocr/', import.meta.url)
await mkdir(target, { recursive: true })
await copyFile(require.resolve('tesseract.js/dist/worker.min.js'), new URL('worker.min.js', target))
const core = dirname(require.resolve('tesseract.js-core/package.json'))
await copyFile(join(core, 'LICENSE'), new URL('core-LICENSE.txt', target))
await copyFile(join(dirname(require.resolve('tesseract.js/package.json')), 'LICENSE.md'), new URL('worker-LICENSE.txt', target))
await copyFile(require.resolve('tesseract.js/dist/worker.min.js.LICENSE.txt'), new URL('worker.min.js.LICENSE.txt', target))
for (const name of await readdir(core)) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) {
    await copyFile(join(core, name), new URL(name, target))
  }
}
