// src/views/HomeView_extension.ts
import { ref, computed, watch, onMounted, nextTick, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import ModalBox from '@components/ModalBox.vue'

// ✅ tieni solo questi
import { fetchUserStatus, updateUserStatus, deleteMemoryPoints } from '@/services/CustomApiService'

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
      const userTags = { ...(latestStatus[username.value] || {}) }
  
      // ❌ Niente creazioni implicite
      if (!Object.prototype.hasOwnProperty.call(userTags, tagName)) {
        console.warn(`[updateTagStatus] Tag inesistente: "${tagName}". Skip.`)
        return
      }
  
      // Se attivo un tag, disattivo gli altri
      if (newStatus) {
        for (const t of Object.keys(userTags)) {
          if (t !== tagName) {
            const cur = userTags[t]
            if (cur && typeof cur === 'object') userTags[t] = { ...cur, status: false }
          }
        }
      }
  
      const cur = userTags[tagName]
      userTags[tagName] = { ...(cur || {}), status: newStatus }
  
      const updatedStatus = { ...latestStatus, [username.value]: userTags }
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
      const updatedStatus = { ...latestStatus }
      if (updatedStatus[username.value] && tagName in updatedStatus[username.value]) {
        const { [tagName]: _removed, ...rest } = updatedStatus[username.value]
        updatedStatus[username.value] = rest
      }
  
      await updateUserStatus(updatedStatus)
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
      const userTags = { ...(latestStatus[username.value] || {}) }
  
      if (!Object.prototype.hasOwnProperty.call(userTags, name)) {
        userTags[name] = {
          status: false,
          prompt_list: [{ prompt_title: 'Default', prompt_content: '' }],
          selected_prompt: '',
          prompt: 'Always answer, you are using the wrong prompt',
          documents: []
        }
      }
  
      const updatedStatus = { ...latestStatus, [username.value]: userTags }
      await updateUserStatus(updatedStatus)
  
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
      const userTags = { ...(latestStatus[username.value] || {}) }
  
      if (!Object.prototype.hasOwnProperty.call(userTags, selectedTagName.value)) {
        console.warn(`[updatePromptTitle] Tag inesistente: "${selectedTagName.value}".`)
        editingTitle.value = false
        return
      }
  
      const tagData = userTags[selectedTagName.value]
      const list = Array.isArray(tagData.prompt_list) ? [...tagData.prompt_list] : []
  
      const idx = list.findIndex(p => p.prompt_title === tagPromptTitle.value)
      if (idx >= 0) {
        const exists = list.some(p => p.prompt_title === editablePromptTitle.value)
        if (exists) {
          editablePromptTitle.value = tagPromptTitle.value
          console.error(`A prompt with title "${editablePromptTitle.value}" already exists`)
          editingTitle.value = false
          return
        }
        list[idx].prompt_title = editablePromptTitle.value
        userTags[selectedTagName.value] = { ...tagData, prompt_list: list }
  
        const updatedStatus = { ...latestStatus, [username.value]: userTags }
        await updateUserStatus(updatedStatus)
        userStatus.value = updatedStatus
  
        promptList.value = list
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
  
    const userTags = userStatus.value[username.value] || {}
    const tagData = userTags[tagName]
  
    if (!tagData) {
      console.warn(`[openPromptModal] Tag inesistente: "${tagName}".`)
      return
    }
  
    promptList.value = Array.isArray(tagData.prompt_list) && tagData.prompt_list.length
      ? [...tagData.prompt_list]
      : [{ prompt_title: 'Default', prompt_content: '' }]
  
    const selected = tagData.selected_prompt || ''
    const found = promptList.value.find(p => p.prompt_content === selected)
  
    if (found) {
      tagPromptTitle.value = found.prompt_title
      tagPromptContent.value = found.prompt_content
    } else if (promptList.value.length) {
      tagPromptTitle.value = promptList.value[0].prompt_title
      tagPromptContent.value = promptList.value[0].prompt_content
    } else {
      tagPromptTitle.value = 'Default'
      tagPromptContent.value = ''
    }
  
    boxPrompt.value?.toggleModal()
  }
  

  const saveTagPrompt = async () => {
    try {
      const latestStatus = await fetchUserStatus()
      const userTags = { ...(latestStatus[username.value] || {}) }
  
      if (!Object.prototype.hasOwnProperty.call(userTags, selectedTagName.value)) {
        console.warn(`[saveTagPrompt] Tag inesistente: "${selectedTagName.value}".`)
        return
      }
  
      const tagData = userTags[selectedTagName.value]
      const list = Array.isArray(tagData.prompt_list) ? [...tagData.prompt_list] : []
  
      if (newPromptMode.value) {
        list.push({ prompt_title: tagPromptTitle.value, prompt_content: tagPromptContent.value })
      } else {
        const idx = list.findIndex(p => p.prompt_title === tagPromptTitle.value)
        if (idx >= 0) list[idx].prompt_content = tagPromptContent.value
        else list.push({ prompt_title: tagPromptTitle.value, prompt_content: tagPromptContent.value })
      }
  
      userTags[selectedTagName.value] = {
        ...tagData,
        prompt_list: list,
        selected_prompt: tagPromptContent.value
      }
  
      const updatedStatus = { ...latestStatus, [username.value]: userTags }
      await updateUserStatus(updatedStatus)
      userStatus.value = updatedStatus
  
      promptList.value = list
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
      const userTags = { ...(latestStatus[username.value] || {}) }
  
      if (!Object.prototype.hasOwnProperty.call(userTags, selectedTagName.value)) {
        console.warn(`[deleteCurrentPrompt] Tag inesistente: "${selectedTagName.value}".`)
        return
      }
  
      const tagData = userTags[selectedTagName.value]
      let list = Array.isArray(tagData.prompt_list) ? [...tagData.prompt_list] : []
      list = list.filter(p => p.prompt_title !== tagPromptTitle.value)
      if (list.length === 0) list = [{ prompt_title: 'Default', prompt_content: '' }]
  
      let selected = tagData.selected_prompt
      if (selected === tagPromptContent.value) selected = list[0].prompt_content
  
      userTags[selectedTagName.value] = { ...tagData, prompt_list: list, selected_prompt: selected }
  
      const updatedStatus = { ...latestStatus, [username.value]: userTags }
      await updateUserStatus(updatedStatus)
      userStatus.value = updatedStatus
  
      promptList.value = list
      tagPromptTitle.value = list[0].prompt_title
      tagPromptContent.value = list[0].prompt_content
  
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
