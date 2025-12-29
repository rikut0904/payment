const DEFAULT_TIMEOUT_MS = Number(process.env.EXTERNAL_API_TIMEOUT_MS) || 8000;

function getFetchImpl() {
  // 実行環境に合わせたfetch実装を取得する。
  if (globalThis.fetch) {
    return globalThis.fetch.bind(globalThis);
  }
  try {
    return require('node-fetch');
  } catch (err) {
    throw new Error('fetch API is not available in this runtime environment.');
  }
}

function createTimeoutError(timeoutMs) {
  // タイムアウト用のエラーを生成する。
  const error = new Error(`Request timed out after ${timeoutMs}ms`);
  error.code = 'ETIMEDOUT';
  return error;
}

function isTimeoutError(error) {
  // タイムアウト系のエラーか判定する。
  return Boolean(error && (error.code === 'ETIMEDOUT' || error.name === 'AbortError'));
}

async function fetchWithTimeout(url, options = {}, { timeoutMs } = {}) {
  // タイムアウト付きでfetchを実行する。
  const fetchImpl = getFetchImpl();
  const effectiveTimeout = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId;
  let timeoutPromise;

  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
  } else {
    timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(createTimeoutError(effectiveTimeout)), effectiveTimeout);
    });
  }

  try {
    const fetchPromise = fetchImpl(url, Object.assign({}, options, controller ? { signal: controller.signal } : {}));
    if (timeoutPromise) {
      return await Promise.race([fetchPromise, timeoutPromise]);
    }
    return await fetchPromise;
  } catch (err) {
    if (controller && isTimeoutError(err)) {
      throw createTimeoutError(effectiveTimeout);
    }
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function fetchJson(url, options = {}, { timeoutMs } = {}) {
  // ステータス確認付きでJSONを取得する。
  const response = await fetchWithTimeout(url, options, { timeoutMs });
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return response.json();
}

module.exports = {
  fetchWithTimeout,
  fetchJson,
  isTimeoutError,
};
