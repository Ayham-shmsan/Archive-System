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
                "تصحيح الحركة المالية",

            status_change:
                "تغيير حالة العملية",

            attachment_added:
                "إضافة مرفق",

            attachment_deleted:
                "حذف مرفق",
        };

        this.field_labels = {
            card_name:
                "اسم البطاقة",

            card_number:
                "رقم البطاقة",

            operation_datetime:
                "تاريخ ووقت العملية",

            card_owner:
                "مالك البطاقة",

            bank:
                "البنك",

            region:
                "المنطقة",

            machine_location:
                "موقع المكينة",

            machine_no:
                "رقم المكينة",

            branch_no:
                "رقم الفرع",

            representative:
                "المندوب",

            notes:
                "الملاحظات",
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
                    `مسار العملية ${this.name}`,

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

    render() {
        const operation =
            this.data
                ?.operation;

        const events =
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

        this.$root.html(`
            ${this.render_header(
                operation,
                events.length
            )}

            <div class="pending-timeline-list">

                ${
                    events.length
                        ? events
                            .map(
                                (
                                    event,
                                    index
                                ) =>
                                    this.render_event(
                                        event,
                                        index
                                    )
                            )
                            .join("")
                        : this.render_empty()
                }

            </div>
        `);
    }

    render_header(
        operation,
        total
    ) {
        return `
            <div class="pending-timeline-header">

                <div class="pending-timeline-operation">

                    <div>
                        <strong>
                            ${this.escape(
                                operation.name
                            )}
                        </strong>

                        <span>
                            ${this.escape(
                                operation.card_name
                            )}
                        </span>
                    </div>

                    <span
                        class="
                            pending-timeline-status
                            ${this.status_class(
                                operation.status
                            )}
                        "
                    >
                        ${this.escape(
                            operation.status
                        )}
                    </span>

                </div>

                <div class="pending-timeline-header-actions">

                    <span>
                        ${this.escape(
                            total
                        )}
                        حدث
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
                        تحديث المسار
                    </button>

                </div>

            </div>

            <div class="pending-timeline-financial-summary">

                ${this.summary_item(
                    "إجمالي المعلق",
                    operation.total_suspended,
                    operation.currency
                )}

                ${this.summary_item(
                    "إجمالي المرتجع",
                    operation.total_returned,
                    operation.currency
                )}

                ${this.summary_item(
                    "المتبقي",
                    operation.remaining_amount,
                    operation.currency
                )}

            </div>
        `;
    }

    summary_item(
        label,
        value,
        currency
    ) {
        return `
            <div>
                <span>
                    ${this.escape(
                        label
                    )}
                </span>

                <strong>
                    ${this.format_amount(
                        value
                    )}
                </strong>

                <small>
                    ${this.escape(
                        currency
                    )}
                </small>
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

    render_event(
        event,
        index
    ) {
        const type =
            event.event_type
            || "";

        const title =
            event.event_title
            ||
            this.event_labels[
                type
            ]
            ||
            type
            ||
            "حدث";

        return `
            <article
                class="
                    pending-timeline-event
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
                    ></span>

                    ${
                        index
                        <
                        (
                            this.data
                                .events
                                .length
                            - 1
                        )
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

                        <div>
                            <h4>
                                ${this.escape(
                                    title
                                )}
                            </h4>

                            <div
                                class="pending-timeline-event-meta"
                            >
                                ${this.escape(
                                    event.event_user_full_name
                                    || event.event_user
                                )}

                                <span>•</span>

                                ${this.format_datetime(
                                    event.event_datetime
                                )}

                                <span>•</span>

                                ${this.render_source(
                                    event.event_source
                                )}
                            </div>
                        </div>

                        ${
                            event.effective_datetime
                                ? `
                                    <div
                                        class="pending-timeline-effective-time"
                                    >
                                        وقت الحدث:
                                        ${this.format_datetime(
                                            event.effective_datetime
                                        )}
                                    </div>
                                `
                                : ""
                        }

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

            case "ledger_corrected":
                return this.render_ledger_corrected(
                    event
                );

            case "attachment_added":
            case "attachment_deleted":
                return this.render_attachment_event(
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

        return `
            <div class="pending-timeline-highlight">

                <span>
                    الملف
                </span>

                <strong>
                    ${this.escape(
                        details.file_name
                        || details.file_id
                        || "—"
                    )}
                </strong>

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
            <div class="pending-timeline-changes">

                ${entries.map(
                    (
                        [
                            fieldname,
                            change,
                        ]
                    ) => `
                        <div class="pending-timeline-change">

                            <strong>
                                ${this.escape(
                                    this.field_labels[
                                        fieldname
                                    ]
                                    ||
                                    fieldname
                                )}
                            </strong>

                            <div>
                                <span class="before">
                                    ${this.escape(
                                        change
                                            ?.before
                                        || "—"
                                    )}
                                </span>

                                <span class="arrow">
                                    ←
                                </span>

                                <span class="after">
                                    ${this.escape(
                                        change
                                            ?.after
                                        || "—"
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

        const currency =
            details.after
                ?.currency
            ||
            details.before
                ?.currency
            ||
            this.data
                ?.operation
                ?.currency
            ||
            "";

        return `
            <div class="pending-timeline-highlight">

                <span>
                    المبلغ المرتجع
                </span>

                <strong>
                    ${this.format_amount(
                        details.returned_amount
                    )}
                    ${this.escape(
                        currency
                    )}
                </strong>

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

            ${this.render_financial_transition(
                null,
                details.financial_summary
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
            ${this.render_remarks(
                event.remarks
                ||
                details.reason
            )}

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
        `;
    }

    render_generic_details(
        event
    ) {
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

        const currency =
            after?.currency
            ||
            before?.currency
            ||
            this.data
                ?.operation
                ?.currency
            ||
            "";

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
                                    before,
                                    currency
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
                                    after,
                                    currency
                                )}
                            </div>
                        `
                        : ""
                }

            </div>
        `;
    }

    financial_values(
        summary,
        currency
    ) {
        return `
            <small>
                المعلق:
                <strong>
                    ${this.format_amount(
                        summary.total_suspended
                    )}
                </strong>

                ${this.escape(
                    currency
                )}
            </small>

            <small>
                المرتجع:
                <strong>
                    ${this.format_amount(
                        summary.total_returned
                    )}
                </strong>

                ${this.escape(
                    currency
                )}
            </small>

            <small>
                المتبقي:
                <strong>
                    ${this.format_amount(
                        summary.remaining_amount
                    )}
                </strong>

                ${this.escape(
                    currency
                )}
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
                "dot-attachment",
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

        } catch {
            return this.escape(
                value
            );
        }
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