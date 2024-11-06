// TODO: Refactor

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { OpenAI, AzureOpenAI } from 'openai';
import PI from 'p-iteration';
import Handlebars from 'handlebars';
// import signale from 'signale';
import _chunk from 'lodash/chunk';
import _sum from 'lodash/sum';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { FileOperationType, UI } from './ui'
import { convert } from 'html-to-text'

const exec = require('child_process').exec;
const https = require('https');

export const MAX_PROMPT_LENGTH = 30_000;

export const hashContent = (content: string): string => {
    return crypto.createHash('sha256').update(content).digest('hex');
};

export const getFilePaths = (dir: string, extensions: string[]): string[] => {
    let results: string[] = [];
    const list: string[] = fs.readdirSync(dir);
    list.forEach((file: string) => {
        const filePath: string = path.resolve(dir, file);
        const stat: fs.Stats = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFilePaths(filePath, extensions));
        } else if (extensions.includes(path.extname(filePath))) {
            results.push(filePath);
        }
    });
    return results;
};

export const client: AzureOpenAI = new AzureOpenAI();
export const openaiClient: OpenAI = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

export const callOpenAiApi = async (prompt: string, model: string = 'gpt-4o'): Promise<string> => {
    const c = model.includes('o1') ? client : openaiClient

    // const startTime = Date.now();
    const completion: OpenAI.Chat.Completions.ChatCompletion = await c.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model
    });
    // const endTime = Date.now();
    // const duration = (endTime - startTime) / 1000; // duration in seconds

    // const tokensUsed = completion.usage?.total_tokens ?? 0;
    // const cost = (tokensUsed / 1_000_000) * 0.006; // $0.006 per token

    // ui.log(`Completion cost: $${cost.toFixed(6)} for ${tokensUsed} tokens in ${duration.toFixed(2)} seconds`);

    return completion.choices[0].message.content ?? '';
};

export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export const FsStep = z.union([
    z.object({
        type: z.literal('CREATE_FILE'),
        filePath: z.string(),
        fileContents: z.string(),
    }),
    z.object({
        type: z.literal('CREATE_DIR'),
        dirPath: z.string(),
    }),
    z.object({
        type: z.literal('EDIT_FILE'),
        filePath: z.string(),
        fileContents: z.string(),
    }),
    z.object({
        type: z.literal('DELETE_FILE'),
        filePath: z.string(),
    })
])

export type FsStep = z.infer<typeof FsStep>
export const FsSteps = z.object({
    steps: z.array(FsStep),
})

export type FsSteps = z.infer<typeof FsSteps>

export const AutoStep = z.union([
    z.object({
        type: z.literal('REQUEST_FILE'),
        filePath: z.string(),
    }),
    z.object({
        type: z.literal('QUERY_USER'),
        message: z.string(),
    }),
    z.object({
        type: z.literal('RUN_SHELL'),
        cwd: z.string(),
        command: z.string(),
    }),
    z.object({
        type: z.literal('GOOGLE_SEARCH'),
        query: z.string(),
    }),
    z.object({
        type: z.literal('HTTP_REQUEST_GET'),
        url: z.string(),
    }),
    z.object({
        type: z.literal('CODE_OPERATION'),
        relatedFiles: z.array(z.string()),
        outputFiles: z.array(z.string()),
        prompt: z.string(),
    }),
    z.object({
        type: z.literal('DONE'),
    }),
])

export type AutoStep = z.infer<typeof AutoStep>;
export const AutoSteps = z.object({
    steps: z.array(AutoStep),
});

export type AutoSteps = z.infer<typeof AutoSteps>;

export const callOpenAiApiStructured = async <T>(
    messages: OpenAIMessage[],
    model: string = 'gpt-4o',
    responseType: any,
    responseTypeName: string
): Promise<T> => {
    const completion = await openaiClient.beta.chat.completions.parse({
        model,
        messages,
        response_format: zodResponseFormat(responseType, responseTypeName),
    });

    return completion.choices[0].message.parsed ?? '';
};

