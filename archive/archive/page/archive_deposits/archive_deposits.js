frappe.pages["archive-deposits"].on_page_load = function (wrapper) {
	frappe.archive_deposits = new ArchiveDepositsPage(wrapper);
};

frappe.pages["archive-deposits"].on_page_show = function () {
	if (frappe.archive_deposits && frappe.archive_deposits._initialized) {
		frappe.archive_deposits.load_context(true);
	}
};

const DEPOSIT_OVER_LIMIT_MSG = "مبلغ الإيداع لا يمكن أن يتجاوز الحد اليومي للبطاقة";
const DEPOSIT_NEGATIVE_MSG = "لا يُسمح بإدخال مبلغ إيداع سالب";

const ARCHIVE_DEPOSITS_COLUMNS = [
	{ key: "card_name", label: "اسم البطاقة", width: "17.5%", locked: true, sortable: true },
	{ key: "card_number", label: "رقم البطاقة", width: "11.5%", locked: false, sortable: true },
	{ key: "bank", label: "البنك", width: "15.5%", locked: false, sortable: true },
	{ key: "representative", label: "المندوب", width: "11%", locked: false, sortable: true },
	{ key: "region", label: "المنطقة", width: "10%", locked: false, sortable: true },
	{ key: "deposit_amount", label: "مبلغ الإيداع", width: "12%", locked: true, sortable: true },
	{ key: "remaining_limit", label: "مبلغ الحد المتبقي", width: "11%", locked: false, sortable: true },
	{ key: "status", label: "الحالة", width: "11.5%", locked: true, sortable: true },
];

