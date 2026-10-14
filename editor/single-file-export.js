(function () {
  "use strict";

  const INCLUDED_BLOCK_TYPES = new Set([
    "text", "image", "widget", "link", "dataFile", "question", "divider", "gptFollowup"
  ]);
  // The Learner/Presenter content panel is capped at 1100 CSS pixels. Retaining twice that width
  // keeps a full-width image sharp on a 2x-density display without embedding unused source pixels.
  const MAX_EXPORT_IMAGE_WIDTH = 2200;
  const EXPORT_JPEG_QUALITY = 0.9;
  const BUNDLED_SCRIPTS = [
    "src/um-agentic-ed-framework/app/schema-contract.js",
    "src/um-agentic-ed-framework/components/icons.js",
    "src/um-agentic-ed-framework/components/data-files.js",
    "src/um-agentic-ed-framework/components/modal.js",
    "src/um-agentic-ed-framework/components/learner-notes.js",
    "src/um-agentic-ed-framework/components/widget-host.js",
    "src/um-agentic-ed-framework/app/main.js"
  ];

  async function readFile(rootHandle, relativePath) {
    return window.umedEditorFS.readFile(rootHandle, relativePath);
  }

  async function readText(rootHandle, relativePath) {
    return (await readFile(rootHandle, relativePath)).text();
  }

  function contentPaths(index) {
    const paths = [["app-overview", "src/content/app-overview.js"]];
    for (const subject of index.subjects || []) {
      paths.push([subject.id, `src/content/${subject.id}/subject.js`]);
      for (const category of subject.categories || []) {
        const categoryKey = `${subject.id}/${category.id}`;
        paths.push([categoryKey, `src/content/${categoryKey}/category.js`]);
        for (const section of category.sections || []) {
          const sectionKey = `${categoryKey}/${section.id}`;
          paths.push([sectionKey, `src/content/${sectionKey}/section.js`]);
          for (const slide of section.slides || []) {
            const slideKey = `${sectionKey}/${slide.id}`;
            paths.push([slideKey, `src/content/${slideKey}/slide.js`]);
          }
        }
      }
    }
    return paths;
  }

  function exportSelectionIndex(index, selection) {
    const copy = JSON.parse(JSON.stringify(index));
    if (!selection || selection.type === "app") return copy;

    const [subjectId, categoryId, sectionId] = selection.path;
    const subject = (copy.subjects || []).find(item => item.id === subjectId);
    if (!subject) throw new Error(`The selected Subject "${subjectId}" is no longer available.`);
    copy.subjects = [subject];
    if (selection.type === "subject") return copy;

    const category = (subject.categories || []).find(item => item.id === categoryId);
    if (!category) throw new Error(`The selected Category "${categoryId}" is no longer available.`);
    subject.categories = [category];
    if (selection.type === "category") return copy;

    const section = (category.sections || []).find(item => item.id === sectionId);
    if (!section) throw new Error(`The selected Section "${sectionId}" is no longer available.`);
    category.sections = [section];
    return copy;
  }

  function appendSelectionItem(list, item, radioName) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = radioName;
    input.value = JSON.stringify({ type: item.type, path: item.path || [] });
    input.checked = item.type === "app";
    const text = document.createElement("span");
    text.textContent = item.label;
    label.append(input, text);
    li.append(label);
    if (item.children && item.children.length) {
      const children = document.createElement("ul");
      item.children.forEach(child => appendSelectionItem(children, child, radioName));
      li.append(children);
    }
    list.append(li);
  }

  function selectionTree(index) {
    const identity = window.umedAppIdentity || {};
    const appTitle = identity.appTitle || identity.appName || "App";
    return [{
      type: "app",
      path: [],
      label: `Entire app — ${appTitle}`,
      children: (index.subjects || []).map(subject => ({
        type: "subject",
        path: [subject.id],
        label: subject.title,
        children: (subject.categories || []).map(category => ({
          type: "category",
          path: [subject.id, category.id],
          label: category.title,
          children: (category.sections || []).map(section => ({
            type: "section",
            path: [subject.id, category.id, section.id],
            label: section.title
          }))
        }))
      }))
    }];
  }

  function promptExportSelection(index) {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog export-dialog";
    const heading = document.createElement("h2");
    heading.className = "export-dialog-title";
    heading.textContent = "Choose content to export";
    const instructions = document.createElement("p");
    instructions.className = "confirm-dialog-message";
    instructions.textContent = "Select the app, a Subject, a Category, or a Section. The selection includes all of its children.";
    const tree = document.createElement("ul");
    tree.className = "move-dialog-tree export-dialog-tree";
    const radioName = `export-selection-${Date.now()}`;
    selectionTree(index).forEach(item => appendSelectionItem(tree, item, radioName));
    const actions = document.createElement("div");
    actions.className = "confirm-dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "confirm-dialog-confirm";
    exportButton.textContent = "Export HTML";
    actions.append(cancel, exportButton);
    dialog.append(heading, instructions, tree, actions);
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
      exportButton.addEventListener("click", () => {
        const selected = tree.querySelector(`input[name="${radioName}"]:checked`);
        finish(selected ? JSON.parse(selected.value) : null);
      });
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      dialog.addEventListener("close", () => finish(null));
      dialog.showModal();
    });
  }

  function readRegisteredContent(scriptText, key) {
    const sandbox = { umedAppContent: {} };
    Function("window", `"use strict";\n${scriptText}`)(sandbox);
    const data = sandbox.umedAppContent[key];
    if (!data) throw new Error(`Content did not register for ${key}.`);
    const copy = JSON.parse(JSON.stringify(data));
    copy.content = copy.content || { blocks: [] };
    copy.content.blocks = (copy.content.blocks || []).filter(block => INCLUDED_BLOCK_TYPES.has(block.type));
    return copy;
  }

  function imagePathsForBlock(block, contentKey) {
    return (Array.isArray(block.images) ? block.images : [])
      .filter(image => image && image.url && image.source !== "url")
      .map(image => {
        const basePath = image.source === "shared"
          ? "src/content/assets/images"
          : `src/content/${contentKey}`;
        return `${basePath}/${image.url}`;
      });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error(`The browser could not encode an exported ${type} image.`));
      }, type, quality);
    });
  }

  function imageExtension(file) {
    const name = String(file.name || "").toLowerCase();
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1) : "";
  }

  async function optimizedImageDataUrl(file) {
    const extension = imageExtension(file);
    // Keep scalable vectors and potentially animated formats in their original form. WebP and
    // AVIF are already efficiently compressed, so recompressing them generally harms clarity
    // without a worthwhile size reduction.
    if (["svg", "svgz", "gif", "webp", "avif"].includes(extension)) return fileToDataUrl(file);
    if (!["png", "bmp", "jpg", "jpeg"].includes(extension)) return fileToDataUrl(file);

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EXPORT_IMAGE_WIDTH / bitmap.width);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const shouldConvert = extension === "png" || extension === "bmp";
      if (!shouldConvert && scale === 1) return fileToDataUrl(file);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return fileToDataUrl(file);
      // JPEG has no alpha channel. The normal Slide surface is white, so flatten transparent PNG
      // pixels onto white to preserve their on-screen appearance.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      const optimized = await canvasToBlob(canvas, "image/jpeg", EXPORT_JPEG_QUALITY);
      // A small or diagram-heavy PNG can already beat JPEG. Never increase the export size merely
      // to change formats; oversized JPEGs are still resized because excess pixels add no clarity.
      if (scale === 1 && optimized.size >= file.size) return fileToDataUrl(file);
      return fileToDataUrl(optimized);
    } catch (error) {
      console.warn(`Could not optimize ${file.name}; exporting the original image.`, error);
      return fileToDataUrl(file);
    } finally {
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
    }
  }

  function safeInlineScript(source) {
    return source.replace(/<\/script/gi, "<\\/script");
  }

  function safeInlineStyle(source) {
    return source.replace(/<\/style/gi, "<\\/style");
  }

  function serializeInlineData(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  }

  function isWidgetDependency(value) {
    return /(?:chart\.js|tabulator|sortablejs)/i.test(value || "");
  }

  function downloadHtml(html, fileName) {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function buildHtml(rootHandle, selection) {
    const index = exportSelectionIndex(window.umedAppContentIndex, selection);
    const schemaContract = window.umedSchemaContract;
    const indexValidation = schemaContract && schemaContract.validateIndex(index);
    if (!indexValidation || !indexValidation.valid) {
      throw new Error(schemaContract ? schemaContract.diagnostic(indexValidation) : "The Framework schema contract is unavailable.");
    }
    const content = {};
    const assets = {};
    const widgetScripts = new Map();
    let hasWidgets = false;

    for (const [key, path] of contentPaths(index)) {
      const scriptText = await readText(rootHandle, path);
      const data = readRegisteredContent(scriptText, key);
      const validation = schemaContract.validateSlide(data, {
        kind: path.endsWith("/slide.js") ? "slide" : "overview",
        key,
        path
      });
      if (!validation.valid) throw new Error(schemaContract.diagnostic(validation));
      content[key] = data;
      for (const block of data.content.blocks) {
        if (block.type === "image") {
          for (const imagePath of imagePathsForBlock(block, key)) {
            if (assets[imagePath]) continue;
            assets[imagePath] = await optimizedImageDataUrl(await readFile(rootHandle, imagePath));
          }
        } else if (block.type === "widget" && block.name) {
          hasWidgets = true;
          const widgetPath = `src/content/${key}/${block.name}.js`;
          if (widgetScripts.has(widgetPath)) continue;
          try {
            widgetScripts.set(widgetPath, await readText(rootHandle, widgetPath));
          } catch (error) {
            // An ungenerated widget is an expected authoring state. Keep its block so the exported
            // widget host displays the same placeholder as the normal app.
          }
        }
      }
    }

    const [frameworkCss, markdownCss, appCss, appScript, whiteboardScript, ...runtimeScripts] = await Promise.all([
      readText(rootHandle, "src/um-agentic-ed-framework/styles/framework.css"),
      readText(rootHandle, "src/um-agentic-ed-framework/styles/markdown-styles.css"),
      readText(rootHandle, "app.css"),
      readText(rootHandle, "app.js"),
      readText(rootHandle, "src/um-agentic-ed-framework/components/presenter-whiteboard.js"),
      ...BUNDLED_SCRIPTS.map(path => readText(rootHandle, path))
    ]);

    if (typeof window.umedFrameworkShellHtml !== "string" || !window.umedFrameworkShellHtml.trim()) {
      throw new Error("The Framework app shell is unavailable.");
    }
    const template = `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1"><title></title></head>` +
      `<body>${window.umedFrameworkShellHtml}</body></html>`;
    const documentCopy = new DOMParser().parseFromString(template, "text/html");
    const markdownItScript = Array.from(document.querySelectorAll("script[src]"))
      .find(script => /(?:^|\/)markdown-it(?:\.min)?\.js(?:[?#]|$)/i.test(script.getAttribute("src") || ""));
    if (!markdownItScript) {
      throw new Error("The app template does not include the required markdown-it script.");
    }
    const exportedMarkdownItScript = markdownItScript.cloneNode(false);
    // The exported runtime is inline and executes immediately. Removing defer makes the external
    // library parser-blocking, so window.markdownit exists before main.js initializes rendering.
    exportedMarkdownItScript.removeAttribute("defer");
    const widgetDependencyScripts = hasWidgets
      ? Array.from(document.querySelectorAll("script[src]"))
        .filter(script => isWidgetDependency(script.getAttribute("src")))
        .map(script => {
          const copy = script.cloneNode(false);
          copy.removeAttribute("defer");
          return copy;
        })
      : [];
    const widgetDependencyStyles = hasWidgets
      ? Array.from(document.querySelectorAll("link[rel='stylesheet'][href]"))
        .filter(link => isWidgetDependency(link.getAttribute("href")))
        .map(link => link.cloneNode(false))
      : [];
    documentCopy.querySelectorAll("link[rel='stylesheet'], script").forEach(element => element.remove());
    documentCopy.documentElement.classList.add("single-file-export");

    widgetDependencyStyles.forEach(link => documentCopy.head.append(link));
    const style = documentCopy.createElement("style");
    style.textContent = `${safeInlineStyle(frameworkCss)}\n${safeInlineStyle(markdownCss)}\n${safeInlineStyle(appCss)}`;
    documentCopy.head.append(style);
    documentCopy.body.append(exportedMarkdownItScript);
    widgetDependencyScripts.forEach(script => documentCopy.body.append(script));

    const sources = [
      appScript,
      `window.umedAppContentIndex = ${serializeInlineData(index)};`,
      `window.umedSingleFileExport = true;\n` +
        `window.umedEmbeddedAssets = ${serializeInlineData(assets)};\n` +
        `window.umedEmbeddedWhiteboardSource = ${serializeInlineData(whiteboardScript)};\n` +
        `window.umedAppContent = ${serializeInlineData(content)};`,
      ...widgetScripts.values(),
      ...runtimeScripts
    ];
    for (const source of sources) {
      const script = documentCopy.createElement("script");
      script.textContent = safeInlineScript(source);
      documentCopy.body.append(script);
    }

    return "<!doctype html>\n" + documentCopy.documentElement.outerHTML;
  }

  async function exportApp(button) {
    if (!window.umedEditorFS || typeof window.umedEditorFS.getAppRootHandle !== "function") {
      window.alert("App export is unavailable because file access could not be loaded.");
      return;
    }
    button.disabled = true;
    try {
      const selection = await promptExportSelection(window.umedAppContentIndex);
      if (!selection) return;
      const rootHandle = await window.umedEditorFS.getAppRootHandle();
      if (!rootHandle) return;
      const html = await buildHtml(rootHandle, selection);
      const appName = (window.umedAppIdentity && window.umedAppIdentity.appName) || "app";
      downloadHtml(html, `${appName}-single-file.html`);
    } catch (error) {
      console.error(error);
      window.alert(`The app could not be exported: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  }

  window.umedSingleFileExporter = { exportApp, exportSelectionIndex };
})();
