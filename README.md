# ApplyKit

ApplyKit is a local-first Chrome extension for filling common job application fields from a profile you manage in the extension. Profile values are stored with Chrome's `storage.local` API, and an optional resume PDF is stored in the extension's IndexedDB database on the browser where you use it. The project has no account, server, analytics, or sync service.

## Install from source

1. Download or clone this repository to your computer.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the `ApplyKit` project folder (the folder containing `manifest.json`).
5. Pin ApplyKit from Chrome's Extensions menu if you want quick access.

To update after pulling new changes, return to `chrome://extensions` and click the reload icon on the ApplyKit card.

## Use it

1. Open the extension and choose **Edit profile**.
2. Add your contact details, links, and any custom reusable answers, then save.
3. Open a job application form and click ApplyKit, then **Fill this form**.
4. Review every filled value and complete anything the extension did not recognize before submitting the application yourself.

ApplyKit matches common field names, labels, placeholders, and autocomplete attributes. It fills fields it can confidently match and leaves populated fields alone. Enter a phone country calling code such as `+880` in your profile; ApplyKit fills a separate calling-code field when found, or prefixes the number when the form has one phone field. Field labels vary across application sites, so inspect the result each time.

### Resume files

On the profile page, choose a PDF under **Resume PDF** to store it in this browser. When you click **Fill this form**, ApplyKit can attach that PDF to an empty file input that it recognizes as a resume/CV field and that accepts PDFs. Some sites use custom upload controls or embedded forms that cannot be detected; check the page after filling. ApplyKit never submits the application. You can remove the stored PDF from the profile page. A resume or CV URL can also fill a URL field.

## Profile privacy and backup

Profile data and the optional resume PDF are saved in browser storage on this device. They are not part of this repository and are not sent to ApplyKit or a remote service. Uninstalling the extension or clearing its data may remove them. **Export JSON** backs up profile fields; it does not include the resume PDF. Keep your original PDF or choose it again after reinstalling. Exported JSON backups contain personal information; store and share them carefully.

The source contains no real profile values. Keep personal data out of commits, issues, screenshots, and pull requests. If you add sample profiles for development, use fictional values.

## Permissions

- `storage`: save and retrieve profile fields in Chrome local extension storage. The PDF is kept in extension IndexedDB.
- `activeTab` and `scripting`: inspect and fill the active page only after you click the extension's fill button.

ApplyKit does not submit forms, read pages in the background, or request access to all sites. Chrome may block extension access on browser-internal pages and some protected pages.

## Contributing

Issues and pull requests are welcome. Please describe the form-field pattern you are addressing without including real applicant details or sensitive application data. Keep the extension dependency-free where practical and request only permissions required for a user-visible feature.

## License

ApplyKit is available under the MIT License. See [LICENSE](LICENSE).
