const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null
});

const queueName = 'music-validation-queue';
const musicQueue = new Queue(queueName, { connection });

const worker = new Worker(queueName, async (job) => {
  const { trackData } = job.data;
  const currentYear = new Date().getFullYear();

  trackData.pLine = `℗ ${currentYear} Maa Kantabausuni Records`;
  trackData.cLine = `© ${currentYear} Maa Kantabausuni Records`;
  trackData.publisher = 'Maa Kantabausuni Records Pvt Ltd';
  await job.updateProgress(25);

  const validFormats = ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac'];
  if (!validFormats.includes(trackData.fileType)) {
    throw new Error('Invalid Audio Format: DSPs strictly require WAV or FLAC.');
  }
  await job.updateProgress(50);

  if (!trackData.title || !trackData.artist) {
    throw new Error('Incomplete Metadata: Song Title and Primary Artist are mandatory.');
  }
  await job.updateProgress(75);

  await job.updateProgress(100);

  return {
    status: 'PASSED_PENDING_APPROVAL',
    trackData
  };
}, { connection });

module.exports = { musicQueue, worker };