export const handleFsSteps = async (ui: UI, fsSteps: FsSteps): Promise<OpenAIMessage[]> => {
    const responses: OpenAIMessage[] = [];

    for (const step of fsSteps.steps) {
        switch (step.type) {
            case 'CREATE_FILE':
                await handleCreateFile(ui, step.filePath, step.fileContents);
                responses.push({ role: 'user', content: `File created: ${step.filePath}` })
                break;
            case 'CREATE_DIR':
                await handleCreateDir(ui, step.dirPath);
                responses.push({ role: 'user', content: `Directory created: ${step.dirPath}` })
                break;
            case 'EDIT_FILE':
                await handleEditFile(ui, step.filePath, step.fileContents);
                responses.push({ role: 'user', content: `File edited: ${step.filePath}` })
                break;
            case 'DELETE_FILE':
                await handleDeleteFile(ui, step.filePath);
                responses.push({ role: 'user', content: `File deleted: ${step.filePath}` })
                break;
            default:
                throw new Error(`Unknown step type: ${(step as any).type}`);
        }
    }

    return responses;
};

export const handleAutoSteps = async (ui: UI, filePaths: string[], autoSteps: AutoSteps): Promise<OpenAIMessage[]> => {
    const responses: OpenAIMessage[] = [];

    for (const step of autoSteps.steps) {
        switch (step.type) {
            case 'REQUEST_FILE':
                responses.push({
                    role: 'user',
                    content: await handleRequestFile(ui, step.filePath)
                })
                break;
            case 'QUERY_USER':
                responses.push({
                    role: 'user',
                    content: await handleQueryUser(ui, step.message)
                });
                break;
            case 'RUN_SHELL':
                responses.push({
                    role: 'user',
                    content: await handleQueryRunShell(ui, step.cwd, step.command)
                });
                break;
            case 'HTTP_REQUEST_GET':
                responses.push({
                    role: 'user',
                    content: await handleHttpRequestGet(ui, step.url)
                });
                break;
            case 'GOOGLE_SEARCH':
                responses.push({
                    role: 'user',
                    content: await handleGoogleSearch(ui, step.query)
                });
                break;
            case 'CODE_OPERATION':
                const { type, relatedFiles, outputFiles, prompt } = step;
                const messages = await handleCodeOperation(ui, type, filePaths, relatedFiles, outputFiles, prompt)

                messages.forEach(msg => responses.push(msg))
                break;
            case 'DONE':
                ui.log('All steps completed.');
                break;
            default:
                throw new Error(`Unknown step type: ${(step as any).type}`);
        }
    }

    return responses;
};

const handleCreateFile = async (ui: UI, filePath: string, fileContents: string): Promise<string> => {
    ui.setFileOperation(FileOperationType.Create, path.basename(filePath), fileContents)

    const confirmation = ui.getYesToAll()
        ? true
        : await ui.askUser('Confirm Auto Step', `Create the file at ${filePath}?`);

    ui.closeFileOperation()

    if (confirmation) {
        fs.writeFileSync(filePath, fileContents);
        ui.log(`File created: ${filePath}`);
        return JSON.stringify({ success: `File created: ${filePath}` });
    } else {
        ui.log(`File creation aborted: ${filePath}`);
        return JSON.stringify({ error: `File creation aborted: ${filePath}` });
    }
};

const handleCreateDir = async (ui: UI, dirPath: string): Promise<string> => {
    const confirmation = ui.getYesToAll()
        ? true
        : await ui.askUser('Confirm Auto Step', `Do you want to create the directory at ${dirPath}?`);

    if (confirmation) {
        fs.mkdirSync(dirPath, { recursive: true });
        ui.log(`Directory created: ${dirPath}`);
        return JSON.stringify({ success: `Directory created: ${dirPath}` });
    } else {
        ui.log(`Directory creation aborted: ${dirPath}`);
        return JSON.stringify({ error: `Directory creation aborted: ${dirPath}` });
    }
};

const handleEditFile = async (ui: UI, filePath: string, fileContents: string): Promise<string> => {
    ui.setFileOperation(FileOperationType.Edit, path.basename(filePath), fileContents)

    const confirmation = ui.getYesToAll()
        ? true
        : await ui.askUser('Confirm Auto Step', `Do you want to edit the file at ${filePath}?`);

    ui.closeFileOperation()

    if (confirmation) {
        fs.writeFileSync(filePath, fileContents);
        ui.log(`File edited: ${filePath}`);
        return JSON.stringify({ success: `File edited: ${filePath}` });
    } else {
        return JSON.stringify({ error: `File edit aborted: ${filePath}` });
    }
};

