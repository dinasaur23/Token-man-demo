const STORAGE_KEYS = {
  apiUrl: "tm_apiUrl",
  fileConfig: "tm_fileConfig",
  jwt: "tm_jwt",
};

const LOCAL_API_URL = "http://localhost:8081";
const PRODUCTION_API_URL = "https://token-manager-ecru.vercel.app";
const DEFAULT_API_URL = PRODUCTION_API_URL;

function getCurrentFileKey() {
  let key = figma.root.getPluginData("tm_fileKey");
  if (typeof key === "string" && key.length > 0) {
    return key;
  }
  key =
    "file-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);

  figma.root.setPluginData("tm_fileKey", key);
  console.log("[TokenManager] Generated new fileKey for this file:", key);
  return key;
}

async function getSettingsForCurrentFile() {
  const fileKey = getCurrentFileKey();

  const [apiUrl, fileConfig, globalJwt] = await Promise.all([
    figma.clientStorage.getAsync(STORAGE_KEYS.apiUrl),
    figma.clientStorage.getAsync(STORAGE_KEYS.fileConfig),
    figma.clientStorage.getAsync(STORAGE_KEYS.jwt),
  ]);

  const config =
    fileConfig && typeof fileConfig === "object" ? fileConfig[fileKey] : null;

  const designSystemId = config ? config.designSystemId : null;
  const jwt = globalJwt || (config ? config.jwt : null);

  console.log("TokenManager settings for file (getSettingsForCurrentFile)", {
    fileKey,
    apiUrl,
    designSystemId,
    hasJwt: !!jwt,
    rawFileConfig: fileConfig,
  });

  return {
    apiUrl: (apiUrl || DEFAULT_API_URL).replace(/\/$/, ""),
    designSystemId,
    jwt,
  };
}

/* === BEGIN GENERATED shared/figma-dtcg-mapping === */
// Generated from shared/figma-dtcg-mapping/index.js (sha256:d704b69a168dd690)
// Run: node scripts/embed-figma-dtcg-mapping.js
var FigmaDtcgMapping = (function () {
/** @typedef {'COLOR'|'FLOAT'|'STRING'|'BOOLEAN'|string} FigmaResolvedType */
/** @typedef {string} FigmaVariableScope */

/**
 * Full Figma VariableScope set (Plugin API).
 * @see https://developers.figma.com/docs/plugins/api/VariableScope/
 */
const FIGMA_VARIABLE_SCOPES = Object.freeze([
  'ALL_SCOPES',
  'TEXT_CONTENT',
  'CORNER_RADIUS',
  'WIDTH_HEIGHT',
  'GAP',
  'ALL_FILLS',
  'FRAME_FILL',
  'SHAPE_FILL',
  'TEXT_FILL',
  'STROKE_COLOR',
  'EFFECT_COLOR',
  'STROKE_FLOAT',
  'EFFECT_FLOAT',
  'OPACITY',
  'FONT_FAMILY',
  'FONT_STYLE',
  'FONT_WEIGHT',
  'FONT_SIZE',
  'LINE_HEIGHT',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
])

/** FLOAT scopes that map to DTCG dimension (px). */
const DIMENSIONAL_SCOPES = Object.freeze([
  'WIDTH_HEIGHT',
  'GAP',
  'CORNER_RADIUS',
  'FONT_SIZE',
  'LINE_HEIGHT',
  'LETTER_SPACING',
  'PARAGRAPH_SPACING',
  'PARAGRAPH_INDENT',
  'STROKE_FLOAT',
  'EFFECT_FLOAT',
])

const DIMENSIONAL_SCOPE_SET = new Set(DIMENSIONAL_SCOPES)

/** DTCG types this importer may emit (subset of applicationSupportedTypes). */
const FIGMA_IMPORTABLE_DTCG_TYPES = Object.freeze([
  'color',
  'dimension',
  'number',
  'fontFamily',
  'fontWeight',
])

const SKIP_REASON = Object.freeze({
  UNSUPPORTED_FIGMA_MAPPING: 'UNSUPPORTED_FIGMA_MAPPING',
  INVALID_VALUE: 'INVALID_VALUE',
  UNRESOLVED_ALIAS: 'UNRESOLVED_ALIAS',
  EMPTY_NAME: 'EMPTY_NAME',
  NO_VALUE: 'NO_VALUE',
})

const WARNING_CODE = Object.freeze({
  DIMENSION_NORMALIZED_TO_PX: 'DIMENSION_NORMALIZED_TO_PX',
  MULTI_MODE_COLLECTION: 'MULTI_MODE_COLLECTION',
  CLIENT_MODE_SWITCH_LIMITATION: 'CLIENT_MODE_SWITCH_LIMITATION',
})

const ALIAS_PATTERN = /^\{[^}]+\}$/

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return []
  return scopes.filter((s) => typeof s === 'string')
}

