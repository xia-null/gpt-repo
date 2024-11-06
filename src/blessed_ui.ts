import blessed from 'blessed'
import _isEmpty from 'lodash/isEmpty'

import { Log, Question, FileOperationType, Prompt, FileOperation } from './ui/widgets'
import { Widget } from './ui/widget'
import { UI } from './ui'

export type UIControlFormData = {
	yesToAll: boolean
}

const BOTTOM_SLOT_HEIGHT_PERC = 35
const CONTROLS_FORM_WIDTH_PERC = 20

export class BlessedUI extends UI {
	private readonly screen: blessed.Widgets.Screen
	private readonly bottomSlotWidgets: Widget[] = []

	private readonly logBox: Log
	private readonly controlForm: blessed.Widgets.FormElement<UIControlFormData>
	private readonly yesToAllCheckbox: blessed.Widgets.CheckboxElement
	private fileOperationBox: FileOperation | null = null

	yesToAll: boolean = true

	constructor(title?: string) {
        super()

		this.screen = blessed.screen({
			smartCSR: true
		})

		if (title) {
			this.screen.title = title
		}

		// TODO: Extract this out of this class
		this.screen.key(['escape', 'q', 'C-c'], () => {
			process.exit(0);
		})

		this.logBox = new Log({
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
		})

		this.logBox.appendTo(this.screen)

		this.controlForm = blessed.form({
			parent: this.screen,
			keys: true,
			left: 0,
			top: 0,
			width: 0,
			height: 0,
			bg: 'blue',
			content: 'Settings',
			border: {
				type: 'line'
			},
			style: {
				fg: 'white',
				bg: 'black',

				border: {
					fg: '#aa33aa',
				},

				hover: {
					bg: '#331133'
				}
			}
		})

		this.yesToAllCheckbox = blessed.checkbox({
			parent: this.controlForm,
			mouse: true,
			keys: true,
			shrink: true,
			checked: this.yesToAll,
			padding: {
				left: 1,
				right: 1
			},
			left: 10,
			top: 2,
			name: 'yesToAll',
			content: 'Yes To All',
			style: {
				bg: 'blue',
				focus: {
					bg: 'red'
				},
				hover: {
					bg: 'red'
				}
			}
		})

		this.yesToAllCheckbox.on('check', () => {
			this.yesToAll = true
		})

		this.yesToAllCheckbox.on('uncheck', () => {
			this.yesToAll = false
		})

		this.relayout()
		this.screen.render()
	}

	getYesToAll(): boolean {
		return this.yesToAll
	}

	render() {
		this.screen.render()
	}

	relayout() {
		const nBottomSlotNodes = this.bottomSlotWidgets.length
		const bottomSlotNodeHeightPerc = BOTTOM_SLOT_HEIGHT_PERC / nBottomSlotNodes

		let lastTopPerc = 100 - BOTTOM_SLOT_HEIGHT_PERC

		for (const node of this.bottomSlotWidgets) {
			node.setLeft(0)
			node.setWidth(`${100 - CONTROLS_FORM_WIDTH_PERC}%`)
			node.setHeight(`${bottomSlotNodeHeightPerc}%`)
			node.setTop(`${lastTopPerc}%`)

			lastTopPerc += bottomSlotNodeHeightPerc
		}

		this.controlForm.width = `${CONTROLS_FORM_WIDTH_PERC}%`
		this.controlForm.left = `${100 - CONTROLS_FORM_WIDTH_PERC}%`
		this.controlForm.height = `${BOTTOM_SLOT_HEIGHT_PERC}%`
		this.controlForm.top = `${100 - BOTTOM_SLOT_HEIGHT_PERC}%`

		this.logBox.setHeight(`${100 - BOTTOM_SLOT_HEIGHT_PERC}%`)
		this.logBox.setWidth(this.fileOperationBox !== null
			? '35%'
			: '100%')

		if (this.fileOperationBox !== null) {
			this.fileOperationBox.setWidth('65%')
			this.fileOperationBox.setHeight(this.logBox.getHeight())
		}
	}

	async promptUser(label: string, prompt: string): Promise<string | null> {
		const promptBox = new Prompt({
			boxElement: {
				label,
				content: prompt
			}
		})

		promptBox.appendTo(this.screen)

		this.bottomSlotWidgets.push(promptBox)
		this.relayout()
		this.render()

		let userResponse = null

		while (_isEmpty(userResponse)) {
			userResponse = await promptBox.read()
		}

		promptBox.removeFrom(this.screen)

		const bottomSlotNodeI = this.bottomSlotWidgets.findIndex(n => n === promptBox)

		if (bottomSlotNodeI >= 0) {
			this.bottomSlotWidgets.splice(bottomSlotNodeI, 1)
		}

		this.relayout()
		this.render()

		return userResponse
	}

	async askUser(label: string, question: string): Promise<string> {
		const questionBox = new Question({ label })

		questionBox.appendTo(this.screen)

		this.bottomSlotWidgets.push(questionBox)
		this.relayout()

		return new Promise((resolve, reject): void => {
			questionBox.questionElement.ask(question, (err: any, value: string): void => {
				questionBox.removeFrom(this.screen)

				const bottomSlotNodeI = this.bottomSlotWidgets.findIndex(n => n === questionBox)

				if (bottomSlotNodeI >= 0) {
					this.bottomSlotWidgets.splice(bottomSlotNodeI, 1)
				}

				this.relayout()
				this.screen.render()

				if (!_isEmpty(err)) {
					reject(err)
				} else {
					resolve(value)
				}
			})

			this.screen.render()
		})
	}

	log(line: string): void {
		this.logBox.log(line)
		this.screen.render()
	}

	setFileOperation(fileOp: FileOperationType, fileName: string, fileContent: string) {
		if (this.fileOperationBox !== null) {
			this.closeFileOperation()
		}

		this.fileOperationBox = new FileOperation({
			left: '35%'
		}, fileOp, fileName, fileContent)

		this.fileOperationBox.appendTo(this.screen)
		this.relayout()
		this.screen.render()
	}

	closeFileOperation() {
		if (this.fileOperationBox === null) {
			return
		}

		this.fileOperationBox.removeFrom(this.screen)
		this.fileOperationBox = null
		this.relayout()
		this.screen.render()
	}
}