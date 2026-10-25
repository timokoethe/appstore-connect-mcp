# `get_app_version`

Status: **implemented** over local MCP stdio.

Read an explicitly selected store version, its release state, and selected build ID.

## Inputs

Required `versionId`: an opaque string of 1–255 ASCII letters, digits, underscores, or
hyphens, obtained from [`list_app_versions`](list_app_versions.md). Unknown arguments,
numeric IDs, paths, and URLs are rejected before network access.

## Output

`{ item }` with the same fields as a version list item: `id`, `versionString`, `platform`,
`appVersionState`, `releaseType`, and `createdDate`. Adds:

| Field | Type | Meaning |
| --- | --- | --- |
| `earliestReleaseDate` | `string \| null` | Apple's earliest release date, not a guarantee of actual release timing. |
| `buildId` | `string \| null` | Selected build ID; null only when Apple explicitly returns null build linkage. |

Null attributes and unknown state values are preserved. Missing fields, a mismatched
version ID, or missing/malformed build linkage return `upstream`; missing linkage is not
interpreted as no selected build. Review credentials, contact details, included build
attributes, and unrelated relationships are never returned.

## Apple API mapping

One logical `GET /v1/appStoreVersions/{versionId}` with:

- `fields[appStoreVersions]=versionString,platform,appVersionState,releaseType,createdDate,earliestReleaseDate,build`
- `include=build`
- `fields[builds]=version`

The supported build include supplies resource linkage in the same response. The selected
ID comes from `relationships.build.data`, not an arbitrary included resource. Included
build attributes are discarded; no subsequent build lookup is made. Transport retries apply.
See [Apple's endpoint documentation](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversions-_id_).

## Limits and errors

The UTF-8 JSON representation of `{ item }` is limited to 32 KiB, excluding MCP overhead
and duplication into text and structured content. An oversized record returns
`record_too_large`, without partial data; inspect it directly in App Store Connect.
The HTTP client's separate 1 MiB response limit applies.

A missing resource returns `not_found`, denied access returns `access_denied`, and other
failures retain the [shared error categories](shared-behavior.md). Errors use `isError: true`
and text JSON `{ "error": { "code": "…", "message": "…" } }` with no upstream payloads.

Example arguments: `{ "versionId": "version-123" }`.
