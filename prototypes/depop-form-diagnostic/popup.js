const output = document.querySelector('#output');
const copy = document.querySelector('#copy');
let report = '';

function scanForm() {
  const controls = [...document.querySelectorAll(
    'input:not([type="hidden"]), select, textarea, [role="combobox"], [role="listbox"], [contenteditable="true"]'
  )];

  const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
  const safeText = (value) => {
    if (!value) return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    const personalData = /\b[\w.+-]+@[\w.-]+\.\w+\b|\b\d{3}[-.)\s]+\d{3}[-.\s]+\d{4}\b|\b\d{5}(?:-\d{4})?\b|\b\d{1,6}\s+\S+(?:\s+\S+){0,4}\s(?:street|st|road|rd|drive|dr|avenue|ave|lane|ln|boulevard|blvd|court|ct)\b/i;
    return personalData.test(normalized) ? '[redacted: possible personal data]' : normalized.slice(0, 160);
  };
  const labelFor = (element) => {
    const explicit = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    return safeText(element.getAttribute('aria-label') ||
      text(explicit) ||
      text(element.closest('label')) ||
      element.getAttribute('placeholder') ||
      element.getAttribute('name'));
  };

  return {
    url: location.origin + location.pathname,
    title: document.title,
    controls: controls.map((element, index) => ({
      index,
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type') || undefined,
      role: element.getAttribute('role') || undefined,
      name: element.getAttribute('name') || undefined,
      label: labelFor(element),
      required: element.matches('[required], [aria-required="true"]'),
      accept: element.getAttribute('accept') || undefined,
      optionLabels: element instanceof HTMLSelectElement
        ? [...element.options].map((option) => safeText(text(option))).filter(Boolean)
        : undefined,
    })),
  };
}

function assertSafe(result) {
  if (JSON.stringify(result).match(/"value"\s*:/i)) throw new Error('Unsafe report: field value detected');
}

document.querySelector('#scan').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanForm });
    assertSafe(result);
    report = JSON.stringify(result, null, 2);
    output.textContent = report;
    copy.disabled = false;
  } catch (error) {
    output.textContent = `Scan failed: ${error.message}`;
  }
});

copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(report);
  copy.textContent = 'Copied';
});
