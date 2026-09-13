frappe.provide("custom.data_grid");

(() => {
    "use strict";

    const ns =
        custom.data_grid;


    class PaginationBar {

        constructor(options = {}) {

            this.container =
                options.container;


            this.on_change =
                options.on_change
                || (
                    async () => {}
                );


            this.storage_key =
                options.storage_key
                || null;


            this.allowed_page_lengths =
                options.allowed_page_lengths
                || [
                    {
                        label:
                            __("20 سجل"),
                        value:
                            "20",
                    },
                    {
                        label:
                            __("100 سجل"),
                        value:
                            "100",
                    },
                    {
                        label:
                            __("500 سجل"),
                        value:
                            "500",
                    },
                    {
                        label:
                            __("2500 سجل"),
                        value:
                            "2500",
                    },
                    {
                        label:
                            __("كل السجلات"),
                        value:
                            "all",
                    },
                ];


            this.state = {
                page: 1,
                page_length:
                    this._load_page_length()
                    || String(
                        options.page_length
                        || "100"
                    ),

                total_rows: 0,
                total_pages: 1,
            };


            this.$wrapper = null;
        }


        _load_page_length() {

            if (!this.storage_key) {
                return null;
            }


            try {
                return localStorage.getItem(
                    this.storage_key
                );
            } catch (error) {
                return null;
            }
        }


        _save_page_length(
            value
        ) {
            if (!this.storage_key) {
                return;
            }


            try {
                localStorage.setItem(
                    this.storage_key,
                    String(value)
                );
            } catch (error) {
                // لا شيء.
            }
        }


        mount() {

            const options =
                this.allowed_page_lengths
                    .map(
                        (item) => `
                            <option
                                value="${frappe.utils.escape_html(
                                    String(
                                        item.value
                                    )
                                )}"
                            >
                                ${frappe.utils.escape_html(
                                    item.label
                                )}
                            </option>
                        `
                    )
                    .join("");


            this.$wrapper =
                $(`
                    <div
                        class="generic-data-pagination"
                    >
                        <div
                            class="generic-pagination-length"
                        >
                            <span
                                class="generic-pagination-label"
                            >
                                ${__("عدد السجلات")}
                            </span>

                            <select
                                class="
                                    form-control
                                    generic-page-length
                                "
                            >
                                ${options}
                            </select>
                        </div>


                        <div
                            class="generic-pagination-info"
                        >
                            ${__("الصفحة")}:
                            <strong
                                class="generic-current-page"
                            >
                                1
                            </strong>

                            ${__("من")}

                            <strong
                                class="generic-total-pages"
                            >
                                1
                            </strong>

                            <span
                                class="generic-total-rows-wrapper"
                            >
                                —
                                <strong
                                    class="generic-total-rows"
                                >
                                    0
                                </strong>

                                ${__("سجل")}
                            </span>
                        </div>


                        <div
                            class="generic-pagination-buttons"
                        >
                            <button
                                type="button"
                                class="
                                    btn
                                    btn-default
                                    btn-sm
                                    generic-first-page
                                "
                                title="${__("الصفحة الأولى")}"
                            >
                                «
                            </button>

                            <button
                                type="button"
                                class="
                                    btn
                                    btn-default
                                    btn-sm
                                    generic-previous-page
                                "
                                title="${__("الصفحة السابقة")}"
                            >
                                ‹
                            </button>

                            <button
                                type="button"
                                class="
                                    btn
                                    btn-default
                                    btn-sm
                                    generic-next-page
                                "
                                title="${__("الصفحة التالية")}"
                            >
                                ›
                            </button>

                            <button
                                type="button"
                                class="
                                    btn
                                    btn-default
                                    btn-sm
                                    generic-last-page
                                "
                                title="${__("الصفحة الأخيرة")}"
                            >
                                »
                            </button>
                        </div>
                    </div>
                `);


            $(this.container)
                .empty()
                .append(
                    this.$wrapper
                );


            this._bind_events();

            this.update(
                this.state
            );


            return this;
        }


        async _emit() {

            await this.on_change({
                page:
                    this.state.page,

                page_length:
                    this.state.page_length,
            });
        }


        _bind_events() {

            this.$wrapper
                .find(
                    ".generic-page-length"
                )
                .on(
                    "change",
                    async (event) => {

                        this.state.page = 1;

                        this.state.page_length =
                            String(
                                event.target.value
                                || "100"
                            );


                        this._save_page_length(
                            this.state.page_length
                        );


                        await this._emit();
                    }
                );


            this.$wrapper
                .find(
                    ".generic-first-page"
                )
                .on(
                    "click",
                    async () => {

                        if (
                            this.state.page
                            <= 1
                        ) {
                            return;
                        }

                        this.state.page = 1;

                        await this._emit();
                    }
                );


            this.$wrapper
                .find(
                    ".generic-previous-page"
                )
                .on(
                    "click",
                    async () => {

                        if (
                            this.state.page
                            <= 1
                        ) {
                            return;
                        }

                        this.state.page -= 1;

                        await this._emit();
                    }
                );


            this.$wrapper
                .find(
                    ".generic-next-page"
                )
                .on(
                    "click",
                    async () => {

                        if (
                            this.state.page_length
                            === "all"
                            ||
                            this.state.page
                            >=
                            this.state.total_pages
                        ) {
                            return;
                        }

                        this.state.page += 1;

                        await this._emit();
                    }
                );


            this.$wrapper
                .find(
                    ".generic-last-page"
                )
                .on(
                    "click",
                    async () => {

                        if (
                            this.state.page_length
                            === "all"
                        ) {
                            return;
                        }

                        this.state.page =
                            this.state.total_pages;

                        await this._emit();
                    }
                );
        }


        update(meta = {}) {

            this.state.page =
                Math.max(
                    Number.parseInt(
                        meta.page
                        || this.state.page
                        || 1,
                        10
                    ),
                    1
                );


            if (
                meta.page_length !== undefined
            ) {
                this.state.page_length =
                    meta.page_length === 0
                        ? "all"
                        : String(
                            meta.page_length
                        );
            }


            this.state.total_rows =
                Number.parseInt(
                    meta.total_rows
                    || 0,
                    10
                )
                || 0;


            this.state.total_pages =
                Math.max(
                    Number.parseInt(
                        meta.total_pages
                        || 1,
                        10
                    )
                    || 1,
                    1
                );


            if (!this.$wrapper) {
                return;
            }


            this.$wrapper
                .find(
                    ".generic-page-length"
                )
                .val(
                    String(
                        this.state.page_length
                    )
                );


            this.$wrapper
                .find(
                    ".generic-current-page"
                )
                .text(
                    this.state.page
                );


            this.$wrapper
                .find(
                    ".generic-total-pages"
                )
                .text(
                    this.state.total_pages
                );


            this.$wrapper
                .find(
                    ".generic-total-rows"
                )
                .text(
                    this.state.total_rows
                );


            const is_all =
                this.state.page_length
                === "all";


            const first =
                this.state.page <= 1;


            const last =
                this.state.page
                >=
                this.state.total_pages;


            this.$wrapper
                .find(
                    ".generic-first-page, .generic-previous-page"
                )
                .prop(
                    "disabled",
                    is_all || first
                );


            this.$wrapper
                .find(
                    ".generic-next-page, .generic-last-page"
                )
                .prop(
                    "disabled",
                    is_all || last
                );
        }


        get_state() {

            return {
                ...this.state,
            };
        }
    }


    ns.PaginationBar =
        PaginationBar;

})();