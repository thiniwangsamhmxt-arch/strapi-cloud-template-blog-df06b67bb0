/**
 * Social Media Post Controller
 * Custom controller for social media post operations
 */

'use strict';

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::social-media-post.social-media-post', ({ strapi }) => ({
  /**
   * Custom publish endpoint
   * POST /api/social-media-posts/:id/publish
   */
  async publish(ctx) {
    try {
      const { id } = ctx.params;

      // Get the post
      const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
        documentId: id,
        populate: ['socialMediaAccounts', 'media', 'campaign'],
      });

      if (!post) {
        return ctx.notFound('Post not found');
      }

      // Check if post is in valid state for publishing
      if (post.status === 'published') {
        return ctx.badRequest('Post is already published');
      }

      // Initialize publishing service
      const PublishingService = require('../../../services/publishing.service');
      const publishingService = new PublishingService(strapi);

      // Publish the post
      const results = await publishingService.publishPost(post);

      return ctx.send({
        message: 'Post published successfully',
        data: results,
      });
    } catch (error) {
      strapi.log.error('Publish error:', error);
      return ctx.internalServerError('Failed to publish post', { error: error.message });
    }
  },

  /**
   * Schedule a post for later publishing
   * POST /api/social-media-posts/:id/schedule
   */
  async schedule(ctx) {
    try {
      const { id } = ctx.params;
      const { scheduledPublishDate, timezone } = ctx.request.body;

      if (!scheduledPublishDate) {
        return ctx.badRequest('scheduledPublishDate is required');
      }

      // Update post with schedule info
      const post = await strapi.documents('api::social-media-post.social-media-post').update({
        documentId: id,
        data: {
          scheduledPublishDate,
          timezone: timezone || 'UTC',
          autoPublish: true,
        },
        populate: ['socialMediaAccounts'],
      });

      if (!post) {
        return ctx.notFound('Post not found');
      }

      // Schedule the post
      const PublishingService = require('../../../services/publishing.service');
      const publishingService = new PublishingService(strapi);
      const scheduleResult = await publishingService.schedulePost(post);

      return ctx.send({
        message: 'Post scheduled successfully',
        data: {
          post,
          jobId: scheduleResult.jobId,
          scheduledTime: scheduleResult.scheduledTime,
        },
      });
    } catch (error) {
      strapi.log.error('Schedule error:', error);
      return ctx.internalServerError('Failed to schedule post', { error: error.message });
    }
  },

  /**
   * Cancel a scheduled post
   * POST /api/social-media-posts/:id/cancel-schedule
   */
  async cancelSchedule(ctx) {
    try {
      const { id } = ctx.params;
      const { jobId } = ctx.request.body;

      if (!jobId) {
        return ctx.badRequest('jobId is required');
      }

      const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
        documentId: id,
      });

      if (!post) {
        return ctx.notFound('Post not found');
      }

      // Cancel the schedule
      const PublishingService = require('../../../services/publishing.service');
      const publishingService = new PublishingService(strapi);
      await publishingService.cancelScheduledPost(post, jobId);

      return ctx.send({
        message: 'Scheduled post cancelled successfully',
      });
    } catch (error) {
      strapi.log.error('Cancel schedule error:', error);
      return ctx.internalServerError('Failed to cancel scheduled post', { error: error.message });
    }
  },

  /**
   * Get post analytics
   * GET /api/social-media-posts/:id/analytics
   */
  async analytics(ctx) {
    try {
      const { id } = ctx.params;

      const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
        documentId: id,
        populate: ['socialMediaAccounts'],
      });

      if (!post) {
        return ctx.notFound('Post not found');
      }

      if (!post.analytics || Object.keys(post.analytics).length === 0) {
        return ctx.send({
          message: 'No analytics available yet',
          data: post.analytics || {},
        });
      }

      return ctx.send({
        data: post.analytics,
      });
    } catch (error) {
      strapi.log.error('Analytics error:', error);
      return ctx.internalServerError('Failed to get analytics', { error: error.message });
    }
  },

  /**
   * Duplicate a post
   * POST /api/social-media-posts/:id/duplicate
   */
  async duplicate(ctx) {
    try {
      const { id } = ctx.params;

      const originalPost = await strapi.documents('api::social-media-post.social-media-post').findOne({
        documentId: id,
        populate: ['socialMediaAccounts', 'media', 'campaign'],
      });

      if (!originalPost) {
        return ctx.notFound('Post not found');
      }

      // Create duplicate with modified title
      const duplicateData = {
        ...originalPost,
        title: `${originalPost.title} (Copy)`,
        status: 'draft',
        scheduledPublishDate: null,
        actualPublishDate: null,
        platformPostIds: {},
        platformUrls: {},
        analytics: {
          likes: 0,
          shares: 0,
          comments: 0,
          views: 0,
          clicks: 0,
          reach: 0,
          impressions: 0,
        },
      };

      // Remove system fields
      delete duplicateData.id;
      delete duplicateData.documentId;
      delete duplicateData.createdAt;
      delete duplicateData.updatedAt;
      delete duplicateData.publishedAt;

      const duplicate = await strapi.documents('api::social-media-post.social-media-post').create({
        data: duplicateData,
      });

      return ctx.send({
        message: 'Post duplicated successfully',
        data: duplicate,
      });
    } catch (error) {
      strapi.log.error('Duplicate error:', error);
      return ctx.internalServerError('Failed to duplicate post', { error: error.message });
    }
  },

  /**
   * Bulk publish posts
   * POST /api/social-media-posts/bulk-publish
   */
  async bulkPublish(ctx) {
    try {
      const { postIds } = ctx.request.body;

      if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
        return ctx.badRequest('postIds array is required');
      }

      const results = {
        success: [],
        failed: [],
      };

      const PublishingService = require('../../../services/publishing.service');
      const publishingService = new PublishingService(strapi);

      // Publish each post
      for (const postId of postIds) {
        try {
          const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
            documentId: postId,
            populate: ['socialMediaAccounts', 'media'],
          });

          if (!post) {
            results.failed.push({
              postId,
              error: 'Post not found',
            });
            continue;
          }

          const publishResult = await publishingService.publishPost(post);
          results.success.push({
            postId,
            title: post.title,
            result: publishResult,
          });
        } catch (error) {
          results.failed.push({
            postId,
            error: error.message,
          });
        }
      }

      return ctx.send({
        message: 'Bulk publish completed',
        data: results,
      });
    } catch (error) {
      strapi.log.error('Bulk publish error:', error);
      return ctx.internalServerError('Failed to bulk publish posts', { error: error.message });
    }
  },
}));
