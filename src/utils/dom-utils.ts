import type { Document, Element, Node } from "deno_dom";

export class DOMUtils {
  static isElement(node: Node | null): node is Element {
    return node !== null && node.nodeType === 1;
  }

  static asElement(node: Node | null): Element | null {
    return this.isElement(node) ? node : null;
  }

  static getTextContent(element: Element | null): string {
    return element?.textContent?.trim() || "";
  }

  static querySelector(
    parent: Document | Element,
    selector: string
  ): Element | null {
    return parent.querySelector(selector);
  }

  static querySelectorAll(
    parent: Document | Element,
    selector: string
  ): Element[] {
    return Array.from(parent.querySelectorAll(selector));
  }

  static findNextElementSibling(element: Element): Element | null {
    return this.asElement(element.nextElementSibling);
  }

  static findParentElement(element: Element, tagName: string): Element | null {
    let currentElement = element.parentElement;
    while (currentElement && currentElement.tagName !== tagName.toUpperCase()) {
      currentElement = currentElement.parentElement;
    }
    return currentElement;
  }

  static findSectionTable(doc: Document, sectionId: string): Element | null {
    const sectionHeader = doc.querySelector(`#${sectionId}`);
    if (!sectionHeader) return null;

    let currentElement = sectionHeader.parentElement;
    while (currentElement && currentElement.tagName !== "TABLE") {
      currentElement = currentElement.parentElement;
    }

    return currentElement;
  }

  static findMethodRowsInSection(table: Element, sectionId: string): Element[] {
    const rows: Element[] = [];
    let foundSection = false;
    const allRows = table.querySelectorAll("tr");

    for (const row of allRows) {
      const rowElement = this.asElement(row);
      if (!rowElement) continue;

      if (rowElement.querySelector(`#${sectionId}`)) {
        foundSection = true;
        continue;
      }

      if (foundSection && rowElement.classList.contains("heading")) {
        break;
      }

      if (
        foundSection &&
        (rowElement.classList.contains("memitem") ||
          Array.from(rowElement.classList).some((cls) =>
            cls.startsWith("memitem:")
          ))
      ) {
        rows.push(rowElement);
      }
    }

    return rows;
  }

  static decodeHtmlEntities(text: string): string {
    if (!text) return "";
    return text
      .replace(/<[^>]+>/g, "") // Strip other html tags that might be in the description
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/&/g, "&")
      .replace(/"/g, '"')
      .replace(/ /g, " ") // non-breaking space
      .replace(/\s+/g, " ")
      .trim();
  }

  static splitParameters(paramStr: string): string[] {
    const rawParams: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of paramStr) {
      if (char === "<" || char === "(") depth++;
      else if (char === ">" || char === ")") depth--;
      else if (char === "," && depth === 0) {
        rawParams.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      rawParams.push(current.trim());
    }

    return rawParams.filter((param) => param.length > 0);
  }

  static parseParameterType(param: string): { type: string; name: string } {
    const cleanParam = param
      .trim()
      .replace(/\bconst\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const parts = cleanParam.split(/\s+/);
    let name = parts.pop() || "";

    name = name.replace(/[&*]+/g, "").replace(/^\*+/, "");
    let type = parts.join(" ");
    type = type.replace(/[&*]/g, "").trim();

    if (!type && name) {
      const typeNameRegex = /^(.+)\s+(\w+)$/;
      const typeNameMatch = typeNameRegex.exec(cleanParam);
      if (typeNameMatch) {
        type = typeNameMatch[1].replace(/[&*]/g, "").trim();
        name = typeNameMatch[2];
      } else {
        type = name.replace(/[&*]/g, "");
        name = "param";
      }
    }

    return { type, name };
  }

  static getDetailedDocumentation(
    doc: Document,
    anchorId: string
  ): { main: string; params: Map<string, string> } | null {
    const anchor = doc.querySelector(`a[name="${anchorId}"]`);
    if (!anchor) {
      return null;
    }

    let element: Element | null = anchor;
    let memitemDiv: Element | null = null;

    while (element.nextElementSibling) {
      element = element.nextElementSibling;
      if (
        element.tagName.toLowerCase() === "div" &&
        element.classList.contains("memitem")
      ) {
        memitemDiv = element;
        break;
      }
    }

    if (!memitemDiv) return null;

    const memdocDiv = memitemDiv.querySelector(".memdoc");
    if (!memdocDiv) return null;

    const mainDescription = Array.from(
      memdocDiv.querySelectorAll("p:not(.definition)")
    )
      .map((p) => this.decodeHtmlEntities(p.textContent || ""))
      .join("\n");

    const paramsMap = new Map<string, string>();
    const paramsDl = memdocDiv.querySelector("dl.params");
    if (paramsDl) {
      const paramRows = paramsDl.querySelectorAll("table.params tr");
      paramRows.forEach((row) => {
        const nameCell = row.querySelector("td.paramname");
        const docCell = nameCell?.nextElementSibling;
        if (nameCell && docCell) {
          const name = nameCell.textContent?.trim();
          const description = this.decodeHtmlEntities(
            docCell.textContent || ""
          );
          if (name) {
            paramsMap.set(name, description);
          }
        }
      });
    }

    return { main: mainDescription, params: paramsMap };
  }
}
