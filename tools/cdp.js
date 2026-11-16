'use strict';

/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * It is used to drive a real browser for the end-to-end verification and to
 * capture the demonstration screenshots of the assignment, so the images always
 * show the application running against the real back end instead of a mock-up.
 *
 * Only the protocol domains that are needed are implemented:
 *   Target, Page, Runtime, Emulation, Input.
 *
 * Node 22+ provides a global WebSocket, so no dependency is required.
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Locations probed for a Chrome/Edge installation. */
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/**
 * Flags used for every launch.
 *
 * The crash reporter flags matter in a restricted environment: without
 * `--disable-breakpad` the handler process cannot be created and the browser
 * terminates during start-up. `--disable-dev-shm-usage` avoids shared memory
 * problems in containerised environments.
 */
const BASE_FLAGS = [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-breakpad',
  '--disable-crash-reporter',
  '--no-crash-upload',
  '--disable-dev-shm-usage',
  '--disable-sync',
  '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
];

/** @returns {string} the browser executable to use */
function findBrowser() {
  const fromEnvironment = process.env.CHROME_PATH;
  if (fromEnvironment && fs.existsSync(fromEnvironment)) {
    return fromEnvironment;
  }
  const found = BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('No Chrome/Edge executable found; set CHROME_PATH');
  }
  return found;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class CdpBrowser {
  /**
   * @param {object} [options]
   * @param {number} [options.port] remote debugging port
   * @param {number} [options.width] viewport width in CSS pixels
   * @param {number} [options.height] viewport height in CSS pixels
   * @param {number} [options.scale] device scale factor (2 = retina screenshots)
   */
  constructor(options = {}) {
    this.port = options.port || 9333;
    this.width = options.width || 1600;
    this.height = options.height || 1000;
    this.scale = options.scale || 2;
    this.browser = null;
    this.profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'calculator-cdp-'));
    this.session = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  /** Launches the browser and attaches to one page target. */
  async launch() {
    const executable = findBrowser();
    this.browser = spawn(
      executable,
      [
        ...BASE_FLAGS,
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.profileDirectory}`,
        `--window-size=${this.width},${this.height}`,
        'about:blank',
      ],
      { stdio: 'ignore' },
    );

    const versionUrl = `http://127.0.0.1:${this.port}/json/version`;
    let version = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(versionUrl);
        version = await response.json();
        break;
      } catch (error) {
        await sleep(250);
      }
    }
    if (!version) {
      throw new Error('The browser did not expose a debugging endpoint');
    }

    const targets = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');
    if (!page) {
      throw new Error('No page target available');
    }
    this.targetId = page.id;

    // The endpoint of /json/list is a browser level socket on current Chromium
    // builds, so page level commands are routed through an attached session.
    this.session = new CdpSession(page.webSocketDebuggerUrl, this);
    await this.session.open();

    await this.sendToTarget('Page.enable');
    await this.sendToTarget('Runtime.enable');
    await this.setViewport(this.width, this.height, this.scale);
    return this;
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<object>}
   */
  send(method, params) {
    return this.session.send(method, params);
  }

  /**
   * Sends a command to the page target.
   *
   * The socket of `/json/list` is a *browser* level endpoint on current
   * Chromium builds: commands such as `Page.enable` are only accepted after
   * `Target.attachToTarget` returned a session id, which is then attached to
   * every message. This helper performs that attachment once and remembers the
   * session id.
   *
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<object>}
   */
  async sendToTarget(method, params = {}) {
    if (this.targetSessionId === undefined) {
      const attached = await this.session.send('Target.attachToTarget', {
        targetId: this.targetId,
        flatten: true,
      });
      this.targetSessionId = attached.sessionId;
    }
    return this.session.send(method, params, this.targetSessionId);
  }

  /** Applies a fixed viewport so every screenshot has identical geometry. */
  async setViewport(width, height, scale) {
    this.width = width;
    this.height = height;
    this.scale = scale;
    await this.sendToTarget('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: false,
    });
  }

  /**
   * Runs JavaScript in the page and returns the value.
   * @param {string} expression
   * @param {boolean} [awaitPromise] wait for a returned promise
   */
  async evaluate(expression, awaitPromise = false) {
    const result = await this.sendToTarget('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const description =
        (result.exceptionDetails.exception && result.exceptionDetails.exception.description) ||
        result.exceptionDetails.text;
      throw new Error(`Page evaluation failed: ${description}`);
    }
    return result.result.value;
  }

  /**
   * Registers a script that runs before any page script, on every navigation.
   * @param {string} source
   */
  async addInitScript(source) {
    this.initScript = source;
    await this.sendToTarget('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  /**
   * Navigates and waits until the document is complete.
   * @param {string} url
   */
  async goto(url) {
    await this.sendToTarget('Page.navigate', { url });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await this.evaluate('document.readyState');
      if (state === 'complete') {
        return;
      }
      await sleep(100);
    }
    throw new Error(`Navigation to ${url} did not finish`);
  }

  /**
   * Waits until the application reports that it is ready.
   * @param {number} [timeoutMs]
   */
  async waitForReady(timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ready = await this.evaluate(
        "(document.readyState === 'complete') && !!window.CalculatorPanel && !!window.__demo",
      );
      if (ready) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error('The front end did not become ready');
      }
      await sleep(150);
    }
  }

  /**
   * Writes a full-page screenshot.
   * @param {string} filePath
   */
  async screenshot(filePath) {
    // A frame is requested twice: the first one can still contain a partially
    // rendered layer, the second one is stable.
    await this.sendToTarget('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const result = await this.sendToTarget('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
    return filePath;
  }

  /**
   * Picks a real file in a file input, exactly like a person would.
   *
   * The browser fires the `change` event itself, so the Vue handler runs with a
   * genuine `File` object and the page behaves as it does for a user.
   *
   * @param {string} selector
   * @param {string} filePath absolute path of the file on this machine
   */
  async setFileInput(selector, filePath) {
    await this.sendToTarget('DOM.enable');
    const document = await this.sendToTarget('DOM.getDocument', { depth: -1, pierce: true });
    const found = await this.sendToTarget('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector,
    });
    if (!found.nodeId) {
      throw new Error(`No file input matches ${selector}`);
    }
    await this.sendToTarget('DOM.setFileInputFiles', {
      files: [filePath],
      nodeId: found.nodeId,
    });
  }

  /** Closes the browser and removes the temporary profile. */
  async close() {
    try {
      if (this.session) {
        await this.session.send('Browser.close').catch(() => {});
        this.session.close();
      }
    } finally {
      if (this.browser && this.browser.exitCode === null) {
        this.browser.kill();
      }
      // The profile directory is released slightly after the process exits.
      await sleep(300);
      fs.rmSync(this.profileDirectory, { recursive: true, force: true });
    }
  }
}

