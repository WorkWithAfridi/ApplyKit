const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const path = require("node:path");
let browser;
before(async () => { browser = await chromium.launch({ channel: process.env.APPLYKIT_CHROME_CHANNEL || "chrome", headless: true }); });
after(async () => { await browser?.close(); });
async function fixture(html) {
  const page = await browser.newPage(); await page.setContent(html);
  for (const file of ["schema.js", "autofill.js"]) await page.addScriptTag({ path: path.join(__dirname, "..", file) });
  return page;
}
const run = (page, profile, action = "preview", resume = null) => page.evaluate(({ profile, action, resume }) => applyKitFill(profile, resume, action), { profile, action, resume });

test("preview distinguishes names, location, address, and salary without changing the form", async () => {
  const page = await fixture('<form><label>First name<input id="first"></label><label>Last name<input id="last"></label><label>Full name<input id="full"></label><label>City<input id="city"></label><label>Country<input id="country"></label><label>Street address<input id="street"></label><label>Location<input id="location"></label><label>Current salary<input id="current"></label><label>Expected salary<input id="expected"></label><label>Email<input value="kept@example.test"></label></form>');
  const profile = { firstName: "Example", lastName: "Applicant", fullName: "Example Applicant", city: "Example City", country: "Example Country", addressLine1: "Fictional street", location: "Remote", currentSalary: "50000", expectedSalary: "60000", email: "new@example.test" };
  const preview = await run(page, profile); assert.equal(preview.matches.length, 9);
  assert.equal(await page.locator('#first').inputValue(), "");
  const filled = await run(page, profile, "fill"); assert.equal(filled.filled, 9);
  for (const [id, expected] of Object.entries({ first: profile.firstName, last: profile.lastName, full: profile.fullName, city: profile.city, country: profile.country, street: profile.addressLine1, location: profile.location, current: profile.currentSalary, expected: profile.expectedSalary })) assert.equal(await page.locator(`#${id}`).inputValue(), expected);
  assert.equal(await page.locator('input').last().inputValue(), "kept@example.test"); await page.close();
});

test("phone fields support separate calling-code menus and combined international numbers", async () => {
  const page = await fixture('<form><label>Calling code<select id="code"><option value="">Choose a code</option><option value="GB">United Kingdom (+44)</option></select></label><label>Phone<input id="phone"></label></form><form><label>Phone<input id="combined"></label></form>');
  const profile = { phoneCountryCode: "+44", phone: "+44 7700 900000" };
  await run(page, profile); await run(page, profile, "fill");
  assert.equal(await page.locator('#code').inputValue(), "GB"); assert.equal(await page.locator('#phone').inputValue(), "7700 900000"); assert.equal(await page.locator('#combined').inputValue(), "+44 7700 900000");
  await page.close();
  const single = await fixture('<input aria-label="Phone number">');
  await run(single, { phoneCountryCode: "+44", phone: "7700 900000" }); await run(single, {}, "fill");
  assert.equal(await single.locator('input').inputValue(), "+44 7700 900000"); await single.close();
});

test("native menus and radio questions fill while consent and negative eligibility questions are skipped", async () => {
  const page = await fixture('<form><fieldset><legend>Are you legally authorized to work?</legend><label><input type="radio" name="workAuth" value="true">Yes</label><label><input type="radio" name="workAuth" value="false">No</label></fieldset><label>Employment type<select><option value="">Choose</option><option value="FT">Full time</option></select></label><label>Do you NOT require sponsorship?<input id="negative"></label><label><input id="consent" type="checkbox">I agree to terms</label></form>');
  const profile = { workAuthorization: "Yes", employmentType: "Full-time", sponsorship: "Yes" };
  const preview = await run(page, profile); assert.equal(preview.matches.length, 2);
  await run(page, profile, "fill"); assert.equal(await page.locator('input[value="true"]').isChecked(), true); assert.equal(await page.locator('select').inputValue(), "FT"); assert.equal(await page.locator('#negative').inputValue(), ""); assert.equal(await page.locator('#consent').isChecked(), false); await page.close();
});

test("self-identification is opt in and custom answers use the question label", async () => {
  const page = await fixture('<label>Gender<input id="gender"></label><label>Preferred editor<textarea></textarea></label>');
  const profile = { gender: "Prefer not to say", custom: { "Preferred editor": "A fictional editor" } };
  assert.equal((await run(page, profile)).matches.length, 1);
  assert.equal((await run(page, { ...profile, fillSensitive: true })).matches.length, 2);
  await run(page, profile, "fill"); assert.equal(await page.locator('textarea').inputValue(), "A fictional editor"); await page.close();
});

test("stored PDF attaches to a recognized resume field and undo restores it", async () => {
  const page = await fixture('<label>Cover letter<input id="cover" type="file" accept=".pdf"></label><label>Resume / CV<input id="cv" type="file" accept=".pdf"></label>');
  const resume = { name: "fictional-resume.pdf", base64: Buffer.from("%PDF-1.7\nFictional fixture").toString("base64") };
  const preview = await run(page, {}, "preview", resume); assert.deepEqual(preview.matches, [{ label: "Resume PDF", kind: "file" }]);
  assert.equal((await run(page, {}, "fill", resume)).attached, 1);
  assert.equal(await page.locator('#cv').evaluate(field => field.files[0].name), resume.name); assert.equal(await page.locator('#cover').evaluate(field => field.files.length), 0);
  assert.equal((await run(page, {}, "undo")).undone, 1); assert.equal(await page.locator('#cv').evaluate(field => field.files.length), 0); await page.close();
});

