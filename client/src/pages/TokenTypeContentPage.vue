<template>
  <TokenTableComponent :token-type="resolvedTokenType" />
</template>

<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TokenTableComponent from '@/components/TokenTableComponent.vue'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import { useDesignSystemStore } from '@/stores/DesignSystem'
import {
  getTokenTypeDefinitionByNavPath,
  type TokenTypeId,
} from '@/utils/dtcg/token-types'

const route = useRoute()
const router = useRouter()
const wsStore = useTokenWorkspaceStore()
const dsStore = useDesignSystemStore()

const resolvedTokenType = computed<TokenTypeId>(() => {
  const segment = String(route.params.tokenType ?? 'color')
  const def = getTokenTypeDefinitionByNavPath(segment)
  return def?.id ?? 'color'
})

onMounted(async () => {
  if (!dsStore.currentId) {
    console.warn('[TokenTypeContentPage] No design system selected – redirecting')
    await router.push({ name: 'start' })
    return
  }

  const segment = String(route.params.tokenType ?? '')
  if (!getTokenTypeDefinitionByNavPath(segment)) {
    await router.replace({ name: 'token-type', params: { tokenType: 'color' } })
    return
  }

  console.log('[TokenTypeContentPage] loading workspace for designSystemId', dsStore.currentId)

  wsStore.setDesignSystemId(dsStore.currentId)
  await wsStore.loadFromServer()
})

watch(
  () => dsStore.currentId,
  async (newId, oldId) => {
    if (!newId || newId === oldId) return

    console.log('[TokenTypeContentPage] design system changed', oldId, '→', newId)

    wsStore.resetForDesignSystem(newId)
    await wsStore.loadFromServer()
  },
)

watch(
  () => route.params.tokenType,
  async (segment) => {
    const path = String(segment ?? '')
    if (path && !getTokenTypeDefinitionByNavPath(path)) {
      await router.replace({ name: 'token-type', params: { tokenType: 'color' } })
    }
  },
)
</script>
