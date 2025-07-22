
import { groupBy, filter, sumBy, uniqBy, keyBy } from "lodash";
import type { ParsingRepository } from "./pipeline.ts";
import type { ParsedClass, ParsedEnum, ParseStats } from "./interfaces.ts";
import { Logger } from "../utils/logtape-logger.ts";

export class InMemoryParsingRepository implements ParsingRepository {
  private readonly classes = new Map<string, ParsedClass>();
  private readonly globalEnums = new Map<string, ParsedEnum>();
  private readonly visitedUrls = new Set<string>();
  private readonly discoveredNamespaceFiles = new Set<string>();
  private duplicatesRemoved = 0;

  addClass(className: string, classInfo: ParsedClass): void {
    if (this.classes.has(className)) {
      this.duplicatesRemoved++;
      Logger.debug(`Duplicate class detected: ${className}`, { className });

      // Preserve enums from duplicates
      const existing = this.classes.get(className)!;
      this.consolidateEnums(existing, classInfo.enums);
      return;
    }

    this.classes.set(className, classInfo);
    this.consolidateEnums(classInfo);
  }

  getClass(className: string): ParsedClass | undefined {
    return this.classes.get(className);
  }

  getAllClasses(): Map<string, ParsedClass> {
    return new Map(this.classes);
  }

  getClassesByNamespace(namespace: string): ParsedClass[] {
    return filter(Array.from(this.classes.values()), { namespace });
  }

  addGlobalEnum(_enumName: string, enumInfo: ParsedEnum): void {
    // Use enum name as key for deduplication
    const enumKey = enumInfo.name;

    const existingEnum = this.globalEnums.get(enumKey);
    if (existingEnum) {
      const existingValues = keyBy(existingEnum.values, "name");
      const newValues = keyBy(enumInfo.values, "name");

      if (JSON.stringify(existingValues) !== JSON.stringify(newValues)) {
        Logger.warning(
          `Enum ${enumInfo.name} has different values, keeping existing`,
          { enumName: enumInfo.name }
        );
      } else {
        Logger.debug(`Skipping duplicate enum: ${enumInfo.name}`, {
          enumName: enumInfo.name,
        });
      }
      return;
    }

    this.globalEnums.set(enumKey, enumInfo);
  }

  getGlobalEnums(): Map<string, ParsedEnum> {
    return new Map(this.globalEnums);
  }

  markUrlVisited(url: string): void {
    this.visitedUrls.add(url);
  }

  isUrlVisited(url: string): boolean {
    return this.visitedUrls.has(url);
  }

  // Remove duplicate enums within a class
  private consolidateEnums(
    classInfo: ParsedClass,
    additionalEnums?: ParsedEnum[]
  ): void {
    const allEnums = additionalEnums
      ? [...classInfo.enums, ...additionalEnums]
      : classInfo.enums;

    const uniqueEnums = uniqBy(
      allEnums,
      (enumItem) =>
        `${enumItem.name}:${enumItem.values.map((v) => v.name).join("|")}`
    );

    classInfo.enums = uniqueEnums;
  }

  // Calculate parsing statistics
  getStats(): ParseStats & { duplicatesRemoved: number } {
    const classes = Array.from(this.classes.values());

    return {
      classes: this.classes.size,
      urls: this.visitedUrls.size,
      enums: sumBy(classes, (cls) => cls.enums.length),
      methods: sumBy(classes, (cls) => cls.methods.length + cls.slots.length),
      signals: sumBy(classes, (cls) => cls.signals.length),
      duplicatesRemoved: this.duplicatesRemoved,
    };
  }

  getClassesByNamespaceGrouped(): Record<string, ParsedClass[]> {
    const classes = Array.from(this.classes.values());
    return groupBy(classes, "namespace");
  }

  getMethodStatsByVisibility(): Record<string, number> {
    const classes = Array.from(this.classes.values());
    const allMethods = classes.flatMap((cls) => [...cls.methods, ...cls.slots]);
    const groupedMethods = groupBy(allMethods, "visibility");

    return Object.fromEntries(
      Object.entries(groupedMethods).map(([visibility, methods]) => [
        visibility,
        methods.length,
      ])
    );
  }

  getClassesInheritingFrom(baseClass: string): ParsedClass[] {
    return filter(
      Array.from(this.classes.values()),
      (cls) => cls.inheritance?.includes(baseClass) || false
    );
  }

  clear(): void {
    this.classes.clear();
    this.globalEnums.clear();
    this.visitedUrls.clear();
    this.duplicatesRemoved = 0;
  }

  exportData(): {
    classes: ParsedClass[];
    globalEnums: ParsedEnum[];
    visitedUrls: string[];
    namespaceFiles: string[];
    stats: ParseStats & { duplicatesRemoved: number };
  } {
    return {
      classes: Array.from(this.classes.values()),
      globalEnums: Array.from(this.globalEnums.values()),
      visitedUrls: Array.from(this.visitedUrls),
      namespaceFiles: Array.from(this.discoveredNamespaceFiles),
      stats: this.getStats(),
    };
  }

  // Track discovered namespace files
  addNamespaceFile(filePath: string): void {
    this.discoveredNamespaceFiles.add(filePath);
  }

  getNamespaceFiles(): Set<string> {
    return new Set(this.discoveredNamespaceFiles);
  }

  hasNamespaceFile(filePath: string): boolean {
    return this.discoveredNamespaceFiles.has(filePath);
  }
}
