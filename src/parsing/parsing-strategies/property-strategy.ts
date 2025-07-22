import type { Document, Element } from "deno_dom";
import { flatMap } from "lodash";
import type {
  ParseConfig,
  ParsedProperty,
  ITypeMapper,
  IConfigurationManager,
} from "../../core/interfaces.ts";
import { type ParseStrategy, DOMUtils } from "./base-strategy.ts";

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

    // Extract type with proper namespace resolution from HTML links
    let type = typeCell.textContent?.trim() || "";
    const typeLink = typeCell.querySelector("a.el[href]");
    if (typeLink) {
      const href = typeLink.getAttribute("href");
      const linkText = typeLink.textContent?.trim();

      if (href && linkText && href.startsWith("#")) {
        const targetId = href.substring(1);
        const targetSection = typeCell.ownerDocument?.querySelector(
          `[id="${targetId}"]`
        );

        if (targetSection) {
          const memnameCell =
            targetSection.parentElement?.querySelector("td.memname");
          if (memnameCell) {
            const memnameLink = memnameCell.querySelector("a.el");
            if (memnameLink) {
              const fullNamespace = memnameLink.textContent?.trim();
              if (fullNamespace && fullNamespace.includes("::")) {
                type = fullNamespace.replace(/::/g, ".");
              }
            } else {
              // Fallback - extract from enum definition text
              const memnameText = memnameCell.textContent?.trim();
              if (memnameText && memnameText.includes("::")) {
                const enumMatch = memnameText.match(/enum\s+(.*)/);
                if (enumMatch) {
                  const fullNamespace = enumMatch[1].trim();
                  type = fullNamespace.replace(/::/g, ".");
                }
              }
            }
          }
        }
      }
    }

    const nameText = nameCell.textContent?.trim() || "";
    const nameLink = nameCell.querySelector("a");
    const name = nameLink ? nameLink.textContent?.trim() || nameText : nameText;

    if (!type || !name) return null;

    let description: string | undefined;
    const href = nameLink?.getAttribute("href");

    if (href && href.startsWith("#")) {
      const targetId = href.substring(1);
      const docs = DOMUtils.getDetailedDocumentation(doc, targetId);
      if (docs) {
        description = docs.main;
      }
    }

    const propertyFlags = {
      readonly:
        !type.includes("Q_PROPERTY") ||
        (type.includes("READ") && !type.includes("WRITE")),
      static: type.includes("static"),
    };

    return {
      name,
      type: this.typeMapper.mapCppTypeToTs(
        type.replace(/static|Q_PROPERTY/g, "").trim()
      ),
      readonly: propertyFlags.readonly,
      static: propertyFlags.static,
      description: this.configManager.getConfig().generateComments
        ? description
        : undefined,
    };
  }
}