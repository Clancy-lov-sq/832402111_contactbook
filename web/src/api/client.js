/**
 * The single HTTP client of the front end.
 *
 * It owns the base URL, the envelope parsing and the error classification, so a
 * component never writes a URL or reads `response.ok` itself. A failed request is
 * always an `ApiError` carrying the backend `code`, the HTTP status and the field
 * level failures of a validation response.
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** A classified failure returned by the backend. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   * @param {string} [details.code]
   * @param {number} [details.status]
   * @param {Array<object>} [details.fields]
   * @param {*} [details.detail]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = details.code || 'NETWORK_ERROR';
    this.status = details.status || 0;
    this.fields = details.fields || [];
    this.detail = details.detail;
  }
}

/**
 * Sends one request and unwraps the JSON envelope.
 *
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<object>}
 */
async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    throw new ApiError('无法连接后端服务，请确认服务已经启动', { code: 'NETWORK_UNREACHABLE' });
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new ApiError('后端返回了无法解析的响应', {
      code: 'INVALID_RESPONSE',
      status: response.status,
    });
  }

  if (!response.ok || (payload && payload.success === false)) {
    throw new ApiError(
      (payload && payload.message) || `请求失败（HTTP ${response.status}）`,
      {
        code: payload && payload.error,
        status: response.status,
        fields: payload && payload.fields,
        detail: payload && payload.detail,
      },
    );
  }
  return payload;
}

/**
 * Builds a query string, skipping empty filters.
 * @param {object} params
 * @returns {string}
 */
function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') {
      continue;
    }
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** The backend operations the interface uses. */
export const api = {
  /** @returns {Promise<object>} */
  meta() {
    return request('/meta');
  },

  /** @param {object} params @returns {Promise<object>} */
  list(params) {
    return request(`/contacts${toQuery(params)}`);
  },

  /** @param {number|string} id @returns {Promise<object>} */
  get(id) {
    return request(`/contacts/${id}`);
  },

  /** @param {object} payload @returns {Promise<object>} */
  create(payload) {
    return request('/contacts', { method: 'POST', body: payload });
  },

  /** @param {number|string} id @param {object} payload @returns {Promise<object>} */
  update(id, payload) {
    return request(`/contacts/${id}`, { method: 'PUT', body: payload });
  },

  /** @param {number|string} id @returns {Promise<object>} */
  remove(id) {
    return request(`/contacts/${id}`, { method: 'DELETE' });
  },

  /** @param {number|string} id @param {boolean} bookmarked @returns {Promise<object>} */
  bookmark(id, bookmarked) {
    return request(`/contacts/${id}/bookmark`, {
      method: 'PATCH',
      body: { bookmarked },
    });
  },

  /**
   * Uploads a workbook.
   * @param {File} file
   * @param {'skip'|'update'} mode
   * @returns {Promise<object>}
   */
  importWorkbook(file, mode) {
    const form = new FormData();
    form.append('mode', mode);
    form.append('file', file, file.name);
    return request('/contacts/import', { method: 'POST', body: form });
  },

  /**
   * Downloads a generated workbook and reports how many rows it carried.
   *
   * The body is fetched instead of being opened through a link, so the interface
   * can show a confirmation with the real row count (read from the response
   * header) and a failure can surface as a toast instead of a blank tab.
   *
   * @param {object} params filters of the export
   * @returns {Promise<{blob: Blob, fileName: string, rowCount: number}>}
   */
  async exportContacts(params = {}) {
    const response = await fetch(`${API_BASE}/contacts/export${toQuery(params)}`);
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      throw new ApiError((payload && payload.message) || '导出失败', {
        code: (payload && payload.error) || 'EXPORT_FAILED',
        status: response.status,
      });
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return {
      blob: await response.blob(),
      fileName: match ? match[1] : 'contactbook.xlsx',
      rowCount: Number(response.headers.get('X-Export-Row-Count') || 0),
    };
  },

  /**
   * Downloads the import template.
   * @returns {Promise<{blob: Blob, fileName: string}>}
   */
  async downloadTemplate() {
    const response = await fetch(`${API_BASE}/contacts/template`);
    if (!response.ok) {
      throw new ApiError('模板下载失败', { code: 'EXPORT_FAILED', status: response.status });
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return {
      blob: await response.blob(),
      fileName: match ? match[1] : 'contactbook-import-template.xlsx',
    };
  },
};

/**
 * Triggers the download of a blob in the browser.
 *
 * @param {Blob} blob
 * @param {string} fileName
 */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
