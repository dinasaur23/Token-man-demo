<template>
  <v-btn
    color="white"
    variant="flat"
    :class="buttonClass"
    data-testid="import-from-figma-btn"
    @click="dialog = true"
  >
    Import from Figma
  </v-btn>

  <v-dialog
    v-model="dialog"
    max-width="560"
    scrollable
    data-testid="figma-import-help-dialog"
  >
    <v-card>
      <v-card-title class="text-h6">Import from Figma</v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-4">
          Use the Token Manager Figma plugin to sync local Figma Variables into
          this design system.
        </p>

        <div class="text-subtitle-2 mb-2">Steps</div>
        <ol class="figma-help-steps text-body-2 mb-5">
          <li>Open your design file in Figma.</li>
          <li>Open Plugins → <strong>Token Manager Sync</strong>.</li>
          <li>
            If needed, open <strong>Token Manager settings</strong> in the
            plugin and select this design system.
          </li>
          <li>Run <strong>Sync Figma Variables</strong>.</li>
          <li>
            Return here and reload the workspace to see imported tokens on their
            type pages (Color, Dimension, Number, and so on).
          </li>
        </ol>

        <div class="text-subtitle-2 mb-2">Supported from Figma</div>
        <ul class="figma-help-list supported mb-2" data-testid="figma-supported-types">
          <li>Color</li>
          <li>Dimension</li>
          <li>Number</li>
          <li>Font Family</li>
          <li>Font Weight</li>
          <li>Duration</li>
          <li>Cubic Bézier (custom cubic-bezier easing)</li>
        </ul>
        <p class="text-caption text-medium-emphasis mb-4" data-testid="figma-dimension-px-note">
          Figma dimensional numeric values are imported as px. Timing values are
          imported as duration in seconds. Only easing values with explicit
          cubic-bezier control points become Cubic Bézier.
        </p>

        <div class="text-subtitle-2 mb-2">Not automatically mapped</div>
        <ul
          class="figma-help-list unsupported mb-2"
          data-testid="figma-unsupported-types"
        >
          <li>Boolean</li>
          <li>Other strings</li>
          <li>Spring easing</li>
          <li>Easing presets without control points</li>
        </ul>
        <p class="text-caption text-medium-emphasis mb-4">
          Named easing presets and springs are skipped unless Figma exposes
          explicit cubic-bezier control points — we never invent them.
        </p>

        <v-expansion-panels variant="accordion" class="figma-help-notes">
          <v-expansion-panel data-testid="figma-import-notes">
            <v-expansion-panel-title class="text-body-2">
              Notes
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <ul class="figma-help-list notes text-body-2">
                <li>Variable aliases are preserved where possible.</li>
                <li>Figma mode data is preserved on import.</li>
                <li>
                  Live mode switching in the Token Manager UI may be limited for
                  some non-alias numeric or object values.
                </li>
              </ul>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-alert type="info" variant="tonal" density="compact" class="mt-4">
          Detailed import counts and skipped variables are shown in the Figma
          plugin after sync.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          data-testid="figma-import-help-close"
          @click="dialog = false"
        >
          Got it
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(
  defineProps<{
    /** Extra classes for the trigger button (empty state vs toolbar). */
    buttonClass?: string
  }>(),
  { buttonClass: '' },
)

const dialog = ref(false)
</script>

<style scoped>
.figma-help-steps {
  margin: 0;
  padding-left: 1.25rem;
  line-height: 1.55;
}

.figma-help-steps li + li {
  margin-top: 0.35rem;
}

.figma-help-list {
  list-style: none;
  margin: 0;
  padding: 0;
  line-height: 1.55;
}

.figma-help-list.supported li::before {
  content: '✓ ';
  color: rgb(var(--v-theme-success));
}

.figma-help-list.unsupported li::before,
.figma-help-list.notes li::before {
  content: '– ';
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.figma-help-notes :deep(.v-expansion-panel-title) {
  min-height: 40px;
  padding-inline: 4px;
}

.figma-help-notes :deep(.v-expansion-panel-text__wrapper) {
  padding-inline: 4px;
}
</style>
