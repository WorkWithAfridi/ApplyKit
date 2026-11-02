// Runs in Chrome's isolated extension world. No form values are sent to a server.
var ApplyKitFillHistory = typeof ApplyKitFillHistory === "undefined" ? [] : ApplyKitFillHistory;
var ApplyKitPreviewPlan = typeof ApplyKitPreviewPlan === "undefined" ? [] : ApplyKitPreviewPlan;

function applyKitFill(profile = {}, resume = null, action = "preview") {
  const normalize = value => String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const dispatch = field => {
    const view = field.ownerDocument.defaultView;
    field.dispatchEvent(new view.Event("input", { bubbles: true, composed: true }));
    field.dispatchEvent(new view.Event("change", { bubbles: true, composed: true }));
  };
  const setValue = (field, value) => {
    const view = field.ownerDocument.defaultView;
    const prototype = field.tagName === "TEXTAREA" ? view.HTMLTextAreaElement.prototype : field.tagName === "SELECT" ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value);
  };
  const isEmpty = field => {
    if (field.type === "file") return !field.files?.length;
    if (field.type === "radio") return ![...field.getRootNode().querySelectorAll('input[type="radio"]')].some(other => other.form === field.form && other.name === field.name && (field.name || other === field) && other.checked);
    if (field.tagName === "SELECT") {
      const selected = field.selectedOptions[0];
      return !field.value || !!selected?.disabled || /^(please )?(select|choose)( |$)/.test(normalize(selected?.textContent));
    }
    return !field.value?.trim();
  };
  if (action === "undo") {
    let undone = 0;
    for (const item of ApplyKitFillHistory) {
      const field = item.field;
      if (!field.isConnected || field.disabled || field.readOnly) continue;
      try {
        if (item.kind === "file") {
          const file = field.files?.[0];
          if (!file || file.name !== item.name || file.size !== item.size || file.lastModified !== item.lastModified) continue;
          field.files = item.previous;
        } else if (item.kind === "radio") {
          if (!field.checked) continue;
          field.checked = false;
        } else {
          if (field.value !== item.filledValue) continue;
          setValue(field, item.previous);
        }
        dispatch(field); undone++;
      } catch { /* A page may have replaced the control since filling. */ }
    }
    ApplyKitFillHistory = []; ApplyKitPreviewPlan = [];
    return { undone };
  }
  if (action === "fill") {
    let filled = 0; let attached = 0; let skipped = 0;
    const history = [];
    for (const item of ApplyKitPreviewPlan) {
      const field = item.field;
      if (!field.isConnected || field.disabled || field.readOnly || !isEmpty(field)) { skipped++; continue; }
      try {
        if (item.kind === "file") {
          if (!resume?.base64 || resume.name !== item.value) { skipped++; continue; }
          const binary = atob(resume.base64); const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
          const view = field.ownerDocument.defaultView;
          const file = new view.File([bytes], resume.name, { type: "application/pdf" });
          const transfer = new view.DataTransfer(); transfer.items.add(file);
          const previous = field.files; field.files = transfer.files;
          if (!field.files.length) { skipped++; continue; }
          history.push({ field, kind: "file", previous, name: file.name, size: file.size, lastModified: file.lastModified });
          dispatch(field); attached++;
        } else if (item.kind === "radio") {
          field.checked = true; dispatch(field);
          if (field.checked) { history.push({ field, kind: "radio" }); filled++; }
          else skipped++;
        } else {
          const previous = field.value;
          setValue(field, item.value); dispatch(field);
          if (field.value === item.value) { history.push({ field, kind: "value", previous, filledValue: item.value }); filled++; }
          else skipped++;
        }
      } catch { skipped++; }
    }
    if (history.length) ApplyKitFillHistory = history;
    ApplyKitPreviewPlan = [];
    return { filled, attached, skipped, canUndo: ApplyKitFillHistory.length > 0 };
  }

  const fields = []; const seen = new Set();
  let inaccessibleFrames = 0;
  function collect(root) {
    if (!root || seen.has(root)) return;
    seen.add(root);
    fields.push(...root.querySelectorAll("input, textarea, select"));
    for (const element of root.querySelectorAll("*")) if (element.shadowRoot) collect(element.shadowRoot);
    for (const frame of root.querySelectorAll("iframe")) {
      try { if (frame.contentDocument) collect(frame.contentDocument); else inaccessibleFrames++; } catch { inaccessibleFrames++; }
    }
  }
  collect(document);
  const referencedText = field => (field.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => field.getRootNode().getElementById?.(id)?.textContent || "").join(" ");
  const labelText = element => {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll("input,select,textarea,button,script,style").forEach(node => node.remove());
    return clone.textContent.trim();
  };
  // Many form builders render a visual label without a matching `for` attribute.
  // Use local structure, never the entire form's text, to associate those labels.
  const nearbyLabels = field => {
    const labels = new Set();
    const controls = 'input:not([type="hidden"]),textarea,select';
    const add = element => {
      if (!element || element.matches('input,select,textarea,button,a,script,style') || element.querySelector(controls)) return;
      if (element.tagName === "LABEL" && ((element.htmlFor && element.htmlFor !== field.id) || (element.control && element.control !== field))) return;
      const text = labelText(element);
      if (text && text.length <= 180) labels.add(text);
    };
    let current = field;
    for (let level = 0; level < 3 && current.parentElement; level++, current = current.parentElement) {
      const parent = current.parentElement;
      const group = [...parent.querySelectorAll(controls)];
      // Do not take a neighboring field's label when several controls share a row.
      const previous = current.previousElementSibling;
      if (previous && (!previous.matches("label") || !previous.control || previous.control === field)) add(previous);
      if (group.length === 1 && group[0] === field && current.nextElementSibling?.matches('label,[class~="field-label"],[class~="control-label"]')) add(current.nextElementSibling);
      if (group.length !== 1 || group[0] !== field) break;
      parent.querySelectorAll('label,[class~="field-label"],[class~="control-label"],[data-label]').forEach(add);
      if (parent.matches("form,fieldset,body,html")) break;
    }
    return [...labels];
  };
  const evidenceFor = field => [
    ...[field.name, field.id].map(value => ({ value, weight: 0 })),
    { value: field.placeholder, weight: -5 },
    ...[field.getAttribute("aria-label"), referencedText(field), ...[...(field.labels || [])].map(labelText)].map(value => ({ value, weight: 12 })),
    { value: field.type === "radio" ? field.closest("fieldset")?.querySelector("legend")?.textContent : "", weight: 8 },
    ...nearbyLabels(field).map(value => ({ value, weight: 6 }))
  ].map(item => ({ text: normalize(item.value), weight: item.weight })).filter(item => item.text);
  const evidenceCache = new Map();
  const evidenceForCached = field => {
    if (!evidenceCache.has(field)) evidenceCache.set(field, evidenceFor(field));
    return evidenceCache.get(field);
  };
  const hints = field => evidenceForCached(field).map(item => item.text);
  const definitions = [...ApplyKitSchema.fields.filter(definition => !definition.sensitive || profile.fillSensitive === true), ...ApplyKitSchema.socialFields(profile)];
  const matchDefinition = field => {
    const autocomplete = field.autocomplete?.split(/\s+/).pop();
    const direct = autocomplete ? definitions.find(definition => definition.autocomplete && definition.autocomplete === autocomplete) : null;
    if (direct) return direct;
    if (autocomplete === "tel") return definitions.find(definition => definition.key === "phone");
    if (autocomplete === "country") return definitions.find(definition => definition.key === "country");
    if (field.type === "email") return definitions.find(definition => definition.key === "email");
    const evidence = evidenceForCached(field);
    const custom = Object.entries(profile.custom || {}).filter(([key, value]) => key.trim().length > 1 && typeof value === "string" && value.trim()).map(([key]) => ({ key: `custom:${key}`, label: key, aliases: [key] }));
    let best = null; let bestScore = 0; let tied = false;
    for (const definition of [...definitions, ...custom]) {
      let score = 0;
      for (const alias of definition.aliases) {
        const text = normalize(alias); if (!text) continue;
        for (const { text: hint, weight } of evidence) {
          if (hint === text) score = Math.max(score, 100 + weight + text.length / 1000);
          else if ((text.includes(" ") || !["x", "name", "country", "state", "region", "source", "address", "notice", "summary", "degree", "school", "major", "unit", "skills", "languages", "currency"].includes(text)) && (` ${hint} `).includes(` ${text} `)) score = Math.max(score, 60 + weight + Math.min(text.length, 35));
        }
      }
      if (score > bestScore) { best = definition; bestScore = score; tied = false; }
      else if (score && score === bestScore && best?.key !== definition.key) tied = true;
    }
    if (best?.options?.join() === "Yes,No" && evidence.some(({ text }) => /\b(not|without)\b/.test(text))) return null;
    return tied ? null : best;
  };
  const candidates = fields.filter(field => !field.disabled && !field.readOnly && !["hidden", "password", "submit", "button", "reset", "checkbox", "search", "range", "color", "image"].includes(field.type) && (!field.multiple || field.type === "file"));
  const definitionsByField = new Map(candidates.map(field => [field, field.type === "file" ? null : matchDefinition(field)]));
  const plan = []; const plannedRadios = new Set();
  const optionMatches = (option, value, key) => {
    const expected = normalize(value); const text = normalize(option.textContent); const actual = normalize(option.value);
    if (text === expected || actual === expected) return true;
    const synonyms = { yes: ["yes", "true", "1"], no: ["no", "false", "0"], yearly: ["annually", "annual", "per year", "year"], monthly: ["per month", "month"], hourly: ["per hour", "hour"] };
    if ((synonyms[expected] || []).includes(text) || (synonyms[expected] || []).includes(actual)) return true;
    return key === "phoneCountryCode" && !!expected && (` ${text} `).includes(` ${expected} `);
  };
  for (const field of candidates) {
    if (!isEmpty(field)) continue;
    if (field.type === "file") {
      const accept = field.accept.toLowerCase();
      if (resume?.name && hints(field).some(text => /\b(resume|cv|curriculum vitae)\b/.test(text)) && (!accept || /pdf|application\/\*|\*\/\*/.test(accept)) && !plan.some(item => item.kind === "file")) plan.push({ field, key: "resumeFile", label: "Resume PDF", value: resume.name, kind: "file" });
      continue;
    }
    const definition = definitionsByField.get(field); if (!definition) continue;
    const key = definition.key;
    let value = key.startsWith("social:") ? definition.value : key.startsWith("custom:") ? profile.custom?.[key.slice(7)] : profile[key];
    if (!value && key === "fullName") value = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    if (!value && key === "phone") value = profile.phoneInternational;
    if (typeof value !== "string" || !value.trim()) continue;
    if (key === "phone" && profile.phoneCountryCode) {
      const dial = String(profile.phoneCountryCode).replace(/\D/g, "");
      const codeField = candidates.find(other => other !== field && other.form === field.form && definitionsByField.get(other)?.key === "phoneCountryCode");
      const national = field.autocomplete?.split(/\s+/).pop() === "tel-national";
      if (codeField && !isEmpty(codeField)) {
        const selected = codeField.tagName === "SELECT" ? codeField.selectedOptions[0] : { value: codeField.value, textContent: codeField.value };
        if (!optionMatches(selected, profile.phoneCountryCode, "phoneCountryCode")) continue;
      }
      if (dial && (codeField || national) && /^\s*(?:\+|00)/.test(value)) value = value.replace(new RegExp(`^\\s*(?:\\+|00)${dial}[\\s().-]*`), "");
      else if (!codeField && !national && profile.phoneInternational) value = profile.phoneInternational;
      else if (dial && !codeField && !national && !/^\s*(?:\+|00)/.test(value)) value = `+${dial} ${value}`;
    }
    if (field.tagName === "SELECT") {
      const option = [...field.options].find(option => !option.disabled && option.value && optionMatches(option, value, key));
      if (!option) continue; value = option.value;
    }
    if (field.type === "radio") {
      const group = candidates.filter(other => other.type === "radio" && other.form === field.form && other.getRootNode() === field.getRootNode() && other.name === field.name && (field.name || other === field));
      if (group.some(other => plannedRadios.has(other))) continue;
      const label = [...(field.labels || [])].map(label => label.textContent).join(" ");
      if (!optionMatches({ value: field.value, textContent: label }, value, key)) continue;
      group.forEach(other => plannedRadios.add(other));
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) continue;
    if (field.maxLength > 0 && value.length > field.maxLength) continue;
    plan.push({ field, key, label: definition.label, value, kind: field.type === "radio" ? "radio" : "value" });
  }
  ApplyKitPreviewPlan = plan;
  return { matches: plan.map(item => ({ label: item.label, kind: item.kind })), fieldCount: candidates.length, emptyFieldCount: candidates.filter(isEmpty).length, inaccessibleFrames, canUndo: ApplyKitFillHistory.length > 0 };
}
