/**
 * Publishing Service
 * Orchestrates posting to multiple social media platforms
 */

const facebookService = require('./social-platforms/facebook.service');
const twitterService = require('./social-platforms/twitter.service');
const linkedinService = require('./social-platforms/linkedin.service');
const queueService = require('./queue/queue.service');
const encryptionService = require('../utils/encryption');
const { apiLogger: logger } = require('../utils/logger');

class PublishingService {
  constructor(strapi) {
    this.strapi = strapi;
  }

  /**
   * Publish post to multiple platforms
   * @param {Object} post - Social media post entity
   * @returns {Object} - Publishing results
   */
  async publishPost(post) {
    const results = {
      success: [],
      failed: [],
      platformPostIds: {},
      platformUrls: {},
    };

    try {
      // Get connected social media accounts
      const accounts = await this.getPostAccounts(post);

      if (!accounts || accounts.length === 0) {
        throw new Error('No social media accounts connected to this post');
      }

      // Publish to each platform
      for (const account of accounts) {
        try {
          const result = await this.publishToPlatform(post, account);
          
          results.success.push({
            platform: account.platform,
            accountName: account.name,
            postId: result.id,
            url: result.url,
          });

          results.platformPostIds[account.platform] = result.id;
          results.platformUrls[account.platform] = result.url;
        } catch (error) {
          logger.error(`Failed to publish to ${account.platform}`, {
            postId: post.id,
            error: error.message,
          });

          results.failed.push({
            platform: account.platform,
            accountName: account.name,
            error: error.message,
          });
        }
      }

      // Update post status
      const newStatus = results.failed.length > 0 
        ? (results.success.length > 0 ? 'published' : 'failed')
        : 'published';

      await this.updatePostStatus(post.documentId, {
        status: newStatus,
        actualPublishDate: new Date(),
        platformPostIds: results.platformPostIds,
        platformUrls: results.platformUrls,
        errorLog: results.failed,
      });

      logger.info('Post publishing completed', {
        postId: post.id,
        successCount: results.success.length,
        failedCount: results.failed.length,
      });

      return results;
    } catch (error) {
      logger.error('Post publishing failed', {
        postId: post.id,
        error: error.message,
      });

      await this.updatePostStatus(post.documentId, {
        status: 'failed',
        errorLog: [{ error: error.message, timestamp: new Date() }],
      });

      throw error;
    }
  }

  /**
   * Publish to specific platform
   * @param {Object} post - Post data
   * @param {Object} account - Social media account
   * @returns {Object} - Platform response
   */
  async publishToPlatform(post, account) {
    const accessToken = encryptionService.decrypt(account.accessToken);
    
    // Prepare post data based on platform
    const postData = this.preparePostData(post, account.platform);

    switch (account.platform) {
      case 'facebook':
        return await facebookService.publishToFacebook(
          account.platformAccountId,
          accessToken,
          postData
        );

      case 'instagram':
        return await facebookService.publishToInstagram(
          account.platformAccountId,
          accessToken,
          postData
        );

      case 'twitter':
        // Handle Twitter threads if content is too long
        if (postData.text.length > 280) {
          const tweets = twitterService.splitIntoTweets(postData.text);
          const threadResults = await twitterService.postThread(
            accessToken,
            tweets,
            postData.mediaIds
          );
          return threadResults[0]; // Return first tweet
        }
        return await twitterService.postTweet(accessToken, postData);

      case 'linkedin':
        if (account.accountType === 'business') {
          return await linkedinService.shareOrganizationContent(
            accessToken,
            account.platformAccountId,
            postData
          );
        }
        return await linkedinService.shareContent(
          accessToken,
          account.platformAccountId,
          postData
        );

      default:
        throw new Error(`Platform ${account.platform} not supported`);
    }
  }

  /**
   * Prepare post data for specific platform
   * @param {Object} post - Post entity
   * @param {string} platform - Platform name
   * @returns {Object} - Platform-specific post data
   */
  preparePostData(post, platform) {
    const baseData = {
      title: post.title,
      content: post.content,
      shortContent: post.shortContent,
      hashtags: post.hashtags || [],
      mentions: post.mentions || [],
    };

    // Get platform-specific configuration
    const platformConfig = post.platforms?.find(p => p.platform === platform) || {};

    switch (platform) {
      case 'facebook':
        return {
          message: platformConfig.customContent || post.content,
          link: platformConfig.link,
          mediaUrls: this.getMediaUrls(post.media),
        };

      case 'instagram':
        return {
          caption: this.formatInstagramCaption(
            platformConfig.customContent || post.content,
            post.hashtags
          ),
          mediaUrls: this.getMediaUrls(post.media),
          mediaType: this.getInstagramMediaType(post.media),
        };

      case 'twitter':
        return {
          text: this.formatTwitterText(
            platformConfig.customContent || post.shortContent || post.content,
            post.hashtags,
            post.mentions
          ),
          mediaIds: [], // Will be uploaded separately
        };

      case 'linkedin':
        return {
          text: platformConfig.customContent || post.content,
          title: post.title,
          description: post.shortContent,
          url: platformConfig.link,
          mediaUrls: this.getMediaUrls(post.media),
        };

      default:
        return baseData;
    }
  }

