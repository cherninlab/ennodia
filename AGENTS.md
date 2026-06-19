# Ennodia

This repo is Bun-first.

- Use `bun install` for dependencies.
- Use `bun run verify` before handing off changes.
- Keep adapters thin; put shared routing, tracing, and task behavior in core modules.
- Do not add permission-bypass flags to harness commands by default.
- Do not call provider-private APIs; use supported CLI/API surfaces only.