const handleDeleteFile = async (ui: UI, filePath: string): Promise<string> => {
    const confirmation = ui.getYesToAll()
        ? true
        : await ui.askUser('Confirm Auto Step', `Do you want to delete the file at ${filePath}?`);

    if (confirmation) {
        fs.unlinkSync(filePath);
        ui.log(`File deleted: ${filePath}`);
        return JSON.stringify({ success: `File deleted: ${filePath}` });
    } else {
        ui.log(`File deletion aborted: ${filePath}`);
        return JSON.stringify({ error: `File deletion aborted: ${filePath}` });
    }
};

const handleRequestFile = async (ui: UI, filePath: string): Promise<string> => {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    ui.log(`File requested: ${filePath}`);

    return JSON.stringify({
        filePath,
        fileContent
    })
};

const handleQueryUser = async (ui: UI, message: string): Promise<string> => {
    return (await ui.promptUser('Auto Prompt', message)) ?? ''
};

const handleQueryRunShell = async (ui: UI, cwd: string, command: string): Promise<string> => {
    const confirmation = ui.getYesToAll()
        ? true
        : await ui.askUser('Confirm Auto Step', `Do you want to run the command in ${cwd}?\n\n${command}\n\n(yes/no)`);

    if (confirmation) {
        return new Promise((resolve) => {
            exec(command, { cwd }, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    ui.log(`Error executing command: ${error.message}`);
                    resolve(JSON.stringify({
                        errorMessage: error.message,
                        errorStack: error.stack
                    }));
                } else {
                    ui.log(`Command executed successfully: ${command}`);
                    resolve(JSON.stringify({ stdout, stderr }));
                }
            });
        });
    } else {
        ui.log(`Command execution aborted: ${command}`);
        return JSON.stringify({ error: `Command execution aborted: ${command}` });
    }
};

const handleHttpRequestGet = async (ui: UI, url: string): Promise<string> => {
    const confirmation = ui.getYesToAll()
        ? true
        : await ui.askUser('Confirm Auto Step', `Do you want to make an HTTP GET request to ${url}?`);

    if (confirmation) {
        return new Promise((resolve, reject) => {

            https.get(url, (res: any) => {
                let data = '';

                res.on('data', (chunk: string) => {
                    data += chunk;
                });

                res.on('end', () => {
                    ui.log(`HTTP GET request to ${url} completed successfully.`);
                    resolve(convert(data))
                });
            }).on('error', (err: any) => {
                ui.log(`Error making HTTP GET request: ${err.message}`);
                reject(JSON.stringify({ errorMessage: err.message, errorStack: err.stack }));
            });
        });
    } else {
        ui.log(`HTTP GET request aborted: ${url}`);
        return JSON.stringify({ error: `HTTP GET request aborted: ${url}` });
    }
};

const handleGoogleSearch = async (ui: UI, query: string): Promise<string> => {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return handleHttpRequestGet(ui, url);
};

const handleCodeOperation = async (ui: UI, type: string, referenceFilePaths: string[], inputFilePaths: string[], outputFilePaths: string[], prompt: string): Promise<OpenAIMessage[]> => {
    ui.log(`Code operation ${type} on input files:\n${inputFilePaths.map(fn => path.basename(fn)).join(', ')} and output files:\n${outputFilePaths.map(fn => path.basename(fn)).join(', ')}`)

    const inputFiles = await Promise.all(inputFilePaths.map(async (filePath: string) => {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return { filePath, fileContent }
        } catch (err: any) {
            return { filePath, fileContent: ''}
        }
    }))

    const codeOperationTemplate = loadTemplate('code-operation.hbs')
    const codeOperationToFsStepsTemplate = loadTemplate('code-operation-to-fs-steps.hbs')

    const codeOperationPrompt = codeOperationTemplate({ inputFiles, outputFiles: outputFilePaths, prompt, type })

    ui.log('Querying o1-preview with code operation...')

    const result = await callOpenAiApi(codeOperationPrompt, 'o1-preview')

    const codeOperationToFsStepsPrompt = codeOperationToFsStepsTemplate({
        type,
        referenceFilePaths,
        inputFiles,
        prompt,
        result
    })

    const messages: OpenAIMessage[] = [{
        role: 'system',
        content: `
You translate code operations written by other models into structured filesystem modification steps.

You may create files with the 'CREATE_FILE' command.
You may edit files with the 'EDIT_FILE' command.
You may delete files with the 'DELETE_FILE' command.
You may create directories with the 'CREATE_DIR' command.
The contents passed to both 'CREATE_FILE' and 'EDIT_FILE' must be the full contents of the file, not just changes.
`
    }, {
        role: 'user',
        content: codeOperationToFsStepsPrompt
    }]

    ui.log('Querying gpt-4o with results to generate fs steps...')

    const fsSteps: FsSteps = await callOpenAiApiStructured<FsSteps>(messages, 'gpt-4o', FsSteps, 'fs_steps')

    const fsStepMessages = await handleFsSteps(ui, fsSteps)

    return [{
        role: 'user',
        content: `Code operation ${type} completed on input files: ${inputFiles.join(', ')} with prompt \`${prompt}\``
    }, ...fsStepMessages]
}

