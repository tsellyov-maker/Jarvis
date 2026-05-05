import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../core/logger.mjs';

const execFileAsync = promisify(execFile);

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

class SttService {
  constructor({
    provider = process.env.STT_PROVIDER || 'local',
    localCommand = process.env.STT_LOCAL_COMMAND || '',
    openAiApiKey = process.env.OPENAI_API_KEY || ''
  } = {}) {
    this.provider = provider;
    this.localCommand = localCommand;
    this.openAiApiKey = openAiApiKey;
    this.warnedPlaceholder = false;
  }

  async transcribe(audioPath) {
    if (!audioPath) {
      return '';
    }

    if (this.provider === 'openai') {
      return this.transcribeOpenAi(audioPath);
    }

    return this.transcribeLocal(audioPath);
  }

  async transcribeLocal(audioPath) {
    const sidecarPath = audioPath.replace(/\.[^.]+$/, '.txt');

    try {
      const sidecarText = await readFile(sidecarPath, 'utf8');
      const clean = sidecarText.trim();
      if (clean) {
        logger.info('stt', 'Transcricao local carregada de arquivo sidecar.', { sidecarPath });
        return clean;
      }
    } catch {
      // Sidecar e opcional para testes locais e simulacao.
    }

    if (!this.localCommand) {
      if (!this.warnedPlaceholder) {
        logger.warn('stt', 'STT local esta em modo placeholder. Configure STT_LOCAL_COMMAND ou use sidecar .txt para transcricao.');
        this.warnedPlaceholder = true;
      }
      return '';
    }

    const command = this.localCommand
      .replaceAll('{input}', quoteShell(audioPath))
      .replaceAll('{file}', quoteShell(audioPath));

    try {
      const { stdout } = await execFileAsync('bash', ['-lc', command], {
        timeout: 120000,
        maxBuffer: 1024 * 1024
      });
      return stdout.trim();
    } catch (error) {
      logger.warn('stt', 'Comando local de STT falhou.', error);
      return '';
    }
  }

  async transcribeOpenAi(audioPath) {
    if (!this.openAiApiKey) {
      logger.warn('stt', 'OPENAI_API_KEY ausente; STT openai ignorado.');
      return '';
    }

    try {
      const audio = await readFile(audioPath);
      const form = new FormData();
      form.append('model', 'whisper-1');
      form.append('file', new Blob([audio]), basename(audioPath));

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.openAiApiKey}`
        },
        body: form
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`OpenAI STT respondeu ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return String(data.text || '').trim();
    } catch (error) {
      logger.warn('stt', 'Falha no STT openai.', error);
      return '';
    }
  }
}

export { SttService };
