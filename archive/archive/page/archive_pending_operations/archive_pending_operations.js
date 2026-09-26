frappe.pages["archive-pending-operations"].on_page_load = function (wrapper) {
    frappe.archive_pending_operations = new ArchivePendingOperationsPage(wrapper);
};

class ArchivePendingOperationsPage {
    constructor(wrapper) {
        this.wrapper = wrapper;

        this.state = {
            status: "all",
            search: "",
            advanced_filters: {},
            page: 1,
            page_length: "100",
            sort: {
                field: "operation_datetime",
                direction: "desc",
            },
        };

        this.operations = [];
        this.capabilities = {};
        this.scope = null;
        this.context_version = null;

        this.data_source = null;
        this.pagination = null;
        this.filter_controller = null;

        this.search_frame = null;
        this.is_loading = false;

        this.label_maps = {
            card_owner: new Map(),
            bank: new Map(),
            region: new Map(),
            representative: new Map(),
        };

        this.make_page();
        this.render();
        this.initialize();
    }

    async open_operation(
            name
        ) {
            name =
                String(
                    name || ""
                ).trim();

            if (!name) {
                return;
            }

            if (
                !window
                    .ArchivePendingOperationViewDialog
            ) {
                frappe.msgprint({
                    title:
                        "تعذر فتح العملية",

                    message:
                        "لم يتم تحميل مكوّن عرض العملية.",

                    indicator:
                        "red",
                });

                return;
            }

            this.view_dialog =
                new window
                    .ArchivePendingOperationViewDialog({
                        name,

                        on_changed:
                            async () => {
                                await this
                                    .load_context();
                            },
                    });

            await this
                .view_dialog
                .show();
        }

    make_page() {
        this.page = frappe.ui.make_app_page({
            parent: this.wrapper,
            title: __("Pending Operations"),
            single_column: true,
        });

        $(this.wrapper).addClass(
            "archive-pending-operations-page"
        );
    }

