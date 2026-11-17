'use strict';

/**
 * Records the frames of the animated demonstration.
 *
 * The script walks through the main workflows of the application and writes one
 * PNG per step. `tools/build-gif.py` then assembles the frames into the GIF that
 * the blog embeds, so the animation is reproducible from a script instead of a
 * hand recorded screen capture.
 *
 *   node tools/capture-gif.js
 */

const fs = require('node:fs');
const path = require('node:path');

const { CdpBrowser, sleep } = require('./cdp');

const outputDirectory = path.resolve(__dirname, '..', 'screenshots', 'gif');
const sampleWorkbook = path.resolve(__dirname, '..', 'screenshots', 'fixtures', 'import-demo.xlsx');

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

const browser = new CdpBrowser({ port: 9339, width: 1400, height: 875, scale: 1 });
const frames = [];

/** Runs JavaScript in the page. */
function evaluate(expression, awaitPromise = false) {
  return browser.evaluate(expression, awaitPromise);
}

/** Calls a hook of `window.__demo`. */
function demo(call) {
  return evaluate(`window.__demo.${call}`);
}

/** Waits until the page satisfies an expression. */
function waitFor(expression, timeout = 12000) {
  return evaluate(`window.__demo.waitFor(${JSON.stringify(expression)}, ${timeout})`, true);
}

/** Captures one frame. */
async function frame(label) {
  await sleep(240);
  const index = String(frames.length + 1).padStart(2, '0');
  const file = path.join(outputDirectory, `frame-${index}.png`);
  await browser.screenshot(file);
  frames.push({ file: path.basename(file), label });
  process.stdout.write(`frame ${index}: ${label}\n`);
}

async function main() {
  await browser.launch();
  await browser.addInitScript(`(function () {
    document.addEventListener('DOMContentLoaded', function () {
      var style = document.createElement('style');
      style.textContent = ${JSON.stringify(FREEZE_CSS)};
      document.head.appendChild(style);
    });
  })();`);

  await browser.goto('http://127.0.0.1:8080');
  await waitFor('window.__demo && window.__demo.state().ready === true', 20000);
  await evaluate('window.__demo.waitIdle(12000)', true);
  await sleep(400);

  // 1-4: the main views of the address book.
  await demo('showAll()');
  await waitFor('window.__contactbook.total === 20');
  await frame('All contacts: cards show the primary methods');

  await demo('showBookmarks()');
  await waitFor('window.__contactbook.total === 7');
  await frame('Favorites: bookmarked contacts in one place');

  await demo('showGroup(3)');
  await waitFor('window.__contactbook.total === 6');
  await frame('Filter by group: Colleagues');

  await demo("search('Yuntu')");
  await waitFor('window.__contactbook.total === 6');
  await frame('Search “Yuntu”: names, companies, notes and methods all match');

  // 5-6: detail drawer and the bookmark action.
  await demo("search('')");
  await demo('showAll()');
  await waitFor('window.__contactbook.total === 20');
  await demo('openDetail(13)');
  await waitFor('window.__contactbook.detail && window.__contactbook.detail.id === 13');
  await frame('Detail drawer: four contact methods of one person');

  await demo('closeDetail()');
  const target = await evaluate(`(function () {
    var card = Array.prototype.find.call(
      document.querySelectorAll('[data-testid="contact-card"]'),
      function (element) { return !element.querySelector('.card__star.is-on'); }
    );
    return card ? Number(card.dataset.contactId) : null;
  })()`);
  await evaluate(`window.__demo.click('[data-contact-id="${target}"] [data-testid="bookmark-button"]')`);
  await waitFor('window.__contactbook.stats.bookmarked === 8');
  await frame('Click the star: the bookmark is stored and confirmed');

  // 7-10: creating a contact with three contact methods.
  await demo('openCreateForm()');
  await waitFor('window.__contactbook.form.open === true');
  await frame('New contact: the form starts with one phone row');

  await demo("type('[data-testid=\"form-name\"]', 'Chloe Lau')");
  await demo("type('[data-testid=\"form-company\"]', 'Xiamen University')");
  await demo("type('[data-testid=\"form-title\"]', 'Software engineering')");
  await demo("select('[data-testid=\"form-group\"]', '2')");
  await frame('Fill in name, company and group');

  await demo("type('[data-testid=\"method-label-0\"]', 'Mobile')");
  await demo("type('[data-testid=\"method-value-0\"]', '138 0000 8888')");
  await demo("click('[data-testid=\"add-method-email\"]')");
  await demo("type('[data-testid=\"method-label-1\"]', 'Work')");
  await demo("type('[data-testid=\"method-value-1\"]', 'chloe.lau@example.com')");
  await demo("click('[data-testid=\"add-method-wechat\"]')");
  await demo("type('[data-testid=\"method-value-2\"]', 'chloe_lau')");
  await demo("click('[data-testid=\"form-bookmark\"]')");
  await frame('One contact can hold several methods and a primary one');

  await demo("type('[data-testid=\"method-value-2\"]', 'chloe_lau')");
  await demo("click('[data-testid=\"form-submit\"]')");
  await waitFor('window.__contactbook.form.open === false && window.__contactbook.total === 21');
  await frame('Saved: the new contact appears at the top');

  // 11-12: the import workflow.
  await demo('openImportDialog()');
  await waitFor('window.__contactbook.importDialog.open === true');
  await frame('Import: choose an .xlsx workbook (or drop it)');
  await browser.setFileInput('[data-testid="import-file-input"]', sampleWorkbook);
  await waitFor('!!document.querySelector(\'[data-testid="import-file-card"]\')');
  await frame('Import: skip duplicates or update existing contacts');
  await demo("click('[data-testid=\"import-submit\"]')");
  await waitFor('!!document.querySelector(\'[data-testid="import-report"]\')', 20000);
  await frame('Import report: created, updated, skipped and failed rows');

  await demo("click('[data-testid=\"import-finish\"]')");
  await waitFor('window.__contactbook.importDialog.open === false && window.__contactbook.total === 24');
  await frame('Import finished: list and group counts refresh');

  await demo('showBookmarks()');
  await waitFor('window.__contactbook.total === 11');
  await frame('Favorites: the contacts that matter most');

  fs.writeFileSync(
    path.join(outputDirectory, 'frames.json'),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), frames }, null, 2)}\n`,
  );
  await browser.close();
  process.stdout.write(`\n${frames.length} frames written to ${outputDirectory}\n`);
}

main().catch(async (error) => {
  process.stderr.write(`GIF capture failed: ${error.stack}\n`);
  try {
    await browser.screenshot(path.join(outputDirectory, 'error.png'));
  } catch (screenshotError) {
    // The browser may already be gone.
  }
  process.exitCode = 1;
});
