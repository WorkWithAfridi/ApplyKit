const status = document.getElementById("status");
const button = document.getElementById("fill-button");
const preview = document.getElementById("match-preview");
let stage = "preview";
let targetTabId = null;
let savedProfile = {};
let savedResume = null;
let quickDetails = [];

function searchText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildQuickDetails(profile) {
  const details = [];
  for (const section of ApplyKitSchema.sections) {
    for (const field of section.fields) {
      const value = profile[field.key];
      if (typeof value !== "string" || !value.trim()) continue;
      details.push({ label: field.label, value, search: searchText([section.title, field.label, ...field.aliases, value].join(" ")) });
    }
  }
  if (!profile.fullName && (profile.firstName || profile.lastName)) {
    const value = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    details.unshift({ label: "Full name", value, derived: true, search: searchText(`full name your name combined ${value}`) });
  }
  if (!profile.phoneInternational && profile.phone && profile.phoneCountryCode) {
    const value = /^\s*(?:\+|00)/.test(profile.phone) ? profile.phone : `${profile.phoneCountryCode} ${profile.phone}`;
    details.push({ label: "Phone with country code", value, derived: true, search: searchText(`international phone number mobile calling country code combined ${value}`) });
  }
  for (const [label, value] of Object.entries(profile.custom || {})) {
    if (typeof value === "string" && value.trim()) details.push({ label, value, search: searchText(`custom ${label} ${value}`) });
  }
  return details;
}

async function copyDetail(detail, element) {
  const feedback = document.getElementById("copy-status");
  const manual = document.getElementById("manual-copy-value");
  const action = element.querySelector(".copy-action");
  try {
    // Called directly from the click: writing needs no clipboard-read access.
    await navigator.clipboard.writeText(detail.value);
    manual.hidden = true;
    document.querySelectorAll(".copy-action").forEach(node => { node.textContent = "Copy"; });
    action.textContent = "Copied ✓";
    feedback.textContent = `Copied ${detail.label}`;
  } catch {
    manual.hidden = false; manual.value = detail.value;
    manual.focus(); manual.select();
    feedback.textContent = "Press Ctrl+C / ⌘C to copy the selected value.";
  }
}

function renderQuickDetails() {
  const query = searchText(document.getElementById("saved-field-search").value);
  const tokens = query.split(/\s+/).filter(Boolean);
  const results = quickDetails.filter(detail => tokens.every(token => detail.search.includes(token)));
  const list = document.getElementById("saved-field-list"); list.replaceChildren();
  document.getElementById("manual-copy-value").hidden = true;
  for (const [index, detail] of results.entries()) {
    const item = document.createElement("div"); item.setAttribute("role", "listitem");
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "copy-detail";
    copy.setAttribute("aria-label", `Copy ${detail.label}`);
    const content = document.createElement("span"); content.className = "copy-content";
    const label = document.createElement("strong"); label.className = "copy-label"; label.textContent = detail.label;
    if (detail.derived) { const badge = document.createElement("small"); badge.textContent = "Combined"; label.append(badge); }
    const value = document.createElement("span"); value.className = "copy-value"; value.textContent = detail.value;
    value.id = `saved-detail-${index}`; copy.setAttribute("aria-describedby", value.id);
    const action = document.createElement("span"); action.className = "copy-action"; action.textContent = "Copy";
    content.append(label, value); copy.append(content, action); item.append(copy); list.append(item);
    copy.addEventListener("click", () => copyDetail(detail, copy));
  }
  list.hidden = !results.length; list.scrollTop = 0;
  const empty = document.getElementById("saved-field-empty"); empty.hidden = results.length > 0;
  empty.textContent = quickDetails.length ? "No saved details match. Try another field name or choose Edit to add one." : "No saved details yet. Choose Edit to add them.";
  document.getElementById("copy-status").textContent = query ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Click a value to copy";
}

