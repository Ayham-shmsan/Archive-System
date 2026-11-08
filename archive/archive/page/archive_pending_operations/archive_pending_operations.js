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

            selected_operation_name:
                null,
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

        this.hidden_columns =
            this.load_hidden_columns();

        this.make_page();
        this.render();
        this.initialize();
    }

    get_column_visibility_storage_key() {
        const user = String(
            frappe.session?.user
            || "Guest"
        ).trim();

        return (
            "archive.pending.hidden_columns.v1:"
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
                        (field) => {
                            const normalized =
                                String(
                                    field || ""
                                ).trim();
                            return normalized === "remaining-amount"
                                ? "remaining_amount"
                                : normalized;
                        }
                    )
                    .filter(Boolean)
            );

        } catch (error) {
            console.warn(
                "Could not load Archive Pending Operations column preferences:",
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
                "Could not save Archive Pending Operations column preferences:",
                error
            );
        }
    }

    get_pending_column_definitions() {
        const columns = [];

        $(this.wrapper)
            .find(
                ".archive-pending-table thead th[data-sort-field]"
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
                .get_pending_column_definitions();

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
                    ".archive-pending-columns-button"
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

    apply_column_visibility() {
        const $table =
            $(this.wrapper)
                .find(
                    ".archive-pending-table"
                );

        if (!$table.length) {
            return;
        }

        const columns =
            this
                .get_pending_column_definitions();

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

        const hidden =
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

        let first_visible_index =
            null;

        for (
            const column
            of columns
        ) {
            const is_hidden =
                hidden.has(
                    column.field
                );

            if (
                !is_hidden
                &&
                first_visible_index
                === null
            ) {
                first_visible_index =
                    column.index;
            }

            $table
                .find(
                    `colgroup col:nth-child(${column.index})`
                )
                .toggle(
                    !is_hidden
                );

            $table
                .find(
                    `thead th:nth-child(${column.index})`
                )
                .toggle(
                    !is_hidden
                );

            $table
                .find(
                    `tbody tr td:nth-child(${column.index})`
                )
                .toggle(
                    !is_hidden
                );
        }

        $table
            .find(
                "tbody .archive-pending-row > td"
            )
            .removeClass(
                "is-first-visible-column"
            );

        if (
            first_visible_index
            !== null
        ) {
            $table
                .find(
                    `tbody .archive-pending-row > td:nth-child(${first_visible_index})`
                )
                .addClass(
                    "is-first-visible-column"
                );
        }

        this
            .update_column_visibility_button();
    }

    render_columns_menu_html() {
        const columns =
            this
                .get_pending_column_definitions();

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
                        lookup_rows:
                            this
                                .get_card_account_lookup_rows(),

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
                        <span class="archive-pending-brand-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
                                <path d="M3 3v5h5"/>
                                <path d="M12 7v5l3 2"/>
                            </svg>
                        </span>
                        <div class="archive-pending-title-col">
                            <h1>شاشة المعلقات</h1>
                            <p>
                                إدارة ومتابعة العمليات المعلقة والإرجاعات
                            </p>
                        </div>
                    </div>

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

                </div>

                <div class="archive-pending-summary-grid">

                    ${this.summary_card(
                        "all",
                        "كل المعلقات",
                        "0"
                    )}

                    ${this.summary_card(
                        "under_action",
                        "تحت الإجراء",
                        "0"
                    )}

                    ${this.summary_card(
                        "partial",
                        "معلقة غير مكتملة",
                        "0"
                    )}

                    ${this.summary_card(
                        "complete",
                        "معلقة مكتملة",
                        "0"
                    )}

                    ${this.summary_card(
                        "failed",
                        "معلقة فاشلة",
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
                                type="text"
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
                                ac-tb-btn
                                archive-pending-filter-button
                            "
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></span>
                            <span class="ac-tb-label">الفلاتر</span>
                        </button>

                        <div class="archive-cards-dropdown-wrap">
                            <button
                                type="button"
                                class="
                                    btn
                                    btn-default
                                    ac-tb-btn
                                    archive-pending-columns-button
                                "
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

                    <div class="archive-pending-toolbar-actions">

                        <button
                            type="button"
                            class="
                                btn
                                btn-default
                                ac-tb-btn
                                archive-pending-selected-view
                            "
                            disabled
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.06 12.35a1 1 0 0 1 0-.7C3.42 7.51 7.36 4.5 12 4.5s8.58 3.01 9.94 7.15a1 1 0 0 1 0 .7C20.58 16.49 16.64 19.5 12 19.5s-8.58-3.01-9.94-7.15Z"/><circle cx="12" cy="12" r="3"/></svg></span>
                            <span class="ac-tb-label">عرض</span>
                        </button>

                        <button
                            type="button"
                            class="
                                btn
                                btn-default
                                ac-tb-btn
                                archive-pending-timeline-button
                            "
                            disabled
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/></svg></span>
                            <span class="ac-tb-label">مسار العملية</span>
                        </button>

                        <span class="ac-tb-divider" aria-hidden="true"></span>

                        <button
                            type="button"
                            class="
                                btn
                                btn-default
                                ac-tb-btn
                                ac-tb-btn--primary
                                archive-pending-selected-actions
                            "
                            disabled
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="7" y2="6"/><line x1="11" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="13" y2="12"/><line x1="17" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2"/></svg></span>
                            <span class="ac-tb-label">إجراء</span>
                        </button>

                        <button
                            type="button"
                            class="
                                btn
                                btn-default
                                ac-tb-btn
                                archive-pending-close-toggle
                            "
                            style="display: none;"
                            disabled
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg></span>
                            <span
                                class="
                                    ac-tb-label
                                    archive-pending-close-toggle-label
                                "
                            >
                                إنهاء العملية
                            </span>
                        </button>

                        <button
                            type="button"
                            class="
                                btn
                                btn-default
                                ac-tb-btn
                                ac-tb-btn--refresh
                                archive-pending-refresh-button
                            "
                            title="تحديث"
                        >
                            <span class="ac-tb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-15.5-6.36L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.36L21 16"/><path d="M21 21v-5h-5"/></svg></span>
                            <span class="ac-tb-label">تحديث</span>
                        </button>

                    </div>

                </div>

                <div
                    class="archive-cards-filters-drawer archive-pending-filters-drawer"
                    data-role="filters-drawer"
                    hidden
                ></div>

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
                               عرض وإدارة جميع المعلقات المسجلة
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
                                <col class="col-bank">
                                <col class="col-card-name">
                                <col class="col-account-number">
                                <col class="col-card-number">
                                <col class="col-total-suspended">
                                <col class="col-operation-datetime">
                                <col class="col-suspended-note">
                                <col class="col-representative">
                                <col class="col-card-owner">
                                <col class="col-region">
                                <col class="col-branch-no">
                                <col class="col-machine-no">
                                <col class="col-machine-location">
                                <col class="col-total-returned">
                                <col class="col-remaining-amount">
                                <col class="col-creation-time">
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
                                        "bank_name",
                                        "البنك"
                                    )}

                                    ${this.sortable_header(
                                        "card_name",
                                        "اسم البطاقة"
                                    )}
                                    ${this.sortable_header(
                                        "account_number",
                                        "رقم الحساب"
                                    )}

                                    ${this.sortable_header(
                                        "card_number",
                                        "رقم البطاقة"
                                    )}

                                    ${this.sortable_header(
                                        "total_suspended",
                                        "إجمالي المعلق"
                                    )}

                                    ${this.sortable_header(
                                        "operation_datetime",
                                        "تاريخ المعلق"
                                    )}
                                    ${this.sortable_header(
                                        "suspended_note",
                                        "ملاحظات المعلق"
                                    )}

                                    ${this.sortable_header(
                                        "representative_name",
                                        "المندوب"
                                    )}

                                    ${this.sortable_header(
                                        "card_owner_name",
                                        "مالك البطاقة"
                                    )}

                                    ${this.sortable_header(
                                        "region_name",
                                        "المنطقة"
                                    )}

                                    ${this.sortable_header(
                                        "branch_no",
                                        "رقم الفرع"
                                    )}

                                    ${this.sortable_header(
                                        "machine_no",
                                        "رقم المكينة"
                                    )}

                                    ${this.sortable_header(
                                        "machine_location",
                                        "العنوان"
                                    )}

                                    ${this.sortable_header(
                                        "total_returned",
                                        "إجمالي المرتجع"
                                    )}

                                    ${this.sortable_header(
                                        "remaining_amount",
                                        "المبلغ المتبقي"
                                    )}

                                    ${this.sortable_header(
                                        "creation",
                                        "وقت الإدخال"
                                    )}

                                    ${this.sortable_header(
                                        "owner_full_name",
                                        "اسم المستخدم"
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
        this.apply_column_visibility();
        this.update_sort_indicators();
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

        const meta = {
            all: {
                desc: "جميع المعلقات في النظام",
                icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 12 12 17 22 12"></polyline><polyline points="2 17 12 22 22 17"></polyline></svg>`,
            },
            under_action: {
                desc: "معلقات قيد المعالجة",
                icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>`,
            },
            partial: {
                desc: "معلقات تحتاج استكمال البيانات",
                icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="11" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>`,
            },
            complete: {
                desc: "معلقات مكتملة وجاهزة",
                icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><polyline points="8.5 12.5 11 15 15.5 9.5"></polyline></svg>`,
            },
            failed: {
                desc: "معلقات تعذر تنفيذها",
                icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="12.5"></line><circle cx="12" cy="16" r="0.6" fill="currentColor"></circle></svg>`,
            },
        }[status] || { desc: "", icon: "" };

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
                <div class="archive-pending-summary-icon">
                    ${meta.icon}
                </div>

                <span
                    class="archive-pending-summary-label"
                >
                    ${frappe.utils.escape_html(
                        label
                    )}
                </span>

                <span
                    class="archive-pending-summary-value"
                >
                    ${frappe.utils.escape_html(
                        String(value)
                    )}
                </span>

                <div class="archive-pending-summary-desc">
                    ${meta.desc}
                </div>
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

                        bank_name: {
                            type: "text",
                            get: (record) =>
                                record?.bank_name
                                || record?.bank
                                || "",
                        },

                        card_name: {
                            type: "text",
                        },
                        account_number: {
                            type: "text",
                        },

                        card_number: {
                            type: "text",
                        },

                        total_suspended: {
                            type: "number",
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
                        creation: {
                            type: "text",
                            get: (record) =>
                                String(
                                    record?.creation
                                    || ""
                                ),
                        },
                        suspended_note: {
                            type: "text",
                        },

                        representative_name: {
                            type: "text",
                            get: (record) =>
                                record?.representative_name
                                || record?.representative
                                || "",
                        },

                        card_owner_name: {
                            type: "text",
                            get: (record) =>
                                record?.card_owner_name
                                || record?.card_owner
                                || "",
                        },

                        region_name: {
                            type: "text",
                            get: (record) =>
                                record?.region_name
                                || record?.region
                                || "",
                        },

                        branch_no: {
                            type: "text",
                        },

                        machine_no: {
                            type: "text",
                        },

                        machine_location: {
                            type: "text",
                        },

                        total_returned: {
                            type: "number",
                        },

                        remaining_amount: {
                            type: "number",
                        },


                        owner_full_name: {
                            type: "text",
                            get: (record) =>
                                record?.owner_full_name
                                || record?.owner
                                || "",
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

                    drawer_container:
                        $(this.wrapper)
                            .find(
                                '[data-role="filters-drawer"]'
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
                                "account_number",
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
                                "مالك البطاقة والبنك والمنطقة والمندوب",

                            fields: [
                                "card_owner",
                                "bank",
                                "region",
                                "representative",
                                
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
                                "account_number",

                            label:
                                "رقم الحساب",

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
                                "العنوان",

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
        this.update_selected_actions();
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
                    .archive-pending-filter-button,
                    .archive-pending-columns-button
                `
            )
            .prop(
                "disabled",
                !query_enabled
            );

        if (!query_enabled) {
            $(this.wrapper)
                .find('[data-role="columns-menu"]')
                .prop("hidden", true);
        }

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

    // get_status_value(
    //     status
    // ) {
    //     const statuses = {

    //         under_action:
    //             "تحت الإجراء",

    //         partial:
    //             "مرتجعة غير مكتملة",

    //         complete:
    //             "مرتجعة مكتملة",
    //     };

    //     return (
    //         statuses[status]
    //         || ""
    //     );
    // }

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

                failed:
                    "معلقة فاشلة",
            };

            return (
                statuses[
                    status
                ]
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

                "معلقة فاشلة":
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
        
        if (
            this.state
                .selected_operation_name
            &&
            !this.operations
                .some(
                    (
                        operation
                    ) =>
                        operation.name
                        ===
                        this.state
                            .selected_operation_name
                )
        ) {
            this.state
                .selected_operation_name =
                    null;
        }


        this.render_operations(
            this.operations
        );

        this.update_selected_actions();

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

            failed:
                counts[
                    "معلقة فاشلة"
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

            this.apply_column_visibility();

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

        this.apply_column_visibility();
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
        const is_closed =
            this.is_operation_closed(
                operation
            );

        const closed_class =
            is_closed
                ? "is-closed"
                : "";
        const selected_class =
            this.state
                .selected_operation_name
            === operation.name
                ? "is-selected"
                : "";

        return `
            <tr
                class="
                        archive-pending-row
                        ${status_class}
                        ${closed_class}
                        ${selected_class}
                    "
                data-name="${this.escape_value_attribute(
                    operation.name
                )}"
                tabindex="0"
                role="button"
                title="تحديد العملية"
            >

                <td class="archive-pending-serial">
                    ${this.escape_value(
                        operation.serial_no
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
                        operation.card_name
                    )}
                </td>

                <td
                    class="
                        archive-pending-code-cell
                        archive-pending-account-number
                    "
                >
                    ${this.escape_value(
                        operation.account_number
                    )}
                </td>

                <td class="archive-pending-card-number">
                    ${this.escape_value(
                        operation.card_number
                    )}
                </td>

                <td class="archive-pending-money-cell">
                    ${this.format_amount(
                        operation.total_suspended
                    )}ر.س
                </td>

                <td dir="rtl">
                    ${this.format_datetime(
                        operation.operation_datetime
                    )}
                </td>

                <td
                    class="
                        archive-pending-suspended-note-cell
                    "
                    title="${this.escape_value_attribute(
                        operation.suspended_note
                        || ""
                    )}"
                >
                    <span
                        class="
                            archive-pending-suspended-note
                        "
                    >
                        ${this.escape_value(
                            operation.suspended_note
                        )}
                    </span>
                </td>

                <td>
                    ${this.escape_value(
                        operation.representative_name
                        || operation.representative
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
                        operation.region_name
                        || operation.region
                    )}
                </td>

                <td class="archive-pending-code-cell">
                    ${this.escape_value(
                        operation.branch_no
                    )}
                </td>

                <td class="archive-pending-code-cell">
                    ${this.escape_value(
                        operation.machine_no
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.machine_location
                    )}
                </td>

                <td class="archive-pending-money-cell">
                    ${this.format_amount(
                        operation.total_returned
                    )}ر.س
                </td>

                <td class="archive-pending-money-cell">
                    ${this.format_amount(
                        operation.remaining_amount
                    )}ر.س
                </td>

                <td dir="rtl">
                    ${this.format_datetime(
                        operation.creation
                    )}
                </td>

                <td>
                    ${this.escape_value(
                        operation.owner_full_name
                        || operation.owner
                    )}
                </td>

                <td
                    class="
                        archive-pending-status-cell
                    "
                >
                    <div
                        class="
                            archive-pending-status-stack
                        "
                    >
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

                        ${
                            is_closed
                                ? `
                                    <span
                                        class="
                                            archive-pending-closed-badge
                                        "
                                    >
                                        منتهية
                                    </span>
                                `
                                : ""
                        }
                    </div>
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

                "معلقة فاشلة":
                    "status-failed",
            };

            return (
                classes[
                    status
                ]
                || "status-under-action"
            );
        }
    
    select_operation(
        operation_name
    ) {
        operation_name =
            String(
                operation_name
                || ""
            ).trim();

        if (
            !operation_name
        ) {
            return;
        }

        this.state
            .selected_operation_name =
                operation_name;

        const $wrapper =
            $(this.wrapper);

        $wrapper
            .find(
                ".archive-pending-row"
            )
            .removeClass(
                "is-selected"
            );

        $wrapper
            .find(
                ".archive-pending-row"
            )
            .filter(
                (
                    index,
                    element
                ) => (
                    String(
                        $(element)
                            .data(
                                "name"
                            )
                    )
                    ===
                    operation_name
                )
            )
            .addClass(
                "is-selected"
            );

        this.update_selected_actions();
    }


    get_selected_operation() {
        const name =
            this.state
                .selected_operation_name;

        if (
            !name
        ) {
            return null;
        }

        return (
            this.operations
                .find(
                    (
                        operation
                    ) =>
                        operation.name
                        === name
                )
            || null
        );
    }


    // can_mark_operation_failed(
    //     operation
    // ) {
    //     if (
    //         !operation
    //         ||
    //         operation.is_failed
    //     ) {
    //         return false;
    //     }

    //     if (
    //         this.capabilities
    //             ?.can_edit_all
    //     ) {
    //         return true;
    //     }

    //     return Boolean(
    //         this.capabilities
    //             ?.can_edit_own
    //         &&
    //         operation.owner
    //             === frappe.session.user
    //     );
    // }
    // can_mark_operation_failed(
    //         operation
    //     ) {
    //         if (
    //             !operation
    //             ||
    //             operation.is_failed
    //             ||
    //             operation.status
    //                 === "مرتجعة مكتملة"
    //         ) {
    //             return false;
    //         }

    //         if (
    //             this.capabilities
    //                 ?.can_edit_all
    //         ) {
    //             return true;
    //         }

    //         return Boolean(
    //             this.capabilities
    //                 ?.can_edit_own
    //             &&
    //             operation.owner
    //                 === frappe.session.user
    //         );
    //     }
    is_operation_closed(
        operation
    ) {
        return (
            Number(
                operation
                    ?.is_closed
                || 0
            )
            === 1
        );
    }


    is_operation_failed(
        operation
    ) {
        return (
            Number(
                operation
                    ?.is_failed
                || 0
            )
            === 1
            ||
            operation
                ?.status
            === "معلقة فاشلة"
        );
    }


    can_edit_operation(
        operation
    ) {
        if (!operation) {
            return false;
        }

        if (
            this.capabilities
                ?.can_edit_all
        ) {
            return true;
        }

        return Boolean(
            this.capabilities
                ?.can_edit_own
            &&
            operation.owner
                === frappe.session.user
        );
    }


    can_close_operation(
        operation
    ) {
        if (
            !operation
            ||
            this.is_operation_closed(
                operation
            )
            ||
            operation.status
                === "مرتجعة مكتملة"
        ) {
            return false;
        }

        return Boolean(
            this.capabilities
                ?.can_close_reopen
        );
    }


    can_reopen_operation(
        operation
    ) {
        if (
            !operation
            ||
            !this.is_operation_closed(
                operation
            )
        ) {
            return false;
        }

        return Boolean(
            this.capabilities
                ?.can_close_reopen
        );
    }


    can_mark_operation_failed(
        operation
    ) {
        if (
            !operation
            ||
            this.is_operation_failed(
                operation
            )
            ||
            this.is_operation_closed(
                operation
            )
            ||
            operation.status
                === "مرتجعة مكتملة"
        ) {
            return false;
        }

        return Boolean(
            this.capabilities
                ?.can_change_failure_status
        );
    }

    can_revert_operation_failed(
        operation
    ) {
        if (
            !operation
            ||
            !this.is_operation_failed(
                operation
            )
            ||
            this.is_operation_closed(
                operation
            )
        ) {
            return false;
        }

        return Boolean(
            this.capabilities
                ?.can_change_failure_status
        );
    }


    
    // update_selected_actions() {
    //     const selected =
    //         this.get_selected_operation();

    //     const has_selected =
    //         Boolean(
    //             selected
    //             &&
    //             !this.is_loading
    //         );

    //     const is_closed =
    //         has_selected
    //         &&
    //         this.is_operation_closed(
    //             selected
    //         );

    //     const can_close =
    //         has_selected
    //         &&
    //         this.can_close_operation(
    //             selected
    //         );

    //     const can_reopen =
    //         has_selected
    //         &&
    //         this.can_reopen_operation(
    //             selected
    //         );


    //     // ---------------------------------------------------------
    //     // عرض
    //     // ---------------------------------------------------------

    //     $(this.wrapper)
    //         .find(
    //             ".archive-pending-selected-view"
    //         )
    //         .prop(
    //             "disabled",
    //             !has_selected
    //         );


    //     // ---------------------------------------------------------
    //     // Timeline
    //     // ---------------------------------------------------------

    //     $(this.wrapper)
    //         .find(
    //             ".archive-pending-timeline-button"
    //         )
    //         .prop(
    //             "disabled",
    //             !has_selected
    //         );


    //     // ---------------------------------------------------------
    //     // إجراء → معلقة فاشلة
    //     // ---------------------------------------------------------

    //     $(this.wrapper)
    //         .find(
    //             ".archive-pending-selected-actions"
    //         )
    //         .prop(
    //             "disabled",
    //             (
    //                 this.is_loading
    //                 ||
    //                 !this
    //                     .can_mark_operation_failed(
    //                         selected
    //                     )
    //             )
    //         );


    //     // ---------------------------------------------------------
    //     // إنهاء / إلغاء الإنهاء
    //     // ---------------------------------------------------------

    //     const $closure_button =
    //         $(this.wrapper)
    //             .find(
    //                 ".archive-pending-close-toggle"
    //             );

    //     const show_closure_button =
    //         Boolean(
    //             can_close
    //             ||
    //             can_reopen
    //         );

    //     $closure_button
    //         .toggle(
    //             show_closure_button
    //         )
    //         .prop(
    //             "disabled",
    //             (
    //                 this.is_loading
    //                 ||
    //                 !show_closure_button
    //             )
    //         )
    //         .toggleClass(
    //             "is-reopen",
    //             Boolean(
    //                 is_closed
    //             )
    //         );

    //     $closure_button
    //         .find(
    //             ".archive-pending-close-toggle-label"
    //         )
    //         .text(
    //             is_closed
    //                 ? "إلغاء الإنهاء"
    //                 : "إنهاء العملية"
    //         );

    //     $closure_button
    //         .find(
    //             "i"
    //         )
    //         .attr(
    //             "class",
    //             is_closed
    //                 ? "fa fa-undo"
    //                 : "fa fa-check-circle"
    //         );
    // }
    // update_selected_actions() {
    //     const selected =
    //         this.get_selected_operation();

    //     const has_selected =
    //         Boolean(
    //             selected
    //             &&
    //             !this.is_loading
    //         );

    //     const is_closed =
    //         has_selected
    //         &&
    //         this.is_operation_closed(
    //             selected
    //         );

    //     const is_failed =
    //         has_selected
    //         &&
    //         this.is_operation_failed(
    //             selected
    //         );

    //     const can_close =
    //         has_selected
    //         &&
    //         this.can_close_operation(
    //             selected
    //         );

    //     const can_reopen =
    //         has_selected
    //         &&
    //         this.can_reopen_operation(
    //             selected
    //         );

    //     const can_mark_failed =
    //         has_selected
    //         &&
    //         this.can_mark_operation_failed(
    //             selected
    //         );

    //     const can_revert_failed =
    //         has_selected
    //         &&
    //         this.can_revert_operation_failed(
    //             selected
    //         );
    //     const is_under_action =
    //         has_selected
    //         &&
    //         selected.status
    //             === "تحت الإجراء";

    //     // ---------------------------------------------------------
    //     // عرض
    //     // ---------------------------------------------------------

    //     $(this.wrapper)
    //         .find(
    //             ".archive-pending-selected-view"
    //         )
    //         .prop(
    //             "disabled",
    //             !has_selected
    //         );


    //     // ---------------------------------------------------------
    //     // مسار العملية
    //     // ---------------------------------------------------------

    //     $(this.wrapper)
    //         .find(
    //             ".archive-pending-timeline-button"
    //         )
    //         .prop(
    //             "disabled",
    //             !has_selected
    //         );


    //     // ---------------------------------------------------------
    //     // إجراء / إلغاء الفشل
    //     // ---------------------------------------------------------

    //     // const $action_button =
    //     //     $(this.wrapper)
    //     //         .find(
    //     //             ".archive-pending-selected-actions"
    //     //         );

    //     // $action_button
    //     //     .prop(
    //     //         "disabled",
    //     //         (
    //     //             this.is_loading
    //     //             ||
    //     //             !(
    //     //                 can_mark_failed
    //     //                 ||
    //     //                 can_revert_failed
    //     //             )
    //     //         )
    //     //     )
    //     //     .toggleClass(
    //     //         "is-revert-failed",
    //     //         Boolean(
    //     //             is_failed
    //     //             &&
    //     //             can_revert_failed
    //     //         )
    //     //     )
    //     //     .text(
    //     //         is_failed
    //     //             ? "إلغاء الفشل"
    //     //             : "إجراء"
    //     //     )
    //     //     .attr(
    //     //         "title",
    //     //         is_failed
    //     //             ? "إلغاء تحويل العملية إلى فاشلة"
    //     //             : "إجراء على العملية"
    //     //     );
    //     const $action_button =
    //         $(this.wrapper)
    //             .find(
    //                 ".archive-pending-selected-actions"
    //             );

    //     const show_action_button =
    //         Boolean(
    //             !is_under_action
    //             &&
    //             (
    //                 can_mark_failed
    //                 ||
    //                 can_revert_failed
    //             )
    //         );

    //     $action_button
    //         .toggle(
    //             show_action_button
    //         )
    //         .prop(
    //             "disabled",
    //             (
    //                 this.is_loading
    //                 ||
    //                 !show_action_button
    //             )
    //         )
    //         .toggleClass(
    //             "is-revert-failed",
    //             Boolean(
    //                 is_failed
    //                 &&
    //                 can_revert_failed
    //             )
    //         )
    //         .text(
    //             is_failed
    //                 ? "إلغاء الفشل"
    //                 : "إجراء"
    //         )
    //         .attr(
    //             "title",
    //             is_failed
    //                 ? "إلغاء تحويل العملية إلى فاشلة"
    //                 : "إجراء على العملية"
    //         );


    //     // ---------------------------------------------------------
    //     // إنهاء / إلغاء الإنهاء
    //     // ---------------------------------------------------------

    //     const $closure_button =
    //         $(this.wrapper)
    //             .find(
    //                 ".archive-pending-close-toggle"
    //             );

    //     const show_closure_button =
    //         Boolean(
    //             can_close
    //             ||
    //             can_reopen
    //         );

    //     $closure_button
    //         .toggle(
    //             show_closure_button
    //         )
    //         .prop(
    //             "disabled",
    //             (
    //                 this.is_loading
    //                 ||
    //                 !show_closure_button
    //             )
    //         )
    //         .toggleClass(
    //             "is-reopen",
    //             Boolean(
    //                 is_closed
    //             )
    //         );

    //     $closure_button
    //         .find(
    //             ".archive-pending-close-toggle-label"
    //         )
    //         .text(
    //             is_closed
    //                 ? "إلغاء الإنهاء"
    //                 : "إنهاء العملية"
    //         );

    //     $closure_button
    //         .find(
    //             "i"
    //         )
    //         .attr(
    //             "class",
    //             is_closed
    //                 ? "fa fa-undo"
    //                 : "fa fa-check-circle"
    //         );
    // }

    update_selected_actions() {
        const selected =
            this.get_selected_operation();

        const has_selected =
            Boolean(
                selected
                &&
                !this.is_loading
            );

        const is_closed =
            has_selected
            &&
            this.is_operation_closed(
                selected
            );

        const is_failed =
            has_selected
            &&
            this.is_operation_failed(
                selected
            );

        const status =
            has_selected
                ? String(
                    selected.status
                    || ""
                ).trim()
                : "";

        const can_close =
            has_selected
            &&
            this.can_close_operation(
                selected
            );

        const can_reopen =
            has_selected
            &&
            this.can_reopen_operation(
                selected
            );

        const can_mark_failed =
            has_selected
            &&
            this.can_mark_operation_failed(
                selected
            );

        const can_revert_failed =
            has_selected
            &&
            this.can_revert_operation_failed(
                selected
            );


        // ---------------------------------------------------------
        // عرض
        // ---------------------------------------------------------

        $(this.wrapper)
            .find(
                ".archive-pending-selected-view"
            )
            .prop(
                "disabled",
                !has_selected
            );


        // ---------------------------------------------------------
        // مسار العملية
        // ---------------------------------------------------------

        const can_view_timeline =
            Boolean(
                this.capabilities
                    ?.can_view_timeline
            );

        $(this.wrapper)
            .find(
                ".archive-pending-timeline-button"
            )
            .toggle(
                can_view_timeline
            )
            .prop(
                "disabled",
                (
                    !has_selected
                    ||
                    !can_view_timeline
                )
            );


        // ---------------------------------------------------------
        // إجراء / إلغاء الفشل
        //
        // يظهر فقط:
        // - تحت الإجراء
        // - معلقة فاشلة
        //
        // ولا يظهر على العملية المنتهية.
        // ---------------------------------------------------------

        const $action_button =
            $(this.wrapper)
                .find(
                    ".archive-pending-selected-actions"
                );

        const show_action_button =
            Boolean(
                has_selected
                &&
                !is_closed
                &&
                (
                    (
                        status
                        === "تحت الإجراء"
                        &&
                        can_mark_failed
                    )
                    ||
                    (
                        status
                        === "معلقة فاشلة"
                        &&
                        can_revert_failed
                    )
                )
            );

        $action_button
            .toggle(
                show_action_button || !has_selected
            )
            .prop(
                "disabled",
                (
                    this.is_loading
                    ||
                    !show_action_button
                )
            )
            .toggleClass(
                "is-revert-failed",
                Boolean(
                    is_failed
                    &&
                    can_revert_failed
                )
            )
            .attr(
                "title",
                is_failed
                    ? "إلغاء تحويل العملية إلى فاشلة"
                    : "إجراء على العملية"
            );

        $action_button
            .find(".ac-tb-label")
            .text(
                is_failed
                    ? "إلغاء الفشل"
                    : "إجراء"
            );


        // ---------------------------------------------------------
        // إنهاء / إلغاء الإنهاء
        //
        // إنهاء جديد يظهر فقط:
        // - مرتجعة غير مكتملة
        // - معلقة فاشلة
        //
        // أما العملية المنتهية فيبقى مسار إلغاء الإنهاء متاحًا
        // حسب الصلاحيات الحالية.
        // ---------------------------------------------------------

        const $closure_button =
            $(this.wrapper)
                .find(
                    ".archive-pending-close-toggle"
                );

        const can_show_new_close =
            Boolean(
                !is_closed
                &&
                (
                    status
                    === "مرتجعة غير مكتملة"
                    ||
                    status
                    === "معلقة فاشلة"
                )
                &&
                can_close
            );

        const show_closure_button =
            Boolean(
                can_show_new_close
                ||
                (
                    is_closed
                    &&
                    can_reopen
                )
            );

        $closure_button
            .toggle(
                show_closure_button
            )
            .prop(
                "disabled",
                (
                    this.is_loading
                    ||
                    !show_closure_button
                )
            )
            .toggleClass(
                "is-reopen",
                Boolean(
                    is_closed
                )
            );

        $closure_button
            .find(
                ".archive-pending-close-toggle-label"
            )
            .text(
                is_closed
                    ? "إلغاء الإنهاء"
                    : "إنهاء العملية"
            );

        $closure_button
            .find(
                ".ac-tb-icon"
            )
            .html(
                is_closed
                    ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>'
                    : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>'
            );
    }


    async open_selected_operation() {
        const operation =
            this.get_selected_operation();

        if (
            !operation
        ) {
            return;
        }

        await this.open_operation(
            operation.name
        );
    }


    open_selected_operation_timeline() {
        const operation =
            this.get_selected_operation();

        if (
            !operation
        ) {
            return;
        }

        if (
            !window
                .ArchivePendingOperationTimelineDialog
        ) {
            frappe.msgprint({
                title:
                    "تعذر فتح مسار العملية",

                message:
                    "لم يتم تحميل مكوّن مسار العملية.",

                indicator:
                    "red",
            });

            return;
        }

        this.timeline_dialog
            ?.destroy
            ?.();

        this.timeline_dialog =
            new window
                .ArchivePendingOperationTimelineDialog({
                    name:
                        operation.name,
                });

        this.timeline_dialog
            .show();
    }



    open_selected_actions() {
        const operation =
            this.get_selected_operation();

        if (
            !operation
        ) {
            frappe.show_alert({
                message:
                    "اختر عملية أولاً",

                indicator:
                    "orange",
            });

            return;
        }
        if (
            this.is_operation_failed(
                operation
            )
        ) {
            this.open_revert_failed_dialog(
                operation
            );

            return;
        }

        if (
            !this
                .can_mark_operation_failed(
                    operation
                )
        ) {
            return;
        }

        const dialog =
            new frappe.ui.Dialog({
                title:
                    `إجراء — ${operation.name}`,

                fields: [

                    {
                        fieldname:
                            "action_label",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        archive-pending-failed-action-note
                                    "
                                >
                                    سيتم تغيير حالة العملية إلى
                                    <strong>
                                        معلقة فاشلة
                                    </strong>.
                                </div>
                            `,
                    },

                ],

                primary_action_label:
                    "تغيير إلى معلقة فاشلة",

                primary_action:
                    async () => {

                        dialog
                            .get_primary_btn()
                            .prop(
                                "disabled",
                                true
                            )
                            .text(
                                "جارٍ التغيير..."
                            );

                        try {
                            await frappe.call({
                                method:
                                    "archive.api.pending_operations.mark_pending_operation_failed",

                                type:
                                    "POST",

                                args: {
                                    name:
                                        operation.name,

                                    payload: {},
                                },
                            });

                            dialog.hide();

                            frappe.show_alert({
                                message:
                                    "تم تغيير العملية إلى معلقة فاشلة",

                                indicator:
                                    "red",
                            });

                            await this
                                .load_context();

                        } finally {
                            dialog
                                .get_primary_btn()
                                .prop(
                                    "disabled",
                                    false
                                )
                                .text(
                                    "تغيير إلى معلقة فاشلة"
                                );
                        }
                    },
            });

        dialog.show();
    }

    async open_revert_failed_dialog(
        operation
    ) {
        if (
            !this
                .can_revert_operation_failed(
                    operation
                )
        ) {
            return;
        }

        const dialog =
            new frappe.ui.Dialog({
                title:
                    `إلغاء الفشل — ${operation.name}`,

                fields: [

                    {
                        fieldname:
                            "revert_failed_info",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        archive-pending-revert-failed-info
                                    "
                                >
                                    <strong>
                                        سيتم إلغاء تحويل العملية إلى
                                        معلقة فاشلة.
                                    </strong>

                                    <p>
                                        ستعود العملية تلقائيًا إلى
                                        حالتها المالية الصحيحة قبل الفشل
                                        بحسب الحركة المالية الحالية.
                                    </p>
                                </div>
                            `,
                    },
                ],

                primary_action_label:
                    "تأكيد إلغاء الفشل",

                primary_action:
                    async () => {

                        const $primary =
                            dialog
                                .get_primary_btn();

                        $primary
                            .prop(
                                "disabled",
                                true
                            )
                            .text(
                                "جارٍ إلغاء الفشل..."
                            );

                        try {
                            await frappe.call({
                                method:
                                    "archive.api.pending_operations.revert_pending_operation_failure",

                                type:
                                    "POST",

                                args: {
                                    name:
                                        operation.name,

                                    expected_modified:
                                        operation.modified,
                                },
                            });

                            dialog.hide();

                            frappe.show_alert({
                                message:
                                    "تم إلغاء تحويل العملية إلى فاشلة",

                                indicator:
                                    "green",
                            });

                            await this
                                .load_context();

                        } finally {
                            $primary
                                .prop(
                                    "disabled",
                                    false
                                )
                                .text(
                                    "تأكيد إلغاء الفشل"
                                );
                        }
                    },
            });

        dialog.show();
    }

    async open_selected_closure_action() {
        const operation =
            this.get_selected_operation();

        if (!operation) {
            frappe.show_alert({
                message:
                    "اختر عملية أولاً",

                indicator:
                    "orange",
            });

            return;
        }

        if (
            this.is_operation_closed(
                operation
            )
        ) {
            await this
                .open_reopen_operation_dialog(
                    operation
                );

            return;
        }

        await this
            .open_close_operation_dialog(
                operation
            );
    }


    async open_close_operation_dialog(
        operation
    ) {
        if (
            !this.can_close_operation(
                operation
            )
        ) {
            return;
        }

        const dialog =
            new frappe.ui.Dialog({
                title:
                    `إنهاء العملية — ${operation.name}`,

                fields: [

                    {
                        fieldname:
                            "closure_info",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        archive-pending-close-dialog-info
                                    "
                                >
                                    <div>
                                        <span>
                                            الحالة الحالية
                                        </span>

                                        <strong>
                                            ${this.escape_value(
                                                operation.status
                                            )}
                                        </strong>
                                    </div>

                                    <div>
                                        <span>
                                            المبلغ المتبقي
                                        </span>

                                        <strong>
                                            ${this.format_amount(
                                                operation.remaining_amount
                                            )}
                                            ر.س
                                        </strong>
                                    </div>
                                </div>
                            `,
                    },
                    {
                        fieldname:
                            "closed_date",

                        fieldtype:
                            "Date",

                        label:
                            "تاريخ الإنهاء",

                        reqd:
                            1,

                        default:
                            frappe.datetime
                                .get_today(),
                    },

                    {
                        fieldname:
                            "note",

                        fieldtype:
                            "Small Text",

                        label:
                            "ملاحظة إنهاء العملية",

                        reqd:
                            1,
                    },
                ],

                primary_action_label:
                    "إنهاء العملية",

                primary_action:
                    async () => {

                        const values =
                            dialog.get_values();

                        if (!values) {
                            return;
                        }

                        const note =
                            String(
                                values.note
                                || ""
                            ).trim();

                        if (!note) {
                            return;
                        }

                        const $primary =
                            dialog
                                .get_primary_btn();

                        $primary
                            .prop(
                                "disabled",
                                true
                            )
                            .text(
                                "جارٍ الإنهاء..."
                            );

                        try {
                            await frappe.call({
                                method:
                                    "archive.api.pending_operations.close_pending_operation",

                                type:
                                    "POST",

                                args: {
                                    name:
                                        operation.name,

                                    payload: {
                                        note,

                                        closed_date:
                                            values.closed_date,
                                    },

                                    expected_modified:
                                        operation.modified,
                                },
                            });

                            dialog.hide();

                            frappe.show_alert({
                                message:
                                    "تم إنهاء العملية",

                                indicator:
                                    "purple",
                            });

                            await this
                                .load_context();

                        } finally {
                            $primary
                                .prop(
                                    "disabled",
                                    false
                                )
                                .text(
                                    "إنهاء العملية"
                                );
                        }
                    },
            });

        dialog.show();
    }
    async open_reopen_operation_dialog(
        operation
    ) {
        if (
            !this.can_reopen_operation(
                operation
            )
        ) {
            return;
        }

        const dialog =
            new frappe.ui.Dialog({
                title:
                    `إلغاء إنهاء العملية — ${operation.name}`,

                fields: [

                    {
                        fieldname:
                            "reopen_info",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        archive-pending-reopen-dialog-info
                                    "
                                >
                                    <strong>
                                        سيتم إعادة فتح العملية للعمل عليها.
                                    </strong>

                                    <p>
                                        سيتم حذف ملاحظة الإنهاء من
                                        ملاحظات العملية، مع الاحتفاظ
                                        بسجل الإنهاء والإلغاء في
                                        مسار العملية.
                                    </p>
                                </div>
                            `,
                    },
                ],

                primary_action_label:
                    "تأكيد إلغاء الإنهاء",

                primary_action:
                    async () => {

                        const $primary =
                            dialog
                                .get_primary_btn();

                        $primary
                            .prop(
                                "disabled",
                                true
                            )
                            .text(
                                "جارٍ إلغاء الإنهاء..."
                            );

                        try {
                            await frappe.call({
                                method:
                                    "archive.api.pending_operations.reopen_pending_operation",

                                type:
                                    "POST",

                                args: {
                                    name:
                                        operation.name,

                                    expected_modified:
                                        operation.modified,
                                },
                            });

                            dialog.hide();

                            frappe.show_alert({
                                message:
                                    "تم إلغاء إنهاء العملية",

                                indicator:
                                    "green",
                            });

                            await this
                                .load_context();

                        } finally {
                            $primary
                                .prop(
                                    "disabled",
                                    false
                                )
                                .text(
                                    "تأكيد إلغاء الإنهاء"
                                );
                        }
                    },
            });

        dialog.show();
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
                    "desc",
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
                ".archive-pending-columns-button"
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
                            this.get_pending_column_definitions();
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
            .off("click.archivePendingColumnsMenu")
            .on("click.archivePendingColumnsMenu", () => {
                $wrapper
                    .find('[data-role="columns-menu"]')
                    .prop("hidden", true);
            });


        $wrapper
            .find(
                ".archive-pending-selected-view"
            )
            .on(
                "click",
                () => {
                    this.open_selected_operation();
                }
            );

        $wrapper
            .find(
                ".archive-pending-timeline-button"
            )
            .on(
                "click",
                () => {
                    this.open_selected_operation_timeline();
                }
            );

        $wrapper
            .find(
                ".archive-pending-selected-actions"
            )
            .on(
                "click",
                () => {
                    this.open_selected_actions();
                }
            );
        
        $wrapper
            .find(
                ".archive-pending-close-toggle"
            )
            .on(
                "click",
                () => {
                    this
                        .open_selected_closure_action();
                }
            );

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

        $wrapper.on("click", ".archive-pending-search-box", (e) => {
            if (!$(e.target).is("input")) {
                $(e.currentTarget).find(".archive-pending-search").focus();
            }
        });

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

                    this.select_operation(
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

                    this.select_operation(
                        $(event.currentTarget)
                            .data(
                                "name"
                            )
                    );
                }
            );
    }
    get_card_account_lookup_rows() {
        const records =
            this.data_source
                ?.records;


        let rows = [];


        if (
            records
            instanceof Map
        ) {
            rows =
                Array.from(
                    records.values()
                );

        } else if (
            Array.isArray(
                records
            )
        ) {
            rows =
                records;

        } else if (
            records
            &&
            typeof records.values
                === "function"
        ) {
            rows =
                Array.from(
                    records.values()
                );
        }


        /*
        * لا نمرر كامل Record إلى Dialog.
        * فقط الحقول اللازمة للعلاقة.
        */
        return rows.map(
            (row) => ({
                card_name:
                    row.card_name
                    || "",

                account_number:
                    row.account_number
                    || "",

                bank:
                    row.bank
                    || "",

                card_owner:
                    row.card_owner
                    || "",
            })
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

                    lookup_rows:
                        this
                            .get_card_account_lookup_rows(),

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
        if (typeof window.archive_format_datetime === "function") {
            return this.escape_value(window.archive_format_datetime(value, "—"));
        }

        const clean = String(value).trim().replace(/\.\d+$/, "");
        try {
            if (frappe?.datetime?.convert_to_user_tz) {
                const converted = frappe.datetime.convert_to_user_tz(clean, true);
                if (converted && converted !== "Invalid date") {
                    return String(converted).replace(/\.\d+$/, "");
                }
            }
            return frappe.datetime.str_to_user(clean);
        } catch (error) {
            return this.escape_value(clean);
        }
    }

    format_time_only(
        value
    ) {
        if (!value) {
            return "—";
        }
        if (typeof window.archive_format_time_only === "function") {
            return this.escape_value(window.archive_format_time_only(value, "—"));
        }
        return "—";
    }
}