function scopesInclude(scopes, target) {
  return normalizeScopes(scopes).includes(target)
}

function hasDimensionalScope(scopes) {
  const list = normalizeScopes(scopes)
  for (let i = 0; i < list.length; i++) {
    if (DIMENSIONAL_SCOPE_SET.has(list[i])) return true
  }
  return false
}

/**
 * Classify a Figma variable into a DTCG type or unsupported skip.
 * Uses resolvedType + scopes only (never token name alone).
 *
 * FLOAT priority:
 * 1. FONT_WEIGHT → fontWeight
 * 2. dimensional scopes → dimension
 * 3. otherwise → number
 *
 * @param {{ resolvedType?: string, scopes?: string[], name?: string }} variable
 */
function classifyFigmaVariable(variable) {
  const resolvedType = variable && variable.resolvedType
  const scopes = variable && variable.scopes

  if (resolvedType === 'COLOR') {
    return {
      status: 'supported',
      dtcgType: 'color',
      mappingReason: 'COLOR',
    }
  }

  if (resolvedType === 'FLOAT') {
    if (scopesInclude(scopes, 'FONT_WEIGHT')) {
      return {
        status: 'supported',
        dtcgType: 'fontWeight',
        mappingReason: 'FLOAT+FONT_WEIGHT',
      }
    }
    if (hasDimensionalScope(scopes)) {
      return {
        status: 'supported',
        dtcgType: 'dimension',
        mappingReason: 'FLOAT+DIMENSIONAL_SCOPE',
        warning: WARNING_CODE.DIMENSION_NORMALIZED_TO_PX,
      }
    }
    return {
      status: 'supported',
      dtcgType: 'number',
      mappingReason: 'FLOAT_GENERIC',
    }
  }

  if (resolvedType === 'STRING') {
    if (scopesInclude(scopes, 'FONT_FAMILY')) {
      return {
        status: 'supported',
        dtcgType: 'fontFamily',
        mappingReason: 'STRING+FONT_FAMILY',
      }
    }
    return {
      status: 'unsupported',
      mappingReason: SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING,
      skipDetail:
        'STRING without FONT_FAMILY scope has no supported DTCG basic mapping',
    }
  }

  if (resolvedType === 'BOOLEAN') {
    return {
      status: 'unsupported',
      mappingReason: SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING,
      skipDetail: 'BOOLEAN has no supported DTCG basic mapping',
    }
  }

  return {
    status: 'unsupported',
    mappingReason: SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING,
    skipDetail: `Unsupported Figma resolvedType: ${String(resolvedType)}`,
  }
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function toHexChannel(n) {
  const clamped = Math.max(0, Math.min(255, Math.round(n)))
  return clamped.toString(16).padStart(2, '0')
}

function colorToHex6(color) {
  const r = clamp01(color.r)
  const g = clamp01(color.g)
  const b = clamp01(color.b)

  return (
    '#' + toHexChannel(r * 255) + toHexChannel(g * 255) + toHexChannel(b * 255)
  )
}

/**
 * Convert Figma COLOR RGBA (0–1 channels) to canonical DTCG sRGB object.
 * Preserves alpha as a separate field. Hex is always 6-digit #RRGGBB
 * (application canonical hex policy).
 */
function figmaColorToDtcg(color) {
  if (!color || typeof color !== 'object') {
    return {
      ok: false,
      reason: SKIP_REASON.INVALID_VALUE,
      message: 'COLOR value must be an object with r/g/b',
    }
  }
  if (
    typeof color.r !== 'number' ||
    typeof color.g !== 'number' ||
    typeof color.b !== 'number'
  ) {
    return {
      ok: false,
      reason: SKIP_REASON.INVALID_VALUE,
      message: 'COLOR value missing numeric r/g/b',
    }
  }

  const r = clamp01(color.r)
  const g = clamp01(color.g)
  const b = clamp01(color.b)
  const a = color.a != null ? clamp01(color.a) : 1
  const round3 = (n) => Math.round(n * 1000) / 1000

  return {
    ok: true,
    value: {
      colorSpace: 'srgb',
      components: [round3(r), round3(g), round3(b)],
      alpha: round3(a),
      hex: colorToHex6({ r, g, b }),
    },
  }
}

/**
 * Validate a DTCG leaf `$value` for Figma-importable types (strict shapes).
 * Aliases (`{path}`) are accepted for all types.
 */
function validateFigmaImportDtcgValue(dtcgType, value) {
  if (typeof value === 'string' && ALIAS_PATTERN.test(value)) {
    return { ok: true }
  }

  if (dtcgType === 'color') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, message: 'color value must be an object' }
    }
    if (value.colorSpace !== 'srgb') {
      return { ok: false, message: 'color.colorSpace must be "srgb"' }
    }
    if (
      !Array.isArray(value.components) ||
      value.components.length !== 3 ||
      !value.components.every((c) => typeof c === 'number' && Number.isFinite(c))
    ) {
      return { ok: false, message: 'color.components must be 3 finite numbers' }
    }
    if (
      Object.prototype.hasOwnProperty.call(value, 'alpha') &&
      (typeof value.alpha !== 'number' ||
        !Number.isFinite(value.alpha) ||
        value.alpha < 0 ||
        value.alpha > 1)
    ) {
      return { ok: false, message: 'color.alpha must be in [0,1]' }
    }
    if (
      Object.prototype.hasOwnProperty.call(value, 'hex') &&
      (typeof value.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.hex))
    ) {
      return {
        ok: false,
        message: 'color.hex must be a 6-digit #RRGGBB when present',
      }
    }
    return { ok: true }
  }

  if (dtcgType === 'dimension') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, message: 'dimension must be { value, unit }' }
    }
    if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
      return { ok: false, message: 'dimension.value must be a finite number' }
    }
    if (value.unit !== 'px' && value.unit !== 'rem') {
      return { ok: false, message: 'dimension.unit must be "px" or "rem"' }
    }
    return { ok: true }
  }

  if (dtcgType === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, message: 'number value must be a finite number' }
    }
    return { ok: true }
  }

  if (dtcgType === 'fontFamily') {
    if (typeof value === 'string' && value.length > 0) return { ok: true }
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((s) => typeof s === 'string' && s.length > 0)
    ) {
      return { ok: true }
    }
    return {
      ok: false,
      message: 'fontFamily must be a non-empty string or string[]',
    }
  }

  if (dtcgType === 'fontWeight') {
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 1 &&
      value <= 1000
    ) {
      return { ok: true }
    }
    return {
      ok: false,
      message: 'fontWeight number must be in [1, 1000]',
    }
  }

  return {
    ok: false,
    message: `Unsupported Figma import DTCG type: ${dtcgType}`,
  }
}

