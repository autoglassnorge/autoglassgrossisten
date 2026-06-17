import type { JsonSchema } from './ai-gateway';

export function buildSystemPrompt(): string {
  return `Du er bilglass-assistenten til Autoglass AS. Du hjelper verksteder og dekkforhandlere å finne riktig bilglass.

VIKTIGE REGLER:
- Du skal aldri opprette bestillinger, tilbud eller endelige priser.
- Hvis brukeren sier "bestill", "send tilbud", "pris" eller vil kjøpe, kall alltid verktøyet handoverToHuman.
- Du kan bare anbefale produkter. CTA er "Se detaljer" eller "Be menneske sjekke".
- Hold svarene korte og vennlige på norsk.
- Du har tilgang til disse verktøyene: searchGlass, explainDifferences, askCustomer, handoverToHuman.

BRUK AV VERKTØY:
- searchGlass: når brukeren oppgir regnr, VIN, eurocode, OEM/artikkelnummer, eller merke/modell/år + posisjon.
- askCustomer: når du trenger et avgrensende svar (f.eks. ADAS, varme, posisjon) – oppgi alltid 2–4 svaralternativer.
- explainDifferences: når brukeren spør "hva er forskjellen?" eller vil sammenligne to kandidater.
- handoverToHuman: ved usikkerhet, ønske om bestilling, eller hvis brukeren ber om et menneske.

Du skal alltid returnere gyldig JSON som følger skjemaet nedenfor. Ingen annen tekst.`;
}

export function responseJsonSchema(): JsonSchema {
  return {
    type: 'object',
    properties: {
      tool_calls: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: ['searchGlass', 'explainDifferences', 'askCustomer', 'handoverToHuman'] },
            params: { type: 'object' },
          },
          required: ['tool', 'params'],
        },
      },
      message: { type: 'string' },
      quick_replies: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, value: { type: 'string' } },
          required: ['label', 'value'],
        },
      },
    },
    required: [],
  };
}

export function buildPromptMessages(opts: {
  pageContext?: { path?: string; current_query?: string; category?: string };
  history: { role: 'user' | 'assistant' | 'tool'; content: string }[];
  toolResults?: unknown[];
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const system = buildSystemPrompt();
  const context = `Side: ${opts.pageContext?.path ?? 'ukjent'}\nNåværende søk: ${opts.pageContext?.current_query ?? ''}\nKategori: ${opts.pageContext?.category ?? ''}`;
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: `${system}\n\nKONTEKST:\n${context}` },
  ];
  for (const h of opts.history) {
    messages.push({ role: h.role === 'tool' ? 'assistant' : h.role, content: h.content });
  }
  if (opts.toolResults && opts.toolResults.length > 0) {
    messages.push({ role: 'user', content: `Verktøyresultater: ${JSON.stringify(opts.toolResults)}` });
  }
  return messages;
}
