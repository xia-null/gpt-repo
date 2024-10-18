#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import signale from 'signale';
import _chunk from 'lodash/chunk';
import _sum from 'lodash/sum';

import { summariseDeep, getFilePaths } from './lib';

export const MAX_PROMPT_LENGTH = 30_000;

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

    signale.info(`Processing ${filePaths.length} files`)

    await summariseDeep(filePaths, './out.md');
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
