(() => {
  if (globalThis.steadyType) return;

  const textInputTypes = new Set(["text", "search", "tel", "url"]);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let run = null;
  let phase = "Ready";
  let message = "";

  function focusedEditor() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    if (element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLInputElement && textInputTypes.has(element.type))) {
      if (!element.readOnly && !element.disabled) return element;
    }
    return element?.isContentEditable ? element : null;
  }

  function addInline(parent, text) {
    const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(text.slice(offset, match.index));
      const element = document.createElement(match[1] ? "strong" : match[2] ? "em" : "code");
      element.textContent = match[1] ?? match[2] ?? match[3];
      parent.append(element);
      offset = match.index + match[0].length;
    }
    parent.append(text.slice(offset));
  }

  function formatMarkdown(text) {
    const output = document.createElement("div");
    let list = null;
    let paragraph = null;
    for (const line of text.split(/\r?\n/)) {
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      const item = /^\s*([-+*]|\d+[.)])\s+(.+)$/.exec(line);
      if (item) {
        paragraph = null;
        const tag = /^\d/.test(item[1]) ? "ol" : "ul";
        if (!list || list.localName !== tag) {
          list = document.createElement(tag);
          if (tag === "ol") list.start = Number.parseInt(item[1], 10);
          output.append(list);
        }
        const entry = document.createElement("li");
        addInline(entry, item[2]);
        list.append(entry);
      } else {
        list = null;
        if (heading) {
          paragraph = null;
          const element = document.createElement("h" + heading[1].length);
          addInline(element, heading[2]);
          output.append(element);
        } else if (!line.trim()) {
          paragraph = null;
        } else {
          if (!paragraph) {
            paragraph = document.createElement("p");
            output.append(paragraph);
          } else {
            paragraph.append(document.createElement("br"));
          }
          addInline(paragraph, line);
        }
      }
    }
    return output.innerHTML;
  }

  function insertText(target, segment) {
    if (target.isContentEditable) {
      const newline = /^(\r\n|\r|\n)$/.test(segment);
      return document.execCommand(newline ? "insertLineBreak" : "insertText", false, newline ? null : segment);
    }
    if (target instanceof HTMLInputElement && /[\r\n]/.test(segment)) {
      segment = " ";
    }
    if (target.maxLength >= 0 &&
        target.value.length - (target.selectionEnd - target.selectionStart) + segment.length > target.maxLength) {
      return false;
    }
    if (document.execCommand("insertText", false, segment)) return true;

    const start = target.selectionStart;
    const end = target.selectionEnd;
    const before = new InputEvent("beforeinput", {
      bubbles: true, composed: true, cancelable: true, inputType: "insertText", data: segment,
    });
    if (!target.dispatchEvent(before) || focusedEditor() !== target) return false;
    target.setRangeText(segment, start, end, "end");
    target.dispatchEvent(new InputEvent("input", {
      bubbles: true, composed: true, inputType: "insertText", data: segment,
    }));
    return true;
  }

  function finish(nextPhase, nextMessage = "") {
    clearTimeout(run?.timer);
    run = null;
    phase = nextPhase;
    message = nextMessage;
  }

  function schedule(delay) {
    run.timer = setTimeout(step, delay);
  }

  function step() {
    if (!run || phase !== "Typing") return;
    if (!run.target.isConnected || focusedEditor() !== run.target) {
      finish("Stopped", "The target field lost focus.");
      return;
    }
    try {
      if (run.html !== null) {
        if (!document.execCommand("insertHTML", false, run.html)) {
          finish("Stopped", "This editor rejected formatted insertion.");
        } else {
          finish("Complete", "Formatted text inserted.");
        }
        return;
      }
      const { value, done } = run.segments.next();
      if (done) {
        finish("Complete", "Typing complete.");
        return;
      }
      if (!insertText(run.target, value.segment)) {
        finish("Stopped", "The target field rejected the next character.");
        return;
      }
      if (value.index + value.segment.length === run.length) {
        finish("Complete", "Typing complete.");
        return;
      }
      const sentencePause = /^[.!?]$/.test(value.segment) ? run.pause : 0;
      const jitter = 1 + (Math.random() * 2 - 1) * run.variation;
      schedule(run.delay * jitter + sentencePause);
    } catch (error) {
      finish("Stopped", error.message);
    }
  }

  globalThis.steadyType = (action, options) => {
    if (action === "start") {
      if (run) return { phase, message: "Stop the current run before starting another." };
      const target = focusedEditor();
      if (!target) return { phase, message: "Click an editable text field, then reopen SteadyType." };
      if (options.rich && !target.isContentEditable) {
        return { phase, message: "Choose a rich-text field or turn off Markdown formatting." };
      }
      const html = options.rich ? formatMarkdown(options.text) : null;
      if (html === "") return { phase, message: "Enter Markdown text to format." };
      run = {
        target,
        html,
        segments: segmenter.segment(options.text)[Symbol.iterator](),
        length: options.text.length,
        delay: 12000 / options.wpm,
        pause: options.pause,
        variation: options.profile?.variation ?? 0.12,
        timer: null,
      };
      phase = "Typing";
      message = "";
      schedule(0);
    }
    if (action === "toggle" && run) {
      if (phase === "Paused") {
        phase = "Typing";
        schedule(0);
      } else {
        clearTimeout(run.timer);
        phase = "Paused";
      }
    }
    if (action === "stop" && run) finish("Stopped");
    return { phase, message };
  };

  document.addEventListener("keydown", (event) => {
    if (run && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish("Stopped");
    }
  }, { capture: true });
})();
