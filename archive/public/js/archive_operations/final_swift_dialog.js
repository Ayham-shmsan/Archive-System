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

		// this.file = null;
        this.files = [];

        this.current_count =
            Number(
                this.options.current_count
                || 0
            );

        this.max_files =
            Number(
                this.options.max_files
                || 5
            );

        this.remaining_slots =
            Math.max(
                this.max_files
                - this.current_count,
                0
            );

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
                                multiple
                                hidden
                            >


							<div class="archive-upload-icon">
								↑
							</div>


							<div>

								<div class="archive-upload-title">
                                    اسحب ملفات PDF هنا
                                </div>

                                <div class="archive-upload-help">
                                    أو اضغط لاختيار الملفات
                                    — الحد الأقصى للعملية 5 ملفات
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
		this.render_files();
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

                const files =
                    Array.from(
                        input.files || []
                    );

                if (files.length) {
                    this.add_files(
                        files
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

                if (files.length) {
                    this.add_files(
                        files
                    );
                }
            }
        );
    }
	// bind_events() {
	// 	const input =
	// 		this.$body.find(
	// 			".archive-final-swift-input"
	// 		)[0];


	// 	const $dropzone =
	// 		this.$body.find(
	// 			".archive-final-swift-dropzone"
	// 		);


	// 	$dropzone.on(
	// 		"click",
	// 		() => {
	// 			input.click();
	// 		}
	// 	);


	// 	$(input).on(
	// 		"change",
	// 		() => {

	// 			const file =
	// 				input.files?.[0];

	// 			if (file) {
	// 				this.set_file(
	// 					file
	// 				);
	// 			}

	// 			input.value = "";
	// 		}
	// 	);


	// 	$dropzone.on(
	// 		"dragover",
	// 		(event) => {
	// 			event.preventDefault();
	// 			event.stopPropagation();

	// 			$dropzone.addClass(
	// 				"is-dragging"
	// 			);
	// 		}
	// 	);


	// 	$dropzone.on(
	// 		"dragleave",
	// 		(event) => {
	// 			event.preventDefault();
	// 			event.stopPropagation();

	// 			$dropzone.removeClass(
	// 				"is-dragging"
	// 			);
	// 		}
	// 	);


	// 	$dropzone.on(
	// 		"drop",
	// 		(event) => {
	// 			event.preventDefault();
	// 			event.stopPropagation();

	// 			$dropzone.removeClass(
	// 				"is-dragging"
	// 			);

	// 			const files =
	// 				Array.from(
	// 					event
	// 						.originalEvent
	// 						.dataTransfer
	// 						.files || []
	// 				);

	// 			const file =
	// 				files[0];

	// 			if (file) {
	// 				this.set_file(
	// 					file
	// 				);
	// 			}
	// 		}
	// 	);
	// }


	// set_file(
		// file
	// ) {
	// 	if (
	// 		!this.is_pdf(
	// 			file
	// 		)
	// 	) {
	// 		frappe.msgprint({
	// 			title:
	// 				__("ملف غير صحيح"),

	// 			message:
	// 				__(
	// 					"السويفت النهائي يجب أن يكون ملف PDF."
	// 				),

	// 			indicator:
	// 				"red",
	// 		});

	// 		return;
	// 	}


	// 	this.file =
	// 		file;


	// 	this.render_file();
	// }
    add_files(
        files
    ) {
        for (const file of files) {

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
                            "جميع ملفات السويفت النهائي يجب أن تكون بصيغة PDF."
                        ),

                    indicator:
                        "red",
                });

                continue;
            }


            const exists =
                this.files.some(
                    (item) =>
                        item.name === file.name
                        &&
                        item.size === file.size
                        &&
                        item.lastModified
                            === file.lastModified
                );


            if (exists) {
                continue;
            }


            if (
                this.files.length
                >= this.remaining_slots
            ) {
                frappe.msgprint({
                    title:
                        __("الحد الأقصى"),

                    message:
                        __(
                            "يمكن إضافة {0} ملف إضافي فقط. الحد الأقصى للعملية هو {1} ملفات."
                        ).format(
                            this.remaining_slots,
                            this.max_files
                        ),

                    indicator:
                        "orange",
                });

                break;
            }


            this.files.push(
                file
            );
        }


        this.render_files();
    }


    remove_file(
        index
    ) {
        this.files.splice(
            index,
            1
        );

        this.render_files();
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


	// render_file() {
	// 	const $container =
	// 		this.$body.find(
	// 			".archive-final-swift-file"
	// 		);


	// 	if (!this.file) {
	// 		$container.html(`
	// 			<div class="archive-no-extraction">
	// 				لم يتم اختيار ملف
	// 			</div>
	// 		`);

	// 		return;
	// 	}


	// 	$container.html(`
	// 		<div class="archive-selected-extraction">

	// 			<div class="archive-file-info">

	// 				<div class="archive-file-icon">
	// 					PDF
	// 				</div>


	// 				<div>

	// 					<div class="archive-file-name">
	// 						${frappe.utils.escape_html(
	// 							this.file.name
	// 						)}
	// 					</div>


	// 					<div class="archive-file-size">
	// 						${this.format_size(
	// 							this.file.size
	// 						)}
	// 					</div>

	// 				</div>

	// 			</div>


	// 			<div class="archive-extraction-actions">

	// 				<button
	// 					type="button"
	// 					class="
	// 						btn
	// 						btn-default
	// 						btn-sm
	// 						archive-remove-final-swift
	// 					"
	// 				>
	// 					إزالة
	// 				</button>

	// 			</div>

	// 		</div>
	// 	`);


	// 	$container
	// 		.find(
	// 			".archive-remove-final-swift"
	// 		)
	// 		.on(
	// 			"click",
	// 			() => {
	// 				this.file = null;

	// 				this.render_file();
	// 			}
	// 		);
	// }
    render_files() {
        const $container =
            this.$body.find(
                ".archive-final-swift-file"
            );


        if (!this.files.length) {
            $container.html(`
                <div class="archive-no-extraction">
                    لم يتم اختيار ملفات
                    <br>
                    المرفق حالياً:
                    ${this.current_count}
                    /
                    ${this.max_files}
                </div>
            `);

            return;
        }


        const files_html =
            this.files
                .map(
                    (file, index) => `
                        <div
                            class="archive-selected-extraction"
                        >

                            <div class="archive-file-info">

                                <div class="archive-file-icon">
                                    PDF
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
                                    data-index="${index}"
                                >
                                    إزالة
                                </button>

                            </div>

                        </div>
                    `
                )
                .join("");


        $container.html(`
            <div
                class="archive-final-swift-count"
                style="margin-bottom: 10px;"
            >
                سيصبح إجمالي ملفات السويفت:
                <strong>
                    ${this.current_count + this.files.length}
                    /
                    ${this.max_files}
                </strong>
            </div>

            ${files_html}
        `);


        $container
            .find(
                ".archive-remove-final-swift"
            )
            .on(
                "click",
                (event) => {

                    const index =
                        Number(
                            $(event.currentTarget)
                                .data("index")
                        );

                    this.remove_file(
                        index
                    );
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


	// async upload_file() {
	// 	const form_data =
	// 		new FormData();


	// 	form_data.append(
	// 		"file",
	// 		this.file
	// 	);


	// 	form_data.append(
	// 		"is_private",
	// 		"1"
	// 	);


	// 	const response =
	// 		await fetch(
	// 			"/api/method/upload_file",
	// 			{
	// 				method:
	// 					"POST",

	// 				headers: {
	// 					"X-Frappe-CSRF-Token":
	// 						frappe.csrf_token,
	// 				},

	// 				body:
	// 					form_data,
	// 			}
	// 		);


	// 	const result =
	// 		await response.json();


	// 	if (
	// 		!response.ok
	// 		||
	// 		result.exc
	// 		||
	// 		!result.message
	// 	) {
	// 		throw new Error(
	// 			"فشل رفع ملف السويفت النهائي."
	// 		);
	// 	}


	// 	return {
	// 		file_url:
	// 			result.message.file_url,

	// 		file_name:
	// 			result.message.file_name
	// 			|| this.file.name,
	// 	};
	// }
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


	// async cleanup_file(
	// 	file_url
	// ) {
	// 	if (!file_url) {
	// 		return;
	// 	}


	// 	try {
	// 		await frappe.call({
	// 			method:
	// 				"archive.api.operations.delete_temporary_files",

	// 			type:
	// 				"POST",

	// 			args: {
	// 				file_urls: [
	// 					file_url,
	// 				],
	// 			},
	// 		});

	// 	} catch (error) {
	// 		console.error(
	// 			"Final swift temporary file cleanup failed:",
	// 			error
	// 		);
	// 	}
	// }
    async cleanup_files(
            file_urls
        ) {
            if (
                !Array.isArray(
                    file_urls
                )
                ||
                !file_urls.length
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
                        file_urls:
                            file_urls,
                    },
                });

            } catch (error) {
                console.error(
                    "Final swift temporary files cleanup failed:",
                    error
                );
            }
        }

    async save() {
        if (!this.files.length) {
            frappe.msgprint({
                title:
                    __("السويفت النهائي مطلوب"),

                message:
                    __(
                        "اختر ملف PDF واحداً على الأقل قبل الحفظ."
                    ),

                indicator:
                    "red",
            });

            return;
        }


        if (
            this.current_count
            +
            this.files.length
            >
            this.max_files
        ) {
            frappe.msgprint({
                title:
                    __("الحد الأقصى"),

                message:
                    `الحد الأقصى لملفات السويفت النهائي هو ${this.max_files} ملفات.`,

                indicator:
                    "orange",
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


        const uploaded = [];


        try {

            /*
            * رفع جميع الملفات الجديدة.
            */
            for (
                const file
                of this.files
            ) {
                const result =
                    await this.upload_file(
                        file
                    );

                uploaded.push(
                    result
                );
            }


            /*
            * إرسال جميع الملفات دفعة واحدة
            * إلى Backend.
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

                        file_urls:
                            uploaded.map(
                                (item) =>
                                    item.file_url
                            ),
                    },
                });


            const result =
                response.message || {};


            this.dialog.hide();


            frappe.show_alert({
                message:
                    `تم إرفاق ${uploaded.length} ملف سويفت نهائي للعملية ${this.operation_name}`,

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
            * إذا رفعنا بعض الملفات ثم فشل الحفظ،
            * نحذف جميع الملفات المؤقتة الجديدة.
            */
            await this.cleanup_files(
                uploaded.map(
                    (item) =>
                        item.file_url
                )
            );


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
                        "حدث خطأ أثناء إرفاق ملفات السويفت النهائي."
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
	// async save() {
	// 	if (!this.file) {
	// 		frappe.msgprint({
	// 			title:
	// 				__("السويفت النهائي مطلوب"),

	// 			message:
	// 				__(
	// 					"اختر ملف PDF قبل الحفظ."
	// 				),

	// 			indicator:
	// 				"red",
	// 		});

	// 		return;
	// 	}


	// 	const button =
	// 		this.dialog
	// 			.get_primary_btn();


	// 	button.prop(
	// 		"disabled",
	// 		true
	// 	);


	// 	let uploaded = null;


	// 	try {
	// 		/*
	// 		 * نرفع الملف أولاً كـ Private File.
	// 		 */
	// 		uploaded =
	// 			await this.upload_file();


	// 		/*
	// 		 * Backend هو المسؤول عن:
	// 		 *
	// 		 * - التحقق من الصلاحية
	// 		 * - التحقق من البنك
	// 		 * - التحقق من عدم وجود سويفت سابق
	// 		 * - إضافته إلى attachments
	// 		 * - is_final_swift = 1
	// 		 * - final_swift_file
	// 		 * - uploaded_at
	// 		 * - uploaded_by
	// 		 */
	// 		const response =
	// 			await frappe.call({
	// 				method:
	// 					"archive.api.operations.attach_final_swift",

	// 				type:
	// 					"POST",

	// 				args: {
	// 					operation_name:
	// 						this.operation_name,

	// 					file_url:
	// 						uploaded.file_url,
	// 				},
	// 			});


	// 		const result =
	// 			response.message || {};


	// 		this.dialog.hide();


	// 		frappe.show_alert({
	// 			message:
	// 				`تم إرفاق السويفت النهائي للعملية ${this.operation_name}`,

	// 			indicator:
	// 				"green",
	// 		});


	// 		if (
	// 			typeof this.options.on_saved
	// 			=== "function"
	// 		) {
	// 			await this.options.on_saved(
	// 				result
	// 			);
	// 		}

	// 	} catch (error) {

	// 		/*
	// 		 * إذا فشل ربط الملف بالعملية
	// 		 * نحذف الملف المؤقت الذي تم رفعه.
	// 		 */
	// 		if (
	// 			uploaded?.file_url
	// 		) {
	// 			await this.cleanup_file(
	// 				uploaded.file_url
	// 			);
	// 		}


	// 		console.error(
	// 			"Final swift save failed:",
	// 			error
	// 		);


	// 		frappe.msgprint({
	// 			title:
	// 				__("تعذر إرفاق السويفت النهائي"),

	// 			message:
	// 				error?.message ||
	// 				__(
	// 					"حدث خطأ أثناء إرفاق الملف النهائي."
	// 				),

	// 			indicator:
	// 				"red",
	// 		});

	// 	} finally {
	// 		button.prop(
	// 			"disabled",
	// 			false
	// 		);
	// 	}
	// }


	cancel() {
		/*
		 * لم نرفع أي ملف حتى الضغط على حفظ،
		 * لذلك الإلغاء هنا لا يحتاج تنظيفاً.
		 */
		this.files = [];

		this.dialog.hide();
	}
};