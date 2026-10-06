'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowUpRight, Bot, ChevronRight, FileText, Loader2, RotateCcw, Send, Shield, Sparkles } from 'lucide-react';
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
  const locale = useLocale();

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
    <div className="h-full w-full flex flex-col min-h-0 bg-[#f9f7f0] overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#d0d5dd] bg-[#f9f7f0]/95 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#13426f] flex items-center justify-center shadow-xs">
            <Bot size={20} className="text-[#2e96ff]" />
          </div>
          <div>
            <h1 className="font-bold text-[#13426f] text-base">{t('title')}</h1>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Shield size={11} className="text-[#2e96ff]" /> {t('privacyNote')}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-xs font-semibold text-gray-600 hover:text-red-600 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#d0d5dd] bg-white hover:border-red-200 hover:bg-red-50 transition-all shadow-xs cursor-pointer"
          >
            <RotateCcw size={13} />
            {t('clearSession')}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto bg-[#f9f7f0]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-8 space-y-4">
          {restoring ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-[#2e96ff]" size={24} />
            </div>
          ) : messages.length === 0 ? (
            <WelcomeBlock t={t} />
          ) : (
            messages.map((msg, i) => <Bubble key={i} msg={msg} locale={locale} />)
          )}

          {loading && (
            <div className="flex gap-3 items-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[#eef6ff] border border-[#2e96ff]/20 flex items-center justify-center">
                <Bot size={15} className="text-[#2e96ff]" />
              </div>
              <div className="bg-white border border-[#d0d5dd] rounded-[20px] rounded-tl-xs px-4 py-2.5 shadow-xs flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2e96ff] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2e96ff] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2e96ff] animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="text-xs font-medium text-gray-500">{t('typing')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggestions + Input */}
      <div className="border-t border-[#d0d5dd] bg-white shrink-0 shadow-sm z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 space-y-3">
          {showSuggestions && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#2e96ff]" />
                {t('suggestedActions')}
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => send(t(`suggestions.${key}`))}
                    className="text-xs md:text-sm font-medium px-3.5 py-1.5 rounded-full bg-[#eef6ff] text-[#13426f] hover:bg-[#2e96ff] hover:text-white border border-[#2e96ff]/20 transition-all shadow-2xs"
                  >
                    {t(`suggestions.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2.5 items-center">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={t('placeholder')}
              rows={1}
              disabled={loading}
              className="flex-1 resize-none text-sm border border-[#d0d5dd] rounded-[24px] px-5 py-3 focus:outline-none focus:border-[#2e96ff] focus:ring-2 focus:ring-[#2e96ff]/20 max-h-32 overflow-y-auto disabled:opacity-60 bg-white shadow-xs leading-relaxed"
              style={{ minHeight: 48 }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="shrink-0 h-12 px-5 rounded-full bg-[#2e96ff] text-white flex items-center gap-2 hover:bg-[#2582df] shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-[1px] active:shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold cursor-pointer"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="text-sm font-bold hidden sm:inline">{t('send')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderInlineText(text: string, locale: string, isUser: boolean): React.ReactNode[] {
  // Matches:
  // 1. [label](url)
  // 2. **bold**
  // 3. `code`
  // 4. *italic*
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      // Link: [label](url)
      const label = match[2];
      const url = match[3];
      const isInternal = url.startsWith('/');
      const targetUrl = isInternal ? `/${locale}${url}` : url;

      nodes.push(
        <Link
          key={`link-${key++}`}
          href={targetUrl}
          className={`inline-flex items-center gap-1 mx-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold transition-all ${
            isUser
              ? 'bg-white/20 text-white hover:bg-white/30 underline'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 border border-blue-200 shadow-2xs'
          }`}
        >
          <span>{label}</span>
          <ArrowUpRight size={12} className="shrink-0 opacity-80" />
        </Link>
      );
    } else if (match[4]) {
      // Bold: **text**
      nodes.push(
        <strong
          key={`b-${key++}`}
          className={isUser ? 'font-bold text-white' : 'font-semibold text-gray-900'}
        >
          {match[4]}
        </strong>
      );
    } else if (match[5]) {
      // Code: `text`
      nodes.push(
        <code
          key={`c-${key++}`}
          className={`px-1.5 py-0.5 rounded text-xs font-mono ${
            isUser ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-800'
          }`}
        >
          {match[5]}
        </code>
      );
    } else if (match[6]) {
      // Italic: *text*
      nodes.push(
        <em key={`i-${key++}`} className="italic">
          {match[6]}
        </em>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function ChatMarkdown({ content, locale, isUser }: { content: string; locale: string; isUser: boolean }) {
  if (isUser) {
    return <div className="whitespace-pre-wrap leading-relaxed">{renderInlineText(content, locale, isUser)}</div>;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!currentList) return;
    if (currentList.type === 'ol') {
      elements.push(
        <ol key={`ol-${key++}`} className="my-2 space-y-1.5 list-decimal pl-5 text-gray-800">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineText(item, locale, isUser)}
            </li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`ul-${key++}`} className="my-2 space-y-1.5 list-disc pl-5 text-gray-800">
          {currentList.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineText(item, locale, isUser)}
            </li>
          ))}
        </ul>
      );
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    // Numbered list item: e.g. "1. " or "2. "
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (currentList && currentList.type !== 'ol') {
        flushList();
      }
      if (!currentList) {
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numMatch[2]);
      continue;
    }

    // Bullet list item: e.g. "- " or "* "
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (currentList && currentList.type !== 'ul') {
        flushList();
      }
      if (!currentList) {
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    flushList();

    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${key++}`} className="font-semibold text-gray-900 mt-3 mb-1 text-sm">
          {renderInlineText(line.slice(4), locale, isUser)}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${key++}`} className="font-bold text-gray-900 mt-4 mb-1.5 text-base border-b border-gray-100 pb-1">
          {renderInlineText(line.slice(3), locale, isUser)}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${key++}`} className="font-bold text-gray-900 mt-4 mb-2 text-lg">
          {renderInlineText(line.slice(2), locale, isUser)}
        </h2>
      );
    } else {
      elements.push(
        <p key={`p-${key++}`} className="leading-relaxed text-[#333333]">
          {renderInlineText(line, locale, isUser)}
        </p>
      );
    }
  }

  flushList();

  return <div className="space-y-2.5 text-sm leading-relaxed">{elements}</div>;
}

