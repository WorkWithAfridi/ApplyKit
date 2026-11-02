const form = document.getElementById("profile-form");
const customFields = document.getElementById("custom-fields");
const status = document.getElementById("save-status");
let dirty = false;
const fieldDefinitions = ApplyKitSchema.fields;

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function markDirty() { dirty = true; status.textContent = "You have unsaved changes."; }

function createField(definition) {
  const label = make("label", `field-label${definition.wide ? " wide" : ""}`);
  label.dataset.search = [definition.label, ...definition.aliases].join(" ").toLowerCase();
  label.append(make("span", "", definition.label));
  const control = make(definition.multiline ? "textarea" : definition.options ? "select" : "input");
  control.name = definition.key;
  if (definition.options) {
    control.append(new Option("Not set", ""));
    definition.options.forEach(value => control.append(new Option(value, value)));
  } else if (!definition.multiline) control.type = definition.type || "text";
  if (definition.autocomplete) control.autocomplete = definition.autocomplete;
  if (definition.placeholder) control.placeholder = definition.placeholder;
  if (definition.type === "url") control.placeholder = "https://…";
  if (definition.min !== undefined) control.min = definition.min;
  if (definition.step) control.step = definition.step;
  if (definition.multiline) control.rows = definition.wide ? 4 : 3;
  control.maxLength = 20000;
  label.append(control);
  if (definition.hint) label.append(make("small", "field-hint", definition.hint));
  return label;
}

function buildSections() {
  const container = document.getElementById("profile-sections");
  const nav = document.getElementById("section-nav");
  ApplyKitSchema.sections.forEach((section, index) => {
    const number = String(index + 1).padStart(2, "0");
    const link = make("a", "nav-link"); link.href = `#${section.id}`;
    link.append(make("span", "nav-number", number), document.createTextNode(section.title));
    link.addEventListener("click", () => { document.getElementById(section.id).open = true; });
    nav.append(link);
    const detail = make("details", "form-section"); detail.id = section.id;
    detail.open = index === 0 || section.id === "links";
    const summary = make("summary"); const title = make("span", "section-title");
    title.append(make("strong", "", section.title), make("small", "", section.description));
    summary.append(make("span", "section-index", number), title, make("span", "chevron", "⌄"));
    const content = make("div", "section-content");
    if (section.sensitive) {
      const toggle = make("label", "sensitive-toggle"); const input = make("input");
      input.type = "checkbox"; input.name = "fillSensitive";
      toggle.append(input, document.createTextNode("Include these saved answers when filling forms. These fields are skipped unless you turn this on."));
      content.append(toggle);
    }
    const grid = make("div", "field-grid");
    section.fields.forEach(definition => grid.append(createField(definition)));
    content.append(grid);
    if (section.id === "links") {
      const resume = make("div", "resume-store");
      resume.innerHTML = '<div class="resume-top"><div class="document-mark" aria-hidden="true">PDF</div><div class="resume-copy"><strong>Your current resume</strong><small>PDF · up to 10 MB · saved in this browser</small></div><div class="resume-controls"><label class="button secondary compact file-button">↑ Choose PDF<input id="resume-file" class="visually-hidden" type="file" accept="application/pdf,.pdf"></label><button id="download-resume" class="button secondary compact" type="button" hidden>↓</button><button id="remove-resume" class="remove-button" type="button" hidden>Remove</button></div></div><p id="resume-status" class="resume-status" role="status" aria-live="polite">No PDF stored. You can also use the resume URL above.</p>';
      resume.querySelector("#download-resume").setAttribute("aria-label", "Download stored resume");
      content.append(resume);
    }
    detail.append(summary, content); container.append(detail);
  });
  const customLink = make("a", "nav-link"); customLink.href = "#custom";
  customLink.append(make("span", "nav-number", "10"), document.createTextNode("Custom answers"));
  customLink.addEventListener("click", () => { document.getElementById("custom").open = true; });
  nav.append(customLink);
}

