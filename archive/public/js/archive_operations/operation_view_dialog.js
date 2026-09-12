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
			can_manage_attachments: false,
			editable_fields: [],
		};

		this.editable_fields =
			new Set();

		this.controls = {};

		this.dialog = null;
		this.$body = null;
		this.existing_attachments = [];
		this.new_attachments = [];
		this.deleted_attachment_names =
			new Set();

		this.uploaded_files =
			new Map();
	}

	bind_attachment_events() {
		// /*
		// * ====================================================
		// * Download existing attachment
		// * ====================================================
		// */

		this.$body
			.off(
				"click.archive-download-attachment",
				".archive-download-attachment"
			)
			.on(
				"click.archive-download-attachment",
				".archive-download-attachment",
				async (event) => {

					event.preventDefault();
					event.stopPropagation();


					const $button =
						$(
							event.currentTarget
						);


					const attachment_name =
						$button.attr(
							"data-attachment-name"
						);


					if (!attachment_name) {
						frappe.msgprint(
							"تعذر تحديد المرفق."
						);

						return;
					}


					await this.download_attachment(
						attachment_name,
						$button
					);
				}
			);
		const input =
			this.$body.find(
				".archive-view-attachments-input"
			)[0];

		const $dropzone =
			this.$body.find(
				".archive-attachments-dropzone"
			);


		$dropzone.on(
			"click",
			() => input.click()
		);


		$(input).on(
			"change",
			() => {

				const files =
					Array.from(
						input.files || []
					);

				this.add_new_attachments(
					files
				);

				input.value = "";
			}
		);


		$dropzone.on(
			"dragover",
			(event) => {
				event.preventDefault();
				event.stopPropagation();

				$dropzone.addClass(
					"is-dragging"
				);
			}
		);


		$dropzone.on(
			"dragleave",
			(event) => {
				event.preventDefault();
				event.stopPropagation();

				$dropzone.removeClass(
					"is-dragging"
				);
			}
		);


		$dropzone.on(
			"drop",
			(event) => {
				event.preventDefault();
				event.stopPropagation();

				$dropzone.removeClass(
					"is-dragging"
				);

				const files =
					Array.from(
						event
							.originalEvent
							.dataTransfer
							.files || []
					);

				this.add_new_attachments(
					files
				);
			}
		);
	}

	async download_attachment(
		attachment_name,
		$button
	) {
		if (!attachment_name) {
			return;
		}


		const original_html =
			$button.html();


		$button
			.prop(
				"disabled",
				true
			)
			.html(`
				<i
					class="
						fa
						fa-spinner
						fa-spin
					"
				></i>

				جاري التنزيل...
			`);


		try {

			const response =
				await frappe.call({
					method:
						"archive.api.operations.register_attachment_download",

					type:
						"POST",

					args: {
						operation_name:
							this.operation_name,

						attachment_name:
							attachment_name,
					},
				});


			const result =
				response.message
				|| {};


			if (!result.file_url) {
				frappe.throw(
					"تعذر العثور على رابط الملف."
				);
			}


			const link =
				document.createElement(
					"a"
				);

			link.href =
				result.file_url;

			link.download =
				result.file_name
				|| "";

			link.style.display =
				"none";


			document.body.appendChild(
				link
			);

			link.click();

			link.remove();

		} finally {

			$button
				.prop(
					"disabled",
					false
				)
				.html(
					original_html
				);
		}
	}


	file_key(file) {
		return [
			file.name,
			file.size,
			file.lastModified,
		].join("::");
	}


	add_new_attachments(files) {
		for (const file of files) {

			const key =
				this.file_key(file);

			const exists =
				this.new_attachments.some(
					(item) =>
						this.file_key(item)
						=== key
				);

			if (!exists) {
				this.new_attachments.push(
					file
				);
			}
		}

		this.render_attachments();
	}


	remove_new_attachment(index) {
		this.new_attachments.splice(
			index,
			1
		);

		this.render_attachments();
	}


	mark_existing_attachment_deleted(
		attachment
	) {
		if (
			attachment
				.is_extraction_source
		) {
			frappe.msgprint({
				title:
					__("لا يمكن حذف المرفق"),

				message:
					__(
						"مستند استخراج البيانات محمي ولا يمكن حذفه."
					),

				indicator:
					"orange",
			});

			return;
		}


		this.deleted_attachment_names.add(
			attachment.name
		);

		this.render_attachments();
	}


	restore_existing_attachment(
		attachment_name
	) {
		this.deleted_attachment_names.delete(
			attachment_name
		);

		this.render_attachments();
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
		this.existing_attachments =
			Array.from(
				this.operation.attachments || []
			);

		this.new_attachments = [];

		this.deleted_attachment_names =
			new Set();

		this.permissions =
			result.permissions || {
				can_edit: false,
				can_change_status: false,
				can_manage_attachments: false,
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
				this.permissions.can_edit
				||
				this.permissions
					.can_manage_attachments
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


					${
						this.permissions
							.can_manage_attachments
							? `
								<div
									class="archive-attachments-dropzone"
								>

									<input
										type="file"
										class="archive-view-attachments-input"
										accept="application/pdf,image/*"
										multiple
										hidden
									>

									<div class="archive-upload-icon">
										＋
									</div>

									<div>

										<div class="archive-upload-title">
											إضافة مرفقات
										</div>

										<div class="archive-upload-help">
											اسحب الملفات هنا أو اضغط للاختيار
										</div>

									</div>

								</div>
							`
							: ""
					}


					<div
						class="archive-attachments-list"
					></div>

				</section>

			</div>
		`);

		this.make_controls();
		if (
			this.permissions
				.can_manage_attachments
		) {
			this.bind_attachment_events();
		}

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
    					"Data",
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
		const extraction_attachment =
			this.existing_attachments
				.find(
					(item) =>
						item.is_extraction_source
						&&
						item.file === file_url
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

					${
						this.permissions
							.can_manage_attachments
						&&
						extraction_attachment
							? `
								<button
									type="button"
									class="
										btn
										btn-default
										btn-sm
										archive-download-attachment
									"
									data-attachment-name="${this.escape_attribute(
										extraction_attachment.name
									)}"
								>
									${frappe.utils.icon(
										"download",
										"sm"
									)}

									<span>
										تنزيل المستند
									</span>
								</button>
							`
							: ""
					}

				</div>

			</div>
		`);
	}


	async upload_file(
			file
		) {
			const form_data =
				new FormData();


			form_data.append(
				"file",
				file
			);

			form_data.append(
				"is_private",
				"1"
			);


			const response =
				await fetch(
					"/api/method/upload_file",
					{
						method:
							"POST",

						headers: {
							"X-Frappe-CSRF-Token":
								frappe.csrf_token,
						},

						body:
							form_data,
					}
				);


			const result =
				await response.json();


			if (
				!response.ok
				||
				result.exc
				||
				!result.message
			) {
				throw new Error(
					`فشل رفع الملف: ${file.name}`
				);
			}


			return {
				file_url:
					result.message.file_url,

				file_name:
					result.message.file_name
					|| file.name,
			};
		}


		async upload_new_attachments() {
			const uploaded = [];


			for (
				const file
				of this.new_attachments
			) {
				const result =
					await this.upload_file(
						file
					);

				uploaded.push(
					result
				);
			}


			return uploaded;
		}


		async cleanup_uploaded_files(
			uploaded
		) {
			if (!uploaded?.length) {
				return;
			}


			try {
				await frappe.call({
					method:
						"archive.api.operations.delete_temporary_files",

					type:
						"POST",

					args: {
						file_urls:
							uploaded.map(
								(item) =>
									item.file_url
							),
					},
				});

			} catch (error) {
				console.error(
					"View attachment cleanup failed:",
					error
				);
			}
		}
	render_attachments() {
		const $list =
			this.$body.find(
				".archive-attachments-list"
			);


		const visible_existing =
			this.existing_attachments
				.filter(
					(item) =>
						!this
							.deleted_attachment_names
							.has(
								item.name
							)
				);


		const count =
			visible_existing.length
			+
			this.new_attachments.length;


		this.$body
			.find(
				".archive-attachment-counter"
			)
			.text(
				count === 1
					? "1 مرفق"
					: `${count} مرفقات`
			);


		const rows = [];


		/*
		* ======================================================
		* Existing attachments
		* ======================================================
		*/

		this.existing_attachments
			.forEach(
				(item) => {

					const deleted =
						this
							.deleted_attachment_names
							.has(
								item.name
							);

					const file_url =
						item.file || "";

					const file_name =
						item.file_name
						||
						this.get_file_name(
							file_url
						);

					const extension =
						this.file_extension(
							file_name
						);


					rows.push(`
						<div
							class="
								archive-attachment-item
								${deleted
									? "is-pending-delete"
									: ""
								}
							"
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


									${
										item.is_final_swift
											? `
												<div class="archive-file-size">
													السويفت النهائي
												</div>
											`
											: ""
									}


									${
										deleted
											? `
												<div class="archive-file-size">
													سيتم الحذف عند حفظ التعديلات
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
								file_url
								&&
								!deleted
								&&
								this.permissions
									.can_manage_attachments
									? `
										<button
											type="button"
											class="
												btn
												btn-default
												btn-sm
												archive-download-attachment
											"
											data-attachment-name="${this.escape_attribute(
												item.name
											)}"
										>
											${frappe.utils.icon(
												"download",
												"sm"
											)}
											<span>
												تنزيل
											</span>
										</button>
									`
									: ""
							}


								${
									this.permissions
										.can_manage_attachments
									&&
									!item
										.is_extraction_source
										? (
											deleted
												? `
													<button
														type="button"
														class="
															btn
															btn-default
															btn-sm
															archive-restore-existing-attachment
														"
														data-name="${this.escape_attribute(
															item.name
														)}"
													>
														تراجع
													</button>
												`
												: `
													<button
														type="button"
														class="
															btn
															btn-default
															btn-sm
															archive-delete-existing-attachment
														"
														data-name="${this.escape_attribute(
															item.name
														)}"
													>
														حذف
													</button>
												`
										)
										: ""
								}

							</div>

						</div>
					`);
				}
			);


		/*
		* ======================================================
		* New attachments
		* ======================================================
		*/

		this.new_attachments
			.forEach(
				(file, index) => {

					rows.push(`
						<div
							class="
								archive-attachment-item
								is-new
							"
						>

							<div class="archive-file-info">

								<div class="archive-file-icon">
									${this.escape_value(
										this.file_extension(
											file.name
										)
									)}
								</div>


								<div>

									<div class="archive-file-name">
										${this.escape_value(
											file.name
										)}
									</div>

									<div class="archive-file-size">
										مرفق جديد — سيتم حفظه عند حفظ التعديلات
									</div>

								</div>

							</div>


							<div
								class="archive-attachment-actions"
							>

								<button
									type="button"
									class="
										btn
										btn-default
										btn-sm
										archive-remove-new-attachment
									"
									data-index="${index}"
								>
									إزالة
								</button>

							</div>

						</div>
					`);
				}
			);


		if (!rows.length) {
			$list.html(`
				<div class="archive-no-attachments">
					لا توجد مرفقات
				</div>
			`);

			return;
		}


		$list.html(
			rows.join("")
		);


		/*
		* Existing delete
		*/
		$list
			.find(
				".archive-delete-existing-attachment"
			)
			.on(
				"click",
				(event) => {

					const name =
						$(event.currentTarget)
							.data("name");


					const attachment =
						this.existing_attachments
							.find(
								(item) =>
									item.name
									=== name
							);


					if (attachment) {
						this
							.mark_existing_attachment_deleted(
								attachment
							);
					}
				}
			);


		/*
		* Restore existing
		*/
		$list
			.find(
				".archive-restore-existing-attachment"
			)
			.on(
				"click",
				(event) => {

					const name =
						$(event.currentTarget)
							.data("name");

					this
						.restore_existing_attachment(
							name
						);
				}
			);


		/*
		* Remove unsaved new attachment
		*/
		$list
			.find(
				".archive-remove-new-attachment"
			)
			.on(
				"click",
				(event) => {

					const index =
						Number(
							$(event.currentTarget)
								.data("index")
						);

					this
						.remove_new_attachment(
							index
						);
				}
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
		const can_edit =
			Boolean(
				this.permissions.can_edit
			);

		const can_manage_attachments =
			Boolean(
				this.permissions
					.can_manage_attachments
			);


		if (
			!can_edit
			&&
			!can_manage_attachments
		) {
			return;
		}


		const values =
			can_edit
				? this.get_values()
				: {};


		const button =
			this.dialog
				.get_primary_btn();


		button.prop(
			"disabled",
			true
		);


		let uploaded = [];


		try {

			/*
			* لا نرفع الملفات الجديدة
			* إلا عند الضغط على حفظ.
			*/
			if (
				can_manage_attachments
				&&
				this.new_attachments.length
			) {
				uploaded =
					await this
						.upload_new_attachments();
			}


			const response =
				await frappe.call({
					method:
						"archive.api.operations.save_operation_view_changes",

					type:
						"POST",

					args: {
						operation_name:
							this.operation.name,

						values:
							values,

						new_attachments:
							uploaded,

						delete_attachment_names:
							Array.from(
								this.deleted_attachment_names
							),
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

			/*
			* إذا فشل حفظ العملية،
			* نحذف فقط الملفات الجديدة
			* التي رفعناها في هذه المحاولة.
			*/
			await this
				.cleanup_uploaded_files(
					uploaded
				);


			console.error(
				"Operation view save failed:",
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
			button.prop(
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