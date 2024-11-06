import blessed from 'blessed'
import { Widget } from '../widget'

export type QuestionOptions = blessed.Widgets.QuestionOptions

export class Question extends Widget {
  readonly questionElement: blessed.Widgets.QuestionElement

  getRootElements(): blessed.Widgets.BlessedElement[] {
    return [this.questionElement]
  }

  constructor(options: QuestionOptions = {}) {
    super()

    this.questionElement = blessed.question({
      ...options,

      label: options.label ?? 'Question',
      content: options.content ?? '',
      border: options.border ?? {
        type: 'line'
      },

      style: {
        ...(options.style ?? {}),

        fg: options.style?.fg ?? 'white',
        bg: options.style?.bg ?? 'black',

        border: options.style?.border ?? {
          fg: '#339933'
        },

        hover: options.style?.hover ?? {
          bg: '#003300'
        },
      }
    })
  }
}