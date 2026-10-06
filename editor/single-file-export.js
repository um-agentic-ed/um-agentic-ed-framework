(function () {
  "use strict";

  const INCLUDED_BLOCK_TYPES = new Set(["text", "image", "link", "question", "divider", "gptFollowup"]);
  const BUNDLED_SCRIPTS = [
    "src/um-agentic-ed-framework/components/icons.js",
    "src/um-agentic-ed-framework/app/main.js"
  ];

  async function getHandle(rootHandle, relativePath) {
    const segments = relativePath.split("/").filter(Boolean);
    const fileName = segments.pop();
    let directory = rootHandle;
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
    return directory.getFileHandle(fileName);
  }

  async function readFile(rootHandle, relativePath) {
    return (await getHandle(rootHandle, relativePath)).getFile();
  }

  async function readText(rootHandle, relativePath) {
    return (await readFile(rootHandle, relativePath)).text();
  }

  function contentPaths(index) {
    const paths = [
      ["app-overview", "src/content/app-overview.js"],
      ["routing-error", "src/content/routing-error.js"]
    ];
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

  function isExternalSource(value) {
    return /^(?:https?:|data:|blob:)/i.test(value || "");
  }

  function imagePathsForBlock(block, contentKey) {
    const basePath = block.imageSource === "shared"
      ? "src/content/assets/images"
      : `src/content/${contentKey}`;
    return (block.fileName || block.src || "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .filter(fileName => !isExternalSource(fileName))
      .map(fileName => `${basePath}/${fileName}`);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
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

  async function buildHtml(rootHandle) {
    const index = window.umedAppContentIndex;
    const content = {};
    const assets = {};

    for (const [key, path] of contentPaths(index)) {
      let scriptText;
      try {
        scriptText = await readText(rootHandle, path);
      } catch (error) {
        if (key === "routing-error") continue;
        throw error;
      }
      const data = readRegisteredContent(scriptText, key);
      content[key] = data;
      for (const block of data.content.blocks) {
        if (block.type !== "image") continue;
        for (const imagePath of imagePathsForBlock(block, key)) {
          if (assets[imagePath]) continue;
          assets[imagePath] = await fileToDataUrl(await readFile(rootHandle, imagePath));
        }
      }
    }

    const [template, frameworkCss, appCss, appScript, indexScript, ...runtimeScripts] = await Promise.all([
      readText(rootHandle, "index.html"),
      readText(rootHandle, "src/um-agentic-ed-framework/styles/framework.css"),
      readText(rootHandle, "app.css"),
      readText(rootHandle, "app.js"),
      readText(rootHandle, "src/content/content-index.js"),
      ...BUNDLED_SCRIPTS.map(path => readText(rootHandle, path))
    ]);

    const documentCopy = new DOMParser().parseFromString(template, "text/html");
    documentCopy.querySelectorAll("link[rel='stylesheet'], script").forEach(element => element.remove());
    documentCopy.documentElement.classList.add("single-file-export");

    const style = documentCopy.createElement("style");
    style.textContent = `${safeInlineStyle(frameworkCss)}\n${safeInlineStyle(appCss)}`;
    documentCopy.head.append(style);

    const sources = [
      appScript,
      indexScript,
      `window.umedSingleFileExport = true;\n` +
        `window.umedEmbeddedAssets = ${serializeInlineData(assets)};\n` +
        `window.umedAppContent = ${serializeInlineData(content)};`,
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
      const rootHandle = await window.umedEditorFS.getAppRootHandle();
      if (!rootHandle) return;
      const html = await buildHtml(rootHandle);
      const appName = (window.umedAppIdentity && window.umedAppIdentity.appName) || "app";
      downloadHtml(html, `${appName}-single-file.html`);
    } catch (error) {
      console.error(error);
      window.alert(`The app could not be exported: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  }

  window.umedSingleFileExporter = { exportApp };
})();
