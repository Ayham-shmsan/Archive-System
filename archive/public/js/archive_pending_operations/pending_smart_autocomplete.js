window.ArchivePendingSmartAutocomplete =
class ArchivePendingSmartAutocomplete {
    static counter = 0;

    constructor(options = {}) {
        this.dialog =
            options.dialog;

        this.fieldnames =
            options.fieldnames
            || [
                "machine_location",
                "machine_no",
                "branch_no",
            ];

        this.context_provider =
            typeof options.context_provider
                === "function"
                ? options.context_provider
                : () => ({});

        this.enabled_provider =
            typeof options.enabled_provider
                === "function"
                ? options.enabled_provider
                : () => true;
        this.on_select =
            typeof options.on_select
                === "function"
                ? options.on_select
                : null;

        this.limit =
            Number(
                options.limit
                || 10
            );
        // Suggestions متاحة لكل الحقول المسجلة في fieldnames.
        //
        // Related-field prompt داخل هذا component
        // يبقى خاصًا بحقوق المكينة.
        //
        // Card ↔ Account autofill يتم في Dialog
        // عبر on_select + local resolver.
        this.related_source_fields =
            new Set(
                options.related_source_fields
                || [
                    "machine_location",
                    "machine_no",
                    "branch_no",
                ]
            );

        this.cache =
            new Map();

        this.states =
            new Map();

        this.instance_id =
            ++ArchivePendingSmartAutocomplete
                .counter;

        this.namespace =
            `.pending_smart_${this.instance_id}`;

        this.related_labels = {
            machine_location:
                "موقع المكينة",

            machine_no:
                "رقم المكينة",

            branch_no:
                "رقم الفرع",
        };

        this.bind_global_events();
        this.refresh();
    }

    refresh() {
        this.clear_field_states();

        for (
            const fieldname
            of this.fieldnames
        ) {
            this.attach_field(
                fieldname
            );
        }
    }

    attach_field(
        fieldname
    ) {
        const field =
            this.dialog
                ?.fields_dict
                ?.[fieldname];

        const $input =
            field?.$input;

        if (
            !$input
            ||
            !$input.length
        ) {
            return;
        }

        $input.attr(
            "autocomplete",
            "off"
        );

        const $menu =
            $(`
                <div
                    class="
                        pending-smart-autocomplete-menu
                    "
                    role="listbox"
                    style="display:none;"
                ></div>
            `);

        $("body").append(
            $menu
        );

        const state = {
            fieldname,
            field,
            $input,
            $menu,

            timer:
                null,

            request_seq:
                0,

            items:
                [],

            active_index:
                -1,
        };

        this.states.set(
            fieldname,
            state
        );

        $input
            .off(
                this.namespace
            )
            .on(
                `focus${this.namespace}`,
                () => {
                    this.schedule_lookup(
                        state
                    );
                }
            )
            .on(
                `input${this.namespace}`,
                () => {
                    this.schedule_lookup(
                        state
                    );
                }
            )
            .on(
                `keydown${this.namespace}`,
                (event) => {
                    this.handle_keydown(
                        state,
                        event
                    );
                }
            )
            .on(
                `blur${this.namespace}`,
                () => {
                    setTimeout(
                        () => {
                            this.hide_menu(
                                state
                            );
                        },
                        130
                    );
                }
            );

        $menu
            .on(
                `mousedown${this.namespace}`,
                ".pending-smart-autocomplete-item",
                (event) => {
                    /*
                     * يمنع Blur قبل معالجة Click.
                     */
                    event.preventDefault();
                }
            )
            .on(
                `click${this.namespace}`,
                ".pending-smart-autocomplete-item",
                (event) => {
                    const index =
                        Number(
                            $(event.currentTarget)
                                .data(
                                    "index"
                                )
                        );

                    this.select_item(
                        state,
                        index
                    );
                }
            );
    }

    schedule_lookup(
        state
    ) {
        if (
            !this.is_enabled()
        ) {
            this.hide_menu(
                state
            );

            return;
        }

        clearTimeout(
            state.timer
        );

        state.timer =
            setTimeout(
                () => {
                    this.lookup(
                        state
                    );
                },
                180
            );
    }