function Bubble({ msg, locale }: { msg: Message; locale: string }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-2xs ${
          isUser ? 'bg-[#13426f] text-white' : 'bg-[#eef6ff] border border-[#2e96ff]/20'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-bold text-white">U</span>
        ) : (
          <Bot size={15} className="text-[#2e96ff]" />
        )}
      </div>
      <div className="max-w-[80%] space-y-1">
        <div
          className={`shadow-xs text-sm ${
            isUser
              ? 'px-5 py-3 rounded-[22px] bg-[#13426f] text-white rounded-tr-xs font-medium'
              : 'p-6 rounded-[24px] bg-white border border-[#d0d5dd] text-[#333333] rounded-tl-xs shadow-card'
          }`}
        >
          <ChatMarkdown content={msg.content} locale={locale} isUser={isUser} />
        </div>
        {msg.timestamp && (
          <p className={`text-[10px] font-medium text-gray-400 px-2 ${isUser ? 'text-right' : ''}`}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

function WelcomeBlock({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="bg-white border border-[#d0d5dd] rounded-[26px] p-8 max-w-md mx-auto text-center my-8 shadow-sm">
      <div className="w-16 h-16 rounded-full bg-[#13426f] flex items-center justify-center mx-auto mb-4 shadow-[0_5px_0_0_rgba(154,207,246,0.5)]">
        <Bot size={30} className="text-[#2e96ff]" />
      </div>
      <h2 className="text-xl font-bold text-[#13426f] mb-2">{t('title')}</h2>
      <p className="text-sm text-[#4a5568] leading-relaxed">{t('welcome')}</p>
    </div>
  );
}
