# Demonstration material

Every file in this directory was produced by a script against the running
application — no image was edited by hand.

| File | What it shows | Produced by |
| --- | --- | --- |
| `01-home.png` | All contacts, twelve cards per page | `tools/capture.js` step 01 |
| `02-favorites.png` | The bookmark view | step 02 |
| `03-search.png` | Keyword search across names, companies and methods | step 03 |
| `04-group.png` | Filtering by the “同事” group | step 04 |
| `05-bookmark-toast.png` | Starring a contact, counter and toast | step 05 |
| `06-detail.png` | Detail drawer with four contact methods | step 06 |
| `07-new-contact-form.png` | Create form with three contact methods | step 07 |
| `08-form-validation.png` | Client side validation of an e-mail value | step 08 |
| `09-created-toast.png` | The saved contact at the top of the list | step 09 |
| `10-export-menu.png` | Export menu: current filter or everything | step 10 |
| `11-import-pick.png` | Import dialog with a chosen workbook | step 11 |
| `12-import-report.png` | Row by row import report | step 12 |
| `13-imported-grid.png` | The refreshed list after the import | step 13 |
| `14-empty-state.png` | Empty state of a search without result | step 14 |
| `15-mobile.png` | Single column layout at 430 px | step 15 |
| `16-favorites-final.png` | Bookmark view after the whole demonstration | step 16 |
| `17-export-workbook.png` | The generated workbook, rendered from the exported file | `libreoffice-kit render` on `screenshots/fixtures/export-demo.xlsx` |
| `demo-running.gif` | 15 frame animated walk-through | `tools/capture-gif.js` + `tools/build-gif.py` |
| `capture-results.json` | The 28 assertions of the capture run | `tools/capture.js` |
| `commits.png` | The rendered `git log` history | `tools/render-commits.py` |

`capture-results.json` records the expected and the actual value of every
assertion, so a reviewer can see what was checked instead of trusting the image
alone.

Regenerate everything from a clean database:

```bash
npm run seed:reset
node tools/make-import-sample.js
node tools/capture.js            # needs a running server on :8080 and Edge/Chrome
npm run seed:reset
node tools/capture-gif.js
python tools/build-gif.py        # requires Pillow
node server/scripts/exportSample.js       # writes docs/samples/contactbook-export-sample.xlsx
```

The workbook preview `17-export-workbook.png` is made from the exported file:

```bash
node -e "fetch('http://127.0.0.1:8080/api/contacts/export').then(async (r) => require('node:fs').writeFileSync('screenshots/fixtures/export-demo.xlsx', Buffer.from(await r.arrayBuffer())))"
# then render the sheet with LibreOffice (landscape, fit to width) and crop the page
```

The intermediate `screenshots/fixtures/` and `screenshots/gif/` directories are
not committed; the scripts recreate them.
