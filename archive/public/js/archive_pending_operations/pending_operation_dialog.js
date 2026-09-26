window.ArchivePendingOperationDialog =
class ArchivePendingOperationDialog {
    constructor(options = {}) {
        this.options = options;

        this.on_created =
            typeof options.on_created === "function"
                ? options.on_created
                : null;

        this.row_counter = 0;
        this.is_saving = false;
        this.is_destroyed = false;

        this.make_dialog();
        this.render_ledger_editor();
        this.setup_attachment_manager();
        this.bind_events();
        this.setup_smart_autocomplete();

        this.add_ledger_row({
            suspended_amount: "",
            returned_amount: 0,
            return_datetime: "",
        });

        this.recalculate_preview();
    }

    setup_attachment_manager() {
        if (
            !window
                .ArchivePendingAttachmentManager
        ) {
            return;
        }

        const $root =
            this.dialog
                .fields_dict
                .attachments_editor
                .$wrapper
                .find(
                    ".pending-create-attachments"
                );

        this.attachment_manager =
            new window
                .ArchivePendingAttachmentManager({
                    root:
                        $root,

                    deferred:
                        true,

                    can_manage:
                        true,
                });
    }
    setup_smart_autocomplete() {
        if (
            !window
                .ArchivePendingSmartAutocomplete
        ) {
            return;
        }

        this.smart_autocomplete =
            new window
                .ArchivePendingSmartAutocomplete({
                    dialog:
                        this.dialog,

                    fieldnames: [
                        "machine_location",
                        "machine_no",
                        "branch_no",
                    ],

                    context_provider:
                        () =>
                            this.get_smart_lookup_context(),

                    enabled_provider:
                        () =>
                            !this.is_saving,

                    limit:
                        10,
                });
    }


    get_smart_lookup_context() {
        return {
            bank:
                this.dialog
                    .get_value(
                        "bank"
                    ),

            region:
                this.dialog
                    .get_value(
                        "region"
                    ),

            machine_location:
                this.dialog
                    .get_value(
                        "machine_location"
                    ),

            machine_no:
                this.dialog
                    .get_value(
                        "machine_no"
                    ),

            branch_no:
                this.dialog
                    .get_value(
                        "branch_no"
                    ),
        };
    }