/**
 * Convert a concrete (non-alias) Figma value to DTCG using classification.
 *
 * @param {{ resolvedType?: string, scopes?: string[] }} variable
 * @param {unknown} raw
 * @param {{ dtcgType?: string }=} classification
 */
function convertFigmaValueToDtcg(variable, raw, classification) {
  const classified = classification || classifyFigmaVariable(variable)
  if (classified.status !== 'supported' || !classified.dtcgType) {
    return {
      ok: false,
      reason: classified.mappingReason || SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING,
      message: classified.skipDetail || 'Unsupported Figma mapping',
    }
  }

  const dtcgType = classified.dtcgType

  if (dtcgType === 'color') {
    return figmaColorToDtcg(raw)
  }

  if (dtcgType === 'dimension') {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        ok: false,
        reason: SKIP_REASON.INVALID_VALUE,
        message: 'dimension FLOAT must be a finite number',
      }
    }
    const value = { value: raw, unit: 'px' }
    const check = validateFigmaImportDtcgValue('dimension', value)
    if (!check.ok) {
      return {
        ok: false,
        reason: SKIP_REASON.INVALID_VALUE,
        message: check.message,
      }
    }
    return {
      ok: true,
      value,
      warning: WARNING_CODE.DIMENSION_NORMALIZED_TO_PX,
    }
  }

  if (dtcgType === 'number') {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        ok: false,
        reason: SKIP_REASON.INVALID_VALUE,
        message: 'number FLOAT must be a finite number',
      }
    }
    return { ok: true, value: raw }
  }

  if (dtcgType === 'fontFamily') {
    if (typeof raw !== 'string' || raw.length === 0) {
      return {
        ok: false,
        reason: SKIP_REASON.INVALID_VALUE,
        message: 'fontFamily value must be a non-empty string',
      }
    }
    return { ok: true, value: raw }
  }

  if (dtcgType === 'fontWeight') {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        ok: false,
        reason: SKIP_REASON.INVALID_VALUE,
        message: 'fontWeight FLOAT must be a finite number',
      }
    }
    const check = validateFigmaImportDtcgValue('fontWeight', raw)
    if (!check.ok) {
      return {
        ok: false,
        reason: SKIP_REASON.INVALID_VALUE,
        message: check.message,
      }
    }
    return { ok: true, value: raw }
  }

  return {
    ok: false,
    reason: SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING,
    message: `No converter for ${dtcgType}`,
  }
}

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function ensureGroup(root, segments) {
  let obj = root
  for (let i = 0; i < segments.length; i++) {
    const key = segments[i]
    if (!obj[key] || typeof obj[key] !== 'object') {
      obj[key] = {}
    }
    obj = obj[key]
  }
  return obj
}

function getModeKey(collection, modeId) {
  if (!collection || !collection.modes) return modeId
  for (let i = 0; i < collection.modes.length; i++) {
    const m = collection.modes[i]
    if (m.modeId === modeId) {
      return slugify(m.name || modeId)
    }
  }
  return modeId
}

