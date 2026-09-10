/**
 * Configurable product — cascading attribute selection.
 *
 * Mirrors the Blade/Vue component behaviour:
 *  1. Only the first attribute is enabled on mount.
 *  2. Selecting a value enables the next attribute and filters its
 *     options to only those compatible with the parent selection.
 *  3. Changing a parent resets and disables all children.
 *  4. Price and gallery update when ALL attributes are selected.
 *
 * The config object (base64-encoded in #gl-configurable-config) has:
 *   index          – { variantId: { attrId: optionId, … } }
 *   attributes     – [{ id, code, label, swatch_type, options: [{ id, label, products, swatch_value }] }]
 *   variant_prices  – { variantId: { regular, final } }
 *   variant_images  – { variantId: [{ small_image_url, large_image_url, … }] }
 *   variant_videos  – { variantId: [...] }
 *   variant_availability – { variantId: { available, out_of_stock } }
 *   variant_skus    – { variantId: sku }
 *   regular         – { price, formatted_price }   (base / "from" price)
 */
export function initConfigurableProduct() {
    var configEl = document.getElementById('gl-configurable-config');
    if (!configEl || configEl.dataset.initialized) return;
    configEl.dataset.initialized = 'true';

    var config;
    try {
        var b64 = configEl.textContent.trim();
        var jsonStr;
        try {
            jsonStr = new TextDecoder('utf-8').decode(
                Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); })
            );
        } catch (_) {
            jsonStr = decodeURIComponent(escape(atob(b64)));
        }
        config = JSON.parse(jsonStr);
    } catch (e) {
        console.warn('[Glamour] Failed to parse configurable config:', e);
        return;
    }
    if (!config || !config.index || !config.attributes) return;

    // ── DOM references ────────────────────────────────────────────────────
    var hiddenInput = document.getElementById('gl-selected-configurable-option');
    var priceCurrentEl = document.querySelector('.gl-product-info-price .current');
    var priceOriginalEl = document.querySelector('.gl-product-info-price .original');
    var priceLabelEl = document.querySelector('.gl-product-info-price .price-label');
    var mainImage = document.getElementById('glMainProductImage');
    var thumbsContainer = document.querySelector('.gl-product-gallery-thumbs');
    var variantsContainer = document.querySelector('.gl-product-variants');
    var availabilityEl = document.querySelector('[data-product-availability]');
    var skuEl = document.querySelector('[data-product-sku]');
    var purchaseButtons = document.querySelectorAll('[data-product-purchase-button]');
    var originalPurchaseDisabled = Array.from(purchaseButtons, function (button) {
        return button.disabled;
    });
    if (!variantsContainer) return;

    // i18n labels passed via data-attributes on the container
    var selectLabel = variantsContainer.getAttribute('data-select-label') || 'Select';
    var selectAboveLabel = variantsContainer.getAttribute('data-select-above-label') || 'Select above option first';
    var outOfStockLabel = variantsContainer.getAttribute('data-out-of-stock-label') || 'Out of stock';

    // Snapshot original gallery for reset
    var originalMainSrc = mainImage ? mainImage.src : '';
    var originalSku = skuEl ? skuEl.textContent : '';
    var originalAvailability = availabilityEl ? availabilityEl.textContent : '';
    var originalAvailabilityClass = availabilityEl ? availabilityEl.className : '';
    var originalThumbs = [];
    if (thumbsContainer) {
        thumbsContainer.querySelectorAll('img').forEach(function (img) {
            originalThumbs.push({ src: img.src, full: img.dataset.full || img.src });
        });
    }

    // ── Build childAttributes (mirrors Vue mounted) ───────────────────────
    var childAttributes = [];
    var sourceAttributes = JSON.parse(JSON.stringify(config.attributes));

    for (var idx = sourceAttributes.length - 1; idx >= 0; idx--) {
        var attr = sourceAttributes[idx];
        attr.selectedValue = null;
        attr.disabled = idx > 0;
        attr.filteredOptions = [];
        attr.childAttributes = childAttributes.slice();
        attr.prevAttribute = idx > 0 ? sourceAttributes[idx - 1] : null;
        attr.nextAttribute = idx < sourceAttributes.length - 1 ? sourceAttributes[idx + 1] : null;
        childAttributes.unshift(attr);
    }

    if (childAttributes.length > 0) {
        fillAttributeOptions(childAttributes[0]);
    }

    var possibleOptionVariant = null;
    var selectedOptionVariant = null;

    renderAttributes();

    // ── Core cascading helpers ────────────────────────────────────────────

    function fillAttributeOptions(attribute) {
        var original = config.attributes.find(function (a) { return a.id === attribute.id; });
        var options = original ? original.options : [];

        var prevSelected = null;
        if (attribute.prevAttribute) {
            prevSelected = attribute.prevAttribute.filteredOptions.find(function (o) {
                return String(o.id) === String(attribute.prevAttribute.selectedValue);
            });
        }

        attribute.filteredOptions = [];

        for (var i = 0; i < options.length; i++) {
            var opt = options[i];
            if (!opt.id) continue;

            var allowed = [];
            if (prevSelected && prevSelected.allowedProducts) {
                for (var j = 0; j < opt.products.length; j++) {
                    if (prevSelected.allowedProducts.indexOf(opt.products[j]) !== -1) {
                        allowed.push(opt.products[j]);
                    }
                }
            } else {
                allowed = opt.products.slice();
            }

            if (allowed.length > 0) {
                var availableProducts = allowed.filter(isVariantAvailable);
                attribute.filteredOptions.push(Object.assign({}, opt, {
                    allowedProducts: allowed,
                    availableProducts: availableProducts,
                    disabled: availableProducts.length === 0,
                }));
            }
        }
    }

    function resetChildAttributes(attribute) {
        if (!attribute.childAttributes) return;
        attribute.childAttributes.forEach(function (child) {
            child.selectedValue = null;
            child.disabled = true;
            child.filteredOptions = [];
        });
    }

    function configure(attribute, optionId) {
        possibleOptionVariant = null;

        if (optionId) {
            var matched = attribute.filteredOptions.find(function (o) {
                return String(o.id) === String(optionId);
            });
            if (!matched || matched.disabled) return;
            if (matched.availableProducts && matched.availableProducts.length) {
                possibleOptionVariant = matched.availableProducts[0];
            } else if (matched.allowedProducts) {
                possibleOptionVariant = matched.allowedProducts[0];
            }

            attribute.selectedValue = optionId;

            if (attribute.nextAttribute) {
                selectedOptionVariant = null;
                attribute.nextAttribute.disabled = false;
                attribute.nextAttribute.selectedValue = null;
                fillAttributeOptions(attribute.nextAttribute);
                resetChildAttributes(attribute.nextAttribute);
            } else {
                selectedOptionVariant = possibleOptionVariant;
            }
        } else {
            attribute.selectedValue = null;
            selectedOptionVariant = null;
            if (attribute.nextAttribute) {
                attribute.nextAttribute.selectedValue = null;
                attribute.nextAttribute.disabled = true;
            }
            resetChildAttributes(attribute);
        }

        if (hiddenInput) hiddenInput.value = selectedOptionVariant || '';

        reloadPrice();
        reloadImages();
        reloadVariantDetails();
        renderAttributes();
    }

    function isVariantAvailable(variantId) {
        var availability = config.variant_availability && (
            config.variant_availability[variantId]
            || config.variant_availability[String(variantId)]
        );

        return availability ? availability.available !== false : true;
    }

    function reloadVariantDetails() {
        var fullySelected = childAttributes.every(function (attribute) {
            return Boolean(attribute.selectedValue);
        });
        var variantId = fullySelected ? selectedOptionVariant : null;
        var available = variantId ? isVariantAvailable(variantId) : null;

        if (skuEl) {
            skuEl.textContent = variantId && config.variant_skus && config.variant_skus[variantId]
                ? config.variant_skus[variantId]
                : originalSku;
        }

        if (availabilityEl) {
            if (!variantId) {
                availabilityEl.textContent = originalAvailability;
                availabilityEl.className = originalAvailabilityClass;
            } else {
                availabilityEl.textContent = available
                    ? availabilityEl.dataset.inStockLabel
                    : availabilityEl.dataset.outOfStockLabel;
                availabilityEl.classList.toggle('in-stock', available);
                availabilityEl.classList.toggle('out-of-stock', !available);
            }
        }

        purchaseButtons.forEach(function (button, index) {
            button.disabled = fullySelected
                ? !available
                : originalPurchaseDisabled[index];
        });
    }

    // ── Price ─────────────────────────────────────────────────────────────

    function reloadPrice() {
        var selectedCount = childAttributes.filter(function (a) { return a.selectedValue; }).length;

        if (selectedCount === childAttributes.length && possibleOptionVariant) {
            var vp = config.variant_prices && config.variant_prices[possibleOptionVariant];
            if (vp) {
                if (priceLabelEl) priceLabelEl.style.display = 'none';
                if (priceCurrentEl) {
                    priceCurrentEl.textContent = vp.final
                        ? vp.final.formatted_price
                        : (vp.regular ? vp.regular.formatted_price : priceCurrentEl.textContent);
                }
                if (priceOriginalEl) {
                    if (vp.regular && vp.final && Number(vp.regular.price) > Number(vp.final.price)) {
                        priceOriginalEl.textContent = vp.regular.formatted_price;
                        priceOriginalEl.style.display = '';
                    } else {
                        priceOriginalEl.style.display = 'none';
                    }
                }
            }
        } else {
            if (priceLabelEl) priceLabelEl.style.display = '';
            if (config.regular && priceCurrentEl) {
                priceCurrentEl.textContent = config.regular.formatted_price;
            }
            if (priceOriginalEl) priceOriginalEl.style.display = 'none';
        }
    }

    // ── Gallery ───────────────────────────────────────────────────────────

    function reloadImages() {
        if (!possibleOptionVariant) {
            if (mainImage) mainImage.src = originalMainSrc;
            if (thumbsContainer && originalThumbs.length) {
                thumbsContainer.innerHTML = '';
                originalThumbs.forEach(function (t, i) {
                    var el = document.createElement('img');
                    el.src = t.src; el.alt = ''; el.loading = 'lazy';
                    el.dataset.full = t.full; el.style.cursor = 'pointer';
                    if (i === 0) el.className = 'active';
                    thumbsContainer.appendChild(el);
                });
            }
            return;
        }

        var images = config.variant_images && config.variant_images[possibleOptionVariant];
        if (images && images.length > 0) {
            if (mainImage) {
                mainImage.src = images[0].large_image_url || images[0].url || images[0].medium_image_url || mainImage.src;
            }
            if (thumbsContainer) {
                thumbsContainer.innerHTML = '';
                images.forEach(function (img, i) {
                    var el = document.createElement('img');
                    el.src = img.small_image_url || img.url;
                    el.alt = ''; el.loading = 'lazy';
                    el.dataset.full = img.large_image_url || img.url;
                    el.style.cursor = 'pointer';
                    if (i === 0) el.className = 'active';
                    thumbsContainer.appendChild(el);
                });
            }
        }
    }

    // ── DOM rendering (JS takes over the variants container) ──────────────

    function renderAttributes() {
        if (!variantsContainer) return;
        variantsContainer.innerHTML = '';

        childAttributes.forEach(function (attribute) {
            var wrapper = document.createElement('div');
            wrapper.className = 'gl-variant-attribute';

            // سطر الـ label + القيمة المختارة
            var labelRow = document.createElement('div');
            labelRow.className = 'gl-variant-label-row';

            var labelEl = document.createElement('span');
            labelEl.className = 'gl-variant-label';
            labelEl.textContent = attribute.label + ' :';

            var valueEl = document.createElement('span');
            valueEl.className = 'gl-variant-value';
            var currentOpt = attribute.filteredOptions.find(function(o){
                return String(o.id) === String(attribute.selectedValue);
            });
            valueEl.textContent = currentOpt ? currentOpt.label : '';
            // نحط data attribute عشان نقدر نحدثه من renderColorSwatch
            valueEl.setAttribute('data-attr-value-label', attribute.id);

            labelRow.appendChild(labelEl);
            labelRow.appendChild(valueEl);
            wrapper.appendChild(labelRow);

            var hasOptionVisual = attribute.filteredOptions.some(function (option) {
                return Boolean(option.visual_url);
            });

            if (hasOptionVisual || attribute.swatch_type === 'image') {
                renderImageSwatch(wrapper, attribute);
            } else if (attribute.swatch_type === 'color') {
                renderColorSwatch(wrapper, attribute);
            } else {
                renderDropdown(wrapper, attribute);
            }

            variantsContainer.appendChild(wrapper);
        });
    }

    function renderDropdown(wrapper, attribute) {
        var select = document.createElement('select');
        select.name = 'super_attribute[' + attribute.id + ']';
        select.className = 'gl-select';
        select.required = true;
        select.disabled = attribute.disabled;

        var def = document.createElement('option');
        def.value = '';
        def.textContent = attribute.disabled ? selectAboveLabel : selectLabel + ' ' + attribute.label;
        select.appendChild(def);

        if (!attribute.disabled) {
            attribute.filteredOptions.forEach(function (opt) {
                var o = document.createElement('option');
                o.value = opt.id;
                o.textContent = opt.label;
                o.disabled = Boolean(opt.disabled);
                if (String(opt.id) === String(attribute.selectedValue)) o.selected = true;
                select.appendChild(o);
            });
        }

        select.addEventListener('change', function () { configure(attribute, this.value); });
        wrapper.appendChild(select);
    }

    function renderColorSwatch(wrapper, attribute) {
        var box = document.createElement('div');
        box.className = 'gl-variant-swatch-box';

        if (attribute.disabled) {
            box.innerHTML = '<span class="gl-variant-disabled-text">' + selectAboveLabel + '</span>';
            wrapper.appendChild(box);
            return;
        }

        // Label يعرض الاختيار الحالي
        var selectedLabel = document.createElement('span');
        selectedLabel.className = 'gl-variant-selected-label';
        var currentOpt = attribute.filteredOptions.find(function(o){ return String(o.id) === String(attribute.selectedValue); });
        selectedLabel.textContent = currentOpt ? currentOpt.label : '';

        attribute.filteredOptions.forEach(function (opt) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.title = opt.label;
            btn.setAttribute('aria-label', opt.label);
            btn.setAttribute('aria-pressed', String(opt.id) === String(attribute.selectedValue) ? 'true' : 'false');
            btn.className = 'gl-variant-color-btn';
            btn.disabled = Boolean(opt.disabled);
            btn.setAttribute('aria-disabled', opt.disabled ? 'true' : 'false');

            var circle = document.createElement('span');
            circle.className = 'gl-variant-color-circle';
            circle.style.backgroundColor = opt.swatch_value || '#e5e7eb';

            btn.appendChild(circle);

            btn.addEventListener('click', function () {
                // reset كل الأزرار
                box.querySelectorAll('button').forEach(function(b){
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.setAttribute('aria-pressed', 'true');
                selectedLabel.textContent = opt.label;
                configure(attribute, opt.id);
            });

            box.appendChild(btn);
        });

        box.appendChild(selectedLabel);
        wrapper.appendChild(box);
    }

    function renderImageSwatch(wrapper, attribute) {
        var box = document.createElement('div');
        box.className = 'gl-variant-image-swatch-box';

        if (attribute.disabled) {
            box.innerHTML = '<span class="gl-variant-disabled-text">' + selectAboveLabel + '</span>';
            wrapper.appendChild(box);
            return;
        }

        attribute.filteredOptions.forEach(function (opt) {
            var lbl = document.createElement('label');
            lbl.className = 'gl-variant-image-label';
            lbl.setAttribute('aria-label', opt.disabled
                ? opt.label + ' (' + outOfStockLabel + ')'
                : opt.label);

            var inp = document.createElement('input');
            inp.type = 'radio'; inp.name = 'super_attribute[' + attribute.id + ']';
            inp.value = opt.id; inp.required = true;
            inp.disabled = Boolean(opt.disabled);
            if (String(opt.id) === String(attribute.selectedValue)) inp.checked = true;
            inp.addEventListener('change', function () { configure(attribute, this.value); });

            var txt = document.createElement('span');
            txt.className = 'gl-variant-image-text';
            txt.textContent = opt.disabled
                ? opt.label + ' (' + outOfStockLabel + ')'
                : opt.label;

            lbl.appendChild(inp);

            var imageUrl = opt.visual_url || (attribute.swatch_type === 'image' ? opt.swatch_value : '');
            if (imageUrl) {
                var img = document.createElement('img');
                img.src = imageUrl;
                img.alt = opt.label;
                img.className = 'gl-variant-image-img';
                img.addEventListener('error', function () {
                    img.remove();

                    if (attribute.swatch_type === 'color') {
                        var color = document.createElement('span');
                        color.className = 'gl-variant-color-circle';
                        color.style.backgroundColor = opt.swatch_value || '#e5e7eb';
                        lbl.insertBefore(color, txt);
                    }
                }, { once: true });
                lbl.appendChild(img);
            } else if (attribute.swatch_type === 'color') {
                var color = document.createElement('span');
                color.className = 'gl-variant-color-circle';
                color.style.backgroundColor = opt.swatch_value || '#e5e7eb';
                lbl.appendChild(color);
            }

            lbl.appendChild(txt);
            box.appendChild(lbl);
        });

        wrapper.appendChild(box);
    }
}