    make_dialog() {
        this.dialog = new frappe.ui.Dialog({
            title:
                __("إنشاء عملية معلقة"),

            size:
                "extra-large",

            fields: [

                {
                    fieldtype:
                        "Section Break",

                    label:
                        "بيانات البطاقة والعملية",
                },

                {
                    fieldname:
                        "card_name",

                    fieldtype:
                        "Data",

                    label:
                        "اسم البطاقة",

                    reqd:
                        1,
                },

                {
                    fieldname:
                        "card_number",

                    fieldtype:
                        "Data",

                    label:
                        "رقم البطاقة",

                    reqd:
                        1,
                },

                {
                    fieldtype:
                        "Column Break",
                },

                {
                    fieldname:
                        "operation_datetime",

                    fieldtype:
                        "Datetime",

                    label:
                        "تاريخ ووقت العملية",

                    reqd:
                        1,

                    default:
                        frappe.datetime
                            .now_datetime(),
                },

                {
                    fieldname:
                        "card_owner",

                    fieldtype:
                        "Link",

                    label:
                        "مالك البطاقة",

                    options:
                        "Archive Card Owner",

                    reqd:
                        1,
                },

                {
                    fieldname:
                        "currency",

                    fieldtype:
                        "Link",

                    label:
                        "العملة",

                    options:
                        "Currency",

                    reqd:
                        1,

                    default:
                        this.get_default_currency(),

                    onchange:
                        () => {
                            this.recalculate_preview();
                        },
                },

                {
                    fieldtype:
                        "Section Break",

                    label:
                        "بيانات البنك والمنطقة والمكينة والفرع والمندوب",
                },

                {
                    fieldname:
                        "bank",

                    fieldtype:
                        "Link",

                    label:
                        "البنك",

                    options:
                        "Archive Bank",

                    reqd:
                        1,
                },

                {
                    fieldname:
                        "region",

                    fieldtype:
                        "Link",

                    label:
                        "المنطقة",

                    options:
                        "Archive Region",

                    reqd:
                        1,
                },

                {
                    fieldname:
                        "machine_location",

                    fieldtype:
                        "Data",

                    label:
                        "موقع المكينة",

                    reqd:
                        1,
                },

                {
                    fieldtype:
                        "Column Break",
                },

                {
                    fieldname:
                        "machine_no",

                    fieldtype:
                        "Data",

                    label:
                        "رقم المكينة",

                    reqd:
                        1,
                },

                {
                    fieldname:
                        "branch_no",

                    fieldtype:
                        "Data",

                    label:
                        "رقم الفرع",

                    reqd:
                        1,
                },

                {
                    fieldname:
                        "representative",

                    fieldtype:
                        "Link",

                    label:
                        "المندوب",

                    options:
                        "Archive Representative",

                    reqd:
                        1,
                },

                {
                    fieldtype:
                        "Section Break",

                    label:
                        "جدول حركة المبلغ",
                },

                {
                    fieldname:
                        "ledger_editor",

                    fieldtype:
                        "HTML",

                    options:
                        `
                            <div
                                class="pending-create-ledger-editor"
                            ></div>
                        `,
                },

                {
                    fieldtype:
                        "Section Break",

                    label:
                        "ملخص العملية",
                },

                {
                    fieldname:
                        "financial_summary",

                    fieldtype:
                        "HTML",

                    options:
                        `
                            <div
                                class="pending-create-summary"
                            ></div>
                        `,
                },

                {
                    fieldtype:
                        "Section Break",

                    label:
                        "ملاحظات العملية",
                },

                {
                    fieldtype:
                        "Section Break",

                    label:
                        "مرفقات العملية",
                },

                {
                    fieldname:
                        "attachments_editor",

                    fieldtype:
                        "HTML",

                    options:
                        `
                            <div
                                class="pending-create-attachments"
                            ></div>
                        `,
                },
                {
                    fieldname:
                        "notes",

                    fieldtype:
                        "Small Text",

                    label:
                        "ملاحظات",
                },
            ],

            primary_action_label:
                __("حفظ العملية"),

            primary_action:
                () => {
                    this.save();
                },
        });

        this.dialog.$wrapper
            .addClass(
                "archive-pending-operation-dialog"
            );

        this.dialog.$wrapper
            .attr(
                "dir",
                "rtl"
            );

        this.dialog.$wrapper
            .on(
                "hidden.bs.modal.archive_pending_create",
                () => {
                    this.destroy();
                }
            );
    }

