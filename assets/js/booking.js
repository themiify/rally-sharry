export function initializeBookingForms(apiClient, showToast, unwrapPayload) {
    document.querySelectorAll('[data-booking-slot-root]').forEach(function (root) {
        if (root.dataset.bookingBound === '1') {
            return;
        }

        root.dataset.bookingBound = '1';

        if (root.getAttribute('data-booking-mode') === 'rental') {
            bindRentalBooking(root, apiClient, showToast, unwrapPayload);

            return;
        }

        bindStandardBooking(root, apiClient, showToast, unwrapPayload);
        bindTableBooking(root);
    });
}

function bindTableBooking(root) {
    var summary = root.querySelector('[data-booking-table-summary]');
    var guestsInput = root.querySelector('[data-booking-guests]');

    if (!summary || !guestsInput) {
        return;
    }

    var update = function () {
        var guests = Math.max(parseInt(guestsInput.value, 10) || 0, 0);
        var guestLimit = Math.max(parseInt(summary.getAttribute('data-guest-limit'), 10) || 1, 1);
        var units = summary.getAttribute('data-price-type') === 'table'
            ? Math.ceil(guests / guestLimit)
            : guests;
        var price = parseFloat(summary.getAttribute('data-price')) || 0;

        if (guests <= 0) {
            summary.textContent = '';

            return;
        }

        var totalLabel = summary.getAttribute('data-total-label') + ': ' + (price * units).toFixed(2);
        var tableLabel = summary.getAttribute('data-price-type') === 'table'
            ? summary.getAttribute('data-tables-label') + ': ' + Math.ceil(guests / guestLimit) + ' | '
            : '';

        summary.textContent = tableLabel + totalLabel;
    };

    guestsInput.addEventListener('input', update);
    update();
}

function bindStandardBooking(root, apiClient, showToast, unwrapPayload) {
    var dateInput = root.querySelector('[data-booking-date-input]');

    if (!dateInput) {
        return;
    }

    dateInput.addEventListener('change', function () {
        loadStandardBookingSlots(root, apiClient, showToast, unwrapPayload);
    });

    if (dateInput.value) {
        loadStandardBookingSlots(root, apiClient, showToast, unwrapPayload);
    }
}

function bindRentalBooking(root, apiClient, showToast, unwrapPayload) {
    var dateInput = root.querySelector('[data-booking-rental-date]');
    var slotSelect = root.querySelector('[data-booking-rental-slot-select]');
    var fromSelect = root.querySelector('[data-booking-rental-from]');
    var toSelect = root.querySelector('[data-booking-rental-to]');
    var dailyFrom = root.querySelector('[name="booking[date_from]"]');
    var dailyTo = root.querySelector('[name="booking[date_to]"]');

    root.querySelectorAll('[data-booking-renting-type]').forEach(function (input) {
        input.addEventListener('change', function () {
            toggleRentalMode(root);
            updateRentalPriceSummary(root);
        });
    });

    if (dateInput && slotSelect) {
        dateInput.addEventListener('change', function () {
            loadRentalBookingSlots(root, apiClient, showToast, unwrapPayload);
        });

        slotSelect.addEventListener('change', function () {
            populateRentalTimeSlots(root);
        });
    }

    [toSelect, dailyFrom, dailyTo].forEach(function (input) {
        if (input) {
            input.addEventListener('change', function () {
                updateRentalPriceSummary(root);
            });
        }
    });

    if (fromSelect) {
        fromSelect.addEventListener('change', function () {
            populateRentalEndSlots(root);
            updateRentalPriceSummary(root);
        });
    }

    toggleRentalMode(root);
    updateRentalPriceSummary(root);
}

