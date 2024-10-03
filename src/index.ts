import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { promisify } from 'util';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const PROMPT = 'Summarize the following code file. Format your response as a bullet-pointed list with no extra whitespace, designed for consumption by another gpt model. Be succint, concise, and comprehensive. Include correct symbol names in your response, so responses from multiple files can refer to the same symbols. Describe all functionality of each symbol, such as naming each method and it\'s arguments or signature. Come up with a concise notation, keep in mind your response will be parsed by a gpt model.Include a header at the top of the name of the file, and other metadata you find important. Include full specification of data types for all functions, events, event handlers, etc. Indicate what is exported and imported, leaving nothing out. Describe the libraries and technological components used to implement each piece of functionality, such as specifying a service is a moleculer service.'

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const access = promisify(fs.access);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const client = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

const question = (query: string) => new Promise<string>(resolve => rl.question(query, resolve));

async function getTsFiles(dir: string): Promise<string[]> {
    const subdirs = await readdir(dir);
    const files = await Promise.all(subdirs.map(async (subdir) => {
        const res = path.resolve(dir, subdir);
        return (await fs.promises.stat(res)).isDirectory() ? getTsFiles(res) : res;
    }));
    return files.flat().filter(file => file.endsWith('.ts'));
}

async function processFiles(files: string[]) {
    for (const file of files) {
        const outputFilePath = path.join('data', `a-${path.basename(file)}.response`);
        try {
            await access(outputFilePath);
            console.log(`Skipping ${file}, already processed.`);
            continue;
        } catch {
            // File does not exist, proceed with processing
        }

        const content = await readFile(file, 'utf-8');
        const completionContent = `${PROMPT}\Path: ${file}\n\`\`\`${content}\`\`\``
        console.log(`Completing ${file}...`);
        const completion = await client.chat.completions.create({
            messages: [{ role: 'user', content: completionContent }],
            model: 'gpt-3.5-turbo',
        });
        await writeFile(outputFilePath, completion.choices[0].message.content ?? '');
        console.log(`Processed and saved response for ${file}`);
    }
}

async function main() {
    const dir = await question('Enter the path to the directory: ');
    rl.close();

    const tsFiles = await getTsFiles(dir);
    console.log(`Found ${tsFiles.length} TypeScript files.`);

    await processFiles(tsFiles);
}

main().catch(console.error);