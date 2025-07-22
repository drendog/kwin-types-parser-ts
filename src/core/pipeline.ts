
import type {
  ParseConfig,
  ParsedClass,
  ParsedEnum,
  ParseStats,
} from "./interfaces.ts";

export interface PipelineStage<TInput, TOutput> {
  readonly name: string;
  process(input: TInput, context: ParsingContext): Promise<TOutput>;
}

export interface ParsingContext {
  config: ParseConfig;
  repository: ParsingRepository;
  logger: (message: string) => void;
}

export interface ParsingRepository {
  addClass(className: string, classInfo: ParsedClass): void;
  getClass(className: string): ParsedClass | undefined;
  getAllClasses(): Map<string, ParsedClass>;
  getClassesByNamespace(namespace: string): ParsedClass[];
  addGlobalEnum(enumName: string, enumInfo: ParsedEnum): void;
  getGlobalEnums(): Map<string, ParsedEnum>;
  markUrlVisited(url: string): void;
  isUrlVisited(url: string): boolean;
  getStats(): ParseStats;
  // Namespace file tracking
  addNamespaceFile(filePath: string): void;
  getNamespaceFiles(): Set<string>;
  hasNamespaceFile(filePath: string): boolean;
}

export class ParsingPipeline {
  private stages: PipelineStage<unknown, unknown>[] = [];

  addStage<TInput, TOutput>(stage: PipelineStage<TInput, TOutput>): this {
    this.stages.push(stage as PipelineStage<unknown, unknown>);
    return this;
  }

  removeStage(stageName: string): this {
    this.stages = this.stages.filter((stage) => stage.name !== stageName);
    return this;
  }

  getStage(stageName: string): PipelineStage<unknown, unknown> | undefined {
    return this.stages.find((stage) => stage.name === stageName);
  }

  getStages(): readonly PipelineStage<unknown, unknown>[] {
    return [...this.stages];
  }

  async execute<TInput, TOutput>(
    input: TInput,
    context: ParsingContext
  ): Promise<TOutput> {
    let result: unknown = input;

    for (const stage of this.stages) {
      try {
        context.logger(`📋 Executing stage: ${stage.name}`);
        result = await stage.process(result, context);
      } catch (error) {
        context.logger(
          `❌ Stage ${stage.name} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw new Error(
          `Pipeline stage '${stage.name}' failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return result as TOutput;
  }

  async executePartial<TInput, TOutput>(
    input: TInput,
    context: ParsingContext,
    fromStage?: string,
    toStage?: string
  ): Promise<TOutput> {
    const fromIndex = fromStage
      ? this.stages.findIndex((s) => s.name === fromStage)
      : 0;
    const toIndex = toStage
      ? this.stages.findIndex((s) => s.name === toStage)
      : this.stages.length - 1;

    if (fromIndex === -1) throw new Error(`Stage '${fromStage}' not found`);
    if (toIndex === -1) throw new Error(`Stage '${toStage}' not found`);
    if (fromIndex > toIndex)
      throw new Error(`From stage must come before to stage`);

    let result: unknown = input;
    const stagesToExecute = this.stages.slice(fromIndex, toIndex + 1);

    for (const stage of stagesToExecute) {
      try {
        context.logger(`📋 Executing stage: ${stage.name}`);
        result = await stage.process(result, context);
      } catch (error) {
        context.logger(
          `❌ Stage ${stage.name} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw new Error(
          `Pipeline stage '${stage.name}' failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return result as TOutput;
  }
}
