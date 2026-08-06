/**
 * Build a Style Dictionary platform with DTCG adapters + export guard.
 */

import fs from 'fs'
import path from 'path'
import StyleDictionary from 'style-dictionary'
import { createExportIssue, createExportResult } from '../dtcg/exporters/exportResult.js'
import { assertNoRawObjectExportValues } from './exportGuard.js'

/**
 * @param {object} options
 * @param {'css' | 'tailwind' | 'swift' | 'android' | 'scss'} options.format
 * @param {object} options.sdConfig - Style Dictionary config (prefer createSdConfig())
 * @returns {Promise<import('../dtcg/exporters/exportResult.js').ExportResult & { sd?: import('style-dictionary').default, outputFilePaths?: string[], allTokens?: object[] }>}
 */
export async function buildPlatformWithDtcgGuards({
  format,
  sdConfig,
}) {
  if (!sdConfig || typeof sdConfig !== 'object') {
    return createExportResult({
      ok: false,
      errors: [
        createExportIssue({
          path: '',
          code: 'EXPORT_SD_CONFIG_REQUIRED',
          message: 'buildPlatformWithDtcgGuards requires an sdConfig from createSdConfig().',
          severity: 'error',
        }),
      ],
      warnings: [],
    })
  }
  // createSdConfig already applies withDtcgSdAdapters; accept either.
  const config = sdConfig

  let sd
  try {
    sd = new StyleDictionary(config)
    await sd.hasInitialized
    await sd.buildAllPlatforms()
  } catch (err) {
    const issue = err?.exportIssue
      ? err.exportIssue
      : createExportIssue({
          path: err?.tokenName || '',
          code: err?.code || 'EXPORT_SD_BUILD_FAILED',
          message: err?.message || String(err),
          severity: 'error',
        })
    return createExportResult({
      ok: false,
      errors: [issue],
      warnings: [],
    })
  }

  const platformKey = Object.keys(config.platforms)[0]
  const platform = await sd.getPlatform(platformKey)
  const allTokens = platform?.dictionary?.allTokens || []
  const buildPath = config.platforms[platformKey].buildPath
  const outputFilePaths = []

  for (const file of config.platforms[platformKey].files || []) {
    const dest = path.join(buildPath, file.destination)
    if (fs.existsSync(dest)) outputFilePaths.push(dest)
  }

  // Also collect nested destinations (collection/mode filters write nested paths).
  if (fs.existsSync(buildPath)) {
    collectFiles(buildPath, outputFilePaths)
  }

  const guard = assertNoRawObjectExportValues({
    format: format === 'scss' ? 'scss' : format,
    allTokens,
    outputFilePaths: [...new Set(outputFilePaths)],
    sdOptions: { usesDtcg: sd.usesDtcg !== false },
  })

  if (!guard.ok) {
    return createExportResult({
      ok: false,
      errors: guard.errors,
      warnings: guard.warnings,
    })
  }

  return {
    ...createExportResult({ ok: true, warnings: guard.warnings, errors: [] }),
    sd,
    outputFilePaths: [...new Set(outputFilePaths)],
    allTokens,
  }
}

/**
 * @param {string} dir
 * @param {string[]} out
 */
function collectFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else out.push(full)
  }
}
