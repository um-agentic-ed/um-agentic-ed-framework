(function () {
  "use strict";

  const pane = document.getElementById("editor-pane");
  if (!pane) return;

  // Closes any open "+ Add block" menu when clicking elsewhere, since <details> only
  // toggles on its own <summary> and won't auto-close on an outside click.
  document.addEventListener("click", event => {
    if (event.target.closest(".editor-add-menu")) return;
    pane.querySelectorAll(".editor-add-menu[open]").forEach(menu => { menu.open = false; });
  });

  const REFRESH_DELAY_MS = 300;
  const BUSY_FEEDBACK_DELAY_MS = 400;
  let refreshTimer = null;
  let current = null; // { key, kind, assetBasePath, src } from main.js's umed:slide-loaded event
  const dirtyKeys = new Set(); // keys with unsaved in-memory edits, tracked across navigation
  // Retains file metadata for previously visited pages so a modified Save click can persist
  // dirty Slides that are no longer the page currently shown in the Editor pane.
  const contentInfoByKey = new Map();
  // Deep clones of each key's last-saved (or first-seen-this-session) content, used to revert
  // in-memory edits when Discard Changes is clicked. Refreshed after every successful save and
  // dropped on delete; otherwise left alone so navigating away and back doesn't reset the baseline.
  const savedSnapshots = new Map();
  // Live block objects can be reordered without changing identity. Remember their corresponding
  // blocks in the last-saved snapshot so an image edit can persist only its filename declaration
  // without accidentally saving unrelated live form edits.
  const savedBlockCounterparts = new WeakMap();
  let currentSaveButton = null;
  let currentDiscardButton = null;

  // Editor mode only shows this pane after a Ctrl-click (Cmd-click on Mac) on the app title (see
  // main.js resolveRoute/editorModeActive), so this is a reliable guard against building forms
  // while the pane is hidden.
  function isEditorActive() {
    return !pane.hidden;
  }

  function updateSaveButtonState() {
    if (!current) return;
    const isDirty = dirtyKeys.has(current.key);
    if (currentSaveButton) currentSaveButton.disabled = !isDirty;
    if (currentDiscardButton) currentDiscardButton.disabled = !isDirty;
  }

  function markDirty() {
    if (!current) return;
    dirtyKeys.add(current.key);
    updateSaveButtonState();
  }

  // Live preview updates are debounced so rapid typing doesn't thrash the Learner view; the
  // in-memory content object itself is mutated immediately on every input, and the Save button
  // reflects that immediately too (not debounced).
  function scheduleRefresh() {
    markDirty();
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (window.umedApp && typeof window.umedApp.refreshSlide === "function") {
        window.umedApp.refreshSlide();
      }
    }, REFRESH_DELAY_MS);
  }

  function field(labelText, inputElement, labelExtra) {
    const label = document.createElement("label");
    label.className = "editor-field";
    const span = document.createElement("span");
    span.textContent = labelText;
    if (labelExtra) {
      const labelRow = document.createElement("span");
      labelRow.className = "editor-field-label-row";
      labelRow.append(span, labelExtra);
      label.append(labelRow, inputElement);
    } else {
      label.append(span, inputElement);
    }
    return label;
  }

  // A compact, inline checkbox field for short boolean options that belong at the end of a
  // row of conventional editor fields.
  function checkboxField(labelText, checked, onChange) {
    const label = document.createElement("label");
    label.className = "editor-field editor-center-field";
    const span = document.createElement("span");
    span.textContent = labelText;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    input.addEventListener("change", () => onChange(input.checked));
    label.append(span, input);
    return label;
  }

  // Widget names double as their <widget-name>.js filename and window.umedAppWidgets registry key
  // (see AGENTS.md), so they must be kebab-case; this is the single source of truth for that,
  // used both live (widget name field blur) and as a save-time safety net (serializeContentFile).
  function toKebabCase(value) {
    return (value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function isSectionLanding() {
    return Boolean(current && current.kind === "overview" && current.key.split("/").length === 3);
  }
  function isSlide() {
    return Boolean(current && current.kind === "slide");
  }

  const TRUSTED_SOURCE_DIRECT_EXTENSIONS = new Set([
    "txt", "md", "markdown", "pdf", "docx", "pptx", "xlsx", "csv", "tsv",
    "json", "jsonl", "yaml", "yml", "xml", "html", "htm", "rtf", "odt", "ods",
    "odp", "tex", "bib", "ris", "enw", "nbib", "js", "css", "py", "r", "sql"
  ]);
  const TRUSTED_SOURCE_CONVERSION_EXTENSIONS = new Set([
    "doc", "xls", "ppt", "pages", "numbers", "key"
  ]);
  const TRUSTED_SOURCE_ADVISORY_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "gif", "webp", "tif", "tiff", "bmp", "svg", "heic",
    "zip", "7z", "rar", "tar", "gz", "eml", "msg", "ipynb", "epub"
  ]);
  const TRUSTED_SOURCE_REJECTED_EXTENSIONS = new Set([
    "exe", "msi", "com", "bat", "cmd", "scr", "dll", "sys", "app", "dmg", "pkg",
    "deb", "rpm", "iso", "img", "bin", "jar", "apk", "ps1", "vbs", "vbe", "wsf",
    "lnk", "reg"
  ]);

  function fileExtension(fileName) {
    const dotIndex = (fileName || "").lastIndexOf(".");
    return dotIndex > -1 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
  }

  // Classifies before requesting folder access or writing anything. The direct list consists of
  // formats an Agent can normally read as context. Advisory formats may be usable, but often hide
  // text in images/containers. Older Office/iWork formats get more specific conversion guidance.
  function evaluateTrustedSourceFile(file) {
    const extension = fileExtension(file.name);
    if (TRUSTED_SOURCE_REJECTED_EXTENSIONS.has(extension)) {
      return {
        action: "reject",
        message: `"${file.name}" is an executable, installer, system, or disk-image format and cannot be used as a trusted context source.`
      };
    }
    if (TRUSTED_SOURCE_DIRECT_EXTENSIONS.has(extension)) return { action: "accept" };
    if (TRUSTED_SOURCE_CONVERSION_EXTENSIONS.has(extension)) {
      return {
        action: "confirm",
        message: `"${file.name}" uses a legacy or application-specific format. For more reliable context, export it as PDF, DOCX, XLSX, PPTX, or plain text first. Add the original file anyway?`
      };
    }
    if (TRUSTED_SOURCE_ADVISORY_EXTENSIONS.has(extension)) {
      return {
        action: "confirm",
        message: `"${file.name}" may provide incomplete context because it is an image, archive, email, notebook, or ebook format. Prefer searchable text or PDF, and extract archives before adding them. Add it anyway?`
      };
    }
    return {
      action: "confirm",
      message: extension
        ? `The .${extension} format is not known to be reliably usable as Agent context. Add "${file.name}" anyway?`
        : `"${file.name}" has no file extension, so its context compatibility cannot be determined. Add it anyway?`
    };
  }

  async function editorConfirm(message, options) {
    return window.umedComponents && window.umedComponents.confirm
      ? window.umedComponents.confirm(message, options)
      : window.confirm(message);
  }

  function runWithBusyFeedback(operation) {
    let overlay = null;
    const timer = setTimeout(() => {
      overlay = document.createElement("div");
      overlay.className = "editor-busy-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");

      const indicator = document.createElement("span");
      indicator.className = "editor-busy-spinner";
      indicator.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = "Working\u2026";
      overlay.append(indicator, label);
      document.body.append(overlay);
    }, BUSY_FEEDBACK_DELAY_MS);

    return Promise.resolve()
      .then(operation)
      .finally(() => {
        clearTimeout(timer);
        if (overlay) overlay.remove();
      });
  }

  async function runLockedEditorAction(description, operation, options) {
    try {
      const showBusy = !options || options.showBusy !== false;
      return await window.umedEditorFS.withProjectLock(
        description,
        showBusy ? () => runWithBusyFeedback(operation) : operation
      );
    } catch (error) {
      console.error(error);
      alert(`The editing operation was cancelled: ${error.message}`);
      return undefined;
    }
  }

  function trustedSourcesRelativePath(fileName) {
    return `${current.key}/_trusted_sources/${fileName}`;
  }

  function trustedSourcesUnusedPath(fileName) {
    return `${current.key}/_trusted_sources/_unused/${fileName}`;
  }

  async function chooseFileRemovalAction(fileName, kind) {
    if (!window.umedComponents || !window.umedComponents.chooseOption) return null;
    return window.umedComponents.chooseOption(
      `What should happen to ${kind} "${fileName}"?\n\nMoving it to _unused keeps a local cache that is ignored by Git.`,
      ["Move to _unused", "Permanently delete"]
    );
  }

  async function uploadTrustedSource(file, block, rerenderSources) {
    if (!file || !isSectionLanding()) return;
    const evaluation = evaluateTrustedSourceFile(file);
    if (evaluation.action === "reject") {
      alert(evaluation.message);
      return;
    }
    if (evaluation.action === "confirm" && !(await editorConfirm(evaluation.message, {
      confirmLabel: "Add anyway", cancelLabel: "Cancel"
    }))) return;
    if (!window.umedEditorFS) {
      alert("File system access is unavailable in this browser.");
      return;
    }

    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    const relativePath = trustedSourcesRelativePath(file.name);
    try {
      const existingFile = await window.umedEditorFS.getExistingFile(rootHandle, relativePath);
      if (existingFile && !(await editorConfirm(
        `A trusted source named "${file.name}" already exists in this Section. Overwrite it?`,
        { confirmLabel: "Overwrite", cancelLabel: "Keep existing" }
      ))) return;
      await window.umedEditorFS.writeBinaryFile(rootHandle, relativePath, file);
      block.files = Array.isArray(block.files) ? block.files : [];
      if (!block.files.includes(file.name)) block.files.push(file.name);
      rerenderSources();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      alert(`Could not add trusted source "${file.name}": ${error.message}`);
    }
  }

  async function removeTrustedSource(fileName, block, rerenderSources) {
    if (!isSectionLanding()) return;
    const action = await chooseFileRemovalAction(fileName, "trusted source");
    if (!action) return;
    if (!window.umedEditorFS) {
      alert("File system access is unavailable in this browser.");
      return;
    }
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    try {
      if (action === "Move to _unused") {
        const unusedPath = trustedSourcesUnusedPath(fileName);
        const existing = await window.umedEditorFS.getExistingFile(rootHandle, unusedPath);
        if (existing && !(await editorConfirm(
          `An unused trusted source named "${fileName}" already exists. Replace it?`,
          { confirmLabel: "Replace", cancelLabel: "Cancel" }
        ))) return;
        await window.umedEditorFS.moveFile(rootHandle, trustedSourcesRelativePath(fileName), unusedPath);
      } else {
        await window.umedEditorFS.deleteFile(rootHandle, trustedSourcesRelativePath(fileName));
      }
      block.files = (block.files || []).filter(name => name !== fileName);
      rerenderSources();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      alert(`Could not remove trusted source "${fileName}": ${error.message}`);
    }
  }

  async function restoreTrustedSource(block, rerenderSources) {
    if (!window.umedEditorFS || !window.umedComponents || !window.umedComponents.chooseOption) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    const unusedDir = `${current.key}/_trusted_sources/_unused`;
    try {
      const names = await window.umedEditorFS.listFiles(rootHandle, unusedDir);
      if (!names.length) {
        alert("There are no unused trusted sources to restore.");
        return;
      }
      const fileName = await window.umedComponents.chooseOption("Choose a trusted source to restore:", names);
      if (!fileName) return;
      const activePath = trustedSourcesRelativePath(fileName);
      if (await window.umedEditorFS.getExistingFile(rootHandle, activePath)) {
        alert(`A trusted source named "${fileName}" already exists in this Section.`);
        return;
      }
      await window.umedEditorFS.moveFile(rootHandle, `${unusedDir}/${fileName}`, activePath);
      if (!block.files.includes(fileName)) block.files.push(fileName);
      rerenderSources();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      alert(`Could not restore the trusted source: ${error.message}`);
    }
  }

  // A contained drop zone avoids competing with Sortable's whole-block drag behavior. File
  // picker changes and file drops both call the same handler so validation and persistence stay
  // identical regardless of how the Editor supplies files.
  function attachFileDropTarget(target, handleFiles) {
    let dragDepth = 0;
    const isFileDrag = event => Array.from((event.dataTransfer && event.dataTransfer.types) || []).includes("Files");

    target.addEventListener("dragenter", event => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth += 1;
      target.classList.add("editor-file-drop-zone--active");
    });
    target.addEventListener("dragover", event => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    target.addEventListener("dragleave", event => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) target.classList.remove("editor-file-drop-zone--active");
    });
    target.addEventListener("drop", event => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      target.classList.remove("editor-file-drop-zone--active");
      const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
      if (files.length) handleFiles(files);
    });
  }

  function buildTrustedSourcesBlockFields(block, fieldset) {
    block.files = Array.isArray(block.files) ? block.files : [];
    const list = document.createElement("div");
    list.className = "editor-trusted-sources";

    function rerenderSources() {
      list.replaceChildren();
      block.files.forEach((fileName, index) => {
        const row = document.createElement("div");
        row.className = "editor-trusted-source-row";
        const name = document.createElement("input");
        name.type = "text";
        name.readOnly = true;
        name.value = fileName;
        name.setAttribute("aria-label", `Trusted source ${index + 1} file name`);
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "editor-trusted-source-remove";
        removeButton.textContent = "\u00d7";
        removeButton.title = `Remove ${fileName}`;
        removeButton.setAttribute("aria-label", `Remove trusted source ${fileName}`);
        removeButton.addEventListener("click", () => runLockedEditorAction("Remove a trusted source", () => removeTrustedSource(fileName, block, rerenderSources)));
        row.append(name, removeButton);
        list.append(row);
      });
    }

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.multiple = true;
    uploadInput.hidden = true;
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "editor-add-choice";
    addButton.textContent = "Add Trusted Source";
    addButton.addEventListener("click", () => uploadInput.click());
    const addFiles = async files => {
      await runLockedEditorAction("Upload trusted sources", async () => {
        for (const file of files) await uploadTrustedSource(file, block, rerenderSources);
      });
    };
    uploadInput.addEventListener("change", async () => {
      const files = Array.from(uploadInput.files || []);
      uploadInput.value = "";
      if (files.length) await addFiles(files);
    });

    const dropZone = document.createElement("div");
    dropZone.className = "editor-file-drop-zone";
    const dropHint = document.createElement("span");
    dropHint.className = "editor-file-drop-hint";
    dropHint.textContent = "Drop trusted source files here or";
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "editor-add-choice";
    restoreButton.textContent = "Restore Source";
    restoreButton.addEventListener("click", () => runLockedEditorAction("Restore a trusted source", () => restoreTrustedSource(block, rerenderSources)));
    dropZone.append(list, dropHint, addButton, restoreButton, uploadInput);
    attachFileDropTarget(dropZone, addFiles);

    const note = document.createElement("p");
    note.className = "editor-widget-note";
    note.textContent = "Files are stored in this Section's _trusted_sources folder for Agents and listed as downloadable references at the bottom of the Section landing slide. Searchable text, PDF, and modern Office files work best.";
    fieldset.append(note, dropZone);
    rerenderSources();
  }

  // Textareas grow/shrink to fit their content instead of scrolling internally, starting at
  // one empty line (rows=1 fixes the intrinsic "auto" height baseline to a single line so
  // scrollHeight isn't inflated by the browser's default 2-row textarea). Width stays fixed
  // to the parent via CSS; only height is managed here.
  function autoSizeTextarea(textarea) {
    textarea.rows = 1;
    const resize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    textarea.addEventListener("input", resize);
    requestAnimationFrame(resize);
  }

  function movableKind() {
    if (!current) return null;
    const depth = current.key.split("/").length;
    if (current.kind === "slide" && depth === 4) return "slide";
    if (current.kind !== "overview") return null;
    if (depth === 2) return "category";
    if (depth === 3) return "section";
    return null;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        console.warn("The Clipboard API was unavailable; trying the browser copy command.", error);
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("The browser declined the copy command.");
  }

  async function copyCurrentPath(button) {
    if (!current) return;
    const defaultTitle = "Copy path to clipboard";
    try {
      await copyTextToClipboard(current.key);
      button.classList.add("editor-icon-button--copied");
      button.title = "Path copied!";
      setTimeout(() => {
        button.classList.remove("editor-icon-button--copied");
        button.title = defaultTitle;
      }, 1600);
    } catch (error) {
      console.error(error);
      alert(`Could not copy the path to the clipboard: ${error.message}`);
    }
  }

  function buildMetaFields(data) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-meta";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = data.title || "";
    titleInput.addEventListener("input", () => { data.title = titleInput.value; scheduleRefresh(); });
    const titleField = field("Slide Title", titleInput);
    const row = document.createElement("div");
    row.className = "editor-title-row editor-field--full";
    const hiddenButton = document.createElement("button");
    hiddenButton.type = "button";
    hiddenButton.className = "editor-icon-button editor-hidden-toggle";
    hiddenButton.innerHTML = (window.umedIcons && window.umedIcons.hidden) || "Hide";
    const syncHiddenButton = () => {
      const hidden = data.hidden === true;
      const action = hidden ? "Show this Slide in Presenter Mode" : "Hide this Slide in Presenter Mode";
      hiddenButton.setAttribute("aria-pressed", String(hidden));
      hiddenButton.setAttribute("aria-label", action);
      hiddenButton.title = action;
    };
    syncHiddenButton();
    hiddenButton.addEventListener("click", () => {
      if (data.hidden === true) delete data.hidden;
      else data.hidden = true;
      syncHiddenButton();
      scheduleRefresh();
    });
    const copyPathButton = document.createElement("button");
    copyPathButton.type = "button";
    copyPathButton.className = "editor-icon-button";
    copyPathButton.innerHTML = (window.umedIcons && window.umedIcons.copy) || "Copy";
    copyPathButton.title = "Copy path to clipboard";
    copyPathButton.setAttribute("aria-label", "Copy path to clipboard");
    copyPathButton.addEventListener("click", () => copyCurrentPath(copyPathButton));
    row.append(titleField, hiddenButton, copyPathButton);

    const kind = movableKind();
    if (kind) {
      const moveButton = document.createElement("button");
      moveButton.type = "button";
      moveButton.className = "editor-icon-button";
      moveButton.innerHTML = (window.umedIcons && window.umedIcons.move) || "Move";
      moveButton.title = `Move this ${kind}`;
      moveButton.setAttribute("aria-label", `Move this ${kind}`);
      moveButton.addEventListener("click", () => runLockedEditorAction(
        `Move or copy a ${kind}`,
        () => handleMove(kind, moveButton),
        { showBusy: false }
      ));
      row.append(moveButton);
    }
    wrapper.append(row);

    return wrapper;
  }

  const DRAG_HANDLE_GLYPH = "\u283f";
  // Purely a UI convenience (which blocks are visually collapsed in the Editor pane), never
  // saved with Slide content. Keyed by block object identity so state survives a rerender()
  // (which rebuilds all fieldsets) but is naturally dropped when a different Slide's blocks load.
  const collapsedBlocks = new WeakSet();

  // Shared lead-in "markdown" field for image/widget/link blocks (see AGENTS.md Content Slide
  // blocks), built identically to the text block's own markdown textarea. Always the first row
  // in its block's fieldset so the lead-in text visually stays attached to, and reorders with,
  // the rest of that block's content.
  function buildMarkdownField(block) {
    const textarea = document.createElement("textarea");
    textarea.value = block.markdown || "";
    textarea.addEventListener("input", () => { block.markdown = textarea.value; scheduleRefresh(); });
    autoSizeTextarea(textarea);
    const markdownField = field("Markdown text (optional)", textarea);
    return markdownField;
  }

  // Converts a page-relative content path (e.g. "src/content/<slide>/slide.js") to one relative to
  // the content folder handle that Editor file operations use.
  function contentRelativePath(path) {
    const prefix = `${window.umedContentRoot}/`;
    if (path === window.umedContentRoot) return "";
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }

  // Resolves the folder (relative to the content root handle) that an image block's files
  // belong in, matching the imageBasePath logic in main.js's renderBlock.
  function imageRelativeDir(image) {
    if (image.source === "shared") return "assets/images";
    return contentRelativePath((current && current.assetBasePath) || window.umedContentRoot);
  }

  // Uploads one or more Editor-picked image files into the block's target folder (Slide or
  // shared asset), asking for confirmation on a same-name collision, then appends each uploaded
  // file's name to the block's URL list (deduplicated) and refreshes the live preview.
  function blockImages(block) {
    return Array.isArray(block.images) ? block.images.filter(image => image && image.url) : [];
  }

  function setBlockImages(block, images) {
    block.images = images;
  }

  function isValidRemoteImageUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
    } catch (error) {
      return false;
    }
  }

  async function promptRemoteImageUrl(initialValue) {
    if (!window.umedComponents || typeof window.umedComponents.promptText !== "function") return null;
    let value = initialValue || "";
    while (true) {
      const result = await window.umedComponents.promptText(
        "Enter an absolute https:// image URL.\n\n" + 
        "Loading a remote image requires network access and contacts the third-party image server.\n\n" + 
        "Add proper source attribution in the image Label, Markdown, or a separate Text block.",
        { initialValue: value, confirmLabel: initialValue ? "Update URL" : "Add URL" }
      );
      if (result === null) return null;
      value = result.trim();
      if (isValidRemoteImageUrl(value)) return value;
      alert("Enter an absolute https:// URL without embedded credentials. blob:, data:, http:, and relative URLs are not allowed.");
    }
  }

  async function addRemoteImageUrl(block, rerenderImages) {
    const url = await promptRemoteImageUrl("");
    if (!url) return;
    setBlockImages(block, [...blockImages(block), { source: "url", url }]);
    rerenderImages();
    scheduleRefresh();
  }

  async function editRemoteImageUrl(image, rerenderImages) {
    const url = await promptRemoteImageUrl(image.url);
    if (!url || url === image.url) return;
    image.url = url;
    rerenderImages();
    scheduleRefresh();
  }

  async function removeRemoteImageUrl(image, block, rerenderImages) {
    if (!(await editorConfirm(
      `Remove this remote image URL from the block?\n\n${image.url}`,
      { confirmLabel: "Remove", cancelLabel: "Cancel" }
    ))) return;
    setBlockImages(block, blockImages(block).filter(entry => entry !== image));
    rerenderImages();
    scheduleRefresh();
  }

  function mapSavedBlockCounterparts(data, snapshot, force = false) {
    const liveBlocks = (data.content && data.content.blocks) || [];
    const savedBlocks = (snapshot.content && snapshot.content.blocks) || [];
    liveBlocks.forEach((block, index) => {
      if ((force || !savedBlockCounterparts.has(block)) && savedBlocks[index]) savedBlockCounterparts.set(block, savedBlocks[index]);
    });
  }

  function replaceImageFileName(block, oldImage, newFileName) {
    const images = blockImages(block);
    let replaced = false;
    const updated = images.map(image => {
      if (!replaced && image.source === oldImage.source && image.url === oldImage.url) {
        replaced = true;
        return { ...image, url: newFileName };
      }
      return image;
    });
    if (!replaced) updated.push({ source: oldImage.source, url: newFileName });
    setBlockImages(block, updated);
  }

  // Image pixels and their URL declaration form one filesystem transaction from the
  // Editor's perspective. Persist just that declaration against the last-saved content snapshot;
  // other dirty form fields remain pending for the normal Save Changes workflow.
  async function persistEditedImageReference(rootHandle, info, block, oldImage, newFileName) {
    const data = window.umedAppContent[info.key];
    const snapshot = savedSnapshots.get(info.key);
    if (!data || !snapshot) throw new Error("The saved content baseline is unavailable.");

    const savedBlocks = (snapshot.content && snapshot.content.blocks) || [];
    const savedBlock = savedBlockCounterparts.get(block);
    const savedIndex = savedBlock ? savedBlocks.indexOf(savedBlock) : -1;
    const candidate = JSON.parse(JSON.stringify(snapshot));
    candidate.content = candidate.content || {};
    candidate.content.blocks = candidate.content.blocks || [];

    let candidateBlock;
    if (savedIndex >= 0) {
      candidateBlock = candidate.content.blocks[savedIndex];
      replaceImageFileName(candidateBlock, oldImage, newFileName);
    } else {
      const liveIndex = ((data.content && data.content.blocks) || []).indexOf(block);
      candidateBlock = JSON.parse(JSON.stringify(block));
      candidate.content.blocks.splice(Math.max(0, liveIndex), 0, candidateBlock);
    }

    const updatedAt = new Date().toISOString();
    if (info.kind === "slide") candidate.contentUpdatedAt = updatedAt;
    await window.umedEditorFS.writeTextFile(
      rootHandle,
      contentRelativePath(info.src),
      serializeContentFile(info, candidate)
    );

    snapshot.content = snapshot.content || {};
    snapshot.content.blocks = snapshot.content.blocks || [];
    let persistedBlock;
    if (savedIndex >= 0) {
      persistedBlock = snapshot.content.blocks[savedIndex];
      replaceImageFileName(persistedBlock, oldImage, newFileName);
    } else {
      const liveIndex = ((data.content && data.content.blocks) || []).indexOf(block);
      persistedBlock = JSON.parse(JSON.stringify(block));
      snapshot.content.blocks.splice(Math.max(0, liveIndex), 0, persistedBlock);
    }
    if (info.kind === "slide") {
      snapshot.contentUpdatedAt = updatedAt;
      data.contentUpdatedAt = updatedAt;
    }
    savedBlockCounterparts.set(block, persistedBlock);

    if (JSON.stringify(data) === JSON.stringify(snapshot)) dirtyKeys.delete(info.key);
    else dirtyKeys.add(info.key);
    if (current && current.key === info.key) updateSaveButtonState();
  }

  function imageRelativePath(image, fileName = image.url) {
    const relativeDir = imageRelativeDir(image);
    return relativeDir ? `${relativeDir}/${fileName}` : fileName;
  }

  function imageUnusedPath(image, fileName = image.url) {
    const relativeDir = imageRelativeDir(image);
    return relativeDir ? `${relativeDir}/_unused/${fileName}` : `_unused/${fileName}`;
  }

  function imageVersionLineage(fileName) {
    const dot = fileName.lastIndexOf(".");
    const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
    const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;
    const match = stem.match(/^(.*)_v\d+$/i);
    return { base: (match ? match[1] : stem).toLowerCase(), extension };
  }

  function sameImageVersionLineage(first, second) {
    const a = imageVersionLineage(first);
    const b = imageVersionLineage(second);
    return a.base === b.base && a.extension === b.extension;
  }

  async function editImageFile(image, block, rerenderImages) {
    const fileName = image.url;
    if (!window.umedImageEditor || !window.umedEditorFS) {
      alert("Image editing tools are unavailable.");
      return;
    }
    const info = current;
    if (!info) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    let newFileName = null;
    try {
      newFileName = await window.umedImageEditor.open({
        rootHandle,
        relativeDir: imageRelativeDir(image),
        fileName
      });
      if (!newFileName) return;
      replaceImageFileName(block, image, newFileName);
      await persistEditedImageReference(rootHandle, info, block, image, newFileName);
      rerenderImages();
      if (window.umedApp && typeof window.umedApp.refreshSlide === "function") window.umedApp.refreshSlide();
    } catch (error) {
      console.error(error);
      // The bitmap editor may already have completed its versioned file write before the content
      // declaration write failed. Keep the live filename dirty so Save Changes remains a recovery
      // path instead of silently reverting the UI to the now-archived source filename.
      if (newFileName) scheduleRefresh();
      alert(newFileName
        ? `The edited image was saved as "${newFileName}", but its Slide declaration could not be saved. ` +
          `Use Save Changes to retry recording the new filename.\n\n${error.message}`
        : `Could not edit image "${fileName}": ${error.message}`);
    }
  }

  async function removeImageFile(image, block, rerenderImages) {
    const fileName = image.url;
    const action = await chooseFileRemovalAction(fileName, "image");
    if (!action || !window.umedEditorFS) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    try {
      if (action === "Move to _unused") {
        const unusedPath = imageUnusedPath(image);
        const existing = await window.umedEditorFS.getExistingFile(rootHandle, unusedPath);
        if (existing && !(await editorConfirm(
          `An unused image named "${fileName}" already exists. Replace it?`,
          { confirmLabel: "Replace", cancelLabel: "Cancel" }
        ))) return;
        await window.umedEditorFS.moveFile(rootHandle, imageRelativePath(image), unusedPath);
      } else {
        await window.umedEditorFS.deleteFile(rootHandle, imageRelativePath(image));
      }
      setBlockImages(block, blockImages(block).filter(entry => entry !== image));
      rerenderImages();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      alert(`Could not remove image "${fileName}": ${error.message}`);
    }
  }

  async function restoreImageFile(block, source, rerenderImages) {
    const restoredImage = { source, url: "" };
    if (!window.umedEditorFS || !window.umedComponents || !window.umedComponents.chooseOption) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    const unusedDir = `${imageRelativeDir(restoredImage)}/_unused`.replace(/^\//, "");
    try {
      const names = await window.umedEditorFS.listFiles(rootHandle, unusedDir);
      if (!names.length) {
        alert("There are no unused images to restore.");
        return;
      }
      const fileName = await window.umedComponents.chooseOption("Choose an image to restore:", names);
      if (!fileName) return;
      restoredImage.url = fileName;
      const activePath = imageRelativePath(restoredImage);
      if (await window.umedEditorFS.getExistingFile(rootHandle, activePath)) {
        alert(`An image named "${fileName}" already exists in this location.`);
        return;
      }
      const currentImages = blockImages(block);
      const supersededImages = currentImages.filter(image => image.source === source && sameImageVersionLineage(image.url, fileName));
      const supersededNames = supersededImages.map(image => image.url);
      for (const supersededName of supersededNames) {
        const unusedPath = imageUnusedPath(restoredImage, supersededName);
        if (await window.umedEditorFS.getExistingFile(rootHandle, unusedPath)) {
          alert(`Cannot restore "${fileName}" because _unused already contains "${supersededName}".`);
          return;
        }
      }
      for (const supersededName of supersededNames) {
        await window.umedEditorFS.moveFile(rootHandle, imageRelativePath(restoredImage, supersededName), imageUnusedPath(restoredImage, supersededName));
      }
      await window.umedEditorFS.moveFile(rootHandle, imageUnusedPath(restoredImage), activePath);
      const retainedImages = currentImages.filter(image => !supersededImages.includes(image));
      setBlockImages(block, [...retainedImages, restoredImage]);
      rerenderImages();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      alert(`Could not restore the image: ${error.message}`);
    }
  }

  async function uploadImageFiles(files, block, source, rerenderImages) {
    if (!files.length || !current) return;
    if (!window.umedEditorFS) {
      alert("File system access is unavailable in this browser.");
      return;
    }
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return; // Editor cancelled the folder access prompt.

    const existingImages = blockImages(block);
    const existingNames = existingImages.filter(image => image.source === source).map(image => image.url);
    const namesToAdd = [];
    let wroteFile = false;

    for (const file of files) {
      if (file.type && !file.type.startsWith("image/")) continue; // guard against non-image picks
      const relativePath = imageRelativePath({ source, url: file.name });
      try {
        const existingFile = await window.umedEditorFS.getExistingFile(rootHandle, relativePath);
        let overwrite = true;
        if (existingFile) {
          const message = existingFile.size === file.size
            ? `A file named "${file.name}" already exists here and is the same size \u2014 it looks like the same file. Overwrite it anyway?`
            : `A file named "${file.name}" already exists here but is a different size. Overwrite it with the uploaded file?`;
          overwrite = window.umedComponents && window.umedComponents.confirm
            ? await window.umedComponents.confirm(message, { confirmLabel: "Overwrite", cancelLabel: "Keep existing" })
            : true;
        }
        if (overwrite) {
          await window.umedEditorFS.writeBinaryFile(rootHandle, relativePath, file);
          wroteFile = true;
        }
        // Either way, the target folder now holds a file at this name, so it's safe to reference.
        if (!existingNames.includes(file.name) && !namesToAdd.includes(file.name)) namesToAdd.push(file.name);
      } catch (error) {
        console.error(error);
        alert(`Could not upload "${file.name}": ${error.message}`);
      }
    }

    if (namesToAdd.length) {
      setBlockImages(block, [...existingImages, ...namesToAdd.map(url => ({ source, url }))]);
      rerenderImages();
    }
    if (namesToAdd.length || wroteFile) scheduleRefresh();
  }

  function buildImageFileFields(block, fieldset, getNewImageSource) {
    const list = document.createElement("div");
    list.className = "editor-image-files";

    function rerenderImages() {
      list.replaceChildren();
      blockImages(block).forEach((image, index) => {
        const fileName = image.url;
        const row = document.createElement("div");
        row.className = "editor-image-file-row";
        const handle = document.createElement("span");
        handle.className = "editor-image-file-handle";
        handle.textContent = DRAG_HANDLE_GLYPH;
        handle.title = `Reorder ${fileName}`;
        handle.setAttribute("aria-hidden", "true");
        const name = document.createElement("input");
        name.type = "text";
        name.readOnly = true;
        name.value = fileName;
        name.setAttribute("aria-label", `Image ${index + 1} ${image.source} source`);
        const extension = fileName.split(".").pop().toLowerCase();
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "editor-image-file-edit";
        editButton.innerHTML = (window.umedIcons && window.umedIcons.edit) || "Edit";
        editButton.title = image.source === "url" ? "Edit image URL" : `Edit ${fileName}`;
        editButton.setAttribute("aria-label", image.source === "url" ? `Edit image URL ${fileName}` : `Edit image ${fileName}`);
        editButton.hidden = image.source !== "url" && !["jpg", "jpeg", "png", "webp"].includes(extension);
        editButton.addEventListener("click", () => {
          if (image.source === "url") editRemoteImageUrl(image, rerenderImages);
          else runLockedEditorAction("Edit an image", () => editImageFile(image, block, rerenderImages));
        });
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "editor-image-file-remove";
        removeButton.textContent = "\u00d7";
        removeButton.title = `Remove ${fileName} from this image block`;
        removeButton.setAttribute("aria-label", `Remove image ${fileName}`);
        removeButton.addEventListener("click", () => {
          if (image.source === "url") removeRemoteImageUrl(image, block, rerenderImages);
          else runLockedEditorAction("Remove an image", () => removeImageFile(image, block, rerenderImages));
        });
        row.append(handle, name, editButton, removeButton);
        list.append(row);
      });
    }

    Sortable.create(list, {
      handle: ".editor-image-file-handle",
      animation: 150,
      ghostClass: "editor-image-file-row--ghost",
      chosenClass: "editor-image-file-row--chosen",
      dragClass: "editor-image-file-row--drag",
      onEnd(event) {
        if (event.oldIndex === event.newIndex) return;
        const images = blockImages(block);
        const [moved] = images.splice(event.oldIndex, 1);
        images.splice(event.newIndex, 0, moved);
        setBlockImages(block, images);
        rerenderImages();
        scheduleRefresh();
      }
    });

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = "image/*";
    uploadInput.multiple = true;
    uploadInput.hidden = true;

    const uploadButton = document.createElement("button");
    uploadButton.type = "button";
    uploadButton.className = "editor-add-choice";
    uploadButton.textContent = "Add Image";
    uploadButton.addEventListener("click", () => uploadInput.click());

    uploadInput.addEventListener("change", async () => {
      const files = Array.from(uploadInput.files || []);
      uploadInput.value = ""; // allow re-selecting the same file name to fire change again
      if (files.length) await runLockedEditorAction("Upload images", () => uploadImageFiles(files, block, getNewImageSource(), rerenderImages));
    });

    const dropZone = document.createElement("div");
    dropZone.className = "editor-file-drop-zone";
    const dropHint = document.createElement("span");
    dropHint.className = "editor-file-drop-hint";
    dropHint.textContent = "Drop image files here or";
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "editor-add-choice";
    restoreButton.textContent = "Restore Image";
    restoreButton.addEventListener("click", () => runLockedEditorAction("Restore an image", () => restoreImageFile(block, getNewImageSource(), rerenderImages)));
    const addUrlButton = document.createElement("button");
    addUrlButton.type = "button";
    addUrlButton.className = "editor-add-choice";
    addUrlButton.textContent = "Add URL";
    addUrlButton.addEventListener("click", () => addRemoteImageUrl(block, rerenderImages));
    dropZone.append(list, dropHint, uploadButton, restoreButton, addUrlButton, uploadInput);
    attachFileDropTarget(dropZone, files => runLockedEditorAction("Upload images", () => uploadImageFiles(files, block, getNewImageSource(), rerenderImages)));

    fieldset.append(dropZone);
    rerenderImages();
  }

  function buildBlockFieldset(block, index, blocks, rerender) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "editor-block";
    const collapsed = collapsedBlocks.has(block);
    fieldset.classList.toggle("editor-block--collapsed", collapsed);
    const legend = document.createElement("legend");
    const handle = document.createElement("span");
    handle.className = "editor-block-handle";
    handle.textContent = DRAG_HANDLE_GLYPH;
    handle.setAttribute("aria-hidden", "true");
    const legendLabel = document.createElement("span");
    legendLabel.textContent = block.type === "text" ? `Block ${index + 1}: markdown text`
      : block.type === "instructions" ? `Block ${index + 1}: Agent instructions`
      : block.type === "dataFile" ? `Block ${index + 1}: data file`
      : block.type === "divider" ? `Block ${index + 1}: divider`
      : block.type === "gptFollowup" ? `Block ${index + 1}: GPT follow-up prompts`
      : block.type === "trustedSources" ? `Block ${index + 1}: trusted sources`
      : `Block ${index + 1}: ${block.type}`;
    const collapseToggle = document.createElement("button");
    collapseToggle.type = "button";
    collapseToggle.className = "editor-block-collapse-toggle";
    collapseToggle.title = collapsed ? "Expand block" : "Collapse block";
    collapseToggle.setAttribute("aria-label", collapsed ? "Expand block" : "Collapse block");
    collapseToggle.setAttribute("aria-expanded", String(!collapsed));
    collapseToggle.innerHTML = (window.umedIcons && window.umedIcons.chevron) || "";
    collapseToggle.addEventListener("click", event => {
      const expand = collapsedBlocks.has(block);
      if (event.ctrlKey || event.metaKey) {
        blocks.forEach(currentBlock => {
          if (expand) collapsedBlocks.delete(currentBlock);
          else collapsedBlocks.add(currentBlock);
        });
      } else if (expand) {
        collapsedBlocks.delete(block);
      } else {
        collapsedBlocks.add(block);
      }
      rerender();
    });
    legend.append(handle, legendLabel, collapseToggle);
    fieldset.append(legend);

    if (block.type === "text") {
      const textarea = document.createElement("textarea");
      textarea.value = block.markdown || "";
      textarea.addEventListener("input", () => { block.markdown = textarea.value; scheduleRefresh(); });
      autoSizeTextarea(textarea);
      fieldset.append(textarea);
    } else if (block.type === "instructions") {
      const instructions = document.createElement("textarea");
      instructions.value = block.instructions || "";
      // Retained authoring instructions are not rendered or live-previewed in Learner Mode.
      instructions.addEventListener("input", () => {
        block.instructions = instructions.value;
        markDirty();
      });
      autoSizeTextarea(instructions);
      const sectionInstructions = isSectionLanding();
      fieldset.append(field(sectionInstructions
        ? "Section instructions (for an Agent)"
        : "Slide instructions (for an Agent)", instructions));

      const note = document.createElement("p");
      note.className = "editor-widget-note";
      note.textContent = sectionInstructions
        ? "Section Slides don't update live. Save the Section, then run this prompt in chat:"
        : "Slide content doesn't update live. Save the Slide, then run this prompt in chat:";
      fieldset.append(note);

      const promptCode = document.createElement("code");
      promptCode.className = "editor-widget-prompt";
      const targetKey = current
        ? current.key
        : sectionInstructions ? "<subject>/<category>/<section>" : "<subject>/<category>/<section>/<slide>";
      promptCode.textContent = sectionInstructions
        ? `/fill-or-update-section ${targetKey}`
        : `/fill-or-update-slide ${targetKey}`;

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "editor-icon-button";
      copyButton.title = "Copy prompt to clipboard";
      copyButton.setAttribute("aria-label", "Copy prompt to clipboard");
      copyButton.innerHTML = (window.umedIcons && window.umedIcons.copy) || "";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(promptCode.textContent);
          copyButton.classList.add("editor-icon-button--copied");
          copyButton.title = "Copied!";
          setTimeout(() => {
            copyButton.classList.remove("editor-icon-button--copied");
            copyButton.title = "Copy prompt to clipboard";
          }, 1500);
        } catch (error) {
          console.error(error);
          alert(`Could not copy to clipboard: ${error.message}`);
        }
      });

      const promptRow = document.createElement("div");
      promptRow.className = "editor-widget-prompt-row";
      promptRow.append(promptCode, copyButton);
      fieldset.append(promptRow);
    } else if (block.type === "image") {
      fieldset.append(buildMarkdownField(block));

      const controls = document.createElement("div");
      controls.className = "editor-image-controls";
      let newImageSource = blockImages(block).find(image => image.source !== "url")?.source || "slide";
      const source = document.createElement("select");
      [["slide", "Slide"], ["shared", "Shared"]].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = newImageSource === value;
        source.append(option);
      });
      source.addEventListener("change", () => {
        newImageSource = source.value;
        blockImages(block)
          .filter(image => image.source !== "url")
          .forEach(image => { image.source = newImageSource; });
        scheduleRefresh();
      });
      const sourceField = field("Local image source", source);
      if (window.umedComponents && window.umedComponents.attachTooltip) {
        window.umedComponents.attachTooltip(
          sourceField.querySelector("span"),
          `Slide: /${window.umedContentRoot}/<subject>/<category>/<section>/<slide>/; Shared: /${window.umedContentRoot}/assets/images/`
        );
      }
      controls.append(sourceField);

      const maxWidths = document.createElement("input");
      maxWidths.type = "text";
      maxWidths.value = block.maxWidths || "";
      maxWidths.addEventListener("input", () => { block.maxWidths = maxWidths.value; scheduleRefresh(); });
      const maxWidthsField = field("Max width(s)", maxWidths);
      if (window.umedComponents && window.umedComponents.attachTooltip) {
        window.umedComponents.attachTooltip(
          maxWidthsField.querySelector("span"),
          'Space or comma-delimited CSS max-width values (e.g. "200px, 50%"), one per image file above, or a single value applied to all. Blank or invalid falls back to 50%.'
        );
      }
      controls.append(maxWidthsField);
      controls.append(checkboxField("Center", block.center, checked => {
        block.center = checked;
        scheduleRefresh();
      }));
      fieldset.append(controls);

      buildImageFileFields(block, fieldset, () => newImageSource);

      const label = document.createElement("input");
      label.type = "text";
      label.value = block.label || "";
      label.addEventListener("input", () => { block.label = label.value || null; scheduleRefresh(); });
      fieldset.append(field("Label (optional)", label));
    } else if (block.type === "widget") {
      fieldset.append(buildMarkdownField(block));

      // Declared before the name field so its input/blur handlers below can keep the copyable
      // prompt (built further down) in sync as the widget name changes.
      const promptCode = document.createElement("code");
      promptCode.className = "editor-widget-prompt";
      const updatePrompt = () => {
        const slideKey = current ? current.key : "<subject>/<category>/<section>/<slide>";
        promptCode.textContent = `/create-or-update-widget ${slideKey} ${block.name || "<widget-name>"}`;
      };

      const row = document.createElement("div");
      row.className = "editor-widget-row";

      const name = document.createElement("input");
      name.type = "text";
      name.value = block.name || "";
      name.addEventListener("input", () => { block.name = name.value; updatePrompt(); scheduleRefresh(); });
      // Users can't be trusted to type kebab-case themselves, so it's enforced on blur rather
      // than while typing, to avoid fighting the cursor position on every keystroke.
      name.addEventListener("blur", () => {
        const kebab = toKebabCase(name.value);
        if (kebab === name.value) return;
        name.value = kebab;
        block.name = kebab;
        updatePrompt();
        scheduleRefresh();
      });
      row.append(field("widget-name", name));

      const maxWidth = document.createElement("input");
      maxWidth.type = "text";
      maxWidth.value = block.maxWidth || "";
      maxWidth.addEventListener("input", () => { block.maxWidth = maxWidth.value; scheduleRefresh(); });
      const maxWidthField = field("Max width", maxWidth);
      if (window.umedComponents && window.umedComponents.attachTooltip) {
        window.umedComponents.attachTooltip(
          maxWidthField.querySelector("span"),
          "Raw CSS max-width value (e.g. 90% or 600px) for the widget's wrapper. Blank or invalid falls back to 90%."
        );
      }
      row.append(maxWidthField);
      row.append(checkboxField("Center", block.center, checked => {
        block.center = checked;
        scheduleRefresh();
      }));
      fieldset.append(row);

      const instructions = document.createElement("textarea");
      instructions.value = block.instructions || "";
      // Instructions only feed an Agent working outside the app (see AGENTS.md); there is
      // nothing to live-preview, so this marks the Slide dirty without redrawing it. The
      // timestamp lets that Agent detect whether <widget-name>.js is stale; it is never
      // shown or editable in this UI.
      instructions.addEventListener("input", () => {
        block.instructions = instructions.value;
        block.instructionsUpdatedAt = new Date().toISOString();
        markDirty();
      });
      autoSizeTextarea(instructions);
      fieldset.append(field("Widget instructions (for an Agent)", instructions));

      const note = document.createElement("p");
      note.className = "editor-widget-note";
      note.textContent = "Widgets don't update live. Save the Slide, then run this prompt in chat:";
      fieldset.append(note);

      updatePrompt();
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "editor-icon-button";
      copyButton.title = "Copy prompt to clipboard";
      copyButton.setAttribute("aria-label", "Copy prompt to clipboard");
      copyButton.innerHTML = (window.umedIcons && window.umedIcons.copy) || "";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(promptCode.textContent);
          copyButton.classList.add("editor-icon-button--copied");
          copyButton.title = "Copied!";
          setTimeout(() => {
            copyButton.classList.remove("editor-icon-button--copied");
            copyButton.title = "Copy prompt to clipboard";
          }, 1500);
        } catch (error) {
          console.error(error);
          alert(`Could not copy to clipboard: ${error.message}`);
        }
      });

      const promptRow = document.createElement("div");
      promptRow.className = "editor-widget-prompt-row";
      promptRow.append(promptCode, copyButton);
      fieldset.append(promptRow);
    } else if (block.type === "dataFile") {
      fieldset.append(buildMarkdownField(block));

      const row = document.createElement("div");
      row.className = "editor-datafile-row";

      const name = document.createElement("input");
      name.type = "text";
      name.value = block.name || "";
      name.addEventListener("input", () => { block.name = name.value; scheduleRefresh(); });
      // Mirrors the widget name field: it's a shared identifier widget instructions reference, so
      // it's forced to kebab-case on blur rather than while typing.
      name.addEventListener("blur", () => {
        const kebab = toKebabCase(name.value);
        if (kebab === name.value) return;
        name.value = kebab;
        block.name = kebab;
        scheduleRefresh();
      });
      row.append(field("Data file name", name));

      const extensions = document.createElement("input");
      extensions.type = "text";
      extensions.value = block.extensions || "";
      extensions.addEventListener("input", () => { block.extensions = extensions.value; scheduleRefresh(); });
      const extensionsField = field("Allowed extensions", extensions);
      if (window.umedComponents && window.umedComponents.attachTooltip) {
        window.umedComponents.attachTooltip(extensionsField.querySelector("span"), 'Space or comma-delimited, e.g. "csv, tsv"');
      }
      row.append(extensionsField);
      fieldset.append(row);

      const prompt = document.createElement("input");
      prompt.type = "text";
      prompt.value = block.prompt || "";
      prompt.addEventListener("input", () => { block.prompt = prompt.value; scheduleRefresh(); });
      fieldset.append(field("Upload prompt", prompt));
    } else if (block.type === "link") {
      fieldset.append(buildMarkdownField(block));

      const label = document.createElement("input");
      label.type = "text";
      label.value = block.label || "";
      label.addEventListener("input", () => { block.label = label.value; scheduleRefresh(); });
      fieldset.append(field("Link label", label));

      const url = document.createElement("input");
      url.type = "text";
      url.value = block.url || "";
      url.addEventListener("input", () => { block.url = url.value; scheduleRefresh(); });
      fieldset.append(field("Link URL", url));
    } else if (block.type === "question") {
      buildQuestionBlockFields(block, fieldset, rerender);
    } else if (block.type === "gptFollowup") {
      buildGptFollowupBlockFields(block, fieldset);
    } else if (block.type === "trustedSources" && isSectionLanding()) {
      buildTrustedSourcesBlockFields(block, fieldset);
    } else if (block.type === "divider") {
      const note = document.createElement("p");
      note.className = "editor-widget-note";
      note.textContent = "Renders a horizontal rule to visually separate blocks. No other fields.";
      fieldset.append(note);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "editor-block-remove";
    removeButton.textContent = "X";
    removeButton.setAttribute("aria-label", "Remove block");
    removeButton.addEventListener("click", async () => {
      const confirmed = window.umedComponents && window.umedComponents.confirm
        ? await window.umedComponents.confirm("Remove this block? This cannot be undone.", { confirmLabel: "Remove" })
        : true;
      if (!confirmed) return;
      blocks.splice(index, 1);
      rerender();
      scheduleRefresh();
    });
    fieldset.append(removeButton);

    return fieldset;
  }

  function buildBlocksEditor(data, container) {
    data.content.blocks = data.content.blocks || [];
    const list = document.createElement("div");
    list.className = "editor-blocks";

    function rerender() {
      list.replaceChildren();
      data.content.blocks.forEach((block, index) => {
        list.append(buildBlockFieldset(block, index, data.content.blocks, rerender));
      });
    }
    rerender();
    container.append(list);
    attachBlocksSortable(list, data, rerender);
    container.append(buildAddBlockMenu(data, rerender));
  }

  // Lets Editors drag a block by its grip handle to reorder it. Sortable.js moves the dragged
  // fieldset's DOM node directly; onEnd re-syncs data.content.blocks to match that final order
  // and re-renders so the "Block N" labels stay correct, matching the Slides menu's approach.
  function attachBlocksSortable(list, data, rerender) {
    Sortable.create(list, {
      handle: ".editor-block-handle",
      animation: 150,
      ghostClass: "editor-block--ghost",
      chosenClass: "editor-block--chosen",
      dragClass: "editor-block--drag",
      onEnd(event) {
        if (event.oldIndex === event.newIndex) return;
        const [moved] = data.content.blocks.splice(event.oldIndex, 1);
        data.content.blocks.splice(event.newIndex, 0, moved);
        rerender();
        scheduleRefresh();
      }
    });
  }

  // Single disclosure menu replaces one button per block type; closes itself after a
  // selection and via the document-level click handler registered below on outside clicks.
  function buildAddBlockMenu(data, rerender) {
    const menu = document.createElement("details");
    menu.className = "editor-add-menu";

    const summary = document.createElement("summary");
    summary.textContent = "+ Add block";
    menu.append(summary);

    const list = document.createElement("div");
    list.className = "editor-add-menu-list";
    const columns = [
      [
        ["Text", () => ({ type: "text", markdown: "" })],
        ["Image(s)", () => ({ type: "image", markdown: "", images: [], alt: "", maxWidths: "", center: false, label: null })],
        ["Link", () => ({ type: "link", markdown: "", label: "", url: "" })],
        ["Divider", () => ({ type: "divider" })],
        ["Data File", () => ({ type: "dataFile", markdown: "", name: "", extensions: "", prompt: "" })]
      ],
      [
        ["Instructions", () => ({ type: "instructions", instructions: "" })],
        ["Trusted Sources", () => ({ type: "trustedSources", files: [] })],
        ["Widget", () => ({ type: "widget", markdown: "", name: "", maxWidth: "", center: false, instructions: "" })],
        ["Question", () => ({
          type: "question",
          prompt: "",
          choices: [
            { text: "", correct: true, feedback: "" },
            { text: "", correct: false, feedback: "" },
            { text: "", correct: false, feedback: "" }
          ]
        })],
        ["GPT Follow-up Prompts", () => ({ type: "gptFollowup", questions: [""] })]
      ]
    ];
    columns.forEach(items => {
      const column = document.createElement("div");
      column.className = "editor-add-menu-column";
      items.filter(([label]) => {
        if (label === "Instructions") return isSectionLanding() || isSlide();
        if (label === "Trusted Sources") return isSectionLanding();
        if (["Widget", "Question", "GPT Follow-up Prompts"].includes(label)) return isSlide();
        return true;
      }).forEach(([label, makeBlock]) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = label;
        item.addEventListener("click", () => {
          data.content.blocks.push(makeBlock());
          menu.open = false;
          rerender();
          scheduleRefresh();
        });
        column.append(item);
      });
      if (column.childElementCount) list.append(column);
    });
    menu.append(list);

    return menu;
  }

  // The correct-answer select's option labels need to stay short enough to always fit on one
  // line, so long choice text is trimmed to a fixed character budget rather than relying on CSS.
  const CORRECT_OPTION_TEXT_LENGTH = 40;
  function truncateChoiceText(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return "(no text yet)";
    return trimmed.length > CORRECT_OPTION_TEXT_LENGTH
      ? `${trimmed.slice(0, CORRECT_OPTION_TEXT_LENGTH).trimEnd()}\u2026`
      : trimmed;
  }
  function correctOptionLabel(choice, index) {
    return `${index + 1}. ${truncateChoiceText(choice.text)}`;
  }

  // Mirrors buildBlockFieldset's layout (drag handle in the legend, X remove button top-right)
  // so a Question block's choice list matches the Slide's own block list. Which choice is
  // correct is a single Question-level property (see buildQuestionBlockFields's "Correct answer"
  // select), not a per-choice field, so this fieldset only edits text and feedback. `choices` is
  // the owning Question block's own choices array (a Slide may hold several Question blocks,
  // each with its own independent choice list), not a Slide-level array.
  function buildChoiceFieldset(choice, index, choices, rerender, correctSelect) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "editor-block";
    const legend = document.createElement("legend");
    const handle = document.createElement("span");
    // A distinct class from the outer block handle (".editor-block-handle") keeps this nested
    // choices Sortable's own drag detection from being triggered by the outer blocks Sortable
    // (see attachBlocksSortable's handle option) — both share the same visual style in framework.css.
    handle.className = "editor-choice-handle";
    handle.textContent = DRAG_HANDLE_GLYPH;
    handle.setAttribute("aria-hidden", "true");
    const legendLabel = document.createElement("span");
    legendLabel.textContent = `Choice ${index + 1}`;
    legend.append(handle, legendLabel);
    fieldset.append(legend);

    const text = document.createElement("textarea");
    text.value = choice.text || "";
    text.addEventListener("input", () => {
      choice.text = text.value;
      if (correctSelect.options[index]) correctSelect.options[index].textContent = correctOptionLabel(choice, index);
      scheduleRefresh();
    });
    autoSizeTextarea(text);
    fieldset.append(field("Choice text", text));

    const feedback = document.createElement("textarea");
    feedback.value = choice.feedback || "";
    feedback.addEventListener("input", () => { choice.feedback = feedback.value; scheduleRefresh(); });
    autoSizeTextarea(feedback);
    const feedbackField = field("Feedback", feedback);
    if (window.umedComponents && window.umedComponents.attachTooltip) {
      window.umedComponents.attachTooltip(
        feedbackField.querySelector("span"),
        '"Correct." or "Incorrect." is prefixed automatically \u2014 no need to type it here.'
      );
    }
    fieldset.append(feedbackField);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "editor-block-remove";
    removeButton.textContent = "X";
    removeButton.setAttribute("aria-label", "Remove choice");
    removeButton.disabled = choices.length <= 2;
    removeButton.addEventListener("click", () => {
      const wasCorrect = choice.correct;
      choices.splice(index, 1);
      if (wasCorrect && choices.length) choices[0].correct = true;
      rerender();
      scheduleRefresh();
    });
    fieldset.append(removeButton);

    return fieldset;
  }

  // Same Sortable.js approach as attachBlocksSortable: reorders the Question block's own
  // `choices` array to match the drag result, then re-renders so "Choice N" labels and the
  // correct-answer select stay in sync. Scoped to `.editor-choice-handle` (see buildChoiceFieldset)
  // so dragging a choice never gets mistaken by the outer blocks Sortable for dragging the whole
  // Question block.
  function attachChoicesSortable(list, choices, rerender) {
    Sortable.create(list, {
      handle: ".editor-choice-handle",
      animation: 150,
      ghostClass: "editor-block--ghost",
      chosenClass: "editor-block--chosen",
      dragClass: "editor-block--drag",
      onEnd(event) {
        if (event.oldIndex === event.newIndex) return;
        const [moved] = choices.splice(event.oldIndex, 1);
        choices.splice(event.newIndex, 0, moved);
        rerender();
        scheduleRefresh();
      }
    });
  }

  // Follow-up prompts are short, ordered questions appended to GPT requests. Unlike multiple-
  // choice answers they need no correctness state, so a compact auto-sizing textarea list is more
  // useful than a nested sortable editor. The block itself can still be moved in the outer list.
  function buildGptFollowupBlockFields(block, fieldset) {
    block.questions = Array.isArray(block.questions) && block.questions.length ? block.questions : [""];
    const list = document.createElement("div");
    list.className = "editor-gpt-followup-questions";

    function rerenderQuestions() {
      list.replaceChildren();
      block.questions.forEach((question, index) => {
        const textarea = document.createElement("textarea");
        textarea.value = question || "";
        textarea.addEventListener("input", () => {
          block.questions[index] = textarea.value;
          scheduleRefresh();
        });
        autoSizeTextarea(textarea);

        const questionField = field(`Follow-up prompt ${index + 1}`, textarea);
        const questionRow = document.createElement("div");
        questionRow.className = "editor-gpt-followup-row";
        questionRow.append(questionField);
        if (block.questions.length > 1) {
          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "editor-block-remove editor-gpt-followup-remove";
          removeButton.textContent = "×";
          removeButton.setAttribute("aria-label", `Remove follow-up prompt ${index + 1}`);
          removeButton.addEventListener("click", () => {
            block.questions.splice(index, 1);
            rerenderQuestions();
            scheduleRefresh();
          });
          questionRow.append(removeButton);
        }
        list.append(questionRow);
      });
    }

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "editor-add-choice";
    addButton.textContent = "Add Follow-up Prompt";
    addButton.addEventListener("click", () => {
      block.questions.push("");
      rerenderQuestions();
      scheduleRefresh();
    });

    fieldset.append(list, addButton);
    rerenderQuestions();
  }

  // Builds a Question block's own fields (prompt, correct-answer select, and its nested sortable
  // choice list) directly inside that block's fieldset, alongside the shared remove-block button
  // buildBlockFieldset appends for every block type. `rerenderBlock` is the enclosing Slide's
  // blocks-list rerender, used only when removing a choice would leave the block's own structure
  // needing a fresh legend/label; day-to-day choice edits use this function's own local
  // `rerenderChoices` instead, so unrelated blocks elsewhere on the Slide aren't rebuilt.
  function buildQuestionBlockFields(block, fieldset, rerenderBlock) {
    block.choices = block.choices || [];

    const promptInput = document.createElement("textarea");
    promptInput.value = block.prompt || "";
    promptInput.addEventListener("input", () => { block.prompt = promptInput.value; scheduleRefresh(); });
    autoSizeTextarea(promptInput);
    fieldset.append(field("Question prompt", promptInput));

    // A Question has exactly one correct answer, so it's a single select here rather than a
    // radio button repeated on every choice fieldset below.
    const correctSelect = document.createElement("select");
    correctSelect.addEventListener("change", () => {
      const correctIndex = Number(correctSelect.value);
      block.choices.forEach((choice, index) => { choice.correct = index === correctIndex; });
      scheduleRefresh();
    });
    fieldset.append(field("Correct answer", correctSelect));

    function refreshCorrectSelect() {
      correctSelect.replaceChildren();
      block.choices.forEach((choice, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = correctOptionLabel(choice, index);
        option.selected = !!choice.correct;
        correctSelect.append(option);
      });
    }

    // The inner sortable list of choices, nested inside this Question block's own fieldset, which
    // is itself one draggable item within the Slide's outer sortable list of blocks.
    const choicesList = document.createElement("div");
    choicesList.className = "editor-blocks editor-choices";
    fieldset.append(choicesList);

    const addChoiceButton = document.createElement("button");
    addChoiceButton.type = "button";
    addChoiceButton.textContent = "Add choice";
    addChoiceButton.className = "editor-add-choice";
    addChoiceButton.addEventListener("click", () => {
      if (block.choices.length >= 5) return;
      block.choices.push({ text: "", correct: false, feedback: "" });
      rerenderChoices();
      scheduleRefresh();
    });
    fieldset.append(addChoiceButton);

    function rerenderChoices() {
      choicesList.replaceChildren();
      block.choices.forEach((choice, index) => {
        choicesList.append(buildChoiceFieldset(choice, index, block.choices, rerenderChoices, correctSelect));
      });
      addChoiceButton.disabled = block.choices.length >= 5;
      refreshCorrectSelect();
    }
    attachChoicesSortable(choicesList, block.choices, rerenderChoices);
    rerenderChoices();
  }

  function buildForm(info) {
    const data = window.umedAppContent[info.key];
    if (!data) return;
    pane.replaceChildren();
    pane.scrollTop = 0;

    const toolbar = document.createElement("div");
    toolbar.className = "editor-toolbar";

    const deleteKind = resolveDeleteKind(info);
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    if (deleteKind === "subject") {
      deleteButton.textContent = "Delete Subject";
      const subject = findSubjectEntry(info.key);
      deleteButton.disabled = !subject || (subject.categories || []).length > 0;
    } else if (deleteKind === "category") {
      deleteButton.textContent = "Delete Category";
      const [subjectId, categoryId] = info.key.split("/");
      const category = findCategoryEntry(subjectId, categoryId);
      deleteButton.disabled = !category || (category.sections || []).length > 0;
    } else if (deleteKind === "section") {
      deleteButton.textContent = "Delete Section";
      const [subjectId, categoryId, sectionId] = info.key.split("/");
      const section = findSectionEntry(subjectId, categoryId, sectionId);
      deleteButton.disabled = !section || (section.slides || []).length > 0;
    } else if (deleteKind === "slide") {
      deleteButton.textContent = "Delete Slide";
    } else {
      // The App landing and error Slides can never be deleted; dashes mark the button as
      // intentionally inert while keeping the toolbar layout stable.
      deleteButton.textContent = "-----";
      deleteButton.title = "This page cannot be deleted";
      deleteButton.setAttribute("aria-label", "Delete is not available for this page");
      deleteButton.disabled = true;
    }
    deleteButton.addEventListener("click", () => runLockedEditorAction(`Delete a ${deleteKind || "content item"}`, () => handleDelete(info, deleteButton, deleteKind)));
    toolbar.append(deleteButton);

    const createdSnapshot = !savedSnapshots.has(info.key);
    if (createdSnapshot) savedSnapshots.set(info.key, JSON.parse(JSON.stringify(data)));
    // While content is dirty, newly added blocks deliberately have no saved counterpart. Do not
    // infer one by array position after navigation, because an unsaved insertion or reorder may
    // have shifted every later index.
    if (createdSnapshot || !dirtyKeys.has(info.key)) mapSavedBlockCounterparts(data, savedSnapshots.get(info.key));

    const discardButton = document.createElement("button");
    discardButton.type = "button";
    discardButton.className = "discard-button";
    discardButton.textContent = "Discard Changes";
    discardButton.disabled = !dirtyKeys.has(info.key);
    discardButton.addEventListener("click", () => handleDiscard(info));
    toolbar.append(discardButton);
    currentDiscardButton = discardButton;

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "save-button";
    saveButton.textContent = "Save Changes";
    saveButton.title = "Ctrl-click (Cmd-click on Mac) to save pending changes on all Slides";
    saveButton.disabled = !dirtyKeys.has(info.key);
    saveButton.addEventListener("click", event => runLockedEditorAction("Save content changes", () => handleSave(info, saveButton, event.ctrlKey || event.metaKey)));
    toolbar.append(saveButton);
    currentSaveButton = saveButton;

    pane.append(toolbar);

    const form = document.createElement("div");
    form.className = "editor-form";
    pane.append(form);

    const contentSection = document.createElement("div");

    function renderContentSection() {
      contentSection.replaceChildren();
      buildBlocksEditor(data, contentSection);
    }

    form.append(buildMetaFields(data));
    form.append(contentSection);
    renderContentSection();
  }

  // The manifest duplicates titles used by sidebar/search and Slide navigation metadata. Every
  // saved content object therefore reconciles the corresponding manifest record. Keys are the
  // content path: <subject>, <subject>/<category>, <subject>/<category>/<section>, or for a
  // Slide <subject>/<category>/<section>/<slide>.
  function syncIndexEntry(key, data, kind) {
    const index = window.umedAppContentIndex;
    if (!index) return;
    const path = key.split("/");
    if (kind === "overview") {
      const entry = path.length === 1 ? findSubjectEntry(path[0])
        : path.length === 2 ? findCategoryEntry(path[0], path[1])
        : path.length === 3 ? findSectionEntry(path[0], path[1], path[2])
        : null;
      if (entry) {
        entry.uuid = data.uuid;
        entry.title = data.title;
      }
      return;
    }
    if (kind !== "slide" || path.length !== 4) return;
    const section = findSectionEntry(path[0], path[1], path[2]);
    const entry = section && (section.slides || []).find(slide => slide.id === path[3]);
    if (entry) {
      entry.uuid = data.uuid;
      entry.title = data.title;
      entry.level = data.level;
      entry.order = data.order;
    }
  }

  // `contentUpdatedAt` tracks only material a Learner can see. Widget instructions and retained
  // Slide instructions are authoring state with their own workflows and must not make keyword
  // metadata look stale.
  function learnerFacingSignature(data) {
    const visibleBlocks = ((data.content && data.content.blocks) || [])
      .filter(block => block.type !== "instructions")
      .map(block => {
        if (block.type !== "widget") return block;
        const { instructions, instructionsUpdatedAt, ...learnerFacingWidget } = block;
        return learnerFacingWidget;
      });
    return JSON.stringify({ title: data.title || "", blocks: visibleBlocks });
  }

  function serializeContentFile(info, data) {
    if (info.kind === "slide") {
      const path = info.key.split("/");
      if (path.length !== 4 || !path[3]) throw new Error(`Cannot serialize a Slide with invalid key: ${info.key}`);
      data.id = path[3];
    }
    for (const block of (data.content && data.content.blocks) || []) {
      if ((block.type === "widget" || block.type === "dataFile") && block.name) block.name = toKebabCase(block.name);
    }
    const assignment = `window.umedAppContent[${JSON.stringify(info.key)}] = ${JSON.stringify(data, null, 2)};\n`;
    return info.kind === "slide" ? `window.umedAppContent = window.umedAppContent || {};\n${assignment}` : assignment;
  }

  // Loads a Slide's content object into window.umedAppContent if it isn't already there (e.g. a
  // Slide that isn't the one currently on screen), so its on-disk order/level can be kept in
  // sync after a Slides menu drag-and-drop reorder without disturbing any unsaved edits already
  // held in memory for a Slide that is currently loaded.
  function loadSlideContent(key, src) {
    if (window.umedAppContent[key]) return Promise.resolve(window.umedAppContent[key]);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve(window.umedAppContent[key]);
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(script);
    });
  }

  // Writes updated order/level values (from window.umedAppContentIndex, already mutated by the
  // Slides menu's drag-and-drop handler in main.js) back to each affected Slide's own slide.js
  // file, keeping in-memory unsaved edits for any currently-open Slide intact.
  async function writeSlideOrderFiles(rootHandle, subjectId, categoryId, sectionId, slideIndexEntries) {
    for (const entry of slideIndexEntries) {
      const key = `${subjectId}/${categoryId}/${sectionId}/${entry.id}`;
      const src = `${window.umedContentRoot}/${key}/slide.js`;
      const data = await loadSlideContent(key, src);
      if (!data) continue;
      data.order = entry.order;
      data.level = entry.level;
      await window.umedEditorFS.writeTextFile(rootHandle, `${key}/slide.js`, serializeContentFile({ kind: "slide", key }, data));
      savedSnapshots.set(key, JSON.parse(JSON.stringify(data)));
      if (dirtyKeys.delete(key) && current && current.key === key) updateSaveButtonState();
    }
  }

  async function writeIndexFile(rootHandle) {
    const indexContent = `window.umedAppContentIndex = ${JSON.stringify(window.umedAppContentIndex, null, 2)};\n`;
    await window.umedEditorFS.writeTextFile(rootHandle, "content-index.js", indexContent);
  }

  async function persistSlideOrder(subjectId, categoryId, sectionId, slideIndexEntries) {
    if (!window.umedEditorFS || !slideIndexEntries.length) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return; // Editor cancelled the folder prompt; index stays updated in memory only.

    await writeSlideOrderFiles(rootHandle, subjectId, categoryId, sectionId, slideIndexEntries);
    await writeIndexFile(rootHandle);
  }

  // Creates a new Slide's slide.js file (initial content built by main.js's "+" button in the
  // Slides menu) and rewrites any other Slides whose order/level shifted to make room for it.
  async function createSlide(subjectId, categoryId, sectionId, data, otherChangedEntries) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    const key = `${subjectId}/${categoryId}/${sectionId}/${data.id}`;
    data.contentUpdatedAt = new Date().toISOString();
    window.umedAppContent[key] = data;
    await window.umedEditorFS.writeTextFile(rootHandle, `${key}/slide.js`, serializeContentFile({ kind: "slide", key }, data));
    await writeSlideOrderFiles(rootHandle, subjectId, categoryId, sectionId, otherChangedEntries);
    await writeIndexFile(rootHandle);
  }

  // Subject/Category/Section order and ids live only in content-index.js; their UUIDs and titles
  // are mirrored in their landing files. Reordering hierarchy entries still only rewrites the
  // index because neither stable identity nor learner-facing content changes.
  async function persistIndex() {
    if (!window.umedEditorFS) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return; // Editor cancelled the folder prompt; index stays updated in memory only.
    await writeIndexFile(rootHandle);
  }

  // Moves an entire Section between Category folders of one Subject, including assets, trusted
  // source files, Slides, and widgets. The copied JavaScript files are rekeyed before the
  // manifest is saved; only then is the original folder removed. Unsaved content could not be
  // represented by that disk copy, so require the Editor to save or discard it first.
  async function moveSection(subjectId, fromCategoryId, toCategoryId, sectionId) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const oldPrefix = `${subjectId}/${fromCategoryId}/${sectionId}`;
    const newPrefix = `${subjectId}/${toCategoryId}/${sectionId}`;
    if ([...dirtyKeys].some(key => key === oldPrefix || key.startsWith(`${oldPrefix}/`))) {
      throw new Error("Save or discard changes in this Section before moving it.");
    }
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    // Same path-length preflight as splitSection: a longer destination Category id can push an
    // already-borderline path (common in a deeply nested, e.g. Dropbox/OneDrive-synced, project
    // folder) over this file system's limit.
    const prospectivePaths = (await window.umedEditorFS.listFilesRecursive(rootHandle, oldPrefix))
      .map(suffix => `${newPrefix}/${suffix}`);
    await window.umedEditorFS.checkPathBudget(rootHandle, prospectivePaths);

    let copied = false;
    try {
      await window.umedEditorFS.copyDirectory(rootHandle, oldPrefix, newPrefix);
      copied = true;
      await window.umedEditorFS.replaceTextInJavaScriptFiles(rootHandle, newPrefix, oldPrefix, newPrefix);
      await writeIndexFile(rootHandle);
    } catch (error) {
      // The source remains intact until the manifest is saved. Remove a partial copy so a failed
      // move does not leave an unindexed duplicate that can confuse later validation.
      if (copied) {
        try { await window.umedEditorFS.deleteDirectory(rootHandle, newPrefix); } catch (cleanupError) { console.error(cleanupError); }
      }
      throw error;
    }

    try {
      await window.umedEditorFS.deleteDirectory(rootHandle, oldPrefix);
      return null;
    } catch (error) {
      // The new folder and manifest are already valid. Preserve that successful state rather
      // than reporting a failed move and rolling the in-memory manifest back to its old path.
      console.error(error);
      return "The Section was moved, but the original folder could not be removed. Remove the duplicate folder after verifying the moved Section.";
    }
  }

  // Creates a new Subject's subject.js landing file (from the Subject menu's "+" button) and
  // updates content-index.js, which main.js has already mutated in memory.
  async function createSubject(subjectId, data) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    window.umedAppContent[subjectId] = data;
    await window.umedEditorFS.writeTextFile(rootHandle, `${subjectId}/subject.js`, serializeContentFile({ kind: "overview", key: subjectId }, data));
    await writeIndexFile(rootHandle);
  }

  // Creates a new Category's category.js overview file (from the sidebar's "+" button) and
  // updates content-index.js, which main.js has already mutated in memory.
  async function createCategory(subjectId, categoryId, data) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    const key = `${subjectId}/${categoryId}`;
    window.umedAppContent[key] = data;
    await window.umedEditorFS.writeTextFile(rootHandle, `${key}/category.js`, serializeContentFile({ kind: "overview", key }, data));
    await writeIndexFile(rootHandle);
  }

  // Creates a new Section's section.js overview file (from the sidebar's "+" button) and updates
  // content-index.js, which main.js has already mutated in memory.
  async function createSection(subjectId, categoryId, sectionId, data) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    const key = `${subjectId}/${categoryId}/${sectionId}`;
    window.umedAppContent[key] = data;
    await window.umedEditorFS.writeTextFile(rootHandle, `${key}/section.js`, serializeContentFile({ kind: "overview", key }, data));
    await writeIndexFile(rootHandle);
  }

  // Splits a Section at a Slides menu insertion point: creates the new Section's section.js
  // landing file (from the Slide dialog's "section break" option), moves the given Slides'
  // folders (with their assets and widgets) from the current Section into it, and saves the
  // manifest that main.js has already mutated in memory. As in moveSection, originals are removed
  // only after the manifest is saved, and a partial copy is removed if anything fails first.
  async function splitSection(subjectId, categoryId, fromSectionId, newSectionId, landingData, movedSlides) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const oldPrefix = `${subjectId}/${categoryId}/${fromSectionId}`;
    const newPrefix = `${subjectId}/${categoryId}/${newSectionId}`;
    if (movedSlides.some(slide => dirtyKeys.has(`${oldPrefix}/${slide.id}`))) {
      throw new Error("Save or discard changes to the Slides being moved before adding a section break.");
    }
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");
    if (await window.umedEditorFS.directoryExists(rootHandle, newPrefix)) {
      throw new Error(`Folder "${newPrefix}" already exists.`);
    }

    // Preflight: refuse immediately, with a clear and actionable message, if any moved Slide's
    // files would land at a path too long for this computer's file system -- a real risk for a
    // deeply nested project folder (e.g. inside a Dropbox or OneDrive synced folder), since
    // moving into a longer Section name can push already-borderline paths over the edge. Without
    // this, the same failure only surfaces after a long, confusing retry-then-fail during the
    // real copy below.
    const totalSteps = movedSlides.length * 3 + 2;
    let completedSteps = 0;
    const progress = window.umedComponents && window.umedComponents.showProgress
      ? window.umedComponents.showProgress(
          "Adding Section Break",
          movedSlides.length ? `Checking Slide 1 of ${movedSlides.length}\u2026` : "Creating the new Section\u2026",
          { max: totalSteps }
        )
      : null;
    const updateProgress = message => progress && progress.update({ message, value: completedSteps });
    try {
      const prospectivePaths = [];
      for (let index = 0; index < movedSlides.length; index += 1) {
        const slide = movedSlides[index];
        updateProgress(`Checking Slide ${index + 1} of ${movedSlides.length}: ${slide.title}`);
        const suffixes = await window.umedEditorFS.listFilesRecursive(rootHandle, `${oldPrefix}/${slide.id}`);
        for (const suffix of suffixes) prospectivePaths.push(`${newPrefix}/${slide.id}/${suffix}`);
        completedSteps += 1;
      }
      await window.umedEditorFS.checkPathBudget(rootHandle, prospectivePaths);

      updateProgress("Creating the new Section\u2026");
      await window.umedEditorFS.writeTextFile(rootHandle, `${newPrefix}/section.js`, serializeContentFile({ kind: "overview", key: newPrefix }, landingData));
      completedSteps += 1;
      for (let index = 0; index < movedSlides.length; index += 1) {
        const slide = movedSlides[index];
        updateProgress(`Moving Slide ${index + 1} of ${movedSlides.length}: ${slide.title}`);
        await window.umedEditorFS.copyDirectory(rootHandle, `${oldPrefix}/${slide.id}`, `${newPrefix}/${slide.id}`);
        await window.umedEditorFS.replaceTextInJavaScriptFiles(rootHandle, `${newPrefix}/${slide.id}`, `${oldPrefix}/${slide.id}`, `${newPrefix}/${slide.id}`);
        completedSteps += 1;
      }
      updateProgress("Saving the updated content index\u2026");
      await writeIndexFile(rootHandle);
      completedSteps += 1;
    } catch (error) {
      console.error(`[splitSection] FAILED: ${error && error.name}: ${error && error.message}`, error);
      updateProgress("The operation failed. Cleaning up the incomplete Section\u2026");
      try { await window.umedEditorFS.deleteDirectory(rootHandle, newPrefix); } catch (cleanupError) { console.error(cleanupError); }
      if (progress) progress.close();
      throw error;
    }

    window.umedAppContent[newPrefix] = landingData;
    const failedRemovals = [];
    for (let index = 0; index < movedSlides.length; index += 1) {
      const slide = movedSlides[index];
      const oldKey = `${oldPrefix}/${slide.id}`;
      updateProgress(`Removing original Slide ${index + 1} of ${movedSlides.length}: ${slide.title}`);
      delete window.umedAppContent[oldKey];
      savedSnapshots.delete(oldKey);
      contentInfoByKey.delete(oldKey);
      try {
        await window.umedEditorFS.deleteDirectory(rootHandle, oldKey);
      } catch (error) {
        console.error(error);
        failedRemovals.push(oldKey);
      }
      completedSteps += 1;
    }
    if (progress) progress.close();
    return failedRemovals.length
      ? `The Section was split, but these original Slide folders could not be removed: ${failedRemovals.join(", ")}. Remove the duplicates after verifying the new Section.`
      : null;
  }

  async function persistContent(rootHandle, info) {
    const data = window.umedAppContent[info.key];
    if (!data) throw new Error(`Content is unavailable for ${info.key}.`);

    const savedData = savedSnapshots.get(info.key);
    if (info.kind === "slide" && (!savedData || learnerFacingSignature(savedData) !== learnerFacingSignature(data))) {
      data.contentUpdatedAt = new Date().toISOString();
    }

    const relativePath = contentRelativePath(info.src);
    await window.umedEditorFS.writeTextFile(rootHandle, relativePath, serializeContentFile(info, data));

    syncIndexEntry(info.key, data, info.kind);
    if (info.kind === "slide" || info.kind === "overview") await writeIndexFile(rootHandle);

    dirtyKeys.delete(info.key);
    const savedSnapshot = JSON.parse(JSON.stringify(data));
    savedSnapshots.set(info.key, savedSnapshot);
    mapSavedBlockCounterparts(data, savedSnapshot, true);
  }

  async function handleSave(info, button, saveAllSlides = false) {
    if (!window.umedEditorFS) return;
    const infos = saveAllSlides
      ? [...dirtyKeys]
        .map(key => contentInfoByKey.get(key))
        .filter(candidate => candidate && (candidate.kind === "slide" || candidate.kind === "overview"))
      : [info];
    if (!infos.length) return;

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = infos.length > 1 ? `Saving ${infos.length} Slides\u2026` : "Saving\u2026";
    try {
      const rootHandle = await window.umedEditorFS.getContentRootHandle();
      if (!rootHandle) return; // Editor cancelled the folder prompt; leave changes pending.

      const failures = [];
      for (const candidate of infos) {
        try {
          await persistContent(rootHandle, candidate);
        } catch (error) {
          console.error(error);
          failures.push(`${candidate.key}: ${error.message}`);
        }
      }
      if (window.umedApp && typeof window.umedApp.refreshNavigation === "function") {
        window.umedApp.refreshNavigation();
      }
      if (failures.length) {
        alert(`Could not save changes to ${failures.length} Slide${failures.length === 1 ? "" : "s"}:\n\n${failures.join("\n")}`);
      }
    } catch (error) {
      console.error(error);
      alert(`Could not save changes: ${error.message}`);
    } finally {
      button.textContent = originalLabel;
      updateSaveButtonState();
    }
  }

  // Reverts the in-memory content object to the last-saved (or first-seen-this-session) snapshot
  // and rebuilds the form/preview from it, discarding any unsaved edits.
  async function handleDiscard(info) {
    const snapshot = savedSnapshots.get(info.key);
    if (!snapshot || !dirtyKeys.has(info.key)) return;
    const confirmed = window.umedComponents && window.umedComponents.confirm
      ? await window.umedComponents.confirm("Discard unsaved changes to this Slide?", { confirmLabel: "Discard", cancelLabel: "Cancel" })
      : true;
    if (!confirmed) return;

    window.umedAppContent[info.key] = JSON.parse(JSON.stringify(snapshot));
    dirtyKeys.delete(info.key);
    buildForm(info);
    if (window.umedApp && typeof window.umedApp.refreshSlide === "function") window.umedApp.refreshSlide();
  }

  function findSubjectEntry(subjectId) {
    const index = window.umedAppContentIndex;
    return index && (index.subjects || []).find(subject => subject.id === subjectId);
  }

  function findCategoryEntry(subjectId, categoryId) {
    const subject = findSubjectEntry(subjectId);
    return subject && (subject.categories || []).find(category => category.id === categoryId);
  }

  function findSectionEntry(subjectId, categoryId, sectionId) {
    const category = findCategoryEntry(subjectId, categoryId);
    return category && (category.sections || []).find(section => section.id === sectionId);
  }

  const hierarchySorted = items => (items || []).slice().sort((a, b) => a.order - b.order);

  function moveDestinations(kind, path) {
    const subjects = hierarchySorted(window.umedAppContentIndex && window.umedAppContentIndex.subjects);
    if (kind === "category") {
      return subjects.map(subject => ({
        label: subject.title,
        value: [subject.id],
        current: subject.id === path[0],
        disabled: subject.id !== path[0] && (subject.categories || []).some(category => category.id === path[1])
      }));
    }
    if (kind === "section") {
      return subjects.map(subject => ({
        label: subject.title,
        children: hierarchySorted(subject.categories).map(category => ({
          label: category.title,
          value: [subject.id, category.id],
          current: subject.id === path[0] && category.id === path[1],
          disabled: !(subject.id === path[0] && category.id === path[1]) &&
            (category.sections || []).some(section => section.id === path[2])
        }))
      }));
    }
    return subjects.map(subject => ({
      label: subject.title,
      children: hierarchySorted(subject.categories).map(category => ({
        label: category.title,
        children: hierarchySorted(category.sections).map(section => ({
          label: section.title,
          value: [subject.id, category.id, section.id],
          current: subject.id === path[0] && category.id === path[1] && section.id === path[2],
          disabled: !(subject.id === path[0] && category.id === path[1] && section.id === path[2]) &&
            (section.slides || []).some(slide => slide.id === path[3])
        }))
      }))
    }));
  }

  function appendMoveTreeItem(list, item, name) {
    const li = document.createElement("li");
    if (item.value) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = item.value.join("/");
      input.checked = item.current;
      input.disabled = item.disabled;
      const text = document.createElement("span");
      text.dataset.label = item.label;
      text.dataset.current = String(item.current);
      text.dataset.collision = String(item.disabled);
      text.textContent = `${item.label}${item.current ? " (current)" : item.disabled ? " (name already in use)" : ""}`;
      label.append(input, text);
      li.append(label);
    } else {
      const heading = document.createElement("strong");
      heading.textContent = item.label;
      li.append(heading);
    }
    if (item.children && item.children.length) {
      const childList = document.createElement("ul");
      item.children.forEach(child => appendMoveTreeItem(childList, child, name));
      li.append(childList);
    }
    list.append(li);
  }

  function promptMoveDestination(kind, path) {
    const parentKind = { category: "Subject", section: "Category", slide: "Section" }[kind];
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog move-dialog";
    const instructions = document.createElement("p");
    instructions.className = "confirm-dialog-message";
    instructions.textContent = `Select a new ${parentKind} for this ${kind[0].toUpperCase()}${kind.slice(1)}.`;
    const tree = document.createElement("ul");
    tree.className = "move-dialog-tree";
    const radioName = `move-destination-${Date.now()}`;
    moveDestinations(kind, path).forEach(item => appendMoveTreeItem(tree, item, radioName));
    const copyLabel = document.createElement("label");
    copyLabel.className = "move-dialog-copy";
    const copyInput = document.createElement("input");
    copyInput.type = "checkbox";
    const copyText = document.createElement("span");
    copyText.textContent = "Make a copy";
    copyLabel.append(copyInput, copyText);
    const actions = document.createElement("div");
    actions.className = "confirm-dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const move = document.createElement("button");
    move.type = "button";
    move.className = "confirm-dialog-confirm";
    move.textContent = `Move ${kind[0].toUpperCase()}${kind.slice(1)}`;
    tree.querySelectorAll("input[type='radio']").forEach(input => {
      input.dataset.moveDisabled = String(input.disabled);
    });
    copyInput.addEventListener("change", () => {
      move.textContent = `${copyInput.checked ? "Copy" : "Move"} ${kind[0].toUpperCase()}${kind.slice(1)}`;
      tree.querySelectorAll("input[type='radio']").forEach(input => {
        input.disabled = copyInput.checked ? false : input.dataset.moveDisabled === "true";
        const text = input.nextElementSibling;
        if (!text) return;
        const suffix = text.dataset.current === "true" ? " (current)"
          : text.dataset.collision === "true" ? (copyInput.checked ? " (copy gets a new name)" : " (name already in use)")
          : "";
        text.textContent = `${text.dataset.label}${suffix}`;
      });
    });
    actions.append(cancel, move);
    dialog.append(instructions, tree, copyLabel, actions);
    document.body.append(dialog);

    return new Promise(resolve => {
      let completed = false;
      const finish = result => {
        if (completed) return;
        completed = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(result);
      };
      cancel.addEventListener("click", () => finish(null));
      move.addEventListener("click", () => {
        const selected = tree.querySelector(`input[name="${radioName}"]:checked`);
        finish(selected ? { destination: selected.value.split("/"), copy: copyInput.checked } : null);
      });
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      dialog.addEventListener("close", () => finish(null));
      dialog.showModal();
    });
  }

  function restoreIndex(snapshot) {
    const target = window.umedAppContentIndex;
    Object.keys(target).forEach(key => { delete target[key]; });
    Object.assign(target, snapshot);
  }

  function nextOrder(items) {
    return (items || []).reduce((maximum, item) => Math.max(maximum, Number(item.order) || 0), 0) + 10;
  }

  function uniqueCopyId(id, items) {
    const existing = new Set((items || []).map(item => item.id));
    if (!existing.has(id)) return id;
    for (let number = 2; number < 10000; number += 1) {
      const suffix = `-${number}`;
      const candidate = `${id.slice(0, 20 - suffix.length)}${suffix}`;
      if (!existing.has(candidate)) return candidate;
    }
    throw new Error(`Could not create a unique copy name for "${id}".`);
  }

  function freshUuid() {
    if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
      throw new Error("UUID generation is unavailable in this browser.");
    }
    return window.crypto.randomUUID();
  }

  function renewCopiedUuids(item, kind, uuidMap) {
    const oldUuid = item.uuid;
    item.uuid = freshUuid();
    if (oldUuid) uuidMap.set(oldUuid, item.uuid);
    if (kind === "category") {
      (item.sections || []).forEach(section => renewCopiedUuids(section, "section", uuidMap));
    } else if (kind === "section") {
      (item.slides || []).forEach(slide => renewCopiedUuids(slide, "slide", uuidMap));
    }
  }

  function applyMoveToIndex(kind, path, destination) {
    if (kind === "category") {
      const source = findSubjectEntry(path[0]);
      const target = findSubjectEntry(destination[0]);
      const item = source.categories.find(category => category.id === path[1]);
      source.categories = source.categories.filter(category => category !== item);
      item.order = nextOrder(target.categories);
      target.categories.push(item);
      return;
    }
    if (kind === "section") {
      const source = findCategoryEntry(path[0], path[1]);
      const target = findCategoryEntry(destination[0], destination[1]);
      const item = source.sections.find(section => section.id === path[2]);
      source.sections = source.sections.filter(section => section !== item);
      item.order = nextOrder(target.sections);
      target.sections.push(item);
      return;
    }
    const source = findSectionEntry(path[0], path[1], path[2]);
    const target = findSectionEntry(destination[0], destination[1], destination[2]);
    const item = source.slides.find(slide => slide.id === path[3]);
    source.slides = source.slides.filter(slide => slide !== item);
    item.order = nextOrder(target.slides);
    target.slides.push(item);
  }

  function applyCopyToIndex(kind, path, destination) {
    let targetItems;
    let item;
    if (kind === "category") {
      item = findSubjectEntry(path[0]).categories.find(category => category.id === path[1]);
      targetItems = findSubjectEntry(destination[0]).categories;
    } else if (kind === "section") {
      item = findCategoryEntry(path[0], path[1]).sections.find(section => section.id === path[2]);
      targetItems = findCategoryEntry(destination[0], destination[1]).sections;
    } else {
      item = findSectionEntry(path[0], path[1], path[2]).slides.find(slide => slide.id === path[3]);
      targetItems = findSectionEntry(destination[0], destination[1], destination[2]).slides;
    }
    const copiedItem = JSON.parse(JSON.stringify(item));
    copiedItem.id = uniqueCopyId(item.id, targetItems);
    copiedItem.order = nextOrder(targetItems);
    const uuidMap = new Map();
    renewCopiedUuids(copiedItem, kind, uuidMap);
    targetItems.push(copiedItem);
    return { copiedItem, uuidMap };
  }

  function remapLoadedContent(oldPrefix, newPrefix) {
    Object.keys(window.umedAppContent || {}).forEach(oldKey => {
      if (oldKey !== oldPrefix && !oldKey.startsWith(`${oldPrefix}/`)) return;
      const newKey = `${newPrefix}${oldKey.slice(oldPrefix.length)}`;
      window.umedAppContent[newKey] = window.umedAppContent[oldKey];
      delete window.umedAppContent[oldKey];
      if (savedSnapshots.has(oldKey)) {
        savedSnapshots.set(newKey, savedSnapshots.get(oldKey));
        savedSnapshots.delete(oldKey);
      }
      if (contentInfoByKey.has(oldKey)) {
        const oldInfo = contentInfoByKey.get(oldKey);
        const newInfo = { ...oldInfo, key: newKey, src: oldInfo.src.replace(oldPrefix, newPrefix) };
        contentInfoByKey.set(newKey, newInfo);
        contentInfoByKey.delete(oldKey);
      }
    });
  }

  async function moveCurrentContent(kind, destination, makeCopy = false) {
    const path = current.key.split("/");
    const parentDepth = { category: 1, section: 2, slide: 3 }[kind];
    if (!makeCopy && destination.join("/") === path.slice(0, parentDepth).join("/")) return null;
    const oldPrefix = current.key;
    const itemId = path[path.length - 1];
    const targetItems = kind === "category" ? findSubjectEntry(destination[0]).categories
      : kind === "section" ? findCategoryEntry(destination[0], destination[1]).sections
      : findSectionEntry(destination[0], destination[1], destination[2]).slides;
    const destinationId = makeCopy ? uniqueCopyId(itemId, targetItems) : itemId;
    const newPrefix = `${destination.join("/")}/${destinationId}`;
    if ([...dirtyKeys].some(key => key === oldPrefix || key.startsWith(`${oldPrefix}/`))) {
      throw new Error(`Save or discard changes in this ${kind[0].toUpperCase()}${kind.slice(1)} before ${makeCopy ? "copying" : "moving"} it.`);
    }
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");
    if (await window.umedEditorFS.directoryExists(rootHandle, newPrefix)) {
      throw new Error(`Folder "${newPrefix}" already exists.`);
    }

    const noun = `${kind[0].toUpperCase()}${kind.slice(1)}`;
    const totalSteps = makeCopy ? 4 : 5;
    let completedSteps = 0;
    const progress = window.umedComponents && window.umedComponents.showProgress
      ? window.umedComponents.showProgress(
          `${makeCopy ? "Copying" : "Moving"} ${noun}`,
          `Checking the destination for ${noun} "${itemId}"…`,
          { max: totalSteps }
        )
      : null;
    const updateProgress = message => progress && progress.update({ message, value: completedSteps });
    const indexSnapshot = JSON.parse(JSON.stringify(window.umedAppContentIndex));
    let copied = false;
    try {
      const prospectivePaths = (await window.umedEditorFS.listFilesRecursive(rootHandle, oldPrefix))
        .map(suffix => `${newPrefix}/${suffix}`);
      await window.umedEditorFS.checkPathBudget(rootHandle, prospectivePaths);
      completedSteps += 1;

      updateProgress(`Copying the ${noun} to its new location…`);
      await window.umedEditorFS.copyDirectory(rootHandle, oldPrefix, newPrefix);
      copied = true;
      completedSteps += 1;

      updateProgress(`Updating paths and identities inside the ${makeCopy ? "copied" : "moved"} ${noun}…`);
      await window.umedEditorFS.replaceTextInJavaScriptFiles(rootHandle, newPrefix, oldPrefix, newPrefix);
      const copyResult = makeCopy ? applyCopyToIndex(kind, path, destination) : null;
      if (!makeCopy) applyMoveToIndex(kind, path, destination);
      if (copyResult) {
        for (const [oldUuid, newUuid] of copyResult.uuidMap) {
          await window.umedEditorFS.replaceTextInJavaScriptFiles(rootHandle, newPrefix, oldUuid, newUuid);
        }
      }
      if (kind === "slide") {
        const movedEntry = findSectionEntry(...destination).slides.find(slide => slide.id === destinationId);
        const sourceData = window.umedAppContent[oldPrefix] || await loadSlideContent(oldPrefix, current.src);
        const data = makeCopy ? JSON.parse(JSON.stringify(sourceData)) : sourceData;
        data.id = destinationId;
        data.uuid = movedEntry.uuid;
        data.level = movedEntry.level;
        data.order = movedEntry.order;
        await window.umedEditorFS.writeTextFile(
          rootHandle,
          `${newPrefix}/slide.js`,
          serializeContentFile({ kind: "slide", key: newPrefix }, data)
        );
      }
      completedSteps += 1;

      updateProgress("Saving the updated content index…");
      await writeIndexFile(rootHandle);
      completedSteps += 1;
    } catch (error) {
      restoreIndex(indexSnapshot);
      updateProgress(`The ${makeCopy ? "copy" : "move"} failed. Cleaning up the incomplete ${noun}…`);
      if (copied) {
        try { await window.umedEditorFS.deleteDirectory(rootHandle, newPrefix); } catch (cleanupError) { console.error(cleanupError); }
      }
      if (progress) progress.close();
      throw error;
    }

    if (makeCopy) {
      if (progress) progress.close();
      return { newPrefix, warning: null };
    }
    remapLoadedContent(oldPrefix, newPrefix);
    updateProgress(`Removing the ${noun} from its original location…`);
    try {
      await window.umedEditorFS.deleteDirectory(rootHandle, oldPrefix);
      completedSteps += 1;
      if (progress) progress.close();
      return { newPrefix, warning: null };
    } catch (error) {
      console.error(error);
      if (progress) progress.close();
      return { newPrefix, warning: `The ${kind} was moved, but the original folder could not be removed. Remove the duplicate folder after verifying the move.` };
    }
  }

  async function handleMove(kind, button) {
    const infoAtStart = current;
    const path = infoAtStart.key.split("/");
    const choice = await promptMoveDestination(kind, path);
    if (!choice || current !== infoAtStart) return;
    const originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = "…";
    try {
      const result = await moveCurrentContent(kind, choice.destination, choice.copy);
      if (!result) return;
      if (result.warning) alert(result.warning);
      if (window.umedApp && typeof window.umedApp.refreshNavigation === "function") window.umedApp.refreshNavigation();
      location.hash = `#/${result.newPrefix}`;
    } catch (error) {
      console.error(error);
      alert(`Could not ${choice.copy ? "copy" : "move"} ${kind}: ${error.message}`);
    } finally {
      button.innerHTML = originalLabel;
      button.disabled = false;
    }
  }

  // Slides are always deletable. A Subject/Category/Section landing Slide is only classified as a
  // deletable kind here if it actually matches an index entry; the app landing and error Slides
  // are also "overview"-kind but fall through to null and keep the Delete button disabled, so the
  // App itself can never be deleted. Whether the button is actually enabled (i.e. the Subject,
  // Category or Section is empty) is decided separately in buildForm.
  function resolveDeleteKind(info) {
    if (info.kind === "slide") return "slide";
    if (info.kind !== "overview") return null;
    const segments = info.key.split("/");
    if (segments.length === 1) return findSubjectEntry(info.key) ? "subject" : null;
    if (segments.length === 2) return findCategoryEntry(...segments) ? "category" : null;
    if (segments.length === 3) return findSectionEntry(...segments) ? "section" : null;
    return null;
  }

  function removeSubjectIndexEntry(subjectId) {
    const index = window.umedAppContentIndex;
    if (!index) return;
    index.subjects = (index.subjects || []).filter(subject => subject.id !== subjectId);
  }

  function removeIndexEntry(subjectId, categoryId, sectionId, key) {
    const section = findSectionEntry(subjectId, categoryId, sectionId);
    if (!section) return;
    section.slides = (section.slides || []).filter(slide => `${subjectId}/${categoryId}/${sectionId}/${slide.id}` !== key);
  }

  function removeSectionIndexEntry(subjectId, categoryId, sectionId) {
    const category = findCategoryEntry(subjectId, categoryId);
    if (!category) return;
    category.sections = (category.sections || []).filter(section => section.id !== sectionId);
  }

  function removeCategoryIndexEntry(subjectId, categoryId) {
    const subject = findSubjectEntry(subjectId);
    if (!subject) return;
    subject.categories = (subject.categories || []).filter(category => category.id !== categoryId);
  }

  async function handleDelete(info, button, deleteKind) {
    if (!deleteKind || !window.umedEditorFS) return;
    const data = window.umedAppContent[info.key];
    const nounLabel = { subject: "Subject", category: "Category", section: "Section" }[deleteKind] || "Slide";
    const confirmed = window.umedComponents && window.umedComponents.confirm
      ? await window.umedComponents.confirm(
          `Delete ${nounLabel} "${data ? data.title : info.key}"? This permanently removes its folder from disk and cannot be undone.`,
          { confirmLabel: "Delete", cancelLabel: "Cancel" }
        )
      : true;
    if (!confirmed) return;

    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Deleting\u2026";
    try {
      const rootHandle = await window.umedEditorFS.getContentRootHandle();
      if (!rootHandle) {
        // Editor cancelled the folder prompt; content is left in place.
        button.disabled = false;
        button.textContent = originalLabel;
        return;
      }

      const relativePath = contentRelativePath(info.src);
      const folderPath = relativePath.split("/").slice(0, -1).join("/");
      await window.umedEditorFS.deleteDirectory(rootHandle, folderPath);

      let nextHash;
      if (deleteKind === "slide") {
        const [subjectId, categoryId, sectionId] = info.key.split("/");
        removeIndexEntry(subjectId, categoryId, sectionId, info.key);
        nextHash = `#/${subjectId}/${categoryId}/${sectionId}`;
      } else if (deleteKind === "section") {
        const [subjectId, categoryId, sectionId] = info.key.split("/");
        removeSectionIndexEntry(subjectId, categoryId, sectionId);
        nextHash = `#/${subjectId}/${categoryId}`;
      } else if (deleteKind === "category") {
        const [subjectId, categoryId] = info.key.split("/");
        removeCategoryIndexEntry(subjectId, categoryId);
        nextHash = `#/${subjectId}`;
      } else {
        removeSubjectIndexEntry(info.key);
        nextHash = "#/";
      }
      await writeIndexFile(rootHandle);

      delete window.umedAppContent[info.key];
      dirtyKeys.delete(info.key);
      savedSnapshots.delete(info.key);

      location.hash = nextHash;
    } catch (error) {
      console.error(error);
      alert(`Could not delete ${nounLabel}: ${error.message}`);
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function refreshIfActive() {
    if (isEditorActive() && current) buildForm(current);
  }

  window.addEventListener("umed:slide-loaded", event => {
    current = event.detail;
    contentInfoByKey.set(current.key, current);
    refreshIfActive();
  });

  // Read-only-from-main.js's-perspective hook so the Slides menu's and sidebar's drag-and-drop
  // reordering and "+" add buttons can persist changes without duplicating file-serialization
  // logic.
  const lockedMutation = (description, operation, options) => (...args) => {
    const showBusy = !options || options.showBusy !== false;
    return window.umedEditorFS.withProjectLock(
      description,
      showBusy ? () => runWithBusyFeedback(() => operation(...args)) : () => operation(...args)
    );
  };

  window.umedEditor = {
    persistSlideOrder: lockedMutation("Reorder Slides", persistSlideOrder),
    createSlide: lockedMutation("Create a Slide", createSlide),
    persistIndex: lockedMutation("Reorder content", persistIndex),
    createSubject: lockedMutation("Create a Subject", createSubject),
    createCategory: lockedMutation("Create a Category", createCategory),
    createSection: lockedMutation("Create a Section", createSection),
    moveSection: lockedMutation("Move a Section", moveSection),
    splitSection: lockedMutation("Split a Section", splitSection, { showBusy: false })
  };

  if (window.umedApp && typeof window.umedApp.getCurrentSlideInfo === "function") {
    current = window.umedApp.getCurrentSlideInfo();
    if (current) contentInfoByKey.set(current.key, current);
    refreshIfActive();
  }
})();
