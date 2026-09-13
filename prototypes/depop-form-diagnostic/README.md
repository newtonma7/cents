# Depop browser-assistance prototype — throwaway

The automatic reporter sends form metadata only: it does not read field values, credentials, or cookies, and never submits. The optional popup also retains the original dry-run fill prototype; that panel requires an explicit click and does not submit.

## Run the local receiver

Start this first; it binds to loopback only and writes coordinator-readable JSON files under `/tmp/depop-form-reports`:

```sh
cd prototypes/depop-form-diagnostic
python3 receiver.py
```

Verify the receiver without visiting Depop:

```sh
curl -i http://127.0.0.1:8765/report \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://www.depop.com/products/create/example","title":"Create listing","controls":[]}'
ls -l /tmp/depop-form-reports
```

The receiver accepts only metadata reports for an HTTPS Depop create-listing path and rejects field-data and credential keys.

## Run the diagnostic

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory. Use **Reload** after pulling a newer commit.
4. Sign into Depop normally and open its `/products/create` or `/products/create/*` page.
5. The automatic metadata report is sent after the form renders; no popup click is needed. Delivery retries twice if the receiver is unavailable. Optionally open the extension and choose **Scan this page**, then **Copy JSON**.

The diagnostic reports labels, field types, select option labels, and the page path. The automatic path does not read field values, cookies, or credentials. Likely personal information in control labels is redacted.

## Run the fill prototype

1. Open the extension and choose **Open dry-run panel**.
2. Enter broad Canonical Listing values and select ordered JPEG/PNG photos.
3. Choose **Fill what matches**.
4. Review the `FILLED`, `SUGGESTED`, `UNRESOLVED`, and `SKIPPED` results and every populated Depop field. One mismatch does not stop independent fields, and the prototype has no submission action.
5. Return the displayed outcome plus any fields that were missing, wrong, or left unresolved.

## Checks

```sh
python3 -m unittest -v test_receiver.py
python3 -m json.tool manifest.json >/dev/null
node --check scan.js && node --check background.js && node --check route.js && node --check popup.js
node test_routes.js
```