    render() {
        $(this.page.main).html(`
            <div
                class="archive-pending-shell"
                dir="rtl"
            >
                <div class="archive-pending-header">
                    <div class="archive-pending-header-text">
                        <div class="archive-pending-title-row">
                            <h1>شاشة المعلقات</h1>

                            <span
                                class="archive-pending-scope-badge"
                                aria-live="polite"
                            >
                                —
                            </span>
                        </div>

                        <p>
                            إدارة ومتابعة العمليات المعلقة والإرجاعات
                        </p>
                    </div>
                </div>

                <div class="archive-pending-summary-grid">

                    ${this.summary_card(
                        "all",
                        "كل العمليات",
                        "0"
                    )}

                    ${this.summary_card(
                        "under_action",
                        "تحت الإجراء",
                        "0"
                    )}

                    ${this.summary_card(
                        "partial",
                        "مرتجعة غير مكتملة",
                        "0"
                    )}

                    ${this.summary_card(
                        "complete",
                        "مرتجعة مكتملة",
                        "0"
                    )}

                </div>

                <div class="archive-pending-toolbar">

                    <div class="archive-pending-search-filter-group">

                        <div class="archive-pending-search-box">
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                aria-hidden="true"
                            >
                                <circle
                                    cx="11"
                                    cy="11"
                                    r="8"
                                ></circle>

                                <path
                                    d="m21 21-4.35-4.35"
                                ></path>
                            </svg>

                            <input
                                type="search"
                                class="archive-pending-search"
                                placeholder="بحث في المعلقات..."
                                autocomplete="off"
                                spellcheck="false"
                                aria-label="بحث في المعلقات"
                            >
                        </div>

                        <button
                            type="button"
                            class="
                                btn
                                btn-default
                                archive-pending-filter-button
                            "
                        >
                            الفلاتر
                        </button>

                    </div>

                    <div class="archive-pending-toolbar-actions">

                        <button
                            type="button"
                            class="
                                btn
                                btn-primary
                                archive-pending-create-button
                            "
                            style="display: none;"
                        >
                            إنشاء عملية معلقة
                        </button>

                        <button
                            type="button"
                            class="
                                btn
                                btn-default
                                archive-pending-refresh-button
                            "
                        >
                            تحديث
                        </button>

                    </div>

                </div>

                <div
                    class="archive-pending-active-filters"
                ></div>

                <div class="archive-pending-card">

                    <div class="archive-pending-list-header">

                        <div>
                            <div class="archive-pending-list-title">
                                العمليات المعلقة
                            </div>

                            <div class="archive-pending-list-subtitle">
                                بحث وفلترة وترتيب محلي ضمن النطاق المسموح
                            </div>
                        </div>

                        <div
                            class="archive-pending-result-count"
                            aria-live="polite"
                        >
                            0 عملية
                        </div>

                    </div>

                    <div
                        class="archive-pending-loading"
                        hidden
                    >
                        <div
                            class="archive-pending-loading-spinner"
                        ></div>

                        <span>
                            جارٍ تحميل المعلقات...
                        </span>
                    </div>

                    <div
                        class="
                            archive-pending-table-wrapper
                            generic-data-grid-scroll
                        "
                    >
                        <table
                            class="archive-pending-table"
                        >

                            <colgroup>
                                <col class="col-serial">
                                <col class="col-card-name">
                                <col class="col-card-number">
                                <col class="col-operation-datetime">
                                <col class="col-card-owner">
                                <col class="col-bank">
                                <col class="col-region">
                                <col class="col-machine-location">
                                <col class="col-machine-no">
                                <col class="col-branch-no">
                                <col class="col-representative">
                                <col class="col-total-suspended">
                                <col class="col-total-returned">
                                <col class="col-remaining-amount">
                                <col class="col-currency">
                                <col class="col-owner">
                                <col class="col-status">
                            </colgroup>

                            <thead>
                                <tr>

                                    ${this.sortable_header(
                                        "serial_no",
                                        "الرقم"
                                    )}

                                    ${this.sortable_header(
                                        "card_name",
                                        "اسم البطاقة"
                                    )}

                                    ${this.sortable_header(
                                        "card_number",
                                        "رقم البطاقة"
                                    )}

                                    ${this.sortable_header(
                                        "operation_datetime",
                                        "تاريخ العملية"
                                    )}

                                    ${this.sortable_header(
                                        "card_owner_name",
                                        "مالك البطاقة"
                                    )}

                                    ${this.sortable_header(
                                        "bank_name",
                                        "البنك"
                                    )}

                                    ${this.sortable_header(
                                        "region_name",
                                        "المنطقة"
                                    )}

                                    ${this.sortable_header(
                                        "machine_location",
                                        "موقع المكينة"
                                    )}

                                    ${this.sortable_header(
                                        "machine_no",
                                        "رقم المكينة"
                                    )}

                                    ${this.sortable_header(
                                        "branch_no",
                                        "رقم الفرع"
                                    )}

                                    ${this.sortable_header(
                                        "representative_name",
                                        "المندوب"
                                    )}

                                    ${this.sortable_header(
                                        "total_suspended",
                                        "إجمالي المعلق"
                                    )}

                                    ${this.sortable_header(
                                        "total_returned",
                                        "إجمالي المرتجع"
                                    )}

                                    ${this.sortable_header(
                                        "remaining_amount",
                                        "المتبقي"
                                    )}

                                    ${this.sortable_header(
                                        "currency",
                                        "العملة"
                                    )}

                                    ${this.sortable_header(
                                        "owner_full_name",
                                        "أنشأ بواسطة"
                                    )}

                                    ${this.sortable_header(
                                        "status",
                                        "الحالة"
                                    )}

                                </tr>
                            </thead>

                            <tbody
                                class="archive-pending-rows"
                            ></tbody>

                        </table>

                        <div
                            class="archive-pending-empty-state"
                            style="display: none;"
                        >

                            <div
                                class="archive-pending-empty-icon"
                            >
                                <svg
                                    width="30"
                                    height="30"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    aria-hidden="true"
                                >
                                    <path d="M3 6h18"></path>
                                    <path d="M5 6l1 14h12l1-14"></path>
                                    <path d="M9 10v6"></path>
                                    <path d="M15 10v6"></path>
                                </svg>
                            </div>

                            <h3
                                class="archive-pending-empty-title"
                            >
                                لا توجد عمليات معلقة
                            </h3>

                            <p
                                class="archive-pending-empty-message"
                            >
                                ستظهر العمليات هنا عند توفرها.
                            </p>

                        </div>

                    </div>

                    <div
                        class="archive-pending-pagination-host"
                    ></div>

                </div>

            </div>
        `);

        this.bind_events();
    }

