# Files and Data Persistence Architecture

## Why this document exists

The Files and Data panel introduced a second persistence path in the app. This is intentional and architecturally important. This document explains:

- how notebook session persistence differs from filesystem persistence,
- why both are kept separate,
- what "Persistent" vs fallback states mean in practice,
- and what guarantees users should expect.

## Two persistence systems, one browser

PyNote now persists two different domains:

1. Notebook session state (document-level)
- Lives in app-level session storage flow.
- Shape is structured notebook JSON: cells, history, metadata, visibility settings, theme/session options.
- Managed from main-thread app logic.

2. Files and Data filesystem state (runtime file tree)
- Lives in Pyodide worker filesystem under `/workspace`.
- Shape is hierarchical files and directories, including binary payloads.
- Managed from worker filesystem logic.

Both persist to browser storage, but through different engines and data models.

## New Files and Data system (implemented architecture)

Before comparing persistence models, here is the concrete Files and Data system that was added.

### Components

1. Files and Data UI (`FileWorkspacePanel`)
- Renders file browser UX in two modes: side panel and dialog.
- Sends typed filesystem commands through the kernel bridge.

2. Kernel bridge (`kernel.filesystem(...)`)
- Main-thread API that forwards filesystem requests to the worker.
- Preserves a clean UI-to-worker contract.

3. Worker filesystem service (`filesystem` message handler)
- Validates and normalizes paths.
- Enforces root sandboxing to `/workspace`.
- Executes file operations (`list`, `upload`, `mkdir`, `rename`, `move`, `copy`, `delete`, `read_text`, `download`).

4. Persistence adapter (IDBFS sync layer)
- Mounts IDBFS at `/workspace` when available.
- Hydrates runtime FS on startup.
- Flushes mutations back to browser storage after writes.

### End-to-end operation path

1. User action in panel (example: upload file).
2. UI calls `kernel.filesystem({ op: "upload", ... })`.
3. Worker receives `filesystem` request and resolves target path under `/workspace`.
4. Worker executes filesystem mutation in Pyodide FS.
5. If persistence is enabled, worker flushes via sync to browser storage.
6. Worker returns operation result.
7. UI refreshes listing, then reads and renders persistence status from `list`.

### Scope and guarantees of this system

- Files and directories are sandboxed to `/workspace`.
- Persistence behavior is runtime-aware (persistent mode when IDBFS is mounted, fallback mode otherwise).
- The system is intentionally owned by the worker/runtime layer, not the notebook document/session layer.

## Why not store Files and Data in the notebook session store?

Keeping filesystem persistence separate is a deliberate architecture choice.

### Data model mismatch

Notebook session persistence is optimized for JSON document state. Filesystem persistence needs file operations and tree semantics:

- rename / move / copy / recursive delete
- binary file payloads
- directory traversal and metadata

Encoding filesystem state into notebook session JSON would add heavy transforms and brittle logic.

### Runtime ownership boundary

File operations execute inside the Pyodide worker. Persisting at that layer keeps ownership local to where the filesystem actually exists.

### Performance and churn

Notebook autosave is frequent and lightweight. Filesystem payloads can be large and binary-heavy. Merging them would bloat session snapshots and increase write amplification.

### Failure isolation

Notebook session save and filesystem sync can fail independently. Separation reduces blast radius and simplifies debugging.

## Filesystem persistence flow

### 1) Worker startup

- Create/ensure root `/workspace`.
- Attempt to mount IDBFS at `/workspace`.
- If mount succeeds: mark persistence enabled, then hydrate runtime FS from browser storage.
- If mount fails: continue with ephemeral in-memory FS.

### 2) Runtime operations

The worker handles filesystem requests:

- `list`, `mkdir`, `upload`, `delete`, `rename`, `move`, `copy`, `read_text`, `download`

Mutating operations call sync flush so changes are committed to backing storage when persistence is enabled.

### 3) UI status

`list` returns `persistent: boolean`.
The panel renders status from this flag.

## State meanings in Files and Data

### Persistent

- IDBFS mount succeeded.
- `/workspace` is backed by browser storage.
- Files survive refresh/reload and worker/kernel recreation (unless browser storage is cleared/evicted).

### Session memory (fallback label)

- IDBFS mount unavailable.
- Files exist only in runtime memory.
- Files are lost when runtime is recreated.

Note: in app terminology, "session" may survive refresh/reload for notebook state. The fallback label here refers specifically to filesystem runtime behavior, not notebook session semantics.

## Architectural comparison

| Concern | Notebook session persistence | Files and Data persistence |
|---|---|---|
| Owner | Main thread app/session layer | Pyodide worker filesystem layer |
| Data shape | Notebook JSON/document state | File tree + binary content |
| Operations | Snapshot save/restore | Filesystem ops + sync flush |
| Typical payload | Small/medium structured data | Potentially large binary datasets |
| Best-fit engine | App session store | IDBFS via Pyodide FS |

## Practical implications for users

- Notebook content and Files and Data are persisted independently.
- A successful notebook autosave does not imply filesystem sync success, and vice versa.
- Persistent filesystem mode is expected to retain uploads across reloads/restarts.
- Browser storage lifecycle still applies (clear site data/private mode/quota eviction can remove persisted data).

## Tradeoff and rationale

Yes, this introduces a second persistence system. The tradeoff is accepted because it avoids:

- complex filtering/translation between incompatible data structures,
- inefficient binary-in-JSON session payloads,
- and reimplementation of filesystem semantics in session code.

The result is cleaner boundaries and lower maintenance risk.

## Code references

Use these references to validate each architectural claim in implementation code.

### Filesystem persistence in worker

- Root and persistence state: [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L5-L6)
- Path normalization and `/workspace` sandboxing: [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L23-L31)
- IDBFS mount and startup hydration (`syncfs(true)`): [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L62-L76)
- Sync helper and flush behavior (`syncfs`): [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L52-L60)
- Filesystem operations handler (`list`, `mkdir`, `upload`, `delete`, `rename`, `move`, `copy`, `read_text`, `download`): [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L155-L274)
- `list` returns persistence flag: [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L163-L167)
- Worker init calls filesystem setup: [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L2546-L2547)
- Worker filesystem message route: [src/lib/pyodide.worker.ts](../../src/lib/pyodide.worker.ts#L2667-L2682)

### Kernel bridge

- Typed filesystem request contract: [src/lib/pyodide.ts](../../src/lib/pyodide.ts#L17-L26)
- `kernel.filesystem(...)` request/response bridge: [src/lib/pyodide.ts](../../src/lib/pyodide.ts#L212-L231)

### Files and Data UI

- Panel calls through kernel bridge: [src/components/FileWorkspacePanel.tsx](../../src/components/FileWorkspacePanel.tsx#L142-L274)
- UI reads persistence from `list` and stores state: [src/components/FileWorkspacePanel.tsx](../../src/components/FileWorkspacePanel.tsx#L142-L148)
- Status rendering labels (`Persistent` / `Session memory`): [src/components/FileWorkspacePanel.tsx](../../src/components/FileWorkspacePanel.tsx#L667-L675)

### Notebook session persistence (separate system)

- Autosave session snapshot path: [src/components/Notebook.tsx](../../src/components/Notebook.tsx#L808-L845)
- Session restore path: [src/components/Notebook.tsx](../../src/components/Notebook.tsx#L861-L910)
