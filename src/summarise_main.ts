import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import signale from 'signale';
import _chunk from 'lodash/chunk';
import _sum from 'lodash/sum';
import PI from 'p-iteration';

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

export const loadTemplate = (templateName: string): Handlebars.TemplateDelegate => {
    const templatePath: string = path.join(__dirname, 'prompt_templates', templateName);
    const templateContent: string = fs.readFileSync(templatePath, 'utf-8');
    return Handlebars.compile(templateContent);
};

export const getCachedResponseKey = (templatePath: string, templateContent: string, args: object): string => {
    const templatePathHash: string = hashContent(templatePath);
    const templateContentHash: string = hashContent(templateContent);
    const argsHash: string = hashContent(JSON.stringify(args));
    return `${templatePathHash}-${templateContentHash}-${argsHash}.response`;
};

export const getCachedResponse = (templatePath: string, templateContent: string, args: object): string | null => {
    const responseFileName: string = getCachedResponseKey(templatePath, templateContent, args);
    const responseFilePath: string = path.join(dataDir, responseFileName);

    if (fs.existsSync(responseFilePath)) {
        return fs.readFileSync(responseFilePath, 'utf-8');
    }
    return null;
};

export const cacheResponse = (templatePath: string, template: any, args: object, response: string): void => {
    const responseFileName: string = getCachedResponseKey(templatePath, template.toString(), args);
    const responseFilePath: string = path.join(dataDir, responseFileName);
    fs.writeFileSync(responseFilePath, response);

    const queryFilePath: string = responseFilePath.replace('.response', '.query');
    const renderedTemplate: string = template(args);
    fs.writeFileSync(queryFilePath, renderedTemplate);
};

export const dataDir: string = `${__dirname}/../cache`;

export const processFiles = async (filePaths: string[]): Promise<void> => {
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
        const summaryPrompt: string = summariseTemplate({ filePath, fileContent });
        const cachedSummary: string | null = getCachedResponse('summarise-file.hbs', summariseTemplate.toString(), { filePath, fileContent });

        if (!cachedSummary) {
            signale.info(`Generating summary for ${path.relative(process.cwd(), filePath)}`);
            const summary: string = await callOpenAiApi(summaryPrompt, 'gpt-4o-mini');
            summaries.push({ filePath, summary })
            cacheResponse('summarise-file.hbs', summariseTemplate, { filePath, fileContent }, summary);
        } else {
            signale.info(`Loaded cached summary for ${path.relative(process.cwd(), filePath)}`);
            summaries.push({ filePath, summary: cachedSummary })
        }
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

    const metaSummaryPrompts: [any[], string][] = chunks.map((summaries) => [summaries, summariseSummariesTemplate({ summaries })]);
    const metaSummaries = await PI.map(metaSummaryPrompts, async ([summaries, prompt]: [any[], string]): Promise<string> => {
        const cachedMetaSummary: string | null = getCachedResponse('summarise-sumaries.hbs', summariseSummariesTemplate.toString(), { summaries });

        if (!cachedMetaSummary) {
            signale.info(`Generating meta summary...`);
            const metaSummary: string = await callOpenAiApi(prompt, 'gpt-4o');
            cacheResponse('summarise-summaries.hbs', summariseSummariesTemplate, { summaries }, metaSummary);
            return metaSummary
        } else {
            signale.info('Using cached meta summary');
            return cachedMetaSummary
        }
    })

    if (metaSummaries.length === 1) {
        fs.writeFileSync('./out.md', metaSummaries[0])
        return
    }

    const metaMetaSummaryPrompt: string = summariseMetaSummariesTemplate({ metaSummaries })
    const cachedMetaMetaSummary: string | null = getCachedResponse('summarise-meta-summaries.hbs', summariseMetaSummariesTemplate.toString(), { metaSummaries });

    if (!cachedMetaMetaSummary) {
        signale.info(`Generating meta-meta summary...`);
        const metaMetaSummary: string = await callOpenAiApi(metaMetaSummaryPrompt, 'gpt-4o');
        cacheResponse('summarise-meta-summaries.hbs', summariseMetaSummariesTemplate, { metaSummaries }, metaMetaSummary);
        fs.writeFileSync('./out.md', metaMetaSummary)
    } else {
        signale.info('Using cached meta-meta-summary');
        fs.writeFileSync('./out.md', cachedMetaMetaSummary)
    }
};

export const main = async (): Promise<void> => {
    const args: string[] = process.argv.slice(2);
    const filePaths: string[] = [];

    for (const arg of args) {
        const fullPath: string = path.resolve(arg);
        const stat: fs.Stats = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            filePaths.push(...getFilePaths(fullPath, ['.ts', '.vue', '.json', '.yml', '.md', '.js', '.jsx', '.html']));
        } else {
            filePaths.push(fullPath);
        }
    }

    signale.info(`Processing ${filePaths.length} files`)

    await processFiles(filePaths);
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
