# `list_customer_reviews`

Status: **implemented** over local MCP stdio.

Read customer reviews for an explicitly selected app. Reviews are not an aggregate rating distribution.

## Inputs

- `appId`: required opaque resource ID, using the shared ID constraints.
- `rating`: optional integer from 1 to 5; filters for one rating.
- `territory`: optional three uppercase ASCII letters, such as `DEU`; Apple validates territory availability.
- `sort`: `createdDate` or `-createdDate` (default, newest first).
- `limit`: integer 1–100, default 20.
- `cursor`: server-issued continuation token; repeat the same app, filters and sort.

Unknown arguments fail before network access.

## Output and boundaries

Returns `{ items, nextCursor }`. Each item contains `id`, `rating`, `title`, `body`,
`createdDate`, and `territory`. Attributes may be null; missing or malformed attributes
return `upstream`. Review text is returned unchanged as untrusted data.
Reviewer nicknames, responses, relationships and included resources are discarded.
No responses are posted and no URLs in review text are fetched.

Uses the [shared pagination and error policy](shared-behavior.md): 32 KiB UTF-8 JSON
output budget, connection-scoped cursors, safe transport errors, and buffered smaller-limit
retries without skipped records. Oversized records return `record_too_large` without
truncation. Only `nextCursor: null` indicates completion.

## Apple mapping

`GET /v1/apps/{appId}/customerReviews`, with
`fields[customerReviews]=rating,title,body,createdDate,territory`, explicit `sort`, and
optional `filter[rating]` and `filter[territory]`. No includes. The shared limit of 100
is below Apple's endpoint maximum of 200.

See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-customerreviews).

Example: `{ "appId": "1234567890", "rating": 1, "territory": "DEU", "limit": 20 }`.
