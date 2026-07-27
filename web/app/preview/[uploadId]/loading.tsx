import { Card, CardContent, CardHeader, Skeleton } from "@bytecats/ui-kit";

// Next.js route-segment loading UI (not a new route) -- shown automatically
// during page.tsx's (now trivial, cookie-read-only) render and the initial
// client-side hydration of PreviewClient, which handles the actual
// queued/processing/ready/error states reactively via useQuery once
// mounted. Mirrors PreviewClient's ready-state Card layout so the swap-in
// doesn't jump around.
export default function PreviewLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-5 w-40" />

      <Card>
        <CardHeader className="gap-2 border-b pb-6">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3.5 w-16" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-14" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
