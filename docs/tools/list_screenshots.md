# `list_screenshots`

Status: **implemented** over local MCP stdio.

Read screenshot metadata for an explicitly selected set returned by
[`list_screenshot_sets`](list_screenshot_sets.md). No image downloads or rendering.

## Inputs

| Argument | Type | Required | Constraints |
| --- | --- | --- | --- |
| `screenshotSetId` | `string` | Yes | Opaque ID: 1–255 ASCII letters, digits, underscores, or hyphens. |
| `limit` | `integer` | No | Default 20; 1–100. |
| `cursor` | `string` | No | Server-issued continuation token. Repeat the same set ID. |

Unknown arguments and invalid inputs fail before network access.

## Output

`{ items, nextCursor }`, with each item containing:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Screenshot resource ID. |
| `fileName` | `string \| null` | Original filename, returned as untrusted text. |
| `width` | `integer \| null` | Width from `imageAsset`, if available. |
| `height` | `integer \| null` | Height from `imageAsset`, if available. |
| `assetDeliveryState` | `string \| null` | `assetDeliveryState.state`, including unknown future values. |

Items preserve Apple's ordered screenshot relationship. Concatenate pages in cursor order;
IDs and filenames are not sort keys. No absolute positions or snapshot consistency are
claimed: concurrent upstream changes may affect subsequent pages.

Absent, null, or partial `imageAsset` and `assetDeliveryState` objects yield null for
unavailable dimensions or state. Known values are retained independently. Dimensions,
when present, must be positive safe integers. Missing `fileName`, malformed objects or
invalid field types return `upstream`. Null filenames and empty lists are valid.

Only these fields are returned. Image template URLs, asset tokens, checksums, upload
operations, and delivery error/warning payloads are discarded. Filenames are never used
as file paths or fetched. Missing metadata does not imply success; counts and delivery
state alone do not establish submission readiness.

## Apple API mapping

`GET /v1/appScreenshotSets/{screenshotSetId}/appScreenshots` with
`fields[appScreenshots]=fileName,imageAsset,assetDeliveryState`. No includes, client-side
sorting, or per-item requests. `imageAsset` is requested only for its dimensions;
its URL is neither returned nor fetched. Apple permits up to 200 screenshots per page;
this tool uses the shared maximum of 100.
See [Apple's ordered screenshot endpoint](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appscreenshotsets-_id_-appscreenshots).

## Pagination, limits, and errors

Uses the [shared pagination policy](shared-behavior.md#implemented-list_apps-policy):
one bounded Apple page per call (subject to transport retries), or a buffered slice;
32 KiB UTF-8 JSON output budget and 1 MiB retained-page and HTTP limits. Only
`nextCursor: null` indicates completion. Smaller buffered slices preserve screenshot order.

Cursors are isolated per tool and connection and bound to the set ID. Next links must
match the Apple origin, exact set path and original query fields. `output_too_large`
leaves a cursor reusable with a smaller limit; retry the first page without a cursor.
`record_too_large` never truncates metadata. For `response_too_large`, restart without
a cursor and a smaller limit. Shared safe error codes apply.

Example: `{ "screenshotSetId": "selected-set-id", "limit": 20 }`.
