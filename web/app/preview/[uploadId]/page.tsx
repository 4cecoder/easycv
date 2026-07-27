import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../../../lib/session";
import { PreviewClient } from "./PreviewClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ uploadId: string }>;
};

// Thin server wrapper: its only job is reading the httpOnly session cookie
// (deliberately not readable by client-side JS, see lib/session.ts) and
// handing it down as a prop. All data fetching/rendering lives in
// PreviewClient, a client component, since it needs useQuery's live
// reactivity to show the upload's status updating in real time as the
// worker processes it -- a server component can only fetch once per
// request, which is the wrong shape for "keep this in sync while the user
// watches."
export default async function PreviewPage({ params }: PageProps) {
  const { uploadId } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  return <PreviewClient uploadId={uploadId} sessionId={sessionId} />;
}
