import type { Document, Element } from "deno_dom";
import type { ParsedClass } from "../core/interfaces.ts";
import { TypeRegistry } from "./type-system.ts";
import { defaultTypeMappings } from "./default-type-mappings.ts";
import {
  cleanCppTypeString,
  cleanTypeForLookup,
  extractTypeName,
  normalizeTypeName,
  isObjectLiteral,
} from "./type-utils.ts";

export interface TypeDependency {
  typeName: string;
  namespace?: string;
  fullName: string;
  linkedHref?: string;
  sourceLocation: string;
  usageType:
    | "property"
    | "method_param"
    | "method_return"
    | "signal_param"
    | "inheritance";
}

export interface TypeResolutionContext {
  visitedTypes: Set<string>;
  pendingTypes: Set<string>;
  typeLinks: Map<string, string>; // fullTypeName -> href
  parsedClasses: Map<string, ParsedClass>;
  currentDepth: number;
  maxDepth: number;
}

export class TypeDependencyTracker {
  private readonly context: TypeResolutionContext;
  private readonly typeRegistry: TypeRegistry;

  constructor(maxDepth: number = Infinity) {
    this.context = {
      visitedTypes: new Set(),
      pendingTypes: new Set(),
      typeLinks: new Map(),
      parsedClasses: new Map(),
      currentDepth: 0,
      maxDepth,
    };
    this.typeRegistry = new TypeRegistry(defaultTypeMappings);
  }

  extractTypeDependencies(
    classInfo: ParsedClass,
    sourceDoc: Document,
    sourceLocation: string
  ): TypeDependency[] {
    const dependencies: TypeDependency[] = [];

    this.extractInheritanceDependencies(
      classInfo,
      sourceLocation,
      dependencies
    );
    this.extractPropertyDependencies(classInfo, sourceLocation, dependencies);
    this.extractMethodDependencies(classInfo, sourceLocation, dependencies);
    this.extractSlotDependencies(classInfo, sourceLocation, dependencies);
    this.extractSignalDependencies(classInfo, sourceLocation, dependencies);

    // Enrich dependencies with links from the document
    this.enrichDependenciesWithLinks(dependencies, sourceDoc);

    return dependencies;
  }

  private extractInheritanceDependencies(
    classInfo: ParsedClass,
    sourceLocation: string,
    dependencies: TypeDependency[]
  ): void {
    if (classInfo.inheritance) {
      for (const parent of classInfo.inheritance) {
        dependencies.push({
          typeName: extractTypeName(parent),
          fullName: parent,
          sourceLocation,
          usageType: "inheritance",
        });
      }
    }
  }

  private extractPropertyDependencies(
    classInfo: ParsedClass,
    sourceLocation: string,
    dependencies: TypeDependency[]
  ): void {
    for (const prop of classInfo.properties || []) {
      const typeInfo = this.parseTypeReference(prop.type);
      if (typeInfo) {
        dependencies.push({
          ...typeInfo,
          sourceLocation,
          usageType: "property",
        });
      }
    }
  }

  private extractMethodDependencies(
    classInfo: ParsedClass,
    sourceLocation: string,
    dependencies: TypeDependency[]
  ): void {
    for (const method of classInfo.methods || []) {
      this.extractMethodTypeDependencies(method, sourceLocation, dependencies);
    }
  }

  private extractSlotDependencies(
    classInfo: ParsedClass,
    sourceLocation: string,
    dependencies: TypeDependency[]
  ): void {
    for (const slot of classInfo.slots || []) {
      this.extractMethodTypeDependencies(slot, sourceLocation, dependencies);
    }
  }

  private extractSignalDependencies(
    classInfo: ParsedClass,
    sourceLocation: string,
    dependencies: TypeDependency[]
  ): void {
    for (const signal of classInfo.signals || []) {
      for (const param of signal.parameters || []) {
        const typeInfo = this.parseTypeReference(param.type);
        if (typeInfo) {
          dependencies.push({
            ...typeInfo,
            sourceLocation,
            usageType: "signal_param",
          });
        }
      }
    }
  }

