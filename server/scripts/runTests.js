'use strict';

/**
 * One process per test file.
 *
 * Each file gets its own Node.js process, so the API test can create its own
 * temporary SQLite database and its own server without interfering with the
 * others. The exit code is non-zero as soon as one file fails, which is what CI
 * and a grading script need.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const testDirectory = path.resolve(__dirname, '..', 'test');
const files = fs
  .readdirSync(testDirectory)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

if (files.length === 0) {
  process.stderr.write('No test file found\n');
  process.exit(1);
}

const startedAt = Date.now();
let failed = 0;
const durations = [];

for (const file of files) {
  const filePath = path.join(testDirectory, file);
  process.stdout.write(`\n=== ${file} ===\n`);
  const fileStartedAt = Date.now();
  const result = spawnSync(process.execPath, [filePath], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const duration = Date.now() - fileStartedAt;
  durations.push({ file, duration, status: result.status });
  if (result.status !== 0) {
    failed += 1;
  }
}

const totalDuration = Date.now() - startedAt;
process.stdout.write('\n=== Summary ===\n');
for (const entry of durations) {
  const seconds = (entry.duration / 1000).toFixed(2);
  process.stdout.write(
    `${entry.status === 0 ? 'PASS' : 'FAIL'}  ${entry.file}  ${seconds}s\n`,
  );
}
process.stdout.write(
  `\n${files.length - failed}/${files.length} files passed in ${(totalDuration / 1000).toFixed(2)}s\n`,
);

process.exitCode = failed === 0 ? 0 : 1;
