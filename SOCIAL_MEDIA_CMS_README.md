# Strapi v5 Social Media Content Management System

## 🚀 Overview

A production-ready, enterprise-grade social media content management system built on Strapi v5. This CMS enables businesses to manage, schedule, and publish content across multiple social platforms from a centralized dashboard.

## ✨ Key Features

### 📱 Multi-Platform Support
- **Facebook**: Posts, photo albums, video uploads
- **Instagram**: Single images, carousels, videos, stories
- **Twitter/X**: Tweets, threads, media uploads
- **LinkedIn**: Personal and organization page posts
- **TikTok**: Video content (ready for integration)
- **YouTube**: Video uploads and management (ready for integration)

### 📊 Content Management
- **Rich Content Editor**: Create and edit posts with rich text formatting
- **Media Library**: Upload and manage images, videos, and files
- **Campaign Organization**: Group posts into marketing campaigns
- **Multi-Platform Targeting**: Publish to multiple platforms simultaneously
- **Platform-Specific Customization**: Customize content for each platform

### ⏰ Scheduling & Automation
- **Scheduled Publishing**: Schedule posts for future publication
- **Auto-Publish**: Automatic publishing at scheduled times
- **Bulk Operations**: Schedule and publish multiple posts at once
- **Queue Management**: BullMQ-powered job queue with Redis
- **Retry Logic**: Automatic retry for failed posts with exponential backoff

### 📈 Analytics & Reporting
- **Real-Time Analytics**: Track engagement metrics across all platforms
- **Performance Metrics**: Likes, shares, comments, views, clicks, reach, impressions
- **Campaign Analytics**: Aggregate performance by campaign
- **Platform Comparison**: Compare performance across platforms
- **Historical Data**: Track performance over time

### 🔐 Security & Authentication
- **OAuth 2.0**: Secure authentication for all platforms
- **Token Encryption**: AES encryption for access tokens at rest
- **Token Refresh**: Automatic token refresh before expiration
- **Secure Storage**: Encrypted storage of sensitive credentials
- **RBAC**: Role-based access control for team members

### 👥 Team Collaboration
- **Approval Workflows**: Multi-level approval process
- **Team Assignments**: Assign team members to campaigns
- **Activity Logs**: Track all changes and actions
- **Notification System**: Email and in-app notifications
- **Draft & Publish**: Draft and publish workflow support

## 📦 Installation

### Prerequisites
- Node.js >= 18.0.0 <=22.x.x
- npm >= 6.0.0
- Redis (for queue management)
- PostgreSQL (recommended for production) or SQLite (development)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd strapi-social-media-cms
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Redis** (required for queue management)
   ```bash
   redis-server
   ```

5. **Start Strapi**
   ```bash
   npm run develop
   ```

6. **Access the admin panel**
   Open http://localhost:1337/admin and create your first admin user

## ⚙️ Configuration

### Environment Variables

#### Core Configuration
```env
HOST=0.0.0.0
PORT=1337
APP_KEYS="your-app-keys-here"
API_TOKEN_SALT=your-token-salt
ADMIN_JWT_SECRET=your-admin-jwt-secret
JWT_SECRET=your-jwt-secret
```

#### Database (PostgreSQL - Production)
```env
DATABASE_CLIENT=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=strapi_social_cms
DATABASE_USERNAME=strapi
DATABASE_PASSWORD=your-password
```

#### Redis (Queue Management)
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

#### Encryption
```env
ENCRYPTION_KEY=your-32-character-encryption-key
```

#### Social Media API Keys

**Facebook/Instagram**
```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_GRAPH_API_VERSION=v18.0
```

**Twitter/X**
```env
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_BEARER_TOKEN=your_bearer_token
```

**LinkedIn**
```env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

**TikTok**
```env
TIKTOK_CLIENT_KEY=your_client_key
TIKTOK_CLIENT_SECRET=your_client_secret
```

**YouTube**
```env
YOUTUBE_CLIENT_ID=your_client_id
YOUTUBE_CLIENT_SECRET=your_client_secret
YOUTUBE_API_KEY=your_api_key
```

## 📚 API Documentation

### Social Media Posts

#### Publish a Post
```http
POST /api/social-media-posts/:id/publish
```

Publishes a post immediately to all connected social media accounts.

**Response:**
```json
{
  "message": "Post published successfully",
  "data": {
    "success": [
      {
        "platform": "facebook",
        "accountName": "My Page",
        "postId": "123456789",
        "url": "https://facebook.com/123456789"
      }
    ],
    "failed": [],
    "platformPostIds": {
      "facebook": "123456789"
    },
    "platformUrls": {
      "facebook": "https://facebook.com/123456789"
    }
  }
}
```

#### Schedule a Post
```http
POST /api/social-media-posts/:id/schedule

Body:
{
  "scheduledPublishDate": "2024-12-31T10:00:00Z",
  "timezone": "America/New_York"
}
```

#### Cancel Scheduled Post
```http
POST /api/social-media-posts/:id/cancel-schedule

Body:
{
  "jobId": "job-id-from-schedule-response"
}
```

#### Get Post Analytics
```http
GET /api/social-media-posts/:id/analytics
```

**Response:**
```json
{
  "data": {
    "likes": 150,
    "shares": 25,
    "comments": 30,
    "views": 5000,
    "clicks": 200,
    "reach": 10000,
    "impressions": 15000,
    "facebook_likes": 75,
    "twitter_likes": 75,
    "lastSyncDate": "2024-01-15T10:30:00Z"
  }
}
```

#### Duplicate a Post
```http
POST /api/social-media-posts/:id/duplicate
```

#### Bulk Publish Posts
```http
POST /api/social-media-posts/bulk-publish

