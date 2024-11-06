import blessed from 'blessed'
import _merge from 'lodash/merge'

import { Widget } from '../widget'

export type PromptOptions = {
  boxElement?: blessed.Widgets.BoxOptions,
  formElement?: blessed.Widgets.FormOptions,
  textareaElement?: blessed.Widgets.TextareaOptions
} & blessed.Widgets.ElementOptions

export interface PromptFormData {
  value: string
}

const BOX_ELEMENT_OPTIONS = {
  border: {
    type: 'line'
  },

  style: {
    fg: 'white',
    bg: 'black',

    border: {
      fg: '#999'
    },

    hover: {
      bg: '#222'
    }
  }
}

const FORM_ELEMENT_OPTIONS = {
  keys: true
}

const TEXTAREA_ELEMENT_OPTIONS = {
  mouse: true,
  keys: true,
  name: 'value',

  style: {
    fg: 'white',
    bg: '#333'
  },

  border: {
    fg: '#ccc'
  },

  hover: {
    bg: '#555'
  }
}

export class Prompt extends Widget {
  readonly formElement: blessed.Widgets.FormElement<PromptFormData>
  readonly boxElement: blessed.Widgets.BoxElement
  readonly textareaElement: blessed.Widgets.TextareaElement

  getElements(): blessed.Widgets.BlessedElement[] {
    return [this.boxElement, this.formElement, this.textareaElement]
  }

  getRootElements(): blessed.Widgets.BlessedElement[] {
    return [this.boxElement, this.formElement, this.textareaElement]
  }

  constructor(options: PromptOptions = {}) {
    super()

    const {
      boxElement: boxElementOptions = {},
      formElement: formElementOptions = {},
      textareaElement: textareaElementOptions = {},
      ...sharedOptions
    } = options

    this.boxElement = blessed.box(_merge(
      {}, BOX_ELEMENT_OPTIONS, sharedOptions, boxElementOptions
    ))

    this.formElement = blessed.form(_merge(
      {}, FORM_ELEMENT_OPTIONS, sharedOptions, formElementOptions
    ))

    this.textareaElement = blessed.textarea(_merge(
      {}, TEXTAREA_ELEMENT_OPTIONS, sharedOptions, textareaElementOptions, {
        parent: this.formElement,
      }
    ))

    this.textareaElement.on('submit', (...data): void => {
      this.emit('submit', ...data)
    })

    this.textareaElement.on('cancel', (...data): void => {
      this.emit('cancel', ...data)
    })

    this.textareaElement.on('action', (...data): void => {
      this.emit('action', ...data)
    })
  }

  setContent(content: string): void {
    this.boxElement.setContent(content)
  }

  async read(): Promise<string | null> {
    return new Promise<string | null>((resolve, reject): void => {
      this.textareaElement.readInput((err: any, value?: string): void => {
        if (err) {
          reject(err)
        } else {
          resolve(value ?? null)
        }
      })
    })
  }
}