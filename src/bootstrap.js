/**
 * Bootstrap Function
 * Initializes queue workers and scheduled jobs
 */

'use strict';

module.exports = async ({ strapi }) => {
  // Initialize queue workers
  const queueService = require('./services/queue/queue.service');
  const PublishingService = require('./services/publishing.service');
  const { queueLogger: logger } = require('./utils/logger');

  logger.info('Initializing queue workers...');

  // Worker for scheduled posts
  queueService.createWorker('social-post-scheduled', async (job) => {
    logger.info('Processing scheduled post', { jobId: job.id, postId: job.data.postId });

    try {
      const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
        documentId: job.data.postId,
        populate: ['socialMediaAccounts', 'media', 'campaign'],
      });

      if (!post) {
        throw new Error(`Post not found: ${job.data.postId}`);
      }

      // Check if post is still scheduled
      if (post.status !== 'scheduled') {
        logger.warn('Post status is not scheduled, skipping', {
          postId: job.data.postId,
          status: post.status,
        });
        return { skipped: true, reason: 'Status changed' };
      }

      // Publish the post
      const publishingService = new PublishingService(strapi);
      const result = await publishingService.publishPost(post);

      logger.info('Scheduled post published successfully', {
        postId: job.data.postId,
        successCount: result.success.length,
        failedCount: result.failed.length,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish scheduled post', {
        jobId: job.id,
        postId: job.data.postId,
        error: error.message,
      });
      throw error;
    }
  }, {
    concurrency: 3,
    limiter: {
      max: 5,
      duration: 1000,
    },
  });

  // Worker for immediate posts
  queueService.createWorker('social-post-immediate', async (job) => {
    logger.info('Processing immediate post', { jobId: job.id, postId: job.data.postId });

    try {
      const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
        documentId: job.data.postId,
        populate: ['socialMediaAccounts', 'media', 'campaign'],
      });

      if (!post) {
        throw new Error(`Post not found: ${job.data.postId}`);
      }

      const publishingService = new PublishingService(strapi);
      const result = await publishingService.publishPost(post);

      return result;
    } catch (error) {
      logger.error('Failed to publish immediate post', {
        jobId: job.id,
        postId: job.data.postId,
        error: error.message,
      });
      throw error;
    }
  }, {
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  // Worker for token refresh
  queueService.createWorker('token-refresh', async (job) => {
    logger.info('Processing token refresh', { jobId: job.id, accountId: job.data.accountId });

    try {
      const account = await strapi.documents('api::social-media-account.social-media-account').findOne({
        documentId: job.data.accountId,
      });

      if (!account) {
        throw new Error(`Account not found: ${job.data.accountId}`);
      }

      // Only Twitter supports token refresh currently
      if (account.platform === 'twitter') {
        const twitterService = require('./services/social-platforms/twitter.service');
        const encryptionService = require('./utils/encryption');

        const refreshToken = encryptionService.decrypt(account.refreshToken);
        const newTokenData = await twitterService.refreshAccessToken(refreshToken);

        await strapi.documents('api::social-media-account.social-media-account').update({
          documentId: job.data.accountId,
          data: {
            accessToken: encryptionService.encrypt(newTokenData.accessToken),
            refreshToken: encryptionService.encrypt(newTokenData.refreshToken),
            tokenExpiry: new Date(Date.now() + newTokenData.expiresIn * 1000),
            lastError: null,
            errorCount: 0,
          },
        });

        logger.info('Token refreshed successfully', { accountId: job.data.accountId });

        return { success: true };
      }

      return { skipped: true, reason: 'Platform does not support token refresh' };
    } catch (error) {
      logger.error('Failed to refresh token', {
        jobId: job.id,
        accountId: job.data.accountId,
        error: error.message,
      });
      throw error;
    }
  });

  // Worker for analytics sync
  queueService.createWorker('social-analytics-sync', async (job) => {
    logger.info('Processing analytics sync', { jobId: job.id, postId: job.data.postId });

    try {
      const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
        documentId: job.data.postId,
        populate: ['socialMediaAccounts'],
      });

      if (!post || !post.platformPostIds) {
        return { skipped: true, reason: 'Post not published' };
      }

      const encryptionService = require('./utils/encryption');
      const facebookService = require('./services/social-platforms/facebook.service');
      const twitterService = require('./services/social-platforms/twitter.service');

      const analyticsResults = {};

      // Fetch analytics from each platform
      for (const account of post.socialMediaAccounts || []) {
        const accessToken = encryptionService.decrypt(account.accessToken);
        const platformPostId = post.platformPostIds[account.platform];

        if (!platformPostId) continue;

        try {
          let analytics;

          switch (account.platform) {
            case 'facebook':
              analytics = await facebookService.getPostAnalytics(platformPostId, accessToken);
              break;

            case 'instagram':
              analytics = await facebookService.getInstagramInsights(platformPostId, accessToken);
              break;

            case 'twitter':
              analytics = await twitterService.getTweetAnalytics(accessToken, platformPostId);
              break;

            default:
              continue;
          }

          analyticsResults[account.platform] = analytics;

          // Update post analytics
          const postService = strapi.service('api::social-media-post.social-media-post');
          await postService.updateAnalytics(post.documentId, analytics, account.platform);
        } catch (error) {
          logger.error(`Failed to fetch analytics for ${account.platform}`, {
            postId: post.documentId,
            platform: account.platform,
            error: error.message,
          });
        }
      }

      logger.info('Analytics sync completed', {
        postId: post.documentId,
        platforms: Object.keys(analyticsResults),
      });

      return analyticsResults;
    } catch (error) {
      logger.error('Failed to sync analytics', {
        jobId: job.id,
        postId: job.data.postId,
        error: error.message,
      });
      throw error;
    }
  });

  logger.info('Queue workers initialized successfully');

  // Schedule periodic analytics sync for published posts
  await queueService.addRecurringJob(
    'social-analytics-sync',
    {
      type: 'periodic-analytics-sync',
    },
    {
      pattern: '0 */6 * * *', // Every 6 hours
    }
  );

  logger.info('Recurring jobs scheduled');

  // Log startup message
  strapi.log.info('🚀 Social Media CMS initialized successfully');
  strapi.log.info('📱 Multi-platform publishing: Facebook, Instagram, Twitter, LinkedIn');
  strapi.log.info('⏰ Scheduled publishing with queue management');
  strapi.log.info('📊 Analytics tracking and reporting');
  strapi.log.info('🔐 Encrypted token storage');
};
