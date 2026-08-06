/**
 * Shared Style Dictionary export runner used by `exportTokens`.
 *
 * Guarantees:
 * - token-manager/* transform groups are registered before build
 * - final generated files are scanned for "[object Object]"
 * - callers can fail the HTTP request BEFORE starting a ZIP download
 */

import fs from 'fs'
import path from 'path'
import StyleDictionary from 'style-dictionary'
import { createExportIssue, createExportResult } from '../dtcg/exporters/exportResult.js'
import { assertNoRawObjectExportValues } from './exportGuard.js'
import { createSdConfig } from './index.js'
import { ensureDtcgTransformsRegistered } from './registerDtcgTransforms.js'

/**
 * @typedef {object} SdFileSpec
 * @property {string} destination - path relative to platform buildPath
 * @property {(token: object) => boolean} [filter]
 */

/**
 * @param {object} options
 * @param {'css' | 'scss' | 'tailwind' | 'swift' | 'android'} options.format
 * @param {string} options.jsonFilePath - prepared DTCG JSON for SD source
 * @param {string} options.buildBase - directory for SD build output
 * @param {SdFileSpec[]} options.files - per-collection (or single) file outputs
 * @param {{ basePxFontSize?: number }} [options.platformOptions]
 * @returns {Promise<import('../dtcg/exporters/exportResult.js').ExportResult & {
 *   outputFilePaths: string[],
 *   transformGroup?: string,
 *   registeredTransformNames?: string[],
 *   diagnostics?: object,
 * }>}
 */
export async function runStyleDictionaryExport({
  format,
  jsonFilePath,
  buildBase,
  files,
  platformOptions = {},
}) {
  ensureDtcgTransformsRegistered()

  if (!Array.isArray(files) || files.length === 0) {
    return {
      ...createExportResult({
        ok: false,
        errors: [
          createExportIssue({
            path: '',
            code: 'EXPORT_SD_NO_FILES',
            message: 'Style Dictionary export requires at least one output file.',
            severity: 'error',
          }),
        ],
        warnings: [],
      }),
      outputFilePaths: [],
    }
  }

  const sdConfig = createSdConfig(format, jsonFilePath, buildBase)
  const platformKey = Object.keys(sdConfig.platforms)[0]
  const platformConfig = sdConfig.platforms[platformKey]
  const fileTemplate = platformConfig.files?.[0]
  if (!fileTemplate) {
    return {
      ...createExportResult({
        ok: false,
        errors: [
          createExportIssue({
            path: '',
            code: 'EXPORT_SD_CONFIG_INVALID',
            message: 'Style Dictionary config has no files[0] template.',
            severity: 'error',
          }),
        ],
        warnings: [],
      }),
      outputFilePaths: [],
    }
  }

  if (typeof platformOptions.basePxFontSize === 'number') {
    platformConfig.basePxFontSize = platformOptions.basePxFontSize
  }

  platformConfig.files = files.map((f) => ({
    ...fileTemplate,
    destination: f.destination,
    ...(typeof f.filter === 'function' ? { filter: f.filter } : {}),
  }))

  fs.mkdirSync(platformConfig.buildPath, { recursive: true })
  for (const f of platformConfig.files) {
    fs.mkdirSync(
      path.dirname(path.join(platformConfig.buildPath, f.destination)),
      { recursive: true },
    )
  }

  const transformGroup = platformConfig.transformGroup
  const registeredTransformNames = Object.keys(
    StyleDictionary.hooks?.transforms || {},
  ).filter((n) => n.startsWith('dtcg/'))

  const diagnostics = {
    exporter: 'runStyleDictionaryExport',
    format,
    transformGroup,
    registeredTransformNames,
    platformKey,
    usesDtcg: undefined,
  }

  if (process.env.DEBUG_EXPORT === '1') {
    console.log('[runStyleDictionaryExport]', diagnostics)
  }

  let sd
  try {
    sd = new StyleDictionary(sdConfig)
    await sd.hasInitialized
    diagnostics.usesDtcg = sd.usesDtcg

    if (process.env.DEBUG_EXPORT === '1') {
      const platformPre = await sd.getPlatform(platformKey)
      const transformNames =
        platformPre?.transforms?.map((t) => t.name) ||
        sd.hooks.transformGroups?.[transformGroup] ||
        []
      console.log('[runStyleDictionaryExport] active transforms', transformNames)
      for (const token of platformPre?.dictionary?.allTokens || []) {
        const before = token.original?.$value ?? token.original?.value
        const after = token.$value ?? token.value
        console.log(
          '[runStyleDictionaryExport] token',
          Array.isArray(token.path) ? token.path.join('.') : token.name,
          'type=',
          token.$type ?? token.type,
          'before=',
          JSON.stringify(before),
          'after=',
          JSON.stringify(after),
        )
      }
    }

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
    return {
      ...createExportResult({ ok: false, errors: [issue], warnings: [] }),
      outputFilePaths: [],
      transformGroup,
      registeredTransformNames,
      diagnostics,
    }
  }

  const platform = await sd.getPlatform(platformKey)
  const allTokens = platform?.dictionary?.allTokens || []
  const outputFilePaths = platformConfig.files
    .map((f) => path.join(platformConfig.buildPath, f.destination))
    .filter((p) => fs.existsSync(p))

  // Always scan the actual files that will be zipped.
  const guard = assertNoRawObjectExportValues({
    format,
    allTokens,
    outputFilePaths,
    sdOptions: { usesDtcg: sd.usesDtcg !== false },
  })

  if (!guard.ok) {
    return {
      ...createExportResult({
        ok: false,
        errors: guard.errors,
        warnings: guard.warnings,
      }),
      outputFilePaths,
      transformGroup,
      registeredTransformNames,
      diagnostics,
    }
  }

  return {
    ...createExportResult({ ok: true, warnings: guard.warnings, errors: [] }),
    outputFilePaths,
    transformGroup,
    registeredTransformNames,
    diagnostics,
    allTokens,
  }
}
