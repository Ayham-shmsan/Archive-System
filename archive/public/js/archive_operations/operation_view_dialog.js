frappe.provide("archive.ui");

archive.ui.OperationViewDialog =
class OperationViewDialog {

	constructor(
		operation_name,
		options = {}
	) {
		this.operation_name =
			operation_name;

		this.options =
			options || {};

		this.operation = null;

		this.permissions = {
			can_edit: false,
			can_change_status: false,
			editable_fields: [],
		};

		this.editable_fields =
			new Set();

		this.controls = {};

		this.dialog = null;
		this.$body = null;
	}


	async show() {
		try {
			await this.load_operation();

			this.make_dialog();
			this.render();

			this.dialog.show();

		} catch (error) {
			console.error(
				"Operation view failed:",
				error
			);

			frappe.msgprint({
				title:
					__("تعذر عرض العملية"),

				message:
					error?.message ||
					__(
						"حدث خطأ أثناء تحميل بيانات العملية."
					),

				indicator:
					"red",
			});
		}
	}


	async load_operation() {
		const response =
			await frappe.call({
				method:
					"archive.api.operations.get_operation_for_view",

				args: {
					operation_name:
						this.operation_name,
				},
			});

		const result =
			response.message || {};

		if (
			!result.operation ||
			!result.operation.name
		) {
			throw new Error(
				"لم يتم العثور على العملية."
			);
		}

		this.operation =
			result.operation;

		this.permissions =
			result.permissions || {
				can_edit: false,
				can_change_status: false,
				editable_fields: [],
			};

		this.editable_fields =
			new Set(
				this.permissions
					.editable_fields || []
			);
	}


	make_dialog() {
		const can_save =
			Boolean(
				this.permissions.can_edit &&
				this.editable_fields.size
			);

		const options = {
			title:
				`العملية ${this.operation.name}`,

			size:
				"extra-large",

			fields: [
				{
					fieldtype:
						"HTML",

					fieldname:
						"operation_body",
				},
			],

			secondary_action_label:
				__("إغلاق"),

			secondary_action:
				() =>
					this.dialog.hide(),
		};

		/*
		 * زر الحفظ لا يظهر أصلاً
		 * لمن لا يملك صلاحية Write.
		 */
		if (can_save) {
			options.primary_action_label =
				__("حفظ التعديلات");

			options.primary_action =
				() => this.save();
		}

		this.dialog =
			new frappe.ui.Dialog(
				options
			);

		/*
		 * نفس CSS الخاص بواجهة الإدخال.
		 */
		this.dialog
			.$wrapper
			.addClass(
				"archive-operation-dialog"
			);
	}


	render() {
		this.$body =
			this.dialog
				.fields_dict
				.operation_body
				.$wrapper;

		this.$body.html(`
			<div
				class="archive-operation-form"
				dir="rtl"
			>

				<!-- Extraction -->
				<section class="archive-form-section">

					<div class="archive-section-header">

						<div>
							<h3>
								استخراج البيانات من المستند
							</h3>

							<p>
								المستند المستخدم كمصدر لاستخراج بيانات العملية
							</p>
						</div>

					</div>


					<div class="archive-extraction-layout">

						<div
							class="archive-extraction-file archive-view-extraction-file"
						>
						</div>

					</div>

				</section>


				<!-- Main Data -->
				<section class="archive-form-section">

					<div class="archive-section-header">

						<div>
							<h3>
								بيانات العملية
							</h3>

							<p>
								بيانات العملية الأساسية
							</p>
						</div>


						<span class="archive-status-badge">
							${this.escape_value(
								this.operation.status
							)}
						</span>

					</div>


					<div
						class="
							archive-fields-grid
							archive-main-fields
						"
					></div>

				</section>


				<!-- Beneficiary -->
				<section class="archive-form-section">

					<div class="archive-section-header">

						<div>
							<h3>
								بيانات المستفيد
							</h3>

							<p>
								بيانات المستفيد والحساب والبنك
							</p>
						</div>

					</div>


					<div
						class="
							archive-fields-grid
							archive-beneficiary-fields
						"
					></div>

				</section>


				<!-- Sender -->
				<section class="archive-form-section">

					<div class="archive-section-header">

						<div>
							<h3>
								بيانات التحويل والمرسل
							</h3>

							<p>
								بيانات الحساب والتواريخ والمرجع
							</p>
						</div>

					</div>


					<div
						class="
							archive-fields-grid
							archive-sender-fields
						"
					></div>

				</section>


				<!-- Attachments -->
				<section
					class="
						archive-form-section
						archive-attachments-section
					"
				>

					<div class="archive-section-header">

						<div>
							<h3>
								المرفقات
							</h3>

							<p>
								المرفقات المحفوظة مع العملية
							</p>
						</div>


						<div
							class="archive-attachment-counter"
						>
							0 مرفق
						</div>

					</div>


					<div
						class="archive-attachments-list"
					></div>

				</section>

			</div>
		`);

		this.make_controls();

		this.render_extraction_file();
		this.render_attachments();
	}


