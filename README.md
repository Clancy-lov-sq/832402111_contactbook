# ContactBook

ContactBook is a Chinese-language address book web application built for the
"Extreme Programming" assignment of the Software Engineering course at FZU-MU. A
contact holds a name, group, company data, a note and 0–10 typed contact methods;
contacts can be bookmarked, searched, filtered, paged, exported to Excel and
imported from Excel. One Node.js process serves the Vue single-page application and
the JSON API under `/api` on the same origin, and the data lives in a single SQLite
file created on first start-up. No database server, ORM or native module is involved.

| Item | Value |
| --- | --- |
| Assignment | Extreme Programming, CSDN community `2601_FZU-MU_SE`, deadline 2026-11-17 23:59 |
| Programme / work type | Software Engineering, FZU-MU; individual project (832402111, 陈宇林) |
| Interface | Chinese (`zh-CN`); the API is English with stable error codes |
| Runtime / storage | Node.js >= 22.5.0 (developed on 24.22.0); SQLite `data/contactbook.db` via built-in `node:sqlite` |
| Tests | 78 tests in 4 files (all passing); 28 browser capture assertions |
| Deployment | One process; container/systemd/nginx artifacts prepared, **not publicly deployed** |

Related: [codestyle.md](codestyle.md) · [docs/API.md](docs/API.md) ·
[docs/DESIGN.md](docs/DESIGN.md) · [deploy/README.md](deploy/README.md) ·
[blog/assignment-blog.md](blog/assignment-blog.md) (Chinese report).

## Table of contents

