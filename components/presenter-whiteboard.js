(function () {
  "use strict";

  const pane = document.getElementById("presenter-whiteboard");
  const toggle = document.getElementById("presenter-whiteboard-toggle");
  const host = document.getElementById("whiteboard-canvas-host");
  const canvasElement = document.getElementById("whiteboard-canvas");
  const unavailable = document.getElementById("whiteboard-unavailable");
  const colorPickers = Array.from(document.querySelectorAll("[data-whiteboard-color-target]"));
  const stackToggleButton = document.getElementById("whiteboard-stack-toggle");
  const deleteButton = document.getElementById("whiteboard-delete");
  const undoButton = document.getElementById("whiteboard-undo");
  const clearButton = document.getElementById("whiteboard-clear");
  const toolButtons = Array.from(document.querySelectorAll("[data-whiteboard-tool]"));
  if (!pane || !toggle || !host || !canvasElement) return;

  const documents = new Map();
  const MAX_HISTORY = 30;
  let canvas = null;
  let resizeObserver = null;
  let presenterModeActive = false;
  let open = false;
  // This script loads the first time Presenter Mode is entered, so start from the Slide on screen.
  const initialInfo = window.umedApp && window.umedApp.getCurrentSlideInfo();
  let activeRoute = (initialInfo && initialInfo.key) || "app-overview";
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
  deleteButton.innerHTML = icons.delete || "Delete";
  undoButton.innerHTML = icons.undo || "Undo";
  clearButton.innerHTML = icons.clear || "Clear";

  const serialize = () => JSON.stringify(canvas ? canvas.toJSON() : { version: "5.3.0", objects: [] });

  function updateActions() {
    if (!canvas) {
      stackToggleButton.disabled = true;
      deleteButton.disabled = true;
      undoButton.disabled = true;
      clearButton.disabled = true;
      return;
    }
    const hasSelection = canvas.getActiveObjects().length > 0;
    stackToggleButton.disabled = !hasSelection;
    deleteButton.disabled = !hasSelection;
    const stackAction = selectionIsAtFront() ? "Send selection to back" : "Bring selection to front";
    stackToggleButton.setAttribute("aria-label", stackAction);
    stackToggleButton.title = stackAction;
    undoButton.disabled = history.length <= 1;
    clearButton.disabled = canvas.getObjects().length === 0;
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
    documents.set(activeRoute, state);
    updateActions();
  }

  function restore(state) {
    if (!canvas) return;
    restoring = true;
    canvas.loadFromJSON(state, () => {
      restoring = false;
      selectTool(activeTool);
      canvas.requestRenderAll();
      updateActions();
    });
  }

  function saveCurrentDocument() {
    if (canvas) documents.set(activeRoute, serialize());
  }

  function loadRoute(route) {
    if (!route || route === activeRoute) return;
    saveCurrentDocument();
    activeRoute = route;
    if (!canvas) return;
    const state = documents.get(activeRoute) || JSON.stringify({ version: "5.3.0", objects: [] });
    history = [state];
    restore(state);
  }

  function resizeCanvas() {
    if (!canvas || pane.hidden) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    canvas.setDimensions({ width, height });
    canvas.calcOffset();
    canvas.requestRenderAll();
  }

  function selectTool(tool) {
    activeTool = tool;
    toolButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.whiteboardTool === tool)));
    if (!canvas) return;
    canvas.isDrawingMode = tool === "freehand";
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeBorderColor;
      canvas.freeDrawingBrush.width = 3;
    }
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "select" ? "default" : "crosshair";
    canvas.forEachObject(object => { object.selectable = tool === "select"; object.evented = tool === "select"; });
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
      if (activeTool === "select" || activeTool === "freehand") return;
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
    const initial = documents.get(activeRoute) || serialize();
    history = [initial];
    restore(initial);
    selectTool(activeTool);
    return true;
  }

  function setOpen(nextOpen) {
    open = Boolean(nextOpen) && presenterModeActive;
    const toggleAction = open ? "Hide Whiteboard" : "Show Whiteboard";
    pane.hidden = !open;
    document.body.classList.toggle("whiteboard-open", open);
    toggle.setAttribute("aria-pressed", String(open));
    toggle.setAttribute("aria-label", toggleAction);
    toggle.title = toggleAction;
    if (!open) {
      setColorPopupOpen(null, false);
      saveCurrentDocument();
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
    if (!canvas) return;
    const selected = canvas.getActiveObjects();
    if (!selected.length) return;
    canvas.discardActiveObject();
    selected.forEach(object => canvas.remove(object));
    commit();
  }

  function toggleSelectionStack() {
    if (!canvas) return;
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
      if (target === "border") {
        activeBorderColor = color;
        if (canvas && canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = color;
      }
      else activeFillColor = color;
      buttons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      toggleButton.style.setProperty("--selected-whiteboard-color", color);
      const colorName = button.getAttribute("aria-label").replace(` ${target}`, "").toLowerCase();
      toggleButton.setAttribute("aria-label", `Choose ${target} color; ${colorName} selected`);
      setColorPopupOpen(null, false);
    }));
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".whiteboard-color-picker")) setColorPopupOpen(null, false);
  });
  toggle.addEventListener("click", () => setOpen(!open));
  stackToggleButton.addEventListener("click", toggleSelectionStack);
  deleteButton.addEventListener("click", removeSelected);
  undoButton.addEventListener("click", () => {
    if (history.length <= 1) return;
    history.pop();
    const state = history[history.length - 1];
    documents.set(activeRoute, state);
    restore(state);
  });
  clearButton.addEventListener("click", () => {
    if (!canvas || !canvas.getObjects().length) return;
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
    if (!open || !canvas || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable) return;
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
  window.addEventListener("umed:slide-loaded", event => loadRoute(event.detail && event.detail.key));

  toggle.hidden = true;
  updateActions();
  window.umedPresenterWhiteboard = {
    setPresenterMode(active) {
      presenterModeActive = Boolean(active);
      toggle.hidden = !presenterModeActive;
      if (!presenterModeActive) setOpen(false);
    }
  };
})();
