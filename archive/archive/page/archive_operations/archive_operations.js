frappe.pages["archive-operations"].on_page_load = function (wrapper) {
	frappe.archive_operations = new ArchiveOperationsPage(wrapper);
};

class ArchiveOperationsPage {
	
    constructor(wrapper) {
        this.wrapper = wrapper;

        this.customer_rate_manual_value =
            "";

        this.customer_rate_last_currency =
            "";

        this.updating_customer_rate_mode =
            false;

        this.state = {
            status: "all",
            search: "",
            fiscal_year: "",
            fiscal_years: null,
            advanced_filters: {},

            page: 1,
            page_length: "100",

            sort: {
                field: "serial_no",
                direction: "desc",
            },

            selected_operation_name:
                null,
        };

        this.fiscal_context = null;
        this.saudi_customer_rate_bounds = null;
        this.bank_transfer_rate_bounds = null;
        this.sender_account_validation = { enabled: false };
        this._load_request_id = 0;


        this.operations = [];

        this.data_source = null;

        this.pagination = null;

        this.context_version = null;

        this.search_frame = null;
        this.search_timer = null;
        this.filter_controller =
            null;

        this._amount_formatter = new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        this._translation_cache = new Map();
        this._datetime_cache = new Map();
        this._dynamic_search_cache = new Map();
        this._column_defs_cache = null;
        this._first_visible_column_index = 1;
        this._visible_column_count = 26;
        this._virtual_table = null;
        
        this.hidden_columns =
            this.load_hidden_columns();


        this.make_page();

        this.render();

        this.initialize();
    }

    get_operation_year_short(
        operation
    ) {
        const candidates = [
            operation?.fiscal_year,
            operation?.execution_datetime,
            operation?.request_date,
        ];

        for (const raw of candidates) {
            const match = String(raw || "")
                .trim()
                .match(/^((?:19|20)\d{2})\b/);
            if (match) {
                return match[1].slice(-2);
            }
        }

        return "";
    }

    render_operation_year_badge(
        operation
    ) {
        const year_short =
            this.get_operation_year_short(
                operation
            );

        if (!year_short) {
            return "";
        }

        const full_year = String(
            operation?.fiscal_year || ""
        ).trim();
        const title_attr = full_year
            ? ` title="السنة المالية ${this.escape_value(full_year)}"`
            : "";

        return `<span class="archive-operation-year-suffix"${title_attr}><span class="archive-operation-year-sep">/</span><span class="archive-operation-year-num">${this.escape_value(year_short)}</span></span>`;
    }

    render_operation_no(
        operation
    ) {

        const operation_no =
            String(
                operation.operation_no
                || ""
            ).trim();


        // العملية المحضورة التي أُنشئت بدون رقم.
        if (!operation_no) {

            if (
                operation.is_blocked_operation
            ) {
                return `
                    <div
                        class="archive-operation-no-cell"
                    >
                        <span
                            class="archive-operation-no-empty"
                        >
                            بدون رقم
                        </span>
                    </div>
                `;
            }


            return `
                <span
                    class="text-muted"
                >
                    —
                </span>
            `;
        }


        const count =
            Number(
                operation
                    .operation_no_duplicate_count
                || 0
            );


        const index =
            Number(
                operation
                    .operation_no_duplicate_index
                || 0
            );

        const escaped_operation_no =
            this.escape_value(
                operation_no
            );

        const year_suffix =
            this.render_operation_year_badge(
                operation
            );

        const number_group_html = `
            <span class="archive-operation-no-group" dir="ltr">
                <span
                    class="archive-operation-no-value"
                >${escaped_operation_no}</span>${year_suffix}
            </span>
        `;


        // رقم غير مكرر.
        if (count <= 1) {

            return `
                <div
                    class="archive-operation-no-cell"
                >
                    ${number_group_html}
                </div>
            `;
        }


        // رقم مكرر.
        return `
            <div
                class="
                    archive-operation-no-cell
                    is-duplicate
                "
            >
                ${number_group_html}

                <span
                    class="archive-operation-duplicate-badge"
                    title="يوجد ${count} عمليات تحمل نفس رقم العملية"
                >
                    <span class="archive-operation-duplicate-count">${count} عمليات</span>
                    <span
                        class="archive-operation-duplicate-index"
                        dir="ltr"
                        title="ترتيب هذه العملية ضمن العمليات التي تحمل نفس الرقم"
                    >${index}/${count}</span>
                </span>
            </div>
        `;
    }

    async release_pending_operation() {

        const operation =
            this.get_selected_operation();


        if (
            !operation
            ||
            operation.status
                !== "معلقة"
            ||
            !operation.can_release_pending
        ) {
            return;
        }


        const confirmed =
            await new Promise(
                (resolve) => {

                    frappe.confirm(
                        __(
                            "هل تريد نقل العملية من معلقة إلى غير مؤكدة؟"
                        ),

                        () =>
                            resolve(true),

                        () =>
                            resolve(false)
                    );
                }
            );


        if (!confirmed) {
            return;
        }


        try {

            await frappe.call({

                method:
                    "archive.api.operations.release_pending_operation",

                type:
                    "POST",

                args: {
                    operation_name:
                        operation.name,
                },
            });


            frappe.show_alert({
                message:
                    __(
                        "تم نقل العملية إلى غير مؤكدة"
                    ),

                indicator:
                    "green",
            });


            await this.refresh_operation_row(operation.name);


        } catch (error) {

            console.error(
                "Release pending operation failed:",
                error
            );


            frappe.msgprint({
                title:
                    __("تعذر تغيير الحالة"),

                message:
                    error?.message
                    ||
                    __(
                        "حدث خطأ أثناء نقل العملية."
                    ),

                indicator:
                    "red",
            });
        }
    }
    async initialize() {
        const [, fiscal_res] = await Promise.all([
            new Promise((resolve) => {
                frappe.require(
                    [
                        "/assets/archive/js/shared/data_grid/core.js",
                        "/assets/archive/js/shared/data_grid/pagination.js",
                        "/assets/archive/css/shared/data_grid.css",

                        "/assets/archive/js/shared/data_grid/filters.js",
                        "/assets/archive/css/shared/data_grid_filters.css",
                    ],
                    resolve
                );
            }),
            frappe
                .call({
                    method: "archive.services.fiscal_year_permissions.get_my_fiscal_context",
                    type: "GET",
                })
                .catch(() => null),
        ]);

        if (fiscal_res && fiscal_res.message) {
            this.render_fiscal_year_filter(fiscal_res.message);
        }

        this.initialize_data_grid();

        await this.load_operations();
    }
    get_column_visibility_storage_key() {
        const user = String(
            frappe.session?.user
            || "Guest"
        ).trim();

        return (
            "archive.operations.hidden_columns.v1:"
            + user
        );
    }


    load_hidden_columns() {
        try {
            const raw =
                window.localStorage.getItem(
                    this
                        .get_column_visibility_storage_key()
                );

            if (!raw) {
                return new Set();
            }

            const parsed =
                JSON.parse(
                    raw
                );

            if (!Array.isArray(parsed)) {
                return new Set();
            }

            return new Set(
                parsed
                    .map(
                        (field) =>
                            String(
                                field || ""
                            ).trim()
                    )
                    .filter(Boolean)
            );

        } catch (error) {
            console.warn(
                "Could not load Archive Operations column preferences:",
                error
            );

            return new Set();
        }
    }


    save_hidden_columns() {
        try {
            window.localStorage.setItem(
                this
                    .get_column_visibility_storage_key(),

                JSON.stringify(
                    Array.from(
                        this.hidden_columns
                        || []
                    )
                )
            );

        } catch (error) {
            console.warn(
                "Could not save Archive Operations column preferences:",
                error
            );
        }
    }


    get_operation_column_definitions() {
        const columns = [];

        $(this.wrapper)
            .find(
                ".archive-operations-table thead th[data-sort-field]"
            )
            .each(
                (
                    index,
                    element
                ) => {

                    const $header =
                        $(element);

                    const field =
                        String(
                            $header.attr(
                                "data-sort-field"
                            )
                            || ""
                        ).trim();

                    if (!field) {
                        return;
                    }

                    const $label_source =
                        $header.clone();

                    $label_source
                        .find(
                            ".generic-sort-indicator"
                        )
                        .remove();

                    const label =
                        $label_source
                            .text()
                            .replace(
                                /\s+/g,
                                " "
                            )
                            .trim()
                        || field;

                    columns.push({
                        field,
                        label,
                        index:
                            index + 1,
                    });
                }
            );

        return columns;
    }


    update_column_visibility_button() {
        const columns =
            this
                .get_operation_column_definitions();

        const valid_fields =
            new Set(
                columns.map(
                    (column) =>
                        column.field
                )
            );

        const hidden_count =
            Array.from(
                this.hidden_columns
                || []
            )
                .filter(
                    (field) =>
                        valid_fields.has(
                            field
                        )
                )
                .length;

        const $button =
            $(this.wrapper)
                .find(
                    ".archive-columns-button"
                );

        $button
            .toggleClass(
                "has-hidden-columns",
                hidden_count > 0
            )
            .attr(
                "title",
                hidden_count
                    ? `${hidden_count} أعمدة مخفية`
                    : "اختيار الأعمدة الظاهرة"
            );

        const $count =
            $button.find(
                ".archive-hidden-columns-count"
            );

        if (hidden_count) {
            $count
                .text(
                    hidden_count
                )
                .show();

        } else {
            $count
                .text("")
                .hide();
        }
    }


    update_column_visibility_footer(
        visible_count
    ) {
        const $footer =
            $(this.wrapper)
                .find(
                    ".archive-operation-total-row"
                );

        const $label_cell =
            $footer
                .find("td")
                .first();

        const $total_cell =
            $footer.find(
                ".archive-visible-amount-total"
            );

        if (!visible_count) {
            $footer.hide();
            return;
        }

        $footer.show();

        if (
            visible_count === 1
        ) {
            $label_cell.hide();

            $total_cell
                .show()
                .attr(
                    "colspan",
                    "1"
                );

            return;
        }

        const label_span =
            Math.min(
                3,
                visible_count - 1
            );

        const total_span =
            visible_count
            - label_span;

        $label_cell
            .show()
            .attr(
                "colspan",
                String(
                    label_span
                )
            );

        $total_cell
            .show()
            .attr(
                "colspan",
                String(
                    total_span
                )
            );

        $(this.wrapper)
            .find(".archive-operation-fill td")
            .attr(
                "colspan",
                String(visible_count)
            );
    }


    apply_column_visibility() {
        const $table =
            $(this.wrapper)
                .find(
                    ".archive-operations-table"
                );

        if (!$table.length) {
            return;
        }

        const columns =
            this._column_defs_cache && this._column_defs_cache.length
                ? this._column_defs_cache
                : (this._column_defs_cache = this.get_operation_column_definitions());

        if (!columns.length) {
            return;
        }

        const valid_fields =
            new Set(
                columns.map(
                    (column) =>
                        column.field
                )
            );

        let hidden =
            new Set(
                Array.from(
                    this.hidden_columns
                    || []
                )
                    .filter(
                        (field) =>
                            valid_fields.has(
                                field
                            )
                    )
            );

        if (
            hidden.size
            >= columns.length
        ) {
            hidden.delete(
                columns[0].field
            );
        }

        const preferences_changed =
            hidden.size
            !== (
                this.hidden_columns
                || new Set()
            ).size;

        this.hidden_columns =
            hidden;

        if (
            preferences_changed
        ) {
            this.save_hidden_columns();
        }

        let visible_count = 0;
        let first_visible_index = null;
        const hidden_rules = [];

        for (const column of columns) {
            const is_hidden = hidden.has(column.field);

            if (!is_hidden) {
                visible_count += 1;
                if (first_visible_index === null) {
                    first_visible_index = column.index;
                }
            } else {
                const idx = column.index;
                hidden_rules.push(
                    `.archive-operations-page .archive-operations-table colgroup col:nth-child(${idx}),`
                    + `.archive-operations-page .archive-operations-table thead th:nth-child(${idx}),`
                    + `.archive-operations-page .archive-operations-table tbody.archive-operation-rows tr.archive-operation-row > td:nth-child(${idx}){display:none!important;}`
                );
            }
        }

        this._visible_column_count = visible_count || columns.length;
        this._first_visible_column_index = first_visible_index;

        let style_el = this.wrapper.querySelector('style[data-role="archive-ops-column-styles"]');
        if (!style_el) {
            style_el = document.createElement("style");
            style_el.setAttribute("data-role", "archive-ops-column-styles");
            this.wrapper.appendChild(style_el);
        }
        style_el.textContent = hidden_rules.join("\n");

        this.apply_first_visible_column_class();

        this.update_column_visibility_footer(visible_count);
        this.update_column_visibility_button();
    }

