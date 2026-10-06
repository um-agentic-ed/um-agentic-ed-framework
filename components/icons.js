(function () {
  "use strict";

  // Shared inline icons, since no external icon library is loaded (see AGENTS.md Code standards).
  window.umedIcons = {
    upload: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M8 1.5v8M8 1.5 4.5 5M8 1.5 11.5 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M2.5 10.5v2.25c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V10.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
    // Used for the round "+" insertion buttons (sidebar and Slides menu); an SVG glyph renders
    // with true geometric centering, unlike a text "+" whose glass-shape sits off-center in most
    // fonts and can't be reliably centered with CSS alone.
    add: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>',
    // A panel-with-divider glyph reads as "toggle side panel" rather than "open menu", so it
    // isn't confused with the unrelated hamburger-style "Slides" menu toggle elsewhere in the app.
    sidebarToggle: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" stroke-width="1.3"/>' +
      '</svg>',
    previous: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M16 10H4m5-5-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    subtract: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 8h11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    menu: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 4h10M3 8h10M3 12h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    refresh: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M16.5 3v4h-4M16.5 7A6.5 6.5 0 1 0 16 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rotate: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M16.5 3v4h-4M16.5 7A6.5 6.5 0 1 0 16 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    presenter: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2.5" y="3" width="15" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m8 6.5 5 2.75L8 12z" fill="currentColor"/><path d="M10 14v3m-3 0h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    whiteboard: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2.5" y="3" width="15" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m6 12 5.8-5.8 2 2L8 14H6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4 13.5-.75 3.25 3.25-.75L15.75 6.75l-2.5-2.5zM11.75 5.75l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    areaSelect: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="13" height="13" rx=".5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/></svg>',
    crop: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 2.5v11A1.5 1.5 0 0 0 7.5 15h10M2.5 6H13a1.5 1.5 0 0 1 1.5 1.5v10M4 4l12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    clearArea: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="3" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/><path d="m6 13 6.8-7.5 3.2 3-6.8 7.5H6zm4.3 1.3 3.2-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    notepad: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 2.75h7l3 3v11.5H5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 2.75v3h3M7.5 9h5M7.5 12h5M7.5 15h3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    select: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 2.5 15.5 11l-5.1.8-2.7 4.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    line: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 16.5 16.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    freehand: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M2.5 13.5c2.2-7 4.5-7 5.8-2.1 1.2 4.7 3.4 4.8 4.5.2 1-4.2 2.5-4.7 4.7-1.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.5 16.5 16 4m-6.2.5H16v6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rectangle: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="4" y="4" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    ellipse: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    "rectangle-filled": '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="4" y="4" width="12" height="12" fill="currentColor"/></svg>',
    "ellipse-filled": '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6" fill="currentColor"/></svg>',
    text: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 4.5h12M10 4.5v11m-1.75 0h3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    stackToggle: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="3" y="7" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="3" width="9" height="9" rx="1" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.5"/><path d="M15 14v3m0 0-1.5-1.5M15 17l1.5-1.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    delete: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 6h11m-7-2h3l.75 2h-4.5zM6 6l.75 10h6.5L14 6M8.5 9v4m3-4v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7 5 3.5 8.5 7 12M4 8.5h7a5 5 0 0 1 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    clear: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m4 13 7.8-8.5 4.2 4-7.8 8.5H4zm5.5 1.5 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fit: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M8 3H3v5m9-5h5v5M8 17H3v-5m9 5h5v-5M3 8l4-4m10 4-4-4M3 12l4 4m10-4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // Single disclosure-triangle glyph reused for both states: pointing down reads as "expanded,
    // click to collapse"; CSS rotates it -90deg (pointing right) for "collapsed, click to expand".
    chevron: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
    copy: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M10.5 5.5V3.75A1.25 1.25 0 0 0 9.25 2.5h-6A1.25 1.25 0 0 0 2 3.75v6A1.25 1.25 0 0 0 3.25 11H5.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '</svg>',
    // Brand-neutral speech bubble with a sparkle, used for the chatbot controls.
    chatbot: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 3.5h11A1.5 1.5 0 0 1 17 5v7a1.5 1.5 0 0 1-1.5 1.5H10l-3.5 3v-3h-2A1.5 1.5 0 0 1 3 12V5a1.5 1.5 0 0 1 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 6l.9 2.1L13 9l-2.1.9L10 12l-.9-2.1L7 9l2.1-.9z" fill="currentColor"/></svg>',
    // The six-loop ChatGPT mark. Currently unused; kept so it can replace the neutral icon above.
    chatgptMark: '<svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">' + 
      '<path fill="currentColor" d="m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"/>' +
      '</svg>'
  };
})();
