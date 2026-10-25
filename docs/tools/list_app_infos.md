# `list_app_infos`

Status: **implemented** over local MCP stdio.

List app-information records for one app. An app can have separate records for its live
and upcoming release. Return all records on the requested page; never select one implicitly.

## Inputs

| Argument | Type | Required | Constraints |
| --- | --- | --- | --- |
| `appId` | `string` | Yes | Opaque ID: 1–255 ASCII letters, digits, underscores, or hyphens. |
| `limit` | `integer` | No | Default 20; 1–100. |
| `cursor` | `string` | No | Server-issued continuation token. Repeat the same app ID. |

Unknown arguments and invalid inputs fail before network access.

## Output

`{ items, nextCursor }`, with each item containing `id` and `state` (string or null).
Unknown Apple state values and nulls are preserved. An empty page is successful;
only `nextCursor: null` indicates completion. Missing state attributes or malformed
resources return `upstream`. Extra fields, relationships, and included resources are discarded.

Pass an explicitly selected item's `id` as `appInfoId` to
[`list_app_info_localizations`](list_app_info_localizations.md).

## Apple API mapping

`GET /v1/apps/{appId}/appInfos` with `fields[appInfos]=state`. No includes are requested.
Apple permits up to 200 records; this tool uses the shared maximum of 100.
See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appinfos).
The current status field is `state`; Apple's [API 3.3 release notes](https://developer.apple.com/documentation/appstoreconnectapi/app-store-connect-api-3-3-release-notes)
document its replacement of the deprecated `appStoreState` field.

## Pagination, limits, and errors

Uses the [shared list pagination policy](shared-behavior.md#implemented-list_apps-policy):
one Apple page per call subject to bounded retries, 32 KiB of UTF-8 JSON output,
and cursors scoped to this tool, connection, and app ID. Smaller limits serve buffered
slices without skipping records. Oversized output leaves the input cursor reusable;
retry with a smaller limit, or without a cursor for a failed first page.
A single oversized record returns `record_too_large` without truncation.
Transport errors retain their shared safe codes.

Example arguments: `{ "appId": "1234567890", "limit": 20 }`.
