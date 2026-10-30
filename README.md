# App Store Connect MCP

[![CI](https://github.com/timokoethe/appstoreconnect-mcp/actions/workflows/ci.yml/badge.svg?event=pull_request)](https://github.com/timokoethe/appstoreconnect-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![Node.js: 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)

Read-only access to Apple App Store Connect from Codex and other [MCP](https://modelcontextprotocol.io/) clients. Inspect apps, releases, localized store metadata, builds, TestFlight groups, customer reviews, and screenshot metadata without modifying Apple resources.

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
git clone https://github.com/timokoethe/appstoreconnect-mcp.git
cd appstoreconnect-mcp
npm ci
npm run build
```

### Codex

After building, register the local server with the Codex CLI. Replace the
placeholder credentials and paths with your own values:

```sh
codex mcp add appstore-connect \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_UUID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8 \
  -- "$(command -v node)" \
  /absolute/path/to/appstoreconnect-mcp/build/index.js
```

This shell example uses macOS/Linux syntax and records the absolute Node.js path.
No global npm installation is required. Check the registration:

```sh
codex mcp list
```

Restart Codex and open a new conversation. Ask:

> Use the appstore-connect MCP server and list my apps with list_apps.

Then ask for the store versions of a selected app and its localized metadata.
Listing the registered server confirms configuration; a successful tool call also
checks the MCP connection and Apple authentication. This local-build setup has
been manually tested with Codex and Apple access.

### Other MCP clients

Version 1.0.0 has been manually tested with Codex. Claude Code testing and
client-specific setup instructions are deferred to a later version.

Add the server to your client's configuration, replacing the placeholder paths and credentials:

```json
{
  "mcpServers": {
    "appstore-connect": {
      "command": "node",
      "args": ["/absolute/path/to/appstoreconnect-mcp/build/index.js"],
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

### Credentials and manual startup

In App Store Connect, open **Users and Access → Integrations → App Store Connect
API → Team Keys**. An Account Holder or Admin can generate a team key; the Account
Holder must first request API access if it is not enabled. Copy the Key ID and
Issuer ID from the API key page and download the private `.p8` key. See
[Apple's key setup guide](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api).

Choose role permissions that allow reading the resources you need; this server
does not bypass Apple's role restrictions. Team keys apply across all apps in the
account. See [Apple's API access and role guidance](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/).

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
For tool errors, `authentication` means Apple authentication failed: check the
matching Key ID, Issuer ID, private key, and whether the key was revoked.
`access_denied` means Apple denied the request: check the key's role permissions.

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
npm run test:package
```

Tests use synthetic data and make no network requests. See [CONTRIBUTING.md](https://github.com/timokoethe/appstoreconnect-mcp/blob/main/CONTRIBUTING.md) for contribution guidelines.

GitHub Actions runs these checks on Ubuntu with Node.js 20, 22, 24, and 26 for
pull requests, including new commits pushed to an open pull request. The package
smoke test packs the server, checks its contents, installs it offline using the
lockfile versions cached by `npm ci`, and checks the installed CLI over MCP with
a synthetic key. It requires `npm ci` first and makes no Apple requests.

### Build an installable package

```sh
npm pack
```

Packing removes the previous `build/` directory and rebuilds the server. The package includes the compiled server,
documentation, and license; source files, tests, and local configuration are excluded.
Install the generated tarball to use the `appstoreconnect-mcp` command:

```sh
npm install --global ./appstoreconnect-mcp-1.0.0.tgz
```

Set the three `ASC_*` environment variables before starting the command. It runs
the same stdio server as `node build/index.js` and waits for an MCP client on stdin.
This local packaging workflow does not require publishing to npm.

To test the installed package in Codex, register it separately from the local build:

```sh
codex mcp add appstore-connect-package \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_UUID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8 \
  -- "$(command -v appstoreconnect-mcp)"
```

Restart Codex, open a new conversation, and ask:

> Use only the appstore-connect-package MCP server and list my apps.

Both the local-build and installed-package paths have been manually tested in
Codex with Apple access. These smoke tests do not establish coverage of every tool
or API-key role. Remove the package test setup when finished:

```sh
codex mcp remove appstore-connect-package
npm uninstall --global appstoreconnect-mcp
```

The separate `appstore-connect` registration continues to use the local build.

### GitHub releases

After merging the release changes and confirming green PR checks, push a tag
such as `v1.0.0` on the intended commit. The version after `v` must exactly match
`package.json.version`. The release workflow creates a GitHub Release with
automatically generated notes, grouped by PR labels in `.github/release.yml`.
Tags such as `v1.1.0-beta1` create prereleases and require a matching package version.
This workflow does not publish to npm; npm publication is a separate step.

## License

[MIT](LICENSE)
