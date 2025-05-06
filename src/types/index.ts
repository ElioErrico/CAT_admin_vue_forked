export interface UserStatus {
    [username: string]: {
        [tagName: string]: {
            status: boolean
            prompt: string
        }
    }
}