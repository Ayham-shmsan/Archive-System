frappe.pages["archive-commercial-registries"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "السجلات التجارية",
		single_column: true,
	});

	const requiredAssets = [
		"/assets/archive/css/shared/data_grid.css",
		"/assets/archive/js/shared/data_grid/core.js",
		"/assets/archive/js/shared/data_grid/pagination.js",
		"/assets/archive/css/archive_operations/operation_dialog.css",
		"/assets/archive/css/archive_pending_operations/pending_operation_timeline_dialog.css",
	];

	frappe.require(requiredAssets, () => {
		wrapper.archive_commercial_registries_screen = new ArchiveCommercialRegistriesScreen(page, wrapper);
	});
};

frappe.pages["archive-commercial-registries"].on_page_show = function (wrapper) {
	if (
		wrapper.archive_commercial_registries_screen &&
		typeof wrapper.archive_commercial_registries_screen.on_show === "function"
	) {
		wrapper.archive_commercial_registries_screen.on_show();
	}
};

const ACR_SVG = {
	header_doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
	paperclip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
	empty_file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
	search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
	filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
	columns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`,
	eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
	timeline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.59 7.41 15.42 16.59"/><circle cx="18" cy="6" r="3"/></svg>`,
	refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`,
	download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
	image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
	trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
	edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
	building: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`,
	user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

const ACR_COLUMNS = [
	{ key: "serial_no", label: "الرقم", sortable: true, sort_key: "serial_no", required: true },
	{ key: "registry_name", label: "اسم السجل", sortable: true, sort_key: "registry_name", required: false },
	{ key: "commercial_registry_no", label: "رقم السجل التجاري", sortable: true, sort_key: "commercial_registry_no", required: true },
	{ key: "account_owner_name", label: "صاحب السجل", sortable: true, sort_key: "account_owner", required: false },
	{ key: "creation", label: "تاريخ ووقت الإدخال", sortable: true, sort_key: "creation", required: false },
	{ key: "owner_full_name", label: "المستخدم", sortable: true, sort_key: "owner_full_name", required: false },
	{ key: "attachments_count", label: "المرفقات", sortable: true, sort_key: "attachments_count", required: false },
];

function acrToAsciiDigits(value) {
	return String(value || "")
		.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function acrFormatArabicDateTimeNoSeconds(dtStr) {
	const raw = String(dtStr || "").trim().replace(/\.\d+$/, "");
	if (!raw) return "—";
	let resolved = raw;
	try {
		if (frappe?.datetime?.convert_to_user_tz && /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(raw)) {
			const converted = frappe.datetime.convert_to_user_tz(raw, true);
			if (converted && converted !== "Invalid date") {
				resolved = String(converted).trim().replace(/\.\d+$/, "");
			}
		}
	} catch (e) {
		// fallback to raw
	}
	const m = resolved.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
	if (!m) return resolved;
	const datePart = m[1];
	const h24 = parseInt(m[2], 10);
	const minute = String(m[3]).padStart(2, "0");
	const period = h24 >= 12 ? "م" : "ص";
	const h12 = String(h24 % 12 || 12).padStart(2, "0");
	return `${datePart}، ${h12}:${minute} ${period}`;
}

class ArchiveCommercialRegistriesScreen {
	constructor(page, wrapper) {
		this.page = page;
		this.wrapper = wrapper;
		$(this.wrapper).addClass("archive-commercial-registries-page");
		this.$main = $(this.page.main);

		this.rows = [];
		this.row_map = new Map();
		this.total_count = 0;
		this.selected_name = null;
		this.selected_row = null;

		this.permissions = {
			can_access_screen: true,
			can_create: false,
			can_edit_own: false,
			can_edit_others: false,
			can_view_own: false,
			can_view_others: false,
			can_view_any: false,
			can_view_timeline: false,
			can_delete: false,
		};

		this.filters = {
			search_query: "",
			account_owner: "",
			has_attachments: "",
		};

		this.filter_options = {
			account_owners: [],
		};

		this.pagination = {
			page: 1,
			page_size: 50,
			total_count: 0,
			total_pages: 1,
		};

		this.sorting = {
			sort_by: "creation",
			sort_order: "desc",
		};

		this.visible_columns = new Set(ACR_COLUMNS.map((c) => c.key));
		this.search_timer = null;
		this.is_loading = false;

		this.file_viewer = new ArchiveCommercialRegistryFileViewer();

		this.render_layout();
		this.init_pagination_bar();
		this.bind_events();
		this.load_data({ preserve_selection: false });
	}

	on_show() {
		if (!this.is_loading) {
			this.load_data({ preserve_selection: true });
		}
	}

	render_layout() {
		this.$main.empty();
		const html = `
			<div class="archive-commercial-registries-screen" dir="rtl">
				<!-- 1. Single Top Header Container -->
				<header class="acr-header-container">
					<div class="acr-header-brand">
						<div class="acr-header-icon" aria-hidden="true">${ACR_SVG.header_doc}</div>
						<div class="acr-header-titles">
							<h1 class="acr-header-title">السجلات التجارية  </h1>
							<p class="acr-header-subtitle">إدارة السجلات التجارية    </p>
						</div>
					</div>
					<div class="acr-header-actions">
						<button type="button" class="btn btn-primary acr-btn-add hidden" data-action="add-registry" hidden>
							<span>إضافة سجل تجاري</span>
						</button>
					</div>
				</header>

				<!-- 2. Upper Split Container (Right: 3 Fields | Left: Attachments) -->
				<section class="acr-upper-workspace">
					<div class="acr-details-panel" aria-label="بيانات السجل التجاري المحدد">
						<div class="acr-field-row">
							<span class="acr-field-label">
								<span class="acr-field-label-icon">${ACR_SVG.header_doc}</span>
								<span>اسم السجل</span>
							</span>
							<div class="acr-field-value is-empty" data-field="registry_name">—</div>
						</div>
						<div class="acr-field-row">
							<span class="acr-field-label">
								<span class="acr-field-label-icon">${ACR_SVG.building}</span>
								<span>رقم السجل التجاري</span>
							</span>
							<div class="acr-field-value is-empty is-mono" data-field="commercial_registry_no">—</div>
						</div>
						<div class="acr-field-row">
							<span class="acr-field-label">
								<span class="acr-field-label-icon">${ACR_SVG.user}</span>
								<span>صاحب السجل</span>
							</span>
							<div class="acr-field-value is-empty" data-field="account_owner_name">—</div>
						</div>
					</div>

					<div class="acr-attachments-panel" aria-label="المرفقات">
						<div class="acr-attachments-header">
							<div class="acr-attachments-title">
								${ACR_SVG.paperclip}
								<span>المرفقات</span>
							</div>
							<span class="acr-attachments-count-badge" data-role="upper-att-count">0</span>
						</div>
						<div class="acr-attachments-box" data-role="upper-att-box">
							<div class="acr-attachments-empty">
								<div class="acr-attachments-empty-icon">${ACR_SVG.empty_file}</div>
								<div class="acr-attachments-empty-title">لا توجد مرفقات للعرض</div>
								<div class="acr-attachments-empty-sub">اختر سجلاً من الجدول لعرض المرفقات</div>
							</div>
						</div>
					</div>
				</section>

				<!-- 3. Separate Toolbar Container -->
				<section class="acr-toolbar-container">
					<div class="acr-toolbar">
						<!-- Right Toolbar Group: Search + Filters + Columns -->
						<div class="acr-toolbar-group acr-toolbar-right">
							<div class="acr-search-wrap">
								<span class="acr-search-icon">${ACR_SVG.search}</span>
								<input
									type="text"
									class="acr-search-input"
									data-role="search-input"
									placeholder="البحث في السجلات التجارية..."
									autocomplete="off"
								/>
								<button type="button" class="acr-search-clear hidden" data-action="clear-search" title="مسح البحث">&times;</button>
							</div>

							<button type="button" class="acr-tool-btn" data-action="toggle-filters">
								${ACR_SVG.filter}
								<span>الفلاتر</span>
								<span class="acr-filter-badge hidden" data-role="filter-badge">0</span>
							</button>

							<div class="acr-dropdown-wrap">
								<button type="button" class="acr-tool-btn" data-action="toggle-columns">
									${ACR_SVG.columns}
									<span>الأعمدة</span>
								</button>
								<div class="acr-columns-menu hidden" data-role="columns-menu"></div>
							</div>
						</div>

						<!-- Left Toolbar Group: View + User Log + Refresh -->
						<div class="acr-toolbar-group acr-toolbar-left">
							<button type="button" class="acr-tool-btn" data-action="view-selected" disabled>
								${ACR_SVG.eye}
								<span>عرض</span>
							</button>

							<button type="button" class="acr-tool-btn hidden" data-action="open-timeline" disabled>
								${ACR_SVG.timeline}
								<span>سجل مستخدم العملية</span>
							</button>

							<button type="button" class="acr-tool-btn acr-tool-btn-refresh" data-action="refresh">
								${ACR_SVG.refresh}
								<span>تحديث</span>
							</button>
						</div>
					</div>

					<!-- Collapsible Filter Drawer -->
					<div class="acr-filter-drawer hidden" data-role="filter-drawer">
						<div class="acr-filter-field">
							<label>صاحب السجل</label>
							<select class="acr-filter-select" data-filter="account_owner">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="acr-filter-field">
							<label>حالة المرفقات</label>
							<select class="acr-filter-select" data-filter="has_attachments">
								<option value="">الكل</option>
								<option value="with">يحتوي على مرفقات</option>
								<option value="without">بدون مرفقات</option>
							</select>
						</div>
						<button type="button" class="acr-filter-reset-btn" data-action="reset-filters">إعادة تعيين الفلاتر</button>
					</div>
				</section>

				<!-- 4. Separate Lower Table Workspace -->
				<section class="acr-lower-workspace">
					<!-- Data Table + Bottom Pagination Bar -->
					<div class="acr-table-container">
						<div class="acr-table-scroll">
							<table class="acr-table">
								<thead data-role="table-head"></thead>
								<tbody data-role="table-body">
									<tr>
										<td colspan="7" class="acr-empty-table-cell">جارٍ تحميل السجلات التجارية...</td>
									</tr>
								</tbody>
							</table>
						</div>

						<div class="archive-pagination-host" data-role="pagination-host"></div>
					</div>
				</section>
			</div>
		`;

		this.$root = $(html).appendTo(this.$main);
		this.$btnAdd = this.$root.find('[data-action="add-registry"]');
		this.$btnView = this.$root.find('[data-action="view-selected"]');
		this.$btnTimeline = this.$root.find('[data-action="open-timeline"]');
		this.$searchInput = this.$root.find('[data-role="search-input"]');
		this.$searchClear = this.$root.find('[data-action="clear-search"]');
		this.$filterDrawer = this.$root.find('[data-role="filter-drawer"]');
		this.$filterBadge = this.$root.find('[data-role="filter-badge"]');
		this.$columnsMenu = this.$root.find('[data-role="columns-menu"]');
		this.$tableHead = this.$root.find('[data-role="table-head"]');
		this.$tableBody = this.$root.find('[data-role="table-body"]');
		this.$upperAttBox = this.$root.find('[data-role="upper-att-box"]');
		this.$upperAttCount = this.$root.find('[data-role="upper-att-count"]');

		this.render_columns_menu();
		this.render_table_header();
	}

	init_pagination_bar() {
		const $host = this.$root.find('[data-role="pagination-host"]');
		if (window.custom && custom.data_grid && custom.data_grid.PaginationBar) {
			const lengths = ["20", "50", "100", "500", "1000"].map((v) => ({
				label: __("{0} سجل", [v]),
				value: v,
			}));
			lengths.push({ label: __("كل السجلات"), value: "all" });

			this.pagination_bar = new custom.data_grid.PaginationBar({
				container: $host,
				page_length: String(this.pagination.page_size),
				allowed_page_lengths: lengths,
				on_change: async ({ page, page_length }) => {
					this.pagination.page = page;
					this.pagination.page_size = page_length === "all" ? "all" : Number(page_length) || 50;
					this.load_data({ preserve_selection: false });
				},
			});
			this.pagination_bar.mount();
		}
	}

	render_pagination() {
		const p = this.pagination || { page: 1, page_size: 50, total_count: 0, total_pages: 1 };
		if (this.pagination_bar && typeof this.pagination_bar.update === "function") {
			this.pagination_bar.update({
				page: p.page,
				page_length: String(p.page_size ?? 50),
				total_rows: p.total_count,
				total_pages: p.total_pages,
			});
		}
	}

	bind_events() {
		this.$btnAdd.on("click", () => {
			if (!this.permissions.can_create) return;
			this.open_create_dialog();
		});

		this.$root.find('[data-action="refresh"]').on("click", () => {
			this.clear_selection();
			this.load_data({ preserve_selection: false, show_toast: true });
		});

		this.$btnView.on("click", () => {
			if (!this.selected_row) return;
			this.open_view_dialog(this.selected_row);
		});

		this.$btnTimeline.on("click", () => {
			if (!this.selected_row || !this.permissions.can_view_timeline) return;
			this.open_timeline_dialog(this.selected_row);
		});

		this.$searchInput.on("input", () => {
			const val = this.$searchInput.val() || "";
			this.$searchClear.toggleClass("hidden", !val.trim());
			clearTimeout(this.search_timer);
			this.search_timer = setTimeout(() => {
				this.filters.search_query = val.trim();
				this.pagination.page = 1;
				this.load_data({ preserve_selection: false });
			}, 260);
		});

		this.$searchClear.on("click", () => {
			this.$searchInput.val("");
			this.$searchClear.addClass("hidden");
			this.filters.search_query = "";
			this.pagination.page = 1;
			this.load_data({ preserve_selection: false });
		});

		this.$root.find('[data-action="toggle-filters"]').on("click", (e) => {
			const $btn = $(e.currentTarget);
			this.$filterDrawer.toggleClass("hidden");
			$btn.toggleClass("is-active", !this.$filterDrawer.hasClass("hidden"));
		});

		this.$root.find('[data-filter="account_owner"]').on("change", (e) => {
			this.filters.account_owner = $(e.currentTarget).val() || "";
			this.pagination.page = 1;
			this.update_filter_badge();
			this.load_data({ preserve_selection: false });
		});

		this.$root.find('[data-filter="has_attachments"]').on("change", (e) => {
			this.filters.has_attachments = $(e.currentTarget).val() || "";
			this.pagination.page = 1;
			this.update_filter_badge();
			this.load_data({ preserve_selection: false });
		});

		this.$root.find('[data-action="reset-filters"]').on("click", () => {
			this.filters.account_owner = "";
			this.filters.has_attachments = "";
			this.$root.find('[data-filter="account_owner"]').val("");
			this.$root.find('[data-filter="has_attachments"]').val("");
			this.pagination.page = 1;
			this.update_filter_badge();
			this.load_data({ preserve_selection: false });
		});

		this.$root.find('[data-action="toggle-columns"]').on("click", (e) => {
			e.stopPropagation();
			this.$columnsMenu.toggleClass("hidden");
		});

		$(document).on("click.acr_columns_close", (e) => {
			if (!$(e.target).closest(".acr-dropdown-wrap").length) {
				this.$columnsMenu.addClass("hidden");
			}
		});

		this.$tableHead.on("click", "th.is-sortable", (e) => {
			const sortKey = $(e.currentTarget).attr("data-sort-key");
			if (!sortKey) return;
			if (this.sorting.sort_by === sortKey) {
				this.sorting.sort_order = this.sorting.sort_order === "asc" ? "desc" : "asc";
			} else {
				this.sorting.sort_by = sortKey;
				this.sorting.sort_order = sortKey === "serial_no" ? "asc" : "desc";
			}
			this.pagination.page = 1;
			this.load_data({ preserve_selection: true });
		});

		this.$tableBody.on("click", "tr.acr-row", (e) => {
			const name = $(e.currentTarget).attr("data-name");
			if (!name) return;
			this.select_row(name);
		});

		this.$tableBody.on("dblclick", "tr.acr-row", (e) => {
			const name = $(e.currentTarget).attr("data-name");
			if (!name) return;
			this.select_row(name);
			if (this.selected_row) {
				this.open_view_dialog(this.selected_row);
			}
		});

		this.$upperAttBox.on("click", '[data-action="open-attachment"]', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const idx = parseInt($(e.currentTarget).attr("data-idx") || "0", 10);
			if (!this.selected_row || !Array.isArray(this.selected_row.attachments)) return;
			const att = this.selected_row.attachments[idx];
			if (att) {
				frappe.call({
					method: "archive.api.commercial_registries.log_commercial_registry_attachment_action",
					args: {
						registry_name: this.selected_row.name,
						action: "view",
						file_id: att.file_id || att.file_docname || "",
						file_name: att.file_name || "",
					},
				});
			}
			this.file_viewer.open(this.selected_row.attachments, idx);
		});

		this.$upperAttBox.on("click", "a.acr-att-btn", (e) => {
			if (!this.selected_row || !Array.isArray(this.selected_row.attachments)) return;
			const $item = $(e.currentTarget).closest(".acr-attachment-item");
			const idx = parseInt($item.find('[data-action="open-attachment"]').attr("data-idx") || "0", 10);
			const att = this.selected_row.attachments[idx];
			if (att) {
				frappe.call({
					method: "archive.api.commercial_registries.log_commercial_registry_attachment_action",
					args: {
						registry_name: this.selected_row.name,
						action: "download",
						file_id: att.file_id || att.file_docname || "",
						file_name: att.file_name || "",
					},
				});
			}
		});

		$(document).off("keydown.acr_row_nav").on("keydown.acr_row_nav", (e) => {
			this.handle_keydown(e);
		});
	}

	handle_keydown(e) {
		if (!$(this.wrapper).is(":visible")) return;
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

		if ($(".modal.show, .modal.in, .acr-file-viewer-backdrop").length > 0) {
			return;
		}

		const active = document.activeElement;
		if (active) {
			const tag = (active.tagName || "").toLowerCase();
			if (
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				active.isContentEditable ||
				$(active).closest(".awesomplete, [role='listbox'], [role='combobox']").length > 0
			) {
				return;
			}
		}

		if (!this.rows.length) return;

		e.preventDefault();
		const curIdx = this.rows.findIndex((r) => r.name === this.selected_name);
		let nextIdx = 0;
		if (curIdx === -1) {
			nextIdx = 0;
		} else if (e.key === "ArrowDown") {
			nextIdx = Math.min(this.rows.length - 1, curIdx + 1);
		} else if (e.key === "ArrowUp") {
			nextIdx = Math.max(0, curIdx - 1);
		}

		const nextRow = this.rows[nextIdx];
		if (nextRow && nextRow.name !== this.selected_name) {
			this.select_row(nextRow.name, true);
		}
	}

	update_filter_badge() {
		let activeCount = 0;
		if (this.filters.account_owner) activeCount++;
		if (this.filters.has_attachments) activeCount++;
		this.$filterBadge.text(String(activeCount)).toggleClass("hidden", activeCount === 0);
	}

	render_columns_menu() {
		this.$columnsMenu.empty();
		ACR_COLUMNS.forEach((col) => {
			const checked = this.visible_columns.has(col.key) ? "checked" : "";
			const disabled = col.required ? "disabled" : "";
			const $item = $(`
				<label class="acr-columns-item">
					<span>${frappe.utils.escape_html(col.label)}</span>
					<input type="checkbox" data-col-key="${col.key}" ${checked} ${disabled} />
				</label>
			`);
			$item.find("input").on("change", (e) => {
				const isChecked = $(e.currentTarget).is(":checked");
				if (isChecked) {
					this.visible_columns.add(col.key);
				} else if (!col.required) {
					this.visible_columns.delete(col.key);
				}
				this.render_table_header();
				this.render_table_rows();
			});
			this.$columnsMenu.append($item);
		});
	}

	render_table_header() {
		const visibleCols = ACR_COLUMNS.filter((c) => this.visible_columns.has(c.key));
		const ths = visibleCols
			.map((col) => {
				const isSorted = this.sorting.sort_by === col.sort_key;
				let indicator = "";
				if (isSorted) {
					indicator = this.sorting.sort_order === "asc" ? "▲" : "▼";
				}
				return `
					<th class="${col.sortable ? "is-sortable" : ""} ${isSorted ? "is-sorted" : ""}" data-sort-key="${col.sort_key || ""}">
						<span class="acr-th-inner">
							<span>${frappe.utils.escape_html(col.label)}</span>
							${col.sortable ? `<span class="acr-sort-indicator">${indicator}</span>` : ""}
						</span>
					</th>
				`;
			})
			.join("");
		this.$tableHead.html(`<tr>${ths}</tr>`);
	}

	load_data({ preserve_selection = false, select_name = null, show_toast = false } = {}) {
		this.is_loading = true;
		const previousSelected = select_name || (preserve_selection ? this.selected_name : null);

		frappe.call({
			method: "archive.api.commercial_registries.get_commercial_registries_context",
			args: {
				page: this.pagination.page,
				page_size: this.pagination.page_size,
				search: this.filters.search_query || null,
				account_owner: this.filters.account_owner || null,
				has_attachments: this.filters.has_attachments || null,
				sort_by: this.sorting.sort_by,
				sort_order: this.sorting.sort_order,
			},
			callback: (r) => {
				this.is_loading = false;
				const data = (r && r.message) || {};
				this.permissions = Object.assign(this.permissions, data.permissions || {});
				this.rows = Array.isArray(data.rows) ? data.rows : [];
				this.total_count = Number(data.total_count || 0);
				this.filter_options = data.filter_options || { account_owners: [] };

				if (data.pagination) {
					this.pagination = {
						page: Number(data.pagination.page || this.pagination.page || 1),
						page_size: data.pagination.page_size ?? this.pagination.page_size ?? 50,
						total_count: Number(data.pagination.total_count ?? this.total_count ?? 0),
						total_pages: Number(data.pagination.total_pages || 1),
					};
				} else {
					this.pagination.total_count = this.total_count;
					this.pagination.total_pages = 1;
				}

				this.row_map.clear();
				this.rows.forEach((row) => {
					this.row_map.set(row.name, row);
				});

				this.apply_permissions_ui();
				this.populate_filter_options();
				this.render_table_header();
				this.render_table_rows();
				this.render_pagination();

				if (previousSelected && this.row_map.has(previousSelected)) {
					this.select_row(previousSelected);
				} else {
					this.clear_selection();
				}

				if (show_toast) {
					frappe.show_alert({ message: "تم تحديث البيانات", indicator: "green" }, 2);
				}
			},
			error: () => {
				this.is_loading = false;
				this.render_pagination();
			},
		});
	}

	apply_permissions_ui() {
		const canCreate = Boolean(this.permissions.can_create);
		const canTimeline = Boolean(this.permissions.can_view_timeline);
		this.$btnAdd.prop("hidden", !canCreate).toggleClass("hidden", !canCreate);
		this.$btnTimeline.prop("hidden", !canTimeline).toggleClass("hidden", !canTimeline);
	}

	populate_filter_options() {
		const $select = this.$root.find('[data-filter="account_owner"]');
		const currentVal = this.filters.account_owner || "";
		const owners = Array.isArray(this.filter_options.account_owners) ? this.filter_options.account_owners : [];
		let optionsHtml = `<option value="">الكل</option>`;
		owners.forEach((item) => {
			const val = frappe.utils.escape_html(item.value || "");
			const label = frappe.utils.escape_html(item.label || item.value || "");
			const selected = item.value === currentVal ? "selected" : "";
			optionsHtml += `<option value="${val}" ${selected}>${label}</option>`;
		});
		$select.html(optionsHtml);
	}

	render_table_rows() {
		const visibleCols = ACR_COLUMNS.filter((c) => this.visible_columns.has(c.key));
		const colCount = Math.max(visibleCols.length, 1);

		if (!this.rows.length) {
			const emptyMsg = !this.permissions.can_view_any
				? "لا تملك صلاحية عرض السجلات التجارية"
				: "لا توجد سجلات تجارية مطابقة للعرض";
			this.$tableBody.html(`
				<tr>
					<td colspan="${colCount}" class="acr-empty-table-cell">${frappe.utils.escape_html(emptyMsg)}</td>
				</tr>
			`);
			return;
		}

		const rowsHtml = this.rows
			.map((row) => {
				const isSelected = this.selected_name === row.name;
				const cellsHtml = visibleCols
					.map((col) => {
						if (col.key === "serial_no") {
							return `<td class="acr-col-serial">${Number(row.serial_no || 0)}</td>`;
						}
						if (col.key === "commercial_registry_no") {
							return `<td class="acr-col-registry-no">${frappe.utils.escape_html(row.commercial_registry_no || "—")}</td>`;
						}
						if (col.key === "registry_name") {
							return `<td class="acr-col-registry-name">${frappe.utils.escape_html(row.registry_name || "—")}</td>`;
						}
						if (col.key === "account_owner_name") {
							return `<td>${frappe.utils.escape_html(row.account_owner_name || row.account_owner || "—")}</td>`;
						}
						if (col.key === "attachments_count") {
							const count = Number(row.attachments_count || 0);
							return `
								<td>
									<span class="acr-att-pill">
										<span>${count}</span>
										${ACR_SVG.paperclip}
									</span>
								</td>
							`;
						}
						if (col.key === "owner_full_name") {
							return `<td>${frappe.utils.escape_html(row.owner_full_name || row.owner || "—")}</td>`;
						}
						if (col.key === "creation") {
							return `<td style="direction:rtl; font-variant-numeric:tabular-nums;">${frappe.utils.escape_html(acrFormatArabicDateTimeNoSeconds(row.creation))}</td>`;
						}
						return `<td>—</td>`;
					})
					.join("");

				return `
					<tr class="acr-row ${isSelected ? "is-selected" : ""}" data-name="${frappe.utils.escape_html(row.name)}">
						${cellsHtml}
					</tr>
				`;
			})
			.join("");

		this.$tableBody.html(rowsHtml);
	}

	select_row(name, scrollIntoView = false) {
		const row = this.row_map.get(name);
		if (!row) {
			this.clear_selection();
			return;
		}
		this.selected_name = row.name;
		this.selected_row = row;

		this.$tableBody.find("tr.acr-row").removeClass("is-selected");
		const $tr = this.$tableBody.find(`tr.acr-row[data-name="${ CSS.escape(row.name) }"]`).addClass("is-selected");
		if (scrollIntoView && $tr.length && $tr[0].scrollIntoView) {
			$tr[0].scrollIntoView({ block: "nearest" });
		}

		this.$btnView.prop("disabled", false);
		this.$btnTimeline.prop("disabled", !this.permissions.can_view_timeline);

		this.render_upper_panel(row);
	}

	clear_selection() {
		this.selected_name = null;
		this.selected_row = null;
		this.$tableBody.find("tr.acr-row").removeClass("is-selected");
		this.$btnView.prop("disabled", true);
		this.$btnTimeline.prop("disabled", true);
		this.render_upper_panel(null);
	}

	render_upper_panel(row) {
		const $no = this.$root.find('[data-field="commercial_registry_no"]');
		const $name = this.$root.find('[data-field="registry_name"]');
		const $owner = this.$root.find('[data-field="account_owner_name"]');

		if (!row) {
			$no.text("—").addClass("is-empty").removeClass("is-populated");
			$name.text("—").addClass("is-empty").removeClass("is-populated");
			$owner.text("—").addClass("is-empty").removeClass("is-populated");
			this.$upperAttCount.text("0");
			this.$upperAttBox.html(`
				<div class="acr-attachments-empty">
					<div class="acr-attachments-empty-icon">${ACR_SVG.empty_file}</div>
					<div class="acr-attachments-empty-title">لا توجد مرفقات للعرض</div>
					<div class="acr-attachments-empty-sub">اختر سجلاً من الجدول لعرض المرفقات</div>
				</div>
			`);
			return;
		}

		$no.text(row.commercial_registry_no || "—").removeClass("is-empty").addClass("is-populated");
		$name.text(row.registry_name || "—").removeClass("is-empty").addClass("is-populated");
		$owner.text(row.account_owner_name || row.account_owner || "—").removeClass("is-empty").addClass("is-populated");

		const attachments = Array.isArray(row.attachments) ? row.attachments : [];
		this.$upperAttCount.text(String(attachments.length));

		if (!attachments.length) {
			this.$upperAttBox.html(`
				<div class="acr-attachments-empty">
					<div class="acr-attachments-empty-icon">${ACR_SVG.empty_file}</div>
					<div class="acr-attachments-empty-title">لا توجد مرفقات للعرض</div>
					<div class="acr-attachments-empty-sub">لا توجد مرفقات مرفقة بهذا السجل التجاري</div>
				</div>
			`);
			return;
		}

		const itemsHtml = attachments
			.map((att, idx) => {
				const isPdf = att.file_kind === "pdf";
				const iconSvg = isPdf ? ACR_SVG.header_doc : ACR_SVG.image;
				const fileName = frappe.utils.escape_html(att.file_name || `مرفق ${idx + 1}`);
				const downloadUrl = frappe.utils.escape_html(att.download_url || att.file_url || "#");
				return `
					<div class="acr-attachment-item">
						<div class="acr-attachment-info">
							<span class="acr-attachment-type-icon ${isPdf ? "is-pdf" : ""}">${iconSvg}</span>
							<span class="acr-attachment-name" title="${fileName}">${fileName}</span>
						</div>
						<div class="acr-attachment-actions">
							<button type="button" class="acr-att-btn is-open" data-action="open-attachment" data-idx="${idx}">
								${ACR_SVG.eye}
								<span>فتح</span>
							</button>
							<a class="acr-att-btn" href="${downloadUrl}" target="_blank" rel="noopener">
								${ACR_SVG.download}
								<span>تنزيل</span>
							</a>
						</div>
					</div>
				`;
			})
			.join("");

		this.$upperAttBox.html(`<div class="acr-attachments-list">${itemsHtml}</div>`);
		this.$upperAttBox.scrollTop(0);
	}

	open_create_dialog() {
		const dialog = new ArchiveCommercialRegistryDialog({
			mode: "create",
			onSaved: (savedRow) => {
				this.pagination.page = 1;
				this.load_data({
					preserve_selection: true,
					select_name: savedRow && savedRow.name ? savedRow.name : null,
				});
			},
		});
		dialog.show();
	}

	open_edit_dialog(row) {
		const dialog = new ArchiveCommercialRegistryDialog({
			mode: "edit",
			record: row,
			onSaved: (savedRow) => {
				this.load_data({
					preserve_selection: true,
					select_name: (savedRow && savedRow.name) || row.name,
				});
			},
		});
		dialog.show();
	}

	open_view_dialog(row) {
		const viewDialog = new ArchiveCommercialRegistryViewDialog({
			record: row,
			fileViewer: this.file_viewer,
			onEdit: (rec) => {
				this.open_edit_dialog(rec);
			},
			onDelete: (rec) => {
				this.confirm_delete_registry(rec);
			},
		});
		viewDialog.show();
	}

	confirm_delete_registry(row) {
		if (!row || !row.can_delete_record) return;
		frappe.confirm(
			`هل أنت متأكد من حذف السجل التجاري رقم <b>${frappe.utils.escape_html(row.commercial_registry_no || "")}</b> (${frappe.utils.escape_html(row.registry_name || "")})؟`,
			() => {
				frappe.call({
					method: "archive.api.commercial_registries.delete_commercial_registry",
					args: { name: row.name },
					freeze: true,
					freeze_message: "جارٍ حذف السجل التجاري...",
					callback: (r) => {
						const msg = (r && r.message && r.message.message) || "تم حذف السجل التجاري بنجاح.";
						frappe.show_alert({ message: msg, indicator: "green" }, 3);
						this.load_data({ preserve_selection: false });
					},
				});
			}
		);
	}

	open_timeline_dialog(row) {
		const timelineDialog = new ArchiveCommercialRegistryTimelineDialog({
			record: row,
		});
		timelineDialog.show();
	}
}

/* ==========================================================================
   Create / Edit Commercial Registry Dialog
   ========================================================================== */
class ArchiveCommercialRegistryDialog {
	constructor({ mode = "create", record = null, onSaved = null } = {}) {
		this.mode = mode;
		this.record = record;
		this.onSaved = onSaved;
		this.attachments = [];
		this.staged_file_docnames = new Set();
		this.is_saving = false;
		this.suggestion_timer = null;

		if (this.mode === "edit" && this.record && Array.isArray(this.record.attachments)) {
			this.attachments = this.record.attachments.map((att) => Object.assign({}, att));
		}
	}

	show() {
		const isEdit = this.mode === "edit";
		const title = isEdit ? "تعديل السجل التجاري" : "إضافة سجل تجاري جديد";

		this.dialog = new frappe.ui.Dialog({
			title,
			size: "large",
			primary_action_label: isEdit ? "حفظ التعديلات" : "إضافة السجل التجاري",
			primary_action: () => this.save(),
			secondary_action_label: "إلغاء",
			secondary_action: () => this.dialog.hide(),
		});

		this.dialog.$wrapper.addClass("archive-operation-dialog acr-operation-dialog");
		this.render_body();

		this.dialog.onhide = () => {
			if (!this.is_saving && this.staged_file_docnames.size > 0) {
				const staged = Array.from(this.staged_file_docnames);
				this.staged_file_docnames.clear();
				frappe.call({
					method: "archive.api.commercial_registries.cleanup_staged_commercial_registry_attachments",
					args: { file_docnames: staged },
				});
			}
		};

		this.dialog.show();
	}

	render_body() {
		const $wrapper = $(this.dialog.body);
		const regNo = (this.record && this.record.commercial_registry_no) || "";
		const regName = (this.record && this.record.registry_name) || "";

		const html = `
			<div class="archive-operation-form" dir="rtl">
				<section class="archive-form-section">
					<div class="archive-section-header">
						<div>
							<h3>بيانات السجل التجاري</h3>
						</div>
					</div>
					<div class="archive-fields-grid">
						<!-- Field 1: رقم السجل التجاري (10 digits) -->
						<div class="archive-field-slot">
							<div class="frappe-control">
								<div class="form-group">
									<div class="clearfix" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
										<label class="control-label">رقم السجل التجاري<span class="archive-required-star">*</span></label>
										<span class="acr-digits-counter" data-role="digits-counter">${regNo.length} / 10</span>
									</div>
									<div class="control-input-wrapper">
										<div class="control-input">
											<input
												type="text"
												class="form-control"
												data-input="commercial_registry_no"
												maxlength="10"
												inputmode="numeric"
												value="${frappe.utils.escape_html(regNo)}"
												style="direction:ltr; text-align:right; font-family:'SFMono-Regular',Consolas,monospace; font-weight:600;"
											/>
										</div>
									</div>
								</div>
							</div>
						</div>

						<!-- Field 2: اسم السجل (Autocomplete from sender_name + Free Text) -->
						<div class="archive-field-slot acr-sender-suggestions-wrap">
							<div class="frappe-control">
								<div class="form-group">
									<div class="clearfix">
										<label class="control-label">اسم السجل<span class="archive-required-star">*</span></label>
									</div>
									<div class="control-input-wrapper" style="position:relative;">
										<div class="control-input">
											<input
												type="text"
												class="form-control"
												data-input="registry_name"
												value="${frappe.utils.escape_html(regName)}"
												autocomplete="off"
											/>
										</div>
										<div class="acr-sender-suggestions-menu hidden" data-role="sender-suggestions"></div>
									</div>
								</div>
							</div>
						</div>

						<!-- Field 3: صاحب السجل (Link to Archive Account) -->
						<div class="archive-field-slot">
							<div data-role="account-owner-control"></div>
						</div>
					</div>
				</section>

				<!-- Section 2: المرفقات -->
				<section class="archive-form-section">
					<div class="archive-section-header">
						<div>
							<h3>المرفقات<span class="archive-required-star">*</span></h3>
							<p>رفع وإدارة الملفات المرفقة بالسجل التجاري (صور أو PDF)</p>
						</div>
						<span class="archive-status-badge" data-role="dialog-att-count">${this.attachments.length} مرفق</span>
					</div>
					<div class="archive-attachments-dropzone" data-role="dropzone">
						<input type="file" multiple accept="image/*,.pdf" style="display:none;" data-role="file-input" />
						<div class="archive-upload-icon">＋</div>
						<div class="archive-upload-title">إضافة مرفقات</div>
						<div class="archive-upload-help">اسحب الملفات هنا أو اضغط للاختيار (صور أو PDF)</div>
					</div>
					<div class="archive-attachments-list" data-role="dialog-att-list" style="margin-top: 10px;"></div>
				</section>
			</div>
		`;

		$wrapper.html(html);

		this.$regNo = $wrapper.find('[data-input="commercial_registry_no"]');
		this.$digitsCounter = $wrapper.find('[data-role="digits-counter"]');
		this.$regName = $wrapper.find('[data-input="registry_name"]');
		this.$suggestionsMenu = $wrapper.find('[data-role="sender-suggestions"]');
		this.$dropzone = $wrapper.find('[data-role="dropzone"]');
		this.$fileInput = $wrapper.find('[data-role="file-input"]');
		this.$attList = $wrapper.find('[data-role="dialog-att-list"]');
		this.$attCount = $wrapper.find('[data-role="dialog-att-count"]');

		this.setup_account_owner_control($wrapper.find('[data-role="account-owner-control"]'));
		this.bind_form_events();
		this.render_attachments_list();
	}

	setup_account_owner_control($host) {
		this.account_owner_control = frappe.ui.form.make_control({
			parent: $host[0],
			df: {
				fieldname: "account_owner",
				label: "صاحب السجل",
				fieldtype: "Link",
				options: "Archive Account",
				placeholder: "",
				only_select: true,
				get_query: () => ({
					query: "archive.api.commercial_registries.search_archive_accounts",
				}),
			},
			render_input: true,
		});
		this.account_owner_control.refresh();
		if (this.account_owner_control.$input) {
			this.account_owner_control.$input.attr("placeholder", "");
		}

		// Override validate_link so users without Desk read perm on Archive Account still validate cleanly
		this.account_owner_control.validate = (value) => {
			const clean = String(value || "").trim();
			if (!clean) return Promise.resolve("");
			return new Promise((resolve) => {
				frappe.call({
					method: "archive.api.commercial_registries.validate_archive_account",
					args: { account_name: clean },
					callback: (r) => {
						const res = (r && r.message) || {};
						resolve(res.valid ? res.name : "");
					},
					error: () => resolve(clean),
				});
			});
		};

		if (this.record && this.record.account_owner) {
			this.account_owner_control.set_value(this.record.account_owner);
		}
	}

	bind_form_events() {
		this.$regNo.on("input", () => {
			const clean = acrToAsciiDigits(this.$regNo.val()).replace(/[^0-9]/g, "").slice(0, 10);
			if (this.$regNo.val() !== clean) {
				this.$regNo.val(clean);
			}
			this.$digitsCounter.text(`${clean.length} / 10`);
			this.$digitsCounter.css("color", clean.length === 10 ? "#16a34a" : "#64748b");
		});

		this.$regName.on("focus input", () => {
			const txt = (this.$regName.val() || "").trim();
			clearTimeout(this.suggestion_timer);
			this.suggestion_timer = setTimeout(() => {
				this.fetch_sender_suggestions(txt);
			}, 160);
		});

		this.$regName.on("blur", () => {
			setTimeout(() => {
				this.$suggestionsMenu.addClass("hidden");
			}, 200);
		});

		this.$suggestionsMenu.on("mousedown", ".acr-sender-suggestion-item", (e) => {
			e.preventDefault();
			const val = $(e.currentTarget).attr("data-value") || "";
			this.$regName.val(val);
			this.$suggestionsMenu.addClass("hidden");
		});

		this.$dropzone.on("click", (e) => {
			if ($(e.target).is("input[type=file]")) return;
			this.$fileInput.trigger("click");
		});

		this.$fileInput.on("change", (e) => {
			const files = Array.from(e.target.files || []);
			if (files.length) {
				this.upload_files(files);
			}
			this.$fileInput.val("");
		});

		this.$dropzone.on("dragover", (e) => {
			e.preventDefault();
			this.$dropzone.addClass("is-dragover");
		});

		this.$dropzone.on("dragleave drop", (e) => {
			e.preventDefault();
			this.$dropzone.removeClass("is-dragover");
			if (e.type === "drop") {
				const files = Array.from((e.originalEvent.dataTransfer && e.originalEvent.dataTransfer.files) || []);
				if (files.length) {
					this.upload_files(files);
				}
			}
		});

		this.$attList.on("click", '[data-action="remove-att"]', (e) => {
			const idx = parseInt($(e.currentTarget).attr("data-idx") || "-1", 10);
			if (idx >= 0 && idx < this.attachments.length) {
				const removed = this.attachments.splice(idx, 1)[0];
				if (removed && removed.file_docname && this.staged_file_docnames.has(removed.file_docname)) {
					this.staged_file_docnames.delete(removed.file_docname);
					frappe.call({
						method: "archive.api.commercial_registries.cleanup_staged_commercial_registry_attachments",
						args: { file_docnames: [removed.file_docname] },
					});
				}
				this.render_attachments_list();
			}
		});
	}

	fetch_sender_suggestions(txt) {
		frappe.call({
			method: "archive.api.commercial_registries.search_sender_name_suggestions",
			args: { txt, limit: 15 },
			callback: (r) => {
				const suggestions = (r && r.message && r.message.suggestions) || [];
				if (!suggestions.length) {
					this.$suggestionsMenu.addClass("hidden").empty();
					return;
				}
				const itemsHtml = suggestions
					.map((name) => {
						const escaped = frappe.utils.escape_html(name);
						return `
							<div class="acr-sender-suggestion-item" data-value="${escaped}">
								<span>${escaped}</span>
								<span class="acr-sender-suggestion-hint"></span>
							</div>
						`;
					})
					.join("");
				this.$suggestionsMenu.html(itemsHtml).removeClass("hidden");
			},
		});
	}

	upload_files(files) {
		files.forEach((file) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = String(reader.result || "");
				const base64 = result.includes(",") ? result.split(",")[1] : result;
				frappe.call({
					method: "archive.api.commercial_registries.stage_commercial_registry_attachment",
					args: {
						file_name: file.name,
						content_base64: base64,
						registry_name: this.record ? this.record.name : null,
					},
					freeze: true,
					freeze_message: `جارٍ رفع المرفق (${file.name})...`,
					callback: (r) => {
						const att = r && r.message && r.message.attachment;
						if (att) {
							this.staged_file_docnames.add(att.file_docname);
							this.attachments.push(att);
							this.render_attachments_list();
						}
					},
				});
			};
			reader.readAsDataURL(file);
		});
	}

	render_attachments_list() {
		this.$attCount.text(`${this.attachments.length} مرفق`);
		if (!this.attachments.length) {
			this.$attList.empty();
			return;
		}
		const html = this.attachments
			.map((att, idx) => {
				const name = frappe.utils.escape_html(att.file_name || `مرفق ${idx + 1}`);
				return `
					<div class="archive-attachment-item">
						<div class="archive-file-info">
							<span class="acr-attachment-type-icon ${att.file_kind === "pdf" ? "is-pdf" : ""}">${ACR_SVG.paperclip}</span>
							<span class="archive-file-name">${name}</span>
						</div>
						<button type="button" class="acr-att-btn" data-action="remove-att" data-idx="${idx}" style="color:#dc2626; border-color:#fecaca;">
							${ACR_SVG.trash}
							<span>حذف</span>
						</button>
					</div>
				`;
			})
			.join("");
		this.$attList.html(html);
	}

	save() {
		const regNo = acrToAsciiDigits(this.$regNo.val()).trim();
		const regName = (this.$regName.val() || "").trim();
		const accountOwner = this.account_owner_control ? (this.account_owner_control.get_value() || "").trim() : "";

		if (!regNo) {
			frappe.msgprint({ title: "تنبيه", message: "رقم السجل التجاري مطلوب.", indicator: "red" });
			return;
		}
		if (!/^[0-9]{10}$/.test(regNo)) {
			frappe.msgprint({
				title: "تنبيه",
				message: "رقم السجل التجاري يجب أن يتكون من 10 أرقام فقط (بدون أحرف أو رموز أو مسافات).",
				indicator: "red",
			});
			return;
		}
		if (!regName) {
			frappe.msgprint({ title: "تنبيه", message: "اسم السجل مطلوب.", indicator: "red" });
			return;
		}
		if (!this.attachments || !this.attachments.length) {
			frappe.msgprint({
				title: "تنبيه",
				message: "مرفق السجل التجاري مطلوب (يجب إرفاق ملف واحد على الأقل).",
				indicator: "red",
			});
			return;
		}

		this.is_saving = true;
		const method =
			this.mode === "edit"
				? "archive.api.commercial_registries.update_commercial_registry"
				: "archive.api.commercial_registries.create_commercial_registry";

		const args = {
			commercial_registry_no: regNo,
			registry_name: regName,
			account_owner: accountOwner || null,
			attachments: this.attachments.map((att) => ({
				file_docname: att.file_docname,
				file_name: att.file_name,
				file_url: att.file_url,
			})),
		};

		if (this.mode === "edit" && this.record) {
			args.name = this.record.name;
		}

		frappe.call({
			method,
			args,
			freeze: true,
			freeze_message: "جارٍ حفظ السجل التجاري...",
			callback: (r) => {
				const res = (r && r.message) || {};
				this.staged_file_docnames.clear();
				this.dialog.hide();
				frappe.show_alert({ message: res.message || "تم الحفظ بنجاح", indicator: "green" }, 3);
				if (typeof this.onSaved === "function") {
					this.onSaved(res.row || null);
				}
			},
			error: () => {
				this.is_saving = false;
			},
		});
	}
}

