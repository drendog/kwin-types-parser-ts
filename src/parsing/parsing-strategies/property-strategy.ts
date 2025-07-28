import type { Document, Element } from "deno_dom";
import { flatMap } from "lodash";
import type {
  ParseConfig,
  ParsedProperty,
  ITypeMapper,
  IConfigurationManager,
} from "../../core/interfaces.ts";
import type { ParseStrategy } from "./base-strategy.ts";
import { DOMUtils } from "../../utils/dom-utils.ts";

export class PropertyParseStrategy implements ParseStrategy<ParsedProperty> {
  constructor(
    private readonly typeMapper: ITypeMapper,
    private readonly configManager: IConfigurationManager
  ) {}

  parse(doc: Document, _config: ParseConfig): ParsedProperty[] {
    const table = DOMUtils.findSectionTable(doc, "properties");
    if (!table) return [];

    const rows = DOMUtils.findMethodRowsInSection(table, "properties");

    return flatMap(rows, (row: Element) => {
      const property = this.parsePropertyRow(row, doc);
      return property ? [property] : [];
    });
  }

  private parsePropertyRow(row: Element, doc: Document): ParsedProperty | null {
    const typeCell = row.querySelector(".memItemLeft");
    const nameCell = row.querySelector(".memItemRight");

    if (!typeCell || !nameCell) return null;

    const typeInfo = this.extractTypeInfo(typeCell);
    const nameInfo = this.extractNameInfo(nameCell);

    if (!typeInfo.type || !nameInfo.name) return null;

    const href = nameInfo.href;
    const targetId = href && href.startsWith("#") ? href.substring(1) : null;

    const description = this.getPropertyDescription(doc, targetId);
    const readonly = this.isPropertyReadonly(doc, targetId);

    const propertyFlags = {
      readonly,
      static: typeInfo.isStatic,
    };

    return {
      name: nameInfo.name,
      type: this.typeMapper.mapCppTypeToTs(
        typeInfo.type.replace(/static|Q_PROPERTY/g, "").trim()
      ),
      readonly: propertyFlags.readonly,
      static: propertyFlags.static,
      description: this.configManager.getConfig().generateComments
        ? description
        : undefined,
    };
  }

  private extractTypeInfo(typeCell: Element): {
    type: string;
    isStatic: boolean;
  } {
    let type = typeCell.textContent?.trim() || "";
    const typeLink = typeCell.querySelector("a.el[href]");

    if (typeLink) {
      type = this.resolveTypeNamespace(typeCell, typeLink, type);
    }

    return {
      type,
      isStatic: type.includes("static"),
    };
  }

  private resolveTypeNamespace(
    typeCell: Element,
    typeLink: Element,
    defaultType: string
  ): string {
    const href = typeLink.getAttribute("href");
    const linkText = typeLink.textContent?.trim();

    if (!href || !linkText || !href.startsWith("#")) {
      return defaultType;
    }

    const targetId = href.substring(1);
    const targetSection = typeCell.ownerDocument?.querySelector(
      `[id="${targetId}"]`
    );

    if (!targetSection) {
      return defaultType;
    }

    return this.extractNamespaceFromTarget(targetSection) || defaultType;
  }

  private extractNamespaceFromTarget(targetSection: Element): string | null {
    const memnameCell =
      targetSection.parentElement?.querySelector("td.memname");

    if (!memnameCell) {
      return null;
    }

    const memnameLink = memnameCell.querySelector("a.el");
    if (memnameLink) {
      const fullNamespace = memnameLink.textContent?.trim();
      if (fullNamespace && fullNamespace.includes("::")) {
        return fullNamespace.replace(/::/g, ".");
      }
    } else {
      const memnameText = memnameCell.textContent?.trim();
      if (memnameText && memnameText.includes("::")) {
        const enumMatch = memnameText.match(/enum\s+(.*)/);
        if (enumMatch) {
          const fullNamespace = enumMatch[1].trim();
          return fullNamespace.replace(/::/g, ".");
        }
      }
    }

    return null;
  }

  private extractNameInfo(nameCell: Element): {
    name: string;
    href: string | null;
  } {
    const nameText = nameCell.textContent?.trim() || "";
    const nameLink = nameCell.querySelector("a");
    const name = nameLink ? nameLink.textContent?.trim() || nameText : nameText;
    const href = nameLink?.getAttribute("href") || null;

    return { name, href };
  }

  private getPropertyDescription(
    doc: Document,
    targetId: string | null
  ): string | undefined {
    if (!targetId) return undefined;

    const docs = DOMUtils.getDetailedDocumentation(doc, targetId);
    return docs?.main;
  }

  private isPropertyReadonly(doc: Document, targetId: string | null): boolean {
    if (!targetId) return false;

    const propertyDoc = doc.querySelector(`[id="${targetId}"]`);
    if (!propertyDoc) return false;

    let nextSibling = propertyDoc.nextElementSibling;
    while (nextSibling && !nextSibling.classList.contains("memitem")) {
      nextSibling = nextSibling.nextElementSibling;
    }

    if (!nextSibling || !nextSibling.classList.contains("memitem")) {
      return false;
    }

    const mlabelsRight = nextSibling.querySelector(".mlabels-right");
    if (!mlabelsRight) return false;

    const hasReadLabel = mlabelsRight.querySelector(".mlabel.read") !== null;
    const hasWriteLabel = mlabelsRight.querySelector(".mlabel.write") !== null;

    return hasReadLabel && !hasWriteLabel;
  }
}
