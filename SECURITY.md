# Security Policy

App Store Connect MCP is a TypeScript project intended to provide read-only access to Apple App Store Connect through MCP clients such as Claude Code and Codex. The server implementation is currently under development.

Please report issues that could expose App Store Connect credentials or private app data, allow unauthorized access, execute unintended code, or violate the server's read-only boundary.

## Supported Versions

Only the latest public release and the current `main` branch are supported for security fixes.

## Reporting a Vulnerability

Please do not open a public issue for security reports.

Private vulnerability reporting is enabled for this repository. Use [GitHub's private vulnerability reporting form](https://github.com/timokoethe/appstore-connect-mcp/security/advisories/new) to submit details securely.

Please include:

- affected version or commit
- Node.js version, operating system, and MCP client and version
- relevant configuration, with all secrets removed
- steps to reproduce
- potential impact
- proof of concept, if available

Never include private `.p8` keys, API tokens, signed JWTs, or unredacted private App Store Connect data in a report. Use placeholders or synthetic data in reproduction steps and proofs of concept.

We will review the report, validate the issue, and coordinate a fix before public disclosure.

## Security Expectations

As the server is implemented, the following properties must hold:

- App Store Connect access remains read-only; MCP tools must not create, modify, or delete Apple resources.
- Private signing keys and authentication tokens must not appear in source control, logs, errors, or MCP tool responses.
- Tool arguments and responses from external services must be treated as untrusted input and must not cause unintended command execution or access to local files or network destinations.
- Private app metadata must only be returned through the configured, authorized MCP connection.

These are requirements for the implementation, not claims that the current development scaffold already enforces them.