/* ==========================================================================
   View Commercial Registry Dialog (عرض)
   ========================================================================== */
class ArchiveCommercialRegistryViewDialog {
	constructor({ record, fileViewer, onEdit = null, onDelete = null }) {
		this.record = record;
		this.fileViewer = fileViewer;
		this.onEdit = onEdit;
		this.onDelete = onDelete;
	}

	show() {
		const row = this.record || {};
		const attachments = Array.isArray(row.attachments) ? row.attachments : [];

		this.dialog = new frappe.ui.Dialog({
			title: `تفاصيل السجل التجاري — ${row.commercial_registry_no || ""}`,
			size: "large",
			primary_action_label: "إغلاق",
			primary_action: () => this.dialog.hide(),
		});

		if (row.can_edit_record && typeof this.onEdit === "function") {
			const $header = this.dialog.$wrapper.find(".modal-header");
			const $actions = $header.find(".modal-actions");
			const $edit = $(
				`<button type="button" class="btn btn-default btn-sm acr-header-edit-btn" style="margin-inline-end:8px;">تعديل</button>`
			);
			$edit.on("click", () => {
				this.dialog.hide();
				this.onEdit(row);
			});
			const $close = $header.find(".btn-modal-close").first();
			if ($close.length) {
				$edit.insertBefore($close);
			} else if ($actions.length) {
				$actions.append($edit);
			} else {
				$header.append($edit);
			}
		}

		this.dialog.$wrapper.addClass("archive-operation-dialog acr-operation-dialog");
		const $wrapper = $(this.dialog.body);

		const attHtml = attachments.length
			? attachments
					.map((att, idx) => {
						const name = frappe.utils.escape_html(att.file_name || `مرفق ${idx + 1}`);
						const downloadUrl = frappe.utils.escape_html(att.download_url || att.file_url || "#");
						const isPdf = att.file_kind === "pdf";
						return `
							<div class="archive-attachment-item">
								<div class="archive-file-info">
									<span class="acr-attachment-type-icon ${isPdf ? "is-pdf" : ""}">${isPdf ? ACR_SVG.header_doc : ACR_SVG.image}</span>
									<span class="archive-file-name">${name}</span>
								</div>
								<div class="acr-attachment-actions">
									<button type="button" class="acr-att-btn is-open" data-action="view-open-att" data-idx="${idx}">
										${ACR_SVG.eye}
										<span>فتح</span>
									</button>
									<a class="acr-att-btn" href="${downloadUrl}" target="_blank" rel="noopener">
										${ACR_SVG.download}
										<span>تنزيل</span>
									</a>
								</div>
							</div>
						`;
					})
					.join("")
			: `<div class="archive-no-attachments">لا توجد مرفقات مرفقة بهذا السجل التجاري</div>`;

		const deleteBtnHtml = row.can_delete_record
			? `<button type="button" class="acr-att-btn" data-action="delete-record" style="color:#dc2626; border-color:#fecaca; height:34px; padding:0 14px;">
					${ACR_SVG.trash}
					<span>حذف السجل التجاري</span>
			   </button>`
			: "";

		$wrapper.html(`
			<div class="archive-operation-form" dir="rtl">
				<section class="archive-form-section">
					<div class="archive-section-header">
						<div>
							<h3>بيانات السجل التجاري</h3>
						</div>
					</div>
					<div class="archive-fields-grid">
						<div class="archive-field-slot">
							<div class="frappe-control">
								<div class="form-group">
									<div class="clearfix">
										<label class="control-label">رقم السجل التجاري</label>
									</div>
									<div class="control-input-wrapper">
										<div class="control-value like-disabled-input" style="direction:ltr; text-align:right; font-family:'SFMono-Regular',Consolas,monospace;">${frappe.utils.escape_html(row.commercial_registry_no || "—")}</div>
									</div>
								</div>
							</div>
						</div>
						<div class="archive-field-slot">
							<div class="frappe-control">
								<div class="form-group">
									<div class="clearfix">
										<label class="control-label">اسم السجل</label>
									</div>
									<div class="control-input-wrapper">
										<div class="control-value like-disabled-input">${frappe.utils.escape_html(row.registry_name || "—")}</div>
									</div>
								</div>
							</div>
						</div>
						<div class="archive-field-slot">
							<div class="frappe-control">
								<div class="form-group">
									<div class="clearfix">
										<label class="control-label">صاحب السجل</label>
									</div>
									<div class="control-input-wrapper">
										<div class="control-value like-disabled-input">${frappe.utils.escape_html(row.account_owner_name || row.account_owner || "—")}</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section class="archive-form-section">
					<div class="archive-section-header">
						<div>
							<h3>المرفقات (${attachments.length})</h3>
							<p>المستندات والملفات المرفقة بهذا السجل التجاري</p>
						</div>
						<div style="display:inline-flex; align-items:center; gap:8px;">
							${deleteBtnHtml}
						</div>
					</div>
					<div class="archive-attachments-list">
						${attHtml}
					</div>
				</section>
			</div>
		`);

		$wrapper.on("click", '[data-action="view-open-att"]', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const idx = parseInt($(e.currentTarget).attr("data-idx") || "0", 10);
			if (this.fileViewer && attachments.length) {
				const att = attachments[idx];
				if (att && row.name) {
					frappe.call({
						method: "archive.api.commercial_registries.log_commercial_registry_attachment_action",
						args: {
							registry_name: row.name,
							action: "view",
							file_id: att.file_id || att.file_docname || "",
							file_name: att.file_name || "",
						},
					});
				}
				this.fileViewer.open(attachments, idx);
			}
		});

