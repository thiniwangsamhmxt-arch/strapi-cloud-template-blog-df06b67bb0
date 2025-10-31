/**
 * Social Media Post Routes
 */

'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::social-media-post.social-media-post');

const customRoutes = [
  {
    method: 'POST',
    path: '/social-media-posts/:id/publish',
    handler: 'social-media-post.publish',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/social-media-posts/:id/schedule',
    handler: 'social-media-post.schedule',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/social-media-posts/:id/cancel-schedule',
    handler: 'social-media-post.cancelSchedule',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'GET',
    path: '/social-media-posts/:id/analytics',
    handler: 'social-media-post.analytics',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/social-media-posts/:id/duplicate',
    handler: 'social-media-post.duplicate',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/social-media-posts/bulk-publish',
    handler: 'social-media-post.bulkPublish',
    config: {
      policies: [],
      middlewares: [],
    },
  },
];

module.exports = {
  routes: [
    ...defaultRouter.routes,
    ...customRoutes,
  ],
};
