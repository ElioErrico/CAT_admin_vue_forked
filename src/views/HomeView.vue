<script setup lang="ts">
import { useRabbitHole } from '@stores/useRabbitHole'
import { useMessages } from '@stores/useMessages'
import { useMemory } from '@stores/useMemory'
import ModalBox from '@components/ModalBox.vue'
import { capitalize } from 'lodash'

const route = useRoute()
const messagesStore = useMessages()
const { dispatchMessage, selectRandomDefaultMessages } = messagesStore
const { currentState: messagesState } = storeToRefs(messagesStore)
const { can, cannot } = usePerms()
const userMessage = ref(''),
	insertedURL = ref(''),
	isScrollable = ref(false),
	isTwoLines = ref(false)
const boxUploadURL = ref<InstanceType<typeof ModalBox>>()

const { textarea: textArea } = useTextareaAutosize({
	input: userMessage,
	onResize: () => {
		if (textArea.value) {
			isTwoLines.value = textArea.value.clientHeight >= 72
		}
	},
})

const { isListening, toggle: toggleRecording, result: transcript } = useSpeechRecognition()
const { state: micState, isSupported, query: queryMic } = usePermission('microphone', { controls: true })

const { currentState: rabbitHoleState } = storeToRefs(useRabbitHole())

const { wipeConversation } = useMemory()

const inputDisabled = computed(() => {
	return messagesState.value.loading || !messagesState.value.ready || Boolean(messagesState.value.error) || cannot('WRITE', 'CONVERSATION')
})

const randomDefaultMessages = selectRandomDefaultMessages()

const dropContentZone = ref<HTMLDivElement>()

const { download: downloadConversation } = downloadContent('Cat_Conversation')
const { upload: uploadFile } = uploadContent()

/**
 * Calls the specific endpoints based on the mime type of the file
 */
const contentHandler = async (content: string | File[] | null) => {
	if (!content) return
	if (typeof content === 'string') {
		if (content.trim().length == 0) return
		try {
			new URL(content)
			uploadFile('web', content)
		} catch (_) {
			dispatchMessage(content)
		}
	} else content.forEach(f => uploadFile('content', f))
}

/**
 * Handles the drag & drop feature
 */
const { isOverDropZone } = useDropZone(dropContentZone, {
	onLeave: () => {
		isOverDropZone.value = false
	},
	onDrop: (files, evt) => {
		const text = evt.dataTransfer?.getData('text')
		contentHandler(text || files)
	},
})

/**
 * Handles the copy-paste feature
 */
useEventListener<ClipboardEvent>(dropContentZone, 'paste', evt => {
	if ((evt.target as HTMLElement).isEqualNode(textArea.value!)) return
	const text = evt.clipboardData?.getData('text')
	const files = evt.clipboardData?.getData('file') || Array.from(evt.clipboardData?.files ?? [])
	contentHandler(text || files)
})

/**
 * When the user stops recording, the transcript will be sent to the messages service.
 */
watchEffect(() => {
	if (transcript.value === '') return
	userMessage.value = transcript.value
})

/**
 * Toggle recording and plays an audio if enabled
 */
const toggleListening = async () => {
	if (micState.value !== 'granted') {
		const permState = await queryMic()
		if (permState?.state !== 'granted') return
	}
	toggleRecording()
}

/**
 * When a new message arrives, the chat will be scrolled to bottom and the input box will be focussed.
 * If audio is enabled, a pop sound will be played.
 */
watchThrottled(
	messagesState,
	val => {
		scrollToBottom()
		if (!val.generating) textArea.value?.focus()
	},
	{ flush: 'post', throttle: 500, deep: true },
)

onActivated(() => {
	textArea.value?.focus()
})

useEventListener(document, 'scroll', () => {
	const doc = document.documentElement
	isScrollable.value = doc.scrollHeight > doc.clientHeight + doc.scrollTop
})

/**
 * Dispatches the inserted url to the RabbitHole service and closes the modal.
 */
const dispatchWebsite = () => {
	if (!insertedURL.value) return
	try {
		new URL(insertedURL.value)
		uploadFile('web', insertedURL.value)
		boxUploadURL.value?.toggleModal()
	} catch (_) {
		insertedURL.value = ''
	}
}

/**
 * Dispatches the user's message to the Messages service.
 */
const sendMessage = (message: string) => {
	if (message === '') return
	userMessage.value = ''
	dispatchMessage(message)
}

/**
 * Prevent sending the message if the shift key is pressed.
 */
const preventSend = (e: KeyboardEvent) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault()
		sendMessage(userMessage.value)
	}
}

