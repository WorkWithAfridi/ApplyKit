const status = document.getElementById("status");

document.getElementById("options-button").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.getElementById("fill-button").addEventListener("click", async () => {
  const button = document.getElementById("fill-button");
  button.disabled = true;
  status.textContent = "Looking for matching fields…";
  try {
    const profile = (await chrome.storage.local.get("profile")).profile || {};
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillMatchingFields,
      args: [profile]
    });
    const count = result?.result?.filled || 0;
    status.textContent = count ? `Filled ${count} field${count === 1 ? "" : "s"}. Review before submitting.` : "No matching empty fields found.";
  } catch (error) {
    status.textContent = "Could not access this page. Try a regular website form.";
  } finally {
    button.disabled = false;
  }
});

function fillMatchingFields(profile) {
  const aliases = {
    firstName: ["first name", "given name", "firstname", "fname"],
    lastName: ["last name", "family name", "surname", "lastname", "lname"],
    fullName: ["full name", "your name", "name"],
    email: ["email", "e-mail"],
    phone: ["phone", "telephone", "mobile", "cell"],
    location: ["location", "city", "address", "country", "where are you based"],
    linkedin: ["linkedin", "linkedin url", "linkedin profile"],
    portfolio: ["portfolio", "website", "personal site", "personal website"],
    github: ["github", "github url", "github profile"],
    resumeUrl: ["resume url", "cv url", "resume link", "cv link"]
  };
  const normalize = value => (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const fields = [...document.querySelectorAll("input, textarea, select")];
  let filled = 0;
  for (const field of fields) {
    if (field.disabled || field.readOnly || field.type === "hidden" || field.type === "password" || field.type === "file" || field.type === "submit" || field.type === "button" || field.type === "checkbox" || field.type === "radio") continue;
    if (field.value?.trim()) continue;
    const label = field.labels ? [...field.labels].map(item => item.innerText).join(" ") : "";
    const surrounding = field.closest("label")?.innerText || "";
    const clues = normalize([field.name, field.id, field.autocomplete, field.placeholder, field.getAttribute("aria-label"), label, surrounding].join(" "));
    const key = Object.keys(aliases).find(profileKey => aliases[profileKey].some(alias => clues.includes(normalize(alias))));
    let value = key ? profile[key] : "";
    if (!value) {
      const customMatch = Object.entries(profile.custom || {}).find(([name]) => {
        const normalizedName = normalize(name);
        return normalizedName.length > 1 && clues.includes(normalizedName);
      });
      value = customMatch?.[1] || "";
    }
    if (!value && key === "firstName") value = profile.fullName?.trim().split(/\s+/)[0];
    if (!value && key === "lastName") value = profile.fullName?.trim().split(/\s+/).slice(1).join(" ");
    if (!value) continue;
    const option = field.tagName === "SELECT" ? [...field.options].find(item => normalize(item.textContent) === normalize(value) || normalize(item.value) === normalize(value)) : null;
    if (field.tagName === "SELECT" && !option) continue;
    const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(field, option ? option.value : value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    filled++;
  }
  return { filled };
}
