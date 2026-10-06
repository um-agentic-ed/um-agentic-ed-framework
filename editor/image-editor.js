(function () {
  "use strict";

  const SUPPORTED = new Set(["jpg", "jpeg", "png", "webp"]);
  const COLORS = [
    ["#111111", "Black"], ["#737b84", "Grey"], ["#d9dde1", "Light grey"],
    ["#0072b2", "Blue"], ["#007a5e", "Teal"], ["#b24c00", "Orange"],
    ["#c62828", "Vermilion"], ["#7a3e9d", "Purple"], ["#b08a00", "Ochre"]
  ];
  const MAX_HISTORY = 15;
  let dialog = null;
  let session = null;

  const joinPath = (dir, name) => dir ? `${dir}/${name}` : name;

  function splitVersionedName(fileName) {
    const dot = fileName.lastIndexOf(".");
    const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
    const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;
    const match = stem.match(/^(.*)_v(\d+)$/i);
    return { base: match ? match[1] : stem, version: match ? Number(match[2]) : 1, extension };
  }

  function versionForName(fileName, lineage) {
    const parsed = splitVersionedName(fileName);
    return parsed.extension === lineage.extension && parsed.base.toLowerCase() === lineage.base.toLowerCase()
      ? parsed.version
      : null;
  }

  async function nextVersionName(rootHandle, relativeDir, fileName) {
    const lineage = splitVersionedName(fileName);
    const activeNames = await window.umedEditorFS.listFiles(rootHandle, relativeDir);
    const unusedNames = await window.umedEditorFS.listFiles(rootHandle, joinPath(relativeDir, "_unused"));
    const versions = [...activeNames, ...unusedNames]
      .map(name => versionForName(name, lineage))
      .filter(version => version !== null);
    return `${lineage.base}_v${Math.max(lineage.version, ...versions) + 1}.${lineage.extension}`;
  }

  function colorPickerMarkup(target, selected) {
    const choices = COLORS.map(([color, name]) =>
      `<button type="button" class="whiteboard-color" data-whiteboard-color="${color}" data-image-editor-color="${color}" aria-label="${name} ${target}" aria-pressed="${color === selected}"></button>`
    ).join("");
    return `<div class="whiteboard-color-picker" data-whiteboard-color-target="${target}" data-image-editor-color-target="${target}">
      <button class="whiteboard-color-toggle" type="button" aria-label="Choose ${target} color" title="${target === "border" ? "Border" : "Fill"} color" aria-haspopup="true" aria-expanded="false"></button>
      <div class="whiteboard-color-popup" role="group" aria-label="${target} color choices" hidden>${choices}</div>
    </div>`;
  }

  function toolButton(tool, label, pressed = false) {
    return `<button type="button" class="whiteboard-icon-button" data-image-editor-tool="${tool}" aria-label="${label}" title="${label}" aria-pressed="${pressed}"></button>`;
  }

  function actionButton(action, label) {
    return `<button type="button" class="whiteboard-icon-button" data-image-editor-action="${action}" aria-label="${label}" title="${label}"></button>`;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "image-editor-dialog";
    dialog.innerHTML = `<div class="image-editor-shell">
      <header class="image-editor-header">
        <strong></strong>
        <button type="button" class="image-editor-discard">Discard</button>
        <button type="button" class="image-editor-save">Save</button>
        <span class="image-editor-status"></span>
      </header>
      <div class="image-editor-toolbars">
        <div class="whiteboard-toolbar image-editor-annotation-toolbar" role="toolbar" aria-label="Image annotation tools">
          <div class="whiteboard-toolbar-group whiteboard-drawing-tools" role="group" aria-label="Drawing tools">
            ${toolButton("select", "Select objects", true)}${toolButton("line", "Draw line")}${toolButton("arrow", "Draw arrow")}
            ${toolButton("freehand", "Draw freehand line")}${toolButton("rectangle", "Draw rectangle")}${toolButton("ellipse", "Draw ellipse")}
            ${toolButton("rectangle-filled", "Draw filled rectangle")}${toolButton("ellipse-filled", "Draw filled ellipse")}${toolButton("text", "Add text")}
            ${colorPickerMarkup("border", "#111111")}${colorPickerMarkup("fill", "#d9dde1")}
          </div>
          <div class="whiteboard-toolbar-group whiteboard-action-tools" role="group" aria-label="Annotation actions">
            ${actionButton("stack", "Toggle selection between front and back")}
            ${actionButton("rotate", "Rotate clockwise 90 degrees")}
          </div>
          <div class="whiteboard-toolbar-group whiteboard-action-tools" role="group" aria-label="Annotation actions">
            ${actionButton("delete", "Delete selected objects")}
            ${actionButton("undo", "Undo")}
            ${actionButton("clear-annotations", "Clear annotations")}
          </div>
          <div class="whiteboard-toolbar-group" role="group" aria-label="Crop and clear tools">
            ${toolButton("area-select", "Select image area")}
            ${actionButton("crop", "Crop to selected area")}
            ${actionButton("clear-area", "Clear selected area to white")}
          </div>
        </div>
      </div>
      <div class="image-editor-workspace"><div class="image-editor-canvas-wrap"><canvas aria-label="Image editing canvas"></canvas></div></div>
    </div>`;
    document.body.append(dialog);
    installIconsAndEvents();
    return dialog;
  }

  function installIconsAndEvents() {
    const icons = window.umedIcons || {};
    dialog.querySelectorAll("[data-image-editor-tool]").forEach(button => {
      const tool = button.dataset.imageEditorTool;
      button.innerHTML = icons[tool === "area-select" ? "areaSelect" : tool] || tool;
      button.addEventListener("click", () => selectTool(tool));
    });
    const actionIcons = { stack: "stackToggle", rotate: "rotate", delete: "delete", undo: "undo", "clear-annotations": "clear", crop: "crop", "clear-area": "clearArea" };
    dialog.querySelectorAll("[data-image-editor-action]").forEach(button => {
      button.innerHTML = icons[actionIcons[button.dataset.imageEditorAction]] || button.dataset.imageEditorAction;
      button.addEventListener("click", () => runAction(button.dataset.imageEditorAction));
    });
    dialog.querySelectorAll("[data-image-editor-color-target]").forEach(picker => {
      const target = picker.dataset.imageEditorColorTarget;
      const toggle = picker.querySelector(".whiteboard-color-toggle");
      toggle.style.setProperty("--selected-whiteboard-color", target === "border" ? "#111111" : "#d9dde1");
      toggle.addEventListener("click", event => {
        event.stopPropagation();
        setColorPopupOpen(picker, toggle.getAttribute("aria-expanded") !== "true");
      });
      picker.querySelectorAll("[data-image-editor-color]").forEach(button => button.addEventListener("click", () => {
        const color = button.dataset.imageEditorColor;
        if (target === "border") {
          session.borderColor = color;
          if (session.canvas.freeDrawingBrush) session.canvas.freeDrawingBrush.color = color;
        } else session.fillColor = color;
        applyColorToSelection(target, color);
        picker.querySelectorAll("[data-image-editor-color]").forEach(choice => choice.setAttribute("aria-pressed", String(choice === button)));
        toggle.style.setProperty("--selected-whiteboard-color", color);
        setColorPopupOpen(null, false);
      }));
    });
    dialog.querySelector(".image-editor-discard").addEventListener("click", () => finish(null));
    dialog.querySelector(".image-editor-save").addEventListener("click", save);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    document.addEventListener("click", event => {
      if (!event.target.closest(".image-editor-dialog .whiteboard-color-picker")) setColorPopupOpen(null, false);
    });
    window.addEventListener("keydown", handleKeydown);
  }

  function setColorPopupOpen(picker, open) {
    if (!dialog) return;
    dialog.querySelectorAll("[data-image-editor-color-target]").forEach(item => {
      const expanded = item === picker && Boolean(open);
      item.querySelector(".whiteboard-color-popup").hidden = !expanded;
      item.querySelector(".whiteboard-color-toggle").setAttribute("aria-expanded", String(expanded));
    });
  }

  function isArrowGroup(object) {
    if (!object || object.type !== "group" || typeof object.getObjects !== "function") return false;
    const children = object.getObjects();
    return children.length === 2
      && children.some(child => child.type === "line")
      && children.some(child => child.type === "triangle");
  }

  function applyColorToObject(object, target, color) {
    if (!object) return false;
    if (object.type === "group" && typeof object.getObjects === "function") {
      const arrow = isArrowGroup(object);
      if (arrow && target === "fill") return false;
      let changed = false;
      object.getObjects().forEach(child => {
        if (arrow && target === "border" && child.type === "triangle") {
          child.set({ fill: color, stroke: color });
          changed = true;
        } else if (applyColorToObject(child, target, color)) changed = true;
      });
      if (changed) {
        object.dirty = true;
        object.setCoords();
      }
      return changed;
    }
    if (target === "border") {
      if (["i-text", "text", "textbox"].includes(object.type)) object.set("fill", color);
      else if (["line", "path", "rect", "ellipse", "triangle"].includes(object.type)) object.set("stroke", color);
      else return false;
    } else {
      if (!["rect", "ellipse"].includes(object.type)) return false;
      object.set("fill", color);
    }
    object.setCoords();
    return true;
  }

  function applyColorToSelection(target, color) {
    if (!session) return;
    let changed = false;
    session.canvas.getActiveObjects().forEach(object => {
      if (!object.isAreaSelection && applyColorToObject(object, target, color)) changed = true;
    });
    if (!changed) return;
    session.canvas.requestRenderAll();
    commit();
  }

  function annotationObjects() {
    return session.canvas.getObjects().filter(object => !object.isAreaSelection);
  }

  function areaSelection() {
    return session.canvas.getObjects().find(object => object.isAreaSelection) || null;
  }

  function dropAreaSelection() {
    const selection = session && areaSelection();
    if (selection) session.canvas.remove(selection);
    if (session) session.canvas.discardActiveObject();
  }

  function updateActions() {
    if (!session) return;
    const selected = session.canvas.getActiveObjects().filter(object => !object.isAreaSelection);
    const hasArea = Boolean(areaSelection());
    dialog.querySelector('[data-image-editor-action="stack"]').disabled = !selected.length;
    dialog.querySelector('[data-image-editor-action="rotate"]').disabled = !selected.length;
    dialog.querySelector('[data-image-editor-action="delete"]').disabled = !selected.length;
    dialog.querySelector('[data-image-editor-action="undo"]').disabled = session.history.length <= 1;
    dialog.querySelector('[data-image-editor-action="clear-annotations"]').disabled = annotationObjects().length === 0;
    dialog.querySelector('[data-image-editor-action="crop"]').disabled = !hasArea;
    dialog.querySelector('[data-image-editor-action="clear-area"]').disabled = !hasArea;
  }

  function configureTextEditing(object) {
    if (object && object.type === "i-text") {
      object.hiddenTextareaContainer = dialog.querySelector(".image-editor-canvas-wrap");
    }
  }

  function selectTool(tool) {
    if (!session) return;
    if (tool !== "area-select") dropAreaSelection();
    session.tool = tool;
    dialog.querySelectorAll("[data-image-editor-tool]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.imageEditorTool === tool)));
    const canvas = session.canvas;
    canvas.isDrawingMode = tool === "freehand";
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = session.borderColor;
      canvas.freeDrawingBrush.width = displayAdjusted(3);
    }
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "select" ? "default" : "crosshair";
    canvas.forEachObject(object => {
      configureTextEditing(object);
      const selectable = object.isAreaSelection ? tool === "area-select" : tool === "select";
      object.selectable = selectable;
      object.evented = selectable;
    });
    if (tool !== "select" && tool !== "area-select") canvas.discardActiveObject();
    canvas.requestRenderAll();
    updateActions();
  }

  function shapeOptions() {
    return { fill: "transparent", stroke: session.borderColor, strokeWidth: displayAdjusted(3), selectable: false, evented: false, objectCaching: false };
  }

  function displayAdjusted(value) {
    return value / Math.max(session.displayScale || 1, 0.001);
  }

  function beginDrawing(pointer) {
    const options = shapeOptions();
    session.drawingStart = pointer;
    if (session.tool === "area-select") {
      dropAreaSelection();
      session.drawingObject = new fabric.Rect({
        ...options,
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        stroke: "#0066b3",
        strokeWidth: displayAdjusted(2),
        strokeDashArray: [displayAdjusted(8), displayAdjusted(5)],
        fill: "rgba(0,102,179,.12)",
        lockRotation: true,
        hasRotatingPoint: false,
        isAreaSelection: true
      });
    } else if (session.tool === "line" || session.tool === "arrow") {
      session.drawingObject = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], options);
    } else if (session.tool === "rectangle" || session.tool === "rectangle-filled") {
      if (session.tool === "rectangle-filled") options.fill = session.fillColor;
      session.drawingObject = new fabric.Rect({ ...options, left: pointer.x, top: pointer.y, width: 0, height: 0 });
    } else if (session.tool === "ellipse" || session.tool === "ellipse-filled") {
      if (session.tool === "ellipse-filled") options.fill = session.fillColor;
      session.drawingObject = new fabric.Ellipse({ ...options, left: pointer.x, top: pointer.y, rx: 0, ry: 0 });
    }
    if (session.drawingObject) session.canvas.add(session.drawingObject);
  }

  function updateDrawing(pointer) {
    const object = session.drawingObject;
    const start = session.drawingStart;
    if (!object || !start) return;
    if (session.tool === "line" || session.tool === "arrow") object.set({ x2: pointer.x, y2: pointer.y });
    else {
      const left = Math.min(start.x, pointer.x);
      const top = Math.min(start.y, pointer.y);
      const width = Math.abs(pointer.x - start.x);
      const height = Math.abs(pointer.y - start.y);
      if (session.tool === "ellipse" || session.tool === "ellipse-filled") object.set({ left, top, rx: width / 2, ry: height / 2 });
      else object.set({ left, top, width, height });
    }
    object.setCoords();
    session.canvas.requestRenderAll();
  }

  function finishArrow() {
    const source = session.drawingObject;
    const angle = Math.atan2(source.y2 - source.y1, source.x2 - source.x1) * 180 / Math.PI + 90;
    const line = new fabric.Line([source.x1, source.y1, source.x2, source.y2], shapeOptions());
    const head = new fabric.Triangle({ left: source.x2, top: source.y2, width: displayAdjusted(14), height: displayAdjusted(18), fill: session.borderColor, stroke: session.borderColor, originX: "center", originY: "center", angle });
    session.canvas.remove(source);
    session.drawingObject = new fabric.Group([line, head], { selectable: false, evented: false });
    session.canvas.add(session.drawingObject);
  }

  function finishDrawing() {
    if (!session || !session.drawingObject) return;
    if (session.tool === "arrow") finishArrow();
    const object = session.drawingObject;
    object.setCoords();
    session.drawingObject = null;
    session.drawingStart = null;
    if (object.isAreaSelection) {
      if (object.width < 1 || object.height < 1) session.canvas.remove(object);
      else {
        object.selectable = true;
        object.evented = true;
        session.canvas.setActiveObject(object);
      }
      updateActions();
    } else commit();
  }

  function addText(pointer) {
    // Fabric normally appends IText's hidden keyboard textarea to document.body. Because this
    // editor is inside a modal <dialog>, body content outside the dialog is inert and that textarea
    // cannot receive focus. Keep it inside the dialog's canvas host so typing works normally.
    const text = new fabric.IText("Text", {
      left: pointer.x,
      top: pointer.y,
      fill: session.borderColor,
      fontFamily: "system-ui, sans-serif",
      fontSize: displayAdjusted(28),
      selectable: true,
      evented: true,
      hiddenTextareaContainer: dialog.querySelector(".image-editor-canvas-wrap")
    });
    session.canvas.add(text);
    selectTool("select");
    session.canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    if (text.hiddenTextarea) text.hiddenTextarea.focus();
  }

  const bitmapDataUrl = () => session.bitmap.toDataURL("image/png");

  function serializeAnnotations() {
    return {
      version: fabric.version,
      objects: annotationObjects().map(object => object.toObject())
    };
  }

  function commit() {
    if (!session || session.restoring) return;
    const state = { bitmap: session.bitmapState || (session.bitmapState = bitmapDataUrl()), annotations: serializeAnnotations() };
    const serialized = JSON.stringify(state.annotations);
    const previous = session.history[session.history.length - 1];
    if (!previous || previous.bitmap !== state.bitmap || previous.serialized !== serialized) {
      session.history.push({ ...state, serialized });
      if (session.history.length > MAX_HISTORY) session.history.shift();
    }
    session.changed = true;
    updateActions();
  }

  function setBitmap(bitmap) {
    session.bitmap = bitmap;
    session.bitmapState = null;
    session.canvas.setDimensions({ width: bitmap.width, height: bitmap.height });
    session.canvas.setBackgroundImage(new fabric.Image(bitmap, { selectable: false, evented: false }), () => {
      fitCanvasDisplay();
      session.canvas.requestRenderAll();
    });
    updateStatus();
  }

  function restoreState(state) {
    session.restoring = true;
    const image = new Image();
    image.onload = () => {
      const bitmap = document.createElement("canvas");
      bitmap.width = image.naturalWidth;
      bitmap.height = image.naturalHeight;
      bitmap.getContext("2d").drawImage(image, 0, 0);
      session.bitmap = bitmap;
      session.canvas.setDimensions({ width: bitmap.width, height: bitmap.height });
      session.canvas.loadFromJSON(state.annotations, () => {
        setBitmap(bitmap);
        session.bitmapState = state.bitmap;
        session.restoring = false;
        selectTool(session.tool);
        session.canvas.requestRenderAll();
        updateActions();
      });
    };
    image.src = state.bitmap;
  }

  function selectionBounds() {
    const selection = areaSelection();
    if (!selection) return null;
    const bounds = selection.getBoundingRect(true, true);
    const x = Math.max(0, Math.min(session.canvas.width - 1, Math.round(bounds.left)));
    const y = Math.max(0, Math.min(session.canvas.height - 1, Math.round(bounds.top)));
    return {
      x, y,
      width: Math.max(1, Math.min(session.canvas.width - x, Math.round(bounds.width))),
      height: Math.max(1, Math.min(session.canvas.height - y, Math.round(bounds.height)))
    };
  }

  function flattenedCanvas() {
    dropAreaSelection();
    session.canvas.discardActiveObject();
    session.canvas.requestRenderAll();
    return session.canvas.toCanvasElement(1);
  }

  function applyAreaAction(action) {
    const bounds = selectionBounds();
    if (!bounds) return;
    const flattened = flattenedCanvas();
    let bitmap;
    if (action === "crop") {
      bitmap = document.createElement("canvas");
      bitmap.width = bounds.width;
      bitmap.height = bounds.height;
      bitmap.getContext("2d").drawImage(flattened, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    } else {
      bitmap = flattened;
      const context = bitmap.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    session.canvas.clear();
    setBitmap(bitmap);
    selectTool("area-select");
    commit();
  }

  function removeSelected() {
    const selected = session.canvas.getActiveObjects().filter(object => !object.isAreaSelection);
    if (!selected.length) return;
    session.canvas.discardActiveObject();
    selected.forEach(object => session.canvas.remove(object));
    commit();
  }

  function toggleStack() {
    const selected = session.canvas.getActiveObjects().filter(object => !object.isAreaSelection);
    if (!selected.length) return;
    const objects = annotationObjects();
    const atFront = selected.every(object => objects.slice(-selected.length).includes(object));
    if (atFront) selected.slice().reverse().forEach(object => session.canvas.sendToBack(object));
    else selected.forEach(object => session.canvas.bringToFront(object));
    commit();
  }
  function rotateSelectedObjects() {
    const selected = session.canvas.getActiveObjects().filter(object => !object.isAreaSelection);
    if (!selected.length) return;
    selected.forEach(object => {
      const center = object.getCenterPoint();
      object.rotate((object.angle + 90) % 360);
      object.setPositionByOrigin(center, "center", "center");
      object.setCoords();
    });
    session.canvas.requestRenderAll();
    commit();
  }

  function copySelected() {
    const selected = session.canvas.getActiveObject();
    if (!selected || selected.isAreaSelection) return;
    selected.clone(clone => { session.clipboard = clone; });
  }

  function pasteCopied() {
    if (!session.clipboard) return;
    session.clipboard.clone(clone => {
      session.canvas.discardActiveObject();
      clone.set({ left: (clone.left || 0) + 20, top: (clone.top || 0) + 20, evented: true });
      if (clone.type === "activeSelection") {
        clone.canvas = session.canvas;
        clone.forEachObject(object => session.canvas.add(object));
        clone.setCoords();
      } else session.canvas.add(clone);
      session.clipboard.set({ left: (session.clipboard.left || 0) + 20, top: (session.clipboard.top || 0) + 20 });
      session.canvas.setActiveObject(clone);
      session.canvas.requestRenderAll();
      commit();
    });
  }

  function runAction(action) {
    if (!session) return;
    if (action === "crop" || action === "clear-area") applyAreaAction(action);
    else if (action === "delete") removeSelected();
    else if (action === "stack") toggleStack();
    else if (action === "rotate") rotateSelectedObjects();
    else if (action === "undo" && session.history.length > 1) {
      session.history.pop();
      restoreState(session.history[session.history.length - 1]);
    } else if (action === "clear-annotations" && annotationObjects().length) {
      dropAreaSelection();
      annotationObjects().forEach(object => session.canvas.remove(object));
      commit();
    }
  }

  function fitCanvasDisplay() {
    if (!session || !dialog.open) return;
    const workspace = dialog.querySelector(".image-editor-workspace");
    const availableWidth = Math.max(1, workspace.clientWidth - 32);
    const availableHeight = Math.max(1, workspace.clientHeight - 32);
    const scale = Math.min(1, availableWidth / session.canvas.width, availableHeight / session.canvas.height);
    session.displayScale = scale;
    const width = Math.max(1, Math.round(session.canvas.width * scale));
    const height = Math.max(1, Math.round(session.canvas.height * scale));
    session.canvas.wrapperEl.style.width = `${width}px`;
    session.canvas.wrapperEl.style.height = `${height}px`;
    session.canvas.lowerCanvasEl.style.width = `${width}px`;
    session.canvas.lowerCanvasEl.style.height = `${height}px`;
    session.canvas.upperCanvasEl.style.width = `${width}px`;
    session.canvas.upperCanvasEl.style.height = `${height}px`;
    session.canvas.calcOffset();
  }

  function updateStatus(message) {
    if (session) dialog.querySelector(".image-editor-status").textContent = message || `${session.canvas.width} × ${session.canvas.height} px`;
  }

  function mimeForExtension(extension) {
    if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
    if (extension === "webp") return "image/webp";
    return "image/png";
  }

  function canvasBlob(canvas, mime) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(`This browser could not encode ${mime}.`)), mime, mime === "image/png" ? undefined : 0.92));
  }

  async function save() {
    if (!session || session.saving) return;
    if (!session.changed) { finish(null); return; }
    session.saving = true;
    const saveButton = dialog.querySelector(".image-editor-save");
    saveButton.disabled = true;
    updateStatus("Saving…");
    let unusedPath = null;
    try {
      const newFileName = await nextVersionName(session.rootHandle, session.relativeDir, session.fileName);
      const blob = await canvasBlob(flattenedCanvas(), mimeForExtension(session.extension));
      unusedPath = joinPath(joinPath(session.relativeDir, "_unused"), session.fileName);
      await window.umedEditorFS.moveFile(session.rootHandle, joinPath(session.relativeDir, session.fileName), unusedPath);
      await window.umedEditorFS.writeBinaryFile(session.rootHandle, joinPath(session.relativeDir, newFileName), blob);
      finish(newFileName);
    } catch (error) {
      if (unusedPath) {
        const activePath = joinPath(session.relativeDir, session.fileName);
        const active = await window.umedEditorFS.getExistingFile(session.rootHandle, activePath).catch(() => null);
        const backup = await window.umedEditorFS.getExistingFile(session.rootHandle, unusedPath).catch(() => null);
        if (!active && backup) await window.umedEditorFS.moveFile(session.rootHandle, unusedPath, activePath).catch(console.error);
      }
      session.saving = false;
      saveButton.disabled = false;
      updateStatus("Save failed");
      console.error(error);
      alert(`Could not save the edited image: ${error.message}`);
    }
  }

  function handleKeydown(event) {
    if (!session || !dialog.open || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable) return;
    const active = session.canvas.getActiveObject();
    if (active && active.isEditing) return;
    if ((event.key === "Delete" || event.key === "Backspace") && active && !active.isAreaSelection) {
      event.preventDefault();
      removeSelected();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && active && !active.isAreaSelection) {
      event.preventDefault();
      copySelected();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && session.clipboard) {
      event.preventDefault();
      pasteCopied();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      runAction("undo");
    }
  }

  function finish(value) {
    if (!session) return;
    const resolve = session.resolve;
    session.resizeObserver.disconnect();
    session.canvas.dispose();
    URL.revokeObjectURL(session.objectUrl);
    session = null;
    if (dialog.open) dialog.close();
    const replacement = document.createElement("canvas");
    replacement.setAttribute("aria-label", "Image editing canvas");
    dialog.querySelector(".image-editor-canvas-wrap").replaceChildren(replacement);
    resolve(value);
  }

  async function open(options) {
    ensureDialog();
    if (!window.fabric) throw new Error("Fabric.js annotation tools could not be loaded.");
    const extension = splitVersionedName(options.fileName).extension;
    if (!SUPPORTED.has(extension)) throw new Error("Only JPEG, PNG, and WebP images can be edited.");
    const source = await window.umedEditorFS.getExistingFile(options.rootHandle, joinPath(options.relativeDir, options.fileName));
    if (!source) throw new Error("The source image file was not found.");
    const objectUrl = URL.createObjectURL(source);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("The image could not be decoded."));
        image.src = objectUrl;
      });
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
    const bitmap = document.createElement("canvas");
    bitmap.width = image.naturalWidth;
    bitmap.height = image.naturalHeight;
    const bitmapContext = bitmap.getContext("2d");
    bitmapContext.fillStyle = "#ffffff";
    bitmapContext.fillRect(0, 0, bitmap.width, bitmap.height);
    bitmapContext.drawImage(image, 0, 0);
    const canvas = new fabric.Canvas(dialog.querySelector(".image-editor-canvas-wrap canvas"), { preserveObjectStacking: true, selection: true, stopContextMenu: true });
    return new Promise(resolve => {
      const resizeObserver = new ResizeObserver(fitCanvasDisplay);
      session = {
        ...options, extension, objectUrl, canvas, bitmap, bitmapState: null, tool: "select", borderColor: "#111111", fillColor: "#d9dde1", displayScale: 1,
        drawingObject: null, drawingStart: null, history: [], clipboard: null, restoring: false, changed: false, saving: false, resizeObserver, resolve
      };
      canvas.on("mouse:down", event => {
        if (session.tool === "select" || session.tool === "freehand") return;
        if (session.tool === "area-select" && event.target && event.target.isAreaSelection) return;
        const pointer = canvas.getPointer(event.e);
        if (session.tool === "text") addText(pointer);
        else beginDrawing(pointer);
      });
      canvas.on("object:added", event => configureTextEditing(event.target));
      canvas.on("mouse:move", event => updateDrawing(canvas.getPointer(event.e)));
      canvas.on("mouse:up", finishDrawing);
      canvas.on("object:modified", event => event.target && event.target.isAreaSelection ? updateActions() : commit());
      canvas.on("text:editing:exited", commit);
      canvas.on("path:created", commit);
      canvas.on("selection:created", updateActions);
      canvas.on("selection:updated", updateActions);
      canvas.on("selection:cleared", updateActions);
      dialog.querySelector("strong").textContent = `Editing ${options.fileName}`;
      dialog.querySelector(".image-editor-save").disabled = false;
      setBitmap(bitmap);
      selectTool("select");
      const initial = { bitmap: bitmapDataUrl(), annotations: serializeAnnotations() };
      session.bitmapState = initial.bitmap;
      session.history = [{ ...initial, serialized: JSON.stringify(initial.annotations) }];
      dialog.showModal();
      resizeObserver.observe(dialog.querySelector(".image-editor-workspace"));
      requestAnimationFrame(fitCanvasDisplay);
      updateActions();
    });
  }

  window.umedImageEditor = { open };
})();
