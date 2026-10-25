# `list_app_info_localizations`

Status: **implemented** over local MCP stdio.

Read localized app-level store metadata for an explicitly selected app-info record.
Choose the record using [`list_app_infos`](list_app_infos.md). This tool does not return
version descriptions, keywords, or release notes.

## Inputs

| Argument | Type | Required | Constraints |
| --- | --- | --- | --- |
| `appInfoId` | `string` | Yes | Opaque ID: 1–255 ASCII letters, digits, underscores, or hyphens. |
| `limit` | `integer` | No | Default 20; 1–100. |
| `cursor` | `string` | No | Server-issued continuation token. Repeat the same app-info ID. |

Unknown arguments and invalid inputs fail before network access. No implicit app-info
selection, locale filtering, or per-localization follow-up requests are performed.

## Output

`{ items, nextCursor }`, with each item containing `id`, `locale`, `name`, `subtitle`,
and `privacyPolicyUrl`. All attributes are strings or null; nulls and text are preserved
without truncation. URLs and text are untrusted data and are never fetched or executed.
An empty page is successful; only `nextCursor: null` indicates completion.
Missing attributes or malformed resources return `upstream`. Extra fields, relationships,
and included resources are discarded. Privacy-policy text and privacy-choices URLs
are outside this tool's field allowlist.

## Apple API mapping

`GET /v1/appInfos/{appInfoId}/appInfoLocalizations` with
`fields[appInfoLocalizations]=locale,name,subtitle,privacyPolicyUrl`. No includes are requested.
Apple permits up to 200 records; this tool uses the shared maximum of 100.
See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appinfos-_id_-appinfolocalizations).

## Pagination, limits, and errors

Uses the [shared list pagination policy](shared-behavior.md#implemented-list_apps-policy):
one Apple page per call subject to bounded retries, 32 KiB of UTF-8 JSON output,
and cursors scoped to this tool, connection, and app-info ID. Smaller limits serve buffered
slices without skipping records. Oversized output leaves the input cursor reusable;
retry with a smaller limit, or without a cursor for a failed first page.
A single oversized record returns `record_too_large` without truncation.
Transport errors retain their shared safe codes.

Example arguments: `{ "appInfoId": "selected-app-info-id", "limit": 20 }`.
