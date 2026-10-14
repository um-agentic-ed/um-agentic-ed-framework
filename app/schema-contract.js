(function () {
  "use strict";

  const INDEX_SCHEMA_VERSION = 3;
  const SLIDE_SCHEMA_VERSION = 2;
  const NOTES_SCHEMA_VERSION = 2;
  const SKILL_MANIFEST_SCHEMA_VERSION = 1;
  const NOTES_FILE_FORMAT = "umed-learner-notes";
  const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const LEVELS = new Set(["foundations", "core-learning", "advanced-topics"]);

  function failure(documentType, path, version, message) {
    return {
      valid: false,
      writable: false,
      documentType,
      path,
      version,
      message
    };
  }

  function success(documentType, path, version) {
    return {
      valid: true,
      writable: true,
      documentType,
      path,
      version,
      message: ""
    };
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isNonemptyString(value) {
    return typeof value === "string" && Boolean(value.trim());
  }

  function isUuid(value) {
    return typeof value === "string" && UUID_V4_PATTERN.test(value);
  }

  function isOrder(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function validateVersion(documentType, path, field, actual, expected) {
    if (!Number.isInteger(actual)) {
      return failure(documentType, path, actual, `${field} must be the integer ${expected}.`);
    }
    if (actual !== expected) {
      return failure(
        documentType,
        path,
        actual,
        `${field} ${actual} is not supported by this Framework; expected ${expected}.`
      );
    }
    return null;
  }

  function validateIndex(index) {
    const documentType = "content index";
    const rootPath = "src/content/content-index.js";
    if (!isObject(index)) return failure(documentType, rootPath, undefined, "The index must be an object.");

    const versionFailure = validateVersion(
      documentType,
      rootPath,
      "indexSchemaVersion",
      index.indexSchemaVersion,
      INDEX_SCHEMA_VERSION
    );
    if (versionFailure) return versionFailure;
    if (!isUuid(index.appOverviewUuid)) {
      return failure(documentType, rootPath, index.indexSchemaVersion, "appOverviewUuid must be a canonical UUID v4.");
    }
    if (!Array.isArray(index.subjects)) {
      return failure(documentType, rootPath, index.indexSchemaVersion, "subjects must be an array.");
    }

    const seenUuids = new Set([index.appOverviewUuid.toLowerCase()]);
    const validateEntry = (entry, path, childrenField) => {
      if (!isObject(entry)) return `${path} must be an object.`;
      if (!isNonemptyString(entry.id)) return `${path}.id must be a nonempty string.`;
      if (!isUuid(entry.uuid)) return `${path}.uuid must be a canonical UUID v4.`;
      const normalizedUuid = entry.uuid.toLowerCase();
      if (seenUuids.has(normalizedUuid)) return `${path}.uuid duplicates another index UUID.`;
      seenUuids.add(normalizedUuid);
      if (!isNonemptyString(entry.title)) return `${path}.title must be a nonempty string.`;
      if (!isOrder(entry.order)) return `${path}.order must be a finite number.`;
      if (!Array.isArray(entry[childrenField])) return `${path}.${childrenField} must be an array.`;
      return "";
    };

    const siblingIdsAreUnique = (entries, path) => {
      const ids = new Set();
      for (const entry of entries) {
        if (isObject(entry) && isNonemptyString(entry.id)) {
          if (ids.has(entry.id)) return `${path} contains duplicate id "${entry.id}".`;
          ids.add(entry.id);
        }
      }
      return "";
    };

    let problem = siblingIdsAreUnique(index.subjects, "subjects");
    if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);
    for (let subjectIndex = 0; subjectIndex < index.subjects.length; subjectIndex += 1) {
      const subject = index.subjects[subjectIndex];
      const subjectPath = `subjects[${subjectIndex}]`;
      problem = validateEntry(subject, subjectPath, "categories");
      if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);
      problem = siblingIdsAreUnique(subject.categories, `${subjectPath}.categories`);
      if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);

      for (let categoryIndex = 0; categoryIndex < subject.categories.length; categoryIndex += 1) {
        const category = subject.categories[categoryIndex];
        const categoryPath = `${subjectPath}.categories[${categoryIndex}]`;
        problem = validateEntry(category, categoryPath, "sections");
        if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);
        problem = siblingIdsAreUnique(category.sections, `${categoryPath}.sections`);
        if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);

        for (let sectionIndex = 0; sectionIndex < category.sections.length; sectionIndex += 1) {
          const section = category.sections[sectionIndex];
          const sectionPath = `${categoryPath}.sections[${sectionIndex}]`;
          problem = validateEntry(section, sectionPath, "slides");
          if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);
          problem = siblingIdsAreUnique(section.slides, `${sectionPath}.slides`);
          if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);

          for (let slideIndex = 0; slideIndex < section.slides.length; slideIndex += 1) {
            const slide = section.slides[slideIndex];
            const slidePath = `${sectionPath}.slides[${slideIndex}]`;
            if (!isObject(slide)) problem = `${slidePath} must be an object.`;
            else if (!isNonemptyString(slide.id)) problem = `${slidePath}.id must be a nonempty string.`;
            else if (!isUuid(slide.uuid)) problem = `${slidePath}.uuid must be a canonical UUID v4.`;
            else if (seenUuids.has(slide.uuid.toLowerCase())) problem = `${slidePath}.uuid duplicates another index UUID.`;
            else {
              seenUuids.add(slide.uuid.toLowerCase());
              if (!isNonemptyString(slide.title)) problem = `${slidePath}.title must be a nonempty string.`;
              else if (!LEVELS.has(slide.level)) problem = `${slidePath}.level is not supported.`;
              else if (!isOrder(slide.order)) problem = `${slidePath}.order must be a finite number.`;
              else if (!Array.isArray(slide.keywords) || slide.keywords.some(keyword => typeof keyword !== "string")) {
                problem = `${slidePath}.keywords must be an array of strings.`;
              } else if (slide.keywordsUpdatedAt !== undefined && !isNonemptyString(slide.keywordsUpdatedAt)) {
                problem = `${slidePath}.keywordsUpdatedAt must be omitted or a nonempty string.`;
              }
            }
            if (problem) return failure(documentType, rootPath, index.indexSchemaVersion, problem);
          }
        }
      }
    }
    return success(documentType, rootPath, index.indexSchemaVersion);
  }

  function validateSlide(slide, options = {}) {
    const kind = options.kind === "slide" ? "content Slide" : "landing Slide";
    const path = options.path || options.key || "unknown content file";
    if (!isObject(slide)) return failure(kind, path, undefined, "The Slide must be an object.");

    const versionFailure = validateVersion(
      kind,
      path,
      "slideSchemaVersion",
      slide.slideSchemaVersion,
      SLIDE_SCHEMA_VERSION
    );
    if (versionFailure) return versionFailure;
    if (!isUuid(slide.uuid)) return failure(kind, path, slide.slideSchemaVersion, "uuid must be a canonical UUID v4.");
    if (!isNonemptyString(slide.title)) return failure(kind, path, slide.slideSchemaVersion, "title must be a nonempty string.");
    if (!isObject(slide.content) || !Array.isArray(slide.content.blocks)) {
      return failure(kind, path, slide.slideSchemaVersion, "content.blocks must be an array.");
    }
    for (let index = 0; index < slide.content.blocks.length; index += 1) {
      const block = slide.content.blocks[index];
      if (!isObject(block) || !isNonemptyString(block.type)) {
        return failure(kind, path, slide.slideSchemaVersion, `content.blocks[${index}].type must be a nonempty string.`);
      }
    }
    if (options.kind === "slide") {
      if (!isNonemptyString(slide.id)) return failure(kind, path, slide.slideSchemaVersion, "id must be a nonempty string.");
      if (!LEVELS.has(slide.level)) return failure(kind, path, slide.slideSchemaVersion, "level is not supported.");
      if (!isOrder(slide.order)) return failure(kind, path, slide.slideSchemaVersion, "order must be a finite number.");
      if (!isNonemptyString(slide.contentUpdatedAt)) {
        return failure(kind, path, slide.slideSchemaVersion, "contentUpdatedAt must be a nonempty string.");
      }
    }
    return success(kind, path, slide.slideSchemaVersion);
  }

  function validateNotesFile(payload, options = {}) {
    const documentType = "learner-notes file";
    const path = options.path || "selected notes file";
    if (!isObject(payload)) return failure(documentType, path, undefined, "The notes file must contain an object.");

    const versionFailure = validateVersion(
      documentType,
      path,
      "notesSchemaVersion",
      payload.notesSchemaVersion,
      NOTES_SCHEMA_VERSION
    );
    if (versionFailure) return versionFailure;
    if (payload.format !== NOTES_FILE_FORMAT) {
      return failure(documentType, path, payload.notesSchemaVersion, `format must be "${NOTES_FILE_FORMAT}".`);
    }
    if (!isObject(payload.app) || !isUuid(payload.app.uuid) || !isNonemptyString(payload.app.name)) {
      return failure(documentType, path, payload.notesSchemaVersion, "app must contain a canonical UUID v4 and nonempty name.");
    }
    if (!isNonemptyString(payload.exportedAt)) {
      return failure(documentType, path, payload.notesSchemaVersion, "exportedAt must be a nonempty string.");
    }
    if (!Array.isArray(payload.notes)) {
      return failure(documentType, path, payload.notesSchemaVersion, "notes must be an array.");
    }
    for (let index = 0; index < payload.notes.length; index += 1) {
      const note = payload.notes[index];
      if (!isObject(note) || !isUuid(note.slideUuid) || typeof note.text !== "string") {
        return failure(documentType, path, payload.notesSchemaVersion, `notes[${index}] must contain a Slide UUID and text string.`);
      }
      if (note.drawing !== null && note.drawing !== undefined && !isObject(note.drawing)) {
        return failure(documentType, path, payload.notesSchemaVersion, `notes[${index}].drawing must be an object or null.`);
      }
    }
    return success(documentType, path, payload.notesSchemaVersion);
  }

  function validateNoteRecord(record, options = {}) {
    const documentType = "learner-note record";
    const path = options.path || "IndexedDB learner-note record";
    if (!isObject(record)) return failure(documentType, path, undefined, "The note record must be an object.");

    const versionFailure = validateVersion(
      documentType,
      path,
      "notesSchemaVersion",
      record.notesSchemaVersion,
      NOTES_SCHEMA_VERSION
    );
    if (versionFailure) return versionFailure;
    if (!isUuid(record.appUuid) || !isUuid(record.slideUuid)) {
      return failure(documentType, path, record.notesSchemaVersion, "appUuid and slideUuid must be canonical UUID v4 values.");
    }
    if (typeof record.text !== "string") {
      return failure(documentType, path, record.notesSchemaVersion, "text must be a string.");
    }
    if (record.drawing !== null && record.drawing !== undefined && !isObject(record.drawing)) {
      return failure(documentType, path, record.notesSchemaVersion, "drawing must be an object or null.");
    }
    if (!isNonemptyString(record.updatedAt)) {
      return failure(documentType, path, record.notesSchemaVersion, "updatedAt must be a nonempty string.");
    }
    return success(documentType, path, record.notesSchemaVersion);
  }

  function validateSkillManifest(manifest, options = {}) {
    const documentType = "agent-skill manifest";
    const path = options.path || "agent-skills/manifest.json";
    if (!isObject(manifest)) return failure(documentType, path, undefined, "The manifest must contain an object.");

    const versionFailure = validateVersion(
      documentType,
      path,
      "skillManifestSchemaVersion",
      manifest.skillManifestSchemaVersion,
      SKILL_MANIFEST_SCHEMA_VERSION
    );
    if (versionFailure) return versionFailure;
    if (!Array.isArray(manifest.buildAppTasks)) {
      return failure(documentType, path, manifest.skillManifestSchemaVersion, "buildAppTasks must be an array.");
    }
    const names = new Set();
    for (let index = 0; index < manifest.buildAppTasks.length; index += 1) {
      const task = manifest.buildAppTasks[index];
      if (!isObject(task) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.name || "") || !isNonemptyString(task.description) ||
          typeof task.argumentHint !== "string" || !isNonemptyString(task.file)) {
        return failure(
          documentType,
          path,
          manifest.skillManifestSchemaVersion,
          `buildAppTasks[${index}] must contain name, description, argumentHint, and file fields.`
        );
      }
      if (names.has(task.name)) {
        return failure(documentType, path, manifest.skillManifestSchemaVersion, `Task name "${task.name}" is duplicated.`);
      }
      names.add(task.name);
      if (task.file !== `${task.name}.md`) {
        return failure(documentType, path, manifest.skillManifestSchemaVersion, `Task "${task.name}" must use file "${task.name}.md".`);
      }
    }
    return success(documentType, path, manifest.skillManifestSchemaVersion);
  }

  function diagnostic(result) {
    if (!result || result.valid) return "";
    return `${result.documentType} at ${result.path} is incompatible: ${result.message}`;
  }

  function assertWritable(result) {
    if (!result || !result.valid || !result.writable) {
      throw new Error(diagnostic(result) || "The document schema is not writable by this Framework.");
    }
  }

  window.umedSchemaContract = Object.freeze({
    index: Object.freeze({ current: INDEX_SCHEMA_VERSION, readable: Object.freeze([INDEX_SCHEMA_VERSION]), writable: Object.freeze([INDEX_SCHEMA_VERSION]) }),
    slide: Object.freeze({ current: SLIDE_SCHEMA_VERSION, readable: Object.freeze([SLIDE_SCHEMA_VERSION]), writable: Object.freeze([SLIDE_SCHEMA_VERSION]) }),
    notes: Object.freeze({ current: NOTES_SCHEMA_VERSION, format: NOTES_FILE_FORMAT, readable: Object.freeze([NOTES_SCHEMA_VERSION]), writable: Object.freeze([NOTES_SCHEMA_VERSION]) }),
    skillManifest: Object.freeze({ current: SKILL_MANIFEST_SCHEMA_VERSION, readable: Object.freeze([SKILL_MANIFEST_SCHEMA_VERSION]), writable: Object.freeze([SKILL_MANIFEST_SCHEMA_VERSION]) }),
    validateIndex,
    validateSlide,
    validateNotesFile,
    validateNoteRecord,
    validateSkillManifest,
    diagnostic,
    assertWritable
  });
})();
