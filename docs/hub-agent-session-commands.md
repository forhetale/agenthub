# Hub Agent built-in session commands

Hub Agent belongs to the `hub-agent` agent family and is published as `kind: built-in` in
the agent catalog. It runs inside Studio and does not require an external CLI.
Studio classifies it by agent identity before inspecting legacy session
source fields. Hermes keeps its existing command list; external CLI agents keep
their own command restrictions. Command lists remain local to the clients.

Group-chat and workflow task inputs bypass the single-chat command parser, even
when they use the legacy coding-agent transport. Slash-prefixed task content is
passed to the native Agent; the persisted session source also guards this boundary.

| Command | Behavior |
| --- | --- |
| `/context` | Estimates the complete snapshot-aware conversation plus the cached Hub Agent system/tool context, using the configured model limit. |
| `/usage` | Reads cumulative recorded Hub Agent usage, including cache tokens; missing usage is shown as unknown. |
| `/status` | Reports the native Hub Agent runtime's working state and queued message count. |
| `/compact` | Manually summarizes context with the shared Studio compressor and persists the same snapshot used by automatic compression. |

`/compress` remains an alias for `/compact`. Compression requires an idle session.
The session is reserved while compression runs; incoming messages queue and resume
afterward. A summarizer failure leaves the previous snapshot intact, reports an
error, releases the reservation and resumes queued work. Hub Agent compression never
falls back to a Hermes process or an external Coding Agent run manager.

Legacy clients and persisted sessions from earlier upstream releases may still carry `source: coding_agent`,
`coding_agent_id: ekko-agent`, or `ekko_agent` usage rows; these are normalized as compatibility
aliases to Hub Agent (`hub-agent` / `builtin_agent`).
Native direct chats persist `source: builtin_agent` and `agent: hub-agent`.
At Studio startup, an idempotent migration updates legacy direct-chat source
and agent fields only; messages, profile, pins, archive state and timestamps
remain unchanged. Group-chat, workflow and global-agent sources are preserved.

History and search display native Hub Agent sessions under **Built-in Agent**, deriving
the family from `hub-agent` (plus legacy `ekko`/`ekko-agent`/`ekko_agent` identities during migration). CLI, API and
legacy coding-agent sources are supported; workflow/group/global surfaces retain
their original buckets. Opening history/search preserves the native runtime IDs
and scoped mode.

Updated clients request `agent_groups=1` on `/api/studio/sessions/hermes/groups`
and `/api/studio/sessions/hermes`. `builtin_agent` is the actual native direct-chat
source; this opt-in also recognizes legacy rows before grouping and paging. Filtering happens before pagination, with separate
native/external cursors; pinned and explicitly included sessions do not advance
these cursors. Default history and search APIs also include physically stored `builtin_agent` rows.
Clients send `source: builtin_agent` and `agent_id: hub-agent`; legacy coding-agent
requests continue to route to Hub Agent and are normalized before queueing and running.
With an older Studio, updated clients derive labels and buckets locally; additional
raw-source pages still load through the original source group until Studio is updated.

The cached system/tool context is available after a run in the current Studio
process. After a restart, `/context` remains an estimate of local assembled history
until the next run refreshes that overhead. It does not present token accounting
as an exact measurement of the provider's current context.