    async lookup(
        state
    ) {
        if (
            !this.is_enabled()
        ) {
            this.hide_menu(
                state
            );

            return;
        }

        const query =
            String(
                state.$input.val()
                || ""
            ).trim();

        const context =
            this.get_context();

        const cache_key =
            JSON.stringify(
                [
                    state.fieldname,
                    query,
                    context,
                ]
            );

        if (
            this.cache.has(
                cache_key
            )
        ) {
            this.render_items(
                state,
                this.cache.get(
                    cache_key
                )
            );

            return;
        }

        state.request_seq += 1;

        const request_seq =
            state.request_seq;

        try {
            const response =
                await frappe.call({
                    method:
                        "archive.api.pending_lookups.get_pending_suggestions",

                    type:
                        "GET",

                    args: {
                        fieldname:
                            state.fieldname,

                        query,

                        context:
                            JSON.stringify(
                                context
                            ),

                        limit:
                            this.limit,
                    },
                });

            if (
                request_seq
                !== state.request_seq
            ) {
                return;
            }

            const suggestions =
                (
                    response.message
                        ?.suggestions
                    || []
                )
                .map(
                    (item) =>
                        String(
                            item.value
                            || ""
                        ).trim()
                )
                .filter(
                    Boolean
                );

            /*
             * Cache محدود حتى لا تتحول الجلسة
             * إلى مخزن غير محدود.
             */
            if (
                this.cache.size
                >= 100
            ) {
                this.cache.clear();
            }

            this.cache.set(
                cache_key,
                suggestions
            );

            this.render_items(
                state,
                suggestions
            );

        } catch (error) {
            console.error(
                "Pending smart autocomplete failed:",
                error
            );

            this.hide_menu(
                state
            );
        }
    }

    render_items(
        state,
        items
    ) {
        state.items =
            items;

        state.active_index =
            -1;

        if (
            !items.length
            ||
            !this.is_enabled()
        ) {
            this.hide_menu(
                state
            );

            return;
        }

        /*
         * إذا فقد الـInput التركيز أثناء Request
         * لا نفتح Dropdown متأخرًا.
         */
        if (
            document.activeElement
            !== state.$input.get(0)
        ) {
            return;
        }

        state.$menu.html(
            items
                .map(
                    (
                        value,
                        index
                    ) => `
                        <button
                            type="button"
                            class="
                                pending-smart-autocomplete-item
                            "
                            role="option"
                            data-index="${index}"
                        >
                            ${frappe.utils.escape_html(
                                value
                            )}
                        </button>
                    `
                )
                .join("")
        );

        this.position_menu(
            state
        );

        state.$menu.show();
    }

    position_menu(
        state
    ) {
        const element =
            state.$input.get(0);

        if (!element) {
            return;
        }

        const rect =
            element.getBoundingClientRect();

        const width =
            Math.max(
                rect.width,
                260
            );

        state.$menu.css({
            position:
                "fixed",

            top:
                `${rect.bottom + 4}px`,

            left:
                `${rect.left}px`,

            width:
                `${width}px`,

            zIndex:
                1080,
        });
    }

    handle_keydown(
        state,
        event
    ) {
        if (
            !state.$menu.is(
                ":visible"
            )
            ||
            !state.items.length
        ) {
            return;
        }

        if (
            event.key
            === "ArrowDown"
        ) {
            event.preventDefault();

            state.active_index =
                Math.min(
                    state.active_index
                    + 1,
                    state.items.length
                    - 1
                );

            this.update_active_item(
                state
            );

            return;
        }

        if (
            event.key
            === "ArrowUp"
        ) {
            event.preventDefault();

            state.active_index =
                Math.max(
                    state.active_index
                    - 1,
                    0
                );

            this.update_active_item(
                state
            );

            return;
        }

        if (
            event.key
            === "Enter"
            &&
            state.active_index
            >= 0
        ) {
            event.preventDefault();

            this.select_item(
                state,
                state.active_index
            );

            return;
        }

        if (
            event.key
            === "Escape"
        ) {
            event.preventDefault();

            this.hide_menu(
                state
            );
        }
    }

