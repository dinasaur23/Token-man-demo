import { defineStore } from 'pinia'
import axios from 'axios'
const STORAGE_KEY = 'tm-current-design-system'

const API_URL = import.meta.env.VITE_API_URL

interface DesignSystemDto {
  id?: string
  _id?: string
  name: string
  createdAt?: string
  updatedAt?: string
}

interface ListResponse {
  ok: boolean
  stage: string
  items: DesignSystemDto[]
}

interface CreateResponse {
  ok: boolean
  stage: string
  item: DesignSystemDto
}

interface UpdateResponse {
  ok: boolean
  stage: string
  item: DesignSystemDto
}

interface DeleteResponse {
  ok: boolean
  stage: string
  message?: string
}

export interface DesignSystem {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

interface DesignSystemState {
  items: DesignSystem[]
  currentId: string | null
  loading: boolean
  error: string | null
}

function mapDto(dto: DesignSystemDto): DesignSystem {
  const id = dto.id ?? dto._id
  if (!id) {
    throw new Error('DesignSystemDto is missing id/_id')
  }
  return {
    id,
    name: dto.name,
    createdAt: dto.createdAt ?? '',
    updatedAt: dto.updatedAt ?? '',
  }
}

export const useDesignSystemStore = defineStore('designSystem', {
  state: (): DesignSystemState => ({
    items: [],
    currentId: localStorage.getItem(STORAGE_KEY),
    loading: false,
    error: null,
  }),

  getters: {
    current(state): DesignSystem | null {
      return state.items.find((ds) => ds.id === state.currentId) ?? null
    },
  },

  actions: {
    setCurrent(id: string | null) {
      this.currentId = id
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
    },

    async fetchAll(): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const { data } = await axios.get<ListResponse>(`${API_URL}/api/design-systems`, {
          withCredentials: true,
        })

        const items = Array.isArray(data.items) ? data.items.map(mapDto) : []
        this.items = items

        if (!this.currentId && items.length > 0) {
          this.setCurrent(items[0].id)
        }
      } catch (err) {
        console.error('fetchAll design systems failed', err)
        const message =
          axios.isAxiosError(err) && err.response?.data?.message
            ? String(err.response.data.message)
            : 'Failed to load design systems'
        this.error = message
      } finally {
        this.loading = false
      }
    },

    async create(name: string): Promise<DesignSystem> {
      const trimmed = name.trim()
      if (!trimmed) {
        throw new Error('Name is required')
      }

      const { data } = await axios.post<CreateResponse>(
        `${API_URL}/api/design-systems`,
        { name: trimmed },
        { withCredentials: true },
      )

      const created = mapDto(data.item)
      this.items.push(created)
      this.setCurrent(created.id)
      return created
    },
    async rename(id: string, name: string): Promise<void> {
      const trimmed = name.trim()
      if (!trimmed) {
        throw new Error('Name is required')
      }

      const { data } = await axios.patch<UpdateResponse>(
        `${API_URL}/api/design-systems/${id}`,
        { name: trimmed },
        { withCredentials: true },
      )

      const updated = mapDto(data.item)
      const idx = this.items.findIndex((ds) => ds.id === id)
      if (idx !== -1) {
        this.items[idx] = updated
      }
    },
    async remove(id: string): Promise<void> {
      await axios.delete<DeleteResponse>(`${API_URL}/api/design-systems/${id}`, {
        withCredentials: true,
      })

      this.items = this.items.filter((ds) => ds.id !== id)

      if (this.currentId === id) {
        const next = this.items[0]?.id ?? null
        this.setCurrent(next)
      }
    },
  },
})
