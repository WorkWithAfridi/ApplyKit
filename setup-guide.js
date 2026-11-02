// Reusable guidance contains schema information only, never a user's profile.
const ApplyKitGuide = (() => {
  function blankBackup() {
    return {
      version: 2,
      profile: {
        ...Object.fromEntries(ApplyKitSchema.fields.map(field => [field.key, ""])),
        socialLinks: [],
        fillSensitive: false,
        custom: {}
      }
    };
  }

  function prompt() {
    const keys = ApplyKitSchema.fields.map(field => `${field.key} (${field.label})`).join(", ");
    return `I have attached my ApplyKit profile JSON (an exported backup or blank template) and my CV/resume PDF. Create an updated ApplyKit import JSON using my CV.

If either attachment is missing or cannot be read, ask me for it before generating the file.

Merge rules:
- Use the attached profile as the base. Preserve its existing socialLinks, custom answers, preferences, and any other values the CV does not explicitly update. Do not rebuild it from scratch.
- Use only facts explicitly supported by the CV. Do not guess salary, availability, work authorization, visa sponsorship, relocation preferences, personal demographics, or spoken languages. Preserve existing answers when the CV is silent.
- Keep names, email addresses, phone digits, and profile URLs accurate. A local PDF path is not a public resume URL; preserve the existing resumeUrl unless the CV explicitly provides one.
- Date fields use YYYY-MM-DD. Do not invent a day for month-only dates: preserve the existing date field and put the month/year in a custom answer instead.
- Mark qualifications still in progress clearly. Do not use a previous degree's graduation year for a current degree. Ask me about a conflicting existing value rather than inventing a replacement.
- experienceYears is a numeric string. If the CV says a minimum such as 5+ years, use "5" and retain the 5+ wording in the summary; do not present it as an exact duration.
- Review phoneCountryCode, phone, and phoneInternational together. Prefer the explicit international number from the CV; do not guess country-specific dialing changes.
- Do not create generic cover letters or company-specific motivation answers. Preserve existing drafts unless I explicitly ask for changes.

Required file format:
- Return one complete JSON object: {"version":2,"profile":{...}}.
- Standard profile fields are strings, including numeric and date fields. Missing fields can remain empty strings.
- Allowed standard keys: ${keys}.
- Preserve socialLinks as an array of {"platform":"Platform name","url":"https://..."}. Use complete http:// or https:// URLs and distinct platform names. LinkedIn and GitHub have dedicated linkedin and github fields; do not duplicate them in socialLinks.
- Preserve fillSensitive as a boolean. Do not turn it on automatically.
- Preserve custom as an object of question labels mapped to string answers. Additional CV details can go here; do not overwrite unrelated custom answers. Avoid duplicate labels.
- The JSON does not contain a PDF file. I will choose the PDF separately in ApplyKit if needed.

Validate the JSON and provide a downloadable file named applykit-profile-updated.json. Keep explanations outside the JSON file. Summarize the changes and any details I should verify before importing. If a download is unavailable, provide the complete valid JSON so I can save it as a .json file.`;
  }

  return { blankBackup, prompt };
})();
