
import {
  ParsingPipeline,
  type ParsingContext,
  type PipelineStage,
} from "./core/pipeline.ts";
import { InMemoryParsingRepository } from "./core/parsing-repository.ts";
import { DocumentParsingService } from "./services/document-parser.ts";
import {
  TypeDependencyService,
  type TypeResolutionStats,
} from "./services/type-dependency-resolver.ts";
import { createStages } from "./pipeline/stages.ts";
import { Logger } from "./utils/logtape-logger.ts";

import type {
  ParseConfig,
  ParseStats,
  ParserDependencies,
  ParsedClass,
  ParsedEnum,
} from "./core/interfaces.ts";
import { ConfigurationManager } from "./core/configuration-manager.ts";
import { TypeMapper } from "./type-system/type-mapper.ts";
import { HTMLDocumentParser } from "./parsing/html-document-parser.ts";
import { OutputGenerator } from "./output/output-generator.ts";
import { LinkResolver } from "./parsing/link-resolver.ts";
import { ParsingOrchestrator } from "./parsing/parsing-orchestrator.ts";
import { TypeDependencyTracker } from "./type-system/type-dependency-tracker.ts";

export class KWinDoxygenParser {
  private readonly pipeline: ParsingPipeline;
  private readonly repository: InMemoryParsingRepository;
  private readonly context: ParsingContext;
  private readonly dependencies: ParserDependencies;
  private readonly linkResolver: LinkResolver;
  private readonly documentParser: DocumentParsingService;
  private readonly dependencyService: TypeDependencyService;
  private currentOutput = "";

  constructor(
    baseUrl: string,
    options: {
      config?: Partial<ParseConfig>;
      customDependencies?: Partial<ParserDependencies>;
    } = {}
  ) {
    this.repository = new InMemoryParsingRepository();

    // Wire up all the dependencies
    const configManager = new ConfigurationManager(options.config || {});
    const typeMapper =
      options.customDependencies?.typeMapper || new TypeMapper();
    const linkResolver = new LinkResolver(baseUrl, configManager);
    this.linkResolver = linkResolver;
    const parsingOrchestrator = new ParsingOrchestrator(
      typeMapper,
      configManager
    );
    const htmlParser = new HTMLDocumentParser(
      typeMapper,
      configManager,
      parsingOrchestrator
    );
    const outputGenerator = new OutputGenerator(configManager);

    this.dependencies = {
      configManager,
      typeMapper,
      linkResolver: this.linkResolver,
      htmlParser,
      outputGenerator,
      parsingOrchestrator,
      ...options.customDependencies,
    };

    this.documentParser = new DocumentParsingService(
      htmlParser,
      this.linkResolver
    );
    const typeDependencyTracker = new TypeDependencyTracker();
    this.dependencyService = new TypeDependencyService(
      typeDependencyTracker,
      this.documentParser
    );

    // Assemble the processing pipeline
    const stages = createStages(
      this.documentParser,
      this.dependencyService,
      outputGenerator,
      this.linkResolver
    );

    this.pipeline = new ParsingPipeline()
      .addStage(stages.documentStage)
      .addStage(stages.dependencyStage)
      .addStage(stages.namespaceStage)
      .addStage(stages.outputStage)
      .addStage(stages.validationStage)
      .addStage(stages.statisticsStage);

    this.context = {
      config: configManager.getConfig(),
      repository: this.repository,
      logger: (message: string) => Logger.info(message),
    };
  }

  // Easier way to create parser instances
  static create(
    baseUrl: string,
    options: {
      config?: Partial<ParseConfig>;
      customDependencies?: Partial<ParserDependencies>;
    } = {}
  ): KWinDoxygenParser {
    return new KWinDoxygenParser(baseUrl, options);
  }

  // Parse Doxygen HTML from local file
  async parseFromFile(filePath: string): Promise<void> {
    Logger.info("🚀 Starting: Pipeline-based parsing from file", { filePath });

    try {
      this.currentOutput = await this.pipeline.execute<string, string>(
        filePath,
        this.context
      );
      Logger.info("✅ Completed: Pipeline parsing from file");
    } catch (error) {
      Logger.error("Pipeline parsing failed", error, { filePath });
      throw error;
    }
  }

