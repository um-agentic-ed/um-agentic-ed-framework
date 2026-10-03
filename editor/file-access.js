(function () {
  "use strict";

  // Shared File System Access API helper for Editor Mode saves. A single directory handle for
  // /src/content is requested once per session (on first save) and reused after that.
  const CONTENT_ROOT_LABEL = "src/content";
  let rootHandlePromise = null;

  async function pickContentRoot() {
    const explainAndProceed = window.umedComponents && window.umedComponents.confirm
      ? window.umedComponents.confirm(
          `Saving needs one-time access to this project's "${CONTENT_ROOT_LABEL}" folder. ` +
          `In the next dialog, browse into your local copy of this project and select the ` +
          `"${CONTENT_ROOT_LABEL}" folder itself (not the project root, and not a folder inside it), then choose it.`,
          { confirmLabel: "Choose folder\u2026", cancelLabel: "Cancel" }
        )
      : Promise.resolve(true);

    if (!(await explainAndProceed)) return null;

    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: "umed-content", mode: "readwrite" });
    } catch (error) {
      if (error && error.name === "AbortError") return null;
      throw error;
    }

    if (handle.name !== "content") {
      const useAnyway = window.umedComponents && window.umedComponents.confirm
        ? await window.umedComponents.confirm(
            `You selected "${handle.name}", but this app expects the "${CONTENT_ROOT_LABEL}" folder. Use it anyway?`,
            { confirmLabel: "Use this folder", cancelLabel: "Pick again" }
          )
        : true;
      if (!useAnyway) return pickContentRoot();
    }
    return handle;
  }

  async function getContentRootHandle() {
    if (!rootHandlePromise) rootHandlePromise = pickContentRoot();
    const handle = await rootHandlePromise;
    if (!handle) {
      rootHandlePromise = null;
      return null;
    }
    const mode = { mode: "readwrite" };
    const granted = (await handle.queryPermission(mode)) === "granted"
      || (await handle.requestPermission(mode)) === "granted";
    if (!granted) {
      rootHandlePromise = null;
      return null;
    }
    return handle;
  }

  // Generic write shared by text (slide.js/content-index.js serialization) and binary (uploaded
  // image) saves: FileSystemWritableFileStream.write() accepts a string, BufferSource, or Blob.
  async function writeFile(rootHandle, relativePath, content) {
    const segments = relativePath.split("/");
    const fileName = segments.pop();
    let dirHandle = rootHandle;
    for (const segment of segments) {
      dirHandle = await dirHandle.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  // Looks up a file that may already exist at relativePath (e.g. to check for an upload name
  // collision) without creating anything. Returns the File (with its .size) or null if either
  // the folder or the file itself doesn't exist yet.
  async function getExistingFile(rootHandle, relativePath) {
    const segments = relativePath.split("/");
    const fileName = segments.pop();
    let dirHandle = rootHandle;
    for (const segment of segments) {
      try {
        dirHandle = await dirHandle.getDirectoryHandle(segment);
      } catch (error) {
        if (error && error.name === "NotFoundError") return null;
        throw error;
      }
    }
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName);
      return await fileHandle.getFile();
    } catch (error) {
      if (error && error.name === "NotFoundError") return null;
      throw error;
    }
  }

  async function deleteDirectory(rootHandle, relativePath) {
    const segments = relativePath.split("/");
    const targetName = segments.pop();
    let dirHandle = rootHandle;
    for (const segment of segments) {
      dirHandle = await dirHandle.getDirectoryHandle(segment);
    }
    await dirHandle.removeEntry(targetName, { recursive: true });
  }

  // Removes one file without affecting sibling trusted sources or other Section assets.
  async function deleteFile(rootHandle, relativePath) {
    const segments = relativePath.split("/");
    const targetName = segments.pop();
    let dirHandle = rootHandle;
    for (const segment of segments) {
      dirHandle = await dirHandle.getDirectoryHandle(segment);
    }
    await dirHandle.removeEntry(targetName);
  }

  async function listFiles(rootHandle, relativePath) {
    let dirHandle = rootHandle;
    for (const segment of relativePath.split("/").filter(Boolean)) {
      try {
        dirHandle = await dirHandle.getDirectoryHandle(segment);
      } catch (error) {
        if (error && error.name === "NotFoundError") return [];
        throw error;
      }
    }
    const names = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") names.push(entry.name);
    }
    return names.sort((a, b) => a.localeCompare(b));
  }

  // File System Access has no move primitive. Copy the complete File into the destination first,
  // creating `_unused` only when needed, then remove the source after the write succeeds.
  async function moveFile(rootHandle, sourcePath, destinationPath) {
    const sourceFile = await getExistingFile(rootHandle, sourcePath);
    if (!sourceFile) throw new Error(`Source file "${sourcePath}" was not found.`);
    await writeFile(rootHandle, destinationPath, sourceFile);
    await deleteFile(rootHandle, sourcePath);
  }

  async function getDirectory(rootHandle, relativePath) {
    let dirHandle = rootHandle;
    for (const segment of relativePath.split("/").filter(Boolean)) {
      dirHandle = await dirHandle.getDirectoryHandle(segment);
    }
    return dirHandle;
  }

  async function copyDirectoryContents(sourceHandle, targetHandle) {
    for await (const entry of sourceHandle.values()) {
      if (entry.kind === "file") {
        const file = await entry.getFile();
        const targetFile = await targetHandle.getFileHandle(entry.name, { create: true });
        const writable = await targetFile.createWritable();
        await writable.write(file);
        await writable.close();
      } else if (entry.kind === "directory") {
        const targetDirectory = await targetHandle.getDirectoryHandle(entry.name, { create: true });
        await copyDirectoryContents(entry, targetDirectory);
      }
    }
  }

  // File System Access has no rename/move primitive. Copy first, preserving every Section asset
  // and support file, and leave the source untouched until the caller has completed its updates.
  async function copyDirectory(rootHandle, sourcePath, destinationPath) {
    const sourceHandle = await getDirectory(rootHandle, sourcePath);
    const destinationSegments = destinationPath.split("/").filter(Boolean);
    const destinationName = destinationSegments.pop();
    const destinationParent = await getDirectory(rootHandle, destinationSegments.join("/"));
    try {
      await destinationParent.getDirectoryHandle(destinationName);
      throw new Error(`Destination folder "${destinationPath}" already exists.`);
    } catch (error) {
      if (!error || error.name !== "NotFoundError") throw error;
    }
    const destinationHandle = await destinationParent.getDirectoryHandle(destinationName, { create: true });
    await copyDirectoryContents(sourceHandle, destinationHandle);
  }

  // Section and Slide scripts use their content path as a registry key. Rewrite the exact old
  // prefix in every JavaScript file after copying a Section to its new Category folder.
  async function replaceTextInJavaScriptFiles(rootHandle, relativePath, searchText, replacementText) {
    const directory = await getDirectory(rootHandle, relativePath);
    async function visit(dirHandle) {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === "directory") {
          await visit(entry);
          continue;
        }
        if (!entry.name.endsWith(".js")) continue;
        const file = await entry.getFile();
        const text = await file.text();
        if (!text.includes(searchText)) continue;
        const writable = await entry.createWritable();
        await writable.write(text.split(searchText).join(replacementText));
        await writable.close();
      }
    }
    await visit(directory);
  }

  window.umedEditorFS = {
    getContentRootHandle,
    writeTextFile: writeFile,
    writeBinaryFile: writeFile,
    getExistingFile,
    listFiles,
    moveFile,
    deleteFile,
    deleteDirectory,
    copyDirectory,
    replaceTextInJavaScriptFiles
  };
})();