    apply_first_visible_column_class() {
        const tbody = this.wrapper.querySelector("tbody.archive-operation-rows");
        if (!tbody) {
            return;
        }
        const prev_cells = tbody.querySelectorAll("td.is-first-visible-column");
        for (let i = 0; i < prev_cells.length; i++) {
            prev_cells[i].classList.remove("is-first-visible-column");
        }
        const idx = this._first_visible_column_index;
        if (!idx) {
            return;
        }
        const rows = tbody.children;
        for (let i = 0; i < rows.length; i++) {
            const tr = rows[i];
            if (!tr.classList.contains("archive-operation-row")) {
                continue;
            }
            const cell = tr.children[idx - 1];
            if (cell) {
                cell.classList.add("is-first-visible-column");
            }
        }
    }


    render_columns_menu_html() {
        const columns =
            this
                .get_operation_column_definitions();

        return `
            <div class="ac-columns-menu-header">إظهار / إخفاء الأعمدة</div>
            <div class="ac-columns-menu-list">
                ${columns
                    .map((col) => {
                        const is_visible = !this.hidden_columns.has(col.field);
                        return `
                            <label class="ac-column-toggle-item">
                                <input
                                    type="checkbox"
                                    data-column-toggle="${frappe.utils.escape_html(col.field)}"
                                    ${is_visible ? "checked" : ""}
                                />
                                <span>${frappe.utils.escape_html(col.label)}</span>
                            </label>
                        `;
                    })
                    .join("")}
            </div>
        `;
    }

    toggle_columns_menu() {
        const $menu =
            $(this.wrapper).find(
                '[data-role="columns-menu"]'
            );
        if (!$menu.length) {
            return;
        }
        const was_hidden =
            Boolean($menu.prop("hidden"));
        if (was_hidden) {
            $menu.html(
                this.render_columns_menu_html()
            );
            $menu.prop("hidden", false);
        } else {
            $menu.prop("hidden", true);
        }
    }

    initialize_filters() {

        this.filter_controller =
            new custom.data_grid
                .FilterController({

                    button:
                        $(this.wrapper)
                            .find(
                                ".archive-filter-button"
                            ),

                    drawer_container:
                        $(this.wrapper)
                            .find(
                                '[data-role="filters-drawer"]'
                            ),

                    summary_container:
                        $(this.wrapper)
                            .find(
                                ".archive-active-filters"
                            ),

                    data_source:
                        this.data_source,

                    title:
                        __("فلترة العمليات"),
                    
                    layout: [

                            {
                                title:
                                    "بيانات العملية",

                                subtitle:
                                    "معلومات العملية الأساسية",

                                fields: [
                                    "operation_no",
                                    "customer",
                                    "amount",

                                    "execution_datetime",
                                    "from_account",
                                    "reference_no",
                                ],
                            },


                            {
                                title:
                                    "بيانات المستفيد",

                                subtitle:
                                    "بيانات المستفيد والحساب والبنك",

                                fields: [
                                    "beneficiary_name",
                                    "beneficiary_account",
                                    "swift_code",

                                    "country",
                                ],
                            },


                            {
                                title:
                                    "بيانات التحويل والمرسل",

                                subtitle:
                                    "بيانات المرسل والتحويل",

                                fields: [
                                    "sender_name",
                                    "transferring_bank",
                                ],
                            },
                        ],

                    schema: [

                        {
                            field:
                                "execution_datetime",

                            label:
                                "تاريخ تنفيذ العملية",

                            type:
                                "date_range",
                        },


                        {
                            field:
                                "customer",

                            label:
                                "اسم العميل",

                            type:
                                "multi_select",
                        },


                        {
                            field:
                                "amount",

                            label:
                                "المبلغ",

                            type:
                                "number_range",
                        },


                        {
                            field:
                                "operation_no",

                            label:
                                "رقم العملية",

                            type:
                                "text",
                        },


                        {
                            field:
                                "beneficiary_name",

                            label:
                                "اسم المستفيد",

                            type:
                                "text",
                        },


                        {
                            field:
                                "beneficiary_account",

                            label:
                                "رقم حساب المستفيد",

                            type:
                                "text",
                        },


                        {
                            field:
                                "swift_code",

                            label:
                                "رمز SWIFT",

                            type:
                                "text",
                        },


                        {
                            field:
                                "country",

                            label:
                                "الدولة",

                            type:
                                "multi_select",

                            get_label:
                                (value) =>
                                    __(value),
                        },


                        {
                            field:
                                "sender_name",

                            label:
                                "اسم المرسل",

                            type:
                                "text",
                        },


                        {
                            field:
                                "transferring_bank",

                            label:
                                "البنك المحول",

                            type:
                                "multi_select",
                        },


                        {
                            field:
                                "from_account",

                            label:
                                "عن طريق",

                            type:
                                "multi_select",
                        },


                        {
                            field:
                                "reference_no",

                            label:
                                "رقم المرجع",

                            type:
                                "text",
                        },
                    ],


                    on_apply:
                        async ({
                            filters
                        }) => {

                            this.state
                                .advanced_filters =
                                    filters;


                            this.state.page =
                                1;


                            this.apply_local_query();


                            this.scroll_grid_to_top();
                        },
                });


        this.filter_controller
            .mount();
    }

    initialize_data_grid() {

        this.data_source =
            new custom.data_grid
                .LocalDataSource({

                    id_field:
                        "name",

                    search_accessor:
                        (operation) => {
                            const base = operation.search_text || "";
                            const country = String(operation.country || "").trim();
                            const status = String(operation.status || "").trim();
                            const creator = String(operation.created_by_name || "").trim();
                            const owner = String(operation.owner || "").trim();
                            const dyn_key = `${country}|${status}|${creator}|${owner}`;
                            let dyn = this._dynamic_search_cache.get(dyn_key);
                            if (dyn === undefined) {
                                dyn = custom.data_grid.utils.normalize_search_text(
                                    [
                                        country,
                                        country ? this.translate_raw(country) : "",
                                        status,
                                        status ? this.translate_raw(status) : "",
                                        creator,
                                        owner,
                                    ].join(" ")
                                );
                                this._dynamic_search_cache.set(dyn_key, dyn);
                            }
                            if (base && dyn) {
                                return `${base} ${dyn}`;
                            }
                            return base || dyn;
                        },

                    search_tokenizer:
                        custom.data_grid
                            .utils
                            .get_search_tokens,

                    sorters: {

                        serial_no: {
                            type: "number",
                            get: (record) =>
                                Number(
                                    record?.fiscal_sequence
                                    || record?.serial_no
                                    || 0
                                ),
                        },

                        operation_no: {
                            type: "text",
                        },

                        customer: {
                            type: "text",
                            get: (record) =>
                                record?.customer_name
                                || record?.customer
                                || "",
                        },

                        amount: {
                            type: "number",
                        },

                        currency: {
                            type: "text",
                        },

                        customer_rate: {
                            type: "number",
                            get: (record) => {
                                const raw =
                                    record?.customer_rate;
                                if (
                                    raw === null
                                    || raw === undefined
                                    || String(raw).trim() === ""
                                ) {
                                    return null;
                                }
                                const num = Number(raw);
                                return Number.isFinite(num)
                                    ? num
                                    : -1;
                            },
                        },

                        replacement_note: {
                            type: "text",
                        },

                        beneficiary_name: {
                            type: "text",
                        },

                        beneficiary_account: {
                            type: "text",
                        },

                        beneficiary_bank: {
                            type: "text",
                        },

                        swift_code: {
                            type: "text",
                        },

                        country: {
                            type: "text",
                            get: (record) =>
                                record?.country
                                    ? __(
                                          String(
                                              record.country
                                          ).trim()
                                      )
                                    : "",
                        },

                        sender_name: {
                            type: "text",
                        },

                        sender_account: {
                            type: "text",
                        },

                        execution_datetime: {
                            type: "datetime",
                            get: (record) =>
                                record?.execution_datetime
                                    ? String(
                                          record.execution_datetime
                                      )
                                          .trim()
                                          .replace(" ", "T")
                                    : null,
                        },

                        transferring_bank: {
                            type: "text",
                        },

                        request_date: {
                            type: "date",
                        },

                        creation: {
                            type: "datetime",
                            get: (record) =>
                                record?.creation
                                    ? String(
                                          record.creation
                                      )
                                          .trim()
                                          .replace(" ", "T")
                                    : null,
                        },

                        from_account: {
                            type: "text",
                            get: (record) =>
                                record?.from_account_name
                                || record?.from_account
                                || "",
                        },

                        reference_no: {
                            type: "text",
                        },

                        bank_transfer_rate: {
                            type: "number",
                        },

                        notes: {
                            type: "text",
                        },

                        has_final_swift: {
                            type: "boolean",
                        },

                        status: {
                            type: "text",
                        },
                        status_effective_datetime: {
                            type: "number",
                            default_direction: "asc",
                            nulls_last: true,
                            get: (record) => {
                                const raw = record?.status_effective_datetime;
                                if (raw === null || raw === undefined) {
                                    return null;
                                }
                                const cleaned = String(raw).trim();
                                if (!cleaned) {
                                    return null;
                                }
                                const ts = Date.parse(
                                    cleaned.includes(" ")
                                        ? cleaned.replace(" ", "T")
                                        : cleaned
                                );
                                return Number.isFinite(ts) ? ts : null;
                            },
                        },
                        created_by_name: {
                            type: "text",
                        },
                    },
                });


        this.pagination =
            new custom.data_grid
                .PaginationBar({

                    container:
                        $(this.wrapper)
                            .find(
                                ".archive-pagination-host"
                            ),

                    page_length:
                        "100",

                    storage_key:
                        "archive.operations.page_length",

                    on_change:
                        async ({
                            page,
                            page_length,
                        }) => {

                            this.state.page =
                                page;

                            this.state.page_length =
                                page_length;


                            this.apply_local_query({
                                skip_counts: true,
                            });


                            this.scroll_grid_to_top();
                        },
                });


        this.pagination.mount();

        if (this._virtual_table) {
            this._virtual_table.destroy();
        }
        const scroll_el = this.wrapper.querySelector(".archive-table-wrapper");
        const tbody_el = this.wrapper.querySelector("tbody.archive-operation-rows");
        if (scroll_el && tbody_el && custom.data_grid.VirtualTableRenderer) {
            this._virtual_table = new custom.data_grid.VirtualTableRenderer({
                scroll_el,
                tbody_el,
                row_selector: "tr.archive-operation-row",
                row_height: 58,
                overscan: 14,
                threshold: 150,
                get_col_count: () => this._visible_column_count || 26,
                render_row: (operation) => this.operation_row(operation),
                on_rendered: ({ virtualized }) => {
                    this.apply_first_visible_column_class();
                    if (virtualized) {
                        const fill = this.wrapper.querySelector("tbody.archive-operation-fill");
                        if (fill) {
                            fill.style.display = "none";
                        }
                    } else {
                        this.update_table_filler_height();
                    }
                },
            });
        }


        const pagination_state =
            this.pagination
                .get_state();


        this.state.page_length =
            pagination_state.page_length;

        

        this.initialize_filters();
        this.update_sort_indicators();
    }
    // open_status_dialog(
    //     operation_name,
    //     current_status
    // ) {

