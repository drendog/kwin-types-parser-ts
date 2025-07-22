
import { type Document, DOMParser } from "deno_dom";
import type { PipelineStage, ParsingContext } from "../core/pipeline.ts";
import type {
  DocumentParsingService,
  ParsedDocument,
} from "../services/document-parser.ts";
import type { TypeDependencyService } from "../services/type-dependency-resolver.ts";
import type { IOutputGenerator } from "../core/interfaces.ts";
import type { LinkResolver } from "../parsing/link-resolver.ts";

// Stage 1: Parse HTML docs and extract classes/namespaces
export class DocumentParsingStage
  implements PipelineStage<string, ParsedDocument>
{
  readonly name = "document-parsing";

  constructor(
    private readonly documentParser: DocumentParsingService,
    private readonly linkResolver?: LinkResolver
  ) {}

  async process(
    filePath: string,
    context: ParsingContext
  ): Promise<ParsedDocument> {
    context.logger(`📄 Parsing document: ${filePath}`);

    const result = await this.documentParser.parseFromFile(filePath);

    if (result.classInfo) {
      context.repository.addClass(result.classInfo.fullName, result.classInfo);
      context.logger(`✅ Added class: ${result.classInfo.fullName}`);
    }

    if (result.namespaceInfo?.enums) {
      for (const enumInfo of result.namespaceInfo.enums) {
        context.repository.addGlobalEnum(enumInfo.name, enumInfo);
      }
      context.logger(
        `✅ Added ${result.namespaceInfo.enums.length} namespace enums`
      );
    }

    context.repository.markUrlVisited(filePath);

    // Keep doc around for dependency resolution
    result.sourceDocument = await this.getSourceDocument(filePath);

    // Look for namespace files in the links
    if (this.linkResolver && result.sourceDocument) {
      this.discoverNamespaceFiles(result.sourceDocument, filePath, context);
    }

    return result;
  }

  private async getSourceDocument(filePath: string): Promise<Document> {
    const content = await Deno.readTextFile(filePath);
    return new DOMParser().parseFromString(content, "text/html")!;
  }

  private discoverNamespaceFiles(
    doc: Document,
    source: string,
    context: ParsingContext
  ): void {
    if (!this.linkResolver) return;

    const relatedLinks = this.linkResolver.getRelatedLinks(doc);

    for (const href of relatedLinks) {
      if (href.includes("namespace_") && href.endsWith(".html")) {
        const fullPath = this.linkResolver.resolveUrl(href, source);
        context.repository.addNamespaceFile(fullPath);
        context.logger(`📋 Discovered namespace file: ${fullPath}`);
      }
    }
  }
}

// Stage 2: URL variant of document parsing
export class UrlParsingStage implements PipelineStage<string, ParsedDocument> {
  readonly name = "url-parsing";

  constructor(private readonly documentParser: DocumentParsingService) {}

  async process(url: string, context: ParsingContext): Promise<ParsedDocument> {
    context.logger(`🌐 Parsing URL: ${url}`);

    if (context.repository.isUrlVisited(url)) {
      context.logger(`⏭️ Skipping already visited URL: ${url}`);
      return {
        classInfo: null,
        source: url,
        isNamespace: false,
      };
    }

    const result = await this.documentParser.parseFromUrl(url);

    if (result.classInfo) {
      context.repository.addClass(result.classInfo.fullName, result.classInfo);
      context.logger(`✅ Added class: ${result.classInfo.fullName}`);
    }

    if (result.namespaceInfo?.enums) {
      for (const enumInfo of result.namespaceInfo.enums) {
        context.repository.addGlobalEnum(enumInfo.name, enumInfo);
      }
      context.logger(
        `✅ Added ${result.namespaceInfo.enums.length} namespace enums`
      );
    }

    context.repository.markUrlVisited(url);

    return result;
  }
}

// Stage 3: Deep dependency resolution
export class DependencyResolutionStage
  implements PipelineStage<ParsedDocument, ParsedDocument>
{
  readonly name = "dependency-resolution";

  constructor(private readonly dependencyService: TypeDependencyService) {}

  async process(
    input: ParsedDocument,
    context: ParsingContext
  ): Promise<ParsedDocument> {
    context.logger(`🔗 Resolving dependencies for: ${input.source}`);

    this.dependencyService.extractDependenciesFromDocument(
      input,
      context.repository
    );

    await this.dependencyService.resolveAllDependencies(context.repository);

    const stats = this.dependencyService.getStats();
    context.logger(
      `✅ Dependency resolution completed: ${stats.resolvedTypes} resolved, ${stats.unresolvedTypes} unresolved`
    );

    return input;
  }
}

