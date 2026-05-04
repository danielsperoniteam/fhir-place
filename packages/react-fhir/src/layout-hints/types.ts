/**
 * Tier-1 layout hint grammar.
 *
 * A `LayoutHint` is a *data-only* description of how a single FHIR resource
 * type should be displayed in list / detail / create surfaces. The renderer
 * (`<HintedDetail>` and friends) walks the hint and composes generic atoms
 * (`<Hero>`, `<Section>`, etc.) — the hint never contains JSX or closures, so
 * it can be JSON-serialized and shipped from a server later (see #223).
 *
 * The schema is deliberately small: a Tier 1 resource should fit in ~30 lines
 * of declaration. If a definition starts to bloat, the schema is wrong; push
 * back rather than extending the grammar.
 *
 * Tier model
 * ----------
 * - **Tier 0** — no hint registered. Renderers fall back to the generic
 *   StructureDefinition walker (`<ResourceView>`).
 * - **Tier 1** — has a `LayoutHint`. The renderer composes atoms based on
 *   declared sections / fields.
 * - **Tier 2** — has a `LayoutHint` *and* a custom React view registered in
 *   a bespoke-view map (Patient header, Observation sparkline, etc.). This
 *   schema does not model the bespoke registry — that lives in the renderer
 *   layer to keep the data layer JSON-serializable.
 */

/**
 * A FHIR field path, e.g. `code`, `subject.reference`, `period.start`. Paths
 * resolve against the resource's JSON shape (not FHIRPath); arrays auto-pick
 * the first item, mirroring `getByPath` in `ResourceTable`. Choice-type
 * suffixes like `value[x]` are honoured.
 */
export type FieldPath = string;

/** Tone for status-like fields. Maps to existing demo CSS variables. */
export type Tone = "success" | "warn" | "danger" | "neutral";

/** List-view shape: drives the resource browser table / list. */
export interface ListHint {
  /** FHIR field paths shown as columns. */
  columns: FieldPath[];
  /** Primary display field for the row (single-line title in card mode). */
  title: FieldPath;
  /** Optional secondary line of text under the title. */
  subtitle?: FieldPath;
  /** Status pill mapping. The `field` value is looked up in `map`. */
  tone?: { field: FieldPath; map: Record<string, Tone> };
  /** Default sort. */
  sortBy?: FieldPath;
}

/** Detail-view shape: drives the single-resource page. */
export interface DetailHint {
  /** Fields rendered as the hero row at the top of the detail page. */
  hero: FieldPath[];
  /** Sectioned key/value blocks below the hero. */
  sections: ReadonlyArray<DetailSection>;
  /**
   * FHIR search expressions for related resources, evaluated by the renderer.
   * Tokens of the form `{patient}`, `{id}` are substituted from the current
   * resource. Reserved for future use; renderers ignore unknown tokens.
   */
  related?: string[];
  /**
   * Per-backbone-element collection hints. Keys are field paths to backbone
   * arrays (e.g. `reaction`, `target`). Drives `<BackboneCollection>` once
   * #251 lands.
   */
  collections?: Record<string, BackboneCollectionHint>;
}

export interface DetailSection {
  /** Section heading. */
  title: string;
  /** Field paths rendered as a label/value list inside the section. */
  fields: FieldPath[];
}

/** Create-view shape: drives the POST form. */
export interface CreateHint {
  /** Section grouping for the form. Defaults to `detail.sections`. */
  sections?: ReadonlyArray<DetailSection>;
  /** Field paths the create form should not surface. */
  hidden?: FieldPath[];
}

/** Search builder hints. Kept narrow — owned by the search builder ticket. */
export interface SearchHint {
  /** Search params surfaced first by the search UI. */
  priorityParams: string[];
}

/** Tier 1 layout hint for a single resource type. All sections are optional. */
export interface LayoutHint {
  list?: ListHint;
  detail?: DetailHint;
  create?: CreateHint;
  search?: SearchHint;
}

/** Backbone collection rendering hint (consumed by `<BackboneCollection>`). */
export interface BackboneCollectionHint {
  mode: "cards" | "table" | "tree";
  sortBy?: FieldPath;
  /** Column paths when `mode === "table"`. */
  columns?: FieldPath[];
  /** Title field path when `mode === "cards"`. */
  cardTitle?: FieldPath;
}

/** A resource's tier within the design system. */
export type Tier = 0 | 1 | 2;