    update_active_item(
        state
    ) {
        const $items =
            state.$menu.find(
                ".pending-smart-autocomplete-item"
            );

        $items.removeClass(
            "is-active"
        );

        const $active =
            $items.eq(
                state.active_index
            );

        $active.addClass(
            "is-active"
        );

        $active.get(0)
            ?.scrollIntoView({
                block:
                    "nearest",
            });
    }

    // async select_item(
    //     state,
    //     index
    // ) {
    //     const value =
    //         state.items[
    //             index
    //         ];

    //     if (!value) {
    //         return;
    //     }

    //     this.hide_menu(
    //         state
    //     );

    //     await Promise.resolve(
    //         this.dialog.set_value(
    //             state.fieldname,
    //             value
    //         )
    //     );

    //     await this.offer_related_fields(
    //         state.fieldname,
    //         value
    //     );
    // }
        // async select_item(
        //     state,
        //     index
        // ) {
        //     const value =
        //         state.items[
        //             index
        //         ];

        //     if (!value) {
        //         return;
        //     }

        //     this.hide_menu(
        //         state
        //     );

        //     await Promise.resolve(
        //         this.dialog.set_value(
        //             state.fieldname,
        //             value
        //         )
        //     );

        //     if (
        //         this.related_source_fields.has(
        //             state.fieldname
        //         )
        //     ) {
        //         await this.offer_related_fields(
        //             state.fieldname,
        //             value
        //         );
        //     }
        // }
        async select_item(
            state,
            index
        ) {
            const value =
                state.items[
                    index
                ];


            if (!value) {
                return;
            }


            this.hide_menu(
                state
            );


            await Promise.resolve(
                this.dialog
                    .set_value(
                        state.fieldname,
                        value
                    )
            );


            /*
            * إشعار الـDialog مباشرة بأن المستخدم
            * اختار قيمة من Smart Autocomplete.
            *
            * هذا مهم خصوصًا لـ:
            * card_name ↔ account_number
            *
            * لأن set_value البرمجي ليس من الصحيح
            * الاعتماد عليه لإطلاق DOM input/change.
            */
            if (
                this.on_select
            ) {
                try {
                    await Promise.resolve(
                        this.on_select({
                            fieldname:
                                state.fieldname,

                            value:
                                value,
                        })
                    );

                } catch (error) {
                    console.error(
                        "Pending smart autocomplete on_select failed:",
                        error
                    );
                }
            }


            /*
            * Related-field prompt القديم يبقى
            * للمكينة/الفرع فقط.
            */
            if (
                this.related_source_fields
                    .has(
                        state.fieldname
                    )
            ) {
                await this
                    .offer_related_fields(
                        state.fieldname,
                        value
                    );
            }
        }

