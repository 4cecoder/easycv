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
  User,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Lock,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Zap,
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
    category: "ats",
    keywords: ["ats", "applicant tracking", "scanner", "parse", "filter", "score"],
    question: "How does easyCV ensure 100% ATS compatibility?",
    answer:
      "easyCV compiles your resume using standard single-column semantic structures with certified machine-readable typographics. Our autonomous engine scores your density against enterprise ATS parsers (Workday, Greenhouse, Lever, Taleo) and flags any missing keywords before submission.",
  },
  {
    category: "pricing",
    keywords: ["cost", "price", "pro", "pay", "upgrade", "14", "dollar", "buy", "subscription"],
    question: "What comes with easyCV Pro ($14)?",
    answer:
      "easyCV Pro is a $14 one-time upgrade (never a recurring subscription). It unlocks unlimited AI Auto-Improvements, unwatermarked Vector PDF compilation, modular LaTeX source code (.tex for Overleaf), and standalone HTML exports.",
    hasUpgradeCta: true,
  },
  {
    category: "latex",
    keywords: ["latex", "tex", "overleaf", "source", "code", "compile"],
    question: "Can I download and edit the raw LaTeX (.tex) code?",
    answer:
      "Yes! easyCV Pro gives you full access to the underlying modular LaTeX source. You can download the `.tex` file with 1 click and import it into Overleaf, TeXShop, or compile locally with pdflatex/xelatex.",
  },
  {
    category: "consolidation",
    keywords: ["multiple", "files", "merge", "consolidate", "old", "vault", "history"],
    question: "How does multi-resume consolidation work?",
    answer:
      "You can drop 2, 5, or 10 past resumes, LinkedIn PDFs, and performance reviews together. The neural engine deduplicates overlapping titles, resolves chronology, and synthesizes your single best master executive CV.",
  },
  {
    category: "ste100",
    keywords: ["ste", "ste100", "ste-100", "grammar", "rule", "gerund", "words", "sentence"],
    question: "What is ASD-STE100 Technical Grammar Linting?",
    answer:
      "ASD-STE100 (Simplified Technical English) is the aerospace standard for mission-critical documentation. easyCV enforces Rule 5.1 (max 25 words per sentence) and Rule 3.5 (strong active verbs, restricting vague gerunds like 'managing' or 'helping') so recruiters read punchy, high-impact accomplishments.",
  },
  {
    category: "pdf",
    keywords: ["pdf", "vector", "download", "watermark", "print"],
    question: "What is the difference between regular and Vector PDF?",
    answer:
      "Standard web PDFs often rasterize text or break font embedding when uploaded to job portals. easyCV compiles true Vector PDFs with selectable embedded vector glyphs, guaranteeing crisp typography on any screen or high-resolution printer.",
  },
];

export function FAQAssistantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Hello! I am your easyCV AI Concierge. Ask me anything about ATS optimization, LaTeX exports, ASD-STE100 grammar scoring, or Pro features.",
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
    
    // Match against knowledge base
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

    // Default intelligent fallback
    return {
      text: "easyCV uses an on-device neural parser and modular LaTeX engine to build recruiter-grade resumes. You can upload past files, auto-improve gaps with ASD-STE100 compliance, and unlock full Vector PDF exports with Pro ($14).",
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
    }, 450);
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
          className="group flex items-center gap-2.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-xl transition-all hover:scale-105 active:scale-95 hover:shadow-2xl border border-primary/40"
        >
          <div className="relative">
            <MessageSquare className="size-4" />
            <span className="absolute -top-1 -right-1 flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
            </span>
          </div>
          <span>AI Concierge & FAQ</span>
        </button>
      )}

      {/* Expanded Interactive Chat Modal */}
      {isOpen && (
        <div className="flex flex-col w-[360px] sm:w-[400px] h-[520px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/40 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                <Bot className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-foreground">easyCV Concierge</h3>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono">
                    AI Online
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">Instant answers on ATS, LaTeX & Pro</p>
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
              "ATS Compatibility",
              "What is Pro ($14)?",
              "Overleaf LaTeX Export",
              "STE-100 Grammar Rules",
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

                {/* Bot Feedback Rating & Action Buttons */}
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
                <span>easyCV Concierge is thinking...</span>
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
              placeholder="Ask about ATS, LaTeX, exports..."
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
