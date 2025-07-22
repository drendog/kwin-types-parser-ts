import type { ParseConfig } from "./src/core/interfaces.ts";
import { KWinDoxygenParser } from "./src/parser.ts";
import { TypeMapper } from "./src/type-system/type-mapper.ts";
import { configureLogging } from "./src/config/logtape-config.ts";
import { Logger } from "./src/utils/logtape-logger.ts";

function parseArguments() {
  const args = Deno.args;
  const outputFile = args[0] || "lib/index.d.ts";

  const config: Partial<ParseConfig> = {};
  let typeConfigFile: string | undefined;

  for (const arg of args.slice(1)) {
    if (arg.startsWith("--type-config=")) {
      typeConfigFile = arg.split("=")[1];
    }
  }

  return { outputFile, config, typeConfigFile };
}

async function initializeTypeMapper(typeConfigFile: string | undefined) {
  let customDependencies = {};

  try {
    Logger.stepStart("Initializing enhanced type system");
    Logger.debug("Type configuration", { typeConfigFile });

    const typeMapper = typeConfigFile
      ? await TypeMapper.fromConfig(typeConfigFile)
      : new TypeMapper();

    const stats = typeMapper.getStats();
    Logger.stepComplete("Type system loaded");
    Logger.statistics("Type system stats", {
      registeredTypes: stats.registeredTypes,
      cacheSize: stats.cacheSize,
    });

    customDependencies = { typeMapper };
  } catch (error) {
    Logger.warning(
      "Failed to load enhanced type system, falling back to defaults"
    );
    Logger.debug("Type system error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return customDependencies;
}

function displayTypeInfo(customDependencies: Record<string, unknown>) {
  if (!("typeMapper" in customDependencies)) {
    return;
  }

  const typeMapper = customDependencies.typeMapper as TypeMapper;
  const stats = typeMapper.getStats();

  Logger.info("Enhanced type system features");
  Logger.statistics("Type system stats", {
    registeredTypes: stats.registeredTypes,
    cacheSize: stats.cacheSize,
  });

  // Quick demo of what gets converted
  const examples = ["QString", "QList<QString>", "KWin::Window", "QRect"];
  const conversions: Record<string, { tsType: string; category: string }> = {};

  for (const example of examples) {
    const info = typeMapper.getTypeInfo(example);
    conversions[example] = {
      tsType: info.tsType,
      category: info.category || "unknown",
    };
  }

  Logger.debug("Type conversion examples");
  Logger.debug("Conversions", conversions);
}

async function parseAndSave(
  parser: KWinDoxygenParser,
  sources: string[],
  outputFile: string
) {
  const startTime = Date.now();

  for (const source of sources) {
    Logger.info(`Parsing source: ${source}`);
    if (source.startsWith("http")) {
      await parser.parseFromUrl(source);
    } else {
      await parser.parseFromFile(source);
    }
  }

  await ensureOutputDirectory(outputFile);
  await parser.saveToFile(outputFile);
  const duration = Date.now() - startTime;

  return duration;
}

async function ensureOutputDirectory(outputFile: string) {
  const outputDir = outputFile.split("/").slice(0, -1).join("/");
  if (outputDir) {
    try {
      await Deno.mkdir(outputDir, { recursive: true });
      Logger.debug(`Created output directory: ${outputDir}`);
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        Logger.warning(`Failed to create output directory: ${outputDir}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function displayFinalStats(parser: KWinDoxygenParser, duration: number) {
  Logger.stepComplete("Parsing completed successfully");
  Logger.performance("Total parsing time", duration);

  // Let's see what we accomplished
  const stats = parser.getStats();
  const typeStats = parser.getTypeResolutionStats();

  Logger.statistics("Final statistics", {
    classes: stats.classes,
    methods: stats.methods,
    signals: stats.signals,
    enums: stats.enums,
  });

  Logger.statistics("Type Resolution", {
    resolvedTypes: typeStats.resolvedTypes,
    unresolvedTypes: typeStats.unresolvedTypes,
    maxDepth: `${typeStats.maxDepth} (unlimited)`,
  });
}

async function main() {
  await configureLogging();

  const sources = [
    "html/class_k_win_1_1_workspace_wrapper.html",
    "html/class_k_win_1_1_options.html",
  ];

  const { outputFile, config, typeConfigFile } = parseArguments();

  Logger.stepStart("Enhanced KWin Doxygen parser");
  Logger.info("Configuration", { sources, outputFile });

  const customDependencies = await initializeTypeMapper(typeConfigFile);

  const parser = KWinDoxygenParser.create("", {
    config,
    customDependencies,
  });
  parser.logConfig();

  displayTypeInfo(customDependencies);

  try {
    Logger.info("Using unlimited deep type resolution");

    const duration = await parseAndSave(parser, sources, outputFile);

    displayFinalStats(parser, duration);
  } catch (error) {
    Logger.error("Parsing failed", error);
    Logger.debug("Parsing context", {
      sources,
      outputFile,
      config,
      typeConfigFile,
    });
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
