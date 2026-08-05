import { APPLICATION_SUPPORTED_TYPES } from '../token-type-manifest'
import { colorTokenTypeDefinition } from './color'
import type { TokenTypeDefinition, TokenTypeId } from './types'

export type {
  TokenTypeDefinition,
  TokenTypeId,
  TokenValidationIssue,
  TokenValueValidationResult,
} from './types'

/**
 * Registry of application-supported token types.
 * Stage: Color only is fully registered; other manifest types are reserved
 * until their implementation stages land.
 */
const registeredDefinitions: Partial<Record<TokenTypeId, TokenTypeDefinition>> = {
  color: colorTokenTypeDefinition,
}

export function getRegisteredTokenTypeIds(): TokenTypeId[] {
  return (Object.keys(registeredDefinitions) as TokenTypeId[]).filter(
    (id) => registeredDefinitions[id] !== undefined,
  )
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