    async offer_related_fields(
        fieldname,
        value
    ) {
        if (
            !this.is_enabled()
        ) {
            return;
        }

        try {
            const response =
                await frappe.call({
                    method:
                        "archive.api.pending_lookups.get_pending_related_fields",

                    type:
                        "GET",

                    args: {
                        fieldname,

                        value,

                        context:
                            JSON.stringify(
                                this.get_context()
                            ),
                    },
                });

            const related =
                response.message
                    ?.related
                || {};

            const fillable = [];

            for (
                const [
                    related_field,
                    suggestion,
                ]
                of Object.entries(
                    related
                )
            ) {
                /*
                 * نستخدم High-confidence فقط
                 * للـAutofill prompt.
                 *
                 * سجل واحد لا يكفي ليصبح اقتراح
                 * تعبئة شبه تلقائي.
                 */
                if (
                    suggestion
                        ?.confidence
                    !== "high"
                ) {
                    continue;
                }

                const suggestion_value =
                    String(
                        suggestion.value
                        || ""
                    ).trim();

                if (!suggestion_value) {
                    continue;
                }

                const current_value =
                    String(
                        this.dialog
                            .get_value(
                                related_field
                            )
                        || ""
                    ).trim();

                /*
                 * لا نستبدل أبدًا قيمة كتبها المستخدم.
                 */
                if (current_value) {
                    continue;
                }

                fillable.push({
                    fieldname:
                        related_field,

                    value:
                        suggestion_value,
                });
            }

            if (!fillable.length) {
                return;
            }

            const message =
                `
                    <div
                        style="
                            line-height:1.8;
                            text-align:right;
                        "
                    >
                        <div
                            style="
                                margin-bottom:8px;
                            "
                        >
                            توجد بيانات مرتبطة ثابتة تاريخيًا
                            بالقيمة المختارة:
                        </div>

                        ${fillable
                            .map(
                                (item) => `
                                    <div>
                                        <strong>
                                            ${frappe.utils.escape_html(
                                                this.related_labels[
                                                    item.fieldname
                                                ]
                                                ||
                                                item.fieldname
                                            )}
                                        </strong>
                                        :
                                        ${frappe.utils.escape_html(
                                            item.value
                                        )}
                                    </div>
                                `
                            )
                            .join("")}

                        <div
                            style="
                                margin-top:8px;
                                color:var(--text-muted);
                            "
                        >
                            هل تريد تعبئة الحقول الفارغة بهذه الاقتراحات؟
                        </div>
                    </div>
                `;

            frappe.confirm(
                message,

                async () => {
                    for (
                        const item
                        of fillable
                    ) {
                        /*
                         * نعيد الفحص لحظة الموافقة،
                         * فقد يكون المستخدم كتب قيمة
                         * أثناء ظهور Confirm.
                         */
                        const current =
                            String(
                                this.dialog
                                    .get_value(
                                        item.fieldname
                                    )
                                || ""
                            ).trim();

                        if (current) {
                            continue;
                        }

                        await Promise.resolve(
                            this.dialog
                                .set_value(
                                    item.fieldname,
                                    item.value
                                )
                        );
                    }
                }
            );

        } catch (error) {
            console.error(
                "Pending related-field suggestion failed:",
                error
            );
        }
    }

    // get_context() {
    //     const raw =
    //         this.context_provider()
    //         || {};

    //     const result = {};

    //     for (
    //         const fieldname
    //         of [
    //             "bank",
    //             "region",
    //             "machine_location",
    //             "machine_no",
    //             "branch_no",
    //             "card_owner",
    //             "card_name",
    //             "account_number",
    //         ]
    //     ) {
    //         const value =
    //             String(
    //                 raw[fieldname]
    //                 || ""
    //             ).trim();

    //         if (value) {
    //             result[
    //                 fieldname
    //             ] = value;
    //         }
    //     }

    //     return result;
    // }
        get_context() {
            const raw =
                this.context_provider()
                || {};

            const result = {};

            for (
                const fieldname
                of [
                    "bank",
                    "card_owner",
                    "card_name",
                    "account_number",
                    "region",
                    "machine_location",
                    "machine_no",
                    "branch_no",
                ]
            ) {
                const value =
                    String(
                        raw[fieldname]
                        || ""
                    ).trim();

                if (value) {
                    result[
                        fieldname
                    ] = value;
                }
            }

            return result;
        }

    is_enabled() {
        try {
            return Boolean(
                this.enabled_provider()
            );

        } catch {
            return false;
        }
    }

    hide_menu(
        state
    ) {
        if (!state) {
            return;
        }

        state.$menu.hide();

        state.active_index =
            -1;
    }

    hide_all() {
        for (
            const state
            of this.states.values()
        ) {
            this.hide_menu(
                state
            );
        }
    }

    bind_global_events() {
        $(document)
            .off(
                this.namespace
            )
            .on(
                `mousedown${this.namespace}`,
                (event) => {
                    const $target =
                        $(event.target);

                    if (
                        $target.closest(
                            ".pending-smart-autocomplete-menu"
                        ).length
                    ) {
                        return;
                    }

                    this.hide_all();
                }
            );

        $(window)
            .off(
                this.namespace
            )
            .on(
                `resize${this.namespace}`,
                () => {
                    this.hide_all();
                }
            );

        this.dialog
            ?.$wrapper
            ?.find(
                ".modal-body"
            )
            .off(
                this.namespace
            )
            .on(
                `scroll${this.namespace}`,
                () => {
                    this.hide_all();
                }
            );
    }

    clear_field_states() {
        for (
            const state
            of this.states.values()
        ) {
            clearTimeout(
                state.timer
            );

            state.$input.off(
                this.namespace
            );

            state.$menu
                .off(
                    this.namespace
                )
                .remove();
        }

        this.states.clear();
    }

