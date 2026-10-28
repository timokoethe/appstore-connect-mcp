# Tool overview

Status: all eight core MVP tools and both screenshot-metadata tools and customer reviews below are implemented. Tool names are project interfaces, not Apple API names or a promise of complete API coverage. Later extensions are listed in the [roadmap](roadmap.md).

See the [roadmap](roadmap.md) for priorities, later candidates, non-goals, and implementation acceptance. [Shared behavior](tools/shared-behavior.md) defines pagination, limits, validation, errors, and data boundaries once for all tools.

## Core MVP

[`list_apps`](tools/list_apps.md), [`get_app`](tools/get_app.md), [`list_app_versions`](tools/list_app_versions.md), [`get_app_version`](tools/get_app_version.md), [`list_app_infos`](tools/list_app_infos.md), [`list_app_info_localizations`](tools/list_app_info_localizations.md), [`list_version_localizations`](tools/list_version_localizations.md), and [`list_builds`](tools/list_builds.md) are available over local stdio. Use their pages as templates when developing further tool contracts.

All list tools take optional `limit` and `cursor` as described in [shared behavior](tools/shared-behavior.md). IDs are opaque strings. Required inputs are shown without `?`. Returned fields are an allowlist, not raw upstream responses. Nullable Apple fields remain nullable.

| Tool | Question | Inputs | Selected output |
| --- | --- | --- | --- |
| [`list_apps`](tools/list_apps.md) | Which apps can this connection access? | `bundleId?`, pagination | App identity; see tool page for fields. |
| [`get_app`](tools/get_app.md) | What app does this ID identify? | `appId` | Identity fields from [`list_apps`](tools/list_apps.md) for one app. No implicit loading of versions, builds, or localizations. |
| [`list_app_versions`](tools/list_app_versions.md) | Which store versions exist for this app? | `appId`, `platform?`, pagination | Version ID, version string, platform, Apple state, release type, creation date. |
| [`get_app_version`](tools/get_app_version.md) | What is the status and selected build of this version? | `versionId` | Version details, selected build ID or null, earliest release date where available. No review credentials or contact details. |
| [`list_app_infos`](tools/list_app_infos.md) | Which app-information records exist for the current and upcoming release? | `appId`, pagination | App-info ID and Apple `state`, allowing explicit selection of the relevant record. |
| [`list_app_info_localizations`](tools/list_app_info_localizations.md) | What are this record's localized names and subtitles? | `appInfoId`, pagination | Localization ID, locale, name, subtitle, privacy-policy URL. |
| [`list_version_localizations`](tools/list_version_localizations.md) | What store text belongs to this version? | `versionId`, pagination | Localization ID, locale, description, keywords, promotional text, what's new, support URL, marketing URL. |
| [`list_builds`](tools/list_builds.md) | Which binaries were uploaded for this app? | `appId`, pagination | Build ID, build number, upload date, processing state, expiration date, expired flag, prerelease-version ID, marketing version, platform, and `contextUnavailable`. Newest uploads first. |

The MVP deliberately distinguishes app identity, app information, store version, and build. Do not infer a build's marketing version from its build number, or treat a processed build as approved for external testing.

`list_builds` resolves marketing version and platform from the build's `preReleaseVersion` relationship using an include in the list request, without per-build requests. If the related data is unavailable, it returns null for unavailable fields and `contextUnavailable: true`; it never substitutes the build number or guesses a platform. This does not depend on the later `get_build` tool.

Apple can expose more than one app-info record for an app. Select the record explicitly; do not silently choose the first result. App-info localizations contain names and subtitles, while version localizations contain descriptions and release notes. The proposed generic `list_app_localizations` name is therefore replaced by two explicit tools. See Apple's [app-info records](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appinfos), [app-info localizations](https://developer.apple.com/documentation/appstoreconnectapi/app-info-localizations), and [version localizations](https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-localizations).

## Screenshot metadata

| Tool | Question | Inputs | Selected output |
| --- | --- | --- | --- |
| [`list_screenshot_sets`](tools/list_screenshot_sets.md) | Which screenshot display targets exist for this localization? | `versionLocalizationId`, pagination | Set ID and `screenshotDisplayType`. |
| [`list_screenshots`](tools/list_screenshots.md) | Which screenshots belong to this set, in order? | `screenshotSetId`, pagination | Screenshot ID, filename, available width/height, and delivery state. |

Select a version localization explicitly, discover its sets, then read each selected set's
screenshots. Follow cursors to preserve Apple's order. These tools do not download images,
return asset URLs/tokens or upload instructions, or establish submission readiness.

## Apple API mappings

Implemented mappings live on the individual tool pages linked above.

Only GET requests are permitted. API paths in the tool contracts are relative to `https://api.appstoreconnect.apple.com`. Validate exact field names, filters, relationship includes, state enums, and endpoint limits against the current Apple schema when implementing each tool. Apple examples may contain older state fields; do not derive the implementation schema solely from examples.

Reference entry points: [store versions](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions), [version details](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversions-_id_), and [builds](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds).

## Example workflow

Find an app with `list_apps`, choose a store version with `list_app_versions`, read its content with `list_version_localizations`, then independently select an app-info record with `list_app_infos` and inspect its names/subtitles. Carry IDs between calls and paginate explicitly. This supports a metadata review without assuming live and draft records are interchangeable.

## Customer reviews

[`list_customer_reviews`](tools/list_customer_reviews.md) reads bounded review pages with optional rating and territory filters and date sorting. Reviewer nicknames and responses are excluded.
