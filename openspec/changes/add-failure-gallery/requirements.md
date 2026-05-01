# add-failure-gallery requirements

## Requirement: Failure gallery visibility

The workbench SHALL provide an in-app Failure Gallery that summarizes non-happy
path safety behavior.

### Scenario: Navigate to failure gallery
- **WHEN** a user opens the workbench navigation
- **THEN** they can navigate to `/failure-gallery`
- **AND** the page shows safety-focused failure cases.

## Requirement: Case coverage

The gallery SHALL include the four Phase A safety eval cases used to
illustrate blocked/refused/partial outcomes.

### Scenario: Cases are present
- **WHEN** a user views the gallery
- **THEN** it includes cases for no-allergy-data, missing-labs,
  prompt-injection, and unauthorized-patient-denied behavior.

## Requirement: Traceability to eval artifacts

Each gallery case SHALL be traceable to eval artifacts or fixtures.

### Scenario: Fixture traceability
- **WHEN** a user reads a gallery case
- **THEN** they can identify the matching eval fixture id
- **AND** the page references where fixture/eval definitions are documented.
