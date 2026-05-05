import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { existsInPath } from './audioPlayer.service.mjs';
import { logger } from '../core/logger.mjs';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

class MicrophoneService {
  constructor({
    recordCommand = process.env.MIC_RECORD_COMMAND || '',
    inputDir = join(srcDir, 'audio', 'input')
  } = {}) {
    this.disabled = ['false', 'off', 'none', 'disabled'].includes(String(recordCommand).trim().toLowerCase());
    this.recordCommand = this.disabled ? '' : recordCommand;
    this.inputDir = inputDir;
    this.detectedCommand = null;
    this.warnedUnavailable = false;
  }

  detectDefaultCommand() {
    if (this.disabled) {
      return '';
    }

    if (this.recordCommand) {
      return this.recordCommand;
    }

    if (existsInPath('rec')) {
      return 'rec -q -r 16000 -c 1 -b 16 {output} trim 0 {duration}';
    }

    if (existsInPath('arecord')) {
      return 'arecord -q -f S16_LE -r 16000 -c 1 -d {duration} {output}';
    }

    if (existsInPath('ffmpeg')) {
      return 'ffmpeg -hide_banner -loglevel error -f alsa -i default -t {duration} -ac 1 -ar 16000 -y {output}';
    }

    return '';
  }

  getCommand() {
    if (this.detectedCommand === null) {
      this.detectedCommand = this.detectDefaultCommand();
      if (this.detectedCommand) {
        logger.info('microphone', 'Comando de gravacao configurado.', {
          command: this.recordCommand ? 'env' : this.detectedCommand.split(' ')[0]
        });
      }
    }

    return this.detectedCommand;
  }

  isAvailable() {
    return Boolean(this.getCommand());
  }

  buildCommand(template, outputPath, durationSeconds) {
    if (template.includes('{output}') || template.includes('{duration}')) {
      return template
        .replaceAll('{output}', quoteShell(outputPath))
        .replaceAll('{file}', quoteShell(outputPath))
        .replaceAll('{duration}', String(durationSeconds));
    }

    return `${template} ${quoteShell(outputPath)}`;
  }

  async record({ durationSeconds = 5, prefix = 'input' } = {}) {
    const commandTemplate = this.getCommand();
    if (!commandTemplate) {
      if (!this.warnedUnavailable) {
        logger.warn('microphone', 'Nenhum gravador local encontrado. Instale sox/arecord/ffmpeg ou configure MIC_RECORD_COMMAND.');
        this.warnedUnavailable = true;
      }
      return null;
    }

    await mkdir(this.inputDir, { recursive: true });
    const stamp = DateTime.now().toFormat('yyyyLLdd-HHmmss-SSS');
    const outputPath = join(this.inputDir, `${prefix}-${stamp}.wav`);
    const command = this.buildCommand(commandTemplate, outputPath, durationSeconds);

    return new Promise((resolve) => {
      logger.info('microphone', 'Gravando audio.', { durationSeconds, outputPath });
      const child = spawn('bash', ['-lc', command], {
        stdio: 'ignore'
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        logger.warn('microphone', 'Gravacao excedeu o tempo limite e foi encerrada.', { outputPath });
        resolve(null);
      }, (durationSeconds + 8) * 1000);

      child.on('error', (error) => {
        clearTimeout(timeout);
        logger.warn('microphone', 'Falha ao iniciar gravacao.', error);
        resolve(null);
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(outputPath);
          return;
        }

        logger.warn('microphone', 'Comando de gravacao terminou com erro.', { code, outputPath });
        resolve(null);
      });
    });
  }
}

export { MicrophoneService };