    render_ledger_editor() {
        this.$ledger_root =
            this.dialog
                .fields_dict
                .ledger_editor
                .$wrapper
                .find(
                    ".pending-create-ledger-editor"
                );

        this.$ledger_root.html(`
            <div class="pending-ledger-toolbar">

                <div>
                    <div class="pending-ledger-title">
                        الحركات المالية
                    </div>

                    <div class="pending-ledger-subtitle">
                        يتم احتساب الرصيد والحالة تلقائيًا للمعاينة.
                        الحساب النهائي يتم على السيرفر.
                    </div>
                </div>

                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        btn-sm
                        pending-ledger-add-row
                    "
                >
                    + إضافة حركة
                </button>

            </div>

            <div class="pending-ledger-scroll">

                <table class="pending-ledger-table">

                    <thead>
                        <tr>
                            <th class="pending-col-index">
                                #
                            </th>

                            <th>
                                المبلغ المعلق
                            </th>

                            <th>
                                المبلغ المرتجع
                            </th>

                            <th>
                                المتبقي
                            </th>

                            <th>
                                تاريخ الإرجاع
                            </th>

                            <th class="pending-col-action">
                            </th>
                        </tr>
                    </thead>

                    <tbody
                        class="pending-ledger-rows"
                    ></tbody>

                </table>

            </div>
        `);

        this.$ledger_rows =
            this.$ledger_root.find(
                ".pending-ledger-rows"
            );

        this.$summary_root =
            this.dialog
                .fields_dict
                .financial_summary
                .$wrapper
                .find(
                    ".pending-create-summary"
                );

        this.$summary_root.html(`
            <div class="pending-create-summary-grid">

                <div class="pending-create-summary-card">
                    <span class="pending-summary-label">
                        إجمالي المعلق
                    </span>

                    <strong
                        class="pending-summary-suspended"
                    >
                        0
                    </strong>

                    <span
                        class="pending-summary-currency"
                    >
                        —
                    </span>
                </div>

                <div class="pending-create-summary-card">
                    <span class="pending-summary-label">
                        إجمالي المرتجع
                    </span>

                    <strong
                        class="pending-summary-returned"
                    >
                        0
                    </strong>

                    <span
                        class="pending-summary-currency"
                    >
                        —
                    </span>
                </div>

                <div class="pending-create-summary-card">
                    <span class="pending-summary-label">
                        المتبقي
                    </span>

                    <strong
                        class="pending-summary-remaining"
                    >
                        0
                    </strong>

                    <span
                        class="pending-summary-currency"
                    >
                        —
                    </span>
                </div>

                <div
                    class="
                        pending-create-summary-card
                        pending-create-status-card
                    "
                >
                    <span class="pending-summary-label">
                        الحالة
                    </span>

                    <strong
                        class="
                            pending-summary-status
                            status-under-action
                        "
                    >
                        تحت الإجراء
                    </strong>
                </div>

            </div>
        `);
    }

    bind_events() {
        this.$ledger_root
            .on(
                "click",
                ".pending-ledger-add-row",
                () => {
                    this.add_ledger_row();
                }
            );

        this.$ledger_root
            .on(
                "click",
                ".pending-ledger-remove-row",
                (event) => {
                    this.remove_ledger_row(
                        $(event.currentTarget)
                            .closest(
                                ".pending-ledger-row"
                            )
                    );
                }
            );

        this.$ledger_root
            .on(
                "input",
                `
                    .pending-ledger-suspended,
                    .pending-ledger-returned
                `,
                (event) => {
                    const $input =
                        $(event.currentTarget);

                    const $row =
                        $input.closest(
                            ".pending-ledger-row"
                        );

                    if (
                        $input.hasClass(
                            "pending-ledger-returned"
                        )
                    ) {
                        this.sync_return_datetime(
                            $row
                        );
                    }

                    this.recalculate_preview();
                }
            );

        this.$ledger_root
            .on(
                "change",
                ".pending-ledger-return-datetime",
                () => {
                    this.recalculate_preview();
                }
            );
    }

    add_ledger_row(values = {}) {
        this.row_counter += 1;

        const key =
            `pending-ledger-${this.row_counter}`;

        const suspended =
            values.suspended_amount
            ?? "";

        const returned =
            values.returned_amount
            ?? 0;

        const return_datetime =
            values.return_datetime
            || "";

        const has_return =
            Number(returned) > 0;

        const html = `
            <tr
                class="pending-ledger-row"
                data-row-key="${key}"
            >

                <td
                    class="
                        pending-ledger-index
                        pending-col-index
                    "
                >
                </td>

                <td>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        inputmode="decimal"
                        class="
                            form-control
                            pending-ledger-suspended
                        "
                        value="${this.escape_attribute(
                            suspended
                        )}"
                        placeholder="0"
                        aria-label="المبلغ المعلق"
                    >
                </td>

                <td>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        inputmode="decimal"
                        class="
                            form-control
                            pending-ledger-returned
                        "
                        value="${this.escape_attribute(
                            returned
                        )}"
                        placeholder="0"
                        aria-label="المبلغ المرتجع"
                    >
                </td>

                <td>
                    <div
                        class="pending-ledger-remaining"
                    >
                        0
                    </div>
                </td>

                <td>
                    <input
                        type="datetime-local"
                        class="
                            form-control
                            pending-ledger-return-datetime
                        "
                        value="${this.escape_attribute(
                            return_datetime
                        )}"
                        ${has_return ? "" : "disabled"}
                        aria-label="تاريخ الإرجاع"
                    >
                </td>

                <td class="pending-col-action">
                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-xs
                            pending-ledger-remove-row
                        "
                        title="حذف الحركة"
                        aria-label="حذف الحركة"
                    >
                        ×
                    </button>
                </td>

            </tr>
        `;

        this.$ledger_rows.append(
            html
        );

        this.refresh_row_indexes();
        this.recalculate_preview();
    }

