# `get_app`

Status: **implemented** over local MCP stdio.

Read one app's identity by ID without loading versions, builds, localizations, or relationships.
See the [tool overview](../tools.md) and [shared behavior](shared-behavior.md).

## Inputs

| Argument | Type | Required | Constraints |
| --- | --- | --- | --- |
| `appId` | `string` | Yes | Opaque ID, 1–255 ASCII letters, digits, underscores, or hyphens. Not a bundle ID, URL, or path. |

Unknown arguments are rejected. IDs are not trimmed or coerced from numbers. Invalid arguments
return `invalid_input` before any Apple request. Use an ID returned by `list_apps`.

## Output

The result is `{ item }`. The item has the same identity fields as [`list_apps`](list_apps.md):
`id`, `name`, `bundleId`, `sku`, and `primaryLocale`. Attributes can be null and are preserved.
Missing fields, incorrect types, unsafe IDs, and an ID that differs from the requested app
produce a safe `upstream` error. Extra upstream fields and relationships are discarded.

Synthetic example:

```json
{ "appId": "1234567890" }
```

```json
{
  "item": {
    "id": "1234567890",
    "name": "Sample App",
    "bundleId": "com.example.sampleapp",
    "sku": "sample-app-ios",
    "primaryLocale": "en-US"
  }
}
```

## Apple API mapping

One logical GET to `/v1/apps/{appId}` on the fixed Apple API origin, with
`fields[apps]=name,bundleId,sku,primaryLocale`. The validated ID is encoded as a path segment.
There are no includes or follow-up requests. The HTTP client's bounded retries still apply.
Reference: [Apple's read app information endpoint](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_).

## Limits and errors

The UTF-8 JSON representation of `{ item }` is limited to 32 KiB, excluding the MCP envelope
and duplication into text and structured content. An oversized record returns
`record_too_large`; no attributes are truncated. There is no smaller limit to request;
inspect that record directly in App Store Connect. The HTTP client's separate 1 MiB
response limit also applies.

A missing app returns `not_found`; denied access returns `access_denied`. Neither is
represented as `{ item: null }`. Other HTTP errors retain the shared safe categories.
MCP failures set `isError: true` and return text JSON `{ "error": { "code": "…", "message": "…" } }`
without raw Apple error bodies or caller-supplied values.
