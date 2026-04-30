# Requirements — `add-agent-tool-registry`

## Functional

- F1. The DB has an `agent_session(id, connection_id, patient_id,
  created_at, updated_at)` table referencing `data_connection(id)` with
  cascade delete.
- F2. `POST /api/sessions` creates a session given `(connectionId,
  patientId)`. `patientId` is validated against the FHIR R4 `id` regex.
- F3. `POST /api/sessions/:sid/tools/:toolName` runs `toolName` against
  the session's connection. The body is the typed tool input. The
  response is a `ToolEnvelope`.
- F4. `GET /api/sessions/tools` returns the list of registered tools
  with their metadata (name, version, description, resource allow-list,
  result limit, timeout).
- F5. The Phase A registry contains exactly:
  - `getPatient`
  - `searchConditionsForPatient`
  - `searchMedicationRequestsForPatient`
  - `searchAllergyIntolerancesForPatient`
  - `searchEncountersForPatient`
  - `searchObservationsForPatient`
- F6. Each tool's input is a Zod schema with `patientId` required.
  Search tools accept an optional `limit` (1–50, default 20).
- F7. Tools that accept `dateRange` validate `from` / `to` as
  `YYYY-MM-DD` and forward them as `date=geFROM&date=leTO` query
  repeats.

## Non-functional

- N1. Tools never call `fetch` directly. The shared helpers route every
  call through `proxySearch` / `proxyRead`.
- N2. The connection's `authToken` is never returned in any envelope.
  Verified by a route test.
- N3. Tools cannot mutate the upstream FHIR server. There is no PUT /
  POST / DELETE path through the tool layer.
- N4. The runner is the single chokepoint for: input validation, patient
  scope, timeout, truncation, error normalization, and logging.
- N5. The runner attaches an `AbortSignal` to every fetch. Timeouts come
  back as `reason: "timeout"`, never as a stack trace.
- N6. Logger errors are caught; they cannot break tool execution.

## Tests

- T1. Registry runner:
  - returns `unknown_tool` for an unregistered name;
  - returns `invalid_input` with structured Zod issues for bad input;
  - returns `unauthorized_patient` when input.patientId ≠
    session.patientId;
  - returns `ok` envelope with `durationMs` on the happy path;
  - logs every call (ok and error);
  - times out and returns `reason: "timeout"`;
  - truncates array data above `resultLimit` and sets `truncated: true`;
  - rejects duplicate tool names at construction;
  - propagates `upstream_error` from `execute`;
  - returns `internal_error` on non-Abort thrown errors;
  - never breaks when the logger throws.
- T2. Per tool:
  - `getPatient` reads `/Patient/:id` and returns the resource.
  - `searchConditionsForPatient` forwards `patient` + `clinical-status`,
    rejects an unknown `clinicalStatus`, returns `[]` cleanly when no
    entries.
  - `searchMedicationRequestsForPatient` forwards `status`, rejects
    unsupported status.
  - `searchAllergyIntolerancesForPatient` returns `[]` when none exist;
    the tool docstring says this MUST NOT be summarised as "no known
    allergies" upstream of this tool.
  - `searchEncountersForPatient` forwards `dateRange` as `date=ge…` and
    `date=le…` query repeats; rejects malformed dates.
  - `searchObservationsForPatient` forwards `category` + `dateRange`;
    rejects unsupported categories.
- T3. Routes:
  - `POST /api/sessions` returns 201 with the row and 400 / 404 for
    invalid id / unknown connection.
  - `POST /api/sessions/:sid/tools/:toolName` maps envelope reason to
    HTTP status (200 / 400 / 403 / 404 / 502 / 504).
  - The in-memory logger captures every invocation with the patient id
    and session id.
  - The auth token never appears in any envelope.

## Documentation

- D1. `docs/fhir-tools.md` documents the hard rules, the six tools, the
  HTTP API, the envelope shape, the file layout, and the Phase A icebox.
- D2. The PR description points reviewers to `docs/fhir-tools.md` and
  references the OpenSpec change.
