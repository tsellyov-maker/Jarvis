const SCENE_LABELS = {
  cinema: 'modo cinema',
  relaxar: 'modo relaxar',
  foco: 'modo foco',
  noturno: 'modo noturno'
};

class LightModule {
  constructor({ homeAssistantService } = {}) {
    this.homeAssistantService = homeAssistantService;
  }

  async handle(intent) {
    if (intent.type === 'light_on') {
      const result = await this.homeAssistantService.turnOnBedroomLight();
      return {
        ok: result.ok,
        text: result.simulated
          ? 'Certo. Liguei a luz do quarto no modo local.'
          : 'Certo. Liguei a luz do quarto.',
        data: result
      };
    }

    if (intent.type === 'light_off') {
      const result = await this.homeAssistantService.turnOffBedroomLight();
      return {
        ok: result.ok,
        text: result.simulated
          ? 'Certo. Desliguei a luz do quarto no modo local.'
          : 'Certo. Desliguei a luz do quarto.',
        data: result
      };
    }

    const scene = intent.parameters?.scene;
    const result = await this.homeAssistantService.applyScene(scene);
    const label = SCENE_LABELS[scene] || 'modo solicitado';

    return {
      ok: result.ok,
      text: result.simulated
        ? `Certo. Ativei o ${label} no modo local.`
        : `Certo. Ativei o ${label}.`,
      data: result
    };
  }
}

export { LightModule };
