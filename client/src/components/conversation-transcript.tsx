import { useEffect, useRef, type ReactNode } from "react";
import { User, Bot } from "lucide-react";
import type { Message } from "@shared/schema";

interface ConversationTranscriptProps {
  messages: Message[];
  highlightQuotedText?: boolean;
}

function renderMessageContent(content: string, highlightQuotedText: boolean) {
  if (!highlightQuotedText) {
    return <p className="text-sm text-slate-800">{content}</p>;
  }

  const quoteRegex = /"([^"]+)"/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(content)) !== null) {
    const matchStart = match.index;
    const matchEnd = quoteRegex.lastIndex;

    if (matchStart > lastIndex) {
      nodes.push(content.slice(lastIndex, matchStart));
    }

    nodes.push(
      <mark
        key={`quote-${matchStart}`}
        className="rounded bg-purple-100 px-1 py-0.5 text-purple-900 ring-1 ring-purple-300"
      >
        {match[0]}
      </mark>
    );

    lastIndex = matchEnd;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  if (nodes.length === 0) {
    return <p className="text-sm text-slate-800">{content}</p>;
  }

  return <p className="text-sm text-slate-800 leading-relaxed">{nodes}</p>;
}

export default function ConversationTranscript({ messages, highlightQuotedText = false }: ConversationTranscriptProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of transcript container only
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
        <Bot className="text-blue-500 mr-3 w-5 h-5" />
        Conversation Transcript
      </h3>
      
      <div 
        ref={scrollContainerRef}
        className="h-96 overflow-y-auto" 
        data-testid="conversation-transcript"
      >
        <div className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-slate-500 text-center py-8" data-testid="empty-transcript">
              Your conversation will appear here...
            </p>
          ) : (
            <>
              {messages.map((message, index) => (
                <div key={index} className="flex space-x-3" data-testid={`message-${index}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === 'student' 
                      ? 'bg-blue-100' 
                      : 'bg-green-100'
                  }`}>
                    {message.role === 'student' ? (
                      <User className="text-blue-500 text-sm w-4 h-4" />
                    ) : (
                      <Bot className="text-green-500 text-sm w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className={`rounded-lg p-3 ${
                      message.role === 'student' 
                        ? 'bg-blue-50' 
                        : 'bg-green-50'
                    }`}>
                      {renderMessageContent(message.content, highlightQuotedText && message.role !== 'student')}
                    </div>
                    <span className="text-xs text-slate-500 mt-1" data-testid={`message-time-${index}`}>
                      {message.role === 'student' ? 'You' : 'AI Assistant'} • {
                        new Date(message.timestamp).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })
                      }
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