  private extractMethodTypeDependencies(
    method: { returnType?: string; parameters?: { type: string }[] },
    sourceLocation: string,
    dependencies: TypeDependency[]
  ): void {
    // Return type
    if (method.returnType) {
      const typeInfo = this.parseTypeReference(method.returnType);
      if (typeInfo) {
        dependencies.push({
          ...typeInfo,
          sourceLocation,
          usageType: "method_return",
        });
      }
    }

    // Parameters
    for (const param of method.parameters || []) {
      const typeInfo = this.parseTypeReference(param.type);
      if (typeInfo) {
        dependencies.push({
          ...typeInfo,
          sourceLocation,
          usageType: "method_param",
        });
      }
    }
  }

  extractTypeLinksFromDocument(doc: Document): Map<string, string> {
    const links = new Map<string, string>();

    // Find all links to class/interface/struct/namespace definitions
    const typeLinks = doc.querySelectorAll(
      'a.el[href*="class_"], a.el[href*="interface_"], a.el[href*="struct_"], a.el[href*="namespace_"]'
    );

    for (const link of typeLinks) {
      const linkElement = link as Element;
      const href = linkElement.getAttribute("href");
      const text = linkElement.textContent?.trim();

      if (href && text) {
        // Extract the full type name from the text content
        const fullTypeName = normalizeTypeName(text);
        links.set(fullTypeName, href);

        // Also store shortened versions without namespace
        const shortName = extractTypeName(text);
        if (shortName && shortName !== text) {
          links.set(shortName, href);
        }
      }
    }

    return links;
  }

  getUnresolvedDependencies(dependencies: TypeDependency[]): TypeDependency[] {
    return dependencies.filter((dep) => {
      const fullName = dep.fullName;
      return (
        !this.context.parsedClasses.has(fullName) &&
        !this.context.visitedTypes.has(fullName) &&
        !this.isBuiltinType(fullName) &&
        dep.linkedHref
      ); // Only include types that have links to follow
    });
  }

  canResolveType(dependency: TypeDependency): boolean {
    return !!(
      dependency.linkedHref &&
      !this.context.visitedTypes.has(dependency.fullName) &&
      !this.isCircularDependency(dependency.fullName)
    );
  }

  isCircularDependency(typeName: string): boolean {
    return this.context.pendingTypes.has(typeName);
  }

  addParsedClass(className: string, classInfo: ParsedClass): void {
    this.context.parsedClasses.set(className, classInfo);
  }

  getContext(): TypeResolutionContext {
    return { ...this.context };
  }

  private parseTypeReference(typeString: string): TypeDependency | null {
    const cleanType = cleanCppTypeString(typeString);

    // Skip built-in types and object literals
    if (this.isBuiltinType(cleanType) || isObjectLiteral(cleanType)) {
      return null;
    }

    // Remove array notation to get the base type
    const baseType = cleanType.replace(/\[\]$/, "");

    // Skip built-in types for the base type too
    if (this.isBuiltinType(baseType)) {
      return null;
    }

    // Extract namespace and type name
    const parts = baseType.split("::");
    const typeName = parts[parts.length - 1];
    const namespace =
      parts.length > 1 ? parts.slice(0, -1).join("::") : undefined;

    return {
      typeName,
      namespace,
      fullName: baseType, // Use base type without array notation
      sourceLocation: "",
      usageType: "property", // Will be overridden by caller
    };
  }


  private enrichDependenciesWithLinks(
    dependencies: TypeDependency[],
    sourceDoc: Document
  ): void {
    const docLinks = this.extractTypeLinksFromDocument(sourceDoc);

    for (const dep of dependencies) {
      // Try multiple variations to find a link for this type
      const candidates = [
        dep.fullName,
        dep.typeName,
        `KWin::${dep.typeName}`,
        `${dep.namespace}::${dep.typeName}`,
        dep.fullName.replace(/\./g, "::"), // Convert KWin.Window to KWin::Window
        dep.fullName.replace(/KWin\./g, "KWin::"), // Convert KWin.Window to KWin::Window
      ].filter(Boolean);

      let foundLink: string | undefined;

      for (const candidate of candidates) {
        const link = docLinks.get(candidate);
        if (link) {
          foundLink = link;
          break;
        }
      }

      if (foundLink) {
        dep.linkedHref = foundLink;
      }
    }
  }

  private isBuiltinType(typeName: string): boolean {
    const cleanType = cleanTypeForLookup(typeName);
    return this.typeRegistry.hasType(cleanType);
  }
}
