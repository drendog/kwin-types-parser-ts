import { createToken, Lexer, type IToken } from "chevrotain";
import { Logger } from "../utils/logtape-logger.ts";

// Token definitions for C++ type signatures
const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_]\w*/,
});

const Scope = createToken({
  name: "Scope",
  pattern: /::/,
});

const Dot = createToken({
  name: "Dot",
  pattern: /\./,
});

const LeftAngle = createToken({
  name: "LeftAngle",
  pattern: /</,
});

const RightAngle = createToken({
  name: "RightAngle",
  pattern: />/,
});

const LeftBracket = createToken({
  name: "LeftBracket",
  pattern: /\[/,
});

const RightBracket = createToken({
  name: "RightBracket",
  pattern: /\]/,
});

const Comma = createToken({
  name: "Comma",
  pattern: /,/,
});

const Asterisk = createToken({
  name: "Asterisk",
  pattern: /\*/,
});

const Ampersand = createToken({
  name: "Ampersand",
  pattern: /&/,
});

const Const = createToken({
  name: "Const",
  pattern: /const/,
});

const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

const allTokens = [
  WhiteSpace,
  Const,
  Scope,
  Dot,
  LeftAngle,
  RightAngle,
  LeftBracket,
  RightBracket,
  Comma,
  Asterisk,
  Ampersand,
  Identifier,
];

const typeLexer = new Lexer(allTokens);

// Parsed type information
export interface ParsedType {
  baseType: string;
  namespace?: string;
  templateArgs?: ParsedType[];
  isConst: boolean;
  isPointer: boolean;
  isReference: boolean;
  fullName: string;
}

// Simplified parser that uses manual tokenization and parsing
// This is more reliable than CST visitors for our use case
export class CppTypeAnalyzer {
  private lexer: Lexer;

  constructor() {
    this.lexer = typeLexer;
  }

  parseType(typeString: string): ParsedType | null {
    try {
      const tokens = this.tokenize(typeString);
      if (!tokens) return null;

      let index = 0;
      const isConst = tokens[index]?.tokenType === Const;
      if (isConst) index++;

      const typeResult = this.parseTypeExpression(tokens, index);
      if (!typeResult) return null;

      index = typeResult.nextIndex;
      let isPointer = false;
      let isReference = false;

      // Check for pointer/reference suffixes
      while (index < tokens.length) {
        const token = tokens[index];
        if (token.tokenType === Asterisk) {
          isPointer = true;
        } else if (token.tokenType === Ampersand) {
          isReference = true;
        }
        index++;
      }

      return {
        ...typeResult.type,
        isConst,
        isPointer,
        isReference,
      };
    } catch (error) {
      Logger.debug(`Failed to parse type "${typeString}"`, { error });
      return null;
    }
  }

  private tokenize(typeString: string): IToken[] | null {
    const lexingResult = this.lexer.tokenize(typeString);

    // Only warn about lexing errors if we have critical errors
    // Ignore common "unexpected character" warnings for dots and brackets
    const criticalErrors = lexingResult.errors.filter(
      (error) =>
        !error.message.includes("unexpected character: ->[<-") &&
        !error.message.includes("unexpected character: ->.<-") &&
        !error.message.includes("unexpected character: ->[]-")
    );

    if (criticalErrors.length > 0) {
      Logger.warning("Critical lexing errors detected while parsing type", {
        errors: criticalErrors.map((err) => ({
          message: err.message,
          offset: err.offset,
        })),
      });
      return null;
    }

    return lexingResult.tokens;
  }

  private parseTypeExpression(
    tokens: IToken[],
    startIndex: number
  ): {
    type: ParsedType;
    nextIndex: number;
  } | null {
    // Parse qualified type name
    const qualifiedResult = this.parseQualifiedType(tokens, startIndex);
    if (!qualifiedResult) return null;

    let index = qualifiedResult.nextIndex;
    let templateArgs: ParsedType[] | undefined;

    // Check for template arguments
    if (index < tokens.length && tokens[index].tokenType === LeftAngle) {
      const templateResult = this.parseTemplateArguments(tokens, index);
      if (templateResult) {
        templateArgs = templateResult.args;
        index = templateResult.nextIndex;
      }
    }

    // Check for array brackets
    const arrayResult = this.checkForArrayType(tokens, index);
    const isArrayType = arrayResult.isArray;
    index = arrayResult.nextIndex;

    const fullName = this.buildTypeFullName(
      qualifiedResult.result,
      templateArgs,
      isArrayType
    );

    return {
      type: {
        baseType: qualifiedResult.result.baseType,
        namespace: qualifiedResult.result.namespace,
        templateArgs,
        isConst: false,
        isPointer: false,
        isReference: false,
        fullName,
      },
      nextIndex: index,
    };
  }

  private checkForArrayType(
    tokens: IToken[],
    startIndex: number
  ): { isArray: boolean; nextIndex: number } {
    let index = startIndex;
    let isArrayType = false;

    if (index < tokens.length && tokens[index].tokenType === LeftBracket) {
      // Find matching right bracket
      let depth = 1;
      let bracketIndex = index + 1;
      while (bracketIndex < tokens.length && depth > 0) {
        if (tokens[bracketIndex].tokenType === LeftBracket) {
          depth++;
        } else if (tokens[bracketIndex].tokenType === RightBracket) {
          depth--;
        }
        bracketIndex++;
      }
      if (depth === 0) {
        isArrayType = true;
        index = bracketIndex;
      }
    }

    return { isArray: isArrayType, nextIndex: index };
  }

