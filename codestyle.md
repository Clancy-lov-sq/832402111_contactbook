# Code style

The conventions below are the ones the source actually follows. The basis is the
**Google JavaScript Style Guide** for the server, scripts and tools, and the
**Vue 3 official style guide** for the front end. The repository has no ESLint or
Prettier configuration and no formatting script, so the conventions are enforced by
review and by `npm test`, not by a linter; where the code deliberately deviates, the
deviation is noted.

## 1. Files and naming

| Kind | Convention | Examples |
| --- | --- | --- |
| CommonJS module | `lowerCamelCase.js`, one concern per file | `contactService.js`, `methodTypes.js`, `contactRepository.js` |
| Vue component | `UpperCamelCase.vue`, matching its import | `ContactFormDialog.vue`, `AppSidebar.vue` |
| Test file | `<subject>.test.js` in `server/test` | `validator.test.js`, `api.test.js` |
| Script / tool | verb or noun phrase, `lowerCamelCase.js` | `runTests.js`, `make-import-sample.js` (kebab-case because it is a CLI tool) |
| Stylesheet | one `main.css` | `web/src/styles/main.css` |
| Documentation | lowercase with a hyphen when needed | `README.md`, `codestyle.md`, `docs/API.md`, `deploy/README.md` |
| Database | tables singular, columns `snake_case`, indexes `idx_<table>_<column>` | `contact`, `contact_method`, `idx_contact_bookmarked` |
| JSON / API fields | `camelCase` | `isBookmarked`, `bookmarkedAt`, `methodCount` |

## 2. Formatting

| Rule | Value |
| --- | --- |
| Indentation | 2 spaces, no tabs (verified: no tab character in any source file) |
| Quotes | single quotes; double quotes only when the string contains a single quote (`"The type \"${type}\" is not supported"`); template literals for interpolation |
| Semicolons | always |
| Trailing commas | in multi-line arrays, objects and argument lists |
| Line length | 100 columns soft limit; long template strings, inline SVG path data and long test literals are the accepted exceptions |
| Blank lines | one between logical blocks, two never; imports grouped with a blank line between groups |
| Encoding / EOL | UTF-8, LF |
| Unicode | Chinese text only in user-facing strings (templates, messages, validation texts), never in identifiers |

## 3. Modules and imports

- Every CommonJS file starts with `'use strict';` followed by a blank line.
- Require order: Node built-ins (`node:fs`, `node:path`), third-party packages,
  local modules; blank line between groups; destructure when several names are used.
- One `module.exports` object at the bottom of the file; no export in the middle.
- Front-end imports: `vue` first, then application modules (store, api, utils),
  then components; a blank line between groups.
- No circular imports between layers; `web/src` never imports from `server/`.

## 4. Identifiers

| Kind | Convention | Examples |
| --- | --- | --- |
| Variables, functions | `lowerCamelCase`, verb-first for actions | `normalizeMethods`, `parseListQuery`, `loadContacts`, `toggleBookmark` |
| Classes / constructors | `UpperCamelCase` | `ContactService`, `ImportService`, `AppError`, `ApiError`, `Database` |
| Constants | `UPPER_SNAKE_CASE`, frozen when shared | `ErrorCode`, `SORT_SQL`, `DEFAULT_GROUPS`, `METHOD_TYPES`, `AVATAR_PALETTE` |
| Booleans | `is` / `has` / `should` prefix | `isBookmarked`, `isPrimary`, `hasFilters`, `shuttingDown` |
| Private-by-convention helpers | plain functions in the module, not exported | `escapeLike`, `mapContactRow`, `buildFilter` |
| Event handlers | `on` + event | `onKeywordInput`, `onBookmark`, `onDrop` |
| SQL columns vs JSON | converted once, in the repository mappers | `is_bookmarked` → `isBookmarked` |

## 5. Comments and JSDoc

Every module opens with a block comment that states its responsibility and the
non-obvious decisions; exported functions carry JSDoc with `@param` / `@returns` /
`@throws` when the types are not obvious from the signature; SQL and regex rules get
a short "why" comment. Comments explain reasons, not restatements of the code.

```js
/**
 * Parses an id taken from the path.
 *
 * @param {*} raw
 * @returns {number}
 * @throws {AppError} VALIDATION_INVALID_PARAMETER
 */
function parseContactId(raw) {
  if (!/^\d+$/.test(String(raw)) || Number(raw) <= 0) {
    throw new AppError(ErrorCode.VALIDATION_INVALID_PARAMETER, {
      message: 'The contact id must be a positive integer',
    });
  }
  return Number(raw);
}
```

## 6. Layering

| Layer | May do | Must not do |
| --- | --- | --- |
| `routes/` | declare paths, wrap async handlers | contain business logic |
| `controllers/` | read the request, call one service method, write the envelope | build SQL, decide a rule, read `process.env` |
| `services/` | validate, resolve groups, open transactions, decide | touch `req`/`res`, contain SQL |
| `db/` (repository) | own every SQL statement, map rows | throw validation errors, know HTTP |
| `utils/` | pure helpers and the error/catalogue definitions | depend on services or Express |
| `web/src/api/` | one function per endpoint | be called from a component directly |
| `web/src/store/` | own shared state and actions | render markup |
| `web/src/components/` | render, emit events, call store actions | call `fetch` or import the API client |

`process.env` is read only in `server/src/config/config.js`; SQL only in
`server/src/db/contactRepository.js`; the CORS policy only in `server/src/app.js`.

