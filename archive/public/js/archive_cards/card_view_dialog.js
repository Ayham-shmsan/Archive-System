(() => {
	"use strict";

	function display_status_label(status) {
		if (typeof window.format_card_status_label === "function") {
			return window.format_card_status_label(status);
		}
		const clean = String(status || "").trim();
		return clean === "موقفة نهائياً" ? "موقفة نهائياً (متلفة)" : clean;
	}

	function format_copy_badge_label(card_type, copy_no) {
		const num = Math.max(1, Number(copy_no || 1));
		const ctype = String(card_type || "").trim();
		if (ctype === "مدى" || ctype === "أعمال") {
			return `${ctype} ${num}`;
		}
		return `نسخة ${num}`;
	}

	class ArchiveCardStatusDialog {
		static open(card, on_done) {
			if (!card || !card.name) return;

			const initial_status = card.status || "نشطة";
			const is_initial_paused = initial_status === "موقفة مؤقتاً";
			const is_initial_perm = initial_status === "موقفة نهائياً";
			const needs_stop_details = is_initial_paused || is_initial_perm;

			const sync_status_fields = (dlg) => {
				const st = dlg.get_value("new_status") || "نشطة";
				const is_paused = st === "موقفة مؤقتاً";
				const is_perm = st === "موقفة نهائياً";
				const is_stop = is_paused || is_perm;

				dlg.set_df_property("event_date", "hidden", is_stop ? 0 : 1);
				dlg.set_df_property("event_date", "reqd", is_stop ? 1 : 0);
				dlg.set_df_property(
					"event_date",
					"label",
					is_paused ? "تاريخ التوقيف المؤقت" : "تاريخ التوقيف النهائي"
				);

				dlg.set_df_property("reason", "hidden", is_stop ? 0 : 1);
				dlg.set_df_property("reason", "reqd", is_stop ? 1 : 0);
				dlg.set_df_property(
					"reason",
					"label",
					is_paused ? "سبب التوقيف المؤقت" : "سبب التوقيف النهائي / الإتلاف"
				);

				const $reason_input = dlg.fields_dict?.reason?.$input;
				if ($reason_input && $reason_input.length) {
					$reason_input.attr(
						"placeholder",
						is_paused
							? "أدخل سبب التوقيف المؤقت للبطاقة..."
							: "أدخل سبب التوقيف النهائي / إتلاف البطاقة..."
					);
				}

				if (!is_stop) {
					dlg.set_value("event_date", "");
					dlg.set_value("reason", "");
				}
			};

			const dialog = new frappe.ui.Dialog({
				title: `تغيير حالة البطاقة — ${card.base_card_name || card.name}`,
				fields: [
					{
						fieldname: "current_status_html",
						fieldtype: "HTML",
						options: `
							<div class="acvd-mini-summary" dir="rtl">
								<div>البطاقة: <strong>${frappe.utils.escape_html(card.base_card_name || "")}</strong> <span class="ac-copy-badge">${frappe.utils.escape_html(card.copy_label || format_copy_badge_label(card.card_type, card.copy_no))}</span></div>
								<div>الحالة الحالية: <span class="acvd-status-pill" data-status="${frappe.utils.escape_html(card.status || "")}">${frappe.utils.escape_html(display_status_label(card.status))}</span></div>
							</div>
						`,
					},
					{
						fieldname: "new_status",
						label: "الحالة الجديدة",
						fieldtype: "Select",
						options: ["نشطة", "موقفة مؤقتاً", "موقفة نهائياً"].join("\n"),
						default: initial_status,
						reqd: 1,
						onchange: () => {
							sync_status_fields(dialog);
						},
					},
					{
						fieldname: "event_date",
						label: is_initial_paused ? "تاريخ التوقيف المؤقت" : "تاريخ التوقيف النهائي",
						fieldtype: "Date",
						default: "",
						hidden: needs_stop_details ? 0 : 1,
						reqd: needs_stop_details ? 1 : 0,
					},
					{
						fieldname: "reason",
						label: is_initial_paused
							? "سبب التوقيف المؤقت"
							: "سبب التوقيف النهائي / الإتلاف",
						fieldtype: "Small Text",
						default: is_initial_perm ? card.status_reason || "" : "",
						hidden: needs_stop_details ? 0 : 1,
						reqd: needs_stop_details ? 1 : 0,
						placeholder: is_initial_paused
							? "أدخل سبب التوقيف المؤقت للبطاقة..."
							: "أدخل سبب التوقيف النهائي / إتلاف البطاقة...",
					},
				],
				primary_action_label: "اعتماد الحالة",
				primary_action: async () => {
					const target_status = String(dialog.get_value("new_status") || "").trim();
					const clean_date = String(dialog.get_value("event_date") || "").trim();
					const clean_reason = String(dialog.get_value("reason") || "").trim();

					if (target_status === "موقفة مؤقتاً") {
						if (!clean_date) {
							frappe.msgprint({
								title: "تاريخ التوقيف المؤقت مطلوب",
								message: "يرجى إدخال تاريخ التوقيف المؤقت للبطاقة.",
								indicator: "red",
							});
							return;
						}
						if (!clean_reason) {
							frappe.msgprint({
								title: "سبب التوقيف المؤقت مطلوب",
								message: "يرجى إدخال سبب التوقيف المؤقت للبطاقة.",
								indicator: "red",
							});
							return;
						}
					} else if (target_status === "موقفة نهائياً") {
						if (!clean_date) {
							frappe.msgprint({
								title: "تاريخ التوقيف النهائي مطلوب",
								message: "يرجى إدخال تاريخ التوقيف النهائي للبطاقة.",
								indicator: "red",
							});
							return;
						}
						if (!clean_reason) {
							frappe.msgprint({
								title: "سبب التوقيف النهائي / الإتلاف مطلوب",
								message: "يرجى إدخال سبب التوقيف النهائي / إتلاف البطاقة.",
								indicator: "red",
							});
							return;
						}
					}

					dialog.get_primary_btn().prop("disabled", true);
					try {
						const res = await frappe.call({
							method: "archive.api.cards.change_card_status",
							args: {
								card: card.name,
								new_status: target_status,
								event_date:
									target_status === "موقفة مؤقتاً" ||
									target_status === "موقفة نهائياً"
										? clean_date
										: "",
								reason:
									target_status === "موقفة مؤقتاً" ||
									target_status === "موقفة نهائياً"
										? clean_reason
										: "",
							},
						});
						frappe.show_alert({
							message: "تم تحديث حالة البطاقة بنجاح.",
							indicator: "green",
						});
						dialog.hide();
						if (typeof on_done === "function") {
							await on_done(res?.message);
						}
					} finally {
						dialog.get_primary_btn().prop("disabled", false);
					}
				},
				secondary_action_label: "إلغاء",
				secondary_action: () => dialog.hide(),
			});

			const $status_select = dialog.fields_dict?.new_status?.$input;
			if ($status_select && $status_select.length) {
				$status_select
					.find('option[value="موقفة نهائياً"]')
					.text("موقفة نهائياً (متلفة)");
			}
			sync_status_fields(dialog);

			$(dialog.body).attr("dir", "rtl");
			dialog.show();
		}
	}

	class ArchiveCardTransferDialog {
		static open(card, on_done) {
			if (!card || !card.name) return;

			const dialog = new frappe.ui.Dialog({
				title: `نقل عهدة البطاقة — ${card.base_card_name || card.name}`,
				fields: [
					{
						fieldname: "current_custody_html",
						fieldtype: "HTML",
						options: `
							<div class="acvd-transfer-current-box" dir="rtl">
								<div class="acvd-transfer-box-title">العهدة الحالية</div>
								<div class="acvd-transfer-box-grid">
									<div><span>المندوب الحالي:</span> <strong>${frappe.utils.escape_html(card.representative_name || card.representative || "—")}</strong></div>
									<div><span>المنطقة الحالية:</span> <strong>${frappe.utils.escape_html(card.region_name || card.region || "—")}</strong></div>
									<div><span>تاريخ الاستلام الحالي:</span> <strong dir="ltr">${frappe.utils.escape_html(card.received_date || "—")}</strong></div>
								</div>
							</div>
						`,
					},
					{
						fieldname: "to_region",
						label: "المنطقة الجديدة",
						fieldtype: "Link",
						options: "Archive Region",
						default: card.region || "",
						reqd: 1,
					},
					{
						fieldname: "to_representative",
						label: "المندوب الجديد",
						fieldtype: "Link",
						options: "Archive Representative",
						reqd: 1,
					},
					{
						fieldname: "new_received_date",
						label: "تاريخ الاستلام الجديد",
						fieldtype: "Date",
						default: frappe.datetime.get_today(),
						reqd: 1,
					},
					{
						fieldname: "transfer_note",
						label: "ملاحظات النقل",
						fieldtype: "Small Text",
						placeholder: "أدخل سبب أو ملاحظات نقل العهدة...",
					},
				],
				primary_action_label: "تنفيذ نقل العهدة",
				primary_action: async (values) => {
					if (values.to_representative === card.representative) {
						frappe.msgprint({
							title: "تنبيه",
							message: "لا يمكن نقل البطاقة إلى نفس المندوب الحالي.",
							indicator: "orange",
						});
						return;
					}

					dialog.get_primary_btn().prop("disabled", true);
					try {
						const res = await frappe.call({
							method: "archive.api.cards.transfer_card",
							args: {
								card: card.name,
								to_region: values.to_region,
								to_representative: values.to_representative,
								new_received_date: values.new_received_date,
								transfer_note: values.transfer_note || "",
							},
						});
						frappe.show_alert({
							message: "تم نقل عهدة البطاقة وتسجيل الحالة بنجاح.",
							indicator: "green",
						});
						dialog.hide();
						if (typeof on_done === "function") {
							await on_done(res?.message);
						}
					} finally {
						dialog.get_primary_btn().prop("disabled", false);
					}
				},
				secondary_action_label: "إلغاء",
				secondary_action: () => dialog.hide(),
			});

			$(dialog.body).attr("dir", "rtl");
			dialog.show();
		}
	}

	class ArchiveCardDeleteDialog {
		static open(card, on_done) {
			if (!card || !card.name) return;

			const dialog = new frappe.ui.Dialog({
				title: `تأكيد حذف البطاقة — ${card.base_card_name || card.name}`,
				fields: [
					{
						fieldname: "warning_html",
						fieldtype: "HTML",
						options: `
							<div class="acvd-delete-warning-box" dir="rtl">
								<div class="acvd-delete-warning-title">
									<i class="fa fa-exclamation-triangle"></i>
									<span>تأكيد الحذف التشغيلي للبطاقة</span>
								</div>
								<p>
									سيتم إخفاء البطاقة <strong>${frappe.utils.escape_html(card.base_card_name || "")}</strong>
									(رقم الحساب: <code dir="ltr">${frappe.utils.escape_html(card.account_number || "")}</code> — ${frappe.utils.escape_html(card.copy_label || format_copy_badge_label(card.card_type, card.copy_no))})
									من شاشة البطاقات والإحصائيات مع الاحتفاظ بسجلها التاريخي وتسلسل نسخ العائلة.
								</p>
							</div>
						`,
					},
					{
						fieldname: "reason",
						label: "سبب الحذف",
						fieldtype: "Small Text",
						reqd: 1,
						placeholder: "أدخل سبب حذف البطاقة...",
					},
				],
				primary_action_label: "تأكيد حذف البطاقة",
				primary_action: async (values) => {
					const clean_reason = String(values.reason || "").trim();
					if (!clean_reason) {
						frappe.msgprint({
							title: "سبب الحذف مطلوب",
							message: "يرجى إدخال سبب حذف البطاقة.",
							indicator: "red",
						});
						return;
					}
					dialog.get_primary_btn().prop("disabled", true);
					try {
						const res = await frappe.call({
							method: "archive.api.cards.delete_card",
							args: {
								card: card.name,
								reason: clean_reason,
							},
						});
						frappe.show_alert({
							message: "تم حذف البطاقة بنجاح.",
							indicator: "green",
						});
						dialog.hide();
						if (typeof on_done === "function") {
							await on_done(res?.message);
						}
					} finally {
						dialog.get_primary_btn().prop("disabled", false);
					}
				},
				secondary_action_label: "إلغاء",
				secondary_action: () => dialog.hide(),
			});

			dialog.get_primary_btn().removeClass("btn-primary").addClass("btn-danger");
			$(dialog.body).attr("dir", "rtl");
			dialog.show();
		}
	}

	class ArchiveCardViewDialog {
		constructor(options = {}) {
			this.card_name = options.card_name || "";
			this.on_changed = options.on_changed || null;

			this.dialog = null;
			this.card = null;
			this.family = null;
			this.permissions = {};
			this.controls = {};

			this.revealed_pin = null;
			this.is_pin_shown = false;
			this.is_editing_pin = false;
			this.new_pin_visible = false;

			this.staged_images = { front: null, back: null };
			this.original_staged_images = { front: null, back: null };
			this.preview_urls = { front: null, back: null };
			this.original_preview_urls = { front: null, back: null };
			this.edit_metas = { front: undefined, back: undefined };
			this.replaced_sides = { front: false, back: false };
			this.all_staged_file_ids = new Set();
			this.saved_changes = false;
			this.is_dirty = false;
			this.revealed_image_sides = { front: false, back: false };
			this.revealing_image_sides = { front: false, back: false };
		}

		is_side_image_blurred(side) {
			if (this.replaced_sides?.[side] || this.preview_urls?.[side]) return false;
			if (!this.permissions?.enforce_image_blur) return false;
			return !Boolean(this.revealed_image_sides?.[side]);
		}

		async reveal_blurred_card_image(side) {
			const clean_side = side === "back" ? "back" : "front";
			if (!this.card?.name || !this.permissions.can_view_images) return;
			if (!this.permissions.enforce_image_blur) return;
			if (this.revealed_image_sides[clean_side] || this.revealing_image_sides[clean_side]) return;

			const img_url = this._resolve_current_image_url(clean_side);
			if (!img_url) return;

			const card_name = this.card.name;
			this.revealing_image_sides[clean_side] = true;

			const $body = $(this.dialog?.body);
			const $frame = $body.find(`.acd-card-aspect-frame[data-side="${clean_side}"]`);
			$frame.addClass("is-revealing");

			try {
				const res = await frappe.call({
					method: "archive.api.cards.reveal_card_image_blur",
					args: { card: card_name, side: clean_side },
				});
				if (!this.dialog || this.card?.name !== card_name) return;
				if (res?.message?.revealed) {
					this.revealed_image_sides[clean_side] = true;
					const $liveFrame = $body.find(`.acd-card-aspect-frame[data-side="${clean_side}"]`);
					$liveFrame
						.removeClass("is-blurred is-revealing")
						.attr("data-action", "open-viewer");
					$liveFrame.find('[data-role="blur-overlay"]').remove();
					$body
						.find(`.acd-image-slot-header [data-action="open-viewer"][data-side="${clean_side}"]`)
						.prop("disabled", false);
				}
			} catch (_) {
				// Keep blurred on error
			} finally {
				if (this.card?.name === card_name) {
					this.revealing_image_sides[clean_side] = false;
					$body
						.find(`.acd-card-aspect-frame[data-side="${clean_side}"]`)
						.removeClass("is-revealing");
				}
			}
		}

		is_permanently_stopped() {
			return String(this.card?.status || "").trim() === "موقفة نهائياً";
		}

		can_edit_data() {
			return Boolean(this.permissions.can_edit) && !this.is_permanently_stopped();
		}

		can_edit_card_images() {
			return Boolean(this.permissions.can_edit_images) && !this.is_permanently_stopped();
		}

		can_preview_card_images() {
			const has_role =
				typeof this.permissions.can_preview_card_images === "boolean"
					? this.permissions.can_preview_card_images
					: Boolean(frappe?.user?.has_role?.("صلاحية معاينة البطائق"));
			return Boolean(
				has_role && this.permissions.can_view_images && !this.is_permanently_stopped()
			);
		}

		can_save_any() {
			return (
				this.can_edit_data() ||
				this.can_edit_card_images() ||
				this.can_preview_card_images()
			);
		}

		sync_dialog_actions() {
			if (!this.dialog) return;
			const can_save = this.can_save_any();
			const $primary = this.dialog.get_primary_btn();
			const $secondary = this.dialog.get_secondary_btn();
			if ($primary && $primary.length) {
				$primary.text(can_save ? "حفظ التعديلات" : "إغلاق");
			}
			if ($secondary && $secondary.length) {
				$secondary.toggleClass("hide", !can_save).prop("hidden", !can_save);
			}
		}

		async show() {
			if (!this.card_name) return;

			const res = await frappe.call({
				method: "archive.api.cards.get_card_details",
				args: { card: this.card_name },
			});
			const data = res?.message || {};
			this.card = data.card || {};
			this.family = data.family || {};
			this.permissions = data.permissions || {};

			const can_save = this.can_save_any();

			this.dialog = new frappe.ui.Dialog({
				title: `بطاقة: ${this.card.base_card_name || this.card.name}`,
				size: "extra-large",
				primary_action_label: can_save ? "حفظ التعديلات" : "إغلاق",
				primary_action: () => {
					if (this.can_save_any()) {
						this.handle_save();
					} else {
						this.dialog.hide();
					}
				},
				secondary_action_label: "إغلاق",
				secondary_action: () => this.dialog.hide(),
			});

			this.dialog.$wrapper.addClass("archive-card-view-modal");
			this.sync_dialog_actions();
			this.render_body();
			this.bind_events();

			this.dialog.onhide = () => {
				this.family_autocomplete?.destroy();
				this.family_autocomplete = null;
				this.cleanup_unused_staged_files();
			};

			this.dialog.show();
		}

		render_body() {
			const c = this.card;
			const fam = this.family;
			const p = this.permissions;
			const $body = $(this.dialog.body);

			const siblings = Array.isArray(fam.active_cards) ? fam.active_cards : [];
			const siblings_html =
				siblings.length > 1
					? `
				<div class="acd-section-card acvd-siblings-card">
					<div class="acd-section-header">
						<span class="acd-section-title">نسخ البطاقات المرتبطة بنفس رقم الحساب (${siblings.length})</span>
						<span class="acd-section-subtitle">اسم البطاقة الأساسي: <strong>${frappe.utils.escape_html(fam.base_card_name || c.base_card_name)}</strong></span>
					</div>
						<div class="acvd-siblings-list">
						${siblings
							.map(
								(s) => `
							<div class="acvd-sibling-chip ${s.name === c.name ? "is-current" : ""}">
								<span class="ac-copy-badge acvd-sib-copy">${frappe.utils.escape_html(s.copy_label || format_copy_badge_label(s.card_type, s.copy_no))}</span>
								<strong>${frappe.utils.escape_html(s.base_card_name || fam.base_card_name || c.base_card_name || "")}</strong>
								<span class="text-muted" dir="ltr">${frappe.utils.escape_html(s.card_number)}</span>
								<span class="acvd-status-pill" data-status="${frappe.utils.escape_html(s.status)}">${frappe.utils.escape_html(display_status_label(s.status))}</span>
							</div>
						`
							)
							.join("")}
					</div>
				</div>
			`
					: "";

			$body.empty().attr("dir", "rtl").html(`
				<div class="archive-card-dialog-shell" dir="rtl">
					<div class="acvd-top-bar">
						<div class="acvd-identity-badges">
							<span class="acvd-serial-badge">رقم تسلسلي #${c.serial_no}</span>
							<span class="ac-copy-badge acd-copy-pill">${frappe.utils.escape_html(c.copy_label || format_copy_badge_label(c.card_type, c.copy_no))}</span>
							<span class="acvd-status-pill" data-status="${frappe.utils.escape_html(c.status)}">${frappe.utils.escape_html(display_status_label(c.status))}</span>
							${
								c.status_reason
									? `<span class="acvd-status-reason" title="سبب الحالة">${frappe.utils.escape_html(c.status_reason)}</span>`
									: ""
							}
						</div>

						<div class="acvd-quick-actions">
							${
								p.can_view_transfer_timeline || p.can_view_card_event_history
									? `<div class="archive-cards-dropdown-wrap" data-role="view-timeline-events-dropdown-wrap">
										<button type="button" class="btn btn-xs btn-default" data-action="toggle-view-timeline-events-menu">
											<i class="fa fa-road"></i> المسار والأحداث <i class="fa fa-caret-down"></i>
										</button>
										<div class="archive-cards-popover-menu" data-role="view-timeline-events-menu" hidden>
											${
												p.can_view_transfer_timeline
													? `<button type="button" class="ac-menu-item" data-action="open-transfer-timeline">
														<i class="fa fa-road"></i> مسار نقل البطاقة 
													</button>`
													: ""
											}
											${
												p.can_view_card_event_history
													? `<button type="button" class="ac-menu-item" data-action="open-card-event-history">
														<i class="fa fa-list-alt"></i> أحداث البطاقة
													</button>`
													: ""
											}
										</div>
									</div>`
									: ""
							}
							${
								p.can_view_activity_timeline
									? `<button type="button" class="btn btn-xs btn-default" data-action="open-activity-timeline">
										<i class="fa fa-history"></i> مسار العملية
									</button>`
									: ""
							}
							${
								p.can_change_status &&
								(String(c.status || "").trim() !== "موقفة نهائياً" ||
									p.can_reactivate_permanently_stopped_card)
									? `<button type="button" class="btn btn-xs btn-default" data-action="open-status-dialog">
										<i class="fa fa-refresh"></i> تغيير الحالة
									</button>`
									: ""
							}
							${
								p.can_transfer &&
								(String(c.status || "").trim() !== "موقفة نهائياً" ||
									p.can_reactivate_permanently_stopped_card)
									? `<button type="button" class="btn btn-xs btn-default" data-action="open-transfer-dialog">
										<i class="fa fa-exchange"></i> نقل البطاقة
									</button>`
									: ""
							}
							${
								p.can_delete
									? `<button type="button" class="btn btn-xs btn-danger" data-action="open-delete-dialog">
										<i class="fa fa-trash"></i> حذف
									</button>`
									: ""
							}
						</div>
					</div>

					<div class="acd-grid-layout">
						<div class="acd-form-column">
							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">بيانات البطاقة</span>
									<span class="acd-section-subtitle">الاسم المعروض الحالي: <strong>${frappe.utils.escape_html(c.base_card_name)}</strong></span>
								</div>
								<div class="acd-fields-grid acd-cols-2">
									<div class="acd-field-slot" data-field-slot="base_card_name"></div>
									<div class="acd-field-slot" data-field-slot="bank"></div>
									<div class="acd-field-slot" data-field-slot="account_number"></div>
									<div class="acd-field-slot" data-field-slot="card_type"></div>
									<div class="acd-field-slot" data-field-slot="card_number"></div>
								</div>
							</div>

							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">بيانات المندوب والمالك</span>
									<span class="acd-section-subtitle">لتسجيل حالة انتقال جديدة استخدم زر (نقل البطاقة)</span>
								</div>
								<div class="acd-fields-grid acd-cols-3">
									<div class="acd-field-slot" data-field-slot="card_owner"></div>
									<div class="acd-field-slot" data-field-slot="daily_limit"></div>
									<div class="acd-field-slot" data-field-slot="received_date"></div>
									<div class="acd-field-slot" data-field-slot="representative"></div>
									<div class="acd-field-slot" data-field-slot="region"></div>
								</div>
							</div>

							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">الرقم السري (PIN)</span>
								</div>
								<div class="acvd-pin-section-row">
									<div class="acvd-pin-read-box">
										<span class="acvd-pin-label">الرقم السري المحفوظ:</span>
										<code class="acvd-pin-mask" data-role="pin-display" dir="ltr">••••</code>
										${
											p.can_view_pin
												? `<button type="button" class="btn btn-xs btn-default" data-action="reveal-pin" title="إظهار / إخفاء الرقم السري">
													<i class="fa fa-eye"></i> <span>إظهار</span>
												</button>`
												: ""
										}
									</div>

									${
										this.can_edit_data() && p.can_view_pin
											? `
										<div class="acvd-pin-update-box">
											<button type="button" class="btn btn-xs btn-default" data-action="toggle-edit-pin">
												<i class="fa fa-key"></i> تغيير الرقم السري
											</button>
											<div class="acvd-new-pin-wrap" data-role="new-pin-wrap" hidden>
												<input
													type="password"
													class="form-control input-xs acd-pin-input"
													data-role="new-pin-input"
													placeholder="الرقم السري الجديد (4 أرقام)"
													inputmode="numeric"
												/>
												<button type="button" class="btn btn-xs btn-default" data-action="toggle-new-pin-eye">
													<i class="fa fa-eye"></i>
												</button>
											</div>
										</div>
									`
											: ""
									}
								</div>
							</div>

							${siblings_html}
						</div>

						<div class="acd-images-column">
							<div class="acd-section-card acd-images-section">
								<div class="acd-section-header">
									<span class="acd-section-title">صور البطاقة</span>
									<span class="acd-section-subtitle">انقر للتكبير أو بالزر الأيمن للخيارات</span>
								</div>
								<div class="acd-image-slots-stack">
									${this.render_view_image_slot("front", "الوجه الأمامي", c.front_image_url)}
									${this.render_view_image_slot("back", "الوجه الخلفي", c.back_image_url)}
								</div>
							</div>
						</div>
					</div>
				</div>
			`);

			this.make_controls($body);
		}

		render_view_image_slot(side, label, url) {
			const can_view = Boolean(this.permissions.can_view_images);
			const can_replace = Boolean(this.can_edit_card_images() && can_view);
			const can_preview_edit = Boolean(this.can_preview_card_images() && can_view);

			if (!can_view) {
				return `
					<div class="acd-image-slot-card">
						<div class="acd-image-slot-header">
							<span class="acd-image-slot-label">${label}</span>
						</div>
						<div class="acd-card-aspect-frame is-protected">
							<div class="acd-image-empty-state">
								<i class="fa fa-lock"></i>
								<span>الصورة محمية</span>
								<small>ليست لديك صلاحية عرض صور البطاقات</small>
							</div>
						</div>
					</div>
				`;
			}

			const has_img = Boolean(url);
			const is_blurred = Boolean(has_img && this.is_side_image_blurred(side));
			const replace_label = has_img ? "تبديل الصورة" : "إضافة صورة";

			return `
				<div class="acd-image-slot-card" data-view-image-slot="${side}">
					<div class="acd-image-slot-header">
						<span class="acd-image-slot-label">${label}</span>
						<div class="acd-image-slot-actions">
							<button type="button" class="btn btn-xs btn-default" data-action="open-viewer" data-side="${side}" ${has_img ? "" : "hidden"} ${is_blurred ? "disabled" : ""}>
								<i class="fa fa-search-plus"></i> تكبير
							</button>
							${
								can_preview_edit
									? `<button type="button" class="btn btn-xs btn-default acd-slot-preview-edit-btn" data-action="preview-edit-image" data-side="${side}" ${has_img ? "" : "hidden"}>
										<i class="fa fa-sliders"></i> معاينة
									</button>`
									: ""
							}
							${
								can_replace
									? `<button type="button" class="btn btn-xs btn-default" data-action="replace-image" data-side="${side}">
										<i class="fa fa-upload"></i> ${replace_label}
									</button>`
									: ""
							}
						</div>
					</div>
					<div
						class="acd-card-aspect-frame ${is_blurred ? "is-blurred" : ""}"
						data-card-image-surface="1"
						data-side="${side}"
						data-action="${is_blurred ? "reveal-blurred-image" : "open-viewer"}"
					>
						<div class="acd-image-empty-state" data-role="empty-${side}" ${has_img ? "hidden" : ""}>
							<i class="fa fa-credit-card"></i>
							<span>لا توجد صورة</span>
						</div>
						<img
							src="${frappe.utils.escape_html(url || "")}"
							alt="${label}"
							class="acd-image-preview"
							data-role="view-img-${side}"
							${has_img ? "" : "hidden"}
						/>
						${
							is_blurred
								? `<div class="ac-image-blur-overlay" data-role="blur-overlay" data-side="${side}">
									<div class="ac-image-blur-badge">
										<span class="ac-image-blur-icon" aria-hidden="true">
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
												<line x1="1" y1="1" x2="23" y2="23"></line>
											</svg>
										</span>
										<span class="ac-image-blur-text">اضغط لإظهار الصورة</span>
									</div>
								</div>`
								: ""
						}
						<div class="acd-image-uploading" data-role="uploading-${side}" hidden>
							<i class="fa fa-spinner fa-spin"></i> جاري رفع الصورة...
						</div>
					</div>
					<input
						type="file"
						accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
						data-role="replace-input-${side}"
						hidden
					/>
				</div>
			`;
		}

		make_controls($body) {
			const c = this.card;
			const read_only = !this.can_edit_data() ? 1 : 0;

			const defs = [
				{
					slot: "account_number",
					val: c.account_number,
					df: {
						fieldname: "account_number",
						label: "رقم الحساب",
						fieldtype: "Data",
						reqd: 1,
						read_only,
					},
				},
				{
					slot: "base_card_name",
					val: c.base_card_name,
					df: {
						fieldname: "base_card_name",
						label: "اسم البطاقة الأساسي",
						fieldtype: "Data",
						reqd: 1,
						read_only,
					},
				},
				{
					slot: "card_number",
					val: c.card_number,
					df: {
						fieldname: "card_number",
						label: "رقم البطاقة",
						fieldtype: "Data",
						reqd: 1,
						read_only,
					},
				},
				{
					slot: "bank",
					val: c.bank,
					df: {
						fieldname: "bank",
						label: "البنك",
						fieldtype: "Link",
						options: "Archive Bank",
						reqd: 1,
						read_only,
					},
				},
				{
					slot: "card_type",
					val: c.card_type || "",
					df: {
						fieldname: "card_type",
						label: "نوع البطاقة",
						fieldtype: "Select",
						options: ["", "مدى", "أعمال"],
						reqd: c.card_type ? 1 : 0,
						read_only,
					},
				},
				{
					slot: "card_owner",
					val: c.card_owner,
					df: {
						fieldname: "card_owner",
						label: "مالك البطاقة",
						fieldtype: "Link",
						options: "Archive Account",
						reqd: 1,
						read_only,
					},
				},
				{
					slot: "daily_limit",
					val: c.daily_limit_formatted || "",
					df: {
						fieldname: "daily_limit",
						label: "الحد اليومي",
						fieldtype: "Data",
						reqd: 1,
						read_only,
						placeholder: "0.00",
					},
				},
				{
					slot: "region",
					val: c.region,
					df: {
						fieldname: "region",
						label: "المنطقة",
						fieldtype: "Link",
						options: "Archive Region",
						reqd: 1,
						read_only,
					},
				},
				{
					slot: "representative",
					val: c.representative,
					df: {
						fieldname: "representative",
						label: "المندوب",
						fieldtype: "Link",
						options: "Archive Representative",
						reqd: 1,
						read_only,
					},
				},
				{
					slot: "received_date",
					val: c.received_date,
					df: {
						fieldname: "received_date",
						label: "تاريخ الاستلام",
						fieldtype: "Date",
						reqd: 1,
						read_only,
					},
				},
			];

			defs.forEach(({ slot, val, df }) => {
				const $parent = $body.find(`[data-field-slot="${slot}"]`);
				const ctrl = frappe.ui.form.make_control({
					parent: $parent[0],
					df,
					render_input: true,
				});
				ctrl.refresh();
				ctrl.set_value(val || "");
				this.controls[df.fieldname] = ctrl;
			});

			this.manual_daily_limit_value = c.daily_limit_formatted || "";
			this.is_daily_limit_locked = false;
			this.is_applying_shared_limit = false;
			this._identity_check_req_id = 0;

			if (window.ArchiveCardDailyLimitInput) {
				window.ArchiveCardDailyLimitInput.bind(this.controls.daily_limit);
			}

			this.controls.daily_limit?.$input?.on("input change", () => {
				if (!this.is_daily_limit_locked && !this.is_applying_shared_limit) {
					this.manual_daily_limit_value = String(
						this.controls.daily_limit?.get_value() || ""
					).trim();
				}
			});

			this.family_autocomplete?.destroy();
			this.family_autocomplete = null;
			if (this.can_edit_data() && window.ArchiveCardFamilyAutocomplete) {
				this.family_autocomplete = new window.ArchiveCardFamilyAutocomplete({
					dialog: this.dialog,
					controls: {
						base_card_name: this.controls.base_card_name,
						account_number: this.controls.account_number,
						bank: this.controls.bank,
						card_type: this.controls.card_type,
					},
					enabled_provider: () => this.can_edit_data(),
					on_account_changed: (acc, meta) => this.handle_identity_fields_changed(meta),
					initial_values: {
						base_card_name: c.base_card_name || "",
						account_number: c.account_number || "",
						bank: c.bank || "",
						card_type: c.card_type || "",
					},
				});
			}
		}

		set_daily_limit_control_value(val) {
			const ctrl = this.controls.daily_limit;
			if (!ctrl) return;
			const str_val = String(val ?? "");
			this.is_applying_shared_limit = true;
			try {
				ctrl.value = str_val;
				if (ctrl.$input && ctrl.$input.length) {
					ctrl.$input.val(str_val);
				}
				ctrl.set_value(str_val, true);
			} finally {
				this.is_applying_shared_limit = false;
			}
		}

		apply_target_group_limit_state(info) {
			const ctrl = this.controls.daily_limit;
			if (!ctrl || !this.can_edit_data()) return;

			if (
				info &&
				info.family_exists &&
				info.shared_daily_limit !== null &&
				info.shared_daily_limit !== undefined
			) {
				this.is_daily_limit_locked = true;
				const formatted =
					info.shared_daily_limit_formatted ||
					(window.ArchiveCardDailyLimitInput
						? window.ArchiveCardDailyLimitInput.format_number_value(info.shared_daily_limit)
						: String(info.shared_daily_limit));
				this.set_daily_limit_control_value(formatted);
				if (ctrl.df) ctrl.df.read_only = 1;
				ctrl.$input
					?.prop("readonly", true)
					.attr("readonly", "readonly")
					.addClass("acd-readonly-shared-limit");
				ctrl.$wrapper?.addClass("acd-shared-limit-locked");
			} else {
				const was_locked = this.is_daily_limit_locked;
				this.is_daily_limit_locked = false;
				if (ctrl.df) ctrl.df.read_only = 0;
				ctrl.$input
					?.prop("readonly", false)
					.removeAttr("readonly")
					.removeClass("acd-readonly-shared-limit");
				ctrl.$wrapper?.removeClass("acd-shared-limit-locked");

				const cur_type = String(this.controls.card_type?.get_value() || "").trim();
				const orig_type = String(this.card?.card_type || "").trim();
				let candidate_val = was_locked
					? this.manual_daily_limit_value || ""
					: String(ctrl.get_value() || this.manual_daily_limit_value || "").trim();

				// Do not let مدى inherit أعمال limit or vice versa when switching to a brand new type group
				if (cur_type && orig_type && cur_type !== orig_type && window.ArchiveCardDailyLimitInput) {
					const num_val = Number(String(candidate_val).replace(/,/g, ""));
					if (Number.isFinite(num_val) && num_val > 0) {
						const check = window.ArchiveCardDailyLimitInput.validate_for_card_type(
							num_val,
							cur_type,
							{ silent: true }
						);
						if (!check) {
							candidate_val = "";
						}
					}
				}
				this.set_daily_limit_control_value(candidate_val);
			}
		}

		update_header_copy_badge(card_type, copy_no) {
			const label = format_copy_badge_label(card_type, copy_no || 1);
			this.dialog?.$wrapper?.find(".acd-copy-pill").text(label);
		}

		async handle_identity_fields_changed(meta = {}) {
			if (!this.can_edit_data() || !this.card) return;
			const cur_base = String(this.controls.base_card_name?.get_value() || "").trim();
			const cur_acc = String(this.controls.account_number?.get_value() || "").trim();
			const cur_bank = String(this.controls.bank?.get_value() || "").trim();
			const cur_type = String(this.controls.card_type?.get_value() || "").trim();

			const norm_cur_acc = window.ArchiveCardFamilyAutocomplete
				? window.ArchiveCardFamilyAutocomplete.normalize_account(cur_acc)
				: cur_acc.replace(/[\s\-_]+/g, "").toUpperCase();
			const norm_orig_acc = window.ArchiveCardFamilyAutocomplete
				? window.ArchiveCardFamilyAutocomplete.normalize_account(this.card.account_number || "")
				: String(this.card.account_number || "")
						.replace(/[\s\-_]+/g, "")
						.toUpperCase();

			const same_quad =
				norm_cur_acc === norm_orig_acc &&
				cur_base.toLowerCase() === String(this.card.base_card_name || "").trim().toLowerCase() &&
				cur_bank === String(this.card.bank || "").trim() &&
				cur_type === String(this.card.card_type || "").trim();

			if (same_quad) {
				this._identity_check_req_id += 1;
				this.apply_target_group_limit_state(null);
				this.update_header_copy_badge(cur_type, this.card.copy_no || 1);
				return;
			}

			if (!norm_cur_acc || !cur_base || !cur_bank) {
				this._identity_check_req_id += 1;
				this.apply_target_group_limit_state(null);
				this.update_header_copy_badge(cur_type, 1);
				return;
			}

			const matched =
				meta?.matched_family ||
				meta?.matched_item ||
				this.family_autocomplete?.find_by_triplet(cur_base, cur_acc, cur_bank, cur_type);
			if (
				matched &&
				matched.shared_daily_limit !== null &&
				matched.shared_daily_limit !== undefined
			) {
				this.apply_target_group_limit_state({
					family_exists: true,
					shared_daily_limit: matched.shared_daily_limit,
					shared_daily_limit_formatted: matched.shared_daily_limit_formatted,
				});
				this.update_header_copy_badge(cur_type, (Number(matched.active_count) || 1) + 1);
			} else {
				this.apply_target_group_limit_state(null);
				this.update_header_copy_badge(cur_type, 1);
			}

			const req_id = ++this._identity_check_req_id;
			try {
				const res = await frappe.call({
					method: "archive.api.cards.check_duplicate_account",
					args: {
						account_number: cur_acc,
						base_card_name: cur_base,
						bank: cur_bank,
						card_type: cur_type,
						exclude_card: this.card.name,
					},
				});
				if (req_id !== this._identity_check_req_id) return;
				const info = res?.message || null;
				this.apply_target_group_limit_state(info);
				const expected_copy = info?.family_exists ? info.expected_copy_no || 2 : 1;
				this.update_header_copy_badge(cur_type, expected_copy);
			} catch (e) {
				// Ignore transient network errors during typing
			}
		}

		_resolve_current_image_url(side) {
			if (this.preview_urls[side]) return this.preview_urls[side];
			return side === "back" ? this.card.back_image_url : this.card.front_image_url;
		}

		_resolve_original_image_url(side) {
			if (this.original_preview_urls[side]) return this.original_preview_urls[side];
			return side === "back"
				? this.card.back_original_image_url || this.card.back_image_url
				: this.card.front_original_image_url || this.card.front_image_url;
		}

		_resolve_current_edit_meta(side) {
			if (this.edit_metas[side] !== undefined) return this.edit_metas[side];
			return (side === "back" ? this.card.back_edit_meta : this.card.front_edit_meta) || null;
		}

		_resolve_saved_edit_meta(side) {
			if (this.replaced_sides[side]) {
				return this.edit_metas[side] || null;
			}
			const db_meta =
				(side === "back" ? this.card.back_edit_meta : this.card.front_edit_meta) || null;
			if (this.edit_metas[side] !== undefined && this.edit_metas[side]) {
				return this.edit_metas[side];
			}
			return db_meta;
		}

		bind_events() {
			const $body = $(this.dialog.body);

			// Right-click context menu on images
			if (window.ArchiveCardImageContextMenu) {
				window.ArchiveCardImageContextMenu.bind($body, ($el) => {
					const side = $el.attr("data-side") || "front";
					if (this.is_side_image_blurred(side)) return null;
					return {
						can_view_images: Boolean(this.permissions.can_view_images),
						can_replace: this.can_edit_card_images(),
						card_name: this.card.name,
						card_title: `${this.card.base_card_name} (#${this.card.serial_no})`,
						front_url: this.is_side_image_blurred("front")
							? ""
							: this._resolve_current_image_url("front"),
						back_url: this.is_side_image_blurred("back")
							? ""
							: this._resolve_current_image_url("back"),
						image_url: this._resolve_current_image_url(side),
						side,
						on_replace: (targetSide) => {
							if (!this.can_edit_card_images()) return;
							$body.find(`[data-role="replace-input-${targetSide}"]`).trigger("click");
						},
					};
				});
			}

			// Reveal blurred image
			$body.on("click", '[data-action="reveal-blurred-image"]', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side") || "front";
				await this.reveal_blurred_card_image(side);
			});

			// Open image viewer
			$body.on("click", '[data-action="open-viewer"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (!this.permissions.can_view_images || !window.ArchiveCardImageViewer) return;
				const side = $(e.currentTarget).attr("data-side") || "front";
				if (this.is_side_image_blurred(side)) return;
				const target_url = this._resolve_current_image_url(side);
				if (!target_url) {
					if (this.can_edit_card_images()) {
						$body.find(`[data-role="replace-input-${side}"]`).trigger("click");
					}
					return;
				}
				window.ArchiveCardImageViewer.open({
					card_name: this.card.name,
					card_title: `${this.card.base_card_name} (#${this.card.serial_no})`,
					front_url: this.is_side_image_blurred("front")
						? ""
						: this._resolve_current_image_url("front"),
					back_url: this.is_side_image_blurred("back")
						? ""
						: this._resolve_current_image_url("back"),
					image_url: target_url,
					initial_side: side,
				});
			});

			// Replace image button
			$body.on("click", '[data-action="replace-image"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side") || "front";
				$body.find(`[data-role="replace-input-${side}"]`).trigger("click");
			});

			// Open card image editor (معاينة)
			$body.on("click", '[data-action="preview-edit-image"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side") || "front";
				this.open_image_editor(side);
			});

			["front", "back"].forEach((side) => {
				$body.on("change", `[data-role="replace-input-${side}"]`, async (e) => {
					const file = e.target.files && e.target.files[0];
					if (!file) return;
					await this.handle_replace_image(side, file);
					e.target.value = "";
				});
			});

			// Reveal PIN
			$body.on("click", '[data-action="reveal-pin"]', async (e) => {
				e.preventDefault();
				if (!this.permissions.can_view_pin) return;
				const $btn = $(e.currentTarget);
				const $display = $body.find('[data-role="pin-display"]');

				if (this.is_pin_shown) {
					this.is_pin_shown = false;
					$display.text("••••").removeClass("is-revealed");
					$btn.find("i").attr("class", "fa fa-eye");
					$btn.find("span").text("إظهار");
					return;
				}

				if (this.revealed_pin === null) {
					$btn.prop("disabled", true);
					try {
						const res = await frappe.call({
							method: "archive.api.cards.reveal_card_pin",
							args: { card: this.card.name },
						});
						this.revealed_pin = String(res?.message?.pin || "");
					} finally {
						$btn.prop("disabled", false);
					}
				}

				if (!this.revealed_pin) return;
				this.is_pin_shown = true;
				$display.text(this.revealed_pin).addClass("is-revealed");
				$btn.find("i").attr("class", "fa fa-eye-slash");
				$btn.find("span").text("إخفاء");
			});

			// Toggle edit PIN
			$body.on("click", '[data-action="toggle-edit-pin"]', (e) => {
				e.preventDefault();
				this.is_editing_pin = !this.is_editing_pin;
				const $wrap = $body.find('[data-role="new-pin-wrap"]');
				$wrap.prop("hidden", !this.is_editing_pin);
				if (!this.is_editing_pin) {
					$body.find('[data-role="new-pin-input"]').val("");
				} else {
					$body.find('[data-role="new-pin-input"]').trigger("focus");
				}
			});

			$body.on("click", '[data-action="toggle-new-pin-eye"]', (e) => {
				e.preventDefault();
				this.new_pin_visible = !this.new_pin_visible;
				$body
					.find('[data-role="new-pin-input"]')
					.attr("type", this.new_pin_visible ? "text" : "password");
				$(e.currentTarget)
					.find("i")
					.attr("class", this.new_pin_visible ? "fa fa-eye-slash" : "fa fa-eye");
			});

			// Quick action buttons
			$body.on("click", '[data-action="toggle-view-timeline-events-menu"]', (e) => {
				e.stopPropagation();
				const $m = $body.find('[data-role="view-timeline-events-menu"]');
				const was_hidden = $m.prop("hidden");
				$m.prop("hidden", !was_hidden);
			});

			this.dialog.$wrapper.on("click", () => {
				$body.find('[data-role="view-timeline-events-menu"]').prop("hidden", true);
			});

			$body.on("click", '[data-action="open-card-event-history"]', () => {
				$body.find('[data-role="view-timeline-events-menu"]').prop("hidden", true);
				if (window.ArchiveCardEventHistoryDialog) {
					new window.ArchiveCardEventHistoryDialog({
						card_name: this.card.name,
					}).show();
				}
			});

			$body.on("click", '[data-action="open-transfer-timeline"]', () => {
				$body.find('[data-role="view-timeline-events-menu"]').prop("hidden", true);
				if (window.ArchiveCardTransferTimelineDialog) {
					new window.ArchiveCardTransferTimelineDialog({
						card_name: this.card.name,
					}).show();
				}
			});

			$body.on("click", '[data-action="open-activity-timeline"]', () => {
				if (!this.permissions?.can_view_activity_timeline) return;
				if (window.ArchiveCardActivityTimelineDialog) {
					new window.ArchiveCardActivityTimelineDialog({
						card_name: this.card.name,
					}).show();
				}
			});

			$body.on("click", '[data-action="open-status-dialog"]', () => {
				ArchiveCardStatusDialog.open(this.card, async () => {
					await this.reload_after_subaction();
				});
			});

			$body.on("click", '[data-action="open-transfer-dialog"]', () => {
				ArchiveCardTransferDialog.open(this.card, async () => {
					await this.reload_after_subaction();
				});
			});

			$body.on("click", '[data-action="open-delete-dialog"]', () => {
				ArchiveCardDeleteDialog.open(this.card, async () => {
					this.saved_changes = true;
					this.dialog.hide();
					if (typeof this.on_changed === "function") {
						await this.on_changed(null);
					}
				});
			});
		}

		async reload_after_subaction() {
			this.revealed_pin = null;
			this.is_pin_shown = false;
			this.revealed_image_sides = { front: false, back: false };
			this.revealing_image_sides = { front: false, back: false };
			const res = await frappe.call({
				method: "archive.api.cards.get_card_details",
				args: { card: this.card.name },
			});
			const data = res?.message || {};
			this.card = data.card || {};
			this.family = data.family || {};
			this.permissions = data.permissions || {};
			this.dialog.set_title(`بطاقة: ${this.card.base_card_name || this.card.name}`);
			this.sync_dialog_actions();
			this.render_body();
			if (typeof this.on_changed === "function") {
				await this.on_changed(this.card);
			}
		}

		open_image_editor(side) {
			if (!this.can_preview_card_images() || !window.ArchiveCardImageEditor) return;
			const orig_url = this._resolve_original_image_url(side);
			if (!orig_url) return;
			const $body = $(this.dialog.body);

			window.ArchiveCardImageEditor.open({
				can_preview: true,
				side,
				side_label: side === "back" ? "الوجه الخلفي" : "الوجه الأمامي",
				original_url: orig_url,
				initial_meta: this._resolve_current_edit_meta(side),
				saved_meta: this._resolve_saved_edit_meta(side),
				on_apply: ({ staged, blob_url, edit_meta }) => {
					this.staged_images[side] = staged;
					if (staged?.file_id) {
						this.all_staged_file_ids.add(staged.file_id);
					}
					if (
						this.preview_urls[side] &&
						this.preview_urls[side] !== this.original_preview_urls[side]
					) {
						URL.revokeObjectURL(this.preview_urls[side]);
					}
					this.preview_urls[side] = blob_url;
					this.edit_metas[side] = edit_meta || null;
					$body.find(`[data-role="empty-${side}"]`).prop("hidden", true);
					$body
						.find(`[data-role="view-img-${side}"]`)
						.attr("src", blob_url)
						.addClass("is-processed")
						.prop("hidden", false);
					$body
						.find(`.acd-image-slot-header [data-action="open-viewer"][data-side="${side}"]`)
						.prop("hidden", false);
					$body
						.find(
							`.acd-image-slot-header [data-action="preview-edit-image"][data-side="${side}"]`
						)
						.prop("hidden", false);
				},
			});
		}

		async handle_replace_image(side, file) {
			if (!this.can_edit_card_images()) return;
			const $body = $(this.dialog.body);
			const $uploading = $body.find(`[data-role="uploading-${side}"]`);
			const $img = $body.find(`[data-role="view-img-${side}"]`);

			$uploading.prop("hidden", false);
			try {
				const staged = await window.upload_staged_card_image(file, side);
				this.staged_images[side] = staged;
				this.original_staged_images[side] = staged;
				this.replaced_sides[side] = true;
				this.edit_metas[side] = undefined;
				if (staged.file_id) {
					this.all_staged_file_ids.add(staged.file_id);
				}

				if (
					this.preview_urls[side] &&
					this.preview_urls[side] !== this.original_preview_urls[side]
				) {
					URL.revokeObjectURL(this.preview_urls[side]);
				}
				if (this.original_preview_urls[side]) {
					URL.revokeObjectURL(this.original_preview_urls[side]);
				}
				const blob_url = URL.createObjectURL(file);
				this.original_preview_urls[side] = blob_url;
				this.preview_urls[side] = blob_url;
				$body.find(`[data-role="empty-${side}"]`).prop("hidden", true);
				$img.attr("src", blob_url).removeClass("is-processed").prop("hidden", false);
				$body
					.find(`.acd-image-slot-header [data-action="open-viewer"][data-side="${side}"]`)
					.prop("hidden", false);
				$body
					.find(`[data-action="replace-image"][data-side="${side}"]`)
					.html('<i class="fa fa-upload"></i> تبديل الصورة');
				if (this.can_preview_card_images()) {
					$body
						.find(
							`.acd-image-slot-header [data-action="preview-edit-image"][data-side="${side}"]`
						)
						.prop("hidden", false);
					this.open_image_editor(side);
				}
			} catch (err) {
				frappe.msgprint({
					title: "خطأ في رفع الصورة",
					message: err.message || "تعذر رفع الصورة.",
					indicator: "red",
				});
			} finally {
				$uploading.prop("hidden", true);
			}
		}

		collect_edit_payload() {
			const $body = $(this.dialog.body);
			const raw_new_pin = String($body.find('[data-role="new-pin-input"]').val() ?? "");
			const payload = {};

			if (this.can_edit_data()) {
				Object.assign(payload, {
					account_number: String(this.controls.account_number?.get_value() || "").trim(),
					base_card_name: String(this.controls.base_card_name?.get_value() || "").trim(),
					card_number: String(this.controls.card_number?.get_value() || "").trim(),
					bank: String(this.controls.bank?.get_value() || "").trim(),
					card_type: String(this.controls.card_type?.get_value() || "").trim(),
					card_owner: String(this.controls.card_owner?.get_value() || "").trim(),
					daily_limit: window.ArchiveCardDailyLimitInput
						? window.ArchiveCardDailyLimitInput.extract_api_value(
								this.controls.daily_limit
							)
						: String(this.controls.daily_limit?.get_value() || "")
								.replace(/,/g, "")
								.trim(),
					region: String(this.controls.region?.get_value() || "").trim(),
					representative: String(this.controls.representative?.get_value() || "").trim(),
					received_date: String(this.controls.received_date?.get_value() || "").trim(),
				});

				if (raw_new_pin !== "") {
					payload.new_pin = raw_new_pin;
				}
			}
			if (this.staged_images.front) {
				payload.front_image =
					this.staged_images.front.file_id || this.staged_images.front.file_url;
			}
			if (this.edit_metas.front !== undefined) {
				if (this.original_staged_images.front) {
					payload.front_original_image =
						this.original_staged_images.front.file_id ||
						this.original_staged_images.front.file_url;
				}
				payload.front_edit_meta = this.edit_metas.front;
			}
			if (this.staged_images.back) {
				payload.back_image =
					this.staged_images.back.file_id || this.staged_images.back.file_url;
			}
			if (this.edit_metas.back !== undefined) {
				if (this.original_staged_images.back) {
					payload.back_original_image =
						this.original_staged_images.back.file_id ||
						this.original_staged_images.back.file_url;
				}
				payload.back_edit_meta = this.edit_metas.back;
			}
			return payload;
		}

		async handle_save() {
			if (!this.can_save_any()) {
				this.dialog.hide();
				return;
			}
			this.family_autocomplete?.hide_all();
			const payload = this.collect_edit_payload();

			if (payload.new_pin !== undefined && !/^[0-9٠-٩۰-۹]{4}$/.test(payload.new_pin)) {
				frappe.msgprint({
					title: "الرقم السري غير صالح",
					message: "الرقم السري يجب أن يتكون من 4 أرقام بالضبط.",
					indicator: "red",
				});
				return;
			}

			if (this.can_edit_data()) {
				if (!payload.daily_limit) {
					frappe.msgprint({
						title: "حقول مطلوبة",
						message: "يرجى استكمال حقل: <strong>الحد اليومي</strong>",
						indicator: "orange",
					});
					return;
				}
				const clean_num = Number(payload.daily_limit.replace(/,/g, ""));
				if (!Number.isFinite(clean_num) || clean_num <= 0) {
					frappe.msgprint({
						title: "الحد اليومي غير صالح",
						message: "الحد اليومي مطلوب ويجب أن يكون رقماً أكبر من صفر.",
						indicator: "red",
					});
					return;
				}
				const effective_card_type = String(payload.card_type ?? this.card.card_type ?? "").trim();
				if (this.card.card_type && !effective_card_type) {
					frappe.msgprint({
						title: "نوع البطاقة مطلوب",
						message: "لا يمكن إزالة نوع البطاقة بعد تحديده. اختر (مدى) أو (أعمال).",
						indicator: "red",
					});
					return;
				}
				if (window.ArchiveCardDailyLimitInput && effective_card_type) {
					const limit_check = window.ArchiveCardDailyLimitInput.validate_for_card_type(
						clean_num,
						effective_card_type
					);
					if (!limit_check) {
						return;
					}
				}

				if (payload.card_number && payload.card_number !== this.card.card_number) {
					const norm_cnum = window.ArchiveCardFamilyAutocomplete
						? window.ArchiveCardFamilyAutocomplete.normalize_account(payload.card_number)
						: payload.card_number.replace(/[\s\-_]+/g, "").toUpperCase();
					const sibling_dup = (this.family?.active_cards || []).some(
						(c) =>
							c.name !== this.card.name &&
							norm_cnum &&
							(window.ArchiveCardFamilyAutocomplete
								? window.ArchiveCardFamilyAutocomplete.normalize_account(c.card_number)
								: String(c.card_number || "")
										.replace(/[\s\-_]+/g, "")
										.toUpperCase()) === norm_cnum
					);
					if (sibling_dup) {
						frappe.msgprint({
							title: "رقم البطاقة مكرر",
							message: `رقم البطاقة (<strong>${frappe.utils.escape_html(
								payload.card_number
							)}</strong>) مستخدم مسبقاً في بطاقة أخرى ولا يمكن تكراره.`,
							indicator: "red",
						});
						return;
					}
				}
			}

			// Distinguish actual account number change from card_type / group transition
			const account_number_changed = Boolean(
				payload.account_number && payload.account_number !== this.card.account_number
			);

			if (this.permissions.can_edit && account_number_changed) {
				const plan_res = await frappe.call({
					method: "archive.api.card_family.build_account_change_plan",
					args: {
						card: this.card.name,
						new_account_number: payload.account_number,
						new_base_card_name: payload.base_card_name,
						new_bank: payload.bank,
						new_card_type: payload.card_type,
					},
				});
				const plan = plan_res?.message || {};
				if (!plan.no_change) {
					this.show_account_transition_dialog(plan, payload);
					return;
				}
			}

			// Check if base_card_name changed on a multi-card family
			if (
				this.permissions.can_edit &&
				payload.base_card_name &&
				payload.base_card_name !== this.card.base_card_name &&
				(this.family?.active_cards_count || 1) > 1
			) {
				frappe.confirm(
					`سيؤدي تعديل اسم البطاقة الأساسي إلى تحديث أسماء جميع البطاقات النشطة (${this.family.active_cards_count} بطاقات) المرتبطة بالحساب <strong>${frappe.utils.escape_html(
						this.card.account_number
					)}</strong> مع الحفاظ على أرقام نسخها.<br><br>هل تريد المتابعة؟`,
					async () => {
						await this.execute_update(payload);
					}
				);
				return;
			}

			await this.execute_update(payload);
		}

		show_account_transition_dialog(plan, payload) {
			let body_html = "";
			const target_card_type = String(plan.new_card_type ?? payload.card_type ?? this.card.card_type ?? "").trim();
			const expected_badge = format_copy_badge_label(target_card_type, plan.expected_copy_no || 1);

			if (plan.case === "SAME_NORMALIZED") {
				body_html = `
					<div class="acvd-transition-box" dir="rtl">
						<div class="acvd-transition-title">تحديث تنسيق رقم الحساب للعائلة</div>
						<p>
							رقم الحساب المدخل <code dir="ltr">${frappe.utils.escape_html(plan.new_account_number)}</code>
							يطابق نفس رقم الحساب المعياري الحالي <code dir="ltr">${frappe.utils.escape_html(plan.new_normalized)}</code>.
						</p>
						<div class="acd-dup-summary-box">
							<div>سيتم تحديث طريقة عرض رقم الحساب على العائلة وجميع بطاقاتها النشطة (${plan.source_active_count || 1}) دون نقل البطاقة أو تغيير رقم نسختها (<span class="ac-copy-badge">${frappe.utils.escape_html(expected_badge)}</span>).</div>
						</div>
					</div>
				`;
			} else if (plan.case === "TARGET_FAMILY_EXISTS") {
				const tf = plan.target_family || {};
				body_html = `
					<div class="acvd-transition-box" dir="rtl">
						<div class="acvd-transition-title">انضمام البطاقة إلى مجموعة نسخ موجودة</div>
						<p>
							مجموعة البطاقات المختارة (<strong dir="ltr">${frappe.utils.escape_html(plan.new_account_number)}</strong> — <strong>${frappe.utils.escape_html(tf.base_card_name || "")}</strong>${target_card_type ? ` — <strong>${frappe.utils.escape_html(target_card_type)}</strong>` : ""})
							تحتوي مسبقاً على (${tf.active_count || 0} بطاقات نشطة).
						</p>
						<div class="acd-dup-summary-box">
							<div>اسم البطاقة: <strong>${frappe.utils.escape_html(tf.base_card_name || plan.expected_base_card_name || "")}</strong></div>
							<div>رقم النسخة الجديد للبطاقة: <span class="ac-copy-badge">${frappe.utils.escape_html(expected_badge)}</span></div>
						</div>
					</div>
				`;
			} else {
				const first_badge = format_copy_badge_label(target_card_type, 1);
				body_html = `
					<div class="acvd-transition-box" dir="rtl">
						<div class="acvd-transition-title">نقل البطاقة إلى مجموعة نسخ جديدة</div>
						<p>
							سيتم نقل هذه البطاقة إلى مجموعة جديدة بالاسم <strong>${frappe.utils.escape_html(plan.expected_base_card_name || "")}</strong> والحساب <code dir="ltr">${frappe.utils.escape_html(plan.new_account_number)}</code>${target_card_type ? ` والنوع <strong>${frappe.utils.escape_html(target_card_type)}</strong>` : ""}
							مع الاحتفاظ بسجل المجموعة السابقة.
						</p>
						<div class="acd-dup-summary-box">
							<div>اسم البطاقة في المجموعة الجديدة: <strong class="text-primary">${frappe.utils.escape_html(plan.expected_base_card_name || "")}</strong></div>
							<div>رقم النسخة في المجموعة الجديدة: <span class="ac-copy-badge">${frappe.utils.escape_html(first_badge)}</span></div>
						</div>
					</div>
				`;
			}

			const tr_dialog = new frappe.ui.Dialog({
				title: "تأكيد تغيير رقم الحساب وعائلة البطاقة",
				fields: [
					{
						fieldname: "info_html",
						fieldtype: "HTML",
						options: body_html,
					},
				],
				primary_action_label: "تأكيد وحفظ التعديلات",
				primary_action: async () => {
					const mode = plan.recommended_mode || "auto";
					tr_dialog.hide();
					await this.execute_update({
						...payload,
						account_transition_mode: mode,
					});
				},
				secondary_action_label: "إلغاء",
				secondary_action: () => tr_dialog.hide(),
			});

			$(tr_dialog.body).attr("dir", "rtl");
			tr_dialog.show();
		}

		async execute_update(payload) {
			this.dialog.get_primary_btn().prop("disabled", true);
			try {
				const res = await frappe.call({
					method: "archive.api.cards.update_card",
					args: {
						card: this.card.name,
						payload,
					},
				});

				this.saved_changes = true;
				const used_ids = new Set([
					this.staged_images.front?.file_id,
					this.staged_images.back?.file_id,
					this.original_staged_images.front?.file_id,
					this.original_staged_images.back?.file_id,
				]);
				const unused_ids = [...this.all_staged_file_ids].filter((id) => id && !used_ids.has(id));
				if (unused_ids.length) {
					frappe.call({
						method: "archive.api.cards.cleanup_staged_card_images",
						args: { file_ids: unused_ids },
					});
				}
				this.all_staged_file_ids.clear();
				this.staged_images = { front: null, back: null };
				this.original_staged_images = { front: null, back: null };
				this.edit_metas = { front: undefined, back: undefined };
				this.replaced_sides = { front: false, back: false };

				frappe.show_alert({
					message: "تم حفظ تعديلات البطاقة بنجاح.",
					indicator: "green",
				});

				const updated_card = res?.message?.card || this.card;
				this.dialog.hide();
				if (typeof this.on_changed === "function") {
					await this.on_changed(updated_card);
				}
			} finally {
				if (this.dialog) {
					this.dialog.get_primary_btn().prop("disabled", false);
				}
			}
		}

		cleanup_unused_staged_files() {
			const urls = new Set([
				...Object.values(this.preview_urls),
				...Object.values(this.original_preview_urls),
			]);
			urls.forEach((u) => {
				if (u) URL.revokeObjectURL(u);
			});
			this.preview_urls = { front: null, back: null };
			this.original_preview_urls = { front: null, back: null };

			const ids = [...this.all_staged_file_ids].filter(Boolean);
			if (ids.length) {
				frappe.call({
					method: "archive.api.cards.cleanup_staged_card_images",
					args: { file_ids: ids },
				});
			}
		}
	}

	window.ArchiveCardViewDialog = ArchiveCardViewDialog;
	window.ArchiveCardStatusDialog = ArchiveCardStatusDialog;
	window.ArchiveCardTransferDialog = ArchiveCardTransferDialog;
	window.ArchiveCardDeleteDialog = ArchiveCardDeleteDialog;
})();
