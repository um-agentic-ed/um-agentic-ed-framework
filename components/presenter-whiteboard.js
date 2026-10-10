(function () {
  "use strict";

  const pane = document.getElementById("presenter-whiteboard");
  const toggle = document.getElementById("presenter-whiteboard-toggle");
  const host = document.getElementById("whiteboard-canvas-host");
  const canvasElement = document.getElementById("whiteboard-canvas");
  const unavailable = document.getElementById("whiteboard-unavailable");
  const colorPickers = Array.from(document.querySelectorAll("[data-whiteboard-color-target]"));
  const stackToggleButton = document.getElementById("whiteboard-stack-toggle");
  const rotateButton = document.getElementById("whiteboard-rotate");
  const deleteButton = document.getElementById("whiteboard-delete");
  const undoButton = document.getElementById("whiteboard-undo");
  const clearButton = document.getElementById("whiteboard-clear");
  const fitButton = document.getElementById("whiteboard-fit");
  const toolButtons = Array.from(document.querySelectorAll("[data-whiteboard-tool]"));
  if (!pane || !toggle || !host || !canvasElement) return;

  const originalParent = pane.parentNode;
  const originalNextSibling = pane.nextSibling;
  const MAX_HISTORY = 30;
  let canvas = null;
  let resizeObserver = null;
  let presenterModeActive = false;
  let learnerModeActive = false;
  let readOnly = false;
  let fitted = false;
  let open = false;
  // This script loads the first time Presenter Mode is entered, so start from the Slide on screen.
  let activeSlideUuid = window.umedApp && window.umedApp.getCurrentSlideUuid();
  let activeDocument = null;
  let activeTool = "select";
  let activeBorderColor = "#111111";
  let activeFillColor = "#d9dde1";
  let drawingObject = null;
  let drawingStart = null;
  let history = [];
  let restoring = false;
  let clipboard = null;

  const icons = window.umedIcons || {};
  toolButtons.forEach(button => {
    const tool = button.dataset.whiteboardTool;
    button.innerHTML = icons[tool] || tool;
  });
  stackToggleButton.innerHTML = icons.stackToggle || "Layers";
  rotateButton.innerHTML = icons.rotate || "Rotate";
  deleteButton.innerHTML = icons.delete || "Delete";
  undoButton.innerHTML = icons.undo || "Undo";
  clearButton.innerHTML = icons.clear || "Clear";
  fitButton.innerHTML = icons.fit || "Fit";

  const serialize = () => JSON.stringify(canvas ? canvas.toJSON() : { version: "5.3.0", objects: [] });

  function updateActions() {
    const editingDisabled = readOnly || fitted;
    toolButtons.forEach(button => { button.disabled = editingDisabled || !canvas; });
    colorPickers.forEach(picker => {
      picker.querySelector(".whiteboard-color-toggle").disabled = editingDisabled || !canvas;
      picker.querySelectorAll("[data-whiteboard-color]").forEach(button => { button.disabled = editingDisabled || !canvas; });
    });
    if (!canvas) {
      fitButton.disabled = true;
      stackToggleButton.disabled = true;
      rotateButton.disabled = true;
      deleteButton.disabled = true;
      undoButton.disabled = true;
      clearButton.disabled = true;
      return;
    }
    const hasSelection = canvas.getActiveObjects().length > 0;
    fitButton.disabled = !fitted && canvas.getObjects().length === 0;
    stackToggleButton.disabled = editingDisabled || !hasSelection;
    rotateButton.disabled = editingDisabled || !hasSelection;
    deleteButton.disabled = editingDisabled || !hasSelection;
    const stackAction = selectionIsAtFront() ? "Send selection to back" : "Bring selection to front";
    stackToggleButton.setAttribute("aria-label", stackAction);
    stackToggleButton.title = stackAction;
    undoButton.disabled = editingDisabled || history.length <= 1;
    clearButton.disabled = editingDisabled || canvas.getObjects().length === 0;
  }

  function selectionIsAtFront() {
    if (!canvas) return false;
    const selected = canvas.getActiveObjects();
    if (!selected.length) return false;
    const objects = canvas.getObjects();
    const topObjects = objects.slice(-selected.length);
    return selected.every(object => topObjects.includes(object));
  }

  function commit() {
    if (!canvas || restoring) return;
    const state = serialize();
    if (history[history.length - 1] !== state) history.push(state);
    if (history.length > MAX_HISTORY) history.shift();
    activeDocument = JSON.parse(state);
    if (window.umedApp && typeof window.umedApp.saveDrawing === "function") {
      window.umedApp.saveDrawing(activeSlideUuid, activeDocument.objects.length ? activeDocument : null);
    }
    updateActions();
  }

  function restore(state) {
    if (!canvas) return;
    restoring = true;
    canvas.loadFromJSON(state, () => {
      restoring = false;
      applyFit();
      selectTool(activeTool);
      canvas.requestRenderAll();
      updateActions();
    });
  }

  function setDocument(slideUuid, drawing) {
    activeSlideUuid = slideUuid;
    activeDocument = drawing || null;
    fitted = false;
    fitButton.setAttribute("aria-pressed", "false");
    fitButton.setAttribute("aria-label", "Fit drawing");
    fitButton.title = "Fit drawing";
    const state = JSON.stringify(activeDocument || { version: "5.3.0", objects: [] });
    history = [state];
    if (canvas) restore(state);
  }

  function resizeCanvas() {
    if (!canvas || pane.hidden) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    canvas.setDimensions({ width, height });
    applyFit();
    canvas.calcOffset();
    canvas.requestRenderAll();
  }

  function applyFit() {
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    if (!fitted || !canvas.getObjects().length) return;
    const bounds = canvas.getObjects().reduce((result, object) => {
      const rect = object.getBoundingRect(true, true);
      return {
        left: Math.min(result.left, rect.left),
        top: Math.min(result.top, rect.top),
        right: Math.max(result.right, rect.left + rect.width),
        bottom: Math.max(result.bottom, rect.top + rect.height)
      };
    }, { left: 0, top: 0, right: 0, bottom: 0 });
    const padding = 20;
    const drawingWidth = Math.max(1, bounds.right - Math.min(0, bounds.left) + padding * 2);
    const drawingHeight = Math.max(1, bounds.bottom - Math.min(0, bounds.top) + padding * 2);
    const zoom = Math.min(1, canvas.getWidth() / drawingWidth, canvas.getHeight() / drawingHeight);
    const offsetX = padding * zoom - Math.min(0, bounds.left) * zoom;
    const offsetY = padding * zoom - Math.min(0, bounds.top) * zoom;
    canvas.setViewportTransform([zoom, 0, 0, zoom, offsetX, offsetY]);
  }

  function selectTool(tool) {
    activeTool = tool;
    toolButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.whiteboardTool === tool)));
    if (!canvas) return;
    const editingDisabled = readOnly || fitted;
    canvas.isDrawingMode = !editingDisabled && tool === "freehand";
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeBorderColor;
      canvas.freeDrawingBrush.width = 3;
    }
    canvas.selection = !editingDisabled && tool === "select";
    canvas.defaultCursor = editingDisabled || tool === "select" ? "default" : "crosshair";
    canvas.forEachObject(object => {
      object.selectable = !editingDisabled && tool === "select";
      object.evented = !editingDisabled && tool === "select";
    });
    if (tool !== "select") canvas.discardActiveObject();
    canvas.requestRenderAll();
    updateActions();
  }

  function setColorPopupOpen(picker, nextOpen) {
    colorPickers.forEach(item => {
      const expanded = item === picker && Boolean(nextOpen);
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
    if (!canvas || readOnly || fitted) return;
    let changed = false;
    canvas.getActiveObjects().forEach(object => {
      if (applyColorToObject(object, target, color)) changed = true;
    });
    if (!changed) return;
    canvas.requestRenderAll();
    commit();
  }

  function shapeOptions() {
    return {
      fill: "transparent",
      stroke: activeBorderColor,
      strokeWidth: 3,
      selectable: false,
      evented: false,
      objectCaching: false
    };
  }

  function beginDrawing(pointer) {
    const options = shapeOptions();
    drawingStart = pointer;
    if (activeTool === "line" || activeTool === "arrow") {
      drawingObject = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], options);
    } else if (activeTool === "rectangle" || activeTool === "rectangle-filled") {
      options.fill = activeTool === "rectangle-filled" ? activeFillColor : "transparent";
      drawingObject = new fabric.Rect({ ...options, left: pointer.x, top: pointer.y, width: 0, height: 0 });
    } else if (activeTool === "ellipse" || activeTool === "ellipse-filled") {
      options.fill = activeTool === "ellipse-filled" ? activeFillColor : "transparent";
      drawingObject = new fabric.Ellipse({ ...options, left: pointer.x, top: pointer.y, rx: 0, ry: 0 });
    }
    if (drawingObject) canvas.add(drawingObject);
  }

  function updateDrawing(pointer) {
    if (!drawingObject || !drawingStart) return;
    if (activeTool === "line" || activeTool === "arrow") {
      drawingObject.set({ x2: pointer.x, y2: pointer.y });
    } else {
      const left = Math.min(drawingStart.x, pointer.x);
      const top = Math.min(drawingStart.y, pointer.y);
      const width = Math.abs(pointer.x - drawingStart.x);
      const height = Math.abs(pointer.y - drawingStart.y);
      if (activeTool === "rectangle" || activeTool === "rectangle-filled") drawingObject.set({ left, top, width, height });
      if (activeTool === "ellipse" || activeTool === "ellipse-filled") drawingObject.set({ left, top, rx: width / 2, ry: height / 2 });
    }
    drawingObject.setCoords();
    canvas.requestRenderAll();
  }

  function finishArrow() {
    const x1 = drawingObject.x1;
    const y1 = drawingObject.y1;
    const x2 = drawingObject.x2;
    const y2 = drawingObject.y2;
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 90;
    const line = new fabric.Line([x1, y1, x2, y2], shapeOptions());
    const head = new fabric.Triangle({
      left: x2,
      top: y2,
      width: 14,
      height: 18,
      fill: activeBorderColor,
      stroke: activeBorderColor,
      originX: "center",
      originY: "center",
      angle
    });
    canvas.remove(drawingObject);
    drawingObject = new fabric.Group([line, head], { selectable: false, evented: false });
    canvas.add(drawingObject);
  }

  function finishDrawing() {
    if (!drawingObject) return;
    if (activeTool === "arrow") finishArrow();
    drawingObject.setCoords();
    drawingObject = null;
    drawingStart = null;
    commit();
  }

  function addText(pointer) {
    const text = new fabric.IText("Text", {
      left: pointer.x,
      top: pointer.y,
      fill: activeBorderColor,
      fontFamily: "system-ui, sans-serif",
      fontSize: 28,
      selectable: true,
      evented: true
    });
    canvas.add(text);
    selectTool("select");
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    updateActions();
  }

  function initializeCanvas() {
    if (canvas || !window.fabric) return Boolean(canvas);
    canvas = new fabric.Canvas(canvasElement, {
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true
    });
    canvas.on("mouse:down", event => {
      if (readOnly || fitted || activeTool === "select" || activeTool === "freehand") return;
      const pointer = canvas.getPointer(event.e);
      if (activeTool === "text") addText(pointer);
      else beginDrawing(pointer);
    });
    canvas.on("mouse:move", event => updateDrawing(canvas.getPointer(event.e)));
    canvas.on("mouse:up", finishDrawing);
    canvas.on("object:modified", commit);
    canvas.on("text:editing:exited", commit);
    canvas.on("path:created", commit);
    canvas.on("selection:created", updateActions);
    canvas.on("selection:updated", updateActions);
    canvas.on("selection:cleared", updateActions);
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(host);
    const initial = JSON.stringify(activeDocument || { version: "5.3.0", objects: [] });
    history = [initial];
    restore(initial);
    selectTool(activeTool);
    return true;
  }

  function setOpen(nextOpen) {
    open = Boolean(nextOpen) && (presenterModeActive || learnerModeActive);
    const toggleAction = open ? "Hide Whiteboard" : "Show Whiteboard";
    pane.hidden = !open;
    document.body.classList.toggle("whiteboard-open", open);
    toggle.setAttribute("aria-pressed", String(open));
    toggle.setAttribute("aria-label", toggleAction);
    toggle.title = toggleAction;
    if (!open) {
      setColorPopupOpen(null, false);
      return;
    }
    if (!initializeCanvas()) {
      unavailable.hidden = false;
      toolButtons.forEach(button => { button.disabled = true; });
      colorPickers.forEach(picker => {
        picker.querySelector(".whiteboard-color-toggle").disabled = true;
        picker.querySelectorAll("[data-whiteboard-color]").forEach(button => { button.disabled = true; });
      });
      updateActions();
      return;
    }
    requestAnimationFrame(resizeCanvas);
  }

  function removeSelected() {
    if (!canvas || readOnly || fitted) return;
    const selected = canvas.getActiveObjects();
    if (!selected.length) return;
    canvas.discardActiveObject();
    selected.forEach(object => canvas.remove(object));
    commit();
  }

  function toggleSelectionStack() {
    if (!canvas || readOnly || fitted) return;
    const selectedSet = new Set(canvas.getActiveObjects());
    if (!selectedSet.size) return;
    const selectedInStackOrder = canvas.getObjects().filter(object => selectedSet.has(object));
    if (selectionIsAtFront()) {
      selectedInStackOrder.slice().reverse().forEach(object => canvas.sendToBack(object));
    } else {
      selectedInStackOrder.forEach(object => canvas.bringToFront(object));
    }
    canvas.requestRenderAll();
    commit();
  }

  function copySelected() {
    if (!canvas) return;
    const selected = canvas.getActiveObject();
    if (!selected) return;
    selected.clone(clone => { clipboard = clone; });
  }

  function pasteCopied() {
    if (!canvas || !clipboard) return;
    clipboard.clone(clone => {
      canvas.discardActiveObject();
      clone.set({
        left: (clone.left || 0) + 20,
        top: (clone.top || 0) + 20,
        evented: true
      });
      if (clone.type === "activeSelection") {
        clone.canvas = canvas;
        clone.forEachObject(object => canvas.add(object));
        clone.setCoords();
      } else {
        canvas.add(clone);
      }
      clipboard.set({
        left: (clipboard.left || 0) + 20,
        top: (clipboard.top || 0) + 20
      });
      canvas.setActiveObject(clone);
      canvas.requestRenderAll();
      commit();
    });
  }

  toolButtons.forEach(button => button.addEventListener("click", () => selectTool(button.dataset.whiteboardTool)));
  colorPickers.forEach(picker => {
    const target = picker.dataset.whiteboardColorTarget;
    const toggleButton = picker.querySelector(".whiteboard-color-toggle");
    const buttons = Array.from(picker.querySelectorAll("[data-whiteboard-color]"));
    toggleButton.addEventListener("click", () => setColorPopupOpen(picker, toggleButton.getAttribute("aria-expanded") !== "true"));
    buttons.forEach(button => button.addEventListener("click", () => {
      const color = button.dataset.whiteboardColor;
      const hasSelection = canvas && canvas.getActiveObjects().length > 0;
      if (hasSelection) {
        applyColorToSelection(target, color);
      } else {
        if (target === "border") {
          activeBorderColor = color;
          if (canvas && canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = color;
        }
        else activeFillColor = color;
        buttons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        toggleButton.style.setProperty("--selected-whiteboard-color", color);
        const colorName = button.getAttribute("aria-label").replace(` ${target}`, "").toLowerCase();
        toggleButton.setAttribute("aria-label", `Choose ${target} color; ${colorName} selected`);
      }
      setColorPopupOpen(null, false);
    }));
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".whiteboard-color-picker")) setColorPopupOpen(null, false);
  });
  toggle.addEventListener("click", () => setOpen(!open));
  stackToggleButton.addEventListener("click", toggleSelectionStack);
  rotateButton.addEventListener("click", () => {
    if (!canvas || readOnly || fitted) return;
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;
    activeObject.rotate((activeObject.angle || 0) + 90);
    canvas.requestRenderAll();
  });
  deleteButton.addEventListener("click", removeSelected);
  undoButton.addEventListener("click", () => {
    if (readOnly || fitted || history.length <= 1) return;
    history.pop();
    const state = history[history.length - 1];
    activeDocument = JSON.parse(state);
    if (window.umedApp && typeof window.umedApp.saveDrawing === "function") {
      window.umedApp.saveDrawing(activeSlideUuid, activeDocument.objects.length ? activeDocument : null);
    }
    restore(state);
  });
  fitButton.addEventListener("click", () => {
    if ((!learnerModeActive && !presenterModeActive) || !canvas) return;
    fitted = !fitted;
    fitButton.setAttribute("aria-pressed", String(fitted));
    fitButton.setAttribute("aria-label", fitted ? "Show drawing at actual size" : "Fit drawing");
    fitButton.title = fitted ? "Show drawing at actual size" : "Fit drawing";
    applyFit();
    selectTool(activeTool);
    canvas.requestRenderAll();
    updateActions();
  });
  clearButton.addEventListener("click", () => {
    if (!canvas || readOnly || fitted || !canvas.getObjects().length) return;
    canvas.discardActiveObject();
    canvas.clear();
    canvas.backgroundColor = "#ffffff";
    commit();
  });
  window.addEventListener("keydown", event => {
    const openColorPicker = colorPickers.find(picker => picker.querySelector(".whiteboard-color-toggle").getAttribute("aria-expanded") === "true");
    if (event.key === "Escape" && openColorPicker) {
      setColorPopupOpen(null, false);
      openColorPicker.querySelector(".whiteboard-color-toggle").focus();
      return;
    }
    if (!open || !canvas || readOnly || fitted || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable) return;
    const editingText = canvas.getActiveObject() && canvas.getActiveObject().isEditing;
    const shortcutKey = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (!editingText && shortcutKey && key === "c" && canvas.getActiveObject()) {
      event.preventDefault();
      copySelected();
    } else if (!editingText && shortcutKey && key === "v" && clipboard) {
      event.preventDefault();
      pasteCopied();
    } else if (!editingText && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      removeSelected();
    } else if (!editingText && shortcutKey && key === "z") {
      event.preventDefault();
      undoButton.click();
    }
  });
  toggle.hidden = true;
  updateActions();
  window.umedPresenterWhiteboard = {
    setDocument,
    setReadOnly(value) {
      readOnly = Boolean(value);
      selectTool(activeTool);
      updateActions();
    },
    setLearnerMode(active) {
      learnerModeActive = Boolean(active);
      if (learnerModeActive) {
        const notepad = document.getElementById("learner-notepad");
        notepad.append(pane);
        pane.setAttribute("aria-label", "Learner sketchpad");
        fitButton.hidden = false;
        toggle.hidden = true;
        setOpen(true);
      } else {
        fitted = false;
        fitButton.setAttribute("aria-pressed", "false");
        fitButton.hidden = true;
        if (canvas) applyFit();
        if (!presenterModeActive) setOpen(false);
        if (originalNextSibling) originalParent.insertBefore(pane, originalNextSibling);
        else originalParent.append(pane);
      }
    },
    setPresenterMode(active) {
      presenterModeActive = Boolean(active);
      if (presenterModeActive) {
        learnerModeActive = false;
        fitted = false;
        fitButton.hidden = false;
        pane.setAttribute("aria-label", "Presenter whiteboard");
        if (originalNextSibling) originalParent.insertBefore(pane, originalNextSibling);
        else originalParent.append(pane);
      }
      toggle.hidden = !presenterModeActive;
      if (!presenterModeActive) setOpen(false);
    }
  };
})();
