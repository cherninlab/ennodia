# Ennodia

This repo is Bun-first.

- Use `bun install` for dependencies.
- Use `bun run verify` before handing off changes.
- Keep adapters thin; put shared routing, tracing, and task behavior in core modules.
- Do not add permission-bypass flags to harness commands by default.
- Do not call provider-private APIs; use supported CLI/API surfaces only.
- Keep progress updates compact and factual. Prefer short bullets; do not repeat full task details on every poll/tick unless the state changed. A good update is like: `* Working tree is clean.` or `* Harnesses are available: Gemini -> Antigravity; Kimi/Minimax/GLM -> OpenCode; Opus -> Claude Code; GPT -> Codex.`
