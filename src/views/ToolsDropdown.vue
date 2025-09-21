<!-- src/views/ToolsDropdown.vue -->
<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { setupToolsStatusExtension } from '@/views/ToolsStatus_extension'

interface Props {
  inputDisabled: boolean
}
const props = defineProps<Props>()

const {
  loading,
  saving,
  error,
  toolsForDropdown,
  loadToolsStatus,
  toggleTool,
  toggleAllTools,
  updateSettingForCurrentUser,
  saveSettingsForCurrentUser,
  getSettingKeys,
  getSettingForUser,
  getCurrentUserSettings,
} = setupToolsStatusExtension()

/** stato UI */
const openRow: Record<string, boolean> = reactive({})
const edits: Record<string, Record<string, any>> = reactive({})
const newItemInputs: Record<string, Record<string, string>> = reactive({})

onMounted(() => {
  loadToolsStatus()
})

function colorBtnClass(isOn: boolean): string {
  return isOn ? 'btn-success' : 'btn-error'
}
async function onToggle(toolKey: string, current: boolean) {
  await toggleTool(toolKey, !current)
}

/* ---------------- Inference del tipo “user-friendly” ---------------- */
type InferredType = 'boolean' | 'number' | 'string' | 'array_string' | 'array_number' | 'unknown'

function inferSettingType(toolKey: string, settingKey: string): InferredType {
  const v = getSettingForUser(toolKey, settingKey)
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'string') return 'string'
  if (Array.isArray(v) && v.every((x: any) => typeof x === 'string')) return 'array_string'
  if (Array.isArray(v) && v.every((x: any) => typeof x === 'number')) return 'array_number'

  // fallback: deduci dal buffer (se già inizializzato)
  const buf = edits[toolKey]?.[settingKey]
  if (typeof buf === 'boolean') return 'boolean'
  if (typeof buf === 'number') return 'number'
  if (typeof buf === 'string') return 'string'
  if (Array.isArray(buf) && buf.every((x: any) => typeof x === 'string')) return 'array_string'
  if (Array.isArray(buf) && buf.every((x: any) => typeof x === 'number')) return 'array_number'

  return 'unknown'
}

/** Chiavi dei setting realmente renderizzabili per un dato tool */
function renderableSettingKeys(toolKey: string): string[] {
  return getSettingKeys(toolKey).filter(sk => inferSettingType(toolKey, sk) !== 'unknown')
}

/** True se il tool ha almeno un setting renderizzabile */
function hasRenderableSettings(toolKey: string): boolean {
  return renderableSettingKeys(toolKey).length > 0
}

function prepareEdits(toolKey: string) {
  edits[toolKey] = {}
  newItemInputs[toolKey] = {}
  const cur = getCurrentUserSettings(toolKey)
  for (const sk of renderableSettingKeys(toolKey)) {
    const v = cur[sk]
    const t = inferSettingType(toolKey, sk)

    if (t === 'array_string' || t === 'array_number') {
      edits[toolKey][sk] = Array.isArray(v) ? [...v] : []
      newItemInputs[toolKey][sk] = ''
    } else if (t === 'boolean') {
      edits[toolKey][sk] = typeof v === 'boolean' ? v : false
    } else if (t === 'number') {
      edits[toolKey][sk] = typeof v === 'number' ? v : 0
    } else if (t === 'string') {
      edits[toolKey][sk] = typeof v === 'string' ? v : ''
    }
  }
}

function toggleSettings(toolKey: string) {
  if (!hasRenderableSettings(toolKey)) return // niente click se non ci sono setting usabili
  const next = !openRow[toolKey]
  openRow[toolKey] = next
  if (next) prepareEdits(toolKey)
}

/* ---------------- Chips helpers ---------------- */
function removeChip(toolKey: string, settingKey: string, idx: number) {
  const arr = edits[toolKey][settingKey]
  if (Array.isArray(arr)) arr.splice(idx, 1)
}
function addChip(toolKey: string, settingKey: string) {
  const valRaw = (newItemInputs[toolKey]?.[settingKey] || '').trim()
  if (!valRaw) return
  const t = inferSettingType(toolKey, settingKey)
  const arr = edits[toolKey][settingKey]
  if (!Array.isArray(arr)) return

  if (t === 'array_string') {
    if (!arr.includes(valRaw)) arr.push(valRaw)
  } else if (t === 'array_number') {
    const num = Number(valRaw)
    if (Number.isFinite(num) && !arr.includes(num)) arr.push(num)
  }
  newItemInputs[toolKey][settingKey] = ''
}

