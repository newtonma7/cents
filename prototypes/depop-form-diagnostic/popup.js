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
    return safeText(element.getAttribute('aria-label') || text(explicit) || text(element.closest('label')) ||
      element.getAttribute('placeholder') || element.getAttribute('name'));
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

function openDryRunPanel() {
  document.querySelector('#cents-depop-prototype')?.remove();

  const panel = document.createElement('aside');
  panel.id = 'cents-depop-prototype';
  panel.style.cssText = 'position:fixed;z-index:2147483647;top:12px;right:12px;width:360px;max-height:calc(100vh - 24px);overflow:auto;background:white;color:#111;border:2px solid #111;border-radius:8px;padding:14px;box-shadow:0 8px 30px #0005;font:14px system-ui';
  panel.innerHTML = `
    <button data-close style="float:right">Close</button>
    <h2 style="margin-top:0">Cents dry run</h2>
    <p><strong>Never submits.</strong> Confident matches fill; everything else is skipped and reported.</p>
    <label>Title<input data-field="title" style="display:block;width:100%"></label>
    <label>Description<textarea data-field="description" rows="4" style="display:block;width:100%"></textarea></label>
    <label>Garment type<input data-field="garmentType" placeholder="tops" style="display:block;width:100%"></label>
    <label>Brand<input data-field="brand" style="display:block;width:100%"></label>
    <label>Size label<input data-field="size" style="display:block;width:100%"></label>
    <label>Condition<input data-field="condition" placeholder="Good" style="display:block;width:100%"></label>
    <label>Style keyword<input data-field="style" style="display:block;width:100%"></label>
    <label>USD price<input data-field="price" type="number" min="0" step="0.01" style="display:block;width:100%"></label>
    <label>Ordered JPEG/PNG photos<input data-field="photos" type="file" accept="image/jpeg,image/png" multiple style="display:block;width:100%"></label>
    <button data-fill style="margin-top:10px;padding:8px 12px">Fill what matches</button>
    <pre data-result style="white-space:pre-wrap;background:#f4f4f4;padding:8px"></pre>`;
  document.body.append(panel);

  const result = panel.querySelector('[data-result]');
  const own = (name) => panel.querySelector(`[data-field="${name}"]`);
  const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const visible = (element) => element.getClientRects().length > 0;
  const pageControl = (label) => [...document.querySelectorAll('input,select,textarea,[role="combobox"],[contenteditable="true"]')]
    .filter((element) => !panel.contains(element) && visible(element))
    .find((element) => {
      const explicit = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      const actual = element.getAttribute('aria-label') || text(explicit) || text(element.closest('label')) || element.getAttribute('placeholder') || '';
      return actual.trim().toLowerCase() === label.toLowerCase();
    });

  const setValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const skipped = (source, target, reason) => ({ source, target, state: 'skipped', reason });
  const fillText = (source, target, value) => {
    if (!value) return skipped(source, target, 'Canonical value is empty');
    const control = pageControl(target);
    if (!control) return { source, target, state: 'unresolved', reason: 'Target control is not present' };
    try {
      setValue(control, value);
      return control.value === value
        ? { source, target, state: 'filled' }
        : { source, target, state: 'unresolved', reason: 'Page did not retain the value' };
    } catch (error) {
      return { source, target, state: 'unresolved', reason: error.message };
    }
  };

  const choose = async (source, target, wanted) => {
    if (!wanted) return skipped(source, target, 'Canonical value is empty');
    const control = pageControl(target);
    if (!control) return { source, target, state: 'unresolved', proposedValue: wanted, reason: 'Target control is not present' };
    control.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const options = [...document.querySelectorAll('[role="option"], [role="listbox"] li')]
      .filter((element) => !panel.contains(element) && visible(element));
    const exact = options.filter((element) => text(element).toLowerCase() === wanted.trim().toLowerCase());
    if (exact.length !== 1) {
      const available = options.map(text).filter(Boolean).slice(0, 12);
      return {
        source,
        target,
        state: available.length ? 'suggested' : 'unresolved',
        proposedValue: wanted,
        reason: available.length ? `No unique exact match. Visible options: ${available.join(', ')}` : 'No visible options',
      };
    }
    exact[0].click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { source, target, state: 'filled' };
  };

  const line = (outcome) => `${outcome.state.toUpperCase()} ${outcome.source}${outcome.target ? ` → ${outcome.target}` : ''}${outcome.reason ? `: ${outcome.reason}` : ''}`;

  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
  panel.querySelector('[data-fill]').addEventListener('click', async () => {
    const outcomes = [skipped('Title', undefined, 'Depop has no title control')];
    outcomes.push(fillText('Description', 'Description', own('description').value.trim()));
    outcomes.push(await choose('Garment type', 'Category', own('garmentType').value.trim()));
    outcomes.push(await choose('Brand', 'Brand', own('brand').value.trim()));
    outcomes.push(await choose('Size label', 'Size', own('size').value.trim()));
    const condition = own('condition').value.trim();
    const depopCondition = { good: 'Used - Good', fair: 'Used - Fair' }[condition.toLowerCase()] || condition;
    outcomes.push(await choose('Condition', 'Condition', depopCondition));
    outcomes.push(await choose('Style keyword', 'Style', own('style').value.trim()));
    outcomes.push(fillText('USD price', 'Item price', own('price').value.trim()));

    const photos = own('photos').files;
    if (!photos.length) {
      outcomes.push(skipped('Photos', 'Add a photo', 'No photos selected'));
    } else {
      const target = pageControl('Add a photo');
      if (!(target instanceof HTMLInputElement) || target.type !== 'file') {
        outcomes.push({ source: 'Photos', target: 'Add a photo', state: 'unresolved', reason: 'Photo input is not present' });
      } else {
        try {
          const dropZone = target.closest('label') || target.parentElement;
          const previewCount = () => dropZone.querySelectorAll('img,[style*="background-image"]').length;
          const before = previewCount();
          let mutations = 0;
          const observer = new MutationObserver((records) => { mutations += records.length; });
          observer.observe(dropZone, { childList: true, subtree: true, attributes: true });

          const transfer = new DataTransfer();
          for (const photo of photos) transfer.items.add(photo);
          target.files = transfer.files;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 1200));

          if (previewCount() === before && mutations === 0) {
            for (const type of ['dragenter', 'dragover', 'drop']) {
              dropZone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
            }
            await new Promise((resolve) => setTimeout(resolve, 1800));
          }

          observer.disconnect();
          const visiblePreviews = previewCount() - before;
          outcomes.push(visiblePreviews > 0
            ? { source: 'Photos', target: 'Add a photo', state: 'filled', reason: `${visiblePreviews} new preview(s); verify count and order` }
            : mutations > 0
              ? { source: 'Photos', target: 'Add a photo', state: 'suggested', reason: 'The upload area changed but no preview was verified; complete manually' }
              : { source: 'Photos', target: 'Add a photo', state: 'unresolved', reason: 'Depop showed no upload or preview response; complete manually' });
        } catch (error) {
          outcomes.push({ source: 'Photos', target: 'Add a photo', state: 'unresolved', reason: error.message });
        }
      }
    }

    outcomes.push(skipped('Color', 'Color', 'Not represented by the Canonical Listing'));
    outcomes.push(skipped('Source', 'Source', 'No Canonical Listing value'));
    outcomes.push(skipped('Age', 'Age', 'No Canonical Listing value'));
    outcomes.push(skipped('Package size', 'Package size', 'No Canonical Listing value'));
    result.textContent = `${outcomes.map(line).join('\n')}\n\nNever submitted. Review filled fields and complete every alert manually.`;
  });
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

document.querySelector('#fill').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: openDryRunPanel });
    window.close();
  } catch (error) {
    output.textContent = `Panel failed: ${error.message}`;
  }
});

copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(report);
  copy.textContent = 'Copied';
});
