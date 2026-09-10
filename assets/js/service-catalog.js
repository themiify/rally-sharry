export function initializeServiceCatalogInteractions() {
    document.querySelectorAll('[data-service-catalog-gallery-image]').forEach(function (image) {
        if (image.dataset.serviceCatalogInitialized) {
            return;
        }

        image.dataset.serviceCatalogInitialized = 'true';
        image.addEventListener('click', function () {
            openImageDialog(image.currentSrc || image.src, image.alt);
        });
        image.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openImageDialog(image.currentSrc || image.src, image.alt);
            }
        });
    });
}

function openImageDialog(src, alt) {
    var dialog = document.createElement('dialog');
    dialog.className = 'service-catalog-lightbox';
    dialog.innerHTML = '<button type="button" class="service-catalog-lightbox__close" aria-label="Close">&times;</button>'
        + '<img src="' + escapeAttribute(src) + '" alt="' + escapeAttribute(alt) + '">';

    dialog.addEventListener('click', function (event) {
        if (event.target === dialog || event.target.classList.contains('service-catalog-lightbox__close')) {
            dialog.close();
        }
    });
    dialog.addEventListener('close', function () {
        dialog.remove();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}

function escapeAttribute(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[character];
    });
}
