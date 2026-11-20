# Cadence

Cadence includes two tools. **SteadyType** is a Chrome extension that types text into an editable page. **Cadence Recorder** is a separate Windows desktop app that records your typing cadence during a writing session in its own editor.

## Download

1. Open the [Cadence repository](https://github.com/maynorzeledon/Cadence).
2. Click **Code**, then **Download ZIP**.
3. In File Explorer, right-click the ZIP and choose **Extract All**. In the extracted folder, look for `extension` and `recorder`.

## Install and use SteadyType

1. In Chrome, open `chrome://extensions`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**. Select the extracted **extension** folder. You should see SteadyType appear in the list.
4. Open a regular web page, click a text field, and use Chrome's Extensions menu to open **SteadyType**. You can pin it from that menu.
5. Enter the text, set your words per minute and sentence pause, then click **Start**. Reopen the popup to pause, resume, or stop. Press **Escape** on the page to stop.
6. For a quick calibration, expand **Personal pace**, type a sample, and choose **Use sample pace**. The extension saves your estimated pace and timing variation locally.
7. For headings, lists, bold, italics, or inline code, focus a compatible rich-text field and enable **Keep Markdown formatting**. This inserts the formatted result in one operation.

If Chrome says the manifest is missing, select the folder that directly contains `manifest.json`. If the extension cannot find an editor, click inside an ordinary text input or textarea on the main page before opening it. Chrome settings pages, Google Docs, Word Online, and iframe editors are outside this release's scope. To update, extract the new files and use **Reload** on the extension's card, or load the new folder. To uninstall, choose **Remove** on the same card.

## Launch and use Cadence Recorder on Windows

1. Open the extracted **recorder** folder and double-click **Launch.cmd**. The app uses Windows PowerShell and Windows Forms. There are no packages to install. The launcher applies its execution-policy setting to this process only.
2. Click **Start new session**. Write a few paragraphs about something you know. Leave your natural pauses, rewrites, and corrections in the session.
3. Click **Stop recording**, then **Export session JSON**. Pick a local folder and save the recording. Repeat with different writing prompts to collect more representative samples.
4. Close the window when finished. Unexported sessions live in memory. The app asks before discarding an unexported recording when starting over or closing.

The recorder captures key-down and key-up events delivered to its writing field, along with text edits, focus changes, and session start and stop. This includes modifier information, repeated key-down events, and edits caused by paste or undo when the editor delivers those events. Windows shortcuts, input methods, and focus changes can affect which key events reach the field. The app has no system-wide keyboard hook or network connection.

## Use a recording to build a personal cadence profile

Each exported JSON contains `schema_version`, `started_utc`, `initial_text`, `final_text`, and an ordered `events` array. Events carry a UTC timestamp and monotonic `elapsed_ms` measured at the app callback. Use elapsed time to compute intervals. Fractional digits are timestamp precision, and Windows input delivery can add latency.

- **Dwell time** is the elapsed time from the first key-down to the corresponding key-up. Treat repeated downs during a hold as repeats. Drop unmatched pairs across focus breaks.
- **Flight time** is the gap from one key-up to the next key-down. Overlapping keys can yield negative gaps. Key-down-to-key-down is another useful interval.
- **Pauses and corrections** can be estimated from long gaps, Backspace/Delete events, and edits that remove or replace text. Analyze focused writing separately from time spent outside the editor.
- **Edit history** can be reconstructed by starting with `initial_text` and applying each `text_edit` in sequence. At each UTF-16 `offset`, replace the `deleted` substring with `inserted`.

For a first AI-assisted analysis, try this prompt with your own session data:

> Analyze my writing cadence from these session files. Use monotonic elapsed times and exclude focus breaks. Give the sample count and median and quartiles for key-down intervals and dwell time, then summarize sentence pauses, burst lengths, and correction frequency. Propose WPM and sentence-pause settings for SteadyType. Keep statistics separate from the text I wrote.

The export includes your prose and deleted text. Use a non-sensitive writing sample if you plan to share a file externally. The current extension accepts WPM and sentence pause manually. It has no recording-import or AI training pipeline.
