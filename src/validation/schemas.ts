
import { z } from "zod";

// Primitive validation schemas
export const VisibilitySchema = z.enum(["public", "protected", "private"]);

export const OutputFormatSchema = z.enum(["typescript", "interface-only"]);

// Core configuration schemas
export const ParseConfigSchema = z
  .object({
    includePrivate: z.boolean(),
    generateComments: z.boolean(),
    outputFormat: OutputFormatSchema,
  })
  .strict();

export const PartialParseConfigSchema = ParseConfigSchema.partial();

// Parameter and method schemas
export const ParsedParameterSchema = z
  .object({
    name: z.string().min(1, "Parameter name cannot be empty"),
    type: z.string().min(1, "Parameter type cannot be empty"),
    defaultValue: z.string().optional(),
    isOptional: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

export const ParsedMethodSchema = z
  .object({
    name: z.string().min(1, "Method name cannot be empty"),
    returnType: z.string().min(1, "Return type cannot be empty"),
    parameters: z.array(ParsedParameterSchema),
    isStatic: z.boolean().optional(),
    isConst: z.boolean().optional(),
    isVirtual: z.boolean().optional(),
    isOverride: z.boolean().optional(),
    isAbstract: z.boolean().optional(),
    description: z.string().optional(),
    visibility: VisibilitySchema,
    decorators: z.array(z.string()).optional(),
  })
  .strict();

export const ParsedPropertySchema = z
  .object({
    name: z.string().min(1, "Property name cannot be empty"),
    type: z.string().min(1, "Property type cannot be empty"),
    readonly: z.boolean().optional(),
    static: z.boolean().optional(),
    description: z.string().optional(),
    decorators: z.array(z.string()).optional(),
  })
  .strict();

// Enum schemas
export const EnumValueSchema = z
  .object({
    name: z.string().min(1, "Enum value name cannot be empty"),
    description: z.string().optional(),
    value: z.string().optional(),
  })
  .strict();

export const ParsedEnumSchema = z
  .object({
    name: z.string().min(1, "Enum name cannot be empty"),
    values: z
      .array(EnumValueSchema)
      .min(1, "Enum must have at least one value"),
    description: z.string().optional(),
  })
  .strict();

// Class schema
export const ParsedClassSchema = z
  .object({
    name: z.string().min(1, "Class name cannot be empty"),
    namespace: z.string(),
    fullName: z.string().min(1, "Full name cannot be empty"),
    inheritance: z.array(z.string()).optional(),
    enums: z.array(ParsedEnumSchema),
    methods: z.array(ParsedMethodSchema),
    signals: z.array(ParsedMethodSchema),
    properties: z.array(ParsedPropertySchema),
    slots: z.array(ParsedMethodSchema),
    description: z.string().optional(),
    isAbstract: z.boolean().optional(),
  })
  .strict();

// Statistics schema
export const ParseStatsSchema = z
  .object({
    classes: z.number().int().min(0),
    urls: z.number().int().min(0),
    enums: z.number().int().min(0),
    methods: z.number().int().min(0),
    signals: z.number().int().min(0),
  })
  .strict();

// Type mapping configuration schemas
export const TypeMappingSchema = z
  .object({
    name: z.string().min(1, "Type mapping name cannot be empty"),
    tsType: z.string().min(1, "TypeScript type cannot be empty"),
    category: z.string().min(1, "Category cannot be empty"),
    description: z.string().optional(),
    templateParams: z.array(z.string()).optional(),
    namespace: z.string().optional(),
  })
  .strict();

export const TypeMappingConfigSchema = z
  .object({
    mappings: z
      .array(TypeMappingSchema)
      .min(1, "Must have at least one type mapping"),
    templateMappings: z
      .array(
        z.object({
          pattern: z.string(),
          replacement: z.string(),
          description: z.string().optional(),
        })
      )
      .optional(),
    namespaceMappings: z
      .array(
        z.object({
          cppNamespace: z.string(),
          tsNamespace: z.string(),
          stripNamespace: z.boolean().optional(),
        })
      )
      .optional(),
  })
  .strict();

// Custom validation functions
export function validateParseConfig(
  config: unknown
): z.infer<typeof ParseConfigSchema> {
  try {
    return ParseConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid ParseConfig: ${errorMessages}`);
    }
    throw error;
  }
}

export function validatePartialParseConfig(
  config: unknown
): z.infer<typeof PartialParseConfigSchema> {
  try {
    return PartialParseConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid Partial ParseConfig: ${errorMessages}`);
    }
    throw error;
  }
}

export function validateParsedClass(
  classData: unknown
): z.infer<typeof ParsedClassSchema> {
  try {
    return ParsedClassSchema.parse(classData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid ParsedClass: ${errorMessages}`);
    }
    throw error;
  }
}

export function validateTypeMappingConfig(
  config: unknown
): z.infer<typeof TypeMappingConfigSchema> {
  try {
    return TypeMappingConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid TypeMappingConfig: ${errorMessages}`);
    }
    throw error;
  }
}

export function validateParseStats(
  stats: unknown
): z.infer<typeof ParseStatsSchema> {
  try {
    return ParseStatsSchema.parse(stats);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(`Invalid ParseStats: ${errorMessages}`);
    }
    throw error;
  }
}

// Type exports for use in other modules
export type ValidatedParseConfig = z.infer<typeof ParseConfigSchema>;
export type ValidatedTypeMappingConfig = z.infer<
  typeof TypeMappingConfigSchema
>;
