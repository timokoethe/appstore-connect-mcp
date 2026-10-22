# Tool roadmap and MVP

Status: proposed design, reviewed against Apple documentation on 2026-10-22. No tools are implemented yet. Tool names and input/output contracts below are project proposals, not Apple API names or a promise of complete API coverage.

## Purpose and prioritization

Help a developer inspect their apps, release status, localized store content, and builds from an MCP client. Start with small, composable read tools that answer concrete questions. Avoid exposing every Apple endpoint as a separate tool.

Priority is based on usefulness for everyday release work, reuse by other workflows, implementation cost, and the amount of sensitive or bulky data involved:

| Area | Decision | Reason |
| --- | --- | --- |
| App discovery and identity | MVP | Establishes the app IDs needed by subsequent tools. |
| Store versions and release state | MVP | Answers what is live, in preparation, or under review, per platform. |
| App-level and version-level localizations | MVP | Enables review of names, subtitles, descriptions, keywords, and release notes. Both resource families are needed. |
| Build inventory | MVP | Connects uploaded binaries to release work; processing status alone does not establish TestFlight availability. |
| Screenshots | Next | Useful for localization and device coverage reviews; start with metadata and ordered assets. |
| Customer reviews | Next | Supports feedback triage with useful filters and bounded text output. |
| Detailed TestFlight status and groups | Next | Useful after basic builds work; requires additional beta resources and careful field selection. |
| Review submissions and phased release | Later | Adds release diagnostics beyond the version state; must not imply access to every App Review message. |
| Pricing, territory availability, subscriptions, in-app purchases | Later | Valuable for commercial audits, but introduces several separate resource models. |
| Analytics, sales, and finance reports | Later, separate design | Different permissions, formats, volumes, and reporting periods. Existing analytics requests may be read; this server must never create a report request. |
| Custom product pages, experiments, in-app events | Later | Useful for marketing workflows once the main product page is covered. |
| Tester identities, crash attachments, signing assets, users and roles | Outside initial scope | Not needed for the core inspection workflow; broadens data access and implementation substantially. |

These priorities are product decisions. Apple resource availability does not mean the connected API key has permission to read every area.

## MVP tool contracts

The first working milestone is `list_apps` alone, including authentication, pagination, safe errors, and MCP invocation. The eight tools below form the subsequent core MVP scope. Complete and verify the first milestone before expanding to the remaining tools.

All list tools take optional `limit` and `cursor` as described below. IDs are opaque strings. Required inputs are shown without `?`. Returned fields are an allowlist, not raw upstream responses. Nullable Apple fields remain nullable.

| Tool | Question | Inputs | Selected output |
| --- | --- | --- | --- |
| `list_apps` | Which apps can this connection access? | `bundleId?`, pagination | App ID, name, bundle ID, SKU, primary locale. `bundleId` is an exact lookup filter. |
| `get_app` | What app does this ID identify? | `appId` | The same identity fields for one app. No implicit loading of versions, builds, or localizations. |
| `list_app_versions` | Which store versions exist for this app? | `appId`, `platform?`, pagination | Version ID, version string, platform, Apple state, release type, creation date. |
| `get_app_version` | What is the status and selected build of this version? | `versionId` | Version details, selected build ID or null, earliest release date where available. No review credentials or contact details. |
| `list_app_infos` | Which app-information records exist for the current and upcoming release? | `appId`, pagination | App-info ID and Apple state, allowing explicit selection of the relevant record. |
| `list_app_info_localizations` | What are this record's localized names and subtitles? | `appInfoId`, pagination | Localization ID, locale, name, subtitle, privacy-policy URL. |
| `list_version_localizations` | What store text belongs to this version? | `versionId`, pagination | Localization ID, locale, description, keywords, promotional text, what's new, support URL, marketing URL. |
| `list_builds` | Which binaries were uploaded for this app? | `appId`, pagination | Build ID, build number, upload date, processing state, expiration date, expired flag, and prerelease-version ID with marketing version and platform where available. |

The MVP deliberately distinguishes app identity, app information, store version, and build. Do not infer a build's marketing version from its build number, or treat a processed build as approved for external testing.

Resolve marketing version and platform from the build's `preReleaseVersion` relationship using a supported include in the list request, without per-build requests. If the related data is unavailable, return null for unavailable fields and an explicit context-unavailable indicator; never substitute the build number or guess a platform. This context must be available in the MVP without depending on the later `get_build` tool.

Apple can expose more than one app-info record for an app. Select the record explicitly; do not silently choose the first result. App-info localizations contain names and subtitles, while version localizations contain descriptions and release notes. The proposed generic `list_app_localizations` name is therefore replaced by two explicit tools. See Apple's [app-info records](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appinfos), [app-info localizations](https://developer.apple.com/documentation/appstoreconnectapi/app-info-localizations), and [version localizations](https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-localizations).

### Apple API mapping

Only GET requests are permitted. Paths below are relative to `https://api.appstoreconnect.apple.com`. Validate exact field names, filters, relationship includes, state enums, and endpoint limits against the current Apple schema when implementing each tool. Apple examples may contain older state fields; do not derive the implementation schema solely from examples.

