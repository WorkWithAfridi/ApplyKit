# ApplyKit

ApplyKit is a local-first Chrome extension for filling common job application fields from a profile you manage in the extension. Profile values are stored with Chrome's `storage.local` API on the browser where you use the extension. The project has no account, server, analytics, or sync service.

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

ApplyKit matches common field names, labels, placeholders, and autocomplete attributes. It fills fields it can confidently match and leaves populated fields alone. Field labels vary across application sites, so inspect the result each time.

### Resume files

ApplyKit can fill a resume or CV URL field from your profile. Chrome does not allow an extension to silently set a website's local file-upload input. Select the resume manually in the application form when it asks for a file.

## Profile privacy and backup

Profile data is saved in Chrome local extension storage on this browser. It is not part of this repository and is not sent to ApplyKit or a remote service. Uninstalling the extension or clearing its data may remove the profile. Use **Export JSON** on the profile page to make a backup, and **Import JSON** to restore it. Exported backups contain personal information; store and share them carefully.

The source contains no real profile values. Keep personal data out of commits, issues, screenshots, and pull requests. If you add sample profiles for development, use fictional values.

## Permissions

- `storage`: save and retrieve the profile in Chrome local extension storage.
- `activeTab` and `scripting`: inspect and fill the active page only after you click the extension's fill button.

ApplyKit does not submit forms, read pages in the background, or request access to all sites. Chrome may block extension access on browser-internal pages and some protected pages.

## Contributing

Issues and pull requests are welcome. Please describe the form-field pattern you are addressing without including real applicant details or sensitive application data. Keep the extension dependency-free where practical and request only permissions required for a user-visible feature.

## License

ApplyKit is available under the MIT License. See [LICENSE](LICENSE).