const regenerateResponse = (msgId: string) => {
	const index = messagesState.value.messages.findIndex(m => m.id === msgId)
	if (index === -1) return
	const message = messagesState.value.messages[index - 1]
	messagesState.value.generating = msgId
	messagesState.value.messages[index].text = ''
	dispatchMessage(message.text, false)
}

const generatePlaceholder = (isLoading: boolean, isRecording: boolean, error?: string) => {
	if (error) return 'Well, well, well, looks like something has gone amiss'
	if (isLoading) return 'The enigmatic Cheshire cat is pondering...'
	if (isRecording) return 'The curious Cheshire cat is all ears...'
	return 'Ask the Cheshire Cat...'
}

const wipeHistory = async () => {
	const res = await wipeConversation()
	if (res) {
		messagesState.value.messages = []
		messagesStore.history = []
	}
}

const scrollToBottom = () => {
	if (route.path === '/') window.scrollTo({ behavior: 'smooth', left: 0, top: document.body.scrollHeight })
}

/**
 * ADDED FUNCTION
 */

import { 
    fetchUserStatus,
    updateUserStatus,
    deleteMemoryPoints,
    updateTags
} from '@/services/CustomApiService'
import type { UserStatus } from '@/types'
import UserService from '@services/UserService' // Import UserService
import { useMainStore } from '@stores/useMainStore' // Add this import

const userStatus = ref<UserStatus>({})
const loadingStatus = ref(false)
const statusError = ref<Error | null>(null)
const username = ref('')
const newTagName = ref('')
const boxAddTag = ref<InstanceType<typeof ModalBox>>()
// Add this line for the new prompt modal
const boxPrompt = ref<InstanceType<typeof ModalBox>>()
// Add this line for the selected tag name
const selectedTagName = ref('')

// Add this to get the store and jwtPayload
const mainStore = useMainStore()
const { jwtPayload } = storeToRefs(mainStore)
/**
 * Autocompila la textarea con il testo fornito
 */
 const autofillTextarea = (text: string) => {
	userMessage.value = text;
};


onMounted(() => {
    // Get username from jwtPayload instead of UserService
    username.value = jwtPayload.value?.username || ''
    
    // If we have a username, load user status
    if (username.value) {
        loadUserStatus()
    } else {
        // If no username is available yet, set up a watcher to detect when it becomes available
        const unwatchUsername = watch(() => jwtPayload.value?.username, (newUsername) => {
            if (newUsername) {
                username.value = newUsername
                loadUserStatus()
                // Remove the watcher once we have a username
                unwatchUsername()
            }
        })
    }
})


