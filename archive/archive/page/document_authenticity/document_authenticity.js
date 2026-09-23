frappe.pages["document-authenticity"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("فحص المستندات"),
        single_column: true,
    });

    const state = {
        file: null,
        checking: false,
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
            <div
                class="card"
                style="
                    padding: 24px;
                    border-radius: 12px;
                "
            >
                <h4 style="margin-bottom: 8px;">
                    ${__("فحص مستند PDF")}
                </h4>

                <p
                    class="text-muted"
                    style="margin-bottom: 24px;"
                >
                    ${__(
                        "ارفع مستند PDF لفحص بنيته الفنية ومقارنتها بالقوالب الأصلية المعروفة."
                    )}
                </p>

                <div style="margin-bottom: 16px;">
                    <button
                        type="button"
                        class="btn btn-default archive-auth-upload"
                    >
                        ${__("اختيار ملف PDF")}
                    </button>

                    <button
                        type="button"
                        class="btn btn-primary archive-auth-check"
                        disabled
                        style="margin-right: 8px;"
                    >
                        ${__("فحص المستند")}
                    </button>
                </div>

                <div
                    class="archive-auth-selected-file"
                    style="
                        padding: 14px;
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        background: var(--subtle-fg);
                    "
                >
                    <span class="text-muted">
                        ${__("لم يتم اختيار ملف بعد.")}
                    </span>
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
    load_history();


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
                    <div>
                        <strong>
                            ${__("الملف المحدد")}
                        </strong>
                    </div>

                    <div
                        style="
                            direction: ltr;
                            text-align: right;
                            margin-top: 6px;
                            word-break: break-word;
                        "
                    >
                        ${frappe.utils.escape_html(
                            file_doc.file_name || file_doc.name
                        )}
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
                load_history();
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


    
    function load_history() {
        $history.html(`
            <div
                class="card"
                style="
                    padding: 24px;
                    border-radius: 12px;
                "
            >
                <div class="text-muted">
                    ${__("جاري تحميل سجل الفحوصات...")}
                </div>
            </div>
        `);

        frappe.call({
            method:
                "archive.api.document_authenticity.get_recent_checks",

            args: {
                limit: 20,
            },

            callback(r) {
                render_history(
                    Array.isArray(r.message)
                        ? r.message
                        : []
                );
            },

            error() {
                $history.html(`
                    <div
                        class="card"
                        style="
                            padding: 24px;
                            border-radius: 12px;
                        "
                    >
                        <div class="text-muted">
                            ${__(
                                "تعذر تحميل سجل الفحوصات."
                            )}
                        </div>
                    </div>
                `);
            },
        });
    }


    function render_history(rows) {
        if (!rows.length) {
            $history.html(`
                <div
                    class="card"
                    style="
                        padding: 24px;
                        border-radius: 12px;
                    "
                >
                    <h4 style="margin-bottom: 8px;">
                        ${__("سجل الفحوصات السابقة")}
                    </h4>

                    <div class="text-muted">
                        ${__("لا توجد فحوصات سابقة.")}
                    </div>
                </div>
            `);

            return;
        }

        const items = rows
            .map(
                (row) =>
                    render_history_row(
                        row
                    )
            )
            .join("");

        $history.html(`
            <div
                class="card"
                style="
                    padding: 24px;
                    border-radius: 12px;
                "
            >
                <div
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 18px;
                    "
                >
                    <div>
                        <h4 style="margin: 0;">
                            ${__("سجل الفحوصات السابقة")}
                        </h4>

                        <div
                            class="text-muted"
                            style="
                                margin-top: 4px;
                                font-size: 12px;
                            "
                        >
                            ${__(
                                "أحدث الفحوصات التي أجريتها."
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        class="
                            btn
                            btn-default
                            btn-sm
                            archive-auth-refresh-history
                        "
                    >
                        ${__("تحديث")}
                    </button>
                </div>

                <div>
                    ${items}
                </div>
            </div>
        `);

        $history
            .find(
                ".archive-auth-refresh-history"
            )
            .on(
                "click",
                function () {
                    load_history();
                }
            );
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

    function render_result(result) {
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

        $result.html(`
            <div
                class="card"
                style="
                    padding: 24px;
                    border-radius: 12px;
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
                        background: var(--subtle-fg);
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
            $result.find(
                ".archive-auth-toggle-findings"
            );

        const $findings =
            $result.find(
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

        $result.show();

        $result[0].scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
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