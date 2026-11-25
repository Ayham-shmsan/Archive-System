const ARCHIVE_GENERAL_SETTINGS_FIELDS = [
	"general_settings_tab",
	"fiscal_years_section",
	"default_fiscal_year",
	"fiscal_years_manager_html",
	"customer_rate_limits_section",
	"saudi_customer_rate_min",
	"customer_rate_limits_col_break",
	"saudi_customer_rate_max",
	"bank_transfer_rate_limits_section",
	"bank_transfer_rate_min",
	"bank_transfer_rate_limits_col_break",
	"bank_transfer_rate_max",
	"sender_account_validation_section",
	"enable_sender_account_validation",
	"final_swift_section",
	"final_swift_banks",
];

const ARCHIVE_BACKUP_VISIBLE_FIELDS = [
	"backup_settings_tab",
	"backup_settings_section",
	"backup_dashboard_html",
];

const ARCHIVE_BACKUP_HIDDEN_DATA_FIELDS = [
	"backup_enabled",
	"backup_destination_path",
	"backup_require_mount",
	"backup_mode",
	"backup_interval_value",
	"backup_interval_unit",
	"backup_enable_retention",
	"backup_max_keep",
	"backup_pigz_threads",
	"backup_min_free_space_gb",
	"backup_last_run_at",
	"backup_last_status",
	"backup_next_run_at",
	"backup_last_output_path",
];

