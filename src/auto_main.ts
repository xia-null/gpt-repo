import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import signale from 'signale';
import _chunk from 'lodash/chunk';
import _sum from 'lodash/sum';

import { getFilePaths, loadTemplate, OpenAIMessage, getResponseStructured, AutoSteps, handleAutoSteps } from './lib';

export const main = async (): Promise<void> => {
    const args: string[] = process.argv.slice(2);
    const filePaths: string[] = [];

    for (const arg of args) {
        const fullPath: string = path.resolve(arg);
        const stat: fs.Stats = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            filePaths.push(...getFilePaths(fullPath, ['.ts', '.vue', '.json', '.yml', '.md', '.js', '.jsx', '.html', '.py']));
        } else {
            filePaths.push(fullPath);
        }
    }

    signale.info(`Operating on ${filePaths.length} files`)

    const instructions: string = await new Promise((resolve) => {
        process.stdout.write('Please enter your instructions: ');
        process.stdin.setEncoding('utf-8');
        process.stdin.once('data', (data) => {
            resolve(data.toString().trim());
        });
    });

    filePaths.forEach((filePath: string): void => {
        console.log(path.relative(process.cwd(), filePath))
    })

    const autoCodeTemplate = loadTemplate('auto-code.hbs');
    const messages: OpenAIMessage[] = [{
        role: 'system',
        content: 'You are a software engineer.'
    }, {
        role: 'user',
        content: autoCodeTemplate({
            filePaths,
            instructions
        })
    }]

    let response = await getResponseStructured<AutoSteps>(messages, 'gpt-4o-mini', AutoSteps, 'auto_steps')

    messages.push({
        role: 'assistant',
        content: JSON.stringify(response)
    })

    while (response.steps.length > 0) {
        const userMessages = await handleAutoSteps(response)

        userMessages.forEach((message) => {
            messages.push(message)
        });

        response = await getResponseStructured<AutoSteps>(messages, 'gpt-4o-mini', AutoSteps, 'auto_steps')
        messages.push({
            role: 'assistant',
            content: JSON.stringify(response)
        })
    }
};

signale.config({
    displayTimestamp: true,
    displayDate: true,
});

signale.start('Starting the application...');

signale.success('Application setup complete.');

main().catch((error) => {
    signale.error('An error occurred:', error);
});
