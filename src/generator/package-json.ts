import type { ProjectOptions } from "../options.js";
import { compareCodeUnits } from "./compare.js";
import { substitutePlaceholders } from "./substitute.js";
import type { JsonValue, PackageJsonFragment, Profile } from "./types.js";

const TOP_LEVEL_ORDER = [
  "name",
  "version",
  "private",
  "description",
  "license",
  "type",
  "sideEffects",
  "bin",
  "files",
  "scripts",
  "exports",
  "engines",
  "packageManager",
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "pnpm",
] as const;

const REDUCER_OWNED_FIELDS = new Set([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "scripts",
]);
const FOUNDATION_PLACEHOLDER_PREFIX = "{{foundation:";

const assertStaticKey = (key: string, context: string): void => {
  if (key.includes(FOUNDATION_PLACEHOLDER_PREFIX)) {
    throw new Error(`${context} key "${key}" must not contain a placeholder.`);
  }
};

const canonicalizeJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, canonicalizeJsonValue(item)])
    );
  }

  return value;
};

const setUniqueValue = <Value extends JsonValue>(
  target: Map<string, Value>,
  key: string,
  value: Value,
  context: string
): void => {
  const existing = target.get(key);

  if (
    existing !== undefined &&
    JSON.stringify(canonicalizeJsonValue(existing)) !==
      JSON.stringify(canonicalizeJsonValue(value))
  ) {
    throw new Error(`Conflicting ${context} value for "${key}".`);
  }

  target.set(key, value);
};

const mergeStringMap = (
  target: Map<string, string>,
  incoming: Readonly<Record<string, string>> | undefined,
  context: string
): void => {
  if (!incoming) {
    return;
  }

  for (const [key, value] of Object.entries(incoming)) {
    assertStaticKey(key, context);
    setUniqueValue(target, key, value, context);
  }
};

const substituteJsonValue = (
  value: JsonValue,
  options: ProjectOptions
): JsonValue => {
  if (typeof value === "string") {
    return substitutePlaceholders(value, options);
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteJsonValue(item, options));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => {
          assertStaticKey(key, "package.json");
          return [key, substituteJsonValue(item, options)];
        })
    );
  }

  return value;
};

const sortObject = <Value>(
  values: ReadonlyMap<string, Value>
): Record<string, Value> =>
  Object.fromEntries(
    [...values.entries()].toSorted(([left], [right]) =>
      compareCodeUnits(left, right)
    )
  );

const orderTopLevelFields = (
  values: ReadonlyMap<string, JsonValue>
): Record<string, JsonValue> => {
  const orderedEntries: [string, JsonValue][] = [];
  const remaining = new Map(values);

  for (const key of TOP_LEVEL_ORDER) {
    const value = remaining.get(key);

    if (value !== undefined) {
      orderedEntries.push([key, value]);
      remaining.delete(key);
    }
  }

  orderedEntries.push(
    ...[...remaining.entries()].toSorted(([left], [right]) =>
      compareCodeUnits(left, right)
    )
  );

  return Object.fromEntries(orderedEntries);
};

export const buildPackageJson = (
  profiles: readonly Profile[],
  options: ProjectOptions
): string | undefined => {
  const fields = new Map<string, JsonValue>();
  const scripts = new Map<string, string>();
  const dependencies = new Map<string, string>();
  const devDependencies = new Map<string, string>();
  const peerDependencies = new Map<string, string>();
  let hasFragment = false;

  for (const profile of profiles) {
    const fragment: PackageJsonFragment | undefined = profile.packageJson;

    if (!fragment) {
      continue;
    }

    hasFragment = true;

    for (const [key, value] of Object.entries(fragment.fields ?? {})) {
      assertStaticKey(key, "package.json field");

      if (REDUCER_OWNED_FIELDS.has(key)) {
        throw new Error(
          `package.json field "${key}" is owned by its typed reducer.`
        );
      }

      setUniqueValue(fields, key, value, "package.json field");
    }

    mergeStringMap(scripts, fragment.scripts, "script");
    mergeStringMap(dependencies, fragment.dependencies, "dependency");
    mergeStringMap(
      devDependencies,
      fragment.devDependencies,
      "development dependency"
    );
    mergeStringMap(
      peerDependencies,
      fragment.peerDependencies,
      "peer dependency"
    );
  }

  if (!hasFragment) {
    return undefined;
  }

  if (scripts.size > 0) {
    fields.set("scripts", sortObject(scripts));
  }

  if (dependencies.size > 0) {
    fields.set("dependencies", sortObject(dependencies));
  }

  if (devDependencies.size > 0) {
    fields.set("devDependencies", sortObject(devDependencies));
  }

  if (peerDependencies.size > 0) {
    fields.set("peerDependencies", sortObject(peerDependencies));
  }

  const substituted = substituteJsonValue(orderTopLevelFields(fields), options);

  return `${JSON.stringify(substituted, null, 2)}\n`;
};
