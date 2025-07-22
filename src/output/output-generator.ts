import { groupBy, partition } from "lodash";
import Handlebars from "handlebars";
import type {
  ParsedClass,
  ParsedEnum,
  ParsedMethod,
  ParsedParameter,
  IOutputGenerator,
  IConfigurationManager,
  ParseConfig,
} from "../core/interfaces.ts";

interface TemplateData {
  generatedDate: string;
  classCount: number;
  namespaces: NamespaceData[];
  config: ParseConfig;
}

interface NamespaceData {
  name: string;
  classes: ParsedClass[];
  globalEnums: ParsedEnum[] | null;
  classEnumNamespaces: ClassEnumNamespace[];
  skipEnums: boolean;
  config: ParseConfig;
}

interface ClassEnumNamespace {
  className: string;
  enums: ParsedEnum[];
}

export class OutputGenerator implements IOutputGenerator {
  private readonly configManager: IConfigurationManager;
  private readonly templates: Map<string, HandlebarsTemplateDelegate> =
    new Map();
  private isInitialized = false;

  constructor(configManager: IConfigurationManager) {
    this.configManager = configManager;
  }

  private async initializeTemplates(): Promise<void> {
    if (this.isInitialized) return;

    const templateFiles = [
      "main.hbs",
      "namespace.hbs",
      "class.hbs",
      "enum.hbs",
      "method.hbs",
      "property.hbs",
      "signal.hbs",
      "qt-types.hbs",
      "std-types.hbs",
      "globals.hbs",
    ];

    try {
      for (const file of templateFiles) {
        const templatePath = new URL(`./templates/${file}`, import.meta.url)
          .pathname;
        const content = await Deno.readTextFile(templatePath);
        const compiled = Handlebars.compile(content);
        this.templates.set(file.replace(".hbs", ""), compiled);
      }

      // Register all our template partials
      Handlebars.registerPartial("namespace", this.templates.get("namespace"));
      Handlebars.registerPartial("class", this.templates.get("class"));
      Handlebars.registerPartial("enum", this.templates.get("enum"));
      Handlebars.registerPartial("method", this.templates.get("method"));
      Handlebars.registerPartial("property", this.templates.get("property"));
      Handlebars.registerPartial("signal", this.templates.get("signal"));
      Handlebars.registerPartial("qt-types", this.templates.get("qt-types"));
      Handlebars.registerPartial("std-types", this.templates.get("std-types"));
      Handlebars.registerPartial("globals", this.templates.get("globals"));

      this.registerHelpers();
      this.isInitialized = true;
    } catch (error) {
      // Template loading failed - give useful error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize templates: ${errorMessage}`);
    }
  }

  private registerHelpers(): void {
    // Handlebars template helpers
    Handlebars.registerHelper("indent", (level: number = 0) => {
      return "  ".repeat(level);
    });

    Handlebars.registerHelper("add", (a: number, b: number) => a + b);

    Handlebars.registerHelper("join", (array: string[], separator: string) => {
      return array ? array.join(separator) : "";
    });

    // Build modifier strings for methods/properties
    Handlebars.registerHelper("modifiers", (obj: Record<string, unknown>) => {
      const modifiers: string[] = [];
      if (obj.isStatic || obj.static) modifiers.push("static");
      if (obj.isAbstract) modifiers.push("abstract");
      if (obj.readonly) modifiers.push("readonly");
      return modifiers.length > 0 ? modifiers.join(" ") + " " : "";
    });

    // Filter for Qt decorators only
    Handlebars.registerHelper("qtDecorators", (decorators: string[]) => {
      return decorators
        ? decorators.filter((d: string) => d.startsWith("Q_"))
        : [];
    });

    // Make C++ enum values JS-friendly
    Handlebars.registerHelper("convertCppValue", (cppValue: string) => {
      return this.convertCppEnumValue(cppValue);
    });

    // See if we have any param docs to show
    Handlebars.registerHelper(
      "hasParameterDescriptions",
      (parameters: ParsedParameter[]) => {
        if (!parameters || parameters.length === 0) return false;
        return parameters.some(
          (param) => param.description && param.description.trim() !== ""
        );
      }
    );
  }

  private processEnumValues(enumItem: ParsedEnum): ParsedEnum {
    // Resolve enum refs, or convert C++ values
    const processedValues = enumItem.values.map((value) => {
      if (value.value) {
        const resolvedValue = this.resolveEnumMemberReference(
          value.value,
          enumItem.values
        );
        return {
          ...value,
          resolvedValue:
            resolvedValue !== null
              ? resolvedValue
              : this.convertCppEnumValue(value.value),
        };
      }
      return value;
    });

    return {
      ...enumItem,
      values: processedValues,
    };
  }

