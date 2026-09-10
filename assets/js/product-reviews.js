function isTrue(value) {
    return value === 'true' || value === '1';
}

function safeUrl(value) {
    if (!value) {
        return '';
    }

    try {
        var parsed = new URL(value, window.location.origin);

        return ['http:', 'https:'].indexOf(parsed.protocol) !== -1 ? parsed.href : '';
    } catch (error) {
        return '';
    }
}

function firstErrorMessage(error, fallback) {
    var data = error && error.data ? error.data : {};
    var errors = data.errors || {};
    var keys = Object.keys(errors);

    if (keys.length) {
        var value = errors[keys[0]];

        return Array.isArray(value) ? String(value[0] || '') : String(value || '');
    }

    return data.message || fallback || '';
}

function getReviewName(review) {
    return String(review && review.name ? review.name : '');
}

function getInitials(name) {
    return name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(function (part) {
            return part.charAt(0).toUpperCase();
        })
        .join('')
        .slice(0, 3);
}

function selectRating(root, rating, focusButton) {
    var input = root.querySelector('[data-review-rating-input]');
    var buttons = root.querySelectorAll('[data-review-rating-value]');
    var selected = Math.min(5, Math.max(1, parseInt(rating, 10) || 5));

    if (input) {
        input.value = String(selected);
    }

    buttons.forEach(function (button) {
        var ratingValue = parseInt(button.getAttribute('data-review-rating-value'), 10);
        var isSelected = ratingValue === selected;
        button.classList.toggle('is-selected', ratingValue <= selected);
        button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });

    if (focusButton) {
        focusButton.focus();
    }
}

function setFormMessage(root, message) {
    var messageElement = root.querySelector('[data-review-form-message]');

    if (!messageElement) {
        return;
    }

    messageElement.textContent = message || '';
    messageElement.hidden = !message;
}

function setFormSubmitting(form, submitting) {
    var submitButton = form.querySelector('[data-review-submit]');

    if (!submitButton) {
        return;
    }

    if (submitting) {
        if (!submitButton.dataset.originalLabel) {
            submitButton.dataset.originalLabel = submitButton.textContent;
        }

        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.textContent = form.closest('[data-product-reviews]')?.dataset.reviewLoadingLabel || submitButton.dataset.originalLabel;
    } else {
        submitButton.disabled = false;
        submitButton.setAttribute('aria-busy', 'false');

        if (submitButton.dataset.originalLabel) {
            submitButton.textContent = submitButton.dataset.originalLabel;
        }
    }
}

function canSubmitReview(root, state) {
    var settingsEnabled = isTrue(root.dataset.reviewEnabled);
    var guestEnabled = isTrue(root.dataset.reviewGuestEnabled);
    var isLoggedIn = !!(state && state.auth && state.auth.is_logged_in);

    return settingsEnabled && (guestEnabled || isLoggedIn);
}

function updateEmptyReviewAction(root) {
    var list = root.querySelector('[data-review-list]');
    var emptyAction = root.querySelector('[data-review-empty-action]');
    var summaryAction = root.querySelector('[data-review-summary-action]');
    var writeButton = root.querySelector('[data-review-write]');
    var canReview = writeButton && !writeButton.hidden;
    var hasReviews = !!(list && list.children.length);

    if (emptyAction) {
        emptyAction.hidden = hasReviews || !canReview;
    }

    if (summaryAction) {
        summaryAction.hidden = !canReview;
    }
}

function syncReviewAccess(root, state) {
    var guestEnabled = isTrue(root.dataset.reviewGuestEnabled);
    var isLoggedIn = !!(state && state.auth && state.auth.is_logged_in);
    var canReview = canSubmitReview(root, state);
    var form = root.querySelector('[data-review-form]');
    var nameField = root.querySelector('[data-review-guest-name-field]');
    var nameInput = root.querySelector('[data-review-guest-name-input]');

    root.querySelectorAll('[data-review-write]').forEach(function (button) {
        button.hidden = !canReview;
    });

    if (nameField) {
        nameField.hidden = !guestEnabled || isLoggedIn;
    }

    if (nameInput) {
        nameInput.required = guestEnabled && !isLoggedIn;
    }

    if (!canReview && form) {
        form.hidden = true;
        root.querySelector('[data-review-content]').hidden = false;
    }

    updateEmptyReviewAction(root);
}

