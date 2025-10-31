/**
 * Facebook/Instagram Integration Service
 * Handles OAuth, posting, and analytics for Facebook and Instagram via Meta Graph API
 */

const axios = require('axios');
const { socialPlatformLogger: logger } = require('../../utils/logger');
const encryptionService = require('../../utils/encryption');

class FacebookService {
  constructor() {
    this.appId = process.env.FACEBOOK_APP_ID;
    this.appSecret = process.env.FACEBOOK_APP_SECRET;
    this.graphApiVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.graphApiVersion}`;
  }

  /**
   * Get OAuth authorization URL
   * @param {string} redirectUri - Callback URL
   * @param {Array} scopes - Required permissions
   * @returns {string} - Authorization URL
   */
  getAuthorizationUrl(redirectUri, scopes = []) {
    const defaultScopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_engagement',
      'instagram_basic',
      'instagram_content_publish',
    ];

    const allScopes = [...new Set([...defaultScopes, ...scopes])];

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      scope: allScopes.join(','),
      response_type: 'code',
      state: this.generateState(),
    });

    return `https://www.facebook.com/${this.graphApiVersion}/dialog/oauth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @param {string} redirectUri - Callback URL
   * @returns {Object} - Token data
   */
  async getAccessToken(code, redirectUri) {
    try {
      const params = {
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: redirectUri,
        code,
      };

      const response = await axios.get(`${this.baseUrl}/oauth/access_token`, { params });
      
      logger.info('Facebook access token obtained successfully');
      
      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      logger.error('Failed to get Facebook access token', { error: error.message });
      throw new Error(`Facebook OAuth error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get long-lived access token
   * @param {string} shortLivedToken - Short-lived access token
   * @returns {Object} - Long-lived token data
   */
  async getLongLivedToken(shortLivedToken) {
    try {
      const params = {
        grant_type: 'fb_exchange_token',
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: shortLivedToken,
      };

      const response = await axios.get(`${this.baseUrl}/oauth/access_token`, { params });
      
      logger.info('Long-lived Facebook token obtained');
      
      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      logger.error('Failed to get long-lived token', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user's Facebook pages
   * @param {string} accessToken - User access token
   * @returns {Array} - List of pages
   */
  async getUserPages(accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/me/accounts`, {
        params: { access_token: accessToken },
      });

      return response.data.data;
    } catch (error) {
      logger.error('Failed to get user pages', { error: error.message });
      throw error;
    }
  }

