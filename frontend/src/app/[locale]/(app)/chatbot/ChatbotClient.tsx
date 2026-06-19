'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Loader2, RotateCcw, Send, Shield, Sparkles } from 'lucide-react';
import api from '@/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

const SESSION_KEY = 'cf_chat_session_id';

const SUGGESTED_KEYS = [
  'whatInsurance',
  'claimProcess',
  'disasterCover',
  'premium',
] as const;

export function ChatbotClient() {
  const t = useTranslations('chatbot');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      setRestoring(false);
      return;
    }
    setSessionId(stored);
    api
      .get(`/chatbot/session/${stored}`)
      .then((r) => {
        const msgs: Message[] = r.data.messages.map(
          (m: { role: string; content: string; timestamp: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp,
          })
        );
        setMessages(msgs);
      })
      .catch(() => {
        localStorage.removeItem(SESSION_KEY);
        setSessionId(null);
      })
      .finally(() => setRestoring(false));
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || loading) return;

      setInput('');
      setMessages((prev) => [...prev, { role: 'user', content }]);
      setLoading(true);

      try {
        const r = await api.post<{ reply: string; session_id: string }>('/chatbot/message', {
          message: content,
          session_id: sessionId,
        });
        const { reply, session_id } = r.data;
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        setSessionId(session_id);
        localStorage.setItem(SESSION_KEY, session_id);
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: detail ?? t('errorRetry') },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, sessionId, t]
  );

  const clearHistory = async () => {
    if (sessionId) {
      await api.delete(`/chatbot/session/${sessionId}`).catch(() => null);
      localStorage.removeItem(SESSION_KEY);
    }
    setSessionId(null);
    setMessages([]);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const showSuggestions = !restoring && messages.length === 0 && !loading;

  return (
    <div className="h-full flex flex-col -m-6">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">{t('title')}</h1>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Shield size={11} /> {t('privacyNote')}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-sm text-gray-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded-md border hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            <RotateCcw size={14} />
            {t('clearSession')}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {restoring ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-blue-600" size={24} />
            </div>
          ) : messages.length === 0 ? (
            <WelcomeBlock t={t} />
          ) : (
            messages.map((msg, i) => <Bubble key={i} msg={msg} />)
          )}

          {loading && (
            <div className="flex gap-3 items-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Bot size={15} className="text-blue-600" />
              </div>
              <div className="bg-white border rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="text-xs text-gray-500">{t('typing')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggestions + Input */}
      <div className="border-t bg-white shrink-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-3">
          {showSuggestions && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Sparkles size={12} className="text-blue-500" />
                {t('suggestedActions')}
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => send(t(`suggestions.${key}`))}
                    className="text-sm px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 transition-colors"
                  >
                    {t(`suggestions.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={t('placeholder')}
              rows={1}
              disabled={loading}
              className="flex-1 resize-none text-sm border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400 max-h-32 overflow-y-auto disabled:opacity-60"
              style={{ minHeight: 48 }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="shrink-0 h-12 px-4 rounded-xl bg-blue-600 text-white flex items-center gap-2 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="text-sm font-medium hidden sm:inline">{t('send')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-gray-200' : 'bg-blue-100'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-semibold text-gray-600">U</span>
        ) : (
          <Bot size={15} className="text-blue-600" />
        )}
      </div>
      <div className="max-w-[78%] space-y-1">
        <div
          className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm whitespace-pre-wrap ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-white border text-gray-800 rounded-tl-sm'
          }`}
        >
          {msg.content}
        </div>
        {msg.timestamp && (
          <p className={`text-[10px] text-gray-400 ${isUser ? 'text-right' : ''}`}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

function WelcomeBlock({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg">
        <Bot size={32} className="text-white" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('title')}</h2>
      <p className="text-sm text-gray-600 max-w-md">{t('welcome')}</p>
    </div>
  );
}
