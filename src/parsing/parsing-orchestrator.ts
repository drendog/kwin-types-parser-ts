import type { Document } from "deno_dom";
import type {
  ParsedClass,
  ParseConfig,
  ITypeMapper,
  IConfigurationManager,
  Visibility,
} from "../core/interfaces.ts";
import {
  type ParseStrategy,
  MethodParseStrategy,
  EnumParseStrategy,
  PropertyParseStrategy,
  SignalParseStrategy,
} from "./parsing-strategies/index.ts";

export class ParsingOrchestrator {
  private readonly strategies: Map<string, ParseStrategy<unknown>>;

  constructor(typeMapper: ITypeMapper, configManager: IConfigurationManager) {
    const methodStrategy = new MethodParseStrategy(typeMapper, configManager);

    this.strategies = new Map();
    this.strategies.set("methods", methodStrategy as ParseStrategy<unknown>);
    this.strategies.set(
      "enums",
      new EnumParseStrategy() as ParseStrategy<unknown>
    );
    this.strategies.set(
      "properties",
      new PropertyParseStrategy(
        typeMapper,
        configManager
      ) as ParseStrategy<unknown>
    );
    this.strategies.set(
      "signals",
      new SignalParseStrategy(methodStrategy) as ParseStrategy<unknown>
    );
  }

  parseClassContent(
    doc: Document,
    classInfo: ParsedClass,
    config: ParseConfig
  ): void {
    // Parse enums
    const enumStrategy = this.strategies.get("enums") as EnumParseStrategy;
    classInfo.enums = enumStrategy.parse(doc, config);

    // Parse methods with visibility filtering
    const methodStrategy = this.strategies.get(
      "methods"
    ) as MethodParseStrategy;
    const allMethods = [
      ...methodStrategy.parse(doc, config, "pub-methods", "public"),
      ...methodStrategy.parse(doc, config, "pro-methods", "protected"),
      ...(config.includePrivate
        ? methodStrategy.parse(doc, config, "pri-methods", "private")
        : []),
    ];
    // Only keep Qt decorated methods
    classInfo.methods = allMethods.filter((method) =>
      method.decorators?.some((d) => d.startsWith("Q_"))
    );

    // Parse slots with Qt decoration filtering
    const allSlots = methodStrategy.parse(doc, config, "pub-slots", "public");
    classInfo.slots = allSlots.filter((slot) =>
      slot.decorators?.some((d) => d.startsWith("Q_"))
    );

    // Parse signals
    const signalStrategy = this.strategies.get(
      "signals"
    ) as SignalParseStrategy;
    classInfo.signals = signalStrategy.parse(doc, config);

    // Parse properties
    const propertyStrategy = this.strategies.get(
      "properties"
    ) as PropertyParseStrategy;
    classInfo.properties = propertyStrategy.parse(doc, config);
  }

  parseSpecificContent<T>(
    strategyName: string,
    doc: Document,
    config: ParseConfig,
    ...args: unknown[]
  ): T[] {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown parsing strategy: ${strategyName}`);
    }

    return strategy.parse(doc, config, ...args) as T[];
  }

  registerStrategy<T>(name: string, strategy: ParseStrategy<T>): void {
    this.strategies.set(name, strategy as ParseStrategy<unknown>);
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  hasStrategy(name: string): boolean {
    return this.strategies.has(name);
  }

  unregisterStrategy(name: string): boolean {
    return this.strategies.delete(name);
  }

  parseMethods(
    doc: Document,
    config: ParseConfig,
    sectionId: string,
    visibility: Visibility
  ) {
    const methodStrategy = this.strategies.get(
      "methods"
    ) as MethodParseStrategy;
    return methodStrategy.parse(doc, config, sectionId, visibility);
  }

  getStrategy(strategyName: string): unknown {
    return this.strategies.get(strategyName);
  }
}
