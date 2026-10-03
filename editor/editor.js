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
  let refreshTimer = null;
  let current = null; // { key, kind, assetBasePath, src } from app.js's umed:slide-loaded event
  const dirtyKeys = new Set(); // keys with unsaved in-memory edits, tracked across navigation
  // Deep clones of each key's last-saved (or first-seen-this-session) content, used to revert
  // in-memory edits when Discard Changes is clicked. Refreshed after every successful save and
  // dropped on delete; otherwise left alone so navigating away and back doesn't reset the baseline.
  const savedSnapshots = new Map();
  let currentSaveButton = null;
  let currentDiscardButton = null;

  // Editor mode only shows this pane after a Ctrl-click (Cmd-click on Mac) on the app title (see
  // app.js resolveRoute/editorModeActive), so this is a reliable guard against building forms
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
    return Boolean(current && current.kind === "overview" && current.key.split("/").length === 2);
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
        removeButton.addEventListener("click", () => removeTrustedSource(fileName, block, rerenderSources));
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
      for (const file of files) await uploadTrustedSource(file, block, rerenderSources);
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
    restoreButton.addEventListener("click", () => restoreTrustedSource(block, rerenderSources));
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

  function buildMetaFields(data) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-meta";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = data.title || "";
    titleInput.addEventListener("input", () => { data.title = titleInput.value; scheduleRefresh(); });
    const titleField = field("Slide Title", titleInput);
    titleField.classList.add("editor-field--full");
    wrapper.append(titleField);

    return wrapper;
  }

  const MARKDOWN_HELP_TEXT = "Supports **bold**, *italic*, `code`, and heading lines starting with # through ###### (e.g. ## Sub-heading).";
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
    if (window.umedComponents && window.umedComponents.attachTooltip) {
      window.umedComponents.attachTooltip(markdownField.querySelector("span"), MARKDOWN_HELP_TEXT);
    }
    return markdownField;
  }

  // Resolves the folder (relative to the src/content root handle) that an image block's files
  // belong in, matching the imageBasePath logic in app.js's renderBlock.
  function imageRelativeDir(block) {
    if ((block.imageSource || "slide") === "shared") return "assets/images";
    const assetBasePath = (current && current.assetBasePath) || "src/content";
    return assetBasePath.replace(/^src\/content\/?/, "");
  }

  // Uploads one or more Editor-picked image files into the block's target folder (Slide or
  // shared asset), asking for confirmation on a same-name collision, then appends each uploaded
  // file's name to the block's file name list (deduplicated) and refreshes the live preview.
  function imageFileNames(block) {
    return (block.fileName || block.src || "").split(/[\s,]+/).filter(Boolean);
  }

  function setImageFileNames(block, fileNames) {
    block.fileName = fileNames.join(", ");
    // `src` is retained only for compatibility with older content. Once the managed list is
    // edited, fileName is the authoritative field and src must not repopulate removed entries.
    if (Object.prototype.hasOwnProperty.call(block, "src")) delete block.src;
  }

  function imageRelativePath(block, fileName) {
    const relativeDir = imageRelativeDir(block);
    return relativeDir ? `${relativeDir}/${fileName}` : fileName;
  }

  function imageUnusedPath(block, fileName) {
    const relativeDir = imageRelativeDir(block);
    return relativeDir ? `${relativeDir}/_unused/${fileName}` : `_unused/${fileName}`;
  }

  async function removeImageFile(fileName, block, rerenderImages) {
    const action = await chooseFileRemovalAction(fileName, "image");
    if (!action || !window.umedEditorFS) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    try {
      if (action === "Move to _unused") {
        const unusedPath = imageUnusedPath(block, fileName);
        const existing = await window.umedEditorFS.getExistingFile(rootHandle, unusedPath);
        if (existing && !(await editorConfirm(
          `An unused image named "${fileName}" already exists. Replace it?`,
          { confirmLabel: "Replace", cancelLabel: "Cancel" }
        ))) return;
        await window.umedEditorFS.moveFile(rootHandle, imageRelativePath(block, fileName), unusedPath);
      } else {
        await window.umedEditorFS.deleteFile(rootHandle, imageRelativePath(block, fileName));
      }
      setImageFileNames(block, imageFileNames(block).filter(name => name !== fileName));
      rerenderImages();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      alert(`Could not remove image "${fileName}": ${error.message}`);
    }
  }

  async function restoreImageFile(block, rerenderImages) {
    if (!window.umedEditorFS || !window.umedComponents || !window.umedComponents.chooseOption) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return;
    const unusedDir = `${imageRelativeDir(block)}/_unused`.replace(/^\//, "");
    try {
      const names = await window.umedEditorFS.listFiles(rootHandle, unusedDir);
      if (!names.length) {
        alert("There are no unused images to restore.");
        return;
      }
      const fileName = await window.umedComponents.chooseOption("Choose an image to restore:", names);
      if (!fileName) return;
      const activePath = imageRelativePath(block, fileName);
      if (await window.umedEditorFS.getExistingFile(rootHandle, activePath)) {
        alert(`An image named "${fileName}" already exists in this location.`);
        return;
      }
      await window.umedEditorFS.moveFile(rootHandle, imageUnusedPath(block, fileName), activePath);
      if (!imageFileNames(block).includes(fileName)) setImageFileNames(block, [...imageFileNames(block), fileName]);
      rerenderImages();
      scheduleRefresh();
    } catch (error) {
      console.error(error);
      alert(`Could not restore the image: ${error.message}`);
    }
  }

  async function uploadImageFiles(files, block, rerenderImages) {
    if (!files.length || !current) return;
    if (!window.umedEditorFS) {
      alert("File system access is unavailable in this browser.");
      return;
    }
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return; // Editor cancelled the folder access prompt.

    const existingNames = imageFileNames(block);
    const namesToAdd = [];
    let wroteFile = false;

    for (const file of files) {
      if (file.type && !file.type.startsWith("image/")) continue; // guard against non-image picks
      const relativePath = imageRelativePath(block, file.name);
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
      setImageFileNames(block, [...existingNames, ...namesToAdd]);
      rerenderImages();
    }
    if (namesToAdd.length || wroteFile) scheduleRefresh();
  }

  function buildImageFileFields(block, fieldset) {
    const list = document.createElement("div");
    list.className = "editor-image-files";

    function rerenderImages() {
      list.replaceChildren();
      imageFileNames(block).forEach((fileName, index) => {
        const row = document.createElement("div");
        row.className = "editor-image-file-row";
        const name = document.createElement("input");
        name.type = "text";
        name.readOnly = true;
        name.value = fileName;
        name.setAttribute("aria-label", `Image ${index + 1} file name`);
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "editor-image-file-remove";
        removeButton.textContent = "\u00d7";
        removeButton.title = `Remove ${fileName} from this image block`;
        removeButton.setAttribute("aria-label", `Remove image ${fileName}`);
        removeButton.addEventListener("click", () => removeImageFile(fileName, block, rerenderImages));
        row.append(name, removeButton);
        list.append(row);
      });
    }

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
      if (files.length) await uploadImageFiles(files, block, rerenderImages);
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
    restoreButton.addEventListener("click", () => restoreImageFile(block, rerenderImages));
    dropZone.append(list, dropHint, uploadButton, restoreButton, uploadInput);
    attachFileDropTarget(dropZone, files => uploadImageFiles(files, block, rerenderImages));

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
      if (window.umedComponents && window.umedComponents.attachTooltip) {
        window.umedComponents.attachTooltip(legend, MARKDOWN_HELP_TEXT);
      }
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
      const source = document.createElement("select");
      [["slide", "Slide"], ["shared", "Shared"]].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = (block.imageSource || "slide") === value;
        source.append(option);
      });
      source.addEventListener("change", () => { block.imageSource = source.value; scheduleRefresh(); });
      const sourceField = field("Image source", source);
      if (window.umedComponents && window.umedComponents.attachTooltip) {
        window.umedComponents.attachTooltip(
          sourceField.querySelector("span"),
          "Slide: /src/content/<subject>/<category>/<section>/<slide>/; Shared: /src/content/assets/images/"
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

      buildImageFileFields(block, fieldset);

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
        ["Image(s)", () => ({ type: "image", markdown: "", imageSource: "slide", fileName: "", alt: "", maxWidths: "", center: false, label: null })],
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
    // (see attachBlocksSortable's handle option) — both share the same visual style in app.css.
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

  // Follow-up prompts are short, ordered questions appended to UM GPT requests. Unlike multiple-
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
    if (deleteKind === "category") {
      deleteButton.textContent = "Delete Category";
      const category = findCategoryEntry(info.key);
      deleteButton.disabled = !category || (category.sections || []).length > 0;
    } else if (deleteKind === "section") {
      deleteButton.textContent = "Delete Section";
      const [categoryId, sectionId] = info.key.split("/");
      const section = findSectionEntry(categoryId, sectionId);
      deleteButton.disabled = !section || (section.slides || []).length > 0;
    } else {
      deleteButton.textContent = "Delete Slide";
      deleteButton.disabled = deleteKind !== "slide";
    }
    deleteButton.addEventListener("click", () => handleDelete(info, deleteButton, deleteKind));
    toolbar.append(deleteButton);

    if (!savedSnapshots.has(info.key)) savedSnapshots.set(info.key, JSON.parse(JSON.stringify(data)));

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
    saveButton.disabled = !dirtyKeys.has(info.key);
    saveButton.addEventListener("click", () => handleSave(info, saveButton));
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
  // saved content object therefore reconciles the corresponding manifest record.
  function syncIndexEntry(key, data, kind) {
    const index = window.umedAppContentIndex;
    if (!index) return;
    const path = key.split("/");
    if (kind === "overview" && path.length === 1) {
      const category = (index.categories || []).find(item => item.id === path[0]);
      if (category) category.title = data.title;
      return;
    }
    if (kind === "overview" && path.length === 2) {
      const category = (index.categories || []).find(item => item.id === path[0]);
      const section = category && (category.sections || []).find(item => item.id === path[1]);
      if (section) section.title = data.title;
      return;
    }
    if (kind !== "slide") return;
    for (const category of index.categories || []) {
      for (const section of category.sections || []) {
        const entry = (section.slides || []).find(slide => `${category.id}/${section.id}/${slide.id}` === key);
        if (entry) {
          entry.uuid = data.uuid;
          entry.title = data.title;
          entry.level = data.level;
          entry.order = data.order;
          return;
        }
      }
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
  // Slides menu's drag-and-drop handler in app.js) back to each affected Slide's own slide.js
  // file, keeping in-memory unsaved edits for any currently-open Slide intact.
  async function writeSlideOrderFiles(rootHandle, categoryId, sectionId, slideIndexEntries) {
    for (const entry of slideIndexEntries) {
      const key = `${categoryId}/${sectionId}/${entry.id}`;
      const src = `src/content/${key}/slide.js`;
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

  async function persistSlideOrder(categoryId, sectionId, slideIndexEntries) {
    if (!window.umedEditorFS || !slideIndexEntries.length) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return; // Editor cancelled the folder prompt; index stays updated in memory only.

    await writeSlideOrderFiles(rootHandle, categoryId, sectionId, slideIndexEntries);
    await writeIndexFile(rootHandle);
  }

  // Creates a new Slide's slide.js file (initial content built by app.js's "+" button in the
  // Slides menu) and rewrites any other Slides whose order/level shifted to make room for it.
  async function createSlide(categoryId, sectionId, data, otherChangedEntries) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    const key = `${categoryId}/${sectionId}/${data.id}`;
    data.contentUpdatedAt = new Date().toISOString();
    window.umedAppContent[key] = data;
    await window.umedEditorFS.writeTextFile(rootHandle, `${key}/slide.js`, serializeContentFile({ kind: "slide", key }, data));
    await writeSlideOrderFiles(rootHandle, categoryId, sectionId, otherChangedEntries);
    await writeIndexFile(rootHandle);
  }

  // Category/Section order, id, and title live only in content-index.js (their own category.js/
  // section.js overview files just hold title/content), so reordering them from the sidebar only
  // needs to rewrite that one file.
  async function persistIndex() {
    if (!window.umedEditorFS) return;
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) return; // Editor cancelled the folder prompt; index stays updated in memory only.
    await writeIndexFile(rootHandle);
  }

  // Moves an entire Section between Category folders, including assets, trusted source files,
  // Slides, and widgets. The copied JavaScript files are rekeyed before the manifest is saved;
  // only then is the original folder removed. Unsaved content could not be represented by that
  // disk copy, so require the Editor to save or discard it first.
  async function moveSection(fromCategoryId, toCategoryId, sectionId) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const oldPrefix = `${fromCategoryId}/${sectionId}`;
    const newPrefix = `${toCategoryId}/${sectionId}`;
    if ([...dirtyKeys].some(key => key === oldPrefix || key.startsWith(`${oldPrefix}/`))) {
      throw new Error("Save or discard changes in this Section before moving it.");
    }
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

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

  // Creates a new Category's category.js overview file (from the sidebar's "+" button) and
  // updates content-index.js, which app.js has already mutated in memory.
  async function createCategory(categoryId, data) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    window.umedAppContent[categoryId] = data;
    await window.umedEditorFS.writeTextFile(rootHandle, `${categoryId}/category.js`, serializeContentFile({ kind: "overview", key: categoryId }, data));
    await writeIndexFile(rootHandle);
  }

  // Creates a new Section's section.js overview file (from the sidebar's "+" button) and updates
  // content-index.js, which app.js has already mutated in memory.
  async function createSection(categoryId, sectionId, data) {
    if (!window.umedEditorFS) throw new Error("File system access is unavailable.");
    const rootHandle = await window.umedEditorFS.getContentRootHandle();
    if (!rootHandle) throw new Error("Folder access was cancelled.");

    const key = `${categoryId}/${sectionId}`;
    window.umedAppContent[key] = data;
    await window.umedEditorFS.writeTextFile(rootHandle, `${key}/section.js`, serializeContentFile({ kind: "overview", key }, data));
    await writeIndexFile(rootHandle);
  }

  async function handleSave(info, button) {
    const data = window.umedAppContent[info.key];
    if (!data || !window.umedEditorFS) return;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Saving\u2026";
    try {
      const rootHandle = await window.umedEditorFS.getContentRootHandle();
      if (!rootHandle) return; // Editor cancelled the folder prompt; leave changes pending.

      const savedData = savedSnapshots.get(info.key);
      if (info.kind === "slide" && (!savedData || learnerFacingSignature(savedData) !== learnerFacingSignature(data))) {
        data.contentUpdatedAt = new Date().toISOString();
      }

      const relativePath = info.src.replace(/^src\/content\//, "");
      await window.umedEditorFS.writeTextFile(rootHandle, relativePath, serializeContentFile(info, data));

      syncIndexEntry(info.key, data, info.kind);
      if (info.kind === "slide" || info.kind === "overview") await writeIndexFile(rootHandle);
      if (window.umedApp && typeof window.umedApp.refreshNavigation === "function") {
        window.umedApp.refreshNavigation();
      }

      dirtyKeys.delete(info.key);
      savedSnapshots.set(info.key, JSON.parse(JSON.stringify(data)));
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

  function findCategoryEntry(categoryId) {
    const index = window.umedAppContentIndex;
    return index && (index.categories || []).find(category => category.id === categoryId);
  }

  function findSectionEntry(categoryId, sectionId) {
    const category = findCategoryEntry(categoryId);
    return category && (category.sections || []).find(section => section.id === sectionId);
  }

  // Slides are always deletable. A Category/Section overview is only classified as a deletable
  // kind here if it actually matches an index entry; the app overview and error Slide are also
  // "overview"-kind but have no index entry, so they fall through to null and keep the Delete
  // button disabled — the whole app can never be deleted. Whether the button is actually enabled
  // (i.e. the Category/Section is empty) is decided separately in buildForm.
  function resolveDeleteKind(info) {
    if (info.kind === "slide") return "slide";
    if (info.kind !== "overview") return null;
    const segments = info.key.split("/");
    if (segments.length === 1) return findCategoryEntry(info.key) ? "category" : null;
    if (segments.length === 2) {
      const [categoryId, sectionId] = segments;
      return findSectionEntry(categoryId, sectionId) ? "section" : null;
    }
    return null;
  }

  function removeIndexEntry(categoryId, sectionId, key) {
    const section = findSectionEntry(categoryId, sectionId);
    if (!section) return;
    section.slides = (section.slides || []).filter(slide => `${categoryId}/${sectionId}/${slide.id}` !== key);
  }

  function removeSectionIndexEntry(categoryId, sectionId) {
    const category = findCategoryEntry(categoryId);
    if (!category) return;
    category.sections = (category.sections || []).filter(section => section.id !== sectionId);
  }

  function removeCategoryIndexEntry(categoryId) {
    const index = window.umedAppContentIndex;
    if (!index) return;
    index.categories = (index.categories || []).filter(category => category.id !== categoryId);
  }

  async function handleDelete(info, button, deleteKind) {
    if (!deleteKind || !window.umedEditorFS) return;
    const data = window.umedAppContent[info.key];
    const nounLabel = deleteKind === "category" ? "Category" : deleteKind === "section" ? "Section" : "Slide";
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

      const relativePath = info.src.replace(/^src\/content\//, "");
      const folderPath = relativePath.split("/").slice(0, -1).join("/");
      await window.umedEditorFS.deleteDirectory(rootHandle, folderPath);

      let nextHash;
      if (deleteKind === "slide") {
        const [categoryId, sectionId] = info.key.split("/");
        removeIndexEntry(categoryId, sectionId, info.key);
        nextHash = `#/${categoryId}/${sectionId}`;
      } else if (deleteKind === "section") {
        const [categoryId, sectionId] = info.key.split("/");
        removeSectionIndexEntry(categoryId, sectionId);
        nextHash = `#/${categoryId}`;
      } else {
        removeCategoryIndexEntry(info.key);
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
    refreshIfActive();
  });

  // Read-only-from-app.js's-perspective hook so the Slides menu's and sidebar's drag-and-drop
  // reordering and "+" add buttons can persist changes without duplicating file-serialization
  // logic.
  window.umedEditor = { persistSlideOrder, createSlide, persistIndex, createCategory, createSection, moveSection };

  if (window.umedApp && typeof window.umedApp.getCurrentSlideInfo === "function") {
    current = window.umedApp.getCurrentSlideInfo();
    refreshIfActive();
  }
})();
