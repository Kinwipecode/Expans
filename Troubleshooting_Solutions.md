# CompressoCalc: Probleme & Lösungen (Entwicklungsprotokoll)

Diese Datei dient als Referenz für gelöste technische Herausforderungen und spezifische Design-Entscheidungen in der CompressoCalc Applikation.

---

## 1. Intelligentes Einklappen von Sektionen (Rohrleitungen)
**Problem:** 
Standardmäßiges Einklappen (Accordion) mit `display: none` oder `max-height: 0` blendet alle Inhalte einer Sektion aus. Für den Nutzer ist es jedoch wichtig, die bereits eingegebenen Werte (z.B. DN 10: 100m) auch im "eingeklappten" Zustand zur Kontrolle zu sehen.

**Lösung (Kompakt-Modus):**
Statt die komplette Sektion zu verstecken, wird die Klasse `is-compact-mode` verwendet.
- **Offen:** Alle Zeilen der Tabelle sind sichtbar (`display: flex`).
- **Kompakt:** Die Funktion `refreshPipeVisibility` scannt alle Zeilen. Zeilen mit einer Länge > 0 bleiben sichtbar, Zeilen ohne Eintrag werden auf `display: none` gesetzt.
- **Vorteil:** Der Nutzer behält die Übersicht über die relevanten Daten, ohne dass die Liste den Bildschirm füllt.

---

## 2. Mathematische Auswertung in Input-Feldern
**Problem:**
Standard-Browser-Felder akzeptieren nur einfache Zahlen. Nutzer geben aber oft Summen ein (z.B. `50+20+10`). `eval()` ist aus Sicherheitsgründen (CSP) untersagt.

**Lösung:**
Implementierung eines simplen **Recursive Descent Parsers** (`window.safeMathEval`).
- Erlaubt Grundrechenarten (+, -, *, /) und Klammern.
- Ersetzt Kommas durch Punkte für die deutschsprachige Eingabe.
- Filtert illegale Zeichen, um Script-Injections zu verhindern.

---

## 3. Dynamische Hilfe-Texte (Smart Help)
**Problem:**
Die Bedeutung technischer Kürzel (z.B. `psvs`, `Vhs`, `Ve`) ist nicht jedem Nutzer sofort klar. Ein statisches Handbuch ist zu umständlich.

**Lösung:**
Ein kontextsensitives Hilfesystem mittels eines zentralen `LEXICON`-Objekts.
- Hinter jedem Sektionstitel im Bericht befindet sich ein `?`-Button.
- Beim Klick scannt die Funktion `showContextHelp` den Text der Sektion und zeigt in einem Popup nur die Erklärungen an, die in diesem Moment relevant sind.

---

## 4. Leistungsspezifische Geräteauswahl
**Problem:**
Die Auswahl zwischen Compresso Connect Standgeräten (C 10.1 / C 15.1) erfolgt nach technischen Schwellenwerten (Leistung > 1000 kW), die automatisch berücksichtigt werden müssen.

**Lösung:**
Integration einer Schwellenwert-Logik in der `calculate.js`. Die App entscheidet basierend auf der eingegebenen Leistung `Q`, welcher TecBox-Typ und welche Artikelnummer im Bericht ausgegeben werden.

---

## 5. Umgang mit Druck-Empfehlungen (psvs)
**Problem:**
Das Sicherheitsventil (`psvs`) muss einen Mindestdruck haben, der über dem Anlagendruck (`pa`) liegt.

**Lösung:**
Automatische Prüfung bei jeder Änderung. Wenn der Nutzer einen zu niedrigen Wert wählt, gibt die App eine Warnung aus und korrigiert den Wert automatisch auf das technisch zulässige Minimum (`psvs = pa + 0.6 bar`, aufgerundet auf die nächste Zehntelstelle).
