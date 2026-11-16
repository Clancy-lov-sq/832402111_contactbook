# ContactBook API reference

The service exposes a JSON API under `/api` on the same origin as the page
(`http://127.0.0.1:8080/api`; the Vite dev server proxies `/api` to 8080). API
version 1.0.0. Envelope messages are English and stable error codes are the
contract; the browser translates them into Chinese. Related:
[../README.md](../README.md), [DESIGN.md](DESIGN.md).

## 1. Conventions

| Topic | Convention |
| --- | --- |
| Envelope | Success `{ "success": true, ...payload }`; failure `{ "success": false, "error", "message", "detail"?, "fields"? }`. |
| Error code | Upper-snake-case string from `server/src/utils/errors.js`. Clients branch on `error`, never on `message`. |
| `fields` | `[{ field, code, message }]` on validation failures; `field` is the request path (`name`, `methods[0].value`). `message` repeats the first field message. |
| `detail` | Optional machine-readable context (an id, a sheet name, a reason). Never a stack trace, path or SQL fragment. |
| Timestamps | `YYYY-MM-DD HH:MM:SS`, server local time, read-only. |
| Ids | Positive integers; `abc`, `0` or `1.5` answer 400, not 404. |
| Booleans | Responses use JSON booleans; requests accept `true/false`, `1/0`, `"true"/"false"`, `"yes"/"no"`, `"是"/"否"`. |
| Pagination | `page` (default 1), `pageSize` (default 24, clamped to 1–100); response `page`, `pageSize`, `total`, `totalPages` (min 1). |
| Sorting | `sort=updated` (default), `created`, `name`, `bookmarked`. |
| Limits | JSON body 1 MB; workbook 5 MB, one file, parsed in memory; unknown JSON fields are ignored. |
| CORS | Origins from `CORS_ORIGIN` (default `*`); methods GET/POST/PUT/PATCH/DELETE/OPTIONS; headers `Content-Type`, `Accept`; exposed `Content-Disposition`, `X-Export-Row-Count`. |
| Unknown route | JSON 404 `ROUTE_NOT_FOUND`, never HTML. |

| Status | Used for |
| --- | --- |
| 200 / 201 | Success / contact created. |
| 400 | Invalid JSON, query parameter, body field, contact id, import `mode`, missing upload. |
| 404 | Unknown route or contact. |
| 409 | Reserved (`CONTACT_DUPLICATE`, never raised). |
| 413 / 415 | JSON body > 1 MB or workbook > 5 MB / upload is not `.xlsx`. |
| 422 | Workbook empty, without a header, oversized or unreadable. |
| 500 | `EXPORT_FAILED`, `STORAGE_FAILURE` (start-up), `INTERNAL_ERROR`. |

## 2. Shared objects

Contact response fields: `id`, `name`, `groupId`/`groupName`/`groupColor` (null when
ungrouped), `company`, `title`, `note`, `avatarColor`, `isBookmarked`,
`bookmarkedAt` (null when not bookmarked), `createdAt`, `updatedAt`, `methodCount`,
`methods[]`. Method fields: `id`, `type` (one of seven), `label`, `value`,
`isPrimary`, `sortOrder`. Statistics: `total`, `bookmarked`, `methodCount`,
`updatedLastWeek` (rolling seven days), `groups[]`, `methodsByType[]`.

Contact payload for `POST` and `PUT`:

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | Required; trimmed, inner whitespace collapsed, 1–40 characters. |
| `groupId` | integer? | Must exist; `null`, `0` or `""` mean no group. |
| `groupName` | string? | Created when missing; ignored when a valid `groupId` is sent. |
| `company`, `title`, `note` | string? | At most 60, 40 and 500 characters. |
| `isBookmarked` | boolean? | Defaults to `false`. |
| `avatarColor` | string? | Hex colour; derived from the name otherwise. |
| `methods` | array? | At most 10 × `{ type, value, label?, isPrimary? }`. |