// Stage 4: Generate final TypeScript output
export class OutputGenerationStage
  implements PipelineStage<ParsedDocument, string>
{
  readonly name = "output-generation";

  constructor(private readonly outputGenerator: IOutputGenerator) {}

  async process(
    _input: ParsedDocument,
    context: ParsingContext
  ): Promise<string> {
    context.logger(`📝 Generating TypeScript output`);

    const classes = context.repository.getAllClasses();
    const globalEnums = context.repository.getGlobalEnums();

    context.logger(
      `📊 Generating output for ${classes.size} classes and ${globalEnums.size} global enums`
    );

    const output = await this.outputGenerator.generateTypeScript(
      classes,
      globalEnums
    );

    context.logger(
      `✅ Generated ${output.length} characters of TypeScript definitions`
    );

    return output;
  }
}

// Stage 5: Validate TypeScript output quality
export class ValidationStage implements PipelineStage<string, string> {
  readonly name = "validation";

  process(input: string, context: ParsingContext): Promise<string> {
    context.logger(`🔍 Validating generated TypeScript`);

    const issues: string[] = [];

    if (!input.includes("declare")) {
      issues.push("No TypeScript declarations found");
    }

    const lines = input.split("\n");
    lines.forEach((line, index) => {
      if (line.includes("undefined") && !line.includes("| undefined")) {
        issues.push(`Line ${index + 1}: Suspicious undefined usage`);
      }

      if (line.includes("any") && !line.includes("// @ts-ignore")) {
        issues.push(`Line ${index + 1}: Any type detected`);
      }
    });

    if (issues.length === 0) {
      context.logger(`✅ Validation passed`);
    } else {
      context.logger(`⚠️ Validation issues found:`);
      issues.forEach((issue) => context.logger(`   • ${issue}`));
    }

    return Promise.resolve(input);
  }
}

// Stage 6: Parse namespace files for enums
export class NamespaceParsingStage
  implements PipelineStage<ParsedDocument, ParsedDocument>
{
  readonly name = "namespace-parsing";

  constructor(private readonly documentParser: DocumentParsingService) {}

  async process(
    input: ParsedDocument,
    context: ParsingContext
  ): Promise<ParsedDocument> {
    context.logger(`📋 Starting namespace parsing...`);

    const namespaceFiles = context.repository.getNamespaceFiles();
    context.logger(`🔍 Found ${namespaceFiles.size} namespace files to parse`);

    for (const filePath of namespaceFiles) {
      try {
        context.logger(`📥 Parsing namespace: ${filePath}`);

        let parsedDocument;
        if (this.documentParser.isHttpUrl(filePath)) {
          parsedDocument = await this.documentParser.parseFromUrl(filePath);
        } else {
          parsedDocument = await this.documentParser.parseFromFile(filePath);
        }

            if (parsedDocument.namespaceInfo?.enums) {
          for (const enumInfo of parsedDocument.namespaceInfo.enums) {
            context.repository.addGlobalEnum(enumInfo.name, enumInfo);
          }
          context.logger(
            `✅ Added ${parsedDocument.namespaceInfo.enums.length} namespace enums from ${parsedDocument.namespaceInfo.fullName}`
          );
        }
      } catch (error) {
        context.logger(`⚠️ Failed to parse namespace ${filePath}: ${error}`);
      }
    }

    context.logger(`✅ Namespace parsing completed`);
    return input;
  }
}

// Stage 7: Collect final stats
export class StatisticsStage implements PipelineStage<string, string> {
  readonly name = "statistics";

  process(input: string, context: ParsingContext): Promise<string> {
    context.logger(`📈 Collecting final statistics`);

    const repoStats = context.repository.getStats();
    const lines = input.split("\n").length;
    const sizeKB = Math.round((input.length / 1024) * 100) / 100;

    context.logger(`📊 Final Statistics:`);
    context.logger(`   • Classes: ${repoStats.classes}`);
    context.logger(`   • Enums: ${repoStats.enums}`);
    context.logger(`   • Methods: ${repoStats.methods}`);
    context.logger(`   • Signals: ${repoStats.signals}`);
    context.logger(`   • URLs processed: ${repoStats.urls}`);
    context.logger(`   • Output lines: ${lines}`);
    context.logger(`   • Output size: ${sizeKB} KB`);

    return Promise.resolve(input);
  }
}

// Factory for creating standard pipeline stages
export function createStages(
  documentParser: DocumentParsingService,
  dependencyService: TypeDependencyService,
  outputGenerator: IOutputGenerator,
  linkResolver?: LinkResolver
): {
  documentStage: DocumentParsingStage;
  urlStage: UrlParsingStage;
  dependencyStage: DependencyResolutionStage;
  namespaceStage: NamespaceParsingStage;
  outputStage: OutputGenerationStage;
  validationStage: ValidationStage;
  statisticsStage: StatisticsStage;
} {
  return {
    documentStage: new DocumentParsingStage(documentParser, linkResolver),
    urlStage: new UrlParsingStage(documentParser),
    dependencyStage: new DependencyResolutionStage(dependencyService),
    namespaceStage: new NamespaceParsingStage(documentParser),
    outputStage: new OutputGenerationStage(outputGenerator),
    validationStage: new ValidationStage(),
    statisticsStage: new StatisticsStage(),
  };
}
