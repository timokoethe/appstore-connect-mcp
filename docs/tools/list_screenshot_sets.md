# `list_screenshot_sets`

Status: **implemented** over local MCP stdio.

Discover screenshot sets for an explicitly selected App Store version localization.
Use an ID returned by [`list_version_localizations`](list_version_localizations.md);
then pass a set ID to [`list_screenshots`](list_screenshots.md).

## Inputs

| Argument | Type | Required | Constraints |
| --- | --- | --- | --- |
| `versionLocalizationId` | `string` | Yes | Opaque ID: 1–255 ASCII letters, digits, underscores, or hyphens. |
| `limit` | `integer` | No | Default 20; 1–100. |
| `cursor` | `string` | No | Server-issued continuation token. Repeat the same localization ID. |

Unknown arguments and invalid inputs fail before network access. No automatic locale
selection, screenshot includes, device filters, or custom-product-page traversal.

## Output

`{ items, nextCursor }`. Each item contains `id` and `screenshotDisplayType` (`string | null`).
Display types are returned as supplied by Apple, including unknown future values.
Missing attributes or malformed resources return `upstream`; extra fields are discarded.
An empty list is successful. Set presence alone does not establish device coverage,
the presence of usable images, or submission readiness.

## Apple API mapping

`GET /v1/appStoreVersionLocalizations/{versionLocalizationId}/appScreenshotSets`
with `fields[appScreenshotSets]=screenshotDisplayType`. No includes or per-item requests.
Apple permits up to 200 sets per page; this tool uses the shared maximum of 100.
See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversionlocalizations-_id_-appscreenshotsets).

## Pagination, limits, and errors

Uses the [shared pagination policy](shared-behavior.md#implemented-list_apps-policy):
one bounded Apple page per call (subject to transport retries), or a buffered slice;
32 KiB UTF-8 JSON output budget and 1 MiB retained-page and HTTP limits. Only
`nextCursor: null` indicates completion. Increasing `limit` does not combine upstream pages.

Cursors are isolated per tool and connection and bound to the localization ID.
Next links must match the Apple origin, exact localization path and original query fields.
`output_too_large` leaves a cursor reusable with a smaller limit; retry the first page
without a cursor. `record_too_large` never truncates records. For `response_too_large`,
restart without a cursor and a smaller limit. Shared safe error codes apply.

Example: `{ "versionLocalizationId": "selected-localization-id", "limit": 20 }`.