  /**
   * Format Instagram caption with hashtags
   * @param {string} content - Content
   * @param {Array} hashtags - Hashtags
   * @returns {string} - Formatted caption
   */
  formatInstagramCaption(content, hashtags = []) {
    let caption = content;
    
    if (hashtags && hashtags.length > 0) {
      const hashtagString = hashtags
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
        .join(' ');
      caption += `\n\n${hashtagString}`;
    }

    return caption;
  }

  /**
   * Format Twitter text with mentions and hashtags
   * @param {string} content - Content
   * @param {Array} hashtags - Hashtags
   * @param {Array} mentions - Mentions
   * @returns {string} - Formatted text
   */
  formatTwitterText(content, hashtags = [], mentions = []) {
    let text = content;

    // Add mentions
    if (mentions && mentions.length > 0) {
      const mentionString = mentions
        .map(mention => mention.startsWith('@') ? mention : `@${mention}`)
        .join(' ');
      text = `${mentionString} ${text}`;
    }

    // Add hashtags (if space allows)
    if (hashtags && hashtags.length > 0) {
      const hashtagString = hashtags
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
        .join(' ');
      
      if ((text + ' ' + hashtagString).length <= 280) {
        text += ` ${hashtagString}`;
      }
    }

    return text;
  }

  /**
   * Get media URLs from Strapi media field
   * @param {Array} media - Media array
   * @returns {Array} - Media URLs
   */
  getMediaUrls(media) {
    if (!media || media.length === 0) return [];
    
    return media.map(item => {
      if (typeof item === 'string') return item;
      return item.url || item.formats?.large?.url || item.formats?.medium?.url;
    }).filter(Boolean);
  }

  /**
   * Determine Instagram media type
   * @param {Array} media - Media array
   * @returns {string} - Media type
   */
  getInstagramMediaType(media) {
    if (!media || media.length === 0) return 'IMAGE';
    
    const firstItem = media[0];
    const mimeType = typeof firstItem === 'string' ? '' : (firstItem.mime || '');
    
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (media.length > 1) return 'CAROUSEL';
    return 'IMAGE';
  }

  /**
   * Get post accounts with populated data
   * @param {Object} post - Post entity
   * @returns {Array} - Social media accounts
   */
  async getPostAccounts(post) {
    try {
      if (!post.socialMediaAccounts) {
        const populatedPost = await this.strapi.documents('api::social-media-post.social-media-post').findOne({
          documentId: post.documentId,
          populate: ['socialMediaAccounts'],
        });
        return populatedPost.socialMediaAccounts || [];
      }
      
      return post.socialMediaAccounts;
    } catch (error) {
      logger.error('Failed to get post accounts', { error: error.message });
      return [];
    }
  }

  /**
   * Update post status
   * @param {string} documentId - Post document ID
   * @param {Object} updates - Fields to update
   */
  async updatePostStatus(documentId, updates) {
    try {
      await this.strapi.documents('api::social-media-post.social-media-post').update({
        documentId,
        data: updates,
      });

      logger.info('Post status updated', { documentId, status: updates.status });
    } catch (error) {
      logger.error('Failed to update post status', {
        documentId,
        error: error.message,
      });
    }
  }

  /**
   * Schedule post for publishing
   * @param {Object} post - Post entity
   * @returns {Object} - Job data
   */
  async schedulePost(post) {
    try {
      if (!post.scheduledPublishDate) {
        throw new Error('Post does not have a scheduled publish date');
      }

      const scheduledTime = new Date(post.scheduledPublishDate);
      
      if (scheduledTime <= new Date()) {
        throw new Error('Scheduled time must be in the future');
      }

      // Add to scheduled posts queue
      const job = await queueService.addScheduledJob(
        'social-post-scheduled',
        {
          type: 'publish-scheduled-post',
          postId: post.documentId,
          postTitle: post.title,
        },
        scheduledTime,
        {
          priority: this.getPriority(post.priority),
        }
      );

      // Update post status
      await this.updatePostStatus(post.documentId, {
        status: 'scheduled',
      });

      logger.info('Post scheduled successfully', {
        postId: post.id,
        scheduledTime: scheduledTime.toISOString(),
        jobId: job.id,
      });

      return {
        jobId: job.id,
        scheduledTime,
      };
    } catch (error) {
      logger.error('Failed to schedule post', {
        postId: post.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cancel scheduled post
   * @param {Object} post - Post entity
   * @param {string} jobId - Queue job ID
   */
  async cancelScheduledPost(post, jobId) {
    try {
      await queueService.removeJob('social-post-scheduled', jobId);

      await this.updatePostStatus(post.documentId, {
        status: 'draft',
      });

      logger.info('Scheduled post cancelled', { postId: post.id, jobId });
    } catch (error) {
      logger.error('Failed to cancel scheduled post', {
        postId: post.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get priority number from priority enum
   * @param {string} priority - Priority string
   * @returns {number} - Priority number
   */
  getPriority(priority) {
    const priorityMap = {
      urgent: 1,
      high: 2,
      normal: 5,
      low: 10,
    };

    return priorityMap[priority] || 5;
  }
}

module.exports = PublishingService;