    destroy() {
        this.clear_field_states();

        $(document).off(
            this.namespace
        );

        $(window).off(
            this.namespace
        );

        this.dialog
            ?.$wrapper
            ?.find(
                ".modal-body"
            )
            .off(
                this.namespace
            );

        this.cache.clear();
    }
};

window.ArchivePendingCardAccountLookup =
class ArchivePendingCardAccountLookup {

    constructor(options = {}) {
        this.rows =
            Array.isArray(
                options.rows
            )
                ? options.rows
                : [];

        this.index = {
            card_name:
                new Map(),

            account_number:
                new Map(),
        };

        this.build_index();
    }


    normalize(
        value
    ) {
        return String(
            value
            ?? ""
        )
            .normalize(
                "NFKC"
            )
            .trim()
            .replace(
                /\s+/g,
                " "
            )
            .toLocaleLowerCase();
    }


    add_to_index(
        fieldname,
        value,
        row
    ) {
        const key =
            this.normalize(
                value
            );

        if (!key) {
            return;
        }


        const map =
            this.index[
                fieldname
            ];


        if (
            !map.has(
                key
            )
        ) {
            map.set(
                key,
                []
            );
        }


        map.get(
            key
        ).push(
            row
        );
    }


    build_index() {
        for (
            const row
            of this.rows
        ) {
            const card_name =
                String(
                    row?.card_name
                    || ""
                ).trim();

            const account_number =
                String(
                    row?.account_number
                    || ""
                ).trim();


            /*
             * لا نبني علاقة من سجل ناقص.
             */
            if (
                !card_name
                ||
                !account_number
            ) {
                continue;
            }


            this.add_to_index(
                "card_name",
                card_name,
                row
            );

            this.add_to_index(
                "account_number",
                account_number,
                row
            );
        }
    }


    resolve(
        fieldname,
        value,
        context = {}
    ) {
        const relation = {
            card_name:
                "account_number",

            account_number:
                "card_name",
        };


        const target_fieldname =
            relation[
                fieldname
            ];


        if (!target_fieldname) {
            return "";
        }


        const key =
            this.normalize(
                value
            );


        if (!key) {
            return "";
        }


        const candidates =
            [
                ...(
                    this.index[
                        fieldname
                    ]?.get(
                        key
                    )
                    || []
                ),
            ];


        if (!candidates.length) {
            return "";
        }


        /*
         * نحاول إزالة الالتباس باستخدام
         * البنك ومالك البطاقة إذا كانا معروفين.
         *
         * إذا لم يوجد Match للسياق لا نسقط
         * كل النتائج؛ نبقى على المجموعة السابقة.
         */
        let scoped =
            candidates;


        for (
            const context_field
            of [
                "bank",
                "card_owner",
            ]
        ) {
            const context_value =
                this.normalize(
                    context?.[
                        context_field
                    ]
                );


            if (!context_value) {
                continue;
            }


            const matches =
                scoped.filter(
                    (row) =>
                        this.normalize(
                            row?.[
                                context_field
                            ]
                        )
                        ===
                        context_value
                );


            if (
                matches.length
            ) {
                scoped =
                    matches;
            }
        }


        /*
         * نجمع القيم الفريدة فعليًا.
         *
         * إذا بقيت قيمة واحدة:
         * العلاقة غير ملتبسة ويمكن تعبئتها.
         *
         * إذا بقي أكثر من Target:
         * لا نخمن.
         */
        const unique_values =
            new Map();


        for (
            const row
            of scoped
        ) {
            const raw_value =
                String(
                    row?.[
                        target_fieldname
                    ]
                    || ""
                ).trim();


            const normalized_value =
                this.normalize(
                    raw_value
                );


            if (
                !normalized_value
            ) {
                continue;
            }


            if (
                !unique_values.has(
                    normalized_value
                )
            ) {
                unique_values.set(
                    normalized_value,
                    raw_value
                );
            }
        }


        if (
            unique_values.size
            !== 1
        ) {
            return "";
        }


        return (
            unique_values
                .values()
                .next()
                .value
            || ""
        );
    }
};