function addCustomRow(key = "", value = "") {
  const row = make("div", "custom-row");
  const header = make("div", "custom-row-header");
  const remove = make("button", "remove-button", "Remove"); remove.type = "button";
  remove.addEventListener("click", () => { row.remove(); markDirty(); });
  header.append(make("strong", "", "REUSABLE ANSWER"), remove);
  const question = make("label", "field-label", "Question or field label");
  const name = make("input"); name.value = key; name.placeholder = "e.g. What is your preferred tech stack?"; name.maxLength = 300;
  const answer = make("label", "field-label", "Your answer");
  const content = make("textarea"); content.value = value; content.placeholder = "Keep a reusable answer here…"; content.maxLength = 20000;
  question.append(name); answer.append(content); row.append(header, question, answer); customFields.append(row);
}

function cleanProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Choose an ApplyKit profile JSON file.");
  const profile = {};
  for (const definition of fieldDefinitions) {
    if (raw[definition.key] !== undefined && typeof raw[definition.key] !== "string") throw new Error(`Invalid value for ${definition.label}.`);
    const value = (raw[definition.key] || "").trim();
    if (value.length > 20000) throw new Error(`${definition.label} is too long.`);
    profile[definition.key] = value;
  }
  profile.fillSensitive = raw.fillSensitive === true;
  profile.custom = {};
  if (raw.custom !== undefined && (!raw.custom || typeof raw.custom !== "object" || Array.isArray(raw.custom))) throw new Error("Custom answers must be a list of question and answer pairs.");
  if (Object.keys(raw.custom || {}).length > 100) throw new Error("A profile can contain up to 100 custom answers.");
  for (const [key, value] of Object.entries(raw.custom || {})) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (typeof value !== "string" || key.length > 300 || value.length > 20000) throw new Error("A custom answer is invalid or too long.");
    if (key.trim() && value.trim()) profile.custom[key.trim()] = value.trim();
  }
  return profile;
}

async function loadProfile() {
  const { profile: raw = {} } = await chrome.storage.local.get("profile");
  const profile = cleanProfile(raw);
  for (const definition of fieldDefinitions) {
    const control = form.elements.namedItem(definition.key);
    // Preserve previously imported text even if it is not in a new predefined menu.
    if (control.tagName === "SELECT" && profile[definition.key] && ![...control.options].some(option => option.value === profile[definition.key])) control.append(new Option(profile[definition.key], profile[definition.key]));
    control.value = profile[definition.key];
  }
  form.elements.fillSensitive.checked = profile.fillSensitive;
  customFields.replaceChildren();
  Object.entries(profile.custom).forEach(([key, value]) => addCustomRow(key, value));
  updateCount(profile);
  dirty = false;
}

function updateCount(profile) {
  document.getElementById("saved-count").textContent = fieldDefinitions.filter(field => profile[field.key]).length + Object.keys(profile.custom || {}).length;
}

