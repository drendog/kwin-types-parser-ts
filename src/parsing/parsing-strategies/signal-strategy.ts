import type { Document } from "deno_dom";
import type {
  ParseConfig,
  ParsedMethod,
} from "../../core/interfaces.ts";
import type { ParseStrategy } from "./base-strategy.ts";
import type { MethodParseStrategy } from "./method-strategy.ts";

export class SignalParseStrategy implements ParseStrategy<ParsedMethod> {
  constructor(private readonly methodStrategy: MethodParseStrategy) {}

  parse(doc: Document, config: ParseConfig): ParsedMethod[] {
    // Signals are structurally identical to public methods in the HTML.
    const signals = this.methodStrategy.parse(doc, config, "signals", "public");

    return signals.map((signal) => ({
      ...signal,
      returnType: "void", // Signals always return void in Qt
      decorators: [...(signal.decorators || []), "signal"],
    }));
  }
}