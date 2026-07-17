# Making fhir-place a blockbuster in the FHIR community

> A read on the current roadmap + issues, and a concrete plan to turn a solid
> alpha into the default way people build FHIR UIs.
>
> Written 2026-07-14. Not an ADR — a strategy memo. Where it proposes work,
> that work still goes through GitHub Issues per
> [ADR 0001](../decisions/0001-use-github-issues-as-source-of-truth.md).
> Where it proposes positioning, [ADR 0004](../decisions/0004-positioning.md)
> and [ADR 0005](../decisions/0005-competitive-analysis-response.md) are the
> authorities and this memo defers to them.

---

## TL;DR

The engineering is already good. The product is not yet *legible* — a
first-time visitor can't tell what fhir-place is in 15 seconds, the library
isn't installable from npm yet, and the one differentiator no competitor has
(spec-driven + agent-native) isn't the thing people see first.

**The blockbuster thesis:** be *"the Stripe-quality, backend-agnostic UI kit
for FHIR"* — the library a developer reaches for on day one against **any** R4
server, and the first FHIR UI stack that is **agent-native by construction**.
Win by removing adoption friction (ship to npm, make the demo self-explaining),
earning trust the way the FHIR community grants it (Inferno (g)(10), interop
matrix, connectathons, Zulip), and owning the AI-on-FHIR lane before anyone
else productizes it safely.

The three highest-leverage moves, in order:

