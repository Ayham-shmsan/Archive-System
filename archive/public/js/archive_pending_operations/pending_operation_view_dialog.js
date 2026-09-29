window.ArchivePendingOperationViewDialog =
class ArchivePendingOperationViewDialog {
    constructor(options = {}) {
        this.name = String(
            options.name || ""
        ).trim();

        this.on_changed =
            typeof options.on_changed === "function"
                ? options.on_changed
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

        this.details = null;
        this.dialog = null;

        this.attachment_manager = null;
        this.smart_autocomplete = null;

        this.is_editing = false;
        this.is_saving = false;
        this.is_returning = false;
        this.is_destroyed = false;

        this.syncing_suspended_amount = false;
        this.ledger_row_counter = 0;

        this.metadata_fields = [
            "bank",
            "card_name",
            "account_number",
            "card_number",
            "suspended_note",
            "region",
            "machine_location",
            "branch_no",
            "machine_no",
            "representative",
            "card_owner",
            "notes",
        ];
    }


    async show() {
        if (!this.name) {
            return;
        }

        await this.load_details();

        if (
            !this.details
            ?.operation
        ) {
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
                                    class="
                                        pending-view-actions
                                    "
                                ></div>
                            `,
                    },


                    {
                        fieldname:
                            "card_pending_section",

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
                                        pending-view-datetime-editor
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
                            "location_section",

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
                            "attachments_view",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-view-attachments
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
                            "ledger_view",

                        fieldtype:
                            "HTML",

                        options:
                            `
                                <div
                                    class="
                                        pending-view-ledger
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
                                        pending-view-summary
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
                            "ملاحظة إنهاء المعلقة ",
                    },
                ],

                primary_action_label:
                    "حفظ التغييرات",