export const loadTemplate = (templateName: string): Handlebars.TemplateDelegate => {
    const templatePath: string = path.join(__dirname, 'prompt_templates', templateName);
    const templateContent: string = fs.readFileSync(templatePath, 'utf-8');
    return Handlebars.compile(templateContent);
};

export const getCachedResponseKey = (templateContent: string, args: object, model: string, messages?: OpenAIMessage[]): string => {
    const hash: string = hashContent(JSON.stringify({
        args,
        model,
        templateContent,
        messages: messages ?? []
    }));

    return `${hash}.response`;
};

export const getCachedResponse = (templateContent: string, args: object, model: string, messages?: OpenAIMessage[]): string | null => {
    const responseFileName: string = getCachedResponseKey(templateContent, args, model, messages);
    const responseFilePath: string = path.join(dataDir, responseFileName);

    if (fs.existsSync(responseFilePath)) {
        return fs.readFileSync(responseFilePath, 'utf-8');
    }

    return null;
};

export const cacheResponse = (template: any, args: object, response: string, model: string, messages?: OpenAIMessage[]): void => {
    const responseFileName: string = getCachedResponseKey(template.toString(), args, model, messages);
    const responseFilePath: string = path.join(dataDir, responseFileName);
    fs.writeFileSync(responseFilePath, response);

    const queryFilePath: string = responseFilePath.replace('.response', '.query');
    const renderedTemplate: string = template(args);
    fs.writeFileSync(queryFilePath, renderedTemplate);
};

export const getResponse = async (template: any, args: object, model: string): Promise<string> => {
    const cachedResponse: string | null = getCachedResponse(template.toString(), args, model);

    if (cachedResponse) {
        return cachedResponse;
    }

    const prompt: string = template(args);
    const response: string = await callOpenAiApi(prompt, model);
    cacheResponse(template, args, response, model);
    return response;
}

export const getResponseStructured = async <T>(
    messages: OpenAIMessage[],
    model: string,
    responseType: any,
    responseTypeName: string
): Promise<T> => {
    const response: T = await callOpenAiApiStructured<T>(
        messages,
        model,
        responseType,
        responseTypeName
    );

    return response;
}

export const dataDir: string = `${__dirname}/../cache`;

export const summariseDeep = async (filePaths: string[], outPath: string): Promise<void> => {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    const summariseTemplate: Handlebars.TemplateDelegate = loadTemplate('summarise-file.hbs');
    const summariseSummariesTemplate: Handlebars.TemplateDelegate = loadTemplate('summarise-summaries.hbs');
    const summariseMetaSummariesTemplate: Handlebars.TemplateDelegate = loadTemplate('summarise-meta-summaries.hbs');
    const summaries: any[] = []

    for (const filePath of filePaths) {
        const fileContent: string = fs.readFileSync(filePath, 'utf-8');
        const summary = await getResponse(summariseTemplate, { filePath, fileContent }, 'gpt-4o-mini');

        summaries.push({ filePath, summary })
    }

    const chunks: any[] = []
    let currentChunk: any[] = []

    for (const summary of summaries) {
        const renderedPrompt = summariseSummariesTemplate({ summaries: [...currentChunk, summary] })

        if (renderedPrompt.length <= MAX_PROMPT_LENGTH) {
            currentChunk.push(summary)
        } else {
            chunks.push(currentChunk)
            currentChunk = [summary]
        }
    }

    chunks.push(currentChunk)

    const metaSummaries = await PI.mapSeries(chunks, async (summaries: any[]): Promise<string> => (
        await getResponse(summariseSummariesTemplate, { summaries }, 'gpt-4o')
    ))

    if (metaSummaries.length === 1) {
        fs.writeFileSync(outPath, metaSummaries[0])
        return
    }

    const metaMetaSummary = await getResponse(summariseMetaSummariesTemplate, { metaSummaries }, 'gpt-4o')

    fs.writeFileSync(outPath, metaMetaSummary)
};
