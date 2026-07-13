const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { mkdir, mkdtemp, rm, stat } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { config } = require('../dist/config');
const { IngestionService } = require('../dist/ingestion/ingestion.service');
const { ManifestService } = require('../dist/ingestion/manifest.service');
const { MediaPolicyService } = require('../dist/ingestion/media-policy.service');
const { NormalizerService, workingProfile } = require('../dist/ingestion/normalizer.service');
const { NoopUploadScanner } = require('../dist/ingestion/upload-scanner.service');
const { ProbeService, parseProbeDocument } = require('../dist/ingestion/probe.service');
const { ProcessRunnerService } = require('../dist/ingestion/process-runner.service');
const { QualityService } = require('../dist/ingestion/quality.service');
const { IngestionStorageService } = require('../dist/ingestion/storage.service');
const { SongBriefService } = require('../dist/songs/song-brief.service');

function ffmpeg(args) {
  try {
    execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', ...args]);
  } catch (error) {
    // Some restricted CI sandboxes report EPERM while FFmpeg still exits 0 and writes the fixture.
    if (error.status !== 0) throw error;
  }
}

function multerFile(filePath, originalname, mimetype) {
  const size = require('node:fs').statSync(filePath).size;
  return { fieldname: 'media', originalname, encoding: '7bit', mimetype, size, path: filePath, filename: path.basename(filePath), destination: path.dirname(filePath) };
}

function services() {
  const runner = new ProcessRunnerService();
  const probe = new ProbeService(runner);
  const storage = new IngestionStorageService();
  const records = [];
  const artifacts = {
    createArtifactVersion: async (input) => {
      const record = { ...input, id: input.id, objectKey: `test/${input.id}/${input.fileName}`, mimeType: input.mimeType };
      records.push(record);
      return record;
    },
    markAvailable: async () => undefined,
    markFailed: async () => undefined,
  };
  const objects = { putFile: async () => undefined };
  return {
    probe,
    storage,
    ingestion: new IngestionService(
      new MediaPolicyService(),
      new NoopUploadScanner(),
      probe,
      storage,
      new NormalizerService(runner, probe),
      new QualityService(runner),
      new ManifestService(storage),
      artifacts,
      objects,
    ),
    records,
  };
}

test('parseProbeDocument normalizes numeric fields and stream metadata', () => {
  const parsed = parseProbeDocument({
    streams: [{ index: 2, codec_type: 'audio', codec_name: 'flac', sample_rate: '48000', channels: 2, duration: '3.5', tags: { language: 'eng', ignored: 4 } }],
    format: { format_name: 'flac', duration: '3.5', bit_rate: '900000' },
  });
  assert.equal(parsed.durationSeconds, 3.5);
  assert.equal(parsed.audioStreams[0].sampleRate, 48000);
  assert.deepEqual(parsed.audioStreams[0].tags, { language: 'eng' });
});

test('working profile uses stereo for mixtures and mono for voice', () => {
  assert.deepEqual({ rate: workingProfile('mixture').sampleRate, channels: workingProfile('mixture').channels }, { rate: 48000, channels: 2 });
  assert.deepEqual({ rate: workingProfile('voice').sampleRate, channels: workingProfile('voice').channels }, { rate: 48000, channels: 1 });
});

test('media policy rejects unsupported extensions before process execution', () => {
  const policy = new MediaPolicyService();
  assert.throws(
    () => policy.validateUpload({ path: '/tmp/input.exe', size: 4, originalname: 'input.exe', mimetype: 'application/octet-stream' }),
    (error) => error.code === 'UNSUPPORTED_EXTENSION',
  );
});

test('media policy enforces upload size and detected media kind', () => {
  const policy = new MediaPolicyService();
  const previousLimit = config.maxUploadBytes;
  config.maxUploadBytes = 3;
  assert.throws(
    () => policy.validateUpload({ path: '/tmp/input.wav', size: 4, originalname: 'input.wav', mimetype: 'audio/wav' }),
    (error) => error.code === 'UPLOAD_TOO_LARGE' && error.status === 413,
  );
  config.maxUploadBytes = previousLimit;
  assert.throws(
    () => policy.validateProbe(
      { mimetype: 'audio/mp4' },
      { formatNames: ['mov', 'mp4'], durationSeconds: 1, streamCount: 2, audioStreams: [{ index: 1, codec: 'aac', tags: {} }], videoStreamCount: 1, tags: {} },
    ),
    (error) => error.code === 'MEDIA_TYPE_MISMATCH',
  );
});

