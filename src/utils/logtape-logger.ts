import { getLogger } from "@logtape/logtape";

// Logger categories
export const LOGGER_CATEGORIES = {
  PARSER: "parser",
  TYPE_SYSTEM: "type-system",
  PIPELINE: "pipeline",
  HTML_PARSER: "html-parser",
  TYPE_RESOLVER: "type-resolver",
  CONFIG: "config",
  OUTPUT: "output",
} as const;

type LoggerCategory =
  (typeof LOGGER_CATEGORIES)[keyof typeof LOGGER_CATEGORIES];

// Logger wrapper class
export class Logger {
  private static rootLogger = getLogger();

  static debug(message: string, data?: Record<string, unknown>): void {
    Logger.rootLogger.debug(message, data);
  }

  static info(message: string, data?: Record<string, unknown>): void {
    Logger.rootLogger.info(message, data);
  }

  static warning(message: string, data?: Record<string, unknown>): void {
    Logger.rootLogger.warn(message, data);
  }

  static error(
    message: string,
    error?: unknown,
    data?: Record<string, unknown>
  ): void {
    const logData = { ...data };
    if (error) {
      logData.error =
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : String(error);
    }
    Logger.rootLogger.error(message, logData);
  }

  static fatal(
    message: string,
    error?: unknown,
    data?: Record<string, unknown>
  ): void {
    const logData = { ...data };
    if (error) {
      logData.error =
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : String(error);
    }
    Logger.rootLogger.fatal(message, logData);
  }

  // Convenience methods for common patterns
  static success(message: string, data?: Record<string, unknown>): void {
    Logger.info(`✅ ${message}`, data);
  }

  static progress(message: string, data?: Record<string, unknown>): void {
    Logger.info(`🚀 ${message}`, data);
  }

  static stepStart(step: string, data?: Record<string, unknown>): void {
    Logger.info(`🚀 Starting: ${step}`, data);
  }

  static stepComplete(step: string, data?: Record<string, unknown>): void {
    Logger.info(`✅ Completed: ${step}`, data);
  }

  static performance(
    operation: string,
    duration: number,
    data?: Record<string, unknown>
  ): void {
    Logger.info(`⏱️ ${operation}`, { duration_ms: duration, ...data });
  }

  static statistics(
    title: string,
    stats: Record<string, number | string>
  ): void {
    Logger.info(`📊 ${title}`, stats);
  }

  static configuration(
    component: string,
    config: Record<string, unknown>
  ): void {
    Logger.debug(`⚙️ Configuration for ${component}`, config);
  }

  // Category-specific loggers
  static getLogger(category: LoggerCategory) {
    const categoryLogger = getLogger([category]);

    return {
      debug: (message: string, data?: Record<string, unknown>) =>
        categoryLogger.debug(message, data),
      info: (message: string, data?: Record<string, unknown>) =>
        categoryLogger.info(message, data),
      warn: (message: string, data?: Record<string, unknown>) =>
        categoryLogger.warn(message, data),
      warning: (message: string, data?: Record<string, unknown>) =>
        categoryLogger.warn(message, data),
      error: (
        message: string,
        error?: unknown,
        data?: Record<string, unknown>
      ) => {
        const logData = { ...data };
        if (error) {
          logData.error =
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                }
              : String(error);
        }
        categoryLogger.error(message, logData);
      },
      fatal: (
        message: string,
        error?: unknown,
        data?: Record<string, unknown>
      ) => {
        const logData = { ...data };
        if (error) {
          logData.error =
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                }
              : String(error);
        }
        categoryLogger.fatal(message, logData);
      },
    };
  }

  static getConfig(): Record<string, unknown> {
    // Return basic info about the logging configuration
    return {
      level: Deno.env.get("LOG_LEVEL") || "info",
      debug: !!Deno.env.get("DEBUG"),
      noColor: !!Deno.env.get("NO_COLOR"),
      logFile: Deno.env.get("LOG_FILE"),
    };
  }
}
