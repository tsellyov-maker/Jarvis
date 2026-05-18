import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { logger } from '../core/logger.mjs';

const execFileAsync = promisify(execFile);
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function defaultAudioOutputDir() {
  const audioDir = process.env.AUDIO_DIR || join(srcDir, 'audio');
  return join(audioDir, 'output');
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

class LocalTtsService {
  constructor({
    provider = process.env.TTS_LOCAL_FALLBACK || 'piper',
    piperCommand = process.env.PIPER_COMMAND || '',
    outputDir = process.env.AUDIO_OUTPUT_DIR || defaultAudioOutputDir(),
    timeoutMs = Number(process.env.PIPER_TIMEOUT_MS || 30000)
  } = {}) {
    this.provider = provider;
    this.piperCommand = piperCommand;
    this.outputDir = outputDir;
    this.timeoutMs = timeoutMs;
    this.warnedMissingCommand = false;
  }

  get configured() {
    return this.provider === 'piper' && Boolean(this.piperCommand);
  }

  getStatus() {
    return {
      provider: this.provider,
      configured: this.configured,
      timeoutMs: this.timeoutMs
    };
  }

  async generate(text) {
    if (this.provider === 'disabled' || this.provider === 'none') {
      return null;
    }

    if (this.provider !== 'piper') {
      logger.warn('local-tts', 'Fallback TTS local desconhecido.', { provider: this.provider });
      return null;
    }

    return this.generateWithPiper(text);
  }

  async generateWithPiper(text) {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return null;
    }

    if (!this.piperCommand) {
      if (!this.warnedMissingCommand) {
        logger.warn('local-tts', 'Piper fallback preparado, mas PIPER_COMMAND nao esta configurado.');
        this.warnedMissingCommand = true;
      }
      return null;
    }

    await mkdir(this.outputDir, { recursive: true });
    const stamp = DateTime.now().toFormat('yyyyLLdd-HHmmss-SSS');
    const audioPath = join(this.outputDir, `jarvis-local-${stamp}.wav`);
    const command = this.piperCommand
      .replaceAll('{text}', quoteShell(cleanText))
      .replaceAll('{output}', quoteShell(audioPath))
      .replaceAll('{file}', quoteShell(audioPath));

    try {
      await execFileAsync('bash', ['-lc', command], {
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024
      });
      logger.info('local-tts', 'Audio local gerado via Piper.', { audioPath });
      return audioPath;
    } catch (error) {
      logger.warn('local-tts', 'Falha no fallback local/Piper; resposta ficara em texto.', error);
      return null;
    }
  }
}

export { LocalTtsService };
