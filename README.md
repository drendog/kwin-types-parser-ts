# KWin Types Parser

A tool that converts KWin C++ Doxygen documentation to TypeScript definitions.

## Overview

This project parses KWin's Doxygen-generated HTML files and produces TypeScript definition files (.d.ts), making KWin APIs accessible from TypeScript.

## Key Features

- Converts C++ classes and enums to TypeScript interfaces
- Maps C++ types to TypeScript equivalents
- Supports advanced template handling and namespace mapping
- Configurable type system with JSON-based mapping configuration

## Usage

### Quick Start

```bash
# 1. Generate documentation from KWin source
deno task generate-docs

# 2. Build the package (creates TypeScript definitions)
deno task build-package

```

### Command Line Options

```bash
# Basic usage
deno run --allow-read --allow-write --allow-net main.ts output.d.ts

# All options
deno run --allow-read --allow-write --allow-net main.ts [output-file] [options]

Options:
  --type-config=FILE     # Custom type configuration
```

### Using the Generated Types

You have several options to use the generated TypeScript definitions:

1. **Direct Copy**: Copy the generated `lib/index.d.ts` file to your project.

2. **Local Package Link**: Link the package locally by adding this to your `package.json` or another packages configuration file:

   ```json
   "dependencies": {
     "@kwin-ts/types": "file:/path/to/kwin-types-parser"
   }
   ```

3. **Publish to Registry**: Publish the package to NPM or another registry:

   ```bash
   # First, create .env file from .env.example and configure your package info
   cp .env.example .env
   # Edit .env with your package details and registry settings

   # Then publish the package
   deno task publish-package

   # Or test with a dry run
   deno task publish-package-dry
   ```
