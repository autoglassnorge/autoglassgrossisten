const { test, expect } = require('@playwright/test');

test.describe('🔌 API Health', () => {
  test('Worker health endpoint should return OK', async ({ request }) => {
    const response = await request.get('https://autoglass-glass-sok.autoglassnorge.workers.dev/api/health');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('Catalog search should return products', async ({ request }) => {
    const response = await request.get('https://autoglass-glass-sok.autoglassnorge.workers.dev/api/catalog/search?q=tesla&page=1&per_page=5');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('products');
  });

  test('Glass lookup by regnr should work', async ({ request }) => {
    const response = await request.get('https://autoglass-glass-sok.autoglassnorge.workers.dev/api/glass?regnr=SU18018');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('vehicle');
  });
});
