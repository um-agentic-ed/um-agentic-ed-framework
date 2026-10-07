(function () {
  "use strict";

  // Shared File System Access API helper for Editor Mode saves. Editors choose the root folder of
  // their App's Parent repository once per session (on first save). That choice is verified and
  // narrowed to its src/content folder, which every other Editor path is relative to, so the
  // Editor can only write inside the App's content.
  const CONTENT_ROOT_LABEL = window.umedContentRoot;
  let rootHandlePromise = null;
  let appRootHandle = null;
  let mutationQueue = Promise.resolve();

  // Chrome can reject a File System Access operation when a synced placeholder file (Dropbox
  // Smart Sync, OneDrive Files On-Demand, etc.) changes state between resolving its handle and
  // reading/writing it. Two symptoms are both transient and worth retrying:
  // - A "stale interface object" error when a cached handle's underlying file changed on disk.
  // - A bare NotFoundError, because every file in a cloud-synced folder is really an NTFS
  //   reparse point: reading one that isn't locally cached yet makes the cloud filter driver
  //   hydrate it from the network first, and a read that lands mid-hydration (or mid-sync of a
  //   directory listing) can surface as "not found" even though the file genuinely exists.
  // Retrying is only safe where re-resolving the full path and redoing the read/write/traversal
  // is idempotent, which is true everywhere below. Callers that use NotFoundError to mean
  // "legitimately doesn't exist" (getExistingFile, directoryExists, listFiles, getSubdirectory,
  // the destination-already-exists check in copyDirectory) still get that exact contract: they
  // only conclude "doesn't exist" once every retry has also seen NotFoundError, so a hydration
  // delay can never be mistaken for a real absence.
  function isStaleInterfaceStateError(error) {
    return Boolean(error && /state cached in an interface object.*changed since it was read from disk/i.test(error.message || ""));
  }

  function isTransientFsError(error) {
    return isStaleInterfaceStateError(error) || Boolean(error && error.name === "NotFoundError");
  }

  // Hydrating a cloud-only placeholder file can genuinely take real seconds, not milliseconds, so
  // later attempts wait much longer than a plain network blip would need. PROBE_ATTEMPTS (short,
  // ~1.4s total) is for fast existence checks; BULK_ATTEMPTS (long, ~9s total) is for operations
  // that must actually succeed, e.g. reading/writing/traversing content during a copy, move, save
  // or export.
  const PROBE_ATTEMPTS = 4;
  const BULK_ATTEMPTS = 7;

  function retryDelayMs(attempt) {
    return Math.min(200 * 2 ** attempt, 3000);
  }

  function retryDelay(attempt) {
    return new Promise(resolve => setTimeout(resolve, retryDelayMs(attempt)));
  }

  // `label`, when given, logs every retry attempt and the final outcome to the console so an
  // Editor who hits a persistent failure can report exactly which operation and path was
  // involved, how many attempts ran, and the error's precise name/message, rather than only the
  // single alert text that reaches main.js.
  async function withRetry(operation, maxAttempts, label) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const result = await operation();
        if (label && attempt > 0) console.info(`[umedEditorFS] ${label}: succeeded on attempt ${attempt + 1}/${maxAttempts}`);
        return result;
      } catch (error) {
        const isLast = attempt === maxAttempts - 1;
        if (!isTransientFsError(error) || isLast) {
          if (label) console.error(`[umedEditorFS] ${label}: FAILED on attempt ${attempt + 1}/${maxAttempts} with ${error && error.name}: ${error && error.message}`);
          throw error;
        }
        if (label) console.warn(`[umedEditorFS] ${label}: attempt ${attempt + 1}/${maxAttempts} failed with ${error && error.name}: ${error && error.message}; retrying in ${retryDelayMs(attempt)}ms`);
        await retryDelay(attempt);
      }
    }
  }

  // Retries like withRetry, but a NotFoundError that persists through every attempt resolves to
  // `null` instead of throwing, for call sites whose contract is "null/false means not found".
  async function withRetryOrMissing(operation, maxAttempts, label) {
    try {
      return await withRetry(operation, maxAttempts, label);
    } catch (error) {
      if (error && error.name === "NotFoundError") return null;
      throw error;
    }
  }

  // All mutations share one queue. Several Editor workflows update content-index.js in addition
  // to their primary file, and without coordination two otherwise valid UI actions can overlap
  // those writes and invalidate one another's browser-side filesystem state.
  function enqueueMutation(operation) {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function getSubdirectory(parentHandle, name) {
    return withRetryOrMissing(() => parentHandle.getDirectoryHandle(name), PROBE_ATTEMPTS);
  }

  async function readRootFileText(rootFolderHandle, fileName) {
    return withRetryOrMissing(async () => {
      const fileHandle = await rootFolderHandle.getFileHandle(fileName);
      return await (await fileHandle.getFile()).text();
    }, PROBE_ATTEMPTS);
  }

  async function pickContentRoot() {
    const explainAndProceed = window.umedComponents && window.umedComponents.confirm
      ? window.umedComponents.confirm(
          `Editing or exporting needs one-time access to this App's project folder. In the next dialog, ` +
          `browse to your local copy of this App and select its root folder (the one that contains ` +
          `"app.js", "index.html" and "src"), then choose it. Changes are only written inside ` +
          `its "${CONTENT_ROOT_LABEL}" folder when you save edits.`,
          { confirmLabel: "Choose folder\u2026", cancelLabel: "Cancel" }
        )
      : Promise.resolve(true);

    if (!(await explainAndProceed)) return null;

    let rootFolderHandle;
    try {
      rootFolderHandle = await window.showDirectoryPicker({ id: "umed-app-root", mode: "readwrite" });
    } catch (error) {
      if (error && error.name === "AbortError") return null;
      throw error;
    }

    const sourceHandle = await getSubdirectory(rootFolderHandle, "src");
    const contentHandle = sourceHandle && await getSubdirectory(sourceHandle, "content");
    if (!contentHandle) {
      const pickAgain = window.umedComponents && window.umedComponents.confirm
        ? await window.umedComponents.confirm(
            `You selected "${rootFolderHandle.name}", which does not contain a "${CONTENT_ROOT_LABEL}" folder. ` +
            `Select the root folder of this App instead.`,
            { confirmLabel: "Pick again", cancelLabel: "Cancel" }
          )
        : false;
      return pickAgain ? pickContentRoot() : null;
    }

    // The root app.js declares the App's immutable appUuid, so a folder whose app.js lacks this
    // App's UUID is probably a different App; confirm before writing into it.
    const appUuid = window.umedAppIdentity && window.umedAppIdentity.appUuid;
    if (appUuid) {
      const rootAppScript = await readRootFileText(rootFolderHandle, "app.js");
      if (rootAppScript === null || !rootAppScript.includes(appUuid)) {
        const useAnyway = window.umedComponents && window.umedComponents.confirm
          ? await window.umedComponents.confirm(
              `The "app.js" in "${rootFolderHandle.name}" does not declare this App's appUuid, so this may be a ` +
              `different App. Use it anyway?`,
              { confirmLabel: "Use this folder", cancelLabel: "Pick again" }
            )
          : true;
        if (!useAnyway) return pickContentRoot();
      }
    }
    appRootHandle = rootFolderHandle;
    return contentHandle;
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
  // `maxAttempts` defaults to the patient bulk budget; the path-length probe below passes 1
  // (no retry) since a too-long-path failure there is deterministic, not transient.
  async function writeFile(rootHandle, relativePath, content, maxAttempts = BULK_ATTEMPTS) {
    const segments = relativePath.split("/");
    const fileName = segments.pop();
    await withRetry(async () => {
      let dirHandle = rootHandle;
      for (const segment of segments) {
        dirHandle = await dirHandle.getDirectoryHandle(segment, { create: true });
      }
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    }, maxAttempts, maxAttempts > 1 ? `writeFile ${relativePath}` : undefined);
  }

  // Looks up a file that may already exist at relativePath (e.g. to check for an upload name
  // collision) without creating anything. Returns the File (with its .size) or null if either
  // the folder or the file itself doesn't exist yet. Defaults to the fast probe budget; pass
  // BULK_ATTEMPTS when the file is expected to genuinely exist (e.g. moveFile's source).
  async function getExistingFile(rootHandle, relativePath, maxAttempts = PROBE_ATTEMPTS) {
    const segments = relativePath.split("/");
    const fileName = segments.pop();
    return withRetryOrMissing(async () => {
      let dirHandle = rootHandle;
      for (const segment of segments) {
        dirHandle = await dirHandle.getDirectoryHandle(segment);
      }
      const fileHandle = await dirHandle.getFileHandle(fileName);
      return await fileHandle.getFile();
    }, maxAttempts);
  }

  // Idempotent and retried: a cleanup delete (e.g. rolling back a failed splitSection/moveSection
  // copy) can race the same Dropbox-sync staleness as the copy it's undoing, and a target that's
  // already gone (from a prior partial cleanup attempt) should count as success, not failure.
  async function deleteDirectory(rootHandle, relativePath) {
    const segments = relativePath.split("/");
    const targetName = segments.pop();
    await withRetry(async () => {
      let dirHandle = rootHandle;
      for (const segment of segments) {
        dirHandle = await dirHandle.getDirectoryHandle(segment);
      }
      try {
        await dirHandle.removeEntry(targetName, { recursive: true });
      } catch (error) {
        if (error && error.name === "NotFoundError") return;
        throw error;
      }
    }, BULK_ATTEMPTS, `deleteDirectory ${relativePath}`);
  }

  // Removes one file without affecting sibling trusted sources or other Section assets. Same
  // idempotent-and-retried treatment as deleteDirectory.
  async function deleteFile(rootHandle, relativePath) {
    const segments = relativePath.split("/");
    const targetName = segments.pop();
    await withRetry(async () => {
      let dirHandle = rootHandle;
      for (const segment of segments) {
        dirHandle = await dirHandle.getDirectoryHandle(segment);
      }
      try {
        await dirHandle.removeEntry(targetName);
      } catch (error) {
        if (error && error.name === "NotFoundError") return;
        throw error;
      }
    }, BULK_ATTEMPTS, `deleteFile ${relativePath}`);
  }

  async function listFiles(rootHandle, relativePath) {
    const result = await withRetryOrMissing(async () => {
      let dirHandle = rootHandle;
      for (const segment of relativePath.split("/").filter(Boolean)) {
        dirHandle = await dirHandle.getDirectoryHandle(segment);
      }
      const names = [];
      for await (const entry of dirHandle.values()) {
        if (entry.kind === "file") names.push(entry.name);
      }
      return names;
    }, PROBE_ATTEMPTS);
    return (result || []).sort((a, b) => a.localeCompare(b));
  }

  // Recursively lists every file under relativePath, returned as paths relative to it (posix
  // "/"-joined, e.g. "slide.js" or "_unused/source-composite.png"). Read-only; used to preflight
  // the exact destination paths a copy would create, before any write is attempted. The source is
  // expected to genuinely exist (it's about to be copied for real), so this uses the patient bulk
  // retry budget throughout, matching the copy operation it's preflighting.
  async function listFilesRecursive(rootHandle, relativePath) {
    const directory = await getDirectory(rootHandle, relativePath, BULK_ATTEMPTS);
    async function visit(dirHandle, prefix) {
      return withRetry(async () => {
        const names = [];
        for await (const entry of dirHandle.values()) {
          if (entry.kind === "file") {
            names.push(prefix ? `${prefix}/${entry.name}` : entry.name);
          } else if (entry.kind === "directory") {
            const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
            names.push(...await visit(entry, childPrefix));
          }
        }
        return names;
      }, BULK_ATTEMPTS, `listFilesRecursive ${relativePath}/${prefix}`);
    }
    return visit(directory, "");
  }

  // The File System Access API never exposes the absolute OS path above the content root (by
  // design, for security), so a too-long-path failure can't be predicted from the relative paths
  // we construct alone. Instead, empirically probe once per session: try writing a file at a
  // deliberately long relative path and see how much of Windows' classic 260-character MAX_PATH
  // budget is already used up by this Editor's exact folder location -- a frequent problem when
  // the project folder is itself deeply nested, e.g. inside a Dropbox or OneDrive synced folder.
  // A path-too-long failure is deterministic (not transient), so each candidate is tried once,
  // with no retry, keeping the whole probe fast even when several candidates are too long.
  const PATH_PROBE_FOLDER = ".umed-path-probe";
  const PATH_PROBE_CANDIDATE_LENGTHS = [220, 180, 150, 120, 90, 60];
  let cachedSafeRelativePathLength = null;

  async function calibrateSafeRelativePathLength(rootHandle) {
    if (cachedSafeRelativePathLength !== null) return cachedSafeRelativePathLength;
    for (const length of PATH_PROBE_CANDIDATE_LENGTHS) {
      const suffix = ".tmp";
      const padding = Math.max(1, length - PATH_PROBE_FOLDER.length - 1 - suffix.length);
      const relativePath = `${PATH_PROBE_FOLDER}/${"x".repeat(padding)}${suffix}`;
      try {
        await writeFile(rootHandle, relativePath, "", 1);
        await deleteDirectory(rootHandle, PATH_PROBE_FOLDER);
        cachedSafeRelativePathLength = relativePath.length;
        return cachedSafeRelativePathLength;
      } catch (error) {
        if (!(error && error.name === "NotFoundError")) throw error;
        // Too long for this filesystem/location; try the next, shorter candidate.
      }
    }
    cachedSafeRelativePathLength = PATH_PROBE_CANDIDATE_LENGTHS[PATH_PROBE_CANDIDATE_LENGTHS.length - 1];
    return cachedSafeRelativePathLength;
  }

  // Refuses up front, with a clear and actionable message, when any of `relativePaths` (paths a
  // pending copy/move would create, content-root-relative) is longer than this Editor's
  // calibrated safe budget -- instead of only discovering the problem after a long, confusing
  // retry-then-fail during the real copy.
  async function checkPathBudget(rootHandle, relativePaths) {
    if (!relativePaths.length) return;
    const safeLength = await calibrateSafeRelativePathLength(rootHandle);
    const longestPath = relativePaths.reduce((longest, path) => path.length > longest.length ? path : longest);
    if (longestPath.length > safeLength) {
      throw new Error(
        `This would create a file path too long for this computer's file system: "${longestPath}" is ` +
        `${longestPath.length} characters, beyond the roughly ${safeLength} this project's current location ` +
        `supports. This is common when the project folder itself is deeply nested, e.g. inside a Dropbox or ` +
        `OneDrive synced folder. Try a shorter Section or Slide name.`
      );
    }
  }

  // File System Access has no move primitive. Copy the complete File into the destination first,
  // creating `_unused` only when needed, then remove the source after the write succeeds. The
  // source is expected to genuinely exist, so use the bulk (patient) retry budget rather than
  // getExistingFile's default fast-probe budget.
  async function moveFile(rootHandle, sourcePath, destinationPath) {
    const sourceFile = await getExistingFile(rootHandle, sourcePath, BULK_ATTEMPTS);
    if (!sourceFile) throw new Error(`Source file "${sourcePath}" was not found.`);
    await writeFile(rootHandle, destinationPath, sourceFile);
    await deleteFile(rootHandle, sourcePath);
  }

  async function getDirectory(rootHandle, relativePath, maxAttempts = BULK_ATTEMPTS, quiet = false) {
    const segments = relativePath.split("/").filter(Boolean);
    return withRetry(async () => {
      let dirHandle = rootHandle;
      for (const segment of segments) {
        dirHandle = await dirHandle.getDirectoryHandle(segment);
      }
      return dirHandle;
    }, maxAttempts, quiet ? undefined : `getDirectory ${relativePath}`);
  }

  // A fast probe (e.g. splitSection confirming its new Section folder doesn't already exist):
  // most calls legitimately resolve to "doesn't exist" quickly, so this intentionally uses the
  // short PROBE_ATTEMPTS budget (and stays quiet) rather than getDirectory's default, logged,
  // bulk-operation behavior.
  async function directoryExists(rootHandle, relativePath) {
    try {
      await getDirectory(rootHandle, relativePath, PROBE_ATTEMPTS, true);
      return true;
    } catch (error) {
      if (error && error.name === "NotFoundError") return false;
      throw error;
    }
  }

  async function copyDirectoryContents(sourceHandle, targetHandle, pathLabel) {
    await withRetry(async () => {
      for await (const entry of sourceHandle.values()) {
        const entryLabel = `${pathLabel}/${entry.name}`;
        if (entry.kind === "file") {
          const file = await entry.getFile();
          const targetFile = await targetHandle.getFileHandle(entry.name, { create: true });
          const writable = await targetFile.createWritable();
          await writable.write(file);
          await writable.close();
        } else if (entry.kind === "directory") {
          const targetDirectory = await targetHandle.getDirectoryHandle(entry.name, { create: true });
          await copyDirectoryContents(entry, targetDirectory, entryLabel);
        }
      }
    }, BULK_ATTEMPTS, `copyDirectoryContents ${pathLabel}`);
  }

  // File System Access has no rename/move primitive. Copy first, preserving every Section asset
  // and support file, and leave the source untouched until the caller has completed its updates.
  async function copyDirectory(rootHandle, sourcePath, destinationPath) {
    console.info(`[umedEditorFS] copyDirectory: ${sourcePath} -> ${destinationPath}`);
    const sourceHandle = await getDirectory(rootHandle, sourcePath);
    const destinationSegments = destinationPath.split("/").filter(Boolean);
    const destinationName = destinationSegments.pop();
    const destinationParent = await getDirectory(rootHandle, destinationSegments.join("/"));
    try {
      await withRetry(() => destinationParent.getDirectoryHandle(destinationName), PROBE_ATTEMPTS);
      throw new Error(`Destination folder "${destinationPath}" already exists.`);
    } catch (error) {
      if (!error || error.name !== "NotFoundError") throw error;
    }
    const destinationHandle = await destinationParent.getDirectoryHandle(destinationName, { create: true });
    await copyDirectoryContents(sourceHandle, destinationHandle, destinationPath);
  }

  // Section and Slide scripts use their content path as a registry key. Rewrite the exact old
  // prefix in every JavaScript file after copying a Section to its new Category folder.
  async function replaceTextInJavaScriptFiles(rootHandle, relativePath, searchText, replacementText) {
    const directory = await getDirectory(rootHandle, relativePath);
    async function visit(dirHandle, pathLabel) {
      await withRetry(async () => {
        for await (const entry of dirHandle.values()) {
          if (entry.kind === "directory") {
            await visit(entry, `${pathLabel}/${entry.name}`);
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
      }, BULK_ATTEMPTS, `replaceTextInJavaScriptFiles ${pathLabel}`);
    }
    await visit(directory, relativePath);
  }

  window.umedEditorFS = {
    getContentRootHandle,
    getAppRootHandle: async () => {
      const contentHandle = await getContentRootHandle();
      return contentHandle ? appRootHandle : null;
    },
    writeTextFile: (...args) => enqueueMutation(() => writeFile(...args)),
    writeBinaryFile: (...args) => enqueueMutation(() => writeFile(...args)),
    getExistingFile,
    directoryExists,
    listFiles,
    moveFile: (...args) => enqueueMutation(() => moveFile(...args)),
    deleteFile: (...args) => enqueueMutation(() => deleteFile(...args)),
    deleteDirectory: (...args) => enqueueMutation(() => deleteDirectory(...args)),
    copyDirectory: (...args) => enqueueMutation(() => copyDirectory(...args)),
    replaceTextInJavaScriptFiles: (...args) => enqueueMutation(() => replaceTextInJavaScriptFiles(...args)),
    listFilesRecursive,
    // Wrapped in the mutation queue because calibration performs a real probe write + delete.
    checkPathBudget: (...args) => enqueueMutation(() => checkPathBudget(...args)),
    // Exposed so other Editor-mode modules (e.g. single-file-export.js, which reads every file in
    // the content tree in one pass) can apply the same cloud-sync-aware retry policy to their own
    // raw File System Access reads instead of duplicating it.
    withRetry,
    BULK_ATTEMPTS
  };
})();