function getReviewAvatarUrl(review) {
    var profile = safeUrl(review && (review.avatar || review.profile || (review.user && (review.user.avatar || review.user.profile))));
    if (!profile) {
        var rawImgs = (review && (review.images || review.media || review.attachments || review.photos || review.files)) || [];
        if (!Array.isArray(rawImgs) && typeof rawImgs === 'object' && rawImgs) {
            rawImgs = [rawImgs];
        }
        if (!rawImgs.length && review && (review.image || review.image_url || review.photo || review.file_url)) {
            rawImgs = [review.image || review.image_url || review.photo || review.file_url];
        }
        if (rawImgs.length) {
            var firstItem = rawImgs[0];
            profile = safeUrl(typeof firstItem === 'string' ? firstItem : (firstItem && (firstItem.url || firstItem.src || firstItem.image)));
        }
    }
    return profile;
}

function createAvatar(review) {
    var name = getReviewName(review);
    var profile = getReviewAvatarUrl(review);

    if (profile) {
        var image = document.createElement('img');
        image.className = 'gl-product-review-avatar';
        image.src = profile;
        image.alt = name;
        image.loading = 'lazy';

        return image;
    }

    var placeholder = document.createElement('span');
    placeholder.className = 'gl-product-review-avatar gl-product-review-avatar-placeholder';
    placeholder.textContent = getInitials(name);
    placeholder.setAttribute('aria-hidden', 'true');

    return placeholder;
}

function appendReviewStars(container, rating) {
    var parsedRating = Math.min(5, Math.max(0, parseInt(rating, 10) || 0));

    for (var index = 1; index <= 5; index += 1) {
        var star = document.createElement('span');
        star.textContent = '★';
        star.className = index <= parsedRating ? 'is-filled' : '';
        star.setAttribute('aria-hidden', 'true');
        container.appendChild(star);
    }
}