test("a preview freezes targets and respects answers edited before fill or undo", async () => {
  const page = await fixture('<label>Email<input id="email"></label><label>City<input id="city"></label>');
  const profile = { email: "fictional@example.test", city: "Example City", country: "Example Country" };
  await run(page, profile);
  await page.locator('#city').fill("User answer");
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<label>Country<input id="new"></label>'));
  const result = await run(page, profile, "fill"); assert.equal(result.filled, 1); assert.equal(result.skipped, 1); assert.equal(await page.locator('#new').inputValue(), "");
  await page.locator('#email').fill("edited@example.test"); assert.equal((await run(page, {}, "undo")).undone, 0); assert.equal(await page.locator('#email').inputValue(), "edited@example.test"); await page.close();
});

test("same-origin frames and open shadow roots can receive native field values", async () => {
  const page = await fixture('<div id="host"></div><iframe srcdoc="<input aria-label=City>"></iframe>');
  await page.evaluate(() => document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Email">');
  await run(page, { email: "fictional@example.test", city: "Example City" });
  assert.equal((await run(page, {}, "fill")).filled, 2);
  assert.equal(await page.locator('#host input').inputValue(), "fictional@example.test"); assert.equal(await page.frameLocator('iframe').locator('input').inputValue(), "Example City"); await page.close();
});

test("phone formatting respects national fields, explicit international numbers, and existing codes", async () => {
  const page = await fixture('<form><label>Calling code<select id="code"><option selected value="US">United States (+1)</option></select></label><label>Phone<input id="conflict"></label></form><form><input id="national" autocomplete="tel-national"></form><form><label>Phone<input id="international"></label></form>');
  const profile = { phoneCountryCode: "+44", phone: "7700 900000", phoneInternational: "+44-7700-900000" };
  const result = await run(page, profile); assert.equal(result.matches.length, 2);
  await run(page, profile, "fill"); assert.equal(await page.locator('#conflict').inputValue(), ""); assert.equal(await page.locator('#national').inputValue(), "7700 900000"); assert.equal(await page.locator('#international').inputValue(), profile.phoneInternational); await page.close();
});

test("radio groups with the same name in separate forms remain independent", async () => {
  const page = await fixture('<form><fieldset><legend>Require visa sponsorship</legend><label><input type="radio" name="sponsorship" value="Yes">Yes</label><label><input type="radio" name="sponsorship" value="No">No</label></fieldset></form><form><fieldset><legend>Require visa sponsorship</legend><label><input type="radio" name="sponsorship" value="Yes">Yes</label><label><input type="radio" name="sponsorship" value="No">No</label></fieldset></form>');
  assert.equal((await run(page, { sponsorship: "No" })).matches.length, 2);
  assert.equal((await run(page, {}, "fill")).filled, 2); assert.equal(await page.locator('input:checked').count(), 2); await page.close();
});

test("unlinked visual labels identify a typical application form with opaque field names", async () => {
  const page = await fixture('<form><div class="form-group"><label>Full Name: *</label><input name="field_101"></div><div class="form-group"><label>Email: *</label><input name="field_102" type="text"></div><div class="form-group"><label>Phone:</label><div class="input-group"><input name="field_103"></div></div><div class="form-group"><label>Linkedin Link: *</label><input name="field_104"></div><div class="form-group"><label>Resume:</label><div class="custom-file"><input name="field_105" type="file" multiple><label>Choose file</label></div></div><label><input type="checkbox">I agree to the terms</label></form>');
  const profile = { fullName: "Fictional Applicant", email: "fictional@example.test", phone: "7700 900000", linkedin: "https://example.test/profile" };
  const resume = { name: "fictional.pdf", base64: Buffer.from("%PDF-1.7\nFixture").toString("base64") };
  const preview = await run(page, profile, "preview", resume);
  assert.deepEqual(preview.matches.map(match => match.label), ["Full name", "Email", "Phone number", "LinkedIn URL", "Resume PDF"]);
  const result = await run(page, profile, "fill", resume); assert.equal(result.filled, 4); assert.equal(result.attached, 1);
  assert.equal(await page.locator('input[name=field_101]').inputValue(), profile.fullName); assert.equal(await page.locator('input[name=field_104]').inputValue(), profile.linkedin); assert.equal(await page.locator('input[type=checkbox]').isChecked(), false); await page.close();
});

test("nearby labels stay local and do not borrow the next field or a different linked label", async () => {
  const page = await fixture('<form><label>City:</label><input id="field_a"><label>Country:</label><input id="field_b"><div><label for="elsewhere">Email</label><input id="opaque"></div><div><label>First name</label><input id="name"></div><div><label>Street address</label><input id="explicit" aria-label="City"></div><input id="elsewhere" type="hidden"></form>');
  const profile = { city: "Example City", country: "Example Country", email: "fictional@example.test", fullName: "Fictional Applicant", firstName: "Fictional", addressLine1: "Fictional Street" };
  await run(page, profile); await run(page, profile, "fill");
  assert.equal(await page.locator('#field_a').inputValue(), profile.city); assert.equal(await page.locator('#field_b').inputValue(), profile.country); assert.equal(await page.locator('#opaque').inputValue(), ""); assert.equal(await page.locator('#name').inputValue(), profile.firstName); assert.equal(await page.locator('#explicit').inputValue(), profile.city); await page.close();
});

test("unmatched forms report what was inspected without exposing field values", async () => {
  const page = await fixture('<form><label>Mystery question<input name="opaque"></label><label>Other question<input value="Existing answer"></label></form>');
  const result = await run(page, { email: "fictional@example.test" });
  assert.equal(result.matches.length, 0); assert.equal(result.fieldCount, 2); assert.equal(result.emptyFieldCount, 1); assert.equal(JSON.stringify(result).includes('Existing answer'), false); await page.close();
});
