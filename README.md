# App Store Connect MCP

![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js: 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A TypeScript project for a read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for Apple App Store Connect.

## Status

Early development. Configuration, JWT authentication, and the GET-only Apple HTTP client are implemented; the MCP server and tools are not implemented yet.

See the [tool overview](docs/tools.md), [shared rules](docs/tools/shared-behavior.md), and [roadmap](docs/roadmap.md).

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

Run `npm run build` again after changing source files. The entry point is currently empty, so `npm start` exits without starting an MCP server. Run `npm test` to build and execute the configuration, JWT authentication, and Apple client tests with Node's built-in test runner. Tests use synthetic keys and make no network requests.

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

The key is loaded once; restart the process after rotating credentials. Encrypted private keys are unsupported; the loader accepts unencrypted EC P-256 private keys. Never log the provider's token or return it through an MCP tool. Authentication does not itself issue HTTP requests; the Apple client enforces GET-only access.

### Apple HTTP client

`createAppleClient(tokenProvider, { fetch?, timeoutMs?, maxResponseBytes?, wait?, now? })` in `src/apple/client.ts` exposes only `get(path, query?)`. It uses the fixed Apple API origin, rejects redirects, and encodes query values separately. Paths must start with `/v1/` or `/v2/`; segments accept letters, digits, underscores, and hyphens. URLs, embedded queries, and encoded paths are rejected.

The default timeout is ten seconds per attempt and covers fetching and reading JSON, using [Node's fetch and AbortController](https://nodejs.org/docs/latest/api/globals.html). Errors expose stable `AppleClientError.code` categories and fixed messages without underlying errors, response bodies, or credentials. Returned JSON is internal `unknown` data; tools must validate it and select allowed fields before returning it to MCP clients.

Responses are limited to 1 MiB by default, configurable through `maxResponseBytes` (a positive safe integer). The client counts bytes from the response stream independently of `Content-Length` and cancels reading on overflow with `response_too_large`. This transport limit is separate from the future MCP output budget.

Network failures and HTTP 429, 502, 503, and 504 receive at most two retries, with default delays of 500 ms and 1 s. [`Retry-After`](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) supports seconds or an HTTP date. Delays above five seconds end the call with the original safe error rather than retrying early; invalid values use the default delay. Timeouts, other HTTP errors, invalid JSON, and oversized responses are not retried. Each attempt obtains a token from the provider.

Tests inject fetch, wait, and clock functions; retry tests live in `test/client-retry.test.js`. No tests contact Apple. Pagination and MCP startup integration remain future work.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

[MIT](LICENSE)
