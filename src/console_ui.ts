import readline from 'readline'

import { UI, FileOperationType } from './ui'

export class ConsoleUI extends UI {
    private rl: readline.Interface

    constructor() {
        super()
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
    }

    promptUser(label: string, prompt: string): Promise<string | null> {
        return new Promise((resolve) => {
            this.rl.question(`${label}: ${prompt}\n`, (answer) => {
                resolve(answer || null)
            })
        })
    }

    askUser(label: string, question: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(`${label}: ${question}\n`, (answer) => {
                resolve(answer)
            })
        })
    }

    log(line: string): void {
        console.log(line)
    }

    close(): void {
        this.rl.close()
    }

    getYesToAll(): boolean {
        return true // Implement your logic to return true if "Yes to all" is enabled
    }

    setFileOperation(type: FileOperationType, fileName: string, _: string): void {
        // Implement your logic to handle file operations
        console.log(`File operation ${type} on ${fileName}`)
    }

    closeFileOperation(): void {}
}