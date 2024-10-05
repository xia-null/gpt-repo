// TODO: Refactor

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import OpenAI from 'openai';
import PI from 'p-iteration';
import Handlebars from 'handlebars';
import signale from 'signale';
import _chunk from 'lodash/chunk';
import _sum from 'lodash/sum';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

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

export const client: OpenAI = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

export const callOpenAiApi = async (prompt: string, model: string = 'gpt-4o'): Promise<string> => {
    const completion: OpenAI.Chat.Completions.ChatCompletion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model
    });

    return completion.choices[0].message.content ?? '';
};

export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export const AutoStep = z.union([
    z.object({
        type: z.literal('CREATE_FILE'),
        filePath: z.string(),
        fileContents: z.string(),
    }),
    z.object({
        type: z.literal('EDIT_FILE'),
        filePath: z.string(),
        fileContents: z.string(),
    }),
    z.object({
        type: z.literal('DELETE_FILE'),
        filePath: z.string(),
    }),
    z.object({
        type: z.literal('REQUEST_FILE'),
        filePath: z.string(),
    }),
    z.object({
        type: z.literal('QUERY_USER'),
        message: z.string(),
    }),
    z.object({
        type: z.literal('DONE'),
    }),
]);

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
    const completion = await client.beta.chat.completions.parse({
        model,
        messages,
        response_format: zodResponseFormat(responseType, responseTypeName),
    });

    return completion.choices[0].message.parsed ?? '';
};

export const handleAutoSteps = async (autoSteps: AutoSteps): Promise<OpenAIMessage[]> => {
    const responses: OpenAIMessage[] = [];

    for (const step of autoSteps.steps) {
        switch (step.type) {
            case 'CREATE_FILE':
                await handleCreateFile(step.filePath, step.fileContents);
                break;
            case 'EDIT_FILE':
                await handleEditFile(step.filePath, step.fileContents);
                break;
            case 'DELETE_FILE':
                await handleDeleteFile(step.filePath);
                break;
            case 'REQUEST_FILE':
                responses.push({
                    role: 'user',
                    content: await handleRequestFile(step.filePath)
                })
                break;
            case 'QUERY_USER':
                responses.push({
                    role: 'user',
                    content: await handleQueryUser(step.message)
                });
                break;
            case 'DONE':
                signale.success('All steps completed.');
                process.exit(0);
                break;
            default:
                signale.warn(`Unknown step type: ${(step as any).type}`);
        }
    }

    return responses;
};

const handleCreateFile = async (filePath: string, fileContents: string): Promise<null> => {
    const confirmation = await handleQueryUser(`Do you want to create the file at ${filePath}?\n\n${fileContents}\n\n(yes/no)`);
    if (confirmation.toLowerCase() === 'yes') {
        fs.writeFileSync(filePath, fileContents);
        signale.success(`File created: ${filePath}`);
    } else {
        signale.info(`File creation aborted: ${filePath}`);
    }
    return null;
};

const handleEditFile = async (filePath: string, fileContents: string): Promise<null> => {
    const confirmation = await handleQueryUser(`Do you want to edit the file at ${filePath}?\n\n${fileContents}\n\n(yes/no)`);
    if (confirmation.toLowerCase() === 'yes') {
        fs.writeFileSync(filePath, fileContents);
        signale.success(`File edited: ${filePath}`);
    } else {
        signale.info(`File edit aborted: ${filePath}`);
    }
    return null;
};

const handleDeleteFile = async (filePath: string): Promise<null> => {
    const confirmation = await handleQueryUser(`Do you want to delete the file at ${filePath}? (yes/no)`);
    if (confirmation.toLowerCase() === 'yes') {
        fs.unlinkSync(filePath);
        signale.success(`File deleted: ${filePath}`);
    } else {
        signale.info(`File deletion aborted: ${filePath}`);
    }
    return null;
};

const handleRequestFile = async (filePath: string): Promise<string> => {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    signale.info(`File requested: ${filePath}\nContent:\n${fileContent}`);

    return JSON.stringify({
        filePath,
        fileContent
    })
};

const handleQueryUser = async (message: string): Promise<string> => {
    signale.info(`Query to user: ${message}`);
    return new Promise((resolve) => {
        process.stdout.write(`${message}\n> `);
        process.stdin.once('data', (data) => {
            resolve(data.toString().trim());
        });
    });
};

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
    signale.info(`Querying ${model}...`)
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
    signale.info(`Querying ${model}...`)

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
        signale.info(`Created cache directory at ${dataDir}`);
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
