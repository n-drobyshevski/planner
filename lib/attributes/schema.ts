// Optimization-attribute registry. Events and tasks carry a jsonb `attributes`
// bag; this module is the single source of truth for which keys exist, how
// they validate, and how the UI renders them. Adding a key = extend
// ATTRIBUTE_KEYS / KnownAttributes / valueSchemas / ATTRIBUTE_META — no
// migration, no per-form work (AttributeFields renders from the metadata).
//
// Read/write asymmetry, on purpose:
// - READ (parseAttributes): lenient — junk values drop only the broken key;
//   unknown keys (written by newer clients) always survive.
// - WRITE (itemAttributesSchema): strict on known keys (our UI can't produce
//   invalid values), unknown keys pass through untouched — so an edit
//   round-trip never destroys a future client's data.
import { z } from "zod";

export const ATTRIBUTE_KEYS = [
  "energy",
  "flexibility",
  "focus",
  "satisfaction",
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

// Hand-written (not z.infer) so lib/types.ts can `import type` without pulling
// a runtime zod dependency into every type consumer.
export interface KnownAttributes {
  /** How demanding the item is. */
  energy?: 1 | 2 | 3;
  /** How movable it is when a day overloads. */
  flexibility?: "fixed" | "movable" | "flexible";
  /** Concentration mode the item needs. */
  focus?: "deep" | "shallow";
  /** Retrospective 1–5 rating. */
  satisfaction?: 1 | 2 | 3 | 4 | 5;
}
export type ItemAttributes = KnownAttributes & { [key: string]: unknown };

const valueSchemas = {
  energy: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  flexibility: z.enum(["fixed", "movable", "flexible"]),
  focus: z.enum(["deep", "shallow"]),
  satisfaction: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
} satisfies Record<AttributeKey, z.ZodType>;

/** Write-side schema: known keys validated, unknown keys preserved. */
export const itemAttributesSchema = z.looseObject({
  energy: valueSchemas.energy.optional(),
  flexibility: valueSchemas.flexibility.optional(),
  focus: valueSchemas.focus.optional(),
  satisfaction: valueSchemas.satisfaction.optional(),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lenient READ: non-object → {}; invalid known keys dropped; unknown keys kept. */
export function parseAttributes(value: unknown): ItemAttributes {
  if (!isPlainObject(value)) return {};
  const out: Record<string, unknown> = { ...value };
  for (const key of ATTRIBUTE_KEYS) {
    if (!(key in out)) continue;
    if (!valueSchemas[key].safeParse(out[key]).success) delete out[key];
  }
  return out as ItemAttributes;
}

/**
 * Immutable set/clear. `undefined` deletes the key (clear = absent, never
 * null). The spread keeps unknown keys, which is what makes dialog edit
 * round-trips safe for future clients.
 */
export function setAttribute<K extends AttributeKey>(
  attrs: ItemAttributes,
  key: K,
  value: KnownAttributes[K] | undefined,
): ItemAttributes {
  const next: ItemAttributes = { ...attrs };
  if (value === undefined) delete next[key];
  else (next as Record<string, unknown>)[key] = value;
  return next;
}

/** Any KNOWN key set (drives dialog auto-expand and the coverage stat). */
export function hasAnyAttribute(attrs: ItemAttributes): boolean {
  return ATTRIBUTE_KEYS.some((key) => attrs[key] !== undefined);
}

/** Equality over known keys only (dialog change detection). */
export function attributesEqual(a: ItemAttributes, b: ItemAttributes): boolean {
  return ATTRIBUTE_KEYS.every((key) => a[key] === b[key]);
}

export interface AttributeOption {
  /** String form fed to ToggleGroup; `String(typed value)`. */
  value: string;
  label: string;
}

export interface AttributeMeta {
  key: AttributeKey;
  label: string;
  /** One calm sentence shown as the field description. */
  description: string;
  options: AttributeOption[];
  /** Decode a ToggleGroup string back into the typed value. */
  decode: (raw: string) => KnownAttributes[AttributeKey];
}

export const ATTRIBUTE_META: AttributeMeta[] = [
  {
    key: "energy",
    label: "Energy",
    description: "How demanding this is.",
    options: [
      { value: "1", label: "1 Low" },
      { value: "2", label: "2 Medium" },
      { value: "3", label: "3 High" },
    ],
    decode: (raw) => Number(raw) as 1 | 2 | 3,
  },
  {
    key: "flexibility",
    label: "Flexibility",
    description: "How movable this is if a day fills up.",
    options: [
      { value: "fixed", label: "Fixed" },
      { value: "movable", label: "Movable" },
      { value: "flexible", label: "Flexible" },
    ],
    decode: (raw) => raw as "fixed" | "movable" | "flexible",
  },
  {
    key: "focus",
    label: "Focus",
    description: "The concentration mode this needs.",
    options: [
      { value: "deep", label: "Deep" },
      { value: "shallow", label: "Shallow" },
    ],
    decode: (raw) => raw as "deep" | "shallow",
  },
  {
    key: "satisfaction",
    label: "Satisfaction",
    description: "How it felt, looking back.",
    options: [
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
    ],
    decode: (raw) => Number(raw) as 1 | 2 | 3 | 4 | 5,
  },
];