function pickDefaultModeKey(modeMap) {
  const keys = Object.keys(modeMap)
  if (keys.length === 0) return null
  if (keys.indexOf('light') >= 0) return 'light'
  return keys[0]
}

function buildOrderedVariables(collections, variables) {
  const varsById = {}
  for (let i = 0; i < variables.length; i++) {
    varsById[variables[i].id] = variables[i]
  }

  const seen = {}
  const ordered = []

  for (let c = 0; c < collections.length; c++) {
    const col = collections[c]
    const ids = Array.isArray(col.variableIds) ? col.variableIds : []
    for (let j = 0; j < ids.length; j++) {
      const v = varsById[ids[j]]
      if (v && !seen[v.id]) {
        seen[v.id] = true
        ordered.push(v)
      }
    }
  }

  for (let i = 0; i < variables.length; i++) {
    const v = variables[i]
    if (!seen[v.id]) ordered.push(v)
  }

  return ordered
}

function isVariableAlias(raw) {
  return (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw.type === 'VARIABLE_ALIAS' &&
    typeof raw.id === 'string'
  )
}

function emptyReport() {
  return {
    imported: [],
    skipped: [],
    warnings: [],
  }
}

function pushWarning(report, warning) {
  report.warnings.push(warning)
}

function pushSkipped(report, entry) {
  report.skipped.push(entry)
}

function pushImported(report, entry) {
  report.imported.push(entry)
}

/**
 * Summarize import report for UI / notify.
 */
function formatImportReportSummary(report) {
  const counts = {}
  for (const item of report.imported || []) {
    const t = item.dtcgType || 'unknown'
    counts[t] = (counts[t] || 0) + 1
  }

  const lines = ['Imported from Figma:']
  const order = ['color', 'dimension', 'number', 'fontFamily', 'fontWeight']
  for (const t of order) {
    if (counts[t]) {
      const label =
        t === 'fontFamily'
          ? 'Font Family'
          : t === 'fontWeight'
            ? 'Font Weight'
            : t.charAt(0).toUpperCase() + t.slice(1)
      lines.push(`- ${counts[t]} ${label}`)
    }
  }
  for (const t of Object.keys(counts)) {
    if (!order.includes(t)) lines.push(`- ${counts[t]} ${t}`)
  }

  if ((report.skipped || []).length) {
    lines.push('Skipped:')
    for (const s of report.skipped) {
      lines.push(
        `- ${s.path || s.name || 'variable'}: ${s.detail || s.reason || 'skipped'}`,
      )
    }
  }

  if ((report.warnings || []).length) {
    lines.push('Warnings:')
    for (const w of report.warnings) {
      lines.push(`- ${w.message || w.code}`)
    }
  }

  return lines.join('\n')
}

/**
 * Count imported tokens by DTCG type.
 */
function countImportedByType(report) {
  const counts = {}
  for (const item of report.imported || []) {
    const t = item.dtcgType || 'unknown'
    counts[t] = (counts[t] || 0) + 1
  }
  return counts
}

/**
 * Build a DTCG source document + modifiers + import report from plain
 * Figma collection/variable snapshots (no Figma runtime required).
 *
 * @param {Array<{ id: string, name?: string, modes?: Array<{ modeId: string, name?: string }>, variableIds?: string[] }>} collections
 * @param {Array<{ id: string, name: string, resolvedType: string, scopes?: string[], valuesByMode?: Record<string, unknown>, variableCollectionId?: string, value?: unknown }>} variables
 */
