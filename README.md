# App Store Connect MCP

![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js: 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A TypeScript project for a read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for Apple App Store Connect.

## Status

Early development. The local stdio MCP server provides the eight core MVP tools: `list_apps`, `get_app`, `list_app_versions`, `get_app_version`, `list_app_infos`, `list_app_info_localizations`, `list_version_localizations`, and `list_builds`, plus `list_screenshot_sets` and `list_screenshots` for ordered screenshot metadata. Tools have validated inputs, bounded output, and safe errors. Lists support bounded pagination; app-info records are selected explicitly before reading localized names and subtitles. Customer reviews are also available through `list_customer_reviews`, with optional rating and territory filters and date sorting. See the [review tool contract](docs/tools/list_customer_reviews.md). Use `get_build` with a selected build ID for [build details and beta states](docs/tools/get_build.md). Use [`list_beta_groups`](docs/tools/list_beta_groups.md) with an app ID to inspect TestFlight group names and internal-group flags without tester identities. Other tools remain planned.

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

Run `npm run build` again after changing source files. `npm start` starts the stdio server and requires the configuration below. Run `npm test` for configuration, authentication, HTTP client, pagination, and MCP protocol tests. Automated tests use synthetic data and make no network requests.

### Configuration

`loadConfig()` in `src/config.ts` reads these environment variables:

| Variable | Required value |
| --- | --- |
| `ASC_KEY_ID` | 10 uppercase letters or digits identifying the API key. |
| `ASC_ISSUER_ID` | Issuer UUID for an App Store Connect team API key. Individual API keys are not supported by this configuration. |
| `ASC_PRIVATE_KEY_PATH` | Path to a readable, non-empty `.p8` file. Relative paths resolve against the process working directory; `~` is not expanded. |

Values are trimmed. The loader validates identifiers and file accessibility without reading or returning key contents. Files may be symlinks to regular files. Errors identify the setting without including its value or underlying filesystem errors.

Supply variables through the process environment or the MCP client's server configuration. `.env` files are not loaded automatically. Keep key files outside the repository. Startup validates configuration and loads the key before accepting MCP requests. Failures emit a fixed message on stderr and exit with code 1.

### MCP client setup

Configure your MCP client to launch `node` with the absolute path to `build/index.js` and supply the three `ASC_*` variables in its environment. Use an absolute key path to avoid dependence on the client working directory. Launch the compiled entry point directly so npm output cannot enter the protocol stream.

For a local, ignored `.env.local`, Node.js 20.6+ can load it explicitly:

```sh
node --env-file=.env.local build/index.js
```

The server waits for MCP messages on stdin; stdout contains only protocol traffic. Start with `list_apps` arguments `{ "limit": 20 }`, then follow `nextCursor` explicitly. See the [tool contract](docs/tools/list_apps.md) for filters, limits, and cursor lifetime.

Use `get_app` with `{ "appId": "1234567890" }` to retrieve one app by its ID. It returns `{ item }`
with the same identity fields, without loading related resources. See the [get_app contract](docs/tools/get_app.md).

Use `list_app_versions` with `{ "appId": "1234567890", "platform": "IOS" }` to inspect releases,
then pass a returned item's `id` as `versionId` to `get_app_version` to read its selected build and release date.
See the [version list](docs/tools/list_app_versions.md) and [version detail](docs/tools/get_app_version.md) contracts.

Use `list_app_infos` with `{ "appId": "1234567890" }` to inspect the app's information records
and their Apple states. Select a record explicitly, then call `list_app_info_localizations` with
`{ "appInfoId": "selected-app-info-id" }` to read localized names, subtitles, and privacy-policy URLs.
See the [app-info list](docs/tools/list_app_infos.md) and [localization list](docs/tools/list_app_info_localizations.md) contracts.

Use `list_version_localizations` with `{ "versionId": "selected-version-id" }` to read
localized descriptions, keywords, promotional text, release notes, and support/marketing URLs.
Select the version explicitly using `list_app_versions`. Text is returned unchanged and is never
executed; URLs are never fetched. See the [version-localization contract](docs/tools/list_version_localizations.md)
for pagination and text-size limits.

Use `list_builds` with `{ "appId": "1234567890" }` to read uploaded builds, newest first,
with processing and expiration state. Marketing version and platform come from included
prerelease records; `contextUnavailable` marks missing or partial context. Processing state
does not establish TestFlight availability. See the [build-list contract](docs/tools/list_builds.md).

Use `list_screenshot_sets` with `{ "versionLocalizationId": "selected-localization-id" }`
from `list_version_localizations`, then `list_screenshots` with
`{ "screenshotSetId": "selected-set-id" }` to read filenames, available dimensions and
delivery state in Apple order. Follow pagination explicitly. Image URLs, asset tokens and
upload instructions are excluded; images are not downloaded. See the [set-list contract](docs/tools/list_screenshot_sets.md)
and [screenshot-list contract](docs/tools/list_screenshots.md).

### Authentication

`createTokenProvider(config)` in `src/apple/auth.ts` loads and validates an EC P-256 private key and returns a `getToken()` method for internal API authorization. It signs ES256 JWTs with the team issuer ID and `appstoreconnect-v1` audience, following [Apple's token documentation](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests).

Tokens have a ten-minute lifetime. A cached token is reused until a call occurs with 60 seconds or less remaining, at which point it is renewed. If the clock moves before the cached token's issuance time, the next call also renews it; a backwards change that stays within the valid cache interval does not. A signing failure returns a sanitized error rather than the old token, and a subsequent call retries renewal.

The key is loaded once; restart the process after rotating credentials. Encrypted private keys are unsupported; the loader accepts unencrypted EC P-256 private keys. Never log the provider's token or return it through an MCP tool. Authentication does not itself issue HTTP requests; the Apple client enforces GET-only access.

### Apple HTTP client

`createAppleClient(tokenProvider, { fetch?, timeoutMs?, maxResponseBytes?, wait?, now? })` in `src/apple/client.ts` exposes only `get(path, query?)`. It uses the fixed Apple API origin, rejects redirects, and encodes query values separately. Paths must start with `/v1/` or `/v2/`; segments accept letters, digits, underscores, and hyphens. URLs, embedded queries, and encoded paths are rejected.

The default timeout is ten seconds per attempt and covers fetching and reading JSON, using [Node's fetch and AbortController](https://nodejs.org/docs/latest/api/globals.html). Errors expose stable `AppleClientError.code` categories and fixed messages without underlying errors, response bodies, or credentials. Returned JSON is internal `unknown` data; tools must validate it and select allowed fields before returning it to MCP clients.

Responses are limited to 1 MiB by default, configurable through `maxResponseBytes` (a positive safe integer). The client counts bytes from the response stream independently of `Content-Length` and cancels reading on overflow with `response_too_large`. This transport limit is separate from the [tool output budget](docs/tools/shared-behavior.md#implemented-list_apps-policy).

Network failures and HTTP 429, 502, 503, and 504 receive at most two retries, with default delays of 500 ms and 1 s. [`Retry-After`](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) supports seconds or an HTTP date. Delays above five seconds end the call with the original safe error rather than retrying early; invalid values use the default delay. Timeouts, other HTTP errors, invalid JSON, and oversized responses are not retried. Each attempt obtains a token from the provider.

Tests inject fetch, wait, and clock functions; retry tests live in `test/client-retry.test.js`. No automated tests contact Apple.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

[MIT](LICENSE)

Use [`list_beta_group_builds`](docs/tools/list_beta_group_builds.md) with a selected beta-group ID to inspect associated builds, then `get_build` for details.
