# Depop form diagnostic — throwaway prototype

Answers whether Depop's authenticated create-listing form exposes enough stable metadata for a Seller-local Chrome extension.

## Run

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Sign into Depop normally and open its create-listing page.
5. Open the extension, choose **Scan this page**, then **Copy JSON**.
6. Return the JSON to the Wayfinder session.

The diagnostic reports labels, field types, select option labels, and the page path. It does not read field values, cookies, or credentials.
