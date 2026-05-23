// ═══════════════════════════════════════════════════════════════
// CLAUDE API WITH RETRY LOGIC, TIMEOUT, AND SAFE PARSING
// ═══════════════════════════════════════════════════════════════

const { logger } = require('../middleware/logger');

/**
 * Call Claude API with automatic retry on failure
 * @param {string} system - System prompt
 * @param {string} user - User message
 * @param {number} maxTokens - Max tokens in response
 * @param {number} temperature - Temperature (0-1)
 * @param {number} maxRetries - Number of retries (default 3)
 * @returns {Promise<string>} - Claude response text
 */
async function callClaude(system, user, maxTokens = 4000, temperature = 0, maxRetries = 3) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Claude API call attempt ${attempt}/${maxRetries}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens,
          temperature: temperature,
          system: system,
          messages: [
            { role: 'user', content: user }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        logger.warn(`Claude API error (attempt ${attempt}):`, { status: response.status, error: error.slice(0, 200) });

        if (response.status === 429) {
          // Rate limit — wait before retry
          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (response.status >= 500 || response.status === 429) {
          // Server error — retry
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        throw new Error(`Claude API error: ${response.status} - ${error.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      if (!text) {
        throw new Error('Empty response from Claude');
      }

      logger.info('Claude API call succeeded', { attempt, responseLength: text.length });
      return text;

    } catch (error) {
      logger.warn(`Claude API call failed (attempt ${attempt}/${maxRetries}):`, error.message);

      if (error.name === 'AbortError') {
        const waitTime = Math.pow(2, attempt) * 1000;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error('Claude API timeout after retries');
      }

      if (attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff
      const waitTime = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Claude API failed after all retries');
}

/**
 * Safe JSON parsing with fallback
 * @param {string} text - Text to parse
 * @param {object} fallback - Fallback value if parsing fails
 * @returns {object} - Parsed JSON or fallback
 */
function safeParseJSON(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch (e) {
    logger.warn('JSON parse error, attempting extraction', { error: e.message });
    const extracted = extractJSON(text);
    if (extracted) return extracted;
    logger.error('JSON extraction failed, using fallback');
    return fallback;
  }
}

/**
 * Extract JSON from text (handles partial/malformed JSON)
 * @param {string} text - Text containing JSON
 * @returns {object|null} - Extracted JSON or null
 */
function extractJSON(text) {
  if (!text) return null;

  let cleaned = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Find first '{' and try parsing from there
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  try {
    return JSON.parse(cleaned.slice(start));
  } catch {}

  // Find matching braces
  let depth = 0, inStr = false, esc = false, lastClose = -1;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\\\') {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) lastClose = i;
    }
  }

  // Try extracting balanced JSON
  if (lastClose > 0) {
    try {
      return JSON.parse(cleaned.slice(start, lastClose + 1));
    } catch {}
  }

  // Try auto-closing unclosed JSON
  if (depth > 0) {
    let attempt = cleaned.slice(start);
    attempt = attempt.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
    attempt = attempt.replace(/,\s*"[^"]*":?\s*$/, '');
    attempt = attempt.replace(/,\s*$/, '');
    while (depth-- > 0) attempt += '}';
    try {
      return JSON.parse(attempt);
    } catch {}
  }

  return null;
}

/**
 * Estimate token count (rough approximation)
 * @param {string} text - Text to count
 * @returns {number} - Estimated token count
 */
function estimateTokens(text) {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit token limit
 * @param {string} text - Text to truncate
 * @param {number} maxTokens - Maximum tokens
 * @returns {string} - Truncated text
 */
function truncateToTokens(text, maxTokens) {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) return text;
  return text.slice(0, estimatedChars) + '\n\n[... tekstas sutrumpintas ...]';
}

module.exports = {
  callClaude,
  safeParseJSON,
  extractJSON,
  estimateTokens,
  truncateToTokens
};
