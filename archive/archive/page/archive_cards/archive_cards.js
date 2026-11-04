frappe.pages["archive-cards"].on_page_load = function (wrapper) {
	frappe.archive_cards = new ArchiveCardsPage(wrapper);
};

frappe.pages["archive-cards"].on_page_show = function () {
	if (frappe.archive_cards && frappe.archive_cards._initialized) {
		frappe.archive_cards.select_row(null);
	}
};

const CARD_STATUS_DISPLAY_LABELS = {
	"نشطة": "نشطة",
	"موقفة مؤقتاً": "موقفة مؤقتاً",
	"موقفة نهائياً": "موقفة نهائياً (متلفة)",
};

function format_card_status_label(status) {
	const clean = String(status || "").trim();
	return CARD_STATUS_DISPLAY_LABELS[clean] || clean;
}

window.format_card_status_label = format_card_status_label;

const ARCHIVE_CARDS_COLUMNS = [
	{ key: "serial_no", label: "الرقم", width: "78px", locked: true, sortable: true },
	{ key: "card_name", label: "اسم البطاقة", width: "225px", locked: true, sortable: true },
	{ key: "account_number", label: "رقم الحساب", width: "155px", locked: false, sortable: true },
	{ key: "card_number", label: "رقم البطاقة", width: "160px", locked: false, sortable: true },
	{ key: "bank", label: "البنك", width: "130px", locked: false, sortable: true },
	{ key: "representative", label: "المندوب", width: "140px", locked: false, sortable: true },
	{ key: "region", label: "المنطقة", width: "125px", locked: false, sortable: true },
	{ key: "card_owner", label: "مالك البطاقة", width: "145px", locked: false, sortable: true },
	{ key: "daily_limit", label: "الحد اليومي", width: "120px", locked: false, sortable: true },
	{ key: "received_date", label: "تاريخ الاستلام", width: "120px", locked: false, sortable: true },
	{ key: "status", label: "الحالة", width: "125px", locked: true, sortable: true },
];

class ArchiveCardsPage {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.state = {
			status: "",
			search: "",
			filters: {
				bank: "",
				representative: "",
				region: "",
				card_owner: "",
				received_date_from: "",
				received_date_to: "",
			},
			filters_open: false,
			columns_menu_open: false,
			actions_menu_open: false,
			timeline_menu_open: false,
			page: 1,
			page_size: 50,
			sort_by: "serial_no",
			sort_order: "desc",
			selected_card_name: null,
			hidden_columns: this.read_hidden_columns(),
		};

		this.rows = [];
		this.stats = { total: 0, active: 0, paused: 0, stopped: 0 };
		this.pagination = { page: 1, page_size: 50, total_count: 0, total_pages: 1 };
		this.permissions = {};
		this.masters = { banks: [], representatives: [], regions: [], card_owners: [] };

		this.preview_card = null;
		this.preview_request_token = 0;
		this.context_request_token = 0;
		this.search_timer = null;

		this._bound_keydown = this.handle_keydown.bind(this);

