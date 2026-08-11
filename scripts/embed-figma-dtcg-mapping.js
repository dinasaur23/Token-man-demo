#!/usr/bin/env node
/**
 * Embed shared/figma-dtcg-mapping into:
 * - figma-token-plugin/code.js (IIFE for the plugin runtime)
 * - server/src/utils/figma-dtcg-mapping/ (vendored copy for Vercel server root)
 *
 * Usage:
 *   node scripts/embed-figma-dtcg-mapping.js          # write
 *   node scripts/embed-figma-dtcg-mapping.js --check  # exit 1 if out of sync
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const sharedPath = join(root, 'shared/figma-dtcg-mapping/index.js')
const sharedDtsPath = join(root, 'shared/figma-dtcg-mapping/index.d.ts')
const pluginPath = join(root, 'figma-token-plugin/code.js')
const serverVendorDir = join(root, 'server/src/utils/figma-dtcg-mapping')
const serverVendorJs = join(serverVendorDir, 'index.js')
const serverVendorDts = join(serverVendorDir, 'index.d.ts')
const sharedManifest = join(root, 'shared/dtcg-basic-token-types.json')
const serverManifest = join(
  root,
  'server/src/utils/dtcg/shared-manifest/dtcg-basic-token-types.json',
)

const BEGIN = '/* === BEGIN GENERATED shared/figma-dtcg-mapping === */'
const END = '/* === END GENERATED shared/figma-dtcg-mapping === */'

function stripExports(source) {
  return source
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
}

function buildGeneratedBlock(sharedSource) {
  const body = stripExports(sharedSource).trim()
  const hash = createHash('sha256').update(sharedSource).digest('hex').slice(0, 16)
  return `${BEGIN}
// Generated from shared/figma-dtcg-mapping/index.js (sha256:${hash})
// Run: node scripts/embed-figma-dtcg-mapping.js
var FigmaDtcgMapping = (function () {
${body}

  return {
    FIGMA_VARIABLE_SCOPES: FIGMA_VARIABLE_SCOPES,
    DIMENSIONAL_SCOPES: DIMENSIONAL_SCOPES,
    DIMENSIONAL_SCOPE_SET: DIMENSIONAL_SCOPE_SET,
    FIGMA_IMPORTABLE_DTCG_TYPES: FIGMA_IMPORTABLE_DTCG_TYPES,
    SKIP_REASON: SKIP_REASON,
    WARNING_CODE: WARNING_CODE,
    classifyFigmaVariable: classifyFigmaVariable,
    figmaColorToDtcg: figmaColorToDtcg,
    validateFigmaImportDtcgValue: validateFigmaImportDtcgValue,
    convertFigmaValueToDtcg: convertFigmaValueToDtcg,
    formatImportReportSummary: formatImportReportSummary,
    countImportedByType: countImportedByType,
    figmaVariablesToDtcgDocument: figmaVariablesToDtcgDocument,
    validateFigmaImportTokenTree: validateFigmaImportTokenTree,
  };
})();
${END}`
}

function extractBlock(pluginSource) {
  const start = pluginSource.indexOf(BEGIN)
  const end = pluginSource.indexOf(END)
  if (start === -1 || end === -1 || end < start) return null
  return pluginSource.slice(start, end + END.length)
}

function buildServerVendorSource(sharedSource) {
  const hash = createHash('sha256').update(sharedSource).digest('hex').slice(0, 16)
  return `/**
 * Vendored copy of shared/figma-dtcg-mapping for the Vercel server package
 * (rootDirectory: server). Keep in sync via:
 *   node scripts/embed-figma-dtcg-mapping.js
 *
 * Source sha256:${hash}
 */
${sharedSource}`
}

function main() {
  const checkOnly = process.argv.includes('--check')
  const sharedSource = readFileSync(sharedPath, 'utf8')
  const sharedDts = readFileSync(sharedDtsPath, 'utf8')
  const generated = buildGeneratedBlock(sharedSource)
  const serverVendor = buildServerVendorSource(sharedSource)
  let pluginSource = readFileSync(pluginPath, 'utf8')

  const existing = extractBlock(pluginSource)
  const existingServer = (() => {
    try {
      return readFileSync(serverVendorJs, 'utf8')
    } catch {
      return null
    }
  })()
  const existingManifest = (() => {
    try {
      return readFileSync(serverManifest, 'utf8')
    } catch {
      return null
    }
  })()
  const sharedManifestSrc = readFileSync(sharedManifest, 'utf8')

  if (checkOnly) {
    const pluginOk = existing === generated
    const serverOk = existingServer === serverVendor
    const manifestOk = existingManifest === sharedManifestSrc
    if (pluginOk && serverOk && manifestOk) {
      console.log(
        'figma-token-plugin + server vendor mapping are in sync with shared/figma-dtcg-mapping',
      )
      process.exit(0)
    }
    if (!pluginOk) {
      console.error(
        'figma-token-plugin/code.js mapping is OUT OF SYNC with shared/figma-dtcg-mapping.',
      )
    }
    if (!serverOk) {
      console.error(
        'server/src/utils/figma-dtcg-mapping is OUT OF SYNC with shared/figma-dtcg-mapping.',
      )
    }
    if (!manifestOk) {
      console.error(
        'server shared-manifest dtcg-basic-token-types.json is OUT OF SYNC.',
      )
    }
    console.error('Run: node scripts/embed-figma-dtcg-mapping.js')
    process.exit(1)
  }

  if (existing) {
    const start = pluginSource.indexOf(BEGIN)
    const end = pluginSource.indexOf(END) + END.length
    pluginSource =
      pluginSource.slice(0, start) + generated + pluginSource.slice(end)
  } else {
    const marker = 'function snapshotCollections('
    const idx = pluginSource.indexOf(marker)
    if (idx === -1) {
      console.error('Could not find insertion point in plugin code.js')
      process.exit(1)
    }
    pluginSource =
      pluginSource.slice(0, idx) + generated + '\n\n' + pluginSource.slice(idx)
  }

  writeFileSync(pluginPath, pluginSource)
  mkdirSync(serverVendorDir, { recursive: true })
  writeFileSync(serverVendorJs, serverVendor)
  writeFileSync(serverVendorDts, sharedDts)
  mkdirSync(dirname(serverManifest), { recursive: true })
  writeFileSync(serverManifest, sharedManifestSrc)

  const written = readFileSync(pluginPath, 'utf8')
  if (extractBlock(written) !== generated) {
    console.error('Embed verification failed: written block != generated block')
    process.exit(1)
  }
  console.log(
    'Embedded shared/figma-dtcg-mapping into figma-token-plugin/code.js and server vendor',
  )
}

main()
