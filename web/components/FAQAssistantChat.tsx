"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useOwnerSessionKey } from "../lib/useOwnerSessionKey";
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
import { formatPriceWithInterval, FREE_AUTO_IMPROVE_PASSES, PRO_MONTHLY, RESUME_UNLOCK } from "../lib/catalog";

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
    category: "get_started",
    keywords: ["start", "upload", "how to use", "begin", "create", "make", "help", "work"],
    question: "How do I create my resume with easyCV?",
    answer:
      "Sign in, then drag and drop your existing resume files into the upload box on the home page. You can also paste a target job description. Once processing finishes, easyCV organizes everything into a workspace where you can review, edit and download. Processing can take a while; the page updates on its own.",
  },
  {
    category: "edit_text",
    keywords: ["edit", "change", "modify", "name", "phone", "email", "type", "text", "update"],
    question: "How do I edit my name, phone number, or text?",
    answer:
      "In your preview workspace, open 'AI Profile Form Sorter'. You can edit your name, contact details, summary, roles, skills and education there, then save.",
  },
  {
    category: "add_role",
    keywords: ["add", "new", "job", "role", "experience", "position", "company"],
    question: "How do I add a new job or experience?",
    answer:
      "Open 'AI Profile Form Sorter' in your preview workspace and click 'Add Position' to add a job title, company and dates.",
  },
  {
    category: "delete_item",
    keywords: ["delete", "remove", "erase", "trash", "bullet", "job", "cut"],
    question: "How do I remove or delete a job or bullet point?",
    answer:
      "Open 'AI Profile Form Sorter' in your preview workspace and click the trash icon next to the role or skill you want to remove, then save.",
  },
  {
    category: "download",
    keywords: ["download", "pdf", "get", "file", "save", "export"],
    question: "How do I download my finished resume?",
    answer:
      "In your preview workspace, click 'Download PDF' in the top action bar. Downloads need a one-time unlock for that résumé or an active Pro subscription.",
  },
  {
    category: "pricing",
    keywords: ["cost", "price", "pro", "pay", "upgrade", "dollar", "buy", "subscription", "fee", "cancel", "refund"],
    question: "How much does easyCV cost?",
    answer:
      `There are two separate options. ${RESUME_UNLOCK.name}: ${formatPriceWithInterval(RESUME_UNLOCK)} for one résumé (${RESUME_UNLOCK.unlocks.join(", ").toLowerCase()}); no subscription. ${PRO_MONTHLY.name}: ${formatPriceWithInterval(PRO_MONTHLY)}, unlocks every résumé while active and renews monthly until you cancel. Cancel any time from the Pricing page ('Manage or cancel subscription').`,
    hasUpgradeCta: true,
  },
  {
    category: "auto_improve",
    keywords: ["improve", "auto-improve", "fix", "bullets", "missing", "gaps", "score", "enhance"],
    question: "How does the Auto-Improve button work?",
    answer:
      `Click 'Auto-Improve' in your workspace header. easyCV scans for missing contact details, sparse roles, and wordy phrasing, then suggests fixes you can accept. Free accounts get ${FREE_AUTO_IMPROVE_PASSES} passes. AI suggestions can be wrong, so review them before you use them.`,
  },
  {
    category: "multiple_files",
    keywords: ["multiple", "files", "merge", "combine", "old", "history", "past", "vault", "two", "several"],
    question: "Can I upload multiple previous resumes?",
    answer:
      "Yes! Drop all your past resumes, cover letters, and career notes together. easyCV automatically organizes your entire career history into a single polished master resume.",
  },
  {
    category: "job_match",
    keywords: ["job", "match", "tailor", "description", "target", "keywords", "requisition", "posting"],
    question: "How do I tailor my resume for a specific job?",
    answer:
      "Open the Job Match tab in your preview workspace and paste the job posting. easyCV uses AI to show matched and missing keywords and a match score. It's guidance only; it can't predict how an employer's screening system will rank you.",
  },
  {
    category: "font_size",
    keywords: ["font", "size", "fit", "page", "1 page", "one page", "length", "spacing", "small", "large"],
    question: "How do I change font size or fit everything on 1 page?",
    answer:
      "In your preview workspace toolbar, choose a smaller font size and trim older roles or bullets to keep your resume to one or two pages.",
  },
  {
    category: "color_theme",
    keywords: ["color", "theme", "blue", "emerald", "violet", "slate", "accent", "style"],
    question: "How do I change the accent color?",
    answer:
      "In the preview toolbar, click Blue, Emerald, Violet, or Slate to switch the accent colors on your section headers and badges.",
  },
  {
    category: "print",
    keywords: ["print", "paper", "printer", "hard copy"],
    question: "How do I print my resume?",
    answer:
      "Download your PDF and print it from your PDF viewer.",
  },
  {
    category: "free_preview",
    keywords: ["free", "trial", "test", "before pay", "charge", "preview"],
    question: "Is easyCV free to try before paying?",
    answer:
      `Yes. After signing in you can upload files, preview and edit your resume, and use job matching for free. Downloads need a one-time unlock (${formatPriceWithInterval(RESUME_UNLOCK)}) or ${PRO_MONTHLY.name} (${formatPriceWithInterval(PRO_MONTHLY)}).`,
  },
  {
    category: "file_types",
    keywords: ["type", "format", "extension", "docx", "word", "pdf", "txt", "md"],
    question: "What file types can I upload?",
    answer:
      "You can upload PDF (.pdf), Plain Text (.txt), and Markdown (.md) documents up to 10MB each.",
  },
  {
    category: "account",
    keywords: ["account", "sign in", "login", "email", "save", "sync", "device", "phone", "access"],
    question: "How do I access my saved resumes on another computer or phone?",
    answer:
      "Click 'Login with Seridian' in the top navigation. Your uploads are saved to your account, so you can sign in on any computer or phone to see them.",
  },
  {
    category: "privacy",
    keywords: ["private", "privacy", "secure", "security", "data", "safe", "delete"],
    question: "Is my personal career information private and secure?",
    answer:
      "We never sell your data. Your files and résumé are stored in your account until you ask us to delete them. To provide the service we share data with a few providers, such as OpenAI for AI job matching (without your email, phone or address) and Stripe for payments. Data is encrypted in transit (HTTPS). The Privacy Policy lists every provider and explains how to request a copy or deletion.",
  },
  {
    category: "start_over",
    keywords: ["new", "start over", "reset", "fresh", "clear", "another"],
    question: "How do I start over with a fresh resume?",
    answer:
      "Click 'New CV' in the top right navigation bar or click the easyCV logo at the top left to return to the home page and start a new resume.",
  },
];