/** One WebSocket connection carrying the protocol messages of a session. */
class CdpSession {
  /**
   * @param {string} url
   * @param {CdpBrowser} browser
   */
  constructor(url, browser) {
    this.url = url;
    this.browser = browser;
    this.socket = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  /** Opens the socket and starts routing responses. */
  open() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener('open', () => resolve());
      this.socket.addEventListener('error', (event) => reject(new Error(`WebSocket error: ${event.message || 'unknown'}`)));
      this.socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id && this.pending.has(message.id)) {
          const { resolve: resolveCall, reject: rejectCall } = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) {
            rejectCall(new Error(`${message.error.message} (${JSON.stringify(message.error.data || {})})`));
          } else {
            resolveCall(message.result);
          }
        }
      });
    });
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @param {string} [sessionId] flat session id of an attached target
   * @returns {Promise<object>}
   */
  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params };
    if (sessionId !== undefined) {
      message.sessionId = sessionId;
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP call timed out: ${method}`));
        }
      }, 30000);
    });
  }

  /** Closes the socket. */
  close() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

/** Kills a browser that was left behind by an earlier run (best effort). */
function killStrayBrowsers(port) {
  if (process.platform === 'win32') {
    spawnSync('cmd', ['/c', `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /F /PID %a`], {
      stdio: 'ignore',
    });
  }
}

module.exports = { CdpBrowser, findBrowser, killStrayBrowsers, sleep };