  private buildTypeFullName(
    qualifiedType: { baseType: string; namespace?: string },
    templateArgs?: ParsedType[],
    isArrayType: boolean = false
  ): string {
    let name = this.buildFullName(qualifiedType, templateArgs);

    if (isArrayType) {
      name += "[]";
    }

    return name;
  }

  private parseQualifiedType(
    tokens: IToken[],
    startIndex: number
  ): {
    result: { baseType: string; namespace?: string };
    nextIndex: number;
  } | null {
    const identifiers: string[] = [];
    let index = startIndex;

    if (index >= tokens.length || tokens[index].tokenType !== Identifier) {
      return null;
    }

    identifiers.push(tokens[index].image);
    index++;

    // Parse namespace::Type::More or namespace.Type.More
    while (
      index + 1 < tokens.length &&
      (tokens[index].tokenType === Scope || tokens[index].tokenType === Dot) &&
      tokens[index + 1].tokenType === Identifier
    ) {
      index++; // Skip :: or .
      identifiers.push(tokens[index].image);
      index++;
    }

    if (identifiers.length === 1) {
      return {
        result: { baseType: identifiers[0] },
        nextIndex: index,
      };
    }

    const baseType = identifiers[identifiers.length - 1];
    const namespace = identifiers.slice(0, -1).join("::");

    return {
      result: { baseType, namespace },
      nextIndex: index,
    };
  }

  private parseTemplateArguments(
    tokens: IToken[],
    startIndex: number
  ): {
    args: ParsedType[];
    nextIndex: number;
  } | null {
    if (tokens[startIndex].tokenType !== LeftAngle) {
      return null;
    }

    return this.collectTemplateArguments(tokens, startIndex + 1);
  }

  private collectTemplateArguments(
    tokens: IToken[],
    startIndex: number
  ): {
    args: ParsedType[];
    nextIndex: number;
  } {
    const args: ParsedType[] = [];
    let currentArg: IToken[] = [];
    let index = startIndex;
    let angleDepth = 1; // We start after the first <

    while (index < tokens.length && angleDepth > 0) {
      const token = tokens[index];
      index++;

      if (this.isTemplateStart(token)) {
        angleDepth++;
        currentArg.push(token);
        continue;
      }

      if (this.isTemplateEnd(token)) {
        angleDepth--;

        if (angleDepth === 0) {
          this.addArgumentIfValid(currentArg, args);
          break;
        }

        currentArg.push(token);
        continue;
      }

      if (this.isArgumentSeparator(token, angleDepth)) {
        this.addArgumentIfValid(currentArg, args);
        currentArg = [];
        continue;
      }

      // Default: collect token as part of current argument
      currentArg.push(token);
    }

    return { args, nextIndex: index };
  }

  private isTemplateStart(token: IToken): boolean {
    return token.tokenType === LeftAngle;
  }

  private isTemplateEnd(token: IToken): boolean {
    return token.tokenType === RightAngle;
  }

  private isArgumentSeparator(token: IToken, depth: number): boolean {
    return token.tokenType === Comma && depth === 1;
  }

  private addArgumentIfValid(tokens: IToken[], args: ParsedType[]): void {
    if (tokens.length === 0) return;

    const parsed = this.parseTypeFromTokens(tokens);
    if (parsed) {
      args.push(parsed);
    }
  }

  private parseTypeFromTokens(tokens: IToken[]): ParsedType | null {
    // Reconstruct the type string and parse recursively
    const typeString = tokens.map((t) => t.image).join("");
    return this.parseType(typeString);
  }

  private buildFullName(
    qualifiedType: { baseType: string; namespace?: string },
    templateArgs?: ParsedType[]
  ): string {
    let name = qualifiedType.namespace
      ? `${qualifiedType.namespace}::${qualifiedType.baseType}`
      : qualifiedType.baseType;

    if (templateArgs && templateArgs.length > 0) {
      const argsStr = templateArgs.map((arg) => arg.fullName).join(", ");
      name += `<${argsStr}>`;
    }

    return name;
  }

  extractTemplateParameters(typeString: string): string[] {
    const parsed = this.parseType(typeString);
    if (!parsed || !parsed.templateArgs) {
      return [];
    }

    return parsed.templateArgs.map((arg) => arg.fullName);
  }

  getBaseType(typeString: string): string {
    const parsed = this.parseType(typeString);
    if (!parsed) {
      return typeString; // Fallback to original
    }

    if (parsed.namespace) {
      return `${parsed.namespace}::${parsed.baseType}`;
    }

    return parsed.baseType;
  }

  isTemplateType(typeString: string): boolean {
    const parsed = this.parseType(typeString);
    return parsed ? !!parsed.templateArgs : false;
  }

  normalizeType(typeString: string): string {
    const parsed = this.parseType(typeString);
    if (!parsed) {
      return typeString.trim(); // Fallback
    }

    let result = parsed.fullName;

    if (parsed.isConst) {
      result = `const ${result}`;
    }

    if (parsed.isPointer) {
      result += "*";
    }

    if (parsed.isReference) {
      result += "&";
    }

    return result;
  }

  splitNamespace(typeString: string): { namespace?: string; typeName: string } {
    const parsed = this.parseType(typeString);
    if (!parsed) {
      const lastScope = typeString.lastIndexOf("::");
      if (lastScope !== -1) {
        return {
          namespace: typeString.substring(0, lastScope),
          typeName: typeString.substring(lastScope + 2),
        };
      }
      return { typeName: typeString };
    }

    return {
      namespace: parsed.namespace,
      typeName: parsed.baseType,
    };
  }
}

export const cppTypeAnalyzer = new CppTypeAnalyzer();
