var SOCIAL_EMBED_SCRIPT_URLS = {
    x: 'https://platform.twitter.com/widgets.js',
    tiktok: 'https://www.tiktok.com/embed.js',
    snapchat: 'https://www.snapchat.com/embed.js',
    pinterest: 'https://assets.pinterest.com/js/pinit.js',
};

var socialEmbedScriptPromises = window.__glSocialEmbedScriptPromises || {};
window.__glSocialEmbedScriptPromises = socialEmbedScriptPromises;

export function initializeSocialEmbeds() {
    document.querySelectorAll('[data-social-embed]').forEach(function (container) {
        if (container.dataset.socialEmbedInitialized) {
            return;
        }

        var provider = container.getAttribute('data-social-embed');
        var scriptUrl = SOCIAL_EMBED_SCRIPT_URLS[provider];

        if (!scriptUrl) {
            return;
        }

        container.dataset.socialEmbedInitialized = 'true';
        loadSocialEmbedScript(scriptUrl).then(function () {
            initializeSocialEmbedProvider(provider, container);
        }).catch(function () {
            container.dataset.socialEmbedUnavailable = 'true';
        });
    });
}

function loadSocialEmbedScript(scriptUrl) {
    if (socialEmbedScriptPromises[scriptUrl]) {
        return socialEmbedScriptPromises[scriptUrl];
    }

    socialEmbedScriptPromises[scriptUrl] = new Promise(function (resolve, reject) {
        var existingScript = document.querySelector('script[data-gl-social-script="' + scriptUrl + '"]');

        if (existingScript) {
            if (existingScript.dataset.loaded === 'true') {
                resolve();
                return;
            }

            existingScript.addEventListener('load', resolve, { once: true });
            existingScript.addEventListener('error', reject, { once: true });
            return;
        }

        var script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.defer = true;
        script.dataset.glSocialScript = scriptUrl;
        script.addEventListener('load', function () {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', reject, { once: true });
        document.head.appendChild(script);
    });

    return socialEmbedScriptPromises[scriptUrl];
}

function initializeSocialEmbedProvider(provider, container) {
    if (provider === 'x' && window.twttr && window.twttr.widgets) {
        window.twttr.widgets.load(container);
    }

    if (provider === 'pinterest' && window.PinUtils && window.PinUtils.build) {
        window.PinUtils.build();
    }
}
