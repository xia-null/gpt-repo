#!/usr/bin/env node

import dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import signale from 'signale'
import _isEmpty from 'lodash/isEmpty'
import _chunk from 'lodash/chunk'
import _sum from 'lodash/sum'

import { ConsoleUI } from './console_ui'

import {
  getFilePaths,
  loadTemplate,
  OpenAIMessage,
  getResponseStructured,
  AutoSteps,
  handleAutoSteps
} from './lib'

export const main = async (): Promise<void> => {
  const ui = new ConsoleUI()

  ui.log('Started')

  const args: string[] = process.argv.slice(2)
  const filePaths: string[] = []

  for (const arg of args) {
    const fullPath: string = path.resolve(arg)
    const stat: fs.Stats = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      filePaths.push(
        ...getFilePaths(fullPath, [
          '.ts',
          '.vue',
          '.json',
          '.yml',
          '.md',
          '.js',
          '.jsx',
          '.html',
          '.py'
        ])
      )
    } else {
      filePaths.push(fullPath)
    }
  }

  ui.log(`Operating on ${filePaths.length} files`)

  const messagesJSONPath = args.includes('--messages')
    ? args[args.indexOf('--messages') + 1] ?? ''
    : path.join(process.cwd(), `gpt-repo-auto-${Date.now()}.json`)

  ui.log(`Saving messages to ${messagesJSONPath}`)

  const instructions = await ui.promptUser('Instructions', 'Please enter your instructions:')

  filePaths.forEach((filePath: string): void => {
    console.log(path.relative(process.cwd(), filePath))
  })

  const autoCodeTemplate = loadTemplate('auto-code.hbs')
  const messages: OpenAIMessage[] = args.includes('--messages')
    ? JSON.parse(await fs.promises.readFile(args[args.indexOf('--messages') + 2], 'utf-8'))
    : [
      {
        role: 'system',
        content: `
  You are a software engineer.
  You may request file contents with the 'REQUEST_FILE' command.
  You may query the user with the 'QUERY_USER' command.
  You may run shell commands with the 'RUN_SHELL' command.
  You may google searches with the 'GOOGLE_SEARCH' command.
  You may make HTTP GET requests with the 'HTTP_REQUEST_GET' command.
  You may perform an operation on source files, such as editing, creating, or deleting a file, with the 'CODE_OPERATION' command.

  Use the HTTP_REQUEST_GET command on the links returned in GOOGLE_SEARCH results to read them.

  You must indicate your operations are complete with the 'DONE' command.
  You must request files before you edit them.

  The contents passed to both 'CREATE_FILE' and 'EDIT_FILE' must be the full contents of the file, not just changes.

  Request files when you need to know the contents of them to perform your work.
  Do not edit files without requesting them first.
  To learn about existing files and directories, use the tree or ls shell command.
  Create directories before operating on files in them if they do not already exist.
  Request library sources if they are available, do not guess the contents of library interfaces.
  When unsure about an interface, type, or function, ask the user for clarification.

  Issue the 'DONE' command only when it is clear the user is finished with their operations. In all other cases, prompt for user input before proceeding.
  `
      },
      {
        role: 'user',
        content: autoCodeTemplate({
          filePaths,
          instructions
        })
      }
    ]

  const saveMessages = async (): Promise<void> => {
    await fs.promises.writeFile(messagesJSONPath, JSON.stringify(messages))
  }

  await saveMessages()

  ui.log('Querying gpt-4o with instructions...')

  let response = await getResponseStructured<AutoSteps>(
    messages,
    'gpt-4o',
    AutoSteps,
    'auto_steps'
  )

  messages.push({
    role: 'assistant',
    content: JSON.stringify(response)
  })

  await saveMessages()

  while (response.steps.length > 0) {
    const userMessages = await handleAutoSteps(ui, filePaths, response)

    userMessages.forEach((message) => {
      messages.push(message)
    })

    response = await getResponseStructured<AutoSteps>(
      messages,
      'gpt-4o',
      AutoSteps,
      'auto_steps'
    )
    messages.push({
      role: 'assistant',
      content: JSON.stringify(response)
    })

    await saveMessages()
  }
}

signale.config({
  displayTimestamp: true,
  displayDate: true
})

main().catch((error) => {
  signale.error('An error occurred:', error)
})
