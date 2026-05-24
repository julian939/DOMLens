# DOMLens — Chrome Web Store veröffentlichen

## Schritt 1: Developer Account anlegen

1. Gehe auf https://chrome.google.com/webstore/devconsole
2. Logge dich mit deinem Google-Account ein
3. Akzeptiere die Developer Agreement
4. Zahle die einmalige Registrierungsgebühr: **5 USD** (Kreditkarte)
5. Account ist sofort aktiv

---

## Schritt 2: ZIP-Datei erstellen

Öffne ein Terminal im Projektordner und führe das Build-Skript aus:

```bash
cd /Users/juliankalmes/Desktop/programming/domlens
bash build.sh
```

Das erzeugt `domlens.zip` im Projektverzeichnis. Diese Datei ist dein Upload-Paket.

---

## Schritt 3: Screenshots anfertigen

Der Store verlangt mindestens **1 Screenshot**. Format: PNG oder JPG, Größe **1280×800** oder **640×400** px.

**Was du zeigen solltest:**
- Öffne eine beliebige Webseite (z.B. github.com oder eine Design-Seite)
- Halte deine Modifier-Taste gedrückt und fahre über ein Element
- Screenshot machen, wenn das Inspect-Panel + die farbige Highlight-Box sichtbar sind

**Auf macOS:**
- `Cmd + Shift + 4` → Bereich auswählen → Screenshot landet auf dem Desktop
- Oder: `Cmd + Shift + 5` für mehr Optionen

Mach **2–3 Screenshots** von verschiedenen Elementen (z.B. einmal ein Button, einmal ein Text-Element).

---

## Schritt 4: Store-Listing ausfüllen

Im Developer Dashboard: "New item" klicken → ZIP hochladen, dann folgende Felder ausfüllen:

**Kurzname (Store-Listing):**
```
DOMLens
```

**Kurzbeschreibung** (max. 132 Zeichen — bereits in manifest.json):
```
Hold a hotkey and hover any element to see its tag, size, colors, and fonts. Press C to copy its CSS selector.
```

**Detaillierte Beschreibung** (für die Listing-Seite, kein Limit):
```
DOMLens is a lightweight DOM inspector that lives entirely in your browser — no DevTools required.

Hold your configured modifier key (Alt, Ctrl, Meta, or Shift) and hover over any element on the page. A panel appears showing:
- Tag name, ID, and CSS classes
- Dimensions and position
- Text color and background color
- Font family, size, and weight

Press C while hovering to copy a unique CSS selector for the element.
Press C twice quickly to copy a full element snapshot including HTML, box model, and computed styles.

No data is collected. Everything runs locally in your browser.
```

**Kategorie:** Developer Tools

**Sprache:** English

**Promo-Tile:** `docs/promo-tile-440x280.png` hochladen (bereits fertig)

---

## Schritt 5: Privacy Practices ausfüllen

Im Dashboard gibt es einen eigenen Bereich "Privacy practices". Dort:

- **"Does your extension collect user data?"** → **No**
- Begründe die Permissions (das Dashboard fragt danach):

| Permission | Begründung |
|---|---|
| `storage` | Saves the user's chosen modifier hotkey setting |
| `clipboardWrite` | Copies the CSS selector or element snapshot to clipboard |
| `<all_urls>` (host access) | The inspector must work on any website the user visits |

---

## Schritt 6: Single-Purpose-Statement

Das Dashboard fragt nach einem "Single purpose". Trage ein:

```
Inspect DOM elements and copy CSS selectors via a hover overlay.
```

---

## Schritt 7: Version prüfen (optional)

In `manifest.json` steht aktuell `"version": "0.1.0"`. Für einen ersten öffentlichen Release kannst du es auf `"1.0.0"` setzen — dann nach der Änderung nochmal `bash build.sh` ausführen.

---

## Schritt 8: Hochladen und einreichen

1. Screenshots im Dashboard hochladen
2. Promo-Tile (`docs/promo-tile-440x280.png`) hochladen
3. Alle Felder prüfen
4. **"Submit for review"** klicken

Google prüft neue Extensions manuell. Das dauert in der Regel **1–3 Werktage**. Du bekommst eine E-Mail wenn sie genehmigt oder abgelehnt wird.

---

## Zusammenfassung: Was du noch manuell brauchst

| Aufgabe | Status |
|---|---|
| Developer Account (5 USD) | Noch offen |
| `bash build.sh` ausführen | Noch offen |
| 1–3 Screenshots (1280×800 oder 640×400) | Noch offen |
| Promo-Tile (440×280 PNG) | Fertig — `docs/promo-tile-440x280.png` |
| Listing-Text im Dashboard ausfüllen | Noch offen |
| Privacy Practices ausfüllen | Noch offen |
| Submit for review | Noch offen |
