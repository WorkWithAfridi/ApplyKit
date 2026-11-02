// Shared by the settings page, popup, and injected form matcher.
var ApplyKitSchema = (() => {
  const field = (key, label, aliases = [], extra = {}) => ({ key, label, aliases: [label, key, ...aliases], ...extra });
  const yesNo = ["Yes", "No"];
  const sections = [
    { id: "contact", title: "Personal & contact", description: "The essentials for every introduction.", fields: [
      field("firstName", "First name", ["given name", "fname"], { autocomplete: "given-name" }),
      field("lastName", "Last name", ["family name", "surname", "lname"], { autocomplete: "family-name" }),
      field("fullName", "Full name", ["your name", "legal name", "applicant name", "candidate name", "name of applicant", "name"], { autocomplete: "name" }),
      field("preferredName", "Preferred name", ["chosen name", "nickname"], { autocomplete: "nickname" }),
      field("email", "Email", ["email address", "e mail", "primary email", "email id"], { type: "email", autocomplete: "email" }),
      field("phoneCountryCode", "Phone country code", ["country calling code", "calling code", "dial code", "dialing code", "dialling code", "country code"], { type: "tel", autocomplete: "tel-country-code", placeholder: "+44" }),
      field("phone", "Phone number", ["telephone", "mobile number", "phone", "mobile", "cell phone", "contact number", "telephone number", "phone no"], { type: "tel", autocomplete: "tel-national", hint: "Your national number. Set the international number below if its formatting differs." }),
      field("phoneInternational", "International phone number", ["international phone", "full phone number"], { type: "tel", placeholder: "+44 7700 900000", hint: "Optional. Used for a single phone field instead of combining code and number." }),
      field("pronouns", "Pronouns", ["preferred pronouns"])
    ] },
    { id: "address", title: "Location & address", description: "Separate address details for forms that ask for each part.", fields: [
      field("location", "Location", ["current location", "where are you based"]),
      field("addressLine1", "Street address", ["address line 1", "address line one", "street", "mailing address", "address"], { autocomplete: "address-line1" }),
      field("addressLine2", "Address line 2", ["address line two", "apartment", "suite", "unit"], { autocomplete: "address-line2" }),
      field("city", "City", ["town", "locality"], { autocomplete: "address-level2" }),
      field("region", "State / province", ["state", "province", "region", "county"], { autocomplete: "address-level1" }),
      field("postalCode", "Postal code", ["zip", "zip code", "postcode"], { autocomplete: "postal-code" }),
      field("country", "Country", ["country of residence", "residence country"], { autocomplete: "country-name", hint: "Use the country name as it appears on most forms." }),
      field("timeZone", "Time zone", ["timezone", "time zone preference"], { placeholder: "Europe/London" })
    ] },
    { id: "links", title: "Links & resume", description: "Your work, your profiles, and your current CV.", fields: [
      field("linkedin", "LinkedIn URL", ["linkedin", "linkedin profile", "linkedin profile url"], { type: "url" }),
      field("portfolio", "Portfolio URL", ["portfolio", "website", "personal site", "personal website", "website url"], { type: "url" }),
      field("github", "GitHub URL", ["github", "github profile"], { type: "url" }),
      field("otherLink", "Other professional link", ["personal blog", "blog url", "other website"], { type: "url" }),
      field("resumeUrl", "Resume / CV URL", ["resume url", "cv url", "resume link", "cv link"], { type: "url" })
    ] },
    { id: "work", title: "Experience & skills", description: "A snapshot of your current or most recent role.", fields: [
      field("jobTitle", "Current job title", ["job title", "current title", "most recent job title", "professional title"]),
      field("currentCompany", "Current company", ["current employer", "most recent employer", "company name", "employer"]),
      field("experienceYears", "Years of experience", ["total experience", "total years of experience", "professional experience"], { type: "number", min: 0, step: "0.5" }),
      field("employmentStart", "Role start date", ["employment start date", "job start date"], { type: "date" }),
      field("employmentEnd", "Role end date", ["employment end date", "job end date"], { type: "date" }),
      field("skills", "Skills", ["technical skills", "key skills", "skill set"], { multiline: true }),
      field("languages", "Languages", ["spoken languages", "language proficiency"]),
      field("professionalSummary", "Professional summary", ["about yourself", "about you", "professional bio", "tell us about yourself", "summary"], { multiline: true, wide: true })
    ] },
    { id: "education", title: "Education", description: "Your highest or most recent qualification.", fields: [
      field("institution", "School / university", ["university", "school", "institution", "college", "school name"]),
      field("degree", "Degree", ["highest degree", "qualification", "education level", "highest level of education"]),
      field("major", "Field of study", ["major", "specialization", "discipline"]),
      field("graduationYear", "Graduation year", ["year of graduation", "year graduated"], { type: "number", min: 1900, step: "1" }),
      field("gpa", "GPA / grade", ["gpa", "cgpa", "grade point average", "final grade"]),
      field("certifications", "Certifications", ["professional certifications", "licenses", "certificates"], { multiline: true })
    ] },
    { id: "eligibility", title: "Work eligibility", description: "Only save answers that apply to the jobs you are applying for.", fields: [
      field("workAuthorization", "Authorized to work", ["legally authorized to work", "are you authorized to work", "eligible to work", "right to work"], { options: yesNo }),
      field("sponsorship", "Require visa sponsorship", ["visa sponsorship", "require sponsorship", "need sponsorship", "immigration sponsorship"], { options: yesNo }),
      field("relocation", "Willing to relocate", ["open to relocation", "relocation", "willingness to relocate"], { options: yesNo }),
      field("travel", "Willing to travel", ["willingness to travel", "travel availability"], { options: yesNo }),
      field("desiredJobTitle", "Desired job title", ["desired role", "target role", "preferred job title", "position sought"]),
      field("employmentType", "Employment type", ["job type", "contract type", "type of employment"], { options: ["Full-time", "Part-time", "Contract", "Freelance", "Internship", "Temporary"] }),
      field("workPreference", "Work arrangement", ["work preference", "preferred work location", "workplace preference", "work location preference"], { options: ["Remote", "Hybrid", "On-site", "Flexible"] })
    ] },
    { id: "availability", title: "Availability & compensation", description: "Reusable preferences; adjust them for each opportunity.", fields: [
      field("earliestStart", "Earliest start date", ["available start date", "when can you start", "availability date", "start date"], { type: "date" }),
      field("noticePeriod", "Notice period", ["current notice period", "availability", "notice"], { placeholder: "2 weeks" }),
      field("expectedSalary", "Expected salary", ["salary expectation", "salary expectations", "desired salary", "salary requirement", "expected compensation", "expected hourly rate", "desired hourly rate"]),
      field("salaryCurrency", "Salary currency", ["compensation currency", "currency"], { placeholder: "USD" }),
      field("salaryPeriod", "Salary period", ["pay period", "salary frequency", "compensation period"], { options: ["Yearly", "Monthly", "Weekly", "Hourly"] }),
      field("currentSalary", "Current salary", ["current compensation", "current remuneration"])
    ] },
    { id: "answers", title: "Application answers", description: "Keep drafts here and tailor them before each submission.", fields: [
      field("coverLetter", "Cover letter", ["covering letter", "cover letter text"], { multiline: true, wide: true }),
      field("whyRole", "Why this role?", ["why are you interested in this role", "why this position", "why are you interested in this position"], { multiline: true, wide: true }),
      field("whyCompany", "Why this company?", ["why do you want to work here", "why are you interested in our company", "why do you want to join"], { multiline: true, wide: true }),
      field("achievements", "Key achievements", ["greatest achievement", "proudest achievement", "accomplishments"], { multiline: true, wide: true }),
      field("referralSource", "How you found the job", ["how did you hear about us", "how did you hear about this job", "source", "referral source"]),
      field("referralName", "Referral name", ["referred by", "employee referral", "referrer name"]),
      field("additionalInfo", "Additional information", ["anything else", "additional comments", "additional details"], { multiline: true, wide: true })
    ] },
    { id: "optional", title: "Optional self-identification", description: "Leave blank or opt in to filling these details below.", sensitive: true, fields: [
      field("dateOfBirth", "Date of birth", ["birth date", "dob"], { type: "date", autocomplete: "bday" }),
      field("nationality", "Nationality", ["citizenship", "country of citizenship"]),
      field("gender", "Gender", ["gender identity"]),
      field("ethnicity", "Race / ethnicity", ["race", "ethnicity", "ethnic background"]),
      field("disabilityStatus", "Disability status", ["disability", "do you have a disability"]),
      field("veteranStatus", "Veteran status", ["protected veteran", "veteran"])
    ] }
  ];
  const socialPlatforms = [
    { name: "X", aliases: ["Twitter", "X (Twitter)", "X profile", "X URL", "X link", "Twitter profile", "Twitter URL", "Twitter link"] },
    { name: "Facebook", aliases: ["Facebook profile", "Facebook URL", "Facebook link"] },
    { name: "Instagram", aliases: ["Instagram profile", "Instagram URL"] },
    { name: "YouTube", aliases: ["YouTube channel", "YouTube URL"] },
    { name: "Bluesky", aliases: ["Bluesky profile"] },
    { name: "Mastodon", aliases: ["Mastodon profile"] },
    { name: "Threads", aliases: ["Threads profile"] },
    { name: "Dribbble", aliases: ["Dribbble portfolio"] },
    { name: "Behance", aliases: ["Behance portfolio"] },
    { name: "Stack Overflow", aliases: ["StackOverflow", "Stack Overflow profile"] },
    { name: "Medium", aliases: ["Medium profile", "Medium blog"] },
    { name: "Dev.to", aliases: ["DEV Community", "Dev.to profile"] },
    { name: "GitLab", aliases: ["GitLab profile"] }
  ];
  const socialName = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const socialPlatform = name => socialPlatforms.find(platform => [platform.name, ...platform.aliases].some(alias => socialName(alias) === socialName(name)));
  function socialFields(profile) {
    if (!Array.isArray(profile.socialLinks)) return [];
    return profile.socialLinks.flatMap((link, index) => {
      if (!link || typeof link.platform !== "string" || typeof link.url !== "string" || !link.platform.trim() || !link.url.trim()) return [];
      const platform = socialPlatform(link.platform);
      return [{ key: `social:${index}`, label: `${link.platform} URL`, value: link.url, aliases: [...new Set([link.platform, `${link.platform} URL`, `${link.platform} profile`, `${link.platform} link`, ...(platform ? [platform.name, ...platform.aliases] : [])].flatMap(alias => [alias, alias.toLowerCase()]))] }];
    });
  }
  return { sections, fields: sections.flatMap(section => section.fields.map(item => ({ ...item, sensitive: !!section.sensitive }))), socialPlatforms, socialName, socialPlatform, socialFields };
})();
