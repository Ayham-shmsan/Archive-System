(() => {
	"use strict";

	function upload_staged_card_image(file, side) {
		return new Promise((resolve, reject) => {
			const form_data = new FormData();
			form_data.append("file", file, file.name);
			form_data.append("side", side || "front");

			$.ajax({
				url: "/api/method/archive.api.cards.stage_card_image",
				type: "POST",
				data: form_data,
				processData: false,
				contentType: false,
				headers: {
					"X-Frappe-CSRF-Token": frappe.csrf_token,
				},
				success: (res) => {
					if (res && res.message) {
						resolve(res.message);
					} else {
						reject(new Error("استجابة غير متوقعة من الخادم."));
					}
				},
				error: (xhr) => {
					let msg = "تعذر رفع صورة البطاقة.";
					try {
						const parsed = JSON.parse(xhr.responseText || "{}");
						if (parsed._server_messages) {
							const msgs = JSON.parse(parsed._server_messages);
							if (msgs.length) {
								const first = JSON.parse(msgs[0]);
								msg = first.message || msg;
							}
						} else if (parsed.message) {
							msg = parsed.message;
						}
					} catch (_) {
						// fallback
					}
					reject(new Error(msg));
				},
			});
		});
	}

	class ArchiveCardCreateDialog {
		constructor(options = {}) {
			this.masters = options.masters || {};
			this.on_created = options.on_created || null;

			this.dialog = null;
			this.controls = {};
			this.staged_files = {
				front: null,
				back: null,
			};
			this.preview_urls = {
				front: null,
				back: null,
			};
			this.all_staged_file_ids = new Set();
			this.saved_successfully = false;
			this.is_submitting = false;
			this.duplicate_family_info = null;
			this._dup_info_cache = new Map();
			this._dup_check_timer = null;
			this._dup_check_seq = 0;
			this.family_autocomplete = null;
			this.pin_visible = false;
		}

		show() {
			this.dialog = new frappe.ui.Dialog({
				title: "إضافة بطاقة جديدة",
				size: "extra-large",
				primary_action_label: "حفظ البطاقة",
				primary_action: () => {
					this.handle_submit();
				},
				secondary_action_label: "إلغاء",
				secondary_action: () => {
					this.dialog.hide();
				},
			});

			this.dialog.$wrapper.addClass("archive-card-create-modal");
			this.render_body();
			this.bind_events();

			this.dialog.onhide = () => {
				clearTimeout(this._dup_check_timer);
				this.family_autocomplete?.destroy();
				this.family_autocomplete = null;
				this.cleanup_unused_staged_files();
			};

			this.dialog.show();
		}

		render_body() {
			const $body = $(this.dialog.body);
			$body.empty().attr("dir", "rtl").html(`
				<div class="archive-card-dialog-shell" dir="rtl">
					<div class="acd-duplicate-banner" data-role="duplicate-banner" hidden></div>

					<div class="acd-grid-layout">
						<div class="acd-form-column">
							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">بيانات البطاقة</span>
									<span class="ac-copy-badge acd-copy-pill" data-role="copy-badge">نسخة 1</span>
								</div>
								<div class="acd-fields-grid acd-cols-2">
									<div class="acd-field-slot" data-field-slot="base_card_name"></div>
									<div class="acd-field-slot" data-field-slot="bank"></div>
									<div class="acd-field-slot" data-field-slot="account_number"></div>
									<div class="acd-field-slot" data-field-slot="card_number"></div>
								</div>
								<div class="acd-derived-name-hint" data-role="derived-name-hint" hidden></div>
							</div>

							<div class="acd-section-card">
								<div class="acd-section-header">
									<span class="acd-section-title">بيانات المندوب والمالك</span>
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
									<span class="acd-section-title">الرقم السري وحالة البطاقة</span>
								</div>
								<div class="acd-fields-grid acd-cols-2">
									<div class="acd-pin-field-wrapper">
										<label class="control-label reqd">الرقم السري (PIN)</label>
										<div class="acd-pin-input-group">
											<input
												type="password"
												class="form-control acd-pin-input"
												data-role="pin-input"
												placeholder="أدخل الرقم السري (4 أرقام)"
												inputmode="numeric"
												autocomplete="new-password"
											/>
											<button
												type="button"
												class="btn btn-default acd-pin-toggle-btn"
												data-action="toggle-pin"
												title="إظهار / إخفاء الرقم السري"
											>
												<i class="fa fa-eye"></i>
											</button>
										</div>
										<div class="acd-field-help">يُحفظ مشفراً ولا يظهر إلا لصاحب الصلاحية.</div>
									</div>
									<div class="acd-field-slot" data-field-slot="status"></div>
								</div>
								<div class="acd-field-slot" data-field-slot="status_reason" hidden style="margin-top: 10px;"></div>
							</div>
						</div>

						<div class="acd-images-column">
							<div class="acd-section-card acd-images-section">
								<div class="acd-section-header">
									<span class="acd-section-title">صور البطاقة</span>
									<span class="acd-section-subtitle">JPG / PNG / WEBP — بحد أقصى 10MB</span>
								</div>

								<div class="acd-image-slots-stack">
									${this.render_image_dropzone("front", "صورة الوجه الأمامي", true)}
									${this.render_image_dropzone("back", "صورة الوجه الخلفي (اختياري)", false)}
								</div>
							</div>
						</div>
					</div>
				</div>
			`);

			this.make_controls($body);
		}

		render_image_dropzone(side, label, required = true) {
			return `
				<div class="acd-image-slot-card" data-image-slot="${side}">
					<div class="acd-image-slot-header">
						<span class="acd-image-slot-label ${required ? "reqd" : ""}">${label}</span>
						<div class="acd-image-slot-actions">
							<button type="button" class="btn btn-xs btn-default" data-action="pick-image" data-side="${side}">
								<i class="fa fa-upload"></i> اختيار صورة
							</button>
							<button type="button" class="btn btn-xs btn-default" data-action="zoom-staged" data-side="${side}" hidden>
								<i class="fa fa-search-plus"></i> تكبير
							</button>
						</div>
					</div>
					<div class="acd-card-aspect-frame" data-action="frame-click" data-side="${side}">
						<div class="acd-image-empty-state" data-role="empty-${side}">
							<i class="fa fa-credit-card"></i>
							<span>اضغط لرفع ${label}</span>
							<small>نسبة أبعاد البطاقة القياسية 1.586:1</small>
						</div>
						<img class="acd-image-preview" data-role="preview-${side}" alt="${label}" hidden />
						<div class="acd-image-uploading" data-role="uploading-${side}" hidden>
							<i class="fa fa-spinner fa-spin"></i> جاري رفع الصورة...
						</div>
					</div>
					<input
						type="file"
						accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
						data-role="file-input-${side}"
						hidden
					/>
				</div>
			`;
		}

		make_controls($body) {
			const defs = [
				{
					slot: "account_number",
					df: {
						fieldname: "account_number",
						label: "رقم الحساب",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "أدخل رقم الحساب البنكي",
					},
				},
				{
					slot: "base_card_name",
					df: {
						fieldname: "base_card_name",
						label: "اسم البطاقة",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "الاسم الأساسي للبطاقة",
					},
				},
				{
					slot: "card_number",
					df: {
						fieldname: "card_number",
						label: "رقم البطاقة",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "أدخل رقم البطاقة",
					},
				},
				{
					slot: "bank",
					df: {
						fieldname: "bank",
						label: "البنك",
						fieldtype: "Link",
						options: "Archive Bank",
						reqd: 1,
						placeholder: "اختر البنك",
					},
				},
				{
					slot: "card_owner",
					df: {
						fieldname: "card_owner",
						label: "مالك البطاقة",
						fieldtype: "Link",
						options: "Archive Account",
						reqd: 1,
						placeholder: "اختر مالك البطاقة",
					},
				},
				{
					slot: "daily_limit",
					df: {
						fieldname: "daily_limit",
						label: "الحد اليومي",
						fieldtype: "Data",
						reqd: 1,
						placeholder: "0.00",
					},
				},
				{
					slot: "region",
					df: {
						fieldname: "region",
						label: "المنطقة",
						fieldtype: "Link",
						options: "Archive Region",
						reqd: 1,
						placeholder: "اختر المنطقة",
					},
				},
				{
					slot: "representative",
					df: {
						fieldname: "representative",
						label: "المندوب",
						fieldtype: "Link",
						options: "Archive Representative",
						reqd: 1,
						placeholder: "اختر المندوب",
					},
				},
				{
					slot: "received_date",
					df: {
						fieldname: "received_date",
						label: "تاريخ الاستلام",
						fieldtype: "Date",
						reqd: 1,
						default: frappe.datetime.get_today(),
					},
				},
				{
					slot: "status",
					df: {
						fieldname: "status",
						label: "الحالة الابتدائية",
						fieldtype: "Select",
						options: ["نشطة", "موقفة مؤقتاً", "موقفة نهائياً"].join("\n"),
						default: "نشطة",
						reqd: 1,
						onchange: () => {
							const st = this.controls.status?.get_value() || "نشطة";
							const is_perm = st === "موقفة نهائياً";
							$body.find('[data-field-slot="status_reason"]').prop("hidden", !is_perm);
							if (!is_perm && this.controls.status_reason) {
								this.controls.status_reason.set_value("");
							}
						},
					},
				},
				{
					slot: "status_reason",
					df: {
						fieldname: "status_reason",
						label: "سبب الإيقاف النهائي (إلزامي)",
						fieldtype: "Small Text",
						placeholder: "أدخل سبب الإيقاف النهائي للبطاقة...",
					},
				},
			];

			defs.forEach(({ slot, df }) => {
				const $parent = $body.find(`[data-field-slot="${slot}"]`);
				const ctrl = frappe.ui.form.make_control({
					parent: $parent[0],
					df,
					render_input: true,
				});
				ctrl.refresh();
				if (df.default) {
					ctrl.set_value(df.default);
				}
				this.controls[df.fieldname] = ctrl;
			});

			ArchiveCardDailyLimitInput.bind(this.controls.daily_limit);

			this.family_autocomplete?.destroy();
			this.family_autocomplete = new ArchiveCardFamilyAutocomplete({
				dialog: this.dialog,
				controls: {
					base_card_name: this.controls.base_card_name,
					account_number: this.controls.account_number,
					bank: this.controls.bank,
				},
				enabled_provider: () => !this.is_submitting,
				initial_values: {
					base_card_name: "",
					account_number: "",
					bank: "",
				},
				on_account_changed: (acc, meta = {}) => {
					this.schedule_account_family_check(acc, meta);
				},
			});
		}

		bind_events() {
			const $body = $(this.dialog.body);

			// PIN visibility toggle
			$body.on("click", '[data-action="toggle-pin"]', (e) => {
				e.preventDefault();
				this.pin_visible = !this.pin_visible;
				const $pin = $body.find('[data-role="pin-input"]');
				$pin.attr("type", this.pin_visible ? "text" : "password");
				$(e.currentTarget)
					.find("i")
					.attr("class", this.pin_visible ? "fa fa-eye-slash" : "fa fa-eye");
			});

			// Image pickers
			$body.on("click", '[data-action="pick-image"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side");
				$body.find(`[data-role="file-input-${side}"]`).trigger("click");
			});

			$body.on("click", '[data-action="frame-click"]', (e) => {
				const side = $(e.currentTarget).attr("data-side");
				if (this.preview_urls[side]) {
					if (window.ArchiveCardImageViewer) {
						window.ArchiveCardImageViewer.open({
							card_title: side === "front" ? "معاينة الوجه الأمامي" : "معاينة الوجه الخلفي",
							image_url: this.preview_urls[side],
							initial_side: side,
						});
					}
				} else {
					$body.find(`[data-role="file-input-${side}"]`).trigger("click");
				}
			});

			$body.on("click", '[data-action="zoom-staged"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const side = $(e.currentTarget).attr("data-side");
				if (this.preview_urls[side] && window.ArchiveCardImageViewer) {
					window.ArchiveCardImageViewer.open({
						card_title: side === "front" ? "معاينة الوجه الأمامي" : "معاينة الوجه الخلفي",
						image_url: this.preview_urls[side],
						initial_side: side,
					});
				}
			});

			["front", "back"].forEach((side) => {
				$body.on("change", `[data-role="file-input-${side}"]`, async (e) => {
					const file = e.target.files && e.target.files[0];
					if (!file) return;
					await this.handle_file_selected(side, file);
					e.target.value = "";
				});
			});
		}

		async handle_file_selected(side, file) {
			const $body = $(this.dialog.body);
			const $uploading = $body.find(`[data-role="uploading-${side}"]`);
			const $empty = $body.find(`[data-role="empty-${side}"]`);
			const $preview = $body.find(`[data-role="preview-${side}"]`);
			const $zoomBtn = $body.find(`[data-action="zoom-staged"][data-side="${side}"]`);

			$uploading.prop("hidden", false);
			try {
				const staged = await upload_staged_card_image(file, side);
				this.staged_files[side] = staged;
				if (staged.file_id) {
					this.all_staged_file_ids.add(staged.file_id);
				}

				if (this.preview_urls[side]) {
					URL.revokeObjectURL(this.preview_urls[side]);
				}
				const blob_url = URL.createObjectURL(file);
				this.preview_urls[side] = blob_url;

				$empty.prop("hidden", true);
				$preview.attr("src", blob_url).prop("hidden", false);
				$zoomBtn.prop("hidden", false);
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

		reset_duplicate_ui() {
			this.duplicate_family_info = null;
			if (!this.dialog) return;
			const $body = $(this.dialog.body);
			$body.find('[data-role="duplicate-banner"]').prop("hidden", true).empty();
			$body.find('[data-role="copy-badge"]').text("نسخة 1").removeClass("is-duplicate");
			$body.find('[data-role="derived-name-hint"]').prop("hidden", true).empty();
		}

		apply_duplicate_ui(info) {
			this.duplicate_family_info = info;
			if (!this.dialog) return;
			const $body = $(this.dialog.body);
			const $banner = $body.find('[data-role="duplicate-banner"]');
			const $badge = $body.find('[data-role="copy-badge"]');
			const $hint = $body.find('[data-role="derived-name-hint"]');

			if (info && info.family_exists) {
				$badge
					.text(`نسخة ${info.expected_copy_no}`)
					.addClass("is-duplicate");

				if (info.base_card_name) {
					this.family_autocomplete?.sync_from_account_lookup(info.base_card_name);
				}

				$hint
					.prop("hidden", false)
					.html(
						`اسم البطاقة يتبع الاسم الأساسي لعائلة الحساب: <strong>${frappe.utils.escape_html(
							info.base_card_name
						)}</strong> <span class="ac-copy-badge">نسخة ${info.expected_copy_no}</span>`
					);

				$banner.prop("hidden", false).html(`
					<div class="acd-dup-banner-inner">
						<i class="fa fa-exclamation-triangle"></i>
						<div>
							<strong>تنبيه تكرار رقم الحساب:</strong>
							رقم الحساب <code>${frappe.utils.escape_html(info.account_number)}</code> مسجل مسبقاً لعائلة
							<strong>${frappe.utils.escape_html(info.base_card_name)}</strong>
							(${info.active_count} بطاقة نشطة).
							سيتم إصدار هذه البطاقة باسم
							<strong>${frappe.utils.escape_html(info.base_card_name)}</strong>
							<span class="ac-copy-badge">نسخة ${info.expected_copy_no}</span> بعد التأكيد.
						</div>
					</div>
				`);
			} else {
				this.reset_duplicate_ui();
			}
		}

		schedule_account_family_check(_acc, meta = {}) {
			clearTimeout(this._dup_check_timer);
			const clean_acc = String(this.controls.account_number?.get_value() || "").trim();
			const clean_base = String(this.controls.base_card_name?.get_value() || "").trim();
			const clean_bank = String(this.controls.bank?.get_value() || "").trim();
			if (!clean_acc || !clean_base || !clean_bank) {
				this._dup_check_seq += 1;
				this.reset_duplicate_ui();
				return;
			}

			const local_match = this.family_autocomplete?.find_by_triplet(
				clean_base,
				clean_acc,
				clean_bank
			);
			if (this.family_autocomplete?.loaded && !local_match) {
				this._dup_check_seq += 1;
				this.reset_duplicate_ui();
				return;
			}

			if (meta.immediate) {
				this.check_account_family();
				return;
			}

			this._dup_check_timer = setTimeout(() => {
				this.check_account_family();
			}, 250);
		}

		async check_account_family(opts = {}) {
			const acc = String(this.controls.account_number?.get_value() || "").trim();
			const base_name = String(this.controls.base_card_name?.get_value() || "").trim();
			const bank = String(this.controls.bank?.get_value() || "").trim();
			if (!acc || !base_name || !bank) {
				this.reset_duplicate_ui();
				return null;
			}

			const triplet_key = ArchiveCardFamilyAutocomplete.make_triplet_key(
				base_name,
				acc,
				bank
			);
			if (!opts.force_remote && triplet_key && this._dup_info_cache.has(triplet_key)) {
				const cached = this._dup_info_cache.get(triplet_key);
				this.apply_duplicate_ui(cached);
				return cached;
			}

			const seq = ++this._dup_check_seq;
			try {
				const res = await frappe.call({
					method: "archive.api.cards.check_duplicate_account",
					args: {
						account_number: acc,
						base_card_name: base_name,
						bank: bank,
					},
				});
				const info = res?.message || null;
				if (triplet_key && info) {
					this._dup_info_cache.set(triplet_key, info);
				}
				const latest_key = ArchiveCardFamilyAutocomplete.make_triplet_key(
					this.controls.base_card_name?.get_value() || "",
					this.controls.account_number?.get_value() || "",
					this.controls.bank?.get_value() || ""
				);
				if (seq === this._dup_check_seq && latest_key === triplet_key) {
					this.apply_duplicate_ui(info);
				}
				return info;
			} catch (_) {
				return null;
			}
		}

		collect_payload() {
			const $body = $(this.dialog.body);
			const pin = String($body.find('[data-role="pin-input"]').val() ?? "");

			return {
				account_number: String(this.controls.account_number?.get_value() || "").trim(),
				base_card_name: String(this.controls.base_card_name?.get_value() || "").trim(),
				card_number: String(this.controls.card_number?.get_value() || "").trim(),
				bank: String(this.controls.bank?.get_value() || "").trim(),
				card_owner: String(this.controls.card_owner?.get_value() || "").trim(),
				daily_limit: ArchiveCardDailyLimitInput.extract_api_value(this.controls.daily_limit),
				region: String(this.controls.region?.get_value() || "").trim(),
				representative: String(this.controls.representative?.get_value() || "").trim(),
				received_date: String(this.controls.received_date?.get_value() || "").trim(),
				status: String(this.controls.status?.get_value() || "نشطة").trim(),
				status_reason: String(this.controls.status_reason?.get_value() || "").trim(),
				pin,
				front_image: this.staged_files.front?.file_id || this.staged_files.front?.file_url || "",
				back_image: this.staged_files.back?.file_id || this.staged_files.back?.file_url || "",
			};
		}

		validate_client_payload(payload) {
			const required_checks = [
				[payload.account_number, "رقم الحساب"],
				[payload.base_card_name, "اسم البطاقة"],
				[payload.card_number, "رقم البطاقة"],
				[payload.bank, "البنك"],
				[payload.card_owner, "مالك البطاقة"],
				[payload.daily_limit, "الحد اليومي"],
				[payload.region, "المنطقة"],
				[payload.representative, "المندوب"],
				[payload.received_date, "تاريخ الاستلام"],
				[payload.pin.trim(), "الرقم السري (PIN)"],
				[payload.front_image, "صورة الوجه الأمامي"],
			];

			for (const [val, label] of required_checks) {
				if (!val) {
					frappe.msgprint({
						title: "حقول مطلوبة",
						message: `يرجى استكمال حقل: <strong>${label}</strong>`,
						indicator: "orange",
					});
					return false;
				}
			}

			if (payload.status === "موقفة نهائياً" && !payload.status_reason) {
				frappe.msgprint({
					title: "سبب الإيقاف النهائي مطلوب",
					message: "يرجى إدخال سبب الإيقاف النهائي عند اختيار حالة (موقفة نهائياً).",
					indicator: "red",
				});
				return false;
			}

			if (!/^[0-9٠-٩۰-۹]{4}$/.test(payload.pin)) {
				frappe.msgprint({
					title: "الرقم السري غير صالح",
					message: "الرقم السري يجب أن يتكون من 4 أرقام بالضبط.",
					indicator: "red",
				});
				return false;
			}

			const clean_num = Number(String(payload.daily_limit || "").replace(/,/g, ""));
			if (!Number.isFinite(clean_num) || clean_num <= 0) {
				frappe.msgprint({
					title: "الحد اليومي غير صالح",
					message: "الحد اليومي مطلوب ويجب أن يكون رقماً أكبر من صفر.",
					indicator: "red",
				});
				return false;
			}

			return true;
		}

		async handle_submit() {
			if (this.is_submitting) return;
			this.family_autocomplete?.hide_all();
			const payload = this.collect_payload();
			if (!this.validate_client_payload(payload)) return;

			this.is_submitting = true;
			this.dialog.get_primary_btn().prop("disabled", true);

			try {
				const dup_info = await this.check_account_family({ force_remote: true });
				if (dup_info && dup_info.family_exists) {
					const norm_cnum = ArchiveCardFamilyAutocomplete.normalize_account(
						payload.card_number
					);
					const sibling_dup = (dup_info.existing_cards || []).some(
						(c) =>
							norm_cnum &&
							ArchiveCardFamilyAutocomplete.normalize_account(c.card_number) ===
								norm_cnum
					);
					if (sibling_dup) {
						this.is_submitting = false;
						this.dialog.get_primary_btn().prop("disabled", false);
						frappe.msgprint({
							title: "رقم البطاقة مكرر",
							message: `رقم البطاقة (<strong>${frappe.utils.escape_html(
								payload.card_number
							)}</strong>) مستخدم مسبقاً في بطاقة أخرى ولا يمكن تكراره.`,
							indicator: "red",
						});
						return;
					}
					if (dup_info.base_card_name) {
						payload.base_card_name = dup_info.base_card_name;
					}
					this.is_submitting = false;
					this.dialog.get_primary_btn().prop("disabled", false);
					this.show_duplicate_confirmation_modal(dup_info, payload);
					return;
				}

				await this.execute_create(payload, false);
			} catch (err) {
				this.is_submitting = false;
				this.dialog.get_primary_btn().prop("disabled", false);
			}
		}

		show_duplicate_confirmation_modal(dup_info, payload) {
			const cards = Array.isArray(dup_info.existing_cards) ? dup_info.existing_cards : [];
			const rows_html = cards.length
				? cards
						.map(
							(c) => `
						<tr>
							<td>
								<strong>${frappe.utils.escape_html(c.base_card_name || dup_info.base_card_name || "")}</strong>
								<span class="ac-copy-badge ac-row-copy-badge">نسخة ${c.copy_no || 1}</span>
							</td>
							<td dir="ltr">${frappe.utils.escape_html(c.card_number)}</td>
							<td>${frappe.utils.escape_html(c.bank_name || c.bank)}</td>
							<td>${frappe.utils.escape_html(c.representative_name || c.representative)}</td>
							<td>${frappe.utils.escape_html(c.region_name || c.region)}</td>
							<td>${frappe.utils.escape_html(c.status)}</td>
						</tr>
					`
						)
						.join("")
				: `<tr><td colspan="6" class="text-center text-muted">توجد نسخ تاريخية سابقة على هذه العائلة.</td></tr>`;

			const confirm_dialog = new frappe.ui.Dialog({
				title: "تأكيد إنشاء نسخة جديدة على رقم حساب مكرر",
				size: "large",
				primary_action_label: "المتابعة وإنشاء نسخة جديدة",
				primary_action: async () => {
					confirm_dialog.hide();
					await this.execute_create(payload, true);
				},
				secondary_action_label: "إلغاء والعودة للتعديل",
				secondary_action: () => {
					confirm_dialog.hide();
				},
			});

			$(confirm_dialog.body).attr("dir", "rtl").html(`
				<div class="acd-dup-confirm-body" dir="rtl">
					<div class="acd-dup-summary-box">
						<div>رقم الحساب: <strong dir="ltr">${frappe.utils.escape_html(dup_info.account_number)}</strong></div>
						<div>اسم البطاقة: <strong>${frappe.utils.escape_html(dup_info.base_card_name)}</strong></div>
						<div>رقم النسخة الجديدة المتوقع: <span class="ac-copy-badge">نسخة ${dup_info.expected_copy_no}</span></div>
					</div>
					<div class="acd-dup-table-title">البطاقات الحالية المرتبطة بهذا الحساب (${cards.length}):</div>
					<div class="table-responsive">
						<table class="table table-bordered acd-dup-table">
							<thead>
								<tr>
									<th>اسم البطاقة</th>
									<th>رقم البطاقة</th>
									<th>البنك</th>
									<th>المندوب</th>
									<th>المنطقة</th>
									<th>الحالة</th>
								</tr>
							</thead>
							<tbody>${rows_html}</tbody>
						</table>
					</div>
				</div>
			`);

			confirm_dialog.show();
		}

		async execute_create(payload, allow_duplicate) {
			this.is_submitting = true;
			this.dialog.get_primary_btn().prop("disabled", true);

			try {
				const final_payload = {
					...payload,
					allow_duplicate_account: allow_duplicate ? 1 : 0,
				};

				const res = await frappe.call({
					method: "archive.api.cards.create_card",
					args: { payload: final_payload },
				});

				this.saved_successfully = true;
				const used_ids = new Set([
					this.staged_files.front?.file_id,
					this.staged_files.back?.file_id,
				]);
				const unused_ids = [...this.all_staged_file_ids].filter((id) => id && !used_ids.has(id));
				if (unused_ids.length) {
					frappe.call({
						method: "archive.api.cards.cleanup_staged_card_images",
						args: { file_ids: unused_ids },
					});
				}

				frappe.show_alert({
					message: "تم إنشاء البطاقة بنجاح.",
					indicator: "green",
				});

				this.dialog.hide();
				if (typeof this.on_created === "function") {
					await this.on_created(res?.message?.card);
				}
			} finally {
				this.is_submitting = false;
				if (this.dialog) {
					this.dialog.get_primary_btn().prop("disabled", false);
				}
			}
		}

		cleanup_unused_staged_files() {
			Object.values(this.preview_urls).forEach((u) => {
				if (u) URL.revokeObjectURL(u);
			});
			this.preview_urls = { front: null, back: null };

			if (this.saved_successfully) return;
			const ids = [...this.all_staged_file_ids].filter(Boolean);
			if (ids.length) {
				frappe.call({
					method: "archive.api.cards.cleanup_staged_card_images",
					args: { file_ids: ids },
				});
			}
		}
	}

	const DIGIT_TRANSLATION_MAP = {
		"٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
		"٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
		"۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
		"۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
	};

	const ArchiveCardDailyLimitInput = {
		PLACEHOLDER: "0.00",

		normalize_digits(raw) {
			return String(raw ?? "").replace(/[٠-٩۰-۹]/g, (c) => DIGIT_TRANSLATION_MAP[c] || c);
		},

		format_with_caret(raw_val, raw_caret) {
			const norm = this.normalize_digits(raw_val);
			const caret = Math.max(
				0,
				Math.min(norm.length, Number.isFinite(raw_caret) ? raw_caret : norm.length)
			);

			if (norm.replace(/[^0-9]/g, "") === "") {
				return { text: "", caret: 0 };
			}

			const first_dot = norm.indexOf(".");
			const second_dot = first_dot !== -1 ? norm.indexOf(".", first_dot + 1) : -1;

			let int_raw = "";
			let dec_raw = "";
			let in_decimal = false;
			let int_digits_before_caret = 0;
			let dec_digits_before_caret = 0;

			if (second_dot !== -1) {
				int_raw = norm.slice(0, first_dot).replace(/[^0-9]/g, "");
				dec_raw = norm.slice(second_dot + 1).replace(/[^0-9]/g, "");
				in_decimal = true;
				dec_digits_before_caret = 0;
			} else if (first_dot !== -1) {
				int_raw = norm.slice(0, first_dot).replace(/[^0-9]/g, "");
				dec_raw = norm.slice(first_dot + 1).replace(/[^0-9]/g, "");
				if (caret <= first_dot) {
					in_decimal = false;
					int_digits_before_caret = norm.slice(0, caret).replace(/[^0-9]/g, "").length;
				} else {
					in_decimal = true;
					dec_digits_before_caret = Math.min(
						2,
						norm.slice(first_dot + 1, caret).replace(/[^0-9]/g, "").length
					);
				}
			} else {
				int_raw = norm.replace(/[^0-9]/g, "");
				dec_raw = "00";
				in_decimal = false;
				int_digits_before_caret = norm.slice(0, caret).replace(/[^0-9]/g, "").length;
			}

			const dec_padded = dec_raw.slice(0, 2).padEnd(2, "0");

			if (!int_raw && dec_padded === "00" && !in_decimal) {
				return { text: "", caret: 0 };
			}

			const stripped_zeros = int_raw.length - int_raw.replace(/^0+(?=\d)/, "").length;
			const int_clean = int_raw ? int_raw.replace(/^0+(?=\d)/, "") : "0";
			const int_formatted = int_clean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			const text = `${int_formatted}.${dec_padded}`;

			let next_caret = int_formatted.length;
			if (in_decimal) {
				next_caret = int_formatted.length + 1 + dec_digits_before_caret;
			} else {
				const target_int_digits = Math.max(
					0,
					Math.min(int_clean.length, int_digits_before_caret - stripped_zeros)
				);
				if (target_int_digits === 0) {
					next_caret = int_raw ? 0 : 1;
				} else {
					let seen = 0;
					for (let i = 0; i < int_formatted.length; i += 1) {
						if (/[0-9]/.test(int_formatted[i])) {
							seen += 1;
							if (seen === target_int_digits) {
								next_caret = i + 1;
								break;
							}
						}
					}
				}
			}

			return { text, caret: next_caret };
		},

		extract_api_value(ctrl) {
			const raw = this.normalize_digits(
				ctrl?.$input ? ctrl.$input.val() : ctrl?.get_value?.() || ""
			)
				.replace(/,/g, "")
				.trim();
			if (!raw) return "";
			const num = Number(raw);
			if (!Number.isFinite(num)) return raw;
			return num.toFixed(2);
		},

		bind(ctrl) {
			const $inp = ctrl?.$input;
			if (!$inp || !$inp.length) return;
			const el = $inp[0];

			ctrl.parse = (val) => (val ? this.format_with_caret(val, 0).text : "");
			ctrl.format_for_input = (val) => (val ? this.format_with_caret(val, 0).text : "");

			$inp
				.attr("dir", "ltr")
				.attr("inputmode", "decimal")
				.attr("placeholder", this.PLACEHOLDER)
				.addClass("acd-money-center-input");

			const sync_value = (val, caret) => {
				ctrl.value = val;
				if (el.value !== val) {
					el.value = val;
				}
				if (typeof caret === "number" && document.activeElement === el) {
					try {
						el.setSelectionRange(caret, caret);
					} catch (_) {
						// ignore
					}
				}
			};

			if (el.value && String(el.value).trim() !== "") {
				const init = this.format_with_caret(el.value, 0);
				sync_value(init.text, null);
			}

			$inp.off(".acdDailyLimit");

			$inp.on("keydown.acdDailyLimit", (e) => {
				if (el.readOnly || el.disabled) return;
				const val = el.value || "";
				const start = el.selectionStart ?? 0;
				const end = el.selectionEnd ?? 0;
				if (start !== end) return;

				const dot_idx = val.indexOf(".");

				if ((e.key === "." || e.key === "Decimal") && dot_idx !== -1) {
					e.preventDefault();
					const pos = dot_idx + 1;
					el.setSelectionRange(pos, pos);
					return;
				}

				if (e.key === "Backspace" && val) {
					if (dot_idx !== -1 && start > dot_idx) {
						const d1 = val[dot_idx + 1] || "0";
						const d2 = val[dot_idx + 2] || "0";
						if (d1 === "0" && d2 === "0") {
							el.setSelectionRange(dot_idx, dot_idx);
						} else if (start === dot_idx + 3 && d2 === "0") {
							el.setSelectionRange(dot_idx + 2, dot_idx + 2);
						} else if (start === dot_idx + 1) {
							el.setSelectionRange(dot_idx, dot_idx);
						}
					} else if (start > 0 && val[start - 1] === ",") {
						el.setSelectionRange(start - 1, start - 1);
					}
				} else if (e.key === "Delete" && val) {
					if (val[start] === ",") {
						el.setSelectionRange(start + 1, start + 1);
					}
				}
			});

			$inp.on("input.acdDailyLimit", () => {
				if (el.readOnly || el.disabled) return;
				const res = this.format_with_caret(el.value, el.selectionStart);
				sync_value(res.text, res.caret);
			});

			$inp.on("blur.acdDailyLimit", () => {
				if (!el.value || !el.value.replace(/[^0-9]/g, "")) {
					sync_value("", null);
					return;
				}
				const res = this.format_with_caret(el.value, 0);
				sync_value(res.text, null);
			});
		},
	};

	class ArchiveCardFamilyAutocomplete {
		static instance_counter = 0;

		static normalize_digits(raw) {
			return String(raw ?? "").replace(/[٠-٩۰-۹]/g, (c) => DIGIT_TRANSLATION_MAP[c] || c);
		}

		static normalize_account(raw) {
			const clean = this.normalize_digits(raw).trim();
			if (!clean) return "";
			return clean.replace(/[\s\-_\u200b-\u200f\u202a-\u202e]+/g, "").toUpperCase();
		}

		static normalize_exact_name(raw) {
			return String(raw ?? "")
				.normalize("NFKC")
				.trim()
				.replace(/\s+/g, " ")
				.toLocaleLowerCase();
		}

		static normalize_search_text(raw) {
			return this.normalize_digits(String(raw ?? "").normalize("NFKC"))
				.toLocaleLowerCase()
				.replace(/[\u064b-\u065f\u0670\u0640]/g, "")
				.replace(/[أإآٱ]/g, "ا")
				.replace(/ة/g, "ه")
				.replace(/ى/g, "ي")
				.replace(/ؤ/g, "و")
				.replace(/ئ/g, "ي")
				.replace(/\s+/g, " ")
				.trim();
		}

		static make_triplet_key(base_name, acc, bank) {
			const n_base = this.normalize_exact_name(base_name);
			const n_acc = this.normalize_account(acc);
			const n_bank = this.normalize_exact_name(bank);
			if (!n_base || !n_acc || !n_bank) return "";
			return `${n_base}||${n_acc}||${n_bank}`;
		}

		constructor(options = {}) {
			this.dialog = options.dialog || null;
			this.controls = options.controls || {};
			this.enabled_provider =
				typeof options.enabled_provider === "function" ? options.enabled_provider : () => true;
			this.on_account_changed =
				typeof options.on_account_changed === "function" ? options.on_account_changed : null;
			this.limit = Number(options.limit || 12);

			const init_base = String(options.initial_values?.base_card_name || "").trim();
			const init_acc = String(options.initial_values?.account_number || "").trim();
			const init_bank = String(options.initial_values?.bank || "").trim();
			this.initial_values = {
				base_card_name: init_base,
				account_number: init_acc,
				bank: init_bank,
			};
			this.fallback_base_card_name = init_base;
			this.fallback_account_number = init_acc;
			this.fallback_bank = init_bank;
			this.last_account_raw = init_acc;
			this.last_bank_raw = init_bank;
			this.is_base_autofilled = false;
			this.is_acc_autofilled = false;
			this.is_bank_autofilled = false;
			this.selected_family = null;
			this.is_applying = false;
			this.is_destroyed = false;

			this.loaded = false;
			this._load_promise = null;
			this.families = [];
			this.by_triplet = new Map();
			this.by_norm_account = new Map();
			this.by_norm_account_list = new Map();
			this.unique_name_items = [];
			this.unique_account_items = [];

			this.instance_id = ++ArchiveCardFamilyAutocomplete.instance_counter;
			this.ns = `.acd_fam_ac_${this.instance_id}`;
			this.states = new Map();
			this._focus_ready = false;

			this.attach_fields();
			this.bind_global_events();

			if (this.is_enabled()) {
				this.ensure_loaded();
			}

			this._focus_ready_timer = setTimeout(() => {
				if (!this.is_destroyed) {
					this._focus_ready = true;
				}
			}, 260);
		}

		is_enabled() {
			return !this.is_destroyed && Boolean(this.enabled_provider());
		}

		ensure_loaded() {
			if (this.loaded) return Promise.resolve(this.families);
			if (this._load_promise) return this._load_promise;

			this._load_promise = frappe
				.call({
					method: "archive.api.cards.get_card_family_lookups",
					type: "GET",
				})
				.then((res) => {
					const list = Array.isArray(res?.message?.families) ? res.message.families : [];
					this.build_indexes(list);
					this.loaded = true;
					return this.families;
				})
				.catch(() => {
					this._load_promise = null;
					return [];
				});

			return this._load_promise;
		}

		build_indexes(list) {
			this.families = list;
			this.by_triplet.clear();
			this.by_norm_account.clear();
			this.by_norm_account_list.clear();
			this.unique_name_items = [];
			this.unique_account_items = [];

			const seen_triplets = new Set();

			for (const fam of list) {
				const base_name = String(fam.base_card_name || "").trim();
				const acc_num = String(fam.account_number || "").trim();
				const norm_acc =
					String(fam.account_number_normalized || "").trim() ||
					ArchiveCardFamilyAutocomplete.normalize_account(acc_num);
				const bank = String(fam.bank || "").trim();
				const bank_label = String(fam.bank_name || bank).trim();
				if (!base_name || !acc_num || !norm_acc || !bank) continue;

				const t_key = ArchiveCardFamilyAutocomplete.make_triplet_key(
					base_name,
					norm_acc,
					bank
				);
				if (!t_key || seen_triplets.has(t_key)) continue;
				seen_triplets.add(t_key);
				this.by_triplet.set(t_key, fam);

				if (!this.by_norm_account_list.has(norm_acc)) {
					this.by_norm_account_list.set(norm_acc, []);
				}
				this.by_norm_account_list.get(norm_acc).push(fam);

				if (!this.by_norm_account.has(norm_acc)) {
					this.by_norm_account.set(norm_acc, fam);
				}

				const exact_name_key = ArchiveCardFamilyAutocomplete.normalize_exact_name(base_name);
				this.unique_name_items.push({
					value: base_name,
					secondary_text: bank_label,
					exact_key: exact_name_key,
					search_key: ArchiveCardFamilyAutocomplete.normalize_search_text(base_name),
					bank_search_key: ArchiveCardFamilyAutocomplete.normalize_search_text(bank_label),
					triplet_key: t_key,
					family: fam,
				});

				this.unique_account_items.push({
					value: acc_num,
					secondary_text: bank_label ? `${base_name} — ${bank_label}` : base_name,
					norm_acc,
					raw_lower: acc_num.toLocaleLowerCase(),
					triplet_key: t_key,
					family: fam,
				});
			}
		}

		find_by_triplet(base_name, raw_acc, bank) {
			const key = ArchiveCardFamilyAutocomplete.make_triplet_key(base_name, raw_acc, bank);
			if (!key) return null;
			return this.by_triplet.get(key) || null;
		}

		find_unique_by_account(raw_acc) {
			const norm = ArchiveCardFamilyAutocomplete.normalize_account(raw_acc);
			if (!norm) return null;
			const list = this.by_norm_account_list.get(norm) || [];
			return list.length === 1 ? list[0] : null;
		}

		find_by_account(raw_acc) {
			return this.find_unique_by_account(raw_acc);
		}

		notify_triplet_changed(meta = {}) {
			if (!this.on_account_changed) return;
			const cur_acc = String(this.controls.account_number?.get_value() || "").trim();
			const cur_base = String(this.controls.base_card_name?.get_value() || "").trim();
			const cur_bank = String(this.controls.bank?.get_value() || "").trim();
			const matched =
				meta.matched_family !== undefined
					? meta.matched_family
					: this.find_by_triplet(cur_base, cur_acc, cur_bank);
			this.on_account_changed(cur_acc, {
				immediate: Boolean(meta.immediate),
				matched_family: matched,
			});
		}

		attach_fields() {
			for (const fieldname of ["base_card_name", "account_number"]) {
				const ctrl = this.controls[fieldname];
				const $input = ctrl?.$input;
				if (!$input || !$input.length) continue;

				$input.attr("autocomplete", "off");

				const $menu = $(
					`<div class="acd-autocomplete-menu" role="listbox" style="display:none;"></div>`
				);
				$("body").append($menu);

				const state = {
					fieldname,
					ctrl,
					$input,
					$menu,
					items: [],
					active_index: -1,
					edited_since_focus: false,
				};
				this.states.set(fieldname, state);

				$input
					.off(this.ns)
					.on(`focus${this.ns}`, () => {
						state.edited_since_focus = false;
						if (this._focus_ready) {
							this.open_suggestions(state, { show_all_if_exact: true });
						}
					})
					.on(`click${this.ns}`, () => {
						this._focus_ready = true;
						if (!state.$menu.is(":visible")) {
							this.open_suggestions(state, {
								show_all_if_exact: !state.edited_since_focus,
							});
						}
					})
					.on(`input${this.ns}`, () => {
						if (this.is_applying || !this.is_enabled()) return;
						this._focus_ready = true;
						state.edited_since_focus = true;
						if (fieldname === "base_card_name") {
							this.handle_base_name_typed(state);
						} else {
							this.handle_account_typed(state, { open_menu: true });
						}
					})
					.on(`change${this.ns}`, () => {
						if (this.is_applying || !this.is_enabled()) return;
						if (fieldname === "account_number") {
							this.handle_account_typed(state, { open_menu: false });
						}
					})
					.on(`keydown${this.ns}`, (e) => {
						this.handle_keydown(state, e);
					})
					.on(`blur${this.ns}`, () => {
						setTimeout(() => {
							if (!this.is_destroyed) {
								this.hide_menu(state);
							}
						}, 130);
					});

				$menu
					.on(`mousedown${this.ns}`, ".acd-autocomplete-item", (e) => {
						e.preventDefault();
					})
					.on(`click${this.ns}`, ".acd-autocomplete-item", (e) => {
						const idx = Number($(e.currentTarget).attr("data-index"));
						this.select_item(state, idx);
					});
			}

			const $bank_input = this.controls.bank?.$input;
			if ($bank_input && $bank_input.length) {
				$bank_input
					.off(this.ns)
					.on(
						`input${this.ns} change${this.ns} blur${this.ns} awesomplete-selectcomplete${this.ns}`,
						() => {
							if (this.is_applying || !this.is_enabled()) return;
							this.handle_bank_changed();
						}
					);
			}
		}

		bind_global_events() {
			$(document).on(`mousedown${this.ns}`, (e) => {
				for (const state of this.states.values()) {
					if (
						!state.$input.is(e.target) &&
						!state.$menu.is(e.target) &&
						state.$menu.has(e.target).length === 0
					) {
						this.hide_menu(state);
					}
				}
			});

			$(window).on(`resize${this.ns}`, () => {
				for (const state of this.states.values()) {
					if (state.$menu.is(":visible")) {
						this.position_menu(state);
					}
				}
			});

			this.dialog?.$wrapper?.find(".modal-body").on(`scroll${this.ns}`, () => {
				for (const state of this.states.values()) {
					if (state.$menu.is(":visible")) {
						this.position_menu(state);
					}
				}
			});
		}

		async set_control_value(ctrl, val) {
			if (!ctrl) return;
			const str_val = String(val ?? "");
			let res;
			this.is_applying = true;
			try {
				ctrl.value = str_val;
				if (ctrl.$input && ctrl.$input.length && ctrl.$input.val() !== str_val) {
					ctrl.$input.val(str_val);
				}
				res = ctrl.set_value(str_val, true);
			} finally {
				this.is_applying = false;
			}
			await Promise.resolve(res);
		}

		sync_from_account_lookup(base_card_name) {
			const clean_name = String(base_card_name || "").trim();
			if (!clean_name || this.is_destroyed) return;
			const cur = String(this.controls.base_card_name?.get_value() || "").trim();
			if (cur === clean_name) {
				this.is_base_autofilled = true;
				return;
			}
			this.is_base_autofilled = true;
			this.set_control_value(this.controls.base_card_name, clean_name);
		}

		handle_bank_changed() {
			const cur_bank = String(this.controls.bank?.get_value() || "").trim();
			if (cur_bank === this.last_bank_raw) return;
			this.last_bank_raw = cur_bank;
			this.is_bank_autofilled = false;
			this.fallback_bank = cur_bank;
			this.notify_triplet_changed({ immediate: false });
		}

		async handle_base_name_typed(state) {
			const cur_base = String(this.controls.base_card_name?.get_value() || "").trim();
			this.is_base_autofilled = false;
			this.fallback_base_card_name = cur_base;

			if (this.is_acc_autofilled || this.is_bank_autofilled) {
				const still_same =
					this.selected_family &&
					ArchiveCardFamilyAutocomplete.normalize_exact_name(
						this.selected_family.base_card_name
					) === ArchiveCardFamilyAutocomplete.normalize_exact_name(cur_base);

				if (!still_same) {
					this.selected_family = null;
					if (this.is_acc_autofilled) {
						const restore_acc = this.fallback_account_number;
						this.is_acc_autofilled = false;
						this.last_account_raw = restore_acc;
						await this.set_control_value(this.controls.account_number, restore_acc);
					}
					if (this.is_bank_autofilled && this.controls.bank) {
						const restore_bank = this.fallback_bank;
						this.is_bank_autofilled = false;
						this.last_bank_raw = restore_bank;
						await this.set_control_value(this.controls.bank, restore_bank);
					}
				}
			}

			this.notify_triplet_changed({ immediate: false });
			this.open_suggestions(state, { show_all_if_exact: false });
		}

		async handle_account_typed(state, opts = {}) {
			const raw_acc = String(this.controls.account_number?.get_value() || "").trim();
			if (opts.open_menu !== false) {
				this.open_suggestions(state, { show_all_if_exact: false });
			}

			if (raw_acc === this.last_account_raw) return;
			this.last_account_raw = raw_acc;
			this.is_acc_autofilled = false;
			this.fallback_account_number = raw_acc;

			if (!this.loaded) {
				await this.ensure_loaded();
				if (this.is_destroyed) return;
				const latest_acc = String(this.controls.account_number?.get_value() || "").trim();
				if (latest_acc !== raw_acc) return;
			}

			const matched = this.find_unique_by_account(raw_acc);
			if (matched) {
				this.selected_family = matched;
				const is_same_initial_norm =
					Boolean(this.initial_values.account_number) &&
					ArchiveCardFamilyAutocomplete.normalize_account(raw_acc) ===
						ArchiveCardFamilyAutocomplete.normalize_account(
							this.initial_values.account_number
						);
				const user_renamed_own_family =
					is_same_initial_norm &&
					!this.is_base_autofilled &&
					this.fallback_base_card_name !== this.initial_values.base_card_name;

				if (!user_renamed_own_family) {
					this.is_base_autofilled = true;
					await this.set_control_value(
						this.controls.base_card_name,
						matched.base_card_name
					);
				}

				if (matched.bank && this.controls.bank) {
					this.is_bank_autofilled = true;
					this.last_bank_raw = matched.bank;
					await this.set_control_value(this.controls.bank, matched.bank);
				}
			} else {
				this.selected_family = null;
				if (this.is_base_autofilled) {
					this.is_base_autofilled = false;
					await this.set_control_value(
						this.controls.base_card_name,
						this.fallback_base_card_name
					);
				}
				if (this.is_bank_autofilled && this.controls.bank) {
					const restore_bank = this.fallback_bank;
					this.is_bank_autofilled = false;
					this.last_bank_raw = restore_bank;
					await this.set_control_value(this.controls.bank, restore_bank);
				}
			}

			this.notify_triplet_changed({ immediate: false });
		}

		filter_items(fieldname, raw_query, show_all_if_exact = false) {
			if (fieldname === "base_card_name") {
				const q_search = ArchiveCardFamilyAutocomplete.normalize_search_text(raw_query);
				const q_exact = ArchiveCardFamilyAutocomplete.normalize_exact_name(raw_query);
				const init_exact = ArchiveCardFamilyAutocomplete.normalize_exact_name(
					this.initial_values.base_card_name
				);
				const matches_known_exact =
					show_all_if_exact &&
					q_exact &&
					(q_exact === init_exact ||
						this.unique_name_items.some((it) => it.exact_key === q_exact));

				if (!q_search || matches_known_exact) {
					return this.unique_name_items.slice(0, this.limit);
				}

				const prefix = [];
				const sub = [];
				for (const item of this.unique_name_items) {
					if (item.search_key.startsWith(q_search)) {
						prefix.push(item);
					} else if (
						item.search_key.includes(q_search) ||
						(item.bank_search_key && item.bank_search_key.includes(q_search))
					) {
						sub.push(item);
					}
				}
				return [...prefix, ...sub].slice(0, this.limit);
			}

			const q_norm = ArchiveCardFamilyAutocomplete.normalize_account(raw_query);
			const q_raw_lower = ArchiveCardFamilyAutocomplete.normalize_digits(raw_query)
				.trim()
				.toLocaleLowerCase();
			const init_acc_norm = ArchiveCardFamilyAutocomplete.normalize_account(
				this.initial_values.account_number
			);
			const matches_known_acc =
				show_all_if_exact &&
				q_norm &&
				(q_norm === init_acc_norm || this.by_norm_account_list.has(q_norm));

			if (!q_norm || matches_known_acc) {
				return this.unique_account_items.slice(0, this.limit);
			}

			const prefix = [];
			const sub = [];
			for (const item of this.unique_account_items) {
				if (item.norm_acc.startsWith(q_norm) || item.raw_lower.startsWith(q_raw_lower)) {
					prefix.push(item);
				} else if (
					item.norm_acc.includes(q_norm) ||
					item.raw_lower.includes(q_raw_lower)
				) {
					sub.push(item);
				}
			}
			return [...prefix, ...sub].slice(0, this.limit);
		}

		async open_suggestions(state, opts = {}) {
			if (!this.is_enabled()) {
				this.hide_menu(state);
				return;
			}
			const el = state.$input[0];
			if (!el || el.readOnly || el.disabled) {
				this.hide_menu(state);
				return;
			}

			if (!this.loaded) {
				await this.ensure_loaded();
				if (this.is_destroyed || document.activeElement !== el) return;
			}

			const raw_query = String(state.$input.val() || "");
			const items = this.filter_items(
				state.fieldname,
				raw_query,
				Boolean(opts.show_all_if_exact)
			);
			this.render_menu(state, items);
		}

		render_menu(state, items) {
			state.items = items;
			state.active_index = -1;

			if (!items.length || !this.is_enabled() || document.activeElement !== state.$input[0]) {
				this.hide_menu(state);
				return;
			}

			const is_acc = state.fieldname === "account_number";
			state.$menu.html(
				items
					.map(
						(item, idx) => `
						<button
							type="button"
							class="acd-autocomplete-item"
							role="option"
							data-index="${idx}"
						>
							<span class="acd-ac-primary" ${is_acc ? 'dir="ltr"' : 'dir="rtl"'}>${frappe.utils.escape_html(
								item.value
							)}</span>
							${
								item.secondary_text
									? `<span class="acd-ac-secondary" dir="rtl">${frappe.utils.escape_html(
											item.secondary_text
									  )}</span>`
									: ""
							}
						</button>
					`
					)
					.join("")
			);

			this.position_menu(state);
			state.$menu.show();
		}

		position_menu(state) {
			const el = state.$input[0];
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const width = Math.max(rect.width, 220);
			const left = Math.max(8, rect.right - width);

			state.$menu.css({
				position: "fixed",
				top: `${rect.bottom + 4}px`,
				left: `${left}px`,
				width: `${width}px`,
				zIndex: 1080,
			});
		}

		handle_keydown(state, e) {
			if (!this.is_enabled()) return;
			const visible = state.$menu.is(":visible") && state.items.length > 0;

			if (e.key === "ArrowDown") {
				if (!visible) {
					e.preventDefault();
					e.stopPropagation();
					this.open_suggestions(state, {
						show_all_if_exact: !state.edited_since_focus,
					});
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				state.active_index = Math.min(state.active_index + 1, state.items.length - 1);
				this.highlight_active(state);
				return;
			}

			if (!visible) return;

			if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				state.active_index = Math.max(state.active_index - 1, 0);
				this.highlight_active(state);
				return;
			}

			if (e.key === "Enter" && state.active_index >= 0) {
				e.preventDefault();
				e.stopPropagation();
				this.select_item(state, state.active_index);
				return;
			}

			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				this.hide_menu(state);
			}
		}

		highlight_active(state) {
			const $btns = state.$menu.find(".acd-autocomplete-item");
			$btns.removeClass("is-active");
			const $cur = $btns.eq(state.active_index);
			$cur.addClass("is-active");
			$cur[0]?.scrollIntoView({ block: "nearest" });
		}

		async select_item(state, index) {
			const item = state.items[index];
			if (!item || !item.family) return;
			const fam = item.family;

			this.hide_menu(state);
			state.edited_since_focus = false;
			this.selected_family = fam;

			if (state.fieldname === "base_card_name") {
				this.fallback_base_card_name = fam.base_card_name;
				this.is_base_autofilled = false;
				this.is_acc_autofilled = true;
				this.is_bank_autofilled = true;
				this.last_account_raw = fam.account_number;
				this.last_bank_raw = fam.bank || "";

				await this.set_control_value(this.controls.base_card_name, fam.base_card_name);
				await this.set_control_value(this.controls.account_number, fam.account_number);
				if (fam.bank && this.controls.bank) {
					await this.set_control_value(this.controls.bank, fam.bank);
				}
			} else {
				this.fallback_account_number = fam.account_number;
				this.last_account_raw = fam.account_number;
				this.last_bank_raw = fam.bank || "";
				this.is_acc_autofilled = false;
				this.is_base_autofilled = true;
				this.is_bank_autofilled = true;

				await this.set_control_value(this.controls.account_number, fam.account_number);
				await this.set_control_value(this.controls.base_card_name, fam.base_card_name);
				if (fam.bank && this.controls.bank) {
					await this.set_control_value(this.controls.bank, fam.bank);
				}
			}

			this.notify_triplet_changed({ immediate: true, matched_family: fam });
		}

		hide_menu(state) {
			state.items = [];
			state.active_index = -1;
			state.$menu.hide().empty();
		}

		hide_all() {
			for (const state of this.states.values()) {
				this.hide_menu(state);
			}
		}

		destroy() {
			this.is_destroyed = true;
			clearTimeout(this._focus_ready_timer);

			for (const state of this.states.values()) {
				state.$input.off(this.ns);
				state.$menu.off(this.ns).remove();
			}
			this.states.clear();
			this.controls.bank?.$input?.off(this.ns);

			$(document).off(this.ns);
			$(window).off(this.ns);
			this.dialog?.$wrapper?.find(".modal-body").off(this.ns);
		}
	}

	window.ArchiveCardFamilyAutocomplete = ArchiveCardFamilyAutocomplete;
	window.ArchiveCardDailyLimitInput = ArchiveCardDailyLimitInput;
	window.ArchiveCardCreateDialog = ArchiveCardCreateDialog;
	window.upload_staged_card_image = upload_staged_card_image;
})();
