export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const targetUrl = new URL(
    url.pathname + url.search,
    'https://autoglass-glass-sok.autoglassnorge.workers.dev'
  );

  const modifiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return fetch(modifiedRequest);
}
