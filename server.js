const express = require('express');
const http = require('http');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const { musicQueue, worker } = require('./queue');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedArtwork = ['image/jpeg', 'image/png'];
    const allowedAudio = ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac'];
    const allowedTypes = file.fieldname === 'artwork_file' ? allowedArtwork : allowedAudio;
    callback(null, allowedTypes.includes(file.mimetype));
  }
});

app.use(express.json({ limit: '100kb' }));
app.use('/uploads', (req, res) => res.sendStatus(404));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/artist', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

io.on('connection', () => {
  console.log('[SYSTEM] Admin Dashboard Client Connected.');
});

worker.on('progress', (job, progress) => {
  io.emit('job-progress', { id: job.id, progress });
});

worker.on('completed', (job, returnvalue) => {
  io.emit('job-completed', { id: job.id, ...returnvalue });
});

worker.on('failed', (job, error) => {
  io.emit('job-failed', {
    id: job?.id,
    failedReason: error.message
  });
});

app.post('/api/upload', async (req, res) => {
  try {
    const job = await musicQueue.add('process-track', { trackData: req.body });
    res.status(202).json({
      success: true,
      message: 'Track queued for QC.',
      jobId: job.id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/release-upload', upload.fields([
  { name: 'artwork_file', maxCount: 1 },
  { name: 'audio_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const artwork = req.files?.artwork_file?.[0];
    const audio = req.files?.audio_file?.[0];
    if (!artwork || !audio) {
      return res.status(400).json({ success: false, error: 'Artwork and audio files are required.' });
    }

    const job = await musicQueue.add('process-track', {
      trackData: {
        title: req.body.song_title,
        artist: req.body.primary_artist,
        fileType: audio.mimetype,
        catalogueNumber: req.body.catalogue_number,
        featuredArtists: [
          req.body.featured_artist_1,
          req.body.featured_artist_2,
        ].filter(Boolean),
        secondaryArtists: [
          req.body.secondary_artist_1,
          req.body.secondary_artist_2
        ].filter(Boolean),
        genre: req.body.genre,
        subgenre: req.body.subgenre,
        composer: req.body.composer,
        lyricist: req.body.lyricist,
        clientEmail: req.body.client_email,
        artworkFile: artwork.originalname,
        audioFile: audio.originalname
      }
    });
    res.status(202).json({ success: true, message: 'Release files queued for QC.', jobId: job.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[MKR SYSTEM] Control Center Live at http://localhost:${PORT}`);
});
