'use strict';

/**
 * End-to-end screenshot capture.
 *
 * The script drives the real page in a real browser against the real back end and
 * asserts what is on screen after every action, so the images of the assignment
 * blog show the application working instead of a mock-up.
 *
 *   npm run seed:reset
 *   node tools/make-import-sample.js
 *   node tools/capture.js --url http://127.0.0.1:8080 --out screenshots
 *
 * Options:
 *   --url     address of the running application
 *   --out     directory for the PNG files and the JSON report
 *   --only    comma separated step numbers, for debugging
 */

const fs = require('node:fs');
const path = require('node:path');

const { CdpBrowser, sleep } = require('./cdp');

/** Parses `--name value` arguments. */
function parseArguments(argv) {
  const options = {
    url: 'http://127.0.0.1:8080',
    out: path.resolve(__dirname, '..', 'screenshots'),
    only: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--url') {
      options.url = argv[index + 1];
      index += 1;
    } else if (key === '--out') {
      options.out = path.resolve(argv[index + 1]);
      index += 1;
    } else if (key === '--only') {
      options.only = argv[index + 1].split(',').map((value) => value.trim());
      index += 1;
    }
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const outputDirectory = options.out;
fs.mkdirSync(outputDirectory, { recursive: true });

const sampleWorkbook = path.resolve(__dirname, '..', 'screenshots', 'fixtures', 'import-demo.xlsx');

/** Results of the assertions and the captured files. */
const results = [];

/** Records one assertion. */
function check(label, actual, expected) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ label, expected, actual, passed });
  process.stdout.write(
    `   ${passed ? 'ok  ' : 'FAIL'} ${label}${passed ? '' : ` -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`}\n`,
  );
  if (!passed) {
    process.exitCode = 1;
  }
}

/** Records a value without comparing it. */
function note(label, value) {
  results.push({ label, value });
  process.stdout.write(`   note ${label}: ${JSON.stringify(value)}\n`);
}

/** No animation and no blinking caret while the images are taken. */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

const browser = new CdpBrowser({ port: 9338, width: 1600, height: 1000, scale: 2 });

/** Runs JavaScript in the page. */
function evaluate(expression, awaitPromise = false) {
  return browser.evaluate(expression, awaitPromise);
}

/** Calls one hook of `window.__demo`. */
function demo(call) {
  return evaluate(`window.__demo.${call}`);
}

/** Waits until the page satisfies an expression. */
function waitFor(expression, timeout = 10000) {
  return evaluate(`window.__demo.waitFor(${JSON.stringify(expression)}, ${timeout})`, true);
}

/** Waits until no request is in flight. */
async function waitIdle(timeout = 10000) {
  await evaluate(`window.__demo.waitIdle(${timeout})`, true);
}

/** Reads the current application state. */
function state() {
  return demo('state()');
}

/** Writes one screenshot and remembers it. */
async function shot(fileName) {
  await sleep(260);
  const file = await browser.screenshot(path.join(outputDirectory, fileName));
  results.push({ screenshot: path.basename(file) });
  process.stdout.write(`   saved ${path.basename(file)}\n`);
}

/** The steps of the demonstration, in the order of the blog article. */
const steps = [];

/** @param {string} number @param {string} title @param {Function} action */
function step(number, title, action) {
  steps.push({ number, title, action });
}

step('01', 'The address book with every contact', async () => {
  await demo('showAll()');
  await waitFor('window.__contactbook.filters.groupId === "all" && window.__contactbook.filters.keyword === ""');
  await waitIdle();
  const current = await state();
  check('the book holds the seeded contacts', current.total, 20);
  check('one page shows twelve cards', current.items.length, 12);
  check('seven contacts are bookmarked', current.stats.bookmarked, 7);
  check('the sidebar reports 54 contact methods', current.stats.methodCount, 54);
  await shot('01-home.png');
});

step('02', 'The bookmark view', async () => {
  await demo('showBookmarks()');
  await waitFor('window.__contactbook.filters.bookmarked === true && window.__contactbook.total === 7');
  await waitIdle();
  const current = await state();
  check('the bookmark view lists seven contacts', current.total, 7);
  check('every card of the view is bookmarked', current.items.every((item) => item.isBookmarked), true);
  await shot('02-favorites.png');
});

step('03', 'Search across names, companies and methods', async () => {
  await demo("search('Yuntu')");
  await waitFor('window.__contactbook.total === 6 && window.__contactbook.filters.keyword === "Yuntu"');
  await waitIdle();
  const current = await state();
  check('six colleagues share the keyword', current.total, 6);
  await shot('03-search.png');
});

step('04', 'Filtering by group', async () => {
  await demo("search('')");
  await demo('showGroup(3)');
  await waitFor('window.__contactbook.filters.groupId === 3 && window.__contactbook.total === 6');
  await waitIdle();
  const current = await state();
  check('the colleague group holds six contacts', current.total, 6);
  note('subtitle', await evaluate("document.querySelector('[data-testid=\"view-title\"]').textContent"));
  await shot('04-group.png');
});