  private resolveEnumMemberReference(
    cppValue: string,
    enumValues: { name: string; value?: string }[]
  ): string | null {
    // Decode HTML and check for enum member references
    const jsValue = cppValue
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#160;/g, " ");

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(jsValue.trim())) {
      // Plain enum member name - try to resolve
      const referencedMemberName = jsValue.trim();
      const memberValue = this.calculateEnumMemberValue(
        enumValues,
        referencedMemberName
      );
      if (memberValue !== null) {
        return memberValue.toString();
      }
    }

    return null;
  }

  private convertCppEnumValue(cppValue: string): string {
    // Convert C++ enum values to JS equivalents
    let jsValue = cppValue
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#160;/g, " ");

    jsValue = this.convertCppConstants(jsValue);

    // Strip C++ unsigned suffixes
    jsValue = jsValue.replace(/(\d+)[uU]/g, "$1");

    // Handle C++ unsigned wraparound edge case
    jsValue = jsValue.replace(/0U\s*-\s*1/g, "0xFFFFFFFF");
    jsValue = jsValue.replace(/0\s*-\s*1/g, "0xFFFFFFFF");

    return jsValue;
  }

  private calculateEnumMemberValue(
    enumValues: { name: string; value?: string }[],
    memberName: string
  ): number | null {
    // Calculate enum values with auto-increment
    let currentValue = 0;

    for (const enumMember of enumValues) {
      if (enumMember.name === memberName) {
        return currentValue;
      }

      if (enumMember.value) {
        // Only eval safe expressions
        const convertedValue = this.convertCppConstants(enumMember.value);
        try {
          if (/^[\d\s+\-*\/()]+$/.test(convertedValue)) {
            currentValue = eval(convertedValue);
          } else {
            return null;
          }
        } catch (_e) {
          return null;
        }
      }

      currentValue++;
    }

    return null;
  }

  private convertCppConstants(value: string): string {
    // Eval safe math or convert C++ scope operators
    try {
      if (/^[\d\s+\-*\/()]+$/.test(value)) {
        const evaluated = eval(value);
        if (typeof evaluated === "number" && !isNaN(evaluated)) {
          return evaluated.toString();
        }
      }
    } catch (_e) {
    }

    value = value.replace(/::/g, ".");
    return value;
  }

  private prepareTemplateData(
    classes: Map<string, ParsedClass>,
    globalEnums?: Map<string, ParsedEnum>
  ): TemplateData {
    const config = this.configManager.getConfig();

    const namespaces = groupBy(
      Array.from(classes.values()),
      "namespace"
    ) as Record<string, ParsedClass[]>;

    const namespacesData = Object.entries(namespaces).map(
      ([name, classList]) => {
        // Apply visibility filtering
        const processedClasses = classList.map((cls) => {
          const [publicMethods] = partition(
            cls.methods,
            (method: ParsedMethod) => method.visibility !== "private"
          );

          const methodsToInclude = config.includePrivate
            ? cls.methods
            : publicMethods;

          return {
            ...cls,
            methods: methodsToInclude,
            level: 1,
          };
        });

        const classEnumNamespaces: ClassEnumNamespace[] = classList
          .filter((cls) => cls.enums && cls.enums.length > 0)
          .map((cls) => ({
            className: cls.name,
            enums: cls.enums,
          }));

        // Handle global enums for first namespace only
        const processedGlobalEnums =
          globalEnums && name === Object.keys(namespaces)[0]
            ? Array.from(globalEnums.values()).map((enumItem) =>
                this.processEnumValues(enumItem)
              )
            : null;

        // Process class enums
        const processedClassEnumNamespaces = classEnumNamespaces.map((ns) => ({
          ...ns,
          enums: ns.enums.map((enumItem) => this.processEnumValues(enumItem)),
        }));

        return {
          name,
          classes: processedClasses,
          globalEnums: processedGlobalEnums,
          classEnumNamespaces: processedClassEnumNamespaces,
          skipEnums: true,
          config,
        };
      }
    );

    return {
      generatedDate: new Date().toISOString(),
      classCount: classes.size,
      namespaces: namespacesData,
      config,
    };
  }

  generateTypeScript(classes: Map<string, ParsedClass>): Promise<string>;
  generateTypeScript(
    classes: Map<string, ParsedClass>,
    globalEnums: Map<string, ParsedEnum>
  ): Promise<string>;
  async generateTypeScript(
    classes: Map<string, ParsedClass>,
    globalEnums?: Map<string, ParsedEnum>
  ): Promise<string> {
    await this.initializeTemplates();

    const data = this.prepareTemplateData(classes, globalEnums);
    const mainTemplate = this.templates.get("main");

    if (!mainTemplate) {
      throw new Error("Main template not found");
    }

    return mainTemplate(data);
  }
}
