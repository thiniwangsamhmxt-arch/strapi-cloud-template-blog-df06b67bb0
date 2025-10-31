/**
 * Social Media Account Routes
 */

'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::social-media-account.social-media-account');

const customRoutes = [
  {
    method: 'GET',
    path: '/social-media-accounts/connect/:platform',
    handler: 'social-media-account.connect',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'GET',
    path: '/social-media-accounts/callback/:platform',
    handler: 'social-media-account.callback',
    config: {
      auth: false, // Allow unauthenticated callback
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/social-media-accounts/:id/disconnect',
    handler: 'social-media-account.disconnect',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/social-media-accounts/:id/refresh-token',
    handler: 'social-media-account.refreshToken',
    config: {
      policies: [],
      middlewares: [],
    },
  },
  {
    method: 'POST',
    path: '/social-media-accounts/:id/sync',
    handler: 'social-media-account.sync',
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
