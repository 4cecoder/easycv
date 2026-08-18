"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getBrowserSessionId } from "../lib/fingerprint";
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { Button, Badge } from "@bytecats/ui-kit";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  category?: string;
  queryId?: Id<"faqQueries">;
  feedback?: "helpful" | "unhelpful";
  actionButton?: {
    label: string;
    href?: string;
  };
}

const FAQ_KNOWLEDGE_BASE = [
  {
    category: "download",
    keywords: ["download", "pdf", "get", "file", "save", "export", "print"],
    question: "How do I download my resume?",
    answer:
      "Once your resume is generated, click the 'Download PDF' button in the top action bar of your preview workspace. You'll get a clean, high-resolution document ready to send directly to employers.",
  },
  {
    category: "pricing",
    keywords: ["cost", "price", "pro", "pay", "upgrade", "14", "dollar", "buy", "subscription", "fee"],
    question: "What comes with easyCV Pro ($14)?",
    answer:
      "easyCV Pro is a simple $14 one-time purchase (no recurring subscriptions). It gives you unlimited resume auto-improvements, unwatermarked PDF downloads, and complete document source files.",
    hasUpgradeCta: true,
  },
  {
    category: "formatting",
    keywords: ["ats", "format", "compatible", "layout", "scanner", "read", "style"],
    question: "How does easyCV format my resume?",
    answer:
      "easyCV formats your resume to match standard company hiring guidelines so hiring managers and recruiting systems can easily read your skills, titles, and career history without layout errors.",
  },
  {
    category: "multiple_files",
    keywords: ["multiple", "files", "merge", "combine", "old", "history", "past", "vault"],
    question: "Can I upload multiple previous resumes?",
    answer:
      "Yes! You can drop all your past resumes, profiles, and project notes at once. Our system automatically combines your experiences into a single, polished master resume.",
  },
  {
    category: "clarity",
    keywords: ["grammar", "score", "clarity", "bullets", "words", "improve", "fix"],
    question: "How does resume clarity scoring work?",
    answer:
      "We check your resume bullet points for concise phrasing, strong active accomplishments, and clear metrics so recruiters can quickly see your biggest achievements.",
  },
  {
    category: "account",
    keywords: ["account", "sign in", "login", "email", "save", "sync", "device", "phone"],
    question: "How do I access my saved resumes on another device?",
    answer:
      "Enter your email in the 'Sign In' button in the top menu. We will send you a fast 6-digit login code so you can access your saved resumes on any computer or phone.",
  },
];

export function FAQAssistantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Hello! I am your easyCV Assistant. Ask me any question about formatting your resume, downloading files, or upgrading your account.",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const recordQuery = useMutation(api.faq.recordFaqQuery);
  const rateQuery = useMutation(api.faq.rateFaqQuery);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const findBestAnswer = (queryText: string) => {
    const lower = queryText.toLowerCase();
    
    let bestMatch = null;
    let maxScore = 0;

    for (const item of FAQ_KNOWLEDGE_BASE) {
      let score = 0;
      for (const kw of item.keywords) {
        if (lower.includes(kw)) score += 2;
      }
      if (score > maxScore) {
        maxScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && maxScore > 0) {
      return {
        text: bestMatch.answer,
        category: bestMatch.category,
        hasUpgradeCta: (bestMatch as any).hasUpgradeCta,
      };
    }

    return {
      text: "easyCV helps you build clean, recruiter-ready resumes in seconds. You can upload past files, auto-improve your bullet points, and download your final PDF with Pro ($14).",
      category: "general",
      hasUpgradeCta: false,
    };
  };

  const handleSend = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || isTyping) return;

    const userMsgId = `user_${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, sender: "user", text: queryText },
    ];

    setMessages(newMessages);
    setInput("");
    setIsTyping(true);

    const match = findBestAnswer(queryText);
    const sessionId = getBrowserSessionId();

    let queryId: Id<"faqQueries"> | undefined;
    try {
      if (sessionId) {
        queryId = await recordQuery({
          sessionId,
          question: queryText,
          answer: match.text,
          category: match.category,
        });
      }
    } catch {
      // Non-blocking
    }

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          sender: "bot",
          text: match.text,
          category: match.category,
          queryId,
          actionButton: match.hasUpgradeCta
            ? { label: "Unlock easyCV Pro ($14)" }
            : undefined,
        },
      ]);
      setIsTyping(false);
    }, 350);
  };

  const handleFeedback = async (msgId: string, queryId: Id<"faqQueries"> | undefined, rating: "helpful" | "unhelpful") => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedback: rating } : m))
    );

    if (queryId) {
      try {
        await rateQuery({ queryId, feedback: rating });
      } catch {
        // Non-blocking
      }
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {/* Closed Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xl transition-all hover:scale-105 active:scale-95 hover:shadow-2xl border border-primary/40"
        >
          <div className="relative">
            <MessageSquare className="size-4" />
            <span className="absolute -top-1 -right-1 flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
            </span>
          </div>
          <span>Help & Support</span>
        </button>
      )}

      {/* Expanded Interactive Chat Modal */}
      {isOpen && (
        <div className="flex flex-col w-[350px] sm:w-[380px] h-[500px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/40 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                <Bot className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-foreground">easyCV Support</h3>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono">
                    Online
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">Instant help with formatting & downloads</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Quick FAQ Chips */}
          <div className="p-2 border-b border-border bg-muted/10 overflow-x-auto flex gap-1.5 select-none no-scrollbar">
            {[
              "How to download?",
              "What is Pro ($14)?",
              "Multiple resumes",
              "Resume formatting",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => handleSend(chip)}
                className="whitespace-nowrap rounded-full border border-border bg-background/80 hover:border-primary/40 hover:bg-primary/5 px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-all shrink-0"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                    m.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-xs font-medium shadow-xs"
                      : "bg-muted/60 text-foreground border border-border/60 rounded-bl-xs shadow-2xs"
                  }`}
                >
                  {m.text}
                </div>

                {/* Bot Feedback Rating */}
                {m.sender === "bot" && m.id !== "welcome" && (
                  <div className="flex items-center gap-2 mt-1.5 px-1 text-[10px] text-muted-foreground">
                    <span>Was this helpful?</span>
                    <button
                      onClick={() => handleFeedback(m.id, m.queryId, "helpful")}
                      className={`p-1 rounded hover:bg-muted transition-colors ${
                        m.feedback === "helpful" ? "text-emerald-400 font-bold" : ""
                      }`}
                      title="Helpful"
                    >
                      <ThumbsUp className="size-3" />
                    </button>
                    <button
                      onClick={() => handleFeedback(m.id, m.queryId, "unhelpful")}
                      className={`p-1 rounded hover:bg-muted transition-colors ${
                        m.feedback === "unhelpful" ? "text-rose-400 font-bold" : ""
                      }`}
                      title="Not helpful"
                    >
                      <ThumbsDown className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 text-muted-foreground text-[11px] px-2 py-1">
                <Sparkles className="size-3 text-primary animate-spin" />
                <span>easyCV Support is typing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 border-t border-border bg-card flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about easyCV..."
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-all hover:bg-primary/90 shrink-0"
            >
              <Send className="size-3.5" />
            </button>
          </form>

        </div>
      )}
    </div>
  );
}
