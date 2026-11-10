const PENDING_VIEWER_DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

class ArchivePendingAttachmentFileViewer {
        constructor() {
            this.$backdrop = null;
            this.attachments = [];
            this.currentIndex = 0;
            this.zoom = 1;
            this.onNavigate = null;
        }

        open(attachments, startIndex = 0, options = {}) {
            if (!Array.isArray(attachments) || !attachments.length) return;
            this.attachments = attachments;
            this.currentIndex = Math.max(0, Math.min(startIndex, attachments.length - 1));
            this.zoom = 1;
            this.onNavigate = typeof options?.onNavigate === "function" ? options.onNavigate : null;
            this.render();
        }

        close() {
            if (this.$backdrop) {
                this.$backdrop.remove();
                this.$backdrop = null;
            }
            $(document).off("keydown.acr_file_viewer");
        }

        render() {
            this.close();
            const att = this.attachments[this.currentIndex] || {};
            const fileName = frappe.utils.escape_html(att.file_name || "مرفق");
            const openUrl = frappe.utils.escape_html(att.open_url || att.file_url || "#");
            const downloadUrl = frappe.utils.escape_html(att.download_url || att.file_url || "#");
            const hasMultiple = this.attachments.length > 1;

            let stageContent = "";
            if (att.file_kind === "image") {
                stageContent = `<img src="${openUrl}" class="acr-file-viewer-img" data-role="viewer-img" alt="${fileName}" />`;
            } else if (att.file_kind === "pdf") {
                stageContent = `
                    <div class="acr-file-viewer-pdf-wrap" data-role="viewer-pdf-wrap" style="width: 85%;">
                        <iframe src="${openUrl}" class="acr-file-viewer-pdf-frame" title="${fileName}"></iframe>
                    </div>
                `;
            } else {
                stageContent = `
                    <div class="acr-file-viewer-unsupported">
                        <div style="font-size:16px; font-weight:800; margin-bottom:8px;">معاينة هذا النوع غير مدعومة مباشرة</div>
                        <div style="font-size:13px; color:#64748b; margin-bottom:16px;">يمكنك تنزيل الملف لعرضه على جهازك.</div>
                        <a class="acr-att-btn is-open" href="${downloadUrl}" download="${fileName}" style="height:36px; padding:0 16px;">
                            ${PENDING_VIEWER_DOWNLOAD_SVG}
                            <span>تنزيل الملف</span>
                        </a>
                    </div>
                `;
            }

            const html = `
                <div class="acr-file-viewer-backdrop" role="dialog" aria-modal="true">
                    <div class="acr-file-viewer-header">
                        <div class="acr-file-viewer-title-group">
                            <span class="acr-file-viewer-filename">${fileName}</span>
                            <span class="acr-file-viewer-counter">${this.currentIndex + 1} / ${this.attachments.length}</span>
                        </div>
                        <div class="acr-file-viewer-controls">
                            ${
                                hasMultiple
                                    ? `
                                <button type="button" class="acr-viewer-btn" data-viewer-action="prev">السابق</button>
                                <button type="button" class="acr-viewer-btn" data-viewer-action="next">التالي</button>
                            `
                                    : ""
                            }
                            <button type="button" class="acr-viewer-btn" data-viewer-action="zoom-out" title="تصغير">−</button>
                            <span class="acr-viewer-zoom-label" data-role="zoom-label">100%</span>
                            <button type="button" class="acr-viewer-btn" data-viewer-action="zoom-in" title="تكبير">+</button>
                            <button type="button" class="acr-viewer-btn" data-viewer-action="zoom-reset">100%</button>
                            <button type="button" class="acr-viewer-btn" data-viewer-action="zoom-fit">ملائمة</button>
                            <a class="acr-viewer-btn" href="${downloadUrl}" download="${fileName}">
                                ${PENDING_VIEWER_DOWNLOAD_SVG}
                                <span>تنزيل</span>
                            </a>
                            <button type="button" class="acr-viewer-btn is-close" data-viewer-action="close">إغلاق ✕</button>
                        </div>
                    </div>
                    <div class="acr-file-viewer-stage" data-role="viewer-stage">
                        ${stageContent}
                    </div>
                </div>
            `;

            this.$backdrop = $(html).appendTo(document.body);
            this.bind_viewer_events();
        }

        apply_zoom() {
            if (!this.$backdrop) return;
            const pct = Math.round(this.zoom * 100);
            this.$backdrop.find('[data-role="zoom-label"]').text(`${pct}%`);

            const $img = this.$backdrop.find('[data-role="viewer-img"]');
            if ($img.length) {
                $img.css("transform", `scale(${this.zoom})`);
            }

            const $pdf = this.$backdrop.find('[data-role="viewer-pdf-wrap"]');
            if ($pdf.length) {
                const widthPct = Math.max(45, Math.min(220, Math.round(85 * this.zoom)));
                $pdf.css("width", `${widthPct}%`);
            }
        }

