# Roadmap and MVP

Status: all eight core MVP tools (`list_apps`, `get_app`, `list_app_versions`, `get_app_version`, `list_app_infos`, `list_app_info_localizations`, `list_version_localizations`, and `list_builds`), local stdio startup, and the screenshot-metadata extension (`list_screenshot_sets`, `list_screenshots`) are implemented. Customer reviews (`list_customer_reviews`) are implemented; `get_build` provides detailed build inspection with beta states; `list_beta_groups` is implemented; build-to-group inspection is next. See the [tool overview](tools.md) and the [shared behavior](tools/shared-behavior.md) for current contracts and cross-tool requirements.

## Purpose and prioritization

Help a developer inspect their apps, release status, localized store content, and builds from an MCP client. Start with small, composable read tools that answer concrete questions. Avoid exposing every Apple endpoint as a separate tool.

Priority is based on usefulness for everyday release work, reuse by other workflows, implementation cost, and the amount of sensitive or bulky data involved:

| Area | Decision | Reason |
| --- | --- | --- |
| App discovery and identity | MVP | Establishes the app IDs needed by subsequent tools. |
| Store versions and release state | MVP | Answers what is live, in preparation, or under review, per platform. |
| App-level and version-level localizations | MVP | Enables review of names, subtitles, descriptions, keywords, and release notes. Both resource families are needed. |
| Build inventory | MVP | Connects uploaded binaries to release work; processing status alone does not establish TestFlight availability. |
| Screenshots | Metadata implemented | Set discovery and ordered metadata are available; image download/rendering remains deferred. |
| Customer reviews | Implemented | Supports feedback triage with useful filters and bounded text output. |
| Detailed TestFlight status and groups | Next | Useful after basic builds work; requires additional beta resources and careful field selection. |
| Review submissions and phased release | Later | Adds release diagnostics beyond the version state; must not imply access to every App Review message. |
| Pricing, territory availability, subscriptions, in-app purchases | Later | Valuable for commercial audits, but introduces several separate resource models. |
| Analytics, sales, and finance reports | Later, separate design | Different permissions, formats, volumes, and reporting periods. Existing analytics requests may be read; this server must never create a report request. |
| Custom product pages, experiments, in-app events | Later | Useful for marketing workflows once the main product page is covered. |
| Tester identities, crash attachments, signing assets, users and roles | Outside initial scope | Not needed for the core inspection workflow; broadens data access and implementation substantially. |

These priorities are product decisions. Apple resource availability does not mean the connected API key has permission to read every area.

## Next tools

These are candidates after the core MVP, not part of the first implementation milestone or the eight-tool core scope.

| Tool | Inputs | Value and limits |
| --- | --- | --- |
| `list_customer_reviews` (implemented) | `appId`, optional rating/territory filters and date sort, pagination | Return review ID, rating, title, body, date, territory; omit reviewer nickname by default. Reviews are not an aggregate rating distribution. |
| `get_build` (implemented) | `buildId` | Add explicit build details and beta-status resources so processing, expiration, and testing eligibility remain distinct. |
| `list_beta_groups` (implemented) | `appId`, pagination | Inspect test groups without enumerating tester names or email addresses. |

For screenshots, separate metadata inspection from downloading or rendering images. Image retrieval needs a later policy for validated asset destinations, redirects, size limits, and MIME types. Counting assets alone cannot prove submission readiness. Apple documents [screenshot sets and ordered screenshots](https://developer.apple.com/documentation/appstoreconnectapi/app-screenshot-sets).

Apple's [customer-review endpoint](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-customerreviews) supports rating and territory filters and date/rating sorting. Posting or editing review responses remains excluded.

Analytics must be designed around existing report requests and their reports, instances, and segments. Missing report setup must be reported as a prerequisite; it must not trigger creation of an analytics request. Downloading and parsing reports also needs explicit size and destination limits. See Apple's [Analytics API](https://developer.apple.com/documentation/appstoreconnectapi/analytics).

## Explicit non-goals

- No creation, modification, deletion, uploads, submissions, releases, invitations, or review replies.
- No generic `request`, `fetch_url`, or raw Apple API proxy tool.
- No automatic account-wide export or unrestricted report/image download.
- No server-generated ASO scores, review summaries, or release-readiness verdicts in the MVP. The MCP client can reason over the retrieved data; dedicated analysis tools need clear evidence and completeness rules first.
- No claim to expose every item visible in the App Store Connect website.

## Implementation sequence and acceptance

1. Implement `list_apps` end to end: validated configuration, JWT authentication, GET-only Apple client, tool registration, and stdio startup. Keep the existing `src/config.ts`, `src/apple/`, `src/tools/`, `src/server.ts`, and `src/index.ts` separation.
2. Verify the first tool with synthetic HTTP fixtures: successful and empty pages, continuation, oversized-page retries with the same cursor and a smaller limit, invalid inputs, denied access, rate limits, timeouts, and safe errors. Ensure page-size reductions neither skip nor duplicate records across successful pages. Assert that non-GET requests and untrusted pagination destinations cannot be issued, and credentials cannot appear in output or logs. Verify MCP discovery and invocation for `list_apps` before expanding scope.
3. Add app and version lookup, then app-info and both localization tools. Test explicit record selection and platform separation. Add `list_builds` to complete the core MVP, including marketing-version/platform mapping and unavailable prerelease context. Test builds with identical build numbers across different marketing versions or platforms.
4. Verify discovery and invocation through an MCP client, with credentials supplied locally. Confirm stdout contains only protocol traffic. Run `npm run typecheck`, `npm run build`, and `npm test`. Extend the existing configuration and JWT authentication tests with Apple client and MCP tool coverage as implementation proceeds.
5. Add screenshots and reviews only after pagination and output budgets work reliably. Revisit later priorities based on actual workflows.
