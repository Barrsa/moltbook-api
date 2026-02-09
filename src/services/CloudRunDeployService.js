/**
 * Cloud Run Deploy Service
 * Loads a base YAML template, applies overrides, validates, and deploys to Google Cloud Run.
 */

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const { ServicesClient } = require("@google-cloud/run");
const config = require("../config");
const {
  BadRequestError,
  ValidationError,
  InternalError,
  ApiError,
} = require("../utils/errors");

const TEMPLATE_PATH = path.join(
  __dirname,
  "../../templates/cloud-run-service.yaml"
);

const VALID_CPUS = ["1", "2", "4", "8"];
const MEMORY_PATTERN = /^\d+(Mi|Gi)$/;

/**
 * Parse a duration string (e.g. "300s", "60") into protobuf Duration { seconds, nanos }.
 * Cloud Run gRPC client expects Duration as object, not string.
 */
function parseTimeoutToDuration(value) {
  if (value == null) return undefined;
  if (typeof value === "object" && "seconds" in value) return value;
  const str = String(value).trim().replace(/(\d+)$/, "$1s");
  const match = str.match(/^(\d+)(?:\.(\d+))?s$/);
  const seconds = match ? parseInt(match[1], 10) : parseInt(str, 10) || 300;
  const nanos = match?.[2] ? parseInt(match[2].padEnd(9, "0").slice(0, 9), 10) : 0;
  return { seconds: Math.max(0, seconds), nanos };
}

/**
 * Convert service spec to the shape expected by Cloud Run gRPC client (e.g. timeout as Duration object).
 */
function toApiShape(serviceSpec) {
  const spec = structuredClone(serviceSpec);
  const template = spec.template;
  if (template?.timeout != null) {
    template.timeout = parseTimeoutToDuration(template.timeout);
  }
  return spec;
}

/**
 * Load and parse the base Cloud Run YAML template.
 * @returns {Object} Parsed service spec (template body for Cloud Run API)
 */
function loadBaseTemplate() {
  let raw;
  try {
    raw = fs.readFileSync(TEMPLATE_PATH, "utf8");
  } catch (err) {
    throw new InternalError(
      `Failed to load Cloud Run template: ${err.message}`
    );
  }
  try {
    return yaml.load(raw);
  } catch (err) {
    throw new InternalError(
      `Invalid Cloud Run template YAML: ${err.message}`
    );
  }
}

/**
 * Apply configurable overrides onto the base template.
 * @param {Object} base - Parsed base YAML
 * @param {Object} overrides - { serviceName, containerImage, region, env, resources, minInstances, maxInstances, timeout }
 * @returns {Object} Merged service spec
 */
function applyOverrides(base, overrides) {
  const merged = structuredClone(base);

  if (!merged.template) merged.template = {};
  if (!merged.template.containers?.length) {
    merged.template.containers = [{ image: "", env: [], resources: { limits: {} } }];
  }
  const container = merged.template.containers[0];

  const image =
    overrides.containerImage ||
    (overrides.containerImage === "" ? "" : null) ||
    (container.image && container.image !== "{{CONTAINER_IMAGE}}"
      ? container.image
      : null);
  if (image !== null) {
    container.image = image;
  } else if (String(container.image) === "{{CONTAINER_IMAGE}}") {
    container.image = "gcr.io/cloudrun/container:hello"; // fallback only if template had placeholder
  }

  if (Array.isArray(overrides.env) && overrides.env.length > 0) {
    container.env = overrides.env.map((e) =>
      typeof e === "string"
        ? { name: e.split("=")[0], value: e.split("=").slice(1).join("=") || "" }
        : { name: e.name, value: String(e.value ?? "") }
    );
  }

  if (overrides.resources) {
    container.resources = container.resources || { limits: {} };
    container.resources.limits = container.resources.limits || {};
    if (overrides.resources.cpu != null)
      container.resources.limits.cpu = String(overrides.resources.cpu);
    if (overrides.resources.memory != null)
      container.resources.limits.memory = String(overrides.resources.memory);
    if (overrides.resources.cpuIdle !== undefined)
      container.resources.cpuIdle = Boolean(overrides.resources.cpuIdle);
  }

  if (overrides.minInstances !== undefined || overrides.maxInstances !== undefined) {
    merged.template.scaling = merged.template.scaling || {};
    if (overrides.minInstances !== undefined)
      merged.template.scaling.minInstanceCount = Number(overrides.minInstances);
    if (overrides.maxInstances !== undefined)
      merged.template.scaling.maxInstanceCount = Number(overrides.maxInstances);
  }

  if (overrides.timeout != null) {
    merged.template.timeout =
      String(overrides.timeout).replace(/(\d+)$/, "$1s") || "300s";
  }

  if (overrides.description != null) {
    merged.description = String(overrides.description);
  }

  return merged;
}

/**
 * Validate the merged Cloud Run service spec.
 * @param {Object} serviceSpec - Merged service body
 * @param {string} serviceId - Service ID (name)
 * @param {string} projectId - GCP project ID
 * @param {string} region - GCP region
 */
