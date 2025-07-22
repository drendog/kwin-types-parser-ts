
import { groupBy } from "lodash";
import { type Document, DOMParser } from "deno_dom";
import type {
  TypeDependencyTracker,
  TypeDependency,
} from "../type-system/type-dependency-tracker.ts";
import type { DocumentParsingService, ParsedDocument } from "./document-parser.ts";
import type { ParsingRepository } from "../core/pipeline.ts";
import type { ParsedClass } from "../core/interfaces.ts";
import { Logger } from "../utils/logtape-logger.ts";

export interface TypeResolutionStats {
  resolvedTypes: number;
  unresolvedTypes: number;
  circulardependencies: number;
  maxDepth: number;
}

export class TypeDependencyService {
  private readonly pendingResolutions = new Map<string, Promise<void>>();
  private readonly processedClasses = new Set<string>();
  private readonly circularDependencies = new Set<string>();
  private maxDepthReached = 0;
  private resolvedTypesCount = 0;
  private unresolvedTypesCount = 0;
  private currentRepository?: ParsingRepository; 
  private readonly sourceDocuments = new Map<string, Document>(); // Cache docs for link resolution

  constructor(
    private readonly tracker: TypeDependencyTracker,
    private readonly documentParser: DocumentParsingService
  ) {}

  async resolveAllDependencies(repository: ParsingRepository): Promise<void> {
    this.currentRepository = repository;

    const maxIterations = 50; // Safety valve - prevents runaway resolution chains
    let iteration = 0;

    Logger.info("Starting type dependency resolution...");

    while (this.pendingResolutions.size > 0 && iteration < maxIterations) {
      const pendingCount = this.pendingResolutions.size;
      Logger.info(
        `Iteration ${iteration + 1}: ${pendingCount} pending resolutions`,
        {
          iteration: iteration + 1,
          pendingCount,
        }
      );

      const results = await Promise.allSettled(
        Array.from(this.pendingResolutions.values())
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const keys = Array.from(this.pendingResolutions.keys());
          Logger.warning(
            `Resolution failed for ${keys[index]}: ${result.reason}`
          );
        }
      });

      this.pendingResolutions.clear();
      await this.discoverNewDependencies(repository);

      if (this.pendingResolutions.size === pendingCount) {
        Logger.info("No new dependencies discovered, stopping resolution");
        break;
      }

