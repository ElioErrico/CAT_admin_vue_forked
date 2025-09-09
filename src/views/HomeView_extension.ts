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

  // main store (per username/JWT)
  const mainStore = useMainStore()
  const { jwtPayload } = storeToRefs(mainStore)

  // --- helpers ---
  const autofillTextarea = (text: string) => {
    userMessage.value = text
  }

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

  const currentUserTags = computed(() => {
    const tags = userStatus.value[username.value] || {}
    return Object.fromEntries(
      Object.entries(tags).map(([tag, obj]) => [tag, (obj as any).status])
    )
  })

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
      const userTags: Record<string, any> = { ...(latestStatus[username.value] || {}) }

      if (newStatus) {
        Object.keys(userTags).forEach(tag => {
          const currentTag = userTags[tag]
          const promptList =
            typeof currentTag === 'object' && currentTag !== null
              ? currentTag.prompt_list || [{ prompt_title: 'Default', prompt_content: '' }]
              : [{ prompt_title: 'Default', prompt_content: '' }]
          const selectedPrompt =
            typeof currentTag === 'object' && currentTag !== null ? currentTag.selected_prompt || '' : ''
          userTags[tag] = {
            status: false,
            prompt_list: promptList,
            selected_prompt: selectedPrompt,
            prompt: 'Always answer, you are using the wrong prompt',
          }
        })
      }

      const currentTagValue = userTags[tagName]
      const promptListVal =
        typeof currentTagValue === 'object' && currentTagValue !== null
          ? currentTagValue.prompt_list || [{ prompt_title: 'Default', prompt_content: '' }]
          : [{ prompt_title: 'Default', prompt_content: '' }]
      const selectedPrompt =
        typeof currentTagValue === 'object' && currentTagValue !== null ? currentTagValue.selected_prompt || '' : ''

      userTags[tagName] = {
        status: newStatus,
        prompt_list: promptListVal,
        selected_prompt: selectedPrompt,
        prompt: 'Always answer, you are using the wrong prompt',
      }

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
        const { [tagName]: _removed, ...userTags } = updatedStatus[username.value]
        updatedStatus[username.value] = userTags
      }

      await updateUserStatus(updatedStatus)

      const currentTags = Object.keys(updatedStatus[username.value] || {})
      const updatedTags = currentTags.filter(tag => tag !== tagName)
      await updateTags(updatedTags)

      userStatus.value = updatedStatus
      console.log(`Tag "${tagName}" eliminato con successo`)
    } catch (err) {
      statusError.value = err as Error
      console.error(`Errore durante l'eliminazione: ${err}`)
    }
  }

  const deleteTagMemoryOnly = async (tagName: string) => {
    try {
      const filterData = { [tagName]: true, [username.value]: true }
      await deleteMemoryPoints(filterData)

      deletedTagName.value = tagName
      showDeleteConfirmation.value = true

      if (deleteConfirmationTimeout.value) {
        window.clearTimeout(deleteConfirmationTimeout.value)
      }
      deleteConfirmationTimeout.value = window.setTimeout(() => {
        showDeleteConfirmation.value = false
      }, 3000)

      console.log(`Memory points for tag "${tagName}" deleted successfully`)
    } catch (err) {
      statusError.value = err as Error
      console.error(`Error deleting memory points: ${err}`)
    }
  }

  const createNewTag = async () => {
    try {
      const latestStatus = await fetchUserStatus()
      const updatedStatus = { ...latestStatus }

      if (!updatedStatus[username.value]) updatedStatus[username.value] = {}

      updatedStatus[username.value] = {
        ...updatedStatus[username.value],
        [newTagName.value]: {
          status: false,
          prompt_list: [{ prompt_title: 'Default', prompt_content: '' }],
          selected_prompt: '',
          prompt: 'Always answer, you are using the wrong prompt',
        },
      }

      await updateUserStatus(updatedStatus)

      const currentTags = Object.keys(updatedStatus[username.value] || {})
      if (!currentTags.includes(newTagName.value)) {
        await updateTags([...currentTags, newTagName.value])
      }

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
      const userTags: Record<string, any> = { ...(latestStatus[username.value] || {}) }
      const tagData =
        userTags[selectedTagName.value] || { status: false, prompt_list: [{ prompt_title: 'Default', prompt_content: '' }], selected_prompt: '' }

      let currentPromptList: PromptItem[] = Array.isArray(tagData.prompt_list)
        ? [...tagData.prompt_list]
        : [{ prompt_title: 'Default', prompt_content: '' }]

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
        userTags[selectedTagName.value] = {
          status: typeof tagData === 'object' ? tagData.status : false,
          prompt_list: currentPromptList,
          selected_prompt: tagData.selected_prompt,
          prompt: 'Always answer, you are using the wrong prompt',
        }
        const updatedStatus = { ...latestStatus, [username.value]: userTags }
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

    const userTags = userStatus.value[username.value] || {}
    const tagData = userTags[tagName]

    if (typeof tagData === 'object' && tagData !== null) {
      promptList.value = tagData.prompt_list || [{ prompt_title: 'Default', prompt_content: '' }]
      const selectedPrompt = tagData.selected_prompt || ''
      const selectedPromptObj = promptList.value.find(p => p.prompt_content === selectedPrompt)
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
      promptList.value = [{ prompt_title: 'Default', prompt_content: '' }]
      tagPromptTitle.value = 'Default'
      tagPromptContent.value = ''
    }

    boxPrompt.value?.toggleModal()
  }

  const saveTagPrompt = async () => {
    try {
      const latestStatus = await fetchUserStatus()
      const userTags: Record<string, any> = { ...(latestStatus[username.value] || {}) }

      const tagData =
        userTags[selectedTagName.value] || { status: false, prompt_list: [{ prompt_title: 'Default', prompt_content: '' }], selected_prompt: '' }

      let currentPromptList: PromptItem[] = Array.isArray(tagData.prompt_list)
        ? [...tagData.prompt_list]
        : [{ prompt_title: 'Default', prompt_content: '' }]

      if (newPromptMode.value) {
        currentPromptList.push({ prompt_title: tagPromptTitle.value, prompt_content: tagPromptContent.value })
      } else {
        const promptIndex = currentPromptList.findIndex(p => p.prompt_title === tagPromptTitle.value)
        if (promptIndex >= 0) currentPromptList[promptIndex].prompt_content = tagPromptContent.value
        else currentPromptList.push({ prompt_title: tagPromptTitle.value, prompt_content: tagPromptContent.value })
      }

      userTags[selectedTagName.value] = {
        status: typeof tagData === 'object' ? tagData.status : false,
        prompt_list: currentPromptList,
        selected_prompt: tagPromptContent.value,
        prompt: 'Always answer, you are using the wrong prompt',
      }

      const updatedStatus = { ...latestStatus, [username.value]: userTags }
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
      const userTags: Record<string, any> = { ...(latestStatus[username.value] || {}) }

      const tagData =
        userTags[selectedTagName.value] || { status: false, prompt_list: [{ prompt_title: 'Default', prompt_content: '' }], selected_prompt: '' }

      let updatedPromptList: PromptItem[] = tagData.prompt_list.filter(
        (p: PromptItem) => p.prompt_title !== tagPromptTitle.value
      )
      if (updatedPromptList.length === 0) {
        updatedPromptList = [{ prompt_title: 'Default', prompt_content: '' }]
      }

      let updatedSelectedPrompt = tagData.selected_prompt
      if (tagData.selected_prompt === tagPromptContent.value) {
        updatedSelectedPrompt = updatedPromptList[0].prompt_content
      }

      userTags[selectedTagName.value] = {
        status: typeof tagData === 'object' ? tagData.status : false,
        prompt_list: updatedPromptList,
        selected_prompt: updatedSelectedPrompt,
        prompt: 'Always answer, you are using the wrong prompt',
      }

      const updatedStatus = { ...latestStatus, [username.value]: userTags }
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

    // actions
    autofillTextarea,
    loadUserStatus,
    updateTagStatus,
    deleteTagMemory,
    deleteTagMemoryOnly,
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
