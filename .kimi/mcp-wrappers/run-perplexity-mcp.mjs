#!/usr/bin/env node
/**
 * Perplexity MCP-server — eksponerer Perplexity Sonar som MCP-verktøy
 * Autoglass AS — selvstendig, ingen avhengighet til Klarpakke
 */
import { createInterface } from 'readline';
import { loadEnvLocal } from './load-env.mjs';

const env = loadEnvLocal();
const API_KEY = env.PERPLEXITY_API_KEY || '';

const serverInfo = { name: 'perplexity-mcp', version: '1.0.0' };
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
      model: { type: 'string', enum: ['sonar', 'sonar-pro'], default: 'sonar' }
    },
    required: ['query']
  }
}];

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
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
    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: query }],
          max_tokens: 1024,
          return_citations: true
        })
      });
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || 'Ingen svar';
      const citations = data.citations?.slice(0, 3).join('\n') || '';
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: answer + (citations ? '\n\nKilder:\n' + citations : '') }]
      }});
    } catch (err) {
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: 'Feil: ' + err.message }]
      }});
    }
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
});
