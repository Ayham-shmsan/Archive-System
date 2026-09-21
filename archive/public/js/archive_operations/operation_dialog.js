frappe.provide("archive.ui");

archive.ui.OperationDialog = class OperationDialog {
	constructor() {
		
		this.extraction_file = null;
		this.existing_shared_documents = [];
		this.pending_shared_files = [];
		this.operation_group_context = null;
		this.operation_number_context_key = null;
		
		this.operation_number_lookup_request_id = 0;
		this.operation_number_lookup_timer = null;

		this.operation_number_suggestions = [];
		this.operation_number_suggestion_index = -1;
		this.selected_operation_number_key = null;

		this.operation_number_lookup_cache =
			new Map();

		this.shared_documents_limit = 10;
		this.controls = {};

		this.customer_rate_manual_value =
			"";

		this.customer_rate_last_currency =
			"";

		this.updating_customer_rate_mode =
			false;

		this.uploaded_files =
			new Map();


		this.make_dialog();
		this.render();
	}

	shared_file_key(file) {
		return [
			file.name,
			file.size,
			file.lastModified,
		].join("::");
	}

	get_operation_number_input_value() {

		const operation_no =
			this.controls.operation_no;


		if (!operation_no?.$input) {
			return "";
		}


		return String(
			operation_no.$input.val()
			|| ""
		).trim();
	}


	reset_operation_number_context({
		clear_pending = false,
	} = {}) {

		this.operation_group_context =
			null;
			
		this.operation_number_context_key =
			null;
		this.selected_operation_number_key =
			null;

		this.existing_shared_documents =
			[];


		if (clear_pending) {

			this.pending_shared_files =
				[];
		}


		this.render_operation_context();

		this.render_shared_documents();
	}

	apply_operation_number_lookup(
		result,
		{
			commit_exact = false,
		} = {}
	) {

		result =
			result || {};


		// ========================================================
		// Suggestions
		//
		// تظهر أثناء الكتابة دائماً.
		// ========================================================

		this.operation_number_suggestions =
			Array.isArray(
				result.suggestions
			)
				? result.suggestions
				: [];


		this.operation_number_suggestion_index =
			-1;


		this.shared_documents_limit =
			Number(
				result.max_documents
				|| 10
			);


		// ========================================================
		// مجرد كتابة الرقم
		//
		// لا تعني أن المستخدم اختار العملية الموجودة.
		// لذلك لا نحمّل Context ولا المستندات هنا.
		// ========================================================

		if (!commit_exact) {

			this.render_operation_number_suggestions();

			return;
		}


		// ========================================================
		// Explicit selection
		// ========================================================

		const exact =
			result.exact;


		if (!exact) {

			this.operation_group_context =
				null;

			this.operation_number_context_key =
				null;

			this.selected_operation_number_key =
				null;

			this.existing_shared_documents =
				[];

			this.render_operation_context();

			this.render_shared_documents();

			this.render_operation_number_suggestions();

			return;
		}


		this.operation_group_context =
			exact;


		this.operation_number_context_key =
			exact.operation_no_normalized
			|| result.normalized_query
			|| null;


		this.selected_operation_number_key =
			this.operation_number_context_key;


		this.existing_shared_documents =
			Array.isArray(
				exact.documents
			)
				? exact.documents
				: [];


		this.render_operation_context();

		this.render_shared_documents();

		this.render_operation_number_suggestions();
	}


	


	async fetch_operation_number_lookup(
		query,
		{
			commit_exact = false,
		} = {}
	){

		const value =
			String(
				query || ""
			).trim();


		/*
		* كل تغير في الحقل يبطل
		* أي Request أقدم،
		* حتى عندما تصبح القيمة فارغة.
		*/
		const request_id =
			++this.operation_number_lookup_request_id;


		if (!value) {

			this.operation_number_suggestions =
				[];

			this.operation_number_suggestion_index =
				-1;

			this.operation_group_context =
				null;

			this.operation_number_context_key =
				null;

			this.existing_shared_documents =
				[];

			this.render_operation_number_suggestions();

			this.render_operation_context();

			this.render_shared_documents();

			return;
		}


		/*
		* Cache داخل عمر الـDialog فقط.
		*/
		if (
			this.operation_number_lookup_cache.has(
				value
			)
		) {

			const cached =
				this.operation_number_lookup_cache.get(
					value
				);


			if (
				request_id
				===
				this.operation_number_lookup_request_id
			) {

				this.apply_operation_number_lookup(
					cached,
					{
						commit_exact:
							commit_exact,
					}
				);
			}


			return;
		}


		try {

			const response =
				await frappe.call({

					method:
						"archive.api.operation_documents.lookup_operation_numbers",

					args: {
						query:
							value,

						limit:
							8,
					},
				});



			if (
				request_id
				!==
				this.operation_number_lookup_request_id
			) {
				return;
			}


			const result =
				response.message || {};


			this.operation_number_lookup_cache.set(
				value,
				result
			);


			this.apply_operation_number_lookup(
				result,
				{
					commit_exact:
						commit_exact,
				}
			);

		}

		catch (error) {

			if (
				request_id
				!==
				this.operation_number_lookup_request_id
			) {
				return;
			}


			console.error(
				"Operation number lookup failed:",
				error
			);


			this.operation_number_suggestions =
				[];

			this.render_operation_number_suggestions();
		}
	}

	bind_operation_number_lookup() {

		const operation_no =
			this.controls.operation_no;


		if (!operation_no?.$input) {
			return;
		}


		this.place_operation_number_suggestions();


		let previous_value =
			this.get_operation_number_input_value();


		operation_no.$input
			.off(
				".archiveOperationNumberLookup"
			)


			.on(
				"input.archiveOperationNumberLookup",
				() => {

					const value =
						this.get_operation_number_input_value();


					clearTimeout(
						this.operation_number_lookup_timer
					);


					/*
					* تغير الرقم يعني تغير سياق
					* المستندات المشتركة.
					*
					* ملف الاستخراج والبيانات
					* لا يتم لمسها.
					*/
					if (
						value
						!==
						previous_value
					) {

						this.reset_operation_number_context({
							clear_pending:
								true,
						});


						previous_value =
							value;
					}


					/*
					* إبطال أي Lookup سابق فوراً،
					* وليس بعد انتهاء الـDebounce.
					*/
					this.operation_number_lookup_request_id++;


					if (!value) {

						this.operation_number_suggestions =
							[];

						this.render_operation_number_suggestions();

						return;
					}


					this.operation_number_lookup_timer =
						setTimeout(
							() => {

								this.fetch_operation_number_lookup(
									value
								);

							},
							180
						);
				}
			)


			.on(
				"keydown.archiveOperationNumberLookup",
				(event) => {

					const suggestions =
						this.operation_number_suggestions;


					if (!suggestions.length) {
						return;
					}


					if (
						event.key
						===
						"ArrowDown"
					) {

						event.preventDefault();


						this.operation_number_suggestion_index =
							Math.min(
								this.operation_number_suggestion_index
									+ 1,

								suggestions.length
									- 1
							);


						this.render_operation_number_suggestions();

						return;
					}


					if (
						event.key
						===
						"ArrowUp"
					) {

						event.preventDefault();


						this.operation_number_suggestion_index =
							Math.max(
								this.operation_number_suggestion_index
									- 1,

								0
							);


						this.render_operation_number_suggestions();

						return;
					}


					if (
						event.key
						===
						"Enter"
					) {

						let index =
							this.operation_number_suggestion_index;


						/*
						* إذا لم يتحرك المستخدم بالأسهم،
						* نبحث عن اقتراح مطابق تماماً
						* لما كتبه.
						*/
						if (index < 0) {

							const typed_value =
								this.get_operation_number_input_value();


							index =
								suggestions.findIndex(
									(item) =>
										String(
											item.value || ""
										).trim()
										===
										typed_value
								);
						}


						/*
						* وإذا كانت نتيجة واحدة فقط،
						* Enter يختارها مباشرة.
						*/
						if (
							index < 0
							&&
							suggestions.length
							===
							1
						) {

							index = 0;
						}


						if (index >= 0) {

							event.preventDefault();

							this.select_operation_number_suggestion(
								index
							);
						}


						return;
					}


					if (
						event.key
						===
						"Escape"
					) {

						this.hide_operation_number_suggestions();
					}
				}
			)


			.on(
				"blur.archiveOperationNumberLookup",
				() => {

					setTimeout(
						() => {

							this.hide_operation_number_suggestions();

						},
						120
					);
				}
			);
	}


	is_allowed_shared_file(file) {

		const name =
			String(
				file?.name || ""
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
	render_shared_documents() {

		const $list =
			this.$body.find(
				".archive-shared-documents-list"
			);


		const existing_count =
			this.existing_shared_documents.length;


		const pending_count =
			this.pending_shared_files.length;


		const total =
			existing_count
			+
			pending_count;


		this.$body
			.find(
				".archive-shared-documents-counter"
			)
			.text(
				`${total} / ${this.shared_documents_limit}`
			);


		if (!total) {

			$list.html(`
				<div class="archive-no-attachments">
					لا توجد مستندات مضافة لهذه العملية
				</div>
			`);

			return;
		}


		const existing_html =
			this.existing_shared_documents
				.map(
					(document) => {

						return `
							<div class="archive-attachment-item archive-existing-document">

								<div class="archive-file-info">

									<div class="archive-file-icon">
										${this.get_document_extension(
											document.file_name
										)}
									</div>

									<div>

										<div class="archive-file-name">
											${frappe.utils.escape_html(
												document.file_name
												|| "ملف"
											)}
										</div>

										<div class="archive-file-size">
											مضاف مسبقاً
										</div>

									</div>

								</div>


								<div class="archive-attachment-actions">

									<span class="archive-existing-badge">
										✓ محفوظ
									</span>

									<a
										class="btn btn-default btn-sm"
										href="${frappe.utils.escape_html(
											document.file
										)}"
										download>
										تنزيل
									</a>

								</div>

							</div>
						`;
					}
				)
				.join("");


		const pending_html =
			this.pending_shared_files
				.map(
					(
						file,
						index
					) => {

						return `
							<div class="archive-attachment-item archive-pending-document">

								<div class="archive-file-info">

									<div class="archive-file-icon">
										${this.file_extension(
											file
										)}
									</div>

									<div>

										<div class="archive-file-name">
											${frappe.utils.escape_html(
												file.name
											)}
										</div>

										<div class="archive-file-size">
											${this.format_size(
												file.size
											)}
											· جديد
										</div>

									</div>

								</div>


								<div class="archive-attachment-actions">

									<button
										type="button"
										class="btn btn-default btn-sm archive-remove-shared-file"
										data-index="${index}">
										إزالة
									</button>

								</div>

							</div>
						`;
					}
				)
				.join("");


		$list.html(
			existing_html
			+
			pending_html
		);


		$list
			.find(
				".archive-remove-shared-file"
			)
			.on(
				"click",
				(event) => {

					const index =
						Number(
							$(
								event.currentTarget
							)
							.data(
								"index"
							)
						);


					this.remove_pending_shared_file(
						index
					);
				}
			);
	}


	get_document_extension(
		file_name
	) {

		const name =
			String(
				file_name || ""
			);


		const parts =
			name.split(".");


		if (
			parts.length
			<
			2
		) {
			return "FILE";
		}


		return parts
			.pop()
			.toUpperCase()
			.slice(
				0,
				4
			);
	}


	add_shared_files(files) {

		const valid_files =
			files.filter(
				(file) =>
					this.is_allowed_shared_file(
						file
					)
			);


		if (
			valid_files.length
			!== files.length
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


			const exists =
				this.pending_shared_files
					.some(
						(item) =>
							this.shared_file_key(
								item
							)
							=== key
					);


			if (exists) {
				continue;
			}


			const total_after_add =
				this.existing_shared_documents.length
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
						__("الحد الأقصى للمستندات"),

					message:
						__(
							`يمكن إرفاق ${this.shared_documents_limit} مستندات كحد أقصى للعملية.`
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


		this.render_shared_documents();
	}


	remove_pending_shared_file(
		index
	) {

		this.pending_shared_files.splice(
			index,
			1
		);


		this.render_shared_documents();
	}

	
	update_operation_number_mode() {

		const operation_no =
			this.controls
				.operation_no;


		const allow_duplicate =
			this.controls
				.allow_duplicate_operation_no;


		const blocked =
			this.controls
				.is_blocked_operation;


		if (
			!operation_no
			||
			!allow_duplicate
			||
			!blocked
		) {
			return;
		}


		const is_blocked =
			Boolean(
				Number(
					blocked.get_value()
					|| 0
				)
			);


		const $status_badge =
			this.$body.find(
				".archive-status-badge"
			);


		// ========================================================
		// Blocked operation
		// ========================================================

		if (is_blocked) {

			// لا يوجد رقم عملية للعملية المحضورة.
			operation_no.set_value(
				""
			);


			// السماح بالتكرار لا معنى له هنا.
			allow_duplicate.set_value(
				0
			);

			this.hide_operation_number_suggestions();

			clearTimeout(
				this.operation_number_lookup_timer
			);

			this.operation_number_lookup_request_id++;


			this.reset_operation_number_context({
				clear_pending:
					false,
			});


			operation_no.df.reqd =
				0;

			operation_no.df.read_only =
				1;


			allow_duplicate.df.read_only =
				1;


			$status_badge.text(
				"محضورة"
			);
		}


		// ========================================================
		// Normal operation
		// ========================================================

		else {

			operation_no.df.reqd =
				1;

			operation_no.df.read_only =
				0;


			allow_duplicate.df.read_only =
				0;


			$status_badge.text(
				"معلقة"
			);
		}


		operation_no.refresh();

		allow_duplicate.refresh();
	}



	bind_operation_number_mode() {

		const blocked =
			this.controls
				.is_blocked_operation;


		if (!blocked) {
			return;
		}


		blocked.$input
			.off(
				".archiveOperationMode"
			)
			.on(
				"change.archiveOperationMode",
				() => {

					this.update_operation_number_mode();
				}
			);


		this.update_operation_number_mode();
	}

	place_operation_number_suggestions() {

		const operation_no =
			this.controls.operation_no;


		if (
			!operation_no
			||
			!operation_no.$wrapper
		) {
			return;
		}


		const $suggestions =
			this.$body.find(
				".archive-operation-number-suggestions"
			);


		/*
		* ننقلها فعلياً لتصبح مباشرة
		* أسفل حقل رقم العملية،
		* وقبل خياري التكرار والمحضورة.
		*/
		operation_no.$wrapper.after(
			$suggestions
		);
	}


	render_operation_number_suggestions() {

		const $container =
			this.$body.find(
				".archive-operation-number-suggestions"
			);


		const suggestions =
			this.operation_number_suggestions;


		if (
			!Array.isArray(
				suggestions
			)
			||
			!suggestions.length
		) {

			$container
				.hide()
				.empty();

			return;
		}


		const html =
			suggestions
				.map(
					(
						item,
						index
					) => {

						const is_active =
							index
							===
							this.operation_number_suggestion_index;


						const operation_no =
							String(
								item.value
								|| ""
							);


						const parts_count =
							Number(
								item.parts_count
								|| 0
							);


						const documents_count =
							Number(
								item.documents_count
								|| 0
							);


						return `
							<button
								type="button"
								class="
									archive-operation-number-suggestion
									${is_active ? "is-active" : ""}
								"
								data-index="${index}"
							>

								<span
									class="archive-operation-number-suggestion-value"
								>
									${frappe.utils.escape_html(
										operation_no
									)}
								</span>


								<span
									class="archive-operation-number-suggestion-meta"
								>
									${parts_count} أجزاء
									·
									${documents_count} مستندات
								</span>

							</button>
						`;
					}
				)
				.join("");


		$container
			.html(
				html
			)
			.show();


		/*
		* mousedown بدلاً من click فقط،
		* حتى لا يفقد input الـfocus
		* قبل اختيار العنصر.
		*/
		$container
			.find(
				".archive-operation-number-suggestion"
			)
			.off(
				"mousedown.archiveOperationSuggestion"
			)
			.on(
				"mousedown.archiveOperationSuggestion",
				(event) => {

					event.preventDefault();


					const index =
						Number(
							$(
								event.currentTarget
							)
							.data(
								"index"
							)
						);


					this.select_operation_number_suggestion(
						index
					);
				}
			);
	}


	
	async select_operation_number_suggestion(
		index
	) {

		const item =
			this.operation_number_suggestions[
				index
			];


		if (!item) {
			return;
		}


		const value =
			String(
				item.value || ""
			).trim();


		if (!value) {
			return;
		}


		const current_value =
			this.get_operation_number_input_value();


		// ========================================================
		// الانتقال من رقم إلى رقم مختلف
		//
		// المستندات Pending للرقم السابق لا تنتقل.
		// Extraction لا يتأثر.
		// ========================================================

		if (
			current_value
			!==
			value
		) {

			this.reset_operation_number_context({
				clear_pending:
					true,
			});
		}


		await this.controls.operation_no.set_value(
			value
		);


		this.controls.operation_no.$input.val(
			value
		);


		clearTimeout(
			this.operation_number_lookup_timer
		);


		/*
		* هذه المرة ليست مجرد كتابة.
		*
		* المستخدم اختار الرقم صراحة،
		* لذلك نثبت Context العملية الموجودة.
		*/
		await this.fetch_operation_number_lookup(
			value,
			{
				commit_exact:
					true,
			}
		);


		this.hide_operation_number_suggestions();
	}

	hide_operation_number_suggestions() {

		this.operation_number_suggestion_index =
			-1;


		this.$body
			.find(
				".archive-operation-number-suggestions"
			)
			.hide();
	}

	


	make_dialog() {
		this.dialog = new frappe.ui.Dialog({
			title: __("إنشاء عملية جديدة"),
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "operation_body",
				},
			],
			primary_action_label: __("حفظ العملية"),
			primary_action: () => this.save(),
			secondary_action_label: __("إلغاء"),
            secondary_action: () => this.cancel(),
		});

		this.dialog.$wrapper.addClass("archive-operation-dialog");
	}

	show() {

		this.dialog.show();
		this.bind_operation_number_mode();
		this.bind_operation_number_lookup();
		this.bind_customer_rate_mode();
		this.render_shared_documents();
	}

	render() {
		this.$body =
			this.dialog.fields_dict.operation_body.$wrapper;

		this.$body.html(`
			<div class="archive-operation-form" dir="rtl">

				<!-- Extraction -->
				<section class="archive-form-section">
					<div class="archive-section-header">
						<div>
							<h3>استخراج البيانات من المستند</h3>
							<p>
								اختياري — يمكنك تجاهل هذه الخطوة وإدخال جميع البيانات يدوياً
							</p>
						</div>

						<span class="archive-optional-badge">
							اختياري
						</span>
					</div>

					<div class="archive-extraction-layout">

						<div class="archive-extraction-dropzone">
							<input
								type="file"
								class="archive-extraction-input"
								accept="application/pdf"
								hidden
							>

							<div class="archive-upload-icon">↑</div>

							<div>
								<div class="archive-upload-title">
									اسحب ملف PDF هنا
								</div>

								<div class="archive-upload-help">
									أو اضغط لاختيار الملف
								</div>
							</div>
						</div>

						<div class="archive-extraction-file">
							<div class="archive-no-extraction">
								لم يتم اختيار ملف
							</div>
						</div>

					</div>
				</section>

				<!-- Operation identity + shared documents -->
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

						<!-- Operation number -->
						<div class="archive-operation-identity-panel">

							<div class="archive-operation-number-fields">
							</div>


							<div
								class="archive-operation-number-suggestions"
								style="display:none;"
							></div>


							<div
								class="archive-operation-context-info"
								style="display:none;"
							></div>

						</div>


						<!-- Shared documents -->
						<div class="archive-shared-documents-panel">

							<div class="archive-shared-documents-header">

								<div>
									<div class="archive-shared-documents-title">
										مستندات العملية
									</div>

									<div class="archive-shared-documents-help">
										الفاتورة، الإشعار السابق، والمستندات المشتركة
									</div>
								</div>

								<div class="archive-shared-documents-counter">
									0 / 10
								</div>

							</div>


							<div class="archive-shared-documents-dropzone">

								<input
									type="file"
									class="archive-shared-documents-input"
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


								<div class="archive-upload-icon">
									＋
								</div>


								<div>
									<div class="archive-upload-title">
										إضافة مستندات
									</div>

									<div class="archive-upload-help">
										اسحب الملفات هنا أو اضغط للاختيار
									</div>
								</div>

							</div>


							<div class="archive-shared-documents-list">
							</div>

						</div>

					</div>

				</section>


				<!-- Main Data -->
				<section class="archive-form-section">

					<div class="archive-section-header">
						<div>
							<h3>بيانات العملية</h3>
							<p>بيانات العملية الأساسية</p>
						</div>

						<span class="archive-status-badge">
							معلقة
						</span>
					</div>

					<div class="archive-fields-grid archive-main-fields"></div>

				</section>


				<!-- Beneficiary -->
				<section class="archive-form-section">

					<div class="archive-section-header">
						<div>
							<h3>بيانات المستفيد</h3>
							<p>بيانات المستفيد والحساب والبنك</p>
						</div>
					</div>

					<div class="archive-fields-grid archive-beneficiary-fields"></div>

				</section>


				<!-- Sender -->
				<section class="archive-form-section">

					<div class="archive-section-header">
						<div>
							<h3>بيانات التحويل والمرسل</h3>
							<p>بيانات الحساب والتواريخ والمرجع</p>
						</div>
					</div>

					<div class="archive-fields-grid archive-sender-fields"></div>

				</section>


				<!-- Notes -->
				


				<!-- Attachments -->
				

			</div>
		`);

		this.make_controls();
		this.bind_upload_events();
		this.render_shared_documents();
	}


	make_controls() {
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

					reqd:
						1,
				},

				{
					fieldname:
						"allow_duplicate_operation_no",

					label:
						"السماح بتكرار رقم العملية",

					fieldtype:
						"Check",

					default:
						0,

					description:
						"فعّل هذا الخيار إذا كانت العملية جزءاً إضافياً من رقم موجود.",
				},

				{
					fieldname:
						"is_blocked_operation",

					label:
						"عملية محضورة",

					fieldtype:
						"Check",

					default:
						0,

					description:
						"عند التفعيل تُنشأ العملية مباشرة بالحالة محضورة بدون رقم عملية.",
				},
			]
		);
		this.make_group_controls(
			".archive-main-fields",
			[
				{
                    fieldname: "customer",
                    label: "اسم العميل",
                    fieldtype: "Link",
                    options: "Archive Customer",
					reqd:
						1,
                },
				{
					fieldname: "amount",
					label: "المبلغ",
					fieldtype: "Currency",
					reqd:
						1,
				},
				{
					fieldname: "currency",
					label: "العملة",
					fieldtype: "Link",
					options: "Currency",
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
                    fieldname: "from_account",
                    label: "عن طريق",
                    fieldtype: "Link",
                    options: "Archive Account",
					reqd:
						1,
                },
				{
					fieldname: "request_date",
					label: "تاريخ الطلب",
					fieldtype: "Date",
					default: frappe.datetime.get_today(),
				},
				{
					fieldname:
						"user_notes",

					label:
						"ملاحظات المستخدم",

					fieldtype:
						"Data",
				},
				
			]
		);

		this.make_group_controls(
			".archive-beneficiary-fields",
			[
				{
					fieldname: "beneficiary_name",
					label: "اسم المستفيد",
					fieldtype: "Data",
					reqd:
						1,
				},
				{
					fieldname: "beneficiary_account",
					label: "رقم حساب المستفيد",
					fieldtype: "Data",
					reqd:
						1,
				},
				{
					fieldname: "beneficiary_bank",
					label: "اسم بنك المستفيد",
					fieldtype: "Data",
					reqd:
						1,
				},
				{
					fieldname:
						"swift_code",

					fieldtype:
						"Autocomplete",

					label:
						__("رمز السويفت"),

					placeholder:
						__("اكتب رمز السويفت أو اختر من الاقتراحات"),

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
					fieldname: "country",
					label: "الجهة (الدولة)",
					fieldtype: "Link",
					options: "Country",
					reqd:
						1,
				},
			]
		);

		this.make_group_controls(
			".archive-sender-fields",
			[
				{
					fieldname: "sender_name",
					label: "اسم المرسل",
					fieldtype: "Data",
					reqd:
						1,
				},
				{
					fieldname: "sender_account",
					label: "رقم حساب المرسل",
					fieldtype: "Data",
					reqd:
						1,
				},
				{
					fieldname: "execution_datetime",
					label: "تاريخ تنفيذ العملية",
					fieldtype: "Datetime",
				},
				{
                    fieldname: "transferring_bank",
                    label: "اسم البنك المحول",
                    fieldtype: "Link",
                    options: "Archive Bank",
					reqd:
						1,
                },
				
                
				{
					fieldname: "reference_no",
					label: "رقم المرجع",
					fieldtype: "Data",
					reqd:
						1,
				},
                {
					fieldname: "bank_transfer_rate",
					label: "سعر البنك المحول",
					fieldtype: "Float",
					precision: 6,
					reqd:
						1,
				},
                {
                    fieldname: "notes",
                    label: "ملاحظات",
                    fieldtype: "Data",
                },
			]
		);

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
				normalized
				===
				"بدون عمولة"
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


			if (!control?.$input) {
				return;
			}


			control.df.read_only =
				read_only
					? 1
					: 0;


			control.$input.prop(
				"readonly",
				Boolean(
					read_only
				)
			);
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


			const currency =
				String(
					rate_currency_value
					??
					rate_currency.$input?.val()
					??
					""
				).trim();


			const type =
				String(
					rate_type_value
					??
					rate_type.$input?.val()
					??
					""
				).trim();


			const amount =
				rate_amount_value
				??
				rate_amount.get_value();


			const previous_currency =
				this.customer_rate_last_currency;


			if (
				previous_currency
				===
				"سعودي"
				&&
				currency
				!==
				"سعودي"
			) {

				this.customer_rate_manual_value =
					String(
						rate.$input?.val()
						??
						rate.get_value()
						??
						""
					);
			}


			this.customer_rate_last_currency =
				currency;


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
					// No type selected yet
					// ================================================

					if (!type) {

						rate_amount.df.hidden =
							1;

						rate_amount.df.reqd =
							0;

						rate_amount.$wrapper.hide();


						await rate.set_value(
							""
						);


						return;
					}


					// ================================================
					// Without commission
					// ================================================

					if (
						type
						===
						"بدون"
					) {

						rate_amount.df.hidden =
							1;

						rate_amount.df.reqd =
							0;

						rate_amount.$wrapper.hide();


						if (
							rate_amount.get_value()
						) {

							await rate_amount.set_value(
								null
							);
						}


						await rate.set_value(
							"بدون عمولة"
						);


						return;
					}
					// ================================================
					// Without commission
					// ================================================

					if (
						type
						===
						"بدل حوالة مرتجعة"
					) {

						rate_amount.df.hidden =
							1;

						rate_amount.df.reqd =
							0;

						rate_amount.$wrapper.hide();


						if (
							rate_amount.get_value()
						) {

							await rate_amount.set_value(
								null
							);
						}


						await rate.set_value(
							"بدل حوالة مرتجعة"
						);


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


					await rate.set_value(
						this.get_dollar_customer_rate_value(
							type,
							amount
						)
					);


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
						rate_type.get_value()
					) {

						await rate_type.set_value(
							""
						);
					}


					if (
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
					rate_currency.$input?.val()
					|| ""
				).trim();


			// ========================================================
			// Type
			// ========================================================

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
								rate_currency.$input?.val()
								|| "",

							rate_amount_value:
								rate_amount.get_value(),
						});
					}
				);


			// ========================================================
			// Currency
			// ========================================================

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
								rate_type.$input?.val()
								|| "",

							rate_amount_value:
								rate_amount.get_value(),
						});
					}
				);


			// ========================================================
			// Dollar amount
			// ========================================================

			rate_amount.$input
				.off(
					".archiveCustomerRate"
				)
				.on(
					"input.archiveCustomerRate change.archiveCustomerRate",
					(event) => {

						this.update_customer_rate_mode({
							rate_currency_value:
								rate_currency.$input?.val()
								|| "",

							rate_type_value:
								rate_type.$input?.val()
								|| "",

							rate_amount_value:
								event.currentTarget.value,
						});
					}
				);


			// ========================================================
			// Manual Saudi value
			// ========================================================

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
								rate_currency.$input?.val()
								|| ""
							).trim();


						if (
							currency
							===
							"سعودي"
						) {

							this.customer_rate_manual_value =
								String(
									rate.$input.val()
									|| ""
								);
						}
					}
				);


			this.update_customer_rate_mode({
				rate_currency_value:
					rate_currency.$input?.val()
					|| "",

				rate_type_value:
					rate_type.$input?.val()
					|| "",

				rate_amount_value:
					rate_amount.get_value(),
			});
		}

	make_group_controls(selector, definitions) {
		const $parent = this.$body.find(selector);

		definitions.forEach((df) => {
			const $slot = $('<div class="archive-field-slot"></div>');
			$parent.append($slot);

			this.make_control($slot, df);
		});
	}


	make_control($parent, df) {
		const control = frappe.ui.form.make_control({
			parent: $parent,
			df: df,
			render_input: true,
		});

		control.refresh();

		if (df.default !== undefined) {
			control.set_value(df.default);
		}

		this.controls[df.fieldname] = control;

		return control;
	}


		bind_upload_events() {

			const extraction_input =
				this.$body.find(
					".archive-extraction-input"
				)[0];

			const shared_documents_input =
				this.$body.find(
					".archive-shared-documents-input"
				)[0];


			// ========================================================
			// Extraction file
			// ========================================================

			this.$body
				.find(
					".archive-extraction-dropzone"
				)
				.off(
					"click.archiveExtraction"
				)
				.on(
					"click.archiveExtraction",
					() => {
						extraction_input?.click();
					}
				);


			if (extraction_input) {

				$(extraction_input)
					.off(
						"change.archiveExtraction"
					)
					.on(
						"change.archiveExtraction",
						() => {

							const file =
								extraction_input
									.files?.[0];


							if (file) {
								this.set_extraction_file(
									file
								);
							}


							extraction_input.value =
								"";
						}
					);
			}


			this.enable_dropzone(
				this.$body.find(
					".archive-extraction-dropzone"
				),

				(files) => {

					const pdf =
						files.find(
							(file) =>
								file.type
									=== "application/pdf"
								||
								file.name
									.toLowerCase()
									.endsWith(
										".pdf"
									)
						);


					if (!pdf) {

						frappe.msgprint(
							__(
								"ملف استخراج البيانات يجب أن يكون PDF."
							)
						);

						return;
					}


					this.set_extraction_file(
						pdf
					);
				}
			);


			// ========================================================
			// Shared operation documents
			// ========================================================

			this.$body
				.find(
					".archive-shared-documents-dropzone"
				)
				.off(
					"click.archiveSharedDocuments"
				)
				.on(
					"click.archiveSharedDocuments",
					() => {
						shared_documents_input
							?.click();
					}
				);


			if (shared_documents_input) {

				$(shared_documents_input)
					.off(
						"change.archiveSharedDocuments"
					)
					.on(
						"change.archiveSharedDocuments",
						() => {

							const files =
								Array.from(
									shared_documents_input
										.files
									|| []
								);


							if (files.length) {
								this.add_shared_files(
									files
								);
							}


							shared_documents_input.value =
								"";
						}
					);
			}


			this.enable_dropzone(
				this.$body.find(
					".archive-shared-documents-dropzone"
				),

				(files) => {

					if (!files.length) {
						return;
					}


					this.add_shared_files(
						files
					);
				}
			);
		}


		

		render_operation_context() {

			const $container =
				this.$body.find(
					".archive-operation-context-info"
				);


			const context =
				this.operation_group_context;


			if (
				!context
				||
				!context.exists
			) {

				$container
					.hide()
					.empty();

				return;
			}


			$container
				.html(`
					<div class="archive-existing-operation-info">

						<span>
							✓ رقم عملية موجود مسبقاً
						</span>

						<span>
							${Number(
								context.parts_count
								|| 0
							)} أجزاء
						</span>

						<span>
							${Number(
								context.documents_count
								|| 0
							)} مستندات
						</span>

					</div>
				`)
				.show();
		}
	
	
		


	enable_dropzone($zone, callback) {
		$zone.on("dragover", (event) => {
			event.preventDefault();
			event.stopPropagation();

			$zone.addClass("is-dragging");
		});

		$zone.on("dragleave", (event) => {
			event.preventDefault();
			event.stopPropagation();

			$zone.removeClass("is-dragging");
		});

		$zone.on("drop", (event) => {
			event.preventDefault();
			event.stopPropagation();

			$zone.removeClass("is-dragging");

			const files =
				Array.from(
					event.originalEvent.dataTransfer.files || []
				);

			callback(files);
		});
		}


		file_key(file) {
		return [
			file.name,
			file.size,
			file.lastModified,
		].join("::");
		}


		set_extraction_file(file) {
		this.extraction_file = file;
		this.render_extraction_file();
		// this.add_attachments([file]);
		// this.render_attachments();
		}


		render_extraction_file() {
		const $container =
			this.$body.find(".archive-extraction-file");

		if (!this.extraction_file) {
			$container.html(`
				<div class="archive-no-extraction">
					لم يتم اختيار ملف
				</div>
			`);
			return;
		}

		$container.html(`
			<div class="archive-selected-extraction">

				<div class="archive-file-info">
					<div class="archive-file-icon">
						PDF
					</div>

					<div>
						<div class="archive-file-name">
							${frappe.utils.escape_html(
								this.extraction_file.name
							)}
						</div>

						<div class="archive-file-size">
							${this.format_size(
								this.extraction_file.size
							)}
						</div>
					</div>
				</div>

				<div class="archive-extraction-actions">

					<button
						type="button"
						class="btn btn-primary btn-sm archive-extract-data">
						استخراج البيانات
					</button>

					<button
						type="button"
						class="btn btn-default btn-sm archive-remove-extraction">
						إزالة
					</button>

				</div>

			</div>
		`);

		$container
			.find(
				".archive-remove-extraction"
			)
			.on(
				"click",
				() => {

					this.extraction_file =
						null;

					this.render_extraction_file();
				}
			);


		$container
			.find(".archive-extract-data")
			.on("click", () => {
				this.extract_data();
			});
	}



	file_extension(file) {
		const parts = file.name.split(".");

		if (parts.length < 2) {
			return "FILE";
		}

		return parts.pop().toUpperCase().slice(0, 4);
	}


	format_size(bytes) {
		if (!bytes) {
			return "0 KB";
		}

		if (bytes < 1024 * 1024) {
			return `${(bytes / 1024).toFixed(1)} KB`;
		}

		return `${(
			bytes /
			(1024 * 1024)
		).toFixed(2)} MB`;
	}

    
	async upload_file(file) {

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


		form_data.append(
			"total_file_size",
			String(
				file.size
			)
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
				"File upload failed:",
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

    async upload_file_once(file) {
        const key = this.file_key(file);

        if (this.uploaded_files.has(key)) {
            return this.uploaded_files.get(key);
        }

        const result =
            await this.upload_file(file);

        const uploaded = {
			file_id:
				result.name,
            file_url: result.file_url,
            file_name:
                result.file_name || file.name,
        };

        this.uploaded_files.set(
            key,
            uploaded
        );

        return uploaded;
    }

    
	async cleanup_uploaded_files(
			uploaded
		) {

			if (!uploaded?.length) {
				return;
			}


			const file_ids =
				uploaded
					.map(
						(item) =>
							item.file_id
					)
					.filter(
						Boolean
					);


			if (!file_ids.length) {
				return;
			}


			try {

				await frappe.call({

					method:
						"archive.api.operations.delete_temporary_files",

					args: {
						file_ids:
							file_ids,
					},
				});

			}

			catch (error) {

				console.error(
					"Temporary file cleanup failed:",
					error
				);
			}
		}
	get_values() {
		const values = {};

		Object.entries(this.controls).forEach(
			([fieldname, control]) => {
				values[fieldname] =
					control.get_value();
			}
		);

		return values;
	}


    async extract_data() {
        if (!this.extraction_file) {
            return;
        }

        const $button =
            this.$body.find(
                ".archive-extract-data"
            );

        const old_text =
            $button.text();

        $button
            .prop("disabled", true)
            .text("جاري الاستخراج...");

        try {
            /*
            * رفع الملف مرة واحدة فقط.
            * إذا كان سبق رفعه نستخدم نفس File.
            */
            const uploaded =
                await this.upload_file_once(
                    this.extraction_file
                );

            const response =
                await frappe.call({
                    method:
                        "archive.api.pdf_parser.extract_operation_data",

                    type: "POST",

                    args: {
                        file_url:
                            uploaded.file_url,
                    },
                });

            const data =
                response.message?.data || {};

            let extracted_count = 0;

            for (
                const [fieldname, value]
                of Object.entries(data)
            ) {
                const control =
                    this.controls[fieldname];

                /*
                * إذا رجع الـParser حقلاً
                * غير موجود في الـDialog نتجاهله.
                */
                if (!control) {
                    continue;
                }

                /*
                * لا نمسح أي قيمة يدوية
                * إذا لم يستخرج PDF قيمة.
                */
                if (
                    value === null ||
                    value === undefined ||
                    value === ""
                ) {
                    continue;
                }

                await control.set_value(value);

                extracted_count++;
            }

			this.update_operation_number_mode();
			

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

                return;
            }

            frappe.show_alert({
                message:
                    `تم استخراج ${extracted_count} حقول من المستند`,
                indicator: "green",
            });

        } catch (error) {
            console.error(
                "PDF extraction failed:",
                error
            );

            frappe.msgprint({
                title:
                    __("تعذر استخراج البيانات"),

                message:
                    error?.message
                    || __(
                        "حدث خطأ أثناء قراءة ملف PDF."
                    ),

                indicator:
                    "red",
            });

        } finally {
            $button
                .prop("disabled", false)
                .text(old_text);
        }
    }

	async upload_operation_files() {

		const uploaded = [];

		const shared_documents = [];

		let extraction_source_file =
			null;

		let extraction_file_id =
			null;


		// ========================================================
		// Extraction source
		// ========================================================

		if (this.extraction_file) {

			const item =
				await this.upload_file_once(
					this.extraction_file
				);


			extraction_source_file =
				item.file_url;
			extraction_file_id =
				item.file_id;


			uploaded.push(
				item
			);
		}


		// ========================================================
		// NEW shared documents only
		// ========================================================

		for (
			const file
			of this.pending_shared_files
		) {

			const item =
				await this.upload_file_once(
					file
				);


			shared_documents.push(
				item
			);


			const exists =
				uploaded.some(
					(row) =>
						row.file_id
						===
						item.file_id
				);


			if (!exists) {
				uploaded.push(
					item
				);
			}
		}


		return {
			uploaded,
			shared_documents,
			extraction_source_file,
			extraction_file_id,
		};
	}

    async cancel() {
        const uploaded =
            Array.from(
                this.uploaded_files.values()
            );

        if (uploaded.length) {
            await this.cleanup_uploaded_files(
                uploaded
            );

            this.uploaded_files.clear();
        }

        this.dialog.hide();
    }

	validate_operation_number_mode(
		values
	) {

		const is_blocked =
			Boolean(
				Number(
					values
						.is_blocked_operation
					|| 0
				)
			);


		const allow_duplicate =
			Boolean(
				Number(
					values
						.allow_duplicate_operation_no
					|| 0
				)
			);


		const operation_no =
			String(
				values.operation_no
				|| ""
			).trim();


		// ========================================================
		// Blocked
		// ========================================================

		if (is_blocked) {

			values.operation_no =
				null;

			values.allow_duplicate_operation_no =
				0;

			return true;
		}


		// ========================================================
		// Normal
		// ========================================================

		if (!operation_no) {

			frappe.msgprint({
				title:
					__("رقم العملية مطلوب"),

				message:
					__(
						"أدخل رقم العملية قبل حفظ العملية."
					),

				indicator:
					"orange",
			});


			return false;
		}


		values.operation_no =
			operation_no;


		values.allow_duplicate_operation_no =
			allow_duplicate
				? 1
				: 0;


		values.is_blocked_operation =
			0;


		return true;
	}
	


	

	validate_customer_rate_mode(
			values
		) {

			const rate_currency =
				String(
					values.customer_rate_currency
					|| ""
				).trim();


			const rate_type =
				String(
					values.customer_rate_type
					|| ""
				).trim();


			if (!rate_currency) {

				frappe.msgprint({
					title:
						__("عملة سعر العميل مطلوبة"),

					message:
						__(
							"اختر عملة سعر العميل: دولار أو سعودي."
						),

					indicator:
						"orange",
				});


				return false;
			}


			values.customer_rate_currency =
				rate_currency;


			// ========================================================
			// Saudi
			// ========================================================

			if (
				rate_currency
				===
				"سعودي"
			) {

				values.customer_rate_type =
					null;

				values.customer_rate_amount =
					null;


				return true;
			}


			// ========================================================
			// Dollar
			// ========================================================

			if (!rate_type) {

				frappe.msgprint({
					title:
						__("نوع العمولة مطلوب"),

					message:
						__(
							"عند اختيار الدولار اختر نوع العمولة:  له أو عليه أو بدون أو بدل حوالة مرتجعة"
						),

					indicator:
						"orange",
				});


				return false;
			}


			values.customer_rate_type =
				rate_type;


			// ========================================================
			// Without commission
			// ========================================================

			if (
				rate_type
				===
				"بدون"
			) {

				values.customer_rate_amount =
					null;

				values.customer_rate =
					"بدون عمولة";


				return true;
			}
			if (
				rate_type
				===
				"بدل حوالة مرتجعة"
			) {

				values.customer_rate_amount =
					null;

				values.customer_rate =
					"بدل حوالة مرتجعة";


				return true;
			}


			// ========================================================
			// له / عليه require amount
			// ========================================================

			const amount =
				Number(
					values.customer_rate_amount
				);


			if (
				!Number.isFinite(
					amount
				)
				||
				amount <= 0
			) {

				frappe.msgprint({
					title:
						__("مبلغ التسعير مطلوب"),

					message:
						__(
							"أدخل مبلغ تسعير أكبر من صفر عند اختيار له أو عليه."
						),

					indicator:
						"orange",
				});


				return false;
			}


			values.customer_rate_amount =
				amount;


			values.customer_rate =
				this.get_dollar_customer_rate_value(
					rate_type,
					amount
				);


			return true;
		}

	
	validate_required_fields() {

		const missing = [];


		for (
			const [fieldname, control]
			of Object.entries(
				this.controls
			)
		) {

			if (
				!control
				||
				!control.df
			) {
				continue;
			}


			/*
			* الحقل غير الإجباري لا يهمنا.
			*/
			if (
				!control.df.reqd
			) {
				continue;
			}


			/*
			* الحقول المخفية شرطياً لا نفحصها.
			*
			* مثال:
			* customer_rate_type عند السعودي.
			*/
			if (
				control.df.hidden
			) {
				continue;
			}


			const value =
				control.get_value();


			const is_empty =
				value === null
				||
				value === undefined
				||
				(
					typeof value === "string"
					&&
					!value.trim()
				);


			if (!is_empty) {
				continue;
			}


			missing.push({
				fieldname:
					fieldname,

				label:
					control.df.label
					|| fieldname,

				control:
					control,
			});
		}


		if (!missing.length) {
			return true;
		}


		const labels =
			missing
				.map(
					(item) =>
						`<li>${frappe.utils.escape_html(
							item.label
						)}</li>`
				)
				.join("");


		frappe.msgprint({
			title:
				__("حقول مطلوبة"),

			message:
				`
					<div>
						يرجى تعبئة الحقول التالية قبل حفظ العملية:
					</div>

					<ul style="margin-top: 10px;">
						${labels}
					</ul>
				`,

			indicator:
				"orange",
		});


		/*
		* نذهب لأول حقل ناقص.
		*/
		const first =
			missing[0];


		if (
			first.control?.$input
		) {

			first.control.$input.trigger(
				"focus"
			);
		}


		return false;
	}
	
	async save() {

		const values =
			this.get_values();


		if (
			!this.validate_operation_number_mode(
				values
			)
		) {
			return;
		}


		if (
			!this.validate_customer_rate_mode(
				values
			)
		) {
			return;
		}


		if (
			!this.validate_required_fields()
		) {
			return;
		}


		const primary_button =
			this.dialog.get_primary_btn();

		// 


		primary_button.prop(
			"disabled",
			true
		);


		try {

			const upload_result =
				await this.upload_operation_files();


			const response =
				await frappe.call({

					method:
						"archive.api.operations.create_operation",

					type:
						"POST",

					args: {

						values:
							values,

						shared_documents:
							upload_result
								.shared_documents,

						extraction_source_file:
							upload_result
								.extraction_source_file,
						extraction_file_id:
							upload_result.extraction_file_id,
					},
				});


			const operation =
				response.message;


			/*
			* ننظف أي Upload قديم لم يعد مستخدماً.
			*
			* الملفات التي أصبحت مرتبطة بمستند
			* لن يحذفها delete_temporary_files.
			*/
			const all_uploaded =
				Array.from(
					this.uploaded_files.values()
				);


			if (all_uploaded.length) {

				await this.cleanup_uploaded_files(
					all_uploaded
				);
			}


			this.uploaded_files.clear();


			this.dialog.hide();


			frappe.show_alert({
				message:
					`تم إنشاء العملية ${operation.name}`,

				indicator:
					"green",
			});


			setTimeout(
				() => {
					location.reload();
				},
				500
			);

		} catch (error) {

			/*
			* نحذف فقط Uploads المؤقتة من Frappe.
			*
			* لكن لا نمس File objects المحلية:
			*
			* this.extraction_file
			* this.pending_shared_files
			*
			* لذلك إذا كان الخطأ:
			* "رقم العملية موجود"
			*
			* يفعل المستخدم خيار التكرار
			* ويضغط حفظ مرة أخرى.
			*/
			const all_uploaded =
				Array.from(
					this.uploaded_files.values()
				);


			if (all_uploaded.length) {

				await this.cleanup_uploaded_files(
					all_uploaded
				);
			}


			this.uploaded_files.clear();


			console.error(
				"Archive operation save failed:",
				error
			);


			frappe.msgprint({
				title:
					__("تعذر حفظ العملية"),

				message:
					error?.message
					||
					__(
						"حدث خطأ أثناء حفظ العملية."
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
};
