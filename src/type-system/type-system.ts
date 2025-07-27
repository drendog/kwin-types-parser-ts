import { validateTypeMappingConfig } from "../validation/schemas.ts";
import { cppTypeAnalyzer, type ParsedType } from "./type-parser.ts";
import { Logger } from "../utils/logtape-logger.ts";
import { TypeUtils } from "./type-utils.ts";

export interface TypeDefinition {
  name: string;
  tsType: string;
  category: TypeCategory;
  description?: string;
  aliases?: string[];
  templateParams?: string[];
  namespace?: string;
}

export interface MethodDefinition {
  name: string;
  returnType: string;
  parameters: ParameterDefinition[];
  visibility: "public" | "protected" | "private";
  isStatic?: boolean;
  isConst?: boolean;
  isVirtual?: boolean;
  isOverride?: boolean;
  isAbstract?: boolean;
  description?: string;
  decorators?: string[];
  templateParams?: string[];
}

export interface PropertyDefinition {
  name: string;
  type: string;
  visibility: "public" | "protected" | "private";
  readonly?: boolean;
  static?: boolean;
  description?: string;
  decorators?: string[];
  defaultValue?: string;
}

export interface EnumDefinition {
  name: string;
  values: EnumValueDefinition[];
  description?: string;
  namespace?: string;
  isClass?: boolean; // C++11 enum class
}

export interface EnumValueDefinition {
  name: string;
  value?: string | number;
  description?: string;
}

export interface ParameterDefinition {
  name: string;
  type: string;
  defaultValue?: string;
  isOptional?: boolean;
  isVariadic?: boolean;
}

export type TypeCategory =
  | "primitive"
  | "container"
  | "qt-basic"
  | "qt-gui"
  | "qt-core"
  | "kwin"
  | "custom"
  | "template"
  | "enum"
  | "class"
  | "interface";

export interface TypeMappingConfig {
  mappings: TypeDefinition[];
  templateMappings: TemplateMapping[];
  namespaceMappings: NamespaceMapping[];
  customRules: TypeConversionRule[];
}

export interface TemplateMapping {
  pattern: string; // regex pattern
  replacement: string;
  description?: string;
}

export interface NamespaceMapping {
  cppNamespace: string;
  tsNamespace: string;
  stripNamespace?: boolean;
}

export interface TypeConversionRule {
  name: string;
  condition: (type: string) => boolean;
  transform: (type: string) => string;
  priority: number;
}

// Registry for managing type mappings and lookups
export class TypeRegistry {
  private readonly typeDefinitions = new Map<string, TypeDefinition>();
  private readonly aliasMap = new Map<string, string>();
  private templateMappings: TemplateMapping[] = [];
  private namespaceMappings: NamespaceMapping[] = [];
  private customRules: TypeConversionRule[] = [];
  private readonly cacheMap = new Map<string, string>();

  constructor(config?: TypeMappingConfig) {
    if (config) {
      this.loadFromConfig(config);
    }
  }

  loadFromConfig(config: TypeMappingConfig): void {
    this.typeDefinitions.clear();
    this.aliasMap.clear();
    this.templateMappings = [];
    this.namespaceMappings = [];
    this.customRules = [];
    this.cacheMap.clear();

    for (const typeDef of config.mappings) {
      this.registerType(typeDef);
    }

    this.templateMappings = [...config.templateMappings];

    this.namespaceMappings = [...config.namespaceMappings];

    this.customRules = [...config.customRules].sort(
      (a, b) => b.priority - a.priority
    );
  }

  registerType(typeDef: TypeDefinition): void {
    this.typeDefinitions.set(typeDef.name, typeDef);

    if (typeDef.aliases) {
      for (const alias of typeDef.aliases) {
        this.aliasMap.set(alias, typeDef.name);
      }
    }

    // Invalidate cache
    this.cacheMap.clear();
  }

  getType(name: string): TypeDefinition | undefined {
    const actualName = this.aliasMap.get(name) || name;
    return this.typeDefinitions.get(actualName);
  }

  getTypesByCategory(category: TypeCategory): TypeDefinition[] {
    return Array.from(this.typeDefinitions.values()).filter(
      (type) => type.category === category
    );
  }

  hasType(name: string): boolean {
    const actualName = this.aliasMap.get(name) || name;
    return this.typeDefinitions.has(actualName);
  }

  getTemplateMappings(): TemplateMapping[] {
    return [...this.templateMappings];
  }

  getNamespaceMappings(): NamespaceMapping[] {
    return [...this.namespaceMappings];
  }

  getCustomRules(): TypeConversionRule[] {
    return [...this.customRules];
  }

  addCustomRule(rule: TypeConversionRule): void {
    this.customRules.push(rule);
    this.customRules.sort((a, b) => b.priority - a.priority);
    this.cacheMap.clear();
  }

