import { type FileOperationType } from './widgets'

export * from './widgets'

export abstract class UI {
	abstract promptUser(label: string, prompt: string): Promise<string | null>
	abstract askUser(label: string, question: string): Promise<string>
	abstract log(line: string): void
	abstract getYesToAll(): boolean
	abstract closeFileOperation(): void
	abstract setFileOperation(type: FileOperationType, fileName: string, fileContents: string): void
}