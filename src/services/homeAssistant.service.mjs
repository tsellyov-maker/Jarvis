import { logger } from '../core/logger.mjs';

const SCENE_PROFILES = {
  cinema: {
    brightness_pct: 15,
    color_temp_kelvin: 2200
  },
  relaxar: {
    brightness_pct: 35,
    color_temp_kelvin: 2700
  },
  foco: {
    brightness_pct: 90,
    color_temp_kelvin: 4000
  },
  noturno: {
    brightness_pct: 5,
    color_temp_kelvin: 2200
  }
};

class HomeAssistantService {
  constructor({
    url = process.env.HA_URL || 'http://localhost:8123',
    token = process.env.HA_TOKEN || '',
    lightEntity = process.env.HA_LIGHT_ENTITY || 'light.luz_quarto'
  } = {}) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
    this.lightEntity = lightEntity;
  }

  get configured() {
    return Boolean(this.url && this.token && this.lightEntity);
  }

  async callService(domain, service, data) {
    if (!this.configured) {
      logger.warn('home-assistant', 'HA_TOKEN ausente; executando automacao em modo local simulado.', {
        domain,
        service,
        data
      });
      return {
        ok: true,
        simulated: true,
        domain,
        service,
        data
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${this.url}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Home Assistant respondeu ${response.status}: ${errorText}`);
      }

      const body = await response.json().catch(() => null);
      return {
        ok: true,
        simulated: false,
        domain,
        service,
        data,
        response: body
      };
    } catch (error) {
      logger.error('home-assistant', 'Falha ao chamar Home Assistant; usando resultado degradado.', error);
      return {
        ok: false,
        simulated: false,
        domain,
        service,
        data,
        error: error.message
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async turnOnBedroomLight() {
    return this.callService('light', 'turn_on', {
      entity_id: this.lightEntity
    });
  }

  async turnOffBedroomLight() {
    return this.callService('light', 'turn_off', {
      entity_id: this.lightEntity
    });
  }

  async applyScene(scene) {
    const profile = SCENE_PROFILES[scene] || SCENE_PROFILES.relaxar;
    return this.callService('light', 'turn_on', {
      entity_id: this.lightEntity,
      ...profile
    });
  }
}

export { HomeAssistantService };
