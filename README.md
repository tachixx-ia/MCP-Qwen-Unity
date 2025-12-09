# Qwen Unity MCP Bridge

Este servidor actúa como un puente entre Unity y los servicios Qwen Cloud a través del protocolo MCP (Model Context Protocol).

## Características

- Integración con la API oficial de Qwen Cloud
- Soporte para sesiones de conversación persistentes
- Ejecución de herramientas MCP en JavaScript
- Manejo de errores robusto
- Compatible con Unity

## Instalación

1. Asegúrate de tener Node.js instalado
2. Ejecuta `npm install` para instalar las dependencias
3. Ejecuta `npm start` para iniciar el servidor

## Uso

El servidor escucha solicitudes MCP en el endpoint raíz (`/`) y responde según el protocolo MCP.

### Métodos Soportados

- `model/generate`: Genera texto usando Qwen Cloud
- `session/create`: Crea una nueva sesión de conversación
- `session/delete`: Elimina una sesión existente
- `tool/execute`: Ejecuta herramientas disponibles en el servidor

## Configuración

Por defecto, el servidor usa el modelo `qwen-max`. Puedes especificar un modelo diferente en las solicitudes.

### Variables de Entorno

Crea un archivo `.env` en el directorio raíz con las siguientes variables:

```
QWEN_API_KEY=tu_api_key_aqui
DEFAULT_MODEL=qwen-max
PORT=4000
```

Puedes proporcionar la API Key en cada solicitud `model/generate`, o dejar que el servidor la obtenga del archivo .env.