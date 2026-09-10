function firstValidationError(payload) {
    var errors = payload && payload.errors ? payload.errors : {};
    var keys = Object.keys(errors);

    if (!keys.length) return '';

    var value = errors[keys[0]];
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function setFeedback(form, type, message) {
    var feedback = form.closest('[data-sharry-contact-section]')?.querySelector('[data-sharry-contact-feedback]');

    if (!feedback) return;

    feedback.hidden = !message;
    feedback.textContent = message || '';
    feedback.classList.toggle('is-success', type === 'success');
    feedback.classList.toggle('is-error', type === 'error');
}

function setSubmitting(form, submitting) {
    var button = form.querySelector('[data-sharry-contact-submit]');

    if (!button) return;

    button.disabled = submitting;
    button.setAttribute('aria-busy', submitting ? 'true' : 'false');
}

function findFieldError(input) {
    var wrapper = input.closest('.sharry-contact-form__field')
        || input.closest('.sharry-contact-form__address-item')
        || input.closest('label')
        || input.parentElement;
    if (!wrapper) return null;
    var error = wrapper.querySelector('[data-sharry-contact-error]');
    if (!error) {
        error = document.createElement('p');
        error.className = 'sharry-contact-form__error';
        error.setAttribute('data-sharry-contact-error', '');
        error.hidden = true;
        wrapper.appendChild(error);
    }
    return error;
}

function clearFieldError(input) {
    var error = findFieldError(input);
    if (!error) return;
    input.removeAttribute('aria-invalid');
    error.hidden = true;
    error.textContent = '';
}

function getValidationMessage(input, messages) {
    if (input.validity.valueMissing) return messages.required || input.validationMessage;
    if (input.type === 'email' && input.validity.typeMismatch) return messages.email || input.validationMessage;
    if (input.type === 'url' && input.validity.typeMismatch) return messages.url || input.validationMessage;
    if (input.type === 'tel' && (input.validity.patternMismatch || input.validity.typeMismatch)) return messages.tel || input.validationMessage;
    if (input.type === 'number' && (input.validity.badInput || input.validity.rangeUnderflow || input.validity.rangeOverflow || input.validity.stepMismatch)) return messages.number || input.validationMessage;
    if (input.validity.patternMismatch || input.validity.tooShort || input.validity.tooLong) return messages.pattern || input.validationMessage;
    if (input.validity.customError) return messages.selectFromList || input.validationMessage;
    return input.validationMessage;
}

function showFieldErrors(form) {
    var firstInvalid = null;
    var messages = {
        required: form.getAttribute('data-sharry-message-required') || '',
        email: form.getAttribute('data-sharry-message-email') || '',
        url: form.getAttribute('data-sharry-message-url') || '',
        tel: form.getAttribute('data-sharry-message-tel') || '',
        number: form.getAttribute('data-sharry-message-number') || '',
        pattern: form.getAttribute('data-sharry-message-pattern') || '',
        selectFromList: form.getAttribute('data-sharry-message-select-from-list') || '',
    };
    form.querySelectorAll('input, select, textarea').forEach(function (input) {
        if (input.type === 'hidden' || input.name === '_token' || input.name === 'website') return;
        var error = findFieldError(input);
        if (!error) return;
        if (!input.checkValidity()) {
            input.setAttribute('aria-invalid', 'true');
            error.textContent = getValidationMessage(input, messages);
            error.hidden = false;
            if (!firstInvalid) firstInvalid = input;
        } else {
            clearFieldError(input);
        }
    });
    return firstInvalid;
}

function initializeCatalogPicker(form, picker) {
    var search = picker.querySelector('[data-sharry-catalog-search]');
    var value = picker.querySelector('[data-sharry-catalog-value]');
    var selected = picker.querySelector('[data-sharry-catalog-selected]');
    var results = picker.querySelector('[data-sharry-catalog-results]');
    var url = picker.getAttribute('data-picker-url') || '';
    var required = Boolean(search && search.required);
    var timer = null;
    var requestId = 0;

    if (!search || !value || !selected || !results || !url) return;

    function clear() {
        value.value = '';
        search.value = '';
        search.hidden = false;
        search.required = required;
        selected.hidden = true;
        selected.replaceChildren();
        results.hidden = true;
        results.replaceChildren();
    }

    function selectEntity(entity) {
        value.value = String(entity.id || '');
        search.hidden = true;
        search.required = false;
        selected.hidden = false;
        selected.replaceChildren();

        if (entity.image) {
            var image = document.createElement('img');
            image.src = entity.image;
            image.alt = entity.name || '';
            selected.appendChild(image);
        }

        var name = document.createElement('span');
        name.textContent = entity.name || '';
        selected.appendChild(name);

        var change = document.createElement('button');
        change.type = 'button';
        change.textContent = form.getAttribute('data-sharry-catalog-change') || 'Change';
        change.addEventListener('click', clear);
        selected.appendChild(change);

        results.hidden = true;
        results.replaceChildren();
    }

    function render(items, message) {
        results.replaceChildren();

        if (message) {
            var status = document.createElement('p');
            status.textContent = message;
            results.appendChild(status);
            results.hidden = false;
            return;
        }

        items.forEach(function (entity) {
            var option = document.createElement('button');
            option.type = 'button';

            if (entity.image) {
                var image = document.createElement('img');
                image.src = entity.image;
                image.alt = entity.name || '';
                option.appendChild(image);
            }

            var name = document.createElement('span');
            name.textContent = entity.name || '';
            option.appendChild(name);

            if (entity.sku) {
                var sku = document.createElement('small');
                sku.textContent = entity.sku;
                option.appendChild(sku);
            }

            option.addEventListener('click', function () {
                selectEntity(entity);
            });
            results.appendChild(option);
        });

        results.hidden = items.length === 0;
    }

    function searchEntities(immediate) {
        if (timer) window.clearTimeout(timer);
        var query = search.value.trim();
        var currentRequest = ++requestId;
        var execute = async function () {
            render([], form.getAttribute('data-sharry-catalog-searching') || 'Searching…');

            try {
                var params = new URLSearchParams({ query: query, limit: '20' });
                var response = await fetch(url + '?' + params.toString(), {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });
                var payload = await response.json();
                if (currentRequest !== requestId) return;
                var items = response.ok && Array.isArray(payload.data) ? payload.data : [];
                render(items, items.length ? '' : (form.getAttribute('data-sharry-catalog-empty') || 'No matching results.'));
            } catch (error) {
                if (currentRequest === requestId) {
                    render([], form.getAttribute('data-sharry-catalog-empty') || 'No matching results.');
                }
            }
        };

        timer = immediate ? null : window.setTimeout(execute, 300);
        if (immediate) execute();
    }

    search.addEventListener('input', function () {
        searchEntities(false);
    });
    search.addEventListener('focus', function () {
        searchEntities(true);
    });
    picker._resetCatalog = clear;
}

function initializeLocation(fieldset) {
    if (!fieldset) return;
    var locale = fieldset.getAttribute('data-sharry-location-locale') || 'en';
    var selectHint = fieldset.getAttribute('data-sharry-location-select-hint') || 'Please select from the list';
    var urls = {
        country: fieldset.getAttribute('data-sharry-location-countries') || '',
        state: fieldset.getAttribute('data-sharry-location-states') || '',
        city: fieldset.getAttribute('data-sharry-location-cities') || '',
    };
    var items = { country: [], state: [], city: [] };
    var selected = { country: '', state: '', city: '' };
    var loading = { country: false, state: false, city: false };

    function displayName(item) {
        if (!item) return '';
        if (locale === 'ar') {
            return item.name_ar || item.name_en || item.name || item.default_name || '';
        }
        return item.name_en || item.name_ar || item.name || item.default_name || '';
    }

    function searchUrl(type, parentId) {
        var url = urls[type] || '';
        if (!url) return '';
        var sep = url.indexOf('?') >= 0 ? '&' : '?';
        var params = 'locale=' + encodeURIComponent(locale);
        if (type === 'state' && parentId) params += '&country_id=' + encodeURIComponent(parentId);
        if (type === 'city' && parentId) params += '&state_id=' + encodeURIComponent(parentId);
        return url + sep + params;
    }

    function filterItems(type, query) {
        query = String(query || '').toLowerCase().trim();
        var list = items[type] || [];
        if (!query) return list;
        return list.filter(function (item) {
            return String(displayName(item)).toLowerCase().indexOf(query) >= 0;
        });
    }

    function renderResults(type, list) {
        var results = fieldset.querySelector('[data-sharry-location-results="' + type + '"]');
        if (!results) return;
        results.replaceChildren();
        if (!list.length) {
            results.hidden = true;
            return;
        }
        list.forEach(function (item) {
            var option = document.createElement('button');
            option.type = 'button';
            option.textContent = displayName(item);
            option.addEventListener('mousedown', function (event) {
                event.preventDefault();
                selectItem(type, item);
            });
            results.appendChild(option);
        });
        results.hidden = false;
    }

    function fetchItems(type, parentId) {
        var url = searchUrl(type, parentId);
        if (!url || loading[type]) return Promise.resolve();
        loading[type] = true;
        return fetch(url, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then(function (res) { return res.json(); })
            .then(function (payload) {
                items[type] = Array.isArray(payload.data) ? payload.data : [];
            })
            .catch(function () { items[type] = []; })
            .finally(function () { loading[type] = false; });
    }

    function clearValue(type, clearSearch) {
        var search = fieldset.querySelector('[data-sharry-location-search="' + type + '"]');
        var value = fieldset.querySelector('[data-sharry-location-value="' + type + '"]');
        var results = fieldset.querySelector('[data-sharry-location-results="' + type + '"]');
        if (value) value.value = '';
        selected[type] = '';
        items[type] = [];
        if (results) results.hidden = true;
        if (search && clearSearch) search.value = '';
        if (search) search.setCustomValidity('');
    }

    function selectItem(type, item) {
        var search = fieldset.querySelector('[data-sharry-location-search="' + type + '"]');
        var value = fieldset.querySelector('[data-sharry-location-value="' + type + '"]');
        if (search) {
            search.value = displayName(item);
            search.setCustomValidity('');
            clearFieldError(search);
        }
        if (value) value.value = String(item.id || '');
        selected[type] = String(item.id || '');
        if (type === 'country') {
            clearValue('state', true);
            clearValue('city', true);
            fetchItems('state', selected.country);
        } else if (type === 'state') {
            clearValue('city', true);
            fetchItems('city', selected.state);
        }
        renderResults(type, []);
    }

    ['country', 'state', 'city'].forEach(function (type) {
        var search = fieldset.querySelector('[data-sharry-location-search="' + type + '"]');
        if (!search) return;

        search.addEventListener('focus', function () {
            if (type === 'country') {
                if (items.country.length) renderResults('country', filterItems('country', search.value));
                else if (!loading.country) fetchItems('country').then(function () { renderResults('country', filterItems('country', search.value)); });
            } else if (type === 'state' && selected.country) {
                if (items.state.length) renderResults('state', filterItems('state', search.value));
                else if (!loading.state) fetchItems('state', selected.country).then(function () { renderResults('state', filterItems('state', search.value)); });
            } else if (type === 'city' && selected.state) {
                if (items.city.length) renderResults('city', filterItems('city', search.value));
                else if (!loading.city) fetchItems('city', selected.state).then(function () { renderResults('city', filterItems('city', search.value)); });
            }
        });

        search.addEventListener('input', function () {
            var value = fieldset.querySelector('[data-sharry-location-value="' + type + '"]');
            if (value) value.value = '';
            selected[type] = '';
            if (type === 'country') {
                clearValue('state', true);
                clearValue('city', true);
            } else if (type === 'state') {
                clearValue('city', true);
            }
            search.setCustomValidity(search.value ? selectHint : '');
            renderResults(type, filterItems(type, search.value));
        });

        search.addEventListener('blur', function () {
            window.setTimeout(function () {
                var value = fieldset.querySelector('[data-sharry-location-value="' + type + '"]');
                if (value && !value.value) {
                    search.value = '';
                    selected[type] = '';
                    search.setCustomValidity('');
                }
                renderResults(type, []);
            }, 200);
        });
    });

    if (urls.country) {
        fetchItems('country');
    }
}

export function initializeContactForms(showToast) {
    document.querySelectorAll('[data-sharry-contact-form]').forEach(function (form) {
        if (form.dataset.contactInitialized === 'true') return;
        form.dataset.contactInitialized = 'true';
        form.setAttribute('novalidate', '');
        form.querySelectorAll('[data-sharry-catalog-picker]').forEach(function (picker) {
            initializeCatalogPicker(form, picker);
        });
        form.querySelectorAll('[data-sharry-location]').forEach(function (fieldset) {
            initializeLocation(fieldset);
        });

        form.querySelectorAll('input, select, textarea').forEach(function (input) {
            if (input.type === 'hidden' || input.name === '_token' || input.name === 'website') return;
            input.addEventListener('input', function () {
                if (input.checkValidity()) clearFieldError(input);
            });
            input.addEventListener('change', function () {
                if (input.checkValidity()) clearFieldError(input);
            });
        });

        form.addEventListener('reset', function () {
            form.querySelectorAll('input, select, textarea').forEach(function (input) {
                if (input.type === 'hidden' || input.name === '_token' || input.name === 'website') return;
                clearFieldError(input);
            });
        });

        form.addEventListener('submit', async function (event) {
            event.preventDefault();

            if (!form.checkValidity()) {
                var firstInvalid = showFieldErrors(form);
                if (firstInvalid) {
                    firstInvalid.focus();
                    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                return;
            }

            setFeedback(form, '', '');
            setSubmitting(form, true);

            try {
                var response = await fetch(
                    form.getAttribute('data-sharry-contact-action') || form.getAttribute('action'),
                    {
                        method: 'POST',
                        headers: {
                            Accept: 'application/json',
                            'X-CSRF-TOKEN': form.querySelector('input[name="_token"]')?.value || '',
                        },
                        body: new FormData(form),
                        credentials: 'same-origin',
                    }
                );
                var payload = await response.json();

                if (!response.ok) {
                    throw new Error(
                        firstValidationError(payload)
                        || payload.message
                        || form.getAttribute('data-sharry-contact-failed')
                        || 'Unable to submit the inquiry.'
                    );
                }

                var message = payload.message
                    || form.getAttribute('data-sharry-contact-success')
                    || '';

                setFeedback(form, 'success', message);
                if (typeof showToast === 'function' && message) showToast('success', message);

                form.reset();
                form.querySelectorAll('[data-sharry-catalog-picker]').forEach(function (picker) {
                    if (typeof picker._resetCatalog === 'function') picker._resetCatalog();
                });

                if (payload.redirect_url) {
                    window.setTimeout(function () {
                        window.location.assign(payload.redirect_url);
                    }, 1200);
                } else {
                    setSubmitting(form, false);
                }
            } catch (error) {
                var message = error && error.message
                    ? error.message
                    : form.getAttribute('data-sharry-contact-failed');

                setFeedback(form, 'error', message);
                if (typeof showToast === 'function' && message) showToast('error', message);
                setSubmitting(form, false);
            }
        });
    });
}