		$wrapper.on("click", "a.acr-att-btn", (e) => {
			const $item = $(e.currentTarget).closest(".archive-attachment-item");
			const idx = parseInt($item.find('[data-action="view-open-att"]').attr("data-idx") || "0", 10);
			const att = attachments[idx];
			if (att && row.name) {
				frappe.call({
					method: "archive.api.commercial_registries.log_commercial_registry_attachment_action",
					args: {
						registry_name: row.name,
						action: "download",
						file_id: att.file_id || att.file_docname || "",
						file_name: att.file_name || "",
					},
				});
			}
		});

		$wrapper.on("click", '[data-action="delete-record"]', () => {
			this.dialog.hide();
			if (typeof this.onDelete === "function") {
				this.onDelete(row);
			}
		});

		this.dialog.show();
	}
}

/* ==========================================================================
   In-App Internal File Viewer (فتح — Supports Images & PDFs with Zoom)
   ========================================================================== */
class ArchiveCommercialRegistryFileViewer {
	constructor() {
		this.$backdrop = null;
		this.attachments = [];
		this.currentIndex = 0;
		this.zoom = 1;
	}

	open(attachments, startIndex = 0) {
		if (!Array.isArray(attachments) || !attachments.length) return;
		this.attachments = attachments;
		this.currentIndex = Math.max(0, Math.min(startIndex, attachments.length - 1));
		this.zoom = 1;
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
					<a class="acr-att-btn is-open" href="${downloadUrl}" target="_blank" rel="noopener" style="height:36px; padding:0 16px;">
						${ACR_SVG.download}
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
						<a class="acr-viewer-btn" href="${downloadUrl}" target="_blank" rel="noopener">
							${ACR_SVG.download}
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
		});

		this.$backdrop.on("click", '[data-viewer-action="next"]', () => {
			this.currentIndex = (this.currentIndex + 1) % this.attachments.length;
			this.zoom = 1;
			this.render();
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
}

/* ==========================================================================
   User Operation Log Dialog (سجل مستخدم العملية)
   ========================================================================== */
const ACR_UTL_ICONS = {
	layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`,
	building: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="12" height="20" rx="2"></rect><path d="M16 8h4a2 2 0 0 1 2 2v12h-6"></path><path d="M8 6h.01"></path><path d="M12 6h.01"></path><path d="M8 10h.01"></path><path d="M12 10h.01"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M8 22v-4h4v4"></path></svg>`,
	chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>`,
	plus_circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
	edit_box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
	paperclip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`,
	eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
	download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
	calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
	user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
	trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
	filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`,
	chevron_down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
};

class ArchiveCommercialRegistryTimelineDialog {
	constructor({ record }) {
		this.record = record || {};
		this.name = String(this.record.name || "").trim();
		this.data = null;
		this.dialog = null;
		this.is_loading = false;
		this.is_destroyed = false;
		this.active_filter = "all";
		this.normalized_events = [];

		this.field_labels = {
			commercial_registry_no: "رقم السجل التجاري",
			registry_name: "اسم السجل",
			account_owner: "صاحب السجل",
		};
	}

	async show() {
		if (!this.name) return;
		this.make_dialog();
		this.dialog.show();
		await this.load();
	}

	make_dialog() {
		this.dialog = new frappe.ui.Dialog({
			title: "سجل مستخدم العملية",
			size: "extra-large",
			fields: [
				{
					fieldname: "timeline_content",
					fieldtype: "HTML",
					options: `<div class="acr-utl-root" dir="rtl"></div>`,
				},
			],
		});

		this.dialog.$wrapper
			.addClass("acr-user-timeline-dialog")
			.attr("dir", "rtl");

		const $title = this.dialog.$wrapper.find(".modal-title");
		if ($title.length) {
			$title.html(`
				<span class="acr-utl-modal-title">
					<span class="acr-utl-modal-title-icon">${ACR_UTL_ICONS.layers}</span>
					<span>سجل مستخدم العملية</span>
				</span>
			`);
		}

		this.$root = this.dialog.fields_dict.timeline_content.$wrapper.find(".acr-utl-root");

		this.dialog.$wrapper.on("click.acr_utl", "[data-utl-filter]", (e) => {
			const f = $(e.currentTarget).attr("data-utl-filter") || "all";
			this.active_filter = f;
			this.render();
		});

		this.dialog.$wrapper.on("change.acr_utl", "[data-utl-select]", (e) => {
			const f = $(e.currentTarget).val() || "all";
			this.active_filter = f;
			this.render();
		});

		this.dialog.$wrapper.on("click.acr_utl", ".acr-utl-retry-btn", () => {
			this.load();
		});

		this.dialog.$wrapper.on("hidden.bs.modal.acr_utl", () => {
			this.destroy();
		});
	}

	async load() {
		if (this.is_loading) return;
		this.is_loading = true;
		this.render_loading();

		try {
			const response = await frappe.call({
				method: "archive.api.commercial_registries.get_commercial_registry_timeline",
				type: "GET",
				args: { registry_name: this.name },
			});
			this.data = response.message || null;
			this.normalized_events = this.build_normalized_events(
				Array.isArray(this.data?.events) ? this.data.events : []
			);
			this.render();
		} catch (error) {
			this.render_error(error);
		} finally {
			this.is_loading = false;
		}
	}

	build_normalized_events(rawEvents) {
		const result = [];

		rawEvents.forEach((ev) => {
			const type = String(ev.event_type || "").trim();
			const details = ev.details || {};
			const actor =
				ev.event_user_full_name ||
				ev.actor_full_name ||
				ev.event_user_name ||
				ev.event_user ||
				ev.actor_user ||
				"—";
			const dt = ev.event_datetime || "";

			if (type === "manual_edit") {
				const rawChanges = details.changes;
				let rows = [];
				if (Array.isArray(rawChanges) && rawChanges.length) {
					rows = rawChanges.map((c) => ({
						label: c.label || this.field_labels[c.fieldname] || c.fieldname || "الحقل",
						before: c.old_value ?? c.before ?? "—",
						after: c.new_value ?? c.after ?? "—",
					}));
				} else if (rawChanges && typeof rawChanges === "object") {
					rows = Object.entries(rawChanges).map(([fieldname, change]) => ({
						label: this.field_labels[fieldname] || fieldname,
						before: change?.before ?? change?.old_value ?? "—",
						after: change?.after ?? change?.new_value ?? "—",
					}));
				}
				if (rows.length) {
					rows.forEach((changeRow) => {
						result.push({
							category: "edit",
							badge_label: "تعديل",
							badge_class: "is-edit",
							actor,
							datetime: dt,
							field_label: changeRow.label,
							before_val: changeRow.before || "—",
							after_val: changeRow.after || "—",
						});
					});
				} else {
					result.push({
						category: "edit",
						badge_label: "تعديل",
						badge_class: "is-edit",
						actor,
						datetime: dt,
						text: "قام بتعديل بيانات السجل التجاري.",
					});
				}
				return;
			}

			if (type === "attachment_added") {
				const fileName = details.file_name || details.file_id || "مرفق";
				result.push({
					category: "attachments",
					badge_label: "إضافة مرفق",
					badge_class: "is-attachments",
					actor,
					datetime: dt,
					action_prefix: "قام بإضافة مرفق:",
					file_name: fileName,
				});
				return;
			}

			if (type === "attachment_deleted") {
				const fileName = details.file_name || details.file_id || "مرفق";
				result.push({
					category: "attachments",
					badge_label: "حذف مرفق",
					badge_class: "is-deleted",
					icon_key: "trash",
					actor,
					datetime: dt,
					action_prefix: "قام بحذف مرفق:",
					file_name: fileName,
				});
				return;
			}

			if (type === "attachment_viewed") {
				const fileName = details.file_name || details.file_id || "مرفق";
				result.push({
					category: "view",
					badge_label: "عرض مرفق",
					badge_class: "is-view",
					actor,
					datetime: dt,
					action_prefix: "قام بفتح المرفق:",
					file_name: fileName,
				});
				return;
			}

			if (type === "attachment_downloaded") {
				const fileName = details.file_name || details.file_id || "مرفق";
				result.push({
					category: "download",
					badge_label: "تنزيل مرفق",
					badge_class: "is-download",
					actor,
					datetime: dt,
					action_prefix: "قام بتنزيل المرفق:",
					file_name: fileName,
				});
				return;
			}

			if (type === "created") {
				const initAttachments = Array.isArray(details.attachments) ? details.attachments : [];
				initAttachments.forEach((attName) => {
					if (attName) {
						result.push({
							category: "attachments",
							badge_label: "إضافة مرفق",
							badge_class: "is-attachments",
							actor,
							datetime: dt,
							action_prefix: "قام بإضافة مرفق:",
							file_name: String(attName),
						});
					}
				});

				result.push({
					category: "created",
					badge_label: "إنشاء",
					badge_class: "is-created",
					actor,
					datetime: dt,
					text: "قام بإنشاء السجل التجاري.",
				});
				return;
			}

			result.push({
				category: "created",
				badge_label: ev.event_title || "حدث",
				badge_class: "is-created",
				actor,
				datetime: dt,
				text: ev.remarks || ev.event_title || "حدث على السجل التجاري.",
			});
		});

		return result;
	}

	split_date_time(rawValue) {
		if (!rawValue) {
			return { date: "—", time: "—", inline: "—" };
		}
		const str = String(rawValue).trim();
		const m = str.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/);
		if (!m) {
			return { date: str, time: "", inline: str };
		}
		const datePart = m[1];
		const hour24 = parseInt(m[2], 10);
		const minute = m[3];
		const period = hour24 >= 12 ? "م" : "ص";
		const hour12 = String(hour24 % 12 || 12).padStart(2, "0");
		const timePart = `${hour12}:${minute} ${period}`;
		return {
			date: datePart,
			time: timePart,
			inline: `${datePart} ${timePart}`,
		};
	}

	render_loading() {
		this.$root.html(`
			<div class="acr-utl-state-box">
				<div class="acr-utl-spinner"></div>
				<span>جارٍ تحميل سجل مستخدم العملية...</span>
			</div>
		`);
	}

	render_error(error) {
		this.$root.html(`
			<div class="acr-utl-state-box">
				<strong>تعذر تحميل سجل مستخدم العملية</strong>
				<span>${this.escape(error?.message || "حدث خطأ أثناء تحميل السجل.")}</span>
				<button type="button" class="acr-tool-btn acr-utl-retry-btn">إعادة المحاولة</button>
			</div>
		`);
	}

	render() {
		const registry = Object.assign({}, this.record, this.data?.registry || {});
		const allItems = this.normalized_events || [];

		const counts = {
			all: allItems.length,
			created: allItems.filter((i) => i.category === "created").length,
			edit: allItems.filter((i) => i.category === "edit").length,
			attachments: allItems.filter((i) => i.category === "attachments").length,
			view: allItems.filter((i) => i.category === "view").length,
			download: allItems.filter((i) => i.category === "download").length,
		};

		const filteredItems =
			this.active_filter === "all"
				? allItems
				: allItems.filter((i) => i.category === this.active_filter);

		const regNo = registry.commercial_registry_no || registry.name || "—";
		const regName = registry.registry_name || "—";
		const ownerName = registry.account_owner_name || registry.account_owner || "—";

		const oldestEventDt = allItems.length ? allItems[allItems.length - 1].datetime : "";
		const newestEventDt = allItems.length ? allItems[0].datetime : "";
		const createdDt = this.split_date_time(registry.creation || oldestEventDt).inline;
		const updatedDt = this.split_date_time(newestEventDt || registry.modified || registry.creation).inline;

		this.$root.html(`
			<!-- Top Summary Banner -->
			<div class="acr-utl-banner">
				<div class="acr-utl-banner-brand">
					<div class="acr-utl-banner-icon">${ACR_UTL_ICONS.building}</div>
					<div class="acr-utl-banner-id">
						<strong>السجل التجاري</strong>
						<span class="acr-utl-banner-no">${this.escape(regNo)}</span>
					</div>
				</div>
				<div class="acr-utl-banner-meta">
					<span class="acr-utl-banner-label">اسم السجل :</span>
					<strong class="acr-utl-banner-val">${this.escape(regName)}</strong>
				</div>
				<div class="acr-utl-banner-meta">
					<span class="acr-utl-banner-label">صاحب السجل :</span>
					<strong class="acr-utl-banner-val">${this.escape(ownerName)}</strong>
				</div>
			</div>

			<!-- Two-Column Workspace: Right Main Feed + Left Summary Sidebar -->
			<div class="acr-utl-layout">
				<!-- Main Timeline Panel (Right in RTL) -->
				<div class="acr-utl-main">
					<div class="acr-utl-filterbar">
						<div class="acr-utl-pills">
							<button type="button" class="acr-utl-pill is-all ${this.active_filter === "all" ? "is-active" : ""}" data-utl-filter="all">
								<span class="acr-utl-pill-icon">${ACR_UTL_ICONS.filter}</span>
								<span>الكل (${counts.all})</span>
							</button>
							<button type="button" class="acr-utl-pill is-created ${this.active_filter === "created" ? "is-active" : ""}" data-utl-filter="created">
								<span class="acr-utl-pill-icon">${ACR_UTL_ICONS.plus_circle}</span>
								<span>إنشاء (${counts.created})</span>
							</button>
							<button type="button" class="acr-utl-pill is-edit ${this.active_filter === "edit" ? "is-active" : ""}" data-utl-filter="edit">
								<span class="acr-utl-pill-icon">${ACR_UTL_ICONS.edit_box}</span>
								<span>تعديل (${counts.edit})</span>
							</button>
							<button type="button" class="acr-utl-pill is-attachments ${this.active_filter === "attachments" ? "is-active" : ""}" data-utl-filter="attachments">
								<span class="acr-utl-pill-icon">${ACR_UTL_ICONS.paperclip}</span>
								<span>مرفقات (${counts.attachments})</span>
							</button>
							<button type="button" class="acr-utl-pill is-view ${this.active_filter === "view" ? "is-active" : ""}" data-utl-filter="view">
								<span class="acr-utl-pill-icon">${ACR_UTL_ICONS.eye}</span>
								<span>عرض (${counts.view})</span>
							</button>
							<button type="button" class="acr-utl-pill is-download ${this.active_filter === "download" ? "is-active" : ""}" data-utl-filter="download">
								<span class="acr-utl-pill-icon">${ACR_UTL_ICONS.download}</span>
								<span>تنزيل (${counts.download})</span>
							</button>
						</div>

						<div class="acr-utl-select-wrap">
							<span class="acr-utl-select-filter-icon">${ACR_UTL_ICONS.filter}</span>
							<select class="acr-utl-select" data-utl-select>
								<option value="all" ${this.active_filter === "all" ? "selected" : ""}>كل العمليات</option>
								<option value="created" ${this.active_filter === "created" ? "selected" : ""}>إنشاء</option>
								<option value="edit" ${this.active_filter === "edit" ? "selected" : ""}>تعديل</option>
								<option value="attachments" ${this.active_filter === "attachments" ? "selected" : ""}>المرفقات</option>
								<option value="view" ${this.active_filter === "view" ? "selected" : ""}>عرض</option>
								<option value="download" ${this.active_filter === "download" ? "selected" : ""}>تنزيل</option>
							</select>
							<span class="acr-utl-select-chevron">${ACR_UTL_ICONS.chevron_down}</span>
						</div>
					</div>

					<div class="acr-utl-feed">
						${
							filteredItems.length
								? filteredItems.map((item, idx) => this.render_feed_item(item, idx, filteredItems.length)).join("")
								: `<div class="acr-utl-empty">لا توجد عمليات مسجلة ضمن هذا التصنيف.</div>`
						}
					</div>
				</div>

				<!-- Summary Sidebar (Left in RTL) -->
				<aside class="acr-utl-sidebar">
					<div class="acr-utl-sidebar-head">
						<span class="acr-utl-sidebar-head-icon">${ACR_UTL_ICONS.chart}</span>
						<h4>ملخص العملية</h4>
					</div>

					<div class="acr-utl-stat-list">
						<div class="acr-utl-stat-card">
							<div class="acr-utl-stat-label">
								<span class="acr-utl-stat-icon is-created">${ACR_UTL_ICONS.plus_circle}</span>
								<span>إنشاء</span>
							</div>
							<strong class="acr-utl-stat-num">${counts.created}</strong>
						</div>
						<div class="acr-utl-stat-card">
							<div class="acr-utl-stat-label">
								<span class="acr-utl-stat-icon is-edit">${ACR_UTL_ICONS.edit_box}</span>
								<span>تعديل</span>
							</div>
							<strong class="acr-utl-stat-num">${counts.edit}</strong>
						</div>
						<div class="acr-utl-stat-card">
							<div class="acr-utl-stat-label">
								<span class="acr-utl-stat-icon is-attachments">${ACR_UTL_ICONS.paperclip}</span>
								<span>المرفقات</span>
							</div>
							<strong class="acr-utl-stat-num">${counts.attachments}</strong>
						</div>
						<div class="acr-utl-stat-card">
							<div class="acr-utl-stat-label">
								<span class="acr-utl-stat-icon is-view">${ACR_UTL_ICONS.eye}</span>
								<span>عرض</span>
							</div>
							<strong class="acr-utl-stat-num">${counts.view}</strong>
						</div>
						<div class="acr-utl-stat-card">
							<div class="acr-utl-stat-label">
								<span class="acr-utl-stat-icon is-download">${ACR_UTL_ICONS.download}</span>
								<span>تنزيل</span>
							</div>
							<strong class="acr-utl-stat-num">${counts.download}</strong>
						</div>
					</div>

					<div class="acr-utl-sidebar-divider"></div>

					<div class="acr-utl-dates">
						<div class="acr-utl-date-item">
							<span class="acr-utl-date-icon">${ACR_UTL_ICONS.calendar}</span>
							<div class="acr-utl-date-info">
								<span>تاريخ الإنشاء</span>
								<strong>${this.escape(createdDt)}</strong>
							</div>
						</div>
						<div class="acr-utl-date-item">
							<span class="acr-utl-date-icon">${ACR_UTL_ICONS.calendar}</span>
							<div class="acr-utl-date-info">
								<span>آخر تحديث</span>
								<strong>${this.escape(updatedDt)}</strong>
							</div>
						</div>
					</div>
				</aside>
			</div>
		`);
	}

	get_category_icon(category, iconKey = "") {
		if (iconKey === "trash") return ACR_UTL_ICONS.trash;
		if (category === "created") return ACR_UTL_ICONS.plus_circle;
		if (category === "edit") return ACR_UTL_ICONS.edit_box;
		if (category === "attachments") return ACR_UTL_ICONS.paperclip;
		if (category === "view") return ACR_UTL_ICONS.eye;
		if (category === "download") return ACR_UTL_ICONS.download;
		return ACR_UTL_ICONS.plus_circle;
	}

	render_feed_item(item, idx, total) {
		const dtParts = this.split_date_time(item.datetime);
		const catIcon = this.get_category_icon(item.category, item.icon_key);

		let descHtml = "";
		if (item.category === "edit" && item.field_label) {
			descHtml = `
				<span class="acr-utl-desc-text">قام بتعديل ${this.escape(item.field_label)}:</span>
				<span class="acr-utl-diff-old">${this.escape(item.before_val)}</span>
				<span class="acr-utl-diff-arrow">←</span>
				<span class="acr-utl-diff-new">${this.escape(item.after_val)}</span>
			`;
		} else if (item.file_name) {
			descHtml = `
				<span class="acr-utl-desc-text">${this.escape(item.action_prefix)}</span>
				<span class="acr-utl-desc-file">${this.escape(item.file_name)}</span>
			`;
		} else {
			descHtml = `<span class="acr-utl-desc-text">${this.escape(item.text || "")}</span>`;
		}

		return `
			<div class="acr-utl-row">
				<div class="acr-utl-axis">
					<span class="acr-utl-node ${item.badge_class}">${catIcon}</span>
					${idx < total - 1 ? `<span class="acr-utl-line"></span>` : ""}
				</div>

				<div class="acr-utl-card">
					<div class="acr-utl-card-right">
						<span class="acr-utl-badge ${item.badge_class}">
							<span class="acr-utl-badge-icon">${catIcon}</span>
							<span>${this.escape(item.badge_label)}</span>
						</span>

						<div class="acr-utl-card-body">
							<div class="acr-utl-actor">
								<span class="acr-utl-actor-icon">${ACR_UTL_ICONS.user}</span>
								<strong>${this.escape(item.actor)}</strong>
							</div>
							<div class="acr-utl-desc">
								${descHtml}
							</div>
						</div>
					</div>

					<div class="acr-utl-card-left">
						<div class="acr-utl-time-stack">
							<span class="acr-utl-date">${this.escape(dtParts.date)}</span>
							<span class="acr-utl-time">${this.escape(dtParts.time)}</span>
						</div>
						<span class="acr-utl-cal-icon">${ACR_UTL_ICONS.calendar}</span>
					</div>
				</div>
			</div>
		`;
	}

	escape(value) {
		if (value === null || value === undefined || value === "") {
			return "—";
		}
		return frappe.utils.escape_html(String(value));
	}

	destroy() {
		if (this.is_destroyed) return;
		this.is_destroyed = true;
		this.dialog?.$wrapper?.off(".acr_utl");
		this.dialog?.$wrapper?.remove();
	}
}
