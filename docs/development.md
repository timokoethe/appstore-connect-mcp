# Development and releases

Use Node.js 20+ and npm. Commands below assume a checkout of the repository.

## Build from source

For development or running from source:

```sh
git clone https://github.com/timokoethe/appstoreconnect-mcp.git
cd appstoreconnect-mcp
npm ci
npm run build
```

As an alternative to the npm setup, register the compiled entry point using
absolute paths (macOS/Linux shell syntax):

```sh
codex mcp add appstoreconnect-mcp \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_UUID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8 \
  -- "$(command -v node)" \
  /absolute/path/to/appstoreconnect-mcp/build/index.js
```

For credentials, see the [setup guide](setup.md#credentials).

## Manual startup

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

## Checks and CI

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

## Build an installable package

The npm package is named `@timokoethe/appstoreconnect-mcp`; its executable is
`appstoreconnect-mcp`. The GitHub repository name remains `appstoreconnect-mcp`.

```sh
npm pack
```

Packing removes the previous `build/` directory and rebuilds the server. The package includes the compiled server,
documentation, and license; source files, tests, and local configuration are excluded.
Install the generated tarball to use the `appstoreconnect-mcp` command:

```sh
npm install --global ./timokoethe-appstoreconnect-mcp-1.0.0.tgz
```

Set the three `ASC_*` environment variables before starting the command. It runs
the same stdio server as `node build/index.js` and waits for an MCP client on stdin.
This local packaging workflow does not require publishing to npm.

To test the installed package in Codex, register it separately from the local build:

```sh
codex mcp add appstoreconnect-mcp-package-test \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_UUID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8 \
  -- "$(command -v appstoreconnect-mcp)"
```

Restart Codex, open a new conversation, and ask:

> Use only the appstoreconnect-mcp-package-test MCP server and list my apps.

Both the local-build and installed-package paths have been manually tested in
Codex with Apple access. These smoke tests do not establish coverage of every tool
or API-key role. Remove the package test setup when finished:

```sh
codex mcp remove appstoreconnect-mcp-package-test
npm uninstall --global @timokoethe/appstoreconnect-mcp
```

## GitHub releases

After merging the release changes and confirming green PR checks, push a tag
such as `v1.0.0` on the intended commit. The version after `v` must exactly match
`package.json.version`. The release workflow creates a GitHub Release with
automatically generated notes, grouped by PR labels in `.github/release.yml`.
Tags such as `v1.1.0-beta1` create prereleases and require a matching package version.
This workflow does not publish to npm; npm publication is a separate step.
