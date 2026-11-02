const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
let browser, server, base;
const root = path.resolve(__dirname, "..");
before(async () => {
  server = http.createServer(async (request, response) => {
    try {
      const file = path.resolve(root, "." + new URL(request.url, "http://localhost").pathname);
      if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
      response.setHeader("Content-Type", mime[path.extname(file)] || "text/plain"); response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.APPLYKIT_CHROME_CHANNEL || "chrome", headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
async function settings(viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.chrome = { storage: { local: {
      get: async () => ({ profile: JSON.parse(localStorage.getItem("fixtureProfile") || "{}") }),
      set: async ({ profile }) => localStorage.setItem("fixtureProfile", JSON.stringify(profile))
    } } };
  });
  await page.goto(`${base}/options.html`); await page.locator('input[name="firstName"]').waitFor(); return page;
}

test("settings save expanded fields, restore legacy backups, and reject malformed data", async () => {
  const page = await settings(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  assert.ok(await page.evaluate(() => ApplyKitSchema.fields.length) >= 60);
  await page.locator('input[name="firstName"]').fill("Example"); await page.locator('input[name="phoneCountryCode"]').fill("44");
  await page.locator('a[href="#address"]').click(); await page.locator('input[name="city"]').fill("Example City");
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.waitForFunction(() => document.getElementById('save-status').textContent.includes('All changes saved'));
  assert.equal(await page.locator('input[name="phoneCountryCode"]').inputValue(), "+44");
  await page.reload(); assert.equal(await page.locator('input[name="firstName"]').inputValue(), "Example");
  await page.locator('#field-search').fill("salary"); assert.equal(await page.locator('input[name="firstName"]').isVisible(), false); assert.equal(await page.locator('input[name="expectedSalary"]').isVisible(), true);
  await page.locator('#field-search').fill(""); assert.equal(await page.locator('input[name="firstName"]').isVisible(), true);
  await page.locator('#import-file').setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ profile: { email: 123 } })) });
  await page.waitForFunction(() => document.getElementById('save-status').textContent.includes('Invalid value'));
  assert.equal(await page.locator('input[name="firstName"]').inputValue(), "Example");
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({ name: "legacy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 1, profile: { fullName: "Fictional Applicant", custom: { "Preferred editor": "Fictional editor" } } })) });
  await page.waitForFunction(() => document.getElementById('save-status').textContent.includes('Backup restored'));
  assert.equal(await page.locator('input[name="fullName"]').inputValue(), "Fictional Applicant"); assert.equal(await page.locator('.custom-row').count(), 1); assert.deepEqual(errors, []); await page.close();
});

test("a PDF is persisted separately from the profile and can be removed", async () => {
  const page = await settings();
  await page.locator('#resume-file').setInputFiles({ name: "fictional.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nFictional test fixture") });
  await page.waitForFunction(() => document.getElementById('resume-status').textContent.includes('fictional.pdf'));
  await page.reload(); await page.waitForFunction(() => document.getElementById('resume-status').textContent.includes('fictional.pdf'));
  assert.equal(await page.locator('#remove-resume').isVisible(), true);
  await page.locator('#resume-file').setInputFiles({ name: "wrong.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") });
  await page.waitForFunction(() => document.getElementById('resume-status').textContent.includes('does not appear'));
  await page.locator('#remove-resume').click(); await page.waitForFunction(() => document.getElementById('resume-status').textContent.includes('No PDF stored'));
  assert.equal(await page.locator('#remove-resume').isVisible(), false); await page.close();
});

