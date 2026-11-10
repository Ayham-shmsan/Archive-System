window.archive = window.archive || {};
archive.ui = archive.ui || {};


archive.ui.OperationTimelineDialog = class {
    constructor(
        operation_name,
        options = {}
    ) {
        this.operation_name =
            operation_name;

        this.options =
            options || {};

        this.operation = null;

        this.events = [];

        this.active_filter =
            "all";

        this.loading =
            false;

        this.make();
    }


    // ========================================================
    // Dialog
    // ========================================================

    make() {
        this.dialog =
            new frappe.ui.Dialog({
                title:
                    __("مسار العملية"),

                size:
                    "extra-large",

                fields: [
                    {
                        fieldname:
                            "timeline_html",

                        fieldtype:
                            "HTML",
                    },
                ],
            });


        this.dialog.$wrapper.addClass(
            "archive-operation-timeline-modal"
        );


        this.$body =
            this.dialog
                .fields_dict
                .timeline_html
                .$wrapper;


        this.$body.addClass(
            "archive-operation-timeline-wrapper"
        );


        this.render_loading();
    }


    show() {
        this.dialog.show();

        this.load();
    }


    // ========================================================
    // Load
    // ========================================================

    async load() {
        if (this.loading) {
            return;
        }

        this.loading = true;

        this.render_loading();

        try {
            const response =
                await frappe.call({
                    method:
                        "archive.api.operation_timeline.get_operation_timeline",

                    type:
                        "GET",

                    args: {
                        operation_name:
                            this.operation_name,
                    },
                });


            const result =
                response.message || {};


            this.operation =
                result.operation || {};


            this.events =
                Array.isArray(
                    result.events
                )
                    ? result.events
                    : [];


            this.render();

        } catch (error) {

            console.error(
                "Operation timeline loading failed:",
                error
            );


            this.render_error(
                error?.message
                ||
                __(
                    "تعذر تحميل مسار العملية."
                )
            );

        } finally {
            this.loading = false;
        }
    }


    // ========================================================
    // Loading & Error
    // ========================================================

    render_loading() {
        this.$body.html(`
            <div class="archive-timeline-loading">

                <div class="archive-timeline-spinner">
                </div>

                <div>
                    ${__(
                        "جارٍ تحميل مسار العملية..."
                    )}
                </div>

            </div>
        `);
    }


    render_error(
        message
    ) {
        this.$body.html(`
            <div class="archive-timeline-error">

                <div class="archive-timeline-error-icon">
                    <i
                        class="fa fa-exclamation-triangle"
                        aria-hidden="true"
                    ></i>
                </div>

                <div class="archive-timeline-error-title">
                    ${__(
                        "تعذر تحميل مسار العملية"
                    )}
                </div>

                <div class="archive-timeline-error-message">
                    ${this.escape(
                        message
                    )}
                </div>

                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        archive-timeline-retry
                    "
                >
                    ${__(
                        "إعادة المحاولة"
                    )}
                </button>

            </div>
        `);


        this.$body
            .find(
                ".archive-timeline-retry"
            )
            .on(
                "click",
                () => {
                    this.load();
                }
            );
    }


    // ========================================================
    // Main render
    // ========================================================

    render() {
        this.$body.html(`
            <div
                class="archive-timeline-shell"
                dir="rtl"
            >

                ${this.render_header()}

                ${this.render_filters()}

                <div
                    class="archive-timeline-events"
                >
                    ${this.render_events()}
                </div>

            </div>
        `);


        this.bind_events();
    }


    // ========================================================
    // Header
    // ========================================================

    render_header() {
        const operation =
            this.operation || {};

        return `
            <div class="archive-timeline-header">

                <div class="archive-timeline-header-main">

                    <div class="archive-timeline-header-brand">
                        <div class="archive-timeline-header-icon">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="6" cy="6" r="3"></circle>
                                <circle cx="18" cy="18" r="3"></circle>
                                <path d="M9 6h6.5a2.5 2.5 0 0 1 0 5h-7a2.5 2.5 0 0 0 0 5H15"></path>
                            </svg>
                        </div>

                        <div class="archive-timeline-header-text">
                            <div class="archive-timeline-operation-title">
                                ${__("مسار العملية")}
                            </div>

                            <div class="archive-timeline-operation-subtitle">
                                ${__("جميع الأحداث والتعديلات المتعلقة على العملية")}
                            </div>
                        </div>
                    </div>

                    <div class="archive-timeline-header-actions">
                        <button
                            type="button"
                            class="archive-timeline-refresh"
                            title="${__("تحديث")}"
                        >
                            <i class="fa fa-refresh" aria-hidden="true"></i>
                            <span>${__("تحديث")}</span>
                        </button>

                        <button
                            type="button"
                            class="archive-timeline-close-btn"
                            title="${__("إغلاق")}"
                            aria-label="${__("إغلاق")}"
                        >
                            ✕
                        </button>
                    </div>

                </div>

                <div class="archive-timeline-operation-summary">

                    ${this.summary_item(
                        __("رقم العملية"),
                        operation.operation_no,
                        "operation_no"
                    )}

                    ${this.summary_item(
                        __("العميل"),
                        operation.customer_name || operation.customer,
                        "customer"
                    )}

                    ${this.summary_item(
                        __("رقم المرجع"),
                        operation.reference_no,
                        "reference"
                    )}

                    ${this.summary_item(
                        __("الحالة الحالية"),
                        operation.status,
                        "status"
                    )}

                    ${this.summary_item(
                        __("تاريخ الطلب"),
                        this.format_date(operation.request_date),
                        "request_date"
                    )}

                    ${this.summary_item(
                        __("عدد الأحداث"),
                        this.events.length,
                        "events_count"
                    )}

                </div>

            </div>
        `;
    }


    get_summary_icon_html(type) {
        switch (type) {
            case "operation_no":
                return `
                    <div class="archive-timeline-summary-icon is-blue">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                    </div>
                `;
            case "customer":
                return `
                    <div class="archive-timeline-summary-icon is-sky">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                `;
            case "reference":
                return `
                    <div class="archive-timeline-summary-icon is-indigo">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                    </div>
                `;
            case "status":
                return `
                    <div class="archive-timeline-summary-icon is-rose">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                    </div>
                `;
            case "request_date":
                return `
                    <div class="archive-timeline-summary-icon is-emerald">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                    </div>
                `;
            case "events_count":
            default:
                return `
                    <div class="archive-timeline-summary-icon is-purple">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                    </div>
                `;
        }
    }


    summary_item(
        label,
        value,
        type = null
    ) {
        let rendered_value =
            this.escape_value(
                value
            );

        if (
            type === "status"
            &&
            value
        ) {
            rendered_value = `
                <span
                    class="
                        archive-timeline-status
                        ${this.get_status_class(
                            value
                        )}
                    "
                >
                    ${this.escape(
                        value
                    )}
                </span>
            `;
        }

        const is_ltr =
            type === "operation_no"
            || type === "reference"
            || type === "request_date"
            || type === "events_count";

        return `
            <div class="archive-timeline-summary-item">
                ${this.get_summary_icon_html(type)}

                <div class="archive-timeline-summary-content">
                    <div class="archive-timeline-summary-label">
                        ${this.escape(label)}
                    </div>

                    <div class="archive-timeline-summary-value ${is_ltr ? "is-ltr" : ""}">
                        ${rendered_value}
                    </div>
                </div>
            </div>
        `;
    }


    // ========================================================
    // Filters
    // ========================================================

    get_filters() {
        return [
            {
                key: "all",
                label: "الكل",
                icon_class: "filter-icon-all",
                icon_svg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
            },
            {
                key: "manual_edit",
                label: "التعديلات",
                icon_class: "filter-icon-edit",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
            },
            {
                key: "status_change",
                label: "الحالة",
                icon_class: "filter-icon-status",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
            },
            {
                key: "attachments",
                label: "المرفقات",
                icon_class: "filter-icon-attachments",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
            },
            {
                key: "final_swift",
                label: "السويفت النهائي",
                icon_class: "filter-icon-swift",
                icon_svg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            },
            {
                key: "data_extracted",
                label: "الاستخراج",
                icon_class: "filter-icon-extract",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
            },
            {
                key: "created",
                label: "الإنشاء",
                icon_class: "filter-icon-created",
                icon_svg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
            },
        ];
    }


    render_filters() {
        return `
            <div class="archive-timeline-toolbar">

                <div class="archive-timeline-filter-group">
                    ${
                        this.get_filters()
                            .map(
                                (filter) => {
                                    const active =
                                        this.active_filter === filter.key
                                            ? "is-active"
                                            : "";

                                    return `
                                        <button
                                            type="button"
                                            class="archive-timeline-filter ${filter.icon_class || ""} ${active}"
                                            data-filter="${this.escape(filter.key)}"
                                        >
                                            <span class="archive-timeline-filter-icon">
                                                ${filter.icon_svg || ""}
                                            </span>

                                            <span class="archive-timeline-filter-label">
                                                ${this.escape(filter.label)}
                                            </span>

                                            <strong class="archive-timeline-filter-count">
                                                ${this.get_filter_count(filter.key)}
                                            </strong>
                                        </button>
                                    `;
                                }
                            )
                            .join("")
                    }
                </div>

            </div>
        `;
    }


    get_filter_count(
        filter
    ) {
        if (
            filter === "all"
        ) {
            return this.events.length;
        }


        return this.events.filter(
            (event) =>
                this.event_matches_filter(
                    event,
                    filter
                )
        ).length;
    }


    event_matches_filter(
        event,
        filter
    ) {
        if (
            filter === "all"
        ) {
            return true;
        }


        if (
            filter === "attachments"
        ) {
            return [
                "attachment_added",
                "attachment_deleted",
                "attachment_downloaded",
                "attachment_viewed",
                "incomplete_invoice_completed",
            ].includes(
                event.event_type
            );
        }


        if (
            filter === "created"
        ) {
            return [
                "created",
                "incomplete_invoice_registered",
            ].includes(
                event.event_type
            );
        }


        if (
            filter === "final_swift"
        ) {
            return [
                "final_swift_added",
                "final_swift_deleted",
            ].includes(
                event.event_type
            );
        }


        return (
            event.event_type
            === filter
        );
    }


    // ========================================================
    // Timeline
    // ========================================================

    render_events() {
        const events =
            this.events.filter(
                (event) =>
                    this.event_matches_filter(
                        event,
                        this.active_filter
                    )
            );


        if (!events.length) {
            return `
                <div class="archive-timeline-empty">
                    <div class="archive-timeline-empty-icon">
                        <i class="fa fa-history" aria-hidden="true"></i>
                    </div>

                    <div class="archive-timeline-empty-title">
                        ${__("لا توجد أحداث ضمن هذا التصنيف")}
                    </div>
                </div>
            `;
        }


        return `
            <div class="archive-timeline-list">
                ${
                    events
                        .map(
                            (event, index) =>
                                this.render_event(event, index, events.length)
                        )
                        .join("")
                }
            </div>
        `;
    }


    split_datetime_parts(value) {
        const formatted = this.format_datetime(value);
        if (!formatted || formatted === "—") {
            return { time: "—", date: "" };
        }
        const raw = String(value || "").trim().replace(/\.\d+$/, "");
        let resolved = raw;
        try {
            if (frappe?.datetime?.convert_to_user_tz && /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(raw)) {
                const converted = frappe.datetime.convert_to_user_tz(raw, true);
                if (converted && converted !== "Invalid date") {
                    resolved = String(converted).trim().replace(/\.\d+$/, "");
                }
            }
        } catch (e) {
            // fallback
        }
        const m = resolved.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
        if (m) {
            const h24 = parseInt(m[2], 10);
            const min = String(m[3]).padStart(2, "0");
            const period = h24 >= 12 ? "م" : "ص";
            const h12 = String(h24 % 12 || 12).padStart(2, "0");
            return {
                time: `${h12}:${min} ${period}`,
                date: m[1],
            };
        }
        const parts = formatted.split("،");
        if (parts.length === 2) {
            return {
                date: parts[0].trim(),
                time: parts[1].trim(),
            };
        }
        return { time: formatted, date: "" };
    }


    render_event(
        event,
        index,
        total_count = 0
    ) {
        const config =
            this.get_event_config(
                event.event_type
            );

        const event_details_html =
            this.render_event_details(
                event
            );

        const dt_parts =
            this.split_datetime_parts(
                event.event_datetime
            );

        const total =
            total_count || this.get_filtered_events().length;

        const badge_label =
            config.badge_label
            || event.event_type_label
            || config.label;

        return `
            <div class="archive-timeline-event ${config.class_name}">

                <div class="archive-timeline-event-marker">
                    <div class="archive-timeline-event-icon">
                        ${config.marker_svg || `<i class="fa ${config.icon}" aria-hidden="true"></i>`}
                    </div>

                    ${
                        index < total - 1
                            ? `<div class="archive-timeline-line"></div>`
                            : ""
                    }
                </div>

                <div class="archive-timeline-event-card">

                    <div class="archive-timeline-event-head">

                        <div class="archive-timeline-event-title-wrap">

                            <div class="archive-timeline-event-title">
                                ${this.escape(
                                    event.event_title
                                    || event.event_type_label
                                    || config.label
                                    || "حدث"
                                )}
                            </div>

                            <div class="archive-timeline-event-meta">
                                <div class="archive-timeline-user-meta">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                        <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"/>
                                    </svg>
                                    <span>${__("بواسطة:")}</span>
                                    <strong dir="auto">
                                        ${this.escape_value(
                                            event.event_user_name
                                            || event.event_user
                                        )}
                                    </strong>
                                </div>

                                ${
                                    (event.event_source_label || event.event_source)
                                        ? `
                                            <div class="archive-timeline-extra-meta">
                                                <i class="fa fa-cog" aria-hidden="true"></i>
                                                <span>${__("المصدر:")}</span>
                                                <strong>
                                                    ${this.escape_value(
                                                        event.event_source_label
                                                        || event.event_source
                                                    )}
                                                </strong>
                                            </div>
                                        `
                                        : ""
                                }

                                ${
                                    event.effective_date
                                        ? `
                                            <div class="archive-timeline-extra-meta">
                                                <i class="fa fa-calendar-check-o" aria-hidden="true"></i>
                                                <span>${__("التاريخ الفعلي:")}</span>
                                                <strong>
                                                    ${this.escape_value(
                                                        this.format_date(event.effective_date)
                                                    )}
                                                </strong>
                                            </div>
                                        `
                                        : ""
                                }
                            </div>

                        </div>

                        <div class="archive-timeline-event-head-left">

                            <div class="archive-timeline-event-badge">
                                <span class="archive-timeline-event-badge-icon">
                                    ${config.badge_svg || `<i class="fa ${config.icon}" aria-hidden="true"></i>`}
                                </span>
                                <span>${this.escape(badge_label)}</span>
                            </div>

                            <div class="archive-timeline-event-time">
                                <div class="archive-timeline-time-row">
                                    <span class="archive-timeline-time-text">${this.escape(dt_parts.time)}</span>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                </div>
                                ${
                                    dt_parts.date
                                        ? `
                                            <div class="archive-timeline-date-row">
                                                <span class="archive-timeline-date-text">${this.escape(dt_parts.date)}</span>
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                                </svg>
                                            </div>
                                        `
                                        : ""
                                }
                            </div>

                        </div>

                    </div>

                    ${
                        event.remarks
                            ? `
                                <div class="archive-timeline-remarks">
                                    <div class="archive-timeline-remarks-label">
                                        ${__("ملاحظات الإجراء")}
                                    </div>
                                    <div>
                                        ${this.escape(event.remarks)}
                                    </div>
                                </div>
                            `
                            : ""
                    }

                    ${event_details_html}

                </div>

            </div>
        `;
    }


    get_filtered_events() {
        return this.events.filter(
            (event) =>
                this.event_matches_filter(
                    event,
                    this.active_filter
                )
        );
    }


    // ========================================================
    // Event configuration
    // ========================================================

    get_event_config(
        event_type
    ) {
        const svg_plus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        const svg_pencil = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
        const svg_gear = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
        const svg_eye = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        const svg_doc = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
        const svg_extract_badge = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        const svg_trash = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
        const svg_paperclip = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
        const svg_check = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        const svg_flag = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;

        const configs = {

            created: {
                label: "إنشاء العملية",
                badge_label: "إنشاء العملية",
                icon: "fa-plus",
                marker_svg: svg_plus,
                badge_svg: svg_plus,
                class_name: "event-created theme-blue",
            },

            data_extracted: {
                label: "استخراج البيانات",
                badge_label: "استخراج بيانات",
                icon: "fa-file-pdf-o",
                marker_svg: svg_doc,
                badge_svg: svg_extract_badge,
                class_name: "event-extraction theme-green",
            },

            manual_edit: {
                label: "تعديل البيانات",
                badge_label: "تعديل بيانات العملية",
                icon: "fa-pencil",
                marker_svg: svg_pencil,
                badge_svg: svg_gear,
                class_name: "event-edit theme-purple",
            },

            status_change: {
                label: "تغيير الحالة",
                badge_label: "تغيير الحالة",
                icon: "fa-exchange",
                marker_svg: svg_flag,
                badge_svg: svg_flag,
                class_name: "event-status theme-amber",
            },

            attachment_added: {
                label: "إضافة مرفق",
                badge_label: "إضافة مرفق",
                icon: "fa-paperclip",
                marker_svg: svg_paperclip,
                badge_svg: svg_paperclip,
                class_name: "event-attachment theme-indigo",
            },

            attachment_deleted: {
                label: "حذف مرفق",
                badge_label: "حذف مرفق",
                icon: "fa-trash-o",
                marker_svg: svg_trash,
                badge_svg: svg_trash,
                class_name: "event-delete theme-red",
            },

            final_swift_added: {
                label: "إرفاق السويفت النهائي",
                badge_label: "إرفاق السويفت النهائي",
                icon: "fa-check-circle",
                marker_svg: svg_check,
                badge_svg: svg_check,
                class_name: "event-swift theme-emerald",
            },

            final_swift_deleted: {
                label: "حذف السويفت النهائي",
                badge_label: "حذف السويفت النهائي",
                icon: "fa-trash-o",
                marker_svg: svg_trash,
                badge_svg: svg_trash,
                class_name: "event-delete theme-red",
            },

            attachment_downloaded: {
                label: "تنزيل مرفق",
                badge_label: "تنزيل مرفق",
                icon: "fa-download",
                marker_svg: svg_extract_badge,
                badge_svg: svg_extract_badge,
                class_name: "attachment-downloaded theme-teal",
            },

            attachment_viewed: {
                label: "عرض مرفق",
                badge_label: "عرض مرفق",
                icon: "fa-eye",
                marker_svg: svg_eye,
                badge_svg: svg_eye,
                class_name: "event-attachment theme-sky",
            },

            incomplete_invoice_registered: {
                label: "فاتورة غير مكتملة",
                badge_label: "فاتورة غير مكتملة",
                icon: "fa-file-text-o",
                marker_svg: svg_doc,
                badge_svg: svg_doc,
                class_name: "event-incomplete-invoice theme-orange",
            },

            incomplete_invoice_completed: {
                label: "استكمال الفاتورة",
                badge_label: "استكمال الفاتورة",
                icon: "fa-check-circle",
                marker_svg: svg_check,
                badge_svg: svg_check,
                class_name: "event-attachment theme-emerald",
            },

            operation_number_changed: {
                label: "تغيير رقم العملية",
                badge_label: "تغيير رقم العملية",
                icon: "fa-hashtag",
                marker_svg: svg_pencil,
                badge_svg: svg_gear,
                class_name: "event-edit theme-indigo",
            },

            owner_changed: {
                label: "تغيير مالك العملية",
                badge_label: "تغيير مالك العملية",
                icon: "fa-user",
                marker_svg: svg_pencil,
                badge_svg: svg_gear,
                class_name: "event-edit theme-purple",
            },
        };


        return (
            configs[
                event_type
            ]
            ||
            {
                label:
                    "حدث",
                badge_label:
                    "حدث",
                icon:
                    "fa-circle-o",
                marker_svg:
                    svg_doc,
                badge_svg:
                    svg_doc,
                class_name:
                    "event-default theme-neutral",
            }
        );
    }


    // ========================================================
    // Event details router
    // ========================================================

    render_event_details(
        event
    ) {
        const details =
            event.details || {};


        switch (
            event.event_type
        ) {

            case "manual_edit":
                return (
                    this.render_changes(
                        details.changes
                    )
                );


            case "status_change":
                return (
                    this.render_status_change(
                        details
                    )
                );


            case "attachment_added":
            case "attachment_deleted":
            case "final_swift_added":
            case "final_swift_deleted":
            case "incomplete_invoice_completed":
            case "attachment_downloaded":
            case "attachment_viewed":
                return (
                    this.render_files(
                        details,
                        event
                    )
                );


            case "data_extracted":
                return (
                    this.render_extraction(
                        details
                    )
                );


            case "created":
                return (
                    this.render_created(
                        details
                    )
                );


            default:
                if (Array.isArray(details.changes) && details.changes.length) {
                    return this.render_changes(details.changes);
                }
                if (details.file_url || (Array.isArray(details.files) && details.files.length)) {
                    return this.render_files(details, event);
                }
                return "";
        }
    }


    // ========================================================
    // Manual changes
    // ========================================================

    render_changes(
        changes
    ) {
        if (
            !Array.isArray(
                changes
            )
            ||
            !changes.length
        ) {
            return "";
        }


        return `
            <div class="archive-timeline-details">

                <div class="archive-timeline-details-title">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                        <polyline points="2 17 12 22 22 17"></polyline>
                        <polyline points="2 12 12 17 22 12"></polyline>
                    </svg>
                    <span>${__("التغييرات")}</span>
                </div>

                <div class="archive-timeline-change-table">

                    <div class="archive-timeline-change-row archive-timeline-change-head">
                        <div>${__("الحقل")}</div>
                        <div>${__("القيمة السابقة")}</div>
                        <div>${__("القيمة الجديدة")}</div>
                    </div>

                    ${
                        changes
                            .map(
                                (change) => `
                                    <div class="archive-timeline-change-row">

                                        <div class="archive-timeline-change-label">
                                            ${this.escape_value(
                                                change.label
                                                ||
                                                change.fieldname
                                            )}
                                        </div>

                                        <div class="archive-timeline-old-value">
                                            ${this.escape_value(
                                                change.fieldname === "execution_datetime" ||
                                                /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(String(change.old_value || "").trim())
                                                    ? this.format_datetime(change.old_value)
                                                    : change.old_value
                                            )}
                                        </div>

                                        <div class="archive-timeline-new-value">
                                            ${this.escape_value(
                                                change.fieldname === "execution_datetime" ||
                                                /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(String(change.new_value || "").trim())
                                                    ? this.format_datetime(change.new_value)
                                                    : change.new_value
                                            )}
                                        </div>

                                    </div>
                                `
                            )
                            .join("")
                    }

                </div>

            </div>
        `;
    }


    // ========================================================
    // Status
    // ========================================================

    render_status_change(
        details
    ) {
        if (
            !details
        ) {
            return "";
        }


        return `
            <div class="archive-timeline-details">

                <div class="archive-timeline-status-change">

                    <div class="archive-timeline-status-box">
                        <span>${__("من")}</span>

                        <strong class="archive-timeline-status ${this.get_status_class(details.from_status)}">
                            ${this.escape_value(details.from_status)}
                        </strong>
                    </div>

                    <div class="archive-timeline-status-arrow">
                        <i class="fa fa-long-arrow-left" aria-hidden="true"></i>
                    </div>

                    <div class="archive-timeline-status-box">
                        <span>${__("إلى")}</span>

                        <strong class="archive-timeline-status ${this.get_status_class(details.to_status)}">
                            ${this.escape_value(details.to_status)}
                        </strong>
                    </div>

                </div>

            </div>
        `;
    }


    // ========================================================
    // Files
    // ========================================================

    render_files(
        details = {},
        event = null
    ) {
        details =
            details || {};

        const files =
            Array.isArray(
                details.files
            )
                ? [
                    ...details.files
                ]
                : [];

        if (
            !files.length
            &&
            (details.file_url || details.file_name)
        ) {
            files.push({
                file_name:
                    details.file_name
                    || "مرفق",

                file_url:
                    details.file_url || "",
            });
        }

        let counter_html = "";
        if (
            event?.event_type === "final_swift_added"
            && details.final_swift_count !== undefined
        ) {
            counter_html = `
                <div class="archive-timeline-swift-count">
                    ${__("عدد ملفات السويفت بعد الإجراء")}:
                    <strong>
                        ${this.escape_value(details.final_swift_count)}
                        /
                        ${this.escape_value(details.final_swift_limit || 10)}
                    </strong>
                </div>
            `;
        } else if (
            event?.event_type === "final_swift_deleted"
            && details.remaining_count !== undefined
        ) {
            counter_html = `
                <div class="archive-timeline-swift-count">
                    ${__("عدد ملفات السويفت المتبقية")}:
                    <strong>
                        ${this.escape_value(details.remaining_count)}
                        /
                        ${this.escape_value(details.final_swift_limit || 10)}
                    </strong>
                </div>
            `;
        }

        if (!files.length && !counter_html) {
            return "";
        }

        const is_deleted =
            event?.event_type === "attachment_deleted"
            || event?.event_type === "final_swift_deleted";

        const section_label = is_deleted
            ? (files.length === 1 ? __("المرفق المحذوف") : __("المرفقات المحذوفة"))
            : (files.length === 1 ? __("الملف") : __("الملفات"));

        return `
            <div class="archive-timeline-details">

                ${
                    files.length
                        ? `
                            <div class="archive-timeline-details-title">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                </svg>
                                <span>${section_label}</span>
                            </div>

                            <div class="archive-timeline-files">
                                ${files
                                    .map((file) => this.render_file(file, is_deleted))
                                    .join("")}
                            </div>
                        `
                        : ""
                }

                ${counter_html}

            </div>
        `;
    }


    render_file(
        file,
        is_deleted = false
    ) {
        const file_name =
            file.file_name
            ||
            file.file_url
            ||
            __("ملف");

        const lower = String(file_name).toLowerCase();
        const is_image = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(lower);
        const badge_text = is_image ? "IMG" : "PDF";
        const badge_class = is_image ? "is-img" : "is-pdf";

        return `
            <div class="archive-timeline-file ${is_deleted ? "is-deleted-file" : ""}">
                <span class="archive-timeline-file-name">
                    ${this.escape_value(file_name)}
                </span>

                <span class="archive-timeline-file-badge ${badge_class}">
                    ${badge_text}
                </span>
            </div>
        `;
    }


    // ========================================================
    // Extraction
    // ========================================================

    get_extracted_field_icon(fieldname, label) {
        const key = String(fieldname || label || "").toLowerCase();
        if (key.includes("sender_account") || key.includes("beneficiary_account") || key.includes("bank") || key.includes("حساب") || key.includes("بنك")) {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 2 7 22 7 12 2"></polygon>
                    <line x1="6" y1="7" x2="6" y2="17"></line>
                    <line x1="10" y1="7" x2="10" y2="17"></line>
                    <line x1="14" y1="7" x2="14" y2="17"></line>
                    <line x1="18" y1="7" x2="18" y2="17"></line>
                    <rect x="3" y="17" width="18" height="3"></rect>
                </svg>
            `;
        }
        if (key.includes("amount") || key.includes("currency") || key.includes("مبلغ") || key.includes("عملة")) {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                    <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"></path>
                </svg>
            `;
        }
        if (key.includes("rate") || key.includes("سعر")) {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
            `;
        }
        if (key.includes("beneficiary_name") || key.includes("مستفيد")) {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
            `;
        }
        if (key.includes("date") || key.includes("تاريخ")) {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
            `;
        }
        if (key.includes("reference") || key.includes("مرجع")) {
            return `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="4" y1="5" x2="4" y2="19"></line>
                    <line x1="8" y1="5" x2="8" y2="19"></line>
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="16" y1="5" x2="16" y2="19"></line>
                    <line x1="20" y1="5" x2="20" y2="19"></line>
                </svg>
            `;
        }
        return `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
    }


    render_extraction(
        details
    ) {
        const fields =
            Array.isArray(
                details.fields
            )
                ? details.fields
                : [];


        return `
            <div class="archive-timeline-details">

                ${
                    details.file_url || details.file_name
                        ? `
                            <div class="archive-timeline-details-title">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                </svg>
                                <span>${__("مستند الاستخراج")}</span>
                            </div>

                            <div class="archive-timeline-files">
                                ${this.render_file({
                                    file_url: details.file_url,
                                    file_name: details.file_name,
                                })}
                            </div>
                        `
                        : ""
                }

                ${
                    fields.length
                        ? `
                            <div class="archive-timeline-extracted-box">
                                <div class="archive-timeline-details-title archive-timeline-fields-title">
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="8" y1="8" x2="16" y2="8"></line>
                                        <line x1="8" y1="12" x2="16" y2="12"></line>
                                        <line x1="8" y1="16" x2="12" y2="16"></line>
                                    </svg>
                                    <span>${__("البيانات المستخرجة")}</span>
                                </div>

                                <div class="archive-timeline-extracted-fields">
                                    ${
                                        fields
                                            .map(
                                                (field) => `
                                                    <div class="archive-timeline-extracted-field">
                                                        <div class="archive-timeline-field-icon">
                                                            ${this.get_extracted_field_icon(field.fieldname, field.label)}
                                                        </div>

                                                        <div class="archive-timeline-field-content">
                                                            <div class="archive-timeline-field-label">
                                                                ${this.escape_value(
                                                                    field.label
                                                                    ||
                                                                    field.fieldname
                                                                )}
                                                            </div>

                                                            <strong dir="auto">
                                                                ${this.escape_value(
                                                                    field.fieldname === "execution_datetime" ||
                                                                    /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(String(field.value || "").trim())
                                                                        ? this.format_datetime(field.value)
                                                                        : field.value
                                                                )}
                                                            </strong>
                                                        </div>
                                                    </div>
                                                `
                                            )
                                            .join("")
                                    }
                                </div>
                            </div>
                        `
                        : ""
                }

            </div>
        `;
    }


    // ========================================================
    // Created
    // ========================================================

    get_created_field_icon(key) {
        switch (key) {
            case "status":
                return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
            case "operation_no":
                return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`;
            case "customer":
                return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            case "amount":
            case "currency":
                return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>`;
            case "transferring_bank":
            default:
                return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 22 7 12 2"/><line x1="6" y1="7" x2="6" y2="17"/><line x1="10" y1="7" x2="10" y2="17"/><line x1="14" y1="7" x2="14" y2="17"/><line x1="18" y1="7" x2="18" y2="17"/><rect x="3" y="17" width="18" height="3"/></svg>`;
        }
    }


    render_created(
        details
    ) {
        if (!details) {
            return "";
        }


        const values = [
            {
                key: "status",
                label: "الحالة الابتدائية",
                value: details.status,
            },
            {
                key: "operation_no",
                label: "رقم العملية",
                value: details.operation_no,
            },
            {
                key: "customer",
                label: "العميل",
                value: details.customer,
            },
            {
                key: "amount",
                label: "المبلغ",
                value: details.amount,
            },
            {
                key: "currency",
                label: "العملة",
                value: details.currency,
            },
            {
                key: "transferring_bank",
                label: "البنك المحول",
                value: details.transferring_bank,
            },
        ].filter(
            (item) =>
                item.value !== null
                &&
                item.value !== undefined
                &&
                item.value !== ""
        );


        if (!values.length) {
            return "";
        }


        return `
            <div class="archive-timeline-details">

                <div class="archive-timeline-created-grid">
                    ${
                        values
                            .map(
                                (item) => `
                                    <div class="archive-timeline-created-item">
                                        <div class="archive-timeline-field-icon">
                                            ${this.get_created_field_icon(item.key)}
                                        </div>

                                        <div class="archive-timeline-field-content">
                                            <span>
                                                ${this.escape(item.label)}
                                            </span>

                                            <strong dir="auto">
                                                ${this.escape_value(item.value)}
                                            </strong>
                                        </div>
                                    </div>
                                `
                            )
                            .join("")
                    }
                </div>

            </div>
        `;
    }


    // ========================================================
    // Events
    // ========================================================

    bind_events() {
        this.$body
            .find(
                ".archive-timeline-refresh"
            )
            .on(
                "click",
                () => {
                    this.load();
                }
            );

        this.$body
            .find(
                ".archive-timeline-close-btn"
            )
            .on(
                "click",
                () => {
                    this.dialog.hide();
                }
            );


        this.$body
            .find(
                ".archive-timeline-filter"
            )
            .on(
                "click",
                (event) => {

                    const filter =
                        $(event.currentTarget)
                            .data(
                                "filter"
                            );


                    if (
                        !filter
                        ||
                        filter
                        === this.active_filter
                    ) {
                        return;
                    }


                    this.active_filter =
                        filter;


                    this.render();
                }
            );
    }


    // ========================================================
    // Formatting
    // ========================================================

    format_datetime(
        value
    ) {
        if (!value) {
            return "—";
        }
        if (typeof window.archive_format_datetime === "function") {
            return window.archive_format_datetime(value, "—");
        }

        const clean = String(value).trim().replace(/\.\d+$/, "");
        let resolved = clean;
        try {
            if (frappe?.datetime?.convert_to_user_tz && /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(clean)) {
                const converted = frappe.datetime.convert_to_user_tz(clean, true);
                if (converted && converted !== "Invalid date") {
                    resolved = String(converted).trim().replace(/\.\d+$/, "");
                }
            }
        } catch (error) {
            // fallback
        }
        const m = resolved.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
        if (m) {
            const h24 = parseInt(m[2], 10);
            const min = String(m[3]).padStart(2, "0");
            const period = h24 >= 12 ? "م" : "ص";
            const h12 = String(h24 % 12 || 12).padStart(2, "0");
            return `${m[1]}، ${h12}:${min} ${period}`;
        }
        return resolved;
    }


    format_date(
        value
    ) {
        if (!value) {
            return "—";
        }


        try {
            return (
                frappe.datetime
                    .str_to_user(
                        value
                    )
            );

        } catch (error) {
            return String(
                value
            );
        }
    }


    get_status_class(
        status
    ) {
        const classes = {
            "غير مؤكدة":
                "status-unconfirmed",

            "مؤكدة":
                "status-confirmed",

            "مرتجعة":
                "status-returned",

            "محضورة":
                "status-held",

            "معلقة":
                "status-pending",
        };


        return (
            classes[
                status
            ]
            ||
            ""
        );
    }


    // ========================================================
    // Safe HTML
    // ========================================================

    escape(
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
                String(
                    value
                )
            );
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


        return this.escape(
            value
        );
    }


    escape_attribute(
        value
    ) {
        return this.escape(
            value
        )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#39;"
            );
    }
};