Body:
{
  "postIds": ["post-id-1", "post-id-2", "post-id-3"]
}
```

### Content Types

#### Social Media Post
- **Title**: Internal title for the post
- **Content**: Main content (supports rich text)
- **Short Content**: Shortened version for Twitter (280 chars)
- **Status**: draft, scheduled, publishing, published, failed, archived
- **Platforms**: Platform-specific configurations
- **Scheduled Publish Date**: When to publish
- **Media**: Images, videos, files
- **Hashtags**: Array of hashtags
- **Mentions**: Array of user mentions
- **Social Media Accounts**: Connected accounts
- **Campaign**: Associated campaign
- **Analytics**: Engagement metrics
- **Approval Status**: pending, approved, rejected, needs_revision
- **Priority**: low, normal, high, urgent

#### Social Media Account
- **Name**: Friendly account name
- **Platform**: facebook, instagram, twitter, linkedin, tiktok, youtube
- **Username**: Platform username
- **Access Token**: Encrypted OAuth token
- **Connection Status**: connected, disconnected, expired, error
- **Account Metadata**: Follower count, verification status
- **Rate Limit Info**: API rate limit tracking

#### Campaign
- **Name**: Campaign name
- **Description**: Campaign objectives
- **Status**: draft, active, paused, completed, archived
- **Start/End Date**: Campaign duration
- **Budget**: Campaign budget
- **KPIs**: Target metrics
- **Actual Metrics**: Performance data
- **Posts**: Related posts
- **Team Members**: Assigned team

## 🔧 Architecture

### Service Layer

#### Publishing Service (`src/services/publishing.service.js`)
Orchestrates posting to multiple platforms, handles platform-specific formatting, and manages post status updates.

#### Social Platform Services
- **Facebook Service**: Facebook and Instagram integration
- **Twitter Service**: Twitter/X API v2 integration
- **LinkedIn Service**: LinkedIn personal and organization pages

#### Queue Service (`src/services/queue/queue.service.js`)
BullMQ-based job queue management for:
- Immediate post publishing
- Scheduled post publishing
- Analytics synchronization
- Media processing
- Token refresh

### Utilities

#### Encryption Service (`src/utils/encryption.js`)
AES encryption for secure token storage with helper methods for objects and verification.

#### Logger (`src/utils/logger.js`)
Winston-based logging with daily rotation, component-specific loggers, and multiple transport options.

## 🔐 Security Best Practices

1. **Environment Variables**: Never commit `.env` files
2. **Encryption**: All OAuth tokens are encrypted at rest
3. **Token Refresh**: Implement automatic token refresh logic
4. **Rate Limiting**: Respect platform API rate limits
5. **Input Validation**: Validate all user inputs
6. **CORS**: Configure CORS appropriately for your domain
7. **HTTPS**: Use HTTPS in production
8. **Regular Updates**: Keep dependencies updated

## 📊 Queue Management

The system uses BullMQ with Redis for reliable job processing:

### Queue Types
- **social-post-immediate**: For immediate publishing
- **social-post-scheduled**: For scheduled posts
- **social-analytics-sync**: For fetching analytics
- **social-media-upload**: For large media processing
- **notification-queue**: For user notifications
- **token-refresh**: For refreshing expired tokens

### Queue Features
- Automatic retry with exponential backoff
- Priority-based job processing
- Dead letter queue for failed jobs
- Job progress tracking
- Queue metrics and monitoring

## 🚀 Deployment

### Production Checklist

1. **Database**: Use PostgreSQL in production
2. **Redis**: Set up Redis with persistence
3. **Environment**: Configure all environment variables
4. **Secrets**: Generate secure encryption keys
5. **Platform API Keys**: Set up apps on each platform
6. **Monitoring**: Set up logging and monitoring
7. **Backups**: Configure regular database backups
8. **CDN**: Use CDN for media files
9. **SSL**: Enable HTTPS
10. **Rate Limiting**: Configure API rate limiting

### Docker Deployment (Coming Soon)

```yaml
version: '3'
services:
  strapi:
    image: strapi-social-cms:latest
    environment:
      - DATABASE_CLIENT=postgres
      - DATABASE_HOST=postgres
      - REDIS_HOST=redis
    ports:
      - "1337:1337"
    depends_on:
      - postgres
      - redis
```

## 📝 Development

### Adding a New Platform

1. Create service file in `src/services/social-platforms/`
2. Implement OAuth flow
3. Implement posting methods
4. Implement analytics methods
5. Add platform to enum in content type
6. Update publishing service
7. Add platform configuration

### Custom Workflows

1. Extend lifecycle hooks in content types
2. Create custom policies for approval
3. Add custom middleware for logging
4. Implement webhooks for notifications

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## 📖 Resources

- [Strapi Documentation](https://docs.strapi.io)
- [Facebook Graph API](https://developers.facebook.com/docs/graph-api)
- [Twitter API v2](https://developer.twitter.com/en/docs/twitter-api)
- [LinkedIn API](https://docs.microsoft.com/en-us/linkedin/)
- [BullMQ Documentation](https://docs.bullmq.io/)

## 🤝 Contributing

Contributions are welcome! Please follow the standard GitHub workflow:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

Built with:
- [Strapi v5](https://strapi.io) - Headless CMS
- [BullMQ](https://docs.bullmq.io/) - Job Queue
- [Winston](https://github.com/winstonjs/winston) - Logging
- [Twitter API v2](https://www.npmjs.com/package/twitter-api-v2) - Twitter Integration

## 💬 Support

For issues, questions, or feature requests, please create an issue in the GitHub repository.

---

**Built with ❤️ for the social media management community**