function validateConfig(serviceSpec, serviceId, projectId, region) {
  const errors = [];

  if (!serviceId || typeof serviceId !== "string") {
    errors.push({ field: "serviceName", message: "Service name is required" });
  } else if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(serviceId)) {
    errors.push({
      field: "serviceName",
      message:
        "Service name must be DNS label (lowercase, numbers, hyphens, max 63 chars)",
    });
  }

  if (!projectId || !projectId.trim()) {
    errors.push({ field: "projectId", message: "GCP project ID is required" });
  }

  if (!region || !region.trim()) {
    errors.push({ field: "region", message: "Region is required" });
  }

  const container =
    serviceSpec.template &&
    serviceSpec.template.containers &&
    serviceSpec.template.containers[0];
  if (!container) {
    errors.push({ field: "template", message: "At least one container is required" });
  } else {
    if (!container.image || !container.image.trim()) {
      errors.push({ field: "containerImage", message: "Container image is required" });
    }
    const limits = container.resources && container.resources.limits;
    if (limits) {
      if (limits.cpu && !VALID_CPUS.includes(String(limits.cpu))) {
        errors.push({
          field: "resources.cpu",
          message: `CPU must be one of: ${VALID_CPUS.join(", ")}`,
        });
      }
      if (
        limits.memory &&
        !MEMORY_PATTERN.test(String(limits.memory))
      ) {
        errors.push({
          field: "resources.memory",
          message: "Memory must be e.g. 256Mi, 512Mi, 1Gi, 2Gi",
        });
      }
    }
  }

  const scaling = serviceSpec.template && serviceSpec.template.scaling;
  if (scaling) {
    const min = scaling.minInstanceCount;
    const max = scaling.maxInstanceCount;
    if (min != null && (min < 0 || !Number.isInteger(min))) {
      errors.push({
        field: "minInstances",
        message: "minInstanceCount must be a non-negative integer",
      });
    }
    if (max != null && (max < 0 || !Number.isInteger(max))) {
      errors.push({
        field: "maxInstances",
        message: "maxInstanceCount must be a non-negative integer",
      });
    }
    if (
      min != null &&
      max != null &&
      Number.isInteger(min) &&
      Number.isInteger(max) &&
      min > max
    ) {
      errors.push({
        field: "scaling",
        message: "minInstanceCount cannot exceed maxInstanceCount",
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

/**
 * Deploy the service to Google Cloud Run (create or replace).
 * @param {Object} options - { serviceName, containerImage, region, env, resources, minInstances, maxInstances, timeout, description }
 * @returns {Promise<{ status: string, serviceUrl: string, reconciling?: boolean }>}
 */
async function deploy(options = {}) {
  const projectId =
    options.projectId ?? config.cloudRun?.projectId ?? process.env.GCP_PROJECT_ID;
  const region =
    options.region ?? config.cloudRun?.region ?? process.env.GCP_REGION ?? "europe-west1";
  const serviceId = options.serviceName || options.serviceId;

  if (!projectId || !projectId.trim()) {
    throw new BadRequestError(
      "GCP project ID is required. Set GCP_PROJECT_ID or pass projectId in the request body."
    );
  }

  let base = loadBaseTemplate();
  const serviceSpec = applyOverrides(base, {
    ...options,
    region,
    projectId,
  });

  validateConfig(serviceSpec, serviceId, projectId, region);

  const parent = `projects/${projectId}/locations/${region}`;
  const runClient = new ServicesClient();
  const apiSpec = toApiShape(serviceSpec);

  let service;
  try {
    const [operation] = await runClient.createService({
      parent,
      serviceId,
      service: apiSpec,
      validateOnly: false,
    });
    const [response] = await operation.promise();
    service = response;
  } catch (err) {
    if (err.code === 6 || (err.message && err.message.includes("already exists"))) {
      // ALREADY_EXISTS: update (patch) existing service
      const fullServiceName = `${parent}/services/${serviceId}`;
      const serviceForUpdate = { ...apiSpec, name: fullServiceName };
      const [operation] = await runClient.updateService({
        service: serviceForUpdate,
        validateOnly: false,
      });
      const [response] = await operation.promise();
      service = response;
    } else if (
      err.message?.includes("Could not load the default credentials") ||
      err.message?.includes("credentials") ||
      err.message?.includes("authentication")
    ) {
      throw new ApiError(
        "Google Cloud credentials are not configured. Set up Application Default Credentials to deploy to Cloud Run.",
        503,
        "GCP_CREDENTIALS_MISSING",
        "Run 'gcloud auth application-default login' or set GOOGLE_APPLICATION_CREDENTIALS to a service account key file. See https://cloud.google.com/docs/authentication/getting-started"
      );
    } else {
      throw new InternalError(
        `Cloud Run deployment failed: ${err.message}`
      );
    }
  }

  const serviceUrl = service.uri ?? service.url ?? "";
  const reconciling = Boolean(service.reconciling);

  return {
    status: reconciling ? "RECONCILING" : "READY",
    serviceUrl,
    reconciling,
    serviceName: serviceId,
    region,
    latestReadyRevision: service.latestReadyRevision ?? null,
  };
}

module.exports = {
  loadBaseTemplate,
  applyOverrides,
  validateConfig,
  deploy,
};
