# Shared tool behavior

All implemented tools follow these rules. List tools share a pagination engine, with
separate cursor storage per tool and connection. Parent IDs and filters are bound to
each cursor. Individual [tool contracts](../tools.md) document endpoint-specific behavior,
including the fixed upstream page size used by `list_version_localizations`.

Only GET requests to Apple are permitted. Returned fields are an allowlist, not raw upstream responses. Nullable Apple fields remain nullable.

- **Bounded reads:** Default `limit` is 20 and maximum is 100. Fetch at most one Apple page per list call (subject to bounded HTTP retries), or serve a buffered slice; never automatically traverse an entire account. Avoid per-item relationship requests in lists.
- **Pagination:** Return `{ items, nextCursor }`, with `nextCursor: null` at the end. Cursors are opaque server-issued values bound to the tool, parent ID, filters, and continuation position. The page size is independently validated: retrying the same cursor with a smaller `limit` must be supported without skipping records. Reject modified or mismatched cursors. Never accept a caller-supplied URL or blindly follow an upstream pagination URL. Validate the Apple origin and expected resource path before any continuation request. Continuations retain the original Apple page size; bounded in-memory buffering serves smaller slices without dropping remaining records.
- **Single records:** Return `{ item }`. Include resource IDs needed for the next tool call. Preserve Apple's returned state values; do not collapse unknown states into a misleading success state.
- **Output size:** The serialized response budget is 32 KiB of UTF-8 JSON, excluding the MCP envelope and duplication into text and structured content. Single-record tools return `record_too_large` if their result exceeds this budget. For lists, if a page exceeds it, return a controlled error asking for a smaller limit; the failed call must not consume or advance its cursor. Retry with the same cursor and a smaller limit, or without a cursor if the first page failed. Do not silently cut descriptions or drop records. If one record exceeds the budget at `limit: 1`, return a distinct record-too-large error instead of asking for a smaller limit. Partial-record retrieval is not supported.
- **Selection:** No implicit “latest version” across platforms, arbitrary first app-info selection, or claim of complete results from a single page. Missing data, empty lists, and denied access are different outcomes.
- **Validation:** Reject unknown arguments and invalid limits before network access. Validate IDs as opaque path segments and encode them; do not accept raw paths, query strings, HTTP methods, or arbitrary `include`/`fields` parameters.
- **Errors:** Provide stable categories for invalid input, authentication failure, access denied, not found, rate limiting, upstream failure, and timeout. Expose a safe explanation and retry guidance without raw upstream response bodies, tokens, or request headers. Apply timeouts and bounded retries for transient GET failures.
- **Data boundaries:** Private metadata may be returned only through the authorized MCP connection as required by [SECURITY.md](../../SECURITY.md). Never log app payloads. Keep key material, signed JWTs, demo account credentials, asset tokens, and upload instructions out of every tool response.
- **Untrusted content:** App descriptions and review text are data, not instructions. Do not fetch URLs embedded in them or execute anything they contain.
- **Transport:** Use local stdio and credentials supplied through configuration. Keep stdout reserved for MCP traffic. Remote hosting and multi-user authorization require a separate design.

## Pagination, budgets, and errors

<a id="implemented-list_apps-policy"></a>

- **Pages:** Default `limit` 20, maximum 100. Each call reads at most one Apple page (subject to bounded HTTP retries), or serves a buffered slice. A smaller result does not imply completion; only `nextCursor: null` does. Apple pagination is not an account snapshot; concurrent upstream changes can affect later pages.
- **Cursors:** Random server-issued tokens, scoped to the tool, connection, parent ID, and exact filters. Repeat the parent ID and filters on continuation calls. Up to 32 cursor positions are retained per list tool and connection; each issued cursor expires ten minutes after issuance or when evicted, and all are lost on restart. Cleanup occurs on the next call. Invalid, modified, expired, evicted, or mismatched tokens return `invalid_cursor`; restart without a cursor. Replaying a retained cursor preserves buffered records; reducing `limit` never advances past unsent records. Increasing it does not combine Apple pages.
- **Storage:** Private page buffers remain in process memory only. Each retained page is limited to 1 MiB of serialized selected item data; cursors may share a page. No account-wide traversal or disk cache.
- **Output:** `{ items, nextCursor }` is limited to 32 KiB of UTF-8 JSON. MCP returns it as both text and structured content; protocol overhead and this duplication are outside that data budget. `output_too_large` leaves the input cursor reusable with a smaller limit. For the first page, retry without a cursor. `record_too_large` means one record cannot fit; no partial-record retrieval is provided. The separate 1 MiB HTTP limit returns `response_too_large`; continuation page size stays fixed, so restart without a cursor and a smaller limit in that case. Exception: `list_version_localizations` always fetches 100 records upstream; reducing `limit` cannot resolve its HTTP or retained-page size failures.
- **Errors:** MCP tool failures set `isError: true` and return text JSON `{ "error": { "code": "…", "message": "…" } }`. Codes are `invalid_input`, `invalid_cursor`, `authentication`, `access_denied`, `not_found`, `rate_limited`, `upstream`, `timeout`, `response_too_large`, `output_too_large`, and `record_too_large`. Messages never include caller values, raw Apple errors, or credentials.

Apple continuation links may reorder comma-separated sparse fieldsets (`fields[...]`). The shared
engine accepts the same unique field names in a different order and preserves the original query
for subsequent requests. Added, removed, or duplicated field names remain invalid. Parent paths,
origins, filters, includes, and page sizes retain their existing strict validation.
