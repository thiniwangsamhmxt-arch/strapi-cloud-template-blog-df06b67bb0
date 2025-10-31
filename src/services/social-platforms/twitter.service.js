/**
 * Twitter/X Integration Service
 * Handles OAuth 2.0, posting, and analytics for Twitter/X API v2
 */

const { TwitterApi } = require('twitter-api-v2');
const { socialPlatformLogger: logger } = require('../../utils/logger');
const axios = require('axios');

class TwitterService {
  constructor() {
    this.apiKey = process.env.TWITTER_API_KEY;
    this.apiSecret = process.env.TWITTER_API_SECRET;
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
  }

  /**
   * Get OAuth 2.0 authorization URL
   * @param {string} redirectUri - Callback URL
   * @param {Array} scopes - Required scopes
   * @returns {Object} - Authorization URL and code verifier
   */
  async getAuthorizationUrl(redirectUri, scopes = []) {
    try {
      const defaultScopes = [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ];

      const allScopes = [...new Set([...defaultScopes, ...scopes])];
      
      const client = new TwitterApi({
        clientId: this.apiKey,
        clientSecret: this.apiSecret,
      });

      const { url, codeVerifier, state } = client.generateOAuth2AuthLink(redirectUri, {
        scope: allScopes,
      });

      logger.info('Generated Twitter OAuth URL');

      return {
        url,
        codeVerifier,
        state,
      };
    } catch (error) {
      logger.error('Failed to generate Twitter auth URL', { error: error.message });
      throw error;
    }
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @param {string} codeVerifier - Code verifier from authorization
   * @param {string} redirectUri - Callback URL
   * @returns {Object} - Token data
   */
  async getAccessToken(code, codeVerifier, redirectUri) {
    try {
      const client = new TwitterApi({
        clientId: this.apiKey,
        clientSecret: this.apiSecret,
      });

      const {
        client: loggedClient,
        accessToken,
        refreshToken,
        expiresIn,
      } = await client.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri,
      });

      logger.info('Twitter access token obtained successfully');

      return {
        accessToken,
        refreshToken,
        expiresIn,
        client: loggedClient,
      };
    } catch (error) {
      logger.error('Failed to get Twitter access token', { error: error.message });
      throw new Error(`Twitter OAuth error: ${error.message}`);
    }
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} - New token data
   */
  async refreshAccessToken(refreshToken) {
    try {
      const client = new TwitterApi({
        clientId: this.apiKey,
        clientSecret: this.apiSecret,
      });

      const {
        client: refreshedClient,
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn,
      } = await client.refreshOAuth2Token(refreshToken);

      logger.info('Twitter token refreshed successfully');

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn,
        client: refreshedClient,
      };
    } catch (error) {
      logger.error('Failed to refresh Twitter token', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user info
   * @param {string} accessToken - Access token
   * @returns {Object} - User data
   */
  async getUserInfo(accessToken) {
    try {
      const client = new TwitterApi(accessToken);
      const user = await client.v2.me({
        'user.fields': ['id', 'name', 'username', 'profile_image_url', 'public_metrics', 'verified'],
      });

      return {
        id: user.data.id,
        name: user.data.name,
        username: user.data.username,
        profileImage: user.data.profile_image_url,
        metrics: user.data.public_metrics,
        verified: user.data.verified || false,
      };
    } catch (error) {
      logger.error('Failed to get Twitter user info', { error: error.message });
      throw error;
    }
  }

  /**
   * Post a tweet
   * @param {string} accessToken - Access token
   * @param {Object} tweetData - Tweet content and settings
   * @returns {Object} - Posted tweet data
   */
  async postTweet(accessToken, tweetData) {
    try {
      const client = new TwitterApi(accessToken);
      const { text, mediaIds = [], replyToTweetId, quoteTweetId } = tweetData;

      const tweetPayload = { text };

      if (mediaIds.length > 0) {
        tweetPayload.media = { media_ids: mediaIds };
      }

      if (replyToTweetId) {
        tweetPayload.reply = { in_reply_to_tweet_id: replyToTweetId };
      }

      if (quoteTweetId) {
        tweetPayload.quote_tweet_id = quoteTweetId;
      }

      const response = await client.v2.tweet(tweetPayload);

      logger.info('Successfully posted tweet', { tweetId: response.data.id });

      return {
        id: response.data.id,
        text: response.data.text,
        platform: 'twitter',
        url: `https://twitter.com/i/web/status/${response.data.id}`,
      };
    } catch (error) {
      logger.error('Failed to post tweet', { error: error.message });
      throw new Error(`Twitter post error: ${error.message}`);
    }
  }

  /**
   * Post a thread (multiple tweets)
   * @param {string} accessToken - Access token
   * @param {Array} tweets - Array of tweet texts
   * @param {Array} mediaIds - Media IDs for first tweet
   * @returns {Array} - Posted tweets data
   */
  async postThread(accessToken, tweets, mediaIds = []) {
    try {
      const client = new TwitterApi(accessToken);
      const postedTweets = [];
      let previousTweetId = null;

      for (let i = 0; i < tweets.length; i++) {
        const tweetPayload = { text: tweets[i] };

        // Add media only to first tweet
        if (i === 0 && mediaIds.length > 0) {
          tweetPayload.media = { media_ids: mediaIds };
        }

        // Reply to previous tweet (create thread)
        if (previousTweetId) {
          tweetPayload.reply = { in_reply_to_tweet_id: previousTweetId };
        }

        const response = await client.v2.tweet(tweetPayload);
        
        postedTweets.push({
          id: response.data.id,
          text: response.data.text,
          url: `https://twitter.com/i/web/status/${response.data.id}`,
        });

        previousTweetId = response.data.id;

        // Small delay between tweets to avoid rate limiting
        if (i < tweets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info('Successfully posted Twitter thread', { tweetsCount: postedTweets.length });

      return postedTweets;
    } catch (error) {
      logger.error('Failed to post Twitter thread', { error: error.message });
      throw error;
    }
  }

  /**
   * Upload media for tweet
   * @param {string} accessToken - Access token
   * @param {Buffer|string} media - Media buffer or URL
   * @param {string} mimeType - MIME type of media
   * @returns {string} - Media ID
   */
  async uploadMedia(accessToken, media, mimeType) {
    try {
      const client = new TwitterApi(accessToken);
      
      let mediaBuffer = media;
      
      // If media is a URL, download it first
      if (typeof media === 'string' && (media.startsWith('http://') || media.startsWith('https://'))) {
        const response = await axios.get(media, { responseType: 'arraybuffer' });
        mediaBuffer = Buffer.from(response.data);
      }

      const mediaId = await client.v1.uploadMedia(mediaBuffer, { mimeType });

      logger.info('Successfully uploaded media to Twitter', { mediaId });

      return mediaId;
    } catch (error) {
      logger.error('Failed to upload media to Twitter', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete a tweet
   * @param {string} accessToken - Access token
   * @param {string} tweetId - Tweet ID to delete
   * @returns {boolean} - Success status
   */
  async deleteTweet(accessToken, tweetId) {
    try {
      const client = new TwitterApi(accessToken);
      await client.v2.deleteTweet(tweetId);

      logger.info('Successfully deleted tweet', { tweetId });

      return true;
    } catch (error) {
      logger.error('Failed to delete tweet', { error: error.message, tweetId });
      throw error;
    }
  }

  /**
   * Get tweet analytics
   * @param {string} accessToken - Access token
   * @param {string} tweetId - Tweet ID
   * @returns {Object} - Analytics data
   */
  async getTweetAnalytics(accessToken, tweetId) {
    try {
      const client = new TwitterApi(accessToken);
      const tweet = await client.v2.singleTweet(tweetId, {
        'tweet.fields': ['public_metrics', 'non_public_metrics', 'organic_metrics'],
      });

      const metrics = tweet.data.public_metrics || {};
      const nonPublicMetrics = tweet.data.non_public_metrics || {};
      const organicMetrics = tweet.data.organic_metrics || {};

      return {
        likes: metrics.like_count || 0,
        retweets: metrics.retweet_count || 0,
        replies: metrics.reply_count || 0,
        quotes: metrics.quote_count || 0,
        impressions: nonPublicMetrics.impression_count || organicMetrics.impression_count || 0,
        engagements: nonPublicMetrics.user_profile_clicks || organicMetrics.user_profile_clicks || 0,
        urlClicks: nonPublicMetrics.url_link_clicks || organicMetrics.url_link_clicks || 0,
      };
    } catch (error) {
      logger.error('Failed to get tweet analytics', { error: error.message, tweetId });
      throw error;
    }
  }

  /**
   * Get user tweets
   * @param {string} accessToken - Access token
   * @param {string} userId - User ID
   * @param {number} maxResults - Maximum results (default: 10, max: 100)
   * @returns {Array} - Tweets
   */
  async getUserTweets(accessToken, userId, maxResults = 10) {
    try {
      const client = new TwitterApi(accessToken);
      const tweets = await client.v2.userTimeline(userId, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'public_metrics'],
      });

      return tweets.data.data || [];
    } catch (error) {
      logger.error('Failed to get user tweets', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Search tweets
   * @param {string} accessToken - Access token
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results
   * @returns {Array} - Search results
   */
  async searchTweets(accessToken, query, maxResults = 10) {
    try {
      const client = new TwitterApi(accessToken);
      const results = await client.v2.search(query, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
      });

      return results.data.data || [];
    } catch (error) {
      logger.error('Failed to search tweets', { error: error.message, query });
      throw error;
    }
  }

  /**
   * Get rate limit status
   * @param {string} accessToken - Access token
   * @returns {Object} - Rate limit info
   */
  async getRateLimitStatus(accessToken) {
    try {
      const client = new TwitterApi(accessToken);
      const limits = await client.v2.rateLimitStatuses();

      return limits;
    } catch (error) {
      logger.error('Failed to get rate limit status', { error: error.message });
      throw error;
    }
  }

  /**
   * Helper: Split long text into tweet-sized chunks
   * @param {string} text - Long text
   * @param {number} maxLength - Max length per tweet (default: 280)
   * @returns {Array} - Array of tweet texts
   */
  splitIntoTweets(text, maxLength = 280) {
    const tweets = [];
    const words = text.split(' ');
    let currentTweet = '';

    for (const word of words) {
      if ((currentTweet + ' ' + word).trim().length <= maxLength) {
        currentTweet = (currentTweet + ' ' + word).trim();
      } else {
        if (currentTweet) {
          tweets.push(currentTweet);
        }
        currentTweet = word;
      }
    }

    if (currentTweet) {
      tweets.push(currentTweet);
    }

    return tweets;
  }
}

module.exports = new TwitterService();
