import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

/**
 * Built-in demo tools for the Agents API. Each tool is a pi-agent-core
 * AgentTool with a TypeBox parameter schema. Tools throw on failure; the
 * agent loop converts thrown errors into error tool results for the model.
 */

const MAX_FETCH_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

/**
 * Fetch with exponential backoff for external API calls.
 */
async function fetchWithBackoff(url: string, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      const response = await fetch(url, { signal });
      // Retry on rate limiting or transient server errors
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Request failed with status ${response.status}`);
        continue;
      }
      return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw new Error(`Request to external API failed after ${MAX_FETCH_RETRIES} attempts: ${String(lastError)}`);
}

function textResult<T>(text: string, details: T) {
  return {
    content: [{ type: 'text' as const, text }],
    details,
  };
}

/**
 * Safe arithmetic expression evaluator (no eval). Supports + - * / % ^,
 * parentheses, and unary minus.
 */
export function evaluateExpression(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[+\-*/%^()]/g);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) {
    throw new Error('Invalid expression. Only numbers, + - * / % ^ and parentheses are supported.');
  }

  let position = 0;

  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  // Grammar (recursive descent):
  //   expression := term (('+' | '-') term)*
  //   term       := factor (('*' | '/' | '%') factor)*
  //   factor     := unary ('^' factor)?          (right-associative)
  //   unary      := '-' unary | primary
  //   primary    := number | '(' expression ')'
  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const rhs = parseFactor();
      if (op === '*') value = value * rhs;
      else if (op === '/') value = value / rhs;
      else value = value % rhs;
    }
    return value;
  }

  function parseFactor(): number {
    const base = parseUnary();
    if (peek() === '^') {
      consume();
      return base ** parseFactor();
    }
    return base;
  }

  function parseUnary(): number {
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = consume();
    if (token === '(') {
      const value = parseExpression();
      if (consume() !== ')') {
        throw new Error('Mismatched parentheses in expression.');
      }
      return value;
    }
    if (token === undefined || !/^\d/.test(token)) {
      throw new Error(`Unexpected token in expression: ${token ?? 'end of input'}`);
    }
    return parseFloat(token);
  }

  const result = parseExpression();
  if (position !== tokens.length) {
    throw new Error(`Unexpected token in expression: ${tokens[position]}`);
  }
  if (!Number.isFinite(result)) {
    throw new Error('Expression did not evaluate to a finite number.');
  }
  return result;
}

const calculatorSchema = Type.Object({
  expression: Type.String({ description: "Arithmetic expression to evaluate, e.g. '(1875 * 23.5) / 100'" }),
});

const calculatorTool: AgentTool<typeof calculatorSchema> = {
  name: 'calculate',
  label: 'Calculator',
  description:
    'Evaluate an arithmetic expression. Supports +, -, *, /, %, ^ (power) and parentheses. ' +
    'Use this for any math instead of computing yourself.',
  parameters: calculatorSchema,
  execute: async (_toolCallId, params) => {
    const value = evaluateExpression(params.expression);
    return textResult(String(value), { expression: params.expression, value });
  },
};

const currentTimeSchema = Type.Object({
  timezone: Type.Optional(Type.String({ description: 'IANA timezone identifier. Defaults to UTC.' })),
});

const currentTimeTool: AgentTool<typeof currentTimeSchema> = {
  name: 'get_current_datetime',
  label: 'Current date & time',
  description:
    'Get the current date and time. Optionally pass an IANA timezone (e.g. "Asia/Manila", "America/New_York"). Defaults to UTC.',
  parameters: currentTimeSchema,
  execute: async (_toolCallId, params) => {
    const timezone = params.timezone || 'UTC';
    const now = new Date();
    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(now);
    } catch {
      throw new Error(`Unknown timezone: ${timezone}. Use an IANA timezone like "Asia/Manila".`);
    }
    return textResult(`${formatted} (${timezone})`, {
      iso: now.toISOString(),
      timezone,
      formatted,
    });
  },
};

interface GeocodingResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const weatherSchema = Type.Object({
  city: Type.String({ description: 'City name to look up, e.g. "Manila"' }),
});

const weatherTool: AgentTool<typeof weatherSchema> = {
  name: 'get_weather',
  label: 'Weather lookup',
  description:
    'Get the current weather for a city using the free Open-Meteo API. Pass a city name like "Manila" or "New York".',
  parameters: weatherSchema,
  execute: async (_toolCallId, params, signal) => {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(params.city)}&count=1`;
    const geoResponse = await fetchWithBackoff(geoUrl, signal);
    if (!geoResponse.ok) {
      throw new Error(`Geocoding request failed with status ${geoResponse.status}`);
    }
    const geoData = (await geoResponse.json()) as { results?: GeocodingResult[] };
    const location = geoData.results?.[0];
    if (!location) {
      throw new Error(`Could not find a location named "${params.city}".`);
    }

    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code';
    const forecastResponse = await fetchWithBackoff(forecastUrl, signal);
    if (!forecastResponse.ok) {
      throw new Error(`Weather request failed with status ${forecastResponse.status}`);
    }
    const forecast = (await forecastResponse.json()) as {
      current?: {
        temperature_2m: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        weather_code: number;
      };
    };
    const current = forecast.current;
    if (!current) {
      throw new Error('Weather data unavailable for this location.');
    }

    const condition = WEATHER_CODES[current.weather_code] || `Weather code ${current.weather_code}`;
    const placeName = [location.name, location.country].filter(Boolean).join(', ');
    const summary =
      `Current weather in ${placeName}: ${condition}, ${current.temperature_2m}°C, ` +
      `${current.relative_humidity_2m}% humidity, wind ${current.wind_speed_10m} km/h.`;

    return textResult(summary, {
      location: placeName,
      latitude: location.latitude,
      longitude: location.longitude,
      condition,
      temperatureC: current.temperature_2m,
      humidityPercent: current.relative_humidity_2m,
      windSpeedKmh: current.wind_speed_10m,
    });
  },
};

export const demoAgentTools: AgentTool<any>[] = [calculatorTool, currentTimeTool, weatherTool];

export interface AgentToolInfo {
  name: string;
  label: string;
  description: string;
}

export function getAgentToolCatalog(): AgentToolInfo[] {
  return demoAgentTools.map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
  }));
}
