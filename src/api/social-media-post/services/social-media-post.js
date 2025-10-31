/**
 * Social Media Post Service
 */

'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::social-media-post.social-media-post', ({ strapi }) => ({
  /**
   * Get posts by status
   * @param {string} status - Post status
   * @returns {Array} - Posts
   */
  async findByStatus(status) {
    return await strapi.documents('api::social-media-post.social-media-post').findMany({
      filters: { status },
      populate: ['socialMediaAccounts', 'media', 'campaign'],
    });
  },

  /**
   * Get posts scheduled for a specific date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Array} - Scheduled posts
   */
  async findScheduledInRange(startDate, endDate) {
    return await strapi.documents('api::social-media-post.social-media-post').findMany({
      filters: {
        status: 'scheduled',
        scheduledPublishDate: {
          $gte: startDate,
          $lte: endDate,
        },
      },
      populate: ['socialMediaAccounts', 'media', 'campaign'],
    });
  },

  /**
   * Get posts by campaign
   * @param {string} campaignId - Campaign document ID
   * @returns {Array} - Posts
   */
  async findByCampaign(campaignId) {
    return await strapi.documents('api::social-media-post.social-media-post').findMany({
      filters: {
        campaign: {
          documentId: campaignId,
        },
      },
      populate: ['socialMediaAccounts', 'media'],
    });
  },

  /**
   * Get posts pending approval
   * @returns {Array} - Posts
   */
  async findPendingApproval() {
    return await strapi.documents('api::social-media-post.social-media-post').findMany({
      filters: {
        approvalStatus: 'pending',
      },
      populate: ['socialMediaAccounts', 'media', 'campaign'],
    });
  },

  /**
   * Update analytics for a post
   * @param {string} documentId - Post document ID
   * @param {Object} analyticsData - Analytics data from platform
   * @param {string} platform - Platform name
   */
  async updateAnalytics(documentId, analyticsData, platform) {
    const post = await strapi.documents('api::social-media-post.social-media-post').findOne({
      documentId,
    });

    if (!post) {
      throw new Error('Post not found');
    }

    const currentAnalytics = post.analytics || {
      likes: 0,
      shares: 0,
      comments: 0,
      views: 0,
      clicks: 0,
      reach: 0,
      impressions: 0,
    };

    // Aggregate analytics from different platforms
    const updatedAnalytics = {
      ...currentAnalytics,
      [`${platform}_likes`]: analyticsData.likes || 0,
      [`${platform}_shares`]: analyticsData.shares || 0,
      [`${platform}_comments`]: analyticsData.comments || 0,
      [`${platform}_views`]: analyticsData.views || 0,
      [`${platform}_clicks`]: analyticsData.clicks || 0,
      [`${platform}_reach`]: analyticsData.reach || 0,
      [`${platform}_impressions`]: analyticsData.impressions || 0,
      lastSyncDate: new Date(),
    };

    // Calculate totals
    updatedAnalytics.likes = this.sumPlatformMetrics(updatedAnalytics, 'likes');
    updatedAnalytics.shares = this.sumPlatformMetrics(updatedAnalytics, 'shares');
    updatedAnalytics.comments = this.sumPlatformMetrics(updatedAnalytics, 'comments');
    updatedAnalytics.views = this.sumPlatformMetrics(updatedAnalytics, 'views');
    updatedAnalytics.clicks = this.sumPlatformMetrics(updatedAnalytics, 'clicks');
    updatedAnalytics.reach = this.sumPlatformMetrics(updatedAnalytics, 'reach');
    updatedAnalytics.impressions = this.sumPlatformMetrics(updatedAnalytics, 'impressions');

    await strapi.documents('api::social-media-post.social-media-post').update({
      documentId,
      data: { analytics: updatedAnalytics },
    });

    return updatedAnalytics;
  },

  /**
   * Helper: Sum platform-specific metrics
   * @param {Object} analytics - Analytics object
   * @param {string} metric - Metric name
   * @returns {number} - Total
   */
  sumPlatformMetrics(analytics, metric) {
    const platforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'];
    let total = 0;

    platforms.forEach(platform => {
      const key = `${platform}_${metric}`;
      if (analytics[key]) {
        total += analytics[key];
      }
    });

    return total;
  },

  /**
   * Get performance metrics for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} - Performance metrics
   */
  async getPerformanceMetrics(startDate, endDate) {
    const posts = await strapi.documents('api::social-media-post.social-media-post').findMany({
      filters: {
        actualPublishDate: {
          $gte: startDate,
          $lte: endDate,
        },
        status: 'published',
      },
    });

    const metrics = {
      totalPosts: posts.length,
      totalLikes: 0,
      totalShares: 0,
      totalComments: 0,
      totalViews: 0,
      totalClicks: 0,
      totalReach: 0,
      totalImpressions: 0,
      averageEngagementRate: 0,
    };

    posts.forEach(post => {
      if (post.analytics) {
        metrics.totalLikes += post.analytics.likes || 0;
        metrics.totalShares += post.analytics.shares || 0;
        metrics.totalComments += post.analytics.comments || 0;
        metrics.totalViews += post.analytics.views || 0;
        metrics.totalClicks += post.analytics.clicks || 0;
        metrics.totalReach += post.analytics.reach || 0;
        metrics.totalImpressions += post.analytics.impressions || 0;
      }
    });

    // Calculate average engagement rate
    if (metrics.totalImpressions > 0) {
      const totalEngagements = metrics.totalLikes + metrics.totalShares + metrics.totalComments;
      metrics.averageEngagementRate = (totalEngagements / metrics.totalImpressions) * 100;
    }

    return metrics;
  },
}));
