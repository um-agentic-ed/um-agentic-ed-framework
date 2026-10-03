(function () {
  "use strict";

  const index = window.UMDGGContentIndex;
  const contentStore = window.UMDGGContent = window.UMDGGContent || {};
  const elements = {
    appLayout: document.querySelector(".app-layout"),
    sidebar: document.getElementById("sidebar"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    education: document.getElementById("educational-content"),
    toolbar: document.getElementById("content-toolbar"),
    slide: document.getElementById("slide-content"),
    levels: document.getElementById("level-navigation"),
    menu: document.getElementById("slide-menu"),
    search: document.getElementById("search"),
    results: document.getElementById("search-results"),
    normalHeaderNavigation: document.getElementById("normal-header-navigation"),
    presenterNavigation: document.getElementById("presenter-navigation"),
    presenterPrevious: document.getElementById("presenter-previous-slide"),
    presenterNext: document.getElementById("presenter-next-slide"),
    presenterMenuToggle: document.getElementById("presenter-slide-menu-toggle"),
    presenterWhiteboardToggle: document.getElementById("presenter-whiteboard-toggle"),
    presenterFontDecrease: document.getElementById("presenter-font-decrease"),
    presenterFontIncrease: document.getElementById("presenter-font-increase"),
    presenterModeToggle: document.getElementById("presenter-mode-toggle"),
    editorRefresh: document.getElementById("editor-refresh"),
    editor: document.getElementById("editor-pane"),
    notepad: document.getElementById("learner-notepad"),
    notepadClose: document.getElementById("learner-notepad-close"),
    notepadLabel: document.getElementById("learner-notepad-label"),
    notepadText: document.getElementById("learner-notepad-text"),
    notesExport: document.getElementById("learner-notes-export"),
    notesLoad: document.getElementById("learner-notes-load"),
    notesToggle: document.getElementById("learner-notes-toggle"),
    notesFile: document.getElementById("learner-notes-file"),
    umGptToast: document.getElementById("um-gpt-toast"),
    umGptToastMessage: document.getElementById("um-gpt-toast-message"),
    umGptToastClose: document.getElementById("um-gpt-toast-close"),
    umGptToastSuppress: document.getElementById("um-gpt-toast-suppress")
  };
  if (!index || !Array.isArray(index.categories)) {
    elements.education.hidden = false;
    elements.toolbar.hidden = true;
    elements.menu.hidden = true;
    elements.slide.textContent = "The content index could not be loaded.";
    return;
  }

  // Tracks the redraw closure and metadata for the Slide/overview currently on screen, so the
  // Editor pane (src/editor/editor.js) can rebuild its inputs and trigger a preview-only redraw
  // after mutating the in-memory content object, without touching disk.
  let currentDraw = null;
  let currentInfo = null;
  let editorModeActive = false;
  let presenterModeActive = false;
  let presenterFontPercent = 100;
  let notepadOpen = false;
  let activeNotepadKey = "app-overview";
  let notepadButton = null;
  const slideNotes = new Map();
  const NOTE_SAVE_DELAY_MS = 600;
  let noteSaveTimer = null;
  let pendingNotepadKey = null;
  let noteLoadVersion = 0;
  let noteEditVersion = 0;
  let sharedNotes = null;
  let viewingSharedNotes = false;
  let contentReloadToken = "";
  let sidebarCollapsed = false;
  const UM_GPT_URL = "https://umgpt.umich.edu/";
  const NOTES_FILE_FORMAT = "umdgg-learner-notes";
  const NOTES_FILE_SCHEMA_VERSION = 1;
  const MAX_NOTES_FILE_BYTES = 10 * 1024 * 1024;
  const UM_GPT_TAB_OPENED_KEY = "umdgg-um-gpt-tab-opened";
  const UM_GPT_TOAST_SUPPRESSED_KEY = "umdgg-um-gpt-toast-suppressed";
  let umGptTabOpened = readSessionFlag(UM_GPT_TAB_OPENED_KEY);
  let umGptToastSuppressed = readSessionFlag(UM_GPT_TOAST_SUPPRESSED_KEY);
  let umGptToastTimer = null;
  let umGptButton = null;
  let slidePromptContent = null;

  // Unsubscribe callbacks for dataFile blocks' window.UMDGGDataFiles.onChange() listeners in the
  // Slide currently on screen, so they can be cleared before every re-render alongside widgets
  // (see clearDataFileSubscriptions below) instead of leaking closures over detached DOM nodes.
  let activeDataFileUnsubscribes = [];

  // sessionStorage makes these choices last across reloads of this app tab, while resetting when
  // the browser session ends. In-memory state preserves the intended behavior if storage is off.
  function readSessionFlag(key) {
    try { return sessionStorage.getItem(key) === "true"; } catch (error) { return false; }
  }

  function setSessionFlag(key, value) {
    try { sessionStorage.setItem(key, String(value)); } catch (error) { /* Use in-memory state. */ }
  }

  function clearDataFileSubscriptions() {
    activeDataFileUnsubscribes.forEach(unsubscribe => {
      try { unsubscribe(); } catch (error) { console.error(error); }
    });
    activeDataFileUnsubscribes = [];
  }

  // Sortable.js instances backing the Slides menu's per-Level lists (Editor mode only). Tracked
  // at module scope so they can be destroyed before every re-render, since renderMenu() rebuilds
  // the DOM from scratch and stale instances would otherwise leak and double-handle drags.
  let slideMenuSortables = [];

  // Sortable.js instances backing the sidebar's Category list and each Category's Section list
  // (Editor mode only), and which Category is currently expanded so it survives the sidebar's
  // full re-renders after a drag/add operation.
  let sidebarSortables = [];
  let expandedCategoryId = null;

  // The Category/Section belonging to the route currently on screen, so renderSidebar() can mark
  // the matching Category button/Section link with aria-current for persistent highlighting.
  let activeCategoryId = null;
  let activeSectionId = null;

  const isEditorUiActive = () => editorModeActive && !presenterModeActive;
  const cacheBustedLocalSrc = (src) => contentReloadToken ? `${src}?reload=${contentReloadToken}` : src;

  function createUuid() {
    if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
      throw new Error("UUID generation is unavailable in this browser.");
    }
    const existingUuids = new Set(allContentSlides().map(target => target.slide.uuid).filter(Boolean));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const uuid = window.crypto.randomUUID();
      if (!existingUuids.has(uuid)) return uuid;
    }
    throw new Error("Could not generate a unique Slide UUID.");
  }

  function persistNote(slideUuid) {
    if (!slideUuid || !index.appUuid || !window.UMDGGLearnerNotes) return Promise.resolve(false);
    const text = slideNotes.get(slideUuid) || "";
    return window.UMDGGLearnerNotes.saveNote(index.appUuid, slideUuid, text)
      .catch(error => {
        console.warn("Learner note could not be saved.", error);
        return false;
      });
  }

  function flushPendingNote() {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
    const slideUuid = pendingNotepadKey;
    pendingNotepadKey = null;
    return slideUuid ? persistNote(slideUuid) : Promise.resolve(false);
  }

  function queueNoteSave(slideUuid) {
    pendingNotepadKey = slideUuid;
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(flushPendingNote, NOTE_SAVE_DELAY_MS);
  }

  function updateNotepadViewMode() {
    const sharedNotesAvailable = sharedNotes !== null;
    elements.notepadLabel.textContent = sharedNotesAvailable
      ? (viewingSharedNotes ? "Viewing shared notes" : "Viewing my notes")
      : "Notes";
    elements.notepad.setAttribute("aria-label", viewingSharedNotes ? "Shared slide notes" : "Slide notes");
    elements.notesToggle.hidden = !sharedNotesAvailable;
    elements.notesToggle.textContent = viewingSharedNotes ? "View my notes" : "View shared notes";
    elements.notepadText.readOnly = viewingSharedNotes;
    elements.notepadText.spellcheck = !viewingSharedNotes;
    elements.notepadText.placeholder = viewingSharedNotes
      ? "No shared note is available for this slide."
      : "Keep notes here - they save automatically in this browser.";
  }

  function loadNote(slideUuid) {
    const loadVersion = ++noteLoadVersion;
    const editVersion = noteEditVersion;
    activeNotepadKey = slideUuid;
    updateNotepadViewMode();
    if (viewingSharedNotes) {
      elements.notepadText.value = sharedNotes && sharedNotes.has(slideUuid) ? sharedNotes.get(slideUuid) : "";
      return;
    }
    if (slideNotes.has(slideUuid)) {
      elements.notepadText.value = slideNotes.get(slideUuid);
      return;
    }

    elements.notepadText.value = "";
    if (!index.appUuid || !window.UMDGGLearnerNotes) return;
    window.UMDGGLearnerNotes.getNote(index.appUuid, slideUuid)
      .then(text => {
        if (loadVersion !== noteLoadVersion || activeNotepadKey !== slideUuid) return;
        if (!slideNotes.has(slideUuid) && text !== null) slideNotes.set(slideUuid, text);
        if (editVersion === noteEditVersion) {
          elements.notepadText.value = slideNotes.get(slideUuid) || "";
        }
      })
      .catch(error => console.warn("Learner note could not be loaded.", error));
  }

  function noteMetadataByUuid() {
    return new Map(allContentSlides().map(target => [target.slide.uuid, {
      slideTitle: target.slide.title,
      routeAtExport: `${target.category.id}/${target.section.id}/${target.slide.id}`
    }]));
  }

  function notesFileName() {
    const safeName = String(index.appName || "learner-notes")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "learner-notes";
    return `${safeName}.notes.json`;
  }

  async function confirmAction(message, options) {
    if (window.UMDGGComponents && window.UMDGGComponents.confirm) {
      return window.UMDGGComponents.confirm(message, options);
    }
    return window.confirm(message);
  }

  async function exportNotes() {
    const confirmed = await confirmAction(
      "Exporting creates an unencrypted JSON copy for archival, transfer, or sharing - " +
      "do not export notes with patient-identifiable or other sensitive information.",
      { confirmLabel: "Export notes", cancelLabel: "Cancel" }
    );
    if (!confirmed) return;

    await flushPendingNote();
    const storedNotes = window.UMDGGLearnerNotes && index.appUuid
      ? await window.UMDGGLearnerNotes.getAllNotes(index.appUuid)
      : [];
    const records = new Map(storedNotes.map(note => [note.slideUuid, { ...note }]));
    slideNotes.forEach((text, slideUuid) => {
      if (text === "") records.delete(slideUuid);
      else {
        const existing = records.get(slideUuid) || {};
        records.set(slideUuid, { ...existing, slideUuid, text, updatedAt: existing.updatedAt || new Date().toISOString() });
      }
    });

    const metadata = noteMetadataByUuid();
    const notes = Array.from(records.values()).map(note => {
      const current = metadata.get(note.slideUuid) || {};
      return {
        slideUuid: note.slideUuid,
        slideTitle: current.slideTitle || note.slideTitle || null,
        routeAtExport: current.routeAtExport || note.routeAtExport || null,
        text: note.text,
        updatedAt: note.updatedAt || null
      };
    }).sort((a, b) => (a.routeAtExport || a.slideUuid).localeCompare(b.routeAtExport || b.slideUuid));

    const payload = {
      format: NOTES_FILE_FORMAT,
      schemaVersion: NOTES_FILE_SCHEMA_VERSION,
      app: { uuid: index.appUuid, name: index.appName },
      exportedAt: new Date().toISOString(),
      notes
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = notesFileName();
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function validateNotesFile(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("The selected file is not a notes object.");
    if (payload.format !== NOTES_FILE_FORMAT || payload.schemaVersion !== NOTES_FILE_SCHEMA_VERSION) {
      throw new Error("The selected file is not a supported learner-notes file.");
    }
    if (!payload.app || payload.app.uuid !== index.appUuid) {
      throw new Error("These notes belong to a different educational app and cannot be loaded here.");
    }
    if (!Array.isArray(payload.notes)) throw new Error("The notes file does not contain a valid notes list.");

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const seen = new Set();
    return payload.notes.map(note => {
      if (!note || typeof note !== "object" || !uuidPattern.test(note.slideUuid) || typeof note.text !== "string") {
        throw new Error("The notes file contains an invalid note entry.");
      }
      if (seen.has(note.slideUuid)) throw new Error("The notes file contains duplicate Slide entries.");
      seen.add(note.slideUuid);
      return {
        slideUuid: note.slideUuid,
        slideTitle: typeof note.slideTitle === "string" ? note.slideTitle : null,
        routeAtExport: typeof note.routeAtExport === "string" ? note.routeAtExport : null,
        text: note.text,
        updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : null
      };
    }).filter(note => note.text !== "");
  }

  async function toggleSharedNotes() {
    if (!sharedNotes) return;
    if (!viewingSharedNotes) await flushPendingNote();
    viewingSharedNotes = !viewingSharedNotes;
    loadNote(activeNotepadKey);
  }

  async function loadNotesFile(file) {
    if (file.size > MAX_NOTES_FILE_BYTES) throw new Error("The selected notes file is larger than the 10 MB limit.");
    const notes = validateNotesFile(JSON.parse(await file.text()));
    const currentSlideUuids = new Set(allContentSlides().map(target => target.slide.uuid));
    const matchingCount = notes.filter(note => currentSlideUuids.has(note.slideUuid)).length;
    const unavailableCount = notes.length - matchingCount;
    const availabilityMessage = unavailableCount
      ? ` ${matchingCount} incoming notes match current Slides; ${unavailableCount} refer to Slides unavailable in this version.`
      : ` All ${matchingCount} incoming notes match current Slides.`;
    const choice = window.UMDGGComponents && window.UMDGGComponents.chooseOption
      ? await window.UMDGGComponents.chooseOption(
          `${availabilityMessage}\n\n` +
          "Choose whether to view this file temporarily without changing your notes, or replace all of your notes permanently.",
          ["View shared notes", "Replace my notes"]
        )
      : null;
    if (!choice) return;

    if (choice === "View shared notes") {
      await flushPendingNote();
      sharedNotes = new Map(notes.map(note => [note.slideUuid, note.text]));
      viewingSharedNotes = true;
      loadNote(activeNotepadKey);
      return;
    }

    const confirmed = await confirmAction(
      "Replacing notes permanently removes all notes currently saved in this browser for this app. Consider cancelling and exporting your notes first. Continue with replacement?",
      { confirmLabel: "Replace my notes", cancelLabel: "Cancel" }
    );
    if (!confirmed) return;
    await flushPendingNote();
    if (!window.UMDGGLearnerNotes || !(await window.UMDGGLearnerNotes.replaceAllNotes(index.appUuid, notes))) {
      throw new Error("The notes could not be replaced because browser storage is unavailable.");
    }
    viewingSharedNotes = false;
    sharedNotes = new Map(notes.map(note => [note.slideUuid, note.text]));
    slideNotes.clear();
    notes.forEach(note => slideNotes.set(note.slideUuid, note.text));
    loadNote(activeNotepadKey);
    window.alert(`Replaced your notes with ${notes.length} notes from the selected file.`);
  }

  function notifySlideLoaded(key, kind, assetBasePath, src) {
    flushPendingNote();
    currentInfo = { key, kind, assetBasePath, src };
    const data = contentStore[key];
    if (kind === "slide" && data && data.uuid) loadNote(data.uuid);
    else {
      noteLoadVersion += 1;
      activeNotepadKey = key;
      elements.notepadText.value = "";
    }
    window.dispatchEvent(new CustomEvent("umdgg:slide-loaded", { detail: currentInfo }));
  }

  function setNotepadOpen(nextOpen) {
    if (!nextOpen) flushPendingNote();
    notepadOpen = Boolean(nextOpen) && !editorModeActive && !presenterModeActive;
    elements.notepad.hidden = !notepadOpen;
    document.body.classList.toggle("notepad-open", notepadOpen);
    if (notepadButton) {
      notepadButton.setAttribute("aria-pressed", String(notepadOpen));
      notepadButton.setAttribute("aria-label", notepadOpen ? "Hide slide notes" : "Show slide notes");
      notepadButton.title = notepadOpen ? "Hide slide notes" : "Show slide notes";
    }
    if (notepadOpen) elements.notepadText.focus();
  }

  const sorted = (items) => items.slice().sort((a, b) => a.order - b.order);

  // The Section overview is identified by a null Slide id so it can participate in the same
  // ordered, book-like navigation sequence as app, Category, and authored Slide pages.
  const sectionOverviewSlide = (section) => ({ id: null, title: section.title, level: null, order: 0 });

  // Builds the complete reading order fresh from persisted order fields so Category, Section,
  // and Slide additions or reordering are reflected immediately in Previous/Next navigation.
  const allPages = () => [
    { kind: "app" },
    ...sorted(index.categories).flatMap(category => [
      { kind: "category", category },
      ...sorted(category.sections).flatMap(section => [
        { kind: "section", category, section, slide: sectionOverviewSlide(section) },
        ...sorted(section.slides).map(slide => ({ kind: "slide", category, section, slide }))
      ])
    ])
  ];

  function pageKey(target) {
    if (!target || target.kind === "app" || !target.category) return "app";
    if (target.kind === "category" || !target.section) return `category:${target.category.id}`;
    if (!target.slide || !target.slide.id) return `section:${target.category.id}/${target.section.id}`;
    return `slide:${target.category.id}/${target.section.id}/${target.slide.id}`;
  }

  // Search indexes authored, content-bearing Slides only. Category and Section landing Slides
  // are navigational introductions, not part of the learner-content search corpus.
  const allContentSlides = () => sorted(index.categories).flatMap(category =>
    sorted(category.sections).flatMap(section =>
      sorted(section.slides).map(slide => ({ category, section, slide }))
    )
  );

  const SEARCH_DEBOUNCE_MS = 180;
  let searchTimer = null;
  let searchIndex = null;

  // Split on ordinary hyphen variants and whitespace, remove punctuation only from a
  // candidate's boundaries, and retain punctuation inside a token (e.g. `a(b)c`, `xyz:123`).
  function tokenizeSearchText(value) {
    return (value || "")
      .trim()
      .split(/[\s\-\u2010-\u2015]+/u)
      .map(token => token.replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase())
      .filter(token => token.length >= 3);
  }

  function rebuildSearchIndex() {
    const keywordToSlideKeys = new Map();
    for (const target of allContentSlides()) {
      const key = `${target.category.id}/${target.section.id}/${target.slide.id}`;
      for (const keyword of new Set(target.slide.keywords || [])) {
        // The persisted manifest is expected to contain one normalized word per entry. Ignore
        // malformed legacy data rather than accidentally restoring phrase/substring behavior.
        const normalized = tokenizeSearchText(keyword);
        if (normalized.length !== 1 || normalized[0] !== keyword) continue;
        if (!keywordToSlideKeys.has(keyword)) keywordToSlideKeys.set(keyword, new Set());
        keywordToSlideKeys.get(keyword).add(key);
      }
    }
    searchIndex = {
      keywords: [...keywordToSlideKeys.keys()].sort(),
      keywordToSlideKeys
    };
  }

  function lowerBound(items, value) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (items[middle] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function matchingSlideKeysForPrefix(prefix) {
    const matches = new Set();
    const start = lowerBound(searchIndex.keywords, prefix);
    for (let position = start; position < searchIndex.keywords.length; position += 1) {
      const keyword = searchIndex.keywords[position];
      if (!keyword.startsWith(prefix)) break;
      for (const key of searchIndex.keywordToSlideKeys.get(keyword)) matches.add(key);
    }
    return matches;
  }

  function intersectSets(left, right) {
    const smaller = left.size <= right.size ? left : right;
    const larger = smaller === left ? right : left;
    return new Set([...smaller].filter(value => larger.has(value)));
  }

  function matchingSlideKeys(query) {
    const terms = tokenizeSearchText(query);
    if (!terms.length) return new Set();
    let matches = null;
    for (const term of terms) {
      const termMatches = matchingSlideKeysForPrefix(term);
      if (!termMatches.size) return new Set();
      matches = matches === null ? termMatches : intersectSets(matches, termMatches);
      if (!matches.size) return matches;
    }
    return matches || new Set();
  }

  rebuildSearchIndex();

  function destroySidebarSortables() {
    for (const instance of sidebarSortables) instance.destroy();
    sidebarSortables = [];
  }

  // Renders the sidebar as Category buttons each with a collapsible list of Section links. In
  // Editor mode, wires up Sortable.js drag-and-drop reordering (Sections within/across
  // Categories, and whole Categories dragged by their button) plus spacer-based "+" insertion
  // points, using the same "chunk carries its own trailing spacer" approach as the Slides menu:
  // a Category chunk is its button/Section-list plus the boundary spacer that follows it, and a
  // Section chunk is its link plus the spacer that follows it (when one exists).
  function renderSidebar() {
    destroySidebarSortables();
    elements.sidebar.replaceChildren();
    const categories = sorted(index.categories);

    const leadingTarget = categories.length ? { category: categories[0], insertIndex: 0 } : null;
    if (isEditorUiActive()) elements.sidebar.append(createCategoryAdjacentSpacer(0, leadingTarget));

    const categoryList = document.createElement("div");
    categoryList.className = "sidebar-categories";
    elements.sidebar.append(categoryList);

    categories.forEach((category, categoryIndex) => {
      const group = document.createElement("section");
      const sectionList = document.createElement("div");
      sectionList.className = "section-list";
      sectionList.dataset.categoryId = category.id;
      sectionList.hidden = category.id !== expandedCategoryId;

      const button = document.createElement("button");
      button.className = "category-button";
      button.textContent = category.title;
      button.type = "button";
      button.setAttribute("aria-current", String(category.id === activeCategoryId));
      button.addEventListener("click", () => {
        expandedCategoryId = category.id;
        location.hash = `#/${category.id}`;
        renderSidebar();
      });

      const sections = sorted(category.sections);
      sections.forEach((section, sectionIndex) => {
        const link = document.createElement("a");
        link.className = "section-link";
        link.href = `#/${category.id}/${section.id}`;
        link.textContent = section.title;
        link.setAttribute("aria-current", String(category.id === activeCategoryId && section.id === activeSectionId));

        if (!isEditorUiActive()) {
          sectionList.append(link);
          return;
        }
        const sectionChunk = document.createElement("div");
        sectionChunk.className = "sidebar-section-chunk";
        sectionChunk.dataset.sectionId = section.id;
        sectionChunk.append(link);
        if (sectionIndex < sections.length - 1) {
          sectionChunk.append(createSectionOnlySpacer(category, sectionIndex + 1));
        }
        sectionList.append(sectionChunk);
      });

      group.append(button, sectionList);

      if (!isEditorUiActive()) {
        categoryList.append(group);
        return;
      }

      const categoryChunk = document.createElement("div");
      categoryChunk.className = "sidebar-category-chunk";
      categoryChunk.dataset.categoryId = category.id;
      categoryChunk.append(group);

      // Every boundary spacer after a Category's own leading one defaults its Section option to
      // appending to the END of that (preceding) Category, since "first Section of the next
      // Category" is already reachable via that next Category's own leading spacer.
      const trailingTarget = { category, insertIndex: sections.length };
      categoryChunk.append(createCategoryAdjacentSpacer(categoryIndex + 1, trailingTarget));

      categoryList.append(categoryChunk);
      attachSectionListSortable(sectionList);
    });

    if (isEditorUiActive()) attachCategoryListSortable(categoryList);
  }

  // Wires the top-level Category list as a Sortable.js group, dragged only by each Category's
  // own button — not its nested Section list — so it doesn't compete with the nested per-Category
  // Section Sortables below for the same mousedown (the standard nested-Sortable pattern).
  function attachCategoryListSortable(categoryList) {
    sidebarSortables.push(Sortable.create(categoryList, {
      group: "sidebar-categories",
      handle: ".category-button",
      animation: 150,
      draggable: ".sidebar-category-chunk",
      ghostClass: "sidebar-category-chunk--ghost",
      chosenClass: "sidebar-category-chunk--chosen",
      dragClass: "sidebar-category-chunk--drag",
      onEnd(event) {
        handleCategoryDrop(event.item.dataset.categoryId, event.newIndex);
      }
    }));
  }

  // Wires one Category's Section list as a Sortable.js group so Sections can be dragged to
  // reorder within it, or dropped into another Category's Section list — all Categories share
  // the same `group`, matching the Slides menu's cross-Level dragging. A collapsed Category's
  // Section list is hidden, so (as before) Sections can only be dropped into an expanded one.
  function attachSectionListSortable(sectionList) {
    sidebarSortables.push(Sortable.create(sectionList, {
      group: "sidebar-sections",
      animation: 150,
      draggable: ".sidebar-section-chunk",
      ghostClass: "sidebar-section-chunk--ghost",
      chosenClass: "sidebar-section-chunk--chosen",
      dragClass: "sidebar-section-chunk--drag",
      onEnd(event) {
        handleSectionDrop(event.item.dataset.sectionId, event.from.dataset.categoryId, event.to.dataset.categoryId, event.newIndex);
      }
    }));
  }

  // Computes an `order` value for inserting an item at `insertIndex` among `siblings` (already
  // excludes the item, sorted ascending by order), reusing spaced increments where a gap exists.
  // Returns null when neighbors have closed to no gap, signalling every sibling must be re-ranked.
  function computeOrderForInsertion(siblings, insertIndex) {
    const previous = insertIndex > 0 ? siblings[insertIndex - 1] : null;
    const next = insertIndex < siblings.length ? siblings[insertIndex] : null;
    if (previous && next) return next.order - previous.order > 1 ? Math.floor((previous.order + next.order) / 2) : null;
    if (previous && !next) return previous.order + 10;
    if (!previous && next) return next.order > 1 ? Math.floor(next.order / 2) : null;
    return 10;
  }

  function rerankSiblings(siblings) {
    let counter = 10;
    for (const item of siblings) {
      item.order = counter;
      counter += 10;
    }
  }

  function persistIndexNow() {
    if (window.UMDGGEditor && typeof window.UMDGGEditor.persistIndex === "function") {
      window.UMDGGEditor.persistIndex().catch(error => {
        console.error(error);
        alert(`Could not save changes: ${error.message}`);
      });
    }
  }

  // Builds a boundary spacer that sits directly after a Category's own Sections (and, after the
  // last Category, at the very bottom of the sidebar) — the only positions where adding either a
  // new Category or a new Section makes sense without ambiguously splitting an existing
  // Category's own Sections. `sectionTarget` (null only when there are no Categories yet) is
  // where a Section would land if that's chosen instead of a Category. Sortable.js now owns
  // drag-and-drop reordering directly on Category/Section chunks, so this is no longer a drop
  // target, only a hover-activated "+" button.
  function createCategoryAdjacentSpacer(insertCategoryIndex, sectionTarget) {
    const spacer = document.createElement("div");
    spacer.className = "sidebar-spacer sidebar-spacer--category";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "sidebar-add";
    addButton.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.add) || "+";
    addButton.setAttribute("aria-label", "Add a Category or Section here");
    addButton.addEventListener("click", () => handleAddCategoryOrSection(insertCategoryIndex, sectionTarget));
    spacer.append(addButton);

    return spacer;
  }

  // Builds a Section-only spacer between two Sections already inside the same Category; purely a
  // hover-activated "+" button, no longer a drop target (see createCategoryAdjacentSpacer above).
  function createSectionOnlySpacer(category, insertIndex) {
    const spacer = document.createElement("div");
    spacer.className = "sidebar-spacer sidebar-spacer--section";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "sidebar-add";
    addButton.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.add) || "+";
    addButton.setAttribute("aria-label", `Add a Section here in ${category.title}`);
    addButton.addEventListener("click", () => handleAddSection(category, insertIndex));
    spacer.append(addButton);

    return spacer;
  }

  // `insertIndex` is the moved Section's resulting index among `toCategoryId`'s other Sections —
  // Sortable.js's `evt.newIndex` already reflects the chunk's final position, so no adjustment
  // for its prior position is needed (see the Slides menu's handleSlideDrop for the same case).
  async function handleSectionDrop(sectionId, fromCategoryId, toCategoryId, insertIndex) {
    const fromCategory = index.categories.find(item => item.id === fromCategoryId);
    const toCategory = index.categories.find(item => item.id === toCategoryId);
    const section = fromCategory && fromCategory.sections.find(item => item.id === sectionId);
    if (!fromCategory || !toCategory || !section) return;

    // A cross-Category move also changes every on-disk path in the Section. Keep a complete
    // in-memory rollback point until Editor Mode has copied/rekeyed that folder and saved the
    // manifest. Same-Category moves only change order and use the ordinary manifest save.
    const indexBeforeMove = fromCategory !== toCategory ? JSON.parse(JSON.stringify(index.categories)) : null;
    const expandedBeforeMove = expandedCategoryId;
    const siblings = sorted(toCategory.sections.filter(item => item.id !== sectionId));
    const clampedIndex = Math.max(0, Math.min(insertIndex, siblings.length));
    const assignedOrder = computeOrderForInsertion(siblings, clampedIndex);
    if (assignedOrder !== null) {
      section.order = assignedOrder;
    } else {
      siblings.splice(clampedIndex, 0, section);
      rerankSiblings(siblings);
    }
    if (fromCategory !== toCategory) {
      fromCategory.sections = fromCategory.sections.filter(item => item.id !== sectionId);
      toCategory.sections.push(section);
      expandedCategoryId = toCategory.id;
    }

    renderSidebar();
    if (fromCategory === toCategory) {
      persistIndexNow();
      return;
    }

    try {
      if (!window.UMDGGEditor || typeof window.UMDGGEditor.moveSection !== "function") {
        throw new Error("Section moves require Editor Mode file access.");
      }
      const moveWarning = await window.UMDGGEditor.moveSection(fromCategoryId, toCategoryId, sectionId);
      if (moveWarning) alert(moveWarning);
      rebuildSearchIndex();

      // A currently displayed route still uses the old Category path. Re-resolve it at the new
      // path so it loads the Section under its rewritten content-store key.
      const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
      if (parts[0] === fromCategoryId && parts[1] === sectionId) {
        location.hash = `#/${toCategoryId}/${sectionId}${parts[2] ? `/${parts[2]}` : ""}`;
      }
    } catch (error) {
      index.categories.splice(0, index.categories.length, ...indexBeforeMove);
      expandedCategoryId = expandedBeforeMove;
      rebuildSearchIndex();
      renderSidebar();
      console.error(error);
      alert(`Could not move Section: ${error.message}`);
    }
  }

  // Same `insertIndex` reasoning as handleSectionDrop above.
  function handleCategoryDrop(categoryId, insertIndex) {
    const category = index.categories.find(item => item.id === categoryId);
    if (!category) return;

    const siblings = sorted(index.categories.filter(item => item.id !== categoryId));
    const clampedIndex = Math.max(0, Math.min(insertIndex, siblings.length));
    const assignedOrder = computeOrderForInsertion(siblings, clampedIndex);
    if (assignedOrder !== null) {
      category.order = assignedOrder;
    } else {
      siblings.splice(clampedIndex, 0, category);
      rerankSiblings(siblings);
    }

    renderSidebar();
    persistIndexNow();
  }

  async function handleAddCategoryOrSection(insertCategoryIndex, sectionTarget) {
    let kind = "category";
    if (sectionTarget) {
      if (!(window.UMDGGComponents && window.UMDGGComponents.chooseOption)) return;
      const choice = await window.UMDGGComponents.chooseOption(
        "Add a new Section here, or a new Category?",
        ["Add Section", "Add Category"]
      );
      if (!choice) return;
      kind = choice === "Add Section" ? "section" : "category";
    }
    if (kind === "category") await handleAddCategory(insertCategoryIndex);
    else await handleAddSection(sectionTarget.category, sectionTarget.insertIndex);
  }

  async function handleAddSection(category, insertIndex) {
    const title = window.UMDGGComponents && window.UMDGGComponents.promptText
      ? await window.UMDGGComponents.promptText("Title for the new Section:", { confirmLabel: "Add Section" })
      : null;
    if (!title) return;
    const id = uniqueId(title, category.sections.map(item => item.id));
    const newSection = { id, title, order: 0, slides: [] };

    category.sections.push(newSection);
    const siblings = sorted(category.sections.filter(item => item.id !== id));
    const clampedIndex = Math.max(0, Math.min(insertIndex, siblings.length));
    const assignedOrder = computeOrderForInsertion(siblings, clampedIndex);
    if (assignedOrder !== null) newSection.order = assignedOrder;
    else {
      siblings.splice(clampedIndex, 0, newSection);
      rerankSiblings(siblings);
    }

    expandedCategoryId = category.id;
    renderSidebar();

    const initialData = { schemaVersion: 1, title, content: { blocks: [{ type: "text", markdown: "" }] } };
    if (window.UMDGGEditor && typeof window.UMDGGEditor.createSection === "function") {
      try {
        await window.UMDGGEditor.createSection(category.id, id, initialData);
        location.hash = `#/${category.id}/${id}`;
      } catch (error) {
        console.error(error);
        alert(`Could not save the new Section: ${error.message}`);
      }
    }
  }

  async function handleAddCategory(insertIndex) {
    const title = window.UMDGGComponents && window.UMDGGComponents.promptText
      ? await window.UMDGGComponents.promptText("Title for the new Category:", { confirmLabel: "Add Category" })
      : null;
    if (!title) return;
    const id = uniqueId(title, index.categories.map(item => item.id));
    const newCategory = { id, title, order: 0, sections: [] };

    index.categories.push(newCategory);
    const siblings = sorted(index.categories.filter(item => item.id !== id));
    const clampedIndex = Math.max(0, Math.min(insertIndex, siblings.length));
    const assignedOrder = computeOrderForInsertion(siblings, clampedIndex);
    if (assignedOrder !== null) newCategory.order = assignedOrder;
    else {
      siblings.splice(clampedIndex, 0, newCategory);
      rerankSiblings(siblings);
    }

    expandedCategoryId = id;
    renderSidebar();

    const initialData = { schemaVersion: 1, title, content: { blocks: [{ type: "text", markdown: "" }] } };
    if (window.UMDGGEditor && typeof window.UMDGGEditor.createCategory === "function") {
      try {
        await window.UMDGGEditor.createCategory(id, initialData);
        location.hash = `#/${id}`;
      } catch (error) {
        console.error(error);
        alert(`Could not save the new Category: ${error.message}`);
      }
    }
  }

  function navigate(target) {
    if (!target.category) {
      location.hash = "#/";
    } else if (!target.section) {
      location.hash = `#/${target.category.id}`;
    } else {
      location.hash = target.slide.id
        ? `#/${target.category.id}/${target.section.id}/${target.slide.id}`
        : `#/${target.category.id}/${target.section.id}`;
    }
  }

  function resolveRoute() {
    flushPendingNote();
    if (editorModeActive || presenterModeActive) setNotepadOpen(false);
    elements.editor.hidden = !isEditorUiActive();
    elements.editorRefresh.hidden = !isEditorUiActive();

    const parts = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
    elements.education.hidden = false;

    if (parts.length > 3) {
      setActiveRoute(null, null);
      renderError();
      return;
    }
    if (!parts.length) {
      setActiveRoute(null, null);
      renderOverview("app-overview", "src/content/app-overview.js", "src/content", { kind: "app" });
      return;
    }

    const category = index.categories.find(item => item.id === parts[0]);
    if (!category) {
      setActiveRoute(null, null);
      renderError();
      return;
    }
    if (parts.length === 1) {
      setActiveRoute(category.id, null);
      renderOverview(category.id, `src/content/${category.id}/category.js`, `src/content/${category.id}`,
        { kind: "category", category });
      return;
    }

    const section = category.sections.find(item => item.id === parts[1]);
    if (!section) {
      setActiveRoute(null, null);
      renderError();
      return;
    }
    if (parts.length === 2) {
      setActiveRoute(category.id, section.id);
      renderSlide({ category, section, slide: sectionOverviewSlide(section) });
      return;
    }

    const slide = section.slides.find(item => item.id === parts[2]);
    if (!slide) {
      setActiveRoute(null, null);
      renderError();
      return;
    }
    setActiveRoute(category.id, section.id);
    renderSlide({ category, section, slide });
  }

  // Syncs the sidebar's highlighted Category/Section with the route just resolved, expanding
  // the active Category (if any) so its Section stays visible, and re-renders so this works for
  // every navigation path (Prev/Next, Slide menu, search results, back/forward), not just
  // direct sidebar clicks.
  function setActiveRoute(categoryId, sectionId) {
    activeCategoryId = categoryId;
    activeSectionId = sectionId;
    if (categoryId) expandedCategoryId = categoryId;
    renderSidebar();
  }

  function renderError() {
    renderOverview("routing-error", "src/content/routing-error.js", "src/content");
  }

  function renderTrustedSources(blocks, parent, sectionKey) {
    const browserViewableExtensions = new Set([
      "avif", "bmp", "csv", "gif", "htm", "html", "jpeg", "jpg", "json", "md", "pdf",
      "png", "svg", "text", "txt", "webp", "xml"
    ]);
    const fileNames = blocks
      .filter(block => block.type === "trustedSources" && Array.isArray(block.files))
      .flatMap(block => block.files)
      .map(fileName => String(fileName || "").trim())
      .filter(Boolean)
      .filter((fileName, index, all) => all.indexOf(fileName) === index);
    if (!fileNames.length) return;

    const wrapper = document.createElement("section");
    wrapper.className = "trusted-sources-display";
    wrapper.append(document.createElement("hr"));
    const introduction = document.createElement("p");
    introduction.textContent = "The following files were used as trusted information sources for slides in this section:";
    wrapper.append(introduction);
    const list = document.createElement("ul");
    fileNames.forEach(fileName => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `src/content/${sectionKey}/_trusted_sources/${encodeURIComponent(fileName)}`;
      const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "";
      if (browserViewableExtensions.has(extension)) link.target = "app_trusted_source";
      else link.download = fileName;
      link.textContent = fileName;
      item.append(link);
      list.append(item);
    });
    wrapper.append(list);
    parent.append(wrapper);
  }

  function setChromeVisible(visible) {
    elements.toolbar.hidden = !visible || presenterModeActive;
    if (!visible) {
      setSlideMenuExpanded(false);
      setNotepadOpen(false);
    }
  }

  // Renders a top-level overview or error Slide. Category overviews keep the toolbar visible for
  // stable page layout, while controls that require a Section or authored Slide remain disabled.
  function renderOverview(key, src, assetBasePath, navigationTarget = null) {
    const showToolbar = navigationTarget && navigationTarget.kind === "category";
    setChromeVisible(showToolbar);
    if (showToolbar) renderLevels(navigationTarget);
    updateHeaderNavigation(navigationTarget);
    const draw = () => {
      if (window.UMDGGWidgetHost) window.UMDGGWidgetHost.destroyAll();
      clearDataFileSubscriptions();
      elements.slide.replaceChildren();
      slidePromptContent = null;
      elements.slide.scrollTop = 0;
      const data = contentStore[key];
      if (!data) {
        elements.slide.textContent = "Content could not be loaded.";
        return;
      }
      const heading = document.createElement("h1");
      heading.textContent = data.title;
      elements.slide.append(heading);
      for (const block of (data.content && data.content.blocks) || []) {
        if (block.type !== "trustedSources") renderBlock(block, elements.slide, assetBasePath);
      }
      if (navigationTarget) renderBottomNavigation(navigationTarget, elements.slide);
    };
    currentDraw = draw;

    if (contentStore[key]) {
      draw();
      notifySlideLoaded(key, "overview", assetBasePath, src);
      return;
    }
    const script = document.createElement("script");
    script.src = cacheBustedLocalSrc(src);
    script.onload = () => { draw(); notifySlideLoaded(key, "overview", assetBasePath, src); };
    script.onerror = () => { elements.slide.textContent = "Content could not be loaded."; };
    document.head.append(script);
  }

  function renderSlide(target) {
    const { category, section, slide } = target;
    const isOverview = !slide.id;
    if (isOverview) setNotepadOpen(false);
    setChromeVisible(true);
    renderLevels(target);
    renderMenu(target);
    updateHeaderNavigation(target);

    const key = isOverview ? `${category.id}/${section.id}` : `${category.id}/${section.id}/${slide.id}`;
    const src = isOverview
      ? `src/content/${category.id}/${section.id}/section.js`
      : `src/content/${category.id}/${section.id}/${slide.id}/slide.js`;
    const draw = () => {
      if (window.UMDGGWidgetHost) window.UMDGGWidgetHost.destroyAll();
      clearDataFileSubscriptions();
      elements.slide.replaceChildren();
      elements.slide.scrollTop = 0;
      slidePromptContent = null;
      const data = contentStore[key];
      if (!data) {
        elements.slide.textContent = "Slide content could not be loaded.";
        return;
      }
      const promptContent = document.createElement("div");
      promptContent.className = "slide-prompt-content";
      const heading = document.createElement("h1");
      heading.textContent = data.title;
      promptContent.append(heading);

      for (const block of data.content.blocks || []) {
        if (block.type !== "gptFollowup" && block.type !== "trustedSources") renderBlock(block, promptContent, `src/content/${key}`);
      }
      elements.slide.append(promptContent);
      slidePromptContent = promptContent;
      renderGptFollowups(data.content.blocks || [], elements.slide);
      if (isOverview) renderTrustedSources(data.content.blocks || [], elements.slide, key);
      renderBottomNavigation(target, elements.slide);
    };
    currentDraw = draw;
    const assetBasePath = `src/content/${key}`;

    if (contentStore[key]) {
      draw();
      notifySlideLoaded(key, isOverview ? "overview" : "slide", assetBasePath, src);
      return;
    }
    const script = document.createElement("script");
    script.src = cacheBustedLocalSrc(src);
    script.onload = () => { draw(); notifySlideLoaded(key, isOverview ? "overview" : "slide", assetBasePath, src); };
    script.onerror = () => { elements.slide.textContent = "Slide content could not be loaded."; };
    document.head.append(script);
  }

  function renderLevels(target) {
    const section = target.section || null;
    const slide = target.slide || null;
    const isContentSlide = Boolean(section && slide && slide.id);
    elements.levels.replaceChildren();
    toolbarMenuToggle.disabled = !section;
    if (!section) setSlideMenuExpanded(false);

    LEVELS.forEach(level => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-navigation-button";
      button.textContent = LEVEL_TITLES[level];
      button.setAttribute("aria-current", String(Boolean(slide && slide.level === level)));
      button.disabled = !section || !section.slides.some(item => item.level === level);
      button.addEventListener("click", () => {
        const first = section && sorted(section.slides).find(item => item.level === level);
        if (first) navigate({ ...target, slide: first });
      });
      elements.levels.append(button);
    });

    if (!editorModeActive && !presenterModeActive) {
      const notesButton = document.createElement("button");
      notesButton.type = "button";
      notesButton.className = "notepad-button";
      notesButton.disabled = !isContentSlide;
      notesButton.setAttribute("aria-label", notepadOpen ? "Hide slide notes" : "Show slide notes");
      notesButton.setAttribute("aria-pressed", String(notepadOpen));
      notesButton.title = notepadOpen ? "Hide slide notes" : "Show slide notes";
      notesButton.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.notepad) || "Notes";
      notesButton.addEventListener("click", () => setNotepadOpen(!notepadOpen));
      notepadButton = notesButton;
      elements.levels.append(notesButton);
    } else {
      notepadButton = null;
    }

    const chatButton = document.createElement("button");
    chatButton.type = "button";
    chatButton.className = "chatgpt-button";
    chatButton.disabled = !isContentSlide;
    chatButton.setAttribute("aria-label", "Ask UM GPT");
    chatButton.title = "Ask UM GPT";
    chatButton.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.chatgpt) || "◉";
    chatButton.addEventListener("click", () => askUmGpt());
    umGptButton = chatButton;
    elements.levels.append(chatButton);

    const pages = allPages();
    const position = pages.findIndex(item => pageKey(item) === pageKey(target));
    setNavigationButtons(document.getElementById("previous-slide"), document.getElementById("next-slide"), pages, position);
  }

  function setNavigationButtons(previousButton, nextButton, pages, position) {
    previousButton.disabled = position <= 0;
    nextButton.disabled = position < 0 || position >= pages.length - 1;
    previousButton.onclick = () => position > 0 && navigate(pages[position - 1]);
    nextButton.onclick = () => position < pages.length - 1 && navigate(pages[position + 1]);
  }

  function updateHeaderNavigation(target) {
    const pages = allPages();
    const position = target ? pages.findIndex(item => pageKey(item) === pageKey(target)) : -1;
    setNavigationButtons(elements.presenterPrevious, elements.presenterNext, pages, position);
    elements.presenterMenuToggle.disabled = !target || !target.section;
  }

  function renderBottomNavigation(target, parent) {
    const pages = allPages();
    const position = pages.findIndex(item => pageKey(item) === pageKey(target));
    const navigation = document.createElement("nav");
    navigation.className = "slide-bottom-navigation";
    navigation.setAttribute("aria-label", "Slide navigation");

    const createButton = (direction, disabled, destination) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `slide-bottom-button slide-bottom-button--${direction}`;
      button.disabled = disabled;
      button.setAttribute("aria-label", direction === "previous" ? "Previous slide" : "Next slide");
      button.innerHTML = direction === "previous"
        ? '<svg class="slide-step-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M16 10H4m5-5-5 5 5 5" /></svg>'
        : '<svg class="slide-step-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>';
      button.addEventListener("click", () => destination && navigate(destination));
      return button;
    };

    navigation.append(
      createButton("previous", position <= 0, position > 0 ? pages[position - 1] : null),
      createButton("next", position < 0 || position >= pages.length - 1,
        position >= 0 && position < pages.length - 1 ? pages[position + 1] : null)
    );
    parent.append(navigation);
  }

  // Clipboard access must begin from the button's user gesture. The fallback supports local-file
  // use in browsers that do not expose the asynchronous Clipboard API in that context.
  function askUmGpt(followupQuestion = "") {
    // Start clipboard access before opening a tab so Chromium recognizes it as part of this
    // direct user gesture and does not request separate clipboard permission.
    copyUmGptPrompt(followupQuestion).then(showUmGptToast);
    if (!umGptTabOpened) {
      const chatWindow = window.open(UM_GPT_URL, "ask_umgpt");
      if (chatWindow) {
        umGptTabOpened = true;
        setSessionFlag(UM_GPT_TAB_OPENED_KEY, true);
      }
    }
  }

  async function copyUmGptPrompt(followupQuestion = "") {
    // Follow-up suggestion text is rendered outside `slidePromptContent`, keeping it out of the
    // quoted teaching material sent to UM GPT.
    let slideText = (slidePromptContent || elements.slide).innerText.trim();
    slideText = slideText.replace(/\n/g, "\n> ");
    const prompt = "I am a post-graduate learner in Molecular Genetic Pathology and Laboratory Genetics and Genomics. " +
      "You are a professional and experienced practitioner and educator in those fields. " + 
      "I would like further explanation on a teaching slide " +
      "I am reviewing whose text is quoted here.\n\n> " + slideText + "\n\n" +
      (followupQuestion ? `My follow-up question is: ${followupQuestion}\n\n` : "");
    let clipboardError;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(prompt);
        return true;
      }
    } catch (error) {
      clipboardError = error;
    }
    try {
      // `execCommand` is deprecated but remains a useful local-file fallback in supported browsers.
      const input = document.createElement("textarea");
      input.value = prompt;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("The browser declined the copy command.");
      return true;
    } catch (error) {
      console.warn("Could not copy the UM GPT prompt to the clipboard.", clipboardError || error);
      return false;
    }
  }

  function showUmGptToast(copied) {
    if (umGptToastSuppressed) return;
    clearTimeout(umGptToastTimer);
    elements.umGptToastMessage.textContent = copied
      ? "A prompt was copied to your clipboard. Paste it into UM GPT."
      : "The prompt could not be copied. You can still open UM GPT and ask about this slide.";
    elements.umGptToastSuppress.checked = false;
    positionUmGptToast();
    elements.umGptToast.hidden = false;
    umGptToastTimer = setTimeout(hideUmGptToast, 10000);
  }

  // The GPT control is dynamically rendered with the Level buttons. Measure it at display time
  // so the fixed toast shares its right edge and appears directly beneath the toolbar row.
  function positionUmGptToast() {
    if (!umGptButton) return;
    const buttonBounds = umGptButton.getBoundingClientRect();
    elements.umGptToast.style.top = `${Math.round(buttonBounds.bottom + 8)}px`;
    elements.umGptToast.style.right = `${Math.max(0, Math.round(window.innerWidth - buttonBounds.right))}px`;
    elements.umGptToast.style.bottom = "auto";
  }

  function hideUmGptToast() {
    clearTimeout(umGptToastTimer);
    umGptToastTimer = null;
    elements.umGptToast.hidden = true;
  }

  // Tier identifiers use kebab-case; display titles are centralized here so metadata and UI
  // remain consistent without deriving titles from identifiers such as "core-learning".
  const LEVELS = ["foundations", "core-learning", "advanced-topics"];
  const LEVEL_TITLES = {
    foundations: "Foundations",
    "core-learning": "Core Learning",
    "advanced-topics": "Advanced Topics"
  };

  // Renders the Slides menu as a two-level tree (Level, then its Slides indented below) and, in
  // Editor mode, wires up Sortable.js drag-and-drop reordering. Only content Slides are listed;
  // the Section overview slide has its own link in the level navigation area, not this menu.
  // In Editor mode, each Slide is a "chunk" div (the Slide link plus its own trailing spacer)
  // that is the Sortable-draggable unit, so dragging a Slide carries its insertion point with
  // it; a Level's chunks share one Sortable list per Level, all in the same `group` so Slides
  // can be dragged within or across Levels. The Level heading gets its own leading spacer
  // (outside the Sortable list, never draggable) so a Slide can also be added at rank 0. Every
  // spacer shows a "+" button on hover to add a new Slide at that exact rank; spacers are no
  // longer drop targets themselves now that Sortable.js handles reordering directly on chunks.
  function renderMenu(target) {
    destroySlideMenuSortables();
    elements.menu.replaceChildren();
    for (const level of LEVELS) {
      const slidesInLevel = sorted(target.section.slides.filter(item => item.level === level));
      if (!slidesInLevel.length && !isEditorUiActive()) continue;

      const heading = document.createElement("div");
      heading.className = "slide-menu-level" + (slidesInLevel.length ? "" : " slide-menu-level--empty");
      heading.textContent = LEVEL_TITLES[level];
      elements.menu.append(heading);
      if (isEditorUiActive()) elements.menu.append(createSlideSpacer(target, level, 0));

      const list = document.createElement("div");
      list.className = "slide-menu-list";
      list.dataset.level = level;
      elements.menu.append(list);

      slidesInLevel.forEach((slide, index) => {
        const link = document.createElement("a");
        link.className = "slide-menu-item";
        link.href = `#/${target.category.id}/${target.section.id}/${slide.id}`;
        link.textContent = slide.title;
        link.setAttribute("aria-current", String(slide.id === target.slide.id));

        if (!isEditorUiActive()) {
          list.append(link);
          return;
        }
        const chunk = document.createElement("div");
        chunk.className = "slide-menu-chunk";
        chunk.dataset.slideId = slide.id;
        chunk.append(link, createSlideSpacer(target, level, index + 1));
        list.append(chunk);
      });

      if (isEditorUiActive()) attachSlideMenuSortable(list, target);
    }
  }

  function destroySlideMenuSortables() {
    for (const instance of slideMenuSortables) instance.destroy();
    slideMenuSortables = [];
  }

  // Makes one Level's Slide list a Sortable.js group so its Slide chunks can be dragged to
  // reorder within the Level, or dropped into another Level's list (all Levels share the same
  // `group` name). `onEnd` fires once per drag on the list where the drag started, with `evt.to`
  // pointing at wherever the chunk actually ended up; `evt.newIndex` is that chunk's resulting
  // index among its new siblings, which is exactly the position insertSlideAtPosition() expects.
  function attachSlideMenuSortable(list, target) {
    slideMenuSortables.push(Sortable.create(list, {
      group: "slide-menu",
      animation: 150,
      draggable: ".slide-menu-chunk",
      ghostClass: "slide-menu-chunk--ghost",
      chosenClass: "slide-menu-chunk--chosen",
      dragClass: "slide-menu-chunk--drag",
      onEnd(event) {
        handleSlideDrop(target, event.item.dataset.slideId, event.to.dataset.level, event.newIndex);
      }
    }));
  }

  // Builds one insertion-point spacer for a Level's Slide list: purely a "+" button revealed on
  // hover to add a new Slide at that exact rank; Sortable.js now owns drag-and-drop reordering,
  // so spacers are no longer drop targets.
  function createSlideSpacer(target, level, insertAtInLevel) {
    const spacer = document.createElement("div");
    spacer.className = "slide-menu-spacer";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "slide-menu-add";
    addButton.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.add) || "+";
    addButton.setAttribute("aria-label", `Add a Slide here in ${level}`);
    addButton.addEventListener("click", () => handleAddSlide(target, level, insertAtInLevel));
    spacer.append(addButton);

    return spacer;
  }

  // Inserts `slide` into `section` at Level `toLevel`, position `insertAtInLevel` (0-based index
  // among that Level's other Slides), and (re)computes `order` values. Slides are created with
  // spaced order increments (see AGENTS.md), so most inserts only need to set the inserted
  // Slide's own order/level; a full Section re-rank only runs when the gap between its new
  // neighbors has closed to nothing. Returns the Slide index entries whose order/level changed
  // and must be persisted to disk (always including `slide` itself).
  function insertSlideAtPosition(section, slide, toLevel, insertAtInLevel) {
    const levelIndex = LEVELS.indexOf(toLevel);
    const earlierLevelSlides = LEVELS.slice(0, levelIndex)
      .flatMap(level => sorted(section.slides.filter(item => item.id !== slide.id && item.level === level)));
    const laterLevelSlides = LEVELS.slice(levelIndex + 1)
      .flatMap(level => sorted(section.slides.filter(item => item.id !== slide.id && item.level === level)));
    const sameLevelSlides = sorted(section.slides.filter(item => item.id !== slide.id && item.level === toLevel));

    const clampedIndex = Math.max(0, Math.min(insertAtInLevel, sameLevelSlides.length));
    sameLevelSlides.splice(clampedIndex, 0, slide);
    const fullOrdered = [...earlierLevelSlides, ...sameLevelSlides, ...laterLevelSlides];
    const globalIndex = earlierLevelSlides.length + clampedIndex;
    const previousSlide = globalIndex > 0 ? fullOrdered[globalIndex - 1] : null;
    const nextSlide = globalIndex < fullOrdered.length - 1 ? fullOrdered[globalIndex + 1] : null;

    slide.level = toLevel;
    const changed = [];

    let assignedOrder = null;
    if (previousSlide && nextSlide && nextSlide.order - previousSlide.order > 1) {
      assignedOrder = Math.floor((previousSlide.order + nextSlide.order) / 2);
    } else if (previousSlide && !nextSlide) {
      assignedOrder = previousSlide.order + 10;
    } else if (!previousSlide && nextSlide) {
      assignedOrder = nextSlide.order > 1 ? Math.floor(nextSlide.order / 2) : null;
    } else if (!previousSlide && !nextSlide) {
      assignedOrder = 10;
    }

    if (assignedOrder !== null && Number.isInteger(assignedOrder)) {
      slide.order = assignedOrder;
    } else {
      // Not enough room between neighbors: re-rank every Slide in the Section using spaced
      // increments so future single-Slide moves/inserts have room again.
      let counter = 10;
      for (const item of fullOrdered) {
        if (item.order !== counter) changed.push(item);
        item.order = counter;
        counter += 10;
      }
    }
    if (!changed.includes(slide)) changed.push(slide);
    return changed;
  }

  function persistChangedSlides(categoryId, sectionId, changed) {
    if (window.UMDGGEditor && typeof window.UMDGGEditor.persistSlideOrder === "function") {
      window.UMDGGEditor.persistSlideOrder(categoryId, sectionId, changed).catch(error => {
        console.error(error);
        alert(`Could not save Slide order: ${error.message}`);
      });
    }
  }

  // `insertAtInLevel` is the moved Slide's resulting index among `toLevel`'s other Slides —
  // Sortable.js's `evt.newIndex` already reflects the chunk's final position among its new
  // siblings, so no adjustment for the moved item's prior position is needed here.
  function handleSlideDrop(target, movedId, toLevel, insertAtInLevel) {
    const section = target.section;
    const moved = section.slides.find(item => item.id === movedId);
    if (!moved) return;

    const changed = insertSlideAtPosition(section, moved, toLevel, insertAtInLevel);
    renderMenu(target);
    persistChangedSlides(target.category.id, section.id, changed);
  }

  // Generates a kebab-case id from a title, unique among `existingIds` — used for new Slides,
  // Sections, and Categories alike.
  function uniqueId(title, existingIds) {
    const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
    const idSet = new Set(existingIds);
    let id = base;
    let suffix = 2;
    while (idSet.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
  }

  // New Slide paths should be short but recognizable. Ignore common function words and retain at
  // most three meaningful words from the title; the Editor can always replace this suggestion.
  function slideNameFromTitle(title) {
    const trivialWords = new Set([
      "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "into",
      "is", "it", "its", "of", "on", "or", "the", "to", "was", "were", "what", "when", "where",
      "which", "who", "why", "with", "about", "after", "before", "between", "during", "over", "under",
      "via", "vs", "versus", "your", "our", "their", "this", "that", "these", "those"
    ]);
    const words = (title || "").toLowerCase().match(/[a-z0-9]+/g) || [];
    const meaningfulWords = words.filter(word => !trivialWords.has(word)).slice(0, 3);
    return meaningfulWords.join("-") || "slide";
  }

  // Creates a new Slide at the given Level/position from the Slides menu's "+" button. Every
  // Slide starts with a single empty text block; Editors add Question or other blocks afterward.
  async function handleAddSlide(target, level, insertAtInLevel) {
    const slideDetails = window.UMDGGComponents && window.UMDGGComponents.promptNewSlide
      ? await window.UMDGGComponents.promptNewSlide({
        message: "Add a new Slide",
        confirmLabel: "Add Slide",
        nameFromTitle: slideNameFromTitle
      })
      : null;
    if (!slideDetails) return;
    const title = slideDetails.title;
    // Preserve the Editor's chosen name as the Slide id, while ensuring it is a safe kebab-case
    // folder name and doesn't collide with an existing Slide in this Section.
    const id = uniqueId(slideDetails.name, target.section.slides.map(item => item.id));
    let uuid;
    try {
      uuid = createUuid();
    } catch (error) {
      alert(error.message);
      return;
    }
    const newEntry = { id, uuid, title, level, order: 0, keywords: [] };

    target.section.slides.push(newEntry);
    const changed = insertSlideAtPosition(target.section, newEntry, level, insertAtInLevel);
    renderMenu(target);

    const initialData = {
      id,
      uuid,
      schemaVersion: 2,
      level: newEntry.level,
      order: newEntry.order,
      title,
      content: { blocks: [{ type: "text", markdown: "" }] }
    };
    const otherChanged = changed.filter(item => item !== newEntry);

    if (window.UMDGGEditor && typeof window.UMDGGEditor.createSlide === "function") {
      window.UMDGGEditor.createSlide(target.category.id, target.section.id, initialData, otherChanged)
        .then(() => navigate({ ...target, slide: newEntry }))
        .catch(error => {
          console.error(error);
          alert(`Could not save the new Slide: ${error.message}`);
        });
    }
  }

  const DEFAULT_IMAGE_MAX_WIDTH = "50%";
  const DEFAULT_WIDGET_MAX_WIDTH = "90%";

  // Editors type a raw CSS max-width value (see AGENTS.md); falls back to `fallback` when blank,
  // whitespace-only, or not a value the browser recognizes for this property.
  function resolveCssMaxWidth(rawValue, fallback) {
    const value = (rawValue || "").trim();
    if (!value) return fallback;
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("max-width", value)) return fallback;
    return value;
  }

  function renderBlock(block, parent, assetBasePath) {
    if (block.type === "text") {
      const div = document.createElement("div");
      div.className = "text-block";
      div.innerHTML = markdownToSafeHtml(block.markdown || "", true);
      parent.append(div);
    } else if (block.type === "instructions") {
      // Retained authoring instructions are deliberately invisible in Learner Mode.
      return;
    } else if (block.type === "image") {
      renderBlockMarkdown(block, parent);
      const imageSource = block.imageSource || "slide";
      const imageBasePath = imageSource === "shared" ? "src/content/assets/images" : assetBasePath;
      const fileNames = (block.fileName || block.src || "").split(/[\s,]+/).filter(Boolean);
      const maxWidths = (block.maxWidths || "").split(/[\s,]+/).filter(Boolean);

      const wrapper = document.createElement("div");
      wrapper.className = "image-block";
      if (block.center) wrapper.classList.add("block--centered");
      fileNames.forEach((fileName, index) => {
        const image = document.createElement("img");
        image.src = cacheBustedLocalSrc(`${imageBasePath}/${fileName}`);
        image.alt = block.alt || "";
        image.style.maxWidth = resolveCssMaxWidth(maxWidths.length === 1 ? maxWidths[0] : maxWidths[index], DEFAULT_IMAGE_MAX_WIDTH);
        wrapper.append(image);
      });
      if (block.label) {
        const caption = document.createElement("p");
        caption.textContent = block.label;
        wrapper.append(caption);
      }
      parent.append(wrapper);
    } else if (block.type === "widget") {
      renderBlockMarkdown(block, parent);
      const container = document.createElement("div");
      container.className = "widget-block";
      if (block.center) container.classList.add("block--centered");
      container.style.maxWidth = resolveCssMaxWidth(block.maxWidth, DEFAULT_WIDGET_MAX_WIDTH);
      parent.append(container);
      if (window.UMDGGWidgetHost) window.UMDGGWidgetHost.mount(container, block, assetBasePath);
    } else if (block.type === "link") {
      renderBlockMarkdown(block, parent);
      const wrapper = document.createElement("p");
      wrapper.className = "link-block";
      const anchor = document.createElement("a");
      anchor.href = block.url || "";
      anchor.target = "dgg-ed-external";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = block.label || block.url || "";
      wrapper.append(anchor);
      parent.append(wrapper);
    } else if (block.type === "dataFile") {
      renderBlockMarkdown(block, parent);
      renderDataFileBlock(block, parent);
    } else if (block.type === "question") {
      renderQuestionBlock(block, parent);
    } else if (block.type === "divider") {
      parent.append(document.createElement("hr"));
    }
  }

  // Follow-up blocks may be placed anywhere in Editor order, but are collected into one dedicated
  // footer so Learners always see the suggested GPT questions at the bottom of the Slide.
  function renderGptFollowups(blocks, parent) {
    const questions = blocks
      .filter(block => block.type === "gptFollowup")
      .flatMap(block => block.questions || [])
      .map(question => String(question || "").trim())
      .filter(Boolean);
    if (!questions.length) return;

    const footer = document.createElement("div");
    footer.className = "gpt-followups";
    footer.append(document.createElement("hr"));
    const heading = document.createElement("h2");
    heading.textContent = "Suggested GPT follow-up prompts";
    const list = document.createElement("ul");
    questions.forEach(question => {
      const item = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = question;
      const askButton = document.createElement("button");
      askButton.type = "button";
      askButton.className = "gpt-followup-ask-button";
      askButton.title = "Ask UM GPT";
      askButton.setAttribute("aria-label", `Ask UM GPT: ${question}`);
      askButton.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.chatgpt) || "◉";
      askButton.addEventListener("click", () => askUmGpt(question));
      item.append(askButton, text);
      list.append(item);
    });
    footer.append(heading, list);
    parent.append(footer);
  }

  // Shared lead-in "markdown" field for image/widget/link blocks (see AGENTS.md), rendered
  // identically to a text block but only when present, immediately before that block's own
  // content so it stays visually attached to, and reorders with, the rest of the block.
  function renderBlockMarkdown(block, parent) {
    if (!block.markdown) return;
    const div = document.createElement("div");
    div.className = "block-lead-markdown";
    div.innerHTML = markdownToSafeHtml(block.markdown, true);
    parent.append(div);
  }

  // Space/comma-delimited extensions (see AGENTS.md dataFile block) become a <input accept> list.
  function extensionsToAccept(extensions) {
    return (extensions || "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(extension => extension.startsWith(".") ? extension : `.${extension}`)
      .join(",");
  }

  // Renders a dataFile block's prompt followed inline by a small upload icon (matching the Editor
  // pane's image upload button) instead of an obtrusive native "Browse" button. The file is
  // handed to window.UMDGGDataFiles, a session-lifetime registry any widget can read from,
  // keyed by the block's `name` so the same upload is usable across Slides once loaded.
  function renderDataFileBlock(block, parent) {
    const wrapper = document.createElement("p");
    wrapper.className = "data-file-block";

    const prompt = document.createElement("span");
    prompt.textContent = block.prompt || "";
    wrapper.append(prompt);

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.hidden = true;
    const accept = extensionsToAccept(block.extensions);
    if (accept) uploadInput.accept = accept;

    const uploadButton = document.createElement("button");
    uploadButton.type = "button";
    uploadButton.className = "data-file-upload-button";
    uploadButton.title = "Upload data file\u2026";
    uploadButton.setAttribute("aria-label", "Upload data file");
    uploadButton.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.upload) || "";
    uploadButton.addEventListener("click", () => uploadInput.click());

    const status = document.createElement("span");
    status.className = "data-file-status";

    if (block.name && window.UMDGGDataFiles) {
      activeDataFileUnsubscribes.push(
        window.UMDGGDataFiles.onChange(block.name, file => {
          status.textContent = file ? `Loaded: ${file.name}` : "";
        })
      );
    }

    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files && uploadInput.files[0];
      uploadInput.value = ""; // allow re-selecting the same file name to fire change again
      if (file && block.name && window.UMDGGDataFiles) window.UMDGGDataFiles.set(block.name, file);
    });

    wrapper.append(uploadButton, status, uploadInput);
    parent.append(wrapper);
  }

  function markdownToSafeHtml(text, useParagraphs = false) {
    const escaped = text.replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
    const withInline = escaped
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

    // Text blocks and block lead-ins use one block element per input line so headings and
    // conceptual paragraphs are sibling elements. Empty input lines intentionally become empty
    // paragraphs, preserving the spacing the Editor entered without inserting stray <br> nodes.
    if (useParagraphs) {
      return withInline.split(/\r?\n/).map(line => {
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          return `<h${level}>${heading[2]}</h${level}>`;
        }
        return `<p>${line}</p>`;
      }).join("");
    }

    // Question fields retain compact inline rendering because choices live inside <span>
    // elements and feedback is prefixed with Correct/Incorrect text.
    const parts = [];
    let paragraphLines = [];
    const flushParagraph = () => {
      if (paragraphLines.length) {
        parts.push(paragraphLines.join("<br>"));
        paragraphLines = [];
      }
    };
    for (const line of withInline.split(/\r?\n/)) {
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        const level = heading[1].length;
        parts.push(`<h${level}>${heading[2]}</h${level}>`);
      } else {
        paragraphLines.push(line);
      }
    }
    flushParagraph();
    return parts.join("");
  }

  // Question blocks can appear any number of times, mixed with other block types, on a single
  // Slide, so each instance needs its own independent radio group name (a static shared name, as
  // used when Question was a whole Slide type, would let a Learner's answer on one Question
  // silently clear another's selection).
  let questionRadioGroupCounter = 0;

  function renderQuestionBlock(block, parent) {
    const wrapper = document.createElement("div");
    wrapper.className = "question-block";
    const groupName = `question-${questionRadioGroupCounter++}`;

    const prompt = document.createElement("div");
    prompt.className = "question-prompt";
    prompt.innerHTML = markdownToSafeHtml(block.prompt || "");
    const list = document.createElement("ol");
    list.className = "question-choices";
    const feedback = document.createElement("div");
    feedback.className = "question-feedback";
    feedback.hidden = true;

    (block.choices || []).forEach((choice, position) => {
      const item = document.createElement("li");
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = groupName;
      input.value = String(position);
      const choiceText = document.createElement("span");
      choiceText.innerHTML = markdownToSafeHtml(choice.text || "");
      input.addEventListener("change", () => {
        feedback.hidden = false;
        const prefix = choice.correct ? "Correct." : "Incorrect.";
        feedback.innerHTML = choice.feedback
          ? `${prefix} ${markdownToSafeHtml(choice.feedback)}`
          : prefix;
        feedback.classList.toggle("question-feedback--correct", choice.correct);
        feedback.classList.toggle("question-feedback--incorrect", !choice.correct);
      });
      label.append(input, document.createTextNode(" "), choiceText);
      item.append(label);
      list.append(item);
    });

    wrapper.append(prompt, list, feedback);
    parent.append(wrapper);
  }

  // Groups the complete, deduplicated content-Slide match set into a result tree. Collapse
  // decisions use raw per-Section/per-Category counts before anything is rendered, so common
  // terms do not hide rarer matches merely because they appeared later in a fixed result cap.
  function buildSearchResultsTree(matchingKeys) {
    const categories = [];
    const categoryById = new Map();
    for (const { category, section, slide } of allContentSlides()) {
      const key = `${category.id}/${section.id}/${slide.id}`;
      if (!matchingKeys.has(key)) continue;
      let categoryEntry = categoryById.get(category.id);
      if (!categoryEntry) {
        categoryEntry = { category, sections: [], sectionById: new Map() };
        categoryById.set(category.id, categoryEntry);
        categories.push(categoryEntry);
      }
      let sectionEntry = categoryEntry.sectionById.get(section.id);
      if (!sectionEntry) {
        sectionEntry = { section, slides: [] };
        categoryEntry.sectionById.set(section.id, sectionEntry);
        categoryEntry.sections.push(sectionEntry);
      }
      sectionEntry.slides.push(slide);
    }
    return categories.map(categoryEntry => {
      if (categoryEntry.sections.length >= 3) {
        return { category: categoryEntry.category, sections: [] };
      }
      return {
        category: categoryEntry.category,
        sections: categoryEntry.sections.map(sectionEntry => ({
          section: sectionEntry.section,
          slides: sectionEntry.slides.length > 3 ? [] : sectionEntry.slides
        }))
      };
    });
  }

  function search(query) {
    elements.results.replaceChildren();
    elements.results.hidden = true;
    if (query.trim().length < 3) return;

    const matches = matchingSlideKeys(query);
    if (!matches.size) return;
    for (const { category, sections } of buildSearchResultsTree(matches)) {
      const categoryLink = document.createElement("a");
      categoryLink.className = "search-results-category";
      categoryLink.href = `#/${category.id}`;
      categoryLink.textContent = category.title;
      elements.results.append(categoryLink);

      for (const { section, slides } of sections) {
        const sectionLink = document.createElement("a");
        sectionLink.className = "search-results-section";
        sectionLink.href = `#/${category.id}/${section.id}`;
        sectionLink.textContent = section.title;
        elements.results.append(sectionLink);

        for (const slide of slides) {
          const slideLink = document.createElement("a");
          slideLink.className = "search-results-slide";
          slideLink.href = `#/${category.id}/${section.id}/${slide.id}`;
          slideLink.textContent = slide.title;
          elements.results.append(slideLink);
        }
      }
    }
    elements.results.hidden = false;
  }

  const toolbarMenuToggle = document.getElementById("slide-menu-toggle");

  function setSlideMenuExpanded(expanded) {
    elements.menu.hidden = !expanded;
    toolbarMenuToggle.setAttribute("aria-expanded", String(expanded));
    elements.presenterMenuToggle.setAttribute("aria-expanded", String(expanded));
  }

  toolbarMenuToggle.addEventListener("click", () => {
    setSlideMenuExpanded(toolbarMenuToggle.getAttribute("aria-expanded") !== "true");
  });
  elements.presenterMenuToggle.addEventListener("click", () => {
    setSlideMenuExpanded(elements.presenterMenuToggle.getAttribute("aria-expanded") !== "true");
  });

  elements.presenterPrevious.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.previous) || "\u2190";
  elements.presenterNext.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.next) || "\u2192";
  elements.presenterMenuToggle.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.menu) || "\u2630";
  elements.presenterWhiteboardToggle.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.whiteboard) || "\u270e";
  elements.presenterFontDecrease.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.subtract) || "\u2212";
  elements.presenterFontIncrease.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.add) || "+";
  elements.presenterModeToggle.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.presenter) || "\u25b6";
  elements.editorRefresh.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.refresh) || "\u21bb";

  function reloadContentIndex() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `src/content/content-index.js?reload=${Date.now()}`;
      script.onload = () => {
        script.remove();
        const refreshedIndex = window.UMDGGContentIndex;
        if (!refreshedIndex || !Array.isArray(refreshedIndex.categories)) {
          window.UMDGGContentIndex = index;
          reject(new Error("The reloaded content index is invalid."));
          return;
        }
        Object.keys(index).forEach(key => { delete index[key]; });
        Object.assign(index, refreshedIndex);
        window.UMDGGContentIndex = index;
        resolve();
      };
      script.onerror = () => {
        script.remove();
        window.UMDGGContentIndex = index;
        reject(new Error("The content index could not be reloaded."));
      };
      document.head.append(script);
    });
  }

  async function refreshContentFromDisk() {
    elements.editorRefresh.disabled = true;
    try {
      await reloadContentIndex();
      contentReloadToken = Date.now().toString();
      if (window.UMDGGWidgetHost && typeof window.UMDGGWidgetHost.invalidateScripts === "function") {
        window.UMDGGWidgetHost.invalidateScripts();
      }
      if (currentInfo && currentInfo.key) delete contentStore[currentInfo.key];
      rebuildSearchIndex();
      resolveRoute();
    } catch (error) {
      console.error(error);
      alert(`Could not reload content: ${error.message}`);
    } finally {
      elements.editorRefresh.disabled = false;
    }
  }

  elements.editorRefresh.addEventListener("click", refreshContentFromDisk);

  function applyPresenterFontSize() {
    elements.slide.style.fontSize = presenterModeActive ? `${presenterFontPercent}%` : "";
    elements.presenterFontDecrease.disabled = presenterFontPercent <= 50;
    elements.presenterFontIncrease.disabled = presenterFontPercent >= 200;
    elements.presenterFontDecrease.setAttribute("aria-label", `Decrease slide font size; currently ${presenterFontPercent}%`);
    elements.presenterFontIncrease.setAttribute("aria-label", `Increase slide font size; currently ${presenterFontPercent}%`);
    elements.presenterFontDecrease.title = `Slide font size: ${presenterFontPercent}%`;
    elements.presenterFontIncrease.title = `Slide font size: ${presenterFontPercent}%`;
  }

  elements.presenterFontDecrease.addEventListener("click", () => {
    presenterFontPercent = Math.max(50, presenterFontPercent - 10);
    applyPresenterFontSize();
  });
  elements.presenterFontIncrease.addEventListener("click", () => {
    presenterFontPercent = Math.min(200, presenterFontPercent + 10);
    applyPresenterFontSize();
  });

  function applyPresenterMode() {
    const presenterModeAction = presenterModeActive ? "Leave Presenter Mode" : "Enter Presenter Mode";
    document.body.classList.toggle("presenter-mode", presenterModeActive);
    elements.normalHeaderNavigation.hidden = presenterModeActive;
    elements.presenterNavigation.hidden = !presenterModeActive;
    elements.presenterModeToggle.setAttribute("aria-pressed", String(presenterModeActive));
    elements.presenterModeToggle.setAttribute("aria-label", presenterModeAction);
    elements.presenterModeToggle.title = presenterModeAction;
    if (window.UMDGGPresenterWhiteboard) window.UMDGGPresenterWhiteboard.setPresenterMode(presenterModeActive);
    setSlideMenuExpanded(false);
    elements.results.hidden = true;
    resolveRoute();
  }

  elements.presenterModeToggle.addEventListener("click", () => {
    presenterModeActive = !presenterModeActive;
    applyPresenterFontSize();
    applyPresenterMode();
  });

  elements.umGptToastClose.addEventListener("click", hideUmGptToast);
  elements.umGptToastSuppress.checked = umGptToastSuppressed;
  elements.umGptToastSuppress.addEventListener("change", event => {
    umGptToastSuppressed = event.currentTarget.checked;
    setSessionFlag(UM_GPT_TOAST_SUPPRESSED_KEY, umGptToastSuppressed);
  });

  // Reflects sidebarCollapsed onto the DOM: the CSS class drives the slide animation, aria-expanded
  // and inert keep keyboard/screen-reader users from landing on an off-screen sidebar, and the
  // accessible/native hover label mirrors the current action, as on the Presenter Mode toggle.
  function applySidebarCollapsed() {
    const sidebarAction = sidebarCollapsed ? "Open Sidebar" : "Close Sidebar";
    elements.appLayout.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    elements.sidebarToggle.setAttribute("aria-expanded", String(!sidebarCollapsed));
    elements.sidebarToggle.setAttribute("aria-label", sidebarAction);
    elements.sidebarToggle.title = sidebarAction;
    elements.sidebar.toggleAttribute("inert", sidebarCollapsed);
  }
  elements.sidebarToggle.innerHTML = (window.UMDGGIcons && window.UMDGGIcons.sidebarToggle) || "\u2630";
  elements.sidebarToggle.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    applySidebarCollapsed();
  });
  applySidebarCollapsed();

  elements.search.addEventListener("input", event => {
    clearTimeout(searchTimer);
    const query = event.target.value;
    searchTimer = setTimeout(() => search(query), SEARCH_DEBOUNCE_MS);
  });
  elements.notepadText.addEventListener("input", event => {
    if (viewingSharedNotes) return;
    slideNotes.set(activeNotepadKey, event.currentTarget.value);
    noteEditVersion += 1;
    queueNoteSave(activeNotepadKey);
  });
  elements.notepadText.addEventListener("blur", flushPendingNote);
  elements.notepadClose.addEventListener("click", () => setNotepadOpen(false));
  elements.notesExport.addEventListener("click", event => {
    event.preventDefault();
    exportNotes().catch(error => window.alert(`Notes could not be exported: ${error.message}`));
  });
  elements.notesLoad.addEventListener("click", event => {
    event.preventDefault();
    elements.notesFile.click();
  });
  elements.notesToggle.addEventListener("click", event => {
    event.preventDefault();
    toggleSharedNotes().catch(error => console.error(error));
  });
  elements.notesFile.addEventListener("change", event => {
    const file = event.currentTarget.files && event.currentTarget.files[0];
    if (!file) return;
    loadNotesFile(file)
      .catch(error => window.alert(`Notes could not be loaded: ${error.message}`))
      .finally(() => { elements.notesFile.value = ""; });
  });
  elements.results.addEventListener("click", event => {
    if (event.target.closest("a")) elements.results.hidden = true;
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".header-actions")) elements.results.hidden = true;
  });
  window.addEventListener("hashchange", resolveRoute);
  window.addEventListener("pagehide", flushPendingNote);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingNote();
  });
  window.addEventListener("resize", () => {
    if (!elements.umGptToast.hidden) positionUmGptToast();
  });

  // Ctrl-click (Cmd-click on Mac) on the app title toggles Editor mode in place on the current
  // route, instead of following its href and resetting to the app overview like a normal click.
  // Editor mode is otherwise not secured (see AGENTS.md), so it is still gated to file:// URLs.
  const titleLink = document.querySelector(".app-title");
  if (titleLink) {
    titleLink.addEventListener("click", event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (location.protocol !== "file:") return;
      editorModeActive = !editorModeActive;
      resolveRoute();
    });
  }

  // Read-only hook for src/editor/editor.js: it never touches routing or contentStore directly
  // through this object, only through window.UMDGGContent, so app.js stays the single source of
  // truth for what is currently on screen.
  window.UMDGGApp = {
    refreshSlide: () => { if (currentDraw) currentDraw(); },
    refreshNavigation: () => { renderSidebar(); rebuildSearchIndex(); },
    rebuildSearchIndex,
    getCurrentSlideInfo: () => currentInfo
  };

  // Editor Mode remains the remembered authoring state while Presenter Mode temporarily suppresses
  // its pane and editing controls. resolveRoute() reapplies the effective UI state on each change.
  resolveRoute();
})();
