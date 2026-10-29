# Tool reference

All 14 tools below are implemented over local MCP stdio. They provide selected,
read-only App Store Connect data, not complete Apple API coverage.

List tools return `{ items, nextCursor }`; single-record tools return `{ item }`.
All lists accept optional `limit` (default 20, maximum 100) and `cursor`.
Repeat the parent ID and any filters when continuing a list. Only
`nextCursor: null` indicates completion. See [shared behavior](tools/shared-behavior.md)
for cursor lifetime, output limits, and errors.

## Available tools

Required inputs are listed below; follow each tool's link for optional filters,
output fields, examples, and Apple API mappings.

| Tool | Required input | Returns |
| --- | --- | --- |
| [`list_apps`](tools/list_apps.md) | None | Accessible app IDs, names, bundle IDs, SKUs, and primary locales. |
| [`get_app`](tools/get_app.md) | `appId` | Identity fields for one app. |
| [`list_app_versions`](tools/list_app_versions.md) | `appId` | Store versions, platforms, and release states; optional platform filter. |
| [`get_app_version`](tools/get_app_version.md) | `versionId` | Version details, selected build ID, and earliest release date. |
| [`list_app_infos`](tools/list_app_infos.md) | `appId` | App-information record IDs and states for explicit selection. |
| [`list_app_info_localizations`](tools/list_app_info_localizations.md) | `appInfoId` | Localized names, subtitles, and privacy-policy URLs. |
| [`list_version_localizations`](tools/list_version_localizations.md) | `versionId` | Descriptions, keywords, promotional text, release notes, and support/marketing URLs. |
| [`list_builds`](tools/list_builds.md) | `appId` | Uploaded builds, newest first, with processing, expiration, and available marketing-version/platform context. |
| [`get_build`](tools/get_build.md) | `buildId` | Build details and available internal/external beta states. |
| [`list_beta_groups`](tools/list_beta_groups.md) | `appId` | TestFlight group IDs, names, and internal-group flags. |
| [`list_beta_group_builds`](tools/list_beta_group_builds.md) | `betaGroupId` | Associated builds in Apple order; use `get_build` for marketing-version/platform context. |
| [`list_customer_reviews`](tools/list_customer_reviews.md) | `appId` | Reviews with optional rating/territory filters and date sorting; excludes reviewer nicknames and responses. |
| [`list_screenshot_sets`](tools/list_screenshot_sets.md) | `versionLocalizationId` | Screenshot set IDs and display types. |
| [`list_screenshots`](tools/list_screenshots.md) | `screenshotSetId` | Ordered filenames, available dimensions, and delivery states; no image downloads or asset URLs. |

## Example workflows

- **Store metadata:** `list_apps` → `list_app_versions` → select a version →
  `list_version_localizations`. For names and subtitles, use `list_app_infos` →
  select a record → `list_app_info_localizations`.
- **Release build:** `get_app_version` → use its non-null `buildId` with `get_build`.
- **TestFlight group:** `list_beta_groups` → select a group →
  `list_beta_group_builds` → `get_build` for selected builds.
- **Screenshots:** `list_version_localizations` → select a localization →
  `list_screenshot_sets` → select a set → `list_screenshots`.

Carry returned IDs between calls and paginate each list explicitly. App identity,
app information, store version, and build are separate resources. Do not assume
that the first app-info record is live or that a version is the latest across platforms.
A build number is not its marketing version; processing state and group membership
alone do not establish testing eligibility. Screenshot counts do not prove submission readiness.

For planned coverage and scope boundaries, see the [roadmap](roadmap.md).
