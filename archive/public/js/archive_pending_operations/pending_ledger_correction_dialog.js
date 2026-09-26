window.ArchivePendingLedgerCorrectionDialog =
class ArchivePendingLedgerCorrectionDialog {
    static counter = 0;

    constructor(options = {}) {
        this.name =
            String(
                options.name
                || ""
            ).trim();

        this.on_corrected =
            typeof options.on_corrected
                === "function"
                ? options.on_corrected
                : null;

        this.details = null;

        this.dialog = null;

        this.rows = [];

        this.datetime_controls =
            new Map();

        this.is_saving = false;

        this.instance_id =
            ++ArchivePendingLedgerCorrectionDialog
                .counter;

        this.namespace =
            `.pending_correction_${this.instance_id}`;
    }

    async show() {
        if (!this.name) {
            return;
        }

        await this.load_details();

        if (
            !this.details
                ?.capabilities
                ?.can_correct_ledger
        ) {
            frappe.msgprint({
                title:
                    "غير مسموح",

                message:
                    "ليس لديك صلاحية تصحيح الحركة المالية لهذه العملية.",

                indicator:
                    "red",
            });

            return;
        }

        this.prepare_rows();

        this.make_dialog();

        this.dialog.show();

        this.render();
    }

    async load_details() {
        const response =
            await frappe.call({
                method:
                    "archive.api.pending_operations.get_pending_operation_details",

                type:
                    "GET",

                args: {
                    name:
                        this.name,
                },
            });

        this.details =
            response.message
            || null;

        if (
            !this.details
            ||
            !this.details.operation
        ) {
            throw new Error(
                "تعذر تحميل بيانات العملية."
            );
        }
    }

    prepare_rows() {
        this.rows =
            (
                this.details
                    ?.ledger_entries
                || []
            )
            .map(
                row => ({
                    uid:
                        this.make_uid(),

                    name:
                        row.name
                        || null,

                    suspended_amount:
                        Number(
                            row.suspended_amount
                            || 0
                        ),

                    returned_amount:
                        Number(
                            row.returned_amount
                            || 0
                        ),

                    remaining_amount:
                        Number(
                            row.remaining_amount
                            || 0
                        ),

                    return_datetime:
                        row.return_datetime
                        || "",

                    entered_by:
                        row.entered_by
                        || "",

                    entered_at:
                        row.entered_at
                        || "",
                })
            );
    }

