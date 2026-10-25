# `list_apps`

Status: **implemented** over local MCP stdio.

See the [tool overview](../tools.md), [shared behavior](shared-behavior.md), and [implementation acceptance](../roadmap.md#implementation-sequence-and-acceptance).

## Purpose

Discover accessible apps and their IDs for subsequent tool calls. Optionally filter by exact bundle ID.

## Inputs

| Argument | Type | Required | Default and constraints |
| --- | --- | --- | --- |
| `bundleId` | `string` | No | Omit for no filter. Exact match; 1–255 characters, dot-separated non-empty groups of ASCII letters, digits, or hyphens. No wildcards, whitespace, or comma-separated values. |
| `limit` | `integer` | No | Shared default and maximum; see [bounded reads](shared-behavior.md). |
| `cursor` | `string` | No | Omit for the first page. Use the returned `nextCursor` to continue with the same filters. See [pagination rules](shared-behavior.md). |

## Output

The result is `{ items, nextCursor }`:

| Field | Type | Meaning |
| --- | --- | --- |
| `items` | `array` | App identity records in this page. An empty array is a successful result with no matching records on that page. |
| `items[].id` | `string` | Opaque app ID for subsequent tool calls. |
| `items[].name` | `string \| null` | App name. |
| `items[].bundleId` | `string \| null` | Bundle identifier. |
| `items[].sku` | `string \| null` | App SKU. |
| `items[].primaryLocale` | `string \| null` | Primary locale. |
| `nextCursor` | `string \| null` | Opaque continuation cursor, or `null` when there is no next page. |

Null attributes are preserved. Missing attributes, incorrect types, or malformed resource IDs produce a safe `upstream` error; extra Apple fields are discarded. IDs use the same 1–255 character ASCII letter, digit, underscore, or hyphen constraint as [`get_app`](get_app.md). Access failures use the shared error categories.

## Example

Synthetic example: tool arguments and result data, without the MCP envelope.

Arguments:

```json
{
  "bundleId": "com.example.sampleapp",
  "limit": 20
}
```

Result:

```json
{
  "items": [
    {
      "id": "1234567890",
      "name": "Sample App",
      "bundleId": "com.example.sampleapp",
      "sku": "sample-app-ios",
      "primaryLocale": "en-US"
    }
  ],
  "nextCursor": null
}
```

## Apple API mapping

- Read endpoint: `GET /v1/apps`, relative to `https://api.appstoreconnect.apple.com`.
- Map the optional bundle ID to Apple's exact bundle ID filter; request only the identity attributes needed by the output contract.
- No relationship includes or per-app follow-up requests are needed.
- Reference: [Apple's list apps endpoint](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps).

Requests select `fields[apps]=name,bundleId,sku,primaryLocale`; `bundleId` maps to `filter[bundleId]`. Continuations retain the original Apple page size and filters; smaller tool pages are served from a bounded buffer.

## Limits

Results cover apps visible to this connection. No implicit loading of versions, builds, or localizations. Shared pagination and completeness rules apply.

See the [implemented policy](shared-behavior.md#implemented-list_apps-policy) for cursor expiration, budgets, and errors. A record exceeding the output budget cannot be retrieved through this tool; inspect it directly in App Store Connect.
