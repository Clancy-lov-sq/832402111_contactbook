# ContactBook design

How the assignment requirements map to code, how the modules fit together, how the
data is modelled, what happens in the key flows, and which tradeoffs were accepted.
Companions: [../README.md](../README.md) (operation), [API.md](API.md) (contract).

## Table of contents

1. [Requirement mapping](#1-requirement-mapping)
2. [Architecture](#2-architecture)
3. [Module responsibilities](#3-module-responsibilities)
4. [Data model and ER](#4-data-model-and-er)
5. [Key flows](#5-key-flows)
6. [Design decisions and tradeoffs](#6-design-decisions-and-tradeoffs)
7. [Validation and error strategy](#7-validation-and-error-strategy)
8. [Limitations and future work](#8-limitations-and-future-work)
9. [Non-goals](#9-non-goals)

## 1. Requirement mapping

| Rubric item | Points | Implementation | Evidence |
| --- | ---: | --- | --- |
| Bookmark contacts | 25 | `is_bookmarked` + `bookmarked_at`, `PATCH /api/contacts/:id/bookmark`, optimistic star, "我的收藏" view, bookmark filter and sort, statistics | [`contactService.js`](../server/src/services/contactService.js), [`contactBook.js`](../web/src/store/contactBook.js), [`contactService.test.js`](../server/test/contactService.test.js), screenshots 02/05/16 |
| Multiple contact methods | 10 | `contact_method` child table, 7 types, label/primary/order, dynamic editor, detail drawer with copy and links | [`schema.js`](../server/src/db/schema.js), [`contactValidator.js`](../server/src/services/contactValidator.js), [`ContactFormDialog.vue`](../web/src/components/ContactFormDialog.vue), screenshots 06/07 |
| Excel import and export | 25 | Workbook layout and styling, template, header detection, row validation, skip/update, savepoints, row report | [`excelService.js`](../server/src/services/excelService.js), [`importService.js`](../server/src/services/importService.js), [`excel.test.js`](../server/test/excel.test.js), [samples](samples), screenshots 10/12/17 |
| Page style | 10 | Tokens, card grid, drawer, dialogs, toasts, empty/skeleton states, responsive breakpoints | [`main.css`](../web/src/styles/main.css), all screenshots |
| Cloud deployment (optional) | 15 | Dockerfile, compose, nginx, systemd, deployment guide. **Prepared, not executed: no host, no public URL, points not claimed.** | [`Dockerfile`](../Dockerfile), [`deploy/README.md`](../deploy/README.md) |
| Additional (unscored) | — | Search, group/ungrouped filters, four sorts, pagination, statistics, export-current-filter, template download, row report | screenshots 03/04/10 |

Required points: 25 + 10 + 25 + 10 = 70. Optional deployment: 15, not claimed, so
the project claims 70 of 85 and documents the deployment path without pretending it
was used.

## 2. Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Browser — Vue 3 SPA, Chinese UI                                            │
│  App.vue → AppSidebar, ContactCard, ContactDetailDrawer, FormDialog,       │
│            ImportDialog, ConfirmDialog, EmptyState, ToastHost, AppIcon     │
│  store/contactBook.js  one reactive store, all actions                     │
│  api/client.js         the only HTTP client (envelope, ApiError, blob)     │
│  utils/ presentation.js, validation.js, errorMessages.js                   │
│  styles/main.css       tokens + component CSS                              │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ JSON over HTTP, same origin (/api)
┌───────────────────────────────▼────────────────────────────────────────────┐
│ Express 4 (server/src)                                                     │
│  requestLogger → cors → express.json(1mb) → /api router → static + SPA     │
│  routes → controllers → services → db/contactRepository (only SQL)         │
│  services: ContactService, ImportService, excelService, contactValidator   │
│  db: Database (transaction/savepoint), schema, repository                  │
│  middleware: upload (multer memory), errorHandler, 404                     │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ prepared statements, `?` bindings only
┌───────────────────────────────▼────────────────────────────────────────────┐
│ SQLite data/contactbook.db (node:sqlite DatabaseSync, WAL)                 │
│  contact_group 1 ── * contact 1 ── * contact_method                        │
└────────────────────────────────────────────────────────────────────────────┘

Build: web/ ─ vite build ─▶ server/public ─ express.static + index.html fallback
```

One origin removes a base URL, production CORS and a second web server; the
deployment is one process plus one SQLite file. The back end stays layered
(controllers translate HTTP, services decide, the repository owns SQL) so the rules
are testable without a socket.

## 3. Module responsibilities

| Module | Responsibility |
| --- | --- |
| `server.js` | Fixed start-up order (config, database + schema, app, `listen`); `SIGINT`/`SIGTERM` shutdown with a 5 s guard. |
| `app.js` | Express app and middleware order; CORS policy; static files with SPA fallback; JSON 404; error handler; dependency wiring. |
| `config/config.js` | The only `process.env` reader; defaults; frozen limits. |
| `routes/index.js` | `/api` table; `asyncHandler`; `export`/`template` before `/contacts/:id`. |
| `controllers/` | One service call per handler, the envelope, export headers, the missing-file check. |
| `services/contactService.js` | Validation orchestration, group resolution/creation, transaction boundaries, bookmark semantics, listing, export query, metadata. |
| `services/contactValidator.js` | Normalisation, all field errors at once, method rules, listing/id parsing, avatar palette. |
| `services/excelService.js` | Export columns and styles, template, header detection/classification, import row parsing with Chinese reasons. |
| `services/importService.js` | Mode, duplicate detection, skip/merge/create, per-row error capture, report assembly. |
| `db/database.js` | `DatabaseSync` facade, statement cache, nested transaction→savepoint, PRAGMAs. |
| `db/schema.js` | DDL with `IF NOT EXISTS`, indexes, default groups. |
| `db/contactRepository.js` | Every SQL statement, filter builder, sort map, row mappers, batched method loading, statistics. |
| `middleware/*`, `utils/*` | Upload, logging, 404/errors; error catalogue, envelope, method catalogue, time, logger. |
| `web/src/*` | Shell, nine components, one store, one HTTP client, presentation/validation/error helpers, design system, automation hooks. |
| `tools/*` | CDP browser driver, 16-step capture with 28 assertions, GIF recording and assembly, sample workbook builder. |

## 4. Data model and ER

```text
contact_group                contact                        contact_method
id            PK             id                 PK          id              PK
name          UNIQUE          group_id  FK ──────┐          contact_id  FK ─┘ (CASCADE)
color                        name                          type  CHECK (7)
sort_order                   company, title, note          label
created_at                   avatar_color                  value
                             is_bookmarked 0/1             is_primary 0/1
                             bookmarked_at NULL            sort_order
                             created_at, updated_at        UNIQUE(contact_id, type, value)
```

- Group → contact: one to many, optional; `ON DELETE SET NULL` keeps contacts when a
  group is removed, so "ungrouped" is `group_id IS NULL`.
- Contact → method: one to many, 0–10 by policy; `ON DELETE CASCADE` leaves no
  orphan.
- The method cap lives in `config.limits`, not in the table; the database enforces
  type validity, the 0/1 flags and `(contact_id, type, value)` uniqueness.

Indexes: `idx_contact_name` (NOCASE), `idx_contact_group`,
`idx_contact_bookmarked` (`is_bookmarked DESC, bookmarked_at DESC`),
`idx_contact_updated`, `idx_contact_method_contact` (`contact_id, sort_order, id`),
`idx_contact_method_value` (NOCASE), unique `idx_contact_method_unique`.

The listing is two queries: one page of contacts (group joined, correlated
`method_count`) and one batched method query for those ids, assembled in memory (no
N+1, no JSON aggregate). Timestamps are `YYYY-MM-DD HH:MM:SS` local text: SQLite's
native format, string-sortable and comparable in the seven-day statistics query. The
bookmark is a column rather than a join table because the installation has one user.

## 5. Key flows

**Create a contact with methods.** Form → client validation → `store.saveContact` →
`POST /api/contacts` → controller → `ContactService.create`: `normalize` (text
limits, `normalizeMethods`, `resolveGroup` look-up or insert) → `transaction
(BEGIN IMMEDIATE)`: `insertContact`, `insertMethods`, `findContactById` → commit →
`201 {success, contact}`. The store then closes the dialog, toasts and reloads the
listing so the sidebar counts and cards agree. A failure throws one `AppError` with
every field error; the dialog marks the same paths (`methods[1].value`).

**Bookmark toggle.** Star → optimistic flip → `PATCH /api/contacts/:id/bookmark` →
`setBookmark`: parse id and flag (invalid → 400), `UPDATE … SET is_bookmarked,
bookmarked_at, updated_at`, `changes === 0` → 404, return contact + fresh stats. On
success the store assigns the contact and stats; on failure it restores the previous
flag and shows an error toast. Bookmarking is optimistic because it is a one-row,
one-column change and the most frequent click.

**Export.** Menu scope → `GET /api/contacts/export` with the current filters →
`listForExport` (no pagination, hard cap 5000) → `createExportBuffer`: derive method
slots (minimum per type, widen to the data, cap 5), build the `通讯录` sheet (title,
header row 3, one row per contact, amber bookmarks, autofilter, freeze, landscape
print area, `是,否` dropdown), serialise → headers `Content-Disposition`,
`X-Export-Row-Count`, `Cache-Control: no-store` → the browser saves the blob and
toasts the real row count.

**Import.** Dialog (`.xlsx` and 5 MB checked client-side) → multipart `file` +
`mode` → multer memory → `ImportService.importBuffer`: validate mode →
`parseImportWorkbook` (pick sheet, header within 15 rows, classify columns, per-row
problems in Chinese, 2000-row cap) → one transaction; per row: find duplicate
(name + first method value) → skip, or merge non-empty cells and append methods, or
create; each service call opens a savepoint, so a failing row rolls back only itself
and the rest commit → report sorted by Excel row → dialog shows counters and rows,
and reloads the listing when anything was written. Parsing touches no database;
`ImportService` is the only module that decides what a duplicate means.

## 6. Design decisions and tradeoffs

| Decision | Why | Cost |
| --- | --- | --- |
| JSON API + SPA on one origin, no router | No base URL, no production CORS, one deployment artifact; features matter more than deep links | Views cannot be shared or bookmarked, the page needs JavaScript |
| Built-in `node:sqlite` with a synchronous facade | No native module, no compile step; one file to back up; cached prepared statements | Node.js >= 22.5, experimental status on some releases, blocking calls (fine for one user) |
| Normalised method table | Unbounded list, real constraints, cascade deletes; Excel is a projection | An extra query per page, joins for counts |
| `BEGIN IMMEDIATE` + nested savepoints | Create/update/import are atomic; import can reject one row and keep the rest | A structural failure aborts the whole file |
| Dynamic Excel slots with minimums | Lossless for phone/e-mail, readable for the rest, no fixed oversized layout | Layout depends on data, so import must read headers; five-slot cap drops a sixth value of one type |
| Explicit `skip` / `update` duplicate modes | Silent merge is surprising; hard failure makes re-import useless | Name + first method is a heuristic, not an identity |
| English API codes, Chinese report messages | A stable contract for clients; a report the user can act on | Two vocabularies; no language negotiation |
| Validation mirrored on both sides | Fast feedback in the form, server remains the authority | Two copies can drift |
| One reactive store, no Pinia/Vuex | One dataset, one refresh path, five runtime dependencies | Hard to split into independent views; no devtools time travel |
| Hand-written CSS with tokens, no UI kit | Page style is graded and fully controlled; no icon font or network request | 2309 lines to maintain, global class names, hand-written accessibility |
| Local-time text timestamps | Native SQLite format, sorts and compares correctly, readable | No timezone; a server timezone change shifts history |
| Workbook in memory, optimistic star, `GET /api/meta` catalogue | Simple, no temp files; instant feedback; one source for types and limits | 5 MB resident; a rollback path; an extra start-up request |

## 7. Validation and error strategy

1. **One error type.** Intentional failures are `AppError` with a stable code,
   default status and English message; unexpected exceptions are logged with their
   stack and answered as `INTERNAL_ERROR`, so no path or SQL reaches the client.
2. **Collect, then throw.** The validator accumulates every field problem and throws
   once with `VALIDATION_INVALID_FIELD` and a complete `fields` array.
3. **Layer families.** Validation, contacts, import, export, storage, routing and
   internal codes are distinct; the client distinguishes "fix your input" (400 with
   `fields`) from "unusable file" (422) from "retry later" (500).
4. **Statuses carry meaning.** 201 create, 404 missing contact or route, 409
   reserved, 413 size, 415 media type, 422 workbook structure.
5. **The browser branches on `error`.** `ApiError` carries `code`, `status`,
   `fields` and `detail`; `errorMessages.js` translates known codes and falls back to
   the server message for an unknown one.

## 8. Limitations and future work

Known limitations: single user and no authentication (`CORS_ORIGIN=*` is a
development default); `PUT`/`PATCH` are last-write-wins; export is capped at 5000
rows silently and at five slots per method type; method labels and the original
bookmark/creation/update timestamps do not survive a round trip; duplicate detection
is a heuristic; timestamps carry no timezone; `IF NOT EXISTS` is the only schema
evolution; the interface is Chinese only; `CONTACT_DUPLICATE` and
`IMPORT_NO_VALID_ROW` are declared but unused; `npm run export:sample` points at a
missing file; the template print area `A1:S60` covers 19 of its 21 columns; the
optional cloud deployment was not executed.

Future work, in the order that would pay off: versioned migrations
(`schema_version` + ordered scripts); optimistic concurrency (send `updatedAt`,
answer 409 on a mismatch); export completeness (method labels, the three timestamps,
an explicit truncation error); richer import (multiple sheets, CSV, a
preview-before-write step); accounts and a per-user bookmark table; generated shared
validation rules; a real accessibility audit and a Playwright suite; streaming
exports; and finally executing the documented deployment and claiming the optional
15 points with a real URL.

## 9. Non-goals

Multi-tenant or social use, CalDAV/phone synchronisation, rich text, attachments or
photos, a native mobile client, offline operation, server-side rendering and search
engine visibility. The public deployment remains configuration only, as stated in
[../README.md](../README.md#14-deployment).