		this.make_page();
		this.render_shell();
		this.initialize();
	}

	get_hidden_columns_storage_key() {
		const user = String(frappe?.session?.user || "Guest").trim();
		return `archive.cards.hidden_columns.v1:${user}`;
	}

	read_hidden_columns() {
		try {
			const raw = localStorage.getItem(this.get_hidden_columns_storage_key());
			const parsed = JSON.parse(raw || "[]");
			if (Array.isArray(parsed)) {
				const locked_keys = new Set(
					ARCHIVE_CARDS_COLUMNS.filter((c) => c.locked).map((c) => c.key)
				);
				return new Set(parsed.filter((k) => !locked_keys.has(k)));
			}
		} catch (_) {
			// fallback
		}
		return new Set();
	}

	save_hidden_columns() {
		try {
			localStorage.setItem(
				this.get_hidden_columns_storage_key(),
				JSON.stringify([...this.state.hidden_columns])
			);
		} catch (_) {
			// fallback
		}
	}

	make_page() {
		this.page = frappe.ui.make_app_page({
			parent: this.wrapper,
			title: "البطاقات",
			single_column: true,
		});
		$(this.wrapper).addClass("archive-cards-page");
	}

	async initialize() {
		await new Promise((resolve) => {
			frappe.require(
				[
					"/assets/archive/js/shared/data_grid/core.js",
					"/assets/archive/js/shared/data_grid/pagination.js",
					"/assets/archive/css/shared/data_grid.css",
					"/assets/archive/js/archive_cards/card_image_viewer.js",
					"/assets/archive/css/archive_cards/card_image_viewer.css",
					"/assets/archive/js/archive_cards/card_dialog.js",
					"/assets/archive/css/archive_cards/card_dialog.css",
					"/assets/archive/js/archive_cards/card_timeline_dialog.js",
					"/assets/archive/css/archive_cards/card_timeline_dialog.css",
					"/assets/archive/js/archive_cards/card_view_dialog.js",
					"/assets/archive/css/archive_cards/card_view_dialog.css",
				],
				resolve
			);
		});

		this.mount_pagination();
		this.bind_events();
		this._initialized = true;
		await this.load_context(false);
	}

	render_shell() {
		$(this.page.main).html(`
			<div class="archive-cards-shell" dir="rtl">
				<div class="archive-cards-header">
					<div class="archive-cards-header-text">
						<div class="archive-cards-title-row">
							<h1>إدارة البطاقات</h1>
							<span class="archive-cards-subtitle">إدارة البطاقات البنكية، النسخ المتعددة، العهدة، والصور المحمية</span>
						</div>
					</div>
					<div class="archive-cards-header-actions">
						<button type="button" class="btn btn-primary archive-cards-add-btn" data-action="create-card" hidden>
							<i class="fa fa-plus"></i> إضافة بطاقة
						</button>
					</div>
				</div>

				<!-- Upper Workspace: Right Info / Center Images / Left Vertical Stats -->
				<div class="archive-cards-upper-workspace">
					<div class="archive-cards-preview-panel" data-role="preview-panel">
						${this.render_empty_preview_html()}
					</div>

					<div class="archive-cards-stats-panel" data-role="stats-panel">
						${this.render_stats_cards_html()}
					</div>
				</div>

				<!-- Toolbar -->
				<div class="archive-cards-toolbar">
					<div class="archive-cards-search-group">
						<div class="archive-cards-search-box">
							<i class="fa fa-search archive-cards-search-icon"></i>
							<input
								type="text"
								class="archive-cards-search-input"
								data-role="search-input"
								dir="rtl"
								placeholder="البحث في البطاقات..."
								autocomplete="off"
							/>
						</div>

						<button type="button" class="btn btn-default archive-cards-filter-toggle" data-action="toggle-filters">
							<i class="fa fa-filter"></i> الفلاتر
							<span class="archive-cards-filter-badge" data-role="filter-badge" hidden>0</span>
						</button>

						<div class="archive-cards-dropdown-wrap">
							<button type="button" class="btn btn-default" data-action="toggle-columns-menu">
								<i class="fa fa-columns"></i> الأعمدة
							</button>
							<div class="archive-cards-popover-menu is-columns-menu" data-role="columns-menu" hidden>
								${this.render_columns_menu_html()}
							</div>
						</div>
					</div>

					<div class="archive-cards-toolbar-actions">
						<button type="button" class="btn btn-default" data-action="open-selected-view" disabled>
							<i class="fa fa-eye"></i> عرض
						</button>

						<div class="archive-cards-dropdown-wrap" data-role="timeline-events-dropdown-wrap" hidden>
							<button
								type="button"
								class="btn btn-default ac-toolbar-timeline-btn"
								data-action="toggle-timeline-events-menu"
								disabled
							>
								<i class="fa fa-road"></i> المسار والأحداث <i class="fa fa-caret-down"></i>
							</button>
							<div class="archive-cards-popover-menu" data-role="timeline-events-menu" hidden>
								<button type="button" class="ac-menu-item" data-action="open-transfer-timeline">
									<i class="fa fa-road"></i> مسار نقل البطاقة
								</button>
								<button type="button" class="ac-menu-item" data-action="open-card-event-history">
									<i class="fa fa-list-alt"></i> أحداث البطاقة
								</button>
							</div>
						</div>

						<button
							type="button"
							class="btn btn-default ac-toolbar-timeline-btn"
							data-action="open-activity-timeline"
							disabled
						>
							<i class="fa fa-history"></i> مسار العملية
						</button>

						<div class="archive-cards-dropdown-wrap">
							<button type="button" class="btn btn-default" data-action="toggle-actions-menu" disabled>
								<i class="fa fa-cog"></i> الإجراءات <i class="fa fa-caret-down"></i>
							</button>
							<div class="archive-cards-popover-menu" data-role="actions-menu" hidden>
								<button type="button" class="ac-menu-item" data-action="action-change-status">
									<i class="fa fa-refresh"></i> تغيير حالة البطاقة
								</button>
								<button type="button" class="ac-menu-item" data-action="action-transfer-card">
									<i class="fa fa-exchange"></i> نقل البطاقة
								</button>
								<div class="ac-menu-divider" data-role="delete-divider"></div>
								<button type="button" class="ac-menu-item is-danger" data-action="action-delete-card">
									<i class="fa fa-trash"></i> حذف البطاقة
								</button>
							</div>
						</div>

						<button type="button" class="btn btn-default" data-action="refresh-list" title="تحديث">
							<i class="fa fa-refresh"></i> تحديث
						</button>
					</div>
				</div>

				<!-- Collapsible Advanced Filters Bar -->
				<div class="archive-cards-filters-drawer" data-role="filters-drawer" hidden>
					<div class="ac-filters-grid">
						<div class="ac-filter-field">
							<label>البنك</label>
							<select class="form-control" data-filter="bank">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="ac-filter-field">
							<label>المندوب</label>
							<select class="form-control" data-filter="representative">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="ac-filter-field">
							<label>المنطقة</label>
							<select class="form-control" data-filter="region">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="ac-filter-field">
							<label>مالك البطاقة</label>
							<select class="form-control" data-filter="card_owner">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="ac-filter-field">
							<label>تاريخ الاستلام من</label>
							<input type="date" class="form-control" data-filter="received_date_from" />
						</div>
						<div class="ac-filter-field">
							<label>تاريخ الاستلام إلى</label>
							<input type="date" class="form-control" data-filter="received_date_to" />
						</div>
					</div>
					<div class="ac-filters-footer">
						<button type="button" class="btn btn-xs btn-default" data-action="reset-filters">
							إعادة تعيين الفلاتر
						</button>
					</div>
				</div>

				<!-- Main Table -->
				<div class="archive-cards-table-card">
					<div class="archive-cards-table-scroll">
						<table class="archive-cards-table" data-role="cards-table">
							<colgroup data-role="table-colgroup"></colgroup>
							<thead data-role="table-thead"></thead>
							<tbody data-role="table-tbody"></tbody>
						</table>
					</div>

					<div class="archive-pagination-host" data-role="pagination-bar"></div>
				</div>

				<input
					type="file"
					accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
					data-role="quick-replace-file-input"
					hidden
				/>
			</div>
		`);

		this.render_table_header();
	}

	render_stats_cards_html() {
		const s = this.stats || { total: 0, active: 0, paused: 0, stopped: 0 };
		const cur = this.state.status || "";

		const items = [
			{
				status: "",
				title: "الكل",
				subtitle: "إجمالي البطاقات",
				count: s.total || 0,
				tone: "slate",
				svg: `
					<svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<defs>
							<linearGradient id="ac-layers-top" x1="4" y1="5" x2="24" y2="14" gradientUnits="userSpaceOnUse">
								<stop offset="0%" stop-color="#60A5FA"/>
								<stop offset="100%" stop-color="#1D6FF2"/>
							</linearGradient>
							<linearGradient id="ac-layers-mid" x1="4" y1="12" x2="24" y2="19" gradientUnits="userSpaceOnUse">
								<stop offset="0%" stop-color="#3B82F6"/>
								<stop offset="100%" stop-color="#155EEF"/>
							</linearGradient>
						</defs>
						<path d="M14 4.5L24.5 9.8L14 15.1L3.5 9.8L14 4.5Z" fill="url(#ac-layers-top)"/>
						<path d="M4.2 13.7L14 18.7L23.8 13.7" stroke="url(#ac-layers-mid)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
						<path d="M4.2 17.8L14 22.8L23.8 17.8" stroke="#0B5ED7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				`,
			},
			{
				status: "نشطة",
				title: "نشط",
				subtitle: "بطاقات عاملة",
				count: s.active || 0,
				tone: "emerald",
				svg: `
					<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<defs>
							<linearGradient id="ac-card-green" x1="3" y1="5" x2="22" y2="20" gradientUnits="userSpaceOnUse">
								<stop offset="0%" stop-color="#22C55E"/>
								<stop offset="100%" stop-color="#0D9448"/>
							</linearGradient>
						</defs>
						<rect x="2.5" y="5.5" width="19" height="13.5" rx="2.8" fill="url(#ac-card-green)"/>
						<rect x="4.5" y="8.2" width="15" height="2.3" rx="1" fill="#D1FAE5"/>
						<circle cx="6.8" cy="14.5" r="1.3" fill="#ECFDF5"/>
						<circle cx="20.5" cy="18.5" r="5.5" fill="#16A34A" stroke="#FFFFFF" stroke-width="1.5"/>
						<path d="M18.2 18.6L19.8 20.2L22.9 17.1" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				`,
			},
			{
				status: "موقفة مؤقتاً",
				title: "موقفة مؤقتاً",
				subtitle: "إيقاف تشغيلي مؤقت",
				count: s.paused || 0,
				tone: "amber",
				svg: `
					<svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<defs>
							<linearGradient id="ac-pause-amber" x1="4" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse">
								<stop offset="0%" stop-color="#FBBF24"/>
								<stop offset="100%" stop-color="#D97706"/>
							</linearGradient>
						</defs>
						<circle cx="14" cy="14" r="10.5" fill="url(#ac-pause-amber)" stroke="#FFFFFF" stroke-width="1.4"/>
						<rect x="10.6" y="9.5" width="2.3" height="9" rx="1.15" fill="#FFFFFF"/>
						<rect x="15.1" y="9.5" width="2.3" height="9" rx="1.15" fill="#FFFFFF"/>
					</svg>
				`,
			},
			{
				status: "موقفة نهائياً",
				title: "موقفة نهائياً (متلفة)",
				subtitle: "بطاقات ملغاة / متوقفة",
				count: s.stopped || 0,
				tone: "rose",
				svg: `
					<svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<defs>
							<linearGradient id="ac-trash-red" x1="6" y1="6" x2="22" y2="24" gradientUnits="userSpaceOnUse">
								<stop offset="0%" stop-color="#F87171"/>
								<stop offset="100%" stop-color="#DC2626"/>
							</linearGradient>
						</defs>
						<path d="M11 5.5C11 4.95 11.45 4.5 12 4.5H16C16.55 4.5 17 4.95 17 5.5V6.8H11V5.5Z" fill="#EF4444"/>
						<rect x="6.5" y="6.5" width="15" height="2.4" rx="1.2" fill="#EF4444" stroke="#FFFFFF" stroke-width="0.6"/>
						<path d="M8.2 9.5H19.8L18.9 21.3C18.8 22.4 17.9 23.2 16.8 23.2H11.2C10.1 23.2 9.2 22.4 9.1 21.3L8.2 9.5Z" fill="url(#ac-trash-red)" stroke="#FFFFFF" stroke-width="1"/>
						<path d="M11.6 13.7L16.4 18.5M16.4 13.7L11.6 18.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
					</svg>
				`,
			},
		];

		return `
			<div class="ac-stats-column">
				${items
					.map(
						(item) => `
					<button
						type="button"
						class="ac-stat-card tone-${item.tone} ${cur === item.status ? "is-active" : ""}"
						data-action="filter-status"
						data-status="${frappe.utils.escape_html(item.status)}"
					>
						<div class="ac-stat-indicator-wrap">
							<span class="ac-stat-icon">${item.svg}</span>
							<div class="ac-stat-labels">
								<span class="ac-stat-title">${frappe.utils.escape_html(item.title)}</span>
								<span class="ac-stat-sub">${frappe.utils.escape_html(item.subtitle)}</span>
							</div>
						</div>
						<div class="ac-stat-value">${Number(item.count).toLocaleString("en-US")}</div>
					</button>
				`
					)
					.join("")}
			</div>
		`;
	}

	render_empty_preview_html() {
		return `
			<div class="ac-upper-split-layout is-empty">
				<div class="ac-info-panel ac-info-panel-empty">
					<div class="ac-preview-empty">
						<div class="ac-preview-empty-icon">
							<i class="fa fa-id-card-o"></i>
						</div>
						<div class="ac-preview-empty-title">حدد بطاقة من الجدول لعرض بياناتها</div>
						<div class="ac-preview-empty-sub">
							اختر بطاقة من الجدول أدناه أو تنقّل بأسهم لوحة المفاتيح (↑ ↓) لعرض بيانات البطاقة وصور الوجهين الأمامي والخلفي.
						</div>
					</div>
				</div>
				<div class="ac-images-panel ac-images-panel-empty">
					<div class="ac-preview-images-row">
						<div class="ac-preview-image-card">
							<div class="ac-preview-image-header">
								<span>الوجه الأمامي</span>
							</div>
							<div class="ac-preview-aspect-frame is-protected">
								<div class="ac-preview-protected-msg">
									<i class="fa fa-credit-card"></i>
									<span>حدد بطاقة من الجدول لعرض بياناتها</span>
								</div>
							</div>
						</div>
						<div class="ac-preview-image-card">
							<div class="ac-preview-image-header">
								<span>الوجه الخلفي</span>
							</div>
							<div class="ac-preview-aspect-frame is-protected">
								<div class="ac-preview-protected-msg">
									<i class="fa fa-credit-card"></i>
									<span>حدد بطاقة من الجدول لعرض بياناتها</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	render_selected_preview_html(card) {
		if (!card) return this.render_empty_preview_html();

		const can_view_img = Boolean(this.permissions.can_view_images);
		const render_side_box = (side, label, url) => {
			if (!can_view_img) {
				return `
					<div class="ac-preview-image-card">
						<div class="ac-preview-image-header">
							<span>${label}</span>
							<span class="ac-protected-tag"><i class="fa fa-lock"></i> محمية</span>
						</div>
						<div class="ac-preview-aspect-frame is-protected">
							<div class="ac-preview-protected-msg">
								<i class="fa fa-eye-slash"></i>
								<span>ليست لديك صلاحية عرض صور البطاقات</span>
							</div>
						</div>
					</div>
				`;
			}

			return `
				<div class="ac-preview-image-card">
					<div class="ac-preview-image-header">
						<span>${label}</span>
						${
							url
								? `<button
							type="button"
							class="btn btn-xs btn-default"
							data-action="preview-zoom"
							data-side="${side}"
							title="تكبير الصورة"
						>
							<i class="fa fa-search-plus"></i> تكبير
						</button>`
								: ""
						}
					</div>
					<div
						class="ac-preview-aspect-frame ${url ? "" : "is-protected"}"
						data-card-image-surface="1"
						data-side="${side}"
						${url ? 'data-action="preview-zoom"' : ""}
					>
						${
							url
								? `<img src="${frappe.utils.escape_html(url)}" alt="${label}" class="ac-preview-img" />`
								: `<div class="ac-preview-protected-msg"><span>لا توجد صورة</span></div>`
						}
					</div>
				</div>
			`;
		};

		const render_ro_field = (label, value, opts = {}) => {
			const val_str = value !== null && value !== undefined && String(value).trim() !== "" ? String(value) : "—";
			const dir_attr = opts.ltr ? 'dir="ltr"' : "";
			const cls_extra = [
				opts.ltr ? "is-ltr" : "",
				opts.primary ? "is-primary" : "",
				opts.full ? "is-full" : "",
			]
				.filter(Boolean)
				.join(" ");

			return `
				<div class="ac-ro-field ${cls_extra}">
					<label class="ac-ro-label">${frappe.utils.escape_html(label)}</label>
					<div class="ac-ro-surface" ${dir_attr} title="${frappe.utils.escape_html(val_str)}">
						${opts.raw_html ? opts.raw_html : frappe.utils.escape_html(val_str)}
					</div>
				</div>
			`;
		};

		const can_view_pin = Boolean(this.permissions.can_view_pin);
		const pin_surface_html = `
			<code class="ac-ro-pin-value" data-role="upper-pin-display" dir="ltr">••••</code>
			${
				can_view_pin
					? `<button type="button" class="btn btn-xs btn-default ac-ro-pin-btn" data-action="upper-reveal-pin" title="إظهار / إخفاء الرمز السري">
						<i class="fa fa-eye"></i> <span>إظهار</span>
					</button>`
					: ""
			}
		`;

		return `
			<div class="ac-upper-split-layout">
				<!-- Right: Card Information Panel -->
				<div class="ac-info-panel" data-status="${frappe.utils.escape_html(card.status || "")}">
					<div class="ac-info-panel-header">
						<div class="ac-info-header-title">
							<span class="acvd-serial-badge">#${card.serial_no}</span>
							<span class="ac-info-panel-heading">بيانات البطاقة</span>
						</div>
						<div class="ac-info-header-badges">
							<span class="ac-copy-badge acd-copy-pill">نسخة ${card.copy_no || 1}</span>
							<span class="acvd-status-pill" data-status="${frappe.utils.escape_html(card.status || "")}">${frappe.utils.escape_html(format_card_status_label(card.status))}</span>
						</div>
					</div>

					<div class="ac-ro-fields-grid">
						${render_ro_field("اسم البطاقة", card.base_card_name, { primary: true })}
						${render_ro_field("البنك", card.bank_name || card.bank, { primary: true })}
						${render_ro_field("رقم الحساب", card.account_number)}
						${render_ro_field("رقم البطاقة", card.card_number)}
						${render_ro_field("المندوب", card.representative_name || card.representative)}
						${render_ro_field("المنطقة", card.region_name || card.region)}
						${render_ro_field("تاريخ الاستلام", card.received_date || "—", { ltr: true })}
						${render_ro_field("الرمز السري", "••••", { raw_html: pin_surface_html })}
						${render_ro_field("الحد اليومي", card.daily_limit_formatted || "—")}
						${render_ro_field("مالك البطاقة", card.card_owner_name || card.card_owner)}
					</div>
				</div>

				<!-- Center: Images Panel -->
				<div class="ac-images-panel">
					<div class="ac-preview-images-row">
						${render_side_box("front", "الوجه الأمامي", card.front_image_url)}
						${render_side_box("back", "الوجه الخلفي", card.back_image_url)}
					</div>
				</div>
			</div>
		`;
	}

	render_columns_menu_html() {
		return `
			<div class="ac-columns-menu-header">إظهار / إخفاء الأعمدة</div>
			<div class="ac-columns-menu-list">
				${ARCHIVE_CARDS_COLUMNS.map((col) => {
					const is_visible = !this.state.hidden_columns.has(col.key);
					return `
						<label class="ac-column-toggle-item ${col.locked ? "is-locked" : ""}">
							<input
								type="checkbox"
								data-column-toggle="${col.key}"
								${is_visible ? "checked" : ""}
								${col.locked ? "disabled" : ""}
							/>
							<span>${frappe.utils.escape_html(col.label)}</span>
							${col.locked ? `<small class="text-muted">(أساسي)</small>` : ""}
						</label>
					`;
				}).join("")}
			</div>
		`;
	}

	get_visible_columns() {
		return ARCHIVE_CARDS_COLUMNS.filter(
			(col) => col.locked || !this.state.hidden_columns.has(col.key)
		);
	}

	render_table_header() {
		const visible_cols = this.get_visible_columns();
		const $colgroup = $(this.page.main).find('[data-role="table-colgroup"]');
		const $thead = $(this.page.main).find('[data-role="table-thead"]');

		$colgroup.html(
			visible_cols.map((col) => `<col style="width: ${col.width};" />`).join("")
		);

		$thead.html(`
			<tr>
				${visible_cols
					.map((col) => {
						const is_sorted = this.state.sort_by === col.key;
						const arrow = is_sorted
							? this.state.sort_order === "asc"
								? "▲"
								: "▼"
							: "";
						return `
							<th
								class="ac-th ${col.sortable ? "is-sortable" : ""} ${is_sorted ? "is-sorted" : ""}"
								data-sort-col="${col.key}"
							>
								<span>${frappe.utils.escape_html(col.label)}</span>
								<span class="ac-sort-indicator">${arrow}</span>
							</th>
						`;
					})
					.join("")}
			</tr>
		`);
	}

	render_table_rows() {
		const visible_cols = this.get_visible_columns();
		const $tbody = $(this.page.main).find('[data-role="table-tbody"]');

		if (!this.rows.length) {
			$tbody.html(`
				<tr class="ac-empty-row">
					<td colspan="${visible_cols.length}">
						<div class="ac-table-empty-state">
							<i class="fa fa-credit-card"></i>
							<span>لا توجد بطاقات مطابقة لمعايير البحث أو الفلترة الحالية.</span>
						</div>
					</td>
				</tr>
			`);
			return;
		}

		const selected = this.state.selected_card_name;
		const html = this.rows
			.map((row) => {
				const is_sel = row.name === selected;
				const cells = visible_cols
					.map((col) => this.render_table_cell(row, col.key))
					.join("");
				return `
					<tr
						class="ac-table-row ${is_sel ? "is-selected" : ""}"
						data-card-name="${frappe.utils.escape_html(row.name)}"
						data-status="${frappe.utils.escape_html(row.status || "")}"
						tabindex="-1"
					>
						${cells}
					</tr>
				`;
			})
			.join("");

		$tbody.html(html);
	}

	render_table_cell(row, key) {
		if (key === "serial_no") {
			return `<td class="ac-td-mono">${row.serial_no}</td>`;
		}
		if (key === "card_name") {
			const copy_no = Number(row.copy_no || 1);
			const copy_badge = `<span class="ac-copy-badge ac-row-copy-badge" title="نسخة ${copy_no}">نسخة ${copy_no}</span>`;
			return `
				<td class="ac-td-name">
					<span class="ac-cell-card-name">${frappe.utils.escape_html(row.base_card_name)}</span>
					${copy_badge}
				</td>
			`;
		}
		if (key === "account_number") {
			return `<td class="ac-td-ltr" dir="ltr">${frappe.utils.escape_html(row.account_number)}</td>`;
		}
		if (key === "card_number") {
			return `<td class="ac-td-ltr" dir="ltr">${frappe.utils.escape_html(row.card_number)}</td>`;
		}
		if (key === "bank") {
			return `<td>${frappe.utils.escape_html(row.bank_name || row.bank)}</td>`;
		}
		if (key === "representative") {
			return `<td>${frappe.utils.escape_html(row.representative_name || row.representative)}</td>`;
		}
		if (key === "region") {
			return `<td>${frappe.utils.escape_html(row.region_name || row.region)}</td>`;
		}
		if (key === "card_owner") {
			return `<td>${frappe.utils.escape_html(row.card_owner_name || row.card_owner)}</td>`;
		}
		if (key === "daily_limit") {
			return `<td class="ac-td-ltr" dir="ltr">${frappe.utils.escape_html(row.daily_limit_formatted || "—")}</td>`;
		}
		if (key === "received_date") {
			return `<td class="ac-td-ltr" dir="ltr">${frappe.utils.escape_html(row.received_date || "—")}</td>`;
		}
		if (key === "status") {
			return `
				<td>
					<span class="acvd-status-pill" data-status="${frappe.utils.escape_html(row.status)}">
						${frappe.utils.escape_html(format_card_status_label(row.status))}
					</span>
				</td>
			`;
		}
		return `<td>${frappe.utils.escape_html(String(row[key] ?? ""))}</td>`;
	}

	mount_pagination() {
		const lengths = ["20", "50", "100", "500", "1000"].map((v) => ({
			label: __("{0} سجل", [v]),
			value: v,
		}));
		lengths.push({ label: __("كل السجلات"), value: "all" });

		this.pagination_bar = new custom.data_grid.PaginationBar({
			container: $(this.page.main).find('[data-role="pagination-bar"]'),
			page_length: String(this.state.page_size),
			allowed_page_lengths: lengths,
			on_change: async ({ page, page_length }) => {
				this.state.page = page;
				this.state.page_size = page_length === "all" ? "all" : Number(page_length) || 50;
				await this.load_context(true);
			},
		});
		this.pagination_bar.mount();
	}

	render_pagination() {
		const p = this.pagination || { page: 1, page_size: 50, total_count: 0, total_pages: 1 };
		this.pagination_bar?.update({
			page: p.page,
			page_length: String(p.page_size ?? this.state.page_size ?? 50),
			total_rows: p.total_count,
			total_pages: p.total_pages,
		});
	}

	populate_master_filters() {
		const $main = $(this.page.main);
		const m = this.masters || {};

		const fill_select = (key, items, label_field) => {
			const $sel = $main.find(`[data-filter="${key}"]`);
			const current_val = this.state.filters[key] || "";
			const opts = [`<option value="">الكل</option>`].concat(
				(items || []).map(
					(it) =>
						`<option value="${frappe.utils.escape_html(it.name)}" ${
							it.name === current_val ? "selected" : ""
						}>${frappe.utils.escape_html(it[label_field] || it.name)}</option>`
				)
			);
			$sel.html(opts.join(""));
		};

		fill_select("bank", m.banks, "bank_name");
		fill_select("representative", m.representatives, "representative_name");
		fill_select("region", m.regions, "region_name");
		fill_select("card_owner", m.card_owners, "account_name");
	}

	update_toolbar_state() {
		const $main = $(this.page.main);
		const p = this.permissions || {};
		const has_sel = Boolean(this.state.selected_card_name);

		$main.find('[data-action="create-card"]').prop("hidden", !p.can_create);
		$main.find('[data-action="open-selected-view"]').prop("disabled", !has_sel);

		const perms_loaded = Object.keys(p).length > 0;
		const can_view_transfer = Boolean(p.can_view_transfer_timeline);
		const can_view_events = Boolean(p.can_view_card_event_history);
		const can_any_timeline_or_events = can_view_transfer || can_view_events;
		$main
			.find('[data-role="timeline-events-dropdown-wrap"]')
			.prop("hidden", !can_any_timeline_or_events);
		$main
			.find('[data-action="toggle-timeline-events-menu"]')
			.prop("hidden", !can_any_timeline_or_events)
			.prop("disabled", !(has_sel && can_any_timeline_or_events));
		if (!has_sel || !can_any_timeline_or_events) {
			$main.find('[data-role="timeline-events-menu"]').prop("hidden", true);
		}
		$main
			.find('[data-action="open-transfer-timeline"]')
			.prop("hidden", !can_view_transfer)
			.prop("disabled", !(has_sel && can_view_transfer));
		$main
			.find('[data-action="open-card-event-history"]')
			.prop("hidden", !can_view_events)
			.prop("disabled", !(has_sel && can_view_events));
		$main
			.find('[data-action="open-activity-timeline"]')
			.prop("hidden", perms_loaded && !p.can_view_activity_timeline)
			.prop("disabled", !(has_sel && p.can_view_activity_timeline));

		const selected_card = this.get_selected_card_object();
		const is_selected_perm_stopped =
			Boolean(selected_card) &&
			String(selected_card.status || "").trim() === "موقفة نهائياً";
		const perm_stopped_allowed =
			!is_selected_perm_stopped || Boolean(p.can_reactivate_permanently_stopped_card);
		const can_change_selected_status = Boolean(p.can_change_status && perm_stopped_allowed);
		const can_transfer_selected = Boolean(p.can_transfer && perm_stopped_allowed);
		const can_any_action = Boolean(
			can_change_selected_status || can_transfer_selected || p.can_delete
		);
		$main
			.find('[data-action="toggle-actions-menu"]')
			.prop("disabled", !(has_sel && can_any_action));
		$main
			.find('[data-action="action-change-status"]')
			.prop("hidden", !can_change_selected_status);
		$main
			.find('[data-action="action-transfer-card"]')
			.prop("hidden", !can_transfer_selected);
		$main.find('[data-action="action-delete-card"]').prop("hidden", !p.can_delete);
		$main
			.find('[data-role="delete-divider"]')
			.prop(
				"hidden",
				!(p.can_delete && (can_change_selected_status || can_transfer_selected))
			);

		const active_filter_count = Object.values(this.state.filters).filter(Boolean).length;
		const $badge = $main.find('[data-role="filter-badge"]');
		$badge.text(active_filter_count).prop("hidden", active_filter_count === 0);
	}

	async load_context(preserve_selection = false) {
		const req_token = ++this.context_request_token;

		try {
			const res = await frappe.call({
				method: "archive.api.cards.get_cards_context",
				args: {
					page: this.state.page,
					page_size: this.state.page_size,
					search: this.state.search,
					status: this.state.status,
					bank: this.state.filters.bank,
					representative: this.state.filters.representative,
					region: this.state.filters.region,
					card_owner: this.state.filters.card_owner,
					received_date_from: this.state.filters.received_date_from,
					received_date_to: this.state.filters.received_date_to,
					sort_by: this.state.sort_by,
					sort_order: this.state.sort_order,
				},
			});

			if (req_token !== this.context_request_token) return;

			const data = res?.message || {};
			this.permissions = data.permissions || {};
			this.stats = data.stats || { total: 0, active: 0, paused: 0, stopped: 0 };
			this.rows = Array.isArray(data.rows) ? data.rows : [];
			this.pagination = data.pagination || {
				page: 1,
				page_size: 50,
				total_count: 0,
				total_pages: 1,
			};
			this.masters = data.masters || this.masters;

			this.populate_master_filters();

			$(this.page.main)
				.find('[data-role="stats-panel"]')
				.html(this.render_stats_cards_html());

			// Selection resolution: never auto-select any row
			if (preserve_selection && this.state.selected_card_name) {
				const found = this.rows.find((r) => r.name === this.state.selected_card_name);
				if (found) {
					this.preview_card = found;
				} else {
					this.state.selected_card_name = null;
					this.preview_card = null;
				}
			} else {
				this.state.selected_card_name = null;
				this.preview_card = null;
			}
			this.preview_request_token += 1;

			this.render_table_header();
			this.render_table_rows();
			this.render_pagination();
			this.update_toolbar_state();
			this.render_preview_panel();
		} catch (err) {
			// Handled by Frappe error handler
		}
	}

	render_preview_panel() {
		this.upper_revealed_pin = null;
		this.upper_pin_shown = false;
		this.upper_pin_card = null;
		const $panel = $(this.page.main).find('[data-role="preview-panel"]');
		$panel.removeAttr("data-status");
		$panel.html(this.render_selected_preview_html(this.preview_card));
	}

	async select_row(card_name, scroll_into_view = false) {
		if (!card_name) {
			this.state.selected_card_name = null;
			this.preview_card = null;
			this.preview_request_token += 1;
			this.render_table_rows();
			this.update_toolbar_state();
			this.render_preview_panel();
			return;
		}

		this.state.selected_card_name = card_name;
		const $main = $(this.page.main);
		$main.find(".ac-table-row").removeClass("is-selected");
		const $row = $main.find(
			`.ac-table-row[data-card-name="${ CSS.escape ? CSS.escape(card_name) : card_name }"]`
		);
		$row.addClass("is-selected");

		if (scroll_into_view && $row.length && $row[0].scrollIntoView) {
			$row[0].scrollIntoView({ block: "nearest", behavior: "smooth" });
		}

		this.update_toolbar_state();

		const local_row = this.rows.find((r) => r.name === card_name);
		if (local_row) {
			this.preview_card = local_row;
			this.render_preview_panel();
		}

		const token = ++this.preview_request_token;
		try {
			const res = await frappe.call({
				method: "archive.api.cards.get_card_preview",
				args: { card: card_name },
			});
			if (token !== this.preview_request_token) return;
			if (res?.message?.card) {
				this.preview_card = res.message.card;
				this.update_toolbar_state();
				this.render_preview_panel();
			}
		} catch (_) {
			// Keep local preview snapshot
		}
	}

	get_selected_card_object() {
		if (!this.state.selected_card_name) return null;
		return (
			this.rows.find((r) => r.name === this.state.selected_card_name) ||
			this.preview_card ||
			null
		);
	}

	open_card_view_dialog(card_name) {
		const target = card_name || this.state.selected_card_name;
		if (!target || !window.ArchiveCardViewDialog) return;

		const dlg = new window.ArchiveCardViewDialog({
			card_name: target,
			on_changed: async (updated_card) => {
				if (updated_card && updated_card.name) {
					this.state.selected_card_name = updated_card.name;
				}
				await this.load_context(true);
			},
		});
		dlg.show();
	}

	close_all_popovers() {
		const $main = $(this.page.main);
		$main.find('[data-role="columns-menu"]').prop("hidden", true);
		$main.find('[data-role="actions-menu"]').prop("hidden", true);
		$main.find('[data-role="timeline-events-menu"]').prop("hidden", true);
	}

	bind_events() {
		const $main = $(this.page.main);

		// Right-click context menu on 70% Preview Panel images
		if (window.ArchiveCardImageContextMenu) {
			window.ArchiveCardImageContextMenu.bind($main, ($el) => {
				const card = this.preview_card;
				if (!card) return null;
				const side = $el.attr("data-side") || "front";
				const img_url = side === "back" ? card.back_image_url : card.front_image_url;
				return {
					can_view_images: Boolean(this.permissions.can_view_images),
					can_replace:
						Boolean(this.permissions.can_edit_images) &&
						String(card.status || "").trim() !== "موقفة نهائياً",
					card_name: card.name,
					card_title: `${card.base_card_name} (#${card.serial_no})`,
					front_url: card.front_image_url,
					back_url: card.back_image_url,
					image_url: img_url,
					side,
					on_replace: (targetSide) => {
						this._quick_replace_side = targetSide;
						this._quick_replace_card = card.name;
						$main.find('[data-role="quick-replace-file-input"]').trigger("click");
					},
				};
			});
		}

		// Quick replace file input from right-click menu on preview
		$main.on("change", '[data-role="quick-replace-file-input"]', async (e) => {
			const file = e.target.files && e.target.files[0];
			e.target.value = "";
			if (!file || !this._quick_replace_card || !this._quick_replace_side) return;

			const side = this._quick_replace_side;
			const card_name = this._quick_replace_card;
			try {
				const staged = await window.upload_staged_card_image(file, side);
				const payload = {};
				payload[side === "back" ? "back_image" : "front_image"] =
					staged.file_id || staged.file_url;

				await frappe.call({
					method: "archive.api.cards.update_card",
					args: { card: card_name, payload },
				});
				frappe.show_alert({
					message: "تم تحديث صورة البطاقة بنجاح.",
					indicator: "green",
				});
				await this.load_context(true);
			} catch (err) {
				frappe.msgprint({
					title: "خطأ في تبديل الصورة",
					message: err.message || "تعذر تبديل الصورة.",
					indicator: "red",
				});
			}
		});

		// Preview image click -> open viewer
		$main.on("click", '[data-action="preview-zoom"]', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const card = this.preview_card;
			if (!card || !this.permissions.can_view_images || !window.ArchiveCardImageViewer) return;
			const side = $(e.currentTarget).attr("data-side") || "front";
			const img_url = side === "back" ? card.back_image_url : card.front_image_url;
			if (!img_url) return;
			window.ArchiveCardImageViewer.open({
				card_name: card.name,
				card_title: `${card.base_card_name} (#${card.serial_no})`,
				front_url: card.front_image_url,
				back_url: card.back_image_url,
				initial_side: side,
			});
		});

		// Upper Card Information Panel: Reveal / Hide PIN
		$main.on("click", '[data-action="upper-reveal-pin"]', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const card = this.preview_card;
			if (!card || !this.permissions.can_view_pin) return;

			const card_name = card.name;
			if (this.upper_pin_shown && this.upper_pin_card === card_name) {
				this.upper_pin_shown = false;
				const $disp = $main.find('[data-role="upper-pin-display"]');
				const $btn = $main.find('[data-action="upper-reveal-pin"]');
				$disp.text("••••").removeClass("is-revealed");
				$btn.find("i").attr("class", "fa fa-eye");
				$btn.find("span").text("إظهار");
				return;
			}

			const $btnInitial = $(e.currentTarget);
			if (this.upper_pin_card !== card_name || !this.upper_revealed_pin) {
				$btnInitial.prop("disabled", true);
				try {
					const res = await frappe.call({
						method: "archive.api.cards.reveal_card_pin",
						args: { card: card_name },
					});
					if (this.state.selected_card_name !== card_name || this.preview_card?.name !== card_name) {
						return;
					}
					this.upper_revealed_pin = String(res?.message?.pin || "");
					this.upper_pin_card = card_name;
				} finally {
					$main.find('[data-action="upper-reveal-pin"]').prop("disabled", false);
				}
			}

			if (!this.upper_revealed_pin) return;
			this.upper_pin_shown = true;
			const $disp = $main.find('[data-role="upper-pin-display"]');
			const $btn = $main.find('[data-action="upper-reveal-pin"]');
			$disp.text(this.upper_revealed_pin).addClass("is-revealed");
			$btn.find("i").attr("class", "fa fa-eye-slash");
			$btn.find("span").text("إخفاء");
		});

		// Stat cards click -> filter by status
		$main.on("click", '[data-action="filter-status"]', (e) => {
			e.preventDefault();
			const status = $(e.currentTarget).attr("data-status") || "";
			this.state.status = status;
			this.state.page = 1;
			this.load_context(true);
		});

		// Search input
		$main.on("click", ".archive-cards-search-box", (e) => {
			if (!$(e.target).is("input")) {
				$(e.currentTarget).find("input").focus();
			}
		});

		$main.on("input", '[data-role="search-input"]', (e) => {
			const val = String($(e.currentTarget).val() || "");
			clearTimeout(this.search_timer);
			this.search_timer = setTimeout(() => {
				this.state.search = val;
				this.state.page = 1;
				this.load_context(true);
			}, 220);
		});

		// Toggle filters drawer
		$main.on("click", '[data-action="toggle-filters"]', () => {
			this.state.filters_open = !this.state.filters_open;
			$main.find('[data-role="filters-drawer"]').prop("hidden", !this.state.filters_open);
		});

		// Filter changes
		$main.on("change", "[data-filter]", (e) => {
			const key = $(e.currentTarget).attr("data-filter");
			this.state.filters[key] = String($(e.currentTarget).val() || "");
			this.state.page = 1;
			this.load_context(true);
		});

		$main.on("click", '[data-action="reset-filters"]', () => {
			this.state.filters = {
				bank: "",
				representative: "",
				region: "",
				card_owner: "",
				received_date_from: "",
				received_date_to: "",
			};
			$main.find("[data-filter]").val("");
			this.state.page = 1;
			this.load_context(true);
		});

		// Popover menus
		$main.on("click", '[data-action="toggle-columns-menu"]', (e) => {
			e.stopPropagation();
			const $m = $main.find('[data-role="columns-menu"]');
			const was_hidden = $m.prop("hidden");
			this.close_all_popovers();
			$m.prop("hidden", !was_hidden);
		});

		$main.on("click", '[data-action="toggle-actions-menu"]', (e) => {
			e.stopPropagation();
			const $m = $main.find('[data-role="actions-menu"]');
			const was_hidden = $m.prop("hidden");
			this.close_all_popovers();
			$m.prop("hidden", !was_hidden);
		});

		$main.on("click", '[data-action="toggle-timeline-events-menu"]', (e) => {
			e.stopPropagation();
			const $m = $main.find('[data-role="timeline-events-menu"]');
			const was_hidden = $m.prop("hidden");
			this.close_all_popovers();
			$m.prop("hidden", !was_hidden);
		});

		$main.on("click", '[data-role="columns-menu"]', (e) => {
			e.stopPropagation();
		});

		$(document).on("click", () => {
			this.close_all_popovers();
		});

		// Column visibility checkbox change
		$main.on("change", "[data-column-toggle]", (e) => {
			const col_key = $(e.currentTarget).attr("data-column-toggle");
			const checked = $(e.currentTarget).is(":checked");
			if (checked) {
				this.state.hidden_columns.delete(col_key);
			} else {
				this.state.hidden_columns.add(col_key);
			}
			this.save_hidden_columns();
			this.render_table_header();
			this.render_table_rows();
		});

		// Sorting
		$main.on("click", ".ac-th.is-sortable", (e) => {
			const col = $(e.currentTarget).attr("data-sort-col");
			if (!col) return;
			if (this.state.sort_by === col) {
				this.state.sort_order = this.state.sort_order === "asc" ? "desc" : "asc";
			} else {
				this.state.sort_by = col;
				this.state.sort_order = "desc";
			}
			this.load_context(true);
		});

		// Row click & double click
		$main.on("click", ".ac-table-row", (e) => {
			const name = $(e.currentTarget).attr("data-card-name");
			if (name) {
				this.select_row(name, false);
			}
		});

		$main.on("dblclick", ".ac-table-row", (e) => {
			const name = $(e.currentTarget).attr("data-card-name");
			if (name) {
				this.select_row(name, false);
				this.open_card_view_dialog(name);
			}
		});

		// Create card
		$main.on("click", '[data-action="create-card"]', () => {
			if (!window.ArchiveCardCreateDialog) return;
			const dlg = new window.ArchiveCardCreateDialog({
				masters: this.masters,
				permissions: this.permissions,
				on_created: async (created_card) => {
					if (created_card && created_card.name) {
						this.state.selected_card_name = created_card.name;
					}
					await this.load_context(true);
				},
			});
			dlg.show();
		});

		// Open selected view
		$main.on("click", '[data-action="open-selected-view"]', () => {
			this.open_card_view_dialog(this.state.selected_card_name);
		});

		// Timeline menu items
		$main.on("click", '[data-action="open-card-event-history"]', () => {
			this.close_all_popovers();
			if (this.state.selected_card_name && window.ArchiveCardEventHistoryDialog) {
				new window.ArchiveCardEventHistoryDialog({
					card_name: this.state.selected_card_name,
				}).show();
			}
		});

		$main.on("click", '[data-action="open-transfer-timeline"]', () => {
			this.close_all_popovers();
			if (this.state.selected_card_name && window.ArchiveCardTransferTimelineDialog) {
				new window.ArchiveCardTransferTimelineDialog({
					card_name: this.state.selected_card_name,
				}).show();
			}
		});

		$main.on("click", '[data-action="open-activity-timeline"]', () => {
			this.close_all_popovers();
			if (this.state.selected_card_name && window.ArchiveCardActivityTimelineDialog) {
				new window.ArchiveCardActivityTimelineDialog({
					card_name: this.state.selected_card_name,
				}).show();
			}
		});

		// Actions menu items
		$main.on("click", '[data-action="action-change-status"]', () => {
			this.close_all_popovers();
			const card = this.get_selected_card_object();
			if (card && window.ArchiveCardStatusDialog) {
				window.ArchiveCardStatusDialog.open(card, async () => {
					await this.load_context(true);
				});
			}
		});

		$main.on("click", '[data-action="action-transfer-card"]', () => {
			this.close_all_popovers();
			const card = this.get_selected_card_object();
			if (card && window.ArchiveCardTransferDialog) {
				window.ArchiveCardTransferDialog.open(card, async () => {
					await this.load_context(true);
				});
			}
		});

		$main.on("click", '[data-action="action-delete-card"]', () => {
			this.close_all_popovers();
			const card = this.get_selected_card_object();
			if (card && window.ArchiveCardDeleteDialog) {
				window.ArchiveCardDeleteDialog.open(card, async () => {
					this.state.selected_card_name = null;
					await this.load_context(false);
				});
			}
		});

		$main.on("click", '[data-action="refresh-list"]', () => {
			this.load_context(false);
		});

		// Keyboard navigation (ArrowUp / ArrowDown)
		$(document).on("keydown", this._bound_keydown);
	}

	handle_keydown(e) {
		if (!$(this.wrapper).is(":visible")) return;
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

		// Do not hijack when modal or image viewer is open
		if (
			$(".modal.show, .modal.in, .archive-card-img-viewer-overlay").length > 0
		) {
			return;
		}

		// Do not hijack when focus is inside an input, textarea, select, or contenteditable
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
		const cur_idx = this.rows.findIndex((r) => r.name === this.state.selected_card_name);
		let next_idx = 0;
		if (cur_idx === -1) {
			next_idx = 0;
		} else if (e.key === "ArrowDown") {
			next_idx = Math.min(this.rows.length - 1, cur_idx + 1);
		} else if (e.key === "ArrowUp") {
			next_idx = Math.max(0, cur_idx - 1);
		}

		const next_row = this.rows[next_idx];
		if (next_row && next_row.name !== this.state.selected_card_name) {
			this.select_row(next_row.name, true);
		}
	}
}