1. [Overview](#1-overview)
2. [Technology stack](#2-technology-stack)
3. [Runtime requirements](#3-runtime-requirements)
4. [Installation, build and start](#4-installation-build-and-start)
5. [npm scripts](#5-npm-scripts)
6. [Configuration](#6-configuration)
7. [Domain limits](#7-domain-limits)
8. [Database schema](#8-database-schema)
9. [API overview](#9-api-overview)
10. [Excel import and export](#10-excel-import-and-export)
11. [Front-end design](#11-front-end-design)
12. [Testing](#12-testing)
13. [Project structure](#13-project-structure)
14. [Deployment](#14-deployment)
15. [Troubleshooting](#15-troubleshooting)
16. [Known limitations](#16-known-limitations)
17. [Assignment context and license](#17-assignment-context-and-license)

## 1. Overview

- **Bookmarking (25 points).** A star on every card and in the drawer toggles
  `is_bookmarked` and stamps `bookmarked_at`; a "我的收藏" view, sidebar counts and a
  bookmark-first sort order make it usable, and the state survives a restart.
- **Multiple methods per contact (10 points).** `contact_method` is a child table
  with seven types (`phone`, `email`, `wechat`, `qq`, `website`, `address`, `other`),
  an optional label, a primary flag and a display order; the form edits a dynamic
  list.
- **Excel import/export (25 points).** One contact per row, one value per column,
  styled header, amber bookmarked rows, print setup and an empty template; import
  validates every row, reports it by Excel row number and offers two duplicate
  policies.
- **Page style (10 points).** Hand-written CSS with a token layer, card grid,
  drawer, dialogs, toasts, empty/skeleton states and three responsive breakpoints.
- **Cloud deployment (optional 15 points).** Dockerfile, compose file, nginx and a
  systemd unit exist and are documented; the item was **prepared, not executed** — no
  host was rented and no public URL is claimed.

## 2. Technology stack

| Layer | Package | Declared | Resolved (lockfile) |
| --- | --- | --- | --- |
| Runtime | Node.js | `>= 22.5.0` (`engines`) | 24.22.0 |
| HTTP / CORS | `express` / `cors` | `^4.21.2` / `^2.8.5` | 4.22.3 / 2.8.6 |
| Upload / Excel | `multer` / `exceljs` | `^2.0.0` / `^4.4.0` | 2.5.0 / 4.4.0 |
| Storage | `node:sqlite` (`DatabaseSync`) | built into Node.js | — |
| UI / build | `vue` / `vite` | `^3.5.13` / `^7.0.0` | 3.5.45 / 7.3.8 |
| Vue plugin | `@vitejs/plugin-vue` | `^6.0.0` | 6.0.11 |
| Styles / tests | hand-written CSS; `node:test` + `node:assert/strict` | — | — |

Server, tests, scripts, `vite.config.js` and `tools/` are CommonJS (`'use strict';`,
`require`, `module.exports`); `web/src` is ESM bundled by Vite.

## 3. Runtime requirements

- **Node.js >= 22.5.0** — `node:sqlite` does not exist in older releases; no flag and
  no compiler are needed (some versions print an experimental warning).
- **npm 10+** (developed with 11.19.1) and a writable directory for the SQLite file
  and its WAL side files (default `data/`, created automatically).
- **Any OS** — paths use `node:path`; Windows, macOS and Linux are supported.
- **Current evergreen browser**; clipboard copy falls back when the page is not a
  secure context. Optional: Chrome/Edge (`CHROME_PATH`) for the capture scripts,
  Python 3 with Pillow for the GIF.

No environment variable and no `.env` file are required: every setting has a working
default.

## 4. Installation, build and start

```bash
git clone https://github.com/Clancy-lov-sq/832402111_contactbook.git
cd 832402111_contactbook
npm ci                  # pure-JavaScript dependencies, nothing to compile
npm run build           # Vite builds web/ into server/public
npm start               # page + API on http://127.0.0.1:8080
```

| Mode | Commands | URL | Notes |
| --- | --- | --- | --- |
| Production-shaped | `npm run build`, `npm start` | <http://127.0.0.1:8080> | One process, one origin; `HOST` defaults to `0.0.0.0`. |
| Back end only | `npm start` or `npm run dev:server` | `/api` on 8080 | Without `server/public`, `/` answers a JSON 404; the API works. |
| Front end only | `npm run dev:web` | <http://127.0.0.1:5173> | Vite HMR, `/api` proxied to 127.0.0.1:8080, `strictPort`. |
| Demo data | `npm run seed:reset` | — | 20 contacts, 7 bookmarked, 54 contact methods. |

First start-up creates `data/`, the database and the schema, then prints the
listening URL, the API entry point and the health-check URL. `GET /api/health` runs
a real query, so it proves the process, the HTTP layer and the storage at once.

## 5. npm scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `start` | `node server/src/server.js` | Run the service. |
| `dev:server` | `node --watch server/src/server.js` | Restart on server changes. |
| `dev:web` | `vite` | Front-end dev server on 5173 with the `/api` proxy. |
| `build` | `vite build` | Build `web/` into `server/public` (emptied first). |
| `preview` | `vite preview` | Serve the built bundle only; no API, so use `npm start` for a full stack. |
| `seed` / `seed:reset` | `node server/scripts/seed.js [--reset]` | Insert demo contacts when empty / after emptying the tables. |
| `test` | `node server/scripts/runTests.js` | One process per test file, summary and exit code. |
| `export:sample` | `node server/scripts/exportSample.js` | Declared, but that file is absent; the sample workbook came from a running instance. |

## 6. Configuration

Read once in [`server/src/config/config.js`](server/src/config/config.js); no other
module reads `process.env`. Effective values are reported by `GET /api/health`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port; a non-integer value throws at start-up. |
| `HOST` | `0.0.0.0` | Bind address (`127.0.0.1` behind a proxy). |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins or `*`; requests without `Origin` are always allowed. |
| `SQLITE_PATH` | `data/contactbook.db` | Database file; relative values resolve against the repository root. |
| `STATIC_DIR` | `server/public` | Front-end directory served by Express. |
| `SERVE_STATIC` | `true` | `false`/`0`/`no`/`off` disables static serving and the SPA fallback. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`; one line per event. |

CORS allows `Content-Type` and `Accept`, exposes `Content-Disposition` and
`X-Export-Row-Count`, caches preflight for 24 hours; JSON bodies are limited to 1 MB.

## 7. Domain limits

| Limit | Value | Limit | Value |
| --- | --- | --- | --- |
| Contact name | 40 chars | Methods per contact | 10 |
| Company | 60 chars | Method label | 20 chars |
| Job title | 40 chars | Method value | 120 chars |
| Note | 500 chars | Search keyword | 60 chars |
| Page size | default 24, max 100 | Page-size choices | 12, 24, 48, 96 |
| Import rows | 2000 | Import file size | 5 MB |
| Export rows | 5000 (silent cap) | Excel slots per type | 5 |

Type rules (identical on both sides): `phone` starts with an optional `+` and a
digit, allows digits/space/`-`/`()`/`.`, at least 6 digits; `email` needs
`local@domain.tld`; `qq` is 5–12 digits; `website` is an optional `http(s)://` plus a
dotted host; `wechat` is 2–40 characters starting with a letter/digit; `address` and
`other` accept any non-empty text.

## 8. Database schema

Created on every start-up with `IF NOT EXISTS`. The connection enables WAL, foreign
keys and a 5 s busy timeout; five default groups are inserted when `contact_group` is
empty.

| Table | Columns | Notes |
| --- | --- | --- |
| `contact_group` | `id` PK, `name` UNIQUE, `color`, `sort_order`, `created_at` | Sidebar groups; defaults 家人/朋友/同事/客户/其他. |
| `contact` | `id` PK, `name`, `group_id` FK → `contact_group` `ON DELETE SET NULL`, `company`, `title`, `note`, `avatar_color`, `is_bookmarked` 0/1, `bookmarked_at`, `created_at`, `updated_at` | Deleting a group keeps its contacts, ungrouped. |
| `contact_method` | `id` PK, `contact_id` FK → `contact` `ON DELETE CASCADE`, `type` CHECK in the 7 types, `label`, `value`, `is_primary` 0/1, `sort_order` | No method can exist without its contact. |

Indexes: `idx_contact_name` (`name COLLATE NOCASE`), `idx_contact_group`,
`idx_contact_bookmarked` (`is_bookmarked DESC, bookmarked_at DESC`),
`idx_contact_updated`, `idx_contact_method_contact` (`contact_id, sort_order, id`),
`idx_contact_method_value` (`value COLLATE NOCASE`), and the unique
`idx_contact_method_unique` on `(contact_id, type, value COLLATE NOCASE)`.

The model is normalised because a method is an entity, not a fixed slot: the
10-method cap is policy (one config value), not table shape; type validity,
uniqueness and cascade behaviour are enforced by the schema, not by string parsing;
and the Excel layout is a projection of the child rows. Timestamps are local-time
text (`YYYY-MM-DD HH:MM:SS`), which SQLite produces natively and sorts correctly.

## 9. API overview

Full reference: [docs/API.md](docs/API.md).

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api` | Plain-text landing document | 200 text |
| GET | `/api/health` | Health, version, limits, real database probe | 200 |
| GET | `/api/meta` | Method types, groups, statistics, limits, sort options | 200 |
| GET | `/api/contacts` | Filtered, sorted, paged list plus statistics | 200 |
| POST | `/api/contacts` | Create a contact with methods | 201 |
| GET | `/api/contacts/:id` | One contact with methods | 200 |
| PUT | `/api/contacts/:id` | Replace fields and the whole method list | 200 |
| DELETE | `/api/contacts/:id` | Delete the contact (methods cascade) | 200 |
| PATCH | `/api/contacts/:id/bookmark` | Set the bookmark flag; returns statistics | 200 |
| GET | `/api/contacts/export` | Download an `.xlsx` of the current filter | 200 + `X-Export-Row-Count` |
| GET | `/api/contacts/template` | Download the empty import template | 200 |
| POST | `/api/contacts/import` | Import a workbook, return a row report | 200 |

`export` and `template` are registered before `/contacts/:id`. The envelope is
`{ "success": true, ...payload }` or
`{ "success": false, "error": <CODE>, "message": <English>, "detail"?, "fields"? }`;
`fields` is `[{ field, code, message }]` with paths such as `methods[0].value`. The
browser branches on `error` and translates it into Chinese. Listing filters are
`keyword`, `groupId` (`0` = ungrouped), `bookmarked`, `methodType`, `sort`
(`updated`|`created`|`name`|`bookmarked`), `page`, `pageSize`.

```http
GET /api/contacts?bookmarked=true&sort=updated&page=1&pageSize=10
```

```json
{ "success": true,
  "items": [{ "id": 13, "name": "蒋文博", "groupId": 4, "groupName": "客户", "groupColor": "#10b981",
              "company": "博远科技", "title": "采购总监", "note": "重点客户…", "avatarColor": "#ca8a04",
              "isBookmarked": true, "bookmarkedAt": "2026-11-05 10:00:00",
              "createdAt": "2026-10-30 10:20:00", "updatedAt": "2026-11-15 11:30:00", "methodCount": 4,
              "methods": [{ "id": 35, "type": "phone", "label": "商务", "value": "139 1234 8888",
                            "isPrimary": true, "sortOrder": 0 }] }],
  "total": 20, "page": 1, "pageSize": 10, "totalPages": 2,
  "filters": { "keyword": "", "groupId": null, "bookmarked": true, "methodType": null, "sort": "updated" },
  "stats": { "total": 20, "bookmarked": 7, "methodCount": 54, "updatedLastWeek": 11 } }
```

Validation failure (HTTP 400):

```json
{ "success": false, "error": "VALIDATION_INVALID_FIELD", "message": "The contact name is required",
  "fields": [{ "field": "name", "code": "VALIDATION_CONTACT_NAME_REQUIRED", "message": "The contact name is required" },
             { "field": "methods[0].value", "code": "VALIDATION_METHOD_INVALID_VALUE",
               "message": "\"not-an-email\" is not a valid email value" }] }
```

Export headers: Excel sheet `Content-Type`, `Content-Disposition: attachment;
filename="contactbook-202611170941.xlsx"`, `X-Export-Row-Count: 24`,
`Cache-Control: no-store`. Import answers
`{ success, report: { mode, sheetName, headerRow, totalRows, created, updated,
skipped, failed, imported, groupsCreated, columns, ignoredColumns, rows[] }, stats }`.
`PUT` is a replacement: an omitted field becomes empty and omitting `isBookmarked`
clears the bookmark. Creating a contact does not enforce contact-level uniqueness;
only `(contact_id, type, value)` is unique.

## 10. Excel import and export

The sheet is `通讯录`: row 1 is a merged title, row 2 is empty, row 3 is the header,
rows 4+ hold one contact each. The header is frozen, filtered, dark-filled and
white-bold; bookmarked rows are amber; the print area is landscape, fit to width.

| Column | Content | Column | Content |
| --- | --- | --- | --- |
| 1 | 序号 | 7 | 是否收藏 (`是`/`否`) |
| 2 | 姓名 | 8 | 收藏时间 |
| 3 | 分组 | 9…N | Method slots by type |
| 4 | 公司 | N+1 | 创建时间 |
| 5 | 职位 | N+2 | 更新时间 |
| 6 | 备注 | | |

Method slots follow the type order phone, e-mail, WeChat, QQ, website, address,
other. Each type reserves a minimum (phone 2, e-mail 2, others 1), widens to the
widest contact and caps at 5; a header is numbered only when its type has more than
one slot (`电话1`, `电话2`, `微信`). The template
([docs/samples/contactbook-import-template.xlsx](docs/samples/contactbook-import-template.xlsx))
offers 3 phone + 3 e-mail + one column per other type (21 columns), dropdowns for
`是否收藏` and `分组`, and a `填写说明` sheet; the committed
[docs/samples/contactbook-export-sample.xlsx](docs/samples/contactbook-export-sample.xlsx)
is a real 19-column export of the 24 demo contacts.

Import rules: `.xlsx` only, multipart field `file`, optional `mode=skip|update`; the
sheet `通讯录` is preferred, otherwise the first sheet; the header is the first row
within 15 rows containing a name column; column order is free, English aliases are
accepted, unknown columns are ignored and reported. `姓名` is required; phone,
e-mail, QQ, website and WeChat values are validated, duplicate methods and an
eleventh method reject the row, `是否收藏` accepts `是/否/true/false/1/0/yes/no/收藏`,
and an unknown group name is created. Empty rows are skipped; the file is limited to
2000 rows and 5 MB; every row is reported as `created`, `updated`, `skipped` or
`failed` with a Chinese message and its Excel row number. The file runs in one
transaction while each row writes through a nested savepoint, so a failing row rolls
back only itself.

| Situation | `skip` (default) | `update` |
| --- | --- | --- |
| No duplicate | created | created |
| Same name + same first method value | skipped and reported | merged |
| Same name, different first method | created separately | created separately |

`update` merges cell by cell (non-empty wins, empty keeps the stored value), appends
methods up to the 10-method cap, keeps the creation time and the existing bookmark
moment. Method labels and the three timestamp columns do not round-trip (see
[limitations](#16-known-limitations)).

## 11. Front-end design

One Vue application, no router: the sidebar selects all contacts, bookmarks or a
group; the top bar holds search (debounced 260 ms), sort, import, template, export
and create; the content area is a card grid with pagination. Overlays are teleported
to `body`.

| Module | Responsibility |
| --- | --- |
| `App.vue` | Shell, search, sort, export menu, grid, pagination, `Ctrl/Cmd+K` and `Escape`, skeleton/error/empty states. |
| `AppSidebar.vue` / `ContactCard.vue` | Views and group counts; one card per contact with up to three methods and the star. |
| `ContactDetailDrawer.vue` / `ContactFormDialog.vue` | All methods with copy and `tel:`/`mailto:`/website links; dynamic method editor with field errors keyed like the API. |
| `ImportDialog.vue` / `ConfirmDialog.vue` / `EmptyState.vue` / `ToastHost.vue` / `AppIcon.vue` | Import report, confirmation, empty states, toast host, inline SVG icons. |
| `store/contactBook.js` | The single reactive store and actions; one `loadContacts` refresh path; optimistic bookmark with rollback. |
| `api/client.js` | The only HTTP client: envelope, `ApiError`, blob download with the row-count header. |
| `utils/errorMessages.js` | Chinese text per error code, with the server message as fallback. |
| `styles/main.css` | Design system: 2309 lines, tokens on `:root`, BEM-ish classes. |

Design tokens cover ink/surfaces, brand and semantic colours (`--brand` `#4f46e5`,
amber for bookmarks), radii 8/12/16/22 px, four shadows, a 268 px sidebar, Chinese
font stacks and a 160 ms transition. The grid is
`repeat(auto-fill, minmax(302px, 1fr))`; at 1180 px the sidebar narrows, at 960 px
the shell stacks and the sidebar becomes a horizontal bar, at 620 px the grid and
form collapse to one column; `prefers-reduced-motion` disables animation. Dialogs
are `role="dialog"` with `aria-modal`, cards handle Enter/Space, the toast host is
`aria-live="polite"`, and every element the capture script touches carries a
`data-testid`. `web/src/demo.js` installs `window.__demo` and `window.__contactbook`.

## 12. Testing

```bash
npm test                              # node server/scripts/runTests.js
node server/test/validator.test.js    # one file directly
```

| File | Tests | Covers |
| --- | ---: | --- |
| `validator.test.js` | 22 | Name rules, method normalisation, five value validators, duplicates/cap, primary selection, booleans, group errors, avatar, id and query parsing. |
| `contactService.test.js` | 17 | Create, group reuse/creation, pagination and stats, not-found paths, update semantics, bookmark stamp/clear, delete, keyword search, filters, sorting, export without pagination, metadata. |
| `excel.test.js` | 17 | Slot minimums and growth, export layout and highlight, round trip, import create, skip/update, row errors, English headers, missing name column, bad file, template, bookmark values, row cap, group creation, empty workbook. |
| `api.test.js` | 22 | Real ephemeral server: health, landing, meta, create 201, list, read, update, bookmark, 400 with fields, bad JSON, 404, JSON 404 for unknown routes, CORS and preflight, export headers/bytes, template, multipart import, export→import, missing file, wrong type, delete, filters, invalid query. |

Each test file runs in its own process with its own temporary SQLite file under
`.tmp-tests/`; nothing is mocked; the measured run is about 7.5 s. A second layer,
`tools/capture.js`, drives the real page in a real browser and asserts 28 conditions;
its report is [screenshots/capture-results.json](screenshots/capture-results.json)
(28 passed, 0 failed). Screenshots: `screenshots/01-home.png` …
`16-favorites-final.png` plus `17-export-workbook.png`, the 15-frame
`screenshots/demo-running.gif`, and the sample workbooks in `docs/samples/`.

## 13. Project structure

```text
832402111_contactbook/
├── package.json, package-lock.json, vite.config.js
├── Dockerfile, docker-compose.yml, .dockerignore
├── README.md, codestyle.md
├── blog/                       assignment-blog.md + images/
├── data/                       runtime SQLite file (created, ignored)
├── deploy/                     README.md, contactbook.service, nginx.conf
├── docs/                       API.md, DESIGN.md, samples/*.xlsx
├── screenshots/                PNGs, demo-running.gif, capture-results.json, fixtures/, gif/
├── server/
│   ├── public/                 Vite build output served by Express (ignored)
│   ├── scripts/                runTests.js, seed.js
│   ├── src/                    server.js, app.js, config/, routes/, controllers/,
│   │                           services/, db/, middleware/, utils/
│   └── test/                   helpers.js + api/contactService/excel/validator tests
├── tools/                      cdp.js, capture.js, capture-gif.js, build-gif.py,
│                               make-import-sample.js, peek.js
└── web/
    ├── index.html
    └── src/                    main.js, App.vue, demo.js, api/, components/, store/,
                                styles/, ui/, utils/
```

Generated and ignored: `node_modules/`, `.npm-cache/`, `server/public/`, `data/`,
`.tmp-tests/`, `screenshots/gif/`, `screenshots/fixtures/`.

## 14. Deployment

`npm run build` writes the front end into `server/public`; `npm start` serves that
directory, the SPA fallback and `/api` from one process, one port and one SQLite
file. Prepared artifacts: a two-stage `Dockerfile` on `node:24-bookworm-slim`
(production dependencies only, unprivileged user `contactbook` uid 10001, `/app/data`
owned by it, `HEALTHCHECK` against `/api/health` every 30 s), a
`docker-compose.yml` (port 80:8080, `./data` volume, same health check), an
`.dockerignore`, `deploy/nginx.conf` (reverse proxy, `client_max_body_size 6m`,
gzip, immutable asset caching) and `deploy/contactbook.service` (systemd, user
`contactbook`, `HOST=127.0.0.1`, writable path limited to the data directory).
[deploy/README.md](deploy/README.md) walks through both paths, verification, backup
and rollback.

**The optional cloud deployment was prepared, not executed.** No cloud host was
rented and no public URL is claimed; if the service is exposed, set `CORS_ORIGIN` to
the public origin and put TLS in front of it.

## 15. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `EADDRINUSE` on 8080 | Another process holds the port: `PORT=8090 npm start` (PowerShell: `$env:PORT=8090; npm start`); the dev web server needs 5173 free. |
| `Cannot find module 'node:sqlite'` | Node.js is older than 22.5; check `node --version` and switch. |
| `/` returns a JSON 404 | `server/public` is missing or `SERVE_STATIC=false`; run `npm run build`. |
| CORS error from 5173 | Use `npm run dev:web` (proxy) or set `CORS_ORIGIN=http://127.0.0.1:5173`. |
| Import answers 415 / 413 | Not an `.xlsx` workbook / larger than 5 MB; save as `.xlsx` or split the file. |
| Import answers 422 `IMPORT_HEADER_MISSING` | No name column in the first 15 rows; remove content above the header or add `姓名`. |
| Import answers 400 `IMPORT_FILE_REQUIRED` | The multipart field must be named `file`. |
| Rows reported as failed | The message names the Excel row and the reason; fix that row and re-import — the other rows committed. |
| `SQLITE_BUSY` / `STORAGE_FAILURE` | A second writer holds the lock; stop it and do not copy the database while it writes. |
| Capture cannot find a browser | Install Chrome/Edge or set `CHROME_PATH`. |

## 16. Known limitations

- Single user, no authentication; `CORS_ORIGIN=*` is a development default.
- `PUT`/`PATCH` are last-write-wins; there is no optimistic concurrency.
- Export is capped at 5000 rows silently and at five slots per method type, so a
  sixth value of one type is not exported.
- Method labels and the original bookmark/creation/update timestamps do not survive
  an import round trip; duplicate detection is a heuristic (name + first method).
- Timestamps are local time without a timezone; the schema has no versioned
  migrations; the interface is Chinese only.
- `CONTACT_DUPLICATE` (409) and `IMPORT_NO_VALID_ROW` (422) are declared but not
  raised; `npm run export:sample` points at a missing file; the template print area
  `A1:S60` covers 19 of its 21 columns.
- The optional cloud deployment was not executed.

## 17. Assignment context and license

Course: Software Engineering, FZU-MU; assignment: Extreme Programming, CSDN
community `2601_FZU-MU_SE`; deadline 2026-11-17 23:59; individual project by
832402111 陈宇林. Rubric: bookmarking 25, multiple methods 10, Excel 25, page style
10, optional cloud deployment 15 (not claimed). The Chinese report with the
screenshot walkthrough is [blog/assignment-blog.md](blog/assignment-blog.md).

License: MIT, as declared in `package.json` (`"license": "MIT"`); no separate
`LICENSE` file is included.
