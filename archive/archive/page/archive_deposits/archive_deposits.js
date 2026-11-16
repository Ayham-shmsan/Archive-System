frappe.pages["archive-deposits"].on_page_load = function (wrapper) {
	frappe.archive_deposits = new ArchiveDepositsPage(wrapper);
};

frappe.pages["archive-deposits"].on_page_show = function () {
	if (frappe.archive_deposits && frappe.archive_deposits._initialized) {
		frappe.archive_deposits.prepare_screen_entry_animation?.();
		frappe.archive_deposits.load_context(true);
	}
};

const DEPOSIT_OVER_LIMIT_MSG = "مبلغ الإيداع لا يمكن أن يتجاوز الحد اليومي للبطاقة";
const DEPOSIT_NEGATIVE_MSG = "لا يُسمح بإدخال مبلغ إيداع سالب";

const ARCHIVE_DEPOSITS_COLUMNS = [
	{ key: "serial_no", label: "م", width: "4.5%", pct: 4.5, min_px: 52, locked: true, sortable: true },
	{ key: "card_name", label: "اسم البطاقة", width: "13%", pct: 13, min_px: 148, locked: true, sortable: true },
	{ key: "deposit_date", label: "تاريخ الإيداع", width: "9%", pct: 9, min_px: 110, locked: false, sortable: true, period_only: true },
	{ key: "card_number", label: "رقم البطاقة", width: "9.5%", pct: 9.5, min_px: 118, locked: false, sortable: true },
	{ key: "bank", label: "البنك", width: "11%", pct: 11, min_px: 116, locked: false, sortable: true },
	{ key: "representative", label: "المندوب", width: "8.5%", pct: 8.5, min_px: 108, locked: false, sortable: true },
	{ key: "region", label: "المنطقة", width: "7.5%", pct: 7.5, min_px: 90, locked: false, sortable: true },
	{ key: "card_owner", label: "مالك البطاقة", width: "9.5%", pct: 9.5, min_px: 112, locked: false, sortable: true },
	{ key: "deposit_amount", label: "مبلغ الإيداع", width: "12.5%", pct: 12.5, min_px: 154, locked: true, sortable: true },
	{ key: "remaining_limit", label: "مبلغ الحد المتبقي", width: "6.5%", pct: 6.5, min_px: 92, locked: false, sortable: true },
	{ key: "stopped_for_reason", label: "موقف لسبب", width: "6.5%", pct: 6.5, min_px: 84, locked: false, sortable: true },
	{ key: "status", label: "الحالة", width: "9%", pct: 9, min_px: 132, locked: true, sortable: true },
	{ key: "approval", label: "الاعتماد", width: "8%", pct: 8, min_px: 120, locked: true, sortable: true },
];

const ARABIC_MONTHS = [
	{ value: 1, label: "01 — يناير" },
	{ value: 2, label: "02 — فبراير" },
	{ value: 3, label: "03 — مارس" },
	{ value: 4, label: "04 — أبريل" },
	{ value: 5, label: "05 — مايو" },
	{ value: 6, label: "06 — يونيو" },
	{ value: 7, label: "07 — يوليو" },
	{ value: 8, label: "08 — أغسطس" },
	{ value: 9, label: "09 — سبتمبر" },
	{ value: 10, label: "10 — أكتوبر" },
	{ value: 11, label: "11 — نوفمبر" },
	{ value: 12, label: "12 — ديسمبر" },
];

