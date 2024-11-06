import blessed from 'blessed'
import { Widget } from '../widget'

export type LogOptions = blessed.Widgets.BoxOptions

export class Log extends Widget {
  protected readonly boxElement: blessed.Widgets.BoxElement

  getRootElements(): blessed.Widgets.BlessedElement[] {
    return [this.boxElement]
  }

  constructor(options: LogOptions = {}) {
    super()

    this.boxElement = blessed.box({
      ...options,

      scrollable: true,
      label: options.label ?? 'Log',
      content: options.content ?? '',
      border: options.border ?? {
        type: 'line'
      },

      style: {
        ...(options.style ?? {}),

        fg: options.style?.fg ?? 'white',
        bg: options.style?.bg ?? 'black',

        border: options.style?.border ?? {
          fg: '#f0f0f0'
        },

        hover: options.style?.hover ?? {
          bg: 'green'
        },
      }
    })
  }

	log(line: string): void {
		if (
			(this.boxElement.getLines().length === 1) &&
			(this.boxElement.getLine(0).trim().length === 0)
		) {
			this.boxElement.setLine(0, line)
		} else {
			this.boxElement.insertLine(this.boxElement.getLines().length, line)
		}
	}
}