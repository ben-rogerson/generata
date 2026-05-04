export interface BindOptions {
  as: string | undefined;
  required: readonly string[];
}

export interface BindResult {
  vars: Record<string, string>[];
  errors: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringifyValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Date, RegExp, class instances etc. fall through to JSON.stringify - users
  // who need ISO dates or custom shapes should pre-convert before passing items in.
  return JSON.stringify(v);
}

export function bindItems(items: unknown[], options: BindOptions): BindResult {
  if (items.length === 0) return { vars: [], errors: [] };

  const allStrings = items.every((i) => typeof i === "string");
  const allObjects = items.every(isPlainObject);

  if (!allStrings && !allObjects) {
    return {
      vars: [],
      errors: ["each: items must be all strings or all objects (mixed shapes are not allowed)"],
    };
  }

  if (allStrings) {
    if (!options.as) {
      return {
        vars: [],
        errors: ["each: string items require an `as:` option to name the binding"],
      };
    }
    const name = options.as;
    const vars = (items as string[]).map((s) => ({ [name]: s }));
    const missing = options.required.filter((r) => r !== name);
    if (missing.length > 0) {
      return {
        vars: [],
        errors: [
          `each: sub-workflow requires [${options.required.join(", ")}] but only '${name}' is bound`,
        ],
      };
    }
    return { vars, errors: [] };
  }

  // allObjects
  if (options.as) {
    return {
      vars: [],
      errors: ["each: object items must not use `as:` (keys spread into the params bag)"],
    };
  }
  const vars: Record<string, string>[] = [];
  const errors: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const obj = items[i] as Record<string, unknown>;
    const missing = options.required.filter((r) => !Object.hasOwn(obj, r) || obj[r] === undefined);
    if (missing.length > 0) {
      errors.push(`each: item at index ${i} missing required keys: [${missing.join(", ")}]`);
      continue;
    }
    const bag: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) bag[k] = stringifyValue(v);
    vars.push(bag);
  }
  if (errors.length > 0) return { vars: [], errors };
  return { vars, errors: [] };
}
