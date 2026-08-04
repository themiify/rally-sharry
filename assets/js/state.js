export function createStorefrontState() {
    return {
        auth: {
            is_logged_in: false,
        },
        wishlistItems: new Set(),
        compareItems: new Set(loadStoredCompareItems()),
        wishlistLoaded: false,
        compareLoaded: false,
    };
}

function loadStoredCompareItems() {
    try {
        var stored = localStorage.getItem('compare_items');
        var parsed = stored ? JSON.parse(stored) : [];

        return Array.isArray(parsed)
            ? parsed.map(function (item) { return parseInt(item, 10); }).filter(Boolean)
            : [];
    } catch (error) {
        return [];
    }
}

export function storeCompareItems(compareItems) {
    try {
        localStorage.setItem('compare_items', JSON.stringify(Array.from(compareItems)));
    } catch (error) {
        // Ignore storage failures.
    }
}
