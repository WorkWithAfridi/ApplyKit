const form = document.getElementById("profile-form");
const customFields = document.getElementById("custom-fields");
const status = document.getElementById("save-status");
const standardKeys = ["firstName", "lastName", "fullName", "email", "phone", "location", "linkedin", "portfolio", "github", "resumeUrl"];

function addCustomRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "custom-row";
  const name = document.createElement("input");
  name.placeholder = "Field name (e.g. Work authorization)";
  name.setAttribute("aria-label", "Custom field name");
  name.value = key;
  const content = document.createElement("input");
  content.placeholder = "Your answer";
  content.setAttribute("aria-label", "Custom field value");
  content.value = value;
  const remove = document.createElement("button");
  remove.className = "remove-button";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());
  row.append(name, content, remove);
  customFields.append(row);
}

document.getElementById("add-custom").addEventListener("click", () => addCustomRow());

async function loadProfile() {
  const { profile = {} } = await chrome.storage.local.get("profile");
  for (const key of standardKeys) form.elements[key].value = profile[key] || "";
  for (const [key, value] of Object.entries(profile.custom || {})) addCustomRow(key, value);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const profile = {};
  for (const key of standardKeys) profile[key] = form.elements[key].value.trim();
  profile.custom = {};
  for (const row of customFields.querySelectorAll(".custom-row")) {
    const [keyInput, valueInput] = row.querySelectorAll("input");
    if (keyInput.value.trim() && valueInput.value.trim()) profile.custom[keyInput.value.trim()] = valueInput.value.trim();
  }
  await chrome.storage.local.set({ profile });
  status.textContent = "Profile saved on this device.";
});

document.getElementById("export-button").addEventListener("click", async () => {
  const { profile = {} } = await chrome.storage.local.get("profile");
  const blob = new Blob([JSON.stringify({ version: 1, profile }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "applykit-profile-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("import-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const profile = parsed.profile || parsed;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("Invalid profile");
    await chrome.storage.local.set({ profile });
    customFields.replaceChildren();
    await loadProfile();
    status.textContent = "Profile imported and saved on this device.";
  } catch {
    status.textContent = "Could not import that file. Choose an ApplyKit JSON backup.";
  } finally {
    event.target.value = "";
  }
});

loadProfile();
