window.ArchivePendingAttachmentManager =
class ArchivePendingAttachmentManager {
    static counter = 0;

    constructor(options = {}) {
        this.$root =
            $(options.root);

        this.operation_name =
            options.operation_name
            || null;

        this.deferred =
            Boolean(
                options.deferred
            );

        this.can_manage =
            Boolean(
                options.can_manage
            );

        this.on_changed =
            typeof options.on_changed
                === "function"
                ? options.on_changed
                : null;

        this.attachments =
            options.attachments
            || [];

        this.local_files = [];

        this.is_busy = false;

        this.chunk_size =
            4
            *
            1024
            *
            1024;

        this.instance_id =
            ++ArchivePendingAttachmentManager
                .counter;

        this.namespace =
            `.pending_attachment_${this.instance_id}`;

        this.render();
        this.bind_events();
    }

    set_operation_name(name) {
        this.operation_name =
            name || null;
    }

    set_attachments(
        attachments
    ) {
        this.attachments =
            attachments
            || [];

        this.render();
    }

    set_can_manage(
        value
    ) {
        this.can_manage =
            Boolean(value);

        this.render();
    }

    has_local_files() {
        return Boolean(
            this.local_files.length
        );
    }

    render() {
        const dropzone =
            this.can_manage
                ? `
                    <div
                        class="
                            pending-attachment-dropzone
                            ${this.is_busy
                                ? "is-disabled"
                                : ""}
                        "
                        tabindex="0"
                        role="button"
                    >
                        <input
                            type="file"
                            class="pending-attachment-input"
                            multiple
                            hidden
                        >

                        <div
                            class="pending-attachment-drop-icon"
                        >
                            ↑
                        </div>

                        <strong>
                            اسحب الملفات هنا أو اضغط للاختيار
                        </strong>

                        <span>
                            الصور وPDF وWord وExcel
                            وبقية الأنواع المسموحة في النظام
                        </span>
                    </div>
                `
                : "";

        const persisted =
            this.attachments
                .map(
                    attachment =>
                        this.render_persisted_attachment(
                            attachment
                        )
                )
                .join("");

        const local =
            this.local_files
                .map(
                    item =>
                        this.render_local_file(
                            item
                        )
                )
                .join("");

        const empty =
            !persisted
            &&
            !local
                ? `
                    <div class="pending-attachment-empty">
                        لا توجد مرفقات.
                    </div>
                `
                : "";

        this.$root.html(`
            <div class="pending-attachment-manager">

                ${dropzone}

                <div class="pending-attachment-list">
                    ${persisted}
                    ${local}
                    ${empty}
                </div>

            </div>
        `);
    }