step('05', 'Starring a contact', async () => {
  await demo('showAll()');
  await waitFor('window.__contactbook.total === 20');
  await waitIdle();
  // The card to star is the first one without a star on the current page, so the
  // step does not depend on the seed order.
  const target = await evaluate(`(function () {
    var card = Array.prototype.find.call(
      document.querySelectorAll('[data-testid="contact-card"]'),
      function (element) { return !element.querySelector('.card__star.is-on'); }
    );
    return card ? { id: Number(card.dataset.contactId), name: card.querySelector('[data-testid^="contact-name-"]').textContent.trim() } : null;
  })()`);
  if (!target) {
    throw new Error('No un-starred card on the first page');
  }
  note('contact to star', target);
  await evaluate(`window.__demo.click('[data-contact-id="${target.id}"] [data-testid="bookmark-button"]')`);
  await waitFor('window.__contactbook.stats.bookmarked === 8');
  await sleep(300);
  const current = await state();
  check('the star was stored', current.items.find((item) => item.id === target.id).isBookmarked, true);
  check('the counter follows the star', current.stats.bookmarked, 8);
  check('a confirmation toast is visible', current.toasts.some((toast) => toast.includes('Added to favorites')), true);
  await shot('05-bookmark-toast.png');
});

step('06', 'The detail drawer with four contact methods', async () => {
  await demo('openDetail(13)');
  await waitFor('window.__contactbook.detail && window.__contactbook.detail.id === 13');
  await waitIdle();
  const detail = await evaluate(`({
    name: document.querySelector('[data-testid="detail-name"]').textContent.trim(),
    methods: document.querySelectorAll('[data-testid="detail-drawer"] .method-row').length,
  })`);
  check('the drawer shows the right person', detail.name, 'William Jiang');
  check('the drawer lists every method', detail.methods, 4);
  await shot('06-detail.png');
});

step('07', 'Creating a contact with several methods', async () => {
  await demo('closeDetail()');
  await demo('openCreateForm()');
  await waitFor('window.__contactbook.form.open === true');
  await demo("type('[data-testid=\"form-name\"]', 'Chloe Lau')");
  await demo("type('[data-testid=\"form-company\"]', 'Xiamen University')");
  await demo("type('[data-testid=\"form-title\"]', 'Software engineering')");
  await demo("type('[data-testid=\"form-note\"]', 'Course project contact; email preferred')");
  await demo("select('[data-testid=\"form-group\"]', '2')");
  await demo("type('[data-testid=\"method-label-0\"]', 'Mobile')");
  await demo("type('[data-testid=\"method-value-0\"]', '138 0000 8888')");
  await demo("click('[data-testid=\"add-method-email\"]')");
  await demo("type('[data-testid=\"method-label-1\"]', 'Work')");
  await demo("type('[data-testid=\"method-value-1\"]', 'chloe.lau@example.com')");
  await demo("click('[data-testid=\"add-method-wechat\"]')");
  await demo("type('[data-testid=\"method-value-2\"]', 'chloe_lau')");
  await demo("click('[data-testid=\"form-bookmark\"]')");
  await sleep(300);
  const methodRows = await evaluate("document.querySelectorAll('.method-edit').length");
  check('the form edits three contact methods', methodRows, 3);
  await shot('07-new-contact-form.png');
});

step('08', 'Client side validation of a method value', async () => {
  await demo("type('[data-testid=\"method-value-1\"]', 'not-an-email')");
  await demo("click('[data-testid=\"form-submit\"]')");
  await waitFor("!!document.querySelector('.method-edit__error')");
  const message = await evaluate("document.querySelector('.method-edit__error').textContent.trim()");
  check(
    'the e-mail format is explained',
    message.includes('Must contain @'),
    true,
  );
  note('validation message', message);
  await shot('08-form-validation.png');
});

step('09', 'Saving the new contact', async () => {
  await demo("type('[data-testid=\"method-value-1\"]', 'chloe.lau@example.com')");
  await demo("click('[data-testid=\"form-submit\"]')");
  await waitFor('window.__contactbook.form.open === false && window.__contactbook.total === 21');
  await waitIdle();
  await sleep(400);
  const current = await state();
  check('the new contact is stored', current.total, 21);
  check('the new contact is bookmarked', current.stats.bookmarked, 9);
  check('a success toast is visible', current.toasts.some((toast) => toast.includes('Contact created')), true);
  await shot('09-created-toast.png');
});

step('10', 'The export menu', async () => {
  await evaluate("window.__demo.click('[data-testid=\"export-button\"]')");
  await waitFor("!!document.querySelector('[data-testid=\"export-menu\"]')");
  const items = await evaluate(
    "Array.prototype.map.call(document.querySelectorAll('[data-testid=\"export-menu\"] .menu__item'), function (item) { return item.textContent.trim(); })",
  );
  check('the menu offers both scopes', items.length, 2);
  note('menu items', items);
  await shot('10-export-menu.png');
  await evaluate("document.body.click()");
});

