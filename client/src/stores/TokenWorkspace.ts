import { defineStore } from 'pinia'
import { useDesignSystemStore } from './DesignSystem'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export interface FigmaModeOptions {
  values: string[]
  default?: string
  groupModes?: Record<string, string[]>
}

export interface FigmaModifierOptions {
  mode?: FigmaModeOptions
}

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
  figmaTokens?: Record<string, unknown>
  figmaModifierOptions?: FigmaModifierOptions
  groupNameOverrides?: Record<string, string>
  scopedModifiers?: Record<string, Record<string, string>>
  modeAddedRows?: Record<string, unknown[]> // key: `${mode}::${groupKey}`
  modeDeletedPaths?: Record<string, string[]>
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
  figmaTokens: Record<string, unknown>
  figmaModifierOptions: FigmaModifierOptions
  groupNameOverrides: Record<string, string>
  scopedModifiers: Record<string, Record<string, string>>
  modeAddedRows: Record<string, unknown[]>
  modeDeletedPaths: Record<string, string[]>
}

const API_URL = import.meta.env.VITE_API_URL
function buildWorkspaceUrl(designSystemId: string | null): string {
  if (!designSystemId) {
    return `${API_URL}/api/tokens/workspace`
  }
  const encoded = encodeURIComponent(designSystemId)
  return `${API_URL}/api/tokens/workspace?designSystemId=${encoded}`
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
    figmaTokens: {},
    figmaModifierOptions: {},
    groupNameOverrides: {} as Record<string, string>,
    scopedModifiers: {},
    modeAddedRows: {} as Record<string, unknown[]>,
    modeDeletedPaths: {} as Record<string, string[]>,
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
      this.figmaTokens = {}
      this.figmaModifierOptions = {}
      this.groupNameOverrides = {}
      this.scopedModifiers = {}
      this.modeAddedRows = {}
      this.modeDeletedPaths = {}
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
          this.files = []
          this.modifiers = {}
          this.scopedModifiers = {}
          this.loaded = true
          return
        }

        const data = (await res.json()) as TokenWorkspaceDto

        // console.log(
        //   '[WorkspaceStore] loadFromServer raw DTO:',
        //   JSON.stringify(data, null, 2).slice(0, 800),
        // )

        this.files = Array.isArray(data.files) ? data.files : []
        this.modifiers = data.modifiers ?? {}
        this.scopedModifiers = data.scopedModifiers ?? {}
        this.overrides = data.overrides ?? {}
        this.nameOverrides = data.nameOverrides ?? {}
        this.addedRows = Array.isArray(data.addedRows) ? data.addedRows : []
        this.deletedPaths = Array.isArray(data.deletedPaths) ? data.deletedPaths : []
        this.rowOrder = Array.isArray(data.rowOrder) ? data.rowOrder : []
        this.figmaTokens = data.figmaTokens ?? {}
        this.figmaModifierOptions = data.figmaModifierOptions ?? {}
        this.groupNameOverrides = data.groupNameOverrides ?? {}
        this.modeAddedRows =
          data.modeAddedRows && typeof data.modeAddedRows === 'object' ? data.modeAddedRows : {}
        this.modeDeletedPaths =
          data.modeDeletedPaths && typeof data.modeDeletedPaths === 'object'
            ? data.modeDeletedPaths
            : {}
        console.log('[WorkspaceStore] after assigning from DTO:', {
          files: this.files.map((f) => f.name),
          modifiers: this.modifiers,
          figmaTokensKeys: Object.keys(this.figmaTokens),
          figmaModifierOptions: this.figmaModifierOptions,
        })

        if (Object.keys(this.figmaTokens).length > 0 && this.files.length === 0) {
          this.files = [
            {
              name: 'figma-sync.json',
              content: this.figmaTokens,
            },
          ]
        }
        // console.log('[WorkspaceStore] loaded files from server:', this.files)

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
          scopedModifiers: this.scopedModifiers,
          overrides: this.overrides,
          nameOverrides: this.nameOverrides,
          addedRows: this.addedRows,
          deletedPaths: this.deletedPaths,
          rowOrder: this.rowOrder,
          groupNameOverrides: this.groupNameOverrides,
          modeAddedRows: this.modeAddedRows,
          modeDeletedPaths: this.modeDeletedPaths,
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
    renameGroup(groupKey: string, newName: string) {
      this.groupNameOverrides[groupKey] = newName
      void this.saveToServer()
    },
  },
})
