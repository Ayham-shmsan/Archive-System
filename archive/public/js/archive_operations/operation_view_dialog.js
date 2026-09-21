frappe.provide("archive.ui");

archive.ui.OperationViewDialog =
class OperationViewDialog {

	

	constructor(
		operation_name,
		options = {}
	) {
		// ========================================================
		// Operation identity
		// ========================================================

		this.operation_name =
			operation_name;


		this.options =
			options || {};


		// ========================================================
		// Backend read model
		//
		// operation:
		//     بيانات الـPart الحالي.
		//
		// group:
		//     Group الحالية + Shared Documents.
		//
		// final_swift:
		//     حالة وعدد Final Swift لهذا الـPart.
		// ========================================================

		this.operation =
			null;

		this.group =
			null;

		this.final_swift = {
			final_swift_required:
				false,

			has_final_swift:
				false,

			final_swift_pending:
				false,

			final_swift_count:
				0,

			final_swift_limit:
				10,

			final_swift_remaining:
				10,
		};


		// ========================================================
		// File collections
		//
		// existing_attachments:
		//     Compatibility مع View القديمة فقط.
		//
		// shared_documents:
		//     Group-level.
		//
		// final_swift_files:
		//     Part-level.
		// ========================================================

		this.existing_attachments =
			[];

		this.shared_documents =
			[];

		this.final_swift_files =
			[];
		// ========================================================
		// Pending Shared Documents
		//
		// shared_documents:
		//     المستندات المحفوظة على الـGroup.
		//
		// pending_shared_files:
		//     Browser Files جديدة داخل الـView فقط.
		//     لا ترفع ولا تحفظ حتى الضغط على Save.
		//
		// shared_documents_limit:
		//     حد مستندات الـGroup فقط.
		//     Final Swift لا يدخل في هذا الحد.
		// ========================================================

		this.pending_shared_files =
			[];

		this.shared_documents_limit =
			10;


		// ========================================================
		// Permissions
		// ========================================================

		this.permissions = {
			can_edit:
				false,

			can_change_status:
				false,

			can_manage_attachments:
				false,

			can_attach_final_swift:
				false,

			can_re_extract:
        		false,

			editable_fields:
				[],
		};


		this.editable_fields =
			new Set();


		// ========================================================
		// Form controls
		// ========================================================

		this.controls = {};

		// ========================================================
		// Customer Rate UI state
		//
		// نفس الحالة المستخدمة في Create:
		// - حفظ آخر قيمة سعودية يدوية.
		// - معرفة آخر عملة.
		// - منع recursion أثناء تغيير الوضع.
		// ========================================================

		this.customer_rate_manual_value =
			"";

		this.customer_rate_last_currency =
			"";

		this.updating_customer_rate_mode =
			false;


		// ========================================================
		// Dialog
		// ========================================================

		this.dialog =
			null;

		this.$body =
			null;


		


		// ========================================================
		// Pending re-extraction state
		//
		// هذه الحالة محلية داخل الـDialog فقط.
		//
		// لا يتم تغيير Archive Operation في قاعدة البيانات
		// عند اختيار PDF أو عند تشغيل الـParser.
		//
		// pending_extraction_file:
		//     Browser File الذي اختاره المستخدم.
		//
		// pending_extraction_uploaded:
		//     هوية File المؤقت بعد رفعه إلى Frappe:
		//     {
		//         file_id,
		//         file_url,
		//         file_name
		//     }
		//
		// pending_extracted_data:
		//     البيانات التي رجعها PDF Parser.
		//     تبقى Pending حتى الحفظ الناجح.
		// ========================================================

		this.pending_extraction_file =
			null;

		this.pending_extraction_uploaded =
			null;

		this.pending_extracted_data =
			{};

		this.pending_extraction_original_values =
    		{};
		
		


		// ========================================================
		// Uploaded temporary files
		//
		// جميع File records المؤقتة المرفوعة أثناء عمر
		// الـDialog تحفظ هنا بواسطة upload_file_once().
		// ========================================================

		this.uploaded_files =
			new Map();
		
	}

	
	bind_download_events() {

		this.$body
			.off(
				"click.archive-download-document",
				[
					".archive-download-attachment",
					".archive-download-shared-document",
				].join(", ")
			)
			.on(
				"click.archive-download-document",
				[
					".archive-download-attachment",
					".archive-download-shared-document",
				].join(", "),
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
						)
						|| null;


					const shared_document_name =
						$button.attr(
							"data-shared-document-name"
						)
						|| null;


					if (
						!attachment_name
						&&
						!shared_document_name
					) {

						frappe.msgprint({
							title:
								__("تعذر تنزيل المستند"),

							message:
								__(
									"تعذر تحديد المستند المطلوب."
								),

							indicator:
								"red",
						});


						return;
					}


					await this.download_operation_document(
						{
							attachment_name:
								attachment_name,

							shared_document_name:
								shared_document_name,
						},

						$button
					);
				}
			);
	}


	async download_operation_document(
		{
			attachment_name = null,
			shared_document_name = null,
		},
		$button
	) {

		if (
			!attachment_name
			&&
			!shared_document_name
		) {
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

						shared_document_name:
							shared_document_name,
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

		}

		finally {

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

		// ========================================================
		// Load View Read Model
		// ========================================================

		const response =
			await frappe.call({
				method:
					"archive.api.operations.get_operation_for_view",

				type:
					"GET",

				args: {
					operation_name:
						this.operation_name,
				},
			});


		const result =
			response.message || {};


		// ========================================================
		// Validate response
		// ========================================================

		if (
			!result.operation
			||
			!result.operation.name
		) {

			throw new Error(
				"لم يتم العثور على العملية."
			);
		}


		if (
			!result.group
			||
			!result.group.name
		) {

			throw new Error(
				"تعذر تحميل مجموعة العملية."
			);
		}


		// ========================================================
		// Current Archive Operation / Part
		// ========================================================

		this.operation =
			result.operation;


		// ========================================================
		// Current Group
		//
		// تحتوي:
		// - name
		// - operation_no
		// - operation_no_normalized
		// - parts_count
		// - shared_documents
		// - shared_documents_count
		// - shared_documents_limit
		// ========================================================

		this.group =
			result.group;


		// ========================================================
		// Group Shared Documents
		//
		// هذه القائمة لا تحتوي:
		// - Extraction
		// - Final Swift
		// ========================================================

		this.shared_documents =
			Array.from(
				this.group
					.shared_documents
				|| []
			);


		this.shared_documents_limit =
			Number(
				this.group
					.shared_documents_limit
				|| 10
			);

		this.pending_shared_files =
    		[];

		// ========================================================
		// Final Swift files
		//
		// خاصة بالـPart الحالي فقط.
		// لا تدخل في Shared Documents count.
		// ========================================================

		this.final_swift_files =
			Array.from(
				this.operation
					.final_swift_files
				|| []
			);


		// ========================================================
		// Final Swift business state
		// ========================================================

		this.final_swift =
			result.final_swift
			|| {
				final_swift_required:
					false,

				has_final_swift:
					false,

				final_swift_pending:
					false,

				final_swift_count:
					this.final_swift_files.length,

				final_swift_limit:
					10,

				final_swift_remaining:
					Math.max(
						10
						-
						this.final_swift_files.length,
						0
					),
			};


		// ========================================================
		// Legacy attachment collection
		//
		// نبقيها حالياً لأن render_extraction_file()
		// وقسم المرفقات القديم ما زالا يستخدمانها.
		//
		// سيتم التخلص من اعتماد الواجهة عليها
		// في الخطوة التالية.
		// ========================================================

		this.existing_attachments =
			Array.from(
				this.operation
					.attachments
				|| []
			);


		// ========================================================
		// Reset unsaved local state
		//
		// عند تحميل العملية نبدأ دائماً من Snapshot محفوظ.
		//
		// لا توجد إعادة استخراج Pending بعد.
		// ========================================================

		this.new_attachments =
			[];

		this.deleted_attachment_names =
			new Set();


		this.pending_extraction_file =
			null;

		this.pending_extraction_uploaded =
			null;

		this.pending_extracted_data =
			{};

		this.pending_extraction_original_values =
    		{};


		// ========================================================
		// Permissions
		// ========================================================

		this.permissions =
			result.permissions
			|| {
				can_edit:
					false,

				can_change_status:
					false,

				can_manage_attachments:
					false,

				can_attach_final_swift:
					false,

				can_re_extract:
            		false,

				editable_fields:
					[],
			};


		// ========================================================
		// Editable fields
		// ========================================================

		this.editable_fields =
			new Set(
				this.permissions
					.editable_fields
				|| []
			);
	}


	async handle_dialog_hide() {

		try {

			// ====================================================
			// Restore unsaved re-extraction Preview
			// ====================================================

			if (
				this.pending_extraction_file
				||
				this.pending_extraction_uploaded
			) {

				await this
					.restore_pending_extraction_values();
			}


			// ====================================================
			// Cleanup every temporary upload still owned
			// by this Dialog.
			//
			// الملفات التي أصبحت مرتبطة فعلاً بمستند
			// لن يحذفها Backend cleanup.
			// ====================================================

			const uploaded =
				Array.from(
					this.uploaded_files.values()
				);


			if (
				uploaded.length
			) {

				await this.cleanup_uploaded_files(
					uploaded
				);
			}

		}

		catch (error) {

			console.error(
				"Operation dialog close cleanup failed:",
				error
			);

		}

		finally {

			this.uploaded_files.clear();


			// ====================================================
			// Shared Documents local state
			// ====================================================

			this.pending_shared_files =
				[];


			// ====================================================
			// Re-extraction local state
			// ====================================================

			this.pending_extraction_file =
				null;

			this.pending_extraction_uploaded =
				null;

			this.pending_extracted_data =
				{};

			this.pending_extraction_original_values =
				{};
		}
	}

	

	make_dialog() {

		const can_save =
			Boolean(
				this.permissions.can_edit
				||
				this.permissions
					.can_manage_attachments
				||
				this.permissions
					.can_re_extract
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


			// ====================================================
			// Close cleanup
			//
			// عند نجاح Save سنصفر Pending state
			// قبل hide، لذلك لن يحذف الملف الجديد المرتبط.
			//
			// عند الإغلاق بدون Save:
			// يتم تنظيف File المؤقت.
			// ====================================================

			onhide:
				() => {

					this.handle_dialog_hide();
				},


			secondary_action_label:
				__("إغلاق"),

			secondary_action:
				() =>
					this.dialog.hide(),
		};


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

				<!-- =============================================
					Extraction
					============================================== -->

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

						<!-- =====================================
							Current persisted extraction
							===================================== -->

						<div
							class="
								archive-extraction-file
								archive-view-extraction-file
							"
						>
						</div>


						<!-- =====================================
							Pending re-extraction
							===================================== -->

						${
							this.permissions
								.can_re_extract
								? `
									<div
										class="
											archive-extraction-dropzone
											archive-re-extraction-dropzone
										"
									>

										<input
											type="file"
											class="archive-re-extraction-input"
											accept="
												application/pdf,
												.pdf
											"
											hidden
										>


										<div class="archive-upload-icon">
											↑
										</div>


										<div>

											<div class="archive-upload-title">
												إعادة استخراج البيانات
											</div>

											<div class="archive-upload-help">
												اسحب ملف PDF جديد هنا
												أو اضغط لاختيار الملف
											</div>

										</div>

									</div>


									<div
										class="
											archive-extraction-file
											archive-pending-extraction-file
										"
									>
									</div>
								`
								: ""
						}

					</div>

				</section>


				<!-- =============================================
					Operation identity + Group documents
					============================================= -->

				<section class="archive-form-section">

					<div class="archive-section-header">

						<div>
							<h3>
								تعريف العملية والمستندات المشتركة
							</h3>

							<p>
								رقم العملية والمستندات التابعة للعملية الأصلية
							</p>
						</div>

					</div>


					<div class="archive-operation-identity-layout">

						<!-- =====================================
							Operation number / Group
							===================================== -->

						<div
							class="
								archive-operation-identity-panel
							"
						>

							<div
								class="
									archive-operation-number-fields
								"
							>
							</div>


							<!--
								نبقي container الاقتراحات موجوداً
								لأن تغيير رقم العملية سيستخدمه
								لاحقاً في Workflow مستقل.
							-->
							<div
								class="
									archive-operation-number-suggestions
								"
								style="display:none;"
							>
							</div>


							<div
								class="
									archive-operation-context-info
								"
							>
								<div>
									المجموعة:
									<strong>
										${this.escape_value(
											this.group?.name
										)}
									</strong>
								</div>

								<div>
									عدد الأجزاء:
									<strong>
										${Number(
											this.group
												?.parts_count
											|| 0
										)}
									</strong>
								</div>
							</div>

						</div>


						<!-- =====================================
							Shared Documents + Final Swift
							===================================== -->

						<div
								class="
									archive-shared-documents-panel
								"
							>

								<div
									class="
										archive-shared-documents-header
									"
								>

									<div>

										<div
											class="
												archive-shared-documents-title
											"
										>
											مستندات العملية
										</div>

										<div
											class="
												archive-shared-documents-help
											"
										>
											الفاتورة، الإشعار السابق،
											المستندات المشتركة والسويفت النهائي
										</div>

									</div>


									<!--
										عداد Shared Documents فقط.

										Final Swift لا يدخل فيه.
										dir=ltr يمنع RTL من إظهار:
										10 / 0
										بدلاً من:
										0 / 10
									-->
									<div
										class="
											archive-shared-documents-counter
										"
										dir="ltr"
									>
										0 / 10
									</div>

								</div>


								<!-- =================================
									New Shared Documents

									تظهر فقط لمن يملك صلاحية
									إدارة المرفقات.

									اختيار الملفات هنا Local فقط.
									================================= -->

								${
									this.permissions
										.can_manage_attachments
										? `
											<div
												class="
													archive-shared-documents-dropzone
												"
											>

												<input
													type="file"
													class="
														archive-shared-documents-input
													"
													accept="
														application/pdf,
														image/*,
														application/msword,
														application/vnd.openxmlformats-officedocument.wordprocessingml.document,
														application/vnd.ms-excel,
														application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
														.pdf,
														.doc,
														.docx,
														.xls,
														.xlsx
													"
													multiple
													hidden
												>


												<div
													class="archive-upload-icon"
												>
													＋
												</div>


												<div>

													<div
														class="archive-upload-title"
													>
														إضافة مستندات
													</div>

													<div
														class="archive-upload-help"
													>
														اسحب الملفات هنا
														أو اضغط للاختيار
													</div>

												</div>

											</div>
										`
										: ""
								}


								<div
									class="
										archive-shared-documents-list
									"
								>
								</div>

							</div>

					</div>

				</section>


				<!-- =============================================
					Main Data
					============================================= -->

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


						<span
							class="archive-status-badge"
						>
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
					>
					</div>

				</section>


				<!-- =============================================
					Beneficiary
					============================================= -->

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
					>
					</div>

				</section>


				<!-- =============================================
					Sender / Transfer
					============================================= -->

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
					>
					</div>

				</section>

			</div>
		`);


		// ========================================================
		// Controls
		// ========================================================

		this.make_controls();


		// ========================================================
		// Download events
		//
		// مسؤول فقط عن تنزيل:
		// - Extraction Source
		// - Final Swift
		//
		// لا يحتوي أي منطق لإضافة/حذف المرفقات.
		// ========================================================

		this.bind_download_events();


		// ========================================================
		// Render persisted files
		// ========================================================

		this.render_extraction_file();


		if (
			this.permissions
				.can_re_extract
		) {

			this.bind_re_extraction_events();

			this.render_pending_extraction_file();
		}


		// this.render_operation_documents();
		if (
			this.permissions
				.can_manage_attachments
		) {

			this.bind_shared_document_events();
		}


		this.render_operation_documents();
	}


	
	make_controls() {

		/*
		* ====================================================
		* تعريف العملية
		*
		* operation_no يظهر مثل Create،
		* لكنه غير قابل للتعديل حالياً.
		* ====================================================
		*/

		this.make_group_controls(
			".archive-operation-number-fields",
			[
				{
					fieldname:
						"operation_no",

					label:
						"رقم العملية",

					fieldtype:
						"Data",

					force_read_only:
						true,
				},
			]
		);


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
						"customer",

					label:
						"اسم العميل",

					fieldtype:
						"Link",

					options:
						"Archive Customer",

					reqd:
						1,
				},

				{
					fieldname:
						"amount",

					label:
						"المبلغ",

					fieldtype:
						"Currency",

					reqd:
						1,
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

					reqd:
						1,
				},

				{
					fieldname:
						"customer_rate_currency",

					label:
						"عملة سعر العميل",

					fieldtype:
						"Select",

					options:
						"\nدولار\nسعودي",

					reqd:
						1,
				},
				{
					fieldname:
						"customer_rate_type",

					label:
						"نوع العمولة",

					fieldtype:
						"Select",

					options:
						"\nله\nعليه\nبدون\nبدل حوالة مرتجعة\n",

					
				},
				{
					fieldname:
						"customer_rate_amount",

					label:
						"مبلغ التسعير",

					fieldtype:
						"Float",

					precision:
						6,
				},
				{
					fieldname: "customer_rate",
					label: "سعر العميل",
					fieldtype:
					    "Data",
					reqd:
						1,
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

					reqd:
						1,
				},

				{
					fieldname:
						"request_date",

					label:
						"تاريخ الطلب",

					fieldtype:
						"Date",

					reqd:
						1,
				},

				{
					fieldname:
						"user_notes",

					label:
						"ملاحظات المستخدم",

					fieldtype:
						"Data",
				},

				/*
				* الحالة تعرض هنا للقراءة فقط.
				* تغيير الحالة يبقى من زر الإجراءات.
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

					reqd:
						1,
				},

				{
					fieldname:
						"beneficiary_account",

					label:
						"رقم حساب المستفيد",

					fieldtype:
						"Data",

					reqd:
						1,
				},

				{
					fieldname:
						"beneficiary_bank",

					label:
						"اسم بنك المستفيد",

					fieldtype:
						"Data",

					reqd:
						1,
				},

				{
					fieldname:
						"swift_code",

					label:
						__("رمز السويفت"),

					fieldtype:
						"Autocomplete",

					placeholder:
						__(
							"اكتب رمز السويفت أو اختر من الاقتراحات"
						),

					ignore_validation:
						true,

					max_items:
						10,

					get_query:
						() => ({
							query:
								"archive.api.lookups.search_swift_codes",

							params: {
								limit:
									10,
							},
						}),

					reqd:
						1,
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

					reqd:
						1,
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

					reqd:
						1,
				},

				{
					fieldname:
						"sender_account",

					label:
						"رقم حساب المرسل",

					fieldtype:
						"Data",

					reqd:
						1,
				},

				{
					fieldname:
						"execution_datetime",

					label:
						"تاريخ تنفيذ العملية",

					fieldtype:
						"Datetime",

					reqd:
						1,
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

					reqd:
						1,
				},

				{
					fieldname:
						"reference_no",

					label:
						"رقم المرجع",

					fieldtype:
						"Data",

					reqd:
						1,
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

					reqd:
						1,
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


		/*
		* ====================================================
		* Customer Rate mode
		*
		* يجب تنفيذها بعد إنشاء controls الثلاثة:
		*
		* customer_rate
		* customer_rate_type
		* customer_rate_currency
		* ====================================================
		*/

		this.bind_customer_rate_mode();
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

	
		 format_customer_rate_amount(
			value
		) {

			const amount =
				Number(
					value
				);


			if (
				!Number.isFinite(
					amount
				)
				||
				amount <= 0
			) {
				return "";
			}


			return amount
				.toFixed(6)
				.replace(
					/0+$/,
					""
				)
				.replace(
					/\.$/,
					""
				);
		}


		get_dollar_customer_rate_value(
			rate_type,
			rate_amount = null
		) {

			if (
				rate_type
				===
				"بدون"
			) {
				return "بدون عمولة";
			}
			if (
				rate_type
				===
				"بدل حوالة مرتجعة"
			) {
				return "بدل حوالة مرتجعة";
			}


			if (
				![
					"له",
					"عليه",
				].includes(
					rate_type
				)
			) {
				return "";
			}


			const amount =
				this.format_customer_rate_amount(
					rate_amount
				);


			if (!amount) {
				return "";
			}


			return `${rate_type} ${amount} $ بالألف`;
		}


		is_automatic_dollar_customer_rate(
			value
		) {

			const normalized =
				String(
					value || ""
				).trim();


			if (
				[
					"بدون عمولة",
					"بدل حوالة مرتجعة",
				].includes(
					normalized
				)
			) {
				return true;
			}


			return /^(له|عليه)\s+\d+(?:\.\d+)?\s+\$\s+بالألف$/
				.test(
					normalized
				);
		}


		set_customer_rate_read_only(
			read_only
		) {

			const control =
				this.controls
					.customer_rate;


			if (!control) {
				return;
			}


			const can_edit =
				this.editable_fields.has(
					"customer_rate"
				);


			const effective_read_only =
				Boolean(
					read_only
					||
					!can_edit
				);


			control.df.read_only =
				effective_read_only
					? 1
					: 0;


			if (
				control.$input?.length
			) {

				control.$input.prop(
					"readonly",
					effective_read_only
				);
			}
		}


		async update_customer_rate_mode({
			rate_type_value = null,
			rate_currency_value = null,
			rate_amount_value = null,
		} = {}) {

			if (
				this.updating_customer_rate_mode
			) {
				return;
			}


			const rate =
				this.controls
					.customer_rate;


			const rate_type =
				this.controls
					.customer_rate_type;


			const rate_currency =
				this.controls
					.customer_rate_currency;


			const rate_amount =
				this.controls
					.customer_rate_amount;


			if (
				!rate
				||
				!rate_type
				||
				!rate_currency
				||
				!rate_amount
			) {
				return;
			}


			/*
			* مهم في View:
			*
			* لا نعتمد على $input لأن الحقل قد يكون
			* Read Only ولا يملك input أصلاً.
			*/
			const currency =
				String(
					rate_currency_value
					??
					rate_currency.get_value()
					??
					""
				).trim();


			const type =
				String(
					rate_type_value
					??
					rate_type.get_value()
					??
					""
				).trim();


			const amount =
				rate_amount_value
				??
				rate_amount.get_value();


			const previous_currency =
				this.customer_rate_last_currency;


			const can_edit_rate =
				this.editable_fields.has(
					"customer_rate"
				);


			const can_edit_type =
				this.editable_fields.has(
					"customer_rate_type"
				);


			const can_edit_amount =
				this.editable_fields.has(
					"customer_rate_amount"
				);


			this.updating_customer_rate_mode =
				true;


			try {

				// ====================================================
				// Dollar
				// ====================================================

				if (
					currency
					===
					"دولار"
				) {

					rate_type.df.hidden =
						0;

					rate_type.df.reqd =
						1;

					rate_type.$wrapper.show();


					this.set_customer_rate_read_only(
						true
					);


					// ================================================
					// No type
					// ================================================

					if (!type) {

						rate_amount.df.hidden =
							1;

						rate_amount.df.reqd =
							0;

						rate_amount.$wrapper.hide();


						if (
							can_edit_rate
						) {

							await rate.set_value(
								""
							);
						}


						this.customer_rate_last_currency =
							currency;


						return;
					}


					// ================================================
					// بدون / بدل حوالة مرتجعة
					// ================================================

					if (
						[
							"بدون",
							"بدل حوالة مرتجعة",
						].includes(
							type
						)
					) {

						rate_amount.df.hidden =
							1;

						rate_amount.df.reqd =
							0;

						rate_amount.$wrapper.hide();


						if (
							can_edit_amount
							&&
							rate_amount.get_value()
						) {

							await rate_amount.set_value(
								null
							);
						}


						if (
							can_edit_rate
						) {

							await rate.set_value(
								type === "بدون"
									? "بدون عمولة"
									: "بدل حوالة مرتجعة"
							);
						}


						this.customer_rate_last_currency =
							currency;


						return;
					}


					// ================================================
					// له / عليه
					// ================================================

					rate_amount.df.hidden =
						0;

					rate_amount.df.reqd =
						1;

					rate_amount.$wrapper.show();


					if (
						can_edit_rate
					) {

						await rate.set_value(
							this.get_dollar_customer_rate_value(
								type,
								amount
							)
						);
					}


					this.customer_rate_last_currency =
						currency;


					return;
				}


				// ====================================================
				// Saudi
				// ====================================================

				if (
					currency
					===
					"سعودي"
				) {

					rate_type.df.hidden =
						1;

					rate_type.df.reqd =
						0;

					rate_type.$wrapper.hide();


					rate_amount.df.hidden =
						1;

					rate_amount.df.reqd =
						0;

					rate_amount.$wrapper.hide();


					if (
						can_edit_type
						&&
						rate_type.get_value()
					) {

						await rate_type.set_value(
							""
						);
					}


					if (
						can_edit_amount
						&&
						rate_amount.get_value()
					) {

						await rate_amount.set_value(
							null
						);
					}


					this.set_customer_rate_read_only(
						false
					);


					const current_value =
						String(
							rate.get_value()
							|| ""
						);


					if (
						can_edit_rate
						&&
						previous_currency
						===
						"دولار"
						&&
						(
							!current_value
							||
							this.is_automatic_dollar_customer_rate(
								current_value
							)
						)
					) {

						await rate.set_value(
							this.customer_rate_manual_value
							|| ""
						);
					}


					this.customer_rate_last_currency =
						currency;


					return;
				}


				// ====================================================
				// No currency
				// ====================================================

				rate_type.df.hidden =
					1;

				rate_type.df.reqd =
					0;

				rate_type.$wrapper.hide();


				rate_amount.df.hidden =
					1;

				rate_amount.df.reqd =
					0;

				rate_amount.$wrapper.hide();


				this.set_customer_rate_read_only(
					false
				);


				this.customer_rate_last_currency =
					currency;

			}

			finally {

				this.updating_customer_rate_mode =
					false;
			}
		}


		bind_customer_rate_mode() {

			const rate =
				this.controls
					.customer_rate;


			const rate_type =
				this.controls
					.customer_rate_type;


			const rate_currency =
				this.controls
					.customer_rate_currency;


			const rate_amount =
				this.controls
					.customer_rate_amount;


			if (
				!rate
				||
				!rate_type
				||
				!rate_currency
				||
				!rate_amount
			) {
				return;
			}


			this.customer_rate_last_currency =
				String(
					rate_currency.get_value()
					|| ""
				).trim();


			/*
			* إذا كانت العملية الحالية سعودية،
			* القيمة المحفوظة هي القيمة اليدوية الحالية.
			*/
			if (
				this.customer_rate_last_currency
				===
				"سعودي"
			) {

				this.customer_rate_manual_value =
					String(
						rate.get_value()
						|| ""
					);
			}


			// ========================================================
			// Currency
			// ========================================================

			if (
				this.editable_fields.has(
					"customer_rate_currency"
				)
				&&
				rate_currency.$input?.length
			) {

				rate_currency.$input
					.off(
						".archiveCustomerRate"
					)
					.on(
						"change.archiveCustomerRate",
						(event) => {

							this.update_customer_rate_mode({
								rate_currency_value:
									event.currentTarget.value,

								rate_type_value:
									rate_type.get_value()
									|| "",

								rate_amount_value:
									rate_amount.get_value(),
							});
						}
					);
			}


			// ========================================================
			// Type
			// ========================================================

			if (
				this.editable_fields.has(
					"customer_rate_type"
				)
				&&
				rate_type.$input?.length
			) {

				rate_type.$input
					.off(
						".archiveCustomerRate"
					)
					.on(
						"change.archiveCustomerRate",
						(event) => {

							this.update_customer_rate_mode({
								rate_type_value:
									event.currentTarget.value,

								rate_currency_value:
									rate_currency.get_value()
									|| "",

								rate_amount_value:
									rate_amount.get_value(),
							});
						}
					);
			}


			// ========================================================
			// Amount
			// ========================================================

			if (
				this.editable_fields.has(
					"customer_rate_amount"
				)
				&&
				rate_amount.$input?.length
			) {

				rate_amount.$input
					.off(
						".archiveCustomerRate"
					)
					.on(
						"input.archiveCustomerRate change.archiveCustomerRate",
						(event) => {

							this.update_customer_rate_mode({
								rate_currency_value:
									rate_currency.get_value()
									|| "",

								rate_type_value:
									rate_type.get_value()
									|| "",

								rate_amount_value:
									event.currentTarget.value,
							});
						}
					);
			}


			// ========================================================
			// Saudi manual Customer Rate
			// ========================================================

			if (
				this.editable_fields.has(
					"customer_rate"
				)
				&&
				rate.$wrapper?.length
			) {

				rate.$wrapper
					.off(
						".archiveCustomerRate"
					)
					.on(
						"input.archiveCustomerRate",
						"input",
						() => {

							if (
								this.updating_customer_rate_mode
							) {
								return;
							}


							const currency =
								String(
									rate_currency.get_value()
									|| ""
								).trim();


							if (
								currency
								===
								"سعودي"
							) {

								this.customer_rate_manual_value =
									String(
										rate.get_value()
										|| ""
									);
							}
						}
					);
			}


			/*
			* مهم جداً:
			*
			* هذه تنفذ حتى لو كانت الشاشة Read Only.
			* وظيفتها عندها فقط إظهار/إخفاء الحقول
			* بالشكل الصحيح، بدون تعديل البيانات.
			*/
			this.update_customer_rate_mode({
				rate_currency_value:
					rate_currency.get_value()
					|| "",

				rate_type_value:
					rate_type.get_value()
					|| "",

				rate_amount_value:
					rate_amount.get_value(),
			});
		}
	

	is_pdf_file(
			file
		) {

			if (!file) {
				return false;
			}


			const file_name =
				String(
					file.name
					|| ""
				).toLowerCase();


			return (
				file.type
				=== "application/pdf"
				||
				file_name.endsWith(
					".pdf"
				)
			);
		}


		

		async set_pending_extraction_file(
			file
		) {

			if (
				!this.permissions
					.can_re_extract
			) {
				return;
			}


			if (
				!this.is_pdf_file(
					file
				)
			) {

				frappe.msgprint({
					title:
						__("ملف غير صحيح"),

					message:
						__(
							"ملف إعادة استخراج البيانات يجب أن يكون بصيغة PDF."
						),

					indicator:
						"orange",
				});


				return;
			}

			const selected_key =
				this.file_key(
					file
				);


			const already_shared =
				this.pending_shared_files
					.some(
						(shared_file) =>
							this.shared_file_key(
								shared_file
							)
							===
							selected_key
					);


			if (already_shared) {

				frappe.msgprint({
					title:
						__("الملف مستخدم كمستند مشترك"),

					message:
						__(
							"أزل الملف من المستندات المشتركة أولاً قبل استخدامه لإعادة استخراج البيانات."
						),

					indicator:
						"orange",
				});


				return;
			}
			// ========================================================
			// إذا كان هناك Preview سابق،
			// نعيد قيم العملية كما كانت قبل الاستخراج.
			// ========================================================

			await this.restore_pending_extraction_values();


			// ========================================================
			// إذا كان الملف السابق قد رُفع مؤقتاً،
			// ننظفه قبل الانتقال للملف الجديد.
			// ========================================================

			await this.cleanup_pending_extraction_upload();


			// ========================================================
			// New local pending file
			// ========================================================

			this.pending_extraction_file =
				file;

			this.pending_extraction_uploaded =
				null;

			this.pending_extracted_data =
				{};

			this.pending_extraction_original_values =
				{};


			this.render_pending_extraction_file();
		}



		async clear_pending_extraction_file() {

			await this.restore_pending_extraction_values();

			await this.cleanup_pending_extraction_upload();


			this.pending_extraction_file =
				null;

			this.pending_extraction_uploaded =
				null;

			this.pending_extracted_data =
				{};

			this.pending_extraction_original_values =
				{};


			this.render_pending_extraction_file();
		}



		async cleanup_pending_extraction_upload() {

			const uploaded =
				this.pending_extraction_uploaded;


			const local_file =
				this.pending_extraction_file;


			if (
				uploaded?.file_id
			) {

				await this.cleanup_uploaded_files(
					[
						uploaded,
					]
				);
			}


			/*
			* نحذف المرجع من upload_file_once cache أيضاً،
			* حتى لا يعيد لاحقاً File record تم تنظيفه.
			*/
			if (local_file) {

				this.uploaded_files.delete(
					this.file_key(
						local_file
					)
				);
			}


			this.pending_extraction_uploaded =
				null;
		}


		async restore_pending_extraction_values() {

			const original_values =
				this.pending_extraction_original_values
				|| {};


			for (
				const [fieldname, value]
				of Object.entries(
					original_values
				)
			) {

				const control =
					this.controls[
						fieldname
					];


				if (!control) {
					continue;
				}


				await control.set_value(
					value
				);
			}


			this.pending_extraction_original_values =
				{};

			this.pending_extracted_data =
				{};
		}


		async extract_pending_operation_data() {

			if (
				!this.permissions
					.can_re_extract
				||
				!this.pending_extraction_file
			) {
				return;
			}


			const $button =
				this.$body.find(
					".archive-run-re-extraction"
				);


			const old_text =
				$button.text();


			$button
				.prop(
					"disabled",
					true
				)
				.text(
					"جاري الاستخراج..."
				);


			try {

				// ====================================================
				// Upload temporary File once
				// ====================================================

				const uploaded =
					await this.upload_file_once(
						this.pending_extraction_file
					);


				this.pending_extraction_uploaded =
					uploaded;


				// ====================================================
				// PDF Parser
				// ====================================================

				const response =
					await frappe.call({
						method:
							"archive.api.pdf_parser.extract_operation_data",

						type:
							"POST",

						args: {
							file_url:
								uploaded.file_url,
						},
					});


				const data =
					response.message?.data
					|| {};


				// ====================================================
				// Fields the PDF is allowed to replace in Preview
				//
				// operation_no ليس هنا عمداً.
				// request_date ليس مستخرجاً من PDF.
				// ====================================================

				const allowed_fields =
					new Set([
						"sender_account",
						"beneficiary_account",
						"amount",
						"currency",
						"bank_transfer_rate",
						"beneficiary_name",
						"beneficiary_bank",
						"execution_datetime",
						"reference_no",
						"sender_name",
						"notes",
					]);


				let extracted_count =
					0;


				for (
					const [fieldname, value]
					of Object.entries(
						data
					)
				) {

					if (
						!allowed_fields.has(
							fieldname
						)
					) {
						continue;
					}


					if (
						value === null
						||
						value === undefined
						||
						value === ""
					) {
						continue;
					}


					const control =
						this.controls[
							fieldname
						];


					if (!control) {
						continue;
					}


					// ================================================
					// Capture value only once:
					// القيمة الموجودة مباشرة قبل الـPreview.
					// ================================================

					if (
						!Object.prototype
							.hasOwnProperty.call(
								this.pending_extraction_original_values,
								fieldname
							)
					) {

						this.pending_extraction_original_values[
							fieldname
						] =
							control.get_value();
					}


					await control.set_value(
						value
					);


					this.pending_extracted_data[
						fieldname
					] =
						value;


					extracted_count++;
				}


				if (!extracted_count) {

					frappe.msgprint({
						title:
							__("لم يتم العثور على بيانات"),

						message:
							__(
								"تمت قراءة الملف ولكن لم يتم العثور على بيانات قابلة للاستخراج."
							),

						indicator:
							"orange",
					});


					this.render_pending_extraction_file();

					return;
				}


				this.render_pending_extraction_file();


				frappe.show_alert({
					message:
						`تم استخراج ${extracted_count} حقول من المستند الجديد`,

					indicator:
						"green",
				});

			}

			catch (error) {

				console.error(
					"Operation re-extraction preview failed:",
					error
				);


				frappe.msgprint({
					title:
						__("تعذر إعادة استخراج البيانات"),

					message:
						error?.message
						||
						__(
							"حدث خطأ أثناء قراءة ملف PDF."
						),

					indicator:
						"red",
				});

			}

			finally {

				$button
					.prop(
						"disabled",
						false
					)
					.text(
						old_text
					);
			}
		}


		async bind_re_extraction_events() {

			if (
				!this.permissions
					.can_re_extract
			) {
				return;
			}


			const input =
				this.$body.find(
					".archive-re-extraction-input"
				)[0];


			const $dropzone =
				this.$body.find(
					".archive-re-extraction-dropzone"
				);


			if (
				!input
				||
				!$dropzone.length
			) {
				return;
			}


			// ========================================================
			// Click
			// ========================================================

			$dropzone
				.off(
					".archiveReExtraction"
				)
				.on(
					"click.archiveReExtraction",
					() => {

						input.click();
					}
				);


			// ========================================================
			// File picker
			// ========================================================

			$(input)
				.off(
					".archiveReExtraction"
				)
				.on(
					"change.archiveReExtraction",
					async () => {

						const file =
							input.files?.[0];


						if (file) {

							await this.set_pending_extraction_file(
								file
							);
						}


						/*
						* يسمح باختيار نفس الملف مرة أخرى.
						*/
						input.value =
							"";
					}
				);


			// ========================================================
			// Drag over
			// ========================================================

			$dropzone
				.on(
					"dragover.archiveReExtraction",
					(event) => {

						event.preventDefault();

						event.stopPropagation();


						$dropzone.addClass(
							"is-dragging"
						);
					}
				);


			// ========================================================
			// Drag leave
			// ========================================================

			$dropzone
				.on(
					"dragleave.archiveReExtraction",
					(event) => {

						event.preventDefault();

						event.stopPropagation();


						$dropzone.removeClass(
							"is-dragging"
						);
					}
				);


			// ========================================================
			// Drop
			// ========================================================

			$dropzone
				.on(
					"drop.archiveReExtraction",
					async (event) => {

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
									.files
								|| []
							);


						if (!files.length) {
							return;
						}


						/*
						* إعادة الاستخراج تستخدم ملفاً واحداً فقط.
						*/
						const file =
							files[0];


						await this.set_pending_extraction_file(
							file
						);
					}
				);
		}


		
		render_pending_extraction_file() {

			const $container =
				this.$body.find(
					".archive-pending-extraction-file"
				);


			if (!$container.length) {
				return;
			}


			const file =
				this.pending_extraction_file;


			if (!file) {

				$container.html(`
					<div class="archive-no-extraction">
						لم يتم اختيار مستند جديد لإعادة الاستخراج
					</div>
				`);


				return;
			}


			const extracted_count =
				Object.keys(
					this.pending_extracted_data
					|| {}
				).length;


			const extraction_status =
				extracted_count
					? `
						تم استخراج
						${extracted_count}
						حقول
						·
						بانتظار الحفظ
					`
					: `
						ملف جديد
						·
						لم يتم استخراج البيانات بعد
					`;


			$container.html(`
				<div class="archive-selected-extraction">

					<div class="archive-file-info">

						<div class="archive-file-icon">
							PDF
						</div>


						<div>

							<div class="archive-file-name">
								${this.escape_value(
									file.name
								)}
							</div>


							<div class="archive-file-size">
								${extraction_status}
							</div>

						</div>

					</div>


					<div class="archive-extraction-actions">

						<button
							type="button"
							class="
								btn
								btn-primary
								btn-sm
								archive-run-re-extraction
							"
						>
							${
								extracted_count
									? "إعادة الاستخراج"
									: "استخراج البيانات"
							}
						</button>


						<button
							type="button"
							class="
								btn
								btn-default
								btn-sm
								archive-remove-pending-extraction
							"
						>
							إزالة
						</button>

					</div>

				</div>
			`);


			$container
				.find(
					".archive-run-re-extraction"
				)
				.off(
					".archiveReExtraction"
				)
				.on(
					"click.archiveReExtraction",
					() => {

						this.extract_pending_operation_data();
					}
				);


			$container
				.find(
					".archive-remove-pending-extraction"
				)
				.off(
					".archiveReExtraction"
				)
				.on(
					"click.archiveReExtraction",
					async () => {

						await this.clear_pending_extraction_file();
					}
				);
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




	shared_file_key(
			file
		) {

			return [
				file.name,
				file.size,
				file.lastModified,
			].join(
				"::"
			);
		}


		is_allowed_shared_file(
			file
		) {

			const name =
				String(
					file?.name
					|| ""
				).toLowerCase();


			const allowed_extensions = [
				".pdf",

				".png",
				".jpg",
				".jpeg",
				".webp",
				".gif",
				".bmp",
				".tif",
				".tiff",
				".heic",
				".heif",
				".avif",

				".doc",
				".docx",

				".xls",
				".xlsx",
			];


			return allowed_extensions.some(
				(extension) =>
					name.endsWith(
						extension
					)
			);
		}


		format_size(
			bytes
		) {

			if (!bytes) {
				return "0 KB";
			}


			if (
				bytes
				<
				1024 * 1024
			) {

				return `${
					(
						bytes
						/ 1024
					).toFixed(
						1
					)
				} KB`;
			}


			return `${
				(
					bytes
					/
					(
						1024
						* 1024
					)
				).toFixed(
					2
				)
			} MB`;
		}


		add_shared_files(
			files
		) {

			const valid_files =
				Array.from(
					files
					|| []
				).filter(
					(file) =>
						this.is_allowed_shared_file(
							file
						)
				);


			if (
				valid_files.length
				!==
				Array.from(
					files
					|| []
				).length
			) {

				frappe.show_alert({
					message:
						__(
							"تم تجاهل بعض الملفات ذات الصيغ غير المدعومة."
						),

					indicator:
						"orange",
				});
			}


			for (
				const file
				of valid_files
			) {

				const key =
					this.shared_file_key(
						file
					);
				
				if (
					this.pending_extraction_file
					&&
					this.file_key(
						this.pending_extraction_file
					)
					===
					key
				) {

					frappe.msgprint({
						title:
							__("الملف مستخدم لإعادة الاستخراج"),

						message:
							__(
								"لا يمكن استخدام نفس الملف كمصدر إعادة استخراج وكمستند مشترك في نفس الوقت."
							),

						indicator:
							"orange",
					});


					continue;
				}


				const exists =
					this.pending_shared_files
						.some(
							(item) =>
								this.shared_file_key(
									item
								)
								===
								key
						);


				if (exists) {
					continue;
				}


				/*
				* المهم هنا:
				*
				* Existing Shared
				* +
				* Pending Shared
				*
				* فقط.
				*
				* Final Swift لا يدخل إطلاقاً.
				*/
				const total_after_add =
					this.shared_documents.length
					+
					this.pending_shared_files.length
					+
					1;


				if (
					total_after_add
					>
					this.shared_documents_limit
				) {

					frappe.msgprint({
						title:
							__(
								"الحد الأقصى للمستندات"
							),

						message:
							__(
								`يمكن إرفاق ${this.shared_documents_limit} مستندات مشتركة كحد أقصى للعملية.`
							),

						indicator:
							"orange",
					});


					break;
				}


				this.pending_shared_files.push(
					file
				);
			}


			this.render_operation_documents();
		}


		remove_pending_shared_file(
			index
		) {

			this.pending_shared_files.splice(
				index,
				1
			);


			this.render_operation_documents();
		}


		bind_shared_document_events() {

			if (
				!this.permissions
					.can_manage_attachments
			) {
				return;
			}


			const input =
				this.$body.find(
					".archive-shared-documents-input"
				)[0];


			const $dropzone =
				this.$body.find(
					".archive-shared-documents-dropzone"
				);


			if (
				!input
				||
				!$dropzone.length
			) {
				return;
			}


			// ========================================================
			// Click
			// ========================================================

			$dropzone
				.off(
					".archiveSharedDocumentsView"
				)
				.on(
					"click.archiveSharedDocumentsView",
					() => {

						input.click();
					}
				);


			// ========================================================
			// File picker
			// ========================================================

			$(input)
				.off(
					".archiveSharedDocumentsView"
				)
				.on(
					"change.archiveSharedDocumentsView",
					() => {

						const files =
							Array.from(
								input.files
								|| []
							);


						if (files.length) {

							this.add_shared_files(
								files
							);
						}


						/*
						* يسمح باختيار نفس الملف
						* مرة ثانية بعد إزالته.
						*/
						input.value =
							"";
					}
				);


			// ========================================================
			// Drag over
			// ========================================================

			$dropzone
				.on(
					"dragover.archiveSharedDocumentsView",
					(event) => {

						event.preventDefault();

						event.stopPropagation();


						$dropzone.addClass(
							"is-dragging"
						);
					}
				);


			// ========================================================
			// Drag leave
			// ========================================================

			$dropzone
				.on(
					"dragleave.archiveSharedDocumentsView",
					(event) => {

						event.preventDefault();

						event.stopPropagation();


						$dropzone.removeClass(
							"is-dragging"
						);
					}
				);


			// ========================================================
			// Drop
			// ========================================================

			$dropzone
				.on(
					"drop.archiveSharedDocumentsView",
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
									.files
								|| []
							);


						if (!files.length) {
							return;
						}


						this.add_shared_files(
							files
						);
					}
				);
		}

	
	render_operation_documents() {

		const $list =
			this.$body.find(
				".archive-shared-documents-list"
			);


		// ========================================================
		// Existing Shared Documents
		//
		// Group-level.
		// ========================================================

		const shared_documents =
			Array.from(
				this.shared_documents
				|| []
			);


		// ========================================================
		// Pending Shared Documents
		//
		// Local Browser Files only.
		// ========================================================

		const pending_shared_files =
			Array.from(
				this.pending_shared_files
				|| []
			);


		// ========================================================
		// Final Swift
		//
		// Part-level.
		// ========================================================

		const final_swift_files =
			Array.from(
				this.final_swift_files
				|| []
			);


		// ========================================================
		// Shared counter
		//
		// Existing Shared
		// +
		// Pending Shared
		//
		// Final Swift لا يدخل إطلاقاً.
		// ========================================================

		const shared_count =
			shared_documents.length
			+
			pending_shared_files.length;


		const shared_limit =
			Number(
				this.shared_documents_limit
				|| 10
			);


		this.$body
			.find(
				".archive-shared-documents-counter"
			)
			.text(
				`${shared_count} / ${shared_limit}`
			);


		// ========================================================
		// Nothing to display
		// ========================================================

		if (
			!shared_documents.length
			&&
			!pending_shared_files.length
			&&
			!final_swift_files.length
		) {

			$list.html(`
				<div
					class="archive-no-attachments"
				>
					لا توجد مستندات مضافة لهذه العملية
				</div>
			`);


			return;
		}


		const rows =
			[];


		// ========================================================
		// Persisted Shared Documents
		// ========================================================

		shared_documents.forEach(
			(document) => {

				const file_url =
					document.file
					|| "";


				const file_name =
					document.file_name
					||
					this.get_file_name(
						file_url
					);


				const extension =
					this.file_extension(
						file_name
					);


				const document_label =
					document.document_role
					=== "invoice"
						? "فاتورة مشتركة"
						: "مستند مشترك";


				rows.push(`
					<div
						class="
							archive-attachment-item
							archive-existing-document
						"
					>

						<div
							class="archive-file-info"
						>

							<div
								class="archive-file-icon"
							>
								${this.escape_value(
									extension
								)}
							</div>


							<div>

								<div
									class="archive-file-name"
								>
									${this.escape_value(
										file_name
									)}
								</div>


								<div
									class="archive-file-size"
								>
									${this.escape_value(
										document_label
									)}
									·
									محفوظ
								</div>

							</div>

						</div>


						<div
							class="
								archive-attachment-actions
							"
						>

							<span
								class="
									archive-existing-badge
								"
							>
								✓ محفوظ
							</span>


							${
								file_url
									? `
										<button
											type="button"
											class="
												btn
												btn-default
												btn-sm
												archive-download-shared-document
											"
											data-shared-document-name="${this.escape_attribute(
												document.name
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

						</div>

					</div>
				`);
			}
		);


		// ========================================================
		// Pending Shared Documents
		// ========================================================

		pending_shared_files.forEach(
			(
				file,
				index
			) => {

				rows.push(`
					<div
						class="
							archive-attachment-item
							archive-pending-document
						"
					>

						<div
							class="archive-file-info"
						>

							<div
								class="archive-file-icon"
							>
								${this.escape_value(
									this.file_extension(
										file.name
									)
								)}
							</div>


							<div>

								<div
									class="archive-file-name"
								>
									${this.escape_value(
										file.name
									)}
								</div>


								<div
									class="archive-file-size"
								>
									${this.escape_value(
										this.format_size(
											file.size
										)
									)}
									·
									مستند مشترك جديد
									·
									بانتظار الحفظ
								</div>

							</div>

						</div>


						<div
							class="
								archive-attachment-actions
							"
						>

							<button
								type="button"
								class="
									btn
									btn-default
									btn-sm
									archive-remove-pending-shared
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


		// ========================================================
		// Final Swift
		//
		// يظهر في نفس الصندوق بصرياً.
		//
		// لكنه:
		// - Part-specific
		// - لا يدخل في Shared counter
		// - لا يستخدم pending_shared_files
		// ========================================================

		final_swift_files.forEach(
			(file) => {

				const file_url =
					file.file
					|| "";


				const file_name =
					file.file_name
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
							archive-existing-document
							archive-final-swift-document
						"
					>

						<div
							class="archive-file-info"
						>

							<div
								class="archive-file-icon"
							>
								${this.escape_value(
									extension
								)}
							</div>


							<div>

								<div
									class="archive-file-name"
								>
									${this.escape_value(
										file_name
									)}
								</div>


								<div
									class="archive-file-size"
								>
									السويفت النهائي
									·
									خاص بهذا الجزء
								</div>

							</div>

						</div>


						<div
							class="
								archive-attachment-actions
							"
						>

							<span
								class="
									archive-existing-badge
								"
							>
								سويفت نهائي
							</span>


							${
								file_url
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
												file.name
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

						</div>

					</div>
				`);
			}
		);


		$list.html(
			rows.join("")
		);


		// ========================================================
		// Remove Pending Shared Document
		// ========================================================

		$list
			.find(
				".archive-remove-pending-shared"
			)
			.off(
				".archiveSharedDocumentsView"
			)
			.on(
				"click.archiveSharedDocumentsView",
				(event) => {

					const index =
						Number(
							$(
								event.currentTarget
							).data(
								"index"
							)
						);


					this.remove_pending_shared_file(
						index
					);
				}
			);
	}


	

	async upload_file(
			file
		) {

			// ========================================================
			// Validate local File
			// ========================================================

			if (
				!file
				||
				!file.name
			) {

				throw new Error(
					"بيانات الملف غير صحيحة."
				);
			}


			if (
				!Number(
					file.size
				)
			) {

				throw new Error(
					`الملف فارغ ولا يمكن رفعه: ${file.name}`
				);
			}


			// ========================================================
			// Frappe upload payload
			// ========================================================

			const form_data =
				new FormData();


			form_data.append(
				"file",
				file,
				file.name
			);


			form_data.append(
				"is_private",
				"1"
			);


			/*
			* مهم للملفات مثل Word وExcel
			* وللتوافق مع مسار Create الحديث.
			*/
			form_data.append(
				"total_file_size",
				String(
					file.size
				)
			);


			// ========================================================
			// Upload
			// ========================================================

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


			let result = {};


			try {

				result =
					await response.json();

			}

			catch {

				throw new Error(
					`فشل رفع الملف: ${file.name}`
				);
			}


			if (
				!response.ok
				||
				result.exc
				||
				!result.message
			) {

				console.error(
					"View file upload failed:",
					{
						file:
							file.name,

						size:
							file.size,

						type:
							file.type,

						response:
							result,
					}
				);


				throw new Error(
					result.message
					||
					`فشل رفع الملف: ${file.name}`
				);
			}


			return result.message;
		}


		async upload_file_once(
			file
		) {

			// ========================================================
			// Browser File identity
			//
			// يمنع رفع نفس Local File أكثر من مرة
			// أثناء عمر الـDialog.
			// ========================================================

			const key =
				this.file_key(
					file
				);


			if (
				this.uploaded_files.has(
					key
				)
			) {

				return this.uploaded_files.get(
					key
				);
			}


			// ========================================================
			// Upload once
			// ========================================================

			const result =
				await this.upload_file(
					file
				);


			/*
			* File.name هو الهوية الحقيقية
			* لسجل File في Frappe.
			*
			* file_url ليس Unique.
			*/
			const uploaded = {
				file_id:
					result.name,

				file_url:
					result.file_url,

				file_name:
					result.file_name
					|| file.name,
			};


			if (
				!uploaded.file_id
				||
				!uploaded.file_url
			) {

				throw new Error(
					`بيانات الملف المرفوع غير مكتملة: ${file.name}`
				);
			}


			this.uploaded_files.set(
				key,
				uploaded
			);


			return uploaded;
		}


		async upload_new_attachments() {

			const uploaded =
				[];


			for (
				const file
				of this.new_attachments
			) {

				const result =
					await this.upload_file_once(
						file
					);


				uploaded.push(
					result
				);
			}


			return uploaded;
		}

		async upload_pending_shared_documents() {

			const uploaded =
				[];


			for (
				const file
				of this.pending_shared_files
			) {

				const result =
					await this.upload_file_once(
						file
					);


				uploaded.push(
					result
				);
			}


			return uploaded;
		}


		get_uploaded_for_local_files(
			files
		) {

			const uploaded =
				[];


			for (
				const file
				of (
					files
					|| []
				)
			) {

				const item =
					this.uploaded_files.get(
						this.file_key(
							file
						)
					);


				if (item) {

					uploaded.push(
						item
					);
				}
			}


			return uploaded;
		}


		clear_uploaded_cache_for_local_files(
			files
		) {

			for (
				const file
				of (
					files
					|| []
				)
			) {

				this.uploaded_files.delete(
					this.file_key(
						file
					)
				);
			}
		}


		async cleanup_uploaded_files(
			uploaded
		) {

			if (
				!uploaded?.length
			) {
				return;
			}


			// ========================================================
			// Exact File identities only
			//
			// لا ننظف بواسطة file_url.
			// ========================================================

			const file_ids =
				uploaded
					.map(
						(item) =>
							item.file_id
					)
					.filter(
						Boolean
					);


			if (
				!file_ids.length
			) {
				return;
			}


			try {

				await frappe.call({
					method:
						"archive.api.operations.delete_temporary_files",

					type:
						"POST",

					args: {
						file_ids:
							file_ids,
					},
				});

			}

			catch (error) {

				console.error(
					"View temporary file cleanup failed:",
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

	clear_saved_re_extraction_state() {

		// ========================================================
		// الملف أصبح مرتبطاً بالعملية في Backend.
		//
		// لذلك:
		// - لا نستدعي cleanup_uploaded_files()
		// - فقط نحذف حالته المحلية والـcache.
		// ========================================================

		const local_file =
			this.pending_extraction_file;


		if (local_file) {

			this.uploaded_files.delete(
				this.file_key(
					local_file
				)
			);
		}


		this.pending_extraction_file =
			null;

		this.pending_extraction_uploaded =
			null;

		this.pending_extracted_data =
			{};

		this.pending_extraction_original_values =
			{};
	}


	async save() {

		// ========================================================
		// Capabilities
		// ========================================================

		const can_edit =
			Boolean(
				this.permissions
					.can_edit
			);


		const can_manage_attachments =
			Boolean(
				this.permissions
					.can_manage_attachments
			);


		const can_re_extract =
			Boolean(
				this.permissions
					.can_re_extract
			);


		// ========================================================
		// Pending states
		// ========================================================

		const has_pending_re_extraction =
			Boolean(
				this.pending_extraction_file
			);


		const has_pending_shared_documents =
			Boolean(
				this.pending_shared_files.length
			);


		// ========================================================
		// Shared Documents permission
		// ========================================================

		if (
			has_pending_shared_documents
			&&
			!can_manage_attachments
		) {

			frappe.msgprint({
				title:
					__("غير مسموح"),

				message:
					__(
						"ليس لديك صلاحية إضافة مستندات مشتركة للعملية."
					),

				indicator:
					"red",
			});


			return;
		}


		// ========================================================
		// Re-extraction validation
		// ========================================================

		if (
			has_pending_re_extraction
		) {

			if (
				!can_re_extract
			) {

				frappe.msgprint({
					title:
						__("غير مسموح"),

					message:
						__(
							"ليس لديك صلاحية إعادة استخراج بيانات هذه العملية."
						),

					indicator:
						"red",
				});


				return;
			}


			/*
			* المستخدم اختار PDF لكنه لم يشغل
			* Parser بعد.
			*/
			if (
				!this.pending_extraction_uploaded
					?.file_id
				||
				!this.pending_extraction_uploaded
					?.file_url
				||
				!Object.keys(
					this.pending_extracted_data
					|| {}
				).length
			) {

				frappe.msgprint({
					title:
						__("استخراج البيانات مطلوب"),

					message:
						__(
							"اضغط «استخراج البيانات» أولاً لمراجعة البيانات المستخرجة قبل الحفظ."
						),

					indicator:
						"orange",
				});


				return;
			}
		}


		// ========================================================
		// Nothing actionable
		// ========================================================

		if (
			!has_pending_re_extraction
			&&
			!has_pending_shared_documents
			&&
			!can_edit
			&&
			!can_manage_attachments
		) {
			return;
		}


		// ========================================================
		// Manual editable values
		// ========================================================

		const values =
			can_edit
				? this.get_values()
				: {};


		const button =
			this.dialog
				.get_primary_btn();


		if (
			button?.length
		) {

			button.prop(
				"disabled",
				true
			);
		}


		// ========================================================
		// Legacy normal attachments
		// ========================================================

		let uploaded =
			[];


		try {

			// ====================================================
			// Upload NEW Shared Documents
			//
			// الرفع يحدث الآن فقط عند Save.
			// ====================================================

			const shared_documents =
				has_pending_shared_documents
					? await this
						.upload_pending_shared_documents()
					: [];


			let response;


			// ====================================================
			// PATH A
			// Re-extraction + optional Shared Documents
			// ====================================================

			if (
				has_pending_re_extraction
			) {

				const pending_upload =
					this.pending_extraction_uploaded;


				response =
					await frappe.call({
						method:
							"archive.api.operations.save_operation_re_extraction",

						type:
							"POST",

						args: {
							operation_name:
								this.operation.name,

							values:
								values,

							shared_documents:
								shared_documents,

							file_id:
								pending_upload.file_id,

							file_url:
								pending_upload.file_url,
						},
					});
			}


			// ====================================================
			// PATH B
			// Normal View save + optional Shared Documents
			// ====================================================

			else {

				/*
				* Legacy generic attachments.
				*
				* القسم غير ظاهر حالياً،
				* لكن نبقي سلوكه الحالي.
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


				response =
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

							shared_documents:
								shared_documents,

							new_attachments:
								uploaded,

							delete_attachment_names:
								Array.from(
									this
										.deleted_attachment_names
								),
						},
					});
			}


			// ========================================================
			// Response
			// ========================================================

			const result =
				response.message
				|| {};


			if (
				result.operation
			) {

				this.operation =
					result.operation;
			}


			// ========================================================
			// Refresh Group Snapshot
			//
			// Backend يرجع Group بعد إنشاء AOD الجديدة.
			// ========================================================

			if (
				result.group
			) {

				this.group =
					result.group;


				this.shared_documents =
					Array.from(
						result.group
							.shared_documents
						|| []
					);


				this.shared_documents_limit =
					Number(
						result.group
							.shared_documents_limit
						|| 10
					);
			}


			// ========================================================
			// Refresh returned permissions
			// ========================================================

			if (
				result.permissions
				&&
				typeof result.permissions
					=== "object"
			) {

				this.permissions = {
					...this.permissions,
					...result.permissions,
				};


				this.editable_fields =
					new Set(
						this.permissions
							.editable_fields
						|| []
					);
			}


			// ========================================================
			// Shared uploads after successful Backend transaction
			//
			// الملفات التي أنشأت AOD أصبحت مرتبطة
			// ولن يحذفها cleanup.
			//
			// أي Upload زائد تم Dedup بواسطة domain
			// سيبقى unattached، وهنا ننظفه.
			// ========================================================

			const shared_uploaded =
				this.get_uploaded_for_local_files(
					this.pending_shared_files
				);


			if (
				shared_uploaded.length
			) {

				await this.cleanup_uploaded_files(
					shared_uploaded
				);
			}


			this.clear_uploaded_cache_for_local_files(
				this.pending_shared_files
			);


			this.pending_shared_files =
				[];


			// ========================================================
			// Re-extraction successfully committed
			// ========================================================

			if (
				has_pending_re_extraction
			) {

				this.clear_saved_re_extraction_state();
			}


			// ========================================================
			// Success message
			// ========================================================

			let success_message =
				`تم حفظ تعديلات ${this.operation.name}`;


			if (
				has_pending_re_extraction
				&&
				has_pending_shared_documents
			) {

				success_message =
					`تم حفظ إعادة الاستخراج والمستندات المشتركة للعملية ${this.operation.name}`;
			}

			else if (
				has_pending_re_extraction
			) {

				success_message =
					`تم حفظ إعادة استخراج بيانات ${this.operation.name}`;
			}

			else if (
				has_pending_shared_documents
			) {

				success_message =
					`تم حفظ المستندات المشتركة للعملية ${this.operation.name}`;
			}


			frappe.show_alert({
				message:
					success_message,

				indicator:
					"green",
			});


			// ========================================================
			// Close
			// ========================================================

			this.dialog.hide();


			// ========================================================
			// Parent refresh callback
			// ========================================================

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

		}

		catch (error) {

			// ========================================================
			// Shared Documents failure
			//
			// ننظف كل Upload نجح حتى لو فشل رفع ملف
			// لاحق في القائمة.
			//
			// Browser Files تبقى في pending_shared_files
			// ليتمكن المستخدم من Retry.
			// ========================================================

			const shared_uploaded =
				this.get_uploaded_for_local_files(
					this.pending_shared_files
				);


			/*
			* إذا كان هناك Re-extraction Pending،
			* لا نحذف file_id الخاص به هنا.
			*
			* هذا احتياط إضافي حتى يبقى Retry
			* لإعادة الاستخراج ممكناً.
			*/
			const extraction_file_id =
				this.pending_extraction_uploaded
					?.file_id
				|| null;


			const shared_only_uploaded =
				shared_uploaded.filter(
					(item) =>
						item.file_id
						!==
						extraction_file_id
				);


			if (
				shared_only_uploaded.length
			) {

				await this.cleanup_uploaded_files(
					shared_only_uploaded
				);
			}


			/*
			* نمسح Cache الخاص بالـShared Files فقط،
			* حتى يعاد رفعها فعلياً في Retry.
			*/
			for (
				const file
				of this.pending_shared_files
			) {

				const key =
					this.file_key(
						file
					);


				const item =
					this.uploaded_files.get(
						key
					);


				if (
					!item
					||
					item.file_id
					!==
					extraction_file_id
				) {

					this.uploaded_files.delete(
						key
					);
				}
			}


			// ========================================================
			// Legacy normal attachment failure
			// ========================================================

			if (
				!has_pending_re_extraction
				&&
				uploaded.length
			) {

				await this
					.cleanup_uploaded_files(
						uploaded
					);
			}


			console.error(
				has_pending_re_extraction
					? "Operation re-extraction save failed:"
					: "Operation view save failed:",
				error
			);


			frappe.msgprint({
				title:
					has_pending_re_extraction
						? __(
							"تعذر حفظ إعادة الاستخراج"
						)
						: __(
							"تعذر حفظ التعديلات"
						),

				message:
					error?.message
					||
					(
						has_pending_re_extraction
							? __(
								"حدث خطأ أثناء حفظ إعادة استخراج بيانات العملية."
							)
							: __(
								"حدث خطأ أثناء حفظ تعديلات العملية."
							)
					),

				indicator:
					"red",
			});

		}

		finally {

			if (
				button?.length
			) {

				button.prop(
					"disabled",
					false
				);
			}
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