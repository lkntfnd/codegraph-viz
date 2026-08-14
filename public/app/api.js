const GRAPH_OPTION_KEYS = ['prefix', 'file', 'focus', 'depth', 'kind', 'limit'];

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function request(path, { signal } = {}) {
  let response;

  try {
    response = await fetch(path, { signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`Could not fetch ${path}: ${describeError(error)}`, { cause: error });
  }

  if (!response.ok) {
    const status = response.status ? `HTTP ${response.status}` : 'HTTP error';
    const detail = response.statusText ? ` ${response.statusText}` : '';
    throw new Error(`Request for ${path} failed: ${status}${detail}`);
  }

  try {
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(`Invalid JSON from ${path}: ${describeError(error)}`, { cause: error });
  }
}

export function getMeta({ signal } = {}) {
  return request('/api/meta', { signal });
}

export function getGraph(options = {}, { signal } = {}) {
  const params = new URLSearchParams();
  params.set('view', options.view || 'architecture');

  for (const key of GRAPH_OPTION_KEYS) {
    const value = options[key];
    if (value == null || (typeof value === 'string' && value.trim() === '')) continue;
    params.set(key, String(value));
  }

  return request(`/api/graph?${params}`, { signal });
}

export function getVersion({ signal } = {}) {
  return request('/api/version', { signal });
}

export function searchNodes(query, { signal } = {}) {
  const params = new URLSearchParams({ q: query == null ? '' : String(query) });
  return request(`/api/search?${params}`, { signal });
}
