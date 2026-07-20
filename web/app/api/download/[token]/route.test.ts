import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const queryMock = vi.fn();
const mutationMock = vi.fn();

vi.mock("../../../../lib/convexServer", () => ({
  getConvexClient: () => ({ query: queryMock, mutation: mutationMock }),
}));

const { GET } = await import("./route");

function ctx(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe("GET /api/download/[token] -- server-side payment gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("404s for a token getByDownloadToken doesn't recognize at all", async () => {
    queryMock.mockResolvedValueOnce(null); // getByDownloadToken
    const res = await GET(new NextRequest("http://localhost/api/download/unknown"), ctx("unknown"));
    expect(res.status).toBe(404);
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("404s for an unpaid token (getByDownloadToken already encodes that -- returns null)", async () => {
    // convex/payments.ts's getByDownloadToken returns null itself whenever
    // payment.status !== "paid", so from this route's point of view an
    // "unpaid" token and an "unknown" token look identical: null.
    queryMock.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/download/unpaid-token"), ctx("unpaid-token"));
    expect(res.status).toBe(404);
    expect(mutationMock).not.toHaveBeenCalled();
  });

  test("404s when a paid token's upload has no compiled PDF yet", async () => {
    // getByDownloadToken now resolves the pdfUrl itself (see convex/payments.ts)
    // -- no separate getProfilePdfUrl call from this route.
    queryMock.mockResolvedValueOnce({
      payment: { status: "paid" },
      upload: { _id: "up1" },
      pdfUrl: null,
    }); // getByDownloadToken
    const res = await GET(new NextRequest("http://localhost/api/download/paid-no-pdf"), ctx("paid-no-pdf"));
    expect(res.status).toBe(404);
    expect(mutationMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  test("streams PDF bytes and increments the download count for a genuinely paid token", async () => {
    queryMock.mockResolvedValueOnce({
      payment: { status: "paid" },
      upload: { _id: "up1" },
      pdfUrl: "https://fake-storage.example/resume.pdf",
    });

    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Blob([fakePdfBytes]), { status: 200 }));

    const res = await GET(new NextRequest("http://localhost/api/download/paid-token"), ctx("paid-token"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(mutationMock).toHaveBeenCalledWith(expect.anything(), { downloadToken: "paid-token" });

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(fakePdfBytes));

    fetchSpy.mockRestore();
  });
});
