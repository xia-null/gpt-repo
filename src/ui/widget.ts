import blessed from 'blessed'
import { EventEmitter } from 'stream'

export abstract class Widget extends EventEmitter {
    abstract getRootElements(): blessed.Widgets.BlessedElement[]

    getElements(): blessed.Widgets.BlessedElement[] {
        return this.getRootElements()
    }

    setLeft(value: string | number): void {
        this.getRootElements().forEach(el => el.left = value)
    }

    setTop(value: string | number): void {
        this.getRootElements().forEach(el => el.top = value)
    }

    setWidth(value: string | number): void {
        this.getRootElements().forEach(el => el.width = value)
    }

    setHeight(value: string | number): void {
        this.getRootElements().forEach(el => el.height = value)
    }

    // TODO: Refactor
    getWidth(): string | number {
        return this.getRootElements()[0].width
    }

    // TODO: Refactor
    getHeight(): string | number {
        return this.getRootElements()[0].height
    }

    appendTo(screen: blessed.Widgets.Screen): void {
        this.getElements().forEach((element: blessed.Widgets.BlessedElement): void => {
            screen.append(element)
        })
    }

    removeFrom(screen: blessed.Widgets.Screen): void {
        this.getElements().forEach((element: blessed.Widgets.BlessedElement): void => {
            screen.remove(element)
        })
    }
}