    render_persisted_attachment(
        attachment
    ) {
        const url =
            attachment.file
                ? encodeURI(
                    attachment.file
                )
                : "";

        return `
            <div
                class="pending-attachment-item"
                data-file-id="${this.escape(
                    attachment.file_id
                )}"
            >
                <div class="pending-attachment-file-info">

                    <strong>
                        ${this.escape(
                            attachment.file_name
                            || attachment.file_id
                        )}
                    </strong>

                    <span>
                        ${this.format_size(
                            attachment.file_size
                        )}

                        ${
                            attachment.file_type
                                ? ` · ${this.escape(
                                    attachment.file_type
                                )}`
                                : ""
                        }
                    </span>

                </div>

                <div class="pending-attachment-actions">

                    ${
                        url
                            ? `
                                <a
                                    class="
                                        btn
                                        btn-default
                                        btn-xs
                                    "
                                    href="${this.escape(
                                        url
                                    )}"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    فتح
                                </a>
                            `
                            : ""
                    }

                    ${
                        this.can_manage
                            ? `
                                <button
                                    type="button"
                                    class="
                                        btn
                                        btn-default
                                        btn-xs
                                        pending-attachment-delete
                                    "
                                    data-file-id="${this.escape(
                                        attachment.file_id
                                    )}"
                                >
                                    حذف
                                </button>
                            `
                            : ""
                    }

                </div>
            </div>
        `;
    }

    render_local_file(
        item
    ) {
        let status =
            "جاهز للرفع";

        if (
            item.status
            === "uploading"
        ) {
            status =
                `جارٍ الرفع ${item.progress || 0}%`;
        }

        if (
            item.status
            === "failed"
        ) {
            status =
                item.error
                || "فشل الرفع";
        }

        return `
            <div
                class="
                    pending-attachment-item
                    is-local
                    ${item.status === "failed"
                        ? "has-error"
                        : ""}
                "
                data-local-id="${item.id}"
            >

                <div class="pending-attachment-file-info">

                    <strong>
                        ${this.escape(
                            item.file.name
                        )}
                    </strong>

                    <span>
                        ${this.format_size(
                            item.file.size
                        )}
                        ·
                        ${this.escape(
                            status
                        )}
                    </span>

                    ${
                        item.status
                        === "uploading"
                            ? `
                                <div
                                    class="pending-attachment-progress"
                                >
                                    <div
                                        style="width:${Number(
                                            item.progress || 0
                                        )}%"
                                    ></div>
                                </div>
                            `
                            : ""
                    }

                </div>

                ${
                    !this.is_busy
                        ? `
                            <button
                                type="button"
                                class="
                                    btn
                                    btn-default
                                    btn-xs
                                    pending-attachment-remove-local
                                "
                                data-local-id="${item.id}"
                            >
                                إزالة
                            </button>
                        `
                        : ""
                }

            </div>
        `;
    }

    bind_events() {
        this.$root
            .off(
                this.namespace
            )
            .on(
                `click${this.namespace}`,
                ".pending-attachment-dropzone",
                () => {
                    if (
                        this.is_busy
                    ) {
                        return;
                    }

                    this.$root
                        .find(
                            ".pending-attachment-input"
                        )
                        .trigger(
                            "click"
                        );
                }
            )
            .on(
                `keydown${this.namespace}`,
                ".pending-attachment-dropzone",
                event => {
                    if (
                        event.key
                        !== "Enter"
                        &&
                        event.key
                        !== " "
                    ) {
                        return;
                    }

                    event.preventDefault();

                    this.$root
                        .find(
                            ".pending-attachment-input"
                        )
                        .trigger(
                            "click"
                        );
                }
            )
            .on(
                `click${this.namespace}`,
                ".pending-attachment-input",
                event => {
                    event.stopPropagation();
                }
            )
            .on(
                `change${this.namespace}`,
                ".pending-attachment-input",
                event => {
                    const files =
                        Array.from(
                            event.target.files
                            || []
                        );

                    event.target.value =
                        "";

                    this.add_files(
                        files
                    );
                }
            )
            .on(
                `dragover${this.namespace}`,
                ".pending-attachment-dropzone",
                event => {
                    event.preventDefault();

                    if (
                        !this.is_busy
                    ) {
                        $(event.currentTarget)
                            .addClass(
                                "is-dragging"
                            );
                    }
                }
            )
            .on(
                `dragleave${this.namespace}`,
                ".pending-attachment-dropzone",
                event => {
                    $(event.currentTarget)
                        .removeClass(
                            "is-dragging"
                        );
                }
            )
            .on(
                `drop${this.namespace}`,
                ".pending-attachment-dropzone",
                event => {
                    event.preventDefault();

                    $(event.currentTarget)
                        .removeClass(
                            "is-dragging"
                        );

                    if (
                        this.is_busy
                    ) {
                        return;
                    }

                    const files =
                        Array.from(
                            event.originalEvent
                                ?.dataTransfer
                                ?.files
                            || []
                        );

                    this.add_files(
                        files
                    );
                }
            )
            .on(
                `click${this.namespace}`,
                ".pending-attachment-remove-local",
                event => {
                    const id =
                        Number(
                            $(event.currentTarget)
                                .data(
                                    "local-id"
                                )
                        );

                    this.local_files =
                        this.local_files
                            .filter(
                                item =>
                                    item.id
                                    !== id
                            );

                    this.render();
                }
            )
            .on(
                `click${this.namespace}`,
                ".pending-attachment-delete",
                event => {
                    const file_id =
                        String(
                            $(event.currentTarget)
                                .data(
                                    "file-id"
                                )
                            || ""
                        );

                    this.confirm_delete(
                        file_id
                    );
                }
            );
    }

    add_files(files) {
        if (
            !this.can_manage
            ||
            !files.length
        ) {
            return;
        }

        for (
            const file
            of files
        ) {
            const duplicate =
                this.local_files
                    .some(
                        item =>
                            (
                                item.file.name
                                === file.name
                            )
                            &&
                            (
                                item.file.size
                                === file.size
                            )
                            &&
                            (
                                item.file.lastModified
                                === file.lastModified
                            )
                    );

            if (duplicate) {
                continue;
            }

            this.local_files.push({
                id:
                    Date.now()
                    +
                    Math.random(),

                file,

                status:
                    "ready",

                progress:
                    0,

                error:
                    "",
            });
        }

        this.render();

        /*
         * عملية محفوظة:
         * ارفع مباشرة.

         * Create Dialog:
         * deferred=true، ننتظر Save.
         */
        if (
            !this.deferred
            &&
            this.operation_name
        ) {
            this.upload_local_to_operation();
        }
    }

    async stage_for_create() {
        const staged = [];
        const failed = [];

        if (
            !this.local_files.length
        ) {
            return {
                staged,
                failed,
            };
        }

        this.is_busy =
            true;

        this.render();

        for (
            const item
            of this.local_files
        ) {
            item.status =
                "uploading";

            item.progress =
                0;

            this.render();

            try {
                const result =
                    await this.upload_file(
                        item.file,
                        "archive.api.pending_operation_attachments.stage_pending_attachment",
                        {},
                        progress => {
                            item.progress =
                                progress;

                            this.render();
                        }
                    );

                item.status =
                    "uploaded";

                staged.push(
                    result
                );

            } catch (error) {
                item.status =
                    "failed";

                item.error =
                    error?.message
                    || "فشل رفع الملف";

                failed.push({
                    file:
                        item.file,

                    error,
                });
            }

            this.render();
        }

        this.is_busy =
            false;

        this.render();

        return {
            staged,
            failed,
        };
    }

    async upload_local_to_operation() {
        if (
            this.is_busy
            ||
            !this.operation_name
        ) {
            return;
        }

        const pending =
            this.local_files
                .filter(
                    item =>
                        item.status
                        !== "uploaded"
                );

        if (!pending.length) {
            return;
        }

        this.is_busy =
            true;

        this.render();

        let changed =
            false;

        for (
            const item
            of pending
        ) {
            item.status =
                "uploading";

            item.progress =
                0;

            this.render();

            try {
                const result =
                    await this.upload_file(
                        item.file,
                        "archive.api.pending_operation_attachments.upload_pending_attachment",
                        {
                            operation_name:
                                this.operation_name,
                        },
                        progress => {
                            item.progress =
                                progress;

                            this.render();
                        }
                    );

                item.status =
                    "uploaded";

                if (
                    result
                        ?.attachment
                ) {
                    this.attachments.push(
                        result.attachment
                    );
                }

                changed =
                    true;

            } catch (error) {
                item.status =
                    "failed";

                item.error =
                    error?.message
                    || "فشل رفع الملف";
            }

            this.render();
        }

        this.local_files =
            this.local_files
                .filter(
                    item =>
                        item.status
                        === "failed"
                );

        this.is_busy =
            false;

        this.render();

        if (
            changed
            &&
            this.on_changed
        ) {
            await this.on_changed();
        }
    }

    async confirm_delete(
        file_id
    ) {
        if (
            !file_id
            ||
            !this.operation_name
            ||
            this.is_busy
        ) {
            return;
        }

        frappe.confirm(
            "هل تريد حذف هذا المرفق من العملية؟",

            () => {
                this.delete_attachment(
                    file_id
                );
            }
        );
    }

    async delete_attachment(
        file_id
    ) {
        this.is_busy =
            true;

        this.render();

        try {
            const response =
                await frappe.call({
                    method:
                        "archive.api.pending_operation_attachments.delete_pending_attachment",

                    type:
                        "POST",

                    args: {
                        name:
                            this.operation_name,

                        file_id,
                    },
                });

            this.attachments =
                response.message
                    ?.attachments
                || [];

            this.render();

            frappe.show_alert({
                message:
                    "تم حذف المرفق",

                indicator:
                    "green",
            });

            if (
                this.on_changed
            ) {
                await this.on_changed();
            }

        } finally {
            this.is_busy =
                false;

            this.render();
        }
    }

    async cleanup_staged(
        file_ids
    ) {
        if (
            !file_ids
                ?.length
        ) {
            return;
        }

        try {
            await frappe.call({
                method:
                    "archive.api.pending_operation_attachments.cleanup_pending_staged_attachments",

                type:
                    "POST",

                args: {
                    file_ids:
                        JSON.stringify(
                            file_ids
                        ),
                },
            });

        } catch (error) {
            console.error(
                "Pending staged attachment cleanup failed:",
                error
            );
        }
    }

    mark_create_complete() {
        this.local_files = [];

        this.render();
    }

    async upload_file(
        file,
        method,
        extra_args,
        on_progress
    ) {
        const total_chunks =
            Math.max(
                1,
                Math.ceil(
                    file.size
                    /
                    this.chunk_size
                )
            );

        let final_response =
            null;

        for (
            let index = 0;
            index < total_chunks;
            index += 1
        ) {
            const start =
                index
                *
                this.chunk_size;

            const end =
                Math.min(
                    file.size,
                    start
                    +
                    this.chunk_size
                );

            const blob =
                file.slice(
                    start,
                    end
                );

            final_response =
                await this.send_chunk(
                    {
                        file,
                        blob,
                        method,
                        extra_args,

                        chunk_index:
                            index,

                        total_chunks,

                        offset:
                            start,
                    }
                );

            const progress =
                Math.round(
                    (
                        (
                            index + 1
                        )
                        /
                        total_chunks
                    )
                    *
                    100
                );

            on_progress
                ?.(
                    progress
                );
        }

        return (
            final_response
                ?.message
            || final_response
        );
    }

    send_chunk({
        file,
        blob,
        method,
        extra_args,
        chunk_index,
        total_chunks,
        offset,
    }) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                const xhr =
                    new XMLHttpRequest();

                xhr.open(
                    "POST",
                    "/api/method/upload_file",
                    true
                );

                if (
                    frappe.csrf_token
                ) {
                    xhr.setRequestHeader(
                        "X-Frappe-CSRF-Token",
                        frappe.csrf_token
                    );
                }

                xhr.onload =
                    () => {
                        let response =
                            null;

                        try {
                            response =
                                JSON.parse(
                                    xhr.responseText
                                    || "{}"
                                );

                        } catch {
                            response = {};
                        }

                        if (
                            xhr.status
                            >= 200
                            &&
                            xhr.status
                            < 300
                        ) {
                            resolve(
                                response
                            );

                            return;
                        }

                        reject(
                            new Error(
                                this.extract_error(
                                    response
                                )
                            )
                        );
                    };

                xhr.onerror =
                    () => {
                        reject(
                            new Error(
                                "تعذر الاتصال بالسيرفر أثناء رفع الملف."
                            )
                        );
                    };

                const form =
                    new FormData();

                form.append(
                    "file",
                    blob,
                    file.name
                );

                form.append(
                    "file_name",
                    file.name
                );

                form.append(
                    "is_private",
                    "1"
                );

                form.append(
                    "method",
                    method
                );

                form.append(
                    "chunk_index",
                    String(
                        chunk_index
                    )
                );

                form.append(
                    "total_chunk_count",
                    String(
                        total_chunks
                    )
                );

                form.append(
                    "chunk_byte_offset",
                    String(
                        offset
                    )
                );

                form.append(
                    "total_file_size",
                    String(
                        file.size
                    )
                );

                for (
                    const [
                        key,
                        value,
                    ]
                    of Object.entries(
                        extra_args
                        || {}
                    )
                ) {
                    form.append(
                        key,
                        String(value)
                    );
                }

                xhr.send(
                    form
                );
            }
        );
    }

    extract_error(response) {
        try {
            const messages =
                JSON.parse(
                    response
                        ?._server_messages
                    || "[]"
                );

            if (
                Array.isArray(
                    messages
                )
                &&
                messages.length
            ) {
                const parsed =
                    JSON.parse(
                        messages[0]
                    );

                if (
                    parsed
                        ?.message
                ) {
                    return parsed.message;
                }
            }
        } catch {
            // fallback below
        }

        return (
            response
                ?.exception
            ||
            response
                ?.exc_type
            ||
            "فشل رفع الملف."
        );
    }

    format_size(value) {
        const bytes =
            Number(value);

        if (
            !Number.isFinite(
                bytes
            )
            ||
            bytes <= 0
        ) {
            return "";
        }

        if (
            bytes
            < 1024
        ) {
            return `${bytes} B`;
        }

        if (
            bytes
            < 1024
            *
            1024
        ) {
            return `${
                (
                    bytes / 1024
                ).toFixed(1)
            } KB`;
        }

        return `${
            (
                bytes
                /
                (
                    1024
                    *
                    1024
                )
            ).toFixed(1)
        } MB`;
    }

    escape(value) {
        return frappe.utils
            .escape_html(
                String(
                    value
                    ?? ""
                )
            );
    }

    destroy() {
        this.$root
            .off(
                this.namespace
            );

        this.local_files = [];
        this.attachments = [];
    }
};