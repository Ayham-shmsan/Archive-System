window.ArchivePendingOperationDialog =
class ArchivePendingOperationDialog {
    constructor(options = {}) {
        this.options = options;

        this.on_created =
            typeof options.on_created === "function"
                ? options.on_created
                : null;
        this.card_account_lookup =
            window
                .ArchivePendingCardAccountLookup
                ? new window
                    .ArchivePendingCardAccountLookup({
                        rows:
                            Array.isArray(
                                options.lookup_rows
                            )
                                ? options.lookup_rows
                                : [],
                    })
                : null;

        this.row_counter = 0;

        this.is_saving = false;

        this.is_destroyed = false;

        this.syncing_suspended_amount =
            false;

        this.make_dialog();

        this.render_operation_datetime_editor();

        this.render_ledger_editor();

        this.setup_attachment_manager();

        this.setup_smart_autocomplete();
        this.setup_card_account_autofill();

        this.bind_events();

        this.add_ledger_row({
            suspended_amount: "",
            returned_amount: 0,
            return_date: "",
            return_note: "",
        });

        this.set_default_operation_datetime();

        this.recalculate_preview();
    }


    make_dialog() {
        this.dialog =
            new frappe.ui.Dialog({
                title:
                    __("إنشاء عملية معلقة"),

                size:
                    "extra-large",

                fields: [

                    {
                        fieldname:
                            "card_operation_section",

                        fieldtype:
                            "Section Break",

                        label:
                            "بيانات البطاقة والمعلق",
                    },

                    {
                        fieldname:
                            "bank",

                        fieldtype:
                            "Link",

                        label:
                            "اسم البنك",

                        options:
                            "Archive Bank",

                        reqd:
                            1,
                    },

                    {
                        fieldname:
                            "account_number",

                        fieldtype:
                            "Data",

                        label:
                            "رقم الحساب",

                        reqd:
                            1,
                    },

                    {
                        fieldname:
                            "operation_datetime_editor",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-operation-datetime-editor
                                    "
                                ></div>
                            `,
                    },

                    {
                        fieldtype:
                            "Column Break",
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
                        fieldname:
                            "currency",

                        fieldtype:
                            "Data",

                        hidden:
                            1,

                        default:
                            "SAR",
                    },

                    {
                        fieldname:
                            "suspended_amount_header",

                        fieldtype:
                            "Currency",

                        label:
                            "المبلغ المعلق",

                        options:
                            "currency",

                        reqd:
                            1,
                    },

                    

                    {
                        fieldname:
                            "suspended_note",

                        fieldtype:
                            "Small Text",

                        label:
                            "ملاحظات المعلق",
                    },


                    {
                        fieldname:
                            "bank_location_section",

                        fieldtype:
                            "Section Break",

                        label:
                            "موقع البنك وبيانات المكينة",
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
                            "branch_no",

                        fieldtype:
                            "Data",

                        label:
                            "رقم الفرع",

                        reqd:
                            1,
                    },

                    {
                        fieldtype:
                            "Column Break",
                    },

                    {
                        fieldname:
                            "machine_location",

                        fieldtype:
                            "Data",

                        label:
                            "العنوان",

                        reqd:
                            1,
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
                            "depositor_section",

                        fieldtype:
                            "Section Break",

                        label:
                            "بيانات المودع ومالك البطاقة",
                    },

                    {
                        fieldname:
                            "representative",

                        fieldtype:
                            "Link",

                        label:
                            "اسم المندوب",

                        options:
                            "Archive Representative",

                        reqd:
                            1,
                    },

                    {
                        fieldtype:
                            "Column Break",
                    },

                    {
                        fieldname:
                            "card_owner",

                        fieldtype:
                            "Link",

                        label:
                            "مالك البطاقة",

                        options:
                            "Archive Account",

                        reqd:
                            1,
                    },


                    {
                        fieldname:
                            "attachments_section",

                        fieldtype:
                            "Section Break",

                        label:
                            "المرفقات",
                    },

                    {
                        fieldname:
                            "attachments_editor",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-create-attachments
                                    "
                                ></div>
                            `,
                    },


                    {
                        fieldname:
                            "ledger_section",

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
                                    class="
                                        pending-create-ledger-editor
                                    "
                                ></div>
                            `,
                    },

                    {
                        fieldname:
                            "financial_summary",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-create-summary
                                    "
                                ></div>
                            `,
                    },


                    {
                        fieldname:
                            "notes_section",

                        fieldtype:
                            "Section Break",

                        label:
                            "الملاحظات",
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

        this.dialog
            .$wrapper
            .addClass(
                "archive-pending-operation-dialog"
            )
            .attr(
                "dir",
                "rtl"
            )
            .on(
                "hidden.bs.modal.archive_pending_create",
                () => {
                    this.destroy();
                }
            );
    }


    render_operation_datetime_editor() {
        this.$datetime_root =
            this.dialog
                .fields_dict
                .operation_datetime_editor
                .$wrapper
                .find(
                    ".pending-operation-datetime-editor"
                );

        this.$datetime_root.html(`
            <div
                class="
                    pending-combined-datetime-control
                "
            >
                <label
                    class="
                        control-label
                        reqd
                    "
                >
                    التاريخ والوقت المعلق
                </label>

                <div
                    class="
                        pending-combined-datetime-inputs
                    "
                >
                    <input
                        type="date"
                        class="
                            form-control
                            pending-operation-date
                        "
                        aria-label="تاريخ المعلق"
                    >

                    <input
                        type="text"
                        class="
                            form-control
                            pending-operation-time
                        "
                        inputmode="numeric"
                        maxlength="5"
                        placeholder="hh:mm"
                        autocomplete="off"
                        aria-label="وقت المعلق"
                    >
                    <select
                        class="
                            form-control
                            pending-operation-period
                        "
                        aria-label="صباح أو مساء"
                    >
                        <option value="AM">
                            ص
                        </option>

                        <option value="PM">
                            م
                        </option>
                    </select>

                    
                </div>
            </div>
        `);
    }


    set_default_operation_datetime() {
        const now =
            new Date();

        const pad =
            (value) =>
                String(value)
                    .padStart(
                        2,
                        "0"
                    );

        const hours24 =
            now.getHours();

        const period =
            hours24 >= 12
                ? "PM"
                : "AM";

        const hours12 =
            hours24 % 12
            || 12;

        this.$datetime_root
            .find(
                ".pending-operation-date"
            )
            .val(
                [
                    now.getFullYear(),

                    pad(
                        now.getMonth()
                        + 1
                    ),

                    pad(
                        now.getDate()
                    ),
                ].join("-")
            );

        this.$datetime_root
            .find(
                ".pending-operation-time"
            )
            .val(
                `${
                    pad(
                        hours12
                    )
                }:${
                    pad(
                        now.getMinutes()
                    )
                }`
            );

        this.$datetime_root
            .find(
                ".pending-operation-period"
            )
            .val(
                period
            );
    }


    get_operation_datetime_value({
        show_error = false,
    } = {}) {
        const date =
            String(
                this.$datetime_root
                    .find(
                        ".pending-operation-date"
                    )
                    .val()
                || ""
            ).trim();

        const time =
            String(
                this.$datetime_root
                    .find(
                        ".pending-operation-time"
                    )
                    .val()
                || ""
            ).trim();

        const period =
            String(
                this.$datetime_root
                    .find(
                        ".pending-operation-period"
                    )
                    .val()
                || ""
            ).trim();

        if (
            !date
            ||
            !time
            ||
            ![
                "AM",
                "PM",
            ].includes(
                period
            )
        ) {
            if (
                show_error
            ) {
                frappe.msgprint({
                    title:
                        "التاريخ والوقت المعلق مطلوب",

                    message:
                        "أدخل التاريخ والوقت وحدد ص أو م.",

                    indicator:
                        "red",
                });
            }

            return null;
        }

        const parts =
            time.split(
                ":"
            );

        const hour12 =
            Number(
                parts[0]
            );

        const minute =
            Number(
                parts[1]
            );

        if (
            !Number.isInteger(
                hour12
            )
            ||
            hour12 < 1
            ||
            hour12 > 12
            ||
            !Number.isInteger(
                minute
            )
            ||
            minute < 0
            ||
            minute > 59
        ) {
            if (
                show_error
            ) {
                frappe.msgprint({
                    title:
                        "وقت غير صالح",

                    message:
                        "أدخل الوقت بصيغة 12 ساعة ثم حدد ص أو م.",

                    indicator:
                        "red",
                });
            }

            return null;
        }

        let hour24 =
            hour12 % 12;

        if (
            period === "PM"
        ) {
            hour24 += 12;
        }

        return (
            `${date} `
            +
            `${
                String(
                    hour24
                ).padStart(
                    2,
                    "0"
                )
            }:`
            +
            `${
                String(
                    minute
                ).padStart(
                    2,
                    "0"
                )
            }:00`
        );
    }


    get_operation_date_value() {
        return String(
            this.$datetime_root
                .find(
                    ".pending-operation-date"
                )
                .val()
            || ""
        ).trim();
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
            <div
                class="
                    pending-ledger-toolbar
                "
            >
                <div>
                    <div
                        class="
                            pending-ledger-title
                        "
                    >
                        الحركات المالية
                    </div>

                    <div
                        class="
                            pending-ledger-subtitle
                        "
                    >
                        المبلغ المعلق في الأعلى
                        مرتبط بأول حركة،
                        والحساب النهائي والتحقق
                        يتمان على السيرفر.
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

            <div
                class="
                    pending-ledger-scroll
                "
            >
                <table
                    class="
                        pending-ledger-table
                    "
                >
                    <thead>
                        <tr>
                            <th
                                class="
                                    pending-col-index
                                "
                            >
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

                            <th
                                class="
                                    pending-col-note
                                "
                            >
                                ملاحظة الإرجاع
                            </th>

                            <th
                                class="
                                    pending-col-action
                                "
                            ></th>
                        </tr>
                    </thead>

                    <tbody
                        class="
                            pending-ledger-rows
                        "
                    ></tbody>
                </table>
            </div>
        `);

        this.$ledger_rows =
            this.$ledger_root
                .find(
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
            <div
                class="
                    pending-create-summary-grid
                "
            >
                ${
                    this.summary_card_html(
                        "إجمالي المعلق",
                        "pending-summary-suspended"
                    )
                }

                ${
                    this.summary_card_html(
                        "إجمالي المرتجع",
                        "pending-summary-returned"
                    )
                }

                ${
                    this.summary_card_html(
                        "المتبقي",
                        "pending-summary-remaining"
                    )
                }

                <div
                    class="
                        pending-create-summary-card
                        pending-create-status-card
                    "
                >
                    <span
                        class="
                            pending-summary-label
                        "
                    >
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


    summary_card_html(
        label,
        value_class
    ) {
        return `
            <div
                class="
                    pending-create-summary-card
                "
            >
                <span
                    class="
                        pending-summary-label
                    "
                >
                    ${
                        this.escape_attribute(
                            label
                        )
                    }
                </span>

                <strong
                    class="${value_class}"
                >
                    0
                </strong>

                <span
                    class="
                        pending-summary-currency
                    "
                >
                    ر.س
                </span>
            </div>
        `;
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
                        "card_name",
                        "account_number",
                        "card_number",

                        "machine_location",
                        "machine_no",
                        "branch_no",
                    ],

                    context_provider:
                        () =>
                            this
                                .get_smart_lookup_context(),

                    enabled_provider:
                        () =>
                            !this.is_saving,

                    limit:
                        10,
                    on_select:
                        ({
                            fieldname,
                            value,
                        }) => {

                            if (
                                ![
                                    "card_name",
                                    "account_number",
                                ].includes(
                                    fieldname
                                )
                            ) {
                                return;
                            }


                            /*
                            * القيمة تم وضعها بالفعل في الحقل
                            * بواسطة Smart Autocomplete.
                            *
                            * نبدأ Card ↔ Account resolver فورًا.
                            */
                            this
                                .schedule_card_account_autofill(
                                    fieldname
                                );
                        },
                });
    }


    
    get_smart_lookup_context() {
            return {
                bank:
                    this.dialog
                        .get_value(
                            "bank"
                        ),

                card_owner:
                    this.dialog
                        .get_value(
                            "card_owner"
                        ),

                card_name:
                    this.dialog
                        .get_value(
                            "card_name"
                        ),

                account_number:
                    this.dialog
                        .get_value(
                            "account_number"
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
    setup_card_account_autofill() {
        if (!this.dialog) {
            return;
        }

        if (!this.card_account_autofill_state) {
            this.card_account_autofill_state = {
                timer:
                    null,

                request_sequence:
                    0,

                applying:
                    false,

                auto_values:
                    {},
            };
        }


        const fields = [
            "card_name",
            "account_number",
        ];


        for (
            const fieldname
            of fields
        ) {
            const control =
                this.dialog
                    .fields_dict
                    ?.[fieldname];

            if (
                !control
                || !control.$input
                || !control.$input.length
            ) {
                continue;
            }


            control.$input
                .off(
                    ".archiveCardAccountAutofill"
                )
                .on(
                    [
                        "input.archiveCardAccountAutofill",
                        "change.archiveCardAccountAutofill",
                        "blur.archiveCardAccountAutofill",
                    ].join(" "),

                    () => {
                        if (
                            this
                                .card_account_autofill_state
                                .applying
                        ) {
                            return;
                        }


                        const current_value =
                            String(
                                this.dialog
                                    .get_value(
                                        fieldname
                                    )
                                || ""
                            ).trim();


                        const previous_auto =
                            this
                                .card_account_autofill_state
                                .auto_values[
                                    fieldname
                                ];


                        /*
                        * إذا عدّل المستخدم قيمة كانت
                        * Auto-filled يدويًا، فهي لم تعد
                        * ملك النظام ولا نستبدلها بصمت.
                        */
                        if (
                            previous_auto
                            &&
                            current_value
                            !== previous_auto
                        ) {
                            delete this
                                .card_account_autofill_state
                                .auto_values[
                                    fieldname
                                ];
                        }


                        this
                            .schedule_card_account_autofill(
                                fieldname
                            );
                    }
                );
        }
    }


    // schedule_card_account_autofill(
    //     fieldname
    // ) {
    //     const state =
    //         this.card_account_autofill_state;

    //     if (!state) {
    //         return;
    //     }


    //     clearTimeout(
    //         state.timer
    //     );


    //     state.timer =
    //         setTimeout(
    //             () => {
    //                 this
    //                     .apply_card_account_autofill(
    //                         fieldname
    //                     );
    //             },
    //             300
    //         );
    // }
    schedule_card_account_autofill(
        fieldname
    ) {
        const state =
            this
                .card_account_autofill_state;


        if (!state) {
            return;
        }


        clearTimeout(
            state.timer
        );


        const relation = {
            card_name:
                "account_number",

            account_number:
                "card_name",
        };


        const target_fieldname =
            relation[
                fieldname
            ];


        if (
            !target_fieldname
        ) {
            return;
        }


        const source_value =
            String(
                this.dialog
                    .get_value(
                        fieldname
                    )
                || ""
            ).trim();


        /*
        * إذا مسح المستخدم المصدر، نترك الدالة
        * الحالية تتعامل فورًا مع تنظيف Auto Value.
        *
        * هذا المسار لا ينفذ Request لأن
        * apply_card_account_autofill() يرجع
        * قبل frappe.call عندما source فارغ.
        */
        if (!source_value) {
            this
                .apply_card_account_autofill(
                    fieldname
                );

            return;
        }


        // ========================================================
        // FAST PATH
        //
        // البيانات موجودة أصلًا في Context الشاشة.
        // لا Debounce ولا Server Request.
        // ========================================================

        const local_value =
            this.card_account_lookup
                ?.resolve(
                    fieldname,
                    source_value,
                    this
                        .get_smart_lookup_context()
                )
            || "";


        if (local_value) {
            const current_target_value =
                String(
                    this.dialog
                        .get_value(
                            target_fieldname
                        )
                    || ""
                ).trim();


            const previous_auto_target =
                state
                    .auto_values[
                        target_fieldname
                    ];


            const target_is_auto_owned =
                Boolean(
                    previous_auto_target
                    &&
                    current_target_value
                    === previous_auto_target
                );


            /*
            * المستخدم كتب الطرف الآخر بنفسه:
            * لا نستبدله.
            */
            if (
                current_target_value
                &&
                !target_is_auto_owned
            ) {
                return;
            }


            /*
            * موجودة أصلًا.
            */
            if (
                current_target_value
                === local_value
            ) {
                state
                    .auto_values[
                        target_fieldname
                    ] =
                        local_value;

                return;
            }


            state.applying =
                true;


            Promise
                .resolve(
                    this.dialog
                        .set_value(
                            target_fieldname,
                            local_value
                        )
                )
                .then(
                    () => {
                        state
                            .auto_values[
                                target_fieldname
                            ] =
                                local_value;
                    }
                )
                .finally(
                    () => {
                        state.applying =
                            false;
                    }
                );


            return;
        }


        // ========================================================
        // FALLBACK
        //
        // لا توجد علاقة محلية أو العلاقة ملتبسة.
        // ننتظر فقط في هذه الحالة قبل الرجوع للسيرفر.
        // ========================================================

        state.timer =
            setTimeout(
                () => {
                    this
                        .apply_card_account_autofill(
                            fieldname
                        );
                },
                250
            );
    }


    async apply_card_account_autofill(
        fieldname
    ) {
        const relation = {
            card_name:
                "account_number",

            account_number:
                "card_name",
        };


        const target_fieldname =
            relation[
                fieldname
            ];


        if (
            !target_fieldname
            || !this.dialog
        ) {
            return;
        }


        const state =
            this.card_account_autofill_state;


        if (
            !state
            || state.applying
        ) {
            return;
        }


        const source_value =
            String(
                this.dialog
                    .get_value(
                        fieldname
                    )
                || ""
            ).trim();


        const current_target_value =
            String(
                this.dialog
                    .get_value(
                        target_fieldname
                    )
                || ""
            ).trim();


        const previous_auto_target =
            state
                .auto_values[
                    target_fieldname
                ];


        const target_is_auto_owned =
            Boolean(
                previous_auto_target
                &&
                current_target_value
                === previous_auto_target
            );


        /*
        * إذا مسح المستخدم المصدر، نمسح الطرف الآخر
        * فقط إذا كان النظام هو الذي ملأه.
        *
        * لا نمسح قيمة كتبها المستخدم بنفسه.
        */
        if (!source_value) {
            if (
                target_is_auto_owned
            ) {
                state.applying =
                    true;

                try {
                    await this.dialog
                        .set_value(
                            target_fieldname,
                            ""
                        );

                    delete state
                        .auto_values[
                            target_fieldname
                        ];

                } finally {
                    state.applying =
                        false;
                }
            }

            return;
        }


        const request_sequence =
            ++state
                .request_sequence;


        let response = null;


        try {
            response =
                    await frappe.call({
                        method:
                            "archive.api.pending_lookups.get_pending_related_fields",

                        type:
                            "GET",

                        args: {
                            fieldname:
                                fieldname,

                            value:
                                source_value,

                            context:
                                JSON.stringify(
                                    this
                                        .get_smart_lookup_context()
                                ),
                        },
                    });

        } catch (error) {
            console.error(
                "Card/account autofill failed:",
                error
            );

            return;
        }


        /*
        * تجاهل Response قديم إذا كتب المستخدم
        * قيمة جديدة قبل عودة الطلب السابق.
        */
        if (
            request_sequence
            !== state
                .request_sequence
        ) {
            return;
        }


        const latest_source_value =
            String(
                this.dialog
                    .get_value(
                        fieldname
                    )
                || ""
            ).trim();


        if (
            latest_source_value
            !== source_value
        ) {
            return;
        }


        const related =
            response
                ?.message
                ?.related
            || {};


        const suggestion =
            related[
                target_fieldname
            ];


        /*
        * لا نملأ تلقائيًا إلا العلاقة
        * التي يعتبرها السيرفر مؤكدة تاريخيًا.
        *
        * tentative تعني أن لدينا سجلًا واحدًا فقط،
        * وهذا لا يكفي للتعبئة التلقائية.
        */
        const has_usable_confidence =
            Boolean(
                suggestion
                &&
                (
                    suggestion.confidence
                        === "high"
                    ||
                    suggestion.confidence
                        === "tentative"
                )
            );


        const suggested_value =
            has_usable_confidence
                ? String(
                    suggestion.value
                    || ""
                ).trim()
                : "";


        const latest_target_value =
            String(
                this.dialog
                    .get_value(
                        target_fieldname
                    )
                || ""
            ).trim();


        const latest_auto_target =
            state
                .auto_values[
                    target_fieldname
                ];


        const latest_target_is_auto =
            Boolean(
                latest_auto_target
                &&
                latest_target_value
                === latest_auto_target
            );


        /*
        * لا توجد علاقة مؤكدة.
        *
        * إذا كانت القيمة القديمة Auto-fill
        * من علاقة سابقة، نمسحها حتى لا تبقى
        * بيانات غير متوافقة.
        */
        if (!suggested_value) {
            if (
                latest_target_is_auto
            ) {
                state.applying =
                    true;

                try {
                    await this.dialog
                        .set_value(
                            target_fieldname,
                            ""
                        );

                    delete state
                        .auto_values[
                            target_fieldname
                        ];

                } finally {
                    state.applying =
                        false;
                }
            }

            return;
        }


        /*
        * إذا كتب المستخدم الطرف الآخر بنفسه،
        * لا نستبدله.
        */
        if (
            latest_target_value
            &&
            !latest_target_is_auto
        ) {
            return;
        }


        /*
        * القيمة موجودة أصلًا ولا تحتاج إعادة Set.
        */
        if (
            latest_target_value
            === suggested_value
        ) {
            state
                .auto_values[
                    target_fieldname
                ] =
                    suggested_value;

            return;
        }


        state.applying =
            true;


        try {
            await this.dialog
                .set_value(
                    target_fieldname,
                    suggested_value
                );


            state
                .auto_values[
                    target_fieldname
                ] =
                    suggested_value;

        } finally {
            state.applying =
                false;
        }
    }


    bind_events() {
        this.$ledger_root
            .on(
                "click",
                ".pending-ledger-add-row",
                () => {
                    this.add_ledger_row();
                }
            )
            .on(
                "click",
                ".pending-ledger-remove-row",
                (event) => {
                    this.remove_ledger_row(
                        $(
                            event.currentTarget
                        ).closest(
                            ".pending-ledger-row"
                        )
                    );
                }
            )
            .on(
                "input",
                `
                    .pending-ledger-suspended,
                    .pending-ledger-returned
                `,
                (event) => {
                    const $input =
                        $(
                            event.currentTarget
                        );

                    const $row =
                        $input.closest(
                            ".pending-ledger-row"
                        );

                    if (
                        $input.hasClass(
                            "pending-ledger-returned"
                        )
                    ) {
                        this.sync_return_fields(
                            $row
                        );
                    }

                    if (
                        $input.hasClass(
                            "pending-ledger-suspended"
                        )
                        &&
                        $row.is(
                            this.$ledger_rows
                                .find(
                                    ".pending-ledger-row"
                                )
                                .first()
                        )
                    ) {
                        this.sync_first_row_to_header();
                    }

                    this.recalculate_preview();
                }
            )
            .on(
                "change input",
                `
                    .pending-ledger-return-date,
                    .pending-ledger-return-note
                `,
                () => {
                    this.recalculate_preview();
                }
            );
        this.$datetime_root
            .on(
                "input",
                ".pending-operation-time",
                (event) => {
                    const input =
                        event.currentTarget;

                    let value =
                        String(
                            input.value
                            || ""
                        )
                        .replace(
                            /[^0-9:]/g,
                            ""
                        );

                    /*
                    * إذا كتب:
                    * 1036
                    *
                    * تصبح:
                    * 10:36
                    */
                    const digits =
                        value.replace(
                            /:/g,
                            ""
                        );

                    if (
                        !value.includes(":")
                        &&
                        digits.length > 2
                    ) {
                        value =
                            `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
                    }

                    input.value =
                        value.slice(
                            0,
                            5
                        );
                }
            );
        this.$datetime_root
            .on(
                "change input",
                `
                    .pending-operation-date,
                    .pending-operation-time,
                    .pending-operation-period
                `,
                () => {
                    this.recalculate_preview();
                }
            );

        const header_control =
            this.dialog
                .fields_dict
                .suspended_amount_header;

        header_control
            ?.$input
            ?.on(
                `
                    input.archive_pending_create
                    change.archive_pending_create
                `,
                () => {
                    this.sync_header_to_first_row();
                }
            );
    }


    sync_header_to_first_row() {
        if (
            this.syncing_suspended_amount
        ) {
            return;
        }

        const $first =
            this.$ledger_rows
                .find(
                    ".pending-ledger-row"
                )
                .first();

        if (
            !$first.length
        ) {
            return;
        }

        this.syncing_suspended_amount =
            true;

        $first
            .find(
                ".pending-ledger-suspended"
            )
            .val(
                this.dialog
                    .get_value(
                        "suspended_amount_header"
                    )
                ?? ""
            );

        this.syncing_suspended_amount =
            false;

        this.recalculate_preview();
    }


    sync_first_row_to_header() {
        if (
            this.syncing_suspended_amount
        ) {
            return;
        }

        const value =
            this.$ledger_rows
                .find(
                    ".pending-ledger-row"
                )
                .first()
                .find(
                    ".pending-ledger-suspended"
                )
                .val();

        this.syncing_suspended_amount =
            true;

        const control =
            this.dialog
                .fields_dict
                .suspended_amount_header;

        control
            ?.set_value(
                value
                || 0
            );

        this.syncing_suspended_amount =
            false;
    }


    add_ledger_row(
        values = {}
    ) {
        this.row_counter += 1;

        const key =
            `pending-ledger-${this.row_counter}`;

        const suspended =
            values.suspended_amount
            ?? "";

        const returned =
            values.returned_amount
            ?? 0;

        const return_date =
            values.return_date
            || "";

        const return_note =
            values.return_note
            || "";

        const has_return =
            Number(
                returned
            ) > 0;

        this.$ledger_rows.append(`
            <tr
                class="
                    pending-ledger-row
                "
                data-row-key="${key}"
            >
                <td
                    class="
                        pending-ledger-index
                        pending-col-index
                    "
                ></td>

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
                        value="${
                            this.escape_attribute(
                                suspended
                            )
                        }"
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
                        value="${
                            this.escape_attribute(
                                returned
                            )
                        }"
                        placeholder="0"
                        aria-label="المبلغ المرتجع"
                    >
                </td>

                <td>
                    <div
                        class="
                            pending-ledger-remaining
                        "
                    >
                        0
                    </div>
                </td>

                <td>
                    <input
                        type="date"
                        class="
                            form-control
                            pending-ledger-return-date
                        "
                        value="${
                            this.escape_attribute(
                                return_date
                            )
                        }"
                        ${
                            has_return
                                ? ""
                                : "disabled"
                        }
                        aria-label="تاريخ الإرجاع"
                    >
                </td>

                <td
                    class="
                        pending-col-note
                    "
                >
                    <input
                        type="text"
                        class="
                            form-control
                            pending-ledger-return-note
                        "
                        value="${
                            this.escape_attribute(
                                return_note
                            )
                        }"
                        ${
                            has_return
                                ? ""
                                : "disabled"
                        }
                        maxlength="2000"
                        placeholder="ملاحظة الإرجاع"
                        aria-label="ملاحظة الإرجاع"
                    >
                </td>

                <td
                    class="
                        pending-col-action
                    "
                >
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
        `);

        this.refresh_row_indexes();

        this.recalculate_preview();
    }


    remove_ledger_row(
        $row
    ) {
        const $rows =
            this.$ledger_rows
                .find(
                    ".pending-ledger-row"
                );

        if (
            $rows.length <= 1
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

        const removing_first =
            $row.is(
                $rows.first()
            );

        $row.remove();

        this.refresh_row_indexes();

        if (
            removing_first
        ) {
            this.sync_first_row_to_header();
        }

        this.recalculate_preview();
    }


    refresh_row_indexes() {
        const $rows =
            this.$ledger_rows
                .find(
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

        $rows
            .find(
                ".pending-ledger-remove-row"
            )
            .prop(
                "disabled",
                $rows.length <= 1
            );
    }


    sync_return_fields(
        $row
    ) {
        const returned =
            this.parse_amount(
                $row
                    .find(
                        ".pending-ledger-returned"
                    )
                    .val()
            );

        const has_return =
            Number.isFinite(
                returned
            )
            &&
            returned > 0;

        const $date =
            $row.find(
                ".pending-ledger-return-date"
            );

        const $note =
            $row.find(
                ".pending-ledger-return-note"
            );

        if (
            has_return
        ) {
            $date.prop(
                "disabled",
                false
            );

            $note.prop(
                "disabled",
                false
            );

            if (
                !$date.val()
            ) {
                $date.val(
                    this.get_operation_date_value()
                    ||
                    this.today_value()
                );
            }

            return;
        }

        $date
            .prop(
                "disabled",
                true
            )
            .val("");

        $note
            .prop(
                "disabled",
                true
            )
            .val("");
    }


    recalculate_preview({
        show_errors = false,
    } = {}) {
        let total_suspended =
            0;

        let total_returned =
            0;

        let balance =
            0;

        let valid =
            true;

        const errors =
            [];

        const rows =
            [];

        const operation_date =
            this.get_operation_date_value();

        const $rows =
            this.$ledger_rows
                .find(
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

                const return_date =
                    String(
                        $row
                            .find(
                                ".pending-ledger-return-date"
                            )
                            .val()
                        || ""
                    ).trim();

                const return_note =
                    String(
                        $row
                            .find(
                                ".pending-ledger-return-note"
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
                    !return_date
                ) {
                    errors.push(
                        `تاريخ الإرجاع مطلوب في الحركة رقم ${row_number}.`
                    );

                    row_valid =
                        false;
                }

                if (
                    row_valid
                    &&
                    returned > 0
                    &&
                    operation_date
                    &&
                    return_date
                    &&
                    return_date
                        <
                    operation_date
                ) {
                    errors.push(
                        `تاريخ الإرجاع في الحركة رقم ${row_number} لا يمكن أن يكون أقدم من تاريخ المعلق.`
                    );

                    row_valid =
                        false;
                }

                if (
                    row_valid
                    &&
                    returned <= 0
                    &&
                    (
                        return_date
                        ||
                        return_note
                    )
                ) {
                    errors.push(
                        `لا يمكن إضافة تاريخ أو ملاحظة إرجاع بدون مبلغ مرتجع في الحركة رقم ${row_number}.`
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
                        <
                        -0.000000001
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

                $row
                    .find(
                        ".pending-ledger-remaining"
                    )
                    .text(
                        this.format_amount(
                            row_valid
                                ? balance
                                : next_balance
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

                    return_date,

                    return_note,

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
            balance
            > 0.000000001
        ) {
            status =
                "مرتجعة غير مكتملة";

        } else {
            status =
                "مرتجعة مكتملة";
        }

        const summary = {
            valid:
                valid
                &&
                errors.length
                    === 0,

            errors,

            rows,

            total_suspended,

            total_returned,

            remaining_amount:
                balance,

            status,
        };

        this.update_summary(
            summary
        );

        return summary;
    }


    update_summary(
        summary
    ) {
        this.$summary_root
            .find(
                ".pending-summary-suspended"
            )
            .text(
                this.format_amount(
                    summary
                        .total_suspended
                )
            );

        this.$summary_root
            .find(
                ".pending-summary-returned"
            )
            .text(
                this.format_amount(
                    summary
                        .total_returned
                )
            );

        this.$summary_root
            .find(
                ".pending-summary-remaining"
            )
            .text(
                this.format_amount(
                    summary
                        .remaining_amount
                )
            );

        const $status =
            this.$summary_root
                .find(
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
                            (
                                message
                            ) => `
                                <div
                                    class="
                                        pending-ledger-validation-message
                                    "
                                >
                                    • ${
                                        frappe.utils
                                            .escape_html(
                                                message
                                            )
                                    }
                                </div>
                            `
                        )
                        .join(""),
            });

            this.$ledger_rows
                .find(
                    ".pending-ledger-row.has-error"
                )
                .get(0)
                ?.scrollIntoView({
                    behavior:
                        "smooth",

                    block:
                        "center",
                });

            return null;
        }

        return result.rows
            .map(
                (
                    row
                ) => ({
                    suspended_amount:
                        this.round_preview(
                            row.suspended_amount
                        ),

                    returned_amount:
                        this.round_preview(
                            row.returned_amount
                        ),

                    return_date:
                        row.returned_amount
                        > 0
                            ? row.return_date
                            : null,

                    return_note:
                        row.returned_amount
                        > 0
                            ? row.return_note
                            : "",
                })
            );
    }


    async save() {
        if (
            this.is_saving
        ) {
            return;
        }

        const values =
            this.dialog
                .get_values();

        if (
            !values
        ) {
            return;
        }

        const operation_datetime =
            this.get_operation_datetime_value({
                show_error:
                    true,
            });

        if (
            !operation_datetime
        ) {
            return;
        }

        const ledger_entries =
            this.validate_and_build_ledger();

        if (
            !ledger_entries
        ) {
            return;
        }

        const payload = {
            bank:
                values.bank,

            card_name:
                String(
                    values.card_name
                    || ""
                ).trim(),

            account_number:
                String(
                    values.account_number
                    || ""
                ).trim(),

            card_number:
                String(
                    values.card_number
                    || ""
                ).trim(),

            operation_datetime,

            suspended_note:
                String(
                    values.suspended_note
                    || ""
                ).trim(),

            region:
                values.region,

            machine_location:
                String(
                    values.machine_location
                    || ""
                ).trim(),

            branch_no:
                String(
                    values.branch_no
                    || ""
                ).trim(),

            machine_no:
                String(
                    values.machine_no
                    || ""
                ).trim(),

            representative:
                values.representative,

            card_owner:
                values.card_owner,

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

        let staged_file_ids =
            [];

        try {
            const staged_result =
                this.attachment_manager
                    ? await this
                        .attachment_manager
                        .stage_for_create()
                    : {
                        staged:
                            [],

                        failed:
                            [],
                    };

            staged_file_ids =
                staged_result
                    .staged
                    .map(
                        (
                            item
                        ) =>
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

                staged_file_ids =
                    [];

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
                staged_file_ids
                    .length
            ) {
                payload.attachments =
                    staged_file_ids
                        .map(
                            (
                                file_id
                            ) => ({
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
                ?.name
            ) {
                throw new Error(
                    "لم يرجع السيرفر بيانات العملية الجديدة."
                );
            }

            staged_file_ids =
                [];

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
                await this
                    .on_created(
                        operation
                    );
            }

        } catch (
            error
        ) {
            console.error(
                "Pending operation creation failed:",
                error
            );

            if (
                staged_file_ids
                    .length
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


    set_saving(
        is_saving
    ) {
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

        this.dialog
            .$wrapper
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
                    .bank
                    ?.$input
                    ?.trigger(
                        "focus"
                    );
            },
            100
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

        this.smart_autocomplete
            ?.destroy();

        this.smart_autocomplete =
            null;

        this.attachment_manager
            ?.destroy();

        this.attachment_manager =
            null;

        this.$ledger_root
            ?.off();

        this.$datetime_root
            ?.off();

        this.dialog
            ?.fields_dict
            ?.suspended_amount_header
            ?.$input
            ?.off(
                ".archive_pending_create"
            );

        this.dialog
            ?.$wrapper
            ?.off(
                ".archive_pending_create"
            );

        this.dialog
            ?.$wrapper
            ?.remove();
    }


    parse_amount(
        value
    ) {
        const text =
            String(
                value
                ?? ""
            ).trim();

        if (
            !text
        ) {
            return 0;
        }

        const number =
            Number(
                text
            );

        return Number.isFinite(
            number
        )
            ? number
            : NaN;
    }


    round_preview(
        value
    ) {
        if (
            !Number.isFinite(
                Number(
                    value
                )
            )
        ) {
            return 0;
        }

        const factor =
            1000000000;

        return (
            Math.round(
                (
                    Number(
                        value
                    )
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


    is_zero(
        value
    ) {
        return (
            Math.abs(
                Number(
                    value
                )
                || 0
            )
            <
            0.000000001
        );
    }


    format_amount(
        value
    ) {
        const number =
            Number(
                value
            );

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


    today_value() {
        const date =
            new Date();

        const pad =
            (
                value
            ) =>
                String(
                    value
                ).padStart(
                    2,
                    "0"
                );

        return [
            date.getFullYear(),

            pad(
                date.getMonth()
                + 1
            ),

            pad(
                date.getDate()
            ),
        ].join("-");
    }


    escape_attribute(
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
};