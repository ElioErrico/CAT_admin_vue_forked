// src/types/user_tools_JSONSchema.ts

export type UserId = string;
export type ToolKey = string;

/** Stato ON/OFF del tool per utente */
export type ToolUserStatus = Record<UserId, boolean>;

/** Mappa generica per setting per-utente */
export type PerUserValue<T = any> = Record<UserId, T>;

/**
 * Nodo tool “wide settings”:
 * - user_id_tool_status: mappa utente -> boolean
 * - ogni altro campo è un setting (es. "allowed_types", "max_file_size_mb", ...)
 *   che mappa utente -> valore (string/number/boolean/array/object)
 */
export interface ToolNode {
  user_id_tool_status: ToolUserStatus;
  // Dynamic settings: per-utente
  [settingKey: string]: ToolUserStatus | PerUserValue<any>;
}

export interface ToolsStatusJSON {
  tools: Record<ToolKey, ToolNode>;
}

/** Esempio conforme al nuovo schema */
export const SAMPLE_TOOLS_STATUS: ToolsStatusJSON = {
  tools: {
    standard_analysis_bot: {
      user_id_tool_status: {
        admin: true,
        elio: true,
      }
      // nessun setting per questo tool
    },
    doc_ingestion: {
      user_id_tool_status: {
        admin: false,
        elio: true,
      },
      // settings presenti → mappa per-utente per ciascun setting
      allowed_types: {
        admin: ["pdf", "docx", "xlsx"],
        elio: ["pdf", "docx", "xlsx", "eml", "msg"],
      },
      max_file_size_mb: {
        admin: 50,
        elio: 100,
      },
      auto_split: {
        admin: true,
        elio: true,
      },
    },
  },
};
