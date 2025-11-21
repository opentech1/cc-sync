// Rate limiting configuration using Convex rate-limiter component

import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Global sync operations
  syncOperation: {
    kind: "token bucket",
    rate: 10, // 10 syncs per minute
    period: MINUTE,
    capacity: 3, // Allow burst of 3
  },

  // Per-user API key validation (prevent brute force)
  apiKeyValidation: {
    kind: "token bucket",
    rate: 100,
    period: HOUR,
  },

  // File upload rate limit
  fileUpload: {
    kind: "token bucket",
    rate: 50, // 50 files per minute
    period: MINUTE,
    capacity: 10,
  },
});
