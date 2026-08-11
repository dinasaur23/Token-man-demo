/**
 * Figma import help dialog + empty/global entry points.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import FigmaImportHelpDialog from '../FigmaImportHelpDialog.vue'

const { mockState } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require('vue') as typeof import('vue')
  return {
    mockState: {
      tokenType: ref('color'),
      files: ref<File[] | null>(null),
      rows: ref([]),
      errorMessage: ref<string | null>(null),
      activeNodeIds: ref<string[]>(['primary']),
      activeGroupId: ref<string | null>('primary'),
      hasWorkspaceFiles: ref(true),
      hasAnyTokens: ref(false),
      activeSourceFileName: ref('MyBrand.json'),
      tokenSetFileNames: ref(['MyBrand.json']),
      hasMultipleTokenSets: ref(false),
      activeTokenSetDisplayName: ref('MyBrand.json'),
      onActiveTokenSetChange: vi.fn(),
      canAddToken: ref(false),
      uiSelectedModifiers: ref({}),
      groupTreeItems: ref([{ id: 'primary', title: 'primary' }]),
      filteredRows: ref([]),
      rowsOfSelectedType: ref([]),
      showTypeEmptyState: ref(false),
      showWorkspaceEmptyHint: ref(false),
      groupScopedModifierName: ref(null),
      modeOptionsForActiveGroup: ref<string[]>([]),
      visibleModifiers: ref([]),
      groupHasModes: ref(false),
      onFileChange: vi.fn(),
      onModifierChange: vi.fn(),
      onGridReady: vi.fn(),
      onModelUpdated: vi.fn(),
      onGridSelectionChanged: vi.fn(),
      addGroupDialog: ref(false),
      newGroupName: ref(''),
      currentParentGroupId: ref<string | null>(null),
      showAddSiblingDialog: ref(false),
      newSiblingGroupName: ref(''),
      openAddSiblingGroupDialog: vi.fn(),
      confirmAddSiblingGroup: vi.fn(),
      openAddGroupDialog: vi.fn(),
      confirmAddGroup: vi.fn(),
      onAddChildGroup: vi.fn(),
      onDeleteGroup: vi.fn(),
      addTokenDialog: ref(false),
      newTokenName: ref(''),
      currentTokenGroupId: ref<string | null>(null),
      confirmAddTokenInGroup: vi.fn(),
      addAliasDialog: ref(false),
      aliasSourcePath: ref(''),
      currentAliasRow: ref(null),
      aliasErrorMessage: ref<string | null>(null),
      aliasOptions: ref([]),
      confirmAliasForRow: vi.fn(),
      menu: ref(false),
      onActionButtonClick: vi.fn(),
      addRowBelow: vi.fn(),
      duplicateRow: vi.fn(),
      deleteRow: vi.fn(),
      closeMenu: vi.fn(),
      convertRowToAlias: vi.fn(),
      clearAliasForRow: vi.fn(),
      canConvertToAlias: vi.fn(),
      updateTokenValueAny: vi.fn(),
      editingGroupId: ref<string | null>(null),
      editingGroupName: ref(''),
      startRenameGroup: vi.fn(),
      confirmRenameGroup: vi.fn(),
      cancelRenameGroup: vi.fn(),
      onNewTokenClick: vi.fn(),
      showNewTokenSetDialog: ref(false),
      newTokenSetName: ref(''),
      newTokenSetError: ref<string | null>(null),
      openNewTokenSetDialog: vi.fn(),
      confirmNewTokenSet: vi.fn(),
    },
  }
})

vi.mock('../TokenExportDialog.vue', () => ({
  default: { template: '<div data-testid="export-dialog-stub" />' },
}))

vi.mock('@/composables/useTokenTableComponent', () => ({
  useTokenTableComponent: () => mockState,
}))

vi.mock('@/composables/useTokenGridColumns', () => ({
  useTokenGridColumns: () => ({ columnDefs: ref([]) }),
}))

vi.mock('@/stores/TokenWorkspace', () => ({
  useTokenWorkspaceStore: () => ({ groupNameOverrides: {} }),
}))

import TokenTableComponent from '../TokenTableComponent.vue'

const dialogStubs = {
  AgGridVue: true,
  VFileInput: {
    props: ['label', 'modelValue'],
    template:
      '<div data-testid="file-input-stub">{{ label }}</div>',
  },
  VBtn: {
    props: ['disabled'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
  VIcon: true,
  VTooltip: { template: '<div><slot /><slot name="activator" :props="{}" /></div>' },
  VSpacer: { template: '<span data-testid="toolbar-spacer" />' },
  VTreeview: true,
  VRow: { template: '<div><slot /></div>' },
  VCol: { template: '<div><slot /></div>' },
  VAlert: { template: '<div><slot /></div>' },
  VDialog: {
    props: ['modelValue'],
    inheritAttrs: false,
    template:
      '<div v-if="modelValue" data-testid="figma-import-help-dialog"><slot /></div>',
  },
  VCard: { template: '<div><slot /></div>' },
  VCardTitle: { template: '<div><slot /></div>' },
  VCardText: { template: '<div><slot /></div>' },
  VCardActions: { template: '<div><slot /></div>' },
  VTextField: true,
  VAutocomplete: true,
  VChip: { template: '<span><slot /></span>' },
  VSelect: true,
  VExpansionPanels: { template: '<div><slot /></div>' },
  VExpansionPanel: { template: '<div><slot /></div>' },
  VExpansionPanelTitle: { template: '<div><slot /></div>' },
  VExpansionPanelText: { template: '<div><slot /></div>' },
}

describe('FigmaImportHelpDialog', () => {
  it('lists supported types including Duration and Cubic Bézier', async () => {
    const wrapper = mount(FigmaImportHelpDialog, {
      global: { stubs: dialogStubs },
    })

    await wrapper.find('[data-testid="import-from-figma-btn"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="figma-import-help-dialog"]').exists()).toBe(
      true,
    )
    const supported = wrapper.find('[data-testid="figma-supported-types"]').text()
    expect(supported).toContain('Color')
    expect(supported).toContain('Dimension')
    expect(supported).toContain('Number')
    expect(supported).toContain('Font Family')
    expect(supported).toContain('Font Weight')
    expect(supported).toContain('Duration')
    expect(supported).toContain('Cubic Bézier')

    const unsupported = wrapper
      .find('[data-testid="figma-unsupported-types"]')
      .text()
    expect(unsupported).toContain('Boolean')
    expect(unsupported).toContain('Spring easing')
    expect(unsupported).toContain('Easing presets')
    expect(unsupported).not.toContain('Duration')

    expect(wrapper.find('[data-testid="figma-dimension-px-note"]').text()).toContain(
      'imported as px',
    )
  })
})

describe('TokenTableComponent Figma import entry points', () => {
  beforeEach(() => {
    mockState.hasWorkspaceFiles.value = true
    mockState.activeSourceFileName.value = 'MyBrand.json'
    mockState.tokenSetFileNames.value = ['MyBrand.json']
    mockState.hasMultipleTokenSets.value = false
    mockState.activeTokenSetDisplayName.value = 'MyBrand.json'
    mockState.tokenType.value = 'color'
  })

  it('empty state mentions Figma and shows three import entry points', () => {
    mockState.hasWorkspaceFiles.value = false
    const wrapper = mount(TokenTableComponent, {
      global: { stubs: dialogStubs },
    })

    const empty = wrapper.find('[data-testid="token-set-empty-state"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('sync variables from Figma')
    expect(empty.text()).toContain('Import tokens')
    expect(wrapper.find('[data-testid="empty-state-json-input"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="empty-state-new-token-set"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="import-from-figma-btn"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-testid="global-toolbar"]').exists()).toBe(false)
  })

  it('opens Figma help dialog from empty state', async () => {
    mockState.hasWorkspaceFiles.value = false
    const wrapper = mount(TokenTableComponent, {
      global: { stubs: dialogStubs },
    })

    await wrapper.find('[data-testid="import-from-figma-btn"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Import from Figma')
    expect(wrapper.text()).toContain('Token Manager Sync')
    expect(wrapper.find('[data-testid="figma-supported-types"]').exists()).toBe(
      true,
    )
  })

  it('non-empty workspace keeps Figma import beside New token set and Export', () => {
    const wrapper = mount(TokenTableComponent, {
      global: { stubs: dialogStubs },
    })

    const toolbar = wrapper.find('[data-testid="global-toolbar"]')
    expect(toolbar.exists()).toBe(true)
    expect(toolbar.text()).toContain('New token set')
    expect(toolbar.find('[data-testid="import-from-figma-btn"]').exists()).toBe(
      true,
    )
    expect(toolbar.find('[data-testid="export-dialog-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="active-token-set"]').text()).toContain(
      'MyBrand.json',
    )
  })

  it('preserves existing token-set and group toolbar actions', () => {
    const wrapper = mount(TokenTableComponent, {
      global: { stubs: dialogStubs },
    })
    expect(wrapper.find('[data-testid="global-toolbar"]').text()).toContain(
      'New token set',
    )
    expect(wrapper.find('[data-testid="group-toolbar"]').text()).not.toContain(
      'New token set',
    )
    expect(wrapper.find('[data-testid="group-toolbar"]').text()).toContain(
      'New token',
    )
    expect(wrapper.find('[data-testid="export-dialog-stub"]').exists()).toBe(true)
  })
})