	make_controls() {

		/*
		 * ====================================================
		 * بيانات العملية
		 * ====================================================
		 */
		this.make_group_controls(
			".archive-main-fields",
			[
				{
					fieldname:
						"operation_no",

					label:
						"رقم العملية",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"customer",

					label:
						"اسم العميل",

					fieldtype:
						"Link",

					options:
						"Archive Customer",
				},

				{
					fieldname:
						"amount",

					label:
						"المبلغ",

					fieldtype:
						"Currency",
				},

				{
					fieldname:
						"currency",

					label:
						"العملة",

					fieldtype:
						"Link",

					options:
						"Currency",
				},

				{
					fieldname:
						"customer_rate",

					label:
						"سعر العميل",

					fieldtype:
						"Float",

					precision:
						6,
				},

				{
					fieldname:
						"from_account",

					label:
						"عن طريق",

					fieldtype:
						"Link",

					options:
						"Archive Account",
				},

				{
					fieldname:
						"request_date",

					label:
						"تاريخ الطلب",

					fieldtype:
						"Date",
				},

				/*
				 * الحالة لا تعدل من هذه الواجهة.
				 * تغييرها فقط من زر الإجراءات.
				 */
				{
					fieldname:
						"status",

					label:
						"الحالة",

					fieldtype:
						"Data",

					force_read_only:
						true,
				},

				{
					fieldname:
						"status_effective_datetime",

					label:
						"تاريخ الحالة",

					fieldtype:
						"Date",

					force_read_only:
						true,
				},

				{
					fieldname:
						"status_changed_at",

					label:
						"تاريخ تسجيل الحالة في النظام",

					fieldtype:
						"Datetime",

					force_read_only:
						true,
				},

				{
					fieldname:
						"status_changed_by",

					label:
						"تم تغيير الحالة بواسطة",

					fieldtype:
						"Link",

					options:
						"User",

					force_read_only:
						true,
				},
			]
		);


		/*
		 * ====================================================
		 * بيانات المستفيد
		 * ====================================================
		 */
		this.make_group_controls(
			".archive-beneficiary-fields",
			[
				{
					fieldname:
						"beneficiary_name",

					label:
						"اسم المستفيد",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"beneficiary_account",

					label:
						"رقم حساب المستفيد",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"beneficiary_bank",

					label:
						"اسم بنك المستفيد",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"swift_code",

					label:
						"رمز SWIFT",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"country",

					label:
						"الجهة (الدولة)",

					fieldtype:
						"Link",

					options:
						"Country",
				},
			]
		);


		/*
		 * ====================================================
		 * بيانات التحويل والمرسل
		 * ====================================================
		 */
		this.make_group_controls(
			".archive-sender-fields",
			[
				{
					fieldname:
						"sender_name",

					label:
						"اسم المرسل",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"sender_account",

					label:
						"رقم حساب المرسل",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"execution_datetime",

					label:
						"تاريخ تنفيذ العملية",

					fieldtype:
						"Datetime",
				},

				{
					fieldname:
						"transferring_bank",

					label:
						"اسم البنك المحول",

					fieldtype:
						"Link",

					options:
						"Archive Bank",
				},

				{
					fieldname:
						"reference_no",

					label:
						"رقم المرجع",

					fieldtype:
						"Data",
				},

				{
					fieldname:
						"bank_transfer_rate",

					label:
						"سعر البنك المحول",

					fieldtype:
						"Float",

					precision:
						6,
				},

				{
					fieldname:
						"notes",

					label:
						"ملاحظات",

					fieldtype:
						"Data",
				},
			]
		);
	}


	make_group_controls(
		selector,
		definitions
	) {
		const $parent =
			this.$body.find(
				selector
			);

		definitions.forEach(
			(df) => {

				const $slot =
					$(
						'<div class="archive-field-slot"></div>'
					);

				$parent.append(
					$slot
				);

				this.make_control(
					$slot,
					df
				);
			}
		);
	}


	make_control(
		$parent,
		df
	) {
		/*
		 * السيرفر هو مصدر القرار.
		 *
		 * الحقل يصبح قابلاً للتعديل فقط عندما:
		 * 1- ليس force_read_only
		 * 2- اسمه موجود داخل editable_fields القادمة من API.
		 */
		const editable =
			!df.force_read_only &&
			this.editable_fields.has(
				df.fieldname
			);

		const control_df = {
			...df,

			read_only:
				editable
					? 0
					: 1,
		};

		delete control_df
			.force_read_only;


		const control =
			frappe.ui.form.make_control({
				parent:
					$parent,

				df:
					control_df,

				render_input:
					true,
			});

		control.refresh();


		const value =
			this.operation[
				df.fieldname
			];


		if (
			value !== undefined &&
			value !== null
		) {
			control.set_value(
				value
			);
		}


		this.controls[
			df.fieldname
		] = control;

		return control;
	}


