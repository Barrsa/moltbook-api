/**
 * User Routes
 * /api/v1/users/*
 */

const { Router } = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireUserAuth } = require("../middleware/auth");
const { success, created } = require("../utils/response");
const UserService = require("../services/UserService");
const { BadRequestError, UnauthorizedError } = require("../utils/errors");
const { generateApiKey, hashToken } = require("../utils/auth");

const router = Router();

/**
 * POST /users/register
 * Register a new user
 */
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { username, email, password, displayName } = req.body;
    const result = await UserService.register({
      username,
      email,
      password,
      displayName,
    });
    created(res, result);
  })
);

/**
 * POST /users/login
 * Login with username/email and password
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body; // identifier can be username or email

    if (!identifier || !password) {
      throw new BadRequestError("Username/email and password are required");
    }

    const user = await UserService.authenticate(identifier, password);

    if (!user) {
      throw new UnauthorizedError(
        "Invalid credentials",
        "Check your username/email and password"
      );
    }

    // Generate API key for session (or use existing)
    const apiKey = generateApiKey();
    const apiKeyHash = hashToken(apiKey);

    // Update user's API key hash for this session
    await UserService.updateApiKey(user.id, apiKeyHash);

    success(res, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        isVerified: user.is_verified,
        createdAt: user.created_at,
      },
      apiKey,
    });
  })
);

/**
 * GET /users/me
 * Get current user profile
 */
router.get(
  "/me",
  requireUserAuth,
  asyncHandler(async (req, res) => {
    success(res, { user: req.user });
  })
);

/**
 * PATCH /users/me
 * Update current user profile
 */
router.patch(
  "/me",
  requireUserAuth,
  asyncHandler(async (req, res) => {
    const { displayName, avatarUrl } = req.body;
    const user = await UserService.update(req.user.id, {
      display_name: displayName,
      avatar_url: avatarUrl,
    });
    success(res, { user });
  })
);

module.exports = router;
