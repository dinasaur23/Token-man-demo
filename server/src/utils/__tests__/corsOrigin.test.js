/**
 * CORS origin allowlist regression tests.
 * Run: node --test src/utils/__tests__/corsOrigin.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FIGMA_PLUGIN_UI_ORIGIN,
  LOCAL_CLIENT_ORIGIN,
  corsOriginDelegate,
  isAllowedCorsOrigin,
} from '../corsOrigin.js'

describe('isAllowedCorsOrigin', () => {
  it('allows missing origin (no Origin header)', () => {
    assert.equal(isAllowedCorsOrigin(undefined), true)
    assert.equal(isAllowedCorsOrigin(null), true)
    assert.equal(isAllowedCorsOrigin(''), true)
  })

  it('allows localhost Vite frontend', () => {
    assert.equal(isAllowedCorsOrigin(LOCAL_CLIENT_ORIGIN), true)
    assert.equal(isAllowedCorsOrigin('http://localhost:5173'), true)
  })

  it('allows production / vercel.app frontend origins via URL hostname', () => {
    assert.equal(
      isAllowedCorsOrigin('https://token-manager-ecru.vercel.app'),
      true,
    )
    assert.equal(isAllowedCorsOrigin('https://my-app.vercel.app'), true)
    assert.equal(isAllowedCorsOrigin('http://preview.vercel.app'), true)
  })

  it('allows Figma plugin UI null origin (literal string "null")', () => {
    assert.equal(isAllowedCorsOrigin(FIGMA_PLUGIN_UI_ORIGIN), true)
    assert.equal(isAllowedCorsOrigin('null'), true)
  })

  it('rejects arbitrary third-party origins', () => {
    assert.equal(isAllowedCorsOrigin('https://evil.example.com'), false)
    assert.equal(isAllowedCorsOrigin('http://localhost:3000'), false)
    assert.equal(isAllowedCorsOrigin('https://figma.com'), false)
    assert.equal(isAllowedCorsOrigin('null.evil.com'), false)
  })

  it('rejects spoofed vercel.app suffix without valid URL hostname', () => {
    assert.equal(
      isAllowedCorsOrigin('https://evil.example.com/.vercel.app'),
      false,
    )
    assert.equal(
      isAllowedCorsOrigin('https://evil.example.com?x=.vercel.app'),
      false,
    )
    assert.equal(isAllowedCorsOrigin('not-a-url.vercel.app'), false)
  })
})

describe('corsOriginDelegate', () => {
  it('calls back true for allowed origins without throwing', () => {
    for (const origin of [
      undefined,
      LOCAL_CLIENT_ORIGIN,
      'https://token-manager-ecru.vercel.app',
      'null',
    ]) {
      let allowed
      corsOriginDelegate(origin, (err, allow) => {
        assert.equal(err, null)
        allowed = allow
      })
      assert.equal(allowed, true)
    }
  })

  it('calls back false for rejected origins (no Error throw)', () => {
    let errOut = 'unset'
    let allowed = 'unset'
    corsOriginDelegate('https://evil.example.com', (err, allow) => {
      errOut = err
      allowed = allow
    })
    assert.equal(errOut, null)
    assert.equal(allowed, false)
  })
})