export function FAQAssistantChat() {
  const ownerSessionKey = useOwnerSessionKey();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "bot",
      text: "Hello! I am your easyCV Assistant. Ask me simple questions like 'How to edit my text?', 'How to download?', 'How to fit on 1 page?', or click any button below.",
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
      text: "easyCV helps you build clean, professional resumes ready for job applications. You can upload past files, edit your details, auto-improve your bullet points, and download a PDF after unlocking it. Ask about pricing, downloads, or privacy.",
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
    let queryId: Id<"faqQueries"> | undefined;
    try {
      if (ownerSessionKey) {
        queryId = await recordQuery({
          sessionId: ownerSessionKey,
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
            ? { label: "See pricing", href: "/pricing" }
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
        if (!ownerSessionKey) return;
        await rateQuery({ sessionId: ownerSessionKey, queryId, feedback: rating });
      } catch {
        // Non-blocking
      }
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-5 sm:right-5">
      {/* Closed Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2 rounded-full bg-primary p-2.5 text-xs font-bold text-primary-foreground shadow-xl transition-all hover:scale-105 active:scale-95 hover:shadow-2xl border border-primary/40 sm:px-4 sm:py-2.5"
        >
          <div className="relative">
            <MessageSquare className="size-4" />
            <span className="absolute -top-1 -right-1 flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
            </span>
          </div>
          <span className="hidden sm:inline">Help & Support</span>
        </button>
      )}

      {/* Expanded Interactive Chat Modal */}
      {isOpen && (
        <div className="flex flex-col w-[calc(100vw-2rem)] h-[70vh] sm:w-[380px] sm:h-[520px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          
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
                <p className="text-[10px] text-muted-foreground">Dead-simple answers for every question</p>
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
              "How to edit text?",
              "How to download?",
              "Fit on 1 page",
              "How much does it cost?",
              "How to add a job?",
              "Change colors",
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
              placeholder="Ask any simple question..."
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
