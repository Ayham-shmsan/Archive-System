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
                new Date(left)
                    .getTime();

            const right_time =
                new Date(right)
                    .getTime();

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



    // ========================================================
    // LocalDataSource
    // ========================================================

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

            this.all_ids = [];


            for (
                const record
                of records || []
            ) {
                const id =
                    record[
                        this.id_field
                    ];

                if (!id) {
                    continue;
                }

                this.records.set(
                    id,
                    record
                );

                this.all_ids.push(
                    id
                );
            }


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


            const exists =
                this.records.has(
                    id
                );


            this.records.set(
                id,
                record
            );


            if (!exists) {
                this.all_ids.push(
                    id
                );
            }


            this.invalidate();
        }


        remove(id) {

            if (
                !this.records.has(id)
            ) {
                return;
            }


            this.records.delete(
                id
            );


            this.all_ids =
                this.all_ids.filter(
                    (record_id) =>
                        record_id !== id
                );


            this.invalidate();
        }


        invalidate() {

            this.revision += 1;

            this.query_cache.clear();
        }


        // ====================================================
        // Search
        // ====================================================

        _apply_search(
            ids,
            search
        ) {
            const tokens =
                this.search_tokenizer(
                    search
                );


            if (!tokens.length) {
                return ids.slice();
            }


            return ids.filter(
                (id) => {

                    const record =
                        this.records.get(
                            id
                        );


                    const haystack =
                        String(
                            this.search_accessor(
                                record
                            )
                            || ""
                        );


                    return tokens.every(
                        (token) =>
                            haystack.includes(
                                token
                            )
                    );
                }
            );
        }


        // ====================================================
        // Filters
        // ====================================================

        _matches_default_filter(
            record,
            field,
            filter_value
        ) {
            if (
                filter_value === null ||
                filter_value === undefined ||
                filter_value === ""
            ) {
                return true;
            }


            const record_value =
                record?.[field];
            
            if (
                typeof filter_value
                === "object"
                &&
                !Array.isArray(
                    filter_value
                )
            ) {
                const operator =
                    filter_value.op
                    || "eq";


                // ================================================
                // Text contains - normalized
                // ================================================

                if (
                    operator
                    === "contains_normalized"
                ) {
                    const needle =
                        normalize_search_text(
                            filter_value.value
                        );


                    if (!needle) {
                        return true;
                    }


                    const haystack =
                        normalize_search_text(
                            record_value
                        );


                    return haystack.includes(
                        needle
                    );
                }


                // ================================================
                // Number range
                // ================================================

                if (
                    operator
                    === "number_range"
                ) {
                    const number =
                        Number(
                            record_value
                        );


                    if (
                        !Number.isFinite(
                            number
                        )
                    ) {
                        return false;
                    }


                    const min =
                        filter_value.min;

                    const max =
                        filter_value.max;


                    if (
                        min !== null
                        &&
                        min !== undefined
                        &&
                        min !== ""
                        &&
                        number < Number(min)
                    ) {
                        return false;
                    }


                    if (
                        max !== null
                        &&
                        max !== undefined
                        &&
                        max !== ""
                        &&
                        number > Number(max)
                    ) {
                        return false;
                    }


                    return true;
                }


                // ================================================
                // Date range
                // ================================================

                if (
                    operator
                    === "date_range"
                ) {
                    if (!record_value) {
                        return false;
                    }


                    const raw =
                        String(
                            record_value
                        ).trim();


                    const match =
                        raw.match(
                            /^(\d{4}-\d{2}-\d{2})/
                        );


                    let record_date =
                        match
                            ? match[1]
                            : null;


                    if (!record_date) {
                        const parsed =
                            new Date(
                                record_value
                            );


                        if (
                            Number.isNaN(
                                parsed.getTime()
                            )
                        ) {
                            return false;
                        }


                        record_date =
                            parsed
                                .toISOString()
                                .slice(
                                    0,
                                    10
                                );
                    }


                    const from =
                        filter_value.from
                        || null;

                    const to =
                        filter_value.to
                        || null;


                    if (
                        from
                        &&
                        record_date < from
                    ) {
                        return false;
                    }


                    if (
                        to
                        &&
                        record_date > to
                    ) {
                        return false;
                    }


                    return true;
                }
            }


            if (
                Array.isArray(
                    filter_value
                )
            ) {
                if (
                    !filter_value.length
                ) {
                    return true;
                }

                return filter_value.includes(
                    record_value
                );
            }


            if (
                typeof filter_value
                === "object"
            ) {
                const operator =
                    filter_value.op
                    || "eq";

                const value =
                    filter_value.value;


                if (operator === "eq") {
                    return (
                        record_value === value
                    );
                }


                if (operator === "neq") {
                    return (
                        record_value !== value
                    );
                }


                if (operator === "in") {
                    return (
                        Array.isArray(value)
                        &&
                        value.includes(
                            record_value
                        )
                    );
                }


                if (operator === "gte") {
                    return (
                        record_value >= value
                    );
                }


                if (operator === "lte") {
                    return (
                        record_value <= value
                    );
                }


                if (
                    operator === "between"
                    &&
                    Array.isArray(value)
                ) {
                    return (
                        record_value
                            >= value[0]
                        &&
                        record_value
                            <= value[1]
                    );
                }


                if (operator === "contains") {
                    return String(
                        record_value || ""
                    ).includes(
                        String(
                            value || ""
                        )
                    );
                }
            }


            return (
                record_value
                === filter_value
            );
        }


        _apply_filters(
            ids,
            filters
        ) {
            const entries =
                Object.entries(
                    filters || {}
                )
                .filter(
                    ([, value]) =>
                        value !== null
                        &&
                        value !== undefined
                        &&
                        value !== ""
                );


            if (!entries.length) {
                return ids.slice();
            }


            return ids.filter(
                (id) => {

                    const record =
                        this.records.get(
                            id
                        );


                    return entries.every(
                        (
                            [
                                field,
                                value
                            ]
                        ) => {

                            const handler =
                                this.filter_handlers[
                                    field
                                ];


                            if (handler) {
                                return handler(
                                    record,
                                    value,
                                    this
                                );
                            }


                            return this
                                ._matches_default_filter(
                                    record,
                                    field,
                                    value
                                );
                        }
                    );
                }
            );
        }


        // ====================================================
        // Sorting
        // ====================================================

        _apply_sort(
            ids,
            sort
        ) {
            if (
                !sort ||
                !sort.field
            ) {
                return ids.slice();
            }


            const field =
                sort.field;


            const direction =
                sort.direction
                === "asc"
                    ? "asc"
                    : "desc";


            const definition =
                this.sorters[
                    field
                ]
                || {};


            const getter =
                definition.get
                || (
                    (record) =>
                        record?.[
                            field
                        ]
                );


            const type =
                definition.type
                || "text";


            const locale =
                definition.locale
                || "ar";


            const id_field =
                this.id_field;


            const records =
                this.records;


            return ids
                .slice()
                .sort(
                    (
                        left_id,
                        right_id
                    ) => {

                        const left =
                            records.get(
                                left_id
                            );

                        const right =
                            records.get(
                                right_id
                            );


                        let result =
                            compare_values(
                                getter(left),
                                getter(right),
                                type,
                                locale
                            );


                        if (
                            direction
                            === "desc"
                        ) {
                            result =
                                -result;
                        }


                        if (result !== 0) {
                            return result;
                        }


                        // Tie breaker ثابت.
                        return get_collator(
                            locale
                        ).compare(
                            String(
                                left?.[
                                    id_field
                                ]
                                || ""
                            ),
                            String(
                                right?.[
                                    id_field
                                ]
                                || ""
                            )
                        );
                    }
                );
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


            const page_length =
                normalize_page_length(
                    options.page_length,
                    100
                );


            const cache_key =
                stable_stringify({
                    revision:
                        this.revision,

                    search:
                        search,

                    filters:
                        filters,

                    sort:
                        sort,
                });


            let cached =
                this.query_cache.get(
                    cache_key
                );


            if (!cached) {

                // 1) Search
                // const searched_ids =
                //     this._apply_search(
                //         this.all_ids,
                //         search
                //     );


                // // 2) Filters
                // const filtered_ids =
                //     this._apply_filters(
                //         searched_ids,
                //         filters
                //     );


                // // 3) Sort
                // const sorted_ids =
                //     this._apply_sort(
                //         filtered_ids,
                //         sort
                //     );

                // 1) Advanced / structural filters
                const filtered_ids =
                    this._apply_filters(
                        this.all_ids,
                        filters
                    );


                // 2) Free search inside filtered results
                const searched_ids =
                    this._apply_search(
                        filtered_ids,
                        search
                    );


                // 3) Sorting
                const sorted_ids =
                    this._apply_sort(
                        searched_ids,
                        sort
                    );


                cached = {
                    searched_ids:
                        searched_ids,

                    result_ids:
                        sorted_ids,
                };


                this.query_cache.set(
                    cache_key,
                    cached
                );
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


            if (page_length === 0) {
                page_ids =
                    cached.result_ids;
            } else {

                const start =
                    (
                        page - 1
                    )
                    *
                    page_length;


                page_ids =
                    cached.result_ids.slice(
                        start,
                        start + page_length
                    );
            }


            return {
                records:
                    page_ids.map(
                        (id) =>
                            this.records.get(
                                id
                            )
                    ),

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
            String(value);


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


    ns.utils = {
        stable_stringify,
        normalize_page_length,
        compare_values,
        normalize_search_text,
        get_search_tokens,
    };

})();