  getAllTypeNames(): string[] {
    const names = new Set<string>();

    for (const name of this.typeDefinitions.keys()) {
      names.add(name);
    }

    for (const alias of this.aliasMap.keys()) {
      names.add(alias);
    }

    return Array.from(names).sort();
  }

  exportConfig(): TypeMappingConfig {
    return {
      mappings: Array.from(this.typeDefinitions.values()),
      templateMappings: this.templateMappings,
      namespaceMappings: this.namespaceMappings,
      customRules: this.customRules,
    };
  }

  clearCache(): void {
    this.cacheMap.clear();
  }

  getCacheStats(): { size: number; hitRate: number } {
    // Placeholder - need hit/miss tracking
    return {
      size: this.cacheMap.size,
      hitRate: 0, // Placeholder
    };
  }
}

// Advanced type converter with sophisticated conversion logic
export class TypeConverter {
  private readonly registry: TypeRegistry;
  private readonly conversionCache = new Map<string, string>();

  constructor(registry: TypeRegistry) {
    this.registry = registry;
  }

  cppToTypeScript(cppType: string): string {
    // Check cache first
    if (this.conversionCache.has(cppType)) {
      return this.conversionCache.get(cppType)!;
    }

    const result = this.performConversion(cppType);
    this.conversionCache.set(cppType, result);
    return result;
  }

  private performConversion(cppType: string): string {
    // Clean up the type string
    const cleanType = this.cleanTypeString(cppType);

    // Apply custom rules first (highest priority)
    for (const rule of this.registry.getCustomRules()) {
      if (rule.condition(cleanType)) {
        return this.resolveTemplateTypes(rule.transform(cleanType));
      }
    }

    // Handle templates
    const templateResult = this.handleTemplateTypes(cleanType);
    if (templateResult !== cleanType) {
      return this.resolveTemplateTypes(templateResult);
    }

    // Handle namespace types
    const namespaceResult = this.handleNamespaceTypes(cleanType);
    if (namespaceResult !== cleanType) {
      return this.resolveTemplateTypes(namespaceResult);
    }

    // Direct type lookup
    const typeDef = this.registry.getType(cleanType);
    if (typeDef) {
      return typeDef.tsType;
    }

    // Fallback to normalized name
    const normalized = this.normalizeTypeName(cleanType);
    const normalizedTypeDef = this.registry.getType(normalized);
    if (normalizedTypeDef) {
      return normalizedTypeDef.tsType;
    }

    // Last resort - return the clean type or 'any'
    return cleanType || "any";
  }

  private cleanTypeString(cppType: string): string {
    const parsed = cppTypeAnalyzer.parseType(cppType);
    if (parsed) {
      // Return the normalized form
      return parsed.fullName;
    }

    // Fallback to basic cleanup if parsing fails
    return TypeUtils.cleanCppTypeString(cppType);
  }

  private handleTemplateTypes(type: string): string {
    const parsed = cppTypeAnalyzer.parseType(type);
    if (!parsed?.templateArgs) {
      return type; // Not a template type
    }

    // Check if we have a template mapping for this base type
    for (const mapping of this.registry.getTemplateMappings()) {
      // Build a pattern to match the base type
      const baseTypePattern = mapping.pattern
        .replace(/^\^|\$$/g, "")
        .split("<")[0];
      const regex = new RegExp(`^${baseTypePattern}$`);

      if (regex.test(parsed.baseType)) {
        let result = mapping.replacement;

        // Replace template parameters with converted types
        for (let i = 0; i < parsed.templateArgs.length; i++) {
          const placeholder = `$${i + 1}`;
          const replacement = this.cppToTypeScript(
            parsed.templateArgs[i].fullName
          );
          result = result.replace(
            new RegExp(`\\${placeholder}`, "g"),
            replacement
          );
        }

        return result;
      }
    }

    // If no mapping found, construct generic template
    const convertedArgs = parsed.templateArgs
      .map((arg) => this.cppToTypeScript(arg.fullName))
      .join(", ");

    return `${parsed.baseType}<${convertedArgs}>`;
  }

  private handleNamespaceTypes(type: string): string {
    const parsed = cppTypeAnalyzer.parseType(type);
    if (!parsed || !parsed.namespace) {
      return type; // No namespace
    }

    for (const mapping of this.registry.getNamespaceMappings()) {
      if (parsed.namespace === mapping.cppNamespace) {
        if (mapping.stripNamespace) {
          return parsed.baseType;
        } else {
          return `${mapping.tsNamespace}.${parsed.baseType}`;
        }
      }
    }

    // Fallback: keep the namespace but convert :: to .
    return `${parsed.namespace.replace(/::/g, ".")}.${parsed.baseType}`;
  }