step('11', 'Choosing a workbook to import', async () => {
  await demo('openImportDialog()');
  await waitFor('window.__contactbook.importDialog.open === true');
  await browser.setFileInput('[data-testid="import-file-input"]', sampleWorkbook);
  await waitFor("!!document.querySelector('[data-testid=\"import-file-card\"]')");
  const fileName = await evaluate("document.querySelector('[data-testid=\"import-file-card\"] .file-card__name').textContent.trim()");
  check('the chosen file is shown', fileName.includes('import-demo.xlsx'), true);
  await shot('11-import-pick.png');
});

step('12', 'The row by row import report', async () => {
  await demo("click('[data-testid=\"import-submit\"]')");
  await waitFor("!!document.querySelector('[data-testid=\"import-report\"]')", 20000);
  // The report is read through JSON so the page-side reactive proxy is converted
  // to a plain value before it crosses the debugger protocol.
  const report = JSON.parse(await evaluate('JSON.stringify(window.__contactbook.importDialog.report)'));
  check('three contacts were created', report.created, 3);
  check('the duplicate row was skipped', report.skipped, 1);
  check('the invalid row was reported', report.failed, 1);
  check('the workbook had five data rows', report.totalRows, 5);
  note('failures', report.rows.filter((row) => row.status === 'failed').map((row) => row.message));
  await shot('12-import-report.png');
});

step('13', 'The refreshed book after the import', async () => {
  await demo("click('[data-testid=\"import-finish\"]')");
  await waitFor('window.__contactbook.importDialog.open === false && window.__contactbook.total === 24');
  await waitIdle();
  await sleep(400);
  const current = await state();
  check('the imported contacts are in the book', current.total, 24);
  check('the weekly counter noticed the import', current.stats.bookmarked, 11);
  await shot('13-imported-grid.png');
});

step('14', 'The empty state of a search without result', async () => {
  await demo("search('zzzz')");
  await waitFor('window.__contactbook.total === 0 && !!document.querySelector(\'[data-testid="empty-state"]\')');
  await waitIdle();
  await shot('14-empty-state.png');
  await demo('clearFilters()');
  await waitFor('window.__contactbook.total === 24');
});

step('15', 'The responsive layout', async () => {
  await demo('showAll()');
  await waitFor('window.__contactbook.filters.groupId === "all" && window.__contactbook.total === 24');
  await waitIdle();
  await browser.setViewport(430, 932, 1);
  await sleep(600);
  const columns = await evaluate("getComputedStyle(document.querySelector('[data-testid=\"contact-grid\"]')).gridTemplateColumns.split(' ').length");
  check('the mobile layout is a single column', columns, 1);
  await shot('15-mobile.png');
  await browser.setViewport(1600, 1000, 2);
  await sleep(400);
});

step('16', 'The bookmark view after the demonstration', async () => {
  await demo('showBookmarks()');
  await waitFor('window.__contactbook.filters.bookmarked === true && window.__contactbook.total === 11');
  await waitIdle();
  const current = await state();
  check('eleven contacts are bookmarked at the end', current.total, 11);
  await shot('16-favorites-final.png');
});

async function main() {
  await browser.launch();
  await browser.addInitScript(`(function () {
    document.addEventListener('DOMContentLoaded', function () {
      var style = document.createElement('style');
      style.textContent = ${JSON.stringify(FREEZE_CSS)};
      document.head.appendChild(style);
    });
  })();`);

  process.stdout.write(`Opening ${options.url}\n`);
  await browser.goto(options.url);
  await waitFor('window.__demo !== undefined && window.__demo.state().ready === true', 20000);
  await waitIdle();
  await sleep(500);

  const selected = options.only
    ? steps.filter((item) => options.only.includes(item.number))
    : steps;

  for (const item of selected) {
    process.stdout.write(`\n[${item.number}] ${item.title}\n`);
    try {
      await item.action();
    } catch (error) {
      process.exitCode = 1;
      results.push({ step: item.number, error: error.message });
      process.stdout.write(`   ERROR ${error.message}\n`);
      try {
        await browser.screenshot(path.join(outputDirectory, `error-${item.number}.png`));
      } catch (screenshotError) {
        process.stdout.write(`   could not save the error frame: ${screenshotError.message}\n`);
      }
    }
  }

  await browser.close();

  const passed = results.filter((entry) => entry.passed === true).length;
  const failed = results.filter((entry) => entry.passed === false).length;
  const errors = results.filter((entry) => entry.error).length;
  fs.writeFileSync(
    path.join(outputDirectory, 'capture-results.json'),
    `${JSON.stringify({
      url: options.url,
      capturedAt: new Date().toISOString(),
      passed,
      failed,
      errors,
      results,
    }, null, 2)}\n`,
  );
  process.stdout.write(`\n${passed} assertion(s) passed, ${failed} failed, ${errors} step error(s)\n`);
  process.stdout.write(`Report: ${path.join(outputDirectory, 'capture-results.json')}\n`);
}

main().catch((error) => {
  process.stderr.write(`Capture failed: ${error.stack}\n`);
  process.exitCode = 1;
});
