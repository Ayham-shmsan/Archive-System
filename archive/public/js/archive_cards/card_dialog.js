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

			// Account duplicate check on blur / change
			const $accInput = this.controls.account_number?.$input;
			if ($accInput) {
				let timer = null;
				$accInput.on("input blur", () => {
					clearTimeout(timer);
					timer = setTimeout(() => {
						this.check_account_family();
					}, 280);
				});
			}

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

		async check_account_family() {
			const acc = String(this.controls.account_number?.get_value() || "").trim();
			const $body = $(this.dialog.body);
			const $banner = $body.find('[data-role="duplicate-banner"]');
			const $badge = $body.find('[data-role="copy-badge"]');
			const $hint = $body.find('[data-role="derived-name-hint"]');

			if (!acc) {
				this.duplicate_family_info = null;
				$banner.prop("hidden", true).empty();
				$badge.text("نسخة 1").removeClass("is-duplicate");
				$hint.prop("hidden", true).empty();
				this.controls.base_card_name?.$input?.prop("readonly", false);
				return null;
			}

			try {
				const res = await frappe.call({
					method: "archive.api.cards.check_duplicate_account",
					args: { account_number: acc },
				});
				const info = res?.message || null;
				this.duplicate_family_info = info;

				if (info && info.family_exists) {
					$badge
						.text(`نسخة ${info.expected_copy_no}`)
						.addClass("is-duplicate");

					if (info.base_card_name) {
						this.controls.base_card_name.set_value(info.base_card_name);
						this.controls.base_card_name.$input?.prop("readonly", true);
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
					$banner.prop("hidden", true).empty();
					$badge.text("نسخة 1").removeClass("is-duplicate");
					$hint.prop("hidden", true).empty();
					this.controls.base_card_name?.$input?.prop("readonly", false);
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
			const payload = this.collect_payload();
			if (!this.validate_client_payload(payload)) return;

			this.is_submitting = true;
			this.dialog.get_primary_btn().prop("disabled", true);

			try {
				const dup_info = await this.check_account_family();
				if (dup_info && dup_info.family_exists) {
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

	window.ArchiveCardDailyLimitInput = ArchiveCardDailyLimitInput;
	window.ArchiveCardCreateDialog = ArchiveCardCreateDialog;
	window.upload_staged_card_image = upload_staged_card_image;
})();
