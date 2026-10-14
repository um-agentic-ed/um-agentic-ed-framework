(function () {
  "use strict";

  const bootstrapScript = document.currentScript;
  const frameworkRoot = bootstrapScript && bootstrapScript.src
    ? new URL("../", bootstrapScript.src)
    : new URL("src/um-agentic-ed-framework/", document.baseURI);
  const appRoot = new URL("../../", frameworkRoot);
  const shellHtml = `
  <header class="app-header">
    <div class="app-title-wrapper">
      <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-expanded="true" aria-controls="sidebar" aria-label="Close Sidebar" title="Close Sidebar"></button>
      <div class="app-title-center">
        <a class="app-title" href="#"></a>
      </div>
    </div>
    <div id="subject-menu" class="subject-menu" hidden>
      <button id="subject-menu-button" class="subject-menu-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="subject-menu-popup" title="Choose a Subject">
        <span id="subject-menu-label">Subjects</span>
        <svg class="subject-menu-caret" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 8l5 5 5-5" /></svg>
      </button>
      <div id="subject-menu-popup" class="subject-menu-popup" role="menu" aria-label="Subjects" hidden></div>
    </div>
    <div class="header-actions">
      <div id="normal-header-navigation" class="normal-header-navigation">
        <button id="editor-refresh" class="editor-refresh-button" type="button" aria-label="Refresh slide content" title="Refresh slide content" hidden></button>
        <button id="app-export" class="editor-refresh-button" type="button" aria-label="Export app to a single HTML file" title="Export app to a single HTML file" hidden></button>
        <div class="search-wrapper">
          <label class="visually-hidden" for="search">Search educational content</label>
          <input id="search" type="search" placeholder="Search..." autocomplete="off">
          <div id="search-results" class="search-results" hidden></div>
        </div>
      </div>
      <div id="presenter-navigation" class="presenter-navigation" hidden>
        <button id="presenter-previous-slide" class="header-circle-button" type="button" aria-label="Previous slide"></button>
        <button id="presenter-slide-menu-toggle" class="header-circle-button" type="button" aria-label="Toggle slide menu" aria-expanded="false"></button>
        <button id="presenter-next-slide" class="header-circle-button" type="button" aria-label="Next slide"></button>
        <div class="presenter-font-controls" role="group" aria-label="Slide font size">
          <button id="presenter-font-decrease" class="header-circle-button presenter-font-button" type="button" aria-label="Decrease slide font size"></button>
          <button id="presenter-font-increase" class="header-circle-button presenter-font-button" type="button" aria-label="Increase slide font size"></button>
        </div>
      </div>
      <button id="presenter-whiteboard-toggle" class="presenter-mode-toggle" type="button" aria-label="Show Whiteboard" title="Show Whiteboard" aria-pressed="false" hidden></button>
      <button id="presenter-mode-toggle" class="presenter-mode-toggle" type="button" aria-pressed="false" aria-label="Enter Presenter Mode" title="Enter Presenter Mode"></button>
    </div>
  </header>

  <div class="app-layout">
    <aside id="sidebar" aria-label="Content navigation"></aside>
    <main class="main-pane">
      <section id="educational-content" hidden>
        <div id="content-toolbar" class="content-toolbar">
          <button id="previous-slide" class="slide-step-button" type="button">
            <svg class="slide-step-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M16 10H4m5-5-5 5 5 5" />
            </svg>
            <span>Prev</span>
          </button>
          <div class="slide-navigation-center">
            <button id="slide-menu-toggle" type="button" aria-expanded="false">Slides ☰</button>
            <div id="level-navigation" aria-label="Learning tiers"></div>
          </div>
          <button id="next-slide" class="slide-step-button" type="button">
            <span>Next</span>
            <svg class="slide-step-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M4 10h12m-5-5 5 5-5 5" />
            </svg>
          </button>
        </div>
        <div class="content-editor-row">
          <nav id="slide-menu" class="slide-menu" hidden aria-label="Slides in this section"></nav>
          <article id="slide-content" class="slide-content"></article>
          <section id="learner-notepad" class="learner-notepad" aria-label="Slide notes" hidden>
            <div class="learner-notepad-header">
              <div class="learner-notepad-heading">
                <label id="learner-notepad-label" for="learner-notepad-text">Notes</label>
                <nav class="learner-notepad-file-actions" aria-label="Note file actions">
                  <a id="learner-notes-export" href="#" title="Download an archival or shareable copy; notes already save automatically">Export notes</a>
                  <a id="learner-notes-load" href="#" title="View shared notes temporarily or replace your saved notes">Load notes</a>
                  <a id="learner-notes-toggle" href="#" hidden>View shared notes</a>
                </nav>
              </div>
              <div class="learner-notepad-view-actions">
                <button id="learner-sketchpad-toggle" class="learner-notepad-view-toggle" type="button" aria-label="Show sketchpad" title="Show sketchpad" aria-pressed="false"></button>
                <button id="learner-notepad-close" class="learner-notepad-close" type="button" aria-label="Close notes" title="Close notes">×</button>
              </div>
            </div>
            <textarea id="learner-notepad-text" placeholder="Type your notes here..." spellcheck="true"></textarea>
            <input id="learner-notes-file" type="file" accept=".json,application/json" hidden>
          </section>
          <section id="presenter-whiteboard" class="presenter-whiteboard" aria-label="Presenter whiteboard" hidden>
            <div class="whiteboard-toolbar" role="toolbar" aria-label="Whiteboard tools">
              <div class="whiteboard-toolbar-group whiteboard-drawing-tools" role="group" aria-label="Drawing tools">
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="select" aria-label="Select objects" title="Select objects" aria-pressed="true"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="line" aria-label="Draw line" title="Draw line" aria-pressed="false"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="arrow" aria-label="Draw arrow" title="Draw arrow" aria-pressed="false"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="freehand" aria-label="Draw freehand line" title="Draw freehand line" aria-pressed="false"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="rectangle" aria-label="Draw rectangle" title="Draw rectangle" aria-pressed="false"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="ellipse" aria-label="Draw ellipse" title="Draw ellipse" aria-pressed="false"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="rectangle-filled" aria-label="Draw filled rectangle" title="Draw filled rectangle" aria-pressed="false"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="ellipse-filled" aria-label="Draw filled ellipse" title="Draw filled ellipse" aria-pressed="false"></button>
              <button type="button" class="whiteboard-icon-button" data-whiteboard-tool="text" aria-label="Add text" title="Add text" aria-pressed="false"></button>
              <div class="whiteboard-color-picker" data-whiteboard-color-target="border">
                <button class="whiteboard-color-toggle" type="button" aria-label="Choose border color; black selected" title="Border color" aria-haspopup="true" aria-expanded="false"></button>
                <div class="whiteboard-color-popup" role="group" aria-label="Border color choices" hidden>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#111111" aria-label="Black border" aria-pressed="true"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#737b84" aria-label="Grey border" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#d9dde1" aria-label="Light grey border" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#0072b2" aria-label="Blue border" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#007a5e" aria-label="Teal border" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#b24c00" aria-label="Orange border" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#c62828" aria-label="Vermilion border" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#7a3e9d" aria-label="Purple border" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#b08a00" aria-label="Ochre border" aria-pressed="false"></button>
                </div>
              </div>
              <div class="whiteboard-color-picker" data-whiteboard-color-target="fill">
                <button class="whiteboard-color-toggle" type="button" aria-label="Choose fill color; light grey selected" title="Fill color" aria-haspopup="true" aria-expanded="false"></button>
                <div class="whiteboard-color-popup" role="group" aria-label="Fill color choices" hidden>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#111111" aria-label="Black fill" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#737b84" aria-label="Grey fill" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#d9dde1" aria-label="Light grey fill" aria-pressed="true"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#0072b2" aria-label="Blue fill" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#007a5e" aria-label="Teal fill" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#b24c00" aria-label="Orange fill" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#c62828" aria-label="Vermilion fill" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#7a3e9d" aria-label="Purple fill" aria-pressed="false"></button>
                  <button type="button" class="whiteboard-color" data-whiteboard-color="#b08a00" aria-label="Ochre fill" aria-pressed="false"></button>
                </div>
              </div>
              </div>
              <div class="whiteboard-toolbar-group whiteboard-element-tools" role="group" aria-label="Whiteboard actions">
                <button id="whiteboard-stack-toggle" class="whiteboard-icon-button" type="button" aria-label="Toggle selection between front and back" title="Toggle selection between front and back"></button>
                <button id="whiteboard-rotate" class="whiteboard-icon-button" type="button" aria-label="Rotate clockwise 90 degrees" title="Rotate clockwise 90 degrees"></button>
              </div>
              <div class="whiteboard-toolbar-group whiteboard-action-tools" role="group" aria-label="Whiteboard actions">
                <button id="whiteboard-delete" class="whiteboard-icon-button" type="button" aria-label="Delete selected objects" title="Delete selected objects"></button>
                <button id="whiteboard-undo" class="whiteboard-icon-button" type="button" aria-label="Undo" title="Undo"></button>
                <button id="whiteboard-clear" class="whiteboard-icon-button" type="button" aria-label="Clear whiteboard" title="Clear whiteboard"></button>
                <button id="whiteboard-fit" class="whiteboard-icon-button" type="button" aria-label="Fit drawing" title="Fit drawing" aria-pressed="false" hidden></button>
              </div>
            </div>
            <div id="whiteboard-canvas-host" class="whiteboard-canvas-host">
              <canvas id="whiteboard-canvas" aria-label="Drawing surface"></canvas>
              <p id="whiteboard-unavailable" class="whiteboard-unavailable" hidden>Whiteboard drawing tools could not be loaded.</p>
            </div>
          </section>
          <div id="editor-pane" class="editor-pane" hidden></div>
        </div>
      </section>
    </main>
  </div>

  <aside id="umed-gpt-toast" class="umed-gpt-toast" role="status" aria-live="polite" aria-atomic="true" hidden>
    <button id="umed-gpt-toast-close" class="umed-gpt-toast-close" type="button" aria-label="Close GPT notice">×</button>
    <p id="umed-gpt-toast-message">A prompt was copied to your clipboard. Paste it into a GPT chatbot.</p>
    <p id="umed-gpt-toast-link" class="umed-gpt-toast-link" hidden><a href="#" target="umed-chatbot">Open GPT</a></p>
    <label class="umed-gpt-toast-suppress"><input id="umed-gpt-toast-suppress" type="checkbox"> Do not show this message again</label>
  </aside>
  `;

  const bootStyle = document.createElement("style");
  bootStyle.textContent = "body { visibility: hidden; }";
  document.head.append(bootStyle);

  window.umedFrameworkShellHtml = shellHtml;
  document.body.innerHTML = shellHtml;

  function addStyle(href) {
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Could not load ${href}`));
      document.head.append(link);
    });
  }

  function showStartupError(error) {
    console.error(error);
    bootStyle.remove();
    const content = document.getElementById("educational-content");
    const slide = document.getElementById("slide-content");
    if (content) content.hidden = false;
    if (slide) {
      slide.replaceChildren();
      const heading = document.createElement("h1");
      heading.textContent = "The app could not start";
      const message = document.createElement("p");
      message.textContent = "One or more required files could not be loaded. Update the Framework submodule or check the browser console for details.";
      slide.append(heading, message);
    }
  }

  function loadScriptsInOrder(sources) {
    return new Promise((resolve, reject) => {
      let remaining = sources.length;
      for (const source of sources) {
        const script = document.createElement("script");
        script.async = false;
        script.src = source;
        script.onload = () => {
          remaining -= 1;
          if (!remaining) resolve();
        };
        script.onerror = () => reject(new Error(`Could not load ${source}`));
        document.head.append(script);
      }
    });
  }

  const coreStylesReady = Promise.all([
    addStyle(new URL("styles/framework.css", frameworkRoot).href),
    addStyle(new URL("styles/markdown-styles.css", frameworkRoot).href),
    addStyle(new URL("app.css", appRoot).href)
  ]);
  // This stylesheet is only needed when a Tabulator widget is displayed and must not delay the
  // initial app view when the CDN is slow or unavailable.
  addStyle("https://cdn.jsdelivr.net/npm/tabulator-tables@6.5.3/dist/css/tabulator.min.css")
    .catch(error => console.warn(error));

  const prerequisitesReady = loadScriptsInOrder([
    "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js",
    "https://cdn.jsdelivr.net/npm/tabulator-tables@6.5.3/dist/js/tabulator.min.js",
    "https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js",
    "https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js",
    new URL("app/schema-contract.js", frameworkRoot).href,
    new URL("app.js", appRoot).href,
    new URL("src/content/content-index.js", appRoot).href,
    new URL("components/icons.js", frameworkRoot).href,
    new URL("components/data-files.js", frameworkRoot).href,
    new URL("components/tooltip.js", frameworkRoot).href,
    new URL("components/modal.js", frameworkRoot).href,
    new URL("components/widget-host.js", frameworkRoot).href,
    new URL("components/learner-notes.js", frameworkRoot).href
  ]);

  Promise.all([coreStylesReady, prerequisitesReady])
    .then(() => loadScriptsInOrder([new URL("app/main.js", frameworkRoot).href]))
    .then(() => bootStyle.remove())
    .catch(showStartupError);
})();

