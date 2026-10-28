# `get_build`

Status: **implemented** over local MCP stdio.

Read a selected build using `{ "buildId": "selected-build-id" }`. Obtain IDs from
`list_builds` or the selected build of `get_app_version`. IDs use the shared opaque-ID
constraints. Unknown arguments fail before access. No implicit selection or pagination.

## Output

Returns `{ item }` with the same identity, processing, expiration and prerelease-context
fields as [`list_builds`](list_builds.md), plus:

| Field | Type | Meaning |
| --- | --- | --- |
| `buildBetaDetailId` | string or null | ID from beta-detail linkage, if available. |
| `internalBuildState` | string or null | Apple's internal testing state. |
| `externalBuildState` | string or null | Apple's external testing state. |
| `betaStatusUnavailable` | boolean | True if either beta state is unavailable. |

States are preserved, including unknown future values. Processing, expiration and beta
states are independent; the tool does not infer testing eligibility or group access.
Missing, links-only or null linkage and missing matching included resources produce null
context and an unavailable flag. Partial context retains available fields and linkage IDs.
Included resources are matched by exact type and ID, never array position.

Required attributes must be present (nullable); malformed resources, duplicate included
IDs within a requested resource type, and a mismatched build ID return `upstream`.
Extra attributes, unrelated resource types, asset tokens, tester identities and beta-review
contact details are excluded. Output has a 32 KiB UTF-8 JSON budget; oversized records
return `record_too_large` without truncation. Transport errors retain shared safe codes.

## Apple API mapping

One `GET /v1/builds/{buildId}` with:

```text
fields[builds]=version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion,buildBetaDetail
include=preReleaseVersion,buildBetaDetail
fields[preReleaseVersions]=version,platform
fields[buildBetaDetails]=internalBuildState,externalBuildState
```

No follow-up requests or writes. See [Apple's build endpoint](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_)
and [beta-detail resource](https://developer.apple.com/documentation/appstoreconnectapi/buildbetadetail).
