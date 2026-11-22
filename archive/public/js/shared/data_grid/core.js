frappe.provide("custom.data_grid");

(() => {
    "use strict";

    const ns = custom.data_grid;


    // ========================================================
    // Helpers
    // ========================================================

    function stable_stringify(value) {
        if (
            value === null ||
            typeof value !== "object"
        ) {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            return (
                "[" +
                value
                    .map(stable_stringify)
                    .join(",") +
                "]"
            );
        }

        const keys =
            Object.keys(value).sort();

        return (
            "{" +
            keys
                .map(
                    (key) =>
                        `${JSON.stringify(key)}:${stable_stringify(
                            value[key]
                        )}`
                )
                .join(",") +
            "}"
        );
    }


    function normalize_page_length(
        value,
        fallback = 100
    ) {
        if (
            value === "all" ||
            value === 0 ||
            value === "0"
        ) {
            return 0;
        }

        const parsed =
            Number.parseInt(
                value,
                10
            );

        if (
            !Number.isFinite(parsed) ||
            parsed <= 0
        ) {
            return fallback;
        }

        return parsed;
    }


    const collators =
        new Map();


    function get_collator(
        locale = "ar"
    ) {
        if (!collators.has(locale)) {
            collators.set(
                locale,
                new Intl.Collator(
                    locale,
                    {
                        numeric: true,
                        sensitivity: "base",
                    }
                )
            );
        }

        return collators.get(locale);
    }


    function is_empty(value) {
        return (
            value === null ||
            value === undefined ||
            value === ""
        );
    }


    function parse_timestamp_fast(value) {
        if (is_empty(value)) {
            return NaN;
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : NaN;
        }
        const str = String(value).trim();
        if (!str) {
            return NaN;
        }
        // Fast ISO-like parse: YYYY-MM-DD or YYYY-MM-DD[ T]HH:MM(:SS)?
        if (str.length >= 10 && str.charCodeAt(4) === 45 && str.charCodeAt(7) === 45) {
            const normalized = str.indexOf(" ") === 10
                ? str.slice(0, 10) + "T" + str.slice(11)
                : str;
            const parsed = Date.parse(normalized);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return Date.parse(str);
    }


    function compare_values(
        left,
        right,
        type = "text",
        locale = "ar"
    ) {
        const left_empty =
            is_empty(left);

        const right_empty =
            is_empty(right);


        // القيم الفارغة دائماً في الأسفل.
        if (
            left_empty &&
            right_empty
        ) {
            return 0;
        }

        if (left_empty) {
            return 1;
        }

        if (right_empty) {
            return -1;
        }


        if (type === "number") {
            const left_number =
                Number(left);

            const right_number =
                Number(right);

            return (
                left_number -
                right_number
            );
        }


        if (
            type === "date" ||
            type === "datetime"
        ) {
            const left_time =
                parse_timestamp_fast(left);

            const right_time =
                parse_timestamp_fast(right);

            return (
                left_time -
                right_time
            );
        }


        if (type === "boolean") {
            return (
                Number(Boolean(left)) -
                Number(Boolean(right))
            );
        }


        return get_collator(
            locale
        ).compare(
            String(left),
            String(right)
        );
    }


    function extract_date_prefix(record_value) {
        if (!record_value) {
            return null;
        }
        const raw = String(record_value).trim();
        if (raw.length >= 10 && raw.charCodeAt(4) === 45 && raw.charCodeAt(7) === 45) {
            const d = raw.slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
                return d;
            }
        }
        const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) {
            return match[1];
        }
        const parsed = new Date(record_value);
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }
        return parsed.toISOString().slice(0, 10);
    }


    function lru_set(map, key, value, max_size) {
        if (map.has(key)) {
            map.delete(key);
        } else if (map.size >= max_size) {
            const oldest = map.keys().next().value;
            if (oldest !== undefined) {
                map.delete(oldest);
            }
        }
        map.set(key, value);
    }


    function is_token_extension(prev_tokens, next_tokens) {
        if (!prev_tokens || !prev_tokens.length || !next_tokens || !next_tokens.length) {
            return false;
        }
        if (next_tokens.length < prev_tokens.length) {
            return false;
        }
        for (let i = 0; i < prev_tokens.length; i++) {
            const prev_tok = prev_tokens[i];
            let covered = false;
            for (let j = 0; j < next_tokens.length; j++) {
                if (next_tokens[j].indexOf(prev_tok) !== -1) {
                    covered = true;
                    break;
                }
            }
            if (!covered) {
                return false;
            }
        }
        return true;
    }



    // ========================================================
    // LocalDataSource (High-Performance Indexed Engine)
    // ========================================================

    const MAX_QUERY_CACHE = 32;
    const MAX_SORT_CACHE = 8;
    const MAX_BASE_CACHE = 24;

    class LocalDataSource {

        constructor(options = {}) {

            this.id_field =
                options.id_field
                || "name";


            this.search_accessor =
                options.search_accessor
                || (
                    (record) =>
                        record.search_text
                        || ""
                );


            this.search_tokenizer =
                options.search_tokenizer
                || (
                    (value) =>
                        String(
                            value || ""
                        )
                            .toLowerCase()
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                );


            this.filter_handlers =
                options.filter_handlers
                || {};


            this.sorters =
                options.sorters
                || {};


            this.records =
                new Map();


            this.all_ids =
                [];


            this._ids_arr = [];
            this._records_arr = [];
            this._id_to_index = new Map();
            this._haystacks = null;
            this._norm_field_cache = new Map();
            this._sorted_cache = new Map();
            this._base_cache = new Map();
            this._last_search = null;

            this.query_cache =
                new Map();


            this.revision = 0;


            if (options.records) {
                this.set_records(
                    options.records
                );
            }
        }


        // ====================================================
        // Records
        // ====================================================

        set_records(records) {

            this.records.clear();
            this._id_to_index.clear();

            const src = records || [];
            const ids = [];
            const recs = [];
            const id_field = this.id_field;

            for (let i = 0; i < src.length; i++) {
                const record = src[i];
                const id = record?.[id_field];
                if (!id) {
                    continue;
                }
                const existing_idx = this._id_to_index.get(id);
                if (existing_idx !== undefined) {
                    recs[existing_idx] = record;
                    this.records.set(id, record);
                } else {
                    const idx = recs.length;
                    this._id_to_index.set(id, idx);
                    this.records.set(id, record);
                    ids.push(id);
                    recs.push(record);
                }
            }

            this.all_ids = ids;
            this._ids_arr = ids;
            this._records_arr = recs;
            this._haystacks = null;

            this.invalidate();

            return this;
        }


        upsert(record) {

            const id =
                record?.[
                    this.id_field
                ];

            if (!id) {
                return;
            }

            const existing_idx = this._id_to_index.get(id);

            this.records.set(id, record);

            if (existing_idx !== undefined) {
                this._records_arr[existing_idx] = record;
                if (this._haystacks) {
                    this._haystacks[existing_idx] = String(
                        this.search_accessor(record) || ""
                    );
                }
            } else {
                const idx = this._records_arr.length;
                this._id_to_index.set(id, idx);
                this._ids_arr.push(id);
                this._records_arr.push(record);
                if (this._haystacks) {
                    this._haystacks.push(
                        String(this.search_accessor(record) || "")
                    );
                }
            }

            this.invalidate();
        }


        remove(id) {

            if (
                !this.records.has(id)
            ) {
                return;
            }

            this.records.delete(id);

            const remaining = [];
            for (let i = 0; i < this._records_arr.length; i++) {
                if (this._ids_arr[i] !== id) {
                    remaining.push(this._records_arr[i]);
                }
            }

            this.set_records(remaining);
        }


        invalidate() {

            this.revision += 1;

            this.query_cache.clear();
            this._sorted_cache.clear();
            this._base_cache.clear();
            this._norm_field_cache.clear();
            this._last_search = null;
        }


        // ====================================================
        // Search Haystack Index (lazy-built once per dataset)
        // ====================================================

        _ensure_haystacks() {
            if (this._haystacks) {
                return this._haystacks;
            }
            const recs = this._records_arr;
            const len = recs.length;
            const haystacks = new Array(len);
            const accessor = this.search_accessor;

            for (let i = 0; i < len; i++) {
                const raw = accessor(recs[i]);
                haystacks[i] = raw ? String(raw) : "";
            }

            this._haystacks = haystacks;
            return haystacks;
        }


        _get_normalized_field_values(field) {
            let cached = this._norm_field_cache.get(field);
            if (cached) {
                return cached;
            }
            const recs = this._records_arr;
            const len = recs.length;
            cached = new Array(len);
            for (let i = 0; i < len; i++) {
                const v = recs[i]?.[field];
                cached[i] = v === null || v === undefined || v === ""
                    ? ""
                    : normalize_search_text(v);
            }
            this._norm_field_cache.set(field, cached);
            return cached;
        }


        // ====================================================
        // Compiled Filters (hoisted outside row loop)
        // ====================================================

        _compile_filters(filters) {
            const raw_entries = Object.entries(filters || {});
            const predicates = [];

            for (let e = 0; e < raw_entries.length; e++) {
                const field = raw_entries[e][0];
                const filter_value = raw_entries[e][1];

                if (
                    filter_value === null ||
                    filter_value === undefined ||
                    filter_value === ""
                ) {
                    continue;
                }

                const custom_handler = this.filter_handlers[field];
                if (custom_handler) {
                    predicates.push((rec) =>
                        custom_handler(rec, filter_value, this)
                    );
                    continue;
                }

                if (Array.isArray(filter_value)) {
                    if (!filter_value.length) {
                        continue;
                    }
                    const allowed_set = new Set(filter_value);
                    predicates.push((rec) => allowed_set.has(rec?.[field]));
                    continue;
                }

                if (typeof filter_value === "object") {
                    const operator = filter_value.op || "eq";

                    if (operator === "contains_normalized") {
                        const needle = normalize_search_text(filter_value.value);
                        if (!needle) {
                            continue;
                        }
                        const norm_col = this._get_normalized_field_values(field);
                        predicates.push((_rec, idx) =>
                            norm_col[idx].indexOf(needle) !== -1
                        );
                        continue;
                    }

                    if (operator === "number_range") {
                        const has_min =
                            filter_value.min !== null &&
                            filter_value.min !== undefined &&
                            filter_value.min !== "";
                        const has_max =
                            filter_value.max !== null &&
                            filter_value.max !== undefined &&
                            filter_value.max !== "";
                        const min_num = has_min ? Number(filter_value.min) : -Infinity;
                        const max_num = has_max ? Number(filter_value.max) : Infinity;

                        predicates.push((rec) => {
                            const num = Number(rec?.[field]);
                            if (!Number.isFinite(num)) {
                                return false;
                            }
                            if (has_min && num < min_num) {
                                return false;
                            }
                            if (has_max && num > max_num) {
                                return false;
                            }
                            return true;
                        });
                        continue;
                    }

                    if (operator === "date_range") {
                        const from = filter_value.from || null;
                        const to = filter_value.to || null;
                        predicates.push((rec) => {
                            const d = extract_date_prefix(rec?.[field]);
                            if (!d) {
                                return false;
                            }
                            if (from && d < from) {
                                return false;
                            }
                            if (to && d > to) {
                                return false;
                            }
                            return true;
                        });
                        continue;
                    }

                    const val = filter_value.value;
                    if (operator === "eq") {
                        predicates.push((rec) => rec?.[field] === val);
                    } else if (operator === "neq") {
                        predicates.push((rec) => rec?.[field] !== val);
                    } else if (operator === "in") {
                        const set_val = Array.isArray(val) ? new Set(val) : null;
                        predicates.push((rec) =>
                            set_val ? set_val.has(rec?.[field]) : false
                        );
                    } else if (operator === "gte") {
                        predicates.push((rec) => rec?.[field] >= val);
                    } else if (operator === "lte") {
                        predicates.push((rec) => rec?.[field] <= val);
                    } else if (operator === "between" && Array.isArray(val)) {
                        const lo = val[0];
                        const hi = val[1];
                        predicates.push((rec) => {
                            const rv = rec?.[field];
                            return rv >= lo && rv <= hi;
                        });
                    } else if (operator === "contains") {
                        const needle = String(val || "");
                        predicates.push((rec) =>
                            String(rec?.[field] || "").indexOf(needle) !== -1
                        );
                    }
                    continue;
                }

                predicates.push((rec) => rec?.[field] === filter_value);
            }

            return predicates;
        }


        // ====================================================
        // Sorting (Sort-First Cached Schwartzian Transform)
        // ====================================================

        _get_sorted_indices(sort) {
            const len = this._records_arr.length;

            if (!sort || !sort.field) {
                let identity = this._sorted_cache.get("__none__");
                if (!identity) {
                    identity = new Int32Array(len);
                    for (let i = 0; i < len; i++) {
                        identity[i] = i;
                    }
                    lru_set(this._sorted_cache, "__none__", identity, MAX_SORT_CACHE);
                }
                return identity;
            }

            const field = sort.field;
            const direction = sort.direction === "asc" ? "asc" : "desc";
            const sort_key = `${field}::${direction}`;

            const cached = this._sorted_cache.get(sort_key);
            if (cached) {
                return cached;
            }

            const definition = this.sorters[field] || {};
            const getter = definition.get || null;
            const type = definition.type || "text";
            const locale = definition.locale || "ar";
            const nulls_last = Boolean(definition.nulls_last);
            const desc = direction === "desc";
            const recs = this._records_arr;
            const ids = this._ids_arr;

            const indices = new Array(len);
            for (let i = 0; i < len; i++) {
                indices[i] = i;
            }

            if (len <= 1) {
                const typed = Int32Array.from(indices);
                lru_set(this._sorted_cache, sort_key, typed, MAX_SORT_CACHE);
                return typed;
            }

            const empties = new Uint8Array(len);
            let keys;
            let is_numeric = false;

            if (type === "number" || type === "date" || type === "datetime" || type === "boolean") {
                is_numeric = true;
                keys = new Float64Array(len);
                for (let i = 0; i < len; i++) {
                    const raw = getter ? getter(recs[i]) : recs[i]?.[field];
                    if (is_empty(raw)) {
                        empties[i] = 1;
                        keys[i] = NaN;
                    } else if (type === "number") {
                        keys[i] = Number(raw);
                    } else if (type === "boolean") {
                        keys[i] = raw ? 1 : 0;
                    } else {
                        keys[i] = parse_timestamp_fast(raw);
                    }
                }
            } else {
                keys = new Array(len);
                for (let i = 0; i < len; i++) {
                    const raw = getter ? getter(recs[i]) : recs[i]?.[field];
                    if (is_empty(raw)) {
                        empties[i] = 1;
                        keys[i] = "";
                    } else {
                        keys[i] = String(raw);
                    }
                }
            }

            const collator = get_collator(locale);

            const cmp = (a, b) => {
                const a_empty = empties[a];
                const b_empty = empties[b];

                if (a_empty || b_empty) {
                    if (a_empty && b_empty) {
                        return ids[a] < ids[b] ? -1 : (ids[a] > ids[b] ? 1 : 0);
                    }
                    if (nulls_last) {
                        return a_empty ? 1 : -1;
                    }
                    const res = a_empty ? 1 : -1;
                    return desc ? -res : res;
                }

                let diff = 0;
                if (is_numeric) {
                    const ka = keys[a];
                    const kb = keys[b];
                    if (ka !== kb) {
                        if (Number.isNaN(ka)) {
                            diff = Number.isNaN(kb) ? 0 : 1;
                        } else if (Number.isNaN(kb)) {
                            diff = -1;
                        } else {
                            diff = ka - kb;
                        }
                    }
                } else {
                    const ka = keys[a];
                    const kb = keys[b];
                    if (ka !== kb) {
                        diff = collator.compare(ka, kb);
                    }
                }

                if (diff !== 0) {
                    return desc ? -diff : diff;
                }

                // Stable deterministic tie-breaker
                const id_a = ids[a];
                const id_b = ids[b];
                if (id_a === id_b) {
                    return 0;
                }
                return collator.compare(id_a, id_b);
            };

            // O(N) fast-path check: skip O(N log N) sort if already ordered
            let already_sorted = true;
            for (let i = 1; i < len; i++) {
                if (cmp(indices[i - 1], indices[i]) > 0) {
                    already_sorted = false;
                    break;
                }
            }

            if (!already_sorted) {
                indices.sort(cmp);
            }

            const typed = Int32Array.from(indices);
            lru_set(this._sorted_cache, sort_key, typed, MAX_SORT_CACHE);
            return typed;
        }


        // ====================================================
        // Filter + Search execution over sorted indices
        // ====================================================

        _execute_filter_and_search(source_indices, filters, search, filters_key, sort_key) {
            const recs = this._records_arr;
            const tokens_raw = this.search_tokenizer(search);

            // Sort tokens longest-first so rarest/longest token rejects fastest
            const tokens = tokens_raw.length > 1
                ? tokens_raw.slice().sort((a, b) => b.length - a.length)
                : tokens_raw;

            const has_tokens = tokens.length > 0;
            const predicates = this._compile_filters(filters);
            const pred_len = predicates.length;

            // Fast path: no filters and no search
            if (!pred_len && !has_tokens) {
                return source_indices;
            }

            // Incremental narrowing fast-path when typing in search box
            if (
                has_tokens &&
                this._last_search &&
                this._last_search.revision === this.revision &&
                this._last_search.filters_key === filters_key &&
                this._last_search.sort_key === sort_key &&
                is_token_extension(this._last_search.tokens, tokens)
            ) {
                const haystacks = this._ensure_haystacks();
                const prev = this._last_search.indices;
                const prev_len = prev.length;
                const narrowed = [];
                const tok_len = tokens.length;

                if (tok_len === 1) {
                    const t0 = tokens[0];
                    for (let i = 0; i < prev_len; i++) {
                        const idx = prev[i];
                        if (haystacks[idx].indexOf(t0) !== -1) {
                            narrowed.push(idx);
                        }
                    }
                } else {
                    for (let i = 0; i < prev_len; i++) {
                        const idx = prev[i];
                        const h = haystacks[idx];
                        let ok = true;
                        for (let t = 0; t < tok_len; t++) {
                            if (h.indexOf(tokens[t]) === -1) {
                                ok = false;
                                break;
                            }
                        }
                        if (ok) {
                            narrowed.push(idx);
                        }
                    }
                }

                this._last_search = {
                    revision: this.revision,
                    filters_key,
                    sort_key,
                    tokens,
                    indices: narrowed,
                };
                return narrowed;
            }

            const haystacks = has_tokens ? this._ensure_haystacks() : null;
            const total = source_indices.length;
            const matched = [];
            const tok_len = tokens.length;

            if (!pred_len && tok_len === 1) {
                const t0 = tokens[0];
                for (let i = 0; i < total; i++) {
                    const idx = source_indices[i];
                    if (haystacks[idx].indexOf(t0) !== -1) {
                        matched.push(idx);
                    }
                }
            } else if (!pred_len && tok_len > 1) {
                for (let i = 0; i < total; i++) {
                    const idx = source_indices[i];
                    const h = haystacks[idx];
                    let ok = true;
                    for (let t = 0; t < tok_len; t++) {
                        if (h.indexOf(tokens[t]) === -1) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) {
                        matched.push(idx);
                    }
                }
            } else if (pred_len && !has_tokens) {
                for (let i = 0; i < total; i++) {
                    const idx = source_indices[i];
                    const rec = recs[idx];
                    let ok = true;
                    for (let p = 0; p < pred_len; p++) {
                        if (!predicates[p](rec, idx)) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) {
                        matched.push(idx);
                    }
                }
            } else {
                for (let i = 0; i < total; i++) {
                    const idx = source_indices[i];
                    const rec = recs[idx];
                    let ok = true;
                    for (let p = 0; p < pred_len; p++) {
                        if (!predicates[p](rec, idx)) {
                            ok = false;
                            break;
                        }
                    }
                    if (!ok) {
                        continue;
                    }
                    const h = haystacks[idx];
                    for (let t = 0; t < tok_len; t++) {
                        if (h.indexOf(tokens[t]) === -1) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) {
                        matched.push(idx);
                    }
                }
            }

            if (has_tokens) {
                this._last_search = {
                    revision: this.revision,
                    filters_key,
                    sort_key,
                    tokens,
                    indices: matched,
                };
            }

            return matched;
        }


        // ====================================================
        // Query
        // ====================================================

        query(options = {}) {

            const search =
                options.search
                || "";


            const filters =
                options.filters
                || {};


            const sort =
                options.sort
                || null;


            const include_records =
                options.include_records !== false;


            const page_length =
                normalize_page_length(
                    options.page_length,
                    100
                );


            const filters_key = stable_stringify(filters);
            const sort_key = sort && sort.field
                ? `${sort.field}::${sort.direction === "asc" ? "asc" : "desc"}`
                : "__none__";
            const base_key = `${this.revision}|${search}|${filters_key}`;
            const cache_key = `${base_key}|${sort_key}`;


            let cached =
                this.query_cache.get(
                    cache_key
                );


            if (!cached) {
                let matched_indices;

                // If sort is null (e.g. counts query), reuse ANY already-computed
                // result for the same (revision, search, filters) regardless of sort!
                if (sort_key === "__none__" && this._base_cache.has(base_key)) {
                    matched_indices = this._base_cache.get(base_key);
                } else {
                    const sorted_indices = this._get_sorted_indices(sort);
                    matched_indices = this._execute_filter_and_search(
                        sorted_indices,
                        filters,
                        search,
                        filters_key,
                        sort_key
                    );
                    lru_set(this._base_cache, base_key, matched_indices, MAX_BASE_CACHE);
                }

                const ids_arr = this._ids_arr;
                const matched_len = matched_indices.length;
                const result_ids = new Array(matched_len);
                for (let i = 0; i < matched_len; i++) {
                    result_ids[i] = ids_arr[matched_indices[i]];
                }

                cached = {
                    matched_indices,
                    searched_ids: result_ids,
                    result_ids: result_ids,
                };

                lru_set(this.query_cache, cache_key, cached, MAX_QUERY_CACHE);
            }


            const total_rows =
                cached.result_ids.length;


            let total_pages =
                1;


            if (page_length > 0) {
                total_pages =
                    Math.max(
                        Math.ceil(
                            total_rows
                            /
                            page_length
                        ),
                        1
                    );
            }


            let page =
                Math.max(
                    Number.parseInt(
                        options.page || 1,
                        10
                    )
                    || 1,
                    1
                );


            page =
                Math.min(
                    page,
                    total_pages
                );


            let page_ids;
            let page_records = [];

            const recs_arr = this._records_arr;
            const matched_indices = cached.matched_indices;

            if (page_length === 0) {
                page_ids = cached.result_ids;
                if (include_records) {
                    const len = matched_indices.length;
                    page_records = new Array(len);
                    for (let i = 0; i < len; i++) {
                        page_records[i] = recs_arr[matched_indices[i]];
                    }
                }
            } else {
                const start = (page - 1) * page_length;
                const end = Math.min(start + page_length, total_rows);
                page_ids = cached.result_ids.slice(start, end);
                if (include_records) {
                    const slice_len = Math.max(0, end - start);
                    page_records = new Array(slice_len);
                    for (let i = 0; i < slice_len; i++) {
                        page_records[i] = recs_arr[matched_indices[start + i]];
                    }
                }
            }


            return {
                records:
                    page_records,

                page_ids:
                    page_ids,

                result_ids:
                    cached.result_ids,

                searched_ids:
                    cached.searched_ids,

                total_rows:
                    total_rows,

                page:
                    page,

                page_length:
                    page_length,

                total_pages:
                    total_pages,
            };
        }
    }



    // ========================================================
    // VirtualTableRenderer (Native <table> Windowed Virtualizer)
    //
    // Renders only visible rows + overscan inside <tbody> using
    // transparent top/bottom spacer rows, preserving:
    // - exact native <table> layout, <colgroup>, sticky <thead>
    // - exact native scrollbar & wheel/touch momentum
    // - O(1) DOM node count (~35 rows) even for 20,000–250,000+ rows
    // ========================================================

    const MAX_VIRTUAL_PIXEL_HEIGHT = 10000000;

    class VirtualTableRenderer {

        constructor(options = {}) {
            this.scroll_el = options.scroll_el || null;
            this.tbody_el = options.tbody_el || null;
            this.render_row = options.render_row || (() => "");
            this.get_col_count = options.get_col_count || (() => 1);
            this.row_selector = options.row_selector || "tr:not(.archive-virtual-spacer)";
            this.row_height = Number(options.row_height) || 58;
            this.overscan = Number.isFinite(options.overscan) ? options.overscan : 14;
            this.threshold = Number.isFinite(options.threshold) ? options.threshold : 150;
            this.on_rendered = typeof options.on_rendered === "function" ? options.on_rendered : null;

            this.rows = [];
            this._row_height_measured = false;
            this._last_start = -1;
            this._last_end = -1;
            this._last_virtualized = null;
            this._raf_id = null;
            this._destroyed = false;

            this._on_scroll = () => {
                if (this._destroyed || this.rows.length <= this.threshold) {
                    return;
                }
                if (this._raf_id !== null) {
                    return;
                }
                this._raf_id = window.requestAnimationFrame(() => {
                    this._raf_id = null;
                    if (!this._destroyed) {
                        this._render_window(false);
                    }
                });
            };

            if (this.scroll_el) {
                this.scroll_el.addEventListener("scroll", this._on_scroll, {
                    passive: true,
                });

                if (typeof ResizeObserver !== "undefined") {
                    this._resize_observer = new ResizeObserver(() => {
                        if (!this._destroyed && this.rows.length > this.threshold) {
                            this._render_window(false);
                        }
                    });
                    this._resize_observer.observe(this.scroll_el);
                }
            }
        }

        set_rows(rows, { preserve_scroll = false, force = true } = {}) {
            this.rows = Array.isArray(rows) ? rows : [];
            this._last_start = -1;
            this._last_end = -1;

            if (!preserve_scroll && this.scroll_el) {
                this.scroll_el.scrollTop = 0;
            }

            this._render_window(Boolean(force));
        }

        refresh() {
            this._last_start = -1;
            this._last_end = -1;
            this._render_window(true);
        }

        update_selected(selected_name) {
            if (!this.tbody_el) {
                return;
            }
            const prev = this.tbody_el.querySelector("tr.is-selected");
            if (prev) {
                prev.classList.remove("is-selected");
            }
            if (!selected_name) {
                return;
            }
            const target_val = String(selected_name);
            const trs = this.tbody_el.children;
            for (let i = 0; i < trs.length; i++) {
                const tr = trs[i];
                if (tr.getAttribute("data-name") === target_val) {
                    tr.classList.add("is-selected");
                    break;
                }
            }
        }

        scroll_to_top() {
            if (this.scroll_el) {
                this.scroll_el.scrollTop = 0;
            }
        }

        _measure_row_height_once() {
            if (this._row_height_measured || !this.tbody_el) {
                return;
            }
            const sample = this.tbody_el.querySelector(this.row_selector);
            if (!sample) {
                return;
            }
            const rect = sample.getBoundingClientRect();
            if (rect && rect.height >= 28 && rect.height <= 140) {
                this.row_height = Math.round(rect.height);
                this._row_height_measured = true;
            }
        }

        _render_window(force) {
            if (!this.tbody_el) {
                return;
            }

            const total = this.rows.length;

            if (!total) {
                this.tbody_el.innerHTML = "";
                this._last_start = 0;
                this._last_end = 0;
                this._last_virtualized = false;
                if (this.on_rendered) {
                    this.on_rendered({ start: 0, end: 0, total: 0, virtualized: false });
                }
                return;
            }

            // Direct render for small slices (e.g. 20 or 100 rows)
            if (total <= this.threshold) {
                if (!force && this._last_virtualized === false && this._last_start === 0 && this._last_end === total) {
                    return;
                }
                const parts = new Array(total);
                for (let i = 0; i < total; i++) {
                    parts[i] = this.render_row(this.rows[i], i);
                }
                this.tbody_el.innerHTML = parts.join("");
                this._last_start = 0;
                this._last_end = total;
                this._last_virtualized = false;
                this._measure_row_height_once();
                if (this.on_rendered) {
                    this.on_rendered({ start: 0, end: total, total, virtualized: false });
                }
                return;
            }

            // Virtualized render for large slices (500, 2500, "all" 20,000+ rows)
            const row_h = this.row_height;
            const raw_total_height = total * row_h;
            const scale = raw_total_height > MAX_VIRTUAL_PIXEL_HEIGHT
                ? MAX_VIRTUAL_PIXEL_HEIGHT / raw_total_height
                : 1;
            const effective_row_h = row_h * scale;

            const viewport_h = (this.scroll_el && this.scroll_el.clientHeight) || 640;
            const scroll_top = (this.scroll_el && this.scroll_el.scrollTop) || 0;

            const visible_count = Math.max(1, Math.ceil(viewport_h / row_h));
            const raw_first = Math.floor(scroll_top / effective_row_h);
            const start = Math.max(0, Math.min(total - 1, raw_first - this.overscan));
            const end = Math.min(total, raw_first + visible_count + this.overscan);

            if (
                !force &&
                this._last_virtualized === true &&
                start === this._last_start &&
                end === this._last_end
            ) {
                return;
            }

            const col_count = Math.max(1, Number(this.get_col_count()) || 1);
            const top_h = Math.round(start * effective_row_h);
            const rendered_rows_h = (end - start) * row_h;
            const total_virtual_h = Math.round(raw_total_height * scale);
            const bottom_h = Math.max(0, total_virtual_h - top_h - rendered_rows_h);

            const parts = [];
            if (top_h > 0) {
                parts.push(
                    `<tr class="archive-virtual-spacer" aria-hidden="true" style="height:${top_h}px;"><td colspan="${col_count}" style="height:${top_h}px;padding:0!important;border:0!important;background:transparent!important;pointer-events:none;"></td></tr>`
                );
            }

            for (let i = start; i < end; i++) {
                parts.push(this.render_row(this.rows[i], i));
            }

            if (bottom_h > 0) {
                parts.push(
                    `<tr class="archive-virtual-spacer" aria-hidden="true" style="height:${bottom_h}px;"><td colspan="${col_count}" style="height:${bottom_h}px;padding:0!important;border:0!important;background:transparent!important;pointer-events:none;"></td></tr>`
                );
            }

            this.tbody_el.innerHTML = parts.join("");
            this._last_start = start;
            this._last_end = end;
            this._last_virtualized = true;

            if (!this._row_height_measured) {
                const before = this.row_height;
                this._measure_row_height_once();
                if (this.row_height !== before) {
                    this._last_start = -1;
                    this._last_end = -1;
                    this._render_window(true);
                    return;
                }
            }

            if (this.on_rendered) {
                this.on_rendered({ start, end, total, virtualized: true });
            }
        }

        destroy() {
            this._destroyed = true;
            if (this._raf_id !== null) {
                window.cancelAnimationFrame(this._raf_id);
                this._raf_id = null;
            }
            if (this.scroll_el) {
                this.scroll_el.removeEventListener("scroll", this._on_scroll);
            }
            if (this._resize_observer) {
                this._resize_observer.disconnect();
                this._resize_observer = null;
            }
            this.rows = [];
        }
    }


    // ========================================================
    // Search text normalization
    // ========================================================

    const DIGIT_MAP = {
        "٠": "0",
        "١": "1",
        "٢": "2",
        "٣": "3",
        "٤": "4",
        "٥": "5",
        "٦": "6",
        "٧": "7",
        "٨": "8",
        "٩": "9",

        "۰": "0",
        "۱": "1",
        "۲": "2",
        "۳": "3",
        "۴": "4",
        "۵": "5",
        "۶": "6",
        "۷": "7",
        "۸": "8",
        "۹": "9",
    };


    const ARABIC_MAP = {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",

        "ى": "ي",

        "ؤ": "و",
        "ئ": "ي",

        "ة": "ه",

        "ـ": "",
    };


    function normalize_search_text(
        value
    ) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "";
        }


        let text =
            String(value)
                .normalize("NFKC");


        text = text.replace(
            /[٠-٩۰-۹]/g,
            (character) =>
                DIGIT_MAP[
                    character
                ]
                ?? character
        );


        text = text.replace(
            /[أإآٱىؤئةـ]/g,
            (character) =>
                ARABIC_MAP[
                    character
                ]
                ?? character
        );


        // إزالة الحركات.
        text = text
            .normalize("NFD")
            .replace(
                /[\u064B-\u065F\u0670]/g,
                ""
            );


        // Zero width characters.
        text = text.replace(
            /[\u200B\u200C\u200D\uFEFF]/g,
            ""
        );


        text =
            text.toLowerCase();


        // أي شيء غير حرف أو رقم -> مسافة.
        text = text.replace(
            /[^0-9a-z\u0600-\u06ff]+/gi,
            " "
        );


        // تنظيف المسافات.
        text = text.replace(
            /\s+/g,
            " "
        ).trim();


        return text;
    }


    function get_search_tokens(
        value
    ) {
        const normalized =
            normalize_search_text(
                value
            );


        if (!normalized) {
            return [];
        }


        return [
            ...new Set(
                normalized
                    .split(" ")
                    .filter(Boolean)
            ),
        ];
    }

    ns.LocalDataSource =
        LocalDataSource;

    ns.VirtualTableRenderer =
        VirtualTableRenderer;


    ns.utils = {
        stable_stringify,
        normalize_page_length,
        compare_values,
        normalize_search_text,
        get_search_tokens,
    };

})();