const DEPOSIT_SVGS = {
	header_coins: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v4c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 9v5c0 1.66 3.58 3 8 3s8-1.34 8-3V9"/><path d="M4 14v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5"/></svg>`,
	calendar: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
	info_circle: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
	search: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
	chevron_down: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
	chevron_right: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
	chevron_left: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
	undo: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
	lock: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
	stat_all: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>`,
	stat_deposited: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
	stat_not_deposited: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>`,
	stat_amount: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="15" cy="6" rx="6" ry="2.5"/><path d="M9 6v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V6"/><path d="M9 10v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5v-4"/><circle cx="7.5" cy="15.5" r="4.5"/><path d="M7.5 13.8v3.4"/></svg>`,
	stat_target: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
	save_disk: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
	refresh: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
	filter_funnel: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
	columns_grid: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
	status_check: `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
	status_cross: `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
	bank_badge: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
};

function format_deposit_number(value, empty_when_zero = false) {
	if (value === null || value === undefined || value === "") {
		return empty_when_zero ? "" : "0";
	}
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return empty_when_zero ? "" : "0";
	}
	const rounded = Math.round(num * 100) / 100;
	if (Math.abs(rounded) < 0.0001) {
		return empty_when_zero ? "" : "0";
	}
	const is_integer = Math.abs(rounded - Math.round(rounded)) < 0.0001;
	return rounded.toLocaleString("en-US", {
		minimumFractionDigits: is_integer ? 0 : 2,
		maximumFractionDigits: 2,
	});
}

function normalize_western_digits(str) {
	return String(str || "")
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

function sanitize_deposit_input_text(raw) {
	const western = normalize_western_digits(raw).replace(/,/g, "");
	let out = "";
	let has_dot = false;
	let decimals = 0;
	for (const ch of western) {
		if (ch >= "0" && ch <= "9") {
			if (has_dot) {
				if (decimals < 2) {
					out += ch;
					decimals += 1;
				}
			} else {
				out += ch;
			}
		} else if (ch === "." && !has_dot) {
			has_dot = true;
			out = (out || "0") + ".";
		}
	}
	return out;
}

function format_display_date_slash(iso_date) {
	const clean = String(iso_date || "").trim();
	const parts = clean.split("-");
	if (parts.length !== 3) return clean;
	return `${parts[0]} / ${parts[1]} / ${parts[2]}`;
}

function shift_iso_date(iso_date, delta_days) {
	const clean = String(iso_date || "").trim();
	const parts = clean.split("-").map(Number);
	if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
		return frappe.datetime.get_today();
	}
	const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
	dt.setUTCDate(dt.getUTCDate() + delta_days);
	const y = dt.getUTCFullYear();
	const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
	const d = String(dt.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function get_bank_tone_index(bank_name) {
	const s = String(bank_name || "");
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
	}
	return hash % 5;
}

class ArchiveDepositsPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		const initial_today = frappe.datetime?.get_today
			? frappe.datetime.get_today()
			: new Date().toISOString().slice(0, 10);

		this.state = {
			deposit_date: initial_today,
			today: initial_today,
			status_filter: "all",
			search: "",
			filters: {
				bank: "",
				representative: "",
				region: "",
			},
			page: 1,
			page_size: 50,
			sort_by: "serial_no",
			sort_order: "desc",
			filter_drawer_open: false,
			hidden_columns: this.read_hidden_columns(),
		};

		this.rows = [];
		this.rows_by_card = new Map();
		this.accounts_baseline = new Map();
		this.dirty_deposits = new Map();
		this.stats = {
			total_cards: 0,
			deposited_count: 0,
			not_deposited_count: 0,
			total_deposited_amount: 0,
			total_deposited_amount_formatted: "0",
			total_daily_target: 0,
			total_daily_target_formatted: "0",
		};
		this.pagination = { page: 1, page_size: 50, total_count: 0, total_pages: 1 };
		this.masters = { banks: [], representatives: [], regions: [] };
		this.permissions = { can_view: false, can_save: false };

		this._search_timer = null;
		this._load_seq = 0;
		this.is_loading = false;
		this.is_refreshing = false;
		this.is_saving = false;
		this._suppress_route_guard = false;

		this.make_page();
		this.render_shell();
		this.initialize();
	}

	get_hidden_columns_storage_key() {
		const user = String(frappe?.session?.user || "Guest").trim();
		return `archive.deposits.hidden_columns.v1:${user}`;
	}

	read_hidden_columns() {
		try {
			const raw = localStorage.getItem(this.get_hidden_columns_storage_key());
			const parsed = JSON.parse(raw || "[]");
			if (Array.isArray(parsed)) {
				const locked_keys = new Set(
					ARCHIVE_DEPOSITS_COLUMNS.filter((c) => c.locked).map((c) => c.key)
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
			title: "الإيداعات",
			single_column: true,
		});
		$(this.wrapper).addClass("archive-deposits-page");
	}

	async initialize() {
		await new Promise((resolve) => {
			frappe.require(
				[
					"/assets/archive/js/shared/data_grid/core.js",
					"/assets/archive/js/shared/data_grid/pagination.js",
					"/assets/archive/css/shared/data_grid.css",
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
			<div class="archive-deposits-shell" dir="rtl">
				<div class="archive-deposits-header">
					<div class="archive-deposits-brand">
						<span class="archive-deposits-brand-icon" aria-hidden="true">
							${DEPOSIT_SVGS.header_coins}
						</span>
						<div class="archive-deposits-brand-text">
							<h1>الإيداعات</h1>
							<span class="archive-deposits-subtitle">متابعة الإيداعات اليومية للبطاقات النشطة</span>
						</div>
					</div>

					<div class="archive-deposits-date-bar">
						<div class="archive-deposits-date-meta">
							<span class="archive-deposits-date-title">تاريخ الإيداعات</span>
							<span class="archive-deposits-date-hint">
								${DEPOSIT_SVGS.info_circle}
								<span>اختر التاريخ لعرض إيداعات ذلك اليوم</span>
							</span>
						</div>

						<div class="archive-deposits-date-controls">
							<button
								type="button"
								class="archive-deposits-day-step"
								data-action="prev-day"
								title="اليوم السابق"
								aria-label="اليوم السابق"
							>
								${DEPOSIT_SVGS.chevron_right}
							</button>

							<label class="archive-deposits-date-box" title="اختر تاريخ الإيداعات">
								<span class="archive-deposits-date-display" data-role="date-display" dir="ltr">
									${frappe.utils.escape_html(format_display_date_slash(this.state.deposit_date))}
								</span>
								<span class="archive-deposits-date-cal-icon" aria-hidden="true">
									${DEPOSIT_SVGS.calendar}
								</span>
								<input
									type="date"
									class="archive-deposits-date-native"
									data-role="deposit-date-input"
									value="${frappe.utils.escape_html(this.state.deposit_date)}"
								/>
							</label>

							<button
								type="button"
								class="archive-deposits-day-step"
								data-action="next-day"
								title="اليوم التالي"
								aria-label="اليوم التالي"
							>
								${DEPOSIT_SVGS.chevron_left}
							</button>

							<button
								type="button"
								class="btn archive-deposits-today-btn"
								data-action="go-today"
							>
								${DEPOSIT_SVGS.calendar}
								<span>اليوم</span>
							</button>
						</div>
					</div>
				</div>

				<div class="archive-deposits-stats" data-role="stats-bar"></div>

				<div class="archive-deposits-toolbar">
					<div class="archive-deposits-toolbar-right">
						<div class="archive-cards-search-group">
							<div class="archive-cards-search-box">
								<span class="archive-cards-search-icon" aria-hidden="true">${DEPOSIT_SVGS.search}</span>
								<input
									type="text"
									class="form-control archive-cards-search-input"
									data-role="search-input"
									placeholder="بحث في اسم البطاقة، رقم البطاقة، البنك، المندوب..."
								/>
							</div>
						</div>

						<button
							type="button"
							class="btn btn-default archive-deposits-tool-btn"
							data-action="toggle-filters"
						>
							${DEPOSIT_SVGS.filter_funnel}
							<span>الفلاتر</span>
							<span class="archive-deposits-filter-badge" data-role="filter-count" hidden>0</span>
							<span class="ad-btn-caret" aria-hidden="true">${DEPOSIT_SVGS.chevron_down}</span>
						</button>

						<div class="archive-deposits-dropdown-wrap">
							<button
								type="button"
								class="btn btn-default archive-deposits-tool-btn"
								data-action="toggle-columns-menu"
							>
								${DEPOSIT_SVGS.columns_grid}
								<span>الأعمدة</span>
								<span class="ad-btn-caret" aria-hidden="true">${DEPOSIT_SVGS.chevron_down}</span>
							</button>
							<div class="archive-deposits-columns-menu" data-role="columns-menu" hidden></div>
						</div>
					</div>

					<div class="archive-deposits-toolbar-left">
						<button
							type="button"
							class="btn archive-deposits-save-btn"
							data-action="save-deposits"
						>
							${DEPOSIT_SVGS.save_disk}
							<span>حفظ الإيداعات</span>
							<span class="archive-deposits-dirty-badge" data-role="dirty-count" hidden>0</span>
						</button>

						<button
							type="button"
							class="btn btn-default archive-deposits-tool-btn archive-deposits-refresh-btn"
							data-action="refresh-deposits"
						>
							<span class="ad-refresh-icon" aria-hidden="true">${DEPOSIT_SVGS.refresh}</span>
							<span>تحديث</span>
						</button>
					</div>
				</div>

				<div class="archive-deposits-filter-drawer" data-role="filter-drawer" hidden>
					<div class="ad-filter-grid">
						<div class="ad-filter-field">
							<label>البنك</label>
							<select class="form-control" data-filter="bank">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="ad-filter-field">
							<label>المندوب</label>
							<select class="form-control" data-filter="representative">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="ad-filter-field">
							<label>المنطقة</label>
							<select class="form-control" data-filter="region">
								<option value="">الكل</option>
							</select>
						</div>
						<div class="ad-filter-actions">
							<button type="button" class="btn btn-default btn-sm ad-reset-filter-btn" data-action="reset-filters">
								${DEPOSIT_SVGS.undo}
								<span>مسح الفلاتر</span>
							</button>
						</div>
					</div>
				</div>

				<div class="archive-deposits-table-card">
					<div class="archive-deposits-table-scroll" data-role="table-scroll">
						<table class="archive-deposits-table">
							<thead data-role="table-head"></thead>
							<tbody data-role="table-body"></tbody>
						</table>
					</div>
					<div class="archive-pagination-host" data-role="pagination-bar"></div>
				</div>
			</div>
		`);

		this.render_columns_menu();
	}

	bind_events() {
		const $main = $(this.page.main);

		$main.on("click", ".archive-cards-search-box", (e) => {
			if (!$(e.target).is("input")) {
				$main.find('[data-role="search-input"]').trigger("focus");
			}
		});

		$main.on("input", '[data-role="search-input"]', (e) => {
			const val = $(e.currentTarget).val() || "";
			clearTimeout(this._search_timer);
			this._search_timer = setTimeout(() => {
				this.state.search = val;
				this.state.page = 1;
				this.load_context(true);
			}, 240);
		});

		$main.on("click", ".archive-deposits-date-box", (e) => {
			const input = $main.find('[data-role="deposit-date-input"]')[0];
			if (input && typeof input.showPicker === "function" && e.target !== input) {
				try {
					input.showPicker();
				} catch (_) {
					// native fallback
				}
			}
		});

		$main.on("change", '[data-role="deposit-date-input"]', (e) => {
			const next_date = String($(e.currentTarget).val() || "").trim();
			if (!next_date || next_date === this.state.deposit_date) {
				$(e.currentTarget).val(this.state.deposit_date);
				return;
			}
			this.request_date_change(next_date);
		});

		$main.on("click", '[data-action="prev-day"]', () => {
			const prev_date = shift_iso_date(this.state.deposit_date, -1);
			this.request_date_change(prev_date);
		});

		$main.on("click", '[data-action="next-day"]', () => {
			const next_date = shift_iso_date(this.state.deposit_date, 1);
			this.request_date_change(next_date);
		});

		$main.on("click", '[data-action="go-today"]', () => {
			const target_today = this.state.today || frappe.datetime.get_today();
			if (this.state.deposit_date === target_today && this.dirty_deposits.size === 0) {
				this.load_context(true);
				return;
			}
			this.request_date_change(target_today);
		});

		$main.on("click", "[data-status-card]", (e) => {
			const next_filter = String($(e.currentTarget).attr("data-status-card") || "all");
			if (!["all", "deposited", "not_deposited"].includes(next_filter)) {
				return;
			}
			if (this.state.status_filter === next_filter && next_filter !== "all") {
				this.state.status_filter = "all";
			} else {
				this.state.status_filter = next_filter;
			}
			this.state.page = 1;
			this.render_stats();
			this.load_context(true);
		});

		$main.on("click", '[data-action="toggle-filters"]', () => {
			this.state.filter_drawer_open = !this.state.filter_drawer_open;
			$main.find('[data-role="filter-drawer"]').prop("hidden", !this.state.filter_drawer_open);
		});

		$main.on("change", "[data-filter]", (e) => {
			const key = $(e.currentTarget).attr("data-filter");
			this.state.filters[key] = $(e.currentTarget).val() || "";
			this.state.page = 1;
			this.update_filter_badge();
			this.load_context(true);
		});

		$main.on("click", '[data-action="reset-filters"]', () => {
			this.state.filters = {
				bank: "",
				representative: "",
				region: "",
			};
			this.state.status_filter = "all";
			$main.find("[data-filter]").val("");
			this.state.page = 1;
			this.update_filter_badge();
			this.load_context(true);
		});

		$main.on("click", '[data-action="toggle-columns-menu"]', (e) => {
			e.stopPropagation();
			const $menu = $main.find('[data-role="columns-menu"]');
			$menu.prop("hidden", !$menu.prop("hidden"));
		});

		$main.on("change", "[data-col-toggle]", (e) => {
			const key = $(e.currentTarget).attr("data-col-toggle");
			const visible = $(e.currentTarget).is(":checked");
			if (visible) {
				this.state.hidden_columns.delete(key);
			} else {
				this.state.hidden_columns.add(key);
			}
			this.save_hidden_columns();
			this.render_table();
		});

		$(document).on("click.archive_deposits_cols", (e) => {
			if (!$(e.target).closest(".archive-deposits-dropdown-wrap").length) {
				$main.find('[data-role="columns-menu"]').prop("hidden", true);
			}
		});

		$main.on("click", "th[data-sort-col]", (e) => {
			const col = $(e.currentTarget).attr("data-sort-col");
			if (!col) return;
			if (this.state.sort_by === col) {
				this.state.sort_order = this.state.sort_order === "asc" ? "desc" : "asc";
			} else {
				this.state.sort_by = col;
				this.state.sort_order = "desc";
			}
			this.state.page = 1;
			this.load_context(true);
		});

		// Inline deposit cell editing
		$main.on("focus", ".ad-deposit-input", (e) => {
			if (!this.permissions?.can_save) return;
			const $input = $(e.currentTarget);
			const card_id = String($input.attr("data-card") || "");
			const row = this.rows_by_card.get(card_id);
			if (!row) return;

			if (this.dirty_deposits.has(card_id)) {
				const dirty = this.dirty_deposits.get(card_id);
				$input.val(dirty.raw);
			} else if (Number(row.deposit_amount || 0) > 0) {
				$input.val(String(row.deposit_amount));
			} else if (row.has_saved_record && Number(row.deposit_amount || 0) === 0) {
				$input.val("0");
			} else {
				$input.val("");
			}
			setTimeout(() => {
				try {
					$input[0].select();
				} catch (_) {
					// ignore
				}
			}, 0);
		});

		$main.on("input", ".ad-deposit-input", (e) => {
			if (!this.permissions?.can_save) return;
			const $input = $(e.currentTarget);
			const raw_val = $input.val() || "";
			const card_id = String($input.attr("data-card") || "");
			const norm_trimmed = normalize_western_digits(raw_val).trim();
			if (norm_trimmed.startsWith("-")) {
				this.handle_inline_amount_change(card_id, norm_trimmed, $input, true);
				return;
			}
			const sanitized = sanitize_deposit_input_text(raw_val);
			if (sanitized !== raw_val) {
				$input.val(sanitized);
			}
			this.handle_inline_amount_change(card_id, sanitized, $input, false);
		});

		$main.on("blur", ".ad-deposit-input", (e) => {
			const $input = $(e.currentTarget);
			const card_id = String($input.attr("data-card") || "");
			const row = this.rows_by_card.get(card_id);
			if (!row) return;

			if (this.dirty_deposits.has(card_id)) {
				const dirty = this.dirty_deposits.get(card_id);
				if (dirty.is_negative) {
					$input.val(dirty.raw);
				} else if (dirty.raw === "") {
					$input.val("");
				} else {
					$input.val(format_deposit_number(dirty.amount, false));
				}
			} else if (Number(row.deposit_amount || 0) > 0) {
				$input.val(format_deposit_number(row.deposit_amount, true));
			} else if (row.has_saved_record && Number(row.deposit_amount || 0) === 0) {
				$input.val("0");
			} else {
				$input.val("");
			}
		});

		$main.on("keydown", ".ad-deposit-input", (e) => {
			if (!this.permissions?.can_save) {
				if (e.key !== "Tab") {
					e.preventDefault();
				}
				return;
			}
			if (e.key === "-" || e.key === "+" || e.key === "e" || e.key === "E") {
				e.preventDefault();
				return;
			}
			if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				const $inputs = $main.find(".ad-deposit-input:not(:disabled)");
				const idx = $inputs.index(e.currentTarget);
				if (idx < 0) return;
				const next_idx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
				if (next_idx >= 0 && next_idx < $inputs.length) {
					$inputs.eq(next_idx).trigger("focus");
				} else if (e.key === "Enter") {
					$(e.currentTarget).trigger("blur");
				}
			}
		});

		$main.on("click", '[data-action="save-deposits"]', () => {
			this.save_deposits();
		});

		$main.on("click", '[data-action="refresh-deposits"]', () => {
			this.request_refresh();
		});

		// Warn before leaving browser tab or changing Desk route with unsaved edits
		window.addEventListener("beforeunload", (e) => {
			if (this.dirty_deposits.size > 0) {
				e.preventDefault();
				e.returnValue = "";
			}
		});

		if (frappe.router && typeof frappe.router.on === "function") {
			frappe.router.on("change", () => {
				if (this._suppress_route_guard) return;
				const route = frappe.get_route ? frappe.get_route() : [];
				if (route[0] && route[0] !== "archive-deposits" && this.dirty_deposits.size > 0) {
					const target_route = [...route];
					this._suppress_route_guard = true;
					frappe.set_route("archive-deposits");
					setTimeout(() => {
						this._suppress_route_guard = false;
					}, 50);

					frappe.confirm(
						"لديك تعديلات إيداعات غير محفوظة في هذا اليوم. هل تريد مغادرة الشاشة وتجاهل التعديلات غير المحفوظة؟",
						() => {
							this.dirty_deposits.clear();
							this.update_save_button_state();
							this._suppress_route_guard = true;
							frappe.set_route(target_route);
							setTimeout(() => {
								this._suppress_route_guard = false;
							}, 100);
						}
					);
				}
			});
		}
	}

	request_date_change(next_date) {
		const $main = $(this.page.main);
		if (this.dirty_deposits.size === 0) {
			this.apply_date_change(next_date);
			return;
		}

		// Keep current date displayed until user confirms discarding unsaved edits
		$main.find('[data-role="deposit-date-input"]').val(this.state.deposit_date);
		$main
			.find('[data-role="date-display"]')
			.text(format_display_date_slash(this.state.deposit_date));

		frappe.confirm(
			"توجد مبالغ إيداع معدلة غير محفوظة في التاريخ الحالي. هل تريد الانتقال إلى تاريخ آخر وتجاهل التعديلات غير المحفوظة؟",
			() => {
				this.dirty_deposits.clear();
				this.update_save_button_state();
				this.apply_date_change(next_date);
			}
		);
	}

	apply_date_change(next_date) {
		this.state.deposit_date = next_date;
		this.state.page = 1;
		this.dirty_deposits.clear();
		this.accounts_baseline.clear();
		this.update_save_button_state();
		const $main = $(this.page.main);
		$main.find('[data-role="deposit-date-input"]').val(next_date);
		$main.find('[data-role="date-display"]').text(format_display_date_slash(next_date));
		this.load_context(true);
	}

	compute_account_live_state(account_key, fallback_row = null) {
		const key = String(account_key || fallback_row?.account_key || fallback_row?.card || "");
		let base = this.accounts_baseline.get(key) || null;
		if (!base && fallback_row) {
			base = {
				daily_limit: Number(fallback_row.daily_limit || 0),
				account_saved_total: Number(
					fallback_row.account_saved_total !== undefined
						? fallback_row.account_saved_total
						: fallback_row.deposit_amount || 0
				),
				has_limit_conflict: Boolean(fallback_row.has_limit_conflict),
			};
		}
		if (!base) {
			for (const d of this.dirty_deposits.values()) {
				if (d.account_key === key) {
					base = {
						daily_limit: Number(d.daily_limit || 0),
						account_saved_total: Number(d.account_saved_total || 0),
						has_limit_conflict: Boolean(d.has_limit_conflict),
					};
					break;
				}
			}
		}

		const daily_limit = Math.max(0, Math.round(Number(base?.daily_limit || 0) * 100) / 100);
		const base_saved = Math.max(
			0,
			Math.round(Number(base?.account_saved_total || 0) * 100) / 100
		);
		let delta = 0;
		for (const entry of this.dirty_deposits.values()) {
			if (entry.account_key === key && !entry.is_negative) {
				delta += Number(entry.amount || 0) - Number(entry.saved_amount || 0);
			}
		}

		const effective_total = Math.max(0, Math.round((base_saved + delta) * 100) / 100);
		const remaining = Math.max(0, Math.round((daily_limit - effective_total) * 100) / 100);
		const is_over_limit = Math.round(effective_total * 100) > Math.round(daily_limit * 100);
		return {
			account_key: key,
			daily_limit,
			base_saved,
			effective_total,
			remaining,
			is_over_limit,
			has_limit_conflict: Boolean(base?.has_limit_conflict),
		};
	}

	sync_account_dom_rows(account_key, fallback_row = null) {
		const acct_state = this.compute_account_live_state(account_key, fallback_row);
		const $tbody = $(this.page.main).find('[data-role="table-body"]');
		if (!$tbody.length) return;

		$tbody.find("tr.ad-table-row").each((_, trEl) => {
			const $tr = $(trEl);
			const cid = String($tr.attr("data-card-id") || "");
			const r = this.rows_by_card.get(cid);
			if (!r) return;
			const row_acc_key = String(r.account_key || r.card);
			if (row_acc_key !== acct_state.account_key) return;

			const is_dirty = this.dirty_deposits.has(cid);
			const dirty_entry = is_dirty ? this.dirty_deposits.get(cid) : null;
			const invalid_msg = dirty_entry?.invalid_msg || "";
			const saved_amount = Math.round(Number(r.deposit_amount || 0) * 100) / 100;

			$tr.toggleClass("is-dirty-row", is_dirty).toggleClass(
				"has-deposit-error",
				Boolean(invalid_msg)
			);

			const $inp = $tr.find(".ad-deposit-input");
			if ($inp.length) {
				$inp.toggleClass("is-invalid", Boolean(invalid_msg))
					.toggleClass("is-dirty", is_dirty && !invalid_msg)
					.toggleClass("is-saved-positive", !is_dirty && !invalid_msg && saved_amount > 0)
					.attr("aria-invalid", invalid_msg ? "true" : "false");
			}

			const $err = $tr.find('[data-role="deposit-error"]');
			if ($err.length) {
				$err.text(invalid_msg || DEPOSIT_OVER_LIMIT_MSG).prop("hidden", !invalid_msg);
			}

			const $rem = $tr.find('[data-role="remaining-cell-val"]');
			if ($rem.length) {
				$rem.text(format_deposit_number(acct_state.remaining, false));
				$rem.removeClass("is-over-limit");
			}

			const $dirty_pill = $tr.find('[data-role="unsaved-indicator"]');
			if ($dirty_pill.length) {
				$dirty_pill.prop("hidden", !is_dirty);
			}
		});
	}

	has_invalid_deposits() {
		for (const entry of this.dirty_deposits.values()) {
			if (entry?.invalid_msg) return true;
		}
		return false;
	}

	handle_inline_amount_change(card_id, sanitized_raw, $input, is_negative = false) {
		const row = this.rows_by_card.get(card_id);
		if (!row) return;

		const account_key = String(row.account_key || row.card);
		const daily_limit = Math.max(0, Math.round(Number(row.daily_limit || 0) * 100) / 100);
		const saved_amount = Math.round(Number(row.deposit_amount || 0) * 100) / 100;
		const account_saved_total = Math.round(
			Number(
				row.account_saved_total !== undefined ? row.account_saved_total : saved_amount
			) * 100
		) / 100;
		const has_limit_conflict = Boolean(row.has_limit_conflict);

		if (is_negative) {
			this.dirty_deposits.set(card_id, {
				amount: saved_amount,
				saved_amount,
				account_key,
				daily_limit,
				account_saved_total,
				has_limit_conflict,
				raw: sanitized_raw,
				is_negative: true,
				invalid_msg: DEPOSIT_NEGATIVE_MSG,
			});
		} else {
			const parsed_num =
				sanitized_raw === "" || sanitized_raw === "."
					? 0
					: Math.round(Number(sanitized_raw) * 100) / 100;

			this.dirty_deposits.set(card_id, {
				amount: parsed_num,
				saved_amount,
				account_key,
				daily_limit,
				account_saved_total,
				has_limit_conflict,
				raw: sanitized_raw,
				is_negative: false,
				invalid_msg: "",
			});
		}

		const acct_state = this.compute_account_live_state(account_key, row);

		for (const [cid, entry] of [...this.dirty_deposits.entries()]) {
			if (entry.account_key !== account_key) continue;

			if (entry.is_negative) {
				entry.invalid_msg = DEPOSIT_NEGATIVE_MSG;
				continue;
			}

			if (acct_state.has_limit_conflict) {
				entry.invalid_msg =
					"يوجد تعارض مسبق في الحد اليومي لنسخ هذا الحساب؛ يرجى توحيده من شاشة البطاقات أولاً";
				continue;
			}

			if (
				acct_state.is_over_limit &&
				(cid === card_id ||
					entry.amount > entry.saved_amount ||
					Math.round(entry.amount * 100) > Math.round(acct_state.daily_limit * 100))
			) {
				entry.invalid_msg = DEPOSIT_OVER_LIMIT_MSG;
				continue;
			}

			entry.invalid_msg = "";
			if (
				Math.abs(entry.amount - entry.saved_amount) < 0.0001 &&
				(entry.saved_amount > 0 ? entry.raw !== "" : true)
			) {
				this.dirty_deposits.delete(cid);
			}
		}

		this.sync_account_dom_rows(account_key, row);
		this.update_save_button_state();
	}

	update_save_button_state() {
		const $main = $(this.page.main);
		const can_save = Boolean(this.permissions?.can_save);
		const dirty_count = this.dirty_deposits.size;
		const has_invalid = this.has_invalid_deposits();

		const $btn = $main.find('[data-action="save-deposits"]');
		$btn.prop("hidden", false);
		$btn.prop("disabled", !can_save || this.is_saving || this.is_refreshing || has_invalid);
		$btn.toggleClass("has-dirty-changes", can_save && dirty_count > 0 && !has_invalid);
		$btn.toggleClass("is-read-only-date", !can_save);
		$btn.attr(
			"title",
			!can_save ? "التاريخ المختار متاح للعرض فقط حسب صلاحياتك" : ""
		);

		const $badge = $main.find('[data-role="dirty-count"]');
		if (can_save && dirty_count > 0) {
			$badge.text(dirty_count).prop("hidden", false);
		} else {
			$badge.prop("hidden", true);
		}
	}

	update_refresh_button_state() {
		const $btn = $(this.page.main).find('[data-action="refresh-deposits"]');
		const busy = Boolean(this.is_refreshing || this.is_saving);
		$btn.prop("disabled", busy);
		$btn.toggleClass("is-refreshing", Boolean(this.is_refreshing));
		$btn.attr("aria-busy", this.is_refreshing ? "true" : "false");
	}

	request_refresh() {
		if (this.is_refreshing || this.is_loading || this.is_saving) {
			return;
		}
		if (this.dirty_deposits.size === 0) {
			this.perform_refresh();
			return;
		}

		frappe.confirm(
			"توجد مبالغ إيداع معدلة غير محفوظة في التاريخ الحالي. هل تريد تحديث البيانات وتجاهل التعديلات غير المحفوظة؟",
			() => {
				this.dirty_deposits.clear();
				this.accounts_baseline.clear();
				this.update_save_button_state();
				this.perform_refresh();
			}
		);
	}

	async perform_refresh() {
		if (this.is_refreshing || this.is_saving) {
			return;
		}
		this.is_refreshing = true;
		this.update_refresh_button_state();
		this.update_save_button_state();
		try {
			this.accounts_baseline.clear();
			await this.load_context(false);
		} finally {
			this.is_refreshing = false;
			this.update_refresh_button_state();
			this.update_save_button_state();
		}
	}

	update_filter_badge() {
		const count = Object.values(this.state.filters).filter((v) => Boolean(v)).length;
		const $badge = $(this.page.main).find('[data-role="filter-count"]');
		if (count > 0) {
			$badge.text(count).prop("hidden", false);
		} else {
			$badge.prop("hidden", true);
		}
	}

	async load_context(preserve_masters = true) {
		const seq = ++this._load_seq;
		this.is_loading = true;
		try {
			const res = await frappe.call({
				method: "archive.api.deposits.get_deposits_context",
				type: "GET",
				args: {
					deposit_date: this.state.deposit_date,
					status_filter: this.state.status_filter === "all" ? "" : this.state.status_filter,
					search: this.state.search,
					bank: this.state.filters.bank,
					representative: this.state.filters.representative,
					region: this.state.filters.region,
					page: this.state.page,
					page_size: this.state.page_size,
					sort_by: this.state.sort_by,
					sort_order: this.state.sort_order,
				},
			});

			if (seq !== this._load_seq) return;
			const data = res?.message || {};

			this.state.deposit_date = data.deposit_date || this.state.deposit_date;
			this.state.today = data.today || this.state.today;
			this.rows = data.rows || [];
			this.rows_by_card.clear();
			if (this.dirty_deposits.size === 0) {
				this.accounts_baseline.clear();
			}
			for (const r of this.rows) {
				this.rows_by_card.set(r.card, r);
				const acc_key = String(r.account_key || r.card);
				this.accounts_baseline.set(acc_key, {
					daily_limit: Number(r.daily_limit || 0),
					account_saved_total: Number(
						r.account_saved_total !== undefined
							? r.account_saved_total
							: r.deposit_amount || 0
					),
					has_limit_conflict: Boolean(r.has_limit_conflict),
				});
			}

			this.stats = data.stats || this.stats;
			this.pagination = data.pagination || this.pagination;
			if (this.pagination?.page) {
				this.state.page = Number(this.pagination.page) || 1;
			}
			this.permissions = data.permissions || this.permissions;
			if (!this.permissions?.can_save && this.dirty_deposits.size > 0) {
				this.dirty_deposits.clear();
			}

			if (!preserve_masters || !this.masters.banks?.length) {
				this.masters = data.masters || this.masters;
				this.populate_master_filters();
			}

			if (frappe.boot) {
				frappe.boot.archive_can_access_deposits = true;
			}
			window.sync_archive_deposits_sidebar_visibility?.();

			const $main = $(this.page.main);
			$main.find(".archive-deposits-date-bar, [data-role='stats-bar'], .archive-deposits-toolbar, [data-role='table-head'], [data-role='pagination-bar']").prop("hidden", false);
			$main.find('[data-role="deposit-date-input"]').val(this.state.deposit_date);
			$main
				.find('[data-role="date-display"]')
				.text(format_display_date_slash(this.state.deposit_date));

			this.render_stats();
			this.render_table();
			this.render_pagination();
			this.update_save_button_state();
			this.update_refresh_button_state();
		} catch (err) {
			const is_perm_err =
				err?.exc_type === "PermissionError" ||
				err?.status === 403 ||
				err?.xhr?.status === 403 ||
				frappe?.boot?.archive_can_access_deposits === false;
			if (is_perm_err || !this.rows.length) {
				this.render_permission_or_error(err);
			}
		} finally {
			if (seq === this._load_seq) {
				this.is_loading = false;
			}
		}
	}

	async save_deposits() {
		if (!this.permissions?.can_save || this.is_saving || this.is_refreshing) {
			return;
		}
		if (this.dirty_deposits.size === 0) {
			frappe.show_alert({
				message: "لا توجد تعديلات جديدة لحفظها.",
				indicator: "blue",
			});
			return;
		}
		if (this.has_invalid_deposits()) {
			const first_err =
				[...this.dirty_deposits.values()].find((e) => e?.invalid_msg)?.invalid_msg ||
				DEPOSIT_OVER_LIMIT_MSG;
			frappe.show_alert({
				message: first_err,
				indicator: "red",
			});
			return;
		}

		const payload_items = [];
		for (const [card, entry] of this.dirty_deposits.entries()) {
			payload_items.push({
				card,
				amount: entry.amount,
			});
		}

		this.is_saving = true;
		this.update_save_button_state();
		this.update_refresh_button_state();

		try {
			const res = await frappe.call({
				method: "archive.api.deposits.save_daily_deposits",
				type: "POST",
				args: {
					deposit_date: this.state.deposit_date,
					items: payload_items,
				},
			});

			const out = res?.message || {};
			this.dirty_deposits.clear();
			this.accounts_baseline.clear();

			frappe.show_alert({
				message:
					out.saved_count > 0
						? `تم حفظ إيداعات اليوم (${out.saved_count} بطاقة) بنجاح.`
						: "تم تحديث حالة الإيداعات بنجاح.",
				indicator: "green",
			});

			await this.load_context(true);
		} catch (err) {
			if (
				err?.exc_type === "PermissionError" ||
				err?.status === 403 ||
				err?.xhr?.status === 403
			) {
				this.dirty_deposits.clear();
				await this.load_context(true);
			}
		} finally {
			this.is_saving = false;
			this.update_save_button_state();
			this.update_refresh_button_state();
		}
	}

	render_permission_or_error(err) {
		const is_perm_err =
			err?.exc_type === "PermissionError" ||
			err?.status === 403 ||
			err?.xhr?.status === 403 ||
			frappe?.boot?.archive_can_access_deposits === false;

		this.rows = [];
		this.rows_by_card.clear();
		this.dirty_deposits.clear();
		this.permissions = { can_view: false, can_save: false };

		const $main = $(this.page.main);
		if (is_perm_err) {
			if (frappe.boot) {
				frappe.boot.archive_can_access_deposits = false;
			}
			window.sync_archive_deposits_sidebar_visibility?.();
			$main
				.find(
					".archive-deposits-date-bar, [data-role='stats-bar'], .archive-deposits-toolbar, [data-role='filter-drawer'], [data-role='table-head'], [data-role='pagination-bar']"
				)
				.prop("hidden", true);
		}

		const $tbody = $main.find('[data-role="table-body"]');
		const msg = is_perm_err
			? "ليست لديك صلاحية الوصول إلى شاشة الإيداعات."
			: err?.message || "تعذر جلب بيانات شاشة الإيداعات.";
		$tbody.html(`
					<tr>
						<td colspan="8">
							<div class="ac-table-empty-state">
								${DEPOSIT_SVGS.lock}
								<span>${frappe.utils.escape_html(msg)}</span>
							</div>
						</td>
					</tr>
		`);
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
	}

	render_stats() {
		const s = this.stats || {};
		const cur_filter = this.state.status_filter || "all";

		const cards = [
			{
				id: "all",
				clickable: true,
				active: cur_filter === "all",
				label: "كل الإيداعات",
				sub: "إجمالي البطاقات النشطة في اليوم",
				value: format_deposit_number(s.total_cards || 0, false),
				tone: "violet",
				icon: DEPOSIT_SVGS.stat_all,
			},
			{
				id: "deposited",
				clickable: true,
				active: cur_filter === "deposited",
				label: "المودعين",
				sub: "عدد البطاقات التي تم الإيداع لها",
				value: format_deposit_number(s.deposited_count || 0, false),
				tone: "blue",
				icon: DEPOSIT_SVGS.stat_deposited,
			},
			{
				id: "not_deposited",
				clickable: true,
				active: cur_filter === "not_deposited",
				label: "لم يودعوا",
				sub: "بطاقات لم يتم الإيداع لها حتى الآن",
				value: format_deposit_number(s.not_deposited_count || 0, false),
				tone: "red",
				icon: DEPOSIT_SVGS.stat_not_deposited,
			},
			{
				id: "total_deposited",
				clickable: false,
				active: false,
				label: "إجمالي المبلغ المودع",
				sub: "إجمالي ما تم إيداعه اليوم",
				value: s.total_deposited_amount_formatted ?? format_deposit_number(s.total_deposited_amount || 0, false),
				tone: "green",
				icon: DEPOSIT_SVGS.stat_amount,
			},
			{
				id: "daily_target",
				clickable: false,
				active: false,
				label: "إجمالي الهدف اليومي",
				sub: "مجموع الحدود اليومية للبطاقات النشطة",
				value: s.total_daily_target_formatted ?? format_deposit_number(s.total_daily_target || 0, false),
				tone: "violet",
				icon: DEPOSIT_SVGS.stat_target,
			},
		];

		const html = cards
			.map((c) => {
				const tag = c.clickable ? "button" : "div";
				const attrs = c.clickable
					? `type="button" data-status-card="${c.id}"`
					: `aria-label="${frappe.utils.escape_html(c.label)}"`;
				return `
					<${tag}
						class="ad-stat-card tone-${c.tone} ${c.clickable ? "is-clickable" : ""} ${
					c.active ? "is-active" : ""
				}"
						${attrs}
					>
						<div class="ad-stat-top">
							<span class="ad-stat-icon" aria-hidden="true">${c.icon}</span>
							<span class="ad-stat-label">${frappe.utils.escape_html(c.label)}</span>
						</div>
						<div class="ad-stat-value" dir="ltr">${frappe.utils.escape_html(String(c.value))}</div>
						<div class="ad-stat-sub">${frappe.utils.escape_html(c.sub)}</div>
					</${tag}>
				`;
			})
			.join("");

		$(this.page.main).find('[data-role="stats-bar"]').html(html);
	}

	render_columns_menu() {
		const html = ARCHIVE_DEPOSITS_COLUMNS.map((col) => {
			const checked = !this.state.hidden_columns.has(col.key);
			return `
				<label class="ad-col-menu-item ${col.locked ? "is-locked" : ""}">
					<input
						type="checkbox"
						data-col-toggle="${col.key}"
						${checked ? "checked" : ""}
						${col.locked ? "disabled" : ""}
					/>
					<span>${frappe.utils.escape_html(col.label)}</span>
				</label>
			`;
		}).join("");

		$(this.page.main).find('[data-role="columns-menu"]').html(html);
	}

	get_visible_columns() {
		return ARCHIVE_DEPOSITS_COLUMNS.filter((c) => !this.state.hidden_columns.has(c.key));
	}

	build_audit_tooltip(row) {
		const a = row.audit;
		if (!a || !a.recorded_by) {
			return "";
		}
		const lines = [];
		lines.push(`تم التسجيل بواسطة: ${a.recorded_by_name || a.recorded_by}`);
		if (a.recorded_at) {
			lines.push(`وقت التسجيل: ${a.recorded_at}`);
		}
		if (
			a.last_modified_by &&
			(a.history_count > 1 || a.last_modified_at !== a.recorded_at)
		) {
			lines.push(`آخر تعديل بواسطة: ${a.last_modified_by_name || a.last_modified_by}`);
			if (a.last_modified_at) {
				lines.push(`وقت آخر تعديل: ${a.last_modified_at}`);
			}
			if (a.previous_amount !== null && a.previous_amount !== undefined) {
				lines.push(`المبلغ السابق: ${format_deposit_number(a.previous_amount, false)}`);
			}
		}
		return lines.join("\n");
	}

	render_table() {
		const visible_cols = this.get_visible_columns();
		const $head = $(this.page.main).find('[data-role="table-head"]');
		const $tbody = $(this.page.main).find('[data-role="table-body"]');

		const head_cells = visible_cols
			.map((col) => {
				const is_sorted = this.state.sort_by === col.key;
				const arrow = is_sorted
					? this.state.sort_order === "asc"
						? "▲"
						: "▼"
					: "";
				return `
					<th
						class="ac-th ${col.sortable ? "is-sortable" : ""}"
						style="width: ${col.width}"
						${col.sortable ? `data-sort-col="${col.key}"` : ""}
					>
						<span>${frappe.utils.escape_html(col.label)}</span>
						${arrow ? `<span class="ac-sort-indicator">${arrow}</span>` : ""}
					</th>
				`;
			})
			.join("");

		$head.html(`<tr>${head_cells}</tr>`);

		if (!this.rows.length) {
			$tbody.html(`
				<tr>
					<td colspan="${visible_cols.length}">
						<div class="ac-table-empty-state">
							${DEPOSIT_SVGS.stat_all}
							<span>لا توجد بطاقات مطابقة لمعايير البحث أو الفلترة في هذا اليوم.</span>
						</div>
					</td>
				</tr>
			`);
			return;
		}

		const html = this.rows
			.map((row) => {
				const is_dirty = this.dirty_deposits.has(row.card);
				const dirty_entry = is_dirty ? this.dirty_deposits.get(row.card) : null;
				const has_error = Boolean(dirty_entry?.invalid_msg);
				const cells = visible_cols
					.map((col) => this.render_table_cell(row, col.key))
					.join("");
				return `
					<tr
						class="ad-table-row ${is_dirty ? "is-dirty-row" : ""} ${has_error ? "has-deposit-error" : ""}"
						data-card-id="${frappe.utils.escape_html(row.card)}"
						data-account-key="${frappe.utils.escape_html(String(row.account_key || row.card))}"
					>
						${cells}
					</tr>
				`;
			})
			.join("");

		$tbody.html(html);
	}

	render_table_cell(row, key) {
		const is_dirty = this.dirty_deposits.has(row.card);
		const dirty_entry = is_dirty ? this.dirty_deposits.get(row.card) : null;
		const invalid_msg = dirty_entry?.invalid_msg || "";
		const saved_amount = Number(row.deposit_amount || 0);
		const acct_state = this.compute_account_live_state(
			String(row.account_key || row.card),
			row
		);
		const remaining = acct_state.remaining;
		const can_save = Boolean(this.permissions?.can_save);

		if (key === "card_name") {
			const inactive_tag = row.is_historical_inactive
				? `<span class="ad-historical-tag" title="بطاقة موقفة حالياً — سجل إيداع تاريخي محفوظ">${frappe.utils.escape_html(
						row.card_status
				  )}</span>`
				: "";
			return `
				<td class="ac-td-name" title="${frappe.utils.escape_html(row.card_name)}">
					<span class="ad-card-title-text">${frappe.utils.escape_html(row.card_name)}</span>
					${inactive_tag}
				</td>
			`;
		}

		if (key === "card_number") {
			return `<td class="ac-td-ltr" dir="ltr">${frappe.utils.escape_html(row.card_number || "—")}</td>`;
		}

		if (key === "bank") {
			const b_name = row.bank_name || row.bank || "—";
			const tone_idx = get_bank_tone_index(b_name);
			return `
				<td>
					<div class="ad-bank-cell">
						<span class="ad-bank-icon tone-${tone_idx}" aria-hidden="true">${DEPOSIT_SVGS.bank_badge}</span>
						<span class="ad-bank-name">${frappe.utils.escape_html(b_name)}</span>
					</div>
				</td>
			`;
		}

		if (key === "representative") {
			return `<td>${frappe.utils.escape_html(row.representative_name || row.representative || "—")}</td>`;
		}

		if (key === "region") {
			return `<td>${frappe.utils.escape_html(row.region_name || row.region || "—")}</td>`;
		}

		if (key === "deposit_amount") {
			let display_val = "";
			if (is_dirty) {
				if (dirty_entry.is_negative) {
					display_val = dirty_entry.raw;
				} else {
					display_val =
						dirty_entry.raw === "" ? "" : format_deposit_number(dirty_entry.amount, false);
				}
			} else if (saved_amount > 0) {
				display_val = format_deposit_number(saved_amount, true);
			} else if (row.has_saved_record && saved_amount === 0) {
				display_val = "0";
			}

			const audit_tip = this.build_audit_tooltip(row);
			const audit_badge = audit_tip
				? `<span class="ad-audit-info" title="${frappe.utils.escape_html(audit_tip)}" aria-label="سجل الإيداع">${DEPOSIT_SVGS.info_circle}</span>`
				: "";

			return `
				<td class="ad-td-deposit">
					<div class="ad-deposit-field-stack">
						<div class="ad-deposit-cell-wrap">
							<input
								type="text"
								inputmode="decimal"
								autocomplete="off"
								dir="ltr"
								class="ad-deposit-input ${
									invalid_msg ? "is-invalid" : is_dirty ? "is-dirty" : ""
								} ${!is_dirty && !invalid_msg && saved_amount > 0 ? "is-saved-positive" : ""}"
								aria-invalid="${invalid_msg ? "true" : "false"}"
								data-card="${frappe.utils.escape_html(row.card)}"
								value="${frappe.utils.escape_html(display_val)}"
								placeholder=""
								${!can_save ? "disabled readonly" : ""}
								${audit_tip ? `title="${frappe.utils.escape_html(audit_tip)}"` : ""}
							/>
							${audit_badge}
						</div>
						<div class="ad-deposit-error" data-role="deposit-error" role="alert" ${
							invalid_msg ? "" : "hidden"
						}>${frappe.utils.escape_html(invalid_msg || DEPOSIT_OVER_LIMIT_MSG)}</div>
					</div>
				</td>
			`;
		}

		if (key === "remaining_limit") {
			return `
				<td class="ac-td-ltr ad-td-remaining" dir="ltr" title="الحد اليومي: ${frappe.utils.escape_html(
					row.daily_limit_formatted || "0"
				)}">
					<span class="ad-remaining-val ${
						remaining < 0 ? "is-over-limit" : ""
					}" data-role="remaining-cell-val">${frappe.utils.escape_html(
				format_deposit_number(remaining, false)
			)}</span>
				</td>
			`;
		}

		if (key === "status") {
			const is_deposited = row.status === "deposited";
			return `
				<td class="ad-td-status">
					<div class="ad-status-wrap">
						<span class="ad-status-pill ${is_deposited ? "is-deposited" : "is-not-deposited"}">
							<span class="ad-status-pill-icon" aria-hidden="true">
								${is_deposited ? DEPOSIT_SVGS.status_check : DEPOSIT_SVGS.status_cross}
							</span>
							<span>${is_deposited ? "تم الإيداع" : "لم يتم الإيداع"}</span>
						</span>
						<span
							class="ad-unsaved-dot"
							data-role="unsaved-indicator"
							title="تعديل غير محفوظ — اضغط حفظ الإيداعات لاعتماده"
							${is_dirty ? "" : "hidden"}
						>غير محفوظ</span>
					</div>
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
}
