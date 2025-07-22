import type { Document, Element } from "deno_dom";
import { uniqBy, flatMap } from "lodash";
import type {
  ParseConfig,
  ParsedEnum,
} from "../../core/interfaces.ts";
import { type ParseStrategy, DOMUtils } from "./base-strategy.ts";

export class EnumParseStrategy implements ParseStrategy<ParsedEnum> {
  constructor() {}

  parse(doc: Document, _config: ParseConfig): ParsedEnum[] {
    const enums: ParsedEnum[] = [];

    this.parseEnumsFromMemberDetails(doc, enums);
    this.parseEnumsFromMemberDecls(doc, enums);
    this.parseEnumsFromFieldtable(doc, enums);

    return uniqBy(enums, (enumDef: ParsedEnum) => enumDef.name);
  }

  private parseEnumsFromMemberDetails(
    doc: Document,
    enums: ParsedEnum[]
  ): void {
    const enumSections = doc.querySelectorAll("h2.memtitle");
    enumSections.forEach((section) => {
      const titleText = section.textContent?.trim() || "";
      const enumMatch = titleText.match(/enum\s+(\w+)/);
      if (!enumMatch) return;
      const enumName = enumMatch[1];
      const enumValues: {
        name: string;
        description?: string;
        value?: string;
      }[] = [];
      const descElement =
        section.parentElement?.nextElementSibling?.querySelector(
          ".memdoc .textblock"
        );
      const description = descElement?.textContent?.trim();
      let currentElement = DOMUtils.asElement(
        section.parentElement?.nextElementSibling || null
      );
      while (currentElement) {
        const table = currentElement.querySelector("table.fieldtable");
        if (table) {
          const rows = table.querySelectorAll("tr");
          rows.forEach((row) => {
            const rowElement = DOMUtils.asElement(row);
            if (!rowElement) return;
            const nameCell = rowElement.querySelector(
              ".fieldname a, .fieldname"
            );
            const descCell = rowElement.querySelector(".fielddoc");
            if (nameCell) {
              const name = nameCell.textContent?.trim() || "";
              let desc: string | undefined;
              if (descCell) {
                const paragraphs = descCell.querySelectorAll("p");
                if (paragraphs.length > 0) {
                  desc = Array.from(paragraphs)
                    .map((p) => p.textContent?.trim())
                    .filter(Boolean)
                    .join(" ");
                } else {
                  desc = descCell.textContent?.trim();
                }
              }
              const valueMatch = name.match(/(\w+)\s*=\s*(.+)/);
              let actualName = name;
              let value: string | undefined;
              if (valueMatch) {
                actualName = valueMatch[1];
                value = valueMatch[2];
              }
              if (actualName) {
                enumValues.push({ name: actualName, description: desc, value });
              }
            }
          });
          break;
        }
        currentElement = DOMUtils.asElement(currentElement.nextElementSibling);
      }
      if (enumValues.length > 0) {
        enums.push({ name: enumName, values: enumValues, description });
      }
    });
  }

  private parseEnumsFromMemberDecls(doc: Document, enums: ParsedEnum[]): void {
    const memberTables = doc.querySelectorAll("table.memberdecls");
    const enumInfos = flatMap(Array.from(memberTables), (table: Element) => {
      const tableElement = DOMUtils.asElement(table);
      if (!tableElement) return [];
      return this.extractEnumsFromTable(tableElement);
    });
    enums.push(...enumInfos);
  }

  private extractEnumsFromTable(tableElement: Element): ParsedEnum[] {
    const enumRows = tableElement.querySelectorAll("tr");
    return flatMap(Array.from(enumRows), (row: Element) => {
      const rowElement = DOMUtils.asElement(row);
      if (!rowElement) return [];
      const leftCell = rowElement.querySelector(".memItemLeft");
      const rightCell = rowElement.querySelector(".memItemRight");
      if (!leftCell?.textContent?.includes("enum") || !rightCell) {
        return [];
      }
      const enumLink = rightCell.querySelector("a");
      if (!enumLink) return [];
      const enumName = enumLink.textContent?.trim();
      const enumContent = rightCell.textContent || "";
      if (!enumName) return [];
      const enumValues = this.parseEnumValues(enumContent);
      return enumValues.length > 0
        ? [{ name: enumName, values: enumValues }]
        : [];
    });
  }

