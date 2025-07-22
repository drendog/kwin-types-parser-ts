import { DOMParser, type Document } from "deno_dom";
import { formatError } from "./error-handler.ts";

export class DocumentLoader {
  static async loadFromFile(filePath: string): Promise<Document> {
    try {
      const content = await Deno.readTextFile(filePath);
      const doc = new DOMParser().parseFromString(content, "text/html");
      if (!doc) {
        throw new Error(`Failed to parse HTML from ${filePath}`);
      }
      return doc;
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${formatError(error)}`);
    }
  }

  static async loadFromUrl(url: string): Promise<Document> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc) {
        throw new Error(`Failed to parse HTML from ${url}`);
      }
      return doc;
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${formatError(error)}`);
    }
  }

  static parseFromString(content: string, source?: string): Document {
    const doc = new DOMParser().parseFromString(content, "text/html");
    if (!doc) {
      throw new Error(
        `Failed to parse HTML` + (source ? ` from ${source}` : "")
      );
    }
    return doc;
  }
}
