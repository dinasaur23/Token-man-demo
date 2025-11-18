import { defineStore } from 'pinia'

export interface TokenFileDto {
  name: string
  content: unknown
}

export interface TokenWorkspaceDto {
  files: TokenFileDto[]
  modifiers: Record<string, string>
  overrides: Record<string, unknown>
}

interface TokenWorkspaceState {
  files: TokenFileDto[]
  modifiers: Record<string, string>
  overrides: Record<string, unknown>
  loaded: boolean
}

export const useTokenWorkspaceStore = defineStore('tokenWorkspace', {
  state: (): TokenWorkspaceState => ({
    files: [] as TokenFileDto[],
    modifiers: {} as Record<string, string>,
    overrides: {} as Record<string, unknown>,
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
