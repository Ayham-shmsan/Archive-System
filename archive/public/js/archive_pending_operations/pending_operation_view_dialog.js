window.ArchivePendingOperationViewDialog =
class ArchivePendingOperationViewDialog {
    constructor(options = {}) {
        this.name =
            String(
                options.name
                || ""
            ).trim();

        this.on_changed =
            typeof options.on_changed
                === "function"
                ? options.on_changed
                : null;

        this.details = null;
        this.dialog = null;

        this.is_editing = false;
        this.is_saving = false;
        this.is_returning = false;
        this.is_destroyed = false;

        this.editable_fields = [
            "card_name",
            "card_number",
            "operation_datetime",
            "card_owner",
            "bank",
            "region",
            "machine_location",
            "machine_no",
            "branch_no",
            "representative",
            "notes",
        ];
    }

    async show() {
        if (!this.name) {
            return;
        }

        await this.load_details();

        if (!this.details) {
            return;
        }

        this.make_dialog();

        this.dialog.show();

        this.refresh_view();
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
    }

    make_dialog() {
        const operation =
            this.details.operation;

        this.dialog =
            new frappe.ui.Dialog({
                title:
                    `العملية ${operation.name}`,

                size:
                    "extra-large",

                fields: [

                    {
                        fieldname:
                            "view_actions",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="pending-view-actions"
                                ></div>
                            `,
                    },

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

                        read_only:
                            1,
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
                            "الملخص المالي",
                    },

                    {
                        fieldname:
                            "financial_summary",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="pending-view-summary"
                                ></div>
                            `,
                    },

                    {
                        fieldtype:
                            "Section Break",

                        label:
                            "الحركات المالية",
                    },

                    {
                        fieldname:
                            "ledger_view",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="pending-view-ledger"
                                ></div>
                            `,
                    },

                    {
                        fieldtype:
                            "Section Break",

                        label:
                            "المرفقات",
                    },

                    {
                        fieldname:
                            "attachments_view",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="pending-view-attachments"
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
                        fieldname:
                            "notes",

                        fieldtype:
                            "Small Text",

                        label:
                            "ملاحظات",
                    },
                ],

                primary_action_label:
                    "حفظ التغييرات",

                primary_action:
                    () => {
                        this.save_metadata();
                    },
            });

        this.dialog.$wrapper
            .addClass(
                "archive-pending-operation-view-dialog"
            )
            .attr(
                "dir",
                "rtl"
            );

        this.bind_events();
        this.setup_smart_autocomplete();
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
                            (
                                this.is_editing
                                &&
                                !this.is_saving
                            ),

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

    refresh_view() {
        this.populate_fields();

        this.render_actions();

        this.render_summary();

        this.render_ledger();

        this.render_attachments();

        /*
        * بعد كل Reload/Save نعود
        * دائمًا إلى View Mode.
        */
        this.is_saving =
            false;

        this.set_edit_mode(
            false
        );
    }

    populate_fields() {
        const operation =
            this.details.operation;

        const values = {
            card_name:
                operation.card_name,

            card_number:
                operation.card_number,

            operation_datetime:
                operation.operation_datetime,

            card_owner:
                operation.card_owner,

            currency:
                operation.currency,

            bank:
                operation.bank,

            region:
                operation.region,

            machine_location:
                operation.machine_location,

            machine_no:
                operation.machine_no,

            branch_no:
                operation.branch_no,

            representative:
                operation.representative,

            notes:
                operation.notes
                || "",
        };

        for (
            const [
                fieldname,
                value,
            ]
            of Object.entries(
                values
            )
        ) {
            this.dialog.set_value(
                fieldname,
                value
            );
        }
    }

    bind_events() {
        this.dialog.$wrapper
            .on(
                "click.pending_view",
                ".pending-view-edit-button",
                () => {
                    this.set_edit_mode(
                        true
                    );
                }
            );

        this.dialog.$wrapper
            .on(
                "click.pending_view",
                ".pending-view-cancel-edit-button",
                () => {
                    this.populate_fields();

                    this.set_edit_mode(
                        false
                    );
                }
            );

        this.dialog.$wrapper
            .on(
                "click.pending_view",
                ".pending-view-return-button",
                () => {
                    this.open_return_dialog();
                }
            );

        this.dialog.$wrapper
            .on(
                "hidden.bs.modal.pending_view",
                () => {
                    this.destroy();
                }
            );
        this.dialog.$wrapper
            .on(
                "click.pending_view",
                ".pending-view-timeline-button",
                () => {
                    this.open_timeline_dialog();
                }
            );

        this.dialog.$wrapper
            .on(
                "click.pending_view",
                ".pending-view-correct-ledger-button",
                () => {
                    this.open_ledger_correction_dialog();
                }
            );
    }

    open_ledger_correction_dialog() {
        const can_correct =
            Boolean(
                this.details
                    ?.capabilities
                    ?.can_correct_ledger
            );

        if (!can_correct) {
            return;
        }

        if (
            !window
                .ArchivePendingLedgerCorrectionDialog
        ) {
            frappe.msgprint({
                title:
                    "تعذر فتح التصحيح المالي",

                message:
                    "لم يتم تحميل مكوّن تصحيح الحركة المالية.",

                indicator:
                    "red",
            });

            return;
        }

        this.correction_dialog =
            new window
                .ArchivePendingLedgerCorrectionDialog({
                    name:
                        this.name,

                    on_corrected:
                        async () => {
                            await this
                                .reload_details();

                            if (
                                this.on_changed
                            ) {
                                await this
                                    .on_changed(
                                        this.details
                                    );
                            }
                        },
                });

        this.correction_dialog.show();
    }

    open_timeline_dialog() {
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

        this.timeline_dialog =
            new window
                .ArchivePendingOperationTimelineDialog({
                    name:
                        this.name,
                });

        this.timeline_dialog.show();
    }

    render_actions() {
        const operation =
            this.details.operation;

        const capabilities =
            this.details.capabilities
            || {};
        
        const can_correct_ledger =
            Boolean(
                this.details
                    ?.capabilities
                    ?.can_correct_ledger
            );

        const $root =
            this.dialog
                .fields_dict
                .view_actions
                .$wrapper
                .find(
                    ".pending-view-actions"
                );

        $root.html(`
            <div class="pending-view-operation-identity">

                <div>
                    <strong>
                        ${this.escape(
                            operation.name
                        )}
                    </strong>

                    <span>
                        الرقم التسلسلي:
                        ${this.escape(
                            operation.serial_no
                        )}
                    </span>
                </div>

                <span
                    class="
                        pending-view-status
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

            <div class="pending-view-action-buttons">
                
                
                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        pending-view-timeline-button
                    "
                >
                    مسار العملية
                </button>
                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        pending-view-edit-button
                    "
                    ${
                        capabilities.can_edit
                            ? ""
                            : "style='display:none;'"
                    }
                >
                    تعديل البيانات
                </button>

                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        pending-view-cancel-edit-button
                    "
                    style="display:none;"
                >
                    إلغاء التعديل
                </button>
                ${
                    can_correct_ledger
                        ? `
                            <button
                                type="button"
                                class="
                                    btn
                                    btn-default
                                    pending-view-correct-ledger-button
                                "
                            >
                                تصحيح الحركة المالية
                            </button>
                        `
                        : ""
                }

                <button
                    type="button"
                    class="
                        btn
                        btn-primary
                        pending-view-return-button
                    "
                    ${
                        capabilities.can_add_return
                            ? ""
                            : "style='display:none;'"
                    }
                >
                    إضافة إرجاع
                </button>

            </div>
        `);
    }

    set_edit_mode(
        enabled
    ) {
        const can_edit =
            Boolean(
                this.details
                    ?.capabilities
                    ?.can_edit
            );

        this.is_editing =
            Boolean(
                enabled
                &&
                can_edit
            );

        for (
            const fieldname
            of this.editable_fields
        ) {
            const field =
                this.dialog
                    .fields_dict[
                        fieldname
                    ];

            if (!field) {
                continue;
            }

            field.df.read_only =
                this.is_editing
                    ? 0
                    : 1;

            field.refresh();
        }

        /*
        * العملة Financial invariant:
        * لا تدخل ضمن Metadata Edit.
        */
        const currency_field =
            this.dialog
                .fields_dict
                .currency;

        if (currency_field) {
            currency_field.df.read_only =
                1;

            currency_field.refresh();
        }

        const $primary =
            this.dialog
                .get_primary_btn();

        /*
        * لا نترك Label قديم مثل
        * "جارٍ الحفظ..." عند الدخول
        * مرة أخرى إلى Edit Mode.
        */
        $primary
            .text(
                this.is_saving
                    ? "جارٍ الحفظ..."
                    : "حفظ التغييرات"
            )
            .prop(
                "disabled",
                this.is_saving
            )
            .toggle(
                this.is_editing
            );

        this.dialog.$wrapper
            .find(
                ".pending-view-edit-button"
            )
            .toggle(
                can_edit
                &&
                !this.is_editing
            );

        this.dialog.$wrapper
            .find(
                ".pending-view-cancel-edit-button"
            )
            .toggle(
                can_edit
                &&
                this.is_editing
            );
        /*
        * field.refresh() في Frappe قد يغير
        * Input element عند التحويل Read Only/Edit.
        *
        * لذلك نعيد ربط الـAutocomplete بعد تغيير الوضع.
        */
        this.smart_autocomplete
            ?.refresh();
    }

    async save_metadata() {
        if (
            !this.is_editing
            ||
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

            notes:
                String(
                    values.notes
                    || ""
                ).trim(),
        };

        this.set_saving(
            true
        );

        let saved_details =
            null;

        try {
            const response =
                await frappe.call({

                    method:
                        "archive.api.pending_operations.update_pending_operation",

                    type:
                        "POST",

                    args: {
                        name:
                            this.name,

                        payload,

                        expected_modified:
                            this.details
                                .operation
                                .modified,
                    },
                });

            saved_details =
                response.message
                || null;

            if (
                !saved_details
                ||
                !saved_details.operation
            ) {
                throw new Error(
                    "لم يرجع السيرفر بيانات العملية بعد الحفظ."
                );
            }

            this.details =
                saved_details;

            /*
            * نعيد رسم Dialog من البيانات
            * التي رجعها السيرفر نفسه.
            */
            this.refresh_view();

            frappe.show_alert({
                message:
                    "تم حفظ بيانات العملية",

                indicator:
                    "green",
            });

        } catch (error) {
            console.error(
                "Pending operation metadata update failed:",
                error
            );

            /*
            * رسائل Validation الخاصة بـFrappe
            * تظهر أصلًا من السيرفر.
            */
            if (
                !frappe.message_log
                    ?.length
            ) {
                frappe.msgprint({
                    title:
                        "تعذر حفظ التغييرات",

                    message:
                        error?.message
                        ||
                        "حدث خطأ أثناء حفظ بيانات العملية.",

                    indicator:
                        "red",
                });
            }

            return;

        } finally {
            /*
            * انتهاء Save الحقيقي هنا.
            *
            * لا ننتظر Refresh الصفحة
            * لكي نحرر زر Dialog.
            */
            this.set_saving(
                false
            );
        }

        /*
        * تحديث الصفحة عملية لاحقة مستقلة.
        *
        * لو فشلت لا نقول للمستخدم
        * إن Save ما زال جاريًا.
        */
        if (
            saved_details
            &&
            this.on_changed
        ) {
            try {
                await this.on_changed(
                    saved_details
                );

            } catch (error) {
                console.error(
                    "Pending operations page refresh failed after metadata save:",
                    error
                );

                frappe.show_alert({
                    message:
                        "تم الحفظ، لكن تعذر تحديث القائمة تلقائيًا. اضغط تحديث.",

                    indicator:
                        "orange",
                });
            }
        }
    }

    set_saving(
        value
    ) {
        this.is_saving =
            Boolean(
                value
            );
        
        if (
            this.is_saving
        ) {
            this.smart_autocomplete
                ?.hide_all();
        }

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
                    ? "جارٍ الحفظ..."
                    : "حفظ التغييرات"
            );

        /*
        * أثناء Request نفسه فقط
        * نقفل حقول Metadata.
        */
        for (
            const fieldname
            of this.editable_fields
        ) {
            const field =
                this.dialog
                    .fields_dict[
                        fieldname
                    ];

            if (
                !field
                ||
                !this.is_editing
            ) {
                continue;
            }

            field.$input?.prop(
                "disabled",
                this.is_saving
            );
        }
    }

    render_summary() {
        const operation =
            this.details.operation;

        const $root =
            this.dialog
                .fields_dict
                .financial_summary
                .$wrapper
                .find(
                    ".pending-view-summary"
                );

        $root.html(`
            <div class="pending-view-summary-grid">

                ${this.summary_card(
                    "إجمالي المعلق",
                    operation.total_suspended,
                    operation.currency
                )}

                ${this.summary_card(
                    "إجمالي المرتجع",
                    operation.total_returned,
                    operation.currency
                )}

                ${this.summary_card(
                    "المتبقي",
                    operation.remaining_amount,
                    operation.currency
                )}

                <div class="pending-view-summary-card">
                    <span>
                        الحالة
                    </span>

                    <strong
                        class="
                            pending-view-status
                            ${this.status_class(
                                operation.status
                            )}
                        "
                    >
                        ${this.escape(
                            operation.status
                        )}
                    </strong>
                </div>

            </div>
        `);
    }

    summary_card(
        label,
        value,
        currency
    ) {
        return `
            <div class="pending-view-summary-card">

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

    render_ledger() {
        const rows =
            this.details
                .ledger_entries
            || [];

        const $root =
            this.dialog
                .fields_dict
                .ledger_view
                .$wrapper
                .find(
                    ".pending-view-ledger"
                );

        if (!rows.length) {
            $root.html(
                `
                    <div class="pending-view-empty">
                        لا توجد حركات مالية.
                    </div>
                `
            );

            return;
        }

        $root.html(`
            <div class="pending-view-ledger-scroll">

                <table class="pending-view-ledger-table">

                    <thead>
                        <tr>
                            <th>#</th>
                            <th>المعلق</th>
                            <th>المرتجع</th>
                            <th>المتبقي</th>
                            <th>تاريخ الإرجاع</th>
                            <th>سجلها</th>
                            <th>وقت التسجيل</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map(
                            (row) => `
                                <tr>
                                    <td>
                                        ${this.escape(
                                            row.idx
                                        )}
                                    </td>

                                    <td>
                                        ${this.format_amount(
                                            row.suspended_amount
                                        )}
                                    </td>

                                    <td>
                                        ${this.format_amount(
                                            row.returned_amount
                                        )}
                                    </td>

                                    <td>
                                        ${this.format_amount(
                                            row.remaining_amount
                                        )}
                                    </td>

                                    <td>
                                        ${this.format_datetime(
                                            row.return_datetime
                                        )}
                                    </td>

                                    <td>
                                        ${this.escape(
                                            row.entered_by
                                        )}
                                    </td>

                                    <td>
                                        ${this.format_datetime(
                                            row.entered_at
                                        )}
                                    </td>
                                </tr>
                            `
                        ).join("")}
                    </tbody>

                </table>

            </div>
        `);
    }

    render_attachments() {
        const $root =
            this.dialog
                .fields_dict
                .attachments_view
                .$wrapper
                .find(
                    ".pending-view-attachments"
                );

        const can_manage =
            Boolean(
                this.details
                    ?.capabilities
                    ?.can_manage_attachments
            );

        if (
            !window
                .ArchivePendingAttachmentManager
        ) {
            $root.html(
                `
                    <div class="pending-view-empty">
                        تعذر تحميل مكوّن المرفقات.
                    </div>
                `
            );

            return;
        }

        if (
            !this.attachment_manager
        ) {
            this.attachment_manager =
                new window
                    .ArchivePendingAttachmentManager({
                        root:
                            $root,

                        operation_name:
                            this.name,

                        deferred:
                            false,

                        can_manage,

                        attachments:
                            this.details
                                .attachments
                            || [],

                        on_changed:
                            async () => {
                                await this
                                    .reload_details();

                                if (
                                    this.on_changed
                                ) {
                                    await this
                                        .on_changed(
                                            this.details
                                        );
                                }
                            },
                    });

            return;
        }

        this.attachment_manager
            .set_operation_name(
                this.name
            );

        this.attachment_manager
            .set_can_manage(
                can_manage
            );

        this.attachment_manager
            .set_attachments(
                this.details
                    .attachments
                || []
            );
    }

    async open_return_dialog() {
        const operation =
            this.details.operation;

        if (
            !this.details
                ?.capabilities
                ?.can_add_return
        ) {
            frappe.msgprint({
                title:
                    "غير مسموح",

                message:
                    "لا يمكن إضافة إرجاع لهذه العملية.",

                indicator:
                    "red",
            });

            return;
        }

        const dialog =
            new frappe.ui.Dialog({
                title:
                    `إضافة إرجاع — ${operation.name}`,

                fields: [
                    {
                        fieldname:
                            "currency",

                        fieldtype:
                            "Data",

                        hidden:
                            1,

                        default:
                            operation.currency,
                    },

                    {
                        fieldname:
                            "remaining_amount",

                        fieldtype:
                            "Currency",

                        label:
                            "الرصيد المتبقي",

                        options:
                            "currency",

                        read_only:
                            1,

                        default:
                            operation.remaining_amount,
                    },

                    {
                        fieldname:
                            "returned_amount",

                        fieldtype:
                            "Currency",

                        label:
                            "المبلغ المرتجع",

                        options:
                            "currency",

                        reqd:
                            1,
                    },

                    {
                        fieldname:
                            "return_datetime",

                        fieldtype:
                            "Datetime",

                        label:
                            "تاريخ ووقت الإرجاع",

                        reqd:
                            1,

                        default:
                            frappe.datetime
                                .now_datetime(),
                    },
                ],

                primary_action_label:
                    "تسجيل الإرجاع",

                primary_action:
                    async () => {
                        if (
                            this.is_returning
                        ) {
                            return;
                        }

                        const values =
                            dialog.get_values();

                        if (!values) {
                            return;
                        }

                        const amount =
                            Number(
                                values.returned_amount
                            );

                        const remaining =
                            Number(
                                operation.remaining_amount
                                || 0
                            );

                        if (
                            !Number.isFinite(
                                amount
                            )
                            ||
                            amount <= 0
                        ) {
                            frappe.msgprint({
                                message:
                                    "يجب أن يكون المبلغ المرتجع موجبًا.",

                                indicator:
                                    "red",
                            });

                            return;
                        }

                        if (
                            amount
                            > remaining
                        ) {
                            frappe.msgprint({
                                message:
                                    `المبلغ المرتجع يتجاوز الرصيد المتبقي (${this.format_amount(
                                        remaining
                                    )}).`,

                                indicator:
                                    "red",
                            });

                            return;
                        }

                        this.is_returning =
                            true;

                        dialog
                            .get_primary_btn()
                            .prop(
                                "disabled",
                                true
                            )
                            .text(
                                "جارٍ التسجيل..."
                            );

                        try {
                            await frappe.call({
                                method:
                                    "archive.api.pending_operations.add_pending_return",

                                type:
                                    "POST",

                                args: {
                                    name:
                                        this.name,

                                    payload: {
                                        returned_amount:
                                            values.returned_amount,

                                        return_datetime:
                                            values.return_datetime,
                                    },
                                },
                            });

                            dialog.hide();

                            await this.reload_details();

                            if (
                                this.on_changed
                            ) {
                                await this.on_changed(
                                    this.details
                                );
                            }

                            frappe.show_alert({
                                message:
                                    "تم تسجيل الإرجاع بنجاح",

                                indicator:
                                    "green",
                            });

                        } finally {
                            this.is_returning =
                                false;

                            dialog
                                .get_primary_btn()
                                .prop(
                                    "disabled",
                                    false
                                )
                                .text(
                                    "تسجيل الإرجاع"
                                );
                        }
                    },
            });

        dialog.show();
    }

    async reload_details() {
        await this.load_details();

        this.refresh_view();
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
                    maximumFractionDigits:
                        9,
                }
            )
            .format(
                number
            );
    }

    format_datetime(value) {
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

    escape(value) {
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

    destroy() {
        this.correction_dialog
            ?.destroy();

        this.correction_dialog =
            null;
        this.attachment_manager
            ?.destroy();

        this.attachment_manager =
            null;
        this.timeline_dialog
            ?.destroy();

        this.timeline_dialog =
            null;
        this.smart_autocomplete
            ?.destroy();

        this.smart_autocomplete =
            null;
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
                ".pending_view"
            );

        this.dialog
            ?.$wrapper
            ?.remove();
    }
};