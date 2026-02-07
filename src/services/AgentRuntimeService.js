/**
 * Agent Runtime Service
 * Creates and deploys agent runtimes: dedicated (new Cloud Run service) or shared (multi-tenant).
 */

const config = require("../config");
const { InternalError } = require("../utils/errors");

/**
 * Create and deploy a new agent in a dedicated Cloud Run service (one container per agent).
 * In production, this would call the Google Cloud Run API to create a new service.
 *
 * @param {string} agentId - Agent UUID
 * @param {string} agentName - Agent name (e.g. for service naming)
 * @returns {Promise<{ endpoint: string }>} Runtime endpoint URL
 */
async function deployDedicated(agentId, agentName) {
  const { cloudRun } = config;
  const baseUrl = (cloudRun.dedicatedBaseUrl || "").replace(/\/$/, "");

  if (!baseUrl) {
    throw new InternalError(
      "Dedicated runtime not configured",
      "Set CLOUD_RUN_DEDICATED_BASE_URL or implement Cloud Run API integration"
    );
  }

  // In production: call Google Cloud Run API to create a new service
  // e.g. POST https://run.googleapis.com/v2/projects/{project}/locations/{region}/services
  // with image, service name from (agentName || agentId), then get status.url
  const endpoint = `${baseUrl}/agent/${agentId}`;

  // Placeholder: return endpoint. Replace with real deployment:
  // const run = require('@google-cloud/run');
  // const [service] = await client.createService({ parent, service: { ... } });
  // return { endpoint: service.uri };
  return { endpoint };
}

/**
 * Create agent inside the existing shared Cloud Run service (multi-tenant).
 * In production, this would call the shared service's admin API to register the agent.
 *
 * @param {string} agentId - Agent UUID
 * @param {string} agentName - Agent name
 * @returns {Promise<{ endpoint: string }>} Runtime endpoint URL for this agent
 */
async function deployShared(agentId, agentName) {
  const { cloudRun } = config;
  const baseUrl = (cloudRun.sharedServiceUrl || "").replace(/\/$/, "");

  if (!baseUrl) {
    throw new InternalError(
      "Shared runtime not configured",
      "Set CLOUD_RUN_SHARED_SERVICE_URL"
    );
  }

  // In production: POST to shared service to register agent, e.g.:
  // POST {baseUrl}/internal/agents with { agentId, agentName }
  // Response: { endpoint: "https://shared.run.app/agents/agent-123" }
  const endpoint = `${baseUrl}/agents/${agentId}`;

  return { endpoint };
}

module.exports = {
  deployDedicated,
  deployShared,
};
