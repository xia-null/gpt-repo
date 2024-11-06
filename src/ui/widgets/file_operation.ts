import blessed from 'blessed'
import { Widget } from '../widget'

export type FileOperationOptions = blessed.Widgets.BoxOptions
export enum FileOperationType {
  Create = 'Create File',
  Edit = 'Edit File',
  Delete = 'Delete File'
}

export class FileOperation extends Widget {
  protected readonly boxElement: blessed.Widgets.BoxElement

  static getBgForOperation(fileOp: FileOperationType): string {
    switch (fileOp) {
      case FileOperationType.Create: {
        return '#339900'
      }

      case FileOperationType.Edit: {
        return '#ff9933'
      }

      case FileOperationType.Delete: {
        return '#993333'
      }
    }
  }

  static getBorderFgForOperation(fileOp: FileOperationType): string {
    switch (fileOp) {
      case FileOperationType.Create: {
        return '#33ff00'
      }

      case FileOperationType.Edit: {
        return '#ffff00'
      }

      case FileOperationType.Delete: {
        return '#ff3333'
      }
    }
  }

  static getHoverBgForOperation(fileOp: FileOperationType): string {
    switch (fileOp) {
      case FileOperationType.Create: {
        return '#116600'
      }

      case FileOperationType.Edit: {
        return '#aaaa00'
      }

      case FileOperationType.Delete: {
        return '#aa0000'
      }
    }
  }

  getRootElements(): blessed.Widgets.BlessedElement[] {
    return [this.boxElement]
  }

  constructor(options: FileOperationOptions = {}, fileOp: FileOperationType, fileName: string, fileContent: string) {
    super()

    this.boxElement = blessed.box({
      ...options,

      scrollable: true,

      label: options.label ?? `${fileOp}: ${fileName}`,
      content: options.content ?? fileContent,

      border: options.border ?? {
        type: 'line'
      },

      style: {
        ...(options.style ?? {}),

        fg: options.style?.fg ?? 'white',
        bg: options.style?.bg ?? FileOperation.getBgForOperation(fileOp),

        border: options.style?.border ?? {
          fg: FileOperation.getBorderFgForOperation(fileOp)
        },

        hover: options.style?.hover ?? {
          bg: FileOperation.getHoverBgForOperation(fileOp)
        },
      }
    })
  }
}