# Email to TecDoc-services.com / CPS Gmb

**Date:** 2026-05-20
**To:** admin@bovsoft.com
**Subject:** Inquiry: TecDoc TAF Data for Automotive Glass Catalog (BLYT AS)

---

Hello,

My name is Tom Arne Jensen, and I represent BLYT AS, a Norwegian B2B wholesaler specializing in automotive glass. We are currently building a digital search tool that allows customers to find the exact correct glass for their vehicle by entering the license plate number.

We have analyzed your website (tec-doc-services.com) and see that you offer conversion of TecDoc TAF data to CSV/MySQL format, as well as access to data for over 1,000 suppliers. This is exactly what we need to take our solution to the next level.

## WHAT WE HAVE TODAY

We currently have:
• A database with 37,500+ glass products from Pilkington, Glavista, Euroglass, and others
• Bovsoft integration for lookups: license plate → kType (TecDoc vehicle ID)
• Cloudflare-based infrastructure (Worker + D1 database + KV cache)

What we are missing is the link between kType and specific glass — i.e.:
> "Vehicle kType 32787 (Skoda Superb) → which eurocode(s) fit?"

## WHAT WE NEED FROM YOU

We need TecDoc TAF data for AUTOMOTIVE GLASS SUPPLIERS converted to CSV or SQL:

### 1. PRODUCT TABLES (Table 200 + 211)
- Articles from glass suppliers:
  * PILKINGTON
  * GLAVISTA
  * SEKURIT / SAINT-GOBAIN
  * NORDGLASS
  * AGC AUTOMOTIVE
  * FUYAO
  * XYB / XYG
- With fields: ArtNo, BrandNo, GenArtNo, eurocode/equivalent

### 2. GENERIC ARTICLES (Table 320)
- To identify glass categories:
  * Front windshield / Windscreen
  * Rear window / Back window
  * Side window / Door glass
  * Quarter window
  * Vent window
- GenArtNo and descriptions in English/Norwegian

### 3. LINKING/APPLICABILITY (Table 400 — THE MOST IMPORTANT)
- Mapping: kType (LnkTargetNo) → ArtNo (product)
- Only for LnkTargetType = 2 (Passenger Car)
- With SeqNo to handle multiple variants per kType

### 4. VEHICLE DATA (Table 120)
- KTYPNR, BJVON (year from), BJBIS (year to)
- Only the kTypes that exist in the applicability data above

## FORMAT WE PREFER

**Option A: CSV files (preferred)**
- One file per table
- UTF-8 encoding
- Comma-separated with headers

**Option B: MySQL SQL dump**
- CREATE TABLE + INSERT statements
- Can be imported directly into SQLite (D1)

**Option C: JSON**
- Array of objects per table
- One file per supplier or per table

## HOW WE WILL USE THE DATA

Our search flow will be:

1. Customer enters license plate (e.g., BS12345)
2. Bovsoft looks up: license plate → kType 32787
3. Our database queries TecDoc linking:
   "Which glass articles (Table 400) are linked to kType 32787?"
4. The system connects to our price list to display:
   - Correct eurocode
   - Stock status
   - Price
   - Images/PDF

## QUESTIONS

1. Do you offer data for specific suppliers (glass only), or must we purchase the full package?
2. What is the price for a data subscription (quarterly/annual)?
3. Can you deliver in CSV format directly, or must we convert ourselves using TAFConvertor?
4. Do you already have converted datasets for glass suppliers ready?
5. Does the data include "terms of use" (installation time, tempered glass, ADAS calibration, etc.)?
6. Can you help identify the correct GenArtNo for glass categories?

## ABOUT US

**BLYT AS**
Tom Arne Jensen
tomarnejensen@gmail.com
WhatsApp: +47 404 08 241

We are a Norwegian B2B automotive glass wholesaler focused on:
• Precise matching: license plate → correct glass
• Logistics: Stock status and delivery time
• Technical support: ADAS, heating, rain sensor, etc.

We look forward to hearing from you and discussing how we can collaborate.

Best regards,
Tom Arne Jensen
BLYT AS
