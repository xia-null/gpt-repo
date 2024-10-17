# GPT-Repo - 🛠️ CLI Codebase Explainer & Coding Agent

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Node.js CI](https://github.com/f3rno64/gpt-repo/actions/workflows/node.js.yml/badge.svg)](https://github.com/f3rno64/gpt-repo/actions)
[![npm version](https://img.shields.io/npm/v/gpt-repo)](https://www.npmjs.com/package/gpt-repo)
[![Downloads](https://img.shields.io/npm/dm/gpt-repo.svg)](https://www.npmjs.com/package/gpt-repo)

**GPT-Repo** is a powerful CLI tool written in TypeScript that leverages OpenAI's GPT models to:

- ✨ **Summarize Large Codebases**: Overcome context-window limitations by summarizing files, then summaries of files, and summaries of summaries, into one comprehensive report.
- 🤖 **Automate Code Modifications**: Acts as an agent that can modify source files, create/delete files, execute shell commands, and perform tasks akin to a software engineer.

> NOTE: This project is in a very early stage.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [CLI](#cli)
- [Developing](#developing)
- [Setup](#setup)
- [Usage](#usage)
  - [Summarizing Codebases](#summarizing-codebases)
  - [Running the Agent](#running-the-agent)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Codebase Summarization**: Generate hierarchical summaries of large codebases to get insights that exceed the GPT model's context window.
- **Automated Coding Agent**: Perform code modifications, file operations, and execute shell commands through an intelligent agent.
- **Customizable Prompts**: Use Handlebars templates for prompt customization.

---

## Prerequisites

- **Node.js**: Version >=16.0.0 (**v23.0.0** recommended via nvmrc)
- **npm**: Version >=6.0.0
- **pnpm**: Installed globally (`npm install -g pnpm`)
- **OpenAI API Key**: Required for GPT model access.

---

## CLI

Install the package globally with `npm` or your package manager of choice:

```bash
npm i -g gpt-repo
```

This provides the two commands `gpt-repo-summarise` and `gpt-repo-auto`.

## Developing

Clone the repository and install dependencies:

```bash
git clone https://github.com/f3rno64/gpt-repo.git
cd gpt-repo
pnpm install
```

## Setup

First, export your **OpenAI API Key** as an environment variable, or provide it in a `.env` file:

```bash
export OPENAI_API_KEY=your_openai_api_key
echo 'OPENAI_API_KEY=your_openai_api_key' >> .env
```

Then, build the project with `pnpm build`.

## Usage

### Summarizing Codebases

To summarize a codebase, navigate to your project directory and run:

```bash
cd /path/to/your/project
gpt-repo-summarise src package.json README.md
```

This will generate a comprehensive summary of the specified files and directories.

### Running the Agent

To run the coding agent, execute:

```bash
cd /path/to/your/project
gpt-repo-auto src package.json README.md
```

The agent will perform tasks based on the provided files and directories.

### Examples

#### Summarize a Single File:

```bash
gpt-repo-summarise src/index.ts
```

#### Run Agent on Multiple Directories:

```bash
gpt-repo-auto src tests
```

### Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository.
2. Create a new branch: git checkout -b feature/your-feature-name.
3. Commit your changes: git commit -m 'Add some feature'.
4. Push to the branch: git push origin feature/your-feature-name.
5. Open a pull request.

## License

This project is licensed under the MIT License - see the LICENSE.md file for details.