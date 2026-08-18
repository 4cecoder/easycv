# easyCV — Agent Guidelines & Tooling Rules

## ⚡ Tooling & Execution Rule
> **CRITICAL**: Always use `bun` and `bunx` for all JavaScript/TypeScript runtime commands, scripts, package management, and CLI tools. **Never use `npx` or `npm`.**
>
> - **Scripts**: `bun run <script>` (e.g. `bun run dev`, `bun run test`, `bun run build`, `bun run typecheck`)
> - **Binaries & CLIs**: `bunx <tool>` (e.g. `bunx convex dev`, `bunx vitest run`, `bunx next build`, `bunx convex env set ...`)
> - **Package Management**: `bun install` / `bun add <pkg>` / `bun remove <pkg>`
> - **Python Backend**: `uv run pytest`, `uv run python pipeline.py`

## 📁 Key Components
- `web/`: Next.js frontend + Convex backend (React 19, Tailwind v4, `@bytecats/ui-kit`)
- `backend/`: Python pipeline (PDF parsing, LLM consolidation, ASD-STE100 linter, LaTeX engine)
- `tests/`: Python test suite
- `automation/`: Self-driving test orchestration and TDD loops
