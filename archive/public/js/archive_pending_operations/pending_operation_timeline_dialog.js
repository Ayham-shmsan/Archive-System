window.ArchivePendingOperationTimelineDialog =
class ArchivePendingOperationTimelineDialog {
    constructor(options = {}) {
        this.name =
            String(
                options.name
                || ""
            ).trim();

        this.data = null;
        this.dialog = null;

        this.active_filter = "all";

        this.is_loading = false;
        this.is_destroyed = false;

        this.event_labels = {
            created:
                "إنشاء العملية",

            manual_edit:
                "تعديل بيانات العملية",

            return_added:
                "تسجيل مبلغ مرتجع",

            ledger_corrected:
                "تعديل الحركة المالية",

            status_change:
                "تغيير حالة العملية",

            attachment_added:
                "إضافة مرفق",

            attachment_deleted:
                "إزالة مرفق",

            attachment_viewed:
                "عرض مرفق",

            attachment_downloaded:
                "تنزيل مرفق",

            operation_closed:
                "إنهاء العملية",

            operation_reopened:
                "إعادة فتح العملية",

            marked_failed:
                "تم تغيير حالة المعلقة",

            failure_reverted:
                "إلغاء تحويل العملية إلى فاشلة",
        };

        this.field_labels = {
            bank:
                "اسم البنك",

            card_name:
                "اسم البطاقة",

            account_number:
                "رقم الحساب",

            card_number:
                "رقم البطاقة",

            operation_datetime:
                "التاريخ والوقت المعلق",

            suspended_note:
                "ملاحظات المعلق",

            region:
                "المنطقة",

            machine_location:
                "العنوان",

            branch_no:
                "رقم الفرع",

            machine_no:
                "رقم المكينة",

            representative:
                "اسم المندوب",

            card_owner:
                "مالك البطاقة",

            notes:
                "الملاحظات",

            description:
                "الوصف",
        };
    }

    async show() {
        if (!this.name) {
            return;
        }

        this.make_dialog();

        this.dialog.show();

        await this.load();
    }