    remove_ledger_row($row) {
        const rows =
            this.$ledger_rows.find(
                ".pending-ledger-row"
            );

        if (
            rows.length <= 1
        ) {
            frappe.show_alert({
                message:
                    __(
                        "يجب أن تبقى حركة مالية واحدة على الأقل."
                    ),

                indicator:
                    "orange",
            });

            return;
        }

        $row.remove();

        this.refresh_row_indexes();
        this.recalculate_preview();
    }

    refresh_row_indexes() {
        const $rows =
            this.$ledger_rows.find(
                ".pending-ledger-row"
            );

        $rows.each(
            (
                index,
                element
            ) => {
                $(element)
                    .find(
                        ".pending-ledger-index"
                    )
                    .text(
                        index + 1
                    );
            }
        );

        const disable_remove =
            $rows.length <= 1;

        $rows
            .find(
                ".pending-ledger-remove-row"
            )
            .prop(
                "disabled",
                disable_remove
            );
    }

    sync_return_datetime($row) {
        const returned =
            this.parse_amount(
                $row
                    .find(
                        ".pending-ledger-returned"
                    )
                    .val()
            );

        const $datetime =
            $row.find(
                ".pending-ledger-return-datetime"
            );

        if (
            Number.isFinite(returned)
            &&
            returned > 0
        ) {
            $datetime.prop(
                "disabled",
                false
            );

            if (
                !$datetime.val()
            ) {
                $datetime.val(
                    this.now_local_datetime_value()
                );
            }

            return;
        }

        $datetime
            .prop(
                "disabled",
                true
            )
            .val("");
    }

