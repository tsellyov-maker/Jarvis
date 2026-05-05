class Brain {
  constructor({
    conversationModule,
    lightModule,
    memoryModule,
    reminderModule,
    systemModule,
    voiceModule
  } = {}) {
    this.conversationModule = conversationModule;
    this.lightModule = lightModule;
    this.memoryModule = memoryModule;
    this.reminderModule = reminderModule;
    this.systemModule = systemModule;
    this.voiceModule = voiceModule;
  }

  async process(intent, context = {}) {
    switch (intent.type) {
      case 'light_on':
      case 'light_off':
      case 'scene':
        return this.lightModule.handle(intent, context);

      case 'memory_add':
      case 'memory_list':
        return this.memoryModule.handle(intent, context);

      case 'reminder_create':
      case 'reminder_list':
        return this.reminderModule.handle(intent, context);

      case 'time':
      case 'system_status':
        return this.systemModule.handle(intent, context);

      case 'conversation':
      default:
        return this.conversationModule.handle(intent, context);
    }
  }
}

export { Brain };
