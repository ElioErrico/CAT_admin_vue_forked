<script setup lang="ts">
import { useSlots } from 'vue'


interface Props {
  inputDisabled: boolean
  currentUserTags: Record<string, boolean>
  loadingStatus: boolean
  statusError: Error | null
}

defineProps<Props>()

// Eventi che il componente emette al padre
defineEmits<{
  (e: 'updateTagStatus', tagName: string, newStatus: boolean): void
  (e: 'openPromptModal', tagName: string): void
  (e: 'deleteTagMemoryOnly', tagName: string): void
  (e: 'deleteTagMemory', tagName: string): void
  (e: 'openAddTagModal'): void
}>()
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
      <!-- Sezione caricamento -->
      <li v-if="loadingStatus" class="w-full">
        <div class="btn join-item flex-nowrap px-2 text-left font-medium w-full">
          <span class="rounded-lg p-1 text-info">
            <span class="loading loading-spinner loading-xs"></span>
          </span>
          <span class="truncate">Caricamento tag...</span>
        </div>
      </li>

      <!-- Sezione errore -->
      <li v-if="statusError" class="w-full">
        <div class="btn join-item flex-nowrap px-2 text-left font-medium text-error w-full">
          <span class="rounded-lg p-1">
            <heroicons-exclamation-triangle-20-solid class="size-5" />
          </span>
          <span class="truncate">Errore nel caricamento dei tag</span>
        </div>
      </li>

      <!-- Tag dinamici basati sull'utente -->
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

          <!-- PROMPT BUTTON -->
          <span
            class="rounded-lg p-1 text-primary cursor-pointer hover:bg-base-200"
            @click.stop="$emit('openPromptModal', String(tagName))"
            title="Edit prompts"
          >
            <!-- icona custom -->
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
          </span>

          <!-- Delete memory points only -->
          <span
            class="rounded-lg p-1 text-warning cursor-pointer hover:bg-base-200"
            @click.stop="$emit('deleteTagMemoryOnly', String(tagName))"
            title="Delete content"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125 2.25 2.25m0 0 2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
          </span>

          <!-- Delete tag -->
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