  /**
   * Get Instagram business account
   * @param {string} pageId - Facebook page ID
   * @param {string} pageAccessToken - Page access token
   * @returns {Object} - Instagram account info
   */
  async getInstagramAccount(pageId, pageAccessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/${pageId}`, {
        params: {
          fields: 'instagram_business_account',
          access_token: pageAccessToken,
        },
      });

      return response.data.instagram_business_account;
    } catch (error) {
      logger.error('Failed to get Instagram account', { error: error.message });
      throw error;
    }
  }

  /**
   * Publish post to Facebook page
   * @param {string} pageId - Page ID
   * @param {string} pageAccessToken - Page access token
   * @param {Object} postData - Post content and settings
   * @returns {Object} - Published post data
   */
  async publishToFacebook(pageId, pageAccessToken, postData) {
    try {
      const { message, link, mediaUrls = [] } = postData;

      let endpoint = `${this.baseUrl}/${pageId}/feed`;
      const params = {
        access_token: pageAccessToken,
        message,
      };

      // Handle media posts
      if (mediaUrls.length > 0) {
        if (mediaUrls.length === 1) {
          // Single photo or video
          const mediaType = this.getMediaType(mediaUrls[0]);
          
          if (mediaType === 'video') {
            endpoint = `${this.baseUrl}/${pageId}/videos`;
            params.file_url = mediaUrls[0];
            params.description = message;
            delete params.message;
          } else {
            endpoint = `${this.baseUrl}/${pageId}/photos`;
            params.url = mediaUrls[0];
            params.caption = message;
            delete params.message;
          }
        } else {
          // Multiple photos (album)
          return await this.publishPhotoAlbum(pageId, pageAccessToken, message, mediaUrls);
        }
      } else if (link) {
        params.link = link;
      }

      const response = await axios.post(endpoint, null, { params });
      
      logger.info('Successfully published to Facebook', { postId: response.data.id });
      
      return {
        id: response.data.id,
        platform: 'facebook',
        url: `https://facebook.com/${response.data.id}`,
      };
    } catch (error) {
      logger.error('Failed to publish to Facebook', { error: error.message });
      throw new Error(`Facebook publish error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Publish photo album to Facebook
   * @param {string} pageId - Page ID
   * @param {string} pageAccessToken - Page access token
   * @param {string} message - Album message
   * @param {Array} mediaUrls - Array of photo URLs
   * @returns {Object} - Published album data
   */
  async publishPhotoAlbum(pageId, pageAccessToken, message, mediaUrls) {
    try {
      // Upload photos and get their IDs
      const photoIds = [];
      
      for (const url of mediaUrls) {
        const response = await axios.post(
          `${this.baseUrl}/${pageId}/photos`,
          null,
          {
            params: {
              url,
              published: false,
              access_token: pageAccessToken,
            },
          }
        );
        photoIds.push({ media_fbid: response.data.id });
      }

      // Create the album post
      const response = await axios.post(
        `${this.baseUrl}/${pageId}/feed`,
        null,
        {
          params: {
            message,
            attached_media: JSON.stringify(photoIds),
            access_token: pageAccessToken,
          },
        }
      );

      logger.info('Successfully published photo album to Facebook', { postId: response.data.id });

      return {
        id: response.data.id,
        platform: 'facebook',
        url: `https://facebook.com/${response.data.id}`,
      };
    } catch (error) {
      logger.error('Failed to publish photo album', { error: error.message });
      throw error;
    }
  }

  /**
   * Publish post to Instagram
   * @param {string} instagramAccountId - Instagram business account ID
   * @param {string} accessToken - Access token
   * @param {Object} postData - Post content and settings
   * @returns {Object} - Published post data
   */
  async publishToInstagram(instagramAccountId, accessToken, postData) {
    try {
      const { caption, mediaUrls = [], mediaType = 'IMAGE' } = postData;

      if (mediaUrls.length === 0) {
        throw new Error('Instagram posts require at least one media item');
      }

      // Create container
      const containerParams = {
        access_token: accessToken,
        caption,
      };

      if (mediaType === 'VIDEO') {
        containerParams.media_type = 'VIDEO';
        containerParams.video_url = mediaUrls[0];
      } else if (mediaUrls.length > 1) {
        // Carousel post
        containerParams.media_type = 'CAROUSEL';
        containerParams.children = await this.createCarouselChildren(
          instagramAccountId,
          accessToken,
          mediaUrls
        );
      } else {
        // Single image
        containerParams.image_url = mediaUrls[0];
      }

      const containerResponse = await axios.post(
        `${this.baseUrl}/${instagramAccountId}/media`,
        null,
        { params: containerParams }
      );

      const creationId = containerResponse.data.id;

      // Publish the container
      const publishResponse = await axios.post(
        `${this.baseUrl}/${instagramAccountId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: accessToken,
          },
        }
      );

      logger.info('Successfully published to Instagram', { postId: publishResponse.data.id });

      return {
        id: publishResponse.data.id,
        platform: 'instagram',
        url: `https://instagram.com/p/${publishResponse.data.id}`,
      };
    } catch (error) {
      logger.error('Failed to publish to Instagram', { error: error.message });
      throw new Error(`Instagram publish error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Create carousel children for Instagram
   * @param {string} instagramAccountId - Instagram account ID
   * @param {string} accessToken - Access token
   * @param {Array} mediaUrls - Media URLs
   * @returns {string} - Comma-separated container IDs
   */
  async createCarouselChildren(instagramAccountId, accessToken, mediaUrls) {
    const containerIds = [];

    for (const url of mediaUrls) {
      const mediaType = this.getMediaType(url);
      const params = {
        access_token: accessToken,
        is_carousel_item: true,
      };

      if (mediaType === 'video') {
        params.media_type = 'VIDEO';
        params.video_url = url;
      } else {
        params.image_url = url;
      }

      const response = await axios.post(
        `${this.baseUrl}/${instagramAccountId}/media`,
        null,
        { params }
      );

      containerIds.push(response.data.id);
    }

    return containerIds.join(',');
  }

  /**
   * Get post analytics from Facebook
   * @param {string} postId - Post ID
   * @param {string} accessToken - Access token
   * @returns {Object} - Analytics data
   */
  async getPostAnalytics(postId, accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/${postId}`, {
        params: {
          fields: 'insights.metric(post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total),shares,likes.summary(true),comments.summary(true)',
          access_token: accessToken,
        },
      });

      const data = response.data;
      const insights = data.insights?.data || [];

      return {
        impressions: this.getInsightValue(insights, 'post_impressions'),
        engagement: this.getInsightValue(insights, 'post_engaged_users'),
        clicks: this.getInsightValue(insights, 'post_clicks'),
        reactions: data.likes?.summary?.total_count || 0,
        shares: data.shares?.count || 0,
        comments: data.comments?.summary?.total_count || 0,
      };
    } catch (error) {
      logger.error('Failed to get post analytics', { error: error.message, postId });
      throw error;
    }
  }

  /**
   * Get Instagram post insights
   * @param {string} mediaId - Instagram media ID
   * @param {string} accessToken - Access token
   * @returns {Object} - Insights data
   */
  async getInstagramInsights(mediaId, accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/${mediaId}/insights`, {
        params: {
          metric: 'engagement,impressions,reach,saved',
          access_token: accessToken,
        },
      });

      const insights = response.data.data;
      
      return {
        engagement: this.getInsightValue(insights, 'engagement'),
        impressions: this.getInsightValue(insights, 'impressions'),
        reach: this.getInsightValue(insights, 'reach'),
        saved: this.getInsightValue(insights, 'saved'),
      };
    } catch (error) {
      logger.error('Failed to get Instagram insights', { error: error.message, mediaId });
      throw error;
    }
  }

  /**
   * Helper: Extract insight value
   * @param {Array} insights - Insights array
   * @param {string} name - Metric name
   * @returns {number} - Metric value
   */
  getInsightValue(insights, name) {
    const insight = insights.find(i => i.name === name);
    return insight?.values?.[0]?.value || 0;
  }

  /**
   * Helper: Determine media type from URL
   * @param {string} url - Media URL
   * @returns {string} - Media type
   */
  getMediaType(url) {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm'];
    const urlLower = url.toLowerCase();
    return videoExtensions.some(ext => urlLower.includes(ext)) ? 'video' : 'image';
  }

  /**
   * Helper: Generate random state for OAuth
   * @returns {string} - Random state string
   */
  generateState() {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} - New token data
   */
  async refreshAccessToken(refreshToken) {
    // Facebook tokens don't use traditional refresh tokens
    // This method is for compatibility with other services
    logger.warn('Facebook does not support refresh tokens. Use getLongLivedToken instead.');
    throw new Error('Facebook does not support refresh tokens');
  }
}

module.exports = new FacebookService();
