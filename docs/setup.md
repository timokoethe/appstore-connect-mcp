# Client setup and credentials

## Credentials

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

## Other MCP clients

Version 1.0.0 has been manually tested with Codex. Claude Code testing and
client-specific setup instructions are deferred to a later version.

Add the published package to your client's configuration, replacing the placeholder path and credentials:

```json
{
  "mcpServers": {
    "appstoreconnect-mcp": {
      "command": "npx",
      "args": ["-y", "@timokoethe/appstoreconnect-mcp@1.0.0"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_UUID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

This example uses the common `mcpServers` JSON format; adapt it to your client's configuration format. If the client cannot find `npx`, use its absolute path from `command -v npx` (macOS/Linux).

## Troubleshooting

If startup fails, check that all three variables are set and the key file is readable,
unencrypted, and EC P-256.
For tool errors, `authentication` means Apple authentication failed: check the
matching Key ID, Issuer ID, private key, and whether the key was revoked.
`access_denied` means Apple denied the request: check the key's role permissions.