  private parseEnumValues(
    enumContent: string
  ): { name: string; description?: string; value?: string }[] {
    const valuesRegex = /\{([^}]+)\}/;
    const valuesMatch = valuesRegex.exec(enumContent);
    if (!valuesMatch) return [];
    return valuesMatch[1]
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((value) => {
        const cleanValue = value.replace(/\s+/g, " ").trim();
        const assignmentRegex = /^(.+?)\s*=\s*(.+)$/;
        const assignmentMatch = assignmentRegex.exec(cleanValue);
        if (assignmentMatch) {
          const name = DOMUtils.decodeHtmlEntities(assignmentMatch[1])
            .replace(/<[^>]*>/g, "")
            .trim();
          const enumValue = DOMUtils.decodeHtmlEntities(assignmentMatch[2])
            .replace(/<[^>]*>/g, "")
            .trim();
          return { name, value: enumValue };
        }
        const name = DOMUtils.decodeHtmlEntities(cleanValue)
          .replace(/<[^>]*>/g, "")
          .trim();
        return name ? { name } : null;
      })
      .filter(
        (
          value
        ): value is { name: string; description?: string; value?: string } =>
          value !== null
      );
  }

  private parseEnumsFromFieldtable(doc: Document, enums: ParsedEnum[]): void {
    const memItems = doc.querySelectorAll(".memitem");
    memItems.forEach((memItem) => {
      const memProto = memItem.querySelector(".memproto");
      if (!memProto) return;
      const memNameTable = memProto.querySelector("table.memname");
      if (!memNameTable) return;
      const enumNameCell = memNameTable.querySelector("td.memname");
      if (!enumNameCell) return;
      const enumNameText = enumNameCell.textContent?.trim() || "";
      const enumMatch = enumNameText.match(/enum\s+(?:.+::)*(\w+)/);
      if (!enumMatch) return;
      const enumName = enumMatch[1];
      const memDoc = memItem.querySelector(".memdoc");
      if (!memDoc) return;
      const fieldTable = memDoc.querySelector("table.fieldtable");
      if (!fieldTable) return;
      const fieldRows = fieldTable.querySelectorAll("tr");
      const enumValues: {
        name: string;
        description?: string;
        value?: string;
      }[] = [];
      for (let i = 1; i < fieldRows.length; i++) {
        const row = fieldRows[i];
        const fieldName = row.querySelector(".fieldname");
        const fieldDoc = row.querySelector(".fielddoc");
        if (!fieldName) continue;
        const name = fieldName.textContent?.trim() || "";
        if (!name) continue;
        let description: string | undefined;
        if (fieldDoc) {
          const paragraphs = fieldDoc.querySelectorAll("p");
          if (paragraphs.length > 0) {
            description = Array.from(paragraphs)
              .map((p) => p.textContent?.trim())
              .filter(Boolean)
              .join(" ");
          } else {
            description = fieldDoc.textContent?.trim();
          }
          if (description) {
            description = DOMUtils.decodeHtmlEntities(description).trim();
          }
        }
        enumValues.push({ name, description });
      }
      if (enumValues.length > 0) {
        const existingEnum = enums.find((e) => e.name === enumName);
        if (existingEnum) {
          for (const value of enumValues) {
            const existingValue = existingEnum.values.find(
              (v) => v.name === value.name
            );
            if (existingValue && value.description) {
              existingValue.description = value.description;
            } else if (!existingValue) {
              existingEnum.values.push(value);
            }
          }
        } else {
          enums.push({ name: enumName, values: enumValues });
        }
      }
    });
  }
}