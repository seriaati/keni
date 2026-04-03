import { useEffect, useRef, useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { chat as chatApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/ui/Toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const SUGGESTIONS = [
  'How much did I spend this month?',
  'What was my biggest expense?',
  'Compare this month vs last month',
  'Any tips on where I could cut back?',
];

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { activeWallet } = useWallet();
  const toast = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const loadingMsg: Message = { id: Date.now().toString() + 'l', role: 'assistant', content: '', loading: true };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await chatApi.send(text, activeWallet?.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === loadingMsg.id ? { ...m, content: res.response, loading: false } : m)),
      );
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));
      toast(e instanceof Error ? e.message : 'Failed to get response', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--header-height) - 80px)', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title">Chat with Zeni</h1>
        <p className="page-subtitle">Ask questions about your spending in plain language</p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 16 }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'oklch(92% 0.06 155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Bot size={28} style={{ color: 'var(--forest)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>Ask me anything about your spending</p>
              <p style={{ fontSize: 14, color: 'var(--ink-light)' }}>I can analyze your expenses, spot trends, and give you insights.</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 480 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 100,
                    fontSize: 13,
                    fontFamily: 'var(--font-body)',
                    background: 'white',
                    border: '1px solid var(--cream-darker)',
                    color: 'var(--ink-mid)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--cream)'; e.currentTarget.style.borderColor = 'var(--sand)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'var(--cream-darker)'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 10,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                animation: 'fadeIn 0.2s ease both',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: msg.role === 'user' ? 'var(--forest)' : 'oklch(92% 0.06 155)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {msg.role === 'user'
                  ? <User size={16} style={{ color: 'var(--cream)' }} />
                  : <Bot size={16} style={{ color: 'var(--forest)' }} />
                }
              </div>
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                background: msg.role === 'user' ? 'var(--forest)' : 'white',
                border: msg.role === 'assistant' ? '1px solid var(--cream-darker)' : 'none',
                color: msg.role === 'user' ? 'var(--cream)' : 'var(--ink)',
                fontSize: 14,
                lineHeight: 1.6,
              }}>
                {msg.loading ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--ink-faint)',
                          animation: `spin 1s ${i * 0.15}s ease-in-out infinite`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        background: 'white',
        border: '1.5px solid var(--sand)',
        borderRadius: 14,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: '10px 12px',
        transition: 'border-color 0.15s',
      }}
        onFocusCapture={(e) => (e.currentTarget.style.borderColor = 'var(--forest-mid)')}
        onBlurCapture={(e) => (e.currentTarget.style.borderColor = 'var(--sand)')}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your spending…"
          rows={1}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--ink)',
            background: 'transparent',
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: 'auto',
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: input.trim() && !loading ? 'var(--forest)' : 'var(--cream-darker)',
            border: 'none',
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          <Send size={15} style={{ color: input.trim() && !loading ? 'var(--cream)' : 'var(--ink-faint)' }} />
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 6 }}>
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