async function initialize() {
  const [profileResult, resumeResult] = await Promise.allSettled([chrome.storage.local.get("profile"), ApplyKitStorage.getResume()]);
  if (profileResult.status !== "fulfilled") throw new Error("Could not load saved details.");
  const profile = profileResult.value.profile || {};
  savedProfile = profile; savedResume = resumeResult.status === "fulfilled" ? resumeResult.value : null;
  quickDetails = buildQuickDetails(profile); renderQuickDetails();
  const count = ApplyKitSchema.fields.filter(field => typeof profile[field.key] === "string" && profile[field.key].trim()).length + Object.keys(profile.custom || {}).length;
  document.getElementById("profile-name").textContent = profile.preferredName || profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Your application profile";
  document.getElementById("profile-summary").textContent = count ? `${count} saved detail${count === 1 ? "" : "s"} · ready when you are` : "Add a few details to get started";
  document.getElementById("resume-summary").textContent = savedResume ? savedResume.name : resumeResult.status === "rejected" ? "Resume storage is unavailable" : "No resume PDF saved yet";
}

async function run(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || (targetTabId !== null && targetTabId !== tab.id)) throw new Error("The page changed. Reopen ApplyKit on the form you want to fill.");
  targetTabId = tab.id;
  if (action === "preview") await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["schema.js", "autofill.js"] });
  let resume = savedResume ? { name: savedResume.name } : null;
  if (action === "fill" && savedResume) {
    const bytes = new Uint8Array(await savedResume.file.arrayBuffer()); let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    resume.base64 = btoa(binary);
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (profile, resume, action) => applyKitFill(profile, resume, action),
    args: [savedProfile, resume, action]
  });
  return result.result;
}

function reset() {
  stage = "preview"; preview.hidden = true;
  button.textContent = "Review matching fields →";
}

document.getElementById("saved-field-search").addEventListener("input", renderQuickDetails);
document.getElementById("saved-field-search").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault(); document.querySelector(".copy-detail")?.click();
  } else if (event.key === "Escape" && event.currentTarget.value) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.value = ""; renderQuickDetails();
  }
});
document.getElementById("options-button").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("rescan-button").addEventListener("click", () => { reset(); button.click(); });
button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    await ready;
    if (stage === "preview") {
      status.textContent = "Looking for matching empty fields…";
      const result = await run("preview");
      const list = document.getElementById("match-list"); list.replaceChildren();
      result.matches.forEach(match => {
        const item = document.createElement("li"); item.textContent = match.label;
        const tag = document.createElement("span"); tag.textContent = match.kind === "file" ? "Attach PDF" : "Fill";
        item.append(tag); list.append(item);
      });
      document.getElementById("undo-button").hidden = !result.canUndo;
      if (!result.matches.length) {
        reset();
        status.textContent = result.inaccessibleFrames && !result.emptyFieldCount ? "An embedded form is inaccessible. Search your saved details above to copy and paste." : result.emptyFieldCount ? `Found ${result.emptyFieldCount} empty fields, but no confident matches. Search saved details above to copy and paste.` : "No matching empty fields found. Search saved details above to copy and paste.";
        return;
      }
      preview.hidden = false; stage = "fill";
      button.textContent = `Fill ${result.matches.length} matched field${result.matches.length === 1 ? "" : "s"} →`;
      status.textContent = "Review the matches below, then fill when you’re ready.";
    } else {
      const result = await run("fill"); reset();
      const parts = [`Filled ${result.filled} field${result.filled === 1 ? "" : "s"}`];
      if (result.attached) parts.push("attached your PDF");
      if (result.skipped) parts.push(`skipped ${result.skipped} changed or unsupported field${result.skipped === 1 ? "" : "s"}`);
      status.textContent = `${parts.join("; ")}. Review the page before submitting.`;
      document.getElementById("undo-button").hidden = !result.canUndo;
    }
  } catch (error) {
    reset(); status.textContent = /page changed/.test(error.message) ? error.message : "Autofill cannot read this page. You can still search and copy saved details above.";
  } finally { button.disabled = false; }
});
document.getElementById("undo-button").addEventListener("click", async event => {
  const undoButton = event.currentTarget;
  undoButton.disabled = true;
  try {
    const result = await run("undo"); reset(); undoButton.hidden = true;
    status.textContent = `Restored ${result.undone} field${result.undone === 1 ? "" : "s"}. Answers you edited afterward were kept.`;
  } catch { status.textContent = "Could not undo. The page may have changed or reloaded."; }
  finally { undoButton.disabled = false; }
});
const ready = initialize();
ready.catch(() => { status.textContent = "Could not load your profile. Try reopening ApplyKit."; });
