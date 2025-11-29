import { defineStore } from 'pinia'
import { useDesignSystemStore } from './DesignSystem'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export interface TokenFileDto {
  name: string
  content: unknown
}

export interface TokenWorkspaceDto {
  files: TokenFileDto[]
  modifiers: Record<string, string>
  overrides: Record<string, unknown>
  nameOverrides: Record<string, string>
  addedRows: unknown[]
  deletedPaths: string[]
  rowOrder: string[]
}

interface TokenWorkspaceState {
  files: TokenFileDto[]
  modifiers: Record<string, string>
  overrides: Record<string, unknown>
  nameOverrides: Record<string, string>
  addedRows: unknown[]
  deletedPaths: string[]
  rowOrder: string[]
  loaded: boolean
  currentDesignSystemId: string | null
}
function buildWorkspaceUrl(designSystemId: string | null): string {
  if (!designSystemId) {
    return '/api/tokens/workspace'
  }
  const encoded = encodeURIComponent(designSystemId)
  return `/api/tokens/workspace?designSystemId=${encoded}`
}

export const useTokenWorkspaceStore = defineStore('tokenWorkspace', {
  state: (): TokenWorkspaceState => ({
    files: [] as TokenFileDto[],
    modifiers: {} as Record<string, string>,
    overrides: {} as Record<string, unknown>,
    nameOverrides: {} as Record<string, string>,
    addedRows: [],
    deletedPaths: [],
    rowOrder: [],
    loaded: false,
    currentDesignSystemId: null,
  }),

  actions: {
    setDesignSystemId(id: string | null) {
      console.log('[WS] setDesignSystemId', id)
      this.currentDesignSystemId = id
    },
    resetForDesignSystem(designSystemId: string | null): void {
      console.log('[WS] resetForDesignSystem', designSystemId)
      this.currentDesignSystemId = designSystemId
      this.files = []
      this.modifiers = {}
      this.overrides = {}
      this.nameOverrides = {}
      this.addedRows = []
      this.deletedPaths = []
      this.rowOrder = []
      this.loaded = false
    },
    async loadFromServer(): Promise<void> {
      try {
        const designSystemStore = useDesignSystemStore()
        const designSystemId = designSystemStore.currentId ?? null
        this.currentDesignSystemId = designSystemId

        const url = buildWorkspaceUrl(designSystemId)
        console.log('[WS] loadFromServer url =', url)
        const res = await fetch(url, {
          method: 'GET',
          credentials: 'include',
        })

        console.log('GET', url, 'status', res.status)

        if (!res.ok) {
          this.loaded = true
          return
        }

        const data = (await res.json()) as TokenWorkspaceDto

        this.files = Array.isArray(data.files) ? data.files : []
        this.modifiers = data.modifiers ?? {}
        this.overrides = data.overrides ?? {}
        this.nameOverrides = data.nameOverrides ?? {}
        this.addedRows = Array.isArray(data.addedRows) ? data.addedRows : []
        this.deletedPaths = Array.isArray(data.deletedPaths) ? data.deletedPaths : []
        this.rowOrder = Array.isArray(data.rowOrder) ? data.rowOrder : []

        const cleaned: Record<string, string> = {}
        const hexPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

        for (const [key, value] of Object.entries(this.nameOverrides)) {
          if (typeof value === 'string' && !hexPattern.test(value)) {
            cleaned[key] = value
          }
        }

        this.nameOverrides = cleaned

        this.loaded = true
      } catch (err) {
        console.error('loadFromServer failed', err)
        this.loaded = true
      }
    },

    async saveToServer(): Promise<void> {
      try {
        const designSystemStore = useDesignSystemStore()
        const designSystemId = designSystemStore.currentId ?? this.currentDesignSystemId ?? null

        if (!designSystemId) {
          console.warn('saveToServer: no design system selected')
          return
        }
        this.currentDesignSystemId = designSystemId
        const url = buildWorkspaceUrl(designSystemId)
        console.log('[WS] saveToServer url =', url)

        const payload: TokenWorkspaceDto = {
          files: this.files,
          modifiers: this.modifiers,
          overrides: this.overrides,
          nameOverrides: this.nameOverrides,
          addedRows: this.addedRows,
          deletedPaths: this.deletedPaths,
          rowOrder: this.rowOrder,
        }

        const res = await fetch(url, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        console.log('PUT', url, 'status', res.status)
      } catch (err) {
        console.error('saveToServer failed', err)
      }
    },
  },
})
