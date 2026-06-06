import { User, GraduationCap } from 'lucide-react';
import type { OrdremottakerResponse } from '@/api/ordremottaker';

interface ChatMessageProps {
  role: 'user' | 'ai';
  content: string;
  candidates?: OrdremottakerResponse['candidates'];
  accessories?: OrdremottakerResponse['accessories'];
  cartUrl?: string;
}

export default function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`flex max-w-[90%] md:max-w-[85%] items-start gap-2 rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-autoglass-blue text-white'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <GraduationCap className="h-4 w-4 text-autoglass-blue" />
          )}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
      </div>
    </div>
  );
}