                primary_action:
                    () => {
                        this.save_changes();
                    },
            });

        this.dialog
            .$wrapper
            .addClass(
                "archive-pending-operation-view-dialog"
            )
            .attr(
                "dir",
                "rtl"
            );

        this.render_operation_datetime_editor();

        this.bind_events();

        this.setup_smart_autocomplete();
        this.setup_card_account_autofill();
    }


    render_operation_datetime_editor() {
        this.$datetime_root =
            this.dialog
                .fields_dict
                .operation_datetime_editor
                .$wrapper
                .find(
                    ".pending-view-datetime-editor"
                );

        this.$datetime_root.html(`
            <div
                class="
                    pending-view-combined-datetime-control
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
                        pending-view-combined-datetime-inputs
                    "
                >
                    <input
                        type="date"
                        class="
                            form-control
                            pending-view-operation-date
                        "
                        aria-label="تاريخ المعلق"
                    >

                    <input
                        type="time"
                        class="
                            form-control
                            pending-view-operation-time
                        "
                        min="01:00"
                        max="12:59"
                        step="60"
                        aria-label="وقت المعلق"
                    >

                    <select
                        class="
                            form-control
                            pending-view-operation-period
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
                            this.get_smart_lookup_context(),

                    enabled_provider:
                        () =>
                            (
                                this.is_editing
                                &&
                                this.can_edit_metadata()
                                &&
                                !this.is_saving
                            ),
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


    can_edit_metadata() {
        return Boolean(
            this.details
                ?.capabilities
                ?.can_edit
        );
    }


    can_correct_ledger() {
        return Boolean(
            this.details
                ?.capabilities
                ?.can_correct_ledger
        );
    }


    can_enter_edit_mode() {
        const capabilities =
            this.details
                ?.capabilities
            || {};

        return Boolean(
            capabilities
                .can_enter_edit_mode
            ??
            (
                capabilities.can_edit
                ||
                capabilities
                    .can_correct_ledger
            )
        );
    }


    refresh_view() {
        this.is_saving =
            false;

        this.is_editing =
            false;

        this.populate_fields();

        this.render_actions();

        this.set_edit_mode(
            false
        );
    }


    populate_fields() {
        const operation =
            this.details.operation;

        const values = {
            bank:
                operation.bank,

            card_name:
                operation.card_name,

            account_number:
                operation.account_number,

            card_number:
                operation.card_number,

            suspended_note:
                operation.suspended_note
                || "",

            region:
                operation.region,

            machine_location:
                operation.machine_location,

            branch_no:
                operation.branch_no,

            machine_no:
                operation.machine_no,

            representative:
                operation.representative,

            card_owner:
                operation.card_owner,

            currency:
                "SAR",

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
            this.dialog
                .set_value(
                    fieldname,
                    value
                );
        }

        this.render_closed_date_over_notes(
            operation.closed_date
        );

        this.set_operation_datetime_value(
            operation
                .operation_datetime
        );

        const first_row =
            (
                this.details
                    .ledger_entries
                || []
            )[0];

        this.syncing_suspended_amount =
            true;

        this.dialog
            .fields_dict
            .suspended_amount_header
            ?.set_value(
                first_row
                    ?.suspended_amount
                || 0
            );

        this.syncing_suspended_amount =
            false;
    }
    render_closed_date_over_notes(
        closed_date
    ) {
        const notes_field =
            this.dialog
                ?.fields_dict
                ?.notes;

        if (
            !notes_field
            || !notes_field.$wrapper
            || !notes_field.$wrapper.length
        ) {
            return;
        }

        let $display =
            notes_field
                .$wrapper
                .find(
                    ".pending-view-closed-date-over-notes"
                );

        if (
            !$display.length
        ) {
            $display = $(`
                <div
                    class="
                        pending-view-closed-date-over-notes
                    "
                >
                    <span
                        class="
                            pending-view-closed-date-label
                        "
                    ></span>

                    <span
                        class="
                            pending-view-closed-date-value
                        "
                        dir="ltr"
                    ></span>
                </div>
            `);

            notes_field
                .$wrapper
                .prepend(
                    $display
                );
        }

        $display
            .attr(
                "dir",
                document
                    .documentElement
                    .getAttribute(
                        "dir"
                    )
                || "ltr"
            );

        $display
            .find(
                ".pending-view-closed-date-label"
            )
            .text(
                __(
                    "Closing Date"
                ) + ":"
            );

        if (
            !closed_date
        ) {
            $display.hide();

            return;
        }

        $display
            .find(
                ".pending-view-closed-date-value"
            )
            .text(
                this.format_date(
                    closed_date
                )
            );

        $display.show();
    }


    set_operation_datetime_value(
        value
    ) {
        const parsed =
            this.parse_operation_datetime(
                value
            );

        this.$datetime_root
            .find(
                ".pending-view-operation-date"
            )
            .val(
                parsed.date
            );

        this.$datetime_root
            .find(
                ".pending-view-operation-time"
            )
            .val(
                parsed.time
            );

        this.$datetime_root
            .find(
                ".pending-view-operation-period"
            )
            .val(
                parsed.period
            );
    }


    parse_operation_datetime(
        value
    ) {
        const text =
            String(
                value
                || ""
            ).trim();

        const match =
            text.match(
                /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/
            );

        if (!match) {
            return {
                date:
                    "",

                time:
                    "",

                period:
                    "AM",
            };
        }

        const hour24 =
            Number(
                match[2]
            );

        const period =
            hour24 >= 12
                ? "PM"
                : "AM";

        const hour12 =
            hour24 % 12
            || 12;

        return {
            date:
                match[1],

            time:
                `${String(
                    hour12
                ).padStart(
                    2,
                    "0"
                )}:${match[3]}`,

            period,
        };
    }


    get_operation_datetime_value({
        show_error = false,
    } = {}) {
        const date =
            String(
                this.$datetime_root
                    .find(
                        ".pending-view-operation-date"
                    )
                    .val()
                || ""
            ).trim();

        const time =
            String(
                this.$datetime_root
                    .find(
                        ".pending-view-operation-time"
                    )
                    .val()
                || ""
            ).trim();

        const period =
            String(
                this.$datetime_root
                    .find(
                        ".pending-view-operation-period"
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

        const [
            hour_text,
            minute_text,
        ] =
            time.split(
                ":"
            );

        const hour12 =
            Number(
                hour_text
            );

        const minute =
            Number(
                minute_text
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
            hour24 +=
                12;
        }

        return (
            `${date} `
            +
            `${String(
                hour24
            ).padStart(
                2,
                "0"
            )}:`
            +
            `${String(
                minute
            ).padStart(
                2,
                "0"
            )}:00`
        );
    }


    get_operation_date_value() {
        return String(
            this.$datetime_root
                .find(
                    ".pending-view-operation-date"
                )
                .val()
            || ""
        ).trim();
    }


    bind_events() {
        this.dialog
            .$wrapper
            .on(
                "click.pending_view",
                ".pending-view-edit-button",
                () => {
                    this.set_edit_mode(
                        true
                    );
                }
            )
            .on(
                "click.pending_view",
                ".pending-view-cancel-edit-button",
                () => {
                    this.populate_fields();

                    this.set_edit_mode(
                        false
                    );
                }
            )
            .on(
                "click.pending_view",
                ".pending-view-return-button",
                () => {
                    this.open_return_dialog();
                }
            )
            .on(
                "click.pending_view",
                ".pending-view-ledger-add-row",
                () => {
                    if (
                        this.is_editing
                        &&
                        this.can_correct_ledger()
                    ) {
                        this.add_ledger_edit_row();
                    }
                }
            )
            .on(
                "click.pending_view",
                ".pending-view-ledger-remove-row",
                (
                    event
                ) => {
                    if (
                        !this.is_editing
                        ||
                        !this.can_correct_ledger()
                    ) {
                        return;
                    }

                    this.remove_ledger_edit_row(
                        $(
                            event.currentTarget
                        ).closest(
                            ".pending-view-ledger-edit-row"
                        )
                    );
                }
            )
            .on(
                "input.pending_view change.pending_view",
                `
                    .pending-view-ledger-suspended,
                    .pending-view-ledger-returned,
                    .pending-view-ledger-return-date,
                    .pending-view-ledger-return-note
                `,
                (
                    event
                ) => {
                    if (
                        !this.is_editing
                        ||
                        !this.can_correct_ledger()
                    ) {
                        return;
                    }

                    const $input =
                        $(
                            event.currentTarget
                        );

                    const $row =
                        $input.closest(
                            ".pending-view-ledger-edit-row"
                        );

                    if (
                        $input.hasClass(
                            "pending-view-ledger-returned"
                        )
                    ) {
                        this.sync_return_fields(
                            $row
                        );
                    }

                    if (
                        $input.hasClass(
                            "pending-view-ledger-suspended"
                        )
                        &&
                        $row.is(
                            this.get_ledger_edit_rows()
                                .first()
                        )
                    ) {
                        this.sync_first_ledger_row_to_header();
                    }

                    this.recalculate_ledger_preview();
                }
            )
            .on(
                "hidden.bs.modal.pending_view",
                () => {
                    this.destroy();
                }
            );

        this.$datetime_root
            .on(
                "input.pending_view change.pending_view",
                `
                    .pending-view-operation-date,
                    .pending-view-operation-time,
                    .pending-view-operation-period
                `,
                () => {
                    if (
                        this.is_editing
                        &&
                        this.can_correct_ledger()
                    ) {
                        this.recalculate_ledger_preview();
                    }
                }
            );
    }


    bind_suspended_header_input() {
        const control =
            this.dialog
                .fields_dict
                .suspended_amount_header;

        control
            ?.$input
            ?.off(
                ".pending_view_header"
            )
            .on(
                "input.pending_view_header change.pending_view_header",
                () => {
                    this.sync_header_to_first_ledger_row();
                }
            );
    }


    render_actions() {
        const operation =
            this.details.operation;

        const capabilities =
            this.details
                .capabilities
            || {};

        const can_enter_edit =
            this.can_enter_edit_mode();

        const $root =
            this.dialog
                .fields_dict
                .view_actions
                .$wrapper
                .find(
                    ".pending-view-actions"
                );

        $root.html(`
            <div
                class="
                    pending-view-operation-identity
                "
            >
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

            <div
                class="
                    pending-view-action-buttons
                "
            >
                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        pending-view-edit-button
                    "
                    ${
                        can_enter_edit
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

                <button
                    type="button"
                    class="
                        btn
                        btn-primary
                        pending-view-return-button
                    "
                    ${
                        capabilities
                            .can_add_return
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
            this.can_edit_metadata();

        const can_correct =
            this.can_correct_ledger();

        const can_enter =
            this.can_enter_edit_mode();

        this.is_editing =
            Boolean(
                enabled
                &&
                can_enter
            );

        for (
            const fieldname
            of this.metadata_fields
        ) {
            const field =
                this.dialog
                    .fields_dict[
                        fieldname
                    ];

            if (
                !field
            ) {
                continue;
            }

            field.df.read_only =
                (
                    this.is_editing
                    &&
                    can_edit
                )
                    ? 0
                    : 1;

            field.refresh();
        }

        const metadata_editable =
            this.is_editing
            &&
            can_edit;

        this.$datetime_root
            .find(
                "input, select"
            )
            .prop(
                "disabled",
                !metadata_editable
            );

        const suspended_control =
            this.dialog
                .fields_dict
                .suspended_amount_header;

        if (
            suspended_control
        ) {
            suspended_control
                .df
                .read_only =
                    (
                        this.is_editing
                        &&
                        can_correct
                    )
                        ? 0
                        : 1;

            suspended_control
                .refresh();
        }

        this.bind_suspended_header_input();

        this.render_ledger();

        this.render_attachments();

        if (
            this.is_editing
            &&
            can_correct
        ) {
            this.recalculate_ledger_preview();

        } else {
            this.render_summary();
        }

        const $primary =
            this.dialog
                .get_primary_btn();

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

        this.dialog
            .$wrapper
            .find(
                ".pending-view-edit-button"
            )
            .toggle(
                can_enter
                &&
                !this.is_editing
            );

        this.dialog
            .$wrapper
            .find(
                ".pending-view-cancel-edit-button"
            )
            .toggle(
                can_enter
                &&
                this.is_editing
            );

        this.dialog
            .$wrapper
            .find(
                ".pending-view-return-button"
            )
            .toggle(
                Boolean(
                    this.details
                        ?.capabilities
                        ?.can_add_return
                )
                &&
                !this.is_editing
            );

        this.smart_autocomplete
            ?.refresh();
    }


    async save_changes() {
        if (
            !this.is_editing
            ||
            this.is_saving
        ) {
            return;
        }

        const can_edit =
            this.can_edit_metadata();

        const can_correct =
            this.can_correct_ledger();

        const payload = {};

        if (
            can_edit
        ) {
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

            Object.assign(
                payload,
                {
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

                    notes:
                        String(
                            values.notes
                            || ""
                        ).trim(),
                }
            );
        }

        if (
            can_correct
        ) {
            const ledger_entries =
                this.validate_and_build_ledger();

            if (
                !ledger_entries
            ) {
                return;
            }

            payload.ledger_entries =
                ledger_entries;
        }

        if (
            !Object.keys(
                payload
            ).length
        ) {
            return;
        }

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
                ?.operation
            ) {
                throw new Error(
                    "لم يرجع السيرفر بيانات العملية بعد الحفظ."
                );
            }

            this.details =
                saved_details;

            this.refresh_view();

            frappe.show_alert({
                message:
                    "تم حفظ التغييرات",

                indicator:
                    "green",
            });

        } catch (
            error
        ) {
            console.error(
                "Pending operation update failed:",
                error
            );

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
                        "حدث خطأ أثناء حفظ العملية.",

                    indicator:
                        "red",
                });
            }

            return;

        } finally {
            this.set_saving(
                false
            );
        }

        if (
            saved_details
            &&
            this.on_changed
        ) {
            try {
                await this.on_changed(
                    saved_details
                );

            } catch (
                error
            ) {
                console.error(
                    "Pending operations page refresh failed after save:",
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

        this.dialog
            .get_primary_btn()
            .prop(
                "disabled",
                this.is_saving
            )
            .text(
                this.is_saving
                    ? "جارٍ الحفظ..."
                    : "حفظ التغييرات"
            );

        const metadata_disabled =
            this.is_saving
            ||
            !this.is_editing
            ||
            !this.can_edit_metadata();

        for (
            const fieldname
            of this.metadata_fields
        ) {
            this.dialog
                .fields_dict[
                    fieldname
                ]
                ?.$input
                ?.prop(
                    "disabled",
                    metadata_disabled
                );
        }

        this.$datetime_root
            .find(
                "input, select"
            )
            .prop(
                "disabled",
                metadata_disabled
            );

        const ledger_disabled =
            this.is_saving
            ||
            !this.is_editing
            ||
            !this.can_correct_ledger();

        this.dialog
            .fields_dict
            .suspended_amount_header
            ?.$input
            ?.prop(
                "disabled",
                ledger_disabled
            );

        this.dialog
            .$wrapper
            .find(
                `
                    .pending-view-ledger-suspended,
                    .pending-view-ledger-returned,
                    .pending-view-ledger-return-date,
                    .pending-view-ledger-return-note,
                    .pending-view-ledger-add-row,
                    .pending-view-ledger-remove-row
                `
            )
            .prop(
                "disabled",
                ledger_disabled
            );

        if (
            !ledger_disabled
        ) {
            this.get_ledger_edit_rows()
                .each(
                    (
                        index,
                        element
                    ) => {
                        this.sync_return_fields(
                            $(
                                element
                            )
                        );
                    }
                );

            this.refresh_ledger_edit_indexes();
        }

        this.dialog
            .$wrapper
            .find(
                `
                    .pending-view-edit-button,
                    .pending-view-cancel-edit-button,
                    .pending-view-return-button
                `
            )
            .prop(
                "disabled",
                this.is_saving
            );

        if (
            this.attachment_manager
        ) {
            this.attachment_manager
                .set_can_manage(
                    !this.is_saving
                    &&
                    this.is_editing
                    &&
                    this.can_edit_metadata()
                );
        }
    }


    render_summary() {
        const operation =
            this.details.operation;

        this.update_summary_html({
            total_suspended:
                operation.total_suspended,

            total_returned:
                operation.total_returned,

            remaining_amount:
                operation.remaining_amount,

            status:
                operation.status,

            valid:
                true,
        });
    }


    update_summary_html(
        summary
    ) {
        const $root =
            this.dialog
                .fields_dict
                .financial_summary
                .$wrapper
                .find(
                    ".pending-view-summary"
                );

        $root.html(`
            <div
                class="
                    pending-view-summary-grid
                "
            >
                ${this.summary_card(
                    "إجمالي المعلق",
                    summary.total_suspended
                )}

                ${this.summary_card(
                    "إجمالي المرتجع",
                    summary.total_returned
                )}

                ${this.summary_card(
                    "المتبقي",
                    summary.remaining_amount
                )}

                <div
                    class="
                        pending-view-summary-card
                    "
                >
                    <span>
                        الحالة
                    </span>

                    <strong
                        class="
                            pending-view-summary-status
                            ${
                                summary.valid
                                === false
                                    ? "status-invalid"
                                    : this.status_class(
                                        summary.status
                                    )
                            }
                        "
                    >
                        ${this.escape(
                            summary.status
                        )}
                    </strong>
                </div>
            </div>
        `);
    }


    summary_card(
        label,
        value
    ) {
        return `
            <div
                class="
                    pending-view-summary-card
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
                        ر.س
                    </small>
                </strong>
            </div>
        `;
    }


    render_ledger() {
        const $root =
            this.dialog
                .fields_dict
                .ledger_view
                .$wrapper
                .find(
                    ".pending-view-ledger"
                );

        const rows =
            this.details
                .ledger_entries
            || [];

        if (
            this.is_editing
            &&
            this.can_correct_ledger()
        ) {
            this.ledger_row_counter =
                0;

            $root.html(`
                <div
                    class="
                        pending-view-ledger-toolbar
                    "
                >
                    <div>
                        <strong>
                            الحركات المالية
                        </strong>

                        <span>
                            يمكن تعديل المعلق والمرتجع
                            والتاريخ والملاحظة حسب
                            صلاحية تصحيح الحركة.
                        </span>
                    </div>

                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-sm
                            pending-view-ledger-add-row
                        "
                    >
                        + إضافة حركة
                    </button>
                </div>

                <div
                    class="
                        pending-view-ledger-scroll
                    "
                >
                    <table
                        class="
                            table
                            pending-view-ledger-table
                            pending-view-ledger-edit-table
                        "
                    >
                        <thead>
                            <tr>
                                <th>#</th>
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
                                <th>
                                    ملاحظة الإرجاع
                                </th>
                                <th></th>
                            </tr>
                        </thead>

                        <tbody
                            class="
                                pending-view-ledger-edit-rows
                            "
                        ></tbody>
                    </table>
                </div>
            `);

            for (
                const row
                of rows
            ) {
                this.add_ledger_edit_row(
                    row,
                    false
                );
            }

            if (
                !rows.length
            ) {
                this.add_ledger_edit_row(
                    {},
                    false
                );
            }

            this.refresh_ledger_edit_indexes();

            return;
        }

        const body =
            rows.length
                ? rows
                    .map(
                        (
                            row,
                            index
                        ) => `
                            <tr>
                                <td>
                                    ${index + 1}
                                </td>

                                <td>
                                    ${this.format_amount(
                                        row.suspended_amount
                                    )}
                                    ر.س
                                </td>

                                <td>
                                    ${this.format_amount(
                                        row.returned_amount
                                    )}
                                    ر.س
                                </td>

                                <td>
                                    ${this.format_amount(
                                        row.remaining_amount
                                    )}
                                    ر.س
                                </td>

                                <td>
                                    ${this.format_date(
                                        row.return_date
                                    )}
                                </td>

                                <td>
                                    ${this.escape(
                                        row.return_note
                                        || "—"
                                    )}
                                </td>
                            </tr>
                        `
                    )
                    .join("")
                : `
                    <tr>
                        <td
                            colspan="6"
                            class="
                                text-muted
                                text-center
                            "
                        >
                            لا توجد حركات مالية.
                        </td>
                    </tr>
                `;

        $root.html(`
            <div
                class="
                    pending-view-ledger-scroll
                "
            >
                <table
                    class="
                        table
                        pending-view-ledger-table
                    "
                >
                    <thead>
                        <tr>
                            <th>#</th>
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
                            <th>
                                ملاحظة الإرجاع
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        ${body}
                    </tbody>
                </table>
            </div>
        `);
    }


    add_ledger_edit_row(
        values = {},
        recalculate = true
    ) {
        const $tbody =
            this.dialog
                .$wrapper
                .find(
                    ".pending-view-ledger-edit-rows"
                );

        if (
            !$tbody.length
        ) {
            return;
        }

        this.ledger_row_counter +=
            1;

        const key =
            `pending-view-ledger-${this.ledger_row_counter}`;

        const returned =
            Number(
                values.returned_amount
                || 0
            );

        const has_return =
            Number.isFinite(
                returned
            )
            &&
            returned > 0;

        $tbody.append(`
            <tr
                class="
                    pending-view-ledger-edit-row
                "
                data-row-key="${
                    this.escape_attribute(
                        key
                    )
                }"
                data-row-name="${
                    this.escape_attribute(
                        values.name
                        || ""
                    )
                }"
            >
                <td
                    class="
                        pending-view-ledger-index
                    "
                ></td>

                <td>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        class="
                            form-control
                            pending-view-ledger-suspended
                        "
                        value="${
                            this.escape_attribute(
                                values.suspended_amount
                                ?? 0
                            )
                        }"
                    >
                </td>

                <td>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        class="
                            form-control
                            pending-view-ledger-returned
                        "
                        value="${
                            this.escape_attribute(
                                values.returned_amount
                                ?? 0
                            )
                        }"
                    >
                </td>

                <td>
                    <strong
                        class="
                            pending-view-ledger-remaining
                        "
                    >
                        ${this.format_amount(
                            values.remaining_amount
                            ?? 0
                        )}
                    </strong>
                </td>

                <td>
                    <input
                        type="date"
                        class="
                            form-control
                            pending-view-ledger-return-date
                        "
                        value="${
                            this.escape_attribute(
                                values.return_date
                                || ""
                            )
                        }"
                        ${
                            has_return
                                ? ""
                                : "disabled"
                        }
                    >
                </td>

                <td>
                    <input
                        type="text"
                        maxlength="2000"
                        class="
                            form-control
                            pending-view-ledger-return-note
                        "
                        value="${
                            this.escape_attribute(
                                values.return_note
                                || ""
                            )
                        }"
                        ${
                            has_return
                                ? ""
                                : "disabled"
                        }
                    >
                </td>

                <td>
                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-xs
                            pending-view-ledger-remove-row
                        "
                        title="حذف الحركة"
                    >
                        ×
                    </button>
                </td>
            </tr>
        `);

        this.refresh_ledger_edit_indexes();

        if (
            recalculate
        ) {
            this.recalculate_ledger_preview();
        }
    }


    remove_ledger_edit_row(
        $row
    ) {
        const $rows =
            this.get_ledger_edit_rows();

        if (
            $rows.length <= 1
        ) {
            frappe.show_alert({
                message:
                    "يجب أن تبقى حركة مالية واحدة على الأقل.",

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

        this.refresh_ledger_edit_indexes();

        if (
            removing_first
        ) {
            this.sync_first_ledger_row_to_header();
        }

        this.recalculate_ledger_preview();
    }


    get_ledger_edit_rows() {
        return this.dialog
            .$wrapper
            .find(
                ".pending-view-ledger-edit-row"
            );
    }


    refresh_ledger_edit_indexes() {
        const $rows =
            this.get_ledger_edit_rows();

        $rows.each(
            (
                index,
                element
            ) => {
                $(
                    element
                )
                    .find(
                        ".pending-view-ledger-index"
                    )
                    .text(
                        index + 1
                    );
            }
        );

        $rows
            .find(
                ".pending-view-ledger-remove-row"
            )
            .prop(
                "disabled",
                (
                    $rows.length
                    <= 1
                    ||
                    this.is_saving
                )
            );
    }


    sync_return_fields(
        $row
    ) {
        const returned =
            this.parse_amount(
                $row
                    .find(
                        ".pending-view-ledger-returned"
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
                ".pending-view-ledger-return-date"
            );

        const $note =
            $row.find(
                ".pending-view-ledger-return-note"
            );

        if (
            has_return
        ) {
            $date.prop(
                "disabled",
                this.is_saving
                    ? true
                    : false
            );

            $note.prop(
                "disabled",
                this.is_saving
                    ? true
                    : false
            );

            if (
                !$date.val()
            ) {
                $date.val(
                    this.get_operation_date_value()
                    ||
                    frappe.datetime
                        .get_today()
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


    sync_header_to_first_ledger_row() {
        if (
            this.syncing_suspended_amount
            ||
            !this.is_editing
            ||
            !this.can_correct_ledger()
        ) {
            return;
        }

        const $first =
            this.get_ledger_edit_rows()
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
                ".pending-view-ledger-suspended"
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

        this.recalculate_ledger_preview();
    }


    sync_first_ledger_row_to_header() {
        if (
            this.syncing_suspended_amount
        ) {
            return;
        }

        const $first =
            this.get_ledger_edit_rows()
                .first();

        if (
            !$first.length
        ) {
            return;
        }

        this.syncing_suspended_amount =
            true;

        this.dialog
            .fields_dict
            .suspended_amount_header
            ?.set_value(
                $first
                    .find(
                        ".pending-view-ledger-suspended"
                    )
                    .val()
                || 0
            );

        this.syncing_suspended_amount =
            false;
    }


    recalculate_ledger_preview({
        show_errors = false,
    } = {}) {
        const $rows =
            this.get_ledger_edit_rows();

        const operation_date =
            this.get_operation_date_value();

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

        $rows.each(
            (
                index,
                element
            ) => {
                const $row =
                    $(
                        element
                    );

                $row.removeClass(
                    "has-error"
                );

                const suspended =
                    this.parse_amount(
                        $row
                            .find(
                                ".pending-view-ledger-suspended"
                            )
                            .val()
                    );

                const returned =
                    this.parse_amount(
                        $row
                            .find(
                                ".pending-view-ledger-returned"
                            )
                            .val()
                    );

                const return_date =
                    String(
                        $row
                            .find(
                                ".pending-view-ledger-return-date"
                            )
                            .val()
                        || ""
                    ).trim();

                const return_note =
                    String(
                        $row
                            .find(
                                ".pending-view-ledger-return-note"
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
                        ".pending-view-ledger-remaining"
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
                    name:
                        String(
                            $row
                                .data(
                                    "row-name"
                                )
                            || ""
                        ).trim(),

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
            total_suspended <= 0
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
            this.details
                .operation
                .is_failed
            ||
            this.details
                .operation
                .status
            === "معلقة فاشلة"
        ) {
            status =
                "معلقة فاشلة";

        } else if (
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
            >
            0.000000001
        ) {
            status =
                "مرتجعة غير مكتملة";

        } else {
            status =
                "مرتجعة مكتملة";
        }

        const result = {
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

        this.update_summary_html(
            result
        );

        return result;
    }


    validate_and_build_ledger() {
        const result =
            this.recalculate_ledger_preview({
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
                    "راجع الحركات المالية",

                indicator:
                    "red",

                message:
                    unique_errors
                        .map(
                            (
                                message
                            ) =>
                                `• ${
                                    frappe.utils
                                        .escape_html(
                                            message
                                        )
                                }`
                        )
                        .join(
                            "<br>"
                        ),
            });

            return null;
        }

        return result.rows
            .map(
                (
                    row
                ) => {
                    const item = {
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
                    };

                    if (
                        row.name
                    ) {
                        item.name =
                            row.name;
                    }

                    return item;
                }
            );
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
                this.is_editing
                &&
                this.can_edit_metadata()
                &&
                !this.is_saving
            );

        if (
            !window
                .ArchivePendingAttachmentManager
        ) {
            $root.html(
                `
                    <div
                        class="
                            text-muted
                        "
                    >
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

                                this.details
                                    .attachments =
                                    [
                                        ...(
                                            this
                                                .attachment_manager
                                                ?.attachments
                                            || []
                                        ),
                                    ];

                                if (
                                    this.on_changed
                                ) {
                                    try {
                                        await this
                                            .on_changed(
                                                this.details
                                            );

                                    } catch (
                                        error
                                    ) {
                                        console.error(
                                            "Pending page refresh after attachment change failed:",
                                            error
                                        );
                                    }
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

        const operation_date =
            this.get_date_from_datetime(
                operation
                    .operation_datetime
            );

        const today =
            frappe.datetime
                .get_today();

        const default_return_date =
            (
                operation_date
                &&
                operation_date > today
            )
                ? operation_date
                : today;

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
                            "SAR",
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
                            operation
                                .remaining_amount,
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
                            "return_date",

                        fieldtype:
                            "Date",

                        label:
                            "تاريخ الإرجاع",

                        reqd:
                            1,

                        default:
                            default_return_date,
                    },

                    {
                        fieldname:
                            "return_note",

                        fieldtype:
                            "Small Text",

                        label:
                            "ملاحظة الإرجاع",
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

                        if (
                            !values
                        ) {
                            return;
                        }

                        const amount =
                            Number(
                                values
                                    .returned_amount
                            );

                        const remaining =
                            Number(
                                operation
                                    .remaining_amount
                                || 0
                            );

                        const return_date =
                            String(
                                values
                                    .return_date
                                || ""
                            ).trim();

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
                            >
                            remaining
                        ) {
                            frappe.msgprint({
                                message:
                                    `المبلغ المرتجع يتجاوز الرصيد المتبقي (${
                                        this.format_amount(
                                            remaining
                                        )
                                    } ر.س).`,

                                indicator:
                                    "red",
                            });

                            return;
                        }

                        if (
                            !return_date
                        ) {
                            frappe.msgprint({
                                message:
                                    "تاريخ الإرجاع مطلوب.",

                                indicator:
                                    "red",
                            });

                            return;
                        }

                        if (
                            operation_date
                            &&
                            return_date
                            <
                            operation_date
                        ) {
                            frappe.msgprint({
                                message:
                                    `تاريخ الإرجاع لا يمكن أن يكون أقدم من تاريخ المعلق (${operation_date}).`,

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
                                            values
                                                .returned_amount,

                                        return_date,

                                        return_note:
                                            String(
                                                values
                                                    .return_note
                                                || ""
                                            ).trim(),
                                    },
                                },
                            });

                            dialog.hide();

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


    get_date_from_datetime(
        value
    ) {
        const text =
            String(
                value
                || ""
            ).trim();

        const match =
            text.match(
                /^(\d{4}-\d{2}-\d{2})/
            );

        return match
            ? match[1]
            : "";
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
        const number =
            Number(
                value
            );

        if (
            !Number.isFinite(
                number
            )
        ) {
            return 0;
        }

        const factor =
            1000000000;

        return (
            Math.round(
                (
                    number
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
                String(
                    value
                )
            );
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

        this.$datetime_root
            ?.off(
                ".pending_view"
            );

        this.dialog
            ?.fields_dict
            ?.suspended_amount_header
            ?.$input
            ?.off(
                ".pending_view_header"
            );

        this.dialog
            ?.$wrapper
            ?.off(
                ".pending_view"
            );

        this.dialog
            ?.$wrapper
            ?.remove();

        this.dialog =
            null;
    }
};