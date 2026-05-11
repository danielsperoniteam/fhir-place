/**
 * Task registry. Adding a new task: import it here, append to `ALL_TASKS`.
 *
 * Phase-1 set covers four buckets of user goals (resource discovery, search
 * & filter, reference traversal, detail comprehension). CRUD and adversarial
 * edge-case tasks are deferred until the Phase-2 judge pass lands so we can
 * triage their false-positive rate.
 */

import type { TaskDef } from "../agent/types.js";

import { findAllergies } from "./find-allergies.js";
import { countActiveConditions } from "./count-active-conditions.js";
import { recentObservationsSort } from "./recent-observations-sort.js";
import { patientSearchByName } from "./patient-search-by-name.js";
import { fieldPickerToggleColumns } from "./field-picker-toggle-columns.js";
import { urlSyncSurvivesReload } from "./url-sync-survives-reload.js";
import { medicationRequestToSubject } from "./medication-request-to-subject.js";
import { codedValueHumanReadable } from "./coded-value-human-readable.js";
import { narrativeRendersSanitized } from "./narrative-renders-sanitized.js";

export const ALL_TASKS: ReadonlyArray<TaskDef> = [
  findAllergies,
  countActiveConditions,
  recentObservationsSort,
  patientSearchByName,
  fieldPickerToggleColumns,
  urlSyncSurvivesReload,
  medicationRequestToSubject,
  codedValueHumanReadable,
  narrativeRendersSanitized,
];

export const TASKS_BY_ID: Record<string, TaskDef> = Object.fromEntries(
  ALL_TASKS.map((t) => [t.id, t]),
);
