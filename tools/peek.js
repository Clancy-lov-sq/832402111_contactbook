'use strict';

/**
 * Quick visual check: opens the page, waits for the application, screenshots it.
 *
 *   node tools/peek.js [url] [output]
 */

const path = require('node:path');
const { CdpBrowser, sleep } = require('./cdp');

async function main() {
  const url = process.argv[2] || 'http://127.0.0.1:8080';
  const output = process.argv[3] || path.resolve(__dirname, '..', 'screenshots', 'peek.png');

  const browser = new CdpBrowser({ port: 9337, width: 1600, height: 1000, scale: 1 });
  await browser.launch();
  await browser.goto(url);
  await browser.evaluate(
    "new Promise(function (resolve) { var started = Date.now(); (function poll() { if (window.__demo && window.__demo.state().ready && !window.__demo.state().loading) { resolve(true); } else if (Date.now() - started > 15000) { resolve(false); } else { setTimeout(poll, 120); } })(); })",
    true,
  );
  await sleep(700);
  const state = await browser.evaluate('window.__demo ? window.__demo.state() : null');
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  const file = await browser.screenshot(output);
  process.stdout.write(`saved ${file}\n`);
  await browser.close();
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
