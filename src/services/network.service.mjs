import { logger } from '../core/logger.mjs';

class NetworkService {
  constructor({
    mode = process.env.OFFLINE_MODE || 'auto',
    checkUrl = process.env.INTERNET_CHECK_URL || 'https://www.gstatic.com/generate_204',
    checkIntervalMs = Number(process.env.INTERNET_CHECK_INTERVAL_MS || 60000),
    timeoutMs = Number(process.env.INTERNET_CHECK_TIMEOUT_MS || 2500)
  } = {}) {
    this.mode = ['auto', 'always', 'never'].includes(mode) ? mode : 'auto';
    this.checkUrl = checkUrl;
    this.checkIntervalMs = checkIntervalMs;
    this.timeoutMs = timeoutMs;
    this.timer = null;
    this.internetOnline = null;
    this.lastCheckAt = null;
    this.lastError = null;
    this.checking = false;
  }

  async start() {
    if (this.mode !== 'auto') {
      logger.info('network', 'Modo offline configurado manualmente.', { mode: this.mode });
      return;
    }

    await this.checkNow();
    this.timer = setInterval(() => {
      this.checkNow();
    }, this.checkIntervalMs);
    this.timer.unref?.();
    logger.info('network', 'Monitor de conectividade iniciado.', {
      checkUrl: this.checkUrl,
      checkIntervalMs: this.checkIntervalMs
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkNow() {
    if (this.checking || this.mode !== 'auto') {
      return this.getStatus();
    }

    this.checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.checkUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal
      });
      this.internetOnline = response.ok || response.status === 204 || response.status === 405;
      this.lastError = this.internetOnline ? null : `HTTP ${response.status}`;
    } catch (error) {
      this.internetOnline = false;
      this.lastError = error.message;
    } finally {
      clearTimeout(timeout);
      this.lastCheckAt = new Date().toISOString();
      this.checking = false;
    }

    if (!this.internetOnline) {
      logger.warn('network', 'Internet indisponivel; mantendo recursos locais ativos.', {
        mode: this.mode,
        lastError: this.lastError
      });
    }

    return this.getStatus();
  }

  isOffline() {
    if (this.mode === 'always') {
      return true;
    }

    if (this.mode === 'never') {
      return false;
    }

    return this.internetOnline === false;
  }

  canUseInternet() {
    return !this.isOffline();
  }

  getStatus() {
    return {
      mode: this.mode,
      offline: this.isOffline(),
      internetOnline: this.mode === 'always' ? false : this.mode === 'never' ? true : this.internetOnline,
      checkUrl: this.mode === 'auto' ? this.checkUrl : null,
      checkIntervalMs: this.mode === 'auto' ? this.checkIntervalMs : null,
      lastCheckAt: this.lastCheckAt,
      lastError: this.lastError
    };
  }
}

export { NetworkService };