    summary_card(
        status,
        label,
        value
    ) {
        const active =
            this.state.status === status
                ? "is-active"
                : "";

        return `
            <button
                type="button"
                class="
                    archive-pending-summary-card
                    ${active}
                "
                data-status="${frappe.utils.escape_html(
                    status
                )}"
                aria-pressed="${
                    active
                        ? "true"
                        : "false"
                }"
            >
                <span
                    class="archive-pending-summary-value"
                >
                    ${frappe.utils.escape_html(
                        String(value)
                    )}
                </span>

                <span
                    class="archive-pending-summary-label"
                >
                    ${frappe.utils.escape_html(
                        label
                    )}
                </span>
            </button>
        `;
    }

    sortable_header(
        field,
        label
    ) {
        return `
            <th
                class="generic-sortable-column"
                data-sort-field="${frappe.utils.escape_html(
                    field
                )}"
            >
                ${frappe.utils.escape_html(
                    label
                )}

                <span
                    class="generic-sort-indicator"
                ></span>
            </th>
        `;
    }

    async initialize() {
        await new Promise(
            (resolve) => {

                frappe.require(
                    [
                        "/assets/archive/js/shared/data_grid/core.js",
                        "/assets/archive/js/shared/data_grid/pagination.js",
                        "/assets/archive/css/shared/data_grid.css",

                        "/assets/archive/js/shared/data_grid/filters.js",
                        "/assets/archive/css/shared/data_grid_filters.css",
                        
                        "/assets/archive/js/archive_pending_operations/pending_attachment_manager.js",
                        "/assets/archive/css/archive_pending_operations/pending_attachment_manager.css",
                        
                        "/assets/archive/js/archive_pending_operations/pending_operation_dialog.js",
                        "/assets/archive/css/archive_pending_operations/pending_operation_dialog.css",
                        
                        "/assets/archive/css/archive_pending_operations/pending_ledger_correction_dialog.css",
                        "/assets/archive/js/archive_pending_operations/pending_ledger_correction_dialog.js",
                        
                        "/assets/archive/js/archive_pending_operations/pending_smart_autocomplete.js",
                        "/assets/archive/css/archive_pending_operations/pending_smart_autocomplete.css",
                        
                        "/assets/archive/js/archive_pending_operations/pending_operation_view_dialog.js",
                        "/assets/archive/css/archive_pending_operations/pending_operation_view_dialog.css",

                        "/assets/archive/js/archive_pending_operations/pending_operation_timeline_dialog.js",
                        "/assets/archive/css/archive_pending_operations/pending_operation_timeline_dialog.css",
                    ],
                    resolve
                );
            }
        );

        this.initialize_data_grid();
        this.initialize_filters();
        this.update_sort_indicators();

        await this.load_context();
    }