    recalculate_preview({
        show_errors = false,
    } = {}) {
        let total_suspended = 0;
        let total_returned = 0;
        let balance = 0;

        let valid = true;

        const errors = [];
        const rows = [];

        const $rows =
            this.$ledger_rows.find(
                ".pending-ledger-row"
            );

        $rows.each(
            (
                index,
                element
            ) => {
                const $row =
                    $(element);

                $row.removeClass(
                    "has-error"
                );

                const suspended =
                    this.parse_amount(
                        $row
                            .find(
                                ".pending-ledger-suspended"
                            )
                            .val()
                    );

                const returned =
                    this.parse_amount(
                        $row
                            .find(
                                ".pending-ledger-returned"
                            )
                            .val()
                    );

                const return_datetime =
                    String(
                        $row
                            .find(
                                ".pending-ledger-return-datetime"
                            )
                            .val()
                        || ""
                    ).trim();

                const row_number =
                    index + 1;

                let row_valid =
                    true;

                if (
                    !Number.isFinite(
                        suspended
                    )
                ) {
                    errors.push(
                        `المبلغ المعلق غير صالح في الحركة رقم ${row_number}.`
                    );

                    row_valid =
                        false;
                }

                if (
                    !Number.isFinite(
                        returned
                    )
                ) {
                    errors.push(
                        `المبلغ المرتجع غير صالح في الحركة رقم ${row_number}.`
                    );

                    row_valid =
                        false;
                }

                if (
                    row_valid
                    &&
                    suspended < 0
                ) {
                    errors.push(
                        `المبلغ المعلق لا يمكن أن يكون سالبًا في الحركة رقم ${row_number}.`
                    );

                    row_valid =
                        false;
                }

                if (
                    row_valid
                    &&
                    returned < 0
                ) {
                    errors.push(
                        `المبلغ المرتجع لا يمكن أن يكون سالبًا في الحركة رقم ${row_number}.`
                    );

                    row_valid =
                        false;
                }

                if (
                    row_valid
                    &&
                    this.is_zero(
                        suspended
                    )
                    &&
                    this.is_zero(
                        returned
                    )
                ) {
                    errors.push(
                        `الحركة رقم ${row_number} فارغة.`
                    );

                    row_valid =
                        false;
                }

                if (
                    row_valid
                    &&
                    returned > 0
                    &&
                    !return_datetime
                ) {
                    errors.push(
                        `تاريخ الإرجاع مطلوب في الحركة رقم ${row_number}.`
                    );

                    row_valid =
                        false;
                }

                let next_balance =
                    balance;

                if (
                    row_valid
                ) {
                    const available =
                        this.round_preview(
                            balance
                            +
                            suspended
                        );

                    next_balance =
                        this.round_preview(
                            available
                            -
                            returned
                        );

                    if (
                        next_balance
                        < -0.000000001
                    ) {
                        errors.push(
                            `المبلغ المرتجع يتجاوز الرصيد المتاح في الحركة رقم ${row_number}.`
                        );

                        row_valid =
                            false;
                    }
                }

                if (
                    row_valid
                ) {
                    total_suspended =
                        this.round_preview(
                            total_suspended
                            +
                            suspended
                        );

                    total_returned =
                        this.round_preview(
                            total_returned
                            +
                            returned
                        );

                    balance =
                        this.round_preview(
                            next_balance
                        );
                }

                const shown_balance =
                    row_valid
                        ? balance
                        : next_balance;

                $row
                    .find(
                        ".pending-ledger-remaining"
                    )
                    .text(
                        this.format_amount(
                            shown_balance
                        )
                    );

                if (
                    !row_valid
                ) {
                    valid =
                        false;

                    if (
                        show_errors
                    ) {
                        $row.addClass(
                            "has-error"
                        );
                    }
                }

                rows.push({
                    suspended_amount:
                        suspended,

                    returned_amount:
                        returned,

                    return_datetime:
                        return_datetime,

                    valid:
                        row_valid,
                });
            }
        );

        if (
            total_suspended
            <= 0
        ) {
            valid =
                false;

            errors.push(
                "يجب أن تحتوي العملية على مبلغ معلق موجب."
            );
        }

        let status =
            "تحت الإجراء";

        if (
            !valid
            &&
            show_errors
        ) {
            status =
                "بيانات غير صالحة";

        } else if (
            total_returned <= 0
        ) {
            status =
                "تحت الإجراء";

        } else if (
            balance > 0.000000001
        ) {
            status =
                "مرتجعة غير مكتملة";

        } else {
            status =
                "مرتجعة مكتملة";
        }

        this.update_summary({
            total_suspended,
            total_returned,
            remaining_amount:
                balance,
            status,
            valid,
        });

        return {
            valid:
                valid
                &&
                errors.length === 0,

            errors,

            rows,

            total_suspended,

            total_returned,

            remaining_amount:
                balance,

            status,
        };
    }

    update_summary(summary) {
        const currency =
            this.get_field_value(
                "currency"
            )
            || "—";

        this.$summary_root
            .find(
                ".pending-summary-suspended"
            )
            .text(
                this.format_amount(
                    summary.total_suspended
                )
            );

        this.$summary_root
            .find(
                ".pending-summary-returned"
            )
            .text(
                this.format_amount(
                    summary.total_returned
                )
            );

        this.$summary_root
            .find(
                ".pending-summary-remaining"
            )
            .text(
                this.format_amount(
                    summary.remaining_amount
                )
            );

        this.$summary_root
            .find(
                ".pending-summary-currency"
            )
            .text(
                currency
            );

        const $status =
            this.$summary_root.find(
                ".pending-summary-status"
            );

        $status
            .removeClass(
                `
                    status-under-action
                    status-partial
                    status-complete
                    status-invalid
                `
            )
            .text(
                summary.status
            );

        if (
            !summary.valid
        ) {
            $status.addClass(
                "status-invalid"
            );

        } else if (
            summary.status
            === "مرتجعة مكتملة"
        ) {
            $status.addClass(
                "status-complete"
            );

        } else if (
            summary.status
            === "مرتجعة غير مكتملة"
        ) {
            $status.addClass(
                "status-partial"
            );

        } else {
            $status.addClass(
                "status-under-action"
            );
        }
    }

