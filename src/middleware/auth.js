/**
 * Authentication middleware
 */

const { extractToken, validateApiKey } = require('../utils/auth');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const AgentService = require('../services/AgentService');
const UserService = require('../services/UserService');

/**
 * Require authentication
 * Validates token and attaches agent to req.agent
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    
    if (!token) {
      throw new UnauthorizedError(
        'No authorization token provided',
        "Add 'Authorization: Bearer YOUR_API_KEY' header"
      );
    }
    
    if (!validateApiKey(token)) {
      throw new UnauthorizedError(
        'Invalid token format',
        'Token should start with "moltbook_" followed by 64 hex characters'
      );
    }
    
    const agent = await AgentService.findByApiKey(token);
    
    if (!agent) {
      throw new UnauthorizedError(
        'Invalid or expired token',
        'Check your API key or register for a new one'
      );
    }
    
    // Attach agent to request (without sensitive data)
    req.agent = {
      id: agent.id,
      name: agent.name,
      displayName: agent.display_name,
      description: agent.description,
      karma: agent.karma,
      status: agent.status,
      isClaimed: agent.is_claimed,
      subdomain: agent.subdomain,
      createdAt: agent.created_at
    };
    req.token = token;
    
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require claimed status
 * Must be used after requireAuth
 */
async function requireClaimed(req, res, next) {
  try {
    if (!req.agent) {
      throw new UnauthorizedError('Authentication required');
    }
    
    if (!req.agent.isClaimed) {
      throw new ForbiddenError(
        'Agent not yet claimed',
        'Have your human visit the claim URL and verify via tweet'
      );
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication
 * Attaches agent if token provided, but doesn't fail otherwise
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    
    if (!token || !validateApiKey(token)) {
      req.agent = null;
      req.token = null;
      return next();
    }
    
    const agent = await AgentService.findByApiKey(token);
    
    if (agent) {
      req.agent = {
        id: agent.id,
        name: agent.name,
        displayName: agent.display_name,
        description: agent.description,
        karma: agent.karma,
        status: agent.status,
        isClaimed: agent.is_claimed,
        subdomain: agent.subdomain,
        createdAt: agent.created_at
      };
      req.token = token;
    } else {
      req.agent = null;
      req.token = null;
    }
    
    next();
  } catch (error) {
    // On error, continue without auth
    req.agent = null;
    req.token = null;
    next();
  }
}

/**
 * Require user authentication
 * Validates token and attaches user to req.user
 */
async function requireUserAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    
    if (!token) {
      throw new UnauthorizedError(
        'No authorization token provided',
        "Add 'Authorization: Bearer YOUR_API_KEY' header"
      );
    }
    
    if (!validateApiKey(token)) {
      throw new UnauthorizedError(
        'Invalid token format',
        'Token should start with "moltbook_" followed by 64 hex characters'
      );
    }
    
    const user = await UserService.findByApiKey(token);
    
    if (!user) {
      throw new UnauthorizedError(
        'Invalid or expired token',
        'Check your API key or register for a new one'
      );
    }
    
    // Attach user to request (without sensitive data)
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name,
      isVerified: user.is_verified,
      createdAt: user.created_at
    };
    req.token = token;
    
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional user authentication
 * Attaches user if token provided, but doesn't fail otherwise
 */
async function optionalUserAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);
    
    if (!token || !validateApiKey(token)) {
      req.user = null;
      req.token = null;
      return next();
    }
    
    const user = await UserService.findByApiKey(token);
    
    if (user) {
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        isVerified: user.is_verified,
        createdAt: user.created_at
      };
      req.token = token;
    } else {
      req.user = null;
      req.token = null;
    }
    
    next();
  } catch (error) {
    // On error, continue without auth
    req.user = null;
    req.token = null;
    next();
  }
}

module.exports = {
  requireAuth,
  requireClaimed,
  optionalAuth,
  requireUserAuth,
  optionalUserAuth
};
