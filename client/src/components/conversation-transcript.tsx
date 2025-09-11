import { useEffect, useRef } from "react";
import { User, Bot } from "lucide-react";
import type { Message } from "@shared/schema";

interface ConversationTranscriptProps {
  messages: Message[];
}

export default function ConversationTranscript({ messages }: ConversationTranscriptProps) {
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
                      <p className="text-sm text-slate-800">{message.content}</p>
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