1. **Publish `@fhir-place/react-fhir` to npm** ([#318](https://github.com/danielsperoniteam/fhir-place/issues/318)) — nothing else matters if people can't `pnpm add` it.
2. **Make the hosted demo explain itself and stop throwing red** ([#500](https://github.com/danielsperoniteam/fhir-place/issues/500) P0s: intro banner + terminology CORS [#558](https://github.com/danielsperoniteam/fhir-place/issues/558)).
3. **Ship the agent-native story as a headline, not a footnote** (MCP [#128], agent-tools [#268], Zod-from-SD [#124]).

---

## Where the project stands today

### What's genuinely strong (keep it, and lead with it)

- **A spec-driven engine that actually works.** UI derives from
  `StructureDefinition` / `SearchParameter` / `CapabilityStatement` — no
  per-resource-type UI code, no vendor SDK in the critical path. This is the
  real moat, and it demonstrably renders/edits/searches arbitrary R4 resources.
- **Backend-agnostic and headless.** Runs against public HAPI, docker HAPI,
  Medplum, Aidbox, or fully offline via MSW. Tailwind + unstyled primitives,
  escape hatches (`renderers` / `inputs` / `client.request()`) everywhere.
- **Real test rigor for an alpha.** 483 unit tests, Playwright e2e +
  screenshots as the UAT gate, a nightly live-HAPI integration suite. Honest
  status disclosure ("early alpha, R4 first, MIT").
- **Details competitors don't have.** Per-patient resource-count chips
  (`Cond 15 · Meds 5 · Obs 139`), the "HTTP request: GET · 1 param" preview on
  every search, a multi-server Settings screen with auth modes and custom
  headers, `⌘K`, tabs, split view. The Settings screen alone is the thing that
  would *sell* the library — and it's buried two clicks deep.
- **A clean four-layer architecture** (`client → structure → hooks →
  components`) with stable subpath exports and a documented public API.

### What's holding it back

- **Not on npm yet.** [#318](https://github.com/danielsperoniteam/fhir-place/issues/318)
  is `high`/open. The README says "0.1.0 published" but the pipeline needs the
  `NPM_TOKEN` secret wired. Until this lands, every "check it out" ends at a
  git clone. This is the single biggest adoption tax.
- **The demo doesn't say what it is.** All three persona agents in
  [#500](https://github.com/danielsperoniteam/fhir-place/issues/500) bounced on
  the same thing: `#/fhir-ui` drops you into a Patient grid with no tagline, no
  "what/who for," no Docs or GitHub link. FHIR-literate visitors poke; everyone
  else leaves.
- **The live demo throws a wall of red.** `tx.fhir.org` returns a malformed
  CORS header ([#558](https://github.com/danielsperoniteam/fhir-place/issues/558)),
  so every clinical page floods the console with 20+ failures. An evaluator's
  first "can I trust this?" move is to open devtools — and sees our demo on
  fire. Plus mojibake patient names ([#546](https://github.com/danielsperoniteam/fhir-place/issues/546))
  and empty-Patient creation ([#588](https://github.com/danielsperoniteam/fhir-place/issues/588)).
- **The flagship surfaces intimidate instead of delight.** Patient detail leads
  with a UUID and a wall of extension JSON; generated forms dump the full
  StructureDefinition with the narrative field first and no required-field
  marking (both in [#500](https://github.com/danielsperoniteam/fhir-place/issues/500)).
- **The AI story is invisible and half-broken in public.** The hero "Search in
  plain English" box errors immediately without an API key. The genuinely
  novel bets — `@fhir-place/mcp` and `@fhir-place/agent-tools`
  ([#268](https://github.com/danielsperoniteam/fhir-place/issues/268)) — are
  roadmap items, not anything a visitor experiences.

### How the roadmap looks as a whole

Roughly ~50 open issues. The distribution is telling:

| Signal | Read |
| --- | --- |
| ~32 `feature`, ~12 `bug`, mostly `medium` priority | Healthy build-vs-fix balance; not drowning in bugs. |
| 29 issues in `area: fhir-explorer`, 18 in `area: react-fhir` | Demo-app polish and library depth are both active fronts. |
| Two epics ([#245] redesign, [#500] demo readiness) | Direction exists and is written down — good. |
| 15 `status: needs-human`, 12 `origin: bot-filed` | An agent SDLC is filing real work; humans are the bottleneck on triage/decisions. |
| Cluster of `high` clinical-safety issues ([#459–#463]) | Safety is being treated as a feature, not an afterthought — a credibility asset. |
| Recent merges (#465 UCUM, #609 pagination, #591 tabs, #557 server-config) | Momentum is real; the [#245] redesign and [#500] fixes are landing. |

**The concern isn't the backlog — it's sequencing.** A lot of energy is going
into deep Explorer-redesign polish ([#245] sub-issues: BackboneCollection,
reverse-refs panel, timeline, reference graph) while the *front door* — npm
publish and the self-explaining demo — isn't finished. Polish behind an
unopened door doesn't compound. **Front door first, then the rooms.**

---

## The blockbuster thesis

> **fhir-place is the backend-agnostic, spec-driven, agent-native UI kit for
> FHIR — the fastest way to ship a trustworthy FHIR interface against any R4
> server, and the first one built to be driven by an LLM safely.**

Three defensible wedges, none of which the incumbents own together:

1. **"Any server" is a real promise here.** `@medplum/react` is best on
   Medplum; `@bonfhir/mantine` locks you into Mantine; `1uphealth/fhir-react`
   is display-only. fhir-place is the one that's genuinely headless *and*
   server-agnostic *and* spec-driven at once. Lean into it hard.
2. **Spec-driven means zero per-resource code.** New resource types, profiles,
   and extensions light up from the metamodel. This is the "it just works
   against the server you already have" story that makes a developer's first
   hour magical.
3. **Agent-native by construction.** The same spec-driven type system that
   powers the UI is exactly what an LLM needs: Zod-from-`StructureDefinition`
   ([#124]), typed tool surfaces, an MCP server ([#128]), and a threat-modeled
   WebMCP prototype ([#268]). No competitor has shipped this responsibly. This
   is the lane to own.

**Tagline candidates:** *"FHIR UI for any server."* · *"The spec-driven FHIR
toolkit."* · *"Build a FHIR app in an afternoon — against the server you already
have."*

---

## Five pillars to get there

### Pillar 1 — Remove adoption friction (the front door)

You can't go viral if people can't install you or understand you in 15 seconds.

- **Publish to npm and prove the install path.** Land
  [#318](https://github.com/danielsperoniteam/fhir-place/issues/318). Then add a
  one-command "hello FHIR" so the README's quick-start is copy-paste-run.
  Consider a `create-fhir-app` / StackBlitz template so the first experience is
  a running app, not a clone.
- **Make the demo self-explaining** ([#500](https://github.com/danielsperoniteam/fhir-place/issues/500)
  P0 #1). Slim landing banner: one sentence on what it is, 2–3 "why" bullets
  (spec-driven, any FHIR server, MIT), a visible **Docs** and **GitHub** link,
  and a "switch server" affordance. This is called out as the single
  highest-leverage change and it is.
- **Kill the red.** Fix terminology CORS
  ([#558](https://github.com/danielsperoniteam/fhir-place/issues/558)) — proxy
  or default to a CORS-clean tx server, and never `console.error` on an
  expected-unavailable enrichment. A clean console is a trust signal.
- **A real docs site, not the raw README behind an unlabeled icon.** A
  quickstart, an API reference, a "build your own FHIR app" recipe, and a live
  component gallery. Docs quality is *the* adoption multiplier for a dev
  library.

**Success looks like:** a stranger goes from "never heard of it" → `pnpm add` →
a working patient list against their own server in under 30 minutes, without
talking to anyone.

### Pillar 2 — Earn FHIR-community credibility (the way this community grants it)

The FHIR world trusts conformance, interop proof, and showing up — not
marketing.

- **Inferno (g)(10) CI badge** ([#127](https://github.com/danielsperoniteam/fhir-place/issues/127)).
  A green ONC-conformance badge on the README is worth more than any pitch to
  this audience.
- **Interop demo matrix** ([#125](https://github.com/danielsperoniteam/fhir-place/issues/125)):
  the same app, live, against HAPI + Medplum + Aidbox (+ HealthLake). Proof,
  not a claim, that "any server" is real.
- **Show up in the community.** Execute the outreach tracker
  ([#272](https://github.com/danielsperoniteam/fhir-place/issues/272)): reply to
  the chat.fhir.org `#implementers > FHIR Browser` thread with a demo link, DM
  Jason Fang (collaborate-or-compete before both sides reinvent each other),
  read the Aidbox WebMCP surface. Then **go to a HL7 FHIR Connectathon** — a
  demo table and a track participation is the highest-bandwidth credibility
  event in this ecosystem.
- **US Core fluency.** Decode known extensions by URL (race/ethnicity —
  [#371](https://github.com/danielsperoniteam/fhir-place/issues/371)),
  profile-aware `ResourceView` with must-support flagging
  ([#370](https://github.com/danielsperoniteam/fhir-place/issues/370)). US Core
  is the lingua franca; speaking it fluently signals "these people get it."

### Pillar 3 — Own the AI-on-FHIR lane (the differentiator)

This is where fhir-place can be *the* name, because the field is wide open and
everyone else is doing it unsafely or not at all.

- **Sequence server-first, per [ADR 0005](../decisions/0005-competitive-analysis-response.md#2-mcp--split-into-two-packages-sequence-server-first).**
  Ship `@fhir-place/mcp` ([#128]) — read/search/edit/validate/runCql as typed
  tools composing cleanly with SMART scopes and bearer auth.
- **Then the WebMCP prototype** ([#268]) — read-only, behind
  `enableAgentTools`, default off, with a *published threat model* (token
  exfiltration via rendered narrative, confused-deputy writes at machine speed,
  BAA boundaries, agent-vs-user `AuditEvent` attribution). Shipping the *threat
  model* publicly is itself a differentiator — it says "we're the adults in the
  room on agents + PHI."
- **Zod-from-`StructureDefinition`** ([#124]) is the keystone: it's the offline
  validation inner loop *and* the type contract an LLM tool surface needs. One
  primitive, two payoffs.
- **Fix the public AI first impression.** The dead "Search in plain English"
  box ([#500] P1 #4) should degrade to an "Enable AI search →" affordance, or
  proxy a rate-limited demo key — not error red on the headline feature.

### Pillar 4 — Clinical safety as a marketed feature

The safety guardrail cluster ([#459](https://github.com/danielsperoniteam/fhir-place/issues/459)–[#463](https://github.com/danielsperoniteam/fhir-place/issues/463):
block save on missing patient reference, spell out unsafe dose-unit
abbreviations, keep AllergyIntolerance criticality visible, warn on
patient-context change mid-edit) is a genuine asset — *market it*.

- Bundle these into a documented **"safe-by-default" story** in the README and
  docs. "The FHIR editor that won't let you silently create a Patient with no
  name ([#588]) or abbreviate a dose unit" is a headline clinicians and
  clinical-informaticists repeat for you.
- Keep the honest framing from [ADR 0005](../decisions/0005-competitive-analysis-response.md#6-editor-safety-guardrails--profile-independent):
  "developer-tool warnings, not clinical decision support." That honesty is
  itself credibility.

### Pillar 5 — Nail the demo as a growth funnel, not a toy

The hosted demo is the top of every funnel — treat it like a product.

- **Restructure Patient detail** ([#500] P1 #3): compact header card (name,
  sex, DOB, age, ID) → clinical-data section → collapsible raw JSON. Leading
  with a UUID reads as "dev tool," and wrong-patient risk is a real liability.
- **"Common fields" default on forms** ([#500] P1 #5) with "Show all fields,"
  required-field marking, and inline `OperationOutcome` validation.
- **Curated entry point** ([#500] P2): a "Featured patients / Start here" list
  of pinned known-good IDs so a shared link shows the same thing the sharer
  saw. A connectathon attendee *will* POST garbage into a shared sandbox — a
  read-only mode or "public sandbox — writes get wiped" banner is worth the
  effort. Ideally, a demo backend we control (this single move fixes CORS, the
  count round-trips, and sandbox churn at once — the decision [#500] asks
  Daniel for).
- Finish the [#245] Explorer redesign polish (timeline, reverse-refs,
  reference graph) *after* the front door is open — it compounds a funnel that
  people are actually entering.

---

## Sequenced plan

### Now (next 2–4 weeks) — open the front door

1. `@fhir-place/react-fhir` on npm ([#318]) + verified copy-paste quickstart.
2. Demo landing banner + Docs/GitHub links ([#500] P0 #1).
3. Terminology CORS fixed / clean console ([#558]); mojibake ([#546]) and
   empty-Patient ([#588]) fixed.
4. A minimal docs site (quickstart + API ref + one recipe).

### Next (1–2 months) — earn trust + first-hour delight

5. Inferno (g)(10) badge ([#127]) + interop matrix ([#125]).
6. Patient-detail header card + "common fields" forms ([#500] P1).
7. Curated demo patients / decision on a controlled demo backend.
8. Ship `@fhir-place/mcp` read/search/validate ([#128]); fix the public AI box.
9. Execute outreach ([#272]); target the next Connectathon.

### Later (quarter+) — widen the moat

10. WebMCP read-only prototype + published threat model ([#268]).
11. Zod-from-SD ([#124]) as the shared validation + agent-typing keystone.
12. Profile-aware Viewer/US-Core extension decoding ([#370], [#371]).
13. Complete the [#245] Explorer redesign; `@fhir-place/bundle` composer ([#270]).
14. Version-history + provenance tabs ([ADR 0005 §4](../decisions/0005-competitive-analysis-response.md#4-provenance-auditevent-and-version-history-are-three-different-things)).

---

## How we'll know it's working

| Metric | Why it matters |
| --- | --- |
| npm weekly downloads of `@fhir-place/react-fhir` | The single truest adoption signal for a library. |
| GitHub stars + non-bot issue/PR authors | Community forming vs. a solo project. |
| Time-to-first-working-app for a new dev (target < 30 min) | Measures whether the front door actually opens. |
| Green Inferno (g)(10) badge + N servers in the interop matrix | Conformance proof this community respects. |
| Connectathon participation + inbound Zulip mentions | Presence where FHIR reputations are made. |
| MCP package installs / "Ask AI" telemetry | Validates the agent-native bet (per [ADR 0005] open questions). |

---

## Risks & honest caveats

- **Naming/SEO.** "fhir-place" collides with Zus FHIRplace and Drummond's
  FHIRplace Pilot. [ADR 0004/0005](../decisions/0005-competitive-analysis-response.md#1-naming--adr-0004-holds)
  hold "do not rename" for good distribution reasons — but keep the disambiguation
  line and re-evaluate on the documented triggers (trademark filing, C&D, a
  competitor outranking us for `fhir-place npm`).
- **Agent + PHI is a real liability, not a demo trick.** The [ADR 0005]
  discipline (read-only default, threat model first, no writable agent loop in
  the public demo) is what keeps the AI bet an asset instead of a lawsuit.
  Don't shortcut it for a flashy demo.
- **Human-triage bottleneck.** 15 `needs-human` issues and bot-filed volume
  mean the constraint is decision throughput, not code throughput. The plan
  above is deliberately ordered so a human only has to make a few high-leverage
  calls (publish, demo backend, connectathon) rather than triage everything.
- **Scope creep vs. the wedge.** Every "just add SMART v2 / R5 / Subscriptions"
  temptation dilutes the "any R4 server, spec-driven, headless" promise before
  it's won. Stay deferred until the front door compounds (per README roadmap).

---

## The one-paragraph pitch (for when someone asks)

> fhir-place is a spec-driven, backend-agnostic React toolkit for FHIR: the UI
> derives from `StructureDefinition`, `SearchParameter`, and
> `CapabilityStatement`, so it renders, searches, and edits any resource against
> any R4 server — HAPI, Medplum, Aidbox, HealthLake — with no vendor SDK and no
> per-resource code. It's headless (bring your own styles), safe by default
> (sanitized narrative, clinical guardrails on the editor), and it's the first
> FHIR UI stack built to be driven by an LLM safely, via typed tool surfaces and
> an MCP server. MIT, on npm, `pnpm add @fhir-place/react-fhir`.