test('song brief validation accepts source lyrics and rejects non-text input', () => {
  const briefs = new SongBriefService();
  assert.equal(briefs.create({ idea: 'A clear idea', lyrics: 'First line' }, false).source_lyrics, 'First line');
  assert.throws(() => briefs.create({ idea: 42 }, false), /must be a string/);
});

test('FFprobe and policy accept the supported audio format matrix', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aria-formats-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixtures = [
    ['tone.mp3', 'audio/mpeg', ['-c:a', 'libmp3lame', '-f', 'mp3']],
    ['tone.flac', 'audio/flac', ['-c:a', 'flac', '-f', 'flac']],
    ['tone.aac', 'audio/aac', ['-c:a', 'aac', '-f', 'adts']],
    ['tone.m4a', 'audio/mp4', ['-c:a', 'aac', '-f', 'mp4']],
    ['tone.ogg', 'audio/ogg', ['-c:a', 'libvorbis', '-f', 'ogg']],
  ];
  const { probe } = services();
  const policy = new MediaPolicyService();
  for (const [name, mimetype, outputArgs] of fixtures) {
    const fixture = path.join(root, name);
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.3', ...outputArgs, fixture]);
    const file = multerFile(fixture, name, mimetype);
    policy.validateUpload(file);
    const accepted = policy.validateProbe(file, await probe.inspect(fixture));
    assert.equal(accepted.kind, 'audio', name);
  }
});

test('FFprobe and policy accept MOV, WebM, and MKV audio/video containers', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aria-video-formats-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixtures = [
    ['reference.mov', 'video/quicktime', ['-c:v', 'libx264', '-c:a', 'aac', '-f', 'mov']],
    ['reference.webm', 'video/webm', ['-c:v', 'libvpx-vp9', '-c:a', 'libopus', '-f', 'webm']],
    ['reference.mkv', 'video/x-matroska', ['-c:v', 'libx264', '-c:a', 'aac', '-f', 'matroska']],
  ];
  const { probe } = services();
  const policy = new MediaPolicyService();
  for (const [name, mimetype, outputArgs] of fixtures) {
    const fixture = path.join(root, name);
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=green:s=64x64:d=0.3', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.3', '-shortest', ...outputArgs, fixture]);
    const file = multerFile(fixture, name, mimetype);
    policy.validateUpload(file);
    assert.equal(policy.validateProbe(file, await probe.inspect(fixture)).kind, 'video', name);
  }
});

test('ingestion preserves source provenance and produces a verified working WAV', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aria-ingestion-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  config.storageDir = path.join(root, 'storage');
  config.tempDir = path.join(root, 'temp');
  await Promise.all([mkdir(config.storageDir, { recursive: true }), mkdir(config.tempDir, { recursive: true })]);
  const upload = path.join(config.tempDir, 'fixture.upload');
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'pcm_s16le', '-f', 'wav', upload]);
  const original = readFileSync(upload);
  const projectId = randomUUID();
  const { ingestion, probe } = services();

  const result = await ingestion.ingest(projectId, multerFile(upload, '../unsafe-name.wav', 'audio/wav'), 'mixture');
  assert.equal(result.manifest.originalDisplayName, 'unsafe-name.wav');
  assert.equal(result.manifest.source.sha256, createHash('sha256').update(original).digest('hex'));
  assert.equal(result.manifest.derived.length, 1);
  assert.equal(result.manifest.source.ref, `artifact:${result.manifest.source.id}`);
  assert.equal(existsSync(upload), false);

  const working = result.manifest.derived.find((artifact) => artifact.role === 'working');
  assert.deepEqual({ rate: working.profile.sampleRate, channels: working.profile.channels, codec: working.profile.codec }, { rate: 48000, channels: 2, codec: 'pcm_s24le' });
  const workingPath = path.join(config.storageDir, 'projects', projectId, 'normalized-audio', `${working.id}.working.wav`);
  const workingProbe = await probe.inspect(workingPath);
  assert.equal(workingProbe.audioStreams[0].sampleRate, 48000);
  assert.equal(workingProbe.audioStreams[0].channels, 2);
  assert.equal(workingProbe.audioStreams[0].codec, 'pcm_s24le');

  const manifestPath = path.join(config.storageDir, 'projects', projectId, 'analysis', `input-manifest-${result.inputId}.json`);
  assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).schemaVersion, '1.0.0');
  const publicResult = ingestion.publicResult(result);
  assert.equal(publicResult.manifest.tools, undefined);
  assert.equal(JSON.stringify(publicResult).includes(config.storageDir), false);
});