    initialize_data_grid() {
        this.data_source =
            new custom.data_grid
                .LocalDataSource({

                    id_field:
                        "name",

                    search_accessor:
                        (operation) =>
                            operation.search_text
                            || "",

                    search_tokenizer:
                        custom.data_grid
                            .utils
                            .get_search_tokens,

                    sorters: {

                        serial_no: {
                            type: "number",
                        },

                        card_name: {
                            type: "text",
                        },

                        card_number: {
                            type: "text",
                        },

                        /*
                         * نحافظ على الترتيب الافتراضي:
                         *
                         * operation_datetime DESC
                         * ثم creation DESC
                         * ثم serial_no DESC
                         *
                         * باستخدام Composite Sort Key.
                         */
                        operation_datetime: {
                            type: "text",

                            get:
                                (record) =>
                                    this
                                        .get_operation_datetime_sort_key(
                                            record
                                        ),
                        },

                        card_owner_name: {
                            type: "text",
                        },

                        bank_name: {
                            type: "text",
                        },

                        region_name: {
                            type: "text",
                        },

                        machine_location: {
                            type: "text",
                        },

                        machine_no: {
                            type: "text",
                        },

                        branch_no: {
                            type: "text",
                        },

                        representative_name: {
                            type: "text",
                        },

                        total_suspended: {
                            type: "number",
                        },

                        total_returned: {
                            type: "number",
                        },

                        remaining_amount: {
                            type: "number",
                        },

                        currency: {
                            type: "text",
                        },

                        owner_full_name: {
                            type: "text",
                        },

                        status: {
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
                                ".archive-pending-pagination-host"
                            ),

                    page_length:
                        "100",

                    storage_key:
                        "archive.pending_operations.page_length",

                    on_change:
                        async ({
                            page,
                            page_length,
                        }) => {

                            this.state.page =
                                page;

                            this.state.page_length =
                                page_length;

                            this.apply_local_query();

                            this.scroll_grid_to_top();
                        },
                });

        this.pagination.mount();

        this.state.page_length =
            this.pagination
                .get_state()
                .page_length;
    }

    initialize_filters() {
        const link_label =
            (map_name) =>
                (value) =>
                    this.get_filter_label(
                        map_name,
                        value
                    );

        this.filter_controller =
            new custom.data_grid
                .FilterController({

                    button:
                        $(this.wrapper)
                            .find(
                                ".archive-pending-filter-button"
                            ),

                    summary_container:
                        $(this.wrapper)
                            .find(
                                ".archive-pending-active-filters"
                            ),

                    data_source:
                        this.data_source,

                    title:
                        __("فلترة المعلقات"),

                    layout: [

                        {
                            title:
                                "بيانات العملية",

                            subtitle:
                                "التاريخ والبطاقة وبيانات المواقع",

                            fields: [
                                "operation_datetime",
                                "card_name",
                                "card_number",
                                "machine_location",
                                "machine_no",
                                "branch_no",
                            ],
                        },

                        {
                            title:
                                "الجهات والتصنيف",

                            subtitle:
                                "مالك البطاقة والبنك والمنطقة والمندوب والعملة",

                            fields: [
                                "card_owner",
                                "bank",
                                "region",
                                "representative",
                                "currency",
                            ],
                        },

                        {
                            title:
                                "القيم المالية",

                            subtitle:
                                "نطاقات المعلق والمرتجع والمتبقي",

                            fields: [
                                "total_suspended",
                                "total_returned",
                                "remaining_amount",
                            ],
                        },
                    ],

                    schema: [

                        {
                            field:
                                "operation_datetime",

                            label:
                                "تاريخ العملية",

                            type:
                                "date_range",
                        },

                        {
                            field:
                                "card_name",

                            label:
                                "اسم البطاقة",

                            type:
                                "text",
                        },

                        {
                            field:
                                "card_number",

                            label:
                                "رقم البطاقة",

                            type:
                                "text",
                        },

                        {
                            field:
                                "machine_location",

                            label:
                                "موقع المكينة",

                            type:
                                "text",
                        },

                        {
                            field:
                                "machine_no",

                            label:
                                "رقم المكينة",

                            type:
                                "text",
                        },

                        {
                            field:
                                "branch_no",

                            label:
                                "رقم الفرع",

                            type:
                                "text",
                        },

                        {
                            field:
                                "card_owner",

                            label:
                                "مالك البطاقة",

                            type:
                                "multi_select",

                            get_label:
                                link_label(
                                    "card_owner"
                                ),
                        },

                        {
                            field:
                                "bank",

                            label:
                                "البنك",

                            type:
                                "multi_select",

                            get_label:
                                link_label(
                                    "bank"
                                ),
                        },

                        {
                            field:
                                "region",

                            label:
                                "المنطقة",

                            type:
                                "multi_select",

                            get_label:
                                link_label(
                                    "region"
                                ),
                        },

                        {
                            field:
                                "representative",

                            label:
                                "المندوب",

                            type:
                                "multi_select",

                            get_label:
                                link_label(
                                    "representative"
                                ),
                        },

                        {
                            field:
                                "currency",

                            label:
                                "العملة",

                            type:
                                "multi_select",
                        },

                        {
                            field:
                                "total_suspended",

                            label:
                                "إجمالي المبلغ المعلق",

                            type:
                                "number_range",
                        },

                        {
                            field:
                                "total_returned",

                            label:
                                "إجمالي المرتجع",

                            type:
                                "number_range",
                        },

                        {
                            field:
                                "remaining_amount",

                            label:
                                "المبلغ المتبقي",

                            type:
                                "number_range",
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

        this.filter_controller.mount();
    }

    async load_context() {
        if (this.is_loading) {
            return false;
        }

        this.set_loading(
            true
        );

        try {
            const response =
                await frappe.call({

                    method:
                        "archive.api.pending_operations.get_pending_operations_context",

                    type:
                        "GET",
                });

            const result =
                response.message
                || {};

            const records =
                Array.isArray(
                    result.operations
                )
                    ? result.operations
                    : [];

            this.capabilities =
                result.capabilities
                || {};

            this.scope =
                result.scope
                || null;

            this.context_version =
                result.context_version
                || null;

            this.rebuild_label_maps(
                records
            );

            this.data_source
                .set_records(
                    records
                );

            this.state.page =
                1;

            this.update_scope_badge();
            this.update_access_ui();
            this.apply_local_query();

            return true;

        } catch (error) {
            console.error(
                "Pending operations context loading failed:",
                error
            );

            frappe.msgprint({

                title:
                    __("تعذر تحميل المعلقات"),

                message:
                    error?.message
                    ||
                    __(
                        "حدث خطأ أثناء تحميل بيانات المعلقات."
                    ),

                indicator:
                    "red",
            });

            return false;

        } finally {
            this.set_loading(
                false
            );
        }
    }

    set_loading(
        is_loading
    ) {
        this.is_loading =
            Boolean(
                is_loading
            );

        const $wrapper =
            $(this.wrapper);

        $wrapper
            .find(
                ".archive-pending-refresh-button"
            )
            .prop(
                "disabled",
                this.is_loading
            );

        $wrapper
            .find(
                ".archive-pending-loading"
            )
            .prop(
                "hidden",
                !this.is_loading
            );

        $wrapper
            .toggleClass(
                "is-pending-context-loading",
                this.is_loading
            );

        this.update_access_ui();
    }

    update_access_ui() {
        const can_view =
            Boolean(
                this.capabilities
                    ?.can_view
            );

        const can_create =
            Boolean(
                this.capabilities
                    ?.can_create
            );

        const query_enabled =
            can_view
            &&
            !this.is_loading;

        $(this.wrapper)
            .find(
                `
                    .archive-pending-search,
                    .archive-pending-filter-button
                `
            )
            .prop(
                "disabled",
                !query_enabled
            );

        $(this.wrapper)
            .find(
                ".archive-pending-summary-card"
            )
            .prop(
                "disabled",
                !query_enabled
            );

        $(this.wrapper)
            .find(
                ".archive-pending-create-button"
            )
            .toggle(
                can_create
            )
            .prop(
                "disabled",
                (
                    !can_create
                    ||
                    this.is_loading
                )
            );
    }

    update_scope_badge() {
        const $badge =
            $(this.wrapper)
                .find(
                    ".archive-pending-scope-badge"
                );

        $badge.removeClass(
            "is-own is-all is-none"
        );

        if (
            this.scope === "all"
        ) {
            $badge
                .addClass(
                    "is-all"
                )
                .text(
                    "جميع العمليات"
                );

            return;
        }

        if (
            this.scope === "own"
        ) {
            $badge
                .addClass(
                    "is-own"
                )
                .text(
                    "عملياتي فقط"
                );

            return;
        }

        $badge
            .addClass(
                "is-none"
            )
            .text(
                "بدون صلاحية عرض"
            );
    }

    rebuild_label_maps(
        records
    ) {
        Object
            .values(
                this.label_maps
            )
            .forEach(
                (map) =>
                    map.clear()
            );

        for (
            const record
            of records || []
        ) {

            this.remember_label(
                "card_owner",
                record.card_owner,
                record.card_owner_name
            );

            this.remember_label(
                "bank",
                record.bank,
                record.bank_name
            );

            this.remember_label(
                "region",
                record.region,
                record.region_name
            );

            this.remember_label(
                "representative",
                record.representative,
                record.representative_name
            );
        }
    }

    remember_label(
        map_name,
        value,
        label
    ) {
        const key =
            String(
                value || ""
            ).trim();

        if (!key) {
            return;
        }

        const text =
            String(
                label
                || value
                || ""
            ).trim();

        this.label_maps[
            map_name
        ]?.set(
            key,
            text || key
        );
    }

    get_filter_label(
        map_name,
        value
    ) {
        const key =
            String(
                value || ""
            ).trim();

        if (!key) {
            return "";
        }

        return (
            this.label_maps[
                map_name
            ]?.get(
                key
            )
            || key
        );
    }

    get_operation_datetime_sort_key(
        operation
    ) {
        const datetime =
            String(
                operation
                    ?.operation_datetime
                || ""
            );

        const creation =
            String(
                operation
                    ?.creation
                || ""
            );

        const serial =
            String(
                Number(
                    operation
                        ?.serial_no
                    || 0
                )
            ).padStart(
                20,
                "0"
            );

        return [
            datetime,
            creation,
            serial,
        ].join("|");
    }

    get_status_value(
        status
    ) {
        const statuses = {

            under_action:
                "تحت الإجراء",

            partial:
                "مرتجعة غير مكتملة",

            complete:
                "مرتجعة مكتملة",
        };

        return (
            statuses[status]
            || ""
        );
    }

    get_active_filters() {
        const filters = {
            ...(
                this.state
                    .advanced_filters
                || {}
            ),
        };

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
        ids
    ) {
        const counts = {

            all:
                0,

            "تحت الإجراء":
                0,

            "مرتجعة غير مكتملة":
                0,

            "مرتجعة مكتملة":
                0,
        };

        for (
            const id
            of ids || []
        ) {
            const operation =
                this.data_source
                    .records
                    .get(
                        id
                    );

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
        }

        return counts;
    }

    apply_local_query() {
        if (!this.data_source) {
            return;
        }

        const result =
            this.data_source
                .query({

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

        this.render_operations(
            this.operations
        );

        /*
         * Counts:
         *
         * search + advanced filters
         *
         * بدون Status Card الحالية.
         *
         * وبذلك إذا المستخدم داخل
         * "مرتجعة غير مكتملة"،
         * تبقى أعداد الحالات الأخرى ظاهرة.
         */
        const counts_result =
            this.data_source
                .query({

                    search:
                        this.state.search,

                    filters:
                        this.state
                            .advanced_filters
                        || {},

                    sort:
                        null,

                    page:
                        1,

                    page_length:
                        "all",
                });

        this.update_counts(
            this.get_local_counts(
                counts_result
                    .result_ids
            )
        );

        this.update_result_count(
            result.total_rows
        );

        this.pagination
            ?.update({

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

    update_counts(
        counts
    ) {
        const values = {

            all:
                counts.all
                || 0,

            under_action:
                counts[
                    "تحت الإجراء"
                ]
                || 0,

            partial:
                counts[
                    "مرتجعة غير مكتملة"
                ]
                || 0,

            complete:
                counts[
                    "مرتجعة مكتملة"
                ]
                || 0,
        };

        const $wrapper =
            $(this.wrapper);

        for (
            const [
                status,
                value,
            ]
            of Object.entries(
                values
            )
        ) {
            $wrapper
                .find(
                    `.archive-pending-summary-card[data-status="${status}"] .archive-pending-summary-value`
                )
                .text(
                    value
                );
        }
    }

    update_result_count(
        total
    ) {
        const number =
            Number(
                total || 0
            );

        $(this.wrapper)
            .find(
                ".archive-pending-result-count"
            )
            .text(
                number === 1
                    ? "1 عملية"
                    : `${number} عملية`
            );
    }

    render_operations(
        operations
    ) {
        const $wrapper =
            $(this.wrapper);

        const $tbody =
            $wrapper.find(
                ".archive-pending-rows"
            );

        const $empty =
            $wrapper.find(
                ".archive-pending-empty-state"
            );

        const $table =
            $wrapper.find(
                ".archive-pending-table"
            );

        if (
            !operations.length
        ) {
            $tbody.empty();

            $table.hide();

            this.update_empty_state();

            $empty.css(
                "display",
                "flex"
            );

            return;
        }

        $empty.hide();

        $table.show();

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
    }

    update_empty_state() {
        const $wrapper =
            $(this.wrapper);

        const $title =
            $wrapper.find(
                ".archive-pending-empty-title"
            );

        const $message =
            $wrapper.find(
                ".archive-pending-empty-message"
            );

        if (
            !this.capabilities
                ?.can_view
        ) {
            $title.text(
                "لا توجد صلاحية لعرض سجل المعلقات"
            );

            $message.text(
                "لا يتم تحميل أي سجل إلى المتصفح خارج نطاق صلاحياتك."
            );

            return;
        }

        const has_source_records =
            Boolean(
                this.data_source
                    ?.all_ids
                    ?.length
            );

        const has_query =
            Boolean(
                String(
                    this.state.search
                    || ""
                ).trim()
            )
            ||
            Boolean(
                Object.keys(
                    this.state
                        .advanced_filters
                    || {}
                ).length
            )
            ||
            this.state.status
                !== "all";

        if (
            has_source_records
            &&
            has_query
        ) {
            $title.text(
                "لا توجد نتائج مطابقة"
            );

            $message.text(
                "غيّر كلمات البحث أو الفلاتر أو بطاقة الحالة."
            );

            return;
        }

        $title.text(
            "لا توجد عمليات معلقة"
        );

        $message.text(
            "ستظهر العمليات هنا عند توفرها ضمن نطاق صلاحياتك."
        );
    }

    operation_row(
        operation
    ) {
        const status_class =
            this.get_status_class(
                operation.status
            );

        return `
            <tr
                class="
                    archive-pending-row
                    ${status_class}
                "
                data-name="${this.escape_value_attribute(
                    operation.name
                )}"
                tabindex="0"
                role="button"
                title="فتح العملية"
            >

                <td class="archive-pending-serial">
                    ${this.escape_value(
                        operation.serial_no
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.card_name
                    )}
                </td>

                <td class="archive-pending-card-number">
                    ${this.escape_value(
                        operation.card_number
                    )}
                </td>

                <td>
                    ${this.format_datetime(
                        operation.operation_datetime
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.card_owner_name
                        || operation.card_owner
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.bank_name
                        || operation.bank
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.region_name
                        || operation.region
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.machine_location
                    )}
                </td>

                <td class="archive-pending-code-cell">
                    ${this.escape_value(
                        operation.machine_no
                    )}
                </td>

                <td class="archive-pending-code-cell">
                    ${this.escape_value(
                        operation.branch_no
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.representative_name
                        || operation.representative
                    )}
                </td>

                <td class="archive-pending-money-cell">
                    ${this.format_amount(
                        operation.total_suspended
                    )}
                </td>

                <td class="archive-pending-money-cell">
                    ${this.format_amount(
                        operation.total_returned
                    )}
                </td>

                <td class="archive-pending-money-cell">
                    ${this.format_amount(
                        operation.remaining_amount
                    )}
                </td>

                <td class="archive-pending-currency-cell">
                    ${this.escape_value(
                        operation.currency
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.owner_full_name
                        || operation.owner
                    )}
                </td>

                <td>
                    <span
                        class="
                            archive-pending-status
                            ${status_class}
                        "
                    >
                        ${this.escape_value(
                            operation.status
                        )}
                    </span>
                </td>

            </tr>
        `;
    }

    get_status_class(
        status
    ) {
        const classes = {

            "تحت الإجراء":
                "status-under-action",

            "مرتجعة غير مكتملة":
                "status-partial",

            "مرتجعة مكتملة":
                "status-complete",
        };

        return (
            classes[status]
            || "status-under-action"
        );
    }

    change_sort(
        field
    ) {
        if (!field) {
            return;
        }

        if (
            this.state.sort
                ?.field
            === field
        ) {
            this.state
                .sort
                .direction =
                    this.state
                        .sort
                        .direction
                    === "asc"
                        ? "desc"
                        : "asc";

        } else {
            this.state.sort = {
                field:
                    field,

                direction:
                    "asc",
            };
        }

        this.state.page =
            1;

        this.apply_local_query();

        this.scroll_grid_to_top();
    }

    update_sort_indicators() {
        $(this.wrapper)
            .find(
                ".generic-sortable-column"
            )
            .each(
                (
                    index,
                    element
                ) => {

                    const $header =
                        $(element);

                    const field =
                        $header.data(
                            "sort-field"
                        );

                    const $indicator =
                        $header.find(
                            ".generic-sort-indicator"
                        );

                    if (
                        this.state.sort
                            ?.field
                        === field
                    ) {
                        const direction =
                            this.state
                                .sort
                                .direction;

                        $indicator.text(
                            direction === "asc"
                                ? "↑"
                                : "↓"
                        );

                        $header.attr(
                            "aria-sort",
                            direction === "asc"
                                ? "ascending"
                                : "descending"
                        );

                    } else {
                        $indicator.text(
                            "↕"
                        );

                        $header.removeAttr(
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

        if (element) {
            element.scrollTop =
                0;
        }
    }

    bind_events() {
        const $wrapper =
            $(this.wrapper);

        $wrapper
            .find(
                ".archive-pending-summary-card"
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
                        !status
                        ||
                        this.state.status
                        === status
                    ) {
                        return;
                    }

                    this.state.status =
                        status;

                    this.state.page =
                        1;

                    $wrapper
                        .find(
                            ".archive-pending-summary-card"
                        )
                        .removeClass(
                            "is-active"
                        )
                        .attr(
                            "aria-pressed",
                            "false"
                        );

                    $(event.currentTarget)
                        .addClass(
                            "is-active"
                        )
                        .attr(
                            "aria-pressed",
                            "true"
                        );

                    this.apply_local_query();

                    this.scroll_grid_to_top();
                }
            );

        $wrapper
            .find(
                ".archive-pending-search"
            )
            .on(
                "input",
                (event) => {

                    this.state.search =
                        event.target.value;

                    this.state.page =
                        1;

                    if (
                        this.search_frame
                    ) {
                        cancelAnimationFrame(
                            this.search_frame
                        );
                    }

                    this.search_frame =
                        requestAnimationFrame(
                            () => {

                                this.search_frame =
                                    null;

                                this.apply_local_query();
                            }
                        );
                }
            );

        $wrapper
            .find(
                ".generic-sortable-column"
            )
            .on(
                "click",
                (event) => {

                    this.change_sort(
                        $(event.currentTarget)
                            .data(
                                "sort-field"
                            )
                    );
                }
            );
        
        $wrapper
            .find(
                ".archive-pending-create-button"
            )
            .on(
                "click",
                () => {
                    this.open_create_dialog();
                }
            );

        $wrapper
            .find(
                ".archive-pending-refresh-button"
            )
            .on(
                "click",
                async () => {

                    const loaded =
                        await this
                            .load_context();

                    if (loaded) {
                        frappe.show_alert({

                            message:
                                __(
                                    "تم تحديث المعلقات"
                                ),

                            indicator:
                                "green",
                        });
                    }
                }
            );
        
        $wrapper
            .find(
                ".archive-pending-rows"
            )
            .on(
                "click",
                ".archive-pending-row",
                (event) => {
                    if (
                        window
                            .getSelection()
                            ?.toString()
                    ) {
                        return;
                    }

                    this.open_operation(
                        $(event.currentTarget)
                            .data(
                                "name"
                            )
                    );
                }
            );

        $wrapper
            .find(
                ".archive-pending-rows"
            )
            .on(
                "keydown",
                ".archive-pending-row",
                (event) => {
                    if (
                        event.key !== "Enter"
                        &&
                        event.key !== " "
                    ) {
                        return;
                    }

                    event.preventDefault();

                    this.open_operation(
                        $(event.currentTarget)
                            .data(
                                "name"
                            )
                    );
                }
            );
    }
    
    open_create_dialog() {
        if (
            !this.capabilities
                ?.can_create
        ) {
            frappe.msgprint({
                title:
                    __("غير مسموح"),

                message:
                    __(
                        "ليس لديك صلاحية إنشاء عملية معلقة."
                    ),

                indicator:
                    "red",
            });

            return;
        }

        if (
            !window
                .ArchivePendingOperationDialog
        ) {
            frappe.msgprint({
                title:
                    __("تعذر فتح شاشة الإنشاء"),

                message:
                    __(
                        "لم يتم تحميل مكوّن إنشاء العملية المعلقة."
                    ),

                indicator:
                    "red",
            });

            return;
        }

        const create_dialog =
            new window
                .ArchivePendingOperationDialog({

                    on_created:
                        async (
                            operation
                        ) => {

                            await this
                                .load_context();

                            frappe.show_alert({
                                message:
                                    __(
                                        `تم إنشاء العملية ${operation.name}`
                                    ),

                                indicator:
                                    "green",
                            });
                        },
                });

        create_dialog.show();
    }

    escape_value(
        value
    ) {
        if (
            value === null
            ||
            value === undefined
            ||
            value === ""
        ) {
            return "—";
        }

        return frappe.utils
            .escape_html(
                String(value)
                    .trim()
            );
    }

    escape_value_attribute(
        value
    ) {
        if (
            value === null
            ||
            value === undefined
        ) {
            return "";
        }

        return frappe.utils
            .escape_html(
                String(value)
            );
    }

    format_amount(
        value
    ) {
        if (
            value === null
            ||
            value === undefined
            ||
            value === ""
        ) {
            return "—";
        }

        const number =
            Number(value);

        if (
            !Number.isFinite(
                number
            )
        ) {
            return this.escape_value(
                value
            );
        }

        /*
         * لا نفرض decimal places لعملة معينة هنا.
         * النظام Multi-Currency والـBackend هو صاحب
         * Precision الحقيقي.
         *
         * نظهر القيمة بدون إسقاط منازل عشرية صالحة.
         */
        return new Intl
            .NumberFormat(
                "en-US",
                {
                    minimumFractionDigits:
                        0,

                    maximumFractionDigits:
                        9,

                    useGrouping:
                        true,
                }
            )
            .format(
                number
            );
    }

    format_datetime(
        value
    ) {
        if (!value) {
            return "—";
        }

        try {
            return frappe.datetime
                .str_to_user(
                    value
                );

        } catch (error) {
            return this.escape_value(
                value
            );
        }
    }
}