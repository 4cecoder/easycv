# easyCV — Agent Guidelines & Tooling Rules

## ⚡ Tooling & Execution Rule
> **CRITICAL**: Always use `bun` and `bunx` for all JavaScript/TypeScript runtime commands, scripts, package management, and CLI tools. **Never use `npx` or `npm`.**
>
> - **Scripts**: `bun run <script>` (e.g. `bun run dev`, `bun run test`, `bun run build`, `bun run typecheck`)
> - **Binaries & CLIs**: `bunx <tool>` (e.g. `bunx convex dev`, `bunx vitest run`, `bunx next build`, `bunx convex env set ...`)
> - **Package Management**: `bun install` / `bun add <pkg>` / `bun remove <pkg>`
> - **Python Backend**: `uv run pytest`, `uv run python pipeline.py`

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`web/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns.

Convex agent skills for common tasks can be installed by running
`bunx convex ai-files install` inside `web/`.

<!-- convex-ai-end -->