    validate_and_build_ledger() {
        const result =
            this.recalculate_preview({
                show_errors:
                    true,
            });

        if (
            !result.valid
        ) {
            const unique_errors =
                [
                    ...new Set(
                        result.errors
                    ),
                ];

            frappe.msgprint({
                title:
                    __(
                        "راجع الحركات المالية"
                    ),

                indicator:
                    "red",

                message:
                    unique_errors
                        .map(
                            (message) =>
                                `
                                    <div
                                        class="pending-ledger-validation-message"
                                    >
                                        • ${frappe.utils.escape_html(
                                            message
                                        )}
                                    </div>
                                `
                        )
                        .join(""),
            });

            const first_error =
                this.$ledger_rows
                    .find(
                        ".pending-ledger-row.has-error"
                    )
                    .get(0);

            first_error
                ?.scrollIntoView({
                    behavior:
                        "smooth",

                    block:
                        "center",
                });

            return null;
        }

        return result.rows.map(
            (row) => ({
                suspended_amount:
                    this.round_preview(
                        row.suspended_amount
                    ),

                returned_amount:
                    this.round_preview(
                        row.returned_amount
                    ),

                return_datetime:
                    row.returned_amount > 0
                        ? this.normalize_datetime_input(
                            row.return_datetime
                        )
                        : null,
            })
        );
    }

    // async save() {
    //     if (
    //         this.is_saving
    //     ) {
    //         return;
    //     }

    //     const values =
    //         this.dialog
    //             .get_values();

    //     if (!values) {
    //         return;
    //     }

    //     const ledger_entries =
    //         this.validate_and_build_ledger();

    //     if (!ledger_entries) {
    //         return;
    //     }

    //     const payload = {
    //         card_name:
    //             String(
    //                 values.card_name
    //                 || ""
    //             ).trim(),

    //         card_number:
    //             String(
    //                 values.card_number
    //                 || ""
    //             ).trim(),

    //         operation_datetime:
    //             values.operation_datetime,

    //         card_owner:
    //             values.card_owner,

    //         currency:
    //             values.currency,

    //         bank:
    //             values.bank,

    //         region:
    //             values.region,

    //         machine_location:
    //             String(
    //                 values.machine_location
    //                 || ""
    //             ).trim(),

    //         machine_no:
    //             String(
    //                 values.machine_no
    //                 || ""
    //             ).trim(),

    //         branch_no:
    //             String(
    //                 values.branch_no
    //                 || ""
    //             ).trim(),

    //         representative:
    //             values.representative,

    //         ledger_entries,

    //         notes:
    //             String(
    //                 values.notes
    //                 || ""
    //             ).trim(),
    //     };

    //     this.set_saving(
    //         true
    //     );

    //     try {
    //         const response =
    //             await frappe.call({

    //                 method:
    //                     "archive.api.pending_operations.create_pending_operation",

    //                 type:
    //                     "POST",

    //                 args: {
    //                     payload,
    //                 },
    //             });

    //         const operation =
    //             response.message;

    //         if (
    //             !operation
    //             ||
    //             !operation.name
    //         ) {
    //             throw new Error(
    //                 "لم يرجع السيرفر بيانات العملية الجديدة."
    //             );
    //         }

    //         this.dialog.hide();

    //         frappe.show_alert({
    //             message:
    //                 __(
    //                     "تم إنشاء العملية المعلقة بنجاح"
    //                 ),

    //             indicator:
    //                 "green",
    //         });

    //         if (
    //             this.on_created
    //         ) {
    //             await this.on_created(
    //                 operation
    //             );
    //         }

    //     } catch (error) {
    //         console.error(
    //             "Pending operation creation failed:",
    //             error
    //         );

