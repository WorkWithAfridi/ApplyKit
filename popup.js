const status = document.getElementById("status");

document.getElementById("options-button").addEventListener("click", () => chrome.runtime.openOptionsPage());

document.getElementById("fill-button").addEventListener("click", async () => {
  const button = document.getElementById("fill-button");
  button.disabled = true;
  status.textContent = "Looking for matching fields…";
  try {
    const profile = (await chrome.storage.local.get("profile")).profile || {};
    const savedResume = await ApplyKitStorage.getResume();
    const resume = savedResume ? { name: savedResume.name, base64: await fileToBase64(savedResume.file) } : null;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillMatchingFields,
      args: [profile, resume]
    });
    const count = result?.result?.filled || 0;
    const attached = result?.result?.attached || false;
    const summary = [count ? `Filled ${count} field${count === 1 ? "" : "s"}` : "No text fields matched", attached ? "attached saved resume" : resume ? "no matching resume upload field" : "no saved resume"];
    status.textContent = `${summary.join("; ")}. Review before submitting.`;
  } catch (error) {
    status.textContent = "Could not access this page. Try a regular website form.";
  } finally {
    button.disabled = false;
  }
});

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fillMatchingFields(profile, resume) {
  const aliases = {
    firstName: ["first name", "given name", "firstname", "fname"],
    lastName: ["last name", "family name", "surname", "lastname", "lname"],
    fullName: ["full name", "your name", "name"],
    email: ["email", "e-mail"],
    phoneCountryCode: ["phone country code", "phonecountrycode", "telcountrycode", "country calling code", "calling code", "dialing code", "dialling code", "country code"],
    phone: ["phone number", "telephone", "mobile number", "phone", "mobile", "cell"],
    location: ["location", "city", "address", "country", "where are you based"],
    linkedin: ["linkedin", "linkedin url", "linkedin profile"],
    portfolio: ["portfolio", "website", "personal site", "personal website"],
    github: ["github", "github url", "github profile"],
    resumeUrl: ["resume url", "cv url", "resume link", "cv link"]
  };
  const normalize = value => (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const fields = [...document.querySelectorAll("input, textarea, select")];
  const fieldClues = field => {
    const label = field.labels ? [...field.labels].map(item => item.innerText).join(" ") : "";
    const surrounding = field.closest("label")?.innerText || "";
    return normalize([field.name, field.id, field.autocomplete, field.placeholder, field.getAttribute("aria-label"), label, surrounding].join(" "));
  };
  const fieldKey = clues => Object.keys(aliases).find(profileKey => aliases[profileKey].some(alias => clues.includes(normalize(alias))));
  const separatePhoneCode = fields.some(field => fieldKey(fieldClues(field)) === "phoneCountryCode");
  let filled = 0;
  for (const field of fields) {
    if (field.disabled || field.readOnly || field.type === "hidden" || field.type === "password" || field.type === "file" || field.type === "submit" || field.type === "button" || field.type === "checkbox" || field.type === "radio") continue;
    if (field.value?.trim()) continue;
    const clues = fieldClues(field);
    const key = fieldKey(clues);
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
    if (key === "phone" && value && profile.phoneCountryCode) {
      const digits = profile.phoneCountryCode.replace(/\D/g, "");
      const currentDigits = String(value).replace(/\D/g, "");
      const internationalPrefix = /^\s*(?:\+|00)/.test(value);
      if (separatePhoneCode && digits && currentDigits.startsWith(digits) && internationalPrefix) {
        value = String(value).replace(new RegExp(`^\\s*(?:\\+|00)?${digits}[\\s().-]*`), "");
      } else if (!separatePhoneCode && digits && !/^\s*\+/.test(value) && !currentDigits.startsWith(`00${digits}`)) {
        value = `${profile.phoneCountryCode} ${value}`;
      }
    }
    if (!value) continue;
    const option = field.tagName === "SELECT" ? [...field.options].find(item => normalize(item.textContent) === normalize(value) || normalize(item.value) === normalize(value) || (key === "phoneCountryCode" && normalize(item.textContent).includes(normalize(value)))) : null;
    if (field.tagName === "SELECT" && !option) continue;
    const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(field, option ? option.value : value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    filled++;
  }

  let attached = false;
  if (resume?.base64) {
    const fileInputs = fields.filter(field => field instanceof HTMLInputElement && field.type === "file");
    for (const field of fileInputs) {
      const clues = fieldClues(field);
      const accepts = (field.accept || "").toLowerCase();
      const isResumeField = /\b(resume|cv|curriculum vitae)\b/.test(clues);
      const acceptsPdf = !accepts || accepts.includes("pdf") || accepts.includes("application/*") || accepts.includes("*/*");
      if (!isResumeField || !acceptsPdf || field.disabled || field.files.length) continue;
      const binary = atob(resume.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const file = new File([bytes], resume.name, { type: "application/pdf" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      try {
        field.files = transfer.files;
        if (field.files.length) {
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
          attached = true;
          break;
        }
      } catch {
        // Some application pages block programmatic file selection.
      }
    }
  }
  return { filled, attached };
}