function appendReviewAttachments(card, review) {
    var rawImgs = (review && (review.images || review.media || review.attachments || review.photos || review.files)) || [];
    if (!Array.isArray(rawImgs) && typeof rawImgs === 'object' && rawImgs) {
        rawImgs = [rawImgs];
    }
    if (!rawImgs.length && review && (review.image || review.image_url || review.photo || review.file_url)) {
        rawImgs = [review.image || review.image_url || review.photo || review.file_url];
    }

    var userAvatarUrl = getReviewAvatarUrl(review);

    var validAttachments = [];
    rawImgs.forEach(function (item) {
        var url = typeof item === 'string' ? item : (item && (item.url || item.src || item.image || item.original || item.thumb || item.path || item.file || item.link));
        var cleanUrl = safeUrl(url);
        if (cleanUrl && cleanUrl !== userAvatarUrl) {
            validAttachments.push({
                url: cleanUrl,
                type: (item && item.type) || (/\.(mp4|webm|mov)$/i.test(cleanUrl) ? 'video' : 'image')
            });
        }
    });

    if (!validAttachments.length) {
        return;
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'gl-product-review-attachments-list';

    validAttachments.forEach(function (file) {
        var link = document.createElement('a');
        var url = safeUrl(file.url);

        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        if (file.type === 'image') {
            var image = document.createElement('img');
            image.src = url;
            image.alt = getReviewName(review);
            image.loading = 'lazy';
            link.appendChild(image);
        } else {
            var video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.preload = 'metadata';
            video.setAttribute('aria-label', getReviewName(review));
            link.appendChild(video);
        }

        wrapper.appendChild(link);
    });

    card.appendChild(wrapper);
}

function translateReview(root, review, button, apiClient, showToast) {
    var template = root.dataset.reviewTranslateUrl || '';
    var url = template.replace(':reviewId', encodeURIComponent(review.id));
    var translatingLabel = root.dataset.reviewTranslatingLabel || '';
    var translateLabel = root.dataset.reviewTranslateLabel || '';
    var errorLabel = root.dataset.reviewTranslationErrorLabel || '';

    if (!url || !review.id || button.disabled) {
        return;
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = translatingLabel;

    apiClient.get(url)
        .then(function (responseData) {
            var content = responseData && responseData.content
                ? responseData.content
                : responseData && responseData.data
                    ? responseData.data.content
                    : '';
            var comment = button.closest('[data-review-card]')?.querySelector('[data-review-comment]');

            if (comment && content) {
                comment.textContent = content;
            }
        })
        .catch(function (error) {
            var message = firstErrorMessage(error, errorLabel);

            if (typeof showToast === 'function' && message) {
                showToast('error', message);
            }
        })
        .finally(function () {
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            button.textContent = translateLabel;
        });
}

function createReviewCard(root, review, apiClient, showToast) {
    var card = document.createElement('article');
    var header = document.createElement('div');
    var identity = document.createElement('div');
    var name = document.createElement('h4');
    var date = document.createElement('time');
    var stars = document.createElement('div');
    var title = document.createElement('h5');
    var comment = document.createElement('p');
    var reviewName = getReviewName(review);

    card.className = 'gl-product-review-card';
    card.setAttribute('data-review-card', '');

    header.className = 'gl-product-review-card-header';
    identity.className = 'gl-product-review-identity';
    name.textContent = reviewName;
    date.textContent = review && review.created_at ? String(review.created_at) : '';
    date.hidden = !date.textContent;
    stars.className = 'gl-product-review-card-stars';
    stars.setAttribute('aria-label', String(review && review.rating ? review.rating : 0) + ' ' + (root.dataset.reviewRatingLabel || ''));
    comment.className = 'gl-product-review-comment';
    comment.textContent = review && review.comment ? String(review.comment) : '';
    comment.setAttribute('data-review-comment', '');

    identity.appendChild(createAvatar(review));
    var identityText = document.createElement('div');
    identityText.appendChild(name);
    identityText.appendChild(date);
    identity.appendChild(identityText);
    header.appendChild(identity);
    appendReviewStars(stars, review && review.rating);
    header.appendChild(stars);
    card.appendChild(header);

    if (review && review.title) {
        title.textContent = String(review.title);
        card.appendChild(title);
    }

    card.appendChild(comment);

    if (isTrue(root.dataset.reviewTranslationEnabled) && root.dataset.reviewTranslateUrl) {
        var translateButton = document.createElement('button');
        translateButton.type = 'button';
        translateButton.className = 'gl-btn gl-btn-outline gl-product-review-translate';
        translateButton.textContent = root.dataset.reviewTranslateLabel || '';
        translateButton.addEventListener('click', function () {
            translateReview(root, review, translateButton, apiClient, showToast);
        });
        card.appendChild(translateButton);
    }

    appendReviewAttachments(card, review);

    return card;
}

function updateReviewState(root, state) {
    var list = root.querySelector('[data-review-list]');
    var empty = root.querySelector('[data-review-empty]');
    var loadMore = root.querySelector('[data-review-load-more]');

    if (empty) {
        empty.hidden = !!(list && list.children.length);
    }

    if (loadMore) {
        loadMore.hidden = !state.nextUrl;
    }

    updateEmptyReviewAction(root);
}

function loadReviews(root, state, apiClient, showToast) {
    if (!state.nextUrl || state.loading) {
        return;
    }

    var list = root.querySelector('[data-review-list]');
    var loading = root.querySelector('[data-review-loading]');
    var loadMore = root.querySelector('[data-review-load-more]');
    var isInitialLoad = !state.hasLoaded;

    state.loading = true;

    if (loading) {
        loading.hidden = false;
    }

    if (isInitialLoad) {
        var empty = root.querySelector('[data-review-empty]');

        if (empty) {
            empty.hidden = true;
        }
    }

    if (loadMore) {
        loadMore.disabled = true;
        loadMore.setAttribute('aria-busy', 'true');
        loadMore.textContent = root.dataset.reviewLoadingLabel || loadMore.textContent;
    }

    apiClient.get(state.nextUrl)
        .then(function (responseData) {
            var items = responseData && Array.isArray(responseData.data) ? responseData.data : [];

            if (isInitialLoad && list) {
                list.replaceChildren();
            }

            items.forEach(function (review) {
                if (list) {
                    list.appendChild(createReviewCard(root, review, apiClient, showToast));
                }
            });

            state.nextUrl = responseData && responseData.links ? responseData.links.next || '' : '';
            state.hasLoaded = true;

            var totalCount = responseData && responseData.meta && responseData.meta.total !== undefined 
                ? responseData.meta.total 
                : (items && items.length ? items.length : 0);

            if (totalCount > 0) {
                document.querySelectorAll('[data-review-count]').forEach(function (el) {
                    el.textContent = String(totalCount);
                });
            }

            updateReviewState(root, state);
        })
        .catch(function (error) {
            var message = firstErrorMessage(error, root.dataset.reviewLoadErrorLabel || '');

            if (typeof showToast === 'function' && message) {
                showToast('error', message);
            }
        })
        .finally(function () {
            state.loading = false;

            if (loading) {
                loading.hidden = true;
            }

            if (loadMore) {
                loadMore.disabled = false;
                loadMore.setAttribute('aria-busy', 'false');
                loadMore.textContent = root.dataset.reviewLoadMoreLabel || loadMore.textContent;
            }
        });
}

function resetReviewForm(root, state) {
    var form = root.querySelector('[data-review-form]');

    if (form) {
        form.reset();
    }

    selectRating(root, 5);
    setFormMessage(root, '');
    syncReviewAccess(root, state);
}

function bindReviewRoot(root, state, apiClient, showToast) {
    if (root.dataset.reviewInitialized === 'true') {
        syncReviewAccess(root, state);
        return;
    }

    root.dataset.reviewInitialized = 'true';

    var reviewState = {
        nextUrl: root.dataset.reviewIndexUrl || '',
        loading: false,
        hasLoaded: false,
    };
    var content = root.querySelector('[data-review-content]');
    var form = root.querySelector('[data-review-form]');

    root.querySelectorAll('[data-review-write]').forEach(function (button) {
        button.addEventListener('click', function () {
            if (!canSubmitReview(root, state) || !form || !content) {
                return;
            }

            content.hidden = true;
            form.hidden = false;
            setFormMessage(root, '');

            var firstField = form.querySelector('input:not([type="hidden"]), textarea');
            if (firstField) {
                firstField.focus();
            }
        });
    });

    var cancelButton = root.querySelector('[data-review-cancel]');
    if (cancelButton) {
        cancelButton.addEventListener('click', function () {
            if (form && content) {
                resetReviewForm(root, state);
                form.hidden = true;
                content.hidden = false;
            }
        });
    }

    root.querySelectorAll('[data-review-rating-value]').forEach(function (button) {
        button.addEventListener('click', function () {
            selectRating(root, button.getAttribute('data-review-rating-value'));
        });

        button.addEventListener('keydown', function (event) {
            var buttons = Array.from(root.querySelectorAll('[data-review-rating-value]'));
            var index = buttons.indexOf(button);
            var isRtl = document.documentElement.dir === 'rtl';
            var nextIndex = index;

            if (event.key === 'Home') {
                nextIndex = 0;
            } else if (event.key === 'End') {
                nextIndex = buttons.length - 1;
            } else if (event.key === 'ArrowRight') {
                nextIndex = isRtl ? index - 1 : index + 1;
            } else if (event.key === 'ArrowLeft') {
                nextIndex = isRtl ? index + 1 : index - 1;
            } else {
                return;
            }

            event.preventDefault();
            nextIndex = Math.min(buttons.length - 1, Math.max(0, nextIndex));
            selectRating(root, buttons[nextIndex].getAttribute('data-review-rating-value'), buttons[nextIndex]);
        });
    });

    if (form && !form.dataset.submitBound) {
        form.dataset.submitBound = 'true';
        form.addEventListener('submit', function (event) {
            event.preventDefault();

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            setFormMessage(root, '');
            setFormSubmitting(form, true);

            var formData = new FormData(form);
            var fileInput = form.querySelector('[data-review-attachments]');
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                for (var i = 0; i < fileInput.files.length; i++) {
                    var file = fileInput.files[i];
                    formData.append('images[]', file);
                    formData.append('attachments[]', file);
                    formData.append('photos[]', file);
                    formData.append('files[]', file);
                    formData.append('media[]', file);
                    if (i === 0) {
                        formData.append('image', file);
                        formData.append('attachment', file);
                    }
                }
            }

            apiClient.sendForm(
                form.getAttribute('action') || root.dataset.reviewStoreUrl,
                formData
            )
                .then(function (responseData) {
                    var payload = responseData && responseData.data ? responseData.data : responseData;
                    var message = responseData && responseData.message
                        ? responseData.message
                        : payload && payload.message
                            ? payload.message
                            : root.dataset.reviewSuccessLabel || '';

                    if (typeof showToast === 'function' && message) {
                        showToast('success', message);
                    }

                    resetReviewForm(root, state);
                    form.hidden = true;
                    if (content) {
                        content.hidden = false;
                    }
                })
                .catch(function (error) {
                    var message = firstErrorMessage(
                        error,
                        root.dataset.reviewErrorLabel || root.dataset.reviewFailedUploadLabel || ''
                    );

                    setFormMessage(root, message);

                    if (typeof showToast === 'function' && message) {
                        showToast('error', message);
                    }
                })
                .finally(function () {
                    setFormSubmitting(form, false);
                });
        });
    }

    var loadMore = root.querySelector('[data-review-load-more]');
    if (loadMore) {
        loadMore.addEventListener('click', function () {
            loadReviews(root, reviewState, apiClient, showToast);
        });
    }

    syncReviewAccess(root, state);
    selectRating(root, 5);
    updateReviewState(root, reviewState);
    loadReviews(root, reviewState, apiClient, showToast);
}

export function initializeProductReviews(apiClient, showToast, state) {
    document.querySelectorAll('[data-product-reviews]').forEach(function (root) {
        bindReviewRoot(root, state, apiClient, showToast);
    });
}
