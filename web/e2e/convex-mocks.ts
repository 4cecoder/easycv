import type { Page } from "@playwright/test";

// Well-formed but unsigned JWT-shaped fixture. Its signature is deliberately
// invalid, so only the mocked browser auth boundary accepts it.
export const MOCK_E2E_TOKEN = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJlMmUtdGVzdC1zdWJqZWN0IiwiZXhwIjoyMDAwMDAwMDAwLCJhdWQiOiJlYXN5Y3YifQ.";

/** Stable identity used only by the browser fixture; never accepted by production. */
export const MOCK_E2E_SUBJECT = "e2e-test-subject";

/** Stub /api/auth/token so E2E pages run as a signed-in test user. */
export async function mockTestAuth(page: Page) {
  await page.route("**/api/auth/token", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ token: MOCK_E2E_TOKEN }),
    })
  );
}

/** Stub Convex HTTP API responses for E2E specs with optional upload/payment/job-match fixtures. */
export async function mockConvexApi(
  page: Page,
  values: { upload?: unknown; payment?: unknown; jobMatch?: unknown; files?: unknown } = {}
) {
  await mockTestAuth(page);

  // ConvexReactClient uses a WebSocket subscription protocol, not the HTTP
  // /api/query endpoint. Keep these browser tests fully local and deterministic
  // by answering subscriptions at that transport boundary.
  await page.routeWebSocket((url) => url.pathname.includes("/api/") && url.pathname.endsWith("/sync"), (socket) => {
    let querySetVersion = 0;
    let identityVersion = 0;
    let pendingAuthBase: number | undefined;
    let timestamp = 0n;
    const encodeTimestamp = (value: bigint) => {
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64LE(value);
      return bytes.toString("base64");
    };
    const sendTransition = (
      startQuerySet: number,
      endQuerySet: number,
      modifications: unknown[],
      startIdentity = identityVersion,
      endIdentity = identityVersion,
    ) => {
      const startTs = timestamp;
      timestamp += 100n;
      socket.send(JSON.stringify({
        type: "Transition",
        startVersion: { querySet: startQuerySet, ts: encodeTimestamp(startTs), identity: startIdentity },
        endVersion: { querySet: endQuerySet, ts: encodeTimestamp(timestamp), identity: endIdentity },
        modifications,
      }));
      querySetVersion = endQuerySet;
      identityVersion = endIdentity;
    };
    socket.onMessage((raw) => {
      if (typeof raw !== "string") return;
      let message: {
        type?: string;
        baseVersion?: number;
        newVersion?: number;
        modifications?: Array<{
          type?: string;
          queryId?: number;
          udfPath?: string;
        }>;
      };
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (message.type === "Authenticate") {
        pendingAuthBase = message.baseVersion ?? identityVersion;
        return;
      }
      if (message.type !== "ModifyQuerySet") return;

      const modifications = (message.modifications ?? []).flatMap((modification) => {
        if (modification.type !== "Add" || typeof modification.queryId !== "number") return [];
        const path = modification.udfPath ?? "";
        let value: unknown = null;
        if (path.endsWith("uploads:getUpload")) value = values.upload ?? null;
        else if (path.endsWith("payments:getPaymentStatus")) value = values.payment ?? null;
        else if (path.endsWith("profiles:getJobMatch")) value = values.jobMatch ?? null;
        else if (path.endsWith("resumeFiles:listResumeFiles")) {
          const uploadFiles = (values.upload as { files?: unknown[] } | undefined)?.files;
          value = values.files ?? uploadFiles ?? [];
        }
        else if (path.endsWith("identity:getOwnerSessionKey")) value = MOCK_E2E_SUBJECT;
        return [{
          type: "QueryUpdated",
          queryId: modification.queryId,
          value,
          logLines: [],
          journal: null,
        }];
      });

      const startQuerySet = message.baseVersion ?? querySetVersion;
      const requestedEndQuerySet = message.newVersion ?? querySetVersion;
      if (pendingAuthBase !== undefined) {
        const startIdentity = pendingAuthBase;
        pendingAuthBase = undefined;
        sendTransition(startQuerySet, requestedEndQuerySet, modifications, startIdentity, startIdentity + 1);
      } else {
        sendTransition(startQuerySet, requestedEndQuerySet, modifications);
      }
    });
  });

  await page.route("**/api/query**", async (route) => {
    const body = route.request().postData();
    let path = "";
    try {
      const parsed = JSON.parse(body ?? "{}");
      path = parsed.path ?? parsed[0]?.path ?? "";
    } catch {
      // Unrecognized Convex requests receive a deterministic empty result.
    }
    let value: unknown = null;
    if (path.includes("uploads:getUpload")) value = values.upload ?? null;
    else if (path.includes("payments:getPaymentStatus")) value = values.payment ?? null;
    else if (path.includes("profiles:getJobMatch")) value = values.jobMatch ?? null;
    else if (path.includes("resumeFiles:listResumeFiles")) {
      const uploadFiles = (values.upload as { files?: unknown[] } | undefined)?.files;
      value = values.files ?? uploadFiles ?? [];
    }
    else if (path.includes("identity:getOwnerSessionKey")) value = "e2e-test-subject";

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ value }),
    });
  });

  for (const operation of ["mutation", "action"]) {
    await page.route(`**/api/${operation}**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ value: null }),
      })
    );
  }
}
