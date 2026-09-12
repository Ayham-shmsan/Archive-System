frappe.pages["archive-operations"].on_page_load = function (wrapper) {
	frappe.archive_operations = new ArchiveOperationsPage(wrapper);
};

class ArchiveOperationsPage {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.state = {
			status: "all",
			search: "",
            start: 0,
	        page_length: 100000,
            selected_operation_name: null,
		};

        this.operations = [];

		this.make_page();
		this.render();
        this.load_operations();
	}
    open_status_dialog(
        operation_name,
        current_status
    ) {
        const statuses = [
            "غير مؤكدة",
            "مؤكدة",
            "محضورة",
            "مرتجعة",
        ];

        const available_statuses =
            statuses.filter(
                (status) =>
                    status !== current_status
            );

        const dialog =
            new frappe.ui.Dialog({
                title:
                    `إجراءات العملية ${operation_name}`,

                fields: [
                    {
                        fieldname:
                            "current_status",

                        label:
                            "الحالة الحالية",

                        fieldtype:
                            "Data",

                        read_only:
                            1,

                        default:
                            current_status,
                    },

                    {
                        fieldname:
                            "status",

                        label:
                            "الحالة الجديدة",

                        fieldtype:
                            "Select",

                        options:
                            available_statuses.join(
                                "\n"
                            ),

                        reqd:
                            1,
                    },

                    {
                        fieldname:
                            "status_effective_datetime",

                        label:
                            "تاريخ الحالة",

                        fieldtype:
                            "Date",

                        reqd:
                            1,

                        description:
                            "التاريخ الفعلي لتأكيد أو إرجاع أو حضر العملية.",
                    },

                    {
                        fieldname:
                            "remarks",

                        label:
                            "ملاحظات الإجراء",

                        fieldtype:
                            "Small Text",
                    },
                ],

                primary_action_label:
                    __("تنفيذ الإجراء"),

                primary_action:
                    async (values) => {
                        await this.change_operation_status(
                            operation_name,
                            values.status,
                            values.status_effective_datetime,
                            values.remarks,
                            dialog
                        );
                    },
            });

        dialog.show();
    }

    open_final_swift_dialog() {
        const operation =
            this.get_selected_operation();


        if (!operation) {
            return;
        }


        
        if (
            this.state.status !== "final_swift"
	        ||
            !operation.final_swift_required
            ||
            !operation.can_attach_final_swift
            ||
            Number(
                operation.final_swift_count || 0
            )
            >=
            Number(
                operation.final_swift_limit || 5
            )
        ) {
            return;
        }


        frappe.require(
            [
                "/assets/archive/js/archive_operations/final_swift_dialog.js",
                "/assets/archive/css/archive_operations/operation_dialog.css",
            ],
            () => {

               

                const dialog =
                    new archive.ui.FinalSwiftDialog(
                        operation.name,
                        {
                            current_count:
                                Number(
                                    operation.final_swift_count
                                    || 0
                                ),

                            max_files:
                                Number(
                                    operation.final_swift_limit
                                    || 5
                                ),

                            on_saved:
                                async () => {
                                    await this
                                        .load_operations();
                                },
                        }
                    );


                dialog.show();
            }
        );
    }

    async change_operation_status(
        operation_name,
        status,
        status_effective_datetime,
        remarks,
        dialog
    ) {
        if (
            !status ||
            !status_effective_datetime
        ) {
            return;
        }

        const button =
            dialog.get_primary_btn();

        button.prop(
            "disabled",
            true
        );

        try {
            await frappe.call({
                method:
                    "archive.api.operations.change_operation_status",

                type:
                    "POST",

                args: {
                    operation_name:
                        operation_name,

                    status:
                        status,

                    status_effective_datetime:
                        status_effective_datetime,

                    remarks:
                        remarks || "",
                },
            });

            dialog.hide();

            frappe.show_alert({
                message:
                    `تم تغيير حالة ${operation_name} إلى ${status}`,
                indicator:
                    "green",
            });

            await this.load_operations();

        } catch (error) {
            console.error(
                "Operation status change failed:",
                error
            );

            frappe.msgprint({
                title:
                    __("تعذر تغيير الحالة"),

                message:
                    error?.message ||
                    __(
                        "حدث خطأ أثناء تغيير حالة العملية."
                    ),

                indicator:
                    "red",
            });

        } finally {
            button.prop(
                "disabled",
                false
            );
        }
    }


	make_page() {
		this.page = frappe.ui.make_app_page({
			parent: this.wrapper,
			title: __("Archive Operations"),
			single_column: true,
		});

		$(this.wrapper).addClass("archive-operations-page");
	}

	render() {
		$(this.page.main).html(`
			<div class="archive-operations-shell" dir="rtl">

				<!-- Header -->
				<div class="archive-operations-header">
					<div class="archive-header-text">
						<h1>العمليات</h1>
						<p>إدارة وأرشفة العمليات البنكية</p>
					</div>

					<button type="button"
						class="btn btn-primary archive-create-operation">
						<span>＋</span>
						إنشاء عملية جديدة
					</button>
				</div>


				<!-- Summary -->
				<div class="archive-summary-grid">

					${this.summary_card(
						"all",
						"كل العمليات",
						"0"
					)}

					${this.summary_card(
						"unconfirmed",
						"غير مؤكدة",
						"0"
					)}

					${this.summary_card(
						"confirmed",
						"مؤكدة",
						"0"
					)}

					${this.summary_card(
						"returned",
						"مرتجعة",
						"0"
					)}

					${this.summary_card(
						"held",
						"محضورة",
						"0"
					)}

                    ${this.summary_card(
                        "final_swift",
                        "السويفت النهائي",
                        "0"
                    )}

				</div>


				<!-- Toolbar -->
				<div class="archive-operations-toolbar">

					<div class="archive-search-box">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="11" cy="11" r="8"></circle>
							<path d="m21 21-4.35-4.35"></path>
						</svg>

						<input
							type="text"
							class="archive-operation-search"
							placeholder="بحث في العمليات..."
						>
					</div>

					<div class="archive-toolbar-actions">

                    
                    <button
                    type="button"
                    class="btn btn-default archive-selected-view"
                    disabled
                    >
                    عرض
                    </button>

                    <button
                        type="button"
                        class="btn btn-default btn-sm archive-timeline-button"
                        style="display: none;"
                    >
                        <i class="fa fa-history"></i>
                        مسار العملية
                    </button>
                    
                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            archive-final-swift-button
                        "
                        style="display: none;"
                    >
                        إرفاق الملف النهائي
                    </button>
                        <button
                            type="button"
                            class="btn btn-default archive-selected-actions"
                            disabled
                        >
                            الإجراءات
                        </button>

                        <button
                            type="button"
                            class="btn btn-default archive-filter-button">
                            الفلاتر
                        </button>

                        <button
                            type="button"
                            class="btn btn-default archive-refresh-button">
                            تحديث
                        </button>

                    </div>

				</div>


				<!-- Operations -->
				<div class="archive-operations-card">

					<div class="archive-list-header">

						<div>
							<div class="archive-list-title">
								العمليات
							</div>

							<div class="archive-list-subtitle">
								عرض وإدارة جميع العمليات المسجلة
							</div>
						</div>

						<div class="archive-result-count">
							0 عملية
						</div>

					</div>

                    
					<div class="archive-table-wrapper">

						<table class="archive-operations-table">

                            <colgroup>
                                <col class="col-serial">
                                <col class="col-operation-no">
                                <col class="col-customer">
                                <col class="col-amount">
                                <col class="col-currency">
                                <col class="col-customer-rate">

                                <col class="col-beneficiary-name">
                                <col class="col-beneficiary-account">
                                <col class="col-beneficiary-bank">
                                <col class="col-swift">
                                <col class="col-country">

                                <col class="col-sender-name">
                                <col class="col-sender-account">
                                <col class="col-execution">
                                <col class="col-transferring-bank">
                                <col class="col-request-date">
                                <col class="col-from-account">
                                <col class="col-reference">
                                <col class="col-bank-rate">
                                <col class="col-notes">

                                <col class="col-final-swift">

                                <col class="col-status">
                                
                            </colgroup>

							<thead>
                                <tr>
                                    <th>الرقم</th>
                                    <th>رقم العملية</th>
                                    <th>اسم العميل</th>
                                    <th>المبلغ</th>
                                    <th>العملة</th>
                                    <th>سعر العميل</th>

                                    <th>اسم المستفيد</th>
                                    <th>رقم حساب المستفيد</th>
                                    <th>اسم بنك المستفيد</th>
                                    <th>رمز SWIFT</th>
                                    <th>الجهة (الدولة)</th>

                                    <th>اسم المرسل</th>
                                    <th>رقم حساب المرسل</th>
                                    <th>تاريخ تنفيذ العملية</th>
                                    <th>اسم البنك المحول</th>
                                    <th>تاريخ الطلب</th>
                                    <th>عن طريق</th>
                                    <th>رقم المرجع</th>
                                    <th>سعر البنك المحول</th>
                                    <th>ملاحظات</th>

                                    <th>السويفت النهائي</th>
                                    <th>الحالة</th>
                                    
                                </tr>
                            </thead>

							<tbody class="archive-operation-rows">
							</tbody>

                            <tfoot class="archive-operation-total-footer">
                                <tr class="archive-operation-total-row">

                                    <td colspan="3">
                                        <strong>
                                            إجمالي المبلغ للنتائج المعروضة
                                        </strong>
                                    </td>

                                    <td
                                        colspan="19"
                                        class="archive-visible-amount-total"
                                    >
                                        —
                                    </td>

                                </tr>
                            </tfoot>

						</table>

						<div class="archive-empty-state">

							<div class="archive-empty-icon">
								<svg
									width="38"
									height="38"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
								>
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
									<polyline points="14 2 14 8 20 8"></polyline>
									<line x1="16" y1="13" x2="8" y2="13"></line>
									<line x1="16" y1="17" x2="8" y2="17"></line>
								</svg>
							</div>

							<h3>
								لا توجد عمليات حتى الآن
							</h3>

							<p>
								ابدأ بإنشاء أول عملية في النظام
							</p>

							<button
								type="button"
								class="btn btn-primary archive-empty-create">
								إنشاء عملية جديدة
							</button>

						</div>

					</div>

				</div>

			</div>
		`);

		this.bind_events();
	}

	summary_card(status, label, value) {
		const active =
			this.state.status === status
				? "is-active"
				: "";

		return `
			<button
				type="button"
				class="archive-summary-card ${active}"
				data-status="${status}"
			>
				<div class="archive-summary-value">
					${value}
				</div>

				<div class="archive-summary-label">
					${label}
				</div>
			</button>
		`;
	}

    get_status_value(status) {
        const statuses = {
            all: "",
            unconfirmed: "غير مؤكدة",
            confirmed: "مؤكدة",
            returned: "مرتجعة",
            held: "محضورة",
        };

        return statuses[status] ?? "";
    }


    get_status_class(status) {
        const classes = {
            "غير مؤكدة": "status-unconfirmed",
            "مؤكدة": "status-confirmed",
            "مرتجعة": "status-returned",
            "محضورة": "status-held",
        };

        return classes[status] || "status-unconfirmed";
    }


    async load_operations() {
        const $wrapper = $(this.wrapper);

        const $refresh =
            $wrapper.find(".archive-refresh-button");

        $refresh.prop("disabled", true);

        try {
            const is_final_swift_view =
                this.state.status ===
                "final_swift";
            const response =
                await frappe.call({
                    method:
                        "archive.api.operations.get_operations",

                    args: {
                        search:
                            this.state.search || null,

                       status:
                            is_final_swift_view
                                ? null
                                : (
                                    this.get_status_value(
                                        this.state.status
                                    ) || null
                                ),

                        start:
                            this.state.start,

                        page_length:
                            this.state.page_length,
                        final_swift_pending:
                            is_final_swift_view
                                ? 1
                                : 0,
                    },
                });

            const result =
                response.message || {};
            this.operations =
                result.operations || [];

            /*
            * إذا كان السجل المحدد لم يعد ضمن النتائج
            * بسبب فلتر أو تغيير حالة، نلغي التحديد.
            */
            if (
                this.state.selected_operation_name &&
                !this.operations.some(
                    (operation) =>
                        operation.name ===
                        this.state.selected_operation_name
                )
            ) {
                this.state.selected_operation_name = null;
            }

            this.render_operations(
                    this.operations
                );

            this.update_selected_actions();

            this.update_counts(
                result.counts || {}
            );

            this.update_result_count(
                result.total || 0
            );

        } catch (error) {
            console.error(
                "Archive operations loading failed:",
                error
            );

            frappe.msgprint({
                title: __("تعذر تحميل العمليات"),
                message:
                    error?.message ||
                    __(
                        "حدث خطأ أثناء تحميل سجلات العمليات."
                    ),
                indicator: "red",
            });

        } finally {
            $refresh.prop("disabled", false);
        }
    }


    render_operations(operations) {
        const $wrapper = $(this.wrapper);

        const $tbody =
            $wrapper.find(
                ".archive-operation-rows"
            );

        const $empty =
            $wrapper.find(
                ".archive-empty-state"
            );

        const $table =
            $wrapper.find(
                ".archive-operations-table"
            );

        if (!operations.length) {
                $tbody.empty();

                this.update_visible_amount_total(
                    []
                );

                $table.hide();
                $empty.show();

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
        this.update_visible_amount_total(
            operations
        );

        this.bind_row_events();
    }
    update_visible_amount_total(
            operations
        ) {
            const totals = {};


            (operations || [])
                .forEach(
                    (operation) => {

                        const amount =
                            Number(
                                operation.amount
                                || 0
                            );


                        if (
                            !Number.isFinite(
                                amount
                            )
                        ) {
                            return;
                        }


                        const currency =
                            String(
                                operation.currency
                                || "بدون عملة"
                            ).trim();


                        totals[currency] =
                            (
                                totals[currency]
                                || 0
                            )
                            +
                            amount;
                    }
                );


            const entries =
                Object.entries(
                    totals
                );


            const $total =
                $(this.wrapper)
                    .find(
                        ".archive-visible-amount-total"
                    );


            if (!entries.length) {
                $total.html("—");
                return;
            }


            const html =
                entries
                    .map(
                        (
                            [
                                currency,
                                total
                            ]
                        ) => {

                            return `
                                <span
                                    class="
                                        archive-visible-total-item
                                    "
                                >
                                    <strong>
                                        ${this.format_amount(
                                            total
                                        )}
                                    </strong>

                                    <span>
                                        ${this.escape_value(
                                            currency
                                        )}
                                    </span>
                                </span>
                            `;
                        }
                    )
                    .join("");


            $total.html(
                html
            );
        }


    operation_row(operation) {
        const status_class =
            this.get_status_class(
                operation.status
            );
        const selected_class =
            this.state.selected_operation_name
                === operation.name
                    ? "is-selected"
                    : "";

        return `
            <tr
                class="archive-operation-row ${status_class} ${selected_class}"
                data-name="${frappe.utils.escape_html(
                    operation.name || ""
                )}"
            >

                <!-- الرقم التسلسلي -->
                <td>
                    <div class="archive-operation-serial">
                        ${this.escape_value(
                            operation.serial_no
                                || operation.name
                        )}
                    </div>
                </td>


                <!-- رقم العملية -->
                <td>
                    ${this.escape_value(
                        operation.operation_no
                    )}
                </td>


                <!-- العميل -->
                <td>
                    ${this.escape_value(
                        operation.customer_name || operation.customer
                    )}
                </td>


                <!-- المبلغ -->
                <td class="archive-operation-amount">
                    ${this.format_amount(
                        operation.amount
                    )}
                </td>


                <!-- العملة -->
                <td>
                    ${this.escape_value(
                        operation.currency
                    )}
                </td>


                <!-- سعر العميل -->
                <td>
                    ${this.format_rate(
                        operation.customer_rate
                    )}
                </td>


                <!-- اسم المستفيد -->
                <td>
                    ${this.escape_value(
                        operation.beneficiary_name
                    )}
                </td>


                <!-- حساب المستفيد -->
                <td class="archive-account-number">
                    ${this.escape_value(
                        operation.beneficiary_account
                    )}
                </td>


                <!-- بنك المستفيد -->
                <td>
                    ${this.escape_value(
                        operation.beneficiary_bank
                    )}
                </td>


                <!-- SWIFT -->
                <td>
                    ${this.escape_value(
                        operation.swift_code
                    )}
                </td>


                <!-- الدولة -->
                <td>
                    ${this.translate_value(
                        operation.country
                    )}
                </td>


                <!-- اسم المرسل -->
                <td>
                    ${this.escape_value(
                        operation.sender_name
                    )}
                </td>


                <!-- حساب المرسل -->
                <td class="archive-account-number">
                    ${this.escape_value(
                        operation.sender_account
                    )}
                </td>


                <!-- تاريخ التنفيذ -->
                <td>
                    ${this.format_datetime(
                        operation.execution_datetime
                    )}
                </td>


                <!-- البنك المحول -->
                <td>
                    ${this.escape_value(
                        operation.transferring_bank
                    )}
                </td>


                <!-- تاريخ الطلب -->
                <td>
                    ${this.format_date(
                        operation.request_date
                    )}
                </td>


                <!-- عن طريق  -->
                <td>
                    ${this.escape_value(
                        operation.from_account_name
                            || operation.from_account
                    )}
                </td>


                <!-- رقم المرجع -->
                <td class="archive-reference-number">
                    ${this.escape_value(
                        operation.reference_no
                    )}
                </td>


                <!-- سعر البنك المحول -->
                <td>
                    ${this.format_rate(
                        operation.bank_transfer_rate
                    )}
                </td>


                <!-- الملاحظات -->
                <td class="archive-operation-notes">
                    ${this.escape_value(
                        operation.notes
                    )}
                </td>

                <!-- السويفت النهائي -->
                <td class="archive-final-swift-cell">

                    <span
                        class="
                            archive-final-swift-check
                            ${
                                operation.has_final_swift
                                    ? "is-checked"
                                    : ""
                            }
                        "
                        title="${
                            operation.has_final_swift
                                ? "تم إرفاق السويفت النهائي"
                                : "لم يتم إرفاق السويفت النهائي"
                        }"
                    >
                        ${
                            operation.has_final_swift
                                ? "✓"
                                : ""
                        }
                    </span>

                </td>


                <!-- الحالة -->
                <td>
                    <span
                        class="archive-operation-status ${status_class}"
                    >
                        ${this.escape_value(
                            operation.status
                        )}
                    </span>
                </td>
                
                

            </tr>
        `;
    }


    escape_value(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        return frappe.utils.escape_html(
            String(value).trim()
        );
    }


    format_amount(value) {
        const number =
            Number(value || 0);

        return new Intl.NumberFormat(
            "en-US",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }
        ).format(number);
    }

    format_rate(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        const number = Number(value);

        if (Number.isNaN(number)) {
            return this.escape_value(value);
        }

        return number.toFixed(6)
            .replace(/0+$/, "")
            .replace(/\.$/, "");
    }


    format_date(value) {
        if (!value) {
            return "—";
        }

        try {
            return frappe.datetime.str_to_user(
                value
            );
        } catch (error) {
            return this.escape_value(value);
        }
    }


    translate_value(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return "—";
        }

        return frappe.utils.escape_html(
            __(
                String(value).trim()
            )
        );
    }


    format_datetime(value) {
        if (!value) {
            return "—";
        }

        try {
            return frappe.datetime.str_to_user(
                value
            );
        } catch (error) {
            return this.escape_value(value);
        }
    }


    update_counts(counts) {
        const $wrapper = $(this.wrapper);

        const values = {
            all:
                counts.all || 0,

            unconfirmed:
                counts["غير مؤكدة"] || 0,

            confirmed:
                counts["مؤكدة"] || 0,

            returned:
                counts["مرتجعة"] || 0,

            held:
                counts["محضورة"] || 0,
            final_swift:
                counts.final_swift || 0,
        };

        Object.entries(values).forEach(
            ([status, value]) => {
                $wrapper
                    .find(
                        `.archive-summary-card[data-status="${status}"] .archive-summary-value`
                    )
                    .text(value);
            }
        );
    }


    update_result_count(total) {
        $(this.wrapper)
            .find(".archive-result-count")
            .text(
                total === 1
                    ? "1 عملية"
                    : `${total} عملية`
            );
    }

    bind_row_events() {
        $(this.wrapper)
            .find(".archive-operation-row")
            .off("click")
            .on("click", (event) => {
                const operation_name =
                    $(event.currentTarget)
                        .data("name");

                if (!operation_name) {
                    return;
                }

                this.select_operation(
                    operation_name
                );
            });
    }

    select_operation(
        operation_name
    ) {
        this.state
            .selected_operation_name =
                operation_name;

        const $wrapper =
            $(this.wrapper);

        $wrapper
            .find(
                ".archive-operation-row"
            )
            .removeClass(
                "is-selected"
            );

        $wrapper
            .find(
                ".archive-operation-row"
            )
            .filter(
                (index, element) => {
                    return (
                        $(element)
                            .data("name")
                        === operation_name
                    );
                }
            )
            .addClass(
                "is-selected"
            );

        this.update_selected_actions();
    }


    

    get_selected_operation() {
        const operation_name =
            this.state.selected_operation_name;

        if (!operation_name) {
            return null;
        }

        return (
            this.operations.find(
                (operation) =>
                    operation.name ===
                    operation_name
            ) || null
        );
    }
    update_selected_actions() {
        const selected =
            this.get_selected_operation();
        
        const can_view_timeline =
            Boolean(
                selected
                &&
                selected.can_view_timeline
            );
        
        const $timeline_button =
            $(this.wrapper).find(
                ".archive-timeline-button"
            );

        $timeline_button
            .toggle(
                can_view_timeline
            )
            .prop(
                "disabled",
                !can_view_timeline
            );


        const can_view =
            Boolean(
                selected
            );


        const can_change_status =
            Boolean(
                selected &&
                selected.can_change_status
            );

        
        
        const final_swift_count =
            Number(
                selected?.final_swift_count
                || 0
            );

        const final_swift_limit =
            Number(
                selected?.final_swift_limit
                || 5
            );


        const can_attach_final_swift =
            Boolean(
                selected
                &&
                this.state.status === "final_swift"
                &&
                selected.final_swift_required
                &&
                selected.can_attach_final_swift
                &&
                final_swift_count
                    < final_swift_limit
            );


        /*
        * عرض
        */
        $(this.wrapper)
            .find(
                ".archive-selected-view"
            )
            .prop(
                "disabled",
                !can_view
            );


        /*
        * الإجراءات
        */
        $(this.wrapper)
            .find(
                ".archive-selected-actions"
            )
            .prop(
                "disabled",
                !can_change_status
            );


        /*
        * إرفاق السويفت النهائي
        *
        * لا نكتفي بتعطيله:
        * لا يظهر أصلاً إذا لم تتحقق الشروط.
        */
        const $final_swift_button =
            $(this.wrapper)
                .find(
                    ".archive-final-swift-button"
                );


        if (
            can_attach_final_swift
        ) {
            $final_swift_button
                .show()
                .prop(
                    "disabled",
                    false
                );

        } else {
            $final_swift_button
                .hide()
                .prop(
                    "disabled",
                    true
                );
        }
    }

    open_selected_operation_timeline() {
        const operation =
            this.get_selected_operation();


        if (
            !operation
            ||
            !operation.can_view_timeline
        ) {
            return;
        }


        frappe.require(
            [
                "/assets/archive/js/archive_operations/operation_timeline_dialog.js",
                "/assets/archive/css/archive_operations/operation_timeline_dialog.css",
            ],
            () => {

                const dialog =
                    new archive.ui
                        .OperationTimelineDialog(
                            operation.name
                        );


                dialog.show();
            }
        );
    }
    open_selected_operation() {
        const operation =
            this.get_selected_operation();


        if (!operation) {
            return;
        }


        frappe.require(
            [
                "/assets/archive/js/archive_operations/operation_view_dialog.js",
                "/assets/archive/css/archive_operations/operation_dialog.css",
            ],
            () => {

                const dialog =
                    new archive.ui
                        .OperationViewDialog(
                            operation.name,
                            {
                                on_saved:
                                    async () => {
                                        await this
                                            .load_operations();
                                    },
                            }
                        );


                dialog.show();
            }
        );
    }
    

    bind_events() {
        const $wrapper = $(this.wrapper);

        $wrapper
            .find(
                ".archive-create-operation, .archive-empty-create"
            )
            .on("click", () => {
                this.open_create_operation();
            });


        $wrapper
            .find(".archive-summary-card")
            .on("click", (event) => {
                const status =
                    $(event.currentTarget)
                        .data("status");

                if (
                    this.state.status === status
                ) {
                    return;
                }

                this.state.status = status;
                this.state.start = 0;

                $wrapper
                    .find(".archive-summary-card")
                    .removeClass("is-active");

                $(event.currentTarget)
                    .addClass("is-active");

                this.load_operations();
            });


        let search_timer = null;
        
        $wrapper
            .find(
                ".archive-final-swift-button"
            )
            .on(
                "click",
                () => {
                    this.open_final_swift_dialog();
                }
            );
        
        $wrapper
            .find(
                ".archive-timeline-button"
            )
            .on(
                "click",
                () => {
                    this.open_selected_operation_timeline();
                }
            );

        $wrapper
            .find(".archive-operation-search")
            .on("input", (event) => {
                const value =
                    event.target.value.trim();

                clearTimeout(search_timer);

                search_timer =
                    setTimeout(() => {
                        this.state.search =
                            value;

                        this.state.start = 0;

                        this.load_operations();
                    }, 350);
            });


        $wrapper
            .find(".archive-refresh-button")
            .on("click", async () => {
                await this.load_operations();

                frappe.show_alert({
                    message: __("تم تحديث العمليات"),
                    indicator: "green",
                });
            });

        
        $wrapper
            .find(".archive-selected-view")
            .on("click", () => {
                this.open_selected_operation();
            });


        $wrapper
            .find(".archive-selected-actions")
            .on("click", () => {
                const operation =
                    this.get_selected_operation();

                if (!operation) {
                    frappe.show_alert({
                        message:
                            __("اختر عملية أولاً"),
                        indicator:
                            "orange",
                    });

                    return;
                }

                this.open_status_dialog(
                    operation.name,
                    operation.status
                );
            });
    }

	open_create_operation() {
        frappe.require(
            [
                "/assets/archive/js/archive_operations/operation_dialog.js",
                "/assets/archive/css/archive_operations/operation_dialog.css",
            ],
            () => {
                const dialog =
                    new archive.ui.OperationDialog();

                dialog.show();
            }
        );
    }
}