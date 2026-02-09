/**
 * Cloud Run deployment routes
 * POST /api/v1/cloud-run/deploy - Create/replace a Cloud Run service from base YAML + overrides
 */

const { Router } = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const { created } = require("../utils/response");
const CloudRunDeployService = require("../services/CloudRunDeployService");

const router = Router();

/**
 * POST /cloud-run/deploy
 * Create a new Cloud Run service (or update if exists) using the base YAML template.
 *
 * Body:
 *   - serviceName (string, required): DNS-safe service name
 *   - containerImage (string, required): Container image URL (e.g. gcr.io/project/image:tag)
 *   - region (string, optional): GCP region (default from GCP_REGION / config)
 *   - projectId (string, optional): GCP project (default from GCP_PROJECT_ID / config)
 *   - env (array, optional): Env vars as [{ name, value }] or ["KEY=value"]
 *   - resources (object, optional): { cpu: "1"|"2"|"4"|"8", memory: "256Mi"|"512Mi"|"1Gi"|"2Gi", cpuIdle?: boolean }
 *   - minInstances (number, optional): Min instances (default 0)
 *   - maxInstances (number, optional): Max instances (default 10)
 *   - timeout (string, optional): Request timeout e.g. "300s"
 *   - description (string, optional): Service description
 *
 * Returns: { success, status, serviceUrl, reconciling?, serviceName, region, latestReadyRevision? }
 */
router.post(
  "/deploy",
  asyncHandler(async (req, res) => {
    const result = await CloudRunDeployService.deploy(req.body);
    created(res, {
      status: result.status,
      serviceUrl: result.serviceUrl,
      reconciling: result.reconciling,
      serviceName: result.serviceName,
      region: result.region,
      latestReadyRevision: result.latestReadyRevision,
    });
  })
);

module.exports = router;
