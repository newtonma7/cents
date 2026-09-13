(() => {
  const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea, [role="combobox"], [role="listbox"], [contenteditable="true"]';
  const QUIET_WINDOW_MS = 500;
  const MAX_WAIT_MS = 5000;
  const RELEVANT_ATTRIBUTES = ['id', 'aria-label', 'placeholder', 'name', 'required', 'aria-required', 'accept', 'role', 'type'];
  const personalData = /\b[\w.+-]+@[\w.-]+\.\w+\b|\b\d{3}[-.)\s]+\d{3}[-.\s]+\d{4}\b|\b\d{5}(?:-\d{4})?\b|\b\d{1,6}\s+\S+(?:\s+\S+){0,4}\s(?:street|st|road|rd|drive|dr|avenue|ave|lane|ln|boulevard|blvd|court|ct)\b/i;

  const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
  const safeText = (value) => {
    if (!value) return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return personalData.test(normalized)
      ? '[redacted: possible personal data]'
      : normalized.slice(0, 160);
  };

  function scanForm() {
    const controls = [...document.querySelectorAll(CONTROL_SELECTOR)];
    const labelFor = (element) => {
      const explicit = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      return safeText(element.getAttribute('aria-label') || text(explicit) || text(element.closest('label')) ||
        element.getAttribute('placeholder') || element.getAttribute('name'));
    };

    return {
      url: location.origin + location.pathname,
      title: safeText(document.title),
      controls: controls.map((element, index) => ({
        index,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || undefined,
        role: element.getAttribute('role') || undefined,
        name: safeText(element.getAttribute('name')),
        label: labelFor(element),
        required: element.matches('[required], [aria-required="true"]'),
        accept: safeText(element.getAttribute('accept')),
        optionLabels: element instanceof HTMLSelectElement
          ? [...element.options].map((option) => safeText(text(option))).filter(Boolean)
          : undefined,
      })),
    };
  }

  function assertSafe(result) {
    if (/(?:"(?:value|values|files|cookie|cookies|credential|credentials|password|token|authorization|submission)"\s*:)/i.test(JSON.stringify(result))) {
      throw new Error('Unsafe report: field data or credentials detected');
    }
  }

  const report = () => {
    const result = scanForm();
    assertSafe(result);
    if (!result.controls.length) return;
    try {
      chrome.runtime.sendMessage({ type: 'depop-form-report', report: result }).catch(() => {});
    } catch {
      // Reloading the extension invalidates content scripts already running in open tabs.
    }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'scan') return;
    try {
      const result = scanForm();
      assertSafe(result);
      sendResponse({ report: result });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  });

  // Depop renders the form client-side; wait for a quiet DOM, but never observe forever.
  let quietTimer;
  let maxTimer;
  let observer;
  let finished = false;
  const hasControls = () => document.querySelector(CONTROL_SELECTOR);
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(quietTimer);
    clearTimeout(maxTimer);
    observer.disconnect();
    report();
  };
  const scheduleQuietFinish = () => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(finish, QUIET_WINDOW_MS);
  };

  observer = new MutationObserver(() => {
    if (hasControls()) scheduleQuietFinish();
    else clearTimeout(quietTimer);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: RELEVANT_ATTRIBUTES,
  });
  if (hasControls()) scheduleQuietFinish();
  maxTimer = setTimeout(finish, MAX_WAIT_MS);
})();