const BK_ICONS = {
	shieldDb: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
	database: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>`,
	files: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
	hardDrive: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>`,
	usb: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="7" r="1"/><circle cx="4" cy="20" r="1"/><path d="M4.7 19.3 19 5"/><path d="m21 3-3 1 2 2Z"/><path d="M9.26 7.68 5 12l2 5"/><path d="m10 14 5 2 3.5-3.5"/><path d="m18 12 1-1 1 1-1 1Z"/></svg>`,
	network: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`,
	folderSearch: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/></svg>`,
	folder: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
	folderPlus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
	clock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
	calendarClock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><circle cx="16" cy="16" r="6"/><path d="M16 14v2.2l1.6 1"/></svg>`,
	zap: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
	archive: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
	sync: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`,
	play: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
	download: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
	save: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
	shieldCheck: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
	checkCircle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
	alertTriangle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
	refresh: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
	history: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
	arrowUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
	lock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
	trashShield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
	copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
	sliders: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>`,
	backupTab: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>`,
};

const SCHEDULE_PRESETS = [
	{ value: 15, unit: "دقائق", label: "كل 15 دقيقة" },
	{ value: 30, unit: "دقائق", label: "كل 30 دقيقة" },
	{ value: 1, unit: "ساعات", label: "كل ساعة" },
	{ value: 3, unit: "ساعات", label: "كل 3 ساعات" },
	{ value: 6, unit: "ساعات", label: "كل 6 ساعات" },
	{ value: 12, unit: "ساعات", label: "كل 12 ساعة" },
	{ value: 1, unit: "أيام", label: "يومياً" },
];

const BACKUP_MODE_OPTIONS = [
	{
		value: "حزمة كاملة سريعة (.tar ذكي)",
		title: "حزمة كاملة سريعة (.tar ذكي)",
		tag: "الأسرع · موصى به",
		icon: "zap",
		desc: "يضغط قاعدة البيانات بنسبة ~98% ويضم كافة ملفات الموقع في ملف واحد فوري دون إجهاد المعالج.",
	},
	{
		value: "حزمة كاملة مضغوطة (.tar.gz)",
		title: "حزمة كاملة مضغوطة (.tar.gz)",
		tag: "أصغر حجماً",
		icon: "archive",
		desc: "يُنتج ملفاً واحداً مضغوطاً بالكامل مناسب للأرشفة الطويلة أو النقل السحابي.",
	},
	{
		value: "مزامنة تفاضلية سريعة + لقطات القاعدة",
		title: "مزامنة تفاضلية + لقطات القاعدة",
		tag: "مثالي للتكرار السريع",
		icon: "sync",
		desc: "ينسخ الملفات الجديدة فقط كل دورة مع حفظ لقطات زمنية مستقلة للقاعدة وتصدير (.tar) بأي وقت.",
	},
];

function formatArabicInterval(val, unit) {
	const n = Math.max(1, parseInt(val, 10) || 1);
	if (unit === "دقائق") {
		if (n === 1) return "دقيقة واحدة";
		if (n === 2) return "دقيقتين";
		if (n >= 3 && n <= 10) return `${n} دقائق`;
		return `${n} دقيقة`;
	}
	if (unit === "أيام") {
		if (n === 1) return "يوم واحد";
		if (n === 2) return "يومين";
		if (n >= 3 && n <= 10) return `${n} أيام`;
		return `${n} يوماً`;
	}
	if (n === 1) return "ساعة واحدة";
	if (n === 2) return "ساعتين";
	if (n >= 3 && n <= 10) return `${n} ساعات`;
	return `${n} ساعة`;
}

function formatBackupSizeMB(mb) {
	const num = Number(mb || 0);
	if (!Number.isFinite(num) || num <= 0) return "0 MB";
	if (num >= 1024) return `${(num / 1024).toFixed(2)} GB`;
	return `${num.toFixed(2)} MB`;
}

function getStorageBarClass(pct) {
	const n = Number(pct || 0);
	if (n >= 88) return "abk-bar__fill--crit";
	if (n >= 72) return "abk-bar__fill--warn";
	return "abk-bar__fill--ok";
}

function getCategoryIcon(category) {
	if (category === "network") return BK_ICONS.network;
	if (category === "external") return BK_ICONS.usb;
	return BK_ICONS.hardDrive;
}

frappe.ui.form.on("Archive Settings", {
	setup(frm) {
		frm.set_query("default_fiscal_year", () => ({
			filters: { is_closed: 0 },
		}));
	},

	refresh(frm) {
		const applyTabVisibilityAndDecor = (canGeneral, canBackup) => {
			if (frm.$wrapper) {
				frm.$wrapper.addClass("archive-settings-tabbed-form");
			}
			const tabs = (frm.layout && Array.isArray(frm.layout.tabs) && frm.layout.tabs) || [];
			let generalTab = null;
			let backupTab = null;

			tabs.forEach((tab) => {
				const fn = tab && tab.df && tab.df.fieldname;
				if (fn === "general_settings_tab") {
					generalTab = tab;
					tab.toggle(Boolean(canGeneral));
					const $btn = tab.tab_link && tab.tab_link.find(".nav-link");
					if ($btn && $btn.length && !$btn.find(".abk-tab-icon").length) {
						$btn.prepend(`<span class="abk-icon abk-tab-icon">${BK_ICONS.sliders}</span>`);
					}
				} else if (fn === "backup_settings_tab") {
					backupTab = tab;
					tab.toggle(Boolean(canBackup));
					const $btn = tab.tab_link && tab.tab_link.find(".nav-link");
					if ($btn && $btn.length && !$btn.find(".abk-tab-icon").length) {
						$btn.prepend(`<span class="abk-icon abk-tab-icon">${BK_ICONS.backupTab}</span>`);
					}
				}
			});

			// Ensure the active tab is always one the user is allowed to view
			if (canBackup && !canGeneral && backupTab) {
				backupTab.set_active();
			} else if (canGeneral && !canBackup && generalTab) {
				generalTab.set_active();
			} else if (generalTab && backupTab && !generalTab.is_active() && !backupTab.is_active()) {
				generalTab.set_active();
			}
		};

		// Always keep raw backup data fields hidden; hide backup tab until server confirms role
		ARCHIVE_BACKUP_HIDDEN_DATA_FIELDS.forEach((fn) => frm.toggle_display(fn, false));
		ARCHIVE_BACKUP_VISIBLE_FIELDS.forEach((fn) => frm.toggle_display(fn, false));
		applyTabVisibilityAndDecor(true, false);

		frappe.call({
			method: "archive.services.backup_manager.get_backup_ui_context",
			callback(r) {
				const ctx = (r && r.message) || {};
				const canGeneral = Boolean(ctx.can_manage_general_settings);
				const canBackup = Boolean(ctx.can_manage_backups);

				ARCHIVE_GENERAL_SETTINGS_FIELDS.forEach((fn) => frm.toggle_display(fn, canGeneral));
				ARCHIVE_BACKUP_VISIBLE_FIELDS.forEach((fn) => frm.toggle_display(fn, canBackup));
				ARCHIVE_BACKUP_HIDDEN_DATA_FIELDS.forEach((fn) => frm.toggle_display(fn, false));
				applyTabVisibilityAndDecor(canGeneral, canBackup);

				if (canGeneral) {
					frm.trigger("render_fiscal_years_manager");
				} else {
					const fyField = frm.get_field("fiscal_years_manager_html");
					if (fyField && fyField.$wrapper) fyField.$wrapper.empty();
				}

				if (canBackup) {
					frm._backupUiContext = ctx;
					frm._backupStoragePreview = ctx.destination_storage || null;
					frm.trigger("render_backup_dashboard");
				} else {
					const bkField = frm.get_field("backup_dashboard_html");
					if (bkField && bkField.$wrapper) bkField.$wrapper.empty();
				}
			},
		});
	},

	render_backup_dashboard(frm) {
		const field = frm.get_field("backup_dashboard_html");
		if (!field || !field.$wrapper) return;

		const $wrap = field.$wrapper;
		const ctx = frm._backupUiContext || {};
		const settings = ctx.settings || {};

		// Read current form values (falling back gracefully to saved server settings)
		const getCurrentDraft = () => ({
			enabled: Boolean(Number(frm.doc.backup_enabled)),
			destination_path: String(frm.doc.backup_destination_path || "").trim(),
			require_mount: Boolean(Number(frm.doc.backup_require_mount)),
			backup_mode:
				String(frm.doc.backup_mode || "").trim() ||
				settings.backup_mode_label ||
				"حزمة كاملة سريعة (.tar ذكي)",
			interval_value: Math.max(1, parseInt(frm.doc.backup_interval_value || settings.interval_value || 6, 10) || 6),
			interval_unit:
				String(frm.doc.backup_interval_unit || "").trim() ||
				settings.interval_unit ||
				"ساعات",
			enable_retention:
				frm.doc.backup_enable_retention === undefined || frm.doc.backup_enable_retention === null
					? Boolean(settings.enable_retention)
					: Boolean(Number(frm.doc.backup_enable_retention)),
			max_keep: Math.max(1, parseInt(frm.doc.backup_max_keep || settings.max_keep || 10, 10) || 10),
		});

		const setDocField = (fn, val) => {
			if (frm.doc[fn] !== val) {
				frm.doc[fn] = val;
				if (window.locals && locals[frm.doctype] && locals[frm.doctype][frm.docname]) {
					locals[frm.doctype][frm.docname][fn] = val;
				}
				const p = frm.set_value(fn, val);
				frm.dirty();
				if (p && typeof p.then === "function") {
					p.then(() => updateDynamicPieces());
				}
			}
			updateDynamicPieces();
		};

		const renderStatusBadge = (status) => {
			const s = String(status || "").trim();
			const map = {
				Success: { label: "نجح", cls: "abk-pill--active" },
				Failed: { label: "فشل", cls: "abk-pill--failed" },
				Running: { label: "قيد التنفيذ", cls: "abk-pill--running" },
				Queued: { label: "في الانتظار", cls: "abk-pill--dirty" },
				Skipped: { label: "تم التخطي", cls: "abk-pill--paused" },
			};
			const cfg = map[s] || { label: s || "—", cls: "abk-pill--paused" };
			return `<span class="abk-pill ${cfg.cls}"><span class="abk-dot ${s === "Running" ? "abk-dot--pulse" : ""}"></span>${frappe.utils.escape_html(cfg.label)}</span>`;
		};

		const formatTrigger = (t) => {
			if (t === "Scheduled") return "مجدول تلقائياً";
			if (t === "Manual") return "تشغيل يدوي";
			if (t === "Manual Export") return "تصدير حزمة";
			return frappe.utils.escape_html(t || "—");
		};

		const renderStorageSummaryHtml = (st) => {
			if (!st) {
				return `
					<div class="abk-storage-box">
						<div class="abk-storage-box__meta" style="color:var(--archive-slate-500, #64748b); font-weight:600;">
							<span class="abk-icon">${BK_ICONS.hardDrive}</span>
							<span>اختر القرص والمجلد من زر «استعراض الأقراص والمجلدات» لعرض المساحة الحرة ونوع التخزين تلقائياً.</span>
						</div>
					</div>
				`;
			}
			const pct = Math.min(100, Math.max(0, Number(st.used_percent || 0)));
			const barCls = getStorageBarClass(pct);
			const iconSvg = getCategoryIcon(st.category);
			const fatWarn = st.is_fat32
				? `<div style="font-size:11px; color:#b45309; font-weight:700; margin-top:2px;">تنبيه: نظام ملفات FAT32 لا يدعم ملفاً واحداً أكبر من 4 GB؛ يُنصح بـ exFAT أو NTFS أو ext4.</div>`
				: "";
			const existsTag = st.exists
				? `<span class="abk-pill abk-pill--active" style="padding:2px 8px;">جاهز للكتابة</span>`
				: `<span class="abk-pill abk-pill--dirty" style="padding:2px 8px;">سيُنشأ تلقائياً</span>`;
			return `
				<div class="abk-storage-box">
					<div class="abk-storage-box__top">
						<div class="abk-storage-box__meta">
							<span class="abk-icon" style="color:#2563eb;">${iconSvg}</span>
							<span>${frappe.utils.escape_html(st.title || st.category_label || "وحدة التخزين")}</span>
							<span class="abk-fs-tag">${frappe.utils.escape_html(st.fstype || "disk")}</span>
						</div>
						${existsTag}
					</div>
					<div class="abk-bar"><div class="abk-bar__fill ${barCls}" style="width:${pct}%"></div></div>
					<div class="abk-storage-box__nums">
						<span>المتاح: <b style="color:#0f172a;">${Number(st.free_gb || 0).toFixed(2)} GB</b> من أصل ${Number(st.total_gb || 0).toFixed(2)} GB</span>
						<span dir="ltr" style="font-family:ui-monospace,monospace;">${frappe.utils.escape_html(st.mountpoint || "/")} · ${pct}%</span>
					</div>
					${fatWarn}
				</div>
			`;
		};

		const renderFullControlCenter = (data) => {
			const fp = data.footprint || {};
			const srvSettings = data.settings || {};
			const logs = Array.isArray(data.logs) ? data.logs : [];
			const isRunning = Boolean(data.is_running);
			const draft = getCurrentDraft();

			// Sync live readonly metadata fields silently without dirtying the form
			[
				["backup_last_run_at", srvSettings.last_run_at || ""],
				["backup_last_status", srvSettings.last_status || ""],
				["backup_next_run_at", srvSettings.next_run_at || ""],
				["backup_last_output_path", srvSettings.last_output_path || ""],
			].forEach(([fn, val]) => {
				frm.doc[fn] = val;
			});

			const lastStatusOk = srvSettings.last_status === "نجح";
			const lastStatusFail = srvSettings.last_status === "فشل";
			const lastRunDisplay = srvSettings.last_run_at
				? frappe.datetime.str_to_user(srvSettings.last_run_at)
				: "لم يُشغّل بعد";
			const lastStatusSub = srvSettings.last_status
				? `الحالة: ${srvSettings.last_status}`
				: "جاهز لأول نسخة";

			const nextRunDisplay = srvSettings.enabled
				? srvSettings.next_run_at
					? frappe.datetime.str_to_user(srvSettings.next_run_at)
					: "عند أول دورة"
				: "الجدولة متوقفة";

			const heroStatusPill = isRunning
				? `<span class="abk-pill abk-pill--running"><span class="abk-dot abk-dot--pulse"></span>جاري تنفيذ نسخة الآن...</span>`
				: draft.enabled
				? `<span class="abk-pill abk-pill--active"><span class="abk-dot"></span>الجدولة التلقائية مفعّلة</span>`
				: `<span class="abk-pill abk-pill--paused"><span class="abk-dot"></span>الجدولة متوقفة</span>`;

			const presetsHtml = SCHEDULE_PRESETS.map((p) => {
				const active = draft.interval_value === p.value && draft.interval_unit === p.unit;
				return `<button type="button" class="abk-preset-chip ${active ? "is-active" : ""}" data-val="${p.value}" data-unit="${p.unit}">${p.label}</button>`;
			}).join("");

			const unitsHtml = ["دقائق", "ساعات", "أيام"]
				.map(
					(u) =>
						`<button type="button" class="abk-seg__btn ${draft.interval_unit === u ? "is-active" : ""}" data-unit="${u}">${u}</button>`
				)
				.join("");

			const modesHtml = BACKUP_MODE_OPTIONS.map((m) => {
				const selected = draft.backup_mode === m.value;
				return `
					<div class="abk-mode-card ${selected ? "is-selected" : ""}" data-mode="${frappe.utils.escape_html(m.value)}" role="button" tabindex="0">
						<div class="abk-mode-card__top">
							<span class="abk-mode-card__icon">${BK_ICONS[m.icon]}</span>
							<span class="abk-mode-card__tag">${frappe.utils.escape_html(m.tag)}</span>
						</div>
						<div class="abk-mode-card__title">${frappe.utils.escape_html(m.title)}</div>
						<div class="abk-mode-card__desc">${frappe.utils.escape_html(m.desc)}</div>
					</div>
				`;
			}).join("");

			const rowsHtml = logs.length
				? logs
						.map((row) => {
							const started = row.started_at ? frappe.datetime.str_to_user(row.started_at) : "—";
							const dur =
								row.duration_seconds != null && Number(row.duration_seconds) > 0
									? `${Number(row.duration_seconds).toFixed(1)} ث`
									: "—";
							const sizeCell =
								row.status === "Success"
									? `<div style="font-weight:800; color:#0f172a;">${formatBackupSizeMB(row.total_size_mb)}</div>
									   <div style="font-size:11px; color:#64748b;">القاعدة: ${formatBackupSizeMB(row.db_size_mb)} · الملفات: ${formatBackupSizeMB(row.files_size_mb)}</div>`
									: "—";
							const outPath = row.output_path || row.destination_path || "—";
							const errLine =
								row.error_message && row.status === "Failed"
									? `<div style="font-size:11px; color:#dc2626; margin-top:4px; white-space:normal;">${frappe.utils.escape_html(String(row.error_message).slice(0, 220))}</div>`
									: "";
							const actions =
								row.status === "Success" && row.output_path
									? `<div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
											<button type="button" class="abk-btn abk-btn--sm abk-btn--soft-blue abk-verify-btn" data-path="${frappe.utils.escape_html(row.output_path)}">
												<span class="abk-icon">${BK_ICONS.shieldCheck}</span>
												<span>فحص السلامة</span>
											</button>
											<button type="button" class="abk-btn abk-btn--sm abk-copy-path-btn" data-path="${frappe.utils.escape_html(row.output_path)}" title="نسخ المسار">
												<span class="abk-icon">${BK_ICONS.copy}</span>
											</button>
									   </div>`
									: "";
							return `
								<tr>
									<td style="white-space:nowrap; font-weight:600;">${frappe.utils.escape_html(started)}</td>
									<td>${formatTrigger(row.trigger_type)}</td>
									<td>${frappe.utils.escape_html(row.backup_mode || "—")}</td>
									<td>${renderStatusBadge(row.status)}</td>
									<td style="white-space:nowrap;">${frappe.utils.escape_html(dur)}</td>
									<td style="white-space:nowrap;">${sizeCell}</td>
									<td style="text-align:center; font-weight:700;">${Number(row.retention_deleted_count || 0)}</td>
									<td style="min-width:220px; max-width:300px;">
										<div class="abk-path-cell">${frappe.utils.escape_html(outPath)}</div>
										${errLine}
										${actions}
									</td>
								</tr>
							`;
						})
						.join("")
				: `<tr><td colspan="8" style="text-align:center; padding:26px; color:#64748b;">لا توجد عمليات نسخ احتياطي مسجلة حتى الآن. اختر المسار ثم اضغط «نسخ احتياطي الآن» أو فعّل الجدولة التلقائية.</td></tr>`;

			$wrap.html(`
				<div class="abk-root">
					<!-- 1. Hero Header -->
					<div class="abk-hero">
						<div class="abk-hero__brand">
							<div class="abk-hero__icon-badge">${BK_ICONS.shieldDb}</div>
							<div>
								<div class="abk-hero__title-row">
									<h3 class="abk-hero__title">مركز التحكم بالنسخ الاحتياطي التلقائي</h3>
									<span class="abk-hero-status-slot">${heroStatusPill}</span>
									<span class="abk-pill abk-pill--dirty abk-dirty-badge" style="display:${frm.is_dirty() ? "inline-flex" : "none"};">تغييرات غير محفوظة</span>
								</div>
								<p class="abk-hero__subtitle">نسخ آمن ومجدول لقاعدة البيانات وكافة ملفات ومرفقات النظام على القرص الداخلي أو هارد خارجي أو الشبكة</p>
							</div>
						</div>
						<div class="abk-hero__actions">
							<button type="button" class="abk-btn abk-btn--save abk-save-btn">
								<span class="abk-icon">${BK_ICONS.save}</span>
								<span>حفظ الإعدادات</span>
							</button>
							<button type="button" class="abk-btn abk-btn--primary abk-run-now-btn" ${isRunning ? "disabled" : ""}>
								<span class="abk-icon">${BK_ICONS.play}</span>
								<span>نسخ احتياطي الآن</span>
							</button>
							<button type="button" class="abk-btn abk-btn--soft-blue abk-export-tar-btn" ${isRunning ? "disabled" : ""}>
								<span class="abk-icon">${BK_ICONS.download}</span>
								<span>تصدير حزمة (.tar)</span>
							</button>
						</div>
					</div>

					<!-- 2. KPI Strip -->
					<div class="abk-kpis">
						<div class="abk-kpi">
							<div class="abk-kpi__icon abk-kpi__icon--blue">${BK_ICONS.database}</div>
							<div>
								<div class="abk-kpi__label">حجم قاعدة البيانات</div>
								<div class="abk-kpi__val">${formatBackupSizeMB(fp.db_raw_mb)}</div>
								<div class="abk-kpi__meta">تُضغط تلقائياً بنسبة ~98%</div>
							</div>
						</div>
						<div class="abk-kpi">
							<div class="abk-kpi__icon abk-kpi__icon--indigo">${BK_ICONS.files}</div>
							<div>
								<div class="abk-kpi__label">ملفات ومرفقات النظام</div>
								<div class="abk-kpi__val">${formatBackupSizeMB(fp.files_mb)}</div>
								<div class="abk-kpi__meta">${Number(fp.files_count || 0).toLocaleString("en-US")} ملف (عام + خاص)</div>
							</div>
						</div>
						<div class="abk-kpi">
							<div class="abk-kpi__icon ${lastStatusFail ? "abk-kpi__icon--rose" : lastStatusOk ? "abk-kpi__icon--emerald" : "abk-kpi__icon--amber"}">
								${lastStatusFail ? BK_ICONS.alertTriangle : BK_ICONS.checkCircle}
							</div>
							<div>
								<div class="abk-kpi__label">آخر عملية نسخ</div>
								<div class="abk-kpi__val" style="font-size:13px;">${frappe.utils.escape_html(lastRunDisplay)}</div>
								<div class="abk-kpi__meta">${frappe.utils.escape_html(lastStatusSub)}</div>
							</div>
						</div>
						<div class="abk-kpi">
							<div class="abk-kpi__icon abk-kpi__icon--amber">${BK_ICONS.calendarClock}</div>
							<div>
								<div class="abk-kpi__label">موعد النسخة القادمة</div>
								<div class="abk-kpi__val" style="font-size:13px;">${frappe.utils.escape_html(nextRunDisplay)}</div>
								<div class="abk-kpi__meta abk-kpi-interval-meta"></div>
							</div>
						</div>
					</div>

					<!-- 3. Main Configuration Cards (Destination + Schedule) -->
					<div class="abk-grid">
						<!-- Card A: Destination & Storage Browser -->
						<div class="abk-card">
							<div class="abk-card__header">
								<div class="abk-card__title-wrap">
									<div class="abk-card__icon">${BK_ICONS.hardDrive}</div>
									<div>
										<h4 class="abk-card__title">القرص ومجلد حفظ النسخ الاحتياطي</h4>
										<p class="abk-card__desc">تصفّح ذاكرة السيرفر أو الأقراص الخارجية (USB) أو الشبكة واختر المجلد مباشرة</p>
									</div>
								</div>
							</div>

							<div class="abk-path-row">
								<input
									type="text"
									class="abk-path-input"
									placeholder="/mnt/backup/archive"
									value="${frappe.utils.escape_html(draft.destination_path)}"
								/>
								<button type="button" class="abk-btn abk-btn--primary abk-browse-btn">
									<span class="abk-icon">${BK_ICONS.folderSearch}</span>
									<span>استعراض الأقراص والمجلدات</span>
								</button>
								<button type="button" class="abk-btn abk-test-path-btn" title="فحص صلاحية الكتابة والمساحة الحرة">
									<span class="abk-icon">${BK_ICONS.shieldCheck}</span>
									<span>فحص</span>
								</button>
							</div>

							<div class="abk-storage-preview-slot">
								${renderStorageSummaryHtml(frm._backupStoragePreview)}
							</div>

							<div class="abk-option-strip">
								<div>
									<div class="abk-option-strip__text">حماية اتصال القرص الخارجي / الشبكي (Mount Point)</div>
									<div class="abk-option-strip__sub">يوقف النسخ تلقائياً إذا فُصل الهارد الخارجي أو الشبكة لمنع الكتابة على القرص الداخلي</div>
								</div>
								<label class="abk-switch">
									<input type="checkbox" class="abk-require-mount-cb" ${draft.require_mount ? "checked" : ""} />
									<span class="abk-switch__track"></span>
								</label>
							</div>
						</div>

						<!-- Card B: Schedule & Timing -->
						<div class="abk-card">
							<div class="abk-card__header">
								<div class="abk-card__title-wrap">
									<div class="abk-card__icon">${BK_ICONS.clock}</div>
									<div>
										<h4 class="abk-card__title">توقيت وجدولة النسخ التلقائي</h4>
										<p class="abk-card__desc">حدّد كل كم دقيقة أو ساعة أو يوم يتم إنشاء نسخة احتياطية تلقائياً</p>
									</div>
								</div>
								<label class="abk-switch">
									<input type="checkbox" class="abk-enabled-cb" ${draft.enabled ? "checked" : ""} />
									<span class="abk-switch__track"></span>
									<span class="abk-switch__label abk-enabled-text">${draft.enabled ? "مفعّل" : "متوقف"}</span>
								</label>
							</div>

							<div>
								<div style="font-size:11.5px; font-weight:700; color:#64748b; margin-bottom:8px;">اختيارات سريعة:</div>
								<div class="abk-presets">${presetsHtml}</div>
							</div>

							<div class="abk-schedule-custom">
								<span class="abk-schedule-custom__label">إنشاء نسخة احتياطية تلقائية كل:</span>
								<div class="abk-schedule-controls">
									<div class="abk-stepper">
										<button type="button" class="abk-stepper__btn abk-int-minus" aria-label="إنقاص">−</button>
										<input type="number" min="1" max="999" step="1" class="abk-stepper__input abk-int-input" value="${draft.interval_value}" />
										<button type="button" class="abk-stepper__btn abk-int-plus" aria-label="زيادة">+</button>
									</div>
									<div class="abk-seg abk-unit-seg">${unitsHtml}</div>
								</div>
							</div>

							<div class="abk-schedule-summary-slot"></div>
						</div>
					</div>

					<!-- 4. Mode & Auto-Retention Card -->
					<div class="abk-card">
						<div class="abk-card__header">
							<div class="abk-card__title-wrap">
								<div class="abk-card__icon">${BK_ICONS.archive}</div>
								<div>
									<h4 class="abk-card__title">نوع الحزمة وسياسة الاحتفاظ بالنسخ القديمة</h4>
									<p class="abk-card__desc">اختر آلية الحفظ الأنسب لحجم ملفاتك وتكرار النسخ، مع إدارة تلقائية للمساحة</p>
								</div>
							</div>
						</div>

						<div class="abk-modes">${modesHtml}</div>

						<div class="abk-retention-bar">
							<div class="abk-retention-bar__right">
								<span class="abk-icon" style="color:#475569;">${BK_ICONS.trashShield}</span>
								<label class="abk-switch">
									<input type="checkbox" class="abk-retention-cb" ${draft.enable_retention ? "checked" : ""} />
									<span class="abk-switch__track"></span>
									<span class="abk-switch__label">تفعيل الحذف التلقائي للنسخ الأقدم</span>
								</label>
								<span style="font-size:11.5px; color:#64748b;">(يحذف أقدم نسخ هذا الموقع فقط وبعد التأكد من نجاح النسخة الجديدة)</span>
							</div>
							<div class="abk-retention-keep-wrap" style="display:${draft.enable_retention ? "inline-flex" : "none"}; align-items:center; gap:8px;">
								<span style="font-size:12px; font-weight:700; color:#334155;">الاحتفاظ بآخر:</span>
								<div class="abk-stepper">
									<button type="button" class="abk-stepper__btn abk-keep-minus" aria-label="إنقاص">−</button>
									<input type="number" min="1" max="365" step="1" class="abk-stepper__input abk-keep-input" value="${draft.max_keep}" />
									<button type="button" class="abk-stepper__btn abk-keep-plus" aria-label="زيادة">+</button>
								</div>
								<span style="font-size:12px; font-weight:700; color:#334155;">نسخ</span>
							</div>
						</div>
					</div>

					<!-- Diagnostic Slot -->
					<div class="abk-diag-slot"></div>

					<!-- 5. Backup History Log Table -->
					<div class="abk-card">
						<div class="abk-card__header">
							<div class="abk-card__title-wrap">
								<div class="abk-card__icon">${BK_ICONS.history}</div>
								<div>
									<h4 class="abk-card__title">سجل عمليات النسخ الاحتياطي الأخيرة</h4>
									<p class="abk-card__desc">توثيق غير قابل للتعديل لكل نسخة مع فحص فوري للسلامة وبصمة SHA-256</p>
								</div>
							</div>
							<button type="button" class="abk-btn abk-btn--sm abk-refresh-logs-btn">
								<span class="abk-icon">${BK_ICONS.refresh}</span>
								<span>تحديث السجل</span>
							</button>
						</div>

						<div class="abk-table-wrap">
							<table class="abk-table">
								<thead>
									<tr>
										<th>وقت البدء</th>
										<th>نوع التشغيل</th>
										<th>الوضع</th>
										<th>الحالة</th>
										<th>المدة</th>
										<th>الحجم</th>
										<th style="text-align:center;">محذوف بالاحتفاظ</th>
										<th>المسار والتحقق</th>
									</tr>
								</thead>
								<tbody>${rowsHtml}</tbody>
							</table>
						</div>
					</div>
				</div>
			`);

			updateDynamicPieces();
		};

		const updateDynamicPieces = () => {
			const draft = getCurrentDraft();
			const humanInterval = formatArabicInterval(draft.interval_value, draft.interval_unit);

			$wrap.find(".abk-dirty-badge").css("display", frm.is_dirty() ? "inline-flex" : "none");
			$wrap.find(".abk-enabled-text").text(draft.enabled ? "مفعّل" : "متوقف");

			const isRunning = Boolean((frm._backupUiContext || {}).is_running);
			if (!isRunning) {
				$wrap.find(".abk-hero-status-slot").html(
					draft.enabled
						? `<span class="abk-pill abk-pill--active"><span class="abk-dot"></span>الجدولة التلقائية مفعّلة</span>`
						: `<span class="abk-pill abk-pill--paused"><span class="abk-dot"></span>الجدولة متوقفة</span>`
				);
			}

			$wrap.find(".abk-kpi-interval-meta").text(
				draft.enabled ? `التكرار: كل ${humanInterval}` : "فعّل مفتاح الجدولة للتشغيل التلقائي"
			);

			$wrap.find(".abk-preset-chip").each(function () {
				const v = parseInt($(this).attr("data-val"), 10);
				const u = String($(this).attr("data-unit") || "");
				$(this).toggleClass("is-active", v === draft.interval_value && u === draft.interval_unit);
			});

			$wrap.find(".abk-unit-seg .abk-seg__btn").each(function () {
				$(this).toggleClass("is-active", String($(this).attr("data-unit") || "") === draft.interval_unit);
			});

			if (document.activeElement !== $wrap.find(".abk-int-input").get(0)) {
				$wrap.find(".abk-int-input").val(String(draft.interval_value));
			}

			$wrap.find(".abk-retention-keep-wrap").css("display", draft.enable_retention ? "inline-flex" : "none");
			if (document.activeElement !== $wrap.find(".abk-keep-input").get(0)) {
				$wrap.find(".abk-keep-input").val(String(draft.max_keep));
			}

			$wrap.find(".abk-mode-card").each(function () {
				$(this).toggleClass("is-selected", String($(this).attr("data-mode") || "") === draft.backup_mode);
			});

			const summaryHtml = draft.enabled
				? `<div class="abk-schedule-summary">
						<span class="abk-icon">${BK_ICONS.checkCircle}</span>
						<span>سيتم إنشاء نسخة احتياطية تلقائياً كل <b>${frappe.utils.escape_html(humanInterval)}</b>${frm.is_dirty() ? " — اضغط «حفظ الإعدادات» لتطبيق الجدول." : "."}</span>
				   </div>`
				: `<div class="abk-schedule-summary is-off">
						<span class="abk-icon">${BK_ICONS.clock}</span>
						<span>التوقيت المختار: كل <b>${frappe.utils.escape_html(humanInterval)}</b> — فعّل مفتاح التشغيل أعلاه ثم اضغط «حفظ الإعدادات» لتفعيل الجدولة التلقائية.</span>
				   </div>`;
			$wrap.find(".abk-schedule-summary-slot").html(summaryHtml);
		};

		const renderDiagnostic = (kind, title, bodyHtml) => {
			const icon =
				kind === "error"
					? BK_ICONS.alertTriangle
					: kind === "warning"
					? BK_ICONS.alertTriangle
					: BK_ICONS.checkCircle;
			$wrap.find(".abk-diag-slot").html(`
				<div class="abk-diag abk-diag--${kind}">
					<span class="abk-icon" style="margin-top:2px;">${icon}</span>
					<div>
						<div style="font-weight:800; margin-bottom:3px;">${title}</div>
						<div>${bodyHtml}</div>
					</div>
				</div>
			`);
		};

		const reloadDashboard = (silent = false) => {
			frappe.call({
				method: "archive.services.backup_manager.get_backup_ui_context",
				freeze: !silent,
				callback(r) {
					const fresh = (r && r.message) || {};
					if (fresh.can_manage_backups) {
						frm._backupUiContext = fresh;
						if (fresh.destination_storage) {
							frm._backupStoragePreview = fresh.destination_storage;
						}
						renderFullControlCenter(fresh);
						if (fresh.is_running) {
							window.clearTimeout(frm._backupPollTimer);
							frm._backupPollTimer = window.setTimeout(() => reloadDashboard(true), 4000);
						}
					}
				},
			});
		};

		const openStorageFolderPicker = () => {
			let currentBrowseData = null;
			let volumesList = [];

			const d = new frappe.ui.Dialog({
				title: __("اختيار القرص ومجلد النسخ الاحتياطي"),
				size: "extra-large",
				fields: [{ fieldname: "explorer_html", fieldtype: "HTML" }],
			});

			const $m = d.fields_dict.explorer_html.$wrapper;
			$m.html(`
				<div class="abk-modal">
					<div class="abk-modal__sidebar">
						<div class="abk-modal__section-title">
							<span class="abk-icon">${BK_ICONS.hardDrive}</span>
							<span>الأقراص ووحدات التخزين</span>
						</div>
						<div class="abk-vol-list" style="display:flex; flex-direction:column; gap:8px;">
							<div style="padding:14px; text-align:center; font-size:12px; color:#64748b;">جاري فحص الأقراص...</div>
						</div>
					</div>
					<div class="abk-modal__main">
						<div class="abk-modal__toolbar">
							<div class="abk-breadcrumbs"></div>
							<div style="display:flex; align-items:center; gap:6px;">
								<button type="button" class="abk-btn abk-btn--sm abk-m-up-btn">
									<span class="abk-icon">${BK_ICONS.arrowUp}</span>
									<span>للأعلى</span>
								</button>
								<button type="button" class="abk-btn abk-btn--sm abk-btn--soft-blue abk-m-new-folder-toggle">
									<span class="abk-icon">${BK_ICONS.folderPlus}</span>
									<span>مجلد جديد</span>
								</button>
							</div>
						</div>
						<div class="abk-new-folder-bar" style="display:none;">
							<input type="text" class="abk-m-new-folder-input" placeholder="اكتب اسم المجلد الجديد (مثال: archive_backups)" />
							<button type="button" class="abk-btn abk-btn--sm abk-btn--primary abk-m-create-folder-btn">إنشاء</button>
							<button type="button" class="abk-btn abk-btn--sm abk-m-cancel-folder-btn">إلغاء</button>
						</div>
						<div class="abk-folder-list">
							<div style="grid-column:1/-1; text-align:center; padding:32px; color:#64748b; font-size:12.5px;">جاري تحميل المجلدات...</div>
						</div>
						<div class="abk-modal__footer">
							<div class="abk-modal__selected">
								<div style="font-size:11px; color:#64748b; font-weight:700;">المجلد المحدد حالياً:</div>
								<div class="abk-modal__selected-path">—</div>
								<div class="abk-modal__selected-meta" style="font-size:11px; color:#475569;"></div>
							</div>
							<div style="display:flex; align-items:center; gap:8px;">
								<button type="button" class="abk-btn abk-m-close-btn">إلغاء</button>
								<button type="button" class="abk-btn abk-btn--primary abk-m-select-btn" disabled>
									<span class="abk-icon">${BK_ICONS.checkCircle}</span>
									<span>اختيار هذا المجلد</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			`);

			const renderVolumes = (activePath) => {
				const $list = $m.find(".abk-vol-list");
				if (!volumesList.length) {
					$list.html(`<div style="padding:12px; font-size:12px; color:#64748b;">لم يتم العثور على وحدات تخزين.</div>`);
					return;
				}
				const curP = String(activePath || "");
				const html = volumesList
					.map((v) => {
						const pct = Math.min(100, Math.max(0, Number(v.used_percent || 0)));
						const barCls = getStorageBarClass(pct);
						const iconCls =
							v.category === "network"
								? "abk-vol-card__icon--network"
								: v.category === "external"
								? "abk-vol-card__icon--external"
								: "";
						const isActive =
							v.mountpoint === "/"
								? curP === "/" || (!volumesList.some((o) => o.mountpoint !== "/" && curP.startsWith(o.mountpoint)))
								: curP === v.mountpoint || curP.startsWith(v.mountpoint + "/");
						return `
							<div class="abk-vol-card ${isActive ? "is-active" : ""}" data-browse="${frappe.utils.escape_html(v.browse_path)}">
								<div class="abk-vol-card__head">
									<div class="abk-vol-card__icon ${iconCls}">${getCategoryIcon(v.category)}</div>
									<div style="min-width:0; flex:1;">
										<div class="abk-vol-card__title">${frappe.utils.escape_html(v.title)}</div>
										<div class="abk-vol-card__sub">${frappe.utils.escape_html(v.mountpoint)}</div>
									</div>
									<span class="abk-fs-tag">${frappe.utils.escape_html(v.fstype)}</span>
								</div>
								<div class="abk-bar"><div class="abk-bar__fill ${barCls}" style="width:${pct}%"></div></div>
								<div class="abk-vol-card__foot">
									<span>متاح: <b>${Number(v.free_gb).toFixed(1)} GB</b></span>
									<span>من ${Number(v.total_gb).toFixed(1)} GB</span>
								</div>
							</div>
						`;
					})
					.join("");
				$list.html(html);
			};

			const loadDir = (targetPath) => {
				$m.find(".abk-folder-list").html(
					`<div style="grid-column:1/-1; text-align:center; padding:32px; color:#64748b; font-size:12.5px;">جاري قراءة المجلدات...</div>`
				);
				frappe.call({
					method: "archive.services.backup_manager.browse_backup_directory",
					args: { path: targetPath || "" },
					callback(r) {
						const res = (r && r.message) || {};
						if (!res.ok) return;
						currentBrowseData = res;
						renderVolumes(res.current_path);

						// Breadcrumbs
						const crumbs = (res.breadcrumbs || [])
							.map(
								(c, i) =>
									`${i > 0 ? `<span class="abk-crumb-sep">/</span>` : ""}<button type="button" class="abk-crumb" data-path="${frappe.utils.escape_html(c.path)}">${frappe.utils.escape_html(c.label)}</button>`
							)
							.join("");
						$m.find(".abk-breadcrumbs").html(crumbs);
						$m.find(".abk-m-up-btn").prop("disabled", !res.parent_path);
						$m.find(".abk-m-new-folder-toggle").prop("disabled", !res.can_create_folder);
						if (!res.can_create_folder) {
							$m.find(".abk-new-folder-bar").hide();
						}

						// Folders grid
						const folders = Array.isArray(res.folders) ? res.folders : [];
						if (!folders.length) {
							$m.find(".abk-folder-list").html(
								`<div style="grid-column:1/-1; text-align:center; padding:36px; color:#64748b; font-size:12.5px;">
									لا توجد مجلدات فرعية هنا.<br>
									${res.can_create_folder ? "يمكنك اختيار هذا المجلد مباشرة أو إنشاء مجلد جديد من الزر أعلاه." : ""}
								</div>`
							);
						} else {
							const fHtml = folders
								.map((f) => {
									const bkBadge = f.has_existing_backups
										? `<span class="abk-folder-item__badge">نسخ سابقة</span>`
										: "";
									const lockBadge = !f.writable
										? `<span class="abk-icon" style="color:#94a3b8;" title="للقراءة فقط">${BK_ICONS.lock}</span>`
										: "";
									return `
										<div class="abk-folder-item" data-path="${frappe.utils.escape_html(f.path)}" title="${frappe.utils.escape_html(f.path)}">
											<span class="abk-icon abk-folder-item__icon">${BK_ICONS.folder}</span>
											<span class="abk-folder-item__name">${frappe.utils.escape_html(f.name)}</span>
											${bkBadge}
											${lockBadge}
										</div>
									`;
								})
								.join("");
							$m.find(".abk-folder-list").html(fHtml);
						}

						// Footer selection state
						$m.find(".abk-modal__selected-path").text(res.current_path || "—");
						const st = res.storage || {};
						const metaTxt = res.can_select_current
							? `متاح ${Number(st.free_gb || 0).toFixed(2)} GB من ${Number(st.total_gb || 0).toFixed(2)} GB (${st.fstype || "disk"}) · جاهز للحفظ ✓`
							: `يرجى الدخول إلى مجلد فرعي قابل للكتابة لاختياره.`;
						$m.find(".abk-modal__selected-meta").text(metaTxt);
						$m.find(".abk-m-select-btn").prop("disabled", !res.can_select_current);
					},
				});
			};

			// Bind modal interactions
			$m.on("click", ".abk-vol-card", function () {
				const p = String($(this).attr("data-browse") || "");
				if (p) loadDir(p);
			});

			$m.on("click", ".abk-crumb, .abk-folder-item", function () {
				const p = String($(this).attr("data-path") || "");
				if (p) loadDir(p);
			});

			$m.on("click", ".abk-m-up-btn", () => {
				if (currentBrowseData && currentBrowseData.parent_path) {
					loadDir(currentBrowseData.parent_path);
				}
			});

			$m.on("click", ".abk-m-new-folder-toggle", () => {
				const $bar = $m.find(".abk-new-folder-bar");
				$bar.toggle();
				if ($bar.is(":visible")) {
					$m.find(".abk-m-new-folder-input").val("").focus();
				}
			});

			$m.on("click", ".abk-m-cancel-folder-btn", () => {
				$m.find(".abk-new-folder-bar").hide();
			});

			$m.on("click", ".abk-m-create-folder-btn", () => {
				if (!currentBrowseData || !currentBrowseData.current_path) return;
				const folderName = String($m.find(".abk-m-new-folder-input").val() || "").trim();
				if (!folderName) {
					frappe.show_alert({ message: __("يرجى إدخال اسم المجلد الجديد."), indicator: "orange" });
					return;
				}
				frappe.call({
					method: "archive.services.backup_manager.create_backup_folder",
					args: { parent_path: currentBrowseData.current_path, folder_name: folderName },
					freeze: true,
					callback(r) {
						const res = (r && r.message) || {};
						if (res.ok && res.path) {
							$m.find(".abk-new-folder-bar").hide();
							frappe.show_alert({
								message: __("تم إنشاء المجلد {0} بنجاح.", [res.name]),
								indicator: "green",
							});
							loadDir(res.path);
						}
					},
				});
			});

			$m.on("keydown", ".abk-m-new-folder-input", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					$m.find(".abk-m-create-folder-btn").trigger("click");
				}
			});

			$m.on("click", ".abk-m-close-btn", () => d.hide());

			$m.on("click", ".abk-m-select-btn", () => {
				if (!currentBrowseData || !currentBrowseData.can_select_current) return;
				const chosen = currentBrowseData.current_path;
				const st = currentBrowseData.storage || null;

				$wrap.find(".abk-path-input").val(chosen);
				setDocField("backup_destination_path", chosen);

				if (st) {
					frm._backupStoragePreview = st;
					$wrap.find(".abk-storage-preview-slot").html(renderStorageSummaryHtml(st));
					const recMount = st.recommend_require_mount ? 1 : 0;
					$wrap.find(".abk-require-mount-cb").prop("checked", Boolean(recMount));
					setDocField("backup_require_mount", recMount);
				}

				frappe.show_alert({
					message: __("تم اختيار المجلد: {0}", [chosen]),
					indicator: "green",
				});
				d.hide();
			});

			d.show();

			// Load storage volumes and initial directory
			frappe.call({
				method: "archive.services.backup_manager.list_storage_volumes",
				callback(r) {
					const res = (r && r.message) || {};
					volumesList = Array.isArray(res.volumes) ? res.volumes : [];
					const initialPath = String(frm.doc.backup_destination_path || "").trim();
					loadDir(initialPath);
				},
			});
		};

		// Render initial Control Center
		renderFullControlCenter(ctx);

		// Bind delegated UI events cleanly
		$wrap.off(".archiveBk");

		$wrap.on("input.archiveBk change.archiveBk", ".abk-path-input", function () {
			setDocField("backup_destination_path", String($(this).val() || "").trim());
		});

		$wrap.on("change.archiveBk", ".abk-require-mount-cb", function () {
			setDocField("backup_require_mount", this.checked ? 1 : 0);
		});

		$wrap.on("change.archiveBk", ".abk-enabled-cb", function () {
			setDocField("backup_enabled", this.checked ? 1 : 0);
		});

		$wrap.on("click.archiveBk", ".abk-preset-chip", function () {
			const val = Math.max(1, parseInt($(this).attr("data-val"), 10) || 1);
			const unit = String($(this).attr("data-unit") || "ساعات");
			setDocField("backup_interval_value", val);
			setDocField("backup_interval_unit", unit);
		});

		$wrap.on("click.archiveBk", ".abk-int-minus", () => {
			const cur = Math.max(1, parseInt(frm.doc.backup_interval_value || 6, 10) || 6);
			setDocField("backup_interval_value", Math.max(1, cur - 1));
		});

		$wrap.on("click.archiveBk", ".abk-int-plus", () => {
			const cur = Math.max(1, parseInt(frm.doc.backup_interval_value || 6, 10) || 6);
			setDocField("backup_interval_value", Math.min(999, cur + 1));
		});

		$wrap.on("input.archiveBk change.archiveBk", ".abk-int-input", function (e) {
			const raw = String($(this).val() || "").replace(/[^0-9]/g, "");
			if (!raw && e.type === "input") return;
			const clean = Math.min(999, Math.max(1, parseInt(raw, 10) || 1));
			if (e.type === "change") $(this).val(String(clean));
			setDocField("backup_interval_value", clean);
		});

		$wrap.on("click.archiveBk", ".abk-unit-seg .abk-seg__btn", function () {
			const unit = String($(this).attr("data-unit") || "ساعات");
			setDocField("backup_interval_unit", unit);
		});

		$wrap.on("click.archiveBk keydown.archiveBk", ".abk-mode-card", function (e) {
			if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			const mode = String($(this).attr("data-mode") || "");
			if (mode) setDocField("backup_mode", mode);
		});

		$wrap.on("change.archiveBk", ".abk-retention-cb", function () {
			setDocField("backup_enable_retention", this.checked ? 1 : 0);
		});

		$wrap.on("click.archiveBk", ".abk-keep-minus", () => {
			const cur = Math.max(1, parseInt(frm.doc.backup_max_keep || 10, 10) || 10);
			setDocField("backup_max_keep", Math.max(1, cur - 1));
		});

		$wrap.on("click.archiveBk", ".abk-keep-plus", () => {
			const cur = Math.max(1, parseInt(frm.doc.backup_max_keep || 10, 10) || 10);
			setDocField("backup_max_keep", Math.min(365, cur + 1));
		});

		$wrap.on("input.archiveBk change.archiveBk", ".abk-keep-input", function (e) {
			const raw = String($(this).val() || "").replace(/[^0-9]/g, "");
			if (!raw && e.type === "input") return;
			const clean = Math.min(365, Math.max(1, parseInt(raw, 10) || 1));
			if (e.type === "change") $(this).val(String(clean));
			setDocField("backup_max_keep", clean);
		});

		$wrap.on("click.archiveBk", ".abk-browse-btn", () => {
			openStorageFolderPicker();
		});

		$wrap.on("click.archiveBk", ".abk-save-btn", () => {
			frm.save();
		});

		$wrap.on("click.archiveBk", ".abk-test-path-btn", () => {
			const dest = String(frm.doc.backup_destination_path || "").trim();
			if (!dest) {
				frappe.msgprint(__("يرجى اختيار مجلد الحفظ أولاً من زر «استعراض الأقراص والمجلدات»."));
				return;
			}
			frappe.call({
				method: "archive.services.backup_manager.test_backup_destination",
				args: {
					backup_path: dest,
					require_mount: frm.doc.backup_require_mount ? 1 : 0,
					backup_mode: frm.doc.backup_mode || "",
				},
				freeze: true,
				freeze_message: __("جاري فحص المسار وصلاحيات الكتابة والمساحة الحرة..."),
				callback(r) {
					const res = (r && r.message) || {};
					if (!res.ok) return;
					const d = res.destination || {};
					const warns = Array.isArray(d.warnings) ? d.warnings : [];
					const usedPct =
						d.total_gb > 0
							? Math.round(((d.total_gb - d.free_gb) / d.total_gb) * 1000) / 10
							: 0;
					frm._backupStoragePreview = {
						path: d.path,
						exists: d.exists,
						mountpoint: d.mountpoint,
						fstype: d.fstype,
						total_gb: d.total_gb,
						free_gb: d.free_gb,
						used_percent: usedPct,
						is_fat32: warns.length > 0,
						category: d.is_external_mount ? "external" : "internal",
						title: d.is_external_mount ? `قرص متصل (${d.mountpoint})` : "القرص الرئيسي للسيرفر",
					};
					$wrap.find(".abk-storage-preview-slot").html(renderStorageSummaryHtml(frm._backupStoragePreview));

					const existsNote = d.exists
						? "المجلد موجود وقابل للكتابة والحذف."
						: "المجلد غير موجود بعد وسيتم إنشاؤه تلقائياً عند أول نسخة احتياطية.";
					const warnHtml = warns.length
						? `<div style="margin-top:6px; font-weight:700;">تحذير: ${warns.map((w) => frappe.utils.escape_html(w)).join("<br>")}</div>`
						: "";
					renderDiagnostic(
						warns.length ? "warning" : "success",
						"المسار صالح وجاهز للنسخ الاحتياطي ✓",
						`المسار: <code dir="ltr">${frappe.utils.escape_html(d.path || dest)}</code><br>
						المساحة الحرة: <b>${Number(d.free_gb || 0).toFixed(2)} GB</b> من ${Number(d.total_gb || 0).toFixed(2)} GB · نظام الملفات: <code dir="ltr">${frappe.utils.escape_html(d.fstype || "disk")}</code><br>
						${existsNote}${warnHtml}`
					);
				},
			});
		});

		$wrap.on("click.archiveBk", ".abk-run-now-btn", () => {
			if (frm.is_dirty()) {
				frappe.msgprint(__("يرجى الضغط على «حفظ الإعدادات» أولاً قبل تشغيل النسخ الاحتياطي."));
				return;
			}
			frappe.confirm(
				__("هل تريد بدء نسخة احتياطية فورية في الخلفية وفق الإعدادات المحفوظة الحالية؟"),
				() => {
					frappe.call({
						method: "archive.services.backup_manager.trigger_manual_backup",
						args: {},
						freeze: true,
						callback(r) {
							if (!r.exc) {
								frappe.show_alert({
									message: __("تمت جدولة عملية النسخ الاحتياطي الفورية في الخلفية."),
									indicator: "green",
								});
								reloadDashboard(true);
							}
						},
					});
				}
			);
		});

		$wrap.on("click.archiveBk", ".abk-export-tar-btn", () => {
			if (frm.is_dirty()) {
				frappe.msgprint(__("يرجى الضغط على «حفظ الإعدادات» أولاً قبل التصدير."));
				return;
			}
			frappe.confirm(
				__("هل تريد تصدير حزمة كاملة مستقلة بصيغة (.tar) تضم قاعدة البيانات وكافة ملفات الموقع؟"),
				() => {
					frappe.call({
						method: "archive.services.backup_manager.trigger_manual_backup",
						args: { mode_override: "full_tar" },
						freeze: true,
						callback(r) {
							if (!r.exc) {
								frappe.show_alert({
									message: __("تمت جدولة تصدير الحزمة الكاملة (.tar) في الخلفية."),
									indicator: "green",
								});
								reloadDashboard(true);
							}
						},
					});
				}
			);
		});

		$wrap.on("click.archiveBk", ".abk-refresh-logs-btn", () => {
			reloadDashboard(false);
		});

		$wrap.on("click.archiveBk", ".abk-copy-path-btn", function () {
			const p = String($(this).attr("data-path") || "").trim();
			if (!p) return;
			frappe.utils.copy_to_clipboard(p);
		});

		$wrap.on("click.archiveBk", ".abk-verify-btn", function () {
			const archivePath = String($(this).attr("data-path") || "").trim();
			if (!archivePath) return;
			frappe.call({
				method: "archive.services.backup_manager.verify_backup_archive",
				args: { archive_path: archivePath },
				freeze: true,
				freeze_message: __("جاري التحقق من سلامة الأرشيف وبصمة SHA-256..."),
				callback(r) {
					const res = (r && r.message) || {};
					if (res.ok) {
						const mf = res.manifest || {};
						const dbSha = (mf.database && mf.database.sha256) || "";
						renderDiagnostic(
							"success",
							"فحص السلامة: النسخة الاحتياطية سليمة ومطابقة 100% ✓",
							`المسار: <code dir="ltr">${frappe.utils.escape_html(archivePath)}</code><br>
							بصمة قاعدة البيانات (SHA-256): <code dir="ltr">${frappe.utils.escape_html(dbSha)}</code>`
						);
						frappe.show_alert({
							message: __("النسخة الاحتياطية سليمة ومطابقة لبصمة SHA-256."),
							indicator: "green",
						});
					}
				},
			});
		});

		if (ctx.is_running) {
			window.clearTimeout(frm._backupPollTimer);
			frm._backupPollTimer = window.setTimeout(() => reloadDashboard(true), 4000);
		}
	},

	render_fiscal_years_manager(frm) {
		const field = frm.get_field("fiscal_years_manager_html");
		if (!field || !field.$wrapper) return;

		const $wrap = field.$wrapper;
		$wrap.html(`
			<div class="archive-fy-settings-box" dir="rtl" style="margin-top:8px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff; padding:16px;">
				<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
					<div>
						<div style="font-weight:700; font-size:14px; color:#0f172a;">قائمة السنوات المالية وإدارتها</div>
						<div style="font-size:12px; color:#64748b; margin-top:2px;">السنة المالية تبدأ في 1 يناير وتنتهي في 31 ديسمبر. الإغلاق وإعادة الفتح يدويان بإجراء إداري مسجل.</div>
					</div>
					<div style="display:flex; align-items:center; gap:8px;">
						<input type="text" class="form-control input-sm archive-new-fy-input" placeholder="مثال: 2027" maxlength="4" style="width:120px; text-align:center; font-weight:600;" />
						<button type="button" class="btn btn-primary btn-sm archive-btn-create-fy">
							+ إنشاء سنة جديدة
						</button>
					</div>
				</div>
				<div class="archive-fy-table-slot">
					<div class="text-muted" style="padding:12px; text-align:center;">جاري تحميل السنوات المالية...</div>
				</div>
			</div>
		`);

		const loadAndRender = () => {
			frappe.call({
				method: "archive.services.fiscal_year_permissions.get_fiscal_years_management_data",
				callback(r) {
					const data = (r && r.message) || {};
					const years = Array.isArray(data.fiscal_years) ? data.fiscal_years : [];
					const defaultYear = data.default_fiscal_year || "";
					if (defaultYear && frm.doc.default_fiscal_year !== defaultYear) {
						frm.doc.default_fiscal_year = defaultYear;
						frm.refresh_field("default_fiscal_year");
					}
					renderTable(years, defaultYear);
				},
			});
		};

		const renderTable = (years, defaultYear) => {
			const $slot = $wrap.find(".archive-fy-table-slot");
			if (!years.length) {
				$slot.html(`<div class="text-muted" style="padding:12px; text-align:center;">لا توجد سنوات مالية مسجلة.</div>`);
				return;
			}

			const rowsHtml = years
				.map((y) => {
					const yr = frappe.utils.escape_html(y.year_name);
					const isClosed = Boolean(Number(y.is_closed));
					const isDefault = y.year_name === defaultYear || Boolean(Number(y.is_default));
					const statusBadge = isClosed
						? `<span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">مغلقة</span>`
						: `<span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;">مفتوحة</span>`;
					const defaultBadge = isDefault
						? `<span style="display:inline-block; margin-right:6px; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;">الافتراضية</span>`
						: "";

					let auditText = "—";
					if (isClosed && y.closed_at) {
						auditText = `أُغلقت بواسطة ${frappe.utils.escape_html(y.closed_by || "")} (${frappe.datetime.str_to_user(y.closed_at)})`;
					} else if (!isClosed && y.reopened_at) {
						auditText = `أُعيد فتحها بواسطة ${frappe.utils.escape_html(y.reopened_by || "")} (${frappe.datetime.str_to_user(y.reopened_at)})`;
					}

					const toggleBtn = isClosed
						? `<button type="button" class="btn btn-xs btn-default archive-fy-toggle-btn" data-year="${yr}" data-close="0" style="color:#059669; border-color:#a7f3d0; font-weight:600;">إعادة فتح السنة</button>`
						: `<button type="button" class="btn btn-xs btn-default archive-fy-toggle-btn" data-year="${yr}" data-close="1" ${isDefault ? 'disabled title="لا يمكن إغلاق السنة الافتراضية قبل اختيار سنة أخرى مفتوحة"' : ""} style="color:#dc2626; border-color:#fecaca; font-weight:600;">إغلاق السنة</button>`;

					const setDefaultBtn =
						!isDefault && !isClosed
							? `<button type="button" class="btn btn-xs btn-default archive-fy-default-btn" data-year="${yr}" style="margin-right:6px; font-weight:600;">تعيين كافتراضية</button>`
							: "";

					return `
						<tr>
							<td style="font-weight:700; font-size:13px;">${yr} ${defaultBadge}</td>
							<td style="direction:ltr; text-align:right;">${frappe.utils.escape_html(y.start_date || "")}</td>
							<td style="direction:ltr; text-align:right;">${frappe.utils.escape_html(y.end_date || "")}</td>
							<td>${statusBadge}</td>
							<td style="font-size:11px; color:#64748b;">${auditText}</td>
							<td style="text-align:left; white-space:nowrap;">${toggleBtn}${setDefaultBtn}</td>
						</tr>
					`;
				})
				.join("");

			$slot.html(`
				<div class="table-responsive">
					<table class="table table-bordered" style="margin-bottom:0; background:#fff;">
						<thead style="background:#f8fafc;">
							<tr>
								<th>السنة المالية</th>
								<th>تاريخ البداية</th>
								<th>تاريخ النهاية</th>
								<th>الحالة</th>
								<th>آخر إجراء إداري</th>
								<th style="text-align:left;">الإجراءات</th>
							</tr>
						</thead>
						<tbody>${rowsHtml}</tbody>
					</table>
				</div>
			`);
		};

		$wrap.off("click.archiveFy").on("click.archiveFy", ".archive-btn-create-fy", () => {
			const val = String($wrap.find(".archive-new-fy-input").val() || "").trim();
			if (!/^\d{4}$/.test(val)) {
				frappe.msgprint(__("يرجى إدخال اسم سنة مالية مكون من 4 أرقام مثل 2027."));
				return;
			}
			frappe.confirm(
				__("هل أنت متأكد من إنشاء السنة المالية ({0}) من {0}-01-01 إلى {0}-12-31؟", [val]),
				() => {
					frappe.call({
						method: "archive.services.fiscal_year_permissions.create_fiscal_year",
						args: { year_name: val },
						freeze: true,
						callback(r) {
							if (!r.exc) {
								$wrap.find(".archive-new-fy-input").val("");
								frappe.show_alert({
									message: __("تم إنشاء السنة المالية {0} بنجاح.", [val]),
									indicator: "green",
								});
								const data = r.message || {};
								renderTable(data.fiscal_years || [], data.default_fiscal_year || "");
							}
						},
					});
				}
			);
		});

		$wrap.on("click.archiveFy", ".archive-fy-toggle-btn", function () {
			const yr = String($(this).attr("data-year") || "").trim();
			const toClose = Number($(this).attr("data-close")) === 1 ? 1 : 0;
			const msg = toClose
				? __("هل أنت متأكد من إغلاق السنة المالية ({0})؟ ستمنع السنة المغلقة جميع عمليات الإضافة والتعديل والحذف.", [yr])
				: __("هل أنت متأكد من إعادة فتح السنة المالية ({0})؟", [yr]);
			frappe.confirm(msg, () => {
				frappe.call({
					method: "archive.services.fiscal_year_permissions.set_fiscal_year_status",
					args: { year_name: yr, is_closed: toClose },
					freeze: true,
					callback(r) {
						if (!r.exc) {
							frappe.show_alert({
								message: toClose
									? __("تم إغلاق السنة المالية {0}.", [yr])
									: __("تمت إعادة فتح السنة المالية {0}.", [yr]),
								indicator: "green",
							});
							const data = r.message || {};
							renderTable(data.fiscal_years || [], data.default_fiscal_year || "");
						}
					},
				});
			});
		});

		$wrap.on("click.archiveFy", ".archive-fy-default-btn", function () {
			const yr = String($(this).attr("data-year") || "").trim();
			frappe.confirm(
				__("هل أنت متأكد من تعيين السنة المالية ({0}) لتكون السنة الافتراضية للإدخال؟", [yr]),
				() => {
					frappe.call({
						method: "archive.services.fiscal_year_permissions.set_default_fiscal_year",
						args: { year_name: yr },
						freeze: true,
						callback(r) {
							if (!r.exc) {
								frm.reload_doc();
								frappe.show_alert({
									message: __("تم تعيين {0} كسنة مالية افتراضية.", [yr]),
									indicator: "green",
								});
							}
						},
					});
				}
			);
		});

		loadAndRender();
	},
});
