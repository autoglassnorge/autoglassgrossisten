import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sendMessage, type OrdremottakerResponse } from '@/api/ordremottaker';

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

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await sendMessage(message, sessionToken || undefined);
      if (response.session_token) setSessionToken(response.session_token);
      return response;
    },
    onSuccess: (response) => {
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

  const sendUserMessage = useCallback(
    (text: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          timestamp: Date.now(),
        },
      ]);
      mutation.mutate(text);
    },
    [mutation]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setSessionToken('');
  }, []);

  return {
    messages,
    sendUserMessage,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset,
  };
}
