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
								<div class="actr-connector-line"></div>
								<i class="fa fa-long-arrow-left actr-connector-arrow"></i>
							</div>
						`
							: "";

					const note_text = st.is_explanatory_current
						? st.explanatory_note || ""
						: st.reason;

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
									<span class="actr-seq-circle">${frappe.utils.escape_html(step_label)}</span>
									<span class="actr-station-badge">${frappe.utils.escape_html(badge_label)}</span>
								</div>
								<div class="aceh-station-status-Transition">
									<div class="aceh-station-result-status">
										<i class="fa ${st.icon}"></i>
										<strong>${frappe.utils.escape_html(st.new_status_label)}</strong>
									</div>
									<div class="actr-station-from aceh-station-prev-status">
										من: ${frappe.utils.escape_html(st.previous_status_label)}
										<i class="fa fa-long-arrow-left"></i>
										إلى: <strong>${frappe.utils.escape_html(st.new_status_label)}</strong>
									</div>
								</div>
								<div class="actr-station-date">
									<i class="fa fa-calendar"></i>
									<span>التاريخ الفعلي: <strong dir="ltr">${frappe.utils.escape_html(st.event_date)}</strong></span>
								</div>
								<div class="actr-station-rep" title="${frappe.utils.escape_html(st.card_owner_name)}">
									<i class="fa fa-id-card-o"></i>
									<span>مالك البطاقة: <strong>${frappe.utils.escape_html(st.card_owner_name)}</strong></span>
								</div>
								<div class="actr-station-region" title="${frappe.utils.escape_html(st.representative_name)}">
									<i class="fa fa-user"></i>
									<span>المندوب: <strong>${frappe.utils.escape_html(st.representative_name)}</strong></span>
								</div>
								<div class="actr-station-region" title="${frappe.utils.escape_html(st.region_name)}">
									<i class="fa fa-map-marker"></i>
									<span>المنطقة: <strong>${frappe.utils.escape_html(st.region_name)}</strong></span>
								</div>
								<div class="actr-station-note" title="${frappe.utils.escape_html(note_text || "—")}">
									${
										st.is_explanatory_current
											? frappe.utils.escape_html(note_text)
											: `السبب: ${frappe.utils.escape_html(note_text || "—")}`
									}
								</div>
								<div class="actr-station-footer">
									<span>بواسطة: ${frappe.utils.escape_html(st.recorded_by_name)}</span>
									<span dir="ltr">${frappe.utils.escape_html(String(st.recorded_at || "—").slice(0, 16))}</span>
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

			return `
				<div class="acvd-transfer-current-box aceh-selected-detail-box status-tone-${st.tone}" data-role="selected-station-details" dir="rtl">
					<div class="aceh-detail-box-header">
						<div class="acvd-transfer-box-title">
							<i class="fa ${st.icon}"></i>
							<span>${frappe.utils.escape_html(title_prefix)}</span>
						</div>
						<div class="aceh-detail-badges">
							${
								st.is_current
									? `<span class="aceh-current-marker-pill">الحالة الحالية</span>`
									: ""
							}
							${
								st.is_explanatory_current
									? `<span class="aceh-explanatory-pill">حالة توضيحية (غير مسجلة كحدث)</span>`
									: `<span class="aceh-event-type-pill">${frappe.utils.escape_html(st.event_type_label)}</span>`
							}
						</div>
					</div>
					<div class="acvd-transfer-box-grid aceh-detail-grid">
						<div><span>التاريخ الفعلي:</span> <strong dir="ltr">${frappe.utils.escape_html(st.event_date)}</strong></div>
						<div><span>الحالة السابقة:</span> <strong>${frappe.utils.escape_html(st.previous_status_label)}</strong></div>
						<div><span>الحالة الجديدة:</span> <strong>${frappe.utils.escape_html(st.new_status_label)}</strong></div>
						<div><span>مالك البطاقة:</span> <strong>${frappe.utils.escape_html(st.card_owner_name)}</strong></div>
						<div><span>المندوب:</span> <strong>${frappe.utils.escape_html(st.representative_name)}</strong></div>
						<div><span>المنطقة:</span> <strong>${frappe.utils.escape_html(st.region_name)}</strong></div>
						<div><span>سجل بواسطة:</span> <strong>${frappe.utils.escape_html(st.recorded_by_name)}</strong></div>
						<div><span>وقت التسجيل بالنظام:</span> <strong dir="ltr">${frappe.utils.escape_html(st.recorded_at)}</strong></div>
					</div>
					<div class="aceh-detail-reason-row">
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

			const $body = $(this.dialog.body);
			$body.attr("dir", "rtl").html(`
				<div class="archive-card-timeline-shell" dir="rtl">
					<div class="actl-header-summary">
						<div><strong>البطاقة:</strong> ${frappe.utils.escape_html(card.base_card_name || card.card_name || "")} <span class="ac-copy-badge">نسخة ${card.copy_no || 1}</span></div>
						<div><strong>البنك:</strong> ${frappe.utils.escape_html(card.bank_name || card.bank || "—")}</div>
						<div><strong>رقم الحساب:</strong> <span dir="ltr">${frappe.utils.escape_html(card.account_number || "—")}</span></div>
						<div><strong>رقم البطاقة:</strong> <span dir="ltr">${frappe.utils.escape_html(card.card_number || "—")}</span></div>
						<div><strong>الحالة الحالية:</strong> <span class="acvd-status-pill" data-status="${frappe.utils.escape_html(current_status_raw)}">${frappe.utils.escape_html(current_status_label)}</span></div>
						<div><strong>عدد الأحداث المسجلة:</strong> <span dir="ltr">${events.length}</span></div>
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
									<i class="fa fa-angle-right"></i> الحالة السابقة
								</button>
								<span class="aceh-nav-pos" data-role="station-pos-indicator"></span>
								<button type="button" class="btn btn-xs btn-default aceh-nav-btn" data-action="station-next">
									الحالة التالية <i class="fa fa-angle-left"></i>
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
