import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, RotateCcw, GraduationCap, Check, XCircle, HelpCircle } from 'lucide-react';
import { useOrdremottaker } from '@/hooks/useOrdremottaker';
import { useChatStore } from '@/stores/chatStore';
import ChatMessage from './ChatMessage';
import GlassSuggestion from './GlassSuggestion';
import AccessorySelector from './AccessorySelector';
import ProactiveSuggestions from './ProactiveSuggestions';

const EXAMPLE_PROMPTS = [
  'Jeg har en VW Transporter 2019 som trenger ny frontrute',
  'Har dere siderute til Audi A4 2015?',
  'Jeg trenger bakrute med varme til Volvo XC60',
];

// MVP: hardcoded customer ID until real auth is implemented
const MVP_CUSTOMER_ID = 1;

export default function ChatWidget() {
  const { isOpen, initialMessage, initialRegnr, openChat, closeChat, clearInitial } = useChatStore();
  const [input, setInput] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'wrong' | 'submitted'>('idle');
  const [correctEurocode, setCorrectEurocode] = useState('');
  const {
    messages,
    proactiveSuggestions,
    sessionToken,
    equipmentAnswers,
    sendUserMessage,
    init,
    isLoading,
    error,
    reset,
    sendFeedback,
    isFeedbackLoading,
    recordEquipmentAnswer,
  } = useOrdremottaker();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isOpen, feedbackState]);

  // Handle chat open: send initial message/regnr or init proactive suggestions
  useEffect(() => {
    if (!isOpen || messages.length > 0) return;

    if (initialMessage) {
      sendUserMessage(initialMessage, MVP_CUSTOMER_ID);
      clearInitial();
    } else if (initialRegnr) {
      sendUserMessage(initialRegnr, MVP_CUSTOMER_ID);
      clearInitial();
    } else if (!proactiveSuggestions && !isLoading) {
      init(MVP_CUSTOMER_ID);
    }
  }, [isOpen, messages.length, initialMessage, initialRegnr, proactiveSuggestions, isLoading, init, sendUserMessage, clearInitial]);

  // Reset feedback state when a new AI message arrives
  useEffect(() => {
    setFeedbackState('idle');
    setCorrectEurocode('');
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendUserMessage(text, MVP_CUSTOMER_ID);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  const handleEquipmentAnswer = (answer: string) => {
    const lastAiMsg = [...messages].reverse().find((m) => m.role === 'ai');
    if (!lastAiMsg?.nextAction) return;
    recordEquipmentAnswer(lastAiMsg.nextAction, answer);
    sendUserMessage(answer, MVP_CUSTOMER_ID);
  };

  const lastAiMessage = [...messages].reverse().find((m) => m.role === 'ai');
  const isAskingEquipment = lastAiMessage?.nextAction?.startsWith('ask_') ?? false;
  const isShowingRecommendation =
    lastAiMessage?.status === 'recommendation' &&
    lastAiMessage.candidates &&
    lastAiMessage.candidates.length > 0;

  const handleFeedback = async (wasCorrect: 1 | 0 | -1) => {
    if (!lastAiMessage?.candidates || lastAiMessage.candidates.length === 0 || !sessionToken) return;

    const recommended = lastAiMessage.candidates[0];
    const payload = {
      session_token: sessionToken,
      position: recommended.typeCodeDesc || recommended.typeCode || '',
      recommended_eurocode: recommended.eurocode,
      chosen_eurocode: wasCorrect === 0 ? correctEurocode : undefined,
      was_correct: wasCorrect,
      equipment_answers: equipmentAnswers,
    };

    await sendFeedback(payload);
    setFeedbackState('submitted');
  };

  const handleWrongGlass = () => {
    setFeedbackState('wrong');
  };

  const handleSubmitWrongGlass = async () => {
    await handleFeedback(0);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => isOpen ? closeChat() : openChat()}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-autoglass-blue text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-autoglass-blue focus:ring-offset-2"
        aria-label={isOpen ? 'Lukk chat' : 'Åpne chat'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white animate-fade-in md:bottom-24 md:right-6 md:w-[380px] md:rounded-2xl md:border md:border-gray-200 md:shadow-2xl md:inset-auto md:h-auto md:max-h-[600px]">
          {/* Header */}
          <div className="flex items-center justify-between bg-autoglass-blue px-4 py-3 text-white shrink-0">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              <h3 className="text-base md:text-sm font-semibold">Professor Autoglass</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={reset}
                className="rounded p-2 md:p-1 transition-colors hover:bg-white/20 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center"
                title="Ny chat"
                aria-label="Ny chat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={closeChat}
                className="rounded p-2 md:p-1 transition-colors hover:bg-white/20 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center"
                title="Lukk"
                aria-label="Lukk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:max-h-[480px] md:min-h-[360px]">
            {messages.length === 0 && (
              <div className="space-y-4 md:space-y-3">
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <GraduationCap className="h-5 w-5 text-autoglass-blue" />
                  <p className="text-base md:text-sm font-medium">
                    Hei! Jeg er Professor Autoglass, din ekspert på bilglass. Skal vi finne riktig glass til deg?
                  </p>
                </div>
                <div className="space-y-2">
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setInput('');
                        sendUserMessage(prompt, MVP_CUSTOMER_ID);
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 md:px-3 md:py-2 text-left text-base md:text-sm text-gray-700 transition-colors hover:border-autoglass-blue hover:bg-autoglass-light hover:text-autoglass-blue min-h-[44px]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Proactive suggestions shown above first AI response when available */}
            {messages.length === 0 && proactiveSuggestions && proactiveSuggestions.length > 0 && (
              <ProactiveSuggestions suggestions={proactiveSuggestions} />
            )}

            {messages.map((msg, idx) => {
              const isLastMessage = idx === messages.length - 1;
              return (
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

                  {/* Equipment question buttons — only on last AI message */}
                  {isLastMessage && msg.role === 'ai' && isAskingEquipment && (
                    <div className="mb-4 mt-2 flex flex-col gap-2">
                      <p className="text-sm text-gray-500">Velg et alternativ:</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleEquipmentAnswer('Ja')}
                          disabled={isLoading}
                          className="flex-1 min-h-[48px] rounded-xl bg-green-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50 active:scale-[0.98]"
                        >
                          Ja
                        </button>
                        <button
                          onClick={() => handleEquipmentAnswer('Nei')}
                          disabled={isLoading}
                          className="flex-1 min-h-[48px] rounded-xl bg-gray-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-gray-600 disabled:opacity-50 active:scale-[0.98]"
                        >
                          Nei
                        </button>
                        <button
                          onClick={() => handleEquipmentAnswer('Vet ikke')}
                          disabled={isLoading}
                          className="flex-1 min-h-[48px] rounded-xl border-2 border-autoglass-blue bg-white px-4 py-3 text-base font-semibold text-autoglass-blue transition-colors hover:bg-autoglass-light disabled:opacity-50 active:scale-[0.98]"
                        >
                          Vet ikke
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Feedback UI — only on last AI message when showing recommendations */}
                  {isLastMessage && msg.role === 'ai' && isShowingRecommendation && feedbackState !== 'submitted' && (
                    <div className="mb-4 mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="mb-3 text-base font-medium text-gray-700">
                        Var dette riktig glass?
                      </p>
                      {feedbackState === 'idle' ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleFeedback(1)}
                            disabled={isFeedbackLoading}
                            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50 active:scale-[0.98]"
                          >
                            <Check className="h-5 w-5" />
                            Riktig
                          </button>
                          <button
                            onClick={handleWrongGlass}
                            disabled={isFeedbackLoading}
                            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50 active:scale-[0.98]"
                          >
                            <XCircle className="h-5 w-5" />
                            Feil glass
                          </button>
                          <button
                            onClick={() => handleFeedback(-1)}
                            disabled={isFeedbackLoading}
                            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 active:scale-[0.98]"
                          >
                            <HelpCircle className="h-5 w-5" />
                            Usikker
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-600">
                            Skriv inn riktig eurocode (valgfritt):
                          </p>
                          <input
                            type="text"
                            value={correctEurocode}
                            onChange={(e) => setCorrectEurocode(e.target.value)}
                            placeholder="Eurocode..."
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-800 placeholder-gray-400 outline-none focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue min-h-[44px]"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSubmitWrongGlass}
                              disabled={isFeedbackLoading}
                              className="flex-1 min-h-[48px] rounded-xl bg-autoglass-blue px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-autoglass-dark disabled:opacity-50 active:scale-[0.98]"
                            >
                              Send tilbakemelding
                            </button>
                            <button
                              onClick={() => setFeedbackState('idle')}
                              disabled={isFeedbackLoading}
                              className="min-h-[48px] rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 active:scale-[0.98]"
                            >
                              Avbryt
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isLastMessage && msg.role === 'ai' && isShowingRecommendation && feedbackState === 'submitted' && (
                    <div className="mb-4 mt-2 rounded-xl bg-green-50 px-4 py-3 text-center text-base font-medium text-green-700">
                      Takk for tilbakemeldingen!
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-center gap-2 py-3 md:py-2 text-base md:text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Professor Autoglass tenker...
              </div>
            )}

            {error && (
              <div className="mt-2 rounded-lg bg-red-50 px-4 py-3 md:px-3 md:py-2 text-base md:text-sm text-red-600">
                {error instanceof Error ? error.message : 'Noe gikk galt. Prøv igjen.'}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-4 md:px-3 md:py-3 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv en melding..."
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 md:px-3 md:py-2 text-base md:text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-autoglass-blue focus:ring-1 focus:ring-autoglass-blue min-h-[44px]"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-lg bg-autoglass-blue text-white transition-colors hover:bg-autoglass-dark disabled:opacity-40 shrink-0"
              aria-label="Send"
            >
              <Send className="h-5 w-5 md:h-4 md:w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
