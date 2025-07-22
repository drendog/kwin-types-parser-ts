import type { Document, Element } from "deno_dom";
import { flatMap } from "lodash";
import type {
  ParseConfig,
  ParsedMethod,
  ParsedParameter,
  Visibility,
  ITypeMapper,
  IConfigurationManager,
} from "../../core/interfaces.ts";
import { type ParseStrategy, DOMUtils } from "./base-strategy.ts";

export class MethodParseStrategy implements ParseStrategy<ParsedMethod> {
  constructor(
    private readonly typeMapper: ITypeMapper,
    private readonly configManager: IConfigurationManager
  ) {}

  parse(
    doc: Document,
    _config: ParseConfig,
    sectionId: string,
    visibility: Visibility
  ): ParsedMethod[] {
    const table = DOMUtils.findSectionTable(doc, sectionId);
    if (!table) return [];

    const rows = DOMUtils.findMethodRowsInSection(table, sectionId);

    return flatMap(rows, (row: Element) => {
      const method = this.parseMethodRow(row, doc, visibility);
      return method ? [method] : [];
    });
  }

  private parseMethodRow(
    row: Element,
    doc: Document,
    visibility: Visibility
  ): ParsedMethod | null {
    const leftCell = row.querySelector(".memItemLeft");
    const rightCell = row.querySelector(".memItemRight");

    if (!leftCell || !rightCell) return null;

    const leftText = leftCell.textContent?.trim() || "";
    const rightText = rightCell.textContent?.trim() || "";

    const decorators: string[] = [];
    const qtDecorators = ["Q_INVOKABLE", "Q_SCRIPTABLE"];
    qtDecorators.forEach((decorator) => {
      if (leftText.includes(decorator)) decorators.push(decorator);
    });

    const modifierChecks = {
      isStatic: leftText.includes("static"),
      isVirtual: leftText.includes("virtual"),
      isConst: rightText.includes(") const"),
    };

    let returnType = leftText
      .replace(/Q_INVOKABLE|Q_SCRIPTABLE|static|virtual/g, "")
      .replace(/\s+/g, " ")
      .trim();
    returnType = returnType.replace(/\s*\*\s*$/, "");

    const methodMatch = rightText.match(/^(\w+)\s*\(([^)]*)\)(.*)$/);
    if (!methodMatch) return null;

    const [, methodName, paramStr, modifiers] = methodMatch;
    const parameters = this.parseParametersFromHTML(rightCell, paramStr);

    let description: string | undefined;
    const methodLink = rightCell.querySelector("a.el");
    const href = methodLink?.getAttribute("href");

    if (href && href.startsWith("#")) {
      const targetId = href.substring(1);
      const docs = DOMUtils.getDetailedDocumentation(doc, targetId);

      if (docs) {
        description = docs.main;
        // Add parameter docs if we found any
        parameters.forEach((param) => {
          if (docs.params.has(param.name)) {
            param.description = docs.params.get(param.name);
          }
        });
      }
    }

    return {
      name: methodName,
      returnType: this.typeMapper.mapCppTypeToTs(returnType || "void"),
      parameters,
      ...modifierChecks,
      isOverride: modifiers.includes("override"),
      isAbstract: modifiers.includes("= 0"),
      visibility,
      decorators: decorators.length > 0 ? decorators : undefined,
      description: this.configManager.getConfig().generateComments
        ? description
        : undefined,
    };
  }

  private parseParameters(paramStr: string): ParsedParameter[] {
    if (!paramStr.trim()) return [];

    const paramParts = DOMUtils.splitParameters(paramStr);

    return flatMap(paramParts, (param: string) => {
      const defaultRegex = /^(.+?)\s*=\s*(.+)$/;
      const defaultMatch = defaultRegex.exec(param);
      let paramType = "";
      let paramName = "";
      let defaultValue: string | undefined;

      if (defaultMatch) {
        const [, paramPart, defaultVal] = defaultMatch;
        defaultValue = defaultVal.trim();
        const parsed = DOMUtils.parseParameterType(paramPart.trim());
        paramType = parsed.type;
        paramName = parsed.name;
      } else {
        const parsed = DOMUtils.parseParameterType(param);
        paramType = parsed.type;
        paramName = parsed.name;
      }

      if (paramType && paramName) {
        return [
          {
            name: paramName,
            type: this.typeMapper.mapCppTypeToTs(paramType),
            defaultValue,
            isOptional: !!defaultValue,
          },
        ];
      }
      return [];
    });
  }

  private parseParametersFromHTML(
    rightCell: Element,
    paramStr: string
  ): ParsedParameter[] {
    if (!paramStr.trim()) return [];

    // Extract full namespaces from links - Doxygen loves to abbreviate
    const paramLinks = rightCell.querySelectorAll("a.el[href]");
    const typeMap = new Map<string, string>();
    for (const link of paramLinks) {
      const linkElement = link as Element;
      const href = linkElement.getAttribute("href");
      const linkText = linkElement.textContent?.trim();

      if (href && linkText && href.startsWith("#")) {
        const targetId = href.substring(1);
        const targetSection = rightCell.ownerDocument?.querySelector(
          `[id="${targetId}"]`
        );

        if (targetSection) {
          const namespaceLink =
            targetSection.parentElement?.querySelector("td.memname a.el");
          if (namespaceLink) {
            const fullNamespace = namespaceLink.textContent?.trim();
            if (fullNamespace && fullNamespace.includes("::")) {
              typeMap.set(linkText, fullNamespace);
            }
          }
        }
      }
    }

    const paramParts = DOMUtils.splitParameters(paramStr);

    return flatMap(paramParts, (param: string) => {
      const defaultRegex = /^(.+?)\s*=\s*(.+)$/;
      const defaultMatch = defaultRegex.exec(param);
      let paramType = "";
      let paramName = "";
      let defaultValue: string | undefined;

      if (defaultMatch) {
        const [, paramPart, defaultVal] = defaultMatch;
        defaultValue = defaultVal.trim();
        const parsed = DOMUtils.parseParameterType(paramPart.trim());
        paramType = parsed.type;
        paramName = parsed.name;
      } else {
        const parsed = DOMUtils.parseParameterType(param);
        paramType = parsed.type;
        paramName = parsed.name;
      }

      // Swap in full namespace if we have it
      const fullNamespace = typeMap.get(paramType);
      if (fullNamespace) {
        paramType = fullNamespace.replace(/::/g, ".");
      }

      if (paramType && paramName) {
        return [
          {
            name: paramName,
            type: this.typeMapper.mapCppTypeToTs(paramType),
            defaultValue,
            isOptional: !!defaultValue,
          },
        ];
      }
      return [];
    });
  }
}