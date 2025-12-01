<template>
  <ColorTableComponent />
</template>

<script lang="ts" setup>
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import ColorTableComponent from '@/components/ColorTableComponent.vue'
import { useTokenWorkspaceStore } from '@/stores/TokenWorkspace'
import { useDesignSystemStore } from '@/stores/DesignSystem'
const router = useRouter()
const wsStore = useTokenWorkspaceStore()
const dsStore = useDesignSystemStore()

onMounted(async () => {
  if (!dsStore.currentId) {
    console.warn('[ColorContentPage] No design system selected – redirecting')
    await router.push({ name: 'start' })
    return
  }

  console.log('[ColorContentPage] loading workspace for designSystemId', dsStore.currentId)

  wsStore.setDesignSystemId(dsStore.currentId)
  await wsStore.loadFromServer()
})
watch(
  () => dsStore.currentId,
  async (newId, oldId) => {
    if (!newId || newId === oldId) return

    console.log('[ColorContentPage] design system changed', oldId, '→', newId)

    wsStore.resetForDesignSystem(newId)
    await wsStore.loadFromServer()
    // the table will now resync because workspaceStore.files changed
  },
)
</script>
