<template>
  <ColorTableComponent />
</template>

<script lang="ts" setup>
import { onMounted } from 'vue'
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
</script>
