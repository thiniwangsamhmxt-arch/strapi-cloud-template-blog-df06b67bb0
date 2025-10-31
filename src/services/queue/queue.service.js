/**
 * Queue Service using BullMQ
 * Manages job queues for scheduled posting, analytics sync, and other async tasks
 */

const { Queue, Worker, QueueScheduler } = require('bullmq');
const IORedis = require('ioredis');
const { queueLogger: logger } = require('../../utils/logger');

class QueueService {
  constructor() {
    // Redis connection configuration
    this.redisConnection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Initialize queues
    this.queues = {};
    this.workers = {};
    this.schedulers = {};

    this.initializeQueues();
  }

  /**
   * Initialize all queues
   */
  initializeQueues() {
    const queueNames = [
      'social-post-immediate',    // For immediate posts
      'social-post-scheduled',    // For scheduled posts
      'social-analytics-sync',    // For analytics fetching
      'social-media-upload',      // For large media processing
      'notification-queue',       // For user notifications
      'token-refresh',            // For refreshing expired tokens
    ];

    queueNames.forEach(name => {
      this.createQueue(name);
    });

    logger.info(`Initialized ${queueNames.length} queues`);
  }

  /**
   * Create a queue
   * @param {string} name - Queue name
   * @returns {Queue} - Queue instance
   */
  createQueue(name) {
    if (this.queues[name]) {
      return this.queues[name];
    }

    const queue = new Queue(name, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 seconds initial delay
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    // Create scheduler for delayed jobs
    const scheduler = new QueueScheduler(name, {
      connection: this.redisConnection,
    });

    this.queues[name] = queue;
    this.schedulers[name] = scheduler;

    logger.info(`Created queue: ${name}`);

    return queue;
  }

  /**
   * Add job to queue
   * @param {string} queueName - Queue name
   * @param {Object} data - Job data
   * @param {Object} options - Job options
   * @returns {Job} - Job instance
   */
  async addJob(queueName, data, options = {}) {
    try {
      const queue = this.queues[queueName] || this.createQueue(queueName);
      
      const job = await queue.add(data.type || 'default', data, {
        ...options,
        attempts: options.attempts || 3,
        priority: options.priority || 5,
      });

      logger.info(`Job added to ${queueName}`, { 
        jobId: job.id,
        type: data.type,
      });

      return job;
    } catch (error) {
      logger.error(`Failed to add job to ${queueName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Add scheduled job
   * @param {string} queueName - Queue name
   * @param {Object} data - Job data
   * @param {Date|number} scheduledTime - When to execute (Date or timestamp)
   * @param {Object} options - Job options
   * @returns {Job} - Job instance
   */
  async addScheduledJob(queueName, data, scheduledTime, options = {}) {
    try {
      const delay = scheduledTime instanceof Date 
        ? scheduledTime.getTime() - Date.now()
        : scheduledTime - Date.now();

      if (delay < 0) {
        throw new Error('Scheduled time must be in the future');
      }

      const job = await this.addJob(queueName, data, {
        ...options,
        delay,
      });

      logger.info(`Scheduled job added to ${queueName}`, {
        jobId: job.id,
        scheduledTime: new Date(Date.now() + delay).toISOString(),
      });

      return job;
    } catch (error) {
      logger.error(`Failed to add scheduled job to ${queueName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Add recurring job (cron-like)
   * @param {string} queueName - Queue name
   * @param {Object} data - Job data
   * @param {Object} repeatOptions - Repeat options (cron pattern or interval)
   * @returns {Job} - Job instance
   */
  async addRecurringJob(queueName, data, repeatOptions) {
    try {
      const queue = this.queues[queueName] || this.createQueue(queueName);
      
      const job = await queue.add(data.type || 'recurring', data, {
        repeat: repeatOptions,
      });

      logger.info(`Recurring job added to ${queueName}`, {
        jobId: job.id,
        repeat: repeatOptions,
      });

      return job;
    } catch (error) {
      logger.error(`Failed to add recurring job to ${queueName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Create a worker to process jobs
   * @param {string} queueName - Queue name
   * @param {Function} processor - Job processor function
   * @param {Object} options - Worker options
   * @returns {Worker} - Worker instance
   */
  createWorker(queueName, processor, options = {}) {
    if (this.workers[queueName]) {
      logger.warn(`Worker for ${queueName} already exists`);
      return this.workers[queueName];
    }

    const worker = new Worker(queueName, processor, {
      connection: this.redisConnection,
      concurrency: options.concurrency || 5,
      limiter: options.limiter || {
        max: 10, // Max 10 jobs
        duration: 1000, // per 1 second
      },
    });

    // Worker event handlers
    worker.on('completed', (job) => {
      logger.info(`Job completed in ${queueName}`, {
        jobId: job.id,
        returnValue: job.returnvalue,
      });
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job failed in ${queueName}`, {
        jobId: job?.id,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`Job stalled in ${queueName}`, { jobId });
    });

    this.workers[queueName] = worker;

    logger.info(`Worker created for queue: ${queueName}`);

    return worker;
  }

  /**
   * Get job by ID
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Job|null} - Job instance
   */
  async getJob(queueName, jobId) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      return await queue.getJob(jobId);
    } catch (error) {
      logger.error(`Failed to get job from ${queueName}`, { error: error.message, jobId });
      return null;
    }
  }

  /**
   * Get queue statistics
   * @param {string} queueName - Queue name
   * @returns {Object} - Queue stats
   */
  async getQueueStats(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      logger.error(`Failed to get stats for ${queueName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Pause queue
   * @param {string} queueName - Queue name
   */
  async pauseQueue(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      await queue.pause();
      logger.info(`Queue paused: ${queueName}`);
    } catch (error) {
      logger.error(`Failed to pause queue ${queueName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Resume queue
   * @param {string} queueName - Queue name
   */
  async resumeQueue(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      await queue.resume();
      logger.info(`Queue resumed: ${queueName}`);
    } catch (error) {
      logger.error(`Failed to resume queue ${queueName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Remove job from queue
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   */
  async removeJob(queueName, jobId) {
    try {
      const job = await this.getJob(queueName, jobId);
      if (job) {
        await job.remove();
        logger.info(`Job removed from ${queueName}`, { jobId });
      }
    } catch (error) {
      logger.error(`Failed to remove job from ${queueName}`, { error: error.message, jobId });
      throw error;
    }
  }

  /**
   * Retry failed job
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   */
  async retryJob(queueName, jobId) {
    try {
      const job = await this.getJob(queueName, jobId);
      if (job) {
        await job.retry();
        logger.info(`Job retry initiated for ${queueName}`, { jobId });
      }
    } catch (error) {
      logger.error(`Failed to retry job in ${queueName}`, { error: error.message, jobId });
      throw error;
    }
  }

  /**
   * Clean old jobs from queue
   * @param {string} queueName - Queue name
   * @param {number} grace - Grace period in milliseconds
   * @param {string} status - Job status to clean (completed, failed, etc.)
   */
  async cleanQueue(queueName, grace = 24 * 3600 * 1000, status = 'completed') {
    try {
      const queue = this.queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const removed = await queue.clean(grace, 1000, status);
      logger.info(`Cleaned ${removed.length} ${status} jobs from ${queueName}`);

      return removed;
    } catch (error) {
      logger.error(`Failed to clean queue ${queueName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Close all queues and workers
   */
  async closeAll() {
    try {
      const closePromises = [];

      // Close all workers
      Object.values(this.workers).forEach(worker => {
        closePromises.push(worker.close());
      });

      // Close all schedulers
      Object.values(this.schedulers).forEach(scheduler => {
        closePromises.push(scheduler.close());
      });

      // Close all queues
      Object.values(this.queues).forEach(queue => {
        closePromises.push(queue.close());
      });

      await Promise.all(closePromises);

      // Close Redis connection
      await this.redisConnection.quit();

      logger.info('All queues, workers, and schedulers closed');
    } catch (error) {
      logger.error('Failed to close queues', { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new QueueService();
