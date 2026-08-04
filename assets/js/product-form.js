export function validateProductForm(form, showToast) {
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
        return false;
    }

    var requiredGroups = form.querySelectorAll('[data-gl-required-option="1"]');

    for (var groupIndex = 0; groupIndex < requiredGroups.length; groupIndex += 1) {
        var group = requiredGroups[groupIndex];

        if (groupHasValue(group)) {
            continue;
        }

        var optionLabel = group.getAttribute('data-gl-option-label') || 'This option';
        var firstControl = group.querySelector('input, select, textarea');

        showToast('error', optionLabel + ' is required.');

        if (firstControl && typeof firstControl.focus === 'function') {
            firstControl.focus();
        }

        return false;
    }

    return true;
}

function groupHasValue(group) {
    var controls = group.querySelectorAll('input, select, textarea');

    for (var index = 0; index < controls.length; index += 1) {
        var control = controls[index];

        if (control.disabled) {
            continue;
        }

        if (control.type === 'checkbox' || control.type === 'radio') {
            if (control.checked) {
                return true;
            }

            continue;
        }

        if (control.tagName === 'SELECT' && control.multiple) {
            if (control.selectedOptions && control.selectedOptions.length > 0) {
                return true;
            }

            continue;
        }

        if (String(control.value || '').trim() !== '') {
            return true;
        }
    }

    return false;
}
