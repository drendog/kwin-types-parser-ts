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

  static querySelector(parent: Document | Element, selector: string): Element | null {
    return parent.querySelector(selector);
  }

  static querySelectorAll(parent: Document | Element, selector: string): Element[] {
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
}