/* ---------------- Salvataggi ---------------- */
async function saveOne(toolKey: string, settingKey: string) {
  const t = inferSettingType(toolKey, settingKey)
  let value = edits[toolKey]?.[settingKey]
  if (t === 'number') value = Number(value)
  if (t === 'boolean') value = Boolean(value)
  if (t === 'array_number') value = Array.isArray(value) ? value.map(Number).filter(n => Number.isFinite(n)) : []
  await updateSettingForCurrentUser(toolKey, settingKey, value)
}

async function saveAll(toolKey: string) {
  const payload: Record<string, any> = {}
  for (const sk of renderableSettingKeys(toolKey)) {
    const t = inferSettingType(toolKey, sk)
    let value = edits[toolKey]?.[sk]
    if (t === 'number') value = Number(value)
    if (t === 'boolean') value = Boolean(value)
    if (t === 'array_number') value = Array.isArray(value) ? value.map(Number).filter(n => Number.isFinite(n)) : []
    payload[sk] = value
  }
  await saveSettingsForCurrentUser(toolKey, payload)
}
</script>

<template>
  <div class="dropdown dropdown-top tools-dropdown">
    <button
      tabindex="0"
      :disabled="props.inputDisabled"
      class="btn btn-circle btn-primary shadow-lg"
      :class="{ 'btn-disabled': props.inputDisabled }"
      title="Tools"
    >
     <ph-cpu-bold class="size-6" />
    </button>

    <ul
      tabindex="0"
      class="dropdown-content join join-vertical !left-0 z-10 mb-6 w-[34rem] p-0 [&>li>*]:bg-base-100"
      :class="{ 'max-h-[700px] overflow-y-auto': (toolsForDropdown?.length ?? 0) > 10 }"
    >
      <!-- Header -->
      <li class="w-full">
        <div class="btn join-item w-full justify-between px-3">
          <div class="flex items-center gap-2">
            <span class="font-semibold">Tools</span>
            <span v-if="loading" class="loading loading-dots loading-xs"></span>
          </div>
          <div class="flex items-center gap-1">
            <button class="btn btn-xs" :disabled="saving || loading" @click="toggleAllTools(true)" title="Enable all">
              All ON
            </button>
            <button class="btn btn-xs" :disabled="saving || loading" @click="toggleAllTools(false)" title="Disable all">
              All OFF
            </button>
            <button class="btn btn-xs btn-ghost" :disabled="loading" @click="loadToolsStatus" title="Refresh">
              <heroicons-arrow-path-20-solid class="size-4" />
            </button>
          </div>
        </div>
      </li>

      <!-- Error -->
      <li v-if="error" class="w-full">
        <div class="btn join-item w-full justify-start gap-2 px-3 text-error">
          <heroicons-exclamation-triangle-20-solid class="size-5" />
          <span class="truncate">Errore: {{ error.message }}</span>
        </div>
      </li>

      <!-- Loading -->
      <li v-if="loading && !error" class="w-full">
        <div class="btn join-item w-full justify-start gap-2 px-3">
          <span class="loading loading-spinner loading-xs"></span>
          <span class="truncate">Caricamento tools…</span>
        </div>
      </li>

      <!-- Nessun tool -->
      <li v-if="!loading && !error && (toolsForDropdown?.length ?? 0) === 0" class="w-full">
        <div class="btn join-item w-full justify-start gap-2 px-3 opacity-70">
          <heroicons-information-circle-20-solid class="size-5" />
          <span class="truncate">Nessun tool configurato</span>
        </div>
      </li>

      <!-- Lista tools -->
      <li v-for="t in toolsForDropdown" :key="t.key" class="w-full">
        <div class="btn join-item w-full flex-nowrap px-3">
          <div class="flex items-center gap-2 w-full">
            <!-- Nome tool a sinistra -->
            <span class="truncate">{{ t.key }}</span>

            <!-- Azioni a destra -->
            <div class="ml-auto flex items-center gap-1">
              <!-- ON/OFF verde/rosso -->
              <button
                class="btn btn-xs"
                :class="[colorBtnClass(t.enabled)]"
                :disabled="props.inputDisabled || saving || loading"
                @click="onToggle(t.key, t.enabled)"
              >
                {{ t.enabled ? 'ON' : 'OFF' }}
              </button>

              <!-- Chevron a destra del toggle (disabilitato se non ci sono settings) -->
              <button
                class="btn btn-xs btn-ghost btn-square"
                :disabled="!hasRenderableSettings(t.key)"
                @click="toggleSettings(t.key)"
                :title="hasRenderableSettings(t.key) ? (openRow[t.key] ? 'Nascondi impostazioni' : 'Mostra impostazioni') : 'Nessuna impostazione disponibile'"
              >
                <heroicons-chevron-down-20-solid
                  class="size-5 transition-transform"
                  :class="{ 'rotate-180': openRow[t.key] }"
                />
              </button>
            </div>
          </div>
        </div>

        <!-- Pannello settings (solo se esistono e se aperto) -->
        <div v-if="openRow[t.key] && hasRenderableSettings(t.key)" class="px-3 pb-3">
          <div class="rounded-lg border border-base-300 p-3 bg-base-100">
            <div class="mb-2 flex justify-between items-center">
              <div class="font-semibold">Impostazioni</div>
              <button
                class="btn btn-xs btn-primary"
                :disabled="props.inputDisabled || saving || loading"
                @click="saveAll(t.key)"
              >
                Save all
              </button>
            </div>

            <div
              v-for="sk in renderableSettingKeys(t.key)"
              :key="`${t.key}::${sk}`"
              class="mb-3 pb-3 border-b last:border-b-0 last:pb-0"
            >
              <div class="mb-1 font-medium">{{ sk }}</div>

              <!-- boolean -->
              <template v-if="inferSettingType(t.key, sk) === 'boolean'">
                <label class="inline-flex items-center gap-2">
                  <input type="checkbox" class="toggle toggle-sm toggle-primary" v-model="edits[t.key][sk]" />
                  <span class="text-xs opacity-70">{{ String(edits[t.key][sk]) }}</span>
                </label>
              </template>

              <!-- number (niente pulsanti custom) -->
              <template v-else-if="inferSettingType(t.key, sk) === 'number'">
                <input
                  type="number"
                  class="input input-sm input-bordered w-full"
                  v-model.number="edits[t.key][sk]"
                  min="0"
                  step="1"
                />
              </template>

              <!-- string -->
              <template v-else-if="inferSettingType(t.key, sk) === 'string'">
                <input
                  type="text"
                  class="input input-sm input-bordered w-full"
                  v-model="edits[t.key][sk]"
                />
              </template>

              <!-- array<string> -->
              <template v-else-if="inferSettingType(t.key, sk) === 'array_string'">
                <div class="flex flex-wrap gap-2 mb-2">
                  <span
                    v-for="(chip, idx) in edits[t.key][sk]"
                    :key="`${t.key}::${sk}::chip${idx}`"
                    class="badge badge-outline gap-1"
                    :title="chip"
                  >
                    <span class="truncate max-w-[10rem]">{{ chip }}</span>
                    <button class="btn btn-ghost btn-xs p-0" @click="removeChip(t.key, sk, idx)">
                      <heroicons-x-mark-20-solid class="size-4" />
                    </button>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    class="input input-sm input-bordered w-full"
                    v-model="newItemInputs[t.key][sk]"
                    placeholder="Aggiungi valore..."
                    @keydown.enter.prevent="addChip(t.key, sk)"
                  />
                  <button
                    class="btn btn-sm"
                    :disabled="props.inputDisabled || saving || loading"
                    @click="addChip(t.key, sk)"
                  >
                    Add
                  </button>
                </div>
              </template>

              <!-- array<number> -->
              <template v-else-if="inferSettingType(t.key, sk) === 'array_number'">
                <div class="flex flex-wrap gap-2 mb-2">
                  <span
                    v-for="(chip, idx) in edits[t.key][sk]"
                    :key="`${t.key}::${sk}::chipn${idx}`"
                    class="badge badge-outline gap-1"
                    :title="String(chip)"
                  >
                    <span>{{ chip }}</span>
                    <button class="btn btn-ghost btn-xs p-0" @click="removeChip(t.key, sk, idx)">
                      <heroicons-x-mark-20-solid class="size-4" />
                    </button>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    class="input input-sm input-bordered w-40"
                    v-model="newItemInputs[t.key][sk]"
                    placeholder="0"
                    @keydown.enter.prevent="addChip(t.key, sk)"
                  />
                  <button
                    class="btn btn-sm"
                    :disabled="props.inputDisabled || saving || loading"
                    @click="addChip(t.key, sk)"
                  >
                    Add
                  </button>
                </div>
              </template>

              <div class="mt-2 flex justify-end">
                <button
                  class="btn btn-xs btn-outline"
                  :disabled="props.inputDisabled || saving || loading"
                  @click="saveOne(t.key, sk)"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<!-- Nessun CSS extra: usiamo gli spinner nativi dei number input -->
