import { configure, getConsoleSink, getStreamSink } from "@logtape/logtape";

type LogLevel = "trace" | "debug" | "info" | "warning" | "error" | "fatal";

// Map env log levels to what LogTape expects (handles both 'warn' and 'warning')
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  warning: "warning",
  error: "error",
  fatal: "fatal",
};

// Figure out log level from env, fallback to info. If DEBUG is set, force debug.
function getLogLevel(): LogLevel {
  const envLevel = Deno.env.get("LOG_LEVEL")?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_MAP) {
    return LOG_LEVEL_MAP[envLevel];
  }
  if (Deno.env.get("DEBUG")) {
    return "debug";
  }
  return "info";
}

// Sets up LogTape sinks and loggers. Console always on; file logging if LOG_FILE is set.
export async function configureLogging(): Promise<void> {
  const level = getLogLevel();
  const sinks: Record<string, ReturnType<typeof getConsoleSink | typeof getStreamSink>> = {};
  const sinkNames: string[] = [];

  sinks.console = getConsoleSink();
  sinkNames.push("console");

  // If LOG_FILE is set, also log to file (append mode)
  const logFile = Deno.env.get("LOG_FILE");
  if (logFile) {
    const file = await Deno.open(logFile, {
      create: true,
      write: true,
      append: true,
    });
    sinks.file = getStreamSink(file.writable);
    sinkNames.push("file");
  }

  await configure({
    sinks,
    loggers: [
      // Root logger: catches everything
      { category: [], lowestLevel: level, sinks: sinkNames },

      // LogTape's own logs - keep at warning+ to avoid noise
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: sinkNames,
      },

      // Per-category loggers (tweak these if you want more/less noise per area)
      { category: ["parser"], lowestLevel: level, sinks: sinkNames },
      { category: ["type-system"], lowestLevel: level, sinks: sinkNames },
      { category: ["pipeline"], lowestLevel: level, sinks: sinkNames },
      { category: ["html-parser"], lowestLevel: level, sinks: sinkNames },
      { category: ["type-resolver"], lowestLevel: level, sinks: sinkNames },
      { category: ["config"], lowestLevel: level, sinks: sinkNames },
      { category: ["output"], lowestLevel: level, sinks: sinkNames },
    ],
  });
}
