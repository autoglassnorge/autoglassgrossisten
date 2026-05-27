# "Kjør i KIMI" — Oppsettguide for Mac

> Denne guiden viser hvordan du setter opp en hurtigtast (Cmd+Shift+K) som kopierer et Perplexity-svar og kjører KIMI-kommandoen automatisk.

---

## Forutsetninger

- Perplexity Pro må ha Custom Instructions aktivert (se `.kimi/perplexity-custom-instructions.md`)
- KIMI CLI må være installert og `kimi` kommandoen tilgjengelig i PATH
- Du må ha tilgang til `~/bilglass`-prosjektet

---

## Metode A: Apple Shortcut (Anbefalt — enklest)

### 1. Opprett Shortcut
1. Åpne **Shortcuts**-appen på Mac
2. Klikk **+** for ny shortcut
3. Navn: `Kjør i KIMI`
4. Legg til actions:

```
[Get contents of clipboard]
    ↓
[Run Shell Script]
    Input: Clipboard
    Script: /Users/taj/bilglass/.kimi/kimi-from-perplexity.sh
```

### 2. Bind til hurtigtast
1. I Shortcuts-appen: klikk på shortcut → **Settings** (tannhjul)
2. Under **Run with:** velg **Keyboard Shortcut**
3. Trykk **Cmd + Shift + K**

### 3. Bruk
1. Spør Perplexity om noe
2. Hvis svaret inneholder ```kimi-blokk, kopier hele svaret (Cmd+A, Cmd+C)
3. Trykk **Cmd + Shift + K**
4. Terminal åpnes automatisk med KIMI-kommandoen

---

## Metode B: Hammerspoon (For avanserte brukere)

### 1. Installer Hammerspoon
```bash
brew install --cask hammerspoon
```

### 2. Legg til i `~/.hammerspoon/init.lua`:
```lua
-- Kjør i KIMI fra Perplexity
hs.hotkey.bind({"cmd", "shift"}, "K", function()
  local script = "/Users/taj/bilglass/.kimi/kimi-from-perplexity.sh"
  hs.task.new(script, function(exitCode, stdOut, stdErr)
    if exitCode == 0 then
      hs.alert.show("🔍 Kjører i KIMI...")
    else
      hs.alert.show("❌ Feil: " .. (stdErr or "ukjent"))
    end
  end):start()
end)
```

### 3. Last config på nytt
```bash
hs -c "hs.reload()"
```

---

## Metode C: Raycast (Hvis du bruker Raycast)

### 1. Opprett Script Command
1. Åpne Raycast → Create Script Command
2. Navn: `kjori-kimi`
3. Mode: `silent`
4. Script:
```bash
#!/bin/bash
# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Kjør i KIMI
# @raycast.mode silent
# @raycast.icon 🔍
# @raycast.packageName Autoglass

/Users/taj/bilglass/.kimi/kimi-from-perplexity.sh
```

### 2. Bind til hurtigtast
1. Raycast → Settings → Hotkeys
2. Finn "Kjør i KIMI" → bind **Cmd + Shift + K**

---

## Hvordan det fungerer

```
┌─────────────────┐
│  Perplexity Pro │
│  (Custom Inst.) │
│                 │
│  Svar +         │
│  ```kimi        │
│  kimi glass-*   │
│  ```            │
└────────┬────────┘
         │ Kopier (Cmd+C)
         ▼
┌─────────────────┐
│  Clipboard      │
└────────┬────────┘
         │ Cmd+Shift+K
         ▼
┌─────────────────────────────┐
│  kimi-from-perplexity.sh    │
│  1. Leser clipboard         │
│  2. Parser ```kimi-blokk    │
│  3. Åpner Terminal          │
│  4. Kjører KIMI-kommando    │
└─────────────────────────────┘
```

---

## Feilsøking

| Problem | Løsning |
|---------|---------|
| "Clipboard er tomt" | Kopier Perplexity-svaret først (Cmd+A, Cmd+C) |
| "Ingen KIMI-kommando funnet" | Sjekk at Perplexity Custom Instructions er aktivert |
| Terminal åpner ikke | Sjekk at Terminal.app har rettigheter i System Settings → Privacy |
| `kimi` ikke funnet | Sjekk at KIMI CLI er i PATH (`which kimi`) |
| Script kjører ikke | `chmod +x ~/bilglass/.kimi/kimi-from-perplexity.sh` |

---

## Tips

- Perplexity Pro trenger noen samtaler før den konsekvent avslutter med KIMI-kommandoer
- Du kan alltid kopiere kommandoen manuelt fra Perplexity-svaret
- Scriptet støtter også manuell input hvis ingen kommando parses automatisk
