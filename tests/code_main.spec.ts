import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as rl from 'readline';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import {
    dataDir,
    promptUser,
    hashContent,
    getFilePaths,
    callOpenAiApi,
    loadTemplate,
    getCachedResponseKey,
    getCachedResponse,
    cacheResponse,
    processFiles,
    main
} from './code_main';

describe('code_main module', () => {
    let spies: any[] = [];

    beforeEach(() => {
        spies = [];
    });

    afterEach(() => {
        spies.forEach(spy => spy.mockRestore());
    });

    describe('hashContent', () => {
        it('should return the correct SHA-256 hash of the content', () => {
            const content = 'test content';
            const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
            expect(hashContent(content)).toBe(expectedHash);
        });
    });

    describe('getFilePaths', () => {
        it('should return an array of file paths with the specified extension', () => {
            const mockDir = './mockDir';
            const mockFiles = ['file1.ts', 'file2.js', 'file3.ts'];
            spies.push(vi.spyOn(fs, 'readdirSync').mockReturnValue(mockFiles.map(file => ({ name: file, isDirectory: () => false } as fs.Dirent))));
            spies.push(vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats));

            const result = getFilePaths(mockDir, '.ts');
            expect(result).toEqual([path.resolve(mockDir, 'file1.ts'), path.resolve(mockDir, 'file3.ts')]);
        });
    });

    describe('getCachedResponseKey', () => {
        it('should return the correct cache key', () => {
            const templatePath = 'templatePath';
            const templateContent = 'templateContent';
            const args = { key: 'value' };

            const expectedKey = `${hashContent(templatePath)}-${hashContent(templateContent)}-${hashContent(JSON.stringify(args))}.response`;
            expect(getCachedResponseKey(templatePath, templateContent, args)).toBe(expectedKey);
        });
    });

    describe('getCachedResponse', () => {
        it('should return the cached response if it exists', () => {
            const templatePath = 'templatePath';
            const templateContent = 'templateContent';
            const args = { key: 'value' };
            const response = 'cached response';

            spies.push(vi.spyOn(fs, 'existsSync').mockReturnValue(true));
            spies.push(vi.spyOn(fs, 'readFileSync').mockReturnValue(response));

            expect(getCachedResponse(templatePath, templateContent, args)).toBe(response);
        });

        it('should return null if the cached response does not exist', () => {
            const templatePath = 'templatePath';
            const templateContent = 'templateContent';
            const args = { key: 'value' };

            spies.push(vi.spyOn(fs, 'existsSync').mockReturnValue(false));

            expect(getCachedResponse(templatePath, templateContent, args)).toBeNull();
        });
    });

    describe('cacheResponse', () => {
        it('should write the response to the correct file', () => {
            const templatePath = 'templatePath';
            const templateContent = 'templateContent';
            const args = { key: 'value' };
            const response = 'response';
            const responseFileName = getCachedResponseKey(templatePath, templateContent, args);
            const responseFilePath = path.join(dataDir, responseFileName);

            const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
            spies.push(writeFileSyncSpy);

            cacheResponse(templatePath, templateContent, args, response);
            expect(writeFileSyncSpy).toHaveBeenCalledWith(responseFilePath, response);
        });
    });

    describe('promptUser', () => {
        it('should prompt the user and return the input', async () => {
            const query = 'Enter something: ';
            const userInput = 'user input';
            spies.push(vi.spyOn(rl.Interface.prototype, 'question').mockImplementation(function (this: any, query: string, callback: (answer: string) => void) {
                callback(userInput);
            }));

            const result = await promptUser(query);
            expect(result).toBe(userInput);
        });
    });

    describe('callOpenAiApi', () => {
        it('should call the OpenAI API and return the response', async () => {
            const prompt = 'test prompt';
            const client = new OpenAI({ apiKey: 'your-api-key' });
            spies.push(vi.spyOn(client.chat.completions, 'create').mockResolvedValue({
                choices: [{ message: { content: 'response' } }]
            } as any));

            const result = await callOpenAiApi(prompt);
            expect(result).toBe('response');
        });
    });

    describe('loadTemplate', () => {
        it('should load and compile the Handlebars template', () => {
            const templateName = 'template.hbs';
            const templateContent = 'template content';
            const templatePath = path.join(__dirname, 'prompt_templates', templateName);

            spies.push(vi.spyOn(fs, 'readFileSync').mockReturnValue(templateContent));
            const compileSpy = vi.spyOn(Handlebars, 'compile').mockReturnValue('compiled template' as any);
            spies.push(compileSpy);

            loadTemplate(templateName);
            expect(fs.readFileSync).toHaveBeenCalledWith(templatePath, 'utf-8');
            expect(compileSpy).toHaveBeenCalledWith(templateContent);
        });
    });

    describe('processFiles', () => {
        it('should process files and cache responses', async () => {
            const workingDir = './workingDir';
            const instructions = 'instructions';
            const mockFiles = ['file1.ts', 'file2.ts'];
            const fileContent = 'file content';
            const summary = 'summary';

            spies.push(vi.spyOn(fs, 'existsSync').mockReturnValue(true));
            spies.push(vi.spyOn(fs, 'readdirSync').mockReturnValue(mockFiles.map(file => ({ name: file, isDirectory: () => false } as fs.Dirent))));
            spies.push(vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats));
            spies.push(vi.spyOn(fs, 'readFileSync').mockReturnValue(fileContent));
            spies.push(vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined));
            spies.push(vi.spyOn(Handlebars, 'compile').mockReturnValue(() => ''));
            const client = new OpenAI({ apiKey: 'your-api-key' });
            spies.push(vi.spyOn(client.chat.completions, 'create').mockResolvedValue({ choices: [{ message: { content: summary } }] } as any));
            spies.push(vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {}));

            await processFiles(workingDir, instructions);

            expect(fs.mkdirSync).toHaveBeenCalledWith(dataDir);
            expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(workingDir, 'file1.ts'), 'utf-8');
            expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(workingDir, 'file2.ts'), 'utf-8');
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });
});