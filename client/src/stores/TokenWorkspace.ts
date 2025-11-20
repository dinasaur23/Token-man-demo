import { defineStore } from 'pinia'

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
  }),

  actions: {
    async loadFromServer(): Promise<void> {
      try {
        const res = await fetch('/api/tokens/workspace', {
          method: 'GET',
          credentials: 'include',
        })

        console.log('GET /api/tokens/workspace status', res.status)

        if (!res.ok) {
          this.loaded = true
          return
        }

        const data = (await res.json()) as TokenWorkspaceDto

        this.files = data.files ?? []
        this.modifiers = data.modifiers ?? {}
        this.overrides = data.overrides ?? {}
        this.nameOverrides = data.nameOverrides ?? {}
        this.addedRows = data.addedRows ?? {}
        this.deletedPaths = data.deletedPaths ?? {}
        this.rowOrder = data.rowOrder ?? []

        // 🔧 SANITIZE: drop anything that looks like a hex color from nameOverrides
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
        const payload: TokenWorkspaceDto = {
          files: this.files,
          modifiers: this.modifiers,
          overrides: this.overrides,
          nameOverrides: this.nameOverrides,
          addedRows: this.addedRows,
          deletedPaths: this.deletedPaths,
          rowOrder: this.rowOrder,
        }

        const res = await fetch('/api/tokens/workspace', {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        console.log('PUT /api/tokens/workspace status', res.status)
      } catch (err) {
        console.error('saveToServer failed', err)
      }
    },
  },
})
