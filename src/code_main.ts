import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import signale from 'signale';

const rl: readline.Interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

export const promptUser = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

export const hashContent = (content: string): string => {
    return crypto.createHash('sha256').update(content).digest('hex');
};

export const getFilePaths = (dir: string, extension: string): string[] => {
    let results: string[] = [];
    const list: string[] = fs.readdirSync(dir);
    list.forEach((file: string) => {
        const filePath: string = path.resolve(dir, file);
        const stat: fs.Stats = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFilePaths(filePath, extension));
        } else if (filePath.endsWith(extension)) {
            results.push(filePath);
        }
    });
    return results;
};

export const client: OpenAI = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

export const callOpenAiApi = async (prompt: string): Promise<string> => {
    const completion: OpenAI.Chat.Completions.ChatCompletion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-3.5-turbo',
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

export const processFiles = async (workingDir: string, instructions: string): Promise<void> => {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
        signale.info(`Created cache directory at ${dataDir}`);
    }

    const sourceFiles: string[] = getFilePaths(workingDir, '.ts');
    signale.info(`Found ${sourceFiles.length} TypeScript files in ${workingDir}: ${sourceFiles.join(', ')}`);

    const summariseTemplate: Handlebars.TemplateDelegate = loadTemplate('summarise-file.hbs');
    const summaryListTemplate: Handlebars.TemplateDelegate = loadTemplate('gen-summary-list.hbs');
    const listingListTemplate: Handlebars.TemplateDelegate = loadTemplate('gen-listing-list.hbs');
    const autoCodeTemplate: Handlebars.TemplateDelegate = loadTemplate('auto-code.hbs');

    for (const filePath of sourceFiles) {
        const fileContent: string = fs.readFileSync(filePath, 'utf-8');
        const summaryPrompt: string = summariseTemplate({ filePath, fileContent });
        const cachedSummary: string | null = getCachedResponse('summarise-file.hbs', summariseTemplate.toString(), { filePath, fileContent });

        if (!cachedSummary) {
            signale.info(`Generating summary for ${filePath}`);
            const summary: string = await callOpenAiApi(summaryPrompt);
            cacheResponse('summarise-file.hbs', summariseTemplate, { filePath, fileContent }, summary);
            signale.success(`Cached summary for ${filePath}`);
        } else {
            signale.info(`Using cached summary for ${filePath}`);
        }
    }

    const summariesMap: Map<string, string> = new Map();
    const listingsMap: Map<string, string> = new Map();

    for (const filePath of sourceFiles) {
        const fileContent: string = fs.readFileSync(filePath, 'utf-8');
        const cachedSummary: string | null = getCachedResponse('summarise-file.hbs', summariseTemplate({ filePath, fileContent }), { filePath, fileContent });

        if (!cachedSummary) {
            signale.info(`Generating summary for ${filePath}`);
            const summary: string = await callOpenAiApi(summariseTemplate({ filePath, fileContent }));
            cacheResponse('summarise-file.hbs', summariseTemplate, { filePath, fileContent }, summary);
            summariesMap.set(filePath, summary);
            signale.success(`Cached summary for ${filePath}`);
        } else {
            summariesMap.set(filePath, cachedSummary);
            signale.info(`Using cached summary for ${filePath}`);
        }

        listingsMap.set(filePath, fileContent);
    }

    const summaries: { filePath: string, summary: string }[] = Array.from(summariesMap.entries()).map(([filePath, summary]) => ({ filePath, summary }));
    const listings: { filePath: string, content: string }[] = Array.from(listingsMap.entries()).map(([filePath, content]) => ({ filePath, content }));

    const summaryListPrompt: string = summaryListTemplate({ summaries, instructions });
    const cachedSummaryList: string | null = getCachedResponse('gen-summary-list.hbs', summaryListTemplate({ summaries, instructions }), { summaries, instructions });

    const summaryList: string = cachedSummaryList ?? await callOpenAiApi(summaryListPrompt);
    if (!cachedSummaryList) {
        cacheResponse('gen-summary-list.hbs', summaryListTemplate, { summaries, instructions }, summaryList);
        signale.success('Cached summary list');
    } else {
        signale.info('Using cached summary list');
    }

    const listingListPrompt: string = listingListTemplate({ listings, instructions });
    const cachedListingList: string | null = getCachedResponse('gen-listing-list.hbs', listingListTemplate({ summaries, instructions }), { listings, instructions });

    const listingList: string = cachedListingList ?? await callOpenAiApi(listingListPrompt);
    if (!cachedListingList) {
        cacheResponse('gen-listing-list.hbs', listingListTemplate, { listings, instructions }, listingList);
        signale.success('Cached listing list');
    } else {
        signale.info('Using cached listing list');
    }

    const selectedSummaries = summaries.filter(({ filePath }) => summaryList.includes(filePath));
    const selectedListings = listings.filter(({ filePath }) => listingList.includes(filePath));

    const autoCodePrompt: string = autoCodeTemplate({ summaries: selectedSummaries, listings: selectedListings, instructions });
    const cachedAutoCodeResponse: string | null = getCachedResponse('auto-code.hbs', autoCodeTemplate({ summaries: selectedSummaries, listings: selectedListings, instructions }), { summaries, summaryList, listingList, instructions });

    const autoCodeResponse: string = cachedAutoCodeResponse ?? await callOpenAiApi(autoCodePrompt);
    if (!cachedAutoCodeResponse) {
        cacheResponse('auto-code.hbs', autoCodeTemplate, { summaries, summaryList, listingList, instructions }, autoCodeResponse);
        signale.success('Cached auto-generated code');
    } else {
        signale.info('Using cached auto-generated code');
    }
};

export const main = async (): Promise<void> => {
    const workingDir: string = await promptUser('Enter the working directory: ');
    const instructions: string = await promptUser('Enter your instructions: ');
    await processFiles(workingDir, instructions);
    rl.close();
};

main().catch(console.error);
signale.config({
    displayTimestamp: true,
    displayDate: true,
});

signale.start('Starting the application...');

rl.on('close', () => {
    signale.complete('User input interface closed.');
});

signale.success('Application setup complete.');

main().catch((error) => {
    signale.error('An error occurred:', error);
});