test("desktop and narrow layouts render without horizontal overflow", async () => {
  const page = await settings(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  if (process.env.APPLYKIT_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.APPLYKIT_SCREENSHOTS, 'profile.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.goto(`${base}/popup.html`); await page.waitForFunction(() => document.getElementById('profile-summary').textContent.includes('get started'));
  assert.equal(await page.locator('#fill-button').textContent(), "Review matching fields →");
  await page.setViewportSize({ width: 400, height: 600 });
  if (process.env.APPLYKIT_SCREENSHOTS) await page.locator('body').screenshot({ path: path.join(process.env.APPLYKIT_SCREENSHOTS, 'popup.png'), animations: 'disabled' });
  assert.deepEqual(errors, []); await page.close();
});

test("popup previews before filling, attaches the PDF only on confirmation, and can undo", async () => {
  const target = await browser.newPage(); await target.setContent('<label>Email<input id="application-email" type="email"></label><label>Resume<input type="file" accept=".pdf"></label>');
  const profile = { fullName: "Fictional Applicant", email: "fictional@example.test" };
  const popup = await browser.newPage({ viewport: { width: 380, height: 700 } });
  await popup.exposeFunction('fixtureExecute', async request => {
    if (request.files) {
      for (const file of request.files) await target.addScriptTag({ path: path.join(root, file) });
      return [{}];
    }
    const result = await target.evaluate(args => applyKitFill(...args), request.args);
    return [{ result }];
  });
  await popup.addInitScript(profile => {
    window.chrome = { storage: { local: { get: async () => ({ profile }) } }, tabs: { query: async () => [{ id: 100 }] }, scripting: { executeScript: request => window.fixtureExecute({ files: request.files, args: request.args }) }, runtime: { openOptionsPage: async () => {} } };
  }, profile);
  await popup.goto(`${base}/popup.html`);
  await popup.evaluate(async () => ApplyKitStorage.saveResume(new File(['%PDF-1.7\nFictional fixture'], 'fictional-resume.pdf', { type: 'application/pdf' })));
  await popup.reload(); await popup.waitForFunction(() => document.getElementById('resume-summary').textContent === 'fictional-resume.pdf');
  await popup.locator('#fill-button').click(); await popup.waitForFunction(() => document.getElementById('fill-button').textContent.includes('Fill 2 matched'));
  assert.equal(await target.locator('#application-email').inputValue(), ""); assert.equal(await target.locator('input[type=file]').evaluate(field => field.files.length), 0);
  await popup.locator('#fill-button').click(); await popup.waitForFunction(() => document.getElementById('status').textContent.includes('attached your PDF'));
  assert.equal(await target.locator('#application-email').inputValue(), profile.email); assert.equal(await target.locator('input[type=file]').evaluate(field => field.files[0].name), 'fictional-resume.pdf');
  await popup.locator('#undo-button').click(); await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Restored 2 fields'));
  assert.equal(await target.locator('#application-email').inputValue(), ""); assert.equal(await target.locator('input[type=file]').evaluate(field => field.files.length), 0);
  await popup.close(); await target.close();
});

async function quickCopyPopup(profile, options = {}) {
  const page = await browser.newPage({ viewport: { width: 400, height: 600 }, reducedMotion: "reduce" });
  await page.addInitScript(({ profile, options }) => {
    window.chrome = { storage: { local: { get: async () => ({ profile }) } }, runtime: { openOptionsPage: async () => {} } };
    if (options.clipboardFailure) Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Clipboard unavailable'); } } });
    if (options.resumeFailure) Object.defineProperty(indexedDB, 'open', { value: () => { throw new Error('Database unavailable'); } });
  }, { profile, options });
  await page.goto(`${base}/popup.html`); await page.waitForFunction(() => document.getElementById('profile-summary').textContent !== 'Loading your details…');
  return page;
}

test("popup searches saved fields by aliases and values, and copies real clipboard text", async () => {
  const profile = { firstName: 'Fictional', lastName: 'Applicant', email: 'fictional@example.test', phoneCountryCode: '+44', phone: '7700 900000', linkedin: 'https://example.test/linkedin', custom: { 'Preferred editor': 'First line\nSecond line' } };
  const popup = await quickCopyPopup(profile);
  if (process.env.APPLYKIT_SCREENSHOTS) await popup.locator('body').screenshot({ path: path.join(process.env.APPLYKIT_SCREENSHOTS, 'popup.png'), animations: 'disabled' });
  await popup.locator('#saved-field-search').fill('email');
  assert.equal(await popup.locator('.copy-detail').count(), 1);
  await popup.getByRole('button', { name: 'Copy Email', exact: true }).click();
  await popup.waitForFunction(() => document.getElementById('copy-status').textContent === 'Copied Email');
  await popup.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  assert.equal(await popup.evaluate(() => navigator.clipboard.readText()), profile.email);
  await popup.locator('#saved-field-search').fill('given name');
  assert.equal(await popup.getByRole('button', { name: 'Copy First name', exact: true }).count(), 1);
  await popup.locator('#saved-field-search').fill('full name'); await popup.locator('#saved-field-search').press('Enter');
  await popup.waitForFunction(() => document.getElementById('copy-status').textContent === 'Copied Full name');
  assert.equal(await popup.evaluate(() => navigator.clipboard.readText()), 'Fictional Applicant');
  await popup.locator('#saved-field-search').fill('international'); await popup.getByRole('button', { name: 'Copy Phone with country code', exact: true }).click();
  await popup.waitForFunction(() => document.getElementById('copy-status').textContent === 'Copied Phone with country code');
  assert.equal(await popup.evaluate(() => navigator.clipboard.readText()), '+44 7700 900000');
  await popup.locator('#saved-field-search').fill('preferred editor'); await popup.locator('#saved-field-search').press('Enter');
  await popup.waitForFunction(() => document.getElementById('copy-status').textContent === 'Copied Preferred editor');
  assert.equal(await popup.evaluate(() => navigator.clipboard.readText()), profile.custom['Preferred editor']);
  await popup.locator('#saved-field-search').fill('https://example.test/linkedin'); assert.equal(await popup.locator('.copy-detail').count(), 1);
  await popup.locator('#saved-field-search').fill('nonesuch'); assert.equal(await popup.locator('#saved-field-empty').isVisible(), true);
  await popup.locator('#saved-field-search').press('Escape'); assert.equal(await popup.locator('#saved-field-search').inputValue(), '');
  await popup.close();
});

test("clipboard failure offers selected text and resume failure does not hide saved details", async () => {
  const popup = await quickCopyPopup({ email: 'fictional@example.test' }, { clipboardFailure: true, resumeFailure: true });
  await popup.getByRole('button', { name: 'Copy Email', exact: true }).click();
  assert.equal(await popup.locator('#manual-copy-value').inputValue(), 'fictional@example.test');
  assert.equal(await popup.locator('#manual-copy-value').isVisible(), true);
  assert.equal(await popup.locator('#manual-copy-value').evaluate(field => field.selectionEnd - field.selectionStart), 'fictional@example.test'.length);
  assert.equal(await popup.locator('#resume-summary').textContent(), 'Resume storage is unavailable'); await popup.close();
});

test("saved-detail copying stays available after page access fails", async () => {
  const popup = await quickCopyPopup({ email: 'fictional@example.test' });
  await popup.evaluate(() => {
    chrome.tabs = { query: async () => [{ id: 10 }] };
    chrome.scripting = { executeScript: async () => { throw new Error('Cannot access this page'); } };
  });
  await popup.locator('#fill-button').click();
  await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Autofill cannot read this page'));
  await popup.locator('#saved-field-search').fill('email');
  await popup.getByRole('button', { name: 'Copy Email', exact: true }).click();
  await popup.waitForFunction(() => document.getElementById('copy-status').textContent === 'Copied Email');
  await popup.close();
});
