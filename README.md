# App Store Connect MCP

[![CI](https://github.com/timokoethe/appstoreconnect-mcp/actions/workflows/ci.yml/badge.svg?event=pull_request)](https://github.com/timokoethe/appstoreconnect-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![Node.js: 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)

Read-only access to Apple App Store Connect from Codex and other [MCP](https://modelcontextprotocol.io/) clients. Inspect apps, releases, store metadata, builds, TestFlight groups, customer reviews, and screenshot metadata.

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

See the [tool reference](docs/tools.md) for all 14 tools and the [roadmap](docs/roadmap.md) for scope and planned coverage.

## Quick start with Codex

Requires **Node.js 20+**, **npm**, and an App Store Connect **team API key**.
Individual API keys are not supported. No clone, build, or global installation is needed.

Replace the placeholders with your credentials and the absolute path to your key:

```sh
codex mcp add appstoreconnect-mcp \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_UUID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8 \
  -- npx -y @timokoethe/appstoreconnect-mcp@1.0.1
```

Check registration with `codex mcp list`, restart Codex, and open a new conversation:

> Use appstoreconnect-mcp and list my apps.

`npx` downloads the package on first use and runs version `1.0.1` locally. To upgrade,
change the pinned version in your client configuration and restart the server.
For other clients, see [client setup](docs/setup.md#other-mcp-clients).

## Credentials

Create a team key under **App Store Connect → Users and Access → Integrations →
App Store Connect API → Team Keys**. An Account Holder or Admin can generate it;
the Account Holder must first request API access if it is not enabled.

| Variable | Value |
| --- | --- |
| `ASC_KEY_ID` | The key's 10-character ID. |
| `ASC_ISSUER_ID` | Your team's issuer UUID. |
| `ASC_PRIVATE_KEY_PATH` | Absolute path to the unencrypted EC P-256 `.p8` file. |

Keep the key outside the repository. `~` is not expanded and `.env` files are not
loaded automatically. Choose role permissions for the resources you need and
restart the server after rotating credentials. See [key setup and troubleshooting](docs/setup.md).

## Usage

- “Show the iOS store versions for this app.”
- “Compare the localized descriptions and keywords for this version.”
- “List recent one-star customer reviews for this app.”

Start with `list_apps`, pass returned IDs to subsequent tools, and follow
`nextCursor` until null. See [shared behavior](docs/tools/shared-behavior.md) for limits.

## Security

The server runs locally over stdio and makes GET-only Apple API requests. Output
is validated and bounded; errors exclude credentials and upstream response bodies.
App metadata is shared with your configured MCP client. Report vulnerabilities
privately via [SECURITY.md](SECURITY.md).

Version 1.0.0 has been manually tested with Codex. Claude Code testing is deferred.

## Development

See [development and releases](docs/development.md) for source builds, manual startup,
checks, and package testing, and [CONTRIBUTING.md](https://github.com/timokoethe/appstoreconnect-mcp/blob/main/CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE)
