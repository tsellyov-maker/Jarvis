# Jarvis Local

Assistente pessoal local com voz, IA local via Ollama, TTS Fish Audio, automacao residencial, SQLite, API HTTP, WebSocket e interface web.

## Requisitos

- Node.js 20+
- Ollama rodando localmente
- Modelos Ollama configurados: `llama3.1` e `mixtral`
- Opcional para voz: Fish Audio, `mpv` ou `ffplay`, e gravador local (`sox/rec`, `arecord` ou `ffmpeg`)

## Configuracao

```bash
cp .env.example .env
npm install
npm run start
```

Por seguranca, o bind padrao e local: `BIND_HOST=127.0.0.1`.

Para exigir token na API e WebSocket:

```bash
JARVIS_API_TOKEN=um-token-forte
```

A interface pedira o token quando receber `401`.

## Persistencia

O armazenamento principal e SQLite em `src/data/jarvis.sqlite`.

Os arquivos `src/data/memory.json` e `src/data/reminders.json` sao mantidos como estrutura inicial e migracao compatível. Em execucao normal, memoria, historico, lembretes e eventos de auditoria ficam no banco.

## Observabilidade

- `GET /health`: liveness simples
- `GET /ready`: readiness com banco, scheduler e wake loop
- `GET /status`: estado completo do runtime
- `GET /metrics`: metricas Prometheus
- `GET /events`: eventos recentes persistidos no SQLite

## Endpoints principais

- `POST /jarvis` com `{ "text": "que horas sao", "speak": true }`
- `POST /jarvis/listen` para gravacao real ou voz simulada com `{ "text": "status do sistema" }`
- `GET /memory`
- `POST /memory`
- `GET /reminders`

## Operacao 24/7

O processo tolera falhas de servicos externos: Ollama, Fish Audio, player de audio, Home Assistant e microfone podem falhar sem derrubar a API. O sistema registra logs claros, mantem readiness degradado quando necessario e encerra com shutdown gracioso em `SIGTERM`/`SIGINT`.

Para rodar sem microfone em testes:

```bash
MIC_RECORD_COMMAND=disabled AUDIO_PLAYBACK=false npm run start
```

## Modo Offline

O modo offline protege o fluxo local quando a internet cai:

- Ollama continua sendo usado em `OLLAMA_URL`, normalmente local.
- Comandos locais e memoria SQLite continuam funcionando.
- Home Assistant continua funcionando em rede local via `HA_URL`.
- Fish Audio e ignorado automaticamente quando `OFFLINE_MODE=auto` detecta internet indisponivel, ou quando `OFFLINE_MODE=always`.
- O fallback local/Piper esta preparado por `PIPER_COMMAND`.

Configuracao:

```bash
OFFLINE_MODE=auto
INTERNET_CHECK_URL=https://www.gstatic.com/generate_204
TTS_LOCAL_FALLBACK=piper
PIPER_COMMAND=printf %s {text} | piper --model /caminho/voz.onnx --output_file {output}
```

Para forcar operacao totalmente local:

```bash
OFFLINE_MODE=always
```

## systemd

Um unit file de exemplo esta em `deploy/jarvis.service`.

```bash
sudo cp deploy/jarvis.service /etc/systemd/system/jarvis.service
sudo systemctl daemon-reload
sudo systemctl enable jarvis
sudo systemctl start jarvis
sudo systemctl status jarvis
```

Logs:

```bash
journalctl -u jarvis -f
```