  resolveTemplateTypes(type: string): string {
    const parsed = cppTypeAnalyzer.parseType(type);
    if (!parsed || !parsed.templateArgs) {
      return type; // Not a template
    }

    // Special handling for container types
    if (parsed.baseType === "Array") {
      const innerType = this.cppToTypeScript(parsed.templateArgs[0].fullName);
      return `${innerType}[]`;
    } else if (parsed.baseType === "Map" && parsed.templateArgs.length >= 2) {
      const keyType = this.cppToTypeScript(parsed.templateArgs[0].fullName);
      const valueType = this.cppToTypeScript(parsed.templateArgs[1].fullName);
      return `Map<${keyType}, ${valueType}>`;
    } else if (parsed.baseType === "Set") {
      const innerType = this.cppToTypeScript(parsed.templateArgs[0].fullName);
      return `Set<${innerType}>`;
    }

    // Generic template handling
    const resolvedArgs = parsed.templateArgs
      .map((arg) => this.cppToTypeScript(arg.fullName))
      .join(", ");

    return `${parsed.baseType}<${resolvedArgs}>`;
  }

  normalizeTypeName(typeName: string): string {
    const normalized = cppTypeAnalyzer.normalizeType(typeName);
    return normalized || TypeUtils.normalizeTypeName(typeName);
  }

  getStats(): { cacheSize: number; registeredTypes: number } {
    return {
      cacheSize: this.conversionCache.size,
      registeredTypes: this.registry.getAllTypeNames().length,
    };
  }

  clearCache(): void {
    this.conversionCache.clear();
    this.registry.clearCache();
  }

  canConvert(cppType: string): boolean {
    const cleanType = this.cleanTypeString(cppType);

    // Check custom rules
    for (const rule of this.registry.getCustomRules()) {
      if (rule.condition(cleanType)) {
        return true;
      }
    }

    // Use the parser to analyze the type
    const parsed = cppTypeAnalyzer.parseType(cleanType);
    if (parsed) {
      // Check template mappings for template types
      if (parsed.templateArgs) {
        for (const mapping of this.registry.getTemplateMappings()) {
          const baseTypePattern = mapping.pattern
            .replace(/^\^|\$$/g, "")
            .split("<")[0];
          const regex = new RegExp(`^${baseTypePattern}$`);
          if (regex.test(parsed.baseType)) {
            return true;
          }
        }
      }

      // Check direct type lookup for base type
      const typeToCheck = parsed.namespace
        ? `${parsed.namespace}::${parsed.baseType}`
        : parsed.baseType;

      return (
        this.registry.hasType(typeToCheck) ||
        this.registry.hasType(parsed.baseType)
      );
    }

    // Fallback to original logic
    return (
      this.registry.hasType(cleanType) ||
      this.registry.hasType(this.normalizeTypeName(cleanType))
    );
  }

  parseTypeSignature(cppType: string): ParsedType | null {
    return cppTypeAnalyzer.parseType(cppType);
  }

  extractTemplateArguments(cppType: string): string[] {
    return cppTypeAnalyzer.extractTemplateParameters(cppType);
  }

  getBaseTypeName(cppType: string): string {
    return cppTypeAnalyzer.getBaseType(cppType);
  }

  isTemplateType(cppType: string): boolean {
    return cppTypeAnalyzer.isTemplateType(cppType);
  }

  splitTypeComponents(cppType: string): {
    namespace?: string;
    typeName: string;
  } {
    return cppTypeAnalyzer.splitNamespace(cppType);
  }
}

// Factory function for creating type system with external configuration
export async function createTypeSystemFromFile(
  configPath: string
): Promise<{ registry: TypeRegistry; converter: TypeConverter }> {
  try {
    const configText = await Deno.readTextFile(configPath);
    const rawConfig = JSON.parse(configText);

    // Since JSON can't contain functions, we need to handle customRules differently
    // Extract customRules before validation if they exist
    const { customRules: _customRules, ...configWithoutRules } = rawConfig;

    // Validate the configuration with Zod (excluding customRules which can't be validated as functions from JSON)
    const validatedConfig = validateTypeMappingConfig(configWithoutRules);
    Logger.success(
      `Type mapping configuration validated successfully from ${configPath}`
    );

    // Convert the validated config to the format expected by TypeRegistry
    const typeSystemConfig: TypeMappingConfig = {
      mappings: validatedConfig.mappings as TypeDefinition[],
      templateMappings: validatedConfig.templateMappings || [],
      namespaceMappings: validatedConfig.namespaceMappings || [],
      customRules: [], // We'll add these separately if they exist in the JSON
    };

    const registry = new TypeRegistry(typeSystemConfig);
    const converter = new TypeConverter(registry);

    return { registry, converter };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.warning(
      `Failed to load type configuration from ${configPath}: ${errorMessage}`
    );

    // Provide specific error guidance
    if (errorMessage.includes("version")) {
      Logger.warning(
        "Configuration validation hint: Ensure the configuration has a valid semver version field"
      );
    }
    if (errorMessage.includes("mappings")) {
      Logger.warning(
        "Configuration validation hint: Check that the mappings array contains valid type definitions"
      );
    }

    // No fallback to defaults - throw error instead
    throw new Error(
      `Failed to load type configuration from ${configPath}: ${errorMessage}`
    );
  }
}
