export interface UserStatus {
    [username: string]: {
        [tagName: string]: {
            status: boolean
            prompt: string
            prompt_list: {
                prompt_title: string
                prompt_content: string
            }[]
            selected_prompt: string
        }
    }
}