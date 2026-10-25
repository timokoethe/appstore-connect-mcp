# `list_app_versions`

Status: **implemented** over local MCP stdio.

List store versions for one app. No implicit selection of the latest version, aggregation
across platforms, or per-version follow-up requests.

## Inputs

| Argument | Type | Required | Constraints |
| --- | --- | --- | --- |
| `appId` | `string` | Yes | Opaque ID: 1–255 ASCII letters, digits, underscores, or hyphens. |
| `platform` | `string` | No | `IOS`, `MAC_OS`, `TV_OS`, or `VISION_OS`. Omit for all platforms. |
| `limit` | `integer` | No | Default 20; 1–100. |
| `cursor` | `string` | No | Server-issued continuation token. Repeat the same app ID and platform filter. |

Unknown arguments and invalid inputs fail before network access.

## Output

`{ items, nextCursor }`, where each item contains `id`, `versionString`, `platform`,
`appVersionState`, `releaseType`, and `createdDate`. All attributes are strings or null;
nulls and unknown Apple enum values are preserved. Dates are returned as supplied by Apple.
`appVersionState` is the current state field; the deprecated `appStoreState` is not used.
An empty page is successful. Only `nextCursor: null` indicates completion.

Missing attributes, malformed resources, or a platform inconsistent with an explicit filter
return `upstream`. Extra attributes, relationships, and included resources are discarded.

## Apple API mapping

`GET /v1/apps/{appId}/appStoreVersions` with
`fields[appStoreVersions]=versionString,platform,appVersionState,releaseType,createdDate`.
The optional platform maps to `filter[platform]`. No includes are requested.
Apple permits up to 200 records; this tool uses the shared maximum of 100.
See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions).

## Pagination, limits, and errors

Uses the same buffering, expiration, eviction, and output budgets as the
[implemented list pagination policy](shared-behavior.md#implemented-list_apps-policy).
Cursor storage is separate per tool and connection. Version cursors additionally bind to
the app ID and exact platform filter. Changing either returns `invalid_cursor` before access.
Next links must match the Apple origin, exact app resource path, and original query fields.

At most one Apple page is fetched per call, subject to bounded transport retries.
Smaller limits serve buffered slices without skipping records or changing Apple's page size.
Output is limited to 32 KiB of UTF-8 JSON; each retained page to 1 MiB. Oversized output
returns `output_too_large`; retry the same cursor with a smaller limit. For the first page,
retry without a cursor. A single oversized record returns `record_too_large` without truncation.
The separate HTTP size limit returns `response_too_large`; restart without a cursor and a
smaller limit. Authentication, denied access, and missing resources retain their shared errors.

Example arguments: `{ "appId": "1234567890", "platform": "IOS", "limit": 20 }`.
Pass a returned item ID to [`get_app_version`](get_app_version.md).
