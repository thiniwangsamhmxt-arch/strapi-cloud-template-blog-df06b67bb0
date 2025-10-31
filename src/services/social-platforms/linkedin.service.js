/**
 * LinkedIn Integration Service
 * Handles OAuth 2.0, posting, and analytics for LinkedIn API
 */

const axios = require('axios');
const { socialPlatformLogger: logger } = require('../../utils/logger');

class LinkedInService {
  constructor() {
    this.clientId = process.env.LINKEDIN_CLIENT_ID;
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    this.apiVersion = 'v2';
    this.baseUrl = 'https://api.linkedin.com';
  }

  /**
   * Get OAuth authorization URL
   * @param {string} redirectUri - Callback URL
   * @param {Array} scopes - Required permissions
   * @returns {string} - Authorization URL
   */
  getAuthorizationUrl(redirectUri, scopes = []) {
    const defaultScopes = [
      'r_liteprofile',
      'r_emailaddress',
      'w_member_social',
      'r_organization_social',
      'w_organization_social',
    ];

    const allScopes = [...new Set([...defaultScopes, ...scopes])];
    const state = this.generateState();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: allScopes.join(' '),
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @param {string} redirectUri - Callback URL
   * @returns {Object} - Token data
   */
  async getAccessToken(code, redirectUri) {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      logger.info('LinkedIn access token obtained successfully');

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      logger.error('Failed to get LinkedIn access token', { error: error.message });
      throw new Error(`LinkedIn OAuth error: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Get user profile
   * @param {string} accessToken - Access token
   * @returns {Object} - User profile data
   */
  async getUserProfile(accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/v2/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return {
        id: response.data.id,
        firstName: response.data.localizedFirstName,
        lastName: response.data.localizedLastName,
      };
    } catch (error) {
      logger.error('Failed to get LinkedIn user profile', { error: error.message });
      throw error;
    }
  }

  /**
   * Share content on LinkedIn (Personal Profile)
   * @param {string} accessToken - Access token
   * @param {string} userId - LinkedIn user ID
   * @param {Object} postData - Post content
   * @returns {Object} - Posted content data
   */
  async shareContent(accessToken, userId, postData) {
    try {
      const { text, title, description, url, mediaUrls = [] } = postData;

      const payload = {
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text,
            },
            shareMediaCategory: mediaUrls.length > 0 ? 'IMAGE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      // Add media if provided
      if (mediaUrls.length > 0) {
        payload.specificContent['com.linkedin.ugc.ShareContent'].media = mediaUrls.map(url => ({
          status: 'READY',
          originalUrl: url,
        }));
      }

      // Add article if URL provided
      if (url) {
        payload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
        payload.specificContent['com.linkedin.ugc.ShareContent'].media = [
          {
            status: 'READY',
            description: { text: description || '' },
            originalUrl: url,
            title: { text: title || '' },
          },
        ];
      }

      const response = await axios.post(`${this.baseUrl}/v2/ugcPosts`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      logger.info('Successfully posted to LinkedIn', { postId: response.data.id });

      return {
        id: response.data.id,
        platform: 'linkedin',
      };
    } catch (error) {
      logger.error('Failed to post to LinkedIn', { error: error.message });
      throw new Error(`LinkedIn post error: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Share content on LinkedIn Organization Page
   * @param {string} accessToken - Access token
   * @param {string} organizationId - LinkedIn organization ID
   * @param {Object} postData - Post content
   * @returns {Object} - Posted content data
   */
  async shareOrganizationContent(accessToken, organizationId, postData) {
    try {
      const { text, title, description, url, mediaUrls = [] } = postData;

      const payload = {
        author: `urn:li:organization:${organizationId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text,
            },
            shareMediaCategory: mediaUrls.length > 0 ? 'IMAGE' : url ? 'ARTICLE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      // Add media if provided
      if (mediaUrls.length > 0) {
        payload.specificContent['com.linkedin.ugc.ShareContent'].media = mediaUrls.map(mediaUrl => ({
          status: 'READY',
          originalUrl: mediaUrl,
        }));
      }

      // Add article if URL provided
      if (url) {
        payload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
        payload.specificContent['com.linkedin.ugc.ShareContent'].media = [
          {
            status: 'READY',
            description: { text: description || '' },
            originalUrl: url,
            title: { text: title || '' },
          },
        ];
      }

      const response = await axios.post(`${this.baseUrl}/v2/ugcPosts`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      logger.info('Successfully posted to LinkedIn organization page', { postId: response.data.id });

      return {
        id: response.data.id,
        platform: 'linkedin',
      };
    } catch (error) {
      logger.error('Failed to post to LinkedIn organization', { error: error.message });
      throw new Error(`LinkedIn organization post error: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get post statistics
   * @param {string} accessToken - Access token
   * @param {string} postUrn - Post URN
   * @returns {Object} - Post statistics
   */
  async getPostStatistics(accessToken, postUrn) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v2/socialActions/${encodeURIComponent(postUrn)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      return {
        likes: response.data.likesSummary?.totalLikes || 0,
        comments: response.data.commentsSummary?.totalComments || 0,
        shares: response.data.sharesSummary?.totalShares || 0,
      };
    } catch (error) {
      logger.error('Failed to get LinkedIn post statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Helper: Generate random state for OAuth
   * @returns {string} - Random state string
   */
  generateState() {
    return Math.random().toString(36).substring(2, 15);
  }
}

module.exports = new LinkedInService();
