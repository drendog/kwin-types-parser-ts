import type { Document, Element } from "deno_dom";
import { join, dirname } from "@std/path";
import type { ILinkResolver, IConfigurationManager } from "../core/interfaces.ts";

export class LinkResolver implements ILinkResolver {
  private readonly baseUrl: string;
  private readonly configManager: IConfigurationManager;

  constructor(baseUrl: string, configManager: IConfigurationManager) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.configManager = configManager;
  }

  shouldFollowLink(href: string): boolean {
    // Only follow class and namespace reference links
    return (
      href.includes("class_") ||
      href.includes("namespace_") ||
      href.includes("struct_")
    );
  }

  isNamespaceFile(href: string): boolean {
    return href.includes("namespace_");
  }

  isClassFile(href: string): boolean {
    return href.includes("class_") || href.includes("struct_");
  }

  resolveUrl(href: string, source: string): string {
    // Remove URL fragments (anchors) that point to specific sections
    const cleanHref = href.split("#")[0];

    if (source.startsWith("http")) {
      return `${this.baseUrl}/${cleanHref}`;
    } else {
      return join(dirname(source), cleanHref);
    }
  }

  getRelatedLinks(doc: Document): string[] {
    const links = doc.querySelectorAll('a[href$=".html"]');
    const relatedLinks: string[] = [];

    for (const link of links) {
      const linkElement = link as Element;
      const href = linkElement.getAttribute("href");

      if (href && this.shouldFollowLink(href)) {
        relatedLinks.push(href);
      }
    }

    return relatedLinks;
  }

  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  isHttpUrl(source: string): boolean {
    return source.startsWith("http");
  }
}
