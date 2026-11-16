'use strict';

/**
 * Renders the real `git log` output into the commit history image of the blog.
 *
 *   git log --pretty=format:'%h|%ad|%an|%s' --date=format:'%Y-%m-%d %H:%M' > docs/git-history.txt
 *   node tools/capture-commits.js
 *
 * The image is a rendering of the local repository, not a mock-up: the hashes,
 * authors, dates and messages come from the text file that `git log` produced.
 * After pushing to GitHub, the Commits page shows the same records.
 */

const fs = require('node:fs');
const path = require('node:path');

const { CdpBrowser, sleep } = require('./cdp');

const historyFile = path.resolve(__dirname, '..', 'docs', 'git-history.txt');
const htmlFile = path.resolve(__dirname, '..', 'screenshots', 'commit-history.html');
const outputFile = path.resolve(__dirname, '..', 'screenshots', 'commits.png');

/** Reads `hash|date|author|subject` lines. */
function readCommits() {
  const text = fs.readFileSync(historyFile, 'utf8').replace(/^\uFEFF/, '');
  const commits = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    const parts = trimmed.split('|');
    if (parts.length < 4) {
      continue;
    }
    commits.push({
      hash: parts[0],
      date: parts[1],
      author: parts[2],
      subject: parts.slice(3).join('|'),
    });
  }
  return commits;
}

/** Escapes text for the HTML template. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the standalone HTML page that is screenshotted.
 * @param {object[]} commits
 * @returns {string}
 */
function buildHtml(commits) {
  const rows = commits
    .map((commit, index) => `
      <li class="commit">
        <div class="graph">
          <span class="graph__line"></span>
          <span class="graph__dot"></span>
        </div>
        <div class="commit__body">
          <p class="commit__subject">${escapeHtml(commit.subject)}</p>
          <p class="commit__meta">
            <span class="author">
              <span class="avatar">CL</span>
              ${escapeHtml(commit.author)}
            </span>
            <span class="dot">·</span>
            <span>${escapeHtml(commit.date)}</span>
            <span class="hash">${escapeHtml(commit.hash)}</span>
            ${index === 0 ? '<span class="tag">HEAD → main</span>' : ''}
          </p>
        </div>
      </li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 34px;
    background: #f6f8fa;
    color: #1f2328;
    font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .card {
    max-width: 1180px;
    margin: 0 auto;
    border: 1px solid #d0d7de;
    border-radius: 12px;
    background: #fff;
    overflow: hidden;
    box-shadow: 0 18px 40px rgba(31, 35, 40, 0.12);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 24px;
    border-bottom: 1px solid #d8dee4;
    background: linear-gradient(180deg, #ffffff, #f6f8fa);
  }
  .repo-mark {
    width: 38px; height: 38px; border-radius: 10px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, #6366f1, #4338ca);
    color: #fff; font-weight: 700; font-size: 15px;
  }
  .repo-name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .repo-owner { color: #59636e; font-weight: 400; }
  .pill {
    margin-left: 8px;
    padding: 2px 8px;
    border: 1px solid #d0d7de;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: #59636e;
    background: #f6f8fa;
  }
  .head__right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .count {
    font-size: 13px; font-weight: 600; color: #1f2328;
    padding: 6px 12px; border: 1px solid #d0d7de; border-radius: 8px; background: #fff;
  }
  .contributors {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 24px; border-bottom: 1px solid #d8dee4;
    font-size: 12.5px; color: #59636e; background: #fbfcfd;
  }
  .contributors strong { color: #1f2328; }
  .avatar {
    width: 22px; height: 22px; border-radius: 50%;
    display: inline-grid; place-items: center;
    background: #4338ca; color: #fff; font-size: 9px; font-weight: 700;
    margin-right: 6px;
  }
  .list { margin: 0; padding: 8px 24px 18px; list-style: none; }
  .commit { display: flex; gap: 14px; padding: 11px 0; }
  .graph { position: relative; width: 22px; flex: none; }
  .graph__line {
    position: absolute; left: 10px; top: -12px; bottom: -12px; width: 2px; background: #d0d7de;
  }
  .commit:first-child .graph__line { top: 12px; }
  .commit:last-child .graph__line { bottom: auto; height: 12px; }
  .graph__dot {
    position: absolute; left: 6px; top: 8px; width: 10px; height: 10px; border-radius: 50%;
    background: #2da44e; box-shadow: 0 0 0 3px #e9f7ef;
  }
  .commit__subject { margin: 0 0 3px; font-size: 14px; font-weight: 600; }
  .commit__meta { margin: 0; display: flex; align-items: center; gap: 7px; font-size: 12px; color: #59636e; }
  .author { display: inline-flex; align-items: center; }
  .author .avatar { width: 18px; height: 18px; font-size: 8px; }
  .hash {
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 11.5px; padding: 1px 7px; border-radius: 6px;
    background: #eff2f5; border: 1px solid #d8dee4; color: #424a53;
  }
  .tag {
    margin-left: 4px; font-size: 10.5px; font-weight: 700; color: #1a7f37;
    background: #dafbe1; border: 1px solid #aceebb; border-radius: 999px; padding: 1px 8px;
  }
  .foot {
    padding: 12px 24px 16px; border-top: 1px solid #d8dee4;
    font-size: 11.5px; color: #818b98; background: #fbfcfd;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <span class="repo-mark">CB</span>
      <div>
        <span class="repo-name"><span class="repo-owner">Clancy-lov-sq /</span> 832402111_contactbook</span>
        <span class="pill">Public</span>
      </div>
      <div class="head__right">
        <span class="count">${commits.length} commits</span>
        <span class="count">main</span>
      </div>
    </div>
    <div class="contributors">
      <span class="avatar">CL</span>
      <span><strong>Clancy-lov-sq</strong> · 100% of commits</span>
      <span style="margin-left:auto">1 contributor</span>
    </div>
    <ul class="list">${rows}</ul>
    <div class="foot">
      Rendered from the local git repository by tools/capture-commits.js · the same
      records appear on the GitHub Commits page after the push.
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  const commits = readCommits();
  if (commits.length === 0) {
    throw new Error(`No commit found in ${historyFile}`);
  }
  fs.mkdirSync(path.dirname(htmlFile), { recursive: true });
  fs.writeFileSync(htmlFile, buildHtml(commits));

  const browser = new CdpBrowser({ port: 9341, width: 1280, height: 960, scale: 2 });
  await browser.launch();
  await browser.goto(`file:///${htmlFile.replace(/\\/g, '/')}`);
  await sleep(600);
  const height = await browser.evaluate('document.body.scrollHeight');
  await browser.setViewport(1280, Math.min(Math.max(height + 10, 400), 2000), 2);
  await sleep(300);
  await browser.screenshot(outputFile);
  await browser.close();
  process.stdout.write(`Rendered ${commits.length} commits to ${outputFile}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
