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

	class ArchiveCardTransferTimelineDialog {
		constructor(options = {}) {
			this.card_name = options.card_name || "";
			this.dialog = null;
		}

		static render_horizontal_track(stations = []) {
			if (!Array.isArray(stations) || !stations.length) {
				return `<div class="actl-empty-state">لا توجد محطات عهدة مسجلة لهذه البطاقة.</div>`;
			}

			const nodes_html = stations
				.map((st, idx) => {
					const is_target_station = Boolean(st.is_current || st.is_last_formal);
					const step_label = `نقل رقم ${st.sequence}`;
					const badge_label = is_target_station
						? "البطاقة الحالية"
						: st.is_initial
						? "استلام أولي"
						: step_label;

					const state_cls = is_target_station
						? "is-current"
						: st.is_initial
						? "is-initial"
						: "is-history";

					const connector =
						idx < stations.length - 1
							? `
							<div class="actr-connector" aria-hidden="true">
								<div class="actr-connector-line"></div>
								<i class="fa fa-long-arrow-left actr-connector-arrow"></i>
							</div>
						`
							: "";

					return `
						<div class="actr-station-step">
							<div
								class="actr-station-card ${state_cls}"
								${is_target_station ? 'data-current-station="1"' : ""}
							>
								<div class="actr-station-top">
									<span class="actr-seq-circle">${step_label}</span>
									<span class="actr-station-badge">${badge_label}</span>
								</div>
								<div class="actr-station-rep">
									<i class="fa fa-user"></i>
									<strong>${frappe.utils.escape_html(st.to_representative_name || st.to_representative)}</strong>
								</div>
								<div class="actr-station-region">
									<i class="fa fa-map-marker"></i>
									<span>${frappe.utils.escape_html(st.to_region_name || st.to_region)}</span>
								</div>
								<div class="actr-station-date">
									<i class="fa fa-calendar"></i>
									<span>تاريخ الاستلام: <strong dir="ltr">${frappe.utils.escape_html(st.new_received_date)}</strong></span>
								</div>
								${
									!st.is_initial && (st.from_representative_name || st.from_region_name)
										? `
									<div class="actr-station-from">
										من: ${frappe.utils.escape_html(st.from_representative_name || "—")} (${frappe.utils.escape_html(st.from_region_name || "—")})
									</div>
								`
										: ""
								}
								${
									st.transfer_note
										? `<div class="actr-station-note" title="${frappe.utils.escape_html(st.transfer_note)}">${frappe.utils.escape_html(st.transfer_note)}</div>`
										: ""
								}
								<div class="actr-station-footer">
									<span>بواسطة: ${frappe.utils.escape_html(st.performed_by_full_name || st.performed_by)}</span>
									<span dir="ltr">${frappe.utils.escape_html(String(st.system_datetime || "").slice(0, 16))}</span>
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

		async show() {
			if (!this.card_name) return;

			const res = await frappe.call({
				method: "archive.api.card_timeline.get_card_transfer_timeline",
				args: { card: this.card_name },
			});
			const data = res?.message || {};
			const card = data.card || {};
			const stations = Array.isArray(data.stations) ? data.stations : [];
			const custody_matches = data.custody_matches_last_station !== false;

			this.dialog = new frappe.ui.Dialog({
				title: `مسار انتقال عهدة البطاقة — ${card.base_card_name || this.card_name}`,
				size: "extra-large",
				primary_action_label: "إغلاق",
				primary_action: () => this.dialog.hide(),
			});

			const current_custody_box_html = !custody_matches
				? `
				<div class="acvd-transfer-current-box actr-manual-custody-banner" data-role="current-custody-banner" dir="rtl">
					<div class="acvd-transfer-box-title">البطاقة الحالية (تعديل يدوي بعد آخر نقل رسمي)</div>
					<div class="acvd-transfer-box-grid">
						<div><span>المندوب الحالي:</span> <strong>${frappe.utils.escape_html(card.current_representative_name || card.current_representative || "—")}</strong></div>
						<div><span>المنطقة الحالية:</span> <strong>${frappe.utils.escape_html(card.current_region_name || card.current_region || "—")}</strong></div>
						<div><span>تاريخ الاستلام الحالي:</span> <strong dir="ltr">${frappe.utils.escape_html(card.current_received_date || "—")}</strong></div>
					</div>
					<div class="actr-formal-only-note">
						<i class="fa fa-info-circle"></i>
						<span>${frappe.utils.escape_html(data.formal_transfer_note || "مسار النقل يوثق عمليات النقل الرسمية فقط.")}</span>
					</div>
				</div>
			`
				: "";

			$(this.dialog.body).attr("dir", "rtl").html(`
				<div class="archive-card-timeline-shell" dir="rtl">
					<div class="actl-header-summary">
						<div><strong>البطاقة:</strong> ${frappe.utils.escape_html(card.base_card_name || "")} <span class="ac-copy-badge">نسخة ${card.copy_no || 1}</span></div>
						<div><strong>رقم الحساب:</strong> <span dir="ltr">${frappe.utils.escape_html(card.account_number || "")}</span></div>
						<div><strong>رقم البطاقة:</strong> <span dir="ltr">${frappe.utils.escape_html(card.card_number || "")}</span></div>
						<div><strong>عدد مرات النقل:</strong> ${stations.length}</div>
					</div>
					${current_custody_box_html}
					<div class="actr-section-hint">
						يوضح المسار الأفقي التالي انتقال البطاقة من الاستلام الأولي وحتى البطاقة الحالية مرتباً من اليمين إلى اليسار:
					</div>
					${ArchiveCardTransferTimelineDialog.render_horizontal_track(stations)}
				</div>
			`);

			this.dialog.show();
			this.focus_current_station(custody_matches);
		}

		focus_current_station(custody_matches = true) {
			const align_immediately = () => {
				if (!this.dialog || !this.dialog.body) return;
				const $body = $(this.dialog.body);
				const target_node = $body.find('[data-current-station="1"]')[0];
				if (target_node && typeof target_node.scrollIntoView === "function") {
					target_node.scrollIntoView({
						behavior: "instant",
						block: "nearest",
						inline: "center",
					});
				}
				if (!custody_matches) {
					const banner_node = $body.find('[data-role="current-custody-banner"]')[0];
					if (banner_node && typeof banner_node.scrollIntoView === "function") {
						banner_node.scrollIntoView({
							behavior: "instant",
							block: "nearest",
						});
					}
				}
			};

			align_immediately();
			requestAnimationFrame(align_immediately);
			setTimeout(align_immediately, 40);
			if (this.dialog && this.dialog.$wrapper) {
				this.dialog.$wrapper.one("shown.bs.modal", align_immediately);
			}
		}
	}

	class ArchiveCardEventHistoryDialog {
		constructor(options = {}) {
			this.card_name = options.card_name || "";
			this.dialog = null;
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

		static format_recorded_at(raw_dt) {
			const str = String(raw_dt || "").trim();
			if (!str) return "—";
			return str.length > 19 ? str.slice(0, 19) : str;
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

			this.dialog = new frappe.ui.Dialog({
				title: `سجل أحداث البطاقة — ${card.base_card_name || this.card_name}`,
				size: "extra-large",
				primary_action_label: "إغلاق",
				primary_action: () => this.dialog.hide(),
			});

			this.dialog.$wrapper.addClass("archive-card-event-history-modal");

			const current_status_raw = String(card.status || "").trim();
			const current_status_label =
				card.status_display || display_status_label(current_status_raw) || "—";

			const rows_html = events.length
				? events
						.map((ev) => {
							const meta = ArchiveCardEventHistoryDialog.resolve_event_tone(
								ev.event_type
							);
							const ev_label = ev.event_type_label || meta.default_label;
							const prev_raw = String(ev.previous_status || "").trim();
							const prev_label =
								ev.previous_status_display ||
								display_status_label(prev_raw) ||
								"—";
							const new_raw = String(ev.new_status || "").trim();
							const new_label =
								ev.new_status_display ||
								display_status_label(new_raw) ||
								"—";
							const reason_txt = String(ev.reason || "").trim();
							const is_long_reason = reason_txt.length > 75;

							return `
								<tr class="aceh-row tone-${meta.tone}">
									<td class="aceh-td-mono" dir="ltr">${frappe.utils.escape_html(ev.event_date || "—")}</td>
									<td>
										<span class="aceh-event-badge tone-${meta.tone}">
											<i class="fa ${meta.icon}"></i>
											<span>${frappe.utils.escape_html(ev_label)}</span>
										</span>
									</td>
									<td>
										<span class="acvd-status-pill aceh-status-pill" data-status="${frappe.utils.escape_html(prev_raw)}">
											${frappe.utils.escape_html(prev_label)}
										</span>
									</td>
									<td>
										<span class="acvd-status-pill aceh-status-pill" data-status="${frappe.utils.escape_html(new_raw)}">
											${frappe.utils.escape_html(new_label)}
										</span>
									</td>
									<td class="aceh-td-strong" title="${frappe.utils.escape_html(ev.card_owner_name || "—")}">
										${frappe.utils.escape_html(ev.card_owner_name || "—")}
									</td>
									<td class="aceh-td-strong" title="${frappe.utils.escape_html(ev.representative_name || "—")}">
										${frappe.utils.escape_html(ev.representative_name || "—")}
									</td>
									<td title="${frappe.utils.escape_html(ev.region_name || "—")}">
										${frappe.utils.escape_html(ev.region_name || "—")}
									</td>
									<td class="aceh-td-reason">
										${
											reason_txt
												? `
											<div
												class="aceh-reason-text ${is_long_reason ? "is-expandable" : ""}"
												title="${frappe.utils.escape_html(reason_txt)}"
												${is_long_reason ? 'data-action="toggle-reason-expand"' : ""}
											>
												${frappe.utils.escape_html(reason_txt)}
											</div>
										`
												: `<span class="aceh-muted-dash">—</span>`
										}
									</td>
									<td title="${frappe.utils.escape_html(ev.recorded_by_name || ev.recorded_by || "—")}">
										${frappe.utils.escape_html(ev.recorded_by_name || ev.recorded_by || "—")}
									</td>
									<td class="aceh-td-mono aceh-td-timestamp" dir="ltr">
										${frappe.utils.escape_html(ArchiveCardEventHistoryDialog.format_recorded_at(ev.recorded_at))}
									</td>
								</tr>
							`;
						})
						.join("")
				: `
					<tr class="aceh-empty-row">
						<td colspan="10">
							<div class="aceh-empty-state">
								<span class="aceh-empty-icon"><i class="fa fa-list-alt"></i></span>
								<strong class="aceh-empty-title">لا توجد أحداث حالة مسجلة</strong>
								<span class="aceh-empty-subtitle">لم تسجل هذه البطاقة أي انتقالات حالة حتى الآن.</span>
							</div>
						</td>
					</tr>
				`;

			const $body = $(this.dialog.body);
			$body.attr("dir", "rtl").html(`
				<div class="aceh-shell" dir="rtl">
					<div class="aceh-header-bar">
						<div class="aceh-header-group aceh-header-primary">
							<span class="acvd-serial-badge">#${card.serial_no || "—"}</span>
							<strong class="aceh-card-title">${frappe.utils.escape_html(card.base_card_name || card.card_name || "")}</strong>
							<span class="ac-copy-badge">نسخة ${card.copy_no || 1}</span>
						</div>
						<div class="aceh-header-meta">
							<div class="aceh-meta-item">
								<span class="aceh-meta-label">البنك:</span>
								<strong class="aceh-meta-value">${frappe.utils.escape_html(card.bank_name || card.bank || "—")}</strong>
							</div>
							<span class="aceh-meta-divider"></span>
							<div class="aceh-meta-item">
								<span class="aceh-meta-label">رقم الحساب:</span>
								<code class="aceh-meta-code" dir="ltr">${frappe.utils.escape_html(card.account_number || "—")}</code>
							</div>
							<span class="aceh-meta-divider"></span>
							<div class="aceh-meta-item">
								<span class="aceh-meta-label">رقم البطاقة:</span>
								<code class="aceh-meta-code" dir="ltr">${frappe.utils.escape_html(card.card_number || "—")}</code>
							</div>
							<span class="aceh-meta-divider"></span>
							<div class="aceh-meta-item">
								<span class="aceh-meta-label">الحالة الحالية:</span>
								<span class="acvd-status-pill" data-status="${frappe.utils.escape_html(current_status_raw)}">
									${frappe.utils.escape_html(current_status_label)}
								</span>
							</div>
							<span class="aceh-meta-divider"></span>
							<div class="aceh-meta-item">
								<span class="aceh-meta-label">عدد الأحداث:</span>
								<strong class="aceh-meta-count" dir="ltr">${events.length}</strong>
							</div>
						</div>
					</div>

					<div class="aceh-table-card">
						<div class="aceh-table-scroll">
							<table class="aceh-events-table">
								<thead>
									<tr>
										<th class="aceh-col-date">التاريخ الفعلي</th>
										<th class="aceh-col-type">نوع الحدث</th>
										<th class="aceh-col-status">الحالة السابقة</th>
										<th class="aceh-col-status">الحالة الجديدة</th>
										<th class="aceh-col-owner">مالك البطاقة</th>
										<th class="aceh-col-rep">المندوب</th>
										<th class="aceh-col-region">المنطقة</th>
										<th class="aceh-col-reason">السبب / الملاحظة</th>
										<th class="aceh-col-user">سجل بواسطة</th>
										<th class="aceh-col-sysdate">وقت التسجيل بالنظام</th>
									</tr>
								</thead>
								<tbody>
									${rows_html}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			`);

			$body.on("click", '[data-action="toggle-reason-expand"]', (e) => {
				$(e.currentTarget).toggleClass("is-expanded");
			});

			this.dialog.show();
		}
	}

	window.ArchiveCardActivityTimelineDialog = ArchiveCardActivityTimelineDialog;
	window.ArchiveCardTransferTimelineDialog = ArchiveCardTransferTimelineDialog;
	window.ArchiveCardEventHistoryDialog = ArchiveCardEventHistoryDialog;
})();
