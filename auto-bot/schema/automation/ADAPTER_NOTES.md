# Automation schema adapters (Swift / Node / Python)

**Canonical contracts** are the JSON Schema files in this directory. All messages that cross process boundaries MUST include `"schema_version": "1.0"`.

## Backward compatibility

- **1.x**: Additive changes only (new optional fields, new enum values with safe defaults). Older clients ignore unknown fields.
- **2.0+**: Breaking changes get a new `schema_version` const; orchestrator should negotiate or reject mismatched peers.

## Bindings (mirrors — keep in sync with schemas)

| Schema | Python | TypeScript | Swift |
|--------|--------|------------|-------|
| UI node | `app.automation.models.UINode` | `automation-dom/src/schema-types.ts` | `Sources/AutomationHelper/SchemaModels.swift` |
| Action | `StructuredAction` | same file | same file |
| Execution result | `LayerExecutionResult` | same file | same file |
| State | `AutomationStateSnapshot` | same file | same file |

Validation: Python uses `jsonschema` at IPC boundaries (`app.automation.schema_validation`). Node and Swift should validate request/response payloads the same way when feasible.
