frappe.provide(
    "custom.data_grid"
);


(() => {
    "use strict";


    const ns =
        custom.data_grid;


    // ========================================================
    // Helpers
    // ========================================================

    function clone_value(
        value
    ) {
        if (
            value === undefined
        ) {
            return undefined;
        }

        return JSON.parse(
            JSON.stringify(
                value
            )
        );
    }


    function normalize_multi_value(
        value
    ) {
        if (!value) {
            return [];
        }


        if (
            Array.isArray(
                value
            )
        ) {
            return [
                ...new Set(
                    value
                        .map(
                            (item) =>
                                String(
                                    item
                                ).trim()
                        )
                        .filter(Boolean)
                ),
            ];
        }


        if (
            typeof value
            === "string"
        ) {
            const trimmed =
                value.trim();


            if (!trimmed) {
                return [];
            }


            try {
                const parsed =
                    JSON.parse(
                        trimmed
                    );

                if (
                    Array.isArray(
                        parsed
                    )
                ) {
                    return normalize_multi_value(
                        parsed
                    );
                }

            } catch (error) {
                // ليست JSON.
            }


            return [
                ...new Set(
                    trimmed
                        .split(",")
                        .map(
                            (item) =>
                                item.trim()
                        )
                        .filter(Boolean)
                ),
            ];
        }


        return [
            String(value),
        ];
    }



    // ========================================================
    // FilterController
    // ========================================================

    class FilterController {

        constructor(
            options = {}
        ) {
            this.button =
                options.button;


            this.summary_container =
                options.summary_container
                || null;


            this.data_source =
                options.data_source
                || null;


            this.schema =
                options.schema
                || [];


            this.title =
                options.title
                || __("الفلاتر");


            this.on_apply =
                options.on_apply
                || (
                    async () => {}
                );


            this.applied_values =
                {};


            this.$button =
                null;


            this.$summary =
                null;
            this.layout =
                options.layout
                || [];

            this.controls = {};
        }


        // ====================================================
        // Mount
        // ====================================================

        mount() {

            this.$button =
                $(this.button);


            if (
                this.summary_container
            ) {
                this.$summary =
                    $(
                        this.summary_container
                    );
            }


            this.$button
                .off(
                    ".genericFilters"
                )
                .on(
                    "click.genericFilters",
                    () => {
                        this.open();
                    }
                );


            this.update_ui();


            return this;
        }


        // ====================================================
        // Schema fields
        // ====================================================

        build_dialog_fields() {

            const fields = [];


            for (
                const definition
                of this.schema
            ) {
                const type =
                    definition.type;


                // ============================================
                // Text
                // ============================================

                if (
                    type === "text"
                ) {
                    fields.push({
                        fieldname:
                            definition.field,

                        label:
                            definition.label,

                        fieldtype:
                            "Data",

                        placeholder:
                            definition.placeholder
                            || "",
                    });

                    continue;
                }


                // ============================================
                // Multiple Selection
                // ============================================

                if (
                    type
                    === "multi_select"
                ) {
                    fields.push({
                        fieldname:
                            definition.field,

                        label:
                            definition.label,

                        fieldtype:
                            "MultiSelectList",

                        get_data:
                            (
                                txt
                            ) => {
                                return this
                                    .get_multi_select_options(
                                        definition,
                                        txt
                                    );
                            },
                    });

                    continue;
                }


                // ============================================
                // Date range
                // ============================================

                if (
                    type
                    === "date_range"
                ) {
                    fields.push({
                        fieldtype:
                            "Section Break",

                        label:
                            definition.label,
                    });


                    fields.push({
                        fieldname:
                            `${definition.field}__from`,

                        label:
                            __("من تاريخ"),

                        fieldtype:
                            "Date",
                    });


                    fields.push({
                        fieldtype:
                            "Column Break",
                    });


                    fields.push({
                        fieldname:
                            `${definition.field}__to`,

                        label:
                            __("إلى تاريخ"),

                        fieldtype:
                            "Date",
                    });


                    continue;
                }


                // ============================================
                // Number range
                // ============================================

                if (
                    type
                    === "number_range"
                ) {
                    fields.push({
                        fieldtype:
                            "Section Break",

                        label:
                            definition.label,
                    });


                    fields.push({
                        fieldname:
                            `${definition.field}__min`,

                        label:
                            __("من"),

                        fieldtype:
                            "Float",
                    });


                    fields.push({
                        fieldtype:
                            "Column Break",
                    });


                    fields.push({
                        fieldname:
                            `${definition.field}__max`,

                        label:
                            __("إلى"),

                        fieldtype:
                            "Float",
                    });
                }
            }


            return fields;
        }


        // ====================================================
        // Multi select options from current Context
        // ====================================================

        get_multi_select_options(
            definition,
            search_text
        ) {
            let values = [];


            if (
                typeof definition.get_options
                === "function"
            ) {
                values =
                    definition.get_options(
                        this.data_source
                    )
                    || [];

            } else {

                const unique =
                    new Set();


                for (
                    const record
                    of this.data_source
                        ?.records
                        ?.values()
                    || []
                ) {
                    const value =
                        typeof definition
                            .get_value
                        === "function"
                            ? definition
                                .get_value(
                                    record
                                )
                            : record?.[
                                definition.field
                            ];


                    if (
                        value === null
                        ||
                        value === undefined
                        ||
                        value === ""
                    ) {
                        continue;
                    }


                    if (
                        Array.isArray(
                            value
                        )
                    ) {
                        for (
                            const item
                            of value
                        ) {
                            if (
                                item !== null
                                &&
                                item !== undefined
                                &&
                                item !== ""
                            ) {
                                unique.add(
                                    String(
                                        item
                                    )
                                );
                            }
                        }

                    } else {
                        unique.add(
                            String(
                                value
                            )
                        );
                    }
                }


                values = [
                    ...unique,
                ];
            }


            const normalize =
                ns.utils
                    .normalize_search_text;


            const query =
                normalize(
                    search_text
                    || ""
                );


            const mapped =
                values.map(
                    (value) => {

                        const label =
                            typeof definition
                                .get_label
                            === "function"
                                ? definition
                                    .get_label(
                                        value
                                    )
                                : String(
                                    value
                                );


                        return {
                            value:
                                String(
                                    value
                                ),

                            label:
                                String(
                                    label
                                ),
                        };
                    }
                );


            const filtered =
                query
                    ? mapped.filter(
                        (item) =>
                            normalize(
                                item.label
                            ).includes(
                                query
                            )
                            ||
                            normalize(
                                item.value
                            ).includes(
                                query
                            )
                    )
                    : mapped;


            const collator =
                new Intl.Collator(
                    "ar",
                    {
                        numeric:
                            true,

                        sensitivity:
                            "base",
                    }
                );


            filtered.sort(
                (
                    left,
                    right
                ) =>
                    collator.compare(
                        left.label,
                        right.label
                    )
            );


            return filtered.map(
                (item) => ({
                    value:
                        item.value,

                    description:
                        item.label
                        !== item.value
                            ? item.label
                            : "",
                })
            );
        }


        // ====================================================
        // Dialog
        // ====================================================

        // open() {

        //     const dialog =
        //         new frappe.ui.Dialog({
        //             title:
        //                 this.title,

        //             fields:
        //                 this
        //                     .build_dialog_fields(),

        //             primary_action_label:
        //                 __("تطبيق الفلاتر"),

        //             primary_action:
        //                 async () => {

        //                     const values =
        //                         this.read_dialog_values(
        //                             dialog
        //                         );


        //                     this.applied_values =
        //                         values;


        //                     dialog.hide();


        //                     await this
        //                         .emit_apply();
        //                 },

        //             secondary_action_label:
        //                 __("مسح الفلاتر"),

        //             secondary_action:
        //                 async () => {

        //                     this.applied_values =
        //                         {};


        //                     dialog.hide();


        //                     await this
        //                         .emit_apply();
        //                 },
        //         });


        //     dialog.show();


        //     this.hydrate_dialog(
        //         dialog
        //     );
        // }

        open() {

            this.controls = {};


            const dialog =
                new frappe.ui.Dialog({

                    title:
                        this.title,

                    size:
                        "extra-large",

                    fields: [
                        {
                            fieldname:
                                "generic_filter_layout",

                            fieldtype:
                                "HTML",
                        },
                    ],

                    primary_action_label:
                        __("تطبيق الفلاتر"),

                    primary_action:
                        async () => {

                            this.applied_values =
                                this.read_custom_controls();


                            dialog.hide();


                            await this
                                .emit_apply();
                        },

                    secondary_action_label:
                        __("مسح الفلاتر"),

                    secondary_action:
                        async () => {

                            this.applied_values =
                                {};


                            dialog.hide();


                            await this
                                .emit_apply();
                        },
                });


            dialog.show();


            dialog.$wrapper
                .addClass(
                    "generic-filter-dialog"
                );


            this.render_custom_layout(
                dialog
            );


            this.hydrate_custom_controls();
        }

        render_custom_layout(
                dialog
            ) {

                const field =
                    dialog.fields_dict
                        .generic_filter_layout;


                const $host =
                    field.$wrapper;


                $host.empty();


                const definitions =
                    new Map(
                        this.schema.map(
                            (definition) => [
                                definition.field,
                                definition,
                            ]
                        )
                    );


                for (
                    const section
                    of this.layout
                ) {

                    const $section =
                        $(`
                            <section
                                class="generic-filter-section"
                                dir="rtl"
                            >
                                <div
                                    class="generic-filter-section-header"
                                >
                                    <div
                                        class="generic-filter-section-title"
                                    >
                                        ${frappe.utils.escape_html(
                                            section.title
                                            || ""
                                        )}
                                    </div>

                                    ${
                                        section.subtitle
                                            ? `
                                                <div
                                                    class="generic-filter-section-subtitle"
                                                >
                                                    ${frappe.utils.escape_html(
                                                        section.subtitle
                                                    )}
                                                </div>
                                            `
                                            : ""
                                    }
                                </div>

                                <div
                                    class="generic-filter-grid"
                                ></div>
                            </section>
                        `);


                    const $grid =
                        $section.find(
                            ".generic-filter-grid"
                        );


                    for (
                        const fieldname
                        of section.fields || []
                    ) {

                        const definition =
                            definitions.get(
                                fieldname
                            );


                        if (!definition) {
                            continue;
                        }


                        const $cell =
                            $(`
                                <div
                                    class="generic-filter-field"
                                    data-filter-field="${frappe.utils.escape_html(
                                        fieldname
                                    )}"
                                ></div>
                            `);


                        $grid.append(
                            $cell
                        );


                        this.render_filter_control(
                            definition,
                            $cell
                        );
                    }


                    $host.append(
                        $section
                    );
                }
            }

        

        make_filter_control(
            $parent,
            definition
        ) {

            const control =
                frappe.ui.form.make_control({

                    parent:
                        $parent,

                    df:
                        definition,

                    render_input:
                        true,
                });


            control.refresh();


            return control;
        }


        render_filter_control(
            definition,
            $cell
        ) {

            const field =
                definition.field;


            // ====================================================
            // Text
            // ====================================================

            if (
                definition.type
                === "text"
            ) {

                this.controls[field] =
                    this.make_filter_control(
                        $cell,
                        {
                            fieldname:
                                field,

                            label:
                                definition.label,

                            fieldtype:
                                "Data",
                        }
                    );


                return;
            }


            // ====================================================
            // Multiple Selection
            // ====================================================

            if (
                definition.type
                === "multi_select"
            ) {

                this.controls[field] =
                    this.make_filter_control(
                        $cell,
                        {
                            fieldname:
                                field,

                            label:
                                definition.label,

                            fieldtype:
                                "MultiSelectList",

                            get_data:
                                (txt) =>
                                    this
                                        .get_multi_select_options(
                                            definition,
                                            txt
                                        ),
                        }
                    );


                return;
            }


            // ====================================================
            // Number Range
            // ====================================================

            if (
                definition.type
                === "number_range"
            ) {

                $cell.addClass(
                    "generic-filter-range-field"
                );


                $cell.append(
                    `
                        <div
                            class="generic-filter-range-title"
                        >
                            ${frappe.utils.escape_html(
                                definition.label
                            )}
                        </div>

                        <div
                            class="generic-filter-range-grid"
                        >
                            <div
                                class="generic-filter-range-from"
                            ></div>

                            <div
                                class="generic-filter-range-to"
                            ></div>
                        </div>
                    `
                );


                const min =
                    this.make_filter_control(
                        $cell.find(
                            ".generic-filter-range-from"
                        ),
                        {
                            fieldname:
                                `${field}__min`,

                            label:
                                __("من"),

                            fieldtype:
                                "Float",
                        }
                    );


                const max =
                    this.make_filter_control(
                        $cell.find(
                            ".generic-filter-range-to"
                        ),
                        {
                            fieldname:
                                `${field}__max`,

                            label:
                                __("إلى"),

                            fieldtype:
                                "Float",
                        }
                    );


                this.controls[field] = {
                    min,
                    max,
                };


                return;
            }


            // ====================================================
            // Date Range
            // ====================================================

            if (
                definition.type
                === "date_range"
            ) {

                $cell.addClass(
                    "generic-filter-range-field"
                );


                $cell.append(
                    `
                        <div
                            class="generic-filter-range-title"
                        >
                            ${frappe.utils.escape_html(
                                definition.label
                            )}
                        </div>

                        <div
                            class="generic-filter-range-grid"
                        >
                            <div
                                class="generic-filter-range-from"
                            ></div>

                            <div
                                class="generic-filter-range-to"
                            ></div>
                        </div>
                    `
                );


                const from =
                    this.make_filter_control(
                        $cell.find(
                            ".generic-filter-range-from"
                        ),
                        {
                            fieldname:
                                `${field}__from`,

                            label:
                                __("من تاريخ"),

                            fieldtype:
                                "Date",
                        }
                    );


                const to =
                    this.make_filter_control(
                        $cell.find(
                            ".generic-filter-range-to"
                        ),
                        {
                            fieldname:
                                `${field}__to`,

                            label:
                                __("إلى تاريخ"),

                            fieldtype:
                                "Date",
                        }
                    );


                this.controls[field] = {
                    from,
                    to,
                };
            }
        }

        hydrate_custom_controls() {

            for (
                const definition
                of this.schema
            ) {

                const field =
                    definition.field;


                const control =
                    this.controls[
                        field
                    ];


                if (!control) {
                    continue;
                }


                const value =
                    this.applied_values[
                        field
                    ];


                if (
                    definition.type
                    === "text"
                ) {

                    control.set_value(
                        value || ""
                    );

                    continue;
                }


                if (
                    definition.type
                    === "multi_select"
                ) {

                    control.set_value(
                        normalize_multi_value(
                            value
                        )
                    );

                    continue;
                }


                if (
                    definition.type
                    === "number_range"
                ) {

                    control.min.set_value(
                        value?.min
                        ?? ""
                    );


                    control.max.set_value(
                        value?.max
                        ?? ""
                    );


                    continue;
                }


                if (
                    definition.type
                    === "date_range"
                ) {

                    control.from.set_value(
                        value?.from
                        || ""
                    );


                    control.to.set_value(
                        value?.to
                        || ""
                    );
                }
            }
        }

        read_custom_controls() {

            const values =
                {};


            for (
                const definition
                of this.schema
            ) {

                const field =
                    definition.field;


                const control =
                    this.controls[
                        field
                    ];


                if (!control) {
                    continue;
                }


                // ================================================
                // Text
                // ================================================

                if (
                    definition.type
                    === "text"
                ) {

                    const value =
                        String(
                            control.get_value()
                            || ""
                        ).trim();


                    if (value) {
                        values[field] =
                            value;
                    }


                    continue;
                }


                // ================================================
                // Multi Select
                // ================================================

                if (
                    definition.type
                    === "multi_select"
                ) {

                    const selected =
                        normalize_multi_value(
                            control.get_value()
                        );


                    if (
                        selected.length
                    ) {
                        values[field] =
                            selected;
                    }


                    continue;
                }


                // ================================================
                // Number Range
                // ================================================

                if (
                    definition.type
                    === "number_range"
                ) {

                    const min =
                        control.min
                            .get_value();


                    const max =
                        control.max
                            .get_value();


                    const has_min =
                        min !== null
                        &&
                        min !== undefined
                        &&
                        min !== "";


                    const has_max =
                        max !== null
                        &&
                        max !== undefined
                        &&
                        max !== "";


                    if (
                        has_min
                        ||
                        has_max
                    ) {

                        values[field] = {

                            min:
                                has_min
                                    ? Number(min)
                                    : null,

                            max:
                                has_max
                                    ? Number(max)
                                    : null,
                        };
                    }


                    continue;
                }


                // ================================================
                // Date Range
                // ================================================

                if (
                    definition.type
                    === "date_range"
                ) {

                    const from =
                        control.from
                            .get_value()
                        || null;


                    const to =
                        control.to
                            .get_value()
                        || null;


                    if (
                        from
                        ||
                        to
                    ) {

                        values[field] = {
                            from,
                            to,
                        };
                    }
                }
            }


            return values;
        }

        


        // ====================================================
        // Fill dialog from applied state
        // ====================================================

        hydrate_dialog(
            dialog
        ) {

            for (
                const definition
                of this.schema
            ) {
                const value =
                    this.applied_values[
                        definition.field
                    ];


                if (
                    definition.type
                    === "text"
                ) {
                    dialog.set_value(
                        definition.field,
                        value
                        || ""
                    );

                    continue;
                }


                if (
                    definition.type
                    === "multi_select"
                ) {
                    dialog.set_value(
                        definition.field,
                        normalize_multi_value(
                            value
                        )
                    );

                    continue;
                }


                if (
                    definition.type
                    === "date_range"
                ) {
                    dialog.set_value(
                        `${definition.field}__from`,
                        value?.from
                        || ""
                    );


                    dialog.set_value(
                        `${definition.field}__to`,
                        value?.to
                        || ""
                    );

                    continue;
                }


                if (
                    definition.type
                    === "number_range"
                ) {
                    dialog.set_value(
                        `${definition.field}__min`,
                        value?.min
                        ?? ""
                    );


                    dialog.set_value(
                        `${definition.field}__max`,
                        value?.max
                        ?? ""
                    );
                }
            }
        }


        // ====================================================
        // Read dialog
        // ====================================================

        read_dialog_values(
            dialog
        ) {
            const raw =
                dialog.get_values()
                || {};


            const values =
                {};


            for (
                const definition
                of this.schema
            ) {
                const field =
                    definition.field;


                if (
                    definition.type
                    === "text"
                ) {
                    const value =
                        String(
                            raw[field]
                            || ""
                        ).trim();


                    if (value) {
                        values[
                            field
                        ] = value;
                    }

                    continue;
                }


                if (
                    definition.type
                    === "multi_select"
                ) {
                    const selected =
                        normalize_multi_value(
                            raw[field]
                        );


                    if (
                        selected.length
                    ) {
                        values[
                            field
                        ] = selected;
                    }

                    continue;
                }


                if (
                    definition.type
                    === "date_range"
                ) {
                    const from =
                        raw[
                            `${field}__from`
                        ]
                        || null;


                    const to =
                        raw[
                            `${field}__to`
                        ]
                        || null;


                    if (
                        from
                        ||
                        to
                    ) {
                        values[
                            field
                        ] = {
                            from:
                                from,

                            to:
                                to,
                        };
                    }

                    continue;
                }


                if (
                    definition.type
                    === "number_range"
                ) {
                    const min =
                        raw[
                            `${field}__min`
                        ];


                    const max =
                        raw[
                            `${field}__max`
                        ];


                    const has_min =
                        min !== null
                        &&
                        min !== undefined
                        &&
                        min !== "";


                    const has_max =
                        max !== null
                        &&
                        max !== undefined
                        &&
                        max !== "";


                    if (
                        has_min
                        ||
                        has_max
                    ) {
                        values[
                            field
                        ] = {
                            min:
                                has_min
                                    ? Number(
                                        min
                                    )
                                    : null,

                            max:
                                has_max
                                    ? Number(
                                        max
                                    )
                                    : null,
                        };
                    }
                }
            }


            return values;
        }


        // ====================================================
        // Compile UI values -> DataSource filters
        // ====================================================

        get_query_filters() {

            const filters =
                {};


            for (
                const definition
                of this.schema
            ) {
                const field =
                    definition.field;


                const value =
                    this.applied_values[
                        field
                    ];


                if (
                    value === null
                    ||
                    value === undefined
                ) {
                    continue;
                }


                if (
                    typeof definition.compile
                    === "function"
                ) {
                    const compiled =
                        definition.compile(
                            value
                        );


                    if (
                        compiled !== null
                        &&
                        compiled !== undefined
                    ) {
                        filters[
                            field
                        ] = compiled;
                    }

                    continue;
                }


                if (
                    definition.type
                    === "text"
                ) {
                    filters[
                        field
                    ] = {
                        op:
                            "contains_normalized",

                        value:
                            value,
                    };

                    continue;
                }


                if (
                    definition.type
                    === "multi_select"
                ) {
                    filters[
                        field
                    ] = {
                        op:
                            "in",

                        value:
                            normalize_multi_value(
                                value
                            ),
                    };

                    continue;
                }


                if (
                    definition.type
                    === "date_range"
                ) {
                    filters[
                        field
                    ] = {
                        op:
                            "date_range",

                        from:
                            value.from
                            || null,

                        to:
                            value.to
                            || null,
                    };

                    continue;
                }


                if (
                    definition.type
                    === "number_range"
                ) {
                    filters[
                        field
                    ] = {
                        op:
                            "number_range",

                        min:
                            value.min
                            ?? null,

                        max:
                            value.max
                            ?? null,
                    };
                }
            }


            return filters;
        }


        // ====================================================
        // Apply
        // ====================================================

        async emit_apply() {

            this.update_ui();


            await this.on_apply({
                values:
                    clone_value(
                        this.applied_values
                    ),

                filters:
                    this
                        .get_query_filters(),
            });
        }


        // ====================================================
        // UI summary
        // ====================================================

        get_active_count() {

            return Object.keys(
                this.applied_values
                || {}
            ).length;
        }


        format_filter_value(
            definition,
            value
        ) {

            if (
                definition.type
                === "multi_select"
            ) {
                const values =
                    normalize_multi_value(
                        value
                    );


                const labels =
                    values.map(
                        (item) =>
                            typeof definition
                                .get_label
                            === "function"
                                ? definition
                                    .get_label(
                                        item
                                    )
                                : item
                    );


                if (
                    labels.length <= 3
                ) {
                    return labels.join(
                        "، "
                    );
                }


                return (
                    labels
                        .slice(
                            0,
                            3
                        )
                        .join(
                            "، "
                        )
                    +
                    ` +${labels.length - 3}`
                );
            }


            if (
                definition.type
                === "date_range"
            ) {
                if (
                    value.from
                    &&
                    value.to
                ) {
                    return (
                        `${value.from} → ${value.to}`
                    );
                }


                if (
                    value.from
                ) {
                    return (
                        `${__("من")} ${value.from}`
                    );
                }


                return (
                    `${__("إلى")} ${value.to}`
                );
            }


            if (
                definition.type
                === "number_range"
            ) {
                if (
                    value.min !== null
                    &&
                    value.min !== undefined
                    &&
                    value.max !== null
                    &&
                    value.max !== undefined
                ) {
                    return (
                        `${value.min} → ${value.max}`
                    );
                }


                if (
                    value.min !== null
                    &&
                    value.min !== undefined
                ) {
                    return (
                        `${__("من")} ${value.min}`
                    );
                }


                return (
                    `${__("إلى")} ${value.max}`
                );
            }


            return String(
                value
            );
        }


        update_ui() {

            this.update_button();

            this.render_summary();
        }


        update_button() {

            if (
                !this.$button
                ||
                !this.$button.length
            ) {
                return;
            }


            this.$button
                .find(
                    ".generic-filter-badge"
                )
                .remove();


            const count =
                this.get_active_count();


            if (!count) {
                return;
            }


            this.$button.append(
                `
                    <span
                        class="generic-filter-badge"
                    >
                        ${count}
                    </span>
                `
            );
        }


        render_summary() {

            if (
                !this.$summary
                ||
                !this.$summary.length
            ) {
                return;
            }


            const chips = [];


            for (
                const definition
                of this.schema
            ) {
                const field =
                    definition.field;


                if (
                    !Object.prototype
                        .hasOwnProperty
                        .call(
                            this.applied_values,
                            field
                        )
                ) {
                    continue;
                }


                const value =
                    this.applied_values[
                        field
                    ];


                chips.push(
                    `
                        <button
                            type="button"
                            class="generic-filter-chip"
                            data-filter-field="${frappe.utils.escape_html(
                                field
                            )}"
                            title="${__("إزالة هذا الفلتر")}"
                        >
                            <strong>
                                ${frappe.utils.escape_html(
                                    definition.label
                                )}:
                            </strong>

                            <span>
                                ${frappe.utils.escape_html(
                                    this.format_filter_value(
                                        definition,
                                        value
                                    )
                                )}
                            </span>

                            <span
                                class="generic-filter-chip-remove"
                            >
                                ×
                            </span>
                        </button>
                    `
                );
            }


            if (!chips.length) {
                this.$summary.empty();

                return;
            }


            this.$summary.html(
                `
                    <div
                        class="generic-active-filters"
                    >
                        ${chips.join("")}

                        <button
                            type="button"
                            class="
                                btn
                                btn-link
                                btn-sm
                                generic-clear-all-filters
                            "
                        >
                            ${__("مسح الكل")}
                        </button>
                    </div>
                `
            );


            this.$summary
                .find(
                    ".generic-filter-chip"
                )
                .off(
                    ".genericFilters"
                )
                .on(
                    "click.genericFilters",
                    async (event) => {

                        const field =
                            $(event.currentTarget)
                                .data(
                                    "filter-field"
                                );


                        delete this
                            .applied_values[
                                field
                            ];


                        await this
                            .emit_apply();
                    }
                );


            this.$summary
                .find(
                    ".generic-clear-all-filters"
                )
                .off(
                    ".genericFilters"
                )
                .on(
                    "click.genericFilters",
                    async () => {

                        this.applied_values =
                            {};


                        await this
                            .emit_apply();
                    }
                );
        }


        // ====================================================
        // Public API
        // ====================================================

        clear() {

            this.applied_values =
                {};


            return this
                .emit_apply();
        }


        get_values() {

            return clone_value(
                this.applied_values
            );
        }
    }


    ns.FilterController =
        FilterController;

})();