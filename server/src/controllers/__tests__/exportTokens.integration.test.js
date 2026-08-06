/**
 * Integration tests for the real exportTokens controller path used by
 * TokenExportDialog (GET /api/tokens/export/:designSystemId?format=&bundle=1).
 *
 * Run: node --test src/controllers/__tests__/exportTokens.integration.test.js
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { createSdConfig } from '../../utils/sd/index.js'

const FIXTURE_DOC = {
  spacing: {
    $type: 'dimension',
    xs: { $value: { value: 4, unit: 'px' } },
    sm: { $value: { value: 8, unit: 'px' } },
    remMd: { $value: { value: 1, unit: 'rem' } },
    aliasSm: { $value: '{spacing.sm}' },
  },
  motion: {
    duration: {
      $type: 'duration',
      fast: { $value: { value: 150, unit: 'ms' } },
      slow: { $value: { value: 0.3, unit: 's' } },
      aliasFast: { $value: '{motion.duration.fast}' },
    },
    easing: {
      $type: 'cubicBezier',
      standard: { $value: [0.4, 0, 0.2, 1] },
      alias: { $value: '{motion.easing.standard}' },
    },
  },
  colors: {
    $type: 'color',
    black: {
      $value: {
        colorSpace: 'srgb',
        components: [0, 0, 0],
        hex: '#000000',
      },
    },
    aliasBlack: { $value: '{colors.black}' },
  },
  font: {
    family: {
      $type: 'fontFamily',
      sans: { $value: ['Source Sans 3', 'system-ui', 'sans-serif'] },
      mono: { $value: 'Roboto Mono' },
    },
    weight: {
      $type: 'fontWeight',
      bold: { $value: 700 },
      medium: { $value: 'medium' },
    },
  },
  scale: {
    $type: 'number',
    ratio: { $value: 1.25 },
  },
}

function mockWorkspace(filesContent = FIXTURE_DOC) {
  return {
    user: 'user-1',
    designSystem: 'ds-1',
    files: [{ name: 'tokens.json', content: filesContent }],
    overrides: {},
    deletedPaths: [],
    groupNameOverrides: {},
    nameOverrides: {},
    modeDeletedPaths: {},
    modeAddedRows: {},
  }
}

function createMockRes() {
  const chunks = []
  let statusCode = 200
  let bodyJson = null
  const headers = {}
  const res = {
    headersSent: false,
    status(code) {
      statusCode = code
      return this
    },
    json(payload) {
      bodyJson = payload
      this.headersSent = true
      return this
    },
    setHeader(k, v) {
      headers[k.toLowerCase()] = v
    },
    end() {
      this.headersSent = true
    },
    on() {
      return this
    },
    once() {
      return this
    },
    emit() {
      return false
    },
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      this.headersSent = true
      return true
    },
  }
  // archiver pipes to a writable; provide minimal Writable stream API
  Object.assign(res, {
    writable: true,
    writableEnded: false,
    cork() {},
    uncork() {},
    removeListener() {
      return this
    },
    destroy() {},
  })
  return {
    res,
    get statusCode() {
      return statusCode
    },
    get json() {
      return bodyJson
    },
    get headers() {
      return headers
    },
    getBuffer() {
      return Buffer.concat(chunks)
    },
  }
}

async function unzipStrings(buffer) {
  // Prefer system unzip to avoid adding deps: write temp zip and extract.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-int-'))
  const zipPath = path.join(dir, 'out.zip')
  fs.writeFileSync(zipPath, buffer)
  const extractDir = path.join(dir, 'out')
  fs.mkdirSync(extractDir)
  const { execFileSync } = await import('node:child_process')
  try {
    execFileSync('unzip', ['-o', zipPath, '-d', extractDir], { stdio: 'pipe' })
  } catch {
    // busybox unzip variants
    execFileSync('busybox', ['unzip', '-o', zipPath, '-d', extractDir], {
      stdio: 'pipe',
    })
  }
  const files = {}
  function walk(d, prefix = '') {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const rel = prefix ? `${prefix}/${name}` : name
      if (fs.statSync(full).isDirectory()) walk(full, rel)
      else files[rel] = fs.readFileSync(full, 'utf8')
    }
  }
  walk(extractDir)
  return files
}

describe('exportTokens HTTP integration (real controller)', () => {
  let exportTokens
  let TokenWorkspace
  let originalFindOne

  before(async () => {
    // Dynamic import after we can patch the model module.
    const modelPath = path.resolve('src/models/TokenWorkspace.js')
    TokenWorkspace = (await import(modelPath)).default
    originalFindOne = TokenWorkspace.findOne
    ;({ exportTokens } = await import('../TokenController.js'))
  })

  after(() => {
    TokenWorkspace.findOne = originalFindOne
  })

  function stubWorkspace(doc) {
    TokenWorkspace.findOne = () => ({
      lean: async () => doc,
    })
  }

  async function callExport(format, workspace = mockWorkspace(), queryExtra = {}) {
    stubWorkspace(workspace)
    const mock = createMockRes()
    const req = {
      user: { id: 'user-1', _id: 'user-1' },
      params: { designSystemId: 'ds-1' },
      query: { format, bundle: '1', ...queryExtra },
    }

    // Wait until either json response or zip stream finishes (archive.finalize).
    const done = new Promise((resolve) => {
      const check = () => {
        if (mock.json || mock.getBuffer().length > 0) resolve()
      }
      const timer = setInterval(() => {
        check()
        if (mock.headers['content-type']?.includes('zip') && mock.getBuffer().length > 100) {
          // give finalize a moment
        }
      }, 20)
      // Patch finalize completion: watch for archive end by wrapping res.end/write
      const origWrite = mock.res.write.bind(mock.res)
      mock.res.write = (chunk) => {
        const ok = origWrite(chunk)
        // Heuristic: after some data, resolve shortly
        setTimeout(resolve, 50)
        return ok
      }
      const origJson = mock.res.json.bind(mock.res)
      mock.res.json = (payload) => {
        const r = origJson(payload)
        clearInterval(timer)
        resolve()
        return r
      }
      setTimeout(() => {
        clearInterval(timer)
        resolve()
      }, 15000)
    })

    await exportTokens(req, mock.res)
    await done
    // Allow archiver finalize to flush
    await new Promise((r) => setTimeout(r, 100))
    return mock
  }

  it('CSS export serializes all seven basic types without [object Object]', async () => {
    const mock = await callExport('css')
    assert.equal(mock.statusCode, 200, JSON.stringify(mock.json))
    assert.match(mock.headers['content-type'] || '', /zip/)
    const files = await unzipStrings(mock.getBuffer())
    const cssFiles = Object.entries(files).filter(([k]) => k.endsWith('.css'))
    assert.ok(cssFiles.length > 0, `expected css in zip, got ${Object.keys(files)}`)
    const css = cssFiles.map(([, v]) => v).join('\n')
    assert.doesNotMatch(css, /\[object Object\]/)
    assert.match(css, /--spacing-sm:\s*8px;/)
    assert.match(css, /--spacing-rem-md:\s*1rem;/)
    assert.match(css, /--motion-duration-fast:\s*150ms;/)
    assert.match(css, /--motion-duration-slow:\s*0\.3s;/)
    assert.match(css, /--motion-easing-standard:\s*cubic-bezier\(0\.4, 0, 0\.2, 1\);/)
    assert.match(css, /--colors-black:\s*#000000;/i)
    assert.match(css, /--font-family-sans:/)
    assert.match(css, /--font-weight-bold:\s*700;/)
    assert.match(css, /--scale-ratio:\s*1\.25;/)
  })

  it('canonical JSON export preserves structured dimension/duration objects', async () => {
    const mock = await callExport('json')
    assert.equal(mock.statusCode, 200, JSON.stringify(mock.json))
    const files = await unzipStrings(mock.getBuffer())
    const jsonFiles = Object.entries(files).filter(([k]) => k.endsWith('.json'))
    assert.ok(jsonFiles.length > 0)
    const blob = jsonFiles.map(([, v]) => v).join('\n')
    assert.match(blob, /"unit":\s*"px"/)
    assert.match(blob, /"unit":\s*"ms"/)
    assert.match(blob, /"aliasSm"/)
    assert.doesNotMatch(blob, /\[object Object\]/)
  })

  it('uses token-manager transform groups in runtime SD config', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'))
    const json = path.join(dir, 't.json')
    fs.writeFileSync(json, '{}')
    for (const format of ['css', 'tailwind', 'swift', 'android', 'scss']) {
      const cfg = createSdConfig(format, json, path.join(dir, format))
      const platform = Object.values(cfg.platforms)[0]
      assert.match(
        platform.transformGroup,
        /^token-manager\//,
        `${format} must use token-manager/* group`,
      )
      assert.ok(
        cfg.hooks.transformGroups[platform.transformGroup],
        `${format} group must be registered in hooks`,
      )
    }
  })

  it('returns JSON 400 (no ZIP) when platform prep/guard rejects object values', async () => {
    const bad = {
      spacing: {
        $type: 'dimension',
        bad: { $value: { value: 8, unit: 'em' } },
      },
    }
    const mock = await callExport('css', mockWorkspace(bad))
    assert.equal(mock.statusCode, 400, JSON.stringify(mock.json))
    assert.equal(mock.json?.ok, false)
    assert.ok(
      Array.isArray(mock.json?.errors) && mock.json.errors.length > 0,
      'expected structured export errors',
    )
    assert.ok(
      !String(mock.headers['content-type'] || '').includes('zip'),
      'must not start a ZIP download on failure',
    )
    assert.equal(mock.getBuffer().length, 0)
  })

  it('final-output guard rejects intentionally untransformed object CSS', async () => {
    const { assertNoRawObjectExportValues } = await import(
      '../../utils/sd/exportGuard.js'
    )
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-int-'))
    const file = path.join(dir, 'tokens.css')
    fs.writeFileSync(
      file,
      ':root { --spacing-sm: [object Object]; --motion-fast: [object Object]; }\n',
    )
    const guard = assertNoRawObjectExportValues({
      format: 'css',
      allTokens: [],
      outputFilePaths: [file],
    })
    assert.equal(guard.ok, false)
    assert.equal(guard.errors[0].code, 'EXPORT_OBJECT_STRINGIFIED')
  })

  it('tailwind / android / swift exports succeed without [object Object]', async () => {
    for (const format of ['tailwind', 'swift']) {
      const mock = await callExport(format)
      assert.equal(mock.statusCode, 200, `${format}: ${JSON.stringify(mock.json)}`)
      const files = await unzipStrings(mock.getBuffer())
      const text = Object.values(files).join('\n')
      assert.doesNotMatch(text, /\[object Object\]/, format)
    }
    const android = await callExport('android', mockWorkspace(), { remBasePx: 16 })
    assert.equal(android.statusCode, 200, JSON.stringify(android.json))
    const afiles = await unzipStrings(android.getBuffer())
    assert.doesNotMatch(Object.values(afiles).join('\n'), /\[object Object\]/)
  })
})
