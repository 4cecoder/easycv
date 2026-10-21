"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useOwnerSessionKey } from "../lib/useOwnerSessionKey";
import {
  FileText,
  Clock,
  ChevronRight,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@bytecats/ui-kit";

/** Human label for an upload that has no extracted job title yet. */
function statusLabel(status: string): string {
  switch (status) {
    case "uploading":
    case "queued":
      return "Queued — processing will start soon";
    case "processing":
      return "Processing…";
    case "error":
      return "Processing failed";
    default:
      return "Résumé";
  }
}

export function RecentUploadsList() {
  const sessionId = useOwnerSessionKey();

  const uploads = useQuery(
    api.uploads.listSessionUploads,
    sessionId ? { sessionId } : "skip"
  );

  if (!uploads || uploads.length === 0) {
    return null;
  }

  return (
    <div className="w-full flex flex-col gap-3 my-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Recent Career Documents
          </h3>
          <Badge variant="outline" className="text-[10px] font-mono">
            {uploads.length} Saved to your account
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">
          Your account vault
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {uploads.map((item) => {
          const dateStr = new Date(item.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <Link
              key={item._id}
              href={`/preview/${item._id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/90 p-4 transition-all hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs group active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <FileText className="size-5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate max-w-[200px]">
                      {item.name}
                    </span>
                    {item.isPaid ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                        <CheckCircle2 className="size-2.5" /> Unlocked
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border">
                        <Lock className="size-2.5" /> Preview
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="truncate">{item.role ?? statusLabel(item.status)}</span>
                    <span>&bull;</span>
                    <span className="font-mono text-[11px] shrink-0">{dateStr}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {item.qualityScore !== null && item.qualityMaxScore !== null && (
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-xs font-bold text-foreground font-mono">
                      {item.qualityScore}/{item.qualityMaxScore}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Quality score</span>
                  </div>
                )}
                <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
