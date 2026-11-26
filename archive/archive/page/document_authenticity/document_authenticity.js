frappe.pages["document-authenticity"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("فحص المستندات"),
        single_column: true,
    });

    $(wrapper).addClass("archive-document-authenticity-page");

    const state = {
        file: null,
        checking: false,
        capabilities: {
            loaded: false,
            can_check: false,
            can_view_history: false,
            history_scope: null,
            can_view_own_checks: false,
            can_view_all_checks: false,
            can_view_technical_details: false,
        },

        history: {
            search: "",
            status: "",
            page: 1,
            page_length: 20,

            search_timer: null,
            request_id: 0,

            is_open: false,
            initialized: false,
        },
    };

    const $main = $(wrapper).find(".layout-main-section");

    $main.html(`
        <div class="archive-authenticity-page" dir="rtl">
            <!-- Unified Page Header -->
            <div class="archive-auth-page-header">
                <div class="archive-auth-header-text">
                    <span class="archive-auth-brand-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            <path d="m9 12 2 2 4-4"/>
                        </svg>
                    </span>
                    <div class="archive-auth-title-col">
                        <h1>${__("فحص المستندات")}</h1>
                        <p class="archive-auth-subtitle">${__("فحص أصالة مستندات PDF ومقارنتها بالقوالب الأصلية ومتابعة سجل الفحوصات")}</p>
                    </div>
                </div>
            </div>

            <!-- Upload & Check Card -->
            <div class="card archive-auth-upload-card archive-auth-check-section">
                <div class="archive-auth-upload-top">
                    <div class="archive-auth-upload-header">
                        <div class="archive-auth-upload-icon" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 3H14L19 8V20C19 20.55 18.55 21 18 21H7C6.45 21 6 20.55 6 20V4C6 3.45 6.45 3 7 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                                <path d="M14 3V8H19" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                                <path d="M9 13H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                                <path d="M9 17H14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            </svg>
                        </div>
                        <div>
                            <h4 class="archive-auth-upload-title">${__("فحص مستند PDF")}</h4>
                            <div class="archive-auth-upload-description">
                                ${__("ارفع مستند PDF لفحص بنيته الفنية ومقارنتها بالقوالب الأصلية المعروفة.")}
                            </div>
                        </div>
                    </div>

                    <div class="archive-auth-upload-controls">
                        <button type="button" class="btn archive-auth-upload">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M12 16V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                <path d="M8 9L12 5L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M5 15V19H19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <span>${__("اختيار ملف PDF")}</span>
                        </button>

                        <button type="button" class="btn archive-auth-check" disabled>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2"/>
                            </svg>
                            <span class="archive-auth-check-label">${__("فحص المستند")}</span>
                        </button>
                    </div>
                </div>

                <!-- Selected file -->
                <div class="archive-auth-selected-file">
                    <div class="archive-auth-selected-file-icon" aria-hidden="true">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M7 3H14L19 8V20H7V3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                            <path d="M14 3V8H19" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    </div>

                    <div class="archive-auth-selected-file-content">
                        <div class="archive-auth-selected-file-label">${__("الملف")}</div>
                        <div class="archive-auth-selected-file-value">${__("لم يتم اختيار ملف بعد.")}</div>
                    </div>
                </div>
            </div>

            <div class="archive-auth-result"></div>
            <div class="archive-auth-history"></div>
        </div>
    `);

    const $upload_button =
        $main.find(".archive-auth-upload");

    const $check_button =
        $main.find(".archive-auth-check");

    const $selected_file =
        $main.find(".archive-auth-selected-file");

    const $result =
        $main.find(".archive-auth-result");
    const $history =
        $main.find(
            ".archive-auth-history"
        );


    $upload_button.on("click", function () {
        open_uploader();
    });


    $check_button.on("click", function () {
        run_check();
    });

    load_authenticity_capabilities();


    function open_uploader() {
        new frappe.ui.FileUploader({
            allow_multiple: false,

            make_attachments_public: false,

            allow_toggle_private: false,

            allow_web_link: false,

            allow_take_photo: false,

            allow_google_drive: false,

            restrictions: {
                max_number_of_files: 1,

                allowed_file_types: [
                    ".pdf",
                ],
            },

            on_success(file_doc) {
                if (!file_doc || !file_doc.name) {
                    frappe.msgprint(
                        __("تعذر الحصول على بيانات الملف المرفوع.")
                    );

                    return;
                }

                state.file = file_doc;

                $selected_file.addClass("has-file");

                $selected_file.html(`
                <div
                    class="
                        archive-auth-selected-file-icon
                    "
                >
                    <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                    >
                        <path
                            d="
                                M7 3
                                H14
                                L19 8
                                V20
                                H7
                                V3
                                Z
                            "
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linejoin="round"
                        />

                        <path
                            d="
                                M14 3
                                V8
                                H19
                            "
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linejoin="round"
                        />

                        <path
                            d="
                                M9 14
                                L11 16
                                L15 12
                            "
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>


                <div
                    class="
                        archive-auth-selected-file-content
                    "
                >
                    <div
                        class="
                            archive-auth-selected-file-label
                        "
                    >
                        ${__(
                            "الملف المحدد"
                        )}
                    </div>

                    <div
                        class="
                            archive-auth-selected-file-value
                        "
                        style="
                            direction: ltr;
                            text-align: right;
                        "
                    >
                        ${frappe.utils.escape_html(
                            file_doc.file_name
                            || file_doc.name
                        )}
                    </div>
                </div>
            `);

                $check_button.prop(
                    "disabled",
                    false
                );

                $result
                    .hide()
                    .empty();
            },
        });
    }


    function run_check() {
        if (!state.file || !state.file.name) {
            frappe.msgprint(
                __("اختر ملف PDF أولًا.")
            );

            return;
        }

        if (state.checking) {
            return;
        }

        state.checking = true;

        $check_button.prop("disabled", true);
        $check_button
            .find(".archive-auth-check-label")
            .text(__("جاري الفحص..."));

        frappe.call({
            method:
                "archive.api.document_authenticity.check_pdf",

            args: {
                file_id:
                    state.file.name,
            },

            freeze: true,

            freeze_message:
                __("جاري فحص المستند..."),

            callback(r) {
                if (!r.message) {
                    return;
                }

                render_result(
                    r.message
                );

                state.history.page = 1;

                /*
                * إذا كان المستخدم قد فتح سجل الفحوصات سابقًا،
                * نحدّثه بعد الفحص الجديد.
                *
                * أما إذا لم يفتحه بعد، فلا نجلب السجل في الخلفية.
                */
                if (
                    state.history.initialized
                ) {
                    load_history_results();
                }
            },

            always() {
                state.checking = false;

                $check_button.prop("disabled", false);
                $check_button
                    .find(".archive-auth-check-label")
                    .text(__("فحص المستند"));
            },
        });
    }

    function load_authenticity_capabilities() {
        frappe.call({
            method:
                "archive.api.document_authenticity.get_authenticity_capabilities",

            callback(r) {
                const capabilities =
                    r.message || {};

                state.capabilities.loaded = true;

                state.capabilities.can_check =
                    !!capabilities.can_check;

                state.capabilities.can_view_history =
                    !!capabilities.can_view_history;

                state.capabilities.history_scope =
                    capabilities.history_scope
                    || null;

                state.capabilities.can_view_own_checks =
                    !!capabilities.can_view_own_checks;

                state.capabilities.can_view_all_checks =
                    !!capabilities.can_view_all_checks;

                state.capabilities.can_view_technical_details =
                    !!capabilities.can_view_technical_details;

                const $check_section =
                    $(".archive-auth-check-section");

                if (
                    state.capabilities.can_check
                ) {
                    $check_section.show();
                } else {
                    $check_section.hide();

                    state.file = null;

                    $(".archive-auth-selected-file")
                        .removeClass("has-file")
                        .empty();
                }

                if (
                    state.capabilities.can_view_history
                ) {
                    render_history_collapsible();
                    return;
                }

                state.history.is_open = false;
                state.history.initialized = false;

                $history.empty();
            },

            error() {
                state.capabilities.loaded = true;

                state.history.is_open = false;
                state.history.initialized = false;

                $history.empty();
            },
        });
    }

    function render_history_collapsible() {
        $history.html(`
            <div class="archive-auth-history-collapsible">
                <button
                    type="button"
                    class="
                        archive-auth-history-toggle
                    "
                    aria-expanded="false"
                >
                    <div
                        class="
                            archive-auth-history-toggle-main
                        "
                    >
                        <div
                            class="
                                archive-auth-history-toggle-icon
                            "
                        >
                            <svg
                                width="19"
                                height="19"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                            >
                                <path
                                    d="
                                        M5 4
                                        H19
                                        V20
                                        H5
                                        V4
                                        Z
                                    "
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linejoin="round"
                                />

                                <path
                                    d="M8 8H16"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                />

                                <path
                                    d="M8 12H16"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                />

                                <path
                                    d="M8 16H13"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                />
                            </svg>
                        </div>


                        <div>
                            <div
                                class="
                                    archive-auth-history-toggle-title
                                "
                            >
                                ${__(
                                    "سجل الفحوصات السابقة"
                                )}
                            </div>

                            <div
                                class="
                                    archive-auth-history-toggle-subtitle
                                "
                            >
                                ${__(
                                    "البحث والوصول إلى نتائج الفحوصات المحفوظة."
                                )}
                            </div>
                        </div>
                    </div>


                    <div
                        class="
                            archive-auth-history-toggle-action
                        "
                    >
                        <span
                            class="
                                archive-auth-history-toggle-action-text
                            "
                        >
                            ${__(
                                "عرض السجل"
                            )}
                        </span>

                        <span
                            class="
                                archive-auth-history-chevron
                            "
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                            >
                                <path
                                    d="
                                        M6 9
                                        L12 15
                                        L18 9
                                    "
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </span>
                    </div>
                </button>


                <div
                    class="
                        archive-auth-history-body
                    "
                ></div>
            </div>
        `);


        const $collapsible =
            $history.find(
                ".archive-auth-history-collapsible"
            );

        const $toggle =
            $history.find(
                ".archive-auth-history-toggle"
            );

        const $body =
            $history.find(
                ".archive-auth-history-body"
            );

        const $action_text =
            $history.find(
                ".archive-auth-history-toggle-action-text"
            );


        $toggle.on(
            "click",
            function () {
                /*
                * إغلاق السجل.
                */
                if (
                    state.history.is_open
                ) {
                    state.history.is_open =
                        false;

                    $collapsible.removeClass(
                        "is-open"
                    );

                    $toggle.attr(
                        "aria-expanded",
                        "false"
                    );

                    $action_text.text(
                        __("عرض السجل")
                    );

                    $body
                        .stop(
                            true,
                            true
                        )
                        .slideUp(
                            180
                        );

                    return;
                }


                /*
                * فتح السجل.
                */
                state.history.is_open =
                    true;

                $collapsible.addClass(
                    "is-open"
                );

                $toggle.attr(
                    "aria-expanded",
                    "true"
                );

                $action_text.text(
                    __("إخفاء السجل")
                );


                /*
                * أول مرة فقط:
                * نبني المحرك ونطلب البيانات.
                */
                if (
                    !state.history.initialized
                ) {
                    state.history.initialized =
                        true;

                    render_history_shell();

                    load_history_results({
                        show_loading: true,
                    });
                }


                $body
                    .stop(
                        true,
                        true
                    )
                    .slideDown(
                        200
                    );
            }
        );
    }

    function render_history_shell() {
        $history
            .find(".archive-auth-history-body")
            .html(`
            <div class="archive-auth-history-card">
                <!-- Search / Status / Refresh -->
                <div class="archive-auth-history-filter-panel">
                    <!-- Search -->
                    <div
                        class="
                            archive-auth-filter-group
                        "
                    >
                        <label
                            class="
                                archive-auth-filter-label
                            "
                        >
                            ${__("البحث")}
                        </label>


                        <div
                            class="
                                archive-auth-search-wrap
                            "
                        >
                            <span
                                class="
                                    archive-auth-search-icon
                                "
                            >
                                <svg
                                    width="17"
                                    height="17"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden="true"
                                >
                                    <circle
                                        cx="11"
                                        cy="11"
                                        r="7"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    />

                                    <path
                                        d="M16.5 16.5L21 21"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                    />
                                </svg>
                            </span>


                            <input
                                type="text"
                                class="
                                    form-control
                                    archive-auth-history-search
                                "
                                value="${frappe.utils.escape_html(
                                    state.history.search || ""
                                )}"
                                placeholder="${__(
                                    "رقم الفحص، اسم الملف، اسم المستخدم أو البريد"
                                )}"
                                autocomplete="off"
                                dir="auto"
                            >
                        </div>
                    </div>


                    <!-- Status -->
                    <div
                        class="
                            archive-auth-filter-group
                        "
                    >
                        <label
                            class="
                                archive-auth-filter-label
                            "
                        >
                            ${__("الحالة")}
                        </label>


                        <select
                            class="
                                form-control
                                archive-auth-history-status
                            "
                        >
                            ${render_history_status_options()}
                        </select>
                    </div>

                    <!-- Refresh -->
                    <div class="archive-auth-filter-group">
                        <button type="button" class="btn btn-sm archive-auth-refresh-history">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
                                <path d="M21 3v6h-6"/>
                            </svg>
                            <span>${__("تحديث")}</span>
                        </button>
                    </div>
                </div>


                <!-- =========================
                    Result meta
                ========================== -->
                <div
                    class="
                        archive-auth-history-meta
                    "
                >
                    <div
                        class="
                            archive-auth-history-count-wrap
                        "
                    >
                        <span>
                            ${__("عدد النتائج")}
                        </span>

                        <span
                            class="
                                archive-auth-history-count
                            "
                        >
                            0
                        </span>

                        <span
                            class="
                                archive-auth-history-loading
                            "
                        >
                            ${__("جاري التحديث...")}
                        </span>
                    </div>


                    <div
                        class="
                            archive-auth-history-page-label
                        "
                    >
                        ${__("الصفحة")}
                        1
                        ${__("من")}
                        1
                    </div>
                </div>


                <!-- =========================
                    Results
                ========================== -->
                <div
                    class="
                        archive-auth-history-results
                    "
                >
                    <div
                        class="
                            archive-auth-history-empty-loading
                        "
                    >
                        ${__(
                            "جاري تحميل سجل الفحوصات..."
                        )}
                    </div>
                </div>


                <!-- =========================
                    Pagination
                ========================== -->
                <div
                    class="
                        archive-auth-history-pagination
                    "
                ></div>
            </div>
        `);


        bind_history_controls();
    }


    function bind_history_controls() {
        /*
        * جميع أحداث السجل Delegated Events.
        *
        * حقل البحث نفسه ثابت ولا يعاد إنشاؤه
        * عند وصول نتائج جديدة.
        */
        $history.off(
            ".archiveAuthHistory"
        );


        /*
        * البحث اللحظي.
        */
        $history.on(
            "input.archiveAuthHistory",
            ".archive-auth-history-search",
            function () {
                state.history.search =
                    (
                        $(this).val()
                        || ""
                    ).trim();

                state.history.page = 1;

                cancel_history_search_timer();

                state.history.search_timer =
                    setTimeout(
                        function () {
                            state.history.search_timer =
                                null;

                            load_history_results();
                        },
                        150
                    );
            }
        );


        /*
        * تغيير الحالة لحظي.
        */
        $history.on(
            "change.archiveAuthHistory",
            ".archive-auth-history-status",
            function () {
                state.history.status =
                    (
                        $(this).val()
                        || ""
                    ).trim();

                state.history.page = 1;

                cancel_history_search_timer();

                load_history_results();
            }
        );


        /*
        * تحديث يدوي للسجل.
        * ليس زر بحث.
        */
        $history.on(
            "click.archiveAuthHistory",
            ".archive-auth-refresh-history",
            function () {
                cancel_history_search_timer();

                load_history_results();
            }
        );


        /*
        * التنقل بين الصفحات.
        */
        $history.on(
            "click.archiveAuthHistory",
            ".archive-auth-history-page",
            function () {
                if (
                    $(this).prop(
                        "disabled"
                    )
                ) {
                    return;
                }

                const target_page =
                    Number(
                        $(this).attr(
                            "data-page"
                        )
                    );

                if (
                    !target_page
                    || target_page < 1
                    || target_page === state.history.page
                ) {
                    return;
                }

                state.history.page =
                    target_page;

                cancel_history_search_timer();

                load_history_results();
            }
        );


        /*
        * عرض السجل المحفوظ.
        */
        $history.on(
            "click.archiveAuthHistory",
            ".archive-auth-show-check",
            function () {
                toggle_history_check(
                    $(this)
                );
            }
        );
    }


    function cancel_history_search_timer() {
        if (
            !state.history.search_timer
        ) {
            return;
        }

        clearTimeout(
            state.history.search_timer
        );

        state.history.search_timer =
            null;
    }


    function load_history_results(
        {
            show_loading = false,
        } = {}
    ) {
        const request_id =
            ++state.history.request_id;

        const $results =
            $history.find(
                ".archive-auth-history-results"
            );

        const $loading =
            $history.find(
                ".archive-auth-history-loading"
            );


        /*
        * شاشة التحميل الكبيرة تظهر فقط
        * في أول تحميل للصفحة.
        *
        * أثناء البحث نبقي النتائج القديمة
        * حتى تصل النتائج الجديدة.
        */
        if (
            show_loading
        ) {
            $results.html(`
                <div
                    class="text-muted"
                    style="
                        padding: 32px 0;
                        text-align: center;
                    "
                >
                    ${__(
                        "جاري تحميل سجل الفحوصات..."
                    )}
                </div>
            `);
        }


        $loading.show();


        frappe.call({
            method:
                "archive.api.document_authenticity.get_check_history",

            args: {
                search:
                    state.history.search,

                status:
                    state.history.status,

                page:
                    state.history.page,

                page_length:
                    state.history.page_length,
            },

            callback(r) {
                /*
                * إذا وصل رد قديم بعد رد أحدث
                * يتم تجاهله بالكامل.
                */
                if (
                    request_id
                    !== state.history.request_id
                ) {
                    return;
                }

                render_history_results(
                    r.message || {
                        rows: [],
                        total: 0,
                        page: 1,
                        page_length:
                            state.history.page_length,
                        total_pages: 1,
                    }
                );
            },

            error() {
                if (
                    request_id
                    !== state.history.request_id
                ) {
                    return;
                }

                $results.html(`
                    <div
                        class="text-muted"
                        style="
                            padding: 32px 0;
                            text-align: center;
                        "
                    >
                        ${__(
                            "تعذر تحميل سجل الفحوصات."
                        )}
                    </div>
                `);
            },

            always() {
                if (
                    request_id
                    !== state.history.request_id
                ) {
                    return;
                }

                $loading.hide();
            },
        });
    }


    function render_history_results(
        result
    ) {
        const rows =
            Array.isArray(
                result.rows
            )
                ? result.rows
                : [];

        const total =
            Number(
                result.total || 0
            );

        const page =
            Math.max(
                1,
                Number(
                    result.page || 1
                )
            );

        const total_pages =
            Math.max(
                1,
                Number(
                    result.total_pages || 1
                )
            );


        state.history.page =
            page;


        const $results =
            $history.find(
                ".archive-auth-history-results"
            );

        const $count =
            $history.find(
                ".archive-auth-history-count"
            );

        const $page_label =
            $history.find(
                ".archive-auth-history-page-label"
            );

        const $pagination =
            $history.find(
                ".archive-auth-history-pagination"
            );


        /*
        * هذه العناصر فقط هي التي تتغير.
        *
        * حقل البحث لا يتم لمسه أبدًا.
        */
        $count.text(
            total
        );


        $page_label.text(
            `${__("الصفحة")} ${page} ${__("من")} ${total_pages}`
        );


        if (
            rows.length
        ) {
            $results.html(
                rows
                    .map(
                        (row) =>
                            render_history_row(
                                row
                            )
                    )
                    .join("")
            );
        } else {
            $results.html(`
                <div
                    class="text-muted"
                    style="
                        padding: 32px 0;
                        text-align: center;
                    "
                >
                    ${__(
                        "لا توجد نتائج مطابقة."
                    )}
                </div>
            `);
        }


        $pagination.html(
            render_history_pagination(
                page,
                total_pages
            )
        );
    }


    function render_history_status_options() {
        const options = [
            {
                value: "",
                label: __("كل الحالات"),
            },
            {
                value: "صحيح",
                label: __("صحيح"),
            },
            {
                value: "مزور",
                label: __("مزور"),
            },
            {
                value: "مشتبه به",
                label: __("مشتبه به"),
            },
            {
                value: "قالب غير معروف",
                label: __("قالب غير معروف"),
            },
        ];

        return options
            .map(
                (option) => {
                    const selected =
                        (
                            state.history.status
                            === option.value
                        )
                            ? "selected"
                            : "";

                    return `
                        <option
                            value="${frappe.utils.escape_html(
                                option.value
                            )}"
                            ${selected}
                        >
                            ${frappe.utils.escape_html(
                                option.label
                            )}
                        </option>
                    `;
                }
            )
            .join("");
    }


    function render_history_pagination(
        page,
        total_pages
    ) {
        if (
            total_pages <= 1
        ) {
            return "";
        }

        return `
            <div class="archive-auth-pagination-bar">
                <button
                    type="button"
                    class="btn btn-default btn-sm archive-auth-history-page"
                    data-page="${page - 1}"
                    ${page <= 1 ? "disabled" : ""}
                >
                    ${__("السابق")}
                </button>

                <span class="archive-auth-history-page-label">
                    ${__("الصفحة")} ${page} ${__("من")} ${total_pages}
                </span>

                <button
                    type="button"
                    class="btn btn-default btn-sm archive-auth-history-page"
                    data-page="${page + 1}"
                    ${page >= total_pages ? "disabled" : ""}
                >
                    ${__("التالي")}
                </button>
            </div>
        `;
    }


    function toggle_history_check(
        $button
    ) {
        const $row =
            $button.closest(
                ".archive-auth-history-row"
            );

        const $details =
            $row.find(
                ".archive-auth-history-details"
            );

        const check_name =
            $button.attr(
                "data-check-name"
            );


        if (
            $details.is(
                ":visible"
            )
        ) {
            $details.hide();

            $button.text(
                __("عرض السجل")
            );

            return;
        }


        if (
            $details.data(
                "loaded"
            )
        ) {
            $details.show();

            $button.text(
                __("إخفاء السجل")
            );

            return;
        }


        $button
            .prop(
                "disabled",
                true
            )
            .text(
                __("جاري التحميل...")
            );


        frappe.call({
            method:
                "archive.api.document_authenticity.get_check_details",

            args: {
                check_name:
                    check_name,
            },

            callback(r) {
                if (
                    !r.message
                ) {
                    return;
                }

                render_result(
                    r.message,
                    $details,
                    false
                );

                $details.data(
                    "loaded",
                    true
                );

                $button.text(
                    __("إخفاء السجل")
                );
            },

            always() {
                $button.prop(
                    "disabled",
                    false
                );

                if (
                    !$details.is(
                        ":visible"
                    )
                ) {
                    $button.text(
                        __("عرض السجل")
                    );
                }
            },
        });
    }


    

    function render_history_row(row) {
        const status =
            row.status || "";

        const appearance =
            get_status_appearance(
                status
            );

        const file_name =
            frappe.utils.escape_html(
                row.file_name || "-"
            );

        const check_name =
            frappe.utils.escape_html(
                row.name || "-"
            );

        const profile =
            frappe.utils.escape_html(
                row.profile || "-"
            );

        const checked_by_full_name =
            frappe.utils.escape_html(
                row.checked_by_full_name
                    || row.checked_by
                    || "-"
            );

        const checked_by =
            frappe.utils.escape_html(
                row.checked_by || "-"
            );

        const risk_score =
            frappe.utils.escape_html(
                String(
                    row.risk_score ?? 0
                )
            );

        const checked_at =
            format_history_datetime(
                row.checked_at
            );

        return `
            <div class="archive-auth-history-row">
                <div class="archive-auth-history-row-top">
                    <div class="archive-auth-history-row-info">
                        <div class="archive-auth-history-file-name">
                            ${file_name}
                        </div>

                        <div class="archive-auth-history-subline">
                            ${check_name} · ${profile}
                        </div>

                        <div class="archive-auth-history-meta-list">
                            <div>
                                <span class="text-muted">${__("بواسطة")}:</span>
                                <strong>${checked_by_full_name}</strong>
                            </div>

                            <div>
                                <span class="text-muted">${__("المستخدم")}:</span>
                                <span style="direction: ltr; unicode-bidi: embed;">${checked_by}</span>
                            </div>

                            <div>
                                <span class="text-muted">${__("وقت الفحص")}:</span>
                                <span>${checked_at}</span>
                            </div>
                        </div>
                    </div>

                    <div class="archive-auth-history-row-metrics">
                        <span class="archive-auth-status-pill ${appearance.badge_class}">
                            ${frappe.utils.escape_html(status)}
                        </span>

                        <div class="archive-auth-risk-pill">
                            <span class="archive-auth-risk-pill-label">${__("الخطورة")}</span>
                            <span class="archive-auth-risk-pill-value" style="color: ${appearance.color};">${risk_score}/100</span>
                        </div>
                    </div>
                </div>

                <div class="archive-auth-history-row-actions">
                    <button
                        type="button"
                        class="btn btn-default btn-sm archive-auth-show-check"
                        data-check-name="${check_name}"
                    >
                        ${__("عرض السجل")}
                    </button>
                </div>

                <div class="archive-auth-history-details"></div>
            </div>
        `;
    }


    function format_history_datetime(
        value
    ) {
        if (!value) {
            return "-";
        }
        if (typeof window.archive_format_datetime === "function") {
            return frappe.utils.escape_html(window.archive_format_datetime(value, "-"));
        }

        const clean = String(value).trim().replace(/\.\d+$/, "");
        let resolved = clean;
        try {
            if (frappe?.datetime?.convert_to_user_tz && /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(clean)) {
                const converted = frappe.datetime.convert_to_user_tz(clean, true);
                if (converted && converted !== "Invalid date") {
                    resolved = String(converted).trim().replace(/\.\d+$/, "");
                }
            }
        } catch (error) {
            // fallback
        }
        const m = resolved.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
        if (m) {
            const h24 = parseInt(m[2], 10);
            const min = String(m[3]).padStart(2, "0");
            const period = h24 >= 12 ? "م" : "ص";
            const h12 = String(h24 % 12 || 12).padStart(2, "0");
            return frappe.utils.escape_html(`${m[1]}، ${h12}:${min} ${period}`);
        }
        return frappe.utils.escape_html(resolved);
    }

    function render_result(
        result,
        $target = $result,
        scroll_to_result = true
    ) {
        const status =
            result.status || "";

        const appearance =
            get_status_appearance(
                status
            );

        const risk_score =
            frappe.utils.escape_html(
                String(
                    result.risk_score ?? 0
                )
            );
        /*
        * هذا التصميم يطبق فقط على نتيجة الفحص المباشرة.
        *
        * عند عرض سجل سابق، render_result() تستقبل $details
        * بدل $result، وبالتالي لن تطبق هذه الألوان.
        */
        const is_live_result =
            (
                $target
                && $result
                && $target[0]
                === $result[0]
            );


        let live_state_class = "";

        if (is_live_result && status === "صحيح") {
            live_state_class = "is-live-valid";
        } else if (is_live_result && status === "مزور") {
            live_state_class = "is-live-forged";
        } else if (is_live_result && status === "مشتبه به") {
            live_state_class = "is-live-suspicious";
        }

        const summary =
            frappe.utils.escape_html(
                result.summary || ""
            );

        const profile =
            frappe.utils.escape_html(
                result.profile || ""
            );

        const language =
            frappe.utils.escape_html(
                result.language || ""
            );

        const check_name =
            frappe.utils.escape_html(
                result.name || ""
            );

        const engine_version =
            frappe.utils.escape_html(
                result.engine_version || ""
            );

        const tamper_signals =
            frappe.utils.escape_html(
                String(
                    result.tamper_signals ?? 0
                )
            );

        const findings =
            Array.isArray(
                result.findings
            )
                ? result.findings
                : [];

        $target.html(`
            <div class="card archive-auth-result-card ${live_state_class}">
                <div class="archive-auth-result-top">
                    <div>
                        <div class="archive-auth-result-kicker">
                            ${__("نتيجة الفحص")}
                        </div>

                        <h3 class="archive-auth-result-status" style="color: ${appearance.color};">
                            ${frappe.utils.escape_html(status)}
                        </h3>
                    </div>

                    <div class="archive-auth-result-risk-box">
                        <div class="archive-auth-result-kicker">
                            ${__("درجة الخطورة")}
                        </div>

                        <strong class="archive-auth-result-risk-value" style="color: ${appearance.color};">
                            ${risk_score}/100
                        </strong>
                    </div>
                </div>

                <div class="archive-auth-result-summary ${live_state_class}">
                    ${summary}
                </div>

                <div class="archive-auth-info-grid">
                    ${render_info(__("اللغة"), language)}
                    ${render_info(__("القالب"), profile)}
                    ${render_info(__("إشارات التعديل"), tamper_signals)}
                    ${render_info(__("سجل الفحص"), check_name)}
                    ${render_info(__("إصدار المحرك"), engine_version)}
                </div>

                <div class="archive-auth-findings-section">
                    <button
                        type="button"
                        class="btn btn-default btn-sm archive-auth-toggle-findings"
                    >
                        ${__("عرض التفاصيل الفنية")}
                    </button>

                    <div class="archive-auth-findings">
                        ${render_findings(findings)}
                    </div>
                </div>
            </div>
        `);

        const $toggle =
            $target.find(
                ".archive-auth-toggle-findings"
            );

        const $findings =
            $target.find(
                ".archive-auth-findings"
            );

        $toggle.on(
            "click",
            function () {
                const is_visible =
                    $findings.is(
                        ":visible"
                    );

                if (is_visible) {
                    $findings.hide();

                    $toggle.text(
                        __(
                            "عرض التفاصيل الفنية"
                        )
                    );

                    return;
                }

                $findings.show();

                $toggle.text(
                    __(
                        "إخفاء التفاصيل الفنية"
                    )
                );
            }
        );

        $target.show();

        if (
            scroll_to_result
            && $target[0]
        ) {
            $target[0].scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    }

    function render_findings(
        findings
    ) {
        if (!findings.length) {
            return `
                <div class="text-muted">
                    ${__(
                        "لا توجد تفاصيل فنية إضافية."
                    )}
                </div>
            `;
        }

        return findings
            .map(
                (finding) =>
                    render_finding(
                        finding
                    )
            )
            .join("");
    }


    function render_finding(
        finding
    ) {
        const status =
            finding.status || "";

        const appearance =
            get_finding_appearance(
                status
            );

        const label =
            frappe.utils.escape_html(
                finding.label
                    || finding.code
                    || __("فحص فني")
            );

        const message =
            frappe.utils.escape_html(
                finding.message || ""
            );

        const code =
            frappe.utils.escape_html(
                finding.code || ""
            );

        const actual =
            format_finding_value(
                finding.actual
            );

        const expected =
            format_finding_value(
                finding.expected
            );

        return `
            <div class="archive-auth-finding-row">
                <div class="archive-auth-finding-main">
                    <div class="archive-auth-finding-icon" style="color: ${appearance.color};">
                        ${appearance.icon}
                    </div>

                    <div class="archive-auth-finding-body">
                        <div class="archive-auth-finding-label">
                            ${label}
                        </div>

                        ${
                            message
                                ? `<div class="archive-auth-finding-message">${message}</div>`
                                : ""
                        }

                        <div class="archive-auth-finding-tech">
                            <div><strong>Code:</strong> ${code || "-"}</div>
                            <div><strong>Actual:</strong> ${actual}</div>
                            <div><strong>Expected:</strong> ${expected}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }


    function format_finding_value(
        value
    ) {
        if (
            value === null
            || value === undefined
            || value === ""
        ) {
            return "-";
        }

        if (
            typeof value === "object"
        ) {
            try {
                return frappe.utils.escape_html(
                    JSON.stringify(
                        value
                    )
                );
            } catch (error) {
                return "-";
            }
        }

        return frappe.utils.escape_html(
            String(
                value
            )
        );
    }


    function get_finding_appearance(
        status
    ) {
        if (status === "pass") {
            return {
                icon: "✓",
                color:
                    "var(--green-600)",
            };
        }

        if (status === "warning") {
            return {
                icon: "!",
                color:
                    "var(--orange-600)",
            };
        }

        return {
            icon: "✕",
            color:
                "var(--red-600)",
        };
    }

    function render_info(
        label,
        value
    ) {
        return `
            <div class="archive-auth-info-item">
                <div class="archive-auth-info-label">
                    ${label}
                </div>

                <div class="archive-auth-info-value">
                    ${value || "-"}
                </div>
            </div>
        `;
    }


    function get_status_appearance(
        status
    ) {
        if (status === "صحيح") {
            return {
                color: "var(--archive-emerald-700, #15803d)",
                badge_class: "status-valid",
            };
        }

        if (status === "مزور") {
            return {
                color: "var(--archive-rose-700, #b91c1c)",
                badge_class: "status-forged",
            };
        }

        if (status === "مشتبه به") {
            return {
                color: "var(--archive-amber-700, #b45309)",
                badge_class: "status-suspicious",
            };
        }

        return {
            color: "var(--archive-slate-600, #475569)",
            badge_class: "status-unknown",
        };
    }
};