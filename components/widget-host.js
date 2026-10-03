(function () {
  "use strict";

  // Registry populated by each <widget>.js file: window.UMDGGWidgets['<category>/<section>/<slide>/<name>']
  // = { init(container) { ...; return destroy; } }. See AGENTS.md "Widget content blocks" for the contract.
  window.UMDGGWidgets = window.UMDGGWidgets || {};

  const loadedScripts = new Set(); // widget.js src values already appended to <head>, so returning to
                                    // a Slide doesn't re-fetch/re-execute its widget script.
  let activeWidgets = []; // destroy callbacks for every widget currently mounted in the visible Slide.
  let reloadToken = "";

  function showPlaceholder(container, message) {
    const note = document.createElement("p");
    note.className = "widget-placeholder";
    note.textContent = message;
    container.append(note);
  }

  // Mounts one `widget` block's container: loads its <widget>.js file on first use (a no-op if
  // already loaded), then calls the registered factory's init(container). A widget whose
  // instructions haven't been fulfilled by an Agent yet (see AGENTS.md) shows a placeholder
  // instead of an error, since that is an expected, temporary authoring state.
  function mount(container, block, assetBasePath) {
    const name = block.name;
    if (!name) {
      showPlaceholder(container, "This widget block has no name yet.");
      return;
    }
    const key = `${assetBasePath}/${name}`.replace(/^src\/content\//, "");
    const src = `${assetBasePath}/${name}.js`;

    const start = () => {
      const factory = window.UMDGGWidgets[key];
      if (!factory || typeof factory.init !== "function") {
        showPlaceholder(container, `Widget "${name}" has not been generated yet.`);
        return;
      }
      const destroy = factory.init(container);
      activeWidgets.push(typeof destroy === "function" ? destroy : () => {});
    };

    if (loadedScripts.has(src)) {
      start();
      return;
    }
    const script = document.createElement("script");
    script.src = reloadToken ? `${src}?reload=${reloadToken}` : src;
    script.onload = () => { loadedScripts.add(src); start(); };
    script.onerror = () => showPlaceholder(container, `Widget "${name}" has not been generated yet.`);
    document.head.append(script);
  }

  // Tears down every widget mounted in the Slide currently on screen; app.js calls this right
  // before it clears the content pane so Chart.js/Tabulator instances never leak.
  function destroyAll() {
    activeWidgets.forEach(destroy => {
      try { destroy(); } catch (error) { console.error(error); }
    });
    activeWidgets = [];
  }

  // Forget loaded widget scripts and use a new cache-busting token after an Editor refresh.
  function invalidateScripts() {
    destroyAll();
    loadedScripts.clear();
    reloadToken = Date.now().toString();
  }

  window.UMDGGWidgetHost = { mount, destroyAll, invalidateScripts };
})();
