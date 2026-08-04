function readCookie(name) {
    var cookieString = document.cookie || '';
    var cookies = cookieString ? cookieString.split('; ') : [];

    for (var index = 0; index < cookies.length; index += 1) {
        var cookie = cookies[index];

        if (cookie.indexOf(name + '=') === 0) {
            return cookie.slice(name.length + 1);
        }
    }

    return '';
}

function getCsrfToken() {
    // Prefer the <meta name="csrf-token"> tag: it always holds the plain, unencoded
    // session token. The XSRF-TOKEN cookie is URL-encoded and Axios also reads it
    // automatically as X-XSRF-TOKEN, which Laravel decrypts differently — using both
    // channels at once causes a mismatch. Read meta first to avoid the conflict.
    var meta = document.querySelector('meta[name="csrf-token"]');

    if (meta) {
        return meta.getAttribute('content') || '';
    }

    var xsrfCookie = readCookie('XSRF-TOKEN');

    if (xsrfCookie) {
        return decodeURIComponent(xsrfCookie);
    }

    var hiddenTokenField = document.querySelector('input[name="_token"]');

    return hiddenTokenField ? hiddenTokenField.value : '';
}

function parseJsonResponse(response) {
    return response.text().then(function (text) {
        var data = {};

        try {
            data = text ? JSON.parse(text) : {};
        } catch (error) {
            data = { message: text };
        }

        if (!response.ok) {
            throw {
                status: response.status,
                data: data,
            };
        }

        return data;
    });
}

function buildUrl(url, query) {
    if (!query || typeof query !== 'object') {
        return url;
    }

    var searchParams = new URLSearchParams();

    Object.keys(query).forEach(function (key) {
        var value = query[key];

        if (value === undefined || value === null || value === '') {
            return;
        }

        searchParams.set(key, value);
    });

    var queryString = searchParams.toString();

    if (!queryString) {
        return url;
    }

    return url + (url.indexOf('?') === -1 ? '?' : '&') + queryString;
}

function buildRequestHeaders(includeCsrf) {
    var headers = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };

    if (!includeCsrf) {
        return headers;
    }

    var csrfToken = getCsrfToken();

    if (csrfToken) {
        headers['X-CSRF-TOKEN'] = csrfToken;
    }

    return headers;
}

function withCsrfToken(formData) {
    var payload = formData instanceof FormData ? formData : new FormData();
    var csrfToken = getCsrfToken();

    if (csrfToken && !payload.get('_token')) {
        payload.set('_token', csrfToken);
    }

    return payload;
}

function sendWithAxios(options) {
    var requestOptions = options || {};

    return window.axios.request({
        url: buildUrl(requestOptions.url, requestOptions.query),
        method: requestOptions.method || 'GET',
        data: requestOptions.body,
        headers: buildRequestHeaders(Boolean(requestOptions.body)),
        withCredentials: true,
    }).then(function (response) {
        return response.data;
    }).catch(function (error) {
        throw {
            status: error && error.response ? error.response.status : 500,
            data: error && error.response ? error.response.data : { message: error.message || 'Request failed.' },
        };
    });
}

function send(options) {
    var requestOptions = options || {};

    if (window.axios && typeof window.axios.request === 'function') {
        return sendWithAxios(requestOptions);
    }

    return fetch(buildUrl(requestOptions.url, requestOptions.query), {
        credentials: 'include',
        headers: buildRequestHeaders(Boolean(requestOptions.body)),
        method: requestOptions.method || 'GET',
        body: requestOptions.body,
    }).then(parseJsonResponse);
}

export function createApiClient() {
    return {
        get: function (url, query) {
            return send({
                url: url,
                query: query,
            });
        },

        // Send a JSON body with the correct HTTP method.
        // Use this for all cart mutations (PUT, DELETE, POST with JSON).
        // CSRF token is always injected via X-CSRF-TOKEN header.
        sendJson: function (url, data, options) {
            var requestOptions = options || {};
            var method = requestOptions.method || 'POST';
            var csrfToken = getCsrfToken();

            var headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            };

            if (csrfToken) {
                headers['X-CSRF-TOKEN'] = csrfToken;
            }

            if (window.axios && typeof window.axios.request === 'function') {
                return window.axios.request({
                    url: url,
                    method: method,
                    data: data,
                    headers: headers,
                    withCredentials: true,
                    // Disable Axios's own XSRF handling — we send X-CSRF-TOKEN ourselves.
                    xsrfCookieName: '',
                    xsrfHeaderName: '',
                }).then(function (response) {
                    return response.data;
                }).catch(function (error) {
                    throw {
                        status: error && error.response ? error.response.status : 500,
                        data: error && error.response ? error.response.data : { message: error.message || 'Request failed.' },
                    };
                });
            }

            return fetch(url, {
                credentials: 'include',
                headers: headers,
                method: method,
                body: JSON.stringify(data),
            }).then(parseJsonResponse);
        },

        sendForm: function (url, formData, options) {
            var requestOptions = options || {};

            return send({
                url: url,
                method: requestOptions.method || 'POST',
                body: withCsrfToken(formData),
            });
        },
    };
}

export function unwrapPayload(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        return responseData;
    }

    return Object.prototype.hasOwnProperty.call(responseData, 'data') ? responseData.data : responseData;
}
