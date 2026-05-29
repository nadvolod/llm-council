# AGENTS.md

This file is the operating contract for any agent or engineer making changes in this repo.

The goal is simple: ship fast, prove correctness, protect production, and save developer time.

If a rule here conflicts with common sense, surface the conflict in the PR instead of pretending not to notice it.

## Core Principles

Optimize for:

1. speed of safe delivery
2. saving developer time
3. high confidence changes
4. fast recovery when something breaks

The human developer's time is scarce and expensive.

Agents and contributors must catch preventable failures before human review:

1. missing checklist items
2. missing required PR sections
3. missing evidence
4. missing required environment variables
5. unrun tests
6. obvious CI failures
7. avoidable lint, typecheck, or build failures
8. broken preview validation when applicable

The human review should be reserved for judgment, not mechanics.

The human should spend review time on:

1. product correctness
2. architectural tradeoffs
3. edge cases
4. operational risk
5. code quality

not on mechanical enforcement failures.

## Universal Rules

These apply to every PR unless the PR is documentation only or explicitly marked as low risk.

1. Never push directly to main.
   Every change goes through a PR.

2. Behavior first PR summary is required.
   Describe what changed in terms of user visible behavior and system contracts.
   Cover UI, API, data shape, permissions, configuration, and operational behavior.

3. Document affected user flows.
   For each changed feature or path, include:
   1. happy path
   2. expected failure paths
   3. empty states
   4. permission and auth cases if relevant
   5. timeout, network, and dependency failure cases if relevant

4. Include evidence.
   UI changes require a screenshot or short recording.
   API or backend changes require CLI output, test output, logs, or equivalent proof.
   Infra or runtime changes require deployment evidence, health checks, or validation output.

5. Review for weakness, not just correctness.
   Identify the top architectural, operational, and testing risks introduced by the change.
   Be explicit and prioritize them.

6. Observability is mandatory for runtime changes.
   If runtime behavior changes, update logging, metrics, and error visibility accordingly.

7. CI must be green before handoff.
   Do not hand off a PR as ready until required checks pass.

8. Address meaningful review feedback.
   Consider feedback from humans and bots.
   Resolve high signal feedback or explain why it was not adopted.

## Risk Tiers

Every PR must declare a risk tier.

### Tier 0: Docs or non runtime changes

Examples:

1. docs
2. comments
3. copy only
4. formatting
5. non executed config

Requirements:

1. behavior summary if applicable
2. evidence if useful
3. no runtime validation required

### Tier 1: Low risk runtime change

Examples:

1. isolated UI fixes
2. non critical refactors
3. small backend logic changes without schema or auth impact

Requirements:

1. unit or integration tests as appropriate
2. evidence
3. observability review if runtime is affected

### Tier 2: Medium risk change

Examples:

1. user facing workflow changes
2. API contract changes
3. database query or path changes
4. feature flags
5. caching
6. background jobs
7. third party integrations

Requirements:

1. integration tests required
2. critical path failure modes documented
3. evidence required
4. observability updates required
5. preview or staged validation if applicable

### Tier 3: High risk, irreversible, or security sensitive change

Examples:

1. auth
2. billing
3. schema migrations
4. permissions
5. destructive data operations
6. infrastructure changes
7. production critical workflow rewrites

Requirements:

1. integration tests required
2. end to end coverage required for affected critical flows
3. rollback or mitigation plan required
4. observability updates required
5. preview or staging validation required
6. explicit architectural risk review required

If unsure, choose the higher tier.

## Testing Policy

The repo should favor tests that give high confidence in real behavior.

### Required test mix

1. Unit tests
   Minimize these!
   Use for pure logic, edge conditions, parsing, validation, and transformations.
   Fast and focused.
   Mocking is allowed here.

2. Integration tests
   Preferred for most business logic.
   Should use real databases and real services.
   Avoid mocking internal boundaries unless there is a strong reason.
   Delete any test data that's created.

3. Contract tests
   Required when integrating with external services whose behavior or schemas matter.
   Prefer provider schemas, sandbox environments, or stable replay fixtures.

4. End to end tests
   Required for critical user journeys.

### Testing rules

1. Do not silently skip important tests because configuration is missing.
2. If a required environment variable is missing, fail with a clear message naming the variable and how to set it.
3. For third party systems, use the most realistic and stable validation available:
   1. local containers
   2. internal test environments
   3. provider sandboxes
   4. controlled live tests only when justified
4. Delete test data generated by tests

### Minimum expectation by risk tier

1. Tier 0: none unless useful
2. Tier 1: unit or integration coverage for changed behavior
3. Tier 2: integration coverage for affected paths
4. Tier 3: integration plus end to end coverage for affected critical flows

### Coverage

1. Coverage must be measured and reported.
2. Coverage numbers alone are not sufficient.
3. Prioritize coverage of changed lines, critical paths, failure handling, and regression prone logic.

## Playwright Policy

A core Playwright suite must exist for the most important user journeys.

Rules:

1. No mocking allowed.
2. Playwright tests must run in CI against a local or PR built application, and in production.
3. Critical flows must remain covered.
4. Add or update Playwright tests when a PR changes a critical flow, rendering path, or client side behavior that could fail in browser.
5. Prefer a smaller stable suite with high signal over a larger flaky suite.

At minimum, protect the flows that would materially harm users or revenue if broken.

## Environment Validation

CI must validate required configuration for required jobs.

Rules:

1. A dedicated CI step must verify required environment variables and secrets for test and deployment jobs.
2. If required configuration is missing, fail clearly and list the missing variables.
3. Do not allow tests to pass because they downgraded to mocks or no ops due to missing configuration.

## Observability Policy

Any runtime change must be observable.

Minimum expectations:

