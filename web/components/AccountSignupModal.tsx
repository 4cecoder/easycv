"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { getBrowserSessionId } from "../lib/fingerprint";
import {
  Mail,
  CheckCircle2,
  X,
  Loader2,
  Shield,
  ArrowRight,
  User,
  KeyRound,
} from "lucide-react";
import { Button, Card, CardContent } from "@bytecats/ui-kit";

interface AccountSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountSignupModal({ isOpen, onClose }: AccountSignupModalProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCodePreview, setDevCodePreview] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    setSessionId(getBrowserSessionId());
  }, []);

  const verifyCodeMutation = useMutation(api.auth.verifyCode);

  if (!isOpen) return null;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sessionId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification code.");
      }

      if (data.devCode) {
        setDevCodePreview(data.devCode);
      }

      setStep("code");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.trim().length < 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await verifyCodeMutation({
        email,
        code: code.trim(),
        sessionId,
      });

      if (!result.success) {
        throw new Error(result.error || "Invalid verification code.");
      }

      setStep("success");
      setTimeout(() => {
        onClose();
        setStep("email");
        setCode("");
        setEmail("");
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to verify code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <User className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Save & Sync Resume Vault</h3>
              <p className="text-[11px] text-muted-foreground">Access your career documents on any device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* STEP 1: Enter Email */}
        {step === "email" && (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Your Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full h-10 text-xs font-bold bg-primary text-primary-foreground shadow-xs flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Sending Sign-in Code...</span>
                </>
              ) : (
                <>
                  <span>Continue with Email</span>
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </Button>
          </form>
        )}

        {/* STEP 2: Enter 6-Digit Code */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">6-Digit Verification Code</span>
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="text-primary hover:underline text-[11px]"
                >
                  Change email
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                We sent a login code to <strong className="text-foreground">{email}</strong>.
              </p>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
              {devCodePreview && (
                <p className="text-[10px] text-muted-foreground text-center font-mono">
                  Dev code: <span className="font-bold text-primary">{devCodePreview}</span>
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full h-10 text-xs font-bold bg-primary text-primary-foreground shadow-xs flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  <span>Verify & Access Vault</span>
                </>
              )}
            </Button>
          </form>
        )}

        {/* STEP 3: Success */}
        {step === "success" && (
          <div className="py-6 text-center space-y-2">
            <div className="size-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="size-6" />
            </div>
            <h4 className="text-sm font-bold text-foreground">Vault Connected!</h4>
            <p className="text-xs text-muted-foreground">Your account is now synced across your devices.</p>
          </div>
        )}

        <div className="pt-2 border-t border-border flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Shield className="size-3 text-emerald-400" />
          <span>Encrypted zero-password email login</span>
        </div>

      </div>
    </div>
  );
}