      iteration++;
      this.maxDepthReached = Math.max(this.maxDepthReached, iteration);
    }

    if (iteration >= maxIterations) {
      Logger.warning(
        `Maximum iterations (${maxIterations}) reached during type resolution`
      );
    }

    Logger.info(`Type dependency resolution completed`, {
      iterations: iteration,
    });
    this.logResolutionStats();
  }

  private async discoverNewDependencies(
    repository: ParsingRepository
  ): Promise<void> {
    const allClasses = Array.from(repository.getAllClasses().values());

    const allDependencies = await Promise.all(
      allClasses.map(async (cls) => {
        if (this.processedClasses.has(cls.fullName)) {
          return [];
        }

        this.processedClasses.add(cls.fullName);

        const sourceDoc =
          this.sourceDocuments.get(cls.fullName) ||
          this.createMockDocument(cls);
        const dependencies = this.tracker.extractTypeDependencies(
          cls,
          sourceDoc,
          cls.fullName
        );

        // Mock docs are missing href links - try to get the real HTML
        if (
          !this.sourceDocuments.has(cls.fullName) &&
          dependencies.some((dep) => !dep.linkedHref)
        ) {
          Logger.debug(
            `Re-parsing ${cls.fullName} with original document to get proper links`
          );
          try {
            // Try to parse the original HTML file for this class
            const htmlPath = this.getHtmlPathForClass(cls.fullName);
            if (htmlPath) {
              const realDoc = await this.documentParser.parseFromFile(htmlPath);
              if (realDoc.sourceDocument) {
                const realDependencies = this.tracker.extractTypeDependencies(
                  cls,
                  realDoc.sourceDocument,
                  htmlPath
                );
                dependencies.length = 0;
                dependencies.push(...realDependencies);
                this.sourceDocuments.set(cls.fullName, realDoc.sourceDocument);
              }
            }
          } catch (error) {
            Logger.debug(`Failed to re-parse ${cls.fullName}: ${error}`);
          }
        }

        Logger.debug(`Found type references in ${cls.fullName}`, {
          count: dependencies.length,
          className: cls.fullName,
        });
        if (dependencies.length > 0) {
          dependencies.forEach((dep) => {
            Logger.debug(
              `  → ${dep.fullName} (${dep.usageType}) href: ${dep.linkedHref}`,
              {
                dependency: dep.fullName,
                usageType: dep.usageType,
                hasLink: !!dep.linkedHref,
              }
            );
          });
        }

        // TileManager debugging - why aren't TileModel/CustomTile getting resolved?
        if (cls.fullName === "KWin::TileManager") {
          Logger.info(
            `DEBUG TileManager: Found ${dependencies.length} dependencies`
          );
          const tileModelDeps = dependencies.filter((dep) =>
            dep.fullName.includes("TileModel")
          );
          const customTileDeps = dependencies.filter((dep) =>
            dep.fullName.includes("CustomTile")
          );
          Logger.info(
            `DEBUG TileManager: TileModel refs: ${tileModelDeps.length}, CustomTile refs: ${customTileDeps.length}`
          );
          tileModelDeps.forEach((dep) =>
            Logger.info(
              `  TileModel: ${dep.fullName} (${dep.usageType}) href: ${dep.linkedHref}`
            )
          );
          customTileDeps.forEach((dep) =>
            Logger.info(
              `  CustomTile: ${dep.fullName} (${dep.usageType}) href: ${dep.linkedHref}`
            )
          );
        }

        return dependencies;
      })
    );

    const flatDependencies = allDependencies.flat();
    const groupedDependencies = groupBy(flatDependencies, "fullName");

    for (const [typeName, dependencies] of Object.entries(
      groupedDependencies
    )) {
      if (
        !this.pendingResolutions.has(typeName) &&
        this.shouldResolveType(dependencies[0])
      ) {
        const unresolvedDeps =
          this.tracker.getUnresolvedDependencies(dependencies);

        for (const dep of unresolvedDeps) {
          if (!this.pendingResolutions.has(dep.fullName) && dep.linkedHref) {
            Logger.debug(`Scheduling resolution for: ${dep.fullName}`, {
              type: dep.fullName,
              href: dep.linkedHref,
            });
            this.pendingResolutions.set(
              dep.fullName,
              this.resolveTypeDependency(dep, repository)
            );
          }
        }
      }
    }
  }

  private async resolveTypeDependency(
    dependency: TypeDependency,
    repository: ParsingRepository
  ): Promise<void> {
    try {
      if (this.circularDependencies.has(dependency.fullName)) {
        Logger.debug(`Skipping circular dependency: ${dependency.fullName}`, {
          type: dependency.fullName,
        });
        return;
      }

      Logger.debug(`Resolving type dependency: ${dependency.fullName}`, {
        type: dependency.fullName,
      });

      const sourceUrl = dependency.linkedHref || dependency.sourceLocation;

      if (!sourceUrl) {
        Logger.warning(`No URL available for ${dependency.fullName}`);
        this.unresolvedTypesCount++;
        return;
      }

      const fullPath = sourceUrl.startsWith("html/")
        ? sourceUrl
        : `html/${sourceUrl}`;

      if (fullPath.includes("namespace_") && fullPath.endsWith(".html")) {
        Logger.debug(`Discovered namespace file: ${fullPath}`, {
          path: fullPath,
        });
        repository.addNamespaceFile(fullPath);
      }

      let parsedDocument;
      if (this.documentParser.isHttpUrl(fullPath)) {
        parsedDocument = await this.documentParser.parseFromUrl(fullPath);
      } else {
        parsedDocument = await this.documentParser.parseFromFile(fullPath);
      }

      if (parsedDocument.classInfo) {
        Logger.info(`Successfully resolved: ${dependency.fullName}`, {
          from: dependency.fullName,
          to: parsedDocument.classInfo.fullName,
        });

        if (parsedDocument.sourceDocument) {
          this.sourceDocuments.set(
            parsedDocument.classInfo.fullName,
            parsedDocument.sourceDocument
          );
        }

        repository.addClass(
          parsedDocument.classInfo.fullName,
          parsedDocument.classInfo
        );

        this.tracker.addParsedClass(
          parsedDocument.classInfo.fullName,
          parsedDocument.classInfo
        );

        this.resolvedTypesCount++;
      } else {
        Logger.warning(
          `No class found in resolved document for: ${dependency.fullName}`
        );
        this.unresolvedTypesCount++;
      }
    } catch (error) {
      Logger.error(
        `Failed to resolve dependency ${dependency.fullName}`,
        error
      );
      this.unresolvedTypesCount++;

      if (error instanceof Error && error.message.includes("circular")) {
        this.circularDependencies.add(dependency.fullName);
      }
    }
  }

  private shouldResolveType(dependency: TypeDependency): boolean {
    return (
      this.tracker.canResolveType(dependency) &&
      !this.circularDependencies.has(dependency.fullName)
    );
  }

  private createMockDocument(cls: ParsedClass): Document {
    const mockHtml = `
      <html>
        <body>
          <div class="contents">
            <h1>${cls.fullName}</h1>
          </div>
        </body>
      </html>
    `;

    return new DOMParser().parseFromString(mockHtml, "text/html")!;
  }

  getStats(): TypeResolutionStats {
    return {
      resolvedTypes: this.resolvedTypesCount,
      unresolvedTypes: this.unresolvedTypesCount,
      circulardependencies: this.circularDependencies.size,
      maxDepth: this.maxDepthReached,
    };
  }

  private logResolutionStats(): void {
    const stats = this.getStats();
    Logger.info("Type Resolution Statistics", {
      resolvedTypes: stats.resolvedTypes,
      unresolvedTypes: stats.unresolvedTypes,
      circularDependencies: stats.circulardependencies,
      maxDepth: stats.maxDepth,
    });

    if (this.circularDependencies.size > 0) {
      Logger.warning(
        `Circular dependencies detected: ${Array.from(
          this.circularDependencies
        ).join(", ")}`
      );
    }
  }

  reset(): void {
    this.pendingResolutions.clear();
    this.processedClasses.clear();
    this.circularDependencies.clear();
    this.sourceDocuments.clear();
    this.maxDepthReached = 0;
    this.resolvedTypesCount = 0;
    this.unresolvedTypesCount = 0;
  }

  private getHtmlPathForClass(className: string): string | null {
    // Convert class name like "KWin::TileManager" to HTML file path
    const normalizedName = className
      .replace(/^KWin::/, "")
      .replace(/^KWin\./, "");
    const htmlName = `class_k_win_1_1_${normalizedName
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()}.html`;
    return `html/${htmlName}`;
  }

  extractDependenciesFromDocument(
    parsedDocument: ParsedDocument,
    repository?: ParsingRepository
  ): void {
    if (!parsedDocument.classInfo || !parsedDocument.sourceDocument) {
      return;
    }

    if (repository) {
      this.currentRepository = repository;
    }

    this.sourceDocuments.set(
      parsedDocument.classInfo.fullName,
      parsedDocument.sourceDocument
    );

    const dependencies = this.tracker.extractTypeDependencies(
      parsedDocument.classInfo,
      parsedDocument.sourceDocument,
      parsedDocument.source
    );

    Logger.debug(
      `Found type references in ${parsedDocument.classInfo.fullName}`,
      {
        count: dependencies.length,
        className: parsedDocument.classInfo.fullName,
      }
    );
    if (dependencies.length > 0) {
      dependencies.forEach((dep) => {
        Logger.debug(`  → ${dep.fullName} (${dep.usageType})`, {
          dependency: dep.fullName,
          usageType: dep.usageType,
          hasLink: !!dep.linkedHref,
        });
      });
    }

    const unresolvedDeps = this.tracker.getUnresolvedDependencies(dependencies);

    for (const dep of unresolvedDeps) {
      if (
        !this.pendingResolutions.has(dep.fullName) &&
        dep.linkedHref &&
        this.currentRepository
      ) {
        Logger.debug(`Scheduling resolution for: ${dep.fullName}`, {
          type: dep.fullName,
          href: dep.linkedHref,
        });
        this.pendingResolutions.set(
          dep.fullName,
          this.resolveTypeDependency(dep, this.currentRepository)
        );
      }
    }
  }
}
