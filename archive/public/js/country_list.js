frappe.listview_settings["Country"]={
    hide_name_column: true,

    formatters:{
        country_name(value){
            return __(value || "");
        },
    },
};

window.archive_resolve_user_tz_datetime = function archive_resolve_user_tz_datetime(value) {
    if (value === null || value === undefined || value === "") {
        return "";
    }
    const clean = String(value).trim().replace(/\.\d+$/, "");
    if (!clean) {
        return "";
    }
    try {
        if (
            window.frappe?.datetime?.convert_to_user_tz &&
            /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(clean)
        ) {
            const converted = window.frappe.datetime.convert_to_user_tz(clean, true);
            if (converted && converted !== "Invalid date") {
                return String(converted).trim().replace(/\.\d+$/, "");
            }
        }
    } catch (_) {
        // fallback to cleaned string
    }
    return clean;
};

window.archive_format_datetime = function archive_format_datetime(value, emptyFallback = "—") {
    const resolved = window.archive_resolve_user_tz_datetime(value);
    if (!resolved) {
        return emptyFallback;
    }
    if (/^\d{4}-\d{2}-\d{2}،\s*\d{2}:\d{2}\s+[صم]$/.test(resolved)) {
        return resolved;
    }
    const match = resolved.match(
        /^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/
    );
    if (match) {
        const datePart = match[1];
        const hour24 = parseInt(match[2], 10);
        const minute = String(match[3]).padStart(2, "0");
        if (Number.isFinite(hour24) && hour24 >= 0 && hour24 <= 23) {
            const period = hour24 >= 12 ? "م" : "ص";
            const hour12 = String(hour24 % 12 || 12).padStart(2, "0");
            return `${datePart}، ${hour12}:${minute} ${period}`;
        }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
        try {
            return window.frappe?.datetime?.str_to_user
                ? window.frappe.datetime.str_to_user(resolved)
                : resolved;
        } catch (_) {
            return resolved;
        }
    }
    return resolved;
};

window.archive_format_time_only = function archive_format_time_only(value, emptyFallback = "—") {
    const resolved = window.archive_resolve_user_tz_datetime(value);
    if (!resolved) {
        return emptyFallback;
    }
    const match = resolved.match(
        /(?:^\d{4}-\d{2}-\d{2}[T\s]+|^)(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/
    );
    if (match) {
        const hour24 = parseInt(match[1], 10);
        const minute = String(match[2]).padStart(2, "0");
        if (Number.isFinite(hour24) && hour24 >= 0 && hour24 <= 23) {
            const period = hour24 >= 12 ? "م" : "ص";
            const hour12 = String(hour24 % 12 || 12).padStart(2, "0");
            return `${hour12}:${minute} ${period}`;
        }
    }
    return emptyFallback;
};
