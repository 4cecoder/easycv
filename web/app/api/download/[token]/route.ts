import { NextRequest, NextResponse } from "next/server";

import { api } from "../../../../convex/_generated/api";
import { getConvexClient } from "../../../../lib/convexServer";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const convex = getConvexClient();

  // The gate is entirely server-side via getByDownloadToken -- it returns
  // null for anything that isn't backed by a payment whose status is
  // "paid" (convex/payments.ts). Never trust a client-supplied "paid" flag
  // instead of this lookup. getByDownloadToken also resolves the signed PDF
  // URL itself (rather than this route making a second, separately
  // -authorized call to profiles.getProfilePdfUrl): there is no sessionId
  // available here to check ownership with -- the downloadToken itself is
  // the authorization for this whole flow (see convex/payments.ts).
  const gated = await convex.query(api.payments.getByDownloadToken, { downloadToken: token });
  if (!gated || !gated.upload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdfUrl = gated.pdfUrl;
  if (!pdfUrl) {
    return NextResponse.json({ error: "PDF not available yet" }, { status: 404 });
  }

  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok || !pdfRes.body) {
    return NextResponse.json({ error: "Failed to fetch PDF" }, { status: 502 });
  }

  await convex.mutation(api.payments.incrementDownloadCount, { downloadToken: token });

  return new NextResponse(pdfRes.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="resume.pdf"',
    },
  });
}
