
import type { ITypeMapper } from "../core/interfaces.ts";
import {
  TypeRegistry,
  TypeConverter,
  createTypeSystemFromFile,
} from "./type-system.ts";
import { defaultTypeMappings } from "./default-type-mappings.ts";
import { Logger } from "../utils/logtape-logger.ts";

export class TypeMapper implements ITypeMapper {
  private typeConverter: TypeConverter;
  private typeRegistry: TypeRegistry;

  constructor() {
    this.typeRegistry = new TypeRegistry(defaultTypeMappings);
    this.typeConverter = new TypeConverter(this.typeRegistry);
  }

  // Load custom type mappings from file
  static async fromConfig(configPath: string): Promise<TypeMapper> {
    const mapper = new TypeMapper();
    await mapper.loadConfig(configPath);
    return mapper;
  }


  mapCppTypeToTs(cppType: string): string {
    return this.typeConverter.cppToTypeScript(cppType);
  }

  addTypeMapping(cppType: string, tsType: string): void {
    this.typeRegistry.registerType({
      name: cppType,
      tsType: tsType,
      category: "custom",
    });

    // Clear cache since we just added a new type
    this.typeConverter.clearCache();
  }

  getTypeMappings(): Map<string, string> {
    const mappings = new Map<string, string>();
    for (const typeName of this.typeRegistry.getAllTypeNames()) {
      const typeDef = this.typeRegistry.getType(typeName);
      if (typeDef) {
        mappings.set(typeName, typeDef.tsType);
      }
    }
    return mappings;
  }

  canConvert(cppType: string): boolean {
    return this.typeConverter.canConvert(cppType);
  }

  getStats(): { cacheSize: number; registeredTypes: number } {
    return this.typeConverter.getStats();
  }

  clearCache(): void {
    this.typeConverter.clearCache();
  }

  getTypeRegistry(): TypeRegistry {
    return this.typeRegistry;
  }

  getTypeConverter(): TypeConverter {
    return this.typeConverter;
  }

  async loadConfig(configPath: string): Promise<void> {
    try {
      const { registry, converter } = await createTypeSystemFromFile(
        configPath
      );
      this.typeRegistry = registry;
      this.typeConverter = converter;
    } catch (error) {
      Logger.error(`Failed to load type config from ${configPath}`, error);
      throw error;
    }
  }

  // Get full type info including category and conversion status
  getTypeInfo(cppType: string): {
    canConvert: boolean;
    tsType: string;
    category?: string;
  } {
    const canConvert = this.canConvert(cppType);
    const tsType = this.mapCppTypeToTs(cppType);

    const cleanType = cppType
      .replace(/\bconst\b/g, "")
      .replace(/\breference\b/g, "")
      .replace(/\bpointer\b/g, "")
      .replace(/[&*]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const typeDef = this.typeRegistry.getType(cleanType);
    const category = typeDef?.category;

    return { canConvert, tsType, category };
  }
}