    //         /*
    //          * Frappe يعرض Server ValidationError
    //          * تلقائيًا غالبًا.
    //          *
    //          * نعرض رسالة إضافية فقط إذا لم تكن
    //          * هناك server message واضحة.
    //          */
    //         if (
    //             !frappe.message_log
    //                 ?.length
    //         ) {
    //             frappe.msgprint({
    //                 title:
    //                     __(
    //                         "تعذر إنشاء العملية"
    //                     ),

    //                 message:
    //                     error?.message
    //                     ||
    //                     __(
    //                         "حدث خطأ أثناء حفظ العملية المعلقة."
    //                     ),

    //                 indicator:
    //                     "red",
    //             });
    //         }

    //     } finally {
    //         this.set_saving(
    //             false
    //         );
    //     }
    // }
    async save() {
        if (
            this.is_saving
        ) {
            return;
        }

        const values =
            this.dialog
                .get_values();

        if (!values) {
            return;
        }

        const ledger_entries =
            this.validate_and_build_ledger();

        if (!ledger_entries) {
            return;
        }

        const payload = {
            card_name:
                String(
                    values.card_name
                    || ""
                ).trim(),

            card_number:
                String(
                    values.card_number
                    || ""
                ).trim(),

            operation_datetime:
                values.operation_datetime,

            card_owner:
                values.card_owner,

            currency:
                values.currency,

            bank:
                values.bank,

            region:
                values.region,

            machine_location:
                String(
                    values.machine_location
                    || ""
                ).trim(),

            machine_no:
                String(
                    values.machine_no
                    || ""
                ).trim(),

            branch_no:
                String(
                    values.branch_no
                    || ""
                ).trim(),

            representative:
                values.representative,

            ledger_entries,

            notes:
                String(
                    values.notes
                    || ""
                ).trim(),
        };

        this.set_saving(
            true
        );

        let staged_file_ids = [];

        try {
            const staged_result =
                this.attachment_manager
                    ? await this
                        .attachment_manager
                        .stage_for_create()
                    : {
                        staged: [],
                        failed: [],
                    };

            staged_file_ids =
                staged_result.staged
                    .map(
                        item =>
                            item.file_id
                    )
                    .filter(
                        Boolean
                    );

            if (
                staged_result
                    .failed
                    .length
            ) {
                await this
                    .attachment_manager
                    ?.cleanup_staged(
                        staged_file_ids
                    );

                staged_file_ids = [];

                frappe.msgprint({
                    title:
                        "تعذر رفع بعض المرفقات",

                    message:
                        "لم يتم إنشاء العملية. راجع المرفقات التي فشل رفعها ثم حاول مرة أخرى.",

                    indicator:
                        "red",
                });

                return;
            }

            if (
                staged_file_ids.length
            ) {
                payload.attachments =
                    staged_file_ids
                        .map(
                            file_id => ({
                                file_id,
                            })
                        );
            }

            const response =
                await frappe.call({
                    method:
                        "archive.api.pending_operations.create_pending_operation",

                    type:
                        "POST",

                    args: {
                        payload,
                    },
                });

            const operation =
                response.message;

            if (
                !operation
                ||
                !operation.name
            ) {
                throw new Error(
                    "لم يرجع السيرفر بيانات العملية الجديدة."
                );
            }

            /*
            * أصبحت Files مرتبطة بالعملية
            * داخل Parent.after_insert().
            * لا تعمل cleanup بعد هذه النقطة.
            */
            staged_file_ids = [];

            this.attachment_manager
                ?.mark_create_complete();

            this.dialog.hide();

            frappe.show_alert({
                message:
                    "تم إنشاء العملية المعلقة بنجاح",

                indicator:
                    "green",
            });

            if (
                this.on_created
            ) {
                await this.on_created(
                    operation
                );
            }

        } catch (error) {
            console.error(
                "Pending operation creation failed:",
                error
            );

            if (
                staged_file_ids.length
            ) {
                await this
                    .attachment_manager
                    ?.cleanup_staged(
                        staged_file_ids
                    );
            }

            if (
                !frappe.message_log
                    ?.length
            ) {
                frappe.msgprint({
                    title:
                        "تعذر إنشاء العملية",

                    message:
                        error?.message
                        ||
                        "حدث خطأ أثناء حفظ العملية المعلقة.",

                    indicator:
                        "red",
                });
            }

        } finally {
            this.set_saving(
                false
            );
        }
    }

