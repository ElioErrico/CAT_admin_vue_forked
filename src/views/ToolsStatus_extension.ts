// src/views/ToolsStatus_extension.ts
import { ref, computed, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { fetchToolsStatus, updateToolsStatus } from "@/services/CustomApiService";
import type { ToolsStatusJSON, ToolNode } from "@/types/user_tools_JSONSchema";
import { useMainStore } from "@stores/useMainStore";

/* ----------------------------- helpers ----------------------------- */
function ensureToolNode(data: ToolsStatusJSON, toolKey: string) {
  data.tools ||= {};
  data.tools[toolKey] ||= { user_id_tool_status: {} };
}

function isSettingKey(key: string): boolean {
  if (key === "user_id_tool_status") return false;
  // ignora eventuali chiavi legacy o tecniche
  if (key.endsWith("_settings") || key.endsWith("_status")) return false;
  return true;
}

function isPlainObject(v: any): v is Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v);
}

function listSettingKeys(node?: ToolNode): string[] {
  if (!node) return [];
  // Considera setting solo le chiavi che sono mappe per-utente (plain object)
  return Object.keys(node).filter((k) => {
    if (!isSettingKey(k)) return false;
    const val = (node as any)[k];
    return isPlainObject(val); // mappa utente -> valore
  });
}


function getPerUserSetting<T = any>(node: ToolNode | undefined, settingKey: string, userId: string): T | undefined {
  if (!node) return undefined;
  const map = node[settingKey] as Record<string, T> | undefined;
  return map ? (map[userId] as T) : undefined;
}

/* ------------------------------ main factory ----------------------------- */
export function getRawSettingsMap(tool: ToolNode): Record<string, Record<string, any>> {
  const out: Record<string, Record<string, any>> = {};
  for (const k of listSettingKeys(tool)) {
    out[k] = (tool as any)[k] as Record<string, any>;
  }
  return out;
}