    //     if (
    //         current_status
    //         === "معلقة"
    //     ) {
    //         return;
    //     }

    //     const statuses = [
    //         "غير مؤكدة",
    //         "مؤكدة",
    //         "محضورة",
    //         "مرتجعة",
    //         "معلقة",
    //     ];

    //     const available_statuses =
    //         statuses.filter(
    //             (status) =>
    //                 status !== current_status
    //         );
    // open_status_dialog(
    //     operation
    //     ) {
    //     if (
    //         !operation
    //         ||
    //         operation.status === "معلقة"
    //         ||
    //         !operation.can_change_status
    //     ) {
    //         return;
    //     }


    //     const operation_name =
    //         operation.name;

    //     const current_status =
    //         operation.status;


    //     const available_statuses =
    //         Array.isArray(
    //             operation.allowed_status_transitions
    //         )
    //             ? operation.allowed_status_transitions
    //             : [];


    //     if (!available_statuses.length) {
    //         frappe.show_alert({
    //             message:
    //                 __(
    //                     "لا توجد حالات متاحة لهذه العملية"
    //                 ),

    //             indicator:
    //                 "orange",
    //         });

    //         return;
    //     }

    //     const dialog =
    //         new frappe.ui.Dialog({
    //             title:
    //                 `إجراءات العملية ${operation_name}`,

    //             fields: [
    //                 {
    //                     fieldname:
    //                         "current_status",

    //                     label:
    //                         "الحالة الحالية",

    //                     fieldtype:
    //                         "Data",

    //                     read_only:
    //                         1,

    //                     default:
    //                         current_status,
    //                 },

    //                 {
    //                     fieldname:
    //                         "status",

    //                     label:
    //                         "الحالة الجديدة",

    //                     fieldtype:
    //                         "Select",

    //                     options:
    //                         available_statuses.join(
    //                             "\n"
    //                         ),

    //                     reqd:
    //                         1,
    //                 },

    //                 {
    //                     fieldname:
    //                         "status_effective_datetime",

    //                     label:
    //                         "تاريخ الحالة",

    //                     fieldtype:
    //                         "Date",

    //                     reqd:
    //                         1,

    //                     description:
    //                         "التاريخ الفعلي لتغيير حالة العملية.",
    //                 },

    //                 {
    //                     fieldname:
    //                         "remarks",

    //                     label:
    //                         "ملاحظات الإجراء",

    //                     fieldtype:
    //                         "Small Text",
    //                 },
    //             ],

    //             primary_action_label:
    //                 __("تنفيذ الإجراء"),

    //             primary_action:
    //                 async (values) => {
    //                     await this.change_operation_status(
    //                         operation_name,
    //                         values.status,
    //                         values.status_effective_datetime,
    //                         values.remarks,
    //                         dialog
    //                     );
    //                 },
    //         });

    //     dialog.show();
    // }
    open_status_dialog(
            operation
        ) {
            if (
                !operation
                ||
                operation.status === "معلقة"
                ||
                !operation.can_change_status
            ) {
                return;
            }


            const operation_name =
                operation.name;

            const current_status =
                operation.status;


            // ========================================================
            // Execution date
            //
            // تاريخ الحالة لا يجوز أن يسبق تاريخ تنفيذ العملية.
            // execution_datetime يأتي بصيغة:
            // YYYY-MM-DD HH:mm:ss
            // ========================================================

            const execution_date =
                String(
                    operation.execution_datetime
                    || ""
                )
                .trim()
                .slice(
                    0,
                    10
                );


            if (!execution_date) {

                frappe.msgprint({
                    title:
                        __("تعذر تنفيذ الإجراء"),

                    message:
                        __(
                            "لا يوجد تاريخ تنفيذ للعملية، لذلك لا يمكن تغيير حالتها."
                        ),

                    indicator:
                        "red",
                });

                return;
            }


            const available_statuses =
                Array.isArray(
                    operation.allowed_status_transitions
                )
                    ? operation.allowed_status_transitions
                    : [];


            if (!available_statuses.length) {

                frappe.show_alert({
                    message:
                        __(
                            "لا توجد حالات متاحة لهذه العملية"
                        ),

                    indicator:
                        "orange",
                });

                return;
            }


            const dialog =
                new frappe.ui.Dialog({
                    title:
                        `إجراءات العملية ${operation_name}`,

                    fields: [
                        {
                            fieldname:
                                "current_status",

                            label:
                                "الحالة الحالية",

                            fieldtype:
                                "Data",

                            read_only:
                                1,

                            default:
                                current_status,
                        },

                        {
                            fieldname:
                                "status",

                            label:
                                "الحالة الجديدة",

                            fieldtype:
                                "Select",

                            options:
                                available_statuses.join(
                                    "\n"
                                ),

                            reqd:
                                1,
                        },

                        {
                            fieldname:
                                "status_effective_datetime",

                            label:
                                "تاريخ الحالة",

                            fieldtype:
                                "Date",

                            reqd:
                                1,

                            description:
                                `يجب أن يكون تاريخ الحالة أكبر من أو يساوي تاريخ تنفيذ العملية: ${execution_date}`,
                        },

                        {
                            fieldname:
                                "remarks",

                            label:
                                "ملاحظات الإجراء",

                            fieldtype:
                                "Small Text",
                        },
                    ],

                    primary_action_label:
                        __("تنفيذ الإجراء"),

                    primary_action:
                        async (values) => {

                            const status_date =
                                String(
                                    values
                                        .status_effective_datetime
                                    || ""
                                ).trim();


                            // ====================================================
                            // Mandatory lower bound
                            // ====================================================

                            if (
                                status_date
                                &&
                                status_date
                                <
                                execution_date
                            ) {

                                frappe.msgprint({
                                    title:
                                        __("تاريخ الحالة غير صحيح"),

                                    message:
                                        __(
                                            `تاريخ الحالة يجب أن يكون أكبر من أو يساوي تاريخ تنفيذ العملية (${execution_date}).`
                                        ),

                                    indicator:
                                        "red",
                                });

                                return;
                            }


                            await this.change_operation_status(
                                operation_name,
                                values.status,
                                status_date,
                                values.remarks,
                                dialog
                            );
                        },
                });


            dialog.show();


            // ========================================================
            // Browser-level minimum date
            // ========================================================

            const status_date_field =
                dialog.get_field(
                    "status_effective_datetime"
                );


            if (
                status_date_field
                &&
                status_date_field.$input
            ) {

                status_date_field
                    .$input
                    .attr(
                        "min",
                        execution_date
                    );
            }
        }

    open_final_swift_dialog() {
        const operation =
            this.get_selected_operation();


        if (!operation) {
            return;
        }


        
        if (
            this.state.status !== "final_swift"
	        ||
            !operation.final_swift_required
            ||
            !operation.can_attach_final_swift
            ||
            Number(
                operation.final_swift_count || 0
            )
            >=
            Number(
                operation.final_swift_limit || 10
            )
        ) {
            return;
        }


        frappe.require(
            [
                "/assets/archive/js/archive_operations/final_swift_dialog.js",
                "/assets/archive/css/archive_operations/operation_dialog.css",
            ],
            () => {

               

                const dialog =
                    new archive.ui.FinalSwiftDialog(
                        operation.name,
                        {
                            current_count:
                                Number(
                                    operation.final_swift_count
                                    || 0
                                ),

                            max_files:
                                Number(
                                    operation.final_swift_limit
                                    || 10
                                ),

                            on_saved:
                                async () => {
                                    await this.refresh_operation_row(
                                        operation.name
                                    );
                                },
                        }
                    );


                dialog.show();
            }
        );
    }

    open_incomplete_invoice_dialog() {
        const operation =
            this.get_selected_operation();

        if (
            !operation
            ||
            !operation.is_incomplete_invoice
            ||
            !operation.can_attach_incomplete_invoice
        ) {
            return;
        }

        frappe.require(
            [
                "/assets/archive/js/archive_operations/final_swift_dialog.js",
                "/assets/archive/css/archive_operations/operation_dialog.css",
            ],
            () => {
                const dialog =
                    new archive.ui.FinalSwiftDialog(
                        operation.name,
                        {
                            mode: "incomplete_invoice",
                            on_saved:
                                async () => {
                                    await this.refresh_operation_row(
                                        operation.name
                                    );
                                },
                        }
                    );

                dialog.show();
            }
        );
    }

    async change_operation_status(
        operation_name,
        status,
        status_effective_datetime,
        remarks,
        dialog
    ) {
        if (
            !status ||
            !status_effective_datetime
        ) {
            return;
        }

        const button =
            dialog.get_primary_btn();

        button.prop(
            "disabled",
            true
        );

        try {
            await frappe.call({
                method:
                    "archive.api.operations.change_operation_status",

                type:
                    "POST",

                args: {
                    operation_name:
                        operation_name,

                    status:
                        status,

                    status_effective_datetime:
                        status_effective_datetime,

                    remarks:
                        remarks || "",
                },
            });

            dialog.hide();

            frappe.show_alert({
                message:
                    `تم تغيير حالة ${operation_name} إلى ${status}`,
                indicator:
                    "green",
            });

            await this.refresh_operation_row(operation_name);

        } catch (error) {
            console.error(
                "Operation status change failed:",
                error
            );

            frappe.msgprint({
                title:
                    __("تعذر تغيير الحالة"),

                message:
                    error?.message ||
                    __(
                        "حدث خطأ أثناء تغيير حالة العملية."
                    ),

                indicator:
                    "red",
            });

        } finally {
            button.prop(
                "disabled",
                false
            );
        }
    }


	make_page() {
		this.page = frappe.ui.make_app_page({
			parent: this.wrapper,
			title: __("Archive Operations"),
			single_column: true,
		});

		$(this.wrapper).addClass("archive-operations-page");
	}

