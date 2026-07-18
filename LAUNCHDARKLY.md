# LaunchDarkly

Permanent reference for LaunchDarkly setup in this repo. The companion ADR at [`docs/decisions/0006-feature-flagging.md`](docs/decisions/0006-feature-flagging.md) covers **when** to use a flag; this doc covers **how** the wires are set up.

## SDK Details

- **Server-side (Node):** `@launchdarkly/node-server-sdk`. Used today only by `scripts/ld-smoke.mjs` to validate the credential pipeline. Will be the SDK of choice for any future Node-side flag check (e.g. flag-gating CI workflow steps or SDLC orchestration code).
- **Client-side (browser):** not yet installed. When the first runtime UI flag lands, install `launchdarkly-react-client-sdk` in `apps/demo` and wrap the React tree with `asyncWithLDProvider`. Pattern lives in the ADR.

## Configuration

| Variable | Used by | Source |
|---|---|---|
| `LAUNCHDARKLY_SDK_KEY` | Server-side SDK + `pnpm ld:smoke` | GH Actions secret (production environment SDK key) |
| `VITE_LAUNCHDARKLY_CLIENT_SIDE_ID` | (future) `apps/demo` build | GH Actions secret, exposed at build time as `VITE_*` so it ships in the browser bundle |

Local dev: copy `.env.example.launchdarkly` to a gitignored `.env.local` (or `apps/demo/.env.local`) and fill in the values.

CI builds: set the secrets in repo Settings → Secrets and variables → Actions, then expose them at the relevant workflow step:

```yaml
env:
  LAUNCHDARKLY_SDK_KEY: ${{ secrets.LAUNCHDARKLY_SDK_KEY }}
  VITE_LAUNCHDARKLY_CLIENT_SIDE_ID: ${{ secrets.LAUNCHDARKLY_CLIENT_SIDE_ID }}
```

**Never commit a key** — server SDK keys grant full read+write access to flag data; client-side IDs are public by design but still belong in CI vars, not source.

## Where to Find Things

| What | Where |
|---|---|
| Project flags list | `https://app.launchdarkly.com/projects/fhir-place/flags` |
| Production env SDK key | `https://app.launchdarkly.com/projects/fhir-place/settings/environments/production/keys` |
| Test env SDK key | `https://app.launchdarkly.com/projects/fhir-place/settings/environments/test/keys` |
| All projects | `https://app.launchdarkly.com/projects` |

(Project key is `fhir-place` once Daniel creates it; URLs above already use that.)

## How Feature Flags Work — today

Run the smoke test to verify the pipeline:

```bash
export LAUNCHDARKLY_SDK_KEY=sdk-xxxxx        # from LD dashboard, prod env
pnpm ld:smoke
```

Expected output:

```
✓ LaunchDarkly client initialized
  flag "smoke-test" → false
  (returned fallback "false" — either the flag is off, doesn't exist yet, ...)
```

The script reads `LAUNCHDARKLY_SDK_KEY` from the env, initializes the Node Server SDK, evaluates the `smoke-test` boolean flag against an anonymous context, and exits. If the env var isn't set, the script skips cleanly with exit code 0 — so CI passes whether the secret is wired or not.

## How Feature Flags Work — future (runtime in apps/demo)

When the first UI flag lands, the wiring will be:

```tsx
// apps/demo/src/main.tsx
import { asyncWithLDProvider } from "launchdarkly-react-client-sdk";

const ldClientSideID = import.meta.env.VITE_LAUNCHDARKLY_CLIENT_SIDE_ID;
const FlagsProvider = ldClientSideID
  ? await asyncWithLDProvider({
      clientSideID: ldClientSideID,
      context: { kind: "user", key: "anonymous", anonymous: true },
    })
  : ({ children }) => <>{children}</>;        // graceful fallback when key absent

ReactDOM.createRoot(document.getElementById("root")!).render(
  <FlagsProvider>
    {/* existing provider tree */}
  </FlagsProvider>,
);
```

Then in components: `const flags = useFlags(); if (flags["demo-experimental-tab"]) { ... }`. See the ADR for naming conventions (`<area>-<short-name>`).

## Next Steps / Advanced Capabilities

- **Targeting rules** — start every flag with a single rule targeting Daniel's email, default-off for everyone else. Roll out by adding cohorts.
- **Percentage rollouts** — for risky changes, dial from 0 → 10 → 50 → 100 over hours/days.
- **Experimentation** — A/B testing tied to flags. Out of scope until we have analytics infrastructure.
- **AI Configs** — LD's AI prompt-management product. Useful when we have multiple LLM-driven flows that need governed prompts. Not today.
- **Guarded Rollouts** — automatic rollback based on metric drops. Worth setting up once we have Sentry-tied error budgets.
- **Observability** — pipe LD flag-evaluation events to your observability stack so you can debug "why did this user see X?" Defer until we have a real flag in production.

## AI Agent Integration

The hosted **LaunchDarkly MCP server** is registered at the project level via [`.mcp.json`](.mcp.json):

```json
{
  "mcpServers": {
    "LaunchDarkly feature management": {
      "type": "http",
      "url": "https://mcp.launchdarkly.com/mcp/fm"
    }
  }
}
```

How to enable it for your Claude Code session:

1. Restart Claude Code in this repo (close and reopen the window/CLI).
2. The first time an agent calls an LD MCP tool (e.g. `list-feature-flags`), Claude Code will prompt for OAuth — sign in with your LD account.
3. After that, agents can list/create/toggle flags via MCP tools without an API token.

Once MCP is live, the engineer subagent (`.claude/agents/engineer.md`) and dispatcher (`docs/prompts/hourly-engineer-dispatch.md`) follow the policy in the [ADR](docs/decisions/0006-feature-flagging.md) — they read the issue's `flag:` label, decide whether to wrap the change, and surface the rollout plan in the PR body.

## Onboarding skill

The `launchdarkly/agent-skills` `onboarding` skill is committed at `.agents/skills/onboarding/` and symlinked into `.claude/skills/onboarding`. Future agents (or a re-run of this skill) can pick it up without re-installing.