1. Structured logs
   Include enough context to debug failures.
   Never log secrets or sensitive tokens.

2. Error visibility
   Errors must surface to the repo's error tracking or equivalent mechanism.

3. Metrics
   Add or confirm metrics for the changed critical path where relevant:
   1. success and failure count
   2. latency
   3. retries and timeouts
   4. queue or job outcomes
   5. business event completion if applicable

4. Correlation
   Use request IDs, job IDs, or trace IDs where supported.

5. Dashboards and alerts
   For Tier 3 changes, confirm how the team would detect failure in production.

## Preflight Requirement

Before requesting human review, the agent or contributor must complete a local preflight.

The preflight must verify:

1. required PR sections are present
2. required checklist items are completed honestly
3. required tests for the risk tier have run
4. lint, typecheck, and build steps pass
5. required environment variables are present for the selected test suite
6. preview or staging validation is complete when applicable
7. evidence artifacts are attached or referenced
8. changed flows are documented
9. rollback or mitigation is included when required

Do not ask the human to discover preventable failures in CI or the PR template.
If a failure can be detected before review, it must be detected before review.

## Reviewer Time Protection

Human review is the final quality pass, not the first validation pass.

Do not hand a PR to a human reviewer if it still has:

1. missing checklist items
2. missing evidence
3. missing required tests
4. known CI failures
5. known formatting or template failures
6. missing environment configuration
7. unresolved mechanical issues that the agent or contributor could have detected

The reviewer should not be used as a substitute for preflight validation.

## Automation Expectations

Where possible, the repo should automate mechanical enforcement before human review.

Prefer automated checks for:

1. PR template completeness
2. checklist presence
3. required environment variable validation
4. lint, typecheck, and build
5. test selection by risk tier
6. coverage reporting
7. preview health checks

Humans should judge substance.
Automation should catch mechanics.

## PR Requirements

Every PR description must include:

### 1. What changed

A short behavior first summary.

### 2. User flow coverage

For affected flows:

1. happy path
2. main failure paths
3. edge cases worth noting

### 3. Validation evidence

One or more of:

1. screenshots
2. short video
3. CLI output
4. test output
5. preview link
6. logs or metrics evidence

### 4. Test proof

List:

1. tests added or updated
2. exact commands run
3. result summary

### 5. Risk review

List:

1. top weaknesses or risks introduced
2. what was done to mitigate them
3. what remains unresolved

### 6. Observability

State:

1. what logs, metrics, or error reporting were added or verified
2. how failures would be detected after deploy

### 7. Rollback or mitigation

Required for Tier 3 and any irreversible change.

## Architectural Review Prompts

For any non trivial PR, answer these:

1. What contract changed?
2. What can fail now that could not fail before?
3. What happens on retry, timeout, duplicate submission, partial success, or stale state?
4. What assumptions does this change make about data, ordering, auth, or infra?
5. How would this be rolled back or disabled?
6. What production signal would prove this is healthy?

Do not write generic filler. Be specific.

## Preview and Deployment Validation

For web applications and user facing runtime changes:

1. Validate the PR build in a preview or equivalent environment when available.
2. Run smoke tests or end to end checks appropriate to the change.
3. Confirm the deployed artifact matches the intended behavior.
4. Do not merge if the preview or staged validation reveals a real regression.

For backend only or library only changes, use the closest relevant validation instead of forcing meaningless preview checks.

## Bot and Human Review

1. Use bot review as a signal amplifier, not as a substitute for judgment.
2. Fix high value feedback.
3. If rejecting substantial feedback, explain why in the PR.
4. Human review still governs merge readiness.

## Handoff Rules

A PR is ready for human review only when:

1. local preflight is complete
2. required checks are green or already known to be non blocked with explanation
3. required tests have run
4. evidence is attached
5. the PR template is fully completed
6. major known issues are already surfaced
7. the PR is genuinely ready for judgment, not mechanical cleanup

The human reviewer is the final decision maker.
The agent or contributor is responsible for eliminating preventable review friction before handoff.

Escalate earlier only if:

1. there is a product tradeoff
2. there is an architectural conflict
3. CI is blocked by infrastructure outside the PR
4. a risky unresolved issue needs a decision

## PR Checklist

- [ ] Risk tier declared
- [ ] Behavior first summary included
- [ ] Affected user flows documented
- [ ] Evidence attached
- [ ] Tests added or updated appropriately
- [ ] Exact validation commands included
- [ ] Architectural risks identified
- [ ] Edge cases reviewed
- [ ] Observability addressed
- [ ] Preview or staging validation completed if applicable
- [ ] Rollback or mitigation included if required
- [ ] CI green

## Communication Rule

Write clearly and directly.
Do not use the hyphen character in normal prose unless it is required for technical correctness.
Keep wording simple so the final reviewer can scan the PR quickly with minimal effort.

## Writing Style Rule

Avoid the hyphen character in normal prose.

Prefer plain wording without hyphenated compounds.
Examples:

1. Use "behavior first" instead of "behavior-first"
2. Use "user facing" instead of "user-facing"
3. Use "end to end" instead of "end-to-end"
4. Use "high risk" instead of "high-risk"

Exception:
Use the character when required for correctness in code, file names, URLs, environment variables, commands, identifiers, markdown checkboxes, or external system names.

## Operating Notes for Agents

1. Do not optimize for passing the checklist. Optimize for protecting real behavior.
2. Do not hide uncertainty. Surface it.
3. Do not replace production confidence with mock heavy theater.
4. Do not merge red builds.
5. Do not confuse coverage with safety.
6. When a rule here seems wrong for the specific change, raise the exception explicitly in the PR with reasoning.

The standard is not perfection.
The standard is clear behavior, real validation, production visibility, disciplined delivery, and minimal wasted developer time.