async function updateResumeStatus() {
  const resume = await ApplyKitStorage.getResume();
  document.getElementById("resume-status").textContent = resume ? `${resume.name} · ${(resume.file.size / 1048576).toFixed(2)} MB · saved on this device` : "No PDF stored. You can also use the resume URL above.";
  document.getElementById("remove-resume").hidden = !resume;
  document.getElementById("download-resume").hidden = !resume;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob); const link = make("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

buildSections();
document.getElementById("add-custom").addEventListener("click", () => { addCustomRow(); markDirty(); customFields.lastElementChild.querySelector("input").focus(); });
form.addEventListener("input", event => { if (event.target.id !== "resume-file") markDirty(); });
form.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const raw = Object.fromEntries(fieldDefinitions.map(definition => [definition.key, form.elements.namedItem(definition.key).value]));
    raw.fillSensitive = form.elements.fillSensitive.checked; raw.custom = {};
    for (const row of customFields.querySelectorAll(".custom-row")) {
      const key = row.querySelector("input").value.trim(); const value = row.querySelector("textarea").value.trim();
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Choose a different custom field label.");
      if (key && value) {
        if (Object.hasOwn(raw.custom, key)) throw new Error(`Duplicate custom label: ${key}`);
        raw.custom[key] = value;
      }
    }
    const profile = cleanProfile(raw);
    if (profile.phoneCountryCode) {
      if (!/^\+?\d{1,4}$/.test(profile.phoneCountryCode)) throw new Error("Use a calling code such as +44, with no spaces.");
      profile.phoneCountryCode = `+${profile.phoneCountryCode.replace(/^\+/, "")}`;
      form.elements.phoneCountryCode.value = profile.phoneCountryCode;
    }
    await chrome.storage.local.set({ profile }); dirty = false; updateCount(profile);
    status.textContent = "All changes saved on this device.";
  } catch (error) { status.textContent = error.message; }
});
document.getElementById("resume-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try { await ApplyKitStorage.saveResume(file); await updateResumeStatus(); }
  catch (error) { document.getElementById("resume-status").textContent = error.message; }
  finally { event.target.value = ""; }
});
document.getElementById("remove-resume").addEventListener("click", async () => {
  try { await ApplyKitStorage.removeResume(); await updateResumeStatus(); }
  catch { document.getElementById("resume-status").textContent = "Could not remove the PDF. Try again."; }
});
document.getElementById("download-resume").addEventListener("click", async () => {
  try { const resume = await ApplyKitStorage.getResume(); if (resume) download(resume.file, resume.name); }
  catch { document.getElementById("resume-status").textContent = "Could not read the stored PDF."; }
});
document.getElementById("export-button").addEventListener("click", async () => {
  try {
    const { profile = {} } = await chrome.storage.local.get("profile");
    download(new Blob([JSON.stringify({ version: 2, profile: cleanProfile(profile) }, null, 2)], { type: "application/json" }), "applykit-profile-backup.json");
    status.textContent = dirty ? "Exported the last saved profile. You still have unsaved changes." : "Profile backup downloaded. Keep your original PDF separately.";
  } catch { status.textContent = "Could not export your profile."; }
});
document.getElementById("import-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5 * 1048576) throw new Error("Profile JSON must be smaller than 5 MB.");
    const parsed = JSON.parse(await file.text());
    if (parsed.version !== undefined && ![1, 2].includes(parsed.version)) throw new Error("This backup version is not supported.");
    const raw = parsed.profile || parsed;
    if (!Object.keys(raw).some(key => fieldDefinitions.some(field => field.key === key) || key === "custom")) throw new Error("That file does not contain an ApplyKit profile.");
    const profile = cleanProfile(raw);
    if (!window.confirm("Replace your current profile fields with this backup? Your saved PDF will stay as it is.")) return;
    await chrome.storage.local.set({ profile }); await loadProfile();
    status.textContent = "Backup restored. Your details are saved on this device.";
  } catch (error) { status.textContent = error instanceof SyntaxError ? "That file is not valid JSON." : error.message; }
  finally { event.target.value = ""; }
});
const previousOpen = new Map();
document.getElementById("field-search").addEventListener("input", event => {
  const query = event.target.value.trim().toLowerCase();
  let visible = 0;
  for (const section of document.querySelectorAll("#profile-sections > details")) {
    if (query && !previousOpen.has(section.id)) previousOpen.set(section.id, section.open);
    let sectionMatches = 0;
    const titleMatches = section.querySelector("strong").textContent.toLowerCase().includes(query);
    for (const label of section.querySelectorAll(".field-label")) {
      label.hidden = !!query && !titleMatches && !label.dataset.search.includes(query);
      if (!label.hidden) sectionMatches++;
    }
    section.hidden = !!query && !sectionMatches;
    if (!section.hidden) visible++;
    if (query && sectionMatches) section.open = true;
    if (!query && previousOpen.has(section.id)) { section.open = previousOpen.get(section.id); previousOpen.delete(section.id); }
  }
  document.getElementById("custom").hidden = !!query && !"custom answers".includes(query);
  document.getElementById("no-results").hidden = visible > 0 || !document.getElementById("custom").hidden;
});
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
document.addEventListener("keydown", event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); form.requestSubmit(); } });
loadProfile().catch(() => { status.textContent = "Could not load your profile. Try reopening settings."; });
updateResumeStatus().catch(() => { document.getElementById("resume-status").textContent = "Could not access resume storage."; });
