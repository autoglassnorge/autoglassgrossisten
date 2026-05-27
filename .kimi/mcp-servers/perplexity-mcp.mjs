#!/usr/bin/env node
/**
 * 🔍 Perplexity MCP Server v1.1.0 — Autoglass AS Edition
 *
 * Isolert fra Klarpakke. Eksponerer Perplexity Sonar som MCP-verktøy
 * for KIMI CLI-agenter i Autoglass AS-prosjektet.
 *
 * Versjon: 1.1.0
 * Dato: 2026-05-23
 */

const API_KEY = process.env.PERPLEXITY_API_KEY || '';

if (!API_KEY) {
  console.error('[Perplexity MCP] WARNING: PERPLEXITY_API_KEY ikke satt. Sett med: export PERPLEXITY_API_KEY=...');
}

const serverInfo = { name: 'perplexity-mcp', version: '1.1.0', wing: 'autoglass' };
const initResult = {
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} },
  serverInfo,
};

const tools = [{
  name: 'perplexity_search',
  description: 'Søk på internett via Perplexity Sonar. Bruk for research, oppdatert dokumentasjon, nyheter og faktasjekk.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Søkespørsmål på norsk eller engelsk' },
      model: { type: 'string', enum: ['sonar', 'sonar-pro'], default: 'sonar', description: 'sonar = rask, sonar-pro = dypere analyse' },
      recency_days: { type: 'number', default: 365, description: 'Begrens søk til innhold fra siste N dager' }
    },
    required: ['query']
  }
}];

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    handleLine(line);
  }
});

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: initResult });
  } else if (method === 'notifications/initialized') {
    // no-op
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools } });
  } else if (method === 'tools/call' && params?.name === 'perplexity_search') {
    const query = params.arguments?.query || '';
    const model = params.arguments?.model || 'sonar';
    const recencyDays = params.arguments?.recency_days || 365;

    if (!API_KEY) {
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: 'Feil: PERPLEXITY_API_KEY ikke konfigurert. Sett miljøvariabelen og restart KIMI CLI.' }]
      }});
      return;
    }

    try {
      const body = {
        model: model === 'sonar-pro' ? 'sonar-pro' : 'sonar',
        messages: [{ role: 'user', content: query }],
        max_tokens: 2048,
        temperature: 0.2,
        return_citations: true,
        search_recency_filter: recencyDays < 30 ? 'month' : recencyDays < 90 ? 'month' : 'year'
      };

      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        send({ jsonrpc: '2.0', id, result: {
          content: [{ type: 'text', text: `Perplexity API feil (HTTP ${res.status}): ${errText}` }]
        }});
        return;
      }

      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || 'Ingen svar mottatt';
      const citations = data.citations || [];
      const usage = data.usage;

      let output = answer;
      if (citations.length > 0) {
        output += '\n\n📚 Kilder:\n' + citations.map((c, i) => `${i + 1}. ${c}`).join('\n');
      }
      if (usage) {
        output += `\n\n📊 Bruk: ${usage.total_tokens} tokens (${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion)`;
      }

      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: output }]
      }});
    } catch (err) {
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `Feil ved kall til Perplexity: ${err.message}` }]
      }});
    }
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
}
