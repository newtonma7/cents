const output = document.querySelector('#output');
const copy = document.querySelector('#copy');
let report = '';

function openDryRunPanel() {
  document.querySelector('#cents-facebook-marketplace-prototype')?.remove();

  const panel = document.createElement('aside');
  panel.id = 'cents-facebook-marketplace-prototype';
  panel.style.cssText = 'position:fixed;z-index:2147483647;top:12px;right:12px;width:360px;max-height:calc(100vh - 24px);overflow:auto;background:white;color:#111;border:2px solid #111;border-radius:8px;padding:14px;box-shadow:0 8px 30px #0005;font:14px system-ui';
  panel.innerHTML = `
    <button data-close style="float:right">Close</button>
    <h2 style="margin-top:0">Cents dry run</h2>
    <p><strong>Never submits.</strong> Exact matches fill; uncertainty is reported for manual completion.</p>
    <label>Title<input data-field="title" style="display:block;width:100%"></label>
    <label>Description<textarea data-field="description" rows="4" style="display:block;width:100%"></textarea></label>
    <label>Garment type<input data-field="garmentType" placeholder="Apparel" style="display:block;width:100%"></label>
    <label>Brand<input data-field="brand" style="display:block;width:100%"></label>
    <label>Size label<input data-field="size" style="display:block;width:100%"></label>
    <label>Condition<input data-field="condition" placeholder="Used - Good" style="display:block;width:100%"></label>
    <label>USD price<input data-field="price" type="number" min="0" step="0.01" style="display:block;width:100%"></label>
    <label>Ordered photos<input data-field="photos" type="file" accept="image/*" multiple style="display:block;width:100%"></label>
    <button data-fill style="margin-top:10px;padding:8px 12px">Fill what matches</button>
    <pre data-result style="white-space:pre-wrap;background:#f4f4f4;padding:8px"></pre>`;
  document.body.append(panel);

  const result = panel.querySelector('[data-result]');
  const own = (name) => panel.querySelector(`[data-field="${name}"]`);
  const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const visible = (element) => element.getClientRects().length > 0;
  const pageControls = () => [...document.querySelectorAll('input,select,textarea,[role="combobox"],[contenteditable="true"]')]
    .filter((element) => !panel.contains(element) && visible(element));
  const pageControl = (label) => pageControls().find((element) => {
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
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
      return { source, target, state: 'unresolved', reason: 'Target control is not present' };
    }
    try {
      setValue(control, value);
      const retained = target === 'Price'
        ? Number(control.value.replace(/[^0-9.-]/g, '')) === Number(value)
        : control.value === value;
      return retained
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
    const visibleChoosers = () => [...document.querySelectorAll('[role="dialog"],[role="listbox"],[role="menu"]')]
      .filter((element) => !panel.contains(element) && visible(element));
    const before = new Set(visibleChoosers());
    control.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const options = [...document.querySelectorAll('[role="option"]')].filter((element) => !panel.contains(element) && visible(element));
    const exact = options.filter((element) => text(element).toLowerCase() === wanted.trim().toLowerCase());
    if (exact.length !== 1) {
      const available = options.map(text).filter(Boolean).slice(0, 12);
      const chooserOpened = visibleChoosers().some((element) => !before.has(element)) || control.getAttribute('aria-expanded') === 'true';
      return {
        source,
        target,
        state: available.length || chooserOpened ? 'suggested' : 'unresolved',
        proposedValue: wanted,
        reason: available.length
          ? `No unique exact match. Visible options: ${available.join(', ')}`
          : chooserOpened
            ? 'Chooser opened but its options could not be safely enumerated; choose manually'
            : 'No visible options',
      };
    }
    exact[0].click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { source, target, state: 'filled' };
  };
  const line = (outcome) => `${outcome.state.toUpperCase()} ${outcome.source}${outcome.target ? ` → ${outcome.target}` : ''}${outcome.reason ? `: ${outcome.reason}` : ''}`;

  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
  panel.querySelector('[data-fill]').addEventListener('click', async () => {
    const outcomes = [
      fillText('Title', 'Title', own('title').value.trim()),
      fillText('Description', 'Description', own('description').value.trim()),
      await choose('Garment type', 'Category', own('garmentType').value.trim()),
      await choose('Brand', 'Brand', own('brand').value.trim()),
      await choose('Size label', 'Size', own('size').value.trim()),
      await choose('Condition', 'Condition', own('condition').value.trim()),
      fillText('USD price', 'Price', own('price').value.trim()),
    ];

    const photos = own('photos').files;
    if (!photos.length) {
      outcomes.push(skipped('Photos', 'Photo upload', 'No photos selected'));
    } else {
      const target = pageControls().find((element) => element instanceof HTMLInputElement && element.type === 'file' && /image/.test(element.accept));
      if (!target) {
        outcomes.push({ source: 'Photos', target: 'Photo upload', state: 'unresolved', reason: 'Image input is not present' });
      } else {
        try {
          const transfer = new DataTransfer();
          for (const photo of photos) transfer.items.add(photo);
          target.files = transfer.files;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 2000));
          outcomes.push({ source: 'Photos', target: 'Photo upload', state: 'suggested', reason: 'Files were offered to Marketplace; verify visible count and order' });
        } catch (error) {
          outcomes.push({ source: 'Photos', target: 'Photo upload', state: 'unresolved', reason: error.message });
        }
      }
    }

    result.textContent = `${outcomes.map(line).join('\n')}\n\nNever submitted. Review filled fields and complete every alert manually.`;
  });
}

document.querySelector('#scan').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'scan' });
    if (response?.error) throw new Error(response.error);
    if (!response?.report) throw new Error('The automatic scanner is not loaded; reload the Marketplace page');
    report = JSON.stringify(response.report, null, 2);
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
