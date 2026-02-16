# PBI: \<Short, Action-Oriented Title\>

## Summary

One--two sentences describing **what is changing** and **what the system
will do differently** as a result.

## Motivation

Why this change exists. Focus on **problems with the current state** and
**benefits of the new state**. Avoid implementation detail.

## Scope

### In Scope

-   Explicitly included behaviors, capabilities, or constraints.

### Out of Scope

-   Explicit non-goals.
-   Anything a future reader might reasonably assume is included but is
    not.

## Constraints & Assumptions

Hard rules that must hold true for this PBI. Examples: - Auth model -
Performance expectations - Environment limitations - Platform
assumptions

## Data Model Changes (if applicable)

Describe any persistent data changes.

### Required

Minimal fields required for correctness.

``` json
{}
```

### Optional / Audit (if applicable)

Fields stored for debugging, validation, or future extensibility.

``` json
{}
```

## External APIs / Integrations (if applicable)

Describe how this feature interacts with external systems.

-   API names
-   High-level usage patterns
-   What is *not* allowed (e.g., no runtime search)

Avoid full SDK documentation.

## Runtime Behavior

Describe **what happens at runtime**, at a conceptual level. This should
read like a system narrative, not pseudocode.

## Error Handling & Observability

What failures are expected vs exceptional. How the system should react.
What gets logged or reported.

## Acceptance Criteria

Clear, testable conditions for considering this PBI complete.

-   ...
-   ...
-   ...

## Notes

Optional clarifications, future considerations, or rationale that
doesn't fit elsewhere.
