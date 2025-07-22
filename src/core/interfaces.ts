
import type { Document } from "deno_dom";

export type Visibility = "public" | "protected" | "private";

export interface ParsedClass {
  name: string;
  namespace: string;
  fullName: string;
  inheritance?: string[];
  enums: ParsedEnum[];
  methods: ParsedMethod[];
  signals: ParsedMethod[];
  properties: ParsedProperty[];
  slots: ParsedMethod[];
  description?: string;
  isAbstract?: boolean;
}

export interface ParsedEnum {
  name: string;
  values: { name: string; description?: string; value?: string }[];
  description?: string;
}

export interface ParsedMethod {
  name: string;
  returnType: string;
  parameters: ParsedParameter[];
  isStatic?: boolean;
  isConst?: boolean;
  isVirtual?: boolean;
  isOverride?: boolean;
  isAbstract?: boolean;
  description?: string;
  visibility: Visibility;
  decorators?: string[];
}

export interface ParsedParameter {
  name: string;
  type: string;
  defaultValue?: string;
  isOptional?: boolean;
  description?: string;
}

export interface ParsedProperty {
  name: string;
  type: string;
  readonly?: boolean;
  static?: boolean;
  description?: string;
  decorators?: string[];
}

export interface ParseConfig {
  includePrivate: boolean;
  generateComments: boolean;
  outputFormat: "typescript" | "interface-only";
}

export interface ParseStats {
  classes: number;
  urls: number;
  enums: number;
  methods: number;
  signals: number;
}

// Service interfaces for dependency injection
export interface IHTMLDocumentParser {
  parseDocument(doc: Document, source: string): ParsedClass | null;
  parseNamespaceDocument(doc: Document): {
    name: string;
    fullName: string;
    enums: ParsedEnum[];
  } | null;
}

export interface ITypeMapper {
  mapCppTypeToTs(cppType: string): string;
  addTypeMapping(cppType: string, tsType: string): void;
  getTypeMappings(): Map<string, string>;
  canConvert(cppType: string): boolean;
  getStats(): { cacheSize: number; registeredTypes: number };
  clearCache(): void;
}

export interface IOutputGenerator {
  generateTypeScript(classes: Map<string, ParsedClass>): Promise<string>;
  generateTypeScript(
    classes: Map<string, ParsedClass>,
    globalEnums: Map<string, ParsedEnum>
  ): Promise<string>;
}

export interface IConfigurationManager {
  getConfig(): ParseConfig;
  validateConfig(config: Partial<ParseConfig>): ParseConfig;
  logConfig(): void;
  updateConfig(updates: Partial<ParseConfig>): void;
  getValidationErrors(config: Partial<ParseConfig>): string[];
  isValidConfig(config: Partial<ParseConfig>): boolean;
}

export interface ILinkResolver {
  shouldFollowLink(href: string, currentDepth: number): boolean;
  resolveUrl(href: string, source: string): string;
  getRelatedLinks(doc: Document): string[];
  isHttpUrl(source: string): boolean;
}

export interface IParsingOrchestrator {
  parseClassContent(
    doc: Document,
    classInfo: ParsedClass,
    config: ParseConfig
  ): void;
  parseSpecificContent<T>(
    strategyName: string,
    doc: Document,
    config: ParseConfig,
    ...args: unknown[]
  ): T[];
  registerStrategy<T>(name: string, strategy: unknown): void;
  getAvailableStrategies(): string[];
  hasStrategy(name: string): boolean;
  unregisterStrategy(name: string): boolean;
  getStrategy(strategyName: string): unknown;
}

export interface ParserDependencies {
  htmlParser: IHTMLDocumentParser;
  typeMapper: ITypeMapper;
  outputGenerator: IOutputGenerator;
  configManager: IConfigurationManager;
  linkResolver: ILinkResolver;
  parsingOrchestrator: IParsingOrchestrator;
}
