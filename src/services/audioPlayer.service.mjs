import { spawn, spawnSync } from 'node:child_process';
import { extname } from 'node:path';
import { logger } from '../core/logger.mjs';

function existsInPath(command) {
  const result = spawnSync('which', [command], {
    stdio: 'ignore'
  });

  return result.status === 0;
}

class AudioPlayerService {
  constructor({
    playback = process.env.AUDIO_PLAYBACK !== 'false',
    preferredPlayer = process.env.AUDIO_PLAYER || 'auto'
  } = {}) {
    this.playback = playback;
    this.preferredPlayer = preferredPlayer;
    this.detectedPlayer = null;
  }

  detectPlayer() {
    if (!this.playback) {
      return null;
    }

    if (this.preferredPlayer && this.preferredPlayer !== 'auto') {
      return existsInPath(this.preferredPlayer) ? this.preferredPlayer : null;
    }

    for (const candidate of ['mpv', 'ffplay', 'aplay']) {
      if (existsInPath(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  getPlayer() {
    if (this.detectedPlayer === null) {
      this.detectedPlayer = this.detectPlayer() || false;
      if (this.detectedPlayer) {
        logger.info('audio-player', 'Player de audio detectado.', { player: this.detectedPlayer });
      } else if (this.playback) {
        logger.warn('audio-player', 'Nenhum player de audio encontrado. TTS sera gerado, mas nao tocado.');
      }
    }

    return this.detectedPlayer || null;
  }

  buildArgs(player, audioPath) {
    if (player === 'mpv') {
      return ['--no-terminal', '--really-quiet', audioPath];
    }

    if (player === 'ffplay') {
      return ['-nodisp', '-autoexit', '-loglevel', 'quiet', audioPath];
    }

    if (player === 'aplay') {
      return [audioPath];
    }

    return [audioPath];
  }

  async play(audioPath) {
    if (!audioPath || !this.playback) {
      return { ok: false, skipped: true, player: null };
    }

    const player = this.getPlayer();
    if (!player) {
      return { ok: false, skipped: true, player: null };
    }

    if (player === 'aplay' && extname(audioPath).toLowerCase() === '.mp3') {
      logger.warn('audio-player', 'aplay nao toca MP3 de forma confiavel; audio nao sera reproduzido.', { audioPath });
      return { ok: false, skipped: true, player };
    }

    try {
      const child = spawn(player, this.buildArgs(player, audioPath), {
        stdio: 'ignore',
        detached: true
      });

      child.on('error', (error) => {
        logger.warn('audio-player', 'Falha ao iniciar player.', error);
      });

      child.unref();
      return { ok: true, skipped: false, player };
    } catch (error) {
      logger.warn('audio-player', 'Falha ao tocar audio.', error);
      return { ok: false, skipped: true, player, error: error.message };
    }
  }
}

export { AudioPlayerService, existsInPath };