  // Fetch and parse from URL - handles cross-references
  async parseFromUrl(url: string): Promise<void> {
    Logger.info("🚀 Starting: Pipeline-based parsing from URL", { url });

    // Skip URLs we've already processed
    if (this.repository.isUrlVisited(url)) {
      Logger.info("URL already visited, skipping", { url });
      return;
    }

    try {
      const urlStage = createStages(
        this.documentParser,
        this.dependencyService,
        this.dependencies.outputGenerator,
        this.linkResolver
      ).urlStage;

      // URLs need different pipeline stages
      const urlPipeline = new ParsingPipeline()
        .addStage(urlStage)
        .addStage(
          createStages(
            this.documentParser,
            this.dependencyService,
            this.dependencies.outputGenerator,
            this.linkResolver
          ).dependencyStage
        )
        .addStage(
          createStages(
            this.documentParser,
            this.dependencyService,
            this.dependencies.outputGenerator,
            this.linkResolver
          ).outputStage
        );

      this.currentOutput = await urlPipeline.execute<string, string>(
        url,
        this.context
      );
      Logger.info("✅ Completed: URL pipeline parsing");
    } catch (error) {
      Logger.error("URL pipeline parsing failed", error, { url });
      throw error;
    }
  }

  // Get TS output from current state
  async generateTypeScript(): Promise<string> {
    if (!this.currentOutput) {
      // Build output from what we've parsed so far
      const outputStage = createStages(
        this.documentParser,
        this.dependencyService,
        this.dependencies.outputGenerator,
        this.linkResolver
      ).outputStage;

      return await outputStage.process(
        {
          classInfo: null,
          source: "repository",
          isNamespace: false,
        },
        this.context
      );
    }

    return this.currentOutput;
  }

  async saveToFile(outputPath: string): Promise<void> {
    const content = await this.generateTypeScript();
    await Deno.writeTextFile(outputPath, content);
    Logger.info("✅ Saved TypeScript output to file", {
      outputPath,
      contentLength: content.length,
    });
  }

  getStats(): ParseStats {
    return this.repository.getStats();
  }

  getTypeResolutionStats(): TypeResolutionStats {
    return this.dependencyService.getStats();
  }

  getParsedClasses(): Map<string, ParsedClass> {
    return this.repository.getAllClasses();
  }

  getGlobalEnums(): Map<string, ParsedEnum> {
    return this.repository.getGlobalEnums();
  }

  logConfig(): void {
    return this.dependencies.configManager.logConfig();
  }

  // Access internal services for debugging/advanced use
  getServices(): {
    documentParser: DocumentParsingService;
    dependencyService: TypeDependencyService;
    repository: InMemoryParsingRepository;
    pipeline: ParsingPipeline;
  } {
    return {
      documentParser: this.documentParser,
      dependencyService: this.dependencyService,
      repository: this.repository,
      pipeline: this.pipeline,
    };
  }

  // Hook in custom processing stages
  addPipelineStage(
    stage: PipelineStage<unknown, unknown>,
    position?: number
  ): this {
    if (position !== undefined) {
      Logger.warning("Position-based stage insertion not yet implemented");
    }
    this.pipeline.addStage(stage);
    return this;
  }

  removePipelineStage(stageName: string): this {
    this.pipeline.removeStage(stageName);
    return this;
  }

  // Run just part of the pipeline
  async executePartialPipeline(
    input: string,
    fromStage?: string,
    toStage?: string
  ): Promise<string> {
    return await this.pipeline.executePartial<string, string>(
      input,
      this.context,
      fromStage,
      toStage
    );
  }

  // Reset everything back to empty state
  clear(): void {
    this.repository.clear();
    this.dependencyService.reset();
    this.currentOutput = "";
  }

  // Dump everything for debugging
  exportDebugData(): {
    repository: ReturnType<InMemoryParsingRepository["exportData"]>;
    dependencies: TypeResolutionStats;
    output: string;
    config: ParseConfig;
  } {
    return {
      repository: this.repository.exportData(),
      dependencies: this.dependencyService.getStats(),
      output: this.currentOutput,
      config: this.context.config,
    };
  }
}
