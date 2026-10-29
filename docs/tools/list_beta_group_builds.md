# `list_beta_group_builds`

Lists builds associated with an explicitly selected TestFlight group.

Inputs: required `betaGroupId` (opaque ID, 1–255 ASCII letters, digits,
underscores or hyphens), optional `limit` (1–100, default 20), and
server-issued `cursor`. Unknown arguments fail before network access.

Returns `{ items, nextCursor }` with the same fields as
[`list_builds`](list_builds.md). Apple order is preserved; no newest-first
ordering is promised. Marketing version and platform are null and
`contextUnavailable` is true because this endpoint supports no includes.
Prerelease linkage is retained if available. Use `get_build` for selected
build details. Extra upstream fields and included resources are discarded.

Mapping: `GET /v1/betaGroups/{betaGroupId}/builds`, with
`fields[builds]=version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion`.
No includes, sort, or per-build requests.
[Apple endpoint](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betagroups-_id_-builds)
permits up to 200 records; this tool caps pages at 100.

Uses the [shared pagination, budgets and safe errors](shared-behavior.md).
Cursors are bound to group, tool and connection. Follow until
`nextCursor: null`; empty pages succeed. No tester identities are returned.
Group membership and processing state do not establish testing eligibility.

Example: `{ "betaGroupId": "selected-group-id", "limit": 20 }`.
