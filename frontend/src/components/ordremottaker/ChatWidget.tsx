import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, RotateCcw } from 'lucide-react';
import { useOrdremottaker } from '@/hooks/useOrdremottaker';
import ChatMessage from './ChatMessage';
import GlassSuggestion from './GlassSuggestion';
import AccessorySelector from './AccessorySelector';

const EXAMPLE_PROMPTS = [
  'Jeg har en VW Transporter 2019 som trenger ny frontrute',
  'Har dere siderute til Audi A4 2015?',
  'Jeg trenger bakrute med varme til Volvo XC60',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, sendUserMessage, isLoading, error, reset } = useOrdremottaker();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, open]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendUserMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-autoglass-blue text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-autoglass-blue focus:ring-offset-2"
        aria-label={open ? 'Lukk chat' : 'Åpne chat'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between bg-autoglass-blue px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <h3 className="text-sm font-semibold">AI Ordremottaker</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={reset}
                className="rounded p-1 transition-colors hover:bg-white/20"
                title="Ny chat"
                aria-label="Ny chat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 transition-colors hover:bg-white/20"
                title="Lukk"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '480px', minHeight: '360px' }}>
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-center text-sm text-gray-500">
                  Hei! Jeg kan hjelpe deg med å finne riktig bilglass. Hva trenger du?
                </p>
                <div className="space-y-2">
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setInput('');
                        sendUserMessage(prompt);
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:border-autoglass-blue hover:bg-autoglass-light hover:text-autoglass-blue"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id}>
                <ChatMessage
                  role={msg.role}
                  content={msg.content}
                  candidates={msg.candidates}
                  accessories={msg.accessories}
                  cartUrl={msg.cartUrl}
                />
                {msg.role === 'ai' && msg.candidates && msg.candidates.length > 0 && (
                  <GlassSuggestion candidates={msg.candidates} />
                )}
                {msg.role === 'ai' && msg.accessories && msg.accessories.length > 0 && (
                  <AccessorySelector accessories={msg.accessories} />
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI tenker...
              </div>
            )}

            {error && (
              <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error instanceof Error ? error.message : 'Noe gikk galt. Prøv igjen.'}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv en melding..."
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-autoglass-blue text-white transition-colors hover:bg-autoglass-dark disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
