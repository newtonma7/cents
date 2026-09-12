# Depop browser-assistance prototype — throwaway

Answers whether Depop's authenticated create-listing form exposes enough stable controls for a Seller-local Chrome extension.

## Run the diagnostic

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory. Use **Reload** after pulling a newer commit.
4. Sign into Depop normally and open its create-listing page.
5. Open the extension, choose **Scan this page**, then **Copy JSON**.

The diagnostic reports labels, field types, select option labels, and the page path. It does not read field values, cookies, or credentials. Likely personal information in control labels is redacted.

## Run the fill prototype

1. Open the extension and choose **Open dry-run panel**.
2. Enter disposable listing values. Combobox values must exactly match Depop's visible option text; category levels are separated with `>`.
3. Select ordered JPEG/PNG photos.
4. Choose **Fill, never submit**.
5. Review the result and every populated Depop field. The prototype has no submission action.
6. Return the displayed outcome plus any fields that were missing, wrong, or left unresolved.
