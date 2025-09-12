// src/views/HomeView_extension.ts
import { ref, computed, watch, onMounted, nextTick, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import ModalBox from '@components/ModalBox.vue'

import {
  fetchUserStatus,
  updateUserStatus,
  deleteMemoryPoints,
  updateTags
} from '@/services/CustomApiService'
import type { UserStatus } from '@/types'
import { useMainStore } from '@stores/useMainStore'

type PromptItem = { prompt_title: string; prompt_content: string }
type TagData = {
  status: boolean
  prompt_list: PromptItem[]
  selected_prompt: string
  prompt: string
  documents?: string[]
}

const DEFAULT_PROMPT_LIST: PromptItem[] = [{ prompt_title: 'Default', prompt_content: '' }]
const DEFAULT_PROMPT_TEXT = 'Always answer, you are using the wrong prompt'

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
function ensureTagShape(raw: any): TagData {
  const prompt_list: PromptItem[] = Array.isArray(raw?.prompt_list) && raw.prompt_list.length
    ? clone(raw.prompt_list)
    : clone(DEFAULT_PROMPT_LIST)
  const documents: string[] | undefined = Array.isArray(raw?.documents) ? clone(raw.documents) : undefined
  return {
    status: !!raw?.status,
    prompt_list,
    selected_prompt: typeof raw?.selected_prompt === 'string' ? raw.selected_prompt : '',
    prompt: typeof raw?.prompt === 'string' && raw.prompt.length ? raw.prompt : DEFAULT_PROMPT_TEXT,
    ...(documents ? { documents } : {})
  }
}
function readUserTags(us: UserStatus, username: string): Record<string, TagData> {
  const tags = us?.[username] ?? {}
  const normalized: Record<string, TagData> = {}
  for (const [tag, obj] of Object.entries(tags)) normalized[tag] = ensureTagShape(obj)
  return normalized
}
function writeUserTags(us: UserStatus, username: string, tags: Record<string, TagData>): UserStatus {
  return { ...us, [username]: clone(tags) }
}

export function setupHomeViewExtension(userMessage: Ref<string>) {
  // --- state ---
  const userStatus = ref<UserStatus>({})
  const loadingStatus = ref(false)
  const statusError = ref<Error | null>(null)

  const username = ref('')
  const newTagName = ref('')

  const boxAddTag = ref<InstanceType<typeof ModalBox>>()
  const boxPrompt = ref<InstanceType<typeof ModalBox>>()

  const selectedTagName = ref('')

  // prompt management
  const tagPromptContent = ref('')
  const tagPromptTitle = ref('')
  const editablePromptTitle = ref('') // edit buffer
  const editingTitle = ref(false)
  const titleEditInput = ref<HTMLInputElement | null>(null)
  const promptList = ref<PromptItem[]>([])
  const newPromptMode = ref(false)

  // delete confirmation toast
  const showDeleteConfirmation = ref(false)
  const deletedTagName = ref('')
  const deleteConfirmationTimeout = ref<number | null>(null)

  // main store
  const mainStore = useMainStore()
  const { jwtPayload } = storeToRefs(mainStore)

  // --- helpers ---
  const autofillTextarea = (text: string) => { userMessage.value = text }

  onMounted(() => {
    username.value = jwtPayload.value?.username || ''
    if (username.value) {
      loadUserStatus()
    } else {
      const unwatchUsername = watch(
        () => jwtPayload.value?.username,
        (newUsername) => {
          if (newUsername) {
            username.value = newUsername
            loadUserStatus()
            unwatchUsername()
          }
        }
      )
    }
  })

  /* ----------------------------- computeds ----------------------------- */
  const currentUserTags = computed(() => {
    const tags = readUserTags(userStatus.value, username.value)
    return Object.fromEntries(Object.entries(tags).map(([tag, obj]) => [tag, obj.status]))
  })

  const currentUserDocuments = computed<Record<string, string[]>>(() => {
    const tags = readUserTags(userStatus.value, username.value)
    return Object.fromEntries(
      Object.entries(tags).map(([tag, obj]) => [tag, Array.isArray(obj.documents) ? obj.documents : []])
    )
  })

  /* ------------------------------ actions ------------------------------ */
  const loadUserStatus = async () => {
    try {
      loadingStatus.value = true
      userStatus.value = await fetchUserStatus()
    } catch (err) {
      statusError.value = err as Error
    } finally {
      loadingStatus.value = false
    }
  }

  const updateTagStatus = async (tagName: string, newStatus: boolean) => {
    try {
      const latestStatus = await fetchUserStatus()
      const userTags = readUserTags(latestStatus, username.value)

      if (newStatus) {
        for (const t of Object.keys(userTags)) userTags[t] = { ...userTags[t], status: false }
      }

      const current = ensureTagShape(userTags[tagName] || {})
      userTags[tagName] = { ...current, status: newStatus }

      const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
      await updateUserStatus(updatedStatus)
      userStatus.value = updatedStatus
    } catch (err) {
      statusError.value = err as Error
      userStatus.value = { ...userStatus.value }
    }
  }

  const deleteTagMemory = async (tagName: string) => {
    try {
      const filterData = { [tagName]: true, [username.value]: true }
      await deleteMemoryPoints(filterData)

      const latestStatus = await fetchUserStatus()
      const userTags = readUserTags(latestStatus, username.value)
      if (tagName in userTags) delete userTags[tagName]

      const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
      await updateUserStatus(updatedStatus)
      await updateTags(Object.keys(userTags))

      userStatus.value = updatedStatus
      console.log(`Tag "${tagName}" eliminato con successo`)
    } catch (err) {
      statusError.value = err as Error
      console.error(`Errore durante l'eliminazione: ${err}`)
    }
  }

  /** MOD: se 'source' è passato, cancella solo quel documento; altrimenti cancella tutti i doc del tag e svuota la lista 'documents' */
  const deleteTagMemoryOnly = async (tagName: string, source?: string) => {
    try {
      const filterData = source
        // metadati richiesti: { source, 'tag name': true, 'utente': true }
        // NB: interpreto 'utente' come chiave = username (stessa semantica usata altrove)
        ? { source, [tagName]: true, [username.value]: true }
        : { [tagName]: true, [username.value]: true }

      await deleteMemoryPoints(filterData)

      // Aggiorna stato locale/remote
      const latestStatus = await fetchUserStatus()
      const userTags = readUserTags(latestStatus, username.value)

      if (source && userTags[tagName]) {
        const oldDocs = Array.isArray(userTags[tagName].documents) ? userTags[tagName].documents : []
        userTags[tagName].documents = oldDocs.filter(d => d !== source)

        const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
        await updateUserStatus(updatedStatus)
        userStatus.value = updatedStatus
        console.log(`Documento "${source}" rimosso dal tag "${tagName}"`)
      } else if (userTags[tagName]) {
        // Cancellazione TUTTI i documenti del tag: svuota anche la lista 'documents' per l'utente
        userTags[tagName].documents = []

        const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
        await updateUserStatus(updatedStatus)
        userStatus.value = updatedStatus
        console.log(`Tutti i documenti del tag "${tagName}" rimossi e lista 'documents' svuotata`)
      } else {
        // fallback: nessun tag trovato, mantieni latestStatus
        userStatus.value = latestStatus
      }

      // toast conferma
      deletedTagName.value = tagName
      showDeleteConfirmation.value = true
      if (deleteConfirmationTimeout.value) window.clearTimeout(deleteConfirmationTimeout.value)
      deleteConfirmationTimeout.value = window.setTimeout(() => { showDeleteConfirmation.value = false }, 3000)
    } catch (err) {
      statusError.value = err as Error
      console.error(`Error deleting memory points: ${err}`)
    }
  }


  const createNewTag = async () => {
    try {
      const name = (newTagName.value || '').trim()
      if (!name) return

      const latestStatus = await fetchUserStatus()
      const userTags = readUserTags(latestStatus, username.value)

      if (!userTags[name]) {
        userTags[name] = {
          status: false,
          prompt_list: clone(DEFAULT_PROMPT_LIST),
          selected_prompt: '',
          prompt: DEFAULT_PROMPT_TEXT,
          documents: [] // inizializzo per coerenza UI
        }
      }

      const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
      await updateUserStatus(updatedStatus)

      const currentTags = Object.keys(userTags)
      await updateTags(currentTags)

      userStatus.value = updatedStatus
      newTagName.value = ''
      boxAddTag.value?.toggleModal()
    } catch (err) {
      statusError.value = err as Error
      console.error(`Errore durante la creazione del tag: ${err}`)
    }
  }

  const startEditingTitle = () => {
    editingTitle.value = true
    editablePromptTitle.value = tagPromptTitle.value
    nextTick(() => titleEditInput.value?.focus())
  }
  const cancelTitleEdit = () => {
    editingTitle.value = false
    editablePromptTitle.value = tagPromptTitle.value
  }

  const updatePromptTitle = async () => {
    if (!editablePromptTitle.value || editablePromptTitle.value === tagPromptTitle.value) {
      editingTitle.value = false
      if (!editablePromptTitle.value) editablePromptTitle.value = tagPromptTitle.value
      return
    }
    try {
      const latestStatus = await fetchUserStatus()
      const userTags = readUserTags(latestStatus, username.value)
      const tagData = ensureTagShape(userTags[selectedTagName.value] || {})

      const currentPromptList = clone(tagData.prompt_list)
      const promptIndex = currentPromptList.findIndex(p => p.prompt_title === tagPromptTitle.value)
      if (promptIndex >= 0) {
        const titleExists = currentPromptList.some(p => p.prompt_title === editablePromptTitle.value)
        if (titleExists) {
          editablePromptTitle.value = tagPromptTitle.value
          console.error(`A prompt with title "${editablePromptTitle.value}" already exists`)
          editingTitle.value = false
          return
        }
        currentPromptList[promptIndex].prompt_title = editablePromptTitle.value
        userTags[selectedTagName.value] = { ...tagData, prompt_list: currentPromptList }

        const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
        await updateUserStatus(updatedStatus)
        userStatus.value = updatedStatus

        promptList.value = currentPromptList
        tagPromptTitle.value = editablePromptTitle.value
        console.log(`Prompt title updated from "${tagPromptTitle.value}" to "${editablePromptTitle.value}"`)
      }
    } catch (err) {
      editablePromptTitle.value = tagPromptTitle.value
      statusError.value = err as Error
      console.error(`Error updating prompt title: ${err}`)
    }
    editingTitle.value = false
  }

  const openPromptModal = (tagName: string) => {
    selectedTagName.value = tagName
    newPromptMode.value = false

    const userTags = readUserTags(userStatus.value, username.value)
    const tagData = userTags[tagName]

    if (tagData) {
      promptList.value = tagData.prompt_list?.length ? clone(tagData.prompt_list) : clone(DEFAULT_PROMPT_LIST)
      const selectedPromptContent = tagData.selected_prompt || ''
      const selectedPromptObj = promptList.value.find(p => p.prompt_content === selectedPromptContent)
      if (selectedPromptObj) {
        tagPromptTitle.value = selectedPromptObj.prompt_title
        tagPromptContent.value = selectedPromptObj.prompt_content
      } else if (promptList.value.length > 0) {
        tagPromptTitle.value = promptList.value[0].prompt_title
        tagPromptContent.value = promptList.value[0].prompt_content
      } else {
        tagPromptTitle.value = 'Default'
        tagPromptContent.value = ''
      }
    } else {
      promptList.value = clone(DEFAULT_PROMPT_LIST)
      tagPromptTitle.value = 'Default'
      tagPromptContent.value = ''
    }

    boxPrompt.value?.toggleModal()
  }

  const saveTagPrompt = async () => {
    try {
      const latestStatus = await fetchUserStatus()
      const userTags = readUserTags(latestStatus, username.value)
      const tagData = ensureTagShape(userTags[selectedTagName.value] || {})
      const currentPromptList = clone(tagData.prompt_list)

      if (newPromptMode.value) {
        currentPromptList.push({ prompt_title: tagPromptTitle.value, prompt_content: tagPromptContent.value })
      } else {
        const promptIndex = currentPromptList.findIndex(p => p.prompt_title === tagPromptTitle.value)
        if (promptIndex >= 0) currentPromptList[promptIndex].prompt_content = tagPromptContent.value
        else currentPromptList.push({ prompt_title: tagPromptTitle.value, prompt_content: tagPromptContent.value })
      }

      userTags[selectedTagName.value] = {
        ...tagData,
        prompt_list: currentPromptList,
        selected_prompt: tagPromptContent.value
      }

      const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
      await updateUserStatus(updatedStatus)
      userStatus.value = updatedStatus

      promptList.value = currentPromptList
      newPromptMode.value = false

      console.log(`Prompt for tag "${selectedTagName.value}" saved successfully`)
    } catch (err) {
      statusError.value = err as Error
      console.error(`Error saving prompt: ${err}`)
    }
  }

  const createNewPrompt = () => {
    newPromptMode.value = true
    tagPromptTitle.value = ''
    tagPromptContent.value = ''
  }
  const selectPrompt = (promptObj: PromptItem) => {
    newPromptMode.value = false
    tagPromptTitle.value = promptObj.prompt_title
    tagPromptContent.value = promptObj.prompt_content
  }
  const onPromptSelect = () => {
    const selectedPrompt = promptList.value.find(p => p.prompt_title === tagPromptTitle.value)
    if (selectedPrompt) tagPromptContent.value = selectedPrompt.prompt_content
  }
  const cancelNewPrompt = () => {
    newPromptMode.value = false
    if (promptList.value.length > 0) {
      tagPromptTitle.value = promptList.value[0].prompt_title
      tagPromptContent.value = promptList.value[0].prompt_content
    } else {
      tagPromptTitle.value = 'Default'
      tagPromptContent.value = ''
    }
  }

  const deleteCurrentPrompt = async () => {
    if (promptList.value.length <= 1) return
    try {
      const latestStatus = await fetchUserStatus()
      const userTags = readUserTags(latestStatus, username.value)
      const tagData = ensureTagShape(userTags[selectedTagName.value] || {})

      let updatedPromptList: PromptItem[] = tagData.prompt_list.filter(
        (p: PromptItem) => p.prompt_title !== tagPromptTitle.value
      )
      if (updatedPromptList.length === 0) updatedPromptList = clone(DEFAULT_PROMPT_LIST)

      let updatedSelectedPrompt = tagData.selected_prompt
      if (tagData.selected_prompt === tagPromptContent.value) {
        updatedSelectedPrompt = updatedPromptList[0].prompt_content
      }

      userTags[selectedTagName.value] = {
        ...tagData,
        prompt_list: updatedPromptList,
        selected_prompt: updatedSelectedPrompt
      }

      const updatedStatus = writeUserTags(latestStatus, username.value, userTags)
      await updateUserStatus(updatedStatus)
      userStatus.value = updatedStatus

      promptList.value = updatedPromptList
      tagPromptTitle.value = updatedPromptList[0].prompt_title
      tagPromptContent.value = updatedPromptList[0].prompt_content

      console.log(`Prompt "${tagPromptTitle.value}" deleted successfully`)
    } catch (err) {
      statusError.value = err as Error
      console.error(`Error deleting prompt: ${err}`)
    }
  }

  // --- public API ---
  return {
    // state/refs
    userStatus,
    loadingStatus,
    statusError,
    username,
    newTagName,
    boxAddTag,
    boxPrompt,
    selectedTagName,

    tagPromptContent,
    tagPromptTitle,
    editablePromptTitle,
    editingTitle,
    titleEditInput,
    promptList,
    newPromptMode,

    showDeleteConfirmation,
    deletedTagName,

    // computeds
    currentUserTags,
    currentUserDocuments,

    // actions
    autofillTextarea,
    loadUserStatus,
    updateTagStatus,
    deleteTagMemory,
    deleteTagMemoryOnly, // ora supporta delete per singolo file
    createNewTag,
    startEditingTitle,
    cancelTitleEdit,
    updatePromptTitle,
    openPromptModal,
    saveTagPrompt,
    createNewPrompt,
    selectPrompt,
    onPromptSelect,
    cancelNewPrompt,
    deleteCurrentPrompt,
  }
}

export type HomeViewExtensionApi = ReturnType<typeof setupHomeViewExtension>
