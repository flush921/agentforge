import { access, cp, lstat, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const standaloneDir = path.join(root, '.next', 'standalone')
const staticDir = path.join(root, '.next', 'static')
const publicDir = path.join(root, 'public')
const appDir = path.join(root, '.deploy', 'app')

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function removeNativePackages(directory, removed) {
  if (!(await exists(directory))) return

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const target = path.join(directory, entry.name)
    if (entry.name === 'sharp-wasm32' || entry.name.includes('-win32-')) {
      await rm(target, { recursive: true, force: true })
      removed.push(path.relative(appDir, target))
    } else {
      await removeNativePackages(target, removed)
    }
  }
}

async function sizeOf(target) {
  const info = await lstat(target)
  if (info.isSymbolicLink()) return 0
  if (!info.isDirectory()) return info.size

  let total = 0
  for (const entry of await readdir(target)) {
    total += await sizeOf(path.join(target, entry))
  }
  return total
}

await rm(appDir, { recursive: true, force: true })
await mkdir(path.dirname(appDir), { recursive: true })
await cp(standaloneDir, appDir, { recursive: true })
await cp(staticDir, path.join(appDir, '.next', 'static'), { recursive: true })
if (await exists(publicDir)) {
  await cp(publicDir, path.join(appDir, 'public'), { recursive: true })
}

const removed = []
await removeNativePackages(path.join(appDir, 'node_modules'), removed)
if (removed.length > 0) {
  console.log(`已剔除原生包：${removed.sort().join('、')}`)
}

const bytes = await sizeOf(appDir)
const topLevel = await readdir(appDir, { withFileTypes: true })
console.log(`产物总大小：${bytes} bytes（${(bytes / 1024 / 1024).toFixed(2)} MiB）`)
console.log(
  `顶层目录：${topLevel
    .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
    .sort()
    .join('、')}`,
)
