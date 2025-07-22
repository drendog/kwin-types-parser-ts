import type { Document } from "deno_dom";
import type {
  IHTMLDocumentParser,
  ILinkResolver,
  ParsedClass,
  ParsedEnum,
} from "../core/interfaces.ts";
import { DocumentLoader } from "../utils/index.ts";

export interface ParsedDocument {
  classInfo: ParsedClass | null;
  namespaceInfo?: NamespaceInfo;
  source: string;
  isNamespace: boolean;
  sourceDocument?: Document; // Store the original document for dependency extraction
}

export interface NamespaceInfo {
  name: string;
  fullName: string;
  enums: ParsedEnum[];
}

export class DocumentParsingService {
  constructor(
    private readonly htmlParser: IHTMLDocumentParser,
    private readonly linkResolver: ILinkResolver
  ) {}

  async parseFromFile(filePath: string): Promise<ParsedDocument> {
    const doc = await DocumentLoader.loadFromFile(filePath);
    return this.parseDocument(doc, filePath);
  }

  async parseFromUrl(url: string): Promise<ParsedDocument> {
    const doc = await DocumentLoader.loadFromUrl(url);
    return this.parseDocument(doc, url);
  }

  private parseDocument(doc: Document, source: string): ParsedDocument {
    const isNamespace = this.isNamespaceDocument(source);

    if (isNamespace) {
      const namespaceInfo = this.htmlParser.parseNamespaceDocument(doc);
      return {
        classInfo: null,
        namespaceInfo: namespaceInfo || undefined,
        source,
        isNamespace: true,
        sourceDocument: doc, // Store the original document
      };
    }

    const classInfo = this.htmlParser.parseDocument(doc, source);
    return {
      classInfo,
      namespaceInfo: undefined,
      source,
      isNamespace: false,
      sourceDocument: doc, // Store the original document
    };
  }

  private isNamespaceDocument(source: string): boolean {
    return source.includes("namespace_") || source.includes("/namespace");
  }

  getRelatedLinks(doc: Document): string[] {
    return this.linkResolver.getRelatedLinks(doc);
  }

  shouldFollowLink(href: string, currentDepth: number): boolean {
    return this.linkResolver.shouldFollowLink(href, currentDepth);
  }

  resolveUrl(href: string, source: string): string {
    return this.linkResolver.resolveUrl(href, source);
  }

  isHttpUrl(source: string): boolean {
    return this.linkResolver.isHttpUrl(source);
  }

}
