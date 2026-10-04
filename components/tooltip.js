(function () {
  "use strict";

  // Standard way to attach a hover/focus tooltip to any element, styled via .has-tooltip
  // in framework.css. Reuse this instead of ad hoc title attributes or one-off tooltip markup.
  function attachTooltip(element, text) {
    if (!element) return;
    element.classList.add("has-tooltip");
    element.dataset.tooltip = text;
    const focusableTags = ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"];
    if (!element.hasAttribute("tabindex") && !focusableTags.includes(element.tagName)) {
      element.tabIndex = 0;
    }
  }

  window.umedComponents = window.umedComponents || {};
  window.umedComponents.attachTooltip = attachTooltip;
})();
