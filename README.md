# App Store Connect MCP

![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js: 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A TypeScript project for a read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for Apple App Store Connect.

## Status

Early development. The repository contains the project scaffold and dependencies; the server and MCP tools are not implemented yet.

See the [tool roadmap and MVP](docs/tools.md) for proposed tools, API mappings, read-only boundaries, and implementation priorities.

## Development

Requires **Node.js 20+** and **npm**. Install dependencies with:

```sh
npm ci
```

Source code lives in `src/`. Check types, compile to `build/`, and run the compiled entry point with:

```sh
npm run typecheck
npm run build
npm start
```

Run `npm run build` again after changing source files. The entry point is currently empty, so `npm start` exits without starting an MCP server. Run `npm test` to build and execute the configuration and JWT authentication tests with Node's built-in test runner. Tests use synthetic keys and make no network requests.

### Configuration

`loadConfig()` in `src/config.ts` reads these environment variables:

| Variable | Required value |
| --- | --- |
| `ASC_KEY_ID` | 10 uppercase letters or digits identifying the API key. |
| `ASC_ISSUER_ID` | Issuer UUID for an App Store Connect team API key. Individual API keys are not supported by this configuration. |
| `ASC_PRIVATE_KEY_PATH` | Path to a readable, non-empty `.p8` file. Relative paths resolve against the process working directory; `~` is not expanded. |

Values are trimmed. The loader validates identifiers and file accessibility without reading or returning key contents. Files may be symlinks to regular files. Errors identify the setting without including its value or underlying filesystem errors.

Supply variables through the process environment or the MCP client's server configuration. `.env` files are not loaded automatically. Keep key files outside the repository. The loader is not connected to the empty entry point yet; server startup integration follows with the MCP implementation.

### Authentication

`createTokenProvider(config)` in `src/apple/auth.ts` loads and validates an EC P-256 private key and returns a `getToken()` method for internal API authorization. It signs ES256 JWTs with the team issuer ID and `appstoreconnect-v1` audience, following [Apple's token documentation](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests).

Tokens have a ten-minute lifetime. A cached token is reused until a call occurs with 60 seconds or less remaining, at which point it is renewed. If the clock moves before the cached token's issuance time, the next call also renews it; a backwards change that stays within the valid cache interval does not. A signing failure returns a sanitized error rather than the old token, and a subsequent call retries renewal.

The key is loaded once; restart the process after rotating credentials. Encrypted private keys are unsupported; the loader accepts unencrypted EC P-256 private keys. Never log the provider's token or return it through an MCP tool. Authentication does not itself issue HTTP requests or enforce HTTP methods; the planned Apple client must enforce GET-only access.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

[MIT](LICENSE)
