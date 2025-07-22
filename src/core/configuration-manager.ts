import type { ParseConfig, IConfigurationManager } from "./interfaces.ts";
import {
  validateParseConfig,
  validatePartialParseConfig,
  type ValidatedParseConfig,
} from "../validation/schemas.ts";
import { formatError } from "../utils/index.ts";
import { Logger } from "../utils/logtape-logger.ts";

export class ConfigurationManager implements IConfigurationManager {
  private readonly defaultConfig: ParseConfig = {
    includePrivate: false,
    generateComments: true,
    outputFormat: "typescript",
  };

  private config: ValidatedParseConfig;

  constructor(config: Partial<ParseConfig> = {}) {
    this.config = this.validateConfig(config);
  }

  getConfig(): ParseConfig {
    return { ...this.config };
  }

  validateConfig(config: Partial<ParseConfig>): ValidatedParseConfig {
    try {
      const mergedConfig = { ...this.defaultConfig, ...config };
      const validatedConfig = validateParseConfig(mergedConfig);
      Logger.success("Configuration validation successful");
      return validatedConfig;
    } catch (error) {
      const errorMessage = formatError(error);
      Logger.error("Configuration validation failed", error);

      // Help with common outputFormat mistakes
      if (errorMessage.includes("outputFormat")) {
        Logger.warning(
          "outputFormat must be either 'typescript' or 'interface-only'"
        );
      }
      // Attempt fallback validation
      try {
        const partialValidated = validatePartialParseConfig(config);
        const fallbackConfig = { ...this.defaultConfig, ...partialValidated };
        Logger.warning(
          "Using fallback configuration with validated partial inputs"
        );
        return validateParseConfig(fallbackConfig);
      } catch (_fallbackError) {
        Logger.error("Fallback validation also failed, using defaults");
        return validateParseConfig(this.defaultConfig);
      }
    }
  }

  updateConfig(updates: Partial<ParseConfig>): void {
    try {
      // Validate updates before applying
      const partialValidated = validatePartialParseConfig(updates);
      this.config = this.validateConfig({
        ...this.config,
        ...partialValidated,
      });
      Logger.info("Configuration updated successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      Logger.error("Failed to update configuration", new Error(errorMessage));
      throw error;
    }
  }

  // Log current config state
  logConfig(): void {
    Logger.configuration("ConfigurationManager", this.config);
  }

  // Get validation errors without throwing
  getValidationErrors(config: Partial<ParseConfig>): string[] {
    try {
      validatePartialParseConfig(config);
      return [];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Invalid Partial ParseConfig:")) {
        return errorMessage
          .replace("Invalid Partial ParseConfig: ", "")
          .split(", ");
      }
      return [errorMessage];
    }
  }

  isValidConfig(config: Partial<ParseConfig>): boolean {
    try {
      const mergedConfig = { ...this.defaultConfig, ...config };
      validateParseConfig(mergedConfig);
      return true;
    } catch {
      return false;
    }
  }
}
