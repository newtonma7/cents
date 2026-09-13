# Facebook Marketplace form diagnostic — throwaway

Answers whether Facebook Marketplace's authenticated create-item form exposes enough stable controls for a Seller-local Chrome extension. It reports redacted form metadata only: no field values, credentials, cookies, or submission.

## Run

1. Start the loopback-only receiver:

   ```sh
   cd prototypes/facebook-marketplace-form-diagnostic
   python3 receiver.py
   ```

2. Open `chrome://extensions`, enable **Developer mode**, and load this directory unpacked.
3. Grant site access only to `www.facebook.com`, then open `https://www.facebook.com/marketplace/create/item` while normally signed in.
4. The report is written automatically under `/tmp/facebook-marketplace-form-reports`; no popup click is required.

The popup's **Scan this page** and **Copy JSON** controls remain as optional diagnostics.

## Run the dry fill

1. Open the extension and choose **Open dry-run panel**.
2. Enter one disposable Canonical Listing and select ordered photos.
3. Choose **Fill what matches**.
4. Review every `FILLED`, `SUGGESTED`, `UNRESOLVED`, and `SKIPPED` result. The prototype never submits.

## Checks

```sh
python3 -B -m unittest -v test_receiver.py
node test_routes.js
python3 -m json.tool manifest.json >/dev/null
node --check scan.js && node --check background.js && node --check popup.js
```