    make_dialog() {
        this.dialog =
            new frappe.ui.Dialog({
                title:
                    `تصحيح الحركة المالية ${this.name}`,

                size:
                    "extra-large",

                fields: [
                    {
                        fieldname:
                            "correction_warning",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-correction-warning
                                    "
                                >
                                    <strong>
                                        تصحيح مالي حساس
                                    </strong>

                                    <span>
                                        استخدم هذه الشاشة فقط
                                        لتصحيح خطأ فعلي في
                                        السجل المالي. جميع
                                        التغييرات ستسجل في
                                        مسار العملية.
                                    </span>
                                </div>
                            `,
                    },

                    {
                        fieldname:
                            "correction_summary",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-correction-summary
                                    "
                                ></div>
                            `,
                    },

                    {
                        fieldname:
                            "correction_ledger",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-correction-ledger
                                    "
                                ></div>
                            `,
                    },

                    {
                        fieldtype:
                            "Section Break",
                    },

                    {
                        fieldname:
                            "reason",

                        fieldtype:
                            "Small Text",

                        label:
                            "سبب التصحيح",

                        reqd:
                            1,

                        description:
                            "اكتب سببًا واضحًا ومحددًا للتصحيح المالي.",
                    },
                ],

                primary_action_label:
                    "حفظ التصحيح المالي",

                primary_action:
                    () => {
                        this.confirm_submit();
                    },
            });

        this.dialog
            .$wrapper
            .addClass(
                "archive-pending-correction-dialog"
            )
            .attr(
                "dir",
                "rtl"
            );

        this.bind_events();
    }

    bind_events() {
        this.dialog
            .$wrapper
            .on(
                `input${this.namespace}`,
                ".pending-correction-number",
                () => {
                    this.recalculate_preview();
                }
            )
            .on(
                `click${this.namespace}`,
                ".pending-correction-add-row",
                () => {
                    this.add_row();
                }
            )
            .on(
                `click${this.namespace}`,
                ".pending-correction-delete-row",
                event => {
                    const uid =
                        String(
                            $(event.currentTarget)
                                .data(
                                    "uid"
                                )
                            || ""
                        );

                    this.delete_row(
                        uid
                    );
                }
            )
            .on(
                `hidden.bs.modal${this.namespace}`,
                () => {
                    this.destroy();
                }
            );
    }

    render() {
        this.render_ledger();

        this.recalculate_preview();
    }

    render_ledger() {
        this.datetime_controls.clear();

        const $root =
            this.dialog
                .fields_dict
                .correction_ledger
                .$wrapper
                .find(
                    ".pending-correction-ledger"
                );

        const currency =
            this.details
                ?.operation
                ?.currency
            || "";

        $root.html(`
            <div
                class="
                    pending-correction-ledger-toolbar
                "
            >
                <div>
                    <strong>
                        سجل الحركة المالية
                    </strong>

                    <span>
                        العملة:
                        ${this.escape(
                            currency
                        )}
                    </span>
                </div>

                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        btn-sm
                        pending-correction-add-row
                    "
                >
                    إضافة صف تصحيح
                </button>
            </div>

            <div
                class="
                    pending-correction-table-wrapper
                "
            >
                <table
                    class="
                        table
                        pending-correction-table
                    "
                >
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>
                                المعلق
                            </th>
                            <th>
                                المرتجع
                            </th>
                            <th>
                                المتبقي
                            </th>
                            <th>
                                تاريخ الإرجاع
                            </th>
                            <th>
                                المسجل
                            </th>
                            <th></th>
                        </tr>
                    </thead>

                    <tbody>
                        ${this.rows
                            .map(
                                (
                                    row,
                                    index
                                ) =>
                                    this.render_row(
                                        row,
                                        index
                                    )
                            )
                            .join("")}
                    </tbody>
                </table>
            </div>
        `);

        this.make_datetime_controls();

        this.bind_row_input_values();
    }

    render_row(
        row,
        index
    ) {
        return `
            <tr
                data-row-uid="${this.escape(
                    row.uid
                )}"
            >
                <td>
                    ${index + 1}
                </td>

                <td>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        class="
                            form-control
                            pending-correction-number
                            pending-correction-suspended
                        "
                        data-uid="${this.escape(
                            row.uid
                        )}"
                        value="${this.escape(
                            row.suspended_amount
                        )}"
                    >
                </td>

                <td>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        class="
                            form-control
                            pending-correction-number
                            pending-correction-returned
                        "
                        data-uid="${this.escape(
                            row.uid
                        )}"
                        value="${this.escape(
                            row.returned_amount
                        )}"
                    >
                </td>

                <td>
                    <strong
                        class="
                            pending-correction-remaining
                        "
                        data-uid="${this.escape(
                            row.uid
                        )}"
                    >
                        ${this.format_amount(
                            row.remaining_amount
                        )}
                    </strong>
                </td>

                <td>
                    <div
                        class="
                            pending-correction-datetime
                        "
                        data-uid="${this.escape(
                            row.uid
                        )}"
                    ></div>
                </td>

                <td>
                    ${
                        row.name
                            ? `
                                <div
                                    class="
                                        pending-correction-entered
                                    "
                                >
                                    <strong>
                                        ${this.escape(
                                            row.entered_by
                                            || "—"
                                        )}
                                    </strong>

                                    <span>
                                        ${this.escape(
                                            row.entered_at
                                            || "—"
                                        )}
                                    </span>
                                </div>
                            `
                            : `
                                <span
                                    class="
                                        pending-correction-new-row
                                    "
                                >
                                    صف جديد
                                </span>
                            `
                    }
                </td>

                <td>
                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-xs
                            pending-correction-delete-row
                        "
                        data-uid="${this.escape(
                            row.uid
                        )}"
                        ${
                            this.rows.length
                            <= 1
                                ? "disabled"
                                : ""
                        }
                    >
                        حذف
                    </button>
                </td>
            </tr>
        `;
    }

    make_datetime_controls() {
        for (
            const row
            of this.rows
        ) {
            const $parent =
                this.dialog
                    .$wrapper
                    .find(
                        `.pending-correction-datetime[data-uid="${row.uid}"]`
                    );

            if (
                !$parent.length
            ) {
                continue;
            }

            const control =
                frappe.ui.form
                    .make_control({
                        parent:
                            $parent,

                        df: {
                            fieldname:
                                `return_datetime_${row.uid}`,

                            fieldtype:
                                "Datetime",

                            label:
                                "",

                            placeholder:
                                "تاريخ ووقت الإرجاع",
                        },

                        render_input:
                            true,
                    });

            control.set_value(
                row.return_datetime
                || ""
            );

            control
                .$input
                ?.on(
                    `change${this.namespace}`,
                    () => {
                        this.recalculate_preview();
                    }
                );

            this.datetime_controls
                .set(
                    row.uid,
                    control
                );
        }
    }

    bind_row_input_values() {
        for (
            const row
            of this.rows
        ) {
            const $row =
                this.get_row_element(
                    row.uid
                );

            if (
                !$row.length
            ) {
                continue;
            }

            $row
                .find(
                    ".pending-correction-suspended"
                )
                .val(
                    row.suspended_amount
                );

            $row
                .find(
                    ".pending-correction-returned"
                )
                .val(
                    row.returned_amount
                );
        }
    }

    add_row() {
        if (
            this.is_saving
        ) {
            return;
        }

        this.sync_rows_from_ui();

        this.rows.push({
            uid:
                this.make_uid(),

            name:
                null,

            suspended_amount:
                0,

            returned_amount:
                0,

            remaining_amount:
                0,

            return_datetime:
                "",

            entered_by:
                "",

            entered_at:
                "",
        });

        this.render();
    }

    delete_row(uid) {
        if (
            this.is_saving
            ||
            this.rows.length
            <= 1
        ) {
            return;
        }

        this.sync_rows_from_ui();

        this.rows =
            this.rows.filter(
                row =>
                    row.uid
                    !== uid
            );

        this.render();
    }

    sync_rows_from_ui() {
        for (
            const row
            of this.rows
        ) {
            const $row =
                this.get_row_element(
                    row.uid
                );

            if (
                !$row.length
            ) {
                continue;
            }

            row.suspended_amount =
                this.to_number(
                    $row
                        .find(
                            ".pending-correction-suspended"
                        )
                        .val()
                );

            row.returned_amount =
                this.to_number(
                    $row
                        .find(
                            ".pending-correction-returned"
                        )
                        .val()
                );

            const control =
                this.datetime_controls
                    .get(
                        row.uid
                    );

            row.return_datetime =
                control
                    ?.get_value()
                || "";
        }
    }

    recalculate_preview() {
        this.sync_rows_from_ui();

        let running_balance =
            0;

        let total_suspended =
            0;

        let total_returned =
            0;

        const errors = [];

        this.rows.forEach(
            (
                row,
                index
            ) => {
                const suspended =
                    Number(
                        row.suspended_amount
                        || 0
                    );

                const returned =
                    Number(
                        row.returned_amount
                        || 0
                    );

                if (
                    suspended < 0
                    ||
                    returned < 0
                ) {
                    errors.push(
                        `الصف ${index + 1}: لا يمكن استخدام مبلغ سالب.`
                    );
                }

                if (
                    suspended === 0
                    &&
                    returned === 0
                ) {
                    errors.push(
                        `الصف ${index + 1}: لا يمكن أن يكون المعلق والمرتجع صفرًا معًا.`
                    );
                }

                if (
                    returned > 0
                    &&
                    !row.return_datetime
                ) {
                    errors.push(
                        `الصف ${index + 1}: تاريخ الإرجاع مطلوب عند وجود مبلغ مرتجع.`
                    );
                }

                if (
                    returned === 0
                    &&
                    row.return_datetime
                ) {
                    errors.push(
                        `الصف ${index + 1}: لا يجب وجود تاريخ إرجاع إذا كان المرتجع صفرًا.`
                    );
                }

                running_balance +=
                    suspended
                    -
                    returned;

                if (
                    running_balance
                    < 0
                ) {
                    errors.push(
                        `الصف ${index + 1}: المرتجع يتجاوز الرصيد المتاح.`
                    );
                }

                total_suspended +=
                    suspended;

                total_returned +=
                    returned;

                row.remaining_amount =
                    running_balance;

                this.get_row_element(
                    row.uid
                )
                    .find(
                        ".pending-correction-remaining"
                    )
                    .text(
                        this.format_amount(
                            running_balance
                        )
                    );
            }
        );

        if (
            total_suspended
            <= 0
        ) {
            errors.push(
                "إجمالي المبلغ المعلق يجب أن يكون أكبر من صفر."
            );
        }

        const status =
            this.derive_status(
                total_suspended,
                total_returned,
                running_balance
            );

        this.render_summary(
            {
                total_suspended,
                total_returned,
                remaining_amount:
                    running_balance,

                status,

                errors,
            }
        );

        return {
            total_suspended,
            total_returned,
            remaining_amount:
                running_balance,

            status,

            errors,
        };
    }

    render_summary(state) {
        const $root =
            this.dialog
                .fields_dict
                .correction_summary
                .$wrapper
                .find(
                    ".pending-correction-summary"
                );

        const currency =
            this.details
                ?.operation
                ?.currency
            || "";

        $root.html(`
            <div
                class="
                    pending-correction-summary-cards
                "
            >
                ${this.summary_card(
                    "إجمالي المعلق",
                    state.total_suspended,
                    currency
                )}

                ${this.summary_card(
                    "إجمالي المرتجع",
                    state.total_returned,
                    currency
                )}

                ${this.summary_card(
                    "المتبقي",
                    state.remaining_amount,
                    currency
                )}

                <div
                    class="
                        pending-correction-summary-card
                    "
                >
                    <span>
                        الحالة
                    </span>

                    <strong>
                        ${this.escape(
                            state.status
                        )}
                    </strong>
                </div>
            </div>

            ${
                state.errors.length
                    ? `
                        <div
                            class="
                                pending-correction-errors
                            "
                        >
                            ${state.errors
                                .map(
                                    error => `
                                        <div>
                                            ${this.escape(
                                                error
                                            )}
                                        </div>
                                    `
                                )
                                .join("")}
                        </div>
                    `
                    : ""
            }
        `);
    }

    summary_card(
        label,
        value,
        currency
    ) {
        return `
            <div
                class="
                    pending-correction-summary-card
                "
            >
                <span>
                    ${this.escape(
                        label
                    )}
                </span>

                <strong>
                    ${this.format_amount(
                        value
                    )}

                    <small>
                        ${this.escape(
                            currency
                        )}
                    </small>
                </strong>
            </div>
        `;
    }

    derive_status(
        total_suspended,
        total_returned,
        remaining_amount
    ) {
        if (
            total_suspended > 0
            &&
            remaining_amount === 0
        ) {
            return "مرتجعة مكتملة";
        }

        if (
            total_returned > 0
            &&
            remaining_amount > 0
        ) {
            return "مرتجعة غير مكتملة";
        }

        return "تحت الإجراء";
    }

    confirm_submit() {
        if (
            this.is_saving
        ) {
            return;
        }

        const reason =
            String(
                this.dialog
                    .get_value(
                        "reason"
                    )
                || ""
            ).trim();

        if (!reason) {
            frappe.msgprint({
                title:
                    "سبب التصحيح مطلوب",

                message:
                    "اكتب سبب التصحيح المالي قبل الحفظ.",

                indicator:
                    "orange",
            });

            return;
        }

        const state =
            this.recalculate_preview();

        if (
            state.errors.length
        ) {
            frappe.msgprint({
                title:
                    "الحركة المالية غير صالحة",

                message:
                    state.errors
                        .map(
                            error =>
                                frappe.utils.escape_html(
                                    error
                                )
                        )
                        .join(
                            "<br>"
                        ),

                indicator:
                    "red",
            });

            return;
        }

        frappe.confirm(
            `
                سيتم تعديل السجل المالي للعملية
                <strong>
                    ${this.escape(
                        this.name
                    )}
                </strong>
                وتسجيل التصحيح في مسار العملية.
                <br><br>
                هل تريد المتابعة؟
            `,

            () => {
                this.submit(
                    reason
                );
            }
        );
    }

    async submit(reason) {
        if (
            this.is_saving
        ) {
            return;
        }

        this.sync_rows_from_ui();

        const ledger_entries =
            this.rows.map(
                row => {
                    const result = {
                        suspended_amount:
                            Number(
                                row.suspended_amount
                                || 0
                            ),

                        returned_amount:
                            Number(
                                row.returned_amount
                                || 0
                            ),

                        return_datetime:
                            row.return_datetime
                            || null,
                    };

                    if (
                        row.name
                    ) {
                        result.name =
                            row.name;
                    }

                    return result;
                }
            );

        this.set_saving(
            true
        );

        try {
            const response =
                await frappe.call({
                    method:
                        "archive.api.pending_operations.correct_pending_ledger",

                    type:
                        "POST",

                    args: {
                        name:
                            this.name,

                        payload: {
                            reason,

                            expected_modified:
                                this.details
                                    .operation
                                    .modified,

                            ledger_entries,
                        },
                    },
                });

            const result =
                response.message
                || null;

            frappe.show_alert({
                message:
                    "تم تصحيح الحركة المالية",

                indicator:
                    "green",
            });

            this.dialog.hide();

            if (
                this.on_corrected
            ) {
                await this.on_corrected(
                    result
                );
            }

        } catch (error) {
            console.error(
                "Pending ledger correction failed:",
                error
            );

            if (
                !frappe.message_log
                    ?.length
            ) {
                frappe.msgprint({
                    title:
                        "تعذر حفظ التصحيح",

                    message:
                        error?.message
                        ||
                        "حدث خطأ أثناء تصحيح الحركة المالية.",

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

    set_saving(value) {
        this.is_saving =
            Boolean(value);

        const $primary =
            this.dialog
                .get_primary_btn();

        $primary
            .prop(
                "disabled",
                this.is_saving
            )
            .text(
                this.is_saving
                    ? "جارٍ حفظ التصحيح..."
                    : "حفظ التصحيح المالي"
            );

        this.dialog
            .$wrapper
            .find(
                "input, textarea, button"
            )
            .not(
                ".btn-modal-close"
            )
            .prop(
                "disabled",
                this.is_saving
            );
    }

    get_row_element(uid) {
        return this.dialog
            .$wrapper
            .find(
                `.pending-correction-table tbody tr[data-row-uid="${uid}"]`
            );
    }

    make_uid() {
        return (
            `${Date.now()}_`
            +
            Math.random()
                .toString(36)
                .slice(2)
        );
    }

    to_number(value) {
        const number =
            Number(value);

        return Number.isFinite(
            number
        )
            ? number
            : 0;
    }

    format_amount(value) {
        const number =
            Number(value);

        if (
            !Number.isFinite(
                number
            )
        ) {
            return "0";
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

    escape(value) {
        return frappe.utils
            .escape_html(
                String(
                    value
                    ?? ""
                )
            );
    }

    destroy() {
        this.dialog
            ?.$wrapper
            ?.off(
                this.namespace
            );

        for (
            const control
            of this.datetime_controls
                .values()
        ) {
            control
                .$input
                ?.off(
                    this.namespace
                );
        }

        this.datetime_controls
            .clear();
    }
};