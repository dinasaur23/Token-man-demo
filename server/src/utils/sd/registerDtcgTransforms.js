/**
 * Register DTCG serializers on the Style Dictionary class (and optionally an
 * instance) so transformGroup lookups never depend solely on config.hooks
 * deep-merge timing.
 */

import StyleDictionary from 'style-dictionary'
import { dtcgTransformGroups, dtcgTransforms } from './dtcgTransforms.js'

let registered = false

/**
 * Idempotent class-level registration of token-manager transforms/groups.
 */
export function ensureDtcgTransformsRegistered() {
  if (registered) return

  for (const [name, transform] of Object.entries(dtcgTransforms)) {
    StyleDictionary.registerTransform({ name, ...transform })
  }
  for (const [name, transforms] of Object.entries(dtcgTransformGroups)) {
    StyleDictionary.registerTransformGroup({ name, transforms })
  }

  registered = true
}

/**
 * @param {import('style-dictionary').default} [sd]
 */
export function registerDtcgTransformsOnInstance(sd) {
  ensureDtcgTransformsRegistered()
  if (!sd || typeof sd.registerTransform !== 'function') return
  for (const [name, transform] of Object.entries(dtcgTransforms)) {
    sd.registerTransform({ name, ...transform })
  }
  for (const [name, transforms] of Object.entries(dtcgTransformGroups)) {
    sd.registerTransformGroup({ name, transforms })
  }
}

export function __resetDtcgTransformRegistrationForTests() {
  registered = false
}
