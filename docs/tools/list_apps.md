# `list_apps`

Status: **planned; not implemented**. Proposed contract for the first milestone.

See the [tool overview](../tools.md), [shared behavior](shared-behavior.md), and [implementation acceptance](../roadmap.md#implementation-sequence-and-acceptance).

## Purpose

Discover accessible apps and their IDs for subsequent tool calls. Optionally filter by exact bundle ID.

## Inputs

| Argument | Proposed type | Required | Default and constraints |
| --- | --- | --- | --- |
| `bundleId` | `string` | No | No filter when omitted. Exact bundle ID lookup, not substring search. |
| `limit` | `integer` | No | Shared default and maximum; see [bounded reads](shared-behavior.md). |
| `cursor` | `string` | No | Omit for the first page. Use the returned `nextCursor` to continue with the same filters. See [pagination rules](shared-behavior.md). |

## Output

The proposed result is `{ items, nextCursor }`:

| Field | Proposed type | Meaning |
| --- | --- | --- |
| `items` | `array` | App identity records in this page. An empty array is a successful result with no matching records on that page. |
| `items[].id` | `string` | Opaque app ID for subsequent tool calls. |
| `items[].name` | `string \| null` | App name. |
| `items[].bundleId` | `string \| null` | Bundle identifier. |
| `items[].sku` | `string \| null` | App SKU. |
| `items[].primaryLocale` | `string \| null` | Primary locale. |
| `nextCursor` | `string \| null` | Opaque continuation cursor, or `null` when there is no next page. |

Attribute nullability is provisional. Verify field requirements and handling of missing or malformed fields before implementation; preserve upstream nulls. Access failures use the shared error categories.

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

Validate fields, filters, limits, and continuation behavior against the current Apple schema before implementation.

## Limits and open decisions

Results cover apps visible to this connection. No implicit loading of versions, builds, or localizations. Shared pagination and completeness rules apply.

Before shipping, define bundle ID validation here, and the response budget and error codes/envelope in [shared behavior](shared-behavior.md).