    make_dialog() {
        this.dialog =
            new frappe.ui.Dialog({
                title:
                    `مسار المعلقات ${this.name}`,

                size:
                    "extra-large",

                fields: [
                    {
                        fieldname:
                            "timeline_content",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="pending-timeline-root"
                                    dir="rtl"
                                ></div>
                            `,
                    },
                ],
            });

        this.dialog.$wrapper
            .addClass(
                "archive-pending-timeline-dialog"
            )
            .attr(
                "dir",
                "rtl"
            );

        this.$root =
            this.dialog
                .fields_dict
                .timeline_content
                .$wrapper
                .find(
                    ".pending-timeline-root"
                );

        this.dialog.$wrapper
            .on(
                "click.pending_timeline",
                ".pending-timeline-refresh",
                () => {
                    this.load();
                }
            )
            .on(
                "click.pending_timeline",
                ".pending-timeline-close-btn",
                () => {
                    this.dialog.hide();
                }
            )
            .on(
                "click.pending_timeline",
                ".pending-timeline-filter",
                (e) => {
                    const filter =
                        $(e.currentTarget).attr("data-filter") || "all";
                    if (filter === this.active_filter) {
                        return;
                    }
                    this.active_filter = filter;
                    this.render();
                }
            );

        this.dialog.$wrapper
            .on(
                "hidden.bs.modal.pending_timeline",
                () => {
                    this.destroy();
                }
            );
    }

    async load() {
        if (
            this.is_loading
        ) {
            return;
        }

        this.is_loading =
            true;

        this.render_loading();

        try {
            const response =
                await frappe.call({
                    method:
                        "archive.api.pending_operation_timeline.get_pending_operation_timeline",

                    type:
                        "GET",

                    args: {
                        name:
                            this.name,
                    },
                });

            this.data =
                response.message
                || null;

            this.render();

        } catch (error) {
            console.error(
                "Pending timeline loading failed:",
                error
            );

            this.render_error(
                error
            );

        } finally {
            this.is_loading =
                false;
        }
    }

    render_loading() {
        this.$root.html(`
            <div class="pending-timeline-loading">

                <div
                    class="pending-timeline-spinner"
                ></div>

                <span>
                    جارٍ تحميل مسار العملية...
                </span>

            </div>
        `);
    }

    render_error(error) {
        this.$root.html(`
            <div class="pending-timeline-empty">

                <strong>
                    تعذر تحميل مسار العملية
                </strong>

                <span>
                    ${this.escape(
                        error?.message
                        ||
                        "حدث خطأ أثناء تحميل السجل."
                    )}
                </span>

                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        btn-sm
                        pending-timeline-refresh
                    "
                >
                    إعادة المحاولة
                </button>

            </div>
        `);
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
                key: "added",
                label: "الإضافة",
                icon_class: "filter-icon-added",
                icon_svg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
            },
            {
                key: "deleted",
                label: "الإزالة",
                icon_class: "filter-icon-deleted",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
            },
            {
                key: "downloaded",
                label: "التنزيل",
                icon_class: "filter-icon-downloaded",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
            },
            {
                key: "viewed",
                label: "المعاينة",
                icon_class: "filter-icon-viewed",
                icon_svg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
            },
            {
                key: "edited",
                label: "التعديل",
                icon_class: "filter-icon-edited",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
            },
            {
                key: "status",
                label: "الحالة",
                icon_class: "filter-icon-status",
                icon_svg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
            },
            {
                key: "other",
                label: "أخرى",
                icon_class: "filter-icon-other",
                icon_svg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
            },
        ];
    }

    event_matches_filter(event, filter) {
        if (!filter || filter === "all") {
            return true;
        }
        const t = String(event?.event_type || "").trim();
        switch (filter) {
            case "added":
                return t === "created" || t === "attachment_added";
            case "deleted":
                return t === "attachment_deleted";
            case "downloaded":
                return t === "attachment_downloaded";
            case "viewed":
                return t === "attachment_viewed";
            case "edited":
                return t === "manual_edit" || t === "ledger_corrected";
            case "status":
                return [
                    "status_change",
                    "marked_failed",
                    "failure_reverted",
                    "operation_closed",
                    "operation_reopened",
                ].includes(t);
            case "other":
                return (
                    t === "return_added"
                    || ![
                        "created",
                        "attachment_added",
                        "attachment_deleted",
                        "attachment_downloaded",
                        "attachment_viewed",
                        "manual_edit",
                        "ledger_corrected",
                        "status_change",
                        "marked_failed",
                        "failure_reverted",
                        "operation_closed",
                        "operation_reopened",
                    ].includes(t)
                );
            default:
                return t === filter;
        }
    }

    get_filter_count(filter) {
        const events = this.data?.events || [];
        if (!filter || filter === "all") {
            return events.length;
        }
        return events.filter((ev) => this.event_matches_filter(ev, filter)).length;
    }

    get_filtered_events() {
        const events = this.data?.events || [];
        return events.filter((ev) => this.event_matches_filter(ev, this.active_filter));
    }

    render_filters() {
        return `
            <div class="pending-timeline-toolbar">
                <div class="pending-timeline-filter-group">
                    ${this.get_filters()
                        .map((filter) => {
                            const active =
                                this.active_filter === filter.key ? "is-active" : "";
                            return `
                                <button
                                    type="button"
                                    class="pending-timeline-filter ${filter.icon_class || ""} ${active}"
                                    data-filter="${this.escape_attribute(filter.key)}"
                                >
                                    <span class="pending-timeline-filter-icon">
                                        ${filter.icon_svg || ""}
                                    </span>

                                    <span class="pending-timeline-filter-label">
                                        ${this.escape(filter.label)}
                                    </span>

                                    <strong class="pending-timeline-filter-count">
                                        ${this.get_filter_count(filter.key)}
                                    </strong>
                                </button>
                            `;
                        })
                        .join("")}
                </div>
            </div>
        `;
    }

    // ========================================================
    // Main Render & Header
    // ========================================================

    render() {
        const operation =
            this.data
                ?.operation;

        const all_events =
            this.data
                ?.events
            || [];

        if (!operation) {
            this.render_error(
                new Error(
                    "بيانات العملية غير متوفرة."
                )
            );

            return;
        }

        const filtered_events =
            this.get_filtered_events();

        this.$root.html(`
            <div class="pending-timeline-shell" dir="rtl">

                ${this.render_header(
                    operation,
                    all_events.length
                )}

                ${this.render_filters()}

                <div class="pending-timeline-list">

                    ${
                        filtered_events.length
                            ? filtered_events
                                .map(
                                    (
                                        event,
                                        index
                                    ) =>
                                        this.render_event(
                                            event,
                                            index,
                                            filtered_events.length
                                        )
                                )
                                .join("")
                            : this.render_empty()
                    }

                </div>

            </div>
        `);
    }

    render_header(
        operation,
        total
    ) {
        const att_count =
            operation.attachments_count !== undefined
                ? operation.attachments_count
                : total;

        return `
            <div class="pending-timeline-header-section">

                <div class="pending-timeline-top-bar">

                    <div class="pending-timeline-brand">
                        <div class="pending-timeline-brand-icon">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                            </svg>
                        </div>

                        <div class="pending-timeline-brand-text">
                            <div class="pending-timeline-main-title">
                                مسار المعلقات
                            </div>
                            <div class="pending-timeline-main-subtitle">
                                جميع الأحداث والتعديلات المتعلقة بالعملية والمرفقات
                            </div>
                        </div>
                    </div>

                    <div class="pending-timeline-header-actions">
                        <button
                            type="button"
                            class="pending-timeline-refresh"
                            title="تحديث المسار"
                        >
                            <i class="fa fa-refresh" aria-hidden="true"></i>
                            <span>تحديث المسار</span>
                        </button>

                        <button
                            type="button"
                            class="pending-timeline-close-btn"
                            title="إغلاق"
                            aria-label="إغلاق"
                        >
                            ✕
                        </button>
                    </div>

                </div>

                <div class="pending-timeline-header">

                    <div class="pending-timeline-summary-card pending-timeline-operation">
                        <div class="pending-timeline-summary-icon is-blue">
                            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                            </svg>
                        </div>

                        <div class="pending-timeline-summary-body">
                            <span class="pending-timeline-summary-label">رقم العملية</span>
                            <strong class="pending-timeline-summary-val is-ltr">
                                ${this.escape(operation.name)}
                            </strong>
                            ${
                                operation.card_name
                                    ? `<small class="pending-timeline-card-sub">${this.escape(operation.card_name)}</small>`
                                    : ""
                            }
                        </div>
                    </div>

                    <div class="pending-timeline-summary-card">
                        <div class="pending-timeline-summary-icon is-sky">
                            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>

                        <div class="pending-timeline-summary-body">
                            <span class="pending-timeline-summary-label">الحالة</span>
                            <div>
                                <span
                                    class="
                                        pending-timeline-status
                                        ${this.status_class(operation.status)}
                                    "
                                >
                                    ${this.escape(operation.status)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="pending-timeline-summary-card">
                        <div class="pending-timeline-summary-icon is-purple">
                            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                            </svg>
                        </div>

                        <div class="pending-timeline-summary-body">
                            <span class="pending-timeline-summary-label">عدد الأحداث / المرفقات</span>
                            <strong class="pending-timeline-summary-val">
                                ${this.escape(total)} حدث
                                ${operation.attachments_count !== undefined ? `• ${this.escape(att_count)} مرفق` : ""}
                            </strong>
                        </div>
                    </div>

                </div>

                <div class="pending-timeline-financial-summary">

                    ${this.summary_item(
                        "إجمالي المعلق",
                        operation.total_suspended,
                        "suspended"
                    )}

                    ${this.summary_item(
                        "إجمالي المرتجع",
                        operation.total_returned,
                        "returned"
                    )}

                    ${this.summary_item(
                        "المتبقي",
                        operation.remaining_amount,
                        "remaining"
                    )}

                </div>

            </div>
        `;
    }

    summary_item(
        label,
        value,
        kind = "suspended"
    ) {
        return `
            <div class="pending-timeline-fin-card is-${kind}">
                <span>
                    ${this.escape(
                        label
                    )}
                </span>

                <div class="pending-timeline-fin-val">
                    <strong>
                        ${this.format_amount(
                            value
                        )}
                    </strong>
                    <small>
                        ر.س
                    </small>
                </div>
            </div>
        `;
    }

    render_empty() {
        return `
            <div class="pending-timeline-empty">

                <strong>
                    لا توجد أحداث مسجلة
                </strong>

                <span>
                    سيظهر مسار العملية هنا عند تسجيل الأحداث.
                </span>

            </div>
        `;
    }

    // ========================================================
    // Event Config & Timeline Rendering
    // ========================================================

    split_datetime_parts(value) {
        if (!value) {
            return { time: "—", date: "" };
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
        } catch {
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
        return {
            time: this.format_datetime(value),
            date: "",
        };
    }

    get_event_config(type) {
        const svg_plus = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        const svg_pencil = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
        const svg_gear = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
        const svg_eye = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        const svg_download = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        const svg_trash = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
        const svg_paperclip = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
        const svg_flag = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
        const svg_check = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        const svg_return = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
        const svg_refresh = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;

        const configs = {
            manual_edit: {
                badge_label: "تعديل بيانات العملية",
                theme_class: "theme-purple",
                dot_svg: svg_pencil,
                badge_svg: svg_gear,
            },
            attachment_viewed: {
                badge_label: "عرض مرفق",
                theme_class: "theme-sky",
                dot_svg: svg_eye,
                badge_svg: svg_eye,
            },
            attachment_downloaded: {
                badge_label: "تنزيل مرفق",
                theme_class: "theme-green",
                dot_svg: svg_download,
                badge_svg: svg_download,
            },
            attachment_deleted: {
                badge_label: "إزالة مرفق",
                theme_class: "theme-red",
                dot_svg: svg_trash,
                badge_svg: svg_trash,
            },
            attachment_added: {
                badge_label: "إضافة مرفق",
                theme_class: "theme-violet",
                dot_svg: svg_paperclip,
                badge_svg: svg_paperclip,
            },
            status_change: {
                badge_label: "تغيير حالة العملية",
                theme_class: "theme-orange",
                dot_svg: svg_flag,
                badge_svg: svg_flag,
            },
            operation_closed: {
                badge_label: "إنهاء العملية",
                theme_class: "theme-teal",
                dot_svg: svg_check,
                badge_svg: svg_check,
            },
            operation_reopened: {
                badge_label: "إعادة فتح العملية",
                theme_class: "theme-indigo",
                dot_svg: svg_refresh,
                badge_svg: svg_refresh,
            },
            created: {
                badge_label: "إنشاء العملية",
                theme_class: "theme-blue",
                dot_svg: svg_plus,
                badge_svg: svg_plus,
            },
            return_added: {
                badge_label: "تسجيل مبلغ مرتجع",
                theme_class: "theme-emerald",
                dot_svg: svg_return,
                badge_svg: svg_return,
            },
            ledger_corrected: {
                badge_label: "تعديل الحركة المالية",
                theme_class: "theme-indigo",
                dot_svg: svg_pencil,
                badge_svg: svg_gear,
            },
            marked_failed: {
                badge_label: "تغيير حالة المعلقة",
                theme_class: "theme-red",
                dot_svg: svg_flag,
                badge_svg: svg_flag,
            },
            failure_reverted: {
                badge_label: "إلغاء حالة الفشل",
                theme_class: "theme-teal",
                dot_svg: svg_refresh,
                badge_svg: svg_refresh,
            },
        };

        return (
            configs[type]
            || {
                badge_label: this.event_labels[type] || "حدث",
                theme_class: "theme-blue",
                dot_svg: svg_paperclip,
                badge_svg: svg_paperclip,
            }
        );
    }

    render_event(
        event,
        index,
        total_filtered = 0
    ) {
        const type =
            event.event_type
            || "";

        const config =
            this.get_event_config(type);

        const title =
            type === "marked_failed"
                ? "تم تغيير حالة المعلقة"
                : (
                    event.event_title
                    || this.event_labels[type]
                    || type
                    || "حدث"
                );

        const dt_parts =
            this.split_datetime_parts(event.event_datetime);

        const total_len =
            total_filtered
            || (this.data?.events?.length || 0);

        return `
            <article
                class="
                    pending-timeline-event
                    ${config.theme_class}
                    pending-timeline-event-${this.escape_attribute(
                        type
                    )}
                "
            >

                <div class="pending-timeline-axis">

                    <span
                        class="
                            pending-timeline-dot
                            ${this.event_dot_class(
                                type
                            )}
                        "
                    >
                        ${config.dot_svg}
                    </span>

                    ${
                        index < total_len - 1
                            ? `
                                <span
                                    class="pending-timeline-line"
                                ></span>
                            `
                            : ""
                    }

                </div>

                <div class="pending-timeline-event-card">

                    <div class="pending-timeline-event-head">

                        <div class="pending-timeline-event-title-wrap">
                            <h4>
                                ${this.escape(
                                    title
                                )}
                            </h4>

                            <div class="pending-timeline-event-meta">
                                <span class="pending-timeline-user-item">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                        <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"/>
                                    </svg>
                                    <span>بواسطة:</span>
                                    <strong dir="auto">
                                        ${this.escape(
                                            event.event_user_full_name
                                            || event.event_user
                                        )}
                                    </strong>
                                </span>

                                ${
                                    event.effective_datetime
                                        ? `
                                            <span>•</span>
                                            <span class="pending-timeline-effective-time">
                                                وقت الحدث:
                                                ${this.format_datetime(
                                                    event.effective_datetime
                                                )}
                                            </span>
                                        `
                                        : ""
                                }
                            </div>
                        </div>

                        <div class="pending-timeline-event-head-left">

                            <div class="pending-timeline-event-badge">
                                <span class="pending-timeline-event-badge-icon">
                                    ${config.badge_svg}
                                </span>
                                <span>${this.escape(config.badge_label)}</span>
                            </div>

                            <div class="pending-timeline-event-time">
                                <div class="pending-timeline-time-row">
                                    <span>${this.escape(dt_parts.time)}</span>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                </div>
                                ${
                                    dt_parts.date
                                        ? `
                                            <div class="pending-timeline-date-row">
                                                <span class="pending-timeline-date-text">${this.escape(dt_parts.date)}</span>
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

                    ${this.render_event_body(
                        event
                    )}

                </div>

            </article>
        `;
    }

    render_event_body(
        event
    ) {
        switch (
            event.event_type
        ) {
            case "created":
                return this.render_created(
                    event
                );

            case "manual_edit":
                return this.render_manual_edit(
                    event
                );

            case "return_added":
                return this.render_return_added(
                    event
                );

            case "status_change":
                return this.render_status_change(
                    event
                );

            case "marked_failed":
                return this.render_marked_failed(
                    event
                );

            case "ledger_corrected":
                return this.render_ledger_corrected(
                    event
                );

            case "attachment_added":
            case "attachment_deleted":
            case "attachment_viewed":
            case "attachment_downloaded":
                return this.render_attachment_event(
                    event
                );

            case "failure_reverted":
                return this.render_status_change(
                    event
                );

            case "operation_closed":
            case "operation_reopened":
                return this.render_closure_event(
                    event
                );

            default:
                return this.render_generic_details(
                    event
                );
        }
    }

    render_attachment_event(
        event
    ) {
        const details =
            event.details
            || {};

        const file_name =
            details.file_name
            || details.file_id
            || "—";

        const lower = String(file_name).toLowerCase();
        const is_img = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/.test(lower);
        const badge_text = is_img ? "IMG" : "PDF";
        const badge_class = is_img ? "is-img" : "is-pdf";

        return `
            <div class="pending-timeline-file-row">

                <div class="pending-timeline-file-label">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <span>الملف</span>
                </div>

                <div class="pending-timeline-file-content">
                    <strong class="pending-timeline-file-name">
                        ${this.escape(file_name)}
                    </strong>
                    <span class="pending-timeline-file-badge ${badge_class}">
                        ${badge_text}
                    </span>
                </div>

            </div>

            ${this.render_remarks(
                event.remarks
            )}
        `;
    }

    render_created(
        event
    ) {
        const summary =
            event.details
                ?.financial_summary
            || {};

        return `
            ${this.render_financial_transition(
                null,
                summary
            )}

            ${this.render_remarks(
                event.remarks
            )}
        `;
    }

    render_manual_edit(
        event
    ) {
        const changes =
            event.details
                ?.changes
            || {};

        const entries =
            Object.entries(
                changes
            );

        if (!entries.length) {
            return this.render_remarks(
                event.remarks
            );
        }

        return `
            <div class="pending-timeline-changes-table">

                <div class="pending-timeline-change-row pending-timeline-change-head">
                    <div>الحقل</div>
                    <div>القيمة السابقة</div>
                    <div>القيمة الجديدة</div>
                </div>

                ${entries.map(
                    (
                        [
                            fieldname,
                            change,
                        ]
                    ) => `
                        <div class="pending-timeline-change-row pending-timeline-change">

                            <div class="pending-timeline-change-field">
                                <strong>
                                    ${this.escape(
                                        this.field_labels[
                                            fieldname
                                        ]
                                        ||
                                        fieldname
                                    )}
                                </strong>
                            </div>

                            <div class="pending-timeline-change-before">
                                <span class="before">
                                    ${this.escape(
                                        fieldname === "operation_datetime" ||
                                        /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(String(change?.before || "").trim())
                                            ? this.format_datetime(change?.before)
                                            : (change?.before || "—")
                                    )}
                                </span>
                            </div>

                            <div class="pending-timeline-change-after">
                                <span class="after">
                                    ${this.escape(
                                        fieldname === "operation_datetime" ||
                                        /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(String(change?.after || "").trim())
                                            ? this.format_datetime(change?.after)
                                            : (change?.after || "—")
                                    )}
                                </span>
                            </div>

                        </div>
                    `
                ).join("")}

            </div>

            ${this.render_remarks(
                event.remarks
            )}
        `;
    }

    render_return_added(
        event
    ) {
        const details =
            event.details
            || {};

        const note =
            String(
                details.return_note
                || event.remarks
                || "بلا ملاحظات"
            ).trim();

        const return_date_str =
            details.return_date
                ? this.format_date(details.return_date)
                : (this.split_datetime_parts(event.effective_datetime || event.event_datetime).date || "—");

        return `
            <div class="pending-timeline-return-bar">

                <div class="pending-timeline-return-cell">
                    <span class="pending-timeline-return-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                            <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                            <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"></path>
                        </svg>
                    </span>
                    <div class="pending-timeline-return-cell-body">
                        <span class="pending-timeline-return-label">المبلغ المرتجع</span>
                        <strong class="pending-timeline-return-amount-pill">
                            <span dir="ltr">${this.format_amount(details.returned_amount)}</span>
                            <span>ر.س</span>
                        </strong>
                    </div>
                </div>

                <div class="pending-timeline-return-cell">
                    <span class="pending-timeline-return-icon">
                        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                    </span>
                    <div class="pending-timeline-return-cell-body">
                        <span class="pending-timeline-return-label">تاريخ الإرجاع</span>
                        <strong class="pending-timeline-return-value" dir="ltr">
                            ${this.escape(return_date_str)}
                        </strong>
                    </div>
                </div>

                <div class="pending-timeline-return-cell">
                    <span class="pending-timeline-return-icon">
                        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </span>
                    <div class="pending-timeline-return-cell-body">
                        <span class="pending-timeline-return-label">ملاحظة الإرجاع</span>
                        <strong class="pending-timeline-return-value">
                            ${this.escape(note)}
                        </strong>
                    </div>
                </div>

            </div>

            ${this.render_financial_transition(
                details.before,
                details.after
            )}
        `;
    }

    render_marked_failed(
        event
    ) {
        const details =
            event.details
            || {};

        const note =
            String(
                details.failed_note
                || event.remarks
                || ""
            ).trim();

        const new_status =
            details.after_status
            || "معلقة فاشلة";

        const changed_at =
            details.failed_at
            || event.effective_datetime
            || event.event_datetime
            || "";

        return `
            <div class="pending-timeline-failed-event">

                <div class="pending-timeline-failed-bar">

                    <div class="pending-timeline-failed-cell">
                        <span class="pending-timeline-failed-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </span>
                        <div class="pending-timeline-failed-cell-body">
                            <span class="pending-timeline-failed-label">الحالة الجديدة</span>
                            <strong class="pending-timeline-failed-status-pill">
                                ${this.escape(new_status)}
                            </strong>
                        </div>
                    </div>

                    <div class="pending-timeline-failed-cell">
                        <span class="pending-timeline-failed-icon">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                        </span>
                        <div class="pending-timeline-failed-cell-body">
                            <span class="pending-timeline-failed-label">وقت التغيير</span>
                            <strong class="pending-timeline-failed-time-val">
                                ${this.escape(changed_at ? this.format_datetime(changed_at) : "—")}
                            </strong>
                        </div>
                    </div>

                </div>

                <div class="pending-timeline-failed-note-bar">
                    <div class="pending-timeline-failed-note-label">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            <line x1="8" y1="9" x2="16" y2="9"></line>
                            <line x1="8" y1="13" x2="13" y2="13"></line>
                        </svg>
                        <span>ملاحظة</span>
                    </div>
                    <div class="pending-timeline-failed-note-text">
                        ${this.escape(note || "بلا ملاحظات")}
                    </div>
                </div>

            </div>
        `;
    }

    render_status_change(
        event
    ) {
        const details =
            event.details
            || {};

        return `
            <div class="pending-timeline-status-transition">

                <span
                    class="
                        pending-timeline-status
                        ${this.status_class(
                            details.before_status
                        )}
                    "
                >
                    ${this.escape(
                        details.before_status
                    )}
                </span>

                <span class="arrow">
                    ←
                </span>

                <span
                    class="
                        pending-timeline-status
                        ${this.status_class(
                            details.after_status
                        )}
                    "
                >
                    ${this.escape(
                        details.after_status
                    )}
                </span>

            </div>

            ${this.render_status_financial_bar(
                details.financial_summary
            )}

            ${this.render_remarks(
                event.remarks
            )}
        `;
    }

    render_status_financial_bar(
        summary
    ) {
        if (!summary) {
            return "";
        }

        return `
            <div class="pending-timeline-status-fin-bar">

                <div class="pending-timeline-status-fin-cell">
                    <span class="pending-timeline-status-fin-icon">
                        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <ellipse cx="10" cy="6" rx="6" ry="2.5"></ellipse>
                            <path d="M4 6v5c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V6"></path>
                            <path d="M8 14.5v3c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5v-5c0-1.15-1.86-2.12-4.4-2.4"></path>
                        </svg>
                    </span>
                    <div class="pending-timeline-status-fin-body">
                        <span class="pending-timeline-status-fin-label">المعلق</span>
                        <strong class="pending-timeline-status-fin-pill">
                            <span dir="ltr">${this.format_amount(summary.total_suspended)}</span>
                            <span>ر.س</span>
                        </strong>
                    </div>
                </div>

                <div class="pending-timeline-status-fin-cell">
                    <span class="pending-timeline-status-fin-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                            <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                            <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"></path>
                        </svg>
                    </span>
                    <div class="pending-timeline-status-fin-body">
                        <span class="pending-timeline-status-fin-label">المرتجع</span>
                        <strong class="pending-timeline-status-fin-pill">
                            <span dir="ltr">${this.format_amount(summary.total_returned)}</span>
                            <span>ر.س</span>
                        </strong>
                    </div>
                </div>

                <div class="pending-timeline-status-fin-cell">
                    <span class="pending-timeline-status-fin-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                            <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                        </svg>
                    </span>
                    <div class="pending-timeline-status-fin-body">
                        <span class="pending-timeline-status-fin-label">المتبقي</span>
                        <strong class="pending-timeline-status-fin-pill">
                            <span dir="ltr">${this.format_amount(summary.remaining_amount)}</span>
                            <span>ر.س</span>
                        </strong>
                    </div>
                </div>

            </div>
        `;
    }

    render_closure_event(
        event
    ) {
        const details =
            event.details
            || {};

        const note =
            String(
                event.remarks
                || details.closure_note
                || details.reopen_note
                || ""
            ).trim();

        return `
            <div class="pending-timeline-closure-box">
                ${this.escape(note || "بلا ملاحظات")}
            </div>

            ${this.render_financial_transition(
                details.before || null,
                details.after || details.financial_summary || null
            )}
        `;
    }

    render_ledger_corrected(
        event
    ) {
        const details =
            event.details
            || {};

        const diff =
            details.ledger_diff
            || {};

        const added =
            Array.isArray(
                diff.added
            )
                ? diff.added.length
                : 0;

        const removed =
            Array.isArray(
                diff.removed
            )
                ? diff.removed.length
                : 0;

        const changed =
            Array.isArray(
                diff.changed
            )
                ? diff.changed.length
                : 0;

        return `
            <div class="pending-timeline-diff-summary">
                <span>
                    صفوف مضافة:
                    <strong>
                        ${added}
                    </strong>
                </span>

                <span>
                    صفوف محذوفة:
                    <strong>
                        ${removed}
                    </strong>
                </span>

                <span>
                    صفوف معدلة:
                    <strong>
                        ${changed}
                    </strong>
                </span>
            </div>

            ${this.render_financial_transition(
                details.before,
                details.after
            )}

            ${this.render_remarks(
                event.remarks
            )}
        `;
    }

    render_generic_details(
        event
    ) {
        const details = event.details || {};
        if (details.file_name || details.file_id) {
            return this.render_attachment_event(event);
        }
        return this.render_remarks(
            event.remarks
        );
    }

    render_financial_transition(
        before,
        after
    ) {
        if (
            !before
            &&
            !after
        ) {
            return "";
        }

        return `
            <div class="pending-timeline-financial-transition">
                ${
                    before
                        ? `
                            <div>
                                <span>
                                    قبل
                                </span>

                                ${this.financial_values(
                                    before
                                )}
                            </div>
                        `
                        : ""
                }

                ${
                    after
                        ? `
                            <div>
                                <span>
                                    بعد
                                </span>

                                ${this.financial_values(
                                    after
                                )}
                            </div>
                        `
                        : ""
                }
            </div>
        `;
    }

    financial_values(
        summary
    ) {
        return `
            <small>
                المعلق:
                <strong>
                    ${this.format_amount(
                        summary.total_suspended
                    )}
                </strong>
                ر.س
            </small>

            <small>
                المرتجع:
                <strong>
                    ${this.format_amount(
                        summary.total_returned
                    )}
                </strong>
                ر.س
            </small>

            <small>
                المتبقي:
                <strong>
                    ${this.format_amount(
                        summary.remaining_amount
                    )}
                </strong>
                ر.س
            </small>
        `;
    }

    render_remarks(
        remarks
    ) {
        remarks =
            String(
                remarks
                || ""
            ).trim();

        if (!remarks) {
            return "";
        }

        return `
            <div class="pending-timeline-remarks">
                ${this.escape(
                    remarks
                )}
            </div>
        `;
    }

    render_source(
        source
    ) {
        return source
            === "System"
                ? "النظام"
                : "المستخدم";
    }

    event_dot_class(
        type
    ) {
        const classes = {
            created:
                "dot-created",

            manual_edit:
                "dot-edit",

            return_added:
                "dot-return",

            ledger_corrected:
                "dot-correction",

            status_change:
                "dot-status",

            attachment_added:
                "dot-attachment",

            attachment_deleted:
                "dot-deleted",

            attachment_viewed:
                "dot-viewed",

            attachment_downloaded:
                "dot-downloaded",

            operation_closed:
                "dot-closed",

            operation_reopened:
                "dot-reopened",

            marked_failed:
                "dot-failed",

            failure_reverted:
                "dot-status",
        };

        return (
            classes[type]
            || "dot-default"
        );
    }

    status_class(
        status
    ) {
        if (
            status
            === "معلقة فاشلة"
        ) {
            return "status-failed";
        }

        if (
            status
            === "مرتجعة مكتملة"
        ) {
            return "status-complete";
        }

        if (
            status
            === "مرتجعة غير مكتملة"
        ) {
            return "status-partial";
        }

        return "status-under-action";
    }

    format_amount(
        value
    ) {
        const number =
            Number(value);

        if (
            !Number.isFinite(
                number
            )
        ) {
            return "—";
        }

        return new Intl
            .NumberFormat(
                "en-US",
                {
                    maximumFractionDigits:
                        9,
                }
            )
            .format(
                number
            );
    }

    format_date(
        value
    ) {
        if (
            !value
        ) {
            return "—";
        }

        try {
            return frappe.datetime
                .str_to_user(
                    value
                );

        } catch (
            error
        ) {
            return this.escape(
                value
            );
        }
    }

    format_datetime(
        value
    ) {
        if (!value) {
            return "—";
        }
        if (typeof window.archive_format_datetime === "function") {
            return this.escape(window.archive_format_datetime(value, "—"));
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
        } catch {
            // fallback
        }
        const m = resolved.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
        if (m) {
            const h24 = parseInt(m[2], 10);
            const min = String(m[3]).padStart(2, "0");
            const period = h24 >= 12 ? "م" : "ص";
            const h12 = String(h24 % 12 || 12).padStart(2, "0");
            return this.escape(`${m[1]}، ${h12}:${min} ${period}`);
        }
        return this.escape(resolved);
    }

    escape(
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
            );
    }

    escape_attribute(
        value
    ) {
        return frappe.utils
            .escape_html(
                String(
                    value
                    || ""
                )
            );
    }

    destroy() {
        if (
            this.is_destroyed
        ) {
            return;
        }

        this.is_destroyed =
            true;

        this.dialog
            ?.$wrapper
            ?.off(
                ".pending_timeline"
            );

        this.dialog
            ?.$wrapper
            ?.remove();
    }
};
