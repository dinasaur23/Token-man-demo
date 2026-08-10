/**
 * TokenTableComponent toolbar layout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

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

describe('TokenTableComponent toolbar', () => {
  const globalStubs = {
    AgGridVue: true,
    VFileInput: true,
    VBtn: { template: '<button><slot /></button>' },
    VIcon: true,
    VTooltip: { template: '<div><slot /><slot name="activator" :props="{}" /></div>' },
    VSpacer: { template: '<span data-testid="toolbar-spacer" />' },
    VTreeview: true,
    VRow: { template: '<div><slot /></div>' },
    VCol: { template: '<div><slot /></div>' },
    VAlert: true,
    VDialog: true,
    VCard: true,
    VCardTitle: true,
    VCardText: true,
    VCardActions: true,
    VTextField: true,
    VAutocomplete: true,
    VChip: { template: '<span><slot /></span>' },
    VSelect: true,
  }

  beforeEach(() => {
    mockState.canAddToken.value = false
    mockState.hasWorkspaceFiles.value = true
    mockState.activeSourceFileName.value = 'MyBrand.json'
    mockState.tokenSetFileNames.value = ['MyBrand.json']
    mockState.hasMultipleTokenSets.value = false
    mockState.activeTokenSetDisplayName.value = 'MyBrand.json'
    mockState.tokenType.value = 'color'
  })

  it('shows active token set name in global toolbar', () => {
    const wrapper = mount(TokenTableComponent, { global: { stubs: globalStubs } })
    const globalToolbar = wrapper.find('[data-testid="global-toolbar"]')
    expect(globalToolbar.exists()).toBe(true)
    expect(wrapper.find('[data-testid="active-token-set"]').text()).toContain('MyBrand.json')
  })

  it('shows empty state when no token set exists', () => {
    mockState.hasWorkspaceFiles.value = false
    const wrapper = mount(TokenTableComponent, { global: { stubs: globalStubs } })
    expect(wrapper.find('[data-testid="token-set-empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="global-toolbar"]').exists()).toBe(false)
    const groupToolbar = wrapper.find('[data-testid="group-toolbar"]')
    expect(groupToolbar.exists() ? groupToolbar.isVisible() : false).toBe(false)
  })

  it('shows type context header with registry label', () => {
    const wrapper = mount(TokenTableComponent, { global: { stubs: globalStubs } })
    const header = wrapper.find('[data-testid="type-context-header"]')
    expect(header.exists()).toBe(true)
    expect(header.text()).toContain('Token set: MyBrand.json')
    expect(header.text()).toContain('Color tokens')
  })

  it('preserves active token set when token type changes', async () => {
    mockState.tokenType.value = 'color'
    const wrapper = mount(TokenTableComponent, {
      props: { tokenType: 'color' },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('[data-testid="active-token-set"]').text()).toContain('MyBrand.json')
    mockState.tokenType.value = 'dimension'
    await wrapper.setProps({ tokenType: 'dimension' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="active-token-set"]').text()).toContain('MyBrand.json')
    expect(wrapper.find('[data-testid="type-context-header"]').text()).toContain('Dimension tokens')
  })

  it('places New token set in global toolbar, not group toolbar', () => {
    const wrapper = mount(TokenTableComponent, { global: { stubs: globalStubs } })
    expect(wrapper.find('[data-testid="global-toolbar"]').text()).toContain('New token set')
    expect(wrapper.find('[data-testid="group-toolbar"]').text()).not.toContain('New token set')
  })

  it('renders export dialog stub in global toolbar', () => {
    const wrapper = mount(TokenTableComponent, { global: { stubs: globalStubs } })
    expect(wrapper.find('[data-testid="export-dialog-stub"]').exists()).toBe(true)
  })

  it('renders New token in the right-side action area with a spacer between group buttons', () => {
    const wrapper = mount(TokenTableComponent, {
      global: {
        stubs: globalStubs,
      },
    })

    const toolbar = wrapper.find('[data-testid="group-toolbar"]')
    expect(toolbar.exists()).toBe(true)
    expect(toolbar.find('[data-testid="toolbar-spacer"]').exists()).toBe(true)
    expect(toolbar.text()).toContain('Child group')
    expect(toolbar.text()).toContain('New group')
    expect(wrapper.find('[data-testid="new-token-action"]').exists()).toBe(true)
    expect(toolbar.text()).toContain('New token')
  })

  it('disables New token when no group is selected', () => {
    mockState.canAddToken.value = false

    const wrapper = mount(TokenTableComponent, {
      global: {
        stubs: {
          ...globalStubs,
          VBtn: {
            props: ['disabled'],
            template: '<button :disabled="disabled"><slot /></button>',
          },
          VSpacer: true,
        },
      },
    })

    const newTokenBtn = wrapper.find('[data-testid="new-token-action"] button')
    expect(newTokenBtn.attributes('disabled')).toBeDefined()
  })
})
