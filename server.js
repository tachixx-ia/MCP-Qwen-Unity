require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// Configuración por defecto desde variables de entorno
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'qwen-max';
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_CLOUD_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

// Almacenamiento de sesiones
const sessions = new Map();

// Middleware para parsear solicitudes MCP
app.use((req, res, next) => {
  if (req.body && req.body.method) {
    // Es una solicitud MCP
    handleMCPRequest(req, res);
  } else {
    next();
  }
});

// Manejador de solicitudes MCP
async function handleMCPRequest(req, res) {
  const mcpRequest = req.body;
  const method = mcpRequest.method;
  const id = mcpRequest.id;

  try {
    let result;

    if (method === 'model/generate') {
      result = await handleModelGenerate(mcpRequest);
    } else if (method === 'session/create') {
      result = await handleSessionCreate(mcpRequest);
    } else if (method === 'session/delete') {
      result = await handleSessionDelete(mcpRequest);
    } else if (method === 'tool/execute') {
      result = await handleToolExecute(mcpRequest);
    } else {
      throw new Error(`Método no soportado: ${method}`);
    }

    // Responder en formato MCP
    res.json({
      jsonrpc: '2.0',
      id: id,
      result: result
    });
  } catch (error) {
    console.error('Error procesando solicitud MCP:', error);
    res.json({
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -32603,
        message: 'Internal Error',
        data: error.message
      }
    });
  }
}

// Manejar creación de sesión
async function handleSessionCreate(request) {
  const sessionId = uuidv4();
  sessions.set(sessionId, { history: [] });
  return { sessionId };
}

// Manejar eliminación de sesión
async function handleSessionDelete(request) {
  const { sessionId } = request.params;
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    return { success: true };
  }
  throw new Error(`Sesión no encontrada: ${sessionId}`);
}

// Manejar generación de modelo
async function handleModelGenerate(request) {
  const params = request.params;
  const { prompt, sessionId, model = DEFAULT_MODEL, apiKey } = params;

  if (!prompt) {
    throw new Error('Prompt es requerido');
  }

  // Usar API Key proporcionada en los parámetros o desde variables de entorno
  const effectiveApiKey = apiKey || QWEN_API_KEY;

  if (!effectiveApiKey) {
    throw new Error('API Key es requerida (parámetro o variable de entorno)');
  }

  // Obtener o crear sesión
  let session = sessions.get(sessionId);
  if (!session) {
    const newSession = await handleSessionCreate({ params: {} });
    session = sessions.get(newSession.sessionId);
  }

  // Agregar prompt a historial
  session.history.push({ role: 'user', content: prompt });

  try {
    // Llamar a Qwen Cloud API
    const qwenResponse = await callQwenCloud(model, session.history, effectiveApiKey);

    // Agregar respuesta a historial
    session.history.push({ role: 'assistant', content: qwenResponse });

    return {
      choices: [{
        message: {
          role: 'assistant',
          content: qwenResponse
        }
      }],
      model: model,
      session: sessionId
    };
  } catch (error) {
    console.error('Error llamando a Qwen Cloud:', error);
    throw error;
  }
}

// Llamar a la API de Qwen Cloud
async function callQwenCloud(model, messages, apiKey) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  // Convertir mensajes al formato esperado por Qwen Cloud
  const input = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');

  const data = {
    model: model,
    input: {
      messages: messages
    }
  };

  try {
    const response = await axios.post(QWEN_CLOUD_ENDPOINT, data, { headers });
    const outputText = response.data.output.choices[0].message.content;
    return outputText;
  } catch (error) {
    if (error.response) {
      console.error('Error de respuesta de Qwen Cloud:', error.response.status, error.response.data);
      throw new Error(`Qwen Cloud Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('Error de solicitud a Qwen Cloud:', error.request);
      throw new Error('No se pudo conectar con Qwen Cloud');
    } else {
      console.error('Error general:', error.message);
      throw new Error(`Error general: ${error.message}`);
    }
  }
}

// Manejar ejecución de herramienta
async function handleToolExecute(request) {
  const { tool, parameters } = request.params;

  // Ejecución de herramienta en JavaScript
  switch (tool) {
    case 'calculate':
      return executeCalculateTool(parameters);
    case 'get-time':
      return executeGetTimeTool(parameters);
    default:
      throw new Error(`Herramienta no soportada: ${tool}`);
  }
}

// Ejecutar herramienta de cálculo
function executeCalculateTool(params) {
  const { expression } = params;
  try {
    // Validar que la expresión solo contenga caracteres permitidos para operaciones matemáticas
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      throw new Error('Expresión no válida: solo se permiten números y operadores matemáticos');
    }

    // Usar Function para evaluar la expresión de forma segura
    // En un entorno de producción, usar una biblioteca de evaluación segura
    const result = Function('"use strict"; return (' + expression + ')')();
    return { result };
  } catch (error) {
    throw new Error(`Error evaluando expresión: ${error.message}`);
  }
}

// Ejecutar herramienta de obtención de tiempo
function executeGetTimeTool(params) {
  const now = new Date();
  return {
    time: now.toISOString(),
    timestamp: now.getTime()
  };
}

// Endpoint para health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor MCP Qwen Unity escuchando en puerto ${PORT}`);
  console.log(`Endpoint: / (MCP) y /health (health check)`);
  if (!QWEN_API_KEY) {
    console.warn('ADVERTENCIA: No se encontró QWEN_API_KEY en las variables de entorno. Deberá proporcionarse en cada solicitud.');
  }
});