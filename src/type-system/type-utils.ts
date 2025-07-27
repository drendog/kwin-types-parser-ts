export class TypeUtils {
  static extractTypeName(fullTypeName: string): string {
    return fullTypeName.split("::").pop() || fullTypeName;
  }

  static extractNamespace(fullTypeName: string): string {
    const parts = fullTypeName.split("::");
    return parts.length > 1 ? parts.slice(0, -1).join("::") : "";
  }

  static normalizeTypeName(typeName: string): string {
    return typeName.replace(/\s+/g, " ").trim();
  }

  static isFullyQualified(typeName: string): boolean {
    return typeName.includes("::");
  }

  static buildFullTypeName(namespace: string, typeName: string): string {
    return namespace ? `${namespace}::${typeName}` : typeName;
  }

  static sanitizeTypeName(typeName: string): string {
    return typeName
      .replace(/[<>]/g, "_")
      .replace(/[^a-zA-Z0-9_:]/g, "")
      .replace(/::/g, "_");
  }

  static cleanCppTypeString(cppType: string): string {
    return cppType
      .replace(/\bconst\b/g, "")
      .replace(/[&*]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  static cleanTypeForLookup(typeName: string): string {
    return typeName.replace(/[<>*&[\]]/g, "").trim();
  }

  static isObjectLiteral(typeName: string): boolean {
    return typeName.startsWith("{") && typeName.endsWith("}");
  }
}