function figmaVariablesToDtcgDocument(collections, variables) {
  const cols = Array.isArray(collections) ? collections : []
  const vars = Array.isArray(variables) ? variables : []
  const report = emptyReport()

  const collectionsById = {}
  for (let i = 0; i < cols.length; i++) {
    collectionsById[cols[i].id] = cols[i]
  }

  const dtcgTokens = {}
  const globalModeKeySet = {}
  const groupModeKeySet = {}
  const pathMap = {}
  const classificationById = {}
  let orderCounter = 0
  let dimensionPxWarned = false
  let clientModeLimitWarned = false

  const orderedVariables = buildOrderedVariables(cols, vars)

  for (let i = 0; i < orderedVariables.length; i++) {
    const variable = orderedVariables[i]

    const classification = classifyFigmaVariable(variable)
    classificationById[variable.id] = classification
    if (classification.status !== 'supported') continue

    let collectionName = 'default'
    const collection = collectionsById[variable.variableCollectionId]
    if (collection) collectionName = collection.name || collectionName
    const collectionKey = slugify(collectionName)

    const rawParts = String(variable.name || '')
      .split('/')
      .map((p) => slugify(p))
      .filter(Boolean)

    if (!rawParts.length) continue

    const tokenKey = rawParts[rawParts.length - 1]
    const groupSegments = rawParts.slice(0, -1)
    const containerPath = [collectionKey].concat(groupSegments)
    const fullPath = containerPath.concat(tokenKey).join('.')
    pathMap[variable.id] = fullPath
  }

  for (let i = 0; i < cols.length; i++) {
    const collection = cols[i]
    const modeCount =
      collection && Array.isArray(collection.modes) ? collection.modes.length : 0
    if (modeCount > 1) {
      const collectionKey = slugify(collection.name || 'default')
      const modeNames = collection.modes.map((m) => m.name || m.modeId)
      const slugModes = modeNames.map((n) => slugify(n))
      const defaultModeLabel = slugModes.includes('light')
        ? modeNames[slugModes.indexOf('light')]
        : modeNames[0]
      pushWarning(report, {
        code: WARNING_CODE.MULTI_MODE_COLLECTION,
        collection: collectionKey,
        message: `Collection "${collection.name || collectionKey}" has ${modeCount} modes; default mode "${defaultModeLabel}" is stored in $value. All modes are preserved under $extensions.figma.valuesByMode.`,
        modeCount,
        modes: modeNames,
      })
    }
  }

  for (let i = 0; i < orderedVariables.length; i++) {
    const variable = orderedVariables[i]
    const classification =
      classificationById[variable.id] || classifyFigmaVariable(variable)

    let collectionName = 'default'
    const collection = collectionsById[variable.variableCollectionId]
    if (collection) collectionName = collection.name || collectionName
    const collectionKey = slugify(collectionName)

    const rawParts = String(variable.name || '')
      .split('/')
      .map((p) => slugify(p))
      .filter(Boolean)

    const displayPath =
      rawParts.length > 0
        ? [collectionKey].concat(rawParts).join('.')
        : `${collectionKey}/${variable.name || variable.id}`

    if (!rawParts.length) {
      pushSkipped(report, {
        id: variable.id,
        name: variable.name,
        path: displayPath,
        reason: SKIP_REASON.EMPTY_NAME,
        detail: 'Variable name produced an empty path',
      })
      continue
    }

    if (classification.status !== 'supported') {
      pushSkipped(report, {
        id: variable.id,
        name: variable.name,
        path: displayPath,
        reason:
          classification.mappingReason || SKIP_REASON.UNSUPPORTED_FIGMA_MAPPING,
        detail: classification.skipDetail,
        resolvedType: variable.resolvedType,
        scopes: normalizeScopes(variable.scopes),
      })
      continue
    }

    const dtcgType = classification.dtcgType
    const tokenKey = rawParts[rawParts.length - 1]
    const groupSegments = rawParts.slice(0, -1)
    const containerPath = [collectionKey].concat(groupSegments)
    const fullPath = containerPath.concat(tokenKey).join('.')

    const valuesByMode = variable.valuesByMode
    const modeIds =
      valuesByMode && typeof valuesByMode === 'object'
        ? Object.keys(valuesByMode)
        : []
    const collectionModeCount =
      collection &&
      collection.modes &&
      typeof collection.modes.length === 'number'
        ? collection.modes.length
        : 0
    const hasModes = collectionModeCount > 1

    let token = null
    let conversionWarning = null

    if (hasModes) {
      const valueByMode = {}
      const modesExt = {}
      const modeList =
        collection && Array.isArray(collection.modes) ? collection.modes : []

      for (let m = 0; m < modeList.length; m++) {
        const modeId = modeList[m].modeId
        const raw =
          valuesByMode && typeof valuesByMode === 'object'
            ? valuesByMode[modeId]
            : undefined
        if (raw === undefined || raw === null) continue

        const modeKey = getModeKey(collection, modeId)
        let modeValue = null

        if (isVariableAlias(raw)) {
          const targetPath = pathMap[raw.id]
          if (!targetPath) {
            pushSkipped(report, {
              id: variable.id,
              name: variable.name,
              path: `${fullPath}[@${modeKey}]`,
              reason: SKIP_REASON.UNRESOLVED_ALIAS,
              detail: `Unresolved alias target ${raw.id}`,
            })
            continue
          }
          modeValue = '{' + targetPath + '}'
        } else {
          const converted = convertFigmaValueToDtcg(
            variable,
            raw,
            classification,
          )
          if (!converted.ok) {
            pushSkipped(report, {
              id: variable.id,
              name: variable.name,
              path: `${fullPath}[@${modeKey}]`,
              reason: converted.reason || SKIP_REASON.INVALID_VALUE,
              detail: converted.message,
            })
            continue
          }
          modeValue = converted.value
          if (converted.warning) conversionWarning = converted.warning
        }

        valueByMode[modeKey] = modeValue
        modesExt[modeKey] = modeId
        globalModeKeySet[modeKey] = true
        if (!groupModeKeySet[collectionKey]) groupModeKeySet[collectionKey] = {}
        groupModeKeySet[collectionKey][modeKey] = true
      }

      const defaultModeKey = pickDefaultModeKey(valueByMode)
      if (!defaultModeKey) {
        pushSkipped(report, {
          id: variable.id,
          name: variable.name,
          path: fullPath,
          reason: SKIP_REASON.NO_VALUE,
          detail: 'No usable mode values',
        })
        continue
      }

      token = {
        $type: dtcgType,
        $value: valueByMode[defaultModeKey],
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            defaultMode: defaultModeKey,
            modes: modesExt,
            valuesByMode: valueByMode,
            order: orderCounter++,
          },
        },
      }
    } else {
      let raw = null
      if (valuesByMode && modeIds.length) raw = valuesByMode[modeIds[0]]
      else raw = variable.value

      if (raw === undefined || raw === null) {
        pushSkipped(report, {
          id: variable.id,
          name: variable.name,
          path: fullPath,
          reason: SKIP_REASON.NO_VALUE,
          detail: 'Missing variable value',
        })
        continue
      }

      let finalValue = null
      if (isVariableAlias(raw)) {
        const targetPath = pathMap[raw.id]
        if (!targetPath) {
          pushSkipped(report, {
            id: variable.id,
            name: variable.name,
            path: fullPath,
            reason: SKIP_REASON.UNRESOLVED_ALIAS,
            detail: `Unresolved alias target ${raw.id}`,
          })
          continue
        }
        finalValue = '{' + targetPath + '}'
      } else {
        const converted = convertFigmaValueToDtcg(
          variable,
          raw,
          classification,
        )
        if (!converted.ok) {
          pushSkipped(report, {
            id: variable.id,
            name: variable.name,
            path: fullPath,
            reason: converted.reason || SKIP_REASON.INVALID_VALUE,
            detail: converted.message,
          })
          continue
        }
        finalValue = converted.value
        if (converted.warning) conversionWarning = converted.warning
      }

      token = {
        $type: dtcgType,
        $value: finalValue,
        $extensions: {
          figma: {
            collection: collectionKey,
            variableId: variable.id,
            order: orderCounter++,
          },
        },
      }
    }

    const valueCheck = validateFigmaImportDtcgValue(dtcgType, token.$value)
    if (!valueCheck.ok) {
      pushSkipped(report, {
        id: variable.id,
        name: variable.name,
        path: fullPath,
        reason: SKIP_REASON.INVALID_VALUE,
        detail: valueCheck.message,
      })
      continue
    }

    const container = ensureGroup(dtcgTokens, containerPath)
    container[tokenKey] = token

    pushImported(report, {
      id: variable.id,
      name: variable.name,
      path: fullPath,
      dtcgType,
      mappingReason: classification.mappingReason,
    })

    if (
      (conversionWarning === WARNING_CODE.DIMENSION_NORMALIZED_TO_PX ||
        classification.warning === WARNING_CODE.DIMENSION_NORMALIZED_TO_PX) &&
      !dimensionPxWarned
    ) {
      dimensionPxWarned = true
      pushWarning(report, {
        code: WARNING_CODE.DIMENSION_NORMALIZED_TO_PX,
        message:
          'Figma dimensional variables are normalized to DTCG px on import.',
      })
    }
  }

  if (Object.keys(globalModeKeySet).length > 0 && !clientModeLimitWarned) {
    clientModeLimitWarned = true
    pushWarning(report, {
      code: WARNING_CODE.CLIENT_MODE_SWITCH_LIMITATION,
      message:
        'Figma mode data is preserved under $extensions.figma.valuesByMode, but the Token Manager UI currently switches live $value only for string alias mode values — not concrete number/object values. Default mode is stored in $value; platform export applies selected modes.',
    })
  }

  const modeKeys = Object.keys(globalModeKeySet)
  let modifiers = {}
  if (modeKeys.length) {
    const defaultMode = modeKeys.includes('light') ? 'light' : modeKeys[0]
    const groupModes = {}
    for (const k in groupModeKeySet) {
      groupModes[k] = Object.keys(groupModeKeySet[k]).sort()
    }
    modifiers = {
      mode: {
        values: modeKeys,
        default: defaultMode,
        groupModes,
      },
    }
  }

  return { tokens: dtcgTokens, modifiers, importReport: report }
}