function updateRentalPriceSummary(root) {
    var summary = root.querySelector('[data-booking-rental-price-summary]');

    if (!summary) {
        return;
    }

    var selectedType = root.querySelector('[data-booking-renting-type]:checked');
    var mode = selectedType ? selectedType.value : root.querySelector('[name="booking[renting_type]"]')?.value;
    var amount = 0;
    var duration = '';

    if (mode === 'daily') {
        var from = root.querySelector('[name="booking[date_from]"]')?.value;
        var to = root.querySelector('[name="booking[date_to]"]')?.value;

        if (from && to) {
            var start = new Date(from + 'T00:00:00');
            var end = new Date(to + 'T00:00:00');
            var days = Math.floor((end - start) / 86400000) + 1;

            if (days > 0) {
                amount = (parseFloat(summary.getAttribute('data-daily-price')) || 0) * days;
                duration = days + ' days';
            }
        }
    } else {
        var hourlyFrom = parseInt(root.querySelector('[data-booking-rental-from]')?.value, 10) || 0;
        var hourlyTo = parseInt(root.querySelector('[data-booking-rental-to]')?.value, 10) || 0;
        var hours = (hourlyTo - hourlyFrom) / 3600;

        if (hours > 0) {
            amount = (parseFloat(summary.getAttribute('data-hourly-price')) || 0) * hours;
            duration = hours + ' hours';
        }
    }

    summary.textContent = amount > 0
        ? summary.getAttribute('data-total-label') + ': ' + amount.toFixed(2) + ' (' + duration + ')'
        : '';
}

function toggleRentalMode(root) {
    var selectedType = root.querySelector('[data-booking-renting-type]:checked');
    var fixedType = root.querySelector('[name="booking[renting_type]"]:not([data-booking-renting-type])');
    var fields = root._bookingRentalFields || (root._bookingRentalFields = {
        daily: root.querySelector('[data-booking-rental-daily-fields]'),
        hourly: root.querySelector('[data-booking-rental-hourly-fields]'),
    });
    var mode = selectedType ? selectedType.value : fixedType && fixedType.value;
    var active = mode === 'daily' ? fields.daily : fields.hourly;
    var inactive = mode === 'daily' ? fields.hourly : fields.daily;

    if (inactive && inactive.parentNode) {
        inactive.parentNode.removeChild(inactive);
    }

    if (active && !active.parentNode) {
        root.appendChild(active);
    }

    if (active) {
        active.removeAttribute('hidden');
        active.querySelectorAll('[data-booking-rental-daily-input], [data-booking-rental-hourly-input]').forEach(function (input) {
            input.disabled = false;
            input.required = true;
        });
    }
}

function loadStandardBookingSlots(root, apiClient, showToast, unwrapPayload) {
    var url = root.getAttribute('data-booking-slots-url');
    var dateInput = root.querySelector('[data-booking-date-input]');
    var slotSelect = root.querySelector('[data-booking-slot-select]');

    if (!url || !dateInput || !slotSelect || !dateInput.value) {
        return;
    }

    setSelectLoading(slotSelect, root.getAttribute('data-loading-label'));

    apiClient.get(url, {
        date: dateInput.value,
        booking_type: root.getAttribute('data-booking-type') || undefined,
    })
        .then(function (responseData) {
            var payload = unwrapPayload(responseData) || [];
            var slots = Array.isArray(payload) ? payload : [];

            populateSelect(slotSelect, slots.map(function (slot) {
                return {
                    value: slot.timestamp || slot.from_timestamp || slot.from || '',
                    label: formatAvailabilityLabel(root, [slot.from, slot.to].filter(Boolean).join(' - '), slot),
                    disabled: slot.is_available === false,
                };
            }), root.getAttribute('data-empty-label'));
        })
        .catch(function () {
            populateSelect(slotSelect, [], root.getAttribute('data-empty-label'));
            showToast('error', root.getAttribute('data-error-label') || 'Unable to load booking slots.');
        });
}

