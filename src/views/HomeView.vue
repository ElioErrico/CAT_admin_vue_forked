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
    return userStatus.value[username.value] || {}
})

// Carica lo stato dei tag
// Remove the original loadUserStatus function and replace with:
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
        const updatedStatus = {
            ...userStatus.value,
            [username.value]: {
                ...userStatus.value[username.value],
                [tagName]: newStatus
            }
        }
        
        await updateUserStatus(updatedStatus)
        userStatus.value = updatedStatus
    } catch (err) {
        statusError.value = err as Error
        userStatus.value[username.value][tagName] = !newStatus
    }
}

// Elimina le memory points associate al tag
const deleteTagMemory = async (tagName: string) => {
    try {
        const filterData = { [tagName]: true }
        
        // 1. Delete memory points
        await deleteMemoryPoints(filterData)
        
        // 2. Remove tag from all users
        const updatedStatus = { ...userStatus.value }
        Object.keys(updatedStatus).forEach(user => {
            if (updatedStatus[user] && tagName in updatedStatus[user]) {
                const { [tagName]: _, ...userTags } = updatedStatus[user]
                updatedStatus[user] = userTags
            }
        })
        
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

// Creates a new tag
const createNewTag = async () => {
    try {
        const updatedStatus = { ...userStatus.value }
        Object.keys(updatedStatus).forEach(user => {
            updatedStatus[user] = {
                ...updatedStatus[user],
                [newTagName.value]: false
            }
        })
        
        await updateUserStatus(updatedStatus)
        
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
						        <span 
						            class="rounded-lg p-1 text-error cursor-pointer hover:bg-base-200"
						            @click.stop="deleteTagMemory(String(tagName))">
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
		</Teleport>
	</div>
</template>
