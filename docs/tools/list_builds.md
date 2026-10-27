# `list_builds`

Status: **implemented** over local MCP stdio.

List uploaded builds for one app, newest upload first. Each page includes prerelease
marketing-version and platform context where available, without per-build follow-up requests.
A processed build is not necessarily available for internal or external TestFlight testing.

## Inputs

| Argument | Type | Required | Constraints |
| --- | --- | --- | --- |
| `appId` | `string` | Yes | Opaque ID: 1–255 ASCII letters, digits, underscores, or hyphens. |
| `limit` | `integer` | No | Default 20; 1–100. |
| `cursor` | `string` | No | Server-issued continuation token. Repeat the same app ID. |

Unknown arguments and invalid inputs fail before network access. Platform, processing-state
and version filters are not exposed in this initial contract.

## Output

`{ items, nextCursor }`, where each item contains:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Build resource ID. |
| `buildNumber` | `string \| null` | Apple's build `version`, not the marketing version. |
| `uploadedDate` | `string \| null` | Upload date as supplied by Apple. |
| `processingState` | `string \| null` | Apple processing state, including unknown future values. |
| `expirationDate` | `string \| null` | Expiration date as supplied by Apple. |
| `expired` | `boolean \| null` | Apple's expired flag, without inference from dates. |
| `preReleaseVersionId` | `string \| null` | ID from the build's prerelease linkage, if present. |
| `marketingVersion` | `string \| null` | `version` from the matching included prerelease resource. |
| `platform` | `string \| null` | Platform from that resource; unknown future values are preserved. |
| `contextUnavailable` | `boolean` | True if marketing version or platform is unavailable. |

Included resources are joined by exact prerelease ID, never array order or build number.
Multiple builds may share one prerelease resource; identical build numbers across marketing
versions or platforms remain separate records. Missing relationships, links-only or null
linkage, and absent matching includes produce null unavailable fields. Known linkage IDs
and partial context are retained. No fallback to the build number or guessed platform occurs.

Missing required build attributes, malformed linkage, malformed included prerelease resources,
and duplicate included prerelease IDs return `upstream`. Unrequested attributes and resource
types are discarded; asset tokens, tester identities and beta-review details are not returned.
An empty page is successful. Only `nextCursor: null` indicates completion.

## Apple API mapping

`GET /v1/builds` with these fixed query fields:

```text
filter[app]={appId}
fields[builds]=version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion
include=preReleaseVersion
fields[preReleaseVersions]=version,platform
sort=-uploadedDate
```

Apple permits up to 200 builds per page; this tool uses the shared maximum of 100.
See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds).

## Pagination, limits, and errors

Uses the [shared pagination policy](shared-behavior.md#implemented-list_apps-policy).
Cursors are isolated per tool and connection and bind to the app filter and fixed query.
Changing the app returns `invalid_cursor` before access. Next links must match the fixed
Apple origin, `/v1/builds` path and original filters, includes, fields, sort and page size.

At most one Apple page is fetched per call, subject to bounded transport retries.
Context is resolved before buffering, so smaller buffered slices retain the same metadata.
Output is limited to 32 KiB of UTF-8 JSON; each retained page to 1 MiB.
`output_too_large` permits retrying the same cursor with a smaller limit; on the first page,
retry without a cursor. A single oversized record returns `record_too_large` without truncation.
The separate HTTP size limit returns `response_too_large`; restart without a cursor and a
smaller limit. Safe transport errors retain their shared codes.

Example arguments: `{ "appId": "1234567890", "limit": 20 }`.
