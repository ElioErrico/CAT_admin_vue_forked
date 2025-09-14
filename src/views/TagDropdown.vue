/** src\views\TagDropdown.vue

<script setup lang="ts">
import { reactive, onBeforeUnmount } from 'vue'

interface Props {
  inputDisabled: boolean
  currentUserTags: Record<string, boolean>
  /** mappa tag -> lista documents */
  currentUserDocuments: Record<string, string[]>
  loadingStatus: boolean
  statusError: Error | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'updateTagStatus', tagName: string, newStatus: boolean): void
  (e: 'openPromptModal', tagName: string): void
  /** resta disponibile per cancellare un singolo file dalla lista */
  (e: 'deleteTagMemoryOnly', tagName: string, source?: string): void
  (e: 'deleteTagMemory', tagName: string): void
  (e: 'openAddTagModal'): void
  /** Ricarica i documenti on-hover */
  (e: 'refreshUserStatus'): void
}>()

/** Stato per visibilità tooltip documenti per singolo tag */
const openDocs: Record<string, boolean> = reactive({})
/** Timer di hide differito per singolo tag */
const hideTimers: Record<string, number | undefined> = reactive({})

function showDocs(tag: string) {
  emit('refreshUserStatus') // aggiorna sempre lo stato appena apro
  openDocs[tag] = true
  if (hideTimers[tag]) {
    clearTimeout(hideTimers[tag]!)
    hideTimers[tag] = undefined
  }
}

function toggleDocs(tag: string) {
  if (openDocs[tag]) {
    scheduleHide(tag) // chiudi con il piccolo delay, comportamento uniforme
  } else {
    showDocs(tag)
  }
}

function scheduleHide(tag: string) {
  if (hideTimers[tag]) clearTimeout(hideTimers[tag]!)
  hideTimers[tag] = window.setTimeout(() => {
    openDocs[tag] = false
    hideTimers[tag] = undefined
  }, 300) // 0.3 s di tolleranza
}

onBeforeUnmount(() => {
  Object.values(hideTimers).forEach(t => t && clearTimeout(t))
})

const hasDocs = (tag: string) =>
  (props.currentUserDocuments[tag]?.length ?? 0) > 0
  
</script>