	render() {
		$(this.page.main).html(`
			<div class="archive-operations-shell" dir="rtl">

				<!-- Header -->
				<div class="archive-operations-header">
					<div class="archive-header-text">
						<span class="archive-operations-brand-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
								<path d="M17 3l4 4-4 4"/>
								<path d="M3 7h18"/>
								<path d="M7 21l-4-4 4-4"/>
								<path d="M21 17H3"/>
							</svg>
						</span>
						<div class="archive-operations-title-col">
							<h1>العمليات</h1>
							<p>إدارة وأرشفة العمليات البنكية</p>
						</div>
					</div>

					<div class="archive-header-fy-actions" style="display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;"><div class="archive-fiscal-year-filter-wrap" style="position: relative; display: inline-flex; align-items: center; gap: 6px;">
                        <label class="archive-fiscal-year-label" style="margin: 0; font-size: 12px; font-weight: 600; color: #475569; white-space: nowrap;">السنة المالية:</label>
                        <div class="archive-fy-multiselect" style="position: relative; display: inline-block;">
                            <button type="button" class="form-control archive-fy-multiselect-btn" style="height: 36px; min-width: 135px; border-radius: 8px; font-size: 13px; font-weight: 600; padding: 0 10px; display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff; cursor: pointer; text-align: right;">
                                <span class="archive-fy-multiselect-label">—</span>
                                <span style="font-size: 10px; opacity: 0.7;">▼</span>
                            </button>
                            <div class="archive-fy-multiselect-menu" style="display: none; position: absolute; top: calc(100% + 4px); inset-inline-start: 0; z-index: 1050; min-width: 195px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12); padding: 6px; direction: rtl; text-align: right;"></div>
                        </div>
                    </div><button type="button"
						class="btn btn-primary archive-create-operation">
						إنشاء عملية جديدة
					</button></div>
				</div>


				<!-- Summary -->
				<div class="archive-summary-grid">

					${this.summary_card(
						"all",
						"كل العمليات",
						"0"
					)}

                    ${this.summary_card(
                        "pending",
                        "معلقة",
                        "0"
                    )}

                    ${this.summary_card(
                        "incomplete_invoice",
                        "الفواتير غير المكتملة",
                        "0"
                    )}

					${this.summary_card(
						"unconfirmed",
						"غير مؤكدة",
						"0"
					)}

					${this.summary_card(
						"confirmed",
						"مؤكدة",
						"0"
					)}

                    ${this.summary_card(
                        "final_swift",
                        "السويفت النهائي",
                        "0"
                    )}

					${this.summary_card(
						"returned",
						"مرتجعة",
						"0"
					)}

					${this.summary_card(
						"held",
						"محضورة",
						"0"
					)}

				</div>


				<!-- Toolbar -->
				<div class="archive-operations-toolbar">

					<div class="archive-search-filter-group">

                    <div class="archive-search-box">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>

                        <input
                            type="text"
                            class="archive-operation-search"
                            placeholder="بحث في العمليات..."
                        >
                    </div>

                    <button
                        type="button"
                        class="btn btn-default ac-tb-btn archive-filter-button"
                    >
                        <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></span>
                        <span class="ac-tb-label">الفلاتر</span>
                    </button>

                    <div class="archive-cards-dropdown-wrap">
                        <button
                            type="button"
                            class="btn btn-default ac-tb-btn archive-columns-button"
                            data-action="toggle-columns-menu"
                            title="اختيار الأعمدة الظاهرة"
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg></span>
                            <span class="ac-tb-label">الأعمدة</span>
                            <span
                                class="archive-hidden-columns-count"
                                style="display: none;"
                            ></span>
                        </button>
                        <div
                            class="archive-cards-popover-menu is-columns-menu"
                            data-role="columns-menu"
                            hidden
                        ></div>
                    </div>

                </div>

					<div class="archive-toolbar-actions">

                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            ac-tb-btn
                            archive-release-pending-button
                        "
                        style="display: none;"
                    >
                        <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3h4v4"/><path d="M21 3l-7 7"/><path d="M7 21H3v-4"/><path d="M3 21l7-7"/></svg></span>
                        <span class="ac-tb-label">نقل إلى غير مؤكدة</span>
                    </button>
                    <button
                    type="button"
                    class="btn btn-default ac-tb-btn archive-selected-view"
                    disabled
                    >
                        <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.42 7.51 7.36 4.5 12 4.5s8.58 3.01 9.94 7.15a1 1 0 0 1 0 .7C20.58 16.49 16.64 19.5 12 19.5s-8.58-3.01-9.94-7.15Z"/><circle cx="12" cy="12" r="3"/></svg></span>
                        <span class="ac-tb-label">عرض</span>
                    </button>

                    <button
                        type="button"
                        class="btn btn-default ac-tb-btn archive-timeline-button"
                        style="display: none;"
                    >
                        <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/></svg></span>
                        <span class="ac-tb-label">سجل مستخدم العملية</span>
                    </button>
                    
                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            ac-tb-btn
                            archive-final-swift-button
                        "
                        style="display: none;"
                    >
                        <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></span>
                        <span class="ac-tb-label">إرفاق الملف النهائي</span>
                    </button>

                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            ac-tb-btn
                            archive-incomplete-invoice-button
                        "
                        style="display: none;"
                    >
                        <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg></span>
                        <span class="ac-tb-label">إرفاق الفاتورة الجديدة</span>
                    </button>

                        <span class="ac-tb-divider" aria-hidden="true"></span>

                        <button
                            type="button"
                            class="btn btn-default ac-tb-btn ac-tb-btn--primary archive-selected-actions"
                            disabled
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="7" y2="6"/><line x1="11" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="13" y2="12"/><line x1="17" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2"/></svg></span>
                            <span class="ac-tb-label">الإجراءات</span>
                        </button>

                        <button
                            type="button"
                            class="btn btn-default ac-tb-btn ac-tb-btn--refresh archive-refresh-button"
                            title="تحديث"
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-15.5-6.36L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.36L21 16"/><path d="M21 21v-5h-5"/></svg></span>
                            <span class="ac-tb-label">تحديث</span>
                        </button>

                    </div>

				</div>

                <!-- Collapsible Advanced Filters Drawer -->
                <div
                    class="archive-cards-filters-drawer archive-operations-filters-drawer"
                    data-role="filters-drawer"
                    hidden
                ></div>

                <div
                    class="archive-active-filters"
                ></div>


				<!-- Operations -->
				<div class="archive-operations-card">
					<div
                        class="
                            archive-table-wrapper
                            generic-data-grid-scroll
                        "
                    >

						<table class="archive-operations-table">

                            <colgroup>
                                <col class="col-serial">
                                <col class="col-operation-no">
                                <col class="col-customer">
                                <col class="col-amount">
                                <col class="col-currency">
                                <col class="col-customer-rate">
                                <col class="col-replacement-note">

                                <col class="col-beneficiary-name">
                                <col class="col-beneficiary-account">
                                <col class="col-beneficiary-bank">
                                <col class="col-swift">
                                <col class="col-country">

                                <col class="col-sender-name">
                                <col class="col-sender-account">
                                <col class="col-execution">
                                <col class="col-transferring-bank">
                                <col class="col-request-date">
                                <col class="col-from-account">
                                <col class="col-reference">
                                <col class="col-bank-rate">
                                <col class="col-notes">

                                <col class="col-final-swift">
                                <col class="col-status-effective-date">
                                <col class="col-creation-time">
                                <col class="col-created-by">
                                <col class="col-status">
                                
                            </colgroup>

							<thead>
                                <tr>
                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="serial_no"
                                    >
                                        الرقم
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="operation_no"
                                    >
                                        رقم العملية
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="customer"
                                    >
                                        اسم العميل
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="amount"
                                    >
                                        المبلغ
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="currency"
                                    >
                                        العملة
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="customer_rate"
                                    >
                                        سعر العميل
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="replacement_note"
                                    >
                                        ملاحظة البدل
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="beneficiary_name"
                                    >
                                        اسم المستفيد
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="beneficiary_account"
                                    >
                                        رقم حساب المستفيد
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="beneficiary_bank"
                                    >
                                        اسم بنك المستفيد
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="swift_code"
                                    >
                                        رمز SWIFT
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="country"
                                    >
                                        الجهة (الدولة)
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="sender_name"
                                    >
                                        اسم المرسل
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="sender_account"
                                    >
                                        رقم حساب المرسل
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="execution_datetime"
                                    >
                                        تاريخ تنفيذ العملية
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="transferring_bank"
                                    >
                                        اسم البنك المحول
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="request_date"
                                    >
                                        تاريخ الطلب
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="from_account"
                                    >
                                        عن طريق
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="reference_no"
                                    >
                                        رقم المرجع
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="bank_transfer_rate"
                                    >
                                        سعر البنك المحول
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="notes"
                                    >
                                        ملاحظات التحويل
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="has_final_swift"
                                    >
                                        السويفت النهائي
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="status_effective_datetime"
                                    >
                                        تاريخ الحالة
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="creation"
                                    >
                                        وقت الإدخال
                                        <span class="generic-sort-indicator"></span>
                                    </th>

                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="created_by_name"
                                    >
                                        اسم المستخدم
                                        <span class="generic-sort-indicator"></span>
                                    </th>
                                    <th
                                        class="generic-sortable-column"
                                        data-sort-field="status"
                                    >
                                        الحالة
                                        <span class="generic-sort-indicator"></span>
                                    </th>


                                </tr>
                            </thead>

							<tbody class="archive-operation-rows">
							</tbody>

                            <tbody class="archive-operation-fill" aria-hidden="true">
                                <tr><td colspan="26"></td></tr>
                            </tbody>

                            <tfoot class="archive-operation-total-footer">
                                <tr class="archive-operation-total-row">

                                    <td colspan="3">
                                        <strong>
                                            إجمالي المبلغ للنتائج المعروضة
                                        </strong>
                                    </td>

                                    <td
                                        colspan="23"
                                        class="archive-visible-amount-total"
                                    >
                                        —
                                    </td>

                                </tr>
                            </tfoot>

						</table>

						<div class="archive-empty-state">

							<div class="archive-empty-icon">
								<svg
									width="38"
									height="38"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
								>
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
									<polyline points="14 2 14 8 20 8"></polyline>
									<line x1="16" y1="13" x2="8" y2="13"></line>
									<line x1="16" y1="17" x2="8" y2="17"></line>
								</svg>
							</div>

							<h3>
								لا توجد عمليات حتى الآن
							</h3>

							<p>
								ابدأ بإنشاء أول عملية في النظام
							</p>

							<button
								type="button"
								class="btn btn-primary archive-empty-create">
								إنشاء عملية جديدة
							</button>

						</div>

					</div>
                    <div
                        class="archive-pagination-host"
                    ></div>

				</div>

			</div>
		`);

		this.bind_events();
        this.apply_column_visibility();
        this.update_sort_indicators();

        if (this.table_resize_observer) {
            this.table_resize_observer.disconnect();
        }
        const table_wrapper_el = $(this.wrapper)
            .find(".archive-table-wrapper")
            .get(0);
        if (table_wrapper_el && typeof ResizeObserver !== "undefined") {
            this.table_resize_observer = new ResizeObserver(() => {
                this.update_table_filler_height();
            });
            this.table_resize_observer.observe(table_wrapper_el);
        }
	}

    update_table_filler_height() {
        const $wrapper = $(this.wrapper);
        const wrapper_el = $wrapper.find(".archive-table-wrapper").get(0);
        const $table = $wrapper.find(".archive-operations-table");
        const $fill_tbody = $table.find("tbody.archive-operation-fill");
        const $fill_cell = $fill_tbody.find("td");

        if (!wrapper_el || !$table.length || !$fill_cell.length || !$table.is(":visible")) {
            return;
        }

        const wrapper_height = wrapper_el.clientHeight || 0;
        const thead_height = $table.find("thead").outerHeight() || 0;
        const tfoot_height = $table.find("tfoot:visible").outerHeight() || 0;
        const rows_height = $table.find("tbody.archive-operation-rows").outerHeight() || 0;

        const filler_height = Math.max(
            0,
            Math.floor(wrapper_height - thead_height - tfoot_height - rows_height)
        );

        if (filler_height > 0) {
            $fill_tbody.show();
            $fill_cell.show().css("height", `${filler_height}px`);
        } else {
            $fill_cell.css("height", "0px");
            $fill_tbody.hide();
        }
    }

