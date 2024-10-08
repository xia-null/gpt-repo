# gpt-repo - CLI codebase explainer/coding agent

**Docs TODO**
**NOTE**: Written with AI.

## Setup

```bash
export OPENAI_API_KEY=...
npm i -g pnpm
pnpm install
pnpm build
cp -r src/prompt_templates dist/prompt_templates
```

## Running the agent

Simply run `auto_main.js` in the repo you wish to modify, passing all relvant files/folders. i.e.:

```bash
cd /my/repo/path
node ../gpt-repo/auto_main.js src package.json README.md
```