<template>
  <div class="dropdown dropdown-top">
    <button tabindex="0" :disabled="inputDisabled" class="btn btn-circle btn-primary shadow-lg">
      <heroicons-clipboard-document-list-solid class="size-5" />
    </button>

    <ul
      tabindex="0"
      class="dropdown-content join join-vertical !left-0 z-10 mb-6 w-[30rem] p-0 [&>li>*]:bg-base-100"
      :class="{ 'max-h-[700px] overflow-y-auto': Object.keys(currentUserTags).length > 15 }"
    >
      <!-- Loading -->
      <li v-if="loadingStatus" class="w-full">
        <div class="btn join-item flex-nowrap px-2 text-left font-medium w-full">
          <span class="rounded-lg p-1 text-info">
            <span class="loading loading-spinner loading-xs"></span>
          </span>
          <span class="truncate">Caricamento tag...</span>
        </div>
      </li>

      <!-- Error -->
      <li v-if="statusError" class="w-full">
        <div class="btn join-item flex-nowrap px-2 text-left font-medium text-error w-full">
          <span class="rounded-lg p-1">
            <heroicons-exclamation-triangle-20-solid class="size-5" />
          </span>
          <span class="truncate">Errore nel caricamento dei tag</span>
        </div>
      </li>

      <!-- Tag list -->
      <li v-for="(status, tagName) in currentUserTags" :key="String(tagName)" class="w-full">
        <button
          class="btn join-item flex-nowrap px-2 text-left font-medium w-full"
          :class="{ 'bg-success/20': status }"
          @click="$emit('updateTagStatus', String(tagName), !status)"
        >
          <span class="rounded-lg p-1" :class="status ? 'text-success' : 'text-error'">
            <template v-if="status">
              <heroicons-check-circle-20-solid class="size-5 shrink-0" />
            </template>
            <template v-else>
              <heroicons-x-circle-20-solid class="size-5 shrink-0" />
            </template>
          </span>

          <span class="grow truncate max-w-[25rem]">{{ tagName }}</span>

          <!-- Open Prompt -->
          <span
            class="rounded-lg p-1 text-primary cursor-pointer hover:bg-base-200"
            @click.stop="$emit('openPromptModal', String(tagName))"
            title="Edit prompts"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
          </span>

          <!-- "Delete content" ORA APRE SOLO LA LISTA DOCUMENTI -->
          <span
            class="relative"
            @mouseenter="showDocs(String(tagName))"
            @mouseleave="scheduleHide(String(tagName))"
          >
            <!-- Trigger: non cancella più nulla -->
            <span
              class="rounded-lg p-1 text-warning cursor-pointer hover:bg-base-200"
              @click.stop="toggleDocs(String(tagName))"
              title="Mostra documenti"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125 2.25 2.25m0 0 2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125Z" />
              </svg>
            </span>

            <!-- Tooltip (v-show + delay hide 0.3s) -->
            <div
              v-show="openDocs[String(tagName)]"
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[18rem] max-w-[26rem] max-h-60 overflow-auto rounded-lg border border-base-300 bg-base-100 p-3 text-sm shadow-xl z-20"
              @mouseenter="showDocs(String(tagName))"
              @mouseleave="scheduleHide(String(tagName))"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="font-semibold">Documenti collegati</div>

                <!-- In futuro riattivare la disabilitazione del bottone se la lista è vuota -->
                <!-- :disabled="!props.currentUserDocuments[String(tagName)]?.length" -->
                <button
                  class="btn btn-xs btn-error btn-outline gap-1"
                  :disabled="!hasDocs(String(tagName))"
                  :class="{ 'btn-disabled': !hasDocs(String(tagName)) }" 
                  @click.stop="$emit('deleteTagMemoryOnly', String(tagName))"
                  :title="hasDocs(String(tagName)) ? 'Elimina tutti i documenti del tag' : 'Nessun documento da eliminare'">
                  <heroicons-trash-solid class="size-3" />
                  Elimina tutti
                </button>
              </div>

              <ul v-if="props.currentUserDocuments[String(tagName)]?.length > 0" class="space-y-1">
                <li v-for="doc in props.currentUserDocuments[String(tagName)]" :key="doc" class="flex items-center gap-2">
                  <!-- Cestino singolo documento (QUESTO sì che elimina) -->
                  <button
                    class="p-1 rounded text-error hover:bg-base-200"
                    @click.stop="$emit('deleteTagMemoryOnly', String(tagName), String(doc))"
                    :title="`Elimina ${doc}`"
                  >
                    <heroicons-trash-solid class="size-4" />
                  </button>
                  <span class="truncate" :title="doc">{{ doc }}</span>
                </li>
              </ul>
              <div v-else class="opacity-70">Nessun documento</div>
            </div>
          </span>

          <!-- Delete tag (rimane la cancellazione tag+contenuto) -->
          <span
            class="rounded-lg p-1 text-error cursor-pointer hover:bg-base-200"
            @click.stop="$emit('deleteTagMemory', String(tagName))"
            title="Delete content and tag"
          >
            <heroicons-trash-solid class="size-4 shrink-0" />
          </span>
        </button>
      </li>

      <!-- Add new tag -->
      <li class="w-full">
        <button class="btn join-item flex-nowrap px-2 text-left font-medium w-full" @click="$emit('openAddTagModal')">
          <span class="rounded-lg p-1 text-primary">
            <heroicons-plus-circle-20-solid class="size-5 shrink-0" />
          </span>
          <span class="grow truncate max-w-[25rem]">Aggiungi nuovo tag</span>
        </button>
      </li>
    </ul>
  </div>
</template>
