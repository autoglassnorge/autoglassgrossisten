import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sendMessage, type OrdremottakerResponse, type ProactiveSuggestion } from '@/api/ordremottaker';

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  candidates?: OrdremottakerResponse['candidates'];
  accessories?: OrdremottakerResponse['accessories'];
  cartUrl?: string;
  timestamp: number;
}

export function useOrdremottaker() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [proactiveSuggestions, setProactiveSuggestions] = useState<ProactiveSuggestion[] | undefined>();

  const mutation = useMutation({
    mutationFn: async ({ message, customerId }: { message: string; customerId?: number }) => {
      const response = await sendMessage(message, sessionToken || undefined, customerId);
      if (response.session_token) setSessionToken(response.session_token);
      return response;
    },
    onSuccess: (response) => {
      if (response.proactive_suggestions) {
        setProactiveSuggestions(response.proactive_suggestions);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'ai',
          content: response.ai_response,
          candidates: response.candidates,
          accessories: response.accessories,
          cartUrl: response.cart_url,
          timestamp: Date.now(),
        },
      ]);
    },
  });

  const init = useCallback(
    (customerId?: number) => {
      // Send a hidden init message to fetch proactive suggestions
      // without showing a user message bubble
      mutation.mutate({ message: 'Hei', customerId });
    },
    [mutation]
  );

  const sendUserMessage = useCallback(
    (text: string, customerId?: number) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          timestamp: Date.now(),
        },
      ]);
      mutation.mutate({ message: text, customerId });
    },
    [mutation]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setSessionToken('');
    setProactiveSuggestions(undefined);
  }, []);

  return {
    messages,
    proactiveSuggestions,
    sendUserMessage,
    init,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset,
  };
}
