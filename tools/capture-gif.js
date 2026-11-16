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
  await frame('全部联系人：卡片里显示主要联系方式');

  await demo('showBookmarks()');
  await waitFor('window.__contactbook.total === 7');
  await frame('我的收藏：星标联系人集中显示');

  await demo('showGroup(3)');
  await waitFor('window.__contactbook.total === 6');
  await frame('按分组筛选：同事');

  await demo("search('云图')");
  await waitFor('window.__contactbook.total === 6');
  await frame('搜索“云图”：姓名、公司、备注、联系方式统一匹配');

  // 5-6: detail drawer and the bookmark action.
  await demo("search('')");
  await demo('showAll()');
  await waitFor('window.__contactbook.total === 20');
  await demo('openDetail(13)');
  await waitFor('window.__contactbook.detail && window.__contactbook.detail.id === 13');
  await frame('详情抽屉：一位联系人的四条联系方式');

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
  await frame('点击星标：收藏立即生效并给出提示');

  // 7-10: creating a contact with three contact methods.
  await demo('openCreateForm()');
  await waitFor('window.__contactbook.form.open === true');
  await frame('新建联系人：表单从一条电话开始');

  await demo("type('[data-testid=\"form-name\"]', '林澄月')");
  await demo("type('[data-testid=\"form-company\"]', '厦门大学')");
  await demo("type('[data-testid=\"form-title\"]', '软件工程')");
  await demo("select('[data-testid=\"form-group\"]', '2')");
  await frame('填写姓名、公司与分组');

  await demo("type('[data-testid=\"method-label-0\"]', '手机')");
  await demo("type('[data-testid=\"method-value-0\"]', '138 0000 8888')");
  await demo("click('[data-testid=\"add-method-email\"]')");
  await demo("type('[data-testid=\"method-label-1\"]', '常用')");
  await demo("type('[data-testid=\"method-value-1\"]', 'chengyue.lin@example.com')");
  await demo("click('[data-testid=\"add-method-wechat\"]')");
  await demo("type('[data-testid=\"method-value-2\"]', 'chengyue_lin')");
  await demo("click('[data-testid=\"form-bookmark\"]')");
  await frame('一位联系人可以有多条联系方式，并可设为主要');

  await demo("type('[data-testid=\"method-value-2\"]', 'chengyue.lin')");
  await demo("click('[data-testid=\"form-submit\"]')");
  await waitFor('window.__contactbook.form.open === false && window.__contactbook.total === 21');
  await frame('保存成功：新联系人出现在列表顶部');

  // 11-12: the import workflow.
  await demo('openImportDialog()');
  await waitFor('window.__contactbook.importDialog.open === true');
  await frame('导入：选择 .xlsx 工作簿（可拖入）');
  await browser.setFileInput('[data-testid="import-file-input"]', sampleWorkbook);
  await waitFor('!!document.querySelector(\'[data-testid="import-file-card"]\')');
  await frame('导入：选择“跳过重复”或“更新已有”');
  await demo("click('[data-testid=\"import-submit\"]')");
  await waitFor('!!document.querySelector(\'[data-testid="import-report"]\')', 20000);
  await frame('导入报告：新增、更新、跳过与失败逐行说明');

  await demo("click('[data-testid=\"import-finish\"]')");
  await waitFor('window.__contactbook.importDialog.open === false && window.__contactbook.total === 24');
  await frame('导入完成：列表与分组计数同步刷新');

  await demo('showBookmarks()');
  await waitFor('window.__contactbook.total === 11');
  await frame('收藏视图：整份通讯录里最重要的联系人');

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