// Tags dell'utente corrente
const currentUserTags = computed(() => {
    // Now each tag is an object, but for UI compatibility, return a map of tagName -> status (boolean)
    const tags = userStatus.value[username.value] || {}
    // Map to { tagName: status }
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

// Aggiorna lo stato di un tag
const updateTagStatus = async (tagName: string, newStatus: boolean) => {
    try {
        // Create a copy of the current user's tags with proper typing
        const userTags: Record<string, any> = { ...userStatus.value[username.value] || {} }
        
        // If setting a tag to true, set all other tags to false
        if (newStatus) {
            Object.keys(userTags).forEach(tag => {
                // Create a new object for each tag with status false
                // and preserve the prompt_list and selected_prompt if they exist
                const currentTag = userTags[tag];
                
                // Get existing prompt_list and selected_prompt or set defaults
                const promptList = typeof currentTag === 'object' && currentTag !== null 
                    ? (currentTag.prompt_list || [{ prompt_title: "Default", prompt_content: "" }]) 
                    : [{ prompt_title: "Default", prompt_content: "" }];
                
                const selectedPrompt = typeof currentTag === 'object' && currentTag !== null 
                    ? (currentTag.selected_prompt || "") 
                    : "";
                
                // Set all tags to false status while preserving prompt data
                userTags[tag] = { 
                    status: false, 
                    prompt_list: promptList,
                    selected_prompt: selectedPrompt,
                    prompt: "Always answer, you are using the wrong prompt" // Keep for backward compatibility
                };
            });
        }
        
        // Get the current tag value and extract prompt data if it exists
        const currentTagValue = userTags[tagName];
        
        // Get existing prompt_list and selected_prompt or set defaults
        const promptList = typeof currentTagValue === 'object' && currentTagValue !== null 
            ? (currentTagValue.prompt_list || [{ prompt_title: "Default", prompt_content: "" }]) 
            : [{ prompt_title: "Default", prompt_content: "" }];
        
        const selectedPrompt = typeof currentTagValue === 'object' && currentTagValue !== null 
            ? (currentTagValue.selected_prompt || "") 
            : "";
        
        // Set the selected tag to the new status with the existing prompt data
        userTags[tagName] = { 
            status: newStatus, 
            prompt_list: promptList,
            selected_prompt: selectedPrompt,
            prompt: "Always answer, you are using the wrong prompt" // Keep for backward compatibility
        };
        
        const updatedStatus = {
            ...userStatus.value,
            [username.value]: userTags
        };
        
        await updateUserStatus(updatedStatus);
        userStatus.value = updatedStatus;
    } catch (err) {
        statusError.value = err as Error;
        // Revert to previous state in case of error
        userStatus.value = { ...userStatus.value };
    }
}

// Elimina le memory points associate al tag
const deleteTagMemory = async (tagName: string) => {
    try {
        // Include both the tag and the user_id in the filter data
        const filterData = { 
            [tagName]: true,
            [username.value]: true // Add user_id to the filter data
        }
        
        // 1. Delete memory points with the enhanced filter
        await deleteMemoryPoints(filterData)
        
        // 2. Remove tag only from current user
        const updatedStatus = { ...userStatus.value }
        if (updatedStatus[username.value] && tagName in updatedStatus[username.value]) {
            const { [tagName]: _, ...userTags } = updatedStatus[username.value]
            updatedStatus[username.value] = userTags
        }
        
        await updateUserStatus(updatedStatus)
        
        // 3. Update tags list
        const currentTags = Object.keys(userStatus.value[username.value] || {})
        const updatedTags = currentTags.filter(tag => tag !== tagName)
        await updateTags(updatedTags)
        
        userStatus.value = updatedStatus
        console.log(`Tag "${tagName}" eliminato con successo`)
    } catch (err) {
        statusError.value = err as Error
        console.error(`Errore durante l'eliminazione: ${err}`)
    }
}

// Add these refs for the confirmation popup
const showDeleteConfirmation = ref(false)
const deletedTagName = ref('')
const deleteConfirmationTimeout = ref<number | null>(null)
// Delete only memory points associated with a tag without removing the tag itself
const deleteTagMemoryOnly = async (tagName: string) => {
    try {
        // Include both the tag and the user_id in the filter data
        const filterData = { 
            [tagName]: true,
            [username.value]: true // Add user_id to the filter data
        }
        
        // Delete memory points with the filter
        await deleteMemoryPoints(filterData)
        
        // Show confirmation popup
        deletedTagName.value = tagName
        showDeleteConfirmation.value = true
        
        // Clear any existing timeout
        if (deleteConfirmationTimeout.value) {
            window.clearTimeout(deleteConfirmationTimeout.value)
        }
        
        // Hide the confirmation after 3 seconds
        deleteConfirmationTimeout.value = window.setTimeout(() => {
            showDeleteConfirmation.value = false
        }, 3000)
        
        console.log(`Memory points for tag "${tagName}" deleted successfully`)
    } catch (err) {
        statusError.value = err as Error
        console.error(`Error deleting memory points: ${err}`)
    }
}

// Creates a new tag
const createNewTag = async () => {
    try {
        // Create or update tag only for the current user
        const updatedStatus = { ...userStatus.value }
        
        // Initialize user's tags object if it doesn't exist
        if (!updatedStatus[username.value]) {
            updatedStatus[username.value] = {}
        }
        
        // Add the new tag only to the current user with the new structure
        updatedStatus[username.value] = {
            ...updatedStatus[username.value],
            [newTagName.value]: { 
                status: false, 
                prompt_list: [{ 
                    prompt_title: "Default", 
                    prompt_content: "" 
                }],
                selected_prompt: "",
                prompt: "Always answer, you are using the wrong prompt" // Keep for backward compatibility
            }
        }
        
        await updateUserStatus(updatedStatus)
        
        // Update tags list if needed
        const currentTags = Object.keys(userStatus.value[username.value] || {})
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

// Add these refs for the prompt management
const tagPromptContent = ref('')
const tagPromptTitle = ref('')
const editablePromptTitle = ref('') // For editing the title
const editingTitle = ref(false) // Track if we're editing the title
const titleEditInput = ref<HTMLInputElement | null>(null) // Ref for the title edit input
const promptList = ref<Array<{prompt_title: string, prompt_content: string}>>([])
const newPromptMode = ref(false)

// Function to start editing the title
const startEditingTitle = () => {
    editingTitle.value = true
    editablePromptTitle.value = tagPromptTitle.value
    // Focus the input after it's rendered
    nextTick(() => {
        titleEditInput.value?.focus()
    })
}

// Function to cancel title editing
const cancelTitleEdit = () => {
    editingTitle.value = false
    editablePromptTitle.value = tagPromptTitle.value
}

// Function to update the prompt title
const updatePromptTitle = async () => {
    // Don't update if title is empty or unchanged
    if (!editablePromptTitle.value || editablePromptTitle.value === tagPromptTitle.value) {
        editingTitle.value = false
        // Reset to original if empty
        if (!editablePromptTitle.value) {
            editablePromptTitle.value = tagPromptTitle.value
        }
        return
    }
    
    try {
        // Create a copy of the current user's tags
        const userTags: Record<string, any> = { ...userStatus.value[username.value] || {} }
        
        // Get the current tag data
        const tagData = userTags[selectedTagName.value] || { 
            status: false,
            prompt_list: [{ prompt_title: "Default", prompt_content: "" }],
            selected_prompt: ""
        }
        
        // Get existing prompt_list
        let currentPromptList = Array.isArray(tagData.prompt_list) ? 
            [...tagData.prompt_list] : 
            [{ prompt_title: "Default", prompt_content: "" }]
        
        // Find the prompt to update
        const promptIndex = currentPromptList.findIndex(p => p.prompt_title === tagPromptTitle.value)
        if (promptIndex >= 0) {
            // Check if the new title already exists
            const titleExists = currentPromptList.some(p => p.prompt_title === editablePromptTitle.value)
            if (titleExists) {
                // Reset to original if duplicate
                editablePromptTitle.value = tagPromptTitle.value
                console.error(`A prompt with title "${editablePromptTitle.value}" already exists`)
                return
            }
            
            // Update the title
            currentPromptList[promptIndex].prompt_title = editablePromptTitle.value
            
            // Update the tag with new data
            userTags[selectedTagName.value] = { 
                status: typeof tagData === 'object' ? tagData.status : false,
                prompt_list: currentPromptList,
                selected_prompt: tagData.selected_prompt,
                prompt: "Always answer, you are using the wrong prompt" // Keep for backward compatibility
            }
            
            // Update the user status
            const updatedStatus = {
                ...userStatus.value,
                [username.value]: userTags
            }
            
            await updateUserStatus(updatedStatus)
            userStatus.value = updatedStatus
            
            // Update local prompt list and selected title
            promptList.value = currentPromptList
            tagPromptTitle.value = editablePromptTitle.value
            
            console.log(`Prompt title updated from "${tagPromptTitle.value}" to "${editablePromptTitle.value}"`)
        }
    } catch (err) {
        // Reset to original on error
        editablePromptTitle.value = tagPromptTitle.value
        statusError.value = err as Error
        console.error(`Error updating prompt title: ${err}`)
    }
    
    // Exit editing mode
    editingTitle.value = false
}
// Update this to handle the new prompt structure
const openPromptModal = (tagName: string) => {
    selectedTagName.value = tagName
    newPromptMode.value = false
    
    // Get the current tag's data
    const userTags = userStatus.value[username.value] || {}
    const tagData = userTags[tagName]
    
    // Set the prompt list and selected prompt if they exist
    if (typeof tagData === 'object' && tagData !== null) {
        // Get the prompt_list or set default
        promptList.value = tagData.prompt_list || [{ 
            prompt_title: "Default", 
            prompt_content: "" 
        }]
        
        // Get the selected prompt content
        const selectedPrompt = tagData.selected_prompt || ""
        
        // Find the prompt in the list that matches the selected_prompt
        const selectedPromptObj = promptList.value.find(p => p.prompt_content === selectedPrompt)
        
        if (selectedPromptObj) {
            tagPromptTitle.value = selectedPromptObj.prompt_title
            tagPromptContent.value = selectedPromptObj.prompt_content
        } else if (promptList.value.length > 0) {
            // Default to first prompt if selected not found
            tagPromptTitle.value = promptList.value[0].prompt_title
            tagPromptContent.value = promptList.value[0].prompt_content
        } else {
            tagPromptTitle.value = "Default"
            tagPromptContent.value = ""
        }
    } else {
        // Initialize with defaults if no data
        promptList.value = [{ prompt_title: "Default", prompt_content: "" }]
        tagPromptTitle.value = "Default"
        tagPromptContent.value = ""
    }
    
    boxPrompt.value?.toggleModal()
}

// Add this function to save the prompt
const saveTagPrompt = async () => {
    try {
        // Create a copy of the current user's tags
        const userTags: Record<string, any> = { ...userStatus.value[username.value] || {} }
        
        // Get the current tag data
        const tagData = userTags[selectedTagName.value] || { 
            status: false,
            prompt_list: [{ prompt_title: "Default", prompt_content: "" }],
            selected_prompt: ""
        }
        
        // Get existing prompt_list or create default
        let currentPromptList = Array.isArray(tagData.prompt_list) ? 
            [...tagData.prompt_list] : 
            [{ prompt_title: "Default", prompt_content: "" }]
        
        if (newPromptMode.value) {
            // Add new prompt to the list
            currentPromptList.push({
                prompt_title: tagPromptTitle.value,
                prompt_content: tagPromptContent.value
            })
        } else {
            // Update existing prompt in the list
            const promptIndex = currentPromptList.findIndex(p => p.prompt_title === tagPromptTitle.value)
            if (promptIndex >= 0) {
                currentPromptList[promptIndex].prompt_content = tagPromptContent.value
            } else {
                // If not found, add as new
                currentPromptList.push({
                    prompt_title: tagPromptTitle.value,
                    prompt_content: tagPromptContent.value
                })
            }
        }
        
        // Update the tag with new data
        userTags[selectedTagName.value] = { 
            status: typeof tagData === 'object' ? tagData.status : false,
            prompt_list: currentPromptList,
            selected_prompt: tagPromptContent.value, // Set selected prompt to current content
            prompt: "Always answer, you are using the wrong prompt" // Keep for backward compatibility
        }
        
        // Update the user status
        const updatedStatus = {
            ...userStatus.value,
            [username.value]: userTags
        }
        
        await updateUserStatus(updatedStatus)
        userStatus.value = updatedStatus
        
        // Update local prompt list
        promptList.value = currentPromptList
        
        // Reset new prompt mode
        newPromptMode.value = false
        
        console.log(`Prompt for tag "${selectedTagName.value}" saved successfully`)
    } catch (err) {
        statusError.value = err as Error
        console.error(`Error saving prompt: ${err}`)
    }
}

// Add function to create a new prompt
const createNewPrompt = () => {
    newPromptMode.value = true
    tagPromptTitle.value = ""
    tagPromptContent.value = ""
}

// Add function to select a prompt from the list
const selectPrompt = (promptObj: {prompt_title: string, prompt_content: string}) => {
    newPromptMode.value = false
    tagPromptTitle.value = promptObj.prompt_title
    tagPromptContent.value = promptObj.prompt_content
}

// Add function to handle prompt selection from dropdown
const onPromptSelect = () => {
    // Find the selected prompt in the list
    const selectedPrompt = promptList.value.find(p => p.prompt_title === tagPromptTitle.value)
    if (selectedPrompt) {
        tagPromptContent.value = selectedPrompt.prompt_content
    }
}

// Add function to cancel new prompt creation
const cancelNewPrompt = () => {
    newPromptMode.value = false
    // Reset to the first prompt in the list or default values
    if (promptList.value.length > 0) {
        tagPromptTitle.value = promptList.value[0].prompt_title
        tagPromptContent.value = promptList.value[0].prompt_content
    } else {
        tagPromptTitle.value = "Default"
        tagPromptContent.value = ""
    }
}

// Add function to delete the current prompt
const deleteCurrentPrompt = async () => {
    // Don't allow deleting the last prompt
    if (promptList.value.length <= 1) return
    
    try {
        // Create a copy of the current user's tags
        const userTags: Record<string, any> = { ...userStatus.value[username.value] || {} }
        
        // Get the current tag data
        const tagData = userTags[selectedTagName.value] || { 
            status: false,
            prompt_list: [{ prompt_title: "Default", prompt_content: "" }],
            selected_prompt: ""
        }
        
        // Filter out the current prompt
        let updatedPromptList = tagData.prompt_list.filter(
            (p: {prompt_title: string, prompt_content: string}) => 
            p.prompt_title !== tagPromptTitle.value
        )
        
        // If we somehow deleted all prompts, add a default one
        if (updatedPromptList.length === 0) {
            updatedPromptList = [{ prompt_title: "Default", prompt_content: "" }]
        }
        
        // Update selected_prompt if we deleted the currently selected one
        let updatedSelectedPrompt = tagData.selected_prompt
        if (tagData.selected_prompt === tagPromptContent.value) {
            updatedSelectedPrompt = updatedPromptList[0].prompt_content
        }
        
        // Update the tag with new data
        userTags[selectedTagName.value] = { 
            status: typeof tagData === 'object' ? tagData.status : false,
            prompt_list: updatedPromptList,
            selected_prompt: updatedSelectedPrompt,
            prompt: "Always answer, you are using the wrong prompt" // Keep for backward compatibility
        }
        
        // Update the user status
        const updatedStatus = {
            ...userStatus.value,
            [username.value]: userTags
        }
        
        await updateUserStatus(updatedStatus)
        userStatus.value = updatedStatus
        
        // Update local prompt list
        promptList.value = updatedPromptList
        
        // Select the first prompt in the list
        tagPromptTitle.value = updatedPromptList[0].prompt_title
        tagPromptContent.value = updatedPromptList[0].prompt_content
        
        console.log(`Prompt "${tagPromptTitle.value}" deleted successfully`)
    } catch (err) {
        statusError.value = err as Error
        console.error(`Error deleting prompt: ${err}`)
    }
}


</script>

<template>
	<div
		ref="dropContentZone"
		class="relative flex w-full max-w-screen-xl flex-col justify-center gap-4 self-center overflow-hidden !pt-0 text-sm"
		:class="{
			'pb-16 md:pb-20': !isTwoLines,
			'pb-24 md:pb-28': isTwoLines,
		}">

		<div v-if="isOverDropZone" class="flex size-full grow flex-col items-center justify-center py-4 md:pb-0">
			<div class="relative flex w-full grow items-center justify-center rounded-md border-2 border-dashed border-primary p-2 md:p-4">
				<p class="text-lg md:text-xl">
					Drop
					<span class="font-medium text-primary"> files </span>
					to send to the Cheshire Cat, meow!
				</p>
				<button class="btn btn-circle btn-error btn-sm absolute right-2 top-2" @click="isOverDropZone = false">
					<heroicons-x-mark-20-solid class="size-6" />
				</button>
			</div>
		</div>
		<ErrorBox v-if="!messagesState.ready" :load="messagesState.loading" :error="messagesState.error" />
		<div v-else-if="messagesState.messages.length > 0" class="flex grow flex-col">
			<MessageBox
				v-for="msg in messagesState.messages"
				:key="msg.id"
				:sender="msg.sender"
				:text="msg.text"
				:when="msg.when"
				:file="msg.sender === 'user' ? msg.file : undefined"
				:why="msg.sender === 'bot' ? msg.why : undefined"
				class="overflow-x-auto overflow-y-hidden"
				@regenerate="regenerateResponse(msg.id)" />
			<p v-if="messagesState.error" class="w-fit rounded-md bg-error p-4 font-semibold text-base-100">
				{{ messagesState.error }}
			</p>
			<div v-else-if="!messagesState.error && messagesState.loading && !messagesState.generating" class="mb-2 ml-2 flex items-center gap-2">
				<span class="text-lg">😺</span>
				<p class="flex items-center gap-2">
					<span class="loading loading-dots loading-xs shrink-0" />
					Cheshire Cat is thinking...
				</p>
			</div>
		</div>
		<div v-else-if="can('WRITE', 'CONVERSATION')" class="flex grow cursor-pointer flex-col items-center justify-center gap-4 p-4">
			<div
				v-for="(msg, index) in randomDefaultMessages"
				:key="index"
				class="btn btn-neutral font-medium text-base-100 shadow-lg"
				@click="sendMessage(msg)">
				{{ msg }}
			</div>
		</div>
		<div v-else class="grow" />
		<div class="fixed bottom-0 left-0 flex w-full items-center justify-center bg-gradient-to-t from-base-200 px-2 py-4">
			<div class="flex w-full max-w-screen-xl items-center gap-2 md:gap-4">

				<!-- 	DROP DOWN ORIGINALE  -->
				<div class="dropdown dropdown-top">
					<button tabindex="0" :disabled="inputDisabled" class="btn btn-circle btn-primary shadow-lg">
						<heroicons-bolt-solid class="size-5" />
					</button>
					<ul tabindex="0" class="dropdown-content join join-vertical !left-0 z-10 mb-6 w-48 p-0 [&>li>*]:bg-base-100">
						<li>
							<button
								:disabled="messagesState.messages.length === 0"
								class="btn join-item w-full flex-nowrap px-2 text-left font-medium"
								@click="downloadConversation(messagesState.messages.reduce((p, c) => `${p}${capitalize(c.sender)}: ${c.text}\n`, ''))">
								<span class="rounded-lg p-1 text-primary">
									<ph-export-bold class="size-5" />
								</span>
								<span class="grow">Export conversation</span>
							</button>
						</li>
						<li>
							<button
								:disabled="rabbitHoleState.loading"
								class="btn join-item w-full flex-nowrap px-2 text-left font-medium"
								@click="uploadFile('memory')">
								<span class="rounded-lg p-1 text-success">
									<ph-brain-fill class="size-5" />
								</span>
								<span class="grow">Upload memories</span>
							</button>
						</li>
						<li>
							<button
								:disabled="rabbitHoleState.loading"
								class="btn join-item w-full flex-nowrap px-2 text-left font-medium"
								@click="boxUploadURL?.toggleModal()">
								<span class="rounded-lg p-1 text-info">
									<heroicons-globe-alt class="size-5" />
								</span>
								<span class="grow">Upload url</span>
							</button>
						</li>
						<li>
							<button
								:disabled="rabbitHoleState.loading"
								class="btn join-item w-full flex-nowrap px-2 text-left font-medium"
								@click="uploadFile('content')">
								<span class="rounded-lg p-1 text-warning">
									<heroicons-document-text-solid class="size-5" />
								</span>
								<span class="grow">Upload file</span>
							</button>
						</li>
						<li>
							<button class="btn join-item w-full flex-nowrap px-2 text-left font-medium" @click="wipeHistory()">
								<span class="rounded-lg p-1 text-error">
									<heroicons-trash-solid class="size-5" />
								</span>
								<span class="grow">Clear conversation</span>
							</button>
						</li>
					</ul>
				</div>

				<!-- DROP DOWN AGGIUNTIVO -->

				<div class="dropdown dropdown-top">
					<button tabindex="0" :disabled="inputDisabled" class="btn btn-circle btn-primary shadow-lg">
						<heroicons-clipboard-document-list-solid class="size-5" />
					</button>
					<ul tabindex="0" class="dropdown-content join join-vertical !left-0 z-10 mb-6 w-[30rem] p-0 [&>li>*]:bg-base-100"
					    :class="{'max-h-[700px] overflow-y-auto': Object.keys(currentUserTags).length > 15}">
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
						        :class="{'bg-success/20': status}"
						        @click="updateTagStatus(String(tagName), !status)">
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
								<span class="rounded-lg p-1 text-primary cursor-pointer hover:bg-base-200"
						              @click.stop="openPromptModal(String(tagName))"
                                      title="Edit prompts">
						            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
						              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
						            </svg>
						        </span>
								<!-- NEW Delete memory points only button -->
								<span class="rounded-lg p-1 text-warning cursor-pointer hover:bg-base-200"
									@click.stop="deleteTagMemoryOnly(String(tagName))"
                                    title="Delete content">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
									<path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125 2.25 2.25m0 0 2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
									</svg>
								</span>
        						<!-- Delete tag and memory button -->								
						        <span 
						            class="rounded-lg p-1 text-error cursor-pointer hover:bg-base-200"
						            @click.stop="deleteTagMemory(String(tagName))"
                                    title="Delete content and tag">
						            <heroicons-trash-solid class="size-4 shrink-0" />
						        </span>
						    </button>
						</li>
						
						<!-- Shortcut per aggiungere un nuovo tag -->
						<li class="w-full">
							<button
								class="btn join-item flex-nowrap px-2 text-left font-medium w-full"
								@click="boxAddTag?.toggleModal()">
								<span class="rounded-lg p-1 text-primary">
									<heroicons-plus-circle-20-solid class="size-5 shrink-0" />
								</span>
								<span class="grow truncate max-w-[25rem]">Aggiungi nuovo tag</span>
							</button>
						</li>
					</ul>
				</div>
				<!-- FINE DROP DOWN AGGIUNTIVO -->




				<div class="relative w-full">
					<textarea
						ref="textArea"
						v-model.trim="userMessage"
						:disabled="inputDisabled"
						autofocus
						:class="'textarea block max-h-20 w-full resize-none overflow-auto bg-base-200 pr-10 !outline-2 shadow-lg !outline-offset-0 pt-[10px]'"
						:placeholder="generatePlaceholder(messagesState.loading, isListening, messagesState.error)"
						@keydown="preventSend" />
					<div class="absolute right-2 top-1/2 -translate-y-1/2">
						<button
							:disabled="inputDisabled || userMessage.length === 0"
							class="btn btn-circle btn-ghost btn-sm self-center"
							@click="sendMessage(userMessage)">
							<heroicons-paper-airplane-solid class="size-6" />
						</button>
					</div>
				</div>
				<button
					v-if="isSupported"
					class="btn btn-circle btn-primary shadow-lg"
					:class="[isListening ? 'glass btn-outline' : '']"
					:disabled="inputDisabled"
					@click="toggleListening()">
					<heroicons-microphone-solid class="size-6" />
				</button>
			</div>
			<button
				v-if="isScrollable"
				class="btn btn-circle btn-outline btn-primary btn-sm absolute bottom-28 right-4 bg-base-100"
				@click="scrollToBottom()">
				<heroicons-arrow-down-20-solid class="size-5" />
			</button>
				<!-- Add this right before the closing </div> of the main container -->
		<div 
			v-if="showDeleteConfirmation" 
			class="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-success text-success-content px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2"
		>
			<heroicons-check-circle-solid class="size-5" />
			<span>Memory points for tag "{{ deletedTagName }}" deleted successfully!</span>
		</div>
		</div>
		<Teleport to="#modal">
			<ModalBox ref="boxUploadURL">
				<div class="flex flex-col items-center justify-center gap-4 text-neutral">
					<h3 class="text-lg font-bold">Insert URL</h3>
					<p>Write down the URL you want the Cat to digest :</p>
					<InputBox v-model.trim="insertedURL" placeholder="Enter url..." />
					<button class="btn btn-primary btn-sm" @click="dispatchWebsite">Send</button>
				</div>
			</ModalBox>
			
			<ModalBox ref="boxAddTag">
				<div class="flex flex-col items-center justify-center gap-4 text-neutral">
					<h3 class="text-lg font-bold">Nuovo Tag</h3>
					<p>Inserisci il nome del nuovo tag:</p>
					<InputBox v-model.trim="newTagName" placeholder="Nome tag..." />
					<button class="btn btn-primary btn-sm" @click="createNewTag">Crea Tag</button>
				</div>
			</ModalBox>

		<!-- NEW MODAL FOR PROMPT -->
		<ModalBox ref="boxPrompt">
		<div 
			class="flex flex-col items-center justify-between gap-1 text-neutral"
			style="width: 100%; max-width: 500px; min-width: 450px;"
		>
			<!-- Add exit button in the top-right corner -->
			<button 
				class="btn btn-circle btn-error absolute right-[725px] min-h-0 h-4 w-4"
				@click="boxPrompt?.toggleModal()"
				title="Close"
			>
				<heroicons-x-mark-20-solid class="size-3" />
			</button>

			<h3 class="text-2xl font-bold mb-2 w-full text-center">{{ selectedTagName }}</h3>
			<div v-if="selectedTagName" class="w-full flex flex-col gap-4">
				<!-- Prompt Selection - Simplified UI with inline editing -->
				<div class="form-control w-full">
					<div class="flex items-center justify-between h-8">
						<div class="flex-1">
							<select 
								v-if="!newPromptMode && !editingTitle" 
								v-model="tagPromptTitle" 
								class="select select-bordered select-sm w-full text-sm h-9 min-h-0"
								@change="onPromptSelect"
								@dblclick="startEditingTitle"
							>
								<option 
									v-for="prompt in promptList" 
									:key="prompt.prompt_title" 
									:value="prompt.prompt_title"
								>
									{{ prompt.prompt_title }}
								</option>
							</select>
							<input 
								v-else-if="!newPromptMode && editingTitle"
								v-model="editablePromptTitle" 
								class="input input-bordered input-sm w-full text-sm h-8"
								placeholder="Edit prompt title..."
								@blur="updatePromptTitle"
								@keydown.enter="updatePromptTitle"
								@keydown.esc="cancelTitleEdit"
								ref="titleEditInput"
							/>
							<input 
								v-else 
								v-model="tagPromptTitle" 
								class="input input-bordered input-sm w-full text-sm h-8" 
								placeholder="New prompt title..."
							/>
						</div>
						<div class="flex gap-1 ml-2">
							<button 
								v-if="!newPromptMode && !editingTitle && promptList.length > 1" 
								class="btn btn-xs btn-ghost text-error p-1" 
								@click="deleteCurrentPrompt"
								title="Delete prompt"
							>
								<heroicons-trash-solid class="size-4" />
							</button>
							<button 
								v-if="!newPromptMode && !editingTitle"
								class="btn btn-xs btn-ghost text-warning p-1" 
								@click="startEditingTitle"
								title="Edit title"
							>
								<heroicons-pencil-square-solid class="size-4" />
							</button>
							<button 
								class="btn btn-xs btn-ghost text-primary p-1" 
								@click="createNewPrompt"
								title="New prompt"
							>
								<heroicons-plus-circle-20-solid class="size-4" />
							</button>
						</div>
					</div>
				</div>
				
				<!-- Prompt Content -->
				<div class="form-control">
					<textarea 
						v-model="tagPromptContent" 
						class="textarea textarea-bordered min-h-[220px] h-[35vh] max-h-[50vh] w-full text-base overflow-y-auto"
						style="resize: both; max-width: 470px; min-width: 470px; scrollbar-width: thin;"
						placeholder="Enter prompt content..."
					></textarea>
				</div>
				
				<!-- Action Buttons -->
				<div class="flex justify-between">
					<button 
						v-if="newPromptMode" 
						class="btn btn-sm btn-outline" 
						@click="cancelNewPrompt"
					>
						Cancel
					</button>
					<div class="flex-grow"></div>
					<button 
						class="btn btn-sm btn-primary px-6" 
						@click="saveTagPrompt"
					>
						{{ newPromptMode ? 'Add Prompt' : 'Save' }}
					</button>
				</div>
			</div>
		</div>
	</ModalBox>
</Teleport>
	</div>
</template>
