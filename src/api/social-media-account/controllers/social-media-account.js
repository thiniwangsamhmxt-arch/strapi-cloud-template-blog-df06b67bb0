/**
 * Social Media Account Controller
 */

'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::social-media-account.social-media-account', ({ strapi }) => ({
  /**
   * Initiate OAuth connection
   * GET /api/social-media-accounts/connect/:platform
   */
  async connect(ctx) {
    try {
      const { platform } = ctx.params;
      const redirectUri = ctx.query.redirectUri || `${process.env.API_URL}/api/social-media-accounts/callback/${platform}`;

      let authUrl;
      let additionalData = {};

      switch (platform) {
        case 'facebook':
        case 'instagram':
          const facebookService = require('../../../services/social-platforms/facebook.service');
          authUrl = facebookService.getAuthorizationUrl(redirectUri);
          break;

        case 'twitter':
          const twitterService = require('../../../services/social-platforms/twitter.service');
          const twitterAuth = await twitterService.getAuthorizationUrl(redirectUri);
          authUrl = twitterAuth.url;
          additionalData = {
            codeVerifier: twitterAuth.codeVerifier,
            state: twitterAuth.state,
          };
          break;

        case 'linkedin':
          const linkedinService = require('../../../services/social-platforms/linkedin.service');
          authUrl = linkedinService.getAuthorizationUrl(redirectUri);
          break;

        default:
          return ctx.badRequest(`Platform ${platform} not supported`);
      }

      return ctx.send({
        authUrl,
        ...additionalData,
      });
    } catch (error) {
      strapi.log.error('OAuth connect error:', error);
      return ctx.internalServerError('Failed to initiate OAuth connection', { error: error.message });
    }
  },

  /**
   * OAuth callback handler
   * GET /api/social-media-accounts/callback/:platform
   */
  async callback(ctx) {
    try {
      const { platform } = ctx.params;
      const { code, state, codeVerifier } = ctx.query;

      if (!code) {
        return ctx.badRequest('Authorization code is required');
      }

      const redirectUri = `${process.env.API_URL}/api/social-media-accounts/callback/${platform}`;
      const encryptionService = require('../../../utils/encryption');
      
      let tokenData;
      let userInfo;

      switch (platform) {
        case 'facebook':
        case 'instagram':
          const facebookService = require('../../../services/social-platforms/facebook.service');
          tokenData = await facebookService.getAccessToken(code, redirectUri);
          const longLivedToken = await facebookService.getLongLivedToken(tokenData.accessToken);
          
          // Create account entry
          const account = await strapi.documents('api::social-media-account.social-media-account').create({
            data: {
              name: `${platform} Account`,
              platform,
              accessToken: encryptionService.encrypt(longLivedToken.accessToken),
              tokenExpiry: new Date(Date.now() + longLivedToken.expiresIn * 1000),
              connectionStatus: 'connected',
              isActive: true,
            },
          });

          return ctx.send({
            message: 'Account connected successfully',
            accountId: account.documentId,
          });

        case 'twitter':
          if (!codeVerifier) {
            return ctx.badRequest('Code verifier is required for Twitter');
          }

          const twitterService = require('../../../services/social-platforms/twitter.service');
          tokenData = await twitterService.getAccessToken(code, codeVerifier, redirectUri);
          userInfo = await twitterService.getUserInfo(tokenData.accessToken);

          await strapi.documents('api::social-media-account.social-media-account').create({
            data: {
              name: `@${userInfo.username}`,
              platform: 'twitter',
              platformAccountId: userInfo.id,
              username: userInfo.username,
              profileUrl: `https://twitter.com/${userInfo.username}`,
              accessToken: encryptionService.encrypt(tokenData.accessToken),
              refreshToken: encryptionService.encrypt(tokenData.refreshToken),
              tokenExpiry: new Date(Date.now() + tokenData.expiresIn * 1000),
              connectionStatus: 'connected',
              isActive: true,
              accountMetadata: {
                followersCount: userInfo.metrics?.followers_count || 0,
                followingCount: userInfo.metrics?.following_count || 0,
                verified: userInfo.verified,
              },
            },
          });

          return ctx.send({
            message: 'Twitter account connected successfully',
          });

        case 'linkedin':
          const linkedinService = require('../../../services/social-platforms/linkedin.service');
          tokenData = await linkedinService.getAccessToken(code, redirectUri);
          userInfo = await linkedinService.getUserProfile(tokenData.accessToken);

          await strapi.documents('api::social-media-account.social-media-account').create({
            data: {
              name: `${userInfo.firstName} ${userInfo.lastName}`,
              platform: 'linkedin',
              platformAccountId: userInfo.id,
              username: `${userInfo.firstName} ${userInfo.lastName}`,
              accessToken: encryptionService.encrypt(tokenData.accessToken),
              tokenExpiry: new Date(Date.now() + tokenData.expiresIn * 1000),
              connectionStatus: 'connected',
              isActive: true,
            },
          });

          return ctx.send({
            message: 'LinkedIn account connected successfully',
          });

        default:
          return ctx.badRequest(`Platform ${platform} not supported`);
      }
    } catch (error) {
      strapi.log.error('OAuth callback error:', error);
      return ctx.internalServerError('Failed to complete OAuth connection', { error: error.message });
    }
  },

  /**
   * Disconnect account
   * POST /api/social-media-accounts/:id/disconnect
   */
  async disconnect(ctx) {
    try {
      const { id } = ctx.params;

      await strapi.documents('api::social-media-account.social-media-account').update({
        documentId: id,
        data: {
          connectionStatus: 'disconnected',
          isActive: false,
        },
      });

      return ctx.send({
        message: 'Account disconnected successfully',
      });
    } catch (error) {
      strapi.log.error('Disconnect error:', error);
      return ctx.internalServerError('Failed to disconnect account', { error: error.message });
    }
  },

  /**
   * Refresh account token
   * POST /api/social-media-accounts/:id/refresh-token
   */
  async refreshToken(ctx) {
    try {
      const { id } = ctx.params;

      const account = await strapi.documents('api::social-media-account.social-media-account').findOne({
        documentId: id,
      });

      if (!account) {
        return ctx.notFound('Account not found');
      }

      const encryptionService = require('../../../utils/encryption');
      
      let newTokenData;

      switch (account.platform) {
        case 'twitter':
          const twitterService = require('../../../services/social-platforms/twitter.service');
          const refreshToken = encryptionService.decrypt(account.refreshToken);
          newTokenData = await twitterService.refreshAccessToken(refreshToken);

          await strapi.documents('api::social-media-account.social-media-account').update({
            documentId: id,
            data: {
              accessToken: encryptionService.encrypt(newTokenData.accessToken),
              refreshToken: encryptionService.encrypt(newTokenData.refreshToken),
              tokenExpiry: new Date(Date.now() + newTokenData.expiresIn * 1000),
              lastError: null,
              errorCount: 0,
            },
          });

          return ctx.send({
            message: 'Token refreshed successfully',
          });

        default:
          return ctx.badRequest(`Token refresh not supported for ${account.platform}`);
      }
    } catch (error) {
      strapi.log.error('Token refresh error:', error);
      return ctx.internalServerError('Failed to refresh token', { error: error.message });
    }
  },

  /**
   * Sync account data
   * POST /api/social-media-accounts/:id/sync
   */
  async sync(ctx) {
    try {
      const { id } = ctx.params;

      const account = await strapi.documents('api::social-media-account.social-media-account').findOne({
        documentId: id,
      });

      if (!account) {
        return ctx.notFound('Account not found');
      }

      const encryptionService = require('../../../utils/encryption');
      const accessToken = encryptionService.decrypt(account.accessToken);

      let updatedMetadata = {};

      switch (account.platform) {
        case 'twitter':
          const twitterService = require('../../../services/social-platforms/twitter.service');
          const userInfo = await twitterService.getUserInfo(accessToken);
          updatedMetadata = {
            followersCount: userInfo.metrics?.followers_count || 0,
            followingCount: userInfo.metrics?.following_count || 0,
            postsCount: userInfo.metrics?.tweet_count || 0,
            verified: userInfo.verified,
          };
          break;

        default:
          return ctx.send({
            message: 'Sync not yet implemented for this platform',
          });
      }

      await strapi.documents('api::social-media-account.social-media-account').update({
        documentId: id,
        data: {
          accountMetadata: updatedMetadata,
          lastSyncDate: new Date(),
        },
      });

      return ctx.send({
        message: 'Account synced successfully',
        metadata: updatedMetadata,
      });
    } catch (error) {
      strapi.log.error('Sync error:', error);
      return ctx.internalServerError('Failed to sync account', { error: error.message });
    }
  },
}));
