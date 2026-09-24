frappe.pages["document-authenticity"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("فحص المستندات"),
        single_column: true,
    });

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
        <div
            class="archive-authenticity-page"
            dir="rtl"
            style="
                max-width: 900px;
                margin: 0 auto;
                padding: 20px 0;
            "
        >
            <style>
            /*
            * ==========================================
            * PDF Upload / Check Card
            * ==========================================
            */

            .archive-auth-upload-card {
                position: relative;

                overflow: hidden;

                padding: 24px;

                border:
                    1px solid
                    #cfe8f7 !important;

                border-radius:
                    16px !important;

                background:
                    #ffffff !important;

                box-shadow:
                    0 6px 24px
                    rgba(
                        14,
                        116,
                        144,
                        0.07
                    );
            }


            /*
            * شريط زخرفي خفيف أعلى البطاقة.
            */
            .archive-auth-upload-card::before {
                content: "";

                position: absolute;

                top: 0;
                right: 0;
                left: 0;

                height: 3px;

                background:
                    linear-gradient(
                        90deg,
                        #06b6d4,
                        #14b8a6,
                        #0ea5e9
                    );
            }


            /*
            * رأس البطاقة.
            */
            .archive-auth-upload-header {
                display: flex;

                align-items: center;

                gap: 13px;

                margin-bottom: 22px;
            }


            .archive-auth-upload-icon {
                display: flex;

                align-items: center;

                justify-content: center;

                width: 46px;

                height: 46px;

                flex:
                    0 0 46px;

                border-radius:
                    13px;

                background:
                    linear-gradient(
                        135deg,
                        #e0f2fe,
                        #ccfbf1
                    );

                color:
                    #0369a1;
            }


            .archive-auth-upload-title {
                margin: 0;

                color:
                    #0f4c5c;

                font-size:
                    17px;

                font-weight:
                    700;
            }


            .archive-auth-upload-description {
                margin-top:
                    5px;

                color:
                    #4b7b88;

                font-size:
                    12px;

                line-height:
                    1.7;
            }


            /*
            * منطقة اختيار الملف والأزرار.
            */
            .archive-auth-upload-controls {
                display: flex;

                align-items: center;

                gap: 10px;

                flex-wrap: wrap;

                margin-bottom:
                    16px;
            }


            /*
            * زر اختيار الملف.
            */
            .archive-auth-upload {
                display: inline-flex;

                align-items: center;

                justify-content: center;

                gap: 7px;

                min-height:
                    40px;

                padding:
                    0 16px !important;

                border:
                    1px solid
                    #7dd3fc !important;

                border-radius:
                    9px !important;

                background:
                    #f0f9ff !important;

                color:
                    #0369a1 !important;

                font-weight:
                    600 !important;

                box-shadow:
                    none !important;

                transition:
                    background-color 0.16s ease,
                    border-color 0.16s ease,
                    transform 0.16s ease;
            }


            .archive-auth-upload:hover {
                border-color:
                    #38bdf8 !important;

                background:
                    #e0f2fe !important;

                color:
                    #075985 !important;
            }


            /*
            * زر الفحص.
            */
            .archive-auth-check {
                display: inline-flex;

                align-items: center;

                justify-content: center;

                gap: 7px;

                min-height:
                    40px;

                padding:
                    0 18px !important;

                margin-right:
                    0 !important;

                border:
                    1px solid
                    #0d9488 !important;

                border-radius:
                    9px !important;

                background:
                    linear-gradient(
                        135deg,
                        #0891b2,
                        #0d9488
                    ) !important;

                color:
                    #ffffff !important;

                font-weight:
                    600 !important;

                box-shadow:
                    0 3px 10px
                    rgba(
                        13,
                        148,
                        136,
                        0.16
                    ) !important;

                transition:
                    opacity 0.16s ease,
                    transform 0.16s ease,
                    box-shadow 0.16s ease;
            }


            .archive-auth-check:not(:disabled):hover {
                transform:
                    translateY(-1px);

                box-shadow:
                    0 5px 14px
                    rgba(
                        13,
                        148,
                        136,
                        0.22
                    ) !important;
            }


            .archive-auth-check:disabled {
                opacity:
                    0.45 !important;

                cursor:
                    not-allowed !important;

                box-shadow:
                    none !important;
            }


            /*
            * صندوق الملف المحدد.
            */
            .archive-auth-selected-file {
                position: relative;

                display: flex;

                align-items: center;

                gap: 12px;

                min-height:
                    54px;

                padding:
                    12px 14px !important;

                border:
                    1px solid
                    #bae6fd !important;

                border-radius:
                    11px !important;

                background:
                    linear-gradient(
                        135deg,
                        #f0f9ff 0%,
                        #ecfeff 100%
                    ) !important;

                color:
                    #155e75;

                transition:
                    border-color 0.16s ease,
                    background-color 0.16s ease;
            }


            .archive-auth-selected-file-icon {
                display: flex;

                align-items: center;

                justify-content: center;

                width: 34px;

                height: 34px;

                flex:
                    0 0 34px;

                border-radius:
                    9px;

                background:
                    #cffafe;

                color:
                    #0891b2;
            }


            .archive-auth-selected-file-content {
                min-width: 0;

                flex: 1;
            }


            .archive-auth-selected-file-label {
                color:
                    #0e7490;

                font-size:
                    11px;

                font-weight:
                    600;
            }


            .archive-auth-selected-file-value {
                margin-top:
                    2px;

                color:
                    #164e63;

                font-size:
                    13px;

                word-break:
                    break-word;
            }


            /*
            * Responsive.
            */
            @media (
                max-width: 600px
            ) {
                .archive-auth-upload-card {
                    padding:
                        18px;
                }


                .archive-auth-upload-controls {
                    display:
                        grid;

                    grid-template-columns:
                        1fr 1fr;
                }


                .archive-auth-upload,
                .archive-auth-check {
                    width:
                        100%;
                }
            }
        </style>


        <div
            class="
                card
                archive-auth-upload-card
                archive-auth-check-section
            "
            >
            <!-- =========================
                Header
            ========================== -->
            <div
                class="
                    archive-auth-upload-header
                "
                >
                <div
                    class="
                        archive-auth-upload-icon
                    "
                >
                    <svg
                        width="23"
                        height="23"
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
                                C19 20.55
                                18.55 21
                                18 21
                                H7
                                C6.45 21
                                6 20.55
                                6 20
                                V4
                                C6 3.45
                                6.45 3
                                7 3
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
                                M9 13
                                H16
                            "
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                        />

                        <path
                            d="
                                M9 17
                                H14
                            "
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                        />
                    </svg>
                </div>


                <div>
                    <h4
                        class="
                            archive-auth-upload-title
                        "
                    >
                        ${__(
                            "فحص مستند PDF"
                        )}
                    </h4>

                    <div
                        class="
                            archive-auth-upload-description
                        "
                    >
                        ${__(
                            "ارفع مستند PDF لفحص بنيته الفنية ومقارنتها بالقوالب الأصلية المعروفة."
                        )}
                    </div>
                </div>
            </div>


            <!-- =========================
                Actions
            ========================== -->
            <div
                class="
                    archive-auth-upload-controls
                "
            >
                <button
                    type="button"
                    class="
                        btn
                        archive-auth-upload
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
                                M12 16
                                V5
                            "
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />

                        <path
                            d="
                                M8 9
                                L12 5
                                L16 9
                            "
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />

                        <path
                            d="
                                M5 15
                                V19
                                H19
                                V15
                            "
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>

                    <span>
                        ${__(
                            "اختيار ملف PDF"
                        )}
                    </span>
                </button>


                <button
                    type="button"
                    class="
                        btn
                        archive-auth-check
                    "
                    disabled
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
                                M9 12
                                L11 14
                                L15 10
                            "
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />

                        <circle
                            cx="12"
                            cy="12"
                            r="8"
                            stroke="currentColor"
                            stroke-width="2"
                        />
                    </svg>

                    <span>
                        ${__(
                            "فحص المستند"
                        )}
                    </span>
                </button>
            </div>


            <!-- =========================
                Selected file
            ========================== -->
            <div
                class="
                    archive-auth-selected-file
                "
            >
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
                            "الملف"
                        )}
                    </div>

                    <div
                        class="
                            archive-auth-selected-file-value
                        "
                    >
                        ${__(
                            "لم يتم اختيار ملف بعد."
                        )}
                    </div>
                </div>
            </div>
        </div>  

            <div
                class="archive-auth-result"
                style="
                    display: none;
                    margin-top: 20px;
                "
            ></div>

            <div
                class="archive-auth-history"
                style="
                    margin-top: 20px;
                "
            ></div>
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

        $check_button
            .prop("disabled", true)
            .text(
                __("جاري الفحص...")
            );

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

                $check_button
                    .prop("disabled", false)
                    .text(
                        __("فحص المستند")
                    );
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
            <style>
                .archive-auth-history-collapsible {
                    overflow: hidden;

                    border:
                        1px solid
                        #cfe8f7;

                    border-radius:
                        16px;

                    background:
                        #ffffff;

                    box-shadow:
                        0 5px 20px
                        rgba(
                            14,
                            116,
                            144,
                            0.06
                        );
                }


                .archive-auth-history-toggle {
                    width: 100%;

                    display: flex;

                    justify-content:
                        space-between;

                    align-items: center;

                    gap: 16px;

                    padding:
                        17px 20px;

                    border: 0;

                    background:
                        linear-gradient(
                            135deg,
                            #f0f9ff 0%,
                            #ecfeff 100%
                        );

                    color:
                        #164e63;

                    text-align: right;

                    cursor: pointer;

                    transition:
                        background-color
                        0.16s ease;
                }


                .archive-auth-history-toggle:hover {
                    background:
                        linear-gradient(
                            135deg,
                            #e0f2fe 0%,
                            #cffafe 100%
                        );
                }


                .archive-auth-history-toggle-main {
                    display: flex;

                    align-items: center;

                    gap: 11px;

                    min-width: 0;
                }


                .archive-auth-history-toggle-icon {
                    width: 38px;
                    height: 38px;

                    flex:
                        0 0 38px;

                    display: flex;

                    align-items: center;

                    justify-content: center;

                    border-radius:
                        11px;

                    background:
                        #ffffff;

                    border:
                        1px solid
                        #bae6fd;

                    color:
                        #0284c7;
                }


                .archive-auth-history-toggle-title {
                    color:
                        #0f4c5c;

                    font-size:
                        14px;

                    font-weight:
                        700;
                }


                .archive-auth-history-toggle-subtitle {
                    margin-top:
                        3px;

                    color:
                        #4b7b88;

                    font-size:
                        11px;

                    font-weight:
                        400;
                }


                .archive-auth-history-toggle-action {
                    display: flex;

                    align-items: center;

                    gap: 8px;

                    flex:
                        0 0 auto;

                    color:
                        #0369a1;

                    font-size:
                        12px;

                    font-weight:
                        700;
                }


                .archive-auth-history-chevron {
                    display: flex;

                    align-items: center;

                    justify-content: center;

                    transition:
                        transform
                        0.2s ease;
                }


                .archive-auth-history-collapsible.is-open
                .archive-auth-history-chevron {
                    transform:
                        rotate(180deg);
                }


                .archive-auth-history-body {
                    display: none;

                    padding:
                        18px;
                }


                @media (
                    max-width: 600px
                ) {
                    .archive-auth-history-toggle {
                        padding:
                            15px;
                    }


                    .archive-auth-history-toggle-subtitle {
                        display:
                            none;
                    }


                    .archive-auth-history-toggle-action-text {
                        display:
                            none;
                    }


                    .archive-auth-history-body {
                        padding:
                            12px;
                    }
                }
            </style>


            <div
                class="
                    archive-auth-history-collapsible
                "
            >
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
            .find(
                ".archive-auth-history-body"
            )
            .html(`
            <style>
                .archive-auth-history-card {
                    overflow: hidden;
                    border:
                        1px solid
                        #cfe8f7 !important;
                    border-radius:
                        16px !important;
                    background:
                        #ffffff !important;
                    box-shadow:
                        0 6px 24px
                        rgba(
                            14,
                            116,
                            144,
                            0.07
                        );
                }


                .archive-auth-history-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                    flex-wrap: wrap;

                    margin-bottom: 20px;
                }


                .archive-auth-history-title-wrap {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }


                .archive-auth-history-title-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;

                    width: 42px;
                    height: 42px;

                    flex: 0 0 42px;

                    border-radius: 12px;

                    background:
                        linear-gradient(
                            135deg,
                            #e0f2fe,
                            #ccfbf1
                        );

                    color:
                        #0369a1;
                }


                .archive-auth-history-title {
                    margin: 0;

                    color:
                        #0f4c5c;

                    font-size: 17px;
                    font-weight: 700;
                }


                .archive-auth-history-subtitle {
                    margin-top: 4px;

                    color:
                        #4b7b88;

                    font-size: 12px;
                }


                .archive-auth-refresh-history {
                    min-width: 78px;

                    border:
                        1px solid
                        #bae6fd !important;

                    border-radius:
                        9px !important;

                    background:
                        #f0f9ff !important;

                    color:
                        #0369a1 !important;

                    font-weight: 600;
                }


                .archive-auth-refresh-history:hover {
                    border-color:
                        #7dd3fc !important;

                    background:
                        #e0f2fe !important;

                    color:
                        #075985 !important;
                }


                .archive-auth-history-filter-panel {
                    position: relative;

                    display: grid;

                    grid-template-columns:
                        minmax(320px, 1fr)
                        minmax(180px, 230px);

                    gap: 16px;

                    padding: 18px;

                    border:
                        1px solid
                        #bae6fd;

                    border-radius: 14px;

                    background:
                        linear-gradient(
                            135deg,
                            #f0f9ff 0%,
                            #ecfeff 100%
                        );
                }


                .archive-auth-filter-group {
                    min-width: 0;
                }


                .archive-auth-filter-label {
                    display: block;

                    margin:
                        0 0 7px 0;

                    color:
                        #155e75;

                    font-size: 12px;
                    font-weight: 700;
                }


                .archive-auth-search-wrap {
                    position: relative;
                }


                .archive-auth-search-icon {
                    position: absolute;

                    top: 50%;
                    right: 14px;

                    transform:
                        translateY(-50%);

                    display: flex;
                    align-items: center;
                    justify-content: center;

                    width: 18px;
                    height: 18px;

                    color:
                        #0891b2;

                    pointer-events: none;

                    z-index: 2;
                }


                .archive-auth-history-search,
                .archive-auth-history-status {
                    width: 100%;

                    height: 42px;

                    border:
                        1px solid
                        #a5d8ef !important;

                    border-radius:
                        10px !important;

                    background:
                        #ffffff !important;

                    color:
                        #164e63 !important;

                    font-size: 13px;

                    box-shadow:
                        0 1px 2px
                        rgba(
                            14,
                            116,
                            144,
                            0.04
                        );

                    transition:
                        border-color 0.16s ease,
                        box-shadow 0.16s ease,
                        background-color 0.16s ease;
                }


                .archive-auth-history-search {
                    padding-right:
                        42px !important;

                    padding-left:
                        13px !important;
                }


                .archive-auth-history-search::placeholder {
                    color:
                        #77a5b4;
                }


                .archive-auth-history-search:focus,
                .archive-auth-history-status:focus {
                    border-color:
                        #06b6d4 !important;

                    background:
                        #ffffff !important;

                    box-shadow:
                        0 0 0 3px
                        rgba(
                            6,
                            182,
                            212,
                            0.12
                        ) !important;

                    outline:
                        none !important;
                }


                .archive-auth-history-status {
                    cursor: pointer;

                    padding-right:
                        12px !important;
                }


                .archive-auth-history-meta {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;

                    gap: 12px;

                    flex-wrap: wrap;

                    margin-top: 18px;

                    padding:
                        11px 14px;

                    border:
                        1px solid
                        #cffafe;

                    border-radius:
                        10px;

                    background:
                        #f0fdfa;
                }


                .archive-auth-history-count-wrap {
                    display: flex;
                    align-items: center;
                    gap: 8px;

                    color:
                        #115e59;

                    font-size: 12px;
                }


                .archive-auth-history-count {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;

                    min-width: 30px;
                    height: 26px;

                    padding:
                        0 9px;

                    border:
                        1px solid
                        #99f6e4;

                    border-radius:
                        20px;

                    background:
                        #ccfbf1;

                    color:
                        #0f766e;

                    font-size: 12px;
                    font-weight: 700;
                }


                .archive-auth-history-loading {
                    display: none;

                    margin-right: 6px;

                    color:
                        #0891b2;

                    font-size: 11px;
                }


                .archive-auth-history-page-label {
                    color:
                        #0e7490;

                    font-size: 12px;
                    font-weight: 600;
                }


                .archive-auth-history-results {
                    margin-top:
                        10px;
                }


                .archive-auth-history-empty-loading {
                    padding:
                        38px 0;

                    text-align:
                        center;

                    color:
                        #4b8797;

                    font-size:
                        13px;
                }


                @media (
                    max-width: 768px
                ) {
                    .archive-auth-history-filter-panel {
                        grid-template-columns:
                            1fr;
                    }


                    .archive-auth-history-header {
                        align-items:
                            flex-start;
                    }


                    .archive-auth-refresh-history {
                        min-width:
                            auto;
                    }
                }
            </style>


            <div
                class="
                    archive-auth-history-card
                "
                style="
                    padding: 4px;
                    border: 0 !important;
                    box-shadow: none !important;
                    background: transparent !important;
                "
            >
                <!-- =========================
                    Header
                ========================== -->
                <div
                    class="
                        archive-auth-history-header
                    "
                >
                    <div
                        class="
                            archive-auth-history-title-wrap
                        "
                    >
                        <div
                            class="
                                archive-auth-history-title-icon
                            "
                        >
                            <svg
                                width="21"
                                height="21"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                            >
                                <path
                                    d="
                                        M4 6
                                        C4 4.9 4.9 4 6 4
                                        H18
                                        C19.1 4 20 4.9 20 6
                                        V18
                                        C20 19.1 19.1 20 18 20
                                        H6
                                        C4.9 20 4 19.1 4 18
                                        V6
                                        Z
                                    "
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                />

                                <path
                                    d="M8 9H16"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                />

                                <path
                                    d="M8 13H14"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                />

                                <path
                                    d="M8 17H12"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                />
                            </svg>
                        </div>


                        <div>
                            <h4
                                class="
                                    archive-auth-history-title
                                "
                            >
                                ${__(
                                    "سجل الفحوصات السابقة"
                                )}
                            </h4>

                            <div
                                class="
                                    archive-auth-history-subtitle
                                "
                            >
                                ${__(
                                    "البحث والوصول السريع إلى نتائج فحوصات المستندات."
                                )}
                            </div>
                        </div>
                    </div>


                    <button
                        type="button"
                        class="
                            btn
                            btn-sm
                            archive-auth-refresh-history
                        "
                    >
                        ${__("تحديث")}
                    </button>
                </div>


                <!-- =========================
                    Search / Status
                ========================== -->
                <div
                    class="
                        archive-auth-history-filter-panel
                    "
                >
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
            <div
                style="
                    margin-top: 20px;
                    padding-top: 16px;
                    border-top:
                        1px solid var(--border-color);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 12px;
                "
            >
                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        btn-sm
                        archive-auth-history-page
                    "
                    data-page="${page - 1}"
                    ${page <= 1
                        ? "disabled"
                        : ""}
                >
                    ${__("السابق")}
                </button>


                <span
                    class="text-muted"
                    style="
                        font-size: 12px;
                    "
                >
                    ${__("الصفحة")}
                    ${page}
                    ${__("من")}
                    ${total_pages}
                </span>


                <button
                    type="button"
                    class="
                        btn
                        btn-default
                        btn-sm
                        archive-auth-history-page
                    "
                    data-page="${page + 1}"
                    ${page >= total_pages
                        ? "disabled"
                        : ""}
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
            <div
                class="archive-auth-history-row"
                style="
                    padding: 16px 0;
                    border-bottom:
                        1px solid var(--border-color);
                "
                >
                <div
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        gap: 18px;
                        flex-wrap: wrap;
                    "
                >
                    <div
                        style="
                            flex: 1;
                            min-width: 260px;
                        "
                    >
                        <div
                            style="
                                font-weight: 600;
                                word-break: break-word;
                            "
                        >
                            ${file_name}
                        </div>

                        <div
                            class="text-muted"
                            style="
                                margin-top: 6px;
                                font-size: 12px;
                            "
                        >
                            ${check_name}
                            ·
                            ${profile}
                        </div>

                        <div
                            style="
                                margin-top: 10px;
                                font-size: 12px;
                                line-height: 1.8;
                            "
                        >
                            <div>
                                <span class="text-muted">
                                    ${__("بواسطة")}:
                                </span>

                                <strong>
                                    ${checked_by_full_name}
                                </strong>
                            </div>

                            <div>
                                <span class="text-muted">
                                    ${__("المستخدم")}:
                                </span>

                                <span
                                    style="
                                        direction: ltr;
                                        unicode-bidi: embed;
                                    "
                                >
                                    ${checked_by}
                                </span>
                            </div>

                            <div>
                                <span class="text-muted">
                                    ${__("وقت الفحص")}:
                                </span>

                                <span>
                                    ${checked_at}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div
                        style="
                            display: flex;
                            gap: 24px;
                            align-items: flex-start;
                        "
                    >
                        <div>
                            <div
                                class="text-muted"
                                style="
                                    font-size: 11px;
                                    margin-bottom: 3px;
                                "
                            >
                                ${__("الحالة")}
                            </div>

                            <strong
                                style="
                                    color: ${appearance.color};
                                "
                            >
                                ${frappe.utils.escape_html(
                                    status
                                )}
                            </strong>
                        </div>

                        <div
                            style="
                                direction: ltr;
                                text-align: left;
                            "
                        >
                            <div
                                class="text-muted"
                                style="
                                    font-size: 11px;
                                    margin-bottom: 3px;
                                "
                            >
                                ${__("الخطورة")}
                            </div>

                            <strong
                                style="
                                    color: ${appearance.color};
                                "
                            >
                                ${risk_score}/100
                            </strong>
                        </div>
                    </div>
                </div>
                <div
                    style="
                        margin-top: 14px;
                    "
                >
                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-sm
                            archive-auth-show-check
                        "
                        data-check-name="${check_name}"
                    >
                        ${__("عرض السجل")}
                    </button>
                </div>

                <div
                    class="archive-auth-history-details"
                    style="
                        display: none;
                        margin-top: 16px;
                    "
                ></div>
            </div>
        `;
    }


    function format_history_datetime(
        value
    ) {
        if (!value) {
            return "-";
        }

        try {
            return frappe.datetime.str_to_user(
                value
            );
        } catch (error) {
            return frappe.utils.escape_html(
                String(
                    value
                )
            );
        }
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


        let live_card_style = "";
        let live_summary_style = "";


        if (
            is_live_result
            && status === "صحيح"
        ) {
            /*
            * المستند الصحيح:
            * - إطار البطاقة الرئيسية أخضر.
            * - خلفية رسالة الملخص خضراء.
            */
            live_card_style = `
                border:
                    2px solid
                    var(--green-500, #22c55e);
                box-shadow:
                    0 0 0 1px
                    rgba(34, 197, 94, 0.08);
            `;

            live_summary_style = `
                background:
                    rgba(34, 197, 94, 0.12);
                border:
                    1px solid
                    var(--green-500, #22c55e);
                color:
                    var(--green-700, #15803d);
            `;
        }


        if (
            is_live_result
            && status === "مزور"
        ) {
            /*
            * المستند المزور:
            * - إطار البطاقة الرئيسية أحمر.
            * - خلفية رسالة الملخص حمراء.
            */
            live_card_style = `
                border:
                    2px solid
                    var(--red-500, #ef4444);
                box-shadow:
                    0 0 0 1px
                    rgba(239, 68, 68, 0.08);
            `;

            live_summary_style = `
                background:
                    rgba(239, 68, 68, 0.12);
                border:
                    1px solid
                    var(--red-500, #ef4444);
                color:
                    var(--red-700, #b91c1c);
            `;
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
            <div
                    class="card"
                    style="
                        padding: 24px;
                        border-radius: 12px;

                        ${live_card_style}

                        transition:
                            border-color 0.18s ease,
                            box-shadow 0.18s ease;
                    "
                >
                <div
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        flex-wrap: wrap;
                    "
                >
                    <div>
                        <div class="text-muted">
                            ${__("نتيجة الفحص")}
                        </div>

                        <h3
                            style="
                                margin-top: 6px;
                                margin-bottom: 4px;
                                color: ${appearance.color};
                            "
                        >
                            ${frappe.utils.escape_html(
                                status
                            )}
                        </h3>
                    </div>

                    <div
                        style="
                            text-align: left;
                            direction: ltr;
                        "
                    >
                        <div class="text-muted">
                            ${__("درجة الخطورة")}
                        </div>

                        <strong
                            style="
                                font-size: 22px;
                                color: ${appearance.color};
                            "
                        >
                            ${risk_score}/100
                        </strong>
                    </div>
                </div>

                <div
                    style="
                        margin-top: 20px;
                        padding: 16px;
                        border-radius: 8px;

                        background:
                            var(--subtle-fg);

                        ${live_summary_style}

                        transition:
                            background-color 0.18s ease,
                            border-color 0.18s ease,
                            color 0.18s ease;
                    "
                >
                    ${summary}
                </div>

                <div
                    style="
                        margin-top: 20px;
                        display: grid;
                        grid-template-columns:
                            repeat(
                                auto-fit,
                                minmax(180px, 1fr)
                            );
                        gap: 14px;
                    "
                >
                    ${render_info(
                        __("اللغة"),
                        language
                    )}

                    ${render_info(
                        __("القالب"),
                        profile
                    )}

                    ${render_info(
                        __("إشارات التعديل"),
                        tamper_signals
                    )}

                    ${render_info(
                        __("سجل الفحص"),
                        check_name
                    )}

                    ${render_info(
                        __("إصدار المحرك"),
                        engine_version
                    )}
                </div>

                <div
                    style="
                        margin-top: 24px;
                        border-top:
                            1px solid var(--border-color);
                        padding-top: 16px;
                    "
                >
                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-sm
                            archive-auth-toggle-findings
                        "
                    >
                        ${__("عرض التفاصيل الفنية")}
                    </button>

                    <div
                        class="archive-auth-findings"
                        style="
                            display: none;
                            margin-top: 16px;
                        "
                    >
                        ${render_findings(
                            findings
                        )}
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
            <div
                style="
                    padding: 14px 0;
                    border-bottom:
                        1px solid var(--border-color);
                "
            >
                <div
                    style="
                        display: flex;
                        align-items: flex-start;
                        gap: 10px;
                    "
                >
                    <div
                        style="
                            color: ${appearance.color};
                            font-weight: 700;
                            min-width: 20px;
                            font-size: 16px;
                        "
                    >
                        ${appearance.icon}
                    </div>

                    <div
                        style="
                            flex: 1;
                            min-width: 0;
                        "
                    >
                        <div
                            style="
                                font-weight: 600;
                            "
                        >
                            ${label}
                        </div>

                        ${
                            message
                                ? `
                                    <div
                                        class="text-muted"
                                        style="
                                            margin-top: 4px;
                                        "
                                    >
                                        ${message}
                                    </div>
                                `
                                : ""
                        }

                        <div
                            style="
                                margin-top: 8px;
                                font-size: 12px;
                                direction: ltr;
                                text-align: left;
                                word-break: break-word;
                            "
                        >
                            <div>
                                <strong>
                                    Code:
                                </strong>

                                ${code || "-"}
                            </div>

                            <div
                                style="
                                    margin-top: 3px;
                                "
                            >
                                <strong>
                                    Actual:
                                </strong>

                                ${actual}
                            </div>

                            <div
                                style="
                                    margin-top: 3px;
                                "
                            >
                                <strong>
                                    Expected:
                                </strong>

                                ${expected}
                            </div>
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
            <div>
                <div
                    class="text-muted"
                    style="
                        font-size: 12px;
                        margin-bottom: 4px;
                    "
                >
                    ${label}
                </div>

                <div
                    style="
                        font-weight: 600;
                        word-break: break-word;
                    "
                >
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
                color:
                    "var(--green-600)",
            };
        }

        if (status === "مزور") {
            return {
                color:
                    "var(--red-600)",
            };
        }

        if (status === "مشتبه به") {
            return {
                color:
                    "var(--orange-600)",
            };
        }

        return {
            color:
                "var(--gray-600)",
        };
    }
};