	summary_card(status, label, value) {
		const active =
			this.state.status === status
				? "is-active"
				: "";

		const meta = {
			all: {
				desc: "جميع العمليات في النظام",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 12 12 17 22 12"></polyline><polyline points="2 17 12 22 22 17"></polyline></svg>`,
			},
			pending: {
				desc: "عمليات بانتظار الإجراء",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>`,
			},
			incomplete_invoice: {
				desc: "عمليات تحتاج استكمال الفاتورة",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"></rect><line x1="9" y1="8" x2="15" y2="8"></line><line x1="9" y1="12" x2="15" y2="12"></line><line x1="11" y1="16" x2="15" y2="16"></line></svg>`,
			},
			unconfirmed: {
				desc: "عمليات لم يتم تأكيدها من العميل",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9.75 9.5a2.25 2.25 0 1 1 3.75 1.7c-.9.6-1.5 1.1-1.5 2.05"></path><line x1="12" y1="16.5" x2="12.01" y2="16.5"></line></svg>`,
			},
			confirmed: {
				desc: "عمليات مؤكدة وجاهزة من العميل",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="8.5 12.5 11 15 15.5 9.5"></polyline></svg>`,
			},
			final_swift: {
				desc: "عمليات لم يتم إرفاق السويفت النهائي",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4.5"></path><path d="M14 3v5h5"></path><path d="M19 11.5V8l-5-5"></path><line x1="9" y1="12" x2="13" y2="12"></line><polyline points="14 17.5 16.2 19.5 20.5 15"></polyline></svg>`,
			},
			returned: {
				desc: "عمليات تم إرجاعها ",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-4a7 7 0 0 0-7-7H4"></path></svg>`,
			},
			held: {
				desc: "عمليات محظورة أو مشبوهة",
				icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="5.7" y1="5.7" x2="18.3" y2="18.3"></line></svg>`,
			},
		}[status] || { desc: "", icon: "" };

		return `
			<button
				type="button"
				class="archive-summary-card ${active}"
				data-status="${status}"
			>
				<div class="archive-summary-icon">
					${meta.icon}
				</div>

				<div class="archive-summary-label">
					${label}
				</div>

				<div class="archive-summary-value">
					${value}
				</div>

				<div class="archive-summary-desc">
					${meta.desc}
				</div>
			</button>
		`;
	}

    get_status_value(status) {
        const statuses = {
            all: "",
            pending: "معلقة",
            unconfirmed: "غير مؤكدة",
            confirmed: "مؤكدة",
            returned: "مرتجعة",
            held: "محضورة",
        };

        return statuses[status] ?? "";
    }


    get_status_class(status) {
        const classes = {
            "غير مؤكدة": "status-unconfirmed",
            "مؤكدة": "status-confirmed",
            "مرتجعة": "status-returned",
            "محضورة": "status-held",
            "معلقة":
                "status-pending",
        };

        return classes[status] || "status-unconfirmed";
    }


    // async load_operations() {
    //     const $wrapper = $(this.wrapper);

    //     const $refresh =
    //         $wrapper.find(".archive-refresh-button");

    //     $refresh.prop("disabled", true);

    //     try {
    //         const is_final_swift_view =
    //             this.state.status ===
    //             "final_swift";
    //         const response =
    //             await frappe.call({
    //                 method:
    //                     "archive.api.operations.get_operations",

    //                 args: {
    //                     search:
    //                         this.state.search || null,

    //                    status:
    //                         is_final_swift_view
    //                             ? null
    //                             : (
    //                                 this.get_status_value(
    //                                     this.state.status
    //                                 ) || null
    //                             ),

    //                     start:
    //                         this.state.start,

    //                     page_length:
    //                         this.state.page_length,
    //                     final_swift_pending:
    //                         is_final_swift_view
    //                             ? 1
    //                             : 0,
    //                 },
    //             });

    //         const result =
    //             response.message || {};
    //         this.operations =
    //             result.operations || [];

    //         /*
    //         * إذا كان السجل المحدد لم يعد ضمن النتائج
    //         * بسبب فلتر أو تغيير حالة، نلغي التحديد.
    //         */
    //         if (
    //             this.state.selected_operation_name &&
    //             !this.operations.some(
    //                 (operation) =>
    //                     operation.name ===
    //                     this.state.selected_operation_name
    //             )
    //         ) {
    //             this.state.selected_operation_name = null;
    //         }

    //         this.render_operations(
    //                 this.operations
    //             );

    //         this.update_selected_actions();

    //         this.update_counts(
    //             result.counts || {}
    //         );

    //         this.update_result_count(
    //             result.total || 0
    //         );

    //     } catch (error) {
    //         console.error(
    //             "Archive operations loading failed:",
    //             error
    //         );

    //         frappe.msgprint({
    //             title: __("تعذر تحميل العمليات"),
    //             message:
    //                 error?.message ||
    //                 __(
    //                     "حدث خطأ أثناء تحميل سجلات العمليات."
    //                 ),
    //             indicator: "red",
    //         });

    //     } finally {
    //         $refresh.prop("disabled", false);
    //     }
    // }
    render_fiscal_year_filter(fiscal_context) {
        if (fiscal_context) {
            this.fiscal_context = fiscal_context;
        }
        const ctx = this.fiscal_context || {};
        const allowed = Array.isArray(ctx.allowed_view_years)
            ? ctx.allowed_view_years.map((yr) => String(yr))
            : [];
        const has_ctx = Boolean(fiscal_context && Array.isArray(fiscal_context.allowed_view_years));
        const default_fy = String(ctx.default_view_fiscal_year || allowed[0] || "");

        if (!Array.isArray(this.state.fiscal_years)) {
            if (has_ctx) {
                this.state.fiscal_years =
                    default_fy && allowed.includes(default_fy)
                        ? [default_fy]
                        : allowed[0]
                        ? [allowed[0]]
                        : [];
            }
        } else if (has_ctx) {
            this.state.fiscal_years = this.state.fiscal_years
                .map((yr) => String(yr))
                .filter((yr) => allowed.includes(yr));
        }

        const selected = Array.isArray(this.state.fiscal_years)
            ? this.state.fiscal_years
            : default_fy
            ? [default_fy]
            : [];
        this.state.fiscal_year = selected.length ? selected.join(",") : "__none__";

        const $wrap = $(this.wrapper).find(".archive-fy-multiselect");
        if ($wrap.length) {
            const $btn = $wrap.find(".archive-fy-multiselect-btn");
            const $label = $wrap.find(".archive-fy-multiselect-label");
            const $menu = $wrap.find(".archive-fy-multiselect-menu");

            if (!allowed.length) {
                $label.text("لا توجد سنوات متاحة");
                $btn.prop("disabled", true);
                $menu.empty().hide();
            } else {
                $btn.prop("disabled", false);
                $label.text(selected.length ? selected.join(", ") : "لم يتم اختيار سنة");
                const items_html = allowed
                    .map((yr) => {
                        const meta = (ctx.years || []).find((item) => String(item.year_name) === yr);
                        const closed_suffix = meta && Number(meta.is_closed) === 1 ? " (مغلقة)" : "";
                        const esc = frappe.utils.escape_html(yr);
                        const text_esc = frappe.utils.escape_html(`${yr}${closed_suffix}`);
                        const checked = selected.includes(yr) ? "checked" : "";
                        return `<label class="archive-fy-option-item" style="display: flex; align-items: center; gap: 8px; padding: 5px 8px; margin: 0; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; user-select: none;"><input type="checkbox" class="archive-fy-checkbox" value="${esc}" ${checked} style="margin: 0; cursor: pointer;"><span>${text_esc}</span></label>`;
                    })
                    .join("");
                $menu.html(`
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 4px 6px; border-bottom: 1px solid #f1f5f9; margin-bottom: 4px;">
                        <button type="button" class="btn btn-xs btn-link archive-fy-select-all" style="padding: 2px 4px; font-size: 11px; font-weight: 600; text-decoration: none;">تحديد الكل</button>
                        <button type="button" class="btn btn-xs btn-link archive-fy-clear-all" style="padding: 2px 4px; font-size: 11px; font-weight: 600; color: #dc2626; text-decoration: none;">إلغاء الكل</button>
                    </div>
                    <div class="archive-fy-options-list" style="max-height: 220px; overflow-y: auto;">${items_html}</div>
                `);
            }
        }

        const can_add_fy = Array.isArray(ctx.allowed_add_years) && ctx.allowed_add_years.length > 0;
        $(this.wrapper).find(".archive-create-operation, .archive-empty-create").prop("disabled", !can_add_fy);
    }

    hydrate_compact_operations(result) {
        if (
            !result
            || !result.compact
            || !Array.isArray(result.rows)
            || !Array.isArray(result.schema)
        ) {
            return Array.isArray(result?.records) ? result.records : [];
        }

        const schema = result.schema;
        const rows = result.rows;
        const creators = result.creators || {};
        const caps = result.capabilities || {};
        const transitions_map = caps.status_transitions || {};
        const swift_banks = new Set(result.final_swift_banks || []);
        const swift_limit = Number(caps.final_swift_limit || 10);
        const can_view_timeline = Boolean(caps.can_view_timeline);
        const can_change_initial = Boolean(caps.can_change_initial_status);
        const can_change_advanced = Boolean(caps.can_change_advanced_status);
        const can_release_pending = Boolean(caps.can_release_pending);
        const can_attach_swift = Boolean(caps.can_attach_final_swift);
        const can_attach_incomplete = Boolean(caps.can_attach_incomplete_invoice);

        const col_len = schema.length;
        const idx = {};
        for (let c = 0; c < col_len; c++) {
            idx[schema[c]] = c;
        }

        const out = new Array(rows.length);

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const op = {};
            for (let c = 0; c < col_len; c++) {
                op[schema[c]] = r[c];
            }

            const serial_no = Number(op.serial_no || 0);
            const fiscal_seq = Number(op.fiscal_sequence || 0) || serial_no;
            op.fiscal_sequence = fiscal_seq;
            op.fiscal_display_no = op.fiscal_year
                ? `${op.fiscal_year} / ${fiscal_seq}`
                : String(fiscal_seq || serial_no || "");

            const owner_id = String(op.owner || "").trim();
            op.created_by_name = creators[owner_id] || "";
            op.can_view_timeline = can_view_timeline;

            const fs_count = Number(op.final_swift_count || 0);
            const raw_req = op.final_swift_required;
            const fs_req_flag =
                raw_req === 0 || raw_req === "0" || raw_req === false || raw_req === "غير مطلوب"
                    ? 0
                    : 1;
            const fs_required = Boolean(
                fs_req_flag === 1
                && op.transferring_bank
                && swift_banks.has(op.transferring_bank)
            );

            op.final_swift_required = fs_required;
            op.final_swift_required_flag = fs_req_flag;
            op.final_swift_count = fs_count;
            op.final_swift_limit = swift_limit;
            op.has_final_swift = fs_count > 0;
            op.final_swift_pending = Boolean(fs_required && fs_count === 0);
            op.final_swift_status =
                fs_count > 0
                    ? "تم الإرفاق"
                    : (op.final_swift_pending ? "بانتظار السويفت" : "غير مطلوب");
            op.can_attach_final_swift = Boolean(
                fs_required && fs_count < swift_limit && can_attach_swift
            );

            const is_incomplete = Boolean(Number(op.is_incomplete_resolved || 0));
            op.is_incomplete_invoice = is_incomplete;
            op.can_attach_incomplete_invoice = Boolean(
                is_incomplete && can_attach_incomplete
            );

            if (op.status === "معلقة") {
                op.can_change_status = false;
                op.can_release_pending = can_release_pending;
            } else {
                op.can_release_pending = false;
                op.can_change_status =
                    op.status === "غير مؤكدة"
                        ? can_change_initial
                        : can_change_advanced;
            }

            op.allowed_status_transitions = op.can_change_status
                ? (transitions_map[op.status] || [])
                : [];
            op.customer_name = op.customer;
            op.from_account_name = op.from_account;

            out[i] = op;
        }

        return out;
    }

    async refresh_operation_row(operation_name, { previous_operation_no = null } = {}) {
        const clean_name = String(operation_name || "").trim();
        if (!clean_name || !this.data_source) {
            return await this.load_operations();
        }

        try {
            const response = await frappe.call({
                method: "archive.api.operations.get_operation_context_row",
                type: "GET",
                args: { operation_name: clean_name },
            });

            const rows = Array.isArray(response?.message?.rows)
                ? response.message.rows
                : [];

            if (!rows.length) {
                return await this.load_operations();
            }

            // If operation_no changed from a duplicate group, reload so old siblings update counts
            if (previous_operation_no !== null) {
                const updated = rows.find((r) => r.name === clean_name);
                const new_no = String(updated?.operation_no || "").trim();
                const old_no = String(previous_operation_no || "").trim();
                if (old_no && new_no !== old_no) {
                    return await this.load_operations({ preserve_scroll: true });
                }
            }

            for (let i = 0; i < rows.length; i++) {
                this.data_source.upsert(rows[i]);
            }

            this.apply_local_query({ preserve_scroll: true });
        } catch (error) {
            console.warn("Single-row refresh fallback to full load:", error);
            await this.load_operations({ preserve_scroll: true });
        }
    }

    async load_operations({ preserve_scroll = false } = {}) {

        const $wrapper =
            $(this.wrapper);


        const $refresh =
            $wrapper.find(
                ".archive-refresh-button"
            );


        $refresh.prop(
            "disabled",
            true
        );

        const request_id = (this._load_request_id = (this._load_request_id || 0) + 1);
        const is_initialized = Array.isArray(this.state.fiscal_years);
        const selected_years = is_initialized ? [...this.state.fiscal_years] : null;

        if (is_initialized && selected_years.length === 0) {
            this.data_source.set_records([]);
            this.state.page = 1;
            this.apply_local_query();
            $refresh.prop("disabled", false);
            return;
        }

        try {

            const response =
                await frappe.call({

                    method:
                        "archive.api.operations.get_operations_context",

                    type:
                        "GET",

                    args: {
                        fiscal_year: selected_years ? JSON.stringify(selected_years) : undefined,
                        compact: 1,
                    },
                });

            if (request_id !== this._load_request_id) {
                return;
            }

            const result =
                response.message
                || {};

            if (result.saudi_customer_rate_bounds) {
                this.saudi_customer_rate_bounds =
                    result.saudi_customer_rate_bounds;
            }

            if (result.bank_transfer_rate_bounds) {
                this.bank_transfer_rate_bounds =
                    result.bank_transfer_rate_bounds;
            }

            if (result.sender_account_validation) {
                this.sender_account_validation =
                    result.sender_account_validation;
            }

            if (result.fiscal_context) {
                this.render_fiscal_year_filter(result.fiscal_context);
                if (
                    !is_initialized
                    && Array.isArray(this.state.fiscal_years)
                ) {
                    return await this.load_operations({ preserve_scroll });
                }
            }


            const records =
                this.hydrate_compact_operations(result);


            this.context_version =
                result.version
                || null;


            this.data_source
                .set_records(
                    records
                );


            if (!preserve_scroll) {
                this.state.page = 1;
            }


            this.apply_local_query({ preserve_scroll });


        } catch (error) {
            if (request_id !== this._load_request_id) {
                return;
            }

            console.error(
                "Archive operations context loading failed:",
                error
            );


            frappe.msgprint({

                title:
                    __("تعذر تحميل العمليات"),

                message:
                    error?.message
                    ||
                    __(
                        "حدث خطأ أثناء تحميل بيانات العمليات."
                    ),

                indicator:
                    "red",
            });


        } finally {

            $refresh.prop(
                "disabled",
                false
            );
        }
    }

    // get_active_filters() {

    //     if (
    //         this.state.status
    //         === "final_swift"
    //     ) {
    //         return {
    //             final_swift_pending:
    //                 true,
    //         };
    //     }


    //     const status =
    //         this.get_status_value(
    //             this.state.status
    //         );


    //     if (!status) {
    //         return {};
    //     }


    //     return {
    //         status:
    //             status,
    //     };
    // }

    get_active_filters() {

        const filters = {
            ...(
                this.state
                    .advanced_filters
                || {}
            ),
        };


        if (
            this.state.status
            === "final_swift"
        ) {
            filters[
                "final_swift_pending"
            ] = true;

            return filters;
        }

        if (
            this.state.status
            === "incomplete_invoice"
        ) {
            filters[
                "is_incomplete_invoice"
            ] = true;

            return filters;
        }


        const status =
            this.get_status_value(
                this.state.status
            );


        if (status) {
            filters.status =
                status;
        }


        return filters;
    }
    get_local_counts(
        searched_ids
    ) {

        const counts = {
            all: 0,

            "معلقة": 0,
            "غير مؤكدة": 0,
            "مؤكدة": 0,
            "مرتجعة": 0,
            "محضورة": 0,

            final_swift: 0,
            incomplete_invoice: 0,
        };


        for (
            const id
            of searched_ids || []
        ) {

            const operation =
                this.data_source
                    .records
                    .get(id);


            if (!operation) {
                continue;
            }


            counts.all += 1;


            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        counts,
                        operation.status
                    )
            ) {
                counts[
                    operation.status
                ] += 1;
            }


            if (
                operation.final_swift_pending
            ) {
                counts.final_swift += 1;
            }

            if (
                operation.is_incomplete_invoice
            ) {
                counts.incomplete_invoice += 1;
            }
        }


        return counts;
    }

    apply_local_query({ skip_counts = false, preserve_scroll = false } = {}) {

        if (!this.data_source) {
            return;
        }


        const result =
            this.data_source.query({

                search:
                    this.state.search,

                filters:
                    this.get_active_filters(),

                sort:
                    this.state.sort,

                page:
                    this.state.page,

                page_length:
                    this.state.page_length,
            });


        this.state.page =
            result.page;


        this.state.page_length =
            result.page_length === 0
                ? "all"
                : String(
                    result.page_length
                );


        this.operations =
            result.records;


        if (this.state.selected_operation_name) {
            const sel_name = this.state.selected_operation_name;
            let sel_exists = false;
            if (result.page_length === 0) {
                sel_exists =
                    this.data_source.records.has(sel_name)
                    && result.page_ids.indexOf(sel_name) !== -1;
            } else {
                sel_exists = result.page_ids.indexOf(sel_name) !== -1;
            }
            if (!sel_exists) {
                this.state.selected_operation_name = null;
            }
        }


        this.render_operations(
            this.operations,
            { preserve_scroll }
        );


        this.update_selected_actions();


        if (!skip_counts) {
            let count_ids;
            if (this.state.status === "all") {
                count_ids = result.result_ids;
            } else {
                const counts_result =
                    this.data_source.query({
                        search: this.state.search,
                        filters: this.state.advanced_filters || {},
                        sort: null,
                        page: 1,
                        page_length: "all",
                        include_records: false,
                    });
                count_ids = counts_result.result_ids;
            }

            this.update_counts(
                this.get_local_counts(
                    count_ids
                )
            );
        }

        this.update_result_count(
            result.total_rows
        );


        this.pagination?.update({

            page:
                result.page,

            page_length:
                result.page_length,

            total_rows:
                result.total_rows,

            total_pages:
                result.total_pages,
        });


        this.update_sort_indicators();
    }

    change_sort(
        field
    ) {

        field =
            String(
                field || ""
            ).trim();

        if (
            !field
            ||
            (
                this.data_source?.sorters
                &&
                !this.data_source.sorters[field]
            )
        ) {
            return;
        }


        if (
            this.state.sort?.field
            === field
        ) {

            this.state.sort.direction =
                this.state.sort.direction
                === "asc"
                    ? "desc"
                    : "asc";

        } else {
            const default_dir =
                this.data_source?.sorters?.[field]?.default_direction
                || "desc";

            this.state.sort = {
                field:
                    field,

                direction:
                    default_dir,
            };
        }


        this.state.page = 1;


        this.apply_local_query({ skip_counts: true });


        this.scroll_grid_to_top();
    }

    update_sort_indicators() {

        const $headers =
            $(this.wrapper)
                .find(
                    ".generic-sortable-column"
                );


        $headers.each(
            (
                index,
                element
            ) => {

                const $header =
                    $(element);


                const field =
                    String(
                        $header.attr(
                            "data-sort-field"
                        )
                        || ""
                    ).trim();


                const $indicator =
                    $header.find(
                        ".generic-sort-indicator"
                    );


                if (
                    this.state.sort?.field
                    === field
                ) {

                    const direction =
                        this.state
                            .sort
                            .direction;


                    $indicator.text(
                        direction === "asc"
                            ? "▲"
                            : "▼"
                    );


                    $header
                        .addClass(
                            "is-sorted"
                        )
                        .attr(
                            "aria-sort",
                            direction === "asc"
                                ? "ascending"
                                : "descending"
                        );

                } else {

                    $indicator.text(
                        ""
                    );


                    $header
                        .removeClass(
                            "is-sorted"
                        )
                        .removeAttr(
                            "aria-sort"
                        );
                }
            }
        );
    }

    scroll_grid_to_top() {

        const element =
            $(this.wrapper)
                .find(
                    ".generic-data-grid-scroll"
                )
                .get(0);


        if (!element) {
            return;
        }


        element.scrollTop = 0;
    }


    render_operations(operations, { preserve_scroll = false } = {}) {
        const $wrapper = $(this.wrapper);

        const $tbody =
            $wrapper.find(
                ".archive-operation-rows"
            );

        const $empty =
            $wrapper.find(
                ".archive-empty-state"
            );

        const $table =
            $wrapper.find(
                ".archive-operations-table"
            );

        if (!operations.length) {
            if (this._virtual_table) {
                this._virtual_table.set_rows([], { preserve_scroll: false, force: true });
            } else {
                $tbody.empty();
            }

            this.update_visible_amount_total(
                []
            );

            $table.hide();
            $empty.show();

            return;
        }

        $empty.hide();
        $table.show();

        if (this._virtual_table) {
            this._virtual_table.set_rows(operations, {
                preserve_scroll,
                force: true,
            });
        } else {
            $tbody.html(
                operations
                    .map(
                        (operation) =>
                            this.operation_row(
                                operation
                            )
                    )
                    .join("")
            );
            this.apply_first_visible_column_class();
            this.update_table_filler_height();
        }

        this.update_visible_amount_total(
            operations
        );
    }
    update_visible_amount_total(
            operations
        ) {
            const totals = {};


            (operations || [])
                .forEach(
                    (operation) => {

                        const amount =
                            Number(
                                operation.amount
                                || 0
                            );


                        if (
                            !Number.isFinite(
                                amount
                            )
                        ) {
                            return;
                        }


                        const currency =
                            String(
                                operation.currency
                                || "بدون عملة"
                            ).trim();


                        totals[currency] =
                            (
                                totals[currency]
                                || 0
                            )
                            +
                            amount;
                    }
                );


            const entries =
                Object.entries(
                    totals
                );


            const $total =
                $(this.wrapper)
                    .find(
                        ".archive-visible-amount-total"
                    );


            if (!entries.length) {
                $total.html("—");
                return;
            }


            const html =
                entries
                    .map(
                        (
                            [
                                currency,
                                total
                            ]
                        ) => {

                            return `
                                <span
                                    class="
                                        archive-visible-total-item
                                    "
                                >
                                    <strong>
                                        ${this.format_amount(
                                            total
                                        )}
                                    </strong>

                                    <span>
                                        ${this.escape_value(
                                            currency
                                        )}
                                    </span>
                                </span>
                            `;
                        }
                    )
                    .join("");


            $total.html(
                html
            );
        }


    operation_row(operation) {
        const status_class =
            this.get_status_class(
                operation.status
            );
        const selected_class =
            this.state.selected_operation_name
                === operation.name
                    ? "is-selected"
                    : "";

        return `
            <tr
                class="archive-operation-row ${status_class} ${selected_class}"
                data-name="${frappe.utils.escape_html(
                    operation.name || ""
                )}"
            >

                <!-- الرقم التسلسلي -->
                <td class="archive-operation-serial-cell" dir="ltr">
                    <span class="archive-operation-serial">
                        ${this.escape_value(
                            operation.fiscal_sequence
                                || operation.serial_no
                                || operation.name
                        )}
                    </span>
                </td>

                <!-- رقم العملية -->
                <td>
                    ${this.render_operation_no(
                        operation
                    )}
                </td>


                <!-- العميل -->
                <td class="archive-customer-name">
                    ${this.escape_value(
                        operation.customer_name || operation.customer
                    )}
                </td>


                <!-- المبلغ -->
                <td class="archive-operation-amount">
                    ${this.format_amount(
                        operation.amount
                    )}
                </td>


                <!-- العملة -->
                <td>
                    ${this.escape_value(
                        operation.currency
                    )}
                </td>


                <!-- سعر العميل -->
                <td>
                    ${this.format_rate(
                        operation.customer_rate
                    )}
                </td>


                <!-- ملاحظة البدل -->
                <td>
                    ${this.escape_value(
                        operation.replacement_note
                    )}
                </td>


                <!-- اسم المستفيد -->
                <td class="archive-beneficiary-name">
                    ${this.escape_value(
                        operation.beneficiary_name
                    )}
                </td>


                <!-- حساب المستفيد -->
                <td class="archive-account-number">
                    ${this.escape_value(
                        operation.beneficiary_account
                    )}
                </td>


                <!-- بنك المستفيد -->
                <td>
                    ${this.escape_value(
                        operation.beneficiary_bank
                    )}
                </td>


                <!-- SWIFT -->
                <td>
                    ${this.escape_value(
                        operation.swift_code
                    )}
                </td>


                <!-- الدولة -->
                <td>
                    ${this.translate_value(
                        operation.country
                    )}
                </td>


                <!-- اسم المرسل -->
                <td>
                    ${this.escape_value(
                        operation.sender_name
                    )}
                </td>


                <!-- حساب المرسل -->
                <td class="archive-account-number">
                    ${this.escape_value(
                        operation.sender_account
                    )}
                </td>


                <!-- تاريخ التنفيذ -->
                <td dir="rtl">
                    ${this.format_execution_datetime(
                        operation.execution_datetime
                    )}
                </td>


                <!-- البنك المحول -->
                <td>
                    ${this.escape_value(
                        operation.transferring_bank
                    )}
                </td>


                <!-- تاريخ الطلب -->
                <td>
                    ${this.format_date(
                        operation.request_date
                    )}
                </td>


                <!-- عن طريق  -->
                <td>
                    ${this.escape_value(
                        operation.from_account_name
                            || operation.from_account
                    )}
                </td>


                <!-- رقم المرجع -->
                <td class="archive-reference-number">
                    ${this.escape_value(
                        operation.reference_no
                    )}
                </td>


                <!-- سعر البنك المحول -->
                <td>
                    ${this.format_rate(
                        operation.bank_transfer_rate
                    )}
                </td>


                <!-- الملاحظات -->
                <td class="archive-operation-notes">
                    ${this.escape_value(
                        operation.notes
                    )}
                </td>

                <!-- السويفت النهائي -->
                <td class="archive-final-swift-cell">

                    <span
                        class="
                            archive-final-swift-check
                            ${
                                operation.has_final_swift
                                    ? "is-checked"
                                    : ""
                            }
                        "
                        data-final-swift-status="${frappe.utils.escape_html(
                            operation.final_swift_status
                            || (
                                operation.has_final_swift
                                    ? "تم الإرفاق"
                                    : (operation.final_swift_pending ? "بانتظار السويفت" : "غير مطلوب")
                            )
                        )}"
                        title="${frappe.utils.escape_html(
                            operation.final_swift_status
                            || (
                                operation.has_final_swift
                                    ? "تم الإرفاق"
                                    : (operation.final_swift_pending ? "بانتظار السويفت" : "غير مطلوب")
                            )
                        )}"
                    >
                        ${
                            operation.has_final_swift
                                ? "✓"
                                : ""
                        }
                    </span>

                </td>

                <!-- تاريخ الحالة -->
                <td dir="rtl">
                    <span dir="ltr">${this.format_status_effective_date(
                        operation.status_effective_datetime
                    )}</span>
                </td>

                <!-- وقت الإدخال -->
                <td dir="rtl">
                    ${this.format_datetime(
                        operation.creation
                    )}
                </td>

                <!-- المستخدم الذي أنشأ العملية -->
                <td>
                    ${this.escape_value(
                        operation.created_by_name
                    )}
                </td>
                <!-- الحالة -->
                <td>
                    <span
                        class="archive-operation-status ${status_class}"
                    >
                        ${this.escape_value(
                            operation.status
                        )}
                    </span>
                </td>


                
                

            </tr>
        `;
    }


    escape_value(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        return frappe.utils.escape_html(
            String(value).trim()
        );
    }


    format_amount(value) {
        const number =
            Number(value || 0);

        return this._amount_formatter.format(number);
    }

    format_rate(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        const number = Number(value);

        if (Number.isNaN(number)) {
            return this.escape_value(value);
        }

        return number.toFixed(6)
            .replace(/0+$/, "")
            .replace(/\.$/, "");
    }


    format_date(value) {
        if (!value) {
            return "—";
        }

        try {
            return frappe.datetime.str_to_user(
                value
            );
        } catch (error) {
            return this.escape_value(value);
        }
    }


    format_status_effective_date(value) {
        if (!value) {
            return "—";
        }
        const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) {
            return this.escape_value(value);
        }
        return `${m[1]}-${m[2]}-${m[3]}`;
    }


    translate_raw(value) {
        const key = String(value || "").trim();
        if (!key) {
            return "";
        }
        let cached = this._translation_cache.get(key);
        if (cached === undefined) {
            cached = __(key);
            this._translation_cache.set(key, cached);
        }
        return cached;
    }

    translate_value(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        return frappe.utils.escape_html(
            this.translate_raw(value)
        );
    }


    format_execution_datetime(value) {
        if (!value) {
            return "—";
        }

        return this.escape_value(
            String(value)
                .trim()
                .replace(/\.\d+$/, "")
                .replace(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}:\d{2})(?::\d{2})?$/, "$1، $2")
        );
    }

    format_datetime(value) {
        if (!value) {
            return "—";
        }
        const key = String(value);
        const cached = this._datetime_cache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        let formatted;
        if (typeof window.archive_format_datetime === "function") {
            formatted = this.escape_value(window.archive_format_datetime(value, "—"));
        } else {
            const clean = key.trim().replace(/\.\d+$/, "");
            let resolved = clean;
            try {
                if (frappe?.datetime?.convert_to_user_tz && /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(clean)) {
                    const converted = frappe.datetime.convert_to_user_tz(clean, true);
                    if (converted && converted !== "Invalid date") {
                        resolved = String(converted).trim().replace(/\.\d+$/, "");
                    }
                }
            } catch (error) {
                // fallback to clean
            }
            const m = resolved.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
            if (m) {
                const h24 = parseInt(m[2], 10);
                const min = String(m[3]).padStart(2, "0");
                const period = h24 >= 12 ? "م" : "ص";
                const h12 = String(h24 % 12 || 12).padStart(2, "0");
                formatted = this.escape_value(`${m[1]}، ${h12}:${min} ${period}`);
            } else {
                formatted = this.escape_value(resolved);
            }
        }
        if (this._datetime_cache.size > 4000) {
            this._datetime_cache.clear();
        }
        this._datetime_cache.set(key, formatted);
        return formatted;
    }

    format_time_only(value) {
        if (!value) {
            return "—";
        }
        if (typeof window.archive_format_time_only === "function") {
            return this.escape_value(window.archive_format_time_only(value, "—"));
        }
        return "—";
    }


    update_counts(counts) {
        const $wrapper = $(this.wrapper);

        const values = {
            all:
                counts.all || 0,

            unconfirmed:
                counts["غير مؤكدة"] || 0,

            confirmed:
                counts["مؤكدة"] || 0,

            returned:
                counts["مرتجعة"] || 0,

            held:
                counts["محضورة"] || 0,
            final_swift:
                counts.final_swift || 0,
            incomplete_invoice:
                counts.incomplete_invoice || 0,
            pending:
                counts["معلقة"] || 0,
        };

        Object.entries(values).forEach(
            ([status, value]) => {
                $wrapper
                    .find(
                        `.archive-summary-card[data-status="${status}"] .archive-summary-value`
                    )
                    .text(value);
            }
        );
    }


    update_result_count(total) {
        $(this.wrapper)
            .find(".archive-result-count")
            .text(
                total === 1
                    ? "1 عملية"
                    : `${total} عملية`
            );
    }

    bind_row_events() {
        // Handled via single delegated listener on tbody.archive-operation-rows in bind_events()
    }

    select_operation(
        operation_name
    ) {
        this.state
            .selected_operation_name =
                operation_name;

        if (this._virtual_table) {
            this._virtual_table.update_selected(operation_name);
        } else {
            const tbody = this.wrapper.querySelector("tbody.archive-operation-rows");
            if (tbody) {
                const prev = tbody.querySelector("tr.is-selected");
                if (prev) {
                    prev.classList.remove("is-selected");
                }
                if (operation_name) {
                    const trs = tbody.children;
                    const target = String(operation_name);
                    for (let i = 0; i < trs.length; i++) {
                        if (trs[i].getAttribute("data-name") === target) {
                            trs[i].classList.add("is-selected");
                            break;
                        }
                    }
                }
            }
        }

        this.update_selected_actions();
    }

    get_selected_operation() {
        const operation_name =
            this.state.selected_operation_name;

        if (!operation_name) {
            return null;
        }

        if (this.data_source?.records) {
            return this.data_source.records.get(operation_name) || null;
        }

        return (
            this.operations.find(
                (operation) =>
                    operation.name ===
                    operation_name
            ) || null
        );
    }
    update_selected_actions() {
        const selected =
            this.get_selected_operation();
        
        const can_release_pending =
            Boolean(
                selected
                &&
                selected.status
                    === "معلقة"
                &&
                selected.can_release_pending
            );


        const $release_pending_button =
            $(this.wrapper)
                .find(
                    ".archive-release-pending-button"
                );


        $release_pending_button
            .toggle(
                can_release_pending
            )
            .prop(
                "disabled",
                !can_release_pending
            );
        
        const can_view_timeline =
            Boolean(
                selected
                &&
                selected.can_view_timeline
            );
        
        const $timeline_button =
            $(this.wrapper).find(
                ".archive-timeline-button"
            );

        $timeline_button
            .toggle(
                can_view_timeline
            )
            .prop(
                "disabled",
                !can_view_timeline
            );


        const can_view =
            Boolean(
                selected
            );


        const can_change_status =
            Boolean(
                selected
                &&
                selected.status
                    !== "معلقة"
                &&
                selected.can_change_status
            );

        
        
        const final_swift_count =
            Number(
                selected?.final_swift_count
                || 0
            );

        const final_swift_limit =
            Number(
                selected?.final_swift_limit
                || 5
            );


        const can_attach_final_swift =
            Boolean(
                selected
                &&
                this.state.status === "final_swift"
                &&
                selected.final_swift_required
                &&
                selected.can_attach_final_swift
                &&
                final_swift_count
                    < final_swift_limit
            );


        /*
        * عرض
        */
        $(this.wrapper)
            .find(
                ".archive-selected-view"
            )
            .prop(
                "disabled",
                !can_view
            );


        /*
        * الإجراءات
        */
        $(this.wrapper)
            .find(
                ".archive-selected-actions"
            )
            .prop(
                "disabled",
                !can_change_status
            );


        /*
        * إرفاق السويفت النهائي
        *
        * لا نكتفي بتعطيله:
        * لا يظهر أصلاً إذا لم تتحقق الشروط.
        */
        const $final_swift_button =
            $(this.wrapper)
                .find(
                    ".archive-final-swift-button"
                );


        if (
            can_attach_final_swift
        ) {
            $final_swift_button
                .show()
                .prop(
                    "disabled",
                    false
                );

        } else {
            $final_swift_button
                .hide()
                .prop(
                    "disabled",
                    true
                );
        }

        const can_attach_incomplete_invoice =
            Boolean(
                selected
                &&
                selected.is_incomplete_invoice
                &&
                selected.can_attach_incomplete_invoice
            );

        const $incomplete_invoice_button =
            $(this.wrapper)
                .find(
                    ".archive-incomplete-invoice-button"
                );

        if (
            can_attach_incomplete_invoice
        ) {
            $incomplete_invoice_button
                .show()
                .prop(
                    "disabled",
                    false
                );
        } else {
            $incomplete_invoice_button
                .hide()
                .prop(
                    "disabled",
                    true
                );
        }
    }

    open_selected_operation_timeline() {
        const operation =
            this.get_selected_operation();


        if (
            !operation
            ||
            !operation.can_view_timeline
        ) {
            return;
        }


        frappe.require(
            [
                "/assets/archive/js/archive_operations/operation_timeline_dialog.js",
                "/assets/archive/css/archive_operations/operation_timeline_dialog.css",
            ],
            () => {

                const dialog =
                    new archive.ui
                        .OperationTimelineDialog(
                            operation.name
                        );


                dialog.show();
            }
        );
    }
    open_selected_operation() {
        const operation =
            this.get_selected_operation();


        if (!operation) {
            return;
        }


        frappe.require(
            [
                "/assets/archive/js/archive_pending_operations/pending_attachment_manager.js",
                "/assets/archive/css/archive_pending_operations/pending_attachment_manager.css",
                "/assets/archive/js/archive_operations/swift_country_helper.js",
                "/assets/archive/js/archive_operations/operation_view_dialog.js",
                "/assets/archive/css/archive_operations/operation_dialog.css",
            ],
            () => {

                const prev_op_no = operation.operation_no || "";
                const dialog =
                    new archive.ui
                        .OperationViewDialog(
                            operation.name,
                            {
                                on_saved:
                                    async () => {
                                        await this.refresh_operation_row(
                                            operation.name,
                                            { previous_operation_no: prev_op_no }
                                        );
                                    },
                            }
                        );


                dialog.show();
            }
        );
    }
    

    bind_events() {
        const $wrapper = $(this.wrapper);

        $wrapper
            .find(
                ".archive-release-pending-button"
            )
            .on(
                "click",
                () => {
                    this.release_pending_operation();
                }
            );

        $wrapper
            .find(
                ".archive-create-operation, .archive-empty-create"
            )
            .on("click", () => {
                this.open_create_operation();
            });
        
        $wrapper
            .find(
                ".archive-columns-button"
            )
            .on(
                "click",
                (event) => {
                    event.stopPropagation();
                    this
                        .toggle_columns_menu();
                }
            );

        $wrapper
            .find(
                '[data-role="columns-menu"]'
            )
            .on(
                "click",
                (event) => {
                    event.stopPropagation();
                }
            );

        $wrapper
            .on(
                "change",
                "[data-column-toggle]",
                (event) => {
                    const col_field =
                        String(
                            $(event.currentTarget).attr(
                                "data-column-toggle"
                            ) || ""
                        ).trim();
                    const checked =
                        $(event.currentTarget).is(":checked");
                    if (!col_field) {
                        return;
                    }

                    if (checked) {
                        this.hidden_columns.delete(
                            col_field
                        );
                    } else {
                        const columns =
                            this.get_operation_column_definitions();
                        const visible_remaining =
                            columns.filter(
                                (c) =>
                                    c.field !== col_field
                                    && !this.hidden_columns.has(
                                        c.field
                                    )
                            ).length;
                        if (visible_remaining < 1) {
                            $(event.currentTarget).prop(
                                "checked",
                                true
                            );
                            frappe.show_alert({
                                message: __(
                                    "يجب إبقاء عمود واحد ظاهرًا على الأقل."
                                ),
                                indicator: "orange",
                            });
                            return;
                        }
                        this.hidden_columns.add(
                            col_field
                        );
                    }

                    this.save_hidden_columns();
                    this.apply_column_visibility();
                }
            );

        $(document)
            .off("click.archiveOpsColumnsMenu")
            .on("click.archiveOpsColumnsMenu", () => {
                $wrapper
                    .find('[data-role="columns-menu"]')
                    .prop("hidden", true);
            });


        // $wrapper
        //     .find(".archive-summary-card")
            // .on("click", (event) => {
            //     const status =
            //         $(event.currentTarget)
            //             .data("status");

            //     if (
            //         this.state.status === status
            //     ) {
            //         return;
            //     }

            //     this.state.status = status;
            //     this.state.start = 0;

            //     $wrapper
            //         .find(".archive-summary-card")
            //         .removeClass("is-active");

            //     $(event.currentTarget)
            //         .addClass("is-active");

            //     this.load_operations();
            // });

        $wrapper
            .find(
                ".archive-summary-card"
            )
            .on(
                "click",
                (event) => {

                    const status =
                        $(event.currentTarget)
                            .data(
                                "status"
                            );


                    if (
                        this.state.status
                        === status
                    ) {
                        return;
                    }


                    this.state.status =
                        status;


                    this.state.page = 1;


                    $wrapper
                        .find(
                            ".archive-summary-card"
                        )
                        .removeClass(
                            "is-active"
                        );


                    $(event.currentTarget)
                        .addClass(
                            "is-active"
                        );


                    this.apply_local_query();


                    this.scroll_grid_to_top();
                }
            );


        
        
        $wrapper
            .find(
                ".archive-final-swift-button"
            )
            .on(
                "click",
                () => {
                    this.open_final_swift_dialog();
                }
            );

        $wrapper
            .find(
                ".archive-incomplete-invoice-button"
            )
            .on(
                "click",
                () => {
                    this.open_incomplete_invoice_dialog();
                }
            );
        
        $wrapper
            .find(
                ".archive-timeline-button"
            )
            .on(
                "click",
                () => {
                    this.open_selected_operation_timeline();
                }
            );

        // $wrapper
        //     .find(".archive-operation-search")
        //     .on("input", (event) => {
        //         const value =
        //             event.target.value.trim();

        //         clearTimeout(search_timer);

        //         search_timer =
        //             setTimeout(() => {
        //                 this.state.search =
        //                     value;

        //                 this.state.start = 0;

        //                 this.load_operations();
        //             }, 350);
        //     });

        $wrapper.on("click", ".archive-search-box", (e) => {
            if (!$(e.target).is("input")) {
                $(e.currentTarget).find(".archive-operation-search").focus();
            }
        });

        // Single delegated click listener for all operation rows (O(1) memory & bind time)
        $wrapper
            .find("tbody.archive-operation-rows")
            .off("click.archiveOpRowSelect")
            .on("click.archiveOpRowSelect", ".archive-operation-row", (event) => {
                const operation_name =
                    event.currentTarget?.getAttribute("data-name")
                    || $(event.currentTarget).data("name");

                if (!operation_name) {
                    return;
                }

                this.select_operation(operation_name);
            });

        $wrapper
            .find(
                ".archive-operation-search"
            )
            .on(
                "input",
                (event) => {

                    const value =
                        event.target.value;


                    this.state.search =
                        value;


                    this.state.page = 1;


                    if (this.search_frame) {
                        cancelAnimationFrame(this.search_frame);
                        this.search_frame = null;
                    }
                    if (this.search_timer) {
                        clearTimeout(this.search_timer);
                        this.search_timer = null;
                    }

                    const total_loaded = this.data_source?.all_ids?.length || 0;
                    const run_search = () => {
                        this.search_frame = requestAnimationFrame(() => {
                            this.search_frame = null;
                            this.apply_local_query();
                        });
                    };

                    if (total_loaded > 2000) {
                        this.search_timer = setTimeout(() => {
                            this.search_timer = null;
                            run_search();
                        }, 45);
                    } else {
                        run_search();
                    }
                }
            );

        
        $wrapper
            .find(
                ".generic-sortable-column"
            )
            .on(
                "click",
                (event) => {

                    const field =
                        $(event.currentTarget)
                            .data(
                                "sort-field"
                            );


                    this.change_sort(
                        field
                    );
                }
            );

        
        


        $wrapper
            .on("click", ".archive-fy-multiselect-btn", (event) => {
                event.stopPropagation();
                $wrapper.find(".archive-fy-multiselect-menu").toggle();
            })
            .on("click", ".archive-fy-multiselect-menu", (event) => {
                event.stopPropagation();
            })
            .on("change", ".archive-fy-checkbox", async () => {
                const checked = [];
                $wrapper.find(".archive-fy-checkbox:checked").each((_, el) => {
                    const val = String($(el).val() || "").trim();
                    if (val) checked.push(val);
                });
                this.state.fiscal_years = checked;
                this.render_fiscal_year_filter();
                this.state.page = 1;
                await this.load_operations();
            })
            .on("click", ".archive-fy-select-all", async (event) => {
                event.preventDefault();
                const allowed = Array.isArray(this.fiscal_context?.allowed_view_years)
                    ? this.fiscal_context.allowed_view_years.map((yr) => String(yr))
                    : [];
                this.state.fiscal_years = [...allowed];
                this.render_fiscal_year_filter();
                this.state.page = 1;
                await this.load_operations();
            })
            .on("click", ".archive-fy-clear-all", async (event) => {
                event.preventDefault();
                this.state.fiscal_years = [];
                this.render_fiscal_year_filter();
                this.state.page = 1;
                await this.load_operations();
            });

        $(document)
            .off("click.archiveOpsFyMenu")
            .on("click.archiveOpsFyMenu", () => {
                $wrapper.find(".archive-fy-multiselect-menu").hide();
            });

        $wrapper
            .find(".archive-refresh-button")
            .on("click", async () => {
                await this.load_operations();

                frappe.show_alert({
                    message: __("تم تحديث العمليات"),
                    indicator: "green",
                });
            });

        
        $wrapper
            .find(".archive-selected-view")
            .on("click", () => {
                this.open_selected_operation();
            });


        $wrapper
            .find(".archive-selected-actions")
            .on("click", () => {
                const operation =
                    this.get_selected_operation();

                if (!operation) {
                    frappe.show_alert({
                        message:
                            __("اختر عملية أولاً"),
                        indicator:
                            "orange",
                    });

                    return;
                }

                // this.open_status_dialog(
                //     operation.name,
                //     operation.status
                // );
                this.open_status_dialog(
                        operation
                    );
            });
    }

	open_create_operation() {
        frappe.require(
            [
                "/assets/archive/js/archive_operations/swift_country_helper.js",
                "/assets/archive/js/archive_operations/operation_dialog.js",
                "/assets/archive/css/archive_operations/operation_dialog.css",
            ],
            () => {
                const dialog =
                    new archive.ui.OperationDialog({
                        fiscal_context: this.fiscal_context,
                        saudi_customer_rate_bounds:
                            this.saudi_customer_rate_bounds,
                        bank_transfer_rate_bounds:
                            this.bank_transfer_rate_bounds,
                        sender_account_validation:
                            this.sender_account_validation,
                    });

                dialog.show();
            }
        );
    }
}