const DEPOSIT_SVGS = {
	header_coins: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v4c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 9v5c0 1.66 3.58 3 8 3s8-1.34 8-3V9"/><path d="M4 14v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5"/></svg>`,
	calendar: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
	info_circle: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
	search: `<svg class="archive-cards-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`,
	chevron_down: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
	chevron_right: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
	chevron_left: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
	undo: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
	lock: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
	stat_all: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>`,
	stat_deposited: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
	stat_not_deposited: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>`,
	stat_stopped_reason: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="9" y1="10" x2="9" y2="14"/><line x1="15" y1="10" x2="15" y2="14"/></svg>`,
	stat_amount: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
	stat_target: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
	save_disk: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
	refresh: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
	filter_funnel: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
	columns_grid: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
	status_check: `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
	status_cross: `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
	status_pause: `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`,
	bank_badge: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
};

function make_row_key(card, deposit_date) {
	return `${String(card || "").trim()}::${String(deposit_date || "").trim()}`;
}

function make_account_day_key(account_key, deposit_date) {
	return `${String(deposit_date || "").trim()}::${String(account_key || "").trim()}`;
}

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
		const initial_year = Number(initial_today.slice(0, 4)) || new Date().getFullYear();
		const initial_month = Number(initial_today.slice(5, 7)) || new Date().getMonth() + 1;

		this.state = {
			period_mode: "day",
			deposit_date: initial_today,
			period_month: initial_month,
			period_year: initial_year,
			date_from: `${initial_year}-${String(initial_month).padStart(2, "0")}-01`,
			date_to: initial_today,
			fiscal_year: null,
			today: initial_today,
			status_filter: "all",
			search: "",
			filters: {
				bank: "",
				representative: "",
				region: "",
				card_owner: "",
			},
			page: 1,
			page_size: 50,
			sort_by: "serial_no",
			sort_order: "desc",
			filter_drawer_open: false,
			hidden_columns: this.read_hidden_columns(),
		};

		this.rows = [];
		this.rows_by_key = new Map();
		this.rows_by_card = new Map();
		this.accounts_baseline = new Map();
		this.dirty_deposits = new Map();
		this.stats = {
			total_cards: 0,
			deposited_count: 0,
			not_deposited_count: 0,
			stopped_for_reason_count: 0,
			total_deposited_amount: 0,
			total_deposited_amount_formatted: "0",
			total_daily_target: 0,
			total_daily_target_formatted: "0",
			target_is_frozen: false,
		};
		this.pagination = { page: 1, page_size: 50, total_count: 0, total_pages: 1 };
		this.masters = { banks: [], representatives: [], regions: [], card_owners: [] };
		this.permissions = {
			can_view: false,
			can_save: false,
			can_edit_amount: false,
			can_toggle_stopped_reason: false,
			can_approve: false,
			has_approve_role: false,
			has_stopped_reason_role: false,
		};
		this.fiscal_context = null;
		this.fiscal_year_is_closed = false;

		this._search_timer = null;
		this._load_seq = 0;
		this._table_render_token = 0;
		this.is_loading = false;
		this.is_refreshing = false;
		this.is_saving = false;
		this.approving_keys = new Set();
		this._suppress_route_guard = false;
		this._pending_entry_stats_anim = true;
		this._fin_stats_anim = {
			timer_id: null,
			raf_ids: { deposited: null, target: null, percent: null },
			last_deposited: null,
			last_target: null,
			last_percent: null,
			last_frozen: null,
		};

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
		const [, fiscal_res] = await Promise.all([
			new Promise((resolve) => {
				frappe.require(
					[
						"/assets/archive/js/shared/data_grid/core.js",
						"/assets/archive/js/shared/data_grid/pagination.js",
						"/assets/archive/css/shared/data_grid.css",
					],
					resolve
				);
			}),
			frappe
				.call({
					method: "archive.services.fiscal_year_permissions.get_my_fiscal_context",
					type: "GET",
				})
				.catch(() => null),
		]);

		if (fiscal_res && fiscal_res.message) {
			this.fiscal_context = fiscal_res.message;
			const allowed = Array.isArray(this.fiscal_context.allowed_view_years)
				? this.fiscal_context.allowed_view_years
				: [];
			const default_fy = String(
				this.fiscal_context.default_view_fiscal_year || allowed[0] || ""
			);
			if (!this.state.fiscal_year && default_fy) {
				this.state.fiscal_year = default_fy;
				this.state.period_year = Number(default_fy) || this.state.period_year;
				if (!String(this.state.deposit_date || "").startsWith(`${default_fy}-`)) {
					this.state.deposit_date = "";
				}
			}
			this.render_fiscal_year_filter();
			this.render_period_controls();
		}

		this.mount_pagination();
		this.bind_events();
		this._initialized = true;
		await this.load_context(false);
	}

	render_shell() {
		const month_options_html = ARABIC_MONTHS.map(
			(m) =>
				`<option value="${m.value}" ${
					m.value === this.state.period_month ? "selected" : ""
				}>${frappe.utils.escape_html(m.label)}</option>`
		).join("");

		$(this.page.main).html(`
			<div class="archive-deposits-shell" dir="rtl">
				<div class="archive-deposits-header">
					<div class="archive-deposits-brand">
						<span class="archive-deposits-brand-icon" aria-hidden="true">
							${DEPOSIT_SVGS.header_coins}
						</span>
						<div class="archive-deposits-brand-text">
							<h1>الإيداعات</h1>
							<span class="archive-deposits-subtitle">متابعة الإيداعات اليومية والفترات الزمنية للبطاقات النشطة</span>
						</div>
					</div>

					<div class="archive-deposits-date-bar">
						<div class="archive-deposits-date-controls">
							<div class="ad-period-mode-wrap">
								<select
									class="form-control input-xs ad-period-mode-select"
									data-role="period-mode-select"
									aria-label="نطاق الفترة الزمنية"
								>
									<option value="day" selected>خلال يوم</option>
									<option value="month">خلال شهر</option>
									<option value="year">خلال عام</option>
									<option value="range">خلال فترة</option>
								</select>
							</div>

							<div class="ad-period-day-group" data-role="period-day-group">
								<button
									type="button"
									class="archive-deposits-day-step"
									data-action="prev-day"
									title="اليوم السابق"
									aria-label="اليوم السابق"
								>
									${DEPOSIT_SVGS.chevron_right}
								</button>

								<div
									class="archive-deposits-date-box"
									role="button"
									tabindex="0"
									title="اختر تاريخ الإيداعات"
								>
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
										tabindex="-1"
										aria-hidden="true"
										value="${frappe.utils.escape_html(this.state.deposit_date)}"
									/>
								</div>

								<button
									type="button"
									class="archive-deposits-day-step"
									data-action="next-day"
									title="اليوم التالي"
									aria-label="اليوم التالي"
								>
									${DEPOSIT_SVGS.chevron_left}
								</button>
							</div>

							<div class="ad-period-month-group" data-role="period-month-group" hidden>
								<label class="ad-period-inline-label">الشهر</label>
								<select class="form-control input-xs ad-period-month-select" data-role="period-month-select">
									${month_options_html}
								</select>
							</div>

							<div class="ad-period-year-group" data-role="period-year-group" hidden>
								<label class="ad-period-inline-label">السنة</label>
								<select class="form-control input-xs ad-period-year-select" data-role="period-year-select">
								</select>
							</div>

							<div class="ad-period-range-group" data-role="period-range-group" hidden>
								<div class="ad-period-range-item">
									<label class="ad-period-inline-label">من تاريخ</label>
									<input
										type="date"
										class="form-control input-xs ad-period-date-input"
										data-role="date-from-input"
										dir="ltr"
										value="${frappe.utils.escape_html(this.state.date_from)}"
									/>
								</div>
								<div class="ad-period-range-item">
									<label class="ad-period-inline-label">إلى تاريخ</label>
									<input
										type="date"
										class="form-control input-xs ad-period-date-input"
										data-role="date-to-input"
										dir="ltr"
										value="${frappe.utils.escape_html(this.state.date_to)}"
									/>
								</div>
							</div>

							<div class="archive-fiscal-year-filter-wrap ad-period-year-group" data-role="fiscal-year-wrap">
								<label class="ad-period-inline-label archive-fiscal-year-label">السنة</label>
								<select class="form-control input-xs ad-period-year-select archive-fiscal-year-select" data-role="fiscal-year-select">
								</select>
							</div>
						</div>
					</div>
				</div>

				<div class="archive-deposits-stats" data-role="stats-bar"></div>

				<div class="archive-deposits-toolbar">
					<div class="archive-deposits-toolbar-right archive-cards-search-group">
						<div class="archive-cards-search-box">
							${DEPOSIT_SVGS.search}
							<input
								type="text"
								class="archive-cards-search-input"
								data-role="search-input"
								dir="rtl"
								placeholder="البحث في الإيداعات..."
								autocomplete="off"
								spellcheck="false"
								aria-label="البحث في الإيداعات"
							/>
						</div>

						<button
							type="button"
							class="btn btn-default archive-deposits-tool-btn ac-tb-btn ac-tb-btn--default"
							data-action="toggle-filters"
						>
							<span class="ac-tb-icon" aria-hidden="true">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
									<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
								</svg>
							</span>
							<span class="ac-tb-label">الفلاتر</span>
							<span class="archive-deposits-filter-badge" data-role="filter-count" hidden>0</span>
						</button>

						<div class="archive-deposits-dropdown-wrap">
							<button
								type="button"
								class="btn btn-default archive-deposits-tool-btn ac-tb-btn ac-tb-btn--default"
								data-action="toggle-columns-menu"
							>
								<span class="ac-tb-icon" aria-hidden="true">
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
										<rect x="3" y="3" width="18" height="18" rx="2.5"></rect>
										<line x1="9" y1="3" x2="9" y2="21"></line>
										<line x1="15" y1="3" x2="15" y2="21"></line>
									</svg>
								</span>
								<span class="ac-tb-label">الأعمدة</span>
							</button>
							<div class="archive-deposits-columns-menu" data-role="columns-menu" hidden></div>
						</div>
					</div>

					<div class="archive-deposits-toolbar-left">
						<button
							type="button"
							class="btn archive-deposits-save-btn ac-tb-btn"
							data-action="save-deposits"
						>
							<span class="ac-tb-icon" aria-hidden="true">${DEPOSIT_SVGS.save_disk}</span>
							<span class="ac-tb-label">حفظ الإيداعات</span>
							<span class="archive-deposits-dirty-badge" data-role="dirty-count" hidden>0</span>
						</button>

						<span class="ac-tb-divider" aria-hidden="true"></span>

						<button
							type="button"
							class="btn btn-default archive-deposits-tool-btn archive-deposits-refresh-btn ac-tb-btn ac-tb-btn--refresh"
							data-action="refresh-deposits"
						>
							<span class="ac-tb-icon ad-refresh-icon" aria-hidden="true">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round">
									<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
									<path d="M3 3v5h5"></path>
									<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
									<path d="M16 16h5v5"></path>
								</svg>
							</span>
							<span class="ac-tb-label">تحديث</span>
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
						<div class="ad-filter-field">
							<label>مالك البطاقة</label>
							<select class="form-control" data-filter="card_owner">
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
		this.render_period_controls();
	}

	render_period_controls() {
		const $main = $(this.page.main);
		if (!$main.length) return;

		const mode = this.state.period_mode || "day";
		$main.find('[data-role="period-mode-select"]').val(mode);

		const is_day = mode === "day";
		const is_month = mode === "month";
		const is_year = mode === "year";
		const is_range = mode === "range";

		$main.find('[data-role="period-day-group"]').prop("hidden", !is_day);
		$main.find('[data-role="period-month-group"]').prop("hidden", !is_month);
		$main.find('[data-role="period-year-group"]').prop("hidden", !(is_month || is_year));
		$main.find('[data-role="period-range-group"]').prop("hidden", !is_range);
		$main.find('[data-role="fiscal-year-wrap"]').prop("hidden", !is_day);

		const $year_sel = $main.find('[data-role="period-year-select"]');
		if ($year_sel.length) {
			const ctx = this.fiscal_context || {};
			const allowed = Array.isArray(ctx.allowed_view_years) && ctx.allowed_view_years.length
				? ctx.allowed_view_years
				: [String(this.state.period_year || new Date().getFullYear())];
			const cur_yr = String(this.state.period_year || allowed[0]);
			$year_sel.html(
				allowed
					.map((yr) => {
						const meta = (ctx.years || []).find((item) => item.year_name === yr);
						const closed_suffix = meta && Number(meta.is_closed) === 1 ? " (مغلقة)" : "";
						return `<option value="${frappe.utils.escape_html(yr)}" ${
							String(yr) === cur_yr ? "selected" : ""
						}>${frappe.utils.escape_html(`${yr}${closed_suffix}`)}</option>`;
					})
					.join("")
			);
		}

		$main.find('[data-role="period-month-select"]').val(String(this.state.period_month));
		$main.find('[data-role="date-from-input"]').val(this.state.date_from || "");
		$main.find('[data-role="date-to-input"]').val(this.state.date_to || "");
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

		const open_deposit_date_picker = () => {
			const input = $main.find('[data-role="deposit-date-input"]')[0];
			if (!input) {
				return;
			}
			if (typeof input.showPicker === "function") {
				try {
					input.showPicker();
					return;
				} catch (_) {
					// native fallback
				}
			}
			input.focus();
			input.click();
		};

		$main.on("click", ".archive-deposits-date-box", (e) => {
			if ($(e.target).is('[data-role="deposit-date-input"]')) {
				return;
			}
			e.preventDefault();
			open_deposit_date_picker();
		});

		$main.on("keydown", ".archive-deposits-date-box", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				open_deposit_date_picker();
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

		$main.on("change", '[data-role="period-mode-select"]', (e) => {
			const next_mode = String($(e.currentTarget).val() || "day").trim();
			if (next_mode === this.state.period_mode) return;
			this.request_period_change({ period_mode: next_mode });
		});

		$main.on("change", '[data-role="period-month-select"]', (e) => {
			const next_month = Number($(e.currentTarget).val() || this.state.period_month);
			if (next_month === this.state.period_month) return;
			this.request_period_change({ period_month: next_month });
		});

		$main.on("change", '[data-role="period-year-select"]', (e) => {
			const next_year = Number($(e.currentTarget).val() || this.state.period_year);
			if (next_year === this.state.period_year) return;
			this.request_period_change({
				period_year: next_year,
				fiscal_year: String(next_year),
			});
		});

		$main.on("change", '[data-role="date-from-input"], [data-role="date-to-input"]', () => {
			const next_from = String($main.find('[data-role="date-from-input"]').val() || "").trim();
			const next_to = String($main.find('[data-role="date-to-input"]').val() || "").trim();
			if (!next_from || !next_to) return;
			if (next_from > next_to) {
				frappe.show_alert({
					message: "تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.",
					indicator: "red",
				});
				$main.find('[data-role="date-from-input"]').val(this.state.date_from);
				$main.find('[data-role="date-to-input"]').val(this.state.date_to);
				return;
			}
			if (next_from === this.state.date_from && next_to === this.state.date_to) return;
			this.request_period_change({ date_from: next_from, date_to: next_to });
		});

		$main.on("change", '[data-role="fiscal-year-select"]', (e) => {
			const next_year = String($(e.currentTarget).val() || "").trim();
			if (!next_year || next_year === this.state.fiscal_year) {
				return;
			}
			const today_str = this.state.today || frappe.datetime.get_today();
			const target_date = today_str.startsWith(`${next_year}-`)
				? today_str
				: `${next_year}-01-01`;
			this.state.fiscal_year = next_year;
			this.state.period_year = Number(next_year) || this.state.period_year;
			this.request_date_change(target_date);
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
			if (!["all", "deposited", "not_deposited", "stopped_for_reason"].includes(next_filter)) {
				return;
			}
			const current_filter = this.state.status_filter || "all";
			if (current_filter === next_filter) {
				return;
			}
			this.state.status_filter = next_filter;
			this.state.page = 1;
			this.render_stats(false);
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
			this.render_stats(false);
			this.load_context(true);
		});

		$main.on("click", '[data-action="reset-filters"]', () => {
			this.state.filters = {
				bank: "",
				representative: "",
				region: "",
				card_owner: "",
			};
			this.state.status_filter = "all";
			$main.find("[data-filter]").val("");
			this.state.page = 1;
			this.update_filter_badge();
			this.render_stats(false);
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
			const $input = $(e.currentTarget);
			if ($input.prop("disabled") || $input.prop("readonly")) return;
			const row_key = String($input.attr("data-row-key") || "");
			const card_id = String($input.attr("data-card") || "");
			const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(card_id);
			if (!row) return;

			const resolved_key = row.row_key || make_row_key(row.card, row.deposit_date);
			if (this.dirty_deposits.has(resolved_key)) {
				const dirty = this.dirty_deposits.get(resolved_key);
				if (dirty.raw !== undefined && dirty.raw !== null) {
					$input.val(dirty.raw);
				} else {
					$input.val(dirty.amount > 0 ? String(dirty.amount) : "");
				}
			} else if (Number(row.deposit_amount || 0) > 0) {
				$input.val(String(row.deposit_amount));
			} else if (row.has_saved_record && Number(row.deposit_amount || 0) === 0 && !row.stopped_for_reason) {
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
			const $input = $(e.currentTarget);
			if ($input.prop("disabled") || $input.prop("readonly")) return;
			const raw_val = $input.val() || "";
			const row_key = String($input.attr("data-row-key") || "");
			const card_id = String($input.attr("data-card") || "");
			const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(card_id);
			if (!row) return;
			const resolved_key = row.row_key || make_row_key(row.card, row.deposit_date);

			const norm_trimmed = normalize_western_digits(raw_val).trim();
			if (norm_trimmed.startsWith("-")) {
				this.handle_inline_amount_change(resolved_key, norm_trimmed, $input, true);
				return;
			}
			const sanitized = sanitize_deposit_input_text(raw_val);
			if (sanitized !== raw_val) {
				$input.val(sanitized);
			}
			this.handle_inline_amount_change(resolved_key, sanitized, $input, false);
		});

		$main.on("blur", ".ad-deposit-input", (e) => {
			const $input = $(e.currentTarget);
			const row_key = String($input.attr("data-row-key") || "");
			const card_id = String($input.attr("data-card") || "");
			const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(card_id);
			if (!row) return;
			const resolved_key = row.row_key || make_row_key(row.card, row.deposit_date);

			if (this.dirty_deposits.has(resolved_key)) {
				const dirty = this.dirty_deposits.get(resolved_key);
				if (dirty.is_negative) {
					$input.val(dirty.raw);
				} else if (dirty.raw === "") {
					$input.val("");
				} else {
					$input.val(format_deposit_number(dirty.amount, false));
				}
			} else if (Number(row.deposit_amount || 0) > 0) {
				$input.val(format_deposit_number(row.deposit_amount, true));
			} else if (row.has_saved_record && Number(row.deposit_amount || 0) === 0 && !row.stopped_for_reason) {
				$input.val("0");
			} else {
				$input.val("");
			}
		});

		$main.on("keydown", ".ad-deposit-input", (e) => {
			const $input = $(e.currentTarget);
			if ($input.prop("disabled") || $input.prop("readonly")) {
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

		// Stopped for reason checkbox toggle
		$main.on("change", ".ad-stopped-reason-checkbox", (e) => {
			const $cb = $(e.currentTarget);
			const row_key = String($cb.attr("data-row-key") || "");
			const card_id = String($cb.attr("data-card") || "");
			const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(card_id);
			if (!row) return;
			const resolved_key = row.row_key || make_row_key(row.card, row.deposit_date);
			const want_checked = $cb.is(":checked");
			this.handle_stopped_reason_toggle(resolved_key, want_checked, $cb);
		});

		// Approve / Unapprove deposit buttons
		$main.on("click", '[data-action="approve-deposit"]', (e) => {
			e.preventDefault();
			const $btn = $(e.currentTarget);
			const row_key = String($btn.attr("data-row-key") || "");
			const card_id = String($btn.attr("data-card") || "");
			const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(card_id);
			if (!row) return;
			this.handle_approve_deposit(row);
		});

		$main.on("click", '[data-action="unapprove-deposit"]', (e) => {
			e.preventDefault();
			const $btn = $(e.currentTarget);
			const row_key = String($btn.attr("data-row-key") || "");
			const card_id = String($btn.attr("data-card") || "");
			const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(card_id);
			if (!row) return;
			this.handle_unapprove_deposit(row);
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
						"لديك تعديلات إيداعات غير محفوظة. هل تريد مغادرة الشاشة وتجاهل التعديلات غير المحفوظة؟",
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

	request_period_change(patch) {
		if (this.dirty_deposits.size === 0) {
			this.apply_period_change(patch);
			return;
		}

		this.render_period_controls();
		frappe.confirm(
			"توجد تعديلات غير محفوظة في العرض الحالي. هل تريد تغيير الفترة الزمنية وتجاهل التعديلات غير المحفوظة؟",
			() => {
				this.dirty_deposits.clear();
				this.update_save_button_state();
				this.apply_period_change(patch);
			}
		);
	}

	apply_period_change(patch) {
		Object.assign(this.state, patch);
		if (patch.period_mode && patch.period_mode !== "day") {
			if (!this.state.period_year) {
				this.state.period_year =
					Number(this.state.fiscal_year) ||
					Number(String(this.state.deposit_date || "").slice(0, 4)) ||
					new Date().getFullYear();
			}
			if (!this.state.period_month) {
				this.state.period_month =
					Number(String(this.state.deposit_date || "").slice(5, 7)) ||
					new Date().getMonth() + 1;
			}
			if (patch.period_mode === "range" && (!this.state.date_from || !this.state.date_to)) {
				const yr = this.state.period_year;
				const mo = String(this.state.period_month).padStart(2, "0");
				this.state.date_from = `${yr}-${mo}-01`;
				this.state.date_to = this.state.deposit_date || `${yr}-${mo}-01`;
			}
		}
		this.state.page = 1;
		this.dirty_deposits.clear();
		this.accounts_baseline.clear();
		this.update_save_button_state();
		this.render_period_controls();
		this.render_columns_menu();
		this.load_context(true);
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

	compute_account_live_state(account_day_key, fallback_row = null) {
		const resolved_day = String(fallback_row?.deposit_date || this.state.deposit_date || "").trim();
		const raw_acc = String(fallback_row?.account_key || fallback_row?.card || "").trim();
		const key = String(
			account_day_key ||
				fallback_row?.account_day_key ||
				(resolved_day && raw_acc ? make_account_day_key(raw_acc, resolved_day) : raw_acc)
		);

		let base = this.accounts_baseline.get(key) || null;
		if (!base && fallback_row) {
			base = {
				has_business: Boolean(fallback_row.has_business || fallback_row.card_type === "أعمال"),
				has_mada: Boolean(fallback_row.has_mada || fallback_row.card_type === "مدى"),
				business_limit: Number(
					fallback_row.business_limit !== undefined
						? fallback_row.business_limit
						: fallback_row.card_type === "أعمال"
						? fallback_row.daily_limit || 0
						: 0
				),
				mada_limit: Number(
					fallback_row.mada_limit !== undefined
						? fallback_row.mada_limit
						: fallback_row.card_type === "مدى"
						? fallback_row.daily_limit || 0
						: 0
				),
				legacy_limit: Number(fallback_row.legacy_limit || fallback_row.daily_limit || 0),
				business_saved_total: Number(fallback_row.business_saved_total || 0),
				mada_saved_total: Number(fallback_row.mada_saved_total || 0),
				legacy_saved_total: Number(fallback_row.legacy_saved_total || 0),
				daily_limit: Number(fallback_row.daily_limit || 0),
				account_saved_total: Number(
					fallback_row.account_saved_total !== undefined
						? fallback_row.account_saved_total
						: fallback_row.deposit_amount || 0
				),
				group_size: Number(fallback_row.group_size || fallback_row.account_copy_count || 1),
				has_limit_conflict: Boolean(fallback_row.has_limit_conflict),
			};
		}
		if (!base) {
			for (const d of this.dirty_deposits.values()) {
				if (d.account_day_key === key || d.account_key === key) {
					base = {
						has_business: Boolean(d.has_business || d.card_type === "أعمال"),
						has_mada: Boolean(d.has_mada || d.card_type === "مدى"),
						business_limit: Number(d.business_limit || 0),
						mada_limit: Number(d.mada_limit || 0),
						legacy_limit: Number(d.legacy_limit || d.daily_limit || 0),
						business_saved_total: Number(d.business_saved_total || 0),
						mada_saved_total: Number(d.mada_saved_total || 0),
						legacy_saved_total: Number(d.legacy_saved_total || 0),
						daily_limit: Number(d.daily_limit || 0),
						account_saved_total: Number(d.account_saved_total || 0),
						group_size: Number(d.group_size || d.account_copy_count || 1),
						has_limit_conflict: Boolean(d.has_limit_conflict),
					};
					break;
				}
			}
		}

		const has_business = Boolean(base?.has_business);
		const has_mada = Boolean(base?.has_mada);
		const business_limit = Math.max(0, Math.round(Number(base?.business_limit || 0) * 100) / 100);
		const mada_limit = Math.max(0, Math.round(Number(base?.mada_limit || 0) * 100) / 100);
		const legacy_limit = Math.max(0, Math.round(Number(base?.legacy_limit || base?.daily_limit || 0) * 100) / 100);
		const daily_limit = Math.max(0, Math.round(Number(base?.daily_limit || 0) * 100) / 100);

		const base_business_saved = Math.max(0, Math.round(Number(base?.business_saved_total || 0) * 100) / 100);
		const base_mada_saved = Math.max(0, Math.round(Number(base?.mada_saved_total || 0) * 100) / 100);
		const base_legacy_saved = Math.max(0, Math.round(Number(base?.legacy_saved_total || 0) * 100) / 100);
		const base_saved = Math.max(
			0,
			Math.round(Number(base?.account_saved_total || 0) * 100) / 100
		);

		let delta_business = 0;
		let delta_mada = 0;
		let delta_legacy = 0;
		let delta_all = 0;
		for (const entry of this.dirty_deposits.values()) {
			if ((entry.account_day_key === key || entry.account_key === key) && !entry.is_negative) {
				const d = Number(entry.amount || 0) - Number(entry.saved_amount || 0);
				delta_all += d;
				if (entry.card_type === "أعمال") {
					delta_business += d;
				} else if (entry.card_type === "مدى") {
					delta_mada += d;
				} else {
					delta_legacy += d;
				}
			}
		}

		const d_a = Math.max(0, Math.round((base_business_saved + delta_business) * 100) / 100);
		const d_m = Math.max(0, Math.round((base_mada_saved + delta_mada) * 100) / 100);
		const d_l = Math.max(0, Math.round((base_legacy_saved + delta_legacy) * 100) / 100);
		const effective_total = Math.max(0, Math.round((base_saved + delta_all) * 100) / 100);

		let remaining_business = 0;
		let remaining_mada = 0;
		let remaining_legacy = Math.max(0, Math.round((legacy_limit - effective_total) * 100) / 100);
		let is_over_business = false;
		let is_over_mada = false;
		let is_over_legacy = Math.round(effective_total * 100) > Math.round(legacy_limit * 100);

		if (has_business) {
			const group_rem = Math.round((business_limit - d_a - d_m - d_l) * 100) / 100;
			remaining_business = Math.max(0, group_rem);
			is_over_business = Math.round((d_a + d_m + d_l) * 100) > Math.round(business_limit * 100);
			if (has_mada) {
				const mada_own_rem = Math.round((mada_limit - d_m) * 100) / 100;
				remaining_mada = Math.max(0, Math.min(mada_own_rem, group_rem));
				is_over_mada =
					Math.round(d_m * 100) > Math.round(mada_limit * 100) || is_over_business;
			}
		} else if (has_mada) {
			const mada_rem = Math.round((mada_limit - d_m - d_l) * 100) / 100;
			remaining_mada = Math.max(0, mada_rem);
			is_over_mada = Math.round((d_m + d_l) * 100) > Math.round(mada_limit * 100);
		}

		const remaining_for_type = (ctype) => {
			if (ctype === "أعمال") return remaining_business;
			if (ctype === "مدى") return remaining_mada;
			return remaining_legacy;
		};
		const is_over_for_type = (ctype) => {
			if (ctype === "أعمال") return is_over_business;
			if (ctype === "مدى") return is_over_mada;
			return is_over_legacy;
		};

		const row_ctype = String(fallback_row?.card_type || "").trim();
		const remaining = remaining_for_type(row_ctype);
		const is_over_limit = is_over_for_type(row_ctype);

		return {
			account_day_key: key,
			daily_limit,
			base_saved,
			effective_total,
			remaining,
			is_over_limit,
			remaining_for_type,
			is_over_for_type,
			group_size: Math.max(
				Number(base?.group_size || 1),
				Number(fallback_row?.group_size || fallback_row?.account_copy_count || 1)
			),
			has_limit_conflict: Boolean(base?.has_limit_conflict),
		};
	}

	resolve_row_visual_state(row, acct_state = null) {
		const row_key = row.row_key || make_row_key(row.card, row.deposit_date);
		const is_dirty = this.dirty_deposits.has(row_key);
		const dirty_entry = is_dirty ? this.dirty_deposits.get(row_key) : null;
		const saved_amount = Math.round(Number(row.deposit_amount || 0) * 100) / 100;
		const effective_amount = is_dirty
			? dirty_entry.is_negative
				? saved_amount
				: Math.round(Number(dirty_entry.amount || 0) * 100) / 100
			: saved_amount;
		const effective_stopped = is_dirty
			? Boolean(dirty_entry.stopped_for_reason)
			: Boolean(row.stopped_for_reason);
		const is_approved = Boolean(row.is_approved);

		const resolved_acct =
			acct_state ||
			this.compute_account_live_state(
				row.account_day_key || make_account_day_key(row.account_key || row.card, row.deposit_date),
				row
			);
		const group_has_deposit = Number(resolved_acct.effective_total || 0) > 0;
		const group_count = Math.max(
			Number(row.group_size || row.account_copy_count || 1),
			Number(resolved_acct.group_size || 1)
		);

		const is_row_approved = is_approved;
		const is_row_stopped = !is_row_approved && effective_stopped;
		const is_row_deposited = !is_row_approved && !is_row_stopped && effective_amount > 0;
		const is_row_sibling_deposited =
			!is_row_approved &&
			!is_row_stopped &&
			!is_row_deposited &&
			group_count > 1 &&
			group_has_deposit;

		return {
			row_key,
			is_dirty,
			dirty_entry,
			saved_amount,
			effective_amount,
			effective_stopped,
			is_approved,
			is_row_approved,
			is_row_stopped,
			is_row_deposited,
			is_row_sibling_deposited,
		};
	}

	sync_account_dom_rows(account_day_key, fallback_row = null) {
		const acct_state = this.compute_account_live_state(account_day_key, fallback_row);
		const $tbody = $(this.page.main).find('[data-role="table-body"]');
		if (!$tbody.length) return;

		$tbody.find("tr.ad-table-row").each((_, trEl) => {
			const $tr = $(trEl);
			const row_key = String($tr.attr("data-row-key") || "");
			const cid = String($tr.attr("data-card-id") || "");
			const r = this.rows_by_key.get(row_key) || this.rows_by_card.get(cid);
			if (!r) return;
			const r_acct_day_key =
				r.account_day_key || make_account_day_key(r.account_key || r.card, r.deposit_date);
			if (r_acct_day_key !== acct_state.account_day_key) return;

			const v = this.resolve_row_visual_state(r, acct_state);
			const invalid_msg = v.dirty_entry?.invalid_msg || "";

			$tr.toggleClass("is-dirty-row", v.is_dirty)
				.toggleClass("has-deposit-error", Boolean(invalid_msg))
				.toggleClass("is-row-approved", v.is_row_approved)
				.toggleClass("is-row-stopped-reason", v.is_row_stopped)
				.toggleClass("is-row-deposited", v.is_row_deposited)
				.toggleClass("is-row-sibling-deposited", v.is_row_sibling_deposited);

			const can_edit_row_amount =
				Boolean(r.row_permissions?.can_edit_date) &&
				!v.is_approved &&
				!v.effective_stopped &&
				!this.is_saving;

			const $inp = $tr.find(".ad-deposit-input");
			if ($inp.length) {
				$inp.prop("disabled", !can_edit_row_amount)
					.prop("readonly", !can_edit_row_amount)
					.toggleClass("is-invalid", Boolean(invalid_msg))
					.toggleClass("is-dirty", v.is_dirty && !invalid_msg)
					.toggleClass("is-saved-positive", !v.is_dirty && !invalid_msg && v.saved_amount > 0)
					.attr("aria-invalid", invalid_msg ? "true" : "false");
				if (can_edit_row_amount) {
					$inp.removeAttr("disabled").removeAttr("readonly");
				}
			}

			const can_toggle_stopped =
				Boolean(r.row_permissions?.can_toggle_stopped_date) &&
				!v.is_approved &&
				!this.is_saving;
			const $cb = $tr.find(".ad-stopped-reason-checkbox");
			if ($cb.length) {
				$cb.prop("checked", v.effective_stopped).prop("disabled", !can_toggle_stopped);
				if (can_toggle_stopped) {
					$cb.removeAttr("disabled");
				}
			}
			const $cb_lbl = $tr.find(".ad-stopped-reason-label");
			if ($cb_lbl.length) {
				let disabled_title = "";
				if (v.is_approved) {
					disabled_title = "الإيداع معتمد ومقفول";
				} else if (!r.row_permissions?.can_toggle_stopped_date) {
					disabled_title = "ليست لديك صلاحية لتغيير «موقف لسبب» في هذا التاريخ";
				}
				if (disabled_title) {
					$cb_lbl.attr("title", disabled_title);
				} else {
					$cb_lbl.removeAttr("title");
				}
			}

			const $err = $tr.find('[data-role="deposit-error"]');
			if ($err.length) {
				$err.text(invalid_msg || DEPOSIT_OVER_LIMIT_MSG).prop("hidden", !invalid_msg);
			}

			const $rem = $tr.find('[data-role="remaining-cell-val"]');
			if ($rem.length) {
				const row_rem = acct_state.remaining_for_type(String(r.card_type || "").trim());
				$rem.text(format_deposit_number(row_rem, false));
				$rem.removeClass("is-over-limit");
			}

			const $status_td = $tr.find(".ad-td-status");
			if ($status_td.length) {
				$status_td.replaceWith(this.render_table_cell(r, "status", v));
			}

			const $approval_td = $tr.find(".ad-td-approval");
			if ($approval_td.length) {
				$approval_td.replaceWith(this.render_table_cell(r, "approval", v));
			}
		});
	}

	has_invalid_deposits() {
		for (const entry of this.dirty_deposits.values()) {
			if (entry?.invalid_msg) return true;
		}
		return false;
	}

	build_dirty_meta_fields(row) {
		const row_key = row.row_key || make_row_key(row.card, row.deposit_date);
		const account_key = String(row.account_key || row.card);
		const account_day_key =
			row.account_day_key || make_account_day_key(account_key, row.deposit_date);
		const card_type = String(row.card_type || "").trim();
		const daily_limit = Math.max(0, Math.round(Number(row.daily_limit || 0) * 100) / 100);
		const saved_amount = Math.round(Number(row.deposit_amount || 0) * 100) / 100;
		const saved_stopped = Boolean(row.stopped_for_reason);
		const account_saved_total = Math.round(
			Number(
				row.account_saved_total !== undefined ? row.account_saved_total : saved_amount
			) * 100
		) / 100;
		const has_limit_conflict = Boolean(row.has_limit_conflict);

		return {
			row_key,
			card: row.card,
			deposit_date: row.deposit_date,
			account_key,
			account_day_key,
			card_type,
			daily_limit,
			saved_amount,
			saved_stopped_for_reason: saved_stopped,
			account_saved_total,
			has_business: Boolean(row.has_business || card_type === "أعمال"),
			has_mada: Boolean(row.has_mada || card_type === "مدى"),
			business_limit: Number(row.business_limit || 0),
			mada_limit: Number(row.mada_limit || 0),
			legacy_limit: Number(row.legacy_limit || row.daily_limit || 0),
			business_saved_total: Number(row.business_saved_total || 0),
			mada_saved_total: Number(row.mada_saved_total || 0),
			legacy_saved_total: Number(row.legacy_saved_total || 0),
			group_size: Number(row.group_size || row.account_copy_count || 1),
			has_limit_conflict,
		};
	}

	sync_all_dom_rows() {
		const seen = new Set();
		for (const r of this.rows) {
			const acc_day_key =
				r.account_day_key || make_account_day_key(r.account_key || r.card, r.deposit_date);
			if (!seen.has(acc_day_key)) {
				seen.add(acc_day_key);
				this.sync_account_dom_rows(acc_day_key, r);
			}
		}
	}

	handle_inline_amount_change(row_key, sanitized_raw, $input, is_negative = false) {
		const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(row_key);
		if (!row) return;
		if (row.is_approved) return;

		const meta = this.build_dirty_meta_fields(row);
		const existing_dirty = this.dirty_deposits.get(meta.row_key);
		const current_stopped = existing_dirty
			? Boolean(existing_dirty.stopped_for_reason)
			: meta.saved_stopped_for_reason;

		if (current_stopped) {
			return;
		}

		if (is_negative) {
			this.dirty_deposits.set(meta.row_key, {
				...meta,
				amount: meta.saved_amount,
				stopped_for_reason: current_stopped,
				raw: sanitized_raw,
				is_negative: true,
				invalid_msg: DEPOSIT_NEGATIVE_MSG,
			});
		} else {
			const parsed_num =
				sanitized_raw === "" || sanitized_raw === "."
					? 0
					: Math.round(Number(sanitized_raw) * 100) / 100;

			this.dirty_deposits.set(meta.row_key, {
				...meta,
				amount: parsed_num,
				stopped_for_reason: current_stopped,
				raw: sanitized_raw,
				is_negative: false,
				invalid_msg: "",
			});
		}

		this.revalidate_account_day_dirty_entries(meta.account_day_key, row, meta.row_key);
		this.sync_account_dom_rows(meta.account_day_key, row);
		this.update_save_button_state();
	}

	handle_stopped_reason_toggle(row_key, want_checked, $cb) {
		const row = this.rows_by_key.get(row_key) || this.rows_by_card.get(row_key);
		if (!row) return;

		if (row.is_approved) {
			$cb.prop("checked", Boolean(row.stopped_for_reason));
			frappe.show_alert({
				message: "هذا الإيداع معتمد ومقفول. يجب إلغاء الاعتماد أولاً.",
				indicator: "red",
			});
			return;
		}

		if (!row.row_permissions?.can_toggle_stopped_date) {
			$cb.prop("checked", Boolean(row.stopped_for_reason));
			frappe.show_alert({
				message: "ليست لديك صلاحية لتعديل حالة «موقف لسبب» في هذا التاريخ.",
				indicator: "red",
			});
			return;
		}

		const meta = this.build_dirty_meta_fields(row);
		const existing_dirty = this.dirty_deposits.get(meta.row_key);
		const current_amount = existing_dirty
			? Number(existing_dirty.amount || 0)
			: meta.saved_amount;

		if (want_checked) {
			if (meta.saved_amount > 0) {
				$cb.prop("checked", false);
				frappe.show_alert({
					message:
						"لا يمكن تفعيل «موقف لسبب» لوجود مبلغ إيداع محفوظ مسبقاً. يجب تصفير المبلغ وحفظه أولاً ثم تفعيل «موقف لسبب».",
					indicator: "red",
				});
				return;
			}
			if (current_amount > 0 || existing_dirty?.is_negative) {
				$cb.prop("checked", false);
				frappe.show_alert({
					message: "لا يمكن تفعيل «موقف لسبب» مع وجود مبلغ إيداع أكبر من صفر.",
					indicator: "red",
				});
				return;
			}
		}

		this.dirty_deposits.set(meta.row_key, {
			...meta,
			amount: want_checked ? 0 : current_amount,
			stopped_for_reason: Boolean(want_checked),
			raw: existing_dirty?.raw ?? (current_amount > 0 ? String(current_amount) : ""),
			is_negative: false,
			invalid_msg: "",
		});

		this.revalidate_account_day_dirty_entries(meta.account_day_key, row, meta.row_key);
		this.sync_account_dom_rows(meta.account_day_key, row);
		this.update_save_button_state();
	}

	revalidate_account_day_dirty_entries(account_day_key, row, edited_row_key = "") {
		const acct_state = this.compute_account_live_state(account_day_key, row);

		for (const [rkey, entry] of [...this.dirty_deposits.entries()]) {
			if (entry.account_day_key !== account_day_key) continue;

			if (entry.is_negative) {
				entry.invalid_msg = DEPOSIT_NEGATIVE_MSG;
				continue;
			}

			if (acct_state.has_limit_conflict && entry.amount > 0) {
				entry.invalid_msg =
					"يوجد تعارض مسبق في الحد اليومي لنسخ هذا الحساب؛ يرجى توحيده من شاشة البطاقات أولاً";
				continue;
			}

			const entry_over = acct_state.is_over_for_type(entry.card_type);
			if (
				entry_over &&
				entry.amount > 0 &&
				(rkey === edited_row_key ||
					entry.amount > entry.saved_amount ||
					Math.round(entry.amount * 100) > Math.round(entry.daily_limit * 100))
			) {
				entry.invalid_msg = DEPOSIT_OVER_LIMIT_MSG;
				continue;
			}

			entry.invalid_msg = "";
			const amount_unchanged =
				Math.abs(entry.amount - entry.saved_amount) < 0.0001 &&
				(entry.saved_amount > 0 ? entry.raw !== "" : true);
			const stopped_unchanged =
				Boolean(entry.stopped_for_reason) === Boolean(entry.saved_stopped_for_reason);

			if (amount_unchanged && stopped_unchanged) {
				this.dirty_deposits.delete(rkey);
			}
		}
	}

	async handle_approve_deposit(row) {
		const row_key = row.row_key || make_row_key(row.card, row.deposit_date);
		if (this.approving_keys.has(row_key) || this.is_saving) return;

		if (this.dirty_deposits.has(row_key)) {
			frappe.show_alert({
				message: "يوجد تعديل غير محفوظ على هذا الصف. يرجى حفظ التعديلات أولاً قبل الاعتماد.",
				indicator: "orange",
			});
			return;
		}

		if (!row.has_saved_record || Number(row.deposit_amount || 0) <= 0 || row.stopped_for_reason) {
			frappe.show_alert({
				message: "لا يمكن اعتماد هذا الصف إلا بعد حفظ مبلغ إيداع أكبر من صفر.",
				indicator: "red",
			});
			return;
		}

		this.approving_keys.add(row_key);
		const acct_day_key =
			row.account_day_key || make_account_day_key(row.account_key || row.card, row.deposit_date);
		this.sync_account_dom_rows(acct_day_key, row);

		try {
			const res = await frappe.call({
				method: "archive.api.deposits.approve_deposit",
				type: "POST",
				args: {
					card: row.card,
					deposit_date: row.deposit_date,
					expected_amount: row.deposit_amount,
				},
			});
			const out = res?.message || {};
			const was_approved = Boolean(row.is_approved);
			const approved_val = Math.max(
				0,
				Number(out.approved_amount ?? row.deposit_amount) || 0
			);
			row.is_approved = true;
			row.approved_amount = approved_val;
			row.approved_amount_formatted = format_deposit_number(row.approved_amount, false);
			if (out.audit) {
				row.audit = out.audit;
			}
			if (row.row_permissions) {
				row.row_permissions.can_edit = false;
				row.row_permissions.can_toggle_stopped = false;
				row.row_permissions.can_approve = false;
				row.row_permissions.can_unapprove = Boolean(row.row_permissions.can_approve_date);
			}
			if (!was_approved && this.stats && approved_val > 0) {
				const prev_total = Math.max(0, Number(this.stats.total_deposited_amount) || 0);
				const next_total = Math.max(0, Number((prev_total + approved_val).toFixed(2)));
				this.stats.total_deposited_amount = next_total;
				this.stats.total_deposited_amount_formatted = format_deposit_number(next_total, true);
				this.render_stats(true);
			}
			frappe.show_alert({
				message: "تم اعتماد الإيداع بنجاح.",
				indicator: "green",
			});
		} finally {
			this.approving_keys.delete(row_key);
			this.sync_account_dom_rows(acct_day_key, row);
		}
	}

	handle_unapprove_deposit(row) {
		const row_key = row.row_key || make_row_key(row.card, row.deposit_date);
		if (this.approving_keys.has(row_key) || this.is_saving) return;

		frappe.confirm("هل تريد إلغاء اعتماد هذا الإيداع؟", async () => {
			this.approving_keys.add(row_key);
			const acct_day_key =
				row.account_day_key || make_account_day_key(row.account_key || row.card, row.deposit_date);
			this.sync_account_dom_rows(acct_day_key, row);

			try {
				const res = await frappe.call({
					method: "archive.api.deposits.unapprove_deposit",
					type: "POST",
					args: {
						card: row.card,
						deposit_date: row.deposit_date,
					},
				});
				const out = res?.message || {};
				const was_approved = Boolean(row.is_approved);
				const unapproved_val = Math.max(
					0,
					Number(out.deposit_amount ?? row.approved_amount ?? row.deposit_amount) || 0
				);
				row.is_approved = false;
				if (out.audit) {
					row.audit = out.audit;
				}
				if (row.row_permissions) {
					row.row_permissions.can_edit =
						Boolean(row.row_permissions.can_edit_date) && !row.stopped_for_reason;
					row.row_permissions.can_toggle_stopped =
						Boolean(row.row_permissions.can_toggle_stopped_date) &&
						Number(row.deposit_amount || 0) <= 0;
					row.row_permissions.can_approve =
						Boolean(row.row_permissions.can_approve_date) &&
						Number(row.deposit_amount || 0) > 0 &&
						!row.stopped_for_reason;
					row.row_permissions.can_unapprove = false;
				}
				if (was_approved && this.stats && unapproved_val > 0) {
					const prev_total = Math.max(0, Number(this.stats.total_deposited_amount) || 0);
					const next_total = Math.max(0, Number((prev_total - unapproved_val).toFixed(2)));
					this.stats.total_deposited_amount = next_total;
					this.stats.total_deposited_amount_formatted = format_deposit_number(next_total, true);
					this.render_stats(true);
				}
				frappe.show_alert({
					message: "تم إلغاء اعتماد الإيداع بنجاح.",
					indicator: "blue",
				});
			} finally {
				this.approving_keys.delete(row_key);
				this.sync_account_dom_rows(acct_day_key, row);
			}
		});
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
			!can_save ? "الفترة أو التاريخ المختار متاح للعرض فقط حسب صلاحياتك" : ""
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
			"توجد تعديلات غير محفوظة في العرض الحالي. هل تريد تحديث البيانات وتجاهل التعديلات غير المحفوظة؟",
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

	render_fiscal_year_filter() {
		const $select = $(this.page.main).find('[data-role="fiscal-year-select"]');
		if (!$select.length) return;
		const ctx = this.fiscal_context || {};
		const allowed = Array.isArray(ctx.allowed_view_years) ? ctx.allowed_view_years : [];
		if (!allowed.length) {
			$select.html('<option value="">لا توجد سنوات متاحة</option>').prop("disabled", true);
			return;
		}
		$select.prop("disabled", false);
		const current = this.state.fiscal_year || ctx.default_view_fiscal_year || allowed[0];
		$select.html(
			allowed
				.map((yr) => {
					const meta = (ctx.years || []).find((item) => item.year_name === yr);
					const closed_suffix = meta && Number(meta.is_closed) === 1 ? " (مغلقة)" : "";
					return `<option value="${frappe.utils.escape_html(yr)}" ${
						yr === current ? "selected" : ""
					}>${frappe.utils.escape_html(`${yr}${closed_suffix}`)}</option>`;
				})
				.join("")
		);
		this.state.fiscal_year = current;
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
					period_mode: this.state.period_mode || "day",
					period_month: this.state.period_month,
					period_year: this.state.period_year,
					date_from: this.state.date_from,
					date_to: this.state.date_to,
					fiscal_year:
						this.state.period_mode === "range"
							? undefined
							: this.state.fiscal_year || undefined,
					status_filter: this.state.status_filter === "all" ? "" : this.state.status_filter,
					search: this.state.search,
					bank: this.state.filters.bank,
					representative: this.state.filters.representative,
					region: this.state.filters.region,
					card_owner: this.state.filters.card_owner,
					page: this.state.page,
					page_size: this.state.page_size,
					sort_by: this.state.sort_by,
					sort_order: this.state.sort_order,
				},
			});

			if (seq !== this._load_seq) return;
			const data = res?.message || {};

			this.state.period_mode = data.period_mode || this.state.period_mode || "day";
			this.state.deposit_date = data.deposit_date || this.state.deposit_date;
			if (data.period_month) this.state.period_month = Number(data.period_month);
			if (data.period_year) this.state.period_year = Number(data.period_year);
			if (data.date_from) this.state.date_from = data.date_from;
			if (data.date_to) this.state.date_to = data.date_to;
			if (data.fiscal_year && data.fiscal_year !== "all") {
				this.state.fiscal_year = data.fiscal_year;
			}
			this.fiscal_year_is_closed = Boolean(data.fiscal_year_is_closed);
			this.fiscal_context = data.fiscal_context || this.fiscal_context || {};
			this.render_fiscal_year_filter();
			this.render_period_controls();
			this.render_columns_menu();

			this.state.today = data.today || this.state.today;
			this.rows = data.rows || [];
			this.rows_by_key.clear();
			this.rows_by_card.clear();
			if (this.dirty_deposits.size === 0) {
				this.accounts_baseline.clear();
			}
			for (const r of this.rows) {
				const rkey = r.row_key || make_row_key(r.card, r.deposit_date);
				r.row_key = rkey;
				const acc_key = String(r.account_key || r.card);
				const acc_day_key = r.account_day_key || make_account_day_key(acc_key, r.deposit_date);
				r.account_day_key = acc_day_key;

				this.rows_by_key.set(rkey, r);
				this.rows_by_card.set(rkey, r);
				if (!this.rows_by_card.has(r.card)) {
					this.rows_by_card.set(r.card, r);
				}

				this.accounts_baseline.set(acc_day_key, {
					has_business: Boolean(r.has_business || r.card_type === "أعمال"),
					has_mada: Boolean(r.has_mada || r.card_type === "مدى"),
					business_limit: Number(r.business_limit || 0),
					mada_limit: Number(r.mada_limit || 0),
					legacy_limit: Number(r.legacy_limit || r.daily_limit || 0),
					business_saved_total: Number(r.business_saved_total || 0),
					mada_saved_total: Number(r.mada_saved_total || 0),
					legacy_saved_total: Number(r.legacy_saved_total || 0),
					daily_limit: Number(r.daily_limit || 0),
					account_saved_total: Number(
						r.account_saved_total !== undefined
							? r.account_saved_total
							: r.deposit_amount || 0
					),
					group_size: Number(r.group_size || r.account_copy_count || 1),
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
			$main
				.find(
					".archive-deposits-date-bar, [data-role='stats-bar'], .archive-deposits-toolbar, [data-role='table-head'], [data-role='pagination-bar']"
				)
				.prop("hidden", false);
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
		for (const [, entry] of this.dirty_deposits.entries()) {
			payload_items.push({
				card: entry.card,
				deposit_date: entry.deposit_date || this.state.deposit_date,
				amount: entry.amount,
				stopped_for_reason: entry.stopped_for_reason ? 1 : 0,
			});
		}

		this.is_saving = true;
		this.update_save_button_state();
		this.update_refresh_button_state();
		let context_reloaded = false;

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
						? `تم حفظ التعديلات (${out.saved_count} سجل) بنجاح.`
						: "تم تحديث حالة الإيداعات بنجاح.",
				indicator: "green",
			});

			this.is_saving = false;
			context_reloaded = true;
			await this.load_context(true);
		} catch (err) {
			if (
				err?.exc_type === "PermissionError" ||
				err?.status === 403 ||
				err?.xhr?.status === 403
			) {
				this.dirty_deposits.clear();
				this.is_saving = false;
				context_reloaded = true;
				await this.load_context(true);
			}
		} finally {
			this.is_saving = false;
			if (!context_reloaded) {
				this.sync_all_dom_rows();
			}
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
		this.rows_by_key.clear();
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
						<td colspan="10">
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
		fill_select("card_owner", m.card_owners, "card_owner_name");
	}

	cancel_financial_stats_animations() {
		if (!this._fin_stats_anim) return;
		if (this._fin_stats_anim.timer_id) {
			clearTimeout(this._fin_stats_anim.timer_id);
			this._fin_stats_anim.timer_id = null;
		}
		for (const k of ["deposited", "target", "percent"]) {
			if (this._fin_stats_anim.raf_ids[k]) {
				window.cancelAnimationFrame(this._fin_stats_anim.raf_ids[k]);
				this._fin_stats_anim.raf_ids[k] = null;
			}
		}
	}

	prepare_screen_entry_animation() {
		this.cancel_financial_stats_animations();
		this._pending_entry_stats_anim = true;
		if (this._fin_stats_anim) {
			this._fin_stats_anim.last_deposited = null;
			this._fin_stats_anim.last_target = null;
			this._fin_stats_anim.last_percent = null;
			this._fin_stats_anim.last_frozen = null;
		}
		const $box = $(this.page?.main).find('[data-role="financial-stats-box"]');
		if ($box.length) {
			$box.find('[data-role="deposited-value"]').text("0");
			const is_frozen = $box.hasClass("is-target-frozen");
			$box.find('[data-role="target-value"]').text(is_frozen ? "—" : "0");
			$box.find('[data-role="progress-percent"]').text(is_frozen ? "—" : "0%");
			const fillEl = $box.find('[data-role="progress-fill"]')[0];
			if (fillEl) {
				fillEl.style.transition = "none";
				fillEl.style.width = "0%";
				void fillEl.offsetWidth;
				fillEl.style.transition = "";
			}
		}
	}

	animate_stat_number(key, element, start, end, duration = 1600, suffix = "", is_currency = false) {
		if (!element) return;
		if (this._fin_stats_anim.raf_ids[key]) {
			window.cancelAnimationFrame(this._fin_stats_anim.raf_ids[key]);
			this._fin_stats_anim.raf_ids[key] = null;
		}

		const format_val = (val, is_final) => {
			if (!is_currency) {
				return Math.round(val).toLocaleString("en-US") + suffix;
			}
			if (is_final) {
				return format_deposit_number(end, false) + suffix;
			}
			const has_decimals =
				Math.abs(end - Math.round(end)) > 0.0001 ||
				Math.abs(start - Math.round(start)) > 0.0001;
			if (has_decimals) {
				return (
					Number(val.toFixed(2)).toLocaleString("en-US", {
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					}) + suffix
				);
			}
			const current_int = end >= start ? Math.floor(val) : Math.ceil(val);
			return current_int.toLocaleString("en-US") + suffix;
		};

		const reduced_motion =
			typeof window !== "undefined" &&
			window.matchMedia &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced_motion || duration <= 0 || Math.abs(end - start) < 0.0001) {
			element.textContent = format_val(end, true);
			return;
		}

		let startTimestamp = null;
		const step = (timestamp) => {
			if (typeof document !== "undefined" && document.body && !document.body.contains(element)) {
				this._fin_stats_anim.raf_ids[key] = null;
				return;
			}
			if (!startTimestamp) startTimestamp = timestamp;
			const progress = Math.min((timestamp - startTimestamp) / duration, 1);
			const easeOut = 1 - Math.pow(1 - progress, 3);
			const currentVal = easeOut * (end - start) + start;

			if (progress < 1) {
				element.textContent = format_val(currentVal, false);
				this._fin_stats_anim.raf_ids[key] = window.requestAnimationFrame(step);
			} else {
				element.textContent = format_val(end, true);
				this._fin_stats_anim.raf_ids[key] = null;
			}
		};
		this._fin_stats_anim.raf_ids[key] = window.requestAnimationFrame(step);
	}

	render_stats(animate_financial = true) {
		const s = this.stats || {};
		const cur_filter = this.state.status_filter || "all";
		const is_day = (this.state.period_mode || "day") === "day";
		const target_frozen = Boolean(
			s.target_is_frozen ||
				this.state.filters.representative ||
				this.state.filters.region
		);

		const cards = [
			{
				id: "all",
				clickable: true,
				active: cur_filter === "all",
				label: "كل الإيداعات",
				sub: is_day ? "إجمالي البطاقات النشطة في اليوم" : "إجمالي سجلات البطاقات خلال الفترة",
				value: format_deposit_number(s.total_cards || 0, false),
				tone: "violet",
				icon: DEPOSIT_SVGS.stat_all,
			},
			{
				id: "deposited",
				clickable: true,
				active: cur_filter === "deposited",
				label: "المودعين",
				sub: "عدد السجلات التي تم الإيداع لها",
				value: format_deposit_number(s.deposited_count || 0, false),
				tone: "green",
				icon: DEPOSIT_SVGS.stat_deposited,
			},
			{
				id: "not_deposited",
				clickable: true,
				active: cur_filter === "not_deposited",
				label: "لم يودعوا",
				sub: "سجلات لم يتم الإيداع لها",
				value: format_deposit_number(s.not_deposited_count || 0, false),
				tone: "red",
				icon: DEPOSIT_SVGS.stat_not_deposited,
			},
			{
				id: "stopped_for_reason",
				clickable: true,
				active: cur_filter === "stopped_for_reason",
				label: "موقف لسبب",
				sub: "سجلات مستثناة من عدم الإيداع لسبب",
				value: format_deposit_number(s.stopped_for_reason_count || 0, false),
				tone: "amber",
				icon: DEPOSIT_SVGS.stat_stopped_reason,
			},
		];

		const deposited_amount = Math.max(0, Number(s.total_deposited_amount) || 0);
		const target_amount = Math.max(0, Number(s.total_daily_target) || 0);
		const raw_pct = !target_frozen && target_amount > 0 ? (deposited_amount / target_amount) * 100 : 0;
		const percentage = !target_frozen && target_amount > 0 ? Math.max(0, Math.min(Math.round(raw_pct), 100)) : 0;

		const deposited_title = "إجمالي المبلغ المودع";
		const deposited_desc = is_day ? "إجمالي ما تم إيداعه اليوم" : "إجمالي المبالغ المودعة خلال الفترة";
		const target_title = is_day ? "إجمالي الهدف اليومي" : "إجمالي الهدف";
		const target_desc = target_frozen
			? "مجمّد عند التصفية بالمندوب أو المنطقة"
			: is_day
			? "مجموع الحدود اليومية للبطاقات النشطة"
			: "مجموع الحدود اليومية خلال الفترة";
		const progress_label = is_day ? "نسبة تحقيق الهدف اليومي:" : "نسبة تحقيق الهدف:";

		const $statsBar = $(this.page.main).find('[data-role="stats-bar"]');
		if (!$statsBar.length) return;

		let $finBox = $statsBar.find('[data-role="financial-stats-box"]');
		if (!$finBox.length) {
			const cards_html = cards
				.map((c) => {
					return `
						<button
							type="button"
							data-status-card="${c.id}"
							class="ad-stat-card tone-${c.tone} is-clickable ${c.active ? "is-active" : ""}"
						>
							<div class="ad-stat-top">
								<span class="ad-stat-icon" aria-hidden="true">${c.icon}</span>
								<span class="ad-stat-label">${frappe.utils.escape_html(c.label)}</span>
							</div>
							<div class="ad-stat-value" dir="ltr">${frappe.utils.escape_html(String(c.value))}</div>
							<div class="ad-stat-sub">${frappe.utils.escape_html(c.sub)}</div>
						</button>
					`;
				})
				.join("");

			const fin_html = `
				<div
					class="stats-container ${target_frozen ? "is-target-frozen" : ""}"
					data-role="financial-stats-box"
					data-deposited="${deposited_amount}"
					data-target="${target_amount}"
				>
					<div class="stats-grid">
						<div class="stat-item">
							<div class="stat-icon blue" aria-hidden="true">
								${DEPOSIT_SVGS.stat_amount}
							</div>
							<div class="stat-info">
								<span class="stat-title" data-role="deposited-title">${frappe.utils.escape_html(deposited_title)}</span>
								<span class="stat-value blue-text" data-role="deposited-value">0</span>
								<span class="stat-desc" data-role="deposited-desc">${frappe.utils.escape_html(deposited_desc)}</span>
							</div>
						</div>

						<div class="stat-divider" aria-hidden="true"></div>

						<div class="stat-item">
							<div class="stat-icon purple" aria-hidden="true">
								${DEPOSIT_SVGS.stat_target}
							</div>
							<div class="stat-info">
								<span class="stat-title" data-role="target-title">${frappe.utils.escape_html(target_title)}</span>
								<span class="stat-value purple-text ${target_frozen ? "is-blurred-target" : ""}" data-role="target-value">${target_frozen ? "—" : "0"}</span>
								<span class="stat-desc" data-role="target-desc">${frappe.utils.escape_html(target_desc)}</span>
							</div>
						</div>
					</div>

					<div class="stats-footer">
						<span class="progress-text">
							<span data-role="progress-label">${frappe.utils.escape_html(progress_label)}</span>
							<span class="progress-percentage" data-role="progress-percent">${target_frozen ? "—" : "0%"}</span>
						</span>
						<div class="progress-bar">
							<div class="progress-fill" data-role="progress-fill"></div>
						</div>
					</div>
				</div>
			`;

			$statsBar.html(cards_html + fin_html);
			$finBox = $statsBar.find('[data-role="financial-stats-box"]');
		} else {
			cards.forEach((c) => {
				const $card = $statsBar.find(`[data-status-card="${c.id}"]`);
				if ($card.length) {
					$card.toggleClass("is-active", Boolean(c.active));
					$card.find(".ad-stat-label").text(c.label);
					$card.find(".ad-stat-value").text(String(c.value));
					$card.find(".ad-stat-sub").text(c.sub);
				}
			});

			$finBox
				.attr("data-deposited", String(deposited_amount))
				.attr("data-target", String(target_amount))
				.toggleClass("is-target-frozen", target_frozen);
			$finBox.find('[data-role="deposited-title"]').text(deposited_title);
			$finBox.find('[data-role="deposited-desc"]').text(deposited_desc);
			$finBox.find('[data-role="target-title"]').text(target_title);
			$finBox.find('[data-role="target-desc"]').text(target_desc);
			$finBox
				.find('[data-role="target-value"]')
				.toggleClass("is-blurred-target", target_frozen);
			$finBox.find('[data-role="progress-label"]').text(progress_label);
		}

		if (!animate_financial) {
			return;
		}

		const depositedEl = $finBox.find('[data-role="deposited-value"]')[0];
		const targetEl = $finBox.find('[data-role="target-value"]')[0];
		const progressPercentEl = $finBox.find('[data-role="progress-percent"]')[0];
		const progressFillEl = $finBox.find('[data-role="progress-fill"]')[0];
		if (!depositedEl || !targetEl || !progressPercentEl || !progressFillEl) return;

		const animState = this._fin_stats_anim;
		const is_entry = Boolean(this._pending_entry_stats_anim || animState.last_deposited === null);

		if (is_entry) {
			this._pending_entry_stats_anim = false;
			this.cancel_financial_stats_animations();

			depositedEl.textContent = "0";
			targetEl.textContent = target_frozen ? "—" : "0";
			progressPercentEl.textContent = target_frozen ? "—" : "0%";
			progressFillEl.style.transition = "none";
			progressFillEl.style.width = "0%";
			void progressFillEl.offsetWidth;
			progressFillEl.style.transition = "";

			animState.last_deposited = deposited_amount;
			animState.last_target = target_amount;
			animState.last_percent = percentage;
			animState.last_frozen = target_frozen;

			animState.timer_id = setTimeout(() => {
				animState.timer_id = null;
				this.animate_stat_number("deposited", depositedEl, 0, deposited_amount, 1600, "", true);
				if (target_frozen) {
					targetEl.textContent = "—";
					progressPercentEl.textContent = "—";
					progressFillEl.style.width = "0%";
				} else {
					progressFillEl.style.width = percentage + "%";
					this.animate_stat_number("percent", progressPercentEl, 0, percentage, 1600, "%", false);
					this.animate_stat_number("target", targetEl, 0, target_amount, 1600, "", true);
				}
			}, 150);
			return;
		}

		const dep_changed = Math.abs(deposited_amount - (animState.last_deposited ?? 0)) > 0.0001;
		const tgt_changed = Math.abs(target_amount - (animState.last_target ?? 0)) > 0.0001;
		const pct_changed = percentage !== (animState.last_percent ?? 0);
		const frz_changed = target_frozen !== Boolean(animState.last_frozen);

		if (!dep_changed && !tgt_changed && !pct_changed && !frz_changed) {
			return;
		}

		const prev_dep = animState.last_deposited ?? 0;
		const prev_tgt = animState.last_frozen ? 0 : animState.last_target ?? 0;
		const prev_pct = animState.last_frozen ? 0 : animState.last_percent ?? 0;

		animState.last_deposited = deposited_amount;
		animState.last_target = target_amount;
		animState.last_percent = percentage;
		animState.last_frozen = target_frozen;

		if (dep_changed) {
			this.animate_stat_number("deposited", depositedEl, prev_dep, deposited_amount, 1600, "", true);
		}

		if (target_frozen) {
			if (animState.raf_ids.target) {
				window.cancelAnimationFrame(animState.raf_ids.target);
				animState.raf_ids.target = null;
			}
			if (animState.raf_ids.percent) {
				window.cancelAnimationFrame(animState.raf_ids.percent);
				animState.raf_ids.percent = null;
			}
			targetEl.textContent = "—";
			progressPercentEl.textContent = "—";
			progressFillEl.style.width = "0%";
		} else {
			if (tgt_changed || frz_changed) {
				this.animate_stat_number("target", targetEl, prev_tgt, target_amount, 1600, "", true);
			}
			if (pct_changed || frz_changed || dep_changed || tgt_changed) {
				progressFillEl.style.width = percentage + "%";
				this.animate_stat_number("percent", progressPercentEl, prev_pct, percentage, 1600, "%", false);
			}
		}
	}

	render_columns_menu() {
		const is_day = (this.state.period_mode || "day") === "day";
		const html = ARCHIVE_DEPOSITS_COLUMNS.filter((col) => !(col.period_only && is_day))
			.map((col) => {
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
			})
			.join("");

		$(this.page.main).find('[data-role="columns-menu"]').html(html);
	}

	get_visible_columns() {
		const is_day = (this.state.period_mode || "day") === "day";
		return ARCHIVE_DEPOSITS_COLUMNS.filter((c) => {
			if (c.period_only && is_day) return false;
			return !this.state.hidden_columns.has(c.key);
		});
	}

	format_audit_datetime(value) {
		if (typeof window.archive_format_datetime === "function") {
			return window.archive_format_datetime(value, "");
		}
		const clean = String(value || "").trim().replace(/\.\d+$/, "");
		if (!clean) return "";
		let resolved = clean;
		try {
			if (frappe?.datetime?.convert_to_user_tz && /^\d{4}-\d{2}-\d{2}[T\s]+\d{1,2}:\d{2}/.test(clean)) {
				const converted = frappe.datetime.convert_to_user_tz(clean, true);
				if (converted && converted !== "Invalid date") {
					resolved = String(converted).trim().replace(/\.\d+$/, "");
				}
			}
		} catch (e) {
			// fallback below
		}
		const m = resolved.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2})/);
		if (m) {
			const h24 = parseInt(m[2], 10);
			const min = String(m[3]).padStart(2, "0");
			const period = h24 >= 12 ? "م" : "ص";
			const h12 = String(h24 % 12 || 12).padStart(2, "0");
			return `${m[1]}، ${h12}:${min} ${period}`;
		}
		return resolved;
	}

	build_audit_tooltip(row) {
		const a = row.audit;
		if (!a) {
			return "";
		}
		const lines = [];
		if (a.recorded_by) {
			lines.push(`تم التسجيل بواسطة: ${a.recorded_by_name || a.recorded_by}`);
			if (a.recorded_at) {
				lines.push(`وقت التسجيل: ${this.format_audit_datetime(a.recorded_at)}`);
			}
		}
		if (
			a.last_modified_by &&
			(a.history_count > 1 || a.last_modified_at !== a.recorded_at)
		) {
			lines.push(`آخر تعديل بواسطة: ${a.last_modified_by_name || a.last_modified_by}`);
			if (a.last_modified_at) {
				lines.push(`وقت آخر تعديل: ${this.format_audit_datetime(a.last_modified_at)}`);
			}
			if (a.previous_amount !== null && a.previous_amount !== undefined) {
				lines.push(`المبلغ السابق: ${format_deposit_number(a.previous_amount, false)}`);
			}
		}
		if (a.stopped_reason_by) {
			lines.push(`موقف لسبب بواسطة: ${a.stopped_reason_by_name || a.stopped_reason_by}`);
			if (a.stopped_reason_at) {
				lines.push(`وقت تغيير موقف لسبب: ${this.format_audit_datetime(a.stopped_reason_at)}`);
			}
		}
		if (a.approved_by) {
			lines.push(`تم الاعتماد بواسطة: ${a.approved_by_name || a.approved_by}`);
			if (a.approved_at) {
				lines.push(`وقت الاعتماد: ${this.format_audit_datetime(a.approved_at)}`);
			}
			if (a.approved_amount !== null && a.approved_amount !== undefined) {
				lines.push(`المبلغ المعتمد: ${format_deposit_number(a.approved_amount, false)}`);
			}
		}
		if (a.unapproved_by) {
			lines.push(`أُلغي الاعتماد بواسطة: ${a.unapproved_by_name || a.unapproved_by}`);
			if (a.unapproved_at) {
				lines.push(`وقت إلغاء الاعتماد: ${this.format_audit_datetime(a.unapproved_at)}`);
			}
		}
		return lines.join("\n");
	}

	get_text_measure_context() {
		if (!this._text_measure_ctx) {
			const canvas = document.createElement("canvas");
			this._text_measure_ctx = canvas.getContext("2d");
		}
		return this._text_measure_ctx;
	}

	measure_card_name_column_width($table) {
		const header_min_px = 148;
		if (!this.rows.length) {
			return header_min_px;
		}
		const ctx = this.get_text_measure_context();
		if (!ctx) {
			return 178;
		}
		const table_el = $table && $table.length ? $table[0] : document.body;
		const style = window.getComputedStyle(table_el);
		const sample_title = $table && $table.length ? $table.find(".ad-card-title-text")[0] : null;
		const title_style = sample_title ? window.getComputedStyle(sample_title) : null;
		const font_family = (title_style && title_style.fontFamily) || style.fontFamily || "sans-serif";
		const token_sm = parseFloat(style.getPropertyValue("--archive-font-size-sm"));
		const token_2xs = parseFloat(style.getPropertyValue("--archive-font-size-2xs"));
		const title_px =
			(title_style && parseFloat(title_style.fontSize)) ||
			(Number.isFinite(token_sm) && token_sm > 0 ? token_sm : parseFloat(style.fontSize) || 13);
		const badge_px =
			Number.isFinite(token_2xs) && token_2xs > 0 ? token_2xs : Math.max(title_px - 2, 10);

		const top = [];
		const sample_limit = Math.min(this.rows.length, 400);
		for (let i = 0; i < sample_limit; i++) {
			const r = this.rows[i];
			const name = String(r.base_card_name || r.card_name || "").trim();
			const copy = String(r.copy_label || "").trim();
			const score = name.length * 1.15 + copy.length + (copy ? 3 : 0);
			if (top.length < 5 || score > top[top.length - 1].score) {
				top.push({ name, copy, score });
				top.sort((a, b) => b.score - a.score);
				if (top.length > 5) {
					top.length = 5;
				}
			}
		}

		let max_cell_px = header_min_px;
		for (const item of top) {
			ctx.font = `700 ${title_px}px ${font_family}`;
			let w = ctx.measureText(item.name).width;
			if (item.copy) {
				ctx.font = `700 ${badge_px}px ${font_family}`;
				w += 6 + 18 + ctx.measureText(item.copy).width;
			}
			const needed = Math.ceil(24 + w + 18);
			if (needed > max_cell_px) {
				max_cell_px = needed;
			}
		}
		return max_cell_px;
	}

	measure_bank_column_width($table) {
		const bank_min_px = 116;
		const bank_max_px = 260;
		if (!this.rows.length) {
			return this._last_bank_col_px || 144;
		}
		const ctx = this.get_text_measure_context();
		if (!ctx) {
			return this._last_bank_col_px || 156;
		}
		const table_el = $table && $table.length ? $table[0] : document.body;
		const style = window.getComputedStyle(table_el);
		const token_cell_sz = parseFloat(style.getPropertyValue("--archive-font-table-cell-size"));
		const sample_bank = $table && $table.length ? $table.find(".ad-bank-name")[0] : null;
		const bank_style = sample_bank ? window.getComputedStyle(sample_bank) : null;
		const font_family = (bank_style && bank_style.fontFamily) || style.fontFamily || "sans-serif";
		const font_px =
			(bank_style && parseFloat(bank_style.fontSize)) ||
			(Number.isFinite(token_cell_sz) && token_cell_sz > 0 ? token_cell_sz : parseFloat(style.fontSize) || 13);
		const font_weight = (bank_style && bank_style.fontWeight) || "600";

		const unique_banks = new Set();
		for (let i = 0; i < this.rows.length; i++) {
			const b_name = String(this.rows[i].bank_name || this.rows[i].bank || "—").trim();
			if (b_name) {
				unique_banks.add(b_name);
			}
		}

		// Overhead: td padding (24px) + .ad-bank-cell padding (4px) + 26px icon + 8px gap + 8px breathing room
		const bank_chrome_px = 70;
		ctx.font = `${font_weight} ${font_px}px ${font_family}`;
		let max_bank_px = bank_min_px;
		for (const name of unique_banks) {
			const needed = Math.ceil(ctx.measureText(name).width + bank_chrome_px);
			if (needed > max_bank_px) {
				max_bank_px = needed;
			}
		}

		const clamped_px = Math.min(bank_max_px, Math.max(bank_min_px, max_bank_px));
		this._last_bank_col_px = clamped_px;
		return clamped_px;
	}

	compute_table_column_layout(visible_cols, $main, $table) {
		const scroll_el = $main.find('[data-role="table-scroll"]')[0];
		const raw_container_w = scroll_el ? scroll_el.clientWidth : 0;
		const container_w =
			raw_container_w > 0 ? raw_container_w : Math.max(window.innerWidth - 300, 1120);

		const flex_keys = new Set(["card_name", "bank"]);
		const flex_cols = visible_cols.filter((c) => flex_keys.has(c.key));
		const other_cols = visible_cols.filter((c) => !flex_keys.has(c.key));
		const total_pct = visible_cols.reduce((sum, c) => sum + c.pct, 0) || 100;
		const other_pct = other_cols.reduce((sum, c) => sum + c.pct, 0);
		const other_min_sum = other_cols.reduce((sum, c) => sum + c.min_px, 0);
		const visible_min_sum = visible_cols.reduce((sum, c) => sum + c.min_px, 0);

		const normal_table_w = Math.max(container_w, visible_min_sum);
		const widths = new Map();
		let flex_sum = 0;

		for (const col of flex_cols) {
			let px;
			if (col.key === "card_name") {
				px = this.rows.length
					? this.measure_card_name_column_width($table)
					: Math.max(178, Math.round(normal_table_w * (col.pct / total_pct)));
			} else if (col.key === "bank") {
				px = this.measure_bank_column_width($table);
			} else {
				px = col.min_px;
			}
			widths.set(col.key, px);
			flex_sum += px;
		}

		const base_other_sum = other_cols.length
			? Math.max(other_min_sum, Math.round(normal_table_w * (other_pct / total_pct)))
			: 0;
		const target_other_sum = Math.max(base_other_sum, container_w - flex_sum);

		let allocated_other = 0;
		other_cols.forEach((col, idx) => {
			let px;
			if (idx === other_cols.length - 1) {
				px = Math.max(col.min_px, target_other_sum - allocated_other);
			} else {
				const share = other_pct > 0 ? col.pct / other_pct : 1 / other_cols.length;
				px = Math.max(col.min_px, Math.round(target_other_sum * share));
			}
			allocated_other += px;
			widths.set(col.key, px);
		});

		return {
			widths,
			table_width_px: flex_sum + allocated_other,
		};
	}

	build_row_html(row, visible_cols, row_idx = 0) {
		const v = this.resolve_row_visual_state(row);
		const has_error = Boolean(v.dirty_entry?.invalid_msg);
		const cells = visible_cols.map((col) => this.render_table_cell(row, col.key, v, row_idx)).join("");
		const classes = [
			"ad-table-row",
			v.is_dirty ? "is-dirty-row" : "",
			has_error ? "has-deposit-error" : "",
			v.is_row_approved ? "is-row-approved" : "",
			v.is_row_stopped ? "is-row-stopped-reason" : "",
			v.is_row_deposited ? "is-row-deposited" : "",
			v.is_row_sibling_deposited ? "is-row-sibling-deposited" : "",
		]
			.filter(Boolean)
			.join(" ");

		return `
			<tr
				class="${classes}"
				data-row-key="${frappe.utils.escape_html(v.row_key)}"
				data-card-id="${frappe.utils.escape_html(row.card)}"
				data-deposit-date="${frappe.utils.escape_html(row.deposit_date || "")}"
				data-account-key="${frappe.utils.escape_html(String(row.account_key || row.card))}"
				data-account-day-key="${frappe.utils.escape_html(String(row.account_day_key || ""))}"
			>
				${cells}
			</tr>
		`;
	}

	render_table() {
		const $main = $(this.page.main);
		const visible_cols = this.get_visible_columns();
		const $table = $main.find(".archive-deposits-table");
		const $head = $main.find('[data-role="table-head"]');
		const $tbody = $main.find('[data-role="table-body"]');
		const render_token = ++this._table_render_token;

		const layout = this.compute_table_column_layout(visible_cols, $main, $table);
		$table.css({
			width: `max(100%, ${layout.table_width_px}px)`,
			minWidth: `${layout.table_width_px}px`,
		});

		const head_cells = visible_cols
			.map((col) => {
				const is_sorted = this.state.sort_by === col.key;
				const arrow = is_sorted
					? this.state.sort_order === "asc"
						? "▲"
						: "▼"
					: "";
				const col_px = layout.widths.get(col.key);
				const width_style = col_px ? `width: ${col_px}px; min-width: ${col_px}px;` : `width: ${col.width};`;
				const is_centered_th =
					col.key === "serial_no" ||
					col.key === "stopped_for_reason" ||
					col.key === "status" ||
					col.key === "approval";
				return `
					<th
						class="ac-th ${col.key === "serial_no" ? "ad-th-serial" : ""} ${
					is_centered_th ? "ad-th-centered" : ""
				} ${col.sortable ? "is-sortable" : ""}"
						style="${width_style}"
						data-col-key="${col.key}"
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
							<span>لا توجد بطاقات مطابقة لمعايير البحث أو الفلترة في هذه الفترة.</span>
						</div>
					</td>
				</tr>
			`);
			return;
		}

		// Chunked rendering for large datasets (e.g. "all" page size across multi-month/year period)
		const initial_chunk = Math.min(this.rows.length, 300);
		const first_html = this.rows
			.slice(0, initial_chunk)
			.map((row, idx) => this.build_row_html(row, visible_cols, idx))
			.join("");
		$tbody.html(first_html);

		if (this.rows.length > initial_chunk) {
			let offset = initial_chunk;
			const chunk_size = 350;
			const append_next_chunk = () => {
				if (render_token !== this._table_render_token) return;
				const slice = this.rows.slice(offset, offset + chunk_size);
				if (!slice.length) return;
				const chunk_html = slice
					.map((r, sIdx) => this.build_row_html(r, visible_cols, offset + sIdx))
					.join("");
				$tbody[0].insertAdjacentHTML("beforeend", chunk_html);
				offset += chunk_size;
				if (offset < this.rows.length) {
					window.requestAnimationFrame(append_next_chunk);
				}
			};
			window.requestAnimationFrame(append_next_chunk);
		}
	}

	render_table_cell(row, key, precomputed_v = null, row_idx = 0) {
		const v = precomputed_v || this.resolve_row_visual_state(row);
		const {
			row_key,
			is_dirty,
			dirty_entry,
			saved_amount,
			effective_amount,
			effective_stopped,
			is_approved,
		} = v;
		const invalid_msg = dirty_entry?.invalid_msg || "";
		const acct_state = this.compute_account_live_state(
			row.account_day_key || make_account_day_key(row.account_key || row.card, row.deposit_date),
			row
		);
		const remaining = acct_state.remaining;

		if (key === "serial_no") {
			const raw_ps = this.pagination?.page_size ?? this.state.page_size ?? 50;
			const cur_page = Math.max(1, Number(this.pagination?.page || this.state.page || 1));
			const page_offset =
				String(raw_ps).toLowerCase() === "all" || Number(raw_ps) <= 0
					? 0
					: (cur_page - 1) * Number(raw_ps);
			const seq_num = page_offset + (Number.isFinite(row_idx) ? row_idx : 0) + 1;
			return `
				<td class="ad-td-serial" dir="ltr">
					<span class="ad-serial-badge">${frappe.utils.escape_html(String(seq_num))}</span>
				</td>
			`;
		}

		if (key === "card_name") {
			const copy_badge = row.copy_label
				? `<span class="ad-copy-badge" style="margin-right:6px;">${frappe.utils.escape_html(row.copy_label)}</span>`
				: "";
			const card_display_name = row.base_card_name || row.card_name || "";
			return `
				<td class="ac-td-name" title="${frappe.utils.escape_html(card_display_name)}">
					<span class="ad-card-title-text">${frappe.utils.escape_html(card_display_name)}</span>
					${copy_badge}
				</td>
			`;
		}

		if (key === "deposit_date") {
			return `<td class="ac-td-ltr ad-td-date" dir="ltr">${frappe.utils.escape_html(
				row.deposit_date || "—"
			)}</td>`;
		}

		if (key === "card_number") {
			return `<td class="ac-td-ltr" dir="ltr">${frappe.utils.escape_html(row.card_number || "—")}</td>`;
		}

		if (key === "bank") {
			const b_name = row.bank_name || row.bank || "—";
			const tone_idx = get_bank_tone_index(b_name);
			return `
				<td class="ad-td-bank" title="${frappe.utils.escape_html(b_name)}">
					<div class="ad-bank-cell">
						<span class="ad-bank-icon tone-${tone_idx}" aria-hidden="true">${DEPOSIT_SVGS.bank_badge}</span>
						<span class="ad-bank-name" title="${frappe.utils.escape_html(b_name)}">${frappe.utils.escape_html(b_name)}</span>
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

		if (key === "card_owner") {
			const owner_display = String(row.card_owner_name || row.card_owner || "").trim() || "—";
			return `<td class="ad-td-card-owner" title="${frappe.utils.escape_html(
				owner_display
			)}"><span class="ad-card-owner-name" title="${frappe.utils.escape_html(
				owner_display
			)}">${frappe.utils.escape_html(owner_display)}</span></td>`;
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
			} else if (row.has_saved_record && saved_amount === 0 && !effective_stopped) {
				display_val = "0";
			}

			const is_card_inactive_readonly =
				row.is_currently_active === false || Boolean(row.is_historical_inactive);
			const can_edit_row_amount =
				Boolean(row.row_permissions?.can_edit_date) &&
				!is_card_inactive_readonly &&
				!is_approved &&
				!effective_stopped &&
				!this.is_saving;

			const audit_tip = this.build_audit_tooltip(row);
			const input_tip = is_card_inactive_readonly
				? [
						`البطاقة غير نشطة حالياً (${row.current_card_status || row.card_status || "موقوفة"}) — السجل التاريخي للقراءة فقط`,
						audit_tip,
				  ]
						.filter(Boolean)
						.join("\n")
				: audit_tip;
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
								data-row-key="${frappe.utils.escape_html(row_key)}"
								data-card="${frappe.utils.escape_html(row.card)}"
								data-deposit-date="${frappe.utils.escape_html(row.deposit_date || "")}"
								value="${frappe.utils.escape_html(display_val)}"
								placeholder=""
								${!can_edit_row_amount ? "disabled readonly" : ""}
								${input_tip ? `title="${frappe.utils.escape_html(input_tip)}"` : ""}
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

		if (key === "stopped_for_reason") {
			const is_card_inactive_readonly =
				row.is_currently_active === false || Boolean(row.is_historical_inactive);
			const can_toggle =
				Boolean(row.row_permissions?.can_toggle_stopped_date) &&
				!is_card_inactive_readonly &&
				!is_approved &&
				!this.is_saving;
			let disabled_title = "";
			if (is_card_inactive_readonly) {
				disabled_title = "البطاقة غير نشطة حالياً — السجل التاريخي للقراءة فقط";
			} else if (is_approved) {
				disabled_title = "الإيداع معتمد ومقفول";
			} else if (!row.row_permissions?.can_toggle_stopped_date) {
				disabled_title = "ليست لديك صلاحية لتغيير «موقف لسبب» في هذا التاريخ";
			}
			return `
				<td class="ad-td-stopped-reason">
					<label class="ad-stopped-reason-label" ${
						disabled_title ? `title="${frappe.utils.escape_html(disabled_title)}"` : ""
					}>
						<input
							type="checkbox"
							class="ad-stopped-reason-checkbox"
							aria-label="موقف لسبب"
							data-row-key="${frappe.utils.escape_html(row_key)}"
							data-card="${frappe.utils.escape_html(row.card)}"
							data-deposit-date="${frappe.utils.escape_html(row.deposit_date || "")}"
							${effective_stopped ? "checked" : ""}
							${!can_toggle ? "disabled" : ""}
						/>
					</label>
				</td>
			`;
		}

		if (key === "status") {
			let pill_class = "is-not-deposited";
			let pill_icon = DEPOSIT_SVGS.status_cross;
			let pill_label = "لم يتم الإيداع";

			if (effective_stopped) {
				pill_class = "is-stopped-reason";
				pill_icon = DEPOSIT_SVGS.status_pause;
				pill_label = "موقف لسبب";
			} else if (effective_amount > 0) {
				pill_class = "is-deposited";
				pill_icon = DEPOSIT_SVGS.status_check;
				pill_label = "تم الإيداع";
			}

			return `
				<td class="ad-td-status">
					<div class="ad-status-wrap">
						<span class="ad-status-pill ${pill_class}">
							<span class="ad-status-pill-icon" aria-hidden="true">
								${pill_icon}
							</span>
							<span>${pill_label}</span>
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

		if (key === "approval") {
			const is_busy_approving = this.approving_keys.has(row_key);
			const can_approve_date = Boolean(row.row_permissions?.can_approve_date);
			let approval_html = "";

			if (is_approved) {
				if (can_approve_date) {
					approval_html = `
						<button
							type="button"
							class="btn btn-xs ad-approval-btn ad-unapprove-btn"
							data-action="unapprove-deposit"
							data-row-key="${frappe.utils.escape_html(row_key)}"
							data-card="${frappe.utils.escape_html(row.card)}"
							data-deposit-date="${frappe.utils.escape_html(row.deposit_date || "")}"
							${is_busy_approving || this.is_saving ? "disabled" : ""}
							title="إلغاء اعتماد هذا الإيداع"
						>إلغاء الاعتماد</button>
					`;
				} else {
					approval_html = `<span class="ad-approved-badge" title="تم اعتماد هذا الإيداع">معتمد</span>`;
				}
			} else if (can_approve_date) {
				const can_click_approve =
					Boolean(row.has_saved_record) &&
					saved_amount > 0 &&
					!effective_stopped &&
					!is_dirty &&
					!is_busy_approving &&
					!this.is_saving;
				const approve_title = is_dirty
					? "احفظ التعديلات أولاً قبل الاعتماد"
					: saved_amount <= 0
					? "يتطلب حفظ مبلغ إيداع أكبر من صفر أولاً"
					: "اعتماد الإيداع المحفوظ";
				approval_html = `
					<button
						type="button"
						class="btn btn-xs ad-approval-btn ad-approve-btn"
						data-action="approve-deposit"
						data-row-key="${frappe.utils.escape_html(row_key)}"
						data-card="${frappe.utils.escape_html(row.card)}"
						data-deposit-date="${frappe.utils.escape_html(row.deposit_date || "")}"
						${can_click_approve ? "" : "disabled"}
						title="${frappe.utils.escape_html(approve_title)}"
					>اعتماد</button>
				`;
			}

			return `
				<td class="ad-td-approval">
					<div class="ad-approval-wrap">
						${approval_html || '<span class="ad-approval-empty">—</span>'}
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
