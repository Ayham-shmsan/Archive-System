window.archive = window.archive || {};
archive.ui = archive.ui || {};


archive.ui.OperationTimelineDialog = class {
    constructor(
        operation_name,
        options = {}
    ) {
        this.operation_name =
            operation_name;

        this.options =
            options || {};

        this.operation = null;

        this.events = [];

        this.active_filter =
            "all";

        this.loading =
            false;

        this.make();
    }


    // ========================================================
    // Dialog
    // ========================================================

    make() {
        this.dialog =
            new frappe.ui.Dialog({
                title:
                    __("مسار العملية"),

                size:
                    "extra-large",

                fields: [
                    {
                        fieldname:
                            "timeline_html",

                        fieldtype:
                            "HTML",
                    },
                ],
            });


        this.$body =
            this.dialog
                .fields_dict
                .timeline_html
                .$wrapper;


        this.$body.addClass(
            "archive-operation-timeline-wrapper"
        );


        this.render_loading();
    }


    show() {
        this.dialog.show();

        this.load();
    }


    // ========================================================
    // Load
    // ========================================================

    async load() {
        if (this.loading) {
            return;
        }

        this.loading = true;

        this.render_loading();

        try {
            const response =
                await frappe.call({
                    method:
                        "archive.api.operation_timeline.get_operation_timeline",

                    type:
                        "GET",

                    args: {
                        operation_name:
                            this.operation_name,
                    },
                });


            const result =
                response.message || {};


            this.operation =
                result.operation || {};


            this.events =
                Array.isArray(
                    result.events
                )
                    ? result.events
                    : [];


            this.render();

        } catch (error) {

            console.error(
                "Operation timeline loading failed:",
                error
            );


            this.render_error(
                error?.message
                ||
                __(
                    "تعذر تحميل مسار العملية."
                )
            );

        } finally {
            this.loading = false;
        }
    }


    // ========================================================
    // Loading
    // ========================================================

    render_loading() {
        this.$body.html(`
            <div class="archive-timeline-loading">

                <div class="archive-timeline-spinner">
                </div>

                <div>
                    ${__(
                        "جارٍ تحميل مسار العملية..."
                    )}
                </div>

            </div>
        `);
    }


    render_error(
        message
    ) {
        this.$body.html(`
            <div class="archive-timeline-error">

                <div class="archive-timeline-error-icon">
                    <i
                        class="fa fa-exclamation-triangle"
                        aria-hidden="true"
                    ></i>
                </div>

                <div class="archive-timeline-error-title">
                    ${__(
                        "تعذر تحميل مسار العملية"
                    )}
                </div>

                <div class="archive-timeline-error-message">
                    ${this.escape(
                        message
                    )}
                </div>

                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        archive-timeline-retry
                    "
                >
                    ${__(
                        "إعادة المحاولة"
                    )}
                </button>

            </div>
        `);


        this.$body
            .find(
                ".archive-timeline-retry"
            )
            .on(
                "click",
                () => {
                    this.load();
                }
            );
    }


    // ========================================================
    // Main render
    // ========================================================

    render() {
        this.$body.html(`
            <div
                class="archive-timeline-shell"
                dir="rtl"
            >

                ${this.render_header()}

                ${this.render_filters()}

                <div
                    class="archive-timeline-events"
                >
                    ${this.render_events()}
                </div>

            </div>
        `);


        this.bind_events();
    }


    // ========================================================
    // Header
    // ========================================================

    render_header() {
        const operation =
            this.operation || {};


        return `
            <div class="archive-timeline-header">

                <div class="archive-timeline-header-main">

                    <div
                        class="
                            archive-timeline-header-icon
                        "
                    >
                        <i
                            class="fa fa-history"
                            aria-hidden="true"
                        ></i>
                    </div>


                    <div
                        class="
                            archive-timeline-header-text
                        "
                    >

                        <div
                            class="
                                archive-timeline-operation-title
                            "
                        >
                            ${__(
                                "مسار العملية"
                            )}

                            <span>
                                ${this.escape(
                                    operation.serial_no
                                    ||
                                    operation.name
                                    ||
                                    this.operation_name
                                )}
                            </span>
                        </div>


                        <div
                            class="
                                archive-timeline-operation-subtitle
                            "
                        >
                            ${__(
                                "جميع الأحداث والتعديلات المسجلة على العملية"
                            )}
                        </div>

                    </div>


                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-sm
                            archive-timeline-refresh
                        "
                    >
                        <i
                            class="fa fa-refresh"
                            aria-hidden="true"
                        ></i>

                        ${__(
                            "تحديث"
                        )}
                    </button>

                </div>


                <div
                    class="
                        archive-timeline-operation-summary
                    "
                >

                    ${this.summary_item(
                        __("رقم العملية"),
                        operation.operation_no
                    )}

                    ${this.summary_item(
                        __("العميل"),
                        operation.customer_name
                        ||
                        operation.customer
                    )}

                    ${this.summary_item(
                        __("رقم المرجع"),
                        operation.reference_no
                    )}

                    ${this.summary_item(
                        __("الحالة الحالية"),
                        operation.status,
                        "status"
                    )}

                    ${this.summary_item(
                        __("تاريخ الطلب"),
                        this.format_date(
                            operation.request_date
                        )
                    )}

                    ${this.summary_item(
                        __("عدد الأحداث"),
                        this.events.length
                    )}

                </div>

            </div>
        `;
    }


    summary_item(
        label,
        value,
        type = null
    ) {
        let rendered_value =
            this.escape_value(
                value
            );


        if (
            type === "status"
            &&
            value
        ) {
            rendered_value = `
                <span
                    class="
                        archive-timeline-status
                        ${this.get_status_class(
                            value
                        )}
                    "
                >
                    ${this.escape(
                        value
                    )}
                </span>
            `;
        }


        return `
            <div
                class="
                    archive-timeline-summary-item
                "
            >
                <div
                    class="
                        archive-timeline-summary-label
                    "
                >
                    ${this.escape(
                        label
                    )}
                </div>

                <div
                    class="
                        archive-timeline-summary-value
                    "
                >
                    ${rendered_value}
                </div>
            </div>
        `;
    }


    // ========================================================
    // Filters
    // ========================================================

    get_filters() {
        return [
            {
                key:
                    "all",

                label:
                    "الكل",
            },

            {
                key:
                    "manual_edit",

                label:
                    "التعديلات",
            },

            {
                key:
                    "status_change",

                label:
                    "الحالة",
            },

            {
                key:
                    "attachments",

                label:
                    "المرفقات",
            },

            {
                key:
                    "final_swift",

                label:
                    "السويفت النهائي",
            },

            {
                key:
                    "data_extracted",

                label:
                    "الاستخراج",
            },

            {
                key:
                    "created",

                label:
                    "الإنشاء",
            },
        ];
    }


    render_filters() {
        return `
            <div class="archive-timeline-toolbar">

                <div
                    class="
                        archive-timeline-filter-group
                    "
                >
                    ${
                        this.get_filters()
                            .map(
                                (filter) => {

                                    const active =
                                        this.active_filter
                                        === filter.key
                                            ? "is-active"
                                            : "";


                                    return `
                                        <button
                                            type="button"
                                            class="
                                                archive-timeline-filter
                                                ${active}
                                            "
                                            data-filter="${this.escape(
                                                filter.key
                                            )}"
                                        >
                                            ${this.escape(
                                                filter.label
                                            )}

                                            <span>
                                                ${this.get_filter_count(
                                                    filter.key
                                                )}
                                            </span>
                                        </button>
                                    `;
                                }
                            )
                            .join("")
                    }
                </div>

            </div>
        `;
    }


    get_filter_count(
        filter
    ) {
        if (
            filter === "all"
        ) {
            return this.events.length;
        }


        return this.events.filter(
            (event) =>
                this.event_matches_filter(
                    event,
                    filter
                )
        ).length;
    }


    event_matches_filter(
        event,
        filter
    ) {
        if (
            filter === "all"
        ) {
            return true;
        }


        if (
            filter === "attachments"
        ) {
            return [
                "attachment_added",
                "attachment_deleted",
                "attachment_downloaded",
            ].includes(
                event.event_type
            );
        }


        if (
            filter === "final_swift"
        ) {
            return [
                "final_swift_added",
                "final_swift_deleted",
            ].includes(
                event.event_type
            );
        }


        return (
            event.event_type
            === filter
        );
    }


    // ========================================================
    // Timeline
    // ========================================================

    render_events() {
        const events =
            this.events.filter(
                (event) =>
                    this.event_matches_filter(
                        event,
                        this.active_filter
                    )
            );


        if (!events.length) {
            return `
                <div
                    class="
                        archive-timeline-empty
                    "
                >
                    <div
                        class="
                            archive-timeline-empty-icon
                        "
                    >
                        <i
                            class="fa fa-history"
                            aria-hidden="true"
                        ></i>
                    </div>

                    <div
                        class="
                            archive-timeline-empty-title
                        "
                    >
                        ${__(
                            "لا توجد أحداث ضمن هذا التصنيف"
                        )}
                    </div>
                </div>
            `;
        }


        return `
            <div
                class="
                    archive-timeline-list
                "
            >
                ${
                    events
                        .map(
                            (
                                event,
                                index
                            ) =>
                                this.render_event(
                                    event,
                                    index
                                )
                        )
                        .join("")
                }
            </div>
        `;
    }


    render_event(
        event,
        index
    ) {
        const config =
            this.get_event_config(
                event.event_type
            );

        const file_event_types =
            new Set([
                "attachment_added",
                "attachment_deleted",
                "final_swift_added",
                "final_swift_deleted",
                "attachment_downloaded",
            ]);


        const event_details_html =
            this.render_event_details(
                event
            );


        const details_before_meta =
            file_event_types.has(
                event.event_type
            )
                ? event_details_html
                : "";


        const details_after_meta =
            file_event_types.has(
                event.event_type
            )
                ? ""
                : event_details_html;


        return `
            <div
                class="
                    archive-timeline-event
                    ${config.class_name}
                "
            >

                <div
                    class="
                        archive-timeline-event-marker
                    "
                >
                    <div
                        class="
                            archive-timeline-event-icon
                        "
                    >
                        <i
                            class="
                                fa
                                ${config.icon}
                            "
                            aria-hidden="true"
                        ></i>
                    </div>

                    ${
                        index
                        <
                        (
                            this.get_filtered_events()
                                .length
                            - 1
                        )
                            ? `
                                <div
                                    class="
                                        archive-timeline-line
                                    "
                                ></div>
                            `
                            : ""
                    }
                </div>


                <div
                    class="
                        archive-timeline-event-card
                    "
                >

                    <div
                        class="
                            archive-timeline-event-head
                        "
                        >

                        <div
                            class="
                                archive-timeline-event-title-wrap
                            "
                        >

                            <div
                                class="
                                    archive-timeline-event-title
                                "
                            >
                                ${this.escape(
                                    event.event_title
                                    ||
                                    event.event_type_label
                                    ||
                                    "حدث"
                                )}
                            </div>


                            <div
                                class="
                                    archive-timeline-event-type
                                "
                            >
                                ${this.escape(
                                    event.event_type_label
                                    ||
                                    config.label
                                )}
                            </div>

                        </div>


                        <div
                            class="
                                archive-timeline-event-time
                            "
                        >
                            <i
                                class="fa fa-clock-o"
                                aria-hidden="true"
                            ></i>

                            ${this.escape_value(
                                this.format_datetime(
                                    event.event_datetime
                                )
                            )}
                        </div>

                    </div>

                        ${details_before_meta}


                    <div
                        class="
                            archive-timeline-event-meta
                        "
                    >

                        <div>
                            <i
                                class="fa fa-user-o"
                                aria-hidden="true"
                            ></i>

                            <span>
                                ${__(
                                    "بواسطة"
                                )}
                            </span>

                            <strong>
                                ${this.escape_value(
                                    event.event_user_name
                                    ||
                                    event.event_user
                                )}
                            </strong>
                        </div>


                        <div>
                            <i
                                class="fa fa-cog"
                                aria-hidden="true"
                            ></i>

                            <span>
                                ${__(
                                    "المصدر"
                                )}
                            </span>

                            <strong>
                                ${this.escape_value(
                                    event.event_source_label
                                    ||
                                    event.event_source
                                )}
                            </strong>
                        </div>


                        ${
                            event.effective_date
                                ? `
                                    <div>
                                        <i
                                            class="fa fa-calendar-check-o"
                                            aria-hidden="true"
                                        ></i>

                                        <span>
                                            ${__(
                                                "التاريخ الفعلي"
                                            )}
                                        </span>

                                        <strong>
                                            ${this.escape_value(
                                                this.format_date(
                                                    event.effective_date
                                                )
                                            )}
                                        </strong>
                                    </div>
                                `
                                : ""
                        }

                    </div>


                    ${
                        event.remarks
                            ? `
                                <div
                                    class="
                                        archive-timeline-remarks
                                    "
                                >
                                    <div
                                        class="
                                            archive-timeline-remarks-label
                                        "
                                    >
                                        ${__(
                                            "ملاحظات الإجراء"
                                        )}
                                    </div>

                                    <div>
                                        ${this.escape(
                                            event.remarks
                                        )}
                                    </div>
                                </div>
                            `
                            : ""
                    }


                   
                                ${details_after_meta}

                </div>

            </div>
        `;
    }


    get_filtered_events() {
        return this.events.filter(
            (event) =>
                this.event_matches_filter(
                    event,
                    this.active_filter
                )
        );
    }


    // ========================================================
    // Event configuration
    // ========================================================

    get_event_config(
        event_type
    ) {
        const configs = {

            created: {
                label:
                    "إنشاء العملية",

                icon:
                    "fa-plus",

                class_name:
                    "event-created",
            },


            data_extracted: {
                label:
                    "استخراج البيانات",

                icon:
                    "fa-file-pdf-o",

                class_name:
                    "event-extraction",
            },


            manual_edit: {
                label:
                    "تعديل البيانات",

                icon:
                    "fa-pencil",

                class_name:
                    "event-edit",
            },


            status_change: {
                label:
                    "تغيير الحالة",

                icon:
                    "fa-exchange",

                class_name:
                    "event-status",
            },


            attachment_added: {
                label:
                    "إضافة مرفق",

                icon:
                    "fa-paperclip",

                class_name:
                    "event-attachment",
            },


            attachment_deleted: {
                label:
                    "حذف مرفق",

                icon:
                    "fa-trash-o",

                class_name:
                    "event-delete",
            },


            final_swift_added: {
                label:
                    "إرفاق السويفت النهائي",

                icon:
                    "fa-file-pdf-o",

                class_name:
                    "event-swift",
            },


            final_swift_deleted: {
                label:
                    "حذف السويفت النهائي",

                icon:
                    "fa-trash-o",

                class_name:
                    "event-delete",
            },
            attachment_downloaded: {

                icon:
                    "fa-download",

                class_name:
                    "attachment-downloaded",
            },
        };


        return (
            configs[
                event_type
            ]
            ||
            {
                label:
                    "حدث",

                icon:
                    "fa-circle-o",

                class_name:
                    "event-default",
            }
        );
    }


    // ========================================================
    // Event details router
    // ========================================================

    render_event_details(
        event
    ) {
        const details =
            event.details || {};


        switch (
            event.event_type
        ) {

            case "manual_edit":
                return (
                    this.render_changes(
                        details.changes
                    )
                );


            case "status_change":
                return (
                    this.render_status_change(
                        details
                    )
                );


            case "attachment_added":
            case "attachment_deleted":
            case "final_swift_added":
            case "final_swift_deleted":
                return (
                    this.render_files(
                        details
                    )
                );

            


            case "data_extracted":
                return (
                    this.render_extraction(
                        details
                    )
                );


            case "created":
                return (
                    this.render_created(
                        details
                    )
                );
            case "attachment_downloaded":
                return this.render_files(
                    event.details || {}
                );


            default:
                return "";
        }
    }


    // ========================================================
    // Manual changes
    // ========================================================

    render_changes(
        changes
    ) {
        if (
            !Array.isArray(
                changes
            )
            ||
            !changes.length
        ) {
            return "";
        }


        return `
            <div
                class="
                    archive-timeline-details
                "
            >

                <div
                    class="
                        archive-timeline-details-title
                    "
                >
                    ${__(
                        "التغييرات"
                    )}
                </div>


                <div
                    class="
                        archive-timeline-change-table
                    "
                >

                    <div
                        class="
                            archive-timeline-change-row
                            archive-timeline-change-head
                        "
                    >
                        <div>
                            ${__(
                                "الحقل"
                            )}
                        </div>

                        <div>
                            ${__(
                                "القيمة السابقة"
                            )}
                        </div>

                        <div>
                            ${__(
                                "القيمة الجديدة"
                            )}
                        </div>
                    </div>


                    ${
                        changes
                            .map(
                                (change) => `
                                    <div
                                        class="
                                            archive-timeline-change-row
                                        "
                                    >

                                        <div
                                            class="
                                                archive-timeline-change-label
                                            "
                                        >
                                            ${this.escape_value(
                                                change.label
                                                ||
                                                change.fieldname
                                            )}
                                        </div>


                                        <div
                                            class="
                                                archive-timeline-old-value
                                            "
                                        >
                                            ${this.escape_value(
                                                change.old_value
                                            )}
                                        </div>


                                        <div
                                            class="
                                                archive-timeline-new-value
                                            "
                                        >
                                            ${this.escape_value(
                                                change.new_value
                                            )}
                                        </div>

                                    </div>
                                `
                            )
                            .join("")
                    }

                </div>

            </div>
        `;
    }


    // ========================================================
    // Status
    // ========================================================

    render_status_change(
        details
    ) {
        if (
            !details
        ) {
            return "";
        }


        return `
            <div
                class="
                    archive-timeline-details
                "
            >

                <div
                    class="
                        archive-timeline-status-change
                    "
                >

                    <div
                        class="
                            archive-timeline-status-box
                        "
                    >
                        <span>
                            ${__(
                                "من"
                            )}
                        </span>

                        <strong
                            class="
                                archive-timeline-status
                                ${this.get_status_class(
                                    details.from_status
                                )}
                            "
                        >
                            ${this.escape_value(
                                details.from_status
                            )}
                        </strong>
                    </div>


                    <div
                        class="
                            archive-timeline-status-arrow
                        "
                    >
                        <i
                            class="fa fa-long-arrow-left"
                            aria-hidden="true"
                        ></i>
                    </div>


                    <div
                        class="
                            archive-timeline-status-box
                        "
                    >
                        <span>
                            ${__(
                                "إلى"
                            )}
                        </span>

                        <strong
                            class="
                                archive-timeline-status
                                ${this.get_status_class(
                                    details.to_status
                                )}
                            "
                        >
                            ${this.escape_value(
                                details.to_status
                            )}
                        </strong>
                    </div>

                </div>

            </div>
        `;
    }


    // ========================================================
    // Files
    // ========================================================

    // render_files(details = {}) {

    //     details = details || {};


    //     const files =
    //         Array.isArray(
    //             details.files
    //         )
    //             ? [
    //                 ...details.files
    //             ]
    //             : [];


    //     /*
    //     * بعض الأحداث مثل attachment_downloaded
    //     * تحتوي ملفاً واحداً مباشرة:
    //     *
    //     * file_name
    //     * file_url
    //     *
    //     * وليس details.files
    //     */
    //     if (
    //         !files.length
    //         &&
    //         details.file_url
    //     ) {
    //         files.push({
    //             file_name:
    //                 details.file_name
    //                 || "مرفق",

    //             file_url:
    //                 details.file_url,
    //         });
    //     }


    //     if (!files.length) {
    //         return "";
    //     }


    //     return `
    //         <div class="archive-timeline-files">

    //             ${files
    //                 .map(
    //                     (file) => {

    //                         const file_name =
    //                             file.file_name
    //                             || file.file_url
    //                             || "مرفق";


    //                         /*
    //                         * للعرض فقط داخل مسار العملية.
    //                         * لا يوجد href ولا فتح للملف.
    //                         */
    //                         return `
    //                             <div
    //                                 class="
    //                                     archive-timeline-file
    //                                 "
    //                             >
    //                                 <i
    //                                     class="
    //                                         fa
    //                                         fa-file-pdf-o
    //                                     "
    //                                     aria-hidden="true"
    //                                 ></i>

    //                                 <span>
    //                                     ${this.escape_value(
    //                                         file_name
    //                                     )}
    //                                 </span>
    //                             </div>
    //                         `;
    //                     }
    //                 )
    //                 .join("")
    //             }

    //         </div>
    //     `;
    // }
    render_files(
        details = {}
    ) {

        details =
            details || {};


        const files =
            Array.isArray(
                details.files
            )
                ? [
                    ...details.files
                ]
                : [];


        // بعض الأحداث تحتوي ملفاً واحداً مباشرة.
        if (
            !files.length
            &&
            details.file_url
        ) {

            files.push({
                file_name:
                    details.file_name
                    || "مرفق",

                file_url:
                    details.file_url,
            });
        }


        if (!files.length) {
            return "";
        }


        return `
            <div
                class="
                    archive-timeline-details
                "
            >

                <div
                    class="
                        archive-timeline-details-title
                    "
                >
                    ${__(
                        files.length === 1
                            ? "الملف"
                            : "الملفات"
                    )}
                </div>


                <div
                    class="
                        archive-timeline-files
                    "
                >

                    ${files
                        .map(
                            (file) =>
                                this.render_file(
                                    file
                                )
                        )
                        .join("")
                    }

                </div>

            </div>
        `;
    }
    // render_files(
    //     event,
    //     details
    // ) {
    //     const files =
    //         Array.isArray(
    //             details.files
    //         )
    //             ? details.files
    //             : [];


    //     if (
    //         !files.length
    //         &&
    //         details.file_url
    //     ) {
    //         files.push({
    //             file_url:
    //                 details.file_url,

    //             file_name:
    //                 details.file_name,
    //         });
    //     }


    //     let counter_html =
    //         "";


    //     if (
    //         event.event_type
    //         === "final_swift_added"
    //         &&
    //         details.final_swift_count
    //         !== undefined
    //     ) {
    //         counter_html = `
    //             <div
    //                 class="
    //                     archive-timeline-swift-count
    //                 "
    //             >
    //                 ${__(
    //                     "عدد ملفات السويفت بعد الإجراء"
    //                 )}:

    //                 <strong>
    //                     ${this.escape_value(
    //                         details.final_swift_count
    //                     )}
    //                     /
    //                     ${this.escape_value(
    //                         details.final_swift_limit
    //                         || 5
    //                     )}
    //                 </strong>
    //             </div>
    //         `;
    //     }


    //     if (
    //         event.event_type
    //         === "final_swift_deleted"
    //         &&
    //         details.remaining_count
    //         !== undefined
    //     ) {
    //         counter_html = `
    //             <div
    //                 class="
    //                     archive-timeline-swift-count
    //                 "
    //             >
    //                 ${__(
    //                     "عدد ملفات السويفت المتبقية"
    //                 )}:

    //                 <strong>
    //                     ${this.escape_value(
    //                         details.remaining_count
    //                     )}
    //                     /
    //                     ${this.escape_value(
    //                         details.final_swift_limit
    //                         || 5
    //                     )}
    //                 </strong>
    //             </div>
    //         `;
    //     }


    //     if (
    //         !files.length
    //         &&
    //         !counter_html
    //     ) {
    //         return "";
    //     }


    //     return `
    //         <div
    //             class="
    //                 archive-timeline-details
    //             "
    //         >

    //             ${
    //                 files.length
    //                     ? `
    //                         <div
    //                             class="
    //                                 archive-timeline-details-title
    //                             "
    //                         >
    //                             ${__(
    //                                 "الملفات"
    //                             )}
    //                         </div>


    //                         <div
    //                             class="
    //                                 archive-timeline-files
    //                             "
    //                         >
    //                             ${
    //                                 files
    //                                     .map(
    //                                         (file) =>
    //                                             this.render_file(
    //                                                 file
    //                                             )
    //                                     )
    //                                     .join("")
    //                             }
    //                         </div>
    //                     `
    //                     : ""
    //             }

    //             ${counter_html}

    //         </div>
    //     `;
    // }


    render_file(
        file
    ) {
        const file_name =
            file.file_name
            ||
            file.file_url
            ||
            __("ملف");


        if (!file.file_url) {
            return `
                <div
                    class="
                        archive-timeline-file
                    "
                >
                    <i
                        class="fa fa-file-o"
                        aria-hidden="true"
                    ></i>

                    <span>
                        ${this.escape_value(
                            file_name
                        )}
                    </span>
                </div>
            `;
        }


        return `
            <div
                class="
                    archive-timeline-file
                "
            >
                <i
                    class="fa fa-file-pdf-o"
                    aria-hidden="true"
                ></i>

                <span>
                    ${this.escape_value(
                        file_name
                    )}
                </span>
            </div>
        `;
    }


    // ========================================================
    // Extraction
    // ========================================================

    render_extraction(
        details
    ) {
        const fields =
            Array.isArray(
                details.fields
            )
                ? details.fields
                : [];


        return `
            <div
                class="
                    archive-timeline-details
                "
            >

                ${
                    details.file_url
                        ? `
                            <div
                                class="
                                    archive-timeline-details-title
                                "
                            >
                                ${__(
                                    "مستند الاستخراج"
                                )}
                            </div>

                            <div
                                class="
                                    archive-timeline-files
                                "
                            >
                                ${this.render_file({
                                    file_url:
                                        details.file_url,

                                    file_name:
                                        details.file_name,
                                })}
                            </div>
                        `
                        : ""
                }


                ${
                    fields.length
                        ? `
                            <div
                                class="
                                    archive-timeline-details-title
                                    archive-timeline-fields-title
                                "
                            >
                                ${__(
                                    "البيانات المستخرجة"
                                )}
                            </div>


                            <div
                                class="
                                    archive-timeline-extracted-fields
                                "
                            >
                                ${
                                    fields
                                        .map(
                                            (field) => `
                                                <div
                                                    class="
                                                        archive-timeline-extracted-field
                                                    "
                                                >
                                                    <div>
                                                        ${this.escape_value(
                                                            field.label
                                                            ||
                                                            field.fieldname
                                                        )}
                                                    </div>

                                                    <strong>
                                                        ${this.escape_value(
                                                            field.value
                                                        )}
                                                    </strong>
                                                </div>
                                            `
                                        )
                                        .join("")
                                }
                            </div>
                        `
                        : ""
                }

            </div>
        `;
    }


    // ========================================================
    // Created
    // ========================================================

    render_created(
        details
    ) {
        if (!details) {
            return "";
        }


        const values = [
            {
                label:
                    "الحالة الابتدائية",

                value:
                    details.status,
            },

            {
                label:
                    "رقم العملية",

                value:
                    details.operation_no,
            },

            {
                label:
                    "العميل",

                value:
                    details.customer,
            },

            {
                label:
                    "المبلغ",

                value:
                    details.amount,
            },

            {
                label:
                    "العملة",

                value:
                    details.currency,
            },

            {
                label:
                    "البنك المحول",

                value:
                    details.transferring_bank,
            },
        ].filter(
            (item) =>
                item.value !== null
                &&
                item.value !== undefined
                &&
                item.value !== ""
        );


        if (!values.length) {
            return "";
        }


        return `
            <div
                class="
                    archive-timeline-details
                "
            >

                <div
                    class="
                        archive-timeline-created-grid
                    "
                >
                    ${
                        values
                            .map(
                                (item) => `
                                    <div
                                        class="
                                            archive-timeline-created-item
                                        "
                                    >
                                        <span>
                                            ${this.escape(
                                                item.label
                                            )}
                                        </span>

                                        <strong>
                                            ${this.escape_value(
                                                item.value
                                            )}
                                        </strong>
                                    </div>
                                `
                            )
                            .join("")
                    }
                </div>

            </div>
        `;
    }


    // ========================================================
    // Events
    // ========================================================

    bind_events() {
        this.$body
            .find(
                ".archive-timeline-refresh"
            )
            .on(
                "click",
                () => {
                    this.load();
                }
            );


        this.$body
            .find(
                ".archive-timeline-filter"
            )
            .on(
                "click",
                (event) => {

                    const filter =
                        $(event.currentTarget)
                            .data(
                                "filter"
                            );


                    if (
                        !filter
                        ||
                        filter
                        === this.active_filter
                    ) {
                        return;
                    }


                    this.active_filter =
                        filter;


                    this.render();
                }
            );
    }


    // ========================================================
    // Formatting
    // ========================================================

    format_datetime(
        value
    ) {
        if (!value) {
            return "—";
        }


        try {
            return (
                frappe.datetime
                    .str_to_user(
                        value
                    )
            );

        } catch (error) {
            return String(
                value
            );
        }
    }


    format_date(
        value
    ) {
        if (!value) {
            return "—";
        }


        try {
            return (
                frappe.datetime
                    .str_to_user(
                        value
                    )
            );

        } catch (error) {
            return String(
                value
            );
        }
    }


    get_status_class(
        status
    ) {
        const classes = {
            "غير مؤكدة":
                "status-unconfirmed",

            "مؤكدة":
                "status-confirmed",

            "مرتجعة":
                "status-returned",

            "محضورة":
                "status-held",
        };


        return (
            classes[
                status
            ]
            ||
            ""
        );
    }


    // ========================================================
    // Safe HTML
    // ========================================================

    escape(
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


    escape_value(
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


        return this.escape(
            value
        );
    }


    escape_attribute(
        value
    ) {
        return this.escape(
            value
        )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#39;"
            );
    }
};