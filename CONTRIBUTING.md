# Contributing

Contributions to App Store Connect MCP are welcome.

## Development

- Use Node.js 20+ and install dependencies with `npm ci`.
- Follow the existing TypeScript style and keep dependencies minimal.
- Keep App Store Connect operations read-only. Never commit credentials, private keys, or private app data.

Before opening a pull request, run:

```sh
npm run typecheck
npm run build
npm test
npm run test:package
```

Automated tests must use synthetic data and make no network requests. Update the relevant
[tool contracts](docs/tools.md) when changing tool behavior.

GitHub Actions runs all four checks on Ubuntu with Node.js 20, 22, 24, and 26.
Run `npm ci` before the package smoke test: it installs the packed CLI offline
using the same locked dependency versions from the npm cache. The smoke test
checks package contents, removal of stale build artifacts, and MCP initialization,
discovery, and invalid-input handling with a synthetic signing key.

## Issues and Pull Requests

- Check existing issues and pull requests before starting.
- Keep changes focused; discuss larger changes in an issue first.
- Describe what changed, why, and how you verified it. Note any checks you could not run.
- For bugs, include reproduction steps, expected and actual behavior, and your Node.js, OS, and MCP client versions. Remove secrets from logs.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
