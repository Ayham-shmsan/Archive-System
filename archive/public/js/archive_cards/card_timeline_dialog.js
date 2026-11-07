(() => {
	"use strict";

	const EVENT_TYPE_META = {
		created: {
			label: "إنشاء البطاقة",
			icon: "fa-plus-circle",
			tone: "blue",
		},
		manual_edit: {
			label: "تعديل بيانات",
			icon: "fa-pencil",
			tone: "purple",
		},
		account_family_changed: {
			label: "تغيير رقم الحساب / العائلة",
			icon: "fa-sitemap",
			tone: "purple",
		},
		family_base_name_changed: {
			label: "تعديل اسم البطاقة الأساسي",
			icon: "fa-tag",
			tone: "purple",
		},
		status_change: {
			label: "تغيير الحالة",
			icon: "fa-refresh",
			tone: "amber",
		},
		formal_transfer: {
			label: "نقل عهدة",
			icon: "fa-exchange",
			tone: "cyan",
		},
		front_image_updated: {
			label: "تحديث صورة أمامية",
			icon: "fa-picture-o",
			tone: "sky",
		},
		back_image_updated: {
			label: "تحديث صورة خلفية",
			icon: "fa-picture-o",
			tone: "sky",
		},
		daily_limit_changed: {
			label: "تعديل الحد اليومي",
			icon: "fa-sliders",
			tone: "orange",
		},
		pin_changed: {
			label: "تحديث الرقم السري",
			icon: "fa-lock",
			tone: "indigo",
		},
		deleted: {
			label: "حذف تشغيلي",
			icon: "fa-trash",
			tone: "crimson",
		},
	};

	function resolve_event_meta(ev) {
		const base = EVENT_TYPE_META[ev.event_type] || {
			label: ev.event_type || "حدث",
			icon: "fa-circle",
			tone: "slate",
		};
		if (ev.event_type === "status_change") {
			const new_st = ev.details?.new_status || "";
			if (new_st === "نشطة") {
				return { ...base, tone: "emerald" };
			}
			if (new_st === "موقفة مؤقتاً") {
				return { ...base, tone: "amber" };
			}
			if (new_st === "موقفة نهائياً") {
				return { ...base, tone: "red" };
			}
		}
		return base;
	}

	const FIELD_ARABIC_LABELS = {
		card_number: "رقم البطاقة",
		bank: "البنك",
		card_owner: "مالك البطاقة",
		region: "المنطقة",
		representative: "المندوب",
		received_date: "تاريخ الاستلام",
		daily_limit: "الحد اليومي",
		status: "الحالة",
	};

	function display_status_label(status) {
		if (typeof window.format_card_status_label === "function") {
			return window.format_card_status_label(status);
		}
		const clean = String(status || "").trim();
		return clean === "موقفة نهائياً" ? "موقفة نهائياً (متلفة)" : clean;
	}

	function format_event_details_html(ev, card = {}) {
		const d = ev.details || {};
		const type = ev.event_type;
		const lines = [];

		if (type === "created") {
			const created_base_name = d.base_card_name || card.base_card_name || "";
			if (created_base_name) {
				lines.push(`الاسم: <strong>${frappe.utils.escape_html(created_base_name)}</strong> <span class="ac-copy-badge">نسخة ${d.copy_no || 1}</span>`);
			}
			if (d.account_number) lines.push(`رقم الحساب: <code dir="ltr">${frappe.utils.escape_html(d.account_number)}</code>`);
			if (d.bank_name || d.bank) lines.push(`البنك: <strong>${frappe.utils.escape_html(d.bank_name || d.bank)}</strong>`);
			if (d.representative_name || d.representative || d.region_name || d.region) {
				const rep_txt = d.representative_name || d.representative || "—";
				const reg_txt = d.region_name || d.region || "—";
				lines.push(`المندوب والمنطقة: <strong>${frappe.utils.escape_html(rep_txt)}</strong> (${frappe.utils.escape_html(reg_txt)})`);
			}
			if (d.card_owner_name || d.card_owner) {
				lines.push(`مالك البطاقة: <strong>${frappe.utils.escape_html(d.card_owner_name || d.card_owner)}</strong>`);
			}
			if (d.status) lines.push(`الحالة: <strong>${frappe.utils.escape_html(display_status_label(d.status))}</strong>`);
		} else if (type === "status_change") {
			lines.push(
				`من: <span class="actl-chip">${frappe.utils.escape_html(display_status_label(d.old_status) || "—")}</span>` +
					` <i class="fa fa-long-arrow-left"></i> ` +
					`إلى: <span class="actl-chip is-highlight">${frappe.utils.escape_html(display_status_label(d.new_status) || "—")}</span>`
			);
		} else if (type === "formal_transfer") {
			const from_rep = d.from_representative_name || d.from_representative || "—";
			const from_reg = d.from_region_name || d.from_region || "—";
			const to_rep = d.to_representative_name || d.to_representative || "—";
			const to_reg = d.to_region_name || d.to_region || "—";
			lines.push(
				`انتقال من المندوب <strong>${frappe.utils.escape_html(from_rep)}</strong> (${frappe.utils.escape_html(from_reg)}) ` +
					`إلى المندوب <strong>${frappe.utils.escape_html(to_rep)}</strong> (${frappe.utils.escape_html(to_reg)})`
			);
			if (d.new_received_date) {
				lines.push(`تاريخ الاستلام الجديد: <strong dir="ltr">${frappe.utils.escape_html(d.new_received_date)}</strong>`);
			}
		} else if (type === "account_family_changed") {
			lines.push(
				`رقم الحساب: <code dir="ltr">${frappe.utils.escape_html(d.old_account_number || "—")}</code> ` +
					`<i class="fa fa-long-arrow-left"></i> ` +
					`<code dir="ltr">${frappe.utils.escape_html(d.new_account_number || "—")}</code>`
			);
			if (d.old_base_card_name || d.new_base_card_name) {
				const old_copy = d.old_copy_no ? ` <span class="ac-copy-badge">نسخة ${d.old_copy_no}</span>` : "";
				const new_copy = ` <span class="ac-copy-badge">نسخة ${d.new_copy_no || d.copy_no || 1}</span>`;
				lines.push(
					`اسم البطاقة: <strong>${frappe.utils.escape_html(d.old_base_card_name || "—")}</strong>${old_copy} ` +
						`<i class="fa fa-long-arrow-left"></i> ` +
						`<strong>${frappe.utils.escape_html(d.new_base_card_name || "—")}</strong>${new_copy}`
				);
			}
		} else if (type === "family_base_name_changed") {
			const copy_badge = d.copy_no ? ` <span class="ac-copy-badge">نسخة ${d.copy_no}</span>` : "";
			lines.push(
				`اسم البطاقة: <strong>${frappe.utils.escape_html(d.old_base_card_name || "—")}</strong> ` +
					`<i class="fa fa-long-arrow-left"></i> ` +
					`<strong>${frappe.utils.escape_html(d.new_base_card_name || "—")}</strong>${copy_badge}`
			);
		} else if (type === "daily_limit_changed") {
			const old_v = d.old_daily_limit ? Number(d.old_daily_limit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "غير محدد";
			const new_v = d.new_daily_limit ? Number(d.new_daily_limit).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "غير محدد";
			lines.push(
				`الحد اليومي: <strong dir="ltr">${frappe.utils.escape_html(old_v)}</strong> ` +
					`<i class="fa fa-long-arrow-left"></i> ` +
					`<strong dir="ltr">${frappe.utils.escape_html(new_v)}</strong>`
			);
		} else if (type === "manual_edit" && d.changed_fields) {
			Object.entries(d.changed_fields).forEach(([field, diff]) => {
				const label = FIELD_ARABIC_LABELS[field] || field;
				const old_disp = diff.old_label !== undefined ? diff.old_label : (diff.old ?? "—");
				const new_disp = diff.new_label !== undefined ? diff.new_label : (diff.new ?? "—");
				lines.push(
					`${frappe.utils.escape_html(label)}: ` +
						`<span class="text-muted">${frappe.utils.escape_html(String(old_disp))}</span> ` +
						`<i class="fa fa-long-arrow-left"></i> ` +
						`<strong>${frappe.utils.escape_html(String(new_disp))}</strong>`
				);
			});
		}

		if (!lines.length) return "";
		return `
			<div class="actl-details-box">
				${lines.map((l) => `<div class="actl-detail-line">${l}</div>`).join("")}
			</div>
		`;
	}

	class ArchiveCardActivityTimelineDialog {
		constructor(options = {}) {
			this.card_name = options.card_name || "";
			this.dialog = null;
		}

		async show() {
			if (!this.card_name) return;

			const res = await frappe.call({
				method: "archive.api.card_timeline.get_card_activity_timeline",
				args: { card: this.card_name },
			});
			const data = res?.message || {};
			const card = data.card || {};
			const events = Array.isArray(data.events) ? data.events : [];

			this.dialog = new frappe.ui.Dialog({
				title: `سجل أحداث البطاقة — ${card.base_card_name || this.card_name}`,
				size: "large",
				primary_action_label: "إغلاق",
				primary_action: () => this.dialog.hide(),
			});

			const events_html = events.length
				? events
						.map((ev, idx) => {
							const meta = resolve_event_meta(ev);
							const is_last = idx === events.length - 1;
							const source_badge =
								ev.event_source === "system"
									? `<span class="actl-source-badge is-system">تحديث عائلي تلقائي</span>`
									: `<span class="actl-source-badge is-user">${frappe.utils.escape_html(ev.event_user_full_name || ev.event_user)}</span>`;

							return `
								<div class="actl-timeline-item tone-${meta.tone} ${is_last ? "is-last" : ""}">
									<div class="actl-timeline-rail" aria-hidden="true">
										<div class="actl-timeline-marker">
											<i class="fa ${meta.icon}"></i>
										</div>
										<div class="actl-timeline-connector"></div>
										${!is_last ? `<div class="actl-timeline-segment"></div>` : ""}
									</div>
									<div class="actl-timeline-card">
										<div class="actl-timeline-card-header">
											<div class="actl-title-wrap">
												<span class="actl-type-badge tone-${meta.tone}">${frappe.utils.escape_html(meta.label)}</span>
												<strong class="actl-event-title">${frappe.utils.escape_html(ev.event_title)}</strong>
											</div>
											<div class="actl-meta-wrap">
												${source_badge}
												<span class="actl-timestamp" dir="ltr">${frappe.utils.escape_html(ev.event_datetime)}</span>
											</div>
										</div>
										${format_event_details_html(ev, card)}
										${
											ev.remarks
												? `<div class="actl-remarks"><i class="fa fa-comment-o"></i> ${frappe.utils.escape_html(ev.remarks)}</div>`
												: ""
										}
									</div>
								</div>
							`;
						})
						.join("")
				: `<div class="actl-empty-state">لا توجد أحداث مسجلة لهذه البطاقة بعد.</div>`;

			$(this.dialog.body).attr("dir", "rtl").html(`
				<div class="archive-card-timeline-shell" dir="rtl">
					<div class="actl-header-summary">
						<div><strong>البطاقة:</strong> ${frappe.utils.escape_html(card.base_card_name || "")} <span class="ac-copy-badge">نسخة ${card.copy_no || 1}</span></div>
						<div><strong>رقم الحساب:</strong> <span dir="ltr">${frappe.utils.escape_html(card.account_number || "")}</span></div>
						<div><strong>رقم البطاقة:</strong> <span dir="ltr">${frappe.utils.escape_html(card.card_number || "")}</span></div>
						<div><strong>إجمالي الأحداث:</strong> ${events.length}</div>
					</div>
					<div class="actl-vertical-stream">
						${events_html}
					</div>
				</div>
			`);

			this.dialog.show();
		}
	}

	const ACTR_ICONS = {
		header_transfer: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 4l4 4-4 4"/><path d="M3 8h18"/><path d="M7 20l-4-4 4-4"/><path d="M21 16H3"/></svg>`,
		transfer_sm: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 4l4 4-4 4"/><path d="M3 8h18"/><path d="M7 20l-4-4 4-4"/><path d="M21 16H3"/></svg>`,
		arrow_left: `<svg class="actr-transfer-connector-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="20" y1="12" x2="4" y2="12"/><polyline points="10 6 4 12 10 18"/></svg>`,
		card: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
		card_plus: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M16 14h3m-1.5-1.5v3"/></svg>`,
		card_minus: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M15.5 14h3.5"/></svg>`,
		bank: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/></svg>`,
		clipboard: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
		shield: `<svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
		user: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
		user_prev: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M17 11h5"/></svg>`,
		pin: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
		calendar: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
		clock: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>`,
		doc: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`,
		layers: `<svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
		comment: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/></svg>`,
		header_history: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
		history_sm: `<svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
		id_card: `<svg viewBox="0 0 24 24" width="14.5" height="14.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="9" cy="11" r="2.3"/><path d="M5.5 16.5a3.8 3.8 0 0 1 7 0"/><line x1="15" y1="9.5" x2="19" y2="9.5"/><line x1="15" y1="13.5" x2="18" y2="13.5"/></svg>`,
		check_circle: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
		pause_circle: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>`,
		ban_circle: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
		info_circle: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
		arrow_left_xs: `<svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/></svg>`,
		chevron_right: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`,
		chevron_left: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`,
	};

	class ArchiveCardTransferTimelineDialog {
		constructor(options = {}) {
			this.card_name = options.card_name || "";
			this.dialog = null;
			this.stations = [];
			this.selected_index = 0;
			this.custody_matches = true;
		}

		static resolve_status_meta(status_raw) {
			const clean = String(status_raw || "").trim();
			if (!clean) {
				return {
					raw: "",
					label: "غير مسجلة",
					tone: "slate",
					is_recorded: false,
				};
			}
			const normalized = clean
				.replace(/مؤقتًا/g, "مؤقتاً")
				.replace(/نهائيًا/g, "نهائياً");
			if (normalized === "نشطة" || normalized === "نشط") {
				return {
					raw: "نشطة",
					label: "نشطة",
					tone: "emerald",
					is_recorded: true,
				};
			}
			if (normalized === "موقفة مؤقتاً") {
				return {
					raw: "موقفة مؤقتاً",
					label: "موقفة مؤقتاً",
					tone: "amber",
					is_recorded: true,
				};
			}
			if (
				normalized === "موقفة نهائياً" ||
				normalized === "موقفة نهائياً (متلفة)"
			) {
				return {
					raw: "موقفة نهائياً",
					label: "موقفة نهائياً",
					tone: "rose",
					is_recorded: true,
				};
			}
			return {
				raw: clean,
				label: display_status_label(clean) || clean,
				tone: "slate",
				is_recorded: true,
			};
		}

		static parse_ts(raw_dt) {
			const str = String(raw_dt || "").trim();
			if (!str) return NaN;
			const iso = str.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
			const ms = Date.parse(iso);
			return Number.isFinite(ms) ? ms : NaN;
		}

		static enrich_stations_with_historical_status(
			stations = [],
			activity_events = [],
			status_events = [],
			current_card_status = ""
		) {
			let created_entry = null;
			const transitions = [];
			const seen_transition_keys = new Set();
			const clean_current_status = String(current_card_status || "").trim();

			const push_transition = (ts, prev_status, new_status) => {
				if (!Number.isFinite(ts) || (!new_status && !prev_status)) return;
				const key = `${Math.round(ts / 1000)}|${prev_status}|${new_status}`;
				if (seen_transition_keys.has(key)) return;
				seen_transition_keys.add(key);
				transitions.push({ ts, prev_status, new_status });
			};

			if (Array.isArray(activity_events) && activity_events.length) {
				activity_events.forEach((ev) => {
					const ts = ArchiveCardTransferTimelineDialog.parse_ts(ev.event_datetime);
					if (!Number.isFinite(ts)) return;
					const d = ev.details || {};
					if (ev.event_type === "created" && d.status) {
						if (!created_entry || ts < created_entry.ts) {
							created_entry = {
								ts,
								status: String(d.status).trim(),
							};
						}
					} else if (ev.event_type === "status_change" && (d.new_status || d.old_status)) {
						push_transition(
							ts,
							String(d.old_status || "").trim(),
							String(d.new_status || "").trim()
						);
					}
				});
			}

			if (Array.isArray(status_events) && status_events.length) {
				status_events.forEach((ev) => {
					const ts = ArchiveCardTransferTimelineDialog.parse_ts(ev.recorded_at);
					push_transition(
						ts,
						String(ev.previous_status || "").trim(),
						String(ev.new_status || "").trim()
					);
				});
			}

			transitions.sort((a, b) => a.ts - b.ts);

			return stations.map((st, idx) => {
				const is_last_transfer = idx === stations.length - 1;
				if (is_last_transfer && clean_current_status) {
					const meta =
						ArchiveCardTransferTimelineDialog.resolve_status_meta(clean_current_status);
					return {
						...st,
						is_last_transfer: true,
						uses_current_card_status: true,
						status_raw: meta.raw,
						status_label: meta.label,
						status_tone: meta.tone,
						has_recorded_status: meta.is_recorded,
					};
				}

				const explicit_raw = String(
					st.card_status || st.historical_status || st.status || ""
				).trim();
				if (explicit_raw) {
					const meta = ArchiveCardTransferTimelineDialog.resolve_status_meta(explicit_raw);
					return {
						...st,
						is_last_transfer,
						uses_current_card_status: false,
						status_raw: meta.raw,
						status_label: meta.label,
						status_tone: meta.tone,
						has_recorded_status: meta.is_recorded,
					};
				}

				const st_ts = ArchiveCardTransferTimelineDialog.parse_ts(st.system_datetime);
				let resolved_raw = "";

				if (Number.isFinite(st_ts)) {
					if (created_entry && (st_ts + 2000 >= created_entry.ts || st.is_initial)) {
						resolved_raw = created_entry.status;
						for (let i = 0; i < transitions.length; i += 1) {
							if (transitions[i].ts <= st_ts + 500) {
								if (transitions[i].new_status) {
									resolved_raw = transitions[i].new_status;
								}
							} else {
								break;
							}
						}
					} else if (transitions.length) {
						let latest_before = null;
						for (let i = 0; i < transitions.length; i += 1) {
							if (transitions[i].ts <= st_ts + 500) {
								latest_before = transitions[i];
							} else {
								break;
							}
						}
						if (latest_before && latest_before.new_status) {
							resolved_raw = latest_before.new_status;
						} else if (!latest_before && transitions[0].prev_status) {
							resolved_raw = transitions[0].prev_status;
						}
					}
				}

				const meta = ArchiveCardTransferTimelineDialog.resolve_status_meta(resolved_raw);
				return {
					...st,
					is_last_transfer,
					uses_current_card_status: false,
					status_raw: meta.raw,
					status_label: meta.label,
					status_tone: meta.tone,
					has_recorded_status: meta.is_recorded,
				};
			});
		}

		static render_horizontal_track(stations = [], selected_index = -1) {
			if (!Array.isArray(stations) || !stations.length) {
				return `<div class="actl-empty-state">لا توجد انتقالات مسجلة لهذه البطاقة.</div>`;
			}

			const resolved_selected =
				selected_index >= 0 && selected_index < stations.length
					? selected_index
					: stations.length - 1;

			const nodes_html = stations
				.map((st, idx) => {
					const is_current_transfer = Boolean(st.is_current);
					const is_target_station = Boolean(st.is_current || st.is_last_formal);
					const is_selected = idx === resolved_selected;
					const tone = st.status_tone || "slate";
					const status_label = st.status_label || "غير مسجلة";
					const step_label = `نقل رقم ${st.sequence}`;

					const state_cls = [
						`status-tone-${tone}`,
						is_current_transfer ? "is-current-transfer" : "",
						is_selected ? "is-selected" : "",
					]
						.filter(Boolean)
						.join(" ");

					const note_raw = String(st.transfer_note || "").trim();
					const pill_icon =
						tone === "rose" ? ACTR_ICONS.card_minus : ACTR_ICONS.card_plus;
					const pill_text =
						note_raw ||
						(!st.is_initial && (st.from_representative_name || st.from_region_name)
							? `من: ${st.from_representative_name || "—"} (${st.from_region_name || "—"})`
							: "—");

					const connector =
						idx < stations.length - 1
							? `
							<div class="actr-transfer-connector" aria-hidden="true">
								${ACTR_ICONS.arrow_left}
							</div>
						`
							: "";

					const recorded_time = String(st.system_datetime || "").trim().slice(0, 16) || "—";

					return `
						<div class="actr-station-step actr-transfer-step">
							<div
								class="actr-station-card actr-transfer-card ${state_cls}"
								data-transfer-index="${idx}"
								${is_target_station ? 'data-current-station="1"' : ""}
								role="button"
								tabindex="0"
								aria-selected="${is_selected ? "true" : "false"}"
							>
								<div class="actr-tc-top">
									<div class="actr-tc-seq-group">
										<span class="actr-tc-seq-pill">
											${ACTR_ICONS.transfer_sm}
											<span>${frappe.utils.escape_html(step_label)}</span>
										</span>
									</div>
									<div class="actr-tc-status-group">
										<span class="actr-tc-status-caption">
											${ACTR_ICONS.shield}
											<span>${st.uses_current_card_status ? "الحالة الحالية" : "حالة البطاقة"}</span>
										</span>
										<span class="actr-tc-status-badge status-tone-${tone}">
											${frappe.utils.escape_html(status_label)}
										</span>
									</div>
								</div>

								<div class="actr-tc-body">
									<div class="actr-tc-row is-rep">
										<span class="actr-tc-field-icon">${ACTR_ICONS.user}</span>
										<strong>${frappe.utils.escape_html(st.to_representative_name || st.to_representative || "—")}</strong>
									</div>
									<div class="actr-tc-row">
										<span class="actr-tc-field-icon">${ACTR_ICONS.pin}</span>
										<span>${frappe.utils.escape_html(st.to_region_name || st.to_region || "—")}</span>
									</div>
									<div class="actr-tc-row">
										<span class="actr-tc-field-icon">${ACTR_ICONS.calendar}</span>
										<span>تاريخ الاستلام: <strong dir="ltr">${frappe.utils.escape_html(st.new_received_date || "—")}</strong></span>
									</div>
								</div>

								<div class="actr-tc-note-pill" title="${frappe.utils.escape_html(pill_text)}">
									<span class="actr-tc-pill-icon">${pill_icon}</span>
									<span class="actr-tc-pill-text">${frappe.utils.escape_html(pill_text)}</span>
								</div>

								<div class="actr-tc-footer">
									<span class="actr-tc-by">
										${ACTR_ICONS.user}
										<span>بواسطة: ${frappe.utils.escape_html(st.performed_by_full_name || st.performed_by || "—")}</span>
									</span>
									<span class="actr-tc-time" dir="ltr">
										<span>${frappe.utils.escape_html(recorded_time)}</span>
										${ACTR_ICONS.clock}
									</span>
								</div>
							</div>
							${connector}
						</div>
					`;
				})
				.join("");

			return `
				<div class="actr-horizontal-scroll actr-transfer-scroll" dir="rtl">
					<div class="actr-horizontal-track actr-transfer-track">
						${nodes_html}
					</div>
				</div>
			`;
		}

		static render_selected_transfer_details(st) {
			if (!st) return "";
			const tone = st.status_tone || "slate";
			const status_label = st.status_label || "غير مسجلة";
			const from_rep = st.from_representative_name || st.from_representative || "—";
			const to_rep = st.to_representative_name || st.to_representative || "—";
			const transfer_date = st.new_received_date || "—";
			const region_val = st.is_initial
				? st.from_region_name || "—"
				: st.to_region_name || st.to_region || "—";
			const location_val =
				st.location_name || st.location || st.to_region_name || st.to_region || "—";
			const recorded_by = st.performed_by_full_name || st.performed_by || "—";
			const note_raw = String(st.transfer_note || "").trim();
			const note_display = note_raw || "—";

			return `
				<div class="actr-detail-panel status-tone-${tone}" data-role="selected-transfer-details" dir="rtl">
					<div class="actr-detail-header">
						<div class="actr-detail-title">
							<span class="actr-detail-title-icon">${ACTR_ICONS.doc}</span>
							<span>تفاصيل انتقال البطاقة المحدد (نقل رقم ${frappe.utils.escape_html(String(st.sequence || ""))})</span>
						</div>
						<div class="actr-detail-badges">
							<span class="actr-detail-current-pill">
								${ACTR_ICONS.layers}
								<span>${st.uses_current_card_status ? "الحالة الحالية" : "حالة البطاقة"}</span>
							</span>
							<span class="actr-detail-status-pill status-tone-${tone}">
								${ACTR_ICONS.shield}
								<span>${frappe.utils.escape_html(status_label)}</span>
							</span>
						</div>
					</div>

					<div class="actr-detail-grid">
						<div class="actr-detail-cell">
							<div class="actr-detail-label">${ACTR_ICONS.user_prev}<span>المستلم السابق:</span></div>
							<div class="actr-detail-value">${frappe.utils.escape_html(from_rep)}</div>
						</div>
						<div class="actr-detail-cell">
							<div class="actr-detail-label">${ACTR_ICONS.user}<span>المستلم الجديد:</span></div>
							<div class="actr-detail-value">${frappe.utils.escape_html(to_rep)}</div>
						</div>
						<div class="actr-detail-cell">
							<div class="actr-detail-label">${ACTR_ICONS.calendar}<span>تاريخ الانتقال:</span></div>
							<div class="actr-detail-value" dir="ltr">${frappe.utils.escape_html(transfer_date)}</div>
						</div>
						<div class="actr-detail-cell">
							<div class="actr-detail-label">${ACTR_ICONS.user}<span>سجل بواسطة:</span></div>
							<div class="actr-detail-value">${frappe.utils.escape_html(recorded_by)}</div>
						</div>
						<div class="actr-detail-cell">
							<div class="actr-detail-label">${ACTR_ICONS.pin}<span>المنطقة:</span></div>
							<div class="actr-detail-value">${frappe.utils.escape_html(region_val)}</div>
						</div>
						<div class="actr-detail-cell">
							<div class="actr-detail-label">${ACTR_ICONS.pin}<span>الموقع:</span></div>
							<div class="actr-detail-value">${frappe.utils.escape_html(location_val)}</div>
						</div>
					</div>

					<div class="actr-detail-note-divider"></div>

					<div class="actr-detail-note-box">
						<div class="actr-detail-note-head">
							<span class="actr-detail-note-icon">${ACTR_ICONS.comment}</span>
							<strong class="actr-detail-note-label">ملاحظة الانتقال:</strong>
						</div>
						<div class="actr-detail-note-value">${frappe.utils.escape_html(note_display)}</div>
					</div>
				</div>
			`;
		}

		async fetch_optional_enrichment() {
			let bank_name = "";
			let activity_events = [];
			let status_events = [];

			try {
				const prev_res = await frappe.call({
					method: "archive.api.cards.get_card_preview",
					args: { card: this.card_name },
				});
				const prev_msg = prev_res?.message || {};
				bank_name = prev_msg?.card?.bank_name || prev_msg?.card?.bank || "";
				const perms = prev_msg?.permissions || {};

				const followups = [];
				if (perms.can_view_activity_timeline) {
					followups.push(
						frappe
							.call({
								method: "archive.api.card_timeline.get_card_activity_timeline",
								args: { card: this.card_name, limit: 500 },
							})
							.then((act_res) => {
								activity_events = Array.isArray(act_res?.message?.events)
									? act_res.message.events
									: [];
							})
					);
				}
				if (perms.can_view_card_event_history) {
					followups.push(
						frappe
							.call({
								method: "archive.api.card_timeline.get_card_events",
								args: { card: this.card_name },
							})
							.then((ev_res) => {
								status_events = Array.isArray(ev_res?.message?.events)
									? ev_res.message.events
									: [];
							})
					);
				}
				if (followups.length) {
					await Promise.allSettled(followups);
				}
			} catch (_) {
				// Non-critical enrichment; fall back cleanly to neutral defaults.
			}

			return { bank_name, activity_events, status_events };
		}

		async show() {
			if (!this.card_name) return;

			const [res, enrichment] = await Promise.all([
				frappe.call({
					method: "archive.api.card_timeline.get_card_transfer_timeline",
					args: { card: this.card_name },
				}),
				this.fetch_optional_enrichment(),
			]);

			const data = res?.message || {};
			const card = data.card || {};
			const raw_stations = Array.isArray(data.stations) ? data.stations : [];
			this.custody_matches = data.custody_matches_last_station !== false;

			this.stations = ArchiveCardTransferTimelineDialog.enrich_stations_with_historical_status(
				raw_stations,
				enrichment.activity_events,
				enrichment.status_events,
				card.status
			);

			const current_idx = this.stations.findIndex((s) => s.is_current || s.is_last_formal);
			this.selected_index =
				current_idx >= 0 ? current_idx : Math.max(0, this.stations.length - 1);

			const title_text = `مسار انتقال البطاقة — ${card.base_card_name || this.card_name}`;

			this.dialog = new frappe.ui.Dialog({
				title: title_text,
				size: "extra-large",
				primary_action_label: "إغلاق",
				primary_action: () => this.dialog.hide(),
			});

			this.dialog.$wrapper.addClass("archive-card-transfer-timeline-modal");

			const $header = this.dialog.$wrapper.find(".modal-header");
			const $title_wrap = $header.find(".title-section .modal-title");
			if ($title_wrap.length) {
				$title_wrap.html(`
					<span class="actr-modal-title-row">
						<span class="actr-modal-header-icon">${ACTR_ICONS.header_transfer}</span>
						<span class="actr-modal-header-text">${frappe.utils.escape_html(title_text)}</span>
					</span>
				`);
			}

			const $primary_btn = this.dialog.$wrapper.find(".modal-footer .btn-primary");
			if ($primary_btn.length) {
				$primary_btn.html(`<span class="actr-close-btn-x" aria-hidden="true">&times;</span><span>إغلاق</span>`);
			}

			const bank_display =
				card.bank_name || card.bank || enrichment.bank_name || "—";
			const current_status_meta =
				ArchiveCardTransferTimelineDialog.resolve_status_meta(card.status);

			const $body = $(this.dialog.body);
			$body.attr("dir", "rtl").html(`
				<div class="archive-card-timeline-shell actr-transfer-shell" dir="rtl">
					<div class="actr-card-summary-bar">
						<div class="actr-sum-item">
							<span class="actr-sum-icon">${ACTR_ICONS.card}</span>
							<span class="actr-sum-label">البطاقة:</span>
							<strong class="actr-sum-val">${frappe.utils.escape_html(card.base_card_name || card.card_name || "—")}</strong>
							<span class="actr-copy-pill">نسخة ${frappe.utils.escape_html(String(card.copy_no || 1))}</span>
						</div>
						<div class="actr-sum-item">
							<span class="actr-sum-icon">${ACTR_ICONS.bank}</span>
							<span class="actr-sum-label">البنك:</span>
							<span class="actr-sum-val">${frappe.utils.escape_html(bank_display)}</span>
						</div>
						<div class="actr-sum-item">
							<span class="actr-sum-icon">${ACTR_ICONS.card_plus}</span>
							<span class="actr-sum-label">رقم الحساب:</span>
							<span class="actr-sum-val" dir="ltr">${frappe.utils.escape_html(card.account_number || "—")}</span>
						</div>
						<div class="actr-sum-item">
							<span class="actr-sum-icon">${ACTR_ICONS.card}</span>
							<span class="actr-sum-label">رقم البطاقة:</span>
							<span class="actr-sum-val" dir="ltr">${frappe.utils.escape_html(card.card_number || "—")}</span>
						</div>
						<div class="actr-sum-item">
							<span class="actr-sum-icon">${ACTR_ICONS.clipboard}</span>
							<span class="actr-sum-label">الحالة الحالية:</span>
							<span class="actr-sum-status-badge status-tone-${current_status_meta.tone}">${frappe.utils.escape_html(current_status_meta.label)}</span>
						</div>
						<div class="actr-sum-item is-last">
							<span class="actr-sum-icon">${ACTR_ICONS.transfer_sm}</span>
							<span class="actr-sum-label">عدد مرات النقل:</span>
							<strong class="actr-sum-val" dir="ltr">${this.stations.length}</strong>
						</div>
					</div>

					<div class="actr-track-toolbar">
						<div class="actr-section-hint">
							يوضح المسار الزمني التالي انتقال البطاقة من مستلم لآخر، بدءاً من أول انتقال وحتى الانتقال الحالي:
						</div>
						${
							this.stations.length
								? `
							<div class="actr-nav-pill" role="group" aria-label="التنقل بين انتقالات البطاقة">
								<button type="button" class="actr-nav-btn" data-action="transfer-prev">
									الحالة السابقة
								</button>
								<span class="actr-nav-pos" data-role="transfer-pos-indicator"></span>
								<button type="button" class="actr-nav-btn" data-action="transfer-next">
									الحالة التالية
								</button>
							</div>
						`
								: ""
						}
					</div>

					${ArchiveCardTransferTimelineDialog.render_horizontal_track(
						this.stations,
						this.selected_index
					)}

					<div data-role="selected-transfer-container">
						${ArchiveCardTransferTimelineDialog.render_selected_transfer_details(
							this.stations[this.selected_index]
						)}
					</div>
				</div>
			`);

			this.bind_transfer_events($body);
			this.update_transfer_selection_state();

			this.dialog.show();

			const $primary_btn_after =
				(typeof this.dialog.get_primary_btn === "function" &&
					this.dialog.get_primary_btn()) ||
				this.dialog.$wrapper.find(".modal-footer .btn-primary");
			if ($primary_btn_after && $primary_btn_after.length) {
				$primary_btn_after.html(
					`<span class="actr-close-btn-x" aria-hidden="true">&times;</span><span>إغلاق</span>`
				);
			}

			this.focus_station(this.selected_index, true);
		}

		bind_transfer_events($body) {
			$body.off(".actrNav");

			$body.on("click.actrNav", '[data-action="transfer-prev"]', (e) => {
				e.preventDefault();
				if (this.selected_index > 0) {
					this.select_station(this.selected_index - 1);
				}
			});

			$body.on("click.actrNav", '[data-action="transfer-next"]', (e) => {
				e.preventDefault();
				if (this.selected_index < this.stations.length - 1) {
					this.select_station(this.selected_index + 1);
				}
			});

			$body.on("click.actrNav", ".actr-transfer-card[data-transfer-index]", (e) => {
				e.preventDefault();
				const idx = Number($(e.currentTarget).attr("data-transfer-index"));
				if (Number.isInteger(idx)) {
					this.select_station(idx);
				}
			});

			$body.on("keydown.actrNav", ".actr-transfer-card[data-transfer-index]", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					const idx = Number($(e.currentTarget).attr("data-transfer-index"));
					if (Number.isInteger(idx)) {
						this.select_station(idx);
					}
				} else if (e.key === "ArrowRight") {
					e.preventDefault();
					if (this.selected_index > 0) {
						this.select_station(this.selected_index - 1);
						$body
							.find(`.actr-transfer-card[data-transfer-index="${this.selected_index}"]`)
							.trigger("focus");
					}
				} else if (e.key === "ArrowLeft") {
					e.preventDefault();
					if (this.selected_index < this.stations.length - 1) {
						this.select_station(this.selected_index + 1);
						$body
							.find(`.actr-transfer-card[data-transfer-index="${this.selected_index}"]`)
							.trigger("focus");
					}
				}
			});
		}

		select_station(index) {
			if (!this.stations.length) return;
			const clamped = Math.max(0, Math.min(this.stations.length - 1, index));
			this.selected_index = clamped;
			this.update_transfer_selection_state();
			this.focus_station(clamped, false);
		}

		update_transfer_selection_state() {
			if (!this.dialog || !this.dialog.body || !this.stations.length) return;
			const $body = $(this.dialog.body);
			const total = this.stations.length;
			const idx = this.selected_index;
			const current_st = this.stations[idx];

			$body
				.find(".actr-transfer-card")
				.removeClass("is-selected")
				.attr("aria-selected", "false");
			$body
				.find(`.actr-transfer-card[data-transfer-index="${idx}"]`)
				.addClass("is-selected")
				.attr("aria-selected", "true");

			$body.find('[data-action="transfer-prev"]').prop("disabled", idx <= 0);
			$body
				.find('[data-action="transfer-next"]')
				.prop("disabled", idx >= total - 1);

			const pos_suffix = current_st?.is_current ? " — الحالي" : "";
			$body
				.find('[data-role="transfer-pos-indicator"]')
				.text(`نقل ${current_st?.sequence || idx + 1} من ${total}${pos_suffix}`);

			$body
				.find('[data-role="selected-transfer-container"]')
				.html(
					ArchiveCardTransferTimelineDialog.render_selected_transfer_details(
						current_st
					)
				);
		}

		focus_station(index, immediate = false) {
			const align_horizontally = () => {
				if (!this.dialog || !this.dialog.body) return;
				const $body = $(this.dialog.body);
				const scroll_el = $body.find(".actr-transfer-scroll")[0];
				const target_node =
					$body.find(`.actr-transfer-card[data-transfer-index="${index}"]`)[0] ||
					$body.find('[data-current-station="1"]')[0];
				if (!scroll_el || !target_node) return;
				if (scroll_el.scrollWidth <= scroll_el.clientWidth + 2) return;

				const container_rect = scroll_el.getBoundingClientRect();
				const card_rect = target_node.getBoundingClientRect();
				if (!container_rect.width || !card_rect.width) return;

				const delta =
					card_rect.left +
					card_rect.width / 2 -
					(container_rect.left + container_rect.width / 2);
				if (Math.abs(delta) > 4) {
					scroll_el.scrollBy({
						left: delta,
						behavior: immediate ? "auto" : "smooth",
					});
				}
			};

			align_horizontally();
			if (immediate) {
				requestAnimationFrame(align_horizontally);
				setTimeout(align_horizontally, 50);
				if (this.dialog && this.dialog.$wrapper) {
					this.dialog.$wrapper.one("shown.bs.modal", align_horizontally);
				}
			}
		}
	}

	class ArchiveCardEventHistoryDialog {
		constructor(options = {}) {
			this.card_name = options.card_name || "";
			this.dialog = null;
			this.stations = [];
			this.selected_index = 0;
		}

		static resolve_status_tone(status_raw, fallback_event_type = "") {
			const clean = String(status_raw || "").trim();
			if (clean === "نشطة") {
				return "emerald";
			}
			if (clean === "موقفة مؤقتاً") {
				return "amber";
			}
			if (clean === "موقفة نهائياً" || clean === "موقفة نهائياً (متلفة)") {
				return "rose";
			}
			if (fallback_event_type === "reactivated") return "emerald";
			if (fallback_event_type === "temporary_stop") return "amber";
			if (fallback_event_type === "permanent_stop") return "rose";
			return "slate";
		}

		static resolve_event_tone(event_type) {
			if (event_type === "reactivated") {
				return {
					tone: "emerald",
					icon: "fa-check-circle",
					default_label: "إعادة تنشيط",
				};
			}
			if (event_type === "temporary_stop") {
				return {
					tone: "amber",
					icon: "fa-pause-circle",
					default_label: "توقيف مؤقت",
				};
			}
			if (event_type === "permanent_stop") {
				return {
					tone: "rose",
					icon: "fa-ban",
					default_label: "توقيف نهائي (متلفة)",
				};
			}
			return {
				tone: "slate",
				icon: "fa-circle-o",
				default_label: event_type || "حدث",
			};
		}

		static resolve_event_svg(st = {}) {
			if (st.tone === "emerald" || st.event_type === "reactivated") {
				return ACTR_ICONS.check_circle;
			}
			if (st.tone === "amber" || st.event_type === "temporary_stop") {
				return ACTR_ICONS.pause_circle;
			}
			if (st.tone === "rose" || st.event_type === "permanent_stop") {
				return ACTR_ICONS.ban_circle;
			}
			return ACTR_ICONS.info_circle;
		}

		static format_recorded_at(raw_dt) {
			const str = String(raw_dt || "").trim();
			if (!str) return "—";
			return str.length > 19 ? str.slice(0, 19) : str;
		}

		static build_status_stations(events = [], card = {}) {
			const chronological = Array.isArray(events) ? [...events].reverse() : [];
			const current_status_raw = String(card.status || "").trim();
			const current_status_label =
				card.status_display || display_status_label(current_status_raw) || "—";

			const stations = chronological.map((ev, idx) => {
				const meta = ArchiveCardEventHistoryDialog.resolve_event_tone(ev.event_type);
				const prev_raw = String(ev.previous_status || "").trim();
				const prev_label =
					ev.previous_status_display || display_status_label(prev_raw) || "—";
				const new_raw = String(ev.new_status || "").trim();
				const new_label =
					ev.new_status_display || display_status_label(new_raw) || "—";
				const tone = ArchiveCardEventHistoryDialog.resolve_status_tone(
					new_raw,
					ev.event_type
				);

				return {
					sequence: idx + 1,
					is_recorded: true,
					is_explanatory_current: false,
					is_current: false,
					tone,
					icon: meta.icon,
					event_type: ev.event_type || "",
					event_type_label: ev.event_type_label || meta.default_label,
					previous_status_raw: prev_raw,
					previous_status_label: prev_label,
					new_status_raw: new_raw,
					new_status_label: new_label,
					event_date: ev.event_date || "—",
					reason: String(ev.reason || "").trim(),
					card_owner_name: ev.card_owner_name || ev.card_owner || "—",
					representative_name: ev.representative_name || ev.representative || "—",
					region_name: ev.region_name || ev.region || "—",
					recorded_by_name: ev.recorded_by_name || ev.recorded_by || "—",
					recorded_at: ArchiveCardEventHistoryDialog.format_recorded_at(
						ev.recorded_at
					),
				};
			});

			if (stations.length > 0) {
				const last_station = stations[stations.length - 1];
				if (
					!current_status_raw ||
					last_station.new_status_raw === current_status_raw
				) {
					last_station.is_current = true;
				} else {
					stations.push({
						sequence: stations.length + 1,
						is_recorded: false,
						is_explanatory_current: true,
						is_current: true,
						tone: ArchiveCardEventHistoryDialog.resolve_status_tone(
							current_status_raw
						),
						icon: "fa-info-circle",
						event_type: "current_state",
						event_type_label: "حالة حالية (توضيحية)",
						previous_status_raw: last_station.new_status_raw,
						previous_status_label: last_station.new_status_label,
						new_status_raw: current_status_raw,
						new_status_label: current_status_label,
						event_date: "—",
						reason: "",
						explanatory_note:
							"حالة ختامية توضيحية مستمدة من الحالة الحالية للبطاقة (دون حدث مسجل في السجل).",
						card_owner_name: "—",
						representative_name: "—",
						region_name: "—",
						recorded_by_name: "—",
						recorded_at: "—",
					});
				}
			} else if (current_status_raw) {
				stations.push({
					sequence: 1,
					is_recorded: false,
					is_explanatory_current: true,
					is_current: true,
					tone: ArchiveCardEventHistoryDialog.resolve_status_tone(
						current_status_raw
					),
					icon: "fa-info-circle",
					event_type: "current_state",
					event_type_label: "حالة حالية (توضيحية)",
					previous_status_raw: "",
					previous_status_label: "—",
					new_status_raw: current_status_raw,
					new_status_label: current_status_label,
					event_date: "—",
					reason: "",
					explanatory_note:
						"لم تسجل البطاقة أحداث انتقال سابقة؛ توضح هذه  الحالة الحالية للبطاقة فقط.",
					card_owner_name: "—",
					representative_name: "—",
					region_name: "—",
					recorded_by_name: "—",
					recorded_at: "—",
				});
			}

			return stations;
		}

		static render_horizontal_track(stations = [], selected_index = 0) {
			if (!Array.isArray(stations) || !stations.length) {
				return `<div class="actl-empty-state">لا توجد أحداث حالة مسجلة لهذه البطاقة.</div>`;
			}

			const nodes_html = stations
				.map((st, idx) => {
					const is_target_station = Boolean(st.is_current);
					const is_selected = idx === selected_index;
					const step_label = st.is_explanatory_current
						? "حالة ختامية"
						: `حدث رقم ${st.sequence}`;
					const badge_label = is_target_station
						? "الحالة الحالية"
						: st.event_type_label;

					const state_cls = is_target_station ? "is-current" : "is-history";
					const selected_cls = is_selected ? "is-selected" : "";
					const explanatory_cls = st.is_explanatory_current
						? "is-explanatory"
						: "";

					const connector =
						idx < stations.length - 1
							? `
							<div class="actr-connector" aria-hidden="true">
								${ACTR_ICONS.arrow_left}
							</div>
						`
							: "";

					const note_text = st.is_explanatory_current
						? st.explanatory_note || ""
						: st.reason;
					const status_svg = ArchiveCardEventHistoryDialog.resolve_event_svg(st);

					return `
						<div class="actr-station-step">
							<div
								class="actr-station-card aceh-station-card status-tone-${st.tone} ${state_cls} ${selected_cls} ${explanatory_cls}"
								data-station-index="${idx}"
								${is_target_station ? 'data-current-station="1"' : ""}
								role="button"
								tabindex="0"
							>
								<div class="actr-station-top">
									<span class="actr-seq-circle">
										${ACTR_ICONS.history_sm}
										<span>${frappe.utils.escape_html(step_label)}</span>
									</span>
									<span class="actr-station-badge">
										${ACTR_ICONS.shield}
										<span>${frappe.utils.escape_html(badge_label)}</span>
									</span>
								</div>
								<div class="aceh-station-status-Transition">
									<div class="aceh-station-result-status">
										<span class="aceh-icon-inline">${status_svg}</span>
										<strong>${frappe.utils.escape_html(st.new_status_label)}</strong>
									</div>
									<div class="actr-station-from aceh-station-prev-status">
										<span>من: ${frappe.utils.escape_html(st.previous_status_label)}</span>
										<span class="aceh-icon-inline">${ACTR_ICONS.arrow_left_xs}</span>
										<span>إلى: <strong>${frappe.utils.escape_html(st.new_status_label)}</strong></span>
									</div>
								</div>
								<div class="actr-station-date">
									<span class="aceh-field-icon">${ACTR_ICONS.calendar}</span>
									<span>التاريخ الفعلي: <strong dir="ltr">${frappe.utils.escape_html(st.event_date)}</strong></span>
								</div>
								<div class="actr-station-rep" title="${frappe.utils.escape_html(st.card_owner_name)}">
									<span class="aceh-field-icon">${ACTR_ICONS.id_card}</span>
									<span>مالك البطاقة: <strong>${frappe.utils.escape_html(st.card_owner_name)}</strong></span>
								</div>
								<div class="actr-station-region" title="${frappe.utils.escape_html(st.representative_name)}">
									<span class="aceh-field-icon">${ACTR_ICONS.user}</span>
									<span>المندوب: <strong>${frappe.utils.escape_html(st.representative_name)}</strong></span>
								</div>
								<div class="actr-station-region" title="${frappe.utils.escape_html(st.region_name)}">
									<span class="aceh-field-icon">${ACTR_ICONS.pin}</span>
									<span>المنطقة: <strong>${frappe.utils.escape_html(st.region_name)}</strong></span>
								</div>
								<div class="actr-station-note" title="${frappe.utils.escape_html(note_text || "—")}">
									<span class="aceh-note-icon">${ACTR_ICONS.comment}</span>
									<span class="aceh-note-text">${
										st.is_explanatory_current
											? frappe.utils.escape_html(note_text)
											: `السبب: ${frappe.utils.escape_html(note_text || "—")}`
									}</span>
								</div>
								<div class="actr-station-footer">
									<span class="aceh-footer-item">${ACTR_ICONS.user}<span>بواسطة: ${frappe.utils.escape_html(st.recorded_by_name)}</span></span>
									<span class="aceh-footer-item" dir="ltr"><span>${frappe.utils.escape_html(String(st.recorded_at || "—").slice(0, 16))}</span>${ACTR_ICONS.clock}</span>
								</div>
							</div>
							${connector}
						</div>
					`;
				})
				.join("");

			return `
				<div class="actr-horizontal-scroll" dir="rtl">
					<div class="actr-horizontal-track">
						${nodes_html}
					</div>
				</div>
			`;
		}

		static render_selected_station_details(st, total_count) {
			if (!st) return "";
			const title_prefix = st.is_current
				? `تفاصيل الحالة المحددة — الحالة الحالية (${st.new_status_label})`
				: `تفاصيل الحالة المحددة — حدث رقم ${st.sequence} من ${total_count} (${st.event_type_label})`;

			const reason_display = st.is_explanatory_current
				? st.explanatory_note || "—"
				: st.reason || "—";
			const status_svg = ArchiveCardEventHistoryDialog.resolve_event_svg(st);

			return `
				<div class="acvd-transfer-current-box aceh-selected-detail-box status-tone-${st.tone}" data-role="selected-station-details" dir="rtl">
					<div class="aceh-detail-box-header">
						<div class="acvd-transfer-box-title">
							<span class="aceh-detail-title-icon">${ACTR_ICONS.doc}</span>
							<span>${frappe.utils.escape_html(title_prefix)}</span>
						</div>
						<div class="aceh-detail-badges">
							${
								st.is_current
									? `<span class="aceh-current-marker-pill">${ACTR_ICONS.layers}<span>الحالة الحالية</span></span>`
									: ""
							}
							${
								st.is_explanatory_current
									? `<span class="aceh-explanatory-pill">${ACTR_ICONS.info_circle}<span>حالة توضيحية (غير مسجلة كحدث)</span></span>`
									: `<span class="aceh-event-type-pill">${status_svg}<span>${frappe.utils.escape_html(st.event_type_label)}</span></span>`
							}
						</div>
					</div>
					<div class="acvd-transfer-box-grid aceh-detail-grid">
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.calendar}</span><span>التاريخ الفعلي:</span> <strong dir="ltr">${frappe.utils.escape_html(st.event_date)}</strong></div>
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.history_sm}</span><span>الحالة السابقة:</span> <strong>${frappe.utils.escape_html(st.previous_status_label)}</strong></div>
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.shield}</span><span>الحالة الجديدة:</span> <strong>${frappe.utils.escape_html(st.new_status_label)}</strong></div>
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.id_card}</span><span>مالك البطاقة:</span> <strong>${frappe.utils.escape_html(st.card_owner_name)}</strong></div>
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.user}</span><span>المندوب:</span> <strong>${frappe.utils.escape_html(st.representative_name)}</strong></div>
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.pin}</span><span>المنطقة:</span> <strong>${frappe.utils.escape_html(st.region_name)}</strong></div>
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.user}</span><span>سجل بواسطة:</span> <strong>${frappe.utils.escape_html(st.recorded_by_name)}</strong></div>
						<div class="aceh-grid-item"><span class="aceh-field-icon">${ACTR_ICONS.clock}</span><span>وقت التسجيل بالنظام:</span> <strong dir="ltr">${frappe.utils.escape_html(st.recorded_at)}</strong></div>
					</div>
					<div class="aceh-detail-reason-row">
						<span class="aceh-field-icon">${ACTR_ICONS.comment}</span>
						<span class="aceh-detail-reason-label">السبب / الملاحظة:</span>
						<span class="aceh-detail-reason-value">${frappe.utils.escape_html(reason_display)}</span>
					</div>
				</div>
			`;
		}

		async show() {
			if (!this.card_name) return;

			const res = await frappe.call({
				method: "archive.api.card_timeline.get_card_events",
				args: { card: this.card_name },
			});
			const data = res?.message || {};
			const card = data.card || {};
			const events = Array.isArray(data.events) ? data.events : [];

			this.stations = ArchiveCardEventHistoryDialog.build_status_stations(
				events,
				card
			);
			this.selected_index = Math.max(0, this.stations.length - 1);

			const title_text = `سجل أحداث البطاقة — ${card.base_card_name || this.card_name}`;

			this.dialog = new frappe.ui.Dialog({
				title: title_text,
				size: "extra-large",
				primary_action_label: "إغلاق",
				primary_action: () => this.dialog.hide(),
			});

			this.dialog.$wrapper.addClass("archive-card-event-history-modal");

			const $header = this.dialog.$wrapper.find(".modal-header");
			const $title_wrap = $header.find(".title-section .modal-title");
			if ($title_wrap.length) {
				$title_wrap.html(`
					<span class="actr-modal-title-row">
						<span class="actr-modal-header-icon">${ACTR_ICONS.header_history}</span>
						<span class="actr-modal-header-text">${frappe.utils.escape_html(title_text)}</span>
					</span>
				`);
			}

			const current_status_raw = String(card.status || "").trim();
			const current_status_label =
				card.status_display || display_status_label(current_status_raw) || "—";

			const $body = $(this.dialog.body);
			$body.attr("dir", "rtl").html(`
				<div class="archive-card-timeline-shell" dir="rtl">
					<div class="actl-header-summary">
						<div class="aceh-sum-item"><span class="actr-sum-icon">${ACTR_ICONS.card}</span><strong>البطاقة:</strong> ${frappe.utils.escape_html(card.base_card_name || card.card_name || "")} <span class="ac-copy-badge">نسخة ${card.copy_no || 1}</span></div>
						<div class="aceh-sum-item"><span class="actr-sum-icon">${ACTR_ICONS.bank}</span><strong>البنك:</strong> ${frappe.utils.escape_html(card.bank_name || card.bank || "—")}</div>
						<div class="aceh-sum-item"><span class="actr-sum-icon">${ACTR_ICONS.card_plus}</span><strong>رقم الحساب:</strong> <span dir="ltr">${frappe.utils.escape_html(card.account_number || "—")}</span></div>
						<div class="aceh-sum-item"><span class="actr-sum-icon">${ACTR_ICONS.card}</span><strong>رقم البطاقة:</strong> <span dir="ltr">${frappe.utils.escape_html(card.card_number || "—")}</span></div>
						<div class="aceh-sum-item"><span class="actr-sum-icon">${ACTR_ICONS.clipboard}</span><strong>الحالة الحالية:</strong> <span class="acvd-status-pill" data-status="${frappe.utils.escape_html(current_status_raw)}">${frappe.utils.escape_html(current_status_label)}</span></div>
						<div class="aceh-sum-item"><span class="actr-sum-icon">${ACTR_ICONS.history_sm}</span><strong>عدد الأحداث المسجلة:</strong> <span dir="ltr">${events.length}</span></div>
					</div>
					<div class="aceh-track-toolbar">
						<div class="actr-section-hint">
							يوضح المسار الأفقي التالي انتقال حالات البطاقة زمنياً من الأقدم إلى الأحدث وحتى الحالة الحالية (من اليمين إلى اليسار):
						</div>
						${
							this.stations.length
								? `
							<div class="aceh-nav-controls" role="group" aria-label="التنقل بين محطات الحالة">
								<button type="button" class="btn btn-xs btn-default aceh-nav-btn" data-action="station-prev">
									${ACTR_ICONS.chevron_right}
									<span>الحالة السابقة</span>
								</button>
								<span class="aceh-nav-pos" data-role="station-pos-indicator"></span>
								<button type="button" class="btn btn-xs btn-default aceh-nav-btn" data-action="station-next">
									<span>الحالة التالية</span>
									${ACTR_ICONS.chevron_left}
								</button>
							</div>
						`
								: ""
						}
					</div>
					${ArchiveCardEventHistoryDialog.render_horizontal_track(
						this.stations,
						this.selected_index
					)}
					<div data-role="selected-station-container">
						${ArchiveCardEventHistoryDialog.render_selected_station_details(
							this.stations[this.selected_index],
							this.stations.length
						)}
					</div>
				</div>
			`);

			this.bind_navigation_events($body);
			this.update_navigation_state();

			this.dialog.show();

			const $primary_btn_after =
				(typeof this.dialog.get_primary_btn === "function" &&
					this.dialog.get_primary_btn()) ||
				this.dialog.$wrapper.find(".modal-footer .btn-primary");
			if ($primary_btn_after && $primary_btn_after.length) {
				$primary_btn_after.html(
					`<span class="actr-close-btn-x" aria-hidden="true">&times;</span><span>إغلاق</span>`
				);
			}

			this.focus_station(this.selected_index, true);
		}

		bind_navigation_events($body) {
			$body.on("click", '[data-action="station-prev"]', () => {
				if (this.selected_index > 0) {
					this.select_station(this.selected_index - 1);
				}
			});

			$body.on("click", '[data-action="station-next"]', () => {
				if (this.selected_index < this.stations.length - 1) {
					this.select_station(this.selected_index + 1);
				}
			});

			$body.on("click", ".aceh-station-card[data-station-index]", (e) => {
				const idx = Number($(e.currentTarget).attr("data-station-index"));
				if (Number.isInteger(idx)) {
					this.select_station(idx);
				}
			});

			$body.on("keydown", ".aceh-station-card[data-station-index]", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					const idx = Number($(e.currentTarget).attr("data-station-index"));
					if (Number.isInteger(idx)) {
						this.select_station(idx);
					}
				}
			});
		}

		select_station(index) {
			if (!this.stations.length) return;
			const clamped = Math.max(0, Math.min(this.stations.length - 1, index));
			this.selected_index = clamped;
			this.update_navigation_state();
			this.focus_station(clamped, false);
		}

		update_navigation_state() {
			if (!this.dialog || !this.dialog.body || !this.stations.length) return;
			const $body = $(this.dialog.body);
			const total = this.stations.length;
			const idx = this.selected_index;
			const current_st = this.stations[idx];

			$body.find(".aceh-station-card").removeClass("is-selected");
			$body
				.find(`.aceh-station-card[data-station-index="${idx}"]`)
				.addClass("is-selected");

			$body.find('[data-action="station-prev"]').prop("disabled", idx <= 0);
			$body
				.find('[data-action="station-next"]')
				.prop("disabled", idx >= total - 1);

			const pos_suffix = current_st?.is_current ? " — الحالة الحالية" : "";
			$body
				.find('[data-role="station-pos-indicator"]')
				.text(`حالة ${idx + 1} من ${total}${pos_suffix}`);

			$body
				.find('[data-role="selected-station-container"]')
				.html(
					ArchiveCardEventHistoryDialog.render_selected_station_details(
						current_st,
						total
					)
				);
		}

		focus_station(index, immediate = false) {
			const align_node = () => {
				if (!this.dialog || !this.dialog.body) return;
				const $body = $(this.dialog.body);
				const target_node =
					$body.find(`.aceh-station-card[data-station-index="${index}"]`)[0] ||
					$body.find('[data-current-station="1"]')[0];
				if (target_node && typeof target_node.scrollIntoView === "function") {
					target_node.scrollIntoView({
						behavior: immediate ? "instant" : "smooth",
						block: "nearest",
						inline: "center",
					});
				}
			};

			align_node();
			if (immediate) {
				requestAnimationFrame(align_node);
				setTimeout(align_node, 40);
				if (this.dialog && this.dialog.$wrapper) {
					this.dialog.$wrapper.one("shown.bs.modal", align_node);
				}
			}
		}
	}

	window.ArchiveCardActivityTimelineDialog = ArchiveCardActivityTimelineDialog;
	window.ArchiveCardTransferTimelineDialog = ArchiveCardTransferTimelineDialog;
	window.ArchiveCardEventHistoryDialog = ArchiveCardEventHistoryDialog;
})();
