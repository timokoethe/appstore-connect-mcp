# App Store Connect MCP

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![Node.js: 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)

Read-only access to Apple App Store Connect from Claude Code, Codex, and other [MCP](https://modelcontextprotocol.io/) clients. Inspect apps, releases, localized store metadata, builds, TestFlight groups, customer reviews, and screenshot metadata without modifying Apple resources.

The server runs locally over stdio. API coverage is focused and still expanding; see the [tool reference](docs/tools.md) and [roadmap](docs/roadmap.md).

## Features

| Area | Available tools |
| --- | --- |
| Apps | `list_apps`, `get_app` |
| Store versions | `list_app_versions`, `get_app_version` |
| Localized metadata | `list_app_infos`, `list_app_info_localizations`, `list_version_localizations` |
| Builds & TestFlight | `list_builds`, `get_build`, `list_beta_groups`, `list_beta_group_builds` |
| Customer reviews | `list_customer_reviews` |
| Screenshot metadata | `list_screenshot_sets`, `list_screenshots` |

Lists support bounded pagination. Screenshot tools return filenames, dimensions, and delivery state; they do not download images. TestFlight tools exclude tester identities.

## Setup

Requires **Node.js 20+**, **npm**, and an App Store Connect **team API key**. Individual API keys are not supported.

```sh
git clone https://github.com/timokoethe/appstore-connect-mcp.git
cd appstore-connect-mcp
npm ci
npm run build
```

Add the server to your MCP client's configuration, replacing the placeholder paths and credentials:

```json
{
  "mcpServers": {
    "appstore-connect": {
      "command": "node",
      "args": ["/absolute/path/to/appstore-connect-mcp/build/index.js"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_UUID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

This example uses the common `mcpServers` JSON format; adapt it to your client's configuration format. Launch the compiled entry point directly and use absolute paths.

| Variable | Value |
| --- | --- |
| `ASC_KEY_ID` | API key ID: 10 uppercase letters or digits. |
| `ASC_ISSUER_ID` | Team API key issuer UUID. |
| `ASC_PRIVATE_KEY_PATH` | Path to the unencrypted EC P-256 `.p8` private key. |

Keep the key outside the repository. `~` is not expanded and `.env` files are not loaded automatically. Restart the server after rotating credentials.

For a manual run on Node.js 20.6+, create a local `.env.local` file (ignored by Git):

```dotenv
ASC_KEY_ID=YOUR_KEY_ID
ASC_ISSUER_ID=YOUR_ISSUER_UUID
ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8
```

Then start the server:

```sh
node --env-file=.env.local build/index.js
```

The server waits for MCP requests on stdin; stdout is reserved for protocol traffic.
If startup fails, check that all three variables are set and the key file is readable,
unencrypted, and EC P-256.

## Usage

Try asking your MCP client:

- “List my apps, then show the iOS store versions for the app I select.”
- “Compare the localized descriptions and keywords for this version.”
- “Show recent builds and their internal and external beta states.”
- “List recent one-star customer reviews for this app.”

Start with `list_apps` using `{ "limit": 20 }`, then pass returned IDs to the relevant tools. Select versions and app-info records explicitly, and follow `nextCursor` to retrieve additional pages. See the [tool reference](docs/tools.md) for inputs and the [shared behavior](docs/tools/shared-behavior.md) for limits and pagination.

## Security

Apple API requests are GET-only. Tool inputs and responses are validated, output is bounded, and errors exclude credentials and upstream response bodies. Private keys and authentication tokens are never returned by tools. App metadata is shared with your configured MCP client.

Report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md).

## Development

Source code lives in `src/`. Rebuild after source changes.

```sh
npm run typecheck
npm run build
npm test
```

Tests use synthetic data and make no network requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE)
