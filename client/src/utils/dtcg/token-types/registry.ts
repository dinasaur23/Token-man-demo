import { APPLICATION_SUPPORTED_TYPES } from '../token-type-manifest'
import { colorTokenTypeDefinition } from './color'
import { cubicBezierTokenTypeDefinition } from './cubicBezier'
import { dimensionTokenTypeDefinition } from './dimension'
import { durationTokenTypeDefinition } from './duration'
import { fontFamilyTokenTypeDefinition } from './fontFamily'
import { fontWeightTokenTypeDefinition } from './fontWeight'
import { numberTokenTypeDefinition } from './number'
import type { TokenTypeDefinition, TokenTypeId } from './types'

export type {
  TokenTypeDefinition,
  TokenTypeId,
  TokenValidationIssue,
  TokenValueValidationResult,
} from './types'

/**
 * Registry of application-supported token types.
 * All seven basic DTCG types are registered.
 */
const registeredDefinitions: Partial<Record<TokenTypeId, TokenTypeDefinition>> = {
  color: colorTokenTypeDefinition,
  dimension: dimensionTokenTypeDefinition,
  number: numberTokenTypeDefinition,
  duration: durationTokenTypeDefinition,
  fontFamily: fontFamilyTokenTypeDefinition,
  fontWeight: fontWeightTokenTypeDefinition,
  cubicBezier: cubicBezierTokenTypeDefinition,
}

export function getRegisteredTokenTypeIds(): TokenTypeId[] {
  return (Object.keys(registeredDefinitions) as TokenTypeId[]).filter(
    (id) => registeredDefinitions[id] !== undefined,
  )
}

/** Registered type definitions for registry-driven UI nav. */
export function getRegisteredTokenTypeDefinitions(): TokenTypeDefinition[] {
  return getRegisteredTokenTypeIds()
    .map((id) => registeredDefinitions[id])
    .filter((def): def is TokenTypeDefinition => def !== undefined)
}

/** Resolve a route `:tokenType` / navPath segment to a registered definition. */
export function getTokenTypeDefinitionByNavPath(
  navPath: string,
): TokenTypeDefinition | undefined {
  return getRegisteredTokenTypeDefinitions().find((def) => def.navPath === navPath)
}

export function getTokenTypeDefinition(id: string): TokenTypeDefinition | undefined {
  if (!(APPLICATION_SUPPORTED_TYPES as readonly string[]).includes(id)) return undefined
  return registeredDefinitions[id as TokenTypeId]
}

export function requireTokenTypeDefinition(id: TokenTypeId): TokenTypeDefinition {
  const def = registeredDefinitions[id]
  if (!def) {
    throw new Error(`Token type "${id}" is not registered yet`)
  }
  return def
}

export function isRegisteredTokenType(id: string): boolean {
  return getTokenTypeDefinition(id) !== undefined
}
