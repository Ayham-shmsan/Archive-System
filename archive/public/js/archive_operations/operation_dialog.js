frappe.provide("archive.ui");

archive.ui.OperationDialog = class OperationDialog {
	constructor() {
        this.attachments = [];
        this.extraction_file = null;
        this.controls = {};

        this.uploaded_files = new Map();

        this.make_dialog();
        this.render();
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
            secondary_action: () => this.dialog.hide(),
		});

		this.dialog.$wrapper.addClass("archive-operation-dialog");
	}

	show() {
		this.dialog.show();
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


				<!-- Main Data -->
				<section class="archive-form-section">

					<div class="archive-section-header">
						<div>
							<h3>بيانات العملية</h3>
							<p>بيانات العملية الأساسية</p>
						</div>

						<span class="archive-status-badge">
							غير مؤكدة
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
				<section class="archive-form-section archive-attachments-section">

					<div class="archive-section-header">
						<div>
							<h3>
								المرفقات
								<span class="archive-required-star">*</span>
							</h3>

							<p>
								يمكن رفع عدة ملفات PDF أو صور للعملية
							</p>
						</div>

						<div class="archive-attachment-counter">
							0 مرفق
						</div>
					</div>


					<div class="archive-attachments-dropzone">

						<input
							type="file"
							class="archive-attachments-input"
							accept="application/pdf,image/*"
							multiple
							hidden
						>

						<div class="archive-upload-icon">＋</div>

						<div>
							<div class="archive-upload-title">
								إضافة مرفقات
							</div>

							<div class="archive-upload-help">
								اسحب الملفات هنا أو اضغط للاختيار
							</div>
						</div>

					</div>


					<div class="archive-attachments-list"></div>

				</section>

			</div>
		`);

		this.make_controls();
		this.bind_upload_events();
		this.render_attachments();
	}


	make_controls() {
		this.make_group_controls(
			".archive-main-fields",
			[
				{
					fieldname: "operation_no",
					label: "رقم العملية",
					fieldtype: "Data",
				},
				{
                    fieldname: "customer",
                    label: "اسم العميل",
                    fieldtype: "Link",
                    options: "Archive Customer",
                },
				{
					fieldname: "amount",
					label: "المبلغ",
					fieldtype: "Currency",
				},
				{
					fieldname: "currency",
					label: "العملة",
					fieldtype: "Link",
					options: "Currency",
				},
				{
					fieldname: "customer_rate",
					label: "سعر العميل",
					fieldtype: "Float",
					precision: 6,
				},
                {
                    fieldname: "from_account",
                    label: "عن طريق",
                    fieldtype: "Link",
                    options: "Archive Account"
                },
				{
					fieldname: "request_date",
					label: "تاريخ الطلب",
					fieldtype: "Date",
					default: frappe.datetime.get_today(),
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
				},
				{
					fieldname: "beneficiary_account",
					label: "رقم حساب المستفيد",
					fieldtype: "Data",
				},
				{
					fieldname: "beneficiary_bank",
					label: "اسم بنك المستفيد",
					fieldtype: "Data",
				},
				{
					fieldname: "swift_code",
					label: "رمز SWIFT",
					fieldtype: "Data",
				},
				{
					fieldname: "country",
					label: "الجهة (الدولة)",
					fieldtype: "Link",
					options: "Country",
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
				},
				{
					fieldname: "sender_account",
					label: "رقم حساب المرسل",
					fieldtype: "Data",
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
                },
				
				// {
                //     fieldname: "from_account",
                //     label: "من حساب",
                //     fieldtype: "Link",
                //     options: "Archive Account",
                // },
                
				{
					fieldname: "reference_no",
					label: "رقم المرجع",
					fieldtype: "Data",
				},
                {
					fieldname: "bank_transfer_rate",
					label: "سعر البنك المحول",
					fieldtype: "Float",
					precision: 6,
				},
                {
                    fieldname: "notes",
                    label: "ملاحظات",
                    fieldtype: "Data",
                },
			]
		);

		// this.make_control(
		// 	this.$body.find(".archive-notes-field"),
		// 	{
		// 		fieldname: "notes",
		// 		label: "ملاحظات",
		// 		fieldtype: "Small Text",
		// 	}
		// );
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
			this.$body.find(".archive-extraction-input")[0];

		const attachments_input =
			this.$body.find(".archive-attachments-input")[0];


		this.$body
			.find(".archive-extraction-dropzone")
			.on("click", () => extraction_input.click());

		this.$body
			.find(".archive-attachments-dropzone")
			.on("click", () => attachments_input.click());


		$(extraction_input).on("change", () => {
			const file = extraction_input.files?.[0];

			if (file) {
				this.set_extraction_file(file);
			}

			extraction_input.value = "";
		});


		$(attachments_input).on("change", () => {
			const files =
				Array.from(attachments_input.files || []);

			this.add_attachments(files);

			attachments_input.value = "";
		});


		this.enable_dropzone(
			this.$body.find(".archive-extraction-dropzone"),
			(files) => {
				const pdf =
					files.find(
						(file) =>
							file.type === "application/pdf" ||
							file.name.toLowerCase().endsWith(".pdf")
					);

				if (!pdf) {
					frappe.msgprint(
						__("ملف استخراج البيانات يجب أن يكون PDF.")
					);
					return;
				}

				this.set_extraction_file(pdf);
			}
		);


		this.enable_dropzone(
			this.$body.find(".archive-attachments-dropzone"),
			(files) => {
				this.add_attachments(files);
			}
		);
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

		/*
		 * ملف الاستخراج يصبح تلقائياً
		 * واحداً من مرفقات العملية.
		 */
		this.add_attachments([file]);

		this.render_extraction_file();
		this.render_attachments();
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
			.find(".archive-remove-extraction")
			.on("click", () => {
				/*
				 * إزالة صفة "ملف استخراج"
				 * لا تحذفه من المرفقات.
				 */
				this.extraction_file = null;

				this.render_extraction_file();
				this.render_attachments();
			});


		$container
			.find(".archive-extract-data")
			.on("click", () => {
				this.extract_data();
			});
	}


	add_attachments(files) {
		files.forEach((file) => {
			const key = this.file_key(file);

			const exists =
				this.attachments.some(
					(item) =>
						this.file_key(item) === key
				);

			if (!exists) {
				this.attachments.push(file);
			}
		});

		this.render_attachments();
	}


	remove_attachment(file) {
		const key = this.file_key(file);

		const is_extraction =
			this.extraction_file &&
			this.file_key(this.extraction_file) === key;

		if (is_extraction) {
			frappe.confirm(
				__(
					"هذا الملف مستخدم كمصدر لاستخراج البيانات. هل تريد إزالة ارتباطه وحذفه من المرفقات؟"
				),
				() => {
					this.extraction_file = null;

					this.attachments =
						this.attachments.filter(
							(item) =>
								this.file_key(item) !== key
						);

					this.render_extraction_file();
					this.render_attachments();
				}
			);

			return;
		}

		this.attachments =
			this.attachments.filter(
				(item) =>
					this.file_key(item) !== key
			);

		this.render_attachments();
	}


	render_attachments() {
		const $list =
			this.$body.find(".archive-attachments-list");

		const count = this.attachments.length;

		this.$body
			.find(".archive-attachment-counter")
			.text(
				count === 1
					? "1 مرفق"
					: `${count} مرفقات`
			);


		if (!count) {
			$list.html(`
				<div class="archive-no-attachments">
					لا توجد مرفقات مضافة حتى الآن
				</div>
			`);

			return;
		}


		const extraction_key =
			this.extraction_file
				? this.file_key(this.extraction_file)
				: null;


		$list.html(
			this.attachments
				.map((file, index) => {
					const key = this.file_key(file);

					const is_source =
						key === extraction_key;

					return `
						<div
							class="archive-attachment-item"
							data-index="${index}"
						>

							<div class="archive-file-info">

								<div class="archive-file-icon">
									${this.file_extension(file)}
								</div>

								<div>
									<div class="archive-file-name">
										${frappe.utils.escape_html(
											file.name
										)}
									</div>

									<div class="archive-file-size">
										${this.format_size(file.size)}
									</div>
								</div>

							</div>

							<div class="archive-attachment-actions">

								${
									is_source
										? `
											<span class="archive-source-badge">
												مصدر استخراج
											</span>
										`
										: ""
								}

								<button
									type="button"
									class="btn btn-default btn-sm archive-remove-attachment"
									data-index="${index}">
									حذف
								</button>

							</div>

						</div>
					`;
				})
				.join("")
		);


		$list
			.find(".archive-remove-attachment")
			.on("click", (event) => {
				const index =
					Number(
						$(event.currentTarget).data("index")
					);

				const file = this.attachments[index];

				if (file) {
					this.remove_attachment(file);
				}
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
		const form_data = new FormData();

		form_data.append(
			"file",
			file
		);

		form_data.append(
			"is_private",
			"1"
		);

		const response = await fetch(
			"/api/method/upload_file",
			{
				method: "POST",

				headers: {
					"X-Frappe-CSRF-Token":
						frappe.csrf_token,
				},

				body: form_data,
			}
		);

		const result =
			await response.json();

		if (
			!response.ok
			|| result.exc
			|| !result.message
		) {
			throw new Error(
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


	// async upload_all_attachments() {
	// 	const uploaded = [];
	// 	const key_to_uploaded = new Map();

	// 	for (
	// 		let index = 0;
	// 		index < this.attachments.length;
	// 		index++
	// 	) {
	// 		const file =
	// 			this.attachments[index];

	// 		const result =
	// 			await this.upload_file(file);

	// 		const item = {
	// 			file_url: result.file_url,
	// 			file_name:
	// 				result.file_name
	// 				|| file.name,
	// 		};

	// 		uploaded.push(item);

	// 		key_to_uploaded.set(
	// 			this.file_key(file),
	// 			item
	// 		);
	// 	}

	// 	let extraction_source_file = null;

	// 	if (this.extraction_file) {
	// 		const source =
	// 			key_to_uploaded.get(
	// 				this.file_key(
	// 					this.extraction_file
	// 				)
	// 			);

	// 		if (source) {
	// 			extraction_source_file =
	// 				source.file_url;
	// 		}
	// 	}

	// 	return {
	// 		uploaded,
	// 		extraction_source_file,
	// 	};
	// }
    async upload_all_attachments() {
        const uploaded = [];
        const key_to_uploaded = new Map();

        for (
            let index = 0;
            index < this.attachments.length;
            index++
        ) {
            const file =
                this.attachments[index];

            /*
            * إذا سبق رفع الملف أثناء الاستخراج
            * لن نرفعه مرة ثانية.
            */
            const item =
                await this.upload_file_once(file);

            uploaded.push(item);

            key_to_uploaded.set(
                this.file_key(file),
                item
            );
        }

        let extraction_source_file = null;

        if (this.extraction_file) {
            const source =
                key_to_uploaded.get(
                    this.file_key(
                        this.extraction_file
                    )
                );

            if (source) {
                extraction_source_file =
                    source.file_url;
            }
        }

        return {
            uploaded,
            extraction_source_file,
        };
    }


	async cleanup_uploaded_files(uploaded) {
		if (!uploaded?.length) {
			return;
		}

		try {
			await frappe.call({
				method:
					"archive.api.operations.delete_temporary_files",

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


	// extract_data() {
	// 	if (!this.extraction_file) {
	// 		return;
	// 	}

	// 	/*
	// 	 * سنربط هذا الزر لاحقاً
	// 	 * بـ PDF Parser الحقيقي.
	// 	 */
	// 	frappe.show_alert({
	// 		message: __(
	// 			"ملف الاستخراج جاهز. سيتم ربط محلل PDF في مرحلة الربط الخلفي."
	// 		),
	// 		indicator: "blue",
	// 	});
	// }
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
    async save() {
		if (!this.attachments.length) {
			frappe.msgprint({
				title: __("المرفقات مطلوبة"),
				message: __(
					"يجب إضافة مرفق واحد على الأقل قبل حفظ العملية."
				),
				indicator: "red",
			});

			return;
		}

		const values =
			this.get_values();

		const primary_button =
			this.dialog.get_primary_btn();

		primary_button.prop(
			"disabled",
			true
		);

		let uploaded = [];

		try {
			const upload_result =
				await this.upload_all_attachments();

			uploaded =
				upload_result.uploaded;

			const response =
				await frappe.call({
					method:
						"archive.api.operations.create_operation",

					type: "POST",

					args: {
						values:
							values,

						attachments:
							uploaded,

						extraction_source_file:
							upload_result
								.extraction_source_file,
					},
				});

			const operation =
				response.message;

			this.dialog.hide();

			frappe.show_alert({
				message:
					`تم إنشاء العملية ${operation.name}`,
				indicator: "green",
			});

			/*
			 * سنربطه في المرحلة التالية
			 * بتحديث قائمة العمليات من السيرفر.
			 */
			setTimeout(() => {
				location.reload();
			}, 500);

		} catch (error) {

			await this.cleanup_uploaded_files(
				uploaded
			);
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
					|| __(
						"حدث خطأ أثناء حفظ العملية."
					),

				indicator: "red",
			});

		} finally {
			primary_button.prop(
				"disabled",
				false
			);
		}
	}
};