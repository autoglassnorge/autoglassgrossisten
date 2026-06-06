# 🤖 Autoglass Ordremottaker Agent

**Versjon:** 1.0  
**Eier:** Tomar / Autoglass AS  
**Erfaringsbase:** 30 år som ordremottaker  
**Mål:** Færrest mulig klikk fra kundehenvendelse til riktig glass i handlekurv

---

## 🎯 Visjon

En **conversational AI** som tar imot kundehenvendelser på naturlig språk — via telefon (transkribert), chat, e-post eller direkteinput — og automatisk:

1. **Forstår** hva kunden trenger
2. **Identifiserer** riktig kjøretøy og glass
3. **Verifiserer** utstyr og varianter
4. **Foreslår** tilbehør og tilleggstjenester
5. **Gir** pristilbud
6. **Oppretter** ordre — alt uten menneskelig innblanding der det er mulig

---

## 📞 Hva kunder faktisk sier (30 års erfaring)

| Kundesitat | Hva agenten må forstå |
|-----------|----------------------|
| "Jeg trenger en frontrute til en VW Transporter 2005" | Merke + modell + år + posisjon |
| "Har dere glass til en Audi A4 med kamera i ruta?" | Merke + modell + ADAS |
| "Jeg har knust sideruten på venstre side" | Posisjon + side, mangler merke/år |
| "AB12345, frontrute" | Regnr + posisjon (enkelt) |
| "Hallooo, jeg har knust ruta på bilen min" | Ingen info → oppfølgingsspørsmål |
| "Jeg trenger det samme som sist" | Kundehistorikk → lookup |
| "Hva koster det å bytte frontrute på en Tesla?" | Prisforespørsel + merke + posisjon |

---

## 🏗️ Arkitektur

```
┌─────────────────────────────────────────────────────────────┐
│                    INNGANGSKANALER                          │
│  Telefon (STT)    Chat (Web)    E-post    Direkteinput      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              LLM NER + Intent Classification                │
│  Extract: merke, modell, år, regnr, VIN, posisjon, utstyr   │
│  Intent: bestill, prisforespørsel, support, reklamasjon     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    GLASS-OPPSLAG                            │
│  regnr → SVV → kType → D1 candidates                        │
│  VIN → decode → make/model/year → D1 candidates             │
│  beskrivelse → LLM → fuzzy match → D1 candidates            │
│  fallback: browse data → manuell verifikasjon               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              EQUIPMENT-VERIFIKASJON (Dialog)                │
│  Rule-based: posisjon → ADAS → regnsensor → oppvarmet       │
│  LLM-fallback: smarte spørsmål basert på kandidater         │
│  Knowledge: lært utstyr fra tidligere ordre på samme regnr  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TILBEHØR + KALIBRERING + PRIS                  │
│  Accessory rules: list, lim, clips, kalibrering             │
│  Calibration check: ADAS → krever kalibrering               │
│  Price lookup: glass + tilbehør + montering + MVA           │
│  Margin calculator: kostpris × faktor = utsalgspris         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    ORDRE / HANDLEKURV                       │
│  B2C: Legg i handlekurv (frontend)                         │
│  B2B: Opprett ordre i UNI Micro (fremtidig)                │
│  E-postbekreftelse: ordrebekreftelse + leveringstid         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧠 LLM-prompt-strategi (Moonshot Kimi K2.5)

### NER-prompt (steg 1: ekstrahering)

```
Du er en erfaren ordremottaker hos Autoglass AS med 30 års erfaring.
Les kundens melding og ekstraher følgende felter:

- vehicle_make: bilmerke
- vehicle_model: modell
- vehicle_year: årsmodell (hvis nevnt)
- regnr: norsk registreringsnummer (2 bokstaver + 4-5 tall)
- vin: 17-sifret VIN (hvis nevnt)
- position: frontrute / bakrute / dørrute-frem / dørrute-bak / siderute / annet
- adas: ja/nei/ukjent
- rain_sensor: ja/nei/ukjent
- heated: ja/nei/ukjent
- intent: bestill / prisforespørsel / support / reklamasjon / uklart
- confidence: 0.0-1.0

Kundens melding: "{{user_input}}"

Svar KUN med JSON.
```

### Dialog-prompt (steg 3-6: oppfølging)

```
Du er ordremottaker hos Autoglass AS. Kunden har henvendt seg om:
- Kjøretøy: {{vehicle.make}} {{vehicle.model}} {{vehicle.year}}
- Kandidater: {{candidates.length}} glass funnet
- Neste usikkerhet: {{next_question}}

Stil ETT kort, naturlig spørsmål på norsk.
Ikke bruk tekniske forkortelser kunden ikke forstår.
Forklar HVORFOR spørsmålet er relevant.
```

---

## 📊 KPI-er (målbare)

| Metrikk | Mål | Hvordan måles |
|---------|-----|--------------|
| Konverteringsrate | >60% | Ordre / henvendelser |
| Nøyaktighet | >95% | Korrekte glass / totale ordre |
| Gjennomsnittlig turer | <4 | Meldinger per ordre |
| Eskaleringsrate | <10% | Overført til menneske |
| Kundetilfredshet | >4.5/5 | Post-ordre evaluering |
| Tid til tilbud | <10s | Første respons med pris |

---

## 🔄 Integrasjon med eksisterende systemer

| System | Bruk |
|--------|------|
| `searchByRegnr()` | Regnr-oppslag mot SVV + D1 |
| `vin-glass-resolver.ts` | VIN-dekoding + kType-matching |
| `glass-guide.ts` | Rule-based utstyrsverifikasjon |
| `llm.ts` | Moonshot Kimi for smarte spørsmål |
| `equipment.ts` | Utstyrsinferens fra OEM-data |
| `pricing/` | Pris-lookup + margin-kalkulasjon |
| `cartStore.ts` | Handlekurv (Zustand) |
| UNI Micro API | Ordreoppretting (fremtidig) |

---

## 🚧 Fremtidige forbedringer

1. **Stemmegjenkjenning**: Integrasjon med telefonisystem (STT)
2. **Kundehistorikk**: "Samme som sist" → lookup siste ordre på regnr
3. **Bildeanalyse**: Kunde sender bilde av skade → AI identifiserer posisjon
4. **Proaktiv**: "Din bil er 5 år gammel, kanskje du trenger ny frontrute snart?"
5. **Multi-language**: Svensk, dansk, engelsk for utenlandske kunder
6. **UNI Micro**: Direkte ordreoppretting i regnskapssystemet

---

*Sist oppdatert: 2026-06-04*  
*Agent-type: conversational-ai*  
*Domene: ordremottak / customer-service*