test('video audio is extracted and no-audio video is rejected without retaining the upload', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aria-video-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  config.storageDir = path.join(root, 'storage');
  config.tempDir = path.join(root, 'temp');
  await Promise.all([mkdir(config.storageDir, { recursive: true }), mkdir(config.tempDir, { recursive: true })]);
  const video = path.join(config.tempDir, 'video.upload');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-f', 'mp4', video]);
  const { ingestion } = services();
  const accepted = await ingestion.ingest(randomUUID(), multerFile(video, 'reference.mp4', 'video/mp4'), 'mixture');
  assert.equal(accepted.manifest.kind, 'video');

  const noAudio = path.join(config.tempDir, 'no-audio.upload');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', '-c:v', 'libx264', '-an', '-f', 'mp4', noAudio]);
  await assert.rejects(
    () => ingestion.ingest(randomUUID(), multerFile(noAudio, 'silent-video.mp4', 'video/mp4'), 'mixture'),
    (error) => error.code === 'NO_AUDIO_STREAM',
  );
  assert.equal(existsSync(noAudio), false);
});

test('silence-only and malformed files are rejected and cleaned up', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aria-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  config.storageDir = path.join(root, 'storage');
  config.tempDir = path.join(root, 'temp');
  await Promise.all([mkdir(config.storageDir, { recursive: true }), mkdir(config.tempDir, { recursive: true })]);
  const { ingestion } = services();

  const silence = path.join(config.tempDir, 'silence.upload');
  ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '1', '-c:a', 'pcm_s16le', '-f', 'wav', silence]);
  const silenceProject = randomUUID();
  await assert.rejects(
    () => ingestion.ingest(silenceProject, multerFile(silence, 'silence.wav', 'audio/wav'), 'voice'),
    (error) => error.code === 'SILENCE_ONLY',
  );
  assert.equal(existsSync(silence), false);
  assert.equal(existsSync(path.join(config.storageDir, 'projects', silenceProject, 'source-media')), true);
  assert.equal((await require('node:fs/promises').readdir(path.join(config.storageDir, 'projects', silenceProject, 'source-media'))).length, 0);

  const malformed = path.join(config.tempDir, 'malformed.upload');
  writeFileSync(malformed, 'not media');
  await assert.rejects(
    () => ingestion.ingest(randomUUID(), multerFile(malformed, 'broken.wav', 'audio/wav'), 'mixture'),
    (error) => error.code === 'MEDIA_PROCESS_FAILED',
  );
  assert.equal(existsSync(malformed), false);
});

test('excessively clipped media is rejected by quality policy', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aria-clipped-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  config.storageDir = path.join(root, 'storage');
  config.tempDir = path.join(root, 'temp');
  await Promise.all([mkdir(config.storageDir, { recursive: true }), mkdir(config.tempDir, { recursive: true })]);
  const clipped = path.join(config.tempDir, 'clipped.upload');
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-af', 'volume=40', '-c:a', 'pcm_s16le', '-f', 'wav', clipped]);
  const { ingestion } = services();
  await assert.rejects(
    () => ingestion.ingest(randomUUID(), multerFile(clipped, 'clipped.wav', 'audio/wav'), 'voice'),
    (error) => error.code === 'EXCESSIVE_CLIPPING',
  );
  assert.equal(existsSync(clipped), false);
});
