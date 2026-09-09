frappe.provide("archive.ui");


archive.ui.FinalSwiftDialog =
class FinalSwiftDialog {

	constructor(
		operation_name,
		options = {}
	) {
		this.operation_name =
			operation_name;

		this.options =
			options || {};

		this.file = null;

		this.make_dialog();
		this.render();
	}


	make_dialog() {
		this.dialog =
			new frappe.ui.Dialog({
				title:
					`إرفاق السويفت النهائي - ${this.operation_name}`,

				fields: [
					{
						fieldtype:
							"HTML",

						fieldname:
							"final_swift_body",
					},
				],

				primary_action_label:
					__("حفظ"),

				primary_action:
					() => this.save(),

				secondary_action_label:
					__("إلغاء"),

				secondary_action:
					() => this.cancel(),
			});


		/*
		 * استخدام نفس CSS واجهة إنشاء العملية.
		 */
		this.dialog
			.$wrapper
			.addClass(
				"archive-operation-dialog"
			);
	}


	show() {
		this.dialog.show();
	}


	render() {
		this.$body =
			this.dialog
				.fields_dict
				.final_swift_body
				.$wrapper;


		this.$body.html(`
			<div
				class="archive-operation-form"
				dir="rtl"
			>

				<section class="archive-form-section">

					<div class="archive-section-header">

						<div>
							<h3>
								السويفت النهائي
								<span class="archive-required-star">
									*
								</span>
							</h3>

							<p>
								أرفق ملف الطباعة النهائي للعملية بصيغة PDF
							</p>
						</div>

					</div>


					<div class="archive-extraction-layout">

						<div
							class="archive-extraction-dropzone archive-final-swift-dropzone"
						>

							<input
								type="file"
								class="archive-final-swift-input"
								accept="application/pdf,.pdf"
								hidden
							>


							<div class="archive-upload-icon">
								↑
							</div>


							<div>

								<div class="archive-upload-title">
									اسحب ملف PDF هنا
								</div>

								<div class="archive-upload-help">
									أو اضغط لاختيار الملف
								</div>

							</div>

						</div>


						<div
							class="archive-final-swift-file"
						>
							<div class="archive-no-extraction">
								لم يتم اختيار ملف
							</div>
						</div>

					</div>

				</section>

			</div>
		`);


		this.bind_events();
		this.render_file();
	}


	bind_events() {
		const input =
			this.$body.find(
				".archive-final-swift-input"
			)[0];


		const $dropzone =
			this.$body.find(
				".archive-final-swift-dropzone"
			);


		$dropzone.on(
			"click",
			() => {
				input.click();
			}
		);


		$(input).on(
			"change",
			() => {

				const file =
					input.files?.[0];

				if (file) {
					this.set_file(
						file
					);
				}

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

				const file =
					files[0];

				if (file) {
					this.set_file(
						file
					);
				}
			}
		);
	}


	set_file(
		file
	) {
		if (
			!this.is_pdf(
				file
			)
		) {
			frappe.msgprint({
				title:
					__("ملف غير صحيح"),

				message:
					__(
						"السويفت النهائي يجب أن يكون ملف PDF."
					),

				indicator:
					"red",
			});

			return;
		}


		this.file =
			file;


		this.render_file();
	}


	is_pdf(
		file
	) {
		if (!file) {
			return false;
		}


		return (
			file.type
				=== "application/pdf"
			||
			file.name
				.toLowerCase()
				.endsWith(".pdf")
		);
	}


	render_file() {
		const $container =
			this.$body.find(
				".archive-final-swift-file"
			);


		if (!this.file) {
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
								this.file.name
							)}
						</div>


						<div class="archive-file-size">
							${this.format_size(
								this.file.size
							)}
						</div>

					</div>

				</div>


				<div class="archive-extraction-actions">

					<button
						type="button"
						class="
							btn
							btn-default
							btn-sm
							archive-remove-final-swift
						"
					>
						إزالة
					</button>

				</div>

			</div>
		`);


		$container
			.find(
				".archive-remove-final-swift"
			)
			.on(
				"click",
				() => {
					this.file = null;

					this.render_file();
				}
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
			< 1024 * 1024
		) {
			return `${(
				bytes / 1024
			).toFixed(1)} KB`;
		}


		return `${(
			bytes /
			(1024 * 1024)
		).toFixed(2)} MB`;
	}


	async upload_file() {
		const form_data =
			new FormData();


		form_data.append(
			"file",
			this.file
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
				"فشل رفع ملف السويفت النهائي."
			);
		}


		return {
			file_url:
				result.message.file_url,

			file_name:
				result.message.file_name
				|| this.file.name,
		};
	}


	async cleanup_file(
		file_url
	) {
		if (!file_url) {
			return;
		}


		try {
			await frappe.call({
				method:
					"archive.api.operations.delete_temporary_files",

				type:
					"POST",

				args: {
					file_urls: [
						file_url,
					],
				},
			});

		} catch (error) {
			console.error(
				"Final swift temporary file cleanup failed:",
				error
			);
		}
	}


	async save() {
		if (!this.file) {
			frappe.msgprint({
				title:
					__("السويفت النهائي مطلوب"),

				message:
					__(
						"اختر ملف PDF قبل الحفظ."
					),

				indicator:
					"red",
			});

			return;
		}


		const button =
			this.dialog
				.get_primary_btn();


		button.prop(
			"disabled",
			true
		);


		let uploaded = null;


		try {
			/*
			 * نرفع الملف أولاً كـ Private File.
			 */
			uploaded =
				await this.upload_file();


			/*
			 * Backend هو المسؤول عن:
			 *
			 * - التحقق من الصلاحية
			 * - التحقق من البنك
			 * - التحقق من عدم وجود سويفت سابق
			 * - إضافته إلى attachments
			 * - is_final_swift = 1
			 * - final_swift_file
			 * - uploaded_at
			 * - uploaded_by
			 */
			const response =
				await frappe.call({
					method:
						"archive.api.operations.attach_final_swift",

					type:
						"POST",

					args: {
						operation_name:
							this.operation_name,

						file_url:
							uploaded.file_url,
					},
				});


			const result =
				response.message || {};


			this.dialog.hide();


			frappe.show_alert({
				message:
					`تم إرفاق السويفت النهائي للعملية ${this.operation_name}`,

				indicator:
					"green",
			});


			if (
				typeof this.options.on_saved
				=== "function"
			) {
				await this.options.on_saved(
					result
				);
			}

		} catch (error) {

			/*
			 * إذا فشل ربط الملف بالعملية
			 * نحذف الملف المؤقت الذي تم رفعه.
			 */
			if (
				uploaded?.file_url
			) {
				await this.cleanup_file(
					uploaded.file_url
				);
			}


			console.error(
				"Final swift save failed:",
				error
			);


			frappe.msgprint({
				title:
					__("تعذر إرفاق السويفت النهائي"),

				message:
					error?.message ||
					__(
						"حدث خطأ أثناء إرفاق الملف النهائي."
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


	cancel() {
		/*
		 * لم نرفع أي ملف حتى الضغط على حفظ،
		 * لذلك الإلغاء هنا لا يحتاج تنظيفاً.
		 */
		this.file = null;

		this.dialog.hide();
	}
};