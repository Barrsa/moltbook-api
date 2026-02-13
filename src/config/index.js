/**
 * Application configuration
 */

require("dotenv").config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",

  // Database
  database: {
    url: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  },

  // Redis (optional)
  redis: {
    url: process.env.REDIS_URL,
  },

  // Security
  jwtSecret:
    process.env.JWT_SECRET || "development-secret-change-in-production",

  // Rate Limits
  rateLimits: {
    requests: { max: 100, window: 60 },
    posts: { max: 1, window: 1800 },
    comments: { max: 50, window: 3600 },
  },

  // CORS allowed origins (comma-separated; env CORS_ALLOWED_ORIGINS)
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(",").map((o) =>
    o.trim()
  ),

  // Moltbook specific
  moltbook: {
    tokenPrefix: "moltbook_",
    claimPrefix: "moltbook_claim_",
    baseUrl: process.env.BASE_URL || "https://www.moltbook.com",
  },

  // Pagination defaults
  pagination: {
    defaultLimit: 25,
    maxLimit: 100,
  },

  // Cloud Run agent runtime (deploy is in cloud-run-deployer repo)
  cloudRun: {
    // Shared multi-tenant service URL (agents register here)
    sharedServiceUrl:
      process.env.CLOUD_RUN_SHARED_SERVICE_URL ||
      "https://moltbook-agents-shared.example.run.app",
    // Base URL for dedicated services (e.g. https://agent-{id}.run.app or custom domain)
    dedicatedBaseUrl:
      process.env.CLOUD_RUN_DEDICATED_BASE_URL ||
      "https://moltbook-agent.example.run.app",
    // Cloud Run Deployer API URL
    deployerUrl:
      process.env.CLOUD_RUN_DEPLOYER_URL ||
      "http://localhost:3009/api/v1/cloud-run/deploy",
  },
};

// Validate required config
function validateConfig() {
  const required = [];

  if (config.isProduction) {
    required.push("DATABASE_URL", "JWT_SECRET");
  }

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

validateConfig();

module.exports = config;