function loadRentalBookingSlots(root, apiClient, showToast, unwrapPayload) {
    var url = root.getAttribute('data-booking-slots-url');
    var dateInput = root.querySelector('[data-booking-rental-date]');
    var slotSelect = root.querySelector('[data-booking-rental-slot-select]');

    if (!url || !dateInput || !slotSelect || !dateInput.value) {
        return;
    }

    setSelectLoading(slotSelect, root.getAttribute('data-loading-label'));

    apiClient.get(url, {
        date: dateInput.value,
        booking_type: root.getAttribute('data-booking-type') || undefined,
    })
        .then(function (responseData) {
            var payload = unwrapPayload(responseData) || [];

            root._glRentalSlots = Array.isArray(payload) ? payload : [];

            populateSelect(slotSelect, root._glRentalSlots.map(function (slot, index) {
                return {
                    value: String(index),
                    label: formatAvailabilityLabel(root, slot.time || '', slot),
                    disabled: slot.is_available === false,
                };
            }), root.getAttribute('data-empty-label'));

            populateRentalTimeSlots(root);
        })
        .catch(function () {
            root._glRentalSlots = [];
            populateSelect(slotSelect, [], root.getAttribute('data-empty-label'));
            populateRentalTimeSlots(root);
            showToast('error', root.getAttribute('data-error-label') || 'Unable to load booking slots.');
        });
}

function populateRentalTimeSlots(root) {
    var slotSelect = root.querySelector('[data-booking-rental-slot-select]');
    var fromSelect = root.querySelector('[data-booking-rental-from]');
    var toSelect = root.querySelector('[data-booking-rental-to]');
    var slots = root._glRentalSlots || [];
    var selectedSlot = slots[parseInt(slotSelect && slotSelect.value, 10)] || null;
    var timeSlots = selectedSlot && Array.isArray(selectedSlot.slots)
        ? selectedSlot.slots
        : [];

    populateSelect(fromSelect, timeSlots.map(function (slot) {
        return {
            value: slot.from_timestamp || '',
            label: formatAvailabilityLabel(root, slot.from || '', slot),
            disabled: slot.is_available === false,
        };
    }), root.getAttribute('data-select-time-label'));

    populateRentalEndSlots(root, timeSlots);
}

function populateRentalEndSlots(root, availableSlots) {
    var slotSelect = root.querySelector('[data-booking-rental-slot-select]');
    var fromSelect = root.querySelector('[data-booking-rental-from]');
    var toSelect = root.querySelector('[data-booking-rental-to]');
    var slots = root._glRentalSlots || [];
    var selectedSlot = slots[parseInt(slotSelect && slotSelect.value, 10)] || null;
    var timeSlots = (availableSlots || (selectedSlot && Array.isArray(selectedSlot.slots)
        ? selectedSlot.slots
        : [])).filter(function (slot) { return slot.is_available !== false; });
    var from = parseInt(fromSelect && fromSelect.value, 10) || 0;
    var usableSlots = timeSlots;

    populateSelect(toSelect, usableSlots
        .filter(function (slot) {
            return from > 0 && Number(slot.to_timestamp) > from && isContiguousRange(timeSlots, from, Number(slot.to_timestamp));
        })
        .map(function (slot) {
            return {
                value: slot.to_timestamp || '',
                label: formatAvailabilityLabel(root, slot.to || '', slot),
            };
        }), root.getAttribute('data-select-time-label'));
}

function formatAvailabilityLabel(root, label, slot) {
    if (slot.is_available === false) {
        return label + ' — ' + (root.getAttribute('data-sold-out-label') || 'Sold out');
    }

    if (slot.remaining_qty) {
        return label + ' — ' + slot.remaining_qty + ' ' + (root.getAttribute('data-remaining-label') || 'remaining');
    }

    return label;
}

function isContiguousRange(slots, from, to) {
    var cursor = from;

    while (cursor < to) {
        var segment = slots.find(function (slot) {
            return Number(slot.from_timestamp) === cursor;
        });

        if (!segment) {
            return false;
        }

        cursor = Number(segment.to_timestamp);
    }

    return cursor === to;
}

function setSelectLoading(select, loadingLabel) {
    populateSelect(select, [], loadingLabel || 'Loading...');
}

function populateSelect(select, options, placeholder) {
    if (!select) {
        return;
    }

    select.innerHTML = '';

    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = placeholder || '';
    select.appendChild(defaultOption);

    if (!options.length) {
        return;
    }

    options.forEach(function (optionConfig) {
        var option = document.createElement('option');
        option.value = optionConfig.value;
        option.textContent = optionConfig.label;
        option.disabled = optionConfig.disabled === true;
        select.appendChild(option);
    });
}
