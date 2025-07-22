import type { TypeMappingConfig } from "./type-system.ts";

export const defaultTypeMappings: TypeMappingConfig = {
  mappings: [
    // C++ primitives
    {
      name: "int",
      tsType: "number",
      category: "primitive",
      description: "32-bit signed integer",
    },
    {
      name: "uint",
      tsType: "number",
      category: "primitive",
      description: "32-bit unsigned integer",
    },
    {
      name: "long",
      tsType: "number",
      category: "primitive",
      description: "Long integer",
    },
    {
      name: "short",
      tsType: "number",
      category: "primitive",
      description: "16-bit signed integer",
    },
    {
      name: "char",
      tsType: "string",
      category: "primitive",
      description: "Single character",
    },
    {
      name: "bool",
      tsType: "boolean",
      category: "primitive",
      description: "Boolean value",
    },
    {
      name: "void",
      tsType: "void",
      category: "primitive",
      description: "No return value",
    },
    {
      name: "float",
      tsType: "number",
      category: "primitive",
      description: "32-bit floating point",
    },
    {
      name: "double",
      tsType: "number",
      category: "primitive",
      description: "64-bit floating point",
    },
    {
      name: "qreal",
      tsType: "number",
      category: "primitive",
      description: "Qt real number type",
    },

    // Qt basic types
    {
      name: "QString",
      tsType: "string",
      category: "qt-basic",
      description: "Qt string class",
    },
    {
      name: "QStringList",
      tsType: "string[]",
      category: "qt-basic",
      description: "List of Qt strings",
    },
    {
      name: "QByteArray",
      tsType: "Uint8Array",
      category: "qt-basic",
      description: "Qt byte array",
    },
  ],
  templateMappings: [
    {
      pattern: "^QList<(.+)>$",
      replacement: "$1[]",
      description: "QList to TypeScript array",
    },
    {
      pattern: "^QVector<(.+)>$",
      replacement: "$1[]",
      description: "QVector to TypeScript array",
    },
    {
      pattern: "^QHash<(.+),\\s*(.+)>$",
      replacement: "Map<$1, $2>",
      description: "QHash to TypeScript Map",
    },
    {
      pattern: "^QMap<(.+),\\s*(.+)>$",
      replacement: "Map<$1, $2>",
      description: "QMap to TypeScript Map",
    },
    {
      pattern: "^QSet<(.+)>$",
      replacement: "Set<$1>",
      description: "QSet to TypeScript Set",
    },
    {
      pattern: "^std::vector<(.+)>$",
      replacement: "$1[]",
      description: "std::vector to TypeScript array",
    },
    {
      pattern: "^std::map<(.+),\\s*(.+)>$",
      replacement: "Map<$1, $2>",
      description: "std::map to TypeScript Map",
    },
    {
      pattern: "^std::set<(.+)>$",
      replacement: "Set<$1>",
      description: "std::set to TypeScript Set",
    },
  ],
  namespaceMappings: [
    {
      cppNamespace: "KWin",
      tsNamespace: "KWin",
      stripNamespace: false,
    },
    {
      cppNamespace: "Qt",
      tsNamespace: "Qt",
      stripNamespace: false,
    },
    {
      cppNamespace: "std",
      tsNamespace: "",
      stripNamespace: true,
    },
  ],
  customRules: [],
};