/**
 * Walk a DTCG tree and validate every leaf for Figma-importable types.
 * Rejects string/boolean emitted by a bad mapper.
 */
function validateFigmaImportTokenTree(node, path = '') {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return { ok: true }
  }

  if (
    Object.prototype.hasOwnProperty.call(node, '$type') &&
    Object.prototype.hasOwnProperty.call(node, '$value')
  ) {
    const type = node.$type
    if (type === 'string' || type === 'boolean') {
      return {
        ok: false,
        path,
        message: `Unsupported token type: ${type}. Figma import must not emit string/boolean.`,
      }
    }

    if (FIGMA_IMPORTABLE_DTCG_TYPES.includes(type)) {
      const check = validateFigmaImportDtcgValue(type, node.$value)
      if (!check.ok) {
        return {
          ok: false,
          path: path ? `${path}.$value` : '$value',
          message: check.message,
        }
      }
    }

    return { ok: true }
  }

  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) continue
    const childPath = path ? `${path}.${key}` : key
    const result = validateFigmaImportTokenTree(node[key], childPath)
    if (!result.ok) return result
  }
  return { ok: true }
}

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
/* === END GENERATED shared/figma-dtcg-mapping === */

function snapshotCollections(collections) {
  const out = [];
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i];
    out.push({
      id: c.id,
      name: c.name,
      modes: (c.modes || []).map(function (m) {
        return { modeId: m.modeId, name: m.name };
      }),
      variableIds: Array.isArray(c.variableIds) ? c.variableIds.slice() : [],
    });
  }
  return out;
}

