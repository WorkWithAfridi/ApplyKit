const status = document.getElementById("status");
const button = document.getElementById("fill-button");
const preview = document.getElementById("match-preview");
let stage = "preview";
let targetTabId = null;
let savedProfile = {};
let savedResume = null;

async function initialize() {
  const [{ profile = {} }, resume] = await Promise.all([chrome.storage.local.get("profile"), ApplyKitStorage.getResume()]);
  savedProfile = profile; savedResume = resume;
  const count = ApplyKitSchema.fields.filter(field => typeof profile[field.key] === "string" && profile[field.key].trim()).length + Object.keys(profile.custom || {}).length;
  document.getElementById("profile-name").textContent = profile.preferredName || profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Your application profile";
  document.getElementById("profile-summary").textContent = count ? `${count} saved detail${count === 1 ? "" : "s"} · ready when you are` : "Add a few details to get started";
  document.getElementById("resume-summary").textContent = resume ? resume.name : "No resume PDF saved yet";
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
      if (!result.matches.length) { reset(); status.textContent = "No matching empty fields found. Check your profile or complete this form manually."; return; }
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
    reset(); status.textContent = /page changed/.test(error.message) ? error.message : "Could not read this page. Open a regular website form and try again.";
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
