# Agent Guidelines

- This is a TypeScript MCP server for read-only Apple App Store Connect access. Source code lives in `src/`.
- Use Node.js 20+ and npm; keep `package-lock.json` in sync with dependency changes.
- Keep changes focused, code readable, and dependencies minimal.
- Never add operations that create, modify, or delete App Store Connect resources.
- Never commit or expose credentials, private keys, tokens, or private app data in logs or tool responses.
- Follow `CONTRIBUTING.md` and `SECURITY.md`.
- Verify relevant changes with `npm run typecheck` and `npm run build`, and report what was checked. The project is currently a scaffold: `npm start` runs the empty compiled entry point and `npm test` is a failing placeholder.