function snapshotVariables(variables) {
  const out = [];
  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    out.push({
      id: v.id,
      name: v.name,
      resolvedType: v.resolvedType,
      scopes: Array.isArray(v.scopes) ? v.scopes.slice() : [],
      valuesByMode: v.valuesByMode,
      variableCollectionId: v.variableCollectionId,
    });
  }
  return out;
}

function figmaVariablesToDtcg() {
  const collections = figma.variables.getLocalVariableCollections();
  const variables = figma.variables.getLocalVariables();

  const collectionSnapshots = snapshotCollections(collections);
  const variableSnapshots = snapshotVariables(variables);

  console.log(
    "RAW VARIABLES (PLAIN):",
    JSON.stringify(variableSnapshots, null, 2),
  );

  const result = FigmaDtcgMapping.figmaVariablesToDtcgDocument(
    collectionSnapshots,
    variableSnapshots,
  );

  console.log("[Plugin] DTCG tokens:", result.tokens);
  console.log("[Plugin] DTCG modifiers:", result.modifiers);
  console.log("[Plugin] importReport:", result.importReport);

  return result;
}

function notifyImportReport(report) {
  if (!report) {
    figma.notify("Tokens synced to Token Manager ✓");
    return;
  }
  const summary = FigmaDtcgMapping.formatImportReportSummary(report);
  console.log("[Plugin] Import report summary:\n" + summary);

  const counts = FigmaDtcgMapping.countImportedByType(report);
  const importedTotal = (report.imported || []).length;
  const skippedTotal = (report.skipped || []).length;

  const parts = [];
  parts.push(importedTotal + " imported");
  if (skippedTotal) parts.push(skippedTotal + " skipped");
  figma.notify(parts.join(", "), { timeout: 6000 });
}

async function resolveDesignSystemName(settings) {
  if (!settings.jwt || !settings.designSystemId || !settings.apiUrl) {
    return settings.designSystemId || "";
  }
  try {
    const base = settings.apiUrl.replace(/\/$/, "");
    const res = await fetch(base + "/api/design-systems", {
      headers: { Authorization: "Bearer " + settings.jwt },
    });
    const data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok) return settings.designSystemId;
    const items = Array.isArray(data)
      ? data
      : data && data.items
        ? data.items
        : [];
    for (let i = 0; i < items.length; i++) {
      const id = items[i] && (items[i]._id || items[i].id);
      if (id === settings.designSystemId) {
        return items[i].name || items[i].title || settings.designSystemId;
      }
    }
  } catch (_) {}
  return settings.designSystemId;
}

async function openSyncUI() {
  const settings = await getSettingsForCurrentFile();
  const ready = !!(settings.apiUrl && settings.designSystemId && settings.jwt);
  const designSystemName = await resolveDesignSystemName(settings);

  figma.showUI(__html__, { width: 420, height: 460 });
  figma.ui.postMessage({
    type: "init-sync",
    ready: ready,
    designSystemId: settings.designSystemId || "",
    designSystemName: designSystemName || settings.designSystemId || "—",
  });
}

