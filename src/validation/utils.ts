
import {
  validateParseConfig,
  validatePartialParseConfig,
  validateParsedClass,
  validateTypeMappingConfig,
  validateParseStats,
  ParsedMethodSchema,
  ParsedPropertySchema,
  ParsedEnumSchema,
  type ValidatedTypeMappingConfig,
} from "./schemas.ts";
import type {
  ParsedClass,
  ParsedMethod,
  ParsedProperty,
  ParsedEnum,
  ParseConfig,
  ParseStats,
} from "../core/interfaces.ts";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
  warnings: string[];
}

export class ConfigValidator {
  static validate(config: unknown): ValidationResult<ParseConfig> {
    try {
      const validatedConfig = validateParseConfig(config);
      return {
        success: true,
        data: validatedConfig,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }

  static validatePartial(
    config: unknown
  ): ValidationResult<Partial<ParseConfig>> {
    try {
      const validatedConfig = validatePartialParseConfig(config);
      return {
        success: true,
        data: validatedConfig,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }

  static getSuggestions(errors: string[]): string[] {
    const suggestions: string[] = [];

    for (const error of errors) {
      if (error.includes("outputFormat")) {
        suggestions.push(
          "Set outputFormat to either 'typescript' or 'interface-only'"
        );
      }
      if (error.includes("includePrivate")) {
        suggestions.push(
          "Set includePrivate to true or false (controls private member inclusion)"
        );
      }
      if (error.includes("generateComments")) {
        suggestions.push(
          "Set generateComments to true or false (controls comment generation)"
        );
      }
    }

    return suggestions;
  }
}

export class ClassValidator {
  static validate(classData: unknown): ValidationResult<ParsedClass> {
    try {
      const validatedClass = validateParsedClass(classData);
      const warnings: string[] = [];

      // Add helpful warnings for common issues
      if (
        validatedClass.methods.length === 0 &&
        validatedClass.properties.length === 0
      ) {
        warnings.push(
          "Class has no methods or properties - this might indicate parsing issues"
        );
      }

      if (
        validatedClass.namespace === "" &&
        !validatedClass.name.includes("::")
      ) {
        warnings.push(
          "Class has no namespace - consider checking if it should be in a namespace"
        );
      }

      return {
        success: true,
        data: validatedClass,
        errors: [],
        warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }

  static validateMethod(methodData: unknown): ValidationResult<ParsedMethod> {
    try {
      const validatedMethod = ParsedMethodSchema.parse(methodData);
      return {
        success: true,
        data: validatedMethod,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }

  static validateProperty(
    propertyData: unknown
  ): ValidationResult<ParsedProperty> {
    try {
      const validatedProperty = ParsedPropertySchema.parse(propertyData);
      return {
        success: true,
        data: validatedProperty,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }

  static validateEnum(enumData: unknown): ValidationResult<ParsedEnum> {
    try {
      const validatedEnum = ParsedEnumSchema.parse(enumData);
      return {
        success: true,
        data: validatedEnum,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }
}

export class TypeMappingValidator {
  static validate(
    config: unknown
  ): ValidationResult<ValidatedTypeMappingConfig> {
    try {
      const validatedConfig = validateTypeMappingConfig(config);
      const warnings: string[] = [];

      // Check for common type mapping issues
      const mappings = validatedConfig.mappings;
      const duplicateNames = mappings
        .map((m) => m.name)
        .filter((name, index, arr) => arr.indexOf(name) !== index);

      if (duplicateNames.length > 0) {
        warnings.push(
          `Duplicate type mappings found: ${duplicateNames.join(", ")}`
        );
      }

      return {
        success: true,
        data: validatedConfig,
        errors: [],
        warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }
}

export class StatsValidator {
  static validate(stats: unknown): ValidationResult<ParseStats> {
    try {
      const validatedStats = validateParseStats(stats);
      const warnings: string[] = [];

      // Add warnings for suspicious statistics
      if (validatedStats.classes === 0) {
        warnings.push("No classes were parsed - check input sources");
      }

      if (validatedStats.methods === 0 && validatedStats.classes > 0) {
        warnings.push(
          "Classes found but no methods - might indicate parsing issues"
        );
      }

      return {
        success: true,
        data: validatedStats,
        errors: [],
        warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }
}

export class ParsingResultValidator {
  static validateParsingSession(data: {
    config: unknown;
    classes: unknown[];
    stats: unknown;
  }): ValidationResult<{
    config: ParseConfig;
    classes: ParsedClass[];
    stats: ParseStats;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate configuration
    const configResult = ConfigValidator.validate(data.config);
    if (!configResult.success) {
      errors.push(...configResult.errors.map((e) => `Config: ${e}`));
      return { success: false, errors, warnings };
    }

    // Validate classes
    const validatedClasses: ParsedClass[] = [];
    for (let i = 0; i < data.classes.length; i++) {
      const classResult = ClassValidator.validate(data.classes[i]);
      if (!classResult.success) {
        errors.push(...classResult.errors.map((e) => `Class ${i}: ${e}`));
      } else {
        validatedClasses.push(classResult.data!);
        warnings.push(...classResult.warnings.map((w) => `Class ${i}: ${w}`));
      }
    }

    // Validate statistics
    const statsResult = StatsValidator.validate(data.stats);
    if (!statsResult.success) {
      errors.push(...statsResult.errors.map((e) => `Stats: ${e}`));
      return { success: false, errors, warnings };
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings };
    }

    return {
      success: true,
      data: {
        config: configResult.data!,
        classes: validatedClasses,
        stats: statsResult.data!,
      },
      errors: [],
      warnings: [...warnings, ...statsResult.warnings],
    };
  }
}

export function createValidatedParseConfig(
  config: Partial<ParseConfig>
): ParseConfig {
  const result = ConfigValidator.validate({
    includePrivate: false,
    generateComments: true,
    outputFormat: "typescript",
    ...config,
  });

  if (!result.success) {
    const suggestions = ConfigValidator.getSuggestions(result.errors);
    throw new Error(
      `Invalid configuration:\n${result.errors.join(
        "\n"
      )}\n\nSuggestions:\n${suggestions.join("\n")}`
    );
  }

  return result.data!;
}
