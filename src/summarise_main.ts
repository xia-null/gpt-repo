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

export const getCachedResponseKey = (templateContent: string, args: object, model: string): string => {
    const hash: string = hashContent(JSON.stringify({
        args,
        model,
        templateContent
    }));

    return `${hash}.response`;
};

export const getCachedResponse = (templateContent: string, args: object, model: string): string | null => {
    const responseFileName: string = getCachedResponseKey(templateContent, args, model);
    const responseFilePath: string = path.join(dataDir, responseFileName);

    if (fs.existsSync(responseFilePath)) {
        return fs.readFileSync(responseFilePath, 'utf-8');
    }
    return null;
};

export const cacheResponse = (template: any, args: object, response: string, model: string): void => {
    const responseFileName: string = getCachedResponseKey(template.toString(), args, model);
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

    const metaSummaries = await PI.mapSeries(chunks, async (summaries): Promise<string> => (
        await getResponse(summariseSummariesTemplate, { summaries }, 'gpt-4o')
    ))

    if (metaSummaries.length === 1) {
        fs.writeFileSync('./out.md', metaSummaries[0])
        return
    }

    const metaMetaSummary = await getResponse(summariseMetaSummariesTemplate, { metaSummaries }, 'gpt-4o')

    fs.writeFileSync('./out.md', metaMetaSummary)
};

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