## 7. Error handling

Every intentional failure is an `AppError` with a code from `ErrorCode`. Controllers
and routes do not catch; the shared error handler maps the error to the envelope.
Unexpected exceptions are logged with their stack and answered as `INTERNAL_ERROR`.

```js
// Preferred: classified, with a stable code and a field list.
throw new AppError(ErrorCode.VALIDATION_INVALID_BOOKMARK, {
  fields: [{ field: 'bookmarked', code: ErrorCode.VALIDATION_INVALID_BOOKMARK, message: '…' }],
});

// Avoid: a bare string or a generic Error loses the code the client branches on.
throw new Error('bad bookmark flag');
```

Validation collects every field problem before throwing, so the API can answer one
`VALIDATION_INVALID_FIELD` with a complete `fields` array. The front end never reads
an error message to decide what happened; it reads `error.code`.

## 8. SQL rules

- All values are bound with positional `?` parameters; no user input is ever
  interpolated into a statement, including `LIKE` patterns (escaped and used with
  `ESCAPE '\'`).
- Sorting is chosen from the frozen `SORT_SQL` map, never built from the request
  string.
- Multi-statement writes run inside `database.transaction`; a nested call becomes a
  savepoint.
- Prepared statements are cached by SQL text in `Database.statement`.
- Timestamps come from `nowText()` / SQLite `strftime`, never from string
  concatenation in the repository.

```js
// Preferred
db.run('UPDATE contact SET is_bookmarked = ?, bookmarked_at = ? WHERE id = ?', [flag, nowText(), id]);

// Avoid
db.run(`UPDATE contact SET is_bookmarked = ${flag} WHERE id = ${id}`);
```

## 9. Asynchronous code

`async`/`await` with `try`/`finally` for state flags; no floating promises. An async
Express handler is wrapped with `asyncHandler` so a rejection reaches the error
middleware instead of becoming an unhandled rejection. The database is synchronous by
design, so services are synchronous unless they touch ExcelJS.

## 10. Vue single-file components

- `<script setup>` only; no Options API, no separate `<script>` block.
- `defineProps` with the object form and explicit types, `required` where the
  component cannot work without the prop; `defineEmits` as an array.
- Computed values for anything derived; functions for event handlers and side
  effects; imports of store actions at the top, not `book.someAction()` inline when a
  named action exists.
- Template order: `<script setup>` first, then `<template>`. No component `<style>`
  blocks; the shared stylesheet owns presentation.
- `v-for` always has a `:key`; overlays use `<Teleport to="body">`; dialogs carry
  `role="dialog"`, `aria-modal` and an `aria-label`.
- Every interactive element the capture script touches has a `data-testid`
  (`data-testid="form-submit"`); dynamic ones use a template literal
  (`:data-testid="\`method-value-${index}\`"`).

```vue
<script setup>
import { computed } from 'vue';
import { toggleBookmark } from '../store/contactBook';

const props = defineProps({ contact: { type: Object, required: true } });
const emit = defineEmits(['open', 'edit', 'delete']);
const previewMethods = computed(() => props.contact.methods.slice(0, 3));
</script>
```

## 11. CSS conventions

- One stylesheet; tokens are custom properties on `:root`
  (`--ink-600`, `--brand`, `--radius-md`, `--shadow-sm`, `--transition`); component
  code uses the token, never a repeated literal.
- BEM-ish names: block `.card`, element `.card__head`, modifier `.btn--primary`,
  state `.is-bookmarked`, `.is-active`, `.is-invalid`; kebab-case.
- A component's dynamic colour is passed as an inline custom property
  (`:style="{ '--method-color': color }"`), not as a class per colour.
- Section banner comments divide the file; media queries live at the end
  (1180 px, 960 px, 620 px, then `prefers-reduced-motion`).
- `!important` is not used by the application; it appears only in the freeze CSS that
  the capture script injects into the page.

## 12. Tests

Test names are sentences that describe the behaviour
(`'a group that does not exist yet is created by name'`), one behaviour per test, no
shared mutable state between tests. Database-backed tests use `withContext` so the
temporary file is always removed, and `expectError` asserts a classified failure
instead of a generic throw. Test data is built by `sampleContact(overrides)`, not
copied between files.

## 13. Commit messages

Conventional Commits: `<type>(<scope>): <subject>`, subject in the imperative, no
trailing period, one logical change per commit. The history of this repository uses
`feat`, `test` and `chore` with the scopes `server` and `web`:

```text
feat(web): build the Vue interface, store and design system
test(server): cover validation, service, Excel and the HTTP API
feat(server): export and import Excel workbooks with a row report
chore: scaffold the ContactBook project
```

Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `build`,
`chore`. The body, when present, explains why the change was needed and what was
verified (`npm test`, a capture run).

## 14. Review checklist

- [ ] 2-space indent, single quotes, semicolons, trailing commas.
- [ ] New behaviour has a test at the right layer (validator, service, Excel or API).
- [ ] Errors are `AppError` with a code; no bare `throw new Error` for a user-facing rule.
- [ ] SQL is parameterised; `process.env` is read only in `config.js`.
- [ ] A component talks to the store, not to `fetch`; strings are Chinese in the UI, English in the API.
- [ ] New interface elements have `data-testid` and an accessible name.
- [ ] `npm test` passes; screenshots are regenerated when the UI changes.
