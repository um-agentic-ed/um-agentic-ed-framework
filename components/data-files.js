(function () {
  "use strict";

  // In-memory registry of Learner/Editor-uploaded data files (see AGENTS.md "DataFile content
  // blocks"). Keyed by a dataFile block's `name`, which is the shared identifier widget
  // instructions declare a dependency on. Entries persist for the browser session (never cleared
  // on Slide navigation) so a file uploaded once can be read by widgets on any Slide.
  const files = new Map(); // name -> File
  const subscribers = new Map(); // name -> Set<callback>

  function has(name) {
    return files.has(name);
  }

  function get(name) {
    return files.get(name);
  }

  function getText(name) {
    const file = files.get(name);
    return file ? file.text() : Promise.resolve(undefined);
  }

  function getArrayBuffer(name) {
    const file = files.get(name);
    return file ? file.arrayBuffer() : Promise.resolve(undefined);
  }

  // Registers callback(file) for whenever `name`'s file is loaded or replaced. Calls back
  // immediately if a file is already loaded, so a widget mounted after the upload (e.g. on a
  // later Slide, or from a previous session slide revisit) still sees it. Returns an unsubscribe
  // function; widgets should call it from their destroy() to avoid leaking stale DOM closures.
  function onChange(name, callback) {
    if (!subscribers.has(name)) subscribers.set(name, new Set());
    subscribers.get(name).add(callback);
    if (files.has(name)) callback(files.get(name));
    return () => {
      const subscriberSet = subscribers.get(name);
      if (subscriberSet) subscriberSet.delete(callback);
    };
  }

  // Stores/replaces `name`'s file and notifies subscribers; called when a Learner or Editor
  // picks a file via a dataFile block's upload icon.
  function set(name, file) {
    files.set(name, file);
    const subscriberSet = subscribers.get(name);
    if (subscriberSet) subscriberSet.forEach(callback => {
      try { callback(file); } catch (error) { console.error(error); }
    });
  }

  window.UMDGGDataFiles = { has, get, getText, getArrayBuffer, onChange, set };
})();