export function setupToolsStatusExtension() {
  const toolsStatus = ref<ToolsStatusJSON>({ tools: {} })
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<Error | null>(null)

  // utente corrente
  const mainStore = useMainStore()
  const { jwtPayload } = storeToRefs(mainStore)
  const currentUserId = ref('')

  // --- helpers base ---
  const ensureToolNode = (data: ToolsStatusJSON, toolKey: string) => {
    data.tools ||= {}
    data.tools[toolKey] ||= { user_id_tool_status: {} }
    ;(data.tools[toolKey] as any).user_id_tool_status ||= {}
  }
  const isPlainObject = (v: any): v is Record<string, any> =>
    v && typeof v === 'object' && !Array.isArray(v)

  // consideriamo "setting" solo chiavi diverse da user_id_tool_status
  // ed evitiamo eventuali chiavi legacy *_settings / *_status
  const isSettingKey = (k: string) =>
    k !== 'user_id_tool_status' && !k.endsWith('_settings') && !k.endsWith('_status')

  // --- load iniziale username + stato ---
  onMounted(() => {
    const uid = jwtPayload.value?.username || ''
    if (uid) {
      currentUserId.value = uid
      void loadToolsStatus()
    } else {
      const stop = watch(
        () => jwtPayload.value?.username,
        (u) => {
          if (u) {
            currentUserId.value = u
            void loadToolsStatus()
            stop()
          }
        },
        { immediate: true }
      )
    }
  })

  // --- API locali ---
  const loadToolsStatus = async () => {
    try {
      loading.value = true
      error.value = null
      toolsStatus.value = await fetchToolsStatus()
    } catch (e: any) {
      error.value = e
      // mantieni lo stato precedente per sicurezza
      toolsStatus.value = toolsStatus.value || { tools: {} }
    } finally {
      loading.value = false
    }
  }

  type ToolRow = { key: string; enabled: boolean }

  const toolsForDropdown = computed<ToolRow[]>(() => {
    const uid = currentUserId.value || ''
    const dict = toolsStatus.value?.tools || {}
    return Object.entries(dict)
      .map(([key, node]) => {
        const map = (node?.user_id_tool_status || {}) as Record<string, boolean>
        return { key, enabled: Boolean(map[uid]) }
      })
      .sort((a, b) => a.key.localeCompare(b.key))
  })

  const toggleTool = async (toolKey: string, enabled: boolean) => {
    if (!currentUserId.value) return
    try {
      saving.value = true
      error.value = null
      const latest = await fetchToolsStatus()
      ensureToolNode(latest, toolKey)
      ;(latest.tools[toolKey] as any).user_id_tool_status[currentUserId.value] = Boolean(enabled)
      await updateToolsStatus(latest)
      toolsStatus.value = latest
    } catch (e: any) {
      error.value = e
    } finally {
      saving.value = false
    }
  }

  const toggleAllTools = async (enabled: boolean) => {
    if (!currentUserId.value) return
    try {
      saving.value = true
      error.value = null
      const latest = await fetchToolsStatus()
      latest.tools ||= {}
      for (const toolKey of Object.keys(latest.tools)) {
        ensureToolNode(latest, toolKey)
        ;(latest.tools[toolKey] as any).user_id_tool_status[currentUserId.value] = Boolean(enabled)
      }
      await updateToolsStatus(latest)
      toolsStatus.value = latest
    } catch (e: any) {
      error.value = e
    } finally {
      saving.value = false
    }
  }

  /** Elenco chiavi setting (solo mappe per-utente) */
  const getSettingKeys = (toolKey: string): string[] => {
    const node = toolsStatus.value.tools?.[toolKey] as ToolNode | undefined
    if (!node) return []
    return Object.keys(node).filter((k) => isSettingKey(k) && isPlainObject((node as any)[k]))
  }

  /** Mappa completa userId -> valore per uno specifico setting */
  const getSettingUserMap = (toolKey: string, settingKey: string): Record<string, any> => {
    const node = toolsStatus.value.tools?.[toolKey] as any
    const m = node?.[settingKey]
    return isPlainObject(m) ? (m as Record<string, any>) : {}
  }

  /** Valore di un setting per l'utente corrente (o per userId fornito) */
  const getSettingForUser = (toolKey: string, settingKey: string, userId?: string): any => {
    const uid = userId || currentUserId.value
    const map = getSettingUserMap(toolKey, settingKey)
    return map[uid]
  }

  /** Oggetto { settingKey: valueUtenteCorrente } */
  const getCurrentUserSettings = (toolKey: string): Record<string, any> => {
    const out: Record<string, any> = {}
    for (const sk of getSettingKeys(toolKey)) {
      out[sk] = getSettingForUser(toolKey, sk)
    }
    return out
  }

  /** Aggiorna UN singolo setting per l'utente corrente (read-latest -> write) */
  const updateSettingForCurrentUser = async (toolKey: string, settingKey: string, value: any) => {
    if (!currentUserId.value) return
    try {
      saving.value = true
      error.value = null
      const latest = await fetchToolsStatus()
      ensureToolNode(latest, toolKey)
      const node = latest.tools[toolKey] as any
      if (!isPlainObject(node[settingKey])) node[settingKey] = {}
      node[settingKey][currentUserId.value] = value
      await updateToolsStatus(latest)
      toolsStatus.value = latest
    } catch (e: any) {
      error.value = e
    } finally {
      saving.value = false
    }
  }

  /** Aggiorna PIÙ setting per l'utente corrente in un colpo solo */
  const saveSettingsForCurrentUser = async (toolKey: string, payload: Record<string, any>) => {
    if (!currentUserId.value) return
    try {
      saving.value = true
      error.value = null
      const latest = await fetchToolsStatus()
      ensureToolNode(latest, toolKey)
      const node = latest.tools[toolKey] as any
      for (const [sk, val] of Object.entries(payload)) {
        if (!isSettingKey(sk)) continue
        if (!isPlainObject(node[sk])) node[sk] = {}
        node[sk][currentUserId.value] = val
      }
      await updateToolsStatus(latest)
      toolsStatus.value = latest
    } catch (e: any) {
      error.value = e
    } finally {
      saving.value = false
    }
  }

  return {
    // stato
    toolsStatus,
    loading,
    saving,
    error,
    currentUserId,

    // dati per la UI
    toolsForDropdown,

    // azioni
    loadToolsStatus,
    toggleTool,
    toggleAllTools,

    // lettura settings
    getSettingKeys,
    getSettingForUser,
    getSettingUserMap,       // <— usato per inferenza tipo in ToolsDropdown
    getCurrentUserSettings,

    // scrittura settings
    updateSettingForCurrentUser,
    saveSettingsForCurrentUser,
  }
}

export type ToolsStatusExtensionApi = ReturnType<typeof setupToolsStatusExtension>;
