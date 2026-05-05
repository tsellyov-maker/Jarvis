import { logger } from '../core/logger.mjs';

class OllamaService {
  constructor({ url = process.env.OLLAMA_URL || 'http://localhost:11434' } = {}) {
    this.url = url.replace(/\/$/, '');
  }

  async request(path, body, { timeoutMs = 60000 } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Ollama respondeu ${response.status}: ${errorText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate({ model, prompt, system = null, format = null, options = {}, timeoutMs = 60000 }) {
    const body = {
      model,
      prompt,
      stream: false,
      options
    };

    if (system) {
      body.system = system;
    }

    if (format) {
      body.format = format;
    }

    const data = await this.request('/api/generate', body, { timeoutMs });
    return data.response || '';
  }

  async chat({ model, messages, options = {}, timeoutMs = 60000 }) {
    const data = await this.request('/api/chat', {
      model,
      messages,
      stream: false,
      options
    }, { timeoutMs });

    return data.message?.content || '';
  }

  async health() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${this.url}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });

      return {
        ok: response.ok,
        status: response.status,
        url: this.url
      };
    } catch (error) {
      logger.warn('ollama', 'Health check falhou.', error);
      return {
        ok: false,
        status: null,
        url: this.url,
        error: error.message
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { OllamaService };