    set_saving(is_saving) {
        this.is_saving =
            Boolean(
                is_saving
            );
        
        if (
            this.is_saving
        ) {
            this.smart_autocomplete
                ?.hide_all();
        }

        const $button =
            this.dialog
                .get_primary_btn();

        $button
            .prop(
                "disabled",
                this.is_saving
            )
            .text(
                this.is_saving
                    ? "جارٍ الحفظ..."
                    : "حفظ العملية"
            );

        this.dialog.$wrapper
            .find(
                `
                    input,
                    textarea,
                    select,
                    .pending-ledger-add-row,
                    .pending-ledger-remove-row
                `
            )
            .not(
                $button
            )
            .prop(
                "disabled",
                this.is_saving
            );
    }

    show() {
        if (
            this.is_destroyed
        ) {
            return;
        }

        this.dialog.show();

        setTimeout(
            () => {
                this.dialog
                    .fields_dict
                    .card_name
                    ?.$input
                    ?.trigger(
                        "focus"
                    );
            },
            100
        );
    }

    destroy() {
        this.smart_autocomplete
            ?.destroy();

        this.smart_autocomplete =
            null;
        this.attachment_manager
            ?.destroy();

        this.attachment_manager =
            null;
        if (
            this.is_destroyed
        ) {
            return;
        }

        this.is_destroyed =
            true;

        this.$ledger_root
            ?.off();

        this.dialog
            ?.$wrapper
            ?.off(
                ".archive_pending_create"
            );

        this.dialog
            ?.$wrapper
            ?.remove();
    }

    get_default_currency() {
        return (
            frappe.boot
                ?.sysdefaults
                ?.currency
            ||
            frappe.defaults
                ?.get_global_default
                ?.(
                    "currency"
                )
            ||
            ""
        );
    }

    get_field_value(fieldname) {
        return (
            this.dialog
                ?.get_value(
                    fieldname
                )
            || ""
        );
    }

    parse_amount(value) {
        const text =
            String(
                value ?? ""
            ).trim();

        if (!text) {
            return 0;
        }

        const number =
            Number(text);

        return Number.isFinite(
            number
        )
            ? number
            : NaN;
    }

    round_preview(value) {
        if (
            !Number.isFinite(
                Number(value)
            )
        ) {
            return 0;
        }

        const factor =
            1000000000;

        return (
            Math.round(
                (
                    Number(value)
                    +
                    Number.EPSILON
                )
                *
                factor
            )
            /
            factor
        );
    }

    is_zero(value) {
        return (
            Math.abs(
                Number(value)
                || 0
            )
            <
            0.000000001
        );
    }

    format_amount(value) {
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
                    minimumFractionDigits:
                        0,

                    maximumFractionDigits:
                        9,
                }
            )
            .format(
                number
            );
    }

    normalize_datetime_input(value) {
        const text =
            String(
                value
                || ""
            ).trim();

        if (!text) {
            return null;
        }

        let normalized =
            text.replace(
                "T",
                " "
            );

        if (
            normalized.length === 16
        ) {
            normalized += ":00";
        }

        return normalized;
    }

    now_local_datetime_value() {
        const date =
            new Date();

        const pad =
            (value) =>
                String(value)
                    .padStart(
                        2,
                        "0"
                    );

        return [
            date.getFullYear(),
            "-",
            pad(
                date.getMonth()
                + 1
            ),
            "-",
            pad(
                date.getDate()
            ),
            "T",
            pad(
                date.getHours()
            ),
            ":",
            pad(
                date.getMinutes()
            ),
        ].join("");
    }

    escape_attribute(value) {
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
};