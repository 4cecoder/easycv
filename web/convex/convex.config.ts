import { defineApp } from "convex/server";
import stripe from "@convex-dev/stripe/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();
app.use(stripe);
// Durable, cross-instance rate limits + LLM budget (see convex/rateLimits.ts).
app.use(rateLimiter);

export default app;