async function performSyncAndReport() {
  const settings = await getSettingsForCurrentFile();
  console.log("[Sync] fileKey =", getCurrentFileKey());
  console.log("[Sync] settings =", settings);

  const apiUrl = settings.apiUrl;
  const designSystemId = settings.designSystemId;
  const jwt = settings.jwt;

  if (!apiUrl || !designSystemId || !jwt) {
    figma.ui.postMessage({
      type: "sync-result",
      ok: false,
      message:
        "Token Manager settings missing for this Figma file. Open Settings first.",
    });
    return;
  }

  figma.ui.postMessage({ type: "sync-started" });

  const dtcg = figmaVariablesToDtcg();
  const tokens = dtcg.tokens;
  const modifiers = dtcg.modifiers || {};
  const importReport = dtcg.importReport || {
    imported: [],
    skipped: [],
    warnings: [],
  };

  console.log("[Plugin] figmaVariablesToDtcg result:", {
    tokensSample: JSON.stringify(tokens, null, 2).slice(0, 500),
    modifiers,
    importReport,
  });

  const base = apiUrl.replace(/\/$/, "");
  const url =
    base +
    "/api/tokens/figma-sync?designSystemId=" +
    encodeURIComponent(designSystemId);

  const payload = {
    tokens: tokens,
    importReport: importReport,
  };
  if (modifiers && Object.keys(modifiers).length > 0) {
    payload.modifiers = modifiers;
  }

  console.log(
    "[Plugin] Sync payload:",
    JSON.stringify(payload, null, 2).slice(0, 500),
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwt,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    figma.notify("Sync failed: " + response.status);
    figma.ui.postMessage({
      type: "sync-result",
      ok: false,
      message: "Sync failed: " + response.status + " " + text,
    });
    return;
  }

  const resJson = await response.json().catch(function () {
    return null;
  });
  console.log("Sync OK:", resJson || {});
  const report = (resJson && resJson.importReport) || importReport;
  notifyImportReport(report);
  figma.ui.postMessage({
    type: "sync-result",
    ok: true,
    importReport: report,
  });
}

async function openSettingsUI() {
  const { apiUrl, designSystemId, jwt } = await getSettingsForCurrentFile();

  figma.showUI(__html__, { width: 420, height: 520 });

  figma.ui.postMessage({
    type: "init-settings",
    apiUrl: apiUrl || DEFAULT_API_URL,
    designSystemId: designSystemId || "",
    hasJwt: !!jwt,
  });

  const settings = await getSettingsForCurrentFile();
  if (settings.jwt) {
    try {
      const base = settings.apiUrl.replace(/\/$/, "");
      const res = await fetch(base + "/api/design-systems", {
        headers: { Authorization: "Bearer " + settings.jwt },
      });

      const data = await res.json().catch(() => null);
      if (res.ok) {
        figma.ui.postMessage({
          type: "design-systems",
          items: Array.isArray(data)
            ? data
            : data && data.items
              ? data.items
              : [],
        });
      } else {
        figma.ui.postMessage({
          type: "design-systems-error",
          message:
            (data && (data.message || data.error)) ||
            "Failed to load design systems.",
        });
      }
    } catch (e) {
      figma.ui.postMessage({
        type: "design-systems-error",
        message: e && e.message ? e.message : String(e),
      });
    }
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "close-plugin") {
    figma.closePlugin();
    return;
  }

  if (msg.type === "run-sync") {
    try {
      await performSyncAndReport();
    } catch (err) {
      console.error(err);
      figma.notify("Error: " + err.message);
      figma.ui.postMessage({
        type: "sync-result",
        ok: false,
        message: err && err.message ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === "open-settings") {
    await openSettingsUI();
    return;
  }

  if (msg.type === "login-success") {
    const jwt = (msg.jwt || "").trim();
    if (!jwt) {
      figma.notify("Login failed (empty token).");
      return;
    }

    await figma.clientStorage.setAsync(STORAGE_KEYS.jwt, jwt);

    const apiUrl =
      (await figma.clientStorage.getAsync(STORAGE_KEYS.apiUrl)) ||
      DEFAULT_API_URL;
    const base = String(apiUrl).replace(/\/$/, "");
    const res = await fetch(base + "/api/design-systems", {
      headers: { Authorization: "Bearer " + jwt },
    });
    const data = await res.json().catch(() => null);

    figma.ui.postMessage({
      type: "design-systems",
      items: Array.isArray(data) ? data : data && data.items ? data.items : [],
    });

    figma.notify("Logged in ✓");
    return;
  }

  if (msg.type === "save-settings") {
    const fileKey = getCurrentFileKey();

    const apiUrl =
      (msg.apiUrl || "").trim().replace(/\/$/, "") || DEFAULT_API_URL;

    const designSystemId = (msg.designSystemId || "").trim();

    if (!designSystemId) {
      figma.notify("Please select a Design System.");
      return;
    }

    let fileConfig =
      (await figma.clientStorage.getAsync(STORAGE_KEYS.fileConfig)) || {};

    if (typeof fileConfig !== "object") fileConfig = {};

    fileConfig[fileKey] = { designSystemId };

    await Promise.all([
      figma.clientStorage.setAsync(STORAGE_KEYS.apiUrl, apiUrl),
      figma.clientStorage.setAsync(STORAGE_KEYS.fileConfig, fileConfig),
    ]);

    console.log("Saved TokenManager settings", {
      fileKey,
      apiUrl,
      designSystemId,
      fileConfig,
    });

    figma.notify("Token Manager settings saved for this Figma file ✓");
    figma.closePlugin();
  }
};

if (figma.command === "sync") {
  openSyncUI();
} else if (figma.command === "settings") {
  openSettingsUI();
} else {
  openSyncUI();
}