        bind_viewer_events() {
            this.$backdrop.on("click", '[data-viewer-action="close"]', () => this.close());
            this.$backdrop.on("click", (e) => {
                if ($(e.target).is('[data-role="viewer-stage"]')) {
                    this.close();
                }
            });

            this.$backdrop.on("click", '[data-viewer-action="zoom-in"]', () => {
                this.zoom = Math.min(3.5, +(this.zoom + 0.2).toFixed(2));
                this.apply_zoom();
            });

            this.$backdrop.on("click", '[data-viewer-action="zoom-out"]', () => {
                this.zoom = Math.max(0.3, +(this.zoom - 0.2).toFixed(2));
                this.apply_zoom();
            });

            this.$backdrop.on("click", '[data-viewer-action="zoom-reset"]', () => {
                this.zoom = 1;
                this.apply_zoom();
            });

            this.$backdrop.on("click", '[data-viewer-action="zoom-fit"]', () => {
                this.zoom = 0.85;
                this.apply_zoom();
            });

            this.$backdrop.on("click", '[data-viewer-action="prev"]', () => {
                this.currentIndex = (this.currentIndex - 1 + this.attachments.length) % this.attachments.length;
                this.zoom = 1;
                this.render();
                if (typeof this.onNavigate === "function") {
                    this.onNavigate(this.attachments[this.currentIndex], this.currentIndex);
                }
            });

            this.$backdrop.on("click", '[data-viewer-action="next"]', () => {
                this.currentIndex = (this.currentIndex + 1) % this.attachments.length;
                this.zoom = 1;
                this.render();
                if (typeof this.onNavigate === "function") {
                    this.onNavigate(this.attachments[this.currentIndex], this.currentIndex);
                }
            });

            this.$backdrop.find('[data-role="viewer-stage"]').on("wheel", (e) => {
                const att = this.attachments[this.currentIndex] || {};
                if (att.file_kind === "image") {
                    e.preventDefault();
                    const delta = e.originalEvent.deltaY < 0 ? 0.15 : -0.15;
                    this.zoom = Math.max(0.3, Math.min(3.5, +(this.zoom + delta).toFixed(2)));
                    this.apply_zoom();
                }
            });

            $(document).on("keydown.acr_file_viewer", (e) => {
                if (e.key === "Escape") {
                    e.stopImmediatePropagation();
                    this.close();
                }
            });
        }
    };