## 3. Endpoint index

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api` | Plain-text landing document | 200 text |
| GET | `/api/health` | Health, version, limits, database probe | 200 |
| GET | `/api/meta` | Method types, groups, statistics, limits, sort options | 200 |
| GET | `/api/contacts` | Filtered, sorted, paged list plus statistics | 200 |
| POST | `/api/contacts` | Create a contact with methods | 201 |
| GET | `/api/contacts/:id` | One contact with methods | 200 |
| PUT | `/api/contacts/:id` | Replace fields and all methods | 200 |
| DELETE | `/api/contacts/:id` | Delete contact and methods | 200 |
| PATCH | `/api/contacts/:id/bookmark` | Set the bookmark flag | 200 |
| GET | `/api/contacts/export` | `.xlsx` of the current filter | 200 |
| GET | `/api/contacts/template` | Empty import template | 200 |
| POST | `/api/contacts/import` | Import a workbook and report rows | 200 |

## 4. Endpoints

### 4.1 GET /api

No parameters. `200 text/plain; charset=utf-8` listing the endpoints and the
envelope. Failure: none of its own.

### 4.2 GET /api/health

No parameters. `200`:

```json
{ "success": true, "service": "contactbook", "version": "1.0.0", "status": "ok",
  "database": { "client": "sqlite", "status": "connected", "storedContacts": 20, "path": "…\\data\\contactbook.db" },
  "uptimeSeconds": 412, "limits": { "maxMethodsPerContact": 10, "maxImportRows": 2000, "maxExportRows": 5000, "…": "…" },
  "time": "2026-11-17T09:41:02.500Z" }
```

A failed `COUNT(*)` answers 200 with `status: "degraded"`, `database.status: "error"`
and `storedContacts: null`. Failure: none at request level.

### 4.3 GET /api/meta

No parameters. `200`:

```json
{ "success": true,
  "methodTypes": [{ "type": "phone", "label": "电话", "labelEn": "Phone", "excelPrefix": "电话",
                    "placeholder": "138 0000 0000", "minSlots": 2, "validator": "phone" }],
  "groups": [{ "id": 1, "name": "家人", "color": "#ef4444", "sortOrder": 10, "contactCount": 2 }],
  "stats": { "total": 20, "bookmarked": 7, "methodCount": 54, "updatedLastWeek": 11, "groups": [], "methodsByType": [] },
  "limits": {}, "pageSizes": [12, 24, 48, 96],
  "sortOptions": [{ "value": "updated", "label": "最近更新" }, { "value": "bookmarked", "label": "收藏优先" }] }
```

Seven method types, all groups and the full limits object are returned; the example
is shortened. Failure: none of its own.

### 4.4 GET /api/contacts

| Query | Values | Default | Meaning |
| --- | --- | --- | --- |
| `keyword` | string ≤ 60 | empty | Substring of name, company, title, note or any method value (ASCII case-insensitive); `%`/`_` are literals. |
| `groupId` | integer, `0`, `all`, empty | no filter | `0` selects contacts without a group. |
| `bookmarked` | boolean | no filter | `true` keeps bookmarked contacts. |
| `methodType` | one of 7 types | no filter | Contacts with at least one method of that type. |
| `sort` | `updated`, `created`, `name`, `bookmarked` | `updated` | Name order is case-insensitive; `bookmarked` puts starred first, newest first. |
| `page` / `pageSize` | positive integers | 1 / 24 | `pageSize` is clamped to 1–100. |

`200`:

```json
{ "success": true, "items": [{ "id": 13, "name": "蒋文博", "groupId": 4, "groupName": "客户",
    "groupColor": "#10b981", "company": "博远科技", "title": "采购总监", "note": "重点客户…",
    "avatarColor": "#ca8a04", "isBookmarked": true, "bookmarkedAt": "2026-11-05 10:00:00",
    "createdAt": "2026-10-30 10:20:00", "updatedAt": "2026-11-15 11:30:00", "methodCount": 4,
    "methods": [{ "id": 35, "type": "phone", "label": "商务", "value": "139 1234 8888", "isPrimary": true, "sortOrder": 0 }] }],
  "total": 20, "page": 1, "pageSize": 24, "totalPages": 1,
  "filters": { "keyword": "", "groupId": null, "bookmarked": false, "methodType": null, "sort": "updated" },
  "stats": { "total": 20, "bookmarked": 7, "methodCount": 54, "updatedLastWeek": 11 } }
```

Failure `400`: `{"success":false,"error":"VALIDATION_INVALID_PARAMETER","message":"sort must be name, updated, created or bookmarked"}`
(also a malformed JSON body → `VALIDATION_INVALID_JSON`). Statuses: 200, 400, 500.

### 4.5 POST /api/contacts

Body: the [contact payload](#2-shared-objects). `201`:

```json
{ "success": true, "contact": { "id": 21, "name": "林澄月", "groupId": 2, "groupName": "朋友",
    "company": "厦门大学", "title": "软件工程", "avatarColor": "#ea580c", "isBookmarked": true,
    "bookmarkedAt": "2026-11-17 09:38:12", "createdAt": "2026-11-17 09:38:12",
    "updatedAt": "2026-11-17 09:38:12", "methodCount": 3,
    "methods": [{ "id": 55, "type": "phone", "label": "手机", "value": "138 0000 8888", "isPrimary": true, "sortOrder": 0 }] } }
```

`methods` is shortened above (the contact has three); the stored contact is returned
exactly as a later `GET` would return it. Failure `400`:

```json
{ "success": false, "error": "VALIDATION_INVALID_FIELD", "message": "The contact name is required",
  "fields": [{ "field": "name", "code": "VALIDATION_CONTACT_NAME_REQUIRED", "message": "The contact name is required" },
             { "field": "methods[0].value", "code": "VALIDATION_METHOD_INVALID_VALUE", "message": "\"not-an-email\" is not a valid email value" }] }
```

Also 400 `VALIDATION_GROUP_UNKNOWN`, 400 `VALIDATION_INVALID_JSON`, 413 for a body
above 1 MB, 500 `INTERNAL_ERROR`. Contact-level uniqueness is not enforced.

### 4.6 GET /api/contacts/:id

Path `id`: positive integer. `200`:

```json
{ "success": true, "contact": { "id": 13, "name": "蒋文博", "groupId": 4, "groupName": "客户",
    "isBookmarked": true, "bookmarkedAt": "2026-11-05 10:00:00", "methodCount": 4,
    "methods": [{ "id": 35, "type": "phone", "label": "商务", "value": "139 1234 8888", "isPrimary": true, "sortOrder": 0 }] } }
```

Failure `400`: `{"success":false,"error":"VALIDATION_INVALID_PARAMETER","message":"The contact id must be a positive integer"}`
Failure `404`: `{"success":false,"error":"CONTACT_NOT_FOUND","message":"The contact does not exist","detail":"No contact has the id 999"}`

### 4.7 PUT /api/contacts/:id

Replacement, not a patch: an omitted field becomes empty and omitting
`isBookmarked` clears the bookmark. `createdAt` and an existing `bookmarkedAt` are
preserved, `updatedAt` moves. Path `id`, body payload. `200`:
`{"success":true,"contact":{ … the stored contact … }}`.

Failure `400`: `{"success":false,"error":"VALIDATION_INVALID_FIELD","message":"The contact name is required","fields":[ … ]}`
Also 404 `CONTACT_NOT_FOUND`, 400 `VALIDATION_INVALID_PARAMETER`,
`VALIDATION_GROUP_UNKNOWN`, 500 `INTERNAL_ERROR`.

### 4.8 DELETE /api/contacts/:id

Path `id`. Methods cascade. `200`: `{"success":true,"deletedId":21,"remaining":20}`.
Failure `404`: `{"success":false,"error":"CONTACT_NOT_FOUND","message":"The contact does not exist"}`
Also 400 `VALIDATION_INVALID_PARAMETER`, 500 `INTERNAL_ERROR`.

### 4.9 PATCH /api/contacts/:id/bookmark

Body `{ "bookmarked": true }` (boolean-like; `isBookmarked` is an alias when
`bookmarked` is absent). Bookmarking stamps `bookmarked_at` and `updated_at`;
clearing sets `bookmarked_at` to null. `200`:

```json
{ "success": true, "contact": { "id": 13, "name": "蒋文博", "isBookmarked": true, "bookmarkedAt": "2026-11-17 09:41:02" },
  "stats": { "total": 20, "bookmarked": 8, "methodCount": 54, "updatedLastWeek": 12 } }
```

Failure `400`: `{"success":false,"error":"VALIDATION_INVALID_BOOKMARK","message":"The bookmark flag must be a boolean","fields":[{"field":"bookmarked","code":"VALIDATION_INVALID_BOOKMARK","message":"The bookmark flag must be a boolean"}]}`
Also 404 `CONTACT_NOT_FOUND`, 400 `VALIDATION_INVALID_PARAMETER`.

### 4.10 GET /api/contacts/export

Query: the same filters as 4.4; `page`/`pageSize` ignored; at most 5000 rows
(silent cap). Success `200`:

```http
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="contactbook-202611170941.xlsx"
X-Export-Row-Count: 24
Cache-Control: no-store
```

An empty result still answers 200 with a title/header-only workbook and
`X-Export-Row-Count: 0`. Failure `400`:
`{"success":false,"error":"VALIDATION_INVALID_PARAMETER","message":"bookmarked must be a boolean"}`
Also 500 `EXPORT_FAILED`.

### 4.11 GET /api/contacts/template

No parameters. `200` with
`Content-Disposition: attachment; filename="contactbook-import-template.xlsx"` and
the 21-column template (3 phone + 3 e-mail slots, one per other type, dropdowns,
`填写说明` sheet, no data rows). Failure: 500 `EXPORT_FAILED`.

### 4.12 POST /api/contacts/import

`multipart/form-data`: `file` (required, `.xlsx`, ≤ 5 MB), `mode` (`skip` default or
`update`). Structural problems raise; a file whose rows all fail still answers 200
with `report.failed = report.totalRows`. `200`:

```json
{ "success": true, "report": { "mode": "skip", "sheetName": "通讯录", "headerRow": 1, "totalRows": 5,
    "created": 3, "updated": 0, "skipped": 1, "failed": 1, "imported": 3, "groupsCreated": 0,
    "columns": [{ "column": 1, "header": "姓名", "target": "name" }, { "column": 7, "header": "电话1", "target": "phone[1]" }],
    "ignoredColumns": [{ "column": 12, "header": "内部编号" }],
    "rows": [{ "row": 2, "name": "周予安", "status": "created", "message": "已新增联系人 #21（4 条联系方式）" },
             { "row": 6, "name": "邮箱写错的示例", "status": "failed", "message": "“not-an-email”不是有效的邮箱格式" }] },
  "stats": { "total": 24, "bookmarked": 11, "methodCount": 69 } }
```

`rows[].status` is `created`, `updated`, `skipped` or `failed`; `rows[].message` is
Chinese for the person fixing the workbook. `columns`/`rows` are shortened above.
Failure `400`:
`{"success":false,"error":"IMPORT_FILE_REQUIRED","message":"No file was uploaded under the field name \"file\""}`
Also 400 `VALIDATION_INVALID_PARAMETER` (bad `mode`), 413 `IMPORT_FILE_TOO_LARGE`,
415 `IMPORT_FILE_UNSUPPORTED`, 422 `IMPORT_WORKBOOK_EMPTY`/`IMPORT_HEADER_MISSING`/
`IMPORT_TOO_MANY_ROWS`/`IMPORT_FAILED`, 500 `INTERNAL_ERROR`.

## 5. Error codes

Validation (400 unless noted):

| Code | When |
| --- | --- |
| `VALIDATION_INVALID_JSON` | Body is not valid JSON. |
| `VALIDATION_INVALID_PARAMETER` | Bad query parameter, contact id or import `mode`. |
| `VALIDATION_INVALID_FIELD` | One or more contact fields invalid; `fields` lists all. Also status 413 for a JSON body above 1 MB. |
| `VALIDATION_CONTACT_NAME_REQUIRED` | `name` empty. |
| `VALIDATION_CONTACT_NAME_TOO_LONG` | `name` > 40 characters. |
| `VALIDATION_GROUP_UNKNOWN` | `groupId` not positive or not found. |
| `VALIDATION_METHOD_TYPE_UNKNOWN` | Unknown method type. |
| `VALIDATION_METHOD_VALUE_REQUIRED` | Empty method value. |
| `VALIDATION_METHOD_INVALID_VALUE` | Value fails the rule of its type. |
| `VALIDATION_METHOD_VALUE_TOO_LONG` | Value > 120 characters. |
| `VALIDATION_TOO_MANY_METHODS` | More than 10 methods in one payload. |
| `VALIDATION_DUPLICATE_METHOD` | Same `(type, value)` twice in one payload. |
| `VALIDATION_INVALID_BOOKMARK` | Bookmark flag not boolean-like. |

Contacts: `CONTACT_NOT_FOUND` (404, read/update/delete/bookmark of a missing id;
`detail` carries the id); `CONTACT_DUPLICATE` (409, reserved, never raised).

Import: `IMPORT_FILE_REQUIRED` (400, no file part); `IMPORT_FILE_UNSUPPORTED` (415,
name not `.xlsx` or unexpected MIME); `IMPORT_FILE_TOO_LARGE` (413, above 5 MB);
`IMPORT_WORKBOOK_EMPTY` (422, no row); `IMPORT_HEADER_MISSING` (422, no name column
in the first 15 rows); `IMPORT_TOO_MANY_ROWS` (422, above 2000 rows);
`IMPORT_NO_VALID_ROW` (422, reserved, never raised); `IMPORT_FAILED` (422, unreadable
workbook).

Export/storage/routing/internal: `EXPORT_FAILED` (500, workbook generation failed);
`STORAGE_FAILURE` (500, database could not be opened or created at start-up);
`ROUTE_NOT_FOUND` (404, unmatched route; `detail` is `METHOD /path`);
`INTERNAL_ERROR` (500, unexpected exception; the stack is logged, never returned).

## 6. Validation rules

| Subject | Rule |
| --- | --- |
| Name | Required, trimmed, inner whitespace collapsed, 1–40 characters. |
| Company/title/note | Optional, 60/40/500 characters. |
| Methods | At most 10; type from the seven; label ≤ 20; value ≤ 120 and type-valid; at most one primary (the first becomes primary when none is marked). |
| `phone` | `/^\+?[0-9][0-9\s\-().]{4,24}$/` and at least 6 digits. |
| `email` | `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`. |
| `qq` | `/^\d{5,12}$/`. |
| `website` | `/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#][^\s]*)?$/i`. |
| `wechat` | `/^[A-Za-z0-9][A-Za-z0-9_\-.]{1,39}$/`. |
| `address`, `other` | Any non-empty text. |
| Ids / booleans | `/^\d+$/` and > 0; the boolean vocabulary from section 1. |

The server is the authority; `web/src/utils/validation.js` mirrors these rules so the
form can reject an obvious error before a request.

## 7. curl recipes

```bash
BASE=http://127.0.0.1:8080/api
curl -s "$BASE/health" | head -20
curl -s -X POST "$BASE/contacts" -H 'Content-Type: application/json' \
  -d '{"name":"林澄月","groupName":"朋友","methods":[{"type":"phone","value":"138 0000 8888","isPrimary":true}]}'
curl -s "$BASE/contacts?keyword=云图&sort=name&page=1&pageSize=12"
curl -s -X PATCH "$BASE/contacts/13/bookmark" -H 'Content-Type: application/json' -d '{"bookmarked":true}'
curl -s -D - -o contacts.xlsx "$BASE/contacts/export?bookmarked=true"
curl -s -o template.xlsx "$BASE/contacts/template"
curl -s -X POST "$BASE/contacts/import" -F "file=@docs/samples/contactbook-import-template.xlsx" -F "mode=skip"
curl -s -X DELETE "$BASE/contacts/21"
```