	render_extraction_file() {
		const $container =
			this.$body.find(
				".archive-view-extraction-file"
			);

		const file_url =
			this.operation
				.extraction_source_file;

		if (!file_url) {
			$container.html(`
				<div class="archive-no-extraction">
					لم يتم استخدام مستند لاستخراج البيانات
				</div>
			`);

			return;
		}

		const file_name =
			this.get_file_name(
				file_url
			);

		$container.html(`
			<div class="archive-selected-extraction">

				<div class="archive-file-info">

					<div class="archive-file-icon">
						PDF
					</div>

					<div>

						<div class="archive-file-name">
							${this.escape_value(
								file_name
							)}
						</div>

						<div class="archive-file-size">
							مصدر استخراج البيانات
						</div>

					</div>

				</div>


				<div class="archive-extraction-actions">

					<a
						href="${this.escape_attribute(
							file_url
						)}"
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-default btn-sm"
					>
						عرض المستند
					</a>

				</div>

			</div>
		`);
	}


	render_attachments() {
		const $list =
			this.$body.find(
				".archive-attachments-list"
			);

		const attachments =
			this.operation.attachments
				|| [];

		const count =
			attachments.length;

		this.$body
			.find(
				".archive-attachment-counter"
			)
			.text(
				count === 1
					? "1 مرفق"
					: `${count} مرفقات`
			);

		if (!count) {
			$list.html(`
				<div class="archive-no-attachments">
					لا توجد مرفقات
				</div>
			`);

			return;
		}

		$list.html(
			attachments
				.map(
					(item) => {

						const file_url =
							item.file || "";

						const file_name =
							item.file_name ||
							this.get_file_name(
								file_url
							);

						const extension =
							this.file_extension(
								file_name
							);

						return `
							<div
								class="archive-attachment-item"
							>

								<div class="archive-file-info">

									<div class="archive-file-icon">
										${this.escape_value(
											extension
										)}
									</div>


									<div>

										<div class="archive-file-name">
											${this.escape_value(
												file_name
											)}
										</div>


										${
											item.is_extraction_source
												? `
													<div class="archive-file-size">
														مصدر استخراج البيانات
													</div>
												`
												: ""
										}

									</div>

								</div>


								<div
									class="archive-attachment-actions"
								>

									${
										item.is_extraction_source
											? `
												<span
													class="archive-source-badge"
												>
													مصدر استخراج
												</span>
											`
											: ""
									}


									${
										file_url
											? `
												<a
													href="${this.escape_attribute(
														file_url
													)}"
													target="_blank"
													rel="noopener noreferrer"
													class="btn btn-default btn-sm"
												>
													عرض
												</a>
											`
											: ""
									}

								</div>

							</div>
						`;
					}
				)
				.join("")
		);
	}


	get_values() {
		const values = {};

		this.editable_fields
			.forEach(
				(fieldname) => {

					const control =
						this.controls[
							fieldname
						];

					if (!control) {
						return;
					}

					values[
						fieldname
					] =
						control.get_value();
				}
			);

		return values;
	}


	async save() {
		if (
			!this.permissions.can_edit ||
			!this.editable_fields.size
		) {
			return;
		}

		const values =
			this.get_values();

		const primary_button =
			this.dialog
				.get_primary_btn();

		primary_button.prop(
			"disabled",
			true
		);

		try {
			const response =
				await frappe.call({
					method:
						"archive.api.operations.update_operation_manual_fields",

					type:
						"POST",

					args: {
						operation_name:
							this.operation.name,

						values:
							values,
					},
				});

			const result =
				response.message || {};

			if (result.operation) {
				this.operation =
					result.operation;
			}

			frappe.show_alert({
				message:
					`تم حفظ تعديلات ${this.operation.name}`,

				indicator:
					"green",
			});

			this.dialog.hide();

			if (
				typeof this.options
					.on_saved
				=== "function"
			) {
				await this.options
					.on_saved(
						this.operation
					);
			}

		} catch (error) {
			console.error(
				"Operation update failed:",
				error
			);

			frappe.msgprint({
				title:
					__("تعذر حفظ التعديلات"),

				message:
					error?.message ||
					__(
						"حدث خطأ أثناء حفظ تعديلات العملية."
					),

				indicator:
					"red",
			});

		} finally {
			primary_button.prop(
				"disabled",
				false
			);
		}
	}


	get_file_name(
		file_url
	) {
		if (!file_url) {
			return "ملف";
		}

		const clean_url =
			String(
				file_url
			).split("?")[0];

		const parts =
			clean_url.split("/");

		const name =
			parts[
				parts.length - 1
			] || "ملف";

		try {
			return decodeURIComponent(
				name
			);
		} catch (error) {
			return name;
		}
	}


	file_extension(
		file_name
	) {
		const parts =
			String(
				file_name || ""
			).split(".");

		if (
			parts.length < 2
		) {
			return "FILE";
		}

		return (
			parts
				.pop()
				.toUpperCase()
				.slice(0, 4)
		);
	}


	escape_value(
		value
	) {
		if (
			value === null ||
			value === undefined ||
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


	escape_attribute(
		value
	) {
		return frappe.utils
			.escape_html(
				String(
					value || ""
				)
			);
	}
};