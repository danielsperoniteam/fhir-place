# add-failure-gallery proposal

## Why

Phase A safety behavior is tested in eval fixtures, but a reviewer currently has
no in-app page that quickly demonstrates blocked/refused/partial outcomes.

## What changes

- Add a Failure Gallery page at `/failure-gallery` in the workbench UI.
- Include four safety cases from the Phase A eval harness:
  - `no-allergy-data`
  - `missing-labs`
  - `prompt-injection`
  - `permission-violation`
- Link the gallery content to the eval fixture source and eval docs.

## Out of scope

- Running evals directly in the browser.
- New agent capabilities beyond Phase A safety/read-only constraints.