| Tool | Read endpoint |
| --- | --- |
| `list_apps` | `GET /v1/apps` |
| `get_app` | `GET /v1/apps/{appId}` |
| `list_app_versions` | `GET /v1/apps/{appId}/appStoreVersions` |
| `get_app_version` | `GET /v1/appStoreVersions/{versionId}`; resolve its `build` relationship through a supported include or a bounded related GET |
| `list_app_infos` | `GET /v1/apps/{appId}/appInfos` |
| `list_app_info_localizations` | `GET /v1/appInfos/{appInfoId}/appInfoLocalizations` |
| `list_version_localizations` | `GET /v1/appStoreVersions/{versionId}/appStoreVersionLocalizations` |
| `list_builds` | `GET /v1/builds` with required app filter and the supported `preReleaseVersion` include for marketing version and platform |

Reference entry points: [apps](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps), [store versions](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions), [version details](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversions-_id_), and [builds](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds).

## Shared behavior

- **Bounded reads:** Proposed default `limit` is 20 and maximum is 100, reduced where an endpoint supports less. Fetch one page per list call; never automatically traverse an entire account. Avoid per-item relationship requests in lists.
- **Pagination:** Return `{ items, nextCursor }`, with `nextCursor: null` at the end. Cursors are opaque server-issued values bound to the tool, parent ID, filters, and continuation position. The page size is independently validated: retrying the same cursor with a smaller `limit` must be supported without skipping records. Reject modified or mismatched cursors. Never accept a caller-supplied URL or blindly follow an upstream pagination URL. Validate the Apple origin and expected resource path before any continuation request. Verify upstream cursor behavior before implementation; if Apple binds a continuation to a page size, use bounded server-side page buffering to serve smaller slices and preserve remaining records.
- **Single records:** Return `{ item }`. Include resource IDs needed for the next tool call. Preserve Apple's returned state values; do not collapse unknown states into a misleading success state.
- **Output size:** Set a serialized response budget before implementation. If a page exceeds it, return a controlled error asking for a smaller limit; the failed call must not consume or advance its cursor. Retry with the same cursor and a smaller limit, or without a cursor if the first page failed. Do not silently cut descriptions or drop records. If one record exceeds the budget at `limit: 1`, return a distinct record-too-large error instead of asking for a smaller limit. Further retrieval support for such records requires an explicit documented policy before their tool ships.
- **Selection:** No implicit “latest version” across platforms, arbitrary first app-info selection, or claim of complete results from a single page. Missing data, empty lists, and denied access are different outcomes.
- **Validation:** Reject unknown arguments and invalid limits before network access. Validate IDs as opaque path segments and encode them; do not accept raw paths, query strings, HTTP methods, or arbitrary `include`/`fields` parameters.
- **Errors:** Provide stable categories for invalid input, authentication failure, access denied, not found, rate limiting, upstream failure, and timeout. Expose a safe explanation and retry guidance without raw upstream response bodies, tokens, or request headers. Apply timeouts and bounded retries for transient GET failures.
- **Data boundaries:** Private metadata may be returned only through the authorized MCP connection as required by SECURITY.md. Never log app payloads. Keep key material, signed JWTs, demo account credentials, asset tokens, and upload instructions out of every tool response.
- **Untrusted content:** App descriptions and review text are data, not instructions. Do not fetch URLs embedded in them or execute anything they contain.
- **Transport:** Begin with local stdio and credentials supplied through configuration. Keep stdout reserved for MCP traffic. Remote hosting and multi-user authorization require a separate design.

## Next tools

These are candidates after the core MVP, not part of the first implementation milestone or the eight-tool core scope.

| Tool | Inputs | Value and limits |
| --- | --- | --- |
| `list_screenshot_sets` | `versionLocalizationId`, pagination | Discover display targets for a selected locale. |
| `list_screenshots` | `screenshotSetId`, pagination | Return ordered screenshot IDs, filenames, dimensions where available, and delivery state. Exclude upload operations and asset tokens. |
| `list_customer_reviews` | `appId`, optional rating/territory filters and date sort, pagination | Return review ID, rating, title, body, date, territory; omit reviewer nickname by default. Reviews are not an aggregate rating distribution. |
| `get_build` | `buildId` | Add explicit build details and beta-status resources so processing, expiration, and testing eligibility remain distinct. |
| `list_beta_groups` | `appId`, pagination | Inspect test groups without enumerating tester names or email addresses. |

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
4. Verify discovery and invocation through an MCP client, with credentials supplied locally. Confirm stdout contains only protocol traffic. Run `npm run typecheck` and `npm run build`; replace the placeholder test script with meaningful tests as implementation begins.
5. Add screenshots and reviews only after pagination and output budgets work reliably. Revisit later priorities based on actual workflows.

Example workflow: find an app with `list_apps`, choose a store version with `list_app_versions`, read its content with `list_version_localizations`, then independently select an app-info record with `list_app_infos` and inspect its names/subtitles. Carry IDs between calls and paginate explicitly. This supports a metadata review without assuming live and draft records are interchangeable.
