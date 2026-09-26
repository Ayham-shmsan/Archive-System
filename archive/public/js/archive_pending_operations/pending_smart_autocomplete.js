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

        this.limit =
            Number(
                options.limit
                || 10
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
            this.dialog.set_value(
                state.fieldname,
                value
            )
        );

        await this.offer_related_fields(
            state.fieldname,
            value
        );
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

    get_context() {
        const raw =
            this.context_provider()
            || {};

        const result = {};

        for (
            const fieldname
            of [
                "bank",
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