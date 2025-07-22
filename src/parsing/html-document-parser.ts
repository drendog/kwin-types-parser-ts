import type { Document } from "deno_dom";
import type {
  ParsedClass,
  ParsedEnum,
  IHTMLDocumentParser,
  ITypeMapper,
  IConfigurationManager,
  IParsingOrchestrator,
} from "../core/interfaces.ts";
import type { EnumParseStrategy } from "./parsing-strategies/index.ts";
import { Logger } from "../utils/logtape-logger.ts";

export class HTMLDocumentParser implements IHTMLDocumentParser {
  private readonly typeMapper: ITypeMapper;
  private readonly configManager: IConfigurationManager;
  private readonly parsingOrchestrator: IParsingOrchestrator;

  constructor(
    typeMapper: ITypeMapper,
    configManager: IConfigurationManager,
    parsingOrchestrator: IParsingOrchestrator
  ) {
    this.typeMapper = typeMapper;
    this.configManager = configManager;
    this.parsingOrchestrator = parsingOrchestrator;
  }

  parseDocument(doc: Document, source: string): ParsedClass | null {
    const classInfo = this.parseClassHeader(doc);
    if (!classInfo) {
      Logger.debug(`No class found in document`, { source });
      return null;
    }

    Logger.info(`Parsing class: ${classInfo.fullName}`, {
      className: classInfo.name,
      namespace: classInfo.namespace,
      source,
    });

    classInfo.description = this.parseDescription(doc);

    // Delegate the heavy lifting to orchestrator
    this.parsingOrchestrator.parseClassContent(
      doc,
      classInfo,
      this.configManager.getConfig()
    );

    return classInfo;
  }
  // Parse namespace docs - mainly for enums
  parseNamespaceDocument(doc: Document): {
    name: string;
    fullName: string;
    enums: ParsedEnum[];
  } | null {
    const titleElement = doc.querySelector("h1.title, .title");
    if (!titleElement) return null;

    const fullName = titleElement.textContent?.trim() || "";

    // Doxygen format: "SomeNamespace Namespace Reference"
    const namespaceMatch = fullName.match(/^(.+?)\s+Namespace\s+Reference/);
    if (!namespaceMatch) return null;

    const namespaceName = namespaceMatch[1];
    const name = namespaceName.split("::").pop() || namespaceName;

    // Use enum strategy to parse all enums in namespace
    const enumStrategy = this.parsingOrchestrator.getStrategy(
      "enums"
    ) as EnumParseStrategy;
    const enums = enumStrategy
      ? enumStrategy.parse(doc, this.configManager.getConfig())
      : [];

    Logger.info(`Parsed namespace: ${namespaceName}`, {
      namespaceName,
      enumCount: enums.length,
      enums: enums.map((e) => ({ name: e.name, valueCount: e.values.length })),
    });

    return {
      name,
      fullName: namespaceName,
      enums,
    };
  }

  // Extract class info from Doxygen title
  private parseClassHeader(doc: Document): ParsedClass | null {
    const titleElement = doc.querySelector(".title");
    if (!titleElement) return null;

    let fullName = titleElement.textContent?.trim() || "";

    // Clean up Doxygen's inconsistent title formatting
    fullName = fullName
      .replace(/\s*abstract\s*$/i, "")
      .replace(/\s*final\s*$/i, "")
      .trim();

    // Match both "Class Reference" and "Namespace Reference" formats
    const classMatch = fullName.match(
      /^(.+?)::(.+?)\s+(?:Class|Interface|Struct)\s+Reference/
    );
    const namespaceMatch = fullName.match(/^(.+?)\s+Namespace\s+Reference/);

    if (!classMatch && !namespaceMatch) return null;

    let namespace = "";
    let className = "";

    if (classMatch) {
      [, namespace, className] = classMatch;
    } else if (namespaceMatch) {
      namespace = namespaceMatch[1];
      className = namespace.split("::").pop() || namespace;
    }

    // Inheritance parsing is messy - check multiple locations
    const inheritance = this.parseInheritance(doc);
    const isAbstract = this.checkIfAbstract(doc);

    return {
      name: className,
      namespace,
      fullName: classMatch
        ? fullName.replace(" Class Reference", "")
        : namespace,
      inheritance: inheritance.length > 0 ? inheritance : undefined,
      isAbstract,
      enums: [],
      methods: [],
      signals: [],
      properties: [],
      slots: [],
    };
  }

  // Hunt for inheritance info - Doxygen puts it in random places
  private parseInheritance(doc: Document): string[] {
    const inheritance: string[] = [];

    const inheritHeaders = doc.querySelectorAll(".inherit_header");
    inheritHeaders.forEach((header) => {
      const headerText = header.textContent || "";
      const inheritMatch = headerText.match(
        /Public Member Functions inherited from (.+)/
      );
      if (inheritMatch) {
        const parentClass = inheritMatch[1].trim();
        const link = header.querySelector("a");
        if (link) {
          const parentName = link.textContent?.trim();
          if (parentName) {
            inheritance.push(this.typeMapper.mapCppTypeToTs(parentName));
          }
        } else {
          inheritance.push(this.typeMapper.mapCppTypeToTs(parentClass));
        }
      }
    });

    // Last resort: check description text for inheritance
    const inheritanceText = doc.querySelector(".textblock")?.textContent;
    if (inheritanceText && inheritance.length === 0) {
      const inheritMatch = inheritanceText.match(/Inherits (.+?)\./);
      if (inheritMatch) {
        const parents = inheritMatch[1].split(",").map((p) => p.trim());
        inheritance.push(
          ...parents.map((p) => this.typeMapper.mapCppTypeToTs(p))
        );
      }
    }

    return inheritance;
  }

  // Check if class is abstract from description
  private checkIfAbstract(doc: Document): boolean {
    const description = doc.querySelector(".textblock")?.textContent || "";
    return (
      description.toLowerCase().includes("abstract") ||
      description.toLowerCase().includes("pure virtual")
    );
  }

  // Get class description from first text block
  private parseDescription(doc: Document): string {
    const descElement = doc.querySelector(".textblock");
    return descElement?.textContent?.trim() || "";
  }
}