window.ArchivePendingAttachmentFileViewer = ArchivePendingAttachmentFileViewer;

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
        this.last_modified = null;
        this.active_upload_promise = null;
        this.active_delete_promise = null;
        this.file_viewer = new ArchivePendingAttachmentFileViewer();

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
                    (attachment, index) =>
                        this.render_persisted_attachment(
                            attachment,
                            index
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
        attachment,
        index = 0
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
                                        pending-attachment-open
                                    "
                                    style="display: inline-flex; align-items: center; gap: 4px;"
                                    href="${this.escape(
                                        url
                                    )}"
                                    data-attachment-index="${index}"
                                    data-file-id="${this.escape(
                                        attachment.file_id
                                    )}"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    ${
                                        typeof frappe !== "undefined"
                                        && frappe?.utils?.icon
                                            ? frappe.utils.icon(
                                                "view",
                                                "sm"
                                            )
                                            : ""
                                    }

                                    <span>
                                        عرض
                                    </span>
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
                ".pending-attachment-open",
                event => {
                    const index =
                        Number(
                            $(event.currentTarget)
                                .attr(
                                    "data-attachment-index"
                                )
                            || 0
                        );

                    const attachment =
                        this.attachments[
                            index
                        ];

                    const file_kind =
                        this.get_attachment_file_kind(
                            attachment
                        );

                    if (
                        this.file_viewer
                        &&
                        (
                            file_kind
                                === "pdf"
                            ||
                            file_kind
                                === "image"
                        )
                    ) {
                        event.preventDefault();
                        event.stopPropagation();

                        const viewer_attachments =
                            this.build_viewer_attachments();

                        this.file_viewer.open(
                            viewer_attachments,
                            index
                        );
                    }
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

    get_attachment_file_kind(
        attachment
    ) {
        if (!attachment) {
            return "file";
        }

        const explicit_kind =
            String(
                attachment.file_kind
                || ""
            )
                .trim()
                .toLowerCase();

        if (
            explicit_kind === "pdf"
            ||
            explicit_kind === "image"
        ) {
            return explicit_kind;
        }

        const file_type =
            String(
                attachment.file_type
                || ""
            )
                .trim()
                .toLowerCase();

        const file_name =
            String(
                attachment.file_name
                || attachment.file
                || attachment.file_url
                || ""
            )
                .trim()
                .toLowerCase();

        const clean_path =
            file_name
                .split("?")[0]
                .split("#")[0];

        const ext =
            clean_path.includes(".")
                ? clean_path.slice(
                    clean_path.lastIndexOf(".") + 1
                )
                : "";

        if (
            file_type === "pdf"
            ||
            file_type === "application/pdf"
            ||
            ext === "pdf"
        ) {
            return "pdf";
        }

        const image_exts =
            new Set([
                "png",
                "jpg",
                "jpeg",
                "webp",
                "gif",
                "bmp",
                "svg",
                "avif",
            ]);

        if (
            file_type.startsWith("image/")
            ||
            image_exts.has(file_type)
            ||
            image_exts.has(ext)
        ) {
            return "image";
        }

        return "file";
    }

    build_viewer_attachments() {
        return (
            this.attachments
            || []
        ).map(
            (att, idx) => {
                const raw_open =
                    att.open_url
                    || att.file_url
                    || att.file
                    || "";

                const raw_download =
                    att.download_url
                    || att.file_url
                    || att.file
                    || "";

                const open_url =
                    raw_open
                        ? encodeURI(raw_open)
                        : "#";

                const download_url =
                    att.download_url
                        ? att.download_url
                        : (
                            this.operation_name
                            &&
                            att.file_id
                                ? `/api/method/archive.api.pending_operation_attachments.download_pending_attachment?operation_name=${encodeURIComponent(this.operation_name)}&file_id=${encodeURIComponent(att.file_id)}`
                                : (
                                    raw_download
                                        ? encodeURI(raw_download)
                                        : "#"
                                )
                        );

                return {
                    ...att,

                    file_name:
                        att.file_name
                        || att.file_id
                        || `مرفق ${idx + 1}`,

                    file_url:
                        open_url,

                    open_url,

                    download_url,

                    file_kind:
                        this.get_attachment_file_kind(
                            att
                        ),
                };
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

    async wait_until_idle() {
        if (
            this.active_upload_promise
        ) {
            await this.active_upload_promise;
        }

        if (
            this.active_delete_promise
        ) {
            await this.active_delete_promise;
        }

        if (
            !this.deferred
            &&
            this.operation_name
            &&
            this.local_files.some(
                item =>
                    item.status === "ready"
            )
        ) {
            await this.upload_local_to_operation();
        }
    }

    async upload_local_to_operation() {
        if (!this.operation_name) {
            return;
        }

        if (
            this.active_upload_promise
        ) {
            return this.active_upload_promise;
        }

        this.active_upload_promise =
            this._run_upload_local_to_operation();

        try {
            return await this.active_upload_promise;
        } finally {
            this.active_upload_promise =
                null;
        }
    }

    async _run_upload_local_to_operation() {
        if (
            !this.operation_name
        ) {
            return;
        }

        this.is_busy =
            true;

        this.render();

        let changed =
            false;

        let latest_modified =
            null;

        while (true) {
            const pending =
                this.local_files
                    .filter(
                        item =>
                            item.status
                            === "ready"
                    );

            if (!pending.length) {
                break;
            }

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
                        Array.isArray(
                            result
                                ?.attachments
                        )
                    ) {
                        this.attachments =
                            result.attachments;

                    } else if (
                        result
                            ?.attachment
                    ) {
                        this.attachments.push(
                            result.attachment
                        );
                    }

                    if (
                        result
                            ?.modified
                    ) {
                        latest_modified =
                            result.modified;

                        this.last_modified =
                            result.modified;
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
            await this.on_changed({
                modified:
                    latest_modified
                    || this.last_modified,

                attachments:
                    this.attachments,
            });
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
        if (
            this.active_delete_promise
        ) {
            return this.active_delete_promise;
        }

        this.active_delete_promise =
            this._run_delete_attachment(
                file_id
            );

        try {
            return await this.active_delete_promise;
        } finally {
            this.active_delete_promise =
                null;
        }
    }

    async _run_delete_attachment(
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

            const modified =
                response.message
                    ?.modified
                || null;

            if (modified) {
                this.last_modified =
                    modified;
            }

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
                await this.on_changed({
                    modified:
                        modified
                        || this.last_modified,

                    attachments:
                        this.attachments,
                });
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
        this.file_viewer
            ?.close?.();

        this.$root
            .off(
                this.namespace
            );

        this.local_files = [];
        this.attachments = [];
    }
};