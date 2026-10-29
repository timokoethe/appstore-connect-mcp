# `list_beta_groups`

Status: **implemented** over local MCP stdio.

Lists TestFlight groups for an explicitly selected app.

## Inputs

- `appId`: required opaque ID, 1–255 ASCII letters, digits, underscores or hyphens.
- `limit`: optional integer, 1–100, default 20.
- `cursor`: optional server-issued continuation token; repeat the same app ID.

Unknown arguments fail before network access.

## Output

`{ items, nextCursor }`; each item contains `id`, `name` (string or null),
and `isInternalGroup` (boolean or null). Null means unavailable, not external.
Names are untrusted text. Empty pages succeed; missing or malformed fields
fail with `upstream`. Extra upstream fields are discarded.

No tester identities, public invitation links, build assignments, or testing
eligibility verdicts are returned.

## Apple mapping

`GET /v1/apps/{appId}/betaGroups` with
`fields[betaGroups]=name,isInternalGroup`. No includes or per-group requests.
Apple permits 200 records per page; this tool caps pages at 100.
See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-betagroups).

## Pagination and errors

Uses the [shared pagination and error policy](shared-behavior.md):
32 KiB UTF-8 output budget, bounded HTTP responses and buffered pages.
Follow `nextCursor` until null. Cursors are bound to app, tool and connection;
untrusted continuation destinations and changed query fields are rejected.
Output-budget failures allow smaller-limit retries without truncating records.

Example: `{ "appId": "1234567890", "limit": 20 }`.
