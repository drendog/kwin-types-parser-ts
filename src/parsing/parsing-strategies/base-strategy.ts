import type { Document } from "deno_dom";
import type { ParseConfig } from "../../core/interfaces.ts";

export interface ParseStrategy<T> {
  parse(doc: Document, config: ParseConfig, ...args: unknown[]): T[];
}
