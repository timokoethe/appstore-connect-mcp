# Roadmap and MVP

The core inspection workflow and extensions for screenshot metadata, customer reviews,
build beta states, and TestFlight groups are implemented. See the [tool reference](tools.md)
for the current 14 tools and [shared behavior](tools/shared-behavior.md) for their limits.

## Purpose and prioritization

Help a developer inspect their apps, release status, localized store content, and builds from an MCP client. Start with small, composable read tools that answer concrete questions. Avoid exposing every Apple endpoint as a separate tool.

Priority is based on usefulness for everyday release work, reuse by other workflows, implementation cost, and the amount of sensitive or bulky data involved:

| Area | Decision | Reason |
| --- | --- | --- |
| App discovery and identity | Implemented | Establishes the app IDs needed by subsequent tools. |
| Store versions and release state | Implemented | Answers what is live, in preparation, or under review, per platform. |
| App-level and version-level localizations | Implemented | Enables review of names, subtitles, descriptions, keywords, and release notes. Both resource families are needed. |
| Build inventory | Implemented | Connects uploaded binaries to release work; processing status alone does not establish TestFlight availability. |
| Screenshots | Metadata implemented | Set discovery and ordered metadata are available; image download/rendering remains deferred. |
| Customer reviews | Implemented | Supports feedback triage with useful filters and bounded text output. |
| Build beta states and TestFlight groups | Implemented | Inspect internal/external states, groups, and associated builds without tester identities. |
| Review submissions and phased release | Later | Adds release diagnostics beyond the version state; must not imply access to every App Review message. |
| Pricing, territory availability, subscriptions, in-app purchases | Later | Valuable for commercial audits, but introduces several separate resource models. |
| Analytics, sales, and finance reports | Later, separate design | Different permissions, formats, volumes, and reporting periods. Existing analytics requests may be read; this server must never create a report request. |
| Custom product pages, experiments, in-app events | Later | Useful for marketing workflows once the main product page is covered. |
| Tester identities, crash attachments, signing assets, users and roles | Outside initial scope | Not needed for the core inspection workflow; broadens data access and implementation substantially. |

These priorities are product decisions. Apple resource availability does not mean the connected API key has permission to read every area.

## Future candidates

The areas marked “Later” above are candidates, not committed release milestones.
New tools should answer a concrete inspection question and reuse the shared validation,
pagination, output budgets, and safe errors.

For screenshots, separate metadata inspection from downloading or rendering images. Image retrieval needs a later policy for validated asset destinations, redirects, size limits, and MIME types. Counting assets alone cannot prove submission readiness. Apple documents [screenshot sets and ordered screenshots](https://developer.apple.com/documentation/appstoreconnectapi/app-screenshot-sets).

Apple's [customer-review endpoint](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-customerreviews) supports rating and territory filters and date/rating sorting. Posting or editing review responses remains excluded.

Analytics must be designed around existing report requests and their reports, instances, and segments. Missing report setup must be reported as a prerequisite; it must not trigger creation of an analytics request. Downloading and parsing reports also needs explicit size and destination limits. See Apple's [Analytics API](https://developer.apple.com/documentation/appstoreconnectapi/analytics).

## Explicit non-goals

- No creation, modification, deletion, uploads, submissions, releases, invitations, or review replies.
- No generic `request`, `fetch_url`, or raw Apple API proxy tool.
- No automatic account-wide export or unrestricted report/image download.
- No server-generated ASO scores, review summaries, or release-readiness verdicts in the MVP. The MCP client can reason over the retrieved data; dedicated analysis tools need clear evidence and completeness rules first.
- No claim to expose every item visible in the App Store Connect website.

## Acceptance for new tools

- Keep Apple operations GET-only and select only the fields needed for the tool.
- Document inputs, output fields, API mapping, limits, and unavailable-data behavior.
- Use synthetic fixtures for successful and empty results, invalid inputs, malformed
  upstream data, access failures, and output limits. Automated tests must make no network requests.
- For lists, verify cursor binding, safe continuation destinations, and smaller-limit
  retries without skipped or duplicated buffered records.
- Verify MCP discovery and invocation, keep stdout reserved for protocol traffic, and
  ensure credentials and raw upstream errors cannot appear in responses or logs.
- Run `npm run typecheck`, `npm run build`, and `npm test`.
