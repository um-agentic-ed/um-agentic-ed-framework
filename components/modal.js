(function () {
  "use strict";

  // Standard reusable confirmation modal. Call window.umedComponents.confirm(message) and
  // await the returned promise (true = confirmed, false = cancelled/dismissed).
  let dialog = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";

    const message = document.createElement("p");
    message.className = "confirm-dialog-message";

    const actions = document.createElement("div");
    actions.className = "confirm-dialog-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "confirm-dialog-confirm";
    actions.append(cancelButton, confirmButton);

    dialog.append(message, actions);
    document.body.append(dialog);
    dialog._message = message;
    dialog._cancelButton = cancelButton;
    dialog._confirmButton = confirmButton;
    // Permanent listener (as opposed to the ad hoc one confirmAction adds/removes per call) so
    // _closePending is always cleared as soon as a queued close event actually fires, even if no
    // call happens to be waiting on it via awaitPendingClose at that moment. Without this, a close
    // event that fires with no active waiter (the common case) would leave _closePending stuck at
    // true forever, permanently hanging every later confirmAction() call on this dialog.
    dialog.addEventListener("close", () => {
      dialog._closePending = false;
      const waiters = dialog._closeWaiters;
      dialog._closeWaiters = null;
      if (waiters) waiters.forEach(resolve => resolve());
    });
    return dialog;
  }

  // dialog.close() removes the `open` attribute synchronously but fires the "close" event on a
  // separately queued task. Callers like handleDelete await one confirm() and immediately start
  // another (e.g. the File System Access API's one-time-access prompt) on this same reused
  // <dialog>, all within the same microtask chain with no task boundary in between. Without this
  // guard, the first call's still-pending "close" event arrives after the second call has already
  // attached its own listeners, and gets mistaken for that second dialog being dismissed \u2014
  // resolving it to false before the user ever sees it. Waiting for any pending close event to
  // actually fire before wiring up a new session avoids that cross-talk.
  function awaitPendingClose(modal) {
    if (!modal._closePending) return Promise.resolve();
    return new Promise(resolve => {
      (modal._closeWaiters || (modal._closeWaiters = [])).push(resolve);
    });
  }

  function confirmAction(message, options) {
    const opts = options || {};
    const modal = ensureDialog();

    return awaitPendingClose(modal).then(() => new Promise(resolve => {
      modal._message.textContent = message;
      modal._cancelButton.textContent = opts.cancelLabel || "Cancel";
      modal._confirmButton.textContent = opts.confirmLabel || "Confirm";

      const cleanup = result => {
        modal._confirmButton.removeEventListener("click", onConfirm);
        modal._cancelButton.removeEventListener("click", onCancel);
        modal.removeEventListener("close", onClose);
        if (modal.open) {
          modal._closePending = true;
          modal.close();
        }
        resolve(result);
      };
      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onClose = () => cleanup(false);

      modal._confirmButton.addEventListener("click", onConfirm);
      modal._cancelButton.addEventListener("click", onCancel);
      modal.addEventListener("close", onClose);
      modal.showModal();
    }));
  }

  window.umedComponents = window.umedComponents || {};
  window.umedComponents.confirm = confirmAction;

  // Standard reusable single-line text prompt, used instead of the native window.prompt() (which
  // some embedding contexts disallow). Call window.umedComponents.promptText(message) and await
  // the returned promise (the trimmed string, or null if cancelled/dismissed/empty).
  let promptDialog = null;

  function ensurePromptDialog() {
    if (promptDialog) return promptDialog;
    promptDialog = document.createElement("dialog");
    promptDialog.className = "confirm-dialog";

    const message = document.createElement("p");
    message.className = "confirm-dialog-message";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "prompt-dialog-input";

    const actions = document.createElement("div");
    actions.className = "confirm-dialog-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "confirm-dialog-confirm";
    actions.append(cancelButton, confirmButton);

    promptDialog.append(message, input, actions);
    document.body.append(promptDialog);
    promptDialog._message = message;
    promptDialog._input = input;
    promptDialog._cancelButton = cancelButton;
    promptDialog._confirmButton = confirmButton;
    return promptDialog;
  }

  function promptText(message, options) {
    const opts = options || {};
    const modal = ensurePromptDialog();
    modal._message.textContent = message;
    modal._input.value = opts.initialValue || "";
    modal._cancelButton.textContent = opts.cancelLabel || "Cancel";
    modal._confirmButton.textContent = opts.confirmLabel || "OK";

    return new Promise(resolve => {
      const cleanup = result => {
        modal._confirmButton.removeEventListener("click", onConfirm);
        modal._cancelButton.removeEventListener("click", onCancel);
        modal.removeEventListener("close", onClose);
        modal._input.removeEventListener("keydown", onKeydown);
        if (modal.open) modal.close();
        resolve(result);
      };
      const onConfirm = () => cleanup(modal._input.value.trim() || null);
      const onCancel = () => cleanup(null);
      const onClose = () => cleanup(null);
      const onKeydown = event => { if (event.key === "Enter") { event.preventDefault(); onConfirm(); } };

      modal._confirmButton.addEventListener("click", onConfirm);
      modal._cancelButton.addEventListener("click", onCancel);
      modal.addEventListener("close", onClose);
      modal._input.addEventListener("keydown", onKeydown);
      modal.showModal();
      modal._input.focus();
    });
  }

  window.umedComponents.promptText = promptText;

  // New Slides need both a learner-facing title and a stable path identifier. This reusable
  // two-field prompt keeps that small authoring decision together without exposing the
  // identifier as an editable field after the Slide has been created.
  let slidePromptDialog = null;

  function ensureSlidePromptDialog() {
    if (slidePromptDialog) return slidePromptDialog;
    slidePromptDialog = document.createElement("dialog");
    slidePromptDialog.className = "confirm-dialog";

    const message = document.createElement("p");
    message.className = "confirm-dialog-message";

    const titleLabel = document.createElement("label");
    titleLabel.className = "prompt-dialog-label";
    const titleText = document.createElement("span");
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "prompt-dialog-input";
    titleLabel.append(titleText, titleInput);

    const nameLabel = document.createElement("label");
    nameLabel.className = "prompt-dialog-label";
    const nameText = document.createElement("span");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "prompt-dialog-input";
    nameInput.autocomplete = "off";
    nameLabel.append(nameText, nameInput);

    const sectionBreakLabel = document.createElement("label");
    sectionBreakLabel.className = "prompt-dialog-checkbox";
    const sectionBreakInput = document.createElement("input");
    sectionBreakInput.type = "checkbox";
    sectionBreakLabel.append(sectionBreakInput, " Create a new section break with this slide");

    const actions = document.createElement("div");
    actions.className = "confirm-dialog-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "confirm-dialog-confirm";
    actions.append(cancelButton, confirmButton);

    slidePromptDialog.append(message, titleLabel, nameLabel, sectionBreakLabel, actions);
    document.body.append(slidePromptDialog);
    slidePromptDialog._message = message;
    slidePromptDialog._titleText = titleText;
    slidePromptDialog._titleInput = titleInput;
    slidePromptDialog._nameText = nameText;
    slidePromptDialog._nameInput = nameInput;
    slidePromptDialog._sectionBreakLabel = sectionBreakLabel;
    slidePromptDialog._sectionBreakInput = sectionBreakInput;
    slidePromptDialog._cancelButton = cancelButton;
    slidePromptDialog._confirmButton = confirmButton;
    return slidePromptDialog;
  }

  // Returns { title, name, sectionBreak }, or null if dismissed or either required field is blank.
  // `nameFromTitle(title, sectionBreak)` supplies the concise kebab-case suggestion while the user
  // is still editing the title. The "section break" checkbox starts unchecked on every open and
  // relabels the whole dialog from "Slide" to "Section"; it is only offered when
  // `opts.allowSectionBreak` is true.
  function promptNewSlide(options) {
    const opts = options || {};
    const modal = ensureSlidePromptDialog();
    let nameWasEdited = false;
    modal._titleInput.value = "";
    modal._nameInput.value = "";
    modal._sectionBreakInput.checked = false;
    modal._sectionBreakLabel.hidden = !opts.allowSectionBreak;
    modal._cancelButton.textContent = opts.cancelLabel || "Cancel";

    const applyLabels = () => {
      const noun = modal._sectionBreakInput.checked ? "Section" : "Slide";
      modal._message.textContent = modal._sectionBreakInput.checked ? "Add a new Section Break" : (opts.message || "Add a new Slide");
      modal._titleText.textContent = `${noun} title`;
      modal._nameText.textContent = `${noun} name (used in paths and folder names)`;
      modal._confirmButton.textContent = modal._sectionBreakInput.checked ? "Add Section Break" : (opts.confirmLabel || "Add Slide");
    };
    applyLabels();

    return new Promise(resolve => {
      const suggestName = () => {
        if (!nameWasEdited) {
          modal._nameInput.value = opts.nameFromTitle
            ? opts.nameFromTitle(modal._titleInput.value, modal._sectionBreakInput.checked)
            : "";
        }
      };
      const onSectionBreakChange = () => {
        applyLabels();
        suggestName();
      };
      const cleanup = result => {
        modal._confirmButton.removeEventListener("click", onConfirm);
        modal._cancelButton.removeEventListener("click", onCancel);
        modal.removeEventListener("close", onClose);
        modal._sectionBreakInput.removeEventListener("change", onSectionBreakChange);
        modal._titleInput.removeEventListener("input", suggestName);
        modal._nameInput.removeEventListener("input", onNameInput);
        modal._titleInput.removeEventListener("keydown", onKeydown);
        modal._nameInput.removeEventListener("keydown", onKeydown);
        if (modal.open) modal.close();
        resolve(result);
      };
      const onConfirm = () => {
        const title = modal._titleInput.value.trim();
        const name = modal._nameInput.value.trim();
        if (!title) {
          modal._titleInput.focus();
          return;
        }
        if (!name) {
          modal._nameInput.focus();
          return;
        }
        cleanup({ title, name, sectionBreak: !modal._sectionBreakLabel.hidden && modal._sectionBreakInput.checked });
      };
      const onCancel = () => cleanup(null);
      const onClose = () => cleanup(null);
      const onNameInput = () => { nameWasEdited = true; };
      const onKeydown = event => { if (event.key === "Enter") { event.preventDefault(); onConfirm(); } };

      modal._confirmButton.addEventListener("click", onConfirm);
      modal._cancelButton.addEventListener("click", onCancel);
      modal.addEventListener("close", onClose);
      modal._sectionBreakInput.addEventListener("change", onSectionBreakChange);
      modal._titleInput.addEventListener("input", suggestName);
      modal._nameInput.addEventListener("input", onNameInput);
      modal._titleInput.addEventListener("keydown", onKeydown);
      modal._nameInput.addEventListener("keydown", onKeydown);
      modal.showModal();
      modal._titleInput.focus();
    });
  }

  window.umedComponents.promptNewSlide = promptNewSlide;

  // Reusable modal offering a small set of named button choices (e.g. "Add Section" / "Add
  // Category") plus Cancel, for places a plain OK/Cancel confirm isn't enough. Call
  // window.umedComponents.chooseOption(message, ["Choice A", "Choice B"]) and await the
  // returned promise (the chosen label, or null if cancelled/dismissed).
  let chooseDialog = null;

  function ensureChooseDialog() {
    if (chooseDialog) return chooseDialog;
    chooseDialog = document.createElement("dialog");
    chooseDialog.className = "confirm-dialog";
    const message = document.createElement("p");
    message.className = "confirm-dialog-message";
    const actions = document.createElement("div");
    actions.className = "confirm-dialog-actions";
    chooseDialog.append(message, actions);
    document.body.append(chooseDialog);
    chooseDialog._message = message;
    chooseDialog._actions = actions;
    return chooseDialog;
  }

  function chooseOption(message, choices) {
    const modal = ensureChooseDialog();
    modal._message.textContent = message;
    modal._actions.replaceChildren();

    return new Promise(resolve => {
      const cleanup = result => {
        modal.removeEventListener("close", onClose);
        if (modal.open) modal.close();
        resolve(result);
      };
      const onClose = () => cleanup(null);
      modal.addEventListener("close", onClose);

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => cleanup(null));
      modal._actions.append(cancelButton);

      choices.forEach(label => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "confirm-dialog-confirm";
        button.textContent = label;
        button.addEventListener("click", () => cleanup(label));
        modal._actions.append(button);
      });

      modal.showModal();
    });
  }

  window.umedComponents.chooseOption = chooseOption;
})();
