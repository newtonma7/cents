importScripts('route.js');

const REPORT_URL = 'http://127.0.0.1:8765/report';
const MAX_DELIVERY_ATTEMPTS = 3;

async function deliver(report, attempt = 1) {
  try {
    const response = await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!response.ok) throw new Error(`receiver responded ${response.status}`);
  } catch (error) {
    if (attempt < MAX_DELIVERY_ATTEMPTS) {
      setTimeout(() => { void deliver(report, attempt + 1); }, attempt * 500);
    } else {
      console.error(`Facebook Marketplace report delivery failed after ${MAX_DELIVERY_ATTEMPTS} attempts`, error);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'facebook-marketplace-form-report' ||
      !isAllowedCreateUrl(sender?.url) ||
      !message.report || typeof message.report !== 'object' ||
      !isAllowedCreateUrl(message.report.url)) return;

  void deliver(message.report);
});
