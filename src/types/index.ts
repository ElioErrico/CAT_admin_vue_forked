// src/types/Index.ts
export interface PromptItem {
    prompt_title: string;
    prompt_content: string;
  }
  
  export interface TagConfig {
    status: boolean;
    prompt: string;
    prompt_list: PromptItem[];
    selected_prompt: string;
    /** Elenco file associati al tag; può mancare nel JSON */
    documents?: string[];
  }
  
  /** username -> tagName -> configurazione del tag */
  export type UserStatus = Record<string, Record<string, TagConfig>>;
  