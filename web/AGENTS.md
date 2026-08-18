# Package Manager & CLI Tooling Rule
> **IMPORTANT**: Always use `bun` and `bunx` for all JS/TS execution, script running, package management, and CLI tools. **Never use `npx` or `npm`.**
> - Run scripts: `bun run <script>` (e.g. `bun run dev`, `bun run test`, `bun run typecheck`)
> - Run package binaries: `bunx <tool>` (e.g. `bunx convex dev`, `bunx vitest run`, `bunx shadcn@latest add ...`)
> - Install dependencies: `bun install` / `bun add <pkg>`

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`bunx convex ai-files install`.

<!-- convex-ai-end -->

