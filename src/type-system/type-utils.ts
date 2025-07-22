
export function cleanCppTypeString(cppType: string): string {
  return cppType
    .replace(/\bconst\b/g, "")
    .replace(/[&*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanTypeForLookup(typeName: string): string {
  return typeName.replace(/[<>*&[\]]/g, "").trim();
}

export function extractTypeName(fullTypeName: string): string {
  return fullTypeName.split("::").pop() || fullTypeName;
}

export function normalizeTypeName(typeName: string): string {
  return typeName.replace(/\s+/g, " ").trim();
}

export function isObjectLiteral(typeName: string): boolean {
  return typeName.startsWith("{") && typeName.endsWith("}");
}
