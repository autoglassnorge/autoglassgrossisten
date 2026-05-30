# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api.spec.js >> 🔌 API Health >> Glass lookup by regnr should work
- Location: e2e/api.spec.js:20:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 503
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.describe('🔌 API Health', () => {
  4  |   test('Worker health endpoint should return OK', async ({ request }) => {
  5  |     const response = await request.get('https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health');
  6  |     expect(response.status()).toBe(200);
  7  |     
  8  |     const body = await response.json();
  9  |     expect(body.status).toBe('ok');
  10 |   });
  11 | 
  12 |   test('Catalog search should return products', async ({ request }) => {
  13 |     const response = await request.get('https://autoglass-glass-sok.autoglassnorge.workers.dev/api/catalog/search?q=tesla&page=1&per_page=5');
  14 |     expect(response.status()).toBe(200);
  15 |     
  16 |     const body = await response.json();
  17 |     expect(body).toHaveProperty('products');
  18 |   });
  19 | 
  20 |   test('Glass lookup by regnr should work', async ({ request }) => {
  21 |     const response = await request.get('https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=SU18018');
> 22 |     expect(response.status()).toBe(200);
     |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  23 |     
  24 |     const body = await response.json();
  25 |     expect(body).toHaveProperty('vehicle');
  26 |   });
  27 